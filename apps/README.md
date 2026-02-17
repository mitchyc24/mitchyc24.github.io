# SPACE - Single Page Apps Collectors Edition

A public repository of single page HTML applications, branded with Carroll Compute Inc.

## Overview

SPACE is a curated collection of self-contained single page applications. Each application is distributed as a single HTML file that can be downloaded and used offline.

## Structure

```
├── index.html              # Main SPACE application
├── branding/               # Carroll Compute Inc branding assets
│   ├── logo.svg           # Company logo
│   └── branding.json      # Color palette and typography
├── apps/                   # Single page applications
│   ├── manifest.json      # Apps metadata
│   └── [app-name]/        # Individual app folders
│       └── [app]-v[x.x.x].html  # Versioned app files
```

## Features

- **Card-based UI**: Browse applications in a clean, modern card layout
- **Hover Effects**: See detailed descriptions when hovering over cards
- **Version History**: Click the info (i) icon to view all versions of an app
- **Download**: Click on a card or the download button to get the HTML file
- **Carroll Compute Inc Branding**: Professional branding with custom colors and logo

## Adding New Applications

To add a new single page application to SPACE:

1. Create a new folder in `apps/` with your app name
2. Add your HTML file(s) following the naming convention: `[app-name]-v[version].html`
3. Update `apps/manifest.json` with your app's metadata:

```json
{
  "id": "my-app",
  "title": "My Amazing App",
  "description": "Short description for the card",
  "detailedDescription": "Longer description shown on hover",
  "image": "path/to/image or data URI",
  "versions": [
    {
      "version": "1.0.0",
      "date": "2026-02-17",
      "file": "apps/my-app/my-app-v1.0.0.html",
      "notes": "Initial release"
    }
  ],
  "currentVersion": "1.0.0"
}
```

## Branding

The application uses Carroll Compute Inc branding:

- **Primary Color**: #2563eb (Blue)
- **Secondary Color**: #7c3aed (Purple)
- **Font**: Inter
- **Logo**: Custom SVG with gradient

See `branding/branding.json` for complete branding specifications.

## Version Management

Each application can have multiple versions. When you update an app:

1. Create a new HTML file with the new version number
2. Add a new version entry to the app's `versions` array in `manifest.json`
3. Update the `currentVersion` field to the new version

Users can access previous versions through the version history modal.

## Development

To test locally:

```bash
# Start a local web server
python3 -m http.server 8000

# Open in browser
open http://localhost:8000
```

## License

All applications are provided as-is under their respective licenses.

© 2026 Carroll Compute Inc
