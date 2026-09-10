/* The one place that knows Cast from browser.
 *
 * Resolved once at boot into a plain object. Everything downstream reads
 * capability flags — nobody else in the codebase should ever touch
 * window.cast, and render code should key quality off cap.fidelity rather
 * than testing cap.kind. If `cast.framework` appears outside src/host/,
 * the dual-host story has started to rot.
 *
 * Async because a Cast device has to fetch the receiver framework first.
 * Callers must not use top-level await — the Chromecast Ultra's Chromium
 * predates it. Wrap in an async IIFE instead.
 */

import { attachCast } from './cast-shell.js';
import { attachBrowser } from './browser-shell.js';
import { onCastDevice, loadCafReceiver } from './cast-loader.js';

function browserCap() {
  return {
    kind: 'browser',
    label: 'Browser',
    fps: 60,
    fidelity: 'full',
    keyboard: true,
    pointer: true,           // drives whether we wait for a Start click
    fullscreen: 'request',   // needs a user gesture
    wakeLock: 'wakeLock' in navigator,
    attach: attachBrowser
  };
}

function castCap() {
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

export async function resolveCapability() {
  if (!onCastDevice()) return browserCap();

  const ready = await loadCafReceiver();

  if (ready) return castCap();

  /* We are on a Cast device but the framework did not load. The game cannot
   * hold the session open without it, so say so on the TV rather than
   * pretending — but still run, so there is something to read. */
  if (window.SSDiag) {
    window.SSDiag.fatal('Running on a Cast device without the receiver framework. ' +
                        'The session will be shut down as idle. Check this device ' +
                        'can reach www.gstatic.com.');
  }
  const degraded = browserCap();
  degraded.kind = 'cast-degraded';
  degraded.label = 'Chromecast (no framework)';
  degraded.pointer = false;   // still no cursor — start without a click
  degraded.fps = 30;
  degraded.fidelity = 'lite';
  return degraded;
}
