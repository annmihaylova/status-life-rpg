import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { buildCheckinUserMessage, CHECKIN_SYSTEM_PROMPT } from "@/lib/checkin/prompt";
import { llmCheckinSchema, type CheckinContext, type LlmCheckin } from "@/lib/checkin/schema";
import { LLM_CONFIG } from "./config";

let _client: Anthropic | undefined;

export function llmAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function client(): Anthropic {
  _client ??= new Anthropic();
  return _client;
}

export class LlmError extends Error {
  constructor(public code: "refusal" | "unparsed" | "unavailable" | "rate_limited") {
    super(code);
  }
}

/**
 * Разбор вечернего отчёта в черновики. Структурированный ответ по zod-схеме
 * (structured outputs: у модели нет принудительного tool_choice, а нужен только JSON).
 * Отказ модели безопасности перехватывается серверным fallback'ом.
 */
export async function parseCheckinWithLlm(ctx: CheckinContext, transcript: string): Promise<LlmCheckin> {
  if (!llmAvailable()) throw new LlmError("unavailable");
  try {
    const response = await client().beta.messages.parse({
      model: LLM_CONFIG.model,
      max_tokens: LLM_CONFIG.maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: LLM_CONFIG.effort, format: betaZodOutputFormat(llmCheckinSchema) },
      system: [{ type: "text", text: CHECKIN_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildCheckinUserMessage(ctx, transcript) }],
    });
    if (response.stop_reason === "refusal") throw new LlmError("refusal");
    if (!response.parsed_output) throw new LlmError("unparsed");
    return response.parsed_output;
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new LlmError("rate_limited");
    if (e instanceof Anthropic.AuthenticationError) throw new LlmError("unavailable");
    throw e;
  }
}
