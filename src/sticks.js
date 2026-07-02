// sticks.js — stick geometry/materials, spawn/sweep, registry, BUILD⇄RUN mode.
// Every stick body mutation (spawn, remove) goes through here.

import * as THREE from 'three';

export function createSticks(ctx) {
  const { RAPIER } = ctx;

  // ---------- wood grain texture ----------
  function makeGrain() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#d8b478'; g.fillRect(0,0,256,64);
    for (let i=0;i<80;i++){
      g.strokeStyle = `rgba(110,72,36,${0.03 + Math.random()*0.10})`;
      g.lineWidth = 0.4 + Math.random()*1.3;
      const y = Math.random()*64;
      g.beginPath(); g.moveTo(0,y);
      for (let x=0;x<=256;x+=14) g.lineTo(x, y + (Math.random()-0.5)*2.6);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }
  const grain = makeGrain();

  const STICK_L = 0.114, STICK_W = 0.010, STICK_T = 0.002; // real popsicle-stick metres
  const sticks = [];        // { mesh, body, halfExtents, prev/curr pose pair }
  const stickMeshes = [];
  const MAX_STICKS = 140;

  function spawnStick(x, y, z, yaw, opts) {
    if (sticks.length >= MAX_STICKS) return null;
    const lj = 1 + (Math.random()-0.5)*0.07;            // ±3.5% length jitter
    const len = STICK_L * lj;
    const hx = len/2, hy = STICK_T/2, hz = STICK_W/2;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw||0, 0));
    if (opts && opts.rest) y = ctx.solveDropY(x, z, q, hx, hy, hz, null); // rest on whatever's below
    const geo = new THREE.BoxGeometry(len, STICK_T, STICK_W);
    const tint = new THREE.Color().setHSL(
      0.092 + (Math.random()-0.5)*0.025,                // warm wood hue, slight drift
      0.42 + Math.random()*0.13,
      0.60 + (Math.random()-0.5)*0.13
    );
    const mat = new THREE.MeshStandardMaterial({
      map: grain, color: tint, roughness: 0.66 + Math.random()*0.16, metalness: 0,
      emissive: 0x000000
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    ctx.scene.add(mesh);

    const body = ctx.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setRotation({ x:q.x, y:q.y, z:q.z, w:q.w })
        .setLinearDamping(0.6).setAngularDamping(0.9)
        .setCcdEnabled(true)                                      // 2mm-thin boxes tunnel without CCD
    );
    ctx.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setFriction(0.95).setRestitution(0.03).setDensity(420)   // ~basswood
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );

    const rec = { mesh, body,
      halfExtents: new THREE.Vector3(hx, hy, hz),
      prevPos: new THREE.Vector3(x, y, z), currPos: new THREE.Vector3(x, y, z),   // physics pose pair
      prevQuat: q.clone(), currQuat: q.clone() };                                  // for render interpolation
    mesh.userData.rec = rec;
    sticks.push(rec); stickMeshes.push(mesh);
    window.__leanto.sticks = sticks.length;
    if (ctx.buildMode) body.setBodyType(RAPIER.RigidBodyType.Fixed, true); // freeze-on-place: static, collidable, holds pose
    return rec;
  }

  function sweep(){
    if (ctx.clearAllBonds) ctx.clearAllBonds();
    for (const s of sticks) { ctx.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); ctx.world.removeRigidBody(s.body); }
    sticks.length = 0; stickMeshes.length = 0; ctx.held = null; ctx.controls.enabled = true;
    window.__leanto.sticks = 0;
  }

  // build mode = the "third hand": freeze every stick so it holds while you place the next;
  // releasing build mode drops everything into live physics — watch it stand or fall.
  function setBuildMode(on){
    ctx.buildMode = on;
    for (const s of sticks){
      if (s === ctx.held) continue;
      if (on){
        s.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);       // freeze-on-place: static + collidable
      } else {
        s.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        s.body.setLinvel({ x:0, y:0, z:0 }, true);                  // no launch impulse
        s.body.setAngvel({ x:0, y:0, z:0 }, true);
        s.body.setGravityScale(0.25, true);                         // gravity eases in (see loop)
        s.body.wakeUp();
      }
    }
    if (!on) ctx.runRamp = 0;                                       // start the gentle Build->Run hand-off
    window.__leanto.buildMode = on;
  }

  ctx.buildMode = true;     // BUILD (default) vs RUN
  ctx.sticks = sticks;
  ctx.stickMeshes = stickMeshes;
  ctx.spawnStick = spawnStick;
  ctx.sweep = sweep;
  ctx.setBuildMode = setBuildMode;
  ctx.STICK = { L: STICK_L, W: STICK_W, T: STICK_T };
  ctx.MAX_STICKS = MAX_STICKS;
}
