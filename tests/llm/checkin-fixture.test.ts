/**
 * Обязательный e2e-кейс из SPEC 8: разбор эталонного отчёта настоящей моделью.
 * Платный: запускается только при ANTHROPIC_API_KEY — `pnpm test:llm`.
 */
import { describe, expect, it } from "vitest";
import { normalizeCheckin } from "@/lib/checkin/normalize";
import type { CheckinContext } from "@/lib/checkin/schema";
import { parseCheckinWithLlm } from "@/lib/server/llm/checkin";

const REPORT =
  "Сегодня встала в девять, два часа слушала лекцию по биологии, параллельно разбиралась с Claude в новом проекте по белкам — по чату это часов пять, но реально я уделила белкам часа полтора-два. Потом решала домашку по матану около часа, было тяжело. Вечером час занималась с учеником физикой. Потом немного отдохнула, почитала книжку.";

const SKILLS = [
  { ref: "s1", name: "Биология", scope: "лекции, учебники и задачи по биологии" },
  { ref: "s2", name: "Математика", scope: "задачи, доказательства, вычисления, математические курсы" },
  { ref: "s3", name: "Преподавание", scope: "уроки, репетиторство, объяснение другим" },
  { ref: "s4", name: "Научная работа", scope: "исследовательские проекты, анализ данных, научные тексты" },
  { ref: "s5", name: "Книжный червь", scope: "чтение сложных текстов: научные статьи, учебники, документация" },
];
const ID: Record<string, string> = { s1: "bio", s2: "math", s3: "teach", s4: "research", s5: "bookworm" };
const refs = (entries: Record<string, string> = {}) => ({
  skills: new Map(Object.entries(ID)),
  entries: new Map(Object.entries(entries)),
});

const ctx = (dayEntries: CheckinContext["dayEntries"] = []): CheckinContext => ({
  date: "2026-11-25",
  skills: SKILLS,
  candidates: [],
  dayEntries,
});

const FORBIDDEN = /bio120|домашк|prodigy/i;

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("SPEC 8: эталонный вечерний отчёт", () => {
  it("5 разумных черновиков без раздувания времени и выдуманного сна", async () => {
    const raw = await parseCheckinWithLlm(ctx(), REPORT);
    const r = normalizeCheckin(raw, refs());
    const by = (skill: string) => r.entries.find((e) => e.allocations.some((a) => a.skillId === skill));

    expect(r.entries).toHaveLength(5);

    const lecture = by("bio");
    expect(lecture?.focusMinutes).toBeGreaterThanOrEqual(100);
    expect(lecture?.focusMinutes).toBeLessThanOrEqual(130);

    const protein = by("research");
    expect(protein?.focusMinutes).toBeGreaterThanOrEqual(85);
    expect(protein?.focusMinutes).toBeLessThanOrEqual(125); // а не 300

    const math = by("math");
    expect(math?.focusMinutes).toBeGreaterThanOrEqual(45);
    expect(math?.focusMinutes).toBeLessThanOrEqual(75);
    expect(math?.intensity).toBeGreaterThanOrEqual(1.3);

    const tutoring = by("teach");
    expect(tutoring?.focusMinutes).toBeGreaterThanOrEqual(45);
    expect(tutoring?.focusMinutes).toBeLessThanOrEqual(75);

    expect(r.entries.some((e) => e.isRest)).toBe(true); // чтение для удовольствия — отдых

    const names = [...r.clusters.map((c) => `${c.cluster} ${c.name}`), ...r.entries.flatMap((e) => e.allocations.map((a) => a.cluster ?? ""))];
    for (const n of names) expect(n).not.toMatch(FORBIDDEN);

    expect(r.wellbeing.sleepHours).toBeNull(); // известно только время подъёма
  }, 180_000);

  it("если Claude днём уже залогал белки — вместо дубля merge_with", async () => {
    const raw = await parseCheckinWithLlm(
      ctx([{ ref: "e1", description: "PRODIGY: проект по белкам с Claude", minutes: 90, skills: ["Научная работа"] }]),
      REPORT,
    );
    const r = normalizeCheckin(raw, refs({ e1: "entry-protein" }));
    const merged = r.entries.filter((e) => e.mergeWith === "entry-protein");
    expect(merged).toHaveLength(1);
    const proteinDuplicates = r.entries.filter(
      (e) => !e.mergeWith && e.allocations.some((a) => a.skillId === "research"),
    );
    expect(proteinDuplicates).toHaveLength(0);
  }, 180_000);
});
