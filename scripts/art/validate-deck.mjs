#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(
  await readFile(resolve(root, "assets/cards/manifest.json"), "utf8"),
);
const canonical = JSON.parse(
  await readFile(resolve(root, "src/tarot/cards/card-data.json"), "utf8"),
).cards;
const sources = JSON.parse(
  await readFile(resolve(root, "assets/artwork/rws-sources.json"), "utf8"),
);
const manualReview = JSON.parse(
  await readFile(resolve(root, "assets/cards/qa/manual-review.json"), "utf8"),
);

const DECK_ID = "rws-midnight-v1";
const expectedIds = canonical.map((card) => card.id);
const sourceById = new Map((sources.cards ?? []).map((card) => [card.id, card]));
const rankLabels = {
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
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function dimensions(path) {
  const { width, height } = await sharp(path).metadata();
  return `${width}x${height}`;
}

async function decodedRotationalMismatch(path) {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let mismatch = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const oppositeX = info.width - 1 - x;
      const oppositeY = info.height - 1 - y;
      const index = (y * info.width + x) * info.channels;
      const opposite = (oppositeY * info.width + oppositeX) * info.channels;
      for (let channel = 0; channel < info.channels; channel += 1) {
        if (data[index + channel] !== data[opposite + channel]) mismatch += 1;
      }
    }
  }
  return mismatch;
}

check(manifest.schemaVersion === 2, "manifest schemaVersion must be 2");
check(manifest.deckId === DECK_ID, "manifest deckId mismatch");
check(manifest.cards?.length === 78, "manifest must contain exactly 78 cards");
check(
  JSON.stringify(manifest.cards?.map((card) => card.id)) ===
    JSON.stringify(expectedIds),
  "manifest card ids/order must match canonical card-data.json",
);
check(
  manifest.source?.type === "public-domain-rws-scan" &&
    manifest.source?.publicDomain === true &&
    manifest.source?.artist === "Pamela Colman Smith" &&
    manifest.source?.publicationYear === 1910,
  "manifest must identify the public-domain 1910 Pamela Colman Smith source",
);
check(
  manifest.treatment?.symbolism === "unaltered-traditional-rws" &&
    manifest.treatment?.crop === "none",
  "manifest must record unaltered, uncropped traditional RWS symbolism",
);
check(
  sources.schemaVersion === 1 &&
    sources.deckId === DECK_ID &&
    sources.cards?.length === 78,
  "RWS source registry must contain all 78 cards",
);
check(
  JSON.stringify(sources.cards?.map((card) => card.id)) ===
    JSON.stringify(expectedIds),
  "RWS source registry ids/order must match card-data.json",
);
for (const source of sources.cards ?? []) {
  check(source.artist === "Pamela Colman Smith", `${source.id}: wrong source artist`);
  check(source.publicationYear === "1910", `${source.id}: wrong source year`);
  check(source.license === "Public domain", `${source.id}: source is not public domain`);
  check(source.copyrighted === false, `${source.id}: source marked copyrighted`);
  check(
    source.descriptionUrl?.startsWith("https://commons.wikimedia.org/wiki/File:"),
    `${source.id}: missing Wikimedia description URL`,
  );
  check(
    /^[a-f0-9]{64}$/.test(source.download?.sha256 ?? ""),
    `${source.id}: missing source download hash`,
  );
}

check(
  manualReview.deckId === manifest.deckId && manualReview.cardsReviewed === 78,
  "manual visual review must cover all 78 cards",
);
for (const field of [
  "traditionalRwsSymbolismVerified",
  "cardTitlesAndRanksVerified",
  "sourceMappingVerified",
  "styleConsistencyVerified",
  "anatomyAndCroppingVerified",
  "noLogosOrWatermarks",
]) {
  check(manualReview[field] === true, `manual review field ${field} must be true`);
}
check(
  manualReview.cardBackExactDecodedSymmetryVerified === true,
  "manual review must include the exact-symmetry card-back sheet",
);
check(
  manualReview.contactSheetArtifacts?.length === 7,
  "manual review must record seven hashed QA sheets",
);
for (const artifact of manualReview.contactSheetArtifacts ?? []) {
  const path = resolve(root, artifact.path);
  check((await stat(path)).size === artifact.bytes, `${artifact.path}: QA byte mismatch`);
  check((await sha256(path)) === artifact.sha256, `${artifact.path}: QA hash mismatch`);
}

const webHashes = new Set();
const mcpHashes = new Set();
let totalWebBytes = 0;
let totalMcpBytes = 0;

for (const card of manifest.cards ?? []) {
  const canonicalCard = canonical.find((entry) => entry.id === card.id);
  const source = sourceById.get(card.id);
  const expectedPips =
    canonicalCard.arcana === "minor"
      ? canonicalCard.number <= 10
        ? canonicalCard.number
        : 1
      : null;
  const expectedRankLabel =
    canonicalCard.arcana === "minor" ? rankLabels[canonicalCard.number] : null;
  check(card.pipCount === expectedPips, `${card.id}: incorrect pipCount metadata`);
  check(card.rankLabel === expectedRankLabel, `${card.id}: incorrect rank metadata`);
  check(source, `${card.id}: missing source registry entry`);
  check(card.sourceTitle === source?.sourceTitle, `${card.id}: source title mismatch`);
  check(
    card.sourceDescriptionUrl === source?.descriptionUrl,
    `${card.id}: source description URL mismatch`,
  );
  check(card.sourceSha256 === source?.download?.sha256, `${card.id}: source hash mismatch`);
  check(
    card.web.path === `/assets/cards/${DECK_ID}/${card.id}.webp`,
    `${card.id}: incorrect versioned Web URL`,
  );
  check(
    card.mcp.path === `/assets/cards/${DECK_ID}/mcp/${card.id}.webp`,
    `${card.id}: incorrect versioned MCP URL`,
  );

  const webPath = resolve(root, card.web.physicalPath);
  const mcpPath = resolve(root, card.mcp.physicalPath);
  const [webStat, mcpStat] = await Promise.all([stat(webPath), stat(mcpPath)]);
  check((await dimensions(webPath)) === "512x768", `${card.id}: Web image must be 512x768`);
  check((await dimensions(mcpPath)) === "192x288", `${card.id}: MCP image must be 192x288`);
  check(webStat.size === card.web.bytes, `${card.id}: Web byte count mismatch`);
  check(mcpStat.size === card.mcp.bytes, `${card.id}: MCP byte count mismatch`);
  check(webStat.size <= 180_000, `${card.id}: Web image exceeds 180 KB`);
  check(mcpStat.size <= 7_350, `${card.id}: MCP image exceeds 7,350 bytes`);
  check(webStat.size >= 15_000, `${card.id}: Web output looks like a placeholder`);
  check(mcpStat.size >= 1_500, `${card.id}: MCP output looks like a placeholder`);

  const [webHash, mcpHash] = await Promise.all([sha256(webPath), sha256(mcpPath)]);
  check(webHash === card.web.sha256, `${card.id}: Web hash mismatch`);
  check(mcpHash === card.mcp.sha256, `${card.id}: MCP hash mismatch`);
  check(!webHashes.has(webHash), `${card.id}: duplicate Web artwork hash`);
  check(!mcpHashes.has(mcpHash), `${card.id}: duplicate MCP artwork hash`);
  webHashes.add(webHash);
  mcpHashes.add(mcpHash);
  totalWebBytes += webStat.size;
  totalMcpBytes += mcpStat.size;
}

check(totalWebBytes <= 14_040_000, "Web deck exceeds 78 x 180 KB budget");
const bundledMcpRawBytes = totalMcpBytes + manifest.cardBack.mcp.bytes;
const bundledMcpBase64Bytes = [...manifest.cards, manifest.cardBack].reduce(
  (total, card) => total + 4 * Math.ceil(card.mcp.bytes / 3),
  0,
);
check(
  bundledMcpRawBytes <= 600_000,
  `bundled MCP artwork uses ${bundledMcpRawBytes} raw bytes; budget is 600000`,
);
check(
  bundledMcpBase64Bytes <= 800_000,
  `bundled MCP artwork uses ${bundledMcpBase64Bytes} base64 bytes; budget is 800000`,
);

const backWebPath = resolve(root, manifest.cardBack.web.physicalPath);
const backMcpPath = resolve(root, manifest.cardBack.mcp.physicalPath);
check((await dimensions(backWebPath)) === "512x768", "Web card back must be 512x768");
check((await dimensions(backMcpPath)) === "192x288", "MCP card back must be 192x288");
check((await stat(backWebPath)).size <= 180_000, "Web card back exceeds budget");
check((await stat(backMcpPath)).size <= 24_000, "MCP card back exceeds budget");
check(
  manifest.cardBack.rotationalSymmetry === "180deg-exact-decoded-pixels",
  "card-back manifest must promise exact decoded-pixel symmetry",
);
check(
  manifest.cardBack.web.lossless === true && manifest.cardBack.mcp.lossless === true,
  "card-back derivatives must use lossless WebP",
);
check((await sha256(backWebPath)) === manifest.cardBack.web.sha256, "Web card-back hash mismatch");
check((await sha256(backMcpPath)) === manifest.cardBack.mcp.sha256, "MCP card-back hash mismatch");
check(
  (await decodedRotationalMismatch(backWebPath)) === 0,
  "decoded Web card back is not pixel-exact under 180-degree rotation",
);
check(
  (await decodedRotationalMismatch(backMcpPath)) === 0,
  "decoded MCP card back is not pixel-exact under 180-degree rotation",
);

const backSource = resolve(root, "assets/artwork/source/back.png");
check((await sha256(backSource)) === manifest.cardBack.sourceSha256, "card-back source hash mismatch");
await readFile(resolve(root, "assets/ASSET_LICENSE.md"), "utf8");

if (errors.length > 0) {
  console.error(`Deck validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Validated 78 public-domain RWS cards + symmetric back; Web ${totalWebBytes} bytes, bundled MCP artwork ${bundledMcpRawBytes} raw / ${bundledMcpBase64Bytes} base64 bytes.`,
);
