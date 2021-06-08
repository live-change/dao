const test = require('blue-tape');
const testServerDao = require('./testServerDao.js')
const ReactiveDao = require("../index.js")
const LoopbackConnection = require('../lib/LoopbackConnection.js')

test("time synchronization", (t) => {
  t.plan(6)
  let sessionId = ""+Math.random()

  let server
  let client
  let timeSynchronization = new ReactiveDao.TimeSynchronization({
    pingInterval: 50,
    pingIntervalIncrement: 0,
    minPongCount: 3,
    phases: [
      { afterPongCount: 5, pingInterval: 100 },
      { afterPongCount: 10, pingInterval: 200 }
    ]
  })
  t.test('create connection', (t) => {
    t.plan(1)
    server = new ReactiveDao.ReactiveServer(testServerDao.promised)
    client = new LoopbackConnection({ sessionId }, server, {
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

  t.test('wait for pong-count == 5', (t) => {
    t.plan(1)
    function wait() {
      if(timeSynchronization.pongCount >= 5) return t.pass("pong-count==5")
      setTimeout(wait, 10)
    }
    wait()
  })

  t.test('next 5 pings should be done in ~400ms', (t) => {
    t.plan(1)
    const startTime = Date.now()
    function wait() {
      let diff = Date.now() - startTime
      if(timeSynchronization.pongCount >= 10) {
        let error = Math.abs(400 - diff)
        if(error > 50) return t.fail("5 pings in " + diff)
        return t.pass("5 pings in " + diff)
      }
      setTimeout(wait, 10)
    }
    wait()
  })

  t.test('next 4 pings should be done in ~600ms', (t) => {
    t.plan(1)
    const startTime = Date.now()
    function wait() {
      let diff = Date.now() - startTime
      if(timeSynchronization.pongCount >= 14) {
        let error = Math.abs(600 - diff)
        if(error > 50) return t.fail("4 pings in " + diff)
        return t.pass("4 pings in " + diff)
      }
      setTimeout(wait, 10)
    }
    wait()
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
