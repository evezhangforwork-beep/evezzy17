import type {
  ArchivedReading,
  ReadingHistoryClient,
  ReadingHistoryEntry,
  ReadingHistorySummary,
} from "@tarot/shared/reading-history.js";
import type { ConfirmedReading } from "./types.js";

const STORAGE_KEY = "tarot-mcp.reading-history.v1";
const HISTORY_LIMIT = 100;

export interface LocalReadingHistoryClient extends ReadingHistoryClient {
  save(reading: ConfirmedReading): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHistoryEntry(value: unknown): value is ReadingHistoryEntry {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.reading))
    return false;
  return (
    typeof value.reading.readingId === "string" &&
    Array.isArray(value.reading.cards) &&
    Array.isArray(value.interpretations)
  );
}

function readEntries(): ReadingHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.entries)
    )
      return [];
    return parsed.entries.filter(isHistoryEntry);
  } catch {
    return [];
  }
}

function writeEntries(entries: ReadingHistoryEntry[]): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, entries: entries.slice(0, HISTORY_LIMIT) }),
  );
}

function historyEnabled(): boolean {
  try {
    const probe = `${STORAGE_KEY}.probe`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function archive(reading: ConfirmedReading): ArchivedReading | undefined {
  const readingId = reading.readingId ?? reading.drawId;
  if (!readingId) return undefined;
  return {
    readingId,
    spreadType: reading.spreadType,
    spreadName: reading.spreadName,
    question: reading.question,
    timestamp: reading.timestamp ?? new Date().toISOString(),
    language: reading.language,
    interpretation: reading.interpretation ?? "",
    cards: reading.cards.map((card) => ({
      id: card.id,
      name: card.name,
      displayName: card.displayName,
      orientation: card.orientation,
      position: card.position,
      positionMeaning: card.positionMeaning,
      keywords: card.keywords,
      meaning: card.meaning,
    })),
  };
}

function summary(entry: ReadingHistoryEntry): ReadingHistorySummary {
  const { reading, interpretations } = entry;
  return {
    readingId: reading.readingId,
    question: reading.question,
    spreadName: reading.spreadName,
    timestamp: reading.timestamp,
    cards: reading.cards,
    interpretationCount: interpretations.length,
  };
}

function findEntry(readingId: string): ReadingHistoryEntry {
  const entry = readEntries().find(
    (candidate) => candidate.reading.readingId === readingId,
  );
  if (!entry) throw new Error("Reading not found in this browser.");
  return entry;
}

export function createLocalReadingHistoryClient(): LocalReadingHistoryClient {
  return {
    save(reading) {
      const archived = archive(reading);
      if (!archived || !historyEnabled()) return;
      const entries = readEntries();
      if (
        entries.some((entry) => entry.reading.readingId === archived.readingId)
      )
        return;
      try {
        writeEntries([
          {
            version: 1,
            reading: archived,
            savedAt: new Date().toISOString(),
            interpretations: [],
          },
          ...entries,
        ]);
      } catch {
        // A full or blocked browser store must never interrupt a card draw.
      }
    },
    async list() {
      return {
        enabled: historyEnabled(),
        entries: readEntries()
          .sort((left, right) =>
            right.reading.timestamp.localeCompare(left.reading.timestamp),
          )
          .map(summary),
      };
    },
    async get(readingId) {
      return findEntry(readingId);
    },
    async retry(readingId) {
      return findEntry(readingId);
    },
    async addInterpretation(readingId, source, text) {
      const entries = readEntries();
      const entry = entries.find(
        (candidate) => candidate.reading.readingId === readingId,
      );
      if (!entry) throw new Error("Reading not found in this browser.");
      if (!source.trim() || !text.trim())
        throw new Error("Invalid interpretation.");
      entry.interpretations.push({
        id: globalThis.crypto.randomUUID(),
        source: source.trim(),
        text: text.trim(),
        savedAt: new Date().toISOString(),
      });
      writeEntries(entries);
      return entry;
    },
    async export() {
      return { version: 1, entries: readEntries() };
    },
  };
}
