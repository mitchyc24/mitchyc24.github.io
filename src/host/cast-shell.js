/* Cast lifecycle. The only Cast-aware file in the project.
 *
 * Two things matter here and both will cost you an evening if missed:
 *
 * 1. CAF assumes it is a media player. With no media element playing and no
 *    sender chatter it fires SENDER_DISCONNECTED and tears the app down
 *    mid-game. maxInactivity is raised AND the /cast/ sender heartbeats.
 * 2. The receiver only lives while a sender is connected. That is why /cast/
 *    has to stay open, and why we surface it instead of dying silently.
 */

const cfg = () => window.SS_CONFIG;

function log(kind, msg) {
  if (window.SSDiag) window.SSDiag.log(kind, msg);
}

export function attachCast(app) {
  if (!(window.cast && window.cast.framework)) return null;

  const ctx = cast.framework.CastReceiverContext.getInstance();
  const NS = cfg().CAST_NAMESPACE;
  const opts = new cast.framework.CastReceiverOptions();

  opts.maxInactivity = cfg().CAST_MAX_INACTIVITY;
  opts.disableIdleTimeout = true;
  opts.customNamespaces = {};
  opts.customNamespaces[NS] = cast.framework.system.MessageType.JSON;

  let lastHeartbeat = Date.now();

  ctx.addCustomMessageListener(NS, (e) => {
    const d = e.data || {};
    if (d.t === 'hb') {
      lastHeartbeat = Date.now();
      try { ctx.sendCustomMessage(NS, e.senderId, { t: 'hb-ack', up: app.uptimeSeconds }); }
      catch (err) { /* sender went away mid-ack */ }
    }
  });

  ctx.addEventListener(cast.framework.system.EventType.SENDER_CONNECTED, (e) => {
    log('ok', 'cast sender connected: ' + e.senderId);
    app.setHostNotice(null);
  });

  ctx.addEventListener(cast.framework.system.EventType.SENDER_DISCONNECTED, (e) => {
    log('warn', 'cast sender disconnected: ' + e.senderId);
    app.setHostNotice('The host device disconnected. Reopen /cast/ to keep this session alive.');
  });

  ctx.addEventListener(cast.framework.system.EventType.READY, () => {
    log('ok', 'cast receiver ready');
  });

  ctx.start(opts);
  log('ok', 'cast context started (maxInactivity=' + opts.maxInactivity + 's)');

  return {
    kind: 'cast',
    secondsSinceHeartbeat: () => Math.floor((Date.now() - lastHeartbeat) / 1000),
    stop: () => { try { ctx.stop(); } catch (e) { /* ignore */ } }
  };
}
