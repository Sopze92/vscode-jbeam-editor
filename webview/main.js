let cameraCenterSphere

let fpsLimit = 30
let interval = 1000 / fpsLimit

let lastTime = (new Date()).getTime()
let currentTime = 0
let delta = 0

function animate(time) {
  // Request the next frame
  window.animationFrameId = requestAnimationFrame(animate);

  // Calculate the time delta since the last frame
  currentTime = (new Date()).getTime();
  delta = currentTime - lastTime;

  // If the delta is greater than our interval, update and render
  if (delta > interval) {

    /*
    scene.traverse((object) => {
      if (object.geometry && object.geometry.boundingSphere === null) {
        console.warn('Found object with disposed geometry', object);
      }
    })
    */

    //console.log('FPS: ', 1000 / delta)
    cameraCenterSphere.position.copy(orbitControls.target);
    orbitControls.update(time)
    //ctx.visualizersMain.animate(time)
    ctx.ui.animate(time)
    TweenUpdate();
    renderer.clear();
    renderer.render(scene, camera);
    renderer.state.reset();
    gizmoAnimate()
    if(interval > 0) {
      lastTime = currentTime - (delta % interval)
    } else {
      lastTime = currentTime
    }
  }
}

function onResize() {
  cameraPersp.aspect = window.innerWidth / window.innerHeight;
  cameraPersp.updateProjectionMatrix();

  // For the orthographic camera
  let aspect = window.innerWidth / window.innerHeight;
  let height = window.innerHeight / 16;  // adjust based on your requirements
  let width = height * aspect;

  orthoCamera.left = -width / 2;
  orthoCamera.right = width / 2;
  orthoCamera.top = height / 2;
  orthoCamera.bottom = -height / 2;
  orthoCamera.updateProjectionMatrix();

  // Update the renderer's size
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
}

export function init() {
  scene = new THREE.Scene();
  cameraPersp = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  cameraPersp.position.x = 1;
  cameraPersp.position.y = 1;
  cameraPersp.position.z = 1;
  orthoCamera = new THREE.OrthographicCamera( window.innerWidth / - 16, window.innerWidth / 16, window.innerHeight / 16, window.innerHeight / - 16, 0.01, 6000 );
  {
    let aspect = window.innerWidth / window.innerHeight;
    let height = window.innerHeight / 16;  // adjust based on your requirements
    let width = height * aspect;

    orthoCamera.left = -width / 2;
    orthoCamera.right = width / 2;
    orthoCamera.top = height / 2;
    orthoCamera.bottom = -height / 2;
    orthoCamera.updateProjectionMatrix();
    orthoCamera.position.z = 3;
    orthoCamera.position.y = 0;
    orthoCamera.zoom = 2
  }

  camera = cameraPersp;

  const canvas = document.getElementById("canvas3D");
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  document.body.appendChild(renderer.domElement);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.gammaFactor = 2.2;
  renderer.gammaOutput = true;
  //renderer.sortObjects = true

  orbitControls = new OrbitControls(camera, renderer.domElement);

  // the camera center
  const sphereGeometry = new THREE.SphereGeometry(0.01);
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
  //sphereMaterial.opacity = 0.5;
  //sphereMaterial.transparent = true;
  cameraCenterSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  cameraCenterSphere.name = 'cameraCenterSphere'
  scene.add(cameraCenterSphere);


  // Renderer settings for gamma correction
  renderer.gammaFactor = 2.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace; // optional with post-processing
  THREE.ColorManagement.enabled = true;

  // After adding lights, always update the scene graph
  scene.updateMatrixWorld(true);

  //createDome(scene)

  gizmoCreate()
  ctx.ui.init()
  ctx.visualizersView.init()
  ctx.visualizersMain.init()

  // set some config
  fpsLimit = ctx?.config?.sceneView?.fpsLimit ?? 60
  if(fpsLimit == 0) {
    interval = 0
  } else {
    interval = 1000 / fpsLimit;
  }

  // kick off the renderer
  animate(0)

  window.addEventListener('resize', onResize)

  // let VSCode know that we are good to receive data :)
  ctx.vscode.postMessage({command: 'sceneReady'})
}

function onConfigChanged() {
  ctx.visualizersMain.onConfigChanged()
}

export function destroy() {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('message', onReceiveMessage);
  // Cancel the ongoing animation frame
  if (window.animationFrameId) {
    cancelAnimationFrame(window.animationFrameId);
  }

  // Dispose of scene objects
  scene.traverse(object => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      if (object.material instanceof Array) {
        // In case of multi-materials
        object.material.forEach(material => material.dispose());
      } else {
        object.material.dispose();
      }
    }
  })

  renderer.dispose();
  if (orbitControls) orbitControls.dispose();
  ctx.visualizersMain.dispose()
}
window.onbeforeunload = destroy;

// this init's it all, so its outside of init :D
function onReceiveMessage(event) {
  const message = event.data;
  //console.log('onReceiveMessage', message)
  switch (message.command) {
    case 'init':
      ctx.config = JSON.parse(message.config)
      console.log("Init with config: ", ctx.config)
      init()
      break
    case 'config':
      ctx.config = JSON.parse(message.config)
      console.log("Config changed: ", ctx.config)
      onConfigChanged()
      break
  }
}
window.addEventListener('message', onReceiveMessage);