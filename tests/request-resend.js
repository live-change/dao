const test = require('blue-tape');
const testServerDao = require('./testServerDao.js')
const ReactiveDao = require("../index.js")
const LoopbackConnection = require('../lib/LoopbackConnection.js')

test("request resend", (t) => {
  t.plan(7)
  let sessionId = ""+Math.random()

  let server
  let client
  let counter
  t.test('create connection', (t) => {
    t.plan(1)
    server = new ReactiveDao.ReactiveServer(testServerDao.promised, {
      logErrors: true
    })
    client = new LoopbackConnection({ sessionId }, server, {
      onConnect: () => t.pass("connected"),
      delay: 50,
      autoReconnectDelay: 400,
      requestSendTimeout: 600,
      queueRequestsWhenDisconnected: true,
      queueActiveRequestsOnDisconnect: true
    })

    counter = client.observable(['test', 'counter'], testServerDao.ObservableCounter)
    client.request(['test', 'reset'])
  })

  t.test('add one when connected', (t) => {
    t.plan(2)
    client.request(['test', 'increment'])
      .then(() => t.pass("incremented"))
      .catch(() => t.fail("request failed"))
    setTimeout(()=> {
      t.equal(counter.value, 1, "one added")
    }, 250)
  })

  t.test('add one and disconnect before added', (t) => {
    t.plan(1)
    client.request(['test', 'increment'])
    setTimeout(()=> {
      client.autoReconnect = false
      client.closeConnection()
      t.pass('sent and disconnected')
    }, 30)
  })

  t.test('add one when disconnected', (t) => {
    t.plan(1)
    client.request(['test', 'increment'])
    setTimeout(()=> {
      t.pass('queued')
    }, 30)
  })

  t.test('reconnect and all should be added', (t) => {
    t.plan(2)
    client.settings.onConnect = () => {
      t.pass("connected")
    }
    client.initialize()
    setTimeout(()=> {
      t.equal(counter.value, 4, "4 = 1 old + 1 * 2 duplicated + 1 queued")
    }, 250)
  })

  t.test('do request and disconnect from server', (t) => {
    t.plan(2)
    client.request(['test', 'increment'])
      .then(res => t.fail('result of disconnected request'))
      .catch(res => t.equal(res, 'disconnected', "request failed because connection is disconnected"))
    client.settings.onDisconnect = () => {
      t.pass("disconnected")
    }
    client.dispose()
  })

  t.test('request should fail when done in disconnected state', (t) => {
    t.plan(1)
    client.request(['test', 'increment'])
      .then(res => t.fail('result of disconnected request'))
      .catch(res => t.equal(res, 'disconnected', "request failed because connection is disconnected"))
  })

})

test.onFinish(() => process.exit(0))
