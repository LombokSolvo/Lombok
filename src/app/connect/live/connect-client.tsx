"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { BackLink, PAGE, PageTitle, TopBar, primaryButton, secondaryButton } from "@/components/solvo/ui";
import { plainFormat } from "@/lib/demo-clock";

const day = plainFormat({ day: "numeric", month: "long" });

const errors = (bank: string): Record<string, string> => ({
  state: "Couldn't connect. Try again from Profile.",
  declined: `The approval at ${bank} was cancelled, so nothing was connected.`,
  nocode: `${bank} didn't send back an approval. Try again from Profile.`,
  session: `Couldn't connect to ${bank}. Try again from Profile.`,
});

type State = { kind: "working" } | { kind: "done"; transactions: number; accounts: number; asOf: string } | { kind: "error"; message: string };

export function ConnectClient({ bank, bankName, error, hasSession }: { bank: string | null; bankName: string; error: string | null; hasSession: boolean }) {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<State>(() =>
    error ? { kind: "error", message: errors(bankName)[error] ?? errors(bankName).session }
    : hasSession ? { kind: "working" }
    : { kind: "error", message: "Nothing to finish here. Connect a bank from Profile." },
  );

  const run = async () => {
    setState({ kind: "working" });
    try {
      const res = await fetch("/api/live/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setState({ kind: "error", message: typeof data.error === "string" ? data.error : `Something went wrong (${res.status}).` });
      else setState({ kind: "done", transactions: data.transactions, accounts: data.accounts, asOf: data.asOf });
    } catch {
      setState({ kind: "error", message: "Couldn't reach the app. Is it still running?" });
    }
  };

  useEffect(() => {
    // Once only, even when development mode runs effects twice: the single sync call is what downloads the history.
    if (started.current || state.kind !== "working") return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className={PAGE}>
      <TopBar back={<BackLink href="/profile" label="Profile" />} />
      <PageTitle title={state.kind === "done" ? `${bankName} is connected` : state.kind === "error" ? "Not connected" : `Connecting ${bankName}`} />
      {state.kind === "working" && (
        <p role="status" className="flex items-center gap-3 text-[15px]">
          <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
          Approved. Downloading your transactions, this takes a moment…
        </p>
      )}
      {state.kind === "done" && (
        <>
          <p className="flex items-start gap-3 text-[15px] leading-snug">
            <Check className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={2.75} aria-hidden />
            {state.transactions.toLocaleString("en-GB")} transactions from {state.accounts} account{state.accounts === 1 ? "" : "s"}, up to {day(state.asOf)}. Solvo now includes your real {bankName}.
          </p>
          <button type="button" className={`${primaryButton} mt-6`} onClick={() => router.replace("/")}>
            Open Solvo
          </button>
        </>
      )}
      {state.kind === "error" && (
        <>
          <p role="alert" className="flex items-start gap-3 text-[15px] leading-snug">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
            {state.message}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {hasSession && !error && (
              <button type="button" className={primaryButton} onClick={run}>
                Try again
              </button>
            )}
            <button type="button" className={secondaryButton} onClick={() => router.replace("/profile")}>
              Back to Profile
            </button>
          </div>
        </>
      )}
    </main>
  );
}
