import { getTranslations } from "next-intl/server";
import { parseAvatar } from "@/lib/game/avatar";
import { getOnboardingState } from "@/lib/server/game/queries";
import { requireUserId } from "@/lib/server/session";
import { CharacterForm } from "./character-form";

export default async function CharacterPage() {
  const userId = await requireUserId();
  const [{ character }, t] = await Promise.all([getOnboardingState(userId), getTranslations("character")]);
  return (
    <>
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <CharacterForm initialAvatar={parseAvatar(character?.avatarConfig)} initialName={character?.gameName ?? ""} />
    </>
  );
}
