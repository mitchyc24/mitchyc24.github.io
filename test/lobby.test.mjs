/* The harbour lobby.
 *
 * Voting is logic, not feel, which makes it the cheapest thing in the whole
 * project to be certain about — and the most expensive to get wrong, because
 * every failure mode here is a room of six people staring at a TV that will
 * not start. So each rule in claude/architecture.md §10 gets an assertion, and
 * the nasty ones (AFK denominators, cancel races, boats parked in a ring) get
 * two.
 *
 * No DOM, no network, no renderer. Positions in, decisions out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHarbour, zoneAt, berth, stepHarbour, upwind,
         DRIFT_TO_BEARING, harbourBounds } from '../src/core/harbour.js';
import { createLobby, stepLobby, requestStart, setOption, assignHarbourmaster,
         viewFor, majorityOf, PHASE,
         CLAIM_SECONDS, DRAIN_SECONDS, COUNTDOWN_SECONDS, PLACARD_SECONDS,
         STUCK_SECONDS } from '../src/core/lobby.js';
import { MODES, defaultOptions, validateOption, describe as describeMode } from '../src/shared/modes.js';
import { deg, rad, wrap } from '../src/shared/angles.js';

const FROM = Math.PI / 2;                 // wind from the north
const DT = 1 / 20;                        // the lobby runs off the render clock

const harbour = () => createHarbour({ from: FROM });

/** A player standing in the middle of a zone. */
function at(pid, h, zoneId, active) {
  const z = h.byId.get(zoneId);
  return { pid, p: { x: z.p.x, y: z.p.y }, active: active !== false };
}
const adrift = (pid, active) => ({ pid, p: { x: 0, y: -80 }, active: active !== false });

/** Run the lobby for `secs`, collecting every event. */
function run(l, h, players, secs) {
  const events = [];
  const steps = Math.round(secs / DT);
  for (let i = 0; i < steps; i++) {
    stepHarbour(h, DT);
    for (const e of stepLobby(l, h, { players }, DT)) events.push(e);
  }
  return events;
}
const kinds = (evs) => evs.map((e) => e.k);

/* ══ the map is the difficulty curve ════════════════════════════════ */

test('the race zone is dead upwind and nothing else is', () => {
  const h = harbour();
  const u = upwind(FROM);

  const twaTo = (z) => {
    const a = Math.atan2(z.p.y, z.p.x);
    return Math.abs(deg(wrap(a - Math.atan2(u.y, u.x))));
  };

  assert.ok(twaTo(h.byId.get('race')) < 1, 'the race zone is not dead upwind');
  assert.ok(twaTo(h.byId.get('lessons')) > 90,
    'the beginners zone should be a beam reach or freer');
  for (const id of ['cargo', 'squall']) {
    const t = twaTo(h.byId.get(id));
    assert.ok(t > 40 && t < 80, `${id} should be a close reach, got ${t.toFixed(0)} deg`);
  }
});

test('every zone is upwind of the dock — nothing is reachable by drifting', () => {
  const h = harbour();
  const u = upwind(FROM);
  const alongFromDock = (p) => (p.x - h.dock.x) * u.x + (p.y - h.dock.y) * u.y;
  for (const z of h.zones) {
    assert.ok(alongFromDock(z.p) > z.r,
      `${z.id} is not upwind of the dock`);
  }
});

function assertDisjoint(h, when) {
  for (let i = 0; i < h.zones.length; i++) {
    for (let j = i + 1; j < h.zones.length; j++) {
      const a = h.zones[i], b = h.zones[j];
      const d = Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y);
      assert.ok(d > a.r + b.r, `${a.id} and ${b.id} overlap ${when} (${d.toFixed(0)} m apart)`);
    }
  }
}

test('zones do not overlap, so a boat is never voting for two things', () => {
  assertDisjoint(harbour(), 'at rest');
});

/* This is the test that earned its keep. The race zone used to ease onto a
 * close reach, which is exactly where the squall zone already was — so three
 * minutes into a stuck room the race ring slid over the top of a fleet parked
 * in squall, swallowed their positions, and started a race nobody had voted
 * for. It looked like the re-arm guard failing. It was geometry. */
test('zones stay disjoint through the whole drift, not just at rest', () => {
  const h = harbour(), l = createLobby(h);
  const players = [adrift('a')];
  for (let i = 0; i < Math.round((STUCK_SECONDS + 40) / DT); i++) {
    stepHarbour(h, DT);
    stepLobby(l, h, { players }, DT);
    assertDisjoint(h, 'mid-drift');
  }
  assert.equal(h.drifted, true, 'the drift never happened, so this proved nothing');
});

test('berths are on the dock, spread out, and never in a zone', () => {
  const h = harbour();
  const seen = [];
  for (let slot = 0; slot < 8; slot++) {
    const b = berth(h, slot);
    assert.equal(zoneAt(h, b), null, `slot ${slot} spawns inside a zone`);
    for (const p of seen) {
      assert.ok(Math.hypot(p.x - b.x, p.y - b.y) > 6, `slots ${slot} overlap`);
    }
    seen.push(b);
  }
});

test('the harbour fits on a screen', () => {
  const bb = harbourBounds(harbour());
  const w = bb.maxX - bb.minX, hgt = bb.maxY - bb.minY;
  assert.ok(w < 400 && hgt < 400, `harbour is ${w.toFixed(0)}x${hgt.toFixed(0)} m`);
});

/* ══ quorum ═════════════════════════════════════════════════════════ */

test('majority is strictly more than half, and an empty room claims nothing', () => {
  assert.equal(majorityOf(0), Infinity);
  assert.equal(majorityOf(1), 1);
  assert.equal(majorityOf(2), 2);
  assert.equal(majorityOf(3), 2);
  assert.equal(majorityOf(4), 3);
  assert.equal(majorityOf(6), 4);
});

test('nobody in the harbour never starts anything', () => {
  const h = harbour(), l = createLobby(h);
  const evs = run(l, h, [], 400);
  assert.equal(l.phase, PHASE.HARBOUR);
  assert.deepEqual(kinds(evs), []);
});

test('one player alone can hold a ring and start it', () => {
  const h = harbour(), l = createLobby(h);
  const evs = run(l, h, [at('a', h, 'lessons')], CLAIM_SECONDS + 1);
  assert.ok(kinds(evs).includes('countdown'), 'never reached a countdown');
  assert.equal(l.leader, 'lessons');
});

test('a minority holding a ring never claims it', () => {
  const h = harbour(), l = createLobby(h);
  /* One in the ring, three out. need = 3. */
  const players = [at('a', h, 'race'), adrift('b'), adrift('c'), adrift('d')];
  run(l, h, players, 60);
  assert.equal(l.phase, PHASE.HARBOUR);
  assert.equal(l.byId.get('race').claim, 0, 'a minority filled the ring');
});

test('a pocketed phone is not a vote against — it leaves the denominator', () => {
  const h = harbour(), l = createLobby(h);
  /* Two sailing, two idle. If idle phones counted, need would be 3 and the
   * two real players could never start anything. */
  const players = [at('a', h, 'cargo'), at('b', h, 'cargo'),
                   adrift('afk1', false), adrift('afk2', false)];
  run(l, h, players, CLAIM_SECONDS + 1);
  assert.equal(l.activeCount, 2);
  assert.equal(l.need, 2);
  assert.equal(l.leader, 'cargo');
});

test('an idle player still shows as a voter if their boat drifted into a ring', () => {
  const h = harbour(), l = createLobby(h);
  const players = [at('a', h, 'squall'), at('ghost', h, 'squall', false)];
  run(l, h, players, 1);
  const z = l.byId.get('squall');
  assert.equal(z.voters.length, 2, 'the drifting boat should be visible in the ring');
  assert.equal(z.active, 1, 'but it should not count toward the majority');
});

/* ══ fill and drain ═════════════════════════════════════════════════ */

test('the ring fills in CLAIM_SECONDS and no faster', () => {
  const h = harbour(), l = createLobby(h);
  const players = [at('a', h, 'lessons')];
  run(l, h, players, CLAIM_SECONDS * 0.5);
  const half = l.byId.get('lessons').claim;
  assert.ok(half > 0.4 && half < 0.6, `half-way claim was ${half.toFixed(2)}`);
});

test('leaving drains the ring, slower than it filled', () => {
  const h = harbour(), l = createLobby(h);
  const inside = [at('a', h, 'lessons')];
  run(l, h, inside, CLAIM_SECONDS * 0.5);
  const peak = l.byId.get('lessons').claim;

  run(l, h, [adrift('a')], CLAIM_SECONDS * 0.5);
  const after = l.byId.get('lessons').claim;
  assert.ok(after < peak, 'the ring did not drain');
  assert.ok(after > 0, 'a brief excursion outside the rim wiped the whole vote');
});

test('a boat sailing straight through does not claim anything', () => {
  const h = harbour(), l = createLobby(h);
  const z = h.byId.get('lessons');
  /* Crosses the ring at 3 m/s: about 16 s of exposure, but only ~2 s of it
   * inside a 24 m radius at any given moment... so hold it briefly, twice. */
  run(l, h, [at('a', h, 'lessons')], 1.5);
  run(l, h, [adrift('a')], 6);
  run(l, h, [at('a', h, 'lessons')], 1.5);
  assert.ok(l.byId.get(z.id).claim < 0.6, 'a drive-by claimed the ring');
  assert.equal(l.phase, PHASE.HARBOUR);
});

/* ══ countdown and cancellation ═════════════════════════════════════ */

test('a full ring starts a countdown and then resolves with its options', () => {
  const h = harbour(), l = createLobby(h);
  const players = [at('a', h, 'race'), at('b', h, 'race')];
  setOption(l, 'race', 'laps', 5);

  const evs = run(l, h, players, CLAIM_SECONDS + COUNTDOWN_SECONDS + 1);
  const res = evs.find((e) => e.k === 'resolved');
  assert.ok(res, 'never resolved');
  assert.equal(res.mode, 'race');
  assert.equal(res.options.laps, 5, 'the room\'s option was not carried through');
  assert.equal(l.phase, PHASE.PLACARD);
});

test('the countdown ticks down in whole seconds, for the horn', () => {
  const h = harbour(), l = createLobby(h);
  const evs = run(l, h, [at('a', h, 'cargo')], CLAIM_SECONDS + COUNTDOWN_SECONDS + 1);
  const ticks = evs.filter((e) => e.k === 'tick').map((e) => e.seconds);
  assert.deepEqual(ticks, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
});

test('ONE player leaving does not cancel a countdown', () => {
  const h = harbour(), l = createLobby(h);
  /* Three players fill the race ring... */
  const all = [at('a', h, 'race'), at('b', h, 'race'), at('c', h, 'race')];
  run(l, h, all, CLAIM_SECONDS + 0.5);
  assert.equal(l.phase, PHASE.COUNTDOWN);

  /* ...then two of them wander off, leaving one. The vote stands. */
  const evs = run(l, h, [at('a', h, 'race'), adrift('b'), adrift('c')],
                  COUNTDOWN_SECONDS + 1);
  assert.ok(kinds(evs).includes('resolved'), 'a countdown was cancelled by people leaving');
});

test('a majority claiming a DIFFERENT ring is the only thing that cancels', () => {
  const h = harbour(), l = createLobby(h);
  const two = ['a', 'b'];

  run(l, h, two.map((p) => at(p, h, 'race')), CLAIM_SECONDS + 0.5);
  assert.equal(l.leader, 'race');
  assert.equal(l.phase, PHASE.COUNTDOWN);

  /* Both sail across to the lessons ring and hold it. Their new ring fills in
   * 6 s, comfortably inside the 10 s countdown. */
  const evs = run(l, h, two.map((p) => at(p, h, 'lessons')), CLAIM_SECONDS + 0.5);
  const sw = evs.find((e) => e.k === 'switch');
  assert.ok(sw, 'the room could not change its mind');
  assert.equal(sw.from, 'race');
  assert.equal(l.leader, 'lessons');
  assert.equal(l.countdown > 0 && l.countdown <= COUNTDOWN_SECONDS, true,
    'switching should restart the countdown, not inherit the old one');
});

/* ══ re-arming: the parked-boat bug ═════════════════════════════════ */

test('boats parked in a ring cannot re-trigger it the moment the placard clears', () => {
  const h = harbour(), l = createLobby(h);
  const parked = [at('a', h, 'squall'), at('b', h, 'squall')];

  run(l, h, parked, CLAIM_SECONDS + COUNTDOWN_SECONDS + 1);
  assert.equal(l.phase, PHASE.PLACARD);

  /* They never move. Five minutes later, the harbour must still be a harbour. */
  const evs = run(l, h, parked, 300);
  assert.equal(l.phase, PHASE.HARBOUR, 'the same ring fired again with nobody moving');
  assert.equal(l.byId.get('squall').armed, false, 'the ring re-armed with its crowd still in it');
  assert.equal(kinds(evs).filter((k) => k === 'countdown').length, 0);
});

test('a ring re-arms once its crowd disperses, and works again', () => {
  const h = harbour(), l = createLobby(h);
  const parked = [at('a', h, 'squall'), at('b', h, 'squall')];
  run(l, h, parked, CLAIM_SECONDS + COUNTDOWN_SECONDS + PLACARD_SECONDS + 1);
  assert.equal(l.phase, PHASE.HARBOUR);

  run(l, h, [adrift('a'), adrift('b')], DRAIN_SECONDS + 1);
  assert.equal(l.byId.get('squall').armed, true, 'the ring never came back');

  const evs = run(l, h, parked, CLAIM_SECONDS + 1);
  assert.ok(kinds(evs).includes('countdown'), 'a re-armed ring did not fire');
});

test('a ring that was nearly full when another one won does not fire straight after', () => {
  const h = harbour(), l = createLobby(h);
  /* 'a' and 'b' claim lessons; 'c' sits in race the whole time building a
   * claim that must be thrown away when lessons wins. */
  const players = [at('a', h, 'lessons'), at('b', h, 'lessons'), at('c', h, 'race')];
  const evs = run(l, h, players, CLAIM_SECONDS + COUNTDOWN_SECONDS + PLACARD_SECONDS + 6);
  const countdowns = evs.filter((e) => e.k === 'countdown');
  assert.equal(countdowns.length, 1, 'a second countdown started immediately');
  assert.equal(countdowns[0].zone, 'lessons');
});

/* ══ harbourmaster ══════════════════════════════════════════════════ */

test('the first player to join is harbourmaster and inherits on leaving', () => {
  const h = harbour(), l = createLobby(h);
  assert.equal(assignHarbourmaster(l, ['a', 'b', 'c']), 'a');
  assert.equal(assignHarbourmaster(l, ['a', 'b', 'c']), 'a', 'it moved for no reason');
  assert.equal(assignHarbourmaster(l, ['b', 'c']), 'b', 'nobody took over');
  assert.equal(assignHarbourmaster(l, []), null);
});

test('only the harbourmaster can start now', () => {
  const h = harbour(), l = createLobby(h);
  assignHarbourmaster(l, ['a', 'b']);
  run(l, h, [at('a', h, 'cargo'), at('b', h, 'cargo')], 2);
  assert.equal(requestStart(l, 'b', 'cargo').ok, false);
  assert.equal(l.phase, PHASE.HARBOUR);
});

test('start now takes the ring the room is already working on', () => {
  const h = harbour(), l = createLobby(h);
  assignHarbourmaster(l, ['a']);
  run(l, h, [at('a', h, 'cargo')], 2);          // partial claim
  const r = requestStart(l, 'a', 'cargo');
  assert.equal(r.ok, true);
  assert.equal(l.leader, 'cargo');
  assert.equal(l.phase, PHASE.COUNTDOWN);
  assert.ok(l.countdown > 0, 'the override skipped the horn entirely');

  const evs = run(l, h, [at('a', h, 'cargo')], l.countdown + 1);
  assert.ok(kinds(evs).includes('resolved'));
});

test('start now with nothing claimed and nowhere to stand does nothing', () => {
  const h = harbour(), l = createLobby(h);
  assignHarbourmaster(l, ['a']);
  run(l, h, [adrift('a')], 2);
  assert.deepEqual(requestStart(l, 'a', null), { ok: false, why: 'nowhere' });
  assert.equal(l.phase, PHASE.HARBOUR);
});

test('start now during a countdown shortens it rather than restarting it', () => {
  const h = harbour(), l = createLobby(h);
  assignHarbourmaster(l, ['a']);
  run(l, h, [at('a', h, 'lessons')], CLAIM_SECONDS + 0.5);
  assert.equal(l.phase, PHASE.COUNTDOWN);
  const before = l.countdown;
  const r = requestStart(l, 'a', 'lessons');
  assert.equal(r.why, 'sooner');
  assert.ok(l.countdown < before);
});

/* ══ options ════════════════════════════════════════════════════════ */

test('options start at their defaults and only accept offered values', () => {
  const h = harbour(), l = createLobby(h);
  assert.deepEqual(l.byId.get('race').options, defaultOptions('race'));

  assert.equal(setOption(l, 'race', 'laps', 5), true);
  assert.equal(l.byId.get('race').options.laps, 5);

  assert.equal(setOption(l, 'race', 'laps', 99), false, 'accepted a value it never offered');
  assert.equal(setOption(l, 'race', 'nonsense', 1), false, 'accepted an unknown key');
  assert.equal(setOption(l, 'race', 'lesson', 'start'), false, 'accepted another mode\'s option');
  assert.equal(l.byId.get('race').options.laps, 5, 'a rejected write changed something');
});

test('a number arriving from JSON as a string is coerced, not rejected', () => {
  assert.equal(validateOption('race', 'laps', '3'), 3);
  assert.equal(typeof validateOption('race', 'laps', '3'), 'number');
});

test('options are frozen once that ring is counting down', () => {
  const h = harbour(), l = createLobby(h);
  run(l, h, [at('a', h, 'race')], CLAIM_SECONDS + 0.5);
  assert.equal(l.phase, PHASE.COUNTDOWN);
  assert.equal(setOption(l, 'race', 'laps', 5), false, 'changed the rules after the horn');
  assert.equal(setOption(l, 'cargo', 'load', 'heavy'), true,
    'froze a ring that was not the one starting');
});

test('every mode describes itself for the placard', () => {
  for (const id of Object.keys(MODES)) {
    const s = describeMode(id, defaultOptions(id));
    assert.ok(s.length > 0 && s.startsWith(MODES[id].name), `${id} describes badly: ${s}`);
  }
  assert.equal(describeMode('race', { laps: 5, size: 'long', wind: 16 }),
               'Buoy Race · 5 · Long · Fresh 16kn');
});

/* ══ the stuck rule ═════════════════════════════════════════════════ */

test('three minutes of nobody claiming anything eases the race zone off the wind', () => {
  const h = harbour(), l = createLobby(h);
  const u = upwind(FROM);
  const bearing = () => Math.abs(deg(wrap(
    Math.atan2(h.byId.get('race').p.y, h.byId.get('race').p.x) - Math.atan2(u.y, u.x))));

  assert.ok(bearing() < 1, 'did not start dead upwind');

  const evs = run(l, h, [adrift('a'), adrift('b')], STUCK_SECONDS + 30);
  assert.ok(kinds(evs).includes('drift'), 'the harbour never gave in');
  assert.ok(Math.abs(bearing() - Math.abs(DRIFT_TO_BEARING)) < 3,
    `race zone eased to ${bearing().toFixed(0)} deg off the wind, ` +
    `wanted ${Math.abs(DRIFT_TO_BEARING)}`);
  assert.ok(bearing() > 80, 'it should be a reach now, not still a beat');
});

test('the drift never fires while people are getting somewhere', () => {
  const h = harbour(), l = createLobby(h);
  /* One player dipping into a ring and falling out again — the room is
   * trying and failing, which is not the same as the room being stuck. */
  let evs = [];
  for (let i = 0; i < 14; i++) {
    evs = evs.concat(run(l, h, [at('a', h, 'race')], 3));
    evs = evs.concat(run(l, h, [adrift('a')], 12));
  }
  assert.ok(l.idle < STUCK_SECONDS, `idle reached ${l.idle.toFixed(0)}s`);
  assert.equal(kinds(evs).includes('drift'), false, 'gave up on a room that was trying');
  assert.equal(kinds(evs).includes('countdown'), false, 'dipping in and out claimed a ring');
});

test('the drift never fires in an empty harbour', () => {
  const h = harbour(), l = createLobby(h);
  run(l, h, [], STUCK_SECONDS + 60);
  assert.equal(h.drifted, false, 'moved the furniture with nobody in the room');
});

test('easing the race zone leaves every other zone alone', () => {
  const h = harbour(), l = createLobby(h);
  const before = h.zones.filter((z) => z.id !== 'race').map((z) => ({ ...z.p }));
  run(l, h, [adrift('a')], STUCK_SECONDS + 20);
  const after = h.zones.filter((z) => z.id !== 'race').map((z) => ({ ...z.p }));
  assert.deepEqual(after, before);
});

/* ══ what the phone is told ═════════════════════════════════════════ */

test('the view tells a player what they need and nothing they do not', () => {
  const h = harbour(), l = createLobby(h);
  assignHarbourmaster(l, ['a', 'b']);
  /* 'b' is on the beach with the phone in a pocket, so 'a' alone is the
   * quorum and the ring actually fills. */
  run(l, h, [at('a', h, 'race'), adrift('b', false)], 2);

  const hm = viewFor(l, 'a', 'race');
  assert.equal(hm.hm, true);
  assert.equal(hm.z, 'race');
  assert.equal(hm.mo, 'race');
  assert.ok(hm.cl > 0 && hm.cl <= 100);
  assert.deepEqual(hm.opts, l.byId.get('race').options);

  const other = viewFor(l, 'b', null);
  assert.equal(other.hm, false);
  assert.equal(other.z, null);
  assert.equal(other.opts, null, 'sent options to somebody not in the ring');
});

test('an empty room reports a need of zero rather than Infinity down the wire', () => {
  const h = harbour(), l = createLobby(h);
  run(l, h, [], 1);
  assert.equal(viewFor(l, 'nobody', null).need, 0);
  assert.equal(JSON.parse(JSON.stringify(viewFor(l, 'nobody', null))).need, 0);
});

/* ══ the wind, still said in English ═════════════════════════════════ */

test('the wind gets an adjective, not a compass point with -erly glued on', async () => {
  const { windAdjective, windFromName } = await import('../src/shared/compass.js');
  const TAU = Math.PI * 2;
  assert.equal(windAdjective(Math.PI / 2), 'Northerly');
  assert.equal(windAdjective(0), 'Easterly');
  assert.equal(windAdjective(Math.PI), 'Westerly');
  assert.equal(windAdjective(-Math.PI / 2), 'Southerly');
  assert.equal(windAdjective(rad(45)), 'North-easterly');

  /* The sixteen-point names collapse onto the eight that have adjectives.
   * Gluing the suffix on used to produce NERLY and SSWERLY. */
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * TAU - Math.PI;
    const adj = windAdjective(a);
    assert.ok(/erly$/.test(adj), `${windFromName(a)} became "${adj}"`);
    assert.ok(!/^[NSEW]{1,3}erly/i.test(adj), `${windFromName(a)} became "${adj}"`);
  }
});
