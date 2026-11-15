import { Chip, Group, eur } from "@/components/solvo/ui";
import type { CompareMetric } from "@/lib/cohorts";
import type { PeerCompare } from "@/lib/peer-compare";

// The chat's answer to "how do I compare" and "where could I save": each spending line as a bar of the group's middle 80%, its
// median as a tick and the person as a dot. Maths: src/lib/cohorts.ts and src/lib/peer-compare.ts. No hooks.

/** "Top 10%" when you spend more than most of the group, "Bottom 30%" when less. */
function rank(pct: number) {
  const r5 = (n: number) => Math.max(10, Math.round(n / 5) * 5);
  return pct >= 50 ? `Top ${pct >= 90 ? 10 : r5(100 - pct)}%` : `Bottom ${pct <= 10 ? 10 : r5(pct)}%`;
}

export function PeerCard({ r }: { r: PeerCompare }) {
  const above = r.focus === "above";
  // Who "your peer group" is goes under the table, in words: "Peer group: customers aged 25–34".
  const footer = `Peer group: ${r.label === "All customers" ? "all customers" : `customers ${r.label[0].toLowerCase()}${r.label.slice(1)}`}.`;
  // A plain comparison is a short list: what you spend, what is typical, and where that puts you. "Where could I save" adds the bars.
  if (!above) {
    return (
      <Group title="How you compare to your peer group" className="mt-1" footer={footer}>
        {r.metrics.map((m) => (
          <div key={m.id} className="flex min-h-14 items-center gap-3 px-4 py-3 [&+&]:border-t">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] leading-snug font-medium">{m.label}</div>
              <div className="num mt-0.5 text-[13px] leading-snug text-muted-foreground">
                You {eur.format(m.you)}/mo, typical {eur.format(m.median)}
              </div>
            </div>
            <Chip tone={m.pct >= 75 ? "warn" : m.pct <= 25 ? "green" : "grey"}>{rank(m.pct)}</Chip>
          </div>
        ))}
      </Group>
    );
  }
  return (
    <Group title="Where you spend more than your peers" className="mt-1" footer={footer}>
      {r.metrics.length === 0 ? (
        <p className="px-4 py-3 text-[15px] leading-snug">You&apos;re in line with your peers. Nothing stands out.</p>
      ) : (
        r.metrics.map((m) => <MetricRow key={m.id} m={m} showGap={above} />)
      )}
    </Group>
  );
}

function MetricRow({ m, showGap }: { m: CompareMetric; showGap: boolean }) {
  const d = m.deciles;
  const max = Math.max(d[8] * 1.15, m.you * 1.08, 1);
  const at = (x: number) => `${Math.min(100, (x / max) * 100)}%`;
  const gap = Math.round(m.you - m.median);
  const words =
    m.pct >= 90
      ? "You spend more than 9 in 10 of them"
      : m.pct >= 50
        ? `You spend more than ${m.pct}% of them`
        : m.pct <= 10
          ? "You spend less than 9 in 10 of them"
          : `You spend less than ${100 - m.pct}% of them`;

  return (
    <div className="px-4 py-3 [&+&]:border-t">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-medium">{m.label}</span>
        <span className="num text-[15px] font-semibold">{eur.format(m.you)}/mo</span>
      </div>
      {/* The group's middle 80% as a band, its median as a tick, and you as the dot. */}
      <div className="relative mt-2.5 h-2 rounded-full bg-muted" role="img" aria-label={`${m.label}: you ${eur.format(m.you)} a month, typical ${eur.format(m.median)}`}>
        <div className="absolute inset-y-0 rounded-full bg-accent" style={{ left: at(d[0]), width: `calc(${at(d[8])} - ${at(d[0])})` }} />
        <div className="absolute -inset-y-0.5 w-0.5 rounded-full bg-muted-foreground/60" style={{ left: at(m.median) }} />
        <div
          className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card ${m.pct >= 75 ? "bg-warn" : "bg-primary"}`}
          style={{ left: at(m.you) }}
        />
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
        {words}. Typical {eur.format(m.median)}/mo{showGap && gap > 0 ? `, so ${eur.format(gap)} a month above it` : ""}.
      </p>
    </div>
  );
}
