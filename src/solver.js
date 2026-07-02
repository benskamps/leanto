// solver.js — orientation-aware drop solver (support inference).
// The cursor owns x,z; HEIGHT comes from casting the body's own cuboid straight down
// and resting it on whatever it meets (table or sticks). A vertical stick lands on its
// end, a tilted roof plank rests on both its supports, nothing interpenetrates.

import * as THREE from 'three';

export function createSolver(ctx) {
  const { RAPIER } = ctx;
  const CAST_FROM = 0.6, DROP_EPS = 0.0002;

  const _axis = new THREE.Vector3();
  function supportExtent(q, hx, hy, hz){    // OBB support distance along world +Y
    return hx * Math.abs(_axis.set(1,0,0).applyQuaternion(q).y)
         + hy * Math.abs(_axis.set(0,1,0).applyQuaternion(q).y)
         + hz * Math.abs(_axis.set(0,0,1).applyQuaternion(q).y);
  }

  const _cast = { c:null, hx:0, hy:0, hz:0 };
  function cuboidFor(hx, hy, hz){           // reuse one RAPIER.Cuboid across per-frame casts
    if (!_cast.c || _cast.hx!==hx || _cast.hy!==hy || _cast.hz!==hz){
      _cast.c = new RAPIER.Cuboid(hx, hy, hz); _cast.hx=hx; _cast.hy=hy; _cast.hz=hz;
    }
    return _cast.c;
  }

  function solveDropY(x, z, q, hx, hy, hz, excludeBody){
    const hit = ctx.world.castShape(
      { x, y:CAST_FROM, z }, { x:q.x, y:q.y, z:q.z, w:q.w }, { x:0, y:-1, z:0 },
      cuboidFor(hx, hy, hz), 0, CAST_FROM + 0.3, true,
      undefined, undefined, undefined, excludeBody || undefined
    );
    if (hit) return CAST_FROM - hit.time_of_impact + DROP_EPS;
    return supportExtent(q, hx, hy, hz) + DROP_EPS;   // off-table fallback: rest at tabletop plane
  }

  ctx.supportExtent = supportExtent;
  ctx.solveDropY = solveDropY;
}
