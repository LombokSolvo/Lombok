"use client";

import { ArrowUp, ArrowUpRight, Check, GraduationCap, ReceiptText, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LearnPack } from "@/components/learn/learn-pack";
import { Group, TopBar, eur } from "@/components/solvo/ui";
import { LAST_PAGE_KEY, suggestionsFor, type ChatAction } from "@/lib/chat-actions";
import type { DemoMode } from "@/lib/demo-mode";
import { PACK_IDS, PACK_META, getPack, packFromText, type LearnContext, type PackId } from "@/lib/learn";
import { useLearnProgress } from "@/lib/learn-store";
import type { SpendingResult } from "@/lib/spending";
import { ActionCard, chatState } from "./action-card";

type Msg = {
  role: "user" | "coach";
  text: string;
  checks?: SpendingResult[];
  actions?: ChatAction[]; // cards with a button; nothing happens until the person taps
  source?: "gemini" | "offline";
  ms?: number;
  pack?: PackId; // a learning pack, played inside the chat
};

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const fmtMonth = (iso: string) => monthFmt.format(new Date(`${iso}T00:00:00Z`));

/** A month-by-month answer as small bars, so the trend shows at a glance. */
function MonthBars({ groups }: { groups: SpendingResult["groups"] }) {
  const max = Math.max(...groups.map((g) => g.total), 1);
  return (
    <div className="mt-2">
      <div className="flex h-12 items-end gap-[3px]" aria-hidden>
        {groups.map((g) => (
          <span key={g.key} className="flex-1 rounded-t-[3px] bg-primary/70" style={{ height: `${Math.max(4, (g.total / max) * 100)}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{fmtMonth(`${groups[0].key}-15`)}</span>
        <span>{fmtMonth(`${groups.at(-1)!.key}-15`)}</span>
      </div>
    </div>
  );
}

const isMonthly = (c: SpendingResult) => c.groups.length >= 3 && c.groups.every((g) => /^\d{4}-\d{2}$/.test(g.key));

export function CoachClient({ learn, mode }: { learn: LearnContext; mode: DemoMode }) {
  const [from, setFrom] = useState("/");
  const suggestions = suggestionsFor(from, mode === "aino");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const progress = useLearnProgress();

  function openPack(id: PackId, asked?: string) {
    const p = getPack(id, learn);
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", text: asked ?? `Teach me: ${p.title}` },
      { role: "coach", text: p.intro, pack: id },
    ]);
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const packId = packFromText(q);
    if (packId) return openPack(packId, q);
    const history: Msg[] = [...messages, { role: "user", text: q }];
    setMessages(history);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Learning packs stay in the browser; the coach sees the conversation text and what is already done in the app.
        body: JSON.stringify({
          messages: history.filter((m) => !m.pack).map(({ role, text }) => ({ role, text })),
          state: chatState(mode),
        }),
      });
      const d = await res.json();
      setMessages([
        ...history,
        { role: "coach", text: d.answer ?? "Sorry, something went wrong.", checks: d.checks, actions: d.actions, source: d.source, ms: d.ms },
      ]);
    } catch {
      setMessages([...history, { role: "coach", text: "I couldn't connect. Check your connection and try again." }]);
    } finally {
      setBusy(false);
    }
  }

  // A question can arrive from the home page as /coach?q=..., and a learning pack as /coach?learn=fees.
  // The page stays mounted (hidden) between visits, so the parameter is removed once handled, and the effect
  // runs again each time the page is shown.
  useEffect(() => {
    let last = "/";
    try {
      last = sessionStorage.getItem(LAST_PAGE_KEY) ?? "/";
    } catch {}
    setTimeout(() => setFrom(last), 0);
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const l = params.get("learn") as PackId | null;
    if (!q && !l) return;
    window.history.replaceState(null, "", "/coach");
    if (l && PACK_IDS.includes(l)) setTimeout(() => openPack(l), 0);
    else if (q) setTimeout(() => void ask(q), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  return (
    <main className="flex min-h-dvh flex-1 flex-col">
      <header className="sticky top-0 z-10 bg-background/85 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-xl">
        <TopBar />
      </header>

      <div className="flex flex-1 flex-col gap-3 px-4 pt-3 pb-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col">
            <div className="mt-3 mb-6">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-slab text-mint shadow-[0_10px_24px_-12px_rgba(12,53,36,0.8)]">
                <Sparkles className="size-6" aria-hidden />
              </span>
              <h1 className="mt-4 font-display text-[32px] leading-[1.05] font-semibold tracking-[-0.02em]">Ask Solvo</h1>
              <p className="mt-2 text-[15px] leading-snug text-muted-foreground">
                Answers come from your own S-Pankki transactions. Solvo never moves money without your approval.
              </p>
            </div>
            <Group
              title="Learn with your own numbers"
              aside={`${PACK_IDS.filter((id) => progress.done[id]).length} of ${PACK_IDS.length} done`}
              className="mt-0"
            >
              {PACK_META.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openPack(p.id)}
                  className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left active:bg-muted [&+&]:border-t"
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${progress.done[p.id] ? "bg-primary text-white" : "bg-accent text-primary"}`}
                  >
                    {progress.done[p.id] ? <Check className="size-[18px]" strokeWidth={2.75} aria-hidden /> : <GraduationCap className="size-[18px]" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug font-medium">{p.title}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      {progress.done[p.id] ? "Done. Tap to go through it again" : `${p.minutes} min, a quiz and your own numbers`}
                    </span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              ))}
            </Group>
          </div>
        ) : (
          <h1 className="sr-only">Ask Solvo</h1>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div
              key={i}
              className="ml-12 animate-in fade-in slide-in-from-bottom-2 self-end rounded-[22px] rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-snug text-primary-foreground duration-200"
            >
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className={`flex animate-in fade-in slide-in-from-bottom-2 flex-col gap-2 duration-200 ${m.pack ? "self-stretch [&>div:first-child]:mr-8 [&>div:first-child]:self-start" : "mr-8 self-start"}`}
            >
              <div className="rounded-[22px] rounded-bl-md bg-card px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line shadow-[0_1px_3px_rgba(15,42,31,0.06)]">
                {m.text}
              </div>
              {m.pack && <LearnPack id={m.pack} ctx={learn} onAsk={(q) => void ask(q)} onOpen={(id) => openPack(id)} />}
              {m.checks?.map((c, j) => (
                <div
                  key={j}
                  className="flex items-start gap-2.5 rounded-2xl border border-border/80 bg-card/50 px-3 py-2.5 text-[12px] leading-snug"
                >
                  <ReceiptText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">
                        Checked {c.count} {c.count === 1 ? "transaction" : "transactions"}
                      </span>
                      <span className="num font-semibold">{eur.format(c.total)}</span>
                    </div>
                    <p className="mt-0.5 text-muted-foreground">
                      {c.filter}, {fmtMonth(c.from)} to {fmtMonth(c.to)}
                    </p>
                    {isMonthly(c) && <MonthBars groups={c.groups} />}
                  </div>
                </div>
              ))}
              {m.actions?.map((a, j) => <ActionCard key={j} action={a} mode={mode} />)}
              {m.source && (
                <span className="px-1 text-[11px] text-muted-foreground">
                  {m.source === "gemini"
                    ? `Answered by Gemini in ${((m.ms ?? 0) / 1000).toFixed(1)} s`
                    : "Offline answer, AI unavailable"}
                </span>
              )}
            </div>
          ),
        )}

        {busy && (
          <div
            className="flex h-11 w-[68px] items-center justify-center gap-1 self-start rounded-[22px] rounded-bl-md bg-card shadow-[0_1px_3px_rgba(15,42,31,0.06)]"
            aria-label="Solvo is thinking"
          >
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="size-1.5 animate-bounce rounded-full bg-primary/50"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="sticky bottom-0 z-10 bg-background/85 px-4 pt-2 pb-[calc(0.75rem+var(--tabbar-h))] backdrop-blur-xl"
      >
        {!input && !busy && (
          <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Suggested questions">
            {suggestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void ask(q)}
                className="h-11 shrink-0 rounded-full border border-border/80 bg-card px-4 text-[14px] whitespace-nowrap active:bg-muted"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-full bg-card p-1.5 pl-4 shadow-[0_1px_3px_rgba(15,42,31,0.08),0_8px_24px_-12px_rgba(15,42,31,0.18)] focus-within:ring-2 focus-within:ring-primary/30">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your money"
            aria-label="Ask about your money"
            enterKeyHint="send"
            className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 disabled:bg-muted disabled:text-muted-foreground"
          >
            <ArrowUp className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </form>
    </main>
  );
}
