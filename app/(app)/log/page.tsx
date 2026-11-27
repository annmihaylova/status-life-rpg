import { getTranslations } from "next-intl/server";
import { getGameView } from "@/lib/server/game/queries";
import { requireUserId } from "@/lib/server/session";
import { LogForm } from "./log-form";

export default async function LogPage() {
  const userId = await requireUserId();
  const [view, t] = await Promise.all([getGameView(userId), getTranslations("log")]);

  const last = (id: string) => [...(view.skillMinutes.get(id)?.byDay.keys() ?? [])].sort().at(-1) ?? "";
  const skills = view.skills
    .filter((s) => s.status !== "archived")
    .map((s) => ({ id: s.id, name: s.name, isRest: s.isRest, last: last(s.id) }))
    .sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name));

  const candidates = view.candidates
    .filter((c) => c.offerStatus !== "accepted" && c.offerStatus !== "declined")
    .map((c) => c.suggestedName ?? c.clusterKey);

  return (
    <>
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <LogForm skills={skills} candidates={candidates} />
    </>
  );
}
