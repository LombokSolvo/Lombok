"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";
import { ApproveSheet } from "./switch-ui";
import { Group, IconTile, Row, eur2 } from "@/components/solvo/ui";
import { subscriptionsMonthly, type Subscription } from "@/data/subscriptions";
import { cancelSubscription, restoreSubscription, useCancelledSubs } from "@/lib/switches";

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** Bills: card payments that repeat every month (streaming, music, cloud storage). Each can be cancelled here (or from the chat), with your approval. */
export function Subscriptions({ subs }: { subs: Subscription[] }) {
  const cancelled = useCancelledSubs();
  const [asking, setAsking] = useState<Subscription | null>(null);
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
            subtitle={`On the ${ordinal(s.day)} · ${eur2.format(s.monthly)} a month`}
            value={
              <button type="button" onClick={() => setAsking(s)} className="-my-2 inline-flex h-9 items-center rounded-full bg-muted px-3.5 text-[13px] font-semibold text-foreground active:scale-95">
                Cancel
              </button>
            }
          />
        ),
      )}
      {asking && (
        <ApproveSheet
          title={`Cancel ${asking.name}?`}
          points={[
            `No more ${eur2.format(asking.monthly)} a month, ${eur2.format(asking.monthly * 12)} a year.`,
            "It ends after the period you have already paid for.",
            "You can undo it here.",
          ]}
          confirmLabel={`Cancel ${asking.name}`}
          onConfirm={() => {
            cancelSubscription(asking.id);
            setAsking(null);
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </Group>
  );
}
