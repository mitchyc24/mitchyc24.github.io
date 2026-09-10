/* Wire protocol.
 *
 * M2 carries real controls and real instruments. The full protocol (zones,
 * options, phases, results) lands with the lobby in M3.
 *
 * Keep this file free of DOM and PeerJS references — it is shared by both ends
 * and stays testable in Node.
 */

export const PROTOCOL_VERSION = 3;

export const T = {
  HELLO:   'hello',   // phone -> host, once
  WELCOME: 'welcome', // host  -> phone, once
  IN:      'in',      // phone -> host, INPUT_HZ, lossy
  ASSIST:  'asst',    // phone -> host, on change
  TEL:     'tel',     // host  -> phone, TEL_HZ
  EVT:     'evt',     // host  -> phone, on event
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

/** One-off events worth a buzz on the phone. */
export function event(kind, detail) {
  return { t: T.EVT, k: kind, d: detail };
}

export const EVENTS = {
  CAPSIZE: 'capsize',
  RECOVERED: 'recovered',
  TACK: 'tack',
  GYBE: 'gybe',
  IN_IRONS: 'irons'
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
