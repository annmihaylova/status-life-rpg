import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { withUser } from "@/lib/db";
import { attributeAssessment } from "@/lib/db/schema";
import { parseAvatar } from "@/lib/game/avatar";
import type { AssessmentReason, Locale } from "@/lib/game/onboarding";
import { getGameView, getOnboardingState } from "@/lib/server/game/queries";
import { llmAvailable } from "@/lib/server/llm/checkin";
import { requireUserId } from "@/lib/server/session";
import { OnboardingWizard, type WizardData } from "./wizard";

export default async function OnboardingPage() {
  const userId = await requireUserId();
  const [{ onboarding, character, skills }, view, locale] = await Promise.all([
    getOnboardingState(userId),
    getGameView(userId),
    getLocale(),
  ]);
  if (onboarding?.completedAt) redirect("/");

  const [assessment] = await withUser(userId, (tx) =>
    tx.select().from(attributeAssessment).where(eq(attributeAssessment.userId, userId)),
  );
  const start = view.result.calibrations.find((c) => c.kind === "start");

  const data: WizardData = {
    locale: locale as Locale,
    answers: {
      ageBand: onboarding?.ageBand ?? null,
      occupations: onboarding?.occupations ?? [],
      groups: onboarding?.groups ?? [],
      goals: onboarding?.goals ?? [],
      otherGroup: onboarding?.aboutText ?? "",
    },
    sleeping: skills
      .filter((s) => s.status === "sleeping" || s.sleepingPastHours != null)
      .map((s) => ({
        id: s.id,
        name: s.name,
        hours: s.sleepingPastHours ?? 0,
        target: s.sleepingTargetLevel ?? 1,
        removable: s.status === "sleeping",
      })),
    takenNames: skills.filter((s) => s.sleepingPastHours == null).map((s) => s.name.toLowerCase()),
    assessed: Boolean(assessment),
    reasons: (assessment?.explanations ?? null) as Record<string, AssessmentReason[]> | null,
    values: {
      body: view.result.attributes.body?.value ?? 10,
      mind: view.result.attributes.mind?.value ?? 10,
      spirit: view.result.attributes.spirit?.value ?? 10,
    },
    calibration: start
      ? { base: start.base, keys: start.keys, closed: start.closed, rules: start.rules }
      : null,
    gameName: character?.gameName ?? "",
    avatar: parseAvatar(character?.avatarConfig),
    llm: llmAvailable(),
  };

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <OnboardingWizard data={data} />
    </main>
  );
}
