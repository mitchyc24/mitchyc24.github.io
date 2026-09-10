/* Sailing School — global config.
 * Loaded as a CLASSIC script (not a module) so the ES5 Cast sender page can
 * read it too. Everything else reads window.SS_CONFIG.
 */
window.SS_CONFIG = {
  /* Peer-ID namespace. The PeerJS cloud broker is shared with the whole
   * internet, so every room ID is prefixed. Bump this when the wire
   * protocol changes so old clients can't join new hosts. */
  NS: 'ssch0',

  /* ── Cast ──────────────────────────────────────────────────────────
   * Registered Custom Receiver "Sailing School", pointing at this site's
   * /host/ URL. Unpublished, so it only launches on the serial numbers
   * listed as Cast Receiver Devices in the developer console.           */
  CAST_APP_ID: 'FB21C379',
  CAST_NAMESPACE: 'urn:x-cast:ca.sailingschool.control',
  CAST_MAX_INACTIVITY: 3600,   // seconds; paired with the sender heartbeat
  CAST_HEARTBEAT_MS: 20000,

  /* ── Broker ────────────────────────────────────────────────────────
   * Empty object = PeerJS cloud broker. To self-host later, add
   * { host: 'peer.example.com', port: 443, secure: true, path: '/' }.  */
  PEER_OPTS: { debug: 1 },
  ROOM_CLAIM_TIMEOUT_MS: 9000,
  ROOM_CLAIM_ATTEMPTS: 6,

  /* ── Rates ─────────────────────────────────────────────────────────*/
  INPUT_HZ: 30,     // phone → host
  TEL_HZ: 10,       // host → phone
  ICE_FAIL_MS: 10000,
  DROP_GRACE_MS: 60000
};

/* ── URL overrides ───────────────────────────────────────────────────
 * Both pages accept query parameters so you can point at a different
 * broker without editing this file or redeploying:
 *
 *   ?peer=192.168.1.50:9000   use a PeerServer you are running yourself
 *                             (npx peer --port 9000 --path /)
 *   ?stun=off                 drop the public STUN servers. Correct on a
 *                             single LAN, where host candidates are enough,
 *                             and necessary on networks that block STUN.
 *
 * Put them on /host/ and /play/ alike — both ends must agree on the broker.
 */
(function () {
  'use strict';
  var q = new URLSearchParams(window.location.search);
  var C = window.SS_CONFIG;

  var peer = q.get('peer');
  if (peer) {
    var bits = peer.split(':');
    var secure = window.location.protocol === 'https:';
    C.PEER_OPTS.host = bits[0];
    C.PEER_OPTS.port = bits[1] ? parseInt(bits[1], 10) : (secure ? 443 : 80);
    C.PEER_OPTS.path = q.get('peerpath') || '/';
    C.PEER_OPTS.secure = secure;
    C.BROKER_LABEL = peer;
  } else {
    C.BROKER_LABEL = 'PeerJS cloud';
  }

  if (q.get('stun') === 'off') {
    C.PEER_OPTS.config = { iceServers: [] };
    C.STUN_OFF = true;
  }

  /* ?appid=XXXXXXXX — cast with a different receiver application.
   *
   * The one that matters is Google's Default Media Receiver, CC1AD845. It is
   * published and available on every Chromecast ever made, so it isolates the
   * two reasons a sender reports "no receivers found":
   *
   *   default receiver finds a device, ours does not  →  app availability
   *      (device not registered, or not rebooted since registering)
   *   neither finds a device                          →  discovery itself
   *      (mDNS blocked, VPN, guest network, AP isolation, device asleep)
   */
  var appid = q.get('appid');
  if (appid) {
    C.CAST_APP_ID = appid.toUpperCase();
    C.CAST_APP_ID_OVERRIDDEN = true;
  }
  C.CAST_DEFAULT_MEDIA_RECEIVER = 'CC1AD845';
})();
