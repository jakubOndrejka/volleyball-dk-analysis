# Volleyball Danmark — League Tracker

A fast, modern web viewer for Danish volleyball league standings and schedules, built as a single-page static site on top of data scraped from [resultater.volleyball.dk](https://resultater.volleyball.dk).

## Leagues covered

| Category | League | PuljeId |
|----------|--------|---------|
| Women | 1. Division Kvinder, Øst | 4128 |
| Women | 2. Division Kvinder, Øst | 4125 |
| Women | Danmarksserie Damer, Sjælland | 4133 |
| Women | Serie 3 Damer, Sjælland | 4139 |
| Men | 1. Division Herrer, Øst | 4118 |
| Men | Danmarksserie Herrer, Sjælland | 4130 |
| Men | Serie 3 Herrer, Sjælland | 4132 |
| Mix | Mix 1, Sjælland | 4136 |
| Mix | Mix 2, Sjælland | 4137 |

## Features

- **Multi-league navigation** — grouped by Women / Men / Mix with a horizontally scrollable sub-tab bar, optimised for mobile
- **Standings table** — position, wins, losses, set ratio, and points for every team
- **Full schedule** — all fixtures for the season, grouped by date
- **Month filter** — quickly jump to a specific month
- **Team filter** — click any team in the standings to filter the schedule to their fixtures only
- **Venue links** — each match venue links to Google Maps
- **Team logos** — logos for all clubs, with automatic suffix matching (e.g. "KSV.3" reuses the KSV logo)
- **Dark / Light mode** — toggle with the sun/moon button, persisted in `localStorage`
- **Danish / English** — language toggle in the header, persisted in `localStorage`
- **Last league memory** — the site remembers which league you were viewing

## Getting started

### Prerequisites

- Node.js 18 or later (for the scraper)

### Install dependencies

```bash
npm install
```

### Fetch fresh data

The scraper fetches standings and fixtures for all 9 leagues from resultater.volleyball.dk and writes one JSON file per league:

```bash
npm run scrape
```

This produces `data/data-4128.json`, `data/data-4118.json`, etc. in the `data/` directory.

### View the site

Serve the project root with any static file server. The simplest option:

```bash
npm run serve
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

Alternatively, open `index.html` directly in a browser — note that `fetch()` calls require a server in most browsers (CORS restriction on `file://` URLs).

## Project structure

```
├── index.html          # Single-page app — all HTML, CSS, and JS
├── scraper.js          # Node.js scraper (cheerio) — writes data/*.json
├── package.json
├── logos/              # Team logo images
└── data/               # Generated data files (one per league)
```

## Keeping data up to date

Re-run `npm run scrape` whenever you want fresh standings and results. The scraper skips a league if it returns empty data to avoid overwriting good data with a failed fetch.

### Automatic updates with GitHub Pages

GitHub Actions refreshes the data daily. When standings or fixtures actually change, it commits the updated `data/*.json` files back to the repository. Timestamp-only changes are ignored.

To host the site for free, enable GitHub Pages in the repository settings:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and the `/ (root)` folder, then click **Save**.

The site will be available at `https://<github-user>.github.io/<repository-name>/` after GitHub Pages finishes publishing.

## Tech stack

- **Frontend** — vanilla HTML, CSS, and JavaScript (no framework or build step)
- **Scraper** — Node.js ES module using [cheerio](https://cheerio.js.org/) for HTML parsing
- **Data source** — [resultater.volleyball.dk](https://resultater.volleyball.dk) (Volleyball Danmark's official results system)
