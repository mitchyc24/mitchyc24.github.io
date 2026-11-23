// The whole calculation in one call, so it can run in a worker or on the page.
import "../vendor/clipper.js";               // sets ClipperLib on the global object
import { buildShape } from "./flake.js";
import { buildToolpath } from "./toolpath.js";

export function compute({ params, lineWidth, hanger, hangerHole }) {
  const shape = buildShape(params, lineWidth, { hanger, hangerHole });
  const t = buildToolpath(shape, lineWidth);
  return {
    path: t.path, pathB: t.pathB, length: t.length, loops: t.loops, bridges: t.bridges,
    bounds: t.bounds, radius: shape.radius, top: shape.top,
  };
}
