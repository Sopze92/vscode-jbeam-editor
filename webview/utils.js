let camera
let cameraPersp
let orthoCamera
let cameraIsPersp = true
let orbitControls
let selectedViewName = 'Front'
let scene = null
let renderer
let tooltipPool
let vscode
let meshFilenameLookupLibrary = {}
let meshLibraryFull = {}
let meshFolderCache = {}
let daeLoadingCounter = 0
let daeLoadingCounterFull = 0
let loadedMeshes = []
let meshLoadingEnabled = false
let centerViewOnSelectedNodes = false

const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()

let ctx = {}

const faceColors = {
  Top: 0xff0000,     // Red
  Bottom: 0x0000ff,  // Blue
  Left: 0x00ff00,    // Green
  Right: 0xffff00,   // Yellow
  Front: 0xff00ff,   // Magenta
  Back: 0x00ffff     // Cyan
}

const 
  BYTE_TO_FLOAT= 0.003921568627451,
  NULL_COLOR= getColorFromFloatRGBA(1.0,.0,1.0,1.0)

function interpolateColor(color1, color2, factor) {
  return color1.lerp(color2, factor)
}

function getContrastingColor(hexcolor) {
  const r = parseInt(hexcolor.slice(1, 3), 16)
  const g = parseInt(hexcolor.slice(3, 5), 16)
  const b = parseInt(hexcolor.slice(5, 7), 16)
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
  return (yiq >= 128) ? 'black' : 'white'
}

function roundNumber(num) {
  return (Math.round(num * 100) / 100).toFixed(2);
}

let gridXY
function updateGrid(scene, env) {
  let size = Math.round(env?.planeWidth);
  let divisions = size;
  //console.log('updateGrid', size, divisions)

  const colorFront = new THREE.Color(0xaaaaaa);
  const colorBack = new THREE.Color(0x808080);

  // Grid for the XZ plane (Right-Left)
  let gridXZ = new THREE.GridHelper(size, divisions, colorFront, colorBack);
  gridXZ.rotation.x = Math.PI / 2;
  gridXZ.material.opacity = 0.5;
  gridXZ.material.transparent = true;
  gridXZ.name = 'gridXZ'
  //scene.add(gridXZ);

  // Grid for the XY plane (Top-Bottom) - this is the ground plane grid
  if(gridXY) scene.remove(gridXY)
  gridXY = new THREE.GridHelper(size, divisions, colorFront, colorBack);
  gridXY.material.opacity = 0.5;
  gridXY.material.transparent = true;
  gridXY.name = 'gridXY'
  scene.add(gridXY);

  // Grid for the YZ plane (Front-Back)
  let gridYZ = new THREE.GridHelper(size, divisions, colorFront, colorBack);
  gridYZ.material.opacity = 0.5;
  gridYZ.material.transparent = true;
  gridYZ.rotateOnAxis(new THREE.Vector3(0, 0, 1), Math.PI / 2);  // Rotate around the Z-axis to make it vertical
  gridYZ.name = 'gridYZ'
  //scene.add(gridYZ);
}

function createDome(scene) {
  // Create a half-sphere geometry (dome)
  const domeRadius = 500; // Should be large enough to encompass your entire scene
  const domeWidthSegments = 60; // Adjust for more detail
  const domeHeightSegments = 40; // Adjust for more detail
  const domePhiStart = 0; // Starting angle
  const domePhiLength = Math.PI * 2; // Full circle
  const domeThetaStart = 0; // Starting height
  const domeThetaLength = Math.PI * 0.5; // Half-circle to make a dome

  const domeGeometry = new THREE.SphereGeometry(
    domeRadius,
    domeWidthSegments,
    domeHeightSegments,
    domePhiStart,
    domePhiLength,
    domeThetaStart,
    domeThetaLength
  );

  // Create a material with a solid color
  const domeMaterial = new THREE.MeshBasicMaterial({
    color: 0x808080, // Light blue color, for example
    side: THREE.BackSide // Render on the inside of the dome
  });

  // Create a mesh with the geometry and material
  const domeMesh = new THREE.Mesh(domeGeometry, domeMaterial);

  // Optionally, you may want to position the dome so that its bottom aligns with the ground level
  domeMesh.position.set(0, 0, 0); // Adjust as necessary

  // Add the dome to the scene
  domeMesh.name = 'domeMesh'
  scene.add(domeMesh);
}

// Map 3D coordinates to the 2D canvas
function map3Dto2D(point3D, env) {
  const normalizedX = (point3D.x - env.planeOrigin.x + env.planeWidth / 2) / env.planeWidth
  const normalizedZ = (point3D.z - env.planeOrigin.z + env.planeHeight / 2) / env.planeHeight
  const canvasX = normalizedX * env.canvasWidth
  const canvasY = normalizedZ * env.canvasHeight
  return {x: canvasX, y: canvasY};
}

// Draw an arrow between two points
let drawPrimitives = {}
drawPrimitives['arrow'] = function(context, env, arrow) {
  arrow.start2d = map3Dto2D(arrow.start, env);
  arrow.end2d = map3Dto2D(arrow.end, env);

  // Calculate the angle of the line
  const angle = Math.atan2(arrow.end2d.y - arrow.start2d.y, arrow.end2d.x - arrow.start2d.x);

  // Set the context font and calculate text width
  context.font = arrow.font
  const textWidth = context.measureText(arrow.label).width;

  // Calculate the position to draw the text so that it's centered along the line
  const textMidX = (arrow.start2d.x + arrow.end2d.x) / 2;
  const textMidY = (arrow.start2d.y + arrow.end2d.y) / 2;

  // Text padding from the line
  const textPadding = 10; // You can adjust this value as needed

  const lineLength = Math.sqrt(Math.pow(arrow.end2d.x - arrow.start2d.x, 2) + Math.pow(arrow.end2d.y - arrow.start2d.y, 2));

  // Calculate start and end points for the line segments
  // Create a gap for the text based on its width
  let gap = (textWidth / 2) + textPadding;
  if(gap * 2 > lineLength * 0.8) {
    gap = 0
  }
  let overSizedText = (textWidth > lineLength * 0.7) || lineLength > 400 // can text fit on the line?

  const startGapX = textMidX - gap * Math.cos(angle);
  const startGapY = textMidY - gap * Math.sin(angle);
  const endGapX = textMidX + gap * Math.cos(angle);
  const endGapY = textMidY + gap * Math.sin(angle);

  // Calculate the end points for the line to avoid overlapping with arrowheads
  const arrowSize = arrow.width * 3; // Size of the arrowhead
  const endLineX = arrow.end2d.x - arrowSize * Math.cos(angle);
  const endLineY = arrow.end2d.y - arrowSize * Math.sin(angle);
  const startLineX = arrow.start2d.x + arrowSize * Math.cos(angle);
  const startLineY = arrow.start2d.y + arrowSize * Math.sin(angle);

  // Draw the first line segment
  context.beginPath();
  context.moveTo(startLineX, startLineY);
  context.lineTo(startGapX, startGapY);
  context.strokeStyle = arrow.color;
  context.lineWidth = arrow.width; // Line thickness
  context.stroke();

  // Draw the second line segment
  context.beginPath();
  context.moveTo(endGapX, endGapY);
  context.lineTo(endLineX, endLineY);
  context.stroke();

  // Right arrowhead
  context.beginPath();
  context.moveTo(arrow.end2d.x, arrow.end2d.y);
  context.lineTo(arrow.end2d.x - arrowSize * Math.cos(angle - Math.PI / 6), arrow.end2d.y - arrowSize * Math.sin(angle - Math.PI / 6));
  context.lineTo(arrow.end2d.x - arrowSize * Math.cos(angle + Math.PI / 6), arrow.end2d.y - arrowSize * Math.sin(angle + Math.PI / 6));
  context.lineTo(arrow.end2d.x, arrow.end2d.y);
  context.fillStyle = arrow.color;
  context.fill();

  // Left arrowhead
  context.beginPath();
  context.moveTo(arrow.start2d.x, arrow.start2d.y);
  context.lineTo(arrow.start2d.x + arrowSize * Math.cos(angle - Math.PI / 6), arrow.start2d.y + arrowSize * Math.sin(angle - Math.PI / 6));
  context.lineTo(arrow.start2d.x + arrowSize * Math.cos(angle + Math.PI / 6), arrow.start2d.y + arrowSize * Math.sin(angle + Math.PI / 6));
  context.lineTo(arrow.start2d.x, arrow.start2d.y);
  context.fill();

  // Save the context's current state
  context.save();

  // Translate and rotate the canvas to draw the text along the line angle
  context.translate(textMidX, textMidY);
  context.rotate(angle);

  // Draw the text
  context.fillStyle = arrow.color
  context.textAlign = 'center'
  context.textBaseline = overSizedText ? 'bottom' : 'middle'

  context.fillText(arrow.label, 0, 0); // Draw the text at the new (0, 0)

  // Restore the context to its original state
  context.restore();
}

// Function to draw 2D text
drawPrimitives['text'] = function(context, env, item) {
  const pos2D = map3Dto2D(item.position, env)
  context.fillStyle = item.color // Set the text color
  context.font = item.font // Set the font (including size and style)
  context.textAlign = item.textAlign || 'center'
  context.textBaseline = item.textBaseline || 'middle'
  context.fillText(item.text, pos2D.x, pos2D.y);
}

// Function to draw 2D circles with optional outline and fill
drawPrimitives['circle'] = function(context, env, item) {
  context.save()
  const pos2D = map3Dto2D(item.position, env)
  context.beginPath() // Start a new path
  context.arc(pos2D.x, pos2D.y, item.size, 0, 2 * Math.PI)

  // Fill the circle if color is specified
  if (item.color) {
    context.fillStyle = item.color
    context.fill()
  }

  // Outline the circle if outline color is specified
  if (item.outlineColor) {
    context.strokeStyle = item.outlineColor
    context.lineWidth = item.outlineWidth || 1
    context.stroke()
  }
  context.restore()
}

drawPrimitives['line3d'] = function(context, env, item) {
  // Create the line geometry from the provided points
  const points = []
  points.push(item.pos1)
  points.push(item.pos2)
  const geometry = new THREE.BufferGeometry().setFromPoints(points)

  const material = new THREE.LineDashedMaterial({
    color: item.color || 0xffffff,
    linewidth: item.linewidth || 1,
    dashSize: item.dashSize || 3,
    gapSize: item.gapSize || 1,
  })
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances()
  line.name = 'drawPrimitives_line3d'
  return [line]
}

// Create a mesh with all arrows drawn on a canvas
let groundPlaneMesh = null
let groundPlaneTexture = null
let groundPlaneMaterial = null

function updateProjectionPlane(scene, items, _env = {}) {
  const env = {
    planeOrigin: {x: 0, y: 0, z: 0},
    planeWidth: 10, // Width of the plane in 3D units
    planeHeight: 10, // Height of the plane in 3D units
    canvasWidth: 8192, // Width of the canvas in pixels
    canvasHeight: 8192, // Height of the canvas in pixels
  }
  Object.assign(env, _env)
  //console.log('Ground plane constructing with: ', env)
  let canvas = document.getElementById('canvas2DGroundplane')
  // remove canvas if it exists
  if(canvas) {
    canvas.remove();
  }
  if(!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = env.canvasWidth;
    canvas.height = env.canvasHeight;
  }
  const context = canvas.getContext('2d');

  // Fill the canvas with blue for testing
  //context.fillStyle = 'blue';
  //context.fillRect(0, 0, env.canvasWidth, env.canvasHeight);

  // Draw each arrow on the canvas
  let objects = []
  items.forEach((item) => {
    let res = drawPrimitives[item.type](context, env, item)
    if(res) objects = objects.concat(res)
  });

  // Create texture and material from the canvas
  if(groundPlaneTexture) groundPlaneTexture.dispose()
  groundPlaneTexture = new THREE.CanvasTexture(canvas);
  groundPlaneTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  if(groundPlaneMaterial) groundPlaneMaterial.dispose()
  groundPlaneMaterial = new THREE.MeshBasicMaterial({ map: groundPlaneTexture, transparent: true, side: THREE.DoubleSide });

  if(groundPlaneMesh) {
    scene.remove(groundPlaneMesh)
    groundPlaneMesh = null
  }
  const planeGeometry = new THREE.PlaneGeometry(env.planeWidth, env.planeHeight);
  groundPlaneMesh = new THREE.Mesh(planeGeometry, groundPlaneMaterial);

  // Position the plane according to the 3D space
  groundPlaneMesh.position.set(env.planeOrigin.x, env.planeOrigin.y, env.planeOrigin.z);
  groundPlaneMesh.rotation.x = -Math.PI / 2;
  groundPlaneMesh.position.y = 0.01

  for(let o of objects) {
    groundPlaneMesh.add(o)
  }

  groundPlaneMesh.name = 'groundPlaneMesh'
  scene.add(groundPlaneMesh)
}

function moveCameraCenter(pos) {
  const offset = new THREE.Vector3().subVectors(pos, orbitControls.target);
  const newCameraPosition = new THREE.Vector3().addVectors(camera.position, offset);
  if(!camera.isOrthographicCamera) {
    new Tween(orbitControls.target)
      .to(pos, 120)
      .easing(Easing.Quadratic.Out)
      .start()

    new Tween(camera.position)
      .to(newCameraPosition, 120)
      .easing(Easing.Quadratic.Out)
      .start()
  } else {
    // TODO, not working properly
  }
}

/*
updateVertexBuffer(geometry, attributeName, items, itemSize)

Updates or creates a vertex attribute buffer associated with the provided geometry.

Parameters:
- geometry (THREE.BufferGeometry): The geometry to which the vertex attribute belongs.
- attributeName (String): The name of the attribute to update or create.
- items (Array or TypedArray): The new set of data to be used for the vertex attribute.
- itemSize (Number): The number of values per vertex that are stored in the array.

Behavior:
- If the attribute specified by attributeName does not exist or if its current array's length does not match the length of the items provided, a new THREE.BufferAttribute is created and assigned to the geometry.
- If the attribute exists and its size matches the provided items array, the existing buffer's array is updated with the new items.

Notes:
- The function ensures that the GPU memory is freed if a new buffer is created by disposing of the old buffer attribute.
- The usage of the buffer is set to THREE.DynamicDrawUsage, indicating that the data will change frequently and should be drawn dynamically.
- The buffer is flagged to update if only the values change without a change in the length of the array.

Example Usage:
updateVertexBuffer(mesh.geometry, 'position', newPositionsArray, 3);

This will update the 'position' buffer of mesh.geometry with newPositionsArray, where each vertex is represented by 3 values (x, y, z).
*/
function updateVertexBuffer(geometry, attributeName, items, itemSize) {
  let buffer = geometry.getAttribute(attributeName);
  if (!buffer || buffer.array.length !== items.length) {
    if (buffer) {
      geometry.deleteAttribute(attributeName)
      if (buffer.array) buffer.array = null
    }
    buffer = new THREE.Float32BufferAttribute(items, itemSize)
    buffer.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute(attributeName, buffer)
  } else {
    buffer.array.set(items)
    buffer.needsUpdate = true
  }
}

function getColorFromDistance(distance, maxDistance, colorHexA, colorHexB) {
  let clampedDistance = Math.min(distance, maxDistance);
  let normalizedDistance = clampedDistance / maxDistance;
  let color = new THREE.Color(colorHexB);
  color.lerp(new THREE.Color(colorHexA), normalizedDistance);
  return color;
}

function getFullColorFromDistance(dist, maxDist, colorFar, colorClose) {
  const normDist = Math.min(dist, maxDist) / maxDist
  return colorFar.map((i,e)=> e= e+colorClose[i]-e*normDist)
}

function getHexColorString(int, int32=true, incalpha=true){
  const 
    val= (int32 ? int : (int<<8) | 0xFF).toString(16).toUpperCase(),
    result= '#' + "0".repeat(8 - val.length) + val
  return incalpha ? result : result.slice(0,-2)
}

function getColorFromInt24(hex){ return getColorFromInt((hex>>8) | 0xFF)}
function getColorFromInt(hex){
  const
    float32= [ BYTE_TO_FLOAT * (hex>>24&0xFF), BYTE_TO_FLOAT * (hex>>16&0xFF), BYTE_TO_FLOAT * (hex>>8&0xFF), BYTE_TO_FLOAT * (hex&0xFF)],
    byte32= [ hex>>24&0xFF, hex>>16&0xFF, hex>>8&0xFF, hex&0xFF],
    hex32= hex,
    float24= float32.slice(0,-1),
    byte24= byte32.slice(0,-1),
    hex24= hex32>>8,
    lum= 0.299 * float32[0] + 0.587 * float32[1] + 0.114 * float32[2]
    return {float32, byte32, hex32, float24, byte24, hex24, lum}
}

function getColorFromFloatRGB(r, g, b){ return getColorFromFloatRGBA(r,g,b,1.0) }
function getColorFromFloatRGBA(r, g, b, a){
  const
    float32= [r, g, b, a],
    byte32= [ THREE.MathUtils.clamp(r*255, 0, 255), THREE.MathUtils.clamp(g*255, 0, 255), THREE.MathUtils.clamp(b*255, 0, 255), THREE.MathUtils.clamp(a*255, 0, 255) ],
    hex32= byte32[0]<<24 | byte32[1]<<16 | byte32[2]<<8 | byte32[3],
    float24= float32.slice(0,-1),
    byte24= byte32.slice(0,-1),
    hex24= hex32>>8,
    lum= 0.299 * r + 0.587 * g + 0.114 * b
  return {float32, byte32, hex32, float24, byte24, hex24, lum}
}

/** 
 * parses a color string, returns a custom color object used along jbeams, ui and materials 
 *  HEX: '#' followed by 3/4/6/8 HEX digits, as RGB, RGBA, RRGGBB or RRGGBBAA, ie: #00FF00FF
 *  BYTE: 'b' followed by 3/4 decimal bytes separated by commas as in RRR,GGG,BBB,AAA, ie: b128,255,128,255
 *  FLOAT: 'f' followed by 3/4 float values separated by commas as in R,G,B,A, ie: f0.5,1.0,0.5,1.0
 *  returns the given color or opaque magenta if errored
 * 
 *  this func is an exact javascript reimplementation of the one i've implemented for a mod in the actual game's 
 *  bdebugImpl.lua, used in custom node/beam dev-rendering modes that allow defining color properties for nodes/beams
 * 
 *  that way i can use it for the same exact purpose and get the same exact results while reading jbeam files
 *  also, that way would be easier for devs to finally implement user-colors in jbeams, believe me, is super-useful
 *  and all the code required is already been made
*/
function parseColor(col) {
  if(col){
    try {
      const type= typeof(col)
      if(type==='string'){
        let strvalue= col.substring(1)
        if(col[0]==='#'){
          const 
            len= strvalue.length,
            short= len==3 || len==4
          if(short){
            let strduped= ""
            for(i=0; i<len; i++) strduped+= strvalue[i] + strvalue[i]
            strvalue= strduped
          }
          if(len==6) strvalue+="FF"
          return getColorFromInt(parseInt(strvalue,16))
        }
        else if(strvalue.includes(',')){
          const 
            byte= col[0]==='b',
            colsplit= strvalue.split(','),
            chn= []
          for(let i in colsplit) chn.push(THREE.MathUtils.clamp( byte ? BYTE_TO_FLOAT * parseInt(colsplit[i]) : parseFloat(colsplit[i])), 0, 1.0)
          if(chn.length==3) chn.push(1.0)
          return getColorFromFloatRGBA(...chn)
        }
      }
      else if(type==='object') return getColorFromFloatRGBA(...[col.r, col.g, col.b, col.a])
    }
    catch(e) {
      console.log("parseColor() => unable to parse color string:", col)
      console.log(e)
    }
  }
  return NULL_COLOR // MAGENTA = error
}

function getOpaqueColor(col) {
  const _col= structuredClone(col)
  _col.float[3]= 1.0,
  _col.byte[3]= 255,
  _col.hex= col.hex | 0x000000FF
  return _col
}

function colorAdd(col1, col2){
  const float= structuredClone(col1.float32)
  for(i in float) float[i]= THREE.MathUtils.clamp(float[i] + col2.float32[i], .0, 1.0)
  return getColorFromFloatRGBA(...float)
}

function colorSub(col1, col2){
  const float= structuredClone(col1.float32)
  for(i in float) float[i]= THREE.MathUtils.clamp(float[i] - col2.float32[i], .0, 1.0)
  return getColorFromFloatRGBA(...float)
}

function colorMul(col1, col2){
  const float= structuredClone(col1.float32)
  for(i in float) float[i]*= col2.float32[i]
  return getColorFromFloatRGBA(...float)
}

function colorScale(col1, factor){
  const float= structuredClone(col1.float32)
  for(i in float) float[i]*= factor
  return getColorFromFloatRGBA(...float)
}

function colorLerp(col1, col2, factor) {
  let diff= 0
  for(i in data.float32) {
    diff= col.float32[i] - data.float32[i]
    data.float32[i]+= diff*factor
  }
  return getColorFromFloatRGBA(...float)
}

// simple 0.0-1.0 to 0%-100% formatter
function formatter_FloatToPercent(value) { return `${(value*100 | 0)}%` }

class Tooltip {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.fontSize = 40
    this.fontStr = `bold ${this.fontSize}px "Roboto Mono", monospace`
    this.createTooltipMesh();
    this.scale = 0.002
  }

  createTooltipMesh() {
    const texture = new THREE.Texture(this.createTextCanvas());
    texture.needsUpdate = true;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;

          float upwardTranslation = 0.01;

          mat4 billBoardMatrix = mat4(
              vec4(1.0, 0.0, 0.0, 0.0),
              vec4(0.0, 1.0, 0.0, 0.0),
              vec4(0.0, 0.0, 1.0, 0.0),
              vec4(modelViewMatrix[3].x, modelViewMatrix[3].y + upwardTranslation, modelViewMatrix[3].z, 1.0)
          );

          float scale;
          if (isOrthographic) {
            scale = 0.4 / (sqrt(projectionMatrix[0].x * projectionMatrix[1].y));
          }
          else {
            float distance = length(billBoardMatrix[3].xyz - cameraPosition);
            scale = distance * 0.15;
          }
          vec4 scaledPosition = vec4(position * scale, 1.0);

          // Calculate final position
          gl_Position = projectionMatrix * billBoardMatrix * scaledPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;

        void main() {
          gl_FragColor = texture2D(map, vUv);
        }
      `,
      transparent: true,
      depthTest: false,
      side: THREE.DoubleSide,
    });

    const geometry = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = false;

    this.scene.add(this.mesh);
  }

  updateTooltip(data) {
    if (!data) {
      this.mesh.visible = false
      return
    }

    const canvas = this.createTextCanvas(data);
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true
    this.mesh.material.uniforms.map.value.dispose(); // Dispose the old texture
    this.mesh.material.uniforms.map.value = texture; // Assign the new texture

    this.mesh.geometry.dispose(); // Dispose old geometry
    this.sizeX = canvas.width * this.scale
    this.sizeY = canvas.height * this.scale
    this.mesh.geometry = new THREE.PlaneGeometry(this.sizeX, this.sizeY);
    this.mesh.geometry.translate(this.sizeX * 0.5, this.sizeY * 0.5, 0)

    this.mesh.position.copy(data.pos3d)
    this.mesh.visible = true;
  }

  createTextCanvas(data) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const padding = 10; // Set the desired padding size
    const borderWidth = 2; // Set the desired border width

    if(data) {
      context.font = this.fontStr;
      // Add padding to canvas width and height to accommodate the border and padding
      canvas.width = context.measureText(data.name).width + (padding * 2) + (borderWidth * 2);
      canvas.height = this.fontSize + (padding * 2) + (borderWidth * 2);

      // Fill background with a semi-transparent grey
      context.fillStyle = 'rgba(200, 200, 200, 1)'; // The alpha should be between 0 and 1
      context.fillRect(borderWidth, borderWidth, canvas.width - (borderWidth * 2), canvas.height - (borderWidth * 2));

      // Draw the text with the padding offset
      context.font = this.fontStr;
      context.fillStyle = 'black';
      context.fillText(data.name, padding + borderWidth, this.fontSize + padding - 2);

      // Draw the black border
      context.strokeStyle = 'black';
      context.lineWidth = borderWidth;
      context.strokeRect(borderWidth / 2, borderWidth / 2, canvas.width - borderWidth, canvas.height - borderWidth);
    }
    return canvas;
  }

}

class TooltipPool {
  constructor(scene, camera, initialPoolSize) {
    this.scene = scene;
    this.camera = camera;
    this.poolSize = initialPoolSize;
    this.tooltips = [];
    this.initPool();
  }

  initPool() {
    for (let i = 0; i < this.poolSize; i++) {
      this.addTooltipToPool();
    }
  }

  addTooltipToPool() {
    const tooltip = new Tooltip(this.scene, this.camera);
    this.tooltips.push(tooltip);
  }

  updateTooltips(dataList) {
    // Adjust pool size if necessary
    if (dataList.length > this.poolSize) {
      for (let i = this.poolSize; i < dataList.length; i++) {
        this.addTooltipToPool();
      }
      this.poolSize = dataList.length;
      console.log('increased pool size to ', this.poolSize)
    }

    // Reset all tooltips
    for (let i = 0; i < this.poolSize; i++) {
      const data = (i < dataList.length) ? dataList[i] : null
      this.tooltips[i].updateTooltip(data)
    }
  }

}
