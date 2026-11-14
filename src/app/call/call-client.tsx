"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, Bell, Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CALL_AUDIO, CALL_SCRIPT, ESCALATION, UNPAID } from "@/data/reminders";
import { ApproveSheet } from "@/app/bills/switch-ui";
import { useLiveWeekly } from "@/components/live-budget";
import { BackLink, Group, PAGE, PageTitle, Row, Slab, TopBar, eur, eur2, primaryButton, secondaryButton } from "@/components/solvo/ui";
import { setBillAction, useBillActions } from "@/lib/switches";

// Solvo's call about the unpaid dentist bill.
//  - Two-way (when the server has ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID): "Answer" starts a live ElevenLabs conversation.
//    The tap is what lets iOS Safari open the microphone and play audio. The browser only ever gets a signed, short-lived URL
//    from /api/call/session; the key stays on the server. The agent starts with today's live numbers (amount, due date as the
//    demo clock shows it, safe-to-spend including approved switches), all from the synthetic demo customer. Its client tools
//    only open the approve sheet, set the Monday reminder or open the coach: every payment still needs the person's own tap.
//  - The recorded message is the fallback ("Can't talk? Play the message instead", or when the call can't start).

const dateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));
// Spoken form for the agent. Intl, so the demo clock shifts it to the date Home shows.
const longFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const spokenEuro = (n: number) => `${Math.round(n)} euros`;

// Transcript lines of the recording, revealed in step with the audio (by share of characters spoken).
const LINES = CALL_SCRIPT.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()) ?? [CALL_SCRIPT];
const STARTS = (() => {
  const total = LINES.reduce((n, l) => n + l.length, 0);
  let acc = 0;
  return LINES.map((l) => {
    const start = acc / total;
    acc += l.length;
    return start;
  });
})();
const FALLBACK_SECONDS = 37;
const SIGNED_URL_MAX_AGE_MS = 10 * 60_000; // ElevenLabs signed URLs live about 15 minutes
const STEP_ICON = { notification: Bell, reminder: AlarmClock, call: Phone } as const;
const COACH_HREF = `/coach?q=${encodeURIComponent(`I can't pay my ${UNPAID.amount} euro dentist bill right now. What can I do?`)}`;

type Stage = "ringing" | "connecting" | "live" | "playing" | "after";
type Line = { role: "user" | "agent"; text: string };
type Session = { endSession: () => Promise<void>; sendUserMessage: (t: string) => void; sendContextualUpdate: (t: string) => void };
type Sdk = typeof import("@elevenlabs/client");

export function CallClient({
  twoWay,
  remaining,
  weeklyBudget,
  irregularPerMonth,
  asOf,
}: {
  twoWay: boolean;
  remaining: number;
  weeklyBudget: number;
  irregularPerMonth: number;
  asOf: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("ringing");
  const [sheet, setSheet] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 of the recording spoken
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const session = useRef<Session | null>(null);
  const sdk = useRef<Promise<Sdk> | null>(null);
  const signed = useRef<{ url: string; at: number } | null>(null);
  const toCoach = useRef(false);
  const done = useBillActions()[UNPAID.id];
  const safe = useLiveWeekly(remaining);
  const budget = useLiveWeekly(weeklyBudget);
  const daysLate = Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${UNPAID.dueDate}T00:00:00Z`)) / 86_400_000);

  async function fetchSignedUrl(): Promise<string> {
    const res = await fetch("/api/call/session", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { signedUrl?: string };
    if (!res.ok || !data.signedUrl) throw new Error("no session");
    signed.current = { url: data.signedUrl, at: Date.now() };
    return data.signedUrl;
  }

  // Load the SDK as soon as the call screen shows (it installs the iOS audio unlock for the Answer tap) and get a signed URL
  // ahead of time, so answering is quick.
  useEffect(() => {
    if (!twoWay) return;
    sdk.current = import("@elevenlabs/client");
    fetchSignedUrl().catch(() => {});
  }, [twoWay]);

  function stopAll() {
    audio.current?.pause();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const s = session.current;
    session.current = null;
    s?.endSession().catch(() => {});
  }

  useEffect(() => () => stopAll(), []);

  function hangUp() {
    stopAll();
    setSpeaking(false);
    if (toCoach.current) {
      router.push(COACH_HREF);
      return;
    }
    setStage("after");
  }

  function startClock() {
    const started = Date.now();
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
  }

  // ---- The recorded message (fallback) ----

  function speakWithPhoneVoice() {
    const synth = window.speechSynthesis;
    const started = Date.now();
    if (synth) {
      const u = new SpeechSynthesisUtterance(CALL_SCRIPT);
      u.lang = "en-US";
      u.onend = () => hangUp();
      synth.speak(u);
    }
    timer.current = setInterval(() => {
      const t = (Date.now() - started) / 1000;
      setSeconds(Math.floor(t));
      setProgress(Math.min(1, t / FALLBACK_SECONDS));
      if (!synth && t > FALLBACK_SECONDS) hangUp();
    }, 250);
  }

  function playMessage() {
    stopAll();
    setNotice(null);
    setStage("playing");
    setProgress(0);
    setSeconds(0);
    const a = new Audio(CALL_AUDIO);
    audio.current = a;
    a.ontimeupdate = () => {
      setSeconds(Math.floor(a.currentTime));
      if (a.duration) setProgress(a.currentTime / a.duration);
    };
    a.onended = () => hangUp();
    // play() must start inside the tap on iOS, which this is.
    a.play().catch(() => speakWithPhoneVoice());
  }

  // ---- The two-way call ----

  const tell = (text: string) => session.current?.sendUserMessage(text);

  async function answer() {
    if (!twoWay) return playMessage();
    setStage("connecting");
    setLines([]);
    setNotice(null);
    toCoach.current = false;
    try {
      const { Conversation } = await (sdk.current ?? (sdk.current = import("@elevenlabs/client")));
      const fresh = signed.current && Date.now() - signed.current.at < SIGNED_URL_MAX_AGE_MS ? signed.current.url : null;
      signed.current = null; // a signed URL starts one conversation
      const signedUrl = fresh ?? (await fetchSignedUrl());
      const conv = await Conversation.startSession({
        signedUrl,
        connectionType: "websocket",
        // Synthetic demo data only, and the same numbers the person sees on Home.
        dynamicVariables: {
          first_name: "Aino",
          supplier: UNPAID.supplier,
          what: UNPAID.what.toLowerCase(),
          amount: spokenEuro(UNPAID.amount),
          reference: UNPAID.reference,
          due_date: longFmt.format(new Date(`${UNPAID.dueDate}T00:00:00Z`)),
          days_late: String(daysLate),
          safe_to_spend: spokenEuro(safe),
          weekly_budget: spokenEuro(budget),
          irregular_pot: spokenEuro(irregularPerMonth),
        },
        clientTools: {
          open_payment_approval: () => {
            setSheet(true);
            return "The approval sheet is now on Aino's screen. Nothing is paid until she taps Approve; you will get a message when she does.";
          },
          set_reminder: () => {
            setBillAction(UNPAID.id, "snoozed");
            return "Done: Solvo reminds her on Monday morning and won't call again about this bill.";
          },
          open_coach: () => {
            // Leave once the agent has said its goodbye (next switch to listening), or after a few seconds at the latest.
            toCoach.current = true;
            setTimeout(() => toCoach.current && hangUp(), 8000);
            return "The coach chat opens when the call ends. Say one short goodbye now.";
          },
        },
        onConnect: () => {
          setStage("live");
          setSeconds(0);
          startClock();
        },
        onMessage: ({ message, role }) => {
          if (message?.trim()) setLines((l) => [...l, { role, text: message.trim() }].slice(-6));
        },
        onModeChange: ({ mode }) => {
          setSpeaking(mode === "speaking");
          if (mode === "listening" && toCoach.current) hangUp();
        },
        onDisconnect: () => {
          if (session.current === conv) {
            session.current = null;
            hangUp();
          }
        },
        onError: (message) => console.warn("call:", message),
      });
      session.current = conv;
    } catch (e) {
      console.warn("call: couldn't start", e instanceof Error ? e.message : e);
      stopAll();
      setStage("ringing");
      setNotice("The live call couldn't start (the microphone may be blocked, or there's no connection). You can play the message instead.");
    }
  }

  function approve() {
    setBillAction(UNPAID.id, "paid");
    setSheet(false);
    if (session.current) tell("[Aino tapped Approve in the app. The payment is approved.]");
  }

  function cancelSheet() {
    setSheet(false);
    session.current?.sendContextualUpdate("Aino closed the approval sheet without paying.");
  }

  function snooze() {
    setBillAction(UNPAID.id, "snoozed");
    if (session.current) tell("[Aino tapped 'Remind me on Monday' in the app.]");
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const outcome = done?.action ?? null;

  const approveSheet = sheet && (
    <div className="text-foreground">
      <ApproveSheet
        title="You approve this payment"
        points={[
          `${eur2.format(UNPAID.amount)} to ${UNPAID.supplier}, reference ${UNPAID.reference}.`,
          "From your S-Pankki account today. Comes from your irregular-costs set-aside, so your safe-to-spend stays the same.",
        ]}
        confirmLabel="Approve payment"
        onConfirm={approve}
        onCancel={cancelSheet}
      />
    </div>
  );

  if (stage !== "after") {
    const recorded = stage === "playing" ? LINES.filter((_, i) => STARTS[i] <= progress + 0.02) : [];
    const shown: Line[] = stage === "playing" ? recorded.map((text) => ({ role: "agent", text })) : lines;
    const status =
      stage === "ringing"
        ? "Your money coach · S-Pankki"
        : stage === "connecting"
          ? "Connecting…"
          : stage === "playing"
            ? `Recorded message · ${mmss}`
            : `${speaking ? "Solvo is speaking" : "Listening"} · ${mmss}`;

    return (
      <main className="flex min-h-dvh flex-col items-center justify-between gap-6 bg-slab px-6 pt-[calc(3rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-white">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="mb-2 rounded-full bg-mint px-3 py-1 text-[12px] font-semibold text-slab">
            Demo call. In real use your phone would ring.
          </p>
          <div
            className={`flex size-24 items-center justify-center rounded-full bg-white transition-shadow ${
              stage === "ringing" || stage === "connecting" ? "animate-pulse" : ""
            } ${speaking ? "shadow-[0_0_0_10px_rgba(255,255,255,0.18)]" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/solvo-logo.png" alt="" className="w-16" />
          </div>
          <p className="text-3xl font-semibold">Solvo</p>
          <p className="text-sm text-white/70" aria-live="polite">
            {status}
          </p>
          <p className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">
            About your dentist bill, {eur.format(UNPAID.amount)}. Not a collection call.
          </p>
        </div>

        {(stage === "live" || stage === "playing") && (
          <div className="flex w-full max-w-sm flex-1 flex-col justify-end gap-2 text-[15px] leading-relaxed" aria-live="polite">
            {shown.map((l, i) => (
              <p
                key={i}
                className={
                  l.role === "user"
                    ? "self-end rounded-2xl bg-white/12 px-3 py-1.5 text-white/85"
                    : i === shown.length - 1
                      ? "text-white"
                      : "text-white/55"
                }
              >
                {l.text}
              </p>
            ))}
          </div>
        )}

        {stage === "live" && (
          <div className="flex w-full max-w-sm flex-col gap-2">
            {outcome === "paid" ? (
              <p className="rounded-2xl bg-white/10 px-4 py-3 text-center text-[14px]">Paid. No reminder fee, and your safe-to-spend stays {eur.format(safe)}.</p>
            ) : outcome === "snoozed" ? (
              <p className="rounded-2xl bg-white/10 px-4 py-3 text-center text-[14px]">Reminder set for Monday morning.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setSheet(true)} className="min-h-12 rounded-2xl bg-mint px-2 text-[13px] font-semibold text-slab active:scale-[0.98]">
                  Pay now
                </button>
                <button type="button" onClick={snooze} className="min-h-12 rounded-2xl bg-white/12 px-2 text-[13px] font-semibold active:bg-white/20">
                  Remind me Monday
                </button>
                <button
                  type="button"
                  onClick={() => tell("I can't pay it right now.")}
                  className="min-h-12 rounded-2xl bg-white/12 px-2 text-[13px] font-semibold active:bg-white/20"
                >
                  I can&apos;t pay now
                </button>
              </div>
            )}
          </div>
        )}

        {stage === "ringing" ? (
          <div className="flex w-full max-w-xs flex-col items-center gap-5">
            {notice && <p className="text-center text-[14px] leading-snug text-white/80">{notice}</p>}
            <div className="flex w-full justify-between">
              <button type="button" onClick={hangUp} className="flex min-h-11 flex-col items-center gap-2 text-sm">
                <span className="flex size-16 items-center justify-center rounded-full bg-red-600 text-2xl" aria-hidden>
                  ✕
                </span>
                Decline
              </button>
              <button type="button" onClick={answer} className="flex min-h-11 flex-col items-center gap-2 text-sm">
                <span className="flex size-16 animate-bounce items-center justify-center rounded-full bg-mint text-2xl text-slab" aria-hidden>
                  📞
                </span>
                Answer
              </button>
            </div>
            {twoWay && (
              <>
                <p className="-mt-2 text-center text-[12px] text-white/55">Answer turns on your microphone so you can talk to Solvo.</p>
                <button type="button" onClick={playMessage} className="min-h-11 text-[14px] font-medium text-white/80 underline underline-offset-4">
                  Can&apos;t talk? Play the message instead
                </button>
              </>
            )}
          </div>
        ) : (
          <button type="button" onClick={hangUp} className="flex min-h-11 flex-col items-center gap-2 text-sm">
            <span className="flex size-16 items-center justify-center rounded-full bg-red-600 text-2xl" aria-hidden>
              ✕
            </span>
            {stage === "connecting" ? "Cancel" : "End call"}
          </button>
        )}

        {approveSheet}
      </main>
    );
  }

  return (
    <main className={PAGE}>
      <TopBar back={<BackLink href="/" label="Home" />} />
      <PageTitle title="Your dentist bill">
        {UNPAID.supplier}, {UNPAID.what.toLowerCase()} on {dayMonth.format(new Date(`${UNPAID.visitDate}T00:00:00Z`))}.
      </PageTitle>

      <Group
        footer="Health costs are in your irregular basket, so paying this doesn't lower your safe-to-spend this week."
        className="mt-0"
      >
        <Row title="Amount" value={eur2.format(UNPAID.amount)} />
        <Row title="Was due" value={fmtDate(UNPAID.dueDate)} />
        <Row title="Reference" value={UNPAID.reference} />
        <Row title="Paid from" value="Irregular costs set-aside" />
      </Group>

      {outcome === "paid" ? (
        <Slab className="mt-6">
          <p className="font-display text-[24px] font-semibold tracking-[-0.015em]">Paid. No reminder fee.</p>
          <p className="mt-2 text-[15px] text-white/70">
            {eur.format(UNPAID.amount)} to {UNPAID.supplier}. Your safe-to-spend this week stays {eur.format(safe)}.
          </p>
          <Link href="/" className="mt-4 inline-flex min-h-11 items-center text-[15px] font-semibold text-mint underline underline-offset-4">
            Back to home
          </Link>
        </Slab>
      ) : outcome === "snoozed" ? (
        <section className="mt-6 rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(15,42,31,0.06)]">
          <p className="text-[15px] font-semibold">OK, Solvo reminds you on Monday morning.</p>
          <p className="mt-1 text-[14px] text-muted-foreground">No more calls about this bill. You can pay any time from Home.</p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={() => setSheet(true)}>
            Pay {eur.format(UNPAID.amount)} now instead
          </button>
          <Link href="/" className={`${secondaryButton} mt-2`}>
            Back to home
          </Link>
        </section>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          <button className={primaryButton} onClick={() => setSheet(true)}>
            Pay {eur.format(UNPAID.amount)} now
          </button>
          <button className={secondaryButton} onClick={snooze}>
            Remind me on Monday
          </button>
          <Link href={COACH_HREF} className={secondaryButton}>
            I can&apos;t pay it right now
          </Link>
          <button type="button" onClick={() => setStage("ringing")} className="mt-1 min-h-11 text-[14px] font-medium text-primary underline underline-offset-4">
            Hear Solvo&apos;s call again
          </button>
        </div>
      )}

      <Group title="How Solvo reminded you" className="mt-6">
        <ol className="flex flex-col gap-2 px-4 py-3 text-[14px]">
          {ESCALATION.map((s) => {
            const Icon = STEP_ICON[s.channel];
            return (
              <li key={s.date} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>
                  <span className="font-medium">
                    {fmtDate(s.date)}: {s.title}
                  </span>
                  <span className="block text-[13px] text-muted-foreground">{s.text}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </Group>
      <p className="mt-3 px-1 text-[13px] leading-snug text-muted-foreground">
        Solvo is your coach, not a collector. Calls are opt-in, and you can turn them off any time.
      </p>

      {sheet && (
        <ApproveSheet
          title="You approve this payment"
          points={[
            `${eur2.format(UNPAID.amount)} to ${UNPAID.supplier}, reference ${UNPAID.reference}.`,
            "From your S-Pankki account today.",
          ]}
          confirmLabel="Approve payment"
          onConfirm={approve}
          onCancel={() => setSheet(false)}
        />
      )}
    </main>
  );
}
