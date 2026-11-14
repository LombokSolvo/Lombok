// Paydays follow banking days (src/lib/schedule.ts): a salary due on a weekend or a Finnish bank holiday arrives the day before.
import assert from "node:assert/strict";
import { test } from "node:test";
import { eventsForMonth, previousBankingDay } from "../src/lib/schedule.ts";

test("a payday on a weekend arrives on the Friday before", () => {
  assert.equal(previousBankingDay("2026-11-15"), "2026-11-13"); // Sunday
  assert.equal(previousBankingDay("2026-11-14"), "2026-11-13"); // Saturday
  assert.equal(previousBankingDay("2026-11-13"), "2026-11-13"); // a Friday stays
  assert.equal(previousBankingDay("2026-11-16"), "2026-11-16"); // a Monday stays
});
test("bank holidays count: Independence Day, Christmas, Good Friday, Midsummer Eve", () => {
  assert.equal(previousBankingDay("2026-12-06"), "2026-12-04"); // Sunday and Independence Day
  assert.equal(previousBankingDay("2026-12-25"), "2026-12-23"); // Christmas Day, and Christmas Eve is closed too
  assert.equal(previousBankingDay("2026-04-05"), "2026-04-02"); // Easter Sunday, Good Friday before it
  assert.equal(previousBankingDay("2026-06-19"), "2026-06-18"); // Midsummer Eve is a Friday in 2026
  assert.equal(previousBankingDay("2027-01-01"), "2026-12-31");
});
const salary = { id: "salary", label: "Salary", kind: "in", day: 15, amount: 4000, source: "detected" };
const rent = { id: "rent", label: "Rent", kind: "out", day: 15, amount: 900, source: "detected" };
test("in the calendar: salary moves, a bill on the same day does not", () => {
  const nov = eventsForMonth([salary, rent], [], 2026, 10);
  assert.equal(nov.find((e) => e.id === "salary").date, "2026-11-13");
  assert.equal(nov.find((e) => e.id === "rent").date, "2026-11-15");
});
test("a payday on the 1st that falls on a weekend lands in the month before", () => {
  const first = { ...salary, day: 1 };
  // 1 Nov 2026 is a Sunday: that salary arrives Friday 30 Oct, so it is October's, and November's next one is 1 Dec.
  assert.ok(eventsForMonth([first], [], 2026, 9).some((e) => e.date === "2026-10-30"));
  assert.ok(!eventsForMonth([first], [], 2026, 10).some((e) => e.id === "salary"));
  assert.equal(eventsForMonth([first], [], 2026, 11).find((e) => e.id === "salary").date, "2026-12-01");
});
