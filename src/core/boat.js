/* One boat: state, controls, and a single fixed-step advance.
 *
 * Deterministic. Given the same state, inputs and wind, step() always produces
 * the same result — which is what makes the polar sweep and the emergent
 * behaviour tests possible.
 */

import { v2, add, scale, dot } from '../shared/vec2.js';
import { wrap, clamp, approach } from '../shared/angles.js';
import { BOATS, DEFAULT_BOAT } from '../shared/boats.js';
import {
  apparentWind, sailForce, damp, forwardResistance, inducedDrag,
  rudderMoment, helmMoment, trackingMoment, equilibriumHeel, basis
} from './physics.js';

export function createBoat(opts) {
  const o = opts || {};
  return {
    cls: BOATS[o.cls || DEFAULT_BOAT],

    p: v2(o.x || 0, o.y || 0),
    v: v2(0, 0),
    theta: o.theta === undefined ? 0 : o.theta,
    omega: 0,
    phi: 0,

    delta: 0,          // rudder, rad
    sigma: 0,          // sheeted sail angle from centreline, rad

    capsized: false,
    recovery: 0,

    /* Latest input, never a queue. A dropped packet is harmless because the
     * next one arrives ~33 ms later carrying current state. */
    input: { r: 0, s: 0, h: 0 },

    /* Derived, refreshed every step, for the HUD and the telltales. */
    out: {
      aws: 0, awa: 0, aoa: 0, sigma: 0, luffing: true, stalled: false,
      sog: 0, u: 0, w: 0, leeway: 0,
      drive: 0, side: 0, heelDeg: 0, wave: 1
    },

    /* Cumulative, for stats. */
    stats: { distance: 0, tacks: 0, gybes: 0, ironsSeconds: 0, capsizes: 0, topSpeed: 0 },
    _lastTackSign: 0
  };
}

export function setInput(boat, input) {
  if (!input) return;
  boat.input = {
    r: clamp(Number(input.r) || 0, -1, 1),
    s: clamp(Number(input.s) || 0, 0, 1),
    h: input.h ? 1 : 0
  };
}

/**
 * Advance one boat by dt.
 * @param windFlow the local wind FLOW vector at this boat's position
 * @param lockHeading when true, theta and omega are held fixed. Used by the
 *        polar sweep, which needs a boat sailing a constant true wind angle.
 */
export function step(boat, windFlow, dt, lockHeading) {
  const b = boat.cls;
  const o = boat.out;

  /* ── capsize ───────────────────────────────────────────────────── */
  if (boat.capsized) {
    boat.recovery -= dt;
    /* Lying on its side: no drive, and the rig in the water is a huge brake. */
    boat.v = scale(boat.v, 1 / (1 + 4 * dt));
    boat.omega *= 1 / (1 + 6 * dt);
    boat.p = add(boat.p, scale(boat.v, dt));
    boat.phi += (Math.sign(boat.phi) * b.capsizeAngleR * 1.15 - boat.phi) * Math.min(1, dt * 3);
    if (boat.recovery <= 0) {
      boat.capsized = false;
      boat.phi = Math.sign(boat.phi) * b.capsizeAngleR * 0.35;
      boat.sigma = b.sheetMaxR;      // come up with the sheet eased
    }
    o.luffing = true;
    o.sog = 0;
    return boat;
  }

  /* ── controls, rate limited ────────────────────────────────────── */
  const targetDelta = boat.input.r * b.rudderMaxR;
  boat.delta = approach(boat.delta, targetDelta, b.rudderRateR * dt);

  /* Sheet maps into [sheetMin, sheetMax] rather than starting at zero: the
   * boom stops at the centreline, so "strapped flat" is not a state you can
   * reach, and neither is the dead spot that came with it. */
  const targetSigma = b.sheetMinR + boat.input.s * (b.sheetMaxR - b.sheetMinR);
  boat.sigma = approach(boat.sigma, targetSigma, b.sheetRateR * dt);

  /* ── frames and apparent wind ──────────────────────────────────── */
  const fr = basis(boat.theta);
  const app = apparentWind(windFlow, boat.v, boat.theta);

  /* ── sail ──────────────────────────────────────────────────────── */
  const sail = sailForce(app, boat.sigma, boat.phi, b);
  const sailFwd = dot(sail.force, fr.fwd);
  const sailLat = dot(sail.force, fr.stbd);

  /* ── surge and sway in the boat frame ──────────────────────────── */
  let u = dot(boat.v, fr.fwd);
  let w = dot(boat.v, fr.stbd);

  u += (sailFwd / b.mass) * dt;
  w += (sailLat / b.mass) * dt;

  /* The keel first, so we know how hard it actually had to work. Roughly
   * LAT_OVER_FWD times stiffer than the hull is forward, which is the entire
   * reason upwind sailing is possible. */
  const wBefore = w;
  w = damp(w, b.Klat, b.Clat, b.mass, dt);

  /* The keel's reaction force is what generates induced drag — not the sail's
   * side force, and not at forward speed but at the speed water actually
   * passes the foil. Standing still and sliding sideways, the keel is stalled
   * and the boat simply makes leeway. */
  const keelForce = (b.mass * (wBefore - w)) / dt;
  const waterSpeed = Math.sqrt(u * u + w * w);
  const di = inducedDrag(keelForce, waterSpeed, b);
  const ci = di / Math.max(0.35, Math.abs(u));

  const res = forwardResistance(u, b);
  u = damp(u, res.k, res.c + ci, b.mass, dt);

  boat.v = add(scale(fr.fwd, u), scale(fr.stbd, w));

  /* ── yaw ───────────────────────────────────────────────────────── */
  if (!lockHeading) {
    const n = rudderMoment(boat.delta, u, b) +
              helmMoment(sailLat, keelForce, b) +
              trackingMoment(w, u, b);
    boat.omega += (n / b.Iz) * dt;
    boat.omega /= 1 + (b.Cyaw * dt) / b.Iz;
    const before = boat.theta;
    boat.theta = wrap(boat.theta + boat.omega * dt);
    countManoeuvre(boat, app, before);
  } else {
    boat.omega = 0;
  }

  /* ── heel ──────────────────────────────────────────────────────── */
  const phiEq = equilibriumHeel(sailLat, boat.input.h, b);
  boat.phi += (phiEq - boat.phi) * (1 - Math.exp(-dt / b.tauHeel));

  if (Math.abs(boat.phi) > b.capsizeAngleR) {
    boat.capsized = true;
    boat.recovery = b.recoverySeconds;
    boat.stats.capsizes++;
  }

  /* ── position ──────────────────────────────────────────────────── */
  boat.p = add(boat.p, scale(boat.v, dt));

  /* ── readouts ──────────────────────────────────────────────────── */
  const sog = Math.sqrt(boat.v.x * boat.v.x + boat.v.y * boat.v.y);
  o.aws = app.aws;
  o.awa = app.awa;
  o.aoa = sail.aoa;
  o.luffing = sail.luffing;
  o.stalled = !sail.luffing && sail.aoa > b.stallEndR;
  o.sog = sog;
  o.u = u;
  o.w = w;
  o.leeway = Math.atan2(w, Math.abs(u) < 1e-6 ? 1e-6 : u);
  o.drive = sailFwd;
  o.side = sailLat;
  o.heelDeg = boat.phi * 180 / Math.PI;
  o.sigma = boat.sigma;
  o.wave = res.wave;
  o.induced = di;

  boat.stats.distance += sog * dt;
  if (sog > boat.stats.topSpeed) boat.stats.topSpeed = sog;
  /* "In irons": pointing too close to sail, and no way on to steer out of it. */
  if (Math.abs(app.awa) < 0.6 && sog < 0.35) boat.stats.ironsSeconds += dt;

  return boat;
}

/** Count tacks and gybes by watching which side the wind crosses. */
function countManoeuvre(boat, app, prevTheta) {
  const sign = Math.sign(app.awa);
  if (sign !== 0 && boat._lastTackSign !== 0 && sign !== boat._lastTackSign) {
    if (Math.abs(app.awa) < Math.PI / 2) boat.stats.tacks++;
    else boat.stats.gybes++;
  }
  if (sign !== 0) boat._lastTackSign = sign;
}
