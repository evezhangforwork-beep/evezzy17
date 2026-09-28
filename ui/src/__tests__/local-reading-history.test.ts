import { createLocalReadingHistoryClient } from "../local-reading-history.js";
import type { ConfirmedReading } from "../types.js";

const reading: ConfirmedReading = {
  readingId: "reading_public_1",
  drawId: "draw_public_1",
  spreadType: "single_card",
  spreadName: "单牌阵",
  question: "今天适合关注什么？",
  language: "zh",
  timestamp: "2026-09-28T08:00:00.000Z",
  interpretation: "保持觉察。",
  cards: [
    {
      id: "the-star",
      name: "The Star",
      displayName: "星星（The Star）",
      orientation: "upright",
      position: "指引",
    },
  ],
};

describe("browser-local reading history", () => {
  beforeEach(() => window.localStorage.clear());

  it("saves, lists, reads, and exports a confirmed reading", async () => {
    const client = createLocalReadingHistoryClient();
    client.save(reading);
    client.save(reading);

    await expect(client.list()).resolves.toMatchObject({
      enabled: true,
      entries: [
        {
          readingId: "reading_public_1",
          question: "今天适合关注什么？",
          cards: [{ id: "the-star", orientation: "upright" }],
        },
      ],
    });
    await expect(client.get("reading_public_1")).resolves.toMatchObject({
      reading: { spreadName: "单牌阵" },
    });
    await expect(client.export()).resolves.toMatchObject({
      version: 1,
      entries: [{ reading: { readingId: "reading_public_1" } }],
    });
  });
});
