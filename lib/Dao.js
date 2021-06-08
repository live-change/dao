const EventEmitter = require("./EventEmitter.js")
const RemoteDataSource = require("./RemoteDataSource.js")
const ReactiveConnection = require("./ReactiveConnection.js")
const ObservableList = require("./ObservableList.js")
const debug = require('debug')('dao')

class Dao extends EventEmitter {
  constructor(credentials, definition) {
    super()
    this.definition = definition
    this.credentials = credentials
    this.connections = new Map()
    if(!this.definition.protocols) this.definition.protocols = {}
  }

  connect(defn) {
    const url = defn.url || this.definition.remoteUrl
      || document.location.protocol + '//' + document.location.host + '/reactive-dao'
    const proto = defn.protocol || this.definition.defaultProtocol || Object.keys(this.definition.protocols)[0]

    const connectionId = proto+":"+url
    let connection = this.connections.get(connectionId)
    if(connection) return connection

    const protocol = this.definition.protocols[proto]
    if(!protocol) throw new Error("Protocol "+proto+" not supported")
    debug("connecting to "+url)
    connection = new protocol(this.credentials, url, this.definition.connectionSettings)
    this.connections.set(connectionId, connection)

    connection.on('connect', (...args) => this.emit('connect', connection, ...args))
    connection.on('disconnect', (...args) => this.emit('disconnect', connection, ...args))

    return connection
  }

  findDefinition(what) {
    if(Array.isArray(what)) {
      for (let i = what.length; i > 0; i--) {
        const part = what.slice(0, i)
        let defn = this.definition[part.join('.')]
        if (defn) return defn
        defn = this.definition[JSON.stringify(part)]
        if (defn) return defn
      }
    }
    if(this.definition.defaultRoute) return this.definition.defaultRoute
    throw new Error("definition of "+JSON.stringify(what)+" data access object not found")
  }

  prepareSource(defn) {
    if(defn.source) return defn
    switch(defn.type) {
      case 'remote':
        const connection = this.connect(defn)
        if(!defn.generator) defn.generator = (value, what) => new ObservableList(value)
        defn.source = new RemoteDataSource(connection, defn)
        return defn
      break;
    }
    throw new Error("SOURCE TYPE "+defn.type+" UNKNOWN")
  }

  observable(what) {
    let defn = this.findDefinition(what)
    defn = this.prepareSource(defn)
    return defn.source.observable(what)
  }

  get(what) {
    let  defn = this.findDefinition(what)
    defn = this.prepareSource(defn)
    return defn.source.get(what)
  }

  request(method, ...args) {
    let defn = this.findDefinition(method)
    defn = this.prepareSource(defn)
    return defn.source.request(method, ...args)
  }

  requestWithSettings(settings, method, ...args) {
    let defn = this.findDefinition(method)
    defn = this.prepareSource(defn)
    return defn.source.requestWithSettings(settings, method, ...args)
  }

  event(method, ...args) {
    let defn = this.findDefinition(method)
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

module.exports = Dao
module.exports.default = Dao
