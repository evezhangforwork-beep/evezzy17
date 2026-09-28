import { createStaticWebClient } from "../static-web-client.js";

describe("static web client", () => {
  beforeEach(() => window.localStorage.clear());

  it("creates and confirms a complete browser-local draw", async () => {
    const client = createStaticWebClient();
    const draw = await client.beginReading({
      readingKind: "spread",
      spreadType: "three_card",
      question: "下一步应该关注什么？",
      language: "zh",
    });

    expect(draw.slots).toHaveLength(78);
    expect(new Set(draw.slots.map((slot) => slot.slotId)).size).toBe(78);
    expect(draw.requiredCount).toBe(3);

    const selected = draw.slots.slice(0, 3).map((slot) => slot.slotId);
    const reading = await client.confirmReading(draw.drawId, selected);

    expect(reading.cards).toHaveLength(3);
    expect(new Set(reading.cards.map((card) => card.id)).size).toBe(3);
    expect(reading.interpretation).toContain("下一步应该关注什么？");
    await expect(client.history?.list()).resolves.toMatchObject({
      enabled: true,
      entries: [{ readingId: reading.readingId }],
    });
  });

  it("returns the same result when a confirmation is retried", async () => {
    const client = createStaticWebClient();
    const draw = await client.beginReading({
      readingKind: "daily",
      language: "zh",
    });
    const selected = [draw.slots[0].slotId];

    const first = await client.confirmReading(draw.drawId, selected);
    const retry = await client.confirmReading(draw.drawId, selected);

    expect(retry).toEqual(first);
  });
});
