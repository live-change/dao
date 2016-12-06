class RemoteDataSource {
  constructor(connection, generator) {
    this.connection = connection
    this.generator = generator
  }
  observable(what) {
    return this.connection.observable(what, this.generator)
  }
  get(what) {
    return this.connection.get(what)
  }
  request(method, ...args) {
    return this.connection.request(method, ...args)
  }
  event(method, ...args) {
    return this.connection.event(method, ...args)
  }
}

module.exports = RemoteDataSource
