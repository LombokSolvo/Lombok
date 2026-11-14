"use client";

import Link from "next/link";
import { Check, Repeat, Utensils, Wifi, Zap } from "lucide-react";
import { SignedAmount } from "@/components/solvo/money-badge";
import { eur, eur2 } from "@/components/solvo/ui";
import type { SavingsLine, SavingsPlanResult } from "@/lib/find-savings";
import { cancelSubscription, restoreSubscription, useCancelledSubs, useSwitches } from "@/lib/switches";

// One colour per line, the same in the bar and on the line's dot, so the bar reads as "where the €100 comes from".
const TONES = ["bg-primary", "bg-mint", "bg-primary/55", "bg-slab", "bg-primary/30", "bg-mint/60"];

const smallButton =
  "mt-2 inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground transition-transform active:scale-[0.97]";

function Icon({ line }: { line: SavingsLine }) {
  const cls = "size-[18px]";
  if (line.kind === "switch") return line.id === "electricity" ? <Zap className={cls} aria-hidden /> : <Wifi className={cls} aria-hidden />;
  if (line.kind === "cancel") return <Repeat className={cls} aria-hidden />;
  return <Utensils className={cls} aria-hidden />;
}

function Detail({ line }: { line: SavingsLine }) {
  if (line.kind === "switch") return <>{line.supplier ? `To ${line.supplier}. ` : ""}Same service, {eur.format(line.yearly)} a year less.</>;
  if (line.kind === "cancel") return <>{eur2.format(line.monthly)} a month. The card payment stops.</>;
  return (
    <>
      {eur.format(line.weeklyNow)} → <span className="font-semibold text-foreground">{eur.format(line.weeklyNew)}</span> a week ({line.pct}% less)
    </>
  );
}

function LineAction({ line }: { line: SavingsLine }) {
  const switches = useSwitches();
  const cancelled = useCancelledSubs();
  if (line.kind === "switch") {
    if (switches[line.id]) return <Done />;
    return (
      <Link href={`/bills?open=${line.id}`} className={smallButton}>
        Review and switch
      </Link>
    );
  }
  if (line.kind === "cancel") {
    if (cancelled[line.id])
      return (
        <span className="mt-1 flex items-center gap-2 text-[13px] text-primary">
          <Check className="size-4" strokeWidth={2.75} aria-hidden />
          Cancelled
          <button type="button" onClick={() => restoreSubscription(line.id)} className="h-11 px-2 font-medium">
            Undo
          </button>
        </span>
      );
    return (
      <button type="button" onClick={() => cancelSubscription(line.id)} className={smallButton}>
        Cancel {line.label.replace(/^Cancel /, "")}
      </button>
    );
  }
  return null; // a weekly limit is the person's own habit: the line says the new number, nothing to tap
}

const Done = () => (
  <span className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-primary">
    <Check className="size-4" strokeWidth={2.75} aria-hidden />
    Switch approved
  </span>
);

/** "Help me save €100 more a month": where the money comes from, as a stacked bar to the target and one line per change. */
export function SavingsCard({ r }: { r: SavingsPlanResult }) {
  const scale = Math.max(r.target, r.found);
  return (
    <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(15,42,31,0.06)]">
      <p className="text-[13px] text-muted-foreground">Your plan to save {eur.format(r.target)} more a month</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="num font-display text-[32px] leading-none font-semibold tracking-[-0.02em] text-primary">+{eur.format(r.found)}</span>
        <span className="text-[15px] text-muted-foreground">a month</span>
      </div>
      <p className="mt-1 text-[14px] text-muted-foreground">
        {eur.format(r.yearly)} a year{r.reached ? "" : `, ${eur.format(r.target - r.found)} short of the goal`}.
      </p>

      {/* The bar: each change's share, with a tick where the target is. */}
      <div className="relative mt-4" aria-hidden>
        <div className="flex h-3.5 overflow-hidden rounded-full bg-muted">
          {r.lines.map((l, i) => (
            <span key={l.id} className={`${TONES[i % TONES.length]} h-full [&+&]:border-l-2 [&+&]:border-card`} style={{ width: `${(l.monthly / scale) * 100}%` }} />
          ))}
        </div>
        {r.found > r.target && (
          <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground/60" style={{ left: `${(r.target / scale) * 100}%` }} />
        )}
      </div>

      <ol className="mt-3">
        {r.lines.map((l, i) => (
          <li key={l.id} className="flex items-start gap-3 border-t py-3 first:border-t-0">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${i % TONES.length === 1 || i % TONES.length === 5 ? "text-slab" : "text-white"} ${TONES[i % TONES.length]}`}>
              <Icon line={l} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] leading-snug font-medium">{l.kind === "trim" ? `Trim ${l.label.toLowerCase()}` : l.label}</span>
                <SignedAmount kind="in" value={l.monthly} className="shrink-0 text-[14px]" />
              </div>
              <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                <Detail line={l} />
              </p>
              <LineAction line={l} />
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        From your last 12 months. Amounts a month; trims never more than a quarter of that spending. Nothing changes until you tap.
      </p>
    </div>
  );
}
