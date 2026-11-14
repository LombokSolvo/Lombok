"use client";

import Link from "next/link";
import { ArrowUpRight, Check, GraduationCap, PiggyBank, Repeat, Target, Zap, Wifi } from "lucide-react";
import { useState, type ReactNode } from "react";
import { IconTile, eur, eur2 } from "@/components/solvo/ui";
import { AINO_PLAN } from "@/data/portfolio";
import { DEFAULT_SAVINGS_GOAL_PER_MONTH } from "@/lib/coach";
import { VIEW_HREF, VIEW_LABEL, type ChatAction, type ChatState } from "@/lib/chat-actions";
import type { DemoMode } from "@/lib/demo-mode";
import { addGoal, readGoals, removeGoal, useGoals, withSavingsAccount } from "@/lib/goals-store";
import { PACK_META, type PackId } from "@/lib/learn";
import {
  WEEKS_PER_YEAR,
  approveSavingsPlan,
  cancelSavingsPlan,
  cancelSubscription,
  monthlyFreed,
  planFunds,
  readCancelledSubs,
  readSavingsPlan,
  readSwitches,
  restoreSubscription,
  useCancelledSubs,
  useSavingsPlan,
  useSwitches,
  type SavingsPlan,
} from "@/lib/switches";

const weekly = (monthly: number) => (monthly * 12) / WEEKS_PER_YEAR;

/** The saving plan the person has now: one they approved, or Aino's demo plan. */
function currentPlan(mode: DemoMode, stored: SavingsPlan | null) {
  return stored ?? (mode === "aino" ? AINO_PLAN : null);
}

/** What the chat sends with each question, so the coach knows what is already done. Small facts only, never transactions. */
export function chatState(mode: DemoMode): ChatState {
  const sw = readSwitches();
  return {
    cancelled: Object.keys(readCancelledSubs()),
    planMonthly: currentPlan(mode, readSavingsPlan())?.monthly ?? null,
    switched: (["electricity", "telecom"] as const).filter((b) => sw[b]),
    goals: readGoals(mode).map(({ label, target, saved, monthly }) => ({ label, target, saved, monthly })),
  };
}

/** The same plan at a new monthly total, split over its funds in the same proportions, the goal counted first like Save does. */
function resized(plan: SavingsPlan, monthly: number, freed: number): SavingsPlan {
  const funds = planFunds(plan);
  const was = funds.reduce((s, f) => s + f.monthly, 0) || 1;
  let left = monthly;
  const next = funds.map((f, i) => {
    const m = i === funds.length - 1 ? left : Math.round((monthly * f.monthly) / was);
    left -= m;
    return { fundId: f.fundId, monthly: m };
  });
  const fromGoal = Math.min(monthly, DEFAULT_SAVINGS_GOAL_PER_MONTH);
  const fromBills = Math.min(freed, monthly - fromGoal);
  return { ...plan, monthly, fromGoal, fromBills, fromBudget: monthly - fromGoal - fromBills, funds: next, approvedAt: new Date().toISOString() };
}

function Card({
  icon,
  title,
  subtitle,
  done,
  doneText,
  onUndo,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  done: boolean;
  doneText: string;
  onUndo?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card p-3 shadow-[0_1px_3px_rgba(15,42,31,0.06)]">
      <div className="flex items-center gap-3">
        {done ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <Check className="size-[18px]" strokeWidth={2.75} aria-hidden />
          </span>
        ) : (
          <IconTile>{icon}</IconTile>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-medium">{done ? doneText : title}</p>
          {!done && subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{subtitle}</p>}
        </div>
        {done && onUndo && (
          <button type="button" onClick={onUndo} className="-my-1 min-h-11 shrink-0 px-2 text-[14px] font-medium text-primary">
            Undo
          </button>
        )}
      </div>
      {!done && children && <div className="mt-3">{children}</div>}
    </div>
  );
}

const actionButton =
  "flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]";

function CancelSubscription({ a }: { a: Extract<ChatAction, { kind: "cancel_subscription" }> }) {
  const done = Boolean(useCancelledSubs()[a.id]);
  return (
    <Card
      icon={<Repeat />}
      title={`Cancel ${a.name}`}
      subtitle={`${eur2.format(a.monthly)} a month. +${eur.format(weekly(a.monthly))} a week to spend.`}
      done={done}
      doneText={`${a.name} cancelled`}
      onUndo={() => restoreSubscription(a.id)}
    >
      <button type="button" className={actionButton} onClick={() => cancelSubscription(a.id)}>
        Cancel {a.name}
      </button>
    </Card>
  );
}

function ChangePlan({ a, mode }: { a: Extract<ChatAction, { kind: "change_plan" }>; mode: DemoMode }) {
  const stored = useSavingsPlan();
  const switches = useSwitches();
  const [before, setBefore] = useState<{ plan: SavingsPlan | null } | null>(null);
  const plan = currentPlan(mode, stored);
  const done = Boolean(before) && plan?.monthly === a.monthly;
  if (!plan) return <OpenView view="save" />;
  const next = resized(plan, a.monthly, Math.floor(monthlyFreed(switches)));
  const lessPerWeek = weekly((next.fromBudget ?? 0) - (plan.fromBudget ?? 0));
  return (
    <Card
      icon={<PiggyBank />}
      title={`Saving plan to ${eur.format(a.monthly)} a month`}
      subtitle={`Now ${eur.format(plan.monthly)}.${lessPerWeek >= 0.5 ? ` ${eur.format(lessPerWeek)} less to spend a week.` : ""}`}
      done={done}
      doneText={`Saving plan is ${eur.format(a.monthly)} a month`}
      onUndo={() => {
        if (before?.plan) approveSavingsPlan(before.plan);
        else cancelSavingsPlan();
        setBefore(null);
      }}
    >
      <button
        type="button"
        className={actionButton}
        onClick={() => {
          setBefore({ plan: stored });
          approveSavingsPlan(next);
        }}
      >
        Approve {eur.format(a.monthly)} a month
      </button>
    </Card>
  );
}

function AddGoal({ a, mode }: { a: Extract<ChatAction, { kind: "add_goal" }>; mode: DemoMode }) {
  const stored = useSavingsPlan();
  const switches = useSwitches();
  const goals = useGoals(mode);
  const [added, setAdded] = useState<{ id: string; plan: SavingsPlan | null } | null>(null);
  const done = Boolean(added && goals.some((g) => g.id === added.id));
  const plan = currentPlan(mode, stored);
  const next = withSavingsAccount(plan, a.monthly, Math.floor(monthlyFreed(switches)));
  const lessPerWeek = weekly((next?.fromBudget ?? 0) - (plan?.fromBudget ?? 0));
  return (
    <Card
      icon={<Target />}
      title={`Add goal: ${a.label}, ${eur.format(a.target)}`}
      subtitle={`${eur.format(a.monthly)} a month to your savings account for ${a.months} months.${lessPerWeek >= 0.5 ? ` ${eur.format(lessPerWeek)} less to spend a week.` : ""}`}
      done={done}
      doneText={`${a.label} added to your goals`}
      onUndo={() => {
        if (!added) return;
        removeGoal(mode, added.id);
        if (added.plan) approveSavingsPlan(added.plan);
        else cancelSavingsPlan();
        setAdded(null);
      }}
    >
      <button
        type="button"
        className={actionButton}
        onClick={() => {
          const g = addGoal(mode, { kind: "other", label: a.label, target: a.target, saved: a.saved, monthly: a.monthly });
          setAdded({ id: g.id, plan: stored });
          if (next) approveSavingsPlan(next);
        }}
      >
        Add goal
      </button>
    </Card>
  );
}

function SwitchBill({ a }: { a: Extract<ChatAction, { kind: "switch_bill" }> }) {
  const done = Boolean(useSwitches()[a.bill]);
  const what = a.bill === "electricity" ? "electricity" : "phone and internet";
  return (
    <Card
      icon={a.bill === "electricity" ? <Zap /> : <Wifi />}
      title={a.supplier ? `Switch ${what} to ${a.supplier}` : `Compare ${what} offers`}
      subtitle={a.yearlySaving ? `About ${eur.format(a.yearlySaving)} less a year.` : undefined}
      done={done}
      doneText={`${what[0].toUpperCase()}${what.slice(1)} switch approved`}
    >
      <Link href={`/bills?open=${a.bill}`} className={actionButton}>
        Review and switch
        <ArrowUpRight className="size-4" aria-hidden />
      </Link>
    </Card>
  );
}

function OpenView({ view }: { view: Extract<ChatAction, { kind: "open" }>["view"] }) {
  return (
    <Link
      href={VIEW_HREF[view]}
      className="flex min-h-11 items-center justify-between gap-2 rounded-2xl bg-card px-4 py-2.5 text-[15px] font-medium text-primary shadow-[0_1px_3px_rgba(15,42,31,0.06)] active:bg-muted"
    >
      {VIEW_LABEL[view]}
      <ArrowUpRight className="size-4 shrink-0" aria-hidden />
    </Link>
  );
}

/** One proposed action under a coach answer. The person's tap is the approval; nothing happens before it. */
export function ActionCard({ action, mode, onLearn }: { action: ChatAction; mode: DemoMode; onLearn: (id: PackId) => void }) {
  switch (action.kind) {
    case "cancel_subscription":
      return <CancelSubscription a={action} />;
    case "change_plan":
      return <ChangePlan a={action} mode={mode} />;
    case "add_goal":
      return <AddGoal a={action} mode={mode} />;
    case "switch_bill":
      return <SwitchBill a={action} />;
    case "open":
      return <OpenView view={action.view} />;
    case "learn": {
      const meta = PACK_META.find((p) => p.id === action.pack)!;
      return (
        <button
          type="button"
          onClick={() => onLearn(action.pack)}
          className="flex min-h-11 w-full items-center gap-3 rounded-2xl bg-card px-4 py-2.5 text-left shadow-[0_1px_3px_rgba(15,42,31,0.06)] active:bg-muted"
        >
          <GraduationCap className="size-[18px] shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">{meta.title}</span>
            <span className="block text-[13px] text-muted-foreground">{meta.minutes} min lesson with your own numbers</span>
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      );
    }
  }
}
