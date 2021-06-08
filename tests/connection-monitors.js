const test = require('blue-tape');
const testServerDao = require('./testServerDao.js')
const ReactiveDao = require("../index.js")
const LoopbackConnection = require('../lib/LoopbackConnection.js')

test("connection monitors", (t) => {
  t.plan(5)
  let sessionId = ""+Math.random()

  let server
  let serverConnection
  let client
  let clientMonitor
  let serverMonitor
  t.test('create connection', (t) => {
    t.plan(1)
    server = new ReactiveDao.ReactiveServer(testServerDao.promised,{
      connectionMonitorFactory(connection) {
        console.log("CREATE SERVER CONNECTION MONITOR")
        return serverMonitor = new ReactiveDao.ConnectionMonitorPingReceiver(connection, {
          pingInterval: 200
        })
      }
    })
    client = new LoopbackConnection({ sessionId }, server, {
      onConnect: () => {
        serverConnection = server.connections.get(server.lastConnectionId)
        t.pass("connected")
        client.settings.onConnect = null
      },
      delay: 50,
      connectionMonitorFactory(connection) {
        console.log("CREATE CLIENT CONNECTION MONITOR")
        return clientMonitor = new ReactiveDao.ConnectionMonitorPinger(connection, {
          pingInterval: 50,
          pongInterval: 200
        })
      }
    })
  })

  t.test('wait 10 ping pongs', (t) => {
    t.plan(1)
    let pingCounter = 0
    let pongCounter = 0
    function pingHandler() {
      console.log("PingHandler")
      pingCounter ++
      check()
    }
    function pongHandler() {
      console.log("PongHandler")
      pongCounter ++
      check()
    }
    function check() {
      if(pingCounter >= 10 && pongCounter >= 10) {
        serverConnection.removeListener('ping', pingHandler)
        client.removeListener('pong', pongHandler)
        t.pass("ping! pong!")
      }
    }
    serverConnection.on('ping', pingHandler)
    client.on('pong', pongHandler)
  })

  t.test('block pongs, wait for client disconnect', (t) => {
    t.plan(1)
    client.autoReconnect = false
    client.packetFilter = (msg) => msg.type != 'pong'
    setTimeout(() => {
      if(!client.connected) {
        t.pass("automatically disconnected")
      } else {
        t.fail("not disconnected automagically")
      }
    }, 500)
  })

  t.test('reconnect', (t) => {
    t.plan(1)
    client.packetFilter = null
    client.initialize()
    setTimeout(() => {
      if(client.connected) {
        t.pass("reconnected and healthy")
      } else {
        t.fail("not reconnected or unhealthy")
      }
    }, 500)
  })

  t.test('disable client monitor, wait for server reaction', (t) => {
    t.plan(1)
    clientMonitor.pongInterval = Infinity
    clientMonitor.pingInterval = Infinity
    setTimeout(() => {
      if(!serverConnection.connected) {
        t.pass("automatically disconnected")
      } else {
        t.fail("not disconnected automagically")
      }
    }, 500)
  })

})

test.onFinish(() => process.exit(0))
