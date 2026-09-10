/* Minimal 2D vector helpers.
 *
 * World frame: x east, y north. Angles are radians, measured CCW from +x.
 * The renderer flips y; nothing in src/core/ knows or cares about screens.
 */

export function v2(x, y) { return { x: x, y: y }; }
export function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
export function scale(a, k) { return { x: a.x * k, y: a.y * k }; }
export function dot(a, b) { return a.x * b.x + a.y * b.y; }
export function len(a) { return Math.sqrt(a.x * a.x + a.y * a.y); }
export function len2(a) { return a.x * a.x + a.y * a.y; }

export function norm(a) {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

/** Unit vector at angle `t` (CCW from +x). */
export function fromAngle(t) { return { x: Math.cos(t), y: Math.sin(t) }; }

export function angleOf(a) { return Math.atan2(a.y, a.x); }

/** Rotate 90 degrees counter-clockwise. */
export function perpCCW(a) { return { x: -a.y, y: a.x }; }

/** Rotate 90 degrees clockwise. */
export function perpCW(a) { return { x: a.y, y: -a.x }; }

/** 2D cross product (z component). Positive means b is CCW from a. */
export function cross(a, b) { return a.x * b.y - a.y * b.x; }
