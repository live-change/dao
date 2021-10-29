const debug = require('debug')('dao')
const Observable = require("./Observable.js")

class ObservableProxy extends Observable {
  constructor(observable) {
    super()
    this.disposed = true
    this.observer = (signal, ...args) => {
      //console.log("PROXY OBSERVER SIGNAL", signal, ...args)
      this.fireObservers(signal, ...args)
    }
    this.properties = []
    this.errorProperties = []
    this.setTarget(observable)
  }

  setTarget(observable) {
    if(!this.disposed && this.observable) {
      this.observable.unobserve(this.observer)
      for(let [object, property] of this.properties) {
        this.observable.unbindProperty(object, property)
      }
      for(let [object, property] of this.errorProperties) {
        this.observable.unbindErrorProperty(object,property)
      }
    }
    this.observable = observable
    if(!this.disposed && this.observable) {
      this.observable.observe(this.observer)
      for(let [object, property] of this.properties) {
        this.observable.bindProperty(object, property)
      }
      for(let [object, property] of this.errorProperties) {
        this.observable.bindErrorProperty(object,property)
      }
    }
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

  isUseless() {
    return (this.observers.length == 0) && (this.properties.length == 0)
        && (this.errorProperties.length == 0)
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

  bindProperty(object, property) {
    if(this.isDisposed()) this.respawn()
    this.properties.push([object, property])
    if(this.observable) this.observable.bindProperty(object, property)
  }
  unbindProperty(object, property) {
    for(var i = 0; i < this.properties.length; i++) {
      var prop = this.properties[i]
      if(prop[0] == object && prop[1] == property) {
        this.properties.splice(i,1)
        if(this.observable) this.observable.unbindProperty(object, property)
        if(this.isUseless()) this.dispose()
        return
      }
    }
    throw new Error("cannot unbind not bound property "+property)
  }

  bindErrorProperty(object, property) {
    if(this.isDisposed()) this.respawn()
    this.errorProperties.push([object, property])
    if(this.observable) this.observable.bindErrorProperty(object, property)
  }
  unbindErrorProperty(object, property) {
    for(var i = 0; i < this.errorProperties.length; i++) {
      var prop = this.errorProperties[i]
      if(prop[0] == object && prop[1] == property) {
        this.errorProperties.splice(i,1)
        if(this.observable) this.observable.unbindErrorProperty(object, property)
        if(this.isUseless()) this.dispose()
        return
      }
    }
    throw new Error("cannot unbind not bound property "+property)
  }
  getValue() {
    if(!this.observable) return undefined
    return this.observable.getValue()
  }

}

module.exports = ObservableProxy
