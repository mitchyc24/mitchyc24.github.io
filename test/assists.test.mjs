/* Assist levels.
 *
 * Two promises are being kept here, and both are easy to break by accident:
 *
 *   1. THE PHYSICS IS NOT FORKED. Strict must behave exactly as it did before
 *      assists existed, or the polar and the emergent-behaviour suite are only
 *      testing one of two games.
 *   2. ASSISTS ARE SPEED-NEUTRAL. Easier, not faster. A beginner on arcade must
 *      not out-sail someone doing it properly, or mixed-ability racing stops
 *      meaning anything.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBoat, setInput, step, setAssist } from '../src/core/boat.js';
import { ASSISTS, LEVELS, AUTOTRIM_OFFSET_DEG } from '../src/shared/assists.js';
import { compare, sail } from '../tools/assist-balance.js';
import { BOATS } from '../src/shared/boats.js';
import { deg, rad, wrap } from '../src/shared/angles.js';
import { msToKn } from '../src/shared/units.js';
import { v2 } from '../src/shared/vec2.js';

const FROM = Math.PI / 2;
const flow = (s) => v2(-Math.cos(FROM) * s, -Math.sin(FROM) * s);

function boatAt(twa, assist, speed) {
  const b = createBoat({ theta: FROM - rad(twa), assist });
  const u = speed === undefined ? 2.5 : speed;
  b.v = v2(Math.cos(b.theta) * u, Math.sin(b.theta) * u);
  return b;
}
const run = (b, secs, wind) => {
  for (let i = 0; i < Math.round(secs * 60); i++) step(b, flow(wind || 6), 1 / 60, false);
  return b;
};

/* ══ the physics is not forked ══════════════════════════════════════ */

test('strict is byte-for-byte the boat that existed before assists', () => {
  const plain = createBoat({ theta: 0.4 });
  assert.equal(plain.assist.id, 'strict');
  for (const k of Object.keys(BOATS.dinghy)) {
    assert.deepEqual(plain.cls[k], BOATS.dinghy[k], `strict changed ${k}`);
  }
  assert.equal(Object.keys(ASSISTS.strict.boat).length, 0,
    'strict must override nothing');
  assert.equal(ASSISTS.strict.autoTrim, 0);
  assert.equal(ASSISTS.strict.headingHold, 0);
});

test('strict input passes through untouched', () => {
  const b = boatAt(60, 'strict');
  setInput(b, { r: 0, s: 0.3, h: 0 });
  run(b, 3);
  /* No auto-trim means the effective sheet is exactly what was asked for. */
  assert.equal(b.out.sheetEff, 0.3);
});

test('every level runs the same force model', () => {
  /* Same wind, same heading, same trim, no assist behaviours engaged
   * (rudder held off-centre so heading hold cannot kick in, and strict/
   * assisted have no auto-trim): the boats differ only by their constants. */
  for (const id of LEVELS) {
    const b = boatAt(90, id);
    setInput(b, { r: 0.4, s: 0.35, h: 1 });
    run(b, 6, 6);
    assert.ok(Number.isFinite(b.out.sog) && b.out.sog > 0.2,
      `${id} did not sail`);
  }
});

/* ══ speed neutrality ═══════════════════════════════════════════════ */

test('arcade is not faster than a well-sailed strict boat', () => {
  for (const wind of [5, 8]) {
    const r = compare(wind);
    assert.ok(r.arcadeMean < 1.06,
      `in ${wind} m/s arcade averaged ${(r.arcadeMean * 100).toFixed(0)}% of ` +
      'strict sailed well — that is a cheat, not an assist. ' +
      `Raise AUTOTRIM_OFFSET_DEG (currently ${AUTOTRIM_OFFSET_DEG}) and re-run ` +
      'tools/assist-balance.js');
    assert.ok(r.arcadeMean > 0.85,
      `in ${wind} m/s arcade averaged ${(r.arcadeMean * 100).toFixed(0)}% — ` +
      'that is a penalty, not an assist');
  }
});

test('assisted is not faster either', () => {
  for (const wind of [5, 8]) {
    const r = compare(wind);
    assert.ok(r.assistedMean < 1.06 && r.assistedMean > 0.85,
      `assisted averaged ${(r.assistedMean * 100).toFixed(0)}% in ${wind} m/s`);
  }
});

test('no single point of sail is a soft spot to exploit', () => {
  const r = compare(6);
  for (const row of r.rows) {
    assert.ok(row.arcadeRatio < 1.2,
      `at ${row.twa}° arcade made ${(row.arcadeRatio * 100).toFixed(0)}% of strict — ` +
      'a beginner could just sail that angle');
  }
});

/* ══ what the assists actually do ═══════════════════════════════════ */

test('assisted and arcade can steer out of irons; strict cannot', () => {
  const turnRate = (id) => {
    const b = boatAt(0, id, 0.05);          // head to wind, no way on
    setInput(b, { r: 1, s: 0.2, h: 0 });
    let peak = 0;
    for (let i = 0; i < 60 * 6; i++) {
      step(b, flow(6), 1 / 60, false);
      peak = Math.max(peak, Math.abs(deg(b.omega)));
    }
    return peak;
  };
  const strict = turnRate('strict');
  assert.ok(strict < 6, `strict turned at ${strict.toFixed(1)}°/s — in irons is not real`);
  assert.ok(turnRate('assisted') > strict * 3, 'assisted should steer with no way on');
  assert.ok(turnRate('arcade') > turnRate('assisted'), 'arcade should be easier still');
});

test('a centred tiller holds the course on assisted, and does not on strict', () => {
  const drift = (id) => {
    const b = boatAt(60, id, 3);
    setInput(b, { r: 0, s: 0.25, h: 1 });   // hands off
    const before = deg(wrap(FROM - b.theta));
    run(b, 20, 7);
    return Math.abs(deg(wrap(FROM - b.theta)) - before);
  };
  const strict = drift('strict');
  const assisted = drift('assisted');
  assert.ok(assisted < 12,
    `assisted wandered ${assisted.toFixed(0)}° with the tiller centred`);
  assert.ok(strict > assisted,
    `strict (${strict.toFixed(0)}°) should wander more than assisted (${assisted.toFixed(0)}°)`);
});

test('arcade will not capsize where strict goes over', () => {
  const over = (id) => {
    const b = boatAt(60, id, 2.5);
    setInput(b, { r: 0, s: 0.15, h: 1 });
    for (let i = 0; i < 60 * 12; i++) step(b, flow(7), 1 / 60, true);
    setInput(b, { r: 0, s: 0.15, h: 0 });   // crew inboard as the gust hits
    for (let i = 0; i < 60 * 20; i++) step(b, flow(16), 1 / 60, true);
    return b.stats.capsizes;
  };
  assert.ok(over('strict') >= 1, 'strict should still go over');
  assert.equal(over('arcade'), 0, 'arcade should stay upright');
});

test('arcade trims the sail for you, and it lands in a sensible place', () => {
  const b = boatAt(60, 'arcade', 2.5);
  setInput(b, { r: 0, s: 0.9, h: 1 });      // ask for a badly eased sheet
  run(b, 25, 6);
  assert.ok(b.out.sheetEff < 0.75,
    `auto-trim ignored the player and should have trimmed in (${b.out.sheetEff.toFixed(2)})`);
  assert.ok(!b.out.luffing, 'auto-trim left the sail luffing');
  assert.ok(msToKn(b.out.sog) > 2.5, 'auto-trim produced a slow boat');
});

test('arcade still cannot sail straight into the wind', () => {
  /* The one thing an assist must never remove: it would leave no game. */
  const b = boatAt(0, 'arcade', 2.0);
  setInput(b, { r: 0, s: 0.3, h: 1 });
  for (let i = 0; i < 60 * 60; i++) step(b, flow(6), 1 / 60, true);
  assert.ok(msToKn(b.out.u) < 1.0,
    `arcade made ${msToKn(b.out.u).toFixed(2)} kn straight upwind`);
});

test('switching level mid-game keeps the boat where it is', () => {
  const b = boatAt(70, 'strict', 3);
  setInput(b, { r: 0, s: 0.3, h: 1 });
  run(b, 6);
  const p = { x: b.p.x, y: b.p.y }, theta = b.theta, sog = b.out.sog;

  setAssist(b, 'arcade');
  assert.equal(b.assist.id, 'arcade');
  assert.deepEqual(b.p, p, 'the boat teleported');
  assert.equal(b.theta, theta, 'the boat spun');
  assert.equal(b.out.sog, sog, 'the boat changed speed');

  run(b, 4);
  assert.ok(Number.isFinite(b.out.sog), 'she stopped working after the switch');
});
