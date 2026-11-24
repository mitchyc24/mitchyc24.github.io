// The living room itself: builds the house, garden, furniture and artefacts, lights them, and runs
// the first-person camera. room.js loads this (and three.js) on demand and owns the page chrome.
import { createKit, ROOM, DECK, DOOR } from "./kit.js";
import { buildHouse } from "./house.js";
import { buildOutdoors } from "./outdoors.js";
import { buildFurniture, fillShelves } from "./furniture.js";
import { buildArtefacts } from "./artefacts.js";
import { buildAmbience } from "./ambience.js";

const EYE = 1.65, RADIUS = 0.32, SPEED = 3.1;

export function createRoom(T, { canvas, items, tags, pad, reducedMotion, isBlocked, onSelect, onExplore }) {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  let ratio = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
  renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;          // nothing that casts a shadow moves, so render the map once

  const scene = new T.Scene();
  scene.fog = new T.Fog(0xe8bf9c, 70, 1200);
  const camera = new T.PerspectiveCamera(62, 1, 0.08, 2600);
  camera.rotation.order = "YXZ";

  // ------------------------------------------------------------ build
  const k = createKit(T, { anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
  k.obstacles = [[-6.15, 6.15, ROOM.z0, ROOM.z0 + 0.7], [-1.35, 1.35, ROOM.z0, ROOM.z0 + 1.25]];
  k.lamps = [];
  const outdoors = buildOutdoors(k, scene);
  const house = buildHouse(k);
  buildFurniture(k);
  const targets = buildArtefacts(k, scene, items, house.niches);
  fillShelves(k, house.niches);
  const ambience = buildAmbience(k, scene, outdoors.sunDir, { motion: !reducedMotion });
  k.flush(scene);

  // ------------------------------------------------------------ light
  const sun = new T.DirectionalLight(0xffd3a2, 5.2);
  sun.position.copy(outdoors.sunDir).multiplyScalar(70).add(new T.Vector3(2.5, 0, 0));
  sun.target.position.set(2.5, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 2048 : 4096, 2048);
  Object.assign(sun.shadow.camera, { left: -14.5, right: 14.5, top: 9, bottom: -8, near: 1, far: 150 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  scene.add(new T.HemisphereLight(0xd7e4f5, 0x8a7458, 0.3));
  // Sunlight bouncing off the floor back into the room, faked with a warm fill near the bright patch.
  k.lamps.push({ x: 4.2, y: 0.5, z: -1.2, intensity: 7, distance: 11, color: 0xffb882 });
  const budget = coarse ? 7 : 12;
  k.lamps.sort((a, b) => b.intensity - a.intensity).slice(0, budget).forEach((spec) => {
    spec.light = new T.PointLight(spec.color, spec.intensity, spec.distance, 2);
    spec.light.position.set(spec.x, spec.y, spec.z);
    scene.add(spec.light);
  });

  // Image-based light: the open sky for everything outdoors, and for the room a probe captured from
  // the middle of the room itself, so surfaces pick up the windows, the fire and the sunlit floor.
  const pmrem = new T.PMREMGenerator(renderer);
  const skyEnv = pmrem.fromScene(outdoors.skyScene, 0, 1, 2600).texture;
  for (const m of k.outdoor) { m.envMap = skyEnv; m.envMapIntensity = 0.85; }
  scene.environment = skyEnv;
  scene.environmentIntensity = 0.3;
  ambience.overlays.visible = false;
  scene.position.set(-0.4, -1.9, 1.3);
  scene.updateMatrixWorld(true);
  renderer.shadowMap.needsUpdate = true;
  const roomEnv = pmrem.fromScene(scene, 0.02, 0.1, 2600).texture;
  scene.position.set(0, 0, 0);
  scene.updateMatrixWorld(true);
  scene.environment = roomEnv;
  scene.environmentIntensity = 1.0;
  ambience.overlays.visible = true;
  renderer.shadowMap.needsUpdate = true;
  pmrem.dispose();

  // ------------------------------------------------------------ where you can walk
  const blockers = k.obstacles;
  function free(x, z) {
    const inRoom = x > ROOM.x0 + RADIUS && x < ROOM.x1 - RADIUS && z > ROOM.z0 + RADIUS && z < ROOM.z1 - RADIUS;
    const inDoorway = x >= ROOM.x1 - RADIUS - 0.02 && x <= DECK.x0 + RADIUS + 0.1 && Math.abs(z) < DOOR.open - RADIUS;
    const onDeck = x > DECK.x0 + RADIUS && x < DECK.x1 - RADIUS - 0.1 && z > DECK.z0 + RADIUS + 0.1 && z < DECK.z1 - RADIUS - 0.1;
    if (!inRoom && !inDoorway && !onDeck) return false;
    for (const b of blockers) if (x > b[0] - RADIUS && x < b[1] + RADIUS && z > b[2] - RADIUS && z < b[3] + RADIUS) return false;
    return true;
  }
  // Solid stretches of the east wall, so name tags do not show through it from the deck.
  const WALLS = [[ROOM.x1, ROOM.x1 + 0.3, 0, ROOM.h, -6.3, DOOR.z0], [ROOM.x1, ROOM.x1 + 0.3, 0, ROOM.h, DOOR.z1, 6.3], [ROOM.x1, ROOM.x1 + 0.3, DOOR.h, ROOM.h, DOOR.z0, DOOR.z1]];
  function hiddenByWall(from, to) {
    for (const [x0, x1, y0, y1, z0, z1] of WALLS) {
      let t0 = 0, t1 = 1, hit = true;
      for (const [a, d, lo, hi] of [[from.x, to.x - from.x, x0, x1], [from.y, to.y - from.y, y0, y1], [from.z, to.z - from.z, z0, z1]]) {
        if (Math.abs(d) < 1e-9) { if (a < lo || a > hi) { hit = false; break; } continue; }
        const ta = (lo - a) / d, tb = (hi - a) / d;
        t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
        if (t0 > t1) { hit = false; break; }
      }
      if (hit) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ camera state
  const view = { x: -1.5, z: 4.75, yaw: -0.52, pitch: -0.04 };       // where the camera is
  const aim = { yaw: view.yaw, pitch: view.pitch };                   // where the player is turning to
  const velocity = { x: 0, z: 0 };
  const held = new Set();
  let fly = null, goal = null, explored = false, focused = null, hovered = null;
  const preset = new URLSearchParams(location.search).get("view");
  if (preset) {
    const [x, z, yaw, pitch] = preset.split(",").map(Number);
    if ([x, z, yaw].every(Number.isFinite)) Object.assign(view, { x, z, yaw, pitch: pitch || 0 }), Object.assign(aim, { yaw, pitch: pitch || 0 });
  }
  const home = view.yaw;
  const explore = () => { if (!explored) { explored = true; onExplore && onExplore(); } };

  const marker = new T.Mesh(new T.RingGeometry(0.15, 0.2, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xf0c887, transparent: true, opacity: 0, depthWrite: false }));
  marker.position.y = 0.03;
  scene.add(marker);

  function resize() {
    const width = canvas.clientWidth || 1, height = canvas.clientHeight || 1;
    camera.aspect = width / height;
    camera.fov = camera.aspect < 0.8 ? 80 : camera.aspect < 1.2 ? 70 : 62;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  window.addEventListener("resize", resize);
  resize();

  // ------------------------------------------------------------ name tags
  const tagOf = new Map();
  for (const target of targets) {
    const tag = document.createElement("button");
    tag.type = "button"; tag.className = "tag"; tag.tabIndex = -1;
    tag.innerHTML = '<i aria-hidden="true"></i><span></span>';
    tag.lastChild.textContent = target.item.name;
    tag.addEventListener("click", () => onSelect(target.item));
    tags.append(tag);
    tagOf.set(target, tag);
    target.shown = ""; target.px = target.py = 0;
  }
  const projected = new T.Vector3(), eye = new T.Vector3();
  function placeTags() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    eye.copy(camera.position);
    for (const target of targets) {
      const tag = tagOf.get(target);
      projected.copy(target.anchor).project(camera);
      const distance = eye.distanceTo(target.anchor);
      let state = "";
      if (projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05 && !hiddenByWall(eye, target.anchor) && target !== focused)
        state = target === hovered || distance < 5.2 ? "near" : distance < 26 ? "far" : "";
      if (state !== target.shown) { tag.dataset.state = state; target.shown = state; }
      if (!state) continue;
      const x = Math.round((projected.x * 0.5 + 0.5) * w), y = Math.round((-projected.y * 0.5 + 0.5) * h);
      if (x !== target.px || y !== target.py) { tag.style.transform = `translate(${x}px, ${y}px)`; target.px = x; target.py = y; }
    }
  }

  // ------------------------------------------------------------ input
  const KEYS = { w: "forward", s: "back", a: "strafeLeft", d: "strafeRight", ArrowUp: "forward", ArrowDown: "back", ArrowLeft: "left", ArrowRight: "right" };
  window.addEventListener("keydown", (event) => {
    if (event.target.closest("input, select, textarea") || event.metaKey || event.ctrlKey || event.altKey || isBlocked()) return;
    const key = KEYS[event.key] || KEYS[event.key.toLowerCase()];
    if (key) { event.preventDefault(); held.add(key); fly = goal = null; explore(); }
  });
  window.addEventListener("keyup", (event) => { const key = KEYS[event.key] || KEYS[event.key.toLowerCase()]; if (key) held.delete(key); });
  window.addEventListener("blur", () => held.clear());
  pad.hidden = false;
  pad.querySelectorAll("button").forEach((button) => {
    button.addEventListener("pointerdown", (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); held.add(button.dataset.move); fly = goal = null; explore(); });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, () => held.delete(button.dataset.move));
  });

  const raycaster = new T.Raycaster(), mouse = new T.Vector2(), proxies = targets.map((t) => t.proxy);
  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(proxies, false)[0];
    return hit ? targets.find((t) => t.proxy === hit.object) : null;
  }
  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) {
      if (event.pointerType === "mouse") { const over = pick(event); if (over !== hovered) { hovered = over; canvas.style.cursor = over ? "pointer" : ""; } }
      return;
    }
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
    if (drag.moved) {
      const sensitivity = (event.pointerType === "touch" ? 0.0058 : 0.0042) * (camera.fov / 62);
      aim.yaw += (event.clientX - drag.x) * sensitivity;
      aim.pitch = T.MathUtils.clamp(aim.pitch + (event.clientY - drag.y) * sensitivity, -0.8, 0.8);
      fly = null; canvas.style.cursor = "grabbing"; explore();
    }
    drag.x = event.clientX; drag.y = event.clientY;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (drag && !drag.moved) {
      const target = pick(event);
      if (target) onSelect(target.item);
      else {                                              // walk to the spot on the floor that was tapped
        const o = raycaster.ray.origin, d = raycaster.ray.direction;
        if (d.y < -0.02) {
          const t = -o.y / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
          if (t < 16 && free(x, z)) { goal = { x, z, stuck: 0 }; fly = null; marker.position.set(x, 0.03, z); marker.material.opacity = 0.9; explore(); }
        }
      }
    }
    drag = null; canvas.style.cursor = hovered ? "pointer" : "";
  });
  canvas.addEventListener("pointercancel", () => { drag = null; });
  canvas.addEventListener("pointerleave", () => { hovered = null; });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const push = T.MathUtils.clamp(-event.deltaY * 0.012, -2.2, 2.2);
    velocity.x += -Math.sin(view.yaw) * push; velocity.z += -Math.cos(view.yaw) * push;
    fly = goal = null; explore();
  }, { passive: false });

  // Glide to an artefact and face it.
  function focus(id) {
    const target = targets.find((t) => t.item.id === id);
    focused = target || null;
    if (!target) return;
    const [x, z] = target.stand, dx = target.look.x - x, dz = target.look.z - z, wide = canvas.clientWidth > 820;
    const to = {
      x, z,
      yaw: Math.atan2(-dx, -dz) - (wide ? 0.2 : 0),                    // leave room for the details panel
      pitch: T.MathUtils.clamp(Math.atan2(target.look.y - EYE, Math.hypot(dx, dz)) - (wide ? 0 : 0.16), -0.8, 0.8),
    };
    to.yaw = view.yaw + Math.atan2(Math.sin(to.yaw - view.yaw), Math.cos(to.yaw - view.yaw));     // turn the short way
    goal = null; held.clear();
    fly = reducedMotion ? null : { t: 0, duration: T.MathUtils.clamp(Math.hypot(x - view.x, z - view.z) * 0.16 + 0.7, 0.8, 2.2), from: { ...view }, to };
    if (reducedMotion) { Object.assign(view, to); velocity.x = velocity.z = 0; }
    Object.assign(aim, { yaw: to.yaw, pitch: to.pitch });
    explore();
  }

  // ------------------------------------------------------------ frame loop
  let previous = null, start = 0, slow = 0;
  function frame(now) {
    if (previous === null) previous = start = now;
    const dt = Math.min(Math.max((now - previous) / 1000, 0), 0.1), t = (now - start) / 1000;
    previous = now;
    if (!reducedMotion || t < 0.5) for (const tick of k.anim) tick(t, dt);

    if (fly) {
      fly.t = Math.min(1, fly.t + dt / fly.duration);
      const e = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - Math.pow(-2 * fly.t + 2, 3) / 2;
      for (const key of ["x", "z", "yaw", "pitch"]) view[key] = fly.from[key] + (fly.to[key] - fly.from[key]) * e;
      velocity.x = velocity.z = 0;
      if (fly.t === 1) fly = null;
    } else {
      aim.yaw += ((held.has("left") ? 1 : 0) - (held.has("right") ? 1 : 0)) * dt * 1.7;
      if (!explored && !reducedMotion) aim.yaw = home + Math.sin(t * 0.16) * 0.14;          // a slow look around while the welcome card is up
      const ease = 1 - Math.exp(-dt * 16);
      view.yaw += (aim.yaw - view.yaw) * ease; view.pitch += (aim.pitch - view.pitch) * ease;

      let wantX = 0, wantZ = 0;
      const forward = (held.has("forward") ? 1 : 0) - (held.has("back") ? 1 : 0), side = (held.has("strafeRight") ? 1 : 0) - (held.has("strafeLeft") ? 1 : 0);
      if (forward || side) {
        const length = Math.hypot(forward, side);
        wantX = (-Math.sin(view.yaw) * forward + Math.cos(view.yaw) * side) / length * SPEED;
        wantZ = (-Math.cos(view.yaw) * forward - Math.sin(view.yaw) * side) / length * SPEED;
      } else if (goal) {
        const gx = goal.x - view.x, gz = goal.z - view.z, distance = Math.hypot(gx, gz);
        if (distance < 0.12 || goal.stuck > 0.35) goal = null;
        else { const pace = Math.min(SPEED, distance * 3 + 0.6); wantX = gx / distance * pace; wantZ = gz / distance * pace; }
      }
      const grip = 1 - Math.exp(-dt * 9);
      velocity.x += (wantX - velocity.x) * grip; velocity.z += (wantZ - velocity.z) * grip;
      const beforeX = view.x, beforeZ = view.z;
      if (free(view.x + velocity.x * dt, view.z)) view.x += velocity.x * dt; else velocity.x = 0;
      if (free(view.x, view.z + velocity.z * dt)) view.z += velocity.z * dt; else velocity.z = 0;
      if (goal) goal.stuck = Math.hypot(view.x - beforeX, view.z - beforeZ) < dt * 0.25 ? goal.stuck + dt : 0;
    }
    marker.material.opacity = goal ? 0.55 + 0.3 * Math.sin(t * 6) : Math.max(0, marker.material.opacity - dt * 3);
    marker.visible = marker.material.opacity > 0.01;

    camera.position.set(view.x, EYE, view.z);
    camera.rotation.set(view.pitch, view.yaw, 0);
    renderer.render(scene, camera);
    placeTags();

    // Ease the resolution down on devices that cannot keep up.
    slow = dt > 1 / 26 ? slow + dt : Math.max(0, slow - dt * 2);
    if (slow > 2 && ratio > 0.8) { ratio = Math.max(0.75, ratio - 0.25); renderer.setPixelRatio(ratio); resize(); slow = 0; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { focus, explore, release() { focused = null; } };
}
