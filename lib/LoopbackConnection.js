const Connection = require("./ReactiveConnection.js")
const debug = require("debug")("reactive-dao:loopback-connection")

class LoopbackConnection extends Connection {
  constructor(credentials, server, settings) {
    super(credentials, settings)
    this.packetFilter = settings.packetFilter
    this.server = server
    this.delay = settings.delay || 0
    this.serverMessageListener = null
    this.serverCloseListener = null
    this.headers = {}
    this.initialize()
  }

  initialize() {
    if(this.initPromise) return this.initPromise
    delete this.events['data']
    this.initPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        this.server.handleConnection(this)
        this.handleConnect()
        this.initPromise = null
        resolve(true)
      }, this.delay)
    })
  }

  send(message) {
    if(!this.connected) return;
    const data = JSON.stringify(message)
    debug("CLIENT => SERVER Message", message)
    if(this.packetFilter && !this.packetFilter(message, true)) {
      debug("Message filtered")
      return;
    }
    setTimeout(() => {
      this.emit('data', data) 
    }, this.delay)
  }

  reconnect() {
    debug("reconnect!")
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
    this.emit('close')
    this.handleDisconnect()
  }

  close() {
    this.emit('close')
    this.handleDisconnect()
  }

  write(json) {
    if(!this.connected) return;
    const message = JSON.parse(json)
    debug("SERVER => CLIENT Message", message)
    if(this.packetFilter && !this.packetFilter(message, false)) {
      debug("Message filtered")
      return;
    }
    setTimeout(() => {
        this.handleMessage(message)
    }, this.delay)
  }

}

module.exports = LoopbackConnection