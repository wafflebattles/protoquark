var Map                = require("./map")
var Stage2D            = require("./stage2D")
var Stage3D            = require("./stage3D")
var geometrybuilder    = require("./geometrybuilder")
var Vector3            = THREE.Vector3
var downloadString     = require("tm-components/download-string")
var exportMap          = require("./exportmap")
var convert2Dto3D      = require("./coordinates").convert2Dto3D

var colorInputs = [
  "ceilingColor",
  "ceilingWallColor",
  "wallColor",
  "floorColor",
  "floorWallColor"
]

var toggleInputs = [
  "wall",
  "floor",
  "ceiling"
]

var keysUp = {
  87: function onStopMoving(e) {
    this.stage3D.stopMovingForward()
  },
  83: function onStopMoving(e) {
    this.stage3D.stopMovingForward()
  },
  65: function(e) {
    this.stage3D.stopStrafing()
  },
  68: function(e) {
    this.stage3D.stopStrafing()
  },
  16: function onShift(e) {
    this.multiSelect = false
  },
  66: function() {
    this.selectLargestArea = false
  }
}

var keysDown = {
  90: function onUndoLastPoint() {
    this.undoLastPoint()
  },
  88: function onDelete(e) {
    // Pressing x
    if (this.mode === "section") {
      var section = this.map.findSection(this.selectedSections[0])
      if (section && this.map.deleteSection(section)) {
        this.redraw2D()
        this.rebuild3DWorld()
      }
    }
    else if (this.mode === "block" && this.selectedBlock) {
      this.map.deleteBlock(this.selectedBlock)
      this.selectedBlock = null
      this.redraw2D()
    }
    else if (this.mode === "thing" && this.selectedThing) {
      this.map.deleteThing(this.selectedThing)
      this.selectedThing = null
      this.redraw2D()
    }
  },
  87: function onUp(e) {
    this.stage3D.startMovingForward(10)
  },
  83: function onDown(e) {
    this.stage3D.startMovingForward(-10)
  },
  65: function onLeft(e) {
    this.stage3D.startStrafing(-10)
  },
  68: function onRight(e) {
    this.stage3D.startStrafing(10)
  },
  86: function onSnapToVertex(e) {
    this.snapToVertex = !!!this.snapToVertex
    if (this.snapToVertex) this.snapToEdge = false
  },
  9: function onTab(e) {
    var mode = this.view = this.view === "2d" ? "3d" : "2d"
    if (this.view === "2d") {
      this.canvas.style.display = "block"
      this.stage3D.renderer.domElement.style.display = "none"
      document.exitPointerLock()
    }
    else {
      this.stage3D.resetLastLook()
      this.canvas.style.display = "none"
      this.stage3D.renderer.domElement.style.display = "block"
    }
    e.preventDefault()
  },
  69: function onSnapToEdge(e) {
    this.snapToEdge = !!!this.snapToEdge
    if (this.snapToEdge) this.snapToVertex = false
  },
  16: function onShift(e) {
    this.multiSelect = true
  },
  49: function onSectionMode(e) {
    this.mode = "section"
    this.thingContainerEl.style.display = "none"
    this.sectionContainerEl.style.display = "block"
  },
  50: function onThingMode(e) {
    this.mode = "thing"
    this.thingContainerEl.style.display = "block"
    this.sectionContainerEl.style.display = "none"
  },
  51: function onBlocksMode(e) {
    this.mode = "block"
    this.thingContainerEl.style.display = "none"
    this.sectionContainerEl.style.display = "block"
  },
  67: function onToggleCeiling(e) {
    this.ceilingSelection = !this.ceilingSelection
    this.rebuild3DSelection()
  },
  76: function onSetColorsToLast(e) {
    if (this.mode !== "section") return
    var selections = this.getSelections()
      , last = selections[selections.length - 1]

    colorInputs.forEach(function(prop) {
      for (var i = 0; i < selections.length - 1; i++) {
        var section = selections[i]
        section[prop] = last[prop]
      }
    })
    this.rebuild3DWorld()
  },
  77: function onSetHeightsToLast(e) {
    if (this.mode !== "section") return
    var selections = this.getSelections()
      , last = selections[selections.length - 1]
      , prop = this.ceilingSelection ? "ceilingHeight" : "floorHeight"
    for (var i = 0; i < selections.length - 1; i++) {
      var section = selections[i]
      section[prop] = last[prop]
    }
    if (selections.length)
      this.rebuild3DWorld()
  },

  66: function onSelectLargest() {
    this.selectLargestArea = true
  }
}

function Editor(canvas) {
  this.map = new Map()
  this.stage2D = new Stage2D(canvas, this.map)
  this.stage3D = new Stage3D(canvas.width, canvas.height)
  this.canvas = canvas
  this.view = "2d"
  this.mode = "section"
  this.snapCoords = true
  this.selectedSections = []
  this.selectedThing = null
  this.mapOffsets = {x: 0, y: 0}

  var mapDefaults = this.mapDefaults = {}

  this.stage3D.renderer.domElement.style.display = "none"

  this.map.on("sectionschanged", function() {this.rebuild3DWorld()}.bind(this))

  canvas.addEventListener("mousedown", onMouseDown.bind(this))
  canvas.addEventListener("mouseup", onMouseUp.bind(this))
  canvas.addEventListener("mousemove", onMouseMove.bind(this))
  canvas.addEventListener("contextmenu", function(e){e.preventDefault()})
  canvas.addEventListener("mousewheel", onMouseWheel.bind(this))

  var stage3DEl = this.stage3D.renderer.domElement
  stage3DEl.addEventListener("mousemove", onMouseMove.bind(this))
  stage3DEl.addEventListener("mousewheel", onMouseWheel.bind(this))
  stage3DEl.addEventListener("mousedown", onMouseDown.bind(this))
  stage3DEl.addEventListener("mouseup", onMouseUp.bind(this))
  stage3DEl.addEventListener("contextmenu", function(e){e.preventDefault()})

  window.addEventListener("keydown", onKeyDown.bind(this))
  window.addEventListener("keyup", onKeyUp.bind(this))
  // window.addEventListener("mousewheel", onMouseWheel.bind(this))

  document.addEventListener("pointerlockchange", function(evt) {
    this.pointerLocked = !!!this.pointerLocked
  }.bind(this))

  var floorHeightEl = this.floorHeightEl = document.getElementById("floorHeight")
  floorHeightEl.addEventListener("input", function() {
    var section = this.getSelectedSection()
    if (section) {
      section.floorHeight = parseFloat(floorHeightEl.value)
      buildPolygons.call(this, {x: this.canvas.width, y: this.canvas.height})
    }
  }.bind(this))
  floorHeightEl.disabled = true

  var ceilingHeightEl = this.ceilingHeightEl = document.getElementById("ceilingHeight")
  ceilingHeightEl.addEventListener("input", function() {
    var section = this.getSelectedSection()
    if (section) {
      section.ceilingHeight = parseFloat(ceilingHeightEl.value)
      buildPolygons.call(this, {x: this.canvas.width, y: this.canvas.height})
    }
  }.bind(this))
  ceilingHeightEl.disabled = true

  var thingTypeEl = this.thingTypeEl = document.getElementById("thingType")
  var thingChanceEl = this.thingChanceEl = document.getElementById("thingChance")
  var thingAmountEl = this.thingAmountEl = document.getElementById("thingAmount")

  var thingContainerEl = this.thingContainerEl = document.getElementById("thing")
  var sectionContainerEl = this.sectionContainerEl = document.getElementById("section")
  thingContainerEl.style.display = "none"

  thingTypeEl.addEventListener("change", function(evt) {
    if (this.selectedThing) this.selectedThing.type = thingTypeEl.value
  }.bind(this))

  thingChanceEl.addEventListener("change", function(evt) {
    if (this.selectedThing) this.selectedThing.chance = parseInt(thingChanceEl.value)
  }.bind(this))

  thingAmountEl.addEventListener("change", function(evt) {
    if (this.selectedThing) this.selectedThing.amount = parseInt(thingAmountEl.value)
  }.bind(this))

  var self = this
  colorInputs.forEach(function(input) {
    self[input] = document.getElementById(input)
    self[input].addEventListener("input", function(e) {
      onMapPropertyChanged.call(self, input, convertColorStringToInt(self[input].value))
    }.bind(self))
  })

  // editor will have properties of toggleInputs which will be the corresponding input element
  // map also has these properties as a boolean
  toggleInputs.forEach(function(input) {
    mapDefaults[input] = self.map[input]

    self[input] = document.getElementById(input)
    self[input].addEventListener("change", function(e) {
      onMapPropertyChanged.call(self, input, self[input].checked)
    }.bind(self))
  })

  document.getElementById("save").addEventListener("click", function(e) {
    downloadString("map.json", JSON.stringify({sections: this.map.sections, things: this.map.things, blocks: this.map.blocks}))
  }.bind(this))

  document.getElementById("exportObj").addEventListener("click", function(e) {
    var exporter = new THREE.OBJExporter()
    downloadString("map.obj", exporter.parse(this.stage3D.mesh, this.stage3D.geometry.visibleVertices, this.stage3D.geometry.visibleFaces))
  }.bind(this))

  document.getElementById("exportQuack").addEventListener("click", function(e) {
    downloadString("map.quack.json", exportMap(this))
  }.bind(this))

  syncColorValues.call(this, this.map)

  var fileInput = document.getElementById("file")
  fileInput.addEventListener("change", function(e) {
    var file = e.target.files[0]
      , reader = new FileReader();

    reader.onload = function(e) {
      var obj = JSON.parse(e.target.result)
      this.map.setSections(obj.sections)

      // just messing around with heights
      // this.map.rescaleHeight(.33)

      this.map.things = obj.things
      this.selectedThing = null

      this.map.setBlocks(obj.blocks || [])
      this.selectedBlock = null

      this.redraw2D()
      this.rebuild3DWorld()
    }.bind(this)

    reader.readAsText(file)
  }.bind(this))
}

Editor.prototype = {
  redraw2D: function redraw2D(mouseCoords) {
    this.stage2D.redraw(this.selectedSections, this.selectedThing, this.selectedBlock, mouseCoords, this.mapOffsets)
  },
  rebuild3DWorld: function rebuild3DWorld() {
    var worldGeometry = geometrybuilder.buildWorldGeometry(this.map, this.stage3D.geometry, this.canvas.width, this.canvas.height)
    this.sectionSurfaces = worldGeometry.sectionSurfaces
    this.blockSurfaces = worldGeometry.blockSurfaces
    this.rebuild3DSelection()
  },
  rebuild3DSelection: function rebuild3DSelection() {
    geometrybuilder.buildSelectionGeometry(this.getSelections(), this.stage3D.selectionGeometry, this.ceilingSelection, this.canvas.width, this.canvas.height)
  },
  rebuildHoverSelection: function rebuildHoverSelection(obj, ceiling) {
    geometrybuilder.buildSelectionGeometry([obj], this.stage3D.hoverGeometry, !!ceiling, this.canvas.width, this.canvas.height)
  },
  snapMouseCoords: function snapMouseCoords(mouseCoords) {
    if (!this.snapCoords) return mouseCoords
    var snap = 8
    mouseCoords.x = Math.floor(mouseCoords.x / snap) * snap
    mouseCoords.y = Math.floor(mouseCoords.y / snap) * snap
    return mouseCoords
  },
  getPoint: function getPoint(evt) {
    if (this.snapToEdge)
      return this.map.getClosestOnEdge(this.getMouseCanvas(evt))
    else if (this.snapToVertex)
      return this.map.getClosestOnVertex(this.getMouseCanvas(evt))
    else
      return this.snapMouseCoords(this.getMouseCanvas(evt))
  },
  undoLastPoint: function undoLastPoint() {
    var points = this.map.points
    if (this.view === "2d" && points.length > 0) {
      points.splice(points.length - 1, 1)
      this.redraw2D()
    }
  },
  scrollMap: function(mouseCoords) {
    if (!this.scrollCoords) {
      this.scrollCoords = mouseCoords
      return
    }
    var lastCoords = this.scrollCoords
      , newCoords = this.scrollCoords = mouseCoords
    this.mapOffsets.x += lastCoords.x - newCoords.x
    this.mapOffsets.y += lastCoords.y - newCoords.y
    this.mapOffsets.x = Math.max(0, this.mapOffsets.x)
    this.mapOffsets.y = Math.max(0, this.mapOffsets.y)
  },
  getMouseCanvas: function getMouseCanvas(evt, offset) {
    offset = offset || this.mapOffsets
    return computeMouseCoords(evt, this.canvas, offset)
  },
  getMouseRenderer: function getMouseRenderer(evt) {
    return computeMouseCoords(evt, this.stage3D.renderer.domElement, {x: 0, y:0})
  },
  getMouseRendererDelta: function(evt) {
    return {x: evt.movementX, y: evt.movementY}
  },
  getSelections: function() {
    if (this.mode === "section")
      return this.selectedSections.map(function(id) {
        return this.map.findSection(id)
      }.bind(this))
    else if (this.mode === "thing" && this.selectedThing)
      return [this.selectedThing]
    else if (this.mode === "block" && this.selectedBlock)
      return [this.selectedBlock]
    return []
  }
}

// ex. el.value === "#ff0000"
// convertColorStringToInt(el.value)
function convertColorStringToInt(value) {
  return parseInt(value.substring(1), 16)
}

function onMouseDown(evt) {
  if (evt.button === 0)
    onLeftMouseDown.call(this, evt)
  else if (evt.button === 2)
    onRightMouseDown.call(this, evt)
  else {
    onMiddleMouseDown.call(this, evt)
  }
}

function onMouseUp(evt) {
  if (evt.button === 1) {
    this.scrollMap(this.getMouseCanvas(evt, {x: 0, y:0}))
    this.scrollCoords = null
    this.redraw2D()
  }
  else if (evt.button === 0) {
    this.leftMouseDown = false
  }
}

function onMapPropertyChanged(propName, value) {
  // items changed should be selection
  // if no selection, then change the default map properties
  var items = this.getSelections()
    , isMap = !items.length
  if (isMap) items = [this.map]

  for (var i = 0; i < items.length; i++) {
    if (typeof items[i][propName] === undefined) continue
    items[i][propName] = value
  }

  if (!isMap && this.selectedSections.length) {
    this.rebuild3DWorld()
  }

  if (isMap) {
    this.mapDefaults[propName] = value
  }
}

// Sync input element values
function onSectionsSelected() {
  var selections = this.selectedSections
    , section = this.map.findSection(selections[0])
    , lastSection = this.map.findSection(selections[selections.length - 1])
    , map = this.map

  toggleInputs.forEach(function(input) {
    this.map[input] = lastSection ? lastSection[input] : this.mapDefaults[input]
    this[input].checked = this.map[input]
  }.bind(this))

  if (selections.length == 1 && section) {
    syncColorValues.call(this, section)
  }
  else if (selections.length >= 2) {

  }
  else if (!selections.length) {
    // Setting default.
    syncColorValues.call(this, map)
  }
}

function rgbIntToString(rgb) {
  // return "#" + padString(rgb >> 16, 2, "0") + padString((rgb >> 8) & 255, 2, "0") + padString(rgb & 255, 2, "0")
  return "#" + padString(rgb.toString(16), 6, "0")
}

function padString(str, min, pad) {
  while (str.length < min)
    str = pad + str
  return str
}

// Sync color element values to obj's color value
function syncColorValues(obj) {
  var self = this
  colorInputs.forEach(function(input) {
    if (typeof obj[input] !== undefined)
      self[input].value = rgbIntToString(obj[input])
  })
}

// mouseHandler[this.view][this.mode]
var leftMouseHandler = {
"2d": {
  section: function(evt) {
    // Clear opposite action (selecting) if other action is active, otherwise do primary action
    if (this.selectedSections.length > 0) {
      this.selectedSections = []
      onSectionsSelected.call(this)
    }
    else {
      this.map.addPoint(this.getPoint(evt))
    }
    this.redraw2D()
  },
  thing: function(evt) {
    this.map.addThing({
      position: this.getMouseCanvas(evt),
      type: this.thingTypeEl.value,
      chance: parseInt(this.thingChanceEl.value),
      amount: parseInt(this.thingAmountEl.value),
    })
    this.redraw2D()
  },
  block: function(evt) {
    this.map.addBlockPoint(this.getPoint(evt))
    this.redraw2D()
  }
},
"3d": {
  block: function(evt) {
    this.leftMouseDown = true
  },
  section: function(evt) {
    // this.stage3D.renderer.domElement.requestPointerLock()
  }
}
}

function onLeftMouseDown(evt) {
  if (leftMouseHandler[this.view] && leftMouseHandler[this.view][this.mode])
    leftMouseHandler[this.view][this.mode].call(this, evt)
}

var rightMouseHandler = {
"2d": {
  section: function(evt) {
    this.selectedBlock = null

    if (this.map.points && this.map.points.length > 0) {
      this.map.points = []
    }
    else {
      var section = this.map.findSectionUnder(this.getMouseCanvas(evt), this.selectLargestArea)
      if (!section) return

      var index = this.selectedSections.indexOf(section.id)
      if (section && index === -1) {
        if (this.multiSelect) {
          // in 2d mode, we are always picking the floor and not the ceiling
          this.ceilingSelection = false
          this.selectedSections.push(section.id)
        }
        else
          this.selectedSections[0] = section.id
      }
      else if (section)
        this.selectedSections.splice(index, 1)

      if (section) {
        onSectionsSelected.call(this)
      }
    }
    this.redraw2D()
  },
  thing: function(evt) {
    this.selectedThing = this.map.findThingUnder(this.getMouseCanvas(evt))
    if (this.selectedThing) {
      this.thingTypeEl.value   = this.selectedThing.type
      this.thingChanceEl.value = this.selectedThing.chance
      this.thingAmountEl.value = this.selectedThing.amount
    }
    else {
      // this.resetThingDefaults()
    }
    this.redraw2D()
  },
  block: function(evt) {
    if (this.map.blockPoints && this.map.blockPoints.length > 0) {
      this.map.blockPoints = []
    }
    else {
      this.selectedBlock = this.map.findBlockUnder(this.getMouseCanvas(evt))
    }
    this.redraw2D()
  }
},
"3d": {
  section: function(evt) {
    if (!this.sectionSurfaces) return
    var canvasDim = {x: this.canvas.width, y: this.canvas.height}
      // , pickResult = this.sectionSurfaces.pick({x: canvasDim.x / 2, y: canvasDim.y / 2}, canvasDim, this.stage3D.camera)
      , pickResult = this.sectionSurfaces.pick(this.getMouseRenderer(evt), canvasDim, this.stage3D.camera)
      , section = this.map.findSection(pickResult.id)

    if (pickResult.pick && section) {
      this.selectedSections = this.multiSelect ? this.selectedSections.concat([pickResult.id]) : [pickResult.id]
      this.ceilingSelection = pickResult.ceiling
    }
    else {
      this.selectedSections = []
      this.ceilingSelection = false
    }

    onSectionsSelected.call(this)
    this.redraw2D()
    this.rebuild3DSelection()
  },
  block: function(evt) {
    if (!this.blockSurfaces) return
    var pickResult = this.blockSurfaces.pick(this.getMouseRenderer(evt), {x: this.canvas.width, y: this.canvas.height}, this.stage3D.camera)
      , block = this.map.findBlock(pickResult.id)
    this.selectedBlock = block
    this.ceilingSelection = pickResult.ceiling
    this.selectedSections = []
    this.redraw2D()
    this.rebuild3DSelection()
  }
}
}

function onRightMouseDown(evt) {
  if (rightMouseHandler[this.view] && rightMouseHandler[this.view][this.mode])
    rightMouseHandler[this.view][this.mode].call(this, evt)
}

function onMiddleMouseDown(evt) {
  if (this.view === "2d")
    this.scrollMap(this.getMouseCanvas(evt, {x: 0, y:0}))
  else {
    var mouse = this.getMouseRenderer(evt)
      , dimensions = {x: this.canvas.width, y: this.canvas.height}
      , pickResult = this.sectionSurfaces.pick(mouse, dimensions, this.stage3D.camera)
      , section = this.map.findSection(pickResult.id)
    if (!section) return

    // Place camera at section base so that camera is standing on it
    var camera = this.stage3D.camera
      , pos = new Vector3(0, 0, 0)
    for (var i = 0; i < section.points.length; i++) {
      var point = convert2Dto3D(section.points[i], section.floorHeight + 1.5, dimensions)
      pos.add(point)
    }
    pos.multiplyScalar(section.points.length ? 1/section.points.length : 1)

    camera.position.x = pos.x
    camera.position.y = pos.y
    camera.position.z = pos.z
  }
}

function onMouseWheel(evt) {
  var delta = evt.wheelDelta / 500

  var block = this.map.findBlock(this.selectedBlock ? this.selectedBlock.id : null)
  if (block) {
    evt.preventDefault()
    if (this.leftMouseDown || this.multiSelect)
      block.height += delta
    else
      block.y += delta

    this.rebuild3DWorld()
    return
  }

  var selections = this.selectedSections
  if (!selections.length) return

  evt.preventDefault()
  for (var i = 0; i < selections.length; i++) {
    var section = this.map.findSection(selections[i])
    if (!section) continue
    if (this.ceilingSelection) {
      section.ceilingHeight += delta
      this.ceilingHeightEl.value = section.ceilingHeight
    }
    else {
      section.floorHeight += delta
      this.floorHeightEl.value = section.floorHeight
    }
  }
  this.rebuild3DWorld()
}

function onMouseMove(evt) {
  if (this.scrollCoords) {
    // Dragging screen
    this.scrollMap(this.getMouseCanvas(evt, {x: 0, y:0}))
    this.redraw2D()
  }
  else if (this.view === "2d") {
    this.lastCoords = this.getPoint(evt)
    this.redraw2D(this.lastCoords)
  }
  else {
    var coords = this.getMouseRenderer(evt)
    this.stage3D.look(coords)
    hover3D.call(this, coords)
  }
}

function hover3D(mouseCoords) {
  var canvasDim = {x: this.canvas.width, y: this.canvas.height}
    , pickResult = this.sectionSurfaces.pick(mouseCoords, canvasDim, this.stage3D.camera)
    , section = this.map.findSection(pickResult.id)
  if (pickResult.pick && section) {
    this.rebuildHoverSelection(section, pickResult.ceiling)
  }
  else {
    this.rebuildHoverSelection(null)
  }
}

function onKeyDown(e) {
  if (keysDown[e.keyCode]) keysDown[e.keyCode].call(this, e)
}

function onKeyUp(e) {
  if (keysUp[e.keyCode]) keysUp[e.keyCode].call(this, e)
}

function computeMouseCoords(evt, element, offset) {
  offset = offset || {x: 0, y: 0}
  return new Vector3(evt.pageX - element.offsetLeft + offset.x, evt.pageY - element.offsetTop + offset.y, 0)
}

module.exports = Editor