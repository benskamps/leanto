// scene.js — renderer, camera, lights, table (mesh + collider). Three.js mirrors physics.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createScene(ctx) {
  const { RAPIER, world } = ctx;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ece6db');

  const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.01, 100);
  camera.position.set(0.42, 0.46, 0.66);

  const renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 0.18;
  controls.maxDistance = 2.2;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight('#fff6e6', '#5c4a39', 0.85));
  const key = new THREE.DirectionalLight('#fff1d8', 2.3);
  key.position.set(0.55, 1.05, 0.42);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sd = 0.85;
  Object.assign(key.shadow.camera, { left:-sd, right:sd, top:sd, bottom:-sd, near:0.1, far:3.2 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.0015;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#dde7ff', 0.45);
  fill.position.set(-0.5, 0.45, -0.35);
  scene.add(fill);

  // ---------- table ----------
  const TW = 1.3, TD = 0.9, TT = 0.06;
  const tableMat = new THREE.MeshStandardMaterial({ color:'#6f5337', roughness:0.88, metalness:0 });
  const tableMesh = new THREE.Mesh(new THREE.BoxGeometry(TW, TT, TD), tableMat);
  tableMesh.position.y = -TT/2;            // top surface sits at y = 0
  tableMesh.receiveShadow = true;
  scene.add(tableMesh);
  const tableBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -TT/2, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(TW/2, TT/2, TD/2).setFriction(0.95).setRestitution(0.0),
    tableBody
  );

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
  ctx.tableMesh = tableMesh;
  ctx.tableBody = tableBody;
  ctx.TABLE = { TW, TD, TT };
}
