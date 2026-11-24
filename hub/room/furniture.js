// Furnishings: the seating group, piano, bar counter, writing desk, credenza, lamps, plants, wall art
// and the deck furniture. Everything is static and goes through the kit's batcher.
// Adds what the player cannot walk through to k.obstacles and the lamps to k.lamps.
import { ROOM, DECK } from "./kit.js";

export function buildFurniture(k) {
  const { T, M, box, rbox, cyl, ball, lathe, at, add, mat, rnd, range, pick } = k;
  const PI = Math.PI;
  const obstacle = (x0, x1, z0, z1) => k.obstacles.push([x0, x1, z0, z1]);
  const lamp = (x, y, z, intensity, distance, color = 0xffc98a, extra = {}) => k.lamps.push({ x, y, z, intensity, distance, color, ...extra });

  // ------------------------------------------------------------ rug
  const rug = k.texture(k.canvas(1024, 896, (ctx, w, h) => {
    const C = { field: "#24364c", deep: "#1a2838", rust: "#8f4b38", cream: "#dccfb4", gold: "#b58f50", sage: "#75897a" };
    ctx.fillStyle = C.cream; ctx.fillRect(0, 0, w, h);
    const band = (inset, colour) => { ctx.fillStyle = colour; ctx.fillRect(inset, inset, w - inset * 2, h - inset * 2); };
    band(14, C.rust); band(34, C.cream); band(42, C.deep); band(104, C.cream); band(112, C.rust); band(124, C.field);
    const diamond = (x, y, rx, ry, colour) => { ctx.fillStyle = colour; ctx.beginPath(); ctx.moveTo(x, y - ry); ctx.lineTo(x + rx, y); ctx.lineTo(x, y + ry); ctx.lineTo(x - rx, y); ctx.fill(); };
    const flower = (x, y, r, a, b) => {                 // an eight-pointed star, the way a woven rug would draw a flower
      diamond(x, y, r * 0.95, r * 0.36, a); diamond(x, y, r * 0.36, r * 0.95, a);
      ctx.save(); ctx.translate(x, y); ctx.rotate(PI / 4); ctx.fillStyle = a; ctx.fillRect(-r * 0.42, -r * 0.42, r * 0.84, r * 0.84); ctx.restore();
      diamond(x, y, r * 0.34, r * 0.34, b);
    };
    // border of alternating motifs
    const nx = 18, ny = 15;
    for (let i = 0; i < nx; i++) for (const y of [73, h - 73]) { const x = 73 + (w - 146) * i / (nx - 1); i % 2 ? flower(x, y, 20, C.gold, C.rust) : diamond(x, y, 17, 22, C.sage); }
    for (let i = 1; i < ny - 1; i++) for (const x of [73, w - 73]) { const y = 73 + (h - 146) * i / (ny - 1); i % 2 ? flower(x, y, 20, C.gold, C.rust) : diamond(x, y, 22, 17, C.sage); }
    // field: lattice of small motifs, then the medallion
    for (let gy = 0; gy < 9; gy++) for (let gx = 0; gx < 11; gx++) {
      const x = 170 + (w - 340) * (gx + (gy % 2) * 0.5) / 10.5, y = 170 + (h - 340) * gy / 8;
      if (x > w - 160) continue;
      (gx + gy) % 3 ? diamond(x, y, 9, 12, (gx + gy) % 2 ? C.sage : C.gold) : flower(x, y, 15, C.cream, C.rust);
    }
    const cx = w / 2, cy = h / 2;
    diamond(cx, cy, 330, 250, C.cream); diamond(cx, cy, 318, 240, C.rust); diamond(cx, cy, 286, 214, C.cream); diamond(cx, cy, 278, 207, C.deep);
    for (let i = 0; i < 16; i++) { const t = i * PI / 8; flower(cx + Math.cos(t) * 190, cy + Math.sin(t) * 140, 16, C.gold, C.cream); }
    diamond(cx, cy, 150, 112, C.cream); diamond(cx, cy, 140, 104, C.sage); diamond(cx, cy, 104, 76, C.cream); diamond(cx, cy, 96, 70, C.rust);
    flower(cx, cy, 58, C.cream, C.gold);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + sx * (w / 2 - 124), y = cy + sy * (h / 2 - 124);
      diamond(x, y, 150, 120, C.cream); diamond(x, y, 140, 111, C.rust); diamond(x, y, 100, 80, C.deep); flower(x - sx * 40, y - sy * 32, 22, C.gold, C.cream);
    }
    ctx.strokeStyle = C.field; ctx.lineWidth = 252; ctx.strokeRect(-2, -2, w + 4, h + 4);     // trim the corner medallions back to the field edge
    band(0, "rgba(0,0,0,0)");
    ctx.fillStyle = C.cream; ctx.fillRect(0, 0, w, 14); ctx.fillRect(0, h - 14, w, 14); ctx.fillRect(0, 0, 14, h); ctx.fillRect(w - 14, 0, 14, h);
    for (const [inset, colour, lw] of [[24, C.rust, 20], [38, C.cream, 8], [73, C.deep, 62], [108, C.cream, 8], [118, C.rust, 12]]) { ctx.strokeStyle = colour; ctx.lineWidth = lw; ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2); }
    for (let i = 0; i < nx; i++) for (const y of [73, h - 73]) { const x = 73 + (w - 146) * i / (nx - 1); i % 2 ? flower(x, y, 20, C.gold, C.rust) : diamond(x, y, 17, 22, C.sage); }
    for (let i = 1; i < ny - 1; i++) for (const x of [73, w - 73]) { const y = 73 + (h - 146) * i / (ny - 1); i % 2 ? flower(x, y, 20, C.gold, C.rust) : diamond(x, y, 22, 17, C.sage); }
    for (let y = 0; y < h; y += 3) { ctx.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.06})`; ctx.fillRect(0, y, w, 1); }
    k.grain(ctx, w, h, 0.09, w * h / 5);
  }), { wrap: false });
  box(mat(0xffffff, { rough: 1, map: rug, cast: false }), 6.4, 0.016, 5.6, 0, 0.008, -1.3);
  box(M.linen, 6.46, 0.008, 5.66, 0, 0.004, -1.3);

  // ------------------------------------------------------------ seating
  function sofa(x, z, ry, pillows) {
    at(x, 0, z, ry, () => {
      for (const sx of [-1.2, 1.2]) for (const sz of [-0.4, 0.4]) cyl(M.darkWood, 0.03, 0.022, 0.13, sx, 0.065, sz, null, 8);
      rbox(M.boucle, 2.6, 0.28, 1.0, 0.07, 0, 0.26, 0);
      rbox(M.boucle, 2.6, 0.66, 0.26, 0.11, 0, 0.6, -0.37);
      for (const sx of [-1.19, 1.19]) rbox(M.boucle, 0.25, 0.5, 1.0, 0.11, sx, 0.5, 0);
      for (const sx of [-0.715, 0, 0.715]) {
        rbox(M.boucle, 0.7, 0.2, 0.76, 0.08, sx, 0.47, 0.1);
        rbox(M.boucle, 0.69, 0.44, 0.2, 0.09, sx, 0.76, -0.2, [-0.14, 0, 0]);
      }
      pillows.forEach(([px, material, tilt]) => rbox(material, 0.42, 0.42, 0.15, 0.07, px, 0.78, -0.02, [-0.3, tilt, 0.06 * Math.sign(px)]));
    });
  }
  sofa(-2.5, -1.6, PI / 2, [[-0.92, M.sage, 0.25], [0.95, M.rust, -0.2], [0.62, M.linen, -0.35]]);
  sofa(2.5, -1.6, -PI / 2, [[-0.95, M.navy, 0.2], [0.9, M.ochre, -0.25], [-0.6, M.linen, 0.3]]);
  obstacle(-3.05, -1.95, -2.95, -0.25); obstacle(1.95, 3.05, -2.95, -0.25);
  // a throw over the arm of the east sofa
  at(2.5, 0, -1.6, -PI / 2, () => { rbox(M.rust, 0.3, 0.04, 0.9, 0.02, 1.19, 0.765, 0.02); rbox(M.rust, 0.03, 0.34, 0.86, 0.015, 1.325, 0.6, 0.02); });

  function armchair(x, z, ry) {
    at(x, 0, z, ry, () => {
      for (const sx of [-0.36, 0.36]) for (const sz of [-0.36, 0.36]) cyl(M.darkWood, 0.028, 0.02, 0.14, sx, 0.07, sz, null, 8);
      rbox(M.leather, 0.9, 0.24, 0.88, 0.08, 0, 0.26, 0);
      rbox(M.leather, 0.62, 0.17, 0.66, 0.07, 0, 0.45, 0.07);
      rbox(M.leather, 0.9, 0.64, 0.24, 0.11, 0, 0.6, -0.33, [-0.1, 0, 0]);
      for (const sx of [-0.36, 0.36]) rbox(M.leather, 0.2, 0.42, 0.86, 0.09, sx, 0.47, 0.01);
      rbox(M.linen, 0.46, 0.26, 0.14, 0.065, 0, 0.64, -0.13, [-0.12, 0, 0]);
    });
  }
  armchair(-1.2, 0.85, PI - 0.22); armchair(1.2, 0.85, PI + 0.22);
  obstacle(-1.7, -0.7, 0.35, 1.35); obstacle(0.7, 1.7, 0.35, 1.35);

  // coffee table: marble on a brass frame (the chess set lives on it)
  at(0, 0, -1.6, 0, () => {
    box(M.marble, 0.9, 0.04, 1.7, 0, 0.42, 0);
    for (const sx of [-0.41, 0.41]) for (const sz of [-0.81, 0.81]) box(M.brass, 0.03, 0.4, 0.03, sx, 0.2, sz);
    for (const sx of [-0.41, 0.41]) { box(M.brass, 0.03, 0.03, 1.62, sx, 0.385, 0); box(M.brass, 0.03, 0.03, 1.62, sx, 0.13, 0); }
    for (const sz of [-0.81, 0.81]) { box(M.brass, 0.82, 0.03, 0.03, 0, 0.385, sz); box(M.brass, 0.82, 0.03, 0.03, 0, 0.13, sz); }
    box(M.walnut, 0.8, 0.02, 1.6, 0, 0.15, 0);
    [[0.12, -0.4, 0.34, 0x2f4f3e], [0.1, -0.38, 0.3, 0xc9b28a], [-0.1, 0.45, 0.36, 0x1f3a5f], [-0.12, 0.46, 0.3, 0x8a3a2a]].forEach(([bx, bz, len, c], i) =>
      box(M.books, 0.24, 0.035, len, bx, 0.18 + (i % 2) * 0.036, bz, [0, 0.12 * (i - 1.5), 0], c));
    // tray, candles and a bowl of flowers at the far end
    box(M.brassDull, 0.5, 0.015, 0.36, 0.05, 0.447, -0.56); for (const s of [-1, 1]) box(M.brassDull, 0.5, 0.03, 0.012, 0.05, 0.455, -0.56 + s * 0.18);
    lathe(M.ceramic, [[0, 0], [0.08, 0], [0.12, 0.06], [0.11, 0.14], [0.07, 0.19], [0.085, 0.21]], -0.06, 0.455, -0.6);
    for (let i = 0; i < 11; i++) {
      const a = rnd() * 6.283, r = 0.03 + rnd() * 0.12, y = 0.72 + rnd() * 0.16;
      cyl(M.leafA, 0.004, 0.004, y - 0.6, -0.06 + Math.cos(a) * r * 0.5, 0.6 + (y - 0.6) / 2, -0.6 + Math.sin(a) * r * 0.5, [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], 4);
      ball(M.paint, range(0.035, 0.055), -0.06 + Math.cos(a) * r, y, -0.6 + Math.sin(a) * r, [1, 0.8, 1], pick([0xf6e9dc, 0xf3c9c0, 0xe8a9a0, 0xfbf3e4]), 1);
    }
    for (const [cx, ch] of [[0.2, 0.11], [0.27, 0.07]]) { cyl(M.ivory, 0.028, 0.028, ch, cx, 0.455 + ch / 2, -0.5, null, 10); ball(M.bulb, 0.009, cx, 0.468 + ch, -0.5, [1, 1.8, 1]); }
  });
  obstacle(-0.5, 0.5, -2.5, -0.7);

  // side tables and lamps at the fire end of each sofa
  function tableLamp(x, z, shadeH = 0.26) {
    at(x, 0, z, 0, () => {
      cyl(M.walnut, 0.3, 0.3, 0.03, 0, 0.585, 0, null, 28); cyl(M.brass, 0.018, 0.018, 0.56, 0, 0.29, 0, null, 8); cyl(M.brass, 0.2, 0.22, 0.02, 0, 0.01, 0, null, 24);
      lathe(M.ceramic, [[0, 0], [0.07, 0], [0.085, 0.02], [0.11, 0.12], [0.1, 0.22], [0.04, 0.3], [0.02, 0.34]], 0, 0.6, 0);
      cyl(M.brass, 0.008, 0.008, 0.14, 0, 1.0, 0, null, 6);
      add(M.shade, new T.CylinderGeometry(0.15, 0.21, shadeH, 28, 1, true), 0, 1.13, 0);
      ball(M.bulb, 0.035, 0, 1.1, 0);
    });
    obstacle(x - 0.32, x + 0.32, z - 0.32, z + 0.32);
    lamp(x, 1.2, z, 5, 7);
  }
  tableLamp(-2.5, -3.4); tableLamp(2.5, -3.4);

  // arc floor lamp over the east armchair
  at(2.3, 0, 1.7, 0, () => {
    cyl(M.marble, 0.19, 0.19, 0.05, 0, 0.025, 0, null, 24);
    const curve = new T.CatmullRomCurve3([[0, 0.05, 0], [0.03, 1.2, 0], [-0.08, 1.85, -0.1], [-0.4, 2.12, -0.35], [-0.75, 2.02, -0.6]].map((p) => new T.Vector3(...p)));
    add(M.brass, new T.TubeGeometry(curve, 30, 0.014, 8), 0, 0, 0);
    add(M.shade, new T.CylinderGeometry(0.1, 0.2, 0.2, 24, 1, true), -0.76, 1.9, -0.61);
    ball(M.bulb, 0.03, -0.76, 1.9, -0.61);
  });
  obstacle(2.08, 2.52, 1.48, 1.92);
  lamp(1.54, 1.75, 1.09, 3.5, 5);

  // ------------------------------------------------------------ chandelier
  at(0, 0, -1.6, 0, () => {
    cyl(M.brass, 0.1, 0.12, 0.04, 0, ROOM.h - 0.22, 0, null, 20);
    cyl(M.brass, 0.012, 0.012, 0.9, 0, ROOM.h - 0.67, 0, null, 6);
    for (const [r, y, n] of [[0.8, 3.02, 12], [0.48, 3.3, 8]]) {
      add(M.brass, new T.TorusGeometry(r, 0.016, 8, 64), 0, y, 0, [PI / 2, 0, 0]);
      for (let i = 0; i < n; i++) {
        const a = (i + (r < 0.6 ? 0.5 : 0)) / n * PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
        cyl(M.brass, 0.022, 0.012, 0.03, x, y + 0.03, z, null, 8); cyl(M.ivory, 0.011, 0.011, 0.09, x, y + 0.09, z, null, 6);
        ball(M.bulb, 0.02, x, y + 0.155, z, [1, 1.6, 1], null, 1);
      }
      for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.4; k.rod(M.brass, 0.005, [Math.cos(a) * r, y, Math.sin(a) * r], [0, 3.72, 0]); }
    }
  });
  lamp(0, 2.95, -1.6, 16, 13, 0xffd2a0);

  // ------------------------------------------------------------ grand piano
  const P = { x: -6.95, z: 2.5 };
  at(P.x, 0, P.z, 0, () => {
    const outline = (x0) => {
      const s = new T.Shape();
      s.moveTo(x0, 0.75); s.lineTo(2.2, 0.75); s.quadraticCurveTo(2.36, 0.75, 2.36, 0.58); s.lineTo(2.36, 0.3);
      s.bezierCurveTo(2.36, -0.18, 1.86, -0.12, 1.58, -0.44); s.bezierCurveTo(1.4, -0.66, 1.24, -0.75, 1.0, -0.75); s.lineTo(x0, -0.75);
      return s;
    };
    const slab = (x0, depth, bevel) => new T.ExtrudeGeometry(outline(x0), { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 18 }).rotateX(-PI / 2);
    add(M.lacquer, slab(0, 0.3, 0.012), 0, 0.66, 0);
    add(mat(0x9b7a3a, { rough: 0.4, metal: 0.85 }), slab(0.78, 0.004, 0), 0, 0.975, 0, null, [0.985, 1, 0.96]);
    for (let i = 0; i < 26; i++) box(M.steel, 1.3 - i * 0.03, 0.002, 0.004, 1.42 - i * 0.012, 0.981, -0.62 + i * 0.045, [0, 0.02 * i - 0.2, 0]);
    box(M.lacquer, 0.6, 0.03, 1.5, 0.45, 0.99, 0);                                       // front flap, closed
    at(0, 1.0, -0.75, [-0.5, 0, 0], () => add(M.lacquer, slab(0.76, 0.028, 0.004), 0, 0, 0.75));
    cyl(M.brass, 0.008, 0.008, 0.64, 1.3, 1.3, 0.5, [0.12, 0, 0], 6);
    box(M.lacquer, 0.3, 0.13, 1.46, -0.12, 0.72, 0);
    box(M.ivory, 0.15, 0.022, 1.24, -0.18, 0.795, 0);
    for (let i = 0; i < 52; i++) box(M.ebony, 0.15, 0.024, 0.0025, -0.18, 0.795, -0.62 + i * (1.24 / 52));
    for (let i = 0; i < 51; i++) if (![2, 6].includes(i % 7)) box(M.ebony, 0.09, 0.02, 0.013, -0.145, 0.812, -0.608 + (i + 0.5) * (1.24 / 52));
    box(M.lacquer, 0.03, 0.15, 1.46, 0.015, 0.87, 0);
    for (const s of [-1, 1]) box(M.lacquer, 0.3, 0.1, 0.1, -0.12, 0.83, s * 0.68);
    box(M.lacquer, 0.02, 0.26, 0.74, 0.2, 1.12, 0, [0, 0, -0.22]); box(M.lacquer, 0.07, 0.015, 0.74, 0.13, 1.01, 0);
    box(M.paper, 0.004, 0.22, 0.34, 0.185, 1.12, 0.02, [0, 0, -0.22]);
    for (const [lx, lz] of [[0.2, -0.62], [0.2, 0.62], [1.95, -0.2]]) { cyl(M.lacquer, 0.05, 0.035, 0.6, lx, 0.36, lz, null, 10); cyl(M.brass, 0.03, 0.03, 0.05, lx, 0.035, lz, null, 10); }
    box(M.lacquer, 0.06, 0.5, 0.2, 0.22, 0.4, 0); box(M.lacquer, 0.12, 0.05, 0.3, 0.2, 0.16, 0);
    for (const s of [-1, 0, 1]) box(M.brass, 0.1, 0.012, 0.03, 0.13, 0.12, s * 0.09);
    // bench
    rbox(mat(0x191614, { rough: 0.5 }), 0.36, 0.08, 0.8, 0.03, -0.55, 0.5, 0);
    for (const sx of [-0.69, -0.41]) for (const sz of [-0.34, 0.34]) cyl(M.lacquer, 0.02, 0.016, 0.46, sx, 0.23, sz, null, 8);
  });
  obstacle(P.x - 0.8, P.x + 2.45, P.z - 0.85, P.z + 0.85);

  // ------------------------------------------------------------ credenza under the screen (west wall)
  at(ROOM.x0, 0, -1.2, PI / 2, () => {
    box(M.walnut, 2.6, 0.56, 0.5, 0, 0.5, 0.25);
    box(M.darkWood, 2.64, 0.03, 0.54, 0, 0.795, 0.26);
    for (let i = 0; i < 56; i++) cyl(M.walnut, 0.02, 0.02, 0.5, -1.26 + i * 0.0458, 0.5, 0.5, null, 6);
    for (const sx of [-1.2, 1.2]) for (const sz of [0.06, 0.44]) cyl(M.brass, 0.014, 0.01, 0.22, sx, 0.11, sz, null, 8);
    lathe(M.terracotta, [[0, 0], [0.07, 0], [0.11, 0.1], [0.09, 0.24], [0.045, 0.3], [0.06, 0.33]], -1.05, 0.81, 0.25);
    for (let i = 0; i < 5; i++) cyl(M.stem, 0.004, 0.004, 0.5, -1.05 + range(-0.05, 0.05), 1.3, 0.25 + range(-0.04, 0.04), [range(-0.25, 0.25), 0, range(-0.25, 0.25)], 4);
    [[0x1f3a5f, 0.3], [0xc9b28a, 0.27], [0x7a2e2a, 0.24]].forEach(([c, len], i) => box(M.books, len, 0.04, 0.21, 1.0, 0.83 + i * 0.041, 0.26, [0, 0.1 * i, 0], c));
    ball(M.brass, 0.05, 1.0, 1.0, 0.26);
  });
  obstacle(ROOM.x0, ROOM.x0 + 0.62, -2.6, 0.2);

  // ------------------------------------------------------------ bar counter (south-west)
  at(-5.9, 0, ROOM.z1, PI, () => {                       // local x runs west (world -x), z into the room
    box(M.cabinet, 3.4, 0.86, 0.6, 0, 0.5, 0.3); box(M.wallDeep, 3.4, 0.07, 0.56, 0, 0.035, 0.28);
    box(M.marble, 3.5, 0.045, 0.68, 0, 0.9525, 0.33);
    box(M.marble, 3.5, 0.62, 0.02, 0, 1.285, 0.01);
    for (let i = 0; i < 4; i++) {
      const dx = -1.275 + i * 0.85;
      box(M.cabinet, 0.8, 0.74, 0.02, dx, 0.5, 0.61);
      for (const [fw, fh, fx, fy] of [[0.8, 0.08, 0, 0.83], [0.8, 0.08, 0, 0.17], [0.08, 0.58, -0.36, 0.5], [0.08, 0.58, 0.36, 0.5]]) box(M.cabinet, fw, fh, 0.014, dx + fx, fy, 0.625);
      box(M.brass, 0.014, 0.16, 0.02, dx + (i % 2 ? -0.3 : 0.3), 0.62, 0.645);
    }
    for (const y of [1.82, 2.3]) {
      box(M.walnut, 3.2, 0.04, 0.26, 0, y, 0.13);
      for (const sx of [-1.4, 1.4]) box(M.brass, 0.02, 0.14, 0.02, sx, y - 0.09, 0.03);
      box(M.strip, 3.1, 0.008, 0.02, 0, y - 0.024, 0.2);
    }
    const bottle = [[0, 0], [0.036, 0], [0.038, 0.16], [0.03, 0.2], [0.013, 0.24], [0.013, 0.3], [0.016, 0.31]];
    for (let i = 0; i < 9; i++) lathe(M.paint, bottle, -1.35 + i * 0.17 + range(-0.02, 0.02), 2.32, 0.12, 10, null, [1, range(0.85, 1.15), 1], pick([0x2f4a2c, 0x5a3a1c, 0x1d3340, 0x7a5a22, 0x3a1f1f]));
    const glassware = mat(0xe8f2f2, { rough: 0.05, transparent: true, opacity: 0.32, depthWrite: false, cast: false });
    for (let i = 0; i < 12; i++) cyl(glassware, 0.034, 0.028, 0.1, 0.35 + (i % 6) * 0.11, 1.89, 0.08 + Math.floor(i / 6) * 0.1, null, 12);
    for (let i = 0; i < 5; i++) cyl(M.ceramic, 0.09, 0.07, 0.012, -1.1, 1.846 + i * 0.013, 0.13, null, 20);
    for (let i = 0; i < 3; i++) lathe(M.ceramic, [[0.03, 0], [0.07, 0.01], [0.08, 0.05], [0.075, 0.055], [0.066, 0.015]], -0.75, 1.84 + i * 0.03, 0.13, 16);
    lathe(M.brass, [[0, 0], [0.05, 0], [0.05, 0.02], [0.02, 0.03], [0.02, 0.2], [0.07, 0.24]], -0.3, 1.84, 0.13, 14);
    // pendants
    for (const px of [-0.85, 0.85]) {
      cyl(M.brass, 0.004, 0.004, ROOM.h - 2.5, px, (ROOM.h + 2.5) / 2, 0.45, null, 4);
      lathe(M.brass, [[0.02, 0.2], [0.05, 0.17], [0.16, 0.04], [0.17, 0]], px, 2.3, 0.45, 20);
      ball(M.bulb, 0.04, px, 2.33, 0.45);
    }
    // stools
    for (const sx of [-0.75, 0.75]) at(sx, 0, 1.05, 0, () => {
      rbox(M.leather, 0.36, 0.07, 0.36, 0.035, 0, 0.72, 0);
      for (const [lx, lz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) cyl(M.brass, 0.012, 0.012, 0.7, lx * 1.1, 0.35, lz * 1.1, [lz * 0.5, 0, -lx * 0.5], 6);
      add(M.brass, new T.TorusGeometry(0.19, 0.009, 6, 24), 0, 0.26, 0, [PI / 2, 0, 0]);
    });
  });
  obstacle(-7.7, -4.1, ROOM.z1 - 0.72, ROOM.z1); obstacle(-6.95, -4.85, 4.62, 5.28);
  lamp(-5.9, 2.15, 5.5, 7, 8);

  // ------------------------------------------------------------ writing desk under the south window
  at(5.3, 0, ROOM.z1, PI, () => {                        // local x = world -x
    box(M.walnut, 2.7, 0.045, 0.8, 0, 0.7475, 0.47);
    for (const sx of [-1.02, 1.02]) {
      box(M.walnut, 0.6, 0.6, 0.72, sx, 0.42, 0.47);
      for (const [y, hh] of [[0.62, 0.14], [0.45, 0.16], [0.24, 0.22]]) { box(M.darkWood, 0.54, hh, 0.012, sx, y, 0.835); box(M.brass, 0.14, 0.014, 0.02, sx, y, 0.85); }
      for (const lz of [0.16, 0.78]) for (const lx of [-0.26, 0.26]) box(M.darkWood, 0.04, 0.12, 0.04, sx + lx, 0.06, lz);
    }
    box(M.walnut, 1.44, 0.1, 0.02, 0, 0.67, 0.82);
    // banker's lamp
    at(1.0, 0.77, 0.4, 0, () => {
      cyl(M.brass, 0.09, 0.1, 0.02, 0, 0.01, 0, null, 20); cyl(M.brass, 0.012, 0.012, 0.3, 0, 0.16, 0, null, 8);
      add(mat(0x1f6a4a, { rough: 0.25, emissive: 0x124a30, emissiveIntensity: 0.7 }), new T.CylinderGeometry(0.075, 0.075, 0.3, 16, 1, false, 0, PI), 0, 0.32, 0, [0, PI / 2, PI / 2]);
      box(M.bulb, 0.24, 0.012, 0.05, 0, 0.3, 0);
    });
    // desk things
    cyl(M.leather, 0.045, 0.04, 0.1, 0.55, 0.82, 0.25, null, 14);
    for (let i = 0; i < 4; i++) cyl(M.paint, 0.004, 0.004, 0.17, 0.55 + range(-0.02, 0.02), 0.9, 0.25 + range(-0.02, 0.02), [range(-0.2, 0.2), 0, range(-0.2, 0.2)], 5, pick([0x1f3a5f, 0x222222, 0xb03a2e]));
    [[0x2f4f3e, 0.3], [0xa85a3a, 0.26]].forEach(([c, len], i) => box(M.books, len, 0.035, 0.2, -1.05, 0.79 + i * 0.036, 0.4, [0, 0.2 - i * 0.3, 0], c));
    box(M.paper, 0.21, 0.004, 0.3, 0.28, 0.772, 0.55, [0, 0.2, 0]); box(M.leather, 0.5, 0.006, 0.36, -0.25, 0.773, 0.56);
    // chair
    at(0.1, 0, 1.3, PI + 0.3, () => {
      rbox(M.leather, 0.5, 0.08, 0.48, 0.035, 0, 0.47, 0);
      rbox(M.leather, 0.48, 0.42, 0.07, 0.03, 0, 0.82, -0.23, [-0.1, 0, 0]);
      for (const [lx, lz] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.2], [0.21, 0.2]]) cyl(M.walnut, 0.022, 0.016, 0.44, lx, 0.22, lz, null, 8);
      for (const lx of [-0.21, 0.21]) cyl(M.walnut, 0.018, 0.018, 0.5, lx, 0.72, -0.235, [-0.1, 0, 0], 8);
    });
  });
  obstacle(3.85, 6.75, ROOM.z1 - 0.95, ROOM.z1); obstacle(4.85, 5.55, 4.35, 5.05);
  lamp(4.3, 1.2, 5.35, 2.4, 4.5, 0xffd9a8);

  // ------------------------------------------------------------ plants
  function plant(x, z, height, potMat = M.ceramic) {
    at(x, 0, z, rnd() * 6, () => {
      lathe(potMat, [[0, 0], [0.2, 0], [0.27, 0.36], [0.29, 0.42], [0.25, 0.42], [0.23, 0.38]], 0, 0, 0, 20);
      cyl(M.soot, 0.24, 0.24, 0.02, 0, 0.37, 0, null, 16);
      cyl(M.stem, 0.022, 0.035, height, 0, 0.38 + height / 2, 0, [0.04, 0, 0.03], 6);
      const n = Math.round(height * 16);
      for (let i = 0; i < n; i++) {
        const t = 0.3 + 0.7 * (i / n), a = i * 2.4, y = 0.4 + height * t, r = 0.2 + 0.28 * Math.sin(t * PI) + rnd() * 0.08;
        ball(i % 3 ? M.leafA : M.leafB, 0.2, Math.cos(a) * r, y, Math.sin(a) * r, [0.62, 0.05, 1], null, 1);
        k.add(i % 3 ? M.leafA : M.leafB, new T.IcosahedronGeometry(0.2, 1), Math.cos(a) * r, y + 0.02, Math.sin(a) * r, [range(-0.6, 0.2), -a + PI / 2, range(-0.3, 0.3)], [0.6, 0.05, 1]);
      }
    });
    obstacle(x - 0.4, x + 0.4, z - 0.4, z + 0.4);
  }
  plant(-7.25, -5.25, 1.9); plant(7.35, 5.35, 1.6, M.terracotta);

  // ------------------------------------------------------------ wall art
  const artworks = [
    (ctx, w, h) => {                                     // dusk hills
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#27405c"); g.addColorStop(0.5, "#d98e5f"); g.addColorStop(0.62, "#f2c58a"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ["#7c6a7c", "#4f5670", "#33415a", "#1d2b3c"].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * (0.56 + i * 0.1) + Math.sin(x * 0.012 + i * 2) * 26 + Math.sin(x * 0.04 + i) * 9); ctx.lineTo(w, h); ctx.fill(); });
    },
    (ctx, w, h) => {                                     // colour fields
      ctx.fillStyle = "#e8dfcc"; ctx.fillRect(0, 0, w, h);
      [["#b0603a", 0.08, 0.1, 0.5, 0.5], ["#2b3c55", 0.42, 0.34, 0.5, 0.56], ["#c99a45", 0.14, 0.66, 0.34, 0.24], ["#7d9079", 0.6, 0.08, 0.3, 0.2]].forEach(([c, x, y, ww, hh]) => { ctx.fillStyle = c; ctx.globalAlpha = 0.9; ctx.fillRect(x * w, y * h, ww * w, hh * h); });
      ctx.globalAlpha = 1;
    },
    (ctx, w, h) => {                                     // ink circles
      ctx.fillStyle = "#efe7d6"; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 7; i++) { ctx.strokeStyle = `rgba(30,44,48,${0.25 + i * 0.1})`; ctx.lineWidth = 3 + i * 2; ctx.beginPath(); ctx.arc(w * 0.5 + i * 6, h * 0.52 - i * 4, 40 + i * 26, 0.4 + i, 5.6 + i); ctx.stroke(); }
      ctx.fillStyle = "#c2623c"; ctx.beginPath(); ctx.arc(w * 0.68, h * 0.3, 26, 0, 7); ctx.fill();
    },
  ];
  function painting(which, w, h, wall) {
    const texture = k.texture(k.canvas(512, Math.round(512 * h / w), (ctx, cw, ch) => { artworks[which](ctx, cw, ch); k.grain(ctx, cw, ch, 0.05); }), { wrap: false });
    wall(() => {
      box(M.brass, w + 0.1, h + 0.1, 0.04, 0, 0, 0.02); box(M.darkWood, w + 0.04, h + 0.04, 0.05, 0, 0, 0.025);
      box(mat(0xffffff, { rough: 0.85, map: texture }), w, h, 0.012, 0, 0, 0.05);
    });
  }
  painting(1, 1.5, 1.05, (fn) => at(ROOM.x0, 2.45, 2.5, PI / 2, fn));              // above the piano
  painting(2, 0.8, 1.1, (fn) => at(-7.05, 2.45, ROOM.z0, 0, fn));
  painting(0, 0.8, 1.1, (fn) => at(7.05, 2.45, ROOM.z0, 0, fn));

  // sconces on the chimney breast
  for (const s of [-1, 1]) at(s * 1.58, 2.35, ROOM.z0 + 0.6, 0, () => {
    cyl(M.brass, 0.05, 0.05, 0.012, 0, 0, 0.006, [PI / 2, 0, 0], 16); cyl(M.brass, 0.008, 0.008, 0.1, 0, 0, 0.05, [PI / 2, 0, 0], 6);
    cyl(M.brass, 0.008, 0.008, 0.1, 0, 0.04, 0.1, null, 6);
    add(M.shade, new T.CylinderGeometry(0.06, 0.085, 0.15, 18, 1, true), 0, 0.14, 0.1);
  });
  lamp(0, 2.7, ROOM.z0 + 1.3, 5, 6);

  // ------------------------------------------------------------ deck
  function lounger(x, z) {
    at(x, 0, z, 0, () => {
      box(M.teak, 1.9, 0.06, 0.66, 0, 0.26, 0);
      for (const sx of [-0.85, 0.85]) for (const sz of [-0.29, 0.29]) box(M.teak, 0.06, 0.26, 0.06, sx, 0.13, sz);
      rbox(M.outCushion, 1.3, 0.1, 0.6, 0.04, 0.28, 0.34, 0);
      rbox(M.outCushion, 0.7, 0.1, 0.6, 0.04, -0.62, 0.52, 0, [0, 0, -0.62]);
      box(M.teak, 0.7, 0.04, 0.64, -0.63, 0.46, 0, [0, 0, -0.62]);
    });
  }
  lounger(11.9, -3.75); lounger(11.9, -2.55);
  at(11.6, 0, -3.15, 0, () => { cyl(M.teak, 0.2, 0.2, 0.03, 0, 0.36, 0, null, 20); cyl(M.outSteel, 0.02, 0.1, 0.36, 0, 0.18, 0, null, 8); });
  obstacle(10.85, 12.95, -4.2, -2.1);
  function planter(x, z, tall) {
    at(x, 0, z, 0, () => {
      box(M.planter, 0.5, 0.5, 0.5, 0, 0.25, 0);
      if (tall) for (let i = 0; i < 26; i++) cyl(M.hedge, 0.004, 0.012, range(0.6, 1.1), range(-0.16, 0.16), 0.85, range(-0.16, 0.16), [range(-0.25, 0.25), 0, range(-0.25, 0.25)], 4);
      else ball(M.hedge, 0.36, 0, 0.78, 0, null, null, 2);
    });
    obstacle(x - 0.3, x + 0.3, z - 0.3, z + 0.3);
  }
  planter(DECK.x1 - 0.45, DECK.z0 + 0.45, true); planter(DECK.x1 - 0.45, DECK.z1 - 0.45, true);
  planter(DECK.x0 + 0.5, DECK.z0 + 0.45, false); planter(DECK.x0 + 0.5, DECK.z1 - 0.45, false);
  // a pair of chairs and a low table at the south end, and a telescope for after dark
  for (const [cx, cz, ry] of [[10.4, 3.5, -PI / 2 - 0.35], [11.2, 4.4, -PI + 0.1]]) at(cx, 0, cz, ry, () => {
    box(M.teak, 0.7, 0.05, 0.7, 0, 0.3, 0); for (const sx of [-0.31, 0.31]) for (const sz of [-0.31, 0.31]) box(M.teak, 0.05, 0.6, 0.05, sx, 0.3, sz);
    box(M.teak, 0.7, 0.4, 0.05, 0, 0.6, -0.32); for (const sx of [-0.33, 0.33]) box(M.teak, 0.05, 0.04, 0.7, sx, 0.6, 0);
    rbox(M.outCushion, 0.58, 0.12, 0.58, 0.05, 0, 0.39, 0.02); rbox(M.outCushion, 0.56, 0.36, 0.12, 0.05, 0, 0.6, -0.24, [-0.12, 0, 0]);
  });
  at(11.6, 0, 3.3, 0, () => { cyl(M.stone, 0.32, 0.26, 0.4, 0, 0.2, 0, null, 20); cyl(M.outSteel, 0.24, 0.24, 0.02, 0, 0.41, 0, null, 20);
    box(M.outSteel, 0.14, 0.24, 0.14, 0, 0.54, 0); box(M.bulb, 0.08, 0.14, 0.08, 0, 0.54, 0); });
  obstacle(9.95, 12.0, 2.85, 4.85);
  at(13.0, 0, 1.4, -0.5, () => {
    for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3; cyl(M.teak, 0.016, 0.012, 1.25, Math.cos(a) * 0.24, 0.58, Math.sin(a) * 0.24, [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4], 6); }
    cyl(M.brassDull, 0.03, 0.03, 0.1, 0, 1.2, 0, null, 10);
    cyl(M.brassDull, 0.05, 0.04, 0.9, 0.05, 1.36, 0, [0, 0, -1.05], 16); cyl(M.outSteel, 0.056, 0.056, 0.08, 0.41, 1.57, 0, [0, 0, -1.05], 16);
    cyl(M.outSteel, 0.018, 0.018, 0.12, -0.36, 1.2, 0, [0, 0, -1.05], 8);
  });
  obstacle(12.65, 13.4, 1.05, 1.75);
}

// Books and ornaments for every shelf niche the artefacts have not claimed.
export function fillShelves(k, niches) {
  const { T, M, box, cyl, ball, lathe, rbox, rnd, range, pick } = k;
  const SPINES = [0x7a2e2a, 0x1f3a5f, 0x2f4f3e, 0xc9b28a, 0xe6dcc6, 0x4a2f24, 0x8a6d3b, 0x26262b, 0xa85a3a, 0x5c6b7a, 0xd8c7a3, 0x6b1f2a, 0x2c5a63];
  const vase = () => pick([
    [[0, 0], [0.05, 0], [0.09, 0.08], [0.085, 0.18], [0.04, 0.26], [0.05, 0.3]],
    [[0, 0], [0.06, 0], [0.07, 0.14], [0.035, 0.2], [0.03, 0.3], [0.045, 0.32]],
    [[0, 0], [0.07, 0], [0.12, 0.05], [0.125, 0.09], [0.112, 0.09], [0.1, 0.055], [0.05, 0.016], [0, 0.016]],
  ]);
  const ornament = (x, y, z, tall) => {
    const kind = Math.floor(rnd() * 5);
    if (kind === 0) lathe(pick([M.ceramic, M.terracotta, M.brassDull]), vase(), x, y, z, 16, null, tall ? 1.5 : 1);
    else if (kind === 1) { box(M.marble, 0.1, 0.03, 0.1, x, y + 0.015, z); ball(M.brass, 0.07, x, y + 0.1, z); }
    else if (kind === 2) { lathe(M.terracotta, [[0, 0], [0.06, 0], [0.08, 0.1], [0.07, 0.1]], x, y, z, 14); for (let i = 0; i < 7; i++) ball(M.leafB, 0.07, x + range(-0.07, 0.07), y + 0.14 + rnd() * 0.1, z + range(-0.05, 0.05), [1, 0.5, 1], null, 1); }
    else if (kind === 3) { box(M.brass, 0.2, 0.26, 0.02, x, y + 0.14, z, [-0.18, 0.2, 0]); box(M.paint, 0.16, 0.22, 0.022, x, y + 0.14, z + 0.002, [-0.18, 0.2, 0], pick([0xdccfb6, 0x9fb2a6, 0xc4a089])); }
    else { for (let i = 0; i < 3; i++) box(M.books, 0.26 - i * 0.02, 0.036, 0.19, x, y + 0.018 + i * 0.037, z, [0, range(-0.2, 0.2), 0], pick(SPINES)); ball(M.ceramic, 0.045, x, y + 0.16, z); }
  };
  for (const n of niches) {
    if (n.used) continue;
    const left = n.x - n.w / 2 + 0.03, right = n.x + n.w / 2 - 0.03;
    if (n.level === 0) { ornament(n.x + range(-0.15, 0.15), n.y, n.z + 0.1, true); if (rnd() < 0.6) ornament(n.x + (rnd() < 0.5 ? -0.28 : 0.28), n.y, n.z + 0.16, false); continue; }
    let x = left, gapAt = rnd() < 0.7 ? left + range(0.25, 0.6) : 99;
    while (x < right - 0.04) {
      if (x > gapAt) { const w = Math.min(0.26, right - x); if (w > 0.16) ornament(x + w / 2, n.y, n.z + 0.03, false); x += w + 0.02; gapAt = 99; continue; }
      const t = range(0.024, 0.056), h = Math.min(n.h - 0.06, range(0.2, 0.31)), d = range(0.15, 0.2);
      const lean = rnd() < 0.07 && x > left + 0.1 ? 0.2 : 0;
      box(M.books, t, h, d, x + t / 2 + lean * h * 0.5, n.y + h / 2, n.z - 0.05 + d / 2, [0, 0, -lean], pick(SPINES));
      if (rnd() < 0.3) box(M.brassDull, t + 0.001, 0.008, d + 0.001, x + t / 2 + lean * h * 0.5, n.y + h * range(0.7, 0.85), n.z - 0.05 + d / 2, [0, 0, -lean]);
      x += t + 0.002 + lean * h;
    }
  }
}
