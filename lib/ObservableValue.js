const Observable = require("./Observable.js")

class ObservableValue extends Observable {
  constructor(value) {
    super()
    this.value = value
    this.properties = []
  }

  observe(observer) {
    this.observers.push(observer)
    if(typeof this.value != 'undefined') this.fireObserver(observer, 'set', this.value)
  }

  set(value) {
    if(value === this.value) return;
    try {
      if (JSON.stringify(value) == JSON.stringify(this.value)) return;
    } catch(e) {}
    this.value = value
    this.fireObservers('set', value)
    for(var [object, property] of this.properties) {
      object[property] = value 
    }
  }

  bindProperty(object, property) {
    this.properties.push([object, property])
    object[property] = this.value
  }
  unbindProperty(object, property) {
    for(var i = 0; i < this.properties.length; i++) {
      var prop = properties[i]
      if(prop[0] == object && prop[1] == property) {
        this.properties.splice(i,1)
        if(this.isUseless()) this.dispose()
        return;
      }
    }
    throw new Error("cannot unbind not bound property "+property)
  }

  isUseless() {
    return (this.observers.length == 0) && (this.properties.length == 0)
  }
  
  save() {
    return this.value
  }
  restore(value) {
    this.set(value)
  }
  isInitialized() {
    return (typeof this.value !== 'undefined')
  }
}

module.exports = ObservableValue
