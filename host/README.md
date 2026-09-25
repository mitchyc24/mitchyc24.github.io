# Observatory — Chromecast dashboard

Static Cast receiver at `host/index.html`, fed by `host/data/data.json`, which a
GitHub Actions job rebuilds every 15 minutes and publishes with the site. A phone
page, `host/remote.html`, casts it and controls what it shows.

Observatory is one of the apps on the [miApps hub](https://mitchyc24.github.io/). It lives in `host/` rather
than `apps/observatory/` because `https://mitchyc24.github.io/host/` is the receiver URL registered for Cast app
`FB21C379`; moving it means updating that URL in the Google Cast SDK Developer Console first.

## Repo layout

```
.github/workflows/dashboard-data.yml   cron + Pages deploy (no commits)
.github/workflows/check-data.yml       runs the builder on a branch when it changes; one warning per dead feed
.github/scripts/build_data.py          fetches news, on-this-day, GEO belt, markets
host/index.html                        the receiver (the TV)
host/remote.html, remote.js            the controls: Cast button, language, news, stats, theme
host/settings.js                       settings shared by both: defaults, validation, every UI string
host/cast.html                         old launcher address; redirects to remote.html
host/assets/earth_day_2k.jpg           textures (three.js examples, MIT)
host/assets/earth_night_2k.png
host/data/data.json                    sample; overwritten at build time, never committed with live data
```

## One-time setup

1. Repo → Settings → Pages → **Source: GitHub Actions** (not "Deploy from a branch").
2. Push to `main`. The workflow runs on push, on the 15-minute cron, and from the Actions tab (Run workflow).
   It deploys the whole site, hub and every app included, not only the dashboard.
3. The Cast console receiver URL stays `https://mitchyc24.github.io/host/`.
4. Open `https://mitchyc24.github.io/host/?dev` in a desktop Chrome to preview without a Chromecast.

## Controls

`remote.html` (the QR code on the TV, and the hub's *Cast & control* button) has four sections:

- **Language**: English, Français, Español or Deutsch, for the TV and the controls page.
- **News**: which languages headlines may be in, local news (off, Canada, or Ottawa–Gatineau, which also
  includes the Canada sources), the share of local headlines (25, 50 or 75 %), and every source with an on/off switch.
- **Stats**: 16 to choose from, up to 8 on at once. The TV shows them in the order listed.
- **Display**: day-and-night theme (light between sunrise and sunset at home), always light, or always dark.

How a change reaches the screen:

- Every change is saved on the phone (`localStorage`, key `observatory.settings`).
- With a Cast session, it is sent to the TV on the custom channel `urn:x-cast:io.github.mitchyc24.observatory`.
  The phone sends `{type: "hello"}` on connecting and `{type: "settings", settings}` on every change. The TV answers
  with `{type: "state", settings, stored}` and broadcasts it after each change, so every connected phone stays in step.
  A TV that has never been set up (`stored: false`) takes the connecting phone's settings; otherwise the phone
  shows what the TV has.
- The TV keeps its settings in its own `localStorage`, so it comes back the same after a relaunch.
- A `?dev` preview in the same browser shares that storage and follows the controls live.
- Casting from a web page needs Chrome on Android or a desktop. On an iPhone the controls still save, but can't
  reach the TV; the page says so.

`?theme=light|dark` in the receiver URL still overrides the theme setting.

## News sources and balance

World headlines come from news agencies and public broadcasters, several per language and from several
countries: AP and Reuters (via Google News search feeds, the only keyless source of either wire), BBC, DW, France 24,
RFI, NPR, CBC, ORF, SRF, tagesschau, Deutschlandfunk and UN News. State-funded outlets (Al Jazeera) are listed but
start switched off. A source can list several feed URLs; the first that answers wins. CBC falls back to a Google
News feed limited to its own section when cbc.ca doesn't respond, and DW's French service, which has no RSS feed,
comes through the same kind of feed.

Balance comes from rotation, not from judging stories. The TV picks the next headline card from whichever enabled
source has had the fewest cards so far. The ticker takes headlines one source at a time, newest first. Every
headline shows its source. Local headlines are spread through the ticker at the chosen share, and are favoured
for cards at the same rate when one faces the camera.

The builder keeps the newest 12 items per source from the last 48 hours and drops duplicate titles. It places each
headline by the first place it names (a city beats a country beats a continent), matching names and adjectives in
all four languages. Local headlines that name no place go to their region's centre; world headlines that name none
still run in the ticker. `data.json` lists every source with its item count and `ok` flag, and the controls show
both.

## Extending

- **A source**: add a `source(...)` line to `NEWS_SOURCES` in `build_data.py`. Push to a branch, and the
  *Check data sources* workflow shows whether it parsed and how many items it gave.
- **A region**: add it to `REGIONS` in `build_data.py` and `settings.js` (plus `REGION_PARENTS` if it sits inside
  another), give it a `region.<id>` string in each language, and give its local sources that `region`.
- **A language**: add it to `LANGS` in `settings.js` with a full string table, add sources in that language, add
  place names to `ALIASES` and `STEMS` in `build_data.py`, and add it to the on-this-day loop.
- **A stat**: add its id to `STATS` in `settings.js`, a `name.`, `desc.` and label string in each language, and a
  renderer to `STAT` in `index.html`.

## Data flow

Actions job (slow / keyed / no-CORS sources) → `data.json`:
news feeds (above, fetched in parallel, geocoded by keyword), Wikipedia on-this-day in each language,
Celestrak GEO group propagated with sgp4, CoinGecko + Frankfurter.
If a source fails, its last-good block is carried over and flagged `stale`.

Receiver (fast, CORS-friendly, keyless) fetches directly:
wheretheiss.at (10 s), USGS M2.5+ day feed (5 min), NOAA SWPC Kp + solar wind (10 min),
Open-Meteo for home weather (15 min) and air quality (30 min), Wikimedia EventStreams edits (live, throttled).
Moon phase, year progress and world clocks are computed on the TV.

## Notes

- Scheduled workflows are disabled by GitHub after 60 days without a push. Push something occasionally.
- The receiver reloads itself every 12 h and caps the render loop at 30 fps.
- Everything tunable is in the `CFG` block at the top of `index.html` (home location, cadence, layers).
