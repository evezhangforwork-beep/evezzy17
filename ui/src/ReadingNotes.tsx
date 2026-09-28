import { useEffect, useState } from "react";
import type {
  ReadingHistoryClient,
  ReadingHistoryEntry,
} from "@tarot/shared/reading-history.js";
import type { Language } from "./types.js";

export function ReadingNotes({
  readingId,
  client,
  language,
}: {
  readingId: string;
  client: ReadingHistoryClient;
  language: Language;
}) {
  const chinese = language === "zh";
  const [entry, setEntry] = useState<ReadingHistoryEntry>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    client
      .get(readingId)
      .then((value) => {
        if (active) setEntry(value);
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error ? failure.message : String(failure),
          );
      });
    return () => {
      active = false;
    };
  }, [client, readingId]);
  const retry = async () => {
    setBusy(true);
    setError("");
    try {
      setEntry(await client.retry(readingId));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="journal-notes"
      aria-label={chinese ? "历史保存状态" : "History save status"}
    >
      <p className="journal-hint" role="status">
        {entry
          ? chinese
            ? "✓ 问题和抽牌结果已保存到本机历史。"
            : "✓ Question and cards saved to local history."
          : error
            ? ""
            : chinese
              ? "正在确认历史保存状态…"
              : "Checking local history…"}
      </p>
      {error ? (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          {!entry ? (
            <button
              className="text-action"
              type="button"
              onClick={() => void retry()}
              disabled={busy}
            >
              {chinese ? "重试保存结果" : "Retry saving cards"}
            </button>
          ) : null}
        </div>
      ) : null}
      {entry?.interpretations.length ? (
        <div className="journal-versions">
          <h3>
            {chinese
              ? "已留存的解读与回顾"
              : "Saved interpretations & reflections"}
          </h3>
          {[...entry.interpretations].reverse().map((note) => (
            <details key={note.id} open={entry.interpretations.length === 1}>
              <summary>
                {note.source} ·{" "}
                {new Date(note.savedAt).toLocaleString(
                  chinese ? "zh-CN" : "en-US",
                )}
              </summary>
              <p className="journal-verbatim">{note.text}</p>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}
