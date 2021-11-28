const EventEmitter = require("./EventEmitter.js")

class CacheState {
  constructor(cache, what, settings) {
    this.cache = cache
    this.what = what
    this.settings = settings
    this.cached = false
    this.observerCount = 0
    this.score = 0
    this.scoreTime = Date.now()
    this.observable = null
  }

  updateScore() {
    const minScore = this.minScore()
    //console.log("UPDATE SCORE", this.what, this.score, ">", minScore)
    if(this.score < minScore) {
      this.score = minScore
      return
    }
    const now = Date.now()
    const elapsedTime = now - this.scoreTime
    this.scoreTime = now
    let scoreOverMin = this.score - minScore
    scoreOverMin = scoreOverMin * Math.pow(1.0 - this.settings.fadeFactor, 0.001 * elapsedTime)
    this.score = minScore + scoreOverMin
    //console.log("UPDATED SCORE", this.what, this.score)
  }

  turnOff() {
    if(!this.cached) throw new Error("uncache of not cached")
    if(!this.observable) throw new Error("race condition")
    this.cached = false
    this.cache.cachedCount --
    const observable = this.observable
    this.observable = null
    observable.unobserve(this.cache.dummyObserver)
  }

  turnOn() {
    if(this.cached) throw new Error("already cached")
    if(this.observable) throw new Error("race condition")
    this.cached = true
    this.cache.cachedCount ++
    this.cache.cache.push(this)
    this.observable = this.cache.observable(this.what)
    this.observable.observe(this.cache.dummyObserver)
    if(this.cache.cachedCount >= this.cache.settings.cacheSize) this.cache.clean()
  }

  updateCacheState() {
    if(this.score < this.settings.minScore) {
      if(this.cached) {
        this.turnOff()
      }
      return
    }
    if(this.score > this.cache.cacheAddLevel) {
      if(!this.cached) {
        this.turnOn()
      }
    }
  }

  minScore() {
    const realObserversCount = this.cached ? this.observerCount-1 : this.observerCount
    const minScore = realObserversCount > 0 ? this.settings.firstObserverScore
        + (realObserversCount-1) * this.settings.observerScore : 0
    return minScore
  }

  noticeSingleRead() {
    this.updateScore()
    this.score += this.settings.singleReadScore
    this.updateCacheState()
  }

  setObserversCount(count, delta) {
    this.updateScore()
    this.observerCount = count
    const minScore = this.minScore()
    if(this.score < minScore) this.score = minScore
    if(delta > 0) {
      this.score += delta * this.settings.singleReadScore
    }
    setTimeout(() => this.updateCacheState(), 0)
  }
}

const defaultSettings = {
  cacheSize: 1000,
  cleanReductionFactor: 0.1, // clean will reduce cache size by 10%
  priority: 1,
  firstObserverScore: 1, // first observer
  observerScore: 0.2, // second and next observer
  singleReadScore: 0.5, // should be lower than minScore or everything will be cached at first read
  fadeFactor: 0.1, // 10% per second
  minScore: 0.7, // after reaching this point item will be removed even if cache is empty
  deleteStatsScore: 0.2,
  cleanInterval: 1000, // 1 second
  cacheAdaptationFactor: 0.5, // cache add adaptation factor
}

class DaoCache extends EventEmitter {
  constructor(dao, settings = {}) {
    super()
    this.dao = dao
    this.settings = {
      ...defaultSettings,
      ...settings,
      perObject: (what) => ({
        ...this.settings,
        ...(settings.perObject ? settings.perObject(what) : '')
      })
    }
    this.cacheAddLevel = this.settings.minScore // will be updated by clean

    this.cacheState = new Map()
    this.cachedCount = 0

    this.cache = []

    this.hitsCounter = 0
    this.missesCounter = 0
    this.hitsPerMinute = 0
    this.missesPerMinute = 0

    this.statsInterval = setInterval(() => this.computeStats(), 60*1000)

    this.onConnect = (...args) => this.emit('connect', ...args)
    this.onDisconnect = (...args) => this.emit('disconnect', ...args)

    this.interval = setInterval(()=>this.clean(), this.settings.cleanInterval)

    this.dummyObserver = () => 0
  }

  clear() {
    const now = Date.now()
    for(const cacheState of this.cache) {
      cacheState.score = 0
      cacheState.scoreTime = now
      if(cacheState.cached) cacheState.turnOff()
    }
    this.cache = []
  }

  clean() {
    //console.log("CACHE STATE:", this.cacheState)
    //if(this.cache.length < this.settings.cacheSize) return
    for(const cached of this.cache) {
      cached.updateScore()
    }
    this.cache.sort((a, b) => b.cached * b.score - a.cached * a.score)
    /*console.log("CACHE:")
    for(const cached of this.cache) {
      console.log("  # ", JSON.stringify(cached.what), cached.score, ">", cached.minScore())
    }*/
    const newSize = (this.settings.cacheSize * (1.0 - this.settings.cleanReductionFactor)) | 0
    const minScore = newSize < this.cache.length ? this.cache[newSize].score : this.settings.minScore
    this.cacheAddLevel = this.settings.minScore +
        (minScore + this.settings.minScore) * this.settings.cacheAdaptationFactor
    let deleteStart = Infinity
    for(let i = 0; i < this.cache.length; i++) {
      const cacheState = this.cache[i]
      if(cacheState.score < cacheState.settings.minScore && i < deleteStart) {
        deleteStart = i
      }
      if(i >= newSize) deleteStart = i
      if(i >= deleteStart && cacheState.cached) {
        cacheState.turnOff()
      }
    }
    if(deleteStart != Infinity) {
      this.cache.length = deleteStart
    }
    for(const [key, value] of this.cacheState.entries()) {
      if(value.score < value.settings.deleteStatsScore) {
        this.cacheState.delete(key)
      }
    }
  }

  getOrCreateCacheState(what) {
    const path = JSON.stringify(what)
    let cacheState = this.cacheState.get(path)
    if(!cacheState) {
      const settings = this.settings.perObject(what)
      if(settings === false) return false
      cacheState = new CacheState(this, what, settings)
      this.cacheState.set(path, cacheState)
    }
    return cacheState
  }

  noticeObserverCount(what, count, delta) {
    //console.log("OBSERVER COUNT", JSON.stringify(what), count, "D", delta)
    let cacheState = this.getOrCreateCacheState(what)
    if(!cacheState && delta <= 0) return
    cacheState = this.getOrCreateCacheState(what)
    if(delta > 0) {
      //console.log("CACHE TEST", cacheState.cached)
      if(cacheState.observable) {
        //console.log("CACHE HIT!", what)
        this.hitsCounter ++
      } else {
        //console.log("CACHE MISS!", what)
        this.missesCounter ++
      }
    }
    cacheState.setObserversCount(count, delta)
  }

  computeStats() {
    this.hitsPerMinute = this.hitsCounter
    this.missesPerMinute = this.missesCounter
    this.hitsCounter = 0
    this.missesCounter = 0
    console.log(`CACHE STATS hit rate ${this.hitsPerMinute/(this.hitsPerMinute+this.missesPerMinute)*100}%\n`+
        `  hits=${this.hitsPerMinute} misses=${this.missesPerMinute}`+
        ` cacheSize=${this.cachedCount} stats=${this.cacheState.size}`)
  }

  observable(what) {
    //console.log("CACHE OBSERVABLE", what)
    const observable = this.dao.observable(what)
    const oldObserve = observable.observe
    const oldUnobserve = observable.unobserve
    observable.observe = (...args) => {
      oldObserve.apply(observable, args)
      this.noticeObserverCount(what, observable.useCount(), 1)
    }
    observable.unobserve = (...args) => {
      oldUnobserve.apply(observable, args)
      this.noticeObserverCount(what, observable.useCount(), 0)
    }
    return observable
  }

  get(what) {
    //console.log("CACHE GET", what)
    const cacheState = this.getOrCreateCacheState(what)
    if(cacheState) {
      cacheState.noticeSingleRead()
      if(cacheState.observable) {
        const value = cacheState.observable.getValue()
        this.hitsCounter ++
        if(value !== undefined) return value
      }
      this.missesCounter ++
    }
    return this.dao.get(what)
  }

  request(method, ...args) {
    return this.dao.request(method, ...args)
  }

  requestWithSettings(settings, method, ...args) {
    return this.dao.requestWithSettings(settings, method, ...args)
  }

  event(method, ...args) {
    return this.dao.request(method, ...args)
  }

  dispose() {
    clear()
    clearInterval(this.interval)
    this.dao.dispose()
  }
}

module.exports = DaoCache
