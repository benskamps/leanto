// charm.js — the full-adorable layer. Craft-table props (a pencil sticks can lean on,
// a button jar, a tape roll, a tiny folded-paper friend), dust motes drifting in the
// key light, and the survival celebration: when a real structure rides out the RUN
// reveal, the room glows for a moment and a little paper confetti falls.

import * as THREE from 'three';

export function createCharm(ctx) {
  const { RAPIER, scene, world } = ctx;

  // ---------- pencil: lies at the table edge; static collider, so it's also a toy ----------
  {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#e8a33d', roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.125, 6), wood);
    body.rotation.z = Math.PI/2;
    g.add(body);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0044, 0.0044, 0.008, 12),
      new THREE.MeshStandardMaterial({ color: '#b8b8bc', roughness: 0.3, metalness: 0.6 }));
    collar.rotation.z = Math.PI/2; collar.position.x = -0.0665;
    g.add(collar);
    const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.0041, 0.0041, 0.007, 12),
      new THREE.MeshStandardMaterial({ color: '#e78a8a', roughness: 0.9 }));
    eraser.rotation.z = Math.PI/2; eraser.position.x = -0.074;
    g.add(eraser);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0042, 0.012, 12),
      new THREE.MeshStandardMaterial({ color: '#d9c39a', roughness: 0.8 }));
    tip.rotation.z = -Math.PI/2; tip.position.x = 0.0685;
    g.add(tip);
    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.0016, 0.004, 8),
      new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.4 }));
    lead.rotation.z = -Math.PI/2; lead.position.x = 0.0745;
    g.add(lead);
    g.traverse(m => { m.castShadow = true; m.receiveShadow = true; });
    g.position.set(0.42, 0.0042, 0.33);
    g.rotation.y = -0.5;
    scene.add(g);
    const pb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0.42, 0.0042, 0.33)
      .setRotation({ x: 0, y: Math.sin(-0.25), z: 0, w: Math.cos(-0.25) }));
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.075, 0.0042).setRotation({ x:0, y:0, z:Math.SQRT1_2, w:Math.SQRT1_2 })
        .setFriction(0.9), pb);
  }

  // ---------- button jar: a little glass of spare buttons in the far corner ----------
  {
    const jar = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.05, 24, 1, true),
      new THREE.MeshPhysicalMaterial({ color: '#dfe8e6', roughness: 0.15, metalness: 0,
        transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
    glass.position.y = 0.025;
    jar.add(glass);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.006, 24),
      new THREE.MeshStandardMaterial({ color: '#8a6a3c', roughness: 0.6 }));
    lid.position.y = 0.053;
    jar.add(lid);
    const buttonCols = ['#c46a6a', '#6a94c4', '#c4b16a', '#7cae7a', '#a97cae'];
    for (let i = 0; i < 14; i++){
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.0018, 12),
        new THREE.MeshStandardMaterial({ color: buttonCols[i % buttonCols.length], roughness: 0.5 }));
      const a = Math.random()*Math.PI*2, r = Math.random()*0.017;
      b.position.set(Math.cos(a)*r, 0.003 + i*0.0022, Math.sin(a)*r);
      b.rotation.set(Math.random()*0.6, Math.random()*Math.PI, Math.random()*0.6);
      b.castShadow = true;
      jar.add(b);
    }
    jar.position.set(-0.52, 0, 0.3);
    scene.add(jar);
    const jb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-0.52, 0.028, 0.3));
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.028, 0.029).setFriction(0.8), jb);
  }

  // ---------- tape roll: flat near the back edge ----------
  {
    const tape = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0085, 12, 32),
      new THREE.MeshStandardMaterial({ color: '#d8cfc0', roughness: 0.35 }));
    ring.rotation.x = Math.PI/2;
    ring.position.y = 0.0085;
    ring.castShadow = true; ring.receiveShadow = true;
    tape.add(ring);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.017, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: '#a8916b', roughness: 0.8, side: THREE.DoubleSide }));
    core.position.y = 0.0085;
    tape.add(core);
    tape.position.set(-0.45, 0, -0.28);
    scene.add(tape);
    const tb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-0.45, 0.0085, -0.28));
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.0085, 0.0295).setFriction(0.85), tb);
  }

  // ---------- paper friend: a tiny folded-paper figure watching from the corner ----------
  {
    const paper = new THREE.MeshStandardMaterial({ color: '#f3ede1', roughness: 0.95, side: THREE.DoubleSide });
    const friend = new THREE.Group();
    const tent = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.03, 4), paper);   // folded body
    tent.position.y = 0.015;
    tent.rotation.y = Math.PI/4;
    tent.castShadow = true;
    friend.add(tent);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 12, 10), paper.clone());
    head.position.y = 0.035;
    head.castShadow = true;
    friend.add(head);
    // two ink-dot eyes, looking at the table
    const ink = new THREE.MeshBasicMaterial({ color: '#2c2620' });
    for (const dx of [-0.0022, 0.0022]){
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0007, 6, 6), ink);
      eye.position.set(dx, 0.036, 0.006);
      friend.add(eye);
    }
    friend.position.set(0.5, 0, -0.32);
    friend.lookAt(0, 0.02, 0);
    scene.add(friend);
  }

  // ---------- dust motes: slow drift, catching the key light ----------
  const MOTES = 60;
  const motePos = new Float32Array(MOTES * 3);
  const moteVel = [];
  for (let i = 0; i < MOTES; i++){
    motePos[i*3] = (Math.random()-0.5) * 1.2;
    motePos[i*3+1] = 0.02 + Math.random() * 0.45;
    motePos[i*3+2] = (Math.random()-0.5) * 0.8;
    moteVel.push(new THREE.Vector3((Math.random()-0.5)*0.004, (Math.random()-0.3)*0.003, (Math.random()-0.5)*0.004));
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: '#fff3dc', size: 0.0022, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(motes);

  // ---------- confetti + light swell: the survival celebration ----------
  const confetti = [];        // { mesh, vel, spin, ttl }
  const confettiCols = ['#c46a6a', '#6a94c4', '#c4b16a', '#7cae7a', '#e8a33d'];
  function celebrate(center){
    ctx.chime();
    swellT = 0;
    for (let i = 0; i < 26; i++){
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.004 + Math.random()*0.004, 0.003 + Math.random()*0.003),
        new THREE.MeshStandardMaterial({ color: confettiCols[i % confettiCols.length],
          roughness: 0.9, side: THREE.DoubleSide }));
      m.position.set(
        (center ? center.x : 0) + (Math.random()-0.5)*0.24,
        0.24 + Math.random()*0.12,
        (center ? center.z : 0) + (Math.random()-0.5)*0.24);
      m.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
      scene.add(m);
      confetti.push({ mesh: m,
        vel: new THREE.Vector3((Math.random()-0.5)*0.02, -0.028 - Math.random()*0.02, (Math.random()-0.5)*0.02),
        spin: new THREE.Vector3(Math.random()*3, Math.random()*3, Math.random()*3),
        ttl: 5 + Math.random()*2 });
    }
  }
  let swellT = -1;            // 0..1.6s warm light swell

  function update(dt){
    // motes drift and wrap
    for (let i = 0; i < MOTES; i++){
      motePos[i*3]   += moteVel[i].x * dt * 10;
      motePos[i*3+1] += moteVel[i].y * dt * 10;
      motePos[i*3+2] += moteVel[i].z * dt * 10;
      if (motePos[i*3+1] < 0.01 || motePos[i*3+1] > 0.5) moteVel[i].y *= -1;
      if (Math.abs(motePos[i*3]) > 0.65) moteVel[i].x *= -1;
      if (Math.abs(motePos[i*3+2]) > 0.45) moteVel[i].z *= -1;
    }
    moteGeo.attributes.position.needsUpdate = true;

    // confetti falls, spins, fades out on the table
    for (let i = confetti.length - 1; i >= 0; i--){
      const c = confetti[i];
      c.ttl -= dt;
      if (c.mesh.position.y > 0.002){
        c.mesh.position.addScaledVector(c.vel, dt * 3);
        c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt;
      }
      if (c.ttl < 1) c.mesh.material.opacity = c.ttl, c.mesh.material.transparent = true;
      if (c.ttl <= 0){
        scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose();
        confetti.splice(i, 1);
      }
    }

    // warm light swell
    if (swellT >= 0){
      swellT += dt;
      const k = Math.sin(Math.min(1, swellT/1.6) * Math.PI);   // up and back down
      ctx.keyLight.intensity = (ctx.daylight != null
        ? THREE.MathUtils.lerp(2.3, 1.7, ctx.daylight) : 2.3) * (1 + 0.45*k);
      if (swellT >= 1.6) swellT = -1;
    }
  }

  ctx.charmUpdate = update;
  ctx.celebrate = celebrate;
}
