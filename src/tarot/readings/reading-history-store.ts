import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ArchivedReading,
  ReadingHistoryEntry,
  ReadingHistorySummary,
} from "../shared/reading-history.js";

export class ReadingHistoryStore {
  constructor(private readonly directory: string) {}

  private path(readingId: string): string {
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(readingId))
      throw new Error("Invalid reading ID");
    return join(this.directory, `${readingId}.json`);
  }

  public get(readingId: string): ReadingHistoryEntry | undefined {
    const path = this.path(readingId);
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const entry = JSON.parse(raw) as ReadingHistoryEntry;
    if (
      entry.version !== 1 ||
      entry.reading?.readingId !== readingId ||
      !Array.isArray(entry.reading.cards) ||
      !Array.isArray(entry.interpretations)
    ) {
      throw new Error("Invalid history file; original file has been preserved");
    }
    return entry;
  }

  public save(reading: ArchivedReading): ReadingHistoryEntry {
    const existing = this.get(reading.readingId);
    if (existing) return existing;
    const entry: ReadingHistoryEntry = {
      version: 1,
      reading: {
        readingId: reading.readingId,
        spreadType: reading.spreadType,
        spreadName: reading.spreadName,
        question: reading.question,
        timestamp: reading.timestamp,
        language: reading.language,
        interpretation: reading.interpretation,
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
      },
      savedAt: new Date().toISOString(),
      interpretations: [],
    };
    this.write(entry);
    return entry;
  }

  public all(): ReadingHistoryEntry[] {
    let names: string[];
    try {
      names = readdirSync(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return names
      .filter((name) => name.endsWith(".json"))
      .map((name) => this.get(name.slice(0, -5)))
      .filter((entry): entry is ReadingHistoryEntry => Boolean(entry))
      .sort((left, right) =>
        right.reading.timestamp.localeCompare(left.reading.timestamp),
      );
  }

  public list(): ReadingHistorySummary[] {
    return this.all().map(({ reading, interpretations }) => ({
      readingId: reading.readingId,
      question: reading.question,
      spreadName: reading.spreadName,
      timestamp: reading.timestamp,
      cards: reading.cards,
      interpretationCount: interpretations.length,
    }));
  }

  public addInterpretation(
    readingId: string,
    source: string,
    text: string,
  ): ReadingHistoryEntry | undefined {
    if (
      !source.trim() ||
      source.length > 100 ||
      !text.trim() ||
      text.length > 100_000
    ) {
      throw new Error("Invalid interpretation");
    }
    const entry = this.get(readingId);
    if (!entry) return undefined;
    if (
      entry.interpretations.some(
        (saved) => saved.source === source.trim() && saved.text === text.trim(),
      )
    )
      return entry;
    entry.interpretations.push({
      id: randomUUID(),
      source: source.trim(),
      text: text.trim(),
      savedAt: new Date().toISOString(),
    });
    this.write(entry);
    return entry;
  }

  private write(entry: ReadingHistoryEntry): void {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const destination = this.path(entry.reading.readingId);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(entry, null, 2), {
        mode: 0o600,
        flag: "wx",
      });
      renameSync(temporary, destination);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
}
