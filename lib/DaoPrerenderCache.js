const debug = require('debug')('reactive-dao:cache')
const ObservableValue = require("./ObservableValue.js")

class DaoPrerenderCache {

  constructor(dao, mode) {
    this.dao = dao
    this.cache = new Map()
    this.extendedCache = new Map()
    this.mode = mode
    this.observables = new Map()
  }

  setCache(data) {
    this.cache = new Map(data)
    for(const [keyJson, value] of data) {
      const key = JSON.parse(keyJson)
      if(key.paths) {
        for(const { what, data } of value) {
          this.extendedCache.set(JSON.stringify(what), data)
        }
      }
    }
    for(const [what, observable] of this.observables.entries()) {
      if(observable.isDisposed()) {
        observable.set(this.cache.get(what))
      }
    }
    this.observables.clear()
  }

  observable(what) {
    const cacheKey = JSON.stringify(what)
    debug("OBSERVABLE", cacheKey, "MODE", this.mode)
    let observable = this.observables.get(cacheKey)
    if(observable) {
      debug("OBSERVABLE EXISTS", cacheKey)
      return observable
    }
    if(this.mode == 'save') {
      observable = new ObservableValue()
      this.get(what).then(value => observable.set(value)).catch(error => observable.error(error))
    } else {
      observable = this.dao.observable(what)
    }
    this.observables.set(cacheKey, observable)
    if(this.cache.has(cacheKey)) observable.restore(this.cache.get(cacheKey))
    if(this.extendedCache.has(cacheKey)) {
      observable.restore(this.extendedCache.get(cacheKey))
      return observable
      // do not save extended values
    }
    if(observable.isInitialized && observable.isInitialized()) {
      if(this.mode == 'save') {
        this.cache.set(cacheKey, observable.save())
      }
      return observable
    }
    if(this.mode == 'load') {
      // if (this.cache.has(cacheKey)) observable.restore(this.cache.get(cacheKey))
      // it was loaded earlier
    }
    return observable
  }

  get(what) {
    const cacheKey = JSON.stringify(what)
    debug("GET", cacheKey)
    if(this.cache.has(cacheKey)) {
      const value = this.cache.get(cacheKey)
      debug("GET FROM CACHE", cacheKey, " => ", value)
      return Promise.resolve(value)
    }
    if(this.extendedCache.has(cacheKey)) {
      const value = this.extendedCache.get(cacheKey)
      debug("GET FROM EXTENDED CACHE", cacheKey, " => ", value)
      return Promise.resolve(value)
    }
    if(this.mode == 'load') {
    }
    const promise = this.dao.get(what)
    if(this.mode == 'save') {
      if(!promise) throw new Error("GET NOT FOUND: "+what)
      promise.then(result => {
        let observable = this.observables.get(cacheKey)
        if(observable) {
          if(typeof observable == 'function') {
            observable('set', result)
          } else if(observable.notify) {
            observable.notify('set', result)
          } else {
            observable.set(result)
          }
        }
        this.cache.set(cacheKey, result)
        if(what.paths) {
          for(const { what, data } of result) {
            let observable = this.observables.get(cacheKey)
            if(observable) {
              if(typeof observable == 'function') {
                observable('set', data)
              } else if(observable.notify) {
                observable.notify('set', data)
              } else {
                observable.set(data)
              }
            }
            this.extendedCache.set(JSON.stringify(what), data)
          }
        }
      })
    }
    return promise
  }

  set(what, value) {
    const cacheKey = JSON.stringify(what)
    debug("SET CACHE", cacheKey, " => ", value)
    let observable = this.observables.get(cacheKey)
    if(observable) {
      if(typeof observable == 'function') return observable('set', value)
      if(observable.notify) {
        return observable.notify('set', value)
      }
      observable.set(value)
      debug("SET CACHE", cacheKey, " OBSERVABLE ", observable)
    }
    this.cache.set(cacheKey, value)
  }

  cacheData() {
    return Array.from(this.cache.entries())
  }

  request(method, ...args) {
    return this.dao.request(method, ...args)
  }

  requestWithSettings(settings, method, ...args) {
    return this.dao.requestWithSettings(settings, method, ...args)
  }

  event(method, ...args) {
    return this.dao.event(method, ...args)
  }

  clear() {
    console.log("CLEAR CACHE!")
    this.setCache([])
  }

}

module.exports = DaoPrerenderCache