// Local dev server: serves docs/ and routes /api to the worker, same as production.
//   node dev/serve.mjs   ->  http://localhost:8787
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../worker/worker.js";

const ROOT = fileURLToPath(new URL("../docs/", import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    const r = await worker.fetch(new Request(url, { method: req.method }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, rel.endsWith("/") ? rel + "index.html" : rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
