// Checks the plan overview maths on invented numbers: the usual leftover, the gap to the plan, and the categories worth trimming.
import assert from "node:assert/strict";
import { test } from "node:test";
import { foundShare, leftoverPerMonth, planGap, trimsFrom } from "../src/lib/plan-view.ts";

const customer = (salaryYear, fixed, irregular, everyday) => ({ summary: { salaryYear, basketYear: [0, fixed, irregular, everyday] } });

test("the leftover is income minus fixed, irregular and everyday spending, per month", () => {
  assert.equal(leftoverPerMonth(customer(48000, 24000, 6000, 12000)), 500);
  assert.equal(leftoverPerMonth(customer(24000, 12000, 6000, 8400)), -200);
});

test("a plan the leftover covers has no gap", () => {
  assert.deepEqual(planGap(250, 200), { gap: 0, status: "covered" });
});

test("a plan above the leftover has a gap to find", () => {
  assert.deepEqual(planGap(46, 200), { gap: 154, status: "stretch" });
});

test("a negative leftover means spending has to come down first", () => {
  assert.deepEqual(planGap(-160, 200), { gap: 360, status: "short" });
});

const metric = (id, you, median) => ({ id, label: id, you, median, pct: 50, deciles: [] });
test("trims keep only everyday categories well above typical, halfway but at most 15 % of the spend, largest first", () => {
  const group = { metrics: [metric("restaurants", 210, 150), metric("groceries", 390, 380), metric("transport", 220, 100), metric("bills", 300, 100), metric("rent", 900, 700)] };
  const t = trimsFrom(group);
  assert.deepEqual(t.map((x) => [x.id, x.saving]), [["transport", 35], ["restaurants", 30]]);
});

test("no group, no trims", () => {
  assert.deepEqual(trimsFrom(null), []);
});

test("found share is clamped and an empty gap is complete", () => {
  assert.equal(foundShare(50, 200), 25);
  assert.equal(foundShare(500, 200), 100);
  assert.equal(foundShare(0, 0), 100);
});
