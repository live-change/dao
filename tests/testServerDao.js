const ReactiveDao = require("../index.js")

let timeObservable = new ReactiveDao.ObservableValue(Date.now());
let clicksObservable = new ReactiveDao.ObservableList([]);

setInterval(() => {
  timeObservable.set(Date.now())
  clicksObservable.push('click at '+(new Date()))
  if( clicksObservable.list.length > 5 ) clicksObservable.shift()
}, 50)


function generator(sessionId) {
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
          }
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
