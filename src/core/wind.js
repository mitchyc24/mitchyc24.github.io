/* The wind field.
 *
 * A constant wind makes for a dead race, so three things layer on a base:
 *   shifts   sum of sines, +-12 deg over 60-180 s. Rewards players who notice.
 *   gusts    scrolling value-noise on speed, advecting downwind, so darker
 *            patches on the water are readable rather than random.
 *   shadow   each boat casts a cone downwind. This is what makes covering and
 *            escaping cover exist, which is most of tactical racing.
 *
 * Deterministic from a seed and a clock: no Math.random anywhere, so the host
 * owns the field and every replay and test is reproducible.
 */

import { v2, sub, dot, len } from '../shared/vec2.js';
import { rad } from '../shared/angles.js';

/* ── deterministic value noise ───────────────────────────────────── */
function hash2(ix, iy, seed) {
  let h = ix * 374761393 + iy * 668265263 + seed * 1274126177;
  h = (h ^ (h >> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

const smooth = (t) => t * t * (3 - 2 * t);

function valueNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export function createWind(opts) {
  const o = opts || {};
  return {
    /* Direction the wind comes FROM, radians CCW from +x.
     * PI/2 means from the north, so the flow travels south. */
    baseFrom: o.from === undefined ? Math.PI / 2 : o.from,
    baseSpeed: o.speed === undefined ? 6 : o.speed,

    shiftAmp: o.shiftAmp === undefined ? rad(12) : o.shiftAmp,
    shiftPeriods: o.shiftPeriods || [83, 151],

    gustAmp: o.gustAmp === undefined ? 0.25 : o.gustAmp,
    gustScale: o.gustScale === undefined ? 55 : o.gustScale,  // metres per cell

    shadowLength: o.shadowLength === undefined ? 8 : o.shadowLength, // boat lengths
    shadowHalfAngle: o.shadowHalfAngle === undefined ? rad(13) : o.shadowHalfAngle,
    shadowDepth: o.shadowDepth === undefined ? 0.55 : o.shadowDepth, // speed retained

    seed: o.seed === undefined ? 1 : o.seed,
    t: 0,

    /* Set true for the polar sweep and unit tests: steady, uniform, boring. */
    steady: !!o.steady
  };
}

export function advanceWind(wind, dt) { wind.t += dt; }

/** Direction the wind comes from, at time t, before local gusts. */
export function windFrom(wind) {
  if (wind.steady) return wind.baseFrom;
  let s = 0;
  for (let i = 0; i < wind.shiftPeriods.length; i++) {
    const p = wind.shiftPeriods[i];
    s += Math.sin((wind.t / p) * Math.PI * 2 + i * 1.7) / wind.shiftPeriods.length;
  }
  return wind.baseFrom + s * wind.shiftAmp;
}

/** Gust multiplier at a point. The field scrolls downwind at roughly the wind
 *  speed, so a dark patch you can see upwind will actually reach you. */
export function gustAt(wind, p) {
  if (wind.steady) return 1;
  const from = wind.baseFrom;
  const driftX = -Math.cos(from) * wind.baseSpeed * wind.t;
  const driftY = -Math.sin(from) * wind.baseSpeed * wind.t;
  const n = valueNoise(
    (p.x - driftX) / wind.gustScale,
    (p.y - driftY) / wind.gustScale,
    wind.seed
  );
  return 1 + (n * 2 - 1) * wind.gustAmp;
}

/** Wind FLOW vector at a point — the direction and speed the air is moving,
 *  which is what physics.js consumes.
 *  @param blockers optional array of boats casting wind shadows */
export function windAt(wind, p, blockers) {
  const from = windFrom(wind);
  let speed = wind.baseSpeed * gustAt(wind, p);

  if (blockers && blockers.length && !wind.steady) {
    speed *= shadowFactor(wind, p, from, blockers);
  }

  /* Flow travels opposite to where it comes from. */
  return v2(-Math.cos(from) * speed, -Math.sin(from) * speed);
}

/** How much of the wind survives after passing behind other boats. */
export function shadowFactor(wind, p, from, blockers) {
  const upwind = v2(Math.cos(from), Math.sin(from));  // toward the wind's origin
  let factor = 1;

  for (let i = 0; i < blockers.length; i++) {
    const bo = blockers[i];
    if (!bo || bo.p === p) continue;
    const toBlocker = sub(bo.p, p);
    const along = dot(toBlocker, upwind);
    if (along <= 0) continue;                    // that boat is downwind of us

    const maxLen = wind.shadowLength * bo.cls.loa;
    if (along > maxLen) continue;

    const dist = len(toBlocker);
    const spread = Math.asin(Math.min(1, Math.max(-1, cross2(upwind, toBlocker) / (dist || 1))));
    if (Math.abs(spread) > wind.shadowHalfAngle) continue;

    /* Deepest right behind the boat, fading with distance and with how far
     * off the centreline of the cone you are. */
    const fade = 1 - along / maxLen;
    const off = 1 - Math.abs(spread) / wind.shadowHalfAngle;
    factor *= 1 - (1 - wind.shadowDepth) * fade * off;
  }
  return factor;
}

function cross2(a, b) { return a.x * b.y - a.y * b.x; }

/** True wind angle off the bow for a heading, at this instant. Display only —
 *  the physics never needs it, because it works from apparent wind. */
export function trueWindAngle(wind, theta) {
  let d = windFrom(wind) - theta;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return d;
}
