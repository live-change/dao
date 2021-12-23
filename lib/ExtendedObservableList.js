const ObservableList = require("./ObservableList.js")

class ExtendedObservableList extends ObservableList {
  constructor(observableList, elementActivator, elementDispose, valueActivator = observableList.valueActivator) {
    let list = observableList.list
    if(elementActivator) {
      list = Array.isArray(list) ? list.map(elementActivator) : elementActivator(list)
    }
    super(list, undefined, undefined, valueActivator)

    this.observableList = observableList
    this.elementActivator = elementActivator
    this.elementDispose = elementDispose
    this.valueActivator = valueActivator

    this.savedError = null
    this.properties = []
    this.errorProperties = []

    this.observableList.observe(this)
  }

  dispose() {
    this.observableList.unobserve(this)
    if(this.elementDispose) {
      if(Array.isArray(this.list)) {
        for(const disposed of this.list) this.elementDispose(disposed)
      } else {
        this.elementDispose(this.list)
      }
      this.list = undefined
    }
    super.dispose.apply(this)
  }

  respawn() {
    super.respawn.apply(this)
    this.observableList.observe(this)
  }

  extend(elementFunc, elementDispose) {
    const extendedList = new ExtendedObservableList(
      this.value, null, null, this.valueActivator, elementFunc, elementDispose)
    const oldDispose = extendedList.dispose
    const oldRespawn = extendedList.respawn

    this.observe(extendedList)
    extendedList.dispose = () => {
      this.unobserve(extendedList)
      oldDispose.apply(extendedList)
    }
    extendedList.respawn = () => {
      oldRespawn.apply(extendedList)
      this.observe(extendedList)
    }
    return extendedList
  }

  set(list) {
    if(list === this.list) return;
    try {
      if (JSON.stringify(list) == JSON.stringify(this.list)) return;
    } catch(e) {}
    if(this.elementDispose) {
      if(Array.isArray(this.list)) {
        for(const disposed of this.list) this.elementDispose(disposed)
      } else {
        this.elementDispose(this.list)
      }
    }
    if(this.elementActivator) {
      list = Array.isArray(list) ? list.map(this.elementActivator) : this.elementActivator(list)
    }
    this.list = this.valueActivator ? this.valueActivator(list) : list
    this.fireObservers('set', list)
    for(const [object, property] of this.properties) {
      object[property] = this.list
    }
  }

  push(value) {
    if(this.elementActivator) value = this.elementActivator(value)
    this.list.push(value)
    this.fireObservers('push', value)
  }
  unshift(value) {
    if(this.elementActivator) value = this.elementActivator(value)
    this.list.unshift(value)
    this.fireObservers('unshift', value)
  }
  pop() {
    if(this.elementDispose) this.elementDispose(this.list[this.list.length - 1])
    this.list.pop()
    this.fireObservers('pop')
  }
  shift() {
    if(this.elementDispose) this.elementDispose(this.list[0])
    this.list.shift()
    this.fireObservers('shift')
  }
  splice(at, del, ...values) {
    const removed = this.list.splice(at, del, ...values)
    if(this.elementDispose) for(const disposed of removed) this.elementDispose(dispose)
    this.fireObservers('splice', at, del, ...values)
  }
  putByField(field, value, element, reverse = false, oldElement) {
    if(this.elementActivator) element = this.elementActivator(element)
    if(!reverse) {
      let i, l
      for(i = 0, l = this.list.length; i < l; i++) {
        if(this.list[i][field] == value) {
          oldElement = this.list[i]
          if(this.elementDispose) this.elementDispose(oldElement)
          this.list.splice(i, 1, element)
          break
        } else if(this.list[i][field] > value) {
          this.list.splice(i, 0, element)
          break
        }
      }
      if(i == l) this.list.push(element)
    } else {
      let i
      for(i = this.list.length-1; i >= 0; i--) {
        if(this.list[i][field] == value) {
          oldElement = this.list[i]
          if(this.elementDispose) this.elementDispose(oldElement)
          this.list.splice(i, 1, element)
          break
        } else if(this.list[i][field] > value) {
          this.list.splice(i + 1, 0, element)
          break
        }
      }
      if(i < 0) this.list.splice(0, 0, element)
    }
    this.fireObservers('putByField', field, value, element, reverse, oldElement)
  }
  remove(exact) {
    let json = JSON.stringify(exact)
    for(let i = 0, l = this.list.length; i < l; i++) {
      if(JSON.stringify(this.list[i]) == json) {
        if(this.elementDispose) this.elementDispose(this.list[i])
        this.list.splice(i, 1)
      }
    }
    this.fireObservers('remove', exact)
  }
  removeByField(field, value, oldElement) {
    let json = JSON.stringify(value)
    for(let i = 0, l = this.list.length; i < l; i++) {
      if(JSON.stringify(this.list[i][field]) == json) {
        oldElement = this.list[i]
        if(this.elementDispose) this.elementDispose(oldElement)
        this.list.splice(i, 1)
        i--
        l--
      }
    }
    this.fireObservers('removeByField', field, value, oldElement)
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
      if(found) {
        if(this.elementDispose) this.elementDispose(this.list[i])
        this.list.splice(i, 1)
        i--
        l--
      }
    }
    this.fireObservers('removeBy', fields)
  }

  update(exact, element) {
    let json = JSON.stringify(exact)
    for(let i = 0, l = this.list.length; i < l; i++) {
      if(JSON.stringify(this.list[i]) == json) {
        if(this.elementDispose) this.elementDispose(this.list[i])
        if(this.elementActivator) element = this.elementActivator(element)
        this.list.splice(i, 1, element)
      }
    }
    this.fireObservers('update', exact, element)
  }
  updateByField(field, value, element) {
    let json = JSON.stringify(value)
    for(let i = 0, l = this.list.length; i < l; i++) {
      if(JSON.stringify(this.list[i][field]) == json) {
        if(this.elementDispose) this.elementDispose(this.list[i])
        if(this.elementActivator) element = this.elementActivator(element)
        this.list.splice(i, 1, element)
      }
    }
    this.fireObservers('updateByField', field, value, element)
  }
  updateBy(fields, element) {
    let jsonf = []
    for(const k in fields) {
      jsonf.push([k, JSON.stringify(fields[k])])
    }
    for(let i = 0, l = this.list.length; i < l; i++) {
      let found = true
      for(let [key, json] of jsonf) {
        found = found && (JSON.stringify(this.list[i][key]) == json)
      }
      if(found) {
        if(this.elementDispose) this.elementDispose(this.list[i])
        if(this.elementActivator) element = this.elementActivator(element)
        this.list.splice(i, 1, element)
      }
    }
    this.fireObservers('updateBy', fields, element)
  }

}

module.exports = ExtendedObservableList
