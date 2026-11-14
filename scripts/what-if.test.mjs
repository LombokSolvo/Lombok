// Runnable check for the coach's "what if" maths (src/lib/what-if.ts). Numbers shaped like the demo customer's.
// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { addMonths, safeToSave, whatIf } from "../src/lib/what-if.ts";

// Monthly: income 4,028, bills 1,139, irregular 747, everyday 2,096. Plan room = 2,142 - 0.85 * 2,096 = 360.
const BASE = {
  incomeMonthly: 4028,
  fixedRegularMonthly: 1139,
  irregularMonthly: 747,
  everydayMonthly: 2096,
  cashBalance: 5000,
  investsMonthlyToday: 0,
  planMonthly: 200,
  weeklyBudget: 448,
  today: "2026-09-30",
};

test("safe to save is the plan's room minus the running saving plan", () => {
  assert.equal(safeToSave({ ...BASE, planMonthly: null }).monthly, 360);
  assert.equal(safeToSave(BASE).monthly, 160);
});

test("a target that fits", () => {
  const r = whatIf(BASE, { kind: "save_target", target: 1000, months: 10 });
  assert.equal(r.kind, "save_target");
  assert.equal(r.neededMonthly, 100);
  assert.equal(r.fits, true);
  assert.equal(r.gapMonthly, 0);
  assert.equal(r.cutWeekly, 0);
  assert.equal(r.deadline, "2027-07-30");
  assert.ok(r.assumptions.length >= 2);
});

test("a target that doesn't fit has both levers", () => {
  // 30 Sept to 31 March is six whole months: 3,000 / 6 = 500 a month against 160.
  const r = whatIf(BASE, { kind: "save_target", target: 3000, deadline: "2027-03-31" });
  assert.equal(r.months, 6);
  assert.equal(r.neededMonthly, 500);
  assert.equal(r.fits, false);
  assert.equal(r.gapMonthly, 340);
  assert.equal(r.cutWeekly, Math.round(340 / (52 / 12))); // 78
  assert.equal(r.monthsIfCurrentPace, 19); // ceil(3,000 / 160)
  assert.equal(r.dateIfCurrentPace, "2028-04-30");
});

test("already saved counts towards the target", () => {
  const r = whatIf(BASE, { kind: "save_target", target: 3000, months: 6, alreadySaved: 1200 });
  assert.equal(r.toGo, 1800);
  assert.equal(r.neededMonthly, 300);
});

test("cutting restaurants by half", () => {
  const r = whatIf(BASE, { kind: "change_spending", label: "Restaurants", basket: 3, currentMonthly: 499, percent: -50 });
  assert.equal(r.kind, "change_spending");
  assert.equal(r.newMonthly, 250);
  assert.equal(r.freedMonthly, 250);
  assert.equal(r.freedYearly, 2994);
  assert.equal(r.safeToSpendWeeklyBefore, 448);
  assert.equal(r.safeToSpendWeeklyAfter, Math.round(448 + 249.5 / (52 / 12))); // 506
  assert.ok(r.safeToSaveMonthlyAfter > r.safeToSaveMonthly);
});

test("stopping a kind of spending with a new monthly amount of zero", () => {
  const r = whatIf(BASE, { kind: "change_spending", label: "Taxis", basket: 3, currentMonthly: 40, newMonthly: 0 });
  assert.equal(r.freedMonthly, 40);
  assert.equal(r.freedYearly, 480);
});

test("a cheaper bill raises safe-to-save through the bills line", () => {
  const r = whatIf(BASE, { kind: "change_spending", label: "Utilities", basket: 1, currentMonthly: 226, newMonthly: 206 });
  assert.equal(r.safeToSaveMonthlyAfter, 180);
});

test("zero safe-to-save: nothing fits and there is no pace", () => {
  // Surplus 1,451 is below 85% of 1,611 everyday + 82... leaves only 82; a 200 plan eats it all.
  const tight = { ...BASE, incomeMonthly: 3925, fixedRegularMonthly: 1619, irregularMonthly: 856, everydayMonthly: 1611 };
  assert.equal(safeToSave(tight).monthly, 0);
  const r = whatIf(tight, { kind: "save_target", target: 3000, months: 8 });
  assert.equal(r.fits, false);
  assert.equal(r.monthsIfCurrentPace, null);
  assert.equal(r.dateIfCurrentPace, null);
  const h = whatIf(tight, { kind: "how_long", target: 5000 });
  assert.equal(h.months, null);
  assert.equal(h.date, null);
});

test("negative surplus never gives a negative safe-to-save", () => {
  assert.equal(safeToSave({ ...BASE, incomeMonthly: 1500, planMonthly: null }).monthly, 0);
});

test("how long until a buffer", () => {
  const r = whatIf(BASE, { kind: "how_long", target: 5000 });
  assert.equal(r.monthly, 160);
  assert.equal(r.months, 32);
  assert.equal(r.date, addMonths("2026-09-30", 32));
  const own = whatIf(BASE, { kind: "how_long", target: 5000, monthly: 500, alreadySaved: 1000 });
  assert.equal(own.months, 8);
});

test("bad input is an error, never a number", () => {
  for (const input of [
    { kind: "save_target", target: -5, months: 3 },
    { kind: "save_target", target: 3000 },
    { kind: "save_target", target: 3000, deadline: "2020-01-01" },
    { kind: "save_target", target: 3000, deadline: "next summer" },
    { kind: "change_spending", label: "X", basket: 3, currentMonthly: 100 },
    { kind: "change_spending", label: "X", basket: 3, currentMonthly: 100, percent: -150 },
    { kind: "how_long", target: "lots" },
    { kind: "nonsense" },
    undefined,
  ]) {
    assert.equal(whatIf(BASE, input).kind, "error", JSON.stringify(input));
  }
  assert.equal(whatIf({ ...BASE, today: "x" }, { kind: "how_long", target: 10 }).kind, "error");
});

test("addMonths keeps the end of the month", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-09-30", 6), "2027-03-30");
});
