// Checks the learning game's streak, course progress, badges and ranks on fixed dates.
import assert from "node:assert/strict";
import { test } from "node:test";
import { COURSES, LESSON_COUNT, courseState, demoHistory, doneToday, earnedBadges, rankTitle, streakDays, weekDots } from "../src/lib/learn-game.ts";

const NOW = new Date(2026, 10, 14, 15, 0, 0); // Sat 14 Nov 2026, 15:00 local
const day = (back, h = 12) => new Date(2026, 10, 14 - back, h).toISOString();
const rec = (back) => ({ at: day(back), quizRight: true });

test("every quiz lesson has three questions and each answer is one of its options", () => {
  for (const c of COURSES)
    for (const l of c.lessons)
      if (l.kind === "quiz") {
        assert.equal(l.questions.length, 3, l.id);
        for (const q of l.questions) assert.ok(q.correct >= 0 && q.correct < q.options.length, `${l.id}: ${q.q}`);
      }
});

test("lesson ids are unique, so progress never collides", () => {
  const ids = COURSES.flatMap((c) => c.lessons.map((l) => l.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, LESSON_COUNT);
});

test("no lessons means no streak", () => {
  assert.equal(streakDays({}, NOW), 0);
});

test("a lesson today starts a one-day streak", () => {
  assert.equal(streakDays({ fund: rec(0) }, NOW), 1);
});

test("days in a row count, and the streak is still alive before today's lesson", () => {
  assert.equal(streakDays({ fund: rec(1), risk: rec(2), needs: rec(3) }, NOW), 3);
  assert.equal(streakDays({ fund: rec(0), risk: rec(1), needs: rec(2) }, NOW), 3);
});

test("a missed day breaks it", () => {
  assert.equal(streakDays({ fund: rec(2), risk: rec(3) }, NOW), 0);
  assert.equal(streakDays({ fund: rec(0), risk: rec(2) }, NOW), 1);
});

test("two lessons on one day are one day", () => {
  assert.equal(streakDays({ fund: rec(1), risk: rec(1, 9) }, NOW), 1);
});

test("done today is told apart from yesterday", () => {
  assert.equal(doneToday({ fund: rec(1) }, NOW), false);
  assert.equal(doneToday({ fund: rec(0) }, NOW), true);
});

test("a course is complete when all its lessons are done, and the next lesson is the first open one", () => {
  const investing = COURSES[0];
  const some = courseState(investing, { fund: rec(0), fees: rec(0) });
  assert.deepEqual([some.done, some.total, some.complete, some.next?.id], [2, 4, false, "risk"]);
  const all = Object.fromEntries(investing.lessons.map((l) => [l.id, rec(0)]));
  const full = courseState(investing, all);
  assert.deepEqual([full.complete, full.next], [true, null]);
  assert.deepEqual(earnedBadges(all), ["Investing basics"]);
});

test("the rank grows with lessons finished", () => {
  const some = (n) => Object.fromEntries(COURSES.flatMap((c) => c.lessons).slice(0, n).map((l) => [l.id, rec(0)]));
  assert.equal(rankTitle(some(0)), "Newcomer");
  assert.equal(rankTitle(some(1)), "Curious saver");
  assert.equal(rankTitle(some(4)), "Money learner");
  assert.equal(rankTitle(some(LESSON_COUNT)), "Money master");
});

test("Aino's demo history is a live two-day streak that finishing one lesson today makes three", () => {
  const h = demoHistory(NOW);
  assert.equal(streakDays(h, NOW), 2);
  assert.equal(streakDays({ ...h, buffer: rec(0) }, NOW), 3);
});

test("the week row has seven days ending today, with the days that had a lesson filled", () => {
  const w = weekDots({ fund: rec(1), risk: rec(0), needs: rec(5) }, NOW);
  assert.equal(w.length, 7);
  assert.deepEqual(w.map((d) => d.done), [false, true, false, false, false, true, true]);
  assert.deepEqual([w[6].today, w[0].today, w[6].letter], [true, false, "S"]);
});
