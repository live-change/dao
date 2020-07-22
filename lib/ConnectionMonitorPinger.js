
class ConnectionMonitorPinger {
  constructor(connection, settings) {
    this.settings = settings || {}
    this.pingInterval = this.settings.pingInterval || 10000
    this.pongInterval = this.settings.pongInterval || 10000
    this.connection = connection
    this.checkTimer = null
    this.connection.on('pong', () => this.handlePong() )
    this.connection.on('connect', () => this.start())
    if(this.connection.connected) this.start()
  }
  start() {
    let now = Date.now()
    this.lastPing = now
    this.lastPong = now
    this.work()
  }
  work() {
    if(this.checkTimer !== null) clearTimeout(this.checkTimer)
    if(!this.connection.connected) return;

    const now = Date.now()

    let nextPing = this.lastPing + this.pingInterval
    let nextPong = this.lastPong + this.pongInterval

    if(nextPong <= now) {
      this.connection.closeConnection()
      return;
    }
    if(nextPing <= now) {
      this.connection.sendPing()
      this.lastPing = now
      nextPing = this.lastPing + this.pingInterval
    }

    let nextCheck = Math.min(nextPing, nextPong)
    if(nextCheck < Infinity) {
      this.checkTimer = setTimeout(() => this.work(), nextCheck - now)
    }
  }
  handlePong() {
    this.lastPong = Date.now()
    this.work()
  }

}

module.exports = ConnectionMonitorPinger
