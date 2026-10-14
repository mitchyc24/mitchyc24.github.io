// Lesson 7: frequency hopping and agility. A radar hops its carrier across an agile band; a self-protection jammer
// on the target tries to cover it. Each pulse is scored with a real radar-vs-jammer budget (S ∝ 1/R⁴, J ∝ 1/R²),
// a fluctuating multi-scatterer target, and an intercept receiver trying to predict the next frequency.
import {
  h, C0, KB, T0, card, labGrid, group, notes, slider, choice, check, readout, status, legend,
  canvasView, animate, playButton, axes, theme, alpha, label, polyline,
  num, si, km, fmtDb, pct, clamp, rad, db, undb, rng, reducedMotion,
} from "../ui.js";

// ---- radar and jammer budget (representative X-band fire-control radar vs a self-protection jammer)
const F0 = 9.5e9;                 // centre of the agile band
const LAM = C0 / F0;
const PT = 200e3;                 // peak power, W
const G = undb(36);               // antenna gain (transmit and receive)
const TAU_P = 10e-6;              // pulse length, s
const BR = 2e6;                   // receiver (signal) bandwidth, Hz
const NF_DB = 4;                  // noise figure
const SIGMA = 5;                  // mean target RCS, m²
const GJ = undb(6);               // jammer antenna gain toward the radar
const DREQ = 13;                  // SNR needed for a reliable single-pulse detection, dB
const PFA = 1e-6;
const NOISE = KB * T0 * undb(NF_DB) * BR;
const SWEEP_T = 0.04;             // swept jammer: one pass across the band every 40 ms
const ROWS = 48;                  // pulses shown in the waterfall
const WIN = 48;                   // pulses in the statistics window

// RCS model: ten point scatterers on a 15 m × 12 m aircraft, seen from a slowly changing aspect
const RS = rng(21);
const SCAT = Array.from({ length: 10 }, () => ({ x: (RS() - 0.5) * 15, y: (RS() - 0.5) * 12, a: 0.4 + RS() }));
const SCAT_P = SCAT.reduce((s, k) => s + k.a * k.a, 0);
function rcsFactor(f, t) {
  const al = 0.6 + rad(0.4) * t + rad(0.15) * Math.sin(1.3 * t);
  const c = Math.cos(al), s = Math.sin(al);
  let re = 0, im = 0;
  for (const k of SCAT) { const p = (4 * Math.PI * f * (k.x * c + k.y * s)) / C0; re += k.a * Math.cos(p); im += k.a * Math.sin(p); }
  return (re * re + im * im) / SCAT_P;
}

/** E/N0 after pulse compression for the mean RCS. */
const snrAt = (R) => (PT * TAU_P * G * G * LAM * LAM * SIGMA) / ((4 * Math.PI) ** 3 * R ** 4 * KB * T0 * undb(NF_DB));
/** Jammer power reaching the radar's receiver, per Hz of jammer bandwidth. */
const jamPsd = (Pj, R, Wj) => (Pj * GJ * G * LAM * LAM) / ((4 * Math.PI) ** 2 * R * R * Wj);

function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
/** North's approximation for a steady target. */
const pdOf = (snr) => clamp(0.5 * erfc(Math.sqrt(-Math.log(PFA)) - Math.sqrt(snr + 0.5)), 0, 1);

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "A jammer can only drown a radar's echo if it puts its noise on the radar's frequency. Hop that frequency " +
      "unpredictably, pulse by pulse, and the jammer must either chase it or spread its power across the whole band, " +
      "where each channel gets only a sliver. Agility also makes the radar harder to identify and evens out target fading." }));

    const S = { pattern: "fixed", nch: 16, bw: 500e6, dwell: 1, prf: 1000, jam: "spot", pj: 100, wj: 20e6, tr: 500e-6, range: 60e3, fluct: true, rate: 10 };
    const hist = [];            // newest first
    const sent = [];            // [t, freq] of recent pulses, for the follower jammer
    let n = 0, t = 0, cur = 0, since = 0, esm = { last: null, prev: null }, acc = 0;
    const R = rng(77);

    const home = () => Math.floor(S.nch * 0.35);
    const chFreq = (c) => F0 - S.bw / 2 + ((c + 0.5) * S.bw) / S.nch;

    // ---- jammer: centre and width at time `tt`, or null
    function jammerAt(tt) {
      if (S.jam === "none") return null;
      if (S.jam === "spot") return { fc: chFreq(home()), w: S.wj };
      if (S.jam === "barrage") return { fc: F0, w: S.bw };
      if (S.jam === "swept") { const ph = (tt / SWEEP_T) % 1; return { fc: F0 - S.bw / 2 + ph * S.bw, w: S.wj }; }
      for (let i = sent.length - 1; i >= 0; i--) if (sent[i][0] <= tt - S.tr) return { fc: sent[i][1], w: S.wj };
      return null;
    }
    /** J/N in channel c for a jammer state. */
    function jnIn(jm, c) {
      if (!jm) return 0;
      const f = chFreq(c);
      const ov = Math.max(0, Math.min(f + BR / 2, jm.fc + jm.w / 2) - Math.max(f - BR / 2, jm.fc - jm.w / 2));
      return (jamPsd(S.pj, S.range, jm.w) * ov) / NOISE;
    }

    function pickChannel() {
      if (n % S.dwell !== 0 && hist.length) return cur;
      const k = Math.floor(n / S.dwell);
      if (S.pattern === "fixed") return home();
      if (S.pattern === "stepped") return (home() + k) % S.nch;
      if (S.pattern === "random") { const c = Math.floor(R() * (S.nch - 1)); return hist.length && c >= cur ? c + 1 : c; } // never the same channel twice running
      // adaptive: listen during the previous PRI and pick the quietest channel (random among ties)
      const jm = jammerAt(t - 1 / S.prf);
      let best = Infinity, opts = [];
      for (let c = 0; c < S.nch; c++) {
        const v = Math.round(db(1 + jnIn(jm, c)));
        if (v < best) { best = v; opts = [c]; } else if (v === best) opts.push(c);
      }
      return opts[Math.floor(R() * opts.length)];
    }

    function firePulse() {
      cur = clamp(pickChannel(), 0, S.nch - 1);
      const f = chFreq(cur);
      sent.push([t, f]); if (sent.length > 600) sent.shift();
      const jm = jammerAt(t);
      const jn = Float32Array.from({ length: S.nch }, (_, c) => jnIn(jm, c));
      const snr = snrAt(S.range) * (S.fluct ? rcsFactor(f, t) : 1);
      const sinr = snr / (1 + jn[cur]);
      const st = sinr >= undb(DREQ) ? "clean" : snr >= undb(DREQ) ? "jam" : "weak";
      const pred = esm.last == null ? null : esm.prev == null ? esm.last : (((2 * esm.last - esm.prev) % S.nch) + S.nch) % S.nch;
      hist.unshift({ n, ch: cur, nch: S.nch, jn, jm: jm && { ...jm, jn: (jamPsd(S.pj, S.range, jm.w) * Math.min(jm.w, BR)) / NOISE }, snr, sinr, st, pd: pdOf(sinr), esmHit: pred === cur });
      if (hist.length > 80) hist.pop();
      esm = { last: cur, prev: esm.last };
      n++; since++; t += 1 / S.prf;
    }

    function stats() {
      // skip the pulses straddling the last change (old dwell, jammer still reacting to old settings)
      const warm = S.dwell + Math.ceil(S.tr * S.prf) + 1;
      const k = Math.max(0, Math.min(WIN, since - warm, hist.length)), win = hist.slice(0, k);
      const c = (s) => win.filter((p) => p.st === s).length;
      const pd = k ? win.reduce((a, p) => a + p.pd, 0) / k : 0;
      let miss = 1; hist.slice(0, Math.min(10, k)).forEach((p) => { miss *= 1 - p.pd; });
      return { k, jam: k ? c("jam") / k : 0, clean: k ? c("clean") / k : 0, weak: k ? c("weak") / k : 0, pd, cum: k ? 1 - miss : 0, esm: k ? win.filter((p) => p.esmHit).length / k : 0 };
    }

    /** Burn-through range for a jammer of bandwidth wEff that fully covers the radar's channel. */
    function burn(wEff) {
      const jn = (jamPsd(S.pj, S.range, wEff) * Math.min(wEff, BR)) / NOISE;
      const sj = snrAt(S.range) / jn;
      return S.range * Math.sqrt(sj / undb(DREQ));
    }

    // ---- guided tour
    const set = (o) => {
      Object.assign(S, o);
      patC.value = S.pattern; nchC.value = S.nch; bwS.value = S.bw / 1e6; dwC.value = S.dwell; prfS.value = S.prf / 1e3;
      jamC.value = S.jam; pjS.value = S.pj; wjS.value = S.wj / 1e6; trS.value = S.tr * 1e6; rS.value = S.range / 1e3; flC.checked = S.fluct;
      changed(true);
    };
    api.steps(root, [
      { title: "1 · A sitting duck", html:
        "<p>This radar transmits every pulse on the same channel. A <b>spot jammer</b> on the target has measured that frequency and concentrates 100 W into a 20 MHz slot on top of it. Its noise only travels one way (∝ 1/<i>R</i>²) while the radar's echo makes a round trip (∝ 1/<i>R</i>⁴), so at 60 km the jamming is about 40 dB stronger than the echo.</p>",
        look: "the waterfall: one column of red (jammed) pulses inside the orange jamming.",
        apply: () => set({ pattern: "fixed", dwell: 1, jam: "spot", pj: 100, wj: 20e6, range: 60e3, nch: 16, bw: 500e6, prf: 1000 }) },
      { title: "2 · Hop", html:
        "<p>Now the radar picks a new channel at random for every pulse, anywhere in a 500 MHz band. The jammer still covers 20 MHz, so only about 20/500 of the pulses (roughly one in sixteen) land in it. The rest come home clean.</p>",
        look: "green pulses scattered across the band, with the occasional red one in the jammed slot.",
        apply: () => set({ pattern: "random", dwell: 1, jam: "spot" }) },
      { title: "3 · Barrage: spread thin", html:
        "<p>The jammer's answer is to <b>barrage</b> the whole 500 MHz band. Now every pulse is covered, but its 100 W is spread 25 times thinner, so each channel gets 14 dB less. At 60 km that's still enough; move closer and the radar <b>burns through</b> long before it could against the spot jammer.</p>" +
        "<p class=\"eq\"><i>R</i><sub>BT</sub> = √( <span class=\"frac\"><span><i>P</i><sub>t</sub> <i>G</i> σ <i>τ B</i><sub>J</sub></span><span>4π <i>P</i><sub>J</sub> <i>G</i><sub>J</sub> (<i>S</i>/<i>J</i>)<sub>req</sub></span></span> )</p>",
        look: "the burn-through ranges in the readout. Agility forced the jammer to dilute its power.",
        apply: () => set({ pattern: "random", jam: "barrage", range: 12e3 }) },
      { title: "4 · Swept jammer", html:
        "<p>A <b>swept</b> jammer runs a narrow, intense spot across the band, here once every 40 ms. Each channel is hit hard but only briefly. A fixed-frequency radar loses a burst of pulses on every pass; a hopping one only loses the pulses that happen to land under the sweep.</p>",
        look: "the diagonal orange stripe moving across the waterfall.",
        apply: () => set({ pattern: "random", jam: "swept", range: 60e3, wj: 30e6 }) },
      { title: "5 · Follower jammer", html:
        "<p>A <b>follower</b> (responsive) jammer measures each pulse's frequency and retunes onto it, but that takes a reaction time. If the radar dwells 4 pulses (4 ms) on each frequency and the jammer reacts in 0.5 ms, three of every four pulses are jammed. Hop every pulse and the jammer is always one frequency behind.</p>",
        look: "red pulses after the first of each dwell. Then set the dwell to 1 pulse.",
        apply: () => set({ pattern: "random", jam: "follower", dwell: 4, tr: 500e-6, prf: 1000, wj: 10e6 }) },
      { title: "6 · Fading, and why hopping helps", html:
        "<p>An aircraft is many scatterers whose echoes add with different phases. At one frequency their sum fades slowly as the aircraft turns, so a fixed-frequency radar can miss a whole burst of pulses (Swerling case 1). Hop by more than <i>c</i>/2<i>L</i> (10 MHz for a 15 m target) and every pulse sees an independent sum, so fades don't line up (Swerling case 2).</p>",
        look: "the pulse-by-pulse chart. Switch between Fixed and Random with no jammer.",
        apply: () => set({ pattern: "fixed", jam: "none", range: 105e3, dwell: 1, fluct: true }) },
      { title: "7 · Hiding from the listener", html:
        "<p>An electronic support (ESM) receiver tries to learn the radar's pattern so a jammer can be cued, or the radar identified. A fixed or stepped radar is predictable after two pulses. A pseudo-random sequence from a seeded generator looks like noise to anyone without the seed, and makes the radar a <b>low probability of intercept</b> (LPI) target.</p>",
        look: "the intercept receiver's prediction hit rate for each pattern.",
        apply: () => set({ pattern: "stepped", jam: "none", range: 60e3, dwell: 1 }) },
    ]);

    // ---- layout
    const lab = labGrid(root);
    const wfCard = card(lab.main, "Spectrum waterfall", "frequency across, pulses scrolling down");
    const wf = api.track(canvasView(wfCard, { aspect: 1.55, minHeight: 330, maxHeight: 460, draw: drawWaterfall, label: "Waterfall of radar pulses and jammer noise across the frequency band" }));
    legend(wfCard, [[theme().scopeFg, "clean pulse"], [theme().bad, "jammed pulse"], [theme().warn, "too weak anyway (fade or range)"], [theme().tx, "jammer noise"]]);
    const wfSt = status(wfCard);

    const plCard = card(lab.main, "Pulse by pulse", "signal to noise-plus-jamming of the last 64 pulses");
    const pl = api.track(canvasView(plCard, { aspect: 3.2, minHeight: 190, maxHeight: 250, draw: drawPulses, label: "Bar chart of each pulse's signal to noise and jamming ratio" }));
    legend(plCard, [[theme().ok, "detected"], [theme().bad, "jammed"], [theme().warn, "faded"], [theme().muted, "what S/N would be without jamming"]]);

    const esCard = card(lab.main, "Intercept receiver (ESM)", "trying to predict the next frequency");
    const es = api.track(canvasView(esCard, { aspect: 3.6, minHeight: 170, maxHeight: 210, draw: drawEsm, label: "Histogram of channels the radar used and the intercept receiver's prediction" }));
    legend(esCard, [[theme().accent, "channels used, last 64 pulses (dark: latest)"], [theme().c4, "▲ the receiver's guess for the next pulse"]]);

    const ctl = card(lab.side, "Controls");
    const g1 = group(ctl, "Radar");
    const patC = choice(g1, { label: "Hop pattern", value: S.pattern, options: [["fixed", "Fixed"], ["stepped", "Stepped"], ["random", "Random"], ["adaptive", "Adaptive"]], onChange: (v) => { S.pattern = v; changed(); } });
    const nchC = choice(g1, { label: "Channels", value: S.nch, options: [[8, "8"], [16, "16"], [32, "32"]], onChange: (v) => { S.nch = v; changed(); } });
    const bwS = slider(g1, { label: "Agile bandwidth", min: 100, max: 1000, step: 10, value: S.bw / 1e6, format: (v) => `${num(v, 4)} MHz`, onInput: (v) => { S.bw = v * 1e6; changed(); } });
    const dwC = choice(g1, { label: "Pulses per frequency (dwell)", value: S.dwell, options: [[1, "1"], [4, "4"], [8, "8"], [16, "16"]], onChange: (v) => { S.dwell = v; changed(); } });
    const prfS = slider(g1, { label: "PRF", min: 0.5, max: 20, step: 0.1, log: true, value: S.prf / 1e3, format: (v) => `${num(v, 3)} kHz (PRI ${si(1e-3 / v, "s", 3)})`, onInput: (v) => { S.prf = v * 1e3; changed(); } });
    const g2 = group(ctl, "Jammer (on the target)");
    const jamC = choice(g2, { label: "Type", value: S.jam, options: [["none", "None"], ["spot", "Spot"], ["barrage", "Barrage"], ["swept", "Swept"], ["follower", "Follower"]], onChange: (v) => { S.jam = v; changed(); } });
    const pjS = slider(g2, { label: "Jammer power", min: 1, max: 1000, step: 1, log: true, value: S.pj, format: (v) => `${num(v, 3)} W`, onInput: (v) => { S.pj = v; changed(); } });
    const wjS = slider(g2, { label: "Spot width (spot, swept, follower)", min: 2, max: 200, step: 1, log: true, value: S.wj / 1e6, format: (v) => `${num(v, 3)} MHz`, onInput: (v) => { S.wj = v * 1e6; changed(); } });
    const trS = slider(g2, { label: "Follower reaction time", min: 10, max: 10000, step: 10, log: true, value: S.tr * 1e6, format: (v) => si(v * 1e-6, "s", 3), onInput: (v) => { S.tr = v * 1e-6; changed(); } });
    const g3 = group(ctl, "Scene");
    const rS = slider(g3, { label: "Target range", min: 1, max: 150, step: 0.5, value: S.range / 1e3, format: (v) => `${num(v, 4)} km`, onInput: (v) => { S.range = v * 1e3; changed(); } });
    const flC = check(g3, { label: "Target RCS fluctuates (10 scatterers)", checked: S.fluct, onChange: (v) => { S.fluct = v; changed(); } });
    slider(g3, { label: "Playback", min: 1, max: 30, step: 1, value: S.rate, format: (v) => `${v} pulses/s`, help: "Real time is a thousand times faster.", onInput: (v) => { S.rate = v; } });
    const ro = readout(card(lab.side, "Budget and statistics"));

    const ch = api.challenges(root, [
      { id: "spot", text: "Defeat a spot jammer that would otherwise blind you: fewer than 10% of pulses jammed.", check: (s) => s.jam === "spot" && s.k >= 24 && s.effective && s.jamF < 0.1 },
      { id: "barrage", text: "Find a range where you burn through a barrage jammer but would not burn through a spot jammer of the same power.", check: (s) => s.jam === "barrage" && s.range < s.rbBarrage && s.range > s.rbSpot },
      { id: "follower", text: "Beat a follower jammer by changing frequency faster than it can react: under 15% jammed.", check: (s) => s.jam === "follower" && s.k >= 24 && s.effective && s.jamF < 0.15 },
      { id: "burn", text: "Fixed frequency against a spot jammer of 10 W or more: close in until 90% of pulses burn through.", check: (s) => s.jam === "spot" && s.pattern === "fixed" && s.pj >= 10 && s.k >= 24 && s.cleanF >= 0.9 },
      { id: "cpi", text: "Keep 8 or more pulses per frequency (enough for Doppler processing) and still beat the follower.", check: (s) => s.jam === "follower" && s.dwell >= 8 && s.k >= 24 && s.effective && s.jamF < 0.15 },
      { id: "esm", text: "Keep the intercept receiver's prediction rate under 15%.", check: (s) => s.pattern !== "fixed" && s.k >= 24 && s.esm < 0.15 },
    ]);

    function changed(fromTour = false) {
      since = 0;
      hist.forEach((p) => { if (p.nch !== S.nch) p.stale = true; });
      if (!anim.playing) { const warm = S.dwell + Math.ceil(S.tr * S.prf) + 1; for (let i = 0; i < ROWS + warm; i++) firePulse(); }
      report(fromTour);
    }

    function report(fromTour = false) {
      const s = stats();
      const snr = snrAt(S.range);
      const wEff = S.jam === "barrage" ? S.bw : S.wj;
      const jnCov = S.jam === "none" ? 0 : (jamPsd(S.pj, S.range, wEff) * Math.min(wEff, BR)) / NOISE;
      const rbSpot = burn(S.wj), rbBar = burn(S.bw), rb = burn(wEff);
      const effective = S.jam !== "none" && S.range > rb;
      const cpiOk = S.dwell >= 8 || S.pattern === "fixed";
      ro.set([
        ["Channel spacing", si(S.bw / S.nch, "Hz", 3)],
        ["Echo S/N (mean RCS)", fmtDb(db(snr)), db(snr) >= DREQ ? "ok" : "warn"],
        ["J/N in a covered channel", S.jam === "none" ? "–" : fmtDb(db(jnCov))],
        ["S/J in a covered channel", S.jam === "none" ? "–" : fmtDb(db(snr / jnCov)), S.jam === "none" ? null : db(snr / jnCov) >= DREQ ? "ok" : "bad"],
        ["Barrage dilution 10 log(<i>B</i>/<i>W</i><sub>spot</sub>)", fmtDb(db(S.bw / Math.min(S.bw, S.wj)))],
        ["Burn-through vs spot", km(rbSpot, 3)],
        ["Burn-through vs barrage", km(rbBar, 3)],
        ["Pulses jammed", s.k ? pct(s.jam, 2) : "collecting…", s.jam > 0.25 ? "bad" : s.jam > 0.1 ? "warn" : "ok"],
        ["Mean <i>P</i><sub>d</sub> per pulse", s.k ? pct(s.pd, 2) : "–"],
        ["<i>P</i><sub>d</sub> over 10 pulses", s.k ? pct(s.cum, 3) : "–"],
        ["ESM prediction hits", s.k ? pct(s.esm, 2) : "–", s.esm < 0.15 ? "ok" : "warn"],
        ["Same-frequency CPI", S.pattern === "fixed" ? "unlimited (fixed)" : `${S.dwell} pulse${S.dwell > 1 ? "s" : ""} · ${si(S.dwell / S.prf, "s", 3)}`, cpiOk || S.pattern === "fixed" ? "ok" : "warn"],
      ]);
      if (S.jam === "none") wfSt.set("info", "No jammer.", `<br>${s.k ? `${pct(s.clean, 2)} of pulses detectable. ` : ""}${cpiOk ? "Dwell is long enough for coherent Doppler filtering." : "Hopping every pulse or two leaves no coherent CPI for Doppler filtering."}`);
      else if (!effective && s.k && s.jam > 0.1) wfSt.set("warn", `Close to burn-through: ${pct(s.jam, 2)} jammed.`, `<br>On average the echo now beats the jamming (burn-through ${km(rb, 3)}), but whenever the target's RCS fades it drops back under. Come closer.`);
      else if (!effective) wfSt.set("ok", "Burned through.", `<br>At ${km(S.range, 3)} the echo beats the jamming even in a covered channel (burn-through ${km(rb, 3)}).`);
      else if (s.k && s.jam < 0.1) wfSt.set("ok", `Jammer defeated: ${pct(s.jam, 2)} of pulses jammed.`, `<br>A covered channel is still ${fmtDb(db(jnCov / snr))} J/S, but the radar is rarely there.`);
      else wfSt.set("bad", s.k ? `${pct(s.jam, 2)} of pulses jammed.` : "Jammer active.", `<br>J/S in a covered channel ${fmtDb(db(jnCov / snr))}; burn-through only inside ${km(rb, 3)}.`);
      if (!fromTour) ch.update({ ...S, k: s.k, jamF: s.jam, cleanF: s.clean, esm: s.esm, effective, rbSpot, rbBarrage: rbBar });
      wf.redraw(); pl.redraw(); es.redraw();
    }

    // ---- drawing
    function drawWaterfall(ctx, w, hh) {
      const T = theme();
      ctx.fillStyle = T.scopeBg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(0, 0, w, hh, 10) : ctx.rect(0, 0, w, hh); ctx.fill();
      const l = 34, r = w - 10, t0 = 26, b = hh - 30;
      const rowH = (b - t0) / ROWS, cw = (r - l) / S.nch;
      ctx.strokeStyle = T.scopeGrid; ctx.lineWidth = 1;
      for (let c = 0; c <= S.nch; c++) { const x = Math.round(l + c * cw) + 0.5; ctx.beginPath(); ctx.moveTo(x, t0); ctx.lineTo(x, b); ctx.stroke(); }
      hist.slice(0, ROWS).forEach((p, i) => {
        if (p.stale) return;
        const y = t0 + i * rowH;
        if (p.jm) {
          // the jammer's actual spectrum, broken into speckles so it reads as noise
          const fx = (f) => l + ((f - (F0 - S.bw / 2)) / S.bw) * (r - l);
          const x0 = clamp(fx(p.jm.fc - p.jm.w / 2), l, r), x1 = clamp(fx(p.jm.fc + p.jm.w / 2), l, r);
          const base = clamp(db(1 + p.jm.jn) / 50, 0.12, 0.9);
          for (let x = x0; x < x1; x += 5) {
            const sp = 0.55 + 0.45 * ((((p.n * 2654435761) ^ (Math.round(x) * 40503)) >>> 0) % 997) / 997;
            ctx.fillStyle = alpha(T.tx, base * sp);
            ctx.fillRect(x, y, Math.min(5, x1 - x), rowH + 0.5);
          }
        }
        ctx.fillStyle = p.st === "clean" ? T.scopeFg : p.st === "jam" ? T.bad : T.warn;
        const pw = Math.max(4, cw * 0.45), px = l + (p.ch + 0.5) * cw - pw / 2, ph = Math.max(2, rowH - 2);
        ctx.fillRect(px, y + 1, pw, ph);
        if (p.jm) { ctx.strokeStyle = T.scopeBg; ctx.lineWidth = 1.5; ctx.strokeRect(px, y + 1, pw, ph); }
      });
      ctx.font = T.font; ctx.fillStyle = T.scopeText; ctx.textBaseline = "top";
      const fl = (f) => `${num(f / 1e9, 4)} GHz`;
      ctx.textAlign = "left"; ctx.fillText(fl(F0 - S.bw / 2), l, b + 6);
      ctx.textAlign = "center"; ctx.fillText(fl(F0), (l + r) / 2, b + 6);
      ctx.textAlign = "right"; ctx.fillText(fl(F0 + S.bw / 2), r, b + 6);
      ctx.save(); ctx.translate(14, (t0 + b) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("← time (newest at top)", 0, 0); ctx.restore();
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const jt = { none: "no jammer", spot: `spot ${si(S.wj, "Hz", 3)}`, barrage: `barrage ${si(S.bw, "Hz", 3)}`, swept: `swept ${si(S.wj, "Hz", 3)}`, follower: `follower, ${si(S.tr, "s", 2)} reaction` }[S.jam];
      ctx.fillText(w < 520 ? `${S.pattern} · ${jt}` : `${S.nch} channels · ${S.pattern} hopping · jammer: ${jt}`, l, 13);
    }

    function drawPulses(ctx, w, hh) {
      const T = theme();
      const N = 64;
      const P = axes(ctx, w, hh, { x: [0, N], y: [-20, 50], xticks: [], ylabel: "S/(N+J) dB", yfmt: (v) => `${v}`, pad: { l: 46, b: 20, t: 10 } });
      const bw = (P.r - P.l) / N;
      hist.slice(0, N).forEach((p, i) => {
        if (p.stale) return;
        const x = P.r - (i + 1) * bw;
        const v = clamp(db(p.sinr), -20, 50), v0 = clamp(db(p.snr), -20, 50);
        ctx.fillStyle = p.st === "clean" ? T.ok : p.st === "jam" ? T.bad : T.warn;
        ctx.fillRect(x + 1, P.Y(v), Math.max(1, bw - 2), P.Y(-20) - P.Y(v));
        ctx.fillStyle = T.muted; ctx.fillRect(x + 1, P.Y(v0) - 1, Math.max(1, bw - 2), 2.5);
      });
      ctx.save(); ctx.setLineDash([5, 4]); polyline(ctx, [[P.l, P.Y(DREQ)], [P.r, P.Y(DREQ)]], T.ink, 1.2); ctx.restore();
      label(ctx, `detection needs ${DREQ} dB`, P.l + 6, P.Y(DREQ) - 11, { color: T.ink, font: T.font, bounds: w });
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText("newest →", P.r, hh - 2);
    }

    function drawEsm(ctx, w, hh) {
      const T = theme();
      const live = hist.filter((p) => !p.stale).slice(0, 64);
      const cnt = new Array(S.nch).fill(0);
      live.forEach((p) => { if (p.ch < S.nch) cnt[p.ch]++; });
      const mx = Math.max(4, ...cnt);
      const P = axes(ctx, w, hh, { x: [0, S.nch], y: [0, mx * 1.15], xticks: [], yticks: [0, mx], ylabel: "uses", yfmt: (v) => num(v, 2), pad: { l: 46, b: 24, t: 50 } });
      const cw = (P.r - P.l) / S.nch;
      const pred = esm.last == null ? null : esm.prev == null ? esm.last : (((2 * esm.last - esm.prev) % S.nch) + S.nch) % S.nch;
      cnt.forEach((v, c) => {
        ctx.fillStyle = c === esm.last ? T.accent : alpha(T.accent, 0.4);
        ctx.fillRect(P.l + c * cw + 1, P.Y(v), Math.max(1, cw - 2), P.b - P.Y(v));
      });
      if (pred != null) {
        const x = P.l + (pred + 0.5) * cw;
        ctx.fillStyle = T.c4; ctx.beginPath(); ctx.moveTo(x, P.b + 2); ctx.lineTo(x - 6, P.b + 12); ctx.lineTo(x + 6, P.b + 12); ctx.closePath(); ctx.fill();
      }
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText("channel", P.r, hh - 1);
      const s = stats();
      const verdict = !s.k ? "listening…" : s.esm > 0.8 ? "pattern learned: it can cue a jammer" : s.esm > 0.3 ? "partly predictable" : "can't predict the next frequency";
      const col = !s.k ? T.muted : s.esm > 0.3 ? T.bad : T.ok;
      label(ctx, `prediction hit rate ${s.k ? pct(s.esm, 2) : "–"}`, 4, 12, { color: col, bounds: w });
      label(ctx, verdict, 4, 34, { color: col, font: T.font, bounds: w });
    }

    // ---- loop
    const anim = api.track(animate((dt) => {
      acc += dt * S.rate;
      let fired = false;
      while (acc >= 1) { acc -= 1; firePulse(); fired = true; }
      if (fired) report();
    }, { target: wf.canvas, playing: !reducedMotion }));
    playButton(wf, anim);

    for (let i = 0; i < ROWS; i++) firePulse();
    report();

    notes(root, "Background", [
      { title: "Agility, hopping and diversity", open: true, html:
        "<p><b>Frequency agility</b> means changing the carrier frequency from pulse to pulse (or burst to burst) over a band of hundreds of MHz, usually pseudo-randomly. <b>Frequency hopping</b> is the general term from communications; radar people tend to say agility. <b>Frequency diversity</b> is different: transmitting on several frequencies at once (separate channels or a multi-tone pulse) and combining the results.</p>" +
        "<p>Why radars hop:</p><ul><li><b>Anti-jamming</b>: a jammer must cover the whole agile band, diluting its power (this lesson).</li>" +
        "<li><b>LPI and anti-ESM</b>: an unpredictable sequence is harder to identify, track and cue jammers against.</li>" +
        "<li><b>Target fluctuation</b>: decorrelates the RCS pulse to pulse (Swerling 1 → 2), so deep fades don't last a whole dwell. This can cut the SNR needed for 90 % detection by several dB.</li>" +
        "<li><b>Glint and multipath</b>: angle errors and sea-surface nulls change with frequency, so averaging over frequency smooths them.</li>" +
        "<li><b>Interference</b>: radars sharing a band (ships in a task group, airports) step out of each other's way.</li></ul>" },
      { title: "Jamming budget and burn-through", html:
        "<p>For a self-protection jammer on the target, at range <i>R</i>, with the radar's receiver bandwidth <i>B</i><sub>r</sub> inside the jammer's bandwidth <i>B</i><sub>J</sub>:</p>" +
        "<p class=\"eq\"><i>S</i> = <span class=\"frac\"><span><i>P</i><sub>t</sub> <i>G</i><sup>2</sup> λ<sup>2</sup> σ</span><span>(4π)<sup>3</sup> <i>R</i><sup>4</sup></span></span> &nbsp;&nbsp; <i>J</i> = <span class=\"frac\"><span><i>P</i><sub>J</sub> <i>G</i><sub>J</sub> <i>G</i> λ<sup>2</sup></span><span>(4π)<sup>2</sup> <i>R</i><sup>2</sup></span></span> · <span class=\"frac\"><span><i>B</i><sub>r</sub></span><span><i>B</i><sub>J</sub></span></span></p>" +
        "<p class=\"eq\"><span class=\"frac\"><span><i>J</i></span><span><i>S</i></span></span> = <span class=\"frac\"><span><i>P</i><sub>J</sub> <i>G</i><sub>J</sub> 4π <i>R</i><sup>2</sup></span><span><i>P</i><sub>t</sub> <i>G</i> σ</span></span> · <span class=\"frac\"><span><i>B</i><sub>r</sub></span><span><i>B</i><sub>J</sub></span></span></p>" +
        "<p>Pulse compression gains the radar a further factor <i>B</i><sub>r</sub>τ against noise-like jamming, which is why the formula in the tour has <i>P</i><sub>t</sub>τ (energy). Because <i>J</i>/<i>S</i> ∝ <i>R</i><sup>2</sup>, there is always a <b>burn-through range</b> inside which the echo wins. Spreading a jammer over <i>N</i> times the bandwidth cuts <i>J</i> per channel by <i>N</i> and so multiplies <i>R</i><sub>BT</sub> by √<i>N</i>.</p>" +
        "<p>This lesson's radar: 200 kW peak, 36 dBi, 10 µs pulses compressed in 2 MHz, 4 dB noise figure, 13 dB needed per pulse; target 5 m² mean RCS; jammer gain 6 dBi. Sidelobe jamming from a stand-off jammer is the same equation with the radar's sidelobe gain, which is why low sidelobes matter.</p>" },
      { title: "Jammer types", html:
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Type</th><th>How it works</th><th>Answer</th></tr>" +
        "<tr><td>Spot noise</td><td>All power in a narrow band on the radar's frequency</td><td>Hop outside it</td></tr>" +
        "<tr><td>Barrage</td><td>Noise over the whole agile band</td><td>Wider agile band, burn-through, sidelobe blanking, more power</td></tr>" +
        "<tr><td>Swept spot</td><td>A narrow spot swept across the band</td><td>Random hopping; the radar loses only pulses that collide</td></tr>" +
        "<tr><td>Follower / responsive</td><td>Measures each pulse, then tunes to it after a reaction time</td><td>Change frequency faster than the reaction time</td></tr>" +
        "<tr><td>DRFM repeater</td><td>Digitally stores the pulse and plays back delayed or shifted copies (false targets, range-gate pull-off)</td><td>Intra-pulse coding, pulse-to-pulse diversity, leading-edge tracking</td></tr></table></div>" +
        "<p>A DRFM can respond within one pulse, so pulse-to-pulse agility alone doesn't defeat repeat jamming; it does stop the jammer from <i>anticipating</i> the next pulse, which matters for false targets placed in front of the real one.</p>" },
      { title: "The coherent processing problem", html:
        "<p>Doppler processing (MTI, pulse-Doppler FFTs) compares the phase of successive echoes from the same range cell. If the carrier changes, the phase change from pulse to pulse is dominated by 4π Δ<i>f</i> <i>R</i>/<i>c</i>, not by target motion, and the clutter no longer cancels. So radars that need Doppler hop <b>CPI to CPI</b> (each coherent processing interval of 8–64 pulses on one frequency) rather than pulse to pulse.</p>" +
        "<p>That's the trade the follower challenge exposes: the CPI must be shorter than the jammer's reaction time, so a long CPI needs a high PRF, or the radar accepts that part of each CPI is jammed. Some modern radars recover coherence across hops with stepped-frequency processing or by compensating each pulse's phase.</p>" },
      { title: "Stepped-frequency waveforms", html:
        "<p>Hopping in a regular staircase isn't only a defensive measure. A <b>stepped-frequency</b> waveform sends <i>N</i> narrowband pulses at <i>f</i><sub>0</sub>, <i>f</i><sub>0</sub> + Δ<i>f</i>, … and records each echo's phase. An inverse FFT across the steps gives a high-resolution range profile with</p>" +
        "<p class=\"eq\">Δ<i>R</i> = <span class=\"frac\"><span><i>c</i></span><span>2 <i>N</i> Δ<i>f</i></span></span> &nbsp;&nbsp; unambiguous window = <span class=\"frac\"><span><i>c</i></span><span>2 Δ<i>f</i></span></span></p>" +
        "<p>so 64 steps of 10 MHz give 0.23 m resolution from 10 MHz receivers, at the cost of a long dwell and sensitivity to target motion.</p>" },
      { title: "Seeded pseudo-random sequences", html:
        "<p>The radar and its own receiver must agree on the next frequency, so \"random\" hopping really uses a pseudo-random generator from a secret seed (often a cryptographic one). To an ESM receiver without the seed it is unpredictable, so it must watch the whole band at once, which costs it sensitivity: a wideband receiver collects more noise. Combined with low peak power and long coded pulses, this is how LPI radars stay below the threshold of intercept receivers.</p>" },
    ]);

    api.quiz(root, [
      { q: "A 100 W jammer switches from a 20 MHz spot to a 500 MHz barrage. How much does the jamming in each radar channel change?", options: ["No change: it's the same jammer", "About 14 dB weaker", "About 25 dB weaker", "About 3 dB weaker"], answer: 1,
        why: "The power is spread 500/20 = 25 times thinner: 10·log₁₀(25) ≈ 14 dB less per MHz. That's why agility over a wide band is effective against noise jammers." },
      { q: "Why does a jammer always lose if the radar gets close enough?", options: ["The jammer's battery runs out", "The echo grows as 1/R⁴ but the jamming only as 1/R²", "Radars transmit more power at short range", "Jammers only work at long range by law"], answer: 1,
        why: "Closing in from R to R/2 makes the echo 16× stronger but the jamming only 4× stronger, so S/J improves by 6 dB per halving of range until burn-through." },
      { q: "A follower jammer reacts in 200 µs. A radar dwells 8 pulses per frequency at a PRF of 2 kHz. Roughly what fraction of its pulses get jammed?", options: ["None", "About 1/8", "About 7/8", "All of them"], answer: 2,
        why: "The dwell lasts 4 ms; the jammer catches up after 200 µs, before the second pulse 500 µs later. Only the first pulse of each dwell escapes, so 7/8 are jammed." },
      { q: "Why can't a pulse-Doppler radar simply hop on every pulse?", options: ["Hopping wastes transmitter power", "Doppler processing needs the same frequency across the pulses it compares", "The antenna can't change frequency that fast", "It would make the range ambiguous"], answer: 1,
        why: "Doppler filtering looks at the pulse-to-pulse phase change from a range cell. A frequency change adds a large, range-dependent phase step, so radars hop between CPIs instead." },
    ]);
  },
};
