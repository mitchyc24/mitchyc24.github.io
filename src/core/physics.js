/* Sail aerodynamics and hull hydrodynamics.
 *
 * Pure functions of state — no DOM, no network, no rendering, no randomness.
 * That is what lets the whole simulation run headless in Node so the polar can
 * be validated in CI instead of by squinting at a TV.
 *
 * CONVENTIONS, because sign errors here are invisible and fatal:
 *   world      x east, y north; angles CCW from +x
 *   heading    theta, the direction the bow points
 *   wind       stored as a FLOW vector (the direction the air is moving)
 *   awa        apparent wind angle off the bow, (-PI, PI]
 *                0    = head to wind
 *                +ve  = wind from the port bow
 *                +-PI = dead downwind
 *   starboard  90 degrees clockwise from the heading
 *   heel phi   positive = heeled to starboard
 */

import { fromAngle, dot, sub, len, norm, perpCCW, perpCW, scale, add } from '../shared/vec2.js';
import { wrap, clamp, lerp } from '../shared/angles.js';
import { RHO_AIR } from '../shared/units.js';

/* ── sail coefficients ───────────────────────────────────────────────
 * A flat plate gives C_L = 2 sin a cos a and C_D = 2 sin^2 a, which behaves
 * sensibly across the whole 0-90 degree range with no stall special-casing:
 * a dead run naturally becomes pure drag. A real cambered sail beats a flat
 * plate while the flow is attached, so lift is scaled up below stallStart and
 * the advantage fades out by stallEnd.
 */
export function sailCoefficients(aoa, b) {
  const a = Math.abs(aoa);
  let k;
  if (a <= b.stallStartR) k = b.camberGain;
  else if (a >= b.stallEndR) k = 1;
  else k = lerp(b.camberGain, 1, (a - b.stallStartR) / (b.stallEndR - b.stallStartR));

  const sa = Math.sin(a), ca = Math.cos(a);
  return {
    cl: 2 * sa * ca * k,
    /* A rigid flat plate peaks at Cd = 2. A soft sail bagged out on a run is
     * baggier and leakier than that, and the headsail spends the run blanketed
     * behind the main — dragPeak carries both. It is what keeps a dead run
     * slower than a reach instead of the polar coming out flat. */
    cd: b.parasiticCd + b.dragPeak * sa * sa
  };
}

const smoothstep = (t) => t * t * (3 - 2 * t);

/* ── the displacement hump, and planing past it ──────────────────────
 * Wave-making resistance climbs steeply as a displacement hull approaches
 * hull speed, then falls away again once a light dinghy climbs onto its own
 * bow wave and planes. That hump is doing real work in this model: it holds
 * the dead run down (drag-driven, never enough push to break through) while
 * a reach, which is lift-driven and far more powerful, punches past it and
 * takes off. Flatten the hump and the polar goes flat with it.
 */
export function waveFactor(x, b) {
  if (x < b.waveOnset) return 1;
  if (x <= 1) {
    const t = (x - b.waveOnset) / (1 - b.waveOnset);
    return 1 + (b.waveK - 1) * t * t;
  }
  const t = Math.min(1, (x - 1) / Math.max(1e-6, b.planeAt - 1));
  let f = b.waveK + (b.planeDrag - b.waveK) * smoothstep(t);

  /* Planing relief does not last forever. Well past hull speed a small boat is
   * dragging a sheet of spray and punching a hole in the air, and resistance
   * climbs again. Without this the model has no top end at all: in 27 knots it
   * happily did 19, which a 4.7 m hull does not do. */
  if (x > b.sprayOnset) {
    const s = Math.min(1, (x - b.sprayOnset) / Math.max(1e-6, b.sprayFull - b.sprayOnset));
    f += (b.sprayK - b.planeDrag) * s * s;
  }
  return f;
}

/** Apparent wind: what the boat actually feels, which is the true wind minus
 *  its own motion. As the boat accelerates this swings FORWARD and
 *  strengthens, which is why trim has to keep moving. */
export function apparentWind(windFlow, velocity, theta) {
  const flow = sub(windFlow, velocity);
  const aws = len(flow);
  if (aws < 1e-6) return { flow: flow, aws: 0, awa: 0, dir: { x: 0, y: 0 } };

  const dir = { x: flow.x / aws, y: flow.y / aws };
  /* The wind comes FROM the opposite of where it is going. */
  const fromAngleRad = Math.atan2(-flow.y, -flow.x);
  return { flow: flow, aws: aws, awa: wrap(fromAngleRad - theta), dir: dir };
}

/* ── the whole reason a no-go zone exists ────────────────────────────
 * Net drive along the heading is  L*sin(awa) - D*cos(awa), so a sail only
 * pulls the boat forward while  tan(awa) > Cd/Cl. Feed the numbers in: at 30
 * degrees apparent with 16 degrees of angle of attack drive is comfortably
 * positive; at 20 degrees it crosses zero and goes negative however you trim.
 * The no-go zone is not a rule in this file. It is a sign change.
 */
export function sailForce(app, sigma, phi, b) {
  const luffing = Math.abs(app.awa) - sigma <= 0;
  const aoa = Math.abs(app.awa) - sigma;

  if (app.aws < 1e-6 || luffing) {
    return { force: { x: 0, y: 0 }, lift: 0, drag: 0, aoa: Math.max(0, aoa), luffing: true };
  }

  const { cl, cd } = sailCoefficients(aoa, b);

  /* Heel spills drive: the rig is no longer square to the wind. */
  const heelFactor = Math.max(0.15, Math.cos(phi));
  const q = 0.5 * RHO_AIR * app.aws * app.aws * b.sailArea * heelFactor;

  const lift = q * cl;
  const drag = q * cd;

  /* Drag acts along the flow. Lift acts across it, toward the leeward side,
   * which is the side the sail is set on — hence the sign of awa. */
  const liftDir = app.awa > 0 ? perpCCW(app.dir) : perpCW(app.dir);

  return {
    force: add(scale(liftDir, lift), scale(app.dir, drag)),
    lift: lift,
    drag: drag,
    aoa: aoa,
    luffing: false
  };
}

/** Semi-implicit solve of  dx/dt = -(k*x*|x| + c*x)/m  over dt.
 *  Unconditionally stable and never overshoots through zero, which explicit
 *  damping with a keel this stiff absolutely will. */
export function damp(x, k, c, m, dt) {
  return x / (1 + (dt / m) * (c + k * Math.abs(x)));
}

/** How hard the water resists being pushed forward. The wave-making term is
 *  the wall a displacement hull hits near hull speed. */
export function forwardResistance(u, b) {
  const wave = waveFactor(Math.abs(u) / b.hullSpeed, b);
  return { k: b.Kfwd * wave, c: b.Cfwd, wave: wave };
}

/* ── induced drag from the keel ──────────────────────────────────────
 * A foil producing side force also produces drag, rising with the SQUARE of
 * that force and falling with the square of speed. Leaving this out is what
 * made the first polar's knee too soft: upwind, where side force is several
 * times the drive, this is a large penalty, and on a reach or a run it is
 * almost nothing. It is therefore the term that decides how close to the wind
 * the boat can actually point — the price of not sliding sideways.
 *
 * Shaped rather than derived: the constant folds keel area, aspect ratio and
 * water density into one tunable, because it gets fitted against the polar
 * anyway.
 */
export function inducedDrag(keelForce, waterSpeed, b) {
  const d = b.keelInduced * keelForce * keelForce / (waterSpeed * waterSpeed + b.inducedFloor);
  /* Guard rail, not physics. Without a ceiling this term is self-reinforcing at
   * low speed — big side force makes big drag makes low speed makes bigger
   * drag — and the boat locks solid instead of sailing. That bistable trap
   * cost an afternoon: she sailed fine in 8 m/s and stopped dead in 12. */
  return Math.min(d, b.inducedCap);
}

/** Rudder moment. Scaling with u*|u| is deliberate and load-bearing: no flow
 *  over the blade means no steering, so a boat that loses way in a tack simply
 *  cannot turn, and sits head to wind until the sail is backed. */
export function rudderMoment(delta, u, b) {
  const authority = Math.abs(u) * u;
  const floor = b.rudderFloor ? b.rudderFloor * Math.sign(u || 1) : 0;
  return -b.Krud * Math.sin(delta) * (authority + floor);
}

/** Weather helm. The sail's centre of effort sits aft of the keel's centre of
 *  lateral resistance, so lateral sail force yaws the bow into the wind. An
 *  overpowered boat fights to round up, and the fix is to ease or hike —
 *  exactly as on the water.
 *
 *  It is a COUPLE, though, between two opposing forces — and that matters more
 *  than it looks. Driving it from sail force alone gives a boat sitting dead in
 *  the water a large yawing moment that its stopped rudder cannot answer, so
 *  she rounds up into irons before she can ever accelerate and the game is
 *  unplayable from a standing start. A stalled keel exerts almost nothing, so
 *  the couple is limited by whichever of the two forces is smaller. */
export function helmMoment(lateralSailForce, keelReaction, b) {
  const couple = Math.min(Math.abs(lateralSailForce), Math.abs(keelReaction));
  return b.helmLever * Math.sign(lateralSailForce) * couple;
}

/** Directional stability — the weathercock.
 *
 *  A hull moving with leeway is being struck on the bow at an angle, and the
 *  underwater shape yaws to line itself up with the flow. This is why a boat
 *  tracks straight instead of wandering, and it is what OPPOSES weather helm:
 *  the two nearly cancel, leaving the few degrees of standing helm a real
 *  helmsman trims out without thinking.
 *
 *  Leaving it out is why an early build rounded up into irons from every
 *  standing start — weather helm had nothing to push against.
 */
export function trackingMoment(sway, surge, b) {
  return -b.Ktrack * sway * Math.abs(surge);
}

export function equilibriumHeel(lateralSailForce, hiking, b) {
  const righting = (hiking ? b.rightingHiked : b.rightingIn) + b.rightingHull;
  return Math.atan2(lateralSailForce * b.Hce, righting);
}

/** Boat-frame basis. starboard is 90 degrees clockwise from the heading. */
export function basis(theta) {
  const fwd = fromAngle(theta);
  return { fwd: fwd, stbd: { x: fwd.y, y: -fwd.x } };
}

export { dot, clamp };
