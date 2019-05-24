
const EventEmitter = require("./EventEmitter.js")
const RemoteDataSource = require("./RemoteDataSource.js")
const ReactiveConnection = require("./ReactiveConnection.js")
const ObservableList = require("./ObservableList.js")
const debug = require('debug')('reactive-dao')

class ReactiveDao extends EventEmitter {
  constructor(sessionId, definition) {
    super()
    this.definition = definition
    this.sessionId = sessionId
    this.connections = new Map()
    if(!this.definition.protocols) this.definition.protocols = {}
  }

  connect(defn) {
    var url = defn.url || this.definition.remoteUrl
      || document.location.protocol + '//' + document.location.host + '/reactive-dao'
    var proto = defn.protocol || this.definition.defaultProtocol || Object.keys(this.definition.protocols)[0]

    var connectionId = proto+":"+url
    var connection = this.connections.get(connectionId)
    if(connection) return connection

    var protocol = this.definition.protocols[proto]
    if(!protocol) throw new Error("Protocol "+proto+" not supported")
    connection = new protocol(this.sessionId, url, this.definition.connectionSettings)
    this.connections.set(connectionId, connection)

    connection.on('connect', (...args) => this.emit('connect', connection, ...args))
    connection.on('disconnect', (...args) => this.emit('disconnect', connection, ...args))

    return connection
  }

  findDefinition(what) {
    var parsedWhat = typeof what == 'string' ? what.slice('.') : what
    for(var i = what.length; i>0; i--) {
      var part = what.slice(0, i)
      var defn = this.definition[part.join('.')]
      if(defn) return defn
      var defn = this.definition[JSON.stringify(part)]
      if(defn) return defn
    }
    if(this.definition.defaultRoute) return this.definition.defaultRoute
    throw new Error("definition of "+JSON.stringify(what)+" data access object not found")
  }

  prepareSource(defn) {
    if(defn.source) return defn
    switch(defn.type) {
      case 'remote':
        var connection = this.connect(defn)
        if(!defn.generator) defn.generator = (value, what) => new ObservableList(value)
        defn.source = new RemoteDataSource(connection, defn.generator)
        return defn
      break;
    }
    throw new Error("SOURCE TYPE "+defn.type+" UNKNOWN")
  }

  observable(what) {
    var defn = this.findDefinition(what)
    defn = this.prepareSource(defn)
    return defn.source.observable(what)
  }

  get(what) {
    var defn = this.findDefinition(what)
    defn = this.prepareSource(defn)
    return defn.source.get(what)
  }

  request(method, ...args) {
    var defn = this.findDefinition(method)
    defn = this.prepareSource(defn)
    return defn.source.request(method, ...args)
  }

  event(method, ...args) {
    var defn = this.findDefinition(what)
    defn = this.prepareSource(defn)
    return defn.source.event(method, ...args)
  }

  dispose() {
    for(let [to, connection] of this.connections.entries()) {
      debug("CLOSE CONNECTION TO", to)
      connection.dispose()
    }
  }
}

module.exports = ReactiveDao
