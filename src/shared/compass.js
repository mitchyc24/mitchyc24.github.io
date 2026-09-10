/* Wind direction, said unambiguously.
 *
 * Wind direction is the single most confusable thing in a sailing game, and it
 * has two conventions that point opposite ways:
 *
 *   sailors name the wind by where it COMES FROM — "a northerly" blows south
 *   arrows and water streaks show where it is GOING
 *
 * Getting this wrong is not a cosmetic bug. An early build drew the arrow 90
 * degrees off, and with the only cue lying the whole game felt arbitrary — you
 * cannot learn a boat when you cannot tell where the wind is. So the maths
 * lives here, in one pure module both the renderer and the tests use, and the
 * UI always states BOTH facts: which way it comes from, and which way it goes.
 */

import { wrap, deg } from './angles.js';

const POINTS = ['E', 'ENE', 'NE', 'NNE', 'N', 'NNW', 'NW', 'WNW',
                'W', 'WSW', 'SW', 'SSW', 'S', 'SSE', 'SE', 'ESE'];

/** Compass name for a world angle (radians CCW from +x, y north). */
export function compassName(angle) {
  const i = Math.round(wrap(angle) / (Math.PI / 8));
  return POINTS[((i % 16) + 16) % 16];
}

/** Where the wind comes from, as a compass point. "N" for a northerly. */
export const windFromName = (from) => compassName(from);

/** Where the wind is going. A northerly blows to the south. */
export const windToName = (from) => compassName(from + Math.PI);

/**
 * Unit vector, in SCREEN space (x right, y DOWN), pointing the way the wind
 * travels. This is what an arrow or a drifting streak should follow.
 *
 * World flow for "wind from F" is (-cos F, -sin F) with y north; screen flips
 * y, giving (-cos F, +sin F).
 */
export function flowScreenDir(from) {
  return { x: -Math.cos(from), y: Math.sin(from) };
}

/**
 * Canvas rotation that aims a shape drawn along its local +y axis (down the
 * screen) in the direction the wind travels.
 *
 * Canvas rotate(a) sends local (0,1) to screen (-sin a, cos a). Setting that
 * equal to flowScreenDir gives a = PI/2 - from.
 */
export const flowRotation = (from) => Math.PI / 2 - from;

/* ── points of sail ──────────────────────────────────────────────────
 * Named by true wind angle off the bow. These are the words the game should
 * use, because they are the words a sailor uses, and putting the name on
 * screen is what turns an angle into a thing you can learn.
 */
export const POINTS_OF_SAIL = [
  { max: 40, key: 'nogo', name: 'IN THE NO-GO ZONE', hint: 'too close to the wind — bear away' },
  { max: 55, key: 'closehauled', name: 'CLOSE HAULED', hint: 'as high as she will go' },
  { max: 80, key: 'closereach', name: 'CLOSE REACH', hint: '' },
  { max: 100, key: 'beamreach', name: 'BEAM REACH', hint: 'wind on the beam — her fastest angle' },
  { max: 150, key: 'broadreach', name: 'BROAD REACH', hint: '' },
  { max: 181, key: 'run', name: 'RUNNING', hint: 'wind astern' }
];

/** @param twaDeg true wind angle off the bow, signed degrees */
export function pointOfSail(twaDeg) {
  const a = Math.abs(twaDeg);
  for (const p of POINTS_OF_SAIL) if (a < p.max) return p;
  return POINTS_OF_SAIL[POINTS_OF_SAIL.length - 1];
}

/** Which side the wind is on. Sailors steer by this before anything else. */
export function tackName(twaDeg) {
  if (Math.abs(twaDeg) < 3 || Math.abs(twaDeg) > 177) return '';
  return twaDeg > 0 ? 'port' : 'starboard';
}
