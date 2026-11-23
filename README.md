# Steam Awards Nominees Card

Paste a Steam Awards nominations share link and get an awards-show style image of
your nominees, ready to download, copy, or share.

```
docs/        The website (served by GitHub Pages)
worker/      Cloudflare Worker that reads the share link from Steam
dev/         Local dev server that runs both together
```

## How it works

1. The site sends the share link to the worker.
2. The worker fetches the share page from `store.steampowered.com` and reads the
   nominations from the page's embedded data. Then it looks up each game's name and
   portrait art with Steam's `IStoreBrowseService/GetItems` API and returns JSON.
3. The site draws the card on a `<canvas>` (3200 px wide) and exports a PNG.

The worker is needed because Steam doesn't let browsers read those pages from
another site (no CORS headers). The game art CDN does allow it, so drawing and
exporting the image in the browser works fine.
The worker only accepts `store.steampowered.com/steamawards/nominations/...` links.

## Run locally

```bash
npm run dev
```

Then open http://localhost:8787. No install step is needed; it uses Node 18+ built-ins.

## Deploy

### 1. The worker (Cloudflare, free plan)

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

Note the URL it prints, e.g. `https://steam-nominees.<your-subdomain>.workers.dev`.

### 2. The site (GitHub Pages)

1. Put the worker URL in `docs/config.js`:
   ```js
   window.NOMINEES_API = "https://steam-nominees.<your-subdomain>.workers.dev";
   ```
2. Push this repo to GitHub.
3. In the repo, go to **Settings → Pages**, choose **Deploy from a branch**, branch
   `main`, folder `/docs`.

## New year, new categories

The share page only includes category **IDs**. The names live in `CATEGORIES` at the
top of `docs/app.js`. When Steam announces a new year's awards, open any
nominations page in a browser and add the names in page order. The first ID is the
lowest one in that year's `rgSharedNominations`. If a year is missing, the card still
renders, with "Category 150"-style labels.
