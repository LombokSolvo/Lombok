"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronRight, Repeat, Utensils, Zap } from "lucide-react";
import { ApproveSheet } from "@/app/bills/switch-ui";
import { Chip, Group, IconTile, eur } from "@/components/solvo/ui";
import { SUBSCRIPTIONS } from "@/data/subscriptions";
import type { DemoMode } from "@/lib/demo-mode";
import { foundShare, planGap, type PlanStatus, type Trim } from "@/lib/plan-view";
import { cancelSubscription, monthlyFreed, restoreSubscription, useCancelledSubs, useSwitches } from "@/lib/switches";

// The top of the Save page: what the plan is, where it stands against a usual month, and how to get there. The
// numbers come from the last 12 months (src/lib/plan-view.ts); the list of cuts says which are done and which are
// still open, so the page always answers "what do I do next".

const STATUS: Record<PlanStatus, { tone: "green" | "warn"; label: string }> = {
  covered: { tone: "green", label: "Covered" },
  stretch: { tone: "warn", label: "A stretch" },
  short: { tone: "warn", label: "Not covered yet" },
};

/** Money found so far: approved bill switches plus subscriptions stopped, per month. */
function useFound(mode: DemoMode) {
  const switches = useSwitches();
  const cancelled = useCancelledSubs();
  const subsStopped = mode === "aino" ? SUBSCRIPTIONS.filter((s) => cancelled[s.id]).reduce((sum, s) => sum + s.monthly, 0) : 0;
  return { switches, cancelled, found: Math.round(monthlyFreed(switches) + subsStopped) };
}

/** What the plan is and how far a usual month goes towards it. `planMonthly` is null before a plan exists. */
export function PlanOverview({
  planMonthly,
  target,
  leftover,
  mode,
  into,
}: {
  planMonthly: number | null;
  target: number;
  leftover: number;
  mode: DemoMode;
  into: string; // "2 funds and your savings account"
}) {
  const { found } = useFound(mode);
  const amount = planMonthly ?? target;
  const { gap, status } = planGap(leftover, amount);
  const open = Math.max(0, gap - found);
  const state = open === 0 ? STATUS.covered : STATUS[status];
  return (
    <section className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(15,42,31,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">{planMonthly === null ? "A plan to aim for" : "You put away"}</p>
        <Chip tone={state.tone}>{state.label}</Chip>
      </div>
      <p className="num mt-1 font-display text-[34px] leading-none font-semibold tracking-[-0.03em]">
        {eur.format(amount)} <span className="text-[17px] font-medium tracking-normal text-muted-foreground">a month</span>
      </p>
      <p className="mt-1 text-[14px] text-muted-foreground">
        {planMonthly === null ? "Your savings goal. Nothing moves until you approve a plan." : `Into ${into}.`}
      </p>

      <div className="mt-4 border-t pt-3 text-[14px]">
        <div className="flex items-baseline justify-between gap-3 py-1">
          <span className="text-muted-foreground">A usual month leaves you</span>
          <span className="num font-medium">{eur.format(Math.round(leftover))}</span>
        </div>
        {gap === 0 ? (
          <>
            <div className="flex items-baseline justify-between gap-3 py-1">
              <span className="text-muted-foreground">The plan takes</span>
              <span className="num font-medium">{eur.format(amount)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1 font-semibold">
              <span>Left after the plan</span>
              <span className="num">{eur.format(Math.round(leftover - amount))} a month</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3 py-1">
              <span className="text-muted-foreground">Found so far</span>
              <span className="num font-medium">{eur.format(found)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1 font-semibold">
              <span>Still to find</span>
              <span className="num">{eur.format(open)} a month</span>
            </div>
          </>
        )}
      </div>

      {gap > 0 && (
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Share of the monthly gap found"
          aria-valuenow={foundShare(found, gap)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${foundShare(found, gap)}%` }} />
        </div>
      )}
      <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
        {open === 0
          ? gap === 0
            ? "A usual month covers the plan. The steps below free more, for a bigger plan or a goal."
            : "Your usual month and the savings you found cover the plan."
          : leftover < 0
            ? "Your usual month leaves nothing over, so the steps below come first."
            : "The steps below add up to the rest."}
      </p>
    </section>
  );
}

type Step = { key: string; icon: React.ReactNode; title: string; subtitle: string; amount: number; tag: string; done: boolean; onOpen?: () => void; href?: string };

/** The ways to free money, easiest first: subscriptions, then bills, then everyday habits. Done steps stay, ticked. */
export function CutList({ mode, trims, peer, leftover, target }: { mode: DemoMode; trims: Trim[]; peer: string | null; leftover: number; target: number }) {
  const { switches, cancelled, found } = useFound(mode);
  const [asking, setAsking] = useState<string | null>(null);

  const steps: Step[] = [];
  if (mode === "aino") {
    for (const s of SUBSCRIPTIONS) {
      const done = Boolean(cancelled[s.id]);
      steps.push({
        key: s.id,
        icon: <Repeat />,
        title: done ? `${s.name} stopped` : `Stop ${s.name}`,
        subtitle: done ? "Tap to bring it back" : `${s.what}. Charged every month`,
        amount: s.monthly,
        tag: "Easy",
        done,
        onOpen: () => (done ? restoreSubscription(s.id) : setAsking(s.id)),
      });
    }
  }
  for (const [bill, label, what] of [
    ["electricity", "electricity", "Compare electricity prices"],
    ["telecom", "phone plan", "Compare phone plans"],
  ] as const) {
    const rec = switches[bill];
    steps.push({
      key: bill,
      icon: <Zap />,
      title: rec ? `Cheaper ${label} chosen` : what,
      subtitle: rec ? `${rec.toSupplier}, ${rec.toProduct}` : "Solvo finds the cheapest offer. You approve the switch",
      amount: rec ? Math.round(rec.yearlySaving / 12) : 0,
      tag: "2 minutes",
      done: Boolean(rec),
      href: rec ? undefined : "/bills",
    });
  }
  for (const t of trims) {
    steps.push({
      key: t.id,
      icon: <Utensils />,
      title: `${t.label}: aim for ${eur.format(t.you - t.saving)} a month`,
      subtitle: `You spend ${eur.format(t.you)}, a typical ${peer ?? "customer"} ${eur.format(t.typical)}`,
      amount: t.saving,
      tag: "Habit",
      done: false,
    });
  }

  const open = steps.filter((s) => !s.done);
  const possible = open.reduce((sum, s) => sum + s.amount, 0);
  const asked = mode === "aino" ? SUBSCRIPTIONS.find((s) => s.id === asking) : undefined;
  const gap = planGap(leftover, target).gap;

  return (
    <>
      <Group
        title="How to get there"
        aside={gap > 0 ? `${eur.format(Math.min(found, gap))} of ${eur.format(gap)} found` : undefined}
        footer={
          possible > 0
            ? `The open steps could free about ${eur.format(possible)} a month. Habits aim at halfway to what a typical ${peer ?? "customer"} spends, and at most 15 % less than you spend now.`
            : "Nothing open right now. Solvo looks again as your spending changes."
        }
      >
        {steps.map((s, i) => {
          const body = (
            <>
              <IconTile tone={s.done ? "green" : "grey"}>{s.done ? <Check /> : s.icon}</IconTile>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug font-medium">
                  <span className="text-muted-foreground">{i + 1}. </span>
                  {s.title}
                </span>
                <span className="block text-[13px] leading-snug text-muted-foreground">{s.subtitle}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {s.amount > 0 && (
                  <span className={`num text-[15px] font-semibold ${s.done ? "text-primary" : ""}`}>
                    {s.done ? "" : "−"}
                    {eur.format(s.amount)}
                  </span>
                )}
                {s.done ? <Chip tone="green">Done</Chip> : <Chip>{s.tag}</Chip>}
              </span>
              {!s.done && s.href && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </>
          );
          const cls = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left [&+&]:border-t active:bg-muted";
          if (s.href) {
            return (
              <Link key={s.key} href={s.href} className={cls}>
                {body}
              </Link>
            );
          }
          if (s.onOpen) {
            return (
              <button key={s.key} type="button" onClick={s.onOpen} className={cls}>
                {body}
              </button>
            );
          }
          return (
            <div key={s.key} className={cls.replace("active:bg-muted", "")}>
              {body}
            </div>
          );
        })}
      </Group>
      {asked && (
        <ApproveSheet
          title={`Stop ${asked.name}?`}
          points={[
            `${eur.format(asked.monthly)} a month counts as found for your plan.`,
            `You end the subscription at ${asked.name} yourself. Demo: nothing is cancelled there.`,
            "You can bring it back here any time.",
          ]}
          confirmLabel="Mark as stopped"
          onConfirm={() => {
            cancelSubscription(asked.id);
            setAsking(null);
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </>
  );
}
