// Boils S-Pankki's mortgage application file down to a few numbers for the home card: how many applications, how many were approved,
// the typical price, the typical equity share of approved and of rejected applications, and why the rejected ones were rejected.
// Only totals and medians are written, never a row. The data is the synthetic Junction 2026 challenge dataset.
//
//   node scripts/build-mortgage-stats.mjs        reads data/s-pankki/mtg_tx_customer_link_and_final_mtg_infio.csv
//                                                writes src/data/mortgage-stats.json
import { readFileSync, writeFileSync } from "node:fs";

const file = process.env.MTG_FILE ?? "data/s-pankki/mtg_tx_customer_link_and_final_mtg_infio.csv";
const [head, ...lines] = readFileSync(file, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
const cols = head.split(",");
const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));

const num = (v) => Number(v);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const share = (r) => num(r.final_equity_amount_eur) / num(r.final_property_price_eur);
const approved = rows.filter((r) => r.final_decision === "approved");
const rejected = rows.filter((r) => r.final_decision === "rejected");
const reasons = {};
for (const r of rejected) reasons[r.rejection_reason] = (reasons[r.rejection_reason] ?? 0) + 1;

const out = {
  source: "S-Pankki Junction 2026 challenge dataset (synthetic): mortgage applications and their final outcome",
  applications: rows.length,
  approved: approved.length,
  rejected: rejected.length,
  medianPriceEur: Math.round(median(rows.map((r) => num(r.final_property_price_eur))) / 1000) * 1000,
  approvedEquityShare: Math.round(median(approved.map(share)) * 1000) / 1000,
  rejectedEquityShare: Math.round(median(rejected.map(share)) * 1000) / 1000,
  rejectionReasons: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])),
};
writeFileSync("src/data/mortgage-stats.json", JSON.stringify(out, null, 2) + "\n");
console.log(out);
