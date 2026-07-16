// tools.js — fabrication & builder ergonomics.
// SNIP (S): hover a stick and a cut line tracks the cursor; click to snip it in two.
// STAMP (D): duplicate the last-placed stick under the cursor with handmade jitter;
//   hold D and sweep the cursor to lay a whole course of planks (spacing from hand speed).
// UNDO / REDO (Ctrl+Z / Ctrl+Y): snapshot command stack, BUILD-only, flushed on the RUN reveal.

import * as THREE from 'three';

export function createTools(ctx) {
  const KERF = 0.0004;                       // the scissors eat 0.4mm
  const MIN_PIECE = 0.012;                   // pieces shorter than 12mm tear, not cut

  // cut-line indicator: a thin dark blade across the stick, shown while hovering
  const markGeo = new THREE.BoxGeometry(0.0007, 0.0035, 1);   // z scaled to the stick's width
  const markMat = new THREE.MeshBasicMaterial({ color: 0x7a2020, transparent: true, opacity: 0.9 });
  const mark = new THREE.Mesh(markGeo, markMat);
  mark.visible = false;
  ctx.scene.add(mark);

  let hoverRec = null, hoverLx = 0;

  function setSnipMode(on){
    ctx.snipMode = on;
    if (!on){ mark.visible = false; hoverRec = null; }
    window.__leanto.snipMode = on;
  }

  const _ux = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3();
  function snipHover(rec, point){            // called by main's pointermove raycast
    if (!rec || rec.cured || !ctx.buildMode){ mark.visible = false; hoverRec = null; return; }
    const t = rec.body.translation(), r = rec.body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    _ux.set(1, 0, 0).applyQuaternion(q);
    _p.set(point.x - t.x, point.y - t.y, point.z - t.z);
    const lx = _p.dot(_ux);                  // cut position in stick-local x
    const lenL = lx + rec.len/2, lenR = rec.len - lenL - KERF;
    const legal = lenL >= MIN_PIECE && lenR >= MIN_PIECE;
    hoverRec = legal ? rec : null; hoverLx = lx;
    mark.visible = true;
    markMat.color.setHex(legal ? 0x7a2020 : 0x3a3a3a);
    _up.set(0, 1, 0).applyQuaternion(q);
    mark.position.set(t.x, t.y, t.z).addScaledVector(_ux, lx).addScaledVector(_up, 0.0004);
    mark.quaternion.copy(q);
    mark.scale.set(1, 1, ctx.STICK.W * 1.7);
  }

  function snip(){                           // called by main's pointerdown in SNIP mode
    const rec = hoverRec;
    if (!rec) { ctx.deny(); return false; }
    const t = rec.body.translation(), r = rec.body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    _ux.set(1, 0, 0).applyQuaternion(q);
    const lenL = hoverLx + rec.len/2;
    const lenR = rec.len - lenL - KERF;
    const { len, ends, tint, rough } = rec;
    const snap = snapshotScene();            // pre-cut table, bonds and all
    ctx.removeStick(rec);                    // dissolves its bonds too (bead pops)
    const cL = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(_ux, -len/2 + lenL/2);
    const cR = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(_ux,  len/2 - lenR/2);
    ctx.spawnStick(cL.x, cL.y, cL.z, 0, { len: lenL, ends: [ends[0], 'square'], quat: q, tint, rough });
    ctx.spawnStick(cR.x, cR.y, cR.z, 0, { len: lenR, ends: ['square', ends[1]], quat: q, tint, rough });
    mark.visible = false; hoverRec = null;
    ctx.clack();
    pushUndoSnapshot(snap);                  // undo respawns the original and re-bonds partners
    return true;
  }

  // ---------- stamp: the course-laying tool ----------
  // No snapping, ever: every stamp gets fresh tint and a hair of positional + yaw jitter,
  // so a stamped wall reads handmade, not extruded.
  const _sq = new THREE.Quaternion(), _yawJ = new THREE.Quaternion();
  const _lastStamp = new THREE.Vector3();
  let runArmed = false;                      // true while D is held (plank-run gesture)

  function stampAt(point){
    const tpl = ctx.lastPlaced;
    if (!ctx.buildMode || !tpl || !ctx.sticks.includes(tpl)) { ctx.deny(); return null; }
    _yawJ.setFromAxisAngle(_up.set(0, 1, 0), (Math.random()-0.5) * (Math.PI/60));   // ±1.5°
    _sq.copy(tpl.currQuat).premultiply(_yawJ);
    const x = point.x + (Math.random()-0.5)*0.003;                                   // ±1.5mm
    const z = point.z + (Math.random()-0.5)*0.003;
    const snap = snapshotScene();
    const rec = ctx.spawnStick(x, 0, z, 0,
      { rest: true, len: tpl.len, ends: tpl.ends.slice(), quat: _sq });
    if (rec){
      ctx.lastPlaced = rec;
      _lastStamp.set(x, 0, z);
      pushUndoSnapshot(snap);
      ctx.clack();
    }
    return rec;
  }
  function stampRun(point){                  // hold D + sweep: stamp when the hand has travelled a stick-width
    if (!runArmed) return;
    const d = Math.hypot(point.x - _lastStamp.x, point.z - _lastStamp.z);
    if (d > ctx.STICK.W * 1.1) stampAt(point);
  }

  // ---------- undo / redo ----------
  // History entries are camera-less scene snapshots captured BEFORE each mutation
  // (see the ctx.snapshotScene call sites). Undo swaps the live table for the snapshot
  // on top of the stack, parking the pre-undo table on the redo stack; redo swaps back.
  // Restoring through the same versioned save path a file-load uses means history
  // survives the identity churn of snip/glue/delete (bonds and all) by construction.
  const HISTORY_CAP = 100;
  const undoStack = [], redoStack = [];
  function snapshotScene(){
    const data = ctx.serialize();
    delete data.camera;                      // history must never yank the camera
    return data;
  }
  function pushUndoSnapshot(snap){
    if (!snap) return;
    undoStack.push(snap);
    if (undoStack.length > HISTORY_CAP) undoStack.shift();
    redoStack.length = 0;                    // a fresh action forks history — the redo line dies
  }
  function restore(snap, parkOn){
    parkOn.push(snapshotScene());
    if (parkOn.length > HISTORY_CAP) parkOn.shift();
    ctx.loadScene(snap, { history: true });
  }
  function undo(){
    if (!ctx.buildMode || ctx.held || !undoStack.length) { ctx.deny(); return; }
    restore(undoStack.pop(), redoStack);
  }
  function redo(){
    if (!ctx.buildMode || ctx.held || !redoStack.length) { ctx.deny(); return; }
    restore(redoStack.pop(), undoStack);
  }
  function clearUndo(){ undoStack.length = 0; redoStack.length = 0; }
  function historyDepth(){ return { undo: undoStack.length, redo: redoStack.length }; }

  ctx.snipMode = false;
  ctx.lastPlaced = null;
  ctx.setSnipMode = setSnipMode;
  ctx.snipHover = snipHover;
  ctx.snip = snip;
  ctx.stampAt = stampAt;
  ctx.stampRun = stampRun;
  ctx.setStampRun = (on) => { runArmed = on; };
  ctx.snapshotScene = snapshotScene;
  ctx.pushUndoSnapshot = pushUndoSnapshot;
  ctx.undo = undo;
  ctx.redo = redo;
  ctx.clearUndo = clearUndo;
  ctx.historyDepth = historyDepth;
}
