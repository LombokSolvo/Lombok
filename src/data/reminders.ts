// An unpaid e-invoice for the demo customer, and how Solvo escalates before it becomes a problem:
// notification, then a reminder on the due day, then a friendly voice call (opt-in) a few days later.
// Solvo is a coach, not a collector: it never charges fees and the user approves every payment.
// All names and ids are fictional.

export type UnpaidBill = {
  id: string;
  supplier: string;
  what: string;
  amount: number; // EUR
  dueDate: string; // YYYY-MM-DD
  basket: 1 | 2 | 3; // which budget it comes from
  reference: string;
  iban: string;
};

export const UNPAID: UnpaidBill = {
  id: "dentist-2026-09",
  supplier: "Hymy Hammasklinikka Oy",
  what: "Dental check-up and filling, 9 Sept",
  amount: 148,
  dueDate: "2026-09-25",
  basket: 2,
  reference: "RF18 0000 2026 0914 8",
  iban: "FI00 0000 0000 0000 00",
};

export type EscalationStep = {
  date: string;
  channel: "notification" | "reminder" | "call";
  title: string;
  text: string;
};

export const ESCALATION: EscalationStep[] = [
  {
    date: "2026-09-22",
    channel: "notification",
    title: "Bill due in 3 days",
    text: "Hymy Hammasklinikka, €148. Tap to pay or schedule it.",
  },
  {
    date: "2026-09-25",
    channel: "reminder",
    title: "Due today",
    text: "Your dentist bill is due today. Paying now keeps it simple.",
  },
  {
    date: "2026-09-30",
    channel: "call",
    title: "Solvo calls you",
    text: "Still open after 5 days. A short, friendly call before a reminder fee is added. You turned calls on.",
  },
];

// Spoken by ElevenLabs (voice "Emily", eleven_v4) from this script by /api/call/audio. It is the fallback when the two-way call can't start
// ("Can't talk? Play the message instead"), so it names no weekday, date or safe-to-spend amount: those move with the demo clock
// and the person's switches, and a recording can't. "Five days ago" stays true because the call always happens on the demo's
// "today", five days after the due date (see ESCALATION).
export const CALL_AUDIO = "/api/call/audio";
export const CALL_VOICE_ID = "zHGX9VSXpW8cGSDRCqy0"; // ElevenLabs "Emily: Trustworthy, Warm, Conversational"
export const CALL_SCRIPT =
  "Hi Aino, it's Solvo, your money coach from S-Pankki. Don't worry, this isn't a collection call. Your dentist bill from Hymy Hammasklinikka, 148 euros, was due five days ago and it's still open. If you pay it in the next few days, you won't get a reminder fee. And good news: it comes out of the money you've set aside for irregular costs, so your safe to spend this week stays exactly the same. After this message you can pay it, ask me to remind you on Monday, or tell me if now isn't a good time. You'll approve everything yourself in the app, as always. Talk soon!";
