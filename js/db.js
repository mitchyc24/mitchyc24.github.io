// IndexedDB persistence: workspace directory handle + serialized search index.

const DB_NAME = 'minotes';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function kvGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function kvDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- workspace handle ---
export const getSavedDirHandle = () => kvGet('dirHandle');
export const saveDirHandle = (handle) => kvSet('dirHandle', handle);
export const clearDirHandle = () => kvDelete('dirHandle');

// --- search index cache (keyed by workspace name so switching folders is safe) ---
export const getSearchCache = (wsKey) => kvGet(`searchIndex:${wsKey}`);
export const saveSearchCache = (wsKey, payload) => kvSet(`searchIndex:${wsKey}`, payload);

// --- misc UI prefs ---
export const getPref = (key) => kvGet(`pref:${key}`);
export const setPref = (key, value) => kvSet(`pref:${key}`, value);
