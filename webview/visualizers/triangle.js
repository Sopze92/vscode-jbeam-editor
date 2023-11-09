let jbeamData = null
let uri
let currentPartName = null

let vertexAlphas = [];
let vertexAlphaBuffer

let vertexColors = [];
let vertexColorBuffer

let vertexHighlight = [];
let vertexHighlightBuffer

let triObject
let triGeometry
let triMaterial
let triCache
let selectedTriIndices = null


function updateTriViz() {
  let triVertices = []
  let triIndices = []
  triCache = []
  let triIndexCounter = 0;
  
  for (let partName in jbeamData) {
    if (currentPartName && partName !== currentPartName) continue;
    let part = jbeamData[partName];
    if (part.hasOwnProperty('triangles')) {
      for (let triId in part.triangles) {
        let triangle = part.triangles[triId];
        if (part.nodes && triangle['id1:'] in part.nodes && triangle['id2:'] in part.nodes && triangle['id3:'] in part.nodes) {
          let node1 = part.nodes[triangle['id1:']];
          let node2 = part.nodes[triangle['id2:']];
          let node3 = part.nodes[triangle['id3:']];
          triVertices.push(node1.pos3d.x, node1.pos3d.y, node1.pos3d.z);
          triVertices.push(node2.pos3d.x, node2.pos3d.y, node2.pos3d.z);
          triVertices.push(node3.pos3d.x, node3.pos3d.y, node3.pos3d.z);
          triIndices.push(triIndexCounter++, triIndexCounter++, triIndexCounter++);

          triangle.node1 = node1
          triangle.node2 = node2
          triangle.node3 = node3
          triCache.push(triangle)
        }
      }
    }
  }

  for (let i = 0; i < triVertices.length; i++) {
    vertexColors.push(0, 0, 0.65);
    vertexAlphas.push(0.4)
    vertexHighlight.push(0)
  }

  if (triObject) {
    if(triGeometry) triGeometry.dispose();
    if(triMaterial) triMaterial.dispose();
    scene.remove(triObject);
  }
  
  if(triGeometry) {
    triGeometry.dispose()
  }

  triGeometry = new THREE.BufferGeometry();
  triGeometry.setIndex(triIndices);
  triGeometry.computeVertexNormals(); // Recompute normals for new geometry
  
  updateVertexBuffer(triGeometry, 'position', triVertices, 3)
  updateVertexBuffer(triGeometry, 'alpha', vertexAlphas, 1)
  updateVertexBuffer(triGeometry, 'color', vertexColors, 3)
  updateVertexBuffer(triGeometry, 'highlight', vertexHighlight, 1)

  if(!triMaterial) {
    triMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 color;
        attribute float alpha;
        attribute float highlight;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = color;
          vAlpha = alpha;
          vec3 newPosition = position + normal * highlight;
          vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          gl_FragColor = vec4(vColor, vAlpha);
        }
      `,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    })
  }

  triObject = new THREE.Mesh(triGeometry, triMaterial);
  scene.add(triObject);

  const subMeshWire = triObject.children.find(child => child instanceof THREE.LineSegments)
  if(!subMeshWire) {
    const wireframeGeometry = new THREE.WireframeGeometry(triGeometry);
    const wireframe = new THREE.LineSegments(wireframeGeometry, new THREE.LineBasicMaterial({
      color: 0xaaaaaa,
      linewidth: 1,
      transparent: true
    }));
    triObject.add(wireframe);
  }
}

function focusTris(trisArrToFocus) {
  if (!trisArrToFocus) return
    
  let sumX = 0
  let sumY = 0
  let sumZ = 0
  let tcount = 0

  selectedTriIndices = trisArrToFocus

  // color the tri properly
  const alphasAttribute = triGeometry.getAttribute('alpha')
  const colorsAttribute = triGeometry.getAttribute('color')
  const highlightAttribute = triGeometry.getAttribute('highlight')
  if(alphasAttribute) {
    for (let i = 0; i < triCache.length; i++) {
      const tri = triCache[i]
      if(selectedTriIndices.includes(i)) {
        alphasAttribute.setX(i*3  , 1)
        alphasAttribute.setX(i*3+1, 1)
        alphasAttribute.setX(i*3+2, 1)
        highlightAttribute.setX(i*3  , 0.01)
        highlightAttribute.setX(i*3+1, 0.01)
        highlightAttribute.setX(i*3+2, 0.01)
        colorsAttribute.setXYZ(i*3  , 1, 0, 1)
        colorsAttribute.setXYZ(i*3+1, 1, 0, 1)
        colorsAttribute.setXYZ(i*3+2, 1, 0, 1)
        sumX += tri.node1.pos3d.x
        sumX += tri.node2.pos3d.x
        sumX += tri.node3.pos3d.x
        sumY += tri.node1.pos3d.y
        sumY += tri.node2.pos3d.y
        sumY += tri.node3.pos3d.y
        sumZ += tri.node1.pos3d.z
        sumZ += tri.node2.pos3d.z
        sumZ += tri.node3.pos3d.z
        tcount+=3
        continue
      }
      alphasAttribute.setX(i*3  , 0.4)
      alphasAttribute.setX(i*3+1, 0.4)
      alphasAttribute.setX(i*3+2, 0.4)
      highlightAttribute.setX(i*3  , 0)
      highlightAttribute.setX(i*3+1, 0)
      highlightAttribute.setX(i*3+2, 0)
      colorsAttribute.setXYZ(i*3  , 0, 0, 0.65)
      colorsAttribute.setXYZ(i*3+1, 0, 0, 0.65)
      colorsAttribute.setXYZ(i*3+2, 0, 0, 0.65)
    }
    
    alphasAttribute.needsUpdate = true;
    colorsAttribute.needsUpdate = true;
    highlightAttribute.needsUpdate = true;
  }

  if(selectedTriIndices == []) selectedTriIndices = null

  if(tcount > 0) {
    let trisCenterPos = new THREE.Vector3(sumX / tcount, sumY / tcount, sumZ / tcount)
    moveCameraCenter(trisCenterPos)
  }
}

function onCursorChangeEditor(message) {
  if(!triCache) return
  
  if(currentPartName !== message.currentPartName) {
    currentPartName = message.currentPartName
    updateTriViz(true)
  }
  
  let trisFound = []
  // Helper function to check if the cursor is within a given range
  const cursorInRange = (range) => {
    // only check the lines for now
    return range[0] >= message.range[0] && range[0] <= message.range[2]
  };

  for (let i = 0; i < triCache.length; i++) {
    if (cursorInRange(triCache[i].__range)) {
      trisFound.push(i)
    }
  }

  focusTris(trisFound)
}

function onReceiveMessage(event) {
  const message = event.data;
  switch (message.command) {
    case 'jbeamData':
      jbeamData = message.data
      uri = message.uri
      currentPartName = null
      selectedTriIndices = null
      updateTriViz()
      break;
    case 'cursorChanged':
      onCursorChangeEditor(message)
      break      
  }
}

export function init() {
  window.addEventListener('message', onReceiveMessage);
}

export function dispose() {
  window.removeEventListener('message', onReceiveMessage);
  if(triObject) scene.remove(triObject);
  if(triGeometry) triGeometry.dispose();
  if(triMaterial) triMaterial.dispose();
}
