// Snowflake: the page. Shape properties with locks, a live preview of the print path, and the G-code download.
import { PROPS, DEFAULTS, randomize, sanitize } from "./flake.js";
import { PRINT_DEFAULTS, PRINT_LIMITS, MATERIALS, MACHINE, cleanSettings, layerPlan, layout, makeGcode } from "./gcode.js";

const APP_ID = "snowflake";
const $ = id => document.getElementById(id);
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`${APP_ID}.${key}`); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`${APP_ID}.${key}`, JSON.stringify(value)); } catch { /* private mode or full */ }
  },
};

const COLORS = [
  ["snow", "Snow white", "#F2F6FA"], ["ice", "Ice blue", "#A6DBF7"], ["silver", "Silver", "#B7C0CA"],
  ["gold", "Gold", "#E4C05C"], ["red", "Red", "#DC5A51"], ["pine", "Pine green", "#43A372"],
];
const SHORT = {            // property names in a shared link
  type: "t", radius: "r", weight: "w", branches: "b", angle: "a", reach: "l", profile: "p", detail: "d",
  second: "s", core: "c", coreSize: "cs", rings: "g", tips: "tp", tipSize: "ts", variation: "v", seed: "sd",
};

/* ---------- state ---------- */

const saved = store.get("state", null) || {};
let params = sanitize(saved.params);
let locks = { radius: true, ...(saved.locks || {}) };
let settings = cleanSettings(saved.settings);
let color = COLORS.some(c => c[0] === saved.color) ? saved.color : "snow";
readLink();

let past = [{ ...params }], at = 0;       // history of snowflakes for the back and forward buttons
let result = null;                         // what the engine last drew
let shownFor = "";                         // the request that produced it
let gcode = null;                          // G-code text and numbers for the current result
let traceT = 1, showEven = false, playing = 0;
let view = { cx: 0, cy: 0, scale: 1 };

function readLink() {
  const q = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (!q.has("t")) return;
  const from = {};
  for (const [key, short] of Object.entries(SHORT)) if (q.has(short)) from[key] = q.get(short);
  params = sanitize({ ...DEFAULTS, ...from });
  const patch = {};
  if (q.has("lw")) patch.lineWidth = q.get("lw");
  if (q.has("h")) patch.hanger = q.get("h") === "1";
  if (q.has("hh")) patch.hangerHole = q.get("hh");
  settings = cleanSettings({ ...settings, ...patch });
}
function linkHash() {
  const q = new URLSearchParams();
  for (const [key, short] of Object.entries(SHORT)) q.set(short, params[key]);
  q.set("lw", settings.lineWidth); q.set("h", settings.hanger ? 1 : 0); q.set("hh", settings.hangerHole);
  return q.toString();
}
const shareUrl = () => location.origin + location.pathname + "#" + linkHash();

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.set("state", { params, locks, settings, color });
    try { history.replaceState(null, "", "#" + linkHash()); } catch { /* sandboxed */ }
  }, 250);
}

/* ---------- the engine: a worker, or the page itself ---------- */

const engine = (() => {
  let worker = null, direct = null, busy = false, waiting = null, current = null, ready = false, seq = 0;
  const deliver = (req, res, error) => {
    busy = false;
    const next = waiting; waiting = null;
    if (next) run(next);                      // start the newest request before showing this one
    onResult(req, res, error);
  };
  async function fallback() {
    if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; }
    if (!direct) direct = import("./engine.js");
    const again = current; current = null; busy = false;
    if (again) run(again);
  }
  function run(req) {
    busy = true; current = req;
    if (worker) { worker.postMessage({ id: ++seq, req }); return; }
    (direct || (direct = import("./engine.js"))).then(mod => {
      setTimeout(() => {
        let res = null, error = null;
        try { res = mod.compute(req); } catch (e) { error = String((e && e.message) || e); }
        current = null; deliver(req, res, error);
      }, 0);
    }, e => { current = null; deliver(req, null, "Could not load the drawing engine: " + e.message); });
  }
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker.onmessage = e => {
      if (e.data.ready) { ready = true; return; }
      if (e.data.id !== seq) return;
      const req = current; current = null;
      deliver(req, e.data.ok ? e.data.res : null, e.data.ok ? null : e.data.error);
    };
    worker.onerror = e => { e.preventDefault(); fallback(); };
    setTimeout(() => { if (!ready && worker) fallback(); }, 5000);
  } catch { worker = null; }
  return { request(req) { if (busy) waiting = req; else run(req); }, get busy() { return busy; } };
})();

function requestOf() {
  return { params: { ...params }, lineWidth: settings.lineWidth, hanger: settings.hanger, hangerHole: settings.hangerHole };
}
let busyTimer = 0;
function rebuild() {
  engine.request(requestOf());
  clearTimeout(busyTimer);
  busyTimer = setTimeout(() => { if (engine.busy) $("busy").hidden = false; }, 250);
}
function onResult(req, res, error) {
  if (!engine.busy) { clearTimeout(busyTimer); $("busy").hidden = true; }
  if (error || !res || res.path.length < 2) {
    warn(error ? "Could not draw this snowflake: " + error : "Nothing to print with these settings. Try a larger radius or a finer line.");
    return;
  }
  for (const key of ["path", "pathB"]) {
    const pts = res[key], cum = new Float64Array(pts.length);
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    res[key + "Cum"] = cum;
  }
  result = res; shownFor = JSON.stringify(req);
  fit(); draw(); scheduleGcode();
}

/* ---------- property rows ---------- */

const LOCK_OPEN = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5V7.6a3.5 3.5 0 0 1 6.7-1.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const LOCK_SHUT = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2.2" fill="currentColor" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5V7.6a3.5 3.5 0 0 1 7 0v2.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const DIE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>';

function el(tag, attrs = {}, html = "") {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, v);
  if (html) node.innerHTML = html;
  return node;
}

function buildProps() {
  const host = $("props");
  for (const prop of PROPS) {
    const id = "p-" + prop.key;
    const row = el("div", { class: "row", "data-key": prop.key });
    const lock = el("button", { type: "button", class: "lock", "aria-pressed": "false" });
    lock.addEventListener("click", () => { locks[prop.key] = !locks[prop.key]; syncLocks(); save(); });
    const main = el("div", { class: "row-main" });
    const top = el("div", { class: "row-top" });
    const label = el("label", { for: id });
    label.textContent = prop.label;
    top.append(label);
    main.append(top);
    if (prop.kind === "range") {
      top.append(el("output", { for: id }));
      const input = el("input", { type: "range", id, min: prop.min, max: prop.max, step: prop.step });
      input.addEventListener("input", () => setParam(prop.key, Number(input.value)));
      main.append(input);
    } else if (prop.kind === "select") {
      const sel = el("select", { id });
      for (const [value, text] of prop.options) { const o = el("option", { value }); o.textContent = text; sel.append(o); }
      sel.addEventListener("change", () => setParam(prop.key, sel.value));
      main.append(sel);
    } else if (prop.kind === "choice") {
      label.removeAttribute("for"); label.id = id + "-label";
      const seg = el("div", { class: "seg", role: "radiogroup", "aria-labelledby": id + "-label" });
      for (const [value, text] of prop.options) {
        const b = el("button", { type: "button", role: "radio", "data-value": value });
        b.textContent = text;
        b.addEventListener("click", () => setParam(prop.key, value));
        seg.append(b);
      }
      seg.addEventListener("keydown", e => {         // arrow keys move the choice, as radio buttons do
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const i = prop.options.findIndex(o => o[0] === params[prop.key]);
        const next = prop.options[(i + step + prop.options.length) % prop.options.length][0];
        setParam(prop.key, next);
        seg.querySelector(`[data-value="${next}"]`).focus();
      });
      main.append(seg);
    } else {                                   // seed
      const wrap = el("div", { class: "seed" });
      const input = el("input", { type: "number", id, min: 0, max: 999999, step: 1, inputmode: "numeric" });
      input.addEventListener("change", () => setParam(prop.key, Number(input.value) || 0));
      const again = el("button", { type: "button", class: "btn square small", "aria-label": "New seed", title: "New seed" }, DIE);
      again.addEventListener("click", () => setParam("seed", Math.floor(Math.random() * 100000)));
      wrap.append(input, again);
      main.append(wrap);
    }
    row.append(lock, main);
    host.append(row);
  }
}

function syncProps() {
  for (const prop of PROPS) {
    const row = document.querySelector(`.row[data-key="${prop.key}"]`), v = params[prop.key];
    if (prop.kind === "range") {
      row.querySelector("input").value = v;
      row.querySelector("output").textContent = describe(prop, v);
    } else if (prop.kind === "select") row.querySelector("select").value = v;
    else if (prop.kind === "choice") {
      for (const b of row.querySelectorAll(".seg button")) {
        const on = String(v) === b.dataset.value;
        b.setAttribute("aria-checked", on); b.tabIndex = on ? 0 : -1;
      }
    } else row.querySelector("input").value = v;
  }
  const typeName = PROPS[0].options.find(o => o[0] === params.type)[1];
  $("title").textContent = `${typeName} · Ø ${params.radius * 2} mm`;
}
function describe(prop, v) {
  if (prop.key === "second") return v < 15 ? "None" : v >= 95 ? "12 arms" : v + "%";
  if (prop.key === "branches") return v === 0 ? "None" : v + " per side";
  if (prop.key === "rings") return v === 0 ? "None" : String(v);
  if (prop.key === "variation") return v === 0 ? "Perfect" : v + "%";
  return v + prop.unit;
}
function syncLocks() {
  for (const prop of PROPS) {
    const row = document.querySelector(`.row[data-key="${prop.key}"]`), on = !!locks[prop.key];
    const b = row.querySelector(".lock");
    row.classList.toggle("locked", on);
    b.setAttribute("aria-pressed", on);
    b.setAttribute("aria-label", `${on ? "Unlock" : "Lock"} ${prop.label}`);
    b.title = on ? "Locked: Randomize keeps this" : "Unlocked: Randomize changes this";
    b.innerHTML = on ? LOCK_SHUT : LOCK_OPEN;
  }
}

function setParam(key, value) {
  if (key === "type" && value !== params.type) {
    // A new type is a new family: re-roll whatever is not locked so the flake actually looks like one.
    params = sanitize(randomize({ ...params, type: value }, { ...locks, type: true }));
    remember();
  } else {
    params = sanitize({ ...params, [key]: value });
    past[at] = { ...params };
  }
  syncProps(); rebuild(); save();
}
function remember() {
  past = past.slice(0, at + 1);
  past.push({ ...params });
  if (past.length > 200) past.shift();
  at = past.length - 1;
  syncHistory();
}
function syncHistory() {
  $("back").disabled = at <= 0;
  $("fwd").disabled = at >= past.length - 1;
}
function go(step) {
  const next = at + step;
  if (next < 0 || next >= past.length) return;
  at = next; params = sanitize(past[at]);
  syncProps(); syncHistory(); rebuild(); save();
}
function roll() {
  const free = PROPS.filter(p => !locks[p.key]);
  if (!free.length) { toast("Everything is locked. Unlock a property to roll it."); return; }
  const usesSeed = p => p.variation > 0 || p.profile === "random";
  const next = sanitize(randomize(params, locks));
  const sameLook = PROPS.every(p => p.key === "seed" || next[p.key] === params[p.key]);
  params = next;
  remember(); syncProps(); rebuild(); save();
  if (sameLook && !usesSeed(params)) toast("Only the seed changed, and it needs some irregularity to show.");
}

/* ---------- print settings ---------- */

const NUMBER_FIELDS = Object.keys(PRINT_LIMITS).filter(k => $(k));
const SWITCHES = ["primeLine", "hanger", "thumbnail"];
const RESHAPES = new Set(["lineWidth", "hanger", "hangerHole"]);   // settings that change the geometry

function syncSettings() {
  for (const k of NUMBER_FIELDS) if (document.activeElement !== $(k)) $(k).value = settings[k];
  for (const k of SWITCHES) $(k).checked = settings[k];
  $("material").value = settings.material;
  $("hangerHole").disabled = !settings.hanger;
  const plan = layerPlan(settings);
  $("print-summary").textContent = `${settings.material} · ${settings.nozzleTemp}/${settings.bedTemp} °C · ${plan.count} layers`;
}
function setSetting(key, value) {
  const before = settings;
  settings = cleanSettings({ ...settings, [key]: value });
  syncSettings(); save();
  if (RESHAPES.has(key) && settings[key] !== before[key]) rebuild(); else { scheduleGcode(); drawBedMap(); }
}
function wireSettings() {
  for (const k of NUMBER_FIELDS) {
    const input = $(k), [lo, hi] = PRINT_LIMITS[k];
    input.min = lo; input.max = hi;
    input.addEventListener("input", () => {
      const n = Number(input.value);
      if (input.value !== "" && Number.isFinite(n) && n >= lo && n <= hi) setSetting(k, n);
    });
    input.addEventListener("change", () => { setSetting(k, input.value === "" ? settings[k] : Number(input.value)); input.value = settings[k]; });
  }
  for (const k of SWITCHES) $(k).addEventListener("change", () => setSetting(k, $(k).checked));
  $("material").addEventListener("change", () => {
    const preset = MATERIALS[$("material").value];
    settings = cleanSettings({ ...settings, material: $("material").value, ...(preset || {}) });
    syncSettings(); save(); scheduleGcode();
  });
  $("recentre").addEventListener("click", () => {
    settings = cleanSettings({ ...settings, centerX: PRINT_DEFAULTS.centerX, centerY: PRINT_DEFAULTS.centerY });
    syncSettings(); save(); scheduleGcode(); drawBedMap();
  });
  $("reset-print").addEventListener("click", () => {
    const was = settings;
    settings = cleanSettings({});
    syncSettings(); save();
    if ([...RESHAPES].some(k => was[k] !== settings[k])) rebuild(); else { scheduleGcode(); drawBedMap(); }
    toast("Print settings reset.");
  });
}

/* ---------- drawing ---------- */

const canvas = $("view"), ctx = canvas.getContext("2d");
const BED = { bg: "#0C1219", grid: "rgba(160, 200, 235, 0.07)", gridStrong: "rgba(160, 200, 235, 0.13)", text: "rgba(215, 230, 245, 0.72)" };

function shade(hex, k) {             // k > 0 lightens towards white, k < 0 darkens towards black
  const n = parseInt(hex.slice(1), 16), to = k > 0 ? 255 : 0, a = Math.abs(k);
  const ch = s => Math.round(((n >> s) & 255) * (1 - a) + to * a);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
const filament = () => COLORS.find(c => c[0] === color)[2];

function sizeCanvas() {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w: r.width, h: r.height, dpr };
}
function fit() {
  if (!result) return;
  const { w, h } = sizeCanvas(), b = result.bounds, lw = settings.lineWidth;
  const top = 34, bottom = 62, side = 14;
  const sx = (w - 2 * side) / (b.maxX - b.minX + lw), sy = (h - top - bottom) / (b.maxY - b.minY + lw);
  view.scale = Math.max(0.2, Math.min(sx, sy));
  view.cx = (b.minX + b.maxX) / 2;
  view.cy = (b.minY + b.maxY) / 2;
  view.ox = w / 2; view.oy = top + (h - top - bottom) / 2;
}

// Stroke the first `upTo` millimetres of a path. Returns where the nozzle ends up.
function tracePath(c, pts, cum, upTo, X, Y, from = 0) {
  c.beginPath();
  let last = null, started = false;
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] < from) continue;
    if (cum[i] > upTo) {
      if (i > 0 && started) {
        const t = (upTo - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        last = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
        c.lineTo(X(last[0]), Y(last[1]));
      }
      break;
    }
    if (!started) {
      if (i > 0 && from > 0) {
        const t = (from - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        c.moveTo(X(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t), Y(pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t));
        c.lineTo(X(pts[i][0]), Y(pts[i][1]));
      } else c.moveTo(X(pts[i][0]), Y(pts[i][1]));
      started = true;
    } else c.lineTo(X(pts[i][0]), Y(pts[i][1]));
    last = pts[i];
  }
  return last;
}

function paintFlake(c, pts, cum, X, Y, px, hex, t) {
  const total = cum[cum.length - 1], upTo = total * t;
  c.lineJoin = "round"; c.lineCap = "round";
  if (t < 1) {
    tracePath(c, pts, cum, total, X, Y, upTo);
    c.strokeStyle = shade(hex, -0.72); c.lineWidth = Math.max(1, px * 0.9); c.stroke();
  }
  const nozzle = tracePath(c, pts, cum, upTo, X, Y);
  c.strokeStyle = "rgba(0, 0, 0, 0.5)"; c.lineWidth = px + Math.min(2.5, px * 0.35); c.stroke();
  c.strokeStyle = hex; c.lineWidth = Math.max(1, px * 0.92); c.stroke();
  if (px > 2.2) { c.strokeStyle = shade(hex, 0.55); c.globalAlpha = 0.5; c.lineWidth = px * 0.26; c.stroke(); c.globalAlpha = 1; }
  return nozzle;
}

function draw() {
  const { w, h, dpr } = sizeCanvas();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BED.bg; ctx.fillRect(0, 0, w, h);
  if (!result) return;
  const s = view.scale;
  const X = x => view.ox + (x - view.cx) * s, Y = y => view.oy - (y - view.cy) * s;

  // 10 mm grid, heavier every 50 mm, measured from the centre of the flake
  const step = s * 10 < 7 ? 50 : 10;
  ctx.lineWidth = 1;
  for (let gx = Math.ceil((view.cx - view.ox / s) / step) * step; X(gx) < w; gx += step) {
    ctx.strokeStyle = Math.round(gx) % 50 === 0 ? BED.gridStrong : BED.grid;
    ctx.beginPath(); ctx.moveTo(Math.round(X(gx)) + 0.5, 0); ctx.lineTo(Math.round(X(gx)) + 0.5, h); ctx.stroke();
  }
  for (let gy = Math.ceil((view.cy - (h - view.oy) / s) / step) * step; Y(gy) > 0; gy += step) {
    ctx.strokeStyle = Math.round(gy) % 50 === 0 ? BED.gridStrong : BED.grid;
    ctx.beginPath(); ctx.moveTo(0, Math.round(Y(gy)) + 0.5); ctx.lineTo(w, Math.round(Y(gy)) + 0.5); ctx.stroke();
  }

  const pts = showEven ? result.pathB : result.path, cum = showEven ? result.pathBCum : result.pathCum;
  const nozzle = paintFlake(ctx, pts, cum, X, Y, settings.lineWidth * s, filament(), traceT);
  if (traceT < 1 && nozzle) {
    ctx.fillStyle = "#FFB238"; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(X(nozzle[0]), Y(nozzle[1]), Math.max(4, settings.lineWidth * s * 0.7), 0, 6.3); ctx.fill(); ctx.stroke();
  }

  // scale bar
  const bar = [50, 20, 10, 5].find(mm => mm * s <= w * 0.3) || 5;
  const bx = 14, by = h - 62;
  ctx.strokeStyle = BED.text; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by); ctx.lineTo(bx + bar * s, by); ctx.lineTo(bx + bar * s, by - 4); ctx.stroke();
  ctx.fillStyle = BED.text; ctx.font = "12px system-ui, sans-serif"; ctx.textBaseline = "bottom";
  ctx.fillText(bar + " mm", bx + 5, by - 3);
}

function thumbnail() {
  const size = 300, c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d"), b = result.bounds, lw = settings.lineWidth;
  g.fillStyle = "#10161D"; g.fillRect(0, 0, size, size);
  const s = (size - 24) / Math.max(b.maxX - b.minX + lw, b.maxY - b.minY + lw);
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  paintFlake(g, result.path, result.pathCum, x => size / 2 + (x - cx) * s, y => size / 2 - (y - cy) * s, Math.max(1.2, lw * s), filament(), 1);
  return c.toDataURL("image/png");
}

function drawBedMap() {
  const c = $("bedmap"), g = c.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const W = 128, H = 140;
  if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = W / MACHINE.width;
  g.fillStyle = BED.bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = BED.grid; g.lineWidth = 1;
  for (let x = 50; x < MACHINE.width; x += 50) { g.beginPath(); g.moveTo(x * s, 0); g.lineTo(x * s, H); g.stroke(); }
  for (let y = 50; y < MACHINE.depth; y += 50) { g.beginPath(); g.moveTo(0, H - y * s); g.lineTo(W, H - y * s); g.stroke(); }
  if (!result) return;
  const lay = layout(result.path, settings);
  g.strokeStyle = lay.fits ? filament() : "#FF6B5E"; g.lineWidth = 1; g.lineJoin = "round";
  g.beginPath();
  const pts = result.path, skip = Math.max(1, Math.floor(pts.length / 1500));
  for (let i = 0; i < pts.length; i += skip) {
    const x = (pts[i][0] + settings.centerX) * s, y = H - (pts[i][1] + settings.centerY) * s;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  if (lay.prime) { g.strokeStyle = "#FFB238"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(lay.prime.a[0] * s, H - lay.prime.a[1] * s); g.lineTo(lay.prime.b[0] * s, H - lay.prime.b[1] * s); g.stroke(); }
  g.fillStyle = BED.text; g.font = "10px system-ui, sans-serif"; g.textBaseline = "bottom";
  g.fillText("front", 4, H - 3);
}

/* ---------- G-code and numbers ---------- */

let gcodeTimer = 0;
function scheduleGcode() { clearTimeout(gcodeTimer); gcodeTimer = setTimeout(updateGcode, 120); }

function recipe() {
  return PROPS.map(p => `${p.label.toLowerCase()}=${p.kind === "select" || p.kind === "choice" ? p.options.find(o => o[0] === params[p.key])[1] : params[p.key]}`).join(", ");
}
function build(withPicture) {
  return makeGcode({
    path: result.path, pathB: result.pathB, settings, recipe: recipe(), link: shareUrl(),
    thumbnail: withPicture && settings.thumbnail ? thumbnail() : "",
  });
}
function warn(message) {
  $("warn").hidden = !message; $("warn").textContent = message || "";
  $("download").disabled = !!message; $("copy-gcode").disabled = !!message;
}
function duration(sec) {
  const m = Math.round(sec / 60);
  return m < 1 ? "under a minute" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
function updateGcode() {
  if (!result) return;
  drawBedMap();
  const lay = layout(result.path, settings), b = lay.box;
  const wide = b.maxX - b.minX, tall = b.maxY - b.minY;
  if (!lay.fits) {
    gcode = null;
    warn(`This snowflake (${wide.toFixed(0)} × ${tall.toFixed(0)} mm) does not fit the ${MACHINE.width} × ${MACHINE.depth} mm bed at X ${settings.centerX}, Y ${settings.centerY}. Reduce the radius or move it in Print settings.`);
    $("stats").innerHTML = ""; $("gcode-peek").textContent = ""; $("gcode-summary").textContent = "";
    return;
  }
  try { gcode = build(false); } catch (e) { gcode = null; warn(e.message); return; }
  warn("");
  const st = gcode.stats, plan = layerPlan(settings);
  const items = [
    ["Footprint", `${wide.toFixed(0)} × ${tall.toFixed(0)} mm`],
    ["Each layer", `${(st.extrudeMm / 1000).toFixed(2)} m, unbroken`],
    ["Layers", `${plan.count} × ${settings.layerHeight} = ${plan.height.toFixed(2)} mm`],
    ["Print time", `about ${duration(st.seconds)}`],
    ["Filament", `${(st.filamentMm / 1000).toFixed(2)} m · ${st.grams.toFixed(1)} g`],
    ["Travel moves", "0 inside the flake"],
  ];
  $("stats").innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  const lines = gcode.text.split("\n");
  const first = lines.slice(0, 70), tail = lines.slice(-12);
  $("gcode-peek").textContent = first.join("\n") + `\n\n… ${(lines.length - 82).toLocaleString()} more lines …\n\n` + tail.join("\n");
  $("gcode-summary").textContent = `${st.lines.toLocaleString()} lines · ${(gcode.text.length / 1024).toFixed(0)} kB`;
}

function fileName() { return `snowflake-${params.type}-${params.radius * 2}mm-${params.seed}.gcode`; }
function download() {
  if (!result || !gcode) return;
  if (shownFor !== JSON.stringify(requestOf())) { toast("Still drawing. Try again in a moment."); return; }
  let out;
  try { out = build(true); } catch (e) { warn(e.message); return; }
  const url = URL.createObjectURL(new Blob([out.text], { type: "text/plain" }));
  const a = el("a", { href: url, download: fileName() });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(`Saved ${fileName()}`);
}

async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch { toast("Copying is blocked here. Select the text and copy it by hand."); }
}
let toastTimer = 0;
function toast(message) {
  const t = $("toast");
  t.textContent = message; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- the path player ---------- */

function stopPlaying() {
  if (playing) cancelAnimationFrame(playing);
  playing = 0;
  $("play-icon").setAttribute("d", "M8 5v14l11-7z");
  $("play").setAttribute("aria-label", "Play the print path");
}
function play() {
  if (playing) { stopPlaying(); return; }
  if (!result) return;
  if (traceT >= 1) traceT = 0;
  const seconds = Math.min(16, Math.max(5, result.length / 400));
  let before = performance.now();
  $("play-icon").setAttribute("d", "M7 5h4v14H7zM13 5h4v14h-4z");
  $("play").setAttribute("aria-label", "Pause");
  const tick = now => {
    traceT = Math.min(1, traceT + (now - before) / 1000 / seconds); before = now;
    $("trace").value = Math.round(traceT * 1000);
    draw();
    if (traceT >= 1) stopPlaying(); else playing = requestAnimationFrame(tick);
  };
  playing = requestAnimationFrame(tick);
}

/* ---------- wiring ---------- */

function buildSwatches() {
  const host = $("swatches");
  for (const [id, name, hex] of COLORS) {
    const b = el("button", { type: "button", class: "swatch", "aria-label": name, title: name, "data-id": id });
    b.style.setProperty("--c", hex);
    b.addEventListener("click", () => { color = id; syncSwatches(); draw(); drawBedMap(); save(); });
    host.append(b);
  }
}
function syncSwatches() {
  for (const b of document.querySelectorAll(".swatch")) b.setAttribute("aria-pressed", b.dataset.id === color);
}

buildProps(); buildSwatches(); wireSettings();
syncProps(); syncLocks(); syncSettings(); syncSwatches(); syncHistory();

$("roll").addEventListener("click", roll);
$("back").addEventListener("click", () => go(-1));
$("fwd").addEventListener("click", () => go(1));
$("download").addEventListener("click", download);
$("share").addEventListener("click", () => copy(shareUrl(), "Link copied."));
$("copy-gcode").addEventListener("click", () => { if (gcode) copy(build(true).text, "G-code copied."); });
$("lock-all").addEventListener("click", () => { for (const p of PROPS) locks[p.key] = true; syncLocks(); save(); });
$("lock-none").addEventListener("click", () => { locks = {}; syncLocks(); save(); });
$("play").addEventListener("click", play);
$("trace").addEventListener("input", () => { stopPlaying(); traceT = Number($("trace").value) / 1000; draw(); });
$("layer-toggle").addEventListener("click", () => {
  showEven = !showEven;
  $("layer-toggle").setAttribute("aria-pressed", showEven);
  $("layer-toggle").textContent = showEven ? "Even layers" : "Odd layers";
  draw();
});
document.addEventListener("keydown", e => {
  if (e.key.toLowerCase() !== "r" || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  e.preventDefault(); roll();
});
window.addEventListener("hashchange", () => {
  const before = JSON.stringify(requestOf());
  readLink();
  if (JSON.stringify(requestOf()) === before) return;
  remember(); syncProps(); syncSettings(); rebuild();
});
new ResizeObserver(() => { fit(); draw(); }).observe($("bed"));

rebuild();
