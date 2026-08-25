# miFitness

A local-first strength training log. Installable PWA — your training history is
a SQLite database living in this browser, with no backend and no account.

## Features

- **Log a workout in two taps** — start empty or from a routine, and every set
  row is pre-filled with what you did last time. Weight, reps, RPE, warm-up
  flag, and a tick to mark the set done.
- **Routines** — reusable templates with target sets and reps; starting one
  pre-fills the whole session. Any finished workout can be saved back as a
  routine.
- **Rest timer** — per-exercise durations, ±15 s, vibration and an optional
  tone. It counts against a wall-clock deadline, so a backgrounded tab comes
  back with the right number instead of a frozen one.
- **Personal records** — heaviest set, best estimated 1RM (Epley) and best set
  volume, with a toast the moment you beat one.
- **Progress** — weekly volume bars, a muscle-group split donut, an estimated
  1RM trend per exercise and a body-weight chart. Charts are hand-rolled SVG
  on a colour-blind-validated palette, so they work offline and read correctly
  in both themes.
- **Exercise library** — 38 seeded movements plus your own, searchable and
  filterable, each with its full history. Exercises with logged sets are
  archived rather than deleted, so history never develops holes.
- **kg or lb** — everything is stored in kilograms and converted for display,
  so switching units never rewrites your data.
- **Yours to keep** — export the raw `.sqlite` file or a readable JSON
  snapshot; import a backup to restore or move device.

## Architecture

No build step, no framework, no CDN.

| File | Responsibility |
|---|---|
| `js/db.js` | SQLite schema, migrations and every query |
| `js/stats.js` | Pure training maths — 1RM, volume, streaks, plate loading |
| `js/charts.js` | Hand-rolled SVG charts and the accessible table view |
| `js/ui.js` | Element helpers, icons, toasts, promise-based dialogs |
| `js/app.js` | Views and wiring |
| `vendor/` | sql.js, vendored locally so the app is genuinely offline |

The database is persisted as a single blob in IndexedDB. Writes are debounced;
`flush()` forces a write at the points where durability matters (starting or
finishing a workout, deleting, unloading the page).

`PRAGMA user_version` drives migrations. A database from the original
prototype upgrades in place: the new columns and tables are added, its logged
sets are marked complete, and each session's exercise list is rebuilt from the
sets it contains.

## Development

Serve the repo root with any static server and open `/miFitness/`:

```sh
python3 -m http.server 8000
```

Run the tests (pure logic plus the SQLite layer via `fake-indexeddb`):

```sh
npm run test:mifitness
```
