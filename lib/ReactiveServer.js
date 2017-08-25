
class ReactiveServer {
  constructor(daoGenerator) {
    this.daoGenerator = daoGenerator
  }
  handleConnection(connection) {
    var dao
    var daoPromise
    var daoGenerationQueue = []
    var observers = new Map()
    var observables = new Map()
    var context
    let handleMessage = (message) => {
      switch(message.type) {
        case 'request':
          var path = message.method
          try {
            dao.request(path, ...message.args).then(
              result => connection.write(JSON.stringify({
                type: "response",
                responseId: message.requestId,
                response: result
              })),
              error => connection.write(JSON.stringify({
                type: "error",
                responseId: message.requestId,
                error: error ? error.message || error : error
              }))
            );
          } catch (error) {
            connection.write(JSON.stringify({
              type: "error",
              responseId: message.requestId,
              error: error ? error.message || error : error
            }))
          }
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
          if(observer) {
            console.error("reobserve existing path from client")
            return;
          }
          var observable = dao.observable(path)
          //console.log("OBSERVABLE", observable)
          var observer = (signal, ...args) => connection.write(JSON.stringify({
            type: "notify",
            what: message.what,
            signal: signal,
            args: args
          }))
          observable.observe(observer)
          observables.set(spath, observable)
          observers.set(spath, observer)
          break;
        case 'unobserve' :
          var path = message.what
          //console.log("UNOBSERVE", path)
          var spath = JSON.stringify(path)
          var observer = observers.get(spath)
          if(!observer) return;
          var observable = observables.get(spath)//dao.observable(path)
          if(!observable) return;
          observable.unobserve(observer)
          observables.delete(spath)
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
    connection.on('data', data => {
      var message = JSON.parse(data)
      if(!dao && !daoPromise) {
        if(message.type != 'initializeSession') {
          console.error("Unknown first packet type "+message.type)
          connection.close()
          return;
        }
        daoPromise = this.daoGenerator(message.sessionId, connection)
        if(!daoPromise.then) {
          dao = daoPromise
          daoPromise = null
        } else {
          daoPromise.then(dd => {
            dao = dd
            daoPromise = null
            for(var message of daoGenerationQueue) handleMessage(message)
          })
        }
      } else if(daoPromise && !dao) {
        daoGenerationQueue.push(message)
      } else {
        handleMessage(message)
      }
    });
    connection.on('close', () => {
      if(dao) dao.dispose()
    });
  }
}

module.exports = ReactiveServer
