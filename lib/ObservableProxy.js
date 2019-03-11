const debug = require('debug')('reactive-dao')
const Observable = require("./Observable.js")

class ObservableProxy extends Observable {
  constructor(observable) {
    super()
    this.observable = observable
    this.observer = (signal, ...args) => {
      this.fireObservers(signal, ...args)
    }
  }

  setTarget(observable) {
    if(!this.disposed && this.observable) this.observable.unobserve(this.observer())
    this.observable = observable
    if(!this.disposed && this.observable) this.observable.observe(this.observer)
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

module.exports = ObservableProxy
