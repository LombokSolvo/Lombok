"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { NumberField } from "@/components/solvo/fields";
import { Sheet } from "@/components/solvo/sheet";
import { eur, eur2, secondaryButton } from "@/components/solvo/ui";
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

// The person's own corrections, edited where the costs are (/costs): bills or subscriptions Solvo did not find go
// inside the "Fixed and regular" basket, the monthly set-aside sits inside "Fixed and irregular". Home's "Your money each
// month" and the weekly numbers follow (budget-edits-store, useWeeklyDelta).

const WEEKS_PER_MONTH = 52 / 12;

// A cost the person typed with cents (13,99 €) keeps them; totals stay in whole euros.
const money = (v: number) => (Number.isInteger(v) ? eur : eur2).format(v);

/** A basket's monthly total plus the bills the person added (for the Fixed and regular heading). */
export function LiveFixedTotal({ base }: { base: number }) {
  return <>{eur.format(base + extrasMonthly(useBudgetEdits()))}/mo</>;
}

/** Inside "Fixed and regular": the bills and subscriptions the person added, each tappable, and the Add row. */
export function AddedCosts({ everyday }: { everyday: number }) {
  const edits = useBudgetEdits();
  const [sheet, setSheet] = useState<"add" | ExtraCost | null>(null);
  const everydayNow = everyday + budgetEditsMonthly(edits);
  return (
    <>
      {edits.extras.map((x) => (
        <button
          key={x.id}
          type="button"
          onClick={() => setSheet(x)}
          className="flex min-h-14 w-full items-center gap-3 border-t px-4 py-3 text-left active:bg-muted"
          aria-label={`Change ${x.name}`}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{x.name}</span>
            <span className="block text-[13px] text-muted-foreground">
              {x.kind === "subscription" ? "Subscription" : "Bill"}, added by you
            </span>
          </span>
          <span className="num shrink-0 text-right text-[15px] font-medium">{money(x.monthly)}/mo</span>
          <Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      ))}
      <button
        type="button"
        onClick={() => setSheet("add")}
        className="flex min-h-12 w-full items-center gap-2 border-t px-4 text-left text-[15px] font-semibold text-primary active:bg-muted"
      >
        <Plus className="size-[18px]" aria-hidden />
        Add a bill or subscription
      </button>
      {sheet && <ExtraSheet cost={sheet === "add" ? null : sheet} everyday={everydayNow} onClose={() => setSheet(null)} />}
    </>
  );
}

/** The irregular basket's heading: what the person sets aside each month (Solvo's estimate until they change it). */
export function LiveIrregularTotal({ estimate }: { estimate: number }) {
  const edits = useBudgetEdits();
  return <>{eur.format(edits.irregular ? edits.irregular.monthly : estimate)}/mo</>;
}

/** Inside "Fixed and irregular": what goes aside each month for these costs, Solvo's estimate until the person changes it. */
export function IrregularRow({ estimate, everyday }: { estimate: number; everyday: number }) {
  const edits = useBudgetEdits();
  const [open, setOpen] = useState(false);
  const current = edits.irregular ? edits.irregular.monthly : estimate;
  const everydayNow = everyday + budgetEditsMonthly(edits);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-muted"
        aria-label="Change what you set aside for irregular costs"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-snug font-medium">Set aside each month</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
            {edits.irregular ? `Your amount. Solvo's estimate ${eur.format(estimate)}` : "Solvo's estimate. Tap to change"}
          </span>
        </span>
        <span className="num shrink-0 text-right text-[15px] font-medium">{eur.format(current)}/mo</span>
        <Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <IrregularSheet estimate={estimate} current={current} everydayBefore={everydayNow + current} onClose={() => setOpen(false)} />
      )}
    </>
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
