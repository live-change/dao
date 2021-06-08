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

const languages = [
  {
    id: 0,
    name: 'js'
  },
  {
    id: 1,
    name: 'java'
  },
  {
    id: 2,
    name: 'cpp'
  }
]

const projects = [
  {
    id: 0,
    name: "reactive-dao",
    owner: 0,
    language: 0
  },
  {
    id: 1,
    name: "jvm",
    owner: 0,
    language: 1
  },
  {
    id: 2,
    name: "box2d",
    owner: 0,
    language: 2
  }
]

const userIds = new ReactiveDao.ObservableList(users.map(u => u.id))
const userObservables = users.map(u => new ReactiveDao.ObservableValue(u))
const roleObservables = roles.map(r => new ReactiveDao.ObservableValue(r))

const languageIds = new ReactiveDao.ObservableList(languages.map(u => u.id))
const languageObservables = languages.map(u => new ReactiveDao.ObservableValue(u))
const projectIds = new ReactiveDao.ObservableList(projects.map(u => u.id))
const projectObservables = projects.map(u => new ReactiveDao.ObservableValue(u))


function generator(credentials) {
  const { sessionId } = credentials
  console.log("CREATE DAO")
  return new ReactiveDao(credentials, {
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
          me: {
            observable() {
              return userObservables[0]
            },
            get() {
              return Promise.resolve(users[0])
            }
          },
          role: {
            observable({ role }) {
              return roleObservables[role]
            },
            get({ role }) {
              return Promise.resolve(roles[role])
            }
          }, 
          languages: {
            observable() {
              return languageIds
            },
            get() {
              return Promise.resolve(languageIds.list)
            }
          },
          language: {
            observable({ language }) {
              return languageObservables[language]
            },
            get({ language }) {
              return Promise.resolve(languages[language])
            }
          },
          languageByName: {
            observable({ name }) {
              const l = languages.find(l => l.name == name)
              return languageObservables[l.id]
            },
            get({ name }) {
              const l = languages.find(l => l.name == name)
              return Promise.resolve(l)
            }
          },
          projects: {
            observable() {
              return projectIds
            },
            get() {
              return Promise.resolve(projectIds.list)
            }
          },
          project: {
            observable({project}) {
              return projectObservables[project]
            },
            get({project}) {
              return Promise.resolve(projects[project])
            }
          },
          userProjectsByLanguage: {
            observable({ user, language }) {
              const foundProjects = projects.filter(p => p.owner == user && p.language == language ).map(p => p.id)
              return new ReactiveDao.Observable(foundProjects)
            },
            get({ user, language }) {
              const foundProjects = projects.filter(p => p.owner == user && p.language == language ).map(p => p.id)
              return Promise.resolve(foundProjects)
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

module.exports.promised = (credentials) => new Promise((resolve, reject) => {
  setTimeout(() => resolve(generator(credentials)), 50)
})

module.exports.failedPromise = (credentials) => new Promise((resolve, reject) => {
  setTimeout(() => reject("error"))
})

module.exports.failed = (credentials) => { throw new Error("error") }

module.exports.ObservableCounter = ObservableCounter
