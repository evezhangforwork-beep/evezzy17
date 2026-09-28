import express from "express";
import { request, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHistoryRouter } from "../mcp/http/history-router.js";
import { TarotServer } from "../mcp/tarot-service.js";
import { TOOL_NAMES } from "../mcp/public-api.js";

describe("local history HTTP API", () => {
  let directory: string;
  let server: Server;
  let base: string;
  let readingId: string;
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "tarot-history-http-"));
    vi.stubEnv("READING_HISTORY_DIR", directory);
    const service = await TarotServer.create();
    const result = await service.executeTool(TOOL_NAMES.getDailyCard, {
      language: "zh",
    });
    if (!result.ok) throw new Error(result.error);
    readingId = (result.structured as { readingId: string }).readingId;
    const app = express();
    app.use(express.json());
    app.use("/api/history", createHistoryRouter(service));
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing port");
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    vi.unstubAllEnvs();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  it("lists and retrieves durable records with no-store", async () => {
    const list = await fetch(`${base}/api/history`);
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect(await list.json()).toMatchObject({
      enabled: true,
      entries: [{ readingId }],
    });
    const detail = await (
      await fetch(`${base}/api/history/${readingId}`)
    ).json();
    expect(detail.reading.cards).toHaveLength(1);
    expect(detail.reading).not.toHaveProperty("sessionId");
    expect((await fetch(`${base}/api/history/missing`)).status).toBe(404);
  });
  it("rejects cross-origin requests and non-loopback hosts", async () => {
    for (const origin of [
      "https://example.com",
      "http://localhost:1234",
      "null",
    ]) {
      const response = await fetch(`${base}/api/history`, {
        headers: { origin },
      });
      expect(response.status).toBe(403);
    }
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const outgoing = request(
        `${base}/api/history`,
        { headers: { host: "attacker.example" } },
        (response) => {
          response.resume();
          response.once("end", () => resolve(response.statusCode));
        },
      );
      outgoing.once("error", reject);
      outgoing.end();
    });
    expect(status).toBe(403);
    expect(
      (await fetch(`${base}/api/history`, { headers: { origin: base } }))
        .status,
    ).toBe(200);
    expect((await fetch(`${base}/api/history/bad%2Fid`)).status).toBe(400);
  });
  it("validates notes, appends idempotently, and exports full records", async () => {
    const endpoint = `${base}/api/history/${readingId}/interpretations`;
    const options = (body: unknown) => ({
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify(body),
    });
    expect(
      (await fetch(endpoint, options({ source: "", text: "note" }))).status,
    ).toBe(400);
    expect(
      (await fetch(endpoint, options({ source: "DeepSeek", text: " " })))
        .status,
    ).toBe(400);
    expect(
      (await fetch(endpoint, options({ source: "DeepSeek", text: "反思" })))
        .status,
    ).toBe(200);
    const duplicate = await (
      await fetch(endpoint, options({ source: "DeepSeek", text: "反思" }))
    ).json();
    expect(duplicate.interpretations).toHaveLength(1);
    const retry = await fetch(
      `${base}/api/history/${readingId}/retry`,
      options({}),
    );
    expect(retry.status).toBe(200);
    const backup = await (await fetch(`${base}/api/history/export`)).json();
    expect(backup).toMatchObject({
      version: 1,
      entries: [
        {
          reading: { readingId },
          interpretations: [{ source: "DeepSeek", text: "反思" }],
        },
      ],
    });
  });
});
