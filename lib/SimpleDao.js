class SimpleDao {
  
  constructor(defn) {
    
    this.defn = defn
    
  }

  observable(what) {
    return this.defn.values[what[1]].observable(...(what.slice(2)))
  }

  get(what) {
    return this.defn.values[what[1]].get(...(what.slice(2)))
  }

  request(what, ...args) {
    let method = this.defn.methods[what[1]]
    if(!method) throw new Error("methodNotFound")
    return method(...(what.slice(2).concat(args)))
  }
  
}

module.exports = SimpleDao