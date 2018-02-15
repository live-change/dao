const Connection = require("./ReactiveConnection.js")

class LoopbackConnection extends Connection {
  constructor(sessionId, server, settings) {
    super(sessionId, settings)
    this.packetFilter = settings.packetFilter
    this.server = server
    this.delay = settings.delay || 0
    this.serverMessageListener = null
    this.serverCloseListener = null
    this.headers = {}
    this.initialize()
  }

  initialize() {
    setTimeout(() => {
      this.server.handleConnection(this)
      this.handleConnect()
    }, this.delay)
  }

  send(message) {
    if(!this.connected) return;
    var data = JSON.stringify(message)
    console.info("CLIENT => SERVER Message", message)
    if(this.packetFilter && !this.packetFilter(message, true)) {
      console.info("Message filtered")
      return;
    }
    setTimeout(() => {
      this.emit('data', data)
    }, this.delay)
  }

  reconnect() {
    this.handleDisconnect()
    this.serverCloseListener()
    if (this.autoReconnect) return;
    this.initialize()
  }

  dispose() {
    this.finished = true
    this.handleDisconnect()
    this.emit('close')
  }

  closeConnection() {
    this.handleDisconnect()
  }

  write(json) {
    if(!this.connected) return;
    var message = JSON.parse(json)
    console.info("SERVER => CLIENT Message", message)
    if(this.packetFilter && !this.packetFilter(message, false)) {
      console.info("Message filtered")
      return;
    }
    setTimeout(() => {
        this.handleMessage(message)
    }, this.delay)
  }

}

module.exports = LoopbackConnection