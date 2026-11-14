"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Chip, Group, eur } from "@/components/solvo/ui";
import type { CompareGroup, CompareMetric } from "@/lib/cohorts";

const SOURCE = "customers in S-Pankki's synthetic dataset, last 12 months. Only group figures, never one person's data.";

/** "Top 10%" when you spend more than most of the group, "Bottom 30%" when less. */
function rank(pct: number) {
  const r5 = (n: number) => Math.max(10, Math.round(n / 5) * 5);
  return pct >= 50 ? `Top ${pct >= 90 ? 10 : r5(100 - pct)}%` : `Bottom ${pct <= 10 ? 10 : r5(pct)}%`;
}

/**
 * Three quick facts against the person's age group, and a way into the full comparison. Home shows everyday spending, rent and
 * utilities; Profile's spender card shows restaurants, groceries and transport. The rest are on /compare.
 */
export function CompareSummary({ group, ids = ["everyday", "rent", "bills"], title = "How you compare" }: { group: CompareGroup; ids?: string[]; title?: string }) {
  const quick = ids.map((id) => group.metrics.find((m) => m.id === id)).filter((m) => m !== undefined);
  return (
    <Group title={title} aside={group.label} className="mt-4" footer={`${group.n.toLocaleString("fi-FI")} ${SOURCE}`}>
      {quick.map((m) => (
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
      <Link
        href="/compare"
        transitionTypes={["nav-forward"]}
        className="flex min-h-12 items-center justify-between border-t px-4 text-[15px] font-semibold text-primary active:bg-muted"
      >
        See all and compare with other groups
        <ArrowRight className="size-[18px]" aria-hidden />
      </Link>
    </Group>
  );
}

const DIMS: { dim: CompareGroup["dim"]; label: string }[] = [
  { dim: "age", label: "Age" },
  { dim: "area", label: "City" },
  { dim: "income", label: "Income" },
  { dim: "all", label: "Everyone" },
];

/** /compare: every spending line against any group the person picks. Starts at their own age group. */
export function CompareExplorer({ groups, own }: { groups: CompareGroup[]; own: string[] }) {
  const [key, setKey] = useState(own[0] ?? "all");
  const g = groups.find((x) => x.key === key) ?? groups[0];
  if (!g) return null;
  const inDim = groups.filter((x) => x.dim === g.dim);

  const pickDim = (dim: CompareGroup["dim"]) => {
    const mine = groups.find((x) => x.dim === dim && own.includes(x.key));
    setKey((mine ?? groups.find((x) => x.dim === dim) ?? g).key);
  };

  return (
    <>
      <div className="flex gap-2" role="tablist" aria-label="Compare by">
        {DIMS.map((d) => (
          <button
            key={d.dim}
            type="button"
            role="tab"
            aria-selected={g.dim === d.dim}
            onClick={() => pickDim(d.dim)}
            className={`h-11 flex-1 rounded-xl px-1 text-[14px] font-semibold ${g.dim === d.dim ? "bg-primary text-primary-foreground" : "bg-card shadow-[0_1px_3px_rgba(15,42,31,0.06)]"}`}
          >
            {d.label}
          </button>
        ))}
      </div>
      {inDim.length > 1 && (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Group">
          {inDim.map((x) => (
            <button
              key={x.key}
              type="button"
              role="radio"
              aria-checked={x.key === g.key}
              onClick={() => setKey(x.key)}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium whitespace-nowrap ${x.key === g.key ? "bg-slab text-white" : "bg-muted"}`}
            >
              {x.dim === "income" ? `€${x.short}` : x.short}
              {own.includes(x.key) && <span className={x.key === g.key ? "text-mint" : "text-primary"}>· you</span>}
            </button>
          ))}
        </div>
      )}
      <Group title={g.label} className="mt-4" footer={`${g.n.toLocaleString("fi-FI")} ${SOURCE}`}>
        {g.metrics.map((m) => (
          <MetricRow key={m.id} m={m} />
        ))}
      </Group>
    </>
  );
}

function MetricRow({ m }: { m: CompareMetric }) {
  const d = m.deciles;
  const max = Math.max(d[8] * 1.15, m.you * 1.08, 1);
  const at = (x: number) => `${Math.min(100, (x / max) * 100)}%`;
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
          className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card ${m.pct >= 75 ? "bg-warn" : "bg-primary"}`}
          style={{ left: at(m.you) }}
        />
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
        {words}. Typical {eur.format(m.median)}/mo.
      </p>
    </div>
  );
}
