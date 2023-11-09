let jbeamData = null
let currentPartName = null
let uri = null
let pointsCache // the high level points in the cache
let selectedNodeIndices = null // array of selected nodes

// vertex buffers
let vertexAlphas = []
let vertexColors = []
let vertexSizes = []
let pointsObject // the scene object

// computed data for display
let nodesMin
let nodesMax
let nodesCenter
let nodeCounter

let wasWindowOutOfFocus = false // to track if the user left the view

function highlightNodeinTextEditor() {
  if(!selectedNodeIndices || selectedNodeIndices.length !== 1) return
  const node = pointsCache[selectedNodeIndices[0]]
  if(node && node.hasOwnProperty('__range')) {
    ctx.vscode.postMessage({
      command: 'selectLine',
      range: node.__range,
      uri: uri,
    });
    //console.log(">postMessage>", node.__range)
  }
}

function focusNodes(nodesArrToFocus, triggerEditor = true) {
  if (!nodesArrToFocus || !pointsObject) return
    
  let sumX = 0
  let sumY = 0
  let sumZ = 0
  let ncount = 0

  //console.log('hit node:', node)
  selectedNodeIndices = nodesArrToFocus

  // color the node properly
  const alphasAttribute = pointsObject.geometry.getAttribute('alpha');
  const colorsAttribute = pointsObject.geometry.getAttribute('color');
  const sizesAttribute = pointsObject.geometry.getAttribute('size');
  for (let i = 0; i < pointsCache.length; i++) {
    const node = pointsCache[i]
    if(selectedNodeIndices.includes(i)) {
      alphasAttribute.setX(i, 1)
      sizesAttribute.setX(i, 0.11)
      colorsAttribute.setXYZ(i, 1, 0, 1)
      sumX += node.pos[0]
      sumY += node.pos[1]
      sumZ += node.pos[2]
      ncount++
      continue
    }
    alphasAttribute.setX(i, 0.4)
    sizesAttribute.setX(i, 0.03)
    colorsAttribute.setXYZ(i, 1, 0.65, 0);
  }
  alphasAttribute.needsUpdate = true;
  colorsAttribute.needsUpdate = true;
  sizesAttribute.needsUpdate = true;

  if(triggerEditor) {
    highlightNodeinTextEditor()
  }

  if(selectedNodeIndices.length == 0) selectedNodeIndices = null

  if(ncount > 0) {
    let nodesCenterPos = new THREE.Vector3(sumX / ncount, sumY / ncount, sumZ / ncount)
    moveCameraCenter(nodesCenterPos)
  }

  ctx.visualizersGroundplane.redrawGroundPlane(nodesMin, nodesMax, selectedNodeIndices, pointsCache, jbeamData, currentPartName, nodeCounter)
}

function onCursorChangeEditor(message) {
  if(!pointsCache) return
  
  if(currentPartName !== message.currentPartName) {
    currentPartName = message.currentPartName
    selectedNodeIndices = null
    updateNodeViz(true)
  }
  
  let nodesFound = []
  // Helper function to check if the cursor is within a given range
  const cursorInRange = (range) => {
    // only check the lines for now
    return range[0] >= message.range[0] && range[0] <= message.range[2]
  };

  for (let i = 0; i < pointsCache.length; i++) {
    if (cursorInRange(pointsCache[i].__range)) {
      nodesFound.push(i)
    }
  }

  focusNodes(nodesFound, false)
}

function updateNodeViz(moveCamera) {
  nodeCounter = 0
  let vertexPositions = []
  pointsCache = []
  let sum = {x: 0, y: 0, z: 0}
  nodesMin = {x: Infinity, y: Infinity, z: Infinity}
  nodesMax = {x: -Infinity, y: -Infinity, z: -Infinity}  
  nodesCenter = null
  for (let partName in jbeamData) {
    if(currentPartName && partName !== currentPartName) continue
    let part = jbeamData[partName]
    if(part.hasOwnProperty('nodes')) {
      for (let nodeId in part.nodes) {
        let node = part.nodes[nodeId]
        // node.pos contains [x, y, z]
        if(node.hasOwnProperty('pos')) {
          const x = node.pos[0]
          vertexPositions.push(x)
          sum.x += x
          if(x < nodesMin.x) nodesMin.x = x
          else if(x > nodesMax.x) nodesMax.x = x
          
          const y = node.pos[1]
          vertexPositions.push(y)
          sum.y += y
          if(y < nodesMin.y) nodesMin.y = y
          else if(y > nodesMax.y) nodesMax.y = y

          const z = node.pos[2]
          vertexPositions.push(z)
          sum.z += z
          if(z < nodesMin.z) nodesMin.z = z
          else if(z > nodesMax.z) nodesMax.z = z

          nodeCounter++
          node.pos3d = new THREE.Vector3(x, y, z)
          pointsCache.push(node)
        }
      }

      if(nodeCounter > 0) {
        nodesCenter = new THREE.Vector3(sum.x / nodeCounter, sum.y / nodeCounter, sum.z / nodeCounter)
        part.__centerPosition = nodesCenter
      }
    }
  }
  if(nodeCounter == 0) {
    // do not leak Inf everywhere ...
    nodesMin = null
    nodesMax = null
  }  
  if(moveCamera) {
    selectedNodeIndices = null
    for (let partName in jbeamData) {
      if(currentPartName && partName !== currentPartName) continue
      let part = jbeamData[partName]
      if(part.__centerPosition) {
        moveCameraCenter(part.__centerPosition)
        break
      }
    }
  }

  // Fill arrays with data for each node
  for (let i = 0; i < nodeCounter; i++) {
    vertexAlphas.push(1)
    vertexColors.push(1, 0.65, 0)
    vertexSizes.push(1.05)
  }

  let nodesGeometry
  if(pointsObject && pointsObject.geometry) {
    nodesGeometry = pointsObject.geometry
  } else {
    nodesGeometry = new THREE.BufferGeometry()
  }
  updateVertexBuffer(nodesGeometry, 'position', vertexPositions, 3)
  updateVertexBuffer(nodesGeometry, 'alpha', vertexAlphas, 1)
  updateVertexBuffer(nodesGeometry, 'color', vertexColors, 3)
  updateVertexBuffer(nodesGeometry, 'size', vertexSizes, 1)
  nodesGeometry.computeBoundingBox()
  nodesGeometry.computeBoundingSphere()

  let nodesMaterial
  if(pointsObject && pointsObject.material) {
    nodesMaterial = pointsObject.material
  } else {
    nodesMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float alpha;
        attribute vec3 color;
        attribute float size;
    
        varying float vAlpha;
        varying vec3 vColor;
    
        uniform float scale;
        void main() {
          vAlpha = alpha;
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (scale / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float r = distance(gl_PointCoord, vec2(0.5, 0.5));
          if (r > 0.5) {
            discard;
          }
          gl_FragColor = vec4(vColor, vAlpha);
        }
      `,
      transparent: true,
      //blending: THREE.AdditiveBlending,
      depthTest: true
    })
  }
  
  if(!pointsObject) {
    pointsObject = new THREE.Points(nodesGeometry, nodesMaterial);
    scene.add(pointsObject);
  }

  ctx.visualizersGroundplane.redrawGroundPlane(nodesMin, nodesMax, selectedNodeIndices, pointsCache, jbeamData, currentPartName, nodeCounter)
}

function onMouseDown(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  if(!pointsCache) return

  raycaster.setFromCamera(mouse, camera);
  
  let closestPointIdx = null;
  let closestDistance = Infinity;
  for (let i = 0; i < pointsCache.length; i++) {
    const distance = raycaster.ray.distanceToPoint(pointsCache[i].pos3d);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestPointIdx = i;
    }
  }
  // If the closest point is within the desired threshold, we have a hit
  if(closestPointIdx !== null && closestDistance < 0.1) focusNodes([closestPointIdx])
}

function resetNodeFocus() {
  if(!pointsObject || !pointsObject.geometry) return
  const alphasAttribute = pointsObject.geometry.getAttribute('alpha');
  const colorsAttribute = pointsObject.geometry.getAttribute('color');
  const sizesAttribute = pointsObject.geometry.getAttribute('size');
  
  for (let i = 0; i < pointsCache.length; i++) {
    if(selectedNodeIndices && selectedNodeIndices.includes(i)) continue
    alphasAttribute.setX(i, 0.3)
    sizesAttribute.setX(i, 0.03)
    colorsAttribute.setXYZ(i, 1, 0.65, 0);
  }
  alphasAttribute.needsUpdate = true;
  colorsAttribute.needsUpdate = true;
  sizesAttribute.needsUpdate = true;
}

function onMouseMove(event) {

  if(wasWindowOutOfFocus) {
    // re-apply any text editor highlighting
    highlightNodeinTextEditor()
    wasWindowOutOfFocus = false
  }

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  if(!pointsCache) return

  raycaster.setFromCamera(mouse, camera);

  const alphasAttribute = pointsObject.geometry.getAttribute('alpha');
  const colorsAttribute = pointsObject.geometry.getAttribute('color');
  const sizesAttribute = pointsObject.geometry.getAttribute('size');
  
  let alphaDecay = 0.01; // The rate at which alpha value decreases with distance
  let maxDistance = 1; // Maximum distance to affect the alpha
  
  for (let i = 0; i < pointsCache.length; i++) {
    if(selectedNodeIndices && selectedNodeIndices.includes(i)) continue
    const distance = raycaster.ray.distanceToPoint(pointsCache[i].pos3d);

    // Normalize the distance based on a predefined maximum distance
    let normalizedDistance = distance / maxDistance;
    normalizedDistance = THREE.MathUtils.clamp(normalizedDistance, 0, 1); // Ensure it's between 0 and 1

    // Set alpha based on distance (closer points are less transparent)
    alphasAttribute.setX(i, 1.0 - (normalizedDistance * alphaDecay))
    sizesAttribute.setX(i, (1.0 - (normalizedDistance * 0.7)) * 0.05)

    let color = getColorFromDistance(distance, maxDistance, 0xFFA500, 0xddA500)
    colorsAttribute.setXYZ(i, color.r, color.g, color.b);
  }
  alphasAttribute.needsUpdate = true;
  colorsAttribute.needsUpdate = true;
  sizesAttribute.needsUpdate = true;
}

function onReceiveMessage(event) {
  const message = event.data;
  switch (message.command) {
    case 'jbeamData':
      jbeamData = message.data
      uri = message.uri
      selectedNodeIndices = null
      currentPartName = null
      updateNodeViz(!message.updatedOnly)
      break;
    case 'cursorChanged':
      onCursorChangeEditor(message)
      break
  }
}

function onMouseOut(event) {
  if(ctx && ctx.vscode) {
    ctx.vscode.postMessage({
      command: 'resetSelection',
      uri: uri,
    })
  }
  wasWindowOutOfFocus = true
  resetNodeFocus()
}

export function init() {
  window.addEventListener('message', onReceiveMessage);
  window.addEventListener('mousedown', onMouseDown, false);
  window.addEventListener('mousemove', onMouseMove, false); 
  window.addEventListener('mouseout', onMouseOut, false); 
}

export function dispose() {
  window.removeEventListener('message', onReceiveMessage);
  window.removeEventListener('mousedown', onMouseDown);
  window.removeEventListener('mousemove', onMouseMove); 
  window.removeEventListener('mouseout', onMouseOut)
  if(pointsObject) {
    if (pointsObject.geometry) pointsObject.geometry.dispose()
    if (pointsObject.material) pointsObject.material.dispose()
    scene.remove(pointsObject)
  }
}
