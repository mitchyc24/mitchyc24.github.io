/* The world: boats plus wind, advanced on a fixed step.
 *
 * The host owns exactly one of these and is the only authority on where the
 * boats are. Nothing in here touches the DOM or the network.
 */

import { createWind, advanceWind, windAt } from './wind.js';
import { createBoat, setInput, setAssist, step as stepBoat } from './boat.js';

export const DT = 1 / 60;
const MAX_STEPS = 5;   // after a stall, drop time rather than fast-forward

export function createWorld(opts) {
  const o = opts || {};
  return {
    wind: createWind(o.wind),
    boats: [],
    byId: new Map(),
    time: 0,
    acc: 0
  };
}

export function addBoat(world, id, opts) {
  const b = createBoat(opts);
  b.id = id;
  world.boats.push(b);
  world.byId.set(id, b);
  return b;
}

export function removeBoat(world, id) {
  const b = world.byId.get(id);
  if (!b) return;
  world.byId.delete(id);
  const i = world.boats.indexOf(b);
  if (i >= 0) world.boats.splice(i, 1);
}

export function setBoatAssist(world, id, level) {
  const b = world.byId.get(id);
  if (b) setAssist(b, level);
  return b;
}

export function applyInput(world, id, input) {
  const b = world.byId.get(id);
  if (b) setInput(b, input);
}

/** One deterministic fixed step. */
export function stepWorld(world, dt) {
  advanceWind(world.wind, dt);
  world.time += dt;
  for (let i = 0; i < world.boats.length; i++) {
    const b = world.boats[i];
    const flow = windAt(world.wind, b.p, world.boats);
    stepBoat(b, flow, dt, false);
  }
}

/**
 * Drive the world from a wall clock, decoupled from rendering.
 * Returns the leftover fraction of a step, for render interpolation.
 */
export function pump(world, elapsedSeconds) {
  world.acc += Math.min(elapsedSeconds, 0.25);   // clamp after a tab stall
  let steps = 0;
  while (world.acc >= DT && steps < MAX_STEPS) {
    stepWorld(world, DT);
    world.acc -= DT;
    steps++;
  }
  if (steps === MAX_STEPS) world.acc = 0;        // gave up; do not accumulate debt
  return world.acc / DT;
}
