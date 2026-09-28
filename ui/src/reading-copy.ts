import type { ConfirmedReading, Language } from "./types.js";

function formatReadingDate(timestamp: string | undefined, language: Language) {
  if (!timestamp) return language === "zh" ? "日期未记录" : "Date not recorded";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatReadingForCopy(
  reading: ConfirmedReading,
  language: Language,
): string {
  const chinese = language === "zh";
  const positions = reading.cards.map(
    (card, index) =>
      card.position ||
      (chinese ? `牌位 ${index + 1}` : `Position ${index + 1}`),
  );
  const lines = [
    `${chinese ? "问题" : "Question"}：${reading.question || (chinese ? "未填写" : "Not provided")}`,
    "",
    `${chinese ? "牌阵" : "Spread"}：${reading.spreadName}（${positions.join("/")}）`,
    "",
    formatReadingDate(reading.timestamp, language),
    "",
    chinese ? "抽牌结果：" : "Draw result:",
    "",
  ];
  reading.cards.forEach((card, index) => {
    const orientation = chinese
      ? card.orientation === "upright"
        ? "正位"
        : "逆位"
      : card.orientation;
    lines.push(
      `${index + 1}. ${card.position || (chinese ? `牌位 ${index + 1}` : `Position ${index + 1}`)}：${card.displayName}（${orientation}）`,
    );
  });
  return lines.join("\n");
}
