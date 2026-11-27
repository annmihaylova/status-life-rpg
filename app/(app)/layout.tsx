import { redirect } from "next/navigation";
import { BottomNav } from "@/components/game/bottom-nav";
import { getOnboardingState } from "@/lib/server/game/queries";
import { requireUserId } from "@/lib/server/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const userId = await requireUserId();
  const { onboarding } = await getOnboardingState(userId);
  if (!onboarding?.completedAt) redirect("/onboarding");
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pt-4 pb-28">{children}</main>
      <BottomNav />
    </>
  );
}
