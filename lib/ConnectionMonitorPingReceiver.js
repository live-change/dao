class ConnectionMonitorPingReceiver {
  constructor(connection, settings) {
    this.connection = connection
    this.maxPingDelay = settings.maxPingDelay | 10000
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
    let nextPing = this.lastPing + this.maxPingDelay
    if(nextPing < now) {
      this.connection.closeConnection()
      return
    }
    this.checkTimer = setTimeout(() => this.work(), nextPing - now)
  }
  handlePing() {
    this.lastPing = Date.now()
    this.work()
  }
}