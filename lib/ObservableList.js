const Observable = require("./Observable.js")

class ObservableList extends Observable {
  constructor(list, _what, _dispose, valueActivator) {
    super()
    this.valueActivator = valueActivator
    this.list = this.valueActivator ? this.valueActivator(list) : list
    this.savedError = null
    this.properties = []
    this.errorProperties = []
  }

  observe(observer) {
    if(this.isDisposed()) this.respawn()
    this.observers.push(observer)
    if(this.savedError) return this.fireObserver(observer, 'error', this.savedError)
    if(typeof this.list != 'undefined') this.fireObserver(observer, 'set', this.list)
  }

  set(list) {
    if(list === this.list) return
    try {
      if (JSON.stringify(list) == JSON.stringify(this.list)) return
    } catch(e) {}
    this.list = this.valueActivator ? this.valueActivator(list) : list
    this.fireObservers('set', list)
    for(const [object, property] of this.properties) {
      object[property] = this.list
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
    this.list.shift()
    this.fireObservers('shift')
  }
  splice(at, del, ...values) {
    this.list.splice(at, del, ...values)
    this.fireObservers('splice', at, del, ...values)
  }
  putByField(field, value, element, reverse = false, oldElement) {
    if(!reverse) {
      let i, l
      for(i = 0, l = this.list.length; i < l; i++) {
        if(this.list[i][field] == value) {
          oldElement = this.list[i]
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
      if(JSON.stringify(this.list[i]) == json) this.list.splice(i, 1)
    }
    this.fireObservers('remove', exact)
  }
  removeByField(field, value, oldElement) {
    let json = JSON.stringify(value)
    for(let i = 0, l = this.list.length; i < l; i++) {
      if(JSON.stringify(this.list[i][field]) == json) {
        oldElement = this.list[i]
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
    for(const k in fields) {
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
    for(let i = 0; i < this.properties.length; i++) {
      const prop = this.properties[i]
      if(prop[0] == object && prop[1] == property) {
        this.properties.splice(i, 1)
        i--
        if(this.isUseless()) this.dispose()
        return;
      }
    }
    throw new Error("cannot unbind not bound property "+property)
  }

  bindErrorProperty(object, property) {
    if(this.isDisposed()) this.respawn()
    this.errorProperties.push([object, property])
    if(this.savedError !== undefined) object[property] = this.savedError
  }
  unbindErrorProperty(object, property) {
    for(let i = 0; i < this.errorProperties.length; i++) {
      const prop = this.errorProperties[i]
      if(prop[0] == object && prop[1] == property) {
        this.errorProperties.splice(i, 1)
        i--
        if(this.isUseless()) this.dispose()
        return
      }
    }
    throw new Error("cannot unbind not bound property "+property)
  }

  handleError(error) {
    this.savedError = error
    let handled = super.handleError(error)
    for(const [object, property] of this.errorProperties) {
      handled = true
      object[property] = error
    }
    return handled
  }

  isUseless() {
    return (this.observers.length == 0) && (this.properties.length == 0)
        && (this.errorProperties.length == 0)
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

  next(fun) {
    let obs = new ObservableList(null)
    function setRetPromised(ret) {
      if (!ret || (typeof ret != 'object')) return obs.set(ret)
      if (ret.then) {
        return ret.then(
          result => setRet(result)
        ).catch(
          error => obs.error(error)
        )
      }
      obs.set(ret)
    }

    let resultObservable
    let resultObserver = (signal, ...args) => {
      //console.error("CALL RESULT OBSERVER", signal, ...args)
      obs[signal](...args)
    }

    function setRet(ret) {
      if (!ret || (typeof ret != 'object')) {
        if(resultObservable) {
          resultObservable.unobserve(resultObserver)
          resultObservable = null
        }
        obs.set(ret)
        return
      }
      if(ret.observe) {
        if(resultObservable) resultObservable.unobserve(resultObserver)
        //console.error("OBSERVE RESULT OBSERVABLE")
        resultObservable = ret
        resultObservable.observe(resultObserver)
        return;
      } else {
        if(resultObservable) {
          resultObservable.unobserve(resultObserver)
          resultObservable = null
        }
      }
      if (ret.then) {
        return ret.then(
          result => setRetPromised(result)
        ).catch(
          error => obs.error(error)
        )
      }
      obs.set(ret)
    }
    setRet(fun(this.list))
    let oldDispose = obs.dispose
    let oldRespawn = obs.respawn
    obs.dispose = () => {
      oldDispose.call(obs)
      this.unobserve(observer)
      if(resultObservable) resultObservable.unobserve(resultObserver)
    }
    obs.respawn = () => {
      oldRespawn.call(obs)
      this.observe(observer)
      if(resultObservable) resultObservable.observe(resultObserver)
    }
    let observer = (signal) => setRet(fun(this.list))
    this.observe(observer)
    return obs
  }

  useCount() {
    return this.observers.length + this.properties.length
  }

  getValue() {
    return this.list
  }
  getError() {
    return this.savedError
  }
}

module.exports = ObservableList
