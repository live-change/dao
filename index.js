const Dao = require("./lib/Dao.js")

Dao.Dao = Dao

const Observable = require("./lib/Observable.js")
Dao.Observable = Observable

const ObservableValue = require("./lib/ObservableValue.js")
Dao.ObservableValue = ObservableValue

const ObservableList = require("./lib/ObservableList.js")
Dao.ObservableList = ObservableList

const ExtendedObservableList = require("./lib/ExtendedObservableList.js")
Dao.ExtendedObservableList = ExtendedObservableList

const ReactiveServer = require("./lib/ReactiveServer.js")
Dao.ReactiveServer = ReactiveServer

const DaoPrerenderCache = require("./lib/DaoPrerenderCache.js")
Dao.DaoPrerenderCache = DaoPrerenderCache
Dao.ReactiveCache = DaoPrerenderCache // BACKWARD COMPATIBILITY

const ReactiveConnection = require("./lib/ReactiveConnection.js")
Dao.ReactiveConnection = ReactiveConnection

const LoopbackConnection = require('./lib/LoopbackConnection.js')
Dao.LoopbackConnection = LoopbackConnection

const SimpleDao = require("./lib/SimpleDao.js")
Dao.SimpleDao = SimpleDao

const ObservableProxy = require("./lib/ObservableProxy.js")
Dao.ObservableProxy = ObservableProxy

const ObservablePromiseProxy = require("./lib/ObservablePromiseProxy.js")
Dao.ObservablePromiseProxy = ObservablePromiseProxy

const ObservableError = require("./lib/ObservableError.js")
Dao.ObservableError = ObservableError

const ConnectionMonitorPinger = require("./lib/ConnectionMonitorPinger.js")
Dao.ConnectionMonitorPinger = ConnectionMonitorPinger

const ConnectionMonitorPingReceiver = require("./lib/ConnectionMonitorPingReceiver.js")
Dao.ConnectionMonitorPingReceiver = ConnectionMonitorPingReceiver

const TimeSynchronization = require("./lib/TimeSynchronization.js")
Dao.TimeSynchronization = TimeSynchronization

const DaoProxy = require("./lib/DaoProxy.js")
Dao.ReactiveDaoProxy = DaoProxy // BACKWARD COMPATIBILITY
Dao.DaoProxy = DaoProxy

const DaoCache = require("./lib/DaoCache.js")
Dao.DaoCache = DaoCache

const Path = require("./lib/Path.js")
Dao.Path = Path

const collectPointers = require("./lib/collectPointers.js")
Dao.collectPointers = collectPointers

Dao.global = Dao

module.exports = Dao

