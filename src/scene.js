// scene.js — renderer, camera, lights, sky, table. Three.js mirrors physics.
// The register is a cozy craft table in late-afternoon light, with a little dial
// that slides the room from golden afternoon to lamp-lit evening.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function createScene(ctx) {
  const { RAPIER, world } = ctx;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.01, 100);
  camera.position.set(0.42, 0.46, 0.66);

  const renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Popsicle-stick workbench');
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 0.18;
  controls.maxDistance = 2.2;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  // ---------- sky: a soft vertical gradient, redrawn as the daylight dial moves ----------
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2; skyCanvas.height = 256;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight('#fff6e6', '#5c4a39', 0.85);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff1d8', 2.3);
  key.position.set(0.55, 1.05, 0.42);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);       // interactive budget; photo mode may spend more
  const sd = 0.85;
  Object.assign(key.shadow.camera, { left:-sd, right:sd, top:sd, bottom:-sd, near:0.1, far:3.2 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.002;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#dde7ff', 0.45);
  fill.position.set(-0.5, 0.45, -0.35);
  scene.add(fill);

  // ---------- table: rounded edges, plank-scale grain, gentle AO toward the rim ----------
  function makeTableTexture(){
    const c = document.createElement('canvas'); c.width = 1024; c.height = 768;
    const g = c.getContext('2d');
    g.fillStyle = '#6f5337'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 160; i++){                      // long lazy grain lines
      g.strokeStyle = `rgba(48,30,14,${0.04 + Math.random()*0.09})`;
      g.lineWidth = 0.6 + Math.random()*2.2;
      const y = Math.random()*c.height;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= c.width; x += 32) g.lineTo(x, y + (Math.random()-0.5)*7);
      g.stroke();
    }
    for (let p = 1; p < 4; p++){                        // faint plank seams
      g.strokeStyle = 'rgba(35,22,10,0.25)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, p*c.height/4 + (Math.random()-0.5)*10);
      g.lineTo(c.width, p*c.height/4 + (Math.random()-0.5)*10); g.stroke();
    }
    const vig = g.createRadialGradient(c.width/2, c.height/2, c.height*0.35,
                                       c.width/2, c.height/2, c.width*0.62);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(20,10,4,0.35)');          // baked edge AO
    g.fillStyle = vig; g.fillRect(0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  const TW = 1.3, TD = 0.9, TT = 0.06;
  const tableMat = new THREE.MeshStandardMaterial({
    map: makeTableTexture(), roughness: 0.82, metalness: 0 });
  const tableMesh = new THREE.Mesh(new RoundedBoxGeometry(TW, TT, TD, 4, 0.014), tableMat);
  tableMesh.position.y = -TT/2;            // top surface sits at y = 0
  tableMesh.receiveShadow = true; tableMesh.castShadow = true;
  scene.add(tableMesh);
  const tableBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -TT/2, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(TW/2, TT/2, TD/2).setFriction(0.95).setRestitution(0.0),
    tableBody
  );

  // ---------- daylight dial: golden afternoon ⟷ lamp-lit evening ----------
  const DAY = {
    skyTop: new THREE.Color('#f6ead6'), skyBot: new THREE.Color('#e7d9c3'),
    hemi: 0.85, hemiCol: new THREE.Color('#fff6e6'), ground: new THREE.Color('#5c4a39'),
    key: 2.3,  keyCol: new THREE.Color('#fff1d8'),
    fill: 0.45, fillCol: new THREE.Color('#dde7ff'),
    exp: 0.98, fog: new THREE.Color('#e9dcc8'),
  };
  const NIGHT = {
    skyTop: new THREE.Color('#413729'), skyBot: new THREE.Color('#221c14'),
    hemi: 0.32, hemiCol: new THREE.Color('#ffd9a3'), ground: new THREE.Color('#241a10'),
    key: 1.7,  keyCol: new THREE.Color('#ffbf72'),
    fill: 0.16, fillCol: new THREE.Color('#40507a'),
    exp: 0.9,  fog: new THREE.Color('#332b22'),
  };
  const _cTop = new THREE.Color(), _cBot = new THREE.Color(), _cFog = new THREE.Color();
  scene.fog = new THREE.Fog('#e9dcc8', 1.5, 3.6);      // faint warmth in the distance
  function setDaylight(t){                              // t: 0 = day, 1 = night
    _cTop.lerpColors(DAY.skyTop, NIGHT.skyTop, t);
    _cBot.lerpColors(DAY.skyBot, NIGHT.skyBot, t);
    const g = skyCanvas.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, skyCanvas.height);
    grad.addColorStop(0, '#' + _cTop.getHexString());
    grad.addColorStop(1, '#' + _cBot.getHexString());
    g.fillStyle = grad; g.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
    skyTex.needsUpdate = true;
    hemi.intensity = THREE.MathUtils.lerp(DAY.hemi, NIGHT.hemi, t);
    hemi.color.lerpColors(DAY.hemiCol, NIGHT.hemiCol, t);
    hemi.groundColor.lerpColors(DAY.ground, NIGHT.ground, t);
    key.intensity = THREE.MathUtils.lerp(DAY.key, NIGHT.key, t);
    key.color.lerpColors(DAY.keyCol, NIGHT.keyCol, t);
    fill.intensity = THREE.MathUtils.lerp(DAY.fill, NIGHT.fill, t);
    fill.color.lerpColors(DAY.fillCol, NIGHT.fillCol, t);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(DAY.exp, NIGHT.exp, t);
    _cFog.lerpColors(DAY.fog, NIGHT.fog, t);
    scene.fog.color.copy(_cFog);
    ctx.daylight = t;
  }
  setDaylight(0);

  const dial = document.createElement('input');
  dial.type = 'range'; dial.min = '0'; dial.max = '1'; dial.step = '0.01'; dial.value = '0';
  dial.title = 'daylight — afternoon to evening';
  dial.id = 'daylight';
  dial.style.cssText = 'position:fixed;right:14px;bottom:82px;width:112px;accent-color:#b07a3c;' +
    'opacity:.65;cursor:pointer;z-index:5;';
  dial.addEventListener('input', () => setDaylight(parseFloat(dial.value)));
  document.body.appendChild(dial);

  addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  ctx.scene = scene;
  ctx.camera = camera;
  ctx.renderer = renderer;
  ctx.controls = controls;
  ctx.keyLight = key;
  ctx.fillLight = fill;
  ctx.hemiLight = hemi;
  ctx.tableMesh = tableMesh;
  ctx.tableBody = tableBody;
  ctx.TABLE = { TW, TD, TT };
  ctx.setDaylight = setDaylight;
  ctx.daylightDial = dial;
}
