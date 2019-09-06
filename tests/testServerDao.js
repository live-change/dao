const ReactiveDao = require("../index.js")

let timeObservable = new ReactiveDao.ObservableValue(Date.now())
let clicksObservable = new ReactiveDao.ObservableList([])

class ObservableCounter extends ReactiveDao.ObservableValue {
  constructor(v) {
    super(v)
  }
  inc() {
    this.value++
    this.fireObservers('inc')
  }
}
let counterObservable = new ObservableCounter(0)

setInterval(() => {
  timeObservable.set(Date.now())
  clicksObservable.push('click at '+(new Date()))
  if( clicksObservable.list.length > 5 ) clicksObservable.shift()
}, 50)

const roles = [
  {
    id: 0,
    name: "admin"
  },
  {
    id: 1,
    name: "user"
  },
  {
    id: 2,
    name: "tester"
  }
]

const users = [
  {
    id: 0,
    name: "test1",
    role: 0
  },
  {
    id: 1,
    name: "test2",
    role: 1
  },
  {
    id: 2,
    name: "test3",
    role: 1
  },
  {
    id: 3,
    name: "test4",
    role: 1
  }
]

const userIds = new ReactiveDao.ObservableList(users.map(u => u.id))
const userObservables = users.map(u => new ReactiveDao.ObservableValue(u))
const roleObservables = roles.map(r => new ReactiveDao.ObservableValue(r))

function generator(sessionId) {
  console.log("CREATE DAO")
  return new ReactiveDao(sessionId, {
    test: {
      type: "local",
      source: new ReactiveDao.SimpleDao({
        values: {
          sessionId: {
            observable() {
              return new ReactiveDao.ObservableValue(sessionId)
            },
            get() {
              return new Promise((resolve, reject) => resolve(sessionId))
            }
          },
          time: {
            observable() {
              return timeObservable;
            },
            get() {
              return new Promise((resolve, reject) => resolve(Date.now()))
            }
          },
          clicks: {
            observable() {
              return clicksObservable
            },
            get() {
              return new Promise((resolve, reject) => clicksObservable.list)
            }
          },
          promisedTime: {
            observable() {
              return new Promise((resolve,reject) => resolve(timeObservable))
            },
            get() {
              return new Promise((resolve, reject) => resolve(Date.now()))
            }
          },
          instaError: {
            observable() {
              throw new Error("error")
            },
            get() {
              throw new Error("error")
            }
          },
          promisedError: {
            observable() {
              return new Promise((resolve, reject) => reject("error"))
            },
            get() {
              return new Promise((resolve, reject) => reject("error"))
            }
          },
          counter: {
            observable() {
              return counterObservable
            },
            get() {
              return counterObservable.value
            }
          },
          users: {
            observable() {
              return userIds
            },
            get() {
              return Promise.resolve(userIds.list)
            }
          },
          user: {
            observable({ user }) {
              return userObservables[user]
            },
            get({ user }) {
              return Promise.resolve(users[user])
            }
          },
          role: {
            observable({ role }) {
              return roleObservables[role]
            },
            get({ role }) {
              return Promise.resolve(roles[role])
            }
          }
        },
        methods: {
          addUser(name, role) {
            const user = { id: users.length, name, role }
            userObservables.push(new ReactiveDao.ObservableValue(user))
            users.push(user)
            userIds.push(user.id)
          },
          removeUser(id) {
            userIds.remove(id)
            users.splice(id, 1)
            userObservables.splice(id, 1)
          },
          increment: () => {
            counterObservable.inc()
          },
          reset: () => {
            counterObservable.set(0)
          },
          logout: () => console.log('logout action')
        }
      })
    }
  })
}

module.exports.instant = generator

module.exports.promised = (sessionId) => new Promise((resolve, reject) => {
  setTimeout(() => resolve(generator(sessionId)), 50)
})

module.exports.failedPromise = (sessionId) => new Promise((resolve, reject) => {
  setTimeout(() => reject("error"))
})

module.exports.failed = (sessionId) => { throw new Error("error") }

module.exports.ObservableCounter = ObservableCounter
