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
- **English and French** — a toggle at the top of Settings switches every
  label, including the muscle-group and equipment vocabulary and the names of
  the seeded exercises and starter routines. First run follows the browser's
  language.
- **kg or lb** — everything is stored in kilograms and converted for display,
  so switching units never rewrites your data.
- **Yours to keep** — export the raw `.sqlite` file or a readable JSON
  snapshot; import a backup to restore or move device.

## Architecture

No build step, no framework, no CDN.

| File | Responsibility |
|---|---|
| `js/db.js` | SQLite schema, migrations and every query |
| `js/i18n.js` | English and French catalogs, plurals, seeded-name lookup |
| `js/stats.js` | Pure training maths — 1RM, volume, streaks, plate loading |
| `js/charts.js` | Hand-rolled SVG charts and the accessible table view |
| `js/ui.js` | Element helpers, icons, toasts, promise-based dialogs |
| `js/app.js` | Views and wiring |
| `vendor/` | sql.js, vendored locally so the app is genuinely offline |

The database is persisted as a single blob in IndexedDB. Writes are debounced;
`flush()` forces a write at the points where durability matters (starting or
finishing a workout, deleting, unloading the page).

### Localization

`js/i18n.js` holds flat dotted keys with `{placeholder}` interpolation. Entries
written as `{ one, other }` are selected with `Intl.PluralRules`, so French
gets its own rule — zero is singular there — and any sentence whose wording
changes with a count keeps the whole clause inside the plural entry rather than
gluing a translated fragment onto a fixed tail.

Static markup carries `data-i18n` attributes that are refilled whenever the
locale changes; every view re-renders from the database, so nothing else is
needed to repaint the app in the other language.

Data stays canonical. Muscle groups and equipment are stored as English enum
values and translated only for display, so an export opens the same way in
either language. Seeded exercises and starter routines have stable slug ids and
a French display name, used **only while the stored text is still exactly what
the seed wrote** — the moment you rename one, your wording wins in both
languages. Exercise search matches the name you can see as well as the stored
one, and ignores accents, so "traction", "elevation" and "Pull-Up" all find
their row.

Numbers keep a `.` decimal separator in both languages: weights are typed into
`<input type="number">`, which only accepts a dot, and a display that disagreed
with the input beside it would read as a bug. Dates, times and month names do
follow the locale, keeping the regional variant when the browser has one
(a `fr-CA` browser keeps Canadian formatting).

`PRAGMA user_version` drives migrations. A database from the original
prototype upgrades in place: the new columns and tables are added, its logged
sets are marked complete, and each session's exercise list is rebuilt from the
sets it contains.

## Development

Serve the repo root with any static server and open `/miFitness/`:

```sh
python3 -m http.server 8000
```

Run the tests (pure logic, the SQLite layer via `fake-indexeddb`, and the
translation catalogs — including a structural check that both languages use
the same placeholders, and that every seeded row has a French name):

```sh
npm run test:mifitness
```
