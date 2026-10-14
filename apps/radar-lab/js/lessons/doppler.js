// Lesson 5: Doppler & velocity. A moving target shifts the echo frequency by 2·v_r/λ; a pulsed radar only
// samples that shift once per pulse, so it aliases at ±PRF/2 and vanishes at the blind speeds.
import {
  h, C0, card, labGrid, group, notes, slider, choice, check, readout, status, legend,
  canvasView, drag, animate, playButton, axes, ticks, theme, alpha, label, arrow, polyline,
  num, si, km, fmtDb, clamp, rad, deg, TAU, undb, rng, gauss, fft, reducedMotion,
} from "../ui.js";

const BANDS = [[1.3e9, "L"], [3e9, "S"], [5.6e9, "C"], [10e9, "X"], [24.15e9, "K"], [35e9, "Ka"]];
const EXAG = 40000;       // the wave canvas draws the frequency shift this many times larger than life
const SNR1 = 5;           // target SNR per pulse, dB
const CNR = 45;           // ground clutter to noise per pulse, dB
const CLUT_SV = 0.15;     // clutter velocity spread (wind-blown trees and grass), m/s
const PULSE_RATE = 1.1;   // phasor view: pulses per second of animation
const V_MAX = 1000;       // m/s

const sgn = (x, f, eps = 1e-3) => (Math.abs(x) < eps ? f(0) : `${x > 0 ? "+" : "−"}${f(Math.abs(x))}`);
const hz = (x) => sgn(x, (a) => si(a, "Hz", 3), 0.05);
const ms = (x, d = 3) => sgn(x, (a) => `${num(a, d)} m/s`);

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "A target moving toward the radar squeezes the echo's wavefronts together, so it comes back at a slightly " +
      "higher frequency; one moving away stretches them. The shift is tiny (a few parts per million) but radars measure it " +
      "precisely, and use it to pull moving aircraft out of the much stronger echoes from the ground." }));

    const S = { f0: 10e9, prf: 20000, v: 120, th: 30, N: 64, clutter: true, mti: false, win: true, repeats: false };
    let D = {};
    let spec = null;
    let waveT = 0, phT = 6.6 / PULSE_RATE;

    // ---- guided tour
    const set = (o) => {
      Object.assign(S, o);
      bandC.value = S.f0; prfS.value = S.prf; nC.value = S.N; vS.value = S.v; thS.value = S.th;
      clutC.checked = S.clutter; mtiC.checked = S.mti; winC.checked = S.win; repC.checked = S.repeats;
      changed(true);
    };
    api.steps(root, [
      { title: "1 · The echo comes back shifted", html:
        "<p>An aircraft flying straight at an X-band radar (10 GHz, λ = 3 cm) at 250 m/s returns an echo about <b>16.7 kHz</b> higher than it was sent. That's 1.7 parts per million, but the receiver mixes the echo with its own transmitter and the difference pops out as a clean beat note:</p>" +
        "<p class=\"eq\"><i>f</i><sub>d</sub> = <span class=\"frac\"><span>2 <i>v</i><sub>r</sub></span><span>λ</span></span></p>",
        look: "the echo waves. The bottom trace (mixer output) is the Doppler beat.",
        apply: () => set({ f0: 10e9, prf: 40000, v: 250, th: 0, clutter: true, mti: false, win: true, repeats: false, N: 64 }) },
      { title: "2 · Only the radial part counts", html:
        "<p>The shift depends on how fast the <b>range</b> is changing, the radial velocity <i>v</i><sub>r</sub> = <i>v</i> cos θ. Fly at 60° to the line of sight and the radar sees only half your speed. The factor of 2 is because the path is out <i>and</i> back: every metre closer shortens the round trip by two metres.</p>",
        look: "drag the arrow in the geometry view and watch the blue radial component.",
        apply: () => set({ th: 60, v: 300 }) },
      { title: "3 · The notch", html:
        "<p>Now fly at right angles to the line of sight. The range isn't changing, so <i>f</i><sub>d</sub> = 0, exactly where the stationary ground clutter sits. Fighter pilots call this <b>beaming</b> or <b>notching</b>: turn side-on to a pulse-Doppler radar and you disappear into its clutter filter, however fast you are.</p>",
        look: "the spectrum: the target sits under the clutter spike at 0 Hz and the status says it is lost.",
        apply: () => set({ th: 90, v: 300, prf: 40000, clutter: true }) },
      { title: "4 · Pulse-Doppler: one sample per pulse", html:
        "<p>A pulsed radar can't watch the beat continuously. It gets one look per pulse, so what it measures is the echo's <b>phase</b> changing from pulse to pulse. Each sample is a dot on the phasor circle; the dots step round by 2π·<i>f</i><sub>d</sub>/PRF each time. A Fourier transform of <i>N</i> such samples gives the Doppler spectrum.</p>",
        look: "the phasor view. The green arc is the step between pulses: a steady quarter-turn or so.",
        apply: () => set({ th: 0, v: 12, prf: 3000, N: 64 }) },
      { title: "5 · Too fast: the wagon wheel", html:
        "<p>Speed the target up. Once the phasor turns more than half a revolution between pulses, the samples can't tell +¾ turn from −¼ turn, just as a film camera makes a fast wheel spin backwards. Doppler is only unambiguous within <b>±PRF/2</b>, so</p><p class=\"eq\"><i>v</i><sub>u</sub> = ± <span class=\"frac\"><span>λ · PRF</span><span>4</span></span></p>",
        look: "the target appears on the wrong side of the spectrum, receding when it is really approaching.",
        apply: () => set({ th: 0, v: 34, prf: 3000, mti: false }) },
      { title: "6 · Blind speed", html:
        "<p>At exactly one whole turn per pulse the samples don't move at all. The target looks stationary, and the clutter canceller removes it with the ground. These <b>blind speeds</b> repeat every</p><p class=\"eq\"><i>v</i><sub>b</sub> = <i>n</i> · <span class=\"frac\"><span>λ · PRF</span><span>2</span></span></p>",
        look: "the dots on the phasor circle stand still. Turn the MTI canceller off and on.",
        apply: () => set({ th: 0, v: (C0 / 10e9) * 3000 / 2, prf: 3000, mti: true, clutter: true }) },
      { title: "7 · You can't have it all", html:
        "<p>Raise the PRF to make 680 m/s unambiguous at X band and you need 90 kHz, but then the next pulse leaves while echoes from beyond 1.7 km are still coming home. Unambiguous range and velocity trade against each other:</p><p class=\"eq\"><i>R</i><sub>u</sub> · <i>v</i><sub>u</sub> = <span class=\"frac\"><span><i>c</i> λ</span><span>8</span></span></p>",
        look: "the readout: R<sub>u</sub> collapses as v<sub>u</sub> grows. Their product never changes for a given band.",
        apply: () => set({ th: 0, v: 680, prf: 95000, mti: false }) },
    ]);

    const lab = labGrid(root);

    // ---- geometry view
    const geoCard = card(lab.main, "Geometry, seen from above", "drag to set the target's velocity");
    const geo = api.track(canvasView(geoCard, { aspect: 2.1, minHeight: 230, maxHeight: 330, free: true, draw: drawGeo,
      label: "Top-down view of a radar and a target with its velocity split into radial and tangential parts" }));
    legend(geoCard, [[theme().tgt, "velocity"], [theme().rx, "radial part (gives Doppler)"], [theme().muted, "tangential part (invisible to Doppler)"]]);
    function G() {
      const w = geo.w, hh = geo.h;
      return { rx: 44, ry: hh - 40, tx: w * 0.62, ty: hh * 0.42, sc: (Math.min(w * 0.6, hh) * 0.36) / V_MAX };
    }
    function los() {
      const g = G();
      const dx = g.rx - g.tx, dy = g.ry - g.ty, d = Math.hypot(dx, dy);
      const u = [dx / d, dy / d], p = [-u[1], u[0]];
      return { g, u, p, d };
    }
    drag(geo, {
      move: (x, y) => {
        const { g, u, p } = los();
        const vx = (x - g.tx) / g.sc, vy = (y - g.ty) / g.sc;
        S.v = clamp(Math.round(Math.hypot(vx, vy)), 0, V_MAX);
        if (S.v > 5) S.th = Math.round(deg(Math.atan2(vx * p[0] + vy * p[1], vx * u[0] + vy * u[1])));
        vS.value = S.v; thS.value = S.th;
        changed();
      },
    });

    // ---- echo waves
    const waveCard = card(lab.main, "Transmitted wave and echo", "the shift is exaggerated");
    const wave = api.track(canvasView(waveCard, { aspect: 3.2, minHeight: 200, maxHeight: 250, draw: drawWave,
      label: "Transmitted wave, the Doppler-shifted echo, and the beat note between them" }));
    const waveCap = h("p", { class: "caption" });
    waveCard.append(waveCap);

    // ---- phasor
    const phCard = card(lab.main, "Pulse-to-pulse phase", "one sample per pulse, in slow motion");
    const ph = api.track(canvasView(phCard, { height: (w) => (w < 560 ? 430 : Math.round(clamp(w / 3, 250, 300))), draw: drawPhasor,
      label: "Rotating echo phasor sampled once per pulse, showing how fast rotation aliases" }));
    legend(phCard, [[theme().muted, "true echo phase (continuous)"], [theme().rx, "samples, one per pulse"], [theme().ok, "apparent step between pulses"]]);

    // ---- spectrum
    const spCard = card(lab.main, "Doppler spectrum", "FFT of N pulses from one range cell");
    const sp = api.track(canvasView(spCard, { aspect: 2.3, minHeight: 230, maxHeight: 340, draw: drawSpec,
      label: "Doppler spectrum with ground clutter at zero and the target line" }));
    legend(spCard, [[theme().accent, "spectrum"], [theme().tgt, "target (where it appears)"], [theme().muted, "MTI filter response"]]);
    const st = status(spCard);

    // ---- controls
    const ctl = card(lab.side, "Controls");
    const g1 = group(ctl, "Radar");
    const bandC = choice(g1, { label: "Band", value: S.f0, options: BANDS.map(([f, n]) => [f, n]), onChange: (v) => { S.f0 = v; changed(); } });
    const bandHelp = h("div", { class: "help small muted", style: { margin: "4px 0 6px" } });
    g1.append(bandHelp);
    const prfS = slider(g1, { label: "PRF", min: 200, max: 200000, log: true, value: S.prf, format: (v) => si(v, "Hz", 3), onInput: (v) => { S.prf = v; changed(); } });
    const nC = choice(g1, { label: "Pulses per FFT (<i>N</i>)", value: S.N, options: [[16, "16"], [32, "32"], [64, "64"], [128, "128"]], onChange: (v) => { S.N = v; changed(); } });

    const g2 = group(ctl, "Target");
    const vS = slider(g2, { label: "Speed", min: 0, max: V_MAX, step: 0.5, value: S.v, format: (v) => `${num(v, 4)} m/s · Mach ${num(v / 340, 2)}`, onInput: (v) => { S.v = v; changed(); } });
    const thS = slider(g2, { label: "Heading off the line of sight (θ)", min: -180, max: 180, step: 1, value: S.th,
      format: (v) => `${num(v, 3)}°`, help: "0° = straight at the radar, 90° = side-on, 180° = straight away.", onInput: (v) => { S.th = v; changed(); } });

    const g3 = group(ctl, "Processing");
    const clutC = check(g3, { label: "Ground clutter (45 dB, at 0 Hz)", checked: S.clutter, onChange: (v) => { S.clutter = v; changed(); } });
    const mtiC = check(g3, { label: "MTI canceller (subtract the previous pulse)", checked: S.mti, onChange: (v) => { S.mti = v; changed(); } });
    const winC = check(g3, { label: "Hann window on the FFT", checked: S.win, onChange: (v) => { S.win = v; changed(); } });
    const repC = check(g3, { label: "Show the spectrum's repeats (±1.5 PRF)", checked: S.repeats, onChange: (v) => { S.repeats = v; changed(); } });

    const outCard = card(lab.side, "Numbers");
    const ro = readout(outCard);

    const ch = api.challenges(root, [
      { id: "notch", text: "Make the Doppler shift (nearly) zero while the target flies at 200 m/s or more.", check: (s) => s.v >= 200 && Math.abs(s.vr) <= 3 },
      { id: "blind", text: "Find a blind speed: a target moving at 10 m/s or more radially whose Doppler folds onto 0 Hz.", check: (s) => Math.abs(s.vr) >= 10 && s.blind },
      { id: "flip", text: "Make an approaching target look as if it is receding (or the other way round).", check: (s) => s.flip },
      { id: "mach2", text: "At X band, pick a PRF that shows a Mach 2 target (680 m/s head-on) with the right speed and sign. What happens to R<sub>u</sub>?",
        check: (s) => s.f0 === 10e9 && Math.abs(s.vr) >= 670 && !s.aliased },
      { id: "slow", text: "With clutter on and MTI off, detect a slow target (3–15 m/s radial) right next to the clutter. You'll need fine Doppler resolution and a window.",
        check: (s) => s.clutter && !s.mti && Math.abs(s.vr) >= 3 && Math.abs(s.vr) <= 15 && s.detected },
    ]);

    // ---- model
    function derive() {
      const lam = C0 / S.f0, vr = S.v * Math.cos(rad(S.th)), fd = (2 * vr) / lam;
      const k = Math.round(fd / S.prf), fa = fd - k * S.prf;
      const bin = S.prf / S.N;
      const aliased = Math.abs(fd) > S.prf / 2 + 1e-9;
      D = {
        lam, vr, fd, k, fa, bin, aliased,
        flip: aliased && Math.abs(fa) > bin && Math.sign(fa) !== Math.sign(fd),
        blind: k !== 0 && Math.abs(fa) < Math.max(bin, 0.02 * S.prf),
        vu: (lam * S.prf) / 4, vb: (lam * S.prf) / 2, Ru: C0 / (2 * S.prf), va: (fa * lam) / 2,
        dv: (lam * S.prf) / (2 * S.N), cpi: S.N / S.prf,
      };
    }

    /** Slow-time samples from one range cell: target + clutter + noise, then MTI, window and FFT. */
    function computeSpectrum() {
      const N = S.N, T = 1 / S.prf, NF = Math.max(256, 4 * N);
      const R = rng(11);
      const tRe = new Float64Array(N), tIm = new Float64Array(N), iRe = new Float64Array(N), iIm = new Float64Array(N);
      const At = Math.sqrt(undb(SNR1));
      for (let n = 0; n < N; n++) { const p = TAU * ((D.fd * n * T) % 1) + 0.7; tRe[n] = At * Math.cos(p); tIm[n] = At * Math.sin(p); }
      const K = 14, sf = (2 * CLUT_SV) / D.lam, pc = Math.sqrt(undb(CNR) / K);
      for (let k = 0; k < K; k++) {
        const ar = gauss(R) * Math.SQRT1_2 * pc, ai = gauss(R) * Math.SQRT1_2 * pc, f = gauss(R) * sf;
        if (!S.clutter) continue;
        for (let n = 0; n < N; n++) {
          const p = TAU * f * n * T, c = Math.cos(p), s = Math.sin(p);
          iRe[n] += ar * c - ai * s; iIm[n] += ar * s + ai * c;
        }
      }
      for (let n = 0; n < N; n++) { iRe[n] += gauss(R) * Math.SQRT1_2; iIm[n] += gauss(R) * Math.SQRT1_2; }
      const m = S.mti ? N - 1 : N;
      const w = Float64Array.from({ length: m }, (_, n) => (S.win ? 0.5 - 0.5 * Math.cos((TAU * (n + 0.5)) / m) : 1));
      const noiseRef = w.reduce((a, x) => a + x * x, 0) * (S.mti ? 2 : 1);
      const proc = (re, im) => {
        const xr = new Float64Array(NF), xi = new Float64Array(NF);
        for (let n = 0; n < m; n++) {
          const a = S.mti ? re[n + 1] - re[n] : re[n], b = S.mti ? im[n + 1] - im[n] : im[n];
          xr[n] = a * w[n]; xi[n] = b * w[n];
        }
        fft(xr, xi);
        const out = new Float64Array(NF);
        for (let j = 0; j < NF; j++) { const q = (j + NF / 2) % NF; out[j] = (xr[q] * xr[q] + xi[q] * xi[q]) / noiseRef; }
        return out;
      };
      const tot = proc(Float64Array.from(tRe, (x, n) => x + iRe[n]), Float64Array.from(tIm, (x, n) => x + iIm[n]));
      const tgt = proc(tRe, tIm), itf = proc(iRe, iIm);
      const jt = clamp(Math.round((D.fa / S.prf) * NF) + NF / 2, 0, NF - 1);
      const r = Math.max(1, Math.round(NF / N / 2));
      let pi = 0, cnt = 0;
      for (let j = jt - r; j <= jt + r; j++) { pi += itf[(j + NF) % NF]; cnt++; }
      const scnr = 10 * Math.log10(tgt[jt] / (pi / cnt) + 1e-12);
      spec = { NF, db: Float64Array.from(tot, (x) => 10 * Math.log10(x + 1e-12)), scnr, tgtDb: 10 * Math.log10(tgt[jt] + 1e-12) };
    }

    function changed(fromTour = false) {
      derive();
      computeSpectrum();
      D.detected = spec.scnr >= 10;
      const band = BANDS.find(([f]) => f === S.f0);
      bandHelp.innerHTML = `${band[1]} band: <i>f</i><sub>0</sub> = ${si(S.f0, "Hz", 4)}, λ = ${si(D.lam, "m", 3)}`;
      const closing = D.vr > 0.05 ? "closing" : D.vr < -0.05 ? "opening" : "constant range";
      ro.set([
        ["Radial velocity <i>v</i><sub>r</sub>", `${ms(D.vr)} (${closing})`],
        ["Doppler <i>f</i><sub>d</sub> = 2<i>v</i><sub>r</sub>/λ", hz(D.fd)],
        ["Phase step per pulse", `${num(D.fd / S.prf, 3)} turns`, D.aliased ? "warn" : null],
        ["Unambiguous ±PRF/2", `±${si(S.prf / 2, "Hz", 3)}`],
        ["Unambiguous speed <i>v</i><sub>u</sub> = λ·PRF/4", `±${num(D.vu, 3)} m/s`, D.aliased ? "warn" : "ok"],
        ["Appears at", `${hz(D.fa)} = ${ms(D.va)}`, D.blind ? "bad" : D.flip ? "bad" : D.aliased ? "warn" : "ok"],
        ["First blind speed <i>v</i><sub>b</sub> = λ·PRF/2", `${num(D.vb, 3)} m/s`],
        ["Unambiguous range <i>R</i><sub>u</sub> = c/2PRF", km(D.Ru, 3)],
        ["<i>R</i><sub>u</sub> · <i>v</i><sub>u</sub> = cλ/8", `${num((D.Ru * D.vu) / 1000, 3)} km·m/s`],
        ["Velocity resolution λ·PRF/2N", `${num(D.dv, 3)} m/s`],
        ["Dwell (CPI) <i>N</i>/PRF", si(D.cpi, "s", 3)],
        ["Target to clutter+noise", fmtDb(spec.scnr), D.detected ? "ok" : "bad"],
      ]);
      // status
      if (D.detected) {
        if (D.flip) st.set("bad", "Detected, but with the wrong sign.", `<br>True ${ms(D.vr)} folded to ${ms(D.va)}: the phasor turns more than half a revolution per pulse.`);
        else if (D.aliased) st.set("warn", "Detected, but aliased.", `<br>True ${hz(D.fd)} appears at ${hz(D.fa)} (${ms(D.va)}). The radar can't tell which of the repeats is real.`);
        else st.set("ok", `Detected at ${ms(D.va)}.`, `<br>${fmtDb(spec.scnr)} above clutter and noise in its Doppler bin.`);
      } else if (D.blind && S.mti) st.set("bad", "Blind speed: the canceller removed the target.", `<br>${ms(D.vr)} is ${D.k} × v<sub>b</sub>, so every pulse sees the same phase, exactly like the ground.`);
      else if (Math.abs(D.fa) < 3 * D.bin && S.clutter) st.set("bad", "Lost in the clutter.", `<br>Its Doppler (${hz(D.fa)} as sampled) sits under the ground return at 0 Hz.`);
      else st.set("bad", "Not detected.", `<br>Only ${fmtDb(spec.scnr)} above the clutter and noise in its bin.${!S.win && S.clutter ? " Without a window the clutter's sidelobes leak across the whole spectrum." : ""}`);
      const rho = (2 * D.vr) / C0;
      waveCap.innerHTML = `Frequency shift drawn ${EXAG.toLocaleString("en-US")}× larger than life. The real echo is ${num(1 + rho, 9)} × f<sub>0</sub>: a shift of ${num(Math.abs(rho) * 1e6, 3)} parts per million.`;
      if (!fromTour) ch.update({ ...S, ...D });
      geo.redraw(); wave.redraw(); ph.redraw(); sp.redraw();
    }

    // ---- drawing
    function drawGeo(ctx, w, hh) {
      const T = theme();
      const { g, u, p, d } = los();
      ctx.fillStyle = T.surface2; ctx.fillRect(0, 0, w, hh);
      // iso-range circle through the target
      ctx.save(); ctx.setLineDash([3, 5]); ctx.strokeStyle = T.axis; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(g.rx, g.ry, d, -Math.PI / 2 - 0.2, 0.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(g.rx, g.ry); ctx.lineTo(g.tx, g.ty); ctx.stroke(); ctx.restore();
      label(ctx, "constant range: zero Doppler", g.rx + d * Math.cos(-0.12) + 6, g.ry + d * Math.sin(-0.12), { align: "left", color: T.muted, font: T.font, bounds: w });
      // radar
      ctx.fillStyle = T.ink; ctx.beginPath(); ctx.arc(g.rx, g.ry, 7, 0, TAU); ctx.fill();
      ctx.strokeStyle = T.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(g.rx, g.ry, 13, -Math.PI / 2 + 0.25, -0.25); ctx.stroke();
      ctx.beginPath(); ctx.arc(g.rx, g.ry, 19, -Math.PI / 2 + 0.35, -0.35); ctx.stroke();
      ctx.font = T.fontB; ctx.fillStyle = T.ink; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("radar", g.rx - 20, g.ry + 14);
      // velocity and its components
      const th = rad(S.th), L = S.v * g.sc;
      const dir = [Math.cos(th) * u[0] + Math.sin(th) * p[0], Math.cos(th) * u[1] + Math.sin(th) * p[1]];
      const tip = [g.tx + dir[0] * L, g.ty + dir[1] * L];
      const rL = S.v * Math.cos(th) * g.sc;
      const rTip = [g.tx + u[0] * rL, g.ty + u[1] * rL];
      if (S.v > 1) {
        ctx.save(); ctx.setLineDash([4, 4]); polyline(ctx, [rTip, tip], T.muted, 1.5); ctx.restore();
        if (Math.abs(rL) > 4) arrow(ctx, g.tx, g.ty, rTip[0], rTip[1], T.rx, 3, 10);
        // angle arc between the line of sight and the velocity
        if (L > 26) {
          const a0 = Math.atan2(u[1], u[0]), a1 = Math.atan2(dir[1], dir[0]);
          let da = a1 - a0; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
          ctx.strokeStyle = T.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(g.tx, g.ty, 22, a0, a0 + da, da < 0); ctx.stroke();
        }
        arrow(ctx, g.tx, g.ty, tip[0], tip[1], T.tgt, 3, 11);
      }
      drawPlane(ctx, g.tx, g.ty, Math.atan2(dir[1], dir[0]), T.tgt);
      // labels
      const lx = clamp(tip[0] + (dir[0] >= 0 ? 8 : -8), 4, w - 4);
      label(ctx, `v = ${num(S.v, 4)} m/s`, lx, clamp(tip[1], 12, hh - 12), { align: dir[0] >= 0 ? "left" : "right", color: T.tgt, bounds: w });
      label(ctx, `v_r = v cos θ = ${ms(D.vr)}`, 8, 14, { color: T.rx, bounds: w });
      label(ctx, `f_d = ${hz(D.fd)}`, 8, 36, { color: T.ink, bounds: w });
      label(ctx, `θ = ${num(S.th, 3)}°`, 8, 58, { color: T.muted, font: T.font, bounds: w });
      if (S.v >= 50 && Math.abs(D.vr) < 0.05 * S.v) label(ctx, "NOTCH: side-on, f_d ≈ 0", w - 8, 14, { align: "right", color: T.warn, bounds: w });
    }

    function drawPlane(ctx, x, y, a, color) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-11, -2.5); ctx.lineTo(-11, 2.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(-5, -11); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.lineTo(-5, 11); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-13, -5); ctx.lineTo(-13, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    function drawWave(ctx, w, hh) {
      const T = theme();
      const rho = 1 + (EXAG * 2 * D.vr) / C0;
      const cyc = clamp(w / 42, 8, 24);
      const rowH = (hh - 8) / 3;
      const rows = [
        [T.tx, (x) => Math.sin(TAU * (cyc * x - waveT)), `transmitted · f₀ = ${si(S.f0, "Hz", 4)}`],
        [T.rx, (x) => Math.sin(TAU * rho * (cyc * x - waveT)), `echo · f₀ ${D.fd >= 0 ? "+" : "−"} ${si(Math.abs(D.fd), "Hz", 3)}`],
        [T.c4, (x) => Math.cos(TAU * (rho - 1) * (cyc * x - waveT)), `mixer output · the Doppler beat, ${si(Math.abs(D.fd), "Hz", 3)}`],
      ];
      rows.forEach(([color, f, text], i) => {
        const y0 = 4 + i * rowH, mid = y0 + rowH / 2 + 6, amp = rowH * 0.3;
        ctx.strokeStyle = T.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
        const pts = [];
        const n = Math.round(w / 1.5);
        for (let k = 0; k <= n; k++) { const x = k / n; pts.push([x * w, mid - f(x) * amp]); }
        polyline(ctx, pts, color, 2);
        label(ctx, text, 6, y0 + 9, { color, bounds: w, font: T.font });
      });
    }

    function drawPhasor(ctx, w, hh) {
      const T = theme();
      const stack = w < 560;
      const cr = stack ? Math.min(w * 0.26, 82) : Math.min(hh * 0.3, 84);
      const cx = stack ? w / 2 : cr + 34, cy = stack ? cr + 22 : cr + 26;
      const r = D.fd / S.prf, rf = r - Math.floor(r), ra = D.fa / S.prf;
      const tp = phT * PULSE_RATE, n = Math.floor(tp);
      const phase = (m) => TAU * ((rf * m) % 1);
      const trueNow = TAU * ((r * (tp - n) + rf * n) % 1);
      const col = D.blind ? T.bad : D.flip ? T.bad : D.aliased ? T.warn : T.ok;
      // circle and axes
      ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - cr - 10, cy); ctx.lineTo(cx + cr + 10, cy); ctx.moveTo(cx, cy - cr - 10); ctx.lineTo(cx, cy + cr + 10); ctx.stroke();
      ctx.strokeStyle = T.axis; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.stroke();
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText("I", cx + cr + 12, cy); ctx.textAlign = "center"; ctx.fillText("Q", cx, cy - cr - 16);
      const P = (a, k = 1) => [cx + Math.cos(a) * cr * k, cy - Math.sin(a) * cr * k];
      // the true phasor between samples
      const spin = Math.abs(r) * PULSE_RATE;
      if (spin < 2.5) { const [x, y] = P(trueNow); polyline(ctx, [[cx, cy], [x, y]], alpha(T.muted, 0.8), 1.5); }
      else { ctx.strokeStyle = alpha(T.muted, 0.35); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, cr * 0.82, 0, TAU); ctx.stroke(); }
      // apparent step arc between the last two samples
      if (n >= 1 && Math.abs(ra) > 0.004) {
        const a0 = phase(n - 1), a1 = a0 + TAU * ra, k = 0.6;
        ctx.strokeStyle = col; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx, cy, cr * k, -a0, -a1, ra > 0); ctx.stroke();
        const [ex, ey] = P(a1, k), [bx, by] = P(a1 - Math.sign(ra) * 0.25, k);
        arrow(ctx, bx, by, ex, ey, col, 2.5, 9);
      }
      // samples
      for (let i = 6; i >= 0; i--) {
        const m = n - i;
        const [x, y] = P(phase(m));
        ctx.fillStyle = alpha(T.rx, 1 - i / 7.5);
        ctx.beginPath(); ctx.arc(x, y, i === 0 ? 7 : 5, 0, TAU); ctx.fill();
        if (i === 0) arrow(ctx, cx, cy, x, y, T.rx, 2.5, 9);
      }
      // words
      const tx = stack ? 12 : cx - cr - 22, ty = stack ? cy + cr + 26 : cy + cr + 22;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.font = T.fontB; ctx.fillStyle = T.ink;
      ctx.fillText(`true: ${num(r, 3)} turns per pulse`, tx, ty);
      ctx.fillStyle = col;
      const verdict = D.blind ? "looks stationary: blind speed" : D.flip ? `looks like ${num(ra, 2)} turn: wrong sign` : D.aliased ? `looks like ${num(ra, 2)} turn: aliased` : `looks like ${num(ra, 2)} turn: correct`;
      ctx.fillText(verdict, tx, ty + 18);
      // I-channel strip
      const sx0 = stack ? 44 : cx + cr + 56, sx1 = stack ? w - 14 : w - 60;
      const sy0 = stack ? ty + 48 : 30, sy1 = hh - 34;
      const span = 8;
      const X = (t) => sx0 + ((t - (tp - span)) / span) * (sx1 - sx0);
      const Y = (v) => (sy0 + sy1) / 2 - v * ((sy1 - sy0) / 2.4);
      ctx.strokeStyle = T.axis; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx0, Y(0)); ctx.lineTo(sx1, Y(0)); ctx.moveTo(sx0, sy0); ctx.lineTo(sx0, sy1); ctx.stroke();
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (let m = Math.ceil(tp - span); m <= tp; m++) ctx.fillText(String(m), X(m), sy1 + 4);
      ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText("pulse number", sx1, hh - 2);
      ctx.save(); ctx.translate(sx0 - 14, (sy0 + sy1) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("I = cos φ", 0, 0); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(sx0, sy0 - 4, sx1 - sx0, sy1 - sy0 + 8); ctx.clip();
      const cycles = Math.abs(r) * span, px = sx1 - sx0;
      if (cycles < px / 5) {
        const pts = [], K = Math.round(Math.min(2400, Math.max(px, cycles * 16)));
        for (let k = 0; k <= K; k++) {
          const t = tp - span + (span * k) / K, m = Math.floor(t);
          pts.push([X(t), Y(Math.cos(TAU * ((r * (t - m) + rf * m) % 1)))]);
        }
        polyline(ctx, pts, alpha(T.muted, 0.7), 1.2);
      } else {
        ctx.fillStyle = alpha(T.muted, 0.16); ctx.fillRect(sx0, Y(1), px, Y(-1) - Y(1));
      }
      // what the samples suggest
      const ap = [];
      for (let k = 0; k <= 200; k++) { const t = tp - span + (span * k) / 200; ap.push([X(t), Y(Math.cos(TAU * ra * t))]); }
      polyline(ctx, ap, col, 2, [6, 4]);
      for (let m = Math.ceil(tp - span); m <= tp; m++) {
        const v = Math.cos(phase(m));
        polyline(ctx, [[X(m), Y(0)], [X(m), Y(v)]], T.rx, 2);
        ctx.fillStyle = T.rx; ctx.beginPath(); ctx.arc(X(m), Y(v), 4.5, 0, TAU); ctx.fill();
      }
      ctx.restore();
      if (cycles >= px / 5) label(ctx, `true signal: ${num(Math.abs(r), 3)} cycles between samples`, sx0 + 6, sy0 + 2, { color: T.muted, font: T.font, bounds: w });
      else label(ctx, "dashed: the slowest wave through the samples", sx0 + 6, sy0 + 2, { color: col, font: T.font, bounds: w });
    }

    function drawSpec(ctx, w, hh) {
      const T = theme();
      if (!spec) return;
      const ext = S.repeats ? 1.5 : 0.5, half = ext * S.prf;
      const unit = half >= 2000 ? 1000 : 1;
      const P = axes(ctx, w, hh, { x: [-half, half], y: [-10, 75], xlabel: `Doppler frequency (${unit === 1000 ? "kHz" : "Hz"})`, ylabel: "dB above noise",
        xfmt: (v) => num(v / unit, 3), yfmt: (v) => `${v}`, pad: { t: 28, l: 46, b: 34 } });
      // velocity scale along the top
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      const vmax = (half * D.lam) / 2;
      for (const v of ticks(-vmax, vmax, Math.max(2, Math.floor((P.r - P.l) / 80)))) {
        const x = P.X((2 * v) / D.lam);
        ctx.fillRect(x, P.t - 4, 1, 4);
        ctx.fillText(num(v, 3), x, P.t - 5);
      }
      ctx.textAlign = "right"; ctx.fillText("m/s", w - 2, 12);
      if (S.repeats) {
        ctx.fillStyle = alpha(T.muted, 0.1);
        ctx.fillRect(P.l, P.t, P.X(-S.prf / 2) - P.l, P.b - P.t); ctx.fillRect(P.X(S.prf / 2), P.t, P.r - P.X(S.prf / 2), P.b - P.t);
      }
      P.clip();
      // MTI response
      if (S.mti) {
        const mf = (f) => 70 + 10 * Math.log10(Math.max(1e-9, Math.sin((Math.PI * f) / S.prf) ** 2));
        const pts = []; for (let k = 0; k <= 300; k++) { const f = -half + (2 * half * k) / 300; pts.push([P.X(f), P.Y(mf(f))]); }
        polyline(ctx, pts, T.muted, 1.5, [5, 4]);
      }
      const { NF, db } = spec;
      const copies = S.repeats ? [-1, 0, 1] : [0];
      ctx.fillStyle = alpha(T.accent, 0.12); ctx.beginPath(); ctx.moveTo(P.X(-half), P.Y(-10));
      const pts = [];
      for (const c of copies) for (let j = 0; j < NF; j++) {
        const f = ((j - NF / 2) / NF) * S.prf + c * S.prf;
        pts.push([P.X(f), P.Y(clamp(db[j], -10, 80))]);
      }
      pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(P.X(half), P.Y(-10)); ctx.closePath(); ctx.fill();
      polyline(ctx, pts, T.accent, 1.5);
      // target markers
      const appear = copies.map((c) => D.fa + c * S.prf);
      for (const f of appear) { ctx.save(); ctx.setLineDash([4, 3]); polyline(ctx, [[P.X(f), P.t], [P.X(f), P.b]], alpha(T.tgt, 0.8), 1.5); ctx.restore(); }
      P.unclip();
      if (S.clutter) label(ctx, "ground clutter", P.X(0) + 6, P.Y(68), { color: T.ink, bounds: w });
      const ty = P.Y(clamp(spec.tgtDb + 5, 8, 52));
      const tText = D.blind ? "target folded onto 0 Hz: blind speed" : D.aliased ? `target, folded from ${hz(D.fd)}` : "target";
      label(ctx, tText, P.X(D.fa) + (D.fa > 0 ? -6 : 6), ty, { align: D.fa > 0 ? "right" : "left", color: T.tgt, bounds: w });
      if (D.aliased) {
        if (Math.abs(D.fd) <= half) {
          ctx.save(); ctx.setLineDash([2, 3]); polyline(ctx, [[P.X(D.fd), P.t], [P.X(D.fd), P.b]], T.tgt, 2); ctx.restore();
          label(ctx, "true f_d", P.X(D.fd), P.Y(40), { align: "center", color: T.tgt, bounds: w });
        } else {
          const right = D.fd > 0, x = right ? P.r - 4 : P.l + 4;
          arrow(ctx, right ? x - 24 : x + 24, P.Y(30), x, P.Y(30), T.tgt, 2, 8);
          label(ctx, `true f_d = ${hz(D.fd)}`, right ? x - 28 : x + 28, P.Y(30), { align: right ? "right" : "left", color: T.tgt, bounds: w });
        }
      }
    }

    // ---- animation
    const waveAnim = api.track(animate((dt) => { waveT = (waveT + dt * 0.7) % 1e6; wave.redraw(); }, { target: wave.canvas, playing: !reducedMotion }));
    playButton(wave, waveAnim);
    const phAnim = api.track(animate((dt) => { phT += dt; ph.redraw(); }, { target: ph.canvas, playing: !reducedMotion }));
    playButton(ph, phAnim);

    changed();

    notes(root, "Background", [
      { title: "Where 2·v<sub>r</sub>/λ comes from", open: true, html:
        "<p>The echo's phase is set by the round-trip path, 2<i>R</i>. Each wavelength of path is one full turn of phase:</p>" +
        "<p class=\"eq\">φ = − <span class=\"frac\"><span>4π <i>R</i></span><span>λ</span></span> &nbsp;⇒&nbsp; <i>f</i><sub>d</sub> = <span class=\"frac\"><span>1</span><span>2π</span></span> <span class=\"frac\"><span>dφ</span><span>d<i>t</i></span></span> = <span class=\"frac\"><span>2 <i>v</i><sub>r</sub></span><span>λ</span></span> = <span class=\"frac\"><span>2 <i>v</i><sub>r</sub> <i>f</i><sub>0</sub></span><span><i>c</i></span></span></p>" +
        "<p>with <i>v</i><sub>r</sub> = −d<i>R</i>/d<i>t</i> (positive when closing). The exact relativistic factor is (<i>c</i> + <i>v</i>)/(<i>c</i> − <i>v</i>), but for anything slower than a spacecraft 1 + 2<i>v</i>/<i>c</i> is perfect. Only the radial component <i>v</i> cos θ matters; a target circling the radar at constant range has no Doppler at all.</p>" +
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Example</th><th>Band</th><th>Speed</th><th>Doppler</th></tr>" +
        "<tr><td>Weather radar, rain in a gust front</td><td>S, 2.8 GHz</td><td class=\"num\">20 m/s</td><td class=\"num\">373 Hz</td></tr>" +
        "<tr><td>Police speed gun, 100 km/h</td><td>K, 24.15 GHz</td><td class=\"num\">27.8 m/s</td><td class=\"num\">4.47 kHz</td></tr>" +
        "<tr><td>Airliner on approach</td><td>X, 10 GHz</td><td class=\"num\">70 m/s</td><td class=\"num\">4.67 kHz</td></tr>" +
        "<tr><td>Fighter head-on at Mach 2</td><td>X, 10 GHz</td><td class=\"num\">680 m/s</td><td class=\"num\">45.4 kHz</td></tr>" +
        "<tr><td>Tennis serve</td><td>Ka, 35 GHz</td><td class=\"num\">60 m/s</td><td class=\"num\">14 kHz</td></tr></table></div>" },
      { title: "CW radar: hearing the beat", html:
        "<p>The simplest Doppler radar transmits a continuous wave and mixes the echo with a sample of its own transmitter. The sum frequency is filtered away; the difference is <i>f</i><sub>d</sub>, an audio-frequency tone for most targets (early police radars literally played it through a speaker). A single real mixer can't tell approaching from receding, because cos(+ω<i>t</i>) = cos(−ω<i>t</i>); two mixers 90° apart (<b>I and Q</b>) recover the sign, which is why this lesson draws a phasor rather than a sine wave.</p>" +
        "<p>Pure CW radar measures speed very well and range not at all, because a continuous wave has no timing mark. Adding frequency modulation (FMCW, next lesson) brings range back.</p>" },
      { title: "Pulse-Doppler, aliasing and blind speeds", html:
        "<p>A pulsed radar samples each range cell once per pulse, so the Doppler signal is sampled at the PRF. By the Nyquist theorem, frequencies are only unambiguous within ±PRF/2, and anything outside folds back in:</p>" +
        "<p class=\"eq\"><i>f</i><sub>apparent</sub> = <i>f</i><sub>d</sub> − <i>k</i> · PRF, &nbsp; <i>k</i> = round(<i>f</i><sub>d</sub> / PRF) &nbsp;&nbsp; <i>v</i><sub>u</sub> = ± <span class=\"frac\"><span>λ · PRF</span><span>4</span></span></p>" +
        "<p>When <i>f</i><sub>d</sub> is an exact multiple of the PRF, the target folds onto 0 Hz. To a clutter filter that's indistinguishable from the ground, so the target is removed: a <b>blind speed</b>, <i>v</i><sub>b</sub> = <i>n</i> λ PRF / 2. Over <i>N</i> pulses the Doppler resolution is PRF/<i>N</i> (velocity resolution λ PRF / 2<i>N</i>), and the FFT's window decides how far the enormous clutter spike leaks into neighbouring bins.</p>" },
      { title: "The range–velocity trade and PRF modes", html:
        "<p>A low PRF gives a long unambiguous range <i>R</i><sub>u</sub> = <i>c</i>/(2 PRF) but a small <i>v</i><sub>u</sub>; a high PRF the reverse. Multiply them and the PRF cancels:</p>" +
        "<p class=\"eq\"><i>R</i><sub>u</sub> · <i>v</i><sub>u</sub> = <span class=\"frac\"><span><i>c</i></span><span>2 PRF</span></span> · <span class=\"frac\"><span>λ PRF</span><span>4</span></span> = <span class=\"frac\"><span><i>c</i> λ</span><span>8</span></span></p>" +
        "<p>At X band that's about 1.1 × 10<sup>6</sup> m²/s: for 680 m/s you can have only 1.65 km of unambiguous range. Longer wavelengths help, which is one reason weather radars use S band.</p>" +
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Mode</th><th>X-band PRF</th><th>Range</th><th>Velocity</th><th>Used for</th></tr>" +
        "<tr><td>Low PRF</td><td class=\"num\">0.25–4 kHz</td><td>unambiguous</td><td>highly ambiguous, many blind speeds</td><td>search, mapping, MTI</td></tr>" +
        "<tr><td>Medium PRF</td><td class=\"num\">8–30 kHz</td><td>ambiguous</td><td>ambiguous</td><td>fighter look-down, all-aspect</td></tr>" +
        "<tr><td>High PRF</td><td class=\"num\">100–300 kHz</td><td>highly ambiguous</td><td>unambiguous</td><td>long-range detection of closing targets</td></tr></table></div>" },
      { title: "MTI, pulse-Doppler and staggered PRF", html:
        "<p><b>MTI</b> (moving target indication) simply subtracts consecutive pulses. Its frequency response is</p>" +
        "<p class=\"eq\">|<i>H</i>(<i>f</i>)| = 2 |sin(π <i>f</i> / PRF)|</p>" +
        "<p>which nulls 0 Hz (the clutter) and, unavoidably, every multiple of the PRF (the blind speeds). Three-pulse cancellers (1 − 2<i>z</i><sup>−1</sup> + <i>z</i><sup>−2</sup>) give a wider, deeper notch. <b>Pulse-Doppler</b> radars go further: an FFT of the pulses gives a bank of Doppler filters, so each target is measured in its own bin and the clutter stays in its own.</p>" +
        "<p><b>Staggering</b> the PRF fills the blind speeds: a target blind at one PRF is visible at the other. With PRFs in the ratio <i>a</i>:<i>b</i> the first speed blind to both is <i>b</i> times the first blind speed of PRF<sub>1</sub> (1000 and 1250 Hz: 5×). Medium-PRF radars use several PRFs per look and the Chinese remainder theorem to untangle range and velocity ambiguities, and dual-PRF weather radars extend their Nyquist velocity the same way.</p>" },
      { title: "Micro-Doppler", html:
        "<p>Real targets aren't single points. Helicopter blades, jet-engine compressor stages, turning wheels and swinging arms and legs each add their own fluctuating Doppler around the body line. These <b>micro-Doppler</b> signatures, seen in a spectrogram, let a radar tell a walking person from a dog, a drone from a bird, or one aircraft type from another (jet engine modulation is used for non-cooperative target recognition).</p>" },
    ]);

    api.quiz(root, [
      { q: "An X-band radar (10 GHz) sees a target closing at 300 m/s. What is the Doppler shift?", options: ["10 kHz", "20 kHz", "2 kHz", "40 kHz"], answer: 1,
        why: "λ = 3 cm, so f<sub>d</sub> = 2 × 300 / 0.03 = 20 kHz. Forgetting the factor of 2 (out and back) gives 10 kHz." },
      { q: "An aircraft flies a circle around the radar at constant range. What Doppler shift does the radar see?", options: ["Large, because it is fast", "Zero, because the range isn't changing", "It flips sign every half circle", "It depends on the PRF"], answer: 1,
        why: "Doppler only measures the radial component of velocity. Side-on flight is the 'notch' that hides aircraft in a pulse-Doppler radar's clutter filter." },
      { q: "An X-band radar (λ = 3 cm) runs at a PRF of 2 kHz. What is its maximum unambiguous speed?", options: ["±60 m/s", "±30 m/s", "±15 m/s", "±7.5 m/s"], answer: 2,
        why: "v<sub>u</sub> = λ·PRF/4 = 0.03 × 2000 / 4 = 15 m/s. The first blind speed is twice that, λ·PRF/2 = 30 m/s." },
      { q: "A radar alternates between PRFs of 1000 Hz and 1250 Hz. Where is the first speed that is blind at both?", options: ["The same as at 1000 Hz", "1.25 × the 1000 Hz blind speed", "5 × the 1000 Hz blind speed", "There are no blind speeds any more"], answer: 2,
        why: "Both are blind where f<sub>d</sub> is a common multiple of 1000 and 1250 Hz. The first is 5000 Hz, 5 × the first blind Doppler at 1000 Hz. Staggering moves blind speeds far out but never removes them." },
    ]);
  },
};
