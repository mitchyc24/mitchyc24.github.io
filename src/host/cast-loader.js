/* Detecting a Cast device, and loading the receiver framework onto it.
 *
 * Two things here are easy to get wrong, and the first one cost us a whole
 * device test:
 *
 * 1. THE FRAMEWORK HAS TO BE LOADED. `window.cast.framework` does not exist on
 *    a Chromecast by magic — cast_receiver_framework.js defines it. Without
 *    that script the receiver never calls ctx.start(), Cast decides the app
 *    failed to load, and the TV drops back to the backdrop with no error.
 *
 * 2. YOU CANNOT DETECT CAST BY LOOKING FOR THE FRAMEWORK. Loading the library
 *    is what defines `cast.framework`, so "is the library present?" would be
 *    true in a normal browser too the moment we added the script tag. Detect
 *    the DEVICE from the user agent instead — every Cast receiver's UA carries
 *    the CrKey token — and only then fetch the library.
 */

/* Protocol-relative, exactly as Google documents it, so the fetch matches
 * however the page itself was served. */
const CAF_SRC = '//www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js';
const LOAD_TIMEOUT_MS = 8000;

export function onCastDevice() {
  if (/\bCrKey\b/.test(navigator.userAgent)) return true;
  /* ?cast=1 forces the Cast path in a normal browser. Only useful for checking
   * that the loader and its failure messages behave — the framework itself
   * will not do anything sensible off a real device. */
  try {
    return new URLSearchParams(window.location.search).get('cast') === '1';
  } catch (e) {
    return false;
  }
}

export function loadCafReceiver() {
  if (window.cast && window.cast.framework) return Promise.resolve(true);

  if (window.SSDiag) window.SSDiag.log('info', 'Cast device detected — loading receiver framework');

  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v && !!(window.cast && window.cast.framework));
    };

    const s = document.createElement('script');
    s.src = CAF_SRC;
    s.onload = () => done(true);
    s.onerror = () => {
      if (window.SSDiag) window.SSDiag.log('err', 'could not fetch the Cast receiver framework');
      done(false);
    };
    setTimeout(() => {
      if (!settled && window.SSDiag) {
        window.SSDiag.log('err', 'Cast receiver framework timed out after ' +
                                 (LOAD_TIMEOUT_MS / 1000) + 's');
      }
      done(false);
    }, LOAD_TIMEOUT_MS);

    document.head.appendChild(s);
  });
}
