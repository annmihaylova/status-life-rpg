import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { activityEntries } from "@/lib/db/schema";

/**
 * Подтверждение черновиков. Черновик со ссылкой merge_with не создаёт новую запись:
 * его значения переносятся в существующую запись (SPEC 4.2), а сам черновик удаляется.
 */
export async function confirmDrafts(tx: Tx, userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const drafts = await tx
    .select()
    .from(activityEntries)
    .where(
      and(
        eq(activityEntries.userId, userId),
        eq(activityEntries.status, "draft"),
        inArray(activityEntries.id, ids),
      ),
    );
  const now = new Date();
  for (const d of drafts) {
    if (d.mergeWith) {
      await tx
        .update(activityEntries)
        .set({
          focusMinutes: d.focusMinutes,
          intensity: d.intensity,
          novelty: d.novelty,
          description: d.description,
          isRest: d.isRest,
        })
        .where(and(eq(activityEntries.id, d.mergeWith), eq(activityEntries.userId, userId)));
      await tx.delete(activityEntries).where(eq(activityEntries.id, d.id));
    } else {
      await tx
        .update(activityEntries)
        .set({ status: "confirmed", confirmedAt: now })
        .where(eq(activityEntries.id, d.id));
    }
  }
}
