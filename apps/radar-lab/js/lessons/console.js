// Lesson 13: the capstone. A complete search radar on a PPI: radar equation, integration, Albersheim detection,
// MTI, range folding, eclipsing, the 4/3-Earth horizon, ground clutter and a rain cell, all live.
import {
  h, C0, KB, T0, card, labGrid, group, notes, slider, choice, check, select, readout, status,
  canvasView, animate, playButton, theme, alpha, label, num, km, si, clamp, rad, deg, TAU, rng, gauss, reducedMotion,
} from "../ui.js";

const BANDS = { L: 1.3e9, S: 3.0e9, C: 5.6e9, X: 9.4e9 };
// ITU-R P.838 style rain coefficients (horizontal pol.), specific attenuation γ = k R^α dB/km (one way)
const RAIN_K = { L: [4.0e-5, 0.93], S: [1.39e-4, 1.232], C: [4.6e-4, 1.65], X: [9.8e-3, 1.27] };
const NF_DB = 3, LOSS_DB = 7;          // noise figure; system losses incl. elevation shaping and beam-shape loss
const PC_BW = 2e6;                     // pulse-compression bandwidth (chirp), Hz
const RAIN = { az: 60, r: 90, rad: 18, rate: 12, wind: 15, windTo: 90, sv: 2 };  // km, mm/h, m/s
const CLUT_R = 120;                    // clutter map extent, km
const STAB_DB = -45;                   // MTI limit set by transmitter/oscillator stability
const horizon = (hA, hT) => 4.12 * (Math.sqrt(Math.max(0, hA)) + Math.sqrt(Math.max(0, hT)));  // km, 4/3 Earth
const wrap360 = (a) => ((a % 360) + 360) % 360;
const dB = (x) => 10 * Math.log10(x);
const erf = (x) => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; };
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

/** Albersheim: single-pulse SNR (dB) needed for Pd, Pfa with n pulses integrated non-coherently (steady target). */
function albersheim(pd, n, pfa) {
  const A = Math.log(0.62 / pfa), B = Math.log(pd / (1 - pd));
  return -5 * Math.log10(n) + (6.2 + 4.54 / Math.sqrt(n + 0.44)) * Math.log10(A + 0.12 * A * B + 1.7 * B);
}

// ---------------------------------------------------------------- the airspace
function orbit(cAz, cR, rKm, a0, v, extra = {}) {
  const cx = cR * Math.sin(rad(cAz)), cy = cR * Math.cos(rad(cAz));
  return { x: cx + rKm * Math.sin(rad(a0)), y: cy + rKm * Math.cos(rad(a0)), hd: a0 + 90, v, turn: deg(v / (rKm * 1000)), ...extra };
}
function line(az, r, hd, v, extra = {}) { return { x: r * Math.sin(rad(az)), y: r * Math.cos(rad(az)), hd, v, turn: 0, ...extra }; }
const SCENE = [
  { id: "air1", name: "Airliner BA212", kind: "air", rcs: 40, alt: 11000, ...line(35, 245, 235, 230), rMin: 30, rMax: 300 },
  { id: "air2", name: "Airliner EZ48", kind: "air", rcs: 30, alt: 10000, ...line(205, 150, 120, 220), rMin: 0, rMax: 290 },
  { id: "far", name: "Airliner LH9 (far)", kind: "air", rcs: 50, alt: 12000, ...line(300, 288, 300 + 90 + 20, 240), rMin: 240, rMax: 300, note: "beyond many radars' unambiguous range" },
  { id: "prop", name: "Turboprop (holding in rain)", kind: "air", rcs: 8, alt: 5000, ...orbit(RAIN.az, RAIN.r, 6, 0, 120) },
  { id: "f1", name: "Fighter (CAP orbit)", kind: "air", rcs: 3, alt: 7000, ...orbit(140, 125, 25, 200, 250) },
  { id: "f2", name: "Fighter (inbound)", kind: "air", rcs: 2, alt: 4000, ...line(250, 195, 70, 300), rMin: 40, rMax: 300 },
  { id: "helo", name: "Helicopter (in the hills)", kind: "air", rcs: 4, alt: 150, ...orbit(280, 35, 4, 90, 35) },
  { id: "drone", name: "Stealthy drone", kind: "drone", rcs: 0.003, alt: 3000, ...line(330, 78, 155, 45), rMin: 20, rMax: 120 },
  { id: "msl", name: "Sea-skimming missile", kind: "missile", rcs: 0.1, alt: 5, ...line(100, 62, 280, 290), rMin: 4, rMax: 100 },
  { id: "birds", name: "Flock of birds", kind: "birds", rcs: 0.05, alt: 300, ...orbit(20, 13, 2, 0, 12) },
];
const MISSION = SCENE.filter((t) => t.kind !== "birds");
const rcsAt = (tg, f) => (tg.kind === "drone" ? tg.rcs * (3e9 / f) ** 2 : tg.rcs);   // shaping beats short waves, not long ones

// ---------------------------------------------------------------- terrain / clutter map (land to the west, sea to the east)
const NB = CLUT_R + 1;
const s0Map = new Float32Array(360 * NB), htMap = new Float32Array(360 * NB), pMap = new Float32Array(360 * NB);
(function buildTerrain() {
  const R = rng(5);
  for (let b = 0; b < 360; b++) {
    const coast = 182 + 6 * Math.sin(b * 0.09);
    for (let r = 1; r <= CLUT_R; r++) {
      const i = b * NB + r;
      const land = b >= coast && b <= 356 - 4 * Math.cos(r * 0.2);
      if (!land) continue;
      const hills = 40 + 160 * (0.5 + 0.5 * Math.sin(b * 0.13 + r * 0.11) * Math.cos(r * 0.07 - b * 0.05));
      const ridge = 650 * Math.exp(-(((b - 285) / 14) ** 2) - (((r - 62) / 9) ** 2));     // a mountain range west-north-west
      const g = gauss(R) * 4;                                                                // patchiness, dB
      htMap[i] = hills + ridge;
      s0Map[i] = 10 ** ((-27 + 4 * Math.sin(b * 0.3 + r * 0.4) + g) / 10);
      pMap[i] = g;
    }
  }
})();
const rainCells = Array.from({ length: 360 }, (_, b) => {
  const out = [];
  const cx = RAIN.r * Math.sin(rad(RAIN.az)), cy = RAIN.r * Math.cos(rad(RAIN.az));
  for (let r = 1; r <= 130; r++) { const x = r * Math.sin(rad(b + 0.5)), y = r * Math.cos(rad(b + 0.5)); if ((x - cx) ** 2 + (y - cy) ** 2 <= RAIN.rad ** 2) out.push(r); }
  return out;
});
function rainChord(az, R) {
  const ux = Math.sin(rad(az)), uy = Math.cos(rad(az));
  const cx = RAIN.r * Math.sin(rad(RAIN.az)), cy = RAIN.r * Math.cos(rad(RAIN.az));
  const proj = cx * ux + cy * uy, d2 = cx * cx + cy * cy - proj * proj;
  if (d2 >= RAIN.rad ** 2) return 0;
  const half = Math.sqrt(RAIN.rad ** 2 - d2);
  return Math.max(0, Math.min(R, proj + half) - Math.max(0, proj - half));
}

const PRESETS = {
  starter: { label: "Starter (S-band)", band: "S", pt: 500e3, tau: 1e-6, pc: false, prf: 1200, ant: 4, rpm: 12, hA: 10, mti: 0, stagger: false, cfar: false, pfa: 1e-6 },
  atc: { label: "Airport ATC (S-band)", band: "S", pt: 1e6, tau: 1e-6, pc: false, prf: 1000, ant: 5, rpm: 12.5, hA: 15, mti: 3, stagger: true, cfar: true, pfa: 1e-6 },
  naval: { label: "Naval (X-band)", band: "X", pt: 200e3, tau: 10e-6, pc: true, prf: 3000, ant: 3, rpm: 24, hA: 30, mti: 2, stagger: true, cfar: true, pfa: 1e-6 },
  long: { label: "Long-range (L-band)", band: "L", pt: 500e3, tau: 20e-6, pc: true, prf: 300, ant: 12, rpm: 6, hA: 20, mti: 2, stagger: false, cfar: true, pfa: 1e-6 },
  bad: { label: "Bad settings", band: "X", pt: 50e3, tau: 0.2e-6, pc: false, prf: 6000, ant: 1.2, rpm: 30, hA: 5, mti: 0, stagger: false, cfar: false, pfa: 1e-3 },
};

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "Everything comes together here. You run a search radar watching 300 km of airspace: airliners, fighters, a helicopter in the hills, " +
      "a stealthy drone, a sea-skimming missile and a rain storm. Every echo comes from the radar equation and every detection from real " +
      "detection statistics. Tune the radar until you can see them all, and click any blip to find out why it is (or isn't) there." }));

    const S = { ...PRESETS.starter, preset: "starter", disp: 300, truth: false, speed: 1, sel: "air2" };
    const D = {};                                  // derived radar numbers
    const R = rng(77);
    let sweep = 0, simT = 0, scanN = 0;
    const tg = SCENE.map((s) => ({ ...s, init: { ...s }, ev: null, lastDet: -1e9, lastAny: -1e9, appR: null }));
    const flags = { skimmer: false, helo: false, folded: false, rain: false };

    const tour = api.steps(root, [
      { title: "1 · Your radar", html: "<p>A modest S-band radar: 500 kW, a 4 m antenna turning at 12 rpm, 1 µs pulses at 1200 Hz. The sweep paints every echo it finds; the bright green patches near the centre are the hills to the west, and the speckle elsewhere is false alarms from noise.</p>",
        look: "the airspace list. How many of the targets does this radar actually see?", apply: () => applyPreset("starter") },
      { title: "2 · Clear the clutter", html: "<p>Hills reflect far more than an aircraft, but they don't move. A <b>3-pulse MTI</b> canceller subtracts successive echoes so stationary clutter cancels (<a href=\"#doppler\">lesson 5</a>) and switching <b>CFAR</b> on keeps the threshold just above the residue (<a href=\"#detection\">lesson 9</a>).</p>",
        look: "the clutter vanishing, the helicopter appearing at 35 km west when it isn't flying across the beam, and the birds disappearing too.",
        apply: () => set({ mti: 3, cfar: true }) },
      { title: "3 · Ghosts from far away", html: "<p>At 1200 Hz the radar listens for only <i>R</i><sub>u</sub> = <i>c</i>/2·PRF = 125 km before it fires again. Airliner BA212, about 240 km away to the north-east, answers the <i>previous</i> pulse, so it is drawn 125 km too close: a <b>range-folded</b> ghost (<a href=\"#pulses\">lesson 2</a>). Nothing on the screen tells you it's wrong.</p>",
        look: "the truth overlay: the dashed line joins BA212 to its ghost. A PRF below about 600 Hz puts it back where it belongs.",
        apply: () => set({ mti: 3, cfar: true, truth: true, sel: "air1" }) },
      { title: "4 · Low flyers", html: "<p>A missile skimming the sea at 5 m stays hidden behind the Earth's bulge until it is only about 22 km away from a 10 m mast (<a href=\"#propagation\">lesson 8</a>). Raising the antenna pushes the horizon out: 4.12 (√<i>h</i><sub>radar</sub> + √<i>h</i><sub>target</sub>) km.</p>",
        look: "the dashed horizon ring for a 5 m target. Try a 40 m mast.", apply: () => set({ sel: "msl", hA: 40 }) },
      { title: "5 · Weather", html: "<p>Rain echoes grow as <i>f</i><sup>4</sup> and rain also attenuates the beam, so X-band sees the storm as a solid wall and can't see through it. L-band barely notices it (<a href=\"#frequency\">lesson 4</a>). The turboprop holding inside the cell is the test.</p>",
        look: "the storm to the north-east, drawn here by an X-band radar with CFAR off. Then pick the Long-range (L-band) preset and look again.", apply: () => { applyPreset("naval"); set({ prf: 1000, cfar: false, mti: 0, truth: true, sel: "prop" }); } },
      { title: "6 · Your turn", html: "<p>Start from any preset and take on the challenges below. Click a blip (or a name in the list) to see its signal-to-noise, the losses that hit it and why it was or wasn't detected.</p>",
        apply: () => applyPreset("starter") },
    ]);

    const lab = labGrid(root);

    // ---- PPI
    const ppiCard = card(lab.main, "PPI", "click a blip to inspect it");
    const ppi = api.track(canvasView(ppiCard, { aspect: 1, minHeight: 300, maxHeight: 720, draw: drawPPI, label: "Plan position indicator of the radar, showing the sweep, echoes, clutter and false alarms" }));
    const ppiCap = h("p", { class: "caption" });
    ppiCard.append(ppiCap);
    ppi.canvas.addEventListener("click", (e) => { const r = ppi.canvas.getBoundingClientRect(); pick(e.clientX - r.left, e.clientY - r.top); });

    const cols = h("div", { class: "cols2" });
    lab.main.append(cols);
    const missionCard = card(cols, "Airspace", "&nbsp;");
    const missionList = h("ul", { style: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "4px" } });
    missionCard.append(missionList);
    const missionRows = tg.map((t) => {
      const icon = h("span", { "aria-hidden": "true", style: { width: "22px", textAlign: "center", fontWeight: 700, flex: "none" } });
      const note = h("span", { class: "small muted", style: { marginLeft: "auto", textAlign: "right" } });
      const btn = h("button", { type: "button", onclick: () => { S.sel = t.id; paintInspector(); ppi.redraw(); paintMission(); },
        style: { display: "flex", alignItems: "center", gap: "8px", width: "100%", minHeight: "44px", padding: "4px 10px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--bg)", cursor: "pointer", textAlign: "left", fontSize: "14px" } },
        icon, h("span", null, t.name), note);
      missionList.append(h("li", null, btn));
      return { t, btn, icon, note };
    });
    const inspCard = card(cols, "Inspector", "&nbsp;");
    const inspSt = status(inspCard);
    const inspRo = readout(inspCard);

    // ---- controls
    const ctl = card(lab.side, "Radar settings");
    const g0 = group(ctl, "Preset");
    const preSel = select(g0, { label: "Start from", value: "starter", options: [...Object.entries(PRESETS).map(([k, p]) => [k, p.label]), ["custom", "Custom"]], onChange: (v) => { if (v !== "custom") applyPreset(v); } });
    const g1 = group(ctl, "Transmitter");
    const bandCh = choice(g1, { label: "Band", value: S.band, options: [["L", "L 1.3"], ["S", "S 3.0"], ["C", "C 5.6"], ["X", "X 9.4 GHz"]], onChange: (v) => set({ band: v }, true) });
    const ptSl = slider(g1, { label: "Peak power", min: 10e3, max: 5e6, log: true, value: S.pt, format: (v) => si(v, "W"), onInput: (v) => set({ pt: v }, true) });
    const tauSl = slider(g1, { label: "Pulse width τ", min: 0.1e-6, max: 100e-6, log: true, value: S.tau, format: (v) => si(v, "s"), onInput: (v) => set({ tau: v }, true) });
    const pcChk = check(g1, { label: "Pulse compression (2 MHz chirp)", checked: S.pc, onChange: (v) => set({ pc: v }, true) });
    const prfSl = slider(g1, { label: "PRF", min: 200, max: 10000, step: 10, log: true, value: S.prf, format: (v) => `${num(v, 3)} Hz`, onInput: (v) => set({ prf: v }, true) });
    const g2 = group(ctl, "Antenna");
    const antSl = slider(g2, { label: "Antenna width", min: 1, max: 12, step: 0.1, value: S.ant, format: (v) => `${num(v, 3)} m`, help: "Height is a quarter of the width; the elevation beam is shaped to cover all altitudes.", onInput: (v) => set({ ant: v }, true) });
    const rpmSl = slider(g2, { label: "Rotation", min: 2, max: 30, step: 0.5, value: S.rpm, format: (v) => `${num(v, 3)} rpm`, onInput: (v) => set({ rpm: v }, true) });
    const hSl = slider(g2, { label: "Antenna height", min: 3, max: 60, step: 1, value: S.hA, format: (v) => `${v} m`, onInput: (v) => set({ hA: v }, true) });
    const g3 = group(ctl, "Processing");
    const mtiCh = choice(g3, { label: "Clutter filter", value: S.mti, options: [[0, "Off"], [2, "2-pulse MTI"], [3, "3-pulse MTI"]], onChange: (v) => set({ mti: v }, true) });
    const stagChk = check(g3, { label: "Staggered PRF (raises blind speeds)", checked: S.stagger, onChange: (v) => set({ stagger: v }, true) });
    const cfarChk = check(g3, { label: "CFAR (adaptive threshold)", checked: S.cfar, onChange: (v) => set({ cfar: v }, true) });
    const pfaSl = slider(g3, { label: "False-alarm probability", min: 1e-8, max: 1e-3, log: true, value: S.pfa, format: fmtPfa, onInput: (v) => set({ pfa: v }, true) });
    const g4 = group(ctl, "Display");
    const dispCh = choice(g4, { label: "Range scale", value: S.disp, options: [[100, "100 km"], [200, "200 km"], [300, "300 km"]], onChange: (v) => { S.disp = v; clearPers(); changed(); } });
    const truthChk = check(g4, { label: "Truth overlay (where targets really are)", checked: S.truth, onChange: (v) => { S.truth = v; ppi.redraw(); } });
    const spdCh = choice(g4, { label: "Time", value: 1, options: [[1, "Real time"], [4, "4×"], [10, "10×"]], onChange: (v) => { S.speed = v; } });

    const numCard = card(lab.side, "Radar numbers");
    const numSt = status(numCard);
    const numRo = readout(numCard);

    const ch = api.challenges(root, [
      { id: "all", text: "Detect all seven aircraft at their true ranges at the same time (each within the last two scans).", check: () => MISSION.filter((m) => m.kind === "air").every((m) => isDetected(byId(m.id))) },
      { id: "drone", text: "Detect the stealthy drone.", check: () => isDetected(byId("drone")) },
      { id: "skim", text: "Detect the sea-skimming missile while it is still more than 28 km away.", check: () => flags.skimmer },
      { id: "helo", text: "Remove the ground clutter without losing the helicopter: detect it with a clutter filter on, inside the hills' clutter.", check: () => flags.helo },
      { id: "fold", text: "Resolve the folded airliner: detect LH9 at its true range of about 280 km.", check: () => flags.folded },
      { id: "rain", text: "See through the storm: detect the turboprop holding inside the rain cell.", check: () => flags.rain },
    ]);

    function fmtPfa(v) {
      const e = Math.floor(Math.log10(v) + 1e-9), m = v / 10 ** e;
      const sup = String(e).replace("-", "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
      return `${m.toFixed(1)} × 10${sup}`;
    }
    const byId = (id) => tg.find((t) => t.id === id);
    const scanPeriod = () => 60 / S.rpm;
    const isDetected = (t) => t.lastDet > simT - 2.05 * scanPeriod() && t.ev && !t.ev.folded;

    // ---- settings
    function applyPreset(k) {
      const p = PRESETS[k];
      set({ ...p, preset: k });
    }
    function set(p, custom) {
      Object.assign(S, p);
      if (custom) S.preset = "custom";
      preSel.value = S.preset; bandCh.value = S.band; ptSl.value = S.pt; tauSl.value = S.tau; pcChk.checked = S.pc; prfSl.value = S.prf;
      antSl.value = S.ant; rpmSl.value = S.rpm; hSl.value = S.hA; mtiCh.value = S.mti; stagChk.checked = S.stagger; cfarChk.checked = S.cfar;
      pfaSl.value = S.pfa; dispCh.value = S.disp; truthChk.checked = S.truth;
      if ("disp" in p) clearPers();
      changed();
    }

    function derive() {
      const f = BANDS[S.band], lam = C0 / f;
      const Hv = S.ant / 4;
      const G = (4 * Math.PI * 0.6 * S.ant * Hv) / (lam * lam);
      const thAz = (1.2 * lam) / S.ant, thEl = Math.min(rad(30), (1.2 * lam) / Hv);
      const dR = S.pc ? Math.min((C0 * S.tau) / 2, C0 / (2 * PC_BW)) : (C0 * S.tau) / 2;
      const Ru = C0 / (2 * S.prf) / 1000;      // km
      const Rb = (C0 * S.tau) / 2 / 1000;      // km
      const n = (deg(thAz) * S.prf) / (6 * S.rpm);
      const nEff = Math.max(1, n - (S.mti ? S.mti - 1 : 0));
      const snrRef = dB(S.pt * S.tau * G * G * lam * lam) - dB((4 * Math.PI) ** 3 * 1e20 * KB * T0) - NF_DB - LOSS_DB;  // 1 m² at 100 km
      const cfarL = S.cfar ? 1 : 0;
      const s50 = albersheim(0.5, nEff, S.pfa) + cfarL, s90 = albersheim(0.9, nEff, S.pfa) + cfarL;
      const s50_1 = albersheim(0.5, 1, S.pfa), s90_1 = albersheim(0.9, 1, S.pfa);
      const [rk, ra] = RAIN_K[S.band];
      const gamma = rk * RAIN.rate ** ra;                                  // dB/km one way
      const Z = 200 * RAIN.rate ** 1.6;                                     // mm⁶/m³
      const eta = (Math.PI ** 5 * 0.93 * Z * 1e-18) / lam ** 4;            // m²/m³
      // clutter spectrum: wind-blown vegetation (σv 0.25 m/s) plus antenna scanning modulation 0.265·PRF/n
      const sScan = (0.265 * S.prf) / Math.max(1, n);
      const sGround = Math.hypot((2 * 0.25) / lam, sScan);
      const sRain = Math.hypot((2 * RAIN.sv) / lam, sScan);
      Object.assign(D, { f, lam, G, thAz, thEl, dR, Ru, Rb, n, nEff, snrRef, s50, s90, s50_1, s90_1, gamma, eta, sGround, sRain,
        vb: (lam * S.prf) / 2, duty: S.tau * S.prf, pav: S.pt * S.tau * S.prf });
      D.groundRes = mtiResp(0, D.sGround, true);
    }

    /** MTI power response for a signal with Doppler centre fm and spread sigma (Hz), normalised to the noise gain. */
    function mtiResp(fm, sigma, isClutter) {
      if (!S.mti) return 1;
      const one = (fr) => {
        const a = (2 * Math.PI * Math.PI * sigma * sigma) / (fr * fr), ph = (TAU * fm) / fr;
        return S.mti === 2 ? 1 - Math.cos(ph) * Math.exp(-a) : (6 - 8 * Math.cos(ph) * Math.exp(-a) + 2 * Math.cos(2 * ph) * Math.exp(-4 * a)) / 6;
      };
      let r = S.stagger ? (one(S.prf * 0.85) + one(S.prf * 1.15)) / 2 : one(S.prf);
      if (isClutter) r = Math.max(r, 10 ** (STAB_DB / 10));
      return Math.max(r, 1e-7);
    }
    function pdOf(snr, single) {
      const a = single ? D.s50_1 : D.s50, b = single ? D.s90_1 : D.s90;
      return Math.max(S.pfa, Phi(((snr - a) / (b - a)) * 1.2816));
    }

    // clutter-to-noise (dB) of one resolution cell at range r km, azimuth bin b, before any filtering. Returns -Infinity if none.
    function groundCNR(b, r) {
      const ri = Math.round(r);
      if (ri < 1 || ri > CLUT_R) return -Infinity;
      const i = b * NB + ri, s0 = s0Map[i];
      if (!s0 || r > horizon(S.hA, htMap[i])) return -Infinity;
      const sc = s0 * r * 1000 * D.thAz * D.dR;
      return D.snrRef + dB(sc) - 40 * Math.log10(r / 100);
    }
    function rainCNR(az, r) {
      const cx = RAIN.r * Math.sin(rad(RAIN.az)), cy = RAIN.r * Math.cos(rad(RAIN.az));
      const x = r * Math.sin(rad(az)), y = r * Math.cos(rad(az));
      if ((x - cx) ** 2 + (y - cy) ** 2 > RAIN.rad ** 2) return -Infinity;
      const V = D.thAz * r * 1000 * Math.min(r * 1000 * D.thEl, 4000) * D.dR;
      const att = 2 * D.gamma * rainChord(az, r);
      return D.snrRef + dB(D.eta * V) - 40 * Math.log10(r / 100) - att;
    }
    const rainVr = (az) => RAIN.wind * Math.cos(rad(az - RAIN.windTo));
    // total interference after filtering at apparent range ra (all folds), dB relative to noise, plus raw ground level
    function interference(az, ra) {
      const b = Math.floor(wrap360(az));
      let lin = 0, rawGround = -Infinity, rawRain = -Infinity;
      for (let k = 0; k < 4; k++) {
        const r = ra + k * D.Ru;
        if (r > 320) break;
        const g = groundCNR(b, r), w = rainCNR(az, r);
        const smear = k && S.stagger ? 0.1 : 1;      // staggered PRF scatters second-time-around echoes
        if (isFinite(g)) { lin += 10 ** (g / 10) * D.groundRes * smear; rawGround = Math.max(rawGround, g); }
        if (isFinite(w)) { lin += 10 ** (w / 10) * mtiResp((2 * rainVr(az)) / D.lam, D.sRain, true) * smear; rawRain = Math.max(rawRain, w); }
      }
      return { res: lin > 0 ? dB(lin) : -Infinity, lin, rawGround, rawRain };
    }

    // ---- evaluate one target as the beam crosses it
    function evaluate(t) {
      const r = Math.hypot(t.x, t.y), az = wrap360(deg(Math.atan2(t.x, t.y)));
      const vr = ((t.x * t.vx + t.y * t.vy) / r) * 1000;           // m/s, + receding
      const fd = (-2 * vr) / D.lam;
      const sig = rcsAt(t, D.f) * -Math.log(1 - R() * 0.999999);    // Swerling 1: new RCS every scan
      const ev = { r, az, vr, fd, sig, sigMean: rcsAt(t, D.f), losses: [] };
      ev.snr0 = D.snrRef + dB(sig) - 40 * Math.log10(r / 100);
      ev.hz = horizon(S.hA, t.alt);
      ev.k = Math.floor(r / D.Ru); ev.ra = r - ev.k * D.Ru; ev.folded = ev.k > 0;
      let snr = ev.snr0;
      if (r > ev.hz) { ev.hidden = true; snr = -Infinity; }
      else if (r > 0.9 * ev.hz) { const l = (15 * (r - 0.9 * ev.hz)) / (0.1 * ev.hz); ev.losses.push(["Near the horizon (diffraction)", -l]); snr -= l; }
      if (ev.ra < D.Rb) { const l = 20 * Math.log10(Math.max(1e-3, ev.ra / D.Rb)); ev.eclipse = l; ev.losses.push(["Eclipsed (inside the blind range)", l]); snr += l; }
      if (ev.folded && S.stagger) { ev.losses.push(["Stagger smears this second-time echo", -10]); snr -= 10; }
      const rainL = 2 * D.gamma * rainChord(az, r);
      if (rainL > 0.05) { ev.losses.push(["Rain attenuation (two-way)", -rainL]); snr -= rainL; }
      ev.rainL = rainL;
      ev.mti = dB(mtiResp(fd, 0, false));
      if (S.mti) { ev.losses.push(["MTI response at this Doppler", ev.mti]); snr += ev.mti; }
      ev.snr = snr;
      const I = interference(az, ev.ra);
      ev.cres = I.res; ev.rawGround = I.rawGround; ev.rawRain = I.rawRain;
      ev.sinr = snr - dB(1 + I.lin);
      ev.pd = isFinite(ev.sinr) ? pdOf(ev.sinr) : 0;
      ev.det = R() < ev.pd;
      return ev;
    }

    // ---- simulation
    function moveTargets(dt) {
      for (const t of tg) {
        t.hd += t.turn * dt;
        t.vx = (t.v * Math.sin(rad(t.hd))) / 1000; t.vy = (t.v * Math.cos(rad(t.hd))) / 1000;
        t.x += t.vx * dt; t.y += t.vy * dt;
        const r = Math.hypot(t.x, t.y);
        if ((t.rMax && r > t.rMax) || (t.rMin != null && r < t.rMin)) Object.assign(t, { x: t.init.x, y: t.init.y, hd: t.init.hd });
      }
    }
    moveTargets(0);

    function process(a0, span) {
      const inSpan = (a) => { const d = wrap360(a - a0); return d > 0 && d <= span; };
      // targets
      for (const t of tg) {
        const az = wrap360(deg(Math.atan2(t.x, t.y)));
        if (!inSpan(az)) continue;
        const ev = evaluate(t);
        t.ev = ev; t.lastAny = simT;
        if (ev.det) {
          t.lastDet = simT; t.appR = ev.ra;
          paintArc(az, ev.ra, Math.max(D.dR / 1000, 0.4), clamp(0.65 + ev.sinr / 40, 0.65, 1), 6, null, 1.6);
          if (t.id === "msl" && !ev.folded && ev.r > 28) flags.skimmer = true;
          if (t.id === "helo" && S.mti && ev.rawGround > 10) flags.helo = true;
          if (t.id === "far" && !ev.folded) flags.folded = true;
          if (t.id === "prop" && !ev.folded && ev.rawRain > ev.snr0 - 10) flags.rain = true;
        }
        if (S.sel === t.id) paintInspector();
      }
      // clutter, rain and noise in each crossed 1° bin
      const b0 = Math.floor(a0), b1 = Math.floor(a0 + span);
      const T = theme();
      for (let bb = b0 + 1; bb <= b1; bb++) {
        const b = wrap360(bb);
        for (let r = 1; r <= CLUT_R; r++) {
          const g = groundCNR(b, r);
          if (!isFinite(g)) continue;
          const resid = g + dB(D.groundRes);
          // CFAR sets its threshold from the surrounding cells, so only the patchiest spots (well above their neighbours) leak through
          const pd = S.cfar ? (resid > 0 ? pdOf(pMap[b * NB + r], true) : 0) : pdOf(resid);
          if (R() < pd) paintArc(b + 0.5, appR(r), 1, clamp(0.3 + resid / 80, 0.3, 0.6), 1, T.scopeFg);
        }
        for (const r of rainCells[b]) {
          const w = rainCNR(b + 0.5, r);
          const resid = w + dB(mtiResp((2 * rainVr(b + 0.5)) / D.lam, D.sRain, true));
          const pd = S.cfar ? 0.04 * (resid > 6 ? 1 : 0) : pdOf(resid);
          if (R() < pd) paintArc(b + 0.5, appR(r), 1, clamp(0.3 + resid / 80, 0.3, 0.6), 1, T.scopeFg);
        }
      }
      // false alarms from noise: Pfa per resolution cell
      const rTop = Math.min(D.Ru, S.disp);
      const cells = Math.max(0, ((rTop - D.Rb) * 1000) / D.dR) * (span / deg(D.thAz));
      let nFa = poisson(cells * S.pfa);
      nFa = Math.min(nFa, 150);
      for (let k = 0; k < nFa; k++) paintArc(a0 + R() * span, D.Rb + R() * (rTop - D.Rb), Math.max(D.dR / 1000, 0.4), 0.6, 1.5);
    }
    const appR = (r) => r - Math.floor(r / D.Ru) * D.Ru;
    function poisson(m) {
      if (m > 30) return Math.max(0, Math.round(m + Math.sqrt(m) * gauss(R)));
      const L = Math.exp(-m); let k = 0, p = 1;
      do { k++; p *= R(); } while (p > L);
      return k - 1;
    }

    function step(dtReal) {
      const dt = dtReal * S.speed;
      if (dt <= 0) return;
      simT += dt;
      moveTargets(dt);
      let span = 6 * S.rpm * dt;
      while (span > 0) {
        const s = Math.min(span, 20);
        const a0 = sweep;
        sweep = wrap360(sweep + s);
        if (sweep < a0) scanN++;
        process(a0, s);
        span -= s;
      }
      fadePers(1 - Math.exp(-dt / (0.9 * scanPeriod())));
    }

    // ---- persistence (phosphor) canvas, faded with destination-out
    const pers = document.createElement("canvas");
    let persKey = "";
    function geom() { const w = ppi.w, hh = ppi.h, Rp = Math.min(w, hh) / 2 - 10; return { cx: w / 2, cy: hh / 2, Rp, k: Rp / S.disp }; }
    function persCtx() {
      const key = `${ppi.w}x${ppi.h}x${ppi.dpr}`;
      if (key !== persKey) { persKey = key; pers.width = Math.max(1, Math.round(ppi.w * ppi.dpr)); pers.height = Math.max(1, Math.round(ppi.h * ppi.dpr)); }
      const c = pers.getContext("2d"); c.setTransform(ppi.dpr, 0, 0, ppi.dpr, 0, 0); return c;
    }
    function clearPers() { const c = pers.getContext("2d"); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, pers.width, pers.height); }
    function fadePers(a) { const c = pers.getContext("2d"); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "destination-out"; c.fillStyle = `rgba(0,0,0,${a})`; c.fillRect(0, 0, pers.width, pers.height); c.restore(); }
    function paintArc(az, rKm, dRkm, a, minW, color, minHalfDeg = 0.5) {
      if (!ppi.w || rKm > S.disp) return;
      const c = persCtx(), g = geom(), T = theme();
      const half = Math.max(rad(minHalfDeg), D.thAz / 2), ang = rad(az) - Math.PI / 2;
      c.strokeStyle = alpha(color || T.scopeFg, a); c.lineWidth = Math.max(minW, dRkm * g.k);
      c.lineCap = minW >= 6 ? "round" : "butt";
      c.beginPath(); c.arc(g.cx, g.cy, Math.max(0.5, rKm * g.k), ang - half, ang + half); c.stroke();
    }

    // ---- drawing
    function drawPPI(ctx, w, hh) {
      const T = theme(), { cx, cy, Rp, k } = geom();
      ctx.fillStyle = T.scopeBg; ctx.fillRect(0, 0, w, hh);
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, Rp + 2, 0, TAU); ctx.clip();
      // beyond Ru: nothing is received there
      if (D.Ru < S.disp) {
        ctx.fillStyle = alpha(T.scopeGrid, 0.45);
        ctx.beginPath(); ctx.arc(cx, cy, Rp + 2, 0, TAU); ctx.arc(cx, cy, D.Ru * k, 0, TAU, true); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = T.scopeGrid; ctx.lineWidth = 1;
      const ring = S.disp <= 100 ? 25 : 50;
      for (let r = ring; r <= S.disp; r += ring) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, TAU); ctx.stroke(); }
      for (let a = 0; a < 360; a += 30) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Rp * Math.sin(rad(a)), cy - Rp * Math.cos(rad(a))); ctx.stroke(); }
      ctx.font = T.mono; ctx.fillStyle = T.scopeText; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let a = 0; a < 360; a += 30) { if (Rp > 200 || a % 90 === 0) ctx.fillText(a === 0 ? "N" : a === 90 ? "E" : a === 180 ? "S" : a === 270 ? "W" : `${a}`, cx + (Rp - 10) * Math.sin(rad(a)), cy - (Rp - 10) * Math.cos(rad(a))); }
      ctx.textAlign = "left";
      for (let r = ring; r <= S.disp; r += ring) if ((r / ring) % (Rp < 200 ? 2 : 1) === 0) ctx.fillText(`${r}`, cx + 3 + r * k * 0.707, cy + r * k * 0.707 + 2);
      // blind range and Ru rings
      if (D.Rb * k > 1) { ctx.fillStyle = alpha(T.scopeDim, 0.35); ctx.beginPath(); ctx.arc(cx, cy, D.Rb * k, 0, TAU); ctx.fill(); }
      if (D.Ru < S.disp) {
        ctx.strokeStyle = T.scopeText; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, D.Ru * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, `Rᵤ ${num(D.Ru, 3)} km: beyond, echoes fold back`, cx, cy - D.Ru * k - 12, { align: "center", color: T.scopeText, bg: alpha("#000000", 0.6), font: T.mono, bounds: w });
      }
      // phosphor
      persCtx();
      ctx.drawImage(pers, 0, 0, w, hh);
      // sweep and afterglow
      const a = rad(sweep) - Math.PI / 2;
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = alpha(T.scopeFg, 0.12 * (1 - i / 16));
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, Rp, a - (i + 1) * 0.025, a - i * 0.025); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = T.scopeFg; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Rp * Math.cos(a), cy + Rp * Math.sin(a)); ctx.stroke();
      // truth overlay
      if (S.truth) {
        const hz = horizon(S.hA, 5);
        if (hz < S.disp) {
          ctx.strokeStyle = alpha(T.scopeText, 0.7); ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(cx, cy, hz * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
          label(ctx, `horizon, 5 m target: ${num(hz, 3)} km`, cx, cy + hz * k + 12, { align: "center", color: T.scopeText, bg: alpha("#000000", 0.6), font: T.mono, bounds: w });
        }
        const rc = [RAIN.r * Math.sin(rad(RAIN.az)), RAIN.r * Math.cos(rad(RAIN.az))];
        ctx.strokeStyle = alpha("#7FB2FF", 0.8); ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(cx + rc[0] * k, cy - rc[1] * k, RAIN.rad * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = T.mono; ctx.fillStyle = alpha(T.scopeText, 0.6); ctx.textAlign = "center";
        ctx.fillText("hills", cx - Rp * 0.25, cy - Rp * 0.05); ctx.fillText("sea", cx + Rp * 0.3, cy + Rp * 0.35);
        for (const t of tg) {
          const x = cx + t.x * k, y = cy - t.y * k;
          if (Math.hypot(t.x, t.y) > S.disp) continue;
          ctx.strokeStyle = "#FFC24B"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + t.vx * 60 * k, y - t.vy * 60 * k); ctx.stroke();
          if (t.ev?.folded && t.lastDet > simT - 2 * scanPeriod()) {
            const az = rad(t.ev.az), ax = cx + t.ev.ra * k * Math.sin(az), ay = cy - t.ev.ra * k * Math.cos(az);
            ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ax, ay); ctx.stroke(); ctx.setLineDash([]);
          }
          if (Rp > 220 || t.id === S.sel) label(ctx, t.name.split(" (")[0], x + 8, y - 9, { color: "#FFC24B", bg: alpha("#000000", 0.6), font: T.mono, bounds: w });
        }
      }
      // selection
      const s = byId(S.sel);
      const sp = selPos(s);
      if (sp) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sp[0], sp[1], 11, 0, TAU); ctx.stroke(); }
    }
    function selPos(t) {
      const { cx, cy, k } = geom();
      if (S.truth) return [cx + t.x * k, cy - t.y * k];
      if (t.lastDet > simT - 2.05 * scanPeriod() && t.ev && t.ev.ra <= S.disp) { const a = rad(t.ev.az); return [cx + t.ev.ra * k * Math.sin(a), cy - t.ev.ra * k * Math.cos(a)]; }
      return null;
    }
    function pick(x, y) {
      let best = null, bd = 26;
      const { cx, cy, k } = geom();
      for (const t of tg) {
        const cands = [];
        if (t.lastDet > simT - 2.05 * scanPeriod() && t.ev) { const a = rad(t.ev.az); cands.push([cx + t.ev.ra * k * Math.sin(a), cy - t.ev.ra * k * Math.cos(a)]); }
        if (S.truth) cands.push([cx + t.x * k, cy - t.y * k]);
        for (const [px, py] of cands) { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = t; } }
      }
      if (best) { S.sel = best.id; paintInspector(); paintMission(); ppi.redraw(); }
    }

    // ---- side panels
    function paintMission() {
      let n = 0;
      for (const { t, btn, icon, note } of missionRows) {
        const det = t.lastDet > simT - 2.05 * scanPeriod() && t.ev;
        const folded = det && t.ev.folded;
        const ok = det && !folded;
        if (ok && t.kind !== "birds") n++;
        icon.textContent = ok ? "✓" : folded ? "↻" : "·";
        icon.style.color = ok ? "var(--ok)" : folded ? "var(--warn)" : "var(--muted)";
        note.textContent = t.kind === "birds" ? (ok ? "seen (not a target)" : "not a target") : ok ? `${num(t.ev.r, 3)} km` : folded ? `ghost at ${num(t.ev.ra, 3)} km` : t.ev ? "not detected" : "waiting for sweep";
        btn.style.borderColor = t.id === S.sel ? "var(--accent)" : "var(--line)";
        btn.setAttribute("aria-pressed", String(t.id === S.sel));
      }
      missionCard.querySelector(".card-head .sub").textContent = `Detected ${n} of ${MISSION.length}`;
    }
    function paintInspector() {
      const t = byId(S.sel);
      inspCard.querySelector(".card-head .sub").textContent = t.name;
      const ev = t.ev;
      if (!ev) { inspSt.set("info", "Waiting for the sweep", "<br>The beam hasn't passed this target yet."); inspRo.set([]); return; }
      const need = D.s50;
      let kind = "bad", title, body = "";
      if (ev.det && !ev.folded) { kind = "ok"; title = `Detected at ${num(ev.r, 4)} km`; body = `<br>Signal-to-interference ${num(ev.sinr, 3)} dB per pulse; ${num(D.nEff, 3)} pulses integrated needs about ${num(need, 2)} dB for a 50 % chance.`; }
      else if (ev.det && ev.folded) { kind = "warn"; title = `Range-folded: shown at ${num(ev.ra, 3)} km`; body = `<br>It is really at ${num(ev.r, 4)} km, beyond Rᵤ = ${num(D.Ru, 3)} km, so its echo arrives after the next pulse has gone out. A PRF below ${num(C0 / (2 * ev.r * 1000), 3)} Hz puts it at its true range.`; }
      else if (ev.hidden) { title = "Below the radar horizon"; body = `<br>At ${num(t.alt, 3)} m altitude it can only be seen inside ${num(ev.hz, 3)} km from a ${S.hA} m antenna; it is at ${num(ev.r, 3)} km.`; }
      else {
        const why = [];
        if (ev.eclipse != null && ev.eclipse < -6) why.push(`it sits inside the blind range (${num(D.Rb, 3)} km) while the transmitter is on`);
        if (S.mti && ev.mti < -6) why.push(`its radial speed ${num(Math.abs(ev.vr), 3)} m/s is close to a blind speed of the MTI (multiples of ${num(D.vb, 3)} m/s${S.stagger ? ", only partly filled by the stagger" : ""}), response ${num(ev.mti, 3)} dB`);
        if (ev.cres > ev.snr - 3 && isFinite(ev.cres)) why.push(`${isFinite(ev.rawRain) && ev.rawRain >= ev.rawGround ? "rain" : "clutter"} at the same range is ${num(ev.cres, 3)} dB above noise even after filtering`);
        if (ev.rainL > 6) why.push(`the rain absorbs ${num(ev.rainL, 3)} dB on the way out and back`);
        if (!why.length) why.push(`it is simply too weak: ${num(ev.snr, 3)} dB per pulse against about ${num(need, 2)} dB needed`);
        title = "Not detected this scan"; body = `<br>Because ${why.join("; ")}.`;
        if (ev.pd > 0.2) body += ` (Its detection chance is ${num(ev.pd * 100, 2)} %, so it comes and goes.)`;
      }
      inspSt.set(kind, title, body);
      const rows = [
        ["True range", `${num(ev.r, 4)} km`], ["Apparent range", `${num(ev.ra, 4)} km`, ev.folded ? "warn" : null],
        ["Altitude", `${num(t.alt, 3)} m`], ["Radial speed", `${num(ev.vr, 3)} m/s ${ev.vr < 0 ? "(closing)" : "(opening)"}`],
        ["RCS (mean / this scan)", `${num(ev.sigMean, 2)} / ${num(ev.sig, 2)} m²`],
        ["SNR per pulse, free space", `${num(ev.snr0, 3)} dB`],
        ...ev.losses.map(([k2, v]) => [k2, `${v >= 0 ? "+" : ""}${num(v, 3)} dB`, v < -6 ? "warn" : null]),
        ["Clutter + rain after filter", isFinite(ev.cres) ? `${num(ev.cres, 3)} dB` : "none"],
        ["Signal ⁄ (noise + clutter)", isFinite(ev.sinr) ? `${num(ev.sinr, 3)} dB` : "–"],
        ["Detection probability", ev.pd < 0.001 ? "< 0.1 %" : `${num(ev.pd * 100, 3)} %`, ev.pd > 0.5 ? "ok" : "warn"],
      ];
      inspRo.set(rows);
    }

    function changed() {
      derive();
      const hz5 = horizon(S.hA, 5), hz30 = horizon(S.hA, 30);
      const rmax = 100 * 10 ** ((D.snrRef - D.s50) / 40);
      const fa = Math.max(0, ((Math.min(D.Ru, 300) - D.Rb) * 1000) / D.dR) * (360 / deg(D.thAz)) * S.pfa;
      if (D.duty > 0.2) numSt.set("bad", `Duty cycle ${num(D.duty * 100, 3)} %`, "<br>No real transmitter runs that hot: tubes manage a few per cent, solid-state about 10–20 %.");
      else if (D.n < 3) numSt.set("warn", `Only ${num(D.n, 2)} hits per scan`, "<br>Too few pulses to integrate, and an MTI needs at least 2–3. Slow the rotation, widen the beam or raise the PRF.");
      else if (D.Ru < 290) numSt.set("warn", `Rᵤ is only ${num(D.Ru, 3)} km`, "<br>Anything farther away folds back to the wrong range.");
      else numSt.set("ok", `Rmax ≈ ${num(rmax, 3)} km for 1 m²`, "<br>(50 % detection, clear air, before horizon and clutter.)");
      numRo.set([
        ["Wavelength", `${num(D.lam * 100, 3)} cm`],
        ["Beamwidth", `${num(deg(D.thAz), 2)}°`],
        ["Antenna gain", `${num(dB(D.G), 3)} dBi`],
        ["Unambiguous range Rᵤ", `${num(D.Ru, 3)} km`, D.Ru < 290 ? "warn" : "ok"],
        ["Range resolution ΔR", km(D.dR, 3)],
        ["Blind range", km(D.Rb * 1000, 3)],
        ["Hits per scan", num(D.n, 3), D.n < 5 ? "warn" : null],
        ["Average power", si(D.pav, "W")],
        ["Duty cycle", `${num(D.duty * 100, 2)} %`, D.duty > 0.2 ? "bad" : null],
        ["Rmax, 1 m², Pd 50 %", `${num(rmax, 3)} km`],
        ["SNR needed per pulse", `${num(D.s50, 3)} dB`],
        ["First blind speed", S.mti ? `${num(D.vb, 3)} m/s` : "no MTI"],
        ["Ground clutter after filter", `${num(dB(D.groundRes), 3)} dB`],
        ["Horizon: 30 m / 5 m target", `${num(hz30, 3)} / ${num(hz5, 3)} km`],
        ["Rain loss, 2-way", `${num(D.gamma * 2, 2)} dB/km`],
        ["Noise false alarms", `≈ ${num(fa, 2)} per scan`],
      ]);
      ppiCap.innerHTML = `Scan every ${num(scanPeriod(), 3)} s. Bright arcs are detections (each is about one beamwidth wide and one resolution cell deep); dimmer ones are clutter and rain; scattered dots are noise false alarms. The shaded centre is the blind range.`;
      paintMission(); paintInspector();
      ch.update(S);
      ppi.redraw();
    }

    // ---- loop
    let lastUi = 0;
    const anim = api.track(animate((dt, tt) => {
      step(dt);
      ppi.redraw();
      if (tt - lastUi > 0.4) { lastUi = tt; paintMission(); ch.update(S); }
    }, { target: ppi.canvas, playing: !reducedMotion }));
    playButton(ppi, anim);

    void tour;
    changed();
    if (reducedMotion) queueMicrotask(() => { for (let k = 0; k < 300; k++) step((scanPeriod() * 1.5) / 300); changed(); });

    notes(root, "Background", [
      { title: "Where each setting comes from", open: true, html:
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Setting</th><th>What it changes here</th><th>Lesson</th></tr>" +
        "<tr><td>Peak power, pulse width</td><td>Pulse energy <i>P</i><sub>t</sub>τ sets the SNR; τ also sets the blind range <i>c</i>τ/2</td><td><a href=\"#equation\">The radar equation</a>, <a href=\"#pulses\">Pulse width, PRI & PRF</a></td></tr>" +
        "<tr><td>Pulse compression</td><td>Keeps the long pulse's energy but resolves <i>c</i>/2<i>B</i> = 75 m; smaller cells hold less clutter and rain</td><td><a href=\"#modulation\">Modulation & pulse compression</a></td></tr>" +
        "<tr><td>PRF</td><td>Rᵤ = <i>c</i>/2·PRF (folding), hits per scan, MTI blind speeds λ·PRF/2</td><td><a href=\"#pulses\">Pulse width, PRI & PRF</a>, <a href=\"#doppler\">Doppler</a></td></tr>" +
        "<tr><td>Band</td><td>λ sets beamwidth and gain for a given antenna, rain echo (∝ 1/λ⁴), rain loss and Doppler</td><td><a href=\"#frequency\">Frequencies & bands</a></td></tr>" +
        "<tr><td>Antenna width</td><td>Gain 4π<i>A</i><sub>e</sub>/λ² and beamwidth ≈ 1.2 λ/<i>D</i></td><td><a href=\"#dish\">Parabolic antennas</a></td></tr>" +
        "<tr><td>Rotation</td><td>Revisit time and hits per scan <i>n</i> = θ<sub>3</sub>·PRF/ω̇</td><td><a href=\"#scans\">Scan patterns</a></td></tr>" +
        "<tr><td>Antenna height</td><td>Radar horizon 4.12(√<i>h</i><sub>r</sub> + √<i>h</i><sub>t</sub>) km, and how far the hills are visible</td><td><a href=\"#propagation\">Propagation</a></td></tr>" +
        "<tr><td>MTI, stagger</td><td>Cancels stationary clutter, but also slow and tangential targets and those at blind speeds</td><td><a href=\"#doppler\">Doppler & velocity</a></td></tr>" +
        "<tr><td>CFAR, Pfa</td><td>Threshold: fewer false alarms cost sensitivity; CFAR hides clutter residue</td><td><a href=\"#detection\">Noise, clutter & detection</a></td></tr></table></div>" },
      { title: "The signal model", html:
        "<p>For each target, every time the beam crosses it, the single-pulse SNR comes from the radar equation for a matched filter:</p>" +
        "<p class=\"eq\">SNR = <span class=\"frac\"><span><i>P</i><sub>t</sub> τ <i>G</i>² λ² σ</span><span>(4π)³ <i>R</i>⁴ <i>k T</i><sub>0</sub> <i>F L</i></span></span></p>" +
        "<p>with <i>G</i> = 4π(0.6 · <i>W</i> · <i>W</i>/4)/λ², noise figure <i>F</i> = 3 dB and losses <i>L</i> = 7 dB (elevation shaping, beam-shape loss, plumbing). The RCS is redrawn from an exponential distribution every scan (a <b>Swerling 1</b> target), which is why marginal targets blink. Then the model subtracts horizon and eclipsing losses, two-way rain attenuation, and the MTI's response at the target's Doppler.</p>" +
        "<p>Detection uses <b>Albersheim's equation</b> for the SNR needed with <i>n</i> pulses integrated non-coherently (<i>n</i> = hits per scan, minus the pulses an MTI consumes). The probability of detection is a smooth curve fitted through Albersheim's 50 % and 90 % points. Clutter and rain left over after the filter are added to the noise.</p>" },
      { title: "Clutter, rain and the MTI", html:
        "<p>Ground clutter per resolution cell is σ<sub>c</sub> = σ<sup>0</sup> · <i>R</i> θ<sub>az</sub> Δ<i>R</i> with σ<sup>0</sup> ≈ −27 dB (patchy, ±4 dB), visible only where the terrain is above the radar's horizon. Rain reflectivity follows <i>Z</i> = 200 <i>R</i><sup>1.6</sup> (12 mm/h ≈ 40 dBZ), giving η = π⁵|<i>K</i>|²<i>Z</i>/λ⁴ per cubic metre over a cell up to 4 km tall, and attenuates the beam by <i>k R</i><sup>α</sup> dB/km.</p>" +
        "<p>The MTI's response is computed from the clutter spectrum: wind-blown vegetation (0.25 m/s) widened by the antenna's own scanning (σ<sub>f</sub> = 0.265 · PRF/<i>n</i>). For a 2-pulse canceller the clutter residue (relative to noise gain) is 1 − e<sup>−2π²σ²/PRF²</sup>; for a 3-pulse canceller it is much smaller. Transmitter stability limits any canceller to about 45 dB. Rain moves with the wind (15 m/s) and has a wide spectrum, so an MTI barely touches it. A staggered PRF averages the response over two PRFs ±15 %, which fills in most blind speeds. It also jitters the range of second-time-around echoes from pulse to pulse, so folded targets and folded clutter no longer line up for integration; the model charges them 10 dB.</p>" },
      { title: "What's simplified", html:
        "<ul><li>One shaped elevation beam covers all heights equally; real fan beams lose gain at high elevation and have a cone of silence overhead.</li>" +
        "<li>The horizon is a hard 4/3-Earth cut-off with a short diffraction fade; no multipath lobing or ducting.</li>" +
        "<li>CFAR is ideal: it removes clutter residue except the patchiest spots and costs 1 dB; it doesn't model edge effects or target masking by neighbours.</li>" +
        "<li>No sea clutter, no range sidelobes from pulse compression, no Doppler processing beyond MTI, no secondary radar (transponders).</li>" +
        "<li>The stealthy drone's RCS falls as 1/<i>f</i>²: shaping and coatings work best when the aircraft is many wavelengths long, which is one reason low-band radars are popular again.</li></ul>" },
    ]);

    api.quiz(root, [
      { q: "A target at 200 km appears at 50 km. What's the most likely PRF?", options: ["500 Hz", "1000 Hz", "2000 Hz", "3000 Hz"], answer: 1, why: "At 1 kHz, Rᵤ = c/2PRF = 150 km, so 200 km folds to 200 − 150 = 50 km." },
      { q: "You switch on MTI and a helicopter that was visible disappears whenever it flies across your line of sight. Why?", options: ["MTI adds noise", "Crossing targets have almost no radial velocity, so their Doppler sits in the MTI's notch with the clutter", "The helicopter goes below the horizon", "The PRF changed"], answer: 1, why: "The MTI only passes echoes whose phase changes between pulses. A tangential target has zero Doppler, exactly like the hills." },
      { q: "Why can an L-band radar see the turboprop inside the storm when an X-band radar can't?", options: ["L-band has more power", "Rain echo falls as 1/λ⁴ and rain attenuation is tiny at long wavelengths", "L-band has a narrower beam", "X-band can't use pulse compression"], answer: 1, why: "Going from 3 cm to 23 cm cuts the rain's reflectivity by about (23/3)⁴ ≈ 3500 (35 dB) and removes most of the attenuation." },
      { q: "Raising the antenna from 10 m to 40 m extends the horizon for a sea-skimmer at 5 m from about 22 km to…", options: ["About 26 km", "About 35 km", "About 44 km", "About 88 km"], answer: 1, why: "4.12 × (√40 + √5) = 4.12 × (6.32 + 2.24) ≈ 35 km." },
    ]);
  },
};
