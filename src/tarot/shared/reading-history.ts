import type { Language, CardOrientation } from "./types.js";

export interface ArchivedReading {
  readingId: string;
  spreadType: string;
  spreadName: string;
  question: string;
  timestamp: string;
  language: Language;
  interpretation: string;
  cards: Array<{
    id: string;
    name: string;
    displayName: string;
    orientation: CardOrientation;
    position?: string;
    positionMeaning?: string;
    keywords?: string[];
    meaning?: string;
  }>;
}

export interface SavedInterpretation {
  id: string;
  source: string;
  text: string;
  savedAt: string;
}

export interface ReadingHistoryEntry {
  version: 1;
  reading: ArchivedReading;
  savedAt: string;
  interpretations: SavedInterpretation[];
}

export interface ReadingHistorySummary {
  readingId: string;
  question: string;
  spreadName: string;
  timestamp: string;
  cards: ArchivedReading["cards"];
  interpretationCount: number;
}

export interface ReadingHistoryClient {
  list(): Promise<{ enabled: boolean; entries: ReadingHistorySummary[] }>;
  get(readingId: string): Promise<ReadingHistoryEntry>;
  retry(readingId: string): Promise<ReadingHistoryEntry>;
  addInterpretation(
    readingId: string,
    source: string,
    text: string,
  ): Promise<ReadingHistoryEntry>;
  export(): Promise<{ version: 1; entries: ReadingHistoryEntry[] }>;
}
