// Shared helpers for Radar Lab lessons: DOM building, controls, canvases, animation, units and plots.
// Every lesson imports from here so they look and behave alike.

// ---------------------------------------------------------------- physics constants

export const C0 = 299792458;          // speed of light, m/s
export const KB = 1.380649e-23;       // Boltzmann constant, J/K
export const T0 = 290;                // reference noise temperature, K
export const RE = 6371e3;             // mean Earth radius, m

export const db = (x) => 10 * Math.log10(x);
export const undb = (d) => Math.pow(10, d / 10);
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
export const TAU = Math.PI * 2;

export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- DOM

/**
 * h("div", { class: "x", onclick: fn, html: "<b>hi</b>" }, child, "text", [more])
 * Props: class, html, text, style (object or string), on<event> (function), anything else becomes an attribute
 * (true → empty attribute, false/null → skipped).
 */
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "text") e.textContent = v;
      else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

/** A card with an optional heading and sub-heading. Returns the card element; append content to it. */
export function card(parent, title, sub) {
  const c = h("section", { class: "card" });
  if (title) c.append(h("div", { class: "card-head" }, h("h2", { html: title }), sub ? h("span", { class: "sub", html: sub }) : null));
  parent?.append(c);
  return c;
}

/** Two-column lab grid: `main` for simulations, `side` for controls (sticky on wide screens). */
export function labGrid(parent) {
  const main = h("div", { class: "lab-main" });
  const side = h("div", { class: "lab-side" });
  const el = h("div", { class: "lab" }, main, side);
  parent.append(el);
  return { el, main, side };
}

/** A titled group inside a controls card. */
export function group(parent, title) {
  const g = h("div", { class: "ctl-group" }, title ? h("h3", { html: title }) : null);
  parent.append(g);
  return g;
}

/** Background reading: a list of collapsible sections. items: [{ title, html, open }] */
export function notes(parent, heading, items) {
  const wrap = h("section", { class: "notes" }, heading ? h("h2", { html: heading }) : null);
  for (const it of items) {
    wrap.append(h("details", { open: !!it.open }, h("summary", { html: it.title }), h("div", { html: it.html })));
  }
  parent.append(wrap);
  return wrap;
}

// ---------------------------------------------------------------- number formatting

const PREFIX = [[1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"], [1e-15, "f"]];

/** Round to `digits` significant figures and drop trailing zeros. */
export function num(x, digits = 3) {
  if (!isFinite(x)) return x > 0 ? "∞" : x < 0 ? "−∞" : "–";
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e15 || a < 1e-4) return x.toExponential(digits - 1).replace("e", "×10^").replace("+", "");
  let s = Number(x.toPrecision(digits)).toString();
  if (Math.abs(Number(s)) >= 1e4) s = Number(s).toLocaleString("en-US");
  return s.replace("-", "−");
}

/**
 * SI-prefixed value: si(1.5e-6, "s") → "1.5 µs". For metres the largest prefix is k (no "Mm").
 * opts.max / opts.min limit the prefix range, e.g. { max: 1 } to never prefix.
 */
export function si(x, unit = "", digits = 3, opts = {}) {
  if (!isFinite(x)) return `${num(x)} ${unit}`.trim();
  const max = opts.max ?? (unit === "m" ? 1e3 : 1e12);
  const min = opts.min ?? 1e-15;
  const allowed = PREFIX.filter(([v]) => v <= max && v >= min);
  const a = Math.abs(x);
  const p = a === 0 ? [1, ""] : allowed.find(([v]) => a >= v * 0.9995) || allowed.at(-1);
  return `${num(x / p[0], digits)} ${p[1]}${unit}`.trim();
}

export const fmtDb = (d, unit = "dB", digits = 1) => (isFinite(d) ? `${d >= 0 ? "" : "−"}${Math.abs(d).toFixed(digits)} ${unit}` : `${num(d)} ${unit}`);
export const km = (m, digits = 3) => (Math.abs(m) >= 1000 ? `${num(m / 1000, digits)} km` : `${num(m, digits)} m`);
export const pct = (x, digits = 2) => `${num(x * 100, digits)} %`;

// ---------------------------------------------------------------- controls

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

/**
 * Range slider with a live value readout.
 * slider(parent, { label, min, max, step, value, log, format(v) → string, help, onInput(v) })
 * log: true maps the track logarithmically between min and max (both > 0).
 * Returns { el, input, get value, set value(v) (does not fire onInput), set(v) (fires), setLabel(html) }.
 */
export function slider(parent, o) {
  const id = nextId("s");
  const steps = 1000;
  const log = !!o.log;
  const fmt = o.format || ((v) => num(v));
  const out = h("output", { for: id });
  const lab = h("label", { for: id, html: o.label });
  const input = h("input", { id, type: "range", min: log ? 0 : o.min, max: log ? steps : o.max, step: log ? 1 : o.step ?? "any" });
  const el = h("div", { class: "ctl" }, h("div", { class: "ctl-top" }, lab, out), input, o.help ? h("div", { class: "help", html: o.help }) : null);
  const toPos = (v) => (log ? Math.round((Math.log(v / o.min) / Math.log(o.max / o.min)) * steps) : v);
  const fromPos = (p) => {
    if (!log) return Number(p);
    let v = o.min * Math.pow(o.max / o.min, Number(p) / steps);
    if (o.step) v = Math.round(v / o.step) * o.step;
    return clamp(v, o.min, o.max);
  };
  let value = o.value;
  const show = () => { out.textContent = fmt(value); input.setAttribute("aria-valuetext", out.textContent); };
  input.value = toPos(value);
  show();
  input.addEventListener("input", () => { value = fromPos(input.value); show(); o.onInput?.(value); });
  parent?.append(el);
  return {
    el, input,
    get value() { return value; },
    set value(v) { value = clamp(v, o.min, o.max); input.value = toPos(value); show(); },
    set(v) { this.value = v; o.onInput?.(value); },
    setLabel(html) { lab.innerHTML = html; },
    refresh: show,
  };
}

/**
 * Segmented single choice. options: [[value, labelHtml], ...]
 * Returns { el, get value, set value(v) (silent), set(v) (fires onChange) }.
 */
export function choice(parent, o) {
  const el = h("div");
  if (o.label) el.append(h("div", { class: "seg-label", html: o.label }));
  const seg = h("div", { class: "seg", role: "radiogroup", "aria-label": o.aria || (o.label || "").replace(/<[^>]+>/g, "") });
  el.append(seg);
  let value = o.value;
  const buttons = o.options.map(([v, label]) => {
    const b = h("button", { type: "button", role: "radio", html: label, onclick: () => { api.set(v); } });
    b.dataset.v = String(v);
    seg.append(b);
    return [v, b];
  });
  const paint = () => buttons.forEach(([v, b]) => b.setAttribute("aria-checked", String(v === value)));
  paint();
  seg.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const i = buttons.findIndex(([v]) => v === value);
    const d = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
    const [nv, nb] = buttons[(i + d + buttons.length) % buttons.length];
    api.set(nv); nb.focus();
  });
  parent?.append(el);
  const api = {
    el,
    get value() { return value; },
    set value(v) { value = v; paint(); },
    set(v) { value = v; paint(); o.onChange?.(v); },
  };
  return api;
}

/** Checkbox. Returns { el, input, get checked, set checked(v) (silent), set(v) (fires) }. */
export function check(parent, o) {
  const input = h("input", { type: "checkbox" });
  input.checked = !!o.checked;
  const el = h("label", { class: "chk" }, input, h("span", { html: o.label }));
  input.addEventListener("change", () => o.onChange?.(input.checked));
  parent?.append(el);
  return {
    el, input,
    get checked() { return input.checked; },
    set checked(v) { input.checked = !!v; },
    set(v) { input.checked = !!v; o.onChange?.(input.checked); },
  };
}

/** Dropdown. options: [[value, label], ...] */
export function select(parent, o) {
  const id = nextId("sel");
  const sel = h("select", { id });
  for (const [v, label] of o.options) sel.append(h("option", { value: String(v) }, label));
  sel.value = String(o.value);
  const el = h("div", { class: "ctl" }, o.label ? h("div", { class: "ctl-top" }, h("label", { for: id, html: o.label })) : null, sel);
  const find = (s) => o.options.find(([v]) => String(v) === s)?.[0];
  sel.addEventListener("change", () => o.onChange?.(find(sel.value)));
  parent?.append(el);
  return { el, select: sel, get value() { return find(sel.value); }, set value(v) { sel.value = String(v); }, set(v) { sel.value = String(v); o.onChange?.(find(sel.value)); } };
}

export function button(parent, label, onClick, cls = "") {
  const b = h("button", { type: "button", class: `btn ${cls}`.trim(), html: label, onclick: onClick });
  parent?.append(b);
  return b;
}

/** Key/value readout. ro.set([[label, value, cls?], ...]) — cls one of ok | warn | bad. */
export function readout(parent) {
  const dl = h("dl", { class: "readout" });
  parent?.append(dl);
  let sig = "";
  return {
    el: dl,
    set(rows) {
      const s = rows.map((r) => r.join("\u0001")).join("\u0002");
      if (s === sig) return;
      sig = s;
      dl.replaceChildren(...rows.flatMap(([k, v, cls]) => [h("dt", { html: k }), h("dd", { class: cls || null, html: v })]));
    },
  };
}

/** A coloured status box. st.set(kind, titleHtml, bodyHtml) — kind ok | warn | bad | info. */
export function status(parent) {
  const el = h("div", { class: "status info", role: "status" });
  parent?.append(el);
  let sig = "";
  return {
    el,
    set(kind, title, body = "") {
      const s = kind + title + body;
      if (s === sig) return;
      sig = s;
      el.className = `status ${kind}`;
      el.innerHTML = `<strong>${title}</strong>${body}`;
    },
    hide(v = true) { el.hidden = v; },
  };
}

export function legend(parent, items) {
  const el = h("div", { class: "legend" }, items.map(([color, label]) => h("span", null, h("span", { class: "sw", style: { background: color } }), label)));
  parent?.append(el);
  return el;
}

// ---------------------------------------------------------------- theme colours

let themeCache = null;
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
const themeListeners = new Set();
darkMQ.addEventListener("change", () => { themeCache = null; themeListeners.forEach((f) => f()); });

/** Current colour tokens from style.css as an object: theme().accent, theme().scopeFg, ... */
export function theme() {
  if (themeCache) return themeCache;
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(`--${n}`).trim();
  themeCache = {
    dark: darkMQ.matches,
    bg: v("bg"), surface: v("surface"), surface2: v("surface-2"), ink: v("ink"), muted: v("muted"), line: v("line"),
    accent: v("accent"), accentSoft: v("accent-soft"), tx: v("tx"), rx: v("rx"), tgt: v("tgt"), c4: v("c4"), c5: v("c5"),
    grid: v("grid"), axis: v("axis"), ok: v("ok"), warn: v("warn"), bad: v("bad"),
    scopeBg: v("scope-bg"), scopeGrid: v("scope-grid"), scopeFg: v("scope-fg"), scopeDim: v("scope-dim"), scopeText: v("scope-text"),
    font: "12px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontB: "600 12px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "11px ui-monospace, SFMono-Regular, Menlo, monospace",
  };
  return themeCache;
}
export function onThemeChange(fn) { themeListeners.add(fn); return () => themeListeners.delete(fn); }

/** Colour with alpha: alpha("#3DFF8F", 0.3) → "rgba(61,255,143,0.3)". Accepts #rgb and #rrggbb. */
export function alpha(hex, a) {
  let s = hex.replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------------------------------------------------------- canvases

/**
 * A responsive, HiDPI canvas. Height = clamp(width / aspect, minHeight, maxHeight) unless `height` is fixed.
 * view = canvasView(parent, { aspect, minHeight, maxHeight, height, draw(ctx, w, h), free })
 * free: true sets touch-action:none (for canvases you drag in 2-D; pages can't scroll through them).
 * view.redraw() draws now; view.w / view.h are CSS pixels. Redraws on resize and theme change.
 * The first draw happens in a microtask, after the synchronous code that created the view has finished.
 * view.destroy() disconnects observers.
 */
export function canvasView(parent, o = {}) {
  const canvas = h("canvas", { class: o.free ? "free" : null, role: o.label ? "img" : null, "aria-label": o.label || null });
  const wrap = h("div", { class: "canvas-wrap" }, canvas);
  parent.append(wrap);
  const ctx = canvas.getContext("2d");
  const view = { canvas, ctx, wrap, w: 0, h: 0, dpr: 1, draw: o.draw };
  const resize = (paint = true) => {
    const w = Math.max(1, Math.round(wrap.clientWidth));
    const hh = o.height ? (typeof o.height === "function" ? o.height(w) : o.height)
      : Math.round(clamp(w / (o.aspect || 16 / 9), o.minHeight ?? 200, o.maxHeight ?? 520));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (w === view.w && hh === view.h && dpr === view.dpr) return;
    view.w = w; view.h = hh; view.dpr = dpr;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr);
    canvas.style.height = `${hh}px`;
    if (paint) view.redraw();
  };
  view.redraw = () => {
    if (!view.w) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    view.draw?.(ctx, view.w, view.h);
  };
  const ro = new ResizeObserver(() => resize());
  ro.observe(wrap);
  const off = onThemeChange(() => view.redraw());
  view.destroy = () => { ro.disconnect(); off(); };
  // Size now so view.w / view.h are usable straight away, but draw after the lesson's mount() has finished,
  // so draw() can use controls and variables declared later in mount().
  resize(false);
  queueMicrotask(() => view.redraw());
  return view;
}

/**
 * Pointer dragging on a canvas in CSS-pixel coordinates.
 * drag(view, { hit(x, y) → bool (start a drag here?), down(x, y), move(x, y), up(), hover(x, y) })
 * If hit is omitted every press starts a drag. Shows a grab cursor when hovering a hit area.
 */
export function drag(view, o) {
  const c = view.canvas;
  let active = false;
  const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onDown = (e) => {
    const [x, y] = pos(e);
    if (o.hit && !o.hit(x, y)) return;
    active = true;
    c.setPointerCapture(e.pointerId);
    c.classList.add("grabbing");
    o.down?.(x, y);
    o.move?.(x, y);
    e.preventDefault();
  };
  const onMove = (e) => {
    const [x, y] = pos(e);
    if (active) { o.move?.(x, y); return; }
    if (o.hit) c.classList.toggle("grab", !!o.hit(x, y));
    o.hover?.(x, y);
  };
  const onUp = () => { if (!active) return; active = false; c.classList.remove("grabbing"); o.up?.(); };
  c.addEventListener("pointerdown", onDown);
  c.addEventListener("pointermove", onMove);
  c.addEventListener("pointerup", onUp);
  c.addEventListener("pointercancel", onUp);
  c.addEventListener("pointerleave", () => o.leave?.());
  if (!o.hit) c.classList.add("grab");
  return { get active() { return active; } };
}

// ---------------------------------------------------------------- animation

/**
 * Animation loop that only runs while the page is visible and `target` (an element) is on screen.
 * anim = animate(fn(dt, t), { target, playing }) — dt and t in seconds (dt capped at 0.1 s).
 * anim.play(), anim.pause(), anim.toggle(), anim.playing, anim.destroy().
 * playButton(view, anim) adds a ▶/❚❚ button in the canvas corner.
 */
export function animate(fn, o = {}) {
  let raf = 0, last = 0, t = 0, playing = o.playing ?? true, onScreen = true, destroyed = false;
  const listeners = new Set();
  const frame = (now) => {
    raf = 0;
    if (!running()) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now; t += dt;
    fn(dt, t);
    raf = requestAnimationFrame(frame);
  };
  const running = () => playing && onScreen && !document.hidden && !destroyed;
  const kick = () => { if (running() && !raf) { last = 0; raf = requestAnimationFrame(frame); } };
  const io = o.target ? new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); kick(); }) : null;
  io?.observe(o.target);
  const vis = () => kick();
  document.addEventListener("visibilitychange", vis);
  const anim = {
    get playing() { return playing; },
    get t() { return t; },
    play() { playing = true; listeners.forEach((f) => f()); kick(); },
    pause() { playing = false; listeners.forEach((f) => f()); },
    toggle() { playing ? anim.pause() : anim.play(); },
    /** Run one frame with dt = 0, e.g. to repaint after a control change while paused. */
    step() { fn(0, t); },
    onChange(f) { listeners.add(f); },
    destroy() { destroyed = true; cancelAnimationFrame(raf); io?.disconnect(); document.removeEventListener("visibilitychange", vis); },
  };
  kick();
  return anim;
}

export function playButton(view, anim) {
  const b = h("button", { type: "button", class: "play" });
  const paint = () => { b.textContent = anim.playing ? "❚❚" : "▶"; b.setAttribute("aria-label", anim.playing ? "Pause animation" : "Play animation"); };
  b.addEventListener("click", () => anim.toggle());
  anim.onChange(paint);
  paint();
  view.wrap.append(b);
  return b;
}

// ---------------------------------------------------------------- 2-D plotting

/**
 * Simple x/y chart axes. Returns a mapper object for drawing data into the plot area.
 * const P = axes(ctx, w, h, { x: [min, max], y: [min, max], xlog, ylog, xlabel, ylabel,
 *                             xticks, yticks, xfmt, yfmt, pad: {l, r, t, b}, dark (scope colours), grid: true })
 * P.X(v) / P.Y(v) map data → pixels; P.l, P.r, P.t, P.b are the plot edges; P.clip() / P.unclip().
 */
export function axes(ctx, w, hgt, o) {
  const T = theme();
  const pad = { l: 52, r: 14, t: 12, b: 36, ...(o.pad || {}) };
  const l = pad.l, r = w - pad.r, t = pad.t, b = hgt - pad.b;
  const [x0, x1] = o.x, [y0, y1] = o.y;
  const fx = o.xlog ? (v) => Math.log10(v) : (v) => v;
  const fy = o.ylog ? (v) => Math.log10(v) : (v) => v;
  const X = (v) => l + ((fx(v) - fx(x0)) / (fx(x1) - fx(x0))) * (r - l);
  const Y = (v) => b - ((fy(v) - fy(y0)) / (fy(y1) - fy(y0))) * (b - t);
  const ink = o.dark ? T.scopeText : T.muted;
  const gridC = o.dark ? T.scopeGrid : T.grid;
  if (o.dark) { ctx.fillStyle = T.scopeBg; ctx.fillRect(0, 0, w, hgt); }
  const xt = o.xticks || ticks(x0, x1, Math.max(2, Math.floor((r - l) / 70)), o.xlog);
  const yt = o.yticks || ticks(y0, y1, Math.max(2, Math.floor((b - t) / 40)), o.ylog);
  const xf = o.xfmt || ((v) => num(v));
  const yf = o.yfmt || ((v) => num(v));
  ctx.lineWidth = 1;
  ctx.font = T.font;
  ctx.fillStyle = ink;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const v of xt) {
    const x = Math.round(X(v)) + 0.5;
    if (x < l - 1 || x > r + 1) continue;
    if (o.grid !== false) { ctx.strokeStyle = gridC; ctx.beginPath(); ctx.moveTo(x, t); ctx.lineTo(x, b); ctx.stroke(); }
    ctx.fillText(xf(v), x, b + 5);
  }
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (const v of yt) {
    const y = Math.round(Y(v)) + 0.5;
    if (y < t - 1 || y > b + 1) continue;
    if (o.grid !== false) { ctx.strokeStyle = gridC; ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(r, y); ctx.stroke(); }
    ctx.fillText(yf(v), l - 6, y);
  }
  ctx.strokeStyle = o.dark ? T.scopeDim : T.axis;
  ctx.beginPath(); ctx.moveTo(l + 0.5, t); ctx.lineTo(l + 0.5, b + 0.5); ctx.lineTo(r, b + 0.5); ctx.stroke();
  if (o.xlabel) { ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(o.xlabel, r, hgt - 2); }
  if (o.ylabel) { ctx.save(); ctx.translate(12, t + (b - t) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(o.ylabel, 0, 0); ctx.restore(); }
  return {
    X, Y, l, r, t, b,
    invX: (px) => { const f = fx(x0) + ((px - l) / (r - l)) * (fx(x1) - fx(x0)); return o.xlog ? 10 ** f : f; },
    invY: (py) => { const f = fy(y0) + ((b - py) / (b - t)) * (fy(y1) - fy(y0)); return o.ylog ? 10 ** f : f; },
    clip() { ctx.save(); ctx.beginPath(); ctx.rect(l, t - 1, r - l + 1, b - t + 2); ctx.clip(); },
    unclip() { ctx.restore(); },
  };
}

/** "Nice" tick values between a and b (about n of them). Log axes get decades. */
export function ticks(a, b, n = 5, log = false) {
  if (log) {
    const out = [];
    const lo = Math.floor(Math.log10(Math.min(a, b))), hi = Math.ceil(Math.log10(Math.max(a, b)));
    const stride = Math.max(1, Math.ceil((hi - lo) / Math.max(1, n)));
    for (let e = lo; e <= hi; e += stride) out.push(10 ** e);
    return out;
  }
  const span = Math.abs(b - a) || 1;
  const raw = span / Math.max(1, n);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const lo = Math.ceil(Math.min(a, b) / step) * step;
  const out = [];
  for (let v = lo; v <= Math.max(a, b) + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Stroke a polyline through points [[x, y], ...] (already in pixels). */
export function polyline(ctx, pts, color, width = 2, dash) {
  if (!pts.length) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round";
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();
}

/** Plot y = f(x) over the axes' x range with n samples. Non-finite values break the line. */
export function plotFn(ctx, P, f, x0, x1, color, width = 2, n = 300, opts = {}) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round";
  if (opts.dash) ctx.setLineDash(opts.dash);
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i <= n; i++) {
    const x = opts.xlog ? x0 * (x1 / x0) ** (i / n) : x0 + ((x1 - x0) * i) / n;
    const y = f(x);
    if (!isFinite(y)) { pen = false; continue; }
    const px = P.X(x), py = P.Y(y);
    pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    pen = true;
  }
  ctx.stroke();
  ctx.restore();
}

/** Text with a background pill, for labels on busy canvases. */
export function label(ctx, text, x, y, o = {}) {
  const T = theme();
  ctx.save();
  ctx.font = o.font || T.fontB;
  const w = ctx.measureText(text).width + 10, hh = 18;
  let bx = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
  const by = y - hh / 2;
  if (o.bounds) bx = clamp(bx, 2, o.bounds - w - 2);
  ctx.fillStyle = o.bg || alpha(T.dark ? "#000000" : "#ffffff", 0.78);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(bx, by, w, hh, 5) : ctx.rect(bx, by, w, hh);
  ctx.fill();
  ctx.fillStyle = o.color || T.ink;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(text, bx + 5, y + 0.5);
  ctx.restore();
  return w;
}

/** Arrow from (x0,y0) to (x1,y1). */
export function arrow(ctx, x0, y0, x1, y1, color, width = 2, head = 8) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(a - 0.4), y1 - head * Math.sin(a - 0.4));
  ctx.lineTo(x1 - head * Math.cos(a + 0.4), y1 - head * Math.sin(a + 0.4));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** Double-headed dimension arrow with a centred label. */
export function dimension(ctx, x0, y0, x1, y1, text, color) {
  arrow(ctx, (x0 + x1) / 2, (y0 + y1) / 2, x0, y0, color, 1.5, 7);
  arrow(ctx, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1, color, 1.5, 7);
  if (text) label(ctx, text, (x0 + x1) / 2, (y0 + y1) / 2 - 12, { align: "center", color });
}

// ---------------------------------------------------------------- signal helpers

/** Seeded PRNG (mulberry32) so simulations are repeatable. rng() → [0, 1). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample from a uniform rng (Box–Muller). */
export function gauss(r = Math.random) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r());
}

/**
 * In-place radix-2 complex FFT. re and im are Float64Arrays of the same power-of-two length.
 * inverse: true computes the inverse transform (scaled by 1/N).
 */
export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
