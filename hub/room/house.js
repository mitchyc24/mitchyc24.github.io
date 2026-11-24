// The shell of the living room: floor, panelled walls, windows, the patio doors, coffered ceiling,
// fireplace, built-in shelving and the deck outside. Returns the shelf niches for furniture.js to fill.
import { ROOM, DECK, DOOR } from "./kit.js";

export function buildHouse(k) {
  const { T, M, box, cyl, at, add, mat } = k;
  const H = ROOM.h, PI = Math.PI;

  // A frame of reference per wall: local x runs along the wall, local z points into the room.
  const on = {
    n: (c, fn) => at(c, 0, ROOM.z0, 0, fn),
    s: (c, fn) => at(c, 0, ROOM.z1, PI, fn),
    w: (c, fn) => at(ROOM.x0, 0, c, PI / 2, fn),
    e: (c, fn) => at(ROOM.x1, 0, c, -PI / 2, fn),
  };

  // ------------------------------------------------------------ floor, ceiling, roof
  box(M.floor, 16, 0.1, 12, 0, -0.05, 0);
  box(M.ceiling, 16, 0.1, 12, 0, H + 0.05, 0);
  const edge = k.texture(k.canvas(256, 192, (ctx, w, h) => {
    for (const [x0, y0, x1, y1] of [[0, 0, 40, 0], [w, 0, w - 22, 0], [0, 0, 0, 40], [0, h, 0, h - 40]]) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, "rgba(10,8,6,.62)"); g.addColorStop(1, "rgba(10,8,6,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
  }), { wrap: false });
  box(mat(0xffffff, { map: edge, transparent: true, depthWrite: false, rough: 1, cast: false, polygonOffset: true, polygonOffsetFactor: -2 }), 16, 0.002, 12, 0, 0.002, 0);
  for (let i = 1; i < 6; i++) box(M.trim, 0.26, 0.2, 12, -8 + (16 / 6) * i, H - 0.1, 0);
  for (let j = 1; j < 4; j++) box(M.trim, 16, 0.2, 0.26, 0, H - 0.1, -6 + 3 * j);
  for (const [w, d, x, z] of [[16, 0.16, 0, -5.92], [16, 0.16, 0, 5.92], [0.16, 12, -7.92, 0], [0.16, 12, 7.92, 0]]) {
    box(M.trim, w, 0.12, d, x, H - 0.06, z);
    box(M.trim, w === 16 ? 16 : 0.09, 0.07, d === 12 ? 12 : 0.09, x + (w === 16 ? 0 : Math.sign(x) * 0.035), H - 0.155, z + (d === 12 ? 0 : Math.sign(z) * 0.035));
  }
  // Roof slab, with an eave over the deck. It starts on top of the 0.1 m ceiling slab: an underside at exactly
  // H would sit in the same plane as the ceiling and flicker against it.
  box(M.stucco, 18.6, 0.46, 13.8, 0.5, H + 0.33, 0);

  // ------------------------------------------------------------ walls
  const solid = (wall, a, b, y0, y1) => {
    if (y1 === H) y1 = H + 0.1;                                      // full-height walls rise to meet the roof slab
    const len = b - a, mid = (a + b) / 2, h = y1 - y0, y = (y0 + y1) / 2;
    if (wall === "n") box(M.wall, len, h, 0.3, mid, y, ROOM.z0 - 0.15);
    if (wall === "s") box(M.wall, len, h, 0.3, mid, y, ROOM.z1 + 0.15);
    if (wall === "w") box(M.wall, 0.3, h, len, ROOM.x0 - 0.15, y, mid);
    if (wall === "e") { box(M.wall, 0.12, h, len, ROOM.x1 + 0.06, y, mid); box(M.stucco, 0.18, h, len, ROOM.x1 + 0.21, y, mid); }
  };
  const WIN = { w: [[-5.2, -3.6], [3.2, 4.8]], wy: [0.7, 3.4], s: [4.3, 6.3], sy: [1.2, 3.2] };
  solid("n", -8.3, 8.1, 0, H);
  solid("s", -8.3, WIN.s[0], 0, H); solid("s", WIN.s[1], 8.1, 0, H);
  solid("s", WIN.s[0], WIN.s[1], 0, WIN.sy[0]); solid("s", WIN.s[0], WIN.s[1], WIN.sy[1], H);
  solid("w", -6, WIN.w[0][0], 0, H); solid("w", WIN.w[0][1], WIN.w[1][0], 0, H); solid("w", WIN.w[1][1], 6, 0, H);
  for (const [a, b] of WIN.w) { solid("w", a, b, 0, WIN.wy[0]); solid("w", a, b, WIN.wy[1], H); }
  solid("e", -6.3, DOOR.z0, 0, H); solid("e", DOOR.z1, 6.3, 0, H); solid("e", DOOR.z0, DOOR.z1, DOOR.h, H);

  // Applied mouldings: baseboard, chair rail and picture-frame panels, all in the wall colour.
  function frame(cx, y0, y1, w, material = M.wall, s = 0.045, d = 0.022) {
    box(material, w, s, d, cx, y0 + s / 2, d / 2); box(material, w, s, d, cx, y1 - s / 2, d / 2);
    box(material, s, y1 - y0 - 2 * s, d, cx - w / 2 + s / 2, (y0 + y1) / 2, d / 2);
    box(material, s, y1 - y0 - 2 * s, d, cx + w / 2 - s / 2, (y0 + y1) / 2, d / 2);
  }
  function panelling(len, { upper = true, lower = true, rail = true } = {}) {
    box(M.wall, len, 0.24, 0.03, 0, 0.12, 0.015);
    box(M.wall, len, 0.03, 0.045, 0, 0.255, 0.0225);
    if (rail) box(M.wall, len, 0.06, 0.04, 0, 1.0, 0.02);
    const n = Math.max(1, Math.round(len / 1.35)), gap = 0.17, w = (len - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const cx = -len / 2 + gap + w / 2 + i * (w + gap);
      if (lower) frame(cx, 0.38, 0.88, w);
      if (upper) frame(cx, 1.14, 3.92, w);
    }
  }
  on.n(-7.05, () => panelling(1.9)); on.n(7.05, () => panelling(1.9));
  on.w(-5.6, () => panelling(0.8)); on.w(-0.2, () => panelling(6.8)); on.w(5.4, () => panelling(1.2));
  on.s(-5.8, () => panelling(4.4, { upper: false, lower: false, rail: false }));
  on.s(-2.3, () => panelling(2.6, { upper: false }));
  on.s(2.7, () => panelling(3.2, { upper: false }));
  on.s(7.15, () => panelling(1.7));
  on.e(-5.4, () => panelling(1.2)); on.e(5.4, () => panelling(1.2));

  // ------------------------------------------------------------ windows
  const curtainMat = mat(0xe8dfcc, { rough: 1, side: T.DoubleSide, map: k.tex.fabric });
  function curtain(width, height, x, y, flip = 1) {
    const g = new T.PlaneGeometry(width, height, 44, 8), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), drop = 0.5 - py / height;            // 0 at the rod, 1 at the hem
      p.setZ(i, Math.sin(px * 34 + Math.sin(py * 1.7) * 0.6) * (0.035 + 0.03 * drop) + Math.sin(px * 9 + 1) * 0.02);
      p.setX(i, px * (1 - 0.06 * Math.sin(drop * PI)) + flip * 0.02 * drop);
    }
    g.computeVertexNormals();
    add(curtainMat, g, x, y + height / 2, 0.16);
  }
  function rod(len, y) {
    cyl(M.brass, 0.016, 0.016, len, 0, y, 0.16, [0, 0, PI / 2], 10);
    for (const s of [-1, 1]) { k.ball(M.brass, 0.035, s * len / 2, y, 0.16); box(M.brass, 0.02, 0.02, 0.16, s * (len / 2 - 0.12), y, 0.08); }
  }
  function windowAt(w, y0, y1, { drapes = true } = {}) {
    const h = y1 - y0, cy = (y0 + y1) / 2;
    for (const s of [-1, 1]) {
      box(M.trim, 0.13, h + 0.26, 0.05, s * (w / 2 + 0.065), cy, 0.025);                 // casing
      box(M.trim, 0.03, h, 0.3, s * (w / 2 - 0.015), cy, -0.15);                         // jamb lining
      box(M.trim, 0.07, h, 0.07, s * (w / 2 - 0.05), cy, -0.17);                         // sash stiles
    }
    box(M.trim, w + 0.26, 0.13, 0.05, 0, y1 + 0.065, 0.025);
    box(M.trim, w + 0.3, 0.04, 0.07, 0, y1 + 0.15, 0.035);
    box(M.trim, w + 0.36, 0.05, 0.16, 0, y0 - 0.025, 0.05);                              // sill
    box(M.trim, w + 0.2, 0.1, 0.03, 0, y0 - 0.1, 0.015);
    box(M.trim, w, 0.03, 0.3, 0, y1 - 0.015, -0.15); box(M.trim, w, 0.03, 0.3, 0, y0 + 0.015, -0.15);
    box(M.trim, w, 0.07, 0.07, 0, y1 - 0.05, -0.17); box(M.trim, w, 0.07, 0.07, 0, y0 + 0.05, -0.17);
    box(M.trim, 0.035, h, 0.04, 0, cy, -0.17);                                           // glazing bars
    const bars = Math.round(h / 0.9);
    for (let i = 1; i < bars; i++) box(M.trim, w, 0.035, 0.04, 0, y0 + (h / bars) * i, -0.17);
    box(M.glass, w, h, 0.012, 0, cy, -0.17);
    if (drapes) {
      rod(w + 1.1, 3.98);
      curtain(0.55, 3.94, -w / 2 - 0.22, 0.02, -1); curtain(0.55, 3.94, w / 2 + 0.22, 0.02, 1);
    }
  }
  for (const [a, b] of WIN.w) on.w((a + b) / 2, () => windowAt(b - a, WIN.wy[0], WIN.wy[1]));
  on.s((WIN.s[0] + WIN.s[1]) / 2, () => windowAt(WIN.s[1] - WIN.s[0], WIN.sy[0], WIN.sy[1], { drapes: false }));

  // ------------------------------------------------------------ patio doors
  on.e(0, () => {
    const W = DOOR.z1 - DOOR.z0, h = DOOR.h, bay = W / 6;
    for (const s of [-1, 1]) box(M.steel, 0.09, h, 0.3, s * (W / 2 - 0.045), h / 2, -0.15);
    box(M.steel, W, 0.09, 0.3, 0, h - 0.045, -0.15);
    box(M.brassDull, W, 0.012, 0.32, 0, 0.006, -0.15);                                   // threshold
    box(M.steel, W, 0.02, 0.03, 0, 0.022, -0.1); box(M.steel, W, 0.02, 0.03, 0, 0.022, -0.2);
    const leaf = (cx, track, handle) => {
      const z = track ? -0.2 : -0.1, s = 0.055, top = h - 0.1;
      for (const e of [-1, 1]) box(M.steel, s, top, 0.045, cx + e * (bay / 2 - s / 2), top / 2 + 0.01, z);
      box(M.steel, bay, s * 1.4, 0.045, cx, top - s * 0.7 + 0.01, z); box(M.steel, bay, s * 2, 0.045, cx, s + 0.01, z);
      box(M.steel, bay, 0.03, 0.035, cx, 2.5, z);
      box(M.glass, bay - 0.08, top - 0.1, 0.012, cx, top / 2 + 0.03, z);
      if (handle) for (const side of [-1, 1]) box(M.brass, 0.022, 0.42, 0.03, cx + handle * (bay / 2 - 0.028), 1.1, z + side * 0.04);
    };
    leaf(-2.5 * bay, 0); leaf(2.5 * bay, 0);            // fixed sidelights
    leaf(-1.5 * bay, 0); leaf(1.5 * bay, 0);
    leaf(-1.5 * bay - 0.06, 1, 1); leaf(1.5 * bay + 0.06, 1, -1);   // the two centre leaves, slid open
    rod(W + 2.2, 4.0);
    curtain(0.85, 3.96, -W / 2 - 0.5, 0.02, -1); curtain(0.85, 3.96, W / 2 + 0.5, 0.02, 1);
  });

  // ------------------------------------------------------------ entry doors (south wall)
  on.s(0, () => {
    const w = 2.0, h = 2.85;
    for (const s of [-1, 1]) box(M.trim, 0.15, h + 0.15, 0.06, s * (w / 2 + 0.075), (h + 0.15) / 2, 0.03);
    box(M.trim, w + 0.3, 0.15, 0.06, 0, h + 0.075, 0.03); box(M.trim, w + 0.4, 0.05, 0.09, 0, h + 0.175, 0.045);
    for (const s of [-1, 1]) {
      box(M.walnut, w / 2 - 0.01, h, 0.05, s * w / 4, h / 2, 0.01);
      at(s * w / 4, 0, 0.035, 0, () => { frame(0, 0.22, 1.0, 0.7, M.walnut, 0.05, 0.02); frame(0, 1.16, 2.62, 0.7, M.walnut, 0.05, 0.02); });
      cyl(M.brass, 0.02, 0.02, 0.5, s * 0.09, 1.15, 0.09, null, 10);
      for (const y of [0.95, 1.35]) box(M.brass, 0.02, 0.02, 0.06, s * 0.09, y, 0.06);
    }
  });

  // ------------------------------------------------------------ fireplace
  const fz = ROOM.z0;
  box(M.wall, 1.28, H, 0.6, -1.26, H / 2, fz + 0.3); box(M.wall, 1.28, H, 0.6, 1.26, H / 2, fz + 0.3);
  box(M.wall, 1.24, H - 0.98, 0.6, 0, (H + 0.98) / 2, fz + 0.3);
  box(M.soot, 1.24, 0.98, 0.03, 0, 0.49, fz + 0.02); box(M.soot, 1.24, 0.03, 0.56, 0, 0.965, fz + 0.3); box(M.soot, 1.24, 0.02, 0.56, 0, 0.01, fz + 0.3);
  for (const s of [-1, 1]) {
    box(M.soot, 0.03, 0.98, 0.56, s * 0.605, 0.49, fz + 0.3);
    box(M.marble, 0.36, 0.98, 0.08, s * 0.8, 0.49, fz + 0.64);
    box(M.marble, 0.42, 0.1, 0.1, s * 0.8, 0.05, fz + 0.65);
    box(M.wall, 0.03, 0.24, 0.6, s * 1.915, 0.12, fz + 0.3); box(M.wall, 0.56, 0.24, 0.03, s * 1.64, 0.12, fz + 0.615);
  }
  box(M.marble, 1.96, 0.3, 0.08, 0, 1.13, fz + 0.64);
  box(M.marble, 2.1, 0.05, 0.2, 0, 1.305, fz + 0.7);
  box(M.marble, 2.34, 0.07, 0.36, 0, 1.365, fz + 0.76);
  box(M.marble, 2.6, 0.05, 0.66, 0, 0.025, fz + 0.9);
  at(0, 0, fz + 0.6, 0, () => frame(0, 1.62, 3.95, 2.7));
  box(M.trim, 3.96, 0.12, 0.16, 0, H - 0.06, fz + 0.68); box(M.trim, 0.16, 0.12, 0.6, -1.98, H - 0.06, fz + 0.3); box(M.trim, 0.16, 0.12, 0.6, 1.98, H - 0.06, fz + 0.3);
  // grate and logs
  for (const s of [-1, 1]) { box(M.steel, 0.03, 0.16, 0.36, s * 0.3, 0.1, fz + 0.3); }
  box(M.steel, 0.7, 0.02, 0.03, 0, 0.17, fz + 0.2); box(M.steel, 0.7, 0.02, 0.03, 0, 0.17, fz + 0.4);
  const log = mat(0x3b2a1d, { rough: 1 }), ember = mat(0xff6a1c, { emissive: 0xff4a0c, emissiveIntensity: 3, cast: false });
  cyl(log, 0.07, 0.075, 0.74, 0, 0.25, fz + 0.24, [0, 0.12, PI / 2], 10);
  cyl(log, 0.065, 0.07, 0.7, 0.02, 0.25, fz + 0.4, [0, -0.2, PI / 2], 10);
  cyl(log, 0.06, 0.06, 0.62, -0.03, 0.37, fz + 0.31, [0, 0.35, PI / 2], 10);
  box(ember, 0.5, 0.03, 0.2, 0, 0.19, fz + 0.3);

  // ------------------------------------------------------------ built-in shelving, either side of the fire
  const niches = [];
  const LEVELS = [0.945, 1.7975, 2.4175, 3.0375], BAYS = [-1.48, -0.495, 0.495, 1.48];
  function builtIn(cx) {
    at(cx, 0, ROOM.z0, 0, () => {
      box(M.cabinet, 4.0, 0.9, 0.62, 0, 0.45, 0.31);
      box(M.wallDeep, 4.0, 0.1, 0.02, 0, 0.05, 0.625);
      for (const bx of BAYS) {
        box(M.cabinet, 0.93, 0.74, 0.02, bx, 0.5, 0.63);
        at(bx, 0, 0.64, 0, () => frame(0, 0.13, 0.87, 0.93, M.cabinet, 0.085, 0.014));
        k.ball(M.brass, 0.02, bx + (bx < 0 ? 0.36 : -0.36) * (Math.abs(bx) > 1 ? 1 : -1), 0.74, 0.675);
      }
      box(M.walnut, 4.1, 0.045, 0.7, 0, 0.9225, 0.34);
      box(M.niche, 4.0, 2.72, 0.03, 0, 2.305, 0.015);
      for (const sx of [-1.97, 1.97]) box(M.cabinet, 0.06, 2.72, 0.44, sx, 2.305, 0.22);
      for (const dx of [-0.9875, 0, 0.9875]) box(M.cabinet, 0.04, 2.72, 0.42, dx, 2.305, 0.21);
      for (const y of [1.78, 2.4, 3.02]) { box(M.cabinet, 3.9, 0.035, 0.41, 0, y, 0.205); box(M.strip, 3.86, 0.01, 0.02, 0, y - 0.022, 0.37); }
      box(M.strip, 3.86, 0.01, 0.02, 0, 3.64, 0.37);
      box(M.cabinet, 4.0, 0.75, 0.44, 0, 4.025, 0.22);
      box(M.cabinet, 4.08, 0.05, 0.48, 0, 3.69, 0.24);
      box(M.trim, 4.0, 0.12, 0.16, 0, H - 0.06, 0.5);
    });
    LEVELS.forEach((y, level) => BAYS.forEach((bx, bay) =>
      niches.push({ x: cx + bx, y, z: ROOM.z0 + 0.22, w: 0.9, h: level === 0 ? 0.8 : 0.58, level, bay, unit: cx < 0 ? 0 : 1 })));
  }
  builtIn(-4.1); builtIn(4.1);

  // ------------------------------------------------------------ deck
  const dw = DECK.x1 - DECK.x0, dd = DECK.z1 - DECK.z0, dcx = (DECK.x0 + DECK.x1) / 2;
  box(M.deck, dw, 0.1, dd, dcx, -0.05, 0);
  box(M.deckTrim, dw, 0.5, 0.06, dcx, -0.35, DECK.z0 + 0.03); box(M.deckTrim, dw, 0.5, 0.06, dcx, -0.35, DECK.z1 - 0.03);
  box(M.deckTrim, 0.06, 0.5, dd, DECK.x1 - 0.03, -0.35, 0);
  box(M.stone, 0.5, 0.75, 13.2, ROOM.x1 + 0.2, -0.375, 0);                              // plinth under the wall
  function railing(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 1.8), ry = Math.atan2(-(z1 - z0), x1 - x0);
    at(x0, 0, z0, ry, () => {
      for (let i = 0; i <= n; i++) box(M.outSteel, 0.045, 1.04, 0.045, (len / n) * i, 0.52, 0);
      box(M.teak, len + 0.06, 0.035, 0.09, len / 2, 1.055, 0);
      for (let i = 0; i < n; i++) box(M.outGlass, len / n - 0.1, 0.84, 0.012, (len / n) * (i + 0.5), 0.53, 0);
    });
  }
  railing(DECK.x0 + 0.1, DECK.z0 + 0.06, DECK.x1 - 0.06, DECK.z0 + 0.06);
  railing(DECK.x1 - 0.06, DECK.z0 + 0.06, DECK.x1 - 0.06, DECK.z1 - 0.06);
  railing(DECK.x1 - 0.06, DECK.z1 - 0.06, DECK.x0 + 0.1, DECK.z1 - 0.06);
  // lanterns either side of the doors
  for (const s of [-1, 1]) at(ROOM.x1 + 0.3, 2.3, s * 5.25, 0, () => {
    box(M.outSteel, 0.08, 0.2, 0.14, 0.04, 0, 0); box(M.outSteel, 0.2, 0.03, 0.2, 0.14, 0.2, 0); box(M.outSteel, 0.2, 0.03, 0.2, 0.14, -0.2, 0);
    box(M.bulb, 0.1, 0.3, 0.1, 0.14, 0, 0); box(M.outGlass, 0.17, 0.38, 0.17, 0.14, 0, 0);
  });

  return { niches, on, frame };
}
