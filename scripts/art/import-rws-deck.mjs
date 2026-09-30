#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cardsPath = resolve(root, "src/tarot/cards/card-data.json");
const outputDir = resolve(root, "assets/cards");
const mcpDir = resolve(outputDir, "mcp");
const sourceRegistryPath = resolve(root, "assets/artwork/rws-sources.json");
const manifestPath = resolve(outputDir, "manifest.json");

const DECK_ID = "rws-midnight-v1";
const CATEGORY_TITLE = "Category:Rider-Waite-Smith tarot deck (Geldard)";
const CATEGORY_URL =
  "https://commons.wikimedia.org/wiki/Category:Rider-Waite-Smith_tarot_deck_(Geldard)";
const API_URL = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT =
  "tarot-mcp-rws-import/1.0 (https://github.com/fzlzjerry/tarot-mcp)";
const WEB = { width: 512, height: 768, quality: 88, hardMaxBytes: 180_000 };
const MCP = { width: 192, height: 288, quality: 56, hardMaxBytes: 7_350 };
const RANK_LABELS = {
  1: "A",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
  7: "VII",
  8: "VIII",
  9: "IX",
  10: "X",
  11: "P",
  12: "N",
  13: "Q",
  14: "K",
};

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function cleanUrl(value) {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_")) url.searchParams.delete(key);
  }
  return url.toString();
}

function metadataValue(imageInfo, key) {
  return imageInfo.extmetadata?.[key]?.value ?? null;
}

function plainText(value) {
  return value
    ?.replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&ndash;", "–")
    .replaceAll("&mdash;", "—")
    .trim();
}

function canonicalSourceName(title) {
  const suffix = " (Rider-Waite Smith tarot deck).png";
  if (!title.startsWith("File:") || !title.endsWith(suffix)) {
    throw new Error(`Unexpected Wikimedia source title: ${title}`);
  }
  return title
    .slice("File:".length, -suffix.length)
    .replace(/^One of /, "Ace of ");
}

function comparisonName(name) {
  return name.replace(/^The /, "");
}

async function fetchChecked(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,image/png,image/*;q=0.9,*/*;q=0.8",
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response;
}

async function fetchSourcePages() {
  const pages = new Map();
  let continuation = {};

  do {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      generator: "categorymembers",
      gcmtitle: CATEGORY_TITLE,
      gcmtype: "file",
      gcmlimit: "500",
      prop: "imageinfo",
      iiprop: "url|extmetadata|size|sha1",
      iiurlwidth: "960",
      ...continuation,
    });
    const response = await fetchChecked(`${API_URL}?${params}`);
    const payload = await response.json();
    for (const page of payload.query?.pages ?? []) {
      const previous = pages.get(page.pageid) ?? {};
      pages.set(page.pageid, {
        ...previous,
        ...page,
        imageinfo: page.imageinfo ?? previous.imageinfo,
      });
    }
    continuation = payload.continue ?? null;
  } while (continuation);

  const completePages = [...pages.values()].filter(
    (page) => page.ns === 6 && page.imageinfo?.[0]?.thumburl,
  );
  if (completePages.length !== 78) {
    throw new Error(
      `Expected 78 Wikimedia source images, received ${completePages.length}.`,
    );
  }
  return completePages;
}

function frameSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768" viewBox="0 0 512 768">
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect x="7" y="7" width="498" height="754" rx="18" stroke="#d2ae69" stroke-width="3"/>
      <rect x="15" y="15" width="482" height="738" rx="13" stroke="#72552f" stroke-width="1.5"/>
      <path d="M28 70C28 42 42 28 70 28M28 70C40 55 52 43 70 28" stroke="#d2ae69" stroke-width="2"/>
      <path d="M484 70C484 42 470 28 442 28M484 70C472 55 460 43 442 28" stroke="#d2ae69" stroke-width="2"/>
      <path d="M28 698C28 726 42 740 70 740M28 698C40 713 52 725 70 740" stroke="#d2ae69" stroke-width="2"/>
      <path d="M484 698C484 726 470 740 442 740M484 698C472 713 460 725 442 740" stroke="#d2ae69" stroke-width="2"/>
      <circle cx="24" cy="384" r="5" stroke="#efe2bd" stroke-width="1.5"/>
      <circle cx="488" cy="384" r="5" stroke="#efe2bd" stroke-width="1.5"/>
      <path d="M18 384h12M482 384h12" stroke="#d2ae69" stroke-width="1.5"/>
    </g>
  </svg>`);
}

async function renderCard(source) {
  const face = await sharp(source)
    .rotate()
    .flatten({ background: "#efe4c8" })
    .resize(430, 738, {
      fit: "contain",
      position: "centre",
      background: "#070c16",
    })
    .modulate({ brightness: 0.88, saturation: 0.82 })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: WEB.width,
      height: WEB.height,
      channels: 4,
      background: "#070c16",
    },
  })
    .composite([
      { input: face, left: 41, top: 15 },
      { input: frameSvg(), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function encodeAtOrUnder(image, options) {
  const { width, height, startQuality, minimumQuality, hardMaxBytes } = options;
  for (let quality = startQuality; quality >= minimumQuality; quality -= 2) {
    const output = await sharp(image)
      .flatten({ background: "#070c16" })
      .resize(width, height, { fit: "fill" })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer();
    if (output.length <= hardMaxBytes) return { output, quality };
  }
  throw new Error(
    `Unable to encode ${width}x${height} image below ${hardMaxBytes} bytes.`,
  );
}

async function mapWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function fileRecord(path, publicPath, width, height, quality) {
  const contents = await readFile(path);
  return {
    path: publicPath,
    physicalPath: path.slice(root.length + 1),
    width,
    height,
    bytes: contents.length,
    sha256: sha256(contents),
    quality,
  };
}

const canonicalCards = JSON.parse(await readFile(cardsPath, "utf8")).cards;
const sourcePages = await fetchSourcePages();
const pagesByName = new Map(
  sourcePages.map((page) => [comparisonName(canonicalSourceName(page.title)), page]),
);

const missing = canonicalCards.filter(
  (card) => !pagesByName.has(comparisonName(card.name)),
);
if (missing.length > 0) {
  throw new Error(`Missing Wikimedia images for: ${missing.map((card) => card.name).join(", ")}`);
}
if (pagesByName.size !== canonicalCards.length) {
  throw new Error("Wikimedia source set contains unmatched or duplicate card names.");
}

await Promise.all([
  mkdir(outputDir, { recursive: true }),
  mkdir(mcpDir, { recursive: true }),
  mkdir(dirname(sourceRegistryPath), { recursive: true }),
]);

const imported = await mapWithConcurrency(canonicalCards, 4, async (card, index) => {
  const page = pagesByName.get(comparisonName(card.name));
  const imageInfo = page.imageinfo[0];
  const sourceUrl = cleanUrl(imageInfo.thumburl);
  const response = await fetchChecked(sourceUrl);
  const source = Buffer.from(await response.arrayBuffer());
  const sourceMetadata = await sharp(source).metadata();
  const artist = plainText(metadataValue(imageInfo, "Artist"));
  const publicationYear = metadataValue(imageInfo, "DateTimeOriginal");
  const license = metadataValue(imageInfo, "LicenseShortName");
  if (
    artist !== "Pamela Colman Smith" ||
    publicationYear !== "1910" ||
    license !== "Public domain"
  ) {
    throw new Error(`Unexpected rights metadata for ${page.title}.`);
  }

  const rendered = await renderCard(source);
  const web = await encodeAtOrUnder(rendered, {
    width: WEB.width,
    height: WEB.height,
    startQuality: WEB.quality,
    minimumQuality: 60,
    hardMaxBytes: WEB.hardMaxBytes,
  });
  const mcp = await encodeAtOrUnder(rendered, {
    width: MCP.width,
    height: MCP.height,
    startQuality: MCP.quality,
    minimumQuality: 4,
    hardMaxBytes: MCP.hardMaxBytes,
  });

  const webPath = resolve(outputDir, `${card.id}.webp`);
  const mcpPath = resolve(mcpDir, `${card.id}.webp`);
  await Promise.all([
    writeFile(webPath, web.output),
    writeFile(mcpPath, mcp.output),
  ]);

  console.log(
    `[${String(index + 1).padStart(2, "0")}/78] ${card.id}: ${web.output.length} / ${mcp.output.length} bytes`,
  );

  return {
    card,
    source: {
      id: card.id,
      canonicalName: card.name,
      sourceTitle: page.title,
      descriptionUrl: cleanUrl(imageInfo.descriptionurl),
      originalUrl: cleanUrl(imageInfo.url),
      thumbnailUrl: sourceUrl,
      artist,
      publicationYear,
      credit: metadataValue(imageInfo, "Credit"),
      license,
      usageTerms: metadataValue(imageInfo, "UsageTerms"),
      attributionRequired:
        metadataValue(imageInfo, "AttributionRequired") === "true",
      copyrighted: metadataValue(imageInfo, "Copyrighted") === "True",
      description: plainText(metadataValue(imageInfo, "ImageDescription")),
      download: {
        width: sourceMetadata.width,
        height: sourceMetadata.height,
        bytes: source.length,
        sha256: sha256(source),
      },
    },
    webPath,
    mcpPath,
    webQuality: web.quality,
    mcpQuality: mcp.quality,
  };
});

const sourceRegistry = {
  schemaVersion: 1,
  deckId: DECK_ID,
  title: "Rider–Waite–Smith Tarot · Midnight Edition",
  sourceCategory: CATEGORY_URL,
  apiEndpoint: API_URL,
  artist: "Pamela Colman Smith",
  publicationYear: 1910,
  license: "Public domain",
  retrievedDate: new Date().toISOString().slice(0, 10),
  processing:
    "Complete traditional RWS scans, fitted without cropping, gently muted, and placed in the project's midnight navy and antique-gold frame.",
  cards: imported.map((entry) => entry.source),
};
await writeFile(sourceRegistryPath, `${JSON.stringify(sourceRegistry, null, 2)}\n`);

const backSourcePath = resolve(root, "assets/artwork/source/back.png");
const backWebPath = resolve(outputDir, "back.webp");
const backMcpPath = resolve(mcpDir, "back.webp");
const backSource = await readFile(backSourcePath);
const backWeb = await fileRecord(
  backWebPath,
  `/assets/cards/${DECK_ID}/back.webp`,
  WEB.width,
  WEB.height,
  100,
);
const backMcp = await fileRecord(
  backMcpPath,
  `/assets/cards/${DECK_ID}/mcp/back.webp`,
  MCP.width,
  MCP.height,
  100,
);
backWeb.lossless = true;
backWeb.paletteColours = 128;
backMcp.lossless = true;
backMcp.paletteColours = 128;

const manifestCards = [];
for (const entry of imported) {
  const { card, source, webPath, mcpPath, webQuality, mcpQuality } = entry;
  manifestCards.push({
    id: card.id,
    name: card.name,
    arcana: card.arcana,
    suit: card.suit ?? null,
    rank: card.number,
    pipCount:
      card.arcana === "minor" ? (card.number <= 10 ? card.number : 1) : null,
    rankLabel: card.arcana === "minor" ? RANK_LABELS[card.number] : null,
    sourceTitle: source.sourceTitle,
    sourceDescriptionUrl: source.descriptionUrl,
    sourceSha256: source.download.sha256,
    web: await fileRecord(
      webPath,
      `/assets/cards/${DECK_ID}/${card.id}.webp`,
      WEB.width,
      WEB.height,
      webQuality,
    ),
    mcp: await fileRecord(
      mcpPath,
      `/assets/cards/${DECK_ID}/mcp/${card.id}.webp`,
      MCP.width,
      MCP.height,
      mcpQuality,
    ),
    alt: {
      en: `${card.name}, traditional Rider–Waite–Smith tarot card`,
      zh: `${card.zh?.name ?? card.name}，传统韦特塔罗牌面`,
    },
  });
}

const manifest = {
  schemaVersion: 2,
  deckId: DECK_ID,
  title: "Rider–Waite–Smith Tarot · Midnight Edition",
  source: {
    type: "public-domain-rws-scan",
    deck: "Rider–Waite–Smith tarot deck (Geldard)",
    artist: "Pamela Colman Smith",
    publicationYear: 1910,
    provider: "Wikimedia Commons",
    categoryUrl: CATEGORY_URL,
    sourceRegistry: "assets/artwork/rws-sources.json",
    publicDomain: true,
    license: "assets/ASSET_LICENSE.md",
  },
  treatment: {
    symbolism: "unaltered-traditional-rws",
    crop: "none",
    brightness: 0.88,
    saturation: 0.82,
    frame: "project-midnight-navy-antique-gold",
  },
  webSpec: WEB,
  mcpSpec: MCP,
  cardBack: {
    rotationalSymmetry: "180deg-exact-decoded-pixels",
    encoding: "lossless-webp-from-128-colour-palette",
    sourceSha256: sha256(backSource),
    web: backWeb,
    mcp: backMcp,
  },
  cards: manifestCards,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const totalWeb = manifestCards.reduce((sum, card) => sum + card.web.bytes, 0);
const totalMcp = manifestCards.reduce((sum, card) => sum + card.mcp.bytes, 0);
console.log(
  `Imported 78 traditional RWS cards: ${totalWeb} Web bytes, ${totalMcp} MCP bytes.`,
);
