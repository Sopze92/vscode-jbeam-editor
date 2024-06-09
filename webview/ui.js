let meshLoadingBtn
let views = [
  {name: 'Top'          , onActivate() { animateCameraMovement(new THREE.Vector3(0, 10, 0)) }},
  {name: 'Bottom'       , onActivate() { animateCameraMovement(new THREE.Vector3(0,-10, 0)) }},
  {name: 'Left'         , onActivate() { animateCameraMovement(new THREE.Vector3(-10,0, 0)) }},
  {name: 'Right'        , onActivate() { animateCameraMovement(new THREE.Vector3(10, 0, 0)) }},
  {name: 'Front'        , onActivate() { animateCameraMovement(new THREE.Vector3(0, 0, 10)) }},
  {name: 'Back'         , onActivate() { animateCameraMovement(new THREE.Vector3(0, 0,-10)) }},
  {name: 'Isometric'    , onActivate() { animateCameraMovement(new THREE.Vector3(10,10,10)) }},
]

const 
  nodeVisModes = [
    {name: 'Off'              , onActivate(e) { console.log(e) }},
    {name: 'Simple'           , onActivate(e) { console.log(e) }},
    //{name: 'User-Color'       , onActivate(e) { console.log(e) }}, // not official, future commit maybe?
    {name: 'Weigths'          , onActivate(e) { console.log(e) }},
    {name: 'Density'          , onActivate(e) { console.log(e) }}
  ],
  nodeTextVisModes = [
    {name: 'Off'              , onActivate(e) { console.log(e) }},
    {name: 'Names'            , onActivate(e) { console.log(e) }},
    {name: 'Numbers'          , onActivate(e) { console.log(e) }},
    {name: 'Names+Numbers'    , onActivate(e) { console.log(e) }},
    {name: 'Weights'          , onActivate(e) { console.log(e) }},
    {name: 'Materials'        , onActivate(e) { console.log(e) }},
    {name: 'Groups'           , onActivate(e) { console.log(e) }}
  ],
  beamVisModes = [
    {name: 'Off'              , onActivate(e) { console.log(e) }},
    {name: 'Simple'           , onActivate(e) { console.log(e) }},
    //{name: 'User-Color'       , onActivate(e) { console.log(e) }}, // not official, future commit maybe?
    {name: 'Type'             , onActivate(e) { console.log(e) }},
    {name: 'BreakGroups'      , onActivate(e) { console.log(e) }},
    {name: 'DeformGroups'     , onActivate(e) { console.log(e) }},
    {name: 'Limiters'         , onActivate(e) { console.log(e) }}
  ],
  beamTextVisModes = [
    {name: 'Off'              , onActivate(e) { console.log(e) }},
    {name: 'Ids'              , onActivate(e) { console.log(e) }},
    {name: 'Length'           , onActivate(e) { console.log(e) }},
    //{name: 'Median-Weigth'    , onActivate(e) { console.log(e) }} // not official, future commit maybe?
  ],
  colTriangleVisModes = [
    {name: 'Off'              , onActivate(e) { console.log(e) }},
    {name: 'Simple'           , onActivate(e) { console.log(e) }},
    {name: 'User-Color'       , onActivate(e) { console.log(e) }},
    {name: 'Orientation'      , onActivate(e) { console.log(e) }}
  ],
  colTriangleDrawSides = [
    {name: 'Front'            , onActivate(e) { console.log(e) }},
    {name: 'Back'             , onActivate(e) { console.log(e) }},
    {name: 'Both'             , onActivate(e) { console.log(e) }}
  ]

const settings = {
  // visualization
  node: {
    visMode: 'Simple',
    widthScale: 1.0,
    textMode: 'Off',
    textColor: false
  },
  beam: {
    visMode: 'Simple',
    widthScale: 1.0,
    textMode: 'Off',
    textColor: false
  },
  colTris: {
    visMode: 'Simple',
    opacity: .5,
    drawSides: 'Both'
  },
  meshStats: '',
  // 3d viewport
  perspective: true,
  view: 'Isometric',
  backgroundColor: parseColor(ctx?.config?.sceneView?.viewport?.bgcolor ?? "#aaaaaa").hex32,
  floorColor: parseColor(ctx?.config?.sceneView?.viewport?.floorcolor ?? "#808080").hex32,
  // 3d mesh
  meshColor: parseColor(ctx?.config?.sceneView?.meshes?.color ?? "#a2a2a2").hex32,
  meshColorSelected: parseColor(ctx?.config?.sceneView?.meshes?.colorSelected ?? "#ccb387").hex32,
  wireColor: parseColor(ctx?.config?.sceneView?.meshes?.wire ?? "#181818").hex32,
  wireColorSelected: parseColor(ctx?.config?.sceneView?.meshes?.wireSelected ?? "#f78f2c").hex32,
  meshOpacity: .5
}

// see https://tweakpane.github.io/docs/quick-tour/

export async function init() {

  let pane = new ctx.tweakPane.Pane({
    title:'Settings',
    expanded: false
  })

  pane.addButton({
    title: 'Ping Simulation',
  }).on('click', () => {
    ctx.vscode.postMessage({command: 'sendPing'})
  })

  // ----------------------- 3D Viewport folder

  const section_3dviewport = pane.addFolder({
    title: 'Viewport',
    expanded: false
  })

  section_3dviewport.addBinding( settings, 'perspective').on('change', function(ev) {
    if (ev.value) {
      camera = cameraPersp;
      cameraPersp.position.copy(orthoCamera.position);
      orbitControls.enableRotate = true
    } else {
      camera = orthoCamera;
      orthoCamera.position.copy(cameraPersp.position);
      orbitControls.enableRotate = false
    }
    orbitControls.object = camera; // Update controls to new camera
  })

  section_3dviewport.addBinding(settings, 'view', {
    label: 'View',
    options: views.reduce((result, view) => {
      result[view.name] = view.name;
      return result;
    }, {}),
  }).on('change', (ev) => {
    // Find the view object based on the selected view name
    const view = views.find(v => v.name === ev.value);
    if (view) {
      view.onActivate();
      settings.view = view.name; // Update the settings with the new view name
    }
  })

  for(let cs of [
    ["backgroundColor",   ctx.visualizersView.CFG_BACKGROUND_COLOR,   "Background"],
    ["floorColor",        ctx.visualizersView.CFG_FLOOR_COLOR,        "Floor"],
  ]){
    section_3dviewport.addBinding(settings, cs[0], { label: cs[2], view:'color', color: {alpha: true} })
    .on('change', (ev) => { ctx.visualizersView.setConfigParameter(cs[1], getColorFromInt(ev.value)) })
  }

  // ----------------------- 3D Meshes folder

  const section_3dmeshes = pane.addFolder({
    title: '3D Meshes',
    expanded: false
  })

  for(let cs of [
    ["meshColor",         ctx.visualizersMesh.CFG_MESH_COLOR,         "Mesh"],
    ["meshColorSelected", ctx.visualizersMesh.CFG_MESH_COLOR_ACTIVE,  "(Selected)"],
    ["wireColor",         ctx.visualizersMesh.CFG_WIRE_COLOR,         "Wire"],
    ["wireColorSelected", ctx.visualizersMesh.CFG_WIRE_COLOR_ACTIVE,  "(Selected)"]
  ]){
    section_3dmeshes.addBinding(settings, cs[0], { label: cs[2], view:'color', color: {alpha: true} })
    .on('change', (ev) => { ctx.visualizersMesh.setConfigParameter(cs[1], getColorFromInt(ev.value)) })
  }

  section_3dmeshes.addBinding(settings, 'meshOpacity', { label: "Opacity", format: formatter_FloatToPercent, min: .0, max: 1.0 })
  .on('change', (ev) => { ctx.visualizersMesh.setConfigParameter(ctx.visualizersMesh.CFG_MESH_OPACITY, ev.value) })

  meshLoadingBtn = section_3dmeshes.addButton({ title: 'Load 3D Meshes' })
  .on('click', () => { ctx.visualizersMesh.forceLoadMeshes() })

  section_3dmeshes.addBinding(settings, 'meshStats', { label: null, multiline: true, rows: 5, readonly: true })
}

export function animate(time) {
  const meshesEnabled = Object.keys(meshFolderCache).length !== 0

  if(meshLoadingBtn) {
    meshLoadingBtn.disabled = !meshLoadingEnabled
  }

  if(meshesEnabled) {
    let txt = 'Shallow cache:\n'
    for (let ns in meshFolderCache) {
      txt += ns + ' - ' + Object.keys(meshFolderCache[ns]).length + ' meshes\n'
    }
    txt += Object.keys(meshLibraryFull).length + ' meshes fully loaded\n'
    if(daeLoadingCounter + daeLoadingCounterFull > 0) {
      txt += (daeLoadingCounter + daeLoadingCounterFull) + ' files loading ...'
    }
    settings.meshStats = txt;
  }
}


