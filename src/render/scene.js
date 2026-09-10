/* Canvas renderer, shared by /host/ and /dev/.
 *
 * World is y-north and angles are CCW; screens are y-down. That flip lives
 * here and nowhere else — src/core/ never hears about pixels.
 *
 * Quality is keyed off a fidelity string rather than a device test, so the
 * Chromecast can drop detail without a second code path (see host/capability).
 */

import { windFrom, gustAt } from '../core/wind.js';
import { flowRotation, flowScreenDir, windFromName, windToName } from '../shared/compass.js';
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
    wakes: new Map()          // boatId -> array of points
  };
  resize(s);
  return s;
}

export function resize(s) {
  s.dpr = Math.min(2, window.devicePixelRatio || 1);
  s.W = s.canvas.clientWidth;
  s.H = s.canvas.clientHeight;
  s.canvas.width = Math.round(s.W * s.dpr);
  s.canvas.height = Math.round(s.H * s.dpr);
  s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
}

/** Frame the camera on every boat, so nobody sails off the TV. */
export function frameBoats(s, boats, pad) {
  if (!boats.length) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of boats) {
    if (b.p.x < minX) minX = b.p.x; if (b.p.x > maxX) maxX = b.p.x;
    if (b.p.y < minY) minY = b.p.y; if (b.p.y > maxY) maxY = b.p.y;
  }
  const margin = pad === undefined ? 28 : pad;
  const spanX = (maxX - minX) + margin * 2;
  const spanY = (maxY - minY) + margin * 2;
  const want = Math.min(s.W / spanX, s.H / spanY);

  /* Ease, so the view breathes instead of snapping when someone joins. */
  s.ppm += (Math.max(3.5, Math.min(26, want)) - s.ppm) * 0.05;
  s.camera.x += ((minX + maxX) / 2 - s.camera.x) * 0.08;
  s.camera.y += ((minY + maxY) / 2 - s.camera.y) * 0.08;
}

const sx = (s, wx) => s.W / 2 + (wx - s.camera.x) * s.ppm;
const sy = (s, wy) => s.H / 2 - (wy - s.camera.y) * s.ppm;

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

export function drawWindIndicator(s, wind, inset) {
  const { ctx } = s;
  const right = (inset && inset.right) || 0;
  const r = 46, cx = s.W - right - r - 26, cy = r + 30;
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
  ctx.fillText(windFromName(from) + 'ERLY  ' + msToKn(wind.baseSpeed * gustAt(wind, s.camera)).toFixed(0) + ' kn',
               cx, cy + r + 16);
  ctx.fillStyle = 'rgba(150,200,232,.75)';
  ctx.font = '500 10px "IBM Plex Mono", monospace';
  ctx.fillText('from ' + windFromName(from) + ' → blowing ' + windToName(from), cx, cy + r + 30);
}

export function forgetBoat(s, id) { s.wakes.delete(id); }
