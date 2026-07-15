// MiNotes — main application controller.

import * as db from './db.js';
import * as fs from './fs.js';
import { NoteIndex } from './search.js';
import { parseFrontmatter, metaTags, renderMarkdown } from './markdown.js';

// ------------------------------------------------------------------ state

const state = {
  dirHandle: null,
  wsKey: null,          // cache key for this workspace
  notes: [],            // directory listing
  index: new NoteIndex(),
  currentPath: null,
  currentText: '',
  dirty: false,
  blobUrls: [],         // object URLs owned by the current preview
  usingOpfs: false,
};

const $ = (id) => document.getElementById(id);

const el = {
  welcome: $('welcome'), app: $('app'),
  btnOpen: $('btn-open-workspace'), btnReconnect: $('btn-reconnect'),
  btnOpenOther: $('btn-open-other'), reconnectName: $('reconnect-name'),
  fallbackNote: $('fallback-note'),
  workspaceName: $('workspace-name'), btnSwitch: $('btn-switch-workspace'),
  searchInput: $('search-input'), btnNew: $('btn-new-note'), btnRefresh: $('btn-refresh'),
  noteList: $('note-list'), noteCount: $('note-count'), offlineBadge: $('offline-badge'),
  emptyState: $('empty-state'), editorPane: $('editor-pane'),
  noteTitle: $('note-title'), saveState: $('save-state'),
  modeEdit: $('mode-edit'), modeSplit: $('mode-split'), modePreview: $('mode-preview'),
  btnDelete: $('btn-delete-note'), metaBar: $('meta-bar'),
  editorSplit: $('editor-split'), editor: $('editor'), preview: $('preview'),
  backlinksLabel: $('backlinks-label'), backlinks: $('backlinks'),
  searchResults: $('search-results'), searchSummary: $('search-summary'),
  searchHits: $('search-hits'), btnCloseSearch: $('btn-close-search'),
  toast: $('toast'), sidebar: $('sidebar'), btnMenu: $('btn-menu'),
};

// ------------------------------------------------------------------ utils

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

let toastTimer;
function toast(message, { error = false } = {}) {
  el.toast.textContent = message;
  el.toast.classList.toggle('error', error);
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3200);
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = 60_000, hour = 3_600_000, day = 86_400_000;
  if (diff < min) return 'just now';
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString();
}

// ------------------------------------------------ workspace initialization

async function boot() {
  registerServiceWorker();
  wireEvents();
  updateOnlineBadge();

  if (!fs.supportsFileSystemAccess) {
    el.fallbackNote.hidden = false;
    el.btnOpen.textContent = 'Start taking notes';
    // Re-enter the browser-managed workspace automatically on later visits.
    if (await db.getPref('opfsWorkspace').catch(() => false)) {
      await enterWorkspace(await fs.getOpfsWorkspace(), { opfs: true });
      return;
    }
  }

  const saved = fs.supportsFileSystemAccess ? await db.getSavedDirHandle().catch(() => null) : null;
  if (saved) {
    // Silent resume if permission is still granted; otherwise show reconnect UI
    // (requestPermission needs a user gesture).
    const perm = await fs.verifyPermission(saved);
    if (perm === 'granted') {
      await enterWorkspace(saved);
      return;
    }
    if (perm === 'prompt') {
      el.reconnectName.textContent = saved.name;
      el.btnReconnect.hidden = false;
      el.btnOpenOther.hidden = false;
      el.btnOpen.hidden = true;
      el.btnReconnect.addEventListener('click', async () => {
        const granted = await fs.verifyPermission(saved, { request: true });
        if (granted === 'granted') await enterWorkspace(saved);
        else toast('Permission was not granted.', { error: true });
      });
    }
  }
  el.welcome.hidden = false;
}

async function openWorkspacePicker() {
  try {
    if (fs.supportsFileSystemAccess) {
      const handle = await fs.pickWorkspace();
      await db.saveDirHandle(handle).catch(() => {});
      await enterWorkspace(handle);
    } else {
      await db.setPref('opfsWorkspace', true).catch(() => {});
      await enterWorkspace(await fs.getOpfsWorkspace(), { opfs: true });
    }
  } catch (err) {
    if (err?.name !== 'AbortError') toast(`Could not open folder: ${err.message}`, { error: true });
  }
}

async function enterWorkspace(handle, { opfs = false } = {}) {
  state.dirHandle = handle;
  state.usingOpfs = opfs;
  state.wsKey = opfs ? 'opfs' : handle.name;
  state.currentPath = null;

  el.workspaceName.textContent = opfs ? 'Browser workspace' : handle.name;
  el.workspaceName.title = el.workspaceName.textContent;
  el.welcome.hidden = true;
  el.app.hidden = false;

  // Restore the persisted search index, then reconcile with reality on disk.
  const cached = await db.getSearchCache(state.wsKey).catch(() => null);
  state.index = NoteIndex.fromCache(cached) || new NoteIndex();

  await refreshWorkspace({ firstRun: true });

  if (opfs && state.notes.length === 0) await createWelcomeNote();
}

async function refreshWorkspace({ firstRun = false } = {}) {
  try {
    state.notes = await fs.listNotes(state.dirHandle);
  } catch (err) {
    toast(`Could not read folder: ${err.message}`, { error: true });
    return;
  }
  const changed = await state.index.sync(
    state.notes,
    async (path) => (await fs.readNote(state.dirHandle, path)).text,
  );
  if (changed || firstRun) persistIndexSoon();
  renderNoteList();
  if (state.currentPath && !state.notes.some((n) => n.path === state.currentPath)) {
    closeNote();
  } else if (state.currentPath) {
    renderBacklinks();
  }
}

const persistIndexSoon = debounce(() => {
  db.saveSearchCache(state.wsKey, state.index.serialize()).catch(() => {});
}, 1000);

async function createWelcomeNote() {
  const text = `---
tags: [welcome]
---

# Welcome to MiNotes 👋

Your notes are plain **Markdown** files.

- Link notes with wikilinks: [[Ideas]]
- Use \`#\` headings, **bold**, *italic*, ~~strikethrough~~
- Task lists:
  - [x] Install MiNotes
  - [ ] Write something brilliant
- Drop an image into the editor to attach it

> Tip: press \`Ctrl+K\` to search, \`Ctrl+N\` for a new note.
`;
  await fs.writeNote(state.dirHandle, 'Welcome.md', text);
  await refreshWorkspace();
  await openNote('Welcome.md');
}

// ------------------------------------------------------------- note list

function renderNoteList() {
  el.noteList.textContent = '';
  for (const note of state.notes) {
    const btn = document.createElement('button');
    btn.className = 'note-item' + (note.path === state.currentPath ? ' active' : '');
    btn.dataset.path = note.path;

    const title = document.createElement('span');
    title.className = 'note-item-title';
    title.textContent = note.title;

    const sub = document.createElement('span');
    sub.className = 'note-item-sub';
    const doc = state.index.docs.get(note.path);
    const tags = doc ? doc.tags.map((t) => `#${t}`).join(' ') : '';
    sub.textContent = [relativeTime(note.lastModified), tags].filter(Boolean).join(' · ');

    btn.append(title, sub);
    btn.addEventListener('click', () => { openNote(note.path); closeSidebarOnMobile(); });
    el.noteList.appendChild(btn);
  }
  el.noteCount.textContent = `${state.notes.length} note${state.notes.length === 1 ? '' : 's'}`;
}

// ------------------------------------------------------------ note editing

async function openNote(path) {
  await flushSave();
  let text;
  try {
    ({ text } = await fs.readNote(state.dirHandle, path));
  } catch (err) {
    toast(`Could not open note: ${err.message}`, { error: true });
    return;
  }
  state.currentPath = path;
  state.currentText = text;
  state.dirty = false;

  const note = state.notes.find((n) => n.path === path);
  el.noteTitle.value = note ? note.title : path.replace(/\.md$/i, '');
  el.editor.value = text;
  el.emptyState.hidden = true;
  el.editorPane.hidden = false;
  setSaveState('saved');
  renderPreview();
  renderBacklinks();
  renderNoteList();
}

function closeNote() {
  state.currentPath = null;
  state.currentText = '';
  state.dirty = false;
  el.editorPane.hidden = true;
  el.emptyState.hidden = false;
  renderNoteList();
}

function setSaveState(mode) {
  el.saveState.classList.toggle('dirty', mode === 'dirty');
  el.saveState.textContent = { saved: 'saved', dirty: 'unsaved…', saving: 'saving…' }[mode] || '';
}

async function saveCurrentNote() {
  if (!state.currentPath || !state.dirty) return;
  const path = state.currentPath;
  const text = el.editor.value;
  setSaveState('saving');
  try {
    await fs.writeNote(state.dirHandle, path, text);
    state.currentText = text;
    state.dirty = false;
    setSaveState('saved');
    const note = state.notes.find((n) => n.path === path);
    const title = note ? note.title : path.replace(/\.md$/i, '');
    state.index.upsert(path, title, text, Date.now());
    if (note) note.lastModified = Date.now();
    persistIndexSoon();
    renderBacklinks();
  } catch (err) {
    setSaveState('dirty');
    toast(`Save failed: ${err.message}`, { error: true });
  }
}

const autoSave = debounce(saveCurrentNote, 800);

async function flushSave() {
  if (state.dirty) await saveCurrentNote();
}

async function createNote(title = 'Untitled', body = '') {
  await flushSave();
  let name = fs.titleToFilename(title);
  for (let i = 2; await fs.noteExists(state.dirHandle, name); i++) {
    name = fs.titleToFilename(`${title} ${i}`);
  }
  try {
    await fs.writeNote(state.dirHandle, name, body);
  } catch (err) {
    toast(`Could not create note: ${err.message}`, { error: true });
    return;
  }
  await refreshWorkspace();
  await openNote(name);
  el.noteTitle.focus();
  el.noteTitle.select();
}

async function deleteCurrentNote() {
  if (!state.currentPath) return;
  const note = state.notes.find((n) => n.path === state.currentPath);
  if (!confirm(`Delete “${note ? note.title : state.currentPath}”? The file will be removed from disk.`)) return;
  try {
    await fs.deleteNote(state.dirHandle, state.currentPath);
  } catch (err) {
    toast(`Delete failed: ${err.message}`, { error: true });
    return;
  }
  state.index.remove(state.currentPath);
  persistIndexSoon();
  state.dirty = false;
  closeNote();
  await refreshWorkspace();
  toast('Note deleted');
}

async function renameCurrentNote() {
  if (!state.currentPath) return;
  const newTitle = el.noteTitle.value.trim();
  const note = state.notes.find((n) => n.path === state.currentPath);
  if (!note || !newTitle || newTitle === note.title) {
    if (note) el.noteTitle.value = note.title;
    return;
  }
  const dir = state.currentPath.includes('/')
    ? state.currentPath.slice(0, state.currentPath.lastIndexOf('/') + 1) : '';
  const newPath = dir + fs.titleToFilename(newTitle);
  if (await fs.noteExists(state.dirHandle, newPath)) {
    toast('A note with that name already exists.', { error: true });
    el.noteTitle.value = note.title;
    return;
  }
  await flushSave();
  try {
    await fs.renameNote(state.dirHandle, state.currentPath, newPath, el.editor.value);
  } catch (err) {
    toast(`Rename failed: ${err.message}`, { error: true });
    el.noteTitle.value = note.title;
    return;
  }
  state.index.remove(state.currentPath);
  state.currentPath = newPath;
  state.index.upsert(newPath, newTitle.replace(/\.md$/i, ''), el.editor.value, Date.now());
  persistIndexSoon();
  await refreshWorkspace();
  toast('Note renamed');
}

// ---------------------------------------------------------------- preview

function releaseBlobUrls() {
  for (const url of state.blobUrls) URL.revokeObjectURL(url);
  state.blobUrls = [];
}

async function renderPreview() {
  const { meta, body } = parseFrontmatter(el.editor.value);
  releaseBlobUrls();
  el.preview.innerHTML = renderMarkdown(body);
  renderMetaBar(meta);
  wireWikilinks();
  await hydrateLocalImages();
}

function renderMetaBar(meta) {
  const tags = metaTags(meta);
  const extra = Object.entries(meta)
    .filter(([k]) => !['tags', 'tag', 'aliases', 'alias'].includes(k))
    .slice(0, 6);
  el.metaBar.textContent = '';
  if (tags.length === 0 && extra.length === 0) {
    el.metaBar.hidden = true;
    return;
  }
  for (const t of tags) {
    const span = document.createElement('span');
    span.className = 'meta-tag';
    span.textContent = `#${t}`;
    el.metaBar.appendChild(span);
  }
  for (const [k, v] of extra) {
    const span = document.createElement('span');
    span.className = 'meta-tag';
    span.textContent = `${k}: ${Array.isArray(v) ? v.join(', ') : v}`;
    el.metaBar.appendChild(span);
  }
  el.metaBar.hidden = false;
}

function wireWikilinks() {
  for (const link of el.preview.querySelectorAll('a[data-wikilink]')) {
    const target = link.dataset.wikilink;
    const resolved = state.index.resolve(target);
    if (!resolved) link.classList.add('unresolved');
    link.title = resolved ? `Open “${target}”` : `Create “${target}”`;
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const path = state.index.resolve(target);
      if (path) await openNote(path);
      else await createNote(target, `# ${target}\n\n`);
    });
  }
}

/** Swap relative ./assets/... image sources for blob URLs read off disk. */
async function hydrateLocalImages() {
  for (const img of el.preview.querySelectorAll('img[src]')) {
    const src = decodeURIComponent(img.getAttribute('src') || '');
    const m = src.match(/^(?:\.\/)?(assets\/[^?#]+)$/i);
    if (!m) continue;
    try {
      const url = await fs.assetToBlobUrl(state.dirHandle, m[1]);
      state.blobUrls.push(url);
      img.src = url;
    } catch {
      img.alt = `${img.alt || 'image'} (missing: ${m[1]})`;
    }
  }
}

function renderBacklinks() {
  el.backlinks.textContent = '';
  if (!state.currentPath) { el.backlinksLabel.textContent = ''; return; }
  const links = state.index.backlinks(state.currentPath);
  el.backlinksLabel.textContent = links.length
    ? `Linked from ${links.length} note${links.length === 1 ? '' : 's'}:`
    : 'No backlinks yet — reference this note with [[…]] elsewhere.';
  for (const path of links) {
    const doc = state.index.docs.get(path);
    const btn = document.createElement('button');
    btn.className = 'backlink';
    btn.textContent = doc ? doc.title : path;
    btn.addEventListener('click', () => openNote(path));
    el.backlinks.appendChild(btn);
  }
}

// ------------------------------------------------------------ view modes

function setViewMode(mode) {
  el.editorSplit.className = `editor-split mode-${mode}`;
  for (const [btn, m] of [[el.modeEdit, 'edit'], [el.modeSplit, 'split'], [el.modePreview, 'preview']]) {
    btn.classList.toggle('active', m === mode);
  }
  db.setPref('viewMode', mode).catch(() => {});
}

// ----------------------------------------------------------- asset drops

async function handleDroppedFiles(files, { atCursor = true } = {}) {
  if (!state.currentPath) {
    toast('Open a note first, then drop files into it.');
    return;
  }
  for (const file of files) {
    try {
      const relPath = await fs.saveAsset(state.dirHandle, file);
      const isImage = /^image\//.test(file.type);
      const snippet = isImage
        ? `![${file.name.replace(/\.[^.]*$/, '')}](./${relPath})`
        : `[${file.name}](./${relPath})`;
      insertAtCursor(snippet + '\n', atCursor);
    } catch (err) {
      toast(`Could not save ${file.name}: ${err.message}`, { error: true });
    }
  }
}

function insertAtCursor(text, atCursor = true) {
  const ta = el.editor;
  const pos = atCursor ? ta.selectionStart : ta.value.length;
  ta.value = ta.value.slice(0, pos) + text + ta.value.slice(atCursor ? ta.selectionEnd : pos);
  ta.selectionStart = ta.selectionEnd = pos + text.length;
  ta.dispatchEvent(new Event('input'));
  ta.focus();
}

// ----------------------------------------------------------------- search

function runSearch() {
  const q = el.searchInput.value.trim();
  if (!q) { closeSearch(); return; }
  const t0 = performance.now();
  const hits = state.index.search(q);
  const ms = (performance.now() - t0).toFixed(1);

  el.searchSummary.textContent = `${hits.length} result${hits.length === 1 ? '' : 's'} · ${ms} ms`;
  el.searchHits.textContent = '';
  for (const hit of hits) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    const title = document.createElement('div');
    title.className = 'hit-title';
    title.textContent = hit.title;
    const snippet = document.createElement('div');
    snippet.className = 'hit-snippet';
    snippet.innerHTML = hit.snippet; // escaped + <mark> only, built in search.js
    btn.append(title, snippet);
    btn.addEventListener('click', async () => {
      closeSearch();
      await openNote(hit.path);
      closeSidebarOnMobile();
    });
    li.appendChild(btn);
    el.searchHits.appendChild(li);
  }
  el.searchResults.hidden = false;
}

const runSearchSoon = debounce(runSearch, 120);

function closeSearch() {
  el.searchResults.hidden = true;
}

// ----------------------------------------------------------- service worker

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // GitHub Pages user sites serve from the repo root; a relative path keeps
  // this working under any base URL.
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function updateOnlineBadge() {
  el.offlineBadge.hidden = navigator.onLine;
}

// ------------------------------------------------------------------ events

function wireEvents() {
  el.btnOpen.addEventListener('click', openWorkspacePicker);
  el.btnOpenOther.addEventListener('click', openWorkspacePicker);
  el.btnSwitch.addEventListener('click', async () => {
    await flushSave();
    await openWorkspacePicker();
  });
  el.btnNew.addEventListener('click', () => createNote());
  el.btnRefresh.addEventListener('click', () => refreshWorkspace());
  el.btnDelete.addEventListener('click', deleteCurrentNote);

  el.editor.addEventListener('input', () => {
    state.dirty = el.editor.value !== state.currentText;
    setSaveState(state.dirty ? 'dirty' : 'saved');
    renderPreview();
    if (state.dirty) autoSave();
  });

  el.noteTitle.addEventListener('change', renameCurrentNote);
  el.noteTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.noteTitle.blur(); }
  });

  el.modeEdit.addEventListener('click', () => setViewMode('edit'));
  el.modeSplit.addEventListener('click', () => setViewMode('split'));
  el.modePreview.addEventListener('click', () => setViewMode('preview'));
  db.getPref('viewMode').then((m) => { if (m) setViewMode(m); }).catch(() => {});

  // Drag & drop assets into the editor.
  el.editor.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.editor.classList.add('drop-target');
  });
  el.editor.addEventListener('dragleave', () => el.editor.classList.remove('drop-target'));
  el.editor.addEventListener('drop', (e) => {
    e.preventDefault();
    el.editor.classList.remove('drop-target');
    if (e.dataTransfer?.files?.length) handleDroppedFiles([...e.dataTransfer.files]);
  });
  // Paste images from the clipboard.
  el.editor.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      handleDroppedFiles(files);
    }
  });

  el.searchInput.addEventListener('input', runSearchSoon);
  el.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = el.searchHits.querySelector('button');
      if (first) first.click();
    } else if (e.key === 'Escape') {
      el.searchInput.value = '';
      closeSearch();
      el.searchInput.blur();
    }
  });
  el.btnCloseSearch.addEventListener('click', closeSearch);
  el.searchResults.addEventListener('click', (e) => {
    if (e.target === el.searchResults) closeSearch();
  });

  if (el.btnMenu) el.btnMenu.addEventListener('click', () => el.sidebar.classList.toggle('open'));

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); el.searchInput.focus(); el.searchInput.select(); }
    else if (mod && e.key.toLowerCase() === 'n' && !el.app.hidden) { e.preventDefault(); createNote(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrentNote(); }
    else if (mod && e.key === '1') { e.preventDefault(); setViewMode('edit'); }
    else if (mod && e.key === '2') { e.preventDefault(); setViewMode('split'); }
    else if (mod && e.key === '3') { e.preventDefault(); setViewMode('preview'); }
    else if (e.key === 'Escape' && !el.searchResults.hidden) closeSearch();
  });

  window.addEventListener('online', updateOnlineBadge);
  window.addEventListener('offline', updateOnlineBadge);
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) {
      saveCurrentNote();
      e.preventDefault();
    }
  });
  // Rescan when the tab regains focus (files may have changed on disk / synced).
  window.addEventListener('focus', () => {
    if (!el.app.hidden) refreshWorkspace();
  });
}

function closeSidebarOnMobile() {
  el.sidebar.classList.remove('open');
}

boot();
