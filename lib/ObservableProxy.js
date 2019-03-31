const debug = require('debug')('reactive-dao')
const Observable = require("./Observable.js")

class ObservableProxy extends Observable {
  constructor(observable) {
    super()
    this.disposed = true
    this.observer = (signal, ...args) => {
      this.fireObservers(signal, ...args)
    }
    this.setTarget(observable)
  }

  setTarget(observable) {
    if(!this.disposed && this.observable) this.observable.unobserve(this.observer)
    this.observable = observable
    if(!this.disposed && this.observable) this.observable.observe(this.observer)
  }

  dispose() {
    if(this.disposed) return
    this.disposed = true
    if(this.observable) this.observable.unobserve(this.observer)
  }

  respawn() {
    if(!this.disposed) return
    this.disposed = false
    if(this.observable) this.observable.observe(this.observer)
  }

  reobserveTarget() {
    if(!this.disposed && this.observable) {
      this.observable.unobserve(this.observer)
      this.observable.observe(this.observer)
    }
  }

  catch(...args) {
    let beenDisposed = this.disposed
    Observable.prototype.catch.apply(this, args)
    if(!beenDisposed) this.reobserveTarget()
  }

  observe(...args) {
    let beenDisposed = this.disposed
    Observable.prototype.observe.apply(this, args)
    if(!beenDisposed) this.reobserveTarget()
  }

}

module.exports = ObservableProxy
