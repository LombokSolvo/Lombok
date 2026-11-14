// Checks which spending lines the chat shows against a peer group, on invented figures.
import assert from "node:assert/strict";
import { test } from "node:test";
import { peerCompare } from "../src/lib/peer-compare.ts";
import { followUpsFor, splitSuggestions } from "../src/lib/chat-actions.ts";

const m = (id, you, median) => ({ id, label: id, you, median, pct: 50, deciles: [] });
const group = {
  label: "Aged 25–34",
  n: 658,
  metrics: [m("everyday", 2000, 900), m("restaurants", 500, 160), m("groceries", 400, 380), m("transport", 270, 150), m("bills", 226, 110), m("rent", 900, 700)],
};

test("all shows every line in the group's order", () => {
  assert.deepEqual(peerCompare(group, "all").metrics.map((x) => x.id), ["everyday", "restaurants", "groceries", "transport", "bills", "rent"]);
});

test("above keeps only savable lines clearly above typical, biggest gap first", () => {
  assert.deepEqual(peerCompare(group, "above").metrics.map((x) => x.id), ["restaurants", "transport", "bills"]);
});

test("above is empty when nothing is clearly above typical", () => {
  const calm = { ...group, metrics: [m("restaurants", 170, 160), m("transport", 150, 150)] };
  assert.deepEqual(peerCompare(calm, "above").metrics, []);
});

test("the group's name and size come along", () => {
  const r = peerCompare(group, "above");
  assert.deepEqual([r.label, r.n, r.focus], ["Aged 25–34", 658, "above"]);
});

// The chips offered after an answer.
test("after a plain comparison the chat offers where to save and the other groups, not the group just shown", () => {
  const q = followUpsFor({ compares: [{ label: "Aged 25–34", focus: "all" }] }, []);
  assert.equal(q[0], "Where could I save more?");
  assert.ok(q.includes("Compare me with people in my city"));
  assert.ok(q.includes("Compare me with people on my income"));
});

test("after comparing with a city it does not offer the city again", () => {
  const q = followUpsFor({ compares: [{ label: "Living in Helsinki", focus: "all" }] }, []);
  assert.ok(!q.includes("Compare me with people in my city"));
});

test("after where-to-save it leads to a plan", () => {
  assert.equal(followUpsFor({ compares: [{ label: "Aged 25–34", focus: "above" }] }, [])[0], "Help me save €100 more a month");
});

test("a question already asked is not offered again", () => {
  const q = followUpsFor({ styles: [{}] }, ["how do i compare to others?"]);
  assert.ok(!q.includes("How do I compare to others?"));
});

test("every answer gets follow-ups, so the chat never ends on a dead end", () => {
  assert.ok(followUpsFor({}, []).length >= 3);
  assert.ok(followUpsFor({ checks: [{}] }, []).includes("Where could I save more?"));
  assert.ok(followUpsFor({ actions: [{}] }, []).length >= 3);
});

test("the model's own questions come first, then the ones that follow on", () => {
  const q = followUpsFor({ checks: [{}] }, [], ["Why is groceries so high?", "Can I cut it by 10%?"]);
  assert.deepEqual(q.slice(0, 2), ["Why is groceries so high?", "Can I cut it by 10%?"]);
  assert.equal(q.length, 4);
});

test("the chips never run out: when everything has been asked they come round again", () => {
  const every = ["How do I compare to others?", "Where could I save more?", "What kind of spender am I?", "Can I afford a €50 dinner tonight?", "How much can I spend this week?", "Which subscriptions could I cancel?", "Can I save €3,000 by June?", "What if I cut restaurants by half?", "Am I overpaying for electricity?", "Help me save €100 more a month", "What's coming up this month?", "How long until I have a €3,000 buffer?", "Compare me with people in my city", "Compare me with people on my income", "Compare me with everyone", "Why is groceries so high?"];
  assert.ok(followUpsFor({ compares: [{ label: "Aged 25–34", focus: "all" }] }, every, ["Why is groceries so high?"]).length >= 3);
});

test("the model's last line is split off the answer and the questions come out", () => {
  const r = splitSuggestions("You spend a lot on groceries.\nNEXT: Why is it so high? | Can I cut 10%? | Compare my transport");
  assert.equal(r.answer, "You spend a lot on groceries.");
  assert.deepEqual(r.suggestions, ["Why is it so high?", "Can I cut 10%?", "Compare my transport"]);
});

test("an answer without that line is left as it is", () => {
  assert.deepEqual(splitSuggestions("Just an answer."), { answer: "Just an answer.", suggestions: [] });
});
