"use client";

import { Calculator } from "lucide-react";
import type { ReactNode } from "react";
import { MoneyBadge, SignedAmount } from "@/components/solvo/money-badge";
import { Chip, IconTile, eur } from "@/components/solvo/ui";
import { plainFormat } from "@/lib/demo-clock";
import type { WhatIfResult } from "@/lib/what-if";

// The server sends real (shown) dates, so they are formatted with plainFormat, never shifted again (src/lib/demo-clock.ts).
const fmtDay = plainFormat({ day: "numeric", month: "short", year: "numeric" });
const fmtMonth = plainFormat({ month: "long", year: "numeric" });

function Line({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-t py-2 text-[14px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="num shrink-0 text-right font-medium">{children}</span>
    </div>
  );
}

const Arrow = ({ from, to }: { from: number; to: number }) => (
  <>
    {eur.format(from)} <span className="text-muted-foreground">→</span> {eur.format(to)}
  </>
);

/** The result of a "what if" question: one headline number, a few rows, and the assumptions in small print. */
export function WhatIfCard({ r }: { r: WhatIfResult }) {
  if (r.kind === "error") return null;
  let title: string;
  let headline: ReactNode;
  let sub: ReactNode;
  let rows: ReactNode;

  if (r.kind === "save_target") {
    title = `Save ${eur.format(r.target)} by ${fmtDay(r.deadline)}`;
    headline = `${eur.format(r.neededMonthly)} a month`;
    sub = (
      <>
        needed. You can safely save {eur.format(r.safeToSaveMonthly)}.{" "}
        <Chip tone={r.fits ? "green" : "warn"}>{r.fits ? "Fits" : `${eur.format(r.gapMonthly)} short`}</Chip>
      </>
    );
    rows = (
      <>
        <Line label="The sum">
          {eur.format(r.toGo)} ÷ {r.months} {r.months === 1 ? "month" : "months"}
        </Line>
        {!r.fits && (
          <Line label="Or spend less each week">
            <SignedAmount kind="out" value={r.cutWeekly} />
          </Line>
        )}
        {!r.fits && (
          <Line label={`At ${eur.format(r.safeToSaveMonthly)} a month`}>
            {r.dateIfCurrentPace ? fmtMonth(r.dateIfCurrentPace) : "Not yet"}
          </Line>
        )}
      </>
    );
  } else if (r.kind === "change_spending") {
    const up = r.freedMonthly >= 0;
    title = `${r.label}: ${eur.format(r.currentMonthly)} → ${eur.format(r.newMonthly)} a month`;
    headline = (
      <span className="inline-flex items-center gap-2">
        <MoneyBadge kind={up ? "in" : "out"} />
        {eur.format(Math.abs(r.freedYearly))} a year
      </span>
    );
    sub = up ? `${eur.format(r.freedMonthly)} a month freed.` : `${eur.format(-r.freedMonthly)} a month more spent.`;
    rows = (
      <>
        <Line label="Safe to spend a week">
          <Arrow from={r.safeToSpendWeeklyBefore} to={r.safeToSpendWeeklyAfter} />
        </Line>
        <Line label="Or safe to save a month">
          <Arrow from={r.safeToSaveMonthly} to={r.safeToSaveMonthlyAfter} />
        </Line>
      </>
    );
  } else {
    title = `Reach ${eur.format(r.target)}`;
    const tooLong = r.months !== null && r.months > 120; // "1000 months, around March 2110" helps nobody
    headline = r.months === null || tooLong ? "Not at this pace" : r.months === 0 ? "Already there" : `${r.months} ${r.months === 1 ? "month" : "months"}`;
    sub = r.months === null ? "Nothing is left to save safely right now." : tooLong ? "It would take more than ten years." : r.date && r.months ? `Around ${fmtMonth(r.date)}.` : "";
    rows = (
      <>
        <Line label="To go">{eur.format(r.toGo)}</Line>
        <Line label="Saving a month">{eur.format(r.monthly)}</Line>
      </>
    );
  }

  return (
    <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(15,42,31,0.06)]">
      <div className="flex items-center gap-3">
        <IconTile>
          <Calculator />
        </IconTile>
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">{title}</p>
      </div>
      <p className="num mt-3 font-display text-[28px] leading-none font-semibold tracking-[-0.02em]">{headline}</p>
      <p className="mt-1.5 text-[14px] leading-snug text-muted-foreground">{sub}</p>
      <div className="mt-3">{rows}</div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{r.assumptions.join(". ")}.</p>
    </div>
  );
}
