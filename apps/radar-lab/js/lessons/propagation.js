// Lesson 8: propagation. Earth curvature and refraction set the radar horizon; ducts trap rays; reflections off the
// sea make lobes and nulls; air and rain absorb. Rays are traced numerically through the chosen refractivity profile.
import {
  h, C0, RE, card, labGrid, group, notes, slider, choice, select, readout, status, legend,
  canvasView, drag, axes, plotFn, theme, alpha, label, ticks, num, si, km, fmtDb, clamp, lerp, TAU,
} from "../ui.js";

const RE_N = 1e6 / RE * 1000;       // Earth's curvature in M-units per km: 156.96
const ZOOMS = {
  near: { X: 60e3, H: 300, name: "Near · 60 km × 300 m" },
  mid: { X: 200e3, H: 3000, name: "Medium · 200 km × 3 km" },
  far: { X: 500e3, H: 15000, name: "Far · 500 km × 15 km" },
};
const PRESETS = {
  none: { g: 0, name: "No atmosphere" },
  standard: { g: -40, name: "Standard (4/3 Earth)" },
  sub: { g: 40, name: "Sub-refraction" },
  super: { g: -110, name: "Super-refraction" },
  duct: { g: -40, name: "Surface duct" },
};
const DUCT_TOP = 100, DUCT_G = -300;  // m, N/km
const SURFACES = {
  calm: { name: "Calm sea", g0: -0.99, sh: 0.05 },
  rough: { name: "Rough sea (1 m waves)", g0: -0.99, sh: 0.5 },
  land: { name: "Flat land", g0: -0.75, sh: 0.1 },
  forest: { name: "Rough land / trees", g0: -0.4, sh: 2 },
  none: { name: "No reflection", g0: 0, sh: 0 },
};

// ITU-R P.838-3 rain coefficients (horizontal pol.) and sea-level clear-air attenuation read off ITU-R P.676.
const RAIN = [[1, 0.0000259, 0.9691], [2, 0.0000847, 1.0664], [3, 0.000139, 1.2322], [4, 0.0001071, 1.6009], [5, 0.0002162, 1.6969],
  [6, 0.0007056, 1.59], [8, 0.004115, 1.3905], [10, 0.01217, 1.2571], [12, 0.02386, 1.1825], [15, 0.04481, 1.1233], [20, 0.09164, 1.0568],
  [25, 0.1571, 0.9991], [30, 0.2403, 0.9485], [35, 0.3374, 0.9047], [40, 0.4431, 0.8673], [50, 0.66, 0.8084], [60, 0.8606, 0.7656],
  [70, 1.0315, 0.7345], [80, 1.1704, 0.7115], [90, 1.2807, 0.6944], [100, 1.3671, 0.6815]];
const GAS = [[1, 0.0055], [2, 0.0068], [5, 0.0085], [10, 0.013], [15, 0.028], [20, 0.09], [22.2, 0.19], [25, 0.13], [30, 0.09], [35, 0.085],
  [40, 0.11], [45, 0.18], [50, 0.4], [54, 2.5], [57, 9], [60, 15], [63, 9], [66, 2.5], [70, 0.55], [80, 0.3], [90, 0.34], [100, 0.45]];
function interp(tab, fG, col, logY) {
  let i = tab.findIndex((r) => r[0] >= fG);
  if (i <= 0) i = i === 0 ? 1 : tab.length - 1;
  const a = tab[i - 1], b = tab[i];
  const t = (Math.log10(fG) - Math.log10(a[0])) / (Math.log10(b[0]) - Math.log10(a[0]));
  return logY ? 10 ** lerp(Math.log10(a[col]), Math.log10(b[col]), t) : lerp(a[col], b[col], t);
}
const rainDbKm = (f, R) => (R > 0 ? interp(RAIN, f / 1e9, 1, true) * R ** clamp(interp(RAIN, f / 1e9, 2, false), 0.6, 1.8) : 0);
const gasDbKm = (f) => (f < 1e9 ? 0.0055 * (f / 1e9) ** 0.3 : interp(GAS, f / 1e9, 1, true));

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "Radar waves don't travel in perfectly straight lines over a flat world. The Earth curves away, the atmosphere bends rays back down, " +
      "the sea acts as a mirror that makes echoes fade in and out, and air and rain soak up energy. Trace rays through the atmosphere and see where a radar can and can't see." }));

    const S = {
      hr: 20, ht: 30, R: 38e3, preset: "standard", g: -40, zoom: "near",
      f: 3e9, surface: "calm", rain: 0, R0: 80e3,
      visible: true, F4db: 0, hor: 0,
    };
    let touring = false;
    let tr = null; // cached ray trace

    api.steps(root, [
      { title: "1 · The Earth curves away", html:
        "<p>With no atmosphere, radio travels in straight lines and the radar can only see to the geometric horizon. For an antenna at height <i>h</i>, the distance to the horizon is</p>" +
        "<p class=\"eq\"><i>d</i> = √(2 <i>R</i><sub>e</sub> <i>h</i>) ≈ 3.57 √<i>h</i> km &nbsp; (<i>h</i> in metres)</p><p>A 20 m mast sees 16 km to the sea surface; a target 30 m up can be seen 35.5 km away.</p>",
        look: "the shaded shadow zone beyond the horizon. The 30 m target at 38 km is hidden.",
        apply: () => setup({ preset: "none", hr: 20, ht: 30, R: 38e3, zoom: "near", f: 3e9, rain: 0, surface: "calm", R0: 80e3 }) },
      { title: "2 · The air bends rays down", html:
        "<p>Air gets thinner with height, so its refractive index falls and rays curve gently back toward the ground. In a standard atmosphere the gradient is about −40 N-units per km, and rays behave as if they were straight over an Earth <b>4/3</b> bigger:</p>" +
        "<p class=\"eq\"><i>d</i> ≈ 4.12 (√<i>h</i><sub>r</sub> + √<i>h</i><sub>t</sub>) km</p>",
        look: "the same target is now just above the horizon.", apply: () => setup({ preset: "standard", hr: 20, ht: 30, R: 38e3, zoom: "near", f: 3e9, rain: 0, R0: 80e3 }) },
      { title: "3 · Height beats power", html:
        "<p>No amount of transmitter power sees below the horizon. A destroyer's radar 30 m up sees a sea-skimming missile at 5 m only from 32 km, under a minute of warning at Mach 0.9. That's why <b>airborne early warning</b> aircraft fly at 9 km: their horizon is over 400 km away.</p>",
        look: "the AEW radar at 9 km seeing a 50 m-high target 380 km away.", apply: () => setup({ preset: "standard", hr: 9000, ht: 50, R: 380e3, zoom: "far", R0: 450e3 }) },
      { title: "4 · Ducting", html:
        "<p>When the refractivity falls faster than −157 N/km (often over a warm sea, or under a temperature inversion), rays curve more than the Earth does. They are <b>trapped</b> in a duct and bounce along the surface far beyond the normal horizon. Radars then see ships hundreds of km away, along with unexpected sea clutter, while targets just above the duct can vanish into a <b>radio hole</b>.</p>",
        look: "rays launched below ~0.3° are trapped in the 100 m duct; the 10 m target at 55 km, far beyond the normal 31 km horizon, is visible.", apply: () => setup({ preset: "duct", hr: 20, ht: 10, R: 55e3, zoom: "near", R0: 80e3 }) },
      { title: "5 · Multipath: the sea as a mirror", html:
        "<p>An echo also reaches the target by bouncing off the sea. The direct and reflected waves travel slightly different distances, Δ ≈ 2<i>h</i><sub>r</sub><i>h</i><sub>t</sub>/<i>R</i>, so they add up in some directions and cancel in others. The field is multiplied by <i>F</i> = |1 + Γ e<sup>−j2πΔ/λ</sup>|, and the echo power by <i>F</i>⁴: up to +12 dB in a lobe, −∞ in a null.</p>",
        look: "the lobes in the coverage diagram and the echo fading in and out as the target flies in.", apply: () => setup({ preset: "standard", hr: 20, ht: 150, R: 40e3, zoom: "near", f: 3e9, surface: "calm", rain: 0, R0: 80e3 }) },
      { title: "6 · Air and rain absorb", html:
        "<p>Every kilometre costs a little energy, twice (out and back). It's negligible at S band, but at 35 GHz in 10 mm/h of rain the two-way loss is several dB per km, enough to blind a millimetre-wave radar at a few km.</p>",
        look: "the attenuation panel and the echo-vs-range curve sagging with distance.", apply: () => setup({ preset: "standard", f: 35e9, rain: 10, hr: 20, ht: 150, R: 30e3, zoom: "near", R0: 80e3 }) },
      { title: "7 · Your turn", html: "<p>Use the challenges below: hide a target under the horizon, rescue it with a taller mast or a duct, find a multipath null, and fly an AEW radar.</p>" },
    ]);

    const lab = labGrid(root);

    // ---- side view
    const sideCard = card(lab.main, "Side view over a curved Earth", "drag the target · vertical scale exaggerated");
    const side = api.track(canvasView(sideCard, { aspect: 2.1, minHeight: 230, maxHeight: 420, draw: drawSide, free: true, label: "Rays traced from the radar over the curved Earth, with the shadow zone shaded" }));
    legend(sideCard, [[theme().tx, "rays (direct)"], [alpha(theme().tx, 0.4), "after a surface bounce"], [alpha(theme().muted, 0.5), "shadow: no ray reaches"]]);
    const sideCap = h("p", { class: "caption" });
    sideCard.append(sideCap);
    let dragging = false;
    drag(side, {
      hit: (x, y) => { const p = sideMap(); return Math.hypot(x - p.px(S.R), y - p.py(S.R, S.ht)) < 28; },
      down: () => { dragging = true; },
      move: (x, y) => {
        if (!dragging) return;
        const p = sideMap(), Z = ZOOMS[S.zoom];
        S.R = clamp(p.ix(x), 1000, Z.X * 0.98);
        S.ht = clamp(p.iz(S.R, y), 1, Z.H * 0.98);
        rSl.value = S.R / 1000; htSl.value = S.ht;
        changed();
      },
      up: () => { dragging = false; },
    });

    // ---- multipath
    const mpCard = card(lab.main, "Multipath coverage", "two-ray model, isotropic antenna, flat-Earth geometry, masked by the horizon");
    const cov = api.track(canvasView(mpCard, { aspect: 2.4, minHeight: 200, maxHeight: 340, draw: drawCov, label: "Coverage diagram: target height against range showing lobes and nulls" }));
    legend(mpCard, [[alpha(theme().accent, 0.7), "detected (margin above threshold)"], [alpha(theme().muted, 0.5), "beyond the horizon"], [theme().tgt, "target height"]]);
    const pwr = api.track(canvasView(mpCard, { aspect: 2.6, minHeight: 190, maxHeight: 300, draw: drawPwr, label: "Echo power against range at the target's height" }));
    legend(mpCard, [[theme().rx, "echo with multipath + attenuation"], [theme().muted, "free space"], [theme().bad, "detection threshold"]]);

    // ---- attenuation
    const atCard = card(lab.main, "Two-way attenuation", "air + rain, approximate (ITU-R P.676 / P.838)");
    const atv = api.track(canvasView(atCard, { aspect: 3, minHeight: 170, maxHeight: 250, draw: drawAtt, label: "Two-way attenuation against range" }));
    legend(atCard, [[theme().c5, "clear air"], [theme().c4, "rain"], [theme().tx, "total"]]);

    // ---- controls
    const ctl = card(lab.side, "Controls");
    const g1 = group(ctl, "Geometry");
    const hrSl = slider(g1, { label: "Radar height <i>h</i><sub>r</sub>", min: 2, max: 12000, log: true, value: S.hr, format: (v) => km(v, 3), onInput: (v) => { S.hr = v; fitZoom(); changed(true); } });
    const htSl = slider(g1, { label: "Target height <i>h</i><sub>t</sub>", min: 1, max: 15000, log: true, value: S.ht, format: (v) => km(v, 3), onInput: (v) => { S.ht = v; fitZoom(); changed(); } });
    const rSl = slider(g1, { label: "Target range", min: 1, max: 500, step: 0.5, value: S.R / 1000, format: (v) => `${num(v, 4)} km`, onInput: (v) => { S.R = v * 1000; fitZoom(); changed(); } });
    const zoomSel = select(g1, { label: "View", value: S.zoom, options: Object.entries(ZOOMS).map(([k, z]) => [k, z.name]), onChange: (v) => { S.zoom = v; clampToView(); changed(true); } });
    const g2 = group(ctl, "Atmosphere");
    const preCh = choice(g2, { value: S.preset, options: [["none", "None"], ["standard", "Standard"], ["sub", "Sub"], ["super", "Super"], ["duct", "Duct"]],
      onChange: (v) => { S.preset = v; S.g = PRESETS[v].g; gSl.value = S.g; changed(true); } });
    const gSl = slider(g2, { label: "Refractivity gradient d<i>N</i>/d<i>h</i>", min: -200, max: 60, step: 1, value: S.g, format: (v) => `${v} N/km`,
      help: "Moving this makes a custom atmosphere (no duct layer).", onInput: (v) => { S.g = v; S.preset = "custom"; preCh.value = "custom"; changed(true); } });
    const g3 = group(ctl, "Radio & surface");
    const fSl = slider(g3, { label: "Frequency", min: 100e6, max: 100e9, log: true, value: S.f, format: (v) => si(v, "Hz", 3), onInput: (v) => { S.f = v; changed(); } });
    const surfSel = select(g3, { label: "Reflecting surface", value: S.surface, options: Object.entries(SURFACES).map(([k, s]) => [k, s.name]), onChange: (v) => { S.surface = v; changed(); } });
    const rainSl = slider(g3, { label: "Rain rate", min: 0, max: 100, step: 1, value: S.rain, format: (v) => (v ? `${v} mm/h` : "dry"), onInput: (v) => { S.rain = v; changed(); } });
    const r0Sl = slider(g3, { label: "Free-space detection range", min: 10, max: 600, log: true, value: S.R0 / 1000, format: (v) => `${num(v, 3)} km`,
      help: "How far this radar would see the target with no Earth, no air and no reflections.", onInput: (v) => { S.R0 = v * 1000; changed(); } });
    const out = card(lab.side, "Readouts");
    const st = status(out);
    const ro = readout(out);

    const ch = api.challenges(root, [
      { id: "hide", text: "Hide a low-flying target (under 100 m) below the radar horizon.", check: (s) => s.ht < 100 && !s.visible },
      { id: "mast", text: "In a standard atmosphere, raise the radar until a 10 m-high target 50 km or more away is visible.", check: (s) => s.preset === "standard" && s.ht <= 15 && s.R >= 50e3 && s.visible },
      { id: "duct", text: "Use a surface duct to see a target under 50 m beyond the standard-atmosphere horizon.", check: (s) => s.preset === "duct" && s.ht < 50 && s.visible && s.R > s.horStd },
      { id: "skimmer", text: "Ship mast 30 m, sea-skimmer 5 m, standard atmosphere: park the missile exactly at the radar horizon (± 1 km).", check: (s) => Math.abs(s.hr - 30) <= 2 && Math.abs(s.ht - 5) <= 1 && s.preset === "standard" && Math.abs(s.R - s.horStd) <= 1000 },
      { id: "null", text: "Find a multipath null: put a visible target where its echo is at least 20 dB below free space.", check: (s) => s.visible && s.F4db <= -20 },
      { id: "aew", text: "Fly the radar at 8 km or higher and see a target under 60 m more than 350 km away.", check: (s) => s.hr >= 8000 && s.ht <= 60 && s.R >= 350e3 && s.visible },
    ]);

    // ---------------------------------------------------------------- model
    /** dM/dz in M-units per metre at height z (modified refractivity M = N + z/Re·10⁶). */
    function dMdz(z) {
      const g = S.preset === "duct" && z < DUCT_TOP ? DUCT_G : S.g;
      return (RE_N + g) / 1000;
    }
    const kFactor = (g) => RE_N / (RE_N + g);
    const horizon = (hgt, k) => Math.sqrt(2 * k * RE * hgt);

    /**
     * Trace a fan of rays in the Earth-flattened frame: z = height above the surface, p = dz/dx,
     * dp/dx = 10⁻⁶ dM/dz. Rays reflect specularly at z = 0. Stores each ray's height and bounce count at every column.
     */
    function trace() {
      const Z = ZOOMS[S.zoom], X = Z.X, H = Z.H;
      const cols = 220, sub = 4, dxc = X / cols, dx = dxc / sub;
      const dip = Math.sqrt((2 * S.hr) / RE);
      const lo = -1.6 * dip - 0.0015, hi = 4 * dip + (3 * H) / X + 0.002;
      const angles = [];
      for (let i = 0; i < 60; i++) angles.push(lo - 1.4 * (1 - i / 60) ** 3); // steep downward rays for close range
      const rows = 160;
      const nD = Math.round(clamp(((hi - lo) * X) / (H / rows) * 1.5, 400, 3000)); // dense enough to resolve one grid row at the far edge
      for (let i = 0; i < nD; i++) angles.push(lo + ((hi - lo) * i) / (nD - 1));
      for (let i = 1; i <= 50; i++) angles.push(hi * (1.2 / hi) ** (i / 50));
      // rays to draw: spread so that they fan out across the visible height
      const shown = [];
      const topA = (H - S.hr) / X + X / (2 * RE) * 0.6;
      for (let i = 0; i < 22; i++) shown.push(lo + ((topA - lo) * i) / 21);
      const all = angles.concat(shown);
      const nAll = all.length, n = angles.length;
      const zs = new Float32Array(nAll * (cols + 1)), bs = new Int16Array(nAll * (cols + 1)), ds = new Uint8Array(nAll * (cols + 1));
      for (let r = 0; r < nAll; r++) {
        let z = S.hr, p = Math.tan(all[r]), b = 0, dead = false;
        zs[r * (cols + 1)] = z;
        for (let c = 1; c <= cols; c++) {
          const o = r * (cols + 1) + c;
          if (dead) { bs[o] = -1; continue; }
          for (let s = 0; s < sub; s++) {
            p += 1e-6 * dMdz(z) * dx;
            z += p * dx;
            if (z < 0) { z = -z; p = -p; b++; }
          }
          if (z > H * 1.6) { dead = true; bs[o] = -1; continue; }
          zs[o] = z; bs[o] = b; ds[o] = p < 0 ? 1 : 0;
        }
      }
      // coverage grid: a cell is lit if it lies between two neighbouring rays of the same family (same bounce count)
      const lit = new Uint8Array((cols + 1) * rows);
      const fill = (c, za, zb) => {
        let a = Math.floor((Math.min(za, zb) / H) * rows), b2 = Math.floor((Math.max(za, zb) / H) * rows);
        a = Math.max(0, a); b2 = Math.min(rows - 1, b2);
        for (let k = a; k <= b2; k++) lit[c * rows + k] = 1;
      };
      for (let c = 0; c <= cols; c++) {
        for (let r = 0; r < n; r++) {
          const o = r * (cols + 1) + c;
          if (bs[o] < 0) continue;
          fill(c, zs[o], zs[o]);
          if (r + 1 < n) {
            const o2 = o + cols + 1;
            if (bs[o2] === bs[o]) fill(c, zs[o], zs[o2]);
            // the lower ray has just bounced while its neighbour is still coming down: the tube between them reaches the surface
            else if (bs[o] === bs[o2] + 1 && ds[o2]) fill(c, 0, zs[o2]);
          }
        }
      }
      return { X, H, cols, rows, n, nAll, zs, bs, ds, lit, angles };
    }
    /** Is a point at range x, height z reached by the ray fan? (bracketed by two neighbouring rays of one family) */
    function reached(x, z) {
      if (!tr) return true;
      const c = clamp(x / (tr.X / tr.cols), 0, tr.cols - 1e-6), c0 = Math.floor(c), t = c - c0, N1 = tr.cols + 1;
      const zAt = (r) => lerp(tr.zs[r * N1 + c0], tr.zs[r * N1 + c0 + 1], t);
      const B = (r, k) => tr.bs[r * N1 + c0 + k];
      for (let r = 0; r + 1 < tr.n; r++) {
        const a0 = B(r, 0), a1 = B(r, 1), b0 = B(r + 1, 0), b1 = B(r + 1, 1);
        if (a0 < 0 || a1 < 0 || b0 < 0 || b1 < 0) continue;
        if (a0 === a1 && b0 === b1 && a0 === b0) {
          const a = zAt(r), b = zAt(r + 1);
          if (z >= Math.min(a, b) - 0.5 && z <= Math.max(a, b) + 0.5) return true;
        } else if (a0 === b0 + 1 && a1 === b1 + 1 && tr.ds[(r + 1) * N1 + c0] && z <= zAt(r + 1) + 0.5) return true;
      }
      return false;
    }
    function litCell(x, z) {
      if (!tr || z >= tr.H) return true;
      const c = clamp(Math.round(x / (tr.X / tr.cols)), 0, tr.cols), k = clamp(Math.floor((z / tr.H) * tr.rows), 0, tr.rows - 1);
      return !!tr.lit[c * tr.rows + k];
    }

    /** Reflection coefficient including the Ament roughness factor exp[−2(2πσh sinψ/λ)²]. */
    function gamma(R, h1, h2, lam) {
      const s = SURFACES[S.surface];
      const sinPsi = (h1 + h2) / Math.hypot(R, h2 + h1);    // grazing angle
      return s.g0 * Math.exp(-2 * ((TAU * s.sh * sinPsi) / lam) ** 2);
    }
    /** Two-ray propagation factor F (field) between heights h1, h2 at ground range R over the chosen surface. */
    function factor(R, h1, h2, lam) {
      if (!SURFACES[S.surface].g0) return 1;
      const d1 = Math.hypot(R, h2 + h1), d2 = Math.hypot(R, h2 - h1);
      const delta = (4 * h1 * h2) / (d1 + d2);            // path difference, = d1 − d2 without cancellation error
      const G = gamma(R, h1, h2, lam), ph = (TAU * delta) / lam;
      return Math.hypot(1 + G * Math.cos(ph), -G * Math.sin(ph));
    }
    const attn2 = (R) => 2 * (gasDbKm(S.f) + rainDbKm(S.f, S.rain)) * (R / 1000); // two-way dB
    /** Echo margin over the detection threshold, dB: free-space R⁻⁴ law × F⁴ × two-way attenuation. */
    const margin = (R, z, lam) => 40 * Math.log10(S.R0 / R) + 40 * Math.log10(Math.max(1e-6, factor(R, S.hr, z, lam))) - attn2(R);

    function setup(o) {
      touring = true;
      Object.assign(S, o);
      if (o.preset) { S.g = PRESETS[o.preset].g; preCh.value = o.preset; gSl.value = S.g; }
      hrSl.value = S.hr; htSl.value = S.ht; rSl.value = S.R / 1000; zoomSel.value = S.zoom;
      fSl.value = S.f; rainSl.value = S.rain; surfSel.value = S.surface; r0Sl.value = S.R0 / 1000;
      changed(true);
      touring = false;
    }
    function fitZoom() {
      const order = ["near", "mid", "far"];
      let i = order.indexOf(S.zoom);
      while (i < 2 && (S.R > ZOOMS[order[i]].X * 0.98 || Math.max(S.ht, S.hr) > ZOOMS[order[i]].H * 0.95)) i++;
      if (order[i] !== S.zoom) { S.zoom = order[i]; zoomSel.value = S.zoom; tr = null; }
    }
    function clampToView() {
      const Z = ZOOMS[S.zoom];
      S.R = Math.min(S.R, Z.X * 0.9); S.ht = Math.min(S.ht, Z.H * 0.9); S.hr = Math.min(S.hr, Z.H * 0.8);
      rSl.value = S.R / 1000; htSl.value = S.ht; hrSl.value = S.hr;
    }

    function changed(retrace = false) {
      if (retrace || !tr || tr.X !== ZOOMS[S.zoom].X) tr = trace();
      const lam = C0 / S.f;
      const trapping = S.g <= -RE_N;
      const k = kFactor(S.g);
      S.horStd = horizon(S.hr, 4 / 3) + horizon(S.ht, 4 / 3);
      S.hor = trapping ? Infinity : horizon(S.hr, k) + horizon(S.ht, k);
      S.visible = reached(S.R, S.ht);
      const F = factor(S.R, S.hr, S.ht, lam);
      S.F4db = 40 * Math.log10(Math.max(F, 1e-6));
      const m = margin(S.R, S.ht, lam);
      const delta = (4 * S.hr * S.ht) / (Math.hypot(S.R, S.ht + S.hr) + Math.hypot(S.R, S.ht - S.hr));
      if (S.visible && S.preset === "duct" && S.R > S.horStd) st.set("ok", "Seen through the duct", " Trapped rays carry energy beyond the normal horizon. (The two-ray multipath numbers don't model trapped modes, so treat them loosely here.)");
      else if (!S.visible) st.set("bad", "Target hidden", " No ray from the radar reaches it: it is in the shadow beyond the horizon.");
      else if (S.F4db < -10) st.set("warn", "In a multipath null", ` Direct and reflected waves nearly cancel: echo ${fmtDb(S.F4db)} vs free space.`);
      else if (m < 0) st.set("warn", "Visible but too weak", ` Line of sight exists, but the echo is ${fmtDb(-m)} below the detection threshold.`);
      else st.set("ok", "Target detected", ` ${fmtDb(m)} above the detection threshold.`);
      const sigma = SURFACES[S.surface];
      ro.set([
        ["Atmosphere", S.preset === "custom" ? `custom, ${S.g} N/km` : PRESETS[S.preset].name],
        ["k-factor", S.preset === "duct" ? "duct below 100 m" : trapping ? "∞ (rays trapped)" : num(k, 3)],
        ["Radar horizon √(2kRₑh)", trapping ? "—" : km(horizon(S.hr, k), 3)],
        ["Horizon to target height", trapping ? "—" : km(S.hor, 3)],
        ["Standard-atmosphere horizon", km(S.horStd, 3)],
        ["Target", S.visible ? "line of sight" : "below horizon", S.visible ? "ok" : "bad"],
        ["Path difference Δ", `${si(delta, "m", 3)} = ${num(delta / lam, 3)} λ`],
        ["|Γ| (with roughness)", num(Math.abs(sigma.g0) * Math.exp(-2 * ((TAU * sigma.sh * ((S.hr + S.ht) / Math.hypot(S.R, S.hr + S.ht))) / lam) ** 2), 2)],
        ["Multipath gain F⁴", S.visible ? fmtDb(S.F4db) : "n/a (hidden)", S.visible ? (S.F4db < -10 ? "bad" : S.F4db > 6 ? "ok" : null) : null],
        ["First lobe ≈ λ/4hᵣ", `${num((lam / (4 * S.hr)) * 1000, 3)} mrad`],
        ["Two-way attenuation", fmtDb(attn2(S.R))],
      ]);
      sideCap.textContent = `Rays traced through ${S.preset === "custom" ? `a ${S.g} N/km gradient` : PRESETS[S.preset].name.toLowerCase()}. ` +
        `Vertical scale exaggerated about ×${num(sideMap().exag, 2)}; the Earth's surface drops ${km((ZOOMS[S.zoom].X ** 2) / (2 * RE), 2)} across the view.`;
      if (!touring) ch.update(S);
      side.redraw(); cov.redraw(); pwr.redraw(); atv.redraw();
    }

    // ---------------------------------------------------------------- drawing: side view
    function sideMap() {
      const Z = ZOOMS[S.zoom], w = side.w, hh = side.h;
      const l = 46, r = w - 12, t = 12, b = hh - 24;
      const drop = (Z.X ** 2) / (2 * RE);
      const y0 = -drop, y1 = Z.H;
      const px = (x) => l + (x / Z.X) * (r - l);
      const yScr = (Y) => b - ((Y - y0) / (y1 - y0)) * (b - t);
      const py = (x, z) => yScr(z - (x * x) / (2 * RE));
      const ix = (X) => ((X - l) / (r - l)) * Z.X;
      const iz = (x, Y) => y0 + ((b - Y) / (b - t)) * (y1 - y0) + (x * x) / (2 * RE);
      const exag = ((b - t) / (y1 - y0)) / ((r - l) / Z.X);
      return { l, r, t, b, px, py, ix, iz, exag, yScr };
    }
    function drawSide(ctx, w, hh) {
      const T = theme(), M = sideMap(), Z = ZOOMS[S.zoom];
      if (!tr) return;
      ctx.fillStyle = T.surface2; ctx.fillRect(0, 0, w, hh);
      // shadow cells
      const dxc = Z.X / tr.cols, dz = Z.H / tr.rows;
      ctx.fillStyle = alpha(T.muted, T.dark ? 0.32 : 0.24);
      ctx.beginPath();
      for (let c = 0; c < tr.cols; c++) {
        const x = (c + 0.5) * dxc, xa = M.px(c * dxc), xb = M.px((c + 1) * dxc) + 0.6;
        let k = 0;
        while (k < tr.rows) {
          if (tr.lit[c * tr.rows + k]) { k++; continue; }
          const k0 = k;
          while (k < tr.rows && !tr.lit[c * tr.rows + k]) k++;
          const ya = M.py(x, k0 * dz), yb = M.py(x, k * dz);
          ctx.rect(xa, yb, xb - xa, ya - yb + 0.6);
        }
      }
      ctx.fill();
      // duct layer
      if (S.preset === "duct") {
        ctx.fillStyle = alpha(T.c4, 0.1); ctx.beginPath();
        for (let i = 0; i <= 60; i++) { const x = (Z.X * i) / 60; i ? ctx.lineTo(M.px(x), M.py(x, DUCT_TOP)) : ctx.moveTo(M.px(x), M.py(x, DUCT_TOP)); }
        for (let i = 60; i >= 0; i--) { const x = (Z.X * i) / 60; ctx.lineTo(M.px(x), M.py(x, 0)); }
        ctx.fill();
        label(ctx, "duct (100 m)", M.px(Z.X * 0.5), M.py(Z.X * 0.5, DUCT_TOP) - 12, { color: T.c4, font: T.font, align: "center" });
      }
      // height contours (constant height above the curved surface)
      ctx.font = T.font; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      for (const zv of ticks(0, Z.H, 3)) {
        if (zv <= 0) continue;
        ctx.strokeStyle = alpha(T.axis, 0.45); ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i <= 50; i++) { const x = (Z.X * i) / 50; i ? ctx.lineTo(M.px(x), M.py(x, zv)) : ctx.moveTo(M.px(x), M.py(x, zv)); }
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = T.muted; ctx.fillText(km(zv, 2), M.l - 4, M.py(0, zv));
      }
      // rays (a subset of the fan)
      const N1 = tr.cols + 1;
      for (let r = tr.n; r < tr.nAll; r++) {
        let prevB = 0;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.strokeStyle = alpha(T.tx, 0.85);
        for (let c = 0; c <= tr.cols; c++) {
          const o = r * N1 + c, b = tr.bs[o];
          if (b < 0) break;
          const x = c * dxc, X = M.px(x), Y = M.py(x, tr.zs[o]);
          if (b !== prevB) { ctx.lineTo(X, Y); ctx.stroke(); ctx.beginPath(); ctx.strokeStyle = alpha(T.tx, 0.35); prevB = b; }
          c ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.stroke();
      }
      // Earth
      const surf = S.surface === "land" || S.surface === "forest" ? T.c5 : T.rx;
      ctx.fillStyle = alpha(surf, 0.28); ctx.beginPath(); ctx.moveTo(0, hh);
      ctx.lineTo(0, M.py(0, 0));
      for (let i = 0; i <= 80; i++) { const x = (Z.X * i) / 80; ctx.lineTo(M.px(x), M.py(x, 0)); }
      ctx.lineTo(w, M.py(Z.X, 0)); ctx.lineTo(w, hh); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = surf; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 80; i++) { const x = (Z.X * i) / 80; i ? ctx.lineTo(M.px(x), M.py(x, 0)) : ctx.moveTo(M.px(x), M.py(x, 0)); }
      ctx.stroke();
      // range ticks along the surface
      ctx.fillStyle = T.ink; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.font = T.font;
      const rt = ticks(0, Z.X / 1000, Math.max(2, Math.floor(w / 110)));
      for (const v of rt) {
        if (v === 0) continue;
        const x = v * 1000; if (x > Z.X) continue;
        ctx.fillRect(M.px(x) - 0.5, M.py(x, 0), 1, 5);
        const tw = ctx.measureText(`${v} km`).width / 2;
        ctx.fillText(`${v} km`, Math.min(M.px(x), w - tw - 2), Math.min(hh - 14, M.py(x, 0) + 6));
      }
      // horizon marker
      const k = kFactor(S.g);
      if (S.preset !== "duct" && S.g > -RE_N) {
        const d = horizon(S.hr, k);
        if (d < Z.X) {
          ctx.fillStyle = T.ink; ctx.beginPath(); ctx.arc(M.px(d), M.py(d, 0), 4, 0, TAU); ctx.fill();
          label(ctx, `radar horizon ${km(d, 3)}`, M.px(d), M.py(d, 0) + 30, { align: "center", font: T.font, bounds: w });
        }
      }
      // radar mast
      const rx0 = M.px(0), ry0 = M.py(0, 0), ryt = M.py(0, S.hr);
      ctx.strokeStyle = T.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(rx0, ry0); ctx.lineTo(rx0, Math.min(ryt, ry0 - 4)); ctx.stroke();
      ctx.fillStyle = T.ink; ctx.beginPath(); ctx.arc(rx0, Math.min(ryt, ry0 - 4), 5, 0, TAU); ctx.fill();
      // target
      const tx = M.px(S.R), ty = M.py(S.R, S.ht);
      const col = S.visible ? T.ok : T.bad;
      ctx.strokeStyle = alpha(col, 0.7); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, M.py(S.R, 0)); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.translate(tx, ty); ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-10, -3); ctx.lineTo(-12, -9); ctx.lineTo(-8, -3); ctx.lineTo(-10, 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.strokeStyle = alpha(col, 0.6); ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      label(ctx, S.visible ? "in view" : "hidden", tx + (tx > w - 90 ? -18 : 18), ty - 14, { color: col, align: tx > w - 90 ? "right" : "left" });
    }

    // ---------------------------------------------------------------- drawing: coverage diagram
    let covImg = null;
    function drawCov(ctx, w, hh) {
      const T = theme(), Z = ZOOMS[S.zoom], lam = C0 / S.f;
      const P = axes(ctx, w, hh, { x: [0, Z.X / 1000], y: [0, Z.H], xlabel: "range (km)", ylabel: "height", yfmt: (v) => km(v, 2), pad: { l: 52, b: 30, t: 8 } });
      const pw = Math.max(1, Math.round(P.r - P.l)), ph = Math.max(1, Math.round(P.b - P.t));
      const cw = Math.max(2, Math.round(pw / 1.5)), chh = Math.max(2, Math.round(ph / 1.5));
      const key = [S.zoom, S.hr, S.f, S.surface, S.rain, S.R0, S.preset, S.g, T.dark, cw, chh].join();
      if (!covImg || covImg.key !== key) {
        const can = document.createElement("canvas"); can.width = cw; can.height = chh;
        const g = can.getContext("2d"), img = g.createImageData(cw, chh);
        const hex = (c) => { const s = c.replace("#", ""); const n = parseInt(s.length === 3 ? s.split("").map((q) => q + q).join("") : s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
        const ac = hex(T.accent), mu = hex(T.muted), cellZ = Z.H / chh, cellX = Z.X / cw;
        for (let j = 0; j < chh; j++) {
          const z = ((chh - j - 0.5) / chh) * Z.H;
          for (let i = 0; i < cw; i++) {
            const x = ((i + 0.5) / cw) * Z.X, o = (j * cw + i) * 4;
            if (!litCell(x, z)) { img.data[o] = mu[0]; img.data[o + 1] = mu[1]; img.data[o + 2] = mu[2]; img.data[o + 3] = 70; continue; }
            // where lobes are finer than a pixel, show their average, ⟨F⁴⟩ = 1 + 4|Γ|² + |Γ|⁴, instead of moiré
            const fine = (lam * x) / (2 * S.hr) < 2 * cellZ || (lam * x * x) / (2 * S.hr * Math.max(z, 1)) < 2 * cellX;
            let m;
            if (fine) { const G = gamma(x, S.hr, z, lam); m = 40 * Math.log10(S.R0 / x) + 10 * Math.log10(1 + 4 * G * G + G ** 4) - attn2(x); }
            else m = margin(x, z, lam);
            if (m <= 0) continue;
            img.data[o] = ac[0]; img.data[o + 1] = ac[1]; img.data[o + 2] = ac[2];
            img.data[o + 3] = Math.round(70 + 150 * clamp(m / 20, 0, 1));
          }
        }
        g.putImageData(img, 0, 0);
        covImg = { can, key };
      }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(covImg.can, P.l, P.t, pw, ph);
      // target height track and target
      const ty = P.Y(S.ht);
      if (S.ht <= Z.H) {
        ctx.strokeStyle = T.tgt; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(P.l, ty); ctx.lineTo(P.r, ty); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = T.tgt; ctx.beginPath(); ctx.arc(P.X(S.R / 1000), ty, 5, 0, TAU); ctx.fill();
      }
      label(ctx, `first lobe ${num((lam / (4 * S.hr)) * 1000, 2)} mrad up`, P.r - 4, P.t + 12, { align: "right", font: T.font });
    }

    // ---------------------------------------------------------------- drawing: echo vs range
    function drawPwr(ctx, w, hh) {
      const T = theme(), Z = ZOOMS[S.zoom], lam = C0 / S.f;
      const P = axes(ctx, w, hh, { x: [0, Z.X / 1000], y: [-40, 60], xlabel: `range (km) · target at ${km(S.ht, 3)}`, ylabel: "dB vs threshold", pad: { l: 52, b: 30, t: 8 } });
      P.clip();
      // beyond-horizon shading along the target's height
      const n = Math.min(1600, Math.round((P.r - P.l) * 2));
      ctx.fillStyle = alpha(T.muted, 0.18);
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) / n) * Z.X;
        if (!litCell(x, S.ht)) ctx.fillRect(P.X(x / 1000) - 0.5, P.t, (P.r - P.l) / n + 1, P.b - P.t);
      }
      ctx.strokeStyle = T.bad; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(P.l, P.Y(0)); ctx.lineTo(P.r, P.Y(0)); ctx.stroke();
      plotFn(ctx, P, (r) => 40 * Math.log10(S.R0 / (r * 1000)), Z.X / 1000 / n, Z.X / 1000, T.muted, 1.5, 200, { dash: [5, 4] });
      ctx.strokeStyle = T.rx; ctx.lineWidth = 1.6; ctx.beginPath();
      let pen = false;
      for (let i = 1; i <= n; i++) {
        const x = (i / n) * Z.X;
        if (!litCell(x, S.ht)) { pen = false; continue; }
        const y = P.Y(clamp(margin(x, S.ht, lam), -60, 60));
        pen ? ctx.lineTo(P.X(x / 1000), y) : ctx.moveTo(P.X(x / 1000), y);
        pen = true;
      }
      ctx.stroke();
      P.unclip();
      const mx = P.X(S.R / 1000), my = P.Y(clamp(margin(S.R, S.ht, lam), -40, 60));
      ctx.fillStyle = T.tgt; ctx.beginPath(); ctx.arc(mx, my, 5, 0, TAU); ctx.fill();
      label(ctx, "target", mx + 8, my - 12, { color: T.tgt, bounds: w, font: T.font });
    }

    // ---------------------------------------------------------------- drawing: attenuation
    function drawAtt(ctx, w, hh) {
      const T = theme(), Z = ZOOMS[S.zoom];
      const gas = 2 * gasDbKm(S.f), rain = 2 * rainDbKm(S.f, S.rain), XK = Z.X / 1000;
      const top = Math.max(1, (gas + rain) * XK);
      const yt = ticks(0, Math.min(top, 200), 4);
      const P = axes(ctx, w, hh, { x: [0, XK], y: [0, Math.min(top, 200) * 1.05], yticks: yt, xlabel: "range (km)", ylabel: "two-way dB", pad: { l: 52, b: 30, t: 8 } });
      P.clip();
      plotFn(ctx, P, (r) => gas * r, 0, XK, T.c5, 2, 2);
      if (rain) plotFn(ctx, P, (r) => rain * r, 0, XK, T.c4, 2, 2);
      plotFn(ctx, P, (r) => (gas + rain) * r, 0, XK, T.tx, 2.5, 2);
      P.unclip();
      const L = (gas + rain) * (S.R / 1000);
      const mx = P.X(S.R / 1000), my = P.Y(Math.min(L, Math.min(top, 200) * 1.05));
      ctx.fillStyle = T.tgt; ctx.beginPath(); ctx.arc(mx, my, 5, 0, TAU); ctx.fill();
      label(ctx, `${fmtDb(L)} at the target · ${num(gas / 2 + rain / 2, 2)} dB/km one-way`, P.l + 6, P.t + 12, { font: T.font, bounds: w });
    }

    changed(true);

    notes(root, "Background", [
      { title: "The radar horizon", open: true, html:
        "<p>A ray just grazing a sphere of radius <i>R</i><sub>e</sub> from height <i>h</i> touches it at distance <i>d</i>, where (<i>R</i><sub>e</sub> + <i>h</i>)² = <i>R</i><sub>e</sub>² + <i>d</i>². Since <i>h</i> ≪ <i>R</i><sub>e</sub>, <i>d</i> ≈ √(2<i>R</i><sub>e</sub><i>h</i>). The radar and the target each have their own horizon distance, and the target is visible when the two add up to more than the range:</p>" +
        "<p class=\"eq\"><i>d</i> = √(2<i>kR</i><sub>e</sub><i>h</i><sub>r</sub>) + √(2<i>kR</i><sub>e</sub><i>h</i><sub>t</sub>) ≈ 4.12 (√<i>h</i><sub>r</sub> + √<i>h</i><sub>t</sub>) km</p>" +
        "<p>with heights in metres and <i>k</i> = 4/3 for a standard atmosphere (3.57 instead of 4.12 with no refraction). A 30 m ship mast and a 5 m sea-skimmer: 4.12 × (5.48 + 2.24) = 32 km. An AEW aircraft at 9 km and the same missile: 4.12 × (94.9 + 2.2) = 400 km. That geometry, not power, is why AWACS and Hawkeye fly high, and why low-flying aircraft and cruise missiles hug the terrain.</p>" },
      { title: "Refractivity, N-units and the k-factor", html:
        "<p>Air's refractive index <i>n</i> is about 1.0003, so radio engineers use the <b>refractivity</b> <i>N</i> = (<i>n</i> − 1) × 10⁶, given by the Smith–Weintraub formula</p>" +
        "<p class=\"eq\"><i>N</i> = 77.6 <span class=\"frac\"><span><i>P</i></span><span><i>T</i></span></span> + 3.73 × 10⁵ <span class=\"frac\"><span><i>e</i></span><span><i>T</i>²</span></span></p>" +
        "<p>with pressure <i>P</i> and water-vapour pressure <i>e</i> in hPa and temperature <i>T</i> in kelvin. At sea level <i>N</i> ≈ 315. Because pressure and humidity fall with height, so does <i>N</i>, and a ray bends with curvature −d<i>n</i>/d<i>h</i> toward the denser air below. Treating the ray as straight over an Earth of radius <i>kR</i><sub>e</sub> gives the same geometry, with</p>" +
        "<p class=\"eq\"><i>k</i> = <span class=\"frac\"><span>1</span><span>1 + <i>R</i><sub>e</sub> · d<i>n</i>/d<i>h</i></span></span> = <span class=\"frac\"><span>157</span><span>157 + d<i>N</i>/d<i>h</i></span></span> &nbsp;(d<i>N</i>/d<i>h</i> in N/km)</p>" +
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Condition</th><th>d<i>N</i>/d<i>h</i> (N/km)</th><th><i>k</i></th><th>Effect</th></tr>" +
        "<tr><td>Sub-refraction</td><td class=\"num\">&gt; 0</td><td class=\"num\">&lt; 1</td><td>rays bend up; horizon shrinks (cold moist air over warm ground, fog)</td></tr>" +
        "<tr><td>Normal</td><td class=\"num\">0 to −79</td><td class=\"num\">1 to 2</td><td>standard is −40, <i>k</i> = 4/3</td></tr>" +
        "<tr><td>Super-refraction</td><td class=\"num\">−79 to −157</td><td class=\"num\">2 to ∞</td><td>extended range, more clutter</td></tr>" +
        "<tr><td>Trapping (ducting)</td><td class=\"num\">&lt; −157</td><td class=\"num\">negative</td><td>rays curve faster than the Earth and are trapped</td></tr></table></div>" +
        "<p>The ray tracer here uses the <b>modified refractivity</b> <i>M</i> = <i>N</i> + 10⁶ <i>h</i>/<i>R</i><sub>e</sub> (adds 157 per km), which flattens the Earth: rays then obey d²<i>z</i>/d<i>x</i>² = 10⁻⁶ d<i>M</i>/d<i>z</i>, and a duct is any layer where <i>M</i> decreases with height. Each preset uses a constant gradient (the duct preset adds a −300 N/km layer in the lowest 100 m).</p>" },
      { title: "Ducts and anomalous propagation", html:
        "<ul><li><b>Evaporation ducts</b> form over almost all warm seas: humidity drops sharply in the first 10–20 m above the water. They trap only frequencies high enough to fit (roughly above 3 GHz), and greatly extend the range of ship radars against low targets.</li>" +
        "<li><b>Surface and elevated ducts</b> come from temperature inversions (warm dry air over cool moist air), common in the Gulf, the Mediterranean and coastal California. They can be hundreds of metres thick.</li>" +
        "<li>Effects: detection far beyond the horizon, <b>anomalous-propagation (AP) clutter</b> from distant coastlines and sea, and <b>radio holes</b>, gaps just above the duct where escaping rays leave a shadow. Navies forecast ducts from weather data to know where their radars will be blind.</li></ul>" +
        "<p>A duct only traps waves launched at shallow angles, roughly θ<sub>max</sub> = √(2 Δ<i>M</i> × 10⁻⁶) where Δ<i>M</i> is the deficit across the duct. For the 100 m duct here Δ<i>M</i> ≈ 14, so θ<sub>max</sub> ≈ 5 mrad ≈ 0.3°.</p>" },
      { title: "Multipath and the two-ray model", html:
        "<p>Over a smooth surface the target is illuminated by the direct wave and by a wave reflected at the grazing angle ψ. Their path difference and the resulting field factor are</p>" +
        "<p class=\"eq\">Δ ≈ <span class=\"frac\"><span>2<i>h</i><sub>r</sub><i>h</i><sub>t</sub></span><span><i>R</i></span></span> &nbsp;&nbsp; <i>F</i> = |1 + Γ e<sup>−j2πΔ/λ</sup>|</p>" +
        "<p>The echo travels the path twice, so received power scales by <i>F</i>⁴. With Γ ≈ −1 (a smooth sea at low grazing angles), <i>F</i> = 2|sin(2π<i>h</i><sub>r</sub><i>h</i><sub>t</sub>/λ<i>R</i>)|: lobes reach <i>F</i>⁴ = 16 (+12 dB) and nulls are complete. The lowest lobe peaks at an elevation of about λ/(4<i>h</i><sub>r</sub>), and below it the field falls off: at very low angles <i>F</i> ∝ <i>h</i><sub>t</sub>/<i>R</i>, so echo power drops as <i>R</i>⁻⁸ instead of <i>R</i>⁻⁴. That's why low-altitude targets over the sea are hard, and why low-flying-target radars use high frequencies and high masts (small λ/<i>h</i><sub>r</sub> pushes the first lobe down).</p>" +
        "<p>Rough surfaces reflect less coherently. The Rayleigh roughness criterion compares the surface height spread σ<sub>h</sub> with λ/sin ψ; this lesson uses the Ament factor ρ = exp[−2(2πσ<sub>h</sub> sin ψ/λ)²]. Land's lower reflection coefficient and roughness fill the nulls in. The diagram uses flat-Earth geometry and an isotropic antenna, and masks points beyond the traced horizon.</p>" },
      { title: "Atmospheric and rain attenuation", html:
        "<p>Oxygen and water vapour absorb microwaves, rain absorbs and scatters them. The loss is in dB per km and counts twice for a radar:</p>" +
        "<p class=\"eq\"><i>L</i><sub>2-way</sub> = 2 (γ<sub>gas</sub> + γ<sub>rain</sub>) <i>R</i> &nbsp;&nbsp; γ<sub>rain</sub> = <i>k R</i><sub>rain</sub><sup>α</sup></p>" +
        "<p>Values here come from ITU-R P.838-3 coefficients and sea-level ITU-R P.676 curves, assuming the whole path is at sea level and uniformly rainy; real rain cells are a few km wide and the air thins with height, so long slant paths lose less. Rule of thumb: below 3 GHz, ignore it; at X band, heavy rain costs ~1.4 dB/km two-way; at 35 GHz, tens of dB over a few km.</p>" },
      { title: "Beyond the horizon", html:
        "<ul><li><b>Diffraction</b> bends a little energy into the shadow, but it falls off by tens of dB within a few km, faster at higher frequencies.</li>" +
        "<li><b>Troposcatter</b>: small turbulent irregularities in the refractive index scatter a tiny fraction forward. Used for communication links, too weak for most radars.</li>" +
        "<li><b>HF skywave</b>: at 3–30 MHz the ionosphere (100–400 km up) refracts waves back to Earth. Over-the-horizon radars such as Australia's JORN watch 1000–3000 km away, with ranges that change with the time of day and the solar cycle.</li>" +
        "<li><b>HF surface wave</b>: vertically polarised HF waves cling to the conducting sea and follow its curvature for 200–400 km, used for coastal surveillance.</li></ul>" },
    ]);

    api.quiz(root, [
      { q: "With k = 4/3, roughly how far can a radar on a 30 m mast see a sea-skimming missile flying at 5 m?", options: ["10 km", "32 km", "80 km", "Unlimited with enough power"], answer: 1, why: "4.12 × (√30 + √5) = 4.12 × (5.48 + 2.24) ≈ 32 km. Beyond that the missile is below the horizon and no amount of power helps." },
      { q: "What happens when the refractivity gradient is steeper than −157 N/km?", options: ["Rays bend upward and the horizon shrinks", "Rays curve more than the Earth and are trapped in a duct", "The radar loses all signal", "Nothing: k stays 4/3"], answer: 1, why: "−157 N/km makes the ray curvature equal the Earth's curvature (k = ∞). Any steeper and rays bend back to the surface: trapping." },
      { q: "Over a calm sea, an approaching low-flying target's echo fades in and out. Why?", options: ["The target's RCS keeps changing", "Rain cells", "The direct and sea-reflected waves alternately reinforce and cancel as the path difference changes", "The ionosphere"], answer: 2, why: "The path difference 2hᵣhₜ/R changes with range. Every time it changes by one wavelength, the target passes through another lobe and null of the F⁴ pattern." },
      { q: "Why does an airborne early-warning aircraft fly at 9 km rather than at 1 km?", options: ["Less rain up there", "Its radar horizon grows with √height, from ~130 km to ~400 km for low targets", "Engines are more efficient", "To avoid multipath completely"], answer: 1, why: "Horizon distance ∝ √h: √9000 / √1000 = 3. Against a low target the horizon goes from about 4.12 × (31.6 + √hₜ) to 4.12 × (94.9 + √hₜ) km." },
    ]);

    return () => {};
  },
};
