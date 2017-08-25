
class Observable {
  constructor() {
    this.observers = []
    this.errorObservers = []
    this.disposed = false
  }

  fireObserver(observer, signal, ...args) {
    if(typeof observer == 'function') return observer(signal, ...args)
    if(observer.notify) {
      return observer.notify(signal, ...args)
    }
    observer[signal](...args)
    return true
  }

  fireObservers(signal, ...args) {
    let handled = false
    for(var observer of this.observers) handled = handled || this.fireObserver(observer, signal, ...args)
    if(signal == 'error') {
      handled = handled || this.handleError(signal, ..args)
      if(!handled) console.error("Unhandled observable error: "+ (error.message || eerror))
    }
  }

  handleError(signal, error) {
    let handled = false
    for (var observer of this.errorObservers) {
      handled = true
      observer(error)
    }
    return handled
  }

  error(error) {
    fireObservers("error", error)
  }

  catch(errorObserver) {
    this.errorObservers.push(errorObserver)
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
