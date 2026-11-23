// Steam Awards Nominees Card: fetches a nominations share link through the
// worker (see worker/worker.js) and draws an awards-show style card on a canvas.

const API = window.NOMINEES_API || "/api";

// Steam category IDs -> names, in Steam's display order. The share page only
// carries IDs, so add a block here when a new year's categories are announced.
const CATEGORIES = {
  2026: [
    [150, "Hall of Fame"],
    [151, "Game of the Year"],
    [152, "VR Game of the Year"],
    [153, "Labor of Love"],
    [154, "Best Handheld Game"],
    [155, "Just Five More Minutes"],
    [156, "Defies Description"],
    [157, "This Is My Job Now"],
    [158, "Better With Friends"],
    [159, "Outstanding Visual Style"],
    [160, "Best Game You Suck At"],
    [161, "Best Soundtrack"],
    [162, "Outstanding Story-Rich Game"],
    [163, "Sit Back and Relax"],
  ],
};
const GOTY = "Game of the Year";

const C = {
  bg: "#050505", gold: "#d9b46a", goldHi: "#f4dc9e", goldLo: "#8a6a2e",
  ink: "#f3efe6", mute: "#9c958a", frame: "#0d0c0a",
};
const W = 1600, SCALE = 2, PAD_X = 64, PAD_T = 56, PAD_B = 44;
const COLS = 7, GAP_X = 22, GAP_Y = 34;

const $ = id => document.getElementById(id);
let current = null; // { blob, url, year }

// ---------- data ----------

function tidyName(name) {
  if (name === name.toUpperCase() && /[A-Z]/.test(name)) {
    const small = new Set(["of", "the", "and", "a", "an", "in", "on", "to", "for"]);
    name = name.toLowerCase().split(" ")
      .map((w, i) => (i && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
  }
  if (name.length > 34) {
    for (const sep of [": ", " - ", " – "]) if (name.includes(sep)) return name.split(sep)[0];
  }
  return name;
}

function buildTiles(data) {
  const byCat = new Map(data.nominations.map(n => [n.category_id, n]));
  const cats = CATEGORIES[data.year]
    || data.nominations.map(n => [n.category_id, `Category ${n.category_id}`]);
  const known = new Set(cats.map(c => c[0]));
  for (const n of data.nominations) if (!known.has(n.category_id)) cats.push([n.category_id, `Category ${n.category_id}`]);

  return cats.map(([id, category]) => {
    const n = byCat.get(id);
    if (!n || n.skipped) return { category, name: "Skipped", art: null, skipped: true };
    return {
      category,
      name: tidyName(n.name || `App ${n.appid}`),
      art: n.art,
      goty: category === GOTY,
    };
  });
}

// ---------- drawing helpers ----------

function spacedWidth(ctx, text, sp) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width;
  return w + sp * Math.max(0, [...text].length - 1);
}

function drawSpaced(ctx, text, x, y, sp) { // left-aligned at x
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + sp;
  }
  return x - sp;
}

function drawSpacedCentered(ctx, text, cx, y, sp) {
  drawSpaced(ctx, text, cx - spacedWidth(ctx, text, sp) / 2, y, sp);
}

// Wrap into lines no wider than maxW, balancing two-line splits like CSS text-wrap: balance.
function wrap(measure, text, maxW) {
  if (measure(text) <= maxW) return [text];
  const words = text.split(" ");
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    const m = Math.max(measure(a), measure(b));
    if (m <= maxW && (!best || m < best.m)) best = { m, lines: [a, b] };
  }
  if (best) return best.lines;
  const lines = []; let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (line && measure(t) > maxW) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function radialGlow(ctx, cx, cy, rx, ry, alpha, size) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(217,180,106,${alpha})`);
  g.addColorStop(0.7, "rgba(217,180,106,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-size, -size * (rx / ry), size * 2, size * 2 * (rx / ry));
  ctx.restore();
}

function drawCover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / r, sh = h / r;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function drawEmpty(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = "#0d0c0a"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#121110"; ctx.lineWidth = 12 / Math.SQRT2 * 1.0;
  for (let d = -h; d < w + h; d += 24 / Math.SQRT2 * 1.414) {
    ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d - h, y + h); ctx.stroke();
  }
  ctx.restore();
  const cx = x + w / 2, cy = y + h / 2;
  ctx.fillStyle = C.goldLo;
  ctx.fillRect(cx - 17, cy - 22, 34, 1);
  ctx.fillRect(cx - 17, cy + 21, 34, 1);
  ctx.font = "400 14px Oswald"; ctx.fillStyle = C.mute; ctx.textBaseline = "middle";
  drawSpacedCentered(ctx, "NO NOMINEE", cx, cy, 14 * 0.3);
}

function loadImage(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadFonts() {
  const specs = ["700 96px Oswald", "600 15px Oswald", "500 18px Oswald", "400 22px Oswald",
    "600 15px Inter", "500 15px Inter"];
  await Promise.all(specs.map(s => document.fonts.load(s).catch(() => {})));
}

// ---------- the card ----------

async function drawCard(data) {
  const tiles = buildTiles(data);
  const [images] = await Promise.all([Promise.all(tiles.map(t => loadImage(t.art))), loadFonts()]);

  const colW = (W - PAD_X * 2 - GAP_X * (COLS - 1)) / COLS;
  const frameH = colW * 1.5;
  const rows = Math.ceil(tiles.length / COLS);

  // Measure name wrapping first so row heights are known.
  const m = document.createElement("canvas").getContext("2d");
  m.font = "600 15px Inter";
  const nameLines = tiles.map(t => wrap(s => m.measureText(s).width, t.name, colW));
  m.font = "600 15px Oswald";
  const catSp = 15 * 0.14;
  const catLines = tiles.map(t => wrap(s => spacedWidth(m, s, catSp), t.category.toUpperCase(), colW));
  const rowH = [];
  for (let r = 0; r < rows; r++) {
    const maxLines = Math.max(1, ...nameLines.slice(r * COLS, r * COLS + COLS).map(l => l.length));
    rowH.push(42 + 10 + frameH + 12 + maxLines * 19.5);
  }

  const headerH = 27 + 14 + 96 + 10 + 33 + 22 + 9;
  const gridTop = PAD_T + headerH + 40;
  const gridH = rowH.reduce((a, b) => a + b, 0) + GAP_Y * (rows - 1);
  const H = Math.ceil(gridTop + gridH + 42 + 21 + PAD_B);

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  radialGlow(ctx, W / 2, -120, 1100, 520, 0.22, W);
  radialGlow(ctx, W / 2, H + 120, 900, 600, 0.10, W);

  // Header
  const cx = W / 2;
  let y = PAD_T;
  ctx.textBaseline = "middle";
  ctx.font = "500 18px Oswald"; ctx.fillStyle = C.gold;
  let kicker = `THE STEAM AWARDS ${data.year}`;
  if (data.year === 2026) kicker += "  ·  10TH ANNIVERSARY";
  drawSpacedCentered(ctx, kicker, cx, y + 13.5, 18 * 0.42);
  y += 27 + 14;

  ctx.font = "700 96px Oswald";
  const h1 = ctx.createLinearGradient(0, y, 0, y + 96);
  h1.addColorStop(0, C.goldHi); h1.addColorStop(0.55, C.gold); h1.addColorStop(1, C.goldLo);
  ctx.fillStyle = h1;
  drawSpacedCentered(ctx, "MY NOMINEES", cx, y + 50, 96 * 0.04);
  y += 96 + 10;

  ctx.font = "400 22px Oswald"; ctx.fillStyle = C.ink;
  drawSpacedCentered(ctx, data.nominator.toUpperCase(), cx, y + 16.5, 22 * 0.3);
  y += 33 + 22;

  const ruleY = y + 4.5;
  for (const dir of [-1, 1]) {
    const x0 = cx + dir * 18, x1 = cx + dir * (18 + 220);
    const g = ctx.createLinearGradient(x1, 0, x0, 0);
    g.addColorStop(0, "rgba(217,180,106,0)"); g.addColorStop(1, C.gold);
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x1), ruleY - 0.5, 220, 1);
  }
  ctx.save(); ctx.translate(cx, ruleY); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = C.gold; ctx.fillRect(-4.5, -4.5, 9, 9); ctx.restore();

  // Grid
  let rowTop = gridTop;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (i >= tiles.length) break;
      const t = tiles[i];
      const x = PAD_X + c * (colW + GAP_X);
      const tcx = x + colW / 2;

      // Category label, bottom-aligned in a 42px box
      ctx.font = "600 15px Oswald"; ctx.fillStyle = t.goty ? C.goldHi : C.gold;
      const cl = catLines[i];
      cl.forEach((line, k) => {
        const ly = rowTop + 42 - (cl.length - k) * 18 + 9;
        drawSpacedCentered(ctx, line, tcx, ly, catSp);
      });

      // Frame
      const fy = rowTop + 42 + 10;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
      ctx.fillStyle = C.frame; ctx.fillRect(x, fy, colW, frameH);
      ctx.restore();
      if (t.goty) {
        ctx.save();
        ctx.shadowColor = "rgba(217,180,106,.45)"; ctx.shadowBlur = 34;
        ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, fy + 1, colW - 2, frameH - 2);
        ctx.restore();
      } else {
        ctx.strokeStyle = "rgba(217,180,106,.55)"; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, fy + 0.5, colW - 1, frameH - 1);
      }
      const inset = (t.goty ? 2 : 1) + 5;
      const ix = x + inset, iy = fy + inset, iw = colW - inset * 2, ih = frameH - inset * 2;
      if (images[i]) drawCover(ctx, images[i], ix, iy, iw, ih);
      else drawEmpty(ctx, ix, iy, iw, ih);

      // Game name
      ctx.font = t.skipped ? "500 15px Inter" : "600 15px Inter";
      ctx.fillStyle = t.skipped ? C.mute : C.ink;
      ctx.textAlign = "center";
      nameLines[i].forEach((line, k) => ctx.fillText(line, tcx, fy + frameH + 12 + 9.75 + k * 19.5));
      ctx.textAlign = "left";
    }
    rowTop += rowH[r] + GAP_Y;
  }

  // Footer
  const fyMid = gridTop + gridH + 42 + 10.5;
  ctx.font = "400 14px Oswald";
  const sp = 14 * 0.32;
  const parts = data.votingPast
    ? [["WINNERS ANNOUNCED AT ", C.mute], ["STORE.STEAMPOWERED.COM/STEAMAWARDS", C.gold]]
    : data.votingOpen
      ? [["VOTE NOW DURING THE ", C.mute], ["STEAM WINTER SALE", C.gold]]
      : [["VOTING OPENS DURING THE ", C.mute], ["STEAM WINTER SALE", C.gold]];
  const total = parts.reduce((a, [s]) => a + spacedWidth(ctx, s, sp) + sp, -sp);
  let fx = cx - total / 2;
  for (const [s, col] of parts) { ctx.fillStyle = col; fx = drawSpaced(ctx, s, fx, fyMid, sp) + sp; }

  return canvas;
}

// ---------- UI ----------

function setStatus(msg, isError = false) {
  $("status").textContent = msg;
  $("status").classList.toggle("error", isError);
}

async function run(link) {
  $("go").disabled = true;
  $("result").hidden = true;
  setStatus("Reading your nominations from Steam…");
  try {
    if (API === "/api" && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      throw new Error("This site isn't connected to its Steam reader yet. Check back soon!");
    }
    const res = await fetch(`${API}?url=${encodeURIComponent(link)}`);
    const data = await res.json().catch(() => ({ error: `Unexpected response (${res.status}).` }));
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status}).`);

    setStatus("Drawing your card…");
    const canvas = await drawCard(data);
    const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
    if (current?.url) URL.revokeObjectURL(current.url);
    current = { blob, url: URL.createObjectURL(blob), year: data.year, nominator: data.nominator };

    $("preview").src = current.url;
    $("result").hidden = false;
    const file = new File([blob], fileName(), { type: "image/png" });
    $("share").hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    $("copy").hidden = !(navigator.clipboard && window.ClipboardItem);
    setStatus("");
  } catch (e) {
    setStatus(e.message || String(e), true);
  } finally {
    $("go").disabled = false;
  }
}

function fileName() {
  return `steam-awards-${current?.year || ""}-nominees.png`;
}

$("form").addEventListener("submit", e => {
  e.preventDefault();
  run($("url").value.trim());
});

$("download").addEventListener("click", () => {
  if (!current) return;
  const a = document.createElement("a");
  a.href = current.url; a.download = fileName();
  document.body.appendChild(a); a.click(); a.remove();
});

$("copy").addEventListener("click", async () => {
  if (!current) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": current.blob })]);
    setStatus("Copied to clipboard.");
  } catch {
    setStatus("Your browser blocked copying. Use Download instead.", true);
  }
});

$("share").addEventListener("click", async () => {
  if (!current) return;
  try {
    await navigator.share({
      files: [new File([current.blob], fileName(), { type: "image/png" })],
      title: `My Steam Awards ${current.year} nominees`,
    });
  } catch { /* user cancelled */ }
});
