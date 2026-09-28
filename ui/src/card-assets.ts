import {
  VISUAL_ARTWORK_VERSION,
  VISUAL_CARD_ASSET_BASE,
} from "@tarot/shared/artwork.js";

const configuredBase = import.meta.env.VITE_CARD_ASSET_BASE?.trim();

export const CARD_ASSET_BASE = configuredBase
  ? configuredBase.replace(/\/$/, "")
  : VISUAL_CARD_ASSET_BASE;

export const CARD_BACK_IMAGE_URI = `${CARD_ASSET_BASE}/back.webp`;

export function cardImageUri(cardId: string): string {
  return `${CARD_ASSET_BASE}/${encodeURIComponent(cardId)}.webp`;
}

export { VISUAL_ARTWORK_VERSION };
