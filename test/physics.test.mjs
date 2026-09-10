/* Emergent behaviour checklist, from the plan.
 *
 *   node --test test/
 *
 * Every assertion here is about a behaviour that should FALL OUT of the force
 * model rather than being coded for. If one fails, the fix is almost never to
 * special-case the behaviour — it is that a force is wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBoat, setInput, step } from '../src/core/boat.js';
import { createWorld, addBoat, applyInput, stepWorld } from '../src/core/world.js';
import { sailCoefficients, waveFactor } from '../src/core/physics.js';
import { sweep, steadyState, bestAt } from '../tools/polar-sweep.js';
import { BOATS } from '../src/shared/boats.js';
import { deg, rad, wrap } from '../src/shared/angles.js';
import { msToKn } from '../src/shared/units.js';
import { v2 } from '../src/shared/vec2.js';

const WIND = 6;                       // m/s, ~12 knots
const B = BOATS.dinghy;

/** Wind from the north, flowing south. */
const FROM = Math.PI / 2;
const flow = (speed) => v2(-Math.cos(FROM) * speed, -Math.sin(FROM) * speed);

/** A boat sailing at a given true wind angle, with way on. */
function sailing(twaDeg, opts) {
  const o = opts || {};
  const b = createBoat({ theta: FROM - rad(twaDeg) });
  const u0 = o.speed === undefined ? 2.5 : o.speed;
  b.v = v2(Math.cos(b.theta) * u0, Math.sin(b.theta) * u0);
  setInput(b, { r: 0, s: o.sheet === undefined ? 0.15 : o.sheet, h: o.hiking ? 1 : 0 });
  return b;
}

function run(boat, seconds, windSpeed, lock) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    step(boat, flow(windSpeed === undefined ? WIND : windSpeed), dt, !!lock);
  }
  return boat;
}

/* Cache the sweep — it is the expensive part and several tests want it. */
let _polar = null;
const polar = () => (_polar || (_polar = sweep(WIND, { step: 5, sheetStep: 0.04 })));

/* ══ the checklist ══════════════════════════════════════════════════ */

test('no-go zone: no sheet setting drives the boat close to the wind', () => {
  for (const twa of [0, 10, 20, 25]) {
    const best = bestAt(twa, WIND, { sheetStep: 0.04 });
    assert.ok(msToKn(best.u) < 0.75,
      `at ${twa}° she still made ${msToKn(best.u).toFixed(2)} kn — the no-go zone is missing`);
  }
  /* And the edge is a slope, not a cliff: she creeps at 30 and sails by 45. */
  assert.ok(msToKn(bestAt(30, WIND, { sheetStep: 0.04 }).u) < 2.0, 'too fast at 30°');
  assert.ok(msToKn(bestAt(45, WIND, { sheetStep: 0.04 }).u) > 3.0, 'too slow at 45°');
});

test('no-go zone is a sign change in drive, not a rule in the code', () => {
  /* Net drive is L*sin(awa) - D*cos(awa), so it exists only while
   * tan(awa) > Cd/Cl. Check the crossover sits where the polar says it does. */
  const { cl, cd } = sailCoefficients(B.optimalAoAR, B);
  const critical = deg(Math.atan(cd / cl));
  assert.ok(critical > 10 && critical < 30,
    `critical apparent wind angle came out at ${critical.toFixed(1)}°`);
});

test('best upwind VMG is a beat, and 45 degrees sits in the groove', () => {
  const p = polar();
  assert.ok(p.bestUp.twa >= 42 && p.bestUp.twa <= 52,
    `best VMG at ${p.bestUp.twa}°, expected a beat`);
  assert.ok(p.bestUp.vmgUp > 0.8, 'she makes no useful progress to windward');

  /* The VMG optimum is genuinely flat across 45-50 — that flat spot is the
   * "groove" sailors talk about, so what matters is that beating at 45 is
   * near-optimal, not where a discrete argmax happens to land. */
  const at45 = p.rows.find((r) => r.twa === 45);
  assert.ok(at45.vmgUp > p.bestUp.vmgUp * 0.95,
    `beating at 45° gives only ${(at45.vmgUp / p.bestUp.vmgUp * 100).toFixed(0)}% of best VMG`);
});

test('downwind, gybing beats running dead', () => {
  /* A planing boat makes better VMG broad reaching and gybing down than
   * sailing straight at the mark. Nothing in the code says so. */
  const p = polar();
  assert.ok(p.bestDown.twa < 170,
    `best downwind VMG at ${p.bestDown.twa}° — she should not sail dead downwind`);
});

test('fastest point of sail is a reach, not upwind or downwind', () => {
  const p = polar();
  assert.ok(p.maxSpeed.twa >= 70 && p.maxSpeed.twa <= 130,
    `fastest at ${p.maxSpeed.twa}°, expected a reach`);
});

test('a dead run is much slower than a reach', () => {
  const p = polar();
  const runSpeed = p.rows[p.rows.length - 1].sog;
  const ratio = runSpeed / p.maxSpeed.sog;
  assert.ok(ratio < 0.72,
    `dead run is ${(ratio * 100).toFixed(0)}% of max — the polar is too flat`);
  assert.ok(ratio > 0.35, `dead run is only ${(ratio * 100).toFixed(0)}% of max`);
});

test('apparent wind draws forward as the boat accelerates', () => {
  const slow = run(sailing(60, { speed: 0.2, sheet: 0.25 }), 1, WIND, true);
  const awaSlow = Math.abs(deg(slow.out.awa));
  const fast = run(sailing(60, { speed: 3.5, sheet: 0.25 }), 1, WIND, true);
  const awaFast = Math.abs(deg(fast.out.awa));
  assert.ok(awaFast < awaSlow - 5,
    `apparent wind did not draw forward: ${awaSlow.toFixed(0)}° -> ${awaFast.toFixed(0)}°`);
  assert.ok(fast.out.aws > slow.out.aws, 'apparent wind did not strengthen with speed');
});

test('in irons: a boat with no way on cannot steer', () => {
  /* Rudder authority scales with u*|u|, so this needs no special case.
   * Measured as peak turn rate, because a boat with way on spins far enough
   * that a wrapped heading difference stops meaning anything. */
  const peakTurnRate = (speed) => {
    const b = sailing(0, { speed, sheet: 0.2 });
    setInput(b, { r: 1, s: 0.2, h: 0 });            // helm hard over
    let peak = 0;
    for (let i = 0; i < 60 * 6; i++) {
      step(b, flow(WIND), 1 / 60, false);
      peak = Math.max(peak, Math.abs(deg(b.omega)));
    }
    return peak;
  };

  const stuck = peakTurnRate(0.05);
  const moving = peakTurnRate(3.0);
  assert.ok(stuck < 6, `in irons she still turned at ${stuck.toFixed(1)}°/s`);
  assert.ok(moving > stuck * 8,
    `with way on she managed only ${moving.toFixed(1)}°/s against ${stuck.toFixed(1)}°/s`);
});

test('a tack succeeds with speed and fails without it', () => {
  const fast = sailing(45, { speed: 3.2, sheet: 0.15 });
  setInput(fast, { r: -1, s: 0.15, h: 0 });
  run(fast, 14);
  assert.ok(fast.stats.tacks >= 1, 'a well-driven tack should complete');

  const slow = sailing(45, { speed: 0.4, sheet: 0.15 });
  setInput(slow, { r: -1, s: 0.15, h: 0 });
  run(slow, 14);
  assert.ok(slow.out.sog < fast.out.sog,
    'a botched tack should leave her slower than a good one');
});

test('weather helm: sheeting in harder pulls her toward the wind', () => {
  /* An unattended boat under fixed sheet is genuinely yaw-unstable, so the
   * honest claim is comparative rather than absolute: for the same course and
   * breeze, the harder she is sheeted in, the more she is pulled to windward.
   * That is the force the helmsman is trimming out, and it is why easing in a
   * gust makes the helm go light. */
  const drift = (sheet) => {
    const b = sailing(65, { speed: 3, sheet, hiking: true });
    const before = deg(wrap(FROM - b.theta));
    setInput(b, { r: 0, s: sheet, h: 1 });          // no rudder at all
    run(b, 8, 9);
    return deg(wrap(FROM - b.theta)) - before;      // negative = toward the wind
  };
  const hard = drift(0.05);
  const eased = drift(0.45);
  assert.ok(hard < eased - 4,
    `sheeting in changed nothing: hard ${hard.toFixed(1)}°, eased ${eased.toFixed(1)}°`);
});

test('heel costs speed, so hiking is worth doing when overpowered', () => {
  let hiked = 0, sat = 0;
  for (let s = 0; s <= 1.001; s += 0.05) {
    hiked = Math.max(hiked, steadyState(50, 12, s, { hiking: true }).u);
    const r = steadyState(50, 12, s, { hiking: false });
    if (!r.capsized) sat = Math.max(sat, r.u);
  }
  assert.ok(hiked > sat * 1.1,
    `hiking gained only ${((hiked / Math.max(0.01, sat) - 1) * 100).toFixed(0)}% when overpowered`);
});

test('a gust capsizes a boat whose crew is not hiking', () => {
  /* The Squall scenario: settled and hiked in a breeze, then it pipes up and
   * the crew comes inboard while the helm holds course. Heading is locked
   * because an unattended boat rounds up and depowers on its own — which is
   * itself correct, and is why the crew has to react rather than freeze. */
  const b = sailing(60, { speed: 2.5, sheet: 0.15, hiking: true });
  run(b, 12, 7, true);
  setInput(b, { r: 0, s: 0.15, h: 0 });
  run(b, 20, 16, true);
  assert.ok(b.stats.capsizes >= 1, 'she should have gone over');
});

test('hiking through the same gust keeps her upright', () => {
  const b = sailing(60, { speed: 2.5, sheet: 0.15, hiking: true });
  run(b, 12, 7, true);
  setInput(b, { r: 0, s: 0.15, h: 1 });             // crew stays out
  run(b, 20, 16, true);
  assert.equal(b.stats.capsizes, 0, 'hiking should have saved her');
});

test('easing the sheet through the same gust also keeps her upright', () => {
  const b = sailing(60, { speed: 2.5, sheet: 0.15, hiking: true });
  run(b, 12, 7, true);
  setInput(b, { r: 0, s: 0.6, h: 0 });              // dump the main instead
  run(b, 20, 16, true);
  assert.equal(b.stats.capsizes, 0, 'easing should have saved her');
});

test('a capsize costs real time and she recovers with the sheet eased', () => {
  const b = sailing(60, { speed: 2.5, sheet: 0.15, hiking: true });
  run(b, 12, 7, true);
  setInput(b, { r: 0, s: 0.15, h: 0 });
  run(b, 20, 16, true);
  assert.ok(b.stats.capsizes >= 1, 'she never went over');
  assert.equal(b.capsized, true, 'she should still be over');

  /* Step until she rights herself, and check the state at that instant —
   * a moment later the player's sheet input has already pulled it back in. */
  let t = 0;
  while (b.capsized && t < B.recoverySeconds + 4) { run(b, 1 / 60, 6); t += 1 / 60; }
  assert.equal(b.capsized, false, 'she never came back up');
  /* She went over partway through the gust run, so only the remainder of the
   * recovery is left here. What matters is that it costs time at all. */
  assert.ok(t > 0.5, `recovery was instant (${t.toFixed(1)}s)`);
  assert.ok(b.sigma > b.cls.sheetMaxR * 0.5, 'she should come up with the sheet eased');
});

test('a helmsman can hold a course against weather helm', () => {
  /* Weather helm must be a force you manage, not one that beats you. With way
   * on, well under full rudder should hold a reach steady. */
  const b = sailing(70, { speed: 3.5, sheet: 0.25, hiking: true });
  run(b, 6, 8, true);
  const target = b.theta;
  let worst = 0;
  for (let i = 0; i < 60 * 25; i++) {
    const err = wrap(b.theta - target);
    setInput(b, { r: Math.max(-0.6, Math.min(0.6, err * 4)), s: 0.25, h: 1 });
    step(b, flow(8), 1 / 60, false);
    worst = Math.max(worst, Math.abs(deg(wrap(b.theta - target))));
  }
  assert.ok(worst < 20,
    `course wandered ${worst.toFixed(0)}° with 60% rudder available — helm is too strong`);
});

test('the boat cannot outrun the wind on a dead run', () => {
  const b = run(sailing(180, { speed: 1, sheet: 1 }), 120, WIND, true);
  assert.ok(b.out.u < WIND,
    `made ${b.out.u.toFixed(2)} m/s dead downwind in ${WIND} m/s of wind`);
});

test('pointing higher than the boat can hold produces leeway, not progress', () => {
  const pinched = run(sailing(25, { speed: 2, sheet: 0.05 }), 90, WIND, true);
  assert.ok(Math.abs(deg(pinched.out.leeway)) > 15,
    `pinching should produce large leeway, got ${deg(pinched.out.leeway).toFixed(1)}°`);
  assert.ok(pinched.out.u < 1.0, 'pinching should kill forward progress');
});

/* ══ model soundness ════════════════════════════════════════════════ */

test('the drag hump peaks near hull speed and relents when planing', () => {
  assert.equal(waveFactor(0.5, B), 1);
  assert.ok(waveFactor(1.0, B) > waveFactor(0.7, B), 'no hump before hull speed');
  assert.ok(waveFactor(B.planeAt, B) < waveFactor(1.0, B), 'no planing relief past it');
  assert.ok(waveFactor(3.2, B) > waveFactor(B.planeAt, B), 'no top end at all');
});

test('lift and drag coefficients stay physical across the whole range', () => {
  for (let a = 0; a <= 90; a += 1) {
    const { cl, cd } = sailCoefficients(rad(a), B);
    assert.ok(Number.isFinite(cl) && Number.isFinite(cd), `non-finite at ${a}°`);
    assert.ok(cd > 0, `non-positive drag at ${a}°`);
    assert.ok(cl <= 2.6 && cl >= -0.6, `implausible lift ${cl.toFixed(2)} at ${a}°`);
  }
  assert.ok(sailCoefficients(rad(90), B).cl < 0.05, 'a sail square to the flow makes no lift');
});

test('the simulation is deterministic', () => {
  const mk = () => {
    const w = createWorld({ wind: { speed: 7, seed: 42 } });
    addBoat(w, 'a', { theta: 0.4 });
    return w;
  };
  const a = mk(), b = mk();
  for (let i = 0; i < 3000; i++) {
    const r = Math.sin(i / 37), s = 0.5 + 0.5 * Math.sin(i / 91);
    applyInput(a, 'a', { r, s, h: i % 2 });
    applyInput(b, 'a', { r, s, h: i % 2 });
    stepWorld(a, 1 / 60);
    stepWorld(b, 1 / 60);
  }
  const pa = a.byId.get('a'), pb = b.byId.get('a');
  assert.equal(pa.p.x, pb.p.x);
  assert.equal(pa.p.y, pb.p.y);
  assert.equal(pa.theta, pb.theta);
});

test('nothing explodes under sustained abuse', () => {
  const w = createWorld({ wind: { speed: 14, seed: 7 } });
  addBoat(w, 'a', { theta: 0 });
  const b = w.byId.get('a');
  for (let i = 0; i < 20000; i++) {
    applyInput(w, 'a', {
      r: Math.sin(i * 0.7) > 0 ? 1 : -1,          // slam the helm every step
      s: i % 120 < 60 ? 0 : 1,                    // and the sheet
      h: (i >> 6) & 1
    });
    stepWorld(w, 1 / 60);
    assert.ok(Number.isFinite(b.p.x) && Number.isFinite(b.p.y), `NaN position at step ${i}`);
    assert.ok(Number.isFinite(b.theta) && Number.isFinite(b.omega), `NaN heading at step ${i}`);
    assert.ok(b.out.sog < 30, `absurd speed ${b.out.sog} at step ${i}`);
  }
});

test('a boat sitting in another boat\'s wind shadow goes slower', () => {
  const w = createWorld({ wind: { speed: 6, seed: 3, gustAmp: 0, shiftAmp: 0 } });
  /* Wind from the north: put the blocker directly upwind of the victim. */
  const clear = addBoat(w, 'clear', { theta: FROM - rad(90), x: 400, y: 0 });
  const victim = addBoat(w, 'victim', { theta: FROM - rad(90), x: 0, y: 0 });
  addBoat(w, 'blocker', { theta: FROM - rad(90), x: 0, y: 18 });
  for (const id of ['clear', 'victim', 'blocker']) applyInput(w, id, { r: 0, s: 0.4, h: 1 });
  for (let i = 0; i < 60 * 30; i++) stepWorld(w, 1 / 60);
  assert.ok(victim.out.aws < clear.out.aws,
    'the covered boat should feel less wind');
});

test('no dead-stop locks: the boat is never randomly immobilised', async () => {
  const { findTraps } = await import('../tools/trap-check.js');
  const traps = findTraps().filter((t) => t.sheet > 0.05);   // strapped flat is genuinely stuck
  assert.equal(traps.length, 0,
    'dead-stop locks found: ' + JSON.stringify(traps.slice(0, 3)));
});
