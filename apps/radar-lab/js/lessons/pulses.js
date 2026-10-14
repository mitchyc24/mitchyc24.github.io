// Lesson 2: a radar fires a train of pulses. The pulse width sets range resolution and the blind zone;
// the gap between pulses (PRI) sets how far the radar can see before echoes start landing in the wrong PRI.
import {
  h, C0, KB, T0, card, labGrid, group, notes, slider, check, readout, status, legend,
  canvasView, drag, axes, theme, alpha, label, dimension, arrow, num, si, km, pct, undb, clamp, rng,
} from "../ui.js";

const RECOV = 0.5e-6;                                           // receiver recovery after the transmitter stops, s
const RADAR = { g: undb(33), lambda: 0.1, f: undb(3), l: undb(4) }; // S-band (3 GHz) search radar, B = 1/τ
const RCS = { A: 5, B: 5, C: 100 };                             // two fighters and an airliner, m²
const MAX_DUTY = 0.5;

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "A real radar doesn't fire once: it fires a steady <b>train</b> of pulses, hundreds to hundreds of thousands a second, " +
      "and listens in the gaps. Two numbers describe the train: how long each pulse lasts and how long it waits before the next. " +
      "Between them they decide how finely the radar can separate targets, how close and how far it can see, and how hard the transmitter works." }));

    const S = { tau: 1e-6, prf: 1000, pt: 1e6, rA: 40e3, bOn: true, sep: 600, cOn: false, rC: 220e3 };
    let D = {};

    const tour = api.steps(root, [
      { title: "1 · A train of pulses", html:
        "<p>Each orange bar is one transmitted pulse, lasting the <b>pulse width</b> τ. Pulses repeat every <b>pulse repetition interval</b> (PRI) <i>T</i>; " +
        "the number per second is the <b>pulse repetition frequency</b>, PRF = 1/<i>T</i>. Between pulses the radar listens.</p>",
        look: "the timeline: three PRIs, each with a short transmit pulse and a long listening window containing the blue echoes of targets A and B.",
        apply: () => set({ tau: 1e-6, prf: 1000, pt: 1e6, rA: 40e3, bOn: true, sep: 600, cOn: false }) },
      { title: "2 · Long pulses blur targets together", html:
        "<p>A pulse τ long is a slab of energy <i>c</i>τ long in space. Its echo from target B overlaps A's echo unless B is at least half that slab further away, so the <b>range resolution</b> is</p>" +
        "<p class=\"eq\">Δ<i>R</i> = <span class=\"frac\"><span><i>c</i> τ</span><span>2</span></span></p><p>Here τ = 2 µs gives Δ<i>R</i> = 300 m, but the targets are only 200 m apart.</p>",
        look: "the zoom panel: one fat blob, not two blips.",
        apply: () => set({ tau: 2e-6, prf: 1000, rA: 40e3, bOn: true, sep: 200, cOn: false }) },
      { title: "3 · Short pulses resolve them", html:
        "<p>Cut the pulse to 0.5 µs: Δ<i>R</i> = 75 m, and the two echoes separate with a clear gap between them. Every microsecond of pulse costs 150 m of resolution.</p>" +
        "<p>The catch: a shorter pulse carries less energy (<i>P</i><sub>t</sub>·τ), so each echo is weaker. Lesson 6 shows how pulse compression gets both.</p>",
        look: "the gap in the zoom panel and the “resolved” status. The echo heights dropped by 6 dB.",
        apply: () => set({ tau: 0.5e-6, sep: 200 }) },
      { title: "4 · The blind zone", html:
        "<p>While it transmits, the receiver is switched off to protect it, and it needs a moment (here 0.5 µs) to recover. An echo that starts arriving before then is lost, so the radar is blind out to</p>" +
        "<p class=\"eq\"><i>R</i><sub>min</sub> ≈ <span class=\"frac\"><span><i>c</i> (τ + <i>t</i><sub>rec</sub>)</span><span>2</span></span></p><p>A 20 µs pulse blinds the radar for 3.1 km, so target A at 2 km vanishes.</p>",
        look: "the shaded blind zone on the A-scope and the hollow echo on the timeline: it came back while the transmitter was still on.",
        apply: () => set({ tau: 20e-6, prf: 1000, rA: 2e3, bOn: false, cOn: false }) },
      { title: "5 · Echoes from the previous pulse", html:
        "<p>The radar assumes every echo belongs to the most recent pulse. That only works if echoes return before the next pulse leaves, which sets the <b>maximum unambiguous range</b></p>" +
        "<p class=\"eq\"><i>R</i><sub>u</sub> = <span class=\"frac\"><span><i>c T</i></span><span>2</span></span> = <span class=\"frac\"><span><i>c</i></span><span>2 PRF</span></span></p>" +
        "<p>At 1 kHz, <i>R</i><sub>u</sub> = 150 km. Airliner C at 220 km answers pulse 1 during PRI 2, and the A-scope shows it at 220 − 150 = <b>70 km</b>: a <b>second-time-around</b> (range-folded) echo.</p>",
        look: "the purple echo and the arrow from the pulse that really caused it.",
        apply: () => set({ tau: 1e-6, prf: 1000, rA: 40e3, bOn: true, sep: 600, cOn: true, rC: 220e3 }) },
      { title: "6 · Duty cycle and average power", html:
        "<p>The transmitter is only on for a fraction <i>d</i> = τ/<i>T</i> = τ·PRF of the time, the <b>duty cycle</b>. The heat it makes and the energy on target depend on the <b>average power</b> <i>P</i><sub>avg</sub> = <i>P</i><sub>t</sub>·<i>d</i>.</p>" +
        "<p>A 1 µs, 1 kHz radar has a duty cycle of 0.1 %: a 1 MW transmitter averages only 1 kW. Here τ = 50 µs at 2 kHz gives 10 %.</p>",
        look: "the readouts, and how much of each PRI is now transmit time and blind zone.",
        apply: () => set({ tau: 50e-6, prf: 2000, pt: 1e5, rA: 40e3, bOn: false, cOn: false }) },
      { title: "7 · Picking a PRF is a trade", html:
        "<p>Push the PRF up to 20 kHz: <i>R</i><sub>u</sub> shrinks to 7.5 km and every target folds. So why would anyone do it? More pulses per second means more energy on target and, crucially, unambiguous <b>Doppler</b> measurement of fast targets (lesson 5). " +
        "Search radars use low PRF, airborne fighters medium, pulse-Doppler seekers high.</p>",
        look: "A at 40 km now appears at 40 − 5 × 7.5 = 2.5 km; it has folded five times.",
        apply: () => set({ tau: 1e-6, prf: 20000, pt: 1e6, rA: 40e3, bOn: false, cOn: false }) },
    ]);

    const lab = labGrid(root);

    // ---- pulse-train timeline
    const tlCard = card(lab.main, "Pulse train", "three PRIs on a time axis");
    const tl = api.track(canvasView(tlCard, { aspect: 2.8, minHeight: 220, maxHeight: 320, draw: drawTimeline, label: "Timeline of transmitted pulses and their echoes over three pulse repetition intervals" }));
    legend(tlCard, [[theme().tx, "transmit pulse"], [theme().rx, "echo of the latest pulse"], [theme().c4, "echo of an earlier pulse (range-folded)"], [theme().axis, "receiver off (blind)"]]);
    const tlCap = h("p", { class: "caption" });
    tlCard.append(tlCap);

    // ---- A-scope for one PRI + zoom
    const scCard = card(lab.main, "A-scope: one PRI", "drag target A");
    const sc = api.track(canvasView(scCard, { aspect: 3.2, minHeight: 180, maxHeight: 260, draw: drawScope, label: "A-scope trace of one pulse repetition interval, apparent range on the horizontal axis" }));
    drag(sc, {
      hit: (x) => sc.P && Math.abs(x - sc.P.X(D.tg[0].rApp / 1000)) < 22,
      move: (x) => { if (!sc.P) return; S.rA = clamp(sc.P.invX(x) * 1000, 100, 300e3); rASl.value = S.rA / 1000; changed(); },
    });
    scCard.append(h("h3", { class: "small", style: { margin: "14px 0 6px" } }, "Zoom on targets A and B"));
    const zm = api.track(canvasView(scCard, { aspect: 3.2, minHeight: 170, maxHeight: 240, draw: drawZoom, label: "Close-up of the echoes of targets A and B showing whether they are resolved" }));
    const resSt = status(scCard);

    // ---- controls
    const ctl = card(lab.side, "Controls");
    const g1 = group(ctl, "Pulse train");
    const tauSl = slider(g1, { label: "Pulse width τ", min: 0.1e-6, max: 100e-6, log: true, value: S.tau, format: (v) => si(v, "s"),
      onInput: (v) => { S.tau = v; if (S.tau * S.prf > MAX_DUTY) { S.prf = MAX_DUTY / S.tau; prfSl.value = S.prf; } changed(); } });
    const prfSl = slider(g1, { label: "PRF", min: 100, max: 100e3, log: true, value: S.prf, format: (v) => `${si(v, "Hz")} · PRI ${si(1 / v, "s")}`,
      onInput: (v) => { S.prf = v; if (S.tau * S.prf > MAX_DUTY) { S.tau = MAX_DUTY / S.prf; tauSl.value = S.tau; } changed(); },
      help: "Duty cycle is capped at 50 %: pushing one slider past it drags the other along." });
    const ptSl = slider(g1, { label: "Peak power <i>P</i><sub>t</sub>", min: 1e3, max: 10e6, log: true, value: S.pt, format: (v) => si(v, "W"), onInput: (v) => { S.pt = v; changed(); } });

    const g2 = group(ctl, "Targets");
    const rASl = slider(g2, { label: "Target A range", min: 0.1, max: 300, log: true, value: S.rA / 1000, format: (v) => km(v * 1000), onInput: (v) => { S.rA = v * 1000; changed(); } });
    const bChk = check(g2, { label: "Target B, just behind A", checked: S.bOn, onChange: (v) => { S.bOn = v; changed(); } });
    const sepSl = slider(g2, { label: "B's distance behind A", min: 10, max: 3000, log: true, value: S.sep, format: (v) => km(v), onInput: (v) => { S.sep = v; changed(); } });
    const cChk = check(g2, { label: "Far airliner C", checked: S.cOn, onChange: (v) => { S.cOn = v; changed(); } });
    const rCSl = slider(g2, { label: "Target C range", min: 10, max: 400, value: S.rC / 1000, step: 1, format: (v) => km(v * 1000), onInput: (v) => { S.rC = v * 1000; changed(); } });

    const outCard = card(lab.side, "Derived quantities");
    const ro = readout(outCard);

    const ch = api.challenges(root, [
      { id: "res150", text: "Resolve targets A and B when they are only 150 m apart.", check: (s) => s.bOn && s.sep <= 155 && s.resolved },
      { id: "ru300", text: "Make the maximum unambiguous range exceed 300 km.", check: (s) => s.Ru > 300e3 },
      { id: "fold", text: "Make airliner C show up as a second-time-around echo, at the wrong range.", check: (s) => s.cOn && s.tgC && s.tgC.fold >= 1 && s.tgC.vis },
      { id: "duty", text: "Push the duty cycle above 10 %. What does that do to the average power?", check: (s) => s.d > 0.1 },
      { id: "hide", text: "Hide target A (within 10 km) inside the blind zone.", check: (s) => s.rA <= 10e3 && !s.tgA.vis },
      { id: "close", text: "See target A at 200 m or closer: make it visible outside the blind zone.", check: (s) => s.rA <= 205 && s.tgA.vis && s.tgA.fold === 0 },
    ]);

    // ---- model
    function snrLin(r, rcs) {
      const { g, lambda, f, l } = RADAR;
      return (S.pt * g * g * lambda * lambda * rcs * S.tau) / ((4 * Math.PI) ** 3 * r ** 4 * KB * T0 * f * l);
    }
    function derive() {
      const T = 1 / S.prf, tau = S.tau, blank = tau + RECOV;
      D = { T, tau, blank, d: tau / T, pavg: (S.pt * tau) / T, energy: S.pt * tau, dR: (C0 * tau) / 2, rBlind: (C0 * blank) / 2, Ru: (C0 * T) / 2, tg: [] };
      const add = (key, r) => {
        const delay = (2 * r) / C0, fold = Math.floor(delay / T), tApp = delay - fold * T;
        D.tg.push({ key, r, delay, fold, tApp, rApp: (C0 * tApp) / 2, vis: tApp >= blank, snr: snrLin(r, RCS[key]), cut: tApp + tau > T });
      };
      add("A", S.rA);
      if (S.bOn) add("B", S.rA + S.sep);
      if (S.cOn) add("C", S.rC);
      D.resolved = resolveAB();
    }
    // Received video envelope: each echo is a trapezoid (edges rounded by the receiver's ~1/τ bandwidth).
    // Echoes from different targets add with a 90° phase difference, the average case, so powers add.
    function trap(x) {
      const tr = 0.25 * S.tau;
      if (x <= -tr / 2 || x >= S.tau + tr / 2) return 0;
      if (x < tr / 2) return (x + tr / 2) / tr;
      if (x > S.tau - tr / 2) return (S.tau + tr / 2 - x) / tr;
      return 1;
    }
    function envPow(t) { // received power (relative to noise) at apparent time t within one PRI
      if (t < D.blank || t >= D.T) return 0;
      let s = 0;
      for (const e of D.tg) if (e.vis) { const p = trap(t - e.tApp); s += e.snr * p * p; }
      return s;
    }
    function resolveAB() {
      const a = D.tg[0], b = D.tg.find((e) => e.key === "B");
      if (!b || !a.vis || !b.vis) return null;
      const t1 = Math.min(a.tApp, b.tApp) + S.tau / 2, t2 = Math.max(a.tApp, b.tApp) + S.tau / 2;
      if (t2 - t1 < 1e-12) return false;
      const p1 = Math.sqrt(envPow(t1)), p2 = Math.sqrt(envPow(t2));
      let lo = Infinity;
      for (let i = 1; i < 200; i++) lo = Math.min(lo, Math.sqrt(envPow(t1 + ((t2 - t1) * i) / 200)));
      return lo < 0.5 * Math.min(p1, p2);
    }

    function set(cfg) {
      Object.assign(S, cfg);
      if (S.tau * S.prf > MAX_DUTY) S.prf = MAX_DUTY / S.tau;
      tauSl.value = S.tau; prfSl.value = S.prf; ptSl.value = S.pt; rASl.value = S.rA / 1000;
      bChk.checked = S.bOn; sepSl.value = S.sep; cChk.checked = S.cOn; rCSl.value = S.rC / 1000;
      changed();
    }

    function changed() {
      derive();
      sepSl.el.style.display = S.bOn ? "" : "none";
      rCSl.el.style.display = S.cOn ? "" : "none";
      const tgRow = (e) => {
        const name = e.key === "C" ? "C (airliner)" : e.key;
        if (!e.vis) return [`${name}`, `${km(e.r)} → blind`, "bad"];
        const app = e.fold ? `${km(e.r)} → shows at ${km(e.rApp)}` : `${km(e.r)} · ${num(10 * Math.log10(e.snr), 3)} dB`;
        return [`${name}`, app, e.fold ? "warn" : null];
      };
      ro.set([
        ["PRI <i>T</i> = 1/PRF", si(D.T, "s")],
        ["Duty cycle τ/<i>T</i>", pct(D.d), D.d > 0.1 ? "warn" : null],
        ["Average power", si(D.pavg, "W")],
        ["Energy per pulse", si(D.energy, "J")],
        ["Resolution <i>c</i>τ/2", km(D.dR)],
        ["Blind range", km(D.rBlind)],
        ["Unambiguous range", km(D.Ru)],
        ...D.tg.map(tgRow),
      ]);
      const a = D.tg[0], b = D.tg.find((e) => e.key === "B");
      if (!S.bOn) resSt.set("info", "Target B is switched off.", " Tick “Target B” to test range resolution.");
      else if (!a.vis || !b.vis) resSt.set("warn", "Can't judge resolution:", ` ${!a.vis ? "A" : "B"} is in the blind zone.`);
      else if (a.fold !== b.fold) resSt.set("warn", "A and B fold into different places.", " B is beyond the unambiguous range but A isn't, so they appear far apart.");
      else if (D.resolved) resSt.set("ok", "Resolved: two separate echoes.", ` ${km(S.sep)} apart is more than cτ/2 = ${km(D.dR)}.`);
      else resSt.set("bad", "Not resolved: the echoes merge into one blob.", ` ${km(S.sep)} apart is less than cτ/2 = ${km(D.dR)}. Shorten the pulse.`);
      ch.update({ ...S, ...D, tgA: D.tg[0], tgC: D.tg.find((e) => e.key === "C") });
      tl.redraw(); sc.redraw(); zm.redraw();
    }

    // ---- drawing helpers
    const R = rng(3);
    const grass = Float64Array.from({ length: 1400 }, () => -Math.log(1 - R() * 0.999)); // exponential noise power, mean 1
    const dbv = (p) => 10 * Math.log10(p);
    const Y_TOP = 70;

    function curveArrow(ctx, x0, y0, x1, y1, color, lift) {
      const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - lift;
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x0, y0);
      // stop short of the end, then finish with a solid arrowhead along the tangent
      const tEnd = 0.92, qx = (t) => (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, qy = (t) => (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      for (let i = 1; i <= 30; i++) { const t = (i / 30) * tEnd; ctx.lineTo(qx(t), qy(t)); }
      ctx.stroke(); ctx.restore();
      arrow(ctx, qx(tEnd), qy(tEnd), x1, y1, color, 1.6, 8);
    }

    function drawTimeline(ctx, w, hh) {
      const T = theme();
      const span = 3 * D.T, t0 = -0.035 * span, t1 = 1.035 * span;
      const l = 14, r = w - 14, base = hh - 30, top = 40;
      const X = (t) => l + ((t - t0) / (t1 - t0)) * (r - l);
      const pxPerS = (r - l) / (t1 - t0);
      const txH = (base - top) * 0.78;
      const minW = 3, tauPx = Math.max(minW, S.tau * pxPerS), blankPx = Math.max(minW + 2, D.blank * pxPerS);
      const exaggerated = S.tau * pxPerS < minW;
      // axis + PRI ticks
      ctx.strokeStyle = T.axis; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(l, base + 0.5); ctx.lineTo(r, base + 0.5); ctx.stroke();
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (let k = 0; k <= 3; k++) {
        const x = X(k * D.T);
        ctx.fillRect(x, base, 1, 5);
        ctx.fillText(k === 0 ? "0" : si(k * D.T, "s"), clamp(x, l + 10, r - 18), base + 7);
      }
      // listening windows + blind periods + pulses
      for (let k = 0; k <= 3; k++) {
        const x = X(k * D.T);
        if (k < 3) {
          ctx.fillStyle = alpha(T.rx, T.dark ? 0.08 : 0.06);
          ctx.fillRect(x + blankPx, top - 4, X((k + 1) * D.T) - x - blankPx, base - top + 4);
        }
        ctx.fillStyle = alpha(T.axis, 0.35);
        ctx.fillRect(x, base - txH - 6, Math.min(blankPx, r - x), txH + 6);
        ctx.fillStyle = T.tx;
        ctx.fillRect(x, base - txH, Math.min(tauPx, r - x), txH);
      }
      if ((X(D.T) - X(0)) > 150) {
        ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "right"; ctx.textBaseline = "top";
        ctx.fillText("listening", X(D.T) - 8, top + 2);
      }
      // echoes: every pulse k produces an echo at kT + delay
      const eH = (snr) => clamp((10 * Math.log10(Math.max(snr, 1)) / 45), 0.15, 1) * txH * 0.6;
      const labels = [];
      for (const e of D.tg) {
        const kMin = -Math.ceil(e.delay / D.T) - 1;
        for (let k = Math.max(kMin, -400); k <= 3; k++) {
          const t = k * D.T + e.delay;
          if (t < t0 || t > t1) continue;
          const x = X(t), ht = eH(e.snr), col = e.fold ? T.c4 : T.rx;
          if (e.vis) { ctx.fillStyle = col; ctx.fillRect(x, base - ht, Math.max(2.5, S.tau * pxPerS), ht); }
          else { ctx.strokeStyle = col; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.strokeRect(x + 0.5, base - ht, Math.max(3, S.tau * pxPerS), ht); ctx.setLineDash([]); }
          labels.push({ x, y: base - ht - 8, key: e.key, col, k, e });
        }
      }
      // merge labels that would collide
      labels.sort((a, b) => a.x - b.x);
      ctx.font = T.fontB; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      let lastX = -1e9, lastY = 0;
      for (const L of labels) {
        if (L.x - lastX < 14 && Math.abs(L.y - lastY) < 14) continue;
        ctx.fillStyle = L.col; ctx.fillText(L.key, L.x + 2, L.y + 4);
        lastX = L.x; lastY = L.y;
      }
      // arrows from the pulse that really caused a folded (or plain) echo
      for (const e of D.tg) {
        if (e.key === "B") continue;
        const k = 0;
        const t = k * D.T + e.delay;
        if (t > t1) {
          if (e.fold) label(ctx, `${e.key}: echo lands ${e.fold} PRIs after its pulse`, X(0) + 10, top - 22, { color: T.c4, bounds: w });
          continue;
        }
        const ht = eH(e.snr);
        curveArrow(ctx, X(k * D.T) + tauPx / 2, base - txH - 8, X(t) + 1, base - ht - 20, e.fold ? T.c4 : alpha(T.rx, 0.7), e.fold ? 34 : 18);
      }
      // dimension arrows
      const yT = top - 20;
      dimension(ctx, X(2 * D.T), yT + 4, X(3 * D.T), yT + 4, `T = ${si(D.T, "s")}`, T.ink);
      const tx0 = X(2 * D.T);
      const tauTxt = `τ = ${si(S.tau, "s")}${exaggerated ? " (drawn wider)" : ""}`;
      if (tauPx > 46) dimension(ctx, tx0, base - txH - 14, tx0 + tauPx, base - txH - 14, tauTxt, T.tx);
      else label(ctx, tauTxt, tx0 + tauPx + 6, base - txH * 0.8, { color: T.tx, bounds: w });
      const a = D.tg[0];
      if (!a.vis) label(ctx, `A's echo returns while the receiver is off: lost`, X(D.T) + blankPx + 8, base - txH * 0.45, { color: T.bad, bounds: w });
      tlCap.textContent = exaggerated
        ? `At this scale a ${si(S.tau, "s")} pulse would be ${num(S.tau * pxPerS, 2)} px wide, so pulses and echoes are drawn wider than true scale. The transmitter is on for only ${pct(D.d)} of the time.`
        : `Pulses and echoes are drawn to scale: the transmitter is on for ${pct(D.d)} of the time.`;
    }

    function scopeLabel(ctx, text, x, y, color, w) { label(ctx, text, x, y, { align: "center", color, bg: alpha("#000000", 0.6), bounds: w }); }

    function drawScope(ctx, w, hh) {
      const T = theme();
      const P = axes(ctx, w, hh, { x: [0, D.Ru / 1000], y: [0, Y_TOP], dark: true, xlabel: "apparent range (km)", ylabel: "dB", pad: { l: 40, b: 32, t: 10 } });
      sc.P = P;
      // blind zone
      const xb = Math.max(P.X(D.rBlind / 1000), P.l + 3);
      ctx.fillStyle = alpha(T.scopeFg, 0.16); ctx.fillRect(P.l, P.t, xb - P.l, P.b - P.t);
      // trace: noise grass + echoes, per pixel column (max over the column's time span)
      const n = Math.max(2, Math.floor(P.r - P.l));
      const col = new Float64Array(n);
      for (let i = 0; i < n; i++) col[i] = (D.blank / D.T) * n > i ? 0 : grass[i % grass.length];
      for (const e of D.tg) {
        if (!e.vis) continue;
        const i0 = Math.floor((e.tApp / D.T) * n), i1 = Math.min(n - 1, Math.floor(((e.tApp + S.tau) / D.T) * n));
        for (let i = i0; i <= Math.max(i0 + 1, i1) && i < n; i++) col[i] = Math.max(col[i], e.snr + grass[i % grass.length]);
      }
      ctx.strokeStyle = T.scopeFg; ctx.lineWidth = 1.4; ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const y = P.Y(clamp(col[i] > 0 ? dbv(col[i]) : 0, 0, Y_TOP));
        i ? ctx.lineTo(P.l + i, y) : ctx.moveTo(P.l + i, y);
      }
      ctx.stroke();
      // transmit spike (blanked)
      ctx.fillStyle = alpha(T.scopeFg, 0.5); ctx.fillRect(P.l, P.t, Math.max(2, (S.tau / D.T) * (P.r - P.l)), P.b - P.t);
      ctx.font = T.font;
      scopeLabel(ctx, D.rBlind / D.Ru > 0.06 ? `blind ${km(D.rBlind)}` : "TX + blind", Math.max(P.l + 44, (P.l + xb) / 2), P.t + 12, T.scopeText, w);
      // target labels
      const items = D.tg.map((e) => ({ e, x: P.X(e.rApp / 1000), y: P.Y(clamp(dbv(e.snr + 1), 0, Y_TOP)) - 14 }));
      let prevX = -1e9;
      for (const it of items.sort((a, b) => a.x - b.x)) {
        const { e } = it;
        let text = e.vis ? (e.fold ? `${e.key}? really ${km(e.r)}` : e.key) : `${e.key} hidden`;
        if (it.x - prevX < 40 && e.key === "B") continue;
        if (e.key === "A" && S.bOn && D.tg[1] && Math.abs(P.X(D.tg[1].rApp / 1000) - it.x) < 40 && D.tg[1].vis === e.vis) text = e.vis ? "A + B" : "A, B hidden";
        if (!e.vis) it.y = P.b - 14;
        scopeLabel(ctx, text, it.x, Math.max(P.t + 32, it.y), e.fold ? (T.dark ? T.c4 : "#B9A4FF") : T.scopeFg, w);
        prevX = it.x;
      }
    }

    function drawZoom(ctx, w, hh) {
      const T = theme();
      const a = D.tg[0];
      const pad = Math.max(2 * D.dR, 0.4 * S.sep, 60);
      const x0 = -pad, x1 = (S.bOn ? S.sep : 0) + D.dR + pad;
      const P = axes(ctx, w, hh, { x: [x0, x1], y: [0, Y_TOP], dark: true, xlabel: "range behind A (m)", ylabel: "dB", pad: { l: 40, b: 32, t: 10 } });
      const n = Math.max(2, Math.floor(P.r - P.l));
      const tA = a.tApp;
      ctx.strokeStyle = T.scopeFg; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const dr = x0 + ((x1 - x0) * i) / n;
        const t = tA + (2 * dr) / C0;
        const blanked = t < D.blank || t >= D.T;
        const p = blanked ? 0 : envPow(t) + grass[(i * 7) % grass.length];
        const y = P.Y(clamp(p > 0 ? dbv(p) : 0, 0, Y_TOP));
        i ? ctx.lineTo(P.l + i, y) : ctx.moveTo(P.l + i, y);
      }
      ctx.stroke();
      // blanked part of this window
      const xBl = P.X(((D.blank - tA) * C0) / 2);
      if (xBl > P.l) { ctx.fillStyle = alpha(T.scopeFg, 0.16); ctx.fillRect(P.l, P.t, Math.min(xBl, P.r) - P.l, P.b - P.t); scopeLabel(ctx, "blind", (P.l + Math.min(xBl, P.r)) / 2, P.t + 12, T.scopeText, w); }
      // true positions of A and B, and the resolution cell
      const mark = (dr, txt) => {
        const x = P.X(dr);
        ctx.strokeStyle = alpha(T.scopeText, 0.6); ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, P.t + 24); ctx.lineTo(x, P.b); ctx.stroke(); ctx.setLineDash([]);
        scopeLabel(ctx, txt, x, P.t + 14, T.scopeText, w);
      };
      mark(0, "A");
      if (S.bOn && D.tg[1] && D.tg[1].fold === a.fold) mark(S.sep, "B");
      const yd = P.b - 18;
      if (P.X(D.dR) - P.X(0) > 30) {
        arrow(ctx, (P.X(0) + P.X(D.dR)) / 2, yd, P.X(0), yd, T.scopeText, 1.5, 7);
        arrow(ctx, (P.X(0) + P.X(D.dR)) / 2, yd, P.X(D.dR), yd, T.scopeText, 1.5, 7);
        label(ctx, `cτ/2 = ${km(D.dR)}`, P.X(D.dR) + 6, yd, { color: T.scopeText, bg: alpha("#000000", 0.6), bounds: w });
      }
      if (!a.vis) scopeLabel(ctx, "A is in the blind zone", (P.l + P.r) / 2, (P.t + P.b) / 2, "#FF8A8A", w);
    }

    changed();
    void tour;

    notes(root, "Background", [
      { title: "The pulse train in numbers", open: true, html:
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Quantity</th><th>Formula</th><th>Example (1 µs, 1 kHz, 1 MW)</th></tr>" +
        "<tr><td>Pulse repetition interval</td><td><i>T</i> = 1 / PRF</td><td class=\"num\">1 ms</td></tr>" +
        "<tr><td>Duty cycle</td><td><i>d</i> = τ / <i>T</i> = τ · PRF</td><td class=\"num\">0.001 (0.1 %)</td></tr>" +
        "<tr><td>Average power</td><td><i>P</i><sub>avg</sub> = <i>P</i><sub>t</sub> · <i>d</i></td><td class=\"num\">1 kW</td></tr>" +
        "<tr><td>Pulse energy</td><td><i>E</i> = <i>P</i><sub>t</sub> · τ</td><td class=\"num\">1 J</td></tr>" +
        "<tr><td>Range resolution</td><td>Δ<i>R</i> = <i>c</i>τ / 2</td><td class=\"num\">150 m</td></tr>" +
        "<tr><td>Blind range</td><td><i>R</i><sub>min</sub> ≈ <i>c</i>(τ + <i>t</i><sub>rec</sub>) / 2</td><td class=\"num\">≈ 225 m</td></tr>" +
        "<tr><td>Unambiguous range</td><td><i>R</i><sub>u</sub> = <i>c T</i> / 2 = <i>c</i> / (2 PRF)</td><td class=\"num\">150 km</td></tr></table></div>" +
        "<p>Detection depends on the <b>energy</b> in the echo, not the peak power, which is why the simulation's echoes get weaker when you shorten the pulse. Its radar is a 3 GHz search set with 33 dBi gain, 3 dB noise figure, 4 dB losses, a receiver bandwidth of 1/τ and 0.5 µs of recovery time; A and B are 5 m² fighters and C is a 100 m² airliner. The full radar equation is lesson 3.</p>" },
      { title: "Range resolution and bandwidth", html:
        "<p>Two echoes can be told apart only if one ends before the other begins. The pulse travels out and back, so targets Δ<i>R</i> apart produce echoes 2Δ<i>R</i>/<i>c</i> apart in time; they just separate when that equals τ, giving Δ<i>R</i> = <i>c</i>τ/2.</p>" +
        "<p>A pulse τ long occupies a bandwidth <i>B</i> ≈ 1/τ, so the same result is usually written</p><p class=\"eq\">Δ<i>R</i> = <span class=\"frac\"><span><i>c</i></span><span>2<i>B</i></span></span></p>" +
        "<p>That form is the deeper one: resolution comes from <b>bandwidth</b>, not pulse length as such. Pulse compression (lesson 6) sweeps the frequency across a long pulse to get a big bandwidth and a fine resolution while keeping the energy of the long pulse.</p>" +
        "<p class=\"small muted\">In the simulation each echo is a pulse with edges rounded by the receiver's bandwidth, and the two echoes add with a 90° phase difference (the average case: real echoes beat with their relative phase, so an unresolved blob flickers). It calls the pair resolved when the trace dips below half amplitude (−6 dB) between them, which needs a little more than <i>c</i>τ/2.</p>" },
      { title: "The blind zone and eclipsing", html:
        "<p>A monostatic radar shares one antenna between transmitter and receiver through a <b>duplexer</b>. While a megawatt pulse goes out, a transmit/receive switch shorts the receiver input to protect it, and it takes a little time (<i>t</i><sub>rec</sub>, often a fraction of a microsecond to a few microseconds) to recover. An echo that starts arriving in that time is lost, so nothing closer than <i>R</i><sub>min</sub> ≈ <i>c</i>(τ + <i>t</i><sub>rec</sub>)/2 can be seen.</p>" +
        "<p>The same thing happens to echoes from far targets that happen to arrive while a <em>later</em> pulse is being transmitted: they are <b>eclipsed</b>. In high-duty-cycle (high-PRF) radars eclipsing blanks a large fraction of all ranges, which is one more reason they switch between several PRFs.</p>" +
        "<p class=\"small muted\">Simplification: here an echo whose leading edge falls inside the blind time is treated as lost. A real receiver might see part of its tail, at reduced strength; a pulse-compression receiver loses it entirely.</p>" },
      { title: "Unambiguous range and second-time-around echoes", html:
        "<p>The receiver times each echo from the most recent pulse. A target beyond <i>R</i><sub>u</sub> = <i>cT</i>/2 sends its echo back after the next pulse has gone, so it is timed from the wrong pulse and appears at</p>" +
        "<p class=\"eq\"><i>R</i><sub>apparent</sub> = <i>R</i> − <i>n R</i><sub>u</sub>, &nbsp; <i>n</i> = ⌊<i>R</i> / <i>R</i><sub>u</sub>⌋</p>" +
        "<p>These <b>range-folded</b> or <b>multiple-time-around</b> echoes are steady from PRI to PRI, so on a constant-PRF radar they look exactly like real close targets. Large, distant objects (mountains, storms, big ships, the Moon for powerful radars) are the usual culprits.</p>" },
      { title: "Beating the ambiguity: staggered and multiple PRFs", html:
        "<p><b>PRI stagger or jitter.</b> If the PRI changes from pulse to pulse, a true echo stays at the same delay after its own pulse, but a folded echo is timed from a different pulse each time and jumps about. The processor can reject anything that doesn't line up.</p>" +
        "<p><b>Several PRFs and the Chinese remainder theorem.</b> Measure the apparent range at two (or more) PRFs. The true range must be consistent with both. Example: with <i>R</i><sub>u1</sub> = 50 km a target appears at 20 km, and with <i>R</i><sub>u2</sub> = 60 km it appears at 30 km. Candidates for the first are 20, 70, 120, 170, 220, 270 km…; only 270 km also leaves 30 km after removing whole multiples of 60 km. The pair is unambiguous out to the least common multiple, 300 km. Airborne medium-PRF radars typically cycle through 3-of-8 PRF schedules this way.</p>" },
      { title: "Low, medium or high PRF?", html:
        "<p>A higher PRF gives more pulses, more average power and unambiguous Doppler for fast targets, but a shorter unambiguous range. No single PRF does everything, so radars pick a regime:</p>" +
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Regime</th><th>Typical PRF</th><th>Duty cycle</th><th>Range</th><th>Doppler</th><th>Used by</th></tr>" +
        "<tr><td>Low (LPRF)</td><td class=\"num\">0.25–4 kHz</td><td class=\"num\">0.1–1 %</td><td>unambiguous</td><td>ambiguous</td><td>long-range search, ATC, weather</td></tr>" +
        "<tr><td>Medium (MPRF)</td><td class=\"num\">8–30 kHz</td><td class=\"num\">1–10 %</td><td>ambiguous</td><td>ambiguous</td><td>fighter radars looking down into clutter</td></tr>" +
        "<tr><td>High (HPRF)</td><td class=\"num\">100–300 kHz</td><td class=\"num\">10–50 %</td><td>very ambiguous</td><td>unambiguous</td><td>long-range detection of fast closing targets, missile seekers</td></tr></table></div>" +
        "<p>Transmitter technology matters too: magnetrons and klystrons like high peak power at low duty cycle, while solid-state amplifiers have modest peak power and run at high duty cycle with long (compressed) pulses.</p>" },
    ]);

    api.quiz(root, [
      { q: "A radar's PRF is 2 kHz. What is its maximum unambiguous range?", options: ["150 km", "75 km", "300 km", "37.5 km"], answer: 1, why: "R<sub>u</sub> = c/(2·PRF) = 3×10⁸ / 4000 = 75 km." },
      { q: "Which pulse width can separate two aircraft flying 100 m apart in range?", options: ["2 µs", "1 µs", "0.5 µs", "Any: resolution doesn't depend on pulse width"], answer: 2, why: "ΔR = cτ/2: 0.5 µs gives 75 m, finer than 100 m. 1 µs gives 150 m and 2 µs gives 300 m." },
      { q: "A 1 MW peak transmitter sends 1 µs pulses at 1 kHz. What is its average power?", options: ["1 MW", "1 kW", "1 W", "500 kW"], answer: 1, why: "Duty cycle = 1 µs × 1000 /s = 0.001, so P<sub>avg</sub> = 1 MW × 0.001 = 1 kW." },
      { q: "With a PRF of 1 kHz, a mountain 190 km away shows up on the display at…", options: ["190 km", "40 km", "150 km", "It can't be seen"], answer: 1, why: "R<sub>u</sub> = 150 km, so the echo arrives during the next PRI and is timed from the wrong pulse: 190 − 150 = 40 km." },
    ]);
  },
};
