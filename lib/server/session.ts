import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** id текущего пользователя из проверенного JWT; без входа — на /login. */
export async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (typeof sub !== "string") redirect("/login");
  return sub;
}
