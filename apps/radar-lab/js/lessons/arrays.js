// Lesson 11: electronically steered (phased) arrays. Steer a beam with phase alone; see grating lobes,
// tapers, phase-shifter quantisation, element failures and beam squint, all computed from the array factor.
import {
  h, card, labGrid, group, notes, slider, choice, check, button, readout, status, legend,
  canvasView, drag, animate, playButton, axes, theme, alpha, label, num, clamp, rad, deg, TAU, rng, reducedMotion,
} from "../ui.js";

const NT = 1441;                       // pattern samples over −90..90° (0.125° apart)
const TH = new Float64Array(NT), UT = new Float64Array(NT), CT = new Float64Array(NT);
for (let i = 0; i < NT; i++) { TH[i] = -90 + (180 * i) / (NT - 1); UT[i] = Math.sin(rad(TH[i])); CT[i] = Math.cos(rad(TH[i])); }
const UMAX = 3, NU = 1201;             // "extended" u = sin θ axis, to show the visible region
const UU = new Float64Array(NU);
for (let i = 0; i < NU; i++) UU[i] = -UMAX + (2 * UMAX * i) / (NU - 1);
const EL_EXP = 1.5;                    // element power pattern cos^1.5 θ (field cos^0.75 θ)
const BITS_INF = 9;                    // slider position meaning "exact phase"
const FLOOR = -50;

// ---------------------------------------------------------------- amplitude tapers (all normalised to max 1)

/** Taylor (n̄-parameter) taper sampled at the element positions, as in scipy.signal.windows.taylor. */
function taylorWin(N, sllDb, nbar) {
  const A = Math.acosh(10 ** (sllDb / 20)) / Math.PI;
  const s2 = (nbar * nbar) / (A * A + (nbar - 0.5) ** 2);
  const F = [];
  for (let m = 1; m < nbar; m++) {
    let numer = m % 2 ? 1 : -1, denom = 2;
    for (let n = 1; n < nbar; n++) {
      numer *= 1 - (m * m) / s2 / (A * A + (n - 0.5) ** 2);
      if (n !== m) denom *= 1 - (m * m) / (n * n);
    }
    F.push(numer / denom);
  }
  const W = (n) => 1 + 2 * F.reduce((s, f, k) => s + f * Math.cos((TAU * (k + 1) * (n - N / 2 + 0.5)) / N), 0);
  const c = W((N - 1) / 2);
  return Float64Array.from({ length: N }, (_, n) => W(n) / c);
}

/** Dolph–Chebyshev taper: equal sidelobes at −sllDb (frequency-domain construction, as in scipy chebwin). */
function chebWin(N, sllDb) {
  if (N < 2) return Float64Array.of(1);
  const order = N - 1;
  const beta = Math.cosh(Math.acosh(10 ** (sllDb / 20)) / order);
  const p = new Float64Array(N), pi = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const x = beta * Math.cos((Math.PI * k) / N);
    let v;
    if (x > 1) v = Math.cosh(order * Math.acosh(x));
    else if (x < -1) v = (2 * (N % 2) - 1) * Math.cosh(order * Math.acosh(-x));
    else v = Math.cos(order * Math.acos(x));
    if (N % 2) { p[k] = v; } else { p[k] = v * Math.cos((Math.PI * k) / N); pi[k] = v * Math.sin((Math.PI * k) / N); }
  }
  const dft = (m) => { let s = 0; for (let k = 0; k < N; k++) { const a = (-TAU * k * m) / N; s += p[k] * Math.cos(a) - pi[k] * Math.sin(a); } return s; };
  const half = [];
  let w;
  if (N % 2) {
    const n = (N + 1) / 2;
    for (let m = 0; m < n; m++) half.push(dft(m));
    w = [...half.slice(1).reverse(), ...half];
  } else {
    const n = N / 2 + 1;
    for (let m = 0; m < n; m++) half.push(dft(m));
    w = [...half.slice(1).reverse(), ...half.slice(1)];
  }
  const mx = Math.max(...w);
  return Float64Array.from(w, (v) => v / mx);
}

function taper(N, kind) {
  if (kind === "hamming" && N > 2) return Float64Array.from({ length: N }, (_, n) => (0.54 - 0.46 * Math.cos((TAU * n) / (N - 1))) / 1);
  if (kind === "taylor" && N > 2) return taylorWin(N, 30, 4);
  if (kind === "cheb" && N > 2) return chebWin(N, 40);
  return new Float64Array(N).fill(1);
}

/** |AF(u)| for elements at xs (in λ0), weights w, applied phases ph (rad), frequency scale ks = f/f0. */
function arrayFactor(us, xs, w, ph, ks, out) {
  const N = xs.length;
  for (let i = 0; i < us.length; i++) {
    let re = 0, im = 0;
    const a = TAU * ks * us[i];
    for (let n = 0; n < N; n++) {
      if (!w[n]) continue;
      const p = a * xs[n] + ph[n];
      re += w[n] * Math.cos(p); im += w[n] * Math.sin(p);
    }
    out[i] = Math.hypot(re, im);
  }
  return out;
}

const hexRgb = (hex) => { let s = hex.replace("#", ""); if (s.length === 3) s = s.split("").map((c) => c + c).join(""); const n = parseInt(s.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const wrap360 = (d) => ((d % 360) + 360) % 360;
const elemTicks = (N) => { const st = [1, 2, 4, 5, 8, 10, 16].find((s) => s >= N / 8) || 16; const t = [1]; for (let i = st; i <= N; i += st) if (i > 1) t.push(i); return t; };
const db20 = (x) => 20 * Math.log10(Math.max(x, 1e-9));

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "A phased array is a row (or grid) of small antennas fed with the same signal, each with its own <b>phase shifter</b>. " +
      "Delay each element a little more than its neighbour and the wavefronts add up in a new direction: the beam swings " +
      "across the sky in microseconds, with no motor at all. The price is grating lobes, scan loss and a beam that broadens as it tilts." }));

    const S = {
      N: 16, d: 0.5, theta0: 0, taper: "uniform", bits: BITS_INF, df: 0, ttd: false, fail: 0, seed: 3, elem: true, axis: "theta",
      sawSquint: false,
    };
    // derived
    let xs, w, wT, ideal, applied, sumFull = 1;
    const A = new Float64Array(NT), Aref = new Float64Array(NT), AU = new Float64Array(NU);
    let M = {};       // analysis results
    let fieldDirty = true, phaseT = 0;

    const tour = api.steps(root, [
      { title: "1 · Many small antennas", html: "<p>Sixteen elements half a wavelength apart, all fed in phase. Their waves add up straight ahead (<b>broadside</b>) and cancel in most other directions. That's a beam, made purely by interference.</p>",
        look: "the flat wavefronts above the array and the single main lobe in the pattern, with sidelobes about 13 dB down.",
        apply: () => set({ N: 16, d: 0.5, theta0: 0, taper: "uniform", bits: BITS_INF, fail: 0, df: 0, ttd: false, axis: "theta" }) },
      { title: "2 · Steer with phase", html: "<p>Give each element a phase lag that grows steadily along the array: Δφ = −360° · (<i>d</i>/λ) · sin θ<sub>0</sub>. For 30° and half-wavelength spacing that's −90° per element. The waves now line up along a tilted front, and the beam points at 30°.</p>",
        look: "the staircase in the phase chart (it wraps at 360°, because phase shifters only need to cover one turn) and the tilted wavefronts. Drag the handle on the polar plot.",
        apply: () => set({ theta0: 30 }) },
      { title: "3 · Scanning costs something", html: "<p>Seen from 60° off broadside, the array looks only half as long (cos 60° = 0.5), so the beam is <b>twice as wide</b>. Each element also radiates less sideways, so the peak drops: this <b>scan loss</b> is about 4.5 dB at 60° here.</p>",
        look: "the main lobe in the pattern, much fatter than at broadside, and its peak below 0 dB.",
        apply: () => set({ theta0: 60, elem: true }) },
      { title: "4 · Grating lobes", html: "<p>Spread the elements a full wavelength apart and a second, full-strength beam appears: a <b>grating lobe</b>. The array factor repeats every λ/<i>d</i> in sin θ, and with wide spacing the repeat falls inside the real angles. Avoid it with <i>d</i> &lt; λ / (1 + |sin θ<sub>0</sub>|).</p>",
        look: "the sin θ axis: the shaded areas are angles that don't exist (|sin θ| > 1). Each copy of the beam that lands in the clear middle is radiated for real.",
        apply: () => set({ theta0: 30, d: 1, axis: "u" }) },
      { title: "5 · Taper for low sidelobes", html: "<p>Feeding the edge elements more weakly than the centre smooths the aperture and pushes the sidelobes down: −30 dB with a Taylor taper instead of −13 dB uniform. You pay with a slightly wider beam and a little less gain (taper loss).</p>",
        look: "the amplitude dots in the element chart and the sidelobes falling to the −30 dB line.",
        apply: () => set({ d: 0.5, theta0: 20, taper: "taylor", axis: "theta", N: 24 }) },
      { title: "6 · Real hardware", html: "<p>Real phase shifters have a few bits, so the phase staircase is rounded to steps (45° with 3 bits). The periodic error creates <b>quantisation lobes</b>. Elements also fail; with 10 % dead the beam barely notices. This <b>graceful degradation</b> is a big reason AESAs are trusted.</p>",
        look: "the grey ideal ticks against the rounded bars, the new spurious lobes, and the dead elements marked ×.",
        apply: () => set({ bits: 3, fail: 10, theta0: 25 }) },
      { title: "7 · Wide bandwidth: squint", html: "<p>A phase shifter applies the same phase at every frequency, but the phase needed to steer is proportional to frequency. Move 5 % off the centre frequency and the beam <b>squints</b> toward broadside. True time delay (TTD) delays each element in seconds instead, which is right at every frequency.</p>",
        look: "the dashed pattern at the centre frequency against the solid one at f₀ + 5 %. Then tick <b>True time delay</b>.",
        apply: () => set({ bits: BITS_INF, fail: 0, taper: "uniform", N: 16, theta0: 45, df: 0.05, ttd: false }) },
    ]);

    const lab = labGrid(root);

    // ---- wave field
    const fieldCard = card(lab.main, "Wave field above the array", "instantaneous field; colour = crest / trough");
    const field = api.track(canvasView(fieldCard, { aspect: 2, minHeight: 210, maxHeight: 380, draw: drawField, label: "Animated wave field radiated by a linear phased array" }));
    const fieldCap = h("p", { class: "caption" });
    fieldCard.append(fieldCap);

    // ---- pattern
    const patCard = card(lab.main, "Radiation pattern", "array factor × element pattern, in dB");
    const pat = api.track(canvasView(patCard, { aspect: 2.4, minHeight: 220, maxHeight: 340, draw: drawPattern, label: "Array radiation pattern in decibels against angle" }));
    legend(patCard, [[theme().accent, "pattern now"], [theme().muted, "at centre frequency f₀ (dashed)"], [theme().c5, "element pattern"], [theme().warn, "grating lobe"]]);

    const cols = h("div", { class: "cols2" });
    lab.main.append(cols);
    const polCard = card(cols, "Polar view", "drag the handle to steer");
    const pol = api.track(canvasView(polCard, { aspect: 1.75, minHeight: 190, maxHeight: 300, draw: drawPolar, label: "Polar plot of the beam; drag the handle to steer" }));
    drag(pol, {
      hit: (x, y) => { const g = polGeom(); const r = Math.hypot(x - g.cx, y - g.cy); return r > g.R * 0.2 && r < g.R + 30 && y < g.cy + 8; },
      move: (x, y) => { const g = polGeom(); const t = deg(Math.atan2(x - g.cx, g.cy - y)); set({ theta0: Math.round(clamp(t, -80, 80) * 2) / 2 }); },
    });
    const phCard = card(cols, "Element commands", "phase at f₀ and amplitude weight");
    const phv = api.track(canvasView(phCard, { aspect: 1.75, minHeight: 190, maxHeight: 300, draw: drawPhases, label: "Bar chart of phase and amplitude per element" }));
    legend(phCard, [[theme().accent, "phase (bars)"], [theme().ink, "ideal phase (ticks, when rounded)"], [theme().c4, "amplitude, right axis"]]);

    // ---- controls
    const ctl = card(lab.side, "Controls");
    const g1 = group(ctl, "Array");
    const nSl = slider(g1, { label: "Elements <i>N</i>", min: 2, max: 64, step: 1, value: S.N, onInput: (v) => set({ N: v }) });
    const dSl = slider(g1, { label: "Spacing <i>d</i>", min: 0.1, max: 2, step: 0.01, value: S.d, format: (v) => `${v.toFixed(2)} λ`, onInput: (v) => set({ d: v }) });
    const tpCh = choice(g1, { label: "Amplitude taper", value: S.taper, options: [["uniform", "Uniform"], ["hamming", "Hamming"], ["taylor", "Taylor −30"], ["cheb", "Chebyshev −40"]], onChange: (v) => set({ taper: v }) });
    const g2 = group(ctl, "Steering");
    const thSl = slider(g2, { label: "Steer angle θ<sub>0</sub>", min: -80, max: 80, step: 0.5, value: S.theta0, format: (v) => `${num(v, 3)}°`, onInput: (v) => set({ theta0: v }) });
    const bSl = slider(g2, { label: "Phase-shifter bits", min: 1, max: BITS_INF, step: 1, value: S.bits, format: (v) => (v >= BITS_INF ? "∞ (exact)" : `${v} bit · ${num(360 / 2 ** v, 3)}° steps`), onInput: (v) => set({ bits: v }) });
    const g3 = group(ctl, "Bandwidth");
    const fSl = slider(g3, { label: "Frequency offset", min: -10, max: 10, step: 0.5, value: 0, format: (v) => `${v > 0 ? "+" : ""}${num(v, 2)} % of f₀`, help: "The steering commands are set for f₀; the signal is at f₀ + offset.", onInput: (v) => set({ df: v / 100 }) });
    const ttdChk = check(g3, { label: "True time delay instead of phase shifters", checked: false, onChange: (v) => set({ ttd: v }) });
    const g4 = group(ctl, "Failures &amp; display");
    const failSl = slider(g4, { label: "Dead elements", min: 0, max: 50, step: 5, value: 0, format: (v) => `${v} %`, onInput: (v) => set({ fail: v }) });
    const reroll = h("div", { class: "btn-row" });
    g4.append(reroll);
    button(reroll, "Pick other dead elements", () => set({ seed: S.seed + 1 }), "ghost small");
    const elChk = check(g4, { label: "Include element pattern (cos<sup>1.5</sup> θ)", checked: S.elem, onChange: (v) => set({ elem: v }) });
    const axCh = choice(g4, { label: "Pattern axis", value: S.axis, options: [["theta", "Angle θ"], ["u", "sin θ (extended)"]], onChange: (v) => set({ axis: v }) });

    const outCard = card(lab.side, "What the array is doing");
    const st = status(outCard);
    const ro = readout(outCard);

    const ch = api.challenges(root, [
      { id: "steer45", text: "Steer the beam to 45° (either side).", check: () => Math.abs(Math.abs(S.theta0) - 45) <= 1 && Math.abs(Math.abs(M.peak) - 45) <= 1.5 },
      { id: "grating", text: "Create a grating lobe: a second full-strength beam in real space.", check: () => M.gl.length > 0 && S.N >= 4 },
      { id: "nogl60", text: "Steer to 60° with at least 8 elements and <b>no</b> grating lobe. What spacing do you need?", check: () => Math.abs(S.theta0) >= 59.5 && M.gl.length === 0 && S.N >= 8 && S.d >= 0.3 },
      { id: "sll30", text: "Get every sidelobe below −30 dB with at least 8 elements.", check: () => S.N >= 8 && M.psl <= -30 && M.gl.length === 0 },
      { id: "squint", text: "With phase shifters, see the beam squint by over 1° at ±5 % frequency offset (θ<sub>0</sub> ≥ 30°), then fix it with true time delay.", check: () => S.sawSquint && S.ttd && Math.abs(S.df) >= 0.05 && Math.abs(S.theta0) >= 30 && Math.abs(M.squint) < 0.25 },
      { id: "fail", text: "Kill 10 % or more of a 16+ element array and keep the main beam within 1.5 dB of the intact array.", check: () => S.fail >= 10 && S.N >= 16 && M.dead >= 1 && M.peakDb > -1.5 },
    ]);

    // ---- model
    function set(p) {
      Object.assign(S, p);
      nSl.value = S.N; dSl.value = S.d; tpCh.value = S.taper; thSl.value = S.theta0; bSl.value = S.bits;
      fSl.value = S.df * 100; ttdChk.checked = S.ttd; failSl.value = S.fail; elChk.checked = S.elem; axCh.value = S.axis;
      changed();
    }

    function compute() {
      const N = S.N, ks = 1 + S.df;
      xs = Float64Array.from({ length: N }, (_, n) => (n - (N - 1) / 2) * S.d);
      wT = taper(N, S.taper);
      sumFull = wT.reduce((a, b) => a + b, 0);
      // seeded order of failure, so raising the percentage adds to the dead set
      const R = rng(S.seed * 977 + N);
      const order = Array.from({ length: N }, (_, i) => i);
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const kill = Math.round((S.fail / 100) * N);
      const dead = new Set(order.slice(0, kill));
      w = Float64Array.from(wT, (v, n) => (dead.has(n) ? 0 : v));
      const s0 = Math.sin(rad(S.theta0));
      ideal = Float64Array.from(xs, (x) => -TAU * x * s0);
      const step = S.bits >= BITS_INF ? 0 : TAU / 2 ** S.bits;
      const q = Float64Array.from(ideal, (p) => (step ? Math.round(p / step) * step : p));
      applied = S.ttd ? Float64Array.from(q, (p) => p * ks) : q;   // TTD: delay × actual frequency
      arrayFactor(UT, xs, w, applied, ks, A);
      arrayFactor(UU, xs, w, applied, ks, AU);
      if (S.df) arrayFactor(UT, xs, w, q, 1, Aref);
      for (let i = 0; i < NT; i++) { A[i] /= sumFull; Aref[i] /= sumFull; }
      for (let i = 0; i < NU; i++) AU[i] /= sumFull;
      M = analyse(ks, s0, kill, q);
      fieldDirty = true;
    }

    function idxOfU(u) { return clamp(Math.round(((deg(Math.asin(clamp(u, -1, 1))) + 90) / 180) * (NT - 1)), 0, NT - 1); }
    function climb(i) {
      for (;;) {
        if (i > 0 && A[i - 1] > A[i]) i--;
        else if (i < NT - 1 && A[i + 1] > A[i]) i++;
        else return i;
      }
    }
    function analyse(ks, s0, dead, q) {
      const uMain = S.ttd ? s0 : s0 / ks;
      let ip;
      if (Math.abs(uMain) <= 1) ip = climb(idxOfU(uMain));
      else { ip = 0; for (let i = 1; i < NT; i++) if (A[i] > A[ip]) ip = i; }
      const pk = A[ip];
      let iL = ip, iR = ip;
      while (iL > 0 && A[iL - 1] <= A[iL]) iL--;
      while (iR < NT - 1 && A[iR + 1] <= A[iR]) iR++;
      const lev = pk / Math.SQRT2;
      const cross = (dir) => {
        let i = ip;
        while (i + dir >= 0 && i + dir < NT && A[i + dir] >= lev) i += dir;
        if (i + dir < 0 || i + dir >= NT) return NaN;
        const a = A[i], b = A[i + dir];
        return TH[i] + ((a - lev) / (a - b)) * (TH[i + dir] - TH[i]);
      };
      const tL = cross(-1), tR = cross(1);
      // grating lobes: copies of the main beam every λ/d in u
      const period = 1 / (S.d * ks);
      const gl = [], gu = [];
      for (let m = -8; m <= 8; m++) {
        if (!m) continue;
        const um = uMain + m * period;
        gu.push(um);
        if (Math.abs(um) <= 1) { const i = climb(idxOfU(um)); if (Math.abs(UT[i] - um) < period / 2) gl.push({ th: TH[i], v: A[i] }); }
      }
      // peak sidelobe, excluding the main lobe and grating lobes
      const du = Math.max(Math.abs(UT[ip] - UT[iL]), Math.abs(UT[iR] - UT[ip]));
      let sl = 0, slTh = NaN;
      for (let i = 1; i < NT - 1; i++) {
        if (i >= iL && i <= iR) continue;
        if (!(A[i] >= A[i - 1] && A[i] >= A[i + 1])) continue;
        if (gu.some((um) => Math.abs(UT[i] - um) < du)) continue;
        if (A[i] > sl) { sl = A[i]; slTh = TH[i]; }
      }
      const tl = (sumFull * sumFull) / (S.N * wT.reduce((a, b) => a + b * b, 0));
      let rmsErr = 0;
      for (let n = 0; n < S.N; n++) rmsErr += (q[n] - ideal[n]) ** 2;
      return {
        ip, peak: TH[ip], peakDb: db20(pk), bw: tR - tL, tL, tR, gl, period, uMain,
        psl: sl ? db20(sl / pk) : -Infinity, slTh, squint: TH[ip] - S.theta0, dead,
        taperLoss: 10 * Math.log10(tl), scanLoss: S.elem ? 10 * EL_EXP * Math.log10(Math.max(1e-6, CT[ip])) : 0,
        rmsErr: deg(Math.sqrt(rmsErr / S.N)),
      };
    }

    function changed() {
      compute();
      const s0 = Math.abs(Math.sin(rad(S.theta0)));
      const dmax = 1 / (1 + s0);
      const bwF = deg(0.886 / (S.N * S.d * Math.cos(rad(S.theta0))));
      if (!S.ttd && Math.abs(S.df) >= 0.05 && Math.abs(S.theta0) >= 30 && Math.abs(M.squint) >= 1) S.sawSquint = true;
      if (M.gl.length) st.set("bad", `${M.gl.length === 1 ? "A grating lobe is" : `${M.gl.length} grating lobes are`} in real space`, `<br>Spacing ${S.d.toFixed(2)} λ is above λ / (1 + |sin θ<sub>0</sub>|) = ${dmax.toFixed(3)} λ for this steer angle. Energy is going out in ${M.gl.map((g) => `${num(g.th, 3)}°`).join(" and ")} as well.`);
      else if (Math.abs(M.squint) >= 0.5 && S.df) st.set("warn", `Beam squint: ${num(M.squint, 2)}°`, `<br>Phase shifters steer correctly only at f₀. ${S.ttd ? "" : "Tick true time delay to fix it."}`);
      else if (S.bits < BITS_INF && S.bits <= 3) st.set("warn", "Coarse phase steps", `<br>${num(360 / 2 ** S.bits, 3)}° steps leave an RMS phase error of ${num(M.rmsErr, 2)}°. The periodic error makes quantisation lobes near −${6 * S.bits} dB.`);
      else if (M.dead) st.set("info", `${M.dead} of ${S.N} elements dead`, `<br>Main beam ${num(M.peakDb, 2)} dB compared with the intact array; the sidelobes rise more than the peak falls.`);
      else st.set("ok", "Clean beam", `<br>No grating lobes for any steer angle up to ±${num(deg(Math.asin(clamp(1 / S.d - 1, -1, 1))), 3)}° at this spacing.`);
      ro.set([
        ["Beam points to", `${num(M.peak, 3)}°`],
        ["Beamwidth (−3 dB)", isFinite(M.bw) ? `${num(M.bw, 3)}°` : "wider than view"],
        ["0.886 λ ⁄ (N d cos θ<sub>0</sub>)", `${num(bwF, 3)}° (uniform)`],
        ["Phase step per element", `${num(-360 * S.d * Math.sin(rad(S.theta0)), 3)}°`],
        ["Max spacing, no grating lobe", `${dmax.toFixed(3)} λ`, S.d > dmax ? "bad" : "ok"],
        ["Peak sidelobe", isFinite(M.psl) ? `${num(M.psl, 3)} dB` : "none", M.psl <= -30 ? "ok" : M.psl > -13.5 ? "warn" : null],
        ["Taper loss", `${num(M.taperLoss, 2)} dB`],
        ["Scan loss (element)", `${num(M.scanLoss, 2)} dB`, M.scanLoss < -3 ? "warn" : null],
        ["Peak vs intact array", `${num(M.peakDb, 2)} dB`],
        ["Squint", `${num(M.squint, 2)}°`, Math.abs(M.squint) >= 0.5 ? "warn" : null],
      ]);
      fieldCap.textContent = `Showing ${num(viewLam(), 3)} λ across; the array is ${num((S.N - 1) * S.d, 3)} λ long. Brightness is compensated for spreading so the beam stays visible with distance (this is still the near field: the far field starts around 2L²/λ = ${num(2 * ((S.N - 1) * S.d) ** 2, 3)} λ).`;
      ch.update(S);
      field.redraw(); pat.redraw(); pol.redraw(); phv.redraw();
    }

    // ---- wave field
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d");
    let F = { re: null, im: null, gx: 0, gy: 0, key: "" }, img = null;
    const viewLam = () => clamp((S.N - 1) * S.d * 1.2 + 6, 12, 70);

    function computeField(w0, hh) {
      const Wl = viewLam(), baseY = hh - 26;
      const pxl = w0 / Wl, Hl = baseY / pxl;
      const N = S.N, alive = w.filter((v) => v > 0).length || 1;
      const budget = 650e3 / alive;
      let gx = Math.round(Math.min(w0 / 2.4, 240, Math.sqrt(budget * (Wl / Hl))));
      gx = Math.max(60, gx);
      const cell = Wl / gx, gy = Math.max(20, Math.round(Hl / cell));
      const re = new Float32Array(gx * gy), im = new Float32Array(gx * gy);
      const ks = 1 + S.df, k = TAU * ks;
      let ss = 0;
      for (let j = 0; j < gy; j++) {
        const y = Hl - (j + 0.5) * cell;
        for (let i = 0; i < gx; i++) {
          const x = -Wl / 2 + (i + 0.5) * cell;
          let sr = 0, si2 = 0;
          for (let n = 0; n < N; n++) {
            const a = w[n];
            if (!a) continue;
            const dx = x - xs[n], r = Math.sqrt(dx * dx + y * y) || 1e-6;
            let amp = a / Math.sqrt(Math.max(r, 0.3));
            if (S.elem) { const c = y / r; amp *= Math.sqrt(c) * Math.sqrt(Math.sqrt(c)); }
            const p = applied[n] - k * r;
            sr += amp * Math.cos(p); si2 += amp * Math.sin(p);
          }
          const comp = Math.sqrt(Math.max(1, Math.hypot(x, y)));
          sr *= comp; si2 *= comp;
          re[j * gx + i] = sr; im[j * gx + i] = si2;
          ss += sr * sr + si2 * si2;
        }
      }
      const sc = 1 / (1.5 * Math.sqrt(ss / (gx * gy)) + 1e-12);
      for (let i = 0; i < re.length; i++) { re[i] *= sc; im[i] *= sc; }
      off.width = gx; off.height = gy;
      img = offCtx.createImageData(gx, gy);
      F = { re, im, gx, gy, Wl, Hl, pxl, baseY };
    }

    function drawField(ctx, w0, hh) {
      const T = theme();
      if (fieldDirty || F.w0 !== w0 || F.hh !== hh) { computeField(w0, hh); F.w0 = w0; F.hh = hh; fieldDirty = false; }
      const { re, im, gx, gy, pxl, baseY } = F;
      const c = Math.cos(phaseT), s = Math.sin(phaseT);
      const [br, bg, bb] = hexRgb(T.surface2), [pr, pg, pb] = hexRgb(T.tx), [nr, ng, nb] = hexRgb(T.rx);
      const d = img.data;
      for (let i = 0, o = 0; i < gx * gy; i++, o += 4) {
        let v = re[i] * c - im[i] * s;
        v = v > 1 ? 1 : v < -1 ? -1 : v;
        const t = Math.sqrt(Math.abs(v));
        if (v >= 0) { d[o] = br + (pr - br) * t; d[o + 1] = bg + (pg - bg) * t; d[o + 2] = bb + (pb - bb) * t; }
        else { d[o] = br + (nr - br) * t; d[o + 1] = bg + (ng - bg) * t; d[o + 2] = bb + (nb - bb) * t; }
        d[o + 3] = 255;
      }
      offCtx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, w0, baseY);
      ctx.fillStyle = T.surface; ctx.fillRect(0, baseY, w0, hh - baseY);
      const cx = w0 / 2;
      // direction lines
      const ray = (thDeg, color, dash, text) => {
        const a = rad(thDeg), L = Math.hypot(w0, hh);
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash);
        ctx.beginPath(); ctx.moveTo(cx, baseY); ctx.lineTo(cx + L * Math.sin(a), baseY - L * Math.cos(a)); ctx.stroke(); ctx.restore();
        const t = Math.min((baseY - 60) / Math.max(0.2, Math.cos(a)), (w0 / 2 - 90) / Math.max(0.05, Math.abs(Math.sin(a))));
        label(ctx, text, cx + t * Math.sin(a), baseY - t * Math.cos(a), { align: "center", color, bounds: w0 });
      };
      M.gl.forEach((g) => ray(g.th, T.warn, [3, 4], `grating ${num(g.th, 3)}°`));
      ray(M.peak, T.ink, [7, 5], `beam ${num(M.peak, 3)}°`);
      // array baseline and elements
      ctx.strokeStyle = T.axis; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + (xs[0] - S.d / 2) * pxl, baseY + 1); ctx.lineTo(cx + (xs[S.N - 1] + S.d / 2) * pxl, baseY + 1); ctx.stroke();
      const re2 = clamp(pxl * S.d * 0.42, 0, 9);
      for (let n = 0; n < S.N; n++) {
        const x = cx + xs[n] * pxl, y = baseY + 12;
        if (x < -10 || x > w0 + 10) continue;
        if (!w[n]) {
          ctx.strokeStyle = T.bad; ctx.lineWidth = 2; const k = Math.max(3, re2 * 0.7);
          ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke();
          continue;
        }
        if (re2 >= 5) {
          ctx.fillStyle = alpha(T.accent, 0.15 + 0.6 * w[n]); ctx.strokeStyle = T.muted; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, re2, 0, TAU); ctx.fill(); ctx.stroke();
          const a = applied[n];
          ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + re2 * Math.sin(a), y - re2 * Math.cos(a)); ctx.stroke();
        } else {
          ctx.fillStyle = alpha(T.ink, 0.35 + 0.65 * w[n]);
          ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
        }
      }
      // scale bar: one wavelength
      ctx.fillStyle = T.ink; ctx.fillRect(8, baseY - 12, pxl, 3);
      label(ctx, "λ", 8 + pxl + 2, baseY - 11, { color: T.ink });
    }

    // ---- pattern (rectangular)
    function patDb(i) { return db20(A[i]) + (S.elem ? 10 * EL_EXP * Math.log10(Math.max(1e-9, CT[i])) : 0); }
    function drawPattern(ctx, w0, hh) {
      const T = theme();
      const uMode = S.axis === "u";
      const P = axes(ctx, w0, hh, {
        x: uMode ? [-UMAX, UMAX] : [-90, 90], y: [FLOOR, 3], yticks: [-50, -40, -30, -20, -10, 0],
        xticks: uMode ? [-3, -2, -1, 0, 1, 2, 3] : [-90, -60, -30, 0, 30, 60, 90],
        xfmt: (v) => (uMode ? num(v) : `${v}°`), xlabel: uMode ? "u = sin θ" : "angle from broadside θ", ylabel: "dB", pad: { l: 44, b: 34, t: 26 },
      });
      P.clip();
      if (uMode) {
        ctx.fillStyle = alpha(T.muted, 0.16);
        ctx.fillRect(P.l, P.t, P.X(-1) - P.l, P.b - P.t); ctx.fillRect(P.X(1), P.t, P.r - P.X(1), P.b - P.t);
        ctx.strokeStyle = T.muted; ctx.setLineDash([4, 4]);
        for (const u of [-1, 1]) { ctx.beginPath(); ctx.moveTo(P.X(u), P.t); ctx.lineTo(P.X(u), P.b); ctx.stroke(); }
        ctx.setLineDash([]);
        const pts = [];
        for (let i = 0; i < NU; i++) pts.push([P.X(UU[i]), P.Y(Math.max(FLOOR - 2, db20(AU[i])))]);
        ctx.save(); ctx.globalAlpha = 0.45; polylineRaw(ctx, pts, T.accent, 1.5); ctx.restore();
        const vis = [];
        for (let i = 0; i < NT; i++) vis.push([P.X(UT[i]), P.Y(Math.max(FLOOR - 2, patDb(i)))]);
        polylineRaw(ctx, vis, T.accent, 2);
      } else {
        if (S.elem) { const ep = []; for (let i = 0; i < NT; i++) ep.push([P.X(TH[i]), P.Y(Math.max(FLOOR - 2, 10 * EL_EXP * Math.log10(Math.max(1e-9, CT[i]))))]); polylineRaw(ctx, ep, T.c5, 1.5, [2, 3]); }
        if (S.df) {
          const rp = [];
          for (let i = 0; i < NT; i++) rp.push([P.X(TH[i]), P.Y(Math.max(FLOOR - 2, db20(Aref[i]) + (S.elem ? 10 * EL_EXP * Math.log10(Math.max(1e-9, CT[i])) : 0)))]);
          polylineRaw(ctx, rp, T.muted, 1.5, [6, 4]);
        }
        const pts = [];
        for (let i = 0; i < NT; i++) pts.push([P.X(TH[i]), P.Y(Math.max(FLOOR - 2, patDb(i)))]);
        polylineRaw(ctx, pts, T.accent, 2);
        // steering marker
        ctx.strokeStyle = T.tx; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(P.X(S.theta0), P.t); ctx.lineTo(P.X(S.theta0), P.b); ctx.stroke(); ctx.setLineDash([]);
        // −3 dB width
        if (isFinite(M.bw)) {
          const y = P.Y(patDb(M.ip) - 3);
          ctx.strokeStyle = T.ink; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(P.X(M.tL), y); ctx.lineTo(P.X(M.tR), y); ctx.stroke();
        }
      }
      // peak sidelobe line
      if (isFinite(M.psl) && M.psl > FLOOR) {
        const y = P.Y(patDb(M.ip) + M.psl);
        ctx.strokeStyle = alpha(T.ink, 0.5); ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.r, y); ctx.stroke(); ctx.setLineDash([]);
      }
      P.unclip();
      // labels
      const X = (th) => (uMode ? P.X(Math.sin(rad(th))) : P.X(th));
      const taken = [];
      const pill = (text, x, y, color) => {
        let yy = y;
        while (taken.some(([tx, ty]) => Math.abs(tx - x) < 95 && Math.abs(ty - yy) < 19)) yy += 20;
        taken.push([x, yy]);
        label(ctx, text, x, yy, { align: "center", color, bounds: w0 });
      };
      pill(`main ${num(M.peak, 3)}°${isFinite(M.bw) && !uMode ? ` · ${num(M.bw, 2)}° wide` : ""}`, X(M.peak), P.t - 12, T.accent);
      for (const g of M.gl) pill(`grating lobe ${num(g.th, 3)}°`, X(g.th), P.t - 12, T.warn);
      if (isFinite(M.psl) && M.psl > FLOOR) label(ctx, `peak sidelobe ${num(M.psl, 3)} dB`, P.r - 4, P.Y(patDb(M.ip) + M.psl) - 11, { align: "right", color: T.muted });
      if (uMode) {
        label(ctx, "invisible", (P.l + P.X(-1)) / 2, P.b - 14, { align: "center", color: T.muted });
        label(ctx, "visible: real angles", P.X(0), P.b - 14, { align: "center", color: T.ink });
        label(ctx, "invisible", (P.r + P.X(1)) / 2, P.b - 14, { align: "center", color: T.muted });
      }
    }
    function polylineRaw(ctx, pts, color, lw, dash) {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = "round";
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
    }

    // ---- polar
    function polGeom() { const w0 = pol.w, hh = pol.h; const R = Math.max(40, Math.min(w0 / 2 - 34, hh - 46)); return { cx: w0 / 2, cy: hh - 20, R }; }
    function drawPolar(ctx, w0, hh) {
      const T = theme();
      const { cx, cy, R } = polGeom();
      const rOf = (v) => (R * (clamp(v, FLOOR, 0) - FLOOR)) / -FLOOR;
      ctx.strokeStyle = T.grid; ctx.lineWidth = 1; ctx.font = T.font; ctx.fillStyle = T.muted;
      for (const v of [-40, -30, -20, -10, 0]) { ctx.beginPath(); ctx.arc(cx, cy, rOf(v), Math.PI, TAU); ctx.stroke(); }
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let a = -90; a <= 90; a += 30) {
        const r = rad(a);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.sin(r), cy - R * Math.cos(r)); ctx.stroke();
        ctx.fillText(`${a}°`, cx + (R + 15) * Math.sin(r), cy - (R + 12) * Math.cos(r) - (Math.abs(a) === 90 ? 12 : 0));
      }
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (const v of [-40, -20, 0]) ctx.fillText(v ? `${v}` : "0 dB", cx - rOf(v), cy + 4);
      ctx.save(); ctx.fillStyle = alpha(T.accent, 0.18); ctx.strokeStyle = T.accent; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < NT; i += 2) { const r = rOf(patDb(i)), a = rad(TH[i]); const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      for (const g of M.gl) { const a = rad(g.th); label(ctx, "GL", cx + (R * 0.72) * Math.sin(a), cy - (R * 0.72) * Math.cos(a), { align: "center", color: T.warn }); }
      // handle
      const a0 = rad(S.theta0), hx = cx + (R + 2) * Math.sin(a0), hy = cy - (R + 2) * Math.cos(a0);
      ctx.strokeStyle = T.tx; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hx, hy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = T.tx; ctx.strokeStyle = T.surface; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, hy, 9, 0, TAU); ctx.fill(); ctx.stroke();
      label(ctx, `θ₀ ${num(S.theta0, 3)}°`, 6, 14, { color: T.tx });
    }

    // ---- per-element phase and amplitude
    function drawPhases(ctx, w0, hh) {
      const T = theme();
      const N = S.N;
      const P = axes(ctx, w0, hh, { x: [0.5, N + 0.5], y: [0, 360], yticks: [0, 90, 180, 270, 360], yfmt: (v) => `${v}°`,
        xticks: elemTicks(N),
        xlabel: "element", pad: { l: 42, r: 30, b: 32 } });
      const bw = Math.max(1, ((P.r - P.l) / N) * 0.72);
      const quant = S.bits < BITS_INF;
      for (let n = 0; n < N; n++) {
        const x = P.X(n + 1);
        const ph = wrap360(deg(S.ttd ? applied[n] / (1 + S.df) : applied[n]));
        if (!w[n]) {
          ctx.strokeStyle = T.bad; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x - 4, P.b - 10); ctx.lineTo(x + 4, P.b - 2); ctx.moveTo(x + 4, P.b - 10); ctx.lineTo(x - 4, P.b - 2); ctx.stroke();
          continue;
        }
        ctx.fillStyle = alpha(T.accent, 0.35 + 0.55 * wT[n]);
        ctx.fillRect(x - bw / 2, Math.min(P.Y(ph), P.b - 2), bw, Math.max(2, P.b - P.Y(ph)));
        if (quant) { ctx.fillStyle = T.ink; ctx.fillRect(x - bw / 2 - 1, P.Y(wrap360(deg(ideal[n]))) - 1, bw + 2, 2); }
      }
      // amplitude weights on a right-hand 0..1 axis
      const pts = Array.from({ length: N }, (_, n) => [P.X(n + 1), P.Y(wT[n] * 360)]);
      polylineRaw(ctx, pts, T.c4, 1.5);
      ctx.fillStyle = T.c4;
      for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, N > 32 ? 1.8 : 3, 0, TAU); ctx.fill(); }
      ctx.font = T.font; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText("1", P.r + 6, P.Y(360)); ctx.fillText("½", P.r + 6, P.Y(180)); ctx.fillText("0", P.r + 6, P.Y(0));
    }

    // ---- animation
    const anim = api.track(animate((dt) => { phaseT += dt * TAU * 0.7; field.redraw(); }, { target: field.canvas, playing: !reducedMotion }));
    playButton(field, anim);
    void tour;
    changed();

    notes(root, "Background", [
      { title: "The array factor", open: true, html:
        "<p>Put <i>N</i> identical elements on a line at positions <i>x<sub>n</sub></i> = <i>n d</i>, feed element <i>n</i> with amplitude <i>w<sub>n</sub></i> and phase φ<sub>n</sub>. In the far field, the path from element <i>n</i> toward angle θ is shorter by <i>x<sub>n</sub></i> sin θ, so the total field is the element pattern times the <b>array factor</b>:</p>" +
        "<p class=\"eq\">AF(θ) = Σ<sub><i>n</i></sub> <i>w<sub>n</sub></i> e<sup><i>j</i> (<i>k n d</i> sin θ + φ<sub><i>n</i></sub>)</sup>, &nbsp; <i>k</i> = 2π/λ</p>" +
        "<p>Choose a <b>progressive phase</b> φ<sub>n</sub> = <i>n</i>Δφ with Δφ = −<i>k d</i> sin θ<sub>0</sub> and every term has the same phase at θ = θ<sub>0</sub>: the beam points there. For uniform weights the sum is a geometric series:</p>" +
        "<p class=\"eq\">|AF| = <span class=\"frac\"><span>|sin(<i>N</i>ψ/2)|</span><span>|sin(ψ/2)|</span></span>, &nbsp; ψ = <i>k d</i> (sin θ − sin θ<sub>0</sub>)</p>" +
        "<p>Everything on this page is that sum evaluated directly (1441 angles × <i>N</i> elements, recomputed when you move a control), multiplied by an element power pattern of cos<sup>1.5</sup> θ, a common model for a patch or dipole over a ground plane. The wave field is the same sum done point by point with cylindrical waves, so you also see the near field.</p>" },
      { title: "Beamwidth, scan broadening and scan loss", html:
        "<p>A uniform array of length <i>L</i> ≈ <i>N d</i> has a half-power beamwidth of about</p>" +
        "<p class=\"eq\">θ<sub>3</sub> ≈ <span class=\"frac\"><span>0.886 λ</span><span><i>N d</i> cos θ<sub>0</sub></span></span> &nbsp;rad</p>" +
        "<p>Off broadside the array is foreshortened to <i>L</i> cos θ<sub>0</sub>, so the beam widens as 1/cos θ<sub>0</sub>: twice as wide at 60°. Gain falls for the same reason (the projected area shrinks as cos θ<sub>0</sub>) and because each element radiates less toward wide angles. Together that <b>scan loss</b> is usually modelled as cos<sup>1.5</sup> θ<sub>0</sub> to cos<sup>2</sup> θ<sub>0</sub>, about 4.5–6 dB at 60°. That's why a flat array rarely scans beyond ±60°, and why fighters and ships use three or four faces (or tilt the array) to cover all directions.</p>" },
      { title: "Grating lobes", html:
        "<p>Written in <i>u</i> = sin θ, the array factor is periodic with period λ/<i>d</i>. Only |<i>u</i>| ≤ 1 corresponds to real angles: the <b>visible region</b>. Steering slides the whole pattern along <i>u</i>; a copy of the main beam (a grating lobe) at <i>u</i><sub>0</sub> ± λ/<i>d</i> becomes visible unless</p>" +
        "<p class=\"eq\"><span class=\"frac\"><span><i>d</i></span><span>λ</span></span> &lt; <span class=\"frac\"><span>1</span><span>1 + |sin θ<sub>max</sub>|</span></span></p>" +
        "<p>So half a wavelength is safe to ±90°, 0.586 λ to ±45°, 0.536 λ to ±60°, while a full wavelength only works at broadside. Wider spacing means fewer elements (cheaper) for the same aperture, so designers space elements as widely as the scan range allows. A grating lobe is a disaster for a radar: it sends energy, and receives echoes and jamming, in a direction the radar thinks it isn't looking.</p>" },
      { title: "Amplitude tapers", html:
        "<p>Uniform illumination gives the narrowest beam but −13.3 dB first sidelobes. Weighting the edges down trades a wider beam and some gain (<b>taper loss</b>, |Σ<i>w</i>|² ⁄ (<i>N</i> Σ<i>w</i>²)) for lower sidelobes. The tapers here are computed exactly for the element count you choose (values below for 32 elements):</p>" +
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Taper</th><th>Peak sidelobe</th><th>Beamwidth vs uniform</th><th>Taper loss</th></tr>" +
        "<tr><td>Uniform</td><td class=\"num\">−13.3 dB</td><td class=\"num\">1.00</td><td class=\"num\">0 dB</td></tr>" +
        "<tr><td>Taylor, −30 dB, n̄ = 4</td><td class=\"num\">−30 dB</td><td class=\"num\">≈ 1.27</td><td class=\"num\">≈ 0.7 dB</td></tr>" +
        "<tr><td>Dolph–Chebyshev, −40 dB</td><td class=\"num\">−40 dB (all equal)</td><td class=\"num\">≈ 1.39</td><td class=\"num\">≈ 1.1 dB</td></tr>" +
        "<tr><td>Hamming</td><td class=\"num\">−40 to −43 dB</td><td class=\"num\">≈ 1.50</td><td class=\"num\">≈ 1.4 dB</td></tr></table></div>" +
        "<p>Taylor is the radar favourite: near-in sidelobes at the design level, then falling away, with good efficiency. Chebyshev gives the narrowest beam for a given sidelobe level, but its equal far sidelobes and spiky edge weights are awkward for large arrays. On receive, an AESA can apply the taper digitally while transmitting uniformly at full power.</p>" },
      { title: "Phase quantisation, failures and true time delay", html:
        "<p>A <i>B</i>-bit phase shifter has steps of 360°/2<sup><i>B</i></sup>. The rounding error is periodic along the array, so it concentrates into <b>quantisation lobes</b> of roughly 1/2<sup>2<i>B</i></sup> (about −6<i>B</i> dB) instead of spreading out. Real arrays add a random phase offset per element (or use sub-array tricks) to break the periodicity; 5–6 bits is common.</p>" +
        "<p>Random element failures remove a fraction <i>p</i> of the sum: the main beam drops by only about 20 log(1 − <i>p</i>) dB (0.9 dB for 10 %), but the missing elements behave like a random error, raising the average sidelobe level to about <i>p</i>/(<i>N</i>(1−<i>p</i>)). Low-sidelobe arrays are therefore more sensitive than the main beam suggests.</p>" +
        "<p>Phase shifters impose a fixed angle, but the steering phase −<i>k d</i> sin θ<sub>0</sub> grows with frequency. At <i>f</i> = <i>f</i><sub>0</sub>(1 + δ) the beam moves to sin θ = sin θ<sub>0</sub>/(1 + δ): it <b>squints</b> toward broadside by roughly δ tan θ<sub>0</sub> radians. When the squint approaches the beamwidth (instantaneous bandwidth ≈ beamwidth/tan θ<sub>0</sub>, or a pulse shorter than the array's fill time <i>L</i> sin θ<sub>0</sub>/<i>c</i>), designers switch to <b>true time delay</b>: delay lines, often at sub-array level, that are correct at every frequency.</p>" },
      { title: "PESA, AESA, digital beamforming and monopulse", html:
        "<ul><li><b>PESA</b> (passive ESA): one big transmitter (a tube) feeds every element through a passive phase shifter. Simple element electronics, but feed losses and a single point of failure.</li>" +
        "<li><b>AESA</b> (active ESA): every element has its own transmit/receive (T/R) module with a power amplifier, low-noise amplifier, phase shifter and attenuator. Losses sit after the amplifiers, failures degrade gracefully, and the array can form several beams or split its aperture for different jobs.</li>" +
        "<li><b>Digital beamforming</b>: digitise each element (or sub-array) and form the beams in a processor. Many simultaneous receive beams, adaptive nulls toward jammers, and tapers applied in software.</li>" +
        "<li><b>Sub-arrays</b>: groups of elements share a time-delay unit or a receiver, a compromise between cost and flexibility. Their size sets new grating-lobe-like limits for the sub-array pattern.</li>" +
        "<li><b>Monopulse</b> with an array: add the two halves (Σ beam) and subtract them (Δ beam, a null on boresight). The ratio Δ/Σ gives the target's angle within the beam from a single pulse, with no scanning.</li>" +
        "<li><b>2-D arrays</b> steer in azimuth and elevation using <i>u</i> = sin θ cos φ and <i>v</i> = sin θ sin φ; triangular element grids allow about 13 % fewer elements than square grids for the same grating-lobe-free scan cone. The beam has no inertia: it can jump anywhere within the scan limits in microseconds, which is what makes interleaved search and track possible (next lesson).</li></ul>" },
    ]);

    api.quiz(root, [
      { q: "An array must scan to ±45° with no grating lobes. What's the largest element spacing?", options: ["0.5 λ", "0.586 λ", "0.707 λ", "1 λ"], answer: 1, why: "d/λ < 1/(1 + sin 45°) = 1/1.707 = 0.586. Half a wavelength works too, but needs more elements than necessary." },
      { q: "A beam is 2° wide at broadside. Roughly how wide is it steered to 60°?", options: ["1°", "2°", "4°", "8°"], answer: 2, why: "The projected aperture shrinks by cos 60° = 0.5, so the beam broadens by 1/cos θ₀ = 2: about 4°." },
      { q: "What makes an array an AESA rather than a PESA?", options: ["It can steer electronically", "Each element has its own transmit/receive module", "It uses a mechanically rotating face", "It has more elements"], answer: 1, why: "Both steer electronically. In an AESA every element (or small group) has its own power amplifier and receiver, so there's no central transmitter, losses are lower, and failures degrade the beam gracefully." },
      { q: "Why does a phase-shifter array's beam squint when the frequency changes?", options: ["The elements get physically longer", "The phase needed to steer is proportional to frequency, but the phase shifters stay fixed", "The array factor stops being periodic", "Grating lobes steal the power"], answer: 1, why: "Steering needs a delay, which is a phase that grows with frequency. A fixed phase is only right at f₀; true-time-delay units fix this." },
    ]);
  },
};
