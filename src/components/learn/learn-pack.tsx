"use client";

import { useState } from "react";
import { ArrowRight, Check, ChevronLeft, GraduationCap, MessageCircle, Sparkles, X } from "lucide-react";
import { NumberField, Stepper } from "@/components/solvo/fields";
import { eur, eur2 } from "@/components/solvo/ui";
import { cn } from "@/lib/utils";
import {
  BAD_YEAR_PCT,
  ILLUSTRATIVE_RETURN_PCT,
  breakEvenSpot,
  compareFrom,
  fmtDay,
  oneCompanyLoss,
  rolloverExtra,
  elecYear,
  essentials,
  feeCost,
  feeLevels,
  getPack,
  type LearnContext,
  type PackId,
} from "@/lib/learn";
import { courseOf, courseState, nextLesson } from "@/lib/learn-game";
import { finishPack, learnStreak, useLearnProgress } from "@/lib/learn-store";

const nf = (n: number, d = 0) => n.toLocaleString("fi-FI", { minimumFractionDigits: d, maximumFractionDigits: d });

/** One learning pack, played inside the coach chat: three cards, a quiz, a try-it step with the person's numbers. */
export function LearnPack({
  id,
  ctx,
  onAsk,
  onOpen,
}: {
  id: PackId;
  ctx: LearnContext;
  onAsk: (q: string) => void;
  onOpen: (id: PackId) => void;
}) {
  const pack = getPack(id, ctx);
  const progress = useLearnProgress();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const steps = pack.cards.length + 2; // cards, quiz, try it
  const done = step >= steps;
  const course = courseOf(id);
  const courseNow = course ? courseState(course, progress.done) : null;
  const next1 = nextLesson(id, progress.done);
  const nextPack = next1?.kind === "pack" ? next1.pack : undefined;
  const streak = learnStreak(progress);

  const next = () => {
    if (step === steps - 1) finishPack(id, picked === pack.quiz.correct);
    setStep((s) => s + 1);
  };

  return (
    <section
      aria-label={`Learning pack: ${pack.title}`}
      className="overflow-hidden rounded-[24px] bg-card shadow-[0_1px_3px_rgba(15,42,31,0.06),0_10px_30px_-18px_rgba(15,42,31,0.35)]"
    >
      <header className="flex items-center gap-2.5 px-4 pt-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slab text-mint">
          <GraduationCap className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.06em] text-primary uppercase">Money skills</p>
          <p className="truncate text-[15px] leading-tight font-semibold">{pack.title}</p>
        </div>
        <span className="num shrink-0 text-[12px] text-muted-foreground">
          {done ? "Done" : `${step + 1} / ${steps}`}
        </span>
      </header>
      <div className="mt-3 flex gap-1 px-4" aria-hidden>
        {Array.from({ length: steps }, (_, i) => (
          <span
            key={i}
            className={cn("h-1 flex-1 rounded-full transition-colors duration-300", i < step || done ? "bg-primary" : i === step ? "bg-primary/45" : "bg-muted")}
          />
        ))}
      </div>

      <div key={step} className="animate-in fade-in slide-in-from-right-3 px-4 pt-4 pb-4 duration-200">
        {step < pack.cards.length && (
          <div>
            <h3 className="font-display text-[21px] leading-tight font-semibold tracking-[-0.015em]">
              {pack.cards[step].title}
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed text-foreground/85">{pack.cards[step].body}</p>
            {pack.cards[step].you && (
              <p className="mt-3 flex gap-2 rounded-2xl bg-accent/70 px-3 py-2.5 text-[14px] leading-snug text-accent-foreground">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="font-semibold">You: </span>
                  {pack.cards[step].you}
                </span>
              </p>
            )}
          </div>
        )}

        {step === pack.cards.length && (
          <div>
            <p className="text-[12px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Quick question</p>
            <h3 className="mt-1 text-[17px] leading-snug font-semibold">{pack.quiz.question}</h3>
            <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Answers">
              {pack.quiz.options.map((o, i) => {
                const isRight = i === pack.quiz.correct;
                const show = picked !== null;
                return (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={picked === i}
                    disabled={show}
                    onClick={() => setPicked(i)}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left text-[15px] leading-snug transition-colors",
                      !show && "border-border active:bg-muted",
                      show && isRight && "border-primary bg-accent font-medium",
                      show && !isRight && picked === i && "border-warn/50 bg-warn-soft",
                      show && !isRight && picked !== i && "border-border opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[12px] font-semibold",
                        show && isRight ? "border-primary bg-primary text-white" : show && picked === i ? "border-warn bg-warn text-white" : "border-input",
                      )}
                      aria-hidden
                    >
                      {show && isRight ? <Check className="size-3.5" strokeWidth={3} /> : show && picked === i ? <X className="size-3.5" strokeWidth={3} /> : String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex-1">{o}</span>
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <p className="mt-3 animate-in fade-in text-[14px] leading-snug" aria-live="polite">
                <span className={cn("font-semibold", picked === pack.quiz.correct ? "text-primary" : "text-warn")}>
                  {picked === pack.quiz.correct ? "Correct. " : "Not quite. "}
                </span>
                {pack.quiz.explain}
              </p>
            )}
          </div>
        )}

        {step === pack.cards.length + 1 && (
          <div>
            <h3 className="font-display text-[21px] leading-tight font-semibold tracking-[-0.015em]">{pack.tryTitle}</h3>
            {id === "electricity" && <ElectricityTry ctx={ctx} />}
            {id === "fees" && <FeesTry ctx={ctx} />}
            {id === "buffer" && <BufferTry ctx={ctx} />}
            {id === "fund" && <FundTry ctx={ctx} />}
            {id === "risk" && <RiskTry ctx={ctx} />}
            {id === "spread" && <SpreadTry ctx={ctx} />}
            {id === "needs" && <NeedsTry ctx={ctx} />}
            {id === "first" && <FirstTry ctx={ctx} />}
            {id === "ends" && <EndsTry ctx={ctx} />}
            {id === "subs" && <SubsTry ctx={ctx} />}
          </div>
        )}

        {done && (
          <div className="flex flex-col items-center pt-1 text-center">
            <span className="flex size-14 animate-pop items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_30px_-10px_rgba(19,98,63,0.8)]">
              <Check className="size-7" strokeWidth={2.75} aria-hidden />
            </span>
            <h3 className="mt-3 font-display text-[21px] font-semibold tracking-[-0.015em]">Pack done</h3>
            <p className="mt-1 text-[14px] text-muted-foreground">
              {course && courseNow
                ? courseNow.complete
                  ? `You finished ${course.title} and earned the title ${course.badge}`
                  : `${courseNow.done} of ${courseNow.total} lessons in ${course.title} done`
                : "Lesson done"}
              {streak > 1 ? `, ${streak} days in a row` : ""}.
            </p>
            <div className="mt-4 flex w-full flex-col gap-2">
              {pack.followUps.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onAsk(q)}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl bg-muted px-3.5 py-2.5 text-left text-[14px] font-medium active:bg-muted/70"
                >
                  <MessageCircle className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="flex-1">{q}</span>
                </button>
              ))}
              {nextPack && (
                <button
                  type="button"
                  onClick={() => onOpen(nextPack)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground active:scale-[0.98]"
                >
                  Next: {getPack(nextPack, ctx).title}
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!done && (
        <footer className="flex items-center gap-2 border-t border-border/70 px-2 py-2">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex h-11 items-center gap-0.5 rounded-full pr-3 pl-2 text-[15px] font-medium text-primary active:bg-primary/10 disabled:invisible"
          >
            <ChevronLeft className="size-5" aria-hidden />
            Back
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={next}
            disabled={step === pack.cards.length && picked === null}
            className="flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-95 disabled:bg-muted disabled:text-muted-foreground"
          >
            {step === steps - 1 ? "Finish" : step === pack.cards.length && picked === null ? "Pick an answer" : "Next"}
            {step < steps - 1 && !(step === pack.cards.length && picked === null) && <ArrowRight className="size-4" aria-hidden />}
          </button>
        </footer>
      )}
    </section>
  );
}

/** Horizontal bars on one scale, the way the switch screen shows "do nothing" against an offer. */
function Bars({ rows }: { rows: { label: string; value: number; tone: "green" | "warn" | "grey"; strong?: boolean }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="num mt-4 flex flex-col gap-3 text-[13px]">
      {rows.map((r) => (
        <div key={r.label}>
          <div className={cn("mb-1 flex justify-between gap-3", r.strong ? "font-semibold" : "text-muted-foreground")}>
            <span>{r.label}</span>
            <span>{eur.format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                r.tone === "green" && "bg-primary",
                r.tone === "warn" && "bg-[#e9876f]",
                r.tone === "grey" && "bg-foreground/25",
              )}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; display: string }) {
  return (
    <label className="mt-4 block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">{props.label}</span>
        <span className="num text-[15px] font-semibold">{props.display}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-1 h-11 w-full accent-[var(--primary)]"
      />
    </label>
  );
}

function ElectricityTry({ ctx }: { ctx: LearnContext }) {
  const e = ctx.electricity;
  const [kwh, setKwh] = useState(e.kwh);
  const [avg, setAvg] = useState(e.spotAvg);
  const fixed = elecYear(kwh, e.fixed.cents, e.fixed.fee);
  const spot = elecYear(kwh, avg + e.spot.margin, e.spot.fee);
  const even = breakEvenSpot(e, kwh);
  const diff = spot - fixed;
  const rows: Parameters<typeof Bars>[0]["rows"] = [
    { label: `Fixed, ${nf(e.fixed.cents, 2)} c/kWh`, value: fixed, tone: "green", strong: diff >= 0 },
    { label: `Spot at ${nf(avg, 1)} c + ${nf(e.spot.margin, 2)} c margin`, value: spot, tone: diff > 0 ? "warn" : "green", strong: diff < 0 },
  ];
  if (e.current) rows.push({ label: `Do nothing, rolls over to ${nf(e.current.afterCents, 2)} c`, value: elecYear(kwh, e.current.afterCents, e.current.afterFee), tone: "grey" });

  return (
    <div>
      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">
        {e.hasInvoice
          ? "Your use is from your e-invoice. Move the spot price to see when each one wins."
          : "Starts from a small flat. Change it to your own use."}
      </p>
      <div className="mt-3 flex">
        <NumberField label="Your yearly use" value={kwh} onChange={(n) => setKwh(Math.max(1, n))} suffix="kWh" max={40000} />
      </div>
      <Slider
        label="Average spot price over the year"
        value={avg}
        min={2}
        max={25}
        step={0.5}
        onChange={setAvg}
        display={`${nf(avg, 1)} c/kWh`}
      />
      <Bars rows={rows} />
      <p className="mt-4 rounded-2xl bg-muted/70 px-3 py-2.5 text-[14px] leading-snug">
        {Math.abs(diff) < 5
          ? "At this price they cost about the same."
          : diff > 0
            ? `At this price, fixed is ${eur.format(diff)} a year cheaper.`
            : `At this price, spot is ${eur.format(-diff)} a year cheaper.`}{" "}
        They break even at a spot average of about <span className="num font-semibold">{nf(even, 1)} c/kWh</span>. Yearly
        averages have swung a lot: very high in the 2022 energy crisis, much lower since. Prices are the best fixed and spot
        offers Solvo found for your use, energy only.
      </p>
    </div>
  );
}

function FeesTry({ ctx }: { ctx: LearnContext }) {
  const f = ctx.funds;
  const [start, setStart] = useState(f.value);
  const [monthly, setMonthly] = useState(f.monthly);
  const [years, setYears] = useState(20);
  const levels = feeLevels(f).map((l) => ({ ...l, ...feeCost(start, monthly, years, l.pct) }));
  const gap = levels[levels.length - 1].fees - levels[0].fees;
  return (
    <div>
      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">
        {f.hasFunds ? "Starts from what you have in funds today." : "Start from zero, or put in what you already have saved."} Same
        return for every fee, so only the fee differs.
      </p>
      <div className="mt-3 flex gap-2">
        <NumberField label="Start with" value={start} onChange={setStart} suffix="€" max={1_000_000} />
        <NumberField label="Each month" value={monthly} onChange={setMonthly} suffix="€" max={10_000} />
      </div>
      <Slider label="For how long" value={years} min={5} max={40} step={1} onChange={setYears} display={`${years} years`} />
      <p className="mt-3 text-[13px] font-semibold">Fees paid over {years} years</p>
      <Bars
        rows={levels.map((l, i) => ({
          label: `${nf(l.pct, 2)} % a year, ${l.label}`,
          value: l.fees,
          tone: i === 0 ? "green" : i === 1 ? "grey" : "warn",
        }))}
      />
      <p className="mt-4 rounded-2xl bg-muted/70 px-3 py-2.5 text-[14px] leading-snug">
        You&apos;d put in {eur.format(levels[0].deposited)}. The difference between the lowest and highest fee is{" "}
        <span className="num font-semibold">{eur.format(gap)}</span> of your money. Illustration at {ILLUSTRATIVE_RETURN_PCT} % a
        year before fees, not a forecast. Funds also differ in risk and in what they own, so the fee is one fact among
        several. Solvo doesn&apos;t give investment advice.
      </p>
    </div>
  );
}

function BufferTry({ ctx }: { ctx: LearnContext }) {
  const b = ctx.buffer;
  const need = essentials(b);
  const [months, setMonths] = useState(3);
  const [monthly, setMonthly] = useState(b.savingsGoal);
  const target = need * months;
  const covered = b.balance / Math.max(need, 1);
  const toGo = monthly > 0 ? Math.ceil(target / monthly) : null;
  return (
    <div>
      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">From your last 12 months of payments.</p>
      <div className="mt-3 overflow-hidden rounded-2xl bg-muted/60 text-[14px]">
        <div className="flex justify-between gap-3 px-3.5 py-2.5">
          <span>Rent and bills</span>
          <span className="num">{eur.format(b.rentAndBills)} / mo</span>
        </div>
        <div className="flex justify-between gap-3 border-t border-background px-3.5 py-2.5">
          <span>Groceries</span>
          <span className="num">{eur.format(b.groceries)} / mo</span>
        </div>
        <div className="flex justify-between gap-3 border-t border-background px-3.5 py-2.5 font-semibold">
          <span>Essentials</span>
          <span className="num">{eur.format(need)} / mo</span>
        </div>
      </div>
      <div className="mt-4">
        <Stepper
          label="Months of essentials"
          value={months}
          min={1}
          max={6}
          onChange={setMonths}
          format={(n) => `${n} ${n === 1 ? "month" : "months"}`}
        />
      </div>
      <div className="mt-4 rounded-2xl bg-slab px-4 py-3.5 text-white">
        <p className="text-[13px] text-white/70">Your buffer goal</p>
        <p className="num font-display text-[34px] leading-tight font-semibold tracking-[-0.02em]">{eur.format(target)}</p>
        <p className="mt-1 text-[13px] leading-snug text-white/70">
          Your account has {eur.format(b.balance)} today, about {nf(covered, 1)} months of essentials. But that&apos;s also your
          spending money, so it only counts once it&apos;s kept apart.
        </p>
      </div>
      <div className="mt-4 flex">
        <NumberField label="Put aside each month" value={monthly} onChange={setMonthly} suffix="€" max={10_000} />
      </div>
      <p className="mt-3 rounded-2xl bg-muted/70 px-3 py-2.5 text-[14px] leading-snug">
        {toGo
          ? `At ${eur.format(monthly)} a month you'd reach ${eur.format(target)} in ${toGo} ${toGo === 1 ? "month" : "months"}${toGo > 12 ? `, about ${nf(toGo / 12, 1)} years` : ""}.`
          : "Put in a monthly amount to see how long it takes."}{" "}
        Solvo&apos;s plan can move it to a savings account on payday, before you can spend it.
      </p>
    </div>
  );
}

/** A short sum line in the muted box every try-it step ends with. */
function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-2xl bg-muted/70 px-3 py-2.5 text-[14px] leading-snug">{children}</p>;
}

/** Rows of label and amount, like the buffer step's table. The last row can be the total. */
function Table({ rows, total }: { rows: [string, string][]; total?: [string, string] }) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl bg-muted/60 text-[14px]">
      {rows.map(([l, v], i) => (
        <div key={l} className={cn("flex justify-between gap-3 px-3.5 py-2.5", i > 0 && "border-t border-background")}>
          <span>{l}</span>
          <span className="num">{v}</span>
        </div>
      ))}
      {total && (
        <div className="flex justify-between gap-3 border-t border-background px-3.5 py-2.5 font-semibold">
          <span>{total[0]}</span>
          <span className="num">{total[1]}</span>
        </div>
      )}
    </div>
  );
}

const COMPANY_STEPS = [1, 10, 30, 100, 500, 1500];

function FundTry({ ctx }: { ctx: LearnContext }) {
  const [monthly, setMonthly] = useState(ctx.funds.monthly);
  const [i, setI] = useState(5);
  const companies = COMPANY_STEPS[i];
  const each = monthly / companies;
  return (
    <div>
      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">Put in a monthly amount and see how a fund spreads it.</p>
      <div className="mt-3 flex">
        <NumberField label="Each month" value={monthly} onChange={setMonthly} suffix="€" max={10_000} />
      </div>
      <Slider
        label="Companies the fund owns"
        value={i}
        min={0}
        max={COMPANY_STEPS.length - 1}
        step={1}
        onChange={setI}
        display={companies === 1 ? "1, a single share" : nf(companies)}
      />
      <div className="mt-4 rounded-2xl bg-slab px-4 py-3.5 text-white">
        <p className="text-[13px] text-white/70">Each company gets</p>
        <p className="num font-display text-[34px] leading-tight font-semibold tracking-[-0.02em]">
          {each >= 1 ? eur2.format(each) : `${nf(each * 100, 1)} c`}
        </p>
        <p className="mt-1 text-[13px] leading-snug text-white/70">a month, out of your {eur.format(monthly)}.</p>
      </div>
      <Note>
        In a year you&apos;d put in {eur.format(monthly * 12)}
        {companies > 1 ? `, spread over ${nf(companies)} companies` : ", all in one company"}. A broad index fund owns over a
        thousand. Information, not advice. Funds can lose value.
      </Note>
    </div>
  );
}

function RiskTry({ ctx }: { ctx: LearnContext }) {
  const [amount, setAmount] = useState(ctx.funds.value || 1000);
  const [years, setYears] = useState(ctx.funds.hasFunds ? 10 : 1);
  const loss = (amount * BAD_YEAR_PCT) / 100;
  return (
    <div>
      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">
        {ctx.funds.hasFunds ? "Starts from what you have in funds today." : "Put in an amount you might invest."}
      </p>
      <div className="mt-3 flex">
        <NumberField label="Amount in a fund" value={amount} onChange={setAmount} suffix="€" max={1_000_000} />
      </div>
      <Bars
        rows={[
          { label: "Today", value: amount, tone: "grey" },
          { label: `After a bad year, −${BAD_YEAR_PCT} %`, value: amount - loss, tone: "warn", strong: true },
        ]}
      />
      <div className="mt-4">
        <Stepper label="You need the money in" value={years} min={1} max={20} onChange={setYears} format={(n) => `${n} ${n === 1 ? "year" : "years"}`} />
      </div>
      <Note>
        A fall like this has happened, in 2008 and in early 2020, and would take about <span className="num font-semibold">{eur.format(loss)}</span> for
        a while.{" "}
        {years <= 2
          ? "Needed this soon, there may be no time to wait for a recovery, so a savings account is the steadier place."
          : years < 7
            ? "There's some time to recover, but a dip could still be there when you need the money."
            : "That's time to wait out a dip, though nothing is guaranteed."}{" "}
        Information, not advice. Funds can lose value.
      </Note>
    </div>
  );
}

function SpreadTry({ ctx }: { ctx: LearnContext }) {
  const [amount, setAmount] = useState(ctx.funds.value || 1000);
  const [i, setI] = useState(4);
  const companies = COMPANY_STEPS[i];
  const loss = oneCompanyLoss(amount, companies);
  return (
    <div>
      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">One company in your money falls by half. What does it cost you?</p>
      <div className="mt-3 flex">
        <NumberField label="Amount invested" value={amount} onChange={setAmount} suffix="€" max={1_000_000} />
      </div>
      <Slider
        label="Companies your money is spread over"
        value={i}
        min={0}
        max={COMPANY_STEPS.length - 1}
        step={1}
        onChange={setI}
        display={nf(companies)}
      />
      <Bars
        rows={[
          { label: "All in that one company", value: oneCompanyLoss(amount, 1), tone: "warn" },
          { label: `Spread over ${nf(companies)}`, value: loss, tone: "green", strong: true },
        ]}
      />
      <Note>
        Spread over {nf(companies)} {companies === 1 ? "company" : "companies"}, you&apos;d lose about{" "}
        <span className="num font-semibold">{loss >= 1 ? eur.format(loss) : `${nf(loss * 100, 0)} cents`}</span>. If the whole
        market falls, spreading doesn&apos;t help, which is why time matters too.
      </Note>
    </div>
  );
}

function NeedsTry({ ctx }: { ctx: LearnContext }) {
  const b = ctx.buffer;
  const [income, setIncome] = useState(Math.round(b.income));
  const need = essentials(b);
  const left = income - need;
  return (
    <div>
      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">Your needs are from your last 12 months of payments.</p>
      <div className="mt-3 flex">
        <NumberField label="Your income a month, after tax" value={income} onChange={setIncome} suffix="€" max={50_000} />
      </div>
      <Table
        rows={[
          ["Rent and bills", `${eur.format(b.rentAndBills)} / mo`],
          ["Groceries", `${eur.format(b.groceries)} / mo`],
        ]}
        total={["Needs", `${eur.format(need)} / mo`]}
      />
      <div className="mt-4 rounded-2xl bg-slab px-4 py-3.5 text-white">
        <p className="text-[13px] text-white/70">Yours to choose</p>
        <p className="num font-display text-[34px] leading-tight font-semibold tracking-[-0.02em]">{eur.format(Math.max(0, left))}</p>
        <p className="mt-1 text-[13px] leading-snug text-white/70">
          {left > 0 ? `a month, about ${eur.format((left * 12) / 52)} a week.` : "Your needs take all of this income."}
        </p>
      </div>
      <Note>
        Saving, eating out, hobbies and everything else come out of this. Solvo&apos;s safe-to-spend also keeps irregular bills and
        your savings out of it.
      </Note>
    </div>
  );
}

function FirstTry({ ctx }: { ctx: LearnContext }) {
  const b = ctx.buffer;
  const [monthly, setMonthly] = useState(b.savingsGoal);
  const share = b.income > 0 ? (monthly / b.income) * 100 : 0;
  return (
    <div>
      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">Starts from what Solvo&apos;s plan saves for you now. Change it.</p>
      <div className="mt-3 flex">
        <NumberField label="Moved to savings on payday" value={monthly} onChange={setMonthly} suffix="€" max={10_000} />
      </div>
      <Bars
        rows={[
          { label: "After 1 year", value: monthly * 12, tone: "grey" },
          { label: "After 3 years", value: monthly * 36, tone: "grey" },
          { label: "After 5 years", value: monthly * 60, tone: "green", strong: true },
        ]}
      />
      <Note>
        That&apos;s about <span className="num font-semibold">{nf(share, 0)} %</span> of your income, before any interest. Solvo&apos;s
        plan can move it to a savings account on payday, so you spend what&apos;s left.
      </Note>
    </div>
  );
}

function EndsTry({ ctx }: { ctx: LearnContext }) {
  const e = ctx.electricity;
  const c = e.current;
  const [kwh, setKwh] = useState(e.kwh);
  const [rise, setRise] = useState(30);
  if (c) {
    const extra = rolloverExtra({ ...e, kwh });
    return (
      <div>
        <p className="mt-1 text-[14px] leading-snug text-muted-foreground">From your electricity e-invoice.</p>
        <Table
          rows={[
            ["Contract ends", fmtDay(c.endDate)],
            ["Compare from", fmtDay(compareFrom(c.endDate))],
            ["Price now", `${nf(c.cents, 2)} c/kWh`],
            ["Price after, if you do nothing", `${nf(c.afterCents, 2)} c/kWh`],
          ]}
        />
        <div className="mt-4 flex">
          <NumberField label="Your yearly use" value={kwh} onChange={(n) => setKwh(Math.max(1, n))} suffix="kWh" max={40000} />
        </div>
        <Bars
          rows={[
            { label: "A year at today's price", value: elecYear(kwh, c.cents, c.fee), tone: "green" },
            { label: "A year if you do nothing", value: elecYear(kwh, c.afterCents, c.afterFee), tone: "warn", strong: true },
          ]}
        />
        <Note>
          Doing nothing costs about <span className="num font-semibold">{eur.format(Math.max(0, extra))}</span> a year. Solvo reminds
          you before the end date and shows offers you can switch to.
        </Note>
      </div>
    );
  }
  const yearly = elecYear(kwh, e.fixed.cents, e.fixed.fee);
  return (
    <div>
      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">Starts from a small flat. Change it to your own use.</p>
      <div className="mt-3 flex">
        <NumberField label="Your yearly use" value={kwh} onChange={(n) => setKwh(Math.max(1, n))} suffix="kWh" max={40000} />
      </div>
      <Slider label="Price rise after the end date" value={rise} min={0} max={60} step={5} onChange={setRise} display={`${rise} %`} />
      <Bars
        rows={[
          { label: "A year on the offer", value: yearly, tone: "green" },
          { label: "A year if you do nothing", value: yearly * (1 + rise / 100), tone: "warn", strong: true },
        ]}
      />
      <Note>
        Doing nothing costs about <span className="num font-semibold">{eur.format((yearly * rise) / 100)}</span> a year. Note your end
        date where you&apos;ll see it.
      </Note>
    </div>
  );
}

const TYPICAL_SUBS = [
  { name: "Streaming", monthly: 13.99 },
  { name: "Music", monthly: 11.99 },
  { name: "Gym", monthly: 39.9 },
];

function SubsTry({ ctx }: { ctx: LearnContext }) {
  const subs = ctx.subs.length ? ctx.subs : TYPICAL_SUBS;
  const [cut, setCut] = useState<Record<string, boolean>>({});
  const saved = subs.filter((s) => cut[s.name]).reduce((n, s) => n + s.monthly, 0);
  const total = subs.reduce((n, s) => n + s.monthly, 0);
  return (
    <div>
      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">
        {ctx.subs.length ? "Tap the ones you'd cancel." : "Start from three common ones. Tap the ones you'd cancel."}
      </p>
      <div className="mt-3 overflow-hidden rounded-2xl bg-muted/60 text-[14px]">
        {subs.map((s, i) => (
          <button
            key={s.name}
            type="button"
            aria-pressed={!!cut[s.name]}
            onClick={() => setCut((c) => ({ ...c, [s.name]: !c[s.name] }))}
            className={cn("flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-muted", i > 0 && "border-t border-background")}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                cut[s.name] ? "border-warn bg-warn text-white" : "border-input",
              )}
              aria-hidden
            >
              {cut[s.name] && <X className="size-3.5" strokeWidth={3} />}
            </span>
            <span className={cn("flex-1", cut[s.name] && "text-muted-foreground line-through")}>{s.name}</span>
            <span className="num">{eur2.format(s.monthly)} / mo</span>
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-slab px-4 py-3.5 text-white">
        <p className="text-[13px] text-white/70">{saved > 0 ? "Cancelling these saves" : "These cost you"}</p>
        <p className="num font-display text-[34px] leading-tight font-semibold tracking-[-0.02em]">{eur.format((saved > 0 ? saved : total) * 12)}</p>
        <p className="mt-1 text-[13px] leading-snug text-white/70">a year, {eur2.format(saved > 0 ? saved : total)} a month.</p>
      </div>
      <Note>Nothing is cancelled here. Ask Solvo in the chat when you want to cancel one.</Note>
    </div>
  );
}
