// Radar Lab shell: lesson registry, hash router, progress, and the shared teaching widgets
// (guided steps, auto-checked challenges, quizzes) that lessons build with.
import { h, canvasView, animate, theme, alpha, TAU, rng, reducedMotion } from "./ui.js";

// Every app on mitchyc24.github.io shares one origin, so storage keys carry this app's id.
const APP_ID = "radar-lab";
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`${APP_ID}.${key}`); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`${APP_ID}.${key}`, JSON.stringify(value)); } catch { /* private mode or full */ }
  },
};

// ---------------------------------------------------------------- lessons

export const LESSONS = [
  { id: "basics", group: "Foundations", title: "How radar works", blurb: "Send a pulse, time the echo, find the range. Drag a target and watch the A-scope." },
  { id: "pulses", group: "Foundations", title: "Pulse width, PRI & PRF", blurb: "Range resolution, blind range, unambiguous range and duty cycle on a live pulse train." },
  { id: "equation", group: "Foundations", title: "The radar equation", blurb: "Why echoes fade as 1/R⁴, and how power, gain, wavelength and RCS buy back range." },
  { id: "frequency", group: "Signals", title: "Frequencies & bands", blurb: "From HF to W-band: wavelength, beamwidth, weather and what each band is good for." },
  { id: "doppler", group: "Signals", title: "Doppler & velocity", blurb: "Moving targets shift the echo frequency. Meet blind speeds and velocity ambiguity." },
  { id: "modulation", group: "Signals", title: "Modulation & pulse compression", blurb: "Chirps, Barker codes and FMCW: long pulses with short-pulse resolution." },
  { id: "hopping", group: "Signals", title: "Frequency hopping & agility", blurb: "Hop across the band to dodge a jammer. Compare fixed, stepped and random hopping." },
  { id: "propagation", group: "The world", title: "Propagation", blurb: "Earth curvature, refraction and ducting, multipath lobes, rain and the atmosphere." },
  { id: "detection", group: "The world", title: "Noise, clutter & detection", blurb: "Set a threshold, trade detections for false alarms, and let CFAR adapt to clutter." },
  { id: "dish", group: "Antennas", title: "Parabolic antennas", blurb: "A dish turns a feed's spherical wave into a pencil beam. Size, taper, sidelobes and focus." },
  { id: "arrays", group: "Antennas", title: "Electronically steered arrays", blurb: "Steer a beam with phase alone. Element spacing, grating lobes, tapers and scan loss." },
  { id: "scans", group: "Antennas", title: "Scan patterns", blurb: "Circular, sector, raster, helical, conical and ESA scheduling. Hits per scan and revisit time." },
  { id: "console", group: "Put it together", title: "Radar operator sandbox", blurb: "Run a full search radar on a PPI. Tune it to find every aircraft in the airspace." },
];
LESSONS.forEach((l, i) => { l.n = i + 1; });
const byId = Object.fromEntries(LESSONS.map((l) => [l.id, l]));

// ---------------------------------------------------------------- progress

function progress() { return store.get("progress", {}); }
function saveProgress(p) { store.set("progress", p); renderNav(); }
function lessonProgress(id) {
  const p = progress()[id] || {};
  const ch = (p.ch || []).length, chTotal = p.chTotal || 0;
  const q = Object.values(p.q || {}).filter(Boolean).length, qTotal = p.qTotal || 0;
  const total = chTotal + qTotal;
  return { visited: !!p.visited, ch, chTotal, q, qTotal, frac: total ? (ch + q) / total : 0, done: total > 0 && ch + q >= total };
}
function patchProgress(id, fn) {
  const all = progress();
  all[id] = all[id] || {};
  fn(all[id]);
  saveProgress(all);
}

// ---------------------------------------------------------------- shell

const view = document.getElementById("view");
const nav = document.getElementById("nav");
const menuBtn = document.getElementById("menu-btn");

function renderNav() {
  const current = location.hash.replace(/^#\/?/, "");
  const list = h("ol");
  let lastGroup = "";
  for (const l of LESSONS) {
    if (l.group !== lastGroup) { list.append(h("li", { class: "group" }, l.group)); lastGroup = l.group; }
    const pr = lessonProgress(l.id);
    list.append(h("li", null, h("a", { href: `#${l.id}`, class: pr.done ? "done" : null, "aria-current": current === l.id ? "page" : null },
      h("span", { class: "n", "aria-hidden": "true" }, h("span", null, l.n)), l.title, pr.done ? h("span", { class: "sr-only" }, " (complete)") : null)));
  }
  nav.replaceChildren(h("a", { href: "#", "aria-current": current === "" ? "page" : null, style: { marginBottom: "8px" } }, h("span", { class: "n", "aria-hidden": "true" }, "◎"), "Overview"), list);
}

function setMenu(open) {
  nav.classList.toggle("open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.innerHTML = open ? "✕ Close" : "☰ Lessons";
}
menuBtn.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

// ---------------------------------------------------------------- router

let cleanups = [];
let routeToken = 0;

function unmount() {
  for (const c of cleanups.splice(0)) {
    try { typeof c === "function" ? c() : c?.destroy?.(); } catch (err) { console.error(err); }
  }
}

async function route() {
  const token = ++routeToken;
  const id = location.hash.replace(/^#\/?/, "");
  unmount();
  renderNav();
  setMenu(false);
  window.scrollTo(0, 0);
  if (!id || !byId[id]) {
    document.title = "Radar Lab";
    renderHome();
    return;
  }
  const meta = byId[id];
  document.title = `${meta.title} · Radar Lab`;
  view.replaceChildren(h("p", { class: "loading" }, "Loading lesson…"));
  let mod;
  try {
    mod = await import(`./lessons/${id}.js`);
  } catch (err) {
    console.error(err);
    if (token === routeToken) view.replaceChildren(h("div", { class: "status bad" }, h("strong", null, "This lesson failed to load."), String(err.message || err)));
    return;
  }
  if (token !== routeToken) return;
  const root = h("article", { class: "lesson" });
  root.append(h("header", null,
    h("p", { class: "kicker" }, `Lesson ${meta.n} of ${LESSONS.length} · ${meta.group}`),
    h("h1", null, meta.title)));
  view.replaceChildren(root);
  patchProgress(id, (p) => { p.visited = true; });
  const api = makeApi(meta);
  try {
    const ret = mod.default.mount(root, api);
    if (ret) cleanups.push(ret);
  } catch (err) {
    console.error(err);
    root.append(h("div", { class: "status bad" }, h("strong", null, "Something went wrong in this lesson."), String(err.message || err)));
  }
  root.append(pager(meta));
  view.focus({ preventScroll: true });
}

function pager(meta) {
  const prev = LESSONS[meta.n - 2], next = LESSONS[meta.n];
  return h("nav", { class: "pager", "aria-label": "Lessons" },
    prev ? h("a", { href: `#${prev.id}` }, h("small", null, "← Previous"), prev.title) : h("a", { href: "#" }, h("small", null, "← Back to"), "Overview"),
    next ? h("a", { class: "next", href: `#${next.id}` }, h("small", null, "Next →"), next.title) : h("a", { class: "next", href: "#" }, h("small", null, "Finished!"), "Back to overview"));
}

window.addEventListener("hashchange", route);

// ---------------------------------------------------------------- lesson API

function makeApi(meta) {
  const id = meta.id;
  return {
    lesson: meta,
    /** Register something to tear down when the lesson closes: a function, or an object with destroy(). */
    track(x) { cleanups.push(x); return x; },
    /** Per-lesson storage (namespaced under radar-lab.<lesson>.<key>). */
    store: { get: (k, f) => store.get(`${id}.${k}`, f), set: (k, v) => store.set(`${id}.${k}`, v) },
    go(target) { location.hash = target; },
    steps: (parent, steps, o) => guidedSteps(parent, steps, o),
    challenges: (parent, items) => challenges(parent, id, items),
    quiz: (parent, qs) => quiz(parent, id, qs),
  };
}

/**
 * Guided tour. steps: [{ title, html, look?, apply?() }]. apply() runs when the reader moves to that step,
 * so a step can set up the simulation to show what it describes.
 */
function guidedSteps(parent, steps, o = {}) {
  const dots = h("ol", { class: "dots", "aria-label": "Tour steps" });
  const body = h("div", { class: "step-body", "aria-live": "polite" });
  const prev = h("button", { type: "button", class: "btn ghost small" }, "Back");
  const next = h("button", { type: "button", class: "btn small" }, "Next");
  const el = h("section", { class: "card steps-card" },
    h("div", { class: "steps-top" }, h("h2", null, o.title || "Guided tour"), dots), body, h("div", { class: "step-nav" }, prev, next));
  parent.append(el);
  let i = 0;
  const seen = new Set([0]);
  const buttons = steps.map((s, k) => {
    const b = h("button", { type: "button", "aria-label": `Step ${k + 1}: ${s.title}`, onclick: () => go(k) }, k + 1);
    dots.append(h("li", null, b));
    return b;
  });
  function paint() {
    const s = steps[i];
    body.innerHTML = `<h3>${s.title}</h3>${s.html}${s.look ? `<p class="look">👀 ${s.look}</p>` : ""}`;
    buttons.forEach((b, k) => { b.toggleAttribute("aria-current", k === i); if (k === i) b.setAttribute("aria-current", "step"); b.classList.toggle("seen", seen.has(k)); });
    prev.disabled = i === 0;
    next.textContent = i === steps.length - 1 ? "Done" : "Next";
    next.disabled = i === steps.length - 1;
  }
  function go(k) {
    i = Math.max(0, Math.min(steps.length - 1, k));
    seen.add(i);
    steps[i].apply?.();
    paint();
  }
  prev.addEventListener("click", () => go(i - 1));
  next.addEventListener("click", () => go(i + 1));
  paint();
  return { el, go, get index() { return i; } };
}

/**
 * Auto-checked challenges. items: [{ id, text, check(state) → bool }].
 * Call .update(state) whenever the simulation changes; ticked items stay ticked (saved in progress).
 */
function challenges(parent, lessonId, items) {
  const done = new Set(progress()[lessonId]?.ch || []);
  patchProgress(lessonId, (p) => { p.chTotal = items.length; p.ch = (p.ch || []).filter((c) => items.some((it) => it.id === c)); });
  const count = h("span", { class: "count" });
  const list = h("ol");
  const el = h("section", { class: "card challenges" }, h("div", { class: "card-head" }, h("h2", null, "Challenges"), count), list);
  const rows = items.map((it) => {
    const li = h("li", { class: done.has(it.id) ? "done" : null }, h("span", { class: "tick", "aria-hidden": "true" }), h("span", { html: it.text }));
    list.append(li);
    return [it, li];
  });
  const paintCount = () => { count.textContent = `${done.size} of ${items.length} done`; };
  paintCount();
  parent.append(el);
  return {
    el,
    update(state) {
      let changed = false;
      for (const [it, li] of rows) {
        if (done.has(it.id)) continue;
        let ok = false;
        try { ok = !!it.check(state); } catch { ok = false; }
        if (ok) { done.add(it.id); li.classList.add("done", "just"); changed = true; }
      }
      if (changed) { paintCount(); patchProgress(lessonId, (p) => { p.ch = [...done]; }); }
    },
  };
}

/** Multiple-choice check. qs: [{ q, options: [..], answer: index, why }]. First answer counts. */
function quiz(parent, lessonId, qs) {
  patchProgress(lessonId, (p) => { p.qTotal = qs.length; });
  const el = h("section", { class: "card quiz" });
  const score = h("span", { class: "score" });
  el.append(h("div", { class: "card-head" }, h("h2", null, "Check yourself"), score));
  const saved = () => progress()[lessonId]?.q || {};
  const paintScore = () => {
    const s = saved();
    const answered = Object.keys(s).length;
    score.textContent = answered ? `${Object.values(s).filter(Boolean).length} of ${qs.length} right` : `${qs.length} questions`;
  };
  qs.forEach((item, qi) => {
    const why = h("p", { class: "why", hidden: true, html: item.why || "" });
    const opts = h("div", { class: "opts" });
    const buttons = item.options.map((o, oi) => {
      const b = h("button", { type: "button", html: o, onclick: () => answer(oi) });
      opts.append(b);
      return b;
    });
    function reveal(chosen) {
      buttons.forEach((b, oi) => {
        b.disabled = true;
        if (oi === item.answer) b.classList.add("right");
        else if (oi === chosen) b.classList.add("wrong");
      });
      why.hidden = !item.why;
    }
    function answer(oi) {
      reveal(oi);
      patchProgress(lessonId, (p) => { p.q = p.q || {}; if (!(qi in p.q)) p.q[qi] = oi === item.answer; });
      paintScore();
    }
    const prior = saved()[qi];
    el.append(h("div", { class: "q" }, h("p", { html: `${qi + 1}. ${item.q}` }), opts, why));
    if (prior !== undefined) reveal(prior ? item.answer : -1);
  });
  const reset = h("button", { type: "button", class: "btn ghost small", style: { marginTop: "10px" } }, "Reset quiz");
  reset.addEventListener("click", () => {
    patchProgress(lessonId, (p) => { p.q = {}; });
    const fresh = quiz(h("div"), lessonId, qs);
    el.replaceWith(fresh.el);
  });
  el.append(reset);
  paintScore();
  parent.append(el);
  return { el };
}

// ---------------------------------------------------------------- home

function renderHome() {
  const scopeBox = h("div", { class: "hero-scope" });
  const all = LESSONS.map((l) => lessonProgress(l.id));
  const overall = all.reduce((s, p) => s + p.frac, 0) / LESSONS.length;
  const firstUnfinished = LESSONS.find((l, i) => !all[i].done) || LESSONS[0];
  const startedAny = all.some((p) => p.visited);
  const meter = h("div", { class: "meter", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(overall * 100), "aria-label": "Course progress" }, h("span", { style: { width: `${overall * 100}%` } }));

  const hero = h("section", { class: "hero" },
    h("div", null,
      h("p", { class: "kicker" }, "Interactive course"),
      h("h1", null, "Radar Lab"),
      h("p", { class: "lede" }, "Learn how radar finds things by playing with one. Thirteen hands-on simulations take you from a single echo to pulse trains, the radar equation, Doppler, chirps, frequency hopping, propagation, dishes, phased arrays and scan patterns."),
      h("div", { class: "btn-row" },
        h("a", { class: "btn", href: `#${startedAny ? firstUnfinished.id : "basics"}` }, startedAny ? `Continue: ${firstUnfinished.title}` : "Start with lesson 1"),
        h("a", { class: "btn ghost", href: "#console" }, "Jump to the sandbox")),
      startedAny ? h("div", { style: { maxWidth: "380px", marginTop: "10px" } }, meter, h("span", { class: "small muted" }, `${Math.round(overall * 100)} % of challenges and quizzes complete`)) : null),
    scopeBox);

  const sections = [];
  let current = null;
  for (const l of LESSONS) {
    if (!current || current.group !== l.group) { current = { group: l.group, items: [] }; sections.push(current); }
    current.items.push(l);
  }
  const body = sections.map((s) => h("section", { class: "home-section" }, h("h2", null, s.group),
    h("ul", { class: "lesson-grid" }, s.items.map((l) => {
      const p = lessonProgress(l.id);
      const progText = p.done ? "✓ Complete"
        : p.visited && (p.chTotal || p.qTotal) ? `${p.ch}/${p.chTotal} challenges · ${p.q}/${p.qTotal} quiz`
        : p.visited ? "Started" : "Not started";
      return h("li", null, h("a", { href: `#${l.id}`, class: p.done ? "done" : null },
        h("span", { class: "num" }, `Lesson ${l.n}`), h("strong", null, l.title), h("span", { class: "desc" }, l.blurb), h("span", { class: "prog" }, progText)));
    }))));

  const resetBtn = startedAny ? h("button", { type: "button", class: "btn ghost small", style: { marginTop: "28px" } }, "Reset all progress") : null;
  resetBtn?.addEventListener("click", () => {
    if (!confirm("Clear every challenge tick and quiz answer?")) return;
    store.set("progress", {});
    route();
  });

  view.replaceChildren(hero, ...body,
    h("p", { class: "small muted", style: { marginTop: "28px", maxWidth: "75ch" } },
      "Numbers in the simulations use real formulas with representative values. They are for learning, not for designing a real system."),
    resetBtn || "");
  heroScope(scopeBox);
}

/** Decorative PPI on the home page: a sweep that paints blips as it passes them. */
function heroScope(parent) {
  const R = rng(7);
  const blips = Array.from({ length: 9 }, () => ({ a: R() * TAU, r: 0.25 + R() * 0.68, v: (R() - 0.5) * 0.02, heading: R() * TAU, lit: -10 }));
  let sweep = 0;
  const v = canvasView(parent, { aspect: 1, minHeight: 240, maxHeight: 420, label: "Animated radar display sweeping round and lighting up aircraft", draw: paint });
  cleanups.push(v);
  function paint(ctx, w, hh) {
    const T = theme();
    const cx = w / 2, cy = hh / 2, rad = Math.min(w, hh) / 2 - 6;
    ctx.fillStyle = T.scopeBg;
    ctx.beginPath(); ctx.arc(cx, cy, rad + 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = T.scopeGrid; ctx.lineWidth = 1;
    for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(cx, cy, (rad * k) / 4, 0, TAU); ctx.stroke(); }
    for (let k = 0; k < 12; k++) { const a = (k * TAU) / 12; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + rad * Math.sin(a), cy - rad * Math.cos(a)); ctx.stroke(); }
    // sweep wedge with a fading tail
    for (let k = 0; k < 40; k++) {
      const a0 = sweep - (k + 1) * 0.02, a1 = sweep - k * 0.02;
      ctx.fillStyle = alpha(T.scopeFg, 0.22 * (1 - k / 40));
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rad, a0 - Math.PI / 2, a1 - Math.PI / 2); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = T.scopeFg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + rad * Math.sin(sweep), cy - rad * Math.cos(sweep)); ctx.stroke();
    for (const b of blips) {
      const age = (sweep - b.lit + TAU * 4) % TAU;
      const glow = Math.max(0, 1 - age / TAU);
      if (glow <= 0) continue;
      const x = cx + b.r * rad * Math.sin(b.a), y = cy - b.r * rad * Math.cos(b.a);
      ctx.fillStyle = alpha(T.scopeFg, glow);
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
    }
  }
  const anim = animate((dt) => {
    const prev = sweep;
    sweep = (sweep + dt * 1.3) % TAU;
    for (const b of blips) {
      b.a += b.v * dt; b.r = Math.max(0.15, Math.min(0.95, b.r + Math.cos(b.heading) * dt * 0.01));
      const ba = ((b.a % TAU) + TAU) % TAU;
      const crossed = prev <= sweep ? ba > prev && ba <= sweep : ba > prev || ba <= sweep;
      if (crossed) b.lit = sweep;
    }
    v.redraw();
  }, { target: v.canvas, playing: !reducedMotion });
  cleanups.push(anim);
  if (reducedMotion) { blips.forEach((b) => { b.lit = b.a; }); sweep = 0.4; v.redraw(); }
}

route();
