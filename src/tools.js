// tools.js — fabrication. Phase 3: the snip tool (scissors for sticks).
// Hover a stick in SNIP mode and a cut line tracks the cursor; click to snip the stick
// into two shorter sticks in place. Factory ends stay rounded; the cut faces are honest
// squares. Stamp + undo arrive in phase 4.

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
    ctx.removeStick(rec);                    // dissolves its bonds too (bead pops)
    const cL = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(_ux, -len/2 + lenL/2);
    const cR = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(_ux,  len/2 - lenR/2);
    ctx.spawnStick(cL.x, cL.y, cL.z, 0, { len: lenL, ends: [ends[0], 'square'], quat: q, tint, rough });
    ctx.spawnStick(cR.x, cR.y, cR.z, 0, { len: lenR, ends: ['square', ends[1]], quat: q, tint, rough });
    mark.visible = false; hoverRec = null;
    ctx.clack();
    return true;
  }

  ctx.snipMode = false;
  ctx.setSnipMode = setSnipMode;
  ctx.snipHover = snipHover;
  ctx.snip = snip;
}
