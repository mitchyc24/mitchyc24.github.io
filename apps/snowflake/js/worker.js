// Runs the geometry off the main thread so sliders stay smooth. The page falls back to calling
// compute() directly if module workers are not available.
import { compute } from "./engine.js";

self.onmessage = e => {
  const { id, req } = e.data;
  try {
    self.postMessage({ id, ok: true, res: compute(req) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
self.postMessage({ ready: true });
