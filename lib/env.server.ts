import "server-only";
import { z } from "zod";

/** Серверные секреты. Никогда не импортируй этот файл в клиентский код. */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

export function serverEnv() {
  return serverSchema.parse({ DATABASE_URL: process.env.DATABASE_URL });
}
