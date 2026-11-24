// Everything beyond the glass: a golden-hour sky, the lawn running down to a lake, forest, hills and
// far mountains, plus the garden around the deck. Returns the sun direction and a sky-only scene that
// room.js turns into the environment map for outdoor materials.
import { DECK } from "./kit.js";

const SKY_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAGMENT = `
uniform vec3 sunDir;
uniform float time;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += noise(p) * a; p = p * 2.03 + 11.0; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  float s = max(dot(d, sunDir), 0.0);
  float toward = pow(s, 2.5);                                   // 1 looking at the sun, 0 away from it
  vec3 col = mix(vec3(0.34, 0.50, 0.76), vec3(0.08, 0.20, 0.50), smoothstep(0.0, 0.7, h));
  vec3 band = mix(vec3(0.74, 0.56, 0.62), vec3(0.98, 0.50, 0.16), toward);
  col = mix(col, band, exp(-h * 6.0) * 0.95);
  col = mix(col, vec3(1.0, 0.64, 0.32), exp(-h * 2.2) * toward * 0.5);
  col += vec3(1.0, 0.50, 0.16) * pow(s, 12.0) * 0.35;
  col += vec3(1.0, 0.74, 0.40) * pow(s, 160.0) * 0.9;
  vec2 uv = d.xz / (d.y + 0.22) * 1.5 + vec2(time * 0.003, 0.0);
  float c = smoothstep(0.52, 0.82, fbm(uv)) * smoothstep(0.015, 0.22, d.y);
  float wisps = smoothstep(0.55, 0.9, fbm(uv * vec2(0.5, 2.4) + 40.0)) * smoothstep(0.1, 0.5, d.y) * 0.35;
  vec3 lit = mix(vec3(0.90, 0.72, 0.72), vec3(1.0, 0.62, 0.34), 0.25 + 0.75 * toward);
  vec3 cloud = mix(lit, vec3(0.50, 0.46, 0.60), (1.0 - pow(s, 0.5)) * 0.5);
  col = mix(col, cloud, clamp(c * 0.8 + wisps, 0.0, 1.0));
  col += vec3(1.0, 0.90, 0.68) * smoothstep(0.9997, 0.99992, s) * 34.0;
  col = mix(col, vec3(0.40, 0.44, 0.38), smoothstep(0.0, -0.15, d.y));
  gl_FragColor = vec4(col * 0.86, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function buildOutdoors(k, scene) {
  const { T, M, box, cyl, ball, rbox, at, mat, rnd, range, pick, fbm, noise } = k;
  const sunDir = new T.Vector3(0.86, 0.34, 0.38).normalize();
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ------------------------------------------------------------ sky
  const skyMat = new T.ShaderMaterial({
    uniforms: { sunDir: { value: sunDir }, time: { value: 0 } },
    vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: T.BackSide, depthWrite: false, fog: false,
  });
  const sky = new T.Mesh(new T.SphereGeometry(900, 48, 24), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);
  const skyScene = new T.Scene();
  skyScene.add(new T.Mesh(sky.geometry, skyMat));
  k.anim.push((t) => { skyMat.uniforms.time.value = t; });

  // ------------------------------------------------------------ terrain
  const LAWN = -0.56, WATER = -1.5;
  function height(x, z) {
    const r = Math.hypot(x - 2, z);
    let h = LAWN + smoothstep(20, 70, r) * (fbm(x * 0.013 + 7, z * 0.013 + 3) - 0.47) * 10;
    h += smoothstep(130, 380, r) * (8 + fbm(x * 0.006 + 20, z * 0.006) * 70);
    const lake = 1 - smoothstep(0.5, 1.0, Math.hypot((x - 100) / 66, (z - 14) / 105));
    return h + (-5 - h) * lake;
  }
  const ground = new T.PlaneGeometry(1400, 1400, 150, 150);
  ground.rotateX(-Math.PI / 2);
  {
    const p = ground.attributes.position, colours = new Float32Array(p.count * 3), c = new T.Color();
    const grassA = new T.Color(0x5d7f33), grassB = new T.Color(0x7c9440), sand = new T.Color(0xb7a57a), forest = new T.Color(0x2f5230), rock = new T.Color(0x6f7684);
    for (let i = 0; i < p.count; i++) {
      // Pull the grid in toward the house so the lawn and shoreline get the detail.
      const gx = p.getX(i), gz = p.getZ(i), stretch = 0.25 + 0.75 * Math.pow(Math.max(Math.abs(gx), Math.abs(gz)) / 700, 1.4);
      const x = gx * stretch + 20, z = gz * stretch, h = height(x, z);
      p.setXYZ(i, x, h, z);
      c.copy(grassA).lerp(grassB, fbm(x * 0.05, z * 0.05, 3));
      c.lerp(forest, smoothstep(6, 30, h) * 0.8).lerp(rock, smoothstep(45, 75, h));
      c.lerp(sand, smoothstep(-0.9, -1.35, h));
      colours[i * 3] = c.r; colours[i * 3 + 1] = c.g; colours[i * 3 + 2] = c.b;
    }
    ground.setAttribute("color", new T.BufferAttribute(colours, 3));
    ground.computeVertexNormals();
  }
  const turf = k.texture(k.canvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#d6d6d6"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      ctx.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${rnd() * 0.2})` : `rgba(0,0,0,${rnd() * 0.22})`;
      const x = rnd() * w, y = rnd() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rnd() * 3 - 1.5, y - 2 - rnd() * 5); ctx.stroke();
    }
  }));
  const groundMat = mat(0xffffff, { rough: 1, vertexColors: true, map: turf, out: true });
  {
    const p = ground.attributes.position, uv = ground.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3, p.getZ(i) / 3);
  }
  const terrain = new T.Mesh(ground, groundMat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ------------------------------------------------------------ lake
  const ripples = k.canvas(256, 256, (ctx, w, h) => {
    const P = 8, lattice = (x, y) => { const X = ((x % P) + P) % P, Y = ((y % P) + P) % P; return Math.abs(Math.sin(X * 12.9898 + Y * 78.233) * 43758.5453) % 1; };
    const pn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
      return lattice(xi, yi) * (1 - a) * (1 - b) + lattice(xi + 1, yi) * a * (1 - b) + lattice(xi, yi + 1) * (1 - a) * b + lattice(xi + 1, yi + 1) * a * b; };
    const hgt = (x, y) => pn(x * P / w, y * P / h) + 0.5 * pn(x * 2 * P / w + 3, y * 2 * P / h + 1);
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1), o = (y * w + x) * 4;
      img.data[o] = 128 + dx * 420; img.data[o + 1] = 128 + dy * 420; img.data[o + 2] = 255; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
  const rippleTex = k.texture(ripples, { srgb: false, repeat: [70, 70] });
  const water = new T.Mesh(new T.CircleGeometry(260, 48).rotateX(-Math.PI / 2),
    mat(0x1f4a58, { rough: 0.12, metal: 0.35, normalMap: rippleTex, normalScale: new T.Vector2(0.35, 0.35), out: true, cast: false }));
  water.position.set(100, WATER, 14);
  scene.add(water);
  k.anim.push((t) => { rippleTex.offset.set(t * 0.012, t * 0.007); });

  // ------------------------------------------------------------ far mountains
  function ridge(radius, base, amp, tint, snow, seedOffset) {
    const N = 220, pos = [], col = [], idx = [], low = new T.Color(0xd9b49c), top = new T.Color(tint), white = new T.Color(snow);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2, u = Math.cos(a) * 3 + seedOffset, v = Math.sin(a) * 3 + seedOffset * 1.7;
      const n = fbm(u, v, 5), peak = base + amp * Math.pow(n, 1.6) * 2.2 * (0.55 + 0.45 * Math.abs(Math.sin(a * 2.5 + seedOffset)));
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      pos.push(x, -20, z, x, peak * 0.55, z, x * 0.985, peak, z * 0.985);
      const c = top.clone().lerp(white, smoothstep(amp * 0.75, amp * 1.25, peak) * 0.8);
      col.push(low.r, low.g, low.b, (low.r + top.r) / 2, (low.g + top.g) / 2, (low.b + top.b) / 2, c.r, c.g, c.b);
      if (i < N) { const o = i * 3; idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, fog: false, side: T.DoubleSide }));
    m.frustumCulled = false;
    scene.add(m);
  }
  ridge(820, 60, 150, 0x566a9a, 0xf6dccb, 2.0);
  ridge(690, 40, 80, 0x41607a, 0x7890a2, 9.0);

  // ------------------------------------------------------------ forest
  const treeMat = mat(0xffffff, { rough: 1, out: true, cast: false });
  const conifer = k.bake(() => {
    cyl(treeMat, 0.1, 0.16, 1.4, 0, 0.7, 0, null, 6, 0x4a3524);
    [[1.55, 2.6, 2.1, 0x2c4a2b], [1.2, 2.3, 3.5, 0x315230], [0.8, 2.0, 4.8, 0x3a5c34], [0.42, 1.4, 5.9, 0x44663a]].forEach(([r, h, y, c]) =>
      k.add(treeMat, new T.ConeGeometry(r, h, 7), 0, y, 0, null, null, c));
  });
  const broadleaf = k.bake(() => {
    cyl(treeMat, 0.14, 0.24, 2.6, 0, 1.3, 0, null, 6, 0x4b3a2a);
    [[0, 4.2, 0, 1.9, 0x4c7435], [1.2, 3.6, 0.3, 1.3, 0x57803b], [-1.1, 3.7, -0.4, 1.4, 0x426a31], [0.2, 3.5, -1.2, 1.2, 0x5d8540], [-0.2, 5.3, 0.4, 1.2, 0x628a42]]
      .forEach(([x, y, z, r, c]) => ball(treeMat, r, x, y, z, [1, 0.85, 1], c, 1));
  });
  function scatter(geometry, count, pickSpot) {
    const mesh = new T.InstancedMesh(geometry, treeMat, count), m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 40; tries++) {
      const spot = pickSpot();
      if (!spot) continue;
      const [x, z, size] = spot, h = height(x, z);
      if (h < -1.0) continue;
      q.setFromEuler(e.set(0, rnd() * 6.28, 0)); s.set(size, size * range(0.9, 1.25), size);
      mesh.setMatrixAt(placed++, m.compose(p.set(x, h - 0.1, z), q, s));
    }
    mesh.count = placed;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const clearing = (x, z) => x > 5 && x < 48 && Math.abs(z - 3) < 16 + (x - 5) * 0.55;       // keep the view to the water open
  scatter(conifer, 620, () => {
    const a = rnd() * 6.283, r = 34 + Math.pow(rnd(), 0.7) * 360, x = Math.cos(a) * r + 2, z = Math.sin(a) * r;
    if (clearing(x, z) || noise(x * 0.018 + 5, z * 0.018) < 0.4) return null;
    return [x, z, range(1.2, 2.6)];
  });
  scatter(broadleaf, 110, () => {
    const a = rnd() * 6.283, r = 24 + rnd() * 120, x = Math.cos(a) * r + 2, z = Math.sin(a) * r;
    if (clearing(x, z) || noise(x * 0.03, z * 0.03 + 9) < 0.45) return null;
    return [x, z, range(1.0, 1.9)];
  });

  // ------------------------------------------------------------ garden: shade trees, hedges, planting, a dock
  const bark = mat(0x4a392a, { rough: 1, out: true }), leaves = mat(0xffffff, { rough: 0.9, out: true });
  function shadeTree(x, z, size, blobs) {
    at(x, LAWN, z, rnd() * 6, () => {
      cyl(bark, 0.16 * size, 0.3 * size, 3.4 * size, 0, 1.7 * size, 0, [0.04, 0, 0.05], 8);
      for (const [a, tilt] of [[0.4, 0.7], [2.5, 0.8], [4.4, 0.65]])
        cyl(bark, 0.06 * size, 0.13 * size, 2.4 * size, Math.cos(a) * 0.7 * size, 3.9 * size, Math.sin(a) * 0.7 * size, [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt], 6);
      for (let i = 0; i < blobs; i++) {
        const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 2.6 * size, y = (4.3 + rnd() * 2.6 - r * 0.25) * size;
        ball(leaves, range(0.55, 1.05) * size, Math.cos(a) * r, y, Math.sin(a) * r, [1, 0.7, 1], pick([0x4d7a35, 0x5b8a3c, 0x6a9442, 0x3f6a2f, 0x7a9c48]), 1);
      }
    });
  }
  shadeTree(20.5, 9.2, 1.0, 46);
  shadeTree(17.5, -13.5, 1.15, 40);
  shadeTree(-14, 3, 1.2, 40);
  shadeTree(-13, -9, 1.0, 34);
  shadeTree(1, 14, 1.1, 36);

  const bloom = mat(0xffffff, { rough: 0.8, out: true });
  for (const side of [-1, 1]) {
    rbox(M.hedge, 6.4, 0.9, 0.9, 0.3, 11.2, LAWN + 0.45, side * (DECK.z1 + 0.75));
    for (let i = 0; i < 9; i++) {
      const x = 14.6 + rnd() * 1.4, z = side * (0.8 + i * 0.62) + range(-0.2, 0.2);
      ball(M.hedge, range(0.3, 0.5), x, LAWN + 0.3, z, [1, 0.8, 1]);
      for (let f = 0; f < 5; f++) ball(bloom, 0.07, x + range(-0.3, 0.3), LAWN + range(0.45, 0.7), z + range(-0.3, 0.3), null, pick([0xf2c4d0, 0xfff1e0, 0xd98ca4, 0xe7b24f, 0xc7a0e0]), 0);
    }
  }
  for (let i = 0; i < 9; i++) { const sx = 15.6 + i * 1.5, sz = 0.4 * Math.sin(i * 1.3); rbox(M.stone, 0.9, 0.06, 0.6, 0.03, sx, height(sx, sz) + 0.01, sz, [0, range(-0.2, 0.2), 0]); }
  // dock and rowing boat on the lake
  const dockX = 40;
  for (let i = 0; i < 12; i++) if (height(dockX + i * 2, 4) < WATER + 0.2) {
    for (let j = i - 1; j < i + 6; j++) {
      box(M.teak, 2.02, 0.08, 1.7, dockX + j * 2, WATER + 0.55, 4);
      for (const s of [-1, 1]) cyl(M.deckTrim, 0.07, 0.07, 2.2, dockX + j * 2, WATER - 0.2, 4 + s * 0.8, null, 6);
    }
    at(dockX + (i + 5) * 2, WATER, 6.2, 0.3, () => {
      rbox(M.teak, 2.6, 0.42, 1.0, 0.2, 0, 0.12, 0);
      rbox(mat(0x3a2a1f, { rough: 0.9, out: true }), 2.3, 0.3, 0.78, 0.15, 0, 0.22, 0);
    });
    break;
  }

  return { sunDir, skyScene, height, LAWN };
}
