"use client";

// Shared pieces of the compare, approve and done screens, used by every bill type (electricity, phone).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, Check, PencilLine, ShieldCheck, Sparkles } from "lucide-react";
import { Group, IconTile, Slab, eur, eur2, primaryButton, secondaryButton } from "@/components/solvo/ui";
import { AINO_PLAN } from "@/data/portfolio";
import { fundById, isSavingsAccount } from "@/lib/funds";
import { approveSavingsPlan, planFunds, readSavingsPlan } from "@/lib/switches";

/** The saving, with "do nothing" and the chosen offer as two bars on one scale. */
export function SavingSlab(props: {
  label: string;
  saving: number;
  before: { label: string; yearly: number };
  after: { label: string; yearly: number };
  footnote: ReactNode;
}) {
  const max = Math.max(props.before.yearly, props.after.yearly, 1);
  return (
    <Slab>
      <p className="text-[15px] text-white/70">{props.label}</p>
      <p className="num mt-1 font-display text-[56px] leading-none font-semibold tracking-[-0.035em]">
        {eur.format(Math.max(0, props.saving))}
        <span className="ml-1.5 font-sans text-[18px] font-medium tracking-normal text-white/70">a year</span>
      </p>
      <div className="num mt-5 flex flex-col gap-2.5 text-[13px]">
        <div>
          <div className="mb-1 flex justify-between gap-3 text-white/65">
            <span>{props.before.label}</span>
            <span>{eur.format(props.before.yearly)}</span>
          </div>
          <div className="h-2 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#ff9f87]" style={{ width: `${(props.before.yearly / max) * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between gap-3 font-medium text-white">
            <span>{props.after.label}</span>
            <span>{eur.format(props.after.yearly)}</span>
          </div>
          <div className="h-2 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-mint transition-[width] duration-500"
              style={{ width: `${(props.after.yearly / max) * 100}%` }}
            />
          </div>
        </div>
      </div>
      <p className="mt-4 border-t border-white/10 pt-3 text-[13px] leading-snug text-white/65">{props.footnote}</p>
    </Slab>
  );
}

/** Group of fields the AI read from the e-invoice. Every one is editable. */
export function ReadFields({ badge, children }: { badge: ReactNode; children: ReactNode }) {
  return (
    <Group
      title="From your e-invoice"
      aside={badge}
      footer={
        <span className="inline-flex items-center gap-1">
          <PencilLine className="size-3.5" aria-hidden />
          Check these. Tap any number to correct it.
        </span>
      }
    >
      {children}
    </Group>
  );
}

/** A contract detail read from the e-invoice that isn't a number to edit, such as the supplier or end date. */
export function InfoRow(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-2.5 [&+*]:border-t [*+&]:border-t">
      <span className="shrink-0 text-[15px]">{props.label}</span>
      <span className="text-right text-[15px] leading-snug font-medium">{props.children}</span>
    </div>
  );
}

export function EditField(props: {
  label: string;
  value: number | null;
  unit: string;
  step?: string;
  min?: number;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="flex min-h-[52px] items-center justify-between gap-3 px-4 [*+&]:border-t">
      <span className="text-[15px]">{props.label}</span>
      <span className="flex items-center gap-1.5 rounded-lg bg-muted/70 pr-2.5 focus-within:bg-accent focus-within:ring-2 focus-within:ring-primary/30">
        <input
          type="number"
          inputMode="decimal"
          step={props.step ?? "any"}
          min={props.min}
          value={props.value ?? ""}
          onChange={(e) => props.onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="num field-inline h-9 w-[5.5rem] bg-transparent pl-2.5 text-right font-medium outline-none"
        />
        <span className="w-10 text-[12px] text-muted-foreground">{props.unit}</span>
      </span>
    </label>
  );
}

export function OfferOption(props: {
  chosen: boolean;
  title: ReactNode;
  yearly: number;
  detail: ReactNode;
  pick?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.chosen}
      onClick={props.onSelect}
      className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors [&+&]:border-t ${props.chosen ? "bg-accent/60" : "active:bg-muted"}`}
    >
      <span
        className={`mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 ${props.chosen ? "border-primary bg-primary text-white" : "border-input"}`}
        aria-hidden
      >
        {props.chosen && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-semibold">{props.title}</span>
          <span className="num shrink-0 text-[15px] font-semibold">{eur.format(props.yearly)}</span>
        </span>
        <span className="num mt-0.5 block text-[13px] leading-snug text-muted-foreground">{props.detail}</span>
        {props.pick && (
          // Not a Chip: the reason can be a whole sentence ("a bit slower, still plenty for video calls…"),
          // and a chip never wraps, so it was cut off at the screen edge.
          <span className="mt-1.5 inline-flex items-start gap-1 rounded-xl bg-accent px-2 py-1 text-[12px] leading-snug font-medium text-accent-foreground">
            <Sparkles className="mt-0.5 size-3 shrink-0" aria-hidden />
            {props.pick}
          </span>
        )}
      </span>
    </button>
  );
}

/** The main action, pinned above the tab bar. Pages using it need bottom padding (pb-24). */
export function StickyAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[430px] bg-gradient-to-t from-background via-background/95 to-background/0 px-4 pt-6 pb-[calc(0.75rem+var(--tabbar-h))]">
      <button
        type="button"
        className={primaryButton}
        // A field may still have focus (the tab bar is hidden then). Blurring it on press moves this bar,
        // so the tap would land elsewhere: keep the focus until the click, then let go of it.
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          (document.activeElement as HTMLElement | null)?.blur?.();
          onClick();
        }}
      >
        {children}
      </button>
    </div>
  );
}

/** Bottom sheet where the user approves. Solvo never switches without this tap. */
export function ApproveSheet(props: {
  title: string;
  points: string[];
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 mx-auto flex w-full max-w-[430px] flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 animate-in bg-slab/40 backdrop-blur-[2px] fade-in"
        onClick={props.onCancel}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="approve-title"
        className="relative animate-in rounded-t-[28px] bg-card px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl duration-200 slide-in-from-bottom"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />
        <div className="flex items-center gap-3">
          <IconTile>
            <ShieldCheck />
          </IconTile>
          <h2 id="approve-title" className="font-display text-[22px] font-semibold tracking-[-0.015em]">
            {props.title}
          </h2>
        </div>
        <ul className="mt-4 flex flex-col gap-3 text-[15px] leading-snug">
          {props.points.map((t) => (
            <li key={t} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.75} aria-hidden />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" className={primaryButton} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
          <button type="button" className={secondaryButton} onClick={props.onCancel}>
            Not now
          </button>
        </div>
      </section>
    </div>
  );
}

/** Counts from one amount to another once, so the user sees the safe-to-spend number move. */
function CountUp({ from, to }: { from: number; to: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduced ? 0 : 450;
    const duration = reduced ? 1 : 1100;
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      setV(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);
  return <>{eur.format(v)}</>;
}

/** After approval: a check, what happens next, and the safe-to-spend number rising. */
export function DoneView(props: {
  title: string;
  body: ReactNode;
  remainingBefore: number;
  remainingAfter: number;
  perWeek: number;
  footnote: ReactNode;
  reminder?: ReactNode;
  /** What would happen next in real use. The switch itself is simulated in the demo. */
  steps?: { title: string; detail: string }[];
}) {
  const router = useRouter();
  const [rise, setRise] = useState<FundRiseRows | null>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  // After the money has visibly gone into the funds, go back to Home.
  useEffect(() => {
    if (!rise) return;
    const t = setTimeout(() => router.push("/"), 3600);
    return () => clearTimeout(t);
  }, [rise, router]);
  return (
    <div className="flex flex-col">
      {rise && <FundRise rows={rise.rows} extra={rise.extra} />}
      <div className="mt-6 flex flex-col items-center text-center">
        <span className="flex size-16 animate-pop items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_30px_-10px_rgba(19,98,63,0.8)]">
          <Check className="size-8" strokeWidth={2.75} aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-[28px] leading-tight font-semibold tracking-[-0.02em]">{props.title}</h1>
        <p className="mt-2 max-w-[32ch] text-[15px] leading-snug text-muted-foreground">{props.body}</p>
      </div>

      <Slab className="mt-7">
        <p className="text-[15px] text-white/70">Safe to spend this week</p>
        <p className="num mt-1 font-display text-[56px] leading-none font-semibold tracking-[-0.035em]">
          <CountUp from={props.remainingBefore} to={props.remainingAfter} />
        </p>
        {props.perWeek > 0 && (
          <p className="mt-3 inline-flex h-7 items-center rounded-full bg-mint/15 px-2.5 text-[13px] font-semibold text-mint">
            +{eur.format(props.perWeek)} every week
          </p>
        )}
        <p className="mt-4 border-t border-white/10 pt-3 text-[13px] leading-snug text-white/65">{props.footnote}</p>
      </Slab>

      {props.steps && (
        <section className="mt-4 rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(15,42,31,0.06)]">
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em]">What happens next</h2>
          <ol className="mt-3 flex flex-col">
            {props.steps.map((st, i) => (
              <li key={st.title} className="relative flex gap-3 pb-4 last:pb-0">
                {i < props.steps!.length - 1 && <span className="absolute top-6 bottom-0 left-[11px] w-px bg-border" aria-hidden />}
                <span
                  className={`num flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                    i === 0 ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  }`}
                  aria-hidden
                >
                  {i === 0 ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0 text-[14px] leading-snug">
                  <span className="font-medium">{st.title}</span>
                  <span className="block text-[13px] text-muted-foreground">{st.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {props.reminder && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(15,42,31,0.06)]">
          <IconTile>
            <Bell />
          </IconTile>
          <p className="text-[14px] leading-snug">{props.reminder}</p>
        </div>
      )}

      {props.perWeek > 0 && (
        <button type="button" className={`${primaryButton} mt-6`} onClick={() => setRise(saveInFund(Math.round((props.perWeek * 52) / 12)))}>
          Save it in a fund instead
        </button>
      )}
      <Link href="/" className={`${secondaryButton} mt-2`}>
        Back to home
      </Link>
    </div>
  );
}

type FundRiseRows = { extra: number; rows: { name: string; from: number; to: number }[] };

/** Moves the money a cheaper bill frees up into the saving plan: the first fund gets it every month. Returns what to animate. */
// `from`: a cheaper bill frees money the plan already counts as bill savings; a stopped subscription frees weekly budget,
// so moving it to the fund takes it back out of the weekly budget.
function saveInFund(extra: number, from: "bills" | "budget" = "bills"): FundRiseRows {
  const base = readSavingsPlan() ?? AINO_PLAN;
  const funds = planFunds(base);
  const target = funds.findIndex((f) => !isSavingsAccount(f.fundId));
  const at = target < 0 ? 0 : target;
  const next = funds.map((f, i) => (i === at ? { ...f, monthly: f.monthly + extra } : f));
  approveSavingsPlan({
    ...base,
    funds: next,
    monthly: base.monthly + extra,
    ...(from === "bills" ? { fromBills: (base.fromBills ?? 0) + extra } : { fromBudget: (base.fromBudget ?? 0) + extra }),
    approvedAt: new Date().toISOString(),
  });
  return { extra, rows: funds.map((f, i) => ({ name: fundById(f.fundId).name, from: f.monthly, to: next[i].monthly })) };
}

/** Full-screen moment: each fund's monthly amount grows as a bar, the new money in mint, then the app goes Home. */
function FundRise({ rows, extra }: { rows: FundRiseRows["rows"]; extra: number }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 350);
    return () => clearTimeout(t);
  }, []);
  const max = Math.max(...rows.map((r) => r.to));
  return (
    <div className="fixed inset-0 z-50 flex animate-in flex-col justify-center bg-slab px-6 text-white fade-in duration-300" role="status" aria-live="polite">
      <p className="text-[15px] text-white/70">Saved in your funds</p>
      <p className="num mt-1 font-display text-[44px] leading-none font-semibold tracking-[-0.03em]">
        +<CountUp from={0} to={extra} /> a month
      </p>
      <p className="mt-3 max-w-[30ch] text-[14px] leading-snug text-white/70">The money you freed up now grows in your saving plan, from the next payday.</p>
      <ul className="mt-8 flex flex-col gap-5">
        {rows.map((r) => (
          <li key={r.name}>
            <div className="flex items-baseline justify-between text-[14px]">
              <span className="truncate pr-3">{r.name}</span>
              <span className="num font-semibold">
                <CountUp from={r.from} to={r.to} />
              </span>
            </div>
            <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-white/10">
              <span className="h-full bg-white/80 transition-[width] duration-1000 ease-out" style={{ width: `${(r.from / max) * 100}%` }} />
              <span
                className="h-full bg-mint transition-[width] delay-300 duration-1000 ease-out"
                style={{ width: grown ? `${((r.to - r.from) / max) * 100}%` : "0%" }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-[13px] text-white/55">Back to Home…</p>
    </div>
  );
}

/**
 * After something stops costing money (a cancelled subscription): the freed money lands in the weekly budget, shown as the
 * safe-to-spend number counting up, with the choice to put it into the funds instead (then the funds grow and the app goes Home).
 */
export function FreedMoney(props: { title: string; monthly: number; remainingBefore: number; onClose: () => void }) {
  const router = useRouter();
  const [rise, setRise] = useState<FundRiseRows | null>(null);
  const perWeek = (props.monthly * 12) / 52;
  useEffect(() => {
    if (!rise) return;
    const t = setTimeout(() => router.push("/"), 3600);
    return () => clearTimeout(t);
  }, [rise, router]);
  if (rise) return <FundRise rows={rise.rows} extra={rise.extra} />;
  return (
    <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-[430px] animate-in flex-col justify-center bg-background px-5 fade-in duration-300" role="status" aria-live="polite">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-16 animate-pop items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_30px_-10px_rgba(19,98,63,0.8)]">
          <Check className="size-8" strokeWidth={2.75} aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-[26px] leading-tight font-semibold tracking-[-0.02em]">{props.title}</h1>
      </div>
      <Slab className="mt-7">
        <p className="text-[15px] text-white/70">Safe to spend this week</p>
        <p className="num mt-1 font-display text-[56px] leading-none font-semibold tracking-[-0.035em]">
          <CountUp from={props.remainingBefore} to={props.remainingBefore + perWeek} />
        </p>
        <p className="mt-3 inline-flex h-7 items-center rounded-full bg-mint/15 px-2.5 text-[13px] font-semibold text-mint">+{eur2.format(perWeek)} every week</p>
        <p className="mt-4 border-t border-white/10 pt-3 text-[13px] leading-snug text-white/65">
          {eur2.format(props.monthly)} a month stays with you, {eur.format(props.monthly * 12)} a year.
        </p>
      </Slab>
      <button type="button" className={`${primaryButton} mt-6`} onClick={() => setRise(saveInFund(Math.round(props.monthly), "budget"))}>
        Save it in a fund instead
      </button>
      <button type="button" className={`${secondaryButton} mt-2`} onClick={props.onClose}>
        Keep it in my weekly budget
      </button>
    </div>
  );
}
