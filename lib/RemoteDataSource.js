class RemoteDataSource {
  constructor(connection, definition) {
    this.definition = definition
    this.connection = connection
    this.generator = definition.generator
    this.redirect = definition.redirect || (x=>x)
  }
  observable(what) {
    return this.connection.observable(this.redirect(what), this.generator)
  }
  get(what) {
    return this.connection.get(this.redirect(what))
  }
  request(method, ...args) {
    return this.connection.request(this.redirect(method), ...args)
  }
  requestWithSettings(settings, method, ...args) {
    return this.connection.requestWithSettings(settings, this.redirect(method), ...args)
  }
  event(method, ...args) {
    return this.connection.event(this.redirect(method), ...args)
  }
}

module.exports = RemoteDataSource
