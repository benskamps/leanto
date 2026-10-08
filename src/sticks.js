// sticks.js — stick geometry/materials, spawn/sweep, registry, BUILD⇄RUN mode.
// Every stick body mutation (spawn, remove, recreate) goes through here.

import * as THREE from './vendor/three/three.module.min.js';

export function createSticks(ctx) {
  const { RAPIER } = ctx;

  // ---------- wood grain: four birch variants, so a pile of sticks never looks stamped ----------
  // Fine straight fibres, a few darker growth lines, ray flecks, and a matching bump
  // map so the grain catches the window light when a stick tilts.
  function makeGrain(seed) {
    let s = seed;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const c = document.createElement('canvas'); c.width = 512; c.height = 64;
    const g = c.getContext('2d');
    const b = document.createElement('canvas'); b.width = 512; b.height = 64;
    const bg = b.getContext('2d');
    g.fillStyle = '#dcbb83'; g.fillRect(0,0,512,64);
    bg.fillStyle = '#808080'; bg.fillRect(0,0,512,64);
    const across = g.createLinearGradient(0,0,0,64);      // heartwood side is a shade warmer
    across.addColorStop(0, 'rgba(150,95,40,0.10)'); across.addColorStop(1, 'rgba(255,240,210,0.06)');
    g.fillStyle = across; g.fillRect(0,0,512,64);
    for (let i=0;i<150;i++){                              // fibres
      const y = r()*64, a = 0.025 + r()*0.08, w = 0.35 + r()*1.0, dark = r() < 0.75;
      g.strokeStyle = dark ? `rgba(120,76,34,${a})` : `rgba(255,236,200,${a})`;
      bg.strokeStyle = dark ? `rgba(40,40,40,${a*2.2})` : `rgba(220,220,220,${a*1.6})`;
      g.lineWidth = bg.lineWidth = w;
      const amp = 0.4 + r()*1.4, f = 0.004 + r()*0.01, ph = r()*6;
      for (const k of [g, bg]){
        k.beginPath();
        for (let x=0;x<=512;x+=16){ const yy = y + Math.sin(x*f + ph)*amp; x ? k.lineTo(x,yy) : k.moveTo(x,yy); }
        k.stroke();
      }
    }
    for (let i=0;i<3;i++){                                // growth lines
      const y = 6 + r()*52;
      g.strokeStyle = `rgba(105,62,24,${0.12 + r()*0.12})`; g.lineWidth = 1 + r()*1.2;
      g.beginPath(); g.moveTo(0,y);
      for (let x=0;x<=512;x+=16) g.lineTo(x, y + Math.sin(x*0.006 + i)*2.5);
      g.stroke();
    }
    for (let i=0;i<40;i++){                               // ray flecks
      const x = r()*512, y = r()*64;
      g.fillStyle = `rgba(150,96,46,${0.10 + r()*0.15})`;
      g.fillRect(x, y, 2 + r()*5, 0.8);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    const bt = new THREE.CanvasTexture(b);
    bt.wrapS = bt.wrapT = THREE.RepeatWrapping;
    return { map: t, bump: bt };
  }
  const grains = [11, 23, 37, 51].map(makeGrain);

  const STICK_L = 0.114, STICK_W = 0.010, STICK_T = 0.002; // real popsicle-stick metres
  const sticks = [];        // { id, mesh, body, cured, halfExtents, prev/curr pose pair }
  const stickMeshes = [];
  const MAX_STICKS = 300;   // a cottage is ~200-240 sticks
  let nextId = 1;           // stable ids (survive save/load; bond edge list refers to them)

  // Real popsicle sticks have ROUNDED ENDS — a rounded-rect outline extruded to 2mm.
  // A snipped stick keeps its factory round end and gets a honest SQUARE face at the cut.
  // Colliders stay full cuboids (corner error < 2.2mm — invisible in play, cheap in RUN).
  // Geometries are cached on (0.5mm length bucket, end styles): 300 sticks share a handful.
  const geoCache = new Map();
  function makeStickGeometry(len, endL, endR){
    const key = `${Math.round(len*2000)}:${endL[0]}${endR[0]}`;
    let g = geoCache.get(key);
    if (g) return g;
    const r = STICK_W/2, hl = len/2;
    const xr = endR === 'round' ? hl - r : hl;
    const xl = endL === 'round' ? -hl + r : -hl;
    const shape = new THREE.Shape();
    shape.moveTo(xl, -r);
    shape.lineTo(xr, -r);
    if (endR === 'round') shape.absarc(xr, 0, r, -Math.PI/2, Math.PI/2, false);
    else { shape.lineTo(hl, -r); shape.lineTo(hl, r); }
    shape.lineTo(xl, r);
    if (endL === 'round') shape.absarc(xl, 0, r, Math.PI/2, Math.PI*1.5, false);
    else { shape.lineTo(-hl, r); shape.lineTo(-hl, -r); }
    g = new THREE.ExtrudeGeometry(shape, { depth: STICK_T, bevelEnabled: false, curveSegments: 7 });
    g.translate(0, 0, -STICK_T/2);
    // grain runs along the stick: u tracks length at constant density, v spans the width
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (pos.getX(i) + hl) / STICK_L, (pos.getY(i) + r) / STICK_W);
    uv.needsUpdate = true;
    g.rotateX(Math.PI/2);                     // extrude depth → local Y (thickness); width → local Z
    geoCache.set(key, g);
    return g;
  }

  // one collider-shaped body; shared by spawn and by glue's uncure (which rebuilds
  // per-stick bodies out of a settled compound)
  function makeStickBody(halfExtents, pos, quat, opts){
    const body = ctx.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x:quat.x, y:quat.y, z:quat.z, w:quat.w })
        .setLinearDamping(0.6).setAngularDamping(0.9)
        .setCcdEnabled(true)                                      // 2mm-thin boxes tunnel without CCD
    );
    ctx.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setFriction(0.95).setRestitution(0.03).setDensity(420)   // ~basswood
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );
    if (opts && opts.fixed) body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    return body;
  }

  // opts: { rest, len, ends:[L,R], quat, tint, rough } — explicit values override the
  // hand-jitter defaults (snip pieces, half-sticks, and save/load all spawn explicitly)
  function spawnStick(x, y, z, yaw, opts) {
    opts = opts || {};
    if (sticks.length >= MAX_STICKS) return null;
    const lj = 1 + (Math.random()-0.5)*0.07;            // ±3.5% length jitter
    const len = opts.len || STICK_L * lj;
    const ends = opts.ends || ['round', 'round'];
    const hx = len/2, hy = STICK_T/2, hz = STICK_W/2;
    const q = opts.quat ? opts.quat.clone()
                        : new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw||0, 0));
    if (opts.rest) y = ctx.solveDropY(x, z, q, hx, hy, hz, null); // rest on whatever's below
    const tint = opts.tint ? opts.tint.clone() : new THREE.Color().setHSL(
      0.092 + (Math.random()-0.5)*0.025,                // warm wood hue, slight drift
      0.42 + Math.random()*0.13,
      0.60 + (Math.random()-0.5)*0.13
    );
    const rough = opts.rough != null ? opts.rough : 0.66 + Math.random()*0.16;
    const grain = grains[nextId % grains.length];
    const mat = new THREE.MeshStandardMaterial({
      map: grain.map, bumpMap: grain.bump, bumpScale: 0.6, color: tint, roughness: rough, metalness: 0,
      emissive: 0x000000, envMapIntensity: 0.7
    });
    const mesh = new THREE.Mesh(makeStickGeometry(len, ends[0], ends[1]), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    ctx.scene.add(mesh);
    mesh.position.set(x, y, z); mesh.quaternion.copy(q);

    const halfExtents = new THREE.Vector3(hx, hy, hz);
    const pos = new THREE.Vector3(x, y, z);
    const body = makeStickBody(halfExtents, pos, q, {});

    const rec = { id: nextId++, mesh, body, cured: null, len, ends, tint, rough,
      halfExtents,
      cuboid: new RAPIER.Cuboid(hx, hy, hz),                                       // reused by the drop solver
      prevPos: pos.clone(), currPos: pos.clone(),                                  // physics pose pair
      prevQuat: q.clone(), currQuat: q.clone() };                                  // for render interpolation
    mesh.userData.rec = rec;
    ctx.recByBody.set(body.handle, rec);     // impact audio looks sticks up by body
    sticks.push(rec); stickMeshes.push(mesh);
    window.__leanto.sticks = sticks.length;
    if (ctx.buildMode) body.setBodyType(RAPIER.RigidBodyType.Fixed, true); // freeze-on-place: static, collidable, holds pose
    ctx.refreshQueries();
    ctx.lastPlaced = rec;                    // the stamp tool copies the most recent stick
    return rec;
  }

  function removeStick(rec){                 // single-stick removal (snip consumes the original)
    const i = sticks.indexOf(rec);
    if (i < 0) return;
    if (ctx.dropBondsOf) ctx.dropBondsOf(rec);
    ctx.scene.remove(rec.mesh); rec.mesh.material.dispose();    // geometry is cached/shared — keep it
    if (rec.body){ ctx.recByBody.delete(rec.body.handle); ctx.world.removeRigidBody(rec.body); }
    ctx.refreshQueries();
    sticks.splice(i, 1); stickMeshes.splice(stickMeshes.indexOf(rec.mesh), 1);
    window.__leanto.sticks = sticks.length;
  }

  function sweep(){
    if (ctx.clearAllBonds) ctx.clearAllBonds();
    if (ctx.dropCompounds) ctx.dropCompounds();
    for (const s of sticks) {
      ctx.scene.remove(s.mesh); s.mesh.material.dispose();      // geometry is cached/shared — keep it
      if (s.body) ctx.world.removeRigidBody(s.body);
    }
    sticks.length = 0; stickMeshes.length = 0; ctx.recByBody.clear();
    ctx.held = null; ctx.heldBody = null; ctx.controls.enabled = true;
    window.__leanto.sticks = 0;
    ctx.refreshQueries();
  }

  // build mode = the "third hand": freeze every stick so it holds while you place the next;
  // releasing build mode drops everything into live physics — watch it stand or fall.
  // Glued assemblies CURE into one compound rigid body for RUN (that's what keeps a
  // 200-stick house from jittering apart) and UNCURE back to per-stick Fixed bodies + wet
  // joints for BUILD. The bond edge list is the source of truth across the round-trip.
  function setBuildMode(on){
    ctx.buildMode = on;
    if (on){
      if (ctx.uncureAll) ctx.uncureAll();     // settled compounds -> per-stick Fixed bodies + recreated wet joints
      for (const s of sticks){
        if (s === ctx.held || s.cured) continue;
        s.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);       // freeze-on-place: static + collidable
      }
    } else {
      if (ctx.clearUndo) ctx.clearUndo();     // undoing mid-RUN is incoherent — history flushes at the reveal
      if (ctx.cureAll) ctx.cureAll();         // multi-stick assemblies -> one dynamic compound each
      for (const s of sticks){
        if (s === ctx.held || s.cured) continue;
        s.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        s.body.setLinvel({ x:0, y:0, z:0 }, true);                  // no launch impulse
        s.body.setAngvel({ x:0, y:0, z:0 }, true);
        s.body.setGravityScale(0.25, true);                         // gravity eases in (see loop)
        s.body.wakeUp();
      }
      ctx.runRamp = 0;                                              // start the gentle Build->Run hand-off
    }
    window.__leanto.buildMode = on;
    ctx.refreshQueries();
  }

  ctx.buildMode = true;     // BUILD (default) vs RUN
  ctx.recByBody = new Map();
  ctx.sticks = sticks;
  ctx.stickMeshes = stickMeshes;
  ctx.spawnStick = spawnStick;
  ctx.makeStickBody = makeStickBody;
  ctx.removeStick = removeStick;
  ctx.sweep = sweep;
  ctx.setBuildMode = setBuildMode;
  ctx.STICK = { L: STICK_L, W: STICK_W, T: STICK_T };
  ctx.MAX_STICKS = MAX_STICKS;
}
