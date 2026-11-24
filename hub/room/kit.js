// Building kit for the living room: seeded randomness, canvas textures, shared materials and a
// batcher that merges every static part sharing a material into one mesh, so the whole house costs
// a few dozen draw calls. three.js is passed in (it is loaded from the CDN by room.js).

export const ROOM = { x0: -8, x1: 8, z0: -6, z1: 6, h: 4.4 };
export const DECK = { x0: 8.3, x1: 13.8, z0: -5.4, z1: 5.4 };
export const DOOR = { z0: -4.8, z1: 4.8, h: 3.4, open: 1.6 };

export function createKit(T, { anisotropy = 4 } = {}) {
  // ------------------------------------------------------------ randomness and noise
  let seed = 20261124;
  const rnd = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const range = (a, b) => a + (b - a) * rnd();
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const hash = (x, y) => {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, octaves = 4) {
    let sum = 0, amp = 0.5, total = 0;
    for (let i = 0; i < octaves; i++) { sum += noise(x, y) * amp; total += amp; x *= 2.03; y *= 2.03; amp *= 0.5; }
    return sum / total;
  }

  // ------------------------------------------------------------ textures
  function canvas(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    return c;
  }
  function texture(source, { repeat, srgb = true, wrap = true } = {}) {
    const t = new T.CanvasTexture(source);
    if (srgb) t.colorSpace = T.SRGBColorSpace;
    if (wrap) t.wrapS = t.wrapT = T.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = anisotropy;
    return t;
  }
  // Speckle a canvas with fine light and dark grain.
  function grain(ctx, w, h, amount = 0.06, count = w * h / 6) {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${rnd() * amount})` : `rgba(0,0,0,${rnd() * amount})`;
      ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  }

  // ------------------------------------------------------------ materials
  const outdoor = [];
  function mat(color, { rough = 0.8, metal = 0, out = false, cast = true, receive = true, uv = 0, physical = false, ...rest } = {}) {
    const m = new (physical ? T.MeshPhysicalMaterial : T.MeshStandardMaterial)({ color, roughness: rough, metalness: metal, ...rest });
    if (!cast) m.userData.noCast = true;
    if (!receive) m.userData.noReceive = true;
    if (uv) m.userData.uvScale = uv;       // metres per texture repeat, box-projected after merging
    if (out) outdoor.push(m);              // lit by the open sky rather than by the room
    return m;
  }

  // ------------------------------------------------------------ batching
  const stack = [new T.Matrix4()];
  let bins = new Map();
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const tmpQ = new T.Quaternion(), tmpE = new T.Euler(), tmpP = new T.Vector3(), tmpS = new T.Vector3();

  function compose(x, y, z, rot, scale) {
    const m = new T.Matrix4();
    if (rot) tmpQ.setFromEuler(tmpE.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, "YXZ")); else tmpQ.identity();
    if (scale == null) tmpS.set(1, 1, 1);
    else if (typeof scale === "number") tmpS.set(scale, scale, scale);
    else tmpS.set(scale[0], scale[1], scale[2]);
    return m.compose(tmpP.set(x, y, z), tmpQ, tmpS);
  }
  // Run fn with every part it adds placed relative to (x, y, z), turned by ry.
  function at(x, y, z, ry, fn) {
    stack.push(compose(x, y, z, Array.isArray(ry) ? ry : [0, ry || 0, 0]).premultiply(stack[stack.length - 1]));
    try { return fn(); } finally { stack.pop(); }
  }
  const current = () => stack[stack.length - 1];
  function add(material, geometry, x = 0, y = 0, z = 0, rot, scale, color) {
    let bin = bins.get(material);
    if (!bin) bins.set(material, bin = []);
    bin.push({ geometry, matrix: compose(x, y, z, rot, scale).premultiply(current()), color });
  }
  const box = (material, w, h, d, x, y, z, rot, color) => add(material, unitBox, x, y, z, rot, [w, h, d], color);
  const cyl = (material, rTop, rBottom, h, x, y, z, rot, segments = 20, color) =>
    add(material, new T.CylinderGeometry(rTop, rBottom, h, segments), x, y, z, rot, null, color);
  const ball = (material, r, x, y, z, scale, color, detail = 2) =>
    add(material, new T.IcosahedronGeometry(r, detail), x, y, z, null, scale, color);
  // A rod from point a to point b.
  const UP = new T.Vector3(0, 1, 0);
  function rod(material, radius, a, b, segments = 6) {
    const from = new T.Vector3(...a), to = new T.Vector3(...b), dir = to.clone().sub(from), length = dir.length();
    const matrix = new T.Matrix4().compose(from.add(to).multiplyScalar(0.5), new T.Quaternion().setFromUnitVectors(UP, dir.normalize()), new T.Vector3(1, 1, 1));
    let bin = bins.get(material);
    if (!bin) bins.set(material, bin = []);
    bin.push({ geometry: new T.CylinderGeometry(radius, radius, length, segments), matrix: matrix.premultiply(current()) });
  }
  const roundedCache = new Map();
  function roundedGeometry(w, h, d, r) {
    const key = [w, h, d, r].map((n) => n.toFixed(3)).join();
    if (roundedCache.has(key)) return roundedCache.get(key);
    r = Math.min(r, w / 2, h / 2, d / 2);
    const g = new T.BoxGeometry(w, h, d, 5, 5, 5);
    const p = g.attributes.position, n = g.attributes.normal, v = new T.Vector3(), c = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(T.MathUtils.clamp(v.x, -w / 2 + r, w / 2 - r), T.MathUtils.clamp(v.y, -h / 2 + r, h / 2 - r), T.MathUtils.clamp(v.z, -d / 2 + r, d / 2 - r));
      v.sub(c);
      if (v.lengthSq() > 1e-10) { v.normalize(); n.setXYZ(i, v.x, v.y, v.z); p.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r); }
    }
    roundedCache.set(key, g);
    return g;
  }
  const rbox = (material, w, h, d, r, x, y, z, rot, color) => add(material, roundedGeometry(w, h, d, r), x, y, z, rot, null, color);
  function lathe(material, profile, x, y, z, segments = 20, rot, scale, color) {
    add(material, new T.LatheGeometry(profile.map(([r, h]) => new T.Vector2(r, h)), segments), x, y, z, rot, scale, color);
  }

  // Merge everything added so far into one mesh per material.
  function flush(parent) {
    const v = new T.Vector3(), normalMatrix = new T.Matrix3(), tint = new T.Color();
    for (const [material, parts] of bins) {
      let vertices = 0, indices = 0;
      const coloured = parts.some((p) => p.color != null);
      for (const { geometry: g } of parts) {
        vertices += g.attributes.position.count;
        indices += g.index ? g.index.count : g.attributes.position.count;
      }
      const position = new Float32Array(vertices * 3), normal = new Float32Array(vertices * 3), uv = new Float32Array(vertices * 2);
      const colour = coloured ? new Float32Array(vertices * 3) : null;
      const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
      const scale = material.userData.uvScale;
      let vo = 0, io = 0;
      for (const { geometry: g, matrix, color } of parts) {
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        normalMatrix.getNormalMatrix(matrix);
        if (colour) tint.set(color == null ? 0xffffff : color);
        for (let i = 0; i < P.count; i++) {
          const o = (vo + i) * 3;
          v.fromBufferAttribute(P, i).applyMatrix4(matrix);
          position[o] = v.x; position[o + 1] = v.y; position[o + 2] = v.z;
          const px = v.x, py = v.y, pz = v.z;
          v.fromBufferAttribute(N, i).applyMatrix3(normalMatrix).normalize();
          normal[o] = v.x; normal[o + 1] = v.y; normal[o + 2] = v.z;
          const t = (vo + i) * 2, ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
          if (scale) {
            if (ay >= ax && ay >= az) { uv[t] = px / scale; uv[t + 1] = pz / scale; }
            else if (ax >= az) { uv[t] = pz / scale; uv[t + 1] = py / scale; }
            else { uv[t] = px / scale; uv[t + 1] = py / scale; }
          } else if (U) { uv[t] = U.getX(i); uv[t + 1] = U.getY(i); }
          if (colour) { colour[o] = tint.r; colour[o + 1] = tint.g; colour[o + 2] = tint.b; }
        }
        if (g.index) for (let i = 0; i < g.index.count; i++) index[io++] = g.index.getX(i) + vo;
        else for (let i = 0; i < P.count; i++) index[io++] = vo + i;
        vo += P.count;
      }
      const merged = new T.BufferGeometry();
      merged.setAttribute("position", new T.BufferAttribute(position, 3));
      merged.setAttribute("normal", new T.BufferAttribute(normal, 3));
      merged.setAttribute("uv", new T.BufferAttribute(uv, 2));
      if (colour) { merged.setAttribute("color", new T.BufferAttribute(colour, 3)); material.vertexColors = true; }
      merged.setIndex(new T.BufferAttribute(index, 1));
      const mesh = new T.Mesh(merged, material);
      mesh.castShadow = !material.userData.noCast && !material.transparent;
      mesh.receiveShadow = !material.userData.noReceive;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
    bins.clear();
  }

  // Build parts with fn and hand back their merged geometry instead of adding them to the scene
  // (for instanced trees and the like). Colours passed to the parts become vertex colours.
  function bake(fn) {
    const saved = bins, holder = new T.Group();
    bins = new Map();
    try { fn(); flush(holder); } finally { bins = saved; }
    return holder.children[0].geometry;
  }

  // A real, movable mesh, for the parts that animate.
  function mesh(geometry, material, x = 0, y = 0, z = 0, parent) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = !material.userData.noCast && !material.transparent;
    m.receiveShadow = !material.userData.noReceive;
    if (parent) parent.add(m);
    return m;
  }

  // ------------------------------------------------------------ shared textures and materials
  const tex = {};
  tex.parquet = texture(canvas(1024, 1024, (ctx, w) => {
    const U = 32, px = w / U, L = 4;                 // 32 x 32 plank widths, herringbone, tiles seamlessly
    const plank = (x, y, pw, ph) => {
      const tone = 0.72 + rnd() * 0.5, warm = rnd() * 14 - 4;
      ctx.fillStyle = `rgb(${(128 + warm) * tone | 0},${(84 + warm * 0.6) * tone | 0},${48 * tone | 0})`;
      ctx.fillRect(x * px, y * px, pw * px, ph * px);
      ctx.save(); ctx.beginPath(); ctx.rect(x * px, y * px, pw * px, ph * px); ctx.clip();
      const along = pw > ph;
      for (let i = 0; i < 16; i++) {
        ctx.strokeStyle = `rgba(${rnd() < 0.5 ? "40,20,6" : "235,190,130"},${0.04 + rnd() * 0.1})`;
        ctx.lineWidth = 0.6 + rnd() * 1.4;
        ctx.beginPath();
        const o = rnd() * px, wob = (rnd() - 0.5) * 5;
        if (along) { ctx.moveTo(x * px, y * px + o); ctx.bezierCurveTo((x + 1.3) * px, y * px + o + wob, (x + 2.6) * px, y * px + o - wob, (x + pw) * px, y * px + o); }
        else { ctx.moveTo(x * px + o, y * px); ctx.bezierCurveTo(x * px + o + wob, (y + 1.3) * px, x * px + o - wob, (y + 2.6) * px, x * px + o, (y + ph) * px); }
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(24,12,4,.55)"; ctx.lineWidth = 1.2;
      ctx.strokeRect(x * px + 0.5, y * px + 0.5, pw * px - 1, ph * px - 1);
    };
    const R = U / (2 * L) + 1;
    for (let y = -L; y < U + L; y++) for (let m = -R; m <= R; m++) plank(y + 2 * L * m, y, L, 1);
    for (let x = -L; x < U + L; x++) for (let m = -R; m <= R; m++) plank(x, x - 2 * L + 1 + 2 * L * m, 1, L);
  }));
  tex.grain = texture(canvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#8a8a8a"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      ctx.strokeStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "255,255,255"},${0.03 + rnd() * 0.09})`;
      ctx.lineWidth = 0.5 + rnd() * 2.5;
      const y = rnd() * h, wob = (rnd() - 0.5) * 16;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + wob, w * 0.7, y - wob, w, y); ctx.stroke();
    }
  }));
  tex.fabric = texture(canvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#c9c9c9"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 2) {
      ctx.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.07})`; ctx.fillRect(i, 0, 1, h);
      ctx.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.07})`; ctx.fillRect(0, i, w, 1);
    }
    grain(ctx, w, h, 0.1);
  }));
  tex.marble = texture(canvas(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#ece7df"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const g = ctx.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, 160 + rnd() * 200);
      g.addColorStop(0, `rgba(${rnd() < 0.5 ? "255,255,255" : "196,190,182"},.16)`); g.addColorStop(1, "rgba(220,214,206,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < 26; i++) {
      let x = rnd() * w, y = rnd() * h, angle = rnd() * 6.28;
      ctx.strokeStyle = `rgba(${90 + rnd() * 50 | 0},${88 + rnd() * 40 | 0},${92 + rnd() * 40 | 0},${0.1 + rnd() * 0.3})`;
      ctx.lineWidth = 0.6 + rnd() * rnd() * 5;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 40; s++) { angle += (rnd() - 0.5) * 0.9; x += Math.cos(angle) * 22; y += Math.sin(angle) * 22; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    grain(ctx, w, h, 0.03);
  }));
  tex.deck = texture(canvas(512, 512, (ctx, w, h) => {
    const boards = 8, bh = h / boards;
    for (let b = 0; b < boards; b++) {
      const tone = 0.8 + rnd() * 0.35;
      ctx.fillStyle = `rgb(${146 * tone | 0},${112 * tone | 0},${82 * tone | 0})`; ctx.fillRect(0, b * bh, w, bh);
      for (let i = 0; i < 22; i++) {
        ctx.strokeStyle = `rgba(${rnd() < 0.6 ? "50,30,14" : "230,200,160"},${0.05 + rnd() * 0.1})`; ctx.lineWidth = 0.6 + rnd() * 1.6;
        const y = b * bh + rnd() * bh, wob = (rnd() - 0.5) * 6;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + wob, w * 0.7, y - wob, w, y); ctx.stroke();
      }
      ctx.fillStyle = "rgba(20,12,6,.8)"; ctx.fillRect(0, b * bh, w, 3);
    }
  }));

  // Walls darken toward the floor and the cornice, and each ceiling coffer toward its beams: a cheap
  // stand-in for the soft shadow that gathers in corners.
  tex.wallShade = texture(canvas(8, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, "#8f8f8f"); g.addColorStop(0.07, "#c9c9c9"); g.addColorStop(0.3, "#f4f4f4"); g.addColorStop(0.62, "#ffffff"); g.addColorStop(0.9, "#d2d2d2"); g.addColorStop(1, "#a2a2a2");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }));
  tex.coffer = texture(canvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    for (const [x0, y0, x1, y1] of [[0, 0, 46, 0], [w, 0, w - 46, 0], [0, 0, 0, 46], [0, h, 0, h - 46]]) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, "rgba(96,84,70,.5)"); g.addColorStop(1, "rgba(96,84,70,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
  }), { repeat: [6 / 16, 4 / 12] });

  const M = {
    wall: mat(0x4d6a5e, { rough: 0.74, map: tex.wallShade, uv: ROOM.h }),
    wallDeep: mat(0x2c4039, { rough: 0.8 }),
    cabinet: mat(0x34493f, { rough: 0.55 }),
    niche: mat(0x4f6a5c, { rough: 0.85 }),
    trim: mat(0xe9e2d2, { rough: 0.6 }),
    ceiling: mat(0xf0eadc, { rough: 0.9, map: tex.coffer, uv: 1 }),
    floor: mat(0xffffff, { rough: 0.36, map: tex.parquet, uv: 2.88 }),
    walnut: mat(0x6b452b, { rough: 0.45, map: tex.grain, uv: 0.9 }),
    darkWood: mat(0x3a2619, { rough: 0.5, map: tex.grain, uv: 0.9 }),
    oak: mat(0xb08a5e, { rough: 0.55, map: tex.grain, uv: 0.9 }),
    brass: mat(0xcfa55b, { rough: 0.26, metal: 1 }),
    brassDull: mat(0xb08a4c, { rough: 0.45, metal: 0.9 }),
    steel: mat(0x17191b, { rough: 0.42, metal: 0.7 }),
    chrome: mat(0xd9dde0, { rough: 0.15, metal: 1 }),
    marble: mat(0xffffff, { rough: 0.22, map: tex.marble, uv: 1.6 }),
    soot: mat(0x14110f, { rough: 0.95 }),
    linen: mat(0xe2d8c5, { rough: 0.95, map: tex.fabric, bumpMap: tex.fabric, bumpScale: 0.6, uv: 0.35 }),
    boucle: mat(0xefe8da, { rough: 1, map: tex.fabric, bumpMap: tex.fabric, bumpScale: 0.8, uv: 0.25 }),
    leather: mat(0x8c4f2a, { rough: 0.48 }),
    sage: mat(0x7d9079, { rough: 0.95, map: tex.fabric, uv: 0.3 }),
    rust: mat(0xb0603a, { rough: 0.95, map: tex.fabric, uv: 0.3 }),
    navy: mat(0x2b3c55, { rough: 0.95, map: tex.fabric, uv: 0.3 }),
    ochre: mat(0xc99a45, { rough: 0.95, map: tex.fabric, uv: 0.3 }),
    ceramic: mat(0xf0ece4, { rough: 0.3 }),
    terracotta: mat(0xb5694a, { rough: 0.85 }),
    black: mat(0x0c0c0d, { rough: 0.5 }),
    lacquer: mat(0x050506, { rough: 0.07, envMapIntensity: 0.8 }),
    ivory: mat(0xf2ead8, { rough: 0.35 }),
    ebony: mat(0x1a1513, { rough: 0.35 }),
    paper: mat(0xf4efe4, { rough: 0.9 }),
    leafA: mat(0x3f6b3a, { rough: 0.6 }),
    leafB: mat(0x587f3f, { rough: 0.6 }),
    stem: mat(0x4a3b28, { rough: 0.9 }),
    books: mat(0xffffff, { rough: 0.75 }),
    paint: mat(0xffffff, { rough: 0.6 }),                         // tinted per part
    glass: mat(0xcfe3e6, { rough: 0.04, metal: 0, transparent: true, opacity: 0.16, depthWrite: false, cast: false, receive: false, side: T.DoubleSide }),
    cloche: mat(0xffffff, { rough: 0.03, transparent: true, opacity: 0.14, depthWrite: false, cast: false, receive: false }),
    shade: mat(0xfff0d2, { rough: 0.9, emissive: 0xffc98a, emissiveIntensity: 1.5, cast: false, side: T.DoubleSide }),
    bulb: mat(0xfff2d8, { emissive: 0xffd9a0, emissiveIntensity: 5, cast: false }),
    strip: mat(0xffe2b4, { emissive: 0xffd49a, emissiveIntensity: 2.2, cast: false }),
    // outdoors
    stucco: mat(0xe6dfd0, { rough: 0.95, out: true }),
    deck: mat(0xffffff, { rough: 0.7, map: tex.deck, uv: 1.1, out: true }),
    deckTrim: mat(0x6e5540, { rough: 0.8, out: true }),
    outSteel: mat(0x1b1d1f, { rough: 0.45, metal: 0.6, out: true }),
    outGlass: mat(0xd6eaee, { rough: 0.03, transparent: true, opacity: 0.13, depthWrite: false, cast: false, receive: false, out: true, side: T.DoubleSide }),
    outCushion: mat(0xece5d6, { rough: 1, map: tex.fabric, uv: 0.3, out: true }),
    teak: mat(0xa9794e, { rough: 0.7, map: tex.grain, uv: 0.8, out: true }),
    planter: mat(0x3b3f41, { rough: 0.8, out: true }),
    hedge: mat(0x35592f, { rough: 0.95, out: true }),
    stone: mat(0x9a9488, { rough: 0.95, out: true }),
  };

  return { T, rnd, range, pick, noise, fbm, canvas, texture, grain, mat, M, tex, outdoor, at, add, box, rbox, cyl, rod, ball, lathe, flush, bake, mesh, roundedGeometry, anim: [] };
}
