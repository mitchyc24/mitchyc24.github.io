/* Assist levels.
 *
 * THE PHYSICS IS NOT FORKED. There is one force model — the real one — and
 * every level runs it. What changes is a handful of boat constants and a thin
 * layer of help on top of the player's input, both declared here. That matters:
 * a second simplified simulation would drift out of step with the first, and
 * the polar sweep and the emergent-behaviour tests would only cover one of them.
 *
 * Levels are PER PLAYER, so a beginner on arcade sails in the same fleet as
 * someone on strict.
 *
 * They are also SPEED-NEUTRAL by design: assist removes frustration, it does
 * not win races. Auto-trim deliberately aims a little off the optimum, and the
 * offset was measured rather than guessed — see tools/assist-balance.js and the
 * speed-neutrality tests. If a beginner could simply out-sail an expert by
 * switching mode, mixed-ability racing would stop meaning anything and there
 * would be no reason to ever learn the real thing.
 */

export const LEVELS = ['strict', 'assisted', 'arcade'];

export const ASSISTS = {
  /* ── strict ────────────────────────────────────────────────────────
   * The boat as designed. Botch a tack and you sit in irons; let go of the
   * tiller and she wanders; get overpowered and you swim. */
  strict: {
    id: 'strict',
    name: 'Strict',
    blurb: 'The real thing. In irons is real, capsizing is real.',
    autoTrim: 0,        // 0 = none, 1 = fully automatic
    headingHold: 0,     // how hard she holds course with the tiller centred
    trimAssist: 0,      // widens the telltale groove
    boat: {}
  },

  /* ── assisted ──────────────────────────────────────────────────────
   * Every mechanic still there, with the sharp edges filed off. She holds a
   * course when you let go, you can always steer out of irons, and she is
   * considerably harder to put over. You still trim the sail yourself, because
   * that is the actual game. */
  assisted: {
    id: 'assisted',
    name: 'Assisted',
    blurb: 'Holds her course, steers at any speed, much harder to capsize. You still trim.',
    autoTrim: 0,
    headingHold: 0.55,
    trimAssist: 3,
    boat: {
      rudderFloor: 1.4,       // rudder still bites with no way on
      rightingHiked: 2500,
      rightingIn: 1150,
      rightingHull: 800,
      capsizeAngle: 70,
      recoverySeconds: 4,
      Ktrack: 150,            // tracks straighter
      Cyaw: 380,              // calmer helm
      sheetRate: 80
    }
  },

  /* ── arcade ────────────────────────────────────────────────────────
   * Point and go. The sail trims itself, she will not go over, and the tiller
   * is the only thing you have to think about. The wind still matters — you
   * still cannot sail straight into it, because that is the whole point of the
   * game and removing it would leave nothing behind. */
  arcade: {
    id: 'arcade',
    name: 'Arcade',
    blurb: 'The sail trims itself and she will not capsize. Just steer.',
    autoTrim: 1,
    headingHold: 0.85,
    trimAssist: 6,
    boat: {
      rudderFloor: 3.2,
      rightingHiked: 4200,
      rightingIn: 3400,
      rightingHull: 1400,
      capsizeAngle: 84,       // effectively unreachable
      recoverySeconds: 2.5,
      Ktrack: 175,
      Cyaw: 430,
      sheetRate: 130,
      Krud: 190
    }
  }
};

export function levelOf(id) {
  return ASSISTS[id] || ASSISTS.strict;
}

/** How far off the true optimum auto-trim deliberately aims, in degrees of
 *  angle of attack.
 *
 *  MEASURED, not guessed. tools/assist-balance.js sweeps this against a strict
 *  boat sailed well; 12 degrees puts arcade at 99% of that across the points of
 *  sail and both wind strengths. Change it and re-run the tool, or the
 *  speed-neutrality tests will catch you. */
export const AUTOTRIM_OFFSET_DEG = 12;
