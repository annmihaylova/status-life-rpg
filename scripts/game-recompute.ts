/**
 * pnpm game:recompute [--user <uuid>] [--verify]
 *
 * Пересчитывает уровни, навыки, характеристики, HP и леджер из сырых данных (SPEC 3.6).
 * Без --user — все пользователи. С --verify — второй прогон и сравнение: результат обязан совпасть.
 * Подключение — DATABASE_URL (из окружения или .env.local).
 */
import { createDb } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { recomputeUser } from "@/lib/server/game/recompute";

try {
  process.loadEnvFile(".env.local");
} catch {
  // переменные уже в окружении
}

const args = process.argv.slice(2);
const userArg = args.includes("--user") ? args[args.indexOf("--user") + 1] : null;
const verify = args.includes("--verify");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

async function main(databaseUrl: string): Promise<number> {
  const { db, close } = createDb(databaseUrl, 2);
  let failed = 0;
  try {
    const users = userArg
      ? [userArg]
      : (await db.select({ id: profiles.id }).from(profiles)).map((p) => p.id);
    const now = new Date();
    for (const id of users) {
      const first = await recomputeUser(db, id, now);
      const r = first.result;
      let line = `${id}: ур. ${r.character.level}, ${Math.round(r.character.totalXp)} XP, навыков ${
        Object.keys(r.skills).length
      }, записей в леджере ${r.ledger.length}`;
      if (first.skippedDecisions.length)
        line += `, пропущено битых решений ${first.skippedDecisions.length}`;
      if (r.rejectedDecisions.length) line += `, отклонено решений ${r.rejectedDecisions.length}`;
      if (verify) {
        const second = await recomputeUser(db, id, now);
        const same = JSON.stringify(second.result) === JSON.stringify(first.result);
        line += same ? " — повтор совпал" : " — ПОВТОР НЕ СОВПАЛ";
        if (!same) failed += 1;
      }
      console.log(line);
    }
    console.log(`Готово: ${users.length} польз.`);
  } finally {
    await close();
  }
  return failed;
}

main(url).then(
  (failed) => process.exit(failed ? 1 : 0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
