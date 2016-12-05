class ReactiveCache {

  constructor(dao, mode) {
    this.dao = dao
    this.cache = new Map()
    this.mode = mode
  }
  
  setCache(data) {
    this.cache = new Map(data)
  }

  observable(what) {
    var observable = this.dao.observable(what)
    if(observable.isInitialized()) {
      if(this.mode == 'save') {
        var cacheKey = JSON.stringify(what)
        this.cache.set(cacheKey, observable.save())
      }
      return observable
    }
    if(this.mode == 'load') {
      var cacheKey = JSON.stringify(what)
      if (this.cache.has(cacheKey)) observable.restore(this.cache.get(cacheKey))
    }
    return observable
  }
  
  get(what) {
    if(this.mode == 'load') {
      var cacheKey = JSON.stringify(what)
      if (this.cache.has(cacheKey)) {
        var value = this.cache.get(cacheKey)
        return new Promise((resolve, reject) => resolve(value))
      }
    }
    var promise = this.dao.get(what)
    if(this.mode == 'save') {
      var cacheKey = JSON.stringify(what)
      promise.then(result => this.cache.set(cacheKey,result))
    }
    return promise
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

export default ReactiveCache