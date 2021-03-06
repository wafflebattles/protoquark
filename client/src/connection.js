var emitter = require("component/emitter")

var API_KEY = "98bn0vxj6aymygb9"

// Max ping packets to send
var MAX_PINGS = 15
// Smaller amount of ping packets before we can accurately get latency & server time
var MIN_PINGS = 5

var nameCounter = 0
var pingCounter = 0
var networkIdCounter = 0x10000

function Connection() {
  this.players = {}
  this.on("setname", onSetName.bind(this))
  this.on("players", onPlayers.bind(this))
  this.on("playerenter", onPlayerEnter.bind(this))
  this.on("playerexit", onPlayerExit.bind(this))
  this.on("ping", onPing.bind(this))
  this.on("pong", onPong.bind(this))
  this.on("servertime", onServerTime.bind(this))

  var self = this
  this.pingIntervalId = setInterval(function() {
    Object.keys(self.players).forEach(function (id) {
      self.players[id]
      pingClient.call(self, id, MAX_PINGS)
    })
  }, 7500)
}

Connection.prototype = {
  send: function send(event, obj, opts) {
    if (opts == void 0) opts = {}

    var clients = this.clients
    var server = this.server
    var connType = opts.reliable ? "reliable" : "unreliable"

    var data = {
      event : event,
      context : obj,
      sender : opts.sender || this.peer.id,
      relay: opts.relay,
      broadcast: opts.broadcast,
      reliable: opts.reliable
    }

    // If we are just a client send it now.
    if (!this.isServer()) 
      return server && server[connType] ? server[connType].send(data) : 0

    // Handle relaying of data.
    if (clients[data.relay])
      return clients[data.relay][connType] ? clients[data.relay][connType].send(data) : 0

    // TODO: The order of sending to clients first before emitting should be handled some way as to not
    // being required.

    // As server broadcast to all clients if there is no relay automatically.
    Object.keys(clients).forEach(function (key) {
      if (clients[key][connType])
        clients[key][connType].send(data)
    })

    // Re-send ourself (the server) the event, because we are not a client and we are broadcasting
    this.emit(data.event, data)
  },

  connect: function connect(room) {
    console.log("connecting to", room)

    var migrating = this.room === room && this.connected

    this.room = room
    delete this.serving

    var peer = this.peer = migrating ? this.peer : new Peer({key: API_KEY, debug: 2})
    if (!migrating) {
      this.emit("opening")
      peer.once("error", onJoinError.bind(this))
      peer.once("open", onClientIdAssigned.bind(this))
      peer.on("connection", function (e) { console.log("connection!", e) })
      peer.on("call", function (e) { console.log("call!", e) })
      peer.on("close", function (e) { console.log("close!", e) })
      peer.on("disconnected", function (e) { console.log("disconnected!", e) })
    }
    else {
      this.connected = false
      onClientConnected.call(this, this.peer.id)
    }
  },

  kill: function kill() {
    var server = this.server
    if (server) {
      Object.keys(server).forEach(function(key) {
        server[key].close()
      })
    }

    this.peer.disconnect()
    this.emit("connectionkill")
    console.log("connection killed")
  },

  isServer: function isServer() {
    return !!this.serving
  },

  generateName: function () {
    return "P" + ++nameCounter
  },

  getServerTime: function getServerTime() {
    var serverTimeOffset = this.serverTimeOffset
    return Date.now() / 1000 + (serverTimeOffset ? serverTimeOffset : 0)
  },

  isOwnId: function(id) {
    return id === this.peer.id
  },
}

function onClientIdAssigned(id) {
  console.log("You are", this.peer.id)
  removeServerListeners.call(this)

  var server = this.server = {
    unreliable: this.peer.connect(this.room),
    reliable: this.peer.connect(this.room, {reliable: true})
  }

  Object.keys(server).forEach(function (type) {
    var conn = server[type]
    conn.on("open", onConnectedToServer.bind(this))
    conn.on("data", onServerData.bind(this))
    conn.on("close", onServerDisconnected.bind(this))
    conn.on("error", onServerError.bind(this))
  }.bind(this))

  this.emit('peeridassigned', this.peer.id)
}

function removeServerListeners() {
  var server = this.server
  if (server) {
    Object.keys(server).forEach(function(type) {
      server[type].removeAllListeners()
    })
  }
}

function onConnectedToServer() {
  // needs both reliable and unreliable to be ready
  this.connected = this.server.unreliable.open && this.server.reliable.open
  if (this.connected) {
    console.log("Connected to server")
    this.emit("connected")
  }
}

function onJoinError(err) {
  console.log("Unable to join room, starting up new server", err)
  // Kill any connections so that client doesn't end up joining to self
  this.peer.disconnect()
  serve.call(this)
}

function onServerData(data) {
  //console.log("Received data from server", data)
  this.emit(data.event, data)
}

function onServerTime(data) {
  if (this.isServer()) return

  var serverTime = data.context.time + data.context.latency / 2
  this.serverTimeOffset = serverTime - Date.now() / 1000
  this.latency = data.context.latency
}

function onServerDisconnected() {
  migrate.call(this)
}

function onClientData(conn, data) {
  // console.log("Received client data", data)

  var relay = data.relay || ""
  var broadcast = data.broadcast

  // If directed at a user other than us, forward data.
  if (!broadcast && relay && relay != this.peer.id)
    return this.send(data.event, data.context, data)

  // If directed at the server emit it.
  if (relay == this.peer.id || !broadcast) return this.emit(data.event, data)

  // broadcast
  this.send(data.event, data.context, data)
}

function onClientDisconnected(conn) {
  var client = this.clients[conn.peer]
  var connType = conn.reliable ? "reliable" : "unreliable"
  if (client && client[connType]) {
    delete client[connType]
  }

  // Both connections removed?
  if (!client.reliable && !client.unreliable) {
    this.send("playerexit", this.players[conn.peer])
    delete this.players[conn.peer]
    delete this.clients[conn.peer]
  }

  console.log("User closed", conn)
}

// conn.peer should be the same for both reliable and unreliable connections
function onClientConnected(conn) {
  console.log(conn.reliable ? "Reliable" : "Unreliable", " cient connected ", conn.peer)

  var player = this.players[conn.peer] = {
    id: conn.peer,
    name: this.generateName()
  }

  var client = this.clients[conn.peer] = this.clients[conn.peer] || {}
  client[conn.reliable ? "reliable" : "unreliable"] = conn

  conn.on("data", onClientData.bind(this, conn))
  conn.once("close", onClientDisconnected.bind(this, conn))

  conn.once("open", (function(conn){
    if (conn.reliable) {
      // Send new player info to everyone including new player
      this.send("playerenter", player, {reliable: true})
      // Send updated players listing to new player
      this.send("players", this.players, {relay: player.id, reliable: true})
    }
    else {
      pingClient.call(this, player.id, MAX_PINGS)
    }
  }).bind(this, conn))
}

function pingClient(id, times) {
  if (this.players[id].pinging) return
  times = times || 1
  this.players[id].pinging = true
  this.players[id].latencies = []

  while (times-- > 0) {
    setTimeout((function(){
      this.send("ping", {time : Date.now() / 1000, which : pingCounter++}, {relay : id})
    }).bind(this), times * 250)
  }
}

function sendPlayerUpdate (send, player) {
  var obj = {}
  obj[player.id] = player
  send("players", obj)
}

function onSetName (e) {
  this.players[e.sender].name = e.context
  sendPlayerUpdate(this.send.bind(this), this.players[e.sender])
}

function onPlayers (e) {
  var players = this.players
  Object.keys(e.context).forEach(function (id) {
    players[id] = e.context[id]
  })
  console.log("players updated")
}

function onPlayerEnter (e) {
  this.players[e.context.id] = e.context
  console.log("playerenter", e.context.id)
}

function onPlayerExit (e) {
  console.log("onPlayerExit", e)
  if (e.context && this.players[e.context.id])
    delete this.players[e.context.id]
}

function onPing(e) {
  // "Pong" back to sender - only if client
  if (!this.isServer())
    this.send("pong", e.context)
}

function onPong(e) {
  if (!this.isServer()) return

  // We received a pong to our ping request.
  var latency = Date.now() / 1000 - e.context.time
  var player = this.players[e.sender]
  var latencies = player.latencies = player.latencies || []
  latencies.push(latency)

  if (latencies.length < MIN_PINGS) return

  // Once we gathered enough packets, we can do a median check to get the latency
  player.latency = latencies.sort()[Math.floor(latencies.length / 2)]
  player.latencies = []
  player.pinging = false

  this.send("servertime", {
    time: Date.now() / 1000,
    latency: player.latency
  })
}

function onServerStarted() {
  console.log("server started")
  this.emit('createdserver')
  this.serving = true
  this.connected = true
  this.players[this.peer.id] = {
    id: this.peer.id,
    name: this.generateName(),
    isHost: true
  }
  // sending playerenter event to ourself as server mainly so engine can create,
  // since theres no players and sending to all also emits for server, this will basically be emitted instantly
  this.send("playerenter", this.players[this.peer.id])
}

function onServerError(e) {
  console.error("Server error:", e)
  if (e.type === "unavailable-id") {
    console.log("server id taken, connecting to server")
    this.connect(this.room)
  }
   else {
    this.emit('createservererror', e)
  }
}

function serve() {
  console.log("starting server")
  // In case this was previously a client, delete the client to host connection
  removeServerListeners.call(this)
  delete this.server
  nameCounter = 0
  this.clients = {}
  this.connected = false
  this.emit("createserver")

  var peer = this.peer = new Peer(this.room, {key : API_KEY})
  peer.once("open", onServerStarted.bind(this))
  peer.on("connection", onClientConnected.bind(this))
  peer.on("error", onServerError.bind(this))
}

function migrate() {
  var id = this.peer.id
    , players = this.players
    , pkeys = Object.keys(players)
    , hostId = pkeys.filter(function (id) {
      return players[id].isHost
    })[0]
    , nextHostId = Object.keys(players).filter(function (id) {
      return !players[id].isHost
    })[0]

  console.log("next host", nextHostId)

  // Reset
  players[hostId].isHost = false
  players[nextHostId].isHost = true

  // Make sure we emit the migration event before the playerexit event so listeners can 
  // handle the player who is about to exit before he actually exits
  this.emit("migration", {
    event: "migration",
    context: {
      previousHost: hostId,
      newHost: nextHostId
    }
  })

  // Remove new host player from ourself since he will have old host's id when he becomes server
  this.emit("playerexit", {
    event: "playerexit",
    context: this.players[nextHostId]
  })

  console.log("migrating server to %s", id === nextHostId ? "self" : id)

  // Serve if we are next in line.
  if (id === nextHostId)
    serve.call(this, id)
  else if (nextHostId) {
    // todo: need better way but for now just wait a bit before connecting to new host since
    // if connect fail, serve is called instead but we already know our host
    setTimeout(function() {
      this.connect(nextHostId)
    }.bind(this), 1000)
  }
}

emitter(Connection.prototype)

module.exports = Connection
