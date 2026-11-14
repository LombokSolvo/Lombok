// Runnable check for "help me save €100 more a month" (src/lib/find-savings.ts). Numbers shaped like the demo customer's.
// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CUT, findSavings } from "../src/lib/find-savings.ts";

const AINO = [
  { kind: "switch", id: "electricity", label: "Switch electricity", supplier: "Oomi", monthly: 20, yearly: 240 },
  { kind: "switch", id: "telecom", label: "Switch phone and internet", supplier: "Moi", monthly: 25.5, yearly: 306 },
  { kind: "trim", id: "restaurants", label: "Eating out", currentMonthly: 499 },
  { kind: "trim", id: "entertainment", label: "Entertainment", currentMonthly: 288 },
  { kind: "cancel", id: "netflix", label: "Cancel Netflix", monthly: 13.99 },
];

test("bill switches first, then the biggest subscription, then a trim sized to the gap", () => {
  const r = findSavings(100, AINO);
  assert.deepEqual(r.lines.map((l) => l.id), ["telecom", "electricity", "netflix", "restaurants"]);
  const trim = r.lines[3];
  assert.equal(trim.monthly, 45); // 100 - 26 - 20 - 13.99 = 40.01, rounded up to 5
  assert.equal(trim.newMonthly, 454);
  assert.equal(trim.weeklyNow, Math.round(499 / (52 / 12)));
  assert.equal(r.found, 105); // 26 + 20 + 13.99 + 45
  assert.equal(r.reached, true);
  assert.equal(r.yearly, 1260);
});

test("a trim never asks for more than a quarter of the spending", () => {
  const r = findSavings(300, AINO);
  for (const l of r.lines.filter((l) => l.kind === "trim")) assert.ok(l.monthly <= l.currentMonthly * MAX_CUT + 5, l.id);
  assert.ok(r.lines.some((l) => l.kind === "cancel"), "a subscription is part of the plan");
});

test("a target the person's numbers can't reach says so", () => {
  const r = findSavings(1000, AINO);
  assert.equal(r.reached, false);
  assert.ok(r.found < 1000);
});

test("no bills to switch (new customer): trims only", () => {
  const r = findSavings(100, AINO.filter((c) => c.kind === "trim"));
  assert.deepEqual(r.lines.map((l) => l.id), ["restaurants"]);
  assert.equal(r.found, 100);
});

test("a small target is met by one switch, and nothing more is asked", () => {
  const r = findSavings(20, AINO);
  assert.deepEqual(r.lines.map((l) => l.id), ["telecom"]);
});

test("bad input is an error", () => {
  for (const t of [0, -5, Number.NaN, 1e9]) assert.ok("error" in findSavings(t, AINO), String(t));
});
