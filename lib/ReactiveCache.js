const debug = require('debug')('reactive-dao:cache')
const ObservableValue = require("./ObservableValue.js")
const ObservablePromiseProxy = require("./ObservablePromiseProxy.js")

class ReactiveCache {

  constructor(dao, mode) {
    this.dao = dao
    this.cache = new Map()
    this.mode = mode
    this.observables = new Map()
  }
  
  setCache(data) {
    this.cache = new Map(data)
  }

  observable(what) {
    const cacheKey = JSON.stringify(what)
    debug("OBSERVABLE", cacheKey)
    let observable = this.observables.get(cacheKey)
    if(observable) return observable
    if(this.mode == 'save') {
      observable = new ObservableValue()
      //this.get(what).then(value => obs.set(value)).catch(error => observable.error(error))
    } else {
      observable = this.dao.observable(what)
    }
    this.observables.set(cacheKey, observable)
    if (this.cache.has(cacheKey)) observable.restore(this.cache.get(cacheKey))
    if(observable.isInitialized()) {
      if(this.mode == 'save') {
        this.cache.set(cacheKey, observable.save())
      }
      return observable
    }
    if(this.mode == 'load') {
      //if (this.cache.has(cacheKey)) observable.restore(this.cache.get(cacheKey))
    }
    return observable
  }
  
  get(what) {
    const cacheKey = JSON.stringify(what)
    debug("GET", cacheKey)
    if (this.cache.has(cacheKey)) {
      const value = this.cache.get(cacheKey)
      return Promise.resolve(value)
    }
    if(this.mode == 'load') {
    }
    const promise = this.dao.get(what)
    if(this.mode == 'save') {
      promise.then(result => {
        let observable = this.observables.get(cacheKey)
        if(observable) {
          if(typeof observable == 'function') return observable('set', result)
          if(observable.notify) {
            return observable.notify('set', result)
          }
          observable.set(result)
        }
        this.cache.set(cacheKey, result)
      })
    }
    return promise
  }

  set(what, value) {
    const cacheKey = JSON.stringify(what)
    let observable = this.observables.get(cacheKey)
    if(observable) {
      if(typeof observable == 'function') return observable('set', value)
      if(observable.notify) {
        return observable.notify('set', value)
      }
      observable.set(value)
    }
    this.cache.set(cacheKey, value)
  }

  cacheData() {
    return Array.from(this.cache.entries())
  }

  request(method, ...args) {
    return this.dao.request(method, ...args)
  }

  event(method, ...args) {
    return this.dao.event(method, ...args)
  }

}

module.exports = ReactiveCache