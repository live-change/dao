const test = require('blue-tape');
const testServerDao = require('./testServerDao.js')
const ReactiveDao = require("../index.js")
const LoopbackConnection = require('../lib/LoopbackConnection.js')

test("time synchronization", (t) => {
  t.plan(3)
  let sessionId = ""+Math.random()

  let server
  let client
  let timeSynchronization = new ReactiveDao.TimeSynchronization({
    pingInterval: 50,
    pingIntervalIncrement: 0,
    minPongCount: 3
  })
  t.test('create connection', (t) => {
    t.plan(1)
    server = new ReactiveDao.ReactiveServer(testServerDao.promised)
    client = new LoopbackConnection(sessionId, server, {
      onConnect: () => t.pass("connected"),
      delay: 50,
      timeSynchronization
    })
  })

  t.test('check if time is synchronized', (t) => {
    t.plan(1)
    timeSynchronization.synchronizedPromise().then(diff => {
      console.log("MINIMAL DIFF", timeSynchronization.minimalDiff)
      console.log("MAXIMAL DIFF", timeSynchronization.maximalDiff)
      if(diff > 5) t.fail("too big time diff")
      else if(diff < -5) t.fail("too small time diff")
      else t.pass('synchronized')
    })
  })

  t.test('disconnect from server', (t) => {
    t.plan(1)
    client.settings.onDisconnect = () => {
      t.pass("disconnected")
      t.end()
    }
    client.dispose()
  })

})

test.onFinish(() => process.exit(0))
