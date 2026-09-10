/* The two control surfaces.
 *
 * Two continuous axes held in two thumbs, matching the two things a hand
 * actually holds on a boat. The asymmetry between them is the whole design:
 *
 *   TILLER    absolute within its zone, SPRINGS BACK to centre on release.
 *             You hold a tiller against the water; let go and it centres.
 *
 *   MAINSHEET positional and STAYS PUT. You cleat a sheet at a setting and
 *             leave it. Making this spring back would be exhausting and wrong.
 *
 * Both are rate-limited in the physics rather than here, so the control feels
 * direct while the boat still takes real time to respond.
 */

const clamp = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));

/**
 * Horizontal drag zone. Absolute: where your thumb is across the zone IS the
 * rudder angle, so you can slam it over without dragging from centre.
 */
export function makeTiller(el, opts) {
  const o = opts || {};
  const onChange = o.onChange || function () {};
  const springMs = o.springMs === undefined ? 190 : o.springMs;

  let value = 0, dragging = false, pointerId = null, raf = 0;

  function fromClientX(x) {
    const r = el.getBoundingClientRect();
    const half = r.width / 2;
    /* A small dead zone at centre: thumbs are not precise, and a boat that
     * will not hold a straight course is exhausting on a phone. */
    const raw = (x - r.left - half) / half;
    const dz = 0.05;
    const v = Math.abs(raw) < dz ? 0 : Math.sign(raw) * (Math.abs(raw) - dz) / (1 - dz);
    set(clamp(v, -1, 1));
  }

  function set(v) {
    value = v;
    el.style.setProperty('--v', String(v));
    onChange(v);
  }

  function release() {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('active');
    const from = value, t0 = performance.now();
    cancelAnimationFrame(raf);
    (function spring(now) {
      if (dragging) return;
      const k = Math.min(1, ((now || performance.now()) - t0) / springMs);
      set(from * (1 - k * k));            // ease-out, so it settles rather than snaps
      if (k < 1) raf = requestAnimationFrame(spring);
    })();
  }

  el.addEventListener('pointerdown', (e) => {
    dragging = true; pointerId = e.pointerId;
    el.classList.add('active', 'touched');
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    cancelAnimationFrame(raf);
    fromClientX(e.clientX);
  });
  el.addEventListener('pointermove', (e) => {
    if (dragging && e.pointerId === pointerId) fromClientX(e.clientX);
  });
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);

  return { get value() { return value; }, set, reset: () => set(0) };
}

/**
 * Vertical drag zone. Relative: dragging moves the sheet from where it was, so
 * a small correction is a small movement and your thumb never has to find an
 * absolute position it cannot see.
 */
export function makeSheet(el, opts) {
  const o = opts || {};
  const onChange = o.onChange || function () {};
  const travel = o.travel === undefined ? 0.85 : o.travel;   // fraction of zone height = full range

  let value = o.initial === undefined ? 0.25 : o.initial;
  let dragging = false, pointerId = null, startY = 0, startVal = 0;

  function set(v) {
    value = clamp(v, 0, 1);
    el.style.setProperty('--s', String(value));
    onChange(value);
  }

  el.addEventListener('pointerdown', (e) => {
    dragging = true; pointerId = e.pointerId;
    startY = e.clientY; startVal = value;
    el.classList.add('active', 'touched');
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const r = el.getBoundingClientRect();
    /* Down eases, up trims in — the direction a hand moves on a real sheet. */
    const dy = (e.clientY - startY) / (r.height * travel);
    set(startVal + dy);
  });
  const stop = () => { dragging = false; el.classList.remove('active'); };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('lostpointercapture', stop);

  set(value);
  return { get value() { return value; }, set, nudge: (d) => set(value + d) };
}

/** Hold-to-hike. A button, not a gesture — it has to work with cold thumbs. */
export function makeHold(el, opts) {
  const o = opts || {};
  const onChange = o.onChange || function () {};
  let down = false;

  function set(v) {
    if (v === down) return;
    down = v;
    el.classList.toggle('down', v);
    onChange(v ? 1 : 0);
  }

  el.addEventListener('pointerdown', (e) => {
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    set(true);
  });
  el.addEventListener('pointerup', () => set(false));
  el.addEventListener('pointercancel', () => set(false));
  el.addEventListener('lostpointercapture', () => set(false));

  return { get value() { return down ? 1 : 0; }, set };
}
