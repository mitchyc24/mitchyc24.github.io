// Lesson 12: scan patterns. How a beam a degree or two wide covers the sky: circular, sector, raster, helical,
// spiral, Palmer and nodding scans, hits per scan, conical-scan tracking and ESA dwell scheduling.
import {
  h, card, labGrid, group, notes, slider, choice, check, select, button, readout, status, legend,
  canvasView, drag, animate, playButton, axes, theme, alpha, label, num, clamp, rad, deg, TAU, rng, reducedMotion,
} from "../ui.js";

const PPI_R = 200;                 // km shown on the PPI
const FAN_TOP = 30;                // elevation covered by a fan beam, degrees
const EL0 = 2;                     // lowest bar elevation, degrees
const LN2x4 = 4 * Math.LN2;
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const tri = (x) => { const f = ((x % 2) + 2) % 2; return f < 1 ? f : 2 - f; };   // 0→1→0 triangle, period 2

const PATTERNS = [
  ["circular", "Circular (360°)"], ["sector", "Sector (back and forth)"], ["raster", "Raster (bars)"], ["helical", "Helical"],
  ["spiral", "Spiral"], ["palmer", "Palmer (conical + sector)"], ["nodding", "Nodding (height finder)"], ["esa", "ESA random access"],
];
const USES = {
  circular: "Uses scan rate, beamwidth and PRF. The fan beam covers 0–30° of elevation at once, like a 2-D surveillance radar.",
  sector: "Uses sector width, scan rate, beamwidth and PRF. The fan beam option applies here too.",
  raster: "Uses sector width, bars (rows) and bar spacing. Each bar is one sweep across the sector.",
  helical: "Uses bars (turns) and bar spacing: the beam rises one bar spacing per revolution.",
  spiral: "Uses bars (turns) and bar spacing: an Archimedean spiral out from the centre, used for acquisition.",
  palmer: "A small circular (conical) scan of radius one beamwidth, carried slowly across the sector.",
  nodding: "The beam stays on one bearing and nods up and down through bars × spacing of elevation.",
  esa: "Uses sector, bars, bar spacing, pulses per dwell and the tracks below: the beam jumps between positions with no motion in between.",
};

// Scene: az (deg), el (deg), range (km)
const TARGETS = [
  { name: "A", az: -128, el: 3, r: 150 }, { name: "B", az: -42, el: 11, r: 62 }, { name: "C", az: 12, el: 6, r: 118 },
  { name: "D", az: 38, el: 22, r: 36 }, { name: "E", az: 84, el: 2.5, r: 178 }, { name: "F", az: 150, el: 41, r: 22 },
];

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "A radar beam is only a degree or two across, but the sky it has to search is hundreds of degrees wide. " +
      "Scan patterns are the choreography that sweeps that pencil over the volume: fast enough to revisit every target often, " +
      "slow enough to put several pulses on each one. Tracking radars then nod their beam around a single target to measure exactly where it is." }));

    const S = {
      pattern: "circular", rate: 72, beam: 1, prf: 300, sector: 120, rows: 6, spacing: 3, fan: true, speed: 1,
      npd: 8, tracks: 4, trackRate: 2,
      // conical scan
      sq: 0.4, track: false, tgt: [0.3, 0.15], bore: [0, 0], lockedFor: 0,
      sawRevisit: 0,
    };
    let t = 0;                          // scan clock (s)
    let beam = { az: 0, el: EL0, fan: true };
    const tgtState = TARGETS.map(() => ({ acc: 0, last: null, lit: -9 }));
    const R = rng(11);
    const spare = Array.from({ length: 60 }, () => [R() - 0.5, R()]);
    let trackPos = [];
    // tracks: the scene targets inside the array's field of view first, then other (imaginary) aircraft in the sector
    function makeTracks() {
      const inside = TARGETS.filter((tg) => Math.abs(tg.az) <= S.sector / 2 && tg.el <= 45).map((tg) => ({ az: tg.az, el: tg.el }));
      trackPos = [...inside, ...spare.map(([a, e]) => ({ az: a * S.sector, el: EL0 + 1 + e * 30 }))].slice(0, 60);
    }
    let esa = { end: 0, idx: 0, due: [], cur: null };

    const tour = api.steps(root, [
      { title: "1 · Round and round", html: "<p>Most surveillance radars just spin: a <b>circular scan</b>, 360° every few seconds. Their beam is narrow in azimuth but a tall <b>fan</b> in elevation, so one revolution covers every height at once. An airport radar turns at 12–15 rpm; long-range radars at 5–6 rpm.</p>",
        look: "the beam footprint sweeping the azimuth × elevation map, and the PPI below painting each target as the beam passes.",
        apply: () => set({ pattern: "circular", rate: 72, beam: 1, prf: 300, fan: true }) },
      { title: "2 · Hits per scan", html: "<p>While the beam slides across a target, the radar fires pulses at it. The number of <b>hits per scan</b> is the time on target times the PRF:</p><p class=\"eq\"><i>n</i> = <span class=\"frac\"><span>θ<sub>3</sub> · PRF</span><span>ω̇</span></span></p><p>With a 1° beam, 300 Hz and 72°/s that's only about 4 pulses. Halve the rotation speed and you double the hits, but each target is seen half as often.</p>",
        look: "the hit counts next to the targets and the readout. Try 6 rpm.",
        apply: () => set({ pattern: "circular", rate: 36 }) },
      { title: "3 · Sector and raster", html: "<p>A radar that only needs to watch one direction sweeps a <b>sector</b> back and forth. A pencil beam that must also cover elevation does a <b>raster</b>: one sweep (a <b>bar</b>) per row, stepping up between bars. Fighter radars typically fly 1-, 2- or 4-bar scans across ±60°.</p>",
        look: "the bars stacking up in the scan map. If the bar spacing is wider than the beam, targets can slip through the gaps.",
        apply: () => set({ pattern: "raster", sector: 120, rows: 4, spacing: 3, beam: 3, rate: 120, fan: false }) },
      { title: "4 · Helical, spiral, Palmer", html: "<p>A <b>helical</b> scan climbs a bar per revolution, covering a full hemisphere with a pencil beam (old naval and weather radars). A <b>spiral</b> grows outward from a cued direction to acquire a target. <b>Palmer</b> scanning rides a small circle on top of a slow sweep, a fat swath for searching around a cue.</p>",
        look: "the trail. Switch the pattern menu between these three.",
        apply: () => set({ pattern: "helical", rows: 6, spacing: 3, beam: 3, rate: 120, fan: false }) },
      { title: "5 · Conical scan: tracking", html: "<p>To track one target precisely, the beam is <b>squinted</b> slightly off the antenna axis and spun around it. A target exactly on the axis sees a steady echo. Off-axis, the echo rises when the beam swings toward it and falls when it swings away: the <b>depth</b> of that wobble gives the error size, its <b>phase</b> gives the direction.</p>",
        look: "the conical-scan panel. Drag the target off-axis, then tick <b>Close the tracking loop</b>.",
        apply: () => { S.tgt = [0.35, -0.2]; S.bore = [0, 0]; setC({ track: false, sq: 0.4 }); } },
      { title: "6 · Electronic agility", html: "<p>A phased array has no inertia: it can put the beam anywhere in a few microseconds. So an <b>ESA</b> doesn't scan in a pattern at all; a scheduler hands out dwells: a run of search positions, then a quick look at each target being tracked, then more search. Every track update steals time from search.</p>",
        look: "the scheduler timeline and the revisit-time curve. Add tracks and watch the search frame time grow.",
        apply: () => set({ pattern: "esa", beam: 3, spacing: 3, rows: 4, sector: 120, npd: 10, prf: 1000, tracks: 10, trackRate: 2, fan: false }) },
    ]);

    const lab = labGrid(root);

    // ---- scan space
    const spaceCard = card(lab.main, "Scan space", "azimuth × elevation, with the beam's recent trail");
    const space = api.track(canvasView(spaceCard, { aspect: 2.3, minHeight: 230, maxHeight: 360, draw: drawSpace, label: "Map of azimuth and elevation showing the beam footprint moving in the selected scan pattern" }));
    const usesCap = h("p", { class: "caption" });
    spaceCard.append(usesCap);

    const cols = h("div", { class: "cols2" });
    lab.main.append(cols);
    const ppiCard = card(cols, "PPI", "plan view, 200 km");
    const ppi = api.track(canvasView(ppiCard, { aspect: 1, minHeight: 240, maxHeight: 420, draw: drawPPI, label: "Plan position indicator showing the sweep and target blips" }));
    const ppiCap = h("p", { class: "caption" });
    ppiCard.append(ppiCap);

    const conCard = card(cols, "Conical scan", "drag the target (slowed: real scans spin at 10–100 Hz)");
    const con = api.track(canvasView(conCard, { aspect: 0.9, minHeight: 300, maxHeight: 440, free: true, draw: drawConical, label: "Conical scan: beam circling the boresight, and the received amplitude against time" }));
    const conCtl = h("div");
    conCard.append(conCtl);
    const trackChk = check(conCtl, { label: "Close the tracking loop", checked: false, onChange: (v) => setC({ track: v }) });
    const sqSl = slider(conCtl, { label: "Squint (beam offset from the axis)", min: 0.1, max: 0.7, step: 0.05, value: S.sq, format: (v) => `${v.toFixed(2)} θ₃`, onInput: (v) => setC({ sq: v }) });
    const kickRow = h("div", { class: "btn-row" });
    conCtl.append(kickRow);
    button(kickRow, "Move the target", () => { const a = R() * TAU, r = 0.3 + R() * 0.5; S.tgt = [S.bore[0] + r * Math.cos(a), S.bore[1] + r * Math.sin(a)]; S.lockedFor = 0; }, "ghost small");
    const conRo = readout(conCard);

    const esaCard = card(lab.main, "ESA scheduler", "half a second of beam time, and what tracks cost the search");
    const esaV = api.track(canvasView(esaCard, { aspect: 2.6, minHeight: 250, maxHeight: 340, draw: drawESA, label: "Timeline of search and track dwells, and revisit time against number of tracks" }));
    legend(esaCard, [[theme().accent, "search dwell"], [theme().tgt, "track dwell"], [theme().c4, "search revisit time"]]);

    // ---- controls
    const ctl = card(lab.side, "Controls");
    const g1 = group(ctl, "Pattern");
    const patSel = select(g1, { label: "Scan pattern", value: S.pattern, options: PATTERNS, onChange: (v) => set({ pattern: v }) });
    const speedCh = choice(g1, { label: "Playback", value: 1, options: [[1, "Real time"], [0.25, "¼ speed"]], onChange: (v) => { S.speed = v; } });
    const g2 = group(ctl, "Beam &amp; radar");
    const rateSl = slider(g2, { label: "Scan rate ω̇", min: 3, max: 720, step: 1, log: true, value: S.rate, format: (v) => `${num(v, 3)}°/s · ${num(v / 6, 3)} rpm`, onInput: (v) => set({ rate: v }) });
    const bwSl = slider(g2, { label: "Beamwidth θ<sub>3</sub>", min: 0.5, max: 10, step: 0.1, value: S.beam, format: (v) => `${num(v, 2)}°`, onInput: (v) => set({ beam: v }) });
    const prfSl = slider(g2, { label: "PRF", min: 100, max: 5000, step: 10, log: true, value: S.prf, format: (v) => `${num(v, 3)} Hz`, onInput: (v) => set({ prf: v }) });
    const fanChk = check(g2, { label: `Fan beam in elevation (0–${FAN_TOP}°) for circular and sector scans`, checked: S.fan, onChange: (v) => set({ fan: v }) });
    const g3 = group(ctl, "Coverage");
    const secSl = slider(g3, { label: "Sector width", min: 20, max: 180, step: 5, value: S.sector, format: (v) => `${v}°`, onInput: (v) => set({ sector: v }) });
    const rowSl = slider(g3, { label: "Bars (rows / turns)", min: 1, max: 12, step: 1, value: S.rows, onInput: (v) => set({ rows: v }) });
    const spSl = slider(g3, { label: "Bar spacing", min: 0.5, max: 10, step: 0.5, value: S.spacing, format: (v) => `${num(v, 2)}°`, onInput: (v) => set({ spacing: v }) });
    const g4 = group(ctl, "ESA scheduling");
    const npdSl = slider(g4, { label: "Pulses per dwell", min: 1, max: 32, step: 1, value: S.npd, onInput: (v) => set({ npd: v }) });
    const trSl = slider(g4, { label: "Targets in track", min: 0, max: 60, step: 1, value: S.tracks, onInput: (v) => set({ tracks: v }) });
    const trRateSl = slider(g4, { label: "Track update rate", min: 0.5, max: 10, step: 0.5, value: S.trackRate, format: (v) => `${num(v, 2)} Hz`, onInput: (v) => set({ trackRate: v }) });

    const outCard = card(lab.side, "Scan numbers");
    const st = status(outCard);
    const ro = readout(outCard);

    const ch = api.challenges(root, [
      { id: "hits6", text: "Get at least 10 hits per scan from a circular scan turning at 6 rpm.", check: () => S.pattern === "circular" && Math.abs(S.rate / 6 - 6) <= 0.1 && hitsPerLook() >= 10 },
      { id: "raster", text: "Raster-scan a 120° × 30° volume with no gaps between bars in under 4 seconds.", check: () => S.pattern === "raster" && S.sector >= 120 && elCover() >= 30 && S.spacing <= S.beam && frameTime() < 4 },
      { id: "helical", text: "Cover the whole horizon from 2° up to 22° or more with a gap-free helical scan.", check: () => S.pattern === "helical" && S.spacing <= S.beam && elCover() >= 20 },
      { id: "lock", text: "Lock the conical scan onto the target: hold the error under 0.1 beamwidths for 2 seconds.", check: () => S.lockedFor >= 2 },
      { id: "revisit", text: "Load the ESA with at least 20 tracks and see the search revisit time at least double.", check: () => S.tracks >= 20 && revisit(S.tracks) >= 2 * revisit(0) },
    ]);

    // ---- model
    function set(p) {
      Object.assign(S, p);
      patSel.value = S.pattern; rateSl.value = S.rate; bwSl.value = S.beam; prfSl.value = S.prf; fanChk.checked = S.fan;
      secSl.value = S.sector; rowSl.value = S.rows; spSl.value = S.spacing; npdSl.value = S.npd; trSl.value = S.tracks; trRateSl.value = S.trackRate;
      if ("pattern" in p || "sector" in p || "rows" in p || "spacing" in p) resetScan();
      changed();
    }
    function setC(p) { Object.assign(S, p); trackChk.checked = S.track; sqSl.value = S.sq; S.lockedFor = 0; changed(); }

    const fanOn = () => S.fan && (S.pattern === "circular" || S.pattern === "sector");
    const elCover = () => (S.rows - 1) * S.spacing + S.beam;
    const dwell = () => S.npd / S.prf;
    const positions = () => Math.ceil(S.sector / S.beam) * S.rows;
    const trackLoad = (n) => n * S.trackRate * dwell();
    const revisit = (n) => { const l = trackLoad(n); return l >= 1 ? Infinity : (positions() * dwell()) / (1 - l); };
    function hitsPerLook() { return S.pattern === "esa" ? S.npd : (S.beam * S.prf) / S.rate; }
    function frameTime() {
      const w = S.rate;
      switch (S.pattern) {
        case "circular": return 360 / w;
        case "sector": return S.sector / w;
        case "raster": return (S.rows * S.sector) / w;
        case "helical": return (S.rows * 360) / w;
        case "spiral": { const b = S.spacing / TAU, ph = TAU * S.rows; return (b * ph * ph) / 2 / w; }
        case "palmer": return (S.sector * TAU) / w;
        case "nodding": return elCover() / w;
        default: return revisit(S.tracks);
      }
    }
    function beamAt(tt) {
      const w = S.rate, half = S.sector / 2;
      switch (S.pattern) {
        case "circular": return { az: wrap180(w * tt), el: EL0 };
        case "sector": return { az: -half + S.sector * tri((w * tt) / S.sector), el: EL0 };
        case "raster": {
          const Ts = S.sector / w, k = Math.floor(tt / Ts) % S.rows, f = (tt / Ts) % 1;
          return { az: k % 2 ? half - S.sector * f : -half + S.sector * f, el: EL0 + S.beam / 2 + k * S.spacing };
        }
        case "helical": {
          const turns = (w * tt) / 360 % S.rows;
          return { az: wrap180(turns * 360), el: EL0 + S.beam / 2 + turns * S.spacing };
        }
        case "spiral": {
          const b = S.spacing / TAU, phMax = TAU * S.rows, sTot = (b * phMax * phMax) / 2;
          const s = (w * tt) % sTot, ph = Math.sqrt((2 * s) / b), r = b * ph;
          const elc = 25;
          return { az: (r * Math.cos(ph)) / Math.cos(rad(elc)), el: elc + r * Math.sin(ph) };
        }
        case "palmer": {
          const rc = S.beam, cv = w / TAU;
          const caz = -half + S.sector * tri((cv * tt) / S.sector);
          const a = (w * tt) / rc;
          const el = EL0 + rc + S.beam / 2;
          return { az: caz + (rc * Math.cos(a)) / Math.cos(rad(el)), el: el + rc * Math.sin(a) };
        }
        case "nodding": return { az: 12, el: EL0 + S.beam / 2 + (elCover() - S.beam) * tri((w * tt) / Math.max(0.5, elCover() - S.beam)) };
        default: return beam;
      }
    }
    function inBeam(tg, b) {
      const dAz = wrap180(tg.az - b.az) * Math.cos(rad(tg.el));
      if (b.fan) return Math.abs(dAz) <= S.beam / 2 && tg.el <= FAN_TOP;
      return Math.hypot(dAz, tg.el - b.el) <= S.beam / 2;
    }
    function resetScan() {
      t = 0;
      makeTracks();
      esa = { end: 0, idx: 0, due: Array.from({ length: 60 }, (_, i) => (i / 60) / Math.max(0.1, S.trackRate)), cur: null };
      tgtState.forEach((s) => { s.acc = 0; s.last = null; });
      clearTrails();
    }
    function esaNext() {
      const nAz = Math.ceil(S.sector / S.beam);
      for (let i = 0; i < S.tracks; i++) {
        if (esa.due[i] <= esa.end) { esa.due[i] += 1 / S.trackRate; const p = trackPos[i]; return { az: p.az, el: p.el, track: i }; }
      }
      const k = esa.idx++ % positions();
      const row = Math.floor(k / nAz), col = k % nAz;
      return { az: -S.sector / 2 + S.beam / 2 + col * S.beam, el: EL0 + S.beam / 2 + row * S.spacing, track: -1 };
    }

    // light up targets: pulses accumulate while in the beam; when the beam leaves, the look is latched
    function look(b, pulses, now, paint) {
      TARGETS.forEach((tg, i) => {
        const s = tgtState[i];
        if (inBeam(tg, b)) { s.acc += pulses; s.lit = now; if (paint) paintBlip(tg, b); }
        else if (s.acc > 0) { s.last = s.acc; s.acc = 0; }
      });
    }

    function advance(dt) {
      const ts = dt * S.speed;
      if (S.pattern === "esa") {
        let n = 0;
        const tEnd = t + ts;
        while (esa.end <= tEnd && n++ < 400) {
          const d = esaNext();
          beam = { az: d.az, el: d.el, fan: false, track: d.track };
          esa.end += dwell();
          stamp(beam, d.track >= 0 ? 0.6 : 0.35, d.track >= 0);
          look(beam, S.npd, esa.end, true);
        }
        t = tEnd;
      } else {
        const stepDeg = S.beam / 4;
        const n = clamp(Math.ceil((S.rate * ts) / stepDeg), 1, 400);
        for (let k = 1; k <= n; k++) {
          const tt = t + (ts * k) / n;
          beam = { ...beamAt(tt), fan: fanOn() };
          stamp(beam, 0.22);
          look(beam, (S.prf * ts) / n, tt, true);
        }
        t += ts;
      }
      // conical scan
      conStep(dt);
    }

    function changed() {
      const n = hitsPerLook(), ft = frameTime();
      const gaps = ["raster", "helical", "spiral", "esa", "nodding"].includes(S.pattern) && S.spacing > S.beam;
      usesCap.innerHTML = `<b>${PATTERNS.find((p) => p[0] === S.pattern)[1]}.</b> ${USES[S.pattern]}`;
      if (S.pattern === "esa" && trackLoad(S.tracks) >= 1) st.set("bad", "Search has stopped", `<br>${S.tracks} tracks × ${num(S.trackRate, 2)} Hz × ${num(dwell() * 1e3, 3)} ms = ${num(trackLoad(S.tracks) * 100, 3)} % of the radar's time. Nothing is left for search.`);
      else if (gaps) st.set("warn", "Gaps between bars", `<br>Bar spacing ${num(S.spacing, 2)}° is wider than the ${num(S.beam, 2)}° beam, so targets between bars can be missed.`);
      else if (n < 3) st.set("warn", `Only ${num(n, 2)} hits per look`, "<br>Too few pulses to integrate (or to run an MTI filter). Slow the scan, widen the beam or raise the PRF.");
      else st.set("ok", `${num(n, 3)} hits per look, frame ${num(ft, 3)} s`, `<br>${S.pattern === "esa" ? "Each dwell" : "Each target"} gets ${num(n, 3)} pulses; the whole volume is revisited every ${num(ft, 3)} s.`);
      const rows = [
        ["Pattern frame time", isFinite(ft) ? `${num(ft, 3)} s` : "never (starved)"],
        ["Hits per look <i>n</i>", num(n, 3), n >= 10 ? "ok" : n < 3 ? "warn" : null],
        ["Time on target", `${num((S.pattern === "esa" ? dwell() : S.beam / S.rate) * 1e3, 3)} ms`],
        ["Rotation", `${num(S.rate / 6, 3)} rpm (${num(S.rate, 3)}°/s)`],
        ["Elevation covered", fanOn() ? `0–${FAN_TOP}° (fan)` : ["circular", "sector"].includes(S.pattern) ? `${num(S.beam, 2)}° (pencil)` : `${num(elCover(), 3)}°`],
      ];
      if (S.pattern === "esa") {
        rows.push(["Search beam positions", `${positions()}`], ["Dwell", `${num(dwell() * 1e3, 3)} ms`], ["Time spent tracking", `${num(Math.min(1, trackLoad(S.tracks)) * 100, 3)} %`, trackLoad(S.tracks) > 0.5 ? "warn" : null], ["Search revisit", isFinite(revisit(S.tracks)) ? `${num(revisit(S.tracks), 3)} s` : "∞", null]);
      }
      ro.set(rows);
      ppiCap.textContent = `Blips are smeared across about one beamwidth (${num(S.beam, 2)}°) of azimuth: the target is painted on every pulse while the beam is on it.`;
      ch.update(S);
      space.redraw(); ppi.redraw(); con.redraw(); esaV.redraw();
    }

    // ---- trails (offscreen canvases, faded with destination-out so they work in both themes)
    const trailS = document.createElement("canvas"), trailP = document.createElement("canvas");
    function fitTrail(cv, view) { const W = Math.round(view.w * view.dpr), H = Math.round(view.h * view.dpr); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; } return cv.getContext("2d"); }
    function clearTrails() { for (const c of [trailS, trailP]) c.getContext("2d").clearRect(0, 0, c.width, c.height); }
    function fade(cv, a) { const c = cv.getContext("2d"); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "destination-out"; c.fillStyle = `rgba(0,0,0,${a})`; c.fillRect(0, 0, cv.width, cv.height); c.restore(); }

    function spaceMap(w, hh) {
      const azHalf = S.pattern === "circular" || S.pattern === "helical" ? 180 : clamp(S.sector / 2 + 12, 40, 180);
      const elMax = 60;
      const l = 40, r = w - 18, tp = 10, b = hh - 24;
      return { l, r, t: tp, b, azHalf, elMax, X: (az) => l + ((az + azHalf) / (2 * azHalf)) * (r - l), Y: (el) => b - (el / elMax) * (b - tp), sx: (r - l) / (2 * azHalf), sy: (b - tp) / elMax };
    }
    function footprint(ctx, m, b) {
      if (b.fan) { ctx.rect(m.X(b.az - S.beam / 2), m.Y(FAN_TOP), Math.max(1.5, S.beam * m.sx), m.Y(0) - m.Y(FAN_TOP)); return; }
      const ra = Math.max(1.2, ((S.beam / 2) * m.sx) / Math.cos(rad(clamp(b.el, 0, 80)))), re = Math.max(1.2, (S.beam / 2) * m.sy);
      ctx.ellipse(m.X(b.az), m.Y(b.el), ra, re, 0, 0, TAU);
    }
    function stamp(b, a, track) {
      if (!space.w) return;
      const c = fitTrail(trailS, space), m = spaceMap(space.w, space.h), T = theme();
      c.setTransform(space.dpr, 0, 0, space.dpr, 0, 0);
      c.fillStyle = alpha(track ? T.tgt : T.scopeFg, a);
      c.beginPath(); footprint(c, m, b); c.fill();
    }
    function ppiGeom() { const w = ppi.w, hh = ppi.h, Rp = Math.min(w, hh) / 2 - 8; return { cx: w / 2, cy: hh / 2, Rp }; }
    function paintBlip(tg, b) {
      if (!ppi.w) return;
      const c = fitTrail(trailP, ppi), g = ppiGeom(), T = theme();
      c.setTransform(ppi.dpr, 0, 0, ppi.dpr, 0, 0);
      const rr = (tg.r / PPI_R) * g.Rp, a = rad(b.az);
      c.fillStyle = alpha(T.scopeFg, 0.75);
      c.beginPath(); c.arc(g.cx + rr * Math.sin(a), g.cy - rr * Math.cos(a), 3, 0, TAU); c.fill();
    }

    function drawSpace(ctx, w, hh) {
      const T = theme(), m = spaceMap(w, hh);
      ctx.fillStyle = T.scopeBg; ctx.fillRect(0, 0, w, hh);
      ctx.strokeStyle = T.scopeGrid; ctx.lineWidth = 1; ctx.font = T.font; ctx.fillStyle = T.scopeText;
      const azStep = m.azHalf > 120 ? 60 : m.azHalf > 60 ? 30 : 15;
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (let a = -Math.floor(m.azHalf / azStep) * azStep; a <= m.azHalf; a += azStep) {
        const x = Math.round(m.X(a)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.b); ctx.stroke(); ctx.fillText(`${a}°`, x, m.b + 4);
      }
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      for (let e = 0; e <= m.elMax; e += 15) { const y = Math.round(m.Y(e)) + 0.5; ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.r, y); ctx.stroke(); ctx.fillText(`${e}°`, m.l - 5, y); }
      // coverage box
      if (!["circular", "helical"].includes(S.pattern)) {
        ctx.strokeStyle = alpha(T.scopeText, 0.5); ctx.setLineDash([4, 4]);
        const top = S.pattern === "sector" ? (fanOn() ? FAN_TOP : EL0 + S.beam) : EL0 + elCover();
        if (!["spiral", "nodding"].includes(S.pattern)) ctx.strokeRect(m.X(-S.sector / 2), m.Y(top), S.sector * m.sx, m.Y(EL0) - m.Y(top));
        ctx.setLineDash([]);
      }
      fitTrail(trailS, space);
      ctx.drawImage(trailS, 0, 0, w, hh);
      // current beam
      ctx.save(); ctx.strokeStyle = T.scopeFg; ctx.lineWidth = 2; ctx.fillStyle = alpha(T.scopeFg, 0.35);
      ctx.beginPath(); footprint(ctx, m, beam); ctx.fill(); ctx.stroke(); ctx.restore();
      // ESA track positions
      if (S.pattern === "esa") {
        ctx.strokeStyle = T.tgt; ctx.lineWidth = 1.5;
        for (let i = 0; i < S.tracks; i++) { const p = trackPos[i]; ctx.strokeRect(m.X(p.az) - 4, m.Y(p.el) - 4, 8, 8); }
      }
      // targets
      TARGETS.forEach((tg, i) => {
        const s = tgtState[i], x = m.X(tg.az), y = m.Y(tg.el);
        if (x < m.l - 2 || x > m.r + 2) return;
        const glow = clamp(1 - (t - s.lit) / 0.6, 0, 1);
        ctx.fillStyle = glow > 0 ? "#ffffff" : T.scopeText;
        ctx.beginPath(); ctx.arc(x, y, 3.5 + glow * 3, 0, TAU); ctx.fill();
        const txt = s.acc > 0 ? `${tg.name}: ${Math.round(s.acc)}…` : s.last != null ? `${tg.name}: ${Math.round(s.last)} hits` : tg.name;
        label(ctx, txt, x + 7, y - 10, { color: glow > 0 ? T.scopeFg : T.scopeText, bg: alpha("#000000", 0.55), bounds: w, font: T.mono });
      });
    }

    function drawPPI(ctx, w, hh) {
      const T = theme(), { cx, cy, Rp } = ppiGeom();
      ctx.fillStyle = T.scopeBg; ctx.beginPath(); ctx.arc(cx, cy, Rp + 4, 0, TAU); ctx.fill();
      ctx.strokeStyle = T.scopeGrid; ctx.lineWidth = 1;
      for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(cx, cy, (Rp * k) / 4, 0, TAU); ctx.stroke(); }
      for (let k = 0; k < 12; k++) { const a = (k * TAU) / 12; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Rp * Math.sin(a), cy - Rp * Math.cos(a)); ctx.stroke(); }
      ctx.font = T.mono; ctx.fillStyle = T.scopeText; ctx.textAlign = "left"; ctx.textBaseline = "top";
      for (let k = 1; k <= 4; k++) { const rr = (Rp * k) / 4; ctx.fillText(`${(PPI_R * k) / 4}${k === 4 ? " km" : ""}`, cx + 4, cy + rr - 14); }
      if (!["circular", "helical"].includes(S.pattern)) {
        ctx.strokeStyle = alpha(T.scopeText, 0.5); ctx.setLineDash([4, 4]);
        for (const a of [-S.sector / 2, S.sector / 2]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Rp * Math.sin(rad(a)), cy - Rp * Math.cos(rad(a))); ctx.stroke(); }
        ctx.setLineDash([]);
      }
      fitTrail(trailP, ppi);
      ctx.drawImage(trailP, 0, 0, w, hh);
      // sweep
      const a = rad(beam.az);
      ctx.fillStyle = alpha(T.scopeFg, 0.18);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, Rp, a - rad(S.beam / 2) - Math.PI / 2, a + rad(S.beam / 2) - Math.PI / 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = T.scopeFg; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Rp * Math.sin(a), cy - Rp * Math.cos(a)); ctx.stroke();
      // hit labels
      TARGETS.forEach((tg, i) => {
        const s = tgtState[i];
        if (s.last == null && !s.acc) return;
        const rr = (tg.r / PPI_R) * Rp, ta = rad(tg.az);
        label(ctx, `${tg.name} ${Math.round(s.acc || s.last)}`, cx + rr * Math.sin(ta) + 6, cy - rr * Math.cos(ta) - 10, { color: T.scopeText, bg: alpha("#000000", 0.55), font: T.mono, bounds: w });
      });
    }

    // ---- conical scan
    const CF = 1;                      // displayed nutation rate, Hz
    const hist = [];                   // [t, amplitude]
    let ct = 0, est = { a0: 0.5, I: 0, Q: 0 };
    function beamPos(tt) { const ph = TAU * CF * tt; return [S.bore[0] + S.sq * Math.cos(ph), S.bore[1] + S.sq * Math.sin(ph)]; }
    function amp(b) { const dx = S.tgt[0] - b[0], dy = S.tgt[1] - b[1]; return Math.exp(-LN2x4 * (dx * dx + dy * dy)); }
    function conStep(dt) {
      const n = Math.max(1, Math.ceil(dt / 0.01));
      for (let k = 0; k < n; k++) {
        const h2 = dt / n;
        ct += h2;
        const ph = TAU * CF * ct, a = amp(beamPos(ct));
        hist.push([ct, a, h2, ph]);
        winEst();
        if (S.track) {
          const e = errEst();
          const g = 1.2 * h2;
          S.bore[0] += g * e.mag * Math.cos(e.dir); S.bore[1] += g * e.mag * Math.sin(e.dir);
        }
      }
      while (hist.length && hist[0][0] < ct - 3.2) hist.shift();
      const off = Math.hypot(S.tgt[0] - S.bore[0], S.tgt[1] - S.bore[1]);
      if (S.track && off < 0.1) S.lockedFor += dt; else S.lockedFor = 0;
    }
    // demodulate over exactly the last scan period: mean, and the cos / sin components against the scan reference
    function winEst() {
      let s = 0, sc = 0, ss = 0, wsum = 0;
      for (let i = hist.length - 1; i >= 0 && hist[i][0] > ct - 1 / CF; i--) {
        const [, a, wt, ph] = hist[i];
        s += a * wt; sc += 2 * a * Math.cos(ph) * wt; ss += 2 * a * Math.sin(ph) * wt; wsum += wt;
      }
      if (wsum > 0.5 / CF) est = { a0: s / wsum, I: sc / wsum, Q: ss / wsum };
    }
    function errEst() {
      const m = Math.hypot(est.I, est.Q) / Math.max(1e-6, est.a0);
      return { m, mag: Math.min(1.5, m / (2 * LN2x4 * S.sq)), dir: Math.atan2(est.Q, est.I) };
    }
    let conDrag = false;
    function conGeom(w, hh) {
      const stacked = w < 420;
      const sz = stacked ? Math.min(w - 20, hh * 0.56) : Math.min(hh - 20, w * 0.48);
      const box = stacked ? { x: (w - sz) / 2, y: 6, s: sz } : { x: 8, y: (hh - sz) / 2, s: sz };
      const plot = stacked ? { x: 0, y: sz + 12, w, h: hh - sz - 12 } : { x: sz + 14, y: 0, w: w - sz - 14, h: hh };
      const span = 1.6;
      const toPx = (p) => [box.x + box.s / 2 + (p[0] / span) * (box.s / 2), box.y + box.s / 2 - (p[1] / span) * (box.s / 2)];
      const fromPx = (x, y) => [((x - box.x - box.s / 2) / (box.s / 2)) * span, (-(y - box.y - box.s / 2) / (box.s / 2)) * span];
      return { box, plot, toPx, fromPx };
    }
    drag(con, {
      hit: (x, y) => { const g = conGeom(con.w, con.h); const [px, py] = g.toPx(S.tgt); return Math.hypot(x - px, y - py) < 28; },
      down: () => { conDrag = true; },
      move: (x, y) => { const g = conGeom(con.w, con.h); const p = g.fromPx(clamp(x, g.box.x, g.box.x + g.box.s), clamp(y, g.box.y, g.box.y + g.box.s)); S.tgt = p; S.lockedFor = 0; if (!anim.playing) con.redraw(); },
      up: () => { conDrag = false; },
    });
    function drawConical(ctx, w, hh) {
      const T = theme(), g = conGeom(w, hh), { box } = g;
      ctx.fillStyle = T.surface2; ctx.fillRect(box.x, box.y, box.s, box.s);
      ctx.strokeStyle = T.grid; ctx.lineWidth = 1; ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.s - 1, box.s - 1);
      const [bx, by] = g.toPx(S.bore), sc = box.s / 2 / 1.6;
      // boresight cross
      ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx - 9, by); ctx.lineTo(bx + 9, by); ctx.moveTo(bx, by - 9); ctx.lineTo(bx, by + 9); ctx.stroke();
      // scan circle and beam (−3 dB contour)
      ctx.strokeStyle = alpha(T.muted, 0.7); ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(bx, by, S.sq * sc, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      const bp = beamPos(ct), [px, py] = g.toPx(bp);
      ctx.fillStyle = alpha(T.accent, 0.16); ctx.strokeStyle = T.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 0.5 * sc, 0, TAU); ctx.fill(); ctx.stroke();
      // estimated error vector
      const e = errEst();
      if (e.mag > 0.02) {
        const ex = bx + e.mag * sc * Math.cos(e.dir), ey = by - e.mag * sc * Math.sin(e.dir);
        ctx.save(); ctx.strokeStyle = T.tx; ctx.fillStyle = T.tx; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey, 3, 0, TAU); ctx.fill(); ctx.restore();
      }
      // target
      const [tx, ty] = g.toPx(S.tgt);
      ctx.fillStyle = T.tgt; ctx.strokeStyle = T.surface; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tx, ty, 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText("±1.6 θ₃", box.x + 4, box.y + 4);
      // amplitude plot
      const pl = g.plot;
      ctx.save(); ctx.translate(pl.x, pl.y);
      const P = axes(ctx, pl.w, pl.h, { x: [-3, 0], y: [0, 1.05], xticks: [-3, -2, -1, 0], yticks: [0, 0.5, 1], xfmt: (v) => `${v} s`, xlabel: "echo amplitude vs time", pad: { l: 30, r: 8, t: 22, b: 30 } });
      if (hist.length > 1) {
        const ref = [];
        for (let i = 0; i <= 120; i++) { const tt = ct - 3 + (3 * i) / 120; ref.push([P.X(tt - ct), P.Y(0.5 + 0.45 * Math.cos(TAU * CF * tt))]); }
        polyRaw(ctx, ref, alpha(T.muted, 0.5), 1, [3, 3]);
        polyRaw(ctx, hist.map(([tt, a]) => [P.X(tt - ct), P.Y(a)]), T.rx, 2);
      }
      label(ctx, `modulation ${num(e.m * 100, 2)} %`, P.l + 2, 9, { color: T.rx, font: T.font });
      ctx.restore();
    }
    function polyRaw(ctx, pts, color, lw, dash) {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
    }

    // ---- ESA timeline + revisit chart
    function drawESA(ctx, w, hh) {
      const T = theme();
      const win = 0.5, top = 22, barH = 30, l = 46, r = w - 12;
      // simulate the scheduler from t = 0
      const due = Array.from({ length: S.tracks }, (_, i) => (i / Math.max(1, S.tracks)) / S.trackRate);
      let tt = 0, n = 0, nt = 0;
      const dw = dwell();
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText("beam time", 4, top - 12);
      ctx.fillStyle = T.surface2; ctx.fillRect(l, top, r - l, barH);
      while (tt < win && n++ < 5000) {
        let tr = -1;
        for (let i = 0; i < S.tracks; i++) if (due[i] <= tt) { tr = i; due[i] += 1 / S.trackRate; break; }
        const x0 = l + (tt / win) * (r - l), x1 = l + (Math.min(win, tt + dw) / win) * (r - l);
        ctx.fillStyle = tr >= 0 ? T.tgt : alpha(T.accent, n % 2 ? 0.85 : 0.6);
        ctx.fillRect(x0, top, Math.max(0.6, x1 - x0 - (x1 - x0 > 3 ? 0.6 : 0)), barH);
        if (tr >= 0) nt++;
        tt += dw;
      }
      ctx.fillStyle = T.muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (let k = 0; k <= 5; k++) { ctx.textAlign = k === 5 ? "right" : k ? "center" : "left"; ctx.fillText(`${k * 100} ms`, l + (k / 5) * (r - l), top + barH + 3); }
      // cursor following real time
      const cur = ((esa.end % win) / win) * (r - l) + l;
      if (S.pattern === "esa") { ctx.fillStyle = T.ink; ctx.fillRect(cur - 1, top - 4, 2, barH + 8); }
      label(ctx, `${num(dw * 1e3, 3)} ms dwells · ${nt} track looks in this window`, r, top - 12, { align: "right", color: T.muted, font: T.font });
      // revisit curve
      ctx.save(); ctx.translate(0, top + barH + 20);
      const ph = hh - (top + barH + 20);
      const nMax = Math.max(1, 1 / (S.trackRate * dw));
      const base = revisit(0), cur2 = revisit(S.tracks);
      const yMax = Math.max(base * 4, isFinite(cur2) ? cur2 * 1.3 : 0);
      const P = axes(ctx, w, ph, { x: [0, 60], y: [0, yMax], xlabel: "targets in track", ylabel: "revisit s", pad: { l: 46, r: 12, t: 10, b: 30 } });
      P.clip();
      const pts = [];
      for (let i = 0; i <= 240; i++) { const k = (60 * i) / 240; const v = revisit(k); if (isFinite(v) && v < yMax * 1.5) pts.push([P.X(k), P.Y(v)]); }
      polyRaw(ctx, pts, T.c4, 2);
      if (nMax <= 60) { ctx.strokeStyle = T.bad; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(P.X(nMax), P.t); ctx.lineTo(P.X(nMax), P.b); ctx.stroke(); ctx.setLineDash([]); }
      P.unclip();
      if (nMax <= 60) label(ctx, `search starves at ${num(nMax, 3)} tracks`, P.X(nMax) - 4, P.t + 10, { align: "right", color: T.bad, font: T.font });
      if (isFinite(cur2)) { ctx.fillStyle = T.c4; ctx.beginPath(); ctx.arc(P.X(S.tracks), P.Y(Math.min(cur2, yMax)), 5, 0, TAU); ctx.fill(); label(ctx, `${num(cur2, 3)} s with ${S.tracks}`, P.X(S.tracks) + 8, P.Y(Math.min(cur2, yMax)) - 10, { color: T.c4, bounds: w, font: T.font }); }
      ctx.restore();
    }

    // ---- loop
    let lastRedraw = 0, lastRo = -1;
    const anim = api.track(animate((dt, tt) => {
      advance(dt);
      const ft = frameTime();
      const tau = clamp(isFinite(ft) ? ft * 0.8 : 4, 0.6, 15) / S.speed;
      if (trailS.width) fade(trailS, 1 - Math.exp(-dt / tau));
      if (trailP.width) fade(trailP, 1 - Math.exp(-dt / Math.max(tau, 2)));
      space.redraw(); ppi.redraw(); con.redraw();
      if (S.pattern === "esa" || tt - lastRedraw > 1) { esaV.redraw(); lastRedraw = tt; }
      if (S.lockedFor >= 2) ch.update(S);
      if (tt - lastRo > 0.25) { lastRo = tt; conRo.set([
        ["True pointing error", `${num(Math.hypot(S.tgt[0] - S.bore[0], S.tgt[1] - S.bore[1]), 2)} θ<sub>3</sub>`, S.lockedFor > 0 ? "ok" : null],
        ["Estimated from modulation", `${num(errEst().mag, 2)} θ<sub>3</sub>`],
        ["Crossover loss on axis", `${num(-2 * 10 * Math.log10(Math.E) * LN2x4 * S.sq * S.sq, 2)} dB`],
      ]); }
    }, { target: lab.main, playing: !reducedMotion }));
    playButton(space, anim);

    void tour;
    resetScan();
    changed();
    if (reducedMotion) {
      // draw a static frame: run one pattern frame (or 4 s) silently so the trail shows the pattern
      queueMicrotask(() => { const ft = Math.min(isFinite(frameTime()) ? frameTime() : 4, 20); for (let k = 0; k < ft / 0.02; k++) advance(0.02); changed(); });
    }

    notes(root, "Background", [
      { title: "The common scan patterns", open: true, html:
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Pattern</th><th>How it moves</th><th>Typical use</th></tr>" +
        "<tr><td>Circular</td><td>Continuous 360° rotation, fan beam in elevation</td><td>Air traffic control, early warning, marine radar</td></tr>" +
        "<tr><td>Sector</td><td>Back and forth across an arc</td><td>Approach radars, weapon locating, surface search ahead of a ship</td></tr>" +
        "<tr><td>Raster</td><td>Horizontal bars stepped in elevation</td><td>Airborne fighter radars (1-, 2-, 4-bar scans), 3-D search with pencil beams</td></tr>" +
        "<tr><td>Helical</td><td>Rotation with elevation rising each turn</td><td>Hemispheric search, weather volume scans (stepped), some naval radars</td></tr>" +
        "<tr><td>Spiral</td><td>Outward spiral from a cue</td><td>Target acquisition by a tracker, missile seekers</td></tr>" +
        "<tr><td>Palmer</td><td>Conical scan carried by a slower scan</td><td>Wide swath around a cue; acquisition then conical track</td></tr>" +
        "<tr><td>Nodding</td><td>Elevation nods at a fixed bearing</td><td>Height-finder radars, cued by a 2-D search radar</td></tr>" +
        "<tr><td>Conical / lobing</td><td>Squinted beam spun or switched around the axis</td><td>Older tracking radars, simple seekers</td></tr>" +
        "<tr><td>ESA scheduling</td><td>Beam jumps between dwells, no fixed pattern</td><td>Multifunction radars: search, track, missile uplink at once</td></tr></table></div>" },
      { title: "Hits per scan and time on target", html:
        "<p>A target sits inside the beam for θ<sub>3</sub>/ω̇ seconds, and the radar fires PRF pulses per second, so</p>" +
        "<p class=\"eq\"><i>n</i> = <span class=\"frac\"><span>θ<sub>3</sub> · PRF</span><span>ω̇</span></span> = <span class=\"frac\"><span>θ<sub>3</sub> · PRF</span><span>6 · rpm</span></span> &nbsp;(θ<sub>3</sub> in degrees)</p>" +
        "<p>For an airport radar with a 1.4° beam, 1 kHz and 12.5 rpm (75°/s), <i>n</i> ≈ 19. Those pulses are integrated to raise the signal above noise (<a href=\"#detection\">lesson 9</a>) and are what the MTI or Doppler filter works on (<a href=\"#doppler\">lesson 5</a>). In a raster, a target near the edge of a bar is also painted by the next bar, so adjacent bars usually overlap: spacing ≈ 0.7–1 beamwidth.</p>" +
        "<p>The beam's own shape costs something too: pulses near the edge of the beam see less than peak gain. This <b>beam-shape loss</b> is about 1.6 dB for a scan in one dimension and 3.2 dB in two, and is a standard line in the radar equation's loss budget.</p>" },
      { title: "Frame time and the search trade-off", html:
        "<p>To search a solid angle Ω with a beam of solid angle Ω<sub>b</sub> ≈ θ<sub>az</sub>θ<sub>el</sub>, dwelling <i>t</i><sub>d</sub> on each position, the frame (revisit) time is</p>" +
        "<p class=\"eq\"><i>t</i><sub>f</sub> = <span class=\"frac\"><span>Ω</span><span>Ω<sub>b</sub></span></span> · <i>t</i><sub>d</sub></p>" +
        "<p>A narrower beam has more gain but needs more positions. Putting the gain into the radar equation and the dwell into the energy gives the <b>search radar equation</b>:</p>" +
        "<p class=\"eq\">SNR = <span class=\"frac\"><span><i>P</i><sub>av</sub> <i>A</i><sub>e</sub> <i>t</i><sub>f</sub> σ</span><span>4π Ω <i>R</i><sup>4</sup> <i>k T</i><sub>0</sub> <i>F L</i></span></span></p>" +
        "<p>Beamwidth and wavelength drop out: for search, only average power × aperture area (the <b>power-aperture product</b>) and the time you allow per frame matter. You can sweep fast with few hits or slowly with many; the total energy on each target per frame is the same. Faster revisit helps track manoeuvring targets, while slower scanning gives more hits for Doppler filtering.</p>" },
      { title: "Conical scan, lobing and monopulse", html:
        "<p><b>Lobe switching</b> (sequential lobing) flips the beam between two squinted positions per axis and compares the echoes. <b>Conical scan</b> spins a squinted beam continuously. With a Gaussian beam the echo amplitude is</p>" +
        "<p class=\"eq\"><i>a</i>(<i>t</i>) ≈ <i>a</i><sub>0</sub> [1 + <i>m</i> cos(2π<i>f</i><sub>s</sub><i>t</i> − φ)], &nbsp; <i>m</i> ≈ 8 ln 2 · <span class=\"frac\"><span>θ<sub>s</sub> ε</span><span>θ<sub>3</sub><sup>2</sup></span></span></p>" +
        "<p>where θ<sub>s</sub> is the squint and ε the target's offset; φ points to it. Mixing the echo with the scan's cos and sin references gives azimuth and elevation errors that drive the servos. Larger squint gives a steeper error slope but more <b>crossover loss</b> on axis; θ<sub>s</sub> ≈ 0.3–0.4 θ<sub>3</sub> is typical.</p>" +
        "<p>The weakness: the error is measured over several pulses, so echo fluctuations (target scintillation) and a jammer that modulates at the scan rate (<b>inverse-gain jamming</b>) create false errors. <b>Monopulse</b> forms all the lobes at once with a sum and difference beam (<a href=\"#arrays\">lesson 11</a>) and measures the angle on every single pulse, so amplitude fluctuations cancel. Nearly every modern tracker uses it.</p>" },
      { title: "TWS, STT and ESA scheduling", html:
        "<ul><li><b>Single-target track</b> (STT): the antenna follows one target with conical scan or monopulse. Accurate and fast-updating, but the radar is blind to everything else.</li>" +
        "<li><b>Track-while-scan</b> (TWS): the radar keeps scanning and a computer builds tracks from successive detections (plots). Update rate = scan rate, so accuracy is limited, but many targets are tracked at once.</li>" +
        "<li><b>ESA scheduling</b>: a phased array (<a href=\"#arrays\">lesson 11</a>) interleaves search dwells with track dwells, each track at its own rate (faster for manoeuvring or threatening targets). The time budget is the constraint: track occupancy is <i>N</i><sub>tracks</sub> × update rate × dwell, and search gets the rest, so the search frame time is <i>t</i><sub>f</sub> = <i>N</i><sub>pos</sub><i>t</i><sub>d</sub> / (1 − occupancy). Real schedulers also use priorities, dwell lengths that vary with range, and confirm dwells right after a new detection.</li></ul>" },
    ]);

    api.quiz(root, [
      { q: "A radar has a 2° beam, PRF 600 Hz, and turns at 10 rpm. How many hits per scan?", options: ["2", "10", "20", "120"], answer: 2, why: "10 rpm = 60°/s. Time in the beam = 2°/60°/s = 33 ms; × 600 Hz = 20 pulses." },
      { q: "In conical scan, what tells the radar which direction the target is off-axis?", options: ["The depth of the amplitude modulation", "The phase of the modulation relative to the scan", "The echo's Doppler shift", "The pulse width"], answer: 1, why: "The depth gives how far off-axis; the phase (when in the scan cycle the echo peaks) gives the direction." },
      { q: "Why does monopulse beat conical scan in a fluctuating-target or jamming environment?", options: ["It uses more power", "It measures the angle error on every single pulse, so amplitude changes between pulses don't matter", "It scans faster", "It has a wider beam"], answer: 1, why: "Monopulse compares simultaneous sum and difference beams. Conical scan needs several pulses, so any amplitude change during the scan looks like an angle error." },
      { q: "An ESA spends 8 ms per dwell and updates each track twice a second. Roughly how many tracks can it hold before search stops completely?", options: ["16", "62", "125", "250"], answer: 1, why: "Each track takes 2 × 8 ms = 16 ms per second, so 1 s / 16 ms ≈ 62 tracks use all the time. Long before that, the search revisit time becomes unacceptable." },
    ]);
  },
};
