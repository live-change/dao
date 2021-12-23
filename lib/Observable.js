const debug = require('debug')('dao')

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
    const observersToFire = this.observers.slice()
    for(const observer of observersToFire) {
      handled = this.fireObserver(observer, signal, ...args) || handled
    }
    if(signal == 'error') {
      let error = args[0]
      handled = this.handleError(error) || handled
      if(!handled) debug("Unhandled observable error: "+ (error.message || error))
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

  uncatch(errorObserver) {
    let id = this.errorObservers.indexOf(errorObserver)
    if(id == -1) throw new Error("error observer not found")
    this.errorObservers.splice(id, 1)
  }

  observe(observer) {
    this.observers.push(observer)
    if(this.isDisposed()) this.respawn()
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

  useCount() {
    return this.observers.length
  }

  getValue() {
    return undefined
  }

  wait() {
    let finished = false
    let resultObserver
    let errorObserver

    const waitPromise = new Promise((resolve, reject) => {
      errorObserver = (error) => {
        if(resultObserver) this.unobserve(resultObserver)
        resultObserver = undefined
        if(errorObserver) this.uncatch(errorObserver)
        errorObserver = undefined
        if(finished) return
        finished = true
        reject(error)
      }
      if(!finished) this.catch(errorObserver)
      resultObserver = (signal) => {
        if(resultObserver) this.unobserve(resultObserver)
        resultObserver = undefined
        if(errorObserver) this.uncatch(errorObserver)
        errorObserver = undefined
        if(finished) return
        finished = true
        resolve(signal)
      }
      if(!finished) this.observe(resultObserver)
    })
    waitPromise.cancel = () => {
      this.unobserve(resultObserver)
      resultObserver = undefined
      this.uncatch(errorObserver)
      errorObserver = undefined
      if(finished) return
      finished = true
      reject('canceled')
    }
    return waitPromise
  }
}

module.exports = Observable
