const status = document.getElementById("room-status");
const directory = document.getElementById("directory");
const detail = document.getElementById("detail");
const intro = document.getElementById("intro");
const toggle = document.getElementById("directory-toggle");
const list = document.getElementById("directory-list");
const canvas = document.getElementById("room-canvas");
const controls = document.getElementById("controls");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const station = {
  id: "command-station", name: "Command Station", category: "Live public information",
  tagline: "Headlines, local conditions, earthquakes, orbit and more, gathered in one place.",
  icon: "🖥️", color: "#d8aa6a", path: "station.html#station", action: "Open station"
};
let items = [];
let focusObject = () => {};

// Keep links to sections of the former home page working.
if (["#station", "#tools", "#rack", "#subject"].includes(location.hash)) {
  location.replace("station.html" + location.search + location.hash);
}

function icon(container, item) {
  container.replaceChildren();
  if (/\.(svg|png|jpe?g|webp|gif|avif)$/i.test(item.icon || "")) {
    const img = document.createElement("img");
    img.src = item.icon;
    img.alt = "";
    container.append(img);
  } else {
    container.textContent = item.icon || "◆";
  }
}

function closePanel(panel) {
  panel.hidden = true;
  if (panel === directory) toggle.setAttribute("aria-expanded", "false");
}

function showDetail(item) {
  intro.hidden = true;
  closePanel(directory);
  document.getElementById("detail-category").textContent = item.category || "THE COLLECTION";
  document.getElementById("detail-title").textContent = item.name;
  document.getElementById("detail-description").textContent = item.tagline || "";
  icon(document.getElementById("detail-icon"), item);
  const links = document.getElementById("detail-links");
  links.replaceChildren();
  const destinations = [{ label: item.action || "Open app", href: item.path + (item.entry || "") }, ...(item.links || [])];
  for (const destination of destinations) {
    const a = document.createElement("a");
    a.href = destination.href;
    a.textContent = destination.label + " ↗";
    links.append(a);
  }
  detail.hidden = false;
  focusObject(item.id);
  detail.querySelector(".close").focus();
}

function renderDirectory() {
  list.replaceChildren();
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "directory-item";
    const image = document.createElement("span");
    image.className = "item-icon";
    image.setAttribute("aria-hidden", "true");
    icon(image, item);
    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = item.name;
    const category = document.createElement("small");
    category.textContent = item.category || "App";
    text.append(name, category);
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    button.append(image, text, arrow);
    button.addEventListener("click", () => showDetail(item));
    list.append(button);
  }
}

toggle.addEventListener("click", () => {
  const opening = directory.hidden;
  closePanel(detail);
  directory.hidden = !opening;
  toggle.setAttribute("aria-expanded", String(opening));
  if (opening) intro.hidden = true;
});
document.getElementById("intro-close").addEventListener("click", () => { intro.hidden = true; });
document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => {
    closePanel(document.getElementById(button.dataset.close));
    toggle.focus();
  });
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!detail.hidden) { closePanel(detail); toggle.focus(); }
    else if (!directory.hidden) { closePanel(directory); toggle.focus(); }
    else intro.hidden = true;
  }
});

async function start() {
  try {
    const response = await fetch("apps.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
    const registry = await response.json();
    if (!Array.isArray(registry.apps)) throw new Error("Registry has no apps list");
    items = [...registry.apps.filter((app) => app && app.id && app.name && app.path), station];
    renderDirectory();
  } catch (error) {
    console.error("Could not load the app registry:", error);
    items = [station];
    renderDirectory();
    status.textContent = "The app collection could not be loaded. Try the classic directory.";
    directory.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  }

  try {
    const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js");
    createRoom(THREE);
    if (items.length > 1) status.textContent = "";
  } catch (error) {
    console.error("Could not start the 3D workshop:", error);
    status.textContent = "3D is unavailable here. Browse the collection below.";
    document.getElementById("instructions").hidden = true;
    intro.hidden = true;
    directory.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  }
}

function createRoom(T) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color(0x1b2b29);
  scene.fog = new T.Fog(0x1b2b29, 13, 30);
  const camera = new T.PerspectiveCamera(65, 1, 0.1, 60);
  camera.position.set(0, 1.65, 3.2);
  let yaw = 0.3;
  let pitch = 0;

  scene.add(new T.HemisphereLight(0xdce9d6, 0x342e25, 2));
  const sunlight = new T.DirectionalLight(0xffe3b2, 2.4);
  sunlight.position.set(-5, 9, 3);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = sunlight.shadow.camera.bottom = -11;
  sunlight.shadow.camera.right = sunlight.shadow.camera.top = 11;
  sunlight.shadow.bias = -0.0004;
  scene.add(sunlight);

  const mat = (color, options = {}) => new T.MeshStandardMaterial({ color, roughness: 0.8, ...options });
  const wall = mat(0x66796c);
  const trim = mat(0x354941);
  const floor = mat(0x9a8f78);
  const dark = mat(0x253937);
  const brass = mat(0xd4ac71, { metalness: 0.65, roughness: 0.35 });
  function box(w, h, d, material, x, y, z, parent = scene) {
    const object = new T.Mesh(new T.BoxGeometry(w, h, d), material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function cylinder(rt, rb, h, material, x, y, z, parent, segments = 32) {
    const object = new T.Mesh(new T.CylinderGeometry(rt, rb, h, segments), material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  box(18, 0.2, 18, floor, 0, -0.1, 0);
  box(18, 6, 0.2, wall, 0, 3, -9);
  box(18, 6, 0.2, wall, 0, 3, 9);
  box(0.2, 6, 18, wall, -9, 3, 0);
  box(0.2, 6, 18, wall, 9, 3, 0);
  box(18, 0.2, 18, mat(0x566a5d), 0, 6, 0);
  for (const y of [0.18, 4.65]) {
    box(18, 0.12, 0.13, trim, 0, y, -8.86);
    box(18, 0.12, 0.13, trim, 0, y, 8.86);
    box(0.13, 0.12, 18, trim, -8.86, y, 0);
    box(0.13, 0.12, 18, trim, 8.86, y, 0);
  }
  const seams = mat(0x827a69);
  for (let n = -8; n <= 8; n += 2) {
    box(0.015, 0.004, 18, seams, n, 0.004, 0);
    box(18, 0.004, 0.015, seams, 0, 0.004, n);
  }
  // A quiet architectural backdrop, with light falling through three tall panels.
  for (const x of [-4, 0, 4]) {
    box(2.2, 3.2, 0.08, trim, x, 3, -8.84);
    box(2.04, 3.04, 0.09, mat(0x94aa98), x, 3, -8.78);
    box(0.055, 3.04, 0.1, trim, x, 3, -8.72);
    box(2.04, 0.055, 0.1, trim, x, 3, -8.72);
  }
  box(4.4, 0.02, 2.5, mat(0x596c5c), 0, 0.02, 0);
  const fixtures = new T.Group();
  scene.add(fixtures);
  const targets = [];
  const positions = new Map();

  function label(text) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 96;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgba(22, 38, 35, .92)";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#b69b6b";
    ctx.strokeRect(2, 2, c.width - 4, c.height - 4);
    ctx.fillStyle = "#f3eee1";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 30px sans-serif";
    ctx.fillText(text, 256, 48, 480);
    const texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(2.25, 0.42, 1);
    return sprite;
  }

  function model(item, parent) {
    const color = mat(item.color || "#b8aa89", { metalness: 0.15 });
    const pale = mat(0xe4ddca);
    const glow = mat(item.color || "#d8aa6a", { emissive: item.color || "#d8aa6a", emissiveIntensity: 0.4 });
    const group = new T.Group();
    group.position.y = 1.28;
    parent.add(group);
    if (item.id === "observatory") {
      const sphere = new T.Mesh(new T.IcosahedronGeometry(0.55, 3), color);
      sphere.position.y = 0.68; group.add(sphere);
      const ring = new T.Mesh(new T.TorusGeometry(0.76, 0.018, 8, 64), brass);
      ring.position.y = 0.68; ring.rotation.set(1.05, 0, 0.35); group.add(ring);
      cylinder(0.18, 0.28, 0.1, brass, 0, 0.05, 0, group);
      cylinder(0.035, 0.035, 0.32, brass, 0, 0.25, 0, group);
    } else if (item.id === "radar-lab") {
      cylinder(0.28, 0.35, 0.09, brass, 0, 0.05, 0, group);
      cylinder(0.06, 0.08, 0.48, pale, 0, 0.3, 0, group);
      const points = [];
      for (let i = 0; i <= 12; i++) { const r = i * 0.05; points.push(new T.Vector2(r, r * r * 0.6)); }
      const dish = new T.Mesh(new T.LatheGeometry(points, 32), color);
      dish.position.y = 0.65; dish.rotation.x = 0.85; group.add(dish);
      const feed = new T.Mesh(new T.SphereGeometry(0.07, 16, 12), brass);
      feed.position.set(0, 0.9, 0.3); group.add(feed);
    } else if (item.id === "waveguide-modes") {
      box(1.05, 0.72, 0.72, color, 0, 0.48, 0, group);
      box(0.86, 0.52, 0.03, dark, 0, 0.48, 0.37, group);
      for (let i = 0; i < 5; i++) {
        const curve = new T.CatmullRomCurve3(Array.from({ length: 25 }, (_, n) =>
          new T.Vector3(-0.4 + n / 30, 0.48 + 0.19 * Math.sin(n / 24 * Math.PI * 2 + i * 0.55), 0.395)));
        group.add(new T.Mesh(new T.TubeGeometry(curve, 32, 0.012, 6, false), glow));
      }
    } else if (item.id === "stride-roulette") {
      const body = new T.Mesh(new T.CylinderGeometry(0.14, 0.43, 1.1, 4), color);
      body.rotation.y = Math.PI / 4; body.position.y = 0.6; group.add(body);
      box(0.09, 0.8, 0.05, pale, 0, 0.62, 0.24, group).rotation.z = -0.24;
      box(0.55, 0.08, 0.55, brass, 0, 0.04, 0, group);
    } else if (item.id === "local-events") {
      box(1.05, 0.82, 0.14, pale, 0, 0.55, 0, group);
      box(1.05, 0.18, 0.16, color, 0, 0.87, 0, group);
      for (let x = -1; x <= 1; x++) for (let y = 0; y < 2; y++) {
        box(0.13, 0.1, 0.02, color, x * 0.27, 0.37 + y * 0.22, 0.08, group);
      }
    } else if (item.id === "command-station") {
      box(1.1, 0.72, 0.12, pale, 0, 0.72, 0, group);
      box(0.96, 0.58, 0.03, dark, 0, 0.72, 0.075, group);
      for (let i = 0; i < 4; i++) box(0.65 - i * 0.1, 0.035, 0.02, glow, -i * 0.05, 0.89 - i * 0.12, 0.1, group);
      cylinder(0.04, 0.04, 0.3, brass, 0, 0.22, 0, group);
      box(0.6, 0.05, 0.35, brass, 0, 0.04, 0, group);
    } else {
      const crystal = new T.Mesh(new T.OctahedronGeometry(0.55), color);
      crystal.position.y = 0.65; group.add(crystal);
    }
  }

  items.forEach((item, index) => {
    const angle = (index - (items.length - 1) / 2) * Math.PI * 2 / items.length;
    const x = Math.sin(angle) * 6.1;
    const z = -Math.cos(angle) * 6.1;
    const group = new T.Group();
    group.position.set(x, 0, z);
    group.rotation.y = Math.atan2(-x, -z);
    group.userData.item = item;
    fixtures.add(group);
    cylinder(0.72, 0.8, 0.12, dark, 0, 0.06, 0, group);
    cylinder(0.62, 0.68, 1.08, mat(0xd4ccba), 0, 0.66, 0, group);
    cylinder(0.72, 0.72, 0.12, brass, 0, 1.26, 0, group);
    model(item, group);
    const name = label(item.name);
    name.position.set(0, 2.75, 0);
    group.add(name);
    targets.push(group);
    positions.set(item.id, group.position);
  });
  focusObject = (id) => {
    const position = positions.get(id);
    if (position) {
      yaw = Math.atan2(-(position.x - camera.position.x), -(position.z - camera.position.z));
      pitch = 0;
    }
  };

  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  window.addEventListener("resize", resize);
  resize();
  controls.hidden = false;
  const held = new Set();
  const keys = { w: "forward", s: "back", a: "strafeLeft", d: "strafeRight", ArrowUp: "forward", ArrowDown: "back", ArrowLeft: "left", ArrowRight: "right" };
  window.addEventListener("keydown", (event) => {
    if (event.target.closest("input, select, textarea") || !detail.hidden || !directory.hidden) return;
    const key = keys[event.key] || keys[event.key.toLowerCase()];
    if (key) { event.preventDefault(); held.add(key); }
  });
  window.addEventListener("keyup", (event) => {
    const key = keys[event.key] || keys[event.key.toLowerCase()];
    if (key) held.delete(key);
  });
  window.addEventListener("blur", () => held.clear());
  controls.querySelectorAll("button").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      held.add(button.dataset.move);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      button.addEventListener(type, () => held.delete(button.dataset.move));
    }
  });
  let pointer = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointer = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointer) return;
    if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 5) pointer.moved = true;
    if (pointer.moved) {
      yaw -= (event.clientX - pointer.x) * 0.005;
      pitch = T.MathUtils.clamp(pitch - (event.clientY - pointer.y) * 0.004, -0.65, 0.65);
    }
    pointer.x = event.clientX; pointer.y = event.clientY;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (pointer && !pointer.moved) {
      const rect = canvas.getBoundingClientRect();
      const mouse = new T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      const ray = new T.Raycaster();
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(targets, true)[0];
      if (hit) {
        let object = hit.object;
        while (object && !object.userData.item) object = object.parent;
        if (object) showDetail(object.userData.item);
      }
    }
    pointer = null;
  });
  canvas.addEventListener("pointercancel", () => { pointer = null; });

  let previous = performance.now();
  function frame(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    yaw += ((held.has("left") ? 1 : 0) - (held.has("right") ? 1 : 0)) * dt * 1.6;
    const forward = (held.has("forward") ? 1 : 0) - (held.has("back") ? 1 : 0);
    const side = (held.has("strafeRight") ? 1 : 0) - (held.has("strafeLeft") ? 1 : 0);
    const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * dt * 3;
    const dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * dt * 3;
    const canMove = (x, z) => Math.abs(x) < 8.4 && Math.abs(z) < 8.4 &&
      [...positions.values()].every((p) => Math.hypot(x - p.x, z - p.z) > 1.05);
    if (canMove(camera.position.x + dx, camera.position.z)) camera.position.x += dx;
    if (canMove(camera.position.x, camera.position.z + dz)) camera.position.z += dz;
    camera.rotation.order = "YXZ";
    camera.rotation.set(pitch, yaw, 0);
    if (!reducedMotion) fixtures.children.forEach((group, i) => {
      const sprite = group.children.find((child) => child.isSprite);
      if (sprite) sprite.position.y = 2.75 + Math.sin(now * 0.001 + i) * 0.04;
    });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start();
