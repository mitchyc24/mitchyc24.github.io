/* Bistability check.
 *
 *   node tools/trap-check.js
 *
 * The induced-drag term is self-reinforcing at low speed: side force makes
 * drag, drag holds speed down, low speed makes more drag. Tuned too hard it
 * creates a second stable state where the boat sits at a fraction of a knot
 * and never escapes — and worse, WHICH state you land in depends on the exact
 * approach, so the boat sails fine one minute and stops dead the next.
 *
 * A polar is meaningless if the boat is bistable, so this runs before any
 * tuning verdict is accepted. Trap-freedom is a hard constraint, not a score.
 */

import { steadyState } from './polar-sweep.js';
import { msToKn } from '../src/shared/units.js';

const ANGLES = [40, 45, 50, 55, 60, 70, 90, 120];
const WINDS = [5, 8, 12, 16];
const SHEETS = [0.05, 0.1, 0.2, 0.35];

/* NOT every bistability is a bug. Two stable states separated by the drag hump
 * is PLANING HYSTERESIS, and it is one of the most characteristic things a
 * dinghy does: bear away in a gust to get her up on the plane, and she stays
 * up even after the gust passes. "From slow 4.9 kn, from fast 9.6 kn" is that,
 * and it should be kept.
 *
 * The pathology is different in kind: the slow branch is STOPPED — a fraction
 * of a knot — while the fast branch sails normally. That is the induced-drag
 * death spiral, and it makes the boat feel broken and random.
 */
const STOPPED_KN = 1.2;
const SAILING_KN = 3.0;

export function findTraps(opts) {
  const traps = [];

  for (const wind of WINDS) {
    for (const twa of ANGLES) {
      for (const sheet of SHEETS) {
        const slow = steadyState(twa, wind, sheet, Object.assign({ initialSpeed: 0.3, seconds: 150 }, opts));
        const fast = steadyState(twa, wind, sheet, Object.assign({ initialSpeed: 5.0, seconds: 150 }, opts));
        if (slow.capsized || fast.capsized) continue;

        const slowKn = msToKn(slow.u), fastKn = msToKn(fast.u);
        if (slowKn < STOPPED_KN && fastKn > SAILING_KN) {
          traps.push({ kind: 'dead-stop lock', wind, twa, sheet, fromSlow: slowKn, fromFast: fastKn });
        }
      }
    }
  }

  /* More wind must never leave her stopped where less wind had her sailing. */
  for (const twa of ANGLES) {
    for (const sheet of SHEETS) {
      let prev = null;
      for (const wind of WINDS) {
        const r = steadyState(twa, wind, sheet, Object.assign({ initialSpeed: 2, seconds: 150 }, opts));
        if (r.capsized) { prev = null; continue; }
        const kn = msToKn(r.u);
        if (prev !== null && prev > SAILING_KN && kn < STOPPED_KN) {
          traps.push({ kind: 'more wind, stopped', twa, sheet, wind, was: prev, now: kn });
        }
        prev = kn;
      }
    }
  }

  return traps;
}

/** Planing hysteresis, reported separately — a feature, and worth seeing. */
export function findPlaningHysteresis(opts) {
  const found = [];
  for (const wind of WINDS) {
    for (const twa of ANGLES) {
      for (const sheet of SHEETS) {
        const slow = steadyState(twa, wind, sheet, Object.assign({ initialSpeed: 0.3, seconds: 150 }, opts));
        const fast = steadyState(twa, wind, sheet, Object.assign({ initialSpeed: 5.0, seconds: 150 }, opts));
        if (slow.capsized || fast.capsized) continue;
        const slowKn = msToKn(slow.u), fastKn = msToKn(fast.u);
        if (slowKn >= STOPPED_KN && fastKn > slowKn * 1.4) {
          found.push({ wind, twa, sheet, displacement: slowKn, planing: fastKn });
        }
      }
    }
  }
  return found;
}

const isMain = process.argv[1] && process.argv[1].endsWith('trap-check.js');
if (isMain) {
  const plane = findPlaningHysteresis();
  if (plane.length) {
    console.log(`\n  Planing hysteresis in ${plane.length} case(s) — this is the feature, ` +
                `not the bug:`);
    for (const p of plane.slice(0, 6)) {
      console.log(`   ${p.wind} m/s  TWA ${p.twa}°  sheet ${p.sheet}: ` +
                  `${p.displacement.toFixed(1)} kn displacing, ${p.planing.toFixed(1)} kn planing`);
    }
    if (plane.length > 6) console.log(`   … and ${plane.length - 6} more`);
  }
  const traps = findTraps();
  if (!traps.length) {
    console.log('\n  No dead-stop locks. Where two states exist they are both sailing ' +
                'states, which is planing hysteresis and intended.\n');
    process.exit(0);
  }
  console.log(`\n  ${traps.length} TRAP(S) FOUND — the boat is bistable, do not ship this tuning:\n`);
  for (const t of traps.slice(0, 25)) {
    if (t.kind === 'dead-stop lock') {
      console.log(`   ${t.wind} m/s  TWA ${t.twa}°  sheet ${t.sheet}: ` +
                  `stopped at ${t.fromSlow.toFixed(2)} kn from slow, ` +
                  `${t.fromFast.toFixed(2)} kn from fast`);
    } else {
      console.log(`   TWA ${t.twa}°  sheet ${t.sheet}: ${t.wind} m/s left her stopped ` +
                  `(${t.was.toFixed(2)} -> ${t.now.toFixed(2)} kn)`);
    }
  }
  if (traps.length > 25) console.log(`   … and ${traps.length - 25} more`);
  console.log();
  process.exit(1);
}
