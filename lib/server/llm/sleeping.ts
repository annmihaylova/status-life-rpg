/**
 * Онбординг, шаг «Что ты уже умеешь?» (SPEC 2.5 п. 4): свободный текст → спящие навыки
 * с оценкой прошлых часов. Человек видит список и добавляет нужное сам.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { PART_KEYS } from "@/lib/game/attributes";
import { LLM_CONFIG } from "./config";
import { LlmError, llmAvailable } from "./checkin";

const part = z.enum(PART_KEYS);

export const sleepingSuggestionSchema = z.object({
  skills: z.array(
    z.object({
      name: z.string(),
      past_hours: z.number(),
      primary: part,
      secondary: part.nullable(),
      reasoning: z.string(),
    }),
  ),
});

export type SleepingSuggestion = z.infer<typeof sleepingSuggestionSchema>["skills"][number];

const SYSTEM = `Ты — «Система» в приложении Status. Человек описывает, что он уже умеет и как долго этим занимается. Преврати рассказ в «спящие навыки» с оценкой прошлых часов практики.

Навык — обобщённая область умения, как в резюме: «Фигурное катание», «Программирование», «Преподавание», «Кулинария», «Вождение». Не инструмент или язык («Python» → «Программирование»), не курс и не задача. Если сомневаешься между узким и широким — бери широкий. Одно умение — один навык; не дроби.

Часы оценивай реалистично по словам человека: годы × частота × длительность занятия. Если частота не названа, предположи умеренную и скажи об этом в reasoning. Не завышай: перерывы, каникулы и неравномерность тоже бывают. Если человек не назвал никакой длительности, оцени скромно.

Теги — основная и (если есть) вторичная характеристика из девяти: strength, dexterity, endurance, intellect, perception, will, charisma, empathy, creativity. reasoning — одна короткая фраза на языке рассказа: откуда взялась оценка часов.

Не выдумывай умений, которых нет в тексте. Не превращай в навыки вес, диеты и ограничения в еде.`;

let _client: Anthropic | undefined;

export async function suggestSleepingSkillsWithLlm(text: string): Promise<SleepingSuggestion[]> {
  if (!llmAvailable()) throw new LlmError("unavailable");
  _client ??= new Anthropic();
  try {
    const response = await _client.beta.messages.parse({
      model: LLM_CONFIG.model,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(sleepingSuggestionSchema) },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `<story>\n${text}\n</story>` }],
    });
    if (response.stop_reason === "refusal") throw new LlmError("refusal");
    if (!response.parsed_output) throw new LlmError("unparsed");
    return response.parsed_output.skills
      .filter((s) => s.name.trim().length >= 2 && s.past_hours > 0)
      .slice(0, 10)
      .map((s) => ({
        ...s,
        name: s.name.trim().slice(0, 60),
        past_hours: Math.round(Math.min(30_000, s.past_hours)),
        secondary: s.secondary === s.primary ? null : s.secondary,
      }));
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new LlmError("rate_limited");
    if (e instanceof Anthropic.AuthenticationError) throw new LlmError("unavailable");
    throw e;
  }
}
