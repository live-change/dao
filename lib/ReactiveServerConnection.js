const EventEmitter = require('./EventEmitter.js')
const utils = require('./utils.js')
const debug = require("debug")("reactive-dao")

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
    try {
      const serialized = JSON.stringify(message)
      this.connection.write(serialized)
    } catch (error) {
      console.error("MESSAGE SERIALIZATION ERROR", error, "\nMessage: ", message)
    }
  }

  handleServerError(message, error) {
    if(this.settings.logErrors) {
      debug('MESSAGE', message)
      debug('ERROR', error)
    }
    this.emit('serverError', error, message)
  }

  handleClientError(message, error) {
    if(this.settings.logErrors) {
      debug('MESSAGE', message)
      debug('ERROR', error)
    }
    this.emit('clientError', error, message)
    this.connection.close()
  }

  handleRequest(message) {
    var path = message.method
    try {
      this.dao.request(path, ...message.args).then(
        result => this.send({
          type: "response",
          responseId: message.requestId,
          response: result
        }),
        error => {
          this.handleServerError(message, error)
          this.send({
            type: "error",
            responseId: message.requestId,
            error: utils.errorToJSON(error)
          })
        }
      );
    } catch (error) {
      this.handleServerError(message, error)
      this.send({
        type: "error",
        responseId: message.requestId,
        error: utils.errorToJSON(error)
      })
    }
  }

  handleObserve(message) {
    const path = message.what
    const spath = JSON.stringify(path)
    let observer = this.observers.get(spath)
    if(observer) {
      this.handleClientError(message, "Second observation of the same observable")
      return;
    }
    try {
      const observable = this.dao.observable(path)
      observer = (signal, ...args) => {
        this.send({
          type: "notify",
          what: message.what,
          signal: signal,
          args: args
        })
        return true
      }
      observable.observe(observer)
      this.observables.set(spath, observable)
      this.observers.set(spath, observer)
    } catch (error) {
      debug("Observe error", error)
      this.send({
        type: "notify",
        what: message.what,
        signal: "error",
        args: [utils.errorToJSON(error)]
      })
    }
  }

  handleUnobserve(message) {
    const path = message.what
    const spath = JSON.stringify(path)
    const observer = this.observers.get(spath)
    const observable = this.observables.get(spath)
    if(observable) observable.unobserve(observer)
    this.observables.delete(spath)
    this.observers.delete(spath)
    if(!observer || !observable) {
      debug("OBSERVER", !!observer)
      debug("OBSERVABLE", !!observable)
      this.handleClientError(message, "Unobserve not observed item")
    }
  }

  handleGet(message) {
    var path = message.what
    try {
      this.dao.get(path).then(
          result => this.send({
            type: "response",
            responseId: message.requestId,
            response: result
          }),
          error => this.send({
            type: "error",
            responseId: message.requestId,
            error: utils.errorToJSON(error)
          })
      )
    } catch (error) {
      this.handleServerError(message, error)
      this.send({
        type: "error",
        responseId: message.requestId,
        error: utils.errorToJSON(error)
      })
    }
  }

  handleAuthorizedMessage(message) {
    try {
      switch (message.type) {
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
          message.serverTimestamp = now
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
    } catch(error) {
      this.handleProtocolError(error, message)
    }
  }

  handleProtocolError(error, message) {
    console.error("PROTOCOL ERROR", error)
    this.send({
      type: "malformedMessageError",
      error: utils.errorToJSON(error),
      message
    })
    this.closeConnection()
  }

  handleDaoFactoryError(error) {
    debug("DAO Factory error", error)
    console.error(error)
    this.send({
      type: "authenticationError",
      error: utils.errorToJSON(error)
    })
    this.closeConnection()
  }

  handleMessage(message) {
    if (!this.dao && !this.daoPromise) {
      if ((!message) || message.type != 'initializeSession') {
        this.handleClientError(message, "Got packet of type '" + message.type + "' expected type 'initializeSession'")
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
        this.daoPromise.catch(error => this.handleDaoFactoryError(error)).then(dd => {
          this.dao = dd
          this.daoPromise = null
          for(var message of this.daoGenerationQueue) this.handleAuthorizedMessage(message)
        })
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
