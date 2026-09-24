# miApps

Small web apps by Mitchell, all in one place: **https://mitchyc24.github.io/**

This repo is both the storage and the front door for a collection of independent single-page apps. Each app is
plain HTML, CSS and JavaScript in its own folder, published as-is by GitHub Pages with no build step. The home
page is a hub that reads the registry, `apps.json`, and shows a card for every app with search and category
filters.

## Adding an app

### Request one

Use the **[New app request](https://github.com/mitchyc24/mitchyc24.github.io/issues/new?template=new-app.yml)**
form (it's also the *Request an app* button on the hub). It asks for a name, a one-line pitch, what the app should
do, where you'll use it and where its data lives. That is everything needed to build it.

Then hand the issue to whoever builds it. A coding agent (Claude Code, Copilot, Jules, Codex) reads
[`AGENTS.md`](AGENTS.md) for the rules and follows them: it builds the app in `apps/<id>/`, registers it in
`apps.json`, leaves the other apps alone, and opens a PR that closes the issue. CI checks the registry on the PR,
and merging to `main` publishes it.

To change an app that already exists, use
**[Change an existing app](https://github.com/mitchyc24/mitchyc24.github.io/issues/new?template=change-app.yml)**.

### Build one yourself

```bash
cp -r apps/_template apps/tide-clock        # the folder name is the app's id
# build the app in apps/tide-clock/, then add it to apps.json:
```

```json
{
  "id": "tide-clock",
  "name": "Tide Clock",
  "tagline": "When the next high and low tide is at my local beach.",
  "path": "apps/tide-clock/",
  "icon": "🌊",
  "color": "#1F6FB2",
  "category": "Tools",
  "platforms": ["phone"],
  "status": "prototype",
  "added": "2026-10-01"
}
```

```bash
python3 .github/scripts/check_apps.py        # must print OK
python3 -m http.server 8000                  # then open http://localhost:8000/
```

Every registry field, and the rules that keep apps from stepping on each other (they share one origin, so storage
keys are prefixed with the app id), are in [`AGENTS.md`](AGENTS.md).

## Layout

```
index.html  hub/  404.html  manifest.webmanifest   the hub
apps.json                                           the registry, the list of every app
apps/<id>/                                          one app per folder, index.html is its entry
apps/_template/                                     starter for new apps (not listed on the hub)
host/                                               Observatory, a Chromecast dashboard (see host/README.md)
.github/ISSUE_TEMPLATE/                             the request forms
.github/scripts/check_apps.py                       registry checker
.github/workflows/check-apps.yml                    runs the checker on every push and PR
.github/workflows/dashboard-data.yml                deploys the site (on push and every 15 min, for Observatory's data)
```

Old URLs keep working: `404.html` looks the missing path up in each app's `aliases` in `apps.json` (and treats
`/<id>/` as a shortcut), then redirects. `/stride-roulette.html` still reaches Stride Roulette that way.

## Hosting setup

- Settings → Pages → **Source: GitHub Actions**. Already set for Observatory; the hub rides the same deploy.
- The issue forms apply the labels `app-request` and `app-change`. GitHub only applies labels that already
  exist, so create those two once under Issues → Labels.
- Scheduled workflows pause after 60 days without a push to the repo. Any push re-enables them.
