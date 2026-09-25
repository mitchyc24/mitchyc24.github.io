// Rectangular waveguide physics. Pure functions, SI units throughout.
// Guide: { a, b, er }  a = broad wall (x) in metres, b = narrow wall (y), er = relative permittivity of the filling.
// Mode:  { type: "TE" | "TM", m, n }
// Fields follow Pozar, "Microwave Engineering", ch. 3, with jβ generalised to γ = α + jβ
// so the same expressions hold below cutoff (evanescent) as above it (propagating).

export const C0 = 299792458;
export const MU0 = 1.25663706212e-6;
export const EPS0 = 8.8541878128e-12;
export const ETA0 = Math.sqrt(MU0 / EPS0); // ≈ 376.73 Ω

export const modeName = (md) => `${md.type}${md.m}${md.n}`;
export const modeLabel = (md) => `${md.type}<sub>${md.m}${md.n}</sub>`;

export function isValidMode(md) {
  if (md.m < 0 || md.n < 0) return false;
  return md.type === "TE" ? md.m + md.n > 0 : md.m > 0 && md.n > 0;
}

/** Cutoff wavenumber k_c (rad/m). */
export function cutoffK(g, md) {
  return Math.hypot((md.m * Math.PI) / g.a, (md.n * Math.PI) / g.b);
}

/** Cutoff frequency (Hz). */
export function cutoffF(g, md) {
  return (C0 * cutoffK(g, md)) / (2 * Math.PI * Math.sqrt(g.er));
}

/** Every valid mode with cutoff <= fMax, lowest cutoff first (TE before TM on ties). */
export function listModes(g, fMax, limit = 40) {
  const out = [];
  for (let m = 0; m <= 12; m++) {
    for (let n = 0; n <= 12; n++) {
      for (const type of ["TE", "TM"]) {
        const md = { type, m, n };
        if (!isValidMode(md)) continue;
        const fc = cutoffF(g, md);
        if (fc <= fMax) out.push({ ...md, fc });
      }
    }
  }
  out.sort((p, q) => p.fc - q.fc || (p.type === q.type ? 0 : p.type === "TE" ? -1 : 1) || p.m - q.m);
  return out.slice(0, limit);
}

/** Everything a learner might want to read off for one mode at one frequency. */
export function modeState(g, md, f) {
  const w = 2 * Math.PI * f;
  const v = C0 / Math.sqrt(g.er);           // speed of light in the filling
  const eta = ETA0 / Math.sqrt(g.er);
  const k = w / v;
  const kc = cutoffK(g, md);
  const fc = cutoffF(g, md);
  const propagating = f > fc;
  const beta = propagating ? Math.sqrt(k * k - kc * kc) : 0;
  const alpha = propagating ? 0 : Math.sqrt(kc * kc - k * k);
  const r = fc / f;
  const s = {
    f, w, k, kc, fc, v, eta, beta, alpha, propagating,
    lambda: v / f,                            // wavelength in the unbounded filling
    lambdaC: v / fc,                          // cutoff wavelength = 2π / k_c
    lambdaG: propagating ? (2 * Math.PI) / beta : Infinity,
    vp: propagating ? w / beta : Infinity,
    vg: propagating ? (v * v * beta) / w : 0,
    theta: propagating ? Math.asin(r) : Math.PI / 2, // plane-wave bounce angle from the axis
    attenDbPerM: (20 / Math.LN10) * alpha,
  };
  if (propagating) {
    s.Z = md.type === "TE" ? (eta * k) / beta : (eta * beta) / k;
    s.Zreactive = null;
  } else {
    // Below cutoff the wave impedance is purely imaginary: no real power flows.
    s.Z = md.type === "TE" ? (w * MU0) / alpha : alpha / (w * EPS0 * g.er);
    s.Zreactive = md.type === "TE" ? "inductive" : "capacitive";
  }
  return s;
}

/**
 * Field phasors of a mode, as a list of components.
 * Each component is { field: "E"|"H", axis: 0|1|2 (x|y|z), c: [re, im], fx: "sin"|"cos", fy: "sin"|"cos" }
 * and its value at (x, y, z, t) is  Re{ c · fx(mπx/a) · fy(nπy/b) · e^{-αz} · e^{j(ωt - βz)} }.
 * Amplitude normalisation (H_z = 1 for TE, E_z = 1 for TM) is arbitrary; views rescale E and H separately.
 */
export function fieldComponents(g, md, s) {
  const kx = (md.m * Math.PI) / g.a, ky = (md.n * Math.PI) / g.b;
  const kc2 = s.kc * s.kc;
  const gamma = [s.alpha, s.beta];             // γ = α + jβ
  const jw = (x) => [0, x];                    // j·x
  const scale = (z, x) => [z[0] * x, z[1] * x];
  const wmu = s.w * MU0, weps = s.w * EPS0 * g.er;
  if (md.type === "TE") {
    return [
      { field: "E", axis: 0, c: jw((wmu * ky) / kc2), fx: "cos", fy: "sin" },
      { field: "E", axis: 1, c: jw((-wmu * kx) / kc2), fx: "sin", fy: "cos" },
      { field: "H", axis: 0, c: scale(gamma, kx / kc2), fx: "sin", fy: "cos" },
      { field: "H", axis: 1, c: scale(gamma, ky / kc2), fx: "cos", fy: "sin" },
      { field: "H", axis: 2, c: [1, 0], fx: "cos", fy: "cos" },
    ];
  }
  return [
    { field: "E", axis: 0, c: scale(gamma, -kx / kc2), fx: "cos", fy: "sin" },
    { field: "E", axis: 1, c: scale(gamma, -ky / kc2), fx: "sin", fy: "cos" },
    { field: "E", axis: 2, c: [1, 0], fx: "sin", fy: "sin" },
    { field: "H", axis: 0, c: jw((weps * ky) / kc2), fx: "sin", fy: "cos" },
    { field: "H", axis: 1, c: jw((-weps * kx) / kc2), fx: "cos", fy: "sin" },
  ];
}

/**
 * Build a sampler for instantaneous field vectors.
 * sample(x, y, z, wt) → { E: [ex, ey, ez], H: [hx, hy, hz] }, each normalised so the
 * peak phasor magnitude of that field over the cross-section is 1.
 */
export function makeSampler(g, md, s) {
  const comps = fieldComponents(g, md, s);
  const kx = (md.m * Math.PI) / g.a, ky = (md.n * Math.PI) / g.b;
  const trig = (name, u) => (name === "sin" ? Math.sin(u) : Math.cos(u));

  // Peak |E| and |H| (phasor magnitude) over a grid of the cross-section at z = 0.
  const peak = { E: 1e-300, H: 1e-300 };
  const N = 48;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = (i / N) * g.a, y = (j / N) * g.b;
      const acc = { E: 0, H: 0 };
      for (const cp of comps) {
        const sp = trig(cp.fx, kx * x) * trig(cp.fy, ky * y);
        acc[cp.field] += (cp.c[0] ** 2 + cp.c[1] ** 2) * sp * sp;
      }
      peak.E = Math.max(peak.E, Math.sqrt(acc.E));
      peak.H = Math.max(peak.H, Math.sqrt(acc.H));
    }
  }
  const norm = comps.map((cp) => {
    const p = peak[cp.field];
    return { ...cp, re: cp.c[0] / p, im: cp.c[1] / p };
  });

  return function sample(x, y, z, wt) {
    const out = { E: [0, 0, 0], H: [0, 0, 0] };
    const env = Math.exp(-s.alpha * z);
    const ph = wt - s.beta * z;
    const cph = Math.cos(ph), sph = Math.sin(ph);
    for (const cp of norm) {
      const sp = trig(cp.fx, kx * x) * trig(cp.fy, ky * y) * env;
      out[cp.field][cp.axis] += sp * (cp.re * cph - cp.im * sph);
    }
    return out;
  };
}
