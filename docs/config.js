// Address of the deployed Cloudflare Worker (see README.md).
// The local dev server (npm run dev) always uses its own /api instead.
window.NOMINEES_API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? "/api"
  : "https://steam-nominees.therealcosmo.workers.dev";
