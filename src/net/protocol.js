/* Wire protocol.
 *
 * M2 carried real controls and real instruments. M3 adds the lobby: which ring
 * you are standing in, what the room is voting for, and the options that ring
 * carries.
 *
 * Keep this file free of DOM and PeerJS references — it is shared by both ends
 * and stays testable in Node.
 */

export const PROTOCOL_VERSION = 4;

export const T = {
  HELLO:   'hello',   // phone -> host, once
  WELCOME: 'welcome', // host  -> phone, once
  IN:      'in',      // phone -> host, INPUT_HZ, lossy
  ASSIST:  'asst',    // phone -> host, on change
  TEL:     'tel',     // host  -> phone, TEL_HZ
  EVT:     'evt',     // host  -> phone, on event
  ZONE:    'zone',    // host  -> phone, on material change (RELIABLE)
  OPT:     'opt',     // phone -> host, on tap
  START:   'start',   // phone -> host, harbourmaster override
  BYE:     'bye'
};

export function hello(pid, name, hull, assist) {
  return { t: T.HELLO, v: PROTOCOL_VERSION, pid, name, hull, assist };
}

/** Change assist level mid-game. Per player, so a beginner on arcade sails in
 *  the same fleet as someone on strict. */
export function setAssistMsg(level) {
  return { t: T.ASSIST, a: level };
}

export function welcome(slot, hostKind, boat) {
  return { t: T.WELCOME, v: PROTOCOL_VERSION, slot, host: hostKind, boat };
}

/**
 * The two axes and the button, plus a sequence and a timestamp the host echoes
 * back so the phone can measure its own round trip.
 *   r  rudder,   -1 (port) .. +1 (starboard), springs to centre
 *   s  mainsheet, 0 (trimmed in) .. 1 (fully eased), stays where you put it
 *   h  hiking,   0 or 1
 */
export function input(r, s, h, seq, ts) {
  return { t: T.IN, r, s, h, seq, ts };
}

/** Everything the phone's HUD needs. Kept short — this goes out at 10 Hz to
 *  every player, and the field names are the wire format. */
export function telemetry(p) {
  return {
    t: T.TEL,
    seq: p.seq, ts: p.ts, up: p.up,
    sog: r2(p.sog),      // knots
    awa: r0(p.awa),      // degrees, signed: +ve wind from port
    aws: r2(p.aws),      // knots
    twa: r0(p.twa),      // degrees, signed
    vmg: r2(p.vmg),      // knots, +ve to windward
    heel: r0(p.heel),    // degrees, signed: +ve to starboard
    tt: p.tt,            // telltale band, from shared/telltales.js
    pos: p.pos,          // point of sail, named
    tk: p.tk,            // which tack — port or starboard
    pl: p.pl,            // planing state — the lesson telltales cannot teach
    aoa: r0(p.aoa),      // degrees
    cap: p.cap ? 1 : 0,  // capsized
    n: p.n               // players connected
  };
}

/**
 * Lobby state, as one player sees it. Sent only when something MATERIAL
 * changes — the ring you are in, the vote count, the options, the phase, the
 * countdown second. The claim percentage animates on the TV, which is the
 * shared screen and the right place for it; the phone gets the coarse truth.
 *
 * `v` is the payload from lobby.viewFor().
 */
export function zoneMsg(v) {
  return { t: T.ZONE, ph: v.ph, cd: v.cd, ld: v.ld, hm: v.hm ? 1 : 0,
           need: v.need, z: v.z, mo: v.mo, cl: v.cl, vt: v.vt,
           opts: v.opts, ch: v.ch };
}

/** A fingerprint of the parts worth a packet. Compared against the last one
 *  sent to this player, so a still fleet costs nothing. */
export function zoneDigest(v) {
  return [v.ph, v.cd, v.ld, v.hm ? 1 : 0, v.need, v.z, v.vt,
          Math.round(v.cl / 5),                     // 5% buckets: the ring is on the TV
          v.opts ? JSON.stringify(v.opts) : '',
          v.ch ? v.ch.mode : ''].join('|');
}

/** Phone -> host: change a shared option on the ring you are standing in. */
export function optMsg(key, value) {
  return { t: T.OPT, k: key, v: value };
}

/** Phone -> host: the harbourmaster is done waiting. */
export function startMsg() {
  return { t: T.START };
}

/** One-off events worth a buzz on the phone. */
export function event(kind, detail) {
  return { t: T.EVT, k: kind, d: detail };
}

export const EVENTS = {
  CAPSIZE: 'capsize',
  RECOVERED: 'recovered',
  TACK: 'tack',
  GYBE: 'gybe',
  IN_IRONS: 'irons',
  /* Lobby */
  COUNTDOWN: 'countdown',   // d = mode name
  SWITCHED:  'switched',    // d = mode name
  RESOLVED:  'resolved',    // d = one-line description
  REOPEN:    'reopen',
  HORN:      'horn',
  DRIFT:     'drift',       // d = the hint
  HARBOURMASTER: 'hm'
};

export function isValidHello(m) {
  return !!m && m.t === T.HELLO && m.v === PROTOCOL_VERSION &&
         typeof m.pid === 'string' && m.pid.length > 0;
}

/** Clamp anything arriving off the wire before it reaches the simulation.
 *  A controller is untrusted input like any other. */
export function sanitizeInput(m) {
  if (!m || m.t !== T.IN) return null;
  return {
    r: clamp(num(m.r), -1, 1),
    s: clamp(num(m.s), 0, 1),
    h: m.h ? 1 : 0,
    seq: num(m.seq),
    ts: num(m.ts)
  };
}

function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
function r0(x) { return Math.round(num(x)); }
function r2(x) { return Math.round(num(x) * 100) / 100; }
