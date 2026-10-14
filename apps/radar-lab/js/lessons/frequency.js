// Lesson 4: radar frequency bands. Wavelength to scale, what each band is used for, and the physics that makes
// the choice a trade-off: beamwidth, atmospheric and rain loss, scattering regimes, Doppler and bandwidth.
import {
  h, C0, card, labGrid, group, notes, slider, choice, readout, legend,
  canvasView, drag, animate, playButton, axes, plotFn, theme, alpha, label, dimension, arrow, num, si, km, fmtDb, clamp, lerp, TAU, reducedMotion,
} from "../ui.js";

const F_MIN = 3e6, F_MAX = 110e9;

// IEEE Std 521 letter bands (HF, VHF, UHF are the ITU decade names IEEE also uses for radar).
const BANDS = [
  { id: "HF", lo: 3e6, hi: 30e6, uses: "Over-the-horizon radar that bounces off the ionosphere (Australia's JORN, the US ROTHR) to see thousands of km; HF surface-wave radar for coastal and ocean-current mapping. Chain Home (1938) worked at 20–30 MHz." },
  { id: "VHF", lo: 30e6, hi: 300e6, uses: "Very long-range early warning (e.g. the P-18 at ~160 MHz) and counter-stealth search: aircraft features are comparable to the wavelength, so shaping helps less. Atmospheric wind profilers near 50 MHz." },
  { id: "UHF", lo: 300e6, hi: 1e9, uses: "Ballistic-missile early warning (PAVE PAWS / UEWR at 420–450 MHz), airborne early warning (E-2D Hawkeye), foliage-penetrating radar, 915 MHz wind profilers." },
  { id: "L", lo: 1e9, hi: 2e9, uses: "Long-range air surveillance and en-route air-traffic control (1.2–1.4 GHz), secondary radar / IFF at 1030 and 1090 MHz, airborne AEW (E-7 Wedgetail), L-band SAR satellites that see through vegetation." },
  { id: "S", lo: 2e9, hi: 4e9, uses: "Airport surveillance radar (2.7–2.9 GHz), NEXRAD weather radar (2.7–3.0 GHz), naval air-defence radars (SPY-1, SPY-6), ship navigation radar at 3 GHz. A good compromise between range, weather penetration and size." },
  { id: "C", lo: 4e9, hi: 8e9, uses: "Weather radar in Europe and Terminal Doppler Weather Radar (5.6 GHz), aircraft radio altimeters (4.2–4.4 GHz), C-band SAR (Sentinel-1 at 5.4 GHz), mobile surveillance and fire-control radars." },
  { id: "X", lo: 8e9, hi: 12e9, uses: "Fighter nose radars and fire control, marine navigation radar (9.4 GHz), missile-defence radars (AN/TPY-2), high-resolution SAR (TerraSAR-X), short-range weather radar, X-band police guns (10.525 GHz)." },
  { id: "Ku", lo: 12e9, hi: 18e9, uses: "Airport surface-movement radar (ASDE, ~16 GHz), satellite altimeters and scatterometers (13.6 GHz), helicopter and drone-detection radars, high-resolution mapping." },
  { id: "K", lo: 18e9, hi: 27e9, uses: "K-band police guns (24.15 GHz) and older 24 GHz car radars. The 22.2 GHz water-vapour line makes it poor for long range, which is how Ku and Ka got their names." },
  { id: "Ka", lo: 27e9, hi: 40e9, uses: "Cloud radar (35 GHz), helicopter fire-control (Apache Longbow, ~35 GHz), missile seekers, Ka-band police guns (33.4–36 GHz), millimetre-wave security scanners." },
  { id: "V", lo: 40e9, hi: 75e9, uses: "Very short-range sensing: 60 GHz gesture and presence radar in phones and homes, where oxygen absorption (~15 dB/km) stops interference travelling far. Also covert satellite cross-links." },
  { id: "W", lo: 75e9, hi: 110e9, uses: "Automotive radar (76–81 GHz), 94 GHz cloud radar (CloudSat), millimetre-wave seekers (Brimstone), imaging and industrial level sensing. Up to 4 GHz of bandwidth gives centimetre resolution." },
];
// NATO / EU electronic-warfare bands (used for ECM; note their C, K and L differ from IEEE's).
const NATO = [["A", 0, 250e6], ["B", 250e6, 500e6], ["C", 500e6, 1e9], ["D", 1e9, 2e9], ["E", 2e9, 3e9], ["F", 3e9, 4e9], ["G", 4e9, 6e9],
  ["H", 6e9, 8e9], ["I", 8e9, 10e9], ["J", 10e9, 20e9], ["K", 20e9, 40e9], ["L", 40e9, 60e9], ["M", 60e9, 100e9]];

// ITU-R P.838-3 rain coefficients, horizontal polarisation: [GHz, k, α] for γ = k·R^α dB/km.
const RAIN = [[1, 0.0000259, 0.9691], [1.5, 0.0000443, 1.0185], [2, 0.0000847, 1.0664], [2.5, 0.0001321, 1.1209], [3, 0.000139, 1.2322],
  [4, 0.0001071, 1.6009], [5, 0.0002162, 1.6969], [6, 0.0007056, 1.59], [7, 0.001915, 1.481], [8, 0.004115, 1.3905], [10, 0.01217, 1.2571],
  [12, 0.02386, 1.1825], [15, 0.04481, 1.1233], [20, 0.09164, 1.0568], [25, 0.1571, 0.9991], [30, 0.2403, 0.9485], [35, 0.3374, 0.9047],
  [40, 0.4431, 0.8673], [50, 0.66, 0.8084], [60, 0.8606, 0.7656], [70, 1.0315, 0.7345], [80, 1.1704, 0.7115], [90, 1.2807, 0.6944], [100, 1.3671, 0.6815]];
// Clear-air gaseous attenuation at sea level (15 °C, 7.5 g/m³ water vapour), read off ITU-R P.676 curves: [GHz, dB/km].
const GAS = [[1, 0.0055], [2, 0.0068], [5, 0.0085], [10, 0.013], [15, 0.028], [20, 0.09], [22.2, 0.19], [25, 0.13], [30, 0.09], [35, 0.085],
  [40, 0.11], [45, 0.18], [50, 0.4], [54, 2.5], [57, 9], [60, 15], [63, 9], [66, 2.5], [70, 0.55], [80, 0.3], [90, 0.34], [94, 0.38], [100, 0.45], [110, 0.65]];

/** Piecewise interpolation in log10(f); `logY` interpolates log10(y). Extrapolates the end segments. */
function interp(tab, fG, col, logY) {
  const lf = Math.log10(fG);
  let i = tab.findIndex((r) => r[0] >= fG);
  if (i <= 0) i = i === 0 ? 1 : tab.length - 1;
  const a = tab[i - 1], b = tab[i];
  const t = (lf - Math.log10(a[0])) / (Math.log10(b[0]) - Math.log10(a[0]));
  return logY ? 10 ** lerp(Math.log10(a[col]), Math.log10(b[col]), t) : lerp(a[col], b[col], t);
}
export function rainDbKm(f, R) {
  if (R <= 0) return 0;
  const fG = clamp(f / 1e9, 0.1, 110);
  const k = interp(RAIN, fG, 1, true), a = clamp(interp(RAIN, fG, 2, false), 0.6, 1.8);
  return k * R ** a;
}
export function gasDbKm(f) {
  const fG = f / 1e9;
  if (fG < 1) return 0.0055 * fG ** 0.3; // dry-air continuum, negligible
  return interp(GAS, Math.min(fG, 110), 1, true);
}

/** Monostatic RCS of a perfectly conducting sphere, σ/(πa²), from the exact Mie series. x = ka = 2πa/λ. */
export function pecSphere(x) {
  const nmax = Math.max(2, Math.round(x + 4 * Math.cbrt(x) + 3));
  const top = nmax + 20 + Math.round(4 * Math.sqrt(x));
  // Riccati–Bessel ψ_n(x) = x·j_n(x) by downward (Miller) recurrence, stored at index n + 1 (so ψ_-1 is index 0).
  const psi = new Float64Array(top + 3);
  psi[top + 1] = 1;
  for (let n = top; n >= 0; n--) {
    psi[n] = ((2 * n + 1) / x) * psi[n + 1] - psi[n + 2];
    if (Math.abs(psi[n]) > 1e100) for (let k = n; k <= top + 2; k++) psi[k] *= 1e-100;
  }
  const m0 = Math.max(Math.abs(psi[0]), Math.abs(psi[1])), q0 = psi[0] / m0, q1 = psi[1] / m0;
  const s = (Math.sin(x) * q1 + Math.cos(x) * q0) / (q1 * q1 + q0 * q0) / m0; // match ψ_0 = sin x, ψ_-1 = cos x
  // χ_n = −x·y_n by upward recurrence (stable).
  const chi = new Float64Array(nmax + 2);
  chi[0] = -Math.sin(x); chi[1] = Math.cos(x);
  for (let n = 1; n <= nmax; n++) chi[n + 1] = ((2 * n - 1) / x) * chi[n] - chi[n - 1];
  let sr = 0, si_ = 0;
  for (let n = 1; n <= nmax; n++) {
    const ps = psi[n + 1] * s, psm = psi[n] * s, ch = chi[n + 1], chm = chi[n];
    const dps = psm - (n / x) * ps, dch = chm - (n / x) * ch;
    // ξ = ψ + iχ ;  a_n = ψ'/ξ' (TM),  b_n = ψ/ξ (TE)
    const ma = dps * dps + dch * dch, mb = ps * ps + ch * ch;
    const ar = (dps * dps) / ma, ai = (-dps * dch) / ma, br = (ps * ps) / mb, bi = (-ps * ch) / mb;
    const w = (n % 2 ? -1 : 1) * (n + 0.5);
    sr += w * (br - ar); si_ += w * (bi - ai);
  }
  return (4 / (x * x)) * (sr * sr + si_ * si_);
}

const OBJECTS = [
  ["rain", "Raindrop", 1e-3, "a 2 mm raindrop"],
  ["insect", "Insect", 3e-3, "a 6 mm insect"],
  ["bird", "Bird", 0.05, "a bird's 10 cm body"],
  ["person", "Person", 0.3, "a person (0.3 m equivalent sphere)"],
  ["jet", "Aircraft", 2, "a fighter fuselage (2 m equivalent sphere)"],
];
const SCALE_THINGS = [ // name, size in metres, kind (for drawing)
  ["airliner", 60, "plane"], ["house", 9, "house"], ["car", 4.5, "car"], ["person", 1.75, "person"], ["pigeon", 0.32, "bird"],
  ["coin", 0.024, "coin"], ["raindrop", 0.002, "drop"],
];

const bandOf = (f) => BANDS.find((b) => f >= b.lo && f < b.hi) || BANDS.at(-1);
const natoOf = (f) => (f > 100e9 ? null : NATO.find(([, lo, hi]) => f >= lo && f < hi));
const regime = (x) => (x < 0.5 ? "Rayleigh" : x < 10 ? "resonance (Mie)" : "optical");
const beamwidth = (lam, D) => Math.min(180, (70 * lam) / D); // degrees, typical tapered dish

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "Radar uses radio waves anywhere from a few megahertz to over 100 GHz, and the choice of frequency shapes almost everything about a radar: " +
      "how big its antenna must be, how far it can see through air and rain, how sharply it measures speed and range, and even which targets it can see well. " +
      "Slide through the spectrum and watch the wave, the beam and the losses change." }));

    const S = { f: 3e9, D: 1, rain: 0, obj: "rain", phase: 0 };
    const keyOf = (f) => bandOf(f).id;
    let touring = false; // tour steps set the sim up but don't tick challenges for the reader
    const tourSet = (f, extra) => { touring = true; setF(f, extra); touring = false; };
    let rcsCurve = null; // cached [x, σ/πa²] samples (independent of controls)

    api.steps(root, [
      { title: "1 · Radio is light you can't see", html:
        "<p>Radar waves are electromagnetic waves, like light, travelling at <i>c</i> ≈ 3 × 10⁸ m/s. Frequency and wavelength are locked together:</p>" +
        "<p class=\"eq\">λ = <span class=\"frac\"><span><i>c</i></span><span><i>f</i></span></span></p><p>At 3 GHz a wave is 10 cm long; at 300 MHz it is a metre.</p>",
        look: "the wave drawn to scale against everyday objects, and the band strip below it.", apply: () => tourSet(3e9, { D: 1, rain: 0, obj: "rain" }) },
      { title: "2 · Low bands: enormous waves", html:
        "<p>At HF (3–30 MHz) a wavelength is 10–100 m, longer than an airliner. Antennas must be huge to make a beam, but these waves refract off the ionosphere and come back down thousands of kilometres away: <b>over-the-horizon radar</b>.</p>",
        look: "the airliner is about one wavelength long, and a 1 m antenna makes no beam at all.", apply: () => tourSet(5e6, { D: 1 }) },
      { title: "3 · Microwaves: X band", html:
        "<p>At 10 GHz the wave is 3 cm long. A 1 m dish is 33 wavelengths across and makes a beam about 2° wide, small enough for a fighter's nose. That's why most fire-control and airborne radars are X band.</p>",
        look: "the beam cone and its 1.8 km footprint at 50 km.", apply: () => tourSet(10e9, { D: 1, rain: 0 }) },
      { title: "4 · Narrow beams want high frequency", html:
        "<p>Beamwidth depends on the antenna's size <i>in wavelengths</i>: θ ≈ 70 λ/<i>D</i> degrees. Keep the dish at 1 m and go to 35 GHz: the beam shrinks to 0.6°. Or keep the beam and shrink the antenna.</p>",
        look: "the beam narrowing and the angular-resolution bar growing.", apply: () => tourSet(35e9, { D: 1, rain: 0 }) },
      { title: "5 · …but the air fights back", html:
        "<p>Higher frequencies are absorbed more. Water vapour has a resonance at 22 GHz and oxygen at 60 GHz, where clear air alone eats ~15 dB per km. Rain is worse: in a 25 mm/h downpour, X band loses ~0.7 dB/km and Ka band ~6 dB/km.</p>",
        look: "the attenuation curves and the beam fading out across the rain.", apply: () => tourSet(60e9, { rain: 25, D: 1 }) },
      { title: "6 · Small targets and the f⁴ law", html:
        "<p>When a target is much smaller than λ (the <b>Rayleigh region</b>), its echo grows as <i>f</i>⁴. A raindrop is invisible at HF but bright at S band, which is why weather radars work. When features are comparable to λ (<b>resonance</b>), echoes oscillate; when they are much larger (<b>optical</b>), RCS settles to the geometric value.</p>",
        look: "the sphere RCS plot. Slide the frequency and watch the raindrop's marker climb the f⁴ slope.", apply: () => tourSet(2.8e9, { obj: "rain", rain: 0 }) },
      { title: "7 · Your turn", html: "<p>Every band is a compromise. Work through the challenges below: find automotive radar's band, the worst frequency for clear air, and where a raindrop stops being a Rayleigh scatterer.</p>" },
    ]);

    const lab = labGrid(root);

    // ---- wavelength to scale + band strip
    const waveCard = card(lab.main, "Wavelength to scale", "one wavelength shown against real objects");
    const wave = api.track(canvasView(waveCard, { aspect: 2.5, minHeight: 170, maxHeight: 280, draw: drawWave, label: "A radio wave drawn to scale next to everyday objects" }));
    const waveCap = h("p", { class: "caption", style: { marginBottom: "8px" } });
    waveCard.append(waveCap);
    const strip = api.track(canvasView(waveCard, { height: 104, draw: drawStrip, label: "Radar band chart from 3 MHz to 110 GHz; drag to tune" }));
    drag(strip, { move: (x) => { const P = stripMap(); setF(clamp(P.inv(x), F_MIN, F_MAX)); } });
    const usesBox = h("div", { class: "callout", style: { fontSize: "14px" } });
    waveCard.append(h("p", { class: "caption", style: { marginTop: "2px" }, text: "Top row: IEEE radar bands. Bottom row: NATO/EU electronic-warfare bands. Tap or drag the strip to tune." }), usesBox);
    const anim = api.track(animate((dt) => { S.phase = (S.phase + dt * 1.2) % 1; wave.redraw(); }, { target: wave.canvas, playing: !reducedMotion }));
    playButton(wave, anim);

    // ---- beam
    const beamCard = card(lab.main, "The beam over 50 km", "true angles, equal scales");
    const beam = api.track(canvasView(beamCard, { aspect: 3.2, minHeight: 150, maxHeight: 250, draw: drawBeam, label: "Side view of the antenna beam spreading over 50 km, fading with attenuation" }));
    const beamCap = h("p", { class: "caption" });
    beamCard.append(beamCap);

    const cols = h("div", { class: "cols2" });
    lab.main.append(cols);
    // ---- attenuation vs frequency
    const attCard = card(cols, "Attenuation vs frequency", "one-way, dB per km, approximate");
    const att = api.track(canvasView(attCard, { aspect: 1.35, minHeight: 220, maxHeight: 340, draw: drawAtt, label: "Clear-air and rain attenuation against frequency" }));
    legend(attCard, [[theme().rx, "clear air (sea level)"], [theme().c4, "rain at the chosen rate"], [theme().tx, "total"]]);
    // ---- sphere RCS
    const rcsCard = card(cols, "Sphere RCS: three regimes", "exact Mie series, perfect conductor");
    const rcs = api.track(canvasView(rcsCard, { aspect: 1.35, minHeight: 220, maxHeight: 340, draw: drawRcs, label: "Normalised radar cross-section of a sphere against circumference over wavelength" }));
    const rcsCap = h("p", { class: "caption" });
    rcsCard.append(rcsCap);

    // ---- relative scores
    const scoreCard = card(lab.main, "Trade-offs at this frequency", "qualitative, 0 = worst band, 1 = best");
    const score = api.track(canvasView(scoreCard, { height: (w) => (w < 480 ? 250 : 210), draw: drawScores, label: "Bar chart of relative strengths at the chosen frequency" }));

    // ---- controls
    const ctl = card(lab.side, "Controls");
    const g1 = group(ctl, "Frequency");
    const fSl = slider(g1, { label: "Frequency", min: F_MIN, max: F_MAX, log: true, value: S.f, format: (v) => si(v, "Hz", 3), onInput: (v) => setF(v) });
    const bandCh = choice(g1, { label: "Jump to a band", value: keyOf(S.f), options: BANDS.map((b) => [b.id, b.id]),
      onChange: (id) => { const b = BANDS.find((x) => x.id === id); setF(Math.sqrt(b.lo * b.hi)); } });
    const g2 = group(ctl, "Antenna & weather");
    const dSl = slider(g2, { label: "Dish diameter <i>D</i>", min: 0.1, max: 30, log: true, value: S.D, format: (v) => km(v, 2), onInput: (v) => { S.D = v; changed(); } });
    const rSl = slider(g2, { label: "Rain rate", min: 0, max: 100, step: 1, value: S.rain, format: (v) => (v ? `${v} mm/h` : "dry"),
      help: "Drizzle 1, moderate 5, heavy 25, tropical storm 100 mm/h.", onInput: (v) => { S.rain = v; changed(); } });
    const g3 = group(ctl, "Scatterer (treated as a sphere)");
    const objCh = choice(g3, { value: S.obj, options: OBJECTS.map(([id, name]) => [id, name]), onChange: (v) => { S.obj = v; changed(); } });
    const out = card(lab.side, "At this frequency");
    const ro = readout(out);

    const ch = api.challenges(root, [
      { id: "auto", text: "Tune to the band car radars use for adaptive cruise control.", check: (s) => s.f >= 76e9 && s.f <= 81e9 },
      { id: "beam", text: "With a 1 m dish (0.9–1.1 m), pick a frequency that gives a beam narrower than 2°.", check: (s) => s.D >= 0.9 && s.D <= 1.1 && s.bw < 2 },
      { id: "rayleigh", text: "Find where a 2 mm raindrop just leaves the Rayleigh region (ka between 0.5 and 1).", check: (s) => s.obj === "rain" && s.ka >= 0.5 && s.ka <= 1 },
      { id: "oxygen", text: "Find the frequency where clear air alone absorbs the most.", check: (s) => s.gas > 10 },
      { id: "rainfade", text: "In heavy rain (25 mm/h or more), find a frequency that loses over 10 dB one-way across 50 km.", check: (s) => s.rain >= 25 && s.loss50 > 10 },
      { id: "resonant", text: "Put a person in the resonance region, the trick behind counter-stealth VHF/UHF radar.", check: (s) => s.obj === "person" && s.ka >= 0.5 && s.ka < 10 },
    ]);

    // ---- model
    function model() {
      const lam = C0 / S.f;
      const o = OBJECTS.find((x) => x[0] === S.obj);
      const ka = (TAU * o[2]) / lam;
      const gas = gasDbKm(S.f), rain = rainDbKm(S.f, S.rain);
      return { lam, bw: beamwidth(lam, S.D), gas, rainA: rain, loss50: (gas + rain) * 50, ka, o, sigmaN: pecSphere(ka) };
    }
    function setF(f, extra = {}) {
      S.f = clamp(f, F_MIN, F_MAX);
      if (extra.D != null) { S.D = extra.D; dSl.value = S.D; }
      if (extra.rain != null) { S.rain = extra.rain; rSl.value = S.rain; }
      if (extra.obj != null) { S.obj = extra.obj; objCh.value = S.obj; }
      fSl.value = S.f;
      bandCh.value = keyOf(S.f);
      changed();
    }
    function changed() {
      const M = model();
      Object.assign(S, { bw: M.bw, gas: M.gas, loss50: M.loss50, ka: M.ka });
      const b = bandOf(S.f), n = natoOf(S.f);
      const near = SCALE_THINGS.reduce((a, t) => (Math.abs(Math.log(t[1] / M.lam)) < Math.abs(Math.log(a[1] / M.lam)) ? t : a));
      const bigger = SCALE_THINGS.filter(([, s2]) => s2 > 2 * M.lam);
      waveCap.innerHTML = `One wavelength is ${si(M.lam, "m", 3)}, roughly the size of a ${near[0]}.` +
        (bigger.length ? ` A ${bigger.at(-1)[0]} is ${num(bigger.at(-1)[1] / M.lam, 3)} wavelengths across${bigger.length > 1 ? `; a ${bigger[0][0]} is ${num(bigger[0][1] / M.lam, 3)}` : ""}.` : " Everything on the list is smaller than one wavelength.");
      usesBox.innerHTML = `<b>${b.id} band</b> (${si(b.lo, "Hz")}–${si(b.hi, "Hz")}). ${b.uses}`;
      const gain = S.D > M.lam ? 0.6 * (Math.PI * S.D / M.lam) ** 2 : 1.6;
      const fd = (2 * 100) / M.lam;
      const B = Math.min(0.1 * S.f, 4e9);
      ro.set([
        ["Wavelength λ", si(M.lam, "m", 3)],
        ["IEEE band", `${b.id}`],
        ["NATO/EU band", n ? n[0] : "above M"],
        ["Beamwidth 70λ/D", S.D > M.lam ? `${num(M.bw, 3)}°` : "no beam (D < λ)", M.bw < 2 ? "ok" : M.bw > 20 ? "warn" : null],
        ["Gain 0.6(πD/λ)²", `${num(10 * Math.log10(gain), 3)} dBi`],
        ["Clear air", `${num(M.gas, 2)} dB/km`, M.gas > 1 ? "bad" : M.gas > 0.1 ? "warn" : null],
        ["Rain", S.rain ? `${num(M.rainA, 2)} dB/km` : "none"],
        ["50 km, one-way", fmtDb(M.loss50), M.loss50 > 10 ? "bad" : M.loss50 > 3 ? "warn" : "ok"],
        ["Doppler @ 100 m/s", si(fd, "Hz", 3)],
        ["Range res. (10 % BW)", km(C0 / (2 * B), 2)],
        [`${M.o[1]} ka`, `${num(M.ka, 3)}, ${regime(M.ka)}`],
      ]);
      const sigma = M.sigmaN * Math.PI * M.o[2] ** 2;
      rcsCap.innerHTML = `${M.o[3][0].toUpperCase() + M.o[3].slice(1)} at ${si(S.f, "Hz")}: σ ≈ ${si(sigma, "m²", 2, { max: 1 })} (${num(10 * Math.log10(sigma), 3)} dBsm), ${regime(M.ka)} region.` +
        (M.ka < 0.5 ? " Here σ ∝ f⁴: double the frequency and the echo is 16× (12 dB) stronger." : M.ka > 10 ? " Here σ ≈ πa², independent of frequency." : " Here creeping waves round the back interfere with the front reflection.");
      beamCap.textContent = S.D <= M.lam
        ? `A ${km(S.D, 2)} antenna is smaller than one ${si(M.lam, "m")} wavelength, so it radiates almost everywhere: no useful beam.`
        : `Half-power beam ${num(M.bw, 3)}° wide: ${km(2 * 50e3 * Math.tan(rad2(M.bw) / 2), 3)} across at 50 km. One-way loss on the way: ${fmtDb(M.loss50)}.`;
      if (!touring) ch.update(S);
      wave.redraw(); strip.redraw(); beam.redraw(); att.redraw(); rcs.redraw(); score.redraw();
    }
    const rad2 = (d) => (d * Math.PI) / 180;

    // ---- drawing: wave to scale
    function drawWave(ctx, w, hh) {
      const T = theme();
      const lam = C0 / S.f;
      const pad = 12, ground = hh - 30;
      const span = 3.2 * lam;                 // metres across the canvas
      const ppm = (w - 2 * pad) / span;       // pixels per metre (same both ways)
      ctx.fillStyle = T.surface2; ctx.fillRect(0, 0, w, ground);
      ctx.fillStyle = T.grid; ctx.fillRect(0, ground, w, hh - ground);
      // objects that fit, spread along the ground
      const fit = SCALE_THINGS.filter(([, s]) => s * ppm >= 5 && s * ppm <= ground - 26);
      const slot = (w - 2 * pad) / Math.max(1, fit.length);
      fit.forEach(([name, size, kind], i) => {
        const cx = pad + slot * (i + 0.5), px = size * ppm;
        drawThing(ctx, kind, cx, ground, px, T);
        ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText(name, cx, ground + 4);
      });
      if (!fit.length) { ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("(everything here is far bigger than one wavelength)", pad, ground + 4); }
      // the wave (amplitude is field strength, not a length)
      const mid = ground * 0.42, amp = ground * 0.22;
      ctx.strokeStyle = T.tx; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let x = pad; x <= w - pad; x += 1.5) {
        const y = mid - amp * Math.sin(TAU * ((x - pad) / (lam * ppm) - S.phase));
        x === pad ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      // one wavelength between two crests
      const x0 = pad + ((0.25 + S.phase) % 1) * lam * ppm;
      dimension(ctx, x0, mid - amp - 10, x0 + lam * ppm, mid - amp - 10, `λ = ${si(lam, "m", 3)}`, T.ink);
    }

    function drawThing(ctx, kind, cx, gy, px, T) {
      ctx.save(); ctx.fillStyle = T.ink; ctx.strokeStyle = T.ink; ctx.lineWidth = Math.max(1, px / 30);
      if (kind === "person") {
        const hd = px * 0.13;
        ctx.beginPath(); ctx.arc(cx, gy - px + hd, hd, 0, TAU); ctx.fill();
        ctx.fillRect(cx - px * 0.09, gy - px + 2 * hd, px * 0.18, px * 0.42);
        ctx.fillRect(cx - px * 0.09, gy - px * 0.46, px * 0.07, px * 0.46); ctx.fillRect(cx + px * 0.02, gy - px * 0.46, px * 0.07, px * 0.46);
      } else if (kind === "car") {
        const L = px, H = px * 0.33;
        ctx.beginPath(); ctx.roundRect?.(cx - L / 2, gy - H * 0.95, L, H * 0.55, H * 0.12); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - L * 0.3, gy - H * 0.9); ctx.lineTo(cx - L * 0.18, gy - H * 1.4); ctx.lineTo(cx + L * 0.18, gy - H * 1.4); ctx.lineTo(cx + L * 0.32, gy - H * 0.9); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - L * 0.3, gy - H * 0.22, H * 0.22, 0, TAU); ctx.arc(cx + L * 0.3, gy - H * 0.22, H * 0.22, 0, TAU); ctx.fill();
      } else if (kind === "plane") {
        const L = px, H = px * 0.1;
        ctx.beginPath(); ctx.ellipse(cx, gy - H * 1.6, L / 2, H / 2, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - L * 0.42, gy - H * 1.6); ctx.lineTo(cx - L * 0.5, gy - H * 3.2); ctx.lineTo(cx - L * 0.4, gy - H * 3.2); ctx.lineTo(cx - L * 0.3, gy - H * 1.7); ctx.fill();
        ctx.fillRect(cx - L * 0.02, gy - H * 1.2, 2, H * 1.2); ctx.fillRect(cx + L * 0.3, gy - H * 1.2, 2, H * 1.2);
      } else if (kind === "house") {
        ctx.fillRect(cx - px * 0.5, gy - px * 0.6, px, px * 0.6);
        ctx.beginPath(); ctx.moveTo(cx - px * 0.6, gy - px * 0.6); ctx.lineTo(cx, gy - px); ctx.lineTo(cx + px * 0.6, gy - px * 0.6); ctx.fill();
      } else if (kind === "bird") {
        ctx.beginPath(); ctx.ellipse(cx, gy - px * 0.35, px * 0.5, px * 0.2, -0.1, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + px * 0.45, gy - px * 0.5, px * 0.13, 0, TAU); ctx.fill();
      } else if (kind === "coin") {
        ctx.fillStyle = T.c5; ctx.beginPath(); ctx.arc(cx, gy - px / 2, px / 2, 0, TAU); ctx.fill();
      } else if (kind === "drop") {
        ctx.fillStyle = T.rx; ctx.beginPath(); ctx.arc(cx, gy - px * 0.42, px * 0.42, 0, Math.PI); ctx.lineTo(cx, gy - px * 1.05); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    // ---- drawing: band strip
    function stripMap() {
      const l = 10, r = strip.w - 10;
      const X = (f) => l + (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * (r - l);
      const inv = (x) => F_MIN * (F_MAX / F_MIN) ** ((x - l) / (r - l));
      return { l, r, X, inv };
    }
    function drawStrip(ctx, w) {
      const T = theme(), P = stripMap();
      const cur = bandOf(S.f);
      const y1 = 18, h1 = 30, y2 = 56, h2 = 18;
      ctx.font = T.font; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillStyle = T.muted;
      BANDS.forEach((b, i) => {
        const x0 = P.X(b.lo), x1 = P.X(b.hi);
        const on = b === cur;
        ctx.fillStyle = on ? T.accent : alpha(i % 2 ? T.axis : T.muted, on ? 1 : 0.22);
        ctx.fillRect(x0 + 0.5, y1, x1 - x0 - 1, h1);
        ctx.fillStyle = on ? (T.dark ? "#06130D" : "#ffffff") : T.ink;
        ctx.font = x1 - x0 < 16 ? "600 11px system-ui" : T.fontB; ctx.textAlign = "center";
        if (x1 - x0 >= 10) ctx.fillText(b.id, (x0 + x1) / 2, y1 + h1 / 2);
      });
      ctx.font = T.font;
      NATO.forEach(([id, lo, hi], i) => {
        const x0 = P.X(Math.max(lo, F_MIN)), x1 = P.X(hi);
        ctx.fillStyle = alpha(T.c4, i % 2 ? 0.28 : 0.14);
        ctx.fillRect(x0 + 0.5, y2, x1 - x0 - 1, h2);
        ctx.fillStyle = T.ink; ctx.textAlign = "center";
        if (x1 - x0 >= 9) ctx.fillText(id, (x0 + x1) / 2, y2 + h2 / 2);
      });
      // decade ticks
      ctx.fillStyle = T.muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
      const marks = w > 520 ? [1e7, 1e8, 1e9, 1e10, 1e11] : [1e7, 1e9, 1e11];
      for (const f of marks) { const x = P.X(f), t = si(f, "Hz", 1), tw = ctx.measureText(t).width / 2; ctx.fillRect(x, y2 + h2, 1, 4); ctx.fillText(t, clamp(x, tw + 2, w - tw - 2), y2 + h2 + 5); }
      const x = P.X(S.f);
      ctx.fillStyle = T.tx; ctx.fillRect(x - 1.5, y1 - 6, 3, y2 + h2 - y1 + 10);
      ctx.beginPath(); ctx.moveTo(x - 6, y1 - 10); ctx.lineTo(x + 6, y1 - 10); ctx.lineTo(x, y1 - 3); ctx.fill();
      label(ctx, si(S.f, "Hz", 3), x + 8, 8, { color: T.tx, bounds: w });
    }

    // ---- drawing: beam
    function drawBeam(ctx, w, hh) {
      const T = theme(), M = model();
      const l = 34, r = w - 12, cy = hh / 2;
      const mpp = 50e3 / (r - l);              // metres per pixel, both axes
      ctx.fillStyle = T.surface2; ctx.fillRect(0, 0, w, hh);
      if (S.rain > 0) {                        // rain streaks
        ctx.strokeStyle = alpha(T.rx, clamp(0.15 + S.rain / 150, 0.15, 0.6)); ctx.lineWidth = 1;
        const n = Math.round(30 + S.rain * 3);
        for (let i = 0; i < n; i++) {
          const x = l + ((i * 0.6180339) % 1) * (r - l), y = ((i * 0.41421) % 1) * hh;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 7); ctx.stroke();
        }
      }
      const half = M.lam >= S.D ? Math.PI / 2 : rad2(M.bw) / 2;
      // beam as slices, opacity tracking remaining one-way power
      const slices = 60;
      for (let i = 0; i < slices; i++) {
        const xa = l + ((r - l) * i) / slices, xb = l + ((r - l) * (i + 1)) / slices;
        const distKm = ((i + 0.5) / slices) * 50;
        const remain = 10 ** (-(M.gas + M.rainA) * distKm / 10);
        ctx.fillStyle = alpha(T.accent, 0.08 + 0.4 * remain);
        const ta = Math.tan(Math.min(half, 1.55));
        ctx.beginPath();
        ctx.moveTo(xa, cy - (xa - l) * ta); ctx.lineTo(xb, cy - (xb - l) * ta); ctx.lineTo(xb, cy + (xb - l) * ta); ctx.lineTo(xa, cy + (xa - l) * ta);
        ctx.closePath(); ctx.fill();
      }
      // dish (drawn bigger than scale so it is visible)
      const dpx = clamp(S.D / mpp, 10, hh * 0.5);
      ctx.strokeStyle = T.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(l - 4, cy, 7, dpx / 2, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      ctx.fillText("dish (not to scale)", 4, hh - 4);
      // footprint
      const foot = 2 * 50e3 * Math.tan(Math.min(half, 1.55));
      const fpx = foot / mpp;
      if (fpx < hh - 10) {
        dimension(ctx, r - 2, cy - fpx / 2, r - 2, cy + fpx / 2, null, T.ink);
        label(ctx, km(foot, 2), r - 8, clamp(cy - fpx / 2 - 12, 10, hh - 10), { align: "right" });
      } else label(ctx, "beam wider than the view", r - 4, 14, { align: "right" });
      ctx.fillStyle = T.muted; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
      ctx.fillText("50 km →", r - 2, hh - 4);
      label(ctx, `θ = ${M.lam >= S.D ? "≈ omni" : num(M.bw, 3) + "°"}`, l + 10, cy, { color: T.accent });
    }

    // ---- drawing: attenuation vs frequency
    function drawAtt(ctx, w, hh) {
      const T = theme();
      const P = axes(ctx, w, hh, { x: [1e9, 110e9], y: [0.001, 100], xlog: true, ylog: true, xfmt: (v) => si(v, "Hz", 1), yfmt: (v) => num(v),
        xticks: [1e9, 1e10, 1e11], ylabel: "dB/km (one-way)", pad: { l: 50, b: 32, t: 14, r: 24 } });
      P.clip();
      const opts = { xlog: true };
      plotFn(ctx, P, (f) => gasDbKm(f), 1e9, 110e9, T.rx, 2, 300, opts);
      if (S.rain > 0) {
        plotFn(ctx, P, (f) => rainDbKm(f, S.rain), 1e9, 110e9, T.c4, 2, 200, opts);
        plotFn(ctx, P, (f) => gasDbKm(f) + rainDbKm(f, S.rain), 1e9, 110e9, T.tx, 1.5, 300, { xlog: true, dash: [5, 4] });
      }
      P.unclip();
      label(ctx, "H₂O 22 GHz", P.X(22.2e9), P.Y(0.19) - 14, { align: "center", font: T.font, bounds: w });
      label(ctx, "O₂ 60 GHz", P.X(60e9), P.Y(15) - 14, { align: "right", font: T.font, bounds: w });
      if (S.f >= 1e9) {
        const x = P.X(S.f), tot = gasDbKm(S.f) + rainDbKm(S.f, S.rain);
        ctx.fillStyle = alpha(T.tx, 0.7); ctx.fillRect(x - 0.75, P.t, 1.5, P.b - P.t);
        ctx.fillStyle = T.tx; ctx.beginPath(); ctx.arc(x, P.Y(clamp(tot, 0.001, 100)), 4.5, 0, TAU); ctx.fill();
      } else label(ctx, "◀ below 1 GHz: < 0.006 dB/km", P.l + 4, P.b - 14, { color: T.tx, font: T.font });
    }

    // ---- drawing: sphere RCS
    function drawRcs(ctx, w, hh) {
      const T = theme();
      if (!rcsCurve) {
        rcsCurve = [];
        for (let i = 0; i <= 500; i++) { const x = 0.03 * (100 / 0.03) ** (i / 500); rcsCurve.push([x, pecSphere(x)]); }
      }
      const P = axes(ctx, w, hh, { x: [0.03, 100], y: [1e-5, 10], xlog: true, ylog: true, xticks: [0.1, 1, 10, 100], yticks: [1e-5, 1e-4, 1e-3, 0.01, 0.1, 1, 10],
        xfmt: (v) => num(v), yfmt: (v) => (v >= 0.01 ? num(v) : `1e${Math.round(Math.log10(v))}`), xlabel: "ka = 2πa / λ", ylabel: "σ / πa²", pad: { l: 48, b: 32, t: 14, r: 16 } });
      // regime bands
      [[0.03, 0.5, "Rayleigh", T.rx], [0.5, 10, "resonance", T.c4], [10, 100, "optical", T.c5]].forEach(([a, b, name, c]) => {
        ctx.fillStyle = alpha(c, 0.08); ctx.fillRect(P.X(a), P.t, P.X(b) - P.X(a), P.b - P.t);
        ctx.font = T.font; ctx.fillStyle = c; ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText(name, (P.X(a) + P.X(b)) / 2, P.b - 18);
      });
      P.clip();
      plotFn(ctx, P, (x) => 9 * x ** 4, 0.03, 1.2, alpha(T.muted, 0.9), 1.5, 60, { xlog: true, dash: [5, 4] });
      ctx.strokeStyle = T.ink; ctx.lineWidth = 2; ctx.beginPath();
      rcsCurve.forEach(([x, y], i) => (i ? ctx.lineTo(P.X(x), P.Y(y)) : ctx.moveTo(P.X(x), P.Y(y))));
      ctx.stroke();
      ctx.strokeStyle = alpha(T.muted, 0.7); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(P.X(1), P.Y(1)); ctx.lineTo(P.r, P.Y(1)); ctx.stroke(); ctx.setLineDash([]);
      P.unclip();
      label(ctx, "9(ka)⁴ ∝ f⁴", P.X(0.2) + 6, P.Y(9 * 0.2 ** 4) + 26, { color: T.muted, font: T.font });
      const M = model();
      const xk = clamp(M.ka, 0.03, 100), yv = M.ka > 100 ? 1 : M.sigmaN;
      if (yv >= 1e-5) {
        ctx.fillStyle = T.tx; ctx.beginPath(); ctx.arc(P.X(xk), P.Y(yv), 6, 0, TAU); ctx.fill();
        ctx.strokeStyle = T.surface; ctx.lineWidth = 2; ctx.stroke();
        const lx = xk < 1 ? P.X(xk) - 10 : P.X(xk) + (xk > 10 ? -10 : 10), ly = xk < 1 ? P.Y(yv) - 14 : P.Y(yv) + 16;
        label(ctx, `${M.o[1]}${M.ka > 100 ? " (ka > 100)" : ""}`, lx, ly, { align: xk < 1 || xk > 10 ? "right" : "left", color: T.tx, bounds: w });
      } else {
        arrow(ctx, P.X(xk), P.b - 30, P.X(xk), P.b - 4, T.tx, 2);
        label(ctx, `${M.o[1]}: σ/πa² = ${num(M.sigmaN, 2)}`, P.X(xk) + 6, P.b - 36, { color: T.tx, bounds: w, font: T.font });
      }
    }

    // ---- drawing: scores
    function drawScores(ctx, w, hh) {
      const T = theme(), M = model();
      const lf = (v, a, b) => clamp(Math.log(v / a) / Math.log(b / a), 0, 1);
      const L = (gasDbKm(S.f) + rainDbKm(S.f, S.rain)) * 100; // two-way over 50 km
      const rows = [
        ["Narrow beam from this dish", S.D > M.lam ? lf(60 / M.bw, 1, 60 / 0.01) : 0, T.accent],
        ["Doppler shift per m/s", lf(S.f, F_MIN, F_MAX), T.rx],
        ["Bandwidth → range resolution", lf(S.f, F_MIN, F_MAX), T.c4],
        ["Range through air & rain", 1 - clamp(L / 60, 0, 1), T.ok],
        ["Cheap high power", 1 - lf(S.f, F_MIN, F_MAX), T.c5],
        ["Counter-stealth (resonance)", 1 - lf(S.f, 100e6, 20e9), T.tgt],
      ];
      const narrow = w < 480;
      const lw = narrow ? 0 : Math.min(230, w * 0.38);
      const rowH = (hh - 8) / rows.length;
      ctx.font = T.font; ctx.textBaseline = "middle";
      rows.forEach(([name, v, c], i) => {
        const y = 4 + i * rowH;
        const bx = narrow ? 8 : lw + 8, bw = w - bx - 44;
        const by = narrow ? y + rowH * 0.5 : y + rowH * 0.22, bh = narrow ? rowH * 0.36 : rowH * 0.56;
        ctx.fillStyle = T.ink; ctx.textAlign = "left";
        ctx.fillText(name, 8, narrow ? y + rowH * 0.28 : y + rowH / 2);
        ctx.fillStyle = T.grid; ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = c; ctx.fillRect(bx, by, Math.max(2, bw * v), bh);
        ctx.fillStyle = T.muted; ctx.textAlign = "right"; ctx.fillText(v.toFixed(2), w - 6, by + bh / 2);
      });
    }

    changed();

    notes(root, "Background", [
      { title: "Wavelength, frequency and the spectrum", open: true, html:
        "<p>Every radar wave obeys <i>c</i> = <i>f</i> λ. Radar sits between broadcast radio and infrared: HF waves are tens of metres long, W-band waves about 3 mm. Visible light, at ~500 nm, is a few thousand times shorter again.</p>" +
        "<p class=\"eq\">λ = <span class=\"frac\"><span>3 × 10⁸ m/s</span><span><i>f</i></span></span> &nbsp;&nbsp; λ[cm] ≈ <span class=\"frac\"><span>30</span><span><i>f</i>[GHz]</span></span></p>" +
        "<p>What matters physically is almost always a size <em>in wavelengths</em>: an antenna's width sets its beam, a target's size sets how it scatters, and a surface's roughness sets whether it reflects like a mirror.</p>" },
      { title: "The radar bands and what they're used for", html:
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Band</th><th>Frequency</th><th>λ</th><th>Typical uses</th></tr>" +
        [["HF", "3–30 MHz", "100–10 m", "Over-the-horizon skywave and surface-wave radar"], ["VHF", "30–300 MHz", "10–1 m", "Very long-range early warning, counter-stealth, wind profilers"],
          ["UHF", "0.3–1 GHz", "1 m–30 cm", "Ballistic-missile warning, AEW, foliage penetration"], ["L", "1–2 GHz", "30–15 cm", "Long-range air surveillance, en-route ATC, IFF/SSR"],
          ["S", "2–4 GHz", "15–7.5 cm", "Airport surveillance, NEXRAD weather, naval air defence"], ["C", "4–8 GHz", "7.5–3.75 cm", "Weather (Europe, TDWR), altimeters, SAR, tracking"],
          ["X", "8–12 GHz", "3.75–2.5 cm", "Fire control, fighter radar, marine radar, SAR, police guns"], ["Ku", "12–18 GHz", "2.5–1.67 cm", "Surface-movement radar, altimetry, high-res mapping"],
          ["K", "18–27 GHz", "1.67–1.11 cm", "Police guns, legacy 24 GHz car radar (water-vapour line at 22 GHz)"], ["Ka", "27–40 GHz", "11–7.5 mm", "Cloud radar, seekers, helicopter fire control, scanners"],
          ["V", "40–75 GHz", "7.5–4 mm", "60 GHz short-range sensing (oxygen absorbs ~15 dB/km)"], ["W", "75–110 GHz", "4–2.7 mm", "Automotive 76–81 GHz, 94 GHz cloud radar, imaging"]]
          .map((r) => `<tr><td><b>${r[0]}</b></td><td class="num">${r[1]}</td><td class="num">${r[2]}</td><td>${r[3]}</td></tr>`).join("") +
        "</table></div><p class=\"small muted\">Band edges from IEEE Std 521. Within each band, radars may only use the slices the ITU allocates to radiolocation and radionavigation.</p>" },
      { title: "Why the letters? A little history", html:
        "<p>The letters began as WWII code names, chosen so that a frequency could be mentioned without revealing it. The usual story: <b>L</b> for &ldquo;long&rdquo; wave, <b>S</b> for &ldquo;short&rdquo;, <b>C</b> for a &ldquo;compromise&rdquo; between S and X, <b>X</b> for the cross-hairs of fire control, and <b>K</b> from the German <i>kurz</i>, short. K band was then found to sit on the 22 GHz water-vapour absorption line, so the useful parts either side became <b>Ku</b> (&ldquo;K-under&rdquo;) and <b>Ka</b> (&ldquo;K-above&rdquo;).</p>" +
        "<p>IEEE standardised the radar letters in 1976 (Std 521). Electronic-warfare people use a different NATO/EU scheme, <b>A</b> to <b>M</b>, shown as the second row of the band strip. The two clash: NATO C band is 0.5–1 GHz, NATO K band is 20–40 GHz, and NATO L band is 40–60 GHz, so always check which system someone means.</p>" },
      { title: "The trade-offs, side by side", html:
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Property</th><th>Lower frequency</th><th>Higher frequency</th></tr>" +
        "<tr><td>Beamwidth for a given antenna, θ ≈ 70λ/<i>D</i></td><td>wide; needs a huge antenna</td><td>narrow; compact antennas</td></tr>" +
        "<tr><td>Gain <i>G</i> ≈ η(π<i>D</i>/λ)²</td><td>low</td><td>high</td></tr>" +
        "<tr><td>Atmospheric and rain loss</td><td>negligible below ~3 GHz</td><td>large; peaks at 22 and 60 GHz; rain grows fast</td></tr>" +
        "<tr><td>Doppler shift <i>f</i><sub>d</sub> = 2<i>v</i>/λ</td><td>small; slow targets hard to separate</td><td>large; fine velocity measurement</td></tr>" +
        "<tr><td>Available bandwidth (range resolution <i>c</i>/2<i>B</i>)</td><td>MHz: tens of metres</td><td>GHz: centimetres</td></tr>" +
        "<tr><td>Transmitter power</td><td>megawatts are practical</td><td>harder: average power from tubes and transistors falls roughly as 1/<i>f</i>², and waveguide losses rise</td></tr>" +
        "<tr><td>Small targets (raindrops, insects)</td><td>almost invisible</td><td>bright (Rayleigh <i>f</i>⁴)</td></tr>" +
        "<tr><td>Stealth shaping</td><td>less effective (resonance)</td><td>very effective (optical)</td></tr></table></div>" +
        "<p>That's why long-range search radars sit at UHF–S band, trackers and fire control at X band, and short-range high-resolution sensors at Ka and W band. Many systems pair two: a lower band to search, a higher band to track.</p>" },
      { title: "Rayleigh, Mie and optical scattering", html:
        "<p>For a perfectly conducting sphere of radius <i>a</i>, the exact backscatter comes from Mie's series of spherical-wave terms (plotted above, computed with Riccati–Bessel functions). Its limits are simple:</p>" +
        "<p class=\"eq\">Rayleigh (<i>ka</i> ≪ 1): σ = 9π<i>a</i>²(<i>ka</i>)⁴ ∝ <span class=\"frac\"><span><i>a</i>⁶</span><span>λ⁴</span></span> &nbsp;&nbsp;&nbsp; optical (<i>ka</i> ≫ 1): σ → π<i>a</i>²</p>" +
        "<p>In between, the <b>resonance</b> (Mie) region, a wave creeping round the back of the sphere interferes with the specular flash from the front, so σ oscillates and peaks at about 3.65 π<i>a</i>² near <i>ka</i> = 1. The boundaries used here (ka = 0.5 and 10) are conventions, not sharp edges.</p>" +
        "<p><b>Weather radar</b> depends on the Rayleigh law. Raindrops are water, not metal, so their backscatter is σ = π⁵|<i>K</i>|²<i>D</i>⁶/λ⁴ with |<i>K</i>|² ≈ 0.93 (about 0.4× the metal-sphere value), and a radar adds up <i>Z</i> = Σ<i>D</i>⁶ over a volume. Going from S band (3 GHz) to X band (10 GHz) makes each drop (10/3)⁴ ≈ 120× (21 dB) brighter, but X band also suffers far more rain attenuation; S band is chosen when the radar must see through a storm to the next one.</p>" +
        "<p><b>Stealth</b> works best in the optical region, where shaping steers the specular flash away and absorbers can be many wavelengths thick. At VHF the wavelength is comparable to a tail fin, so features resonate and coatings are thin compared with λ. That's why VHF and UHF radars are promoted as counter-stealth, although their wide beams make them poor at precise tracking.</p>" },
      { title: "Attenuation models used here", html:
        "<p>Rain: the ITU-R P.838-3 power law γ<sub>R</sub> = <i>k R</i><sup>α</sup> dB/km, with tabulated <i>k</i> and α (horizontal polarisation) interpolated in log-frequency. A few values for 25 mm/h: 3 GHz 0.007, 10 GHz 0.70, 35 GHz 6.2, 94 GHz 12 dB/km. Clear air: sea-level values read off the ITU-R P.676 curves (15 °C, 7.5 g/m³ water vapour), smoothed, so treat them as ±20 %. Real paths are less uniform: rain cells are a few km across, and attenuation falls with altitude.</p>" },
      { title: "Who decides who gets which frequency?", html:
        "<p>Spectrum is shared by treaty. The ITU's World Radiocommunication Conferences allocate bands to services such as radiolocation (radar), radionavigation, mobile and satellite; national regulators (FCC, Ofcom, ACMA…) license them. Radar bands are increasingly squeezed: 5 GHz Wi-Fi must use <b>dynamic frequency selection</b>, listening for weather and military radars and moving off their channels; 3.5 GHz radar spectrum in the US is shared with 5G (CBRS); and 76–81 GHz was set aside worldwide so that every car can carry the same radar.</p>" },
    ]);

    api.quiz(root, [
      { q: "A 2 m dish operates at 5 GHz. Roughly how wide is its beam?", options: ["0.2°", "2.1°", "21°", "7°"], answer: 1, why: "λ = 3×10⁸ / 5×10⁹ = 6 cm, so θ ≈ 70 × 0.06 / 2 ≈ 2.1°." },
      { q: "Why do most weather radars use S, C or X band rather than HF?", options: ["HF can't be pulsed", "Raindrops are far smaller than λ, so their echo rises as f⁴; at HF they are essentially invisible", "Rain absorbs HF strongly", "HF waves travel more slowly in clouds"], answer: 1, why: "In the Rayleigh region σ ∝ D⁶/λ⁴. Going from 10 MHz to 3 GHz multiplies a drop's echo by 300⁴ ≈ 8×10⁹ (99 dB)." },
      { q: "A car radar at 77 GHz and an airport radar at 2.8 GHz both watch a target moving at 30 m/s. Which sees the larger Doppler shift, and by how much?", options: ["Airport radar, 27×", "They're equal", "Car radar, about 27×", "Car radar, about 750×"], answer: 2, why: "f_d = 2v/λ = 2vf/c, proportional to frequency: 77/2.8 ≈ 27.5. The car radar sees 15.4 kHz; the airport radar 560 Hz." },
      { q: "Why does 60 GHz suit short-range gesture sensors in phones?", options: ["It's the cheapest band to build", "Oxygen absorbs ~15 dB/km there, so signals die out quickly and nearby devices don't interfere", "It penetrates walls best", "It has the longest wavelength"], answer: 1, why: "The oxygen absorption line makes 60 GHz useless for long range but good for dense short-range reuse, and the 7 GHz of unlicensed spectrum around it gives millimetre resolution." },
    ]);

    return () => {};
  },
};
