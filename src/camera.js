// camera.js — the builder camera rig on top of OrbitControls.
// AAA-builder conventions (Besiege / Poly Bridge / The Sims): number keys jump to
// canned views, F frames whatever you've built, and every move is a short eased
// glide the player can interrupt just by touching the camera again.

export function createCamera(ctx) {
  const { THREE, camera, controls } = ctx;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  ctx.reducedMotion = reducedMotion;

  controls.zoomToCursor = true;             // zoom dives toward the cursor, not the orbit centre

  // pan stays over the table — a camera lost in the void is how a first visit ends
  const PAN = { x: ctx.TABLE.TW * 0.75, z: ctx.TABLE.TD * 0.75, yMax: 0.5 };

  // canned viewing directions; distance is fit to the build, so "front" of a
  // three-stick lean-to and "front" of the cottage both fill the frame
  const VIEWS = {
    hero:  new THREE.Vector3(0.62, 0.55, 1.00).normalize(),   // the ¾ establishing shot
    front: new THREE.Vector3(0.00, 0.28, 1.00).normalize(),
    side:  new THREE.Vector3(1.00, 0.28, 0.00).normalize(),
    top:   new THREE.Vector3(0.02, 1.00, 0.16).normalize(),   // slight tilt keeps the orbit stable
  };

  const _box = new THREE.Box3(), _c = new THREE.Vector3(), _size = new THREE.Vector3();
  function buildBounds(){                   // centre + radius of the build (the table's heart when empty)
    if (!ctx.sticks.length){ _c.set(0, 0.05, 0); return { c: _c, r: 0.28 }; }
    _box.makeEmpty();
    for (const s of ctx.sticks) _box.expandByPoint(s.currPos);
    _box.getCenter(_c); _box.getSize(_size);
    _c.y = Math.max(0.04, _c.y);
    return { c: _c, r: Math.max(0.16, _size.length()/2 + 0.12) };
  }
  const fitDist = (r) => Math.min(controls.maxDistance, Math.max(controls.minDistance + 0.05,
    r / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.15));

  let tween = null;                          // { t, dur, p0, p1, t0, t1 }
  const _p = new THREE.Vector3();
  function glideTo(pos, target, dur = 0.65){
    if (reducedMotion){
      camera.position.copy(pos); controls.target.copy(target); controls.update(); tween = null; return;
    }
    tween = { t: 0, dur,
      p0: camera.position.clone(), p1: pos.clone(),
      t0: controls.target.clone(), t1: target.clone() };
  }
  function goto(name){
    const { c, r } = buildBounds();
    glideTo(_p.copy(VIEWS[name]).multiplyScalar(fitDist(r)).add(c), c);
  }
  function frame(){                          // F: keep the current viewing angle, recentre + refit
    const { c, r } = buildBounds();
    _p.copy(camera.position).sub(controls.target).normalize().multiplyScalar(fitDist(r)).add(c);
    glideTo(_p, c, 0.5);
  }

  // touching the camera cancels the glide — the player always wins the argument
  const cancelGlide = () => { tween = null; };
  ctx.renderer.domElement.addEventListener('pointerdown', cancelGlide);
  ctx.renderer.domElement.addEventListener('wheel', cancelGlide, { passive: true });

  function update(dt){
    if (tween){
      tween.t += dt;
      const k = Math.min(1, tween.t / tween.dur);
      const e = k * k * (3 - 2 * k);         // smoothstep — soft leave, soft arrive
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.t0, tween.t1, e);
      if (k >= 1) tween = null;
    }
    const t = controls.target;               // clamp pan to the tabletop
    t.x = Math.min(PAN.x, Math.max(-PAN.x, t.x));
    t.z = Math.min(PAN.z, Math.max(-PAN.z, t.z));
    t.y = Math.min(PAN.yMax, Math.max(0, t.y));
  }

  ctx.camGoto = goto;
  ctx.camFrame = frame;
  ctx.camUpdate = update;
}
