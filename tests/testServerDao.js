const ReactiveDao = require("../index.js")

let timeObservable = new ReactiveDao.ObservableValue(Date.now());
let clicksObservable = new ReactiveDao.ObservableList([]);

setInterval(() => {
  timeObservable.set(Date.now())
  clicksObservable.push('click at '+(new Date()))
  if( clicksObservable.list.length > 5 ) clicksObservable.shift()
}, 50)


function generator(sessionId, ip) {
  return new ReactiveDao(sessionId, ip, {
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
          }
        },
        methods: {
          logout: () => revs.command("session", "logout", { sessionId, ip })
        }
      })
    }
  })
}

module.exports.instant = generator
module.exports.promised = (sessionId, ip) => new Promise((resolve, reject) => {
  setTimeout(() => resolve(generator()), 50)
})

module.exports.failedPromise = (sessionId, ip) => new Promise((resolve, reject) => {
  setTimeout(() => reject("error"))
})
