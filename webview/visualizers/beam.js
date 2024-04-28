let jbeamData = null
let currentPartName = null
let beamCache // contains the high level object info
let selectedBeamIndices = null // arry of selected beam or null for no selection

// buffers for the 3d geometry
let linesObject // the scene object

function updateBeamViz() {

  let 
    vertexPositions = [],
    vertexColors = []

  let beamNodesCounter = 0
  let activeColor= [ "default", [.0, 1.0, .0, 1.0] ]

  beamCache = []

  for (let partName in jbeamData) {

    if(currentPartName && partName !== currentPartName) continue

    const 
      part = jbeamData[partName]
      bVirtualNodes= par.hasOwnProperty('virtualNodes')

    if(part.hasOwnProperty('beams') && part.nodes) {
      for (let beamId in part.beams) {
        const beam = part.beams[beamId]
        let node1, node2, beamVirtual = false
        
        //console.log(">beam>", beam, part.nodes[beam['id1:']])

        if(beam.beamColor && activeColor[0] != beam.beamColor){
          activeColor[0]= beam.beamColor
          activeColor[1]= parseColor(beam.beamColor)
        }

        let id

        if((id= beam['id1:']) in part.nodes) {
          node1 = part.nodes[id]
        } else if(bVirtualNodes && id in part.virtualNodes) {
          node1 = part.virtualNodes[id]
          beamVirtual = true
        }
        
        if((id= beam['id2:']) in part.nodes) {
          node2 = part.nodes[id]
        } else if(bVirtualNodes && id in part.virtualNodes) {
          node2 = part.virtualNodes[id]
          beamVirtual = true
        }

        if (node1 && node2) {
          beam.node1 = node1
          beam.node2 = node2
          beam.virtual = beamVirtual
          beam.nodePos1 = new THREE.Vector3(...node1.pos)
          beam.nodePos2 = new THREE.Vector3(...node2.pos)

          vertexPositions.push(...node1.pos)
          vertexPositions.push(...node2.pos)
          
          // save the color onto beam as an array of RGBA floats (for later use)
          // 2 colors, for [ FAR , CLOSE ] in viewport (onMouseMove)
          beam.color= beam.virtual ? [
            [0.0, .8, .8, .4], [0.0, 1.0, 1.0, .5] ]:
            [activeColor[1].map((i,e)=> i < 3 ? e*.8 : e),  activeColor[1]]

          vertexColors.push(...activeColor[1])
          vertexColors.push(...activeColor[1])

          beamCache.push(beam)
          beamNodesCounter+=2

        } else {
          console.log(`beam discarded: ${beam}`)
        }
      }
    }
  }
/*
  // Fill arrays with data for each node
  let vertexAlphas = []
  let vertexColors = []
  for (let i = 0; i < beamCache.length; i++) {
    const beam = beamCache[i]
    vertexAlphas.push(0.5)
    vertexAlphas.push(0.5)
    if(beam.virtual) {
      vertexColors.push(0, 1, 1)
      vertexColors.push(0, 1, 1)
    } else {
      vertexColors.push(0, 1, 0)
      vertexColors.push(0, 1, 0)
    }
  }*/

  let lineGeometry
  if(linesObject && linesObject.geometry) {
    lineGeometry = linesObject.geometry
  } else {
    lineGeometry = new THREE.BufferGeometry()
  }
  updateVertexBuffer(lineGeometry, 'position', vertexPositions, 3)
  updateVertexBuffer(lineGeometry, 'color', vertexColors, 4)
  lineGeometry.computeBoundingBox()
  lineGeometry.computeBoundingSphere()

  let lineMaterial
  if(linesObject && linesObject.material) {
    lineMaterial = linesObject.material
  } else {
    lineMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec4 color;
        varying vec4 vColor;

        void main() {
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec4 vColor;

        void main() {
          gl_FragColor = vec4(vColor);
        }
      `,
      transparent: true,
      //depthTest: true,
      //side: THREE.DoubleSide
    })
  }

  if(!linesObject) {
    linesObject = new THREE.LineSegments(lineGeometry, lineMaterial);
    linesObject.name = 'linesObject'
    scene.add(linesObject)
  }
}

function onMouseMove(event) {
  if(!linesObject || !linesObject.geometry) return
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  if(!beamCache) return

  raycaster.setFromCamera(mouse, camera)

  const colorAttribute = linesObject.geometry.getAttribute('color')

  let maxDistance = 1 // Maximum distance to affect the alpha

  for (let i = 0; i < beamCache.length; i++) {
    if(selectedBeamIndices && selectedBeamIndices.includes(i)) continue
    const 
      distance = Math.min(raycaster.ray.distanceToPoint(beamCache[i].nodePos1), raycaster.ray.distanceToPoint(beamCache[i].nodePos2)),
      color= getFullColorFromDistance(distance, maxDistance, ...beamCache[i].color),
      idx= i*2

    color[3]= 1.0 - (color[3] * 0.6)

    colorAttribute.setXYZ(idx  , ...color)
    colorAttribute.setXYZ(idx+1, ...color)
  }
  colorAttribute.needsUpdate = true
}

function focusBeams(beamsArrToFocus, triggerEditor = true) {
  if (!beamsArrToFocus || !linesObject || !linesObject.geometry) return

  let sumX = 0
  let sumY = 0
  let sumZ = 0
  let beamCounter = 0

  //console.log('hit node:', node)
  selectedBeamIndices = beamsArrToFocus

  // color the node properly
  const alphasAttribute = linesObject.geometry.getAttribute('alpha');
  const colorsAttribute = linesObject.geometry.getAttribute('color');
  for (let i = 0; i < beamCache.length; i++) {
    const beam = beamCache[i]
    if(selectedBeamIndices.includes(i)) {
      alphasAttribute.setX(i*2, 1)
      alphasAttribute.setX(i*2 + 1, 1)
      colorsAttribute.setXYZ(i*2, 1, 0, 1)
      colorsAttribute.setXYZ(i*2 + 1, 1, 0, 1)
      sumX += beam.node1.pos[0]
      sumY += beam.node1.pos[1]
      sumZ += beam.node1.pos[2]
      sumX += beam.node2.pos[0]
      sumY += beam.node2.pos[1]
      sumZ += beam.node2.pos[2]
      beamCounter += 2 // because of 2 nodes
      continue
    }
    alphasAttribute.setX(i*2, 0.1)
    alphasAttribute.setX(i*2 + 1, 0.1)
    if(beam.virtual) {
      colorsAttribute.setXYZ(i*2, 0, 1, 1);
      colorsAttribute.setXYZ(i*2 + 1, 0, 1, 1);
    } else {
      colorsAttribute.setXYZ(i*2, 0, 1, 0);
      colorsAttribute.setXYZ(i*2 + 1, 0, 1, 0);
    }
  }
  alphasAttribute.needsUpdate = true;
  colorsAttribute.needsUpdate = true;

  if(selectedBeamIndices.length === 0) selectedBeamIndices = null
  // TODO:
  //if(triggerEditor) {
  //  highlightNodeinTextEditor()
  //}

  if(beamCounter > 0) {
    let beamCenterPos = new THREE.Vector3(sumX / beamCounter, sumY / beamCounter, sumZ / beamCounter)
    moveCameraCenter(beamCenterPos)
  }
}

function onCursorChangeEditor(message) {
  if(!beamCache) return

  if(currentPartName !== message.currentPartName) {
    currentPartName = message.currentPartName
    updateBeamViz()
  }

  let beamsFound = []
  // Helper function to check if the cursor is within a given range
  const cursorInRange = (range) => {
    // only check the lines for now
    return range[0] >= message.range[0] && range[0] <= message.range[2]
  };

  for (let i = 0; i < beamCache.length; i++) {
    if (cursorInRange(beamCache[i].__meta.range)) {
      beamsFound.push(i)
    }
  }

  console.log(message.range, beamsFound, beamCache)

  focusBeams(beamsFound, false)
}

function onReceiveMessage(event) {
  //console.log(">>> onReceiveMessage >>>", event)
  const message = event.data;
  switch (message.command) {
    case 'jbeamData':
      jbeamData = message.data
      selectedBeamIndices = null
      currentPartName = null
      //console.log("GOT DATA: ", jbeamData)
      updateBeamViz()
      break;
    case 'cursorChanged':
      onCursorChangeEditor(message)
      break
  }
}

export function init() {
  window.addEventListener('message', onReceiveMessage);
  window.addEventListener('mousemove', onMouseMove, false);
}

export function dispose() {
  window.removeEventListener('message', onReceiveMessage);
  window.removeEventListener('mousemove', onMouseMove);
  if(linesObject) {
    if (linesObject.geometry) linesObject.geometry.dispose()
    if (linesObject.geometry) linesObject.geometry.dispose()
    scene.remove(linesObject)
  }
}

export function onConfigChanged() {
  //console.log('beam.onConfigChanged', ctx.config)
}
