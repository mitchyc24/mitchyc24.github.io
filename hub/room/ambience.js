// Things that move the air: the fire, shafts of evening sun through the patio doors, and dust in them.
import { ROOM, DOOR } from "./kit.js";

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}`;

export function buildAmbience(k, scene, sunDir, { motion = true } = {}) {
  const { T } = k;
  const overlays = new T.Group();           // left out of the room's light probe
  scene.add(overlays);

  // ------------------------------------------------------------ fire
  const flame = new T.ShaderMaterial({
    uniforms: { time: { value: 0 }, seed: { value: 0 } },
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float time; uniform float seed; varying vec2 vUv; ${NOISE}
      void main() {
        vec2 uv = vUv;
        float n = noise(vec2(uv.x * 5.0 + seed, uv.y * 3.2 - time * 1.9)) * 0.65 + noise(vec2(uv.x * 11.0 - seed, uv.y * 7.0 - time * 3.1)) * 0.35;
        float body = (1.0 - uv.y) * (1.0 - pow(abs(uv.x - 0.5) * 2.0, 2.2));
        float f = body * 1.5 + (n - 0.5) * 1.1 - uv.y * 0.55;
        float a = smoothstep(0.3, 0.72, f);
        vec3 col = mix(vec3(1.0, 0.24, 0.03), vec3(1.0, 0.78, 0.3), smoothstep(0.45, 1.05, f));
        col = mix(col, vec3(1.0, 0.95, 0.75), smoothstep(1.0, 1.5, f));
        gl_FragColor = vec4(col * a * 2.4, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  [[0, 0.12, 0], [0.5, 0.05, 1.7], [-0.6, 0.0, 3.1]].forEach(([ry, dz, seed]) => {
    const m = flame.clone(); m.uniforms.seed.value = seed; m.uniforms.time = flame.uniforms.time;
    const plane = new T.Mesh(new T.PlaneGeometry(0.95, 0.72), m);
    plane.position.set(0, 0.52, ROOM.z0 + 0.3 + dz); plane.rotation.y = ry;
    overlays.add(plane);
  });
  const fireLight = { x: 0, y: 0.55, z: ROOM.z0 + 0.75, intensity: 7, distance: 8, color: 0xff8a3c, flicker: true };
  k.lamps.push(fireLight);

  // ------------------------------------------------------------ sun shafts through the open doors
  const fall = sunDir.clone().negate(), reach = DOOR.h / -fall.y;        // how far a ray from the door head travels to the floor
  const shaftTex = k.texture(k.canvas(64, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(255,214,160,0)"); g.addColorStop(0.12, "rgba(255,214,160,1)"); g.addColorStop(1, "rgba(255,214,160,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const s = ctx.createLinearGradient(0, 0, w, 0); s.addColorStop(0, "rgba(0,0,0,1)"); s.addColorStop(0.3, "rgba(0,0,0,0)"); s.addColorStop(0.7, "rgba(0,0,0,0)"); s.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = s; ctx.fillRect(0, 0, w, h);
  }), { wrap: false });
  const shaftMat = new T.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.085, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false });
  const bay = (DOOR.z1 - DOOR.z0) / 6;
  for (let i = 0; i < 6; i++) for (const lift of [0.34, 0.68, 1]) {
    const z = DOOR.z0 + bay * (i + 0.5), top = DOOR.h * lift, len = reach * lift;
    const a = new T.Vector3(ROOM.x1, top, z - bay * 0.42), b = new T.Vector3(ROOM.x1, top, z + bay * 0.42);
    const c = b.clone().addScaledVector(fall, len), d = a.clone().addScaledVector(fall, len);
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], 3));
    g.setAttribute("uv", new T.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const shaft = new T.Mesh(g, shaftMat);
    shaft.renderOrder = 5;
    overlays.add(shaft);
  }

  // ------------------------------------------------------------ dust
  const COUNT = 260, base = new Float32Array(COUNT * 3), pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const along = k.rnd() * reach * 0.95, h = k.rnd() * DOOR.h * 0.9, z = DOOR.z0 + k.rnd() * (DOOR.z1 - DOOR.z0);
    base[i * 3] = ROOM.x1 + fall.x * along; base[i * 3 + 1] = Math.max(0.1, h + fall.y * along * (h / DOOR.h)); base[i * 3 + 2] = z + fall.z * along;
  }
  pos.set(base);
  const dustGeo = new T.BufferGeometry();
  dustGeo.setAttribute("position", new T.BufferAttribute(pos, 3));
  const dot = k.texture(k.canvas(32, 32, (ctx) => { const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, "rgba(255,236,200,1)"); g.addColorStop(1, "rgba(255,236,200,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32); }), { wrap: false });
  const dust = new T.Points(dustGeo, new T.PointsMaterial({ map: dot, size: 0.028, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true, fog: false }));
  dust.frustumCulled = false;
  overlays.add(dust);

  k.anim.push((t) => {
    flame.uniforms.time.value = t;
    fireLight.light && (fireLight.light.intensity = fireLight.intensity * (0.82 + 0.18 * Math.sin(t * 9.1) * Math.sin(t * 5.3) + 0.1 * Math.sin(t * 23)));
    if (!motion) return;
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = base[i * 3] + Math.sin(t * 0.11 + i) * 0.25;
      pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.07 + i * 1.7) * 0.2;
      pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.09 + i * 0.6) * 0.25;
    }
    dustGeo.attributes.position.needsUpdate = true;
  });
  return { overlays };
}
