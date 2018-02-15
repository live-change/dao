const EventEmitter = require('./EventEmitter.js')

class ReactiveServerConnection extends EventEmitter {

  constructor(server, id, connection, daoFactory, settings) {
    super()
    this.server = server
    this.id = id
    this.connection = connection
    this.connected = true
    this.settings = settings || {}
    this.daoFactory = daoFactory
    this.dao = null
    this.daoPromise = null
    this.daoGenerationQueue = []
    this.observers = new Map()
    this.observables = new Map()
    this.context = null
    this.connectionMonitor = this.settings.connectionMonitorFactory ? settings.connectionMonitorFactory(this) : null

    connection.on('data', data => {
      var message = JSON.parse(data)
      this.handleMessage(message)
      this.connected = false
    })

    connection.on('close', () => {
      for(let [key, observable] of this.observables.entries()) {
        let observer = this.observers.get(key)
        observable.unobserve(observer)
        this.observables.delete(key)
        this.observers.delete(key)
      }
      if(this.dao) this.dao.dispose()
      this.server.handleConnectionClose(this)
    })
  }

  send(message) {
    this.connection.write(JSON.stringify(message))
  }

  handleRequest(message) {
    var path = message.method
    try {
      this.dao.request(path, ...message.args).then(
        result => this.connection.write(JSON.stringify({
          type: "response",
          responseId: message.requestId,
          response: result
        })),
        error => {
          console.error('ERROR ON REQUEST',  message)
          console.error(error)
          this.connection.write(JSON.stringify({
            type: "error",
            responseId: message.requestId,
            error: error ? error.message || error : error
          }))
        }
      );
    } catch (error) {
      console.error('ERROR ON REQUEST',  message)
      console.error(error)
      this.connection.write(JSON.stringify({
        type: "error",
        responseId: message.requestId,
        error: error ? error.message || error : error
      }))
    }
  }

  handleObserve(message) {
    var path = message.what
    var spath = JSON.stringify(path)
    var observer = this.observers.get(spath)
    if(observer) {
      console.error("reobserve existing path from client")
      return;
    }
    var observable = this.dao.observable(path)
    var observer = (signal, ...args) => {
      if(signal == 'error' && JSON.stringify(args) == '[null]') {
        console.trace("nullerror")
      }
      this.connection.write(JSON.stringify({
        type: "notify",
        what: message.what,
        signal: signal,
        args: args
      }))
    }
    observable.observe(observer)
    this.observables.set(spath, observable)
    this.observers.set(spath, observer)
  }

  handleUnobserve(message) {
    var path = message.what
    var spath = JSON.stringify(path)
    var observer = this.observers.get(spath)
    if(!observer) return;
    var observable = this.observables.get(spath)
    if(!observable) return;
    observable.unobserve(observer)
    this.observables.delete(spath)
    this.observers.delete(spath)
  }

  handleGet(message) {
    var path = message.what
    this.dao.get(path).then(
      result => this.connection.write(JSON.stringify({
        type:"response",
        responseId: message.requestId,
        response: result
      })),
      error => this.connection.write(JSON.stringify({
        type:"error",
        responseId: message.requestId,
        error: error
      }))
    )
  }

  handleAuthorizedMessage(message) {
    switch(message.type) {
      case 'request':
        this.handleRequest(message)
        break;
      case 'ping':
        this.emit('ping', message)
        message.type = 'pong'
        this.send(message)
        break;
      case 'pong':
        this.emit('pong', message)
        break;
      case 'timeSync':
        let now = Date.now()
        message.server_send_ts = now
        message.server_recv_ts = now
        this.send(message)
        break;
      case 'event':
        var path = message.method
        this.dao.request(path, ...message.args)
        break;
      case 'observe' :
        this.handleObserve(message)
        break;
      case 'unobserve' :
        this.handleUnobserve(message)
        break;
      case 'get' :
        this.handleGet(message)
        return;
    }
  }

  handleDaoFactoryError(error) {
    this.send({
      type: "authenticationError",
      error
    })
    this.closeConnection()
  }

  handleMessage(message) {
    if (!this.dao && !this.daoPromise) {
      if (message.type != 'initializeSession') {
        console.error("Unknown first packet type " + message.type)
        this.connection.close()
        return;
      }
      try {
        this.daoPromise = this.daoFactory(message.sessionId, this.connection, this)
      } catch(error) {
        return this.handleDaoFactoryError(error)
      }
      if(!this.daoPromise.then) {
        this.dao = this.daoPromise
        this.daoPromise = null
      } else {
        this.daoPromise.then(dd => {
          this.dao = dd
          this.daoPromise = null
          for(var message of this.daoGenerationQueue) this.handleAuthorizedMessage(message)
        }).catch(error => this.handleDaoFactoryError(error))
      }
    } else if(this.daoPromise && !this.dao) {
      this.daoGenerationQueue.push(message)
    } else {
      this.handleAuthorizedMessage(message)
    }
  }

  closeConnection() {
    this.connection.close()
  }

  sendPing(data = {}) {
    this.send({
      ...data,
      type: "ping"
    })
  }

}

module.exports = ReactiveServerConnection
