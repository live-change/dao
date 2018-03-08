class TimeSynchronization {
  constructor(settings) {
    this.connection = null

    /// All diffs are =  server - client
    /*
     timeDiff = serverTime - clientTime
     but network latency is in effect
     receiveTime > 0
     timeDiff = receivedServerTs - (clientTime - receiveTime)
     timeDiff = receivedServerTs - clientTime + receiveTime
     timeDiff > receivedServerTs - clientTime
     and smaller receive time is better
    */
    this.minimalDiff = -Infinity // Difference calculated with zero receive time assumption.

    /*
     sendTime > 0
     clientTimeOnServerSide = clientTime + sendTime
     timeDiffOnServerSide = serverTime - clientTimeOnServerSide
     timeDiff = receivedServerTs - (receivedClientTs + sendTime)
     timeDiff = receivedServerTs - receivedClientTs - sendTime
     timeDiff < receivedServerTs - receivedClientTs
     */
    this.maximalDiff = +Infinity // Difference calculated with zero send time assumption.


    this.timeDiff = 0 // Calculated diff

    this.pongCount = 0

    settings = settings || {}

    this.sendInterval = settings.pingInterval || 1000
    this.sendIntervalIncrement = settings.pingIntervalIncrement === undefined ? 250 : settings.pingIntervalIncrement
    this.maxSendInterval = settings.maxPingInterval || 100000
    this.minPongCount = settings.minPongCount || 1

    this.phases = settings.phases || []
    this.nextPhaseId = 0

    this.promise = new Promise((resolve, reject) => this.promiseCallback = resolve)
  }
  setConnection(connection) {
    this.connection = connection
    this.connection.on('timeSync', 
      (msg) => this.handleTimeSync(msg.clientTimestamp, msg.serverTimestamp))
    this.run()
  }
  sendSyncPing() {
    let now = Date.now()
    this.connection.sendTimeSync(now)
  }

  handleTimeSync(clientTs, serverTs) {
    let clientNow = Date.now()

    // Zero reply time diff calculation
    let zeroReply = serverTs - clientNow
    if(zeroReply > this.minimalDiff) this.minimalDiff = zeroReply
    /* no diff can be smaller than zero reply because that will indicate time travel of packets */

    // Zero send time diff calculation
    let zeroSend = serverTs - clientTs
    if(zeroSend < this.maximalDiff) this.maximalDiff = zeroSend
    /* no diff can be bigger than zero send because that will indicate time travel of packets */

    let ping = clientNow-clientTs
    let pingDiff = serverTs - (clientNow-ping/2) // half ping before now

    if(this.minimalDiff > this.maximalDiff) {
      //console.error("TIME SYNC ERROR", this.minimalDiff, this.maximalDiff)
      let middle = (this.minimalDiff+this.maximalDiff)/2
      this.timeDiff = middle
    } else {
      this.timeDiff = pingDiff

      if(this.timeDiff < this.minimalDiff) this.timeDiff = this.minimalDiff
      if(this.timeDiff > this.maximalDiff) this.timeDiff = this.maximalDiff
    }

    //console.error("PING",ping,'PING DIFF', pingDiff,"ZERO REPLY",zeroReply,"ZERO SEND",zeroSend,"REAL DIFF",this.timeDiff)

    this.pongCount++
    if(this.pongCount == this.minPongCount) this.promiseCallback(this.timeDiff)

    if(this.phases.length > this.nextPhaseId) {
      let phase = this.phases[this.nextPhaseId]
      if(this.pongCount >= phase.afterPongCount) {
        this.nextPhaseId++
        this.sendInterval = phase.pingInterval || 1000
        this.sendIntervalIncrement = phase.pingIntervalIncrement || 0
        this.maxSendInterval = phase.maxPingInterval || 100000
      }
    }
  }

  run() {
    if(this.connection.connected) {
      this.sendSyncPing()
    }
    let interval = this.sendInterval + this.pongCount * this.sendIntervalIncrement
    if(interval > this.maxSendInterval) interval = this.maxSendInterval
    setTimeout(() => this.run(), interval)
  }

  serverToLocal(ts) {
    if(this.pongCount < this.minPongCount) throw new Error("Time not synchronized")
    return ts - this.timeDiff
  }
  localToServer(ts) {
    if(this.pongCount < this.minPongCount) throw new Error("Time not synchronized")
    return ts + this.timeDiff
  }

  synchronizedPromise() {
    return this.promise
  }

}

module.exports = TimeSynchronization
