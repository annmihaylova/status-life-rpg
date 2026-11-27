import { eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { Panel } from "@/components/ui/primitives";
import { withUser } from "@/lib/db";
import { userTitles } from "@/lib/db/schema";
import { parseAvatar } from "@/lib/game/avatar";
import { TITLES } from "@/lib/game/progression";
import { getOnboardingState } from "@/lib/server/game/queries";
import { requireUserId } from "@/lib/server/session";
import { CharacterForm } from "./character-form";
import { TitlePicker } from "./title-picker";

export default async function CharacterPage() {
  const userId = await requireUserId();
  const [{ character }, t, tt, locale, earnedRows] = await Promise.all([
    getOnboardingState(userId),
    getTranslations("character"),
    getTranslations("titles"),
    getLocale(),
    withUser(userId, (tx) =>
      tx.select({ key: userTitles.titleKey, at: userTitles.earnedAt }).from(userTitles).where(eq(userTitles.userId, userId)),
    ),
  ]);
  const en = locale === "en";
  const earned = new Map(earnedRows.map((r) => [r.key, r.at.toISOString().slice(0, 10)]));
  const titles = TITLES.map((x) => ({
    key: x.key,
    name: en ? x.en : x.ru,
    description: en ? x.desc_en : x.desc_ru,
    earnedOn: earned.get(x.key) ?? null,
  })).sort((a, b) => (b.earnedOn ?? "").localeCompare(a.earnedOn ?? ""));

  return (
    <>
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <CharacterForm initialAvatar={parseAvatar(character?.avatarConfig)} initialName={character?.gameName ?? ""} />
      <Panel title={tt("title")}>
        <TitlePicker titles={titles} worn={character?.titleKey ?? null} />
      </Panel>
    </>
  );
}
