// Snowflake generator: properties -> a shape made of strips (centrelines with a width) and solid plates.
//
// Everything is drawn once in a 30 degree wedge between a primary arm (along 0 degrees) and the bisector
// (30 degrees, where an optional secondary arm lives), then mirrored and rotated six times, the way a real
// ice crystal repeats. Branches are trimmed as they grow so that they never run into their neighbours;
// where a branch reaches the bisector it joins its mirror image and closes a cell.

const DEG = Math.PI / 180;
const SQ3 = Math.sqrt(3);

/* ---------- the properties ---------- */

export const PROPS = [
  { key: "type", label: "Type", kind: "select", options: [
    ["dendrite", "Stellar dendrite"], ["fern", "Fernlike dendrite"], ["lattice", "Lattice"],
    ["plate", "Sectored plate"], ["stellar", "Stellar plate"], ["star", "Simple star"],
    ["twelve", "Twelve-branched"], ["wild", "Wild"]] },
  { key: "radius", label: "Radius", kind: "range", min: 15, max: 150, step: 1, unit: " mm" },
  { key: "weight", label: "Arm width", kind: "choice", options: [[2, "Fine"], [4, "Medium"], [6, "Bold"]] },
  { key: "branches", label: "Branching", kind: "range", min: 0, max: 12, step: 1, unit: "" },
  { key: "angle", label: "Branch angle", kind: "range", min: 30, max: 120, step: 5, unit: "°" },
  { key: "reach", label: "Branch length", kind: "range", min: 10, max: 100, step: 5, unit: "%" },
  { key: "profile", label: "Branch pattern", kind: "select", options: [
    ["full", "Full"], ["bulge", "Bulge"], ["taper", "Taper"], ["flare", "Flare"],
    ["alternate", "Alternate"], ["random", "Random"]] },
  { key: "detail", label: "Side twigs", kind: "choice", options: [[0, "None"], [1, "Some"], [2, "Many"]] },
  { key: "second", label: "Second arms", kind: "range", min: 0, max: 100, step: 5, unit: "%" },
  { key: "core", label: "Core", kind: "select", options: [
    ["none", "None"], ["hexagon", "Open hexagon"], ["web", "Hexagon and spokes"],
    ["plate", "Solid plate"], ["star", "Open star"]] },
  { key: "coreSize", label: "Core size", kind: "range", min: 5, max: 60, step: 1, unit: "%" },
  { key: "rings", label: "Rings", kind: "range", min: 0, max: 3, step: 1, unit: "" },
  { key: "tips", label: "Tips", kind: "select", options: [
    ["plain", "Blunt"], ["point", "Pointed"], ["spear", "Spear"], ["fork", "Fork"], ["trident", "Trident"],
    ["arrow", "Arrow"], ["diamond", "Diamond"], ["hexagon", "Hexagon"], ["plate", "Solid plate"]] },
  { key: "tipSize", label: "Tip size", kind: "range", min: 5, max: 30, step: 1, unit: "%" },
  { key: "variation", label: "Irregularity", kind: "range", min: 0, max: 100, step: 5, unit: "%" },
  { key: "seed", label: "Seed", kind: "seed" },
];

export const DEFAULTS = {
  type: "dendrite", radius: 40, weight: 4, branches: 4, angle: 60, reach: 80, profile: "full", detail: 1,
  second: 0, core: "hexagon", coreSize: 14, rings: 0, tips: "point", tipSize: 12, variation: 0, seed: 2024,
};

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each type is a recipe for rolling the other properties, so "lock the type, re-roll the rest" stays in family.
function roller(rand) {
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const step = (lo, hi, s) => lo + s * Math.floor(rand() * (Math.floor((hi - lo) / s) + 1));
  const pick = list => list[Math.floor(rand() * list.length)];
  return { int, step, pick, chance: p => rand() < p };
}

const TYPE_ROLLS = {
  dendrite: r => ({
    weight: r.pick([2, 4, 4, 6]), branches: r.int(3, 7), angle: r.pick([60, 60, 60, 60, 60, 45, 75]),
    reach: r.step(55, 100, 5), profile: r.pick(["full", "full", "bulge", "alternate", "taper", "flare", "random"]),
    detail: r.pick([0, 1, 1, 2]), second: r.chance(0.65) ? 0 : r.step(20, 50, 5),
    core: r.pick(["none", "none", "hexagon", "hexagon", "web", "plate", "star"]), coreSize: r.int(9, 20),
    rings: r.pick([0, 0, 0, 1]), tips: r.pick(["point", "point", "spear", "fork", "trident", "diamond", "hexagon", "arrow"]),
    tipSize: r.int(8, 18), variation: r.chance(0.6) ? 0 : r.step(10, 40, 5),
  }),
  fern: r => ({
    weight: r.pick([2, 2, 4]), branches: r.int(8, 12), angle: r.pick([60, 60, 60, 55, 65]),
    reach: r.step(85, 100, 5), profile: r.pick(["full", "full", "bulge", "random"]), detail: r.pick([1, 2, 2]),
    second: r.chance(0.8) ? 0 : r.step(25, 45, 5), core: r.pick(["none", "none", "web", "plate", "hexagon"]),
    coreSize: r.int(6, 12), rings: 0, tips: r.pick(["point", "point", "spear", "fork"]), tipSize: r.int(6, 12),
    variation: r.chance(0.5) ? 0 : r.step(10, 30, 5),
  }),
  lattice: r => ({
    weight: r.pick([2, 4, 4]), branches: r.int(2, 6), angle: r.pick([60, 60, 60, 90, 120]), reach: 100,
    profile: r.pick(["full", "full", "taper", "alternate"]), detail: r.pick([0, 0, 1]),
    second: r.chance(0.7) ? 0 : r.step(30, 60, 5), core: r.pick(["none", "hexagon", "web", "star"]),
    coreSize: r.int(10, 22), rings: r.pick([0, 0, 1, 2]), tips: r.pick(["point", "spear", "diamond", "hexagon", "fork"]),
    tipSize: r.int(8, 16), variation: 0,
  }),
  plate: r => ({
    weight: r.pick([4, 4, 6]), branches: r.int(0, 3), angle: r.pick([60, 90, 120]), reach: 100, profile: "full",
    detail: 0, second: r.pick([0, 100, 100, r.step(60, 90, 5)]), core: r.pick(["plate", "plate", "web", "hexagon", "star"]),
    coreSize: r.int(24, 48), rings: r.int(1, 3), tips: r.pick(["plain", "point", "hexagon", "plate"]),
    tipSize: r.int(8, 16), variation: 0,
  }),
  stellar: r => ({
    weight: r.pick([4, 4, 6]), branches: r.int(0, 2), angle: 60, reach: r.step(60, 100, 5), profile: r.pick(["full", "flare"]),
    detail: 0, second: r.chance(0.7) ? 0 : r.step(30, 50, 5), core: r.pick(["plate", "plate", "hexagon", "web", "star"]),
    coreSize: r.int(15, 30), rings: r.pick([0, 0, 1]), tips: r.pick(["plate", "plate", "hexagon", "diamond"]),
    tipSize: r.int(18, 30), variation: 0,
  }),
  star: r => ({
    weight: r.pick([4, 6, 6]), branches: r.int(0, 2), angle: r.pick([60, 60, 45]), reach: r.step(40, 80, 5),
    profile: r.pick(["full", "flare", "taper"]), detail: 0, second: r.chance(0.5) ? 0 : r.step(35, 65, 5),
    core: r.pick(["none", "hexagon", "plate", "star"]), coreSize: r.int(10, 22), rings: 0,
    tips: r.pick(["point", "spear", "plain", "fork", "trident", "arrow", "diamond"]), tipSize: r.int(10, 22), variation: 0,
  }),
  twelve: r => ({
    weight: r.pick([2, 4, 4]), branches: r.int(2, 5), angle: r.pick([60, 60, 45, 75]), reach: r.step(70, 100, 5),
    profile: r.pick(["full", "bulge", "alternate"]), detail: r.pick([0, 0, 1]), second: r.step(85, 100, 5),
    core: r.pick(["none", "web", "plate", "hexagon"]), coreSize: r.int(8, 16), rings: r.pick([0, 0, 1]),
    tips: r.pick(["point", "spear", "plain", "fork", "diamond"]), tipSize: r.int(8, 16),
    variation: r.chance(0.7) ? 0 : r.step(10, 20, 5),
  }),
  wild: r => ({
    weight: r.pick([2, 4, 6]), branches: r.int(0, 10), angle: r.step(40, 120, 5), reach: r.step(30, 100, 5),
    profile: r.pick(["full", "bulge", "taper", "flare", "alternate", "random"]), detail: r.int(0, 2),
    second: r.chance(0.5) ? 0 : r.step(20, 100, 5), core: r.pick(["none", "hexagon", "web", "plate", "star"]),
    coreSize: r.int(6, 40), rings: r.int(0, 3),
    tips: r.pick(["plain", "point", "spear", "fork", "trident", "arrow", "diamond", "hexagon", "plate"]),
    tipSize: r.int(6, 26), variation: r.step(0, 60, 5),
  }),
};

export const TYPE_IDS = Object.keys(TYPE_ROLLS);

// Re-roll every property that is not locked. `rollSeed` drives the dice (not the flake's own seed).
export function randomize(params, locks = {}, rollSeed = (Math.random() * 2 ** 32) >>> 0) {
  const rand = mulberry(rollSeed);
  const r = roller(rand);
  const next = { ...params };
  if (!locks.type) next.type = r.pick(TYPE_IDS);
  const rolled = (TYPE_ROLLS[next.type] || TYPE_ROLLS.dendrite)(r);
  rolled.radius = r.int(25, 60);
  rolled.seed = Math.floor(rand() * 100000);
  for (const k of Object.keys(rolled)) if (!locks[k]) next[k] = rolled[k];
  return next;
}

export function sanitize(input) {
  const p = { ...DEFAULTS };
  for (const prop of PROPS) {
    const v = input ? input[prop.key] : undefined;
    if (v === undefined || v === null) continue;
    if (prop.kind === "range") {
      const n = Number(v);
      if (Number.isFinite(n)) p[prop.key] = Math.min(prop.max, Math.max(prop.min, Math.round(n / prop.step) * prop.step));
    } else if (prop.kind === "seed") {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n)) p.seed = Math.abs(n) % 1000000;
    } else {
      const hit = prop.options.find(o => String(o[0]) === String(v));
      if (hit) p[prop.key] = hit[0];
    }
  }
  return p;
}

/* ---------- small vector kit ---------- */

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const hyp = a => Math.hypot(a[0], a[1]);
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
const rotate = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
const reflect = (p, a) => { const c = Math.cos(2 * a), s = Math.sin(2 * a); return [p[0] * c + p[1] * s, p[0] * s - p[1] * c]; };
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

function ptSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 1e-12 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
}
function segsCross(a, b, c, d) {
  const d1 = cross(sub(d, c), sub(a, c)), d2 = cross(sub(d, c), sub(b, c));
  const d3 = cross(sub(b, a), sub(c, a)), d4 = cross(sub(b, a), sub(d, a));
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function segSeg(a, b, c, d) {
  if (segsCross(a, b, c, d)) return 0;
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
}
// Distance along the ray o + t*dir to the segment a-b, or null.
function raySeg(o, dir, a, b) {
  const e = sub(b, a), den = cross(dir, e);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(a, o), e) / den, u = cross(sub(a, o), dir) / den;
  return t > 1e-9 && u >= 0 && u <= 1 ? t : null;
}

/* ---------- the wedge: obstacles and growth ---------- */

class Wedge {
  constructor(gap) { this.gap = gap; this.obs = []; this.strips = []; this.polys = []; this.count = 0; }

  // hw < 0 marks a line with no thickness that only needs half the usual gap (a mirror line or divider).
  block(a, b, hw, opts = {}) {
    const id = opts.id || "o" + this.count++;
    this.obs.push({
      id, a, b, hw, hard: !!opts.hard, join: !!opts.join,
      minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]),
    });
    return id;
  }

  fits(a, b, hw, ignore, rMax) {
    if (rMax !== undefined && hyp(b) > rMax - hw) return false;
    const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]), minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
    for (const o of this.obs) {
      if (ignore && ignore.has(o.id)) continue;
      const need = hw + (o.hard ? 0 : o.hw < 0 ? this.gap / 2 : o.hw + this.gap);
      if (o.minX - maxX > need || minX - o.maxX > need || o.minY - maxY > need || minY - o.maxY > need) continue;
      if (segSeg(a, b, o.a, o.b) < need - 1e-9) return false;
    }
    return true;
  }

  // Longest length up to `want` that a branch from o along dir can have.
  grow(o, dir, want, hw, ignore, rMax, minLen) {
    const end = t => [o[0] + dir[0] * t, o[1] + dir[1] * t];
    if (want < minLen) return 0;
    if (this.fits(o, end(want), hw, ignore, rMax)) return want;
    if (!this.fits(o, end(minLen), hw, ignore, rMax)) return 0;
    let lo = minLen, hi = want;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (this.fits(o, end(mid), hw, ignore, rMax)) lo = mid; else hi = mid;
    }
    return lo;
  }
}

/* ---------- arm tips ---------- */

// Parts of a tip, drawn with the arm arriving along +x and the tip node at the origin.
// `reach` lists the outermost points [x, y, pad] so the node can be placed to make the flake exactly its radius.
function tipParts(style, size, hArm, hB, cap) {
  const strips = [], polys = [], reach = [];
  let armEnd = 0, armCap = cap, back = hArm;
  const prong = (ang, len) => {
    for (const s of ang === 0 ? [1] : [1, -1]) {
      const e = polar(len, s * ang);
      strips.push({ pts: [[0, 0], e], hw: hB, caps: ["butt", cap] });
      reach.push([e[0], e[1], hB * 1.3]);
    }
  };
  switch (style) {
    case "plain": armCap = "square"; reach.push([hArm, hArm, 0]); break;
    case "spear": armCap = "spear"; reach.push([hArm * SQ3, 0, 0]); break;
    case "fork": {
      const f = Math.max(size, 3 * hB + 1.5);
      prong(60 * DEG, f); armCap = "point"; reach.push([hArm * 0.58, 0, 0]);
      break;
    }
    case "trident": {
      const f = Math.max(size, 3 * hB + 1.5);
      prong(60 * DEG, f * 0.7); prong(0, f); armCap = "point";
      break;
    }
    case "arrow": {
      const f = Math.max(size, 3 * hB + 1.5);
      prong(120 * DEG, f * 0.8); armCap = "point"; reach.push([hArm * 0.58, 0, 0], [hB * 0.9, hB * 0.5, 0]);
      back = f * 0.4 + hB;
      break;
    }
    case "diamond": {
      const f = Math.max(size, (1.2 + 2.31 * hB) / 0.577);
      const h = f / 2 / SQ3;
      strips.push({ pts: [[0, 0], [f / 2, h], [f, 0], [f / 2, -h]], hw: hB, closed: true });
      reach.push([f + 2 * hB, 0, 0]); armCap = "butt"; back = 2 * hB;
      break;
    }
    case "hexagon": case "plate": {
      const q = Math.max(size / 2, (0.6 + hB) / 0.866);
      const hex = [3, 2, 1, 0, 5, 4].map(k => add([q, 0], polar(q, k * 60 * DEG)));
      if (style === "plate") { polys.push(hex); armEnd = q; reach.push([2 * q, 0, 0], [1.5 * q, q * 0.866, 0]); }
      else { strips.push({ pts: hex, hw: hB, closed: true }); reach.push([2 * q + 1.16 * hB, 0, 0], [1.5 * q, q * 0.866, 1.16 * hB]); back = 1.2 * hB; }
      armCap = "butt";
      break;
    }
    default: armCap = "point"; reach.push([hArm * 0.58, 0, 0]);   // "point"
  }
  return { strips, polys, reach, armEnd, armCap, back };
}

function tipNode(parts, radius) {
  const over = x => parts.reach.reduce((m, [px, py, pad]) => Math.max(m, Math.hypot(x + px, py) + pad), 0);
  let lo = 0, hi = radius;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (over(mid) <= radius) lo = mid; else hi = mid; }
  return lo;
}

/* ---------- the flake ---------- */

const PROFILES = {
  full: () => 1,
  bulge: u => 0.35 + 0.65 * Math.sin(Math.PI * u),
  taper: u => 1 - 0.75 * u,
  flare: u => 0.25 + 0.75 * u,
  alternate: (u, i) => (i % 2 ? 0.5 : 1),
  random: (u, i, rand) => 0.35 + 0.65 * rand(),
};

export function buildShape(params, lineWidth, opts = {}) {
  const p = params, w = lineWidth;
  const Rf = p.radius;
  const hArm = p.weight * w / 2;                       // half-widths, always whole lines
  const hB = Math.max(2, p.weight - 2) * w / 2;
  const hT = w;
  const gap = Math.max(0.6, 1.2 * w);
  const rand = mulberry(p.seed * 7919 + 13);
  const vary = p.variation / 100;
  const reachK = p.reach / 100;
  const cap = p.tips === "plain" ? "square" : "point";
  const al = p.angle * DEG;
  const alT = p.angle <= 90 ? al : Math.PI - al;       // twigs always lean forward
  const sinA = Math.max(0.5, Math.sin(al));
  const profile = PROFILES[p.profile] || PROFILES.full;

  // Second arms as long as the first make a true twelve-fold crystal: a 15 degree wedge, repeated 24 times.
  const twelve = p.second >= 95;
  const fold = twelve ? 12 : 6;
  const OM = Math.PI / fold;                            // the bisector: 30 degrees, or 15 for twelve arms
  let Rs = twelve ? 0 : p.second / 100 * Rf;
  let hasSec = !twelve && p.second >= 15 && Rs > 6 * hArm + 4;
  const wedge = new Wedge(gap);
  const global = { strips: [], polys: [] };

  // --- tips and arm lengths
  const tipP = tipParts(p.tips, p.tipSize / 100 * Rf, hArm, hB, cap);
  const xtP = tipNode(tipP, Rf);
  let tipS = null, xtS = 0;
  if (hasSec) {
    tipS = tipParts(p.tips, p.tipSize / 100 * Rs, hArm, hB, cap);
    xtS = tipNode(tipS, Rs);
  }

  // --- core
  let core = p.core;
  const coreHw = core === "hexagon" ? hArm : hB;
  let rc = Math.min(p.coreSize / 100 * Rf, 0.55 * xtP);
  const qFlat = Math.cos(OM);                           // a polygon's edge midpoint, as a share of its corner radius
  const qStar = (1 / SQ3) / (Math.sin(OM) + Math.cos(OM) / SQ3);   // inner corner of a star with 60 degree points
  if (core === "hexagon" || core === "web") rc = Math.max(rc, (1.2 + coreHw) / qFlat);
  if (core === "star") rc = Math.max(rc, (1.5 + 2 * coreHw) / (qStar * Math.sin(OM) * 2 / SQ3 + 0.17));
  if (core === "plate") rc = Math.max(rc, 2 * hArm + 1);
  if (core !== "none" && rc > 0.6 * xtP) core = "none";
  const q = core === "star" ? qStar : qFlat;            // where the core crosses the bisector, as a share of rc
  let r0P = 0, r0S = 0, coreOut = 0;
  if (core !== "none") {
    const ring = [];
    for (let k = 0; k < fold; k++) {
      ring.push(polar(rc, k * 2 * OM));
      if (core === "star") ring.push(polar(rc * q, k * 2 * OM + OM));
    }
    if (core === "plate") global.polys.push(ring);
    else global.strips.push({ pts: ring, hw: coreHw, closed: true });
    if (core === "hexagon" || core === "star") { r0P = rc; r0S = rc * q; }
    wedge.block([rc, 0], polar(rc * q, OM), core === "plate" ? 0 : coreHw, { id: "core" });
    coreOut = rc + (core === "plate" ? 0 : coreHw);
  }
  if (hasSec && xtS < r0S + 2 * hArm + 2) hasSec = false;
  if (!hasSec) { Rs = 0; xtS = 0; tipS = null; }

  // --- the two arms, in world wedge coordinates
  const idT = pt => pt;
  const flipT = pt => reflect(pt, 15 * DEG);            // swaps the primary axis and the bisector
  const arms = [{ T: idT, tip: tipP, xt: xtP, r0: r0P, Ra: Rf, other: hasSec ? Rs : 0, id: "armP", n: p.branches, q: 1, qo: q }];
  if (hasSec) arms.push({ T: flipT, tip: tipS, xt: xtS, r0: r0S, Ra: Rs, other: Rf, id: "armS", n: Math.round(p.branches * p.second / 100), q, qo: 1 });

  for (const A of arms) {
    const end = A.xt + A.tip.armEnd;
    wedge.strips.push({ pts: [A.T([Math.max(0, A.r0 - 0.2 * coreHw), 0]), A.T([end, 0])], hw: hArm, caps: ["butt", A.tip.armCap] });
    wedge.block(A.T([A.r0, 0]), A.T([end, 0]), hArm, { id: A.id });
    for (const s of A.tip.strips) {
      const pts = s.pts.map(pt => A.T(add(pt, [A.xt, 0])));
      wedge.strips.push({ ...s, pts });
      const n = pts.length;
      for (let i = 0; i < (s.closed ? n : n - 1); i++) wedge.block(pts[i], pts[(i + 1) % n], s.hw);
    }
    for (const poly of A.tip.polys) {
      const pts = poly.map(pt => A.T(add(pt, [A.xt, 0])));
      wedge.polys.push(pts);
      for (let i = 0; i < pts.length; i++) wedge.block(pts[i], pts[(i + 1) % pts.length], 0);
    }
  }

  // --- limits: mirror lines, the divider between the two arms, and the outline
  const FAR = 3 * Rf;
  const mirrorIds = new Set();
  const mirror = (ang, from, to) => { if (to - from > 0.5) mirrorIds.add(wedge.block(polar(from, ang), polar(to, ang), -1)); };
  mirror(0, 0, r0P); mirror(0, xtP, FAR);
  if (hasSec) { mirror(OM, 0, r0S); mirror(OM, xtS, FAR); } else mirror(OM, 0, FAR);
  if (hasSec) wedge.block([0, 0], polar(Rs + hB + gap, OM / (1 + Rs / Rf)), -1, { id: "divider" });
  const outer = hasSec && Rs >= 0.62 * Rf ? polar(Rs, OM) : polar(Rf, 2 * OM);
  wedge.block([Rf, 0], outer, 0, { hard: true, id: "outline" });

  // --- rings
  const ringIds = [], ringR = [];
  {
    const rIn = core === "none" ? 0.2 * xtP : coreOut + hB + gap + 1.5;
    const rOut = xtP - tipP.back - hB - gap;
    const qr = core === "star" ? qStar : qFlat;
    for (let k = 0; k < p.rings; k++) {
      let r = rIn + (rOut - rIn) * 0.95 * (k + 1) / (p.rings + 0.5);
      r += (rand() - 0.5) * vary * 0.3 * (rOut - rIn) / (p.rings + 1);
      if (!(rOut - rIn > 2) || r > rOut || (ringR.length && r - ringR[ringR.length - 1] < 2 * hB + gap + 1)) continue;
      const pts = [];
      for (let j = 0; j < fold; j++) { pts.push(polar(r, j * 2 * OM)); if (core === "star") pts.push(polar(r * qr, j * 2 * OM + OM)); }
      global.strips.push({ pts, hw: hB, closed: true });
      ringIds.push(wedge.block([r, 0], polar(r * qr, OM), hB, { id: "ring" + k, join: true }));
      ringR.push([r, r * qr]);
    }
  }

  // --- first-order branches
  const minLen1 = 2 * hB + 1.2, minLenT = 2 * hT + 0.8;
  const branches = [];
  for (const A of arms) {
    const a0 = Math.max(A.r0 > 0 || core !== "none" ? coreOut * (A === arms[0] ? 1 : q) + hB + gap : 0, 0.13 * A.xt, hArm + 2 * hB + 1);
    const a1 = A.xt - A.tip.back - hB - gap * 0.5;
    const pitch = (2 * hB + gap) / sinA;
    if (!(a1 - a0 >= 0) || A.n <= 0) continue;
    const count = Math.max(1, Math.min(A.n, Math.floor((a1 - a0) / pitch) + 1));
    const stepA = count > 1 ? (a1 - a0) / (count - 1) : 0;
    let prev = -Infinity;
    for (let i = 0; i < count; i++) {
      let a = count > 1 ? a0 + stepA * i : (a0 + a1) / 2;
      a += (rand() - 0.5) * vary * 0.6 * (stepA || (a1 - a0));
      a = Math.min(a1, Math.max(a0, a, prev + pitch));
      if (a > a1 + 1e-6) break;
      const ignore = new Set([A.id]);
      for (let k = 0; k < ringR.length; k++) {              // start exactly on a ring corner rather than beside it
        const rr = ringR[k][A === arms[0] ? 0 : 1];
        if (Math.abs(a - rr) < 2 * hB + gap) { a = rr; ignore.add(ringIds[k]); }
      }
      if (a < prev + pitch - 1e-6) continue;
      prev = a;
      const u = a1 > a0 ? (a - a0) / (a1 - a0) : 0.5;
      const N = [a, 0], dirL = polar(1, al);
      const Nw = A.T(N), dirW = sub(A.T(add(N, dirL)), Nw);
      const limit = wedge.grow(Nw, dirW, FAR, hB, ignore, A.Ra, minLen1);

      // The first thing in the way that a branch may fuse with: a ring, or its own mirror image on the bisector.
      let join = null;
      for (const o of wedge.obs) {
        if (!o.join || ignore.has(o.id)) continue;
        const t = raySeg(Nw, dirW, o.a, o.b);
        if (t !== null && (!join || t < join.t)) join = { t, kind: "ring", id: o.id };
      }
      const e30 = polar(1, OM), den = cross(dirL, e30);
      if (Math.abs(den) > 1e-9) {
        const t = -cross(N, e30) / den;
        const Q = add(N, mul(dirL, t));
        const tipOther = A.other > 0 ? (A === arms[0] ? xtS + (tipS ? tipS.armEnd : 0) : xtP + tipP.armEnd) : 0;
        if (t > 0 && Q[0] > 0 && hyp(Q) > tipOther + hB + gap && (!join || t < join.t)) join = { t, kind: "mirror" };
      }
      if (join) {
        const skip = new Set(ignore);
        if (join.kind === "ring") skip.add(join.id); else for (const id of mirrorIds) skip.add(id);
        if (!wedge.fits(Nw, add(Nw, mul(dirW, join.t)), join.kind === "ring" ? hB : hB * 0.5, skip, A.Ra + hB)) join = null;
      }
      const top = join ? join.t : limit;
      const want = reachK * profile(u, i, rand) * top * (1 - vary * 0.5 * rand());
      let len, joined = null;
      if (join && want > limit) {
        if (want >= (limit + join.t) / 2) { len = join.t; joined = join.kind; } else len = limit;
      } else len = Math.min(want, limit);
      if (len < minLen1) continue;
      const endL = add(N, mul(dirL, len));
      const endW = A.T(endL);
      if (joined === "mirror") wedge.strips.push({ pts: [Nw, endW, A.T(reflect(N, OM))], hw: hB, caps: ["butt", "butt"] });
      else wedge.strips.push({ pts: [Nw, endW], hw: hB, caps: ["butt", joined ? "butt" : cap] });
      const id = wedge.block(Nw, endW, hB);
      branches.push({ A, o: Nw, dir: dirW, len, id });
    }
  }

  // --- twigs
  if (p.detail > 0) {
    const pitchT = (2 * hT + gap) / Math.max(0.5, Math.sin(alT));
    const kMax = p.detail === 1 ? 2 : 4;
    const twigs = [];
    for (const b of branches) {
      const k = Math.min(kMax, Math.floor((b.len - hB) / pitchT));
      for (let j = 0; j < k; j++) {
        const s = b.len * (j + 1) / (k + 1);
        const o = add(b.o, mul(b.dir, s));
        for (const side of [-1, 1]) {
          const dir = rotate(b.dir, side * alT);
          const want = Math.min(0.6 * (b.len - s), 0.5 * b.len) * (0.55 + 0.45 * reachK) * (1 - vary * 0.5 * rand());
          const len = wedge.grow(o, dir, want, hT, new Set([b.id]), b.A.Ra, minLenT);
          if (len < minLenT) continue;
          const e = add(o, mul(dir, len));
          wedge.strips.push({ pts: [o, e], hw: hT, caps: ["butt", cap] });
          twigs.push({ A: b.A, o, dir, len, id: wedge.block(o, e, hT) });
        }
      }
    }
    if (p.detail > 1) {
      for (const t of twigs) {
        if (t.len < 2.2 * pitchT) continue;
        const o = add(t.o, mul(t.dir, t.len * 0.5));
        for (const side of [-1, 1]) {
          const dir = rotate(t.dir, side * alT);
          const len = wedge.grow(o, dir, 0.4 * t.len, hT, new Set([t.id]), t.A.Ra, minLenT);
          if (len < minLenT) continue;
          const e = add(o, mul(dir, len));
          wedge.strips.push({ pts: [o, e], hw: hT, caps: ["butt", cap] });
          wedge.block(o, e, hT);
        }
      }
    }
  }

  // --- repeat the wedge around the crystal, with one arm pointing up
  const strips = [], polys = [];
  const up = 90 * DEG;
  for (let k = 0; k < fold; k++) {
    for (const flip of [false, true]) {
      const tf = pt => rotate(flip ? [pt[0], -pt[1]] : pt, up + k * 2 * OM);
      for (const s of wedge.strips) strips.push({ ...s, pts: s.pts.map(tf) });
      for (const poly of wedge.polys) polys.push(poly.map(tf));
    }
  }
  for (const s of global.strips) strips.push({ ...s, pts: s.pts.map(pt => rotate(pt, up)) });
  for (const poly of global.polys) polys.push(poly.map(pt => rotate(pt, up)));

  // --- a loop to hang it by, on the arm that points up
  let top = Rf;
  if (opts.hanger) {
    const hole = Math.max(1.5, opts.hangerHole || 3.5);
    const rh = hole / 2 + hArm;
    const cy = Rf + rh;
    const ring = [];
    for (let i = 0; i < 28; i++) ring.push(add([0, cy], polar(rh, i / 28 * 2 * Math.PI)));
    strips.push({ pts: ring, hw: hArm, closed: true });
    strips.push({ pts: [[0, xtP], [0, Rf]], hw: hB, caps: ["butt", "butt"] });
    top = cy + rh + hArm;
  }

  return { strips, polys, radius: Rf, top, branches: branches.length };
}
