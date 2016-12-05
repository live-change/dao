
class Observable {
  constructor() {
    this.observers = []
  }

  fireObserver(observer, signal, ...args) {
    if(typeof observer == 'function') observer(signal, ...args)
    if(observer.notify) {
      return observer.notify(signal, ...args)
    }
    observer[signal](...args)
  }

  fireObservers(signal, ...args) {
    for(var observer of this.observers) this.fireObserver(observer, signal, ...args)
  }

  observe(observer) {
    this.observers.push(observer)
  }
  unobserve(observer) {
    this.observers.splice(this.observers.indexOf(observer), 1)
    if(this.isUseless()) this.dispose()
  }
  
  isUseless() {
    return this.observers.length == 0
  }
  
  dispose() {
    
  }
}

export default Observable
