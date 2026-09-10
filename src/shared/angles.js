/* Angle helpers. Everything internal is radians; degrees only at the edges. */

export const TAU = Math.PI * 2;

export const deg = (r) => r * 180 / Math.PI;
export const rad = (d) => d * Math.PI / 180;

/** Wrap to (-PI, PI]. */
export function wrap(a) {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
}

/** Signed smallest difference a - b, wrapped. */
export function angleDiff(a, b) { return wrap(a - b); }

export function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

export function lerp(a, b, t) { return a + (b - a) * t; }

/** Move `from` toward `to` by at most `maxDelta`. Used for control rate limits. */
export function approach(from, to, maxDelta) {
  const d = to - from;
  if (Math.abs(d) <= maxDelta) return to;
  return from + Math.sign(d) * maxDelta;
}

/** Same, but for angles, taking the short way round. */
export function approachAngle(from, to, maxDelta) {
  const d = wrap(to - from);
  if (Math.abs(d) <= maxDelta) return wrap(to);
  return wrap(from + Math.sign(d) * maxDelta);
}
