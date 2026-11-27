import { describe, expect, it } from "vitest";
import { appendTranscript, claudePrompt, collectResults } from "./voice";

describe("склейка голосового ввода", () => {
  it("первая фраза — с заглавной, следующие — через точку", () => {
    let t = appendTranscript("", "два часа слушала лекцию", 1000);
    expect(t).toBe("Два часа слушала лекцию");
    t = appendTranscript(t, "  потом решала  задачи ", 1000);
    expect(t).toBe("Два часа слушала лекцию. Потом решала задачи");
  });

  it("после знака препинания точку не дублирует", () => {
    expect(appendTranscript("Было тяжело!", "вечером отдыхала", 1000)).toBe("Было тяжело! Вечером отдыхала");
    expect(appendTranscript("Сделала так: ", "прочитала статью", 1000)).toBe("Сделала так: Прочитала статью");
  });

  it("пустой фрагмент ничего не меняет, лимит соблюдается", () => {
    expect(appendTranscript("Текст", "   ", 1000)).toBe("Текст");
    expect(appendTranscript("abc", "defgh", 6)).toBe("abc. D");
  });

  it("итоговые и промежуточные результаты распознавания", () => {
    const results = [
      { isFinal: true, 0: { transcript: "читала статью " } },
      { isFinal: true, 0: { transcript: "два часа" } },
      { isFinal: false, 0: { transcript: "потом" } },
    ];
    expect(collectResults(results)).toEqual({ final: "читала статью два часа", interim: "потом" });
  });

  it("текст для Claude содержит отчёт и день", () => {
    expect(claudePrompt("Читала", "yesterday", "ru")).toMatch(/вчера[\s\S]*Читала$/);
    expect(claudePrompt("Read", "today", "en")).toMatch(/today[\s\S]*Read$/);
  });
});
