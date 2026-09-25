import {
  C0, cutoffF, isValidMode, listModes, makeSampler, modeLabel, modeName, modeState,
} from "./physics.js";

// Every app on mitchyc24.github.io shares one origin, so storage keys carry this app's id.
const APP_ID = "waveguide-modes";
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`${APP_ID}.${key}`); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`${APP_ID}.${key}`, JSON.stringify(value)); } catch { /* private mode or full */ }
  },
};

// ---------------------------------------------------------------- data

// Standard EIA rectangular guides: inside dimensions (mm) and recommended TE10 band (GHz).
const PRESETS = [
  { id: "WR-430", a: 109.22, b: 54.61, band: [1.7, 2.6], use: "L/S-band, broadcast and radar" },
  { id: "WR-284", a: 72.136, b: 34.036, band: [2.6, 3.95], use: "S-band radar" },
  { id: "WR-187", a: 47.549, b: 22.149, band: [3.95, 5.85], use: "C-band satellite" },
  { id: "WR-137", a: 34.849, b: 15.799, band: [5.85, 8.2], use: "C-band links" },
  { id: "WR-90", a: 22.86, b: 10.16, band: [8.2, 12.4], use: "X-band radar" },
  { id: "WR-62", a: 15.799, b: 7.899, band: [12.4, 18], use: "Ku-band satellite" },
  { id: "WR-42", a: 10.668, b: 4.318, band: [18, 26.5], use: "K-band" },
  { id: "WR-28", a: 7.112, b: 3.556, band: [26.5, 40], use: "Ka-band, 5G mmWave" },
  { id: "WR-15", a: 3.759, b: 1.88, band: [50, 75], use: "V-band, 60 GHz links" },
  { id: "WR-10", a: 2.54, b: 1.27, band: [75, 110], use: "W-band, car radar" },
];
const DIELECTRICS = [[1, "air"], [2.1, "PTFE"], [2.2, "RT/duroid"], [3.0, "Rogers RO3003"], [4.4, "FR-4"], [9.8, "alumina"]];

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const DEFAULTS = {
  preset: "WR-90", a: 22.86, b: 10.16, er: 1,
  mode: { type: "TE", m: 1, n: 0 }, f: 10e9,
  plane: "top", slice: 0.5, showE: true, showH: true, shade: "E",
};
const saved = store.get("state", {});
const state = { ...DEFAULTS, ...saved, mode: { ...DEFAULTS.mode, ...(saved.mode || {}) }, playing: !reducedMotion };
if (!isValidMode(state.mode)) state.mode = { ...DEFAULTS.mode };

// ---------------------------------------------------------------- derived quantities

let D = {}; // recomputed by derive()

function guide() { return { a: state.a / 1000, b: state.b / 1000, er: state.er }; }

function derive() {
  const g = guide();
  const dominant = listModes(g, Infinity, 1)[0];
  const fc0 = dominant.fc;
  const fMax = 3.2 * fc0;
  const fMin = 0.25 * fc0;
  state.f = Math.min(fMax, Math.max(fMin, state.f));
  const modes = listModes(g, fMax, 30);
  const distinct = [...new Set(modes.map((md) => md.fc))];
  const s = modeState(g, state.mode, state.f);
  D = {
    g, fc0, fMax, fMin, modes, dominant, s,
    fc1: distinct[1] ?? fMax,
    sampler: makeSampler(g, state.mode, s),
    propagatingCount: modes.filter((md) => md.fc < state.f).length,
  };
}

// ---------------------------------------------------------------- formatting

const $ = (id) => document.getElementById(id);
const fmtGHz = (f) => (f / 1e9).toFixed(f < 10e9 ? 3 : 2);
function fmtLen(m) {
  if (!isFinite(m)) return "∞";
  if (m >= 1) return `${m.toFixed(2)} m`;
  if (m >= 0.1) return `${(m * 100).toFixed(1)} cm`;
  return `${(m * 1000).toFixed(m < 0.01 ? 2 : 1)} mm`;
}
const fmtC = (v) => (isFinite(v) ? `${(v / C0).toFixed(3)} c` : "∞");
const deg = (r) => `${((r * 180) / Math.PI).toFixed(1)}°`;

// ---------------------------------------------------------------- colours

let COL = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  COL = {
    bg: v("--surface"), ink: v("--ink"), muted: v("--muted"), line: v("--line"), grid: v("--grid"),
    accent: v("--accent"), e: v("--e"), h: v("--h"), wall: v("--wall"), ok: v("--ok"),
  };
  COL.eRGB = hexRGB(COL.e);
  COL.hRGB = hexRGB(COL.h);
}
function hexRGB(hex) {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.replace(/./g, "$&$&") : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------- canvas helpers

function fitCanvas(canvas, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = canvas.parentElement.clientWidth;
  const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W; canvas.height = H; canvas.style.height = `${cssH}px`;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  return { ctx, w: cssW, h: cssH };
}

function arrow(ctx, x, y, dx, dy, color, width = 1.6) {
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const x0 = x - dx / 2, y0 = y - dy / 2, x1 = x + dx / 2, y1 = y + dy / 2;
  const ux = dx / len, uy = dy / len, hl = Math.min(6, len * 0.45), hw = hl * 0.6;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * hl * 0.8, y1 - uy * hl * 0.8); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * hl - uy * hw, y1 - uy * hl + ux * hw);
  ctx.lineTo(x1 - ux * hl + uy * hw, y1 - uy * hl - ux * hw);
  ctx.closePath(); ctx.fill();
}

// ⊙ for a component pointing out of the screen, ⊗ for into it.
function glyph(ctx, x, y, v, rMax, color) {
  const r = rMax * Math.min(1, Math.abs(v));
  if (r < 1.6) return;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  if (v > 0) {
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, r * 0.28), 0, Math.PI * 2); ctx.fill();
  } else {
    const q = r * 0.62;
    ctx.beginPath(); ctx.moveTo(x - q, y - q); ctx.lineTo(x + q, y + q); ctx.moveTo(x + q, y - q); ctx.lineTo(x - q, y + q); ctx.stroke();
  }
}

// Low-resolution field-strength map, scaled up smoothly behind the arrows.
const shadeCanvas = document.createElement("canvas");
function shade(ctx, rect, nx, ny, valueAt, rgb) {
  shadeCanvas.width = nx; shadeCanvas.height = ny;
  const sctx = shadeCanvas.getContext("2d");
  const img = sctx.createImageData(nx, ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const t = Math.min(1, valueAt((i + 0.5) / nx, 1 - (j + 0.5) / ny));
      const k = (j * nx + i) * 4;
      img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2];
      img.data[k + 3] = Math.round(255 * 0.42 * t);
    }
  }
  sctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(shadeCanvas, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

const mag = (v) => Math.hypot(v[0], v[1], v[2]);

/**
 * Draw the fields in one plane of the guide.
 * view.h / view.v: field axes (0 x, 1 y, 2 z) drawn left→right and bottom→top.
 * view.o, view.os: the axis pointing out of the screen and its sign (right-handed).
 * view.at(u, v) maps fractions of the drawn rectangle to guide coordinates [x, y, z].
 */
function drawFieldPlane(ctx, rect, view, wt) {
  const { sampler } = D;
  if (state.shade !== "none") {
    const nx = Math.max(8, Math.round(rect.w / 4)), ny = Math.max(4, Math.round(rect.h / 4));
    const rgb = state.shade === "E" ? COL.eRGB : COL.hRGB;
    shade(ctx, rect, nx, ny, (u, v) => mag(sampler(...view.at(u, v), wt)[state.shade]), rgb);
  }
  const cell = view.cell;
  const nu = Math.max(2, Math.round(rect.w / cell)), nv = Math.max(1, Math.round(rect.h / cell));
  const cu = rect.w / nu, cv = rect.h / nv, c = Math.min(cu, cv);
  const draw = (field, color, offset) => {
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const u = (i + 0.5 + offset) / nu, v = (j + 0.5 + offset) / nv;
        if (u >= 1 || v >= 1) continue;
        const f = sampler(...view.at(u, v), wt)[field];
        const px = rect.x + u * rect.w, py = rect.y + (1 - v) * rect.h;
        glyph(ctx, px, py, view.os * f[view.o], c * 0.3, color);
        arrow(ctx, px, py, f[view.h] * c * 0.85, -f[view.v] * c * 0.85, color);
      }
    }
  };
  // E sits at cell centres and H on the lattice offset by half a cell, so they never overlap.
  if (state.showE) draw("E", COL.e, 0);
  if (state.showH) draw("H", COL.h, 0.5);
}

function drawWalls(ctx, rect) {
  ctx.strokeStyle = COL.wall; ctx.lineWidth = 4;
  ctx.strokeRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
}

function label(ctx, text, x, y, align = "center", color = COL.muted, size = 12) {
  ctx.fillStyle = color; ctx.font = `${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------- views

const cvXS = $("cv-xs"), cvLG = $("cv-lg"), cvRay = $("cv-ray"), cvDisp = $("cv-disp");

function drawCrossSection(wt) {
  const W = cvXS.parentElement.clientWidth;
  const { a, b } = D.g;
  const pad = { l: 30, r: 12, t: 12, b: 30 };
  const maxH = Math.min(420, W * 0.9);
  const scale = Math.min((W - pad.l - pad.r) / a, (maxH - pad.t - pad.b) / b);
  const rw = a * scale, rh = b * scale;
  const H = rh + pad.t + pad.b;
  const { ctx } = fitCanvas(cvXS, H);
  const rect = { x: pad.l + (W - pad.l - pad.r - rw) / 2, y: pad.t, w: rw, h: rh };
  drawFieldPlane(ctx, rect, {
    h: 0, v: 1, o: 2, os: 1, cell: Math.max(22, Math.min(40, Math.min(rw, rh * 2) / 10)),
    at: (u, v) => [u * a, v * b, 0],
  }, wt);
  drawWalls(ctx, rect);
  label(ctx, `a = ${state.a} mm  (x →)`, rect.x + rw / 2, rect.y + rh + 18);
  ctx.save(); ctx.translate(rect.x - 18, rect.y + rh / 2); ctx.rotate(-Math.PI / 2);
  label(ctx, `b = ${state.b} mm  (y →)`, 0, 0); ctx.restore();
}

function drawAlongGuide(wt) {
  const W = cvLG.parentElement.clientWidth;
  const { a, b } = D.g, s = D.s;
  const L = 3 * Math.max(a, b);
  const pad = { l: 12, r: 12, t: 30, b: 26 };
  const scale = (W - pad.l - pad.r) / L;
  const top = state.plane === "top";
  const span = top ? a : b;
  const H = Math.max(a, b) * scale + pad.t + pad.b;
  const { ctx } = fitCanvas(cvLG, H);
  const rh = span * scale;
  const rect = { x: pad.l, y: pad.t + (Math.max(a, b) * scale - rh) / 2, w: W - pad.l - pad.r, h: rh };
  const sl = state.slice;
  const view = top
    ? { h: 2, v: 0, o: 1, os: 1, at: (u, v) => [v * a, sl * b, u * L] }
    : { h: 2, v: 1, o: 0, os: -1, at: (u, v) => [sl * a, v * b, u * L] };
  view.cell = Math.max(12, Math.min(26, rh / 5, s.propagating ? (s.lambdaG * scale) / 6 : 26));
  drawFieldPlane(ctx, rect, view, wt);
  // Top and bottom walls only: the guide continues past both ends of the view.
  ctx.strokeStyle = COL.wall; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(rect.x, rect.y - 2); ctx.lineTo(rect.x + rect.w, rect.y - 2);
  ctx.moveTo(rect.x, rect.y + rh + 2); ctx.lineTo(rect.x + rect.w, rect.y + rh + 2);
  ctx.stroke();

  if (s.propagating && s.lambdaG < L) {
    const x0 = rect.x, x1 = rect.x + s.lambdaG * scale, y = rect.y - 16;
    ctx.strokeStyle = COL.muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y - 4); ctx.lineTo(x0, y + 4); ctx.moveTo(x0, y); ctx.lineTo(x1, y);
    ctx.moveTo(x1, y - 4); ctx.lineTo(x1, y + 4); ctx.stroke();
    label(ctx, `λg = ${fmtLen(s.lambdaG)}`, Math.min(x1 + 6, rect.x + rect.w - 80), y, "left");
  } else if (!s.propagating) {
    label(ctx, `evanescent: fades ${(s.attenDbPerM / 100).toFixed(1)} dB per cm`, rect.x, rect.y - 16, "left", COL.ink);
  } else {
    label(ctx, `λg = ${fmtLen(s.lambdaG)} (longer than this view)`, rect.x, rect.y - 16, "left");
  }
  label(ctx, "z → direction of travel", rect.x + rect.w, rect.y + rh + 16, "right");
  const axis = top ? "x ↑" : "y ↑";
  label(ctx, axis, rect.x, rect.y + rh + 16, "left");
  $("lg-sub").textContent = top ? "top view, looking down on the broad wall" : "side view, looking at the narrow wall";
  $("slice-label").textContent = top ? `Slice at y = ${(sl * state.b).toFixed(1)} mm` : `Slice at x = ${(sl * state.a).toFixed(1)} mm`;
}

let rayT = 0; // seconds of animation time for the ray picture
function drawRays() {
  const W = cvRay.parentElement.clientWidth;
  const s = D.s, md = state.mode, { a, b } = D.g;
  const pad = { l: 12, r: 12, t: 16, b: 28 };
  const H = 170;
  const { ctx } = fitCanvas(cvRay, H);
  const rh = H - pad.t - pad.b;
  const rect = { x: pad.l, y: pad.t, w: W - pad.l - pad.r, h: rh };
  // Draw across the width the waves bounce between: a for TEm0, b for TE0n,
  // and one transverse half-wavelength (π/kc) for modes that vary in both directions.
  const span = md.n === 0 ? a : md.m === 0 ? b : Math.PI / s.kc;
  const scale = rh / span;
  const Lam = s.lambda * scale;                 // plane-wave wavelength in px
  const cpx = 70;                               // speed of light on screen, px/s
  const th = s.theta, ct = Math.cos(th), st = Math.sin(th);
  const tt = rayT;

  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  if (s.propagating && Lam > 5) {
    // Wavefronts (crests) of the up-going and down-going plane waves.
    ctx.lineWidth = 1.2;
    for (const [dir, off, dash] of [[1, 0, []], [-1, 0.5, [4, 4]]]) {
      ctx.strokeStyle = COL.muted; ctx.globalAlpha = 0.5; ctx.setLineDash(dash);
      // crest: z·cosθ + dir·x·sinθ = c·t + (k + off)·Λ
      const lo = Math.floor((-cpx * tt - rh * st) / Lam) - 2;
      const hi = Math.ceil((rect.w * ct + rh * st - cpx * tt) / Lam) + 2;
      for (let k = lo; k <= hi; k++) {
        const P = cpx * tt + (k + off) * Lam;
        const zAt = (x) => (P - dir * x * st) / Math.max(ct, 1e-6);
        ctx.beginPath();
        ctx.moveTo(rect.x + zAt(0), rect.y + rh);
        ctx.lineTo(rect.x + zAt(rh), rect.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);
  }
  // Zig-zag ray path.
  const run = rh / Math.tan(Math.max(th, 1e-3));   // horizontal distance per bounce
  ctx.strokeStyle = COL.ink; ctx.globalAlpha = s.propagating ? 0.55 : 0.2; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
  ctx.beginPath();
  if (s.propagating) {
    let z = 0, up = true; ctx.moveTo(rect.x, rect.y + rh);
    while (z < rect.w + run) { z += run; ctx.lineTo(rect.x + z, up ? rect.y : rect.y + rh); up = !up; }
  } else {
    ctx.moveTo(rect.x + 30, rect.y + rh); ctx.lineTo(rect.x + 30, rect.y);
  }
  ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  if (s.propagating) {
    // Energy: a point riding the ray at c, so its forward speed is c·cosθ = v_g.
    const leg = rh / Math.max(st, 1e-6);         // path length per bounce
    const dist = (cpx * tt) % (rect.w / Math.max(ct, 0.02));
    const nb = Math.floor(dist / leg), rem = dist - nb * leg;
    const zE = dist * ct;
    const xE = nb % 2 === 0 ? rem * st : rh - rem * st;
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(rect.x + zE, rect.y + rh - xE, 6, 0, Math.PI * 2); ctx.fill();
    // Phase: where the up-going crests meet the bottom wall, moving at c/cosθ = v_p.
    if (Lam > 5) {
      ctx.fillStyle = COL.accent;
      const step = Lam / Math.max(ct, 1e-6);
      const first = ((cpx * tt) / Math.max(ct, 1e-6)) % step;
      for (let z = first; z < rect.w; z += step) {
        ctx.beginPath(); ctx.moveTo(rect.x + z, rect.y + rh - 12); ctx.lineTo(rect.x + z - 6, rect.y + rh);
        ctx.lineTo(rect.x + z + 6, rect.y + rh); ctx.closePath(); ctx.fill();
      }
    }
  }
  ctx.restore();
  ctx.strokeStyle = COL.wall; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(rect.x, rect.y - 2); ctx.lineTo(rect.x + rect.w, rect.y - 2);
  ctx.moveTo(rect.x, rect.y + rh + 2); ctx.lineTo(rect.x + rect.w, rect.y + rh + 2);
  ctx.stroke();
  if (!s.propagating) {
    ctx.fillStyle = COL.bg; ctx.globalAlpha = 0.85;
    ctx.fillRect(rect.x + 40, rect.y + rh / 2 - 22, rect.w - 40, 44); ctx.globalAlpha = 1;
    const cx = rect.x + 40 + (rect.w - 40) / 2;
    label(ctx, `sin θ = fc/f = ${(s.fc / s.f).toFixed(2)}, more than 1`, cx, rect.y + rh / 2 - 9, "center", COL.ink, 13);
    label(ctx, "No bounce angle fits: nothing travels.", cx, rect.y + rh / 2 + 10, "center", COL.ink, 13);
  }
  const spanName = md.n === 0 ? "a" : md.m === 0 ? "b" : "π/kc";
  label(ctx, `walls ${spanName} = ${fmtLen(span)} apart`, rect.x, H - 11, "left");
  label(ctx, "z →", rect.x + rect.w, H - 11, "right");
}

function updateRayText() {
  const s = D.s, md = state.mode;
  $("ray-sub").textContent = s.propagating ? `θ = ${deg(s.theta)} from the axis` : "below cutoff";
  const note = md.m > 0 && md.n > 0
    ? " This mode bounces off all four walls; the view shows the plane its waves bounce in, one half-wave wide."
    : "";
  $("ray-key").innerHTML = s.propagating
    ? `Two plane waves (their crests are the solid and dashed lines) travel at the speed of light and zig-zag at angle θ, where sin θ = f<sub>c</sub>/f.
       <b>●</b> Energy moves forward at c cos θ = ${fmtC(s.vg)} (group velocity).
       <b style="color:var(--accent)">▲</b> Where a crest meets the wall moves at c / cos θ = ${fmtC(s.vp)} (phase velocity).${note}`
    : `Below cutoff the waves would have to bounce straight across, making no progress. The field fades as e<sup>−αz</sup> instead.${note}`;
}

// ---- dispersion chart

const CH = { pad: { l: 50, r: 14, t: 14, b: 40 } };
function chartGeom() {
  const W = cvDisp.parentElement.clientWidth;
  const H = Math.round(Math.min(340, Math.max(230, W * 0.55)));
  const { l, r, t, b } = CH.pad;
  const kMax = (2 * Math.PI * D.fMax * Math.sqrt(state.er)) / C0;
  return {
    W, H, x0: l, x1: W - r, y0: H - b, y1: t, kMax,
    X: (f) => l + (f / D.fMax) * (W - l - r),
    Y: (beta) => H - b - (beta / kMax) * (H - b - t),
    F: (px) => ((px - l) / (W - l - r)) * D.fMax,
  };
}
function niceStep(range, target) {
  const raw = range / target, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return p * (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10);
}
function betaAt(fc, f) {
  const k = (2 * Math.PI * f * Math.sqrt(state.er)) / C0, kc = (2 * Math.PI * fc * Math.sqrt(state.er)) / C0;
  return f > fc ? Math.sqrt(k * k - kc * kc) : NaN;
}

let hoverF = null;
function drawDispersion() {
  const G = chartGeom();
  const { ctx } = fitCanvas(cvDisp, G.H);
  const selFc = D.s.fc;

  // single-mode band
  ctx.fillStyle = COL.ok; ctx.globalAlpha = 0.08;
  ctx.fillRect(G.X(D.fc0), G.y1, G.X(Math.min(D.fc1, D.fMax)) - G.X(D.fc0), G.y0 - G.y1);
  ctx.globalAlpha = 1;
  label(ctx, "single-mode band", (G.X(D.fc0) + G.X(Math.min(D.fc1, D.fMax))) / 2, G.y1 + 10, "center", COL.muted, 11);

  // grid + ticks
  ctx.lineWidth = 1; ctx.strokeStyle = COL.grid;
  const fStep = niceStep(D.fMax / 1e9, Math.max(3, Math.min(8, G.W / 80))) * 1e9;
  for (let f = 0; f <= D.fMax + 1; f += fStep) {
    const x = G.X(f);
    ctx.beginPath(); ctx.moveTo(x, G.y0); ctx.lineTo(x, G.y1); ctx.stroke();
    label(ctx, `${+(f / 1e9).toFixed(2)}`, x, G.y0 + 12);
  }
  label(ctx, "frequency (GHz)", (G.x0 + G.x1) / 2, G.H - 10);
  const bStep = niceStep(G.kMax, 5);
  for (let v = 0; v <= G.kMax; v += bStep) {
    const y = G.Y(v);
    ctx.beginPath(); ctx.moveTo(G.x0, y); ctx.lineTo(G.x1, y); ctx.stroke();
    label(ctx, `${Math.round(v)}`, G.x0 - 6, y, "right");
  }
  ctx.save(); ctx.translate(12, (G.y0 + G.y1) / 2); ctx.rotate(-Math.PI / 2);
  label(ctx, "β (rad/m)", 0, 0); ctx.restore();

  // light line
  ctx.strokeStyle = COL.muted; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(G.X(0), G.Y(0)); ctx.lineTo(G.X(D.fMax), G.Y(G.kMax)); ctx.stroke(); ctx.setLineDash([]);
  const ll = D.fMax * 0.62;
  label(ctx, "no walls", G.X(ll) - 6, G.Y(betaAt(0, ll)) - 8, "right", COL.muted, 11);

  // mode curves; degenerate modes share one curve
  const curve = (fc, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    const n = 120;
    for (let i = 0; i <= n; i++) {
      const f = fc + (D.fMax - fc) * (i / n) ** 2; // denser samples near cutoff where the curve is steep
      const x = G.X(f), y = G.Y(betaAt(fc, f) || 0);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  };
  const fcs = [...new Set(D.modes.map((md) => md.fc))];
  for (const fc of fcs) if (fc !== selFc) curve(fc, COL.muted, 1.2);
  if (selFc < D.fMax) curve(selFc, COL.accent, 2.5);
  // cutoff ticks on the axis
  ctx.fillStyle = COL.muted;
  for (const fc of fcs) { ctx.fillRect(G.X(fc) - 1, G.y0 - 5, 2, 5); }

  // operating frequency
  const xf = G.X(state.f);
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(xf, G.y0); ctx.lineTo(xf, G.y1); ctx.stroke();
  for (const fc of fcs) {
    const bta = betaAt(fc, state.f);
    if (!isNaN(bta) && fc !== selFc) {
      ctx.fillStyle = COL.muted; ctx.beginPath(); ctx.arc(xf, G.Y(bta), 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  const bSel = betaAt(selFc, state.f);
  if (!isNaN(bSel)) {
    ctx.fillStyle = COL.bg; ctx.beginPath(); ctx.arc(xf, G.Y(bSel), 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.accent; ctx.beginPath(); ctx.arc(xf, G.Y(bSel), 5, 0, Math.PI * 2); ctx.fill();
  }
  // direct label for the selected curve
  if (selFc < D.fMax) {
    const fl = D.fMax * 0.985;
    const names = D.modes.filter((md) => md.fc === selFc).map(modeName).join(" / ");
    label(ctx, names, G.X(fl), G.Y(betaAt(selFc, fl)) + 12, "right", COL.ink, 12);
  }
  if (hoverF != null) {
    const x = G.X(hoverF);
    ctx.strokeStyle = COL.muted; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(x, G.y0); ctx.lineTo(x, G.y1); ctx.stroke(); ctx.setLineDash([]);
  }
}

function showTip(f, px, py) {
  const tip = $("tip");
  const on = D.modes.filter((md) => md.fc < f);
  const sel = betaAt(D.s.fc, f);
  tip.innerHTML = `<b>${fmtGHz(f)} GHz</b><br>${on.length ? `${on.length} mode${on.length > 1 ? "s" : ""}: ${on.slice(0, 6).map(modeName).join(", ")}${on.length > 6 ? "…" : ""}` : "nothing propagates"}`
    + `<br>${modeName(state.mode)}: ${isNaN(sel) ? "cut off" : `β = ${sel.toFixed(0)} rad/m`}`;
  tip.hidden = false;
  const wrap = cvDisp.parentElement.clientWidth;
  const tw = tip.offsetWidth;
  tip.style.left = `${Math.min(wrap - tw - 4, Math.max(4, px + 12))}px`;
  tip.style.top = `${Math.max(4, py - 60)}px`;
}

// ---------------------------------------------------------------- controls & readouts

function renderReadout() {
  const s = D.s, md = state.mode, name = modeLabel(md);
  const st = $("status");
  const others = D.propagatingCount;
  if (s.propagating) {
    st.className = "status ok";
    st.innerHTML = `<strong>${name} propagates</strong>${
      others === 1 ? "It is the only mode that can travel at this frequency." : `${others} modes can travel at this frequency.`}`;
  } else {
    st.className = "status warn";
    st.innerHTML = `<strong>${name} is cut off</strong>Below its ${fmtGHz(s.fc)} GHz cutoff the field fades by ${(s.attenDbPerM / 100).toFixed(1)} dB every centimetre.${
      others ? ` ${others} other mode${others > 1 ? "s" : ""} can travel here.` : " No mode can travel here."}`;
  }
  const rows = [
    ["Cutoff f<sub>c</sub>", `${fmtGHz(s.fc)} GHz`],
    ["f / f<sub>c</sub>", (s.f / s.fc).toFixed(3)],
    ["Wavelength λ (no walls)", fmtLen(s.lambda)],
    ["Cutoff wavelength λ<sub>c</sub>", fmtLen(s.lambdaC)],
  ];
  if (s.propagating) {
    rows.push(
      ["Guide wavelength λ<sub>g</sub>", fmtLen(s.lambdaG)],
      ["Phase constant β", `${s.beta.toFixed(1)} rad/m`],
      ["Phase velocity v<sub>p</sub>", fmtC(s.vp)],
      ["Group velocity v<sub>g</sub>", fmtC(s.vg)],
      ["Delay", `${(1e9 / s.vg).toFixed(2)} ns/m`],
      ["Wave impedance Z", `${s.Z.toFixed(0)} Ω`],
      ["Bounce angle θ", deg(s.theta)],
    );
  } else {
    rows.push(
      ["Attenuation α", `${s.alpha.toFixed(1)} Np/m`],
      ["", `${s.attenDbPerM.toFixed(0)} dB/m`],
      ["Falls to 1/e in", fmtLen(1 / s.alpha)],
      ["Wave impedance Z", `j${s.Z.toFixed(0)} Ω (${s.Zreactive})`],
    );
  }
  $("readout").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

  // mode hint
  const twins = D.modes.filter((o) => o.fc === s.fc && modeName(o) !== modeName(md));
  const bits = [];
  if (modeName(md) === modeName(D.dominant)) bits.push("The dominant mode: lowest cutoff of all.");
  if (twins.length) bits.push(`Degenerate with ${twins.map(modeLabel).join(", ")}: same cutoff, different pattern.`);
  if (md.type === "TM") bits.push("TM modes need m ≥ 1 and n ≥ 1.");
  $("mode-hint").innerHTML = bits.join(" ");

  // mode controls
  document.querySelectorAll("[data-type]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.type === md.type)));
  $("m-out").textContent = md.m; $("n-out").textContent = md.n;
  document.querySelectorAll("[data-step]").forEach((b) => {
    const k = b.dataset.step, d = +b.dataset.d;
    const next = { ...md, [k]: md[k] + d };
    b.disabled = next[k] > 9 || !isValidMode(next);
  });

  // ladder + quick select
  const inList = D.modes.some((o) => modeName(o) === modeName(md));
  const list = inList ? D.modes : [...D.modes, { ...md, fc: s.fc }];
  $("ladder").innerHTML = list.map((o) => {
    const on = o.fc < state.f;
    return `<button type="button" class="${on ? "on" : "off"}" data-mode="${modeName(o)}" aria-pressed="${modeName(o) === modeName(md)}">
      <span>${modeLabel(o)}</span><small>${fmtGHz(o.fc)} GHz</small></button>`;
  }).join("");
  $("mode-quick").innerHTML = list.map((o) =>
    `<option value="${modeName(o)}" ${modeName(o) === modeName(md) ? "selected" : ""}>${modeName(o)}${o.fc < state.f ? "" : " (cut off)"}</option>`).join("");

  // guide controls
  $("preset").value = state.preset;
  if (document.activeElement !== $("dim-a")) $("dim-a").value = state.a;
  if (document.activeElement !== $("dim-b")) $("dim-b").value = state.b;
  $("er").value = state.er;
  const known = DIELECTRICS.find(([v]) => Math.abs(v - state.er) < 0.02);
  $("er-name").textContent = `${state.er.toFixed(2)}${known ? ` · ${known[1]}` : ""}`;

  // frequency
  const fr = $("f");
  fr.value = (state.f - D.fMin) / (D.fMax - D.fMin);
  fr.setAttribute("aria-valuetext", `${fmtGHz(state.f)} GHz`);
  if (document.activeElement !== $("f-num")) $("f-num").value = fmtGHz(state.f);
  $("f-num").min = (D.fMin / 1e9).toFixed(3); $("f-num").max = (D.fMax / 1e9).toFixed(3);

  // canvases' accessible descriptions
  cvXS.setAttribute("aria-label", `Cross-section of ${modeName(md)} in a ${state.a} by ${state.b} mm guide at ${fmtGHz(state.f)} GHz`);
  cvDisp.setAttribute("aria-label", `Dispersion diagram up to ${fmtGHz(D.fMax)} GHz; ${D.propagatingCount} modes propagate at ${fmtGHz(state.f)} GHz`);
  updateRayText();
}

function persist() {
  const { playing, ...rest } = state;
  void playing;
  store.set("state", rest);
}

let dirty = true;
function update() {
  derive();
  renderReadout();
  persist();
  dirty = true;
}

function setMode(md) {
  if (!isValidMode(md)) return;
  state.mode = { type: md.type, m: md.m, n: md.n };
  update();
}
function parseMode(name) {
  const m = /^(TE|TM)(\d)(\d)$/.exec(name);
  return m && { type: m[1], m: +m[2], n: +m[3] };
}
function setPreset(id) {
  const p = PRESETS.find((q) => q.id === id);
  state.preset = id;
  if (p) {
    state.a = p.a; state.b = p.b;
    state.f = ((p.band[0] + p.band[1]) / 2) * 1e9 / Math.sqrt(state.er);
  }
  update();
}

// preset list
$("preset").innerHTML = PRESETS.map((p) =>
  `<option value="${p.id}">${p.id} · ${p.band[0]}–${p.band[1]} GHz · ${p.use}</option>`).join("")
  + `<option value="custom">Custom size</option>`;
$("preset").addEventListener("change", (e) => setPreset(e.target.value));
for (const [id, key] of [["dim-a", "a"], ["dim-b", "b"]]) {
  $(id).addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    if (!(v >= 0.5 && v <= 500)) return;
    state[key] = v; state.preset = "custom";
    update();
  });
  $(id).addEventListener("change", () => update());
}
$("er").addEventListener("input", (e) => { state.er = +e.target.value; update(); });
document.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => {
  const md = { ...state.mode, type: b.dataset.type };
  if (md.type === "TM") { md.m = Math.max(1, md.m); md.n = Math.max(1, md.n); }
  setMode(md);
}));
document.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
  const k = b.dataset.step;
  setMode({ ...state.mode, [k]: state.mode[k] + +b.dataset.d });
}));
$("ladder").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mode]");
  if (b) setMode(parseMode(b.dataset.mode));
});
$("mode-quick").addEventListener("change", (e) => setMode(parseMode(e.target.value)));
$("f").addEventListener("input", (e) => { state.f = D.fMin + +e.target.value * (D.fMax - D.fMin); update(); });
$("f-num").addEventListener("change", (e) => {
  const v = parseFloat(e.target.value);
  if (v > 0) { state.f = v * 1e9; update(); }
  e.target.value = fmtGHz(state.f);
});
$("show-e").addEventListener("change", (e) => { state.showE = e.target.checked; update(); });
$("show-h").addEventListener("change", (e) => { state.showH = e.target.checked; update(); });
$("shade").addEventListener("change", (e) => { state.shade = e.target.value; update(); });
document.querySelectorAll("[data-plane]").forEach((b) => b.addEventListener("click", () => {
  state.plane = b.dataset.plane;
  document.querySelectorAll("[data-plane]").forEach((q) => q.setAttribute("aria-checked", String(q === b)));
  update();
}));
$("slice").addEventListener("input", (e) => { state.slice = +e.target.value; update(); });

function syncStaticControls() {
  $("show-e").checked = state.showE; $("show-h").checked = state.showH; $("shade").value = state.shade;
  $("slice").value = state.slice;
  document.querySelectorAll("[data-plane]").forEach((q) => q.setAttribute("aria-checked", String(q.dataset.plane === state.plane)));
}

// play / pause
function setPlaying(p) {
  state.playing = p;
  $("play").textContent = p ? "❚❚" : "▶";
  $("play").setAttribute("aria-label", p ? "Pause animation" : "Play animation");
}
$("play").addEventListener("click", () => setPlaying(!state.playing));

// dispersion chart: hover shows a tooltip, pressing and dragging sets the frequency
let dragging = false;
function chartF(e) {
  const r = cvDisp.getBoundingClientRect();
  const G = chartGeom();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const f = Math.min(D.fMax, Math.max(D.fMin, G.F(px)));
  return { f, px, py };
}
cvDisp.addEventListener("pointerdown", (e) => {
  dragging = true; cvDisp.setPointerCapture(e.pointerId);
  const { f, px, py } = chartF(e);
  state.f = f; hoverF = f; update(); showTip(f, px, py);
});
cvDisp.addEventListener("pointermove", (e) => {
  const { f, px, py } = chartF(e);
  hoverF = f;
  if (dragging) { state.f = f; update(); } else dirty = true;
  showTip(f, px, py);
});
const endDrag = () => { dragging = false; };
cvDisp.addEventListener("pointerup", endDrag);
cvDisp.addEventListener("pointercancel", endDrag);
cvDisp.addEventListener("pointerleave", () => { if (!dragging) { hoverF = null; $("tip").hidden = true; dirty = true; } });

// ---------------------------------------------------------------- guided tour

const TOUR = [
  {
    title: "A pipe for microwaves",
    apply: { preset: "WR-90", er: 1, mode: "TE10", f: 10, plane: "top" },
    html: `<p>This is <b>WR-90</b>, the standard guide for X-band (8.2–12.4 GHz) radar and satellite links: a hollow metal tube
      22.86 × 10.16 mm inside. At 10 GHz it carries the <b>TE<sub>10</sub></b> mode.</p>
      <p>In the cross-section, the <span style="color:var(--e)">electric field</span> runs straight between the broad walls. It is
      strongest in the middle and zero at the side walls, because E cannot run along a metal surface: exactly one half-wave fits across <i>a</i>.
      The <span style="color:var(--h)">magnetic field</span> forms loops, which you can see in the top view along the guide.</p>`,
    look: "Look at: the cross-section and the along-the-guide view. Press ❚❚ to freeze time.",
  },
  {
    title: "Cutoff: when the wave won't fit",
    apply: { preset: "WR-90", er: 1, mode: "TE10", f: 5.5, plane: "top" },
    html: `<p>TE<sub>10</sub>'s cutoff is <b>6.56 GHz</b>, the frequency where the broad wall is exactly half a wavelength wide.
      At 5.5 GHz the half-wave no longer fits.</p>
      <p>Along the guide the pattern stops travelling: it pulses in place and fades within a couple of centimetres. That is an
      <b>evanescent</b> field, and no power gets through. A waveguide is a <b>high-pass filter</b>.</p>`,
    look: "Try: drag the frequency slider up past 6.56 GHz and watch the wave start to move.",
  },
  {
    title: "Two plane waves, bouncing",
    apply: { preset: "WR-90", er: 1, mode: "TE10", f: 7.0 },
    html: `<p>Every waveguide mode can be built from two ordinary plane waves travelling at the speed of light and zig-zagging
      between the walls. Just above cutoff they bounce almost straight across, so the energy (●) creeps forward slowly.</p>
      <p>Raise the frequency and the angle flattens, so the energy moves faster. The point where a crest meets the wall (▲)
      always moves <em>faster</em> than light, but it is only a pattern and carries no energy or information.</p>`,
    look: "Look at: bouncing plane waves. Drag the frequency between 6.6 and 19 GHz.",
  },
  {
    title: "Higher-order modes",
    apply: { preset: "WR-90", er: 1, mode: "TE20", f: 16, plane: "top" },
    html: `<p>Above 13.11 GHz two half-waves fit across <i>a</i>: that is <b>TE<sub>20</sub></b>. Its electric field points one way on
      the left half and the other way on the right.</p>
      <p>Now step through <b>TE<sub>01</sub></b>, <b>TE<sub>11</sub></b> and <b>TM<sub>11</sub></b>. TE<sub>11</sub> and TM<sub>11</sub> switch on at the same
      frequency (they are <em>degenerate</em>) but look completely different: TM modes have E pointing <em>along</em> the guide
      (the ⊙ and ⊗ symbols in the cross-section) where TE modes have H along it.</p>`,
    look: "Try: the mode ladder under the dispersion chart, or the m and n steppers.",
  },
  {
    title: "Single-mode operation",
    apply: { preset: "WR-90", er: 1, mode: "TE10", f: 11 },
    html: `<p>Between 6.56 and 13.11 GHz only TE<sub>10</sub> can travel (the shaded band on the dispersion chart). One mode means one
      predictable field pattern and one speed, which is what radios and antennas want.</p>
      <p>That is why standard guides are about twice as wide as they are tall: TE<sub>20</sub> and TE<sub>01</sub> both stay out until about twice
      the dominant cutoff. WR-90's recommended band, 8.2–12.4 GHz, keeps clear of both edges.</p>`,
    look: "Try: make b larger than a/2 and watch TE01 invade the single-mode band.",
  },
  {
    title: "Dispersion",
    apply: { preset: "WR-90", er: 1, mode: "TE10", f: 8.2 },
    html: `<p>Each curve on the dispersion chart shows how the phase constant β (radians of phase per metre) grows with frequency.
      Without walls a wave would follow the dashed line. The guide's curves start at their cutoffs and bend towards it.</p>
      <p>Where a curve is steep, the <b>group velocity is low</b>: at WR-90's 8.2 GHz band edge energy travels at 0.60 c, at 12 GHz
      at 0.84 c. Because the speed depends on frequency, short pulses smear out, most of all near cutoff.</p>`,
    look: "Look at: the dispersion chart and the group velocity readout. Drag across the chart.",
  },
  {
    title: "Size sets the band",
    apply: { preset: "WR-284", er: 1, mode: "TE10", f: 3.0 },
    html: `<p>The guide scales with wavelength. <b>WR-284</b> (72 × 34 mm) carries S-band radar at 3 GHz; <b>WR-15</b> carries
      60 GHz links in a tube smaller than a pencil.</p>
      <p>Filling the guide with a dielectric lowers every cutoff by √ε<sub>r</sub>, so a filled guide can be smaller for the same band.
      Try ε<sub>r</sub> = 2.1 (PTFE). Where the guide meets an antenna, a flared <b>horn</b> or a row of <b>slots</b> lets the wave out
      into free space; see <em>Waveguides and antennas</em> below.</p>`,
    look: "Try: other standard sizes in the Guide menu.",
  },
];

let tourIdx = Math.min(TOUR.length - 1, Math.max(0, store.get("tour", 0)));
function renderTour(apply) {
  const t = TOUR[tourIdx];
  $("steps").innerHTML = TOUR.map((s, i) =>
    `<li><button type="button" data-i="${i}" aria-label="Step ${i + 1}: ${s.title}" ${i === tourIdx ? 'aria-current="step"' : ""}>${i + 1}</button></li>`).join("");
  $("tour-body").innerHTML = `<h3>${tourIdx + 1}. ${t.title}</h3>${t.html}<p class="look">${t.look}</p>`;
  $("tour-prev").disabled = tourIdx === 0;
  $("tour-next").textContent = tourIdx === TOUR.length - 1 ? "Start over" : "Next";
  store.set("tour", tourIdx);
  if (apply) {
    const a = t.apply;
    if (a.er != null) state.er = a.er;
    if (a.preset) { const p = PRESETS.find((q) => q.id === a.preset); state.preset = p.id; state.a = p.a; state.b = p.b; }
    if (a.mode) state.mode = parseMode(a.mode);
    if (a.f != null) state.f = a.f * 1e9;
    if (a.plane) state.plane = a.plane;
    syncStaticControls();
    update();
  }
}
$("steps").addEventListener("click", (e) => {
  const b = e.target.closest("[data-i]");
  if (b) { tourIdx = +b.dataset.i; renderTour(true); }
});
$("tour-prev").addEventListener("click", () => { tourIdx = Math.max(0, tourIdx - 1); renderTour(true); });
$("tour-next").addEventListener("click", () => { tourIdx = (tourIdx + 1) % TOUR.length; renderTour(true); });

// ---------------------------------------------------------------- loop

let wt = Math.PI / 2; // ωt on screen; starts where TE10's transverse E is at its peak
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.playing && !document.hidden) {
    wt += dt * 2 * Math.PI * 0.45;
    rayT += dt;
    dirty = true;
  }
  if (dirty) {
    dirty = false;
    drawCrossSection(wt);
    drawAlongGuide(wt);
    drawRays();
    drawDispersion();
  }
  requestAnimationFrame(frame);
}

readColors();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColors(); dirty = true; });
new ResizeObserver(() => { dirty = true; }).observe(document.querySelector(".views"));
syncStaticControls();
setPlaying(state.playing);
derive();
renderTour(false);
update();
requestAnimationFrame(frame);
