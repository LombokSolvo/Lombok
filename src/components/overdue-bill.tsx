"use client";

import Link from "next/link";
import { Check, ChevronRight, Phone } from "lucide-react";
import { IconTile, eur } from "@/components/solvo/ui";
import { UNPAID } from "@/data/reminders";
import { useBillActions } from "@/lib/switches";

const dateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

/**
 * Home card for the unpaid e-invoice: one compact row that opens Solvo's call. Deliberately small, so it sits under the
 * plan and the bills instead of taking over the top of Home. The reminder timeline lives on the call screen.
 */
export function OverdueBillCard({ asOf }: { asOf: string }) {
  const done = useBillActions()[UNPAID.id];

  if (done?.action === "paid") {
    return (
      <section className="mt-4 flex items-start gap-3 rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(15,42,31,0.06)]">
        <IconTile>
          <Check />
        </IconTile>
        <p className="text-[14px] leading-snug">
          <span className="font-semibold">
            Paid {UNPAID.supplier}, {eur.format(UNPAID.amount)}.
          </span>
        </p>
      </section>
    );
  }

  const daysLate = Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${UNPAID.dueDate}T00:00:00Z`)) / 86_400_000);

  return (
    <Link
      href="/call"
      transitionTypes={["nav-forward"]}
      className="mt-4 flex min-h-16 items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-[0_1px_3px_rgba(15,42,31,0.06)] ring-1 ring-warn/25 active:bg-muted"
    >
      <IconTile tone="warn">
        <Phone />
      </IconTile>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-semibold">
            {done?.action === "snoozed" ? "Dentist bill, reminder set" : `Dentist bill, ${daysLate} days late`}
          </span>
          <span className="num text-[15px] font-semibold">{eur.format(UNPAID.amount)}</span>
        </span>
        <span className="block text-[13px] text-muted-foreground">
          Due {fmtDate(UNPAID.dueDate)}. Solvo is calling about it.
        </span>
      </span>
      <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
