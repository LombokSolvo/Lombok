// Builds src/data/cohorts.json: how much groups of S-Pankki customers spend, for Home's "How you compare".
// Usage: node scripts/build-cohorts.mjs   (needs data/s-pankki/, gitignored; no dependencies)
//
// Privacy: only group statistics leave this script (count and deciles per group), never a customer's own rows.
// Groups are by age band, area (city from the first two digits of the postcode, never the full postcode) and
// income band, and a group needs at least MIN_GROUP customers or it is dropped.
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const DATA = process.env.SPANKKI_DATA ?? "data/s-pankki";
const OUT = "src/data/cohorts.json";
const FROM = "2025-10-01"; // the last 12 months of the dataset, same window as the demo customers' summary
const TO = "2026-09-30";
const MIN_GROUP = 100;

// Monthly euros. Matches the categories in src/lib/demo.ts; "everyday" is basket 3.
const METRICS = {
  everyday: ["Groceries", "Restaurants", "Transportation", "Entertainment", "Lifestyle"],
  restaurants: ["Restaurants"],
  groceries: ["Groceries"],
  transport: ["Transportation"],
  bills: ["Utilities"],
  rent: ["Housing"],
};
export const AGE_BANDS = [[18, 24], [25, 34], [35, 44], [45, 54], [55, 64], [65, 200]];
export const INCOME_BANDS = [[0, 2000], [2000, 3000], [3000, 4000], [4000, 5000], [5000, Infinity]];
// Every customer in the dataset lives in the capital region, so "area" is the city.
const AREA = { "00": "Helsinki", "01": "Vantaa", "02": "Espoo" };

const strip = (s) => s.replace(/^﻿/, "");
const people = new Map();
{
  const [head, ...lines] = strip(readFileSync(`${DATA}/tx_customers_junction.csv`, "utf8")).trim().split(/\r?\n/);
  const cols = head.split(",");
  for (const line of lines) {
    const v = line.split(",");
    const r = Object.fromEntries(cols.map((c, i) => [c, v[i]]));
    people.set(r.customer_id, { age: Number(r.customer_age), area: AREA[r.customer_postal_code.slice(0, 2)], cat: {} });
  }
}

const rl = createInterface({ input: createReadStream(`${DATA}/tx_junction_transactions.csv`, "utf8"), crlfDelay: Infinity });
let cols = null;
let iDate, iCat, iAmt;
for await (const raw of rl) {
  const line = strip(raw);
  if (!cols) {
    cols = line.split(",");
    [iDate, iCat, iAmt] = ["tx_date", "category", "tx_amount_eur"].map((c) => cols.indexOf(c));
    continue;
  }
  const v = line.split(",");
  if (v[iDate] < FROM || v[iDate] > TO) continue;
  const p = people.get(v[0]);
  if (!p) continue;
  p.cat[v[iCat]] = (p.cat[v[iCat]] ?? 0) + Number(v[iAmt]);
}

const band = (bands, x) => bands.find(([lo, hi]) => x >= lo && x <= hi);
const ageLabel = ([lo, hi]) => (hi >= 200 ? `${lo}+` : `${lo}–${hi}`);
const incomeLabel = ([lo, hi]) => (hi === Infinity ? `${lo}+` : `${lo}–${hi}`);

const groups = new Map();
const add = (key, label, row) => {
  if (!groups.has(key)) groups.set(key, { label, rows: [] });
  groups.get(key).rows.push(row);
};
for (const p of people.values()) {
  const row = Object.fromEntries(
    Object.entries(METRICS).map(([m, cats]) => [m, -cats.reduce((s, c) => s + (p.cat[c] ?? 0), 0) / 12]),
  );
  const income = (p.cat.Salary ?? 0) / 12;
  add("all", "All customers", row);
  const a = band(AGE_BANDS, p.age);
  if (a) add(`age:${ageLabel(a)}`, `Aged ${ageLabel(a)}`, row);
  if (p.area) add(`area:${p.area}`, `Living in ${p.area}`, row);
  const inc = band(INCOME_BANDS, income);
  if (inc) add(`income:${incomeLabel(inc)}`, `Earning €${incomeLabel(inc)} a month`, row);
}

const deciles = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
    const pos = (d / 10) * (s.length - 1);
    const lo = Math.floor(pos);
    return Math.round(s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo));
  });
};

const cohorts = {};
for (const [key, g] of groups) {
  if (g.rows.length < MIN_GROUP) continue;
  cohorts[key] = {
    label: g.label,
    n: g.rows.length,
    deciles: Object.fromEntries(Object.keys(METRICS).map((m) => [m, deciles(g.rows.map((r) => r[m]))])),
  };
}

writeFileSync(
  OUT,
  JSON.stringify(
    { window: { from: FROM, to: TO }, minGroup: MIN_GROUP, metrics: Object.keys(METRICS), cohorts },
    null,
    1,
  ) + "\n",
);
console.log(`Wrote ${OUT}: ${Object.keys(cohorts).length} groups`, Object.fromEntries(Object.entries(cohorts).map(([k, c]) => [k, c.n])));
