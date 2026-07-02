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

  const ctx = { THREE, RAPIER, held: null, heldBody: null };
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
  let heldGroup = null;                       // [{rec, relPos, relQuat}] — held stick + its glued assembly
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

  // surface inference: the held stick (and its whole glued assembly) rests ON whatever is
  // under the cursor. The cursor IS the position — the ray picks x,z, the drop solver
  // supplies an orientation-aware height for the group as one rigid whole.
  const _cands = [];
  const _heldMeshes = new Set();
  function cursorSurfacePoint(out){          // where the cursor ray meets the table world (x,z source)
    raycaster.setFromCamera(ndc, camera);
    _cands.length = 0;
    for (const m of stickMeshes) if (!_heldMeshes.has(m)) _cands.push(m);
    _cands.push(tableMesh);
    const hits = raycaster.intersectObjects(_cands, false);
    if (hits.length){ out.copy(hits[0].point); return true; }
    plane.constant = 0;                      // fallback: the bare table plane
    return !!raycaster.ray.intersectPlane(plane, out);
  }
  function solveHeldTarget(out){
    if (!cursorSurfacePoint(out)) return false;
    out.x += grabOffset.x; out.z += grabOffset.z;   // keep the grabbed point under the cursor
    out.y = heldGroup ? ctx.solveGroupDropY(out.x, out.z, heldQuat, heldGroup)
                      : smoothPos.y;                // compound grab in RUN: keep height (it's dynamic on release)
    return true;
  }

  const _mq = new THREE.Quaternion(), _mp = new THREE.Vector3();
  function grab(rec, mode, hitPoint){
    ctx.held = rec; grabMode = mode;
    _heldMeshes.clear();

    if (rec.cured){
      // RUN, dry assembly: grab the whole compound body and steer it
      ctx.heldBody = rec.cured.body;
      heldGroup = null;
      const t = ctx.heldBody.translation(), r = ctx.heldBody.rotation();
      heldQuat.set(r.x, r.y, r.z, r.w);
      smoothPos.set(t.x, t.y, t.z);
      grabOffset.set(0, 0, 0);
      if (mode === 'move' && hitPoint) grabOffset.set(t.x - hitPoint.x, 0, t.z - hitPoint.z);
      ctx.heldBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      for (const s of sticks) if (s.cured && s.cured.body === ctx.heldBody){
        s.mesh.material.emissive.setHex(0x3a2300); _heldMeshes.add(s.mesh);
      }
      return;
    }

    // BUILD (or loose stick in RUN): the stick plus its glued assembly moves as one
    ctx.heldBody = rec.body;
    const t = rec.body.translation(), r = rec.body.rotation();
    heldQuat.set(r.x, r.y, r.z, r.w);
    smoothPos.set(t.x, t.y, t.z);
    grabOffset.set(0, 0, 0);
    if (mode === 'move' && hitPoint) grabOffset.set(t.x - hitPoint.x, 0, t.z - hitPoint.z); // grabbed point stays under cursor
    const qInv = heldQuat.clone().invert();
    heldGroup = ctx.assemblyOf(rec).map(m => {
      const mt = m.body.translation(), mr = m.body.rotation();
      const relPos = new THREE.Vector3(mt.x, mt.y, mt.z).sub(smoothPos).applyQuaternion(qInv);
      const relQuat = qInv.clone().multiply(_mq.set(mr.x, mr.y, mr.z, mr.w).clone());
      m.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);  // re-grab works from Fixed too
      m.mesh.material.emissive.setHex(0x3a2300);
      _heldMeshes.add(m.mesh);
      return { rec: m, relPos, relQuat };
    });
  }

  function release(){
    const rec = ctx.held; ctx.held = null;
    const group = heldGroup; heldGroup = null;
    const body = ctx.heldBody; ctx.heldBody = null;
    _heldMeshes.clear();
    if (group){
      for (const m of group){
        m.rec.mesh.material.emissive.setHex(0x000000);
        if (ctx.buildMode){ m.rec.body.setBodyType(RAPIER.RigidBodyType.Fixed, true); continue; } // freeze-on-place
        m.rec.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        m.rec.body.setLinvel({ x:0, y:0, z:0 }, true);   // zero velocity: no launch impulse
        m.rec.body.setAngvel({ x:0, y:0, z:0 }, true);
      }
      return;
    }
    // compound grab (RUN)
    for (const s of sticks) if (s.cured && s.cured.body === body) s.mesh.material.emissive.setHex(0x000000);
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    body.setLinvel({ x:0, y:0, z:0 }, true);
    body.setAngvel({ x:0, y:0, z:0 }, true);
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;     // left = move, right = rotate
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);

    if (ctx.glueMode) {                                // GLUE: click sticks to bond, click a bead to unglue
      if (e.button === 2) { ctx.clearGlueSel(); return; }
      const beadHits = raycaster.intersectObjects(ctx.beadMeshes, false);
      if (beadHits.length){
        if (!ctx.buildMode) { ctx.deny(); return; }    // unglue is a BUILD-table action
        controls.enabled = false;
        ctx.removeBond(beadHits[0].object.userData.bond);
        return;
      }
      const hits = raycaster.intersectObjects(stickMeshes, false);
      if (!hits.length) return;                        // empty space -> OrbitControls (orbit/pan)
      controls.enabled = false;                        // hold the camera still during a pick
      ctx.gluePick(hits[0].object.userData.rec, hits[0].point);
      return;
    }

    const hits = raycaster.intersectObjects(stickMeshes, false);
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
    if (e.key.toLowerCase() === 'b' && !e.repeat) {
      if (ctx.held) { release(); controls.enabled = true; grabMode = null; }  // set it down before the reveal
      ctx.setBuildMode(!ctx.buildMode);
    }
    if (e.key.toLowerCase() === 'g' && !e.repeat) ctx.setGlueMode(!ctx.glueMode);
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (ctx.held) { release(); controls.enabled = true; grabMode = null; }
      ctx.sweep();
    }
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
  const _kp = new THREE.Vector3(), _kq = new THREE.Quaternion();
  const _cp = new THREE.Vector3(), _cq = new THREE.Quaternion();

  function stepOnce(){
    if (ctx.heldBody) {
      if (heldGroup){
        for (const m of heldGroup){
          _kp.copy(m.relPos).applyQuaternion(heldQuat).add(smoothPos);
          _kq.copy(heldQuat).multiply(m.relQuat);
          m.rec.body.setNextKinematicTranslation({ x:_kp.x, y:_kp.y, z:_kp.z });
          m.rec.body.setNextKinematicRotation({ x:_kq.x, y:_kq.y, z:_kq.z, w:_kq.w });
        }
      } else {
        ctx.heldBody.setNextKinematicTranslation({ x:smoothPos.x, y:smoothPos.y, z:smoothPos.z });
        ctx.heldBody.setNextKinematicRotation({ x:heldQuat.x, y:heldQuat.y, z:heldQuat.z, w:heldQuat.w });
      }
    }
    if (ctx.runRamp >= 0) {                   // ease gravity 0.25 -> 1 over ~0.8s of SIMULATION time
      ctx.runRamp += FIXED_DT;
      const gs = Math.min(1, 0.25 + 0.94 * (ctx.runRamp / 0.8));
      for (const s of sticks) if (!s.cured && s.body && s !== ctx.held) s.body.setGravityScale(gs, true);
      for (const c of ctx.compounds) c.body.setGravityScale(gs, true);
      if (ctx.runRamp >= 0.8) ctx.runRamp = -1;
    }
    for (const s of sticks){ s.prevPos.copy(s.currPos); s.prevQuat.copy(s.currQuat); }
    world.step(eventQueue);
    eventQueue.drainCollisionEvents((a, b, started) => { if (started) ctx.clack(); });
    for (const s of sticks){
      if (s.cured){
        const bt = s.cured.body.translation(), br = s.cured.body.rotation();
        _cq.set(br.x, br.y, br.z, br.w);
        s.currPos.copy(s.cured.relPos).applyQuaternion(_cq).add(_cp.set(bt.x, bt.y, bt.z));
        s.currQuat.copy(_cq).multiply(s.cured.relQuat);
      } else {
        const t = s.body.translation(), r = s.body.rotation();
        s.currPos.set(t.x, t.y, t.z); s.currQuat.set(r.x, r.y, r.z, r.w);
      }
    }
    window.__leanto.physSteps++;
  }

  function loop(now){
    const frameDt = Math.min(0.1, (now - last)/1000); last = now;

    if (ctx.held) {
      applyHeldRotation();                              // keys remain a quiet secondary control (Z/X roll, etc.)
      if (grabMode === 'move' && solveHeldTarget(targetPos)) smoothPos.lerp(targetPos, 0.4);
      else if (grabMode === 'rotate' && heldGroup)      // re-solve height as the pose tilts (no freeze-through-table)
        smoothPos.y = ctx.solveGroupDropY(smoothPos.x, smoothPos.z, heldQuat, heldGroup);
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
      window.__leanto.firstY = sticks[0].currPos.y;
      window.__leanto.lastY = sticks[sticks.length - 1].currPos.y;
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
    const glue = ctx.glueMode ? (ctx.glueArmed() ? ' · GLUE: pick 2nd stick or a bead' : ' · GLUE: pick a stick or a bead') : '';
    statusEl.textContent = `${sticks.length} sticks · ${ctx.joints.length} glued · ${ctx.held ? 'holding' : mode}${glue}`;
  }, 200);
}
