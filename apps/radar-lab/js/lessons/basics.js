// Lesson 1: a pulse goes out, bounces off a target and comes back. Time the round trip to get range.
import {
  h, C0, card, labGrid, group, notes, slider, choice, check, button, readout, status, legend,
  canvasView, drag, animate, playButton, axes, theme, alpha, label, dimension, num, si, km, clamp, rng, reducedMotion,
} from "../ui.js";

const R_MAX = 150e3;            // scene depth, m
const T_MAX = (2 * R_MAX) / C0; // round trip to the far edge: 1 ms
const SNR_REF = 32;             // dB at 50 km for a 10 m² target

export default {
  mount(root, api) {
    root.append(h("p", { class: "lede", html:
      "<b>RA</b>dio <b>D</b>etection <b>A</b>nd <b>R</b>anging: a radar sends out a short burst of radio energy, " +
      "listens for the faint echo, and turns the delay into a distance. Everything here runs in slow motion: " +
      "the real round trip to 150 km takes one millisecond." }));

    const S = {
      r1: 60e3, r2: 110e3, two: false, rcs: 10, speed: 4, // seconds of animation per millisecond of radar time
      t: 0, auto: true, echoes: 0, maxRange: 0, mystery: null, solved: false, lastGuessErr: Infinity,
    };
    const R = rng(42);
    let trail = [];   // previous A-scope trace (persistence)
    let trace = [];   // current sweep samples [tSec, dB]
    let grass = new Float32Array(600).map(() => R());

    const tour = api.steps(root, [
      { title: "1 · Transmit", html: "<p>The radar's transmitter fires a pulse a microsecond or so long. It leaves the antenna at the speed of light, <b>300 metres every microsecond</b>.</p>",
        look: "the orange arc leaving the dish, and the big spike at the left of the A-scope: that's the transmitter itself.", apply: () => { setMystery(false); S.two = false; twoChk.checked = false; fire(); changed(); } },
      { title: "2 · Reflect", html: "<p>When the pulse hits something, a tiny fraction of its energy scatters back toward the radar. How much depends on the target's <b>radar cross-section</b> (RCS), its size and shape as the radar sees it.</p>",
        look: "the blue echo heading back. It's much fainter than what went out.", apply: () => { fire(); changed(); } },
      { title: "3 · Time the echo", html: "<p>The receiver's clock started when the pulse left. The echo arrives after the pulse has gone out <i>and</i> back, so the range is half the distance light covers in that time:</p><p class=\"eq\"><i>R</i> = <span class=\"frac\"><span><i>c</i> · Δ<i>t</i></span><span>2</span></span></p>",
        look: "the A-scope. Its horizontal axis is time, which is the same thing as range. The blip appears exactly when the echo gets home.", apply: () => { fire(); changed(); } },
      { title: "4 · Farther means fainter", html: "<p>Drag the aircraft away. The echo arrives later and gets much weaker: double the range and the echo drops to <b>1/16</b> of its strength (−12 dB). Lesson 3 explains why.</p>",
        look: "the blip height on the A-scope as you drag.", apply: () => { setMystery(false); S.r1 = 120e3; rSl.value = 120; fire(); changed(); } },
      { title: "5 · Two targets", html: "<p>A single pulse finds everything in the beam at once. Each target produces its own echo at its own delay.</p>",
        look: "two blips on the A-scope. Try dragging them close together; the next lesson shows when they merge.", apply: () => { setMystery(false); S.two = true; twoChk.checked = true; S.r1 = 50e3; rSl.value = 50; fire(); changed(); } },
      { title: "6 · Your turn", html: "<p>Switch on <b>Mystery target</b>. The aircraft is hidden; read the echo delay off the A-scope and work out the range.</p>",
        apply: () => { setMystery(true); } },
    ]);

    const lab = labGrid(root);

    // ---- side view
    const sideCard = card(lab.main, "Side view", "drag the aircraft");
    const side = api.track(canvasView(sideCard, { aspect: 2.6, minHeight: 170, maxHeight: 300, draw: drawSide, label: "Radar on the left sending a pulse toward an aircraft" }));
    legend(sideCard, [[theme().tx, "transmitted pulse"], [theme().rx, "echo"]]);
    let dragging = 0;
    drag(side, {
      hit: (x, y) => { if (S.mystery) return false; const a = Math.abs(x - rx(S.r1)); const b = S.two ? Math.abs(x - rx(S.r2)) : 1e9; return Math.min(a, b) < 26 && y < side.h - 20; },
      down: (x) => { const a = Math.abs(x - rx(S.r1)); const b = S.two ? Math.abs(x - rx(S.r2)) : 1e9; dragging = a <= b ? 1 : 2; },
      move: (x) => {
        const r = clamp(xr(x), 3e3, R_MAX - 2e3);
        if (dragging === 1) { S.r1 = r; rSl.value = r / 1000; } else if (dragging === 2) S.r2 = r;
        changed();
      },
      up: () => { dragging = 0; },
    });

    // ---- A-scope
    const scopeCard = card(lab.main, "A-scope", "echo strength against time since transmit");
    const scope = api.track(canvasView(scopeCard, { aspect: 3, minHeight: 170, maxHeight: 260, draw: drawScope, label: "A-scope trace of echo strength against time" }));
    const clock = h("p", { class: "caption" });
    scopeCard.append(clock);

    // ---- controls
    const ctl = card(lab.side, "Controls");
    const g1 = group(ctl, "Target");
    const rSl = slider(g1, { label: "Aircraft range", min: 3, max: 148, step: 0.5, value: S.r1 / 1000, format: (v) => `${num(v, 3)} km`, onInput: (v) => { S.r1 = v * 1000; changed(); } });
    choice(g1, { label: "Target size (RCS)", value: 10, options: [[0.01, "Bird"], [1, "Drone"], [10, "Fighter"], [100, "Airliner"]], onChange: (v) => { S.rcs = v; changed(); } });
    const twoChk = check(g1, { label: "Second target", checked: false, onChange: (v) => { S.two = v; changed(); } });

    const g2 = group(ctl, "Radar");
    const btns = h("div", { class: "btn-row" });
    g2.append(btns);
    button(btns, "Fire pulse", () => fire());
    const autoChk = check(g2, { label: "Fire automatically", checked: true, onChange: (v) => { S.auto = v; } });
    slider(g2, { label: "Slow motion", min: 1, max: 10, step: 0.5, value: S.speed, format: (v) => `1 ms → ${num(v, 2)} s`, help: "Real radar time is a million times quicker than this.", onInput: (v) => { S.speed = v; } });

    const g3 = group(ctl, "Mystery target");
    const mysChk = check(g3, { label: "Hide the aircraft", checked: false, onChange: (v) => setMystery(v) });
    const guessIn = h("input", { type: "number", inputmode: "decimal", min: 0, max: 150, step: 0.1, placeholder: "range in km", "aria-label": "Your range estimate in kilometres",
      style: { minHeight: "44px", width: "100%", padding: "0 10px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--bg)" } });
    const guessBtn = button(null, "Check", () => checkGuess(), "small");
    const guessRow = h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, guessIn, guessBtn);
    g3.append(guessRow);
    guessIn.addEventListener("keydown", (e) => { if (e.key === "Enter") checkGuess(); });
    const guessSt = status(g3);
    guessSt.hide();

    const out = card(lab.side, "Measurements");
    const ro = readout(out);

    const ch = api.challenges(root, [
      { id: "echo", text: "Fire a pulse and watch its echo come back.", check: (s) => s.echoes >= 1 },
      { id: "far", text: "Move the aircraft beyond 100 km. How long is the round trip now?", check: (s) => s.maxRange > 100e3 && s.echoes >= 2 },
      { id: "close", text: "Bring a target close enough that its echo returns within 100 µs.", check: (s) => (2 * s.r1) / C0 < 100e-6 },
      { id: "two", text: "Put two targets in the beam at once.", check: (s) => s.two },
      { id: "bird", text: "Find a bird (0.01 m²) at 40 km or more. Can you still see its echo above the noise?", check: (s) => s.rcs === 0.01 && s.r1 >= 40e3 },
      { id: "mystery", text: "Solve a mystery target to within 2 km.", check: (s) => s.solved },
    ]);

    // ---- model
    function snr(r, rcs) { return SNR_REF + 10 * Math.log10(rcs / 10) - 40 * Math.log10(r / 50e3); }
    function targets() { const t = [{ r: S.mystery ?? S.r1, rcs: S.rcs }]; if (S.two && !S.mystery) t.push({ r: S.r2, rcs: S.rcs }); return t; }
    function fire() { if (trace.length) trail = trace; trace = []; S.t = 0; grass = grass.map(() => R()); if (!anim.playing) anim.play(); }
    function setMystery(on) {
      mysChk.checked = on;
      S.mystery = on ? Math.round((12 + R() * 130) * 10) * 100 : null;
      guessSt.hide(); guessIn.value = "";
      guessRow.style.display = on ? "flex" : "none";
      fire(); changed();
    }
    function checkGuess() {
      if (S.mystery == null) { setMystery(true); return; }
      const g = parseFloat(guessIn.value);
      if (!isFinite(g)) { guessSt.hide(false); guessSt.set("warn", "Type a range in km first."); return; }
      const err = Math.abs(g * 1000 - S.mystery);
      guessSt.hide(false);
      if (err <= 2000) {
        S.solved = true;
        guessSt.set("ok", `Spot on: it was ${num(S.mystery / 1000, 4)} km.`, `<br>Echo delay ${num(((2 * S.mystery) / C0) * 1e6, 4)} µs × 300 m/µs ÷ 2. Untick and tick “Hide” for another.`);
      } else {
        guessSt.set(err < 10000 ? "warn" : "bad", err < 10000 ? "Close, but not within 2 km." : "Not quite.", "<br>Read the blip's delay in µs, multiply by 0.3 km/µs, then halve it.");
      }
      changed();
    }
    function changed() {
      S.maxRange = Math.max(S.maxRange, S.r1);
      const tr = (2 * S.r1) / C0;
      const rows = [
        ["Round-trip time", S.mystery ? "read it off the A-scope" : si(tr, "s", 4)],
        ["Range = c·Δt ⁄ 2", S.mystery ? "?" : km(S.r1, 4)],
        ["Echo strength", S.mystery ? "?" : `${num(snr(S.r1, S.rcs), 3)} dB above noise`, snr(S.r1, S.rcs) < 13 ? "warn" : "ok"],
      ];
      if (S.two && !S.mystery) rows.push(["Target 2 delay", si((2 * S.r2) / C0, "s", 4)], ["Target 2 range", km(S.r2, 4)]);
      rows.push(["Light travels", "300 m per µs"], ["Each km of range costs", "6.67 µs"]);
      ro.set(rows);
      ch.update(S);
      side.redraw(); scope.redraw();
    }

    // ---- drawing
    const LEFT = 64, RIGHT = 24;
    function rx(r) { return LEFT + (r / R_MAX) * (side.w - LEFT - RIGHT); }
    function xr(x) { return ((x - LEFT) / (side.w - LEFT - RIGHT)) * R_MAX; }

    function drawSide(ctx, w, hh) {
      const T = theme();
      const ground = hh - 26, ay = ground - 36;     // antenna height
      const ty = ground - 92 * Math.min(1, hh / 240) - 20;
      // sky gradient + ground
      ctx.fillStyle = T.surface2; ctx.fillRect(0, 0, w, ground);
      ctx.fillStyle = T.grid; ctx.fillRect(0, ground, w, hh - ground);
      // range ticks
      ctx.font = T.font; ctx.fillStyle = T.muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (let r = 0; r <= R_MAX; r += w < 560 ? 50e3 : 25e3) {
        const x = rx(r);
        ctx.fillRect(x, ground, 1, 5);
        ctx.fillText(r === 0 ? "0" : `${r / 1000} km`, x, ground + 7);
      }
      // beam, pointed at the first target
      const aim = Math.atan2(ty - ay, rx(S.mystery ?? S.r1) - LEFT), half = 0.16, far = w * 1.5;
      ctx.fillStyle = alpha(T.accent, 0.08);
      ctx.beginPath(); ctx.moveTo(LEFT, ay);
      ctx.lineTo(LEFT + far * Math.cos(aim - half), ay + far * Math.sin(aim - half));
      ctx.lineTo(LEFT + far * Math.cos(aim + half), ay + far * Math.sin(aim + half));
      ctx.closePath(); ctx.fill();
      // radar
      ctx.strokeStyle = T.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(LEFT - 14, ground); ctx.lineTo(LEFT - 14, ay + 6); ctx.stroke();
      ctx.fillStyle = T.ink;
      ctx.beginPath(); ctx.ellipse(LEFT - 10, ay, 6, 18, -0.15, -Math.PI / 2, Math.PI / 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(LEFT - 8, ay - 1); ctx.lineTo(LEFT + 4, ay - 3); ctx.stroke();
      ctx.font = T.fontB; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText("radar", LEFT - 14, ay - 22);

      const tgts = targets();
      const tAnim = S.t;
      // pulse (exaggerated thickness so it's visible)
      const out = C0 * tAnim;
      tgts.forEach((tg, i) => {
        const x = rx(tg.r), y = ty + i * 26;
        if (!S.mystery) drawPlane(ctx, x, y, i ? T.c4 : T.tgt);
        else { ctx.fillStyle = T.muted; ctx.font = "600 22px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", w * 0.55, ty); }
        // echo: starts at the target when the pulse arrives
        const tHit = tg.r / C0;
        if (tAnim > tHit && tAnim < (2 * tg.r) / C0 + 2e-6) {
          const back = C0 * (tAnim - tHit);
          const px = rx(tg.r) - (back / tg.r) * (rx(tg.r) - LEFT);
          const py = y + (back / tg.r) * (ay - y);
          const strength = clamp(snr(tg.r, tg.rcs) / 45, 0.15, 1);
          ctx.strokeStyle = alpha(T.rx, strength); ctx.lineWidth = 2 + strength * 3;
          const rr = Math.hypot(px - x, py - y);
          const dir = Math.atan2(ay - y, LEFT - x);
          ctx.beginPath(); ctx.arc(x, y, Math.max(1, rr), dir - 0.35, dir + 0.35); ctx.stroke();
        }
      });
      if (out < R_MAX * 1.1) {
        const px = rx(Math.min(out, R_MAX * 1.1)) - LEFT;
        ctx.strokeStyle = T.tx; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(LEFT, ay, Math.max(1, px / Math.cos(aim)), aim - half, aim + half); ctx.stroke();
      }
      if (!S.mystery) {
        const tr = (2 * S.r1) / C0;
        if (tAnim >= tr) dimension(ctx, LEFT, ground - 12, rx(S.r1), ground - 12, `R = ${km(S.r1, 3)}`, T.rx);
      }
    }

    function drawPlane(ctx, x, y, color) {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-18, 0); ctx.lineTo(16, -2); ctx.quadraticCurveTo(20, 0, 16, 2); ctx.lineTo(-18, 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-6, -10); ctx.lineTo(-2, -10); ctx.lineTo(8, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-19, -7); ctx.lineTo(-16, -7); ctx.lineTo(-10, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    function scopeValue(tSec, tgts) {
      // log-video amplitude in dB above noise
      let v = grass[Math.floor((tSec / T_MAX) * (grass.length - 1)) % grass.length] * 6;
      const tau = 6e-6; // exaggerated pulse width so blips are visible at this scale
      if (tSec < tau) v = Math.max(v, 52);
      for (const tg of tgts) {
        const d = tSec - (2 * tg.r) / C0;
        if (d >= -tau / 2 && d <= tau / 2) v = Math.max(v, clamp(snr(tg.r, tg.rcs), 0, 50) * Math.cos((d / tau) * Math.PI) + 2);
      }
      return v;
    }

    function drawScope(ctx, w, hh) {
      const T = theme();
      const P = axes(ctx, w, hh, { x: [0, T_MAX * 1e6], y: [0, 55], dark: true, xlabel: "time since transmit (µs)", yfmt: (v) => `${v}`, ylabel: "dB", pad: { l: 40, b: 32 } });
      const tgts = targets();
      const plot = (from, to, color, lw) => {
        ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
        const n = Math.max(2, Math.floor((P.r - P.l) * ((to - from) / T_MAX)));
        for (let i = 0; i <= n; i++) {
          const t = from + ((to - from) * i) / n;
          const x = P.X(t * 1e6), y = P.Y(scopeValue(t, tgts));
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      };
      if (trail.length || S.t >= T_MAX) plot(Math.min(S.t, T_MAX), T_MAX, alpha(T.scopeFg, 0.25), 1);
      plot(0, Math.min(S.t, T_MAX), T.scopeFg, 1.5);
      // sweep cursor
      const cx = P.X(Math.min(S.t, T_MAX) * 1e6);
      ctx.fillStyle = alpha(T.scopeFg, 0.8); ctx.fillRect(cx - 1, P.t, 2, P.b - P.t);
      // labels for echoes that have arrived
      ctx.font = T.mono;
      label(ctx, "transmit", P.l + 4, P.t + 10, { color: T.scopeText, bg: alpha("#000000", 0.5) });
      for (const tg of tgts) {
        const tr = (2 * tg.r) / C0;
        if (S.t >= tr) label(ctx, `${num(tr * 1e6, 4)} µs`, P.X(tr * 1e6), P.Y(clamp(snr(tg.r, tg.rcs), 0, 50)) - 14, { align: "center", color: T.scopeFg, bg: alpha("#000000", 0.6), bounds: w });
      }
      clock.textContent = `Sweep at ${num(Math.min(S.t, T_MAX) * 1e6, 3)} µs after transmit · the pulse has travelled ${km(Math.min(S.t, T_MAX) * C0, 3)} so far`;
    }

    // ---- loop
    const anim = api.track(animate((dt) => {
      const before = S.t;
      S.t += (dt / S.speed) * 1e-3;
      for (const tg of targets()) { const tr = (2 * tg.r) / C0; if (before < tr && S.t >= tr) { S.echoes++; changed(); } }
      if (S.t > T_MAX * 1.08) { if (S.auto) fire(); else { S.t = T_MAX * 1.08; anim.pause(); } }
      side.redraw(); scope.redraw();
    }, { target: scope.canvas, playing: !reducedMotion }));
    playButton(side, anim);
    if (reducedMotion) { S.t = T_MAX; }

    guessRow.style.display = "none";
    void autoChk; void tour;
    changed();

    notes(root, "Background", [
      { title: "Why divide by two?", open: true, html:
        "<p>The clock runs while the pulse goes out <em>and</em> comes back, so the radar measures the round trip. Light covers about 300 m per microsecond, so each kilometre of range adds 2 × 1 km ÷ 300 m/µs ≈ <b>6.67 µs</b> of delay. Marine and air-traffic radars talk about the <b>radar mile</b>: 12.36 µs for one nautical mile, out and back.</p>" +
        "<p class=\"eq\"><i>R</i> = <span class=\"frac\"><span><i>c</i> Δ<i>t</i></span><span>2</span></span> &nbsp;&nbsp; <i>c</i> ≈ 3 × 10<sup>8</sup> m/s</p>" },
      { title: "What the A-scope shows", html:
        "<p>The A-scope is the oldest radar display: a trace that starts at the left every time the transmitter fires and moves right at a steady rate. Its height is the received signal, so echoes appear as spikes. Because the trace speed is fixed, horizontal position <em>is</em> range. The fuzzy &ldquo;grass&rdquo; along the bottom is receiver noise; a target is only useful if its echo stands well above it.</p>" },
      { title: "Radar cross-section (RCS)", html:
        "<p>RCS, written σ and measured in square metres, is how big a target <em>looks</em> to the radar. It is the area of a perfect isotropic reflector that would send back the same power. It depends on size, shape, material and viewing angle, which is why stealth aircraft are faceted and coated: a fighter can be 5 m² head-on in one design and 0.001 m² in another.</p>" +
        "<div class=\"tbl-wrap\"><table class=\"data\"><tr><th>Target</th><th>Typical RCS</th></tr><tr><td>Insect</td><td class=\"num\">0.00001 m²</td></tr><tr><td>Bird</td><td class=\"num\">0.01 m²</td></tr><tr><td>Person</td><td class=\"num\">1 m²</td></tr><tr><td>Small fighter</td><td class=\"num\">2–5 m²</td></tr><tr><td>Car</td><td class=\"num\">100 m²</td></tr><tr><td>Airliner</td><td class=\"num\">20–100 m²</td></tr><tr><td>Ship</td><td class=\"num\">10,000+ m²</td></tr></table></div>" },
      { title: "Monostatic, bistatic and secondary radar", html:
        "<ul><li><b>Monostatic</b>: transmitter and receiver share one antenna, as here. The radar switches between talking and listening, which is why it is deaf while it transmits.</li>" +
        "<li><b>Bistatic</b> and <b>multistatic</b>: the receiver is somewhere else. Range comes from the sum of the two path lengths, and the receiver can stay silent and hidden.</li>" +
        "<li><b>Secondary surveillance radar</b> (SSR) doesn't rely on echoes at all: it interrogates a transponder on the aircraft, which replies with its identity and altitude. Air traffic control uses both kinds together.</li></ul>" },
      { title: "A little history", html:
        "<p>Christian Hülsmeyer's 1904 &ldquo;telemobiloscope&rdquo; detected ships in fog. In 1935 Robert Watson-Watt and Arnold Wilkins showed that a BBC transmitter's echo off a bomber could be seen, which led to Britain's Chain Home stations. The cavity magnetron (1940) made compact microwave radar possible, and with it airborne radar, weather radar and, by accident, the microwave oven.</p>" },
    ]);

    api.quiz(root, [
      { q: "An echo comes back 200 µs after the pulse was sent. How far away is the target?", options: ["60 km", "30 km", "15 km", "120 km"], answer: 1, why: "R = c·Δt/2 = 3×10⁸ × 200×10⁻⁶ / 2 = 30 km. Forgetting the ÷2 gives 60 km." },
      { q: "Why is there a large spike at the very start of every A-scope trace?", options: ["A very close target", "Leakage of the radar's own transmitted pulse into the receiver", "Ground clutter far away", "The radar's clock resetting"], answer: 1, why: "The receiver is right next to a transmitter putting out kilowatts or megawatts, so it sees its own pulse. It is protected (blanked) during that time, which is why radars are blind very close in." },
      { q: "A target moves from 20 km to 40 km. Roughly how much weaker is its echo?", options: ["Half as strong", "A quarter as strong", "One-sixteenth as strong", "No change"], answer: 2, why: "The echo falls as 1/R⁴: 2⁴ = 16, about −12 dB. Lesson 3 derives this." },
    ]);
  },
};
