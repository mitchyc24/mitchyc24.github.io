/* Unit conversions. The simulation is entirely SI; knots and degrees exist only
 * for display, because that is what the instruments on a real boat read.
 */

export const MS_PER_KNOT = 0.514444;

export const msToKn = (ms) => ms / MS_PER_KNOT;
export const knToMs = (kn) => kn * MS_PER_KNOT;

export const M_PER_NM = 1852;
export const mToNm = (m) => m / M_PER_NM;

export const RHO_AIR = 1.225;    // kg/m^3
export const RHO_WATER = 1025;   // kg/m^3, seawater
export const G = 9.80665;        // m/s^2

/** Displacement hull speed, m/s, for a waterline length in metres.
 *  The familiar 1.34 * sqrt(LWL_ft) knots, converted. */
export const hullSpeed = (lwl) => 1.25 * Math.sqrt(lwl);
