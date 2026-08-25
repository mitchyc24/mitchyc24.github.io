# miApps 🚀

Welcome to the **miApps** monorepo!

This repository hosts a collection of Progressive Web Applications (PWAs) by Mitchell. The prefix "mi" is pronounced "my", representing a personalized suite of local-first tools.

## The Apps

Currently, the collection includes:

- **[miNotes](./miNotes/)**: A serverless, local-first Markdown note-taking PWA. Your files, your disk, your notes.
- **[miWork](./miWork/)**: A hierarchical Kanban task tracker with drag-and-drop, sub-tasks and analytics.
- **[miFitness](./miFitness/)**: A strength training log — routines, rest timers, personal records and progress charts, backed by SQLite in the browser.

## Architecture

This repository is structured as a monorepo containing multiple independent PWAs.

- **No Build Steps**: Each application is built using vanilla web technologies (HTML, CSS, JS) without complex build tools or bundlers.
- **Local-First**: The apps prioritize local storage and processing, utilizing modern Web APIs like the File System Access API.
- **GitHub Pages Ready**: The entire repository is served statically via GitHub Pages. The root `index.html` serves as a landing page linking to individual apps contained within their respective subdirectories.

## Development

To test the applications locally, you can use any static file server from the root of the repository.

```bash
python3 -m http.server 8000
```

Then, open `http://localhost:8000` in your browser. Navigating to `http://localhost:8000/miNotes/` will open the miNotes application.

## Deployment

Pushing to the main branch will automatically deploy the site via GitHub Pages to `https://mitchyc24.github.io/`.
