// The learning game on Home: three short courses, each a path of small lessons, a streak for learning on consecutive days, and a
// title for each course finished. Pure (no hooks, no clock unless given one), so scripts/learn-game.test.mjs can import it.
// Every lesson is one of the chat's packs (src/lib/learn.ts), which opens in the chat with the person's own numbers. The quiz
// lesson kind (three questions in a sheet on Home) is still supported but unused. Progress: src/lib/learn-store.ts.
// Solvo explains how things work. It never tells the person which product to buy.

import { PACK_META, type PackId } from "./learn.ts";

export type QuizQuestion = { q: string; options: string[]; correct: number; why: string };
export type Lesson =
  | { id: string; title: string; kind: "quiz"; minutes: number; questions: QuizQuestion[] }
  | { id: string; title: string; kind: "pack"; minutes: number; pack: PackId };
export type Course = { id: string; title: string; blurb: string; badge: string; lessons: Lesson[] };
export type Done = Record<string, { at: string; quizRight: boolean }>;

// Every lesson is a chat pack: it opens in the coach chat with cards, a quiz question and a try-it step with the person's numbers.
const pack = (id: PackId): Lesson => {
  const m = PACK_META.find((x) => x.id === id)!;
  return { id, title: m.title, kind: "pack", minutes: m.minutes, pack: id };
};

export const COURSES: Course[] = [
  {
    id: "investing",
    title: "Investing basics",
    blurb: "What funds are, and how risk and time work",
    badge: "Investing basics",
    lessons: [pack("fund"), pack("risk"), pack("fees"), pack("spread")],
  },
  {
    id: "everyday",
    title: "Everyday money",
    blurb: "A calm month, a buffer and saving first",
    badge: "Everyday money",
    lessons: [pack("needs"), pack("buffer"), pack("first")],
  },
  {
    id: "bills",
    title: "Bills and contracts",
    blurb: "Fixed or spot, end dates and subscriptions",
    badge: "Bill boss",
    lessons: [pack("electricity"), pack("ends"), pack("subs")],
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

/** The next lesson after this one: the next unfinished one in the same course, else the first unfinished one anywhere. */
export function nextLesson(lessonId: string, done: Done): Lesson | null {
  const course = courseOf(lessonId);
  const open = (l: Lesson) => l.id !== lessonId && !done[l.id];
  return course?.lessons.find(open) ?? COURSES.flatMap((c) => c.lessons).find(open) ?? null;
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
