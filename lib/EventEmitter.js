class EventEmitter {
  constructor() {
    this.events = {}
  }
  listeners(event) {
    let listeners = this.events[event]
    if(listeners) return listeners
    listeners = []
    this.events[event] = listeners
    return listeners
  }
  on(event, listener) {
    this.listeners(event).push(listener)
  }
  removeListener(event, listener) {
    let listeners = this.events[event]
    if(!listeners) return
    const id = listeners.indexOf(listener)
    if(id == -1) return
    listeners.splice(id, 1)
    if(listeners.length == 0) delete this.events[event]
  }
  emit(event, ...args) {
    let listeners = this.events[event]
    if(!listeners) return;
    listeners = listeners.slice()
    for (let listener of listeners)
      listener(...args)
  }
  once(event, listener) {
    let g = () => {
      this.removeListener(event, g)
      listener.apply(this, arguments)
    }
    this.on(event, g)
  }
}

module.exports = EventEmitter
