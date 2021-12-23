const EventEmitter = require('./EventEmitter.js')
const ObservableList = require("./ObservableList.js")
const utils = require('./utils.js')
const collectPointers = require('./collectPointers.js')
const debug = require("debug")("reactive-dao")

class PushObservableTrigger {
  constructor(po, what, more) {
    this.po = po
    this.what = what
    this.more = more
    this.observation = this.po.pushObservation(this.what)

    this.pointers = new Map()
    this.triggers = new Map()

    if(this.more && this.more.length > 0) {
      this.localList = new ObservableList()
      this.pointerMethods = {
        set: (value) => this.setPointers(this.findPointers(value)),
        push: (value) => this.addPointers(this.findPointers(value)),
        unshift: (value) => this.addPointers(this.findPointers(value)),
        shift: () => this.removePointers(this.findPointers(this.localList.list[0])),
        pop: () => this.removePointers(this.findPointers(this.localList.list[this.localList.list.length - 1])),
        splice: (at, count, ...add) => this.replacePointers(
            this.findPointers(this.localList.list.slice(at, at + count)),
            this.findPointers(add)
        ),
        remove: (value) => this.removePointers(this.findPointers(this.localList.list.filter(v => v == value))),
        removeByField: (fieldName, value) =>
            this.removePointers(this.findPointers(this.localList.list.filter(v => v[fieldName] == value))),
        update: (value, update) => this.replacePointers(
            this.findPointers(this.localList.list.filter(v => v == value)),
            this.findPointers(this.localList.list.filter(v => v == value).map(u => update))
        ),
        updateByField: (fieldName, value, update) => this.replacePointers(
            this.findPointers(this.localList.list.filter(v => v[fieldName] == value)),
            this.findPointers(this.localList.list.filter(v => v[fieldName] == value).map(u => update))
        )
      }
      this.observer = (signal, ...args) => {
        if (this.pointerMethods[signal]) this.pointerMethods[signal](...args)
        if (this.localList[signal]) this.localList[signal](...args)
      }

      this.observation.observable.observe(this.observer)
    }
  }
  findPointers(value) {
    let depsPointers = []
    let count = 0
    for(let dep of this.more) {
      const pointers = collectPointers(value, dep.schema)
      depsPointers.push({ pointers, more: dep.more })
      count += pointers.length
    }
    let p = 0
    let allPointers = new Array(count)
    for(let dep of depsPointers) for(let pt of dep.pointers) allPointers[p++] = JSON.stringify({
      what: pt,
      more: dep.more
    })
    return allPointers
  }
  setPointers(allPointers) {
    let removed = Array.from(this.pointers.keys())
    this.pointers = new Map()
    for(let pointer of allPointers) {
      let p = this.pointers.get(pointer)
      this.pointers.set(pointer, (p || 0) + 1)
    }
    let added = Array.from(this.pointers.keys())
    this.commitPointersUpdate(added, removed)
  }
  replacePointers(oldPointers, newPointers) {
    let added = []
    let removed = []
    for(let pointer of newPointers) {
      let p = this.pointers.get(pointer)
      if(!p) added.push(pointer)
      this.pointers.set(pointer, (p || 0) + 1)
    }
    for(let pointer of oldPointers) {
      let p = this.pointers.get(pointer)
      this.pointers.set(pointer, (p || 0) - 1)
    }
    added.filter(pointer => this.pointers.get(pointer))
    for(let [pointer, count] of this.pointers.entries()) {
      if(count < 0) throw new Error("deleted not existing pointer: "+ pointer)
      if(count == 0) removed.push(pointer)
    }
    for(let rm of removed) this.pointers.delete(rm)
    this.commitPointersUpdate(added, removed)
  }
  addPointers(pointers) {
    this.replacePointers([], pointers)
  }
  removePointers(pointers) {
    this.replacePointers(pointers, [])
  }
  commitPointersUpdate(added, removed) {
    for(let rm of removed) {
      let trigger = this.triggers.get(rm)
      if(!trigger) throw new Error("removing not existing trigger: "+rm)
      trigger.dispose()
      this.triggers.delete(rm)
    }
    for(let n of added) {
      if(this.triggers.has(n)) throw new Error("could not replace existing trigger")
      let path = JSON.parse(n)
      this.triggers.set(n, new PushObservableTrigger(this.po, path.what, path.more))
    }
  }
  dispose() {
    if(this.disposed) throw new Error("DOUBLE DISPOSE " +JSON.stringify(this.what))
    this.disposed = true
    for(let trigger of this.triggers.values()) {
      trigger.dispose()
    }
    if(this.more) this.observation.observable.unobserve(this.observer)
    this.po.unpushObservation(this.what)
  }
}

class DepsScanner { /// Generate push triggers by schema and deps
  constructor(po, schema, more) {
    this.po = po
    this.schema = schema
    this.more = more

    this.dependencies = new Map()
    this.triggers = new Map()

    this.depsObserver = () => this.scanDeps()

    this.scanDeps()
  }

  scanDeps() {
    let newDeps = new Map()
    const newPointers = collectPointers(undefined, this.schema, (dep) => {
      const key = JSON.stringify(dep)
      newDeps.set(key, dep)
      const depObservation = this.dependencies.get(key)
      if(depObservation && depObservation.observable)
        return depObservation.observable.value || depObservation.observable.list
    })

    let newPointersSet = new Map()
    for(let pointer of newPointers) newPointersSet.set(JSON.stringify(pointer), pointer)
    for(let [key, pointer] of newPointersSet.entries()) {
      if(!this.triggers.has(key)) {
        this.triggers.set(key, this.po.addTrigger({ what: pointer, more: this.more }))
      }
    }
    for(let [key, trigger] of this.triggers.entries()) {
      if(!newPointersSet.has(key)) {
        this.triggers.delete(key)
        this.po.removeTrigger({ what: trigger.what, more: this.more })
      }
    }

    let newObservables = []
    for(let [key, dep] of newDeps.entries()) {
      if(!this.dependencies.has(key)) {
        let observation = this.po.pushObservation(dep)
        this.dependencies.set(key, observation)
        newObservables.push(observation.observable)
      }
    }
    for(let [key, observation] of this.dependencies.entries()) {
      if(!newDeps.has(key)) {
        observation.observable.unobserve(this.depsObserver)
        this.po.unpushObservation(observation.what)
        this.dependencies.delete(key)
      }
    }

    for(let observable of newObservables) observable.observe(this.depsObserver)
  }

  dispose() {
    for(let [key, trigger] of this.triggers.entries()) {
      this.po.removeTrigger({ what: trigger.what, more: this.more })
    }
    for(let [key, observation] of this.dependencies.entries()) {
      this.po.unpushObservation(observation.what)
    }
  }
}

class PushObservable extends ObservableList {
  constructor(connection, paths) {
    super([])
    this.connection = connection
    this.paths = paths
    this.depsScanners = new Map()
    this.triggers = new Map()

    this.observations = new Map()

    for(let path of paths) {
      if(path.schema) {
        this.addDepsScanner(path)
      } else {
        this.addTrigger(path)
      }
    }
  }
  addDepsScanner(path) {
    const key = JSON.stringify(path)
    this.depsScanners.set(key, new DepsScanner(this, path.schema, path.more))
  }
  removeDepsScanner(path) {
    const key = JSON.stringify(path)
    this.depsScanners.get(key).dispose()
    this.depsScanners.delete(key)
  }
  addTrigger(path) {
    const key = JSON.stringify(path)
    let trigger = this.triggers.get(key)
    if(trigger) {
      trigger.uses ++
    } else {
      trigger = new PushObservableTrigger(this, path.what, path.more)
      trigger.uses = 1
      this.triggers.set(key, trigger)
    }
    return trigger
  }
  removeTrigger(path) {
    const key = JSON.stringify(path)
    const trigger = this.triggers.get(key)
    if(!trigger) throw new Error("could not remove not existing trigger")
    trigger.uses --
    if(trigger.uses == 0) {
      trigger.dispose()
      this.triggers.delete(key)
    }
  }
  pushObservation(what) {
    const whatId = JSON.stringify(what)
    let observationInfo = this.observations.get(whatId)
    if(!observationInfo) {
      const observation = this.connection.push(what)
      observationInfo = {
        observation, uses: 0
      }
      this.observations.set(whatId, observationInfo)
      this.push(what)
    }
    observationInfo.uses ++
    return observationInfo.observation
  }
  unpushObservation(what) {
    const whatId = JSON.stringify(what)
    let observationInfo = this.observations.get(whatId)
    if(!observationInfo) throw new Error("could not unpush not existing observation")
    observationInfo.uses--
    if(observationInfo.uses == 0) {
      this.observations.delete(whatId)
      observationInfo.observation.unpush()
      this.remove(what)
    }
  }
  dispose() {
    ObservableList.prototype.dispose.call(this)
    for(let depsScanner of this.depsScanners.values()) {
      depsScanner.dispose()
    }
    for(let trigger of this.triggers.values()) {
      trigger.dispose()
    }
    if(this.observations.size > 0) throw new Error("cleanup failed, memory leak in PushObservable")
  }
  respawn() {
    throw new Error("respawn not implemented")
  }
}

class Observation {
  constructor(connection, what, observable, observed) {
    this.connection = connection
    this.what = what
    this.pushCount = 0
    this.observed = observed
    this.observable = observable

    if(!observed) this.push()

    this.observer = (signal, ...args) => {
      this.connection.send({
        type: "notify",
        what, signal, args
      })
      return true
    }

    this.observable.observe(this.observer)
  }
  observe(pushed) {
    if(this.disposed) {
      console.error("PREVIOUS DISPOSE", this.deleted, this.disposed)
      throw new Error("Observe of disposed observation "+JSON.stringify(this.what)+" pushed "+this.pushCount)
    }
    if(this.observed) {
      throw new Error("Observe of already observed "+JSON.stringify(this.what)+" pushed "+this.pushCount)
    }
    this.observed = true
  }
  unobserve(pushed) {
    if(!this.observed) throw new Error("Unobserve of not observed "+JSON.stringify(this.what)+
        " pushed "+this.pushCount)
    this.observed = false
    if(this.pushCount == 0) {
      this.dispose()
    } else if(!pushed) { // distributed race condition - client removed observation before received push
      /// Refresh observation - send fresh value
      this.observable.unobserve(this.observer)
      this.observable.observe(this.observer)
    }
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
  dispose() {
    if(this.disposed) {
      console.error("PREVIOUS DISPOSE", this.deleted,  this.disposed)
      throw new Error("DOUBLE DISPOSE " + JSON.stringify(this.what))
    }
    this.disposed = true
    try { throw new Error(); } catch(e) { this.disposed = e }

    this.observable.unobserve(this.observer)
    this.connection.observations.delete(JSON.stringify(this.what))
    this.deleted = true
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
        if(observation.observed) observation.dispose()
      }
      if(this.dao) this.dao.dispose()
      this.server.handleConnectionClose(this)
    })

    if(this.settings.fastAuth) {
      try {
        this.handleDaoPromise(this.daoFactory(this.credentials, this.connection, this))
      } catch(error) {
        return this.handleDaoFactoryError(error)
      }
    }
  }

  send(message) {
    try {
      const serialized = JSON.stringify(message)
      this.connection.write(serialized)
    } catch (error) {
      console.error("MESSAGE SERIALIZATION ERROR", error, "\nMessage: ", message)
    }
  }

  push(what) {
    const whatId = JSON.stringify(what)
    let observation = this.observations.get(whatId)
    if(!observation) {
      const observable = this.dao.observable(what)
      observation = new Observation(this, what, observable, false)
      this.observations.set(whatId, observation)
      return observation
    }
    observation.push()
    return observation
  }

  unpush(what) {
    const whatId = JSON.stringify(what)
    let observation = this.observations.get(whatId)
    if(!observation) throw new Error("unpush of non-existing observation")
    observation.unpush()
  }

  handleServerError(message, error) {
    debug('MESSAGE', message)
    debug('SERVER ERROR', error)
    if(this.settings.logErrors) {
      console.error('MESSAGE', message)
      console.error('SERVER ERROR', error)
    }
    this.emit('serverError', error, message)
  }

  handleClientError(message, error) {
    debug('MESSAGE', message)
    debug('CLIENT ERROR', error)
    debug('CLOSING CONNECTION')
    if(this.settings.logErrors) {
      console.error('MESSAGE', message)
      console.error('CLIENT ERROR', error)
      console.error('CLOSING CONNECTION')
    }
    this.emit('clientError', error, message)
    this.closeConnection()
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
    //debug('handle observe', spath)
    let observation = this.observations.get(spath)
    if(observation) {
      if(observation.observed) {
        this.handleClientError(message, "Second observation of the same observable")
        return
      } else {
        observation.observe(message.pushed)
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
    debug('handle unobserve', spath)
    const observation = this.observations.get(spath)
    if(!observation) {
      throw new Error("Unobserve of not observed "+spath)
    }
    observation.unobserve(message.pushed)
  }


  handleGet(message) {
    const path = message.what
    if(typeof path == 'object' && !Array.isArray(path) && path.paths) {
      let paths = path.paths
      return this.handleGetMore(message.requestId, paths)
    }
    try {
      Promise.resolve(this.dao.get(path)).then(
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
    //console.log("REQ", requestId)
    let fetchMap = new Map()
    let resultsMap = new Map()
    let results = []
    const dao = this.dao
    function fetchDeps(source, schema) {
      let moreDeps = []
      const pointers = collectPointers(source, schema, (dep) => {
        const key = JSON.stringify(dep)
        const value = resultsMap.get(key)
        if(typeof value != 'undefined') return value
        moreDeps.push(dep)
        return undefined
      })
      //console.log("S PTRS", JSON.stringify(pointers, null, '  '))
      if(moreDeps.length == 0) return Promise.resolve(pointers)
      return Promise.all(moreDeps.map(dep => {
        const result = fetch({ what: dep }).catch(error => {
          error.stack += `\nWhile fetching ${JSON.stringify(dep)} from source`
          +`${JSON.stringify(source, null,"  ")} with schema ${JSON.stringify(schema)}`
          throw error
        })
        return result
      })).then(gotSomeDeps => fetchDeps(source, schema))

    }
    function fetchMore(result, more) {
      return Promise.all(
        more.map(mm =>
          fetchDeps(result, mm.schema)
            .then(pointers => Promise.all(
              pointers.map(pointer => fetch({ what: pointer, more: mm.more}))
            ))
        )
      )
    }
    function fetch(path) {
      if(path.what) {
        const what = path.what
        const key = JSON.stringify(what)
        //console.log("F", key)
        let dataPromise = fetchMap.get(key)
        if(!dataPromise) {
          dataPromise = dao.get(what)
          fetchMap.set(key, dataPromise)
        }
        return dataPromise.then(result => {
          if(!resultsMap.has(key)) {
            results.push({
              what,
              data: result
            })
            resultsMap.set(key, result)
          }
          if(path.more) {
            return fetchMore(result, path.more).then(m=>result)
          } else return Promise.resolve(result)
        })
      } else if(path.schema) {
        return fetchDeps(undefined, path.schema).then(pointers => {
          //console.log("PTRS", pointers)
          return Promise.all(pointers.map(pointer => fetch({ what: pointer }))).then(results => {
            if (path.more) {
              return fetchMore(results, path.more).then(m=>results)
            } else return Promise.resolve(results)
          })
        })
      } else throw new Error("Unknown path format: " + JSON.stringify(path))
    }
    Promise.all(paths.map(path => fetch(path))).then(() => { /// Flatten results
      //console.log(requestId, "RESULTS KEYS:\n", results.map(r=>JSON.stringify(r.what)).join('\n'))
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
    console.error("PROTOCOL ERROR", error, "credentials", this.credentials)
    this.send({
      type: "malformedMessageError",
      error: utils.errorToJSON(error),
      message
    })
    this.closeConnection()
  }

  handleDaoFactoryError(error) {
    debug("DAO Factory error", error)
    console.error('DAO FACTORY ERROR', error)
    this.send({
      type: "authenticationError",
      error: utils.errorToJSON(error)
    })
    this.closeConnection()
  }

  handleDaoPromise(daoPromise) {
    this.daoPromise = daoPromise
    if(!this.daoPromise.then) {
      this.dao = this.daoPromise
      this.daoPromise = null
    } else {
      this.daoPromise.catch(error => this.handleDaoFactoryError(error)).then(dd => {
        if(!dd) return this.handleDaoFactoryError("dao not defined")
        this.dao = dd
        this.daoPromise = null
        for(const message of this.daoGenerationQueue) this.handleAuthorizedMessage(message)
      })
    }
  }

  handleMessage(message) {
    if (!this.dao && !this.daoPromise) {
      if (!message) {
        this.handleClientError(message, "Got empty packet, expected credentials")
        return;
      }
      try {
        this.credentials = message
        this.handleDaoPromise(this.daoFactory(this.credentials, this.connection, this))
      } catch(error) {
        return this.handleDaoFactoryError(error)
      }
    } else if(this.daoPromise && !this.dao) {
      this.daoGenerationQueue.push(message)
    } else {
      this.handleAuthorizedMessage(message)
    }
  }

  closeConnection() {
    if(this.settings.logErrors) console.trace("DISCONNECTED BY SERVER!")
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
