// File system layer.
//
// Primary path: the File System Access API (showDirectoryPicker) so notes live
// as real .md files on the user's disk. The directory handle is persisted in
// IndexedDB; browsers drop write permission between sessions, so verifyPermission()
// implements the re-grant flow (must be called from a user gesture).
//
// Fallback path: browsers without showDirectoryPicker (Firefox, Safari) use the
// Origin Private File System, which exposes the same handle interface but stores
// data inside the browser profile.

export const supportsFileSystemAccess =
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export const ASSETS_DIR = 'assets';

/** Ask the user to pick a workspace directory (requires a user gesture). */
export async function pickWorkspace() {
  return window.showDirectoryPicker({ mode: 'readwrite', id: 'minotes-workspace' });
}

/** OPFS-backed workspace for browsers without the File System Access API. */
export async function getOpfsWorkspace() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('minotes', { create: true });
}

/**
 * Check/request readwrite permission on a stored handle.
 * Returns 'granted', 'prompt' (needs a user gesture to request), or 'denied'.
 * OPFS handles have no permission model and always report granted.
 */
export async function verifyPermission(dirHandle, { request = false } = {}) {
  if (typeof dirHandle.queryPermission !== 'function') return 'granted';
  const opts = { mode: 'readwrite' };
  let state = await dirHandle.queryPermission(opts);
  if (state === 'prompt' && request) {
    state = await dirHandle.requestPermission(opts);
  }
  return state;
}

/**
 * Recursively list all .md files in the workspace.
 * Returns [{ path, name, title, handle, lastModified, size }].
 * Skips the assets directory and dot-directories.
 */
export async function listNotes(dirHandle) {
  const notes = [];
  await walk(dirHandle, '', notes);
  notes.sort((a, b) => b.lastModified - a.lastModified);
  return notes;
}

async function walk(dirHandle, prefix, out) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith('.')) continue;
    if (handle.kind === 'directory') {
      if (name.toLowerCase() === ASSETS_DIR) continue;
      await walk(handle, `${prefix}${name}/`, out);
    } else if (/\.(md|markdown)$/i.test(name)) {
      let lastModified = 0, size = 0;
      try {
        const f = await handle.getFile();
        lastModified = f.lastModified;
        size = f.size;
      } catch { /* unreadable entry; keep it listed */ }
      out.push({
        path: `${prefix}${name}`,
        name,
        title: name.replace(/\.(md|markdown)$/i, ''),
        handle,
        lastModified,
        size,
      });
    }
  }
}

/** Resolve a slash-separated relative path to a parent dir handle + basename. */
async function resolveParent(dirHandle, path, { create = false } = {}) {
  const parts = path.split('/').filter(Boolean);
  const base = parts.pop();
  let dir = dirHandle;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return { dir, base };
}

export async function readNote(dirHandle, path) {
  const { dir, base } = await resolveParent(dirHandle, path);
  const fileHandle = await dir.getFileHandle(base);
  const file = await fileHandle.getFile();
  return { text: await file.text(), lastModified: file.lastModified };
}

/** Current on-disk mtime of a note, or null if it can't be read. */
export async function statNote(dirHandle, path) {
  try {
    const { dir, base } = await resolveParent(dirHandle, path);
    const fileHandle = await dir.getFileHandle(base);
    const file = await fileHandle.getFile();
    return file.lastModified;
  } catch {
    return null;
  }
}

export async function writeNote(dirHandle, path, text) {
  const { dir, base } = await resolveParent(dirHandle, path, { create: true });
  const fileHandle = await dir.getFileHandle(base, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function deleteNote(dirHandle, path) {
  const { dir, base } = await resolveParent(dirHandle, path);
  await dir.removeEntry(base);
}

export async function renameNote(dirHandle, oldPath, newPath, text) {
  await writeNote(dirHandle, newPath, text);
  await deleteNote(dirHandle, oldPath);
}

export async function noteExists(dirHandle, path) {
  try {
    const { dir, base } = await resolveParent(dirHandle, path);
    await dir.getFileHandle(base);
    return true;
  } catch {
    return false;
  }
}

/** Sanitize a note title into a safe .md filename (no path separators). */
export function titleToFilename(title) {
  const safe = title.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Untitled';
  return `${safe}.md`;
}

/**
 * Write a dropped/pasted asset into /assets, de-duplicating filenames.
 * Returns the relative path to reference from Markdown.
 */
export async function saveAsset(dirHandle, file) {
  const assets = await dirHandle.getDirectoryHandle(ASSETS_DIR, { create: true });
  const dot = file.name.lastIndexOf('.');
  const stem = (dot > 0 ? file.name.slice(0, dot) : file.name)
    .replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  const ext = dot > 0 ? file.name.slice(dot) : '';
  let name = `${stem}${ext}`;
  for (let i = 1; ; i++) {
    try {
      await assets.getFileHandle(name); // exists -> pick another name
      name = `${stem}-${i}${ext}`;
    } catch {
      break;
    }
  }
  const fh = await assets.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(file);
  await writable.close();
  return `${ASSETS_DIR}/${name}`;
}

/** Read an asset file as a blob URL for preview rendering. */
export async function assetToBlobUrl(dirHandle, relPath) {
  const { dir, base } = await resolveParent(dirHandle, relPath);
  const fh = await dir.getFileHandle(base);
  const file = await fh.getFile();
  return URL.createObjectURL(file);
}
