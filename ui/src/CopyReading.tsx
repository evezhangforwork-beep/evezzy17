import { useEffect, useRef, useState } from "react";
import { formatReadingForCopy } from "./reading-copy.js";
import type { ConfirmedReading, Language } from "./types.js";

function copyTextSynchronously(text: string): boolean {
  const textarea = document.createElement("textarea");
  const previouslyFocused = document.activeElement;
  let handled = false;
  const handleCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    handled = true;
  };
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  document.addEventListener("copy", handleCopy, { once: true });
  try {
    return (document.execCommand?.("copy") ?? false) && handled;
  } catch {
    return false;
  } finally {
    document.removeEventListener("copy", handleCopy);
    textarea.remove();
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  }
}

function readingFingerprint(
  reading: ConfirmedReading,
  language: Language,
): string {
  return JSON.stringify({
    language,
    readingId: reading.readingId,
    drawId: reading.drawId,
    timestamp: reading.timestamp,
    question: reading.question,
    spreadName: reading.spreadName,
    cards: reading.cards.map((card) => [
      card.id,
      card.displayName,
      card.orientation,
      card.position,
    ]),
  });
}

function readingSummary(reading: ConfirmedReading, language: Language): string {
  const chinese = language === "zh";
  return reading.cards
    .map((card) => {
      const orientation =
        card.orientation === "reversed"
          ? chinese
            ? "逆位"
            : "reversed"
          : chinese
            ? "正位"
            : "upright";
      return `${card.displayName}（${orientation}）`;
    })
    .join(chinese ? " · " : " · ");
}

export function CopyReading({
  reading,
  language,
}: {
  reading: ConfirmedReading;
  language: Language;
}) {
  const [status, setStatus] = useState<
    "idle" | "copying" | "copied" | "manual"
  >("idle");
  const [manualText, setManualText] = useState("");
  const [copiedSummary, setCopiedSummary] = useState("");
  const latest = useRef({ reading, language });
  const copyRequest = useRef(0);
  const chinese = language === "zh";
  const fingerprint = readingFingerprint(reading, language);
  latest.current = { reading, language };
  useEffect(() => {
    copyRequest.current += 1;
    setStatus("idle");
    setManualText("");
    setCopiedSummary("");
  }, [fingerprint]);
  const copy = async () => {
    const request = ++copyRequest.current;
    const current = latest.current;
    const currentFingerprint = readingFingerprint(
      current.reading,
      current.language,
    );
    const text = formatReadingForCopy(current.reading, current.language);
    const summary = readingSummary(current.reading, current.language);
    setStatus("copying");
    setManualText(text);
    setCopiedSummary("");
    try {
      if (copyTextSynchronously(text)) {
        if (
          request === copyRequest.current &&
          currentFingerprint ===
            readingFingerprint(latest.current.reading, latest.current.language)
        ) {
          setCopiedSummary(summary);
          setStatus("copied");
        }
        return;
      }
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      if (
        request !== copyRequest.current ||
        currentFingerprint !==
          readingFingerprint(latest.current.reading, latest.current.language)
      )
        return;
      setCopiedSummary(summary);
      setStatus("copied");
    } catch {
      if (request !== copyRequest.current) return;
      setStatus("manual");
    }
  };
  return (
    <section
      className="journal-copy"
      aria-label={chinese ? "复制牌阵" : "Copy reading"}
    >
      <div className="journal-actions">
        <button
          className="primary-action"
          type="button"
          onClick={() => void copy()}
          disabled={status === "copying"}
        >
          {status === "copying"
            ? chinese
              ? "正在复制…"
              : "Copying…"
            : chinese
              ? "一键复制牌阵"
              : "Copy reading"}
        </button>
      </div>
      <p className="journal-hint">
        {chinese
          ? "复制问题、牌阵与牌位、日期和抽牌结果。"
          : "Copies the question, spread and positions, date, and draw result."}
      </p>
      <p className="journal-copy-target">
        <strong>{chinese ? "本次复制目标" : "Copying this reading"}</strong>
        <span>
          {reading.question || (chinese ? "未填写问题" : "No question")}
        </span>
        <span>{readingSummary(reading, language)}</span>
      </p>
      <div className="journal-copy-status" role="status">
        {status === "copying"
          ? chinese
            ? "正在写入当前牌阵，请等到出现“已复制”再粘贴。"
            : "Writing this reading to the clipboard. Wait for “Copied” before pasting."
          : status === "copied"
            ? chinese
              ? `已复制当前牌阵：${copiedSummary}`
              : `Copied this reading: ${copiedSummary}`
            : null}
      </div>
      {status === "manual" ? (
        <label className="journal-field">
          {chinese
            ? "浏览器未允许自动复制，请在下方全选复制。"
            : "Clipboard permission unavailable. Select and copy the text below."}
          <textarea
            readOnly
            rows={9}
            value={manualText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      ) : null}
    </section>
  );
}
