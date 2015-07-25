var bullets      = require("./bullets")
var weapons      = require("../config/weapon")
var collision    = require("../collision")
var Vector3      = require("../math").vec3

var playerShape = new Vector3(.25, .65, .25)

function applyDelta(ent, delta, collision, colliders, stick) {
  var prev = new Vector3().copy(ent.position)
  var hit = collision.getSweptCollision(prev, delta, colliders, playerShape, stick)
  if (hit.collision) ent.position.copy(hit.position)
  else ent.position.add(delta)

  return hit.collision
}

module.exports = function updatePlayer(dt, ent) {
  var angle = ent.euler.y
  var sinAngle = Math.sin(angle)
  var cosAngle = Math.cos(angle)
  var speed = ent.speed || 4

  var delta = new Vector3(0, 0, 0)
  var colliders = this.colliders

  if (ent.control.forward || ent.control.backward) {
    var multiplier = ent.control.forward ? 1 : -1
    delta.x += sinAngle * speed * dt * multiplier
    delta.z -= cosAngle * speed * dt * multiplier
  }

  if (ent.control.strafeleft || ent.control.straferight) {
    var multiplier = ent.control.straferight ? 1 : -1
    delta.x += cosAngle * speed * dt * multiplier
    delta.z += sinAngle * speed * dt * multiplier
  }

  applyDelta(ent, delta, collision, colliders, false)

  if (ent.control.jump && !ent.jumping) {
    ent.jumping = true
    ent.jump = 4
  }

  // apply gravity
  ent.jump -= dt * 10
  var gravity = new Vector3(0, ent.jump * dt, 0)
  var minY = -1.0
  if (applyDelta(ent, gravity, collision, colliders, false) || ent.position.y < minY) {
    ent.position.y = Math.max(ent.position.y, minY)
    ent.jumping = false
    ent.jump = 0
  }

  if (ent.invincibility)
    ent.invincibility -= dt

  ent.updateRotation()

  // Queue up packets to send - we'll clear this once sent
  if (this.conn.connected) {
    ent.addSnapshot(this.conn.getServerTime(), ent.control)
  }

  var weapon = ent.weapon.active === "primary" ? ent.weapon.primary : ent.weapon.secondary
  if (!weapon) return

  var weaponStats = weapons[weapon.id]
    , delay = 1 / weaponStats.firerate

  weapon.shotTimer -= dt
  weapon.shotTimer = Math.max(weapon.shotTimer, 0)

  if (ent.control.shoot && (!ent.lastControl.shoot || weaponStats.automatic) && weapon.shotTimer <= 0 && weapon.ammunition > 0) {
    weapon.shotTimer = delay
    var bulletPos = ent.getOffsetPosition(new Vector3().addVectors(ent.weaponStartOffset, ent.position), ent.weaponOffsetPos)
    this.add(bullets.create(this.genLocalId(), ent, "normal", {
      position: bulletPos,
      damage: weaponStats.damage,
      speed: weaponStats.speed
    }))
    weapon.ammunition--
  }
  weapon.shotT = 1.0 - weapon.shotTimer / delay
}
