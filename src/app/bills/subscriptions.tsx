"use client";

import { Repeat } from "lucide-react";
import { Group, IconTile, Row, eur2 } from "@/components/solvo/ui";
import { subscriptionsMonthly, type Subscription } from "@/data/subscriptions";
import { restoreSubscription, useCancelledSubs } from "@/lib/switches";
import { DATASET_END, plainFormat, toShown } from "@/lib/demo-clock";

const dayFmt = plainFormat({ day: "numeric", month: "short" });

/** The next charge as the person sees it: the charge day in the month after the data ends, moved by the demo clock. */
function nextCharge(day: number) {
  const [y, m] = DATASET_END.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // days in the month after the data ends
  const iso = new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
  return dayFmt(toShown(iso));
}

/** Bills: card payments that repeat every month (streaming, music, cloud storage). Ones stopped from the chat show as cancelled. */
export function Subscriptions({ subs }: { subs: Subscription[] }) {
  const cancelled = useCancelledSubs();
  if (!subs.length) return null;
  const monthly = subscriptionsMonthly(subs.filter((s) => !cancelled[s.id]));
  return (
    <Group
      title="Subscriptions"
      aside={<span className="num">{eur2.format(monthly)}/mo</span>}
      className="mt-7"
      footer={`${eur2.format(monthly * 12)} a year.`}
    >
      {subs.map((s) =>
        cancelled[s.id] ? (
          <Row
            key={s.id}
            icon={
              <IconTile tone="grey">
                <Repeat />
              </IconTile>
            }
            title={s.name}
            subtitle="Cancelled"
            value={<span className="text-muted-foreground line-through">{eur2.format(s.monthly)}</span>}
            valueSub={
              <button type="button" onClick={() => restoreSubscription(s.id)} className="-my-3 min-h-11 font-medium text-primary">
                Undo
              </button>
            }
          />
        ) : (
          <Row
            key={s.id}
            icon={
              <IconTile tone="grey">
                <Repeat />
              </IconTile>
            }
            title={s.name}
            subtitle={`Next ${nextCharge(s.day)}`}
            value={eur2.format(s.monthly)}
            valueSub="a month"
          />
        ),
      )}
    </Group>
  );
}
