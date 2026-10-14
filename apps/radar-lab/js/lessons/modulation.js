// Lesson 6: modulation and pulse compression. A long coded pulse carries energy; a matched filter squeezes it
// back to a narrow peak whose width is set by the bandwidth, not the length. Everything below is computed from
// complex baseband samples: waveforms, correlations, two-target returns and an FMCW beat spectrum.
import {
  h, C0, card, labGrid, group, notes, slider, choice, readout, status, legend,
  canvasView, axes, theme, alpha, label, dimension, polyline,
  num, si, km, fmtDb, clamp, TAU, undb, rng, gauss, fft,
} from "../ui.js";

const BARKER13 = [1, 1, 1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1];
const FRANK_M = 8;                                  // Frank code of length M² = 64
const R64 = rng(5);
const RANDOM64 = Array.from({ length: 64 }, () => (R64() < 0.5 ? 1 : -1));
const FM_FS = 20e6;                                 // FMCW complex IF sample rate
const FM_FC = 77e9;
const FM_IF_MAX = 0.8 * FM_FS;                      // anti-alias filter edge
const FM_TGTS = [{ name: "car", rcs: 10, ph: 0 }, { name: "motorbike", rcs: 3, ph: Math.PI / 2 }, { name: "pedestrian", rcs: 1, ph: 1.1 }];
const PHASE2 = Math.PI / 2;                         // relative carrier phase between the two pulse-radar targets

const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));
const dB20 = (x) => 20 * Math.log10(Math.max(x, 1e-12));

/** |y[l]| with y[l] = Σ x[k+l]·conj(h[k]), l = −(Nh−1) … Lx−1, by FFT. up > 1 interpolates the output. */
function xcorr(xr, xi, hr, hi, up = 1) {
  const Lx = xr.length, Nh = hr.length, M = nextPow2(Lx + Nh);
  const a = new Float64Array(M), ai = new Float64Array(M), b = new Float64Array(M), bi = new Float64Array(M);
  a.set(xr); ai.set(xi); b.set(hr); bi.set(hi);
  fft(a, ai); fft(b, bi);
  const MU = M * up, re = new Float64Array(MU), im = new Float64Array(MU);
  for (let k = 0; k < M; k++) {
    const pr = a[k] * b[k] + ai[k] * bi[k], pi = ai[k] * b[k] - a[k] * bi[k];
    const kk = k < M / 2 ? k : k + MU - M;          // zero-pad in the middle of the spectrum to interpolate
    re[kk] = pr; im[kk] = pi;
  }
  fft(re, im, true);
  const n = (Lx + Nh - 1) * up - (up - 1), out = new Float64Array(n);
  for (let i = 0; i < n; i++) { const q = (i - (Nh - 1) * up + MU) % MU; out[i] = Math.hypot(re[q], im[q]) * up; }
  return out;
}

function taylor(N, nbar = 5, sll = 35) {
  const A = Math.acosh(10 ** (sll / 20)) / Math.PI;
  const s2 = nbar ** 2 / (A * A + (nbar - 0.5) ** 2);
  const F = [];
  for (let m = 1; m < nbar; m++) {
    let nu = 1, de = 1;
    for (let i = 1; i < nbar; i++) {
      nu *= 1 - (m * m) / (s2 * (A * A + (i - 0.5) ** 2));
      if (i !== m) de *= 1 - (m * m) / (i * i);
    }
    F.push(((m % 2 ? 1 : -1) * nu) / (2 * de));
  }
  return Float64Array.from({ length: N }, (_, n) => { const x = (n + 0.5) / N - 0.5; let w = 1; F.forEach((f, k) => { w += 2 * f * Math.cos(TAU * (k + 1) * x); }); return w; });
}

/** Peak, first-null mainlobe, peak sidelobe and −3 dB width of a magnitude array. */
function measure(mag) {
  let pk = 0;
  for (let i = 1; i < mag.length; i++) if (mag[i] > mag[pk]) pk = i;
  let L = pk, R = pk;
  while (L > 0 && mag[L - 1] <= mag[L]) L--;
  while (R < mag.length - 1 && mag[R + 1] <= mag[R]) R++;
  let side = 0;
  for (let i = 0; i < mag.length; i++) if ((i < L || i > R) && mag[i] > side) side = mag[i];
  const half = mag[pk] / Math.SQRT2;
  let a = pk, b = pk;
  while (a > 0 && mag[a] > half) a--;
  while (b < mag.length - 1 && mag[b] > half) b++;
  const fa = a + (half - mag[a]) / (mag[a + 1] - mag[a] || 1), fb = b - (half - mag[b]) / (mag[b - 1] - mag[b] || 1);
  return { pk, peak: mag[pk], psl: side > 0 ? dB20(side / mag[pk]) : -Infinity, w3: fb - fa };
}

/** Are there two separate peaks near i1 < i2 with a dip of at least `dip` dB between them? */
function twoPeaks(mag, i1, i2, dip = 0.5) {
  const half = Math.max(1, Math.floor((i2 - i1) / 2));
  const am = (lo, hi) => { let k = clamp(lo, 0, mag.length - 1); for (let i = Math.max(0, lo); i <= Math.min(mag.length - 1, hi); i++) if (mag[i] > mag[k]) k = i; return k; };
  const k1 = am(i1 - half, i1 + half - 1), k2 = am(i2 - half + 1, i2 + half);
  if (k2 <= k1 + 1) return false;
  let v = Infinity;
  for (let i = k1; i <= k2; i++) v = Math.min(v, mag[i]);
  return dB20(Math.min(mag[k1], mag[k2]) / v) >= dip;
}

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "A radar wants long pulses for energy and short pulses for sharp range. Pulse compression gets both: put a chirp " +
      "or a phase code <i>inside</i> a long pulse, and a matched filter in the receiver collapses each echo into a spike " +
      "as narrow as the bandwidth allows. Car radars take the idea further with FMCW, timing echoes by their beat frequency." }));

    const S = { wf: "lfm", tau: 10e-6, B: 5e6, win: "none", fd: 0, scale: "db", zoom: "main", sep: 300, a2: 0, snr: 20 };
    const F = { B: 300e6, Tc: 40e-6, r: [50, 58, 120], on: [true, true, false], view: "all" };
    let W = null, AC = null, TT = null, FM = null;

    const set = (o, fo) => {
      Object.assign(S, o); if (fo) Object.assign(F, fo);
      wfC.value = S.wf; tauS.value = S.tau * 1e6; bS.value = S.B / 1e6; winC.value = S.win; fdS.value = S.fd / 1e3;
      scaleC.value = S.scale; zoomC.value = S.zoom; sepS.value = S.sep; a2S.value = S.a2; snrS.value = S.snr;
      fbC.value = F.B; tcS.value = F.Tc * 1e6; F.r.forEach((r, i) => { rS[i].value = r; }); onC.value = F.on[1] + 2 * F.on[2]; viewC.value = F.view;
      changed(true); fmChanged(true);
    };
    api.steps(root, [
      { title: "1 · Long pulse: plenty of energy, no detail", html:
        "<p>A plain 10 µs pulse is 1.5 km long in space (<i>c</i>τ/2). Two aircraft 300 m apart return echoes that overlap almost completely, and even after matched filtering they blur into one lump.</p>",
        look: "the two-target view: one wide hump instead of two.",
        apply: () => set({ wf: "pulse", tau: 10e-6, sep: 300, a2: 0, snr: 20, fd: 0, win: "none", scale: "lin", zoom: "full" }) },
      { title: "2 · Short pulse: sharp, but weak", html:
        "<p>Cut the pulse to 0.5 µs and the echoes separate. But the transmitter's peak power is fixed, so the pulse now carries 1/20 of the energy, and detection depends on energy: the SNR after the matched filter is <i>E</i>/<i>N</i><sub>0</sub>, 13 dB worse.</p>",
        look: "two peaks, but the noise is now much closer to them.",
        apply: () => set({ wf: "pulse", tau: 0.5e-6, sep: 300, scale: "lin", zoom: "full" }) },
      { title: "3 · Chirp: long and sharp", html:
        "<p>Go back to 10 µs, but sweep the frequency through 5 MHz during the pulse (a linear FM <b>chirp</b>). The matched filter delays the low frequencies more than the high ones so that everything piles up at one instant. The peak is as narrow as a 0.2 µs pulse:</p>" +
        "<p class=\"eq\">Δ<i>R</i> = <span class=\"frac\"><span><i>c</i></span><span>2<i>B</i></span></span> = 30 m &nbsp;&nbsp; compression ratio = <i>B</i>τ = 50</p>",
        look: "the raw echo is still one long smear, but the compressed output shows two clean spikes.",
        apply: () => set({ wf: "lfm", tau: 10e-6, B: 5e6, sep: 300, scale: "lin", zoom: "main" }) },
      { title: "4 · The catch: range sidelobes", html:
        "<p>Switch to a dB scale. A chirp's compressed peak has <b>sidelobes</b> at −13 dB, like a sinc function, and a big target's sidelobes can hide a small one nearby. Weighting the filter with a window (Hamming, Taylor) pushes them below −35 dB, at the price of a slightly wider peak and about 1 dB of SNR.</p>",
        look: "the peak sidelobe readout as you change the window. Try a weak second target (−30 dB) close by.",
        apply: () => set({ wf: "lfm", win: "none", scale: "db", zoom: "main", sep: 120, a2: -30 }) },
      { title: "5 · Phase codes", html:
        "<p>Instead of sweeping frequency, flip the phase. The 13-chip <b>Barker code</b> (+ + + + + − − + + − + − +) compresses by 13 with every sidelobe exactly 1/13 of the peak: <b>−22.3 dB</b>, the best any binary code can do. Polyphase codes like Frank codes go longer with lower sidelobes.</p>",
        look: "the flat row of sidelobes either side of the Barker peak.",
        apply: () => set({ wf: "barker", win: "none", scale: "db", zoom: "full", a2: 0, sep: 600 }) },
      { title: "6 · Doppler spoils codes, not chirps", html:
        "<p>A moving target shifts the echo's frequency. Across a 10 µs Barker pulse, 60 kHz of Doppler (900 m/s at X band) rotates the last chip by more than 200° relative to the first, and the code no longer matches: the peak drops and sidelobes shoot up. A chirp just slides: its peak moves a little in range (<b>range–Doppler coupling</b>) but stays sharp.</p>",
        look: "switch between Barker 13 and Chirp with the Doppler slider up.",
        apply: () => set({ wf: "barker", fd: 60e3, scale: "db", zoom: "full" }) },
      { title: "7 · FMCW: chirps that never stop", html:
        "<p>Car radars transmit continuously, sweeping 77 GHz upward over and over. An echo from range <i>R</i> arrives 2<i>R</i>/<i>c</i> late, so at any instant it is a little lower in frequency than what is being sent. Mixing the two gives a <b>beat</b> tone proportional to range:</p><p class=\"eq\"><i>f</i><sub>b</sub> = <span class=\"frac\"><span>2 <i>R</i> <i>S</i></span><span><i>c</i></span></span>, &nbsp; <i>S</i> = <span class=\"frac\"><span><i>B</i></span><span><i>T</i><sub>c</sub></span></span></p>",
        look: "the FMCW lab further down: each target is one peak in the FFT of the beat signal.",
        apply: () => set({ wf: "lfm", fd: 0 }, { B: 300e6, Tc: 40e-6, r: [50, 58, 120], on: [true, true, true], view: "all" }) },
    ]);

    // ================================================================ pulse compression lab
    const lab = labGrid(root);
    const wfCard = card(lab.main, "Transmitted pulse", "what goes out");
    const wfv = api.track(canvasView(wfCard, { aspect: 2.6, minHeight: 230, maxHeight: 300, draw: drawWave, label: "The transmitted waveform and its frequency or phase against time" }));
    const wfCap = h("p", { class: "caption" });
    wfCard.append(wfCap);

    const mfCard = card(lab.main, "Matched filter output", "one echo, compressed");
    const mfv = api.track(canvasView(mfCard, { aspect: 2.4, minHeight: 230, maxHeight: 320, draw: drawMF, label: "Autocorrelation of the waveform: the compressed pulse with its mainlobe and sidelobes" }));
    legend(mfCard, [[theme().accent, "compressed echo"], [theme().c4, "−3 dB width"], [theme().bad, "peak sidelobe"]]);

    const ttCard = card(lab.main, "Two targets", "raw echo vs compressed");
    const ttv = api.track(canvasView(ttCard, { aspect: 1.9, minHeight: 300, maxHeight: 400, draw: drawTwo, label: "Received signal from two targets before and after pulse compression" }));
    legend(ttCard, [[theme().rx, "received envelope"], [theme().accent, "after the matched filter"], [theme().tgt, "true target positions"]]);
    const ttSt = status(ttCard);

    const ctl = card(lab.side, "Controls");
    const g1 = group(ctl, "Waveform");
    const wfC = choice(g1, { label: "Modulation inside the pulse", value: S.wf, options: [["pulse", "Plain"], ["lfm", "Chirp"], ["barker", "Barker 13"], ["frank", "Frank 64"], ["random", "Random 64"]], onChange: (v) => { S.wf = v; changed(); } });
    const tauS = slider(g1, { label: "Pulse length τ", min: 0.5, max: 20, step: 0.1, log: true, value: S.tau * 1e6, format: (v) => `${num(v, 3)} µs`, onInput: (v) => { S.tau = v * 1e-6; changed(); } });
    const bS = slider(g1, { label: "Chirp bandwidth <i>B</i>", min: 0.5, max: 50, step: 0.1, log: true, value: S.B / 1e6, format: (v) => `${num(v, 3)} MHz`, onInput: (v) => { S.B = v * 1e6; changed(); } });
    const bInfo = h("div", { class: "help small muted", style: { margin: "2px 0 8px" } });
    g1.append(bInfo);
    const winC = choice(g1, { label: "Receive window (weighting)", value: S.win, options: [["none", "None"], ["hamming", "Hamming"], ["taylor", "Taylor"]], onChange: (v) => { S.win = v; changed(); } });
    const fdS = slider(g1, { label: "Target Doppler shift", min: 0, max: 200, step: 1, value: 0, format: (v) => `${num(v, 3)} kHz · ${num((v * 1e3 * 0.03) / 2, 3)} m/s at X band`, onInput: (v) => { S.fd = v * 1e3; changed(); } });
    const g2 = group(ctl, "Display");
    const scaleC = choice(g2, { label: "Scale", value: S.scale, options: [["db", "dB"], ["lin", "Linear"]], onChange: (v) => { S.scale = v; changed(); } });
    const zoomC = choice(g2, { label: "Matched filter view", value: S.zoom, options: [["main", "Mainlobe"], ["full", "Whole output"]], onChange: (v) => { S.zoom = v; changed(); } });
    const g3 = group(ctl, "Two targets");
    const sepS = slider(g3, { label: "Separation in range", min: 3, max: 3000, step: 0.5, log: true, value: S.sep, format: (v) => km(v, 3), onInput: (v) => { S.sep = v; changed(); } });
    const a2S = slider(g3, { label: "Second target's echo", min: -40, max: 0, step: 1, value: S.a2, format: (v) => fmtDb(v, "dB", 0), onInput: (v) => { S.a2 = v; changed(); } });
    const snrS = slider(g3, { label: "Echo power (SNR in 1 MHz)", min: -20, max: 30, step: 1, value: S.snr, format: (v) => fmtDb(v, "dB", 0),
      help: "Fixed peak power: a longer pulse carries more energy.", onInput: (v) => { S.snr = v; changed(); } });
    const roCard = card(lab.side, "Measurements");
    const ro = readout(roCard);

    // ================================================================ FMCW lab
    const fmHead = h("section", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "FMCW: a 77 GHz car radar"), h("span", { class: "sub" }, "continuous chirps, range from the beat")));
    root.append(fmHead);
    fmHead.append(h("p", { class: "small muted", style: { margin: 0 }, html: "The radar sweeps <i>B</i> in <i>T</i><sub>c</sub>, mixes each echo with what it is sending right now, and takes an FFT of the beat over one chirp. The IF is sampled at 20 MHz (complex) with an anti-alias filter at 16 MHz." }));
    fmHead.style.marginBottom = "16px";
    const lab2 = labGrid(root);
    const chCard = card(lab2.main, "Frequency against time", "delays exaggerated");
    const chv = api.track(canvasView(chCard, { aspect: 2.2, minHeight: 280, maxHeight: 360, draw: drawChirps, label: "Sawtooth chirps sent and received, and the beat signal between them" }));
    legend(chCard, [[theme().tx, "transmitted"], [theme().rx, "echoes"], [theme().c4, "beat signal"]]);
    const fspCard = card(lab2.main, "Range spectrum", "FFT of the beat over one chirp, Hann window");
    const fsv = api.track(canvasView(fspCard, { aspect: 2.5, minHeight: 230, maxHeight: 320, draw: drawFmSpec, label: "Range profile from the FFT of the FMCW beat signal" }));
    const fmSt = status(fspCard);

    const fctl = card(lab2.side, "FMCW controls");
    const f1 = group(fctl, "Chirp");
    const fbC = choice(f1, { label: "Sweep bandwidth <i>B</i>", value: F.B, options: [[150e6, "150 MHz"], [300e6, "300 MHz"], [1e9, "1 GHz"], [4e9, "4 GHz"]], onChange: (v) => { F.B = v; fmChanged(); } });
    const tcS = slider(f1, { label: "Chirp time <i>T</i><sub>c</sub>", min: 10, max: 100, step: 1, value: F.Tc * 1e6, format: (v) => `${num(v, 3)} µs`, onInput: (v) => { F.Tc = v * 1e-6; fmChanged(); } });
    const f2 = group(fctl, "Targets");
    const rS = FM_TGTS.map((t, i) => slider(f2, { label: `${i + 1}: ${t.name} (${t.rcs} m²)`, min: 1, max: 200, step: 0.1, value: F.r[i], format: (v) => `${num(v, 4)} m`, onInput: (v) => { F.r[i] = v; fmChanged(); } }));
    const onC = choice(f2, { label: "Targets present", value: 1, options: [[0, "1"], [1, "1 + 2"], [3, "1 + 2 + 3"]], onChange: (v) => { F.on = [true, !!(v & 1), !!(v & 2)]; fmChanged(); } });
    const viewC = choice(f2, { label: "Range axis", value: F.view, options: [["all", "Whole"], ["zoom", "Zoom on targets"]], onChange: (v) => { F.view = v; fmChanged(); } });
    const fro = readout(card(lab2.side, "FMCW numbers"));

    const ch = api.challenges(root, [
      { id: "res15", text: "With a 10 µs pulse, resolve two equal targets only 15 m apart.", check: () => S.tau >= 9.95e-6 && S.sep <= 15.5 && S.a2 >= -1 && TT.resolved },
      { id: "psl30", text: "Get the peak sidelobe below −30 dB (no Doppler). What does it cost?", check: () => S.fd === 0 && AC.m.psl < -30 },
      { id: "barker", text: "Measure Barker 13's sidelobes on the dB scale: all −22.3 dB.", check: () => S.wf === "barker" && S.scale === "db" && S.fd === 0 },
      { id: "doppler", text: "Use Doppler to ruin Barker 13: push its peak sidelobe above −10 dB.", check: () => S.wf === "barker" && AC.m.psl > -10 },
      { id: "fm50", text: "FMCW: make a target at 50 m produce a 2 MHz beat.", check: () => F.on[0] && Math.abs(F.r[0] - 50) <= 0.5 && Math.abs(FM.fb[0] - 2e6) <= 0.06e6 },
      { id: "fmres", text: "FMCW: separate two targets less than 0.5 m apart.", check: () => FM.resolved },
    ]);

    // ---------------------------------------------------------------- waveform model
    function build() {
      const tau = S.tau;
      let Bw, fs, code = null;
      if (S.wf === "pulse") { Bw = 1 / tau; fs = 64 / tau; }
      else if (S.wf === "lfm") { Bw = S.B; fs = Math.max(3 * S.B, 64 / tau); }
      else {
        code = S.wf === "barker" ? BARKER13.map((c) => (c > 0 ? 0 : Math.PI))
          : S.wf === "random" ? RANDOM64.map((c) => (c > 0 ? 0 : Math.PI))
          : Array.from({ length: FRANK_M * FRANK_M }, (_, k) => (TAU * Math.floor(k / FRANK_M) * (k % FRANK_M)) / FRANK_M);
        Bw = code.length / tau;
        fs = (code.length === 13 ? 8 : 4) * Bw;
      }
      const Ns = Math.round(tau * fs);
      fs = Ns / tau;
      const re = new Float64Array(Ns), im = new Float64Array(Ns);
      for (let k = 0; k < Ns; k++) {
        const t = (k + 0.5) / fs - tau / 2;
        const p = S.wf === "lfm" ? Math.PI * (S.B / tau) * t * t : code ? code[Math.min(code.length - 1, Math.floor(((k + 0.5) / Ns) * code.length))] : 0;
        re[k] = Math.cos(p); im[k] = Math.sin(p);
      }
      const w = S.win === "hamming" ? Float64Array.from({ length: Ns }, (_, n) => 0.54 - 0.46 * Math.cos((TAU * n) / (Ns - 1)))
        : S.win === "taylor" ? taylor(Ns) : new Float64Array(Ns).fill(1);
      const hr = Float64Array.from(re, (x, k) => x * w[k]), hi = Float64Array.from(im, (x, k) => x * w[k]);
      let e = 0, ew = 0;
      for (let k = 0; k < Ns; k++) { e += re[k] ** 2 + im[k] ** 2; ew += hr[k] ** 2 + hi[k] ** 2; }
      W = { Bw, fs, Ns, re, im, hr, hi, code, norm: Math.sqrt(e * ew), e };
    }
    const doppler = (re, im, t0 = 0) => {
      if (!S.fd) return [re, im];
      const r2 = new Float64Array(re.length), i2 = new Float64Array(re.length);
      for (let k = 0; k < re.length; k++) { const p = TAU * S.fd * ((k + t0) / W.fs); const c = Math.cos(p), s = Math.sin(p); r2[k] = re[k] * c - im[k] * s; i2[k] = re[k] * s + im[k] * c; }
      return [r2, i2];
    };

    function autocorr() {
      const up = W.Ns < 4000 ? 4 : 2;
      const [xr, xi] = doppler(W.re, W.im);
      const mag = xcorr(xr, xi, W.hr, W.hi, up).map((v) => v / W.norm);
      const m = measure(mag);
      AC = { mag, up, m, lag0: (W.Ns - 1) * up, dt: 1 / (W.fs * up) };
    }

    function twoTargets() {
      const { Ns, fs, re, im } = W;
      const margin = Math.round(Ns * 0.25) + 8;
      const dS = Math.round(((2 * S.sep) / C0) * fs);
      const d1 = margin, d2 = margin + dS, L = d2 + Ns + margin;
      const a2 = 10 ** (S.a2 / 20);
      const sr = new Float64Array(L), si_ = new Float64Array(L);
      const [xr, xi] = doppler(re, im);
      const c2 = Math.cos(PHASE2), s2 = Math.sin(PHASE2);
      for (let k = 0; k < Ns; k++) {
        sr[d1 + k] += xr[k]; si_[d1 + k] += xi[k];
        sr[d2 + k] += a2 * (xr[k] * c2 - xi[k] * s2); si_[d2 + k] += a2 * (xr[k] * s2 + xi[k] * c2);
      }
      // noise limited to the signal bandwidth (boxcar), scaled so the SNR in that bandwidth is right
      const snrB = undb(S.snr) * (1e6 / W.Bw);
      const R = rng(3);
      const nb = Math.max(1, Math.round(fs / W.Bw));
      const wr = Float64Array.from({ length: L + nb }, () => gauss(R)), wi = Float64Array.from({ length: L + nb }, () => gauss(R));
      const sc = Math.sqrt(1 / snrB / 2) / Math.sqrt(1 / nb);
      const nr = new Float64Array(L), ni = new Float64Array(L);
      let accR = 0, accI = 0;
      for (let k = 0; k < L + nb; k++) {
        accR += wr[k]; accI += wi[k];
        if (k >= nb) { accR -= wr[k - nb]; accI -= wi[k - nb]; }
        if (k >= nb) { nr[k - nb] = (accR / nb) * sc; ni[k - nb] = (accI / nb) * sc; }
      }
      const rr = Float64Array.from(sr, (v, k) => v + nr[k]), ri = Float64Array.from(si_, (v, k) => v + ni[k]);
      const clean = xcorr(sr, si_, W.hr, W.hi).map((v) => v / W.norm);
      const noisy = xcorr(rr, ri, W.hr, W.hi).map((v) => v / W.norm);
      // lag index i ↔ start sample i − (Ns−1)
      const o = Ns - 1;
      const resolved = twoPeaks(clean, d1 + o, d2 + o, 0.5) && (S.a2 > -60);
      TT = { L, d1, d2, raw: Float64Array.from(rr, (v, k) => Math.hypot(v, ri[k])), clean, noisy, o, resolved, snrIn: 10 * Math.log10(snrB), snrOut: S.snr + 10 * Math.log10(S.tau * 1e6) };
    }

    function changed(fromTour = false) {
      build(); autocorr(); twoTargets();
      bS.el.hidden = S.wf !== "lfm";
      bInfo.innerHTML = S.wf === "lfm" ? `Sweep rate ${num(S.B / S.tau / 1e12, 3)} MHz/µs` : S.wf === "pulse" ? `Bandwidth ≈ 1/τ = ${si(W.Bw, "Hz", 3)}` : `${W.code.length} chips of ${si(S.tau / W.code.length, "s", 3)}: bandwidth ≈ 1/chip = ${si(W.Bw, "Hz", 3)}`;
      const Bt = W.Bw * S.tau, m = AC.m;
      const shift = ((m.pk - AC.lag0) * AC.dt * C0) / 2;
      ro.set([
        ["Bandwidth <i>B</i>", si(W.Bw, "Hz", 3)],
        ["Uncompressed resolution <i>c</i>τ/2", km((C0 * S.tau) / 2, 3)],
        ["Compressed resolution <i>c</i>/2<i>B</i>", km(C0 / (2 * W.Bw), 3), "ok"],
        ["Compression ratio <i>B</i>τ", `${num(Bt, 3)} (${fmtDb(10 * Math.log10(Bt))})`],
        ["Measured −3 dB width", km((m.w3 * AC.dt * C0) / 2, 3)],
        ["Peak sidelobe", isFinite(m.psl) ? fmtDb(m.psl) : "none (triangle)", m.psl < -30 ? "ok" : m.psl > -15 ? "warn" : null],
        ["Peak (window + Doppler loss)", fmtDb(Math.min(0, Math.round(dB20(m.peak) * 10) / 10 || 0)), m.peak < 0.7 ? "bad" : m.peak < 0.95 ? "warn" : null],
        ["Peak shift from Doppler", km(shift, 3), Math.abs(shift) > C0 / (2 * W.Bw) ? "warn" : null],
        ["SNR before compression", fmtDb(TT.snrIn)],
        ["SNR after (= <i>E</i>/<i>N</i><sub>0</sub>)", fmtDb(TT.snrOut), TT.snrOut >= 13 ? "ok" : "bad"],
      ]);
      wfCap.innerHTML = S.wf === "lfm" ? `Upper trace: the RF pulse${Bt > 60 ? ` (drawn with 60 cycles of sweep; the real one has ${num(Bt, 3)})` : ""}. Lower: instantaneous frequency, rising ${si(S.B, "Hz", 3)} in ${si(S.tau, "s", 3)}.`
        : S.wf === "pulse" ? "Upper trace: the RF pulse (carrier drawn far slower than life). Lower: phase, constant: no modulation, so bandwidth ≈ 1/τ."
        : `Upper trace: the RF pulse with its phase flips (carrier drawn slowly). Lower: the phase of each of the ${W.code.length} chips.`;
      const sepRes = C0 / (2 * W.Bw);
      if (TT.resolved) ttSt.set("ok", "Resolved: two separate peaks.", `<br>${km(S.sep, 3)} apart; the compressed peak is about ${km(sepRes, 3)} wide while the raw echo is ${km((C0 * S.tau) / 2, 3)} long.`);
      else if (S.sep < sepRes * 1.6) ttSt.set("bad", "Not resolved: the peaks merge.", `<br>They're ${km(S.sep, 3)} apart but this waveform's resolution is about ${km(sepRes, 3)}. You need more bandwidth.`);
      else ttSt.set("warn", "Not resolved.", "<br>The second echo is hidden, probably under the first one's sidelobes. Try a window, or a stronger second target.");
      if (!fromTour) ch.update();
      wfv.redraw(); mfv.redraw(); ttv.redraw();
    }

    // ---------------------------------------------------------------- FMCW model
    function fmChanged(fromTour = false) {
      const Sl = F.B / F.Tc, Ns = Math.round(FM_FS * F.Tc), NF = Math.min(16384, nextPow2(Ns) * 4);
      const rmax = (FM_IF_MAX * C0) / (2 * Sl), dR = C0 / (2 * F.B);
      const R = rng(9);
      const tg = FM_TGTS.map((t, i) => {
        const fb = (2 * F.r[i] * Sl) / C0;
        const a = F.on[i] && fb < FM_IF_MAX ? Math.sqrt(undb(10) * (t.rcs / 10)) * (50 / F.r[i]) ** 2 : 0;
        return { ...t, R: F.r[i], fb, a, on: F.on[i], cut: F.on[i] && fb >= FM_IF_MAX };
      });
      const spec = (noise) => {
        const re = new Float64Array(NF), im = new Float64Array(NF);
        for (let n = 0; n < Ns; n++) {
          const w = 0.5 - 0.5 * Math.cos((TAU * (n + 0.5)) / Ns);
          let x = 0, y = 0;
          for (const t of tg) if (t.a) { const p = (TAU * t.fb * n) / FM_FS + t.ph; x += t.a * Math.cos(p); y += t.a * Math.sin(p); }
          if (noise) { x += gauss(R) * Math.SQRT1_2; y += gauss(R) * Math.SQRT1_2; }
          re[n] = x * w; im[n] = y * w;
        }
        fft(re, im);
        const norm = Ns * 0.375; // Σw² of a Hann window ≈ 3N/8, so noise sits at 0 dB
        return Float64Array.from({ length: NF }, (_, k) => (re[k] ** 2 + im[k] ** 2) / norm);
      };
      const noisy = spec(true), clean = spec(false);
      const on = tg.filter((t) => t.a);
      let resolved = false;
      for (let i = 0; i < on.length; i++) for (let j = 0; j < on.length; j++) {
        const d = on[j].R - on[i].R;
        if (d > 0 && d < 0.5) {
          const k1 = Math.round((on[i].fb / FM_FS) * NF), k2 = Math.round((on[j].fb / FM_FS) * NF);
          if (twoPeaks(clean.map(Math.sqrt), k1, k2, 0.5)) resolved = true;
        }
      }
      FM = { Sl, Ns, NF, rmax, dR, tg, noisy, resolved, fb: tg.map((t) => t.fb) };
      fro.set([
        ["Chirp slope <i>S</i> = <i>B</i>/<i>T</i><sub>c</sub>", `${num(Sl / 1e12, 3)} MHz/µs`],
        ["Range resolution <i>c</i>/2<i>B</i>", km(dR, 3), "ok"],
        ["Max range (16 MHz IF)", km(rmax, 3)],
        ["Samples per chirp", num(Ns, 4)],
        ...tg.filter((t) => t.on).map((t, i) => [`Beat ${i + 1}: 2<i>RS</i>/<i>c</i>`, t.cut ? `${si(t.fb, "Hz", 3)}: filtered out` : si(t.fb, "Hz", 4), t.cut ? "bad" : null]),
        ["Round trip at 50 m", si((2 * 50) / C0, "s", 3)],
      ]);
      const cut = tg.find((t) => t.cut);
      const close = on.some((a) => on.some((b) => b.R > a.R && b.R - a.R < 1.5 * dR));
      if (cut) fmSt.set("bad", `Target ${tg.indexOf(cut) + 1} is beyond the maximum range.`, `<br>Its ${si(cut.fb, "Hz", 3)} beat is above the IF filter. A gentler slope (smaller B or longer T<sub>c</sub>) reaches farther.`);
      else if (resolved) fmSt.set("ok", "Two targets under 0.5 m apart, resolved.", `<br>Resolution c/2B = ${km(dR, 3)}; the Hann window widens it by about half.`);
      else if (close) fmSt.set("warn", "Two targets are merging.", `<br>Resolution is c/2B = ${km(dR, 3)} (wider after the window). More sweep bandwidth separates them.`);
      else fmSt.set("info", "Each peak is one target.", `<br>Range = f<sub>b</sub> · c / 2S. One FFT bin is ${km(dR, 3)} of range.`);
      if (!fromTour) ch.update();
      chv.redraw(); fsv.redraw();
    }

    // ---------------------------------------------------------------- drawing
    function drawWave(ctx, w, hh) {
      const T = theme();
      if (!W) return;
      const tau = S.tau * 1e6;
      const split = Math.round(hh * 0.52);
      const P1 = axes(ctx, w, hh, { x: [0, tau], y: [-1.3, 1.3], pad: { l: 52, t: 10, b: hh - split + 8 }, xticks: [], yticks: [-1, 0, 1], ylabel: "RF", yfmt: (v) => num(v) });
      const n = Math.round((P1.r - P1.l) * 2.5);
      const Bt = W.Bw * S.tau;
      const code = W.code, Nc = code ? code.length : 0, cpc = code ? Math.max(1, Math.round(40 / Nc)) : 0;
      const Bd = Math.min(Bt, 60) / tau;
      const rf = (t) => {
        if (S.wf === "pulse") return Math.cos((TAU * 20 * t) / tau);
        if (S.wf === "lfm") return Math.cos(TAU * ((Bd / 4) * t + (Bd / (2 * tau)) * t * t));
        const c = Math.min(Nc - 1, Math.floor((t / tau) * Nc));
        return Math.cos((TAU * cpc * Nc * t) / tau + code[c]);
      };
      const pts = [];
      for (let k = 0; k <= n; k++) { const t = (tau * k) / n; pts.push([P1.X(t), P1.Y(rf(t))]); }
      polyline(ctx, pts, T.tx, 1.3);
      // lower panel
      let yr, yl, yfn, fmt;
      if (S.wf === "lfm") { const b = S.B / 1e6; yr = [-b / 2 * 1.15, b / 2 * 1.15]; yl = "MHz"; yfn = (t) => -b / 2 + (b * t) / tau; fmt = (v) => num(v, 3); }
      else { yr = [-30, 390]; yl = "phase °"; yfn = (t) => (code ? (code[Math.min(Nc - 1, Math.floor((t / tau) * Nc))] * 180) / Math.PI : 0); fmt = (v) => `${v}`; }
      const P2 = axes(ctx, w, hh, { x: [0, tau], y: yr, pad: { l: 52, t: split + 8, b: 34 }, xlabel: "time in the pulse (µs)", ylabel: yl, yfmt: fmt, yticks: S.wf === "lfm" ? undefined : [0, 180, 360] });
      const p2 = [];
      const m = code ? Nc * 8 : 200;
      for (let k = 0; k <= m; k++) { const t = Math.min(tau * 0.99999, (tau * k) / m); p2.push([P2.X(t), P2.Y(yfn(t))]); }
      polyline(ctx, p2, S.wf === "lfm" ? T.c4 : T.c4, 2);
      if (S.wf === "barker") {
        ctx.font = T.fontB; ctx.fillStyle = T.ink; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        BARKER13.forEach((c, i) => ctx.fillText(c > 0 ? "+" : "−", P2.X(((i + 0.5) / 13) * tau), P2.Y(c > 0 ? 0 : 180) - 3));
      }
    }

    function drawMF(ctx, w, hh) {
      const T = theme();
      if (!AC) return;
      const db = S.scale === "db";
      const maxLag = S.zoom === "main" ? Math.min(S.tau, 8 / W.Bw) : S.tau * 1.03;
      const xm = (maxLag * C0) / 2;
      const P = axes(ctx, w, hh, { x: [-xm, xm], y: db ? [-60, 4] : [0, 1.08], xlabel: "range offset from the target (m)", ylabel: db ? "dB" : "amplitude",
        xfmt: (v) => num(v, 3), yfmt: (v) => (db ? `${v}` : num(v, 2)), pad: { l: 46, b: 34, t: 14 } });
      const val = (m) => (db ? Math.max(-80, dB20(m)) : m);
      const pts = [];
      const { mag, lag0, dt } = AC;
      const i0 = Math.max(0, Math.floor(lag0 - maxLag / dt)), i1 = Math.min(mag.length - 1, Math.ceil(lag0 + maxLag / dt));
      const step = Math.max(1, Math.floor((i1 - i0) / ((P.r - P.l) * 3)));
      for (let i = i0; i <= i1; i += step) pts.push([P.X(((i - lag0) * dt * C0) / 2), P.Y(val(mag[i]))]);
      P.clip();
      ctx.fillStyle = alpha(T.accent, 0.12); ctx.beginPath(); ctx.moveTo(pts[0][0], P.b);
      pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(pts.at(-1)[0], P.b); ctx.closePath(); ctx.fill();
      polyline(ctx, pts, T.accent, 2);
      const m = AC.m;
      if (isFinite(m.psl)) {
        const y = P.Y(db ? m.psl + dB20(m.peak) : m.peak * 10 ** (m.psl / 20));
        ctx.save(); ctx.setLineDash([5, 4]); polyline(ctx, [[P.l, y], [P.r, y]], T.bad, 1.5); ctx.restore();
      }
      P.unclip();
      if (isFinite(m.psl)) {
        const y = P.Y(db ? m.psl + dB20(m.peak) : m.peak * 10 ** (m.psl / 20));
        label(ctx, `peak sidelobe ${fmtDb(m.psl)}`, P.r - 4, Math.max(P.t + 32, y - 12), { align: "right", color: T.bad, bounds: w });
      }
      const pkx = ((m.pk - lag0) * dt * C0) / 2, wm = (m.w3 * dt * C0) / 2;
      const yW = P.Y(db ? dB20(m.peak) - 3 : m.peak / Math.SQRT2);
      if (P.X(pkx + wm / 2) - P.X(pkx - wm / 2) > 14) dimension(ctx, P.X(pkx - wm / 2), yW, P.X(pkx + wm / 2), yW, "", T.c4);
      label(ctx, `−3 dB width ${km(wm, 3)}`, P.l + 6, P.t + 10, { color: T.c4, bounds: w });
    }

    function drawTwo(ctx, w, hh) {
      const T = theme();
      if (!TT) return;
      const { L, d1, d2, raw, noisy, o } = TT;
      const xr = (i) => ((i - d1) / W.fs) * (C0 / 2);
      const x0 = xr(0), x1 = xr(L - 1);
      const split = Math.round(hh * 0.45);
      const rawMax = Math.max(1.6, ...[1 + 10 ** (S.a2 / 20)]) * 1.15;
      const P1 = axes(ctx, w, hh, { x: [x0, x1], y: [0, rawMax], pad: { l: 46, t: 36, b: hh - split + 6 }, xticks: [], yticks: [0, 1], ylabel: "raw", yfmt: (v) => num(v, 2) });
      const sub = (P, arr, f, color, off = 0) => {
        const pts = [], n = arr.length - off;
        const step = Math.max(1, Math.floor(n / ((P.r - P.l) * 2)));
        for (let i = 0; i < n; i += step) {
          let m = 0; for (let k = i; k < Math.min(n, i + step); k++) m = Math.max(m, arr[k + off]);
          pts.push([P.X(xr(i)), P.Y(f(m))]);
        }
        P.clip(); polyline(ctx, pts, color, 1.5); P.unclip();
      };
      const ext = (C0 * S.tau) / 2;
      ctx.fillStyle = alpha(T.tgt, 0.08);
      for (const d of [d1, d2]) { const a = P1.X(xr(d)), b = P1.X(xr(d) + ext); ctx.fillRect(a, P1.t, Math.min(b, P1.r) - a, P1.b - P1.t); }
      sub(P1, raw, (v) => Math.min(v, rawMax), T.rx);
      label(ctx, `received: each echo is ${km(ext, 3)} long`, P1.r - 4, 11, { align: "right", color: T.rx, font: T.font, bounds: w });
      const db = S.scale === "db";
      const P2 = axes(ctx, w, hh, { x: [x0, x1], y: db ? [-50, 5] : [0, 1.15], pad: { l: 46, t: split + 26, b: 34 }, xlabel: "range from target 1 (m)", ylabel: db ? "dB" : "compressed",
        xfmt: (v) => num(v, 3), yfmt: (v) => (db ? `${v}` : num(v, 2)) });
      sub(P2, noisy, (v) => (db ? Math.max(-60, dB20(v)) : Math.min(v, 1.2)), T.accent, o);
      label(ctx, `after the matched filter: SNR ${fmtDb(TT.snrOut, "dB", 0)}`, P2.r - 4, split + 12, { align: "right", color: T.accent, font: T.font, bounds: w });
      for (const [d, c] of [[d1, T.tgt], [d2, T.tgt]]) {
        const x = P2.X(xr(d));
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(x, P2.b + 1); ctx.lineTo(x - 5, P2.b + 9); ctx.lineTo(x + 5, P2.b + 9); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, P1.t - 1); ctx.lineTo(x - 5, P1.t - 9); ctx.lineTo(x + 5, P1.t - 9); ctx.closePath(); ctx.fill();
      }
    }

    function drawChirps(ctx, w, hh) {
      const T = theme();
      if (!FM) return;
      const on = FM.tg.filter((t) => t.on);
      const maxD = Math.max(...on.map((t) => (2 * t.R) / C0));
      const K = Math.max(1, (0.12 * F.Tc) / maxD);
      const split = Math.round(hh * 0.62);
      const tc = F.Tc * 1e6, span = 2.3 * tc;
      const Bm = F.B / 1e6;
      const P = axes(ctx, w, hh, { x: [0, span], y: [-0.05 * Bm, 1.12 * Bm], pad: { l: 52, t: 10, b: hh - split + 22 }, xlabel: "", ylabel: "77 GHz + MHz", yfmt: (v) => num(v, 3), xfmt: (v) => num(v, 3) });
      const saw = (delay, color, width) => {
        P.clip();
        for (let c = -1; c < 3; c++) {
          const t0 = c * tc + delay, t1 = (c + 1) * tc + delay;
          polyline(ctx, [[P.X(t0), P.Y(0)], [P.X(t1), P.Y(Bm)]], color, width);
          ctx.save(); ctx.setLineDash([2, 3]); polyline(ctx, [[P.X(t1), P.Y(Bm)], [P.X(t1), P.Y(0)]], alpha(color, 0.6), 1); ctx.restore();
        }
        P.unclip();
      };
      saw(0, T.tx, 2.5);
      on.forEach((t) => saw(((2 * t.R) / C0) * K * 1e6, t.cut ? alpha(T.rx, 0.35) : T.rx, 1.5));
      const t1 = on[0];
      if (t1) {
        const tx = tc * 0.55, d = ((2 * t1.R) / C0) * K * 1e6;
        const fT = (tx / tc) * Bm, fR = ((tx - d) / tc) * Bm;
        dimension(ctx, P.X(tx), P.Y(fT), P.X(tx), P.Y(fR), "", T.c4);
        label(ctx, `f_b = ${si(t1.fb, "Hz", 3)}`, P.X(tx) + 8, P.Y((fT + fR) / 2), { color: T.c4, bounds: w });
      }
      label(ctx, `echo delays drawn ×${num(K, 3)}`, P.r - 4, P.t + 10, { align: "right", color: T.muted, font: T.font, bounds: w });
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "right"; ctx.textBaseline = "top"; ctx.fillText("time (µs)", P.r, P.b + 18);
      // beat signal over one chirp (noise-free)
      const P2 = axes(ctx, w, hh, { x: [0, tc], y: [-1.15, 1.15], pad: { l: 52, t: split + 8, b: 22 }, xticks: [], yticks: [0], ylabel: "beat", yfmt: () => "" });
      const n = Math.round((P2.r - P2.l) * 2), pts = [];
      const amax = on.reduce((s, t) => s + t.a, 0) || 1;
      for (let k = 0; k <= n; k++) {
        const t = (F.Tc * k) / n;
        let v = 0; for (const t2 of FM.tg) if (t2.a) v += t2.a * Math.cos(TAU * t2.fb * t + t2.ph);
        pts.push([P2.X((t * 1e6)), P2.Y(v / amax)]);
      }
      polyline(ctx, pts, T.c4, 1.2);
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
      ctx.fillText("beat signal over one chirp (real part)", P2.r, hh - 2);
    }

    function drawFmSpec(ctx, w, hh) {
      const T = theme();
      if (!FM) return;
      const on = FM.tg.filter((t) => t.on && !t.cut);
      let r0 = 0, r1 = FM.rmax;
      if (F.view === "zoom" && on.length) {
        r0 = Math.max(0, Math.min(...on.map((t) => t.R)) - 10 * FM.dR);
        r1 = Math.min(FM.rmax, Math.max(...on.map((t) => t.R)) + 10 * FM.dR);
      } else if (on.length) r1 = Math.min(FM.rmax, Math.max(1.35 * Math.max(...on.map((t) => t.R)), 20 * FM.dR));
      const P = axes(ctx, w, hh, { x: [r0, r1], y: [-10, 60], xlabel: "range (m)", ylabel: "dB above noise", xfmt: (v) => num(v, 3), yfmt: (v) => `${v}`, pad: { l: 46, b: 34, t: 14 } });
      const { NF, noisy, Sl } = FM;
      const toR = (k) => ((k / NF) * FM_FS * C0) / (2 * Sl);
      const k0 = Math.max(0, Math.floor((r0 / toR(1)))), k1 = Math.min(NF - 1, Math.ceil(r1 / toR(1)));
      const pts = [];
      for (let k = k0; k <= k1; k++) pts.push([P.X(toR(k)), P.Y(clamp(10 * Math.log10(noisy[k] + 1e-12), -12, 70))]);
      if (pts.length < 2) return;
      P.clip();
      ctx.fillStyle = alpha(T.accent, 0.12); ctx.beginPath(); ctx.moveTo(pts[0][0], P.b);
      pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(pts.at(-1)[0], P.b); ctx.closePath(); ctx.fill();
      polyline(ctx, pts, T.accent, 1.5);
      P.unclip();
      FM.tg.forEach((t, i) => {
        if (!t.on || t.cut || t.R < r0 || t.R > r1) return;
        const x = P.X(t.R);
        ctx.fillStyle = T.tgt; ctx.beginPath(); ctx.moveTo(x, P.b - 1); ctx.lineTo(x - 5, P.b + 7); ctx.lineTo(x + 5, P.b + 7); ctx.closePath(); ctx.fill();
        const k = Math.round((t.fb / FM_FS) * NF);
        label(ctx, `${i + 1} · ${num(t.R, 4)} m`, x, P.Y(clamp(10 * Math.log10(noisy[k] + 1e-12), -10, 55)) - 12 - i * 2, { align: "center", color: T.tgt, bounds: w });
      });
    }

    changed();
    fmChanged();

    notes(root, "Background", [
      { title: "The matched filter", open: true, html:
        "<p>In white noise, the filter that maximises the peak signal-to-noise ratio is the time-reversed complex conjugate of the expected echo, <i>h</i>(<i>t</i>) = <i>s</i>*(−<i>t</i>). Its output is the cross-correlation of the received signal with the transmitted waveform, and its peak SNR depends only on the echo's energy, not its shape:</p>" +
        "<p class=\"eq\">SNR<sub>max</sub> = <span class=\"frac\"><span>2<i>E</i></span><span><i>N</i><sub>0</sub></span></span> &nbsp;&nbsp;(<i>E</i>/<i>N</i><sub>0</sub> for complex baseband)</p>" +
        "<p>So detection range is set by energy = peak power × pulse length, while range resolution is set by bandwidth. Modulation decouples the two. Plain, unmodulated pulses (the on–off keying of early radars) have <i>B</i> ≈ 1/τ and get no compression.</p>" },
      { title: "Time–bandwidth product and resolution", html:
        "<p>After compression the peak is about 1/<i>B</i> wide, so</p>" +
        "<p class=\"eq\">Δ<i>R</i> = <span class=\"frac\"><span><i>c</i></span><span>2<i>B</i></span></span> &nbsp;&nbsp; compression ratio = <span class=\"frac\"><span>τ</span><span>1/<i>B</i></span></span> = <i>B</i>τ</p>" +
        "<p>The SNR gain over an uncompressed pulse of the same resolution is also <i>B</i>τ. A 100 µs pulse with 10 MHz of chirp has <i>B</i>τ = 1000 (30 dB): the energy of a 100 µs pulse with the 15 m resolution of a 0.1 µs one. Compression also lets solid-state transmitters, which can't make megawatt peaks, run long pulses at modest peak power.</p>" },
      { title: "Linear FM (chirp)", html:
        "<p class=\"eq\"><i>s</i>(<i>t</i>) = exp(<i>j</i>π <span class=\"frac\"><span><i>B</i></span><span>τ</span></span> <i>t</i><sup>2</sup>), &nbsp; |<i>t</i>| ≤ τ/2 &nbsp;&nbsp; <i>f</i><sub>inst</sub>(<i>t</i>) = <span class=\"frac\"><span><i>B</i></span><span>τ</span></span> <i>t</i></p>" +
        "<p>Its compressed output is close to a sinc, with first sidelobes at −13.2 dB. Amplitude weighting on receive trades those for a wider mainlobe and a small <b>mismatch loss</b>: Hamming gives about −43 dB, 1.47× width and 1.3 dB loss; Taylor (−35 dB, n̄ = 5) about 1.3× and 0.7 dB. At small <i>B</i>τ the spectrum has Fresnel ripples and sidelobes are worse than these ideal figures.</p>" +
        "<p>A Doppler shift <i>f</i><sub>d</sub> makes a chirp look like it started earlier or later, so the peak moves by Δ<i>t</i> = −<i>f</i><sub>d</sub>τ/<i>B</i> (range–Doppler coupling) with little loss. That tolerance is why chirps are everywhere. Very wide chirps are often <b>stretch processed</b>: mixed with a delayed reference chirp so each range becomes a tone, the same trick FMCW uses.</p>" },
      { title: "Phase codes", html:
        "<p>A phase-coded pulse is split into <i>N</i> chips of length τ<sub>c</sub>, each with its own phase. Bandwidth ≈ 1/τ<sub>c</sub>, compression ratio = <i>N</i>. <b>Barker codes</b> have every sidelobe at most 1/<i>N</i> of the peak; only these lengths exist:</p>" +
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Length</th><th>Code</th><th>Peak sidelobe</th></tr>" +
        "<tr><td class=\"num\">2</td><td>+ − or + +</td><td class=\"num\">−6.0 dB</td></tr><tr><td class=\"num\">3</td><td>+ + −</td><td class=\"num\">−9.5 dB</td></tr>" +
        "<tr><td class=\"num\">4</td><td>+ + − + or + + + −</td><td class=\"num\">−12.0 dB</td></tr><tr><td class=\"num\">5</td><td>+ + + − +</td><td class=\"num\">−14.0 dB</td></tr>" +
        "<tr><td class=\"num\">7</td><td>+ + + − − + −</td><td class=\"num\">−16.9 dB</td></tr><tr><td class=\"num\">11</td><td>+ + + − − − + − − + −</td><td class=\"num\">−20.8 dB</td></tr>" +
        "<tr><td class=\"num\">13</td><td>+ + + + + − − + + − + − +</td><td class=\"num\">−22.3 dB</td></tr></table></div>" +
        "<p>Longer codes use polyphase sequences: a <b>Frank code</b> of length <i>M</i>² has phases 2π<i>ik</i>/<i>M</i> (a stepped approximation of a chirp), and P3/P4 codes are sampled chirps. Random codes compress too, but with sidelobes only about 1/√<i>N</i> down. Phase codes are Doppler-intolerant: once <i>f</i><sub>d</sub>τ approaches ½ the chips no longer add in phase, so they suit slow targets or need a bank of Doppler-shifted filters.</p>" },
      { title: "FMCW radar", html:
        "<p>An FMCW radar transmits continuously, ramping frequency at slope <i>S</i> = <i>B</i>/<i>T</i><sub>c</sub>. The echo is a delayed copy; mixing it with the current transmit signal gives a constant beat:</p>" +
        "<p class=\"eq\"><i>f</i><sub>b</sub> = <i>S</i> · <span class=\"frac\"><span>2<i>R</i></span><span><i>c</i></span></span> &nbsp;⇒&nbsp; <i>R</i> = <span class=\"frac\"><span><i>c</i> <i>f</i><sub>b</sub></span><span>2<i>S</i></span></span> &nbsp;&nbsp; Δ<i>R</i> = <span class=\"frac\"><span><i>c</i></span><span>2<i>B</i></span></span> &nbsp;&nbsp; <i>R</i><sub>max</sub> = <span class=\"frac\"><span><i>c</i> <i>f</i><sub>IF,max</sub></span><span>2<i>S</i></span></span></p>" +
        "<p>The FFT over one chirp lasts <i>T</i><sub>c</sub>, so its bins are 1/<i>T</i><sub>c</sub> apart, which works out to exactly <i>c</i>/2<i>B</i> of range. Velocity comes from a second FFT across many chirps (the phase of each range peak advances by 4π<i>v</i><i>T</i><sub>c</sub>/λ per chirp), giving the range–Doppler maps of automotive radar. Typical 77 GHz settings: <i>B</i> = 300 MHz–4 GHz, <i>T</i><sub>c</sub> = 10–100 µs, a few hundred samples per chirp, ranges from 0.1 to 250 m. Low-power, cheap and with no blind range, FMCW is also used in altimeters, level gauges and the old Doppler navigators.</p>" },
      { title: "The ambiguity function", html:
        "<p>Every waveform's response to a target at range offset τ and Doppler <i>f</i><sub>d</sub> is summarised by its ambiguity function, |χ(τ, <i>f</i><sub>d</sub>)|, the matched filter output for a mismatched echo. Its total volume is fixed (Woodward), so a designer can only move ambiguity around: a chirp's is a ridge along a diagonal (range–Doppler coupling), a Barker code's a single spike with a floor of sidelobes, a long pulse train's a bed of nails at multiples of the PRI and PRF.</p>" },
    ]);

    api.quiz(root, [
      { q: "A radar sends a 20 µs pulse chirped over 15 MHz. What range resolution does the matched filter give?", options: ["3 km", "10 m", "20 m", "300 m"], answer: 1,
        why: "ΔR = c/2B = 3×10⁸ / (2 × 15×10⁶) = 10 m. The pulse length (3 km in space) no longer matters; it sets the energy." },
      { q: "Why do pulse-compression radars use long pulses at all?", options: ["To reduce the blind range", "To put more energy on the target without raising the peak power", "To make the radar harder to jam", "Because short pulses can't be chirped"], answer: 1,
        why: "Detection depends on energy E = P·τ. Transmitters (especially solid-state ones) are limited in peak power, so length is the cheap way to add energy. The downside is a longer blind range, the opposite of the first option." },
      { q: "What is the peak sidelobe level of a Barker-13 code after matched filtering?", options: ["−13.2 dB", "−22.3 dB", "−35 dB", "No sidelobes"], answer: 1,
        why: "Every Barker sidelobe has magnitude 1 against a peak of 13: 20·log₁₀(1/13) = −22.3 dB. −13.2 dB is an unweighted chirp." },
      { q: "An FMCW radar sweeps 300 MHz in 30 µs. What beat frequency does a car at 45 m give?", options: ["3 MHz", "300 kHz", "30 MHz", "1.5 MHz"], answer: 0,
        why: "S = 300 MHz / 30 µs = 10 MHz/µs = 10¹³ Hz/s. f<sub>b</sub> = 2RS/c = 2 × 45 × 10¹³ / 3×10⁸ = 3 MHz." },
    ]);
  },
};
