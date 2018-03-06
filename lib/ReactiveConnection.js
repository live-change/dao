const EventEmitter = require("./EventEmitter.js")

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

    this.observables = new Map()
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
          this.requestsQueue = this.requestsQueue.filter(req => req.msg.requestId != msg.requestId)
        }, this.settings.requestTimeout)
      }

      this.send(msg)
    })
  }

  request(method, ...args) {
    var msg={
      type: 'request',
      method: method,
      args: args
    }
    return this.sendRequest(msg)
  }

  get(what) {
    var msg={
      type: 'get',
      what: what
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
      var request = this.waitingRequests.get(message.responseId)
      if(!request) return
      this.waitingRequests.delete(message.responseId)
      request.handler(null, message)
      return
    }
    if(message.type == "notify") {
      this.updateObservable(message.what, message.signal, message.args)
      return
    }
    var handler=this.messageHandlers[message.type]
    if(handler) handler(message)
  }

  updateObservable(what, signal, params) {
    params = params || []
    if(!params.length) params = [params] /// only one parameter
    var at = JSON.stringify(what)
    var observable = this.observables.get(at)
    if(observable) {
      process.nextTick(function(){
        if(typeof observable == 'function') observable(signal, ...args)
        if(observable.notify) {
          return observable.notify(signal, ...params)
        }
        observable[signal](...params)
      })
    }
  }

  handleDisconnect() {
    if(this.settings.logLevel > 0) console.info("[reactive-dao]", "disconnected")
    this.connected = false
    this.emit('disconnect')
    let queued = []
    for(var req of this.waitingRequests.values()) {
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

    this.waitingRequests = new Map()
    if(this.finished) return
    if(this.autoReconnect) {
      setTimeout((function(){
        this.initialize()
      }).bind(this), this.settings.autoReconnectDelay || 200)
    }
  }

  observable(what, observableGenerator) {
    //console.info("observe ",what)
    var whatId = JSON.stringify(what)
    var observable = this.observables.get(whatId)
    if(observable) return observable;
    
    observable = new observableGenerator(undefined, what, this.removeObservable.bind(this))
    this.observables.set(whatId, observable)
    if(this.connected) this.send({
      type: "observe",
      what: what,
    })
    observable.oldDispose = observable.dispose
    observable.dispose = () => {
      this.removeObservable(what)
      observable.oldDispose()
    }
    observable.oldRespawn = observable.respawn
    observable.respawn = () => {
      let existingOne = this.observables.get(whatId)
      if(existingOne) {
        existingOne.observe(existingOne)
        observable.dispose = () => {
          existingOne.unobserve(observable)
          observable.oldDispose()
        }
      } else {
        this.observables.set(whatId, observable)
        if(this.connected) this.send({
          type: "observe",
          what: what,
        })
      }
      observable.oldRespawn()
    }

    return observable
  }

  removeObservable(what) {
    var whatId = JSON.stringify(what)
    var observable = this.observables.get(whatId)
    if(!observable) throw new Error("Removing non existing observable")
    this.observables.delete(whatId)
    if(this.connected) this.send({
      type: "unobserve",
      what: what
    })
  }

  handleConnect() {
    this.connectedCounter++
    if(this.settings.logLevel > 0) console.info("[reactive-dao]", "connected")
    this.connected = true
    this.send({
      type: 'initializeSession',
      sessionId: this.sessionId
    })
    /// REFRESH OBSERVABLES!
    for(var whatId of this.observables.keys()) {
      var what = JSON.parse(whatId)
      if(this.settings.logLevel > 0) console.info("[reactive-dao]", "refresh", what)
      this.send({
        type: "observe",
        what: what
      })
    }
    for(var request of this.requestsQueue) {
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
