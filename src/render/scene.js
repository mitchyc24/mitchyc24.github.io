/* Canvas renderer, shared by /host/ and /dev/.
 *
 * World is y-north and angles are CCW; screens are y-down. That flip lives
 * here and nowhere else — src/core/ never hears about pixels.
 *
 * Quality is keyed off a fidelity string rather than a device test, so the
 * Chromecast can drop detail without a second code path (see host/capability).
 */

import { windFrom, gustAt } from '../core/wind.js';
import { flowRotation, flowScreenDir, windFromName, windToName,
         windAdjective } from '../shared/compass.js';
import { msToKn } from '../shared/units.js';

const LEVELS = {
  lite: { gustCell: 26, wakeMax: 90, grid: true, ripples: false },
  full: { gustCell: 15, wakeMax: 260, grid: true, ripples: true }
};

export function createScene(canvas, opts) {
  const o = opts || {};
  const s = {
    canvas,
    ctx: canvas.getContext('2d'),
    ppm: o.ppm === undefined ? 15 : o.ppm,
    fidelity: o.fidelity === 'lite' ? 'lite' : 'full',
    W: 0, H: 0, dpr: 1,
    camera: { x: 0, y: 0 },
    /* Where the HUD panels are, in pixels. The water still paints edge to
     * edge — a letterboxed sea looks broken — but everything that has to be
     * READ is framed inside what is left, so a mode zone never ends up under
     * the fleet list. Zero all round unless the page says otherwise. */
    inset: { left: 0, right: 0, top: 0, bottom: 0 },
    wakes: new Map()          // boatId -> array of points
  };
  resize(s);
  return s;
}

/** @param i {left,right,top,bottom} in CSS pixels */
export function setInset(s, i) { s.inset = Object.assign({ left: 0, right: 0, top: 0, bottom: 0 }, i); }

const usable = (s) => ({
  w: Math.max(120, s.W - s.inset.left - s.inset.right),
  h: Math.max(120, s.H - s.inset.top - s.inset.bottom),
  cx: s.inset.left + Math.max(120, s.W - s.inset.left - s.inset.right) / 2,
  cy: s.inset.top + Math.max(120, s.H - s.inset.top - s.inset.bottom) / 2
});

export function resize(s) {
  s.dpr = Math.min(2, window.devicePixelRatio || 1);
  s.W = s.canvas.clientWidth;
  s.H = s.canvas.clientHeight;
  s.canvas.width = Math.round(s.W * s.dpr);
  s.canvas.height = Math.round(s.H * s.dpr);
  s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
}

/**
 * Frame the camera on every boat, so nobody sails off the TV.
 *
 * @param opts.pad     metres of water to leave round the fleet
 * @param opts.maxPpm  zoom ceiling. The lobby caps this well below the default
 *   so a single boat pottering about does not fill the screen and lose all
 *   sense of where the harbour is.
 * @param opts.extra   extra world points to keep in shot (the dock, a zone
 *   somebody is standing in)
 */
export function frameBoats(s, boats, opts) {
  const o = typeof opts === 'number' ? { pad: opts } : (opts || {});
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let n = 0;
  const eat = (p) => {
    n++;
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  };
  for (const b of boats) eat(b.p);
  if (o.extra) for (const p of o.extra) eat(p);
  if (!n) return;

  const margin = o.pad === undefined ? 28 : o.pad;
  const spanX = (maxX - minX) + margin * 2;
  const spanY = (maxY - minY) + margin * 2;
  const u = usable(s);
  const want = Math.min(u.w / spanX, u.h / spanY);
  const hi = o.maxPpm === undefined ? 26 : o.maxPpm;

  /* Ease, so the view breathes instead of snapping when someone joins. */
  s.ppm += (Math.max(3.2, Math.min(hi, want)) - s.ppm) * 0.05;
  s.camera.x += ((minX + maxX) / 2 - s.camera.x) * 0.08;
  s.camera.y += ((minY + maxY) / 2 - s.camera.y) * 0.08;
}

/* World is y-north, screen is y-down; the flip lives here. The centre is the
 * middle of the USABLE rect, not of the canvas, so the fleet stays clear of
 * the HUD. */
const sx = (s, wx) => (s.inset.left + Math.max(120, s.W - s.inset.left - s.inset.right) / 2)
                      + (wx - s.camera.x) * s.ppm;
const sy = (s, wy) => (s.inset.top + Math.max(120, s.H - s.inset.top - s.inset.bottom) / 2)
                      - (wy - s.camera.y) * s.ppm;

export function drawWater(s, wind) {
  const { ctx, W, H } = s;
  ctx.fillStyle = '#06121C';
  ctx.fillRect(0, 0, W, H);

  /* Gusts as darker water. This is the single most useful thing on the
   * screen tactically: you can see the breeze coming before it reaches you. */
  const cell = LEVELS[s.fidelity].gustCell;
  for (let py = 0; py < H; py += cell) {
    for (let px = 0; px < W; px += cell) {
      const wx = s.camera.x + (px + cell / 2 - W / 2) / s.ppm;
      const wy = s.camera.y - (py + cell / 2 - H / 2) / s.ppm;
      const g = gustAt(wind, { x: wx, y: wy });
      const k = Math.max(0, Math.min(1, (g - 0.75) / 0.5));
      ctx.fillStyle = 'rgba(120,173,206,' + (0.03 + k * 0.10).toFixed(3) + ')';
      ctx.fillRect(px, py, cell, cell);
    }
  }

  if (LEVELS[s.fidelity].grid) {
    ctx.strokeStyle = 'rgba(120,173,206,.07)';
    ctx.lineWidth = 1;
    const G = 25;
    const x0 = Math.floor((s.camera.x - W / 2 / s.ppm) / G) * G;
    const y0 = Math.floor((s.camera.y - H / 2 / s.ppm) / G) * G;
    ctx.beginPath();
    for (let x = x0; x < s.camera.x + W / s.ppm; x += G) { ctx.moveTo(sx(s, x), 0); ctx.lineTo(sx(s, x), H); }
    for (let y = y0; y < s.camera.y + H / s.ppm; y += G) { ctx.moveTo(0, sy(s, y)); ctx.lineTo(W, sy(s, y)); }
    ctx.stroke();
  }
}

/* Wind streaks.
 *
 * The most unambiguous wind cue there is, because it MOVES. An arrow can be
 * read backwards — sailors name a wind by where it comes from, arrows show
 * where it goes — but a field of streaks blowing across the water can only be
 * read one way. Everything else on screen is a caption for this.
 */
export function drawWindStreaks(s, wind, tSeconds) {
  const { ctx, W, H } = s;
  const dir = flowScreenDir(windFrom(wind));
  const speed = wind.baseSpeed * s.ppm;            // px per second
  const len = Math.max(14, Math.min(46, wind.baseSpeed * 3.4));
  const count = s.fidelity === 'lite' ? 34 : 70;
  const span = Math.max(W, H) * 1.6;

  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    /* Deterministic scatter, drifting downwind and wrapping. */
    const seed = i * 2654435761 % 10007;
    const ox = (seed % 997) / 997, oy = ((seed / 997) % 991) / 991;
    const travel = ((tSeconds * speed) / span + ox) % 1;
    const across = (oy - 0.5) * span;

    const cx = W / 2 + dir.x * (travel - 0.5) * span - dir.y * across;
    const cy = H / 2 + dir.y * (travel - 0.5) * span + dir.x * across;
    if (cx < -60 || cx > W + 60 || cy < -60 || cy > H + 60) continue;

    /* Fade in and out so they do not pop at the edges. */
    const fade = Math.sin(travel * Math.PI);
    const gust = gustAt(wind, {
      x: s.camera.x + (cx - W / 2) / s.ppm,
      y: s.camera.y - (cy - H / 2) / s.ppm
    });
    ctx.strokeStyle = 'rgba(150,200,232,' + (0.05 + fade * 0.16 * gust).toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dir.x * len, cy + dir.y * len);
    ctx.stroke();
    /* A head on the leading end, so a single streak also reads directionally. */
    ctx.fillStyle = 'rgba(180,220,244,' + (fade * 0.22).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(cx + dir.x * len, cy + dir.y * len, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawWakes(s, boats) {
  const cap = LEVELS[s.fidelity].wakeMax;
  const { ctx } = s;
  for (const b of boats) {
    let w = s.wakes.get(b.id);
    if (!w) { w = []; s.wakes.set(b.id, w); }
    if (!b.capsized && b.out.sog > 0.4) {
      w.push({ x: b.p.x, y: b.p.y, a: Math.min(1, b.out.sog / 4) });
    }
    while (w.length > cap) w.shift();
    for (let i = 0; i < w.length; i++) {
      const pt = w[i], t = i / w.length;
      ctx.fillStyle = 'rgba(190,222,240,' + (t * t * pt.a * 0.28).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(sx(s, pt.x), sy(s, pt.y), 1.0 + t * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawBoat(s, b, opts) {
  const o = opts || {};
  const { ctx } = s;
  const B = b.cls;
  const cx = sx(s, b.p.x), cy = sy(s, b.p.y);
  const L = B.loa * s.ppm, halfB = (B.beam / 2) * s.ppm;

  ctx.save();
  ctx.translate(cx, cy);
  /* Screen y is flipped, so a CCW world heading rotates clockwise on screen. */
  ctx.rotate(-b.theta + Math.PI / 2);

  /* Foreshorten across the beam to read heel — cheap, and instantly legible
   * from across a room. */
  const squash = Math.cos(b.phi);
  ctx.save();
  ctx.scale(Math.max(0.18, Math.abs(squash)) * (squash < 0 ? -1 : 1), 1);

  ctx.beginPath();
  ctx.moveTo(0, -L * 0.5);
  ctx.quadraticCurveTo(halfB, -L * 0.16, halfB * 0.86, L * 0.34);
  ctx.lineTo(-halfB * 0.86, L * 0.34);
  ctx.quadraticCurveTo(-halfB, -L * 0.16, 0, -L * 0.5);
  ctx.closePath();
  ctx.fillStyle = b.capsized ? '#5A6B77' : (o.hull || '#E9EEF2');
  ctx.fill();
  ctx.strokeStyle = 'rgba(6,18,28,.85)'; ctx.lineWidth = 1.2; ctx.stroke();

  if (!b.capsized) {
    const side = b.out.awa > 0 ? 1 : -1;        // wind from port -> boom to starboard
    const boom = side * b.sigma;
    const mastY = -L * 0.18;
    const clewX = Math.sin(boom) * L * 0.52;
    const clewY = mastY + Math.cos(boom) * L * 0.52;
    const belly = 0.15 * L * (b.out.luffing ? 0.2 : 1) * side;
    ctx.beginPath();
    ctx.moveTo(0, mastY);
    ctx.quadraticCurveTo(clewX / 2 + belly * Math.cos(boom),
                         (mastY + clewY) / 2 - belly * Math.sin(boom) * side,
                         clewX, clewY);
    ctx.strokeStyle = b.out.luffing ? '#E3B341' : (b.out.stalled ? '#E97A6F' : '#FFFFFF');
    ctx.lineWidth = Math.max(2, L * 0.045); ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();

  /* Rudder, drawn unsquashed so the angle stays readable. */
  ctx.translate(0, L * 0.34);
  ctx.rotate(-b.delta);
  ctx.strokeStyle = 'rgba(240,119,187,.9)';
  ctx.lineWidth = Math.max(1.5, L * 0.03);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, L * 0.15); ctx.stroke();
  ctx.restore();

  if (o.label) {
    ctx.fillStyle = 'rgba(233,238,242,.92)';
    ctx.font = '700 12px Archivo, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(o.label, cx, cy - L * 0.55 - 6);
  }
  if (o.hiking) {
    ctx.strokeStyle = 'rgba(233,238,242,.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, L * 0.62, 0, Math.PI * 2); ctx.stroke();
  }
}

/**
 * @param place  {right}  inset from the right edge, top corner (the default,
 *                        and what /dev/ uses)
 *               {left, bottom}  put it in a specific corner instead — the host
 *                        parks it bottom-left, where the fleet list and the
 *                        mode rings never reach
 */
export function drawWindIndicator(s, wind, place) {
  const { ctx } = s;
  const o = place || {};
  const r = 46;
  const cx = o.left !== undefined ? o.left + r + 26 : s.W - (o.right || 0) - r - 26;
  const cy = o.bottom !== undefined ? s.H - o.bottom - r - 34 : r + 30;
  const from = windFrom(wind);

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(9,20,28,.9)'; ctx.fill();
  ctx.strokeStyle = 'rgba(120,173,206,.35)'; ctx.lineWidth = 1; ctx.stroke();

  /* North mark, so the compass names on the labels mean something. */
  ctx.fillStyle = 'rgba(150,200,232,.55)';
  ctx.font = '600 9px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - r + 11);

  ctx.translate(cx, cy);
  /* flowRotation aims a shape drawn along local +y the way the wind TRAVELS.
   * This was 90 degrees out once and it made the whole game unreadable. */
  ctx.rotate(flowRotation(from));

  const grad = ctx.createLinearGradient(0, -r * 0.66, 0, r * 0.52);
  grad.addColorStop(0, 'rgba(120,173,206,.25)');
  grad.addColorStop(1, '#9ED2F0');
  ctx.strokeStyle = grad; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -r * 0.66); ctx.lineTo(0, r * 0.42); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, r * 0.2); ctx.lineTo(0, r * 0.52); ctx.lineTo(8, r * 0.2);
  ctx.fillStyle = '#9ED2F0'; ctx.fill();
  ctx.restore();

  /* Both facts, in words. Sailors name a wind by where it comes FROM; the
   * arrow and the streaks show where it GOES. Saying only one invites the
   * reader to assume the other. */
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9ED2F0';
  ctx.font = '700 13px Archivo, sans-serif';
  ctx.fillText(windAdjective(from).toUpperCase() + '  ' +
               msToKn(wind.baseSpeed * gustAt(wind, s.camera)).toFixed(0) + ' kn',
               cx, cy + r + 16);
  ctx.fillStyle = 'rgba(150,200,232,.75)';
  ctx.font = '500 10px "IBM Plex Mono", monospace';
  ctx.fillText('from ' + windFromName(from) + ' → blowing ' + windToName(from), cx, cy + r + 30);
}

export function forgetBoat(s, id) { s.wakes.delete(id); }

/* ── the harbour ─────────────────────────────────────────────────────
 *
 * The lobby is drawn, not written. A ring you can see filling is a progress
 * bar everyone in the room reads at once, from a sofa, without being told what
 * it means — which is the whole reason the menu is made of water.
 */

const ZONE_COLOUR = {
  race:    '#E97A6F',
  cargo:   '#E3B341',
  squall:  '#78ADCE',
  lessons: '#43BE88'
};

export function drawDock(s, harbour) {
  const { ctx } = s;
  const d = harbour.dock;
  const half = 46 * s.ppm / 2;
  const cx = sx(s, d.x), cy = sy(s, d.y);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-d.theta);                       // world CCW -> screen CW
  ctx.fillStyle = 'rgba(120,173,206,.16)';
  ctx.fillRect(-half, -2.2 * s.ppm, half * 2, 4.4 * s.ppm);
  ctx.strokeStyle = 'rgba(150,200,232,.45)';
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1;
  ctx.strokeRect(-half, -2.2 * s.ppm, half * 2, 4.4 * s.ppm);
  ctx.restore();

  ctx.fillStyle = 'rgba(150,200,232,.5)';
  ctx.font = '600 10px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('THE DOCK', cx, cy + 3.6 * s.ppm + 13);
}

/**
 * @param lobby  the vote state, for claim rings and voter pips
 * @param modes  the MODES catalogue, for names
 */
export function drawZones(s, harbour, lobby, modes) {
  const { ctx } = s;
  const offscreen = [];
  /* "Off screen" means off the READABLE part of the screen. A ring three
    * quarters hidden behind the fleet list is worse than one that is honestly
    * absent and has an arrow pointing at it. */
  const L = s.inset.left - 20, R = s.W - s.inset.right + 20;
  const T = s.inset.top - 20, B = s.H - s.inset.bottom + 20;

  for (const hz of harbour.zones) {
    const z = lobby.byId.get(hz.id);
    const colour = ZONE_COLOUR[hz.id] || '#78ADCE';
    const cx = sx(s, hz.p.x), cy = sy(s, hz.p.y);
    const r = hz.r * s.ppm;
    const leading = lobby.leader === hz.id && lobby.phase !== 'harbour';

    /* Two separate questions. Is any of the ring on the canvas at all (draw
     * the arc if so — a rim sliding in from the edge is useful)? And is its
     * MIDDLE somewhere you could read a label (put the name there if so,
     * otherwise hand it an arrow)? */
    const anyOnCanvas = cx + r > -10 && cx - r < s.W + 10 && cy + r > -10 && cy - r < s.H + 10;
    const readable = cx > L && cx < R && cy > T && cy < B;
    if (!readable) offscreen.push({ hz, z, colour });
    if (!anyOnCanvas) continue;

    ctx.save();

    /* The ring itself: dashed, because it is a suggestion until somebody
     * stands in it. */
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = hexA(colour, leading ? 0.14 : 0.05);
    ctx.fill();
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = hexA(colour, z && !z.armed ? 0.2 : 0.5);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    /* The claim, as an arc winding clockwise from the top. */
    if (z && z.claim > 0.005) {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * z.claim);
      ctx.strokeStyle = colour;
      ctx.lineWidth = leading ? 7 : 5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.textAlign = 'center';

    if (readable) {
      const m = modes[hz.mode];
      /* Name near the top of the ring, count near the bottom, so the middle
       * stays clear for the thing the ring is actually about: boats. */
      const big = fitFont(ctx, (m ? m.name : hz.id).toUpperCase(),
                          r * 1.75, Math.max(11, Math.min(24, r * 0.30)), '800', 'Archivo, sans-serif');
      ctx.fillStyle = colour;
      ctx.fillText((m ? m.name : hz.id).toUpperCase(), cx, cy - r * 0.46);

      const small = Math.max(8, big * 0.44);
      ctx.fillStyle = hexA(colour, 0.7);
      ctx.font = '500 ' + small.toFixed(0) + 'px "IBM Plex Mono", monospace';
      ctx.fillText(hz.note, cx, cy - r * 0.46 + small * 1.55);

      /* Who is here, and who counts. A hollow pip is a boat with nobody
       * holding the phone — visible, but not part of the sum. */
      if (z && z.voters.length) {
        const pipR = Math.max(2.5, r * 0.05);
        const gap = pipR * 3;
        const y = cy + r * 0.5;
        const x0 = cx - (z.voters.length - 1) * gap / 2;
        for (let i = 0; i < z.voters.length; i++) {
          ctx.beginPath();
          ctx.arc(x0 + i * gap, y, pipR, 0, Math.PI * 2);
          if (i < z.active) { ctx.fillStyle = colour; ctx.fill(); }
          else { ctx.strokeStyle = hexA(colour, 0.55); ctx.lineWidth = 1.3; ctx.stroke(); }
        }
        if (lobby.need > 0 && lobby.need !== Infinity && z.active < lobby.need) {
          ctx.fillStyle = hexA(colour, 0.65);
          ctx.font = '500 ' + small.toFixed(0) + 'px "IBM Plex Mono", monospace';
          ctx.fillText((lobby.need - z.active) + ' more', cx, y + pipR * 2 + small + 2);
        }
      }
    }
    ctx.restore();
  }

  /* Anything off the edge still has to be findable, or a room of beginners
   * sails in circles looking for a menu that is 150 m astern. */
  for (const o of offscreen) drawZoneMarker(s, o.hz, o.z, o.colour, modes);
}

function drawZoneMarker(s, hz, z, colour, modes) {
  const { ctx } = s;
  const pad = 62;
  const L = s.inset.left + pad, R = s.W - s.inset.right - pad;
  const T = s.inset.top + pad, B = s.H - s.inset.bottom - pad;
  const u = usable(s);
  const px = sx(s, hz.p.x), py = sy(s, hz.p.y);
  const cx = u.cx, cy = u.cy;

  /* March from the middle of the usable rect toward the zone until we hit
   * its edge, so the chevron lands on clear water rather than on a panel. */
  const dx = px - cx, dy = py - cy;
  const tx = dx === 0 ? Infinity : (dx > 0 ? (R - cx) / dx : (L - cx) / dx);
  const ty = dy === 0 ? Infinity : (dy > 0 ? (B - cy) / dy : (T - cy) / dy);
  const t = Math.max(0, Math.min(tx, ty, 1));
  const mx = cx + dx * t, my = cy + dy * t;
  const a = Math.atan2(dy, dx);

  const metres = Math.hypot(hz.p.x - s.camera.x, hz.p.y - s.camera.y);
  const m = modes[hz.mode];

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(13, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9);
  ctx.closePath();
  ctx.fillStyle = hexA(colour, 0.9);
  ctx.fill();
  if (z && z.claim > 0.005) {
    ctx.beginPath();
    ctx.arc(-13, 0, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * z.claim);
    ctx.strokeStyle = colour; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();

  /* The label stays upright — a rotated word is a word nobody reads. */
  const lx = Math.max(L, Math.min(R, mx - Math.cos(a) * 26));
  const ly = Math.max(T - pad + 22, Math.min(B + pad - 16, my - Math.sin(a) * 26));
  ctx.textAlign = 'center';
  ctx.fillStyle = colour;
  ctx.font = '700 12px Archivo, sans-serif';
  ctx.fillText((m ? m.name : hz.id).toUpperCase(), lx, ly);
  ctx.fillStyle = hexA(colour, 0.65);
  ctx.font = '500 9.5px "IBM Plex Mono", monospace';
  ctx.fillText(Math.round(metres) + ' m', lx, ly + 12);
}

/* Shrink a label until it fits the ring it names. "SAILING SCHOOL" is more
 * than twice the width of "SQUALL" and the rings are the same size. Leaves the
 * chosen font set on the context. */
function fitFont(ctx, text, maxWidth, startPx, weight, family) {
  let px = startPx;
  for (let i = 0; i < 12; i++) {
    ctx.font = weight + ' ' + px.toFixed(1) + 'px ' + family;
    if (ctx.measureText(text).width <= maxWidth || px <= 8) break;
    px *= 0.9;
  }
  return px;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

export { ZONE_COLOUR };
