const Observable = require("./Observable.js")
const ObservableValue = require("./ObservableValue.js")

class ObservablePromiseProxy extends Observable {
  constructor(promise) {
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
    })
  }

  init(observable) {
    this.observable = observable
    this.observable.observe(this.observer)
  }

  dispose() {
    this.disposed = true
    this.observable.unobserve(this.observer)
  }

  respawn() {
    this.disposed = false
    this.observable.observe(this.observer)
  }
}

module.exports = ObservablePromiseProxy
