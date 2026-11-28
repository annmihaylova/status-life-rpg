import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  buildExportZip,
  csvCell,
  exportFileName,
  journalCsv,
  redact,
  toCsv,
  USER_TABLES,
  type ExportData,
  type UserTable,
} from "./export";

function data(over: Partial<Record<UserTable, Record<string, unknown>[]>> = {}): ExportData {
  const tables = Object.fromEntries(Object.keys(USER_TABLES).map((k) => [k, []])) as unknown as ExportData["tables"];
  return { exportedAt: "2026-11-27T12:00:00.000Z", email: "me@example.com", tables: { ...tables, ...over } };
}

describe("экспорт данных", () => {
  it("CSV: кавычки, переносы, формулы Excel", () => {
    expect(csvCell('сказал "привет", ушёл')).toBe('"сказал ""привет"", ушёл"');
    expect(csvCell("две\nстроки")).toBe('"две\nстроки"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-12.5")).toBe("-12.5");
    expect(csvCell(null)).toBe("");
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
    expect(toCsv(["a", "b"], [{ a: 1, b: "x" }])).toBe("﻿a,b\r\n1,x\r\n");
  });

  it("хэши токенов и ключи push не попадают в экспорт", () => {
    const rows = redact("api_tokens", [{ id: "t1", label: "Claude", token_hash: "secret" }]);
    expect(rows).toEqual([{ id: "t1", label: "Claude" }]);
    expect(redact("push_subscriptions", [{ id: "p", endpoint: "https://x", keys: {}, created_at: "d" }])).toEqual([
      { id: "p", created_at: "d" },
    ]);
  });

  it("журнал: записи по дате с навыками и долями", () => {
    const csv = journalCsv(
      data({
        skills: [{ id: "s1", name: "Книжный червь" }],
        activity_entries: [
          { id: "e2", date: "2026-11-27", focus_minutes: 30, description: "бег", status: "confirmed", source: "manual" },
          { id: "e1", date: "2026-11-26", focus_minutes: 60, description: "читала", status: "confirmed", source: "checkin" },
        ],
        entry_skill_allocations: [
          { entry_id: "e1", skill_id: "s1", share: 0.7 },
          { entry_id: "e1", skill_id: null, activity_cluster: "вязание", share: 0.3 },
        ],
      }),
    );
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("date,started_at,minutes,description,skills,status,source,confirmed_at");
    expect(lines[1]).toBe('2026-11-26,,60,читала,"Книжный червь 70%; вязание 30%",confirmed,checkin,');
    expect(lines[2]).toContain("2026-11-27,,30,бег");
  });

  it("архив: README, data.json и три CSV", () => {
    const zip = unzipSync(buildExportZip(data({ skills: [{ id: "s1", name: "Бег", level_cache: 3, xp_cache: 120.4 }] })));
    expect(Object.keys(zip).sort()).toEqual(["README.txt", "data.json", "journal.csv", "skills.csv", "wellbeing.csv"]);
    const json = JSON.parse(strFromU8(zip["data.json"]));
    expect(json.email).toBe("me@example.com");
    expect(json.tables.skills[0].name).toBe("Бег");
    expect(strFromU8(zip["skills.csv"])).toContain("Бег,3,120");
    expect(exportFileName(new Date("2026-11-27T23:00:00Z"))).toBe("status-export-2026-11-27.zip");
  });
});
