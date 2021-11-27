const EventEmitter = require("./EventEmitter.js")
const debug = require('debug')('dao')
const utils = require('./utils')

let lastUid = 0

class Observation {
  constructor(connection, what, pushed) {
    this.what = what
    this.uid = ++lastUid
    this.connection = connection
    this.pushed = pushed
    this.observables = []
    this.receivedSignals = []
    this.disposed = false
  }
  addObservable(observable) {
    if(this.disposed) throw new Error("observation use after disposal")
    this.observables.push(observable)
    observable.observation = this
    if(this.observables.length == 1 && this.connection.connected) {
      this.connection.sendObserve(this)
    }
    //process.nextTick(() => { // next tick will replay events through all layer to the client - it's waste of resources
      for(let { signal, args} of this.receivedSignals) {
        if(typeof observable == 'function') observable(signal, ...args)
        else if(observable.notify) observable.notify(signal, ...args)
        else observable[signal](...args)
      }
    //})
  }
  observable(clazz) {
    if(this.disposed) throw new Error("observation use after disposal")
    let observable = this.observables.find(o => o.clazz == clazz)
    if(observable) return observable

    const what = this.what
    const connection = this.connection
    const dispose = () => {
      observable.observation.removeObservable(observable)
      oldDispose.call(observable)
    }
    const respawn = () => {
      observable.observation = connection.observation(what)
      observable.observation.addObservable(observable)
      oldRespawn.call(observable)
    }

    observable = new clazz(undefined, what, dispose)
    observable.clazz = clazz
    const oldDispose = observable.dispose
    const oldRespawn = observable.respawn
    observable.dispose = dispose
    observable.respawn = respawn

    observable.observation = this
    this.addObservable(observable)
    return observable
  }
  removeObservable(observable) {
    if(this.disposed) throw new Error(`observation ${JSON.stringify(this.what)} use after disposal`)
    let id = this.observables.indexOf(observable)
    if(id == -1) throw new Error("could not remove not existing observable")
    this.observables.splice(id, 1)
    if(this.connection.connected && this.observables.length == 0) {
      this.connection.sendUnobserve(this)
    }
    if(this.observables.length == 0 && !this.pushed) {
      const whatId = JSON.stringify(this.what)
      this.connection.observations.delete(whatId)
      this.disposed = true
      //console.error(`observation ${JSON.stringify(this.what)} was disposed`)
    }
  }
  handleDisconnect() {
    if(this.disposed) throw new Error(`observation ${JSON.stringify(this.what)} use after disposal`)
    this.pushed = false
    if(this.observables.length == 0) {
      const whatId = JSON.stringify(this.what)
      this.connection.observations.delete(whatId)
      this.disposed = true
      //console.error(`observation ${JSON.stringify(this.what)} was disposed`)
    }
  }
  handleConnect() {
    if(this.disposed) throw new Error(`observation ${JSON.stringify(this.what)} use after disposal`)
    this.receivedSignals = []
    if(this.connection.settings.logLevel > 0) debug("refresh", this.what)
    if(this.observables.length > 0) {
      this.connection.sendObserve(this)
    }
  }
  handleNotifyMessage({ signal, args }) {
    if(this.disposed) return
    this.receivedSignals.push({ signal, args })
    for(let observable of this.observables) {
      utils.nextTick(function(){
        if(typeof observable == 'function') observable(signal, ...args)
          else if(observable.notify) observable.notify(signal, ...args)
            else observable[signal](...args)
      })
    }
  }
}

class Connection extends EventEmitter {

  constructor(credentials, settings) {
    super()
    this.settings = settings || {}
    if(!this.settings.fastAuth && !credentials) throw new Error("credentials not defined!")
    this.credentials = credentials

    this.connectedCounter = 0
    this.connected = false
    this.lastRequestId = 0
    this.requestsQueue = []
    this.waitingRequests = new Map()

    this.observations = new Map()
    this.messageHandlers = {}

    this.remoteObserveSent = new Map()
    this.remoteUnobserveSent = new Map()

    this.activeTimeouts = new Set()

    this.autoReconnect = true

    this.finished = false

    this.connectionMonitor = this.settings.connectionMonitorFactory ? this.settings.connectionMonitorFactory(this) : null
    if(this.settings.timeSynchronization) this.settings.timeSynchronization.setConnection(this)

    /// Backward compatibility TODO: remove in future
    this.on('disconnect', () => this.settings.onDisconnect && this.settings.onDisconnect() )
    this.on('connect', () => this.settings.onConnect && this.settings.onConnect() )
  }

  sendRequest(msg, settings) {
    settings = { ...this.settings, ...settings }
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
      const request = { msg, handler, settings }
      if (!this.connected) {
        if(settings.disconnectDebug)
          console.error("SEND REQUEST", msg, "WHEN NOT CONNECTED WITH SETTINGS", request.settings)
        if (settings.queueRequestsWhenDisconnected) {
          let queuedConnectionId = this.connectedCounter
          let queueId = this.requestsQueue.length
          this.requestsQueue.push(request)
          if(settings.requestSendTimeout && settings.requestSendTimeout < Infinity) {
            setTimeout(() => {
              if(queuedConnectionId == this.connectedCounter) {
                this.requestsQueue[queueId] = null
                reject('disconnected')
              }
            }, settings.requestSendTimeout || 2300)
          }
        } else {
          return reject('disconnected')
        }
      }

      if (settings.requestTimeout && settings.requestTimeout < Infinity) {
        const timeout = setTimeout(() => {
          this.activeTimeouts.delete(timeout)
          let waiting = this.waitingRequests.get(msg.requestId)
          if (waiting) {
            waiting.handler('timeout')
            this.waitingRequests.delete(msg.requestId)
          }
          for(let i = 0; i < this.requestsQueue.length; i++) {
            let req = this.requestsQueue[i]
            if(!req) continue
            if(req.msg.requestId == msg.requestId) {
              const req = this.requestsQueue[i]
              this.requestsQueue[i] = null
              req.handler('timeout')
            }
          }
        }, settings.requestTimeout)
        this.activeTimeouts.add(timeout)
      }

      if(this.connected) {
        this.waitingRequests.set(msg.requestId, request)
        this.send(msg)
      }
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

  requestWithSettings(settings, method, ...args) {
    const msg={
      type: 'request',
      method: method,
      args: args
    }
    return this.sendRequest(msg, settings)
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
      if(observation.observables.length == 0) {
        this.observations.delete(whatId)
        this.observations.disposed = true
      }
    }
    const handler = this.messageHandlers[message.type]
    if(handler) handler(message)
  }

  handleDisconnect() {
    if(this.settings.logLevel > 0) debug( "disconnected")
    this.connected = false
    const queuedConnectionId = this.connectedCounter
    this.emit('disconnect')
    for(const req of this.waitingRequests.values()) {
      if(req.settings.disconnectDebug)
        console.error("SENT REQUEST", req.msg, "BEFORE DISCONNECTED WITH SETTINGS", req.settings)
      if(req.settings.queueActiveRequestsOnDisconnect) {
        const queuedId = this.requestsQueue.length
        this.requestsQueue.push(req)
        if(req.settings.requestSendTimeout < Infinity) {
          setTimeout(() => {
            if(queuedConnectionId == this.connectedCounter && this.requestsQueue[queuedId]) {
              req.handler('disconnected')
              this.requestsQueue[queuedId] = null
            }
          }, req.settings.requestSendTimeout || 2300)
        }
      } else {
        req.handler('disconnected')
      }
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
    what = JSON.parse(whatId)
    let observation = this.observations.get(whatId)
    if(observation) return observation
    observation = new Observation(this, what, false)
    this.observations.set(whatId, observation)
    return observation
  }

  observable(what, observableClazz) {
    return this.observation(what).observable(observableClazz)
  }

  handleConnect() {
    this.remoteObserveSent = new Map()
    this.remoteUnobserveSent = new Map()

    this.connectedCounter++
    if(this.settings.logLevel > 0) debug("connected")
    this.connected = true
    if(!this.settings.fastAuth) {
      this.send({
        ...this.credentials
      })
    }
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

  sendObserve(observation) {
    if(this.settings.unobserveDebug) {
      const observationKey = JSON.stringify(observation.what)
      let remoteObserves = this.remoteObserveSent.get(observationKey)
      if(remoteObserves) {
        console.error("Observe duplication! existing observations",
            remoteObserves.map(({ what, uid, disposed, observablbes }) =>
                ({ what, uid, disposed, observables: observablbes.length })),
            'new observation',
            { what: observation.what, uid: observation.uid })
        console.trace("OBSERVE DUPLICATION")
        throw new Error("OBSERVE DUPLICATION")
      } else {
        remoteObserves = []
        this.remoteObserveSent.set(observationKey, remoteObserves)
      }
      remoteObserves.push(observation)
      this.remoteUnobserveSent.delete(observationKey)
    }

    this.send({
      type: "observe",
      what: observation.what,
      pushed: observation.pushed
    })
  }

  sendUnobserve(observation) {
    if(this.settings.unobserveDebug) {
      const observationKey = JSON.stringify(observation.what)
      let remoteUnobserves = this.remoteUnobserveSent.get(observationKey)
      if(remoteUnobserves) {
        console.error("unobserve duplication! removed observations",
            { what: remoteUnobserves.what, uid: remoteUnobserves.uid },
            'next observation',
            { what: observation.what, uid: observation.uid })
        console.trace("UNOBSERVE DUPLICATION")
        throw new Error("UNOBSERVE DUPLICATION")
      } else {
        remoteUnobserves = []
        this.remoteUnobserveSent.set(observationKey, remoteUnobserves)
      }
      remoteUnobserves.push(observation)
      this.remoteObserveSent.delete(observationKey)
    }

    this.send({
      type: "unobserve",
      what: observation.what,
      pushed: observation.pushed
    })
  }

  sendTimeSync(timestamp) {
    this.send({
      clientTimestamp: timestamp,
      type: "timeSync"
    })
  }

  dispose() {
    console.log("DISPOSE REACTIVE CONNECTION")
    this.finished = true
    for(const timeout of this.activeTimeouts) clearTimeout(timeout)
  }

}

module.exports = Connection
