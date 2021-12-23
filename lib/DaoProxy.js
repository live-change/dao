const EventEmitter = require("./EventEmitter.js")
const ObservableProxy = require("./ObservableProxy.js")

class DaoProxy extends EventEmitter {
  constructor(dao) {
    super()
    this.observables = new Map()

    this.onConnect = (...args) => this.emit('connect', ...args)
    this.onDisconnect = (...args) => this.emit('disconnect', ...args)

    this.setDao(dao)
  }

  setDao(dao) {
    if(this.dao && this.dao.removeListener) {
      this.dao.removeListener('connect', this.onConnect)
      this.dao.removeListener('disconnect', this.onDisconnect)
    }
    this.dao = dao
    if(this.dao) {
      for(let [id, observable] of this.observables.entries()) {
        if(!observable.disposed) {
          let what = JSON.parse(id)
          const target = this.dao.observable(what)
          observable.setTarget(target)
        }
      }
      if(this.dao.on) {
        this.dao.on('connect', this.onConnect)
        this.dao.on('disconnect', this.onDisconnect)
      }
    } else {
      for(let [id, observable] of this.observables.entries()) {
        observable.setTarget(null)
      }
    }
  }

  observable(what) {
    const spath = JSON.stringify(what)
    let observable = this.observables.get(spath)
    if(observable) return observable
    if(this.dao) {
      const target = this.dao.observable(what)
      observable = new ObservableProxy(target)
    } else {
      observable = new ObservableProxy()
    }
    const oldDispose = observable.dispose
    observable.dispose = (...args) => {
      this.observables.delete(spath)
      oldDispose.call(observable, ...args)
    }
    const oldRespawn = observable.respawn
    observable.respawn = (...args) => {
      const newObservable = this.observables.get(spath)
      if(newObservable && newObservable !== observable) {
        observable.observable = newObservable
      } else if(this.dao) {
        observable.observable = this.dao.observable(what)
      } else {
        observable.observable = null
      }
      oldRespawn.call(observable, ...args)
    }
    this.observables.set(JSON.stringify(what), observable)
    return observable
  }

  get(what) {
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
    for(let observable of this.observables.values()) {
      observable.dispose()
    }
    this.dao.dispose()
  }
}

module.exports = DaoProxy
