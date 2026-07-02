// main.js — boot, input wiring, and the render/physics loop.
// All shared state lives on `ctx`; each module hangs its piece on it.

export async function boot() {
  const THREE = await import('three');
  const RAPIER_mod = await import('https://esm.sh/@dimforge/rapier3d-compat@0.14.0');
  const RAPIER = RAPIER_mod.default ?? RAPIER_mod;
  await RAPIER.init();

  const { createPhysics } = await import('./physics.js');
  const { createScene }   = await import('./scene.js');
  const { createAudio }   = await import('./audio.js');
  const { createSolver }  = await import('./solver.js');
  const { createSticks }  = await import('./sticks.js');
  const { createGlue }    = await import('./glue.js');

  const loadingEl = document.getElementById('loading');
  const hudEl = document.getElementById('hud');
  const statusEl = document.getElementById('status');

  const ctx = { THREE, RAPIER, held: null };
  createPhysics(ctx);
  createScene(ctx);
  createAudio(ctx);
  createSolver(ctx);
  createSticks(ctx);
  createGlue(ctx);
  const { world, eventQueue, camera, renderer, controls, tableMesh,
          sticks, stickMeshes, FIXED_DT, MAX_SUBSTEPS } = ctx;

  // a few sticks laid flat on the table, ready to build with (BUILD mode is the default)
  for (let i=0;i<6;i++){
    const a = Math.random()*Math.PI*2, r = 0.05 + Math.random()*0.14;
    ctx.spawnStick(Math.cos(a)*r, 0, Math.sin(a)*r, Math.random()*Math.PI, { rest:true });
  }

  // ---------- pick / hold model ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
  const keys = {};
  let grabMode = null;                       // 'move' (left-drag) | 'rotate' (right-drag)
  let lastX = 0, lastY = 0;                   // right-drag rotation deltas
  const grabOffset = new THREE.Vector3();     // keep the grabbed point under the cursor
  const heldQuat = new THREE.Quaternion();
  const targetPos = new THREE.Vector3();
  const smoothPos = new THREE.Vector3();

  function setNdc(e){
    ndc.x = (e.clientX/innerWidth)*2 - 1;
    ndc.y = -(e.clientY/innerHeight)*2 + 1;
  }
  function cursorOnPlane(h, out){
    plane.constant = -h;                    // plane y = h
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(plane, out);
  }

  // surface inference: the held stick rests ON whatever is under the cursor (the table, or a placed stick).
  // The cursor IS the position — no separate height to dial. The cursor ray picks the x,z;
  // the drop solver (solveDropY) supplies an orientation-aware height.
  const _cands = [];
  function cursorSurfacePoint(out){          // where the cursor ray meets the table world (x,z source)
    raycaster.setFromCamera(ndc, camera);
    _cands.length = 0;
    for (const m of stickMeshes) if (!ctx.held || m !== ctx.held.mesh) _cands.push(m);
    _cands.push(tableMesh);
    const hits = raycaster.intersectObjects(_cands, false);
    if (hits.length){ out.copy(hits[0].point); return true; }
    plane.constant = 0;                      // fallback: the bare table plane
    return !!raycaster.ray.intersectPlane(plane, out);
  }
  function solveHeldTarget(out){
    if (!cursorSurfacePoint(out)) return false;
    out.x += grabOffset.x; out.z += grabOffset.z;   // keep the grabbed point under the cursor
    out.y = ctx.solveDropY(out.x, out.z, heldQuat,
                           ctx.held.halfExtents.x, ctx.held.halfExtents.y, ctx.held.halfExtents.z, ctx.held.body);
    return true;
  }

  function grab(rec, mode, hitPoint){
    ctx.held = rec; grabMode = mode;
    const t = rec.body.translation(), r = rec.body.rotation();
    heldQuat.set(r.x, r.y, r.z, r.w);
    smoothPos.set(t.x, t.y, t.z);
    grabOffset.set(0, 0, 0);
    if (mode === 'move' && hitPoint) grabOffset.set(t.x - hitPoint.x, 0, t.z - hitPoint.z); // grabbed point stays under cursor
    rec.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);  // re-grab works from Fixed too
    rec.mesh.material.emissive.setHex(0x3a2300);
  }
  function release(){
    const rec = ctx.held; ctx.held = null;
    rec.mesh.material.emissive.setHex(0x000000);
    if (ctx.buildMode){ rec.body.setBodyType(RAPIER.RigidBodyType.Fixed, true); return; } // freeze-on-place
    rec.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    rec.body.setLinvel({ x:0, y:0, z:0 }, true);   // zero velocity: no launch impulse on kinematic->dynamic
    rec.body.setAngvel({ x:0, y:0, z:0 }, true);
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;     // left = move, right = rotate
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(stickMeshes, false);

    if (ctx.glueMode) {                                // GLUE: left-click sticks to bond, right-click cancels
      if (e.button === 2) { ctx.clearGlueSel(); return; }
      if (!hits.length) return;                        // empty space -> OrbitControls (orbit/pan)
      controls.enabled = false;                        // hold the camera still during a pick
      ctx.gluePick(hits[0].object.userData.rec, hits[0].point);
      return;
    }

    if (!hits.length) return;                          // empty space -> OrbitControls (orbit/pan)
    lastX = e.clientX; lastY = e.clientY;
    grab(hits[0].object.userData.rec, e.button === 2 ? 'rotate' : 'move', hits[0].point);
    controls.enabled = false;
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());  // right-drag rotates; suppress menu
  window.addEventListener('pointermove', (e) => {
    setNdc(e);                              // track the cursor even when idle (Space spawns at it)
    if (!ctx.held) return;
    if (grabMode === 'rotate') {
      const k = 0.012;
      const dq = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), (e.clientX - lastX) * k)   // yaw  <- horizontal drag
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (e.clientY - lastY) * k)); // tilt <- vertical drag
      heldQuat.premultiply(dq);                        // rotate about world axes (free, no snap)
      lastX = e.clientX; lastY = e.clientY;
    }
  });
  window.addEventListener('pointerup', () => {
    if (ctx.held) { release(); controls.enabled = true; grabMode = null; }
    else if (ctx.glueMode) { controls.enabled = true; }   // re-enable the camera after a glue pick
  });
  // wheel stays bound to OrbitControls zoom — height is resolved by surface inference, not scrolled.

  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.code === 'Space') {
      e.preventDefault();
      const p = new THREE.Vector3();
      const yaw = Math.random()*Math.PI;
      if (ctx.buildMode) {                   // BUILD: the new stick rests on whatever's under the cursor
        if (!cursorSurfacePoint(p)) p.set((Math.random()-0.5)*0.1, 0, (Math.random()-0.5)*0.1);
        ctx.spawnStick(p.x, 0, p.z, yaw, { rest:true });
      }
      else if (cursorOnPlane(0.16, p)) ctx.spawnStick(p.x, 0.16, p.z, yaw);   // RUN: toss it in
      else ctx.spawnStick((Math.random()-0.5)*0.1, 0.16, (Math.random()-0.5)*0.1, yaw);
    }
    if (e.key.toLowerCase() === 'm') ctx.toggleMute();
    if (e.key.toLowerCase() === 'b') ctx.setBuildMode(!ctx.buildMode);
    if (e.key.toLowerCase() === 'g') ctx.setGlueMode(!ctx.glueMode);
    if (e.key === 'Backspace') { e.preventDefault(); ctx.sweep(); }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  function applyHeldRotation(){
    const s = 0.045, dq = new THREE.Quaternion(), ax = new THREE.Vector3();
    const add = (x,y,z,sign) => dq.multiply(new THREE.Quaternion().setFromAxisAngle(ax.set(x,y,z), s*sign));
    if (keys['q']) add(0,1,0, 1); if (keys['e']) add(0,1,0,-1);
    if (keys['r']) add(1,0,0, 1); if (keys['f']) add(1,0,0,-1);
    if (keys['z']) add(0,0,1, 1); if (keys['x']) add(0,0,1,-1);
    heldQuat.premultiply(dq);                 // rotate about world axes
  }

  // ---------- loop ----------
  // Physics runs on the fixed clock (see physics.js); rendering interpolates between
  // the last two physics poses so motion stays silky at any frame rate.
  let acc = 0, last = performance.now();

  function stepOnce(){
    const held = ctx.held;
    if (held) {
      held.body.setNextKinematicTranslation({ x:smoothPos.x, y:smoothPos.y, z:smoothPos.z });
      held.body.setNextKinematicRotation({ x:heldQuat.x, y:heldQuat.y, z:heldQuat.z, w:heldQuat.w });
    }
    if (ctx.runRamp >= 0) {                   // ease gravity 0.25 -> 1 over ~0.8s of SIMULATION time
      ctx.runRamp += FIXED_DT;
      const gs = Math.min(1, 0.25 + 0.94 * (ctx.runRamp / 0.8));
      for (const s of sticks) if (s !== held) s.body.setGravityScale(gs, true);
      if (ctx.runRamp >= 0.8) ctx.runRamp = -1;
    }
    for (const s of sticks){ s.prevPos.copy(s.currPos); s.prevQuat.copy(s.currQuat); }
    world.step(eventQueue);
    eventQueue.drainCollisionEvents((a, b, started) => { if (started) ctx.clack(); });
    for (const s of sticks){
      const t = s.body.translation(), r = s.body.rotation();
      s.currPos.set(t.x, t.y, t.z); s.currQuat.set(r.x, r.y, r.z, r.w);
    }
    window.__leanto.physSteps++;
  }

  function loop(now){
    const frameDt = Math.min(0.1, (now - last)/1000); last = now;

    if (ctx.held) {
      applyHeldRotation();                              // keys remain a quiet secondary control (Z/X roll, etc.)
      if (grabMode === 'move' && solveHeldTarget(targetPos)) smoothPos.lerp(targetPos, 0.4);
      else if (grabMode === 'rotate')                   // re-solve height as the pose tilts (no freeze-through-table)
        smoothPos.y = ctx.solveDropY(smoothPos.x, smoothPos.z, heldQuat,
                                     ctx.held.halfExtents.x, ctx.held.halfExtents.y, ctx.held.halfExtents.z, ctx.held.body);
    }

    acc += frameDt;
    let n = 0;
    while (acc >= FIXED_DT && n < MAX_SUBSTEPS){ stepOnce(); acc -= FIXED_DT; n++; }
    if (n === MAX_SUBSTEPS) acc = 0;                    // badly throttled: drop the backlog, don't spiral
    const alpha = acc / FIXED_DT;

    for (const s of sticks) {
      s.mesh.position.lerpVectors(s.prevPos, s.currPos, alpha);
      s.mesh.quaternion.slerpQuaternions(s.prevQuat, s.currQuat, alpha);
    }

    controls.update();
    renderer.render(ctx.scene, camera);
    window.__leanto.frames++;
    if (sticks.length) {
      window.__leanto.firstY = sticks[0].body.translation().y;
      window.__leanto.lastY = sticks[sticks.length - 1].body.translation().y;
    }
    requestAnimationFrame(loop);
  }

  // dev/verification hooks (console + headless checks); the friendly api arrives with the cottage
  window.__leanto.dev = ctx;

  loadingEl.style.display = 'none';
  hudEl.style.display = 'block';
  window.__leanto.ready = true;
  requestAnimationFrame(loop);

  // lightweight on-screen status
  setInterval(() => {
    const mode = ctx.buildMode ? 'BUILD · frozen' : 'live';
    const glue = ctx.glueMode ? (ctx.glueArmed() ? ' · GLUE: pick 2nd stick' : ' · GLUE: pick 1st stick') : '';
    statusEl.textContent = `${sticks.length} sticks · ${ctx.joints.length} glued · ${ctx.held ? 'holding' : mode}${glue}`;
  }, 200);
}
