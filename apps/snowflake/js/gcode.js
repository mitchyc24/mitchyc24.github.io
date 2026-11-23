// Path -> G-code for a Snapmaker 2.0 A350 / A350T with the single-extruder toolhead.
//
// The start and end sequences follow the machine profile Snapmaker ships for Cura (snapmaker2.def.json),
// and the header is the "legacy" one Snapmaker's own Cura plugin writes for the A350, which is what the
// touchscreen reads for the preview, time estimate and progress.
//
// The body is the whole point of this app: after one approach move, every XY move extrudes. Each layer is
// the same closed loop, so a layer ends exactly where the next one begins and the only thing between them
// is a small lift in Z.

export const MACHINE = { name: "Snapmaker A350", width: 320, depth: 350, height: 330, margin: 3 };

export const MATERIALS = {
  PLA: { nozzleTemp: 205, bedTemp: 60, fan: 100 },
  PETG: { nozzleTemp: 240, bedTemp: 75, fan: 40 },
  Custom: null,
};

export const PRINT_DEFAULTS = {
  material: "PLA", nozzleTemp: 205, bedTemp: 60, fan: 100,
  lineWidth: 0.5, layerHeight: 0.2, firstLayerHeight: 0.2, thickness: 1.2,
  speed: 30, firstSpeed: 15, travelSpeed: 80, flow: 100, filament: 1.75, retract: 3,
  centerX: 160, centerY: 175,
  primeLine: true, hanger: true, hangerHole: 3.5, thumbnail: true,
};

export const PRINT_LIMITS = {
  nozzleTemp: [170, 275], bedTemp: [0, 100], fan: [0, 100],
  lineWidth: [0.35, 0.8], layerHeight: [0.08, 0.32], firstLayerHeight: [0.1, 0.35], thickness: [0.2, 6],
  speed: [5, 80], firstSpeed: [5, 40], travelSpeed: [20, 150], flow: [70, 130], filament: [1.6, 3],
  retract: [0, 6], centerX: [0, 320], centerY: [0, 350], hangerHole: [1.5, 8],
};

export function cleanSettings(input) {
  const s = { ...PRINT_DEFAULTS };
  if (!input) return s;
  for (const [k, [lo, hi]] of Object.entries(PRINT_LIMITS)) {
    const n = Number(input[k]);
    if (input[k] !== "" && input[k] !== null && input[k] !== undefined && Number.isFinite(n)) s[k] = Math.min(hi, Math.max(lo, n));
  }
  for (const k of ["primeLine", "hanger", "thumbnail"]) if (typeof input[k] === "boolean") s[k] = input[k];
  if (typeof input.material === "string" && input.material in MATERIALS) s.material = input.material;
  return s;
}

export function layerPlan(s) {
  const count = Math.max(1, Math.round((s.thickness - s.firstLayerHeight) / s.layerHeight) + 1);
  const z = [];
  for (let i = 0; i < count; i++) z.push(+(s.firstLayerHeight + i * s.layerHeight).toFixed(4));
  return { count, z, height: z[count - 1] };
}

const num = (v, d = 3) => {
  const t = v.toFixed(d);
  return t.indexOf(".") < 0 ? t : t.replace(/0+$/, "").replace(/\.$/, "") || "0";
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Seconds to run a polyline at `speed` mm/s with acceleration and cornering limits, the way Marlin plans it.
export function moveTime(path, speed, accel = 1000, deviation = 0.05) {
  const n = path.length - 1;
  if (n < 1) return 0;
  const len = new Float64Array(n), ux = new Float64Array(n), uy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const L = dist(path[i], path[i + 1]);
    len[i] = L; ux[i] = L ? (path[i + 1][0] - path[i][0]) / L : 0; uy[i] = L ? (path[i + 1][1] - path[i][1]) / L : 0;
  }
  const v = new Float64Array(n + 1);          // speed at each vertex
  for (let i = 1; i < n; i++) {
    const cos = -(ux[i - 1] * ux[i] + uy[i - 1] * uy[i]);
    if (cos > 0.9999) { v[i] = 0; continue; }
    if (cos < -0.9999) { v[i] = speed; continue; }
    const sinHalf = Math.sqrt((1 - cos) / 2);
    v[i] = Math.min(speed, Math.sqrt(accel * deviation * sinHalf / (1 - sinHalf)));
  }
  for (let i = 1; i <= n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * accel * len[i - 1]));
  for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * accel * len[i]));
  let t = 0;
  for (let i = 0; i < n; i++) {
    const L = len[i];
    if (L <= 0) continue;
    const v0 = v[i], v1 = v[i + 1];
    const peak = Math.min(speed, Math.sqrt((2 * accel * L + v0 * v0 + v1 * v1) / 2));
    const dAcc = (peak * peak - v0 * v0) / (2 * accel), dDec = (peak * peak - v1 * v1) / (2 * accel);
    t += (peak - v0) / accel + (peak - v1) / accel + Math.max(0, L - dAcc - dDec) / peak;
  }
  return t;
}

// Where everything lands on the bed, and whether it fits. Used by the page for its checks and the bed map.
export function layout(path, s) {
  const ox = s.centerX, oy = s.centerY;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of path) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
  }
  const half = s.lineWidth / 2;
  const box = { minX: minX + ox - half, maxX: maxX + ox + half, minY: minY + oy - half, maxY: maxY + oy + half };
  const m = MACHINE.margin;
  const fits = path.length > 1 && box.minX >= m && box.minY >= m && box.maxX <= MACHINE.width - m && box.maxY <= MACHINE.depth - m;
  let prime = null;
  if (s.primeLine && fits) {
    const L = Math.min(60, Math.max(20, box.maxX - box.minX));
    const x0 = Math.min(Math.max((box.minX + box.maxX) / 2 - L / 2, m + 2), MACHINE.width - m - 2 - L);
    const front = box.minY - 6, back = box.maxY + 6;
    const y = front >= m + 2 ? front : back <= MACHINE.depth - m - 2 ? back : null;
    if (y !== null) prime = { a: [x0, y], b: [x0 + L, y] };
  }
  return { box, fits, prime, origin: [ox, oy] };
}

export function makeGcode({ path, pathB, settings, recipe = "", link = "", thumbnail = "" }) {
  const s = settings;
  const lay = layout(path, s);
  if (!lay.fits) throw new Error("The snowflake does not fit on the bed at this position.");
  const plan = layerPlan(s);
  const [ox, oy] = lay.origin;
  const filArea = Math.PI * (s.filament / 2) ** 2;
  const ePerMm = h => (s.lineWidth * h / filArea) * (s.flow / 100);
  const F = mmPerSec => num(mmPerSec * 60, 0);
  const tr = F(s.travelSpeed), rf = F(40);
  const b = [];                                // the body, one line per entry
  const paths = [path, pathB && pathB.length > 1 ? pathB : path];
  const start = [path[0][0] + ox, path[0][1] + oy];
  const z0 = plan.z[0];
  let filament = 0, seconds = 0;

  b.push(
    "; Snowflake: a single continuous extrusion, made at https://mitchyc24.github.io/apps/snowflake/",
    recipe ? "; " + recipe : null,
    link ? "; Open this flake again: " + link : null,
    `; ${MACHINE.name} / A350T, single extruder, ${num(s.lineWidth, 2)} mm lines, ${plan.count} layers, ${num(plan.height, 2)} mm thick`,
    "",
    "M82 ;absolute extrusion",
    `M104 S${num(s.nozzleTemp, 0)} ;Set Hotend Temperature`,
    `M140 S${num(s.bedTemp, 0)} ;Set Bed Temperature`,
    "G28 ;home",
    "G90 ;absolute positioning",
    "G21 ;millimetres",
    "G1 X-10 Y-10 F3000 ;Move to corner",
    "G1 Z0 F1800 ;Go to zero offset",
    `M109 S${num(s.nozzleTemp, 0)} ;Wait for Hotend Temperature`,
    `M190 S${num(s.bedTemp, 0)} ;Wait for Bed Temperature`,
    "G92 E0 ;Zero set extruder position",
    "G1 E20 F200 ;Feed filament to clear nozzle",
    "G92 E0 ;Zero set extruder position",
    "M107 ;fan off for the first layer",
  );
  const hop = (to, why) => {
    if (s.retract > 0) b.push(`G1 E-${num(s.retract, 2)} F${rf} ;retract`);
    b.push(`G1 Z${num(z0 + 1.5, 2)} F1800 ;lift`, `G0 X${num(to[0])} Y${num(to[1])} F${tr} ;${why}`, `G1 Z${num(z0, 3)} F1800`);
    if (s.retract > 0) b.push(`G1 E0 F${rf} ;prime`);
  };
  if (lay.prime) {
    const { a, b: pb } = lay.prime;
    hop(a, "to the prime line");
    const e = dist(a, pb) * ePerMm(z0);
    b.push(";PRIME LINE", `G1 X${num(pb[0])} Y${num(pb[1])} E${num(e, 5)} F${F(s.firstSpeed)}`, "G92 E0");
    filament += e; seconds += dist(a, pb) / s.firstSpeed + 2;
  }
  hop(start, "to the start of the snowflake; no travel moves after this");

  b.push(";SNOWFLAKE START: every move from here to SNOWFLAKE END extrudes");
  for (let k = 0; k < plan.count; k++) {
    const pts = paths[k % 2];
    const h = k === 0 ? plan.z[0] : s.layerHeight;
    const per = ePerMm(h), speed = k === 0 ? s.firstSpeed : s.speed;
    b.push(`;LAYER:${k}`);
    if (k > 0) {
      b.push("G92 E0", `G1 Z${num(plan.z[k], 3)} F1200`);
      if (k === 1 && s.fan > 0) b.push(`M106 S${Math.round(s.fan * 2.55)} ;fan on`);
    }
    b.push(`G1 F${F(speed)}`);
    let e = 0;
    for (let i = 1; i < pts.length; i++) {
      e += dist(pts[i - 1], pts[i]) * per;
      b.push(`G1 X${num(pts[i][0] + ox)} Y${num(pts[i][1] + oy)} E${num(e, 5)}`);
    }
    filament += e;
    seconds += moveTime(pts, speed) + 0.3;
  }
  b.push(
    ";SNOWFLAKE END",
    "G92 E0",
    `G1 E-${num(Math.max(1, s.retract), 2)} F${rf} ;retract`,
    `G1 Z${num(Math.min(MACHINE.height, plan.height + 30), 2)} F1800 ;lift clear`,
    "M104 S0 ;Extruder heater off",
    "M140 S0 ;Heated bed heater off",
    "M107 ;fan off",
    "G1 X0 F3000 ;move the head out of the way",
    `G1 Y${MACHINE.depth} F3000 ;bring the plate forward`,
  );
  const body = b.filter(l => l !== null);
  seconds += 10;

  const half = s.lineWidth / 2;
  const prime = lay.prime;
  const minX = Math.min(lay.box.minX, prime ? prime.a[0] - half : Infinity);
  const maxX = Math.max(lay.box.maxX, prime ? prime.b[0] + half : -Infinity);
  const minY = Math.min(lay.box.minY, prime ? prime.a[1] - half : Infinity);
  const maxY = Math.max(lay.box.maxY, prime ? prime.a[1] + half : -Infinity);
  const header = [
    ";Header Start",
    ";header_type: 3dp",
    `;file_total_lines: ${body.length}`,
    `;estimated_time(s): ${seconds.toFixed(2)}`,
    `;nozzle_temperature(°C): ${num(s.nozzleTemp, 0)}`,
    `;build_plate_temperature(°C): ${num(s.bedTemp, 0)}`,
    `;work_speed(mm/minute): ${num(s.speed * 60, 0)}`,
    `;Printer:${MACHINE.name}`,
    ";Extruder 0 Nozzle Size:0.4",
    `;Extruder 0 Material:${s.material === "Custom" ? "PLA" : s.material}`,
    `;Extruder 0 Print Temperature:${num(s.nozzleTemp, 0)}`,
    `;Extruder 0 Retraction Distance:${num(s.retract, 2)}`,
    ";Extruder 0 Switch Retraction Distance:0",
    `;min_x(mm): ${num(minX)}`, `;min_y(mm): ${num(minY)}`, `;min_z(mm): ${num(z0)}`,
    `;max_x(mm): ${num(maxX)}`, `;max_y(mm): ${num(maxY)}`, `;max_z(mm): ${num(plan.height)}`,
    thumbnail ? `;thumbnail: ${thumbnail}` : null,
    ";Header End",
    "",
  ].filter(l => l !== null);

  const perLayer = paths.map(p => { let L = 0; for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]); return L; });
  return {
    text: header.concat(body).join("\n") + "\n",
    stats: {
      lines: body.length, seconds, layers: plan.count, height: plan.height,
      filamentMm: filament, grams: filament * filArea * 1.24 / 1000 * (s.material === "PETG" ? 1.27 / 1.24 : 1),
      extrudeMm: perLayer[0], travelMoves: 0,
      box: { minX, minY, maxX, maxY },
    },
  };
}
