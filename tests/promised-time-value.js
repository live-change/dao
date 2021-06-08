const test = require('blue-tape');
const testServerDao = require('./testServerDao.js')
const ReactiveDao = require("../index.js")
const LoopbackConnection = require('../lib/LoopbackConnection.js')

test("time value", (t) => {
  t.plan(4)
  let sessionId = ""+Math.random()

  let server
  let client
  t.test('create connection', (t) => {
    t.plan(1)
    server = new ReactiveDao.ReactiveServer(testServerDao.promised)
    client = new LoopbackConnection({ sessionId }, server, {
      onConnect: () => t.pass("connected"),
      delay: 50
    })
  })

  let timeObservable, timeObserver, ticks = 0
  t.test('observe server time value', (t) => {
    t.plan(5)

    timeObservable = client.observable(['test','promisedTime'],ReactiveDao.ObservableValue)
    timeObserver = {
      set(time){
        ticks++
        t.pass("got tick: "+time)
      }
    }
    timeObservable.observe(timeObserver)
  })

  t.test('unobserve server time value', (t) => {
    t.plan(1)
    timeObservable.unobserve(timeObserver)
    let currTicks = ticks
    setTimeout(() => currTicks = ticks, 60)
    setTimeout(() => t.assert(currTicks == ticks), 200)
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
