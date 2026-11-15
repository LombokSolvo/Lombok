// The learning game on Home: three short courses, each a path of small lessons, a streak for learning on consecutive days, and a
// title for each course finished. Pure (no hooks, no clock unless given one), so scripts/learn-game.test.mjs can import it.
// A lesson is either a three-question quiz played right there, or one of the chat's richer packs (src/lib/learn.ts), which opens
// in the chat with the person's own numbers. Both finish into the same progress record (src/lib/learn-store.ts).
// Solvo explains how things work. It never tells the person which product to buy.

export type QuizQuestion = { q: string; options: string[]; correct: number; why: string };
export type Lesson =
  | { id: string; title: string; kind: "quiz"; minutes: number; questions: QuizQuestion[] }
  | { id: string; title: string; kind: "pack"; minutes: number; pack: "electricity" | "fees" | "buffer" };
export type Course = { id: string; title: string; blurb: string; badge: string; lessons: Lesson[] };
export type Done = Record<string, { at: string; quizRight: boolean }>;

const quiz = (id: string, title: string, questions: QuizQuestion[]): Lesson => ({ id, title, kind: "quiz", minutes: 1, questions });

export const COURSES: Course[] = [
  {
    id: "investing",
    title: "Investing basics",
    blurb: "What funds are, and how risk and time work",
    badge: "Fund explorer",
    lessons: [
      quiz("fund", "What is a fund?", [
        { q: "A fund is…", options: ["One company's share", "A pool of many people's money, put into many companies or bonds", "A savings account with fixed interest"], correct: 1, why: "A fund pools money from many investors and spreads it over many holdings." },
        { q: "An index fund…", options: ["Tries to follow a market index, like the biggest companies in a region", "Always beats the market", "Is re-picked by a manager every month"], correct: 0, why: "An index fund follows an index instead of trying to beat it, which is why it is usually cheap." },
        { q: "Where do you see what a fund costs?", options: ["Only after you sell", "In its ongoing fee, a % a year", "Funds are free"], correct: 1, why: "Every fund has an ongoing fee, shown as a percentage a year, taken from the fund's value." },
      ]),
      quiz("risk", "Risk and time", [
        { q: "Over a single year, fund values usually…", options: ["Only go up", "Can go up and down quite a lot", "Stay the same"], correct: 1, why: "Values move every day. Over short periods they can fall as well as rise." },
        { q: "Money you need within a year is usually better kept…", options: ["In a fund", "In a savings account you can reach", "In one single share"], correct: 1, why: "If you need it soon, you can't wait out a dip, so keep it somewhere steady." },
        { q: "A longer time horizon…", options: ["Removes all risk", "Gives more time to recover from dips, but never removes risk", "Guarantees a profit"], correct: 1, why: "Time helps with ups and downs, but nothing in investing is guaranteed." },
      ]),
      { id: "fees", title: "How fees add up", kind: "pack", minutes: 3, pack: "fees" },
      quiz("spread", "Not all eggs in one basket", [
        { q: "Spreading money over many companies and regions is called…", options: ["Diversifying", "Day trading", "Leverage"], correct: 0, why: "That is diversifying." },
        { q: "A fund that holds hundreds of companies is…", options: ["Less dependent on any one company", "Guaranteed to rise", "Riskier than one share"], correct: 0, why: "If one holding does badly, it is a small part of the whole." },
        { q: "Diversifying…", options: ["Removes the chance of losing money", "Lowers the damage if one holding does badly", "Increases fees by law"], correct: 1, why: "It reduces the damage from any single bad holding. It does not remove risk." },
      ]),
    ],
  },
  {
    id: "everyday",
    title: "Everyday money",
    blurb: "A calm month, a buffer and saving first",
    badge: "Budget keeper",
    lessons: [
      quiz("needs", "Needs and wants", [
        { q: "Rent, electricity and food are usually…", options: ["Wants", "Needs you have to pay", "Investments"], correct: 1, why: "These are must-pay costs. Everything else is a choice." },
        { q: "A good first step to a calm month is…", options: ["Seeing your must-pay bills first, then what is left", "Spending first and checking later", "Paying only the biggest bill"], correct: 0, why: "What is left after the must-pay costs is what you can really choose how to use." },
        { q: "A €10 subscription costs how much over a year?", options: ["€12", "€120", "€1,200"], correct: 1, why: "€10 × 12 months is €120. Small payments that repeat add up." },
      ]),
      { id: "buffer", title: "Emergency fund: how much?", kind: "pack", minutes: 2, pack: "buffer" },
      quiz("first", "Pay yourself first", [
        { q: "Paying yourself first means…", options: ["Moving money to savings right after payday, before spending", "Buying yourself a treat first", "Paying all bills late"], correct: 0, why: "What you save is moved first, so spending is limited to what is left." },
        { q: "Why does setting it up to repeat help?", options: ["You don't have to remember or decide each month", "It earns bonus interest", "Banks require it"], correct: 0, why: "Automatic means it happens even in a busy month." },
        { q: "A good starting amount is…", options: ["Whatever you can keep up every month, even a small one", "Only worth it above €1,000", "Half your salary"], correct: 0, why: "A small amount you keep up beats a big one you drop after two months." },
      ]),
    ],
  },
  {
    id: "bills",
    title: "Bills and contracts",
    blurb: "Fixed or spot, end dates and subscriptions",
    badge: "Bill boss",
    lessons: [
      { id: "electricity", title: "Fixed or spot electricity?", kind: "pack", minutes: 2, pack: "electricity" },
      quiz("ends", "Contract end dates", [
        { q: "When a fixed-term contract ends, doing nothing can mean…", options: ["Moving to a higher standard price", "A free upgrade", "The contract cancels itself with no bill"], correct: 0, why: "Many contracts roll over to a standard price that is higher than the offer you had." },
        { q: "A good time to compare is…", options: ["A month or two before the end date", "Years after", "Never"], correct: 0, why: "Early enough to choose calmly, close enough that the offers are current." },
        { q: "Switching supplier usually changes…", options: ["Only the price and terms, the power arrives the same", "Your home's wiring", "Your bank"], correct: 0, why: "The grid company and the line into your home stay the same." },
      ]),
      quiz("subs", "Subscriptions", [
        { q: "A subscription you haven't used for months is…", options: ["Worth reviewing or cancelling", "Free", "Always good value"], correct: 0, why: "If you don't use it, it is money for nothing." },
        { q: "Card subscriptions are easy to miss because…", options: ["They charge automatically every month", "They never show on statements", "They are a tax"], correct: 0, why: "They renew on their own, so nothing reminds you." },
        { q: "Cancelling one saves…", options: ["Its price every month after", "Nothing", "Only the first month"], correct: 0, why: "The saving repeats every month the subscription would have run." },
      ]),
    ],
  },
];

export const LESSON_COUNT = COURSES.reduce((n, c) => n + c.lessons.length, 0);
export const courseOf = (lessonId: string) => COURSES.find((c) => c.lessons.some((l) => l.id === lessonId));

export type CourseState = { done: number; total: number; complete: boolean; next: Lesson | null };

/** How far along a course is, and the first lesson not yet finished. */
export function courseState(course: Course, done: Done): CourseState {
  const finished = course.lessons.filter((l) => done[l.id]).length;
  return { done: finished, total: course.lessons.length, complete: finished === course.lessons.length, next: course.lessons.find((l) => !done[l.id]) ?? null };
}

/** The badges earned so far: one for each finished course. */
export const earnedBadges = (done: Done) => COURSES.filter((c) => courseState(c, done).complete).map((c) => c.badge);

const RANKS: [number, string][] = [
  [0, "Newcomer"],
  [1, "Curious saver"],
  [4, "Money learner"],
  [7, "Money pro"],
  [LESSON_COUNT, "Money master"],
];
/** A rank for the number of lessons finished. */
export function rankTitle(done: Done) {
  const n = COURSES.flatMap((c) => c.lessons).filter((l) => done[l.id]).length;
  return [...RANKS].reverse().find(([min]) => n >= min)![1];
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * Days in a row on which the person finished a lesson. A streak is still alive on a day when nothing is done yet, as long as
 * yesterday had a lesson: it only breaks when a whole day passes without one.
 */
export function streakDays(done: Done, now = new Date()) {
  const days = new Set(Object.values(done).map((d) => dayKey(new Date(d.at))));
  const d = new Date(now);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Whether a lesson has been finished today, for the "keep your streak" nudge. */
export const doneToday = (done: Done, now = new Date()) => Object.values(done).some((d) => dayKey(new Date(d.at)) === dayKey(now));

/** The last seven days, oldest first, each with whether a lesson was finished that day, for the row of dots under the streak. */
export function weekDots(done: Done, now = new Date()) {
  const days = new Set(Object.values(done).map((d) => dayKey(new Date(d.at))));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return { letter: "SMTWTFS"[d.getDay()], done: days.has(dayKey(d)), today: i === 6 };
  });
}

/**
 * Aino, the demo customer, has already been learning for a few days: two quiz lessons yesterday and the day before, so the
 * streak is alive and finishing a lesson today makes it longer. DEMO DATA, laid under whatever the person finishes themselves.
 */
export function demoHistory(now = new Date()): Done {
  const at = (daysAgo: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  };
  return {
    fund: { at: at(2), quizRight: true },
    risk: { at: at(1), quizRight: false },
    needs: { at: at(1), quizRight: true },
  };
}

/**
 * Marks a lesson finished and today as a learning day. A lesson keeps its first finish date (it counts once for the rank), but
 * playing any lesson again, an earlier one included, still counts today for the streak: that day is its own "day:" entry.
 */
export function withPractice(done: Done, id: string, quizRight: boolean, now = new Date()): Done {
  const at = now.toISOString();
  return { ...done, ...(done[id] ? {} : { [id]: { at, quizRight } }), [`day:${dayKey(now)}`]: { at, quizRight } };
}
