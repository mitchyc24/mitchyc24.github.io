// miApps rack: a 3D shelf with one model per subject. Pure enhancement: hub.js renders the subject
// nodes as ordinary links in a grid, and this module draws the rack behind them and moves each link
// over its bay. If WebGL or the CDN is unavailable the grid simply stays as it is.
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

const stage = document.getElementById("rack");
const canvas = document.getElementById("rack-canvas");
const nodesEl = document.getElementById("rack-nodes");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

const BAY = { w: 2.3, h: 2.45, d: 1.5 };   // one bay of the rack, in scene units
const POST = 0.07;                         // thickness of uprights and shelves

async function main() {
  if (!stage || !canvas || !window.miHub) return;
  const subjects = await window.miHub.ready;
  if (!subjects || !subjects.length) return;
  const THREE = await import(THREE_URL);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  const rack = new THREE.Group();
  scene.add(rack);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.5);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);

  const frameMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.35 });
  const shelfMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 });
  const backMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const neutral = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.5, metalness: 0.3, flatShading: true });

  const mat = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, flatShading: true, ...extra });
  const glow = (color, intensity = 1.2) => mat(color, { emissive: color, emissiveIntensity: intensity });
  const mesh = (geo, material) => { const m = new THREE.Mesh(geo, material); m.castShadow = true; return m; };
  const FLOOR = -BAY.h / 2 + POST / 2;   // top of the shelf a model stands on, relative to the bay centre

  // ---------------------------------------------------------------- models
  // Each builder returns { group, tick(t, dt, speed) }. Models stand on y = FLOOR and fit in a ~1.5 unit cube.
  const MODELS = {
    globe(color) {
      const g = new THREE.Group();
      const ball = mesh(new THREE.IcosahedronGeometry(0.6, 2), mat(color));
      const grid = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.SphereGeometry(0.615, 12, 8)),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
      const orbit = new THREE.Group();
      orbit.rotation.set(0.5, 0, 0.35);
      const ring = mesh(new THREE.TorusGeometry(0.86, 0.012, 6, 72), neutral);
      ring.rotation.x = Math.PI / 2;
      const sat = new THREE.Group();
      sat.add(mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), neutral));
      const panel = mesh(new THREE.BoxGeometry(0.36, 0.012, 0.08), glow(0xF0B45A, 0.5));
      sat.add(panel);
      orbit.add(ring, sat);
      const stand = mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.08, 20), neutral);
      stand.position.y = FLOOR + 0.04;
      const post = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), neutral);
      post.position.y = FLOOR + 0.24;
      g.add(ball, grid, orbit, stand, post);
      ball.position.y = grid.position.y = orbit.position.y = 0.05;
      return { group: g, tick(t, dt, speed) {
        ball.rotation.y += dt * 0.35 * speed; grid.rotation.y = ball.rotation.y;
        const a = t * 0.9;
        sat.position.set(Math.cos(a) * 0.86, 0, Math.sin(a) * 0.86);
        sat.rotation.y = -a;
      } };
    },

    dish(color) {
      const g = new THREE.Group();
      const base = mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.1, 20), neutral);
      base.position.y = FLOOR + 0.05;
      const mast = mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.6, 12), neutral);
      mast.position.y = FLOOR + 0.4;
      const head = new THREE.Group();
      head.position.y = FLOOR + 0.78;
      const aim = new THREE.Group();          // local +y is the boresight
      aim.rotation.x = 0.95;
      const pts = [];
      for (let i = 0; i <= 10; i++) { const x = (i / 10) * 0.62; pts.push(new THREE.Vector2(x, x * x * 0.62)); }
      const bowl = mesh(new THREE.LatheGeometry(pts, 28), mat(color, { side: THREE.DoubleSide }));
      const arm = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), neutral);
      arm.position.y = 0.21;
      const feed = mesh(new THREE.ConeGeometry(0.06, 0.1, 12), glow(0xF0B45A, 0.8));
      feed.position.y = 0.42;
      aim.add(bowl, arm, feed);
      const pulses = [0, 1, 2].map((i) => {
        const p = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 40),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }));
        p.rotation.x = Math.PI / 2;
        p.userData.phase = i / 3;
        aim.add(p);
        return p;
      });
      head.add(aim);
      g.add(base, mast, head);
      return { group: g, tick(t, dt, speed) {
        head.rotation.y = Math.sin(t * 0.5) * 0.7;
        for (const p of pulses) {
          const k = (t * 0.45 * (0.6 + 0.4 * speed) + p.userData.phase) % 1;
          p.position.y = 0.45 + k * 0.75;
          p.scale.setScalar(0.6 + k * 1.6);
          p.material.opacity = (1 - k) * 0.7;
        }
      } };
    },

    metronome(color) {
      const g = new THREE.Group();
      const body = mesh(new THREE.CylinderGeometry(0.13, 0.46, 1.25, 4), mat(color));
      body.rotation.y = Math.PI / 4;
      body.position.y = FLOOR + 0.67;
      const foot = mesh(new THREE.BoxGeometry(0.76, 0.08, 0.76), neutral);
      foot.position.y = FLOOR + 0.04;
      const face = mesh(new THREE.BoxGeometry(0.16, 0.9, 0.02), dark);
      face.position.set(0, FLOOR + 0.62, 0.235);
      face.rotation.x = -0.26;
      const pivot = new THREE.Group();
      pivot.position.set(0, FLOOR + 0.2, 0.37);
      const rod = mesh(new THREE.BoxGeometry(0.025, 1.2, 0.025), neutral);
      rod.position.y = 0.6;
      const weight = mesh(new THREE.BoxGeometry(0.13, 0.13, 0.06), glow(0xF0B45A, 0.5));
      weight.position.y = 0.78;
      pivot.add(rod, weight);
      g.add(body, foot, face, pivot);
      return { group: g, tick(t, dt, speed) {
        g.rotation.y = Math.sin(t * 0.35) * 0.45;
        pivot.rotation.z = Math.sin(t * Math.PI * (1.2 + 0.5 * speed)) * 0.42;
      } };
    },

    pin(color) {
      const g = new THREE.Group();
      const ground = mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.05, 32), neutral);
      ground.position.y = FLOOR + 0.025;
      ground.receiveShadow = true;
      const town = new THREE.Group();
      for (const [x, z, s] of [[-0.42, 0.18, 0.2], [0.4, -0.22, 0.3], [0.3, 0.36, 0.16], [-0.26, -0.4, 0.26], [-0.5, -0.12, 0.14]]) {
        const b = mesh(new THREE.BoxGeometry(0.15, s, 0.15), neutral);
        b.position.set(x, FLOOR + 0.05 + s / 2, z);
        town.add(b);
      }
      const pin = new THREE.Group();
      const head = mesh(new THREE.SphereGeometry(0.3, 20, 14), mat(color, { flatShading: false }));
      head.position.y = 0.62;
      const tip = mesh(new THREE.ConeGeometry(0.262, 0.6, 20), mat(color, { flatShading: false }));
      tip.rotation.x = Math.PI;
      tip.position.y = 0.3;
      const eye = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.62, 20), glow(0xffffff, 0.25));
      eye.rotation.x = Math.PI / 2;
      eye.position.y = 0.62;
      pin.add(head, tip, eye);
      g.add(ground, town, pin);
      return { group: g, tick(t, dt, speed) {
        pin.rotation.y += dt * 0.9 * speed;
        pin.position.y = FLOOR + 0.12 + Math.abs(Math.sin(t * 1.6)) * 0.14;
        town.rotation.y = ground.rotation.y += dt * 0.12;
      } };
    },

    console(color) {
      const g = new THREE.Group();
      const base = mesh(new THREE.BoxGeometry(0.6, 0.05, 0.36), neutral);
      base.position.y = FLOOR + 0.025;
      const neck = mesh(new THREE.BoxGeometry(0.1, 0.34, 0.06), neutral);
      neck.position.y = FLOOR + 0.2;
      const head = new THREE.Group();
      head.position.y = FLOOR + 0.78;
      head.rotation.x = -0.1;
      head.add(mesh(new THREE.BoxGeometry(1.36, 0.86, 0.07), neutral));
      const screen = mesh(new THREE.BoxGeometry(1.26, 0.76, 0.02), dark);
      screen.position.z = 0.036;
      head.add(screen);
      const bars = [0.9, 0.55, 0.75, 0.4, 0.62].map((len, i) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.012), glow(i === 0 ? 0xffffff : color, i === 0 ? 0.4 : 1.1));
        b.position.set(-0.55, 0.27 - i * 0.13, 0.05);
        b.geometry.translate(0.5, 0, 0);     // scale from the left edge
        b.userData.len = len;
        head.add(b);
        return b;
      });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), glow(0x3DDC84, 1.6));
      dot.position.set(0.5, -0.29, 0.05);
      head.add(dot);
      g.add(base, neck, head);
      return { group: g, tick(t, dt, speed) {
        g.rotation.y = Math.sin(t * 0.4) * 0.5;
        bars.forEach((b, i) => { b.scale.x = b.userData.len * (0.72 + 0.28 * Math.sin(t * (0.9 + 0.4 * speed) + i * 1.7)); });
        dot.visible = Math.sin(t * 4) > -0.3;
      } };
    },

    gears(color) {
      const gear = (teeth, r, material) => {
        const shape = new THREE.Shape();
        const step = (Math.PI * 2) / teeth, tip = r + 0.085, root = r - 0.035;
        for (let i = 0; i < teeth; i++) {
          const a = i * step;
          const p = (rad, off) => [Math.cos(a + off * step) * rad, Math.sin(a + off * step) * rad];
          shape[i ? "lineTo" : "moveTo"](...p(root, 0));
          shape.lineTo(...p(tip, 0.14));
          shape.lineTo(...p(tip, 0.36));
          shape.lineTo(...p(root, 0.5));
        }
        shape.closePath();
        const hole = new THREE.Path();
        hole.absarc(0, 0, r * 0.3, 0, Math.PI * 2, true);
        shape.holes.push(hole);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false, curveSegments: 20 });
        geo.translate(0, 0, -0.08);
        return mesh(geo, material);
      };
      const g = new THREE.Group();
      const big = gear(12, 0.48, mat(color));
      const small = gear(8, 0.32, neutral);
      big.position.set(-0.3, FLOOR + 0.62, 0);
      small.position.set(0.52, FLOOR + 0.88, 0.02);
      const axle = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 12), neutral);
      axle.rotation.x = Math.PI / 2;
      axle.position.copy(big.position);
      const axle2 = axle.clone();
      axle2.position.copy(small.position);
      g.add(big, small, axle, axle2);
      const phase = Math.PI / 8;
      return { group: g, tick(t, dt, speed) {
        g.rotation.y = Math.sin(t * 0.45) * 0.55;
        big.rotation.z += dt * 0.5 * speed;
        small.rotation.z = -big.rotation.z * 1.5 + phase;
      } };
    },
  };

  // ---------------------------------------------------------------- rack + bays
  const frame = new THREE.Group();
  rack.add(frame);
  const bays = subjects.map((s) => {
    const color = new THREE.Color(s.color || "#7B97FF");
    const model = (MODELS[s.model] || MODELS.gears)(color);
    const holder = new THREE.Group();
    holder.add(model.group);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x20242b, emissive: color, emissiveIntensity: 0.15 }));
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.8, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2;
    rack.add(holder, led, pad);
    return {
      id: s.id, model, holder, led, pad, heat: 0, hover: false, selected: false,
      el: nodesEl.querySelector(`[data-subject="${CSS.escape(s.id)}"]`), rect: "",
    };
  });

  let cols = 3, rows = 2, size = { w: 0, h: 0 };
  let dirty = true, visible = true, last = performance.now(), time = 0, settle = 0;
  const box = (w, h, d, material, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    frame.add(m);
    return m;
  };

  function layout() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    size = { w, h };
    const n = bays.length;
    cols = Math.min(n, w / h > 2.6 ? n : w / h > 1.1 ? 3 : 2);
    rows = Math.ceil(n / cols);
    const W = cols * BAY.w, H = rows * BAY.h;

    for (const m of frame.children) m.geometry.dispose();
    frame.clear();
    for (let c = 0; c <= cols; c++) {
      const x = -W / 2 + c * BAY.w;
      box(POST, H + POST, POST, frameMat, x, 0, BAY.d / 2);
      box(POST, H + POST, POST, frameMat, x, 0, -BAY.d / 2);
    }
    for (let r = 0; r <= rows; r++) {
      box(W + POST, POST, BAY.d + POST, shelfMat, 0, -H / 2 + r * BAY.h, 0);
    }
    const back = box(W, H, 0.02, backMat, 0, 0, -BAY.d / 2);
    back.castShadow = back.receiveShadow = false;

    bays.forEach((b, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      b.x = -W / 2 + (c + 0.5) * BAY.w;
      b.y = H / 2 - (r + 0.5) * BAY.h;
      b.holder.position.set(b.x, b.y, 0);
      b.led.position.set(b.x, b.y - BAY.h / 2, BAY.d / 2 + POST / 2 + 0.01);
      b.pad.position.set(b.x, b.y + FLOOR + 0.004, 0);
    });

    // Pull the camera back until the whole rack fits, with a little air around it.
    camera.aspect = w / h;
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max((H * 1.12) / 2 / t, (W * 1.1) / 2 / (t * camera.aspect)) + BAY.d / 2;
    camera.position.set(0, H * 0.06, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    sun.position.set(-W * 0.35, H * 0.9 + 3, dist * 0.7);
    const s = sun.shadow.camera;
    s.left = -W / 2 - 1; s.right = W / 2 + 1; s.top = H / 2 + 1; s.bottom = -H / 2 - 1; s.near = 0.5; s.far = dist * 2 + 10;
    s.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    nodesEl.style.setProperty("--cols", cols);
    dirty = true;
  }

  // Each link is laid over the front opening of its bay, so the whole bay is the tap target.
  const corner = new THREE.Vector3();
  function placeNodes() {
    rack.updateMatrixWorld();
    for (const b of bays) {
      if (!b.el) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        corner.set(b.x + (sx * BAY.w) / 2, b.y + (sy * BAY.h) / 2, BAY.d / 2).applyMatrix4(rack.matrixWorld).project(camera);
        const px = (corner.x * 0.5 + 0.5) * size.w, py = (-corner.y * 0.5 + 0.5) * size.h;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      const rect = [x0, y0, x1 - x0, y1 - y0].map((v) => Math.round(v)).join(",");
      if (rect === b.rect) continue;
      b.rect = rect;
      // Custom properties, so the plain grid is untouched if the rack is ever switched off.
      rect.split(",").forEach((v, i) => b.el.style.setProperty(["--l", "--t", "--w", "--h"][i], `${v}px`));
    }
  }

  function theme() {
    const css = getComputedStyle(stage);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    frameMat.color.set(v("--rack-frame", "#8A8E96"));
    shelfMat.color.set(v("--rack-shelf", "#D9D6CD"));
    backMat.color.set(v("--rack-back", "#E6E3DB"));
    neutral.color.set(v("--rack-part", "#C9CBD1"));
    const isDark = matchMedia("(prefers-color-scheme: dark)").matches;
    hemi.intensity = isDark ? 0.9 : 1.5;
    sun.intensity = isDark ? 2.0 : 2.4;
    dirty = true;
  }

  // ---------------------------------------------------------------- interaction
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  stage.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const r = stage.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    dirty = true;
  });
  stage.addEventListener("pointerleave", () => { pointer.tx = pointer.ty = 0; dirty = true; });
  for (const b of bays) {
    if (!b.el) continue;
    const set = (on) => () => { b.hover = on; dirty = true; };
    b.el.addEventListener("pointerenter", set(true));
    b.el.addEventListener("pointerleave", set(false));
    b.el.addEventListener("focus", set(true));
    b.el.addEventListener("blur", set(false));
  }
  const select = (id) => { for (const b of bays) b.selected = b.id === id; dirty = true; };
  window.addEventListener("mihub:select", (e) => select(e.detail));
  const current = nodesEl.querySelector("[aria-current]");
  if (current) select(current.dataset.subject);

  // ---------------------------------------------------------------- loop
  function frameTick(now) {
    requestAnimationFrame(frameTick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!visible || document.hidden) return;
    // With reduced motion the scene only redraws while something is changing (hover, select, resize).
    if (reduced.matches) {
      if (dirty) settle = 0.6;
      if (settle <= 0) return;
      settle -= dt;
    } else {
      time += dt;
    }
    dirty = false;

    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 5);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 5);
    rack.rotation.y = pointer.x * 0.16 + (reduced.matches ? 0 : Math.sin(time * 0.25) * 0.03);
    rack.rotation.x = pointer.y * 0.05;

    for (const b of bays) {
      const want = b.hover ? 1 : b.selected ? 0.7 : 0;
      b.heat += (want - b.heat) * Math.min(1, dt * 8);
      if (!reduced.matches) b.model.tick(time, dt, 1 + b.heat * 2.5);
      b.holder.scale.setScalar(0.92 + b.heat * 0.1);
      b.led.material.emissiveIntensity = 0.15 + b.heat * 2.2;
      b.pad.material.opacity = b.heat * 0.22;
    }
    renderer.render(scene, camera);
    placeNodes();
  }

  for (const b of bays) b.model.tick(0, 0, 1);
  theme();
  stage.classList.add("is-3d");
  layout();
  new ResizeObserver(layout).observe(stage);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", theme);
  reduced.addEventListener("change", () => { dirty = true; });
  new IntersectionObserver((entries) => { visible = entries.some((e) => e.isIntersecting); }).observe(stage);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stage.classList.remove("is-3d"); visible = false; });
  requestAnimationFrame(frameTick);
}

main().catch((err) => {
  console.warn("miApps: 3D rack unavailable, showing the plain subject grid.", err);
  if (stage) stage.classList.remove("is-3d");
});
