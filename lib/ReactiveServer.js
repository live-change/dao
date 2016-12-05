class ReactiveServer {
  constructor(daoGenerator) {
    this.daoGenerator = daoGenerator
  }
  handleConnection(connection) {
    var dao
    var observers = new Map()
    connection.on('data', data => {
      var message = JSON.parse(data)
      if(!dao) {
        if(message.type != 'initializeSession') {
          console.error("Unknown first packet type "+message.type)
          connection.close()
          return;
        }
        dao = this.daoGenerator(message.sessionId)
      } else {
        switch(message.type) {
          case 'request':
            var path = message.method
            dao.request(path, ...message.args).then(
              result => connection.write(JSON.stringify({
                type:"response",
                responseId: message.requestId,
                response: result
              })),
              error => connection.write(JSON.stringify({
                type:"error",
                responseId: message.requestId,
                error: error
              }))
            );
            break;
          case 'ping':
            message.type = 'pong'
            connection.write(JSON.stringify(message))
            break;
          case 'timeSync':
            message.server_send_ts = Date.now()
            message.server_recv_ts = Date.now()
            connection.write(JSON.stringify(message))
            break;
          case 'event':
            var path = message.method
            dao.request(path, ...message.args)
            break;
          case 'observe' :
            var path = message.what
            var spath = JSON.stringify(path)
            //console.log("OBSERVE", path)
            var observer = observers.get(spath)
            if(observer) return;
            var observable = dao.observable(path)
            //console.log("OBSERVABLE", observable)
            var observer = (signal, ...args) => connection.write(JSON.stringify({
              type: "notify",
              what: message.what,
              signal: signal,
              args: args
            }))
            observable.observe(observer)
            observers.set(spath, observer)
            break;
          case 'unobserve' :
            var path = message.what
            var spath = JSON.stringify(path)
            var observer = observers.get(spath)
            if(!observer) return;
            var observable = dao.observable(path)
            observable.unobserve(observer)
            observers.delete(spath)
            break;
          case 'get' :
            var path = message.what
            dao.get(path).then(
              result => connection.write(JSON.stringify({
                type:"response",
                responseId: message.requestId,
                response: result
              })),
              error => connection.write(JSON.stringify({
                type:"error",
                responseId: message.requestId,
                error: error
              }))
            )
            return;
        }
      }
    });
    connection.on('close', () => dao.dispose());
  }
}

module.exports = ReactiveServer
