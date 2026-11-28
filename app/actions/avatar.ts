"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { characters } from "@/lib/db/schema";
import { parseAvatar } from "@/lib/game/avatar";
import { VRM_BUCKET } from "@/lib/server/avatar";
import { requireUserId } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import { inspectVrm } from "@/lib/vrm/inspect";

const pathSchema = z.string().regex(/^[0-9a-f-]{36}\/[0-9a-z-]{1,40}\.vrm$/);

/**
 * После загрузки своей модели в Storage: сервер проверяет файл (glTF-binary с расширением VRM,
 * до 30 МБ), удаляет прежние версии и выбирает модель как внешность персонажа.
 */
export async function confirmCustomModel(path: string): Promise<{ error?: string; title?: string | null }> {
  const userId = await requireUserId();
  const p = pathSchema.safeParse(path);
  if (!p.success || !p.data.startsWith(`${userId}/`)) return { error: "model_not_found" };
  const supabase = await createClient();
  const storage = supabase.storage.from(VRM_BUCKET);

  const { data: file, error } = await storage.download(p.data);
  if (error || !file) return { error: "model_not_found" };
  const check = inspectVrm(await file.arrayBuffer());
  if (!check.ok) {
    await storage.remove([p.data]);
    return { error: `vrm_${check.error}` };
  }

  // одна своя модель на пользователя: старые версии удаляем
  const { data: list } = await storage.list(userId);
  const old = (list ?? []).map((o) => `${userId}/${o.name}`).filter((n) => n !== p.data);
  if (old.length) await storage.remove(old);

  await withUser(userId, async (tx) => {
    const [c] = await tx.select({ cfg: characters.avatarConfig }).from(characters).where(eq(characters.userId, userId));
    const cfg = { ...parseAvatar(c?.cfg), model3d: { source: "custom" as const, path: p.data } };
    await tx.update(characters).set({ avatarConfig: cfg, updatedAt: new Date() }).where(eq(characters.userId, userId));
  });
  revalidatePath("/", "layout");
  return { title: check.title };
}

/** Удалить свою модель; если она выбрана — вернуться к 2D-портрету. */
export async function deleteCustomModel(): Promise<void> {
  const userId = await requireUserId();
  const supabase = await createClient();
  const storage = supabase.storage.from(VRM_BUCKET);
  const { data: list } = await storage.list(userId);
  const names = (list ?? []).map((o) => `${userId}/${o.name}`);
  if (names.length) await storage.remove(names);
  await withUser(userId, async (tx) => {
    const [c] = await tx.select({ cfg: characters.avatarConfig }).from(characters).where(eq(characters.userId, userId));
    const cfg = parseAvatar(c?.cfg);
    if (cfg.model3d?.source === "custom") {
      await tx
        .update(characters)
        .set({ avatarConfig: { ...cfg, model3d: null }, updatedAt: new Date() })
        .where(eq(characters.userId, userId));
    }
  });
  revalidatePath("/", "layout");
}
