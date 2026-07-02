// physics.js — Rapier world + fixed-clock constants. Rapier owns physical truth.

export function createPhysics(ctx) {
  const { RAPIER } = ctx;

  // gentler than real-Earth so light sticks settle calmly instead of slamming
  const world = new RAPIER.World({ x:0, y:-6.0, z:0 });
  // sticks are cm-scale; tell the solver so contact slop scales down (default 1mm slop
  // lets 2mm-thin sticks visibly sink into the table — at 0.1 it's a crisp 0.1mm)
  world.integrationParameters.lengthUnit = 0.1;

  // Physics runs on a fixed 120 Hz clock (accumulator), independent of display refresh:
  // 2mm-thin sticks want the high rate, and the BUILD→RUN reveal must behave identically
  // on a 60 Hz laptop and a 144 Hz monitor.
  const FIXED_DT = 1/120;
  world.timestep = FIXED_DT;

  ctx.world = world;
  ctx.eventQueue = new RAPIER.EventQueue(true);
  ctx.FIXED_DT = FIXED_DT;
  ctx.MAX_SUBSTEPS = 6;
  ctx.runRamp = -1;   // >=0 while gravity eases in after a Build->Run flip
}
