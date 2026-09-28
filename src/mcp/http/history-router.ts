import { Router } from "express";
import type { TarotServer } from "../tarot-service.js";

export function createHistoryRouter(server: TarotServer): Router {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(req.hostname)) {
      res.status(403).json({ error: "History requires a loopback host" });
      return;
    }
    if (
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress ?? "",
      )
    ) {
      res.status(403).json({ error: "Reading history is local-only" });
      return;
    }
    const origin = req.headers.origin;
    if (
      origin &&
      ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(
        origin,
      )
    ) {
      res.status(403).json({ error: "History requires the same origin" });
      return;
    }
    next();
  });
  router.get("/", (_req, res) => {
    try {
      res.json({
        enabled: Boolean(server.readingHistory),
        entries: server.readingHistory?.list() ?? [],
      });
    } catch {
      res.status(500).json({
        error: "无法读取历史文件，原文件已保留。请检查磁盘或文件权限。",
      });
    }
  });
  router.get("/export", (_req, res) => {
    try {
      res.json({ version: 1, entries: server.readingHistory?.all() ?? [] });
    } catch {
      res.status(500).json({ error: "无法导出历史记录，原文件已保留。" });
    }
  });
  router.use("/:readingId", (req, res, next) => {
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(req.params.readingId)) {
      res.status(400).json({ error: "Invalid reading ID" });
      return;
    }
    if (!server.readingHistory) {
      res
        .status(503)
        .json({ error: "历史记录未启用，请通过本机启动脚本运行服务。" });
      return;
    }
    next();
  });
  router.get("/:readingId", (req, res) => {
    try {
      const entry = server.readingHistory!.get(req.params.readingId);
      if (!entry) {
        res.status(404).json({ error: "这次结果尚未存入历史，请重试保存。" });
        return;
      }
      res.json(entry);
    } catch {
      res.status(500).json({ error: "无法读取这次记录，原文件已保留。" });
    }
  });
  router.post("/:readingId/retry", (req, res) => {
    try {
      server.retryHistorySave(req.params.readingId);
      const entry = server.readingHistory!.get(req.params.readingId);
      if (!entry) {
        res
          .status(404)
          .json({ error: "本服务没有这次结果；请先复制保存，避免丢失。" });
        return;
      }
      res.json(entry);
    } catch {
      res
        .status(500)
        .json({ error: "保存失败，请检查磁盘或文件权限；抽牌结果未改变。" });
    }
  });
  router.post("/:readingId/interpretations", (req, res) => {
    const { source, text } = req.body ?? {};
    if (
      typeof source !== "string" ||
      !source.trim() ||
      source.length > 100 ||
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 100_000
    ) {
      res.status(400).json({
        error: "请填写来源（最多 100 字符）和解读内容（最多 100000 字符）。",
      });
      return;
    }
    try {
      const entry = server.readingHistory!.addInterpretation(
        req.params.readingId,
        source,
        text,
      );
      if (!entry) {
        res.status(404).json({ error: "Reading not found" });
        return;
      }
      res.json(entry);
    } catch {
      res.status(500).json({ error: "解读未保存，请保留输入内容并重试。" });
    }
  });
  return router;
}
