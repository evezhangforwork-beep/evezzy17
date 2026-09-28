import { useEffect, useRef, useState } from "react";
import type {
  ReadingHistoryClient,
  ReadingHistoryEntry,
  ReadingHistorySummary,
} from "@tarot/shared/reading-history.js";
import { CopyReading } from "./CopyReading.js";
import { cardImageUri } from "./card-assets.js";
import { ReadingInterpretation } from "./ReadingInterpretation.js";
import { ReadingNotes } from "./ReadingNotes.js";
import type { Language } from "./types.js";

export function ReadingHistory({
  client,
  language,
  onClose,
}: {
  client: ReadingHistoryClient;
  language: Language;
  onClose(): void;
}) {
  const chinese = language === "zh";
  const dialog = useRef<HTMLDialogElement>(null);
  const [entries, setEntries] = useState<ReadingHistorySummary[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [opened, setOpened] = useState<ReadingHistoryEntry[]>([]);
  const [opening, setOpening] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    const element = dialog.current;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    client
      .list()
      .then((result) => {
        if (!active) return;
        setEntries(result.entries);
        setEnabled(result.enabled);
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error ? failure.message : String(failure),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, revision]);
  useEffect(() => {
    let active = true;
    setOpened([]);
    if (!openedIds.length) {
      setOpening(false);
      return;
    }
    setOpening(true);
    setError("");
    Promise.all(openedIds.map((readingId) => client.get(readingId)))
      .then((result) => {
        if (active) setOpened(result);
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error ? failure.message : String(failure),
          );
      })
      .finally(() => {
        if (active) setOpening(false);
      });
    return () => {
      active = false;
    };
  }, [client, openedIds]);
  const exportHistory = async () => {
    setExporting(true);
    try {
      const result = await client.export();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `tarot-history-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setExporting(false);
    }
  };
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = entries.filter((entry) =>
    [
      entry.question,
      entry.spreadName,
      ...entry.cards.map((card) => card.displayName),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
  const date = (value: string) =>
    value
      ? new Date(value).toLocaleString(chinese ? "zh-CN" : "en-US")
      : chinese
        ? "旧页面恢复 · 抽牌时间未记录"
        : "Recovered reading · original time unknown";
  const orientation = (value: string) =>
    value === "reversed"
      ? chinese
        ? "逆位"
        : "Reversed"
      : chinese
        ? "正位"
        : "Upright";
  return (
    <dialog
      ref={dialog}
      className="journal-dialog"
      aria-labelledby="journal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="journal-content">
        <header className="journal-header">
          <div>
            <p className="spread-label">TAROT JOURNAL</p>
            <h2 id="journal-title">
              {chinese ? "历史与回望" : "History & reflection"}
            </h2>
            <p className="journal-hint">
              {chinese
                ? "把当时的问题，留给后来的自己。仅保存在本机，不自动上传。"
                : "Keep today's questions for your future self. Stored locally, never automatically uploaded."}
            </p>
          </div>
          <button className="text-action" type="button" onClick={onClose}>
            {chinese ? "返回牌桌" : "Return to table"}
          </button>
        </header>
        {error ? (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button
              className="text-action"
              type="button"
              onClick={() => {
                setRevision((current) => current + 1);
                setOpenedIds([...openedIds]);
              }}
            >
              {chinese ? "重试加载" : "Retry loading"}
            </button>
          </div>
        ) : null}
        {!enabled && !loading ? (
          <p>
            {chinese
              ? "历史功能尚未启用，请使用工作目录里的「启动塔罗.command」重新启动服务。"
              : "History is disabled. Restart the server with READING_HISTORY_DIR configured."}
          </p>
        ) : null}
        {openedIds.length ? (
          <>
            <button
              className="text-action journal-back"
              type="button"
              onClick={() => setOpenedIds([])}
            >
              {chinese ? "← 历史列表" : "← History list"}
            </button>
            {opening ? (
              <p role="status">
                {chinese ? "正在打开记录…" : "Opening readings…"}
              </p>
            ) : null}
            <div className="journal-comparison" data-count={opened.length}>
              {opened.map(({ reading }) => (
                <article className="journal-detail" key={reading.readingId}>
                  <p className="spread-label">
                    {date(reading.timestamp)} · {reading.spreadName}
                  </p>
                  <h3>
                    {reading.question ||
                      (chinese ? "未填写问题" : "No question")}
                  </h3>
                  <ol className="journal-cards">
                    {reading.cards.map((card, index) => (
                      <li key={`${card.id}-${index}`}>
                        <span className="journal-hint">
                          {index + 1}. {card.position}
                        </span>
                        <img
                          src={cardImageUri(card.id)}
                          className={
                            card.orientation === "reversed"
                              ? "is-reversed"
                              : undefined
                          }
                          alt=""
                          loading="lazy"
                        />
                        <strong>{card.displayName}</strong>
                        <span className="journal-hint">
                          {orientation(card.orientation)}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <CopyReading reading={reading} language={language} />
                  <ReadingNotes
                    readingId={reading.readingId}
                    client={client}
                    language={language}
                  />
                  <details className="journal-original">
                    <summary>
                      {chinese
                        ? "查看原始模板解读"
                        : "View original template interpretation"}
                    </summary>
                    <ReadingInterpretation text={reading.interpretation} />
                  </details>
                </article>
              ))}
            </div>
          </>
        ) : enabled ? (
          <>
            <div className="journal-toolbar">
              <label className="journal-field">
                {chinese ? "寻找一段记录" : "Find a reading"}
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={
                    chinese
                      ? "搜索问题、牌阵或牌名"
                      : "Search question, spread or card"
                  }
                />
              </label>
              <div className="journal-actions">
                <button
                  className="primary-action"
                  type="button"
                  disabled={selected.length !== 2}
                  onClick={() => setOpenedIds([...selected])}
                >
                  {chinese
                    ? `对比两次结果 (${selected.length}/2)`
                    : `Compare readings (${selected.length}/2)`}
                </button>
                <button
                  className="text-action"
                  type="button"
                  disabled={exporting || !entries.length}
                  onClick={() => void exportHistory()}
                >
                  {exporting
                    ? chinese
                      ? "导出中…"
                      : "Exporting…"
                    : chinese
                      ? "导出备份"
                      : "Export backup"}
                </button>
              </div>
            </div>
            {loading ? (
              <p role="status">
                {chinese ? "正在读取本机历史…" : "Loading local history…"}
              </p>
            ) : !error && !filtered.length ? (
              <div className="journal-empty">
                <span aria-hidden="true">✦</span>
                <h3>
                  {entries.length
                    ? chinese
                      ? "没有找到相符的记录"
                      : "No matching readings"
                    : chinese
                      ? "每一次抽牌，都值得回望"
                      : "Every reading has a story"}
                </h3>
                <p>
                  {entries.length
                    ? chinese
                      ? "试试另一个关键词。"
                      : "Try another search."
                    : chinese
                      ? "启用后完成的抽牌会自动出现在这里；更早未保存的记录无法自动找回。"
                      : "Readings completed after enabling history appear here automatically. Earlier unsaved readings cannot be recovered."}
                </p>
              </div>
            ) : null}
            <ul className="journal-list">
              {filtered.map((entry) => (
                <li key={entry.readingId}>
                  <input
                    type="checkbox"
                    aria-label={`${chinese ? "选择对比" : "Select to compare"}：${entry.question}`}
                    checked={selected.includes(entry.readingId)}
                    disabled={
                      selected.length === 2 &&
                      !selected.includes(entry.readingId)
                    }
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(entry.readingId)
                          ? current.filter(
                              (readingId) => readingId !== entry.readingId,
                            )
                          : current.length < 2
                            ? [...current, entry.readingId]
                            : current,
                      )
                    }
                  />
                  <button
                    className="journal-list-entry"
                    type="button"
                    onClick={() => setOpenedIds([entry.readingId])}
                  >
                    <span className="journal-list-heading">
                      <span>
                        <span className="journal-list-meta">
                          {date(entry.timestamp)} · {entry.spreadName}
                        </span>
                        <strong className="journal-list-question">
                          {entry.question ||
                            (chinese ? "未填写问题" : "No question")}
                        </strong>
                      </span>
                      <span className="journal-list-arrow" aria-hidden="true">
                        →
                      </span>
                    </span>
                    <span
                      className={`journal-list-cards${entry.cards.length > 7 ? " is-compact" : ""}`}
                      role="list"
                      aria-label={
                        chinese ? "本次卡面" : "Cards in this reading"
                      }
                    >
                      {entry.cards.map((card, index) => (
                        <span
                          className="journal-list-card"
                          role="listitem"
                          key={`${card.id}-${index}`}
                        >
                          <span className="journal-list-card-art">
                            <img
                              src={cardImageUri(card.id)}
                              className={
                                card.orientation === "reversed"
                                  ? "is-reversed"
                                  : undefined
                              }
                              alt=""
                              loading="lazy"
                            />
                            <span>{index + 1}</span>
                          </span>
                          <span className="journal-list-card-name">
                            {card.displayName}
                          </span>
                          <span className="journal-list-card-orientation">
                            {orientation(card.orientation)}
                          </span>
                        </span>
                      ))}
                    </span>
                    <span className="journal-list-footer">
                      <span>
                        {chinese
                          ? `${entry.cards.length} 张牌`
                          : `${entry.cards.length} cards`}
                      </span>
                      <span>{chinese ? "点开查看详情" : "Open details"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </dialog>
  );
}
