import "server-only";
import { baseModelUrl, type Model3d } from "@/lib/game/avatar";
import { createClient } from "@/lib/supabase/server";

export const VRM_BUCKET = "vrm-user";

/** Адрес модели для показа: базовая — статика, своя — подписанная ссылка на час (бакет приватный). */
export async function modelUrlFor(userId: string, m: Model3d): Promise<string | null> {
  if (!m) return null;
  if (m.source === "base") return baseModelUrl(m.key);
  if (!m.path.startsWith(`${userId}/`)) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(VRM_BUCKET).createSignedUrl(m.path, 3600);
  return data?.signedUrl ?? null;
}
