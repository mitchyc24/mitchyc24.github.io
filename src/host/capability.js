/* The one place that knows Cast from browser.
 *
 * Resolved once at boot into a plain object. Everything downstream reads
 * capability flags — nobody else in the codebase should ever touch
 * window.cast, and render code should key quality off cap.fidelity rather
 * than testing cap.kind. If `cast.framework` appears outside src/host/,
 * the dual-host story has started to rot.
 */

import { attachCast } from './cast-shell.js';
import { attachBrowser } from './browser-shell.js';

export function resolveCapability() {
  const onCast = !!(window.cast && window.cast.framework);

  if (onCast) {
    return {
      kind: 'cast',
      label: 'Chromecast',
      fps: 30,             // modest GPU — lock it rather than stutter
      fidelity: 'lite',    // render/fidelity.js keys off this later
      keyboard: false,
      pointer: false,
      fullscreen: 'auto',
      wakeLock: false,     // the Cast device never sleeps under us
      attach: attachCast
    };
  }

  return {
    kind: 'browser',
    label: 'Browser',
    fps: 60,
    fidelity: 'full',
    keyboard: true,
    pointer: true,
    fullscreen: 'request', // needs a user gesture — wired to the Start button
    wakeLock: 'wakeLock' in navigator,
    attach: attachBrowser
  };
}
