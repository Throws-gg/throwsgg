/**
 * generate-stills.ts — batch-render fake RaceWinCard PNGs for @throwsgg cold-start seeding
 *
 * One-time install:
 *   cd rps && npm i -D puppeteer tsx
 *   (Puppeteer downloads Chromium the first time — ~150MB, wait for it.)
 *
 * Run:
 *   npm run gen:stills
 *
 * Inputs:
 *   /Users/connorrawiri/Documents/RPS/marketing/x-growth-research/assets/fake-wins.json
 *     (shape: [{raceNumber, horseSlug, horseName, username, stake, odds, payout, timestamp}, ...])
 *
 * Outputs:
 *   /Users/connorrawiri/Documents/RPS/marketing/x-growth-research/assets/stills/
 *     {raceNumber}-{horseSlug}-16x9.png   (1200x675 — X landscape)
 *     {raceNumber}-{horseSlug}-1x1.png    (1080x1080 — IG/Reddit square)
 *     {raceNumber}-{horseSlug}-9x16.png   (1080x1920 — X video card / stories vertical)
 *
 * Why this doesn't import rps/components/racing/RaceWinCard.tsx:
 *   RaceWinCard is a "use client" React component that pulls in the app's Privy + Supabase
 *   graph via shared hooks/utilities. Booting the full Next app just to screenshot a card is
 *   the path Scout 2 recommended (spec-stills-render.md §4a), but it has env-miss issues and
 *   ~280MB Chromium already lives in puppeteer. This script reproduces the card's DOM inline
 *   (same 600×340 layout, same inline styles) so the render is self-contained and matches the
 *   product card visually.
 *
 * ⚠️  KEEP IN SYNC:
 *   This file mirrors rps/components/racing/RaceWinCard.tsx (the captured `<div ref={cardRef}>`
 *   at lines 118–298) and rps/components/racing/useHorseSpriteUrl.ts (sprite compositor at
 *   lines 29–56). If you edit either source, either mirror the change into renderPage() below
 *   OR (preferred) migrate this script to Scout 2's Approach A (symlink from a marketing tool
 *   package — see marketing/x-growth-research/spec-stills-render.md §4a).
 *
 * Design choices (from Scout 2 spec-stills-render.md):
 *   - 3 aspect sizes with letterbox for non-16:9 (don't stretch the card).
 *   - Letterbox background = product brand gradient (#0A0A0F / violet glow).
 *   - data-still-ready gate: screenshot only after logo + horse sprite have loaded.
 *   - Idempotent — skip existing output files unless FORCE=1 env is set.
 *
 * Horse stats (speed/stamina/form/consistency/career/last5) aren't in fake-wins.json — they're
 * synthesised deterministically from raceNumber + slug so the same input always produces the
 * same card. Plausible ranges match the prod horse pool.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { HORSE_IDENTITIES, type HorseIdentity, SPRITE } from "../lib/racing/constants";

async function fileToDataUrl(abs: string): Promise<string> {
  const buf = await fs.readFile(abs);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface FakeWin {
  raceNumber: number;
  horseSlug: string;
  horseName: string;
  username: string;
  stake: number;
  odds: number;
  payout: number;
  timestamp?: string;
}

interface HorseRenderData {
  name: string;
  slug: string;
  color: string;
  speed: number;
  stamina: number;
  form: number;
  consistency: number;
  careerRaces: number;
  careerWins: number;
  last5Results: number[];
  identity: HorseIdentity;
}

type AspectSize = {
  suffix: string;
  width: number;
  height: number;
  cardScale: number; // how much to scale the 600x340 card for this canvas
};

// Card is 600x340 internally (≈1.76:1). Scale so it fits inside each canvas with padding.
// Chosen to fill ~85% of the narrower fitting axis.
// 16x9 (1200x675):   min(1200/600, 675/340) * 0.9 = 1.79 — horizontally limited.
// 1x1 (1080x1080):   min(1080/600, 1080/340) * 0.85 = 1.53 — card centered, side padding.
// 9x16 (1080x1920):  1080/600 * 0.85 = 1.53 — same card width, vertical letterbox.
const SIZES: AspectSize[] = [
  { suffix: "16x9", width: 1200, height: 675, cardScale: 1.79 },
  { suffix: "1x1", width: 1080, height: 1080, cardScale: 1.53 },
  { suffix: "9x16", width: 1080, height: 1920, cardScale: 1.53 },
];

// ── Paths ────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");
const MARKETING_ROOT = path.resolve(REPO_ROOT, "..", "marketing", "x-growth-research");
const INPUT_JSON = path.join(MARKETING_ROOT, "assets", "fake-wins.json");
const OUTPUT_DIR = path.join(MARKETING_ROOT, "assets", "stills");

// ── Deterministic pseudo-random (FNV-1a) ─────────────────────────────────────

function hash32(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seededRand(seed: string, salt: string, min: number, max: number): number {
  const h = hash32(`${seed}:${salt}`);
  return min + (h % (max - min + 1));
}

// ── Horse render-data hydration ──────────────────────────────────────────────

const HORSE_COLORS: Record<string, string> = {
  "thunder-edge": "#F59E0B",
  "iron-phantom": "#64748B",
  "crown-jewel": "#EAB308",
  "storm-protocol": "#06B6D4",
  "dark-reign": "#7C3AED",
  "silver-ghost": "#CBD5E1",
  "night-fury": "#334155",
  "volt-runner": "#22D3EE",
  "rogue-wave": "#3B82F6",
  "dust-devil": "#CA8A04",
  "shadow-mint": "#10B981",
  "flash-crash": "#EF4444",
  "paper-hands": "#94A3B8",
  "rug-pull": "#DC2626",
  "dead-cat": "#A78BFA",
  "moon-shot": "#EC4899",
};

function hydrateHorse(slug: string, name: string, raceNumber: number): HorseRenderData {
  const identity = HORSE_IDENTITIES[slug];
  if (!identity) {
    throw new Error(
      `Unknown horse slug: "${slug}". Must be one of: ${Object.keys(HORSE_IDENTITIES).join(", ")}`
    );
  }
  const seed = `${slug}-${raceNumber}`;
  const careerRaces = seededRand(seed, "races", 40, 140);
  const careerWins = Math.round(careerRaces * (seededRand(seed, "winpct", 10, 28) / 100));
  const last5: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = seededRand(seed, `l5-${i}`, 1, 100);
    if (r <= 25) last5.push(1);
    else if (r <= 50) last5.push(2);
    else if (r <= 70) last5.push(3);
    else last5.push(seededRand(seed, `l5f-${i}`, 4, 8));
  }
  return {
    name,
    slug,
    color: HORSE_COLORS[slug] ?? "#8B5CF6",
    speed: seededRand(seed, "speed", 68, 92),
    stamina: seededRand(seed, "stamina", 65, 90),
    form: seededRand(seed, "form", 55, 95),
    consistency: seededRand(seed, "consistency", 60, 92),
    careerRaces,
    careerWins,
    last5Results: last5,
    identity,
  };
}

function synthesiseRaceMeta(raceNumber: number) {
  const distances = [1200, 1400, 1600, 1800, 2000] as const;
  const grounds = ["firm", "good", "soft", "heavy"] as const;
  return {
    distance: distances[seededRand(String(raceNumber), "dist", 0, distances.length - 1)],
    ground: grounds[seededRand(String(raceNumber), "ground", 0, grounds.length - 1)],
    gatePosition: seededRand(String(raceNumber), "gate", 1, 8),
  };
}

// ── HTML page template (sprite composited in-browser, mirrors useHorseSpriteUrl) ─

interface AssetUrls {
  bodyUrl: string;
  hairUrl: string;
  faceUrl: string | null;
  logoUrl: string;
}

function renderPage(
  horse: HorseRenderData,
  win: FakeWin,
  meta: ReturnType<typeof synthesiseRaceMeta>,
  viewport: AspectSize,
  assets: AssetUrls
): string {
  const { bodyUrl, hairUrl, faceUrl, logoUrl } = assets;

  const winAmount = win.payout - win.stake;
  const winRate = horse.careerRaces > 0 ? Math.round((horse.careerWins / horse.careerRaces) * 100) : 0;
  const cleanUsername = win.username.replace(/^@/, "");
  const spriteSrcY = SPRITE.ROW_IDLE_RIGHT + 6; // cropY
  const cropX = 14;
  const cropW = 36;
  const cropH = 38;

  // Card DOM reproduces rps/components/racing/RaceWinCard.tsx lines 118–298.
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :root { color-scheme: dark; }
  html, body {
    margin: 0; padding: 0;
    width: ${viewport.width}px; height: ${viewport.height}px;
    background: radial-gradient(ellipse at 20% 20%, rgba(139,92,246,0.10) 0%, transparent 55%),
                radial-gradient(ellipse at 80% 85%, rgba(236,72,153,0.08) 0%, transparent 55%),
                #0A0A0F;
    font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  #card-wrap {
    width: 600px; height: 340px;
    transform: scale(${viewport.cardScale});
    transform-origin: center center;
  }
  #card {
    width: 600px; height: 340px;
    background: linear-gradient(135deg, #0A0A0F 0%, #12121A 50%, #0A0A0F 100%);
    position: relative; overflow: hidden; border-radius: 16px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04);
  }
  .glow-a { position:absolute; top:-80px; left:-80px; width:240px; height:240px;
    background: radial-gradient(circle, ${horse.color}25 0%, transparent 70%); }
  .glow-b { position:absolute; bottom:-80px; right:-80px; width:240px; height:240px;
    background: radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%); }
  .topbar { display:flex; justify-content:space-between; align-items:center;
    padding: 14px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .topbar img { height: 24px; width:auto; }
  .race-num { color: rgba(255,255,255,0.4); font-size: 12px; font-family: monospace; }
  .main { display:flex; gap:24px; padding:20px 24px; height: 230px; }
  .left { display:flex; flex-direction:column; gap:6px; flex:1; }
  .win-amt { font-size:44px; font-weight:900; color:#F59E0B; line-height:1;
    text-shadow: 0 0 30px rgba(245,158,11,0.4); }
  .chip-row { display:flex; align-items:center; gap:8px; margin-top:2px; }
  .odds-chip { background: rgba(6,182,212,0.15); color:#06B6D4;
    padding:2px 10px; border-radius:6px; font-size:14px; font-weight:800; font-family: monospace; }
  .win-chip { background: rgba(34,197,94,0.12); color:#22C55E;
    padding:2px 8px; border-radius:6px; font-size:11px; font-weight:800; letter-spacing: 0.05em; }
  .horse-row { margin-top:6px; display:flex; align-items:center; gap:8px; }
  .sprite-wrap { position:relative; width:40px; height:40px; }
  .sprite-canvas { image-rendering: pixelated; }
  .gate-dot { position:absolute; bottom:-2px; right:-2px; width:16px; height:16px; border-radius:50%;
    background: ${horse.color}; display:flex; align-items:center; justify-content:center;
    font-size:9px; font-weight:800; color:#fff; border:1.5px solid rgba(0,0,0,0.3); }
  .horse-name { font-size:18px; font-weight:800; color:#F8FAFC; }
  .race-meta { font-size:11px; color: rgba(255,255,255,0.35); margin-top:4px; text-transform: capitalize; }
  .pf-badge { display:flex; align-items:center; gap:6px; margin-top:auto; }
  .pf-dot { width:6px; height:6px; border-radius:50%; background:#22C55E; }
  .pf-text { color: rgba(255,255,255,0.3); font-size:10px; }
  .right { width:210px; border-radius:12px; background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06); padding:14px 16px;
    display:flex; flex-direction:column; gap:8px; }
  .right-title { font-size:9px; color: rgba(255,255,255,0.35); text-transform:uppercase;
    letter-spacing: 0.12em; font-weight:700; }
  .stat-bars { display:flex; flex-direction:column; gap:5px; }
  .stat-row { display:flex; align-items:center; gap:6px; }
  .stat-label { font-size:9px; color: rgba(255,255,255,0.45); width:14px; text-align:right; font-family: monospace; }
  .stat-track { flex:1; height:6px; border-radius:3px; background: rgba(255,255,255,0.06); }
  .stat-fill { height:100%; border-radius:3px; }
  .stat-val { font-size:9px; font-weight:700; color: rgba(255,255,255,0.55); width:18px; text-align:right; font-family: monospace; }
  .career-row { border-top: 1px solid rgba(255,255,255,0.05); padding-top:8px; margin-top:2px;
    display:flex; justify-content:space-between; }
  .career-stat { text-align:center; }
  .career-num { font-size:14px; font-weight:800; }
  .career-label { font-size:8px; color: rgba(255,255,255,0.35); }
  .l5-row { display:flex; align-items:center; gap:3px; margin-top:2px; }
  .l5-label { font-size:8px; color: rgba(255,255,255,0.35); margin-right:2px; }
  .l5-pill { width:22px; height:22px; border-radius:5px; display:flex; align-items:center; justify-content:center;
    font-size:10px; font-weight:800; }
  .l5-first { background: rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.25); color:#22C55E; }
  .l5-place { background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); }
  .l5-also  { background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.3); }
  .bottom { display:flex; justify-content:space-between; align-items:center; padding: 0 24px 14px; }
  .username { color: rgba(255,255,255,0.25); font-size:10px; }
  .tagline { color: rgba(255,255,255,0.2); font-size:10px; font-style:italic; }
</style>
</head>
<body>
  <div id="card-wrap"><div id="card">
    <div class="glow-a"></div>
    <div class="glow-b"></div>
    <div class="topbar">
      <img id="logo" src="${logoUrl}" alt="throws.gg" crossorigin="anonymous" />
      <div class="race-num">RACE #${win.raceNumber.toLocaleString()}</div>
    </div>
    <div class="main">
      <div class="left">
        <div class="win-amt">+$${winAmount.toFixed(2)}</div>
        <div class="chip-row">
          <span class="odds-chip">${win.odds.toFixed(2)}x</span>
          <span class="win-chip">WIN</span>
        </div>
        <div class="horse-row">
          <div class="sprite-wrap">
            <canvas id="sprite" class="sprite-canvas" width="40" height="40"></canvas>
            <div class="gate-dot">${meta.gatePosition}</div>
          </div>
          <span class="horse-name">${escapeHtml(horse.name)}</span>
        </div>
        <div class="race-meta">Gate ${meta.gatePosition} · ${meta.distance}m · ${meta.ground}</div>
        <div class="pf-badge">
          <div class="pf-dot"></div>
          <span class="pf-text">provably fair · verified</span>
        </div>
      </div>
      <div class="right">
        <div class="right-title">Horse Stats</div>
        <div class="stat-bars">
          ${statBar("S", horse.speed, "#06B6D4")}
          ${statBar("T", horse.stamina, "#22C55E")}
          ${statBar("F", horse.form, "#F59E0B")}
          ${statBar("C", horse.consistency, "#8B5CF6")}
        </div>
        <div class="career-row">
          <div class="career-stat">
            <div class="career-num" style="color: rgba(255,255,255,0.7)">${horse.careerRaces}</div>
            <div class="career-label">Starts</div>
          </div>
          <div class="career-stat">
            <div class="career-num" style="color: rgba(34,197,94,0.8)">${horse.careerWins}</div>
            <div class="career-label">Wins</div>
          </div>
          <div class="career-stat">
            <div class="career-num" style="color: rgba(255,255,255,0.5)">${winRate}%</div>
            <div class="career-label">Win%</div>
          </div>
        </div>
        <div class="l5-row">
          <span class="l5-label">L5</span>
          ${horse.last5Results
            .map((p) => {
              const cls = p === 1 ? "l5-first" : p <= 3 ? "l5-place" : "l5-also";
              return `<div class="l5-pill ${cls}">${p}</div>`;
            })
            .join("")}
        </div>
      </div>
    </div>
    <div class="bottom">
      <div class="username">@${escapeHtml(cleanUsername)}</div>
      <div class="tagline">they race. you bet. you profit.</div>
    </div>
  </div></div>

<script>
(function () {
  // Mirror useHorseSpriteUrl: composite body + hair + optional face onto a 40x40 canvas,
  // then signal readiness via data-still-ready on <body>.
  const bodyImg = new Image();
  const hairImg = new Image();
  const faceImg = ${faceUrl ? "new Image()" : "null"};
  bodyImg.crossOrigin = "anonymous";
  hairImg.crossOrigin = "anonymous";
  if (faceImg) faceImg.crossOrigin = "anonymous";
  bodyImg.src = ${JSON.stringify(bodyUrl)};
  hairImg.src = ${JSON.stringify(hairUrl)};
  ${faceUrl ? `faceImg.src = ${JSON.stringify(faceUrl)};` : ""}

  const logoEl = document.getElementById("logo");
  const total = 3 + (faceImg ? 1 : 0); // body, hair, logo, optional face
  let loaded = 0;

  function compositeSprite() {
    const canvas = document.getElementById("sprite");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const srcX = ${cropX};
    const srcY = ${spriteSrcY};
    const cropW = ${cropW};
    const cropH = ${cropH};
    ctx.drawImage(bodyImg, srcX, srcY, cropW, cropH, 0, 0, 40, 40);
    ctx.drawImage(hairImg, srcX, srcY, cropW, cropH, 0, 0, 40, 40);
    if (faceImg) ctx.drawImage(faceImg, srcX, srcY, cropW, cropH, 0, 0, 40, 40);
  }

  function tick() {
    loaded++;
    if (loaded >= total) {
      compositeSprite();
      document.body.setAttribute("data-still-ready", "1");
    }
  }

  bodyImg.addEventListener("load", tick, { once: true });
  hairImg.addEventListener("load", tick, { once: true });
  if (faceImg) faceImg.addEventListener("load", tick, { once: true });
  logoEl.addEventListener("load", tick, { once: true });
  if (bodyImg.complete) tick();
  if (hairImg.complete) tick();
  if (faceImg && faceImg.complete) tick();
  if (logoEl.complete) tick();
})();
</script>
</body>
</html>`;
}

function statBar(label: string, value: number, color: string): string {
  return `<div class="stat-row">
    <span class="stat-label">${label}</span>
    <div class="stat-track"><div class="stat-fill" style="width:${value}%;background:${color}"></div></div>
    <span class="stat-val">${value}</span>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

// ── Renderer ─────────────────────────────────────────────────────────────────

async function main() {
  const force = process.env.FORCE === "1";
  const raw = await fs.readFile(INPUT_JSON, "utf8");
  const wins: FakeWin[] = JSON.parse(raw);
  if (!Array.isArray(wins) || wins.length === 0) {
    throw new Error(`fake-wins.json is empty or not an array: ${INPUT_JSON}`);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Lazy-import puppeteer so the script can at least print setup instructions
  // without crashing if it's not installed.
  let puppeteer: typeof import("puppeteer");
  try {
    puppeteer = await import("puppeteer");
  } catch {
    console.error(
      "\n❌ puppeteer is not installed.\n   Run from the rps/ directory:  npm i -D puppeteer tsx\n"
    );
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  // Cache asset data URLs — same horse across multiple wins reuses the same sprite.
  const assetCache = new Map<string, AssetUrls>();
  async function getAssets(identity: HorseIdentity): Promise<AssetUrls> {
    const key = `${identity.body}-${identity.hairType}-${identity.hairColor}-${identity.faceMarking}`;
    const cached = assetCache.get(key);
    if (cached) return cached;
    const [bodyUrl, hairUrl, logoUrl, faceUrl] = await Promise.all([
      fileToDataUrl(path.join(PUBLIC_DIR, "horses", "bodies", `${identity.body}.png`)),
      fileToDataUrl(
        path.join(PUBLIC_DIR, "horses", `${identity.hairType}-hair`, `${identity.hairColor}.png`)
      ),
      fileToDataUrl(path.join(PUBLIC_DIR, "logo-horse.png")),
      identity.faceMarking > 0
        ? fileToDataUrl(path.join(PUBLIC_DIR, "horses", "face-markings", `${identity.faceMarking}.png`))
        : Promise.resolve(null),
    ]);
    const assets: AssetUrls = { bodyUrl, hairUrl, logoUrl, faceUrl };
    assetCache.set(key, assets);
    return assets;
  }

  let rendered = 0;
  let skipped = 0;
  try {
    for (const win of wins) {
      const horse = hydrateHorse(win.horseSlug, win.horseName, win.raceNumber);
      const meta = synthesiseRaceMeta(win.raceNumber);
      const assets = await getAssets(horse.identity);

      for (const size of SIZES) {
        const outPath = path.join(
          OUTPUT_DIR,
          `${win.raceNumber}-${win.horseSlug}-${size.suffix}.png`
        );
        if (!force) {
          try {
            await fs.access(outPath);
            skipped++;
            continue;
          } catch {
            /* not present — render */
          }
        }

        const page = await browser.newPage();
        await page.setViewport({
          width: size.width,
          height: size.height,
          deviceScaleFactor: 1,
        });
        const html = renderPage(horse, win, meta, size, assets);
        await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
        await page.waitForSelector("body[data-still-ready='1']", { timeout: 8_000 });
        await page.screenshot({ path: outPath, type: "png", omitBackground: false });
        await page.close();
        rendered++;
        process.stdout.write(`  ✓ ${path.basename(outPath)}\n`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(
    `\n✔ Done. ${rendered} rendered, ${skipped} skipped (already existed). Output: ${OUTPUT_DIR}`
  );
  if (skipped > 0 && !force) {
    console.log(`  (set FORCE=1 to overwrite existing files)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
