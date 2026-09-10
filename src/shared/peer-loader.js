/* Loads the right PeerJS bundle for this device.
 *
 * peerjs 1.5.5's published bundle contains one optional-chaining expression,
 * which is a SyntaxError on Chromium < 80 — and on an old Chromecast a
 * SyntaxError in a <script> means a silent blank screen, not an error you can
 * see from the sofa. So we ship a downlevelled copy too and choose at runtime.
 *
 * vendor/peerjs-1.5.5.min.js     — as published, needs Chromium 80+
 * vendor/peerjs-1.5.5.legacy.js  — esbuild --target=chrome69
 */

export function basePath() {
  // .../sailing-school/host/index.html  ->  /sailing-school/
  // .../host/                           ->  /
  return window.location.pathname.replace(/(host|play|cast)\/(index\.html)?$/, '');
}

function supportsOptionalChaining() {
  try {
    return new Function('var a={b:1};return a?.b')() === 1;
  } catch (e) {
    return false;
  }
}

export function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);

  const modern = supportsOptionalChaining();
  const file = modern ? 'peerjs-1.5.5.min.js' : 'peerjs-1.5.5.legacy.js';
  const src = basePath() + 'vendor/' + file;

  if (window.SSDiag) {
    window.SSDiag.log('info', 'loading ' + file + (modern ? '' : '  (downlevelled — this device is pre-M80)'));
  }

  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => {
      if (window.Peer) resolve(window.Peer);
      else reject(new Error('PeerJS loaded but no global Peer'));
    };
    s.onerror = () => reject(new Error('Failed to fetch ' + src));
    document.head.appendChild(s);
  });
}
