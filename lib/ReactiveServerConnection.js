const EventEmitter = require('./EventEmitter.js')
const utils = require('./utils.js')
const collectPointers = require('./collectPointers.js')
const debug = require("debug")("reactive-dao")

class Observation {
  constructor(connection, what, observable, observed) {
    this.connection = connection
    this.what = what
    this.pushCount = 0
    this.observed = observed
    this.observable = observable

    this.observer = (signal, ...args) => {
      this.connection.send({
        type: "notify",
        what, signal, args
      })
      return true
    }

    this.observable.observe(this.observer)
  }
  unobserve() {
    this.observed = false
    if(!this.pushed) this.dispose()
  }
  unpush() {
    this.pushCount--
    if(this.pushCount == 0) {
      this.connection.send({
        type: "unpush",
        what: this.what
      })

      if(!this.observed) this.dispose()
    }
  }
  push() {
    this.pushCount++
    if(this.pushCount == 1) {
      this.connection.send({
        type: "push",
        what: this.what
      })
    }
  }
  dispose(noDelete) {
    if(this.disposed) throw new Error("DOUBLE DISPOSE " +JSON.stringify(this.what))
    this.disposed = true

    this.observable.unobserve(this.observer)
    if(!noDelete) this.connection.observations.delete(JSON.stringify(this.what))
  }
}

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

    this.observations = new Map()

    this.context = null
    this.connectionMonitor = this.settings.connectionMonitorFactory ? settings.connectionMonitorFactory(this) : null

    connection.on('data', data => {
      const message = JSON.parse(data)
      this.handleMessage(message)
      this.connected = false
    })

    connection.on('close', () => {
      for(let observation of this.observations.values()) {
        observation.dispose(true)
      }
      this.observations = new Map()
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
    const path = message.method
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
    let observation = this.observations.get(spath)
    if(observation) {
      if(observation.observed) {
        this.handleClientError(message, "Second observation of the same observable")
        return
      } else {
        observation.observed = true
      }
    } else {
      try {
        let observable
        if(typeof path == 'object' && !Array.isArray(path) && path.paths) {
          let paths = message.what.paths
          observable = new PushObservable(this, paths)
        } else {
          observable = this.dao.observable(path)
        }
        observation = new Observation(this, path, observable, true)
        this.observations.set(spath, observation)
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
  }

  handleUnobserve(message) {
    const path = message.what
    const spath = JSON.stringify(path)
    const observation = this.observations.get(spath)
    observation.unobserve()
  }


  handleGet(message) {
    const path = message.what
    if(typeof path == 'object' && !Array.isArray(path) && path.paths) {
      let paths = path.paths
      return this.handleGetMore(message.requestId, paths)
    }
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

  handleGetMore(requestId, paths) {
    let fetchMap = new Map()
    let resultsSet = new Set()
    let results = []
    const dao = this.dao
    function fetch(what, more) {
      const key = JSON.stringify(what)
      let dataPromise = fetchMap.get(key)
      if(!dataPromise) {
        dataPromise = dao.get(what)
        fetchMap.set(key, dataPromise)
      }
      return dataPromise.then(result => {
        if(!resultsSet.has(key)) {
          results.push({
            what,
            data: result
          })
          resultsSet.add(key)
        }
        if(more) {
          let morePromises = []
          for(let dep of more) {
            const pointers = collectPointers(result, dep.schema)
            morePromises = morePromises.concat(
                pointers.map(pointer => fetch(pointer, dep.more))
            )
          }
          return Promise.all(morePromises)
        } else return Promise.resolve()
      })
    }
    Promise.all(paths.map(({what, more}) => fetch(what, more))).then(() => { /// Flatten results
      this.send({
        type: "response",
        responseId: requestId,
        response: results
      })
    }).catch(error => this.send({
      type: "error",
      responseId: requestId,
      error: utils.errorToJSON(error)
    }))
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
          const now = Date.now()
          message.serverTimestamp = now
          this.send(message)
          break;
        case 'event':
          const path = message.method
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
        case 'getMore':
          this.handleGetMore(message)
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
