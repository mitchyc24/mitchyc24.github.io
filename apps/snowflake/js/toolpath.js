// Shape -> one continuous extrusion path.
//
// 1. material():        union every strip and plate of the flake into one polygon set (the plastic).
// 2. concentricLoops(): inset that polygon by half a line, 1.5 lines, 2.5 lines ... until nothing is
//                       left. Each inset contour is a closed loop the nozzle will follow.
// 3. stitch():          join every loop to a neighbour one line away by cutting both and cross-connecting
//                       the ends, so the whole set becomes a single closed path with no travel moves.
//
// Polygon maths is done by Clipper (vendor/clipper.js), which works in integers: 1 unit = 1 micron.

const SCALE = 1000;
const MITER = 3;          // keeps 60 degree crystal corners sharp, squares off anything sharper than ~39 degrees
const EPS = 1e-9;

let lib = null;
export function useClipper(clipperLib) { lib = clipperLib; }
function CL() {
  const c = lib || globalThis.ClipperLib;
  if (!c) throw new Error("ClipperLib is not loaded");
  return c;
}

const toInt = pts => pts.map(p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) }));
const fromInt = path => path.map(p => [p.X / SCALE, p.Y / SCALE]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mod = (x, m) => ((x % m) + m) % m;

function offset(paths, delta, endType) {
  const C = CL();
  const co = new C.ClipperOffset(MITER, 0.02 * SCALE);
  co.AddPaths(paths, C.JoinType.jtMiter, endType === undefined ? C.EndType.etClosedPolygon : endType);
  const out = new C.Paths();
  co.Execute(out, delta * SCALE);
  return out;
}

function union(paths) {
  const C = CL();
  const c = new C.Clipper();
  c.AddPaths(paths, C.PolyType.ptSubject, true);
  const out = new C.Paths();
  c.Execute(C.ClipType.ctUnion, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return out;
}

/* ---------- 1. material ---------- */

// A strip is a centreline with a half-width. Its free ends take a cap:
//   butt   cut square at the end point (used where the end is buried in other material)
//   square extended by the half-width
//   point  a 120 degree crystal facet
//   spear  a 60 degree point
function applyCap(pts, iEnd, iPrev, cap, hw, extra) {
  if (!cap || cap === "butt") return;
  const e = pts[iEnd], p = pts[iPrev];
  const L = dist(e, p);
  if (L < EPS) return;
  const u = [(e[0] - p[0]) / L, (e[1] - p[1]) / L];
  const n = [-u[1], u[0]];
  if (cap === "square") { pts[iEnd] = [e[0] + u[0] * hw, e[1] + u[1] * hw]; return; }
  const reach = hw * (cap === "spear" ? 1.7320508 : 0.5773503);
  const back = Math.min(0.05, L / 2);
  extra.push([
    [e[0] - u[0] * back + n[0] * hw, e[1] - u[1] * back + n[1] * hw],
    [e[0] + n[0] * hw, e[1] + n[1] * hw],
    [e[0] + u[0] * reach, e[1] + u[1] * reach],
    [e[0] - n[0] * hw, e[1] - n[1] * hw],
    [e[0] - u[0] * back - n[0] * hw, e[1] - u[1] * back - n[1] * hw],
  ]);
}

export function material(shape) {
  const C = CL();
  const groups = new Map();
  const extra = [];
  for (const s of shape.strips) {
    if (!s.pts || s.pts.length < 2 || !(s.hw > 0)) continue;
    const pts = s.pts.map(p => [p[0], p[1]]);
    if (!s.closed) {
      const caps = s.caps || ["butt", "butt"];
      applyCap(pts, 0, 1, caps[0], s.hw, extra);
      applyCap(pts, pts.length - 1, pts.length - 2, caps[1], s.hw, extra);
    }
    const key = (s.closed ? "c" : "o") + Math.round(s.hw * SCALE);
    if (!groups.has(key)) groups.set(key, { hw: s.hw, closed: !!s.closed, paths: [] });
    groups.get(key).paths.push(toInt(pts));
  }
  let all = [];
  for (const g of groups.values()) {
    all = all.concat(offset(g.paths, g.hw, g.closed ? C.EndType.etClosedLine : C.EndType.etOpenButt));
  }
  for (const poly of extra.concat(shape.polys || [])) {
    const p = toInt(poly);
    if (p.length < 3) continue;
    if (!C.Clipper.Orientation(p)) p.reverse();
    all.push(p);
  }
  return union(all);
}

export function materialArea(M) {
  const C = CL();
  let a = 0;
  for (const p of M) a += C.Clipper.Area(p);
  return Math.abs(a) / (SCALE * SCALE);
}

export const materialToPolys = M => M.map(fromInt);

/* ---------- 2. concentric loops ---------- */

function makeLoop(pts, level) {
  const n = pts.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + dist(pts[i], pts[(i + 1) % n]);
  const len = cum[n];
  // Arc positions of real corners, so stitches can keep clear of them.
  const corners = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const turn = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
    if (turn > 0.3) corners.push(cum[i]);
  }
  return { pts, n, cum, len, level, corners };
}

function intersect(subject, clip) {
  const C = CL();
  const c = new C.Clipper();
  c.AddPaths(subject, C.PolyType.ptSubject, true);
  c.AddPaths(clip, C.PolyType.ptClip, true);
  const out = new C.Paths();
  c.Execute(C.ClipType.ctIntersection, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return out;
}

export function concentricLoops(M, w, maxLevels = 240) {
  const C = CL();
  const loops = [];
  const slack = 0.25 * w;
  let A = offset(M, -0.5 * w);               // the centreline of the outermost line
  for (let j = 0; j < maxLevels && A.length; j++) {
    // Shave off slivers thinner than half a line (two passes there would double up), then clip back to A,
    // because re-growing a shaved sliver can poke a sharp corner past the true inset.
    let P = offset(offset(A, -slack), slack);
    if (P.length) P = intersect(P, A);
    for (const path of P) {
      const clean = C.Clipper.CleanPolygon(path, 2);
      if (clean.length < 3) continue;
      const loop = makeLoop(fromInt(clean), j);
      if (loop.len >= 3 * w) loops.push(loop);
    }
    A = offset(A, -w);                         // one line further in
  }
  return loops;
}

function segIndex(L, s) {
  // largest i with cum[i] <= s, for s in [0, len)
  let lo = 0, hi = L.n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (L.cum[mid] <= s) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function pointAt(L, s) {
  s = mod(s, L.len);
  const i = segIndex(L, s);
  const a = L.pts[i], b = L.pts[(i + 1) % L.n];
  const sl = L.cum[i + 1] - L.cum[i];
  const t = sl > EPS ? (s - L.cum[i]) / sl : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Push the points of loop L from arc position s0, travelling d in direction dir (+1 / -1).
function emitArc(L, s0, d, dir, out) {
  s0 = mod(s0, L.len);
  out.push(pointAt(L, s0));
  if (d <= EPS) return;
  const n = L.n;
  let i = segIndex(L, s0);
  if (dir > 0) {
    let travelled = L.cum[i + 1] - s0;       // distance to the next vertex
    i = (i + 1) % n;
    while (travelled < d - EPS) {
      out.push(L.pts[i]);
      travelled += L.cum[i + 1] - L.cum[i];
      i = (i + 1) % n;
    }
  } else {
    let travelled = s0 - L.cum[i];           // distance back to vertex i
    while (travelled < d - EPS) {
      out.push(L.pts[i]);
      i = (i + n - 1) % n;
      travelled += L.cum[i + 1] - L.cum[i];
    }
  }
  out.push(pointAt(L, s0 + dir * d));
}

/* ---------- 3. stitch ---------- */

function circDist(a, b, len) {
  const d = Math.abs(a - b) % len;
  return Math.min(d, len - d);
}

function nearestIn(sorted, s, len) {
  // distance along the loop from s to the nearest value in a sorted list of arc positions
  if (!sorted.length) return Infinity;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < s) lo = mid + 1; else hi = mid; }
  const a = sorted[lo % sorted.length], b = sorted[(lo + sorted.length - 1) % sorted.length];
  return Math.min(circDist(a, s, len), circDist(b, s, len));
}

function ptSegParam(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > EPS ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a[0] + dx * t - p[0], y = a[1] + dy * t - p[1];
  return [Math.hypot(x, y), t];
}

function segSegDist(a, b, c, d) {
  const cr = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(ptSegParam(a, c, d)[0], ptSegParam(b, c, d)[0], ptSegParam(c, a, b)[0], ptSegParam(d, a, b)[0]);
}

// Every loop chopped into short pieces and dropped into a grid, for "what is near here" questions.
function buildIndex(loops, cell) {
  const inv = 1 / cell;
  const grid = new Map();
  const pieces = [];                         // [loop, ax, ay, bx, by, sStart, length]
  const key = (ix, iy) => (ix + 32768) * 65536 + (iy + 32768);
  loops.forEach((L, li) => {
    for (let i = 0; i < L.n; i++) {
      const a = L.pts[i], b = L.pts[(i + 1) % L.n];
      const sl = L.cum[i + 1] - L.cum[i];
      const m = Math.max(1, Math.ceil(sl / cell));
      for (let k = 0; k < m; k++) {
        const t0 = k / m, t1 = (k + 1) / m;
        const p = [li, a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0,
          a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, L.cum[i] + sl * t0, sl / m];
        const id = pieces.push(p) - 1;
        const x0 = Math.floor(Math.min(p[1], p[3]) * inv), x1 = Math.floor(Math.max(p[1], p[3]) * inv);
        const y0 = Math.floor(Math.min(p[2], p[4]) * inv), y1 = Math.floor(Math.max(p[2], p[4]) * inv);
        for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) {
          const kk = key(ix, iy);
          const bucket = grid.get(kk);
          if (bucket) bucket.push(id); else grid.set(kk, [id]);
        }
      }
    }
  });
  // Calls fn(piece) for every piece whose cell is within one cell of the box around a-b.
  const near = (a, b, fn) => {
    const x0 = Math.floor(Math.min(a[0], b[0]) * inv) - 1, x1 = Math.floor(Math.max(a[0], b[0]) * inv) + 1;
    const y0 = Math.floor(Math.min(a[1], b[1]) * inv) - 1, y1 = Math.floor(Math.max(a[1], b[1]) * inv) + 1;
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) {
      const bucket = grid.get(key(ix, iy));
      if (bucket) for (const id of bucket) fn(pieces[id]);
    }
  };
  return { near };
}

// For every pair of loops that run within reach of each other, list the places where they do.
function findNeighbours(loops, w, index, reach) {
  const pairs = new Map();                   // lo * N + hi -> [{sLo, sHi, d}]
  const N = loops.length;
  const best = new Map();
  loops.forEach((L, li) => {
    const count = Math.max(4, Math.ceil(L.len / (0.5 * w)));
    for (let k = 0; k < count; k++) {
      const s = (k + 0.5) * L.len / count;
      const p = pointAt(L, s);
      best.clear();
      index.near(p, p, q => {
        if (q[0] === li) return;
        const [d, t] = ptSegParam(p, [q[1], q[2]], [q[3], q[4]]);
        if (d > reach) return;
        const cur = best.get(q[0]);
        if (!cur || d < cur.d) best.set(q[0], { d, s: q[5] + q[6] * t });
      });
      for (const [other, hit] of best) {
        const lo = Math.min(li, other), hi = Math.max(li, other);
        const kk = lo * N + hi;
        let list = pairs.get(kk);
        if (!list) pairs.set(kk, list = []);
        list.push(lo === li ? { sLo: s, sHi: hit.s, d: hit.d } : { sLo: hit.s, sHi: s, d: hit.d });
      }
    }
  });
  return pairs;
}

// Loops with nothing one line away (an oddly wide wall, say) are joined at their closest approach.
function closestApproach(loops, fromSet, toSet) {
  let best = null;
  for (const a of toSet) {
    const A = loops[a];
    const stepA = Math.max(1, Math.floor(A.n / 400));
    for (let i = 0; i < A.n; i += stepA) {
      const p = A.pts[i];
      for (const b of fromSet) {
        const B = loops[b];
        for (let j = 0; j < B.n; j++) {
          const [d, t] = ptSegParam(p, B.pts[j], B.pts[(j + 1) % B.n]);
          if (!best || d < best.d) best = { d, a, b, sA: A.cum[i], sB: B.cum[j] + (B.cum[j + 1] - B.cum[j]) * t };
        }
      }
    }
  }
  return best;
}

// `avoid` is the list of cut positions (per loop) from an earlier stitching of the same loops. Passing it
// makes this stitching put its joins somewhere else, so alternate layers can lap over each other's joins.
export function stitch(loops, w, origin = [0, 0], avoid = null) {
  if (!loops.length) return { path: [], bridges: 0, seam: null, cuts: [] };
  const N = loops.length;
  const cuts = loops.map(() => []);
  const kids = loops.map(() => []);
  const gap = 0.85 * w;                    // the two connectors of a stitch overlap a little, so they fuse

  // The path starts and ends at the outline vertex nearest the centre: an inside corner, where the seam hides.
  let root = 0, seamS = 0, bestR = Infinity;
  loops.forEach((L, li) => {
    if (L.level !== 0) return;
    for (let i = 0; i < L.n; i++) {
      const r = dist(L.pts[i], origin);
      if (r < bestR) { bestR = r; root = li; seamS = L.cum[i]; }
    }
  });
  cuts[root].push(seamS);

  const reach = 1.45 * w;
  const index = buildIndex(loops, reach);
  const pairs = findNeighbours(loops, w, index, reach);
  const nbrs = Array.from({ length: N }, () => []);
  for (const kk of pairs.keys()) {
    const lo = Math.floor(kk / N), hi = kk % N;
    nbrs[lo].push(hi); nbrs[hi].push(lo);
  }
  const candidates = (P, C) => {
    const lo = Math.min(P, C), hi = Math.max(P, C);
    const list = pairs.get(lo * N + hi) || [];
    return list.map(c => (lo === P ? { sP: c.sLo, sC: c.sHi, d: c.d } : { sP: c.sHi, sC: c.sLo, d: c.d }));
  };

  // The part of an index piece that survives a cut of length g centred on sCut, or null if none does.
  const kept = (q, L, sCut, g) => {
    const o = mod(q[5] - (sCut - g / 2), L.len);
    const lo = Math.max(o, o < g ? g : o), hi = Math.min(o + q[6], L.len);
    if (hi - lo < 1e-9) return null;
    const t0 = (lo - o) / q[6], t1 = (hi - o) / q[6];
    return [[q[1] + (q[3] - q[1]) * t0, q[2] + (q[4] - q[2]) * t0], [q[1] + (q[3] - q[1]) * t1, q[2] + (q[4] - q[2]) * t1]];
  };

  // A stitch is two short connectors between the cut ends of P and C. Nothing may lie in their way: no third
  // loop, and no other stretch of P or C. A connector may only touch its own two loops where it joins them,
  // and must leave them at a decent angle rather than folding back along them (a stitch in a sharp corner).
  const clearWay = (P, C, c, g) => {
    const LP = loops[P], LC = loops[C];
    const Pa = pointAt(LP, c.sP - g / 2), Pb = pointAt(LP, c.sP + g / 2);
    const Ca = pointAt(LC, c.sC - g / 2), Cb = pointAt(LC, c.sC + g / 2);
    const straight = dist(Pa, Ca) + dist(Pb, Cb) <= dist(Pa, Cb) + dist(Pb, Ca);
    let ok = true;
    for (const [u, v] of straight ? [[Pa, Ca], [Pb, Cb]] : [[Pa, Cb], [Pb, Ca]]) {
      const len = dist(u, v);
      if (len > 1.6 * w) return false;
      const at = t => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t];
      const offP = at(0.25), offC = at(0.75);          // the connector without the quarter where it joins P, or C
      index.near(u, v, q => {
        if (!ok) return;
        if (q[0] !== P && q[0] !== C) {
          if (segSegDist(u, v, [q[1], q[2]], [q[3], q[4]]) < 0.5 * w) ok = false;
          return;
        }
        const own = q[0] === P;
        const part = kept(q, own ? LP : LC, own ? c.sP : c.sC, g);
        if (!part) return;
        if (segSegDist(own ? offP : u, own ? v : offC, part[0], part[1]) < 0.2 * len) ok = false;
      });
      if (!ok) return false;
    }
    return true;
  };

  const place = (P, C, force) => {
    const LP = loops[P], LC = loops[C];
    const g = Math.min(gap, LP.len / 3, LC.len / 3);
    const lim = 3 * w;
    const scored = [];
    for (const c of candidates(P, C)) {
      let clear = Infinity;
      for (const s of cuts[P]) clear = Math.min(clear, circDist(s, c.sP, LP.len));
      const corner = Math.min(nearestIn(LP.corners, c.sP, LP.len), nearestIn(LC.corners, c.sC, LC.len));
      let score = Math.min(clear / 2, lim) + 0.6 * Math.min(corner, lim) - 6 * Math.max(0, c.d - 1.1 * w);
      if (clear < 1.6 * gap) score -= 100;
      if (avoid) {
        let lap = Infinity;
        for (const s of avoid[P]) lap = Math.min(lap, circDist(s, c.sP, LP.len));
        for (const s of avoid[C]) lap = Math.min(lap, circDist(s, c.sC, LC.len));
        score += Math.min(lap, 2 * lim) - (lap < 3 * w ? 20 : 0);
      }
      scored.push({ c, score });
    }
    scored.sort((x, y) => y.score - x.score);
    let best = null;
    for (let i = 0; i < scored.length && i < 60 && !best; i++) {
      if (scored[i].score < -50 && !force) break;
      if (clearWay(P, C, scored[i].c, g)) best = scored[i].c;
    }
    if (!best && force && scored.length) best = scored[0].c;
    if (!best) return false;
    kids[P].push({ s: best.sP, child: C, sc: best.sC, g });
    cuts[P].push(best.sP);
    cuts[C].push(best.sC);
    return true;
  };

  const seen = new Uint8Array(N);
  seen[root] = 1;
  let queue = [root], bridges = 0, left = N - 1;
  for (;;) {
    while (queue.length) {
      const P = queue.shift();
      for (const C of nbrs[P]) {
        if (seen[C]) continue;
        if (place(P, C)) { seen[C] = 1; left--; queue.push(C); }
      }
    }
    if (left <= 0) break;
    const from = [], to = [];
    for (let i = 0; i < N; i++) (seen[i] ? from : to).push(i);
    const hit = closestApproach(loops, from, to);
    if (!hit) break;
    const lo = Math.min(hit.a, hit.b), hi = Math.max(hit.a, hit.b);
    pairs.set(lo * N + hi, [lo === hit.a ? { sLo: hit.sA, sHi: hit.sB, d: hit.d } : { sLo: hit.sB, sHi: hit.sA, d: hit.d }]);
    if (place(hit.b, hit.a, true)) { seen[hit.a] = 1; left--; queue.push(hit.a); bridges++; }
    else { seen[hit.a] = 1; left--; }     // cannot happen, but never loop forever
  }

  const out = [];
  const walk = (li, sFrom, dir, D) => {
    const L = loops[li];
    const stops = kids[li]
      .map(k => ({ k, off: dir > 0 ? mod(k.s - sFrom, L.len) : mod(sFrom - k.s, L.len) }))
      .sort((a, b) => a.off - b.off);
    let pos = 0;
    for (const { k, off } of stops) {
      const a = Math.max(pos, off - k.g / 2), b = Math.min(D, off + k.g / 2);
      if (b <= a) continue;
      emitArc(L, sFrom + dir * pos, a - pos, dir, out);
      const Pa = out[out.length - 1];
      const Pb = pointAt(L, sFrom + dir * b);
      const LC = loops[k.child];
      const cm = pointAt(LC, k.sc - k.g / 2), cp = pointAt(LC, k.sc + k.g / 2);
      if (dist(Pa, cm) + dist(Pb, cp) <= dist(Pa, cp) + dist(Pb, cm)) walk(k.child, k.sc - k.g / 2, -1, LC.len - k.g);
      else walk(k.child, k.sc + k.g / 2, 1, LC.len - k.g);
      pos = b;
    }
    emitArc(L, sFrom + dir * pos, D - pos, dir, out);
  };
  walk(root, seamS, 1, loops[root].len);

  // Drop repeated points, steps too small to matter (a cut that lands a few microns from a corner), and
  // points that sit on a straight line.
  const path = [];
  for (const p of out) {
    const n = path.length;
    if (n && dist(path[n - 1], p) < 0.012) continue;
    if (n >= 2) {
      const a = path[n - 2], b = path[n - 1];
      const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      const dot = (b[0] - a[0]) * (p[0] - b[0]) + (b[1] - a[1]) * (p[1] - b[1]);
      if (Math.abs(cross) < 1e-7 * Math.max(1, dist(a, p)) && dot > 0) { path[n - 1] = p; continue; }
    }
    path.push(p);
  }
  if (path.length > 1) {                     // close the loop exactly on its first point
    if (dist(path[0], path[path.length - 1]) < 0.012) path[path.length - 1] = path[0].slice();
    else path.push(path[0].slice());
  }
  return { path, bridges, seam: path[0] || null, cuts };
}

/* ---------- all together ---------- */

export function pathLength(path) {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += dist(path[i - 1], path[i]);
  return L;
}

export function bounds(path) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of path) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

export function buildToolpath(shape, lineWidth) {
  const M = material(shape);
  const loops = concentricLoops(M, lineWidth);
  const first = stitch(loops, lineWidth);
  const { path, bridges, seam } = first;
  // Same loops, same start point, joins moved: for every other layer.
  const pathB = loops.length > 1 ? stitch(loops, lineWidth, [0, 0], first.cuts).path : path;
  return {
    path, pathB, seam, bridges,
    loops: loops.length,
    levels: loops.reduce((m, l) => Math.max(m, l.level + 1), 0),
    length: pathLength(path),
    area: materialArea(M),
    outline: materialToPolys(M),
    bounds: bounds(path),
  };
}
