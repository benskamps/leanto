// ragdoll.js — a small articulated workshop mannequin.
//
// Ragdolls are deliberately separate from glue. Glue cures connected sticks into one
// rigid body in RUN; a ragdoll needs the opposite behavior: independent bodies joined
// by freely rotating ball-and-socket constraints. Each part is still selectable and
// grabbable in RUN through the same physical hand used for loose sticks.

import * as THREE from './vendor/three/three.module.min.js';

export function createRagdolls(ctx) {
  const { RAPIER } = ctx;
  const ragdolls = [];
  const parts = [];
  const meshes = [];
  const MAX_RAGDOLLS = 6;
  let nextId = 1;

  const up = new THREE.Vector3(0, 1, 0);
  const eyeGeo = new THREE.SphereGeometry(0.0028, 8, 6);
  const eyeMat = new THREE.MeshStandardMaterial({ color:'#2f2118', roughness:0.82 });
  const mouthGeo = new THREE.TorusGeometry(0.0072, 0.0009, 4, 12, Math.PI);
  const mouthMat = eyeMat.clone();

  function vec(a) { return new THREE.Vector3(a[0], a[1], a[2]); }

  // Endpoints describe the visible ends of each capsule. Joint anchors meet at those
  // ends, avoiding intersecting adjacent colliders (a common source of ragdoll jitter).
  const DEFINITIONS = [
    { name:'torso', kind:'segment', from:[0, .105, 0], to:[0, .195, 0], radius:.016, color:'#a85e3c' },
    { name:'head', kind:'ball', center:[0, .226, 0], radius:.024, color:'#dfbb86' },
    { name:'upperArmL', kind:'segment', from:[-.014, .185, 0], to:[-.055, .145, 0], radius:.008, color:'#d2aa72' },
    { name:'lowerArmL', kind:'segment', from:[-.055, .145, 0], to:[-.067, .087, 0], radius:.007, color:'#d9b680' },
    { name:'upperArmR', kind:'segment', from:[ .014, .185, 0], to:[ .055, .145, 0], radius:.008, color:'#d2aa72' },
    { name:'lowerArmR', kind:'segment', from:[ .055, .145, 0], to:[ .067, .087, 0], radius:.007, color:'#d9b680' },
    { name:'upperLegL', kind:'segment', from:[-.011, .108, 0], to:[-.030, .058, 0], radius:.009, color:'#bd8556' },
    { name:'lowerLegL', kind:'segment', from:[-.030, .058, 0], to:[-.033, .009, 0], radius:.008, color:'#ce9e69' },
    { name:'upperLegR', kind:'segment', from:[ .011, .108, 0], to:[ .030, .058, 0], radius:.009, color:'#bd8556' },
    { name:'lowerLegR', kind:'segment', from:[ .030, .058, 0], to:[ .033, .009, 0], radius:.008, color:'#ce9e69' },
  ];

  const LINKS = [
    ['torso', 'head',       [0, .202, 0]],
    ['torso', 'upperArmL',  [-.014, .185, 0]],
    ['upperArmL', 'lowerArmL', [-.055, .145, 0], 'hinge'],
    ['torso', 'upperArmR',  [ .014, .185, 0]],
    ['upperArmR', 'lowerArmR', [ .055, .145, 0], 'hinge'],
    ['torso', 'upperLegL',  [-.011, .108, 0]],
    ['upperLegL', 'lowerLegL', [-.030, .058, 0], 'hinge'],
    ['torso', 'upperLegR',  [ .011, .108, 0]],
    ['upperLegR', 'lowerLegR', [ .030, .058, 0], 'hinge'],
  ];

  function canonicalPose(def, x, z) {
    if (def.kind === 'ball')
      return { pos:vec(def.center).add(new THREE.Vector3(x, 0, z)), quat:new THREE.Quaternion() };
    const from = vec(def.from).add(new THREE.Vector3(x, 0, z));
    const to = vec(def.to).add(new THREE.Vector3(x, 0, z));
    const dir = to.clone().sub(from).normalize();
    return {
      pos:from.clone().add(to).multiplyScalar(.5),
      quat:new THREE.Quaternion().setFromUnitVectors(up, dir),
    };
  }

  function localAnchor(worldPoint, canonical) {
    return worldPoint.clone().sub(canonical.pos).applyQuaternion(canonical.quat.clone().invert());
  }

  function makePart(doll, def, x, z, savedPose) {
    const canonical = canonicalPose(def, x, z);
    const pos = savedPose ? vec(savedPose.pos) : canonical.pos;
    const q = savedPose
      ? new THREE.Quaternion(savedPose.quat[0], savedPose.quat[1], savedPose.quat[2], savedPose.quat[3])
      : canonical.quat;
    let geometry, colliderDesc;
    if (def.kind === 'ball') {
      geometry = new THREE.SphereGeometry(def.radius, 18, 12);
      colliderDesc = RAPIER.ColliderDesc.ball(def.radius);
    } else {
      const length = vec(def.to).distanceTo(vec(def.from));
      const cylinderLength = Math.max(.001, length - def.radius * 2);
      geometry = new THREE.CapsuleGeometry(def.radius, cylinderLength, 5, 10);
      colliderDesc = RAPIER.ColliderDesc.capsule(cylinderLength / 2, def.radius);
    }
    const material = new THREE.MeshStandardMaterial({
      color:def.color, roughness:.72, metalness:0, emissive:0x000000,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(pos);
    mesh.quaternion.copy(q);
    ctx.scene.add(mesh);

    const body = ctx.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x:q.x, y:q.y, z:q.z, w:q.w })
        .setLinearDamping(.28)
        .setAngularDamping(.42)
        .setCcdEnabled(true)
    );
    ctx.world.createCollider(
      colliderDesc
        .setDensity(def.kind === 'ball' ? 720 : 680)
        .setFriction(.82)
        .setRestitution(.025)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );
    if (ctx.buildMode) body.setBodyType(RAPIER.RigidBodyType.Fixed, true);

    const part = {
      id:`doll-${doll.id}:${def.name}`,
      name:def.name,
      articulated:true,
      doll,
      body,
      mesh,
      canonical,
      len:def.kind === 'ball' ? def.radius * 2 : vec(def.to).distanceTo(vec(def.from)),
      prevPos:pos.clone(),
      currPos:pos.clone(),
      prevQuat:q.clone(),
      currQuat:q.clone(),
    };
    mesh.userData.rec = part;
    ctx.recByBody.set(body.handle, part);
    parts.push(part);
    meshes.push(mesh);

    // A tiny face keeps the physical object readable as a character without turning
    // the quiet craft-table palette into a cartoon overlay.
    if (def.name === 'head') {
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(sx * .008, .006, def.radius * .94);
        mesh.add(eye);
      }
      const mouth = new THREE.Mesh(mouthGeo, mouthMat);
      mouth.position.set(0, -.004, def.radius * .965);
      mouth.rotation.z = Math.PI;
      mesh.add(mouth);
    }
    return part;
  }

  function createJoint(a, b, point, kind) {
    const anchorA = localAnchor(point, a.canonical);
    const anchorB = localAnchor(point, b.canonical);
    const va = { x:anchorA.x, y:anchorA.y, z:anchorA.z };
    const vb = { x:anchorB.x, y:anchorB.y, z:anchorB.z };
    let data;
    if (kind === 'hinge') {
      data = RAPIER.JointData.revolute(va, vb, { x:0, y:0, z:1 });
      data.limitsEnabled = true;
      data.limits = [-2.35, 2.35];             // elbows/knees bend; they cannot fold through themselves
    } else data = RAPIER.JointData.spherical(va, vb);
    const joint = ctx.world.createImpulseJoint(data, a.body, b.body, true);
    joint.setContactsEnabled(false);           // adjacent caps meet; they should not fight their own joint
    return joint;
  }

  function spawnRagdoll(x = 0, z = 0, opts = {}) {
    if (ragdolls.length >= MAX_RAGDOLLS) return null;
    const requestedId = Number.isFinite(opts.id) ? opts.id : nextId;
    nextId = Math.max(nextId, requestedId + 1);
    const doll = { id:requestedId, parts:[], joints:[] };
    const saved = new Map((opts.parts || []).map(p => [p.name, p]));
    for (const def of DEFINITIONS)
      doll.parts.push(makePart(doll, def, x, z, saved.get(def.name)));
    const byName = new Map(doll.parts.map(p => [p.name, p]));
    for (const [aName, bName, p, kind] of LINKS) {
      const worldPoint = vec(p).add(new THREE.Vector3(x, 0, z));
      doll.joints.push(createJoint(byName.get(aName), byName.get(bName), worldPoint, kind));
    }
    ragdolls.push(doll);
    window.__leanto.ragdolls = ragdolls.length;
    ctx.refreshQueries();
    return doll;
  }

  function removeRagdoll(doll) {
    const i = ragdolls.indexOf(doll);
    if (i < 0) return false;
    for (const joint of doll.joints) {
      try { ctx.world.removeImpulseJoint(joint, false); } catch (_) {}
    }
    for (const part of doll.parts) {
      const pi = parts.indexOf(part);
      const mi = meshes.indexOf(part.mesh);
      if (pi >= 0) parts.splice(pi, 1);
      if (mi >= 0) meshes.splice(mi, 1);
      ctx.recByBody.delete(part.body.handle);
      ctx.scene.remove(part.mesh);
      part.mesh.geometry.dispose();
      part.mesh.material.dispose();
      ctx.world.removeRigidBody(part.body);
    }
    ragdolls.splice(i, 1);
    window.__leanto.ragdolls = ragdolls.length;
    ctx.refreshQueries();
    return true;
  }

  function clearRagdolls() {
    for (const doll of ragdolls.slice()) removeRagdoll(doll);
  }

  function beforeStep() {
    for (const part of parts) {
      part.prevPos.copy(part.currPos);
      part.prevQuat.copy(part.currQuat);
    }
  }

  function afterStep() {
    for (const part of parts) {
      const t = part.body.translation();
      const r = part.body.rotation();
      part.currPos.set(t.x, t.y, t.z);
      part.currQuat.set(r.x, r.y, r.z, r.w);
    }
  }

  function render(alpha) {
    for (const part of parts) {
      part.mesh.position.lerpVectors(part.prevPos, part.currPos, alpha);
      part.mesh.quaternion.slerpQuaternions(part.prevQuat, part.currQuat, alpha);
    }
  }

  function serializeRagdolls() {
    return ragdolls.map(doll => ({
      id:doll.id,
      parts:doll.parts.map(part => ({
        name:part.name,
        pos:part.currPos.toArray(),
        quat:part.currQuat.toArray(),
      })),
    }));
  }

  const rawSetBuildMode = ctx.setBuildMode;
  ctx.setBuildMode = on => {
    rawSetBuildMode(on);
    for (const part of parts) {
      part.body.setBodyType(on ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic, true);
      part.body.setLinvel({ x:0, y:0, z:0 }, true);
      part.body.setAngvel({ x:0, y:0, z:0 }, true);
      if (!on) {
        part.body.setGravityScale(.25, true);
        part.body.wakeUp();
      }
    }
  };

  const rawSweep = ctx.sweep;
  ctx.sweep = () => {
    clearRagdolls();
    rawSweep();
  };

  ctx.ragdolls = ragdolls;
  ctx.ragdollParts = parts;
  ctx.ragdollMeshes = meshes;
  ctx.spawnRagdoll = spawnRagdoll;
  ctx.removeRagdoll = removeRagdoll;
  ctx.clearRagdolls = clearRagdolls;
  ctx.ragdollBeforeStep = beforeStep;
  ctx.ragdollAfterStep = afterStep;
  ctx.renderRagdolls = render;
  ctx.serializeRagdolls = serializeRagdolls;
}
