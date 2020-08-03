const Observable = require("./Observable.js")
const ObservableValue = require("./ObservableValue.js")
const ObservableError = require("./ObservableError.js")
const debug = require('debug')('dao')

class ObservablePromiseProxy extends Observable {
  constructor(promise, errorMapper = v => v) {
    super()
    this.observable = null
    this.observer = (signal, ...args) => {
      this.fireObservers(signal, ...args)
    }
    promise.then((result) => {
      if(result.observe) {
        this.init(result)
      } else {
        this.init(new ObservableValue(result))
      }
    }).catch((error) => {
      debug('ERROR ON OBSERVE', error)
      this.init(new ObservableError(errorMapper(error)))
    })
  }

  init(observable) {
    this.observable = observable
    if(!this.disposed) this.observable.observe(this.observer)
  }

  dispose() {
    this.disposed = true
    if(this.observable) this.observable.unobserve(this.observer)
  }

  respawn() {
    this.disposed = false
    if(this.observable) this.observable.observe(this.observer)
  }
}

module.exports = ObservablePromiseProxy
