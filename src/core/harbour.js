/* The harbour: where you spawn, and where the choices live.
 *
 * The whole lobby design rests on one idea — THE MAP IS THE DIFFICULTY CURVE.
 * Zones are not scattered prettily; each sits at a deliberate angle to the
 * wind, so choosing it means sailing that point of sail first:
 *
 *     lessons   ~100 deg off the wind   a beam reach, the easiest thing there is
 *     cargo     ~ 58 deg on one side    a close reach
 *     squall    ~ 58 deg on the other   a close reach
 *     race        dead upwind           unreachable except by beating
 *
 * So a room that can't yet beat cannot accidentally start a race, and the
 * people who can are demonstrating it by arriving. Nobody is tested; the
 * geography just asks.
 *
 * DOM-free and network-free like everything in src/core/ — the vote logic is
 * exercised headlessly in test/lobby.test.mjs.
 */

import { rad } from '../shared/angles.js';

/* Distances are a compromise between "a real beat" and "a lobby, not a
 * delivery trip". 125 m dead upwind is roughly 90 s of beating sailed well —
 * long enough to be an achievement, short enough that the room doesn't cool
 * off waiting. Radii are generous (24 m) because holding station in a circle
 * under sail is itself a skill nobody has yet. */
export const LAYOUT = [
  { id: 'race',    mode: 'race',    bearing:    0, dist: 125, r: 24, note: 'dead upwind — beat to it' },
  { id: 'cargo',   mode: 'cargo',   bearing:  -58, dist: 105, r: 24, note: 'close reach' },
  { id: 'squall',  mode: 'squall',  bearing:   58, dist: 105, r: 24, note: 'close reach' },
  { id: 'lessons', mode: 'lessons', bearing:   96, dist:  90, r: 26, note: 'easy beam reach' }
];

/* When the room gives up (see lobby.js STUCK_SECONDS), the race zone eases off
 * the wind. The concession is one of ANGLE, not of physics — the beat is still
 * there next time round, and every other zone is untouched.
 *
 * It eases to a BEAM REACH ON THE EMPTY SIDE rather than the close reach the
 * plan called for, because both close reaches are already occupied and a
 * drifting zone that lands on top of another one is not a kindness — it is two
 * votes at once. A test asserts the zones stay disjoint through the whole
 * drift, which is how this was found. */
export const DRIFT_TO_BEARING = -96;
export const DRIFT_TO_DIST = 178;
const DRIFT_RATE = rad(9);          // radians per second, so it visibly moves
const DRIFT_DIST_RATE = 25;         // metres per second

/**
 * @param opts.from  the wind's BASE direction, radians. Zones are placed off
 *   this rather than off the live shifting wind, so the harbour stays put and
 *   the shifts stay a tactical detail rather than a moving target.
 */
export function createHarbour(opts) {
  const o = opts || {};
  const from = o.from === undefined ? Math.PI / 2 : o.from;
  const zones = LAYOUT.map((z) => ({
    id: z.id,
    mode: z.mode,
    note: z.note,
    r: z.r,
    dist: z.dist,
    bearing: rad(z.bearing),        // live, may drift
    wanted: rad(z.bearing),         // where it is heading
    wantedDist: z.dist,
    p: { x: 0, y: 0 }
  }));

  const h = { from, zones, byId: new Map(), dock: dockOf(from), drifted: false };
  for (const z of zones) h.byId.set(z.id, z);
  placeAll(h);
  return h;
}

/** Unit vector pointing INTO the wind — the direction you'd beat toward. */
export function upwind(from) { return { x: Math.cos(from), y: Math.sin(from) }; }

function placeAll(h) {
  const u = upwind(h.from);
  for (const z of h.zones) {
    const c = Math.cos(z.bearing), s = Math.sin(z.bearing);
    z.p.x = (u.x * c - u.y * s) * z.dist;
    z.p.y = (u.x * s + u.y * c) * z.dist;
  }
}

/* The dock sits well downwind of everything, so every zone — the beam-reach
 * ones included — is a sail TOWARD the wind from where you start. A boat with
 * nobody at the helm goes dead downwind, so nothing here can be reached by
 * giving up. */
const DOCK_OFFSET = 55;

function dockOf(from) {
  const u = upwind(from);
  return {
    x: -u.x * DOCK_OFFSET,
    y: -u.y * DOCK_OFFSET,
    /* Along the shoreline, i.e. across the wind. */
    theta: from + Math.PI / 2
  };
}

/**
 * Where boat number `slot` starts. Spread along the jetty, all pointing out
 * on a broad reach so nobody's first three seconds are spent in irons.
 */
export function berth(harbour, slot) {
  const d = harbour.dock;
  const across = ((slot % 8) - 3.5) * 11;
  /* A broad reach, alternating tacks so a crowded dock fans out instead of
   * everyone converging on the same bit of water.
   *
   * True wind angle is (from - theta), so theta = from -+ TWA. Ninety-five
   * degrees is deliberately free: she is moving from the first second, she is
   * nowhere near the no-go zone, and turning EITHER way is safe — which
   * matters because the first thing anybody does is haul the tiller over to
   * find out what it does. */
  const twa = rad(95) * (slot % 2 ? -1 : 1);
  return {
    x: d.x + Math.cos(d.theta) * across,
    y: d.y + Math.sin(d.theta) * across,
    theta: harbour.from - twa
  };
}

/** Which zone this point is inside, or null. Zones never overlap by design. */
export function zoneAt(harbour, p) {
  for (const z of harbour.zones) {
    const dx = p.x - z.p.x, dy = p.y - z.p.y;
    if (dx * dx + dy * dy <= z.r * z.r) return z;
  }
  return null;
}

/** 0 at the rim, 1 at the middle. Only used for drawing. */
export function depthIn(zone, p) {
  const dx = p.x - zone.p.x, dy = p.y - zone.p.y;
  return Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / zone.r);
}

/** Ease the race zone off the wind. Idempotent once it has arrived. */
export function driftRaceZone(harbour) {
  const z = harbour.byId.get('race');
  if (!z) return false;
  z.wanted = rad(DRIFT_TO_BEARING);
  z.wantedDist = DRIFT_TO_DIST;
  harbour.drifted = true;
  return true;
}

/**
 * Advance any zone that is moving. Cheap no-op in the normal case.
 *
 * Distance first, then bearing — and that ORDER is the whole trick. Both
 * close-reach zones sit between the race zone's old bearing and its new one,
 * so a zone that simply rotated would sweep straight through them and, for a
 * few seconds, be two votes in one place. Standing off to seaward before
 * swinging round keeps every ring disjoint at every instant, which is what
 * test/lobby.test.mjs actually asserts.
 */
export function stepHarbour(harbour, dt) {
  let moved = false;
  for (const z of harbour.zones) {
    if (z.dist !== z.wantedDist) {
      const dd = z.wantedDist - z.dist;
      const stepD = DRIFT_DIST_RATE * dt;
      z.dist = Math.abs(dd) <= stepD ? z.wantedDist : z.dist + Math.sign(dd) * stepD;
      moved = true;
      continue;                       // do not turn until we are clear
    }
    if (z.bearing === z.wanted) continue;
    const d = z.wanted - z.bearing;
    const stepA = DRIFT_RATE * dt;
    z.bearing = Math.abs(d) <= stepA ? z.wanted : z.bearing + Math.sign(d) * stepA;
    moved = true;
  }
  if (moved) placeAll(harbour);
  return moved;
}

/** Is any zone still on the move? Drives the "the harbour is shifting" caption. */
export function harbourSettling(harbour) {
  for (const z of harbour.zones) {
    if (z.dist !== z.wantedDist || z.bearing !== z.wanted) return true;
  }
  return false;
}

/** Bounding box of the whole harbour, for framing the camera. */
export function harbourBounds(harbour) {
  let minX = harbour.dock.x, maxX = harbour.dock.x;
  let minY = harbour.dock.y, maxY = harbour.dock.y;
  for (const z of harbour.zones) {
    if (z.p.x - z.r < minX) minX = z.p.x - z.r;
    if (z.p.x + z.r > maxX) maxX = z.p.x + z.r;
    if (z.p.y - z.r < minY) minY = z.p.y - z.r;
    if (z.p.y + z.r > maxY) maxY = z.p.y + z.r;
  }
  return { minX, maxX, minY, maxY };
}
