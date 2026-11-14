"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { eur } from "@/components/solvo/ui";
import type { DemoMode } from "@/lib/demo-mode";
import type { SavingsLine, SavingsPlanResult } from "@/lib/find-savings";
import { cancelSubscription, restoreSubscription, useCancelledSubs, useSwitches } from "@/lib/switches";
import { PlanButton } from "./action-card";

// One colour per line, the same in the bar and on the line's dot, so the bar reads as "where the money comes from".
const TONES = ["bg-primary", "bg-mint", "bg-primary/45", "bg-slab", "bg-primary/25"];

const pill =
  "inline-flex h-11 shrink-0 items-center rounded-full bg-accent px-4 text-[14px] font-semibold text-primary transition-transform active:scale-[0.97]";

function title(l: SavingsLine) {
  if (l.kind === "switch") return l.id === "electricity" ? "Switch electricity" : "Switch phone and internet";
  if (l.kind === "cancel") return l.label;
  return l.id === "restaurants" ? "Eat out a little less" : `Spend less on ${l.label.toLowerCase()}`;
}

function sub(l: SavingsLine) {
  if (l.kind === "switch") return l.supplier ? `to ${l.supplier}` : "";
  if (l.kind === "trim") return `${eur.format(l.weeklyNow)} → ${eur.format(l.weeklyNew)} a week`;
  return "";
}

function LineAction({ line }: { line: SavingsLine }) {
  const switches = useSwitches();
  const cancelled = useCancelledSubs();
  if (line.kind === "switch")
    return switches[line.id] ? (
      <Check className="size-5 shrink-0 text-primary" strokeWidth={2.75} aria-label="Switch approved" />
    ) : (
      <Link href={`/bills?open=${line.id}`} className={pill}>
        Switch
      </Link>
    );
  if (line.kind === "cancel")
    return cancelled[line.id] ? (
      <button type="button" onClick={() => restoreSubscription(line.id)} className="h-11 shrink-0 px-2 text-[14px] font-medium text-primary">
        Undo
      </button>
    ) : (
      <button type="button" onClick={() => cancelSubscription(line.id)} className={pill}>
        Cancel
      </button>
    );
  return null; // eating out less is the person's own habit: the line gives the new weekly number
}

/** "Help me save €100 more a month": where the money comes from, as a bar towards the target and one short row per change. */
export function SavingsCard({ r, mode, planMonthly }: { r: SavingsPlanResult; mode: DemoMode; planMonthly?: number }) {
  const scale = Math.max(r.target, r.found);
  return (
    <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(15,42,31,0.06)]">
      <p className="flex items-baseline gap-2">
        <span className="num font-display text-[30px] leading-none font-semibold tracking-[-0.02em] text-primary">+{eur.format(r.found)}</span>
        <span className="text-[15px] text-muted-foreground">a month of your {eur.format(r.target)}</span>
      </p>

      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        {r.lines.map((l, i) => (
          <span key={l.id} className={`${TONES[i % TONES.length]} h-full [&+&]:ml-0.5`} style={{ width: `${(l.monthly / scale) * 100}%` }} />
        ))}
      </div>

      <ul className="mt-2">
        {r.lines.map((l, i) => (
          <li key={l.id} className="flex min-h-14 items-center gap-3 py-1.5">
            <span className={`size-2.5 shrink-0 rounded-full ${TONES[i % TONES.length]}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-snug font-medium">{title(l)}</p>
              <p className="num text-[13px] leading-snug text-muted-foreground">
                <span className="font-medium text-primary">+{eur.format(l.monthly)}</span>
                {sub(l) ? ` · ${sub(l)}` : ""}
              </p>
            </div>
            <LineAction line={l} />
          </li>
        ))}
      </ul>

      {planMonthly != null && r.found >= 5 && (
        <div className="mt-2">
          <PlanButton monthly={planMonthly + r.found} mode={mode} label={`Save it: plan to ${eur.format(planMonthly + r.found)} a month`} />
        </div>
      )}
    </div>
  );
}
