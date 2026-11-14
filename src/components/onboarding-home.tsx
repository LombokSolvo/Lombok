"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight, PiggyBank, Sprout, Wallet } from "lucide-react";
import { LiveWeeklyEuro } from "@/components/live-budget";
import { Group, IconTile, Row, eur, primaryButton } from "@/components/solvo/ui";
import { AINO_GOALS, AINO_PLAN_SPLIT } from "@/data/portfolio";
import { readOnboarding, useOnboarding } from "@/lib/onboarding-store";
import { readDemoMode, syncDemoCookie, useDemoMode } from "@/lib/switches";

/** First visit: send the person to onboarding once. "Skip for now" there means they are not asked again. */
export function OnboardingGate() {
  const router = useRouter();
  useEffect(() => {
    // A browser that chose its demo account before the server could see it: fix the cookie and reload once.
    if (syncDemoCookie()) return window.location.reload();
    // Read storage directly: the hook returns an empty snapshot while the page hydrates.
    // Only the "New customer" demo account is sent to onboarding; Aino (the default) is already set up.
    if (readDemoMode() !== "new") return;
    const s = readOnboarding();
    if (!s.completedAt && !s.skipped) router.replace("/onboarding");
  }, [router]);
  return null;
}

/**
 * On Home: the plan the person approved, or a way to build one. Aino starts with her plan already in place (her spending
 * account follows the live weekly budget); a new customer sees nothing on the very first load.
 */
export function PlanCard({ weeklyBudget }: { weeklyBudget: number }) {
  const s = useOnboarding();
  const mode = useDemoMode();
  const change = <Link href="/onboarding" className="font-medium text-primary underline underline-offset-4">Change</Link>;

  if (!s.completedAt && mode === "aino") {
    return (
      <Group title="Your plan" aside={change} className="mt-4">
        <Row icon={<IconTile><Wallet /></IconTile>} title="Spending account" value={<><LiveWeeklyEuro base={weeklyBudget} />/week</>} />
        <Row icon={<IconTile><PiggyBank /></IconTile>} title="Savings account" subtitle={AINO_GOALS.map((g) => g.label).join(", ")} value={`${eur.format(AINO_PLAN_SPLIT.savingsMonthly)}/mo`} />
        <Row icon={<IconTile><Sprout /></IconTile>} title="Investing budget" subtitle="You choose where it goes" value={`${eur.format(AINO_PLAN_SPLIT.investMonthly)}/mo`} />
      </Group>
    );
  }

  if (s.completedAt) {
    return (
      <Group title="Your plan" aside={change} className="mt-4">
        <Row icon={<IconTile><Wallet /></IconTile>} title="Spending account" value={`${eur.format(s.spendWeekly ?? 0)}/week`} />
        <Row icon={<IconTile><PiggyBank /></IconTile>} title="Savings account" subtitle={s.goals?.length ? s.goals.map((g) => g.label).join(", ") : undefined} value={`${eur.format(s.savingsMonthly ?? 0)}/mo`} />
        <Row icon={<IconTile><Sprout /></IconTile>} title="Investing budget" subtitle="You choose where it goes" value={`${eur.format(s.investMonthly ?? 0)}/mo`} />
      </Group>
    );
  }
  if (s.skipped) {
    return (
      <Link href="/onboarding" className={`${primaryButton} mt-4`}>
        Build your plan, 1 minute
        <ArrowRight className="size-[18px]" aria-hidden />
      </Link>
    );
  }
  return null;
}
