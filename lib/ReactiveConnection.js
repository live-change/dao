const EventEmitter = require("./EventEmitter.js")

class Connection extends EventEmitter {

  constructor(sessionId, settings) {
    super()
    if(!sessionId) throw new Error("SessionId undefined!")
    this.sessionId = sessionId
    this.settings = settings || {}

    this.connected = false
    this.lastRequestId = 0
    this.queue = []
    this.waitingRequests = new Map()

    this.observables = new Map()
    this.messageHandlers = {}

    this.autoReconnect = true

    this.finished = false

    this.connectionMonitor = settings.connectionMonitorFactory ? settings.connectionMonitorFactory(this) : null

    /// Backward compatibility TODO: remove in future
    this.on('disconnect', () => this.settings.onDisconnect && this.settings.onDisconnect() )
    this.on('connect', () => this.settings.onConnect && this.settings.onConnect() )
  }

  sendRequest(msg) {
    if(!this.connected) {
      return new Promise((resolve,reject) => {
        var item = () => {
          this.sendRequest(msg).then(resolve, reject)
        }
        var queueId = this.queue.length
        this.queue.push(item)
        setTimeout(() => {
          if (this.queue[queueId] == item) {
            this.queue[queueId] = () => {
            }
            reject('disconnected')
          }
        }, this.settings.requestTimeout || 2300)
      })
    }
    msg.requestId = (++this.lastRequestId)

    var promise = new Promise((resolve,reject) => {
      this.waitingRequests.set(msg.requestId, (err,resp) => {
        if(err) {
          this.waitingRequests.delete(msg.requestId)
          return reject(err)
        }
        if(resp.type=='error') {
          reject(resp.error)
          return false
        }
        resolve(resp.response)
        return false
      })
    })

    this.send(msg)
    return promise
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
    if(message.type == "authenticationError") {
      this.finished = true
      this.closeConnection()
      this.emit('authenticationError', message.error)
    }
    if(message.responseId) {
      var handler = this.waitingRequests.get(message.responseId)
      if(handler(null, message) != 'more') this.waitingRequests.delete(message.responseId)
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
    for(var req of this.waitingRequests.values()) {
      req('disconnected')
    }
    this.waitingRequests = new Map()
    if(this.finished) return
    if(this.autoReconnect) {
      setTimeout((function(){
        this.initialize()
      }).bind(this), this.settings.autoReconnectDelay || 2323)
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
        let existingOneObserver = (signal, ...params) => observable.notify(signal, ...params)
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
    for(var item of this.queue) {
      item()
    }
    this.emit('connect')
  }

  sendPing(data = {}) {
    this.send({
      ...data,
      type: "ping"
    })
  }

}


module.exports = Connection
