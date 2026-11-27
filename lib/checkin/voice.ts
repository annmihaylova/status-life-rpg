/**
 * Голосовой ввод отчёта (фаза 3c, PLAN 2г): распознавание речи браузера (Web Speech API).
 * Здесь — чистые помощники для склейки распознанного текста; сам микрофон — в
 * components/game/voice-input.tsx.
 */

/**
 * Дописывает распознанный фрагмент к тексту. Браузер обычно не ставит точки и заглавные,
 * поэтому фрагмент начинается с заглавной, а предыдущая фраза закрывается точкой.
 */
export function appendTranscript(prev: string, chunk: string, max: number): string {
  const piece = chunk.replace(/\s+/g, " ").trim();
  if (!piece) return prev.slice(0, max);
  const head = prev.replace(/\s+$/, "");
  const capital = piece.charAt(0).toLocaleUpperCase() + piece.slice(1);
  if (!head) return capital.slice(0, max);
  const sep = /[.!?…:;,]$/.test(head) ? " " : ". ";
  return (head + sep + capital).slice(0, max);
}

/** Итоговый и промежуточный текст текущей сессии распознавания. */
export function collectResults(
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>,
): { final: string; interim: string } {
  let final = "";
  let interim = "";
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.isFinal) final += r[0].transcript;
    else interim += r[0].transcript;
  }
  return { final: final.trim(), interim: interim.trim() };
}

/** Текст для чата с Claude, когда разбор через API не подключён: Claude запишет день через коннектор. */
export function claudePrompt(text: string, day: "today" | "yesterday", locale: string): string {
  const en = locale === "en";
  const when = en ? (day === "today" ? "today" : "yesterday") : day === "today" ? "сегодня" : "вчера";
  return en
    ? `Log my day in Status (${when}) from this report. Call list_skills and get_day first, show me the list of activities with honest focused time, and after my "ok" call log_activities.\n\n${text}`
    : `Залогай в Status мой день (${when}) по этому отчёту. Сначала вызови list_skills и get_day, покажи список активностей с честной оценкой фокусного времени и после моего «ок» вызови log_activities.\n\n${text}`;
}
