
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
    if(observer[signal]) {
      observer[signal](...args)
      return true
    }
    return false
  }

  fireObservers(signal, ...args) {
    if(this.disposed) return
    let handled = false
    for(var observer of this.observers) handled = this.fireObserver(observer, signal, ...args) || handled 
    if(signal == 'error') {
      let error = args[0]
      handled = this.handleError(signal, error) || handled
      if(!handled) console.error("Unhandled observable error: "+ (error.message || error))
    }
  }

  handleError(error) {
    let handled = false
    for (var observer of this.errorObservers) {
      handled = true
      observer(error)
    }
    return handled
  }

  error(error) {
    this.fireObservers("error", error)
  }

  catch(errorObserver) {
    this.errorObservers.push(errorObserver)
  }

  observe(observer) {
    if(this.isDisposed()) this.respawn()
    this.observers.push(observer)
  }
  unobserve(observer) {
    let id = this.observers.indexOf(observer)
    if(id == -1) throw new Error("observer not found")
    this.observers.splice(id, 1)
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
