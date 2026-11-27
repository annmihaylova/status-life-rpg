import { eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { Panel } from "@/components/ui/primitives";
import { withUser } from "@/lib/db";
import { userTitles } from "@/lib/db/schema";
import { parseAvatar } from "@/lib/game/avatar";
import { className, TITLES } from "@/lib/game/progression";
import { getGameView, getOnboardingState } from "@/lib/server/game/queries";
import { requireUserId } from "@/lib/server/session";
import { CharacterForm } from "./character-form";
import { SideClassPicker } from "./side-class";
import { TitlePicker } from "./title-picker";

export default async function CharacterPage() {
  const userId = await requireUserId();
  const [{ character }, t, tt, tcl, locale, earnedRows, view] = await Promise.all([
    getOnboardingState(userId),
    getTranslations("character"),
    getTranslations("titles"),
    getTranslations("classes"),
    getLocale(),
    withUser(userId, (tx) =>
      tx.select({ key: userTitles.titleKey, at: userTitles.earnedAt }).from(userTitles).where(eq(userTitles.userId, userId)),
    ),
    getGameView(userId),
  ]);
  const loc = locale === "en" ? "en" : "ru";
  const r = view.result;
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
      <Panel title={tcl("title")}>
        <SideClassPicker
          main={r.characterClass ? className(r.characterClass.key, loc) : null}
          side={r.sideClass ? { key: r.sideClass, name: className(r.sideClass, loc) } : null}
          options={r.classOptions.map((k) => ({ key: k, name: className(k, loc) }))}
        />
      </Panel>
      <Panel title={tt("title")}>
        <TitlePicker titles={titles} worn={character?.titleKey ?? null} />
      </Panel>
    </>
  );
}
