REACTIVE DATA ACCESS OBJECT
=====

Battle tested reactive protocol for reactve SPA and isomorphic applications.

Features
====

1. Data synchronization server -> client
2. Resynchronization after reconnect
3. Asynchronous events
4. Pluggable lower layer implementation - existing plugins: WebSocket, SockJS

Messaging problem
=====

WebSocket, Socket.io, SockJS and many other messaging solutions solves many problems, but brings thier own problems.
In naive implementation of application protocol based on any messaging solution developers often assume that network connection is realiable resource. They sends messages from one peer to another through server and assume that they will arrive ad target peer. It's common misconception, most messaging protocols are based on TCP(Transmission Control Protocol) which is not as reliable as many people think, or UDP which is totaly unreliable. TCP provides only mechanisms for data segmentation, connection handling, packet retransmission and ordering. In theory TCP should be enough, but in practice is often not enough. There are numerous events that cause TCP disconnections in example:
- Temporary packet loss - especially on Wireless and Mobile connections.
- Network addres change - on mobile.
- Device sleep.
When one of such events occour, and they occour very often, the connection is lost, and with it often negotiation state of application layer protocol is lost.

Solution - Protocol
=====

I thought very long about possible solutions of this problem, after some years I came up with additional protocol layer that will add necessary abstraction.
There were some naive solutions, like storing not-delivered messages on peer, but after rethinking it it was proven not optimal. So I came up with idea based on observer pattern and state-synchronization. It's natural extension on one of my favourite human-readable protocols - JSON-RPC.

JSON-RPC provides request-response mechanism, with id-based request response relation, such as:

1. request: ```{type:"request", requestId: 1, method: "echo", args: ["hello"] }```
2. response: ```{type: "response" responseId: 1, error: null, result: "hello" }```

It works very well on TCP and websocket connections, so I decided to extend it with real-time observation feature:

1. observation: ```{type: "observe", what: "some.observable.value" }```
2. response: ```{type: "notify" what:"some.observable.value" signal: "set", args: ['actual value'] }```
3. later notification: ```{type: "notify" what:"some.observable.value" signal: "set", args: ['new value'] }```
4. end of observation: ```{type: "unobserve", what: "some.observable.value" }```

So here client requests some value state with it's updates. Server ALWAYS sends current value, and after some server-side data change it sends change notifications until client he is no longer interested in this value state.

It's also possible to use it with lists, and other complex values:

1. observation: ```{type: "observe", what: "some.observable.list" }```
2. response: ```{type: "notify" what:"some.observable.list" signal: "set", args: [[1,2,3]] }```
3. later notification: ```{type: "notify" what:"some.observable.list" signal: "push", args: [4] }```
4. another notification: ```{type: "notify" what:"some.observable.list" signal: "push", args: [5]}```
4. end of observation: ```{type: "unobserve", what: "some.observable.list" }```

We have single values and lists implemented in reactive-observer libraries, it's also possible to extend them, or create completly new observables.

For the sake of completeness, protocol have also two other operations:

#### Get
1. request: ```{type: "get", requestId: 2, what:"some.observable.list" }```
2. response: ```{responseId: 2, result: "hello" }```

GET operation is created for fetching current state of server-side observables without observation of thier state.


#### Event
1. event: ```{type:"event", method: "echo", args: ["hello"] }```

Event is a request that does not waits response.

Error Handling
-----

Every operation can be unsuccesful, so protocol needs to handle server-side error in civilized manner.

#### Request-Response

1. request: ```{type:"request", requestId: 1, method: "echo", args: ["hello"]}```
2. response: ```{ type: "error", responseId: 1, error: "somethingWentWrong"}

#### Get errors

1. request: ```{type: "get", requestId: 2, what:"some.errorneus.observable" }```
2. response: ```{ type: "error", responseId: 2, error: "somethingWentWrong" }```

#### Observation

1. observation: ```{type: "observe", what: "some.errorneus.observable" }```
2. response: ```{type: "notify" what:"some.observable.value" signal: "error", args: ['somethingWentWrong'] }```

API
=====
There are many deprecated implementations of reactive-observer, the effort of many years of programming and testing has resulted in this one, with most recent protocol version.

We can create on server side observable values related to client as well as global ones:

```
const Dao = require("@live-change/dao")

let timeObservable = new ReactiveDao.ObservableValue(Date.now());
let clicksObservable = new ReactiveDao.ObservableList([]);

setInterval(() => {
  timeObservable.set(Date.now())
  clicksObservable.push('click at '+(new Date()))
  if( clicksObservable.list.length > 5 ) clicksObservable.shift()
}, 50)
```

This implementation is based on DAO(data access object) concept that is proven useful in isomorfic applications(in example SPA with server side renderer). DAO objects are related to connections, so we need a generator:

```
function generator(credentials) {
  return new eDao(credentials, { // New reactive dao object
    test: { // one of sub data objects/paths
      type: "local", // local object, it can be remote(server->server) as well 
      source: new Dao.SimpleDao({ // Simple DAO object implementation
        values: { // values that are shared
          time: {
            observable() { // returns observable object or promise of one
              return timeObservable;
            },
            get() { // returns value or promise of one
              return new Promise((resolve, reject) => resolve(Date.now()))
            }
          }
        }
      })
    }
  })
}
```

Next we need to create server:

```
const server = new Dao.ReactiveServer(testServerDao.promised)
```

And connect to server:

```
/// Loopback connection is used for testing, there are also websocket and SockJS implementations
client = new LoopbackConnection(credentials, server, {
  onConnect: () => {}, // method called when connection is ready
  delay: 50 // delay for testing
})
```

And observe state of server-side clock:

```
timeObservable = client.observable(['test','time'],ReactiveDao.ObservableValue)
timeObserver = {
  set(time){
    console.log("got server time: "+time)
  }
}
timeObservable.observe(timeObserver)
```

There is also possible to create client-side DAO that uses server-side DAO.

```
import ReactiveDao from "reactive-dao"
import DaoSockJS from "reactive-dao-sockjs"

export default (credentials) => new Dao(credentials, {

  protocols: {
    'sockjs': ReactiveSockJS
  },
  youtube: {
    type: "remote",
    generator: ReactiveDao.ObservableValue
  },
  contact: {
    type: "remote",
    generator: null
  },
  articles: {
    type: "remote",
    generator: ReactiveDao.ObservableList
  },
  currency: {
    type: "remote",
    generator: ReactiveDao.ObservableValue
  }

})
```
Here a generator is a function/constructor that will create local objects that reacts for server generated notifications.

ReactiveConnection settings
===
```
  {  
  
    /**
      When request is started in disconnected state then it will be
      added to requests queue and sent after reconnect
    **/
    queueRequestsWhenDisconnected: true,
    
    /**
      How long request could be in queue
    **/  
    requestSendTimeout: 2300,
    
    /**
      How long request will wait for response; 0 for no timeout
    **/
    requestTimeout: 0,
    
    /**
      On disconnect active requests(without replies) can be added to
      queue
    **/
    queueActiveRequestsOnDisconnect: false
    
    /**
      Reconnect delay
    **/
    autoReconnectDelay: 200,
    
    /**
      Log level ( 0 or 1 )
    **/  
    logLevel: 0,
    
    /**
      Function that creates connection monitor
    **/  
    connectionMonitorFactory: (connection) =>
      new ReactiveDao.ConnectionMonitorPinger(connection, {
        pingInterval: 50,
        pongInterval: 200
      })
      
    /**
      Time synchronization object
    **/    
    timeSynchronization: null
  }
```

Time Synchronization
========

```
  /// Create time synchronization object
  let timeSynchronization = new ReactiveDao.TimeSynchronization({
    /**
      Synchronization ping
      interval = pingInterval + countOfSyncPings * pingIntervalIncrement
    **/  
    pingInterval: 1000,
    pingIntervalIncrement: 500,
    maxPingInterval: 5000,
    /**
      minimal synchronization pong count before conversion is possible
    **/
    minPongCount: 1
  })
  
  /// pass time synchronization object to connectionSettings
  ...

  timeSynchronization.synchronizedPromise().then(
    timeDifference => {
      let localTimeMillis = timeSynchronization.serverToLocal(tsFromServer)
      let serverTime = timeSynchronization.localToServer(Date.now())
    })

```
