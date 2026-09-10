/* Boat classes — every tunable number in one table.
 *
 * These are the numbers you will change more than any other code in the
 * project. The /dev/ page exposes them live behind ?tune=1, and
 * tools/polar-sweep.js validates them headlessly.
 *
 * THE CRITICAL ONE is LAT_OVER_FWD: how much harder the keel resists sideways
 * motion than the hull resists forward motion. That asymmetry, and nothing
 * else, is why a boat can sail toward the wind. Tune it first, and gently —
 * too low and the boat crabs sideways and cannot beat upwind, too high and it
 * feels like it is on rails.
 *
 * Angles in this table are DEGREES for legibility; makeBoatClass converts to
 * radians once at load. Everything else is SI.
 */

import { rad } from './angles.js';
import { hullSpeed } from './units.js';

const DINGHY = {
  id: 'dinghy',
  name: 'Two-person dinghy',

  /* ── hull ─────────────────────────────────────────────────────── */
  mass: 180,            // kg, hull plus two crew
  Iz: 320,              // kg·m², yaw inertia. Raise for a heavier feel.
  LWL: 4.3,             // m, waterline length
  loa: 4.7,             // m, overall — rendering and collision only
  beam: 1.7,            // m

  /* ── sail ─────────────────────────────────────────────────────── */
  sailArea: 10.5,       // m², main plus jib
  camberGain: 2.20,     // cambered sail beats a flat plate below stallStart
  stallStart: 20,       // deg AoA where the camber advantage starts fading
  stallEnd: 35,         // deg AoA where it is gone
  parasiticCd: 0.34,    // rig, crew, hull windage — also sets the no-go edge
  dragPeak: 1.00,       // soft-sail drag ceiling (a rigid flat plate would be 2)
  sheetMin: 6,          // deg — the boom cannot come past the centreline, and
                        // there is always some twist. Also removes the
                        // strapped-flat dead spot a beginner could stick in.
  sheetMax: 85,         // deg, boom travel from centreline at full ease
  sheetRate: 60,        // deg/s — trimming takes real time
  optimalAoA: 19,       // deg — where the sweep says best trim actually sits

  /* ── resistance ───────────────────────────────────────────────── */
  Kfwd: 9.5,            // N·s²/m², quadratic hull drag
  Cfwd: 14,             // N·s/m, linear hull drag (matters at low speed)
  LAT_OVER_FWD: 55,     // ← the critical ratio
  Clat: 150,            // N·s/m, linear lateral damping
  waveOnset: 0.80,      // fraction of hull speed where the hump starts
  waveK: 1.70,          // peak drag multiplier at hull speed
  planeAt: 1.45,        // × hull speed where planing relief is fully in
  planeDrag: 0.80,      // drag multiplier once planing
  sprayOnset: 1.80,     // × hull speed where spray and windage start to bite
  sprayFull: 3.40,      // × hull speed where they have fully taken over
  sprayK: 3.20,         // drag multiplier there — this is the boat's top end
  keelInduced: 4.0e-4,  // ← price of side force; sets how high she points
  inducedFloor: 3.0,    // m²/s², keeps it finite at zero speed
  inducedCap: 700,      // N, stability guard against the low-speed death spiral

  /* ── steering ─────────────────────────────────────────────────── */
  Krud: 150,            // N·m·s²/m² — rudder authority, scales with u²
  rudderMax: 35,        // deg
  rudderRate: 90,       // deg/s
  Cyaw: 300,            // N·m·s, yaw damping. Too low feels twitchy on a phone.
  helmLever: 0.34,      // m, sail centre of effort aft of keel centre
  Ktrack: 116,          // directional stability — opposes weather helm so she
                        // tracks instead of rounding up on her own.
                        // Deliberately left just shy of neutral: with the helm
                        // released she creeps to windward and depowers, rather
                        // than bearing away and accelerating into a broach.
                        // An unattended boat under fixed sheet is genuinely
                        // yaw-unstable — this picks the safe direction.

  /* ── heel ─────────────────────────────────────────────────────── */
  Hce: 3.0,             // m, sail centre of effort above the waterline
  rightingHiked: 1900,  // N·m, crew fully hiked out
  rightingIn: 620,      // N·m, crew sitting inboard
  rightingHull: 520,    // N·m, hull form stability
  tauHeel: 0.6,         // s, heel response lag
  capsizeAngle: 62,     // deg — a dinghy goes over when the gunwale digs in
  recoverySeconds: 6,   // how long a capsize costs you

  /* ── strictness ───────────────────────────────────────────────── */
  /* "Strict" was chosen deliberately: botch a tack and you sit in irons
   * until you back the sail, because rudder authority scales with u² and
   * there is no floor under it. Setting rudderFloor above 0 softens that. */
  rudderFloor: 0
};

function prepare(c) {
  const b = Object.assign({}, c);
  b.stallStartR = rad(c.stallStart);
  b.stallEndR = rad(c.stallEnd);
  b.sheetMinR = rad(c.sheetMin);
  b.sheetMaxR = rad(c.sheetMax);
  b.sheetRateR = rad(c.sheetRate);
  b.rudderMaxR = rad(c.rudderMax);
  b.rudderRateR = rad(c.rudderRate);
  b.capsizeAngleR = rad(c.capsizeAngle);
  b.optimalAoAR = rad(c.optimalAoA);
  b.Klat = c.Kfwd * c.LAT_OVER_FWD;
  b.hullSpeed = hullSpeed(c.LWL);
  return b;
}

export const BOATS = { dinghy: prepare(DINGHY) };
export const DEFAULT_BOAT = 'dinghy';

/** Rebuild a class after live edits in the tuning overlay. */
export function withOverrides(id, overrides) {
  return prepare(Object.assign({}, BOATS[id] || BOATS[DEFAULT_BOAT], overrides || {}));
}
