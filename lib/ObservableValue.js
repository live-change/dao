const Observable = require("./Observable.js")

class ObservableValue extends Observable {
  constructor(value) {
    super()
    this.savedError = null
    this.value = value
    this.properties = []
    this.errorProperties = []
  }

  observe(observer) {
    if(this.isDisposed()) this.respawn()
    this.observers.push(observer)
    if(this.savedError) return this.fireObserver(observer, 'error', this.savedError)
    if(typeof this.value != 'undefined') this.fireObserver(observer, 'set', this.value)
  }

  set(value) {
    if(value === this.value) return;
    try {
      if (JSON.stringify(value) == JSON.stringify(this.value)) return;
    } catch(e) {}
    this.value = value
    this.fireObservers('set', value)
    for(const [object, property] of this.properties) {
      object[property] = value
    }
  }

  bindProperty(object, property) {
    if(this.isDisposed()) this.respawn()
    this.properties.push([object, property])
    if(this.value !== undefined) object[property] = this.value
  }
  unbindProperty(object, property) {
    for(let i = 0; i < this.properties.length; i++) {
      var prop = this.properties[i]
      if(prop[0] == object && prop[1] == property) {
        this.properties.splice(i,1)
        if(this.isUseless()) this.dispose()
        return;
      }
    }
    throw new Error("cannot unbind not bound property "+property)
  }

  bindErrorProperty(object, property) {
    if(this.isDisposed()) this.respawn()
    this.errorProperties.push([object, property])
    if(this.savedError !== undefined) object[property] = this.savedError
  }
  unbindErrorProperty(object, property) {
    for(var i = 0; i < this.errorProperties.length; i++) {
      var prop = this.errorProperties[i]
      if(prop[0] == object && prop[1] == property) {
        this.errorProperties.splice(i,1)
        if(this.isUseless()) this.dispose()
        return;
      }
    }
    throw new Error("cannot unbind not bound property "+property)
  }

  handleError(error) {
    this.savedError = error
    let handled = super.handleError(error)
    for(var [object, property] of this.errorProperties) {
      handled = true
      object[property] = error
    }
    return handled
  }

  isUseless() {
    return (this.observers.length == 0) && (this.properties.length == 0)
        && (this.errorProperties.length == 0)
  }

  save() {
    return this.value
  }
  restore(value) {
    this.set(value)
  }
  isInitialized() {
    return (typeof this.value !== 'undefined')
  }

  next(fun) {
    let obs = new ObservableValue(null)
    function setRetPromised(ret) {
      if (!ret || (typeof ret != 'object')) return obs.set(ret)
      if (ret.then) {
        return ret.then(
          result => setRet(result)
        ).catch(
          error => obs.error(error)
        )
      }
      obs.set(ret)
    }

    let resultObservable
    let resultObserver = (signal, ...args) => {
      obs[signal](...args)
    }

    function setRet(ret) {
      if (!ret || (typeof ret != 'object')) {
        if(resultObservable) {
          resultObservable.unobserve(resultObserver)
          resultObservable = null
        }
        obs.set(ret)
        return
      }
      if(ret.observe) {
        if(resultObservable) resultObservable.unobserve(resultObserver)
        resultObservable = ret
        resultObservable.observe(resultObserver)
        return;
      } else {
        if(resultObservable) {
          resultObservable.unobserve(resultObserver)
          resultObservable = null
        }
      }
      if (ret.then) {
        return ret.then(
          result => setRetPromised(result)
        ).catch(
          error => obs.error(error)
        )
      }
      obs.set(ret)
    }
    setRet(fun(this.value))
    let oldDispose = obs.dispose
    let oldRespawn = obs.respawn
    obs.dispose = () => {
      oldDispose.call(obs)
      this.unobserve(observer)
      if(resultObservable) resultObservable.unobserve(resultObserver)
    }
    obs.respawn = () => {
      oldRespawn.call(obs)
      this.observe(observer)
      if(resultObservable) resultObservable.observe(resultObserver)
    }
    let observer = (signal) => setRet(fun(this.value))
    this.observe(observer)
    return obs
  }

  useCount() {
    return this.observers.length + this.properties.length
  }

  getValue() {
    return this.value
  }

  getError() {
    return this.savedError
  }
}

module.exports = ObservableValue
