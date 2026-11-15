"use client";

import { useState } from "react";
import { CalendarDays, Check, Landmark, Minus, PiggyBank, Plus, Repeat, Target, TrendingUp, Wallet, X } from "lucide-react";
import { PortfolioChart, type ChartLabels } from "@/components/portfolio-chart";
import { AINO_PLAN, portfolio, portfolioDaily, portfolioToday, type Point } from "@/data/portfolio";
import { NumberField } from "@/components/solvo/fields";
import { Sheet } from "@/components/solvo/sheet";
import { ApproveSheet } from "@/app/bills/switch-ui";
import { LearnChip } from "@/components/learn/learn-chip";
import { BackButton, Chip, Group, IconTile, PAGE, PageTitle, Row, Slab, TopBar, eur, primaryButton, secondaryButton } from "@/components/solvo/ui";
import { plainFormat } from "@/lib/demo-clock";
import type { DemoMode } from "@/lib/demo-mode";
import { FUND_TYPES, FUNDS, FUNDS_SOURCE, SAVINGS_ACCOUNT, SAVINGS_ACCOUNT_ID, fundById, isSavingsAccount, projectFund, type FundType } from "@/lib/funds";
import {
  addGoal,
  monthsLeft,
  planLabel,
  reachedBy,
  removeGoal,
  updateGoal,
  useGoals,
  withSavingsAccount,
  type SavingsGoal,
} from "@/lib/goals-store";
import {
  approveSavingsPlan,
  cancelSavingsPlan,
  monthlyFreed,
  planFunds,
  useSavingsPlan,
  useSwitches,
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
const feeText = (id: string) => (isSavingsAccount(id) ? "No fee" : `Fee ${pct(fundById(id).ongoingFeePct)} a year`);
const monthYear = plainFormat({ month: "short", year: "numeric" }); // goals are reached on real dates

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
  const assumptions = [
    ...funds
      .filter((r) => !isSavingsAccount(r.fundId))
      .map((r) => {
        const f = fundById(r.fundId);
        return `${pct(f.illustrativeReturnPct)} a year for ${shortName(f.id)}, before fees`;
      }),
    ...(funds.some((r) => isSavingsAccount(r.fundId)) ? ["no interest on the savings account"] : []),
  ].join(", ");
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
        Growth compounds: returns earn returns. Assumes {assumptions}: an illustrative rate for each type of fund. It is an
        example, not a promise: funds can also lose value.
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
  mode: DemoMode;
  tradeRepublic?: { cash: number; planMonthly: number } | null; // a connected Trade Republic (demo data)
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
            </span>
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

  const goals = useGoals(props.mode);
  const inSavings = goals.reduce((s, g) => s + g.saved, 0); // demo: the savings account holds what the goals have saved
  const savesToAccount = plan ? planFunds(plan).some((f) => isSavingsAccount(f.fundId)) : false;
  // Her accounts in their own group, under the funds: the savings account (what her goals have saved) and the current account.
  const hasSavings = goals.length > 0 || savesToAccount;
  const accounts = (
    <Group title="Your accounts">
      {hasSavings && (
        <Row
          icon={
            <IconTile>
              <Wallet />
            </IconTile>
          }
          title="Savings account"
          value={eur.format(inSavings)}
        />
      )}
      <Row
        icon={
          <IconTile tone="grey">
            <Landmark />
          </IconTile>
        }
        title="Current account"
        value={eur.format(props.balance)}
      />
      {props.tradeRepublic && (
        <>
          <Row
            icon={
              <IconTile>
                <TrendingUp />
              </IconTile>
            }
            title="Trade Republic cash"
            subtitle="Not invested yet: room to invest"
            value={eur.format(props.tradeRepublic.cash)}
          />
          {props.tradeRepublic.planMonthly > 0 && (
            <Row
              icon={
                <IconTile tone="grey">
                  <Repeat />
                </IconTile>
              }
              title="ETF savings plan"
              subtitle="At Trade Republic"
              value={eur.format(props.tradeRepublic.planMonthly)}
              valueSub="a month"
            />
          )}
        </>
      )}
    </Group>
  );
  const goalsGroup = <Goals mode={props.mode} goals={goals} plan={plan} freed={freed} />;

  const now = !props.hasFunds ? (
    accounts
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
      </Group>
      {accounts}
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
              icon={<IconTile>{isSavingsAccount(r.fundId) ? <Wallet /> : <PiggyBank />}</IconTile>}
              title={shortName(r.fundId)}
              subtitle={feeText(r.fundId)}
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
        <button type="button" onClick={() => setEditing(true)} className={`${primaryButton} mt-6`}>
          Edit plan
        </button>
        {goalsGroup}
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
      goals={goalsGroup}
      onDone={() => {
        setEditing(false);
        window.scrollTo({ top: 0 });
      }}
    />
  );
}

/** Pick funds and monthly amounts, then approve. Starts from the current plan when editing one. */
function PlanEditor(
  props: Props & { plan: SavingsPlan | null; freed: number; next: string; now: React.ReactNode; goals: React.ReactNode; onDone: () => void },
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
  // Editing a plan: offer to save only once something differs from the current plan.
  const key = (fs: PlanFund[]) => fs.map((f) => `${f.fundId}:${f.monthly}`).sort().join(",");
  const changed = !plan || key(rows) !== key(planFunds(plan));
  const inPlan = (id: string) => rows.some((r) => r.fundId === id);
  const setAmount = (id: string, monthly: number) =>
    setRows((rs) => rs.map((r) => (r.fundId === id ? { ...r, monthly: Math.max(STEP, monthly) } : r)));
  const toggle = (id: string) =>
    setRows((rs) => (rs.some((r) => r.fundId === id) ? rs.filter((r) => r.fundId !== id) : [...rs, { fundId: id, monthly: NEW_FUND }]));

  const btn = "flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted active:scale-95 disabled:opacity-40";

  return (
    <main className={PAGE}>
      <TopBar back={plan ? <BackButton onClick={props.onDone} label="Save" /> : undefined} />
      <PageTitle title={plan ? "Edit your plan" : "Your investments"}>
        {plan
          ? "Change the amounts, add a fund or your savings account, or take one out. Nothing changes until you approve."
          : props.hasFunds
            ? "How your S-Pankki funds are doing, and a monthly plan to keep them growing."
            : "You don't have funds yet. A small monthly plan is an easy way to start."}
      </PageTitle>

      {!plan && props.now}
      {!plan && props.goals}

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
                <p className="text-[13px] text-muted-foreground">{feeText(r.fundId)}</p>
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

      <Group className="mt-4">
        <CheckRow
          on={inPlan(SAVINGS_ACCOUNT_ID)}
          onClick={() => (inPlan(SAVINGS_ACCOUNT_ID) && rows.length === 1 ? undefined : toggle(SAVINGS_ACCOUNT_ID))}
          title={SAVINGS_ACCOUNT.name}
          subtitle="For goals and a buffer. No fee."
        />
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
            <CheckRow
              key={f.id}
              on={on}
              onClick={() => (on && rows.length === 1 ? undefined : toggle(f.id))}
              title={f.name}
              subtitle={`${f.description}. Fee ${pct(f.ongoingFeePct)} a year${f.subscriptionFeePct ? `, ${pct(f.subscriptionFeePct)} per purchase` : ""}`}
              aside={f.subscriptionFeePct >= 1 ? <Chip tone="warn">Special</Chip> : undefined}
            />
          );
        })}
      </Group>
      <LearnChip pack="fees" className="mt-3 self-start">
        Learn why: how fund fees add up
      </LearnChip>

      {rows.length > 0 && <Projection funds={rows} />}

      <div className="mt-4 flex flex-col gap-3">
        {changed && (
          <button type="button" className={primaryButton} onClick={() => setConfirming(true)} disabled={rows.length === 0}>
            <PiggyBank className="size-[18px]" aria-hidden />
            {plan ? `Save plan, ${eur.format(total)} a month` : `Start investing ${eur.format(total)} a month`}
          </button>
        )}
        {plan && (
          <button type="button" className={secondaryButton} onClick={props.onDone}>
            {changed ? "Keep current plan" : "Back"}
          </button>
        )}
      </div>

      {confirming && (
        <ApproveSheet
          title={plan ? "You approve the new plan" : "You approve this investment plan"}
          points={[
            ...rows.map((r) => `${eur.format(r.monthly)} a month to ${isSavingsAccount(r.fundId) ? "your savings account" : fundById(r.fundId).name}.`),
            `From your account on the ${DAY_OF_MONTH}nd of every month, first on ${props.next}.${parts.fromBudget > 0 ? ` Your weekly budget goes down by ${weekly(parts.fromBudget)}.` : ""}`,
            "Pause, change or stop any time. Demo: no real money moves.",
          ]}
          confirmLabel="Approve"
          onConfirm={() => {
            approveSavingsPlan({
              monthly: total,
              ...parts,
              funds: rows,
              fundId: rows[0].fundId,
              fundName: planLabel(rows),
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

/** A tick-box row in the plan editor: a fund or the savings account. */
function CheckRow({ on, onClick, title, subtitle, aside }: { on: boolean; onClick: () => void; title: string; subtitle: string; aside?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left [&+&]:border-t">
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 ${on ? "border-primary bg-primary" : "border-border"}`}
        aria-hidden
      >
        {on && <Check className="size-3.5 text-white" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug font-medium">{title}</span>
        <span className="block text-[13px] leading-snug text-muted-foreground">{subtitle}</span>
      </span>
      {aside}
    </button>
  );
}

/** The person's savings goals with their progress, and adding or changing one. Each goal's monthly amount goes to the
 * savings account in the saving plan, so adding a goal is approved on its sheet like any plan change. */
function Goals({ mode, goals, plan, freed }: { mode: DemoMode; goals: SavingsGoal[]; plan: SavingsPlan | null; freed: number }) {
  const [open, setOpen] = useState<SavingsGoal | "new" | null>(null);
  return (
    <>
      <Group title="Your goals" className="mt-9" aside={goals.length ? `${eur.format(goals.reduce((s, g) => s + g.monthly, 0))} a month` : undefined}>
        {goals.map((g) => (
          <GoalRow key={g.id} g={g} onOpen={() => setOpen(g)} />
        ))}
        <button type="button" onClick={() => setOpen("new")} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-primary [&+&]:border-t active:bg-muted">
          <IconTile>
            <Plus />
          </IconTile>
          <span className="text-[15px] font-medium">Add a goal</span>
        </button>
      </Group>
      {open && <GoalSheet mode={mode} goal={open === "new" ? null : open} plan={plan} freed={freed} onClose={() => setOpen(null)} />}
    </>
  );
}

function GoalRow({ g, onOpen }: { g: SavingsGoal; onOpen: () => void }) {
  const done = Math.min(100, Math.round((g.saved / Math.max(1, g.target)) * 100));
  const by = reachedBy(g);
  return (
    <button type="button" onClick={onOpen} className="block w-full px-4 py-3 text-left [&+&]:border-t active:bg-muted">
      <span className="flex items-center gap-3">
        <IconTile>
          <Target />
        </IconTile>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-snug font-medium">{g.label}</span>
          <span className="num block text-[13px] text-muted-foreground">
            {eur.format(g.saved)} of {eur.format(g.target)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="num block text-[15px] font-medium">{eur.format(g.monthly)}</span>
          <span className="num block text-[12px] text-muted-foreground">
            {monthsLeft(g) === 0 ? "Reached" : by ? `by ${monthYear(by)}` : "paused"}
          </span>
        </span>
      </span>
      <span className="mt-2.5 block h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.label}, ${done} % saved`}>
        <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${done}%` }} />
      </span>
    </button>
  );
}

/** Add a goal, or change or remove one. Done is the approval: the goal's monthly amount moves to the savings account. */
function GoalSheet({ mode, goal, plan, freed, onClose }: { mode: DemoMode; goal: SavingsGoal | null; plan: SavingsPlan | null; freed: number; onClose: () => void }) {
  const [label, setLabel] = useState(goal?.label ?? "");
  const [target, setTarget] = useState(goal?.target ?? 0);
  const [saved, setSaved] = useState(goal?.saved ?? 0);
  const [months, setMonths] = useState(() => (goal ? (monthsLeft(goal) ?? 12) : 12));
  const toGo = Math.max(0, target - saved);
  const monthly = toGo > 0 ? Math.ceil(toGo / Math.max(1, months)) : 0;
  const next = withSavingsAccount(plan, monthly - (goal?.monthly ?? 0), freed);
  const lessWeekly = (next?.fromBudget ?? 0) - (plan?.fromBudget ?? 0);
  const ok = label.trim().length > 0 && target > 0;

  const save = () => {
    const g = { kind: goal?.kind ?? ("other" as const), label: label.trim(), target, saved: Math.min(saved, target), monthly };
    if (goal) updateGoal(mode, goal.id, g);
    else addGoal(mode, g);
    if (next) approveSavingsPlan(next);
    else cancelSavingsPlan();
    onClose();
  };
  const remove = () => {
    if (!goal) return;
    removeGoal(mode, goal.id);
    const after = withSavingsAccount(plan, -goal.monthly, freed);
    if (after) approveSavingsPlan(after);
    else cancelSavingsPlan();
    onClose();
  };

  return (
    <Sheet title={goal ? goal.label : "Add a goal"} onClose={onClose} onDone={save} doneLabel={goal ? "Save goal" : "Add goal"} doneDisabled={!ok}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-muted-foreground">What for</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value.slice(0, 40))}
            placeholder="A trip, a buffer, a car"
            autoComplete="off"
            className="h-11 rounded-xl bg-muted px-3 outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <div className="flex gap-3">
          <NumberField label="Target" value={target} onChange={setTarget} suffix="€" max={1_000_000} />
          <NumberField label="Already saved" value={saved} onChange={setSaved} suffix="€" max={1_000_000} />
        </div>
        <NumberField label="Months to go" value={months} onChange={(n) => setMonths(Math.max(1, n))} suffix="months" min={1} max={600} />
        {ok && (
          <p className="text-[14px] leading-snug">
            <span className="num font-semibold">{eur.format(monthly)}</span> a month to your savings account on the {DAY_OF_MONTH}nd.
            {lessWeekly >= 1 ? ` ${weekly(lessWeekly)} less to spend a week.` : ""}
          </p>
        )}
        {goal && (
          <button type="button" onClick={remove} className={`${secondaryButton} mt-2`}>
            Remove goal
          </button>
        )}
      </div>
    </Sheet>
  );
}
