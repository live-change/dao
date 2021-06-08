const test = require('blue-tape')
const testServerDao = require('./testServerDao.js')
const ReactiveDao = require("../index.js")
const LoopbackConnection = require('../lib/LoopbackConnection.js')

test("get more", (t) => {
  t.plan(5)
  let sessionId = "" + Math.random()

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

  t.test('get users list with one level of dependencies', (t) => {
    t.plan(1)
    client.get({ paths: [{ what: ["test", "users"], more: [
        { schema: [["test", "user", { user : { identity: true } }]] }
    ]}]}).then(res => {
      t.deepEqual(res, [
        { "what": [ "test",  "users" ],
          "data": [ 0, 1, 2, 3 ]
        },
        { "what": [ "test", "user", { "user": 0 } ],
          "data": { "id": 0, "name": "test1", "role": 0 }
        },
        { "what": [ "test", "user", { "user": 1 } ],
          "data": { "id": 1, "name": "test2", "role": 1 }
        },
        { "what": ["test", "user", { "user": 2}],
          "data": { "id": 2, "name": "test3", "role": 1}
        },
        { "what": ["test", "user", { "user": 3 }],
          "data": { "id": 3, "name": "test4", "role": 1}
        }
      ], "got object with dependencies")
    })
  })

  t.test('get users list with two levels of dependencies', (t) => {
    t.plan(1)
    client.get({ paths: [{ what: ["test", "users"], more: [
      {
        schema: [["test", "user", { user : { identity: true } }]],
        more: [{
          schema: [["test", "role", { role: { property: "role" } }]]
        }]
      }
    ]}]}).then(res => {
      t.deepEqual(res, [
        { "what": [ "test",  "users" ],
          "data": [ 0, 1, 2, 3 ]
        },
        { "what": [ "test", "user", { "user": 0 } ],
          "data": { "id": 0, "name": "test1", "role": 0 }
        },
        { "what": [ "test", "user", { "user": 1 } ],
          "data": { "id": 1, "name": "test2", "role": 1 }
        },
        { "what": [ "test", "user", { "user": 2} ],
          "data": { "id": 2, "name": "test3", "role": 1}
        },
        { "what": [ "test", "user", { "user": 3 } ],
          "data": { "id": 3, "name": "test4", "role": 1}
        },
        { "what": [ "test", "role", { "role": 0 } ],
          "data": { "id": 0, "name": "admin" }
        },
        { "what": [ "test", "role", { "role": 1 } ],
          "data": { "id": 1, "name": "user" }
        }
      ], "got object with dependencies")
    })
  })

  t.test('get projects by user and language', (t) => {
    t.plan(1)
    client.get({
      paths: [
        { schema: [['test', 'userProjectsByLanguage', { object: {
          user: { source: ['test', 'me'], schema: { property: 'id' } },
          language: { source: ['test', 'languageByName', { object: { name: 'js' } }], schema: { property: 'id' } }
        }}]] }
      ]
    }).then(res => {
      t.deepEqual(res, [
        { "what": [ "test", "me" ],
          "data": { id: 0, name: 'test1', role: 0 } },
        { "what": [ "test", "languageByName", { "name": "js" } ],
          "data": { id: 0, name: 'js' }  },
        { "what": [ "test", "userProjectsByLanguage", { "user": 0, "language": 0 } ],
          "data": [ 0 ] }
      ])
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