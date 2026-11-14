// Action cards in the coach chat. The model proposes an action, the server checks it against the demo data and
// returns it as one of these, and the chat shows it as a card with a button. Nothing happens until the person taps.
// Pure and shared by the server (src/app/api/coach/route.ts) and the browser (src/app/coach/action-card.tsx).

export type ChatView = "home" | "bills" | "save" | "calendar" | "costs";

export type ChatAction =
  | { kind: "cancel_subscription"; id: string; name: string; monthly: number }
  | { kind: "change_plan"; monthly: number; trim?: { id: string; saving: number } } // trim: the everyday cut this raise comes from (restaurants, groceries, transport)
  | { kind: "add_goal"; label: string; target: number; saved: number; months: number; monthly: number } // EUR a month to the savings account
  | { kind: "switch_bill"; bill: "electricity" | "telecom"; supplier?: string; yearlySaving?: number }
  | { kind: "open"; view: ChatView }
  | { kind: "learn"; pack: "electricity" | "fees" | "buffer" }; // a Money skills lesson, played in the chat

/** What the person has done in this browser, sent with each question so the coach doesn't offer it again. */
export type ChatState = {
  cancelled: string[]; // subscription ids
  planMonthly: number | null; // the current saving plan, EUR a month
  switched: ("electricity" | "telecom")[];
  goals: { label: string; target: number; saved: number; monthly: number }[]; // the person's savings goals
  trimmed: string[]; // everyday cuts already put into the saving plan, so they are not suggested again
};

export const VIEW_HREF: Record<ChatView, string> = {
  home: "/",
  bills: "/bills",
  save: "/save",
  calendar: "/calendar",
  costs: "/costs",
};

export const VIEW_LABEL: Record<ChatView, string> = {
  home: "Open Home",
  bills: "Open Bills",
  save: "Open your investments",
  calendar: "Open the calendar",
  costs: "See all your costs",
};

export const MAX_ACTIONS = 3;

/** sessionStorage key: the last page before the chat, written by the tab bar. */
export const LAST_PAGE_KEY = "solvo.last-page";

/** Same action twice in one answer shows once. */
export const actionKey = (a: ChatAction) =>
  a.kind === "cancel_subscription" ? `${a.kind}:${a.id}` : a.kind === "switch_bill" ? `${a.kind}:${a.bill}` : a.kind === "open" ? `${a.kind}:${a.view}` : a.kind === "learn" ? `${a.kind}:${a.pack}` : a.kind === "add_goal" ? `${a.kind}:${a.label}:${a.target}` : a.kind;

const COMPARE_Q = "How do I compare to others?";
const WHERE_Q = "Where could I save more?";
const DINNER_Q = "Can I afford a €50 dinner tonight?";
const STYLE_Q = "What kind of spender am I?";
const PLAN_Q = "Help me save €100 more a month";

/** What the last answer showed, for choosing the next questions to offer. */
export type AnswerKind = { compares?: { label: string; focus: string }[]; styles?: unknown[]; savings?: unknown[]; whatIfs?: unknown[]; checks?: unknown[]; actions?: unknown[] };

/**
 * Questions to offer after an answer, based on what it showed, so each answer leads on to the next: a comparison leads to
 * "where could I save" and other groups, "where could I save" to a plan, and so on. Anything the person already asked is left
 * out. Every answer gets some, so the chat never ends on a dead end: an answer with none of these cards gets the everyday ones.
 */
export function followUpsFor(last: AnswerKind, asked: string[]): string[] {
  const c = last.compares?.[0];
  let next: string[] | null = null;
  if (c) {
    const groups = [
      ["Compare me with people in my city", /^Living in/],
      ["Compare me with people on my income", /^Earning/],
      ["Compare me with everyone", /^All customers/],
    ] as const;
    const other = groups.filter(([, re]) => !re.test(c.label)).map(([q]) => q);
    next = c.focus === "above" ? [PLAN_Q, COMPARE_Q, STYLE_Q, "What if I cut restaurants by half?"] : [WHERE_Q, ...other, STYLE_Q];
  } else if (last.styles?.length) next = [COMPARE_Q, WHERE_Q, PLAN_Q];
  else if (last.savings?.length) next = [COMPARE_Q, STYLE_Q, "Can I save €3,000 by June?"];
  else if (last.whatIfs?.length) next = [WHERE_Q, PLAN_Q, COMPARE_Q];
  else if (last.checks?.length) next = [COMPARE_Q, WHERE_Q, STYLE_Q];
  else if (last.actions?.length) next = [WHERE_Q, COMPARE_Q, DINNER_Q];
  next ??= [COMPARE_Q, WHERE_Q, STYLE_Q, DINNER_Q];
  const done = new Set(asked.map((q) => q.trim().toLowerCase()));
  return next.filter((q) => !done.has(q.toLowerCase())).slice(0, 4);
}

/** Questions to offer under the chat input, by the page the person came from. */
export function suggestionsFor(from: string, hasDemoExtras: boolean): string[] {
  const p = from.split("?")[0];
  const pick = (aino: string[], any: string[]) => (hasDemoExtras ? aino : any);
  if (p.startsWith("/bills"))
    return pick(
      ["Am I overpaying for electricity?", "Which subscriptions could I cancel?", "When does my electricity contract end?"],
      ["What do my bills cost a month?", "How much did I spend on utilities?", WHERE_Q],
    );
  if (p.startsWith("/save"))
    return pick(
      [WHERE_Q, "Can I save €3,000 by June?", "What is an index fund?"],
      [WHERE_Q, "Can I save €2,000 by June?", "How long until I have a €3,000 buffer?"],
    );
  if (p.startsWith("/calendar")) return ["What's coming up this month?", DINNER_Q, "How much did I spend on travel?"];
  if (p.startsWith("/costs")) return [COMPARE_Q, WHERE_Q, "How much did I spend on restaurants?"];
  // The everyday questions first: how am I doing against others, can I afford something now, where does the money go.
  return pick(
    [COMPARE_Q, DINNER_Q, WHERE_Q, "Can I save €3,000 by June?"],
    [COMPARE_Q, DINNER_Q, WHERE_Q, "How much can I spend this week?"],
  );
}
