/* Phone side of the transport.
 *
 * Connects to a room code, sends input at INPUT_HZ, measures round-trip
 * latency from the host's telemetry echo, and reconnects with backoff.
 */

import { loadPeerJS } from '../shared/peer-loader.js';
import { T, hello, input } from './protocol.js';

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
    this.value = 0;
    this.rtt = null;
    this.state = 'idle';
    this.attempt = 0;
    this._sendTimer = null;
    this._closing = false;
    this._sentAt = new Map();   // seq -> performance.now()
  }

  setValue(v) {
    this.value = Math.max(-1, Math.min(1, Number(v) || 0));
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
    try {
      Peer = await loadPeerJS();
    } catch (e) {
      return this._retry('could not load PeerJS');
    }

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
        reliable: false,      // input is lossy by design; latest wins
        serialization: 'json',
        metadata: { pid: this.profile.pid }
      });
      this.conn = conn;

      conn.on('open', () => {
        clearTimeout(iceGuard);
        this.attempt = 0;
        conn.send(hello(this.profile.pid, this.profile.name));
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
        return; // a wrong code will never succeed; don't spin on it
      }
      this._retry('broker error: ' + type);
    });
  }

  _onData(m) {
    if (!m || m.t !== T.TEL) return;
    if (m.ts && this._sentAt.has(m.seq)) {
      this.rtt = Math.round(performance.now() - this._sentAt.get(m.seq));
      this._sentAt.clear();   // one sample per telemetry tick is plenty
    }
    if (this.h.onTelemetry) this.h.onTelemetry({ rtt: this.rtt, up: m.up, players: m.n });
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
        this.conn.send(input(this.value, seq, ts));
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
