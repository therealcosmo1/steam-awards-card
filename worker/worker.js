// Cloudflare Worker: reads a Steam Awards nominations share link and returns
// the nominations as JSON with CORS enabled, so the static GitHub Pages site
// can use it. It only ever fetches Steam's own share pages and item API.
//
//   GET /?url=https://store.steampowered.com/steamawards/nominations/2026/<steamid>?k=<key>

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)";
const CDN = "https://shared.akamai.steamstatic.com/store_item_assets/";
const SKIP_APPID = 2215130; // Steam's "Steam Awards Skip Category" placeholder app

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

function parseShareUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== "store.steampowered.com") return null;
  const m = u.pathname.match(/^\/steamawards\/nominations\/(\d{4})\/(\d{17})\/?$/);
  if (!m) return null;
  const k = u.searchParams.get("k");
  if (!k || !/^\d+$/.test(k)) return null;
  return `https://store.steampowered.com/steamawards/nominations/${m[1]}/${m[2]}?k=${k}&l=english`;
}

function pickArt(item) {
  const a = item?.assets || {};
  if (!a.asset_url_format) return null;
  for (const key of ["library_capsule_2x", "library_capsule", "main_capsule", "header"]) {
    if (a[key]) return CDN + a.asset_url_format.replace("${FILENAME}", a[key]);
  }
  return null;
}

async function handle(request) {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (request.method !== "GET") return json({ error: "Use GET." }, 405);

  const share = parseShareUrl(new URL(request.url).searchParams.get("url"));
  if (!share) {
    return json({ error: "That doesn't look like a Steam Awards nominations share link." }, 400);
  }

  const pageRes = await fetch(share, { headers: { "User-Agent": UA } });
  if (!pageRes.ok) return json({ error: `Steam returned ${pageRes.status} for that link.` }, 502);
  const page = await pageRes.text();

  const m = page.match(/<script type="application\/json" id="valve-ssr-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return json({ error: "Couldn't read Steam's page data (did the page layout change?)." }, 502);

  let d = null;
  for (const chunk of JSON.parse(m[1]).loaderData || []) {
    const v = typeof chunk === "string" ? JSON.parse(chunk) : chunk;
    if (v && typeof v === "object" && "rgSharedNominations" in v) { d = v; break; }
  }
  if (!d || !d.sharedNominator) {
    return json({ error: "No nominations found. The link may have expired or been regenerated." }, 404);
  }

  const appids = [...new Set(d.rgSharedNominations.map(n => n.appid).filter(a => a !== SKIP_APPID))];
  const items = {};
  if (appids.length) {
    const q = {
      ids: appids.map(appid => ({ appid })),
      context: { language: "english", country_code: "US" },
      data_request: { include_assets: true },
    };
    const r = await fetch(
      "https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=" + encodeURIComponent(JSON.stringify(q)),
      { headers: { "User-Agent": UA } },
    );
    if (r.ok) {
      for (const it of (await r.json())?.response?.store_items || []) items[it.appid] = it;
    }
  }

  return json({
    year: d.nYear,
    nominator: d.sharedNominator.strPersonaName,
    votingOpen: !!d.bVotingOpen,
    votingPast: !!d.bVotingPast,
    nominations: d.rgSharedNominations.map(n => ({
      category_id: n.category_id,
      appid: n.appid,
      skipped: n.appid === SKIP_APPID,
      name: items[n.appid]?.name ?? null,
      art: pickArt(items[n.appid]),
    })),
  }, 200, { "Cache-Control": "public, max-age=300" });
}

export default {
  async fetch(request) {
    try {
      return await handle(request);
    } catch (e) {
      return json({ error: "Something went wrong talking to Steam: " + (e?.message || e) }, 500);
    }
  },
};
