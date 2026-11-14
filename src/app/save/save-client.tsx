"use client";

import { useState } from "react";
import { CalendarDays, Check, Landmark, Minus, PiggyBank, Plus, TrendingUp, X } from "lucide-react";
import { PortfolioChart, type ChartLabels } from "@/components/portfolio-chart";
import { AINO_PLAN, portfolio, portfolioDaily, portfolioToday, type Point } from "@/data/portfolio";
import { ApproveSheet } from "@/app/bills/switch-ui";
import { LearnChip } from "@/components/learn/learn-chip";
import { Chip, Group, IconTile, PAGE, PageTitle, Row, Slab, TopBar, eur, primaryButton, secondaryButton } from "@/components/solvo/ui";
import { FUND_TYPES, FUNDS, FUNDS_SOURCE, fundById, projectFund, type FundType } from "@/lib/funds";
import {
  approveSavingsPlan,
  monthlyFreed,
  planFunds,
  useSavingsPlan,
  useSwitches,
  weeklyBoost,
  type PlanFund,
  type SavingsPlan,
} from "@/lib/switches";

const YEARS = 10;
const DAY_OF_MONTH = 2; // the day after a typical salary day
const STEP = 10; // EUR, the +/- step of a fund's monthly amount
const NEW_FUND = 50; // EUR a month for a fund added to the plan
const pct = (n: number) => `${n.toLocaleString("fi-FI")} %`;
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const weekly = (n: number) => eur.format((n * 12) / 52);
const shortName = (id: string) => fundById(id).name.replace("S-Pankki ", "");

const PF = portfolio();
const DAILY = portfolioDaily();
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${eur.format(Math.abs(n))}`;
const signedPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("fi-FI", { maximumFractionDigits: 1 })} %`;

// The chart's time ranges. Daily and intraday values are demo data pinned to the monthly values (src/data/portfolio.ts).
const RANGES: { key: string; label: string; phrase?: string; points: Point[]; labels: ChartLabels }[] = [
  { key: "1d", label: "Today", phrase: "today", points: portfolioToday(DAILY), labels: { point: "time", axis: "time" } },
  { key: "1w", label: "Week", phrase: "in the past week", points: DAILY.slice(-8), labels: { point: "day", axis: "day" } },
  { key: "1m", label: "Month", phrase: "in the past month", points: DAILY.slice(-31), labels: { point: "day", axis: "day" } },
  { key: "1y", label: "Year", phrase: "in the past year", points: DAILY.slice(-366), labels: { point: "date", axis: "month" } },
  { key: "all", label: "All time", points: DAILY.filter((_, i) => i % 3 === (DAILY.length - 1) % 3), labels: { point: "date", axis: "month" } },
];

/** The 10-year projection for a plan's funds, on a light card (the Slab is the portfolio), with how the number comes about. */
function Projection({ funds }: { funds: PlanFund[] }) {
  const parts = funds.map((r) => projectFund(r.monthly, YEARS, fundById(r.fundId)));
  const sum = (k: "value" | "deposited" | "fees") => parts.reduce((s, p) => s + p[k], 0);
  const monthly = funds.reduce((s, r) => s + r.monthly, 0);
  const value = sum("value");
  const deposited = sum("deposited");
  const fees = sum("fees");
  const growth = value + fees - deposited; // returns before fees
  const assumptions = funds
    .map((r) => {
      const f = fundById(r.fundId);
      return `${pct(f.illustrativeReturnPct)} a year for ${shortName(f.id)}`;
    })
    .join(", ");
  const line = (label: string, amount: string, strong = false) => (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 text-[14px] ${strong ? "border-t pt-2.5 font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="num">{amount}</span>
    </div>
  );
  return (
    <section className="mt-4 rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(15,42,31,0.06)]">
      <p className="text-[13px] text-muted-foreground">
        {eur.format(monthly)} a month for {YEARS} years could become
      </p>
      <p className="num mt-1 font-display text-[34px] leading-none font-semibold tracking-[-0.03em]">{eur.format(value)}</p>
      <div className="mt-3">
        {line(`You put in, ${eur.format(monthly)} × ${YEARS * 12} months`, eur.format(deposited))}
        {line("Growth, if the funds earn the rate below", `+${eur.format(growth)}`)}
        {line("Fund fees over the years", `−${eur.format(fees)}`)}
        {line("Could be worth", eur.format(value), true)}
      </div>
      <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
        Growth compounds: returns earn returns. Assumes {assumptions}, before fees, an illustrative rate for each type of
        fund. It is an example, not a promise: funds can also lose value.
      </p>
    </section>
  );
}

function nextInvestDate(asOf: string) {
  const d = new Date(`${asOf}T00:00:00Z`);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (d.getUTCDate() >= DAY_OF_MONTH ? 1 : 0), DAY_OF_MONTH));
  return dateFmt.format(next);
}

/** Where a plan's monthly total comes from: the savings goal first, then money cheaper bills free up, then the budget. */
function split(total: number, goal: number, freed: number) {
  const fromGoal = Math.min(total, goal);
  const fromBills = Math.min(freed, total - fromGoal);
  return { fromGoal, fromBills, fromBudget: total - fromGoal - fromBills };
}

type Props = {
  remaining: number;
  asOf: string;
  balance: number;
  inFunds: number;
  fundDeposits: number;
  savingsGoal: number;
  hasFunds: boolean; // Aino's fund holdings and saving plan are demo data; the new customer has neither
};

function FundsSlab() {
  const [rangeKey, setRangeKey] = useState("all");
  const range = RANGES.find((r) => r.key === rangeKey)!;
  const first = range.points[0].value;
  const change = PF.value - first;
  return (
    <Slab>
      <p className="text-[15px] text-white/70">Your funds are worth</p>
      <p className="num mt-1 font-display text-[56px] leading-none font-semibold tracking-[-0.035em]">{eur.format(PF.value)}</p>
      <p className="mt-2 text-[15px] text-white/80">
        {range.phrase ? (
          <>
            <span className={`num font-semibold ${change < 0 ? "text-white" : "text-mint"}`}>
              {signed(change)} ({signedPct((change / first) * 100)})
            </span>{" "}
            {range.phrase}
          </>
        ) : (
          <>
            <span className="num font-semibold text-mint">
              {signed(PF.gain)} ({signedPct(PF.gainPct)})
            </span>{" "}
            on the {eur.format(PF.invested)} you put in
          </>
        )}
      </p>
      <div className="mt-4 flex gap-1 rounded-full bg-white/[0.07] p-1" role="tablist" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={r.key === rangeKey}
            onClick={() => setRangeKey(r.key)}
            className={`h-11 flex-1 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${r.key === rangeKey ? "bg-white/15 text-white" : "text-white/60"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <PortfolioChart
        key={range.key}
        points={range.points}
        invested={range.key === "all" ? PF.invested : undefined}
        labels={range.labels}
      />
    </Slab>
  );
}

export function SaveClient(props: Props) {
  const switches = useSwitches();
  const stored = useSavingsPlan();
  // Aino already has a saving plan into her two funds (demo data); a plan she edits and approves replaces it.
  const plan: SavingsPlan | null = stored ?? (props.hasFunds ? AINO_PLAN : null);
  const [editing, setEditing] = useState(false);
  const freed = Math.floor(monthlyFreed(switches));
  const next = nextInvestDate(props.asOf);

  const account = (
    <Row
      icon={
        <IconTile tone="grey">
          <Landmark />
        </IconTile>
      }
      title="On your account"
      value={eur.format(props.balance)}
    />
  );

  const now = !props.hasFunds ? (
    <Group title="Your money">{account}</Group>
  ) : (
    <>
      <FundsSlab />
      <Group title="Your funds" aside="value · last 12 months">
        {PF.holdings.map((h) => (
          <Row
            key={h.fundId}
            icon={
              <IconTile>
                <TrendingUp />
              </IconTile>
            }
            title={shortName(h.fundId)}
            value={eur.format(h.value)}
            valueSub={signedPct(h.yearChangePct)}
          />
        ))}
        {account}
      </Group>
    </>
  );

  if (plan && !editing) {
    const funds = planFunds(plan);
    const fromBudget = plan.fromBudget ?? 0;
    return (
      <main className={PAGE}>
        <TopBar />
        <PageTitle title="Your investments" />
        {now}
        <Group
          title="Your saving plan"
          aside={`${eur.format(plan.monthly)} a month`}
          footer={fromBudget > 0 ? `${weekly(fromBudget)} less to spend a week.` : undefined}
        >
          {funds.map((r) => (
            <Row
              key={r.fundId}
              icon={
                <IconTile>
                  <PiggyBank />
                </IconTile>
              }
              title={shortName(r.fundId)}
              subtitle={`Fee ${pct(fundById(r.fundId).ongoingFeePct)} a year`}
              value={eur.format(r.monthly)}
              valueSub="a month"
            />
          ))}
          <Row
            icon={
              <IconTile>
                <CalendarDays />
              </IconTile>
            }
            title="Next investment"
            value={next}
          />
        </Group>
        <Projection funds={funds} />
        <p className="mt-4 px-1 text-[13px] leading-snug text-muted-foreground">
          Safe to spend this week: {eur.format(props.remaining + weeklyBoost(switches, plan))}.
        </p>
        <button type="button" onClick={() => setEditing(true)} className={`${primaryButton} mt-6`}>
          Edit plan
        </button>
      </main>
    );
  }

  return (
    <PlanEditor
      {...props}
      plan={plan}
      freed={freed}
      next={next}
      now={now}
      onDone={() => {
        setEditing(false);
        window.scrollTo({ top: 0 });
      }}
    />
  );
}

/** Pick funds and monthly amounts, then approve. Starts from the current plan when editing one. */
function PlanEditor(
  props: Props & { plan: SavingsPlan | null; freed: number; next: string; now: React.ReactNode; onDone: () => void },
) {
  const { plan, freed } = props;
  const [rows, setRows] = useState<PlanFund[]>(() =>
    plan ? planFunds(plan) : [{ fundId: FUNDS[0].id, monthly: props.savingsGoal + freed }],
  );
  const [fundType, setFundType] = useState<FundType>(fundById(rows[0]?.fundId ?? FUNDS[0].id).type);
  const typeInfo = FUND_TYPES.find((t) => t.type === fundType)!;
  const [confirming, setConfirming] = useState(false);

  const total = rows.reduce((s, r) => s + r.monthly, 0);
  const parts = split(total, props.savingsGoal, freed);
  const inPlan = (id: string) => rows.some((r) => r.fundId === id);
  const setAmount = (id: string, monthly: number) =>
    setRows((rs) => rs.map((r) => (r.fundId === id ? { ...r, monthly: Math.max(STEP, monthly) } : r)));
  const toggle = (id: string) =>
    setRows((rs) => (rs.some((r) => r.fundId === id) ? rs.filter((r) => r.fundId !== id) : [...rs, { fundId: id, monthly: NEW_FUND }]));

  const btn = "flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted active:scale-95 disabled:opacity-40";

  return (
    <main className={PAGE}>
      <TopBar />
      <PageTitle title={plan ? "Edit your plan" : "Your investments"}>
        {plan
          ? "Change the amounts, add a fund or take one out. Nothing changes until you approve."
          : props.hasFunds
            ? "How your S-Pankki funds are doing, and a monthly plan to keep them growing."
            : "You don't have funds yet. A small monthly plan is an easy way to start."}
      </PageTitle>

      {!plan && props.now}

      {!plan && (
        <h2 className="mt-9 px-1 font-display text-[22px] font-semibold tracking-[-0.015em]">
          {props.hasFunds ? "Start investing again" : "Start investing"}
        </h2>
      )}

      <Group
        title="Your plan"
        aside={`${eur.format(total)} a month`}
        footer={
          rows.length === 0
            ? "Add at least one fund below."
            : parts.fromBudget > 0
              ? `${weekly(parts.fromBudget)} less to spend a week.`
              : undefined
        }
      >
        {rows.map((r) => (
          <div key={r.fundId} className="px-4 py-3 [&+&]:border-t">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-snug font-medium">{shortName(r.fundId)}</p>
                <p className="text-[13px] text-muted-foreground">Fee {pct(fundById(r.fundId).ongoingFeePct)} a year</p>
              </div>
              {rows.length > 1 && (
                <button type="button" className={btn} onClick={() => toggle(r.fundId)} aria-label={`Take ${shortName(r.fundId)} out of the plan`}>
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                className={btn}
                onClick={() => setAmount(r.fundId, r.monthly - STEP)}
                disabled={r.monthly <= STEP}
                aria-label={`${STEP} euros less into ${shortName(r.fundId)}`}
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="num flex-1 text-center text-[17px] font-semibold">{eur.format(r.monthly)} a month</span>
              <button
                type="button"
                className={btn}
                onClick={() => setAmount(r.fundId, r.monthly + STEP)}
                aria-label={`${STEP} euros more into ${shortName(r.fundId)}`}
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </Group>

      <h2 className="mt-7 px-1 font-display text-[17px] font-semibold tracking-[-0.01em]">Add a fund</h2>
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Fund type">
        {FUND_TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            role="tab"
            aria-selected={fundType === t.type}
            onClick={() => setFundType(t.type)}
            className={`flex h-11 shrink-0 items-center rounded-full px-4 text-[14px] font-semibold whitespace-nowrap ${fundType === t.type ? "bg-primary text-primary-foreground" : "bg-card text-foreground/80 shadow-[0_1px_3px_rgba(15,42,31,0.06)]"}`}
          >
            {t.label} · {FUNDS.filter((f) => f.type === t.type).length}
          </button>
        ))}
      </div>
      <Group
        className="mt-3"
        footer={`${typeInfo.note ? `${typeInfo.note} ` : ""}You choose: Solvo doesn't give investment advice. ${FUNDS_SOURCE}`}
      >
        {FUNDS.filter((f) => f.type === fundType).map((f) => {
          const on = inPlan(f.id);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => (on && rows.length === 1 ? undefined : toggle(f.id))}
              aria-pressed={on}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left [&+&]:border-t"
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 ${on ? "border-primary bg-primary" : "border-border"}`}
                aria-hidden
              >
                {on && <Check className="size-3.5 text-white" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug font-medium">{f.name}</span>
                <span className="block text-[13px] leading-snug text-muted-foreground">
                  {f.description}. Fee {pct(f.ongoingFeePct)} a year
                  {f.subscriptionFeePct ? `, ${pct(f.subscriptionFeePct)} per purchase` : ""}
                </span>
              </span>
              {f.subscriptionFeePct >= 1 && <Chip tone="warn">Special</Chip>}
            </button>
          );
        })}
      </Group>
      <LearnChip pack="fees" className="mt-3 self-start">
        Learn why: how fund fees add up
      </LearnChip>

      {rows.length > 0 && <Projection funds={rows} />}

      <div className="mt-4 flex flex-col gap-3">
        <button type="button" className={primaryButton} onClick={() => setConfirming(true)} disabled={rows.length === 0}>
          <PiggyBank className="size-[18px]" aria-hidden />
          {plan ? `Save plan, ${eur.format(total)} a month` : `Start investing ${eur.format(total)} a month`}
        </button>
        {plan && (
          <button type="button" className={secondaryButton} onClick={props.onDone}>
            Keep current plan
          </button>
        )}
      </div>

      {confirming && (
        <ApproveSheet
          title={plan ? "You approve the new plan" : "You approve this investment plan"}
          points={[
            ...rows.map((r) => `${eur.format(r.monthly)} a month to ${fundById(r.fundId).name}.`),
            `From your account on the ${DAY_OF_MONTH}nd of every month, first on ${props.next}.${parts.fromBudget > 0 ? ` Your weekly budget goes down by ${weekly(parts.fromBudget)}.` : ""}`,
            "Pause, change or stop any time. Demo: no real fund order is placed.",
          ]}
          confirmLabel="Approve"
          onConfirm={() => {
            approveSavingsPlan({
              monthly: total,
              ...parts,
              funds: rows,
              fundId: rows[0].fundId,
              fundName: rows.length === 1 ? fundById(rows[0].fundId).name : `${rows.length} funds`,
              dayOfMonth: DAY_OF_MONTH,
              approvedAt: new Date().toISOString(),
            });
            setConfirming(false);
            props.onDone();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </main>
  );
}
