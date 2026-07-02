// glue.js — bond two sticks with a Rapier fixed joint (wet glue).
// BUILD a structure, press G for GLUE, click two sticks — they weld; in RUN they hold
// together as a rigid assembly instead of sliding apart. This is "wet glue": a fixed
// joint that preserves the current relative pose (so nothing snaps when you bond).
// "Dry glue" — merging the assembly into one compound rigid body — is the phase-2-next step.

import * as THREE from 'three';

export function createGlue(ctx) {
  const { RAPIER } = ctx;

  let glueFirst = null;                        // first stick picked for the in-progress bond
  const joints = [];                           // { joint, a, b, bead }
  const GLUE_HL = 0x0d2e12;                    // emissive tint marking a glue-selected stick
  const beadGeo = new THREE.SphereGeometry(0.0038, 12, 10);
  const beadMat = new THREE.MeshStandardMaterial({
    color:'#caa14a', roughness:0.35, metalness:0, transparent:true, opacity:0.9,
    emissive:0x3a2a00, emissiveIntensity:0.4
  });

  function setGlueMode(on){
    ctx.glueMode = on;
    if (!on) clearGlueSel();
    window.__leanto.glueMode = on;
  }
  function clearGlueSel(){
    if (glueFirst && glueFirst !== ctx.held) glueFirst.mesh.material.emissive.setHex(0x000000);
    glueFirst = null;
  }
  function gluePick(rec, hitPoint){
    if (!glueFirst){                                  // 1st pick: arm the bond, highlight it
      glueFirst = rec;
      rec.mesh.material.emissive.setHex(GLUE_HL);
      return;
    }
    if (rec === glueFirst){ clearGlueSel(); return; } // re-click the same stick: cancel
    bondSticks(glueFirst, rec, hitPoint);             // 2nd pick: weld the two
    glueFirst.mesh.material.emissive.setHex(0x000000);
    glueFirst = null;
  }

  // Weld stick b onto stick a, preserving their CURRENT relative pose, via a fixed joint.
  // A fixed joint forces the two anchor frames to coincide in world space; to avoid any
  // snap we make that already-true at creation: anchorA = b's centre in a's local frame,
  // frameA = b's rotation relative to a, and b's anchor/frame are identity (b's own origin).
  const _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qaInv = new THREE.Quaternion();
  function bondSticks(a, b, bondPt){
    const ta = a.body.translation(), ra = a.body.rotation();
    const tb = b.body.translation(), rb = b.body.rotation();
    _pa.set(ta.x, ta.y, ta.z); _qa.set(ra.x, ra.y, ra.z, ra.w);
    _pb.set(tb.x, tb.y, tb.z); _qb.set(rb.x, rb.y, rb.z, rb.w);
    _qaInv.copy(_qa).invert();
    const anchorA = _pb.clone().sub(_pa).applyQuaternion(_qaInv);   // b's centre, in a's local frame
    const frameA  = _qaInv.clone().multiply(_qb);                   // b's rotation, relative to a
    const params = RAPIER.JointData.fixed(
      { x:anchorA.x, y:anchorA.y, z:anchorA.z },
      { x:frameA.x,  y:frameA.y,  z:frameA.z, w:frameA.w },
      { x:0, y:0, z:0 },
      { x:0, y:0, z:0, w:1 }
    );
    const joint = ctx.world.createImpulseJoint(params, a.body, b.body, true);
    // an amber glue bead at the bond point, parented to a's mesh so it rides the assembly
    const bead = new THREE.Mesh(beadGeo, beadMat);
    a.mesh.updateMatrixWorld();
    bead.position.copy(a.mesh.worldToLocal((bondPt ? bondPt.clone() : _pb.clone())));
    a.mesh.add(bead);
    joints.push({ joint, a, b, bead });
    window.__leanto.joints = joints.length;
    ctx.clack();
  }

  function clearAllBonds(){
    for (const j of joints) { try { ctx.world.removeImpulseJoint(j.joint, false); } catch (_) {} }
    joints.length = 0; glueFirst = null;
    window.__leanto.joints = 0;
  }

  ctx.glueMode = false;
  ctx.glueArmed = () => !!glueFirst;
  ctx.joints = joints;
  ctx.setGlueMode = setGlueMode;
  ctx.clearGlueSel = clearGlueSel;
  ctx.gluePick = gluePick;
  ctx.bondSticks = bondSticks;
  ctx.clearAllBonds = clearAllBonds;
}
