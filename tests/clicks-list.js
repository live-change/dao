const test = require('blue-tape')
const testServerDao = require('./testServerDao.js')
const ReactiveDao = require("../index.js")
const LoopbackConnection = require('../lib/LoopbackConnection.js')

test("click list", (t) => {
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

  let clicksObservable, clicksObserver, ticks = 0
  t.test('observe server clicks list', (t) => {
    t.plan(15)
    t.timeoutAfter(700)

    let initialized = false

    clicksObservable = client.observable(['test','clicks'], ReactiveDao.ObservableList)
    clicksObserver = {
      set(clicks){
        t.pass("got initial list! "+clicks)
        initialized = true
      },
      push(click) {
        if(!initialized) return t.fail("got click before initial list")
        if(clicksObservable.list.length > 6) t.fail('too much clicks in the list')
        t.pass("got click")
        ticks ++
      },
      shift() {
        if(!initialized) return t.fail("got click shift before initial list")
        if(clicksObservable.list.length < 4) t.fail('not enough clicks to shift the list')
        t.pass("got shift")
        ticks ++
      }
    }
    clicksObservable.observe(clicksObserver)
  })

  t.test('unobserve server clicks list', (t) => {
    t.plan(1)
    clicksObservable.unobserve(clicksObserver)
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
