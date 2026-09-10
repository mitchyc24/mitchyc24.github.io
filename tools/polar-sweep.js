/* Headless polar sweep.
 *
 *   node tools/polar-sweep.js [windSpeed_ms] [--json] [--csv]
 *
 * For each true wind angle, locks the heading, sweeps the sheet to find the
 * best trim, runs to steady state and records the speed. That gives the polar
 * curve, the best upwind VMG angle, and where the boat is fastest.
 *
 * This is how the physics gets tuned. Squinting at a boat on a TV tells you
 * almost nothing; this tells you the model is right before any pixels exist.
 */

import { createBoat, setInput, step } from '../src/core/boat.js';
import { v2 } from '../src/shared/vec2.js';
import { deg, rad } from '../src/shared/angles.js';
import { msToKn } from '../src/shared/units.js';

/** Steady-state speed at one true wind angle and one sheet setting.
 *  Heading is locked, so the boat genuinely holds that angle. */
export function steadyState(twaDeg, windSpeed, sheet, opts) {
  const o = opts || {};
  const hiking = o.hiking === undefined ? true : o.hiking;

  /* Wind from the north: comes from +90 deg, so it flows south. */
  const windFrom = Math.PI / 2;
  const flow = v2(-Math.cos(windFrom) * windSpeed, -Math.sin(windFrom) * windSpeed);

  /* Heading such that the true wind sits twaDeg off the bow, on the port side. */
  const boat = createBoat({ cls: o.cls, theta: windFrom - rad(twaDeg) });
  setInput(boat, { r: 0, s: sheet, h: hiking ? 1 : 0 });

  /* Start with way on. A real polar is measured from a boat already sailing,
   * not from a standing start — and starting from rest measures something
   * different and less useful: whether the boat can accelerate out of irons,
   * which is a hysteresis question, not a steady-state one. Pass
   * initialSpeed: 0 to probe that deliberately. */
  const u0 = o.initialSpeed === undefined ? 2.0 : o.initialSpeed;
  boat.v = { x: Math.cos(boat.theta) * u0, y: Math.sin(boat.theta) * u0 };

  const dt = 1 / 60;
  const seconds = o.seconds || 90;
  const n = Math.round(seconds / dt);

  let last = 0, settled = 0;
  for (let i = 0; i < n; i++) {
    step(boat, flow, dt, true);          // heading locked
    if (boat.capsized) return { sog: 0, u: 0, capsized: true, boat: boat };
    const s = boat.out.u;
    if (Math.abs(s - last) < 1e-5) { if (++settled > 90) break; } else settled = 0;
    last = s;
  }

  return {
    /* The polar is speed ALONG THE HEADING, not speed over ground. Inside the
     * no-go zone a boat still drifts bodily downwind at half a knot — counting
     * that as boat speed would paint a no-go zone that does not exist. */
    u: boat.out.u,
    sog: boat.out.sog,
    awa: deg(boat.out.awa),
    aws: boat.out.aws,
    aoa: deg(boat.out.aoa),
    heel: boat.out.heelDeg,
    leeway: deg(boat.out.leeway),
    luffing: boat.out.luffing,
    capsized: false,
    boat: boat
  };
}

/** Best achievable speed at a true wind angle, over all sheet settings. */
export function bestAt(twaDeg, windSpeed, opts) {
  const sheetStep = (opts && opts.sheetStep) || 0.02;
  let best = { u: -Infinity, sog: 0, sheet: 0 };
  for (let s = 0; s <= 1.0001; s += sheetStep) {
    const r = steadyState(twaDeg, windSpeed, s, opts);
    if (r.u > best.u) best = Object.assign({}, r, { sheet: s });
  }
  if (best.u < 0) best.u = 0;
  return best;
}

export function sweep(windSpeed, opts) {
  const o = opts || {};
  const stepDeg = o.step || 5;
  const rows = [];
  for (let twa = 0; twa <= 180; twa += stepDeg) {
    const b = bestAt(twa, windSpeed, o);
    rows.push({
      twa: twa,
      sog: b.u,
      kn: msToKn(b.u),
      sheet: b.sheet,
      awa: b.awa,
      aws: b.aws,
      aoa: b.aoa,
      heel: b.heel,
      leeway: b.leeway,
      vmgUp: b.u * Math.cos(rad(twa)),
      vmgDown: -b.u * Math.cos(rad(twa))
    });
  }

  let maxSpeed = rows[0], bestUp = rows[0], bestDown = rows[0];
  for (const r of rows) {
    if (r.sog > maxSpeed.sog) maxSpeed = r;
    if (r.vmgUp > bestUp.vmgUp) bestUp = r;
    if (r.vmgDown > bestDown.vmgDown) bestDown = r;
  }

  /* The no-go zone: the widest angle from which the boat still cannot move. */
  let noGo = 0;
  for (const r of rows) if (r.sog < 0.25 && r.twa > noGo) noGo = r.twa;

  return { windSpeed, rows, maxSpeed, bestUp, bestDown, noGo };
}

/* ── CLI ─────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && process.argv[1].endsWith('polar-sweep.js');
if (isMain) {
  const ws = parseFloat(process.argv[2]) || 6;
  const r = sweep(ws);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else if (process.argv.includes('--csv')) {
    console.log('twa,knots,sheet,awa,aoa,heel,leeway,vmg_up');
    for (const x of r.rows) {
      console.log([x.twa, x.kn.toFixed(3), x.sheet.toFixed(2), (x.awa || 0).toFixed(1),
                   (x.aoa || 0).toFixed(1), (x.heel || 0).toFixed(1),
                   (x.leeway || 0).toFixed(2), msToKn(x.vmgUp).toFixed(3)].join(','));
    }
  } else {
    const wide = 46;
    console.log(`\n  Polar — true wind ${ws.toFixed(1)} m/s (${msToKn(ws).toFixed(1)} kn)\n`);
    console.log('   TWA   knots  sheet   AWA   AoA   heel  leeway');
    console.log('  ' + '─'.repeat(wide));
    for (const x of r.rows) {
      const bar = '█'.repeat(Math.round((x.sog / r.maxSpeed.sog) * 22));
      console.log(
        '  ' + String(x.twa).padStart(4) + '  ' +
        x.kn.toFixed(2).padStart(6) + '  ' +
        x.sheet.toFixed(2).padStart(5) + '  ' +
        (x.awa || 0).toFixed(0).padStart(5) + '  ' +
        (x.aoa || 0).toFixed(0).padStart(4) + '  ' +
        (x.heel || 0).toFixed(0).padStart(5) + '  ' +
        (x.leeway || 0).toFixed(1).padStart(6) + '   ' + bar
      );
    }
    console.log('  ' + '─'.repeat(wide));
    console.log(`  no-go zone reaches       ${r.noGo}°`);
    console.log(`  best upwind VMG          ${r.bestUp.twa}°  ` +
                `(${msToKn(r.bestUp.vmgUp).toFixed(2)} kn made good)`);
    console.log(`  fastest point of sail    ${r.maxSpeed.twa}°  ` +
                `(${r.maxSpeed.kn.toFixed(2)} kn)`);
    console.log(`  best downwind VMG        ${r.bestDown.twa}°`);
    console.log(`  speed on a dead run      ${r.rows[r.rows.length - 1].kn.toFixed(2)} kn  ` +
                `(${(r.rows[r.rows.length - 1].sog / r.maxSpeed.sog * 100).toFixed(0)}% of max)\n`);
  }
}
