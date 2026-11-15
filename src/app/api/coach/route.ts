import { SAVED_READINGS } from "@/data/einvoices/saved-readings";
import { AINO_PLAN, portfolio } from "@/data/portfolio";
import { UNPAID } from "@/data/reminders";
import { FIRST_TO_CUT, SUBSCRIPTIONS, subscriptionsMonthly } from "@/data/subscriptions";
import { fundById } from "@/lib/funds";
import { safeToSpend } from "@/lib/coach";
import { banksNoteFor } from "@/lib/combine";
import { BASKET_LABELS, type Basket, type DemoCustomer } from "@/lib/demo";
import { todayIso, toDemo, toShown } from "@/lib/demo-clock";
import type { DemoMode } from "@/lib/demo-mode";
import { requestMode } from "@/lib/source";
import { getDemoEffective } from "@/lib/source-banks";
import { compare } from "@/lib/offers";
import { MERCHANT_TYPE_NAMES, spending, type SpendingQuery, type SpendingResult } from "@/lib/spending";
import { inferProfile } from "@/lib/profile";
import { whatIf, type WhatIfInput, type WhatIfResult } from "@/lib/what-if";
import { findSavings, type SavingsCandidate, type SavingsPlanResult } from "@/lib/find-savings";
import { compareAgainst, ownGroups } from "@/lib/cohorts";
import { peerCompare, type PeerCompare } from "@/lib/peer-compare";
import { trimsFrom, type Trim } from "@/lib/plan-view";
import { spenderProfile, type SpenderProfile } from "@/lib/spender";
import { compareTelecom, telecomTermsFrom } from "@/lib/telecom-offers";
import { MAX_ACTIONS, actionKey, splitSuggestions, type ChatAction, type ChatState, type ChatView } from "@/lib/chat-actions";

// Coach chat. Gemini answers, but every spending number comes from the `spending` tool,
// which runs exact queries over the customer's real S-Pankki transactions.
// It can also propose actions (cancel a subscription, change the saving plan, switch a contract, open a view) with the
// `propose_action` tool; they come back as cards with a button, and nothing happens until the person taps it.
// "Can I / what if / how long until" questions go to the `what_if` tool (src/lib/what-if.ts), so the coach quotes
// computed numbers instead of guessing; each result is shown as a card under the answer.
// "Help me save €100 more a month" goes to `find_savings` (src/lib/find-savings.ts): concrete changes from her own numbers
// that add up to the target, shown as a plan card with a button per change.
// "How do I compare" and "where could I save" go to `compare_with_peers` (spending lines against people of the same age, city or
// income, src/lib/peer-compare.ts), shown as bar cards; "what kind of spender am I" goes to `spending_style` (src/lib/spender.ts).
// POST { messages: [{ role: "user" | "coach", text }], state? } -> { answer, checks, actions, whatIfs, savings, compares, styles, source, ms, error? }

export const maxDuration = 30;

// The free tier allows ~20 requests a day per model, so fall back to a lighter model on quota or overload errors.
const MODELS = [process.env.GEMINI_MODEL ?? "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3-flash-preview", "gemini-3.1-flash-lite"];
const DEADLINE_MS = 24_000;
const MAX_TOOL_ROUNDS = 4;

type ChatMessage = { role: "user" | "coach"; text: string };
type ActionArgs = {
  action?: string;
  subscription?: string;
  monthly?: number;
  view?: string;
  lesson?: string;
  goalLabel?: string; // add_savings_goal
  target?: number;
  months?: number;
  deadline?: string; // real date, YYYY-MM-DD
  alreadySaved?: number;
};
type WhatIfArgs = {
  question?: string;
  target?: number;
  deadline?: string;
  months?: number;
  alreadySaved?: number;
  category?: string;
  merchantType?: string;
  percentChange?: number;
  newMonthly?: number;
  monthly?: number;
};
type Part = {
  text?: string;
  functionCall?: { name: string; args?: SpendingQuery & ActionArgs & WhatIfArgs; id?: string };
  thoughtSignature?: string;
};
type Content = { role: "user" | "model"; parts: Record<string, unknown>[] };

// The demo clock (src/lib/demo-clock.ts) shows real dates. The data and the spending tool work in the demo's own dates, so the
// model is told real dates, its dates are mapped back for the tool, and the tool's dates are mapped forward for the model.
const realDaysLeft = () => 7 - ((new Date(`${todayIso()}T00:00:00Z`).getUTCDay() + 6) % 7);

function spendingForModel(q: SpendingQuery, c: DemoCustomer) {
  const raw = spending(c, { ...q, from: q.from ? toDemo(q.from) : undefined, to: q.to ? toDemo(q.to) : undefined });
  const shown = {
    ...raw,
    from: toShown(raw.from),
    to: toShown(raw.to),
    // A demo month stands for the real month that holds its middle after the shift, so "last full month" reads as real.
    groups: raw.groups.map((g) => (q.groupBy === "month" ? { ...g, key: toShown(`${g.key}-15`).slice(0, 7) } : g)),
    largest: raw.largest.map((l) => ({ ...l, date: toShown(l.date) })),
  };
  return { raw, shown };
}

const eur = (n: number) => `€${Math.round(n).toLocaleString("en-US")}`;

// Aino's demo story adds synthetic e-invoices, the dentist bill and fund holdings. The new customer has only bank data.
function electricityComparison() {
  const el = SAVED_READINGS.electricity;
  return compare({
    annualKwh: el.annualConsumptionKwh ?? 6500,
    centsPerKwh: el.priceCentsPerKwh ?? 0,
    monthlyFee: el.monthlyFee ?? 0,
    centsAfterEnd: el.priceAfterEndCentsPerKwh,
    monthlyFeeAfterEnd: el.monthlyFeeAfterEnd,
  });
}

function customerContext(c: DemoCustomer, mode: DemoMode) {
  const s = safeToSpend(c);
  const pf = portfolio();
  const cmp = electricityComparison();
  const byCategory = Object.entries(c.summary.categoryYear)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, y]) => `- ${cat} (basket ${c.basketOf[cat]}): ${eur(y / 12)}/month, ${eur(y)}/year`)
    .join("\n");
  const baskets = ([1, 2, 3] as Basket[])
    .map((b) => `- Basket ${b} "${BASKET_LABELS[b].title}": ${eur(c.summary.basketYear[b] / 12)}/month`)
    .join("\n");
  const bills = Object.values(SAVED_READINGS)
    .map((r) => `- ${r.supplier}, ${r.product}: ${eur(r.monthlyCost)}/month. ${r.summary}`)
    .join("\n");

  const common = `Customer: age ${c.age}, postal code ${c.postalCode} (Espoo). Today is ${toShown(c.asOf)}. Data covers ${toShown(c.transactions[0].date)} to ${toShown(c.asOf)}.

Safe to spend this week (Monday to Sunday): ${eur(s.remaining)} left of a ${eur(s.weeklyBudget)} weekly everyday budget, ${eur(s.spentThisWeek)} spent so far, ${realDaysLeft()} days left. Built from: salary ${eur(s.incomePerMonth)}/month, minus fixed and regular bills ${eur(s.fixedRegularPerMonth)}, minus set-aside for irregular costs ${eur(s.irregularSetAsidePerMonth)}, minus savings goal ${eur(s.savingsGoalPerMonth)} (an assumption the user can change). They usually spend ${eur(s.usualWeeklyEveryday)} a week on everyday things.

Three baskets, last 12 months:
${baskets}

By category, last 12 months:
${byCategory}`;
  if (mode !== "aino") {
    return `${common}

No e-invoices from suppliers have reached the bank yet, so Solvo hasn't read any contracts. Utility payments in the data carry no supplier name. No fund holdings. The Save tab can set up a monthly plan. Never recommend a specific fund or predict returns: Solvo doesn't give investment advice.`;
  }
  return `${common}

Bills Solvo has read from the e-invoices in the bank:
${bills}
Electricity: doing nothing costs ${eur(cmp.doNothing)}/year after the rollover. Best fixed offer is ${cmp.recommended.supplier} ${cmp.recommended.product} at ${eur(cmp.recommended.yearly)}/year, saving ${eur(cmp.recommended.saving)}/year (about ${eur(cmp.recommended.saving / 52)} a week more to spend). The user can switch with one tap in the Bills view after approving.

Card subscriptions (demo data): ${SUBSCRIPTIONS.map((x) => `${x.name} ${x.monthly.toFixed(2)} €/month on the ${x.day}.`).join(" ")} Together ${eur(subscriptionsMonthly(SUBSCRIPTIONS))}/month. Solvo can stop one when the user approves it on a card (propose_action), which stops the repeating card payment; the money it frees goes to safe-to-spend.

Unpaid bill: ${UNPAID.supplier}, ${eur(UNPAID.amount)} (${UNPAID.what}), was due ${toShown(UNPAID.dueDate)} and is still open. It belongs to basket 2 (irregular costs), so paying it comes from the irregular set-aside and doesn't lower this week's safe-to-spend. Paying before the reminder avoids a reminder fee. If the user can't pay now, suggest calling the clinic to ask for a later due date or an instalment plan, and that an S-Pankki advisor can help. Solvo is a coach, not a debt collector.

Fund holdings (S-Pankki funds, demo values): ${pf.holdings.map((h) => `${fundById(h.fundId).name}, put in ${eur(h.invested)} since ${h.since}, worth ${eur(h.value)} (${h.yearChangePct.toFixed(1)} % in 12 months)`).join("; ")}. Total worth ${eur(pf.value)} on ${eur(pf.invested)} put in (${pf.gainPct.toFixed(1)} %), ${pf.yearChangePct.toFixed(1)} % in the last 12 months. She has a monthly saving plan (demo): ${AINO_PLAN.funds!.map((f) => `${eur(f.monthly)} into ${fundById(f.fundId).name}`).join(" and ")} on the ${AINO_PLAN.dayOfMonth}nd (the savings account part pays for her savings goals, listed under "In the app right now"); she can edit it in the Save tab, or approve a new monthly total on a card (propose_action change_saving_plan). Never recommend a specific fund or predict returns: Solvo doesn't give investment advice.`;
}

const system = (c: DemoCustomer, mode: DemoMode, banksNote: string, state: ChatState) => `You are Solvo, a friendly money coach inside the S-Pankki bank app. You talk to one customer about their own money.

Rules:
- Answer in the language the user writes in (Finnish or English).
- Keep it short: at most 3 short sentences, about 60 words. Plain text, no markdown, no lists, no headings. Do not end with filler like "let me know if...".
- Every euro amount about past spending must come from the spending tool or the context below. Never estimate or invent numbers. Round to whole euros, written like €84.
- For questions about a type of spending (taxis, restaurants, groceries, a month, a period), call the spending tool. Pick merchantType for specific things like taxis, fuel, bars or cinema, and category for broad groups. Without a period, use the last 12 months (the default).
- The bank data shows categories and merchant types, not shop names. If asked about a specific shop, say so and give the closest merchant type.
- After your answer, add one last line in exactly this form: NEXT: question one | question two | question three. They are three short questions (under 8 words each) the user could ask next, written as the user would say them, based on what was just said and the whole chat so far, and never one they have already asked. Nothing else on that line.
- End every answer with one short follow-up: a question or an offer tied to what you just said, such as "Want to see how that compares with others?", "Want me to look at where else you could save?" or "Want to know more about how that works?". Never end on a bare statement. Skip it only when you are already asking the user something, or you have refused or can't help. One follow-up, one line, never a list.
- Be warm and practical, never judgemental. Give one concrete next step when it helps, such as a realistic weekly limit or opening the Bills view to switch electricity.
- You never move money or switch contracts yourself. Switches happen only when the user approves them in the app.
- For "can I afford €X tonight / today / this week" about something to buy right now (a dinner, a ticket), don't call what_if: compare it with "Safe to spend this week" below and show the sum (for example "€50 of the €338 left this week, so €288 stays"). If it is more than what is left, say by how much and what would fit.
- For any "can I", "what if", "how long until" or "can I afford" question about the future, call the what_if tool and quote its numbers, showing the sum (for example "€3,000 over 7 months is €429 a month; you can safely save €160"). Never compute these yourself. A card with the result appears under your answer, so keep the text to the conclusion and one next step. After every save_target what_if, also call propose_action add_savings_goal with a short goalLabel (like "Trip to Japan"), the target and the deadline, so the user can add it to their goals with one tap; if it doesn't fit, use months set to the months at the current pace instead. Adding a goal moves its monthly amount to the savings account in the saving plan.
- For "help me save €X more a month", or "find me €X", call find_savings with the monthly target (100 if none is given) and nothing else. A plan card with each change, its euros and a button appears under your answer, and it ends with a button to move the money to savings. Reply in one or two short sentences: the total found, and the first change to make. Don't list the lines again.
- Tinder Platinum is Aino's most expensive subscription and a want, not a need. When she asks where she could save or cut (or how to save more) and it is not in her cancelled subscriptions, open with it: one short sentence that cancelling Tinder Platinum frees about €35 a month, and call propose_action cancel_subscription for it as the FIRST card. Then go on as below.
- For "how do I compare", "am I spending a lot", "do I spend more than others" or "how do I compare with people in Helsinki", call compare_with_peers (focus all; by area, income or all if they name a city, an income band or everyone, otherwise their age band). For "where could I save", "where could I cut" or "where do I spend more than others", call compare_with_peers with focus above. A card appears under your answer, so reply in two short sentences, never listing every line: the first says where they spend relatively a lot (the category, their euros a month against typical); when the result has a suggestion, the second says what trimming it could free a month and asks if they want to add that to their saving plan (a button is under your answer; never say it is done). With no suggestion, say they are in line with others. These are S-Pankki customers in the synthetic dataset, never say "Finns" or "people in general".
- For "what kind of spender am I" call spending_style and say the type in one sentence; a card with the chart appears.
- Concept questions (index fund, fund fee, spot or fixed electricity price, buffer, compound interest, interest rate, and the like): explain in 3 to 4 plain sentences, explaining any jargon, using the user's own numbers where there are any (fund fees from her saving plan, her electricity price, how many months of bills her buffer covers). If a Money skills lesson matches (electricity, fees, buffer), propose_action open_lesson for it. For this answer you may go to about 90 words.
- No investment, loan or tax advice: never say which product to buy or whether to buy one. Explain first; mention that an S-Pankki advisor can help in at most one short last sentence. Never only redirect.
- Never write "definitely", "easily", "guaranteed" or "you should buy". When numbers are involved, show the sum.
- When the user wants something the app can do, or your advice points to one (cancel a subscription, change the saving plan total, add a savings goal, switch electricity or phone and internet, open a view), call propose_action so a card with a button appears under your answer. At most ${MAX_ACTIONS} per answer, the most useful first. Then say in one short sentence that they can approve it below. Never say it is already done.
- Only propose what fits the data below. Don't offer something the user has already done (see "In the app right now").

${customerContext(c, mode)}${banksNote}${stateNote(state)}`;

function stateNote(st: ChatState) {
  const parts = [
    st.cancelled.length ? `cancelled subscriptions: ${st.cancelled.join(", ")}` : "",
    st.planMonthly != null ? `saving plan ${eur(st.planMonthly)}/month` : "",
    st.switched.length ? `approved switches: ${st.switched.join(", ")}` : "",
    st.goals.length
      ? `savings goals in the savings account: ${st.goals.map((g) => `${g.label} ${eur(g.saved)} of ${eur(g.target)}, ${eur(g.monthly)}/month`).join(", ")}`
      : "",
  ].filter(Boolean);
  return parts.length ? `\n\nIn the app right now: ${parts.join("; ")}.` : "";
}

const tools = (c: DemoCustomer) => [
  {
    functionDeclarations: [
      {
        name: "spending",
        description:
          "Exact spending totals from the customer's real bank transactions. Returns total EUR spent, number of purchases, averages, optional breakdown and the largest purchases.",
        parameters: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING", enum: Object.keys(c.basketOf).sort(), description: "Broad spending category." },
            merchantType: { type: "STRING", enum: MERCHANT_TYPE_NAMES, description: "Specific kind of merchant, e.g. Taxis." },
            from: { type: "STRING", description: "Start date YYYY-MM-DD, inclusive. Default: 12 months ago." },
            to: { type: "STRING", description: "End date YYYY-MM-DD, inclusive. Default: today." },
            groupBy: { type: "STRING", enum: ["month", "category", "merchantType", "none"], description: "Optional breakdown." },
          },
        },
      },
      {
        name: "propose_action",
        description:
          "Shows the user a card with a button for something the app can do. Nothing happens until the user taps it. Call once per action.",
        parameters: {
          type: "OBJECT",
          properties: {
            action: {
              type: "STRING",
              enum: ["cancel_subscription", "change_saving_plan", "add_savings_goal", "switch_electricity", "switch_phone_internet", "open_view", "open_lesson"],
            },
            goalLabel: { type: "STRING", description: "For add_savings_goal: what the goal is for, 1 to 4 words." },
            target: { type: "NUMBER", description: "For add_savings_goal: the sum in EUR." },
            deadline: { type: "STRING", description: "For add_savings_goal: YYYY-MM-DD, or give months instead." },
            months: { type: "NUMBER", description: "For add_savings_goal: months from today, instead of a deadline." },
            alreadySaved: { type: "NUMBER", description: "For add_savings_goal: EUR already saved for it, if the user said." },
            lesson: { type: "STRING", enum: ["electricity", "fees", "buffer"], description: "For open_lesson: the Money skills lesson." },
            subscription: { type: "STRING", enum: SUBSCRIPTIONS.map((x) => x.id), description: "For cancel_subscription." },
            monthly: { type: "NUMBER", description: "For change_saving_plan: the new monthly total in EUR." },
            view: { type: "STRING", enum: ["home", "bills", "save", "calendar", "costs"], description: "For open_view." },
          },
          required: ["action"],
        },
      },
      {
        name: "find_savings",
        description:
          "Builds a concrete plan to save a monthly amount from the customer's own numbers: cheaper bills, trimming everyday spending, subscriptions. Returns the lines with euros a month.",
        parameters: {
          type: "OBJECT",
          properties: { monthlyTarget: { type: "NUMBER", description: "EUR a month to find. 100 if the user gave none." } },
          required: ["monthlyTarget"],
        },
      },
      {
        name: "compare_with_peers",
        description:
          "Compares the customer's monthly spending (everyday, restaurants, groceries, transport, utilities, rent) with S-Pankki customers like them, using the last 12 months. focus above: only the lines where they spend clearly more than typical, biggest gap first. A card with a graph per line appears.",
        parameters: {
          type: "OBJECT",
          properties: {
            by: { type: "STRING", enum: ["age", "area", "income", "all"], description: "Which group: their age band (default), their city, their income band, or everyone." },
            focus: { type: "STRING", enum: ["all", "above"], description: "above for 'where could I save' and 'where do I spend more than others'; all for a plain comparison." },
          },
        },
      },
      {
        name: "spending_style",
        description: "What kind of spender the customer is (weekend, evening or balanced), from their payments in the last 12 months. A card with the weekday chart appears.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "what_if",
        description:
          "Simulates the customer's future money with exact maths from their last 12 months. save_target: can they save a sum by a date. change_spending: what changes if a kind of spending goes down or up. how_long: how long until they have a sum. Returns safe-to-save per month and the numbers to quote.",
        parameters: {
          type: "OBJECT",
          properties: {
            question: { type: "STRING", enum: ["save_target", "change_spending", "how_long"] },
            target: { type: "NUMBER", description: "save_target, how_long: the sum in EUR." },
            deadline: { type: "STRING", description: "save_target: YYYY-MM-DD. 'By June' means the end of the next June after today." },
            months: { type: "NUMBER", description: "save_target: months from today, instead of a deadline." },
            alreadySaved: { type: "NUMBER", description: "Optional: EUR already put aside for it. Omit if not said." },
            category: { type: "STRING", enum: Object.keys(c.basketOf).sort(), description: "change_spending: broad category." },
            merchantType: { type: "STRING", enum: MERCHANT_TYPE_NAMES, description: "change_spending: specific kind, e.g. Taxis." },
            percentChange: { type: "NUMBER", description: "change_spending: e.g. -50 for half, -100 to stop." },
            newMonthly: { type: "NUMBER", description: "change_spending: a new monthly amount in EUR instead of a percent." },
            monthly: { type: "NUMBER", description: "how_long: EUR a month the user would save. Omit to use safe-to-save." },
          },
          required: ["question"],
        },
      },
    ],
  },
];

// banksNote: what the other connected banks add (empty when there are none).
type Ctx = { c: DemoCustomer; mode: DemoMode; banksNote: string; state: ChatState };

const VIEWS: ChatView[] = ["home", "bills", "save", "calendar", "costs"];

/** Checks a proposed action against the demo data and what the person has already done. A string explains a refusal to the model. */
function toAction(ctx: Ctx, a: ActionArgs): ChatAction | string {
  const aino = ctx.mode === "aino";
  switch (a.action) {
    case "cancel_subscription": {
      const sub = aino ? SUBSCRIPTIONS.find((x) => x.id === a.subscription) : undefined;
      if (!sub) return "No such subscription.";
      if (ctx.state.cancelled.includes(sub.id)) return `${sub.name} is already cancelled.`;
      return { kind: "cancel_subscription", id: sub.id, name: sub.name, monthly: sub.monthly };
    }
    case "change_saving_plan": {
      const monthly = Math.round(Number(a.monthly));
      if (!aino || ctx.state.planMonthly == null) return { kind: "open", view: "save" }; // no plan yet: set one up in Save
      if (!Number.isFinite(monthly) || monthly < 10 || monthly > 2000) return "The monthly total must be between €10 and €2,000.";
      if (monthly === ctx.state.planMonthly) return "The plan is already that amount.";
      return { kind: "change_plan", monthly };
    }
    case "add_savings_goal": {
      const target = Math.round(Number(a.target));
      if (!Number.isFinite(target) || target < 10 || target > 1_000_000) return "The target must be between €10 and €1,000,000.";
      const months = a.deadline ? monthsUntil(a.deadline) : Math.round(Number(a.months));
      if (!Number.isFinite(months) || months < 1 || months > 600) return "Give a deadline after today (YYYY-MM-DD) or 1 to 600 months.";
      const label = (a.goalLabel ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "Savings goal";
      if (ctx.state.goals.some((g) => g.label.toLowerCase() === label.toLowerCase())) return `There is already a goal called ${label}.`;
      const saved = Math.max(0, Math.min(target, Math.round(Number(a.alreadySaved) || 0)));
      return { kind: "add_goal", label, target, saved, months, monthly: Math.round((target - saved) / months) }; // rounded like what_if, so the two cards agree
    }
    case "switch_electricity": {
      if (!aino) return "No electricity contract has been read yet.";
      if (ctx.state.switched.includes("electricity")) return "The electricity switch is already approved.";
      const r = electricityComparison().recommended;
      return { kind: "switch_bill", bill: "electricity", supplier: r.supplier, yearlySaving: Math.round(r.saving) };
    }
    case "switch_phone_internet":
      if (!aino) return "No phone and internet contract has been read yet.";
      if (ctx.state.switched.includes("telecom")) return "The phone and internet switch is already approved.";
      return { kind: "switch_bill", bill: "telecom" };
    case "open_lesson":
      return a.lesson === "electricity" || a.lesson === "fees" || a.lesson === "buffer" ? { kind: "learn", pack: a.lesson } : "Unknown lesson.";
    case "open_view":
      return VIEWS.includes(a.view as ChatView) ? { kind: "open", view: a.view as ChatView } : "Unknown view.";
    default:
      return "Unknown action.";
  }
}

/** Whole months from the real today to a real YYYY-MM-DD date, at least 1; NaN for a bad or past date. */
function monthsUntil(deadline: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline);
  const today = todayIso();
  if (!m || deadline <= today) return NaN;
  const [y, mo, d] = today.split("-").map(Number);
  const n = (Number(m[1]) - y) * 12 + (Number(m[2]) - mo) - (Number(m[3]) < d ? 1 : 0);
  return Math.max(1, n);
}

// Everyday spending a plan may trim, in the person's words. Groceries and transport are left alone: they are needs.
const TRIMS: { id: string; q: SpendingQuery; label: string }[] = [
  { id: "restaurants", q: { category: "Restaurants" }, label: "Eating out" },
  { id: "entertainment", q: { category: "Entertainment" }, label: "Entertainment" },
  { id: "lifestyle", q: { category: "Lifestyle" }, label: "Shopping and lifestyle" },
  { id: "taxis", q: { merchantType: "Taxis" }, label: "Taxis" },
];

/** The changes this customer could make: bill switches (Aino's e-invoices), trims from the last 12 months, subscriptions. */
function savingsCandidates(ctx: Ctx): SavingsCandidate[] {
  const out: SavingsCandidate[] = [];
  if (ctx.mode === "aino") {
    if (!ctx.state.switched.includes("electricity")) {
      const r = electricityComparison().recommended;
      if (r.saving > 12) out.push({ kind: "switch", id: "electricity", label: "Switch electricity", supplier: r.supplier, monthly: r.saving / 12, yearly: Math.round(r.saving) });
    }
    if (!ctx.state.switched.includes("telecom")) {
      const r = compareTelecom(telecomTermsFrom(SAVED_READINGS.telecom as Parameters<typeof telecomTermsFrom>[0])).recommended;
      if (r.saving > 12) out.push({ kind: "switch", id: "telecom", label: "Switch phone and internet", supplier: r.operator, monthly: r.saving / 12, yearly: Math.round(r.saving) });
    }
    for (const x of SUBSCRIPTIONS) if (!ctx.state.cancelled.includes(x.id)) out.push({ kind: "cancel", id: x.id, label: `Cancel ${x.name}`, monthly: x.monthly });
  }
  for (const t of TRIMS) {
    if (t.q.category && ctx.c.basketOf[t.q.category] !== 3) continue;
    const r = spending(ctx.c, t.q);
    if (r.averagePerMonth >= 20) out.push({ kind: "trim", id: t.id, label: t.label, currentMonthly: r.averagePerMonth });
  }
  return out;
}

/** The peer comparison for a compare_with_peers call: the person's own age band by default, and null when no group fits. */
function runCompare(ctx: Ctx, by: unknown, focus: unknown): PeerCompare | null {
  const own = ownGroups(ctx.c);
  const key = by === "all" ? "all" : (by === "area" || by === "income" ? own[by] : undefined) ?? own.age ?? "all";
  const group = compareAgainst(ctx.c, key);
  return group ? peerCompare(group, focus === "above" ? "above" : "all") : null;
}

/**
 * What a comparison leads to: the category where the person spends most above typical, what trimming it could free (halfway to
 * typical, at most 15% of what they spend, the same rule as the Save tab's steps) and a card that raises their saving plan by
 * that. The numbers are computed here, so the model only repeats them. No card when there is no plan to raise or no clear gap.
 */
function peerSuggestion(ctx: Ctx, r: PeerCompare): { trim: Trim | null; action: ChatAction | null; newPlan: number | null } | null {
  const trims = trimsFrom(r);
  const trim = trims.find((t) => !ctx.state.trimmed.includes(t.id)); // a cut already put into the plan is not suggested again
  if (!trim) return trims.length ? { trim: null, action: null, newPlan: null } : null; // null trim: the biggest gaps are already in the plan
  const now = ctx.state.planMonthly;
  const a = now == null ? null : toAction(ctx, { action: "change_saving_plan", monthly: now + trim.saving });
  return {
    trim,
    action: a && typeof a !== "string" && a.kind === "change_plan" ? { ...a, trim: { id: trim.id, saving: trim.saving } } : null,
    newPlan: now == null ? null : now + trim.saving,
  };
}

function runFindSavings(ctx: Ctx, target: unknown): SavingsPlanResult | { error: string } {
  return findSavings(Math.round(Number(target) || 100), savingsCandidates(ctx));
}

/** Runs a what_if call: the base is the same as Home's and onboarding's, spending comes from the `spending` tool, dates go through the demo clock. */
function runWhatIf(ctx: Ctx, a: WhatIfArgs): WhatIfResult {
  const c = ctx.c;
  const s = safeToSpend(c);
  const profile = inferProfile(c);
  const base = {
    incomeMonthly: Math.round(c.summary.salaryYear / 12),
    fixedRegularMonthly: Math.round(c.summary.basketYear[1] / 12),
    irregularMonthly: Math.round(c.summary.basketYear[2] / 12),
    everydayMonthly: Math.round(c.summary.basketYear[3] / 12),
    cashBalance: profile.cashBalance === null ? null : Math.round(profile.cashBalance),
    investsMonthlyToday: Math.round(profile.investsMonthly),
    status: profile.status,
    planMonthly: ctx.state.planMonthly,
    weeklyBudget: s.weeklyBudget,
    today: c.asOf,
  };
  let input: WhatIfInput;
  if (a.question === "save_target") {
    input = { kind: "save_target", target: Number(a.target), deadline: a.deadline ? toDemo(a.deadline) : undefined, months: a.months, alreadySaved: a.alreadySaved };
  } else if (a.question === "how_long") {
    input = { kind: "how_long", target: Number(a.target), monthly: a.monthly, alreadySaved: a.alreadySaved };
  } else if (a.question === "change_spending") {
    const q: SpendingQuery = a.merchantType ? { merchantType: a.merchantType } : a.category ? { category: a.category } : {};
    if (!q.merchantType && !q.category) return { kind: "error", error: "Name a category or merchant type." };
    const r = spending(c, q);
    const basket = q.category ? (c.basketOf[q.category] ?? 3) : 3;
    input = { kind: "change_spending", label: a.merchantType ?? a.category!, basket, currentMonthly: r.averagePerMonth, percent: a.percentChange, newMonthly: a.newMonthly };
  } else return { kind: "error", error: "Unknown question type." };
  // A bad date from the model would throw in the clock mapping; whatIf() itself refuses bad input.
  return whatIf(base, input);
}

/** Real dates for the model and the screen, like everywhere else in the chat. */
function whatIfShown(r: WhatIfResult) {
  if (r.kind === "save_target") return { ...r, deadline: toShown(r.deadline), dateIfCurrentPace: r.dateIfCurrentPace && toShown(r.dateIfCurrentPace) };
  if (r.kind === "how_long") return { ...r, date: r.date && toShown(r.date) };
  return r;
}

function addAction(list: ChatAction[], a: ChatAction) {
  if (list.length < MAX_ACTIONS && !list.some((x) => actionKey(x) === actionKey(a))) list.push(a);
}

async function gemini(ctx: Ctx, model: string, contents: Content[], key: string, signal: AbortSignal) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system(ctx.c, ctx.mode, ctx.banksNote, ctx.state) }] },
      contents,
      tools: tools(ctx.c),
      generationConfig: { temperature: 0.3, thinkingConfig: { thinkingLevel: "low" } },
    }),
    signal,
  });
  if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status });
  const data = await res.json();
  const content = data?.candidates?.[0]?.content as { role: "model"; parts?: Part[] } | undefined;
  if (!content?.parts?.length) throw new Error("Gemini returned no content");
  return content as { role: "model"; parts: Part[] };
}

async function askGemini(ctx: Ctx, messages: ChatMessage[], key: string) {
  const signal = AbortSignal.timeout(DEADLINE_MS);
  let lastError: unknown;
  for (const model of MODELS) {
    try {
      return { ...(await converse(ctx, model, messages, key, signal)), model };
    } catch (e) {
      lastError = e;
      const status = (e as { status?: number }).status;
      if (status !== 429 && status !== 503) throw e;
    }
  }
  throw lastError;
}

async function converse(ctx: Ctx, model: string, messages: ChatMessage[], key: string, signal: AbortSignal) {
  const contents: Content[] = messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));
  const checks: SpendingResult[] = [];
  const actions: ChatAction[] = [];
  const whatIfs: WhatIfResult[] = [];
  const savings: SavingsPlanResult[] = [];
  const compares: PeerCompare[] = [];
  const styles: SpenderProfile[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const reply = await gemini(ctx, model, contents, key, signal);
    const calls = reply.parts.filter((p) => p.functionCall);
    if (!calls.length || round === MAX_TOOL_ROUNDS) {
      const { answer, suggestions } = splitSuggestions(
        reply.parts
          .map((p) => p.text ?? "")
          .join("")
          .trim(),
      );
      if (!answer && !actions.length) throw new Error("Gemini returned no answer");
      return { answer: answer || "You can approve it below.", checks, actions, whatIfs, savings, compares, styles, suggestions };
    }
    // Send the model turn back unchanged (it carries Gemini's thought signatures), then the tool results.
    contents.push(reply as Content);
    contents.push({
      role: "user",
      parts: calls.map(({ functionCall }) => {
        if (functionCall!.name === "find_savings") {
          const r = runFindSavings(ctx, (functionCall!.args as { monthlyTarget?: number })?.monthlyTarget);
          if (!("error" in r) && !savings.length) {
            savings.push(r);
            const plan = planAction(ctx, r);
            if (plan) addAction(actions, plan);
          }
          return { functionResponse: { name: functionCall!.name, id: functionCall!.id, response: { result: r } } };
        }
        if (functionCall!.name === "compare_with_peers") {
          const a = (functionCall!.args ?? {}) as { by?: string; focus?: string };
          const r = runCompare(ctx, a.by, a.focus);
          if (r && !compares.length) compares.push(r);
          const sg = r ? peerSuggestion(ctx, r) : null;
          if (sg?.action && compares.length === 1) addAction(actions, sg.action);
          const result = r
            ? {
                group: r.label,
                customersInGroup: r.n,
                focus: r.focus,
                lines: r.metrics.map((m) => ({ category: m.label, youPerMonth: m.you, typicalPerMonth: m.median, youSpendMoreThanPercentOfGroup: m.pct })),
                suggestion: sg?.trim
                  ? { category: sg.trim.label, youPerMonth: sg.trim.you, typicalPerMonth: sg.trim.typical, couldSavePerMonth: sg.trim.saving, newSavingPlanTotal: sg.newPlan }
                  : null,
                note: sg?.trim
                  ? `The card is under your answer.${sg.action ? " A button to raise the saving plan by that amount is under it too." : ""}`
                  : sg
                    ? "They have already put their biggest gaps into the saving plan. Say so, warmly, and offer another next step."
                    : "Nothing is clearly above typical, so there is nothing to suggest.",
              }
            : { error: "No comparison group for this customer." };
          return { functionResponse: { name: functionCall!.name, id: functionCall!.id, response: { result } } };
        }
        if (functionCall!.name === "spending_style") {
          const p = spenderProfile(ctx.c);
          if (p && !styles.length) styles.push(p);
          const result = p ? { type: p.type, summary: p.summary, facts: p.facts, note: "A card with the weekday chart is under your answer." } : { error: "Too little data to name a type." };
          return { functionResponse: { name: functionCall!.name, id: functionCall!.id, response: { result } } };
        }
        if (functionCall!.name === "what_if") {
          let r: WhatIfResult;
          try {
            r = runWhatIf(ctx, functionCall!.args ?? {});
          } catch {
            r = { kind: "error", error: "Could not read that date. Use YYYY-MM-DD." };
          }
          const shown = whatIfShown(r);
          if (shown.kind !== "error" && whatIfs.length < 2) whatIfs.push(shown); // real dates; the card formats them with plainFormat
          return { functionResponse: { name: functionCall!.name, id: functionCall!.id, response: { result: shown } } };
        }
        if (functionCall!.name === "propose_action") {
          const a = toAction(ctx, functionCall!.args ?? {});
          if (typeof a !== "string") addAction(actions, a);
          const result = typeof a === "string" ? { shown: false, reason: a } : { shown: true, note: "A card with a button is under your answer." };
          return { functionResponse: { name: functionCall!.name, id: functionCall!.id, response: { result } } };
        }
        const { raw, shown } = spendingForModel(functionCall!.args ?? {}, ctx.c);
        checks.push(raw); // the screen formats these through the demo clock, so they stay in demo dates
        return { functionResponse: { name: functionCall!.name, id: functionCall!.id, response: { result: shown } } };
      }),
    });
  }
  throw new Error("unreachable");
}

// Offline fallback: answers simple "how much did I spend on X" questions without the model,
// so the demo still works if Gemini is down.
const KEYWORDS: [RegExp, SpendingQuery][] = [
  [/taxi|taksi|uber|bolt/i, { merchantType: "Taxis" }],
  [/restaurant|ravintol|syöm|eating out/i, { category: "Restaurants" }],
  [/grocer|ruoka|kauppa|supermarket/i, { category: "Groceries" }],
  [/bar|baari|drink|juom/i, { merchantType: "Bars and nightlife" }],
  [/fuel|bensa|polttoaine|petrol/i, { category: "Transportation" }],
  [/fast food|cafe|kahvi|pikaruoka/i, { merchantType: "Fast food and cafes" }],
  [/cinema|elokuv|leffa/i, { merchantType: "Cinema" }],
  [/entertain|viihde/i, { category: "Entertainment" }],
  [/travel|matka|hotel/i, { category: "Travel" }],
];

// Offline actions: "cancel Netflix", "saving plan to 150", "switch electricity" still get their card without the model.
function offlineActions(ctx: Ctx, q: string): ChatAction[] {
  const out: ChatAction[] = [];
  const add = (args: ActionArgs) => {
    const a = toAction(ctx, args);
    if (typeof a !== "string") addAction(out, a);
  };
  if (/cancel|stop|peru|lopet|irtisano|subscri|tilau/i.test(q)) {
    const named = SUBSCRIPTIONS.filter((x) => new RegExp(x.name.replace("+", "\\+?"), "i").test(q));
    for (const x of named.length ? named : SUBSCRIPTIONS) add({ action: "cancel_subscription", subscription: x.id });
  }
  const amount = q.match(/(\d{2,4})\s*(€|e\b|eur)?/i);
  if (/saving plan|säästö|plan to|suunnitelm/i.test(q) && amount) add({ action: "change_saving_plan", monthly: Number(amount[1]) });
  if (/electric|sähkö/i.test(q) && /switch|cheaper|overpay|vaihd|halvem|liikaa/i.test(q)) add({ action: "switch_electricity" });
  return out;
}

// Offline what-if: the three question types from keywords, so the cards still work without the model.
const MONTHS: [RegExp, number][] = [
  [/january|tammi/i, 1], [/february|helmi/i, 2], [/march|maalis/i, 3], [/april|huhti/i, 4], [/\bmay\b|touko/i, 5], [/june|kesäkuu/i, 6],
  [/july|heinä/i, 7], [/august|elo/i, 8], [/september|syys/i, 9], [/october|loka/i, 10], [/november|marras/i, 11], [/december|joulu/i, 12],
];
const amountIn = (q: string) => {
  const m = q.replace(/(\d)[\s,](?=\d{3}\b)/g, "$1").match(/(\d{2,7})(?:\s*(k)\b)?/i);
  return m ? Number(m[1]) * (m[2] ? 1000 : 1) : null;
};

function offlineWhatIf(ctx: Ctx, q: string): WhatIfArgs | null {
  const amount = amountIn(q);
  if (/how long|kuinka kauan|milloin minulla/i.test(q) && amount) return { question: "how_long", target: amount };
  if (/what if|entä jos|mitä jos/i.test(q)) {
    const hit = KEYWORDS.find(([re]) => re.test(q));
    if (!hit) return null;
    const pct = /half|puolit|puoleen/i.test(q) ? -50 : /stop|quit|lopet|ilman/i.test(q) ? -100 : q.match(/(\d{1,3})\s*%/) ? -Number(q.match(/(\d{1,3})\s*%/)![1]) : null;
    return pct === null ? null : { question: "change_spending", ...hit[1], percentChange: pct };
  }
  if (/\bsave\b|säästä|afford|realistic|realisti/i.test(q) && amount) {
    const month = MONTHS.find(([re]) => re.test(q));
    if (/summer|kesä/i.test(q) && !month) return { question: "save_target", target: amount, deadline: monthEnd(6) };
    return month ? { question: "save_target", target: amount, deadline: monthEnd(month[1]) } : { question: "save_target", target: amount, months: 12 };
  }
  return null;
}

/** The last day of the next such month after today, in real dates (the model's convention). */
function monthEnd(month: number) {
  const [y, m] = todayIso().split("-").map(Number);
  const year = month > m ? y : y + 1;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function whatIfSentence(r: WhatIfResult, fi: boolean) {
  const e = eur;
  switch (r.kind) {
    case "save_target":
      return r.fits
        ? fi
          ? `${e(r.toGo)} / ${r.months} kk = ${e(r.neededMonthly)} kuussa. Pystyt säästämään turvallisesti ${e(r.safeToSaveMonthly)} kuussa, joten se onnistuu.`
          : `${e(r.toGo)} over ${r.months} months is ${e(r.neededMonthly)} a month. You can safely save ${e(r.safeToSaveMonthly)} a month, so it fits.`
        : fi
          ? `${e(r.toGo)} / ${r.months} kk = ${e(r.neededMonthly)} kuussa, mutta turvallisesti pystyt ${e(r.safeToSaveMonthly)} kuussa. Ero kuroutuu, jos arkikulut pienenevät ${e(r.cutWeekly)} viikossa.`
          : `${e(r.toGo)} over ${r.months} months is ${e(r.neededMonthly)} a month, but you can safely save ${e(r.safeToSaveMonthly)}. Spending ${e(r.cutWeekly)} less a week on everyday things closes the gap.`;
    case "change_spending":
      return fi
        ? `Nyt ${e(r.currentMonthly)} kuussa, jatkossa ${e(r.newMonthly)}: vapautuu ${e(r.freedMonthly)} kuussa eli ${e(r.freedYearly)} vuodessa.`
        : `You spend ${e(r.currentMonthly)} a month now; at ${e(r.newMonthly)} you free ${e(r.freedMonthly)} a month, ${e(r.freedYearly)} a year.`;
    case "how_long":
      return r.months === null
        ? fi
          ? "Tällä hetkellä turvalliseen säästämiseen ei jää rahaa, joten aloita pienentämällä arkikuluja."
          : "Right now nothing is left to save safely, so the first step is trimming everyday spending."
        : fi
          ? `${e(r.toGo)} / ${e(r.monthly)} kuussa = ${r.months} kuukautta.`
          : `${e(r.toGo)} at ${e(r.monthly)} a month takes ${r.months} months.`;
    default:
      return "";
  }
}

// Offline concept answers: plain words, then the matching Money skills lesson.
const OFFLINE_CONCEPTS: [RegExp, string, "electricity" | "fees" | "buffer"][] = [
  [
    /index fund|indeksirahast|what is a fund|mikä on rahasto/i,
    "An index fund buys every company in a stock index, such as the 500 biggest in the US, so its value follows that whole market instead of a manager's picks. Because nobody picks stocks, the yearly fee is usually low, and fees come off your money every year. Its value goes up and down with the market, so it suits money you won't need for years. Whether to buy one is your call; an S-Pankki advisor can go through it with you.",
    "fees",
  ],
  [
    /spot price|pörssisähk|fixed or spot|kiinteä vai pörssi/i,
    "A spot price contract follows the electricity exchange hour by hour, so it is cheap when there is plenty of wind and dear on cold, still days. A fixed price stays the same for the whole contract, so your bill is easier to plan. Over a year spot is often cheaper, but you carry the risk of price spikes.",
    "electricity",
  ],
  [
    /emergency fund|buffer|puskuri|hätärahast/i,
    "A buffer is money kept aside for surprises, like a broken phone or a dentist bill, so they don't go on a credit card. A common rule is about one month of must-pay costs to start, and three months later on. Keep it in a savings account you can reach quickly, not in funds that go up and down.",
    "buffer",
  ],
];

/** A goal's name from the question, for the offline "Add goal" card. */
function offlineGoalLabel(q: string) {
  if (/japan|japani/i.test(q)) return "Trip to Japan";
  if (/trip|travel|holiday|matka|loma/i.test(q)) return "Trip";
  if (/buffer|emergency|puskuri|hätä/i.test(q)) return "Emergency buffer";
  if (/home|flat|apartment|asunto|koti|cabin|mökki/i.test(q)) return "Home";
  if (/car\b|auto/i.test(q)) return "Car";
  return "Savings goal";
}

/** The plan card ends with moving what was found into savings: the saving plan goes up by that much. */
function planAction(ctx: Ctx, r: SavingsPlanResult): ChatAction | null {
  if (ctx.state.planMonthly == null || r.found < 5) return null;
  const a = toAction(ctx, { action: "change_saving_plan", monthly: ctx.state.planMonthly + r.found });
  return typeof a === "string" || a.kind !== "change_plan" ? null : a;
}

const SAVE_MORE = /help me save|save .{0,12}more|find (me )?€?\s?\d|säästä.{0,20}enemmän|säästää .{0,15}lisää/i;
const WHERE_SAVE = /where (could|can|should) i (save|cut)|where do i spend (too much|more)|cut my costs|mistä (voisin|voin) (säästää|leikata)|mihin menee liikaa/i;
const COMPARE = /how (do|am) i compar|compare (me|my|myself)\b|compared (to|with) (others|other people|peers)|more than others|vertaa(n|a)? (minua|itseäni)|muihin verrattuna/i;
const STYLE = /(kind|type) of spender|spending style|millainen kuluttaja/i;

function savingsSentence(r: SavingsPlanResult, fi: boolean) {
  const first = r.lines[0].kind === "trim" ? { label: `Trim ${r.lines[0].label.toLowerCase()}` } : r.lines[0];
  const e = eur;
  if (fi) return r.reached ? `Löysin ${e(r.found)} kuussa. Aloita: ${first.label.toLowerCase()}.` : `Löysin ${e(r.found)} kuussa ${e(r.target)}:n tavoitteesta.`;
  return r.reached ? `I found ${e(r.found)} a month. Start with: ${first.label.toLowerCase()}.` : `I found ${e(r.found)} of your ${e(r.target)} a month.`;
}

/** "Can I afford a €50 dinner tonight?": a purchase now is compared with what is left of this week's budget, as Home shows it. */
function offlineAfford(ctx: Ctx, question: string, fi: boolean): string | null {
  const amount = amountIn(question);
  if (!amount || !/afford|varaa|riittääkö/i.test(question) || !/tonight|today|this week|right now|dinner|lunch|tänään|tänä iltana|tällä viikolla/i.test(question)) return null;
  const s = safeToSpend(ctx.c);
  const left = Math.round(s.remaining);
  if (left >= amount) {
    return fi
      ? `Kyllä. Tältä viikolta on jäljellä ${eur(left)} ${eur(s.weeklyBudget)} budjetista, ja ${eur(amount)} jättää ${eur(left - amount)}.`
      : `Yes. You have ${eur(left)} left of this week's ${eur(s.weeklyBudget)} budget, and ${eur(amount)} leaves ${eur(left - amount)}.`;
  }
  const short = amount - Math.max(0, left);
  return fi
    ? `Tältä viikolta on jäljellä ${eur(Math.max(0, left))}, joten ${eur(amount)} ylittäisi budjetin ${eur(short)}:lla.`
    : `You have ${eur(Math.max(0, left))} left this week, so ${eur(amount)} would go ${eur(short)} over the budget.`;
}

/** The closing question every answer gets, so the chat always leads on (the live model gets the same rule in its prompt). */
const FOLLOW = (fi: boolean) => ({
  compare: fi ? "Haluatko nähdä, miten vertaudut muihin?" : "Want to see how you compare with others?",
  save: fi ? "Haluatko nähdä, mistä voisit säästää lisää?" : "Want to see where else you could save?",
});

function offlineAnswer(ctx: Ctx, question: string) {
  const c = ctx.c;
  const fi = /[äö]|paljon|kuinka|mihin/i.test(question);
  if (STYLE.test(question)) {
    const p = spenderProfile(c);
    if (p) return { answer: `${fi ? `Olet ${p.type.toLowerCase()}. ${p.summary}` : `${p.type}. ${p.summary}`} ${FOLLOW(fi).compare}`, checks: [], actions: [], whatIfs: [], styles: [p] };
  }
  if (WHERE_SAVE.test(question) || COMPARE.test(question)) {
    const above = WHERE_SAVE.test(question);
    const by = /everyone|everybody|all customers/i.test(question) ? "all" : /income|salary|tulo/i.test(question) ? "income" : /city|helsinki|espoo|vantaa|kaupung/i.test(question) ? "area" : undefined;
    const r = runCompare(ctx, by, above ? "above" : "all");
    if (r) {
      const sg = peerSuggestion(ctx, r);
      const t = sg?.trim;
      const answer = sg && !t
        ? fi ? "Olet jo lisännyt suurimmat erot säästösuunnitelmaasi. Hyvä! Haluatko katsoa, miten vertaudut muihin ryhmiin?" : "You've already put your biggest gaps into your saving plan. Nice. Want to compare yourself with another group?"
        : t
        ? fi
          ? `Käytät suhteellisen paljon kategoriaan ${t.label.toLowerCase()}: ${eur(t.you)} kuussa, tavallisesti ${eur(t.typical)}. Jos karsisit noin ${eur(t.saving)} kuussa, sen voisi lisätä säästösuunnitelmaasi${sg.action ? ". Lisätäänkö?" : "."}`
          : `You seem to spend relatively a lot on ${t.label.toLowerCase()}: ${eur(t.you)} a month, typical ${eur(t.typical)}. Cutting about ${eur(t.saving)} a month could go into your saving plan${sg.action ? ". Want to add it?" : "."}`
        : fi ? "Kulutuksesi on linjassa muiden kanssa, eikä mikään nouse selvästi esiin." : "You're in line with others, and nothing stands out as something to trim.";
      // Aino's Tinder Platinum comes first when she asks where to save (the biggest subscription, and a want).
      const first = above ? toAction(ctx, { action: "cancel_subscription", subscription: FIRST_TO_CUT }) : null;
      if (first && typeof first !== "string") {
        const lead = fi ? "Aloita Tinder Platinumista: sen peruminen vapauttaa noin 35 € kuussa." : "Start with Tinder Platinum: cancelling it frees about €35 a month.";
        return { answer: `${lead} ${answer}`, checks: [], actions: [first, ...(sg?.action ? [sg.action] : [])], whatIfs: [], compares: [r] };
      }
      return { answer, checks: [], actions: sg?.action ? [sg.action] : [], whatIfs: [], compares: [r] };
    }
  }
  if (SAVE_MORE.test(question)) {
    const r = runFindSavings(ctx, amountIn(question) ?? 100);
    if (!("error" in r) && r.lines.length) {
      const plan = planAction(ctx, r);
      return { answer: `${savingsSentence(r, fi)} ${FOLLOW(fi).compare}`, checks: [], actions: plan ? [plan] : [], whatIfs: [], savings: [r] };
    }
  }
  const buy = offlineAfford(ctx, question, fi);
  if (buy) return { answer: `${buy} ${FOLLOW(fi).save}`, checks: [], actions: [], whatIfs: [] };
  const wi = offlineWhatIf(ctx, question);
  if (wi) {
    let r: WhatIfResult;
    try {
      r = runWhatIf(ctx, wi);
    } catch {
      r = { kind: "error", error: "bad date" };
    }
    if (r.kind !== "error") {
      const actions: ChatAction[] = [];
      if (r.kind === "save_target") {
        const months = r.fits ? r.months : r.monthsIfCurrentPace;
        const a = months ? toAction(ctx, { action: "add_savings_goal", goalLabel: offlineGoalLabel(question), target: r.target, months, alreadySaved: wi.alreadySaved }) : "";
        if (typeof a !== "string") actions.push(a);
      }
      return { answer: `${whatIfSentence(r, fi)} ${FOLLOW(fi).save}`, checks: [], actions, whatIfs: [whatIfShown(r)] };
    }
  }
  const concept = OFFLINE_CONCEPTS.find(([re]) => re.test(question));
  if (concept) return { answer: `${concept[1]} ${fi ? "Haluatko kokeilla lyhyttä oppituntia alta?" : "Want to try the short lesson on it below?"}`, checks: [], actions: [{ kind: "learn" as const, pack: concept[2] }], whatIfs: [] };
  const actions = offlineActions(ctx, question);
  if (actions.length) {
    return {
      answer: fi ? "Voit hyväksyä sen alta." : "Here you go. Nothing happens until you approve it below.",
      checks: [],
      actions,
    };
  }
  const hit = KEYWORDS.find(([re]) => re.test(question));
  if (!hit) {
    return {
      answer: fi
        ? "En saa juuri nyt yhteyttä tekoälyyn. Kysy esimerkiksi, paljonko käytit takseihin tai ravintoloihin."
        : "I can't reach the AI right now. Try asking how much you spent on taxis or restaurants.",
      checks: [],
      actions: [],
    };
  }
  const r = spending(c, hit[1]);
  const what = hit[1].merchantType ?? hit[1].category!;
  return {
    answer: fi
      ? `Viimeisen 12 kuukauden aikana käytit ${eur(r.total)} (${what}), ${r.count} ostoa eli noin ${eur(r.averagePerMonth)} kuukaudessa. ${FOLLOW(fi).compare}`
      : `In the last 12 months you spent ${eur(r.total)} on ${what.toLowerCase()}, ${r.count} purchases, about ${eur(r.averagePerMonth)} a month. ${FOLLOW(fi).compare}`,
    checks: [r],
    actions: [],
  };
}

function readState(raw: unknown): ChatState {
  const s = (raw ?? {}) as Partial<ChatState>;
  const ids = SUBSCRIPTIONS.map((x) => x.id);
  return {
    cancelled: Array.isArray(s.cancelled) ? s.cancelled.filter((id) => ids.includes(id)) : [],
    planMonthly: typeof s.planMonthly === "number" && Number.isFinite(s.planMonthly) ? Math.round(s.planMonthly) : null,
    trimmed: Array.isArray(s.trimmed) ? s.trimmed.filter((id): id is string => typeof id === "string").slice(0, 8) : [],
    switched: Array.isArray(s.switched) ? s.switched.filter((b) => b === "electricity" || b === "telecom") : [],
    goals: Array.isArray(s.goals)
      ? s.goals
          .filter((g) => g && typeof g.label === "string" && [g.target, g.saved, g.monthly].every((n) => typeof n === "number" && Number.isFinite(n)))
          .slice(0, 8)
          .map((g) => ({ label: g.label.replace(/\s+/g, " ").slice(0, 40), target: Math.round(g.target), saved: Math.round(g.saved), monthly: Math.round(g.monthly) }))
      : [],
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { messages?: ChatMessage[]; state?: unknown };
  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "coach") && typeof m.text === "string" && m.text.trim())
    .slice(-10)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 1000) }));
  const last = messages.at(-1);
  if (!last || last.role !== "user") return Response.json({ error: "No question" }, { status: 400 });

  // The customer as chosen in the app, always from the synthetic demo data (never real bank data), with a note on connected banks.
  const { customer: c, base, banks, view, bankName, mode } = await getDemoEffective(await requestMode());
  const banksNote = banks.length && view === "all" ? banksNoteFor(base, banks, bankName) : "";
  const ctx: Ctx = { c, mode, banksNote, state: readState(body.state) };
  const started = Date.now();
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    try {
      const out = await askGemini(ctx, messages, key);
      return Response.json({ ...out, source: "gemini", ms: Date.now() - started });
    } catch (e) {
      return Response.json({ ...offlineAnswer(ctx, last.text), source: "offline", ms: Date.now() - started, error: String(e) });
    }
  }
  return Response.json({ ...offlineAnswer(ctx, last.text), source: "offline", ms: 0, error: "GEMINI_API_KEY not set" });
}
