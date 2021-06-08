const test = require('blue-tape');
const testServerDao = require('./testServerDao.js')
const ReactiveDao = require("../index.js")
const LoopbackConnection = require('../lib/LoopbackConnection.js')

test("time value", (t) => {
  t.plan(2)
  let sessionId = ""+Math.random()

  let server
  let client
  t.test('create connection with dao factory returning failed promise', (t) => {
    t.plan(1)
    server = new ReactiveDao.ReactiveServer(testServerDao.failedPromise)
    client = new LoopbackConnection({ sessionId }, server, {
      delay: 50
    })
    client.once('authenticationError', (err) => t.pass("authentication failed!"))
  })

  t.test('create connection with dao factory throwing exception', (t) => {
    t.plan(1)
    server = new ReactiveDao.ReactiveServer(testServerDao.failed)
    client = new LoopbackConnection({ sessionId }, server, {
      delay: 50
    })
    client.once('authenticationError', (err) => t.pass("authentication failed!"))
  })

})

test.onFinish(() => process.exit(0))
