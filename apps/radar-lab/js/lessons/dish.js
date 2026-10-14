// Lesson 10: parabolic reflector antennas. Ray geometry from a movable feed, and a far-field pattern computed by
// integrating the aperture field (feed taper, space loss, feed-displacement phase errors and random surface errors).
import {
  h, C0, card, labGrid, group, notes, slider, choice, readout, status, legend,
  canvasView, drag, animate, playButton, axes, theme, alpha, label, ticks, num, si, km, fmtDb, clamp, lerp, deg, rad, TAU, rng, reducedMotion,
} from "../ui.js";

const WINDOWS = [0.5, 1, 2, 3, 5, 8, 12, 20, 30, 45, 60, 90]; // rectangular-plot half-widths, degrees

// A smooth random surface-error map with unit RMS over the unit disk (correlation length ≈ D/10), made once.
const ERR_N = 48;
const ERR = (() => {
  const R = rng(11), n = ERR_N, a = new Float64Array(n * n), b = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) a[i] = R() - 0.5;
  const sig = 2.4, rad_ = 7, k = [];
  for (let j = -rad_; j <= rad_; j++) k.push(Math.exp(-(j * j) / (2 * sig * sig)));
  const blur = (src, dst, dx, dy) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let s = 0;
      for (let j = -rad_; j <= rad_; j++) { const xx = clamp(x + j * dx, 0, n - 1), yy = clamp(y + j * dy, 0, n - 1); s += src[yy * n + xx] * k[j + rad_]; }
      dst[y * n + x] = s;
    }
  };
  blur(a, b, 1, 0); blur(b, a, 0, 1);
  let s2 = 0, cnt = 0, mean = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = (x / (n - 1)) * 2 - 1, v = (y / (n - 1)) * 2 - 1; if (u * u + v * v <= 1) { mean += a[y * n + x]; cnt++; } }
  mean /= cnt;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = (x / (n - 1)) * 2 - 1, v = (y / (n - 1)) * 2 - 1; a[y * n + x] -= mean; if (u * u + v * v <= 1) s2 += a[y * n + x] ** 2; }
  const rms = Math.sqrt(s2 / cnt);
  for (let i = 0; i < n * n; i++) a[i] /= rms;
  return a;
})();
function errAt(u, v) { // u, v in [−1, 1]
  const n = ERR_N, x = ((u + 1) / 2) * (n - 1), y = ((v + 1) / 2) * (n - 1);
  const x0 = clamp(Math.floor(x), 0, n - 2), y0 = clamp(Math.floor(y), 0, n - 2), tx = x - x0, ty = y - y0;
  return lerp(lerp(ERR[y0 * n + x0], ERR[y0 * n + x0 + 1], tx), lerp(ERR[(y0 + 1) * n + x0], ERR[(y0 + 1) * n + x0 + 1], tx), ty);
}

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "A parabolic dish takes the spherical wave spreading from a small feed horn and turns it into a flat wavefront, which leaves as a narrow pencil beam. " +
      "Move the feed, change the dish's size and illumination, and watch both the rays and the computed radiation pattern respond." }));

    const S = { D: 1, f: 10e9, fD: 0.4, illum: "feed", ET: -5, ax: 0, lat: 0, rms: 0, t: 0 };
    let touring = false;
    let P = null;       // cached pattern result

    api.steps(root, [
      { title: "1 · The parabola's trick", html:
        "<p>Every path from the focus to the dish and on to a flat plane across the mouth has the <b>same length</b>. So waves leaving the feed at the focus all arrive at that plane in step: the curved wavefront becomes flat, and a flat wavefront travels as a narrow beam.</p>",
        look: "the wavefronts: circles round the feed, straight lines after the reflection.", apply: () => setup({ D: 1, f: 10e9, fD: 0.4, illum: "feed", ET: -5, ax: 0, lat: 0, rms: 0 }) },
      { title: "2 · Size in wavelengths sets the beam", html:
        "<p>The beamwidth depends on the dish diameter measured in wavelengths:</p><p class=\"eq\">θ<sub>3dB</sub> ≈ 70 <span class=\"frac\"><span>λ</span><span><i>D</i></span></span> degrees &nbsp;&nbsp; <i>G</i> = η <span class=\"frac\"><span>(π<i>D</i>)²</span><span>λ²</span></span></p><p>A 1 m dish at 10 GHz (33 λ across) gives about 2°. Triple the diameter and the beam is three times narrower and the gain 9× (9.5 dB) higher.</p>",
        look: "the pattern plot and the gain readout.", apply: () => setup({ D: 3, ax: 0, lat: 0, rms: 0 }) },
      { title: "3 · Illumination: taper versus spillover", html:
        "<p>The feed can't light the dish evenly. Its pattern fades toward the rim, and the rim is also farther from the focus (<b>space loss</b>). A gentle taper wastes energy past the rim (<b>spillover</b>); a strong taper wastes the dish's outer area. The best compromise, about −11 dB at the edge, gives ~80 % in theory and 55–70 % in practice.</p>",
        look: "the spillover rays missing the rim, and the efficiency readouts. Try edge tapers of −3, −11 and −20 dB.", apply: () => setup({ D: 1, ET: -3, illum: "feed", ax: 0, lat: 0 }) },
      { title: "4 · Sidelobes", html:
        "<p>A uniformly lit circular aperture has its first sidelobe at <b>−17.6 dB</b>. Tapering the illumination smooths the aperture's edge and pushes sidelobes down, at the price of a wider main beam and less gain. Uniform: θ ≈ 58 λ/<i>D</i>. Tapered: θ ≈ 65–75 λ/<i>D</i>.</p>",
        look: "the sidelobe readout. Switch between ideal uniform and a −15 dB taper.", apply: () => setup({ D: 1, illum: "uniform", ax: 0, lat: 0, rms: 0 }) },
      { title: "5 · Defocus", html:
        "<p>Move the feed along the axis and the paths are no longer equal: the edge rays arrive late or early by an amount that grows as <i>r</i>². This <b>quadratic phase error</b> fills in the nulls, broadens the beam and lowers the gain.</p>",
        look: "the curved wavefronts and the lowered, smeared pattern (dashed = in focus).", apply: () => setup({ D: 1, illum: "feed", ET: -10, ax: 1, lat: 0 }) },
      { title: "6 · Lateral offset steers the beam", html:
        "<p>Move the feed sideways and the beam tilts the other way by roughly the offset divided by the focal length (times a <b>beam-deviation factor</b> of 0.8–0.95). The higher-order error, <b>coma</b>, raises a sidelobe on one side. Monopulse trackers use four feeds slightly off-axis on purpose, and multi-beam satellites use clusters of feeds.</p>",
        look: "the squinted beam and the lopsided coma lobe.", apply: () => setup({ ax: 0, lat: 2 }) },
      { title: "7 · Surface accuracy", html:
        "<p>Bumps in the reflector add random phase errors. Ruze's equation gives the gain loss for an RMS surface error ε:</p><p class=\"eq\"><i>G</i>/<i>G</i><sub>0</sub> = exp[−(4πε/λ)²]</p><p>A 0.5 mm surface is perfect at 3 GHz but costs ~2 dB at 35 GHz. That's why millimetre-wave dishes are machined, and big radio telescopes are actively adjusted.</p>",
        look: "the scattered energy raising the sidelobes.", apply: () => setup({ f: 35e9, D: 1, ax: 0, lat: 0, rms: 0.5 }) },
    ]);

    const lab = labGrid(root);

    // ---- ray diagram
    const rayCard = card(lab.main, "Rays and wavefronts", "drag the feed horn");
    const rays = api.track(canvasView(rayCard, { aspect: 2, minHeight: 250, maxHeight: 440, free: true, draw: drawRays, label: "Cross-section of a parabolic dish with rays and wavefronts from the feed" }));
    const rayLeg = legend(rayCard, [[theme().tx, "rays (brightness = feed illumination)"], [alpha(theme().muted, 0.7), "spillover"], [theme().rx, "wavefronts"]]);
    void rayLeg;
    const rayCap = h("p", { class: "caption" });
    rayCard.append(rayCap);
    let dragging = false;
    drag(rays, {
      hit: (x, y) => { const M = rayMap(); const [fx, fy] = M.toPx(M.F + S.ax * M.lam, S.lat * M.lam); return Math.hypot(x - fx, y - fy) < 30; },
      down: () => { dragging = true; },
      move: (x, y) => {
        if (!dragging) return;
        const M = rayMap(); const [u, v] = M.fromPx(x, y);
        S.ax = clamp((u - M.F) / M.lam, -4, 4); S.lat = clamp(v / M.lam, -8, 8);
        axSl.value = S.ax; latSl.value = S.lat;
        changed();
      },
      up: () => { dragging = false; },
    });
    const apv = api.track(canvasView(rayCard, { height: (w) => (w < 480 ? 150 : 170), draw: drawAp, label: "Aperture illumination and phase error across the dish" }));
    legend(rayCard, [[alpha(theme().accent, 0.5), "illumination across the mouth"], [theme().c4, "phase error (wavelengths)"]]);
    const anim = api.track(animate((dt) => { S.t += dt; rays.redraw(); }, { target: rays.canvas, playing: !reducedMotion }));
    playButton(rays, anim);

    // ---- pattern plots
    const patCard = card(lab.main, "Radiation pattern", "computed from the aperture field · cut through the feed offset");
    const rect = api.track(canvasView(patCard, { aspect: 2.3, minHeight: 210, maxHeight: 360, draw: drawRect, label: "Radiation pattern in decibels against angle" }));
    legend(patCard, [[theme().accent, "pattern"], [theme().muted, "same dish, feed in focus, perfect surface"], [theme().bad, "−3 dB and peak-sidelobe levels"]]);
    const polar = api.track(canvasView(patCard, { aspect: 2, minHeight: 170, maxHeight: 320, draw: drawPolar, label: "Polar radiation pattern over the forward hemisphere" }));
    patCard.append(h("p", { class: "caption", text: "Polar plot: forward hemisphere, radius from −50 dB (centre) to 0 dB (rim), relative to the in-focus peak. Transmit and receive patterns are identical (reciprocity)." }));

    // ---- controls
    const ctl = card(lab.side, "Controls");
    const g1 = group(ctl, "Dish");
    const dSl = slider(g1, { label: "Diameter <i>D</i>", min: 0.3, max: 5, log: true, value: S.D, format: (v) => km(v, 3), onInput: (v) => { S.D = v; changed(); } });
    const fSl = slider(g1, { label: "Frequency", min: 1e9, max: 40e9, log: true, value: S.f, format: (v) => si(v, "Hz", 3), onInput: (v) => { S.f = v; changed(); } });
    const fdSl = slider(g1, { label: "<i>f</i>/<i>D</i> (focal length ÷ diameter)", min: 0.3, max: 1, step: 0.01, value: S.fD, format: (v) => v.toFixed(2), onInput: (v) => { S.fD = v; changed(); } });
    const rmsSl = slider(g1, { label: "Surface error (RMS)", min: 0, max: 3, step: 0.05, value: S.rms, format: (v) => (v ? `${v.toFixed(2)} mm` : "perfect"), onInput: (v) => { S.rms = v; changed(); } });
    const g2 = group(ctl, "Illumination");
    const illCh = choice(g2, { value: S.illum, options: [["feed", "Feed horn"], ["uniform", "Ideal uniform"]], onChange: (v) => { S.illum = v; changed(); } });
    const etSl = slider(g2, { label: "Edge taper (feed + space loss)", min: -30, max: -3, step: 0.5, value: S.ET, format: (v) => `${v.toFixed(1)} dB`,
      help: "Field at the rim relative to the centre. Sets how directive the feed is.", onInput: (v) => { S.ET = v; if (S.illum !== "feed") { S.illum = "feed"; illCh.value = "feed"; } changed(); } });
    const g3 = group(ctl, "Feed position");
    const axSl = slider(g3, { label: "Axial offset (+ = away from dish)", min: -4, max: 4, step: 0.05, value: S.ax, format: (v) => `${v.toFixed(2)} λ`, onInput: (v) => { S.ax = v; changed(); } });
    const latSl = slider(g3, { label: "Lateral offset", min: -8, max: 8, step: 0.05, value: S.lat, format: (v) => `${v.toFixed(2)} λ`, onInput: (v) => { S.lat = v; changed(); } });
    const out = card(lab.side, "Performance");
    const st = status(out);
    const ro = readout(out);

    const ch = api.challenges(root, [
      { id: "narrow", text: "Get the half-power beamwidth below 1°.", check: (s) => s.hpbw < 1 },
      { id: "sll", text: "With the feed horn, push the peak sidelobe below −25 dB. What happens to the beamwidth?", check: (s) => s.illum === "feed" && s.sll < -25 && s.focused },
      { id: "eff", text: "With a real feed horn and a perfect surface in focus, get the aperture efficiency above 80 %.", check: (s) => s.illum === "feed" && s.focused && s.rms === 0 && s.eta > 0.8 },
      { id: "defocus", text: "Defocus the feed along the axis until the gain drops by 3 dB.", check: (s) => Math.abs(s.lat) < 0.05 && s.rms === 0 && s.loss >= 3 },
      { id: "squint", text: "Squint the beam by two beamwidths or more with a lateral feed offset.", check: (s) => Math.abs(s.squint) >= 2 * s.hpbw0 },
      { id: "ruze", text: "With a surface no worse than 0.5 mm RMS, raise the frequency until Ruze's law costs at least 1 dB.", check: (s) => s.rms > 0 && s.rms <= 0.5 && s.ruzeDb >= 1 },
    ]);

    // ---------------------------------------------------------------- model
    function geom() {
      const lam = C0 / S.f, a = S.D / 2, F = S.fD * S.D;
      const psi0 = 2 * Math.atan(1 / (4 * S.fD));
      const SL = 40 * Math.log10(Math.cos(psi0 / 2));                 // space-loss part of the edge taper
      let q = (S.ET - SL) / (10 * Math.log10(Math.cos(psi0)));           // cos^q ψ feed power pattern
      q = clamp(q, 0, 200);
      const ETact = 10 * q * Math.log10(Math.cos(psi0)) + SL;
      return { lam, a, F, psi0, q, ETact, SL };
    }

    /**
     * Aperture field projected onto the x axis (the plane of the lateral offset): g(x) = ∫ E(x, y) dy.
     * E = feed amplitude × space loss × exp(−jk·(extra path)) × exp(j·4πε/λ). Path computed exactly from the displaced feed.
     */
    function aperture(G, ax, lat, rmsMm) {
      const { lam, a, F, q } = G;
      const k = TAU / lam;
      const nx = clamp(Math.ceil((2.4 * S.D) / lam) + 1, 96, 1700), ny = 40;
      const dx = (2 * a) / nx;
      const re = new Float64Array(nx), im = new Float64Array(nx);
      let sumA = 0, sumA2 = 0;
      const fx = lat * lam, fz = F + ax * lam, eps = rmsMm / 1000;
      for (let i = 0; i < nx; i++) {
        const x = -a + (i + 0.5) * dx;
        const half = Math.sqrt(Math.max(0, a * a - x * x));
        if (half <= 0) continue;
        const dy = (2 * half) / ny;
        let gr = 0, gi = 0;
        for (let j = 0; j < ny; j++) {
          const y = -half + (j + 0.5) * dy, r2 = x * x + y * y, zP = r2 / (4 * F);
          const vx = x - fx, vz = fz - zP, rho = Math.sqrt(vx * vx + y * y + vz * vz);
          const rho0 = F + r2 / (4 * F);                                // parabola: focus-to-surface distance
          let A;
          if (S.illum === "uniform") A = 1;
          else { const c = vz / rho; A = c > 0 ? Math.pow(c, q / 2) * (F / rho) : 0; }
          const ph = -k * (rho - rho0) + (eps ? ((2 * TAU) / lam) * eps * errAt(x / a, y / a) : 0);
          gr += A * Math.cos(ph) * dy; gi += A * Math.sin(ph) * dy;
          sumA += A * dx * dy; sumA2 += A * A * dx * dy;
        }
        re[i] = gr; im[i] = gi;
      }
      return { re, im, nx, dx, x0: -a + dx / 2, sumA, sumA2, k };
    }
    /** Power directivity pattern (linear, without spillover) at the given angles (radians). Uses phasor recurrence. */
    function pattern(ap, thetas) {
      const out = new Float64Array(thetas.length);
      const norm = (4 * Math.PI) / (C0 / S.f) ** 2 / ap.sumA2;
      for (let m = 0; m < thetas.length; m++) {
        const s = Math.sin(thetas[m]), ob = (1 + Math.cos(thetas[m])) / 2;
        const st = ap.k * ap.dx * s, cr = Math.cos(st), ci = Math.sin(st);
        let pr = Math.cos(ap.k * ap.x0 * s), pi = Math.sin(ap.k * ap.x0 * s), er = 0, ei = 0;
        for (let i = 0; i < ap.nx; i++) {
          er += ap.re[i] * pr - ap.im[i] * pi; ei += ap.re[i] * pi + ap.im[i] * pr;
          const t = pr * cr - pi * ci; pi = pr * ci + pi * cr; pr = t;
        }
        out[m] = norm * (er * er + ei * ei) * ap.dx * ap.dx * ob * ob;
      }
      return out;
    }

    function compute() {
      const G = geom();
      const { lam } = G;
      const spill = S.illum === "uniform" ? 1 : 1 - Math.pow(Math.cos(G.psi0), G.q + 1);
      const ap = aperture(G, S.ax, S.lat, S.rms);
      const ap0 = S.ax || S.lat || S.rms ? aperture(G, 0, 0, 0) : ap;
      const hp0 = rad((70 * lam) / S.D); // rough beamwidth, rad
      const squintEst = Math.abs(S.lat * lam / G.F) * 0.9;
      const need = deg(Math.max(6 * hp0, squintEst + 5 * hp0, Math.abs(S.ax) * 3 * hp0));
      const W = WINDOWS.find((v) => v >= need) || 90;
      const nR = 601, th = new Float64Array(nR);
      for (let i = 0; i < nR; i++) th[i] = rad(-W + (2 * W * i) / (nR - 1));
      const gR = pattern(ap, th), g0R = ap0 === ap ? gR : pattern(ap0, th);
      // polar: coarse full hemisphere plus the dense window
      const pol = [];
      for (let d = -90; d <= 90; d += 0.5) if (Math.abs(d) > W) pol.push(rad(d));
      const polTh = Float64Array.from([...pol, ...th].sort((p, q) => p - q));
      const gP = pattern(ap, polTh);
      const Gref = Math.max(...g0R) * spill;
      const dB = (v) => 10 * Math.log10(Math.max(v * spill, 1e-30) / Gref);
      const rectDb = Array.from(gR, dB), ref0Db = Array.from(g0R, dB), polDb = Array.from(gP, dB);
      // peak, HPBW, peak sidelobe
      let pk = 0; for (let i = 1; i < nR; i++) if (rectDb[i] > rectDb[pk]) pk = i;
      const meas = (arr) => {
        let p = 0; for (let i = 1; i < nR; i++) if (arr[i] > arr[p]) p = i;
        const lvl = arr[p] - 3;
        let L = p, R = p;
        while (L > 0 && arr[L] > lvl) L--;
        while (R < nR - 1 && arr[R] > lvl) R++;
        const ang = (i) => -W + (2 * W * i) / (nR - 1);
        const cross = (i0, i1) => lerp(ang(i0), ang(i1), (lvl - arr[i0]) / (arr[i1] - arr[i0]));
        const open = arr[L] > lvl || arr[R] > lvl;
        const hpbw = open ? Infinity : cross(R - 1, R) - cross(L + 1, L);
        // walk to first minima, then the highest lobe beyond
        let a = L, b = R;
        while (a > 0 && arr[a - 1] < arr[a]) a--;
        while (b < nR - 1 && arr[b + 1] < arr[b]) b++;
        let sl = -Infinity;
        for (let i = 0; i < a; i++) sl = Math.max(sl, arr[i]);
        for (let i = b + 1; i < nR; i++) sl = Math.max(sl, arr[i]);
        return { p, hpbw, sll: sl - arr[p], peakDeg: ang(p), peakDb: arr[p] };
      };
      const m = meas(rectDb), m0 = meas(ref0Db);
      const Gpk = Math.max(...gR) * spill;
      const Amax = Math.PI * (S.D / 2) ** 2;
      const Gmax = (4 * Math.PI * Amax) / lam ** 2;
      const taperEff = S.illum === "uniform" ? 1 : (ap0.sumA ** 2) / (Amax * ap0.sumA2);
      // a cut through the aperture along the offset direction: illumination and phase error (in wavelengths)
      const cut = [];
      const fx = S.lat * lam, fz = G.F + S.ax * lam;
      for (let i = 0; i <= 120; i++) {
        const x = -G.a + (2 * G.a * i) / 120, zP = (x * x) / (4 * G.F);
        const vx = x - fx, vz = fz - zP, rho = Math.hypot(vx, vz), rho0 = G.F + (x * x) / (4 * G.F);
        const c = vz / rho;
        const amp = S.illum === "uniform" ? 1 : c > 0 ? Math.pow(c, G.q / 2) * (G.F / rho) : 0;
        const err = -(rho - rho0) / lam + (S.rms ? (2 * (S.rms / 1000) * errAt(x / G.a, 0)) / lam : 0);
        cut.push([x / G.a, amp, err]);
      }
      const mid = cut[60][2];
      cut.forEach((c) => { c[2] -= mid; });
      return { cut, G, W, th, rectDb, ref0Db, polTh, polDb, m, m0, Gpk, Gref, Gmax, spill, taperEff, eta: Gpk / Gmax };
    }

    function setup(o) {
      touring = true;
      Object.assign(S, o);
      dSl.value = S.D; fSl.value = S.f; fdSl.value = S.fD; rmsSl.value = S.rms; illCh.value = S.illum; etSl.value = S.ET; axSl.value = S.ax; latSl.value = S.lat;
      changed();
      touring = false;
    }

    function changed() {
      P = compute();
      const { G, m, m0 } = P;
      const lam = G.lam;
      const ruze = Math.exp(-((((2 * TAU) * (S.rms / 1000)) / lam) ** 2));
      const loss = 10 * Math.log10(P.Gref / P.Gpk);
      const ff = (2 * S.D ** 2) / lam;
      Object.assign(S, { hpbw: m.hpbw, hpbw0: m0.hpbw, sll: m.sll, eta: P.eta, loss, squint: m.peakDeg, ruzeDb: -10 * Math.log10(ruze), focused: Math.abs(S.ax) < 0.05 && Math.abs(S.lat) < 0.05 });
      if (loss >= 3) st.set("bad", `Gain down ${fmtDb(loss)}`, " The feed is out of focus or the surface is rough: the aperture's phase is no longer flat.");
      else if (Math.abs(m.peakDeg) > 0.5 * m0.hpbw) st.set("warn", `Beam squinted ${num(Math.abs(m.peakDeg), 3)}°`, ` ${num(Math.abs(m.peakDeg) / m0.hpbw, 2)} beamwidths off axis, with ${fmtDb(loss)} scan loss.`);
      else st.set("ok", `${num(10 * Math.log10(P.Gpk), 3)} dBi pencil beam`, ` ${num(m.hpbw, 3)}° wide, ${num(S.D / lam, 3)} wavelengths across.`);
      ro.set([
        ["Wavelength λ", si(lam, "m", 3)],
        ["Beamwidth (computed)", isFinite(m.hpbw) ? `${num(m.hpbw, 3)}°` : "no clear beam", m.hpbw < 1 ? "ok" : null],
        ["Rule of thumb 70λ/D", `${num((70 * lam) / S.D, 3)}°`],
        ["Peak sidelobe", isFinite(m.sll) ? fmtDb(m.sll) : "–", m.sll < -25 ? "ok" : m.sll > -15 ? "warn" : null],
        ["Gain", `${num(10 * Math.log10(P.Gpk), 4)} dBi`],
        ["Max possible 4πA/λ²", `${num(10 * Math.log10(P.Gmax), 4)} dBi`],
        ["Aperture efficiency", `${num(P.eta * 100, 3)} %`, P.eta > 0.8 ? "ok" : P.eta < 0.5 ? "warn" : null],
        ["· taper efficiency", `${num(P.taperEff * 100, 3)} %`],
        ["· spillover efficiency", `${num(P.spill * 100, 3)} %`],
        ["Edge taper (actual)", S.illum === "uniform" ? "0 dB (ideal)" : fmtDb(G.ETact)],
        ["Rim half-angle ψ₀", `${num(deg(G.psi0), 3)}°`],
        ["Beam squint", `${num(m.peakDeg, 3)}°`],
        ["Loss vs in-focus", fmtDb(loss), loss >= 3 ? "bad" : loss >= 1 ? "warn" : null],
        ["Ruze exp[−(4πε/λ)²]", fmtDb(-S.ruzeDb)],
        ["Far field 2D²/λ", km(ff, 3)],
      ]);
      const path = pathSpread();
      rayCap.innerHTML = `Focal length ${km(G.F, 3)}, dish depth ${km(S.D ** 2 / (16 * G.F), 3)}. ` +
        (path != null ? `Path from feed to the aperture plane varies by <b>${path / lam < 0.005 ? "0" : num(path / lam, 2)} λ</b> across the dish${path / lam < 0.02 ? ": all in step, a plane wave" : ""}.` : "") +
        ` Wavefronts drawn every ${waveStep().n} λ.`;
      if (!touring) ch.update(S);
      rays.redraw(); apv.redraw(); rect.redraw(); polar.redraw();
    }

    // ---------------------------------------------------------------- ray geometry (2-D cut, dish opening to the right)
    function rayMap() {
      const G = geom(), w = rays.w, hh = rays.h;
      const a = G.a, F = G.F;
      const u0 = -0.06 * S.D, u1 = F + 0.55 * S.D;            // horizontal extent in metres (vertex at u = 0)
      const sc = Math.min((w - 24) / (u1 - u0), (hh - 24) / (1.25 * S.D));
      const ox = 12 - u0 * sc + Math.max(0, (w - 24 - (u1 - u0) * sc) / 2), oy = hh / 2;
      return {
        lam: G.lam, F, a, q: G.q, psi0: G.psi0, sc, u1,
        toPx: (u, v) => [ox + u * sc, oy - v * sc],
        fromPx: (x, y) => [(x - ox) / sc, (oy - y) / sc],
        uEdge: (w - ox) / sc,
      };
    }
    function waveStep() {
      const M = rayMap();
      const n = Math.max(1, Math.ceil(16 / (M.sc * M.lam)));
      return { n, L: n * M.lam };
    }
    /** Trace one ray from the (displaced) feed in direction angle ψ measured from the −u axis. */
    function traceRay(M, psi) {
      const fu = M.F + S.ax * M.lam, fv = S.lat * M.lam;
      const du = -Math.cos(psi), dv = Math.sin(psi);
      const A = (dv * dv) / (4 * M.F), B = (2 * fv * dv) / (4 * M.F) - du, Cc = (fv * fv) / (4 * M.F) - fu;
      let t = -1;
      if (Math.abs(A) < 1e-12) t = -Cc / B;
      else {
        const disc = B * B - 4 * A * Cc;
        if (disc >= 0) {
          const r1 = (-B - Math.sqrt(disc)) / (2 * A), r2 = (-B + Math.sqrt(disc)) / (2 * A);
          t = [r1, r2].filter((v) => v > 1e-9).sort((p, q) => p - q)[0] ?? -1;
        }
      }
      const amp = S.illum === "uniform" ? 1 : Math.cos(psi) > 0 ? Math.pow(Math.cos(psi), M.q / 2) : 0;
      if (t > 0) {
        const hu = fu + t * du, hv = fv + t * dv;
        if (Math.abs(hv) <= M.a) {
          let nu = 1, nv = -hv / (2 * M.F); const nn = Math.hypot(nu, nv); nu /= nn; nv /= nn;
          const dot = du * nu + dv * nv, ru = du - 2 * dot * nu, rv = dv - 2 * dot * nv;
          return { hit: true, fu, fv, hu, hv, ru, rv, t, amp };
        }
      }
      return { hit: false, fu, fv, du, dv, amp };
    }
    function pathSpread() {
      const M = rayMap();
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i <= 40; i++) {
        const psi = -M.psi0 * 0.98 + (2 * M.psi0 * 0.98 * i) / 40;
        const r = traceRay(M, psi);
        if (!r.hit || r.ru <= 0) continue;
        const plane = M.F + 0.5 * S.D;
        const len = r.t + (plane - r.hu) / r.ru;
        lo = Math.min(lo, len); hi = Math.max(hi, len);
      }
      return isFinite(lo) ? hi - lo : null;
    }

    function drawRays(ctx, w, hh) {
      const T = theme(), M = rayMap();
      ctx.fillStyle = T.surface2; ctx.fillRect(0, 0, w, hh);
      // axis and aperture plane
      const [ax0, ay0] = M.toPx(-0.06 * S.D, 0), [ax1] = M.toPx(M.uEdge, 0);
      ctx.strokeStyle = alpha(T.axis, 0.6); ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax0, ay0); ctx.lineTo(ax1, ay0); ctx.stroke(); ctx.setLineDash([]);
      // rays
      const n = 25, psis = [];
      for (let i = 0; i < n; i++) psis.push(-M.psi0 + (2 * M.psi0 * (i + 0.5)) / n);
      const extra = Math.min(Math.PI * 0.5 - M.psi0, M.psi0 * 0.45);
      for (let i = 1; i <= 3; i++) { psis.push(M.psi0 + (extra * i) / 3.2); psis.push(-M.psi0 - (extra * i) / 3.2); }
      const traced = psis.map((p) => [p, traceRay(M, p)]).sort((a, b) => a[0] - b[0]);
      const far = M.uEdge + S.D;
      for (const [, r] of traced) {
        const [fx, fy] = M.toPx(r.fu, r.fv);
        if (r.hit) {
          const [hx, hy] = M.toPx(r.hu, r.hv);
          const L = (far - r.hu) / Math.max(0.05, Math.abs(r.ru)) + S.D;
          const [ex, ey] = M.toPx(r.hu + r.ru * L, r.hv + r.rv * L);
          ctx.strokeStyle = alpha(T.tx, 0.15 + 0.75 * r.amp); ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
        } else {
          const [ex, ey] = M.toPx(r.fu + r.du * 3 * S.D, r.fv + r.dv * 3 * S.D);
          ctx.strokeStyle = alpha(T.muted, 0.2 + 0.6 * r.amp); ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      // wavefronts: points of equal path length along neighbouring rays
      const { L } = waveStep();
      const off = ((S.t * 0.5) % 1) * L;
      const hits = traced.filter(([, r]) => r.hit);
      const posAt = (r, s) => (s <= r.t ? [r.fu + (r.hu - r.fu) * (s / r.t), r.fv + (r.hv - r.fv) * (s / r.t)] : [r.hu + r.ru * (s - r.t), r.hv + r.rv * (s - r.t)]);
      const maxS = M.F * 2 + 1.2 * S.D;
      ctx.strokeStyle = alpha(T.rx, 0.85); ctx.lineWidth = 1.6;
      for (let s = off; s < maxS; s += L) {
        ctx.beginPath();
        let pen = false;
        for (const [, r] of hits) {
          const [u, v] = posAt(r, s);
          if (u > M.uEdge + 0.1 * S.D) { pen = false; continue; }
          const [x, y] = M.toPx(u, v);
          pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          pen = true;
        }
        ctx.stroke();
      }
      // dish
      ctx.strokeStyle = T.ink; ctx.lineWidth = 3.5; ctx.beginPath();
      for (let i = 0; i <= 80; i++) { const v = -M.a + (2 * M.a * i) / 80; const [x, y] = M.toPx((v * v) / (4 * M.F), v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      // focus and feed
      const [fx0, fy0] = M.toPx(M.F, 0);
      ctx.strokeStyle = T.muted; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(fx0 - 5, fy0 - 5); ctx.lineTo(fx0 + 5, fy0 + 5); ctx.moveTo(fx0 + 5, fy0 - 5); ctx.lineTo(fx0 - 5, fy0 + 5); ctx.stroke();
      const [fx, fy] = M.toPx(M.F + S.ax * M.lam, S.lat * M.lam);
      ctx.fillStyle = T.tgt;
      ctx.beginPath(); ctx.moveTo(fx - 3, fy - 8); ctx.lineTo(fx + 8, fy - 3); ctx.lineTo(fx + 8, fy + 3); ctx.lineTo(fx - 3, fy + 8); ctx.closePath(); ctx.fill();
      ctx.fillRect(fx + 8, fy - 3, 12, 6);
      ctx.strokeStyle = alpha(T.tgt, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fx, fy, 16, 0, TAU); ctx.stroke();
      label(ctx, "feed", fx + 4, fy - 26, { color: T.tgt, align: "center", font: T.font });
      if (Math.hypot(fx - fx0, fy - fy0) > 18) label(ctx, "focus", fx0, fy0 + 20, { color: T.muted, align: "center", font: T.font });
      // dimension: D
      const [dx0, dy0] = M.toPx(M.a ** 2 / (4 * M.F), M.a), [, dy1] = M.toPx(M.a ** 2 / (4 * M.F), -M.a);
      label(ctx, `D = ${km(S.D, 3)} = ${num(S.D / M.lam, 3)} λ`, dx0 + 8, dy0 + 2, { font: T.font, bounds: w });
      void dy1;
    }

    function drawAp(ctx, w, hh) {
      const T = theme();
      if (!P) return;
      const ext = Math.max(0.5, ...P.cut.map((c) => Math.abs(c[2])));
      const top = ext <= 0.5 ? 0.5 : ext <= 1 ? 1 : ext <= 2 ? 2 : ext <= 5 ? 5 : Math.ceil(ext / 5) * 5;
      const A = axes(ctx, w, hh, { x: [-1, 1], y: [-top, top], xticks: [-1, -0.5, 0, 0.5, 1], yticks: [-top, 0, top], xfmt: (v) => (v === -1 ? "rim" : v === 1 ? "rim" : v === 0 ? "centre" : ""), yfmt: (v) => `${num(v)} λ`, pad: { l: 46, b: 22, t: 8 } });
      ctx.fillStyle = alpha(T.accent, 0.22); ctx.beginPath(); ctx.moveTo(A.X(-1), A.b);
      P.cut.forEach(([u, a]) => ctx.lineTo(A.X(u), A.b - a * (A.b - A.t)));
      ctx.lineTo(A.X(1), A.b); ctx.closePath(); ctx.fill();
      A.clip();
      ctx.strokeStyle = T.c4; ctx.lineWidth = 2; ctx.beginPath();
      P.cut.forEach(([u, , e], i) => (i ? ctx.lineTo(A.X(u), A.Y(e)) : ctx.moveTo(A.X(u), A.Y(e))));
      ctx.stroke();
      A.unclip();
      const kind = Math.abs(S.lat) > 0.05 ? "linear tilt (squint) + coma" : Math.abs(S.ax) > 0.05 ? "quadratic (defocus)" : S.rms ? "random (surface errors)" : "flat: every ray in step";
      label(ctx, `phase error: ${kind}`, A.l + 6, A.t + 10, { font: T.font, color: T.c4, bounds: w });
    }

    // ---------------------------------------------------------------- pattern plots
    function drawRect(ctx, w, hh) {
      const T = theme();
      if (!P) return;
      const W = P.W;
      const A = axes(ctx, w, hh, { x: [-W, W], y: [-50, 2], yticks: [-50, -40, -30, -20, -10, 0], xlabel: "angle from the dish axis (°)", ylabel: "dB re in-focus peak", xfmt: (v) => `${num(v)}°`, pad: { l: 46, b: 30, t: 8 } });
      A.clip();
      const line = (arr, color, wd, dash) => {
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = wd; if (dash) ctx.setLineDash(dash); ctx.beginPath();
        arr.forEach((v, i) => { const x = A.X(deg(P.th[i])), y = A.Y(Math.max(v, -60)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke(); ctx.restore();
      };
      if (P.ref0Db !== P.rectDb && (S.ax || S.lat || S.rms)) line(P.ref0Db, alpha(T.muted, 0.9), 1.3, [5, 4]);
      ctx.fillStyle = alpha(T.accent, 0.12); ctx.beginPath(); ctx.moveTo(A.l, A.b);
      P.rectDb.forEach((v, i) => ctx.lineTo(A.X(deg(P.th[i])), A.Y(Math.max(v, -60))));
      ctx.lineTo(A.r, A.b); ctx.closePath(); ctx.fill();
      line(P.rectDb, T.accent, 2);
      const m = P.m;
      ctx.strokeStyle = alpha(T.bad, 0.8); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(A.l, A.Y(m.peakDb - 3)); ctx.lineTo(A.r, A.Y(m.peakDb - 3)); ctx.stroke();
      if (isFinite(m.sll) && m.peakDb + m.sll > -50) { ctx.beginPath(); ctx.moveTo(A.l, A.Y(m.peakDb + m.sll)); ctx.lineTo(A.r, A.Y(m.peakDb + m.sll)); ctx.stroke(); }
      ctx.setLineDash([]);
      A.unclip();
      if (isFinite(m.hpbw)) label(ctx, `θ₃dB = ${num(m.hpbw, 3)}°`, A.X(m.peakDeg) + 10, A.Y(m.peakDb - 3) - 12, { color: T.ink, bounds: w, font: T.font });
      if (isFinite(m.sll) && m.peakDb + m.sll > -50) label(ctx, `sidelobe ${fmtDb(m.sll)}`, A.r - 4, A.Y(m.peakDb + m.sll) - 11, { align: "right", color: T.bad, font: T.font });
    }

    function drawPolar(ctx, w, hh) {
      const T = theme();
      if (!P) return;
      const cx = w / 2, cy = hh - 18, R = Math.min(w / 2 - 26, hh - 42);
      const rOf = (d) => (clamp(d, -50, 0) + 50) / 50 * R;
      ctx.font = T.font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const lv of [0, -10, -20, -30, -40]) {
        ctx.strokeStyle = lv === 0 ? T.axis : T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, rOf(lv), Math.PI, TAU); ctx.stroke();
        ctx.fillStyle = T.muted; if (lv < 0) ctx.fillText(`${lv}`, cx + rOf(lv) + 0, cy + 9);
      }
      for (let a = -90; a <= 90; a += 30) {
        const t = rad(a);
        ctx.strokeStyle = T.grid; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.sin(t), cy - R * Math.cos(t)); ctx.stroke();
        ctx.fillStyle = T.muted; ctx.fillText(`${a}°`, cx + (R + 0) * Math.sin(t) * 1.0 + (a === 90 ? -10 : a === -90 ? 10 : 0), cy - (R + 9) * Math.cos(t));
      }
      ctx.fillStyle = alpha(T.accent, 0.18); ctx.strokeStyle = T.accent; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      P.polDb.forEach((v, i) => { const t = P.polTh[i], r = rOf(v); ctx.lineTo(cx + r * Math.sin(t), cy - r * Math.cos(t)); });
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    changed();

    notes(root, "Background", [
      { title: "Why a parabola?", open: true, html:
        "<p>A parabola is the set of points equally far from a point (the focus) and a line (the directrix). Write the dish as <i>z</i> = <i>r</i>²/4<i>f</i>, with the focus at height <i>f</i>. A ray from the focus to the surface point at radius <i>r</i> travels <i>f</i> + <i>r</i>²/4<i>f</i>; after reflecting straight up it needs another <i>f</i> − <i>r</i>²/4<i>f</i> to reach the plane through the focus. The sum is always 2<i>f</i>:</p>" +
        "<p class=\"eq\">ρ(<i>r</i>) + (<i>f</i> − <i>z</i>) = (<i>f</i> + <span class=\"frac\"><span><i>r</i>²</span><span>4<i>f</i></span></span>) + (<i>f</i> − <span class=\"frac\"><span><i>r</i>²</span><span>4<i>f</i></span></span>) = 2<i>f</i></p>" +
        "<p>Equal paths mean equal phase across the aperture: a flat wavefront. The same geometry works backwards, so a dish focuses an incoming plane wave onto the feed. Antennas are <b>reciprocal</b>: the transmit and receive patterns are identical.</p>" },
      { title: "Beamwidth and gain", html:
        "<p>The far-field pattern is the Fourier transform of the aperture field. For a uniformly lit circular aperture of diameter <i>D</i>:</p>" +
        "<p class=\"eq\"><i>E</i>(θ) ∝ <span class=\"frac\"><span>2 <i>J</i>₁(<i>u</i>)</span><span><i>u</i></span></span>, &nbsp; <i>u</i> = <span class=\"frac\"><span>π<i>D</i></span><span>λ</span></span> sin θ &nbsp;&nbsp; θ<sub>3dB</sub> = 1.02 <span class=\"frac\"><span>λ</span><span><i>D</i></span></span> rad ≈ 58 <span class=\"frac\"><span>λ</span><span><i>D</i></span></span> °</p>" +
        "<p>Real dishes are tapered and come out at 65–75 λ/<i>D</i>, hence the rule of thumb 70 λ/<i>D</i>. (The often-quoted 51 λ/<i>D</i> is for a uniform <em>line</em> or rectangular aperture.) Gain is</p>" +
        "<p class=\"eq\"><i>G</i> = η <span class=\"frac\"><span>4π<i>A</i></span><span>λ²</span></span> = η <span class=\"frac\"><span>(π<i>D</i>)²</span><span>λ²</span></span> &nbsp;&nbsp; <i>G</i> ≈ <span class=\"frac\"><span>30 000</span><span>θ<sub>az</sub> θ<sub>el</sub></span></span> (degrees)</p>" +
        "<p>A 1 m dish at 10 GHz: (π × 33)² × 0.65 ≈ 7000, or 38.5 dBi.</p>" },
      { title: "The efficiency budget", html:
        "<p>Aperture efficiency η multiplies several losses. The two this simulation computes are</p>" +
        "<ul><li><b>Taper (illumination) efficiency</b> η<sub>t</sub> = |∫<i>E</i> d<i>A</i>|² / (<i>A</i> ∫|<i>E</i>|² d<i>A</i>), 100 % only for uniform illumination.</li>" +
        "<li><b>Spillover efficiency</b> η<sub>s</sub>: the fraction of the feed's power that actually hits the dish. For a cos<sup><i>q</i></sup>ψ feed it is 1 − cos<sup><i>q</i>+1</sup>ψ₀.</li></ul>" +
        "<p>Their product peaks near 80–82 % at an edge taper of about −11 dB, almost independent of <i>f</i>/<i>D</i> (Silver's classic result). Real antennas also lose to feed and strut <b>blockage</b>, cross-polarisation, phase-centre errors, surface errors and ohmic loss, ending up at 55–70 %.</p>" +
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Aperture distribution</th><th>θ<sub>3dB</sub></th><th>First sidelobe</th><th>η<sub>t</sub></th></tr>" +
        "<tr><td>Uniform</td><td class=\"num\">1.02 λ/<i>D</i></td><td class=\"num\">−17.6 dB</td><td class=\"num\">100 %</td></tr>" +
        "<tr><td>(1 − <i>r</i>²) parabolic</td><td class=\"num\">1.27 λ/<i>D</i></td><td class=\"num\">−24.6 dB</td><td class=\"num\">75 %</td></tr>" +
        "<tr><td>(1 − <i>r</i>²)² parabolic squared</td><td class=\"num\">1.47 λ/<i>D</i></td><td class=\"num\">−30.6 dB</td><td class=\"num\">56 %</td></tr></table></div>" },
      { title: "f/D, feeds and other geometries", html:
        "<p>A <b>deep</b> dish (small <i>f</i>/<i>D</i>, ~0.25–0.3) is compact and its feed is shielded by the rim, but needs a wide-angle feed and is less forgiving of feed offsets. A <b>shallow</b> dish (<i>f</i>/<i>D</i> 0.4–0.6+) is easier to illuminate, scans better with off-axis feeds, but has a long feed support.</p>" +
        "<ul><li><b>Cassegrain</b> and <b>Gregorian</b>: a convex hyperbolic (or concave elliptical) sub-reflector folds the optics so the feed and receiver sit behind the main dish. Common on tracking radars and large antennas.</li>" +
        "<li><b>Offset-fed</b> reflectors use a section of a parabola away from its vertex, so the feed doesn't block the beam: lower sidelobes, as on satellite TV dishes.</li>" +
        "<li><b>Monopulse feeds</b> place four horns (or a multimode horn) around the focus. Each produces a slightly squinted beam; comparing sum and difference signals gives the target's angle off boresight within a single pulse.</li>" +
        "<li><b>Shaped reflectors</b> (e.g. cosecant² surveillance antennas) deliberately distort the parabola to spread the beam in elevation.</li></ul>" },
      { title: "Feed displacement: defocus, squint and coma", html:
        "<p>Moving the feed by δ changes each ray's path by about δ·(unit vector to that point of the dish). For an axial move Δ<i>z</i> the extra path is Δ<i>z</i> cos ψ, a phase error growing with radius like <i>r</i>²: <b>defocus</b>. For a lateral move δ it is −δ sin ψ cos φ: mostly a linear phase tilt that <b>steers</b> the beam by θ ≈ BDF · δ/<i>f</i>, where the beam-deviation factor BDF is 0.8–0.95 (larger for shallow dishes), plus a cubic part, <b>coma</b>, which raises a lobe on the side towards the axis. The simulation computes the exact path from the displaced feed to every point of the aperture, so these effects come out of the integral rather than a formula.</p>" },
      { title: "Surface accuracy and the far field", html:
        "<p><b>Ruze's equation</b> treats small random surface errors with RMS ε as random phase errors of RMS 4πε/λ (the wave meets the error twice):</p>" +
        "<p class=\"eq\"><i>G</i> = <i>G</i>₀ exp[−(4πε/λ)²]</p>" +
        "<p>ε = λ/16 costs about 2.7 dB; λ/40 about 0.4 dB. The lost power doesn't vanish: it's scattered into a broad pedestal of raised sidelobes whose width depends on the error's correlation length. The simulation uses one random smooth error map with correlation length ≈ <i>D</i>/10.</p>" +
        "<p><b>Far field.</b> The pattern only settles into its final shape beyond about 2<i>D</i>²/λ: 67 m for a 1 m dish at 10 GHz, but 1.7 km for a 5 m dish at 10 GHz. Antenna ranges either use that distance, a compact-range reflector, or near-field scanning plus a Fourier transform.</p>" },
    ]);

    api.quiz(root, [
      { q: "A 2 m dish at 10 GHz has a beam about 1° wide. What happens if you use the same dish at 20 GHz (with a suitable feed)?", options: ["2° beam, 6 dB less gain", "0.5° beam, 6 dB more gain", "Same beam; only the gain changes", "0.25° beam, 12 dB more gain"], answer: 1, why: "θ ∝ λ/D halves; G ∝ (D/λ)² quadruples (+6 dB), as long as the surface stays accurate enough (Ruze)." },
      { q: "Why don't designers illuminate a dish uniformly to get the maximum gain?", options: ["Uniform feeds are illegal", "A feed bright enough at the rim spills lots of power past the edge, and uniform illumination gives high (−17.6 dB) sidelobes", "Uniform illumination makes the beam wider", "The dish would overheat"], answer: 1, why: "Spillover wastes power (and picks up noise from the hot ground behind), and sidelobes cause clutter and jamming problems. A ~−11 dB edge taper balances taper and spillover losses." },
      { q: "You slide the feed sideways off the focus. What happens to the beam?", options: ["It points to the same side as the feed", "It points to the opposite side, and a coma lobe appears", "Nothing: only axial moves matter", "The beam splits in two equal beams"], answer: 1, why: "The aperture phase tilts, steering the beam by about BDF·δ/f to the opposite side (like an image in a mirror). The higher-order error (coma) raises sidelobes on one side." },
      { q: "A 35 GHz dish has a 0.5 mm RMS surface error. Roughly how much gain does Ruze's equation say it loses?", options: ["0.05 dB", "About 2 dB", "About 10 dB", "Nothing, the error is less than λ"], answer: 1, why: "λ = 8.6 mm, so 4πε/λ = 0.73 rad, exp(−0.53) = 0.59, about −2.3 dB. Being 'smaller than λ' isn't enough; you need ε ≲ λ/30 for small losses." },
    ]);

    return () => {};
  },
};
