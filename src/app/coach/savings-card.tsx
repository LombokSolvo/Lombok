"use client";

import Link from "next/link";
import { Check, Repeat, Utensils, Wifi, Zap } from "lucide-react";
import { IconTile, eur, eur2 } from "@/components/solvo/ui";
import type { SavingsLine, SavingsPlanResult } from "@/lib/find-savings";
import { cancelSubscription, restoreSubscription, useCancelledSubs, useSwitches } from "@/lib/switches";

// "Help me save €100 more a month": one short row per change (what, a few words on it, euros a month and one small button). It sits
// inside the coach's message, under its text and above the approval, so there is no card chrome, total or footnote of its own.

const chip = "inline-flex h-8 shrink-0 items-center rounded-full bg-accent px-3 text-[13px] font-semibold text-primary active:scale-[0.97]";

function Icon({ line }: { line: SavingsLine }) {
  if (line.kind === "switch") return line.id === "electricity" ? <Zap aria-hidden /> : <Wifi aria-hidden />;
  if (line.kind === "cancel") return <Repeat aria-hidden />;
  return <Utensils aria-hidden />;
}

/** A few words on the change, nothing more. */
function detail(line: SavingsLine) {
  if (line.kind === "switch") return line.supplier ? `To ${line.supplier}` : "Same service, cheaper";
  if (line.kind === "cancel") return `${eur2.format(line.monthly)} a month`;
  return `${eur.format(line.weeklyNow)} → ${eur.format(line.weeklyNew)} a week`;
}

function LineAction({ line }: { line: SavingsLine }) {
  const switches = useSwitches();
  const cancelled = useCancelledSubs();
  const done = (
    <span className="flex items-center gap-1 text-[13px] font-medium text-primary">
      <Check className="size-4" strokeWidth={2.75} aria-hidden />
      Done
    </span>
  );
  if (line.kind === "switch") {
    if (switches[line.id]) return done;
    return (
      <Link href={`/bills?open=${line.id}`} className={chip}>
        Switch
      </Link>
    );
  }
  if (line.kind === "cancel") {
    if (cancelled[line.id])
      return (
        <button type="button" onClick={() => restoreSubscription(line.id)} className="flex min-h-8 items-center gap-1 text-[13px] font-medium text-primary">
          <Check className="size-4" strokeWidth={2.75} aria-hidden />
          Undo
        </button>
      );
    return (
      <button type="button" onClick={() => cancelSubscription(line.id)} className={chip}>
        Cancel
      </button>
    );
  }
  return null; // a weekly limit is the person's own habit: the row says the new number, nothing to tap
}

export function SavingsLines({ r }: { r: SavingsPlanResult }) {
  return (
    <ul className="mt-3 border-t">
      {r.lines.map((l) => (
        <li key={l.id} className="flex items-center gap-3 border-b py-3 last:border-b-0">
          <IconTile>
            <Icon line={l} />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug font-medium">{l.kind === "trim" ? `Trim ${l.label.toLowerCase()}` : l.label}</p>
            <p className="num text-[13px] leading-snug text-muted-foreground">{detail(l)}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="num text-[15px] font-semibold text-primary">+{eur.format(l.monthly)}</span>
            <LineAction line={l} />
          </div>
        </li>
      ))}
    </ul>
  );
}
