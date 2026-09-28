import cardData from "@tarot/cards/card-data.json";
import { generateInterpretation } from "@tarot/readings/interpretation/index.js";
import { selectRelevantMeaning } from "@tarot/readings/interpretation/patterns.js";
import { calculateMoonPhase } from "@tarot/readings/lunar-utils.js";
import { localizedSpread } from "@tarot/readings/spread-localizations.js";
import { TAROT_SPREADS, customSpreadTypeId } from "@tarot/readings/spreads.js";
import {
  localizedCardName,
  localizedKeywords,
  localizedMeanings,
  pick,
} from "@tarot/shared/i18n.js";
import type {
  CardOrientation,
  DrawnCard,
  Language,
  TarotCard,
  TarotSpread,
} from "@tarot/shared/types.js";
import { CARD_BACK_IMAGE_URI, cardImageUri } from "./card-assets.js";
import { createLocalReadingHistoryClient } from "./local-reading-history.js";
import type {
  BeginReadingInput,
  BeginReadingPayload,
  ConfirmedReading,
  DrawClient,
} from "./types.js";

const DECK = (cardData as unknown as { cards: TarotCard[] }).cards;
const UINT32_RANGE = 0x1_0000_0000;

interface StaticDrawSpec {
  readingKind: BeginReadingInput["readingKind"];
  question: string;
  language: Language;
  spreadType: string;
  spread: TarotSpread;
}

interface StaticDeckEntry {
  card: TarotCard;
  orientation: CardOrientation;
}

interface StaticDrawRecord {
  spec: StaticDrawSpec;
  payload: BeginReadingPayload;
  deck: Map<string, StaticDeckEntry>;
  selectionKey?: string;
  confirmed?: ConfirmedReading;
}

function randomInteger(maxExclusive: number): number {
  const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % maxExclusive;
}

function shuffle<Value>(values: readonly Value[]): Value[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = randomInteger(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function secureId(prefix: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function defaultQuestion(kind: "daily" | "moon", language: Language): string {
  return kind === "daily"
    ? pick(
        language,
        "What do I need to know for today?",
        "今天我需要知道什么？",
      )
    : pick(
        language,
        "What guidance does the current moon phase offer?",
        "当前月相带来了什么指引？",
      );
}

function resolveSpec(input: BeginReadingInput): StaticDrawSpec {
  if (input.readingKind === "spread") {
    const spread =
      TAROT_SPREADS[input.spreadType as keyof typeof TAROT_SPREADS];
    if (!spread) throw new Error(`Unknown spread: ${input.spreadType}`);
    return {
      readingKind: input.readingKind,
      question: input.question.trim(),
      language: input.language,
      spreadType: input.spreadType,
      spread: localizedSpread(spread, input.spreadType, input.language),
    };
  }

  if (input.readingKind === "daily") {
    const spreadType = "daily_guidance";
    return {
      readingKind: input.readingKind,
      question:
        input.question?.trim() || defaultQuestion("daily", input.language),
      language: input.language,
      spreadType,
      spread: localizedSpread(
        TAROT_SPREADS[spreadType],
        spreadType,
        input.language,
      ),
    };
  }

  if (input.readingKind === "moon") {
    const date = input.customDate
      ? new Date(`${input.customDate}T12:00:00.000Z`)
      : new Date();
    if (Number.isNaN(date.getTime())) throw new Error("Invalid moon date.");
    const moon = calculateMoonPhase(date);
    const spreadType = moon.recommendedSpreads[0] ?? "three_card";
    const spread = TAROT_SPREADS[spreadType as keyof typeof TAROT_SPREADS];
    if (!spread) throw new Error(`Unknown moon spread: ${spreadType}`);
    return {
      readingKind: input.readingKind,
      question:
        input.question.trim() || defaultQuestion("moon", input.language),
      language: input.language,
      spreadType,
      spread: localizedSpread(spread, spreadType, input.language),
    };
  }

  const spreadName = input.customSpread.name.trim();
  const positions = input.customSpread.positions.map((position) => ({
    name: position.name.trim(),
    meaning:
      position.meaning.trim() ||
      pick(
        input.language,
        `What ${position.name.trim()} represents in this reading`,
        `${position.name.trim()}在本次解读中所代表的意义`,
      ),
  }));
  const spread: TarotSpread = {
    name: spreadName,
    description:
      input.customSpread.description?.trim() ||
      pick(input.language, "A custom tarot spread", "自定义塔罗牌阵"),
    positions,
    cardCount: positions.length,
  };
  return {
    readingKind: input.readingKind,
    question: input.question.trim(),
    language: input.language,
    spreadType: customSpreadTypeId(spreadName),
    spread,
  };
}

function createReading(
  drawId: string,
  record: StaticDrawRecord,
  selectedSlotIds: string[],
): ConfirmedReading {
  if (selectedSlotIds.length !== record.spec.spread.cardCount)
    throw new Error(
      `Choose exactly ${record.spec.spread.cardCount} cards before confirming.`,
    );
  if (new Set(selectedSlotIds).size !== selectedSlotIds.length)
    throw new Error("The same card cannot be selected twice.");

  const drawnCards: DrawnCard[] = selectedSlotIds.map((slotId, index) => {
    const entry = record.deck.get(slotId);
    if (!entry) throw new Error("This draw has expired. Start a new reading.");
    const position = record.spec.spread.positions[index];
    return {
      card: entry.card,
      orientation: entry.orientation,
      position: position.name,
      positionMeaning: position.meaning,
    };
  });
  const timestamp = new Date().toISOString();
  const readingId = secureId("reading");
  const { language, question, spreadType, spread } = record.spec;
  return {
    readingId,
    drawId,
    spreadType,
    spreadName: spread.name,
    question,
    language,
    timestamp,
    interpretation: generateInterpretation(
      drawnCards,
      question,
      spreadType,
      spread.name,
      language,
    ),
    deckBackImageUri: CARD_BACK_IMAGE_URI,
    cards: drawnCards.map((drawnCard) => {
      const meanings = localizedMeanings(
        drawnCard.card,
        drawnCard.orientation,
        language,
      );
      return {
        id: drawnCard.card.id,
        name: drawnCard.card.name,
        displayName: localizedCardName(drawnCard.card, language),
        orientation: drawnCard.orientation,
        position: drawnCard.position,
        positionMeaning: drawnCard.positionMeaning,
        keywords: localizedKeywords(
          drawnCard.card,
          drawnCard.orientation,
          language,
        ),
        meaning: selectRelevantMeaning(
          meanings,
          drawnCard.position ?? "General",
          question,
          drawnCard.positionMeaning,
        ),
        imageUri: cardImageUri(drawnCard.card.id),
      };
    }),
  };
}

export function createStaticWebClient(): DrawClient {
  const records = new Map<string, StaticDrawRecord>();
  const history = createLocalReadingHistoryClient();

  return {
    target: "web",
    history,
    async beginReading(input, options) {
      options?.signal?.throwIfAborted();
      const spec = resolveSpec(input);
      const drawId = secureId("draw");
      const deck = new Map<string, StaticDeckEntry>();
      const slots = shuffle(DECK).map((card, index) => {
        const slotId = secureId("slot");
        deck.set(slotId, {
          card,
          orientation: randomInteger(2) === 0 ? "upright" : "reversed",
        });
        return { slotId, index };
      });
      const payload: BeginReadingPayload = {
        drawId,
        readingKind: spec.readingKind,
        spreadType: spec.spreadType,
        spreadName: spec.spread.name,
        question: spec.question,
        language: spec.language,
        requiredCount: spec.spread.cardCount,
        slots,
        deckBackImageUri: CARD_BACK_IMAGE_URI,
        positions: spec.spread.positions,
      };
      records.set(drawId, { spec, payload, deck });
      while (records.size > 20) records.delete(records.keys().next().value!);
      return payload;
    },
    async confirmReading(drawId, selectedSlotIds, options) {
      options?.signal?.throwIfAborted();
      const record = records.get(drawId);
      if (!record)
        throw new Error("This draw has expired. Start a new reading.");
      const selectionKey = selectedSlotIds.join("|");
      if (record.confirmed) {
        if (record.selectionKey !== selectionKey)
          throw new Error("This draw was already confirmed with other cards.");
        return record.confirmed;
      }
      const reading = createReading(drawId, record, selectedSlotIds);
      record.selectionKey = selectionKey;
      record.confirmed = reading;
      history.save(reading);
      return reading;
    },
    async resolveImage(card) {
      return card.imageUri ?? cardImageUri(card.id);
    },
  };
}
