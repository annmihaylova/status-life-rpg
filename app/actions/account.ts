"use server";

import { redirect } from "next/navigation";
import { adminDb } from "@/lib/db";
import { deleteUserAccount, isDeleteConfirmed } from "@/lib/server/account";
import { requireUserId } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Удалить аккаунт со всеми данными (SPEC 11). Нужно ввести слово «удалить» (или «delete»).
 * Файлы в Storage (бакет vrm-user, остался от фазы 4) удаляем от имени пользователя:
 * политики разрешают ему свою папку, а прямое удаление строк storage запрещено.
 */
export async function deleteAccount(confirmWord: string): Promise<{ error?: string }> {
  const userId = await requireUserId();
  if (!isDeleteConfirmed(confirmWord)) return { error: "delete_confirm" };

  const supabase = await createClient();
  try {
    const bucket = supabase.storage.from("vrm-user");
    const { data: files } = await bucket.list(userId);
    if (files?.length) await bucket.remove(files.map((f) => `${userId}/${f.name}`));
  } catch {
    // файлов может не быть — удаление аккаунта это не останавливает
  }

  await deleteUserAccount(adminDb(), userId);
  // пользователя уже нет: только чистим cookie сессии, без запроса к Auth
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?deleted=1");
}
