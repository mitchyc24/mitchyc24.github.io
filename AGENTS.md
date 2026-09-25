# AGENTS.md

Instructions for anyone, human or coding agent, who adds or changes an app in this repo.

## What this repo is

**miApps**: a collection of small, independent web apps published by GitHub Pages at
https://mitchyc24.github.io/. The root page is a hub that reads `apps.json` and shows a card per app.

- There is no build step. Every file is served exactly as it is in the repo.
- Every app is plain HTML, CSS and JavaScript in its own folder.
- `apps.json` is the registry: if an app isn't listed there, the hub doesn't know it exists.

```
index.html, hub/, 404.html, manifest.webmanifest   the hub (leave alone unless the task is about the hub)
apps.json                                           the registry
apps/<id>/                                          one folder per app; index.html is its entry
apps/_template/                                     starter to copy for a new app (not listed on the hub)
host/                                               Observatory, the one app that lives outside apps/ (see "Pinned paths")
.github/scripts/check_apps.py                       registry checker, run by CI on every push and PR
```

## Rules

1. **Stay in your folder.** A new app, or a change to one, touches only `apps/<id>/` and that app's entry in
   `apps.json`. Never delete, move, rename or rewrite another app, the hub or `host/` unless the task asks for
   exactly that. Never "replace the repository content" with a new app: this repo used to lose every
   previous app that way.
2. **No build step.** Ship files a browser can run as they are. ES modules (`<script type="module">`) are fine.
   Put third-party libraries in `apps/<id>/vendor/`, or load them from a CDN URL pinned to an exact version
   (`https://cdn.jsdelivr.net/npm/lib@1.2.3/...`). No npm install, bundlers, TypeScript or JSX that need compiling.
3. **Use relative URLs** inside an app (`./style.css`, `js/app.js`, `../../` for the hub). A leading `/` points
   at the site root, not at the app.
4. **Share the origin politely.** Every app is served from `mitchyc24.github.io`, so all of them share one
   localStorage, IndexedDB and Cache Storage.
   - Prefix every localStorage and sessionStorage key with `<id>.` (for example `stride-roulette.settings`).
   - Name IndexedDB databases and Cache Storage caches `<id>` or `<id>-something`.
   - A service worker must live in the app's folder and be registered with `scope: "./"`. Never register one at
     the site root, because it would control every app.
   - Existing apps that predate this rule keep their keys (Stride Roulette uses `sr.`). Don't migrate them unasked.
5. **Mobile first.** Include `<meta name="viewport" content="width=device-width, initial-scale=1">`, a real
   `<title>`, tap targets of 44px or more, and light and dark colour schemes. No horizontal scroll at 360px wide.
6. **Link home.** Give the app a way back to the hub, `<a href="../../">miApps</a>`, unless it is a TV or kiosk
   screen.
7. **Keep secrets out.** Everything here is public. An app that needs an API key asks the user for it and keeps
   it in their browser, the way Stride Roulette does.
8. **Check before you commit:** `python3 .github/scripts/check_apps.py` must print `OK`.

## Adding an app

1. Pick an `id`: lowercase words joined by hyphens (`tide-clock`). It is the folder name, the registry key and
   the storage prefix, so don't change it later.
2. `cp -r apps/_template apps/<id>` and build the app there. Set `APP_ID` in the template's script to the id.
3. Add an entry to the `apps` array in `apps.json` (fields below). New entries can go anywhere, because the hub
   sorts by `updated`.
4. Run the checker, then preview: `python3 -m http.server 8000` from the repo root, open
   http://localhost:8000/, find the card, open the app, and try it at phone width.
5. Commit on a branch and open a PR titled `Add <Name>`. If an issue asked for it, put `Closes #<n>` in the body.

When the work comes from a **New app request** issue, map the form onto the registry: *App name* becomes `name`,
*One-line pitch* becomes `tagline`, *Where will you use it?* becomes `platforms`, and *Category* becomes
`category`. Use the emoji and colours from *Look and feel* if it gives any. *Where does its data live?* picks
the storage approach:

| Answer | Do this |
|---|---|
| Saved in this browser | localStorage for small settings, IndexedDB for records, prefixed with the id (rule 4) |
| Files from my device | File System Access API with an `<input type="file">` / download fallback for Safari and Firefox |
| Fetched live from public APIs | `fetch` from the browser; pick keyless, CORS-enabled APIs |
| Built on a schedule by GitHub Actions | see "Data built by GitHub Actions" below |

## Changing an app

Edit only inside its folder. Bump `updated` in its `apps.json` entry to today's date. If the change affects how
the app is described (what it does, where it runs, its status), update `tagline`, `platforms` or `status` too.

Renaming or moving an app: move the folder, update `path`, and add the old path to `aliases` so the hub's
404 page redirects old links and home-screen shortcuts. Keep the `id` unless the task says otherwise.

## Registry fields (`apps.json`)

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Lowercase words joined by hyphens, unique. The folder name under `apps/`. |
| `name` | yes | Display name. |
| `tagline` | yes | One or two sentences for the card. Say what it does, not how it was built. |
| `path` | yes | Folder relative to the site root, with a trailing slash: `apps/<id>/`. |
| `entry` | no | File in `path` to open instead of `index.html` (Observatory opens `remote.html`, its controls). |
| `action` | no | Label for the card's main action. Defaults to "Open". |
| `icon` | yes | An emoji, or the path of an image relative to the site root (`apps/<id>/icon.svg`). |
| `color` | no | Hex colour for the icon tile, usually the app's accent: `#D7262E`. |
| `category` | yes | The hub's filter chips come from this. Reuse an existing category when one fits. |
| `tags` | no | Extra words the hub's search should match. |
| `platforms` | no | Any of `phone`, `tablet`, `desktop`, `tv`. |
| `status` | yes | `stable`, `beta`, `prototype` or `archived` (archived apps move to the bottom of the hub). |
| `added` | yes | Date it joined the collection, `YYYY-MM-DD`. |
| `updated` | no | Date of the last meaningful change, `YYYY-MM-DD`. The hub sorts by this. |
| `links` | no | Extra buttons on the card: `[{ "label": "Preview", "href": "host/?dev" }]`. `href` is relative to the site root. |
| `aliases` | no | Old paths that should redirect to this app, relative to the site root: `["stride-roulette.html"]`. |

## Pinned paths

- `host/` is **Observatory**. Its address, `https://mitchyc24.github.io/host/`, is registered as the receiver URL
  of Cast app `FB21C379` in the Google Cast SDK Developer Console, so it stays where it is. Moving it means
  changing that URL in the console first.
- `host/data/data.json` is rebuilt every 15 minutes by `.github/workflows/dashboard-data.yml`. The committed copy
  is a sample; never commit live data.
- The hub is `index.html`, `hub/`, `404.html` and `manifest.webmanifest`.

## Data built by GitHub Actions

If an app needs data that a browser can't fetch itself (the source needs a key, has no CORS, or is slow), add a
script under `.github/scripts/` and a step to `.github/workflows/dashboard-data.yml` that writes into
`apps/<id>/data/` before the Pages upload. Keep a small sample file committed so the app works locally, and make
the step tolerate failure so one broken source can't block the whole site's deploy. Observatory's
`build_data.py` is the worked example.

## Deploying

Pushing to `main` deploys the whole site through `.github/workflows/dashboard-data.yml` (Pages source: GitHub
Actions). The same workflow runs every 15 minutes, so a merged change is live within a few minutes either way.
