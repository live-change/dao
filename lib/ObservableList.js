const Observable = require("./Observable.js")

class ObservableList extends Observable {
  constructor(list) {
    super()
    this.error = null
    this.list = list
    this.properties = []
    this.errorProperties = []
  }

  observe(observer) {
    if(this.isDisposed()) this.respawn()
    this.observers.push(observer)
    if(this.error) return this.fireObserver(observer, 'error', this.error)
    if(typeof this.list != 'undefined') this.fireObserver(observer, 'set', this.list)
  }

  set(list) {
    if(list === this.list) return;
    try {
      if (JSON.stringify(list) == JSON.stringify(this.list)) return;
    } catch(e) {}
    this.list = list
    this.fireObservers('set', list)
    for(var [object, property] of this.properties) {
      object[property] = list
    }
  }

  push(value) {
    this.list.push(value)
    this.fireObservers('push', value)
  }
  unshift(value) {
    this.list.unshift(value)
    this.fireObservers('unshift', value)
  }
  pop() {
    this.list.pop()
    this.fireObservers('pop')
  }
  shift() {
    this.list.pop()
    this.fireObservers('shift')
  }
  splice(at, del, ...values) {
    this.list.splice(at, del, ...values)
    this.fireObservers('splice', at, del, ...values)
  }
  remove(exact) {
    let json = JSON.stringify(exact)
    for(let i = 0, l = this.list.length; i < l; i++) {
      if(JSON.stringify(this.list[i]) == json) this.list.splice(i, 1)
    }
    this.fireObservers('remove', exact)
  }
  removeByField(field, value) {
    let json = JSON.stringify(value)
    for(let i = 0, l = this.list.length; i < l; i++) {
      if(JSON.stringify(this.list[i][field]) == json) this.list.splice(i, 1)
    }
    this.fireObservers('removeByField', field, value)
  }
  removeBy(fields) {
    let jsonf = []
    for(var k in fields) {
      jsonf.push([k, JSON.stringify(fields[k])])
    }
    for(let i = 0, l = this.list.length; i < l; i++) {
      let found = true
      for(let [key, json] of jsonf) {
        found = found && (JSON.stringify(this.list[i][key]) == json)
      }
      if(found) this.list.splice(i, 1)
    }
    this.fireObservers('removeBy', fields)
  }

  update(exact, element) {
    let json = JSON.stringify(exact)
    for(let i = 0, l = this.list.length; i < l; i++) {
      if(JSON.stringify(this.list[i]) == json) this.list.splice(i, 1, element)
    }
    this.fireObservers('update', exact, element)
  }
  updateByField(field, value, element) {
    let json = JSON.stringify(value)
    for(let i = 0, l = this.list.length; i < l; i++) {
      if(JSON.stringify(this.list[i][field]) == json) this.list.splice(i, 1, element)
    }
    this.fireObservers('updateByField', field, value, element)
  }
  updateBy(fields, element) {
    let jsonf = []
    for(var k in fields) {
      jsonf.push([k, JSON.stringify(fields[k])])
    }
    for(let i = 0, l = this.list.length; i < l; i++) {
      let found = true
      for(let [key, json] of jsonf) {
        found = found && (JSON.stringify(this.list[i][key]) == json)
      }
      if(found) this.list.splice(i, 1, element)
    }
    this.fireObservers('updateBy', fields, element)
  }

  bindProperty(object, property) {
    if(this.isDisposed()) this.respawn()
    this.properties.push([object, property])
    if(this.list !== undefined) object[property] = this.list
  }
  unbindProperty(object, property) {
    for(var i = 0; i < this.properties.length; i++) {
      var prop = this.properties[i]
      if(prop[0] == object && prop[1] == property) {
        this.properties.splice(i,1)
        if(this.isUseless()) this.dispose()
        return;
      }
    }
    throw new Error("cannot unbind not bound property "+property)
  }

  bindErrorProperty(object, property) {
    if(this.isDisposed()) this.respawn()
    this.errorProperties.push([object, property])
    if(this.error !== undefined) object[property] = this.error
  }
  unbindErrorProperty(object, property) {
    for(var i = 0; i < this.properties.length; i++) {
      var prop = this.errorProperties[i]
      if(prop[0] == object && prop[1] == property) {
        this.errorProperties.splice(i,1)
        if(this.isUseless()) this.dispose()
        return;
      }
    }
    throw new Error("cannot unbind not bound property "+property)
  }

  handleError(error) {
    this.error = error
    let handled = super.handleError(this)
    for(var [object, property] of this.errorProperties) {
      handled = true
      object[property] = error
    }
    return handled
  }

  isUseless() {
    return (this.observers.length == 0) && (this.properties.length == 0)
  }

  save() {
    return this.list
  }
  restore(list) {
    this.set(list)
  }
  isInitialized() {
    return (typeof this.list !== 'undefined')
  }
}

module.exports = ObservableList
