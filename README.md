# MiNotes 📝

A **serverless, local-first Markdown note-taking PWA**. Your notes live as plain
`.md` files on your own disk — no backend, no account, fully offline.

**Live app:** https://mitchyc24.github.io/

## How it works

- **Storage** — the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
  reads and writes Markdown files directly in a folder you pick
  (`showDirectoryPicker`). Dropped images are written to an `assets/`
  subdirectory and referenced with relative links.
- **Offline** — a service worker caches the app shell, so once loaded the app
  works with no connection at all. Notes never leave your machine.
- **State & indexing** — IndexedDB persists the workspace directory handle
  (so you aren't re-prompted for the folder) and the full-text search index
  (so subsequent loads only re-read files whose mtime changed).
- **Sync** — outsourced to your OS: pick a folder inside Google Drive,
  OneDrive or Dropbox and cross-device sync happens natively.
- **Fallback** — browsers without the File System Access API (Firefox, Safari)
  transparently use the Origin Private File System, which exposes the same
  handle interface but stores notes inside the browser profile.

## Features

- Live-preview Markdown editor (Edit / Split / Read modes) with GFM tables,
  task lists and strikethrough
- `[[Wikilinks]]` with `[[Target|alias]]` support, click-to-create for
  unresolved links, and a backlinks panel per note
- YAML frontmatter parsing — `tags` and `aliases` feed search and link
  resolution and are shown in a metadata bar
- Instant full-text search (MiniSearch): fuzzy matching, `"exact phrases"`,
  `AND`/`OR`, and `-exclusions`, with per-query timing (typically well under
  the 50 ms target)
- Drag-and-drop / paste images into the editor → saved to `assets/`, inserted
  as `![image](./assets/…)` and rendered in the preview via blob URLs
- Autosave with dirty-state indicator, rename, delete, `Ctrl+K` search,
  `Ctrl+N` new note, `Ctrl+1/2/3` view modes
- Installable PWA (manifest + icons + service worker), dark/light theme via
  `prefers-color-scheme`, responsive layout

## Architecture

Zero build step — plain ES modules served statically, which is exactly what
GitHub Pages provides. Dependencies are vendored so the service worker can
cache them for offline use.

```
index.html            app shell
css/app.css           styles (dark-first, light via media query)
js/app.js             UI controller / state
js/fs.js              File System Access layer + OPFS fallback
js/db.js              IndexedDB (dir handle, search cache, prefs)
js/markdown.js        marked + wikilink extension + frontmatter + DOMPurify
js/search.js          MiniSearch index, query grammar, backlink graph
sw.js                 service worker (app-shell cache)
manifest.webmanifest  PWA manifest
vendor/               marked, DOMPurify, MiniSearch (pinned, vendored)
```

### Security notes

- All rendered Markdown is sanitized with DOMPurify (user content is treated
  as untrusted; `script`, event handlers, `style`, and dangerous URLs are
  stripped) to mitigate DOM-based XSS.
- Served over HTTPS by GitHub Pages, which the File System Access API
  requires.
- Browsers intentionally drop write permission on stored directory handles
  between sessions; the welcome screen offers a one-click "Reconnect" that
  re-requests permission from a user gesture.

## Development

No toolchain needed:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(Any static file server works; the File System Access API needs a secure
context, and `localhost` qualifies.)

## Deploying

This repo **is** the deployment: GitHub Pages serves the repository root of
the default branch at `https://mitchyc24.github.io/`. Merge to the default
branch and it's live. All asset URLs are relative, so the app also works if
served from a sub-path.
