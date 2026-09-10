/* Parameter search for the boat constants.
 *
 *   node tools/tune.js
 *
 * Scores candidate constants against what a real two-person dinghy does, using
 * a coarse polar sweep, then reports the best few. Verify the winner at full
 * resolution with tools/polar-sweep.js.
 *
 * The targets are not arbitrary. A dinghy of this size in 12 knots of breeze:
 *   cannot sail closer than roughly 40 degrees to the true wind
 *   makes best progress upwind beating at about 45
 *   is fastest on a beam-to-broad reach, where it planes
 *   is much slower on a dead run, because it is being pushed, not pulled
 */

import { sweep } from './polar-sweep.js';
import { BOATS, withOverrides } from '../src/shared/boats.js';
import { msToKn } from '../src/shared/units.js';

const STEP = Number(process.env.SWEEP_STEP || 10);

const TARGETS = {
  vmgAngle: [42, 48],      // deg, best upwind VMG
  noGo: [33, 42],          // deg, widest angle still making no way
  runRatio: [0.52, 0.66],  // dead run speed as a fraction of max
  maxKn: [6.2, 8.6],       // fastest point of sail, knots
  fastAngle: [80, 125]     // deg, where that peak sits
};

function band(v, [lo, hi]) {
  if (v >= lo && v <= hi) return 0;
  const d = v < lo ? lo - v : v - hi;
  const span = Math.max(1e-6, hi - lo);
  return (d / span) ** 2;
}

function score(cls) {
  const r = sweep(6, { cls: cls.id, step: STEP, sheetStep: 0.04, seconds: 55 });
  const maxKn = msToKn(r.maxSpeed.sog);
  const runKn = msToKn(r.rows[r.rows.length - 1].sog);
  const runRatio = maxKn > 0.1 ? runKn / maxKn : 0;

  const s =
    band(r.bestUp.twa, TARGETS.vmgAngle) * 3.0 +
    band(r.noGo, TARGETS.noGo) * 2.0 +
    band(runRatio, TARGETS.runRatio) * 2.5 +
    band(maxKn, TARGETS.maxKn) * 1.0 +
    band(r.maxSpeed.twa, TARGETS.fastAngle) * 0.8;

  return { s, vmg: r.bestUp.twa, noGo: r.noGo, runRatio, maxKn, fastAngle: r.maxSpeed.twa };
}

/* Coarse-to-fine over the levers that actually move these outcomes:
 *   parasiticCd  raises Cd/Cl at small angles of attack, which is what widens
 *                the no-go zone — drive needs tan(awa) > Cd/Cl to exist
 *   dragPeak     downwind drag ceiling: run speed, barely touches the reach
 *   camberGain   attached-flow lift: reaching and upwind power
 *   waveK        how tall the hump is, i.e. whether it can plane through
 *   LAT_OVER_FWD keel stiffness: how close it can point before sliding
 */
const GRID = {
  parasiticCd: [0.22, 0.26, 0.30, 0.34],
  dragPeak: [1.0],
  camberGain: [2.0, 2.2],
  waveK: [1.7],
  LAT_OVER_FWD: [55],
  keelInduced: [2.4e-3, 4.0e-3, 6.0e-3],
  inducedFloor: [1.0, 2.0]
};

function* candidates() {
  for (const parasiticCd of GRID.parasiticCd)
    for (const dragPeak of GRID.dragPeak)
      for (const camberGain of GRID.camberGain)
        for (const waveK of GRID.waveK)
          for (const LAT_OVER_FWD of GRID.LAT_OVER_FWD)
            for (const keelInduced of GRID.keelInduced)
              for (const inducedFloor of GRID.inducedFloor)
                yield { parasiticCd, dragPeak, camberGain, waveK, LAT_OVER_FWD,
                        keelInduced, inducedFloor };
}

const results = [];
let n = 0;
const total = Object.values(GRID).reduce((a, v) => a * v.length, 1);

for (const ov of candidates()) {
  const cls = withOverrides('dinghy', ov);
  BOATS.__tune = cls; cls.id = '__tune';
  const r = score(cls);
  results.push({ ov, ...r });
  if (++n % 20 === 0) process.stderr.write(`  ${n}/${total}\r`);
}

results.sort((a, b) => a.s - b.s);
console.log(`\n  Searched ${total} combinations. Best 8:\n`);
console.log('  score  pCd  dragPk  camber  waveK  lat/fwd  keelInd  flr | VMG  noGo  run%  maxKn  fast');
console.log('  ' + '─'.repeat(84));
for (const r of results.slice(0, 8)) {
  console.log(
    '  ' + r.s.toFixed(3).padStart(5) +
    r.ov.parasiticCd.toFixed(2).padStart(6) +
    r.ov.dragPeak.toFixed(2).padStart(8) +
    r.ov.camberGain.toFixed(2).padStart(8) +
    r.ov.waveK.toFixed(2).padStart(7) +
    String(r.ov.LAT_OVER_FWD).padStart(9) +
    r.ov.keelInduced.toExponential(1).padStart(9) +
    r.ov.inducedFloor.toFixed(1).padStart(6) + ' |' +
    String(r.vmg).padStart(5) +
    String(r.noGo).padStart(6) +
    (r.runRatio * 100).toFixed(0).padStart(6) +
    r.maxKn.toFixed(2).padStart(7) +
    String(r.fastAngle).padStart(6)
  );
}
console.log('\n  Targets: VMG 42-48°, no-go 33-42°, run 52-66%, max 6.2-8.6 kn, fast 80-125°\n');
