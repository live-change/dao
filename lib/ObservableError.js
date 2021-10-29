const Observable = require("./Observable.js")

class ObservableError extends Observable {
  constructor(error) {
    super()
    this.error = error
  }

  observe(observer) {
    this.fireObserver(observer, 'error', this.error)
  }
  unobserve(observer) {
  }

  wait() {
    return Promise.reject(this.error)
  }
}

module.exports = ObservableError
