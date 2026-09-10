/* Phone side of the transport.
 *
 * Connects to a room code, streams the two axes and the hike button at
 * INPUT_HZ, measures round-trip latency from the host's telemetry echo, and
 * reconnects with backoff.
 */

import { loadPeerJS } from '../shared/peer-loader.js';
import { T, hello, input, setAssistMsg } from './protocol.js';

const cfg = () => window.SS_CONFIG;
const BACKOFF = [1000, 2000, 4000, 8000, 8000];

function log(kind, msg) {
  if (window.SSDiag) window.SSDiag.log(kind, msg);
}

export class PeerClient {
  constructor(roomCode, profile, handlers) {
    this.room = roomCode;
    this.profile = profile;
    this.h = handlers || {};
    this.peer = null;
    this.conn = null;
    this.seq = 0;
    this.rtt = null;
    this.state = 'idle';
    this.attempt = 0;

    /* Latest control state. The send loop samples this; touch handlers write
     * it. Never queue inputs — the newest one is the only one that matters. */
    this.controls = { r: 0, s: 0.25, h: 0 };

    this._sendTimer = null;
    this._closing = false;
    this._sentAt = new Map();
  }

  /** Change assist level mid-game; takes effect on the next host step. */
  setAssist(level) {
    this.profile.assist = level;
    if (this.conn && this.conn.open) {
      try { this.conn.send(setAssistMsg(level)); } catch (e) { /* channel closing */ }
    }
  }

  setControls(c) {
    if (c.r !== undefined) this.controls.r = Math.max(-1, Math.min(1, Number(c.r) || 0));
    if (c.s !== undefined) this.controls.s = Math.max(0, Math.min(1, Number(c.s) || 0));
    if (c.h !== undefined) this.controls.h = c.h ? 1 : 0;
  }

  _setState(s, detail) {
    this.state = s;
    log(s === 'connected' ? 'ok' : s === 'failed' ? 'err' : 'info',
        'transport: ' + s + (detail ? ' — ' + detail : ''));
    if (this.h.onState) this.h.onState(s, detail);
  }

  async connect() {
    if (this._closing) return;
    this._setState('connecting');

    let Peer;
    try { Peer = await loadPeerJS(); }
    catch (e) { return this._retry('could not load PeerJS'); }

    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
    this.peer = new Peer(undefined, cfg().PEER_OPTS);

    const hostId = cfg().NS + '-' + this.room;

    const iceGuard = setTimeout(() => {
      if (this.state !== 'connected') {
        this._setState('slow',
          'no direct route yet. If this persists, the wifi may block ' +
          'device-to-device traffic (client isolation).');
      }
    }, cfg().ICE_FAIL_MS);

    this.peer.on('open', () => {
      log('info', 'dialling ' + hostId);
      const conn = this.peer.connect(hostId, {
        reliable: false,        // input is lossy by design; latest wins
        serialization: 'json',
        metadata: { pid: this.profile.pid }
      });
      this.conn = conn;

      conn.on('open', () => {
        clearTimeout(iceGuard);
        this.attempt = 0;
        conn.send(hello(this.profile.pid, this.profile.name, this.profile.hull,
                        this.profile.assist));
        this._setState('connected');
        this._startSending();
      });

      conn.on('data', (m) => this._onData(m));

      conn.on('close', () => {
        clearTimeout(iceGuard);
        this._stopSending();
        if (!this._closing) this._retry('host closed the connection');
      });

      conn.on('error', (e) => log('err', 'conn error: ' + (e && e.type ? e.type : e)));
    });

    this.peer.on('error', (e) => {
      clearTimeout(iceGuard);
      const type = e && e.type ? e.type : 'unknown';
      if (type === 'peer-unavailable') {
        this._setState('failed', 'no game is hosting room ' + this.room);
        return;   // a wrong code will never succeed; don't spin on it
      }
      this._retry('broker error: ' + type);
    });
  }

  _onData(m) {
    if (!m) return;
    if (m.t === T.WELCOME) {
      log('ok', 'welcomed as slot ' + m.slot + ' on ' + m.host);
      if (this.h.onWelcome) this.h.onWelcome(m);
      return;
    }
    if (m.t === T.EVT) {
      if (this.h.onEvent) this.h.onEvent(m.k, m.d);
      return;
    }
    if (m.t !== T.TEL) return;

    if (m.ts && this._sentAt.has(m.seq)) {
      this.rtt = Math.round(performance.now() - this._sentAt.get(m.seq));
      this._sentAt.clear();       // one sample per telemetry tick is plenty
    }
    if (this.h.onTelemetry) this.h.onTelemetry(m, this.rtt);
  }

  _startSending() {
    this._stopSending();
    const period = 1000 / cfg().INPUT_HZ;
    this._sendTimer = setInterval(() => {
      if (!this.conn || !this.conn.open) return;
      const seq = ++this.seq;
      const ts = Math.round(performance.now());
      if (seq % 10 === 0) this._sentAt.set(seq, performance.now());
      try {
        const c = this.controls;
        this.conn.send(input(c.r, c.s, c.h, seq, ts));
      } catch (e) { /* channel closing */ }
    }, period);
  }

  _stopSending() {
    if (this._sendTimer) clearInterval(this._sendTimer);
    this._sendTimer = null;
  }

  _retry(why) {
    if (this._closing) return;
    const wait = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)];
    this.attempt++;
    this._setState('reconnecting', why + ' — retrying in ' + (wait / 1000) + 's');
    setTimeout(() => this.connect(), wait);
  }

  close() {
    this._closing = true;
    this._stopSending();
    if (this.conn && this.conn.open) {
      try { this.conn.send({ t: T.BYE }); } catch (e) { /* ignore */ }
    }
    if (this.peer) try { this.peer.destroy(); } catch (e) { /* ignore */ }
  }
}
