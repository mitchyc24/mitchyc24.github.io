/* Sailing School — boot diagnostics.
 *
 * This file is deliberately ES5. It is the FIRST script on every page and it
 * must run on anything, including a Chromecast running a 2019 Chromium. Its
 * whole job is to make failure visible: if the modern module bundle below it
 * fails to parse, this still painted the screen, and the watchdog will say so.
 *
 * Do not modernise this file. It is the thing that tells you why nothing works.
 */
(function () {
  'use strict';

  var booted = false;
  var lines = [];

  function feature(fn) {
    try { return !!fn(); } catch (e) { return false; }
  }

  var probe = {
    ua: navigator.userAgent,
    chromium: (function () {
      var m = /Chrom(e|ium)\/(\d+)/.exec(navigator.userAgent);
      return m ? parseInt(m[2], 10) : null;
    })(),
    modules: feature(function () {
      return 'noModule' in document.createElement('script');
    }),
    optionalChaining: feature(function () {
      return new Function('var a={b:1};return a?.b')() === 1;
    }),
    nullish: feature(function () {
      return new Function('return null ?? 1')() === 1;
    }),
    classFields: feature(function () {
      return new Function('class A{x=1};return new A().x')() === 1;
    }),
    rtcPeerConnection: feature(function () {
      return typeof RTCPeerConnection !== 'undefined';
    }),
    rtcDataChannel: feature(function () {
      if (typeof RTCPeerConnection === 'undefined') return false;
      var pc = new RTCPeerConnection(null);
      var ok = typeof pc.createDataChannel === 'function';
      pc.close();
      return ok;
    }),
    webgl: feature(function () {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    }),
    wakeLock: feature(function () { return 'wakeLock' in navigator; }),
    vibrate: feature(function () { return 'vibrate' in navigator; }),
    cast: feature(function () { return !!(window.cast && window.cast.framework); }),
    localStorage: feature(function () {
      window.localStorage.setItem('__ss', '1');
      window.localStorage.removeItem('__ss');
      return true;
    }),
    dpr: window.devicePixelRatio || 1,
    screen: window.innerWidth + '×' + window.innerHeight
  };

  function log(kind, msg) {
    lines.push({ t: Date.now(), kind: kind, msg: String(msg) });
    if (lines.length > 200) lines.shift();
    var el = document.getElementById('diag-log');
    if (!el) return;
    var d = document.createElement('div');
    d.className = 'l l-' + kind;
    d.textContent = new Date().toLocaleTimeString() + '  ' + msg;
    el.insertBefore(d, el.firstChild);
    while (el.childNodes.length > 120) el.removeChild(el.lastChild);
  }

  function fatal(msg) {
    log('err', msg);
    var el = document.getElementById('fatal');
    if (!el) return;
    el.hidden = false;
    var p = document.createElement('div');
    p.textContent = msg;
    el.appendChild(p);
  }

  function renderProbe() {
    var el = document.getElementById('probe');
    if (!el) return;
    var rows = [
      ['chromium', probe.chromium === null ? 'not Chromium' : 'M' + probe.chromium],
      ['ES modules', probe.modules],
      ['optional chaining', probe.optionalChaining],
      ['nullish coalescing', probe.nullish],
      ['class fields', probe.classFields],
      ['RTCPeerConnection', probe.rtcPeerConnection],
      ['RTCDataChannel', probe.rtcDataChannel],
      ['WebGL', probe.webgl],
      ['localStorage', probe.localStorage],
      ['Cast framework', probe.cast],
      ['viewport', probe.screen + ' @' + probe.dpr + 'x']
    ];
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var k = rows[i][0], v = rows[i][1], cls = '', txt;
      if (v === true) { cls = 'ok'; txt = 'yes'; }
      else if (v === false) { cls = 'no'; txt = 'NO'; }
      else { txt = v; }
      html += '<div class="pk">' + k + '</div><div class="pv ' + cls + '">' + txt + '</div>';
    }
    el.innerHTML = html;

    var uaEl = document.getElementById('ua');
    if (uaEl) uaEl.textContent = probe.ua;
  }

  /* The single most useful line M0 produces: what to set build.target to. */
  function verdict() {
    if (probe.chromium === null) return 'Not a Chromium build — read the UA above.';
    var t = probe.classFields ? 'chrome' + probe.chromium
          : probe.optionalChaining ? 'chrome80'
          : 'es2019';
    return 'Set Vite build.target to "' + t + '" for this device.';
  }

  window.addEventListener('error', function (e) {
    /* A module with syntax the device can't parse lands here. */
    fatal('Script error: ' + (e.message || 'unknown') +
          (e.filename ? '  (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    fatal('Unhandled promise rejection: ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
  });

  /* Watchdog. If the module half of the page never calls SSDiag.booted(),
   * say so plainly rather than showing an empty screen forever. */
  setTimeout(function () {
    if (booted) return;
    fatal('The module bundle did not boot within 6 seconds.');
    fatal('Most likely this device cannot parse it. ' + verdict());
  }, 6000);

  window.SSDiag = {
    probe: probe,
    log: log,
    fatal: fatal,
    verdict: verdict,
    booted: function () { booted = true; log('ok', 'module bundle booted'); },
    render: renderProbe
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderProbe);
  } else {
    renderProbe();
  }
})();
