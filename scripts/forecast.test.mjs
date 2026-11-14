// Runnable check for the calendar forecast core (src/lib/forecast.ts). Fictional events only.
// Run: npm test   (node's own test runner; Node strips the TypeScript types itself)
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyChoices, baselinesFrom, classify, forecast, monthTotal, totalWithin, weeklyReserve } from "../src/lib/forecast.ts";

const TODAY = "2026-11-14";
const none = baselinesFrom([]);
const ev = (id, title, start, end = start, extra = {}) => ({ id, title, start, end, allDay: !start.includes("T"), ...extra });

test("a trip is a trip, with the all-day end counted as exclusive", () => {
  const [t] = forecast([ev("a", "Weekend trip to Tallinn", "2026-12-04", "2026-12-07")], none, TODAY, "demo");
  assert.equal(t.kind, "trip");
  assert.equal(t.date, "2026-12-04");
  assert.equal(t.endDate, "2026-12-06");
  assert.equal(t.basis, "default");
  assert.equal(t.amount, 250); // 3 days
  assert.equal(t.detail, undefined, "the event title never travels without keepTitle");
});
test("Finnish words: matka, lento, illallinen, synttärit, häät", () => {
  for (const [title, kind] of [["Matka Roomaan", "trip"], ["Lento Lontooseen", "trip"], ["Illallinen Annan kanssa", "dinner"], ["Mikon synttärit", "birthday"], ["Häät", "wedding"]]) {
    assert.equal(classify(title)?.kind.id, kind, title);
  }
});
test("a dinner uses the person's own restaurant history when there is enough", () => {
  const tx = [20, 25, 30, 35, 40, 60].map((a, i) => ({ date: `2026-0${i + 1}-10`, category: "Restaurants", amount: -a }));
  const b = baselinesFrom(tx);
  const [d] = forecast([ev("d", "Dinner with friends", "2026-11-20T19:00:00+02:00", "2026-11-20T22:00:00+02:00")], b, TODAY, "demo");
  assert.equal(d.basis, "history");
  assert.equal(d.amount, 40); // 75th percentile of the six payments (rounded to 5)
  // too little history falls back to the default and says so
  const [f] = forecast([ev("d", "Dinner", "2026-11-20T19:00:00+02:00", "2026-11-20T22:00:00+02:00")], baselinesFrom(tx.slice(0, 2)), TODAY, "demo");
  assert.equal(f.basis, "default");
  assert.equal(f.amount, 60);
});
test("a usual trip comes from travel payments close together", () => {
  const tx = [
    { date: "2025-06-01", category: "Travel", amount: -200 }, { date: "2025-06-03", category: "Travel", amount: -150 }, // trip 1: 350
    { date: "2026-02-10", category: "Travel", amount: -450 }, // trip 2: 450
  ];
  const b = baselinesFrom(tx);
  assert.equal(b.trip?.n, 2);
  const [t] = forecast([ev("t", "Flight to Berlin", "2026-12-01", "2026-12-02")], b, TODAY, "demo");
  assert.equal(t.basis, "history");
  assert.equal(t.amount, 400);
});
test("no match: meetings, repeating events, work trips, past events, far-away events, look-alike words", () => {
  const items = forecast(
    [
      ev("1", "Team meeting", "2026-11-18T10:00:00+02:00", "2026-11-18T11:00:00+02:00"),
      ev("2", "Lunch", "2026-11-18T12:00:00+02:00", "2026-11-18T13:00:00+02:00", { recurring: true }),
      ev("3", "Business trip to Oslo", "2026-11-20", "2026-11-22"),
      ev("4", "Dinner", "2026-11-10T19:00:00+02:00", "2026-11-10T21:00:00+02:00"),
      ev("5", "Dinner", "2027-03-10T19:00:00+02:00", "2027-03-10T21:00:00+02:00"),
      ev("6", "Public holiday", "2026-11-25"),
      ev("7", "Showroom visit", "2026-11-26T09:00:00+02:00", "2026-11-26T10:00:00+02:00"),
      ev("8", "Doctor", "2026-11-27T09:00:00+02:00", "2026-11-27T10:00:00+02:00"),
    ],
    none, TODAY, "demo",
  );
  assert.deepEqual(items, []);
});
test("a birthday dinner is a birthday with the dinner on top", () => {
  const [b] = forecast([ev("b", "Birthday dinner for Aino", "2026-11-21T19:00:00+02:00", "2026-11-21T22:00:00+02:00")], none, TODAY, "demo", { keepTitle: true });
  assert.equal(b.kind, "birthday");
  assert.equal(b.amount, 110);
  assert.equal(b.detail, "Birthday dinner for Aino");
});
test("choices change the amount and can switch an item off; the reserve spreads over the weeks left", () => {
  const items = forecast([ev("trip", "Holiday", "2026-12-18", "2026-12-21"), ev("din", "Dinner", "2026-11-15T19:00:00+02:00", "2026-11-15T21:00:00+02:00")], none, TODAY, "demo");
  const counted = applyChoices(items, { trip: { amount: 500 } });
  const trip = counted.find((i) => i.id === "trip");
  assert.equal(trip.amount, 500);
  assert.equal(trip.estimate, 250);
  assert.equal(trip.edited, true);
  // dinner tomorrow: all 60 this week. trip in 5 weeks (34 days away): 500/5.
  assert.equal(Math.round(weeklyReserve(counted, TODAY)), 60 + 100);
  const off = applyChoices(items, { din: { dismissed: true } });
  assert.equal(Math.round(weeklyReserve(off, TODAY)), 250 / 5);
  assert.equal(totalWithin(counted, TODAY, 30), 60);
  assert.equal(monthTotal(counted, "2026-12"), 500);
});
