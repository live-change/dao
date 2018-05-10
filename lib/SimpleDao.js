const ObservableValue = require("./ObservableValue.js")
const ObservablePromiseProxy = require("./ObservablePromiseProxy.js")
const ObservableError = require("./ObservableError.js")

class SimpleDao {

  constructor(defn) {
    this.defn = defn
  }

  observable(what) {
    let ret
    try {
      ret = this.defn.values[what[1]].observable(...(what.slice(2)))
      if (ret.observe) return ret
      if (ret.then) return new ObservablePromiseProxy(ret)
    } catch(e) {
      console.error('ERROR ON OBSERVE',  what)
      console.error(e)
      return new ObservableError(e.message || e)
    }
    return new ObservableValue(ret)
  }

  get(what) {
    return this.defn.values[what[1]].get(...(what.slice(2)))
  }

  request(what, ...args) {
    let method = this.defn.methods[what[1]]
    if(!method) throw new Error("methodNotFound")
    let res = method(...(what.slice(2).concat(args)))
    if(res && res.then) return res
    return Promise.resolve(res)
  }

}

module.exports = SimpleDao
