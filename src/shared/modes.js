/* What there is to play, and what can be adjusted about it.
 *
 * Shared by both ends: the host uses this to seed and validate options, the
 * phone uses it to draw the panel. Neither hard-codes a mode, so adding one is
 * an entry here and a zone in harbour.js — nothing else.
 *
 * Options are deliberately CHOICES, never sliders. Three or four discrete
 * values fit on a phone as tappable chips, survive a lost packet (the value is
 * the whole state), and stop a room bikeshedding a number.
 */

/** @param key   wire key, kept short — this rides the DataChannel
 *  @param values the only values the host will accept
 *  @param def   index into values */
const opt = (key, name, values, labels, def) => ({ key, name, values, labels, def });

export const MODES = {
  free: {
    id: 'free',
    name: 'Free Sail',
    blurb: 'Open water. No course, no clock.',
    /* Not a zone — free sail IS the harbour, and it is what you are already
     * doing. Listed so the placard and the phone have something to name. */
    zoned: false,
    options: []
  },

  race: {
    id: 'race',
    name: 'Buoy Race',
    blurb: 'Windward-leeward. Beat, run, repeat.',
    zoned: true,
    ready: false,             // the course itself lands in M4
    options: [
      opt('laps', 'Laps', [2, 3, 5], ['2', '3', '5'], 1),
      opt('size', 'Course', ['short', 'standard', 'long'], ['Short', 'Standard', 'Long'], 1),
      opt('wind', 'Wind', [6, 10, 16], ['Light 6kn', 'Medium 10kn', 'Fresh 16kn'], 1)
    ]
  },

  cargo: {
    id: 'cargo',
    name: 'Cargo Run',
    blurb: 'Ferry the load. Heel too far and you lose it.',
    zoned: true,
    ready: false,             // M5
    options: [
      opt('runs', 'Runs', [3, 5, 8], ['3', '5', '8'], 1),
      opt('load', 'Load', ['light', 'heavy'], ['Light', 'Heavy'], 0)
    ]
  },

  squall: {
    id: 'squall',
    name: 'Squall',
    blurb: 'The breeze builds until only one of you is upright.',
    zoned: true,
    ready: false,             // M5
    options: [
      opt('build', 'Build', ['slow', 'fast'], ['Slow', 'Fast'], 0),
      opt('cap', 'Tops out at', [18, 24, 30], ['18 kn', '24 kn', '30 kn'], 1)
    ]
  },

  lessons: {
    id: 'lessons',
    name: 'Sailing School',
    blurb: 'Five guided lessons, from getting going to tacking.',
    zoned: true,
    ready: false,             // M6
    options: [
      opt('lesson', 'Start at', ['start', 'trim', 'upwind', 'tack', 'gybe'],
          ['Getting going', 'Trimming', 'Going upwind', 'Tacking', 'Gybing'], 0)
    ]
  }
};

export const MODE_IDS = Object.keys(MODES);

/** The options a zone starts with. */
export function defaultOptions(modeId) {
  const m = MODES[modeId];
  const out = {};
  if (!m) return out;
  for (const o of m.options) out[o.key] = o.values[o.def];
  return out;
}

/**
 * Accept an option only if the mode declares it and the value is one it
 * offers. Every phone in the room can write these, so they are untrusted
 * input like any other control.
 * @returns the coerced value, or undefined to reject
 */
export function validateOption(modeId, key, value) {
  const m = MODES[modeId];
  if (!m) return undefined;
  for (const o of m.options) {
    if (o.key !== key) continue;
    for (const v of o.values) {
      /* The wire is JSON, so a number can arrive as a string. Compare loosely
       * on purpose, then return OUR value, never theirs. */
      if (String(v) === String(value)) return v;
    }
    return undefined;
  }
  return undefined;
}

/** A one-line summary for the placard: "Buoy Race · 3 laps · Standard". */
export function describe(modeId, options) {
  const m = MODES[modeId];
  if (!m) return String(modeId);
  const bits = [];
  for (const o of m.options) {
    const v = options ? options[o.key] : undefined;
    if (v === undefined) continue;
    for (let i = 0; i < o.values.length; i++) {
      if (String(o.values[i]) === String(v)) { bits.push(o.labels[i]); break; }
    }
  }
  return bits.length ? m.name + ' · ' + bits.join(' · ') : m.name;
}
