// Money skills: short learning packs in the coach chat. Every lesson of Home's three courses (src/lib/learn-game.ts) is one
// of these packs, so each opens in the chat the same way. Each pack is three cards, one quiz question and a
// "try it with your own numbers" step. The numbers come from the person's own data (LearnContext, built on the
// server in learn-context.ts), so the lesson is about their electricity contract, their funds, their bills.
// Pure and client-safe: no data loading here, only the texts and the maths.
// Solvo explains how things work. It never tells the person which product to pick.

export type PackId = "fund" | "risk" | "fees" | "spread" | "needs" | "buffer" | "first" | "electricity" | "ends" | "subs";

export type LearnContext = {
  mode: "aino" | "new";
  electricity: {
    kwh: number; // yearly use
    hasInvoice: boolean; // Solvo has read this person's electricity e-invoice
    current: {
      supplier: string;
      cents: number;
      fee: number;
      afterCents: number;
      afterFee: number;
      endDate: string; // YYYY-MM-DD
    } | null;
    fixed: { cents: number; fee: number; termMonths: number | null }; // cheapest fixed price Solvo found
    spot: { margin: number; fee: number }; // cheapest spot margin Solvo found
    spotAvg: number; // expected yearly average spot price, c/kWh incl. VAT
  };
  funds: {
    hasFunds: boolean;
    value: number; // what the person has in funds today
    monthly: number; // a starting monthly amount for the try-it step
    holdings: { name: string; feePct: number }[];
  };
  buffer: {
    rentAndBills: number; // basket 1, per month
    groceries: number; // per month
    balance: number; // on the account today
    savingsGoal: number; // per month, what Solvo keeps out of the weekly budget
    income: number; // per month, after tax
  };
  subs: { name: string; monthly: number }[]; // card subscriptions and memberships Solvo has found
};

export type Card = { title: string; body: string; you?: string };
export type Quiz = { question: string; options: string[]; correct: number; explain: string };
export type Pack = {
  id: PackId;
  title: string;
  short: string; // for chips and rows
  minutes: number;
  intro: string;
  cards: Card[];
  quiz: Quiz;
  tryTitle: string;
  followUps: string[]; // questions the person can send to the coach after the pack
};

/** Titles for lists (Home's courses, the chat's start screen), without the person's numbers. In course order. */
export const PACK_META: { id: PackId; title: string; minutes: number }[] = [
  { id: "fund", title: "What is a fund?", minutes: 2 },
  { id: "risk", title: "Risk and time", minutes: 2 },
  { id: "fees", title: "How fund fees add up", minutes: 3 },
  { id: "spread", title: "Not all eggs in one basket", minutes: 2 },
  { id: "needs", title: "Needs and wants", minutes: 2 },
  { id: "buffer", title: "Emergency fund: how much is enough?", minutes: 2 },
  { id: "first", title: "Pay yourself first", minutes: 2 },
  { id: "electricity", title: "Fixed or spot electricity?", minutes: 2 },
  { id: "ends", title: "Contract end dates", minutes: 2 },
  { id: "subs", title: "Subscriptions", minutes: 2 },
];
export const PACK_IDS: PackId[] = PACK_META.map((m) => m.id);
/** The three packs the chat's start screen offers. */
export const FEATURED_PACKS: PackId[] = ["electricity", "fees", "buffer"];
export const isPackId = (x: unknown): x is PackId => typeof x === "string" && (PACK_IDS as string[]).includes(x);
const meta = (id: PackId) => PACK_META.find((m) => m.id === id)!;

const nf = (n: number, d = 0) => n.toLocaleString("fi-FI", { minimumFractionDigits: d, maximumFractionDigits: d });
const euro = (n: number) => `${nf(Math.round(n))} €`;
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const fmtDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

// ---------- Electricity ----------

export const elecYear = (kwh: number, cents: number, fee: number) => (kwh * cents) / 100 + fee * 12;

/** Spot average (before margin) at which spot and the fixed offer cost the same for this person. */
export function breakEvenSpot(e: LearnContext["electricity"], kwh: number) {
  const fixed = elecYear(kwh, e.fixed.cents, e.fixed.fee);
  return ((fixed - e.spot.fee * 12) * 100) / Math.max(kwh, 1) - e.spot.margin;
}

/** What doing nothing at contract end costs per year, versus the price today. */
export function rolloverExtra(e: LearnContext["electricity"]) {
  if (!e.current) return 0;
  return elecYear(e.kwh, e.current.afterCents, e.current.afterFee) - elecYear(e.kwh, e.current.cents, e.current.fee);
}

// ---------- Fund fees ----------

export const ILLUSTRATIVE_RETURN_PCT = 6; // before fees, per year. An illustration, not a forecast.

/** Value after `years` with a start amount and a monthly deposit, monthly compounding, fee taken from the return. */
export function grow(start: number, monthly: number, years: number, feePct: number, returnPct = ILLUSTRATIVE_RETURN_PCT) {
  const r = (returnPct - feePct) / 100 / 12;
  let v = start;
  for (let m = 0; m < years * 12; m++) v = v * (1 + r) + monthly;
  return v;
}

/** End value and what the fee cost in euros, against the same fund with no fee. */
export function feeCost(start: number, monthly: number, years: number, feePct: number) {
  const value = grow(start, monthly, years, feePct);
  return { value, fees: grow(start, monthly, years, 0) - value, deposited: start + monthly * years * 12 };
}

export function feeLevels(f: LearnContext["funds"]) {
  const own = (pct: number) => f.holdings.find((h) => Math.abs(h.feePct - pct) < 0.02)?.name;
  const a = own(0.49);
  const b = own(1.05);
  return [
    { pct: 0.49, label: a ? `like your ${a}` : "index fund level" },
    { pct: 1.05, label: b ? `like your ${b}` : "a managed balanced fund" },
    { pct: 1.8, label: "typical active equity fund" },
  ];
}

// ---------- Buffer ----------

export const essentials = (b: LearnContext["buffer"]) => b.rentAndBills + b.groceries;

// ---------- The packs ----------

export function getPack(id: PackId, ctx: LearnContext): Pack {
  switch (id) {
    case "fund": return fundPack(ctx);
    case "risk": return riskPack(ctx);
    case "fees": return feesPack(ctx);
    case "spread": return spreadPack(ctx);
    case "needs": return needsPack(ctx);
    case "buffer": return bufferPack(ctx);
    case "first": return firstPack(ctx);
    case "electricity": return electricityPack(ctx);
    case "ends": return endsPack(ctx);
    case "subs": return subsPack(ctx);
  }
}

// ---------- Small helpers for the new packs ----------

/** What one company falling by `drop` (0..1) costs on `amount`, spread evenly over `companies`. */
export const oneCompanyLoss = (amount: number, companies: number, drop = 0.5) => (amount * drop) / Math.max(companies, 1);

/** A bad year for a broad equity fund, for the risk lesson: falls of 30 to 40 % have happened (2008, early 2020). */
export const BAD_YEAR_PCT = 35;

/** The day to start comparing: six weeks before a contract ends. */
export function compareFrom(endIso: string) {
  const d = new Date(`${endIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 42);
  return d.toISOString().slice(0, 10);
}
export const fmtDay = fmtDate;

const subsTotal = (s: LearnContext["subs"]) => s.reduce((n, x) => n + x.monthly, 0);

function electricityPack(ctx: LearnContext): Pack {
  const e = ctx.electricity;
  const c = e.current;
  const extra = rolloverExtra(e);
  return {
    ...meta("electricity"),
    short: "Fixed or spot?",
    intro: "Here's a two-minute pack on electricity prices. At the end you can try it with your own use.",
    cards: [
      {
        title: "Two ways to pay",
        body: "A fixed price stays the same for the whole contract, usually 12 to 36 months. A spot price follows the Nordic electricity market and changes every hour, and the seller adds a small margin on top.",
        you: c
          ? `You have a fixed price today: ${nf(c.cents, 2)} c/kWh with ${c.supplier}.`
          : undefined,
      },
      {
        title: "Who carries the risk",
        body: "With spot, you carry the price risk: cheap on windy summer days, expensive in cold, still winter weeks. With fixed, the seller carries it and prices that into the deal. Neither is always cheaper. Fixed is easier to budget, spot rewards flexible use.",
      },
      {
        title: "The rollover trap",
        body: "When a fixed contract ends and you do nothing, it usually continues automatically on a price the seller sets. That price is often higher than new customers get.",
        you:
          c && extra > 0
            ? `Yours ends on ${fmtDate(c.endDate)} and then moves to ${nf(c.afterCents, 2)} c/kWh. At ${nf(e.kwh)} kWh a year, that's about ${euro(extra)} more a year for doing nothing.`
            : undefined,
      },
    ],
    quiz: {
      question: "Your fixed contract ends and you don't do anything. What usually happens?",
      options: [
        "The electricity stops until you sign a new contract",
        "It continues on a new price the seller sets, often a higher one",
        "The old price stays the same for good",
      ],
      correct: 1,
      explain:
        c && extra > 0
          ? `Right: it rolls over. For you that's ${nf(c.cents, 2)} → ${nf(c.afterCents, 2)} c/kWh, about ${euro(extra)} a year. Solvo reminds you a month before an end date.`
          : "It rolls over to a price the seller sets. Your electricity never just stops, but the price can quietly go up. Note your end date somewhere you'll see it.",
    },
    tryTitle: "Try it with your own use",
    followUps: ["What happens if I do nothing with my electricity contract?", "How much do I spend on bills a month?"],
  };
}

function feesPack(ctx: LearnContext): Pack {
  const f = ctx.funds;
  return {
    ...meta("fees"),
    short: "Fund fees",
    intro: "Here's a three-minute pack on fund fees. At the end you can try it with your own amounts.",
    cards: [
      {
        title: "The fee you never see",
        body: "A fund's ongoing fee is a percentage of your money, taken every year whether the fund goes up or down. It comes out of the fund's value, so there's never a bill to notice.",
        you: f.hasFunds
          ? `Your two funds charge ${f.holdings.map((h) => `${nf(h.feePct, 2)} %`).join(" and ")} a year.`
          : undefined,
      },
      {
        title: "Small numbers, big totals",
        body: "The fee is taken from a balance that keeps growing, so it compounds just like returns do, only in the other direction. Half a percent sounds like nothing, but over 20 years it adds up to thousands.",
      },
      {
        title: "Index and active funds",
        body: "An index fund simply follows a list of companies, so it's usually cheap. An actively managed fund pays people to pick, and charges more for it. A higher fee isn't wrong, but the fund has to earn it back before you gain anything. Risk class and what the fund owns matter too.",
      },
    ],
    quiz: {
      question:
        "Two funds both earn 6 % a year before fees. One charges 0,5 %, the other 1,5 %. You put in €10,000 for 20 years. Roughly how much more does the cheaper one leave you?",
      options: ["About €200", "About €2,000", "About €5,000"],
      correct: 2,
      explain:
        "About €5,000 (€29,200 against €24,100). One percentage point a year, compounded for 20 years, is half of what you put in.",
    },
    tryTitle: "Try it with your own amounts",
    followUps: ["How are my funds doing?", "Where could I save the most?"],
  };
}

function bufferPack(ctx: LearnContext): Pack {
  const b = ctx.buffer;
  const need = essentials(b);
  return {
    ...meta("buffer"),
    short: "Safety buffer",
    intro: "Here's a two-minute pack on safety buffers. At the end you can work out yours from your own bills.",
    cards: [
      {
        title: "What it's for",
        body: "A buffer is money for things you can't plan: a broken laptop, a dentist bill, a gap between jobs. It's what keeps a bad month from turning into a loan or a late bill.",
      },
      {
        title: "A common rule of thumb",
        body: "Many advisers suggest about three months of essential costs: rent, bills and food. One month is a good first goal. If your income is irregular, aim higher.",
        you: `Your essentials come to about ${euro(need)} a month, so three months is about ${euro(need * 3)}.`,
      },
      {
        title: "Where to keep it",
        body: "Keep it apart from your spending money, so it doesn't quietly become this week's budget, but where you can reach it in a day. Not in shares or funds: their value can be down exactly when you need the money.",
        you: "Your safe-to-spend already keeps bills and irregular costs out of the weekly number. The buffer is the layer under that.",
      },
    ],
    quiz: {
      question: "Where is a good place to keep an emergency fund?",
      options: ["In an equity fund, so it grows", "On a separate savings account you can reach in a day", "As cash at home"],
      correct: 1,
      explain:
        "A separate savings account: safe, apart from your spending money and quick to reach. A fund can be down just when you need it, and cash at home earns nothing and can be lost.",
    },
    tryTitle: "Work out your own buffer",
    followUps: ["Can I afford an €80 dinner this week?", "Where could I save the most?"],
  };
}

function fundPack(ctx: LearnContext): Pack {
  const f = ctx.funds;
  return {
    ...meta("fund"),
    short: "What is a fund?",
    intro: "Here's a two-minute lesson on funds. At the end you can see what your own monthly amount would buy.",
    cards: [
      {
        title: "Many people, one pot",
        body: "A fund pools money from many people and spreads it over many companies or bonds. You own a slice of the whole pot, not one company.",
        you: f.hasFunds ? `You have about ${euro(f.value)} in ${f.holdings.length} funds today.` : undefined,
      },
      {
        title: "Index funds follow a list",
        body: "An index fund simply follows an index, like the biggest companies in the world. Nobody picks shares, so it is usually cheap. An active fund pays a manager to pick, and charges more.",
      },
      {
        title: "What it costs",
        body: "Every fund has an ongoing fee, shown as a percentage a year. It comes out of the fund's value, so you never get a bill for it.",
        you: f.hasFunds ? `Yours charge ${f.holdings.map((h) => `${nf(h.feePct, 2)} %`).join(" and ")} a year.` : undefined,
      },
    ],
    quiz: {
      question: "An index fund…",
      options: ["Tries to follow a market index, like the biggest companies in a region", "Always beats the market", "Is re-picked by a manager every month"],
      correct: 0,
      explain: "It follows an index instead of trying to beat it, which is why it is usually cheap.",
    },
    tryTitle: "What your money would buy",
    followUps: ["How are my funds doing?", "How much could I invest a month?"],
  };
}

function riskPack(ctx: LearnContext): Pack {
  const f = ctx.funds;
  return {
    ...meta("risk"),
    short: "Risk and time",
    intro: "Here's a two-minute lesson on risk and time. At the end you can see what a bad year would do to your own money.",
    cards: [
      {
        title: "Values move every day",
        body: "A fund's value goes up and down with the market. Over a single year a broad equity fund can rise 20 % or fall 30 % or more.",
        you: f.hasFunds ? `On your ${euro(f.value)}, a 30 % fall would be about ${euro(f.value * 0.3)} for a while.` : undefined,
      },
      {
        title: "Time helps, it doesn't promise",
        body: "Over 10 years or more, markets have usually recovered from dips. That's why money for the long term can sit in funds. Time never removes the risk.",
      },
      {
        title: "Soon money stays steady",
        body: "Money you need within a year or two, like a buffer or a trip, belongs on a savings account. If a fund is down just when you need it, you'd have to sell at a loss.",
      },
    ],
    quiz: {
      question: "Money you need within a year is usually better kept…",
      options: ["In a fund", "In a savings account you can reach", "In one single share"],
      correct: 1,
      explain: "If you need it soon, you can't wait out a dip, so keep it somewhere steady.",
    },
    tryTitle: "What a bad year would do",
    followUps: ["How are my funds doing?", "How much should I keep as a buffer?"],
  };
}

function spreadPack(ctx: LearnContext): Pack {
  const f = ctx.funds;
  return {
    ...meta("spread"),
    short: "Spreading risk",
    intro: "Here's a two-minute lesson on spreading your money. At the end you can see what one company failing would cost you.",
    cards: [
      {
        title: "One share, one bet",
        body: "If you own shares in one company, everything rides on that company. A bad year for it is a bad year for all your money.",
      },
      {
        title: "Spreading is diversifying",
        body: "Owning many companies in many regions and industries is called diversifying. When one does badly, it's a small part of the whole.",
        you: f.hasFunds ? `Your ${f.holdings.length} funds hold hundreds of companies between them.` : undefined,
      },
      {
        title: "It lowers risk, never to zero",
        body: "Diversifying protects you from one company failing. It doesn't protect you from the whole market falling, which is why time matters too.",
      },
    ],
    quiz: {
      question: "Diversifying…",
      options: ["Removes the chance of losing money", "Lowers the damage if one holding does badly", "Increases fees by law"],
      correct: 1,
      explain: "It reduces the damage from any single bad holding. It does not remove risk.",
    },
    tryTitle: "If one company falls by half",
    followUps: ["How are my funds doing?", "What is an index fund?"],
  };
}

function needsPack(ctx: LearnContext): Pack {
  const b = ctx.buffer;
  const need = essentials(b);
  const left = b.income - need;
  return {
    ...meta("needs"),
    short: "Needs and wants",
    intro: "Here's a two-minute lesson on needs and wants. At the end you can see what's really yours to choose each month.",
    cards: [
      {
        title: "Needs come first",
        body: "Rent, bills and food are needs: you pay them whatever happens. Everything else is a want, a choice you make each month.",
        you: `Your needs come to about ${euro(need)} a month.`,
      },
      {
        title: "What's left is yours",
        body: "Income minus needs is the money you can really choose how to use. Knowing that one number makes every other choice easier.",
        you: left > 0 ? `That leaves about ${euro(left)} a month for saving and everything else.` : undefined,
      },
      {
        title: "Small wants repeat",
        body: "Wants aren't bad. But small ones that repeat, like a coffee or a subscription, add up over a year more than one big purchase.",
      },
    ],
    quiz: {
      question: "A €10 subscription costs how much over a year?",
      options: ["€12", "€120", "€1,200"],
      correct: 1,
      explain: "€10 × 12 months is €120. Small payments that repeat add up.",
    },
    tryTitle: "Your month in two parts",
    followUps: ["How much can I spend this week?", "Where could I save the most?"],
  };
}

function firstPack(ctx: LearnContext): Pack {
  const b = ctx.buffer;
  return {
    ...meta("first"),
    short: "Pay yourself first",
    intro: "Here's a two-minute lesson on paying yourself first. At the end you can see what your own monthly amount grows into.",
    cards: [
      {
        title: "Save before you spend",
        body: "Paying yourself first means moving money to savings right after payday, before you spend anything. You then spend what is left.",
      },
      {
        title: "Make it automatic",
        body: "A transfer that repeats on payday happens even in a busy month. You don't have to remember, or decide again.",
        you: `Solvo's plan already keeps ${euro(b.savingsGoal)} a month out of your weekly budget.`,
      },
      {
        title: "Small and steady wins",
        body: "Start with an amount you can keep up every month, even a small one. You can raise it later. A big amount you drop after two months saves less.",
      },
    ],
    quiz: {
      question: "Paying yourself first means…",
      options: ["Moving money to savings right after payday, before spending", "Buying yourself a treat first", "Paying all bills late"],
      correct: 0,
      explain: "What you save is moved first, so spending is limited to what is left.",
    },
    tryTitle: "What your amount grows into",
    followUps: ["Help me save €100 more a month", "How much can I spend this week?"],
  };
}

function endsPack(ctx: LearnContext): Pack {
  const e = ctx.electricity;
  const c = e.current;
  const extra = rolloverExtra(e);
  return {
    ...meta("ends"),
    short: "End dates",
    intro: "Here's a two-minute lesson on contract end dates. At the end you can see what yours means in euros.",
    cards: [
      {
        title: "Offers end",
        body: "Many contracts, like electricity, phone and internet, start with a fixed-term offer. When the term ends, the price usually changes.",
        you: c ? `Your electricity contract with ${c.supplier} ends on ${fmtDate(c.endDate)}.` : undefined,
      },
      {
        title: "Doing nothing has a price",
        body: "If you do nothing, the contract often rolls over to a standard price that is higher than what new customers get.",
        you: c && extra > 0 ? `Yours moves from ${nf(c.cents, 2)} to ${nf(c.afterCents, 2)} c/kWh, about ${euro(extra)} more a year.` : undefined,
      },
      {
        title: "Compare a month or two before",
        body: "That's early enough to choose calmly, and close enough that offers are current. Switching supplier changes only the price and terms: the power arrives the same way.",
        you: c ? `For you that's from ${fmtDate(compareFrom(c.endDate))}. Solvo reminds you.` : undefined,
      },
    ],
    quiz: {
      question: "When a fixed-term contract ends, doing nothing can mean…",
      options: ["Moving to a higher standard price", "A free upgrade", "The contract cancels itself with no bill"],
      correct: 0,
      explain: c && extra > 0 ? `Right: for you, about ${euro(extra)} more a year.` : "Many contracts roll over to a standard price that is higher than the offer you had.",
    },
    tryTitle: "What doing nothing costs",
    followUps: ["What happens if I do nothing with my electricity contract?", "How much do I spend on bills a month?"],
  };
}

function subsPack(ctx: LearnContext): Pack {
  const s = ctx.subs;
  const total = subsTotal(s);
  return {
    ...meta("subs"),
    short: "Subscriptions",
    intro: "Here's a two-minute lesson on subscriptions. At the end you can go through your own.",
    cards: [
      {
        title: "Easy to start, easy to forget",
        body: "Subscriptions charge your card automatically every month. Nothing reminds you, so ones you no longer use keep running.",
        you: s.length ? `Solvo found ${s.length}: ${s.map((x) => x.name).join(", ")}.` : undefined,
      },
      {
        title: "Monthly hides yearly",
        body: "A small monthly price sounds harmless. Multiply it by 12 to see what it really costs you.",
        you: s.length ? `Yours come to ${euro(total)} a month, about ${euro(total * 12)} a year.` : undefined,
      },
      {
        title: "Review, don't ban",
        body: "Keep what you use and enjoy. Cancel or pause what you haven't used for a month or two. You can always start again.",
      },
    ],
    quiz: {
      question: "Cancelling a subscription saves…",
      options: ["Its price every month after", "Nothing", "Only the first month"],
      correct: 0,
      explain: "The saving repeats every month the subscription would have run.",
    },
    tryTitle: "Go through yours",
    followUps: ["What subscriptions do I have?", "Where could I save the most?"],
  };
}

/** Opens a pack from typed text, like "teach me about fund fees" or "opeta sähkösopimuksista". */
export function packFromText(text: string): PackId | null {
  const t = text.toLowerCase();
  if (!/\b(teach|learn|explain|lesson|course)\b|opeta|opi|selitä|kurssi/.test(t)) return null;
  if (/end date|rollover|roll over|päättyy|määräaik/.test(t)) return "ends";
  if (/subscri|tilau/.test(t)) return "subs";
  if (/electric|spot|fixed|kwh|sähk|pörssi|kiinte/.test(t)) return "electricity";
  if (/diversif|eggs|hajaut/.test(t)) return "spread";
  if (/\brisk|riski/.test(t)) return "risk";
  if (/\bfee|kulu|palkkio/.test(t)) return "fees";
  if (/what is a fund|index|rahasto/.test(t)) return "fund";
  if (/fund|invest|sijoit/.test(t)) return "fees";
  if (/buffer|emergency|rainy|safety|puskuri|hätä|varmuus/.test(t)) return "buffer";
  if (/pay yourself|save first|säästä ensin/.test(t)) return "first";
  if (/needs|wants|tarpeet/.test(t)) return "needs";
  return null;
}
