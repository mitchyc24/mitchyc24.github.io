/* The M2 gate, as an automated proxy.
 *
 * The milestone's real gate is "someone who has never sailed can get a boat
 * upwind using only the telltale strip". That needs a person. What CAN be
 * checked mechanically is the claim underneath it:
 *
 *   is the telltale band, on its own, a sufficient signal to trim by?
 *
 * So this pilot is deliberately stupid. It reads ONE STRING — 'luffing',
 * 'edge', 'good', 'over', 'stalled' — and nothing else. No angle of attack, no
 * speed, no apparent wind. If it can find and hold the groove and beat to
 * windward on that alone, the strip teaches what it claims to. If it cannot,
 * the bands are wrong and no amount of nice copy will save them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBoat, setInput, step } from '../src/core/boat.js';
import { telltale, TELLTALE, planingState } from '../src/shared/telltales.js';
import { BOATS } from '../src/shared/boats.js';
import { bestAt } from '../tools/polar-sweep.js';
import { deg, rad, wrap } from '../src/shared/angles.js';
import { msToKn } from '../src/shared/units.js';
import { v2 } from '../src/shared/vec2.js';

const FROM = Math.PI / 2;                       // wind from the north
const flow = (s) => v2(-Math.cos(FROM) * s, -Math.sin(FROM) * s);
const B = BOATS.dinghy;

/**
 * Sails for `seconds`, trimming ONLY from the telltale band.
 *
 * Steering is allowed to use the true wind angle, because on a real boat you
 * can see where the wind is from — the burgee, the water, the other boats. The
 * SHEET is the thing the strip has to teach, and that is what is restricted.
 *
 * `thumbRate` is how fast a thumb can move the sheet: the pilot cannot
 * teleport to the right trim any more than a player can.
 */
function pilot(opts) {
  const o = opts || {};
  const targetTwa = o.twa === undefined ? 45 : o.twa;
  const wind = o.wind === undefined ? 6 : o.wind;
  const seconds = o.seconds === undefined ? 120 : o.seconds;
  const thumbRate = o.thumbRate === undefined ? 0.25 : o.thumbRate;   // per second

  const b = createBoat({ theta: FROM - rad(targetTwa) });
  b.v = v2(Math.cos(b.theta) * 2.0, Math.sin(b.theta) * 2.0);

  let sheet = o.startSheet === undefined ? 0.55 : o.startSheet;      // badly eased
  let hiking = 0;
  const dt = 1 / 60;
  const bands = new Set();
  let inGroove = 0, samples = 0;

  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const tt = telltale(b.out, b.cls, b.capsized);
    bands.add(tt.band);

    /* THE ONLY THING THE PILOT KNOWS. act: -1 trim in, 0 hold, +1 ease. */
    sheet = Math.max(0, Math.min(1, sheet + tt.act * thumbRate * dt));

    /* Hiking is allowed off the heel bar — it is a separate instrument and a
     * separate lesson. Without it she simply capsizes in a breeze. */
    hiking = Math.abs(b.out.heelDeg) > 22 ? 1 : 0;

    /* Steer toward the target angle with proportional helm. */
    const twa = deg(wrap(FROM - b.theta));
    const err = twa - targetTwa;
    const r = Math.max(-0.8, Math.min(0.8, -err * 0.05));

    setInput(b, { r, s: sheet, h: hiking });
    step(b, flow(wind), dt, false);

    if (i > 60 * 15) {                    // give her a quarter minute to settle
      samples++;
      if (tt.band === TELLTALE.GOOD) inGroove++;
    }
  }

  const twa = deg(wrap(FROM - b.theta));
  return {
    boat: b,
    sheet,
    speed: b.out.u,
    vmg: b.out.u * Math.cos(rad(twa)),
    twa,
    grooveFraction: samples ? inGroove / samples : 0,
    bandsSeen: bands
  };
}

/* ══════════════════════════════════════════════════════════════════ */

test('a pilot with only the telltale band finds the groove and stays there', () => {
  const r = pilot({ twa: 45, wind: 6, seconds: 120 });
  assert.ok(r.grooveFraction > 0.8,
    `only in the groove ${(r.grooveFraction * 100).toFixed(0)}% of the time — ` +
    'the bands do not converge');
});

test('and it gets there from any starting trim', () => {
  for (const startSheet of [0, 0.2, 0.5, 0.8, 1.0]) {
    const r = pilot({ twa: 45, wind: 6, seconds: 120, startSheet });
    assert.ok(r.grooveFraction > 0.7,
      `starting at sheet ${startSheet} it settled in the groove only ` +
      `${(r.grooveFraction * 100).toFixed(0)}% of the time`);
  }
});

test('trimming by telltale alone gets close to the best trim there is', () => {
  /* The comparison that matters: a player who knows nothing but the strip
   * versus a search over every possible sheet setting. 70 degrees is excluded
   * deliberately and tested on its own below — that is the planing
   * transition, and it is not a trim question. */
  for (const twa of [45, 55, 90, 120, 150]) {
    const r = pilot({ twa, wind: 6, seconds: 120 });
    const best = bestAt(twa, 6, { sheetStep: 0.04 });
    const ratio = r.speed / best.u;
    assert.ok(ratio > 0.74,
      `at ${twa}° the telltale pilot made ${msToKn(r.speed).toFixed(2)} kn ` +
      `against a best of ${msToKn(best.u).toFixed(2)} kn (${(ratio * 100).toFixed(0)}%)`);
  }
});

test('the strip cannot teach planing, and does not pretend to', () => {
  /* At the planing transition there are two stable states at the SAME angle
   * of attack: displacement and planing. A pilot reading only the strip sits
   * happily in the slow one, in a perfect groove, at two thirds of the boat's
   * speed. That is a real limitation of telltales, not a bug — which is why
   * planing gets its own indicator. */
  const r = pilot({ twa: 70, wind: 6, seconds: 120 });
  const best = bestAt(70, 6, { sheetStep: 0.04 });

  assert.ok(r.grooveFraction > 0.8, 'the strip should still say she is trimmed well');
  assert.ok(r.speed < best.u * 0.85,
    'if the telltale pilot now matches best speed here, the drag hump has gone');

  const slow = planingState(r.boat.out, r.boat.cls);
  assert.ok(slow !== 'planing',
    'the slow branch should read as displacing, so the player is told what is missing');
});

test('the planing indicator lights up when she actually gets up', () => {
  const fast = pilot({ twa: 90, wind: 9, seconds: 90 });
  assert.equal(planingState(fast.boat.out, fast.boat.cls), 'planing',
    `at ${msToKn(fast.speed).toFixed(1)} kn on a reach in 9 m/s she should be planing`);
});

test('squared off downwind the strip stops nagging', () => {
  /* A run is drag-driven, so the sail genuinely is stalled — but the sheet is
   * already at the stop and she is going as fast as she can. Telling the
   * player to ease is advice they cannot take. */
  const r = pilot({ twa: 165, wind: 6, seconds: 90, startSheet: 1.0 });
  const band = telltale(r.boat.out, r.boat.cls, r.boat.capsized);
  assert.equal(band.band, TELLTALE.RUNNING,
    `on a run the strip said ${band.band} instead of RUNNING`);
  assert.equal(band.act, 0, 'a running boat should not be told to do anything');

  const best = bestAt(165, 6, { sheetStep: 0.04 });
  assert.ok(r.speed > best.u * 0.88,
    `she should be near best speed on a run (${(r.speed / best.u * 100).toFixed(0)}%)`);
});

test('it actually beats to windward', () => {
  const r = pilot({ twa: 45, wind: 6, seconds: 120 });
  assert.ok(msToKn(r.vmg) > 2.4,
    `made good only ${msToKn(r.vmg).toFixed(2)} kn to windward`);
});

test('it works across the wind range the game will use', () => {
  for (const wind of [4, 6, 9, 12]) {
    const r = pilot({ twa: 50, wind, seconds: 120 });
    assert.ok(r.grooveFraction > 0.65,
      `in ${wind} m/s it held the groove ${(r.grooveFraction * 100).toFixed(0)}% of the time`);
    assert.ok(!r.boat.capsized, `it capsized in ${wind} m/s and never recovered`);
  }
});

test('a slow thumb still finds the groove — it just takes longer', () => {
  /* Nobody moves a sheet instantly, and the bands must not require it. */
  const quick = pilot({ twa: 45, wind: 6, seconds: 120, thumbRate: 0.5 });
  const slow = pilot({ twa: 45, wind: 6, seconds: 120, thumbRate: 0.12 });
  assert.ok(slow.grooveFraction > 0.6,
    `a slow thumb held the groove only ${(slow.grooveFraction * 100).toFixed(0)}% of the time`);
  assert.ok(quick.grooveFraction > 0.6);
});

test('the strip is not stuck on one message — a learner sees the whole range', () => {
  const r = pilot({ twa: 45, wind: 6, seconds: 60, startSheet: 1.0 });
  assert.ok(r.bandsSeen.has(TELLTALE.GOOD), 'never showed the groove');
  assert.ok(r.bandsSeen.size >= 2,
    'the strip only ever showed one state, so it teaches nothing');
});

test('the bands are ordered: easing always moves you toward luffing', () => {
  /* If this were not monotonic, "ease out" would sometimes be the wrong
   * advice and the strip would be actively misleading. */
  const order = [TELLTALE.STALLED, TELLTALE.OVER, TELLTALE.GOOD, TELLTALE.EDGE, TELLTALE.LUFFING];
  const seen = [];
  const b = createBoat({ theta: FROM - rad(60) });
  b.v = v2(Math.cos(b.theta) * 3, Math.sin(b.theta) * 3);

  for (let s = 0; s <= 1.0001; s += 0.02) {
    setInput(b, { r: 0, s, h: 1 });
    for (let i = 0; i < 40; i++) step(b, flow(6), 1 / 60, true);
    const band = telltale(b.out, b.cls, b.capsized).band;
    if (!seen.length || seen[seen.length - 1] !== band) seen.push(band);
  }

  /* Every transition must move forward through the ordering, never back. */
  let idx = -1;
  for (const band of seen) {
    const at = order.indexOf(band);
    assert.ok(at >= 0, `unexpected band ${band}`);
    assert.ok(at > idx, `bands went backwards: ${seen.join(' -> ')}`);
    idx = at;
  }
  assert.ok(seen.includes(TELLTALE.GOOD), `never passed through the groove: ${seen.join(' -> ')}`);
});
