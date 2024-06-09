let jbeamData = null
let currentPartName = null
let currentSectionName = null
let isInSection = false
let uri = null
let daeFindfilesDone = false
let wasLoaded = false

export const 
  CFG_MESH_COLOR= 0,
  CFG_MESH_COLOR_ACTIVE= 1,
  CFG_WIRE_COLOR= 2,
  CFG_WIRE_COLOR_ACTIVE= 3,
  CFG_MESH_OPACITY= 4

const localConfig= Array(5)

// loadedMeshes is in utils

let selectedMeshIndices = null
let loadedCommonFolders

let _materials

export function forceLoadMeshes() {
  unloadMeshes()
  meshLibraryFull = []
  startLoadingMeshes()
}

export function startLoadingMeshes() {
  daeFindfilesDone = false
  daeLoadingCounter = 0
  daeLoadingCounterFull = 0
  loadedCommonFolders = ctx?.config?.sceneView?.meshes?.loadCommonFolder ?? false
  if(ctx.vscode) {
    ctx.vscode.postMessage({
      command: 'loadColladaNamespaces',
      data: Object.keys(meshFolderCache),
      uri: uri,
      loadCommon: loadedCommonFolders,
    });
  }
  wasLoaded = true
}

function onReceiveData(message) {
  jbeamData = message.data
  uri = message.uri
  meshFolderCache = message.meshCache
  meshLoadingEnabled = message.meshLoadingEnabled
  selectedMeshIndices = null
  currentPartName = null
  //console.log("meshVisuals.onReceiveData", message);

  // trigger loading dae

  if(!wasLoaded) {
    meshLibraryFull = [] // clear the library on file change
  }

  if(meshLoadingEnabled && (ctx?.config?.sceneView?.meshes?.loadByDefault ?? false)) {
    startLoadingMeshes()
  }
}

function tryLoad3dMesh(meshName, onDone) {
  if(!meshName) return

  // check if the mesh is by chance already full loaded ...
  if(meshLibraryFull[meshName]) {
    onDone(meshLibraryFull[meshName])
    return
  }

  // not loaded, lets try to load it ...
  meshName = meshName.trim()
  const uri = meshFilenameLookupLibrary[meshName]
  if(!uri) {
    console.error(`Mesh not found: '${meshName}'`, meshFilenameLookupLibrary)
    return
  }
  daeLoadingCounterFull++
  //console.log(`Loading dae ${uri} ...`)
  let cl = new ctx.colladaLoader.ColladaLoader()
  cl.load(uri, function (collada) {
    //console.log(`Loading dae ${uri} ... DONE`)
    daeLoadingCounterFull--
    //console.log("collada: ", collada)
    collada.scene.traverse((node) => {
      if (node instanceof THREE.Object3D) {
        // temp: use scene scale for the node
        //console.log("SCALE: ", node.scale.z, collada.scene.scale.x)
        node.scale.x *= collada.scene.scale.x
        node.scale.y *= collada.scene.scale.y
        node.scale.z *= collada.scene.scale.z
        meshLibraryFull[node.name.trim()] = node;
      } else {
        //console.log('ignored: ', node.name)
      }
    })
    //console.log(">meshLibraryFull>", meshName, meshLibraryFull, meshFilenameLookupLibrary)
    //if(!meshLibraryFull[meshName]) {
    //  console.log('###############################################')
    //  console.log(meshLibraryFull, meshName)
    //}
    onDone(meshLibraryFull[meshName])
  }, undefined, function (error) {
    //console.log(`Loading dae ${uri} ... ERROR`)
    daeLoadingCounterFull--
    console.error('An error happened during loading:', error);
  });
}

function finalizeMeshes() {
  //console.log(">>>> finalizeMeshes <<<<")
  //console.log('Adding meshes to scene ...')

  // update cache on the extension side of things ...
  ctx.vscode.postMessage({
    command: 'updateMeshCache',
    data: meshFolderCache,
  });


  meshFilenameLookupLibrary = {}
  for (let ns in meshFolderCache) {
    Object.assign(meshFilenameLookupLibrary, meshFolderCache[ns])
  }
  //console.log("meshFolderCache = ", meshFolderCache)
  //console.log("meshFilenameLookupLibrary = ", meshFilenameLookupLibrary)

  //console.log('jbeamData = ', jbeamData)

  // unload everything first
  unloadMeshes()

  for (let partName in jbeamData) {
    if(currentPartName && partName !== currentPartName) continue
    let part = jbeamData[partName]

    if(part.hasOwnProperty('flexbodies')) {
      for (let flexBodyId in part.flexbodies) {
        let flexbody = part.flexbodies[flexBodyId]
        //console.log('Fexbody: ', flexbody)

        tryLoad3dMesh(flexbody.mesh, (colladaNode) => {
          if(!colladaNode) {
            console.error(`Flexbody mesh not found: ${flexbody.mesh}`)
            return
          }
          colladaNode.traverse((mesh) => {
            if(mesh && mesh instanceof THREE.Mesh && mesh.geometry) {
              mesh.material = _materials[0]
              // Create a wireframe geometry from the mesh's geometry
              const wireframe = colladaNode.children.find(child => child instanceof THREE.LineSegments)
              if(!wireframe) {
                const 
                  wireframeGeometry = new THREE.WireframeGeometry(mesh.geometry),
                  wireframe = new THREE.LineSegments(wireframeGeometry, _materials[2])
                mesh.add(wireframe);
              }
            }
            if(flexbody.pos) {
              colladaNode.position.x = flexbody.pos?.x ?? 0
              colladaNode.position.y = flexbody.pos?.z ?? 0
              colladaNode.position.z = -flexbody.pos?.y ?? 0
            }
            colladaNode.rotation.x = -Math.PI / 2;
            colladaNode.__meta = flexbody.__meta
            colladaNode.traverse((n) => {
              n.castShadow = true
            })
            colladaNode.name = 'flexbody_' + flexbody.mesh
            scene.add(colladaNode)
            loadedMeshes.push(colladaNode)
          })
          //console.log(`Added Flexbody mesh to scene: ${flexbody.mesh}`)
        })
      }
    }

    if(part.hasOwnProperty('props')) {
      for (let propId in part.props) {
        let prop = part.props[propId]
        //console.log('Prop: ', flexbody)
        if(prop.mesh == 'SPOTLIGHT') continue

        tryLoad3dMesh(prop.mesh, (colladaNode) => {
          if(!colladaNode) {
            console.error(`Flexbody mesh not found: ${flexbody.mesh}`)
            return
          }
          colladaNode.traverse((mesh) => {
            if(mesh && mesh instanceof THREE.Mesh) {
              mesh.material = _materials[0]
              const wireframe = colladaNode.children.find(child => child instanceof THREE.LineSegments)
              if(!wireframe) {
                const 
                  wireframeGeometry = new THREE.WireframeGeometry(mesh.geometry),
                  wireframe = new THREE.LineSegments(wireframeGeometry, _materials[2])
                wireframe.name = 'prop_wireframe'
                mesh.add(wireframe);
              }
            }
            colladaNode.rotation.x = -Math.PI / 2;
            colladaNode.__meta = prop.__meta
            colladaNode.traverse((n) => {
              n.castShadow = true
            })
            prop.name = 'prop_' + prop.mesh
            scene.add(colladaNode)
            loadedMeshes.push(colladaNode)
          })
          //console.log(`Added Flexbody mesh to scene: ${flexbody.mesh}`)
        })
      }
    }
  }
}

function loadMeshShallow(uri, namespace) {
  //console.log(">loadMeshShallow>", uri, namespace)
  daeLoadingCounter++;
  //console.log(`Load mesh shallow ${uri} ...`)
  let cl = new ctx.colladaLoader.ColladaLoader()
  cl.load(uri, function (collada) {
    //console.log(`Load mesh shallow ${uri} ... DONE`)
    daeLoadingCounter--
    if(collada && collada.scene) {
      collada.scene.traverse(function (node) {
        if (node instanceof THREE.Object3D) {
          if(node.name) {
            //console.log("NODE?", node.name, node)
            if(!meshFolderCache[namespace]) meshFolderCache[namespace] = {}
            meshFolderCache[namespace][node.name.trim()] = uri
            //console.log(">> ASSIGN", namespace, node.name.trim(), uri)
          }
        }
      });
    }
    if (daeLoadingCounter == 0 && daeFindfilesDone) {
      //console.log('>> finalizeMeshes 1 >>', daeLoadingCounter, daeFindfilesDone)
      finalizeMeshes();
    }
  }, undefined, function (error) {
    //console.log(`Load mesh shallow ${uri} ... ERROR`)
    daeLoadingCounter--;
    console.error(error)
    if (daeLoadingCounter == 0 && daeFindfilesDone) {
      //console.log('>> finalizeMeshes 2 >>', daeLoadingCounter, daeFindfilesDone)
      finalizeMeshes();
    }
  }, true);
}

function unloadMeshes(){
  for (let key in loadedMeshes) {
    if(loadedMeshes[key].geometry) loadedMeshes[key].geometry.dispose()
    if(loadedMeshes[key].material) loadedMeshes[key].material.dispose()
    scene.remove(loadedMeshes[key]);
  }
  loadedMeshes = []
}

function updateMaterialColors(){

  _materials[0].color.set(localConfig[CFG_MESH_COLOR].hex24)
  _materials[1].color.set(localConfig[CFG_MESH_COLOR_ACTIVE].hex24)
  _materials[2].color.set(localConfig[CFG_WIRE_COLOR].hex24)
  _materials[3].color.set(localConfig[CFG_WIRE_COLOR_ACTIVE].hex24)

  _materials[0].opacity= localConfig[CFG_MESH_COLOR].float32[3] * localConfig[CFG_MESH_OPACITY]
  _materials[1].opacity= localConfig[CFG_MESH_COLOR_ACTIVE].float32[3] * localConfig[CFG_MESH_OPACITY]
  _materials[2].opacity= localConfig[CFG_WIRE_COLOR].float32[3] * localConfig[CFG_MESH_OPACITY]
  _materials[3].opacity= localConfig[CFG_WIRE_COLOR_ACTIVE].float32[3] * localConfig[CFG_MESH_OPACITY]

  
  for(let i=0; i<4; i++) {
    
    //console.log(`mat${i}: a: ${localConfig[CFG_MESH_COLOR+i].float32}`)
    _materials[i].needsUpdate= true
  }

  //console.log(`alpha: ${localConfig[CFG_MESH_OPACITY]}`)
}

function updateMaterialSelection() {
  for (let i = 0; i < loadedMeshes.length; i++) {
    const colladaNode = loadedMeshes[i]
    //console.log(colladaNode)
    if(!colladaNode) continue
      const
        selected = selectedMeshIndices ? selectedMeshIndices.includes(i) : false,
        subMeshWire = colladaNode.children.find(child => child instanceof THREE.LineSegments)
    //console.log("selection: ", selectedMeshIndices)
    if(subMeshWire && subMeshWire.material) subMeshWire.material= _materials[selected ? 3 : 2]
    if(colladaNode.material) colladaNode.material= _materials[selected ? 1 : 0]
  }

  //console.log(_materials[0])
}

function focusMeshes(meshesArrToFocus) {
  selectedMeshIndices = meshesArrToFocus
  if(selectedMeshIndices == []) selectedMeshIndices = null
  updateMaterialSelection()
}

function onCursorChangeEditor(message) {
  if(!loadedMeshes) return

  if(currentPartName !== message.currentPartName || currentSectionName !== message.currentSectionName) {
    currentPartName = message.currentPartName
    currentSectionName = message.currentSectionName
    isInSection = (currentSectionName === 'flexbodies' || currentSectionName === 'props')
    if(isInSection) {
      for (let i = 0; i < loadedMeshes.length; i++) {
        loadedMeshes[i].visible = true
      }
      if(meshLoadingEnabled && (wasLoaded || (ctx?.config?.sceneView?.meshes?.loadByDefault ?? false))) {
        startLoadingMeshes()
      }
    } else {
      for (let i = 0; i < loadedMeshes.length; i++) {
        scene.remove(loadedMeshes[i])
      }
      loadedMeshes = []
      return
    }
  }


  let meshesFound = []
  //console.log(">meshes.onCursorChangeEditor ", message.range)
  // Helper function to check if the cursor is within a given range
  const cursorInRange = (range) => {
    // only check the lines for now
    return range[0] >= message.range[0] && range[0] <= message.range[2]
  };

  for (let i = 0; i < loadedMeshes.length; i++) {
    if (loadedMeshes[i].__meta && cursorInRange(loadedMeshes[i].__meta.range)) {
      meshesFound.push(i)
    }
  }
  focusMeshes(meshesFound, false)
}

function onReceiveMessage(event) {
  //console.log(">>> meshVisuals.onReceiveMessage >>>", event)
  const message = event.data;
  //console.log("------ received message command:", message.command)
  switch (message.command) {
    case 'jbeamData':
      onReceiveData(message);
      break;
    case 'loadDaeFinal':
      loadMeshShallow(message.uri, message.namespace)
      break
    case 'daeFileLoadingDone':
      daeFindfilesDone = true
      if (daeLoadingCounter == 0 && daeFindfilesDone) {
        finalizeMeshes();
      }
      break
    case 'cursorChanged':
      onCursorChangeEditor(message)
      break
  }
}

export function init() {

  const _matParamsMesh= {
    metalness: 0.6,
    roughness: 0.3,
    side: THREE.FrontSide,
    transparent: true,
    // use alphaHash to solve z-sorting problems, (dithering alpha, like the mesh opacity in BeamNG)
    alphaHash: true,
    //premultipliedAlpha: meshOpacity < 1.0,
    //blending: meshOpacity < 1.0 ? THREE.CustomBlending : THREE.NormalBlending,
    // unused unless blending= THREE.CustomBlending
    //blendEquation: THREE.AddEquation,
    //blendSrc: THREE.SrcAlphaFactor,
    //blendDst: THREE.OneMinusSrcAlphaFactor
  }

  const _matParamsWire= {
    transparent: true,
    premultipliedAlpha: true,
    linewidth: 1
  }

  _materials= [
    new THREE.MeshStandardMaterial({ ..._matParamsMesh }),   // mesh
    new THREE.MeshStandardMaterial({ ..._matParamsMesh }),   // mesh selected
    new THREE.LineBasicMaterial({ ..._matParamsWire }),      // wire
    new THREE.LineBasicMaterial({ ..._matParamsWire })       // wire selected
  ]

  // force load default config from vscode
  onConfigChanged()

  window.addEventListener('message', onReceiveMessage);
}

export function dispose() {
  for (let key in loadedMeshes) {
    if(loadedMeshes[key].geometry) loadedMeshes[key].geometry.dispose()
    if(loadedMeshes[key].material) loadedMeshes[key].material.dispose()
    scene.remove(loadedMeshes[key]);
  }
  loadedMeshes = []

  window.removeEventListener('message', onReceiveMessage);
}

function onLocalConfigChanged() {
  updateMaterialColors()
}

export function onConfigChanged() {
  //console.log('mesh.onConfigChanged', ctx.config)

  const meshes= ctx?.config?.sceneView?.meshes?? null

  localConfig[CFG_MESH_COLOR]= parseColor(meshes?.color ?? "#a2a2a2")
  localConfig[CFG_MESH_COLOR_ACTIVE]= parseColor(meshes?.colorSelected ?? "#ccb387")
  localConfig[CFG_WIRE_COLOR]= parseColor(meshes?.wire ?? "#181818")
  localConfig[CFG_WIRE_COLOR_ACTIVE]= parseColor(meshes?.wireSelected ?? "#f78f2c")
  localConfig[CFG_MESH_OPACITY]= (meshes?.meshOpacity ?? 50.0) * .01

  const shoudlLoadCommonFolder = (meshes?.loadCommonFolder ?? false)
  if(shoudlLoadCommonFolder !== loadedCommonFolders) {
    // changed, lets reload the meshes
    startLoadingMeshes()
  }

  // update meshes
  onLocalConfigChanged()
}

export function setConfigParameter(index, value) {
  index= index | 0
  if(index < localConfig.length) {
    localConfig[index]= value
    //console.log(`mesh.setConfigParameter(): index=${index}, value=`, value)
    onLocalConfigChanged()
  }
}
