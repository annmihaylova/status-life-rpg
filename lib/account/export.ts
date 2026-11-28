/**
 * Экспорт данных пользователя (SPEC 11, фаза 5a): один ZIP с `data.json` (все таблицы как есть)
 * и CSV для таблиц, которые удобно открыть в Excel: журнал, навыки, самочувствие.
 * Чистые функции: данные собирает lib/server/account.ts.
 */
import { strToU8, zipSync } from "fflate";

/** Таблицы с данными пользователя и колонка владельца. Новая таблица — добавь сюда (тест на БД проверяет). */
export const USER_TABLES = {
  profiles: "id",
  user_settings: "user_id",
  onboarding_profiles: "user_id",
  characters: "user_id",
  user_titles: "user_id",
  user_attributes: "user_id",
  attribute_xp_tags: "user_id",
  calibrations: "user_id",
  attribute_assessment: "user_id",
  skills: "user_id",
  skill_measurements: "user_id",
  skill_specializations: "user_id",
  skill_candidates: "user_id",
  checkins: "user_id",
  activity_entries: "user_id",
  entry_skill_allocations: "user_id",
  game_decisions: "user_id",
  xp_events: "user_id",
  hp_days: "user_id",
  notification_settings: "user_id",
  push_subscriptions: "user_id",
  api_tokens: "user_id",
  weekly_chronicles: "user_id",
} as const;
export type UserTable = keyof typeof USER_TABLES;

/** Колонки, которые не отдаём даже владельцу: хэши токенов и ключи push-подписок. */
export const REDACTED: Partial<Record<UserTable, readonly string[]>> = {
  api_tokens: ["token_hash"],
  push_subscriptions: ["endpoint", "keys"],
};

export type Row = Record<string, unknown>;
export interface ExportData {
  exportedAt: string;
  email: string | null;
  tables: Record<UserTable, Row[]>;
}

export function redact(table: UserTable, rows: Row[]): Row[] {
  const drop = REDACTED[table];
  if (!drop) return rows;
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))));
}

/** Значение ячейки CSV: даты — ISO, объекты — JSON; формулы Excel обезврежены. */
export function csvCell(v: unknown): string {
  let s: string;
  if (v === null || v === undefined) s = "";
  else if (v instanceof Date) s = v.toISOString();
  else if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  // =, +, -, @ в начале Excel считает формулой (CSV injection); числа не трогаем
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: readonly string[], rows: readonly Row[]): string {
  const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))];
  // BOM — чтобы Excel открыл кириллицу в UTF-8
  return "﻿" + lines.join("\r\n") + "\r\n";
}

const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v).slice(0, 10));
const byDate = (a: Row, b: Row) => String(day(a.date)).localeCompare(String(day(b.date)));

/** Журнал: запись + на какие навыки ушло время (доли). */
export function journalCsv(data: ExportData): string {
  const skillName = new Map(data.tables.skills.map((s) => [String(s.id), String(s.name)]));
  const alloc = new Map<string, string[]>();
  for (const a of data.tables.entry_skill_allocations) {
    const name = a.skill_id ? (skillName.get(String(a.skill_id)) ?? "?") : String(a.activity_cluster ?? "?");
    const list = alloc.get(String(a.entry_id)) ?? [];
    list.push(`${name} ${Math.round(Number(a.share) * 100)}%`);
    alloc.set(String(a.entry_id), list);
  }
  const rows = [...data.tables.activity_entries].sort(byDate).map((e) => ({
    date: day(e.date),
    started_at: e.started_at,
    minutes: e.focus_minutes,
    description: e.description,
    skills: (alloc.get(String(e.id)) ?? []).join("; "),
    status: e.status,
    source: e.source,
    confirmed_at: e.confirmed_at,
  }));
  return toCsv(["date", "started_at", "minutes", "description", "skills", "status", "source", "confirmed_at"], rows);
}

export function skillsCsv(data: ExportData): string {
  const rows = data.tables.skills.map((s) => ({
    name: s.name,
    level: s.level_cache,
    xp: Math.round(Number(s.xp_cache ?? 0)),
    status: s.status,
    slot: s.slot,
    domain: s.domain,
    scope: s.scope,
    created_at: s.created_at,
  }));
  return toCsv(["name", "level", "xp", "status", "slot", "domain", "scope", "created_at"], rows);
}

export function wellbeingCsv(data: ExportData): string {
  const rows = [...data.tables.hp_days].sort(byDate).map((h) => ({
    date: day(h.date),
    sleep_hours: h.sleep_hours,
    mood_1_5: h.mood_1_5,
    sick: h.sick,
    rest_day: h.manual_rest,
    hp_morning: h.hp_morning,
    hp_max: h.hp_max,
  }));
  return toCsv(["date", "sleep_hours", "mood_1_5", "sick", "rest_day", "hp_morning", "hp_max"], rows);
}

const README = `Status — your data export

data.json      every table with your data, as stored (JSON)
journal.csv    activity log: date, minutes, description, skills and shares
skills.csv     your skills with level and XP
wellbeing.csv  sleep, mood and HP by day

Token hashes and push keys are not included.
`;

/** ZIP-архив экспорта. */
export function buildExportZip(data: ExportData): Uint8Array {
  return zipSync(
    {
      "README.txt": strToU8(README),
      "data.json": strToU8(JSON.stringify(data, null, 2)),
      "journal.csv": strToU8(journalCsv(data)),
      "skills.csv": strToU8(skillsCsv(data)),
      "wellbeing.csv": strToU8(wellbeingCsv(data)),
    },
    { level: 6 },
  );
}

/** Имя файла: status-export-2026-11-27.zip */
export function exportFileName(now: Date): string {
  return `status-export-${now.toISOString().slice(0, 10)}.zip`;
}
