/* Browser lifecycle.
 *
 * A Chromecast has no cursor and never sleeps, so the Cast build needs none of
 * this. Browser hosting is a shipping mode, not a dev shim, so it gets the
 * affordances a person at a keyboard expects.
 */

function log(kind, msg) {
  if (window.SSDiag) window.SSDiag.log(kind, msg);
}

export function attachBrowser(app) {
  let wakeLock = null;

  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      log('ok', 'screen wake lock held');
      wakeLock.addEventListener('release', () => log('warn', 'wake lock released'));
    } catch (e) {
      log('warn', 'wake lock refused: ' + e.message);
    }
  }

  // Re-acquire after the tab is backgrounded — the lock is dropped, not paused.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLock === null) acquireWakeLock();
  });

  async function goFullscreen() {
    const el = document.documentElement;
    if (!el.requestFullscreen) return;
    try { await el.requestFullscreen(); } catch (e) { log('warn', 'fullscreen refused'); }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') goFullscreen();
    if (e.key === '~') app.toggleDiagnostics();
  });

  // Closing the host tab ends everyone's game. Make it deliberate.
  window.addEventListener('beforeunload', (e) => {
    if (app.playerCount() === 0) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  return {
    kind: 'browser',
    onStartGesture: () => { goFullscreen(); acquireWakeLock(); },
    stop: () => { if (wakeLock) try { wakeLock.release(); } catch (e) { /* ignore */ } }
  };
}
