import { SAVED_READINGS } from "@/data/einvoices/saved-readings";
import { AINO_PLAN, portfolio } from "@/data/portfolio";
import { UNPAID } from "@/data/reminders";
import { SUBSCRIPTIONS, subscriptionsMonthly } from "@/data/subscriptions";
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
import { MAX_ACTIONS, actionKey, type ChatAction, type ChatState, type ChatView } from "@/lib/chat-actions";

// Coach chat. Gemini answers, but every spending number comes from the `spending` tool,
// which runs exact queries over the customer's real S-Pankki transactions.
// It can also propose actions (cancel a subscription, change the saving plan, switch a contract, open a view) with the
// `propose_action` tool; they come back as cards with a button, and nothing happens until the person taps it.
// POST { messages: [{ role: "user" | "coach", text }], state? } -> { answer, checks, actions, source, ms, error? }

export const maxDuration = 30;

// The free tier allows ~20 requests a day per model, so fall back to a lighter model on quota or overload errors.
const MODELS = [process.env.GEMINI_MODEL ?? "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3-flash-preview", "gemini-3.1-flash-lite"];
const DEADLINE_MS = 24_000;
const MAX_TOOL_ROUNDS = 4;

type ChatMessage = { role: "user" | "coach"; text: string };
type ActionArgs = { action?: string; subscription?: string; monthly?: number; view?: string };
type Part = { text?: string; functionCall?: { name: string; args?: SpendingQuery & ActionArgs; id?: string }; thoughtSignature?: string };
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

Fund holdings (S-Pankki funds, demo values): ${pf.holdings.map((h) => `${fundById(h.fundId).name}, put in ${eur(h.invested)} since ${h.since}, worth ${eur(h.value)} (${h.yearChangePct.toFixed(1)} % in 12 months)`).join("; ")}. Total worth ${eur(pf.value)} on ${eur(pf.invested)} put in (${pf.gainPct.toFixed(1)} %), ${pf.yearChangePct.toFixed(1)} % in the last 12 months. She has a monthly saving plan (demo): ${AINO_PLAN.funds!.map((f) => `${eur(f.monthly)} into ${fundById(f.fundId).name}`).join(" and ")} on the ${AINO_PLAN.dayOfMonth}nd; she can edit it in the Save tab, or approve a new monthly total on a card (propose_action change_saving_plan). Never recommend a specific fund or predict returns: Solvo doesn't give investment advice.`;
}

const system = (c: DemoCustomer, mode: DemoMode, banksNote: string, state: ChatState) => `You are Solvo, a friendly money coach inside the S-Pankki bank app. You talk to one customer about their own money.

Rules:
- Answer in the language the user writes in (Finnish or English).
- Keep it short: at most 3 short sentences, about 60 words. Plain text, no markdown, no lists, no headings. Do not end with filler like "let me know if...".
- Every euro amount about past spending must come from the spending tool or the context below. Never estimate or invent numbers. Round to whole euros, written like €84.
- For questions about a type of spending (taxis, restaurants, groceries, a month, a period), call the spending tool. Pick merchantType for specific things like taxis, fuel, bars or cinema, and category for broad groups. Without a period, use the last 12 months (the default).
- The bank data shows categories and merchant types, not shop names. If asked about a specific shop, say so and give the closest merchant type.
- Be warm and practical, never judgemental. Give one concrete next step when it helps, such as a realistic weekly limit or opening the Bills view to switch electricity.
- You never move money or switch contracts yourself. Switches happen only when the user approves them in the app.
- No investment, loan or tax advice. Say a human advisor at S-Pankki can help.
- When the user wants something the app can do, or your advice points to one (cancel a subscription, change the saving plan total, switch electricity or phone and internet, open a view), call propose_action so a card with a button appears under your answer. At most ${MAX_ACTIONS} per answer, the most useful first. Then say in one short sentence that they can approve it below. Never say it is already done.
- Only propose what fits the data below. Don't offer something the user has already done (see "In the app right now").

${customerContext(c, mode)}${banksNote}${stateNote(state)}`;

function stateNote(st: ChatState) {
  const parts = [
    st.cancelled.length ? `cancelled subscriptions: ${st.cancelled.join(", ")}` : "",
    st.planMonthly != null ? `saving plan ${eur(st.planMonthly)}/month` : "",
    st.switched.length ? `approved switches: ${st.switched.join(", ")}` : "",
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
              enum: ["cancel_subscription", "change_saving_plan", "switch_electricity", "switch_phone_internet", "open_view"],
            },
            subscription: { type: "STRING", enum: SUBSCRIPTIONS.map((x) => x.id), description: "For cancel_subscription." },
            monthly: { type: "NUMBER", description: "For change_saving_plan: the new monthly total in EUR." },
            view: { type: "STRING", enum: ["home", "bills", "save", "calendar", "costs", "compare"], description: "For open_view." },
          },
          required: ["action"],
        },
      },
    ],
  },
];

// banksNote: what the other connected banks add (empty when there are none).
type Ctx = { c: DemoCustomer; mode: DemoMode; banksNote: string; state: ChatState };

const VIEWS: ChatView[] = ["home", "bills", "save", "calendar", "costs", "compare"];

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
    case "open_view":
      return VIEWS.includes(a.view as ChatView) ? { kind: "open", view: a.view as ChatView } : "Unknown view.";
    default:
      return "Unknown action.";
  }
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

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const reply = await gemini(ctx, model, contents, key, signal);
    const calls = reply.parts.filter((p) => p.functionCall);
    if (!calls.length || round === MAX_TOOL_ROUNDS) {
      const answer = reply.parts
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      if (!answer && !actions.length) throw new Error("Gemini returned no answer");
      return { answer: answer || "You can approve it below.", checks, actions };
    }
    // Send the model turn back unchanged (it carries Gemini's thought signatures), then the tool results.
    contents.push(reply as Content);
    contents.push({
      role: "user",
      parts: calls.map(({ functionCall }) => {
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

function offlineAnswer(ctx: Ctx, question: string) {
  const c = ctx.c;
  const fi = /[äö]|paljon|kuinka|mihin/i.test(question);
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
      ? `Viimeisen 12 kuukauden aikana käytit ${eur(r.total)} (${what}), ${r.count} ostoa eli noin ${eur(r.averagePerMonth)} kuukaudessa.`
      : `In the last 12 months you spent ${eur(r.total)} on ${what.toLowerCase()}, ${r.count} purchases, about ${eur(r.averagePerMonth)} a month.`,
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
    switched: Array.isArray(s.switched) ? s.switched.filter((b) => b === "electricity" || b === "telecom") : [],
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
  const { customer: c, base, banks, view, platform, bankName, mode } = await getDemoEffective(await requestMode());
  const banksNote = banks.length && view === "all" ? banksNoteFor(base, banks, platform, bankName) : "";
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
