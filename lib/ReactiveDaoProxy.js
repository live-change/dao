const EventEmitter = require("./EventEmitter.js")
const ObservableProxy = require("./ObservableProxy.js")

class ReactiveDaoProxy extends EventEmitter {
  constructor(dao) {
    super()
    this.observables = new Map()

    this.onConnect = (...args) => this.emit('connect', ...args)
    this.onDisconnect = (...args) => this.emit('disconnect', ...args)

    setDao(dao)
  }

  setDao(dao) {
    if(this.dao) {
      dao.removeEventListener('connect', this.onConnect)
      dao.removeEventListener('disconnect', this.onDisconnect)
    }
    this.dao = dao
    if(this.dao) {
      for(let [id, observable] of this.observables.entries()) {
        let what = JSON.parse(id)
        const target = this.dao.observable(what)
        observable.set(target)
      }
      dao.on('connect', this.onConnect)
      dao.on('disconnect', this.onDisconnect)
    }
  }

  observable(what) {
    let observable = this.observables.get(JSON.stringify(what))
    if(observable) return observable
    const target = this.dao.observable(what)
    observable = new ObservableProxy(target)
    this.observables.set(JSON.stringify(what), observable)
    return observable
  }

  get(what) {
    return this.dao.get(what)
  }

  request(method, ...args) {
    return this.dao.request(what, ...args)
  }

  event(method, ...args) {
    return this.dao.request(event, ...args)
  }

  dispose() {
    for(let observable of this.observables.values()) {
      observable.dispose()
    }
    this.dao.dispose()
  }
}

module.exports = ReactiveDaoProxy
