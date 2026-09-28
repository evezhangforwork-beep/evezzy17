import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TarotServer } from "../mcp/tarot-service.js";
import { TOOL_NAMES } from "../mcp/public-api.js";
import { ReadingHistoryStore } from "../tarot/readings/reading-history-store.js";
import type { ArchivedReading } from "../tarot/shared/reading-history.js";

const reading: ArchivedReading = {
  readingId: "reading_test",
  spreadType: "single_card",
  spreadName: "单张牌",
  question: "该如何开始？",
  language: "zh",
  timestamp: "2020-01-01T00:00:00.000Z",
  interpretation: "原始解读",
  cards: [
    {
      id: "fool",
      name: "The Fool",
      displayName: "愚者",
      orientation: "reversed",
      position: "建议",
      positionMeaning: "可以做的事",
      keywords: ["谨慎"],
      meaning: "先准备",
    },
  ],
};
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "tarot-history-test-"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

describe("durable local history", () => {
  it("preserves old readings and all versions across store recreation without session expiry or a 30-record limit", () => {
    const store = new ReadingHistoryStore(directory);
    store.save(reading);
    store.addInterpretation(reading.readingId, " DeepSeek ", " 第一版解读 ");
    store.addInterpretation(reading.readingId, "DeepSeek", "第一版解读");
    store.addInterpretation(reading.readingId, "一个月后的复盘", "后来的反馈");
    for (let index = 0; index < 35; index++)
      store.save({ ...reading, readingId: `reading_${index}` });
    const reopened = new ReadingHistoryStore(directory);
    expect(reopened.list()).toHaveLength(36);
    expect(reopened.get(reading.readingId)?.reading).toEqual(reading);
    expect(
      reopened
        .get(reading.readingId)
        ?.interpretations.map(({ source, text }) => ({ source, text })),
    ).toEqual([
      { source: "DeepSeek", text: "第一版解读" },
      { source: "一个月后的复盘", text: "后来的反馈" },
    ]);
    expect(readdirSync(directory).every((name) => name.endsWith(".json"))).toBe(
      true,
    );
  });
  it("never replaces an original reading on retry or stores private transport metadata", () => {
    const store = new ReadingHistoryStore(directory);
    store.save({
      ...reading,
      sessionId: "secret",
      drawId: "secret",
      token: "secret",
    } as ArchivedReading);
    store.addInterpretation(reading.readingId, "DeepSeek", "已有解读");
    const retried = store.save({
      ...reading,
      question: "different",
      cards: [],
    });
    expect(retried.reading).toEqual(reading);
    expect(retried.interpretations).toHaveLength(1);
    expect(
      readFileSync(join(directory, `${reading.readingId}.json`), "utf8"),
    ).not.toContain("secret");
  });
  it("uses owner-only file permissions and leaves corrupted files untouched", () => {
    const store = new ReadingHistoryStore(join(directory, "private"));
    store.save(reading);
    const file = join(directory, "private", `${reading.readingId}.json`);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(directory, "private")).mode & 0o777).toBe(0o700);
    writeFileSync(file, "broken original");
    expect(() => store.save(reading)).toThrow();
    expect(() => store.all()).toThrow();
    expect(readFileSync(file, "utf8")).toBe("broken original");
  });
  it("rejects invalid paths and content rather than writing outside the archive", () => {
    const store = new ReadingHistoryStore(directory);
    expect(store.list()).toEqual([]);
    expect(() => store.get("../escape")).toThrow("Invalid reading ID");
    expect(() =>
      store.save({ ...reading, readingId: "/tmp/escape" }),
    ).toThrow();
    expect(() =>
      store.addInterpretation(reading.readingId, " ", "text"),
    ).toThrow();
    expect(() =>
      store.addInterpretation(reading.readingId, "DeepSeek", " "),
    ).toThrow();
    expect(() =>
      store.addInterpretation(
        reading.readingId,
        "DeepSeek",
        "a".repeat(100001),
      ),
    ).toThrow();
    expect(
      store.addInterpretation("missing", "DeepSeek", "text"),
    ).toBeUndefined();
  });
});

describe("history integration with randomized readings", () => {
  const cases = [
    {
      readingKind: "spread",
      spreadType: "three_card",
      question: "我的下一步？",
      language: "zh",
    },
    { readingKind: "daily", language: "zh" },
    { readingKind: "moon", customDate: "2026-09-22", language: "zh" },
    {
      readingKind: "custom",
      question: "我的下一步？",
      language: "zh",
      customSpread: {
        name: "我的牌阵",
        positions: [{ name: "现在" }, { name: "下一步" }],
      },
    },
  ];
  it.each(cases)(
    "archives only confirmed $readingKind readings and never redraws on duplicate confirmation",
    async (args) => {
      vi.stubEnv("READING_HISTORY_DIR", directory);
      const service = await TarotServer.create();
      const begin = await service.executeTool(
        TOOL_NAMES.beginVisualReading,
        args,
      );
      expect(begin.ok).toBe(true);
      if (!begin.ok) throw new Error(begin.error);
      expect(service.readingHistory?.list()).toEqual([]);
      const draw = begin.structured as {
        drawId: string;
        requiredCount: number;
        slots: { slotId: string }[];
      };
      const selection = {
        drawId: draw.drawId,
        selectedSlotIds: draw.slots
          .slice(0, draw.requiredCount)
          .map(({ slotId }) => slotId),
      };
      const result = await service.executeTool(
        TOOL_NAMES.confirmVisualReading,
        selection,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      const confirmed = result.structured as ArchivedReading;
      expect(
        service.readingHistory?.get(confirmed.readingId)?.reading,
      ).toMatchObject({
        readingId: confirmed.readingId,
        question: confirmed.question,
        cards: confirmed.cards.map(({ id, orientation, position }) => ({
          id,
          orientation,
          position,
        })),
      });
      expect(
        await service.executeTool(TOOL_NAMES.confirmVisualReading, selection),
      ).toEqual(result);
      expect(service.readingHistory?.list()).toHaveLength(1);
    },
  );
  it("keeps successful cards when saving fails, and retries the exact result without drawing again", async () => {
    vi.stubEnv("READING_HISTORY_DIR", directory);
    const service = await TarotServer.create();
    const save = vi
      .spyOn(service.readingHistory!, "save")
      .mockImplementationOnce(() => {
        throw new Error("disk full");
      });
    const result = await service.executeTool(TOOL_NAMES.getDailyCard, {
      language: "zh",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const confirmed = result.structured as ArchivedReading;
    expect(service.readingHistory?.list()).toHaveLength(0);
    service.retryHistorySave(confirmed.readingId);
    expect(save).toHaveBeenCalledTimes(2);
    expect(
      service.readingHistory
        ?.get(confirmed.readingId)
        ?.reading.cards.map(({ id, orientation }) => ({ id, orientation })),
    ).toEqual(
      confirmed.cards.map(({ id, orientation }) => ({ id, orientation })),
    );
  });
  it("keeps history opt-in", async () => {
    vi.stubEnv("READING_HISTORY_DIR", "");
    expect((await TarotServer.create()).readingHistory).toBeUndefined();
  });
});
