// glue.js — the glue fantasy, matured.
//
// WET GLUE (BUILD): a bond between two touching sticks. Physically a Rapier fixed joint
// that preserves the current relative pose (nothing snaps when you bond). Bonds form an
// assembly graph: grabbing any member moves the whole assembly; clicking a glue bead
// removes that bond.
//
// DRY GLUE (RUN): on BUILD→RUN every multi-stick assembly CURES into ONE compound rigid
// body (per-member cuboid colliders at their relative poses). One body = no joint solver
// work = a 200-stick house doesn't jitter apart. On RUN→BUILD the compound UNCURES back
// to per-stick Fixed bodies and the wet joints are recreated from the bond edge list —
// the edge list, not the joint objects, is the source of truth, so B-toggles don't drift.

import * as THREE from 'three';

export function createGlue(ctx) {
  const { RAPIER } = ctx;

  let glueFirst = null;                        // first stick picked for the in-progress bond
  const joints = [];                           // bond edge list: { a, b, bead, joint|null }
  const bondKeys = new Set();                  // "minId:maxId" — duplicate-bond guard
  const compounds = [];                        // live dry-glue bodies: { body, members:[{rec,relPos,relQuat}] }
  const beadMeshes = [];                       // pickable beads (click to unglue)
  const GLUE_HL = 0x0d2e12;                    // emissive tint marking a glue-selected stick
  const GLUE_GAP = 0.003;                      // max daylight between sticks that can still bond
  const beadGeo = new THREE.SphereGeometry(0.0028, 12, 10);
  const beadMat = new THREE.MeshStandardMaterial({
    color:'#caa14a', roughness:0.22, metalness:0, transparent:true, opacity:0.92,
    emissive:0x3a2a00, emissiveIntensity:0.4
  });
  const BEAD_SQUASH = 0.68;                  // a dab of glue, not a marble

  const key = (a, b) => `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;

  // ---------- assembly graph ----------
  function assemblyOf(rec){                    // connected component over the bond edge list
    const adj = new Map();
    for (const j of joints){
      if (!adj.has(j.a.id)) adj.set(j.a.id, []);
      if (!adj.has(j.b.id)) adj.set(j.b.id, []);
      adj.get(j.a.id).push(j.b); adj.get(j.b.id).push(j.a);
    }
    const seen = new Set([rec.id]), out = [rec], queue = [rec];
    while (queue.length){
      const cur = queue.pop();
      for (const nb of (adj.get(cur.id) || [])){
        if (!seen.has(nb.id)){ seen.add(nb.id); out.push(nb); queue.push(nb); }
      }
    }
    return out;
  }
  function allAssemblies(){                    // every component with 2+ members
    const seen = new Set(), out = [];
    for (const j of joints){
      if (seen.has(j.a.id)) continue;
      const group = assemblyOf(j.a);
      for (const m of group) seen.add(m.id);
      if (group.length > 1) out.push(group);
    }
    return out;
  }

  // ---------- contact validation: segment–segment closest distance ----------
  // Sticks are long thin boxes; their centre segments are within (T+W)/2 of any touching
  // pair. Deterministic, cheap, no physics query. (Ericson, Real-Time Collision Detection 5.1.9)
  const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _r = new THREE.Vector3();
  const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
  function segSegDist(p1, q1, p2, q2){
    _d1.subVectors(q1, p1); _d2.subVectors(q2, p2); _r.subVectors(p1, p2);
    const a = _d1.dot(_d1), e = _d2.dot(_d2), f = _d2.dot(_r);
    let s, t;
    if (a <= 1e-12 && e <= 1e-12){ s = t = 0; }
    else if (a <= 1e-12){ s = 0; t = Math.min(1, Math.max(0, f/e)); }
    else {
      const c = _d1.dot(_r);
      if (e <= 1e-12){ t = 0; s = Math.min(1, Math.max(0, -c/a)); }
      else {
        const b = _d1.dot(_d2), denom = a*e - b*b;
        s = denom > 1e-12 ? Math.min(1, Math.max(0, (b*f - c*e)/denom)) : 0;
        t = (b*s + f)/e;
        if (t < 0){ t = 0; s = Math.min(1, Math.max(0, -c/a)); }
        else if (t > 1){ t = 1; s = Math.min(1, Math.max(0, (b - c)/a)); }
      }
    }
    _c1.copy(p1).addScaledVector(_d1, s);
    _c2.copy(p2).addScaledVector(_d2, t);
    return _c1.distanceTo(_c2);
  }
  const _ux = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion();
  function centerSegment(rec, pOut, qOut){
    const t = worldPose(rec);
    _ux.set(1, 0, 0).applyQuaternion(t.q).multiplyScalar(rec.halfExtents.x);
    pOut.copy(t.p).sub(_ux); qOut.copy(t.p).add(_ux);
  }
  const _wp = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  function worldPose(rec){                     // works for plain and cured sticks
    if (rec.cured){
      const bt = rec.cured.body.translation(), br = rec.cured.body.rotation();
      _q.set(br.x, br.y, br.z, br.w);
      _wp.p.copy(rec.cured.relPos).applyQuaternion(_q).add(_p.set(bt.x, bt.y, bt.z));
      _wp.q.copy(_q).multiply(rec.cured.relQuat);
    } else {
      const t = rec.body.translation(), r = rec.body.rotation();
      _wp.p.set(t.x, t.y, t.z); _wp.q.set(r.x, r.y, r.z, r.w);
    }
    return _wp;
  }
  const _sa1 = new THREE.Vector3(), _sa2 = new THREE.Vector3();
  const _sb1 = new THREE.Vector3(), _sb2 = new THREE.Vector3();
  function inContact(a, b){
    centerSegment(a, _sa1, _sa2);
    const pa1 = _sa1.clone(), pa2 = _sa2.clone();
    centerSegment(b, _sb1, _sb2);
    const limit = (a.halfExtents.y + b.halfExtents.y) + (a.halfExtents.z + b.halfExtents.z) + GLUE_GAP;
    return segSegDist(pa1, pa2, _sb1, _sb2) < limit;
  }
  function contactPoint(a, b){               // where the dab of glue actually goes
    centerSegment(a, _sa1, _sa2);
    const pa1 = _sa1.clone(), pa2 = _sa2.clone();
    centerSegment(b, _sb1, _sb2);
    segSegDist(pa1, pa2, _sb1, _sb2);        // fills _c1 (on a) and _c2 (on b)
    return _c1.clone().add(_c2).multiplyScalar(0.5);
  }

  // ---------- picking ----------
  function setGlueMode(on){
    ctx.glueMode = on;
    if (!on) clearGlueSel();
    window.__leanto.glueMode = on;
  }
  function clearGlueSel(){
    if (glueFirst && glueFirst !== ctx.held) glueFirst.mesh.material.emissive.setHex(0x000000);
    glueFirst = null;
  }
  function reject(rec){                        // red flash + deny thunk
    ctx.deny();
    const m = rec.mesh.material;
    m.emissive.setHex(0x5a1010);
    setTimeout(() => { if (rec !== glueFirst && rec !== ctx.held) m.emissive.setHex(0x000000); }, 220);
  }
  function gluePick(rec, hitPoint){
    if (rec.cured) { reject(rec); return; }           // dry assemblies re-bond after RUN→BUILD
    if (!glueFirst){                                  // 1st pick: arm the bond, highlight it
      glueFirst = rec;
      rec.mesh.material.emissive.setHex(GLUE_HL);
      return;
    }
    if (rec === glueFirst){ clearGlueSel(); return; } // re-click the same stick: cancel
    if (bondKeys.has(key(glueFirst, rec)) || !inContact(glueFirst, rec)){ reject(rec); return; }
    const entry = bondSticks(glueFirst, rec, hitPoint);  // 2nd pick: weld the two
    if (entry && ctx.pushUndo) ctx.pushUndo(() => removeBond(entry));
    glueFirst.mesh.material.emissive.setHex(0x000000);
    glueFirst = null;
  }

  // ---------- wet joints ----------
  // A fixed joint forces the two anchor frames to coincide in world space; to avoid any
  // snap we make that already-true at creation: anchorA = b's centre in a's local frame,
  // frameA = b's rotation relative to a, and b's anchor/frame are identity (b's own origin).
  const _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qaInv = new THREE.Quaternion();
  function createFixedJoint(a, b){
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
    return ctx.world.createImpulseJoint(params, a.body, b.body, true);
  }

  function bondSticks(a, b, bondPt){
    if (bondKeys.has(key(a, b))) return null;
    const joint = createFixedJoint(a, b);
    // an amber glue bead at the bond point — default to where the sticks actually touch
    const bead = new THREE.Mesh(beadGeo, beadMat.clone());
    a.mesh.updateMatrixWorld();
    bead.position.copy(a.mesh.worldToLocal(bondPt ? bondPt.clone() : contactPoint(a, b)));
    a.mesh.add(bead);
    const entry = { a, b, bead, joint };
    bead.userData.bond = entry;
    joints.push(entry); beadMeshes.push(bead); bondKeys.add(key(a, b));
    window.__leanto.joints = joints.length;
    // squish on, with a little elastic pop-in
    ctx.squish();
    if (ctx.addTween) ctx.addTween(0.22, k => {
      const s = k < 0.75 ? 0.2 + (k/0.75) * 0.95 : 1.15 - ((k-0.75)/0.25) * 0.15;
      bead.scale.set(s, s * BEAD_SQUASH, s);
    });
    else bead.scale.set(1, BEAD_SQUASH, 1);
    return entry;
  }

  function removeBond(entry){
    const i = joints.indexOf(entry);
    if (i < 0) return;
    if (entry.joint){ try { ctx.world.removeImpulseJoint(entry.joint, false); } catch (_) {} }
    const bead = entry.bead;
    beadMeshes.splice(beadMeshes.indexOf(bead), 1);
    joints.splice(i, 1);
    bondKeys.delete(key(entry.a, entry.b));
    window.__leanto.joints = joints.length;
    ctx.pop();
    if (ctx.addTween) ctx.addTween(0.15, k => {       // the bead pops away
      const s = (1 - k) * (1 + 0.6 * Math.sin(k * Math.PI));
      bead.scale.set(s, s * BEAD_SQUASH, s);
      if (k >= 1) bead.removeFromParent();
    });
    else bead.removeFromParent();
  }

  function dropBondsOf(rec){                 // snip dissolves the original stick's bonds (v1 rule)
    for (const j of joints.slice()) if (j.a === rec || j.b === rec) removeBond(j);
  }

  function clearAllBonds(){
    for (const j of joints) {
      if (j.joint){ try { ctx.world.removeImpulseJoint(j.joint, false); } catch (_) {} }
      j.bead.removeFromParent();
    }
    joints.length = 0; beadMeshes.length = 0; bondKeys.clear(); glueFirst = null;
    window.__leanto.joints = 0;
  }

  // ---------- dry glue: cure / uncure ----------
  const _rq = new THREE.Quaternion(), _rqInv = new THREE.Quaternion(), _rp = new THREE.Vector3();
  function cureAll(){
    for (const group of allAssemblies()){
      const root = group[0];
      const rt = root.body.translation(), rr = root.body.rotation();
      _rq.set(rr.x, rr.y, rr.z, rr.w); _rqInv.copy(_rq).invert(); _rp.set(rt.x, rt.y, rt.z);
      const body = ctx.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(rt.x, rt.y, rt.z).setRotation(rr)
          .setLinearDamping(0.6).setAngularDamping(0.9).setCcdEnabled(true)
      );
      body.setGravityScale(0.25, true);       // ramps in with everything else
      const members = [];
      for (const m of group){
        const mt = m.body.translation(), mr = m.body.rotation();
        const relPos = new THREE.Vector3(mt.x, mt.y, mt.z).sub(_rp).applyQuaternion(_rqInv);
        const relQuat = _rqInv.clone().multiply(new THREE.Quaternion(mr.x, mr.y, mr.z, mr.w));
        ctx.world.createCollider(
          RAPIER.ColliderDesc.cuboid(m.halfExtents.x, m.halfExtents.y, m.halfExtents.z)
            .setTranslation(relPos.x, relPos.y, relPos.z)
            .setRotation({ x:relQuat.x, y:relQuat.y, z:relQuat.z, w:relQuat.w })
            .setFriction(0.95).setRestitution(0.03).setDensity(420)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
          body
        );
        members.push({ rec: m, relPos, relQuat });
      }
      for (const j of joints){               // drop the wet joints; the edge list stays canonical
        if (j.joint && group.includes(j.a) && group.includes(j.b)){
          try { ctx.world.removeImpulseJoint(j.joint, false); } catch (_) {}
          j.joint = null;
        }
      }
      for (const m of group){ ctx.recByBody.delete(m.body.handle); ctx.world.removeRigidBody(m.body); m.body = null; }
      for (const mm of members) mm.rec.cured = { body, relPos: mm.relPos, relQuat: mm.relQuat };
      compounds.push({ body, members });
    }
  }

  function uncureAll(){
    for (const c of compounds){
      const rt = c.body.translation(), rr = c.body.rotation();
      _rq.set(rr.x, rr.y, rr.z, rr.w); _rp.set(rt.x, rt.y, rt.z);
      for (const mm of c.members){
        const wp = mm.relPos.clone().applyQuaternion(_rq).add(_rp);
        const wq = _rq.clone().multiply(mm.relQuat);
        const rec = mm.rec;
        rec.body = ctx.makeStickBody(rec.halfExtents, wp, wq, { fixed: true });
        ctx.recByBody.set(rec.body.handle, rec);
        rec.cured = null;
        rec.currPos.copy(wp); rec.prevPos.copy(wp);
        rec.currQuat.copy(wq); rec.prevQuat.copy(wq);
        rec.mesh.position.copy(wp); rec.mesh.quaternion.copy(wq);
      }
      ctx.world.removeRigidBody(c.body);
    }
    compounds.length = 0;
    for (const j of joints) if (!j.joint) j.joint = createFixedJoint(j.a, j.b);   // wet again, at settled poses
  }

  function dropCompounds(){                  // sweep support: remove dry bodies outright
    for (const c of compounds){
      for (const mm of c.members) mm.rec.cured = null;
      ctx.world.removeRigidBody(c.body);
    }
    compounds.length = 0;
  }

  ctx.glueMode = false;
  ctx.glueArmed = () => !!glueFirst;
  ctx.joints = joints;
  ctx.compounds = compounds;
  ctx.beadMeshes = beadMeshes;
  ctx.assemblyOf = assemblyOf;
  ctx.setGlueMode = setGlueMode;
  ctx.clearGlueSel = clearGlueSel;
  ctx.gluePick = gluePick;
  ctx.bondSticks = bondSticks;
  ctx.removeBond = removeBond;
  ctx.dropBondsOf = dropBondsOf;
  ctx.clearAllBonds = clearAllBonds;
  ctx.cureAll = cureAll;
  ctx.uncureAll = uncureAll;
  ctx.dropCompounds = dropCompounds;
  ctx.inContact = inContact;
}
