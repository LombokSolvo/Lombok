"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import { NumberField } from "@/components/solvo/fields";
import { Sheet } from "@/components/solvo/sheet";
import { Group, Row, eur, eur2, secondaryButton } from "@/components/solvo/ui";
import {
  addExtra,
  budgetEditsMonthly,
  extrasMonthly,
  removeExtra,
  setIrregular,
  updateExtra,
  useBudgetEdits,
  type ExtraCost,
} from "@/lib/budget-edits-store";

// Home's "Your money each month": how the salary splits into bills, the irregular set-aside, savings and the everyday
// budget. The numbers come from the server (last 12 months). On the card's own page (/costs, `editable`) the person can
// change the irregular set-aside and add bills or subscriptions Solvo did not find; Home shows the same card without the
// controls, and it and the weekly numbers follow the edits (useWeeklyDelta).

const COLOR = {
  fixed: "bg-chart-1",
  irregular: "bg-chart-2",
  savings: "bg-sky-600",
  everyday: "bg-chart-4",
};
const WEEKS_PER_MONTH = 52 / 12;

// A cost the person typed with cents (13,99 €) keeps them; the card's own totals stay in whole euros.
const money = (v: number) => (Number.isInteger(v) ? eur : eur2).format(v);

const dot = (color: string) => <span className={`size-2.5 shrink-0 rounded-full ${color}`} aria-hidden />;

export function MoneyMonthCard({
  income,
  fixed,
  irregular,
  savings,
  everyday,
  editable = false,
  className,
}: {
  income: number;
  fixed: number;
  irregular: number;
  savings: number;
  everyday: number;
  className?: string;
  editable?: boolean; // the edit controls show only on the card's own page (/costs); Home shows the numbers
}) {
  const edits = useBudgetEdits();
  const [sheet, setSheet] = useState<"irregular" | "add" | ExtraCost | null>(null);
  const added = extrasMonthly(edits);
  const fixedNow = fixed + added;
  const irregularNow = edits.irregular ? edits.irregular.monthly : irregular;
  const everydayNow = everyday + budgetEditsMonthly(edits);
  const split = [
    { color: COLOR.fixed, amount: fixedNow },
    { color: COLOR.irregular, amount: irregularNow },
    { color: COLOR.savings, amount: savings },
    { color: COLOR.everyday, amount: Math.max(0, everydayNow) },
  ];
  const splitTotal = split.reduce((sum, x) => sum + x.amount, 0) || 1;
  const share = (v: number) => `${Math.round((Math.max(0, v) / Math.max(income, 1)) * 100)}% of salary`;
  const minus = (v: number) => `−${eur.format(v)}`;

  return (
    <Group className={className} title="Your money each month" aside="last 12 months">
      <div className="px-4 pt-4 pb-1">
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {split.map((x) => (
            <div
              key={x.color}
              className={`${x.color} transition-[width] duration-500 ease-out`}
              style={{ width: `${(x.amount / splitTotal) * 100}%` }}
            />
          ))}
        </div>
      </div>
      <Row title="Salary" value={eur.format(income)} />
      <Row
        icon={dot(COLOR.fixed)}
        title="Fixed and regular bills"
        subtitle={added > 0 ? `Includes ${eur.format(added)} you added` : undefined}
        value={minus(fixedNow)}
        valueSub={share(fixedNow)}
      />
      {editable &&
        edits.extras.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setSheet(x)}
            className="flex min-h-12 w-full items-center gap-3 py-2 pr-4 pl-[2.375rem] text-left active:bg-muted"
            aria-label={`Change ${x.name}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px]">{x.name}</span>
              <span className="block text-[13px] text-muted-foreground">
                {x.kind === "subscription" ? "Subscription" : "Bill"}, added by you
              </span>
            </span>
            <span className="num shrink-0 text-[15px]">−{money(x.monthly)}</span>
            <Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        ))}
      {editable && (
        <button
          type="button"
          onClick={() => setSheet("add")}
          className="flex min-h-12 w-full items-center gap-2 pr-4 pl-[2.375rem] text-left text-[15px] font-medium text-primary active:bg-muted"
        >
          <Plus className="size-4" aria-hidden />
          Add a bill or subscription
        </button>
      )}
      {editable ? (
        <button
          type="button"
          onClick={() => setSheet("irregular")}
          className="flex min-h-14 w-full items-center gap-3 border-t px-4 py-3 text-left active:bg-muted"
          aria-label="Change what you set aside for irregular costs"
        >
          {dot(COLOR.irregular)}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-snug font-medium">Set aside for irregular costs</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
              {edits.irregular ? `Your amount. Solvo's estimate ${eur.format(irregular)}` : "Solvo's estimate. Tap to change"}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="num block text-[15px] font-medium">{minus(irregularNow)}</span>
            <span className="num mt-0.5 block text-[12px] text-muted-foreground">{share(irregularNow)}</span>
          </span>
          <Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      ) : (
        <Row
          className="border-t"
          icon={dot(COLOR.irregular)}
          title="Set aside for irregular costs"
          subtitle={edits.irregular ? `Your amount. Solvo's estimate ${eur.format(irregular)}` : undefined}
          value={minus(irregularNow)}
          valueSub={share(irregularNow)}
        />
      )}
      <Row className="border-t" icon={dot(COLOR.savings)} title="Savings goal" value={minus(savings)} valueSub={share(savings)} />
      <Row
        icon={dot(COLOR.everyday)}
        title={<span className="font-semibold">Everyday budget</span>}
        value={<span className="font-semibold">{eur.format(everydayNow)}</span>}
        valueSub={share(everydayNow)}
      />
      {!editable && (
        <Link
          href="/costs"
          transitionTypes={["nav-forward"]}
          className="flex min-h-12 items-center justify-between border-t px-4 text-[15px] font-semibold text-primary active:bg-muted"
        >
          See and change every cost
          <ArrowRight className="size-[18px]" aria-hidden />
        </Link>
      )}

      {sheet === "irregular" && (
        <IrregularSheet
          estimate={irregular}
          current={irregularNow}
          everydayBefore={everydayNow + irregularNow}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet && sheet !== "irregular" && (
        <ExtraSheet cost={sheet === "add" ? null : sheet} everyday={everydayNow} onClose={() => setSheet(null)} />
      )}
    </Group>
  );
}

/** The everyday budget a month and a week, as a preview line in the sheets. */
function BudgetPreview({ monthly }: { monthly: number }) {
  return (
    <p className="rounded-xl bg-accent px-3 py-2.5 text-[14px] leading-snug">
      Everyday budget: <span className="num font-semibold">{eur.format(monthly)}</span> a month,{" "}
      <span className="num font-semibold">{eur.format(monthly / WEEKS_PER_MONTH)}</span> a week
    </p>
  );
}

function IrregularSheet({
  estimate,
  current,
  everydayBefore,
  onClose,
}: {
  estimate: number;
  current: number;
  everydayBefore: number;
  onClose: () => void;
}) {
  const [value, setValue] = useState(Math.round(current));
  const changed = Math.round(current) !== Math.round(estimate);
  return (
    <Sheet
      title="Irregular costs"
      onClose={onClose}
      doneLabel="Save"
      onDone={() => {
        setIrregular(value, estimate);
        onClose();
      }}
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px] leading-snug text-muted-foreground">
          Money put aside each month for costs that don&apos;t come every month, like the dentist, car repairs or yearly fees. From your
          last 12 months Solvo estimates <span className="num font-medium text-foreground">{eur.format(estimate)}</span> a month.
        </p>
        <NumberField label="Set aside each month" value={value} onChange={setValue} suffix="€" max={100000} />
        <BudgetPreview monthly={everydayBefore - value} />
        {changed && (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setIrregular(estimate, estimate);
              onClose();
            }}
          >
            Use Solvo&apos;s estimate
          </button>
        )}
      </div>
    </Sheet>
  );
}

function ExtraSheet({ cost, everyday, onClose }: { cost: ExtraCost | null; everyday: number; onClose: () => void }) {
  const [kind, setKind] = useState<ExtraCost["kind"]>(cost?.kind ?? "bill");
  const [name, setName] = useState(cost?.name ?? "");
  const [monthly, setMonthly] = useState(cost?.monthly ?? 0);
  const valid = name.trim().length > 0 && monthly > 0;
  const seg = (k: ExtraCost["kind"]) =>
    `flex h-12 flex-1 items-center justify-center rounded-xl text-[15px] font-semibold ${kind === k ? "bg-primary text-primary-foreground" : "bg-muted"}`;
  // The preview shows the budget after this change: a new cost comes off, an edited one replaces its old amount.
  const preview = everyday + (cost?.monthly ?? 0) - monthly;
  return (
    <Sheet
      title={cost ? cost.name : "Add a fixed cost"}
      onClose={onClose}
      doneLabel={cost ? "Save" : "Add to my bills"}
      doneDisabled={!valid}
      onDone={() => {
        const item = { kind, name: name.trim().slice(0, 60), monthly };
        if (cost) updateExtra(cost.id, item);
        else addExtra(item);
        onClose();
      }}
    >
      <div className="flex flex-col gap-4">
        {!cost && (
          <p className="text-[15px] leading-snug text-muted-foreground">
            Something you pay every month that Solvo hasn&apos;t found, like a bill paid from another account or a subscription.
          </p>
        )}
        <div className="flex gap-2" role="group" aria-label="Bill or subscription">
          <button type="button" className={seg("bill")} aria-pressed={kind === "bill"} onClick={() => setKind("bill")}>
            Bill
          </button>
          <button
            type="button"
            className={seg("subscription")}
            aria-pressed={kind === "subscription"}
            onClick={() => setKind("subscription")}
          >
            Subscription
          </button>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-muted-foreground">What is it</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "subscription" ? "Netflix, Spotify, a gym…" : "Car insurance, daycare, a loan…"}
            autoComplete="off"
            enterKeyHint="next"
            maxLength={60}
            className="h-11 rounded-xl bg-muted px-3 outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <NumberField label="Each month" value={monthly} onChange={setMonthly} suffix="€" max={100000} decimals />
        <BudgetPreview monthly={preview} />
        {cost && (
          <button
            type="button"
            className={`${secondaryButton} text-warn`}
            onClick={() => {
              removeExtra(cost.id);
              onClose();
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            Remove
          </button>
        )}
      </div>
    </Sheet>
  );
}
