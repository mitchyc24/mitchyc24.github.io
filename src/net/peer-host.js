/* Host side of the transport.
 *
 * Claims a room code, accepts phone connections, keeps the latest input per
 * player, and pushes instrument telemetry back at TEL_HZ.
 *
 * It knows nothing about physics. The host page owns the world and hands this
 * a `readBoat(pid)` callback; that keeps src/net free of src/core and means the
 * whole transport stays swappable for the Firebase implementation later.
 */

import { loadPeerJS, basePath } from '../shared/peer-loader.js';
import { T, welcome, telemetry, event, isValidHello, sanitizeInput } from './protocol.js';
import { LEVELS } from '../shared/assists.js';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I O 0 1
const cfg = () => window.SS_CONFIG;

function code(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

function log(kind, msg) {
  if (window.SSDiag) window.SSDiag.log(kind, msg);
}

export class PeerHost {
  /**
   * @param handlers.onJoin(player)      give this player a boat
   * @param handlers.onLeave(player)     take it away
   * @param handlers.onInput(player,in)  feed the simulation
   * @param handlers.readBoat(player)    return the telemetry payload, or null
   * @param handlers.onPlayers(list)     roster changed
   */
  constructor(handlers) {
    this.h = handlers || {};
    this.peer = null;
    this.code = null;
    this.joinUrl = null;
    this.players = new Map();   // pid -> player
    this.slots = 0;
    this.startedAt = Date.now();
    this._telTimer = null;
    this._bytesIn = 0;
    this._msgsIn = 0;
  }

  get uptimeSeconds() { return Math.floor((Date.now() - this.startedAt) / 1000); }
  get stats() { return { bytesIn: this._bytesIn, msgsIn: this._msgsIn, players: this.players.size }; }

  /** Claim a room on the broker, retrying on ID collision. */
  async open(attempt = 0) {
    const Peer = await loadPeerJS();
    const c = code(4);
    const id = cfg().NS + '-' + c;

    log('info', 'claiming room ' + id + ' via ' + cfg().BROKER_LABEL +
                (attempt ? '  (attempt ' + (attempt + 1) + ')' : ''));

    const peer = new Peer(id, cfg().PEER_OPTS);

    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };
        const timer = setTimeout(() => done(reject, new Error('broker timeout')),
                                 cfg().ROOM_CLAIM_TIMEOUT_MS);
        peer.on('open', () => { clearTimeout(timer); done(resolve); });
        peer.on('error', (e) => { clearTimeout(timer); done(reject, e); });
      });
    } catch (err) {
      try { peer.destroy(); } catch (e) { /* already gone */ }
      const taken = err && String(err.type) === 'unavailable-id';
      log('warn', 'room claim failed: ' + (err && err.message ? err.message : err));
      if (attempt + 1 >= cfg().ROOM_CLAIM_ATTEMPTS) {
        throw new Error(taken ? 'Could not find a free room code.'
                              : 'Could not reach the signalling broker. Check this device is online.');
      }
      return this.open(attempt + 1);
    }

    this.peer = peer;
    this.code = c;
    /* Carry our own query string into the join URL. Both ends must agree on
     * the broker, so ?peer= and ?stun= have to ride along to the phone. */
    this.joinUrl = window.location.origin + basePath() + 'play/' +
                   window.location.search + '#' + c;
    log('ok', 'room ' + c + ' open — ' + this.joinUrl);

    peer.on('connection', (conn) => this._accept(conn));
    peer.on('error', (e) => log('err', 'peer error: ' + (e && e.type ? e.type : e)));
    peer.on('disconnected', () => {
      log('warn', 'broker connection dropped — existing players keep playing');
      try { peer.reconnect(); } catch (e) { /* best effort */ }
    });

    this._telTimer = setInterval(() => this._pushTelemetry(), 1000 / cfg().TEL_HZ);
    return c;
  }

  _accept(conn) {
    log('info', 'incoming connection ' + conn.peer);

    const iceGuard = setTimeout(() => {
      if (!conn.open) {
        log('err', 'ICE did not connect within ' + (cfg().ICE_FAIL_MS / 1000) + 's — ' +
                   'this network may have client isolation enabled');
      }
    }, cfg().ICE_FAIL_MS);

    conn.on('open', () => { clearTimeout(iceGuard); log('ok', 'datachannel open to ' + conn.peer); });

    conn.on('data', (m) => {
      this._msgsIn++;
      this._bytesIn += approxBytes(m);

      if (isValidHello(m)) return this._join(conn, m);

      const player = this._byConn(conn);
      if (!player) return;

      if (m && m.t === T.IN) {
        const s = sanitizeInput(m);
        if (!s) return;
        /* Keep the LATEST input, never a queue. A dropped packet is harmless
         * because the next one arrives ~33 ms later carrying current state. */
        player.last = s;
        player.lastSeen = Date.now();
        player.msgs++;
        if (this.h.onInput) this.h.onInput(player, s);
      } else if (m && m.t === T.ASSIST) {
        const lvl = LEVELS.indexOf(m.a) >= 0 ? m.a : 'strict';
        player.assist = lvl;
        if (this.h.onAssist) this.h.onAssist(player, lvl);
        if (this.h.onPlayers) this.h.onPlayers(this.list());
      } else if (m && m.t === T.BYE) {
        this._drop(player, 'said goodbye');
      }
    });

    conn.on('close', () => {
      clearTimeout(iceGuard);
      const player = this._byConn(conn);
      if (player) this._drop(player, 'connection closed');
    });
    conn.on('error', (e) => log('err', 'conn error: ' + (e && e.message ? e.message : e)));
  }

  _byConn(conn) {
    for (const p of this.players.values()) if (p.conn === conn) return p;
    return null;
  }

  _join(conn, m) {
    const existing = this.players.get(m.pid);
    if (existing) {
      /* Reconnect: same profile id reclaims the same slot and the same boat,
       * still where they left it. */
      log('ok', 'player ' + existing.name + ' reconnected to slot ' + existing.slot);
      existing.conn = conn;
      existing.lastSeen = Date.now();
      existing.droppedAt = 0;
      conn.send(welcome(existing.slot, hostKind(), existing.boatId));
      if (this.h.onPlayers) this.h.onPlayers(this.list());
      return;
    }

    const player = {
      pid: m.pid,
      name: String(m.name || 'Sailor').slice(0, 16),
      hull: typeof m.hull === 'string' ? m.hull.slice(0, 12) : '#B3117A',
      assist: LEVELS.indexOf(m.assist) >= 0 ? m.assist : 'strict',
      slot: this.slots++,
      conn,
      last: { r: 0, s: 0.25, h: 0, seq: 0, ts: 0 },
      lastSeen: Date.now(),
      joinedAt: Date.now(),
      droppedAt: 0,
      msgs: 0
    };
    player.boatId = 'b' + player.slot;
    this.players.set(m.pid, player);
    log('ok', 'player ' + player.name + ' joined as slot ' + player.slot);

    if (this.h.onJoin) this.h.onJoin(player);
    conn.send(welcome(player.slot, hostKind(), player.boatId));
    if (this.h.onPlayers) this.h.onPlayers(this.list());
  }

  _drop(player, why) {
    if (!player || !this.players.has(player.pid)) return;
    log('warn', player.name + ' ' + why + ' — holding the boat for ' +
                (cfg().DROP_GRACE_MS / 1000) + 's');
    player.droppedAt = Date.now();
    /* The boat stays in the world, drifting with the sail luffing. */
    if (this.h.onInput) this.h.onInput(player, { r: 0, s: 1, h: 0 });

    setTimeout(() => {
      if (!player.droppedAt) return;                       // they came back
      if (Date.now() - player.droppedAt < cfg().DROP_GRACE_MS - 50) return;
      this.players.delete(player.pid);
      log('warn', player.name + ' removed');
      if (this.h.onLeave) this.h.onLeave(player);
      if (this.h.onPlayers) this.h.onPlayers(this.list());
    }, cfg().DROP_GRACE_MS);

    if (this.h.onPlayers) this.h.onPlayers(this.list());
  }

  /** Fire a one-off event at one player — a buzz, a message. */
  notify(player, kind, detail) {
    if (!player || !player.conn || !player.conn.open) return;
    try { player.conn.send(event(kind, detail)); } catch (e) { /* channel closing */ }
  }

  _pushTelemetry() {
    if (!this.h.readBoat) return;
    const up = this.uptimeSeconds;
    const n = this.players.size;
    for (const p of this.players.values()) {
      if (!p.conn || !p.conn.open) continue;
      const t = this.h.readBoat(p);
      if (!t) continue;
      try {
        p.conn.send(telemetry(Object.assign({ seq: p.last.seq, ts: p.last.ts, up, n }, t)));
      } catch (e) { /* channel closing */ }
    }
  }

  list() {
    const now = Date.now();
    return Array.from(this.players.values()).map((p) => ({
      pid: p.pid, name: p.name, hull: p.hull, assist: p.assist,
      slot: p.slot, boatId: p.boatId,
      r: p.last.r, s: p.last.s, h: p.last.h, seq: p.last.seq, msgs: p.msgs,
      connected: !!(p.conn && p.conn.open) && !p.droppedAt,
      stale: now - p.lastSeen > 2000
    }));
  }

  close() {
    if (this._telTimer) clearInterval(this._telTimer);
    if (this.peer) try { this.peer.destroy(); } catch (e) { /* ignore */ }
  }
}

function hostKind() {
  return (window.cast && window.cast.framework) ? 'cast' : 'browser';
}

function approxBytes(v) {
  if (typeof v === 'string') return v.length;
  if (v instanceof ArrayBuffer) return v.byteLength;
  try { return JSON.stringify(v).length; } catch (e) { return 0; }
}
