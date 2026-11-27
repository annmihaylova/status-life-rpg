import { adminDb } from "@/lib/db";
import { handleIngest } from "@/lib/server/devices";

// Данные с часов и телефона: сон, тренировки, ходьба (Status → Настройки → Часы и телефон).
export const runtime = "nodejs";
export const maxDuration = 60;

export function POST(req: Request): Promise<Response> {
  return handleIngest(adminDb(), req);
}
