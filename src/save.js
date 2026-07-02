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

  ctx.serialize = serialize;
  ctx.loadScene = loadScene;
  ctx.downloadScene = download;
  ctx.openScenePicker = openPicker;
}
