/* The vote.
 *
 * Nobody watches a menu, so the menu is the water: sail into a ring and hold
 * it, and when enough of the room is in the same ring, that is the decision.
 * There is no cursor, no host privilege for the common case, and no moment
 * where the game stops being a sailing game to ask a question.
 *
 * Everything here is pure. It takes positions and a clock, mutates its own
 * state, and returns events. No DOM, no network, no rendering — which is the
 * point, because voting is LOGIC and logic is cheap to be certain about.
 * test/lobby.test.mjs asserts every rule below.
 *
 * The four rules that stop it being griefable:
 *
 *   1. The denominator is ACTIVE players — anyone who has actually moved a
 *      control in the last 30 s. A phone in a pocket is not a vote against.
 *   2. A countdown can only be cancelled by a majority claiming a DIFFERENT
 *      zone. One person leaving cannot stop a room of six.
 *   3. Zones disarm after a decision and only re-arm once their crowd has
 *      dispersed, so boats parked in a ring cannot re-trigger it forever.
 *   4. If nothing at all is claimed for three minutes, the harbour eases the
 *      hardest zone toward the room rather than waiting them out.
 */

import { defaultOptions, validateOption, MODES } from '../shared/modes.js';
import { zoneAt, driftRaceZone } from './harbour.js';

export const PHASE = {
  HARBOUR:   'harbour',      // free sail, zones live
  COUNTDOWN: 'countdown',    // decided, horn pending
  PLACARD:   'placard'       // showing what was chosen
};

export const CLAIM_SECONDS     = 6;    // hold a ring this long with a majority
export const DRAIN_SECONDS     = 10;   // ...and this long to lose it: forgiving,
                                       //    because a luff outside the rim is not
                                       //    a change of mind
export const COUNTDOWN_SECONDS = 10;
export const OVERRIDE_SECONDS  = 3;    // harbourmaster's *Start now* still gets a horn
export const ACTIVE_WINDOW_MS  = 30000;
export const STUCK_SECONDS     = 180;
export const PLACARD_SECONDS   = 8;

/** How many active players it takes. Strictly more than half; an empty room
 *  can never claim anything. */
export function majorityOf(activeCount) {
  if (activeCount <= 0) return Infinity;
  return Math.floor(activeCount / 2) + 1;
}

export function createLobby(harbour) {
  const zones = harbour.zones.map((z) => ({
    id: z.id,
    mode: z.mode,
    claim: 0,
    armed: true,
    voters: [],          // every pid inside, active or not — this is display
    active: 0,           // ...of which this many count toward the majority
    options: defaultOptions(z.mode)
  }));

  const l = {
    phase: PHASE.HARBOUR,
    zones,
    byId: new Map(),
    leader: null,        // zone id being counted down
    countdown: 0,
    placard: 0,
    chosen: null,        // { zone, mode, options } once resolved
    harbourmaster: null,
    need: Infinity,
    activeCount: 0,
    idle: 0,
    hint: ''
  };
  for (const z of zones) l.byId.set(z.id, z);
  return l;
}

/**
 * One step.
 * @param ctx.players [{ pid, p:{x,y}, active:boolean }]
 * @returns array of events
 */
export function stepLobby(lobby, harbour, ctx, dt) {
  const events = [];
  const players = ctx.players || [];

  lobby.activeCount = 0;
  for (const p of players) if (p.active) lobby.activeCount++;
  lobby.need = majorityOf(lobby.activeCount);

  /* ── who is standing in what ───────────────────────────────────── */
  for (const z of lobby.zones) { z.voters = []; z.active = 0; }
  for (const p of players) {
    const hz = zoneAt(harbour, p.p);
    if (!hz) continue;
    const z = lobby.byId.get(hz.id);
    if (!z) continue;
    z.voters.push(p.pid);
    if (p.active) z.active++;
  }

  /* ── fill and drain ────────────────────────────────────────────── */
  for (const z of lobby.zones) {
    const hasMajority = z.active >= lobby.need;

    /* A zone that has just decided something stays inert until its crowd
     * disperses. Without this, six boats sitting in the race ring would
     * re-start the race the instant the placard cleared, forever. */
    if (!z.armed) {
      if (!hasMajority) z.armed = true;
      z.claim = Math.max(0, z.claim - dt / DRAIN_SECONDS);
      continue;
    }

    /* The zone being counted down is committed: freeze it, so its own
     * supporters wandering off does not undo the decision. Rule 2. */
    if (lobby.phase === PHASE.COUNTDOWN && z.id === lobby.leader) { z.claim = 1; continue; }

    if (lobby.phase === PHASE.PLACARD) {
      z.claim = Math.max(0, z.claim - dt / DRAIN_SECONDS);
      continue;
    }

    z.claim += hasMajority ? dt / CLAIM_SECONDS : -dt / DRAIN_SECONDS;
    z.claim = z.claim < 0 ? 0 : (z.claim > 1 ? 1 : z.claim);
  }

  /* ── phases ────────────────────────────────────────────────────── */
  if (lobby.phase === PHASE.HARBOUR) {
    const won = firstFull(lobby, null);
    if (won) {
      beginCountdown(lobby, won.id, COUNTDOWN_SECONDS);
      events.push({ k: 'countdown', zone: won.id, mode: won.mode, seconds: lobby.countdown });
    } else {
      stepIdle(lobby, harbour, dt, events);
    }
  } else if (lobby.phase === PHASE.COUNTDOWN) {
    /* Rule 2, the only cancel there is: somebody else's ring filled. */
    const rival = firstFull(lobby, lobby.leader);
    if (rival) {
      const was = lobby.leader;
      const old = lobby.byId.get(was);
      if (old) { old.claim = 0; old.armed = true; }
      beginCountdown(lobby, rival.id, COUNTDOWN_SECONDS);
      events.push({ k: 'switch', from: was, zone: rival.id, mode: rival.mode,
                    seconds: lobby.countdown });
    } else {
      /* Whole seconds, clamped: Math.ceil of a hair below zero is -0, which
       * looks fine in a log and fails a deepEqual, and would put "-0" on a
       * television. */
      const before = Math.max(0, Math.ceil(lobby.countdown));
      lobby.countdown -= dt;
      const after = Math.max(0, Math.ceil(lobby.countdown));
      if (after !== before) events.push({ k: 'tick', seconds: after });
      if (lobby.countdown <= 0) resolve(lobby, events);
    }
  } else if (lobby.phase === PHASE.PLACARD) {
    lobby.placard -= dt;
    if (lobby.placard <= 0) {
      lobby.phase = PHASE.HARBOUR;
      lobby.placard = 0;
      lobby.leader = null;
      lobby.idle = 0;
      events.push({ k: 'reopen' });
    }
  }

  return events;
}

function firstFull(lobby, exceptId) {
  for (const z of lobby.zones) {
    if (z.id === exceptId || !z.armed) continue;
    if (z.claim >= 1) return z;
  }
  return null;
}

function beginCountdown(lobby, zoneId, seconds) {
  lobby.phase = PHASE.COUNTDOWN;
  lobby.leader = zoneId;
  lobby.countdown = seconds;
  lobby.idle = 0;
  const z = lobby.byId.get(zoneId);
  if (z) z.claim = 1;
}

function resolve(lobby, events) {
  const z = lobby.byId.get(lobby.leader);
  lobby.chosen = z
    ? { zone: z.id, mode: z.mode, options: Object.assign({}, z.options) }
    : null;
  lobby.phase = PHASE.PLACARD;
  lobby.placard = PLACARD_SECONDS;
  lobby.countdown = 0;
  /* Rule 3. Everything disarms, not just the winner — otherwise the losing
   * ring that was at 90% would fire the moment the placard cleared. */
  for (const q of lobby.zones) { q.armed = false; q.claim = q.id === lobby.leader ? 1 : q.claim; }
  events.push({ k: 'resolved', zone: lobby.chosen && lobby.chosen.zone,
                mode: lobby.chosen && lobby.chosen.mode,
                options: lobby.chosen && lobby.chosen.options,
                ready: !!(lobby.chosen && MODES[lobby.chosen.mode] && MODES[lobby.chosen.mode].ready) });
}

/* Rule 4. A room that cannot beat will sit in the harbour forever being
 * cheerful about it, and the game will look broken rather than hard. After
 * three minutes with nothing claimed at all, the race zone eases off the wind
 * until it is a close reach. The beat is not deleted — it is offered again the
 * next time round, and every other zone is untouched. */
function stepIdle(lobby, harbour, dt, events) {
  let peak = 0;
  for (const z of lobby.zones) if (z.claim > peak) peak = z.claim;

  if (peak > 0.02 || lobby.activeCount === 0) { lobby.idle = 0; return; }

  lobby.idle += dt;
  if (lobby.idle >= STUCK_SECONDS && !harbour.drifted) {
    driftRaceZone(harbour);
    lobby.hint = 'Easing the race zone off the wind — reach across to it instead of beating.';
    events.push({ k: 'drift', hint: lobby.hint });
  }
}

/* ── the two things a player can do besides sail ───────────────── */

/**
 * The harbourmaster's override. Deliberately narrow: it can only start what
 * the room is already looking at, and it still fires a countdown, because a
 * race that begins without a horn begins without half the fleet.
 * @param inZoneId the zone the harbourmaster's own boat is sitting in, or null
 */
export function requestStart(lobby, pid, inZoneId) {
  if (!lobby.harbourmaster || pid !== lobby.harbourmaster) return { ok: false, why: 'notyou' };
  if (lobby.phase === PHASE.PLACARD) return { ok: false, why: 'busy' };

  if (lobby.phase === PHASE.COUNTDOWN) {
    lobby.countdown = Math.min(lobby.countdown, 1);
    return { ok: true, why: 'sooner', zone: lobby.leader };
  }

  /* Whatever is furthest along; failing that, whatever they are standing in. */
  let best = null;
  for (const z of lobby.zones) {
    if (!z.armed || z.claim <= 0) continue;
    if (!best || z.claim > best.claim) best = z;
  }
  if (!best && inZoneId) {
    const z = lobby.byId.get(inZoneId);
    if (z && z.armed) best = z;
  }
  if (!best) return { ok: false, why: 'nowhere' };

  beginCountdown(lobby, best.id, OVERRIDE_SECONDS);
  return { ok: true, why: 'started', zone: best.id, mode: best.mode, seconds: lobby.countdown };
}

/**
 * Change an option on a zone. Coarse choice in the world, fine choice on the
 * phone — and shared, so everyone in the ring sees it change under them
 * rather than discovering it at the start gun.
 */
export function setOption(lobby, zoneId, key, value) {
  const z = lobby.byId.get(zoneId);
  if (!z) return false;
  if (lobby.phase === PHASE.COUNTDOWN && z.id === lobby.leader) return false;  // too late
  const v = validateOption(z.mode, key, value);
  if (v === undefined) return false;
  if (z.options[key] === v) return false;
  z.options[key] = v;
  return true;
}

/** The roster changed; make sure somebody is the harbourmaster. */
export function assignHarbourmaster(lobby, orderedPids) {
  if (lobby.harbourmaster && orderedPids.indexOf(lobby.harbourmaster) >= 0) return lobby.harbourmaster;
  lobby.harbourmaster = orderedPids.length ? orderedPids[0] : null;
  return lobby.harbourmaster;
}

/** What one player's phone needs to know. Small on purpose. */
export function viewFor(lobby, pid, inZoneId) {
  const z = inZoneId ? lobby.byId.get(inZoneId) : null;
  return {
    ph: lobby.phase,
    cd: lobby.phase === PHASE.COUNTDOWN ? Math.max(0, Math.ceil(lobby.countdown)) : 0,
    ld: lobby.leader,
    hm: lobby.harbourmaster === pid,
    need: lobby.need === Infinity ? 0 : lobby.need,
    z: z ? z.id : null,
    mo: z ? z.mode : null,
    cl: z ? Math.round(z.claim * 100) : 0,
    vt: z ? z.voters.length : 0,
    opts: z ? z.options : null,
    ch: lobby.phase === PHASE.PLACARD && lobby.chosen ? lobby.chosen : null
  };
}
