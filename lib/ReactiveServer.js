const ReactiveServerConnection = require('./ReactiveServerConnection.js')

class ReactiveServer {
  constructor(daoFactory, settings) {
    this.settings = settings || {}
    this.daoFactory = daoFactory
    this.connections = new Map()
    this.lastConnectionId = 0
  }
  handleConnection(connection) {
    let id = ++this.lastConnectionId
    let reactiveConnection = new ReactiveServerConnection(this, id, connection, this.daoFactory, this.settings)
    this.connections.set( reactiveConnection.id, reactiveConnection )
  }
  handleConnectionClose(reactiveConnection) {
    this.connections.delete( reactiveConnection.id )
  }
}

module.exports = ReactiveServer
