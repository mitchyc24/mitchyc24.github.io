/* Telltales — the single highest-value piece of UI in the project.
 *
 * A player learns the mainsheet from this strip and nothing else: no numbers,
 * no reading, just "flapping — trim in" until it goes green. So the bands live
 * HERE, once, and the host, the controller, the dev view and the tests all read
 * the same function. If they ever disagreed, the game would be teaching one
 * thing and rewarding another.
 *
 * The physics behind it: angle of attack is |awa| - sigma, so easing the sheet
 * (bigger sigma) LOWERS the angle of attack toward luffing, and trimming in
 * raises it toward a stall. That is why "too little angle of attack" means
 * trim in, which reads backwards until you have felt it.
 */

import { deg } from './angles.js';

export const TELLTALE = {
  CAPSIZED: 'capsized',
  LUFFING: 'luffing',
  EDGE: 'edge',
  GOOD: 'good',
  OVER: 'over',
  STALLED: 'stalled',
  RUNNING: 'running'
};

/* How far either side of the optimum still counts as being in the groove.
 * Wide enough that a beginner can find it, narrow enough that finding it
 * is worth something. */
export const GROOVE_DEG = 5;

/**
 * @param out   a boat's `out` readouts (aoa in radians, luffing, capsized)
 * @param cls   the boat class, for optimalAoA and stallEnd
 * @returns { band, title, hint, act } where act is -1 trim in, 0 hold, +1 ease
 */
export function telltale(out, cls, capsized) {
  if (capsized) {
    return { band: TELLTALE.CAPSIZED, title: 'CAPSIZED', hint: 'hold on — she is coming up', act: 0 };
  }
  if (out.luffing) {
    return { band: TELLTALE.LUFFING, title: 'LUFFING', hint: 'sail flapping — trim in', act: -1 };
  }

  const aoa = deg(out.aoa);
  const opt = cls.optimalAoA;

  if (aoa > cls.stallEnd) {
    /* Only say "ease" if easing is possible and would help. Squared off on a
     * run the sail IS stalled — a run is drag-driven, that is the physics —
     * but the sheet is already at the stop and the boat is going as fast as
     * she can. Telling the player to ease there is advice they cannot take,
     * and it is why real sailors stop reading telltales downwind. */
    const atTheStop = out.sigma !== undefined && out.sigma >= cls.sheetMaxR * 0.95;
    if (atTheStop || Math.abs(deg(out.awa)) > 120) {
      return { band: TELLTALE.RUNNING, title: 'RUNNING',
               hint: 'squared off — telltales do not apply here', act: 0 };
    }
    return { band: TELLTALE.STALLED, title: 'STALLED', hint: 'way over-trimmed — ease out', act: 1 };
  }
  if (aoa > opt + GROOVE_DEG) {
    return { band: TELLTALE.OVER, title: 'OVER-TRIMMED', hint: 'ease until she stops slowing', act: 1 };
  }
  if (aoa < opt - GROOVE_DEG) {
    return { band: TELLTALE.EDGE, title: 'ON THE EDGE', hint: 'nearly luffing — trim in a touch', act: -1 };
  }
  return { band: TELLTALE.GOOD, title: 'DRAWING WELL', hint: 'that is the groove — hold it', act: 0 };
}

/* ── what the telltales CANNOT tell you ──────────────────────────────
 * Angle of attack is a complete signal for whether the flow is attached, and
 * that is all a telltale ever reports. It is NOT a complete signal for speed,
 * because the drag hump gives two stable states at the same angle of attack:
 * displacement and planing. At a reach you can sit in a perfect groove doing
 * two thirds of what the boat has in her.
 *
 * That is a second lesson, not a broken first one, so it gets its own
 * indicator rather than being smuggled into the strip.
 */
export function planingState(out, cls) {
  const ratio = Math.abs(out.u) / cls.hullSpeed;
  if (ratio > 1.15) return 'planing';
  if (ratio > 0.92) return 'onthehump';   // heavy, dragging her own bow wave
  return 'displacing';
}

/** How good the trim is, 0..1, for the trimQuality stat that M4 will record. */
export function trimQuality(out, cls, capsized) {
  if (capsized || out.luffing) return 0;
  const err = Math.abs(deg(out.aoa) - cls.optimalAoA);
  return Math.max(0, 1 - err / (cls.stallEnd - cls.optimalAoA));
}
