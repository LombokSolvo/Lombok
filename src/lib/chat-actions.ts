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
  weeklyDelta: number; // EUR a week the person's choices add to Home's safe-to-spend (switches, plan, cancelled subscriptions, edits)
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

// More everyday questions, for when the ones that follow on from an answer have all been asked.
const MORE_Q = [
  "How much can I spend this week?",
  "Which subscriptions could I cancel?",
  "Can I save €3,000 by June?",
  "What if I cut restaurants by half?",
  "Am I overpaying for electricity?",
  PLAN_Q,
  "What's coming up this month?",
  "How long until I have a €3,000 buffer?",
];

const norm = (q: string) => q.trim().toLowerCase();

/**
 * Splits the model's last line off its answer. The model ends with `NEXT: question | question | question`: the questions it
 * would ask next, from the whole chat. The line is not shown; the questions become the chips.
 */
export function splitSuggestions(text: string): { answer: string; suggestions: string[] } {
  // The model does not always write the line exactly as asked: it may bold it ("**NEXT:**"), put it on the same line as
  // the answer, or put the follow-up question after it. Any line that starts with NEXT is removed wherever it is, and a
  // "NEXT: a | b" tail on the last line too, so the line never shows.
  const LINE = /^[ \t>*_#-]*NEXT[*_ \t]*:[*_ \t]*(.*)$/i;
  const TAIL = /[ \t]+[*_]*NEXT[*_ \t]*:[*_ \t]*([^\n]*\|[^\n]*)$/i;
  let picked: string | null = null;
  const lines = text.split("\n").filter((line) => {
    const m = line.match(LINE);
    if (!m) return true;
    picked = m[1];
    return false;
  });
  if (picked === null && lines.length) {
    const last = lines[lines.length - 1];
    const m = last.match(TAIL);
    if (m && m.index !== undefined) {
      picked = m[1];
      lines[lines.length - 1] = last.slice(0, m.index);
    }
  }
  const answer = lines.join("\n").trim();
  if (picked === null) return { answer, suggestions: [] };
  const suggestions = (picked as string)
    .split("|")
    .map((q) => q.replace(/^[\s"“•*_-]+|["”*_\s]+$/g, ""))
    .filter((q) => q.length >= 4 && q.length <= 70)
    .slice(0, 4);
  return { answer, suggestions };
}

/**
 * Questions to offer after an answer. The model's own (`fromModel`, written from the whole chat) come first, then the ones that
 * follow on from what the answer showed (a comparison leads to "where could I save", a plan to a comparison, and so on), then
 * everyday ones. Anything already asked is left out. There are always some: when every one has been asked, they come round
 * again rather than the chat running out.
 */
export function followUpsFor(last: AnswerKind, asked: string[], fromModel: string[] = []): string[] {
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
  const done = new Set(asked.map(norm));
  const fresh = [...new Map([...fromModel, ...next, ...MORE_Q].filter((q) => !done.has(norm(q))).map((q) => [norm(q), q])).values()];
  return (fresh.length ? fresh : [...new Map([...next, ...MORE_Q].map((q) => [norm(q), q])).values()]).slice(0, 4);
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
