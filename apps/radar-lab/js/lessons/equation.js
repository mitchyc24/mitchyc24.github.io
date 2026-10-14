// Lesson 3: the radar range equation. Power spreads out on the way to the target and again on the way back,
// so the echo falls as 1/R⁴; everything else in the equation is a way to buy that back.
import {
  h, C0, KB, T0, card, labGrid, group, notes, slider, choice, button, readout, legend,
  canvasView, drag, animate, playButton, axes, theme, alpha, label, plotFn, num, si, km, fmtDb, db, undb, clamp, TAU, reducedMotion,
} from "../ui.js";

const ETA = 0.6;                          // dish aperture efficiency
const FOUR_PI3_DB = db((4 * Math.PI) ** 3); // 32.98 dB
const KT0_DB = db(KB * T0);                 // −203.98 dBW/Hz
const NC_EXP = 0.8;                       // noncoherent integration gain ≈ N^0.8 (rule of thumb)
const RCS_PRESETS = [[0.01, "Drone"], [0.1, "Missile"], [1, "Person"], [5, "Fighter"], [100, "Airliner"], [1e4, "Ship"]];
const DEFAULTS = { pt: 1e6, antMode: "gain", gDb: 36, dia: 4, f: 3e9, rcs: 1, r: 100e3, bw: 1e6, nf: 3, loss: 6, n: 1, integ: "coh", snrMin: 13 };
const STAGES = ["Out to the target", "Target intercepts σ", "Scattered back", "Caught by the dish"];

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "How far can a radar see? The radar equation answers that by following the power: out to the target, back to the antenna, and into a receiver full of noise. " +
      "It explains why echoes are so astonishingly weak, why range is so expensive, and which knobs actually help." }));

    const E = { ...DEFAULTS };
    let D = {};
    let base = null;
    const V = { stage: 0, prog: 1 }; // spreading picture

    const tour = api.steps(root, [
      { title: "1 · Power spreads over a sphere", html:
        "<p>The transmitter radiates <i>P</i><sub>t</sub> watts. Spread evenly over a sphere of radius <i>R</i> that would be <i>P</i><sub>t</sub>/(4π<i>R</i>²) per square metre; the antenna concentrates it into a beam, multiplying by its <b>gain</b> <i>G</i>:</p>" +
        "<p class=\"eq\"><i>S</i><sub>1</sub> = <span class=\"frac\"><span><i>P</i><sub>t</sub> <i>G</i></span><span>4π<i>R</i>²</span></span> &nbsp; W/m²</p><p>Twice as far, the same power covers four times the area.</p>",
        look: "the spreading picture: the beam's footprint grows with R², so the power density falls with 1/R².",
        apply: () => { set({}); showStage(0); } },
      { title: "2 · The target sends some back", html:
        "<p>The target intercepts and re-radiates <i>S</i><sub>1</sub>·σ watts, where σ is its <b>radar cross-section</b>. Treated as an isotropic re-radiator, that power spreads over another sphere on the way home:</p>" +
        "<p class=\"eq\"><i>S</i><sub>2</sub> = <span class=\"frac\"><span><i>S</i><sub>1</sub> σ</span><span>4π<i>R</i>²</span></span></p><p>The dish catches <i>S</i><sub>2</sub> over its effective area <i>A</i><sub>e</sub> = <i>G</i>λ²/4π.</p>",
        look: "the second set of spheres growing from the target, and the tiny fraction that lands on the dish.",
        apply: () => showStage(3) },
      { title: "3 · Two trips make R⁴", html:
        "<p>Multiply it all together and the two 1/<i>R</i>² factors become 1/<i>R</i>⁴:</p>" +
        "<p class=\"eq\"><i>P</i><sub>r</sub> = <span class=\"frac\"><span><i>P</i><sub>t</sub> <i>G</i>² λ² σ</span><span>(4π)³ <i>R</i>⁴ <i>L</i></span></span></p>" +
        "<p>Double the range and the echo drops 16 times (−12 dB); ten times the range costs 40 dB.</p>",
        look: "the SNR curve: it falls 40 dB per decade of range. The target is now at 200 km, 12 dB below where it was at 100 km.",
        apply: () => set({ r: 200e3 }) },
      { title: "4 · Read the budget in dB", html:
        "<p>In decibels the products become sums, and the radar equation becomes a <b>link budget</b>: add the gains, subtract the losses. " +
        "Range is by far the biggest bill: 1/<i>R</i>⁴ at 100 km is −200 dB.</p>",
        look: "the budget chart. Green terms help, red terms hurt; the totals are the received power and the SNR.",
        apply: () => set({}) },
      { title: "5 · Noise sets the floor", html:
        "<p>The echo has to compete with thermal noise <i>N</i> = <i>k T</i><sub>0</sub> <i>B F</i>: Boltzmann's constant × 290 K × the receiver bandwidth × its noise figure. " +
        "A 10 MHz receiver with an 8 dB noise figure lets in 15 dB more noise than a 1 MHz, 3 dB one.</p>",
        look: "the noise bar in the budget and the SNR curve sliding down.",
        apply: () => set({ bw: 10e6, nf: 8 }) },
      { title: "6 · The fourth-root law", html:
        "<p>Because <i>R</i><sub>max</sub> ∝ (everything else)<sup>1/4</sup>, range is brutally expensive. A baseline with 500 kW has been pinned; now the power is 8 MW, <b>16 times</b> as much (+12 dB), and the range has only <b>doubled</b>.</p>",
        look: "the dashed baseline curve and the two R<sub>max</sub> markers on the SNR plot.",
        apply: () => { set({ pt: 5e5 }); pin(); set({ pt: 8e6 }); } },
      { title: "7 · Wavelength: what are you holding fixed?", html:
        "<p>λ² sits on top of the equation, so lower frequencies look better. But that's only true if the <b>gain</b> is fixed. For a dish of fixed <b>size</b>, gain grows as 1/λ² and <i>P</i><sub>r</sub> ∝ <i>A</i><sub>e</sub>²/λ², so <em>higher</em> frequencies win.</p>",
        look: "switch between “Keep gain fixed” and “Keep dish size fixed” and slide the frequency.",
        apply: () => { clearBase(); set({ antMode: "size", dia: 4, f: 3e9 }); pin(); set({ f: 10e9 }); } },
    ]);

    const lab = labGrid(root);

    // ---- spreading picture
    const spCard = card(lab.main, "Where the power goes", "live numbers from your settings");
    const stageCh = choice(spCard, { aria: "Stage", value: 0, options: ["1 Out", "2 Intercept", "3 Scatter", "4 Catch"].map((s, i) => [i, s]), onChange: (v) => { anim.pause(); showStage(v); } });
    stageCh.el.style.marginBottom = "8px";
    const sp = api.track(canvasView(spCard, { aspect: 2.5, minHeight: 210, maxHeight: 320, draw: drawSpread, label: "Power spreading out from the radar to the target and back" }));
    const spEq = h("div", { class: "small", style: { marginTop: "8px", lineHeight: "1.7" } });
    spCard.append(spEq);

    // ---- SNR vs range
    const plCard = card(lab.main, "Signal-to-noise ratio against range", "drag along the plot to move the target");
    const pl = api.track(canvasView(plCard, { aspect: 2, minHeight: 240, maxHeight: 400, draw: drawPlot, label: "SNR against range on a log scale with the detection threshold" }));
    drag(pl, { move: (x) => { if (!pl.P) return; E.r = clamp(pl.P.invX(x), 1, 3000) * 1000; rSl.value = E.r / 1000; changed(); } });
    const pinRow = h("div", { class: "btn-row" });
    plCard.append(pinRow);
    const pinBtn = button(pinRow, "Pin as baseline", () => pin(), "small");
    const clrBtn = button(pinRow, "Clear baseline", () => clearBase(), "ghost small");
    legend(plCard, [[theme().accent, "SNR now"], [theme().muted, "pinned baseline (dashed)"], [theme().warn, "required SNR"]]);

    // ---- budget waterfall
    const bdCard = card(lab.main, "The budget in decibels", "each term adds or subtracts");
    const ROWS = 13;
    const bd = api.track(canvasView(bdCard, { height: () => ROWS * 26 + 44, draw: drawBudget, label: "Waterfall chart of each radar-equation term in decibels adding up to the SNR" }));
    bdCard.append(h("p", { class: "caption", html: "dBW is decibels relative to 1 W. Adding −(noise power) turns watts into a ratio: SNR = <i>P</i><sub>r</sub> − <i>N</i> in dB." }));

    // ---- controls
    const ctl = card(lab.side, "Controls");
    const gT = group(ctl, "Transmitter");
    const ptSl = slider(gT, { label: "Peak power <i>P</i><sub>t</sub>", min: 1, max: 1e7, log: true, value: E.pt, format: (v) => `${si(v, "W")} · ${fmtDb(db(v), "dBW")}`, onInput: (v) => { E.pt = v; changed(); } });
    const fSl = slider(gT, { label: "Frequency", min: 0.1e9, max: 100e9, log: true, value: E.f, format: (v) => `${si(v, "Hz")} · λ ${si(C0 / v, "m")}`, onInput: (v) => { E.f = v; changed(); } });
    const gA = group(ctl, "Antenna");
    const modeCh = choice(gA, { label: "When the frequency changes…", value: E.antMode, options: [["gain", "Keep gain fixed"], ["size", "Keep dish size fixed"]], onChange: (v) => setMode(v) });
    const gSl = slider(gA, { label: "Gain <i>G</i>", min: 10, max: 50, step: 0.5, value: E.gDb, format: (v) => `${num(v, 3)} dBi`, onInput: (v) => { E.gDb = v; changed(); } });
    const dSl = slider(gA, { label: "Dish diameter", min: 0.1, max: 30, log: true, value: E.dia, format: (v) => si(v, "m"), onInput: (v) => { E.dia = v; changed(); } });
    const gTg = group(ctl, "Target");
    const rcsCh = choice(gTg, { label: "Radar cross-section σ", value: E.rcs, options: RCS_PRESETS.map(([v, n]) => [v, n]), onChange: (v) => { E.rcs = v; rcsSl.value = v; changed(); } });
    const rcsSl = slider(gTg, { label: "σ", min: 1e-4, max: 1e5, log: true, value: E.rcs, format: (v) => `${num(v, 3)} m² · ${fmtDb(db(v), "dBsm")}`, onInput: (v) => { E.rcs = v; changed(); } });
    const rSl = slider(gTg, { label: "Range <i>R</i>", min: 1, max: 3000, log: true, value: E.r / 1000, format: (v) => km(v * 1000), onInput: (v) => { E.r = v * 1000; changed(); } });
    const gR = group(ctl, "Receiver");
    const bwSl = slider(gR, { label: "Bandwidth <i>B</i>", min: 1e4, max: 1e8, log: true, value: E.bw, format: (v) => `${si(v, "Hz")} (τ ≈ ${si(1 / v, "s")})`, onInput: (v) => { E.bw = v; changed(); } });
    const nfSl = slider(gR, { label: "Noise figure <i>F</i>", min: 0, max: 15, step: 0.5, value: E.nf, format: (v) => `${num(v, 3)} dB`, onInput: (v) => { E.nf = v; changed(); } });
    const lSl = slider(gR, { label: "System losses <i>L</i>", min: 0, max: 20, step: 0.5, value: E.loss, format: (v) => `${num(v, 3)} dB`, onInput: (v) => { E.loss = v; changed(); } });
    const gP = group(ctl, "Processing & detection");
    const nSl = slider(gP, { label: "Pulses integrated <i>N</i>", min: 1, max: 1024, log: true, step: 1, value: E.n, format: (v) => `${v}`, onInput: (v) => { E.n = v; changed(); } });
    const intCh = choice(gP, { value: E.integ, aria: "Integration type", options: [["coh", "Coherent (×N)"], ["nc", "Noncoherent (≈N<sup>0.8</sup>)"]], onChange: (v) => { E.integ = v; changed(); } });
    const smSl = slider(gP, { label: "Required SNR", min: 0, max: 25, step: 0.5, value: E.snrMin, format: (v) => `${num(v, 3)} dB`, help: "13 dB gives about 90 % detection at a 10⁻⁶ false-alarm rate for a steady target (lesson 9).", onInput: (v) => { E.snrMin = v; changed(); } });

    const outCard = card(lab.side, "Results");
    const ro = readout(outCard);

    const ch = api.challenges(root, [
      { id: "drone", text: "Counter-drone: detect a 0.01 m² drone at 20 km with a transmitter of 1 kW or less (keep the required SNR at 13 dB or more).", check: (s) => s.E.rcs <= 0.0105 && s.E.r >= 19.9e3 && s.E.pt <= 1020 && s.E.snrMin >= 13 && s.D.snr >= s.E.snrMin },
      { id: "double", text: "Pin a baseline, then <b>double</b> R<sub>max</sub> using transmit power alone. How many times the power did it take?", check: (s) => s.base && sameExcept(s.base.E, ["pt", "r"]) && s.D.rmax >= 1.98 * s.base.D.rmax },
      { id: "stealth", text: "Pin a baseline, then cut the RCS by 30 dB (to 1/1000), as a stealth design might. What fraction of R<sub>max</sub> is left?", check: (s) => s.base && sameExcept(s.base.E, ["rcs", "r"]) && db(s.E.rcs / s.base.E.rcs) <= -29.5 },
      { id: "freq", text: "Keep the dish size fixed, pin a baseline, then double the frequency. Does R<sub>max</sub> go up or down?", check: (s) => s.base && s.E.antMode === "size" && sameExcept(s.base.E, ["f", "r"]) && s.E.f >= 1.9 * s.base.E.f && s.D.rmax > s.base.D.rmax },
      { id: "integ", text: "Detect a 1 m² target at 300 km without exceeding 1 MW, by integrating pulses.", check: (s) => Math.abs(db(s.E.rcs)) < 0.25 && s.E.r >= 297e3 && s.E.pt <= 1.001e6 && s.E.n > 1 && s.E.snrMin >= 13 && s.D.snr >= s.E.snrMin },
      { id: "long", text: "Build a long-range radar: R<sub>max</sub> ≥ 500 km for a 1 m² target with at most 1 MW, a single pulse and 13 dB required SNR.", check: (s) => Math.abs(db(s.E.rcs)) < 0.25 && s.E.pt <= 1.001e6 && s.E.n === 1 && s.E.snrMin >= 13 && s.D.rmax >= 500e3 },
    ]);

    // ---- model
    function compute(e) {
      const lam = C0 / e.f;
      let G, dia;
      if (e.antMode === "gain") { G = undb(e.gDb); dia = Math.sqrt((G / ETA) * (lam / Math.PI) ** 2); }
      else { dia = e.dia; G = ETA * ((Math.PI * dia) / lam) ** 2; }
      const gDb = db(G), ae = (G * lam * lam) / (4 * Math.PI);
      const terms = [
        ["Pₜ transmit power", db(e.pt)], ["G transmit gain", gDb], ["G receive gain", gDb], ["λ² wavelength", 20 * Math.log10(lam)],
        ["σ cross-section", db(e.rcs)], ["1/(4π)³", -FOUR_PI3_DB], ["1/R⁴ range", -40 * Math.log10(e.r)], ["1/L losses", -e.loss],
      ];
      const prDbW = terms.reduce((s, t) => s + t[1], 0);
      const nDbW = KT0_DB + db(e.bw) + e.nf;
      const gi = e.integ === "coh" ? db(e.n) : NC_EXP * db(e.n);
      const snr1 = prDbW - nDbW, snr = snr1 + gi;
      const rmax = e.r * 10 ** ((snr - e.snrMin) / 40);
      return { lam, G, gDb, dia, ae, terms, prDbW, nDbW, gi, snr1, snr, rmax, bw: (70 * lam) / dia };
    }
    function sameExcept(b, keys) {
      for (const k of Object.keys(DEFAULTS)) {
        if (keys.includes(k)) continue;
        if (k === "gDb" && E.antMode === "size") continue;
        if (k === "dia" && E.antMode === "gain") continue;
        const a = E[k], c = b[k];
        if (typeof a === "number" ? Math.abs(a - c) > 1e-6 * Math.max(1, Math.abs(c)) : a !== c) return false;
      }
      return true;
    }

    function set(cfg) {
      Object.assign(E, DEFAULTS, cfg);
      ptSl.value = E.pt; fSl.value = E.f; modeCh.value = E.antMode; gSl.value = E.gDb; dSl.value = E.dia;
      rcsSl.value = E.rcs; rSl.value = E.r / 1000; bwSl.value = E.bw; nfSl.value = E.nf; lSl.value = E.loss;
      nSl.value = E.n; intCh.value = E.integ; smSl.value = E.snrMin;
      changed();
    }
    function setMode(m) {
      const cur = compute(E);
      E.antMode = m;
      if (m === "size") { E.dia = clamp(cur.dia, 0.1, 30); dSl.value = E.dia; }
      else { E.gDb = clamp(Math.round(cur.gDb * 2) / 2, 10, 50); gSl.value = E.gDb; }
      changed();
    }
    function pin() { base = { E: { ...E }, D: compute(E) }; changed(); }
    function clearBase() { base = null; changed(); }
    function showStage(s) { anim.pause(); V.stage = s; V.prog = 1; stageCh.value = s; paintEq(); sp.redraw(); }

    function changed() {
      D = compute(E);
      gSl.el.style.display = E.antMode === "gain" ? "" : "none";
      dSl.el.style.display = E.antMode === "size" ? "" : "none";
      rcsCh.value = RCS_PRESETS.find(([v]) => Math.abs(db(v / E.rcs)) < 0.05)?.[0];
      clrBtn.disabled = !base;
      pinBtn.textContent = base ? "Re-pin baseline" : "Pin as baseline";
      const det = D.snr >= E.snrMin;
      const rows = [
        ["Wavelength λ", si(D.lam, "m")],
        ["Gain · dish", `${num(D.gDb, 3)} dBi · ${si(D.dia, "m")}`],
        ["Effective area <i>A</i><sub>e</sub>", `${num(D.ae, 3)} m²`],
        ["Beamwidth ≈ 70λ/D", `${num(D.bw, 3)}°`],
        ["Received power <i>P</i><sub>r</sub>", `${fmtDb(D.prDbW + 30, "dBm")} · ${si(undb(D.prDbW), "W")}`],
        ["Noise <i>kT</i><sub>0</sub><i>BF</i>", `${fmtDb(D.nDbW + 30, "dBm")}`],
        ["SNR, one pulse", fmtDb(D.snr1)],
        [`Integration gain (${E.n} pulse${E.n > 1 ? "s" : ""})`, `+${D.gi.toFixed(1)} dB`],
        ["SNR", fmtDb(D.snr), det ? "ok" : "bad"],
        ["Detected?", det ? `yes, ${fmtDb(D.snr - E.snrMin)} margin` : `no, ${fmtDb(E.snrMin - D.snr)} short`, det ? "ok" : "bad"],
        ["<i>R</i><sub>max</sub>", km(D.rmax)],
      ];
      if (base) rows.push(["<i>R</i><sub>max</sub> vs baseline", `×${num(D.rmax / base.D.rmax, 3)} (${fmtDb(D.snr - base.D.snr - 40 * Math.log10(E.r / base.E.r))} budget change)`]);
      ro.set(rows);
      ch.update({ E, D, base });
      paintEq();
      sp.redraw(); pl.redraw(); bd.redraw();
    }

    // ---- spreading picture
    const sci = (x) => num(x, 3).replace(/×10\^(\S+)/, (m, e) => `×10<sup>${e.replace("-", "−")}</sup>`);
    function paintEq() {
      if (!D.G) return;
      const s1 = (E.pt * D.G) / (4 * Math.PI * E.r ** 2), ps = s1 * E.rcs, s2 = ps / (4 * Math.PI * E.r ** 2), pr = s2 * D.ae;
      const lines = [
        `<b>1.</b> Power density at the target: <i>S</i><sub>1</sub> = <i>P</i><sub>t</sub><i>G</i> / 4π<i>R</i>² = ${si(E.pt, "W")} × ${num(D.G, 3)} / (4π × (${km(E.r)})²) = <b>${sci(s1)} W/m²</b>`,
        `<b>2.</b> Power the target scatters: <i>P</i><sub>σ</sub> = <i>S</i><sub>1</sub>σ = ${sci(s1)} × ${num(E.rcs, 3)} m² = <b>${si(ps, "W")}</b>`,
        `<b>3.</b> Density back at the radar: <i>S</i><sub>2</sub> = <i>P</i><sub>σ</sub> / 4π<i>R</i>² = <b>${sci(s2)} W/m²</b>`,
        `<b>4.</b> Caught by the dish: <i>P</i><sub>r</sub> = <i>S</i><sub>2</sub><i>A</i><sub>e</sub> = ${sci(s2)} × ${num(D.ae, 3)} m² = <b>${si(pr, "W")}</b> (${fmtDb(db(pr) + 30, "dBm")}, before the ${num(E.loss, 3)} dB of losses)`,
      ];
      spEq.innerHTML = lines.map((l, i) => `<div style="color:var(--${i === V.stage ? "ink" : "muted"});${i === V.stage ? "" : "opacity:.75"}">${l}</div>`).join("");
    }

    function drawSpread(ctx, w, hh) {
      const T = theme();
      const ax = 46, ay = hh / 2 + 6, tx = w - 60, ty = ay;
      const Dpx = tx - ax, half = 0.2;
      const st = V.stage, p = V.prog;
      ctx.fillStyle = T.surface2; ctx.fillRect(0, 0, w, hh);
      // beam cone
      ctx.fillStyle = alpha(T.tx, 0.06);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.arc(ax, ay, Dpx * 1.08, -half, half); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = alpha(T.tx, 0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + Dpx * 1.08 * Math.cos(half), ay - Dpx * 1.08 * Math.sin(half)); ctx.moveTo(ax, ay); ctx.lineTo(ax + Dpx * 1.08 * Math.cos(half), ay + Dpx * 1.08 * Math.sin(half)); ctx.stroke();
      // outgoing wavefronts: brightness ∝ 1/r² (power density)
      const front = st === 0 ? p * Dpx : Dpx;
      const r0 = Dpx * 0.18;
      for (let r = front; r > 6; r -= Dpx / 9) {
        const a = clamp((r0 / r) ** 2, 0.06, 1);
        ctx.strokeStyle = alpha(T.tx, a); ctx.lineWidth = 2 + 3 * a;
        ctx.beginPath(); ctx.arc(ax, ay, r, -half, half); ctx.stroke();
      }
      // footprint brackets at R/2 and R: same angle, twice the width → four times the area
      const brk = (r, txt, col) => {
        const y0 = ay - r * Math.sin(half), y1 = ay + r * Math.sin(half), x = ax + r * Math.cos(half) + 4;
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x - 4, y0); ctx.lineTo(x, y0); ctx.lineTo(x, y1); ctx.lineTo(x - 4, y1); ctx.stroke();
        label(ctx, txt, x + 4, y0 - 2, { color: col, bounds: w, font: T.font });
      };
      if (st === 0 && p > 0.5) brk(Dpx * 0.5, "R/2: density 4×", T.muted);
      if (st === 0 && p > 0.95) brk(Dpx * 0.98, "R: area 4×, density ¼", T.tx);
      // echo spheres from the target (isotropic), brightness ∝ 1/r²
      if (st >= 2) {
        const back = st === 2 ? p * Dpx : Dpx;
        for (let r = back; r > 6; r -= Dpx / 9) {
          const a = clamp((r0 / r) ** 2 * 0.7, 0.05, 0.8);
          ctx.strokeStyle = alpha(T.rx, a); ctx.lineWidth = 1.5 + 2 * a;
          ctx.beginPath(); ctx.arc(tx, ty, r, 0, TAU); ctx.stroke();
        }
      }
      // target with its σ "disc"
      const hit = st >= 1;
      ctx.fillStyle = hit ? alpha(T.tgt, 0.25) : alpha(T.tgt, 0.1);
      ctx.beginPath(); ctx.arc(tx, ty, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = T.tgt; ctx.beginPath(); ctx.arc(tx, ty, 5, 0, TAU); ctx.fill();
      if (st === 1) label(ctx, "intercepts S₁·σ", tx, ty - 30, { align: "center", color: T.tgt, bounds: w });
      if (st === 2) label(ctx, "re-radiates in all directions", tx, ty - 30, { align: "right", color: T.rx, bounds: w });
      // radar dish, aperture glows when catching the echo
      ctx.strokeStyle = T.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(ax - 6, ay, 7, 22, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.fillStyle = T.ink; ctx.fillRect(ax - 18, ay + 20, 4, hh - ay - 26);
      if (st === 3) {
        ctx.fillStyle = alpha(T.rx, 0.45); ctx.fillRect(ax - 2, ay - 22, 7, 44);
        label(ctx, `catches S₂ × Aₑ (${num(D.ae, 2)} m²)`, ax + 12, ay + 40, { color: T.rx, bounds: w });
      }
      ctx.font = T.fontB; ctx.fillStyle = T.ink; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText("radar", ax - 8, 8);
      ctx.textBaseline = "top"; ctx.fillText("target", tx, ty + 22);
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textBaseline = "bottom";
      ctx.fillText(`R = ${km(E.r)}  ·  stage ${st + 1}: ${STAGES[st]}`, w / 2, hh - 4);
    }

    // ---- SNR vs range plot
    function drawPlot(ctx, w, hh) {
      const T = theme();
      const y0 = Math.round(E.snrMin - 40), y1 = Math.round(E.snrMin + 60);
      const P = axes(ctx, w, hh, { x: [1, 3000], y: [y0, y1], xlog: true, xlabel: "range (km)", ylabel: "SNR (dB)", xfmt: (v) => num(v), pad: { l: 50, b: 34, t: 14, r: 16 } });
      pl.P = P;
      const snrAt = (d, rk) => d.snr - 40 * Math.log10((rk * 1000) / E.r);
      const snrB = base ? (rk) => base.D.snr - 40 * Math.log10((rk * 1000) / base.E.r) : null;
      P.clip();
      // detectable region: under the curve and above the threshold
      const rmaxK = clamp(D.rmax / 1000, 1, 3000);
      ctx.fillStyle = alpha(T.ok, 0.13);
      ctx.beginPath(); ctx.moveTo(P.X(1), P.Y(E.snrMin));
      for (let i = 0; i <= 60; i++) { const rk = 1 * rmaxK ** (i / 60); ctx.lineTo(P.X(rk), P.Y(snrAt(D, rk))); }
      ctx.lineTo(P.X(rmaxK), P.Y(E.snrMin)); ctx.closePath(); ctx.fill();
      // threshold
      ctx.strokeStyle = T.warn; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(P.l, P.Y(E.snrMin)); ctx.lineTo(P.r, P.Y(E.snrMin)); ctx.stroke(); ctx.setLineDash([]);
      if (snrB) plotFn(ctx, P, snrB, 1, 3000, T.muted, 2, 40, { xlog: true, dash: [6, 5] });
      plotFn(ctx, P, (rk) => snrAt(D, rk), 1, 3000, T.accent, 2.5, 40, { xlog: true });
      // Rmax markers
      const vline = (rk, col, txt, yy) => {
        if (rk < 1 || rk > 3000) return;
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(P.X(rk), P.t); ctx.lineTo(P.X(rk), P.b); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, txt, P.X(rk) + 4, yy, { color: col, bounds: w });
      };
      if (base) vline(base.D.rmax / 1000, T.muted, `baseline ${km(base.D.rmax)}`, P.t + 32);
      vline(D.rmax / 1000, T.accent, `Rmax ${km(D.rmax)}`, P.t + 10);
      // slope note
      const xs = 3;
      const ys = snrAt(D, xs);
      if (ys < y1 - 6 && ys > y0 + 6) label(ctx, "−40 dB per decade", P.X(xs) + 6, P.Y(ys) - 14, { color: T.accent, bounds: w, font: T.font });
      P.unclip();
      label(ctx, `required ${num(E.snrMin, 3)} dB`, P.r - 4, P.Y(E.snrMin) + 14, { align: "right", color: T.warn });
      // current target
      const rk = E.r / 1000, s = D.snr, det = s >= E.snrMin;
      const py = P.Y(clamp(s, y0, y1));
      ctx.fillStyle = det ? T.ok : T.bad; ctx.strokeStyle = T.surface; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(P.X(rk), py, 7, 0, TAU); ctx.fill(); ctx.stroke();
      const right = P.X(rk) < (P.l + P.r) / 2;
      label(ctx, `${fmtDb(s)} at ${km(E.r)}${s > y1 || s < y0 ? " (off scale)" : ""}`, P.X(rk) + (right ? 12 : -12), py + (py < P.t + 50 ? 22 : -20), { align: right ? "left" : "right", color: det ? T.ok : T.bad, bounds: w });
    }

    // ---- waterfall
    function drawBudget(ctx, w, hh) {
      const T = theme();
      const rows = [];
      let cum = 0;
      for (const [name, v] of D.terms) { rows.push({ name, a: cum, b: cum + v, v, kind: "step" }); cum += v; }
      rows.push({ name: "= Pr received", a: 0, b: cum, v: cum, kind: "total", unit: "dBW" });
      rows.push({ name: "1/(kT₀BF) noise", a: cum, b: cum - D.nDbW, v: -D.nDbW, kind: "step" }); cum -= D.nDbW;
      rows.push({ name: "= SNR one pulse", a: 0, b: cum, v: cum, kind: "total", unit: "dB" });
      rows.push({ name: `integration (N=${E.n})`, a: cum, b: cum + D.gi, v: D.gi, kind: "step" }); cum += D.gi;
      rows.push({ name: "= SNR", a: 0, b: cum, v: cum, kind: "final", unit: "dB" });
      const narrow = w < 520;
      const lw = narrow ? 112 : 150, vw = narrow ? 50 : 62;
      const all = rows.flatMap((r) => [r.a, r.b]).concat([0, E.snrMin]);
      const lo = Math.floor((Math.min(...all) - 5) / 50) * 50, hi = Math.ceil((Math.max(...all) + 5) / 50) * 50;
      const l = lw, r = w - vw, top = 8, rowH = (hh - 40) / rows.length;
      const X = (v) => l + ((v - lo) / (hi - lo)) * (r - l);
      // grid
      ctx.font = T.font; ctx.textAlign = "center"; ctx.textBaseline = "top";
      const step = (hi - lo) / (r - l) > 0.9 ? 100 : 50;
      for (let v = lo; v <= hi; v += step) {
        ctx.strokeStyle = v === 0 ? T.axis : T.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(X(v)) + 0.5, top); ctx.lineTo(Math.round(X(v)) + 0.5, hh - 30); ctx.stroke();
        ctx.fillStyle = T.muted; ctx.fillText(`${v}`, X(v), hh - 26);
      }
      ctx.textAlign = "right"; ctx.fillText("dB", w - 4, hh - 14);
      rows.forEach((row, i) => {
        const y = top + i * rowH, bh = Math.min(16, rowH - 6), by = y + (rowH - bh) / 2;
        const x0 = X(Math.min(row.a, row.b)), x1 = X(Math.max(row.a, row.b));
        let col = row.v >= 0 ? T.ok : T.bad;
        if (row.kind === "total") col = T.c4;
        if (row.kind === "final") col = cum >= E.snrMin ? T.accent : T.bad;
        ctx.fillStyle = row.kind === "step" ? alpha(col, 0.85) : col;
        ctx.fillRect(x0, by, Math.max(2, x1 - x0), bh);
        // connector to next row
        if (i < rows.length - 1) {
          ctx.strokeStyle = T.axis; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(X(row.b), by + bh); ctx.lineTo(X(row.b), by + rowH); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.textBaseline = "middle"; ctx.textAlign = "left";
        ctx.font = row.kind === "step" ? T.font : T.fontB; ctx.fillStyle = row.kind === "step" ? T.ink : col;
        let name = row.name;
        while (ctx.measureText(name).width > lw - 8 && name.length > 4) name = name.slice(0, -2) + "…";
        ctx.fillText(name, 4, y + rowH / 2);
        ctx.textAlign = "right"; ctx.font = T.fontB;
        ctx.fillText(`${row.v >= 0 && row.kind === "step" ? "+" : row.v < 0 ? "−" : ""}${Math.abs(row.v).toFixed(1)}`, w - 4, y + rowH / 2);
      });
      // threshold on the final row
      const yF = top + (rows.length - 1) * rowH;
      ctx.strokeStyle = T.warn; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X(E.snrMin), yF + 1); ctx.lineTo(X(E.snrMin), yF + rowH - 1); ctx.stroke();
      ctx.font = T.font; ctx.fillStyle = T.warn; ctx.textAlign = X(E.snrMin) > (l + r) / 2 ? "right" : "left"; ctx.textBaseline = "bottom";
      ctx.fillText("required", X(E.snrMin) + (ctx.textAlign === "right" ? -4 : 4), yF + 2);
    }

    // ---- animation of the spreading picture: four stages, 2.2 s each
    const anim = api.track(animate((dt) => {
      if (!dt) { sp.redraw(); return; }
      V.prog += dt / 2.2;
      if (V.prog >= 1.35) { V.prog = 0; V.stage = (V.stage + 1) % 4; stageCh.value = V.stage; paintEq(); }
      const pv = V.prog; V.prog = Math.min(1, pv); sp.redraw(); V.prog = pv;
    }, { target: sp.canvas, playing: !reducedMotion }));
    playButton(sp, anim);
    V.stage = reducedMotion ? 3 : 0; V.prog = reducedMotion ? 1 : 0;
    stageCh.value = V.stage;

    changed();
    void tour;

    notes(root, "Background", [
      { title: "Deriving the radar equation", open: true, html:
        "<ol><li>An isotropic source of power <i>P</i><sub>t</sub> spreads it over a sphere: density <i>P</i><sub>t</sub>/(4π<i>R</i>²). A directive antenna multiplies this by its gain in the beam: <i>S</i><sub>1</sub> = <i>P</i><sub>t</sub><i>G</i>/(4π<i>R</i>²).</li>" +
        "<li>The target's <b>radar cross-section</b> σ is <em>defined</em> so that it intercepts and re-radiates <i>S</i><sub>1</sub>σ watts as if isotropically.</li>" +
        "<li>Back at the radar that is spread over another sphere: <i>S</i><sub>2</sub> = <i>S</i><sub>1</sub>σ/(4π<i>R</i>²).</li>" +
        "<li>The antenna collects <i>S</i><sub>2</sub> over its effective aperture <i>A</i><sub>e</sub>. Antenna theory links aperture and gain: <i>G</i> = 4π<i>A</i><sub>e</sub>/λ² (and <i>A</i><sub>e</sub> ≈ 0.6 × physical area for a typical dish).</li></ol>" +
        "<p class=\"eq\"><i>P</i><sub>r</sub> = <span class=\"frac\"><span><i>P</i><sub>t</sub><i>G</i></span><span>4π<i>R</i>²</span></span> · <span class=\"frac\"><span>σ</span><span>4π<i>R</i>²</span></span> · <span class=\"frac\"><span><i>G</i>λ²</span><span>4π</span></span> · <span class=\"frac\"><span>1</span><span><i>L</i></span></span> = <span class=\"frac\"><span><i>P</i><sub>t</sub><i>G</i>²λ²σ</span><span>(4π)³<i>R</i>⁴<i>L</i></span></span></p>" +
        "<p>Setting the SNR <i>P</i><sub>r</sub>/(<i>kT</i><sub>0</sub><i>BF</i>) equal to the minimum needed for detection and solving for <i>R</i> gives the maximum detection range:</p>" +
        "<p class=\"eq\"><i>R</i><sub>max</sub> = <span style=\"font-size:1.4em\">[</span><span class=\"frac\"><span><i>P</i><sub>t</sub><i>G</i>²λ²σ</span><span>(4π)³ <i>k T</i><sub>0</sub> <i>B F L</i> SNR<sub>min</sub></span></span><span style=\"font-size:1.4em\">]</span><sup>1/4</sup></p>" +
        "<p>With a fixed aperture instead of a fixed gain, substitute <i>G</i> = 4π<i>A</i><sub>e</sub>/λ²: <i>P</i><sub>r</sub> = <i>P</i><sub>t</sub><i>A</i><sub>e</sub>²σ/(4πλ²<i>R</i>⁴<i>L</i>). Same physics, opposite λ dependence.</p>" },
      { title: "The dB form and a worked budget", html:
        "<p>Taking 10 log₁₀ of everything turns the equation into a sum, which is how engineers actually work with it:</p>" +
        "<p class=\"eq\">SNR = <i>P</i><sub>t</sub> + 2<i>G</i> + 20 log λ + σ − 33.0 − 40 log <i>R</i> − <i>L</i> − (−204.0 + 10 log <i>B</i> + <i>F</i>)</p>" +
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Term (the default radar)</th><th>Value</th><th>dB</th></tr>" +
        "<tr><td>Peak power</td><td class=\"num\">1 MW</td><td class=\"num\">+60.0 dBW</td></tr>" +
        "<tr><td>Gain, twice</td><td class=\"num\">36 dBi</td><td class=\"num\">+72.0</td></tr>" +
        "<tr><td>λ² (3 GHz)</td><td class=\"num\">0.1 m</td><td class=\"num\">−20.0</td></tr>" +
        "<tr><td>σ</td><td class=\"num\">1 m²</td><td class=\"num\">0.0</td></tr>" +
        "<tr><td>(4π)³</td><td class=\"num\">1984</td><td class=\"num\">−33.0</td></tr>" +
        "<tr><td><i>R</i>⁴</td><td class=\"num\">100 km</td><td class=\"num\">−200.0</td></tr>" +
        "<tr><td>Losses</td><td class=\"num\">6 dB</td><td class=\"num\">−6.0</td></tr>" +
        "<tr><td><b>Received power</b></td><td></td><td class=\"num\"><b>−127.0 dBW</b></td></tr>" +
        "<tr><td>Noise <i>kT</i><sub>0</sub><i>BF</i></td><td class=\"num\">1 MHz, 3 dB</td><td class=\"num\">−141.0 dBW</td></tr>" +
        "<tr><td><b>SNR</b></td><td></td><td class=\"num\"><b>14.0 dB</b></td></tr></table></div>" +
        "<p>−127 dBW is 2 × 10<sup>−13</sup> W: a megawatt goes out and a fifth of a picowatt comes back.</p>" },
      { title: "Noise: kT₀BF and noise temperature", html:
        "<p>Any resistor at temperature <i>T</i> produces thermal noise power <i>kTB</i> in bandwidth <i>B</i>. At the reference <i>T</i><sub>0</sub> = 290 K that is <b>−174 dBm per hertz</b> (−204 dBW/Hz), so a 1 MHz receiver starts at −114 dBm before it adds any noise of its own.</p>" +
        "<p>The receiver's <b>noise figure</b> <i>F</i> says how much worse it is than ideal. Equivalently it adds an effective noise temperature <i>T</i><sub>e</sub> = (<i>F</i> − 1)<i>T</i><sub>0</sub>: a 3 dB noise figure is 290 K of extra noise. A complete analysis uses the <b>system noise temperature</b> <i>T</i><sub>s</sub>, which includes antenna noise from the sky and ground (cold sky at high elevation can be only tens of kelvin).</p>" +
        "<p>The bandwidth should match the pulse: <i>B</i> ≈ 1/τ. Wider lets in noise for nothing; narrower throws away signal. With that match, <i>P</i><sub>t</sub>/<i>B</i> = <i>P</i><sub>t</sub>τ, the pulse <b>energy</b>, which is why energy (not peak power) governs detection.</p>" },
      { title: "What goes into the losses L", html:
        "<ul><li><b>Transmit and receive line losses</b>: waveguide, rotary joints, duplexer (1–3 dB).</li><li><b>Atmospheric absorption</b>, both ways: small at L/S band, several dB at X band over long paths, large above 20 GHz (lesson 8).</li>" +
        "<li><b>Beam-shape loss</b>: targets aren't always at the peak of the beam as it scans (≈1.6 dB).</li><li><b>Straddle losses</b>: targets fall between range cells or Doppler bins (1–3 dB).</li>" +
        "<li><b>Signal processing losses</b>: filter mismatch, CFAR loss, quantisation, window functions (1–3 dB).</li></ul><p>Real systems total 5–15 dB, and leaving them out is the classic way to overpromise.</p>" },
      { title: "Integrating pulses, and fluctuating targets", html:
        "<p>A radar's beam usually dwells on a target for many pulses. Adding them up raises the SNR:</p>" +
        "<ul><li><b>Coherent</b> integration adds the complex (amplitude and phase) samples before detection. Signal adds in voltage, noise in power, so the gain is exactly <b><i>N</i></b> (10 log <i>N</i> dB), provided the target's phase is predictable over the dwell (Doppler filtering does this).</li>" +
        "<li><b>Noncoherent</b> integration adds the detected magnitudes. Some information is gone, so the gain is less: between √<i>N</i> and <i>N</i>, depending on <i>N</i>, Pd and Pfa. This page uses the common rule of thumb <b><i>N</i><sup>0.8</sup></b>; lesson 9 computes it exactly.</li></ul>" +
        "<p>The required SNR also depends on how the target's echo fluctuates. The 13 dB default is right for a steady (Swerling 0) target at Pd = 0.9, Pfa = 10⁻⁶. A Swerling 1 target, whose echo fades from scan to scan like a complex aircraft's, needs about 21 dB for the same Pd on one pulse, though diversity and integration claw much of that back.</p>" },
      { title: "Bistatic radar and a jamming teaser", html:
        "<p>With the transmitter and receiver apart, the two spheres have different radii:</p>" +
        "<p class=\"eq\"><i>P</i><sub>r</sub> = <span class=\"frac\"><span><i>P</i><sub>t</sub><i>G</i><sub>t</sub><i>G</i><sub>r</sub>λ²σ<sub>B</sub></span><span>(4π)³<i>R</i><sub>t</sub>²<i>R</i><sub>r</sub>²<i>L</i></span></span></p>" +
        "<p>A noise jammer on the target only makes <em>one</em> trip, so its power at the radar falls as 1/<i>R</i>² while the echo falls as 1/<i>R</i>⁴. Far away the jammer wins easily; as the target closes, the echo gains on it by 20 dB per decade of range. For a self-screening jammer</p>" +
        "<p class=\"eq\"><span class=\"frac\"><span><i>S</i></span><span><i>J</i></span></span> = <span class=\"frac\"><span><i>P</i><sub>t</sub><i>G</i>σ</span><span>4π <i>P</i><sub>j</sub><i>G</i><sub>j</sub><i>R</i>²</span></span> · <span class=\"frac\"><span><i>B</i><sub>j</sub></span><span><i>B</i></span></span></p>" +
        "<p>and the range at which <i>S</i>/<i>J</i> reaches the detection threshold is the <b>burn-through range</b>. Lesson 7 shows how frequency hopping forces the jammer to spread <i>B</i><sub>j</sub> wide.</p>" },
    ]);

    api.quiz(root, [
      { q: "A target moves from 50 km to 100 km. By how much does its echo SNR change?", options: ["−3 dB", "−6 dB", "−12 dB", "−40 dB"], answer: 2, why: "The echo falls as 1/R⁴: doubling R gives 2⁴ = 16, which is 12 dB." },
      { q: "You need twice the detection range and can only change the transmitter. How much more power?", options: ["2×", "4×", "8×", "16×"], answer: 3, why: "R<sub>max</sub> ∝ P<sub>t</sub><sup>1/4</sup>, so doubling it needs 2⁴ = 16 times the power (+12 dB)." },
      { q: "Stealth shaping cuts an aircraft's RCS by 30 dB. Its detection range shrinks by a factor of about…", options: ["1000", "31.6", "5.6", "2"], answer: 2, why: "R<sub>max</sub> ∝ σ<sup>1/4</sup>: 10<sup>30/40</sup> = 10<sup>0.75</sup> ≈ 5.6. Huge RCS cuts buy surprisingly modest range reductions." },
      { q: "For a dish of fixed diameter, doubling the frequency changes the received echo power by…", options: ["−6 dB", "0 dB", "+6 dB", "+12 dB"], answer: 2, why: "G ∝ 1/λ², so G²λ² ∝ 1/λ²: halving λ gives 4× (+6 dB). With fixed gain instead, it would be −6 dB. (Atmospheric losses, ignored here, grow with frequency.)" },
    ]);
  },
};
