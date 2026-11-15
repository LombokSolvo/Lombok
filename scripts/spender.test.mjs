// Checks the spender-type logic on invented transactions: each type, too little data, and a bank that gives dates but no time of day.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spenderProfile } from "../src/lib/spender.ts";

const MONTHS = ["2026-03", "2026-04", "2026-05", "2026-06"];
const summary = { last12Months: MONTHS };
// 2026-03-07 is a Saturday, 2026-03-10 a Tuesday.
const SAT = "2026-03-07";
const TUE = "2026-03-10";
const ts = (hour) => `07MAR26:${String(hour).padStart(2, "0")}:15:00`;
const tx = (date, category, amount, hour) => ({
  date,
  ts: hour === null ? date : ts(hour),
  account: "A",
  category,
  amount,
  balance: 0,
  type: "purchase",
  merchant: null,
  mcc: null,
});
const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));

test("leisure money that lands on weekends is a weekend spender", () => {
  const rows = [...many(40, () => tx(SAT, "Restaurants", -30, 13)), ...many(10, () => tx(TUE, "Restaurants", -30, 13)), ...many(40, () => tx(TUE, "Groceries", -20, 12))];
  const p = spenderProfile({ transactions: rows, summary });
  assert.equal(p?.type, "Weekend spender");
  assert.equal(p?.busiestDay, "Saturday");
  assert.ok(p && Math.abs(p.byWeekday.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("money spent after 17:00 is an evening spender", () => {
  const rows = [...many(50, () => tx(TUE, "Restaurants", -25, 19)), ...many(5, () => tx(TUE, "Groceries", -20, 10)), ...many(30, () => tx("2026-03-11", "Groceries", -15, 20))];
  const p = spenderProfile({ transactions: rows, summary });
  assert.equal(p?.type, "Evening spender");
  assert.ok(p?.facts.some((f) => f.label.includes("after 17:00")));
});

test("a spread-out pattern is balanced", () => {
  const rows = [
    ...many(24, () => tx(SAT, "Restaurants", -30, 13)),
    ...many(36, () => tx(TUE, "Restaurants", -30, 12)),
    ...many(30, () => tx("2026-03-11", "Groceries", -20, 11)),
    ...many(20, () => tx("2026-03-12", "Groceries", -20, 18)),
  ];
  assert.equal(spenderProfile({ transactions: rows, summary })?.type, "Balanced spender");
});

test("too little data says nothing", () => {
  assert.equal(spenderProfile({ transactions: many(10, () => tx(SAT, "Restaurants", -30, 13)), summary }), null);
});

test("dates without a time of day give no evening figure", () => {
  const rows = [...many(40, () => tx(SAT, "Restaurants", -30, null)), ...many(20, () => tx(TUE, "Groceries", -20, null))];
  const p = spenderProfile({ transactions: rows, summary });
  assert.ok(p);
  assert.ok(!p.facts.some((f) => f.label.includes("after 17:00")));
});

test("income and non-everyday categories are ignored", () => {
  const rows = [...many(40, () => tx(SAT, "Restaurants", -30, 13)), ...many(40, () => tx(TUE, "Housing", -500, 9)), ...many(10, () => tx(TUE, "Salary", 3000, 9))];
  const p = spenderProfile({ transactions: rows, summary });
  assert.equal(p?.type, "Weekend spender");
});
