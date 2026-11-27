import { and, asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Panel } from "@/components/ui/primitives";
import { withUser } from "@/lib/db";
import { activityEntries, checkins, entrySkillAllocations, skillCandidates, skills } from "@/lib/db/schema";
import { requireUserId } from "@/lib/server/session";
import { ReviewList, type ReviewDraft } from "./review-list";

export default async function CheckinReviewPage({ params }: PageProps<"/checkin/[id]">) {
  const userId = await requireUserId();
  const { id } = await params;
  const t = await getTranslations("checkin");

  const data = await withUser(userId, async (tx) => {
    const [checkin] = await tx
      .select()
      .from(checkins)
      .where(and(eq(checkins.id, id), eq(checkins.userId, userId)));
    if (!checkin) return null;
    const drafts = await tx
      .select()
      .from(activityEntries)
      .where(and(eq(activityEntries.checkinId, id), eq(activityEntries.status, "draft")))
      .orderBy(asc(activityEntries.createdAt), asc(activityEntries.id));
    const ids = drafts.map((d) => d.id);
    const allocs = ids.length
      ? await tx
          .select({
            entryId: entrySkillAllocations.entryId,
            share: entrySkillAllocations.share,
            skillName: skills.name,
            cluster: entrySkillAllocations.activityCluster,
          })
          .from(entrySkillAllocations)
          .leftJoin(skills, eq(skills.id, entrySkillAllocations.skillId))
          .where(inArray(entrySkillAllocations.entryId, ids))
      : [];
    const cands = await tx
      .select({ cluster: skillCandidates.clusterKey, name: skillCandidates.suggestedName })
      .from(skillCandidates)
      .where(eq(skillCandidates.userId, userId));
    const targetIds = drafts.map((d) => d.mergeWith).filter((x): x is string => Boolean(x));
    const targets = targetIds.length
      ? await tx
          .select({ id: activityEntries.id, description: activityEntries.description, minutes: activityEntries.focusMinutes })
          .from(activityEntries)
          .where(inArray(activityEntries.id, targetIds))
      : [];
    return { checkin, drafts, allocs, cands, targets };
  });
  if (!data) notFound();

  const candName = new Map(data.cands.map((c) => [c.cluster, c.name ?? c.cluster]));
  const target = new Map(data.targets.map((x) => [x.id, x]));
  const drafts: ReviewDraft[] = data.drafts.map((d) => ({
    id: d.id,
    description: d.description,
    quote: d.evidence ?? "",
    minutes: d.focusMinutes,
    intensity: d.intensity,
    novelty: d.novelty,
    isRest: d.isRest,
    confidence: d.confidence ?? 1,
    skills: data.allocs
      .filter((a) => a.entryId === d.id)
      .map((a) => ({ name: a.skillName ?? candName.get(a.cluster ?? "") ?? a.cluster ?? "—", share: a.share, isNew: !a.skillName })),
    merge: d.mergeWith && target.get(d.mergeWith)
      ? { description: target.get(d.mergeWith)!.description, minutes: target.get(d.mergeWith)!.minutes }
      : null,
  }));
  const questions = ((data.checkin.llmRaw as { questions?: string[] } | null)?.questions ?? []).slice(0, 3);

  return (
    <>
      <h1 className="text-lg font-semibold">{t("reviewTitle")}</h1>
      <details className="system-panel p-4">
        <summary className="cursor-pointer text-sm text-muted">{t("yourReport")}</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm">{data.checkin.transcript}</p>
      </details>
      {questions.length > 0 && (
        <Panel title={t("questions")}>
          <ul className="list-inside list-disc space-y-1 text-sm">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{t("questionsHint")}</p>
        </Panel>
      )}
      <ReviewList checkinId={id} drafts={drafts} />
    </>
  );
}
