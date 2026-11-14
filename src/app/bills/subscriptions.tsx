"use client";

import { Repeat, ShieldCheck } from "lucide-react";
import { Group, IconTile, Row, eur2 } from "@/components/solvo/ui";
import { subscriptionsMonthly, type Subscription } from "@/data/subscriptions";
import { restoreSubscription, useCancelledSubs } from "@/lib/switches";

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** Bills: other fixed monthly bills that are not e-invoices Solvo compares (home insurance, a gym membership). */
export function RegularBills({ items }: { items: Subscription[] }) {
  if (!items.length) return null;
  const monthly = subscriptionsMonthly(items);
  return (
    <Group title="Insurance and memberships" aside={<span className="num">{eur2.format(monthly)}/mo</span>} className="mt-7">
      {items.map((s) => (
        <Row
          key={s.id}
          icon={<IconTile tone="grey">{s.id.includes("insurance") ? <ShieldCheck /> : <Repeat />}</IconTile>}
          title={s.name}
          subtitle={`On the ${ordinal(s.day)}`}
          value={eur2.format(s.monthly)}
          valueSub="a month"
        />
      ))}
    </Group>
  );
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
            subtitle={`On the ${ordinal(s.day)}`}
            value={eur2.format(s.monthly)}
            valueSub="a month"
          />
        ),
      )}
    </Group>
  );
}
