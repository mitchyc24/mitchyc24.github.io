## What this does

<!-- One or two sentences. "Closes #N" if it answers an issue. -->

## Checklist

- [ ] The app lives entirely in `apps/<id>/`, with `index.html` as its entry
- [ ] `apps.json` has an entry for it, and `updated` is bumped if it changed
- [ ] No other app, the hub (`index.html`, `hub/`, `404.html`) or `host/` was changed, unless that was the point
- [ ] `python3 .github/scripts/check_apps.py` passes
- [ ] Opened it through a local server (`python3 -m http.server`) on a phone-sized window
