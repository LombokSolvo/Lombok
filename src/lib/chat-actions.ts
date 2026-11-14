// Action cards in the coach chat. The model proposes an action, the server checks it against the demo data and
// returns it as one of these, and the chat shows it as a card with a button. Nothing happens until the person taps.
// Pure and shared by the server (src/app/api/coach/route.ts) and the browser (src/app/coach/action-card.tsx).

export type ChatView = "home" | "bills" | "save" | "calendar" | "costs" | "compare";

export type ChatAction =
  | { kind: "cancel_subscription"; id: string; name: string; monthly: number }
  | { kind: "change_plan"; monthly: number }
  | { kind: "switch_bill"; bill: "electricity" | "telecom"; supplier?: string; yearlySaving?: number }
  | { kind: "open"; view: ChatView }
  | { kind: "learn"; pack: "electricity" | "fees" | "buffer" }; // a Money skills lesson, played in the chat

/** What the person has done in this browser, sent with each question so the coach doesn't offer it again. */
export type ChatState = {
  cancelled: string[]; // subscription ids
  planMonthly: number | null; // the current saving plan, EUR a month
  switched: ("electricity" | "telecom")[];
};

export const VIEW_HREF: Record<ChatView, string> = {
  home: "/",
  bills: "/bills",
  save: "/save",
  calendar: "/calendar",
  costs: "/costs",
  compare: "/compare",
};

export const VIEW_LABEL: Record<ChatView, string> = {
  home: "Open Home",
  bills: "Open Bills",
  save: "Open your investments",
  calendar: "Open the calendar",
  costs: "See all your costs",
  compare: "See how you compare",
};

export const MAX_ACTIONS = 3;

/** sessionStorage key: the last page before the chat, written by the tab bar. */
export const LAST_PAGE_KEY = "solvo.last-page";

/** Same action twice in one answer shows once. */
export const actionKey = (a: ChatAction) =>
  a.kind === "cancel_subscription" ? `${a.kind}:${a.id}` : a.kind === "switch_bill" ? `${a.kind}:${a.bill}` : a.kind === "open" ? `${a.kind}:${a.view}` : a.kind === "learn" ? `${a.kind}:${a.pack}` : a.kind;

/** Questions to offer under the chat input, by the page the person came from. */
export function suggestionsFor(from: string, hasDemoExtras: boolean): string[] {
  const p = from.split("?")[0];
  const pick = (aino: string[], any: string[]) => (hasDemoExtras ? aino : any);
  if (p.startsWith("/bills"))
    return pick(
      ["Am I overpaying for electricity?", "Which subscriptions could I cancel?", "When does my electricity contract end?"],
      ["What do my bills cost a month?", "How much did I spend on utilities?", "Where could I save the most?"],
    );
  if (p.startsWith("/save"))
    return pick(
      ["Can I save €3,000 by June?", "What is an index fund?", "Lower my saving plan to €150"],
      ["Can I save €2,000 by June?", "How long until I have a €3,000 buffer?", "What is an index fund?"],
    );
  if (p.startsWith("/calendar"))
    return ["What's coming up this month?", "Can I afford an €80 dinner this week?", "How much did I spend on travel?"];
  if (p.startsWith("/costs") || p.startsWith("/compare"))
    return ["Where could I save the most?", "How much did I spend on restaurants?", "How much did I spend on taxis?"];
  return pick(
    ["Can I save €3,000 by June?", "What if I cut restaurants by half?", "Where could I save the most?"],
    ["Can I save €2,000 by June?", "What if I cut restaurants by half?", "How much can I spend this week?"],
  );
}
