/* Sound, without shipping a single byte of audio.
 *
 * A start signal has to be a SOUND. Everyone in the room is looking at their
 * own phone at the moment it matters, and a number changing on a television
 * nobody is watching is not a signal. So: two oscillators, a short envelope,
 * and no asset pipeline, no autoplay-blocked <audio> element, and nothing to
 * 404 on a Chromecast.
 *
 * Every call is wrapped. Audio is a garnish and must never be load-bearing:
 * a receiver with the context suspended (no user gesture on a TV) simply
 * stays quiet, and the countdown on screen carries the whole message.
 */

let ctx = null;
let denied = false;

function context() {
  if (denied) return null;
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { denied = true; return null; }
    ctx = new AC();
  } catch (e) { denied = true; return null; }
  return ctx;
}

/** Some platforms only allow audio after a gesture; call this from one. */
export function wakeAudio() {
  const c = context();
  if (c && c.state === 'suspended') { try { c.resume(); } catch (e) { /* ignore */ } }
}

function tone(freq, startAt, seconds, gain, type) {
  const c = context();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sawtooth';
    o.frequency.setValueAtTime(freq, c.currentTime + startAt);
    /* A hard edge on a square wave clicks; ramp both ends. */
    g.gain.setValueAtTime(0.0001, c.currentTime + startAt);
    g.gain.exponentialRampToValueAtTime(gain, c.currentTime + startAt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + startAt + seconds);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + startAt);
    o.stop(c.currentTime + startAt + seconds + 0.05);
  } catch (e) { /* the show goes on in silence */ }
}

/** The gun. Two stacked fifths, because one oscillator sounds like a doorbell. */
export function horn() {
  tone(196, 0, 1.15, 0.22, 'sawtooth');
  tone(294, 0, 1.15, 0.13, 'sawtooth');
  tone(98,  0, 1.30, 0.16, 'square');
}

/** A countdown pip. Short, dry, and quieter than the gun on purpose. */
export function chime(last) {
  if (last) { tone(880, 0, 0.28, 0.17, 'triangle'); return; }
  tone(587, 0, 0.11, 0.10, 'triangle');
}
