// save.js — versioned scene JSON, download/upload, and localStorage autosave.
// Appearance is stored explicitly (tint hex, roughness, ends) — no PRNG seed to
// stay compatible with; the loader spawns exact sticks and re-bonds through the
// pose-preserving joint math, so a loaded scene is physically identical.

import * as THREE from 'three';

export function createSave(ctx) {
  const VERSION = 1;
  const AUTOSAVE_KEY = 'leanto.autosave';

  function serialize(){
    const sticks = ctx.sticks.map(s => ({
      id: s.id,
      len: s.len,
      ends: s.ends,
      tint: '#' + s.tint.getHexString(),
      rough: s.rough,
      pos: [s.currPos.x, s.currPos.y, s.currPos.z],
      quat: [s.currQuat.x, s.currQuat.y, s.currQuat.z, s.currQuat.w],
    }));
    const bonds = ctx.joints.map(j => {
      const w = j.bead.getWorldPosition(new THREE.Vector3());
      return { a: j.a.id, b: j.b.id, bead: [w.x, w.y, w.z] };
    });
    return {
      version: VERSION,
      sticks, bonds,
      camera: {
        pos: ctx.camera.position.toArray(),
        target: ctx.controls.target.toArray(),
      },
    };
  }

  function loadScene(data){
    if (!data || data.version !== VERSION) throw new Error(`unknown scene version ${data && data.version}`);
    if (!ctx.buildMode) ctx.setBuildMode(true);
    if (ctx.clearUndo) ctx.clearUndo();
    ctx.sweep();
    const byId = new Map();
    for (const d of data.sticks){
      const rec = ctx.spawnStick(d.pos[0], d.pos[1], d.pos[2], 0, {
        len: d.len, ends: d.ends,
        quat: new THREE.Quaternion(d.quat[0], d.quat[1], d.quat[2], d.quat[3]),
        tint: new THREE.Color(d.tint), rough: d.rough,
      });
      if (rec) byId.set(d.id, rec);
    }
    for (const b of data.bonds){
      const a = byId.get(b.a), c = byId.get(b.b);
      if (a && c) ctx.bondSticks(a, c, new THREE.Vector3(b.bead[0], b.bead[1], b.bead[2]));
    }
    if (data.camera){
      ctx.camera.position.fromArray(data.camera.pos);
      ctx.controls.target.fromArray(data.camera.target);
      ctx.controls.update();
    }
    ctx.lastPlaced = null;
    return { sticks: ctx.sticks.length, bonds: ctx.joints.length };
  }

  function download(){
    const blob = new Blob([JSON.stringify(serialize())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leanto-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0]; fileInput.value = '';
    if (!f) return;
    try { loadScene(JSON.parse(await f.text())); }
    catch (err) { console.warn('leanto: could not load scene —', err); ctx.deny(); }
  });
  function openPicker(){ fileInput.click(); }

  // ---------- autosave: the table survives a closed tab ----------
  function autosave(){
    if (!ctx.buildMode || !ctx.sticks.length) return;
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serialize())); } catch (_) {}
  }
  setInterval(autosave, 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });

  // resume prompt (only when there's something worth resuming)
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null'); } catch (_) {}
  if (saved && saved.version === VERSION && saved.sticks.length > 6){
    const el = document.createElement('div');
    el.textContent = `resume last table? (${saved.sticks.length} sticks)`;
    el.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);' +
      'font:12.5px ui-serif,Georgia,serif;font-style:italic;color:#3a2e22;cursor:pointer;' +
      'background:rgba(58,46,34,.07);border:1px solid rgba(58,46,34,.18);border-radius:6px;' +
      'padding:4px 12px;z-index:10;';
    el.addEventListener('click', () => {
      try { loadScene(saved); } catch (_) { ctx.deny(); }
      el.remove();
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 20000);    // fades from relevance once you start building
  }

  // ---------- the seeded test scene: a deterministic three-stick lean-to ----------
  // A fixed, reproducible starting layout so a before/after feel change is measured
  // against the same structure every time (ROADMAP Sprint 0: "a named lean-to test
  // scene"). Built from pure geometry — no PRNG — and expressed in the very same
  // save format, so loading it is byte-identical run to run. Two rafters lean into a
  // ridge and a ridge pole sits in the crook; all three are glued into one assembly,
  // so pressing B drops a real lean-to into live physics.
  function testScene(){
    const L = ctx.STICK.L, T = ctx.STICK.T;
    const theta = 58 * Math.PI / 180;              // rafter pitch from horizontal
    const foot = L * Math.cos(theta);              // horizontal span, ridge -> foot
    const rise = L * Math.sin(theta);              // ridge height above the table
    const y0 = T / 2;                              // a flat stick's resting centre height
    const ridgeY = rise + y0;
    const qz = (a) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a)); return [q.x, q.y, q.z, q.w]; };
    const qy = (a) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)); return [q.x, q.y, q.z, q.w]; };
    const tint = '#c9a26a', rough = 0.72, ends = ['round', 'round'];
    const stick = (id, pos, quat) => ({ id, len: L, ends, tint, rough, pos, quat });
    return {
      version: VERSION,
      sticks: [
        stick(1, [-foot / 2, rise / 2 + y0, 0], qz(theta)),   // left rafter  (ridge is its +X end)
        stick(2, [ foot / 2, rise / 2 + y0, 0], qz(-theta)),  // right rafter (ridge is its -X end)
        stick(3, [0, ridgeY + T, 0], qy(Math.PI / 2)),        // ridge pole, running along Z in the crook
      ],
      bonds: [
        { a: 1, b: 2, bead: [0, ridgeY, 0] },                 // rafters meet at the ridge
        { a: 3, b: 1, bead: [0, ridgeY, 0] },                 // ridge pole tied to each rafter
        { a: 3, b: 2, bead: [0, ridgeY, 0] },
      ],
      camera: { pos: [0.22, 0.16, 0.30], target: [0, rise * 0.6, 0] },
    };
  }
  function loadTest(){ return loadScene(testScene()); }

  ctx.serialize = serialize;
  ctx.loadScene = loadScene;
  ctx.downloadScene = download;
  ctx.openScenePicker = openPicker;
  ctx.testScene = testScene;
  ctx.loadTestScene = loadTest;
}
