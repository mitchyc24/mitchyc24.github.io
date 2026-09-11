# Observatory — Chromecast dashboard

Static Cast receiver at `host/index.html`, fed by `host/data/data.json`, which a
GitHub Actions job rebuilds every 15 minutes and publishes with the site.

## Repo layout

```
.github/workflows/dashboard-data.yml   cron + Pages deploy (no commits)
.github/scripts/build_data.py          fetches news, on-this-day, GEO belt, markets
host/index.html                        the receiver
host/remote.html                       phone remote (placeholder for v2)
host/assets/earth_day_2k.jpg           textures (three.js examples, MIT)
host/assets/earth_night_2k.png
host/data/data.json                    sample; overwritten at build time, never committed with live data
```

## One-time setup

1. Repo → Settings → Pages → **Source: GitHub Actions** (not "Deploy from a branch").
2. Push to `main`. The workflow runs on push, on the 15-minute cron, and from the Actions tab (Run workflow).
3. The Cast console receiver URL stays `https://mitchyc24.github.io/host/`.
4. Open `https://mitchyc24.github.io/host/?dev` in a desktop Chrome to preview without a Chromecast.

## Data flow

Actions job (slow / keyed / no-CORS sources) → `data.json`:
GDELT GEO + BBC/CBC/Al Jazeera RSS (geocoded by keyword), Wikipedia on-this-day,
Celestrak GEO group propagated with sgp4, CoinGecko + Frankfurter.
If a source fails, its last-good block is carried over and flagged `stale`.

Receiver (fast, CORS-friendly, keyless) fetches directly:
wheretheiss.at (10 s), USGS M2.5+ day feed (5 min), NOAA SWPC Kp + solar wind (10 min),
Open-Meteo for home weather (15 min), Wikimedia EventStreams edits (live, throttled).

## Notes

- Scheduled workflows are disabled by GitHub after 60 days without a push. Push something occasionally.
- The receiver reloads itself every 12 h and caps the render loop at 30 fps.
- Everything tunable is in the `CFG` block at the top of `index.html` (home location, cadence, layers).
