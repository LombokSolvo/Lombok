import { Repeat } from "lucide-react";
import { Group, IconTile, Row, eur2 } from "@/components/solvo/ui";
import { subscriptionsMonthly, type Subscription } from "@/data/subscriptions";

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** Bills: card payments that repeat every month (streaming, music, cloud storage). */
export function Subscriptions({ subs }: { subs: Subscription[] }) {
  if (!subs.length) return null;
  const monthly = subscriptionsMonthly(subs);
  return (
    <Group
      title="Subscriptions"
      aside={<span className="num">{eur2.format(monthly)}/mo</span>}
      className="mt-7"
      footer={`${eur2.format(monthly * 12)} a year.`}
    >
      {subs.map((s) => (
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
      ))}
    </Group>
  );
}
