const Observable = require("./Observable.js")
const ObservableValue = require("./ObservableValue.js")
const ObservableError = require("./ObservableError.js")

class ObservablePromiseProxy extends Observable {
  constructor(promise) {
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
      console.error('ERROR ON OBSERVE')
      console.error(error)
      this.init(new ObservableError(error))
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
