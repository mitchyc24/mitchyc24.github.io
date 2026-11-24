// One artefact per app or link, each placed where it belongs in the room: on a shelf, a wall, the
// mantel, the piano, a counter. Anything without a model of its own gets a framed card on a spare
// shelf. Returns the targets the camera can visit: { item, proxy, anchor, stand }.
import { ROOM } from "./kit.js";

export function buildArtefacts(k, scene, items, niches) {
  const { T, M, box, rbox, cyl, ball, lathe, at, add, mat, rnd, range } = k;
  const PI = Math.PI, targets = [];
  const hidden = new T.MeshBasicMaterial({ visible: false });
  const proxies = new T.Group();
  scene.add(proxies);

  // centre and size give the clickable volume, label the point its name floats over, stand where to view it from.
  function register(item, { centre, size, label, stand }) {
    const proxy = new T.Mesh(new T.BoxGeometry(size[0], size[1], size[2]), hidden);
    proxy.position.set(centre[0], centre[1], centre[2]);
    proxy.userData.item = item;
    proxies.add(proxy);
    targets.push({ item, proxy, anchor: new T.Vector3(label[0], label[1], label[2]), look: new T.Vector3(centre[0], centre[1], centre[2]), stand });
  }
  // A canvas that is lit from within: screens, pages, posters. redraw(t) repaints it.
  function screen(w, h, draw, { glow = true } = {}) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d"), texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
    const redraw = (t = 0) => { draw(ctx, w, h, t); texture.needsUpdate = true; };
    redraw(0);
    const material = glow ? new T.MeshBasicMaterial({ map: texture }) : mat(0xffffff, { rough: 0.85, map: texture });
    return { material, redraw };
  }
  const every = (seconds, fn) => { let last = -1e9; k.anim.push((t) => { if (t - last >= seconds) { last = t; fn(t); } }); };
  const niche = (unit, level, bay) => { const n = niches.find((x) => x.unit === unit && x.level === level && x.bay === bay); n.used = true; return n; };
  const serif = 'Georgia, "Times New Roman", serif', sans = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  const builders = {
    // ---------------------------------------------------------- chess on the coffee table
    michess(item) {
      const board = k.texture(k.canvas(256, 256, (ctx) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = (x + y) % 2 ? "#5b3a26" : "#e7d6b4"; ctx.fillRect(x * 32, y * 32, 32, 32); } k.grain(ctx, 256, 256, 0.06); }), { wrap: false });
      const S = 0.055, bx = 0, by = 0.44, bz = -1.12;
      at(bx, by, bz, 0.12, () => {
        rbox(M.darkWood, 0.52, 0.03, 0.52, 0.008, 0, 0.015, 0);
        box(mat(0xffffff, { rough: 0.35, map: board }), S * 8, 0.004, S * 8, 0, 0.032, 0);
        const shapes = {
          p: [[0, 0], [0.017, 0], [0.018, 0.006], [0.009, 0.014], [0.006, 0.032], [0.012, 0.036], [0.011, 0.044], [0.006, 0.05], [0, 0.052]],
          r: [[0, 0], [0.02, 0], [0.021, 0.007], [0.013, 0.014], [0.012, 0.045], [0.017, 0.048], [0.017, 0.062], [0.011, 0.062], [0.011, 0.056], [0, 0.056]],
          n: [[0, 0], [0.02, 0], [0.021, 0.007], [0.012, 0.016], [0.01, 0.03], [0, 0.03]],
          b: [[0, 0], [0.02, 0], [0.021, 0.007], [0.01, 0.016], [0.007, 0.046], [0.013, 0.05], [0.011, 0.062], [0.004, 0.074], [0.006, 0.078], [0, 0.082]],
          q: [[0, 0], [0.022, 0], [0.023, 0.008], [0.011, 0.018], [0.008, 0.06], [0.015, 0.065], [0.012, 0.07], [0.017, 0.084], [0.009, 0.082], [0.006, 0.09], [0, 0.094]],
          k: [[0, 0], [0.022, 0], [0.023, 0.008], [0.011, 0.018], [0.008, 0.064], [0.016, 0.069], [0.012, 0.074], [0.016, 0.09], [0, 0.092]],
        };
        const place = (kind, square, material, facing) => {
          const x = (square.charCodeAt(0) - 97 - 3.5) * S, z = (3.5 - (Number(square[1]) - 1)) * S, y = 0.034;
          lathe(material, shapes[kind], x, y, z, 14);
          if (kind === "n") { box(material, 0.014, 0.038, 0.03, x, y + 0.046, z - facing * 0.004, [facing * 0.35, 0, 0]); box(material, 0.012, 0.016, 0.026, x, y + 0.06, z + facing * 0.012, [facing * -0.3, 0, 0]); }
          if (kind === "k") { box(material, 0.004, 0.022, 0.004, x, y + 0.102, z); box(material, 0.014, 0.004, 0.004, x, y + 0.104, z); }
        };
        // Ruy Lopez, after 1. e4 e5 2. Nf3 Nc6 3. Bb5
        const white = { k: ["e1"], q: ["d1"], r: ["a1", "h1"], b: ["c1", "b5"], n: ["b1", "f3"], p: ["a2", "b2", "c2", "d2", "e4", "f2", "g2", "h2"] };
        const black = { k: ["e8"], q: ["d8"], r: ["a8", "h8"], b: ["c8", "f8"], n: ["c6", "g8"], p: ["a7", "b7", "c7", "d7", "e5", "f7", "g7", "h7"] };
        for (const kind in white) white[kind].forEach((sq) => place(kind, sq, M.ivory, -1));
        for (const kind in black) black[kind].forEach((sq) => place(kind, sq, M.ebony, 1));
      });
      register(item, { centre: [bx, 0.52, bz], size: [0.6, 0.22, 0.6], label: [bx, 0.74, bz], stand: [0, 0.3] });
    },

    // ---------------------------------------------------------- floor globe by the window
    observatory(item) {
      const gx = 6.75, gz = -4.15, gy = 0.98, R = 0.42;
      at(gx, 0, gz, 0.4, () => {
        for (let i = 0; i < 3; i++) {
          const a = i * PI * 2 / 3;
          lathe(M.walnut, [[0, 0], [0.03, 0], [0.035, 0.03], [0.018, 0.08], [0.024, 0.3], [0.014, 0.5], [0.022, 0.72], [0.02, 0.95]], Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, 10, [Math.sin(a) * -0.12, 0, Math.cos(a) * 0.12]);
          cyl(M.walnut, 0.012, 0.012, 0.36, Math.cos(a) * 0.19, 0.42, Math.sin(a) * 0.19, [0, -a, PI / 2], 6);
        }
        ball(M.brass, 0.035, 0, 0.42, 0);
        add(M.walnut, new T.TorusGeometry(R + 0.09, 0.022, 6, 64).scale(1, 1, 0.7), 0, gy, 0, [PI / 2, 0, 0]);
        add(M.brass, new T.TorusGeometry(R + 0.035, 0.009, 8, 64), 0, gy, 0, [0, 0, 0]);
        cyl(M.brass, 0.012, 0.012, 0.12, 0, gy - R - 0.07, 0, null, 8);
      });
      const tilt = new T.Group(); tilt.position.set(gx, gy, gz); tilt.rotation.z = 0.41; tilt.rotation.y = 0.4; scene.add(tilt);
      const earth = k.mesh(new T.SphereGeometry(R, 48, 32), mat(0x3d6f9a, { rough: 0.62 }), 0, 0, 0, tilt);
      new T.TextureLoader().load("host/assets/earth_day_2k.jpg", (texture) => {
        texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
        Object.assign(earth.material, { map: texture, emissiveMap: texture, emissiveIntensity: 0.55 });
        earth.material.color.set(0xffffff); earth.material.emissive.set(0xffffff); earth.material.needsUpdate = true;
      }, undefined, () => {});
      k.anim.push((t, dt) => { earth.rotation.y += dt * 0.12; });
      k.obstacles.push([gx - 0.6, gx + 0.6, gz - 0.6, gz + 0.6]);
      register(item, { centre: [gx, 0.8, gz], size: [1.1, 1.6, 1.1], label: [gx, 1.62, gz], stand: [5.3, -2.9] });
    },

    // ---------------------------------------------------------- metronome on the piano
    "stride-roulette"(item) {
      const x = -6.5, y = 1.005, z = 2.82, tone = item.color || "#D7262E";
      at(x, y, z, 0.55, () => {
        box(M.darkWood, 0.16, 0.02, 0.16, 0, 0.01, 0);
        add(M.walnut, new T.CylinderGeometry(0.03, 0.098, 0.25, 4), 0, 0.145, 0, [0, PI / 4, 0]);
        box(M.brass, 0.05, 0.19, 0.004, 0, 0.14, 0.047, [-0.155, 0, 0]);
        for (let i = 0; i < 9; i++) box(M.ebony, 0.03 - (i % 2) * 0.012, 0.002, 0.002, 0, 0.07 + i * 0.016, 0.059 - i * 0.0025);
        ball(M.brass, 0.012, 0.075, 0.07, 0);
      });
      const arm = new T.Group(); arm.position.set(x + 0.031, y + 0.04, z + 0.053); arm.rotation.y = 0.55; scene.add(arm);
      const swing = new T.Group(); swing.rotation.x = -0.155; arm.add(swing);
      k.mesh(new T.BoxGeometry(0.006, 0.26, 0.004), M.chrome, 0, 0.13, 0, swing);
      k.mesh(new T.BoxGeometry(0.03, 0.03, 0.012), mat(tone, { rough: 0.4, metal: 0.4 }), 0, 0.17, 0.002, swing);
      k.anim.push((t) => { swing.rotation.z = Math.sin(t * 4.6) * 0.5; });
      register(item, { centre: [x, y + 0.16, z], size: [0.34, 0.42, 0.34], label: [x, y + 0.47, z], stand: [-5.75, 4.2] });
    },

    // ---------------------------------------------------------- oscilloscope and a length of waveguide
    "waveguide-modes"(item) {
      const n = niche(0, 0, 2), x = n.x, y = n.y, z = ROOM.z0 + 0.3, tone = item.color || "#4B4BC8";
      const trace = screen(256, 176, (ctx, w, h, t) => {
        ctx.fillStyle = "#06120f"; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(120,220,190,.16)"; ctx.lineWidth = 1;
        for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(i * w / 8, 0); ctx.lineTo(i * w / 8, h); ctx.stroke(); }
        for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, i * h / 6); ctx.lineTo(w, i * h / 6); ctx.stroke(); }
        ctx.shadowColor = "#7dffd0"; ctx.shadowBlur = 10; ctx.lineWidth = 2.5;
        for (const [amp, colour] of [[1, "#8dffd9"], [-1, "rgba(141,255,217,.35)"]]) {
          ctx.strokeStyle = colour; ctx.beginPath();
          for (let px = 0; px <= w; px += 4) { const v = Math.sin(px / w * PI * 3) * Math.cos(t * 3.2) * amp; ctx.lineTo(px, h / 2 - v * h * 0.34); }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      });
      at(x, y, z, 0, () => {
        rbox(mat(0xd9d2c0, { rough: 0.55 }), 0.5, 0.3, 0.3, 0.02, -0.12, 0.165, 0);
        box(M.steel, 0.46, 0.26, 0.01, -0.12, 0.165, 0.151);
        box(trace.material, 0.24, 0.165, 0.004, -0.21, 0.175, 0.158);
        for (const [kx, ky, r] of [[0.0, 0.23, 0.022], [0.065, 0.23, 0.022], [0.0, 0.15, 0.016], [0.045, 0.15, 0.016], [0.09, 0.15, 0.016]]) cyl(M.ebony, r, r, 0.03, -0.12 + kx + 0.02, ky, 0.165, [PI / 2, 0, 0], 12);
        box(mat(tone, { rough: 0.5 }), 0.14, 0.02, 0.004, -0.06, 0.075, 0.157);
        for (const sx of [-0.32, 0.08]) for (const sz of [-0.1, 0.1]) cyl(M.ebony, 0.018, 0.018, 0.02, sx, 0.008, sz, null, 8);
        // WR-90 style waveguide: a rectangular brass tube with flanges
        at(0.29, 0.058, 0.12, 0.5, () => {
          for (const [w, h, py] of [[0.3, 0.006, 0.027], [0.3, 0.006, -0.027]]) box(M.brass, w, h, 0.1, 0, py, 0);
          for (const pz of [-0.047, 0.047]) box(M.brass, 0.3, 0.06, 0.006, 0, 0, pz);
          for (const sx of [-0.15, 0.15]) { for (const [w, h, py, pz] of [[0.012, 0.026, 0.043, 0], [0.012, 0.026, -0.043, 0]]) box(M.brass, w, h, 0.15, sx, py, pz); for (const pz of [-0.063, 0.063]) box(M.brass, 0.012, 0.112, 0.026, sx, 0, pz); }
        });
      });
      every(1 / 15, (t) => trace.redraw(t));
      register(item, { centre: [x, y + 0.2, z + 0.05], size: [0.92, 0.5, 0.62], label: [x, y + 0.62, z + 0.2], stand: [x, -4.15] });
    },

    // ---------------------------------------------------------- radar dish turning on the shelf
    "radar-lab"(item) {
      const n = niche(1, 0, 1), x = n.x, y = n.y, z = ROOM.z0 + 0.36, tone = item.color || "#0B7A55";
      at(x, y, z, 0, () => {
        cyl(mat(tone, { rough: 0.5 }), 0.16, 0.18, 0.05, 0, 0.025, 0, null, 24);
        cyl(M.steel, 0.14, 0.14, 0.012, 0, 0.056, 0, null, 24);
        lathe(M.ceramic, [[0, 0], [0.06, 0], [0.04, 0.06], [0.03, 0.2], [0, 0.2]], 0, 0.06, 0, 14);
      });
      const turn = new T.Group(); turn.position.set(x, y + 0.26, z); scene.add(turn);
      k.mesh(new T.BoxGeometry(0.2, 0.03, 0.05), M.steel, 0, 0.01, 0, turn);
      for (const s of [-1, 1]) k.mesh(new T.BoxGeometry(0.016, 0.16, 0.04), M.steel, s * 0.095, 0.08, 0, turn);
      const dish = new T.Group(); dish.position.set(0, 0.15, 0); dish.rotation.x = -0.5; turn.add(dish);
      const profile = []; for (let i = 0; i <= 12; i++) { const r = i * 0.019; profile.push(new T.Vector2(r, r * r * 1.5)); }
      const bowl = k.mesh(new T.LatheGeometry(profile, 36), mat(0xe9e5dc, { rough: 0.45, metal: 0.2, side: T.DoubleSide }), 0, 0, 0, dish);
      bowl.rotation.x = PI / 2;
      for (let i = 0; i < 3; i++) {
        const a = i * PI * 2 / 3 + 0.5, from = new T.Vector3(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.06), to = new T.Vector3(0, 0, 0.2);
        const strut = k.mesh(new T.CylinderGeometry(0.003, 0.003, from.distanceTo(to), 4), M.steel, 0, 0, 0, dish);
        strut.position.copy(from).add(to).multiplyScalar(0.5);
        strut.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      }
      k.mesh(new T.CylinderGeometry(0.014, 0.022, 0.04, 10), mat(tone, { rough: 0.4 }), 0, 0, 0.2, dish).rotation.x = PI / 2;
      k.anim.push((t, dt) => { turn.rotation.y += dt * 0.7; });
      register(item, { centre: [x, y + 0.32, z], size: [0.86, 0.72, 0.66], label: [x, y + 0.9, z + 0.25], stand: [x, -4.15] });
    },

    // ---------------------------------------------------------- printed snowflake under glass, on the mantel
    snowflake(item) {
      const x = -0.78, y = 1.4, z = ROOM.z0 + 0.76, tone = item.color || "#1B8FD0";
      at(x, y, z, 0, () => {
        cyl(M.darkWood, 0.13, 0.14, 0.03, 0, 0.015, 0, null, 28);
        cyl(M.brass, 0.01, 0.03, 0.03, 0, 0.045, 0, null, 10);
        add(M.cloche, new T.CylinderGeometry(0.115, 0.115, 0.24, 28, 1, true), 0, 0.15, 0);
        add(M.cloche, new T.SphereGeometry(0.115, 28, 12, 0, PI * 2, 0, PI / 2), 0, 0.27, 0);
        ball(M.brass, 0.012, 0, 0.392, 0);
      });
      const flakeMat = mat(tone, { rough: 0.35, emissive: tone, emissiveIntensity: 0.35 });
      const geometry = k.bake(() => {
        for (let i = 0; i < 6; i++) at(0, 0, 0, [0, 0, i * PI / 3], () => {
          box(flakeMat, 0.012, 0.1, 0.008, 0, 0.05, 0);
          for (const [h, len] of [[0.04, 0.034], [0.066, 0.026], [0.088, 0.014]]) for (const s of [-1, 1]) box(flakeMat, 0.009, len, 0.008, s * len * 0.42, h + len * 0.3, 0, [0, 0, -s * 0.95]);
        });
        cyl(flakeMat, 0.016, 0.016, 0.008, 0, 0, 0, [PI / 2, 0, 0], 6);
      });
      const flake = k.mesh(geometry, flakeMat, x, y + 0.17, z, scene);
      k.anim.push((t) => { flake.rotation.y = t * 0.6; });
      // candlesticks keep it company at the other end of the mantel
      for (const [cx, h] of [[0.72, 0.2], [0.9, 0.28]]) { lathe(M.brass, [[0, 0], [0.04, 0], [0.012, 0.02], [0.01, h], [0.022, h + 0.01], [0, h + 0.01]], cx, y, z, 12); cyl(M.ivory, 0.011, 0.011, 0.14, cx, y + h + 0.08, z, null, 8); }
      register(item, { centre: [x, y + 0.2, z], size: [0.36, 0.46, 0.36], label: [x, y + 0.5, z], stand: [-1.6, -4.0] });
    },

    // ---------------------------------------------------------- noticeboard by the front door
    "local-events"(item) {
      const tone = item.color || "#B892A5";
      const board = k.texture(k.canvas(640, 460, (ctx, w, h) => {
        ctx.fillStyle = "#b98d5d"; ctx.fillRect(0, 0, w, h); k.grain(ctx, w, h, 0.22, w * h / 3);
        const flyer = (x, y, fw, fh, bg, ink, title, tilt) => {
          ctx.save(); ctx.translate(x + fw / 2, y + fh / 2); ctx.rotate(tilt); ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
          ctx.fillStyle = bg; ctx.fillRect(-fw / 2, -fh / 2, fw, fh); ctx.shadowColor = "transparent";
          ctx.fillStyle = ink; ctx.font = `700 ${Math.round(fw * 0.15)}px ${serif}`; ctx.textAlign = "center"; ctx.fillText(title, 0, -fh * 0.22, fw * 0.9);
          ctx.globalAlpha = 0.55; for (let i = 0; i < 4; i++) ctx.fillRect(-fw * 0.36, -fh * 0.05 + i * fh * 0.1, fw * (0.72 - (i % 2) * 0.2), fh * 0.035);
          ctx.globalAlpha = 1; ctx.fillStyle = "#b3261e"; ctx.beginPath(); ctx.arc(0, -fh / 2 + 10, 6, 0, 7); ctx.fill(); ctx.restore();
        };
        flyer(24, 86, 170, 230, "#f3ead6", "#1f2d2a", "JAZZ", -0.05); flyer(210, 70, 200, 150, tone, "#2a1a22", "MARKET", 0.04);
        flyer(430, 96, 180, 250, "#24384a", "#f0d9a8", "FILM", 0.06); flyer(220, 240, 190, 190, "#e9c46a", "#3a2a10", "FÊTE", -0.03);
        flyer(40, 330, 150, 100, "#f6f1e6", "#3a2a2a", "5K RUN", 0.05); flyer(440, 360, 150, 80, "#d96c4f", "#fff3e0", "LIVE", -0.06);
        ctx.fillStyle = "#16241f"; ctx.fillRect(0, 0, w, 54); ctx.fillStyle = "#f0e3c4"; ctx.font = `600 30px ${serif}`; ctx.textAlign = "center"; ctx.fillText("WHAT’S ON", w / 2, 38);
      }), { wrap: false });
      at(2.25, 1.85, ROOM.z1, PI, () => {
        box(M.oak, 1.38, 1.02, 0.035, 0, 0, 0.0175);
        box(mat(0xffffff, { rough: 0.95, map: board }), 1.28, 0.92, 0.01, 0, 0, 0.037);
      });
      register(item, { centre: [2.25, 1.85, ROOM.z1 - 0.06], size: [1.45, 1.1, 0.2], label: [2.25, 2.52, ROOM.z1 - 0.1], stand: [2.9, 3.6] });
    },

    // ---------------------------------------------------------- the big screen over the credenza
    "command-station"(item) {
      const feed = screen(640, 360, (ctx, w, h, t) => {
        ctx.fillStyle = "#0b1719"; ctx.fillRect(0, 0, w, h);
        const now = new Date();
        ctx.fillStyle = "#d8aa6a"; ctx.font = `700 15px ${sans}`; ctx.textAlign = "left"; ctx.fillText("COMMAND STATION", 24, 34);
        ctx.fillStyle = "#e9efe6"; ctx.font = `300 54px ${sans}`; ctx.fillText(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), 22, 96);
        ctx.fillStyle = "#8fa39b"; ctx.font = `500 14px ${sans}`; ctx.fillText(now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }), 26, 122);
        // the planet
        const gx = 500, gy = 120, gr = 84; ctx.strokeStyle = "rgba(125,200,190,.5)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(gx, gy, gr, 0, 7); ctx.stroke();
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.ellipse(gx, gy, gr * Math.abs(Math.cos(i * 0.6 + t * 0.15)), gr, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(gx, gy, gr, gr * i / 4, 0, 0, 7); ctx.stroke(); }
        [[-30, -20], [26, 12], [-8, 38], [44, -40]].forEach(([dx, dy], i) => { ctx.fillStyle = `rgba(255,${150 + i * 20},90,${0.45 + 0.55 * Math.abs(Math.sin(t * 1.4 + i * 1.7))})`; ctx.beginPath(); ctx.arc(gx + dx, gy + dy, 4, 0, 7); ctx.fill(); });
        // headlines
        ctx.fillStyle = "#16292b"; ctx.fillRect(22, 150, 360, 186);
        ["#d8aa6a", "#7fc8be", "#7fc8be", "#7fc8be", "#7fc8be"].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(38, 170 + i * 32, 6, 16); ctx.fillStyle = "rgba(233,239,230,.75)"; ctx.fillRect(54, 172 + i * 32, 220 + ((i * 53) % 90), 5); ctx.fillStyle = "rgba(233,239,230,.3)"; ctx.fillRect(54, 182 + i * 32, 150 + ((i * 37) % 120), 4); });
        // a trace
        ctx.fillStyle = "#16292b"; ctx.fillRect(400, 226, 218, 110); ctx.strokeStyle = "#d8aa6a"; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i <= 40; i++) ctx.lineTo(410 + i * 5, 290 - Math.sin(i * 0.45 + t * 0.5) * 16 - Math.sin(i * 0.13 + 1) * 20);
        ctx.stroke();
      });
      at(ROOM.x0, 1.86, -1.2, PI / 2, () => {
        rbox(M.steel, 1.96, 1.13, 0.05, 0.012, 0, 0, 0.03);
        box(feed.material, 1.9, 1.07, 0.004, 0, 0, 0.056);
        box(M.steel, 1.1, 0.07, 0.08, 0, -0.72, 0.06);
      });
      every(1 / 6, (t) => feed.redraw(t));
      register(item, { centre: [ROOM.x0 + 0.1, 1.86, -1.2], size: [0.25, 1.2, 2.0], label: [ROOM.x0 + 0.2, 2.6, -1.2], stand: [-5.2, -1.2] });
    },

    // ---------------------------------------------------------- the painting over the fire
    "mitchell-carroll"(item) {
      const art = k.texture(k.canvas(768, 512, (ctx, w, h) => {
        const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62); sky.addColorStop(0, "#27425f"); sky.addColorStop(0.55, "#c98562"); sky.addColorStop(1, "#f6d08f"); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
        const sun = ctx.createRadialGradient(w * 0.62, h * 0.55, 4, w * 0.62, h * 0.55, 190); sun.addColorStop(0, "rgba(255,244,214,1)"); sun.addColorStop(0.15, "rgba(255,214,150,.75)"); sun.addColorStop(1, "rgba(255,200,140,0)"); ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
        [["#8a7389", 0.5, 46], ["#5c5f7e", 0.56, 34], ["#394865", 0.61, 22]].forEach(([c, base, amp], i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 6) ctx.lineTo(x, h * base - Math.abs(Math.sin(x * 0.006 + i * 1.9)) * amp - Math.sin(x * 0.03 + i) * 6); ctx.lineTo(w, h); ctx.fill(); });
        const lake = ctx.createLinearGradient(0, h * 0.64, 0, h); lake.addColorStop(0, "#e9b983"); lake.addColorStop(0.4, "#6d7a92"); lake.addColorStop(1, "#1f3044"); ctx.fillStyle = lake; ctx.fillRect(0, h * 0.64, w, h);
        for (let i = 0; i < 46; i++) { ctx.fillStyle = `rgba(255,232,186,${0.5 - i * 0.01})`; ctx.fillRect(w * 0.62 - 30 - i * 2.2 + Math.sin(i) * 12, h * 0.65 + i * 3.6, 60 + i * 4.4, 1.6); }
        ctx.fillStyle = "#14212b"; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h * 0.74); for (let x = 0; x <= w * 0.36; x += 10) ctx.lineTo(x, h * 0.74 + x * 0.22 - Math.abs(Math.sin(x * 0.09)) * 30); ctx.lineTo(w * 0.36, h); ctx.fill();
        k.grain(ctx, w, h, 0.07, w * h / 4);
      }), { wrap: false });
      const plaque = k.texture(k.canvas(512, 96, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#e2c283"); g.addColorStop(1, "#a9853f"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#2a1f0c"; ctx.textAlign = "center"; ctx.font = `600 34px ${serif}`; ctx.fillText(String(item.name).toUpperCase(), w / 2, 60, w - 40);
      }), { wrap: false });
      const y = 2.76, z = ROOM.z0 + 0.6;
      at(0, y, z, 0, () => {
        rbox(M.brass, 2.02, 1.42, 0.07, 0.02, 0, 0, 0.035); box(M.brassDull, 1.9, 1.3, 0.08, 0, 0, 0.04); box(M.brass, 1.8, 1.2, 0.085, 0, 0, 0.0425);
        box(mat(0xffffff, { rough: 0.8, map: art, emissive: 0xffffff, emissiveMap: art, emissiveIntensity: 0.22 }), 1.72, 1.12, 0.01, 0, 0, 0.088);
        box(mat(0xffffff, { rough: 0.35, metal: 0.6, map: plaque }), 0.5, 0.09, 0.012, 0, -0.655, 0.076);
        cyl(M.brass, 0.022, 0.022, 0.9, 0, 0.82, 0.2, [0, 0, PI / 2], 12); box(M.strip, 0.84, 0.006, 0.02, 0, 0.802, 0.2);
        for (const s of [-1, 1]) cyl(M.brass, 0.007, 0.007, 0.2, s * 0.3, 0.8, 0.1, [PI / 2 - 0.2, 0, 0], 6);
      });
      register(item, { centre: [0, y, z + 0.05], size: [2.05, 1.5, 0.2], label: [0, y + 0.95, z + 0.1], stand: [0, -3.55] });
    },

    // ---------------------------------------------------------- laptop and a small server on the desk
    "carroll-compute"(item) {
      const tone = item.color || "#3FA7D6";
      const term = screen(512, 320, (ctx, w, h, t) => {
        ctx.fillStyle = "#0c1418"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = tone; ctx.font = `700 34px ${sans}`; ctx.textAlign = "left"; ctx.fillText("carroll", 30, 62); const cw = ctx.measureText("carroll").width; ctx.fillStyle = "#e8eef0"; ctx.font = `300 34px ${sans}`; ctx.fillText("compute", 36 + cw, 62);
        ctx.font = "15px ui-monospace, Menlo, Consolas, monospace";
        ["$ deploy --all", "  build      ok   2.1s", "  tests      ok   148 passed", "  release    ok   v4.2.0", "$ status", "  nodes 6/6   load 0.31   up 212d"].forEach((line, i) => { ctx.fillStyle = line[0] === "$" ? "#e8eef0" : "#7fd1a8"; ctx.fillText(line, 30, 112 + i * 27); });
        ctx.fillStyle = "#e8eef0"; ctx.fillText("$", 30, 277);
        if (Math.floor(t) % 2) ctx.fillRect(46, 263, 9, 17);
      });
      const x = 5.85, y = 0.77, z = ROOM.z1 - 0.52;
      at(x, y, z, PI + 0.22, () => {
        rbox(M.chrome, 0.36, 0.014, 0.25, 0.006, 0, 0.007, 0);
        box(M.ebony, 0.31, 0.002, 0.12, 0, 0.015, -0.035); box(M.steel, 0.1, 0.002, 0.06, 0, 0.015, 0.075);
        at(0, 0.014, -0.125, [-0.3, 0, 0], () => { rbox(M.chrome, 0.36, 0.24, 0.008, 0.004, 0, 0.12, 0); box(term.material, 0.34, 0.215, 0.002, 0, 0.122, 0.0055); });
      });
      at(x - 0.52, y, z + 0.1, PI - 0.1, () => {
        rbox(M.steel, 0.11, 0.21, 0.22, 0.012, 0, 0.105, 0);
        for (let i = 0; i < 6; i++) box(M.ebony, 0.08, 0.004, 0.002, 0, 0.05 + i * 0.022, 0.111);
      });
      const leds = [0, 1, 2].map((i) => k.mesh(new T.BoxGeometry(0.008, 0.008, 0.004), new T.MeshBasicMaterial({ color: 0x57f29a }), x - 0.5 + (i - 1) * 0.018, y + 0.185, z - 0.013, scene));
      every(0.22, () => leds.forEach((led) => led.material.color.set(rnd() < 0.7 ? 0x57f29a : 0x12301f)));
      every(0.5, (t) => term.redraw(t));
      register(item, { centre: [x - 0.2, y + 0.16, z], size: [1.0, 0.42, 0.5], label: [x - 0.1, y + 0.52, z], stand: [6.3, 4.45] });
    },

    // ---------------------------------------------------------- this month, on the wall by the desk
    micalendar(item) {
      const tone = item.color || "#E0723C";
      const page = k.texture(k.canvas(400, 580, (ctx, w, h) => {
        const now = new Date(), year = now.getFullYear(), month = now.getMonth();
        ctx.fillStyle = "#fbf7ee"; ctx.fillRect(0, 0, w, h);
        const g = ctx.createLinearGradient(0, 0, 0, 230); g.addColorStop(0, "#3a5a78"); g.addColorStop(0.6, "#e7a56f"); g.addColorStop(1, "#f7dca6"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, 230);
        ctx.fillStyle = "#2c4a44"; ctx.beginPath(); ctx.moveTo(0, 230); for (let x = 0; x <= w; x += 8) ctx.lineTo(x, 190 - Math.abs(Math.sin(x * 0.014)) * 60); ctx.lineTo(w, 230); ctx.fill();
        ctx.fillStyle = tone; ctx.fillRect(0, 230, w, 54);
        ctx.fillStyle = "#fff"; ctx.font = `700 26px ${sans}`; ctx.textAlign = "left"; ctx.fillText(now.toLocaleDateString("en", { month: "long" }).toUpperCase(), 22, 266); ctx.textAlign = "right"; ctx.font = `400 22px ${sans}`; ctx.fillText(String(year), w - 22, 266);
        const first = new Date(year, month, 1).getDay(), days = new Date(year, month + 1, 0).getDate(), cell = (w - 36) / 7;
        ctx.textAlign = "center"; ctx.font = `700 14px ${sans}`; ctx.fillStyle = "#8a8f8c"; "SMTWTFS".split("").forEach((d, i) => ctx.fillText(d, 18 + cell * (i + 0.5), 312));
        for (let d = 1; d <= days; d++) {
          const slot = first + d - 1, cx = 18 + cell * (slot % 7 + 0.5), cy = 348 + Math.floor(slot / 7) * 40;
          if (d === now.getDate()) { ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(cx, cy - 7, 17, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; } else ctx.fillStyle = "#25302e";
          ctx.font = `${d === now.getDate() ? 700 : 500} 19px ${sans}`; ctx.fillText(String(d), cx, cy);
        }
      }), { wrap: false });
      const x = 3.5, y = 1.92;
      at(x, y, ROOM.z1, PI, () => {
        box(mat(0xffffff, { rough: 0.9, map: page }), 0.5, 0.725, 0.012, 0, 0, 0.012);
        box(M.steel, 0.5, 0.022, 0.02, 0, 0.365, 0.014);
        for (let i = 0; i < 12; i++) add(M.chrome, new T.TorusGeometry(0.012, 0.003, 5, 10), -0.22 + i * 0.04, 0.37, 0.016, [0, PI / 2, 0]);
        ball(M.brass, 0.012, 0, 0.41, 0.012);
      });
      register(item, { centre: [x, y, ROOM.z1 - 0.06], size: [0.6, 0.85, 0.2], label: [x, y + 0.56, ROOM.z1 - 0.1], stand: [3.35, 4.0] });
    },

    // ---------------------------------------------------------- cookbook, fruit and the shopping, on the bar counter
    "iga-meal-planner"(item) {
      const tone = item.color || "#D63A2F";
      const pages = k.texture(k.canvas(640, 420, (ctx, w, h) => {
        ctx.fillStyle = "#fbf6ea"; ctx.fillRect(0, 0, w, h);
        const g = ctx.createLinearGradient(w / 2 - 26, 0, w / 2 + 26, 0); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, "rgba(0,0,0,.22)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(w / 2 - 26, 0, 52, h);
        ctx.fillStyle = tone; ctx.font = `700 26px ${serif}`; ctx.textAlign = "left"; ctx.fillText("This week", 34, 52);
        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((d, i) => { ctx.fillStyle = "#2a2a28"; ctx.font = `700 17px ${sans}`; ctx.fillText(d, 34, 96 + i * 44); ctx.fillStyle = "rgba(40,40,38,.55)"; ctx.fillRect(92, 84 + i * 44, 130 + ((i * 47) % 70), 5); ctx.fillStyle = "rgba(40,40,38,.25)"; ctx.fillRect(92, 96 + i * 44, 90 + ((i * 31) % 90), 4); });
        ctx.fillStyle = "#e9c46a"; ctx.beginPath(); ctx.ellipse(w * 0.75, 130, 100, 74, 0, 0, 7); ctx.fill(); ctx.fillStyle = "#c8553d"; ctx.beginPath(); ctx.ellipse(w * 0.75, 126, 70, 50, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#5f8f4a"; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(w * 0.75 + Math.cos(i * 1.1) * 38, 126 + Math.sin(i * 1.7) * 26, 12, 6, i, 0, 7); ctx.fill(); }
        ctx.fillStyle = "#2a2a28"; ctx.font = `700 20px ${serif}`; ctx.fillText("Shopping list", w / 2 + 40, 250);
        for (let i = 0; i < 6; i++) { ctx.strokeStyle = "#2a2a28"; ctx.lineWidth = 1.5; ctx.strokeRect(w / 2 + 40, 270 + i * 22, 11, 11); ctx.fillStyle = "rgba(40,40,38,.5)"; ctx.fillRect(w / 2 + 62, 274 + i * 22, 110 + ((i * 41) % 90), 4); }
      }), { wrap: false });
      const x = -5.0, y = 0.975, z = ROOM.z1 - 0.36;
      at(x, y, z, PI + 0.12, () => {                         // cookbook on a stand; +z faces the room
        box(M.oak, 0.5, 0.02, 0.16, 0, 0.01, 0.02); box(M.oak, 0.5, 0.05, 0.02, 0, 0.035, 0.09);
        at(0, 0.02, -0.02, [-0.42, 0, 0], () => { box(M.oak, 0.46, 0.34, 0.012, 0, 0.17, 0); box(mat(0x7a2e2a, { rough: 0.7 }), 0.47, 0.31, 0.02, 0, 0.19, 0.016); box(mat(0xffffff, { rough: 0.9, map: pages }), 0.45, 0.295, 0.012, 0, 0.19, 0.028); });
      });
      at(x - 0.55, y, z + 0.04, 0, () => {                    // bowl of fruit
        lathe(M.walnut, [[0, 0], [0.07, 0], [0.16, 0.06], [0.18, 0.1], [0.165, 0.1], [0.15, 0.065], [0.06, 0.015], [0, 0.015]], 0, 0, 0, 24);
        [[0, 0.09, 0, 0.05, 0xc0392b], [0.09, 0.085, 0.02, 0.047, 0xe98a2b], [-0.08, 0.085, 0.04, 0.046, 0x8fb24a], [0.02, 0.085, -0.09, 0.047, 0xe98a2b], [-0.04, 0.14, -0.02, 0.045, 0xf0d24a], [0.05, 0.14, 0.05, 0.048, 0xc0392b]].forEach(([fx, fy, fz, r, c]) => ball(M.paint, r, fx, fy, fz, null, c, 2));
      });
      at(x + 0.62, y, z + 0.02, 0.25, () => {                 // the shopping
        const kraft = mat(0xb58a5a, { rough: 0.95 });
        box(kraft, 0.26, 0.32, 0.16, 0, 0.16, 0);
        cyl(mat(0xd9a45c, { rough: 0.8 }), 0.03, 0.03, 0.46, -0.05, 0.36, 0.01, [0.1, 0, 0.3], 10);
        for (let i = 0; i < 6; i++) ball(M.leafB, 0.06, 0.06 + range(-0.04, 0.04), 0.35 + rnd() * 0.06, range(-0.04, 0.04), [1, 0.7, 1], null, 1);
        cyl(M.paint, 0.006, 0.02, 0.16, 0.0, 0.36, -0.04, [0.3, 0, -0.2], 8, 0xe07b2a);
        box(mat(tone, { rough: 0.8 }), 0.14, 0.06, 0.002, 0, 0.2, 0.081);
      });
      register(item, { centre: [x, y + 0.24, z], size: [1.6, 0.56, 0.6], label: [x, y + 0.66, z], stand: [-4.3, 4.3] });
    },

    // ---------------------------------------------------------- family and friends, framed by the door
    kith(item) {
      const skins = ["#f1c9a5", "#d9a17a", "#a8704c", "#7a4a30", "#f6d7bd"], hairs = ["#2a1c14", "#6b3f22", "#c79a4a", "#1b1b1f", "#b9b3aa"], shirts = ["#2b3c55", "#b0603a", "#7d9079", "#c99a45", "#8a2f3a", "#e6dcc6"];
      const grounds = ["#cfd8cf", "#e9d8c2", "#b9c7d6", "#d8c3c9", "#c9d1b4", "#e3dccb"];
      const portrait = (people, tint) => k.texture(k.canvas(256, 256, (ctx, w, h) => {
        ctx.fillStyle = "#f7f3ea"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = tint; ctx.fillRect(26, 26, w - 52, h - 52);
        ctx.save(); ctx.beginPath(); ctx.rect(26, 26, w - 52, h - 52); ctx.clip();
        for (let i = 0; i < people; i++) {
          const cx = w / 2 + (people > 1 ? (i - 0.5) * 78 : 0), s = people > 1 ? 0.8 : 1, skin = skins[Math.floor(rnd() * 5)], cy = 118 + (i % 2) * 10;
          ctx.fillStyle = shirts[Math.floor(rnd() * 6)]; ctx.beginPath(); ctx.ellipse(cx, 252, 78 * s, 76 * s, 0, 0, 7); ctx.fill();
          ctx.fillStyle = skin; ctx.fillRect(cx - 13 * s, cy + 30 * s, 26 * s, 34 * s); ctx.beginPath(); ctx.ellipse(cx, cy, 36 * s, 42 * s, 0, 0, 7); ctx.fill();
          ctx.fillStyle = hairs[Math.floor(rnd() * 5)]; ctx.beginPath(); ctx.ellipse(cx, cy - 18 * s, 39 * s, 30 * s, 0, PI, 0); ctx.fill();
          if (rnd() < 0.5) { ctx.fillRect(cx - 39 * s, cy - 20 * s, 14 * s, 62 * s); ctx.fillRect(cx + 25 * s, cy - 20 * s, 14 * s, 62 * s); }
        }
        ctx.restore(); k.grain(ctx, w, h, 0.05);
      }), { wrap: false });
      const frames = [[-0.66, 2.3, 0.46, 0.58, M.brass, 1], [-0.04, 2.38, 0.56, 0.44, M.steel, 2], [0.62, 2.3, 0.44, 0.58, M.oak, 1], [-0.54, 1.62, 0.42, 0.42, M.steel, 1], [0.06, 1.72, 0.5, 0.62, M.walnut, 2], [0.66, 1.62, 0.36, 0.44, M.brass, 1]];
      at(-2.4, 0, ROOM.z1, PI, () => frames.forEach(([fx, fy, fw, fh, frame, people], i) => {
        box(frame, fw, fh, 0.03, fx, fy, 0.015);
        box(mat(0xffffff, { rough: 0.6, map: portrait(people, grounds[i]) }), fw - 0.05, fh - 0.05, 0.006, fx, fy, 0.031);
      }));
      register(item, { centre: [-2.4, 1.98, ROOM.z1 - 0.06], size: [1.95, 1.4, 0.2], label: [-2.4, 2.84, ROOM.z1 - 0.1], stand: [-2.4, 3.7] });
    },
  };

  // ------------------------------------------------------------ anything else: a framed card on a spare shelf
  const spare = [[0, 0, 1], [1, 0, 2], [0, 0, 3], [1, 0, 0], [0, 0, 0], [1, 0, 3], [0, 1, 1], [1, 1, 2], [0, 1, 2], [1, 1, 1], [0, 1, 0], [1, 1, 3], [0, 1, 3], [1, 1, 0]];
  function card(item) {
    const slot = spare.find(([unit, level, bay]) => !niches.find((n) => n.unit === unit && n.level === level && n.bay === bay).used);
    if (!slot) return;                                   // more new apps than shelf space: still listed in the directory
    const n = niche(...slot), tone = item.color || "#b8aa89", size = n.level === 0 ? 0.34 : 0.3;
    const face = screen(256, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#fbf7ee"); g.addColorStop(1, "#eee6d4"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(w / 2, h / 2, 92, 0, 7); ctx.fill();
      ctx.font = `110px ${sans}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (!/\.(svg|png|jpe?g|webp|gif|avif)$/i.test(item.icon || "")) ctx.fillText(item.icon || "◆", w / 2, h / 2 + 8);
    }, { glow: false });
    if (/\.(svg|png|jpe?g|webp|gif|avif)$/i.test(item.icon || "")) {
      const img = new Image();
      img.onload = () => { const c = face.material.map.image.getContext("2d"); c.drawImage(img, 68, 68, 120, 120); face.material.map.needsUpdate = true; };
      img.src = item.icon;
    }
    at(n.x, n.y, n.z + 0.12, 0, () => {
      box(M.oak, size + 0.06, 0.02, 0.14, 0, 0.01, 0);
      at(0, 0.02, -0.03, [-0.2, 0, 0], () => { box(M.brass, size + 0.04, size + 0.04, 0.02, 0, size / 2 + 0.02, 0); box(face.material, size, size, 0.006, 0, size / 2 + 0.02, 0.012); });
    });
    register(item, { centre: [n.x, n.y + size / 2 + 0.03, n.z + 0.12], size: [size + 0.14, size + 0.12, 0.3], label: [n.x, n.y + size + 0.16, n.z + 0.15], stand: [n.x, n.level === 0 ? -4.15 : -3.9] });
  }

  for (const item of items) (builders[item.id] || card)(item);
  return targets;
}
