/* Wire protocol — M0 subset.
 *
 * The full protocol is in the plan (§5). M0 carries only what is needed to
 * prove the pipe: a handshake, an input stream, and telemetry back so the
 * phone can measure real round-trip latency.
 *
 * Keep this file free of DOM and PeerJS references — it is shared by both ends
 * and should stay testable in Node.
 */

export const PROTOCOL_VERSION = 0;

export const T = {
  HELLO:   'hello',   // phone -> host, once
  WELCOME: 'welcome', // host  -> phone, once
  IN:      'in',      // phone -> host, INPUT_HZ, lossy
  TEL:     'tel',     // host  -> phone, TEL_HZ
  BYE:     'bye'
};

export function hello(pid, name) {
  return { t: T.HELLO, v: PROTOCOL_VERSION, pid, name };
}

export function welcome(slot, hostKind) {
  return { t: T.WELCOME, v: PROTOCOL_VERSION, slot, host: hostKind };
}

/** r: the one M0 axis, -1..1. seq: monotonic. ts: sender clock, echoed for RTT. */
export function input(r, seq, ts) {
  return { t: T.IN, r, seq, ts };
}

/** Echoes the last seq+ts the host saw, so the phone can compute RTT itself
 *  without the two clocks needing to agree. */
export function telemetry(seq, ts, upSeconds, players) {
  return { t: T.TEL, seq, ts, up: upSeconds, n: players };
}

export function isValidHello(m) {
  return !!m && m.t === T.HELLO && m.v === PROTOCOL_VERSION &&
         typeof m.pid === 'string' && m.pid.length > 0;
}

/** Clamp anything arriving off the wire before it reaches the simulation.
 *  A controller is untrusted input like any other. */
export function sanitizeInput(m) {
  if (!m || m.t !== T.IN) return null;
  const r = Number(m.r);
  return {
    r: Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : 0,
    seq: Number.isFinite(Number(m.seq)) ? Number(m.seq) : 0,
    ts: Number.isFinite(Number(m.ts)) ? Number(m.ts) : 0
  };
}
