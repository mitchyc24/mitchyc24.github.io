# miWork

A local-first, hierarchical Kanban task tracker. Installable PWA — everything
lives in your browser's IndexedDB, no backend, fully offline.

## Features

- **Kanban board** — To Do / In Progress / Done, drag-and-drop with persisted
  ordering (SortableJS, vendored locally).
- **Infinite task hierarchy** — click any card to drill into its sub-tasks;
  breadcrumbs navigate back up. Every card shows a `done/total` sub-task badge
  so nesting is visible at a glance, plus a recursive completeness bar
  (a parent is as complete as the average of its children, all the way down).
- **Analytics** — KPI tiles (totals, completion rate, day streak), a status
  donut, completions-over-the-last-14-days bar chart, and per-top-level-task
  progress meters. Charts are hand-rolled SVG — no chart library, works offline.
- **Configurable** — theme (system/light/dark), six accent colors, three font
  families, comfortable/compact density, per-field visibility toggles,
  delete-confirmation toggle. All persisted.
- **Data portability** — export everything as JSON; import merges by task id.

## Development

No build step. Serve the repo root with any static server and open `/miWork/`.

Run tests (pure logic + IndexedDB layer via fake-indexeddb):

```sh
npm run test:miwork
```
