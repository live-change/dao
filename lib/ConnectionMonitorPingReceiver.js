class ConnectionMonitorPingReceiver {
  constructor(connection, settings) {
    this.connection = connection
    this.pingInterval = settings.pingInterval | 10000
    this.connection.on('ping', () => this.handlePing())
    if(this.connection.connected) this.start()
    this.connection.on('connect', () => this.start())
  }
  start() {
    this.lastPing = Date.now()
    this.work();
  }
  work() {
    if(this.checkTimer !== null) clearTimeout(this.checkTimer)
    const now = Date.now()
    let nextPing = this.lastPing + this.pingInterval
    if(nextPing < now) {
      this.connection.closeConnection()
      return
    }
    if(nextPing < Infinity) {
      this.checkTimer = setTimeout(() => this.work(), nextPing - now)
    }
  }
  handlePing() {
    this.lastPing = Date.now()
    this.work()
  }
}

module.exports = ConnectionMonitorPingReceiver
