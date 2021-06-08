const test = require('blue-tape')
const testServerDao = require('./testServerDao.js')
const ReactiveDao = require("../index.js")
const LoopbackConnection = require('../lib/LoopbackConnection.js')

test("observe more", (t) => {
  t.plan(6)
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

  t.test('observe and unobserve users list with no dependencies', (t) => {
    t.plan(2)
    let observable
    let observer
    t.test('observe users list with no dependencies', (t) => {
      t.plan(2)
      observable = client.observable({ paths: [{ what: ["test", "users"] }]}, ReactiveDao.ObservableList)
      observer = {
        set(paths) {
          t.pass(`got paths ${paths.map(p=>JSON.stringify(p))}`)
          setTimeout(() => {
            for(let path of paths) {
              if( client.observations.get(JSON.stringify(path)) ) t.pass(`path ${JSON.stringify(path)} pushed`)
              else t.fail(`path ${JSON.stringify(path)} not pushed`)
            }
          }, 50)
        }
      }
      observable.observe(observer)
    })
    t.test('unobserve users list with no dependencies', (t) => {
      t.plan(1)
      observable.unobserve(observer)
      setTimeout(() => {
        if(!client.observations.get(JSON.stringify(["test", "users"]))) t.pass('unobserved')
          else t.fail('still observed')
      }, 200)
    })
  })

  t.test('test observation of users list with one level of dependencies', (t) => {
    t.plan(4)
    let observable
    let observer
    t.test('observe users list with one level of dependencies', (t) => {
      t.plan(6)
      observable = client.observable({ paths: [{ what: ["test", "users"], more: [
              { schema: [["test", "user", { user : { identity: true } }]] }
            ]}]}, ReactiveDao.ObservableList)
      observer = {
        set(paths) {
          t.pass(`got paths ${paths.map(p=>JSON.stringify(p))}`)
          setTimeout(() => {
            for(let path of paths) {
              if( client.observations.get(JSON.stringify(path)) ) t.pass(`path ${JSON.stringify(path)} pushed`)
                else t.fail(`path ${JSON.stringify(path)} not pushed`)
            }
          }, 50)
        }
      }
      observable.observe(observer)
    })

    t.test('add single user', (t) => {
      t.plan(3)
      observer.push = (path) => {
        t.pass("push added")
        setTimeout(() => {
          if( client.observations.get(JSON.stringify(path)) ) t.pass(`path ${JSON.stringify(path)} pushed`)
            else t.fail(`path ${JSON.stringify(path)} not pushed`)
        }, 50)
      }
      client.request(['test', 'addUser'], 'new1', 1)
          .then(added => t.pass("user added"))
          .catch(err => t.fail("user add error "+err))
    })

    t.test('remove single user', (t) => {
      t.plan(3)
      observer.remove = (path) => {
        t.pass("push removed")
        setTimeout(() => {
          if( !client.observations.get(JSON.stringify(path)) ) t.pass(`path ${JSON.stringify(path)} not pushed`)
          else t.fail(`path ${JSON.stringify(path)} still pushed`)
        }, 200)
      }
      client.request(['test', 'removeUser'], 4)
          .then(added => t.pass("user removed"))
          .catch(err => t.fail("user remove error "+err))
    })

    t.test('unobserve users list with one level of dependencies', (t) => {
      t.plan(5)
      observable.unobserve(observer)
      setTimeout(() => {
        if(!client.observations.get(JSON.stringify(["test", "users"]))) t.pass('unobserved')
        else t.fail('still observed')
        for(let id of [0,1,2,3]) {
          if (!client.observations.get(JSON.stringify(["test", "user", {user: id}]))) t.pass('unobserved')
          else t.fail('still observed')
        }
      }, 200)
    })

  })

  t.test('test observation of users list with two levels of dependencies', (t) => {
    t.plan(3)
    let observable
    let observer
    t.test('observe users list with two levels of dependencies', (t) => {
      t.plan(8)
      observable = client.observable({
        paths: [{ what: ["test", "users"], more: [
          {
            schema: [["test", "user", { user : { identity: true } }]],
            more: [{
              schema: [["test", "role", { role: { property: "role" } }]]
            }]
          }
        ]}]
      }, ReactiveDao.ObservableList)
      observer = {
        set(paths) {
          t.pass(`got paths ${paths.map(p => JSON.stringify(p))}`)
          setTimeout(() => {
            for (let path of paths) {
              if (client.observations.get(JSON.stringify(path))) t.pass(`path ${JSON.stringify(path)} pushed`)
              else t.fail(`path ${JSON.stringify(path)} not pushed`)
            }
          }, 50)
        }
      }
      observable.observe(observer)
    })

    t.test('add single user', (t) => {
      t.plan(5)
      observer.push = (path) => {
        t.pass("push added")
        setTimeout(() => {
          if( client.observations.get(JSON.stringify(path)) ) t.pass(`path ${JSON.stringify(path)} pushed`)
          else t.fail(`path ${JSON.stringify(path)} not pushed`)
        }, 50)
      }
      client.request(['test', 'addUser'], 'new1', 2)
          .then(added => t.pass("user added"))
          .catch(err => t.fail("user add error "+err))
    })

    t.test('remove single user', (t) => {
      t.plan(5)
      observer.remove = (path) => {
        t.pass("push removed")
        setTimeout(() => {
          if( !client.observations.get(JSON.stringify(path)) ) t.pass(`path ${JSON.stringify(path)} not pushed`)
          else t.fail(`path ${JSON.stringify(path)} still pushed`)
        }, 200)
      }
      client.request(['test', 'removeUser'], 4)
          .then(added => t.pass("user removed"))
          .catch(err => t.fail("user remove error "+err))
    })

  })

  t.test('test observation of projects by user and language', (t) => {
    t.plan(1)
    let observable
    let observer

    t.test('observe projects by user and language', (t) => {
      t.plan(4)
      observable = client.observable({
        paths: [
          { schema: [['test', 'userProjectsByLanguage', { object: {
                user: { source: ['test', 'me'], schema: { property: 'id' } },
                language: { source: ['test', 'languageByName', { object: { name: 'js' } }], schema: { property: 'id' } }
              }}]] }
        ]
      }, ReactiveDao.ObservableList)
      const checkPointers = () => {
        const paths = observable.list
        t.pass(`got paths ${paths.map(p => JSON.stringify(p))}`)
        setTimeout(() => {
          for (let path of paths) {
            if (client.observations.get(JSON.stringify(path))) t.pass(`path ${JSON.stringify(path)} pushed`)
            else t.fail(`path ${JSON.stringify(path)} not pushed`)
          }
        }, 50)
      }
      observer = {
        set(paths) {
          if(observable.list.length == 3) checkPointers()
        },
        push(path) {
          if(observable.list.length == 3) checkPointers()
        }
      }
      observable.observe(observer)
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