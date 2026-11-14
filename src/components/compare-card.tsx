"use client";

import { useState } from "react";
import { Group, eur } from "@/components/solvo/ui";
import type { CompareGroup, CompareMetric } from "@/lib/cohorts";

/** Home: the person's monthly spending next to a group of S-Pankki customers (by age, city or income). */
export function CompareCard({ groups }: { groups: CompareGroup[] }) {
  const [dim, setDim] = useState(groups[0]?.dim);
  const g = groups.find((x) => x.dim === dim) ?? groups[0];
  if (!g) return null;

  return (
    <Group
      title="How you compare"
      className="mt-4"
      footer={`${g.label}: ${g.n.toLocaleString("fi-FI")} customers in S-Pankki's synthetic dataset, last 12 months. Only group figures, never one person's data.`}
    >
      <div className="flex gap-2 p-2" role="tablist" aria-label="Compare with">
        {groups.map((x) => (
          <button
            key={x.dim}
            type="button"
            role="tab"
            aria-selected={x.dim === g.dim}
            onClick={() => setDim(x.dim)}
            className={`h-11 flex-1 rounded-xl px-2 text-[14px] font-semibold ${x.dim === g.dim ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {x.tab}
          </button>
        ))}
      </div>
      {g.metrics.map((m) => (
        <MetricRow key={m.id} m={m} />
      ))}
    </Group>
  );
}

function MetricRow({ m }: { m: CompareMetric }) {
  const d = m.deciles;
  const max = Math.max(d[8] * 1.15, m.you * 1.08, 1);
  const at = (x: number) => `${Math.min(100, (x / max) * 100)}%`;
  const high = m.pct >= 75;
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
      <div className="relative mt-2.5 h-2 rounded-full bg-muted" aria-hidden>
        <div className="absolute inset-y-0 rounded-full bg-accent" style={{ left: at(d[0]), width: `calc(${at(d[8])} - ${at(d[0])})` }} />
        <div className="absolute -inset-y-0.5 w-0.5 rounded-full bg-muted-foreground/60" style={{ left: at(m.median) }} />
        <div
          className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card ${high ? "bg-warn" : "bg-primary"}`}
          style={{ left: at(m.you) }}
        />
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
        {words}. Typical {eur.format(m.median)}/mo.
      </p>
    </div>
  );
}
