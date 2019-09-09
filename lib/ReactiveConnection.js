const EventEmitter = require("./EventEmitter.js")
const debug = require('debug')('reactive-dao')

class Observation {
  constructor(connection, what, pushed) {
    this.what = what
    this.connection = connection
    this.pushed = pushed
    this.observables = []
    this.receivedSignals = []
  }
  addObservable(observable) {
    this.observables.push(observable)
    observable.observation = this
    if(this.observables.length == 1 && this.connection.connected) this.connection.send({
      type: "observe",
      what: this.what,
      pushed: this.pushed
    })
    process.nextTick(() => {
      for(let { signal, args} of this.receivedSignals) {
        if(typeof observable == 'function') observable(signal, ...args)
        else if(observable.notify) observable.notify(signal, ...args)
        else observable[signal](...args)
      }
    })
  }
  observable(generator) {
    let observable = this.observables.find(o => o.generator == generator)
    if(observable) return observable
    observable = new generator(undefined, this.what, this.removeObservable.bind(this))
    this.addObservable(observable)
    const oldDispose = observable.dispose
    const oldRespawn = observable.respawn
    observable.dispose = () => {
      this.removeObservable(observable)
      oldDispose.call(observable)
    }
    observable.respawn = () => {
      const observation = this.connection.observation(this.what)
      observable.dispose = () => {
        observation.removeObservable(observable)
        oldDispose.call(observable)
      }
      observation.addObservable(observable)
      oldRespawn.call(observable)
    }
    return observable
  }
  removeObservable(observable) {
    let id = this.observables.indexOf(observable)
    if(id == -1) throw new Error("could not remove not existing observable")
    this.observables.splice(id, 1)
    if(this.connection.connected && this.observables.length == 0) {
      this.connection.send({
        type: "unobserve",
        what: this.what,
        pushed: this.pushed
      })
      if(!this.pushed) {
        const whatId = JSON.stringify(this.what)
        this.connection.observations.delete(whatId)
      }
    }
  }
  handleDisconnect() {
    this.pushed = false
  }
  handleConnect() {
    this.receivedSignals = []
    if(this.connection.settings.logLevel > 0) debug("refresh", this.what)
    if(this.observables.length > 0) this.connection.send({
      type: "observe",
      what: this.what
    })
  }
  handleNotifyMessage({ signal, args }) {
    this.receivedSignals.push({ signal, args })
    for(let observable of this.observables) {
      process.nextTick(function(){
        if(typeof observable == 'function') observable(signal, ...args)
          else if(observable.notify) observable.notify(signal, ...args)
            else observable[signal](...args)
      })
    }
  }
}

class Connection extends EventEmitter {

  constructor(sessionId, settings) {
    super()
    if(!sessionId) throw new Error("SessionId undefined!")
    this.sessionId = sessionId
    this.settings = settings || {}

    this.connectedCounter = 0
    this.connected = false
    this.lastRequestId = 0
    this.requestsQueue = []
    this.waitingRequests = new Map()

    this.observations = new Map()
    this.messageHandlers = {}

    this.autoReconnect = true

    this.finished = false

    this.connectionMonitor = this.settings.connectionMonitorFactory ? this.settings.connectionMonitorFactory(this) : null
    if(this.settings.timeSynchronization) this.settings.timeSynchronization.setConnection(this)

    /// Backward compatibility TODO: remove in future
    this.on('disconnect', () => this.settings.onDisconnect && this.settings.onDisconnect() )
    this.on('connect', () => this.settings.onConnect && this.settings.onConnect() )
  }

  sendRequest(msg) {
    return new Promise((resolve, reject) => {
      msg.requestId = (++this.lastRequestId)
      let handler = (err, resp) => {
        if (err) {
          this.waitingRequests.delete(msg.requestId)
          return reject(err)
        }
        if (resp.type == 'error') {
          reject(resp.error)
          return false
        }
        resolve(resp.response)
        return false
      }
      let request = {handler, msg}
      if (!this.connected) {
        if (this.settings.queueRequestsWhenDisconnected) {
          let queuedConnectionId = this.connectedCounter
          let queueId = this.requestsQueue.length
          this.requestsQueue.push(request)
          setTimeout(() => {
            if(queuedConnectionId == this.connectedCounter) {
              this.requestsQueue[queueId] = null
              reject('disconnected')
            }
          }, this.settings.requestSendTimeout || 2300)
          return
        } else {
          return reject('disconnected')
        }
      }

      this.waitingRequests.set(msg.requestId, {msg, handler})

      if (this.settings.requestTimeout) {
        setTimeout(() => {
          let waiting = this.waitingRequests.get(msg.requestId)
          if (waiting) {
            waiting.handler('timeout')
            this.waitingRequests.delete(msg.requestId)
          }
          for(let i = 0; i < this.requestsQueue.length; i++) {
            let req = this.requestsQueue[i]
            if(!req) continue;
            if(req.msg.requestId == msg.requestId) this.requestsQueue[i] = null
          }
        }, this.settings.requestTimeout)
      }

      this.send(msg)
    })
  }

  request(method, ...args) {
    const msg={
      type: 'request',
      method: method,
      args: args
    }
    return this.sendRequest(msg)
  }

  get(what) {
    const msg={
      type: 'get',
      what: what
    }
    return this.sendRequest(msg)
  }
  getMore(what, more) {
    const msg={
      type: 'getMore',
      what: what,
      more: more
    }
    return this.sendRequest(msg)
  }
  getAll(paths) {
    const msg={
      type: 'getMore',
      paths
    }
    return this.sendRequest(msg)
  }

  event(method, ...args) {
    this.send({
      type: 'event',
      method: method,
      args: args
    })
  }

  handleMessage(message) {
    if(message.type == "pong") {
      this.emit('pong', message)
    }
    if(message.type == "ping") {
      this.emit('ping', message)
      message.type = "pong"
      this.send(message)
    }
    if(message.type == "timeSync") {
      this.emit('timeSync', message)
    }
    if(message.type == "authenticationError") {
      this.finished = true
      this.closeConnection()
      this.emit('authenticationError', message.error)
    }
    if(message.responseId) {
      const request = this.waitingRequests.get(message.responseId)
      if(!request) return
      this.waitingRequests.delete(message.responseId)
      request.handler(null, message)
      return
    }
    if(message.type == "notify") {
      const whatId = JSON.stringify(message.what)
      const observation = this.observations.get(whatId)
      if(observation) observation.handleNotifyMessage(message)
    }
    if(message.type == "push") {
      const whatId = JSON.stringify(message.what)
      const observation = this.observations.get(whatId)
      if(observation) {
        observation.pushed = true
      } else {
        const observation = new Observation(this, message.what, true)
        this.observations.set(whatId, observation)
      }
    }
    if(message.type == "unpush") {
      const whatId = JSON.stringify(message.what)
      const observation = this.observations.get(whatId)
      if(!observation || !observation.pushed) throw Error("observation that is not pushed can not be unpushed")
      observation.pushed = false
      if(observation.observables.length == 0) this.observations.delete(whatId)
    }
    const handler = this.messageHandlers[message.type]
    if(handler) handler(message)
  }

  handleDisconnect() {
    if(this.settings.logLevel > 0) debug( "disconnected")
    this.connected = false
    this.emit('disconnect')
    let queued = []
    for(let req of this.waitingRequests.values()) {
      if(this.settings.queueActiveRequestsOnDisconnect) {
        queued.push(this.requestsQueue.length)
        this.requestsQueue.push(req)
      } else {
        req.handler('disconnected')
      }
    }
    let queuedConnectionId = this.connectedCounter
    if(this.settings.queueActiveRequestsOnDisconnect) {
      setTimeout(() => {
        if(queuedConnectionId == this.connectedCounter) {
          for(let i = 0; i < queued.length; i++) {
            if(!this.requestsQueue[queued[i]]) continue
            this.requestsQueue[queued[i]].handler('disconnected')
            this.requestsQueue[queued[i]] = null
          }
        }
      }, this.settings.requestSendTimeout || 2300)
    }
    for(let observation of this.observations.values()) {
      observation.handleDisconnect()
    }

    this.waitingRequests = new Map()
    if(this.finished) return
    if(this.autoReconnect) {
      setTimeout((function(){
        this.emit('reconnect')
        this.initialize()
      }).bind(this), this.settings.autoReconnectDelay || 200)
    }
  }


  observation(what) {
    const whatId = JSON.stringify(what)
    let observation = this.observations.get(whatId)
    if(observation) return observation
    observation = new Observation(this, what, false)
    this.observations.set(whatId, observation)
    return observation
  }

  observable(what, observableGenerator) {
    return this.observation(what).observable(observableGenerator)
  }

  handleConnect() {
    this.connectedCounter++
    if(this.settings.logLevel > 0) debug("connected")
    this.connected = true
    this.send({
      type: 'initializeSession',
      sessionId: this.sessionId
    })
    /// REFRESH OBSERVABLES!
    for(let observation of this.observations.values()) {
      observation.handleConnect()
    }
    for(let request of this.requestsQueue) {
      if(!request) continue
      this.waitingRequests.set(request.msg.requestId, request)
      this.send(request.msg)
    }
    this.requestsQueue = []
    this.emit('connect')
  }

  sendPing(data = {}) {
    this.send({
      ...data,
      type: "ping"
    })
  }

  sendTimeSync(timestamp) {
    this.send({
      clientTimestamp: timestamp,
      type: "timeSync"
    })
  }

}

module.exports = Connection
