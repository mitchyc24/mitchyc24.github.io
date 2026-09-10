/* The points-of-sail dial.
 *
 * The thing a beginner cannot do is hold a picture of where the wind is
 * relative to the boat. The host screen shows the fleet from above, which is
 * the wrong frame — you are steering a boat, not watching a map, and you have
 * to translate every time.
 *
 * So this is drawn BOAT-UP: the bow always points at the top of the dial, and
 * the wind swings around it. The no-go zone is a shaded wedge you can see
 * yourself heading into. Nothing here needs reading; the shape tells you.
 */

import { POINTS_OF_SAIL } from '../shared/compass.js';

const R = 46, CX = 50, CY = 50;
const NOGO = 40;                    // degrees either side of head-to-wind

const pt = (angleDeg, radius) => {
  const a = (angleDeg - 90) * Math.PI / 180;
  return [CX + Math.cos(a) * radius, CY + Math.sin(a) * radius];
};

function wedge(a0, a1, r) {
  const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${CX},${CY} L${x0.toFixed(1)},${y0.toFixed(1)} ` +
         `A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`;
}

/** Static chrome — drawn once. Everything that moves is in update(). */
export function dialMarkup() {
  return `
<svg viewBox="0 0 100 100" role="img" aria-label="Where the wind is, relative to the boat">
  <circle cx="${CX}" cy="${CY}" r="${R}" fill="rgba(18,30,39,.9)" stroke="#243543"/>

  <!-- the wedge you cannot sail in -->
  <path d="${wedge(-NOGO, NOGO, R)}" fill="#E97A6F" fill-opacity=".16"/>
  <path d="${wedge(-NOGO, NOGO, R)}" fill="none" stroke="#E97A6F" stroke-opacity=".45"
        stroke-width=".7" stroke-dasharray="2 2"/>
  <text x="${CX}" y="20" text-anchor="middle" font-size="6.5" fill="#E97A6F"
        font-family="IBM Plex Mono, monospace" letter-spacing=".5">NO-GO</text>

  <!-- the boat, always bow-up, because that is the frame you are steering in -->
  <path d="M50,28 L56.5,62 L50,57 L43.5,62 Z" fill="#E9EEF2" stroke="#0B131A" stroke-width=".8"/>
  <text x="${CX}" y="76" text-anchor="middle" font-size="5.5" fill="#7F8E9B"
        font-family="IBM Plex Mono, monospace" letter-spacing=".4">YOUR BOW</text>

  <!-- where the wind is coming from -->
  <g id="d-wind">
    <line x1="${CX}" y1="${CY}" x2="${CX}" y2="8" stroke="#9ED2F0" stroke-width="2.4"
          stroke-linecap="round"/>
    <polygon points="46,14 50,5 54,14" fill="#9ED2F0"/>
    <circle cx="${CX}" cy="10" r="0" fill="none"/>
  </g>
  <circle cx="${CX}" cy="${CY}" r="2" fill="#9ED2F0"/>
</svg>`;
}

/**
 * @param twaDeg  signed true wind angle off the bow (+ve = wind from port)
 * Rotating the wind marker by -twa puts it where the wind actually is, because
 * the dial is boat-up: at twa 0 the wind is dead ahead and the marker sits at
 * the top, inside the no-go wedge.
 */
export function updateDial(root, twaDeg) {
  const g = root.querySelector('#d-wind');
  if (g) g.setAttribute('transform', `rotate(${(-twaDeg).toFixed(1)} ${CX} ${CY})`);
}

export { POINTS_OF_SAIL };
