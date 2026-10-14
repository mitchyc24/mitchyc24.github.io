// Lesson 9: is that blip a target or just noise? Thresholds, Pd vs Pfa, clutter, CA-CFAR and pulse integration,
// on a live range profile with exact detection theory (Marcum Q) alongside.
import {
  h, card, labGrid, group, notes, slider, choice, check, button, readout, legend,
  canvasView, drag, animate, playButton, axes, theme, alpha, label, polyline, num, km, pct, db, undb, clamp, rng, gauss, TAU, reducedMotion,
} from "../ui.js";

const M = 320;              // range cells
const CELL = 150;           // m per cell (1 µs pulse)
const DWELL_HZ = 4;         // new dwells per second while playing
const RAIN = [178, 242];    // cell span of the rain cloud
const LAND = 50;            // ground clutter from cell 0 to here
const TG = [                // target cells; A's SNR is set by a slider
  { key: "A", cell: 72, snr: 13 },
  { key: "B", cell: 128, snr: 6 },
  { key: "C", cell: 212, snr: 15 },
  { key: "D", cell: 286, snr: 20 },
];
const SC = { thr: "#FFD43B", fa: "#FF6B6B", clutter: "#5AA2F5", win: "#B9A4FF" }; // overlays on the (always dark) scope

// ---------------------------------------------------------------- detection theory
function lnGamma(x) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(TAU) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
/** Regularised upper incomplete gamma Q(a, x) = P(Gamma(a,1) > x). */
function gammq(a, x) {
  if (x <= 0) return 1;
  const lnPre = a * Math.log(x) - x - lnGamma(a);
  if (x < a + 1) { // series for P
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 2000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
    return Math.max(0, 1 - sum * Math.exp(lnPre));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, f = d; // Lentz continued fraction for Q
  for (let i = 1; i < 2000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; f *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(lnPre) * f;
}
/**
 * Generalised Marcum Q: Q_M(a, b) = P(X > b²) where X is noncentral chi-square with 2M degrees of freedom and
 * noncentrality a². Computed as a Poisson-weighted sum of central chi-square tails (incomplete gamma), with the
 * gamma tails stepped by the recurrence Q(m+1, y) = Q(m, y) + y^m e^(−y) / m!.
 */
function marcumQ(Mdeg, a, b) {
  const lam = a * a, x = b * b;
  const mean = 2 * Mdeg + lam, sd = Math.sqrt(4 * Mdeg + 4 * lam);
  if (x < mean - 9 * sd) return 1;
  if (x > mean + 14 * sd) return 0;
  const y = x / 2;
  if (lam === 0) return gammq(Mdeg, y);
  const mu = lam / 2, s = Math.sqrt(mu);
  const jlo = Math.max(0, Math.floor(mu - 9 * s - 5)), jhi = Math.ceil(mu + 9 * s + 5);
  let Q = gammq(Mdeg + jlo, y), sum = 0;
  const lmu = Math.log(mu), ly = Math.log(y);
  for (let j = jlo; j <= jhi; j++) {
    sum += Math.exp(-mu + j * lmu - lnGamma(j + 1)) * Q;
    if (y > 0) Q = Math.min(1, Q + Math.exp((Mdeg + j) * ly - y - lnGamma(Mdeg + j + 1)));
  }
  return clamp(sum, 0, 1);
}
// Square-law detector, N pulses averaged, noise power 1. Per pulse: x = s + n, n ~ CN(0, 1), |s|² = SNR.
const pfaFixed = (T, N) => gammq(N, N * T);
const pdFixed = (snr, T, N) => marcumQ(N, Math.sqrt(2 * N * snr), Math.sqrt(2 * N * T));
function bisect(f, lo, hi, it = 70) { for (let i = 0; i < it; i++) { const m = (lo + hi) / 2; if (f(m)) lo = m; else hi = m; } return (lo + hi) / 2; }
const thrForPfa = (pfa, N) => bisect((T) => pfaFixed(T, N) > pfa, 1e-4, 200);
// CA-CFAR with n training cells: threshold α × (mean of training cells). Exact Pfa for N-pulse square-law averaging.
function pfaCA(alphaV, n, N) {
  const K = N * n, c = alphaV / n;
  let s = 0;
  for (let k = 0; k < N; k++) s += Math.exp(lnGamma(K + k) - lnGamma(K) - lnGamma(k + 1) + k * Math.log(c) - (K + k) * Math.log1p(c));
  return s;
}
const alphaCache = new Map();
function alphaFor(pfa, n, N) {
  const key = `${pfa}|${n}|${N}`;
  if (!alphaCache.has(key)) alphaCache.set(key, Math.exp(bisect((la) => pfaCA(Math.exp(la), n, N) > pfa, Math.log(1e-3), Math.log(1e6))));
  return alphaCache.get(key);
}
// Pd of CA-CFAR in uniform noise: average the fixed-threshold Pd over the random noise estimate S ~ Gamma(N·n).
function pdCA(snr, alphaV, n, N) {
  const K = N * n, c = alphaV / n, sd = Math.sqrt(K);
  const lo = Math.max(1e-6, K - 8 * sd), hi = K + 9 * sd, P = 36;
  let sw = 0, s = 0;
  for (let i = 0; i <= P; i++) {
    const S = lo + ((hi - lo) * i) / P;
    const w = Math.exp((K - 1) * Math.log(S) - S - lnGamma(K));
    sw += w; s += w * marcumQ(N, Math.sqrt(2 * N * snr), Math.sqrt(2 * c * S));
  }
  return s / sw;
}

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "Every radar receiver is full of noise, and echoes are faint. Deciding whether a blip is a target is a statistical bet: " +
      "set a threshold, call everything above it a detection, and accept that you will sometimes miss real targets and sometimes " +
      "raise false alarms. This lesson shows how to make that bet well, even when rain or ground clutter changes the odds." }));

    const S = { thrDb: 11, cfar: false, pfa: 1e-4, guard: 2, train: 12, rain: false, land: false, clDb: 20, snrA: 13, n: 1 };
    const R = rng(9);
    let z = new Float64Array(M), clutter = new Float64Array(M), thr = new Float64Array(M);
    let det = [], tally, hover = null;
    const targetAt = new Map();
    const resetTally = () => { tally = { dwells: 0, hits: { A: 0, B: 0, C: 0, D: 0 }, fa: 0, faCl: 0, faLast: 0 }; };
    resetTally();

    const tour = api.steps(root, [
      { title: "1 · Noise is random", html:
        "<p>Thermal noise in the receiver has Gaussian I and Q components, so its <b>envelope</b> follows a <b>Rayleigh</b> distribution and its power an exponential one. On a dB display it is a spiky “grass” around 0 dB (the mean noise power), with occasional spikes 10 dB or more above it.</p>",
        look: "the grass changing every dwell. Target A sits at cell 72 with an SNR of 13 dB, and it fluctuates too, because noise adds to it.",
        apply: () => set({ thrDb: 20 }) },
      { title: "2 · Set a threshold", html:
        "<p>Anything above the threshold is declared a target. At 11 dB above the mean noise power the probability that noise alone crosses it in a cell (the <b>false-alarm probability</b>) is</p>" +
        "<p class=\"eq\"><i>P</i><sub>fa</sub> = e<sup>−<i>T</i>/<i>P</i><sub>n</sub></sup> = e<sup>−12.6</sup> ≈ 3 × 10<sup>−6</sup></p><p>Target A is detected most of the time; 6 dB target B rarely.</p>",
        look: "green circles (detections) and the tallies in the results panel.",
        apply: () => set({ thrDb: 11 }) },
      { title: "3 · The trade-off", html:
        "<p>Lower the threshold to 6 dB and B gets detected more often, but now noise crosses it in about 2 % of cells: several false alarms every dwell. You can't improve <b>Pd</b> without raising <b>Pfa</b> unless you improve the SNR; the curve that captures this trade is the <b>ROC</b>.</p>",
        look: "the red crosses (false alarms) and the ROC tab on the detection-probability plot.",
        apply: () => { set({ thrDb: 6 }); plotCh.set("roc"); } },
      { title: "4 · Clutter breaks a fixed threshold", html:
        "<p>Rain and the ground also scatter the radar's energy. Where the clutter is 20 dB above the noise, a threshold set for noise is hopeless: it fires constantly.</p>",
        look: "the blue clutter regions full of red crosses.",
        apply: () => { set({ thrDb: 11, rain: true, land: true, clDb: 20 }); plotCh.set("pd"); } },
      { title: "5 · CFAR adapts the threshold", html:
        "<p>A <b>cell-averaging CFAR</b> estimates the local interference power from training cells either side of each cell under test (skipping guard cells next to it, where the target's own energy might be) and sets the threshold at α times that average. " +
        "α is chosen for the false-alarm rate you want, so Pfa stays constant whatever the noise level.</p>",
        look: "the yellow threshold riding up over the clutter. Hover over the scope to see the CFAR window for any cell. Notice the cost: target C, buried in the rain, is lost.",
        apply: () => set({ cfar: true, pfa: 1e-4, rain: true, land: true, clDb: 20 }) },
      { title: "6 · Integrate pulses", html:
        "<p>Averaging the detected power of <i>N</i> pulses doesn't change the mean noise level but shrinks its fluctuations, so the threshold can sit closer to it for the same Pfa. Weak target B (6 dB per pulse) becomes reliably detectable with 16 pulses.</p>",
        look: "the grass getting smoother, B detected every dwell, and the Pd curve moving left.",
        apply: () => { set({ n: 16 }); S.thrDb = 10 * Math.log10(thrForPfa(1e-6, 16)); thrSl.value = S.thrDb; changed(false); plotCh.set("pd"); } },
    ]);

    const lab = labGrid(root);

    // ---- range profile
    const scCard = card(lab.main, "Range profile", "one dwell, refreshed four times a second");
    const sc = api.track(canvasView(scCard, { aspect: 2.5, minHeight: 240, maxHeight: 380, draw: drawScope, label: "Received power in each range cell with the detection threshold" }));
    drag(sc, {
      hit: (x, y) => !S.cfar && sc.P && Math.abs(y - sc.P.Y(S.thrDb)) < 14,
      move: (x, y) => { S.thrDb = clamp(Math.round(sc.P.invY(y) * 2) / 2, 0, 25); thrSl.value = S.thrDb; changed(false); },
      hover: (x) => { if (!sc.P) return; const c = Math.round(sc.P.invX(x) / (CELL / 1000)); hover = c >= 0 && c < M && x > sc.P.l ? c : null; if (!anim.playing) sc.redraw(); },
      leave: () => { hover = null; if (!anim.playing) sc.redraw(); },
    });
    legend(scCard, [[SC.thr, "threshold"], [theme().ok, "detection"], [theme().bad, "false alarm"], [SC.clutter, "clutter region"], [SC.win, "CFAR training cells"]]);
    const btnRow = h("div", { class: "btn-row" });
    scCard.append(btnRow);
    button(btnRow, "New dwell", () => { newDwell(); evaluate(true); }, "small");
    button(btnRow, "Reset tallies", () => { resetTally(); updateReadouts(); }, "ghost small");

    // ---- Pd plot
    const pdCard = card(lab.main, "Detection probability", "theory for a steady (Swerling 0) target");
    const plotCh = choice(pdCard, { aria: "Plot", value: "pd", options: [["pd", "Pd against SNR"], ["roc", "ROC: Pd against Pfa"]], onChange: () => pv.redraw() });
    plotCh.el.style.marginBottom = "8px";
    const pv = api.track(canvasView(pdCard, { aspect: 2.1, minHeight: 240, maxHeight: 340, draw: drawPd, label: "Probability of detection curves" }));
    const pdLeg = h("div");
    pdCard.append(pdLeg);

    // ---- controls
    const ctl = card(lab.side, "Controls");
    const gD = group(ctl, "Detector");
    const modeCh = choice(gD, { aria: "Threshold type", value: "fixed", options: [["fixed", "Fixed threshold"], ["cfar", "CA-CFAR"]], onChange: (v) => { S.cfar = v === "cfar"; changed(false); } });
    const thrSl = slider(gD, { label: "Threshold above mean noise", min: 0, max: 25, step: 0.5, value: S.thrDb, format: (v) => `${num(v, 3)} dB`, help: "Or drag the yellow line on the scope.", onInput: (v) => { S.thrDb = v; changed(false); } });
    const pfaSl = slider(gD, { label: "Design P<sub>fa</sub>", min: 1e-8, max: 1e-1, log: true, value: S.pfa, format: (v) => num(v, 2), onInput: (v) => { S.pfa = v; changed(false); } });
    const trSl = slider(gD, { label: "Training cells each side", min: 2, max: 32, step: 1, value: S.train, format: (v) => `${v}`, onInput: (v) => { S.train = v; changed(false); } });
    const guSl = slider(gD, { label: "Guard cells each side", min: 0, max: 6, step: 1, value: S.guard, format: (v) => `${v}`, onInput: (v) => { S.guard = v; changed(false); } });
    const gC = group(ctl, "Clutter");
    const rainChk = check(gC, { label: "Rain cloud (cells 178–242)", checked: S.rain, onChange: (v) => { S.rain = v; changed(true); } });
    const landChk = check(gC, { label: "Ground clutter (near the radar)", checked: S.land, onChange: (v) => { S.land = v; changed(true); } });
    const clSl = slider(gC, { label: "Clutter strength", min: 0, max: 40, step: 1, value: S.clDb, format: (v) => `${v} dB above noise`, onInput: (v) => { S.clDb = v; changed(true); } });
    const gT = group(ctl, "Signal");
    const snrSl = slider(gT, { label: "Target A SNR (per pulse)", min: -5, max: 25, step: 0.5, value: S.snrA, format: (v) => `${num(v, 3)} dB`, help: "B is 6 dB, C (in the rain) 15 dB, D 20 dB.", onInput: (v) => { S.snrA = v; changed(true); } });
    const nSl = slider(gT, { label: "Pulses integrated <i>N</i>", min: 1, max: 32, step: 1, value: S.n, format: (v) => `${v} (noncoherent)`, onInput: (v) => { S.n = v; changed(true); } });

    const outCard = card(lab.side, "Results");
    const ro = readout(outCard);

    const ch = api.challenges(root, [
      { id: "quiet", text: "Run 10 dwells or more with <b>zero</b> false alarms while still detecting a 13 dB target A at least 80 % of the time.", check: (s) => s.t.dwells >= 10 && s.t.fa === 0 && s.S.snrA <= 13.01 && s.t.hits.A / s.t.dwells >= 0.8 },
      { id: "busy", text: "Lower the threshold until you average at least one false alarm per dwell (over 10+ dwells).", check: (s) => s.t.dwells >= 10 && s.t.fa / s.t.dwells >= 1 },
      { id: "clutter", text: "With a fixed threshold, switch on clutter and watch it cause 5 false alarms.", check: (s) => !s.S.cfar && (s.S.rain || s.S.land) && s.t.faCl >= 5 },
      { id: "cfar", text: "Fix it: with 15 dB or more of clutter, use CFAR to keep false alarms in the clutter to one per 10 dwells or fewer (over 10+ dwells).", check: (s) => s.S.cfar && (s.S.rain || s.S.land) && s.S.clDb >= 15 && s.t.dwells >= 10 && s.t.faCl / s.t.dwells <= 0.1 },
      { id: "weak", text: "Detect weak target B (6 dB) in 80 % of 10+ dwells by integrating pulses, at a design P<sub>fa</sub> of 10⁻⁴ or lower.", check: (s) => s.t.dwells >= 10 && s.S.n >= 2 && s.pfaNow <= 1.0001e-4 && s.t.hits.B / s.t.dwells >= 0.8 },
      { id: "rain", text: "Hard: find target C inside 10 dB+ rain in 80 % of 10+ dwells, with CFAR on and at most one false alarm per 5 dwells.", check: (s) => s.S.cfar && s.S.rain && s.S.clDb >= 10 && s.t.dwells >= 10 && s.t.hits.C / s.t.dwells >= 0.8 && s.t.fa / s.t.dwells <= 0.2 },
    ]);

    // ---- simulation
    function buildClutter() {
      clutter = new Float64Array(M);
      const k = undb(S.clDb);
      if (S.rain) for (let i = RAIN[0]; i <= RAIN[1]; i++) {
        const e = Math.min(i - RAIN[0], RAIN[1] - i);
        clutter[i] += k * (e >= 10 ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * e) / 10));
      }
      if (S.land) {
        const P = rng(5);
        let wob = 0;
        for (let i = 0; i <= LAND; i++) { wob = 0.7 * wob + 0.3 * (P() - 0.5) * 16; clutter[i] += k * undb(wob - (i / LAND) * 4); }
      }
    }
    function newDwell() {
      const N = S.n;
      z = new Float64Array(M);
      targetAt.clear();
      for (const t of TG) targetAt.set(t.cell, t);
      for (let p = 0; p < N; p++) {
        for (let i = 0; i < M; i++) {
          const sd = Math.sqrt((1 + clutter[i]) / 2);
          let re = sd * gauss(R), im = sd * gauss(R);
          const t = targetAt.get(i);
          if (t) { const a = Math.sqrt(undb(t.key === "A" ? S.snrA : t.snr)), ph = R() * TAU; re += a * Math.cos(ph); im += a * Math.sin(ph); }
          z[i] += re * re + im * im;
        }
      }
      for (let i = 0; i < M; i++) z[i] /= N;
    }
    function computeThreshold() {
      thr = new Float64Array(M);
      if (!S.cfar) { thr.fill(undb(S.thrDb)); return; }
      for (let i = 0; i < M; i++) {
        let sum = 0, n = 0;
        for (let j = i - S.guard - S.train; j <= i + S.guard + S.train; j++) {
          if (j < 0 || j >= M || Math.abs(j - i) <= S.guard) continue;
          sum += z[j]; n++;
        }
        thr[i] = alphaFor(S.pfa, n, S.n) * (sum / n);
      }
    }
    function evaluate(count) {
      computeThreshold();
      det = [];
      let fa = 0;
      for (let i = 0; i < M; i++) {
        if (z[i] <= thr[i]) continue;
        const t = targetAt.get(i);
        det.push({ i, hit: !!t });
        if (t) { if (count) tally.hits[t.key]++; }
        else { fa++; if (count) { tally.fa++; if (clutter[i] > 0.5) tally.faCl++; } }
      }
      if (count) { tally.dwells++; tally.faLast = fa; }
      updateReadouts();
      sc.redraw();
    }
    function set(cfg) {
      Object.assign(S, { thrDb: 11, cfar: false, pfa: 1e-4, guard: 2, train: 12, rain: false, land: false, clDb: 20, snrA: 13, n: 1 }, cfg);
      thrSl.value = S.thrDb; modeCh.value = S.cfar ? "cfar" : "fixed"; pfaSl.value = S.pfa; trSl.value = S.train; guSl.value = S.guard;
      rainChk.checked = S.rain; landChk.checked = S.land; clSl.value = S.clDb; snrSl.value = S.snrA; nSl.value = S.n;
      changed(true);
    }
    function changed(regen) {
      thrSl.el.style.display = S.cfar ? "none" : "";
      for (const s of [pfaSl, trSl, guSl]) s.el.style.display = S.cfar ? "" : "none";
      if (regen) { buildClutter(); newDwell(); }
      resetTally();
      evaluate(true);
      pv.redraw();
    }

    // ---- theory for the readouts
    function theoryNow() {
      const N = S.n, nTr = 2 * S.train;
      if (!S.cfar) {
        const T = undb(S.thrDb);
        let efa = 0;
        for (let i = 0; i < M; i++) if (!targetAt.has(i)) efa += pfaFixed(T / (1 + clutter[i]), N);
        return { pfa: pfaFixed(T, N), pd: (snr) => pdFixed(snr, T, N), efa };
      }
      const a = alphaFor(S.pfa, nTr, N);
      return { pfa: S.pfa, pd: (snr) => pdCA(snr, a, nTr, N), efa: S.pfa * (M - TG.length), alpha: a };
    }
    const sci = (x) => num(x, 2).replace(/×10\^(\S+)/, (m, e) => `×10<sup>${e.replace("-", "−")}</sup>`);
    function updateReadouts() {
      const th = theoryNow(), t = tally, n = Math.max(1, t.dwells);
      const pdA = th.pd(undb(S.snrA)), pdB = th.pd(undb(6));
      const row = (key, theory) => [`Target ${key}${key === "C" ? " (in rain)" : ""}`, `${t.hits[key]}/${t.dwells}${theory != null ? ` · theory ${pct(theory, 2)}` : ""}`, t.dwells >= 5 ? (t.hits[key] / n >= 0.8 ? "ok" : t.hits[key] / n < 0.3 ? "bad" : "warn") : null];
      ro.set([
        ["Dwells counted", `${t.dwells}`],
        row("A", pdA), row("B", pdB), row("C", S.rain ? null : th.pd(undb(15))), row("D", th.pd(undb(20))),
        ["False alarms", `${t.fa} (${num(t.fa / n, 3)} per dwell)`, t.fa ? "bad" : "ok"],
        ["…of them in clutter", `${t.faCl}`],
        ["Expected per dwell", S.cfar ? `${num(th.efa, 2)} (uniform noise)` : num(th.efa, 2)],
        ["Measured P<sub>fa</sub> per cell", t.dwells ? sci(t.fa / (t.dwells * (M - TG.length))) : "–"],
        [S.cfar ? "Design P<sub>fa</sub> per cell" : "Theory P<sub>fa</sub> per cell", sci(th.pfa)],
        S.cfar ? ["CFAR scale factor α", `${num(th.alpha, 3)} (${num(db(th.alpha), 3)} dB)`] : ["Threshold", `${num(S.thrDb, 3)} dB = ${num(undb(S.thrDb), 3)} × noise`],
      ]);
      ch.update({ S, t, pfaNow: th.pfa });
    }

    // ---- drawing
    function drawScope(ctx, w, hh) {
      const T = theme();
      const P = axes(ctx, w, hh, { x: [0, (M * CELL) / 1000], y: [-20, 50], dark: true, xlabel: "range (km), 150 m cells", ylabel: "power (dB above noise)", pad: { l: 46, b: 34, t: 12, r: 12 } });
      sc.P = P;
      const X = (i) => P.X((i * CELL) / 1000);
      P.clip();
      // clutter regions
      for (let i = 0; i < M; i++) if (clutter[i] > 0.1) { ctx.fillStyle = alpha(SC.clutter, 0.1 + 0.12 * clamp(db(clutter[i]) / 30, 0, 1)); ctx.fillRect(X(i - 0.5), P.t, X(1) - X(0) + 0.6, P.b - P.t); }
      // CFAR window for the hovered cell (or A)
      if (S.cfar) {
        const c = hover ?? TG[0].cell;
        ctx.fillStyle = alpha(SC.win, 0.22);
        for (let j = c - S.guard - S.train; j <= c + S.guard + S.train; j++) {
          if (j < 0 || j >= M || Math.abs(j - c) <= S.guard) continue;
          ctx.fillRect(X(j - 0.5), P.t, X(1) - X(0) + 0.4, 10);
        }
        ctx.fillStyle = alpha(SC.thr, 0.6); ctx.fillRect(X(c - 0.5), P.t, Math.max(2, X(1) - X(0)), 14);
      }
      // trace
      const pts = [];
      for (let i = 0; i < M; i++) pts.push([X(i), P.Y(clamp(db(Math.max(z[i], 1e-3)), -20, 50))]);
      polyline(ctx, pts, T.scopeFg, 1.3);
      // threshold
      const tp = [];
      for (let i = 0; i < M; i++) { const y = P.Y(clamp(db(thr[i]), -20, 50)); if (S.cfar) { tp.push([X(i - 0.5), y], [X(i + 0.5), y]); } }
      if (S.cfar) polyline(ctx, tp, SC.thr, 1.6);
      else { const y = P.Y(S.thrDb); polyline(ctx, [[P.l, y], [P.r, y]], SC.thr, 2); }
      // detections
      for (const d of det) {
        const x = X(d.i), y = P.Y(clamp(db(z[d.i]), -20, 50));
        if (d.hit) { ctx.strokeStyle = T.dark ? T.ok : "#5BD28F"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.stroke(); }
        else { ctx.strokeStyle = SC.fa; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke(); }
      }
      P.unclip();
      // target tags along the top
      ctx.font = T.font;
      for (const t of TG) {
        const x = X(t.cell);
        ctx.strokeStyle = alpha(T.scopeText, 0.35); ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, P.t); ctx.lineTo(x, P.b - 22); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, w < 560 ? t.key : `${t.key} ${num(t.key === "A" ? S.snrA : t.snr, 3)} dB`, x, P.b - 11, { align: "center", color: T.scopeText, bg: alpha("#000000", 0.6), bounds: w, font: T.mono });
      }
      if (!S.cfar) label(ctx, `threshold ${num(S.thrDb, 3)} dB`, P.r - 4, P.Y(S.thrDb) - 12, { align: "right", color: SC.thr, bg: alpha("#000000", 0.6) });
      if (S.cfar && hover != null) label(ctx, `cell ${hover}: CFAR threshold ${num(db(thr[hover]), 3)} dB`, X(hover), P.t + 26, { align: "center", color: SC.thr, bg: alpha("#000000", 0.7), bounds: w });
    }

    let curveKey = "", curves = null;
    function computeCurves() {
      const key = JSON.stringify([S.cfar, S.thrDb, S.pfa, S.train, S.n, S.snrA, plotCh.value]);
      if (key === curveKey) return curves;
      curveKey = key;
      const N = S.n, nTr = 2 * S.train;
      const th = theoryNow();
      const pfa = th.pfa;
      const out = { pfa, list: [] };
      if (plotCh.value === "pd") {
        const xs = Array.from({ length: 61 }, (_, i) => -5 + i * 0.5);
        const T1 = thrForPfa(pfa, 1), TN = thrForPfa(pfa, N);
        out.list.push({ name: S.cfar ? `CA-CFAR, ${nTr} training cells, N = ${N}` : `fixed threshold, N = ${N}`, color: "accent", w: 2.5, pts: xs.map((x) => [x, th.pd(undb(x))]) });
        if (S.cfar) out.list.push({ name: `ideal (noise level known), N = ${N}`, color: "muted", dash: [6, 4], pts: xs.map((x) => [x, pdFixed(undb(x), TN, N)]) });
        if (N > 1) out.list.push({ name: "one pulse, same P<sub>fa</sub>", color: "c4", dash: [3, 4], pts: xs.map((x) => [x, pdFixed(undb(x), T1, 1)]) });
      } else {
        const ths = Array.from({ length: 90 }, (_, i) => -12 + i * 0.4); // threshold sweep, dB
        for (const [dS, color] of [[-3, "c4"], [0, "accent"], [3, "c5"]]) {
          const snr = undb(S.snrA + dS);
          out.list.push({ name: `SNR ${num(S.snrA + dS, 3)} dB (fixed threshold, N = ${N})`, color, w: dS ? 1.8 : 2.5, pts: ths.map((t) => [pfaFixed(undb(t), N), pdFixed(snr, undb(t), N)]).filter(([p]) => p >= 1e-10) });
        }
      }
      curves = out;
      return out;
    }

    function drawPd(ctx, w, hh) {
      const T = theme();
      const c = computeCurves();
      const roc = plotCh.value === "roc";
      const P = roc
        ? axes(ctx, w, hh, { x: [1e-10, 1], y: [0, 1], xlog: true, xlabel: "false-alarm probability per cell", ylabel: "Pd", xticks: [1e-10, 1e-8, 1e-6, 1e-4, 1e-2, 1], xfmt: (v) => `10${["⁻¹⁰", "⁻⁸", "⁻⁶", "⁻⁴", "⁻²", "⁰"][[1e-10, 1e-8, 1e-6, 1e-4, 1e-2, 1].indexOf(v)]}`, yfmt: (v) => num(v, 2), pad: { l: 44, b: 34, r: 14 } })
        : axes(ctx, w, hh, { x: [-5, 25], y: [0, 1], xlabel: "SNR per pulse (dB)", ylabel: "Pd", yfmt: (v) => num(v, 2), pad: { l: 44, b: 34, r: 14 } });
      P.clip();
      for (const cv of c.list) polyline(ctx, cv.pts.map(([x, y]) => [P.X(x), P.Y(y)]), T[cv.color], cv.w || 1.8, cv.dash);
      P.unclip();
      const dot = (x, y, col, txt, hollow, side = 1) => {
        const px = P.X(x), py = P.Y(y);
        ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.fillStyle = hollow ? T.surface : col;
        ctx.beginPath(); ctx.arc(px, py, 6, 0, TAU); ctx.fill(); ctx.stroke();
        if (txt) label(ctx, txt, px + 10 * side, py + (py > P.t + 30 ? -14 : 14), { align: side > 0 ? "left" : "right", color: col, bounds: w, font: T.font });
      };
      const th = theoryNow(), t = tally;
      if (!roc) {
        const pa = th.pd(undb(S.snrA)), pb = th.pd(undb(6));
        dot(6, pb, T.ink, `B ${pct(pb, 2)}`, false, -1);
        dot(S.snrA, pa, T.accent, `A theory ${pct(pa, 2)}`, false, S.snrA > 18 ? -1 : 1);
        if (t.dwells) dot(S.snrA, t.hits.A / t.dwells, T.tgt, null, true);
      } else {
        const pa = th.pd(undb(S.snrA));
        if (th.pfa >= 1e-10) dot(th.pfa, pa, T.accent, `you are here`, false, th.pfa > 1e-3 ? -1 : 1);
      }
      pdLeg.replaceChildren(legend(null, c.list.map((cv) => [T[cv.color], h("span", { html: cv.name })])));
      if (!roc) pdLeg.append(legend(null, [[T.tgt, "measured Pd for target A (hollow dot)"]]));
      else pdLeg.append(h("p", { class: "caption", html: `Each curve sweeps the threshold. Moving right buys detection probability with false alarms; only more SNR moves the whole curve up.${S.cfar ? " (Curves are for a fixed threshold in uniform noise.)" : ""}` }));
    }

    // ---- loop
    let acc = 0;
    const anim = api.track(animate((dt) => {
      acc += dt;
      if (acc >= 1 / DWELL_HZ) { acc = 0; newDwell(); evaluate(true); if (tally.dwells % 4 === 0) pv.redraw(); }
    }, { target: sc.canvas, playing: !reducedMotion }));
    playButton(sc, anim);

    buildClutter();
    newDwell();
    evaluate(true);
    void tour;

    notes(root, "Background", [
      { title: "Noise, the Rayleigh envelope and the false-alarm probability", open: true, html:
        "<p>Receiver noise is Gaussian in each of the in-phase (I) and quadrature (Q) channels, with variance σ² each. The <b>envelope</b> <i>r</i> = √(I² + Q²) then has a Rayleigh distribution, and the power <i>r</i>² an exponential one with mean <i>P</i><sub>n</sub> = 2σ².</p>" +
        "<p class=\"eq\"><i>p</i>(<i>r</i>) = <span class=\"frac\"><span><i>r</i></span><span>σ²</span></span> e<sup>−<i>r</i>²/2σ²</sup> &nbsp;&nbsp;⇒&nbsp;&nbsp; <i>P</i><sub>fa</sub> = <i>P</i>(<i>r</i> > <i>V</i><sub>T</sub>) = e<sup>−<i>V</i><sub>T</sub>²/2σ²</sup></p>" +
        "<p>So a threshold 10 dB above the mean noise power (<i>V</i><sub>T</sub>²/2σ² = 10) gives <i>P</i><sub>fa</sub> = e<sup>−10</sup> ≈ 4.5 × 10<sup>−5</sup>, and 13.2 dB gives 10<sup>−9</sup>. Because a radar tests millions of cells a second, Pfa must be tiny: at 10<sup>−6</sup> and 10⁶ cells per second there is still one false alarm every second.</p>" +
        "<p class=\"small muted\">The simulation uses a square-law detector (power = I² + Q²), averages the power of <i>N</i> pulses, and shows it in dB relative to the mean noise power.</p>" },
      { title: "Probability of detection and the ROC", html:
        "<p>With a steady target (amplitude <i>A</i>) added to the noise, the envelope becomes <b>Rician</b>, and the probability that it exceeds the threshold is Marcum's Q function:</p>" +
        "<p class=\"eq\"><i>P</i><sub>d</sub> = <i>Q</i><sub>1</sub>(√(2·SNR), √(2<i>T</i>/<i>P</i><sub>n</sub>)) &nbsp;&nbsp; SNR = <i>A</i>²/<i>P</i><sub>n</sub></p>" +
        "<p>and for <i>N</i> pulses averaged noncoherently, the generalised <i>Q</i><sub><i>N</i></sub>(√(2<i>N</i>·SNR), √(2<i>NT</i>/<i>P</i><sub>n</sub>)), with <i>P</i><sub>fa</sub> = <i>Q</i>(<i>N</i>, <i>NT</i>/<i>P</i><sub>n</sub>), the regularised incomplete gamma function. The plots compute these exactly (a Poisson-weighted series of incomplete gamma functions); they are not an approximation such as Albersheim's equation.</p>" +
        "<p>A <b>receiver operating characteristic</b> (ROC) plots Pd against Pfa as the threshold sweeps. Useful anchor: a steady target needs about <b>13.2 dB</b> for Pd = 0.9 at Pfa = 10<sup>−6</sup> on a single pulse. Albersheim's empirical formula gives the same numbers within about 0.2 dB and is handy on paper.</p>" },
      { title: "Clutter", html:
        "<p><b>Clutter</b> is echo from things you don't care about: the ground, sea waves, rain, birds, chaff. It is often far stronger than noise and, unlike noise, its strength varies with range, angle and weather.</p>" +
        "<ul><li><b>Ground (land) clutter</b>: strong, patchy, near the radar and at low elevation; nearly stationary in Doppler.</li><li><b>Sea clutter</b>: depends on sea state, wind and grazing angle; spiky (heavy-tailed, often modelled as K-distributed), so a CFAR tuned for Rayleigh statistics still gets false alarms.</li><li><b>Weather</b>: rain reflectivity grows as <i>f</i>⁴ (Rayleigh scattering), so it matters most at X band and above; it fills whole volumes and moves with the wind.</li></ul>" +
        "<p>Clutter is fought first with Doppler: <b>MTI</b> filters and pulse-Doppler processing (lesson 5) reject echoes that aren't moving, and CFAR mops up what remains. In this simulation clutter is Rayleigh like noise and changes from pulse to pulse, so integration smooths it but cannot lower its mean.</p>" },
      { title: "CFAR: constant false-alarm rate", html:
        "<p>A fixed threshold only works if you know the noise power. A <b>cell-averaging CFAR</b> estimates it from <i>n</i> training cells around the cell under test (CUT), skipping a few <b>guard cells</b> so a target's own energy doesn't leak into the estimate, and detects if <i>z</i><sub>CUT</sub> > α · <span style=\"text-decoration:overline\"><i>z</i></span>. For a single pulse and square-law detection in uniform exponential noise</p>" +
        "<p class=\"eq\"><i>P</i><sub>fa</sub> = (1 + α/<i>n</i>)<sup>−<i>n</i></sup> &nbsp;⇒&nbsp; α = <i>n</i>(<i>P</i><sub>fa</sub><sup>−1/<i>n</i></sup> − 1)</p>" +
        "<p>(the simulation uses the exact generalisation for <i>N</i> integrated pulses). Because the estimate is itself noisy, CFAR needs a little more SNR than an ideal detector for the same Pd: the <b>CFAR loss</b>, about 1.5 dB with 24 training cells at Pfa = 10<sup>−6</sup>. The family:</p>" +
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Type</th><th>Noise estimate</th><th>Good at</th></tr>" +
        "<tr><td>CA (cell-averaging)</td><td>mean of all training cells</td><td>uniform noise; lowest loss</td></tr>" +
        "<tr><td>GO (greatest-of)</td><td>larger of the two half-window means</td><td>clutter edges (fewer false alarms)</td></tr>" +
        "<tr><td>SO (smallest-of)</td><td>smaller of the two means</td><td>closely spaced targets (less masking)</td></tr>" +
        "<tr><td>OS (ordered-statistic)</td><td>k-th largest training cell</td><td>multiple targets and spiky clutter</td></tr></table></div>" +
        "<p>Watch the CA-CFAR at the edges of the rain cloud: just outside it the training cells straddle the edge, the threshold rises, and targets there can be <b>masked</b>; just inside, the average is diluted and false alarms appear. Those are the cases GO- and OS-CFAR were invented for.</p>" },
      { title: "Integrating pulses", html:
        "<p><b>Coherent integration</b> (adding complex samples, as a Doppler filter does) gains exactly <i>N</i> in SNR. <b>Noncoherent integration</b> (adding detected powers, as here) keeps the mean of the noise but cuts its standard deviation by √<i>N</i>, so the threshold can come down. The equivalent gain is between √<i>N</i> and <i>N</i>: for Pd = 0.9 and Pfa = 10<sup>−6</sup>, 10 pulses are worth about 8 dB and 100 pulses about 14.5 dB.</p>" +
        "<p>The integration window is limited by the time the beam spends on the target (lesson 12) and by the target moving out of its range cell.</p>" },
      { title: "Fluctuating targets: the Swerling cases", html:
        "<p>Real targets are collections of scatterers whose echoes add with changing phases, so the RCS fluctuates. Swerling's four models cover the common cases:</p>" +
        "<ul><li><b>Swerling 0 (or 5)</b>: steady echo, used in this simulation.</li><li><b>Swerling 1 / 2</b>: many comparable scatterers, exponential RCS (Rayleigh amplitude), changing scan to scan (1) or pulse to pulse (2).</li><li><b>Swerling 3 / 4</b>: one dominant scatterer plus small ones (chi-square with 4 degrees of freedom), scan to scan (3) or pulse to pulse (4).</li></ul>" +
        "<p>Fluctuation hurts at high Pd: a Swerling 1 target needs about 21 dB instead of 13 dB for Pd = 0.9, Pfa = 10<sup>−6</sup> on one pulse, because sometimes it is simply faint. Frequency agility (lesson 7) decorrelates the echo pulse to pulse, turning Swerling 1 into Swerling 2, which integration handles much better.</p>" },
    ]);

    api.quiz(root, [
      { q: "A fixed threshold is set 10 dB above the mean noise power (single pulse, square-law detector). What is the false-alarm probability per cell?", options: ["0.1", "10⁻²", "≈ 4.5 × 10⁻⁵", "10⁻¹⁰"], answer: 2, why: "Noise power is exponential, so Pfa = e<sup>−T/P<sub>n</sub></sup> = e<sup>−10</sup> ≈ 4.5 × 10<sup>−5</sup>." },
      { q: "You lower the threshold. What happens?", options: ["Pd rises and Pfa falls", "Pd rises and Pfa rises", "Pd falls and Pfa rises", "Only Pfa changes"], answer: 1, why: "A lower threshold is crossed more easily by targets <em>and</em> by noise: you move up and to the right along the ROC curve." },
      { q: "Why does a CA-CFAR raise false alarms just inside the edge of a rain cloud?", options: ["Rain is spiky", "Half its training cells are outside the rain, so it underestimates the clutter there", "Guard cells are too wide", "It doesn't; CFAR guarantees constant Pfa"], answer: 1, why: "The cell under test sees the rain, but the training cells that are still in clear air drag the average, and so the threshold, down. Greatest-of CFAR takes the larger half-window mean to avoid this." },
      { q: "Averaging 16 pulses noncoherently lets you detect a weaker target mainly because…", options: ["the mean noise power drops by 16", "the noise fluctuations shrink, so the threshold can sit closer to the mean", "the target's echo gets 16 times stronger", "the clutter disappears"], answer: 1, why: "Averaging keeps the mean noise level but cuts its spread by √N, so a lower threshold gives the same Pfa. The gain is less than the coherent ×16." },
    ]);
  },
};
