"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { profiles, skillMeasurements } from "@/lib/db/schema";
import { localDate } from "@/lib/game/dates";
import { addMeasurement, type MeasurementInput } from "@/lib/server/game/measurements";
import { requireUserId } from "@/lib/server/session";

/** Новый замер навыка (тест, измерение). На опыт не влияет. */
export async function recordMeasurement(input: MeasurementInput): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const res = await withUser(userId, async (tx) => {
    const [p] = await tx.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.id, userId));
    return addMeasurement(tx, userId, input, localDate(new Date(), p?.tz || "UTC"), "manual");
  });
  revalidatePath("/skills");
  return res.ok ? {} : { error: `measurement_${res.error}` };
}

export async function deleteMeasurement(id: string): Promise<void> {
  const userId = await requireUserId();
  z.uuid().parse(id);
  await withUser(userId, (tx) =>
    tx.delete(skillMeasurements).where(and(eq(skillMeasurements.id, id), eq(skillMeasurements.userId, userId))),
  );
  revalidatePath("/skills");
}
