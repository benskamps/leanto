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
  const { createTools }   = await import('./tools.js');
  const { createSave }    = await import('./save.js');
  const { createCharm }   = await import('./charm.js');
  const { createMetrics } = await import('./metrics.js');
  const { createCamera }  = await import('./camera.js');
  const { createInteraction } = await import('./interaction.js');
  const { createHandles } = await import('./handles.js');
  const { createWorkbench } = await import('./workbench.js');

  const loadingEl = document.getElementById('loading');
  const workbenchEl = document.getElementById('workbench');

  const ctx = { THREE, RAPIER, held: null, heldBody: null };
  createPhysics(ctx);
  createScene(ctx);
  createAudio(ctx);
  createSolver(ctx);
  createSticks(ctx);
  createGlue(ctx);
  createTools(ctx);
  createSave(ctx);
  createCharm(ctx);
  createMetrics(ctx);
  createCamera(ctx);
  createInteraction(ctx);
  createHandles(ctx);
  const workbench = createWorkbench(ctx);
  let cottageScene = null;
  const toggleAudio = () => workbench.setMuted(ctx.toggleMute());
  workbench.setMuted(ctx.isMuted());
  const { world, eventQueue, camera, renderer, controls, tableMesh,
          sticks, stickMeshes, FIXED_DT, MAX_SUBSTEPS } = ctx;

  // tiny tween system for the charm layer (bead pop-ins, etc.)
  const tweens = [];
  ctx.addTween = (dur, fn) => tweens.push({ t: 0, dur, fn });

  function setActiveTool(tool){
    const next = ['hand','glue','snip','stamp'].includes(tool) ? tool : 'hand';
    const allowed = ctx.buildMode || next === 'hand' ? next : 'hand';
    ctx.setGlueMode(allowed === 'glue');
    ctx.setSnipMode(allowed === 'snip');
    ctx.interaction.setTool(allowed);
    if (allowed !== 'hand') selectRec(null);
  }

  // survival celebration bookkeeping: snapshot the table at every RUN reveal
  let runWatch = null;                       // { entries:[{rec,p}], elapsed, driftTimer, done }
  const rawSetBuildMode = ctx.setBuildMode;
  ctx.setBuildMode = (on) => {
    if (!on) setActiveTool('hand');
    rawSetBuildMode(on);
    ctx.interaction.setWorld(on ? 'build' : 'run');
    if (!on){
      window.__leanto.maxDrift = 0;
      runWatch = { entries: sticks.map(s => ({ rec: s, p: s.currPos.clone() })),
                   elapsed: 0, driftTimer: 0, done: false,
                   tall: sticks.some(s => s.currPos.y > 0.03), bonded: ctx.joints.length > 0 };
      ctx.metrics.onRunReveal();      // BUILD->RUN: count it + arm survival watch + one-tap rating
    } else { runWatch = null; ctx.metrics.onBuildReturn(); }
  };

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
  let liftY = 0;                              // scroll-to-lift: hover height above the solved resting pose
  const grabOffset = new THREE.Vector3();     // keep the grabbed point under the cursor
  const heldQuat = new THREE.Quaternion();
  const targetPos = new THREE.Vector3();
  const smoothPos = new THREE.Vector3();
  const SELECT_EMISSIVE = 0x241706;
  let selectedRec = null;
  let activePointerId = null;
  let activeHandle = null;
  let pendingGrab = null;
  const orientPlane = new THREE.Plane();
  const orientPivot = new THREE.Vector3();
  const orientHit = new THREE.Vector3();
  const orientDir = new THREE.Vector3();
  const orientCurrent = new THREE.Vector3();
  const orientNormal = new THREE.Vector3();
  const orientDelta = new THREE.Quaternion();
  let liftStartY = 0, liftStartValue = 0, liftWorldPerPx = 0.001;

  function idleEmissive(rec){ return rec && rec === selectedRec ? SELECT_EMISSIVE : 0x000000; }
  function selectRec(rec){
    if (rec && !sticks.includes(rec)) rec = null;
    const old = selectedRec; selectedRec = rec;
    if (old && old !== ctx.held && sticks.includes(old)) old.mesh.material.emissive.setHex(0x000000);
    if (rec && rec !== ctx.held) rec.mesh.material.emissive.setHex(SELECT_EMISSIVE);
    ctx.interaction.select(rec ? rec.id : null);
    ctx.handles.show(!!rec && ctx.interaction.state.tool === 'hand');
  }

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
    out.y = heldGroup ? ctx.solveGroupDropY(out.x, out.z, heldQuat, heldGroup) + liftY
                      : smoothPos.y;                // compound grab in RUN: wheel nudges height directly
    return true;
  }

  const _mq = new THREE.Quaternion(), _mp = new THREE.Vector3();
  let grabPoses = null;                       // pre-grab poses of the whole group, for exact cancel
  let grabSnap = null;                        // pre-grab scene snapshot, for undo/redo history
  function grab(rec, mode, hitPoint){
    ctx.metrics.onGrab(rec);                 // evidence loop: time-to-first-grab + re-grab count
    ctx.held = rec; grabMode = mode;
    liftY = 0;                                // each grab starts resting on the surface
    _heldMeshes.clear();
    grabPoses = ctx.buildMode ? ctx.assemblyOf(rec).map(m => {
      const t = m.body.translation(), r = m.body.rotation();
      return { rec: m, pos: new THREE.Vector3(t.x, t.y, t.z), quat: new THREE.Quaternion(r.x, r.y, r.z, r.w) };
    }) : null;
    grabSnap = ctx.buildMode ? ctx.snapshotScene() : null;

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

  function release(commit = true){
    if (!commit && grabPoses){
      for (const g of grabPoses){
        if (!sticks.includes(g.rec) || g.rec.cured) continue;
        g.rec.body.setTranslation({ x:g.pos.x, y:g.pos.y, z:g.pos.z }, true);
        g.rec.body.setRotation({ x:g.quat.x, y:g.quat.y, z:g.quat.z, w:g.quat.w }, true);
        g.rec.currPos.copy(g.pos); g.rec.prevPos.copy(g.pos);
        g.rec.currQuat.copy(g.quat); g.rec.prevQuat.copy(g.quat);
        g.rec.mesh.position.copy(g.pos); g.rec.mesh.quaternion.copy(g.quat);
      }
    }
    const rec = ctx.held; ctx.held = null;
    if (commit) ctx.metrics.onRelease(rec);  // remember it, so an immediate re-grab reads as a correction
    const group = heldGroup; heldGroup = null;
    const body = ctx.heldBody; ctx.heldBody = null;
    _heldMeshes.clear();
    hoverRec = null; hideGhosts();            // drop the pre-grab highlight + aim ghost as the stick lands
    ctx.interaction.endGesture(); activeHandle = null; activePointerId = null;
    if (group){
      for (const m of group){
        m.rec.mesh.material.emissive.setHex(idleEmissive(m.rec));
        if (ctx.buildMode){ m.rec.body.setBodyType(RAPIER.RigidBodyType.Fixed, true); continue; } // freeze-on-place
        m.rec.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        m.rec.body.setLinvel({ x:0, y:0, z:0 }, true);   // zero velocity: no launch impulse
        m.rec.body.setAngvel({ x:0, y:0, z:0 }, true);
      }
      ctx.lastPlaced = rec;                              // the stamp tool copies this one
      if (ctx.buildMode && commit) ctx.metrics.onPlace();// a set-down on the BUILD table = a placement
      if (ctx.buildMode && commit && grabPoses){
        const t = rec.body.translation(), g0 = grabPoses.find(g => g.rec === rec);
        if (g0 && (Math.hypot(t.x-g0.pos.x, t.y-g0.pos.y, t.z-g0.pos.z) > 1e-5 ||
                   Math.abs(rec.currQuat.dot(g0.quat)) < 0.999999)){
          ctx.pushUndoSnapshot(grabSnap);    // pre-grab table; a no-op move never enters history
        }
      }
      grabPoses = null; grabSnap = null;
      ctx.refreshQueries();
      return;
    }
    // compound grab (RUN)
    for (const s of sticks) if (s.cured && s.cured.body === body) s.mesh.material.emissive.setHex(idleEmissive(s));
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    body.setLinvel({ x:0, y:0, z:0 }, true);
    body.setAngvel({ x:0, y:0, z:0 }, true);
    ctx.refreshQueries();
  }

  // ---------- pre-grab feedback: hover highlight + generous (screen-space) picking ----------
  // Thin sticks (2mm) are a fight to grab against their razor collider, and nothing tells you
  // which stick a click will take. So: (a) raycast the real mesh first — an exact hit wins and
  // placement stays precise; (b) if the ray misses, take the nearest stick whose centre axis is
  // within a few pixels of the cursor; (c) softly light whatever a grab would take.
  const HOVER_EMISSIVE = 0x241606;            // subtle warm glow — dimmer than the held 0x3a2300
  const PICK_TOL_PX = 12;                      // screen-space slack for near-misses on thin sticks
  let hoverRec = null, lastHoverT = 0;
  const _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
  const _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
  const _ux2 = new THREE.Vector3();

  function projectPx(vWorld, out){            // world point -> screen px in out.x/out.y (false if behind)
    out.copy(vWorld).project(camera);
    if (out.z > 1) return false;              // behind camera / beyond the far plane
    out.x = (out.x * 0.5 + 0.5) * innerWidth;
    out.y = (-out.y * 0.5 + 0.5) * innerHeight;
    return true;
  }
  function nearestStick(cx, cy){              // closest stick axis within PICK_TOL_PX of the cursor, else null
    let best = null, bestD = PICK_TOL_PX, bestT = 0;
    for (const s of sticks){
      _ux2.set(1, 0, 0).applyQuaternion(s.currQuat);
      _pa.copy(s.currPos).addScaledVector(_ux2,  s.len/2);
      _pb.copy(s.currPos).addScaledVector(_ux2, -s.len/2);
      if (!projectPx(_pa, _sa) || !projectPx(_pb, _sb)) continue;
      const dx = _sb.x - _sa.x, dy = _sb.y - _sa.y, l2 = dx*dx + dy*dy;
      let t = l2 ? ((cx - _sa.x)*dx + (cy - _sa.y)*dy) / l2 : 0;   // param of the closest point on the segment
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(cx - (_sa.x + t*dx), cy - (_sa.y + t*dy));
      if (d < bestD){ bestD = d; best = s; bestT = t; }
    }
    if (!best) return null;
    _ux2.set(1, 0, 0).applyQuaternion(best.currQuat);
    const point = best.currPos.clone().addScaledVector(_ux2, best.len/2 - bestT*best.len);  // world grab point on the axis
    return { rec: best, point };
  }
  function pickStick(cx, cy){                 // exact ray hit, else the generous near-miss; the grabbed body stays exact
    ndc.x = (cx/innerWidth)*2 - 1;
    ndc.y = -(cy/innerHeight)*2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(stickMeshes, false);
    if (hits.length) return { rec: hits[0].object.userData.rec, point: hits[0].point };
    return nearestStick(cx, cy);
  }
  function setHover(rec){
    if (rec === hoverRec) return;
    clearHover();
    if (rec && rec !== ctx.held && !_heldMeshes.has(rec.mesh)){
      rec.mesh.material.emissive.setHex(HOVER_EMISSIVE);
      hoverRec = rec;
    }
  }
  function clearHover(){                       // never steal the held/glue glow off a stick, or touch a swept mesh
    if (hoverRec && hoverRec !== ctx.held && !_heldMeshes.has(hoverRec.mesh)
        && sticks.includes(hoverRec))
      hoverRec.mesh.material.emissive.setHex(idleEmissive(hoverRec));
    hoverRec = null;
  }
  function updateHover(e){
    const now = performance.now();
    if (now - lastHoverT < 20) return;        // cap the raycast to ~50 Hz — hover latency is invisible
    lastHoverT = now;
    const picked = pickStick(e.clientX, e.clientY);
    setHover(picked ? picked.rec : null);
  }

  // ---------- aim preview: a faint ghost of where a lifted stick will come to rest ----------
  // Surface inference already rests a held stick at the cursor; when you SCROLL it up above that
  // pose, the ghost surfaces the orientation-aware landing the solver has already computed, so you
  // can line up a lean before letting go. (BUILD only; the RUN compound grab has no solved rest.)
  const ghostMat = new THREE.MeshBasicMaterial({
    color: 0xfff2d8, transparent: true, opacity: 0.16, depthWrite: false });
  const ghostMeshes = [];
  const _gc = new THREE.Vector3(), _gp = new THREE.Vector3(), _gq = new THREE.Quaternion();
  function hideGhosts(){ for (const g of ghostMeshes) g.visible = false; }
  function updateAimPreview(){
    if (!(ctx.buildMode && heldGroup && liftY > 0.004)){ hideGhosts(); return; }
    const restY = ctx.solveGroupDropY(smoothPos.x, smoothPos.z, heldQuat, heldGroup);   // rest pose, sans lift
    _gc.set(smoothPos.x, restY, smoothPos.z);
    let i = 0;
    for (const m of heldGroup){
      let g = ghostMeshes[i];
      if (!g){
        g = new THREE.Mesh(m.rec.mesh.geometry, ghostMat);   // share the stick's cached geometry
        g.castShadow = g.receiveShadow = false; g.renderOrder = 2;
        ctx.scene.add(g); ghostMeshes[i] = g;
      } else g.geometry = m.rec.mesh.geometry;
      _gp.copy(m.relPos).applyQuaternion(heldQuat).add(_gc);
      _gq.copy(heldQuat).multiply(m.relQuat);
      g.position.copy(_gp); g.quaternion.copy(_gq); g.visible = true;
      i++;
    }
    for (; i < ghostMeshes.length; i++) ghostMeshes[i].visible = false;
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;     // left = move, right = rotate
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);

    // Selected-stick handles win before tools, stick bodies, or the camera. The target is
    // captured for the whole gesture so a near-miss cannot turn into an orbit halfway through.
    const handleHit = e.button === 0 && ctx.interaction.state.tool === 'hand' && selectedRec
      ? ctx.handles.pick(raycaster) : null;
    if (handleHit){
      activeHandle = handleHit; activePointerId = e.pointerId;
      grab(selectedRec, handleHit.kind === 'end' ? 'orient' : handleHit.kind, null);
      controls.enabled = false;
      try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
      const gesture = handleHit.kind === 'end' ? 'orient' : handleHit.kind;
      ctx.interaction.beginGesture(gesture, 'handle', e.pointerType || 'mouse');
      if (handleHit.kind === 'end'){
        orientCurrent.set(1,0,0).applyQuaternion(heldQuat).normalize();
        orientPivot.copy(smoothPos).addScaledVector(orientCurrent, -handleHit.sign * selectedRec.len/2);
        camera.getWorldDirection(orientNormal);
        orientPlane.setFromNormalAndCoplanarPoint(orientNormal, orientPivot);
      } else if (handleHit.kind === 'lift'){
        liftStartY = e.clientY; liftStartValue = smoothPos.y;
        const dist = camera.position.distanceTo(smoothPos);
        liftWorldPerPx = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov)/2) / innerHeight;
      } else if (handleHit.kind === 'roll') lastX = e.clientX;
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }

    if (ctx.snipMode) {                                // SNIP: click a hovered stick to cut it
      if (e.button === 2) return;
      const hits = raycaster.intersectObjects(stickMeshes, false);
      if (!hits.length) return;                        // empty space -> OrbitControls
      e.preventDefault(); e.stopImmediatePropagation();
      ctx.snipHover(hits[0].object.userData.rec, hits[0].point);
      ctx.snip();
      return;
    }

    if (ctx.glueMode) {                                // GLUE: click sticks to bond, click a bead to unglue
      if (e.button === 2) { ctx.clearGlueSel(); return; }
      const beadHits = raycaster.intersectObjects(ctx.beadMeshes, false);
      if (beadHits.length){
        e.preventDefault(); e.stopImmediatePropagation();
        if (!ctx.buildMode) { ctx.deny(); return; }    // unglue is a BUILD-table action
        controls.enabled = false;
        const bond = beadHits[0].object.userData.bond;
        const snap = ctx.snapshotScene();
        ctx.removeBond(bond);
        ctx.pushUndoSnapshot(snap);
        return;
      }
      const hits = raycaster.intersectObjects(stickMeshes, false);
      if (!hits.length) return;                        // empty space -> OrbitControls (orbit/pan)
      e.preventDefault(); e.stopImmediatePropagation();
      controls.enabled = false;                        // hold the camera still during a pick
      ctx.gluePick(hits[0].object.userData.rec, hits[0].point);
      return;
    }

    const picked = pickStick(e.clientX, e.clientY);    // exact hit, else the nearest thin stick within a few px
    if (!picked) return;                               // truly empty space -> OrbitControls (orbit/pan)
    selectRec(picked.rec);
    pendingGrab = { rec:picked.rec, mode:e.button === 2 ? 'rotate' : 'move', point:picked.point,
      x:e.clientX, y:e.clientY, pointerId:e.pointerId, pointerType:e.pointerType || 'mouse' };
    controls.enabled = false;
    activePointerId = e.pointerId;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());  // right-drag rotates; suppress menu
  window.addEventListener('pointermove', (e) => {
    // Remember the last position over the work surface. Moving into the DOM tool rail must
    // not silently move the placement cursor to the bottom of the table.
    const overCanvas = e.target === renderer.domElement;
    if (overCanvas || ctx.held || pendingGrab) setNdc(e);
    if (!overCanvas && !ctx.held && !pendingGrab) return;
    if (pendingGrab && e.pointerId === pendingGrab.pointerId){
      if (Math.hypot(e.clientX-pendingGrab.x,e.clientY-pendingGrab.y) < 4) return;
      const p = pendingGrab; pendingGrab = null;
      lastX = e.clientX; lastY = e.clientY;
      grab(p.rec,p.mode,p.point);
      ctx.interaction.beginGesture(p.mode === 'rotate' ? 'orient' : 'move','stick',p.pointerType);
    }
    if (ctx.snipMode && !ctx.held) {        // track the cut line under the cursor
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(stickMeshes, false);
      ctx.snipHover(hits.length ? hits[0].object.userData.rec : null, hits.length ? hits[0].point : null);
    }
    if (!ctx.held && !ctx.glueMode && !ctx.snipMode) updateHover(e);   // pre-grab hover highlight
    else clearHover();                                                 // held or a tool owns the glow
    if (keys['d'] && ctx.buildMode && !ctx.held) {     // plank-run: hold D + sweep the cursor
      const p = new THREE.Vector3();
      if (cursorSurfacePoint(p)) ctx.stampRun(p);
    }
    if (!ctx.held) return;
    if (grabMode === 'orient' && activeHandle){
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(orientPlane, orientHit)){
        orientDir.copy(orientHit).sub(orientPivot);
        if (orientDir.lengthSq() > 1e-7){
          orientDir.normalize();
          orientCurrent.set(1,0,0).applyQuaternion(heldQuat).normalize();
          orientDelta.setFromUnitVectors(orientCurrent, orientDir);
          heldQuat.premultiply(orientDelta).normalize();
          smoothPos.copy(orientPivot).addScaledVector(orientDir, activeHandle.sign * selectedRec.len/2);
        }
      }
    } else if (grabMode === 'lift' && activeHandle){
      smoothPos.y = Math.min(.65, Math.max(.002, liftStartValue + (liftStartY-e.clientY)*liftWorldPerPx));
      if (heldGroup){
        const rest = ctx.solveGroupDropY(smoothPos.x, smoothPos.z, heldQuat, heldGroup);
        liftY = Math.max(0, smoothPos.y-rest);
      }
    } else if (grabMode === 'roll' && activeHandle){
      const angle = (e.clientX-lastX)*.015;
      heldQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), angle)).normalize();
      lastX = e.clientX;
    } else if (grabMode === 'rotate') {
      const k = 0.012;
      const dq = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), (e.clientX - lastX) * k)   // yaw  <- horizontal drag
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (e.clientY - lastY) * k)); // tilt <- vertical drag
      heldQuat.premultiply(dq);                        // rotate about world axes (free, no snap)
      lastX = e.clientX; lastY = e.clientY;
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (pendingGrab && e.pointerId === pendingGrab.pointerId){
      pendingGrab = null; activePointerId = null; controls.enabled = true;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    if (ctx.held) {
      release(); controls.enabled = true; grabMode = null;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    else if (ctx.glueMode) { controls.enabled = true; }   // re-enable the camera after a glue pick
  });
  window.addEventListener('pointercancel', (e) => {
    if (pendingGrab && e.pointerId === pendingGrab.pointerId){
      pendingGrab = null; activePointerId = null; controls.enabled = true; return;
    }
    if (!ctx.held) return;
    release(false); controls.enabled = true; grabMode = null;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
  });
  // wheel: zoom when idle (OrbitControls) — but while HOLDING, the camera is parked, so the
  // wheel becomes the y axis: scroll up lifts the held stick/assembly above its solved resting
  // pose, scroll down settles it back. Surface inference still gives the base height.
  renderer.domElement.addEventListener('wheel', (e) => {
    if (!ctx.held) return;                    // idle → OrbitControls zoom
    e.preventDefault(); e.stopImmediatePropagation();
    const step = -e.deltaY * 0.00022;
    if (heldGroup) liftY = Math.min(0.5, Math.max(0, liftY + step));
    else smoothPos.y = Math.min(0.6, Math.max(0.002, smoothPos.y + step));   // compound grab (RUN)
  }, { passive: false, capture: true });

  function addStickAtCursor(half = false){
    const p = new THREE.Vector3();
    const yaw = Math.random()*Math.PI;
    const size = half
      ? { len:ctx.STICK.L*(1+(Math.random()-.5)*.07)/2, ends:['round','square'] } : {};
    const snap = ctx.buildMode ? ctx.snapshotScene() : null;
    let spawned = null;
    if (ctx.buildMode){
      if (!cursorSurfacePoint(p)) p.set((Math.random()-.5)*.1,0,(Math.random()-.5)*.1);
      spawned = ctx.spawnStick(p.x,0,p.z,yaw,{ rest:true,...size });
    } else if (cursorOnPlane(.16,p)) spawned = ctx.spawnStick(p.x,.16,p.z,yaw,size);
    else spawned = ctx.spawnStick((Math.random()-.5)*.1,.16,(Math.random()-.5)*.1,yaw,size);
    if (spawned){
      selectRec(spawned);
      if (ctx.buildMode) ctx.pushUndoSnapshot(snap);
    }
    return spawned;
  }

  function duplicateAtCursor(){
    const p = new THREE.Vector3();
    if (!cursorSurfacePoint(p)) return null;
    const rec = ctx.stampAt(p);
    if (rec) selectRec(rec);
    return rec;
  }

  function deleteSelected(){
    if (!ctx.buildMode || !selectedRec || selectedRec.cured || ctx.held) return false;
    const snap = ctx.snapshotScene();
    const rec = selectedRec; selectRec(null);
    ctx.removeStick(rec);                    // dissolves its bonds too (bead pops)
    ctx.pushUndoSnapshot(snap);
    return true;
  }

  function cycleSelection(dir = 1){
    if (!sticks.length){ selectRec(null); return; }
    const at = selectedRec ? sticks.indexOf(selectedRec) : -1;
    selectRec(sticks[(at + dir + sticks.length) % sticks.length]);
  }

  function setFixedPose(rec,pos,quat){
    rec.body.setTranslation({ x:pos.x,y:pos.y,z:pos.z },true);
    rec.body.setRotation({ x:quat.x,y:quat.y,z:quat.z,w:quat.w },true);
    rec.currPos.copy(pos); rec.prevPos.copy(pos); rec.currQuat.copy(quat); rec.prevQuat.copy(quat);
    rec.mesh.position.copy(pos); rec.mesh.quaternion.copy(quat);
  }

  function keyboardTransform({ delta = null, axis = null, angle = 0 }){
    if (!ctx.buildMode || !selectedRec || selectedRec.cured) return false;
    const snap = ctx.snapshotScene();
    const group = ctx.assemblyOf(selectedRec);
    const before = group.map(rec => ({ rec,pos:rec.currPos.clone(),quat:rec.currQuat.clone() }));
    const root = selectedRec.currPos.clone();
    const dq = axis ? new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(),angle) : null;
    for (const item of before){
      const pos = item.pos.clone(), quat = item.quat.clone();
      if (delta) pos.add(delta);
      if (dq){ pos.sub(root).applyQuaternion(dq).add(root); quat.premultiply(dq); }
      setFixedPose(item.rec,pos,quat);
    }
    ctx.refreshQueries();
    ctx.pushUndoSnapshot(snap);
    ctx.metrics.onPlace();
    return true;
  }

  window.addEventListener('keydown', (e) => {
    window.__leanto.lastKey = e.key;
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'Escape' && ctx.held){
      e.preventDefault(); release(false); controls.enabled = true; grabMode = null; return;
    }
    if (e.key === 'Escape' && selectedRec){ e.preventDefault(); selectRec(null); return; }
    if (e.key === 'Delete' && selectedRec && !ctx.held){
      e.preventDefault();
      if (deleteSelected()) ctx.clack();
      else ctx.deny();                       // deleting is a BUILD-table action
      return;
    }
    if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.repeat){
      e.preventDefault(); cycleSelection(e.shiftKey ? -1 : 1); return;
    }
    if (selectedRec && ctx.buildMode && !ctx.held){
      const step = e.shiftKey ? .001 : .005;
      const camRight = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion); camRight.y = 0; camRight.normalize();
      const camForward = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion); camForward.y = 0; camForward.normalize();
      let changed = false;
      if (e.key.startsWith('Arrow')){
        e.preventDefault();
        if (keys['r']){
          const axis = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
            ? new THREE.Vector3(0,1,0) : camRight;
          const sign = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? 1 : -1;
          changed = keyboardTransform({ axis,angle:sign*(e.shiftKey ? .02 : .07) });
        } else {
          const delta = (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? camRight : camForward)
            .multiplyScalar((e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1)*step);
          changed = keyboardTransform({ delta });
        }
      } else if (e.key === 'PageUp' || e.key === 'PageDown'){
        e.preventDefault(); changed = keyboardTransform({ delta:new THREE.Vector3(0,e.key === 'PageUp'?step:-step,0) });
      } else if (e.key === '[' || e.key === ']'){
        e.preventDefault();
        const axis = new THREE.Vector3(1,0,0).applyQuaternion(selectedRec.currQuat);
        changed = keyboardTransform({ axis,angle:(e.key === '['?1:-1)*(e.shiftKey ? .02 : .07) });
      }
      if (changed) return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      addStickAtCursor(e.shiftKey);
    }
    if (e.key.toLowerCase() === 'd' && !e.repeat && !ctx.held && !e.ctrlKey && !e.metaKey) {
      const p = new THREE.Vector3();          // stamp a copy of the last-placed stick
      if (cursorSurfacePoint(p)) ctx.stampAt(p);
      ctx.setStampRun(true);
      ctx.interaction.setTool('stamp');
    }
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();                     // undoing mid-hold would yank the stick from your hand
      if (!ctx.held) { if (e.shiftKey) ctx.redo(); else ctx.undo(); }
    }
    if ((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!ctx.held) ctx.redo();
    }
    if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ctx.downloadScene(); return; }
    if ((e.key === 'o' || e.key === 'O') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ctx.openScenePicker(); return; }
    if (e.key.toLowerCase() === 'm') toggleAudio();
    if (e.key.toLowerCase() === 'b' && !e.repeat) {
      if (ctx.held) { release(); controls.enabled = true; grabMode = null; }  // set it down before the reveal
      ctx.setBuildMode(!ctx.buildMode);
    }
    if (!ctx.held && !e.ctrlKey && !e.metaKey) {   // camera rig: canned angles + frame-the-build
      if (e.key === '1') ctx.camGoto('hero');
      if (e.key === '2') ctx.camGoto('front');
      if (e.key === '3') ctx.camGoto('side');
      if (e.key === '4') ctx.camGoto('top');
      if (e.key.toLowerCase() === 'f' && !e.repeat) ctx.camFrame();
    }
    if (e.key.toLowerCase() === 'g' && !e.repeat) setActiveTool(ctx.interaction.state.tool === 'glue' ? 'hand' : 'glue');
    if (e.key.toLowerCase() === 's' && !e.repeat && !e.ctrlKey && !e.metaKey)
      setActiveTool(ctx.interaction.state.tool === 'snip' ? 'hand' : 'snip');
    if (e.key.toLowerCase() === 'p' && !e.repeat && !e.ctrlKey && !e.metaKey) {
      if (e.shiftKey){                        // Shift+P: save a clean PNG of the current view
        renderer.render(ctx.scene, camera);
        const a = document.createElement('a');
        a.href = renderer.domElement.toDataURL('image/png');
        a.download = 'leanto.png';
        a.click();
      } else setPhotoMode(!photoMode);        // P: hide the HUD, slow turntable
    }
    if (e.key === 'Backspace') {              // sweep is destructive — ask twice
      e.preventDefault();
      if (performance.now() < sweepArmedUntil){
        sweepArmedUntil = 0;
        if (ctx.held) { release(); controls.enabled = true; grabMode = null; }
        if (ctx.clearUndo) ctx.clearUndo();
        ctx.sweep();
      } else sweepArmedUntil = performance.now() + 2000;
    }
  });
  let sweepArmedUntil = 0;
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    if (e.key.toLowerCase() === 'd') { ctx.setStampRun(false); setActiveTool('hand'); }
  });

  workbench.bind({
    toggleMode(){
      if (ctx.held){ release(); controls.enabled = true; grabMode = null; }
      ctx.setBuildMode(!ctx.buildMode);
    },
    undo(){ ctx.undo(); },
    redo(){ ctx.redo(); },
    toggleSound(){ toggleAudio(); },
    addStick(){ addStickAtCursor(false); },
    setTool(tool){
      if (tool === 'stamp'){
        setActiveTool('stamp');
        duplicateAtCursor();
        setActiveTool('hand');
      } else setActiveTool(tool);
    },
    loadCottage(){
      if (!cottageScene) return;
      try { selectRec(null); ctx.loadScene(cottageScene); workbench.setHelp(false); }
      catch (_) { ctx.deny(); }
    },
  });

  let photoMode = false;
  function setPhotoMode(on){
    photoMode = on;
    workbench.hide(on);
    ctx.daylightDial.style.display = on ? 'none' : 'block';
    controls.autoRotate = on && !ctx.reducedMotion;
    controls.autoRotateSpeed = 0.8;
    window.__leanto.photoMode = on;
  }
  ctx.setPhotoMode = setPhotoMode;

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
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      let strength = 0.5, len;
      try {                                   // gain from impact speed, pitch from stick length
        const b1 = world.getCollider(h1)?.parent(), b2 = world.getCollider(h2)?.parent();
        const v1 = b1 ? b1.linvel() : { x:0, y:0, z:0 };
        const v2 = b2 ? b2.linvel() : { x:0, y:0, z:0 };
        strength = Math.min(1, Math.hypot(v1.x-v2.x, v1.y-v2.y, v1.z-v2.z) / 0.8);
        const rec = (b1 && ctx.recByBody.get(b1.handle)) || (b2 && ctx.recByBody.get(b2.handle));
        if (rec) len = rec.len;
      } catch (_) {}
      ctx.clack(strength, len);
    });
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
        smoothPos.y = ctx.solveGroupDropY(smoothPos.x, smoothPos.z, heldQuat, heldGroup) + liftY;
    }
    updateAimPreview();                                 // faint ghost of the resting pose while a lifted stick is held

    const stableBuild = ctx.buildMode && !ctx.held && ctx.runRamp < 0;
    if (stableBuild) acc = 0;
    else acc += frameDt;
    let n = 0;
    while (acc >= FIXED_DT && n < MAX_SUBSTEPS){ stepOnce(); acc -= FIXED_DT; n++; }
    if (n === MAX_SUBSTEPS){
      acc = 0;                                          // badly throttled: drop the backlog, don't spiral
      window.__leanto.droppedBacklogs = (window.__leanto.droppedBacklogs || 0) + 1;
    }
    const alpha = acc / FIXED_DT;

    for (const s of sticks) {
      s.mesh.position.lerpVectors(s.prevPos, s.currPos, alpha);
      s.mesh.quaternion.slerpQuaternions(s.prevQuat, s.currQuat, alpha);
    }
    if (selectedRec && !sticks.includes(selectedRec)) selectRec(null);
    if (selectedRec && ctx.interaction.state.tool === 'hand'){
      const hp = ctx.held === selectedRec ? smoothPos : selectedRec.mesh.position;
      const hq = ctx.held === selectedRec ? heldQuat : selectedRec.mesh.quaternion;
      ctx.handles.update(selectedRec, hp, hq, camera);
    } else ctx.handles.show(false);

    // charm layer: motes drift, confetti falls, light swells
    ctx.charmUpdate(frameDt);
    for (let i = tweens.length - 1; i >= 0; i--){
      const tw = tweens[i];
      tw.t += frameDt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) tweens.splice(i, 1);
    }

    // the survival watch: a real structure (20+ sticks, glued, standing tall) that rides
    // out 10 seconds of live physics without drifting earns a quiet celebration
    if (!ctx.buildMode && runWatch){
      runWatch.elapsed += frameDt;
      runWatch.driftTimer += frameDt;
      if (runWatch.driftTimer > 0.25){
        runWatch.driftTimer = 0;
        const alive = new Set(sticks);
        let md = window.__leanto.maxDrift || 0;
        for (const en of runWatch.entries)
          if (alive.has(en.rec)) md = Math.max(md, en.rec.currPos.distanceTo(en.p));
        window.__leanto.maxDrift = md;
        if (!runWatch.done && runWatch.elapsed >= 10 && runWatch.bonded && runWatch.tall &&
            sticks.length >= 20 && md < 0.005){
          runWatch.done = true;
          const c = new THREE.Vector3();
          for (const s of sticks) c.add(s.currPos);
          c.divideScalar(sticks.length);
          ctx.celebrate(c);
        }
      }
    }

    ctx.camUpdate(frameDt);                             // camera glides + tabletop pan clamp
    controls.update();
    renderer.render(ctx.scene, camera);
    window.__leanto.frames++;
    if (sticks.length) {
      window.__leanto.firstY = sticks[0].currPos.y;
      window.__leanto.lastY = sticks[sticks.length - 1].currPos.y;
    }
    requestAnimationFrame(loop);
  }

  // dev/verification hooks (console + headless checks)
  window.__leanto.dev = ctx;

  // ---------- the friendly scripting api (authoring, showcases, headless gates) ----------
  const byId = (id) => sticks.find(s => s.id === id);
  window.__leanto.api = {
    // spawn a stick from a plain descriptor; returns its id.
    // d: { x,y,z, yaw, len, ends:[L,R], quat:[x,y,z,w], tint:'#hex', rough, rest }
    spawn(d = {}){
      const opts = { rest: d.rest, len: d.len, ends: d.ends, rough: d.rough };
      if (d.quat) opts.quat = new THREE.Quaternion(d.quat[0], d.quat[1], d.quat[2], d.quat[3]);
      if (d.tint) opts.tint = new THREE.Color(d.tint);
      const rec = ctx.spawnStick(d.x || 0, d.y || 0, d.z || 0, d.yaw || 0, opts);
      return rec ? rec.id : null;
    },
    place(id, pos, quat){                    // teleport a stick to an exact pose (stays frozen in BUILD)
      const rec = byId(id); if (!rec || rec.cured) return false;
      const q = quat ? new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]) : rec.currQuat;
      rec.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      rec.body.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true);
      rec.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      rec.body.setBodyType(ctx.buildMode ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic, true);
      rec.currPos.set(pos[0], pos[1], pos[2]); rec.prevPos.copy(rec.currPos);
      rec.currQuat.copy(q); rec.prevQuat.copy(q);
      rec.mesh.position.copy(rec.currPos); rec.mesh.quaternion.copy(q);
      ctx.refreshQueries();
      return true;
    },
    bond(idA, idB, at){                      // weld two sticks (authoring skips proximity checks)
      const a = byId(idA), b = byId(idB); if (!a || !b) return false;
      return !!ctx.bondSticks(a, b, at ? new THREE.Vector3(at[0], at[1], at[2]) : null);
    },
    snipAt(id, localX){
      const rec = byId(id); if (!rec) return false;
      const t = rec.body.translation(), r = rec.body.rotation();
      const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      const ux = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const p = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(ux, localX);
      ctx.setSnipMode(true); ctx.snipHover(rec, p);
      const ok = ctx.snip(); ctx.setSnipMode(false);
      return ok;
    },
    setMode(build){ ctx.setBuildMode(!!build); },
    sweep(){ ctx.sweep(); },
    undo(){ ctx.undo(); return ctx.historyDepth(); },
    redo(){ ctx.redo(); return ctx.historyDepth(); },
    history(){ return ctx.historyDepth(); },
    select(id){ const rec = byId(id); if (!rec) return false; selectRec(rec); return true; },
    removeSelected(){ return deleteSelected(); },   // Delete-key path, scriptable for tests
    save(){ return ctx.serialize(); },
    load(json){ return ctx.loadScene(json); },
    testScene(){ return ctx.testScene(); },        // the seeded lean-to as plain JSON
    loadTest(){ return ctx.loadTestScene(); },      // load the seeded lean-to (reproducible)
    metrics(){ return ctx.metrics.snapshot(); },    // read the local session evidence
    rate(v){ return ctx.metrics.rate(v); },         // record a 👍/👎 feel rating ('up'|'down')
    stress(count = 300){                            // deterministic loose-stick perf scene
      ctx.setBuildMode(true); selectRec(null); ctx.sweep();
      const total = Math.min(ctx.MAX_STICKS, Math.max(1, count|0));
      for (let i=0;i<total;i++){
        const x=-.52+(i%20)*.055, z=-.34+(Math.floor(i/20)%15)*.048, y=.002+(i%3)*.003;
        ctx.spawnStick(x,y,z,(i%2)*Math.PI/2,{});
      }
      return window.__leanto.api.stats();
    },
    async measure(frames = 180){                    // p50/p95/p99, not a flattering average alone
      frames = Math.min(1200,Math.max(30,frames|0));
      const f0=window.__leanto.frames,p0=window.__leanto.physSteps;
      const d0=window.__leanto.droppedBacklogs||0,t0=performance.now(),samples=[];
      let prev=t0;
      for(let i=0;i<frames;i++){
        await new Promise(requestAnimationFrame); const now=performance.now();
        samples.push(now-prev); prev=now;
      }
      const dt=(performance.now()-t0)/1000; samples.sort((a,b)=>a-b);
      const at = p => samples[Math.min(samples.length-1,Math.floor(samples.length*p))];
      return { frames, fps:+((window.__leanto.frames-f0)/dt).toFixed(2),
        physicsHz:+((window.__leanto.physSteps-p0)/dt).toFixed(2),
        p50:+at(.5).toFixed(2),p95:+at(.95).toFixed(2),p99:+at(.99).toFixed(2),
        droppedBacklogs:(window.__leanto.droppedBacklogs||0)-d0,
        drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
        sticks:sticks.length,bonds:ctx.joints.length,world:ctx.buildMode?'build':'run' };
    },
    stats(){
      let ridge = 0;
      for (const s of sticks) ridge = Math.max(ridge, s.currPos.y);
      return { sticks: sticks.length, bonds: ctx.joints.length, buildMode: ctx.buildMode,
               maxDrift: window.__leanto.maxDrift || 0, ridgeY: ridge,
               frames: window.__leanto.frames, physSteps: window.__leanto.physSteps };
    },
  };

  // Concise, automation-friendly view of the same state a player sees.
  window.render_game_to_text = () => JSON.stringify({
    coordinateSystem:'metres; +x right across table, +y up, +z toward initial camera',
    world:ctx.buildMode ? 'build' : 'run',
    tool:ctx.interaction.state.tool,
    gesture:ctx.interaction.state.gesture,
    selectedId:selectedRec ? selectedRec.id : null,
    sticks:sticks.slice(0,30).map(s => {
      const screen = s.currPos.clone().project(camera);
      return { id:s.id,
        pos:[+s.currPos.x.toFixed(3),+s.currPos.y.toFixed(3),+s.currPos.z.toFixed(3)],
        quat:[+s.currQuat.x.toFixed(3),+s.currQuat.y.toFixed(3),+s.currQuat.z.toFixed(3),+s.currQuat.w.toFixed(3)],
        screen:[Math.round((screen.x*.5+.5)*innerWidth),Math.round((-screen.y*.5+.5)*innerHeight)],
        selected:s === selectedRec };
    }),
    stickCount:sticks.length,
    bonds:ctx.joints.length,
    metrics:ctx.metrics.snapshot(),
    handles:selectedRec ? Object.fromEntries([
      ['endNeg',ctx.handles.endNeg],['endPos',ctx.handles.endPos],
      ['lift',ctx.handles.lift],['roll',ctx.handles.roll],
    ].map(([name,obj]) => {
      const p = obj.position.clone().project(camera);
      return [name,[Math.round((p.x*.5+.5)*innerWidth),Math.round((-p.y*.5+.5)*innerHeight)]];
    })) : null,
    camera:{ pos:camera.position.toArray().map(v=>+v.toFixed(3)),
      target:controls.target.toArray().map(v=>+v.toFixed(3)) },
  });
  if (typeof window.advanceTime !== 'function')
    window.advanceTime = ms => new Promise(resolve => setTimeout(resolve, Math.max(0,ms)));

  // showcase: if the bundled cottage ships alongside, offer it in Help
  fetch('./assets/cottage.json').then(r => r.ok ? r.json() : null).then(cottage => {
    if (!cottage) return;
    cottageScene = cottage;
    const el = document.getElementById('load-cottage');
    if (!el) return;
    el.hidden = false;
  }).catch(() => {});

  loadingEl.style.display = 'none';
  workbenchEl.hidden = false;
  window.__leanto.ready = true;
  ctx.metrics.onReady();                     // start the session clock (time-to-first-grab origin)

  // seeded test scene via URL param: ?scene=leanto (or ?scene=test) loads the fixed
  // three-stick lean-to so a before/after feel comparison starts from the same table.
  try {
    const want = new URLSearchParams(location.search).get('scene');
    if (want === 'leanto' || want === 'test') ctx.loadTestScene();
  } catch (err) { console.warn('leanto: test scene param failed —', err); }

  requestAnimationFrame(loop);

  // lightweight on-screen status
  setInterval(() => {
    const mode = ctx.buildMode ? 'BUILD · frozen' : 'live';
    const glue = ctx.glueMode ? (ctx.glueArmed() ? ' · GLUE: pick 2nd stick or a bead' : ' · GLUE: pick a stick or a bead') : '';
    const snip = ctx.snipMode ? ' · SNIP: click a stick to cut' : '';
    const sweepHint = performance.now() < sweepArmedUntil ? ' · BACKSPACE AGAIN TO SWEEP' : '';
    workbench.setStatus(`${sticks.length} sticks · ${ctx.joints.length} glued · ${ctx.held ? 'holding' : mode}${glue}${snip}${sweepHint}`);
  }, 200);
}
