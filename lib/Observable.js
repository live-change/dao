
class Observable {
  constructor() {
    this.observers = []
    this.disposed = false
  }

  fireObserver(observer, signal, ...args) {
    if(typeof observer == 'function') return observer(signal, ...args)
    if(observer.notify) {
      return observer.notify(signal, ...args)
    }
    observer[signal](...args)
  }

  fireObservers(signal, ...args) {
    for(var observer of this.observers) this.fireObserver(observer, signal, ...args)
  }

  observe(observer) {
    if(this.isDisposed()) this.respawn()
    this.observers.push(observer)
  }
  unobserve(observer) {
    this.observers.splice(this.observers.indexOf(observer), 1)
    if(this.isUseless()) this.dispose()
  }
  
  isUseless() {
    return this.observers.length == 0
  }

  isDisposed() {
    return this.disposed
  }
  
  dispose() {
    this.disposed = true
  }
  
  respawn() {
    this.disposed = false
  }
}

module.exports = Observable
