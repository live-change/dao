const test = require('blue-tape');
const testServerDao = require('./testServerDao.js')
const ReactiveDao = require("../index.js")
const LoopbackConnection = require('../lib/LoopbackConnection.js')

let sessionId = ""+Math.random()

let server
let client
test('create connection', (t) => {
  t.plan(1)
  server = new ReactiveDao.ReactiveServer(testServerDao.promised)
  let connectedOnce;
  client = new LoopbackConnection({ sessionId }, server, {
    onConnect: () => {
      if(connectedOnce) return;
      connectedOnce = true
      t.pass("connected")
    },
    delay: 50
  })
})

test('send {type:"get"}', (t) => {
  t.plan(1)
  setTimeout(() => {
    client.send({type:'get'})
    setTimeout(() => {
      console.log("SEND PROPER GET!")
      client.get(['test','time']).then(() => t.pass("ok")).catch(() => t.pass("ok"))
    }, 400)
  }, 200)
})


test('disconnect from server', (t) => {
  t.plan(1)
  client.settings.onDisconnect = () => {
    t.pass("disconnected")
    t.end()
  }
  client.dispose()
})

test.onFinish(() => process.exit(0))
