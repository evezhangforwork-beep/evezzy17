import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ReadingHistoryClient,
  ReadingHistoryEntry,
} from "@tarot/shared/reading-history.js";
import { CopyReading } from "../CopyReading.js";
import { ReadingNotes } from "../ReadingNotes.js";
import { ReadingHistory } from "../ReadingHistory.js";
import { ReadingBoard } from "../ReadingBoard.js";
import { DrawApp } from "../DrawApp.js";
import { formatReadingForCopy } from "../reading-copy.js";
import type { DrawClient } from "../types.js";

const entry: ReadingHistoryEntry = {
  version: 1,
  savedAt: "2026-09-22T00:00:00.000Z",
  interpretations: [],
  reading: {
    readingId: "reading_fixture",
    spreadType: "two_card",
    spreadName: "两张牌",
    question: "如何开始学习？",
    language: "zh",
    timestamp: "2026-09-22T00:00:00.000Z",
    interpretation: "原始模板解读",
    cards: [
      {
        id: "fool",
        name: "The Fool",
        displayName: "愚者",
        orientation: "upright",
        position: "现状",
        keywords: ["开始"],
        positionMeaning: "当前的处境",
        meaning: "本地参考",
      },
      {
        id: "world",
        name: "The World",
        displayName: "世界",
        orientation: "reversed",
        position: "建议",
      },
    ],
  },
};
function historyClient(records = [entry]): ReadingHistoryClient {
  return {
    list: vi.fn(async () => ({
      enabled: true,
      entries: records.map(({ reading, interpretations }) => ({
        ...reading,
        interpretationCount: interpretations.length,
      })),
    })),
    get: vi.fn(async (readingId) =>
      structuredClone(
        records.find((record) => record.reading.readingId === readingId)!,
      ),
    ),
    retry: vi.fn(async () => structuredClone(entry)),
    addInterpretation: vi.fn(async (_readingId, source, text) => ({
      ...structuredClone(entry),
      interpretations: [{ id: "note_1", source, text, savedAt: entry.savedAt }],
    })),
    export: vi.fn(async () => ({
      version: 1 as const,
      entries: structuredClone(records),
    })),
  };
}
function drawClient(history?: ReadingHistoryClient): DrawClient {
  return {
    target: "web",
    history,
    beginReading: vi.fn(),
    confirmReading: vi.fn(),
    resolveImage: async () => undefined,
  };
}
beforeEach(() => {
  sessionStorage.clear();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  });
});
afterEach(() => {
  delete (document as unknown as Record<string, unknown>).execCommand;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("copies the exact ordered cards, question, spread and orientations, not transport secrets or generic interpretation", () => {
  const original = structuredClone(entry.reading);
  const prompt = formatReadingForCopy(
    { ...original, sessionId: "private_session", drawId: "private_draw" },
    "zh",
  );
  expect(prompt).toBe(
    [
      "问题：如何开始学习？",
      "",
      "牌阵：两张牌（现状/建议）",
      "",
      "2026-09-22",
      "",
      "抽牌结果：",
      "",
      "1. 现状：愚者（正位）",
      "2. 建议：世界（逆位）",
    ].join("\n"),
  );
  expect(prompt).not.toContain("private_");
  expect(prompt).not.toContain("牌位含义");
  expect(prompt).not.toContain("牌义关键词");
  expect(prompt).not.toContain("本地牌义参考");
  expect(prompt).not.toContain("当前的处境");
  expect(prompt).not.toContain("本地参考");
  expect(prompt).not.toContain("原始模板解读");
  expect(prompt).not.toContain("解读要求");
  expect(original).toEqual(entry.reading);
  const english = formatReadingForCopy(original, "en");
  expect(english).toContain("Question：如何开始学习？");
  expect(english).toContain("Spread：两张牌（现状/建议）");
  expect(english).toContain("Draw result:");
  expect(english).not.toContain("Interpretation guidelines");
  expect(english).not.toContain("Local reference meaning");
  expect(english).not.toContain("Position meaning");
});

it("formats the compact three-card copy template exactly", () => {
  expect(
    formatReadingForCopy(
      {
        ...entry.reading,
        question: "我在他心中的印象",
        spreadName: "自定义牌阵",
        timestamp: "2026-09-28T07:09:43.000Z",
        cards: [
          {
            ...entry.reading.cards[0],
            displayName: "宝剑侍从（Page of Swords）",
            position: "整体",
            orientation: "reversed",
          },
          {
            ...entry.reading.cards[0],
            id: "chariot",
            displayName: "战车（The Chariot）",
            position: "认可",
            orientation: "reversed",
          },
          {
            ...entry.reading.cards[0],
            id: "page_of_wands",
            displayName: "权杖侍从（Page of Wands）",
            position: "顾虑",
            orientation: "upright",
          },
        ],
      },
      "zh",
    ),
  ).toBe(
    [
      "问题：我在他心中的印象",
      "",
      "牌阵：自定义牌阵（整体/认可/顾虑）",
      "",
      "2026-09-28",
      "",
      "抽牌结果：",
      "",
      "1. 整体：宝剑侍从（Page of Swords）（逆位）",
      "2. 认可：战车（The Chariot）（逆位）",
      "3. 顾虑：权杖侍从（Page of Wands）（正位）",
    ].join("\n"),
  );
});

it("copies with one click without sending a network request", async () => {
  const clipboard = { writeText: vi.fn(async () => undefined) };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<CopyReading reading={entry.reading} language="zh" />);
  expect(screen.getByText("本次复制目标")).not.toBeNull();
  expect(screen.getByText("愚者（正位） · 世界（逆位）")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "一键复制牌阵" }));
  await screen.findByText("已复制当前牌阵：愚者（正位） · 世界（逆位）");
  expect(clipboard.writeText).toHaveBeenCalledWith(
    formatReadingForCopy(entry.reading, "zh"),
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("link")).toBeNull();
});

it("synchronously replaces old clipboard contents when the browser supports it", async () => {
  const copiedValues: string[] = [];
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn(() => {
      const copyEvent = new Event("copy", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(copyEvent, "clipboardData", {
        value: {
          setData: (_format: string, value: string) => copiedValues.push(value),
        },
      });
      document.dispatchEvent(copyEvent);
      return true;
    }),
  });
  const clipboard = { writeText: vi.fn(async () => undefined) };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
  render(<CopyReading reading={entry.reading} language="zh" />);
  fireEvent.click(screen.getByRole("button", { name: "一键复制牌阵" }));
  await screen.findByText("已复制当前牌阵：愚者（正位） · 世界（逆位）");
  expect(copiedValues).toEqual([formatReadingForCopy(entry.reading, "zh")]);
  expect(clipboard.writeText).not.toHaveBeenCalled();
});

it("shows that asynchronous copying is still in progress", async () => {
  let finishCopy: (() => void) | undefined;
  const clipboard = {
    writeText: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCopy = resolve;
        }),
    ),
  };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
  render(<CopyReading reading={entry.reading} language="zh" />);
  fireEvent.click(screen.getByRole("button", { name: "一键复制牌阵" }));
  expect(
    screen.getByRole("button", { name: "正在复制…" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByText("正在写入当前牌阵，请等到出现“已复制”再粘贴。"),
  ).not.toBeNull();
  finishCopy?.();
  await screen.findByText("已复制当前牌阵：愚者（正位） · 世界（逆位）");
});

it("reads the latest visible reading at click time instead of reusing an earlier copy", async () => {
  const clipboard = { writeText: vi.fn(async () => undefined) };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
  const view = render(<CopyReading reading={entry.reading} language="zh" />);
  fireEvent.click(screen.getByRole("button", { name: "一键复制牌阵" }));
  await screen.findByText("已复制当前牌阵：愚者（正位） · 世界（逆位）");

  const latest = {
    ...entry.reading,
    readingId: "reading_latest",
    question: "这是当前问题吗？",
    cards: [
      {
        ...entry.reading.cards[1],
        id: "tower",
        displayName: "高塔",
        orientation: "upright" as const,
      },
    ],
  };
  view.rerender(<CopyReading reading={latest} language="zh" />);
  expect(screen.getByText("这是当前问题吗？")).not.toBeNull();
  expect(screen.getByText("高塔（正位）")).not.toBeNull();
  expect(
    screen.queryByText("已复制当前牌阵：愚者（正位） · 世界（逆位）"),
  ).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "一键复制牌阵" }));
  await screen.findByText("已复制当前牌阵：高塔（正位）");
  expect(clipboard.writeText).toHaveBeenLastCalledWith(
    formatReadingForCopy(latest, "zh"),
  );
});

it("offers selectable text when clipboard permission is denied", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  render(<CopyReading reading={entry.reading} language="zh" />);
  fireEvent.click(screen.getByRole("button", { name: "一键复制牌阵" }));
  const fallback = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
  expect(fallback.value).toBe(formatReadingForCopy(entry.reading, "zh"));
  fireEvent.focus(fallback);
  expect(fallback.selectionEnd).toBe(fallback.value.length);
});

it("keeps copy and history hidden until all cards have been revealed", () => {
  render(
    <ReadingBoard
      reading={entry.reading}
      client={drawClient()}
      language="zh"
      onRestart={vi.fn()}
      onOpenHistory={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "一键复制牌阵" })).toBeNull();
  expect(screen.queryByRole("button", { name: "历史与回望" })).toBeNull();
});

it("keeps earlier saved interpretations read-only without paste controls", async () => {
  const savedEntry = structuredClone(entry);
  savedEntry.interpretations = [
    {
      id: "note_1",
      source: "旧版记录",
      text: "保留此前已经保存的解读",
      savedAt: entry.savedAt,
    },
  ];
  const client = historyClient([savedEntry]);
  render(
    <ReadingNotes
      readingId={entry.reading.readingId}
      client={client}
      language="zh"
    />,
  );
  await screen.findByText("✓ 问题和抽牌结果已保存到本机历史。");
  expect(screen.getByText("保留此前已经保存的解读")).not.toBeNull();
  expect(screen.queryByLabelText("解读或复盘内容")).toBeNull();
  expect(screen.queryByRole("button", { name: "保存这版解读" })).toBeNull();
  expect(client.addInterpretation).not.toHaveBeenCalled();
});

it("does not claim a failed archive was saved and retries without drawing", async () => {
  const client = historyClient();
  vi.mocked(client.get).mockRejectedValue(new Error("尚未存入历史"));
  render(
    <ReadingNotes
      readingId={entry.reading.readingId}
      client={client}
      language="zh"
    />,
  );
  await screen.findByRole("alert");
  expect(screen.queryByText("✓ 问题和抽牌结果已保存到本机历史。")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "重试保存结果" }));
  await screen.findByText("✓ 问题和抽牌结果已保存到本机历史。");
  expect(client.retry).toHaveBeenCalledWith(entry.reading.readingId);
});

it("searches history and compares two readings without paste controls", async () => {
  const second = {
    ...structuredClone(entry),
    reading: {
      ...entry.reading,
      readingId: "reading_second",
      question: "如何坚持练习？",
    },
  };
  const third = {
    ...structuredClone(entry),
    reading: {
      ...entry.reading,
      readingId: "reading_third",
      question: "第三条问题",
    },
  };
  const client = historyClient([entry, second, third]);
  render(<ReadingHistory client={client} language="zh" onClose={vi.fn()} />);
  await screen.findByText(entry.reading.question);
  expect(document.querySelectorAll(".journal-list-card img")).toHaveLength(6);
  expect(screen.queryByText("原始模板解读", { exact: true })).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "练习" },
  });
  expect(screen.queryByText(entry.reading.question)).toBeNull();
  expect(screen.getByText(second.reading.question)).not.toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: `选择对比：${entry.reading.question}`,
    }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: `选择对比：${second.reading.question}`,
    }),
  );
  expect(
    (
      screen.getByRole("checkbox", {
        name: `选择对比：${third.reading.question}`,
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "对比两次结果 (2/2)" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
  expect(screen.queryByLabelText("解读或复盘内容")).toBeNull();
  expect(screen.getAllByRole("button", { name: "一键复制牌阵" })).toHaveLength(
    2,
  );
});

it("does not replace history read errors with an empty-state success", async () => {
  const client = historyClient();
  vi.mocked(client.list).mockRejectedValue(
    new Error("历史文件损坏，原文件已保留"),
  );
  render(<ReadingHistory client={client} language="zh" onClose={vi.fn()} />);
  await screen.findByRole("alert");
  expect(screen.queryByText("每一次抽牌，都值得回望")).toBeNull();
});

it("preserves the question on the table when history is opened and closed", async () => {
  const client = drawClient(historyClient());
  render(<DrawApp client={client} />);
  const question = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.change(question, { target: { value: "不要丢失的问题" } });
  fireEvent.click(
    screen.getByRole("button", { name: /History & reflection|历史与回望/ }),
  );
  await screen.findByRole("dialog");
  fireEvent.click(
    screen.getByRole("button", { name: /Return to table|返回牌桌/ }),
  );
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
    "不要丢失的问题",
  );
  expect(client.beginReading).not.toHaveBeenCalled();
});
