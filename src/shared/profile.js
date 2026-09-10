/* Device-local player profile.
 *
 * M0 stores only what reconnection needs: a stable id and a name. The full
 * stats schema lands in M4 — but the storage key is versioned from day one so
 * migrate.js has something to migrate.
 *
 * Every access is wrapped: Safari private mode throws on setItem, and iOS
 * evicts localStorage for a site after ~7 days without a visit. Nothing here
 * may be load-bearing.
 */

const KEY = 'sailingschool.profile.v1';

function uuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  // Fallback for older Chromium — good enough for a room-local identity.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const NAMES = ['Halyard', 'Windward', 'Leeward', 'Cleat', 'Gunwale', 'Transom',
               'Painter', 'Bowline', 'Shackle', 'Batten', 'Tiller', 'Luff'];

function fresh() {
  return {
    v: 1,
    pid: uuid(),
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    hull: '#B3117A',
    created: Date.now(),
    stats: {}          // M4 fills this in
  };
}

export function loadProfile() {
  let raw = null;
  try { raw = window.localStorage.getItem(KEY); } catch (e) { /* private mode */ }

  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (p && p.v === 1 && typeof p.pid === 'string') return p;
    } catch (e) { /* corrupt — fall through and start clean */ }
  }

  const p = fresh();
  saveProfile(p);
  return p;
}

export function saveProfile(p) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch (e) {
    if (window.SSDiag) {
      window.SSDiag.log('warn', 'could not save profile — storage unavailable. ' +
                                'Stats will not persist on this device.');
    }
    return false;
  }
}
