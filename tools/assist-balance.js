/* Assist balance.
 *
 *   node tools/assist-balance.js [offsetDeg]
 *
 * Assists are meant to be SPEED-NEUTRAL: easier, not faster. A beginner on
 * arcade should not out-sail someone doing it properly, or mixed-ability
 * racing stops meaning anything and there is no reason to ever learn the real
 * boat.
 *
 * The knob is AUTOTRIM_OFFSET_DEG — how far off the true optimum the automatic
 * sheet deliberately aims. This measures what that costs, against a strict boat
 * sailed WELL (the telltale pilot, which is roughly what a competent player
 * manages), across the points of sail.
 *
 * Target: arcade within a few percent of strict-sailed-well. Comfortably under
 * would mean the assist is a penalty; comfortably over means it is a cheat.
 */

import { createBoat, setInput, step } from '../src/core/boat.js';
import { telltale } from '../src/shared/telltales.js';
import { AUTOTRIM_OFFSET_DEG } from '../src/shared/assists.js';
import { deg, rad, wrap } from '../src/shared/angles.js';
import { msToKn } from '../src/shared/units.js';
import { v2 } from '../src/shared/vec2.js';

const FROM = Math.PI / 2;
const flow = (s) => v2(-Math.cos(FROM) * s, -Math.sin(FROM) * s);

/** Sail at a fixed true wind angle for a while, and report steady speed.
 *  `mode` picks who trims: 'telltale' is a competent human, 'auto' is arcade. */
export function sail(opts) {
  const o = opts || {};
  const twa = o.twa, wind = o.wind === undefined ? 6 : o.wind;
  const b = createBoat({ theta: FROM - rad(twa), assist: o.assist || 'strict' });
  b.v = v2(Math.cos(b.theta) * 2.2, Math.sin(b.theta) * 2.2);

  let sheet = 0.4;
  const dt = 1 / 60;
  for (let i = 0; i < Math.round((o.seconds || 110) / dt); i++) {
    if (o.mode === 'telltale') {
      const tt = telltale(b.out, b.cls, b.capsized, b.assist.trimAssist);
      sheet = Math.max(0, Math.min(1, sheet + tt.act * 0.25 * dt));
    }
    const cur = deg(wrap(FROM - b.theta));
    const r = Math.max(-0.8, Math.min(0.8, -(cur - twa) * 0.05));
    setInput(b, { r, s: sheet, h: Math.abs(b.out.heelDeg) > 22 ? 1 : 0 });
    step(b, flow(wind), dt, false);
  }
  return { u: b.out.u, boat: b };
}

const ANGLES = [45, 55, 70, 90, 120, 150];

export function compare(wind) {
  const rows = [];
  for (const twa of ANGLES) {
    const strict = sail({ twa, wind, assist: 'strict', mode: 'telltale' });
    const assisted = sail({ twa, wind, assist: 'assisted', mode: 'telltale' });
    const arcade = sail({ twa, wind, assist: 'arcade', mode: 'auto' });
    rows.push({
      twa,
      strict: strict.u,
      assisted: assisted.u,
      arcade: arcade.u,
      arcadeRatio: arcade.u / Math.max(0.01, strict.u),
      assistedRatio: assisted.u / Math.max(0.01, strict.u)
    });
  }
  const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  return { rows, arcadeMean: mean('arcadeRatio'), assistedMean: mean('assistedRatio') };
}

const isMain = process.argv[1] && process.argv[1].endsWith('assist-balance.js');
if (isMain) {
  console.log(`\n  Auto-trim offset: ${AUTOTRIM_OFFSET_DEG}° off optimum\n`);
  for (const wind of [5, 8]) {
    const r = compare(wind);
    console.log(`  ── ${msToKn(wind).toFixed(0)} kn of breeze ────────────────────────────`);
    console.log('   TWA   strict   assisted   arcade    arcade vs strict');
    for (const x of r.rows) {
      console.log('  ' + String(x.twa).padStart(4) +
        msToKn(x.strict).toFixed(2).padStart(9) +
        msToKn(x.assisted).toFixed(2).padStart(11) +
        msToKn(x.arcade).toFixed(2).padStart(9) +
        ((x.arcadeRatio * 100).toFixed(0) + '%').padStart(16));
    }
    console.log(`   mean: assisted ${(r.assistedMean * 100).toFixed(0)}% · ` +
                `arcade ${(r.arcadeMean * 100).toFixed(0)}% of a well-sailed strict boat\n`);
  }
}
