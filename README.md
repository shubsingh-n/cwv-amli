# CWV Dashboard (AMLI)

Core Web Vitals tracker for competitor URL monitoring. Fetches field CWV data from the [Chrome UX Report API](https://developer.chrome.com/docs/crux/api/) and stores results in MongoDB.

## Setup

1. Copy `.env.example` to `.env` and fill in values:
   - `MONGODB_URI` — MongoDB connection string
   - `PAGESPEED_API_KEY` or `CRUX_API_KEY` — Google API key with **Chrome UX Report API** enabled

2. Install and run:

```bash
npm install
npm run dev
```

3. Open `http://localhost:3000`

## Scripts

- `node seed.js` — seed companies/URLs from `url/url.csv` (requires `MONGODB_URI` in `.env`)
- `node inspect_api.js` — test CrUX API response for a sample URL

## Features

- Daily CWV fetch (skips already-fetched URLs for today)
- Right-click a URL row to re-fetch that URL only
- Sort columns, filter by pass/fail and origin/traffic source
- Good URL (Origin) and Good URL (Traffic) summary stats per date/device
