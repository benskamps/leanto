// handles.js — direct, screen-sized affordances for a selected stick.
// Amber ends aim/tilt, the arrow lifts, and the ring rolls. Sprites do not
// attenuate with distance, so a real-scale 2mm stick remains operable at any zoom.

import * as THREE from 'three';

function discTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.translate(64, 64);
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'end') {
    g.beginPath(); g.arc(0, 0, 27, 0, Math.PI*2);
    g.fillStyle = '#f1bd66'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#4a3320'; g.stroke();
    g.beginPath(); g.arc(-7, -8, 5, 0, Math.PI*2); g.fillStyle = 'rgba(255,255,255,.65)'; g.fill();
  } else if (kind === 'lift') {
    g.beginPath(); g.moveTo(0,-38); g.lineTo(24,-12); g.lineTo(9,-12); g.lineTo(9,28);
    g.lineTo(-9,28); g.lineTo(-9,-12); g.lineTo(-24,-12); g.closePath();
    g.fillStyle = '#f4e4c8'; g.fill(); g.lineWidth = 7; g.strokeStyle = '#4a3320'; g.stroke();
  } else {
    g.beginPath(); g.arc(0, 0, 28, -Math.PI*.2, Math.PI*1.45);
    g.lineWidth = 10; g.strokeStyle = '#f4e4c8'; g.stroke();
    g.beginPath(); g.moveTo(-23,-26); g.lineTo(-39,-18); g.lineTo(-28,-7); g.closePath();
    g.fillStyle = '#f4e4c8'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#4a3320'; g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createHandles(ctx) {
  const root = new THREE.Group();
  root.visible = false; root.renderOrder = 20; ctx.scene.add(root);
  const make = (kind, scale) => {
    const mat = new THREE.SpriteMaterial({ map:discTexture(kind), transparent:true,
      depthTest:false, depthWrite:false, sizeAttenuation:false });
    const s = new THREE.Sprite(mat); s.scale.setScalar(scale); s.userData.handle = kind;
    s.renderOrder = 22; root.add(s); return s;
  };
  const endNeg = make('end', 0.052), endPos = make('end', 0.052);
  endNeg.userData.sign = -1; endPos.userData.sign = 1;
  const lift = make('lift', 0.063), roll = make('roll', 0.052);

  const stemGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const stem = new THREE.Line(stemGeo, new THREE.LineBasicMaterial({ color:0xf4e4c8,
    transparent:true, opacity:.9, depthTest:false }));
  stem.renderOrder = 21; root.add(stem);
  const stemPos = stemGeo.attributes.position;
  const _axis = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(0,1,0);
  const _centre = new THREE.Vector3(), _quat = new THREE.Quaternion();

  function show(on){ root.visible = !!on; }
  function update(rec, pos, quat, camera){
    if (!rec){ show(false); return; }
    show(true); _centre.copy(pos); _quat.copy(quat);
    _axis.set(1,0,0).applyQuaternion(_quat);
    endNeg.position.copy(_centre).addScaledVector(_axis, -rec.len/2);
    endPos.position.copy(_centre).addScaledVector(_axis,  rec.len/2);
    const liftGap = Math.max(.035, rec.len*.34);
    lift.position.copy(_centre).addScaledVector(_up, liftGap);
    _right.set(1,0,0).applyQuaternion(camera.quaternion);
    roll.position.copy(_centre).addScaledVector(_right, Math.max(.032, rec.len*.34))
      .addScaledVector(_up, .012);
    stemPos.setXYZ(0, _centre.x, _centre.y, _centre.z);
    stemPos.setXYZ(1, lift.position.x, lift.position.y, lift.position.z);
    stemPos.needsUpdate = true; stemGeo.computeBoundingSphere();
  }
  function pick(raycaster){
    if (!root.visible) return null;
    const hit = raycaster.intersectObjects([endNeg,endPos,lift,roll], false)[0];
    if (!hit) return null;
    return { kind:hit.object.userData.handle, sign:hit.object.userData.sign || 0 };
  }

  ctx.handles = { root, endNeg, endPos, lift, roll, show, update, pick };
  return ctx.handles;
}
