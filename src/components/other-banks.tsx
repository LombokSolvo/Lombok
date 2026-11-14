"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Check, Landmark, Loader2, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { ApproveSheet } from "@/app/bills/switch-ui";
import { Sheet } from "@/components/solvo/sheet";
import { Group, IconTile } from "@/components/solvo/ui";
import { FALLBACK_BANKS, readBankNameCookie, writeBankNameCookie, writeBanksCookie, type BankId, type View } from "@/lib/banks";
import { postJson, request } from "@/lib/client-request";
import { LIVE_BANKS, liveBankOf, liveConsentPoints, type LiveBankId } from "@/lib/live-bank-ids";
import type { LiveStatus } from "@/lib/live-banks";

// Other banks: opt-in, never assumed. The picker lists every bank Enable Banking offers, per country, with search, plus the person's
// own banks, neobanks and trading platform on this computer.
//  - With the demo bank connection set up (src/lib/linked-bank.ts): picking a bank is a REAL Enable Banking connection with
//    example data (their sandbox test banks). Read on Home in its own card.
//  - Without it: the list is Finland's banks and connecting is simulated with example data (src/lib/second-bank.ts).
//  - Local only, when real banks are set up (src/lib/live-banks.ts): the person's own accounts at the banks listed in
//    src/lib/live-bank-ids.ts connect for real, in their own section at the top.

type Bank = { name: string; country: string };
type Choice = { kind: "bank"; name: string; country: string } | { kind: "live"; bank: LiveBankId };
type Step = "closed" | "pick" | "consent" | "waiting";
export type SandboxProps = { enabled: boolean; linked: { bank: string; validUntil: string } | null; notice: string | null };

const COUNTRIES = ["FI", "SE", "NO", "DK", "EE", "DE", "NL", "FR"];
const NOTICES: Record<string, string> = {
  connected: "Connected. Your bank now shows on Home.",
  declined: "The approval was cancelled, so nothing was connected.",
  failed: "That connection didn't finish. Try again.",
};

// The simulated bank's name lives in a cookie. Read it without a flash: the default on the server, the choice in the browser.
const cookieEvent = "solvo-cookie";
const subscribeCookie = (cb: () => void) => {
  window.addEventListener(cookieEvent, cb);
  return () => window.removeEventListener(cookieEvent, cb);
};
const useBankName = () => useSyncExternalStore(subscribeCookie, readBankNameCookie, () => "Nordea");

const row = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left [&+&]:border-t";
const action = `${row} font-medium text-primary disabled:opacity-50`;

export function OtherBanks({
  banks,
  view,
  title = "Other banks",
  sandbox = { enabled: false, linked: null, notice: null },
  live,
  mainBank = false,
}: {
  mainBank?: boolean; // show S-Pankki itself as the connected main bank (Profile)
  banks: BankId[];
  view: View;
  compact?: boolean;
  title?: string;
  sandbox?: SandboxProps;
  live?: LiveStatus;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [country, setCountry] = useState("FI");
  const [query, setQuery] = useState("");
  const [lists, setLists] = useState<Record<string, Bank[] | { error: string }>>({});
  const [busy, setBusy] = useState<null | "start" | "sync" | "disconnect">(null);
  const [error, setError] = useState<string | null>(null);
  const bankName = useBankName();

  const wantsList = step === "pick" && sandbox.enabled && !lists[country];
  useEffect(() => {
    if (!wantsList) return;
    let live = true;
    void request(`/api/banks?country=${country}`).then((r) => {
      if (live) setLists((l) => ({ ...l, [country]: r.ok ? (r.data.banks as Bank[]) : { error: r.error } }));
    });
    return () => {
      live = false;
    };
  }, [wantsList, country]);

  const save = (next: BankId[]) => {
    writeBanksCookie(next, view);
    router.refresh();
  };
  const simulate = (bank: BankId) => {
    setStep("waiting");
    window.setTimeout(() => {
      save([...new Set([...banks, bank])]);
      setStep("closed");
    }, 1600);
  };
  const go = async (path: string, body?: unknown) => {
    setStep("closed");
    setBusy("start");
    setError(null);
    const r = await postJson(path, body);
    if (r.ok && typeof r.data.url === "string") {
      window.location.assign(r.data.url); // the bank's own approval page
      return;
    }
    setError(r.ok ? "The bank didn't return an approval address." : r.error);
    setBusy(null);
  };
  const act = async (kind: "sync" | "disconnect") => {
    setBusy(kind);
    setError(null);
    const r = await request(`/api/banks/${kind}`, { method: "POST" });
    if (!r.ok) setError(r.error);
    else router.refresh();
    setBusy(null);
  };
  const confirm = () => {
    if (!choice) return;
    if (choice.kind === "live") return void go("/api/live/start", { bank: choice.bank });
    if (sandbox.enabled) return void go("/api/banks/start", { bank: choice.name, country: choice.country });
    writeBankNameCookie(choice.name);
    window.dispatchEvent(new Event(cookieEvent));
    simulate("nordea");
  };

  // The real banks not yet connected get their own section at the top. In the plain Finland list (no demo-bank list) those names are left
  // out, so no bank appears twice, once real and once simulated.
  const liveOpen = live && live.enabled && live.configured ? live.banks.filter((b) => !b.connected).map((b) => b.id) : [];
  const hideLive = !sandbox.enabled && !!live?.enabled && live.configured;
  const list = sandbox.enabled ? lists[country] : FALLBACK_BANKS.map((name): Bank => ({ name, country: "FI" }));
  const shown = Array.isArray(list) ? list.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()) && !(hideLive && liveBankOf(b.name, b.country))) : [];
  const message = sandbox.notice ? NOTICES[sandbox.notice] : null;

  const footer = sandbox.enabled
    ? "Demo: Enable Banking's test banks with example data."
    : "Demo: connecting is simulated and uses example data.";

  const consent = (() => {
    if (!choice) return null;
    if (choice.kind === "live")
      return {
        title: `Connect your ${LIVE_BANKS[choice.bank].name}`,
        points: liveConsentPoints(choice.bank),
        label: `Continue to ${LIVE_BANKS[choice.bank].name}`,
      };
    return {
      title: `Connect ${choice.name}`,
      points: sandbox.enabled
        ? [
            "Solvo can see your balances and payments. It can never move money.",
            "You sign in at the bank. Before that, Enable Banking, which connects Solvo to the bank, asks you to continue.",
            "This is a test bank with example data.",
            "Access lasts 30 days. Disconnect any time.",
          ]
        : [
            "Solvo can see your balances and payments. It can never move money.",
            "You sign in at your bank.",
            "Demo: nothing real is connected. Example data is shown.",
            "A real connection lasts up to 6 months. Disconnect any time.",
          ],
      label: `Continue to ${choice.name}`,
    };
  })();

  return (
    <>
      <Group title={title} footer={footer}>
        {mainBank && (
          <div className={row}>
            <IconTile><Landmark /></IconTile>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] leading-snug font-medium">S-Pankki</div>
              <div className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                <Check className="size-3.5 text-primary" aria-hidden />
                Connected, your main bank
              </div>
            </div>
          </div>
        )}
        {banks.map((b) => {
          const name = bankName;
          return (
            <div key={b} className="flex min-h-14 items-center gap-3 py-2 pr-2 pl-4 [&+&]:border-t">
              <IconTile><Landmark /></IconTile>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] leading-snug font-medium">{name}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                  <Check className="size-3.5 text-primary" aria-hidden />
                  Connected, example data
                </div>
              </div>
              <button type="button" aria-label={`Remove ${name}`} onClick={() => save(banks.filter((x) => x !== b))} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
        {sandbox.linked && (
          <>
            <div className={`${row} justify-between`}>
              <IconTile><Landmark /></IconTile>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] leading-snug font-medium">{sandbox.linked.bank} connected</div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">Example data via Enable Banking</div>
              </div>
            </div>
            <button type="button" className={action} onClick={() => act("sync")} disabled={busy !== null}>
              <IconTile>{busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}</IconTile>
              {busy === "sync" ? "Reading…" : "Sync now"}
            </button>
            <button type="button" className={action} onClick={() => act("disconnect")} disabled={busy !== null}>
              <IconTile tone="grey">{busy === "disconnect" ? <Loader2 className="animate-spin" /> : <Trash2 />}</IconTile>
              Disconnect
            </button>
          </>
        )}
        <button type="button" onClick={() => { setError(null); setQuery(""); setStep("pick"); }} disabled={busy !== null} className={action}>
          <IconTile>{busy === "start" ? <Loader2 className="animate-spin" /> : <Plus />}</IconTile>
          {busy === "start" ? "Opening your bank…" : "Add another bank"}
        </button>
        {(error || message) && (
          <p role={error ? "alert" : "status"} className={`border-t px-4 py-3 text-[13px] leading-snug ${error ? "text-warn" : "text-muted-foreground"}`}>
            {error ?? message}
          </p>
        )}
      </Group>

      {step === "pick" && (
        <Sheet title="Add a bank" onClose={() => setStep("closed")} hideDone>
          {liveOpen.length > 0 && (
            <>
              <h3 className="mb-2 text-[13px] font-medium text-muted-foreground">Your own accounts</h3>
              <div className="mb-5 overflow-hidden rounded-2xl bg-muted/50">
                {liveOpen.map((id) => (
                  <button key={id} type="button" onClick={() => { setChoice({ kind: "live", bank: id }); setStep("consent"); }} className={row}>
                    <IconTile><Landmark /></IconTile>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{LIVE_BANKS[id].name}</span>
                      <span className="block text-[13px] leading-snug text-muted-foreground">{LIVE_BANKS[id].kind}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          <h3 className="mb-2 text-[13px] font-medium text-muted-foreground">Banks</h3>
          {sandbox.enabled && (
            <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Country">
              {COUNTRIES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={country === c} onClick={() => setCountry(c)} className={`h-9 min-w-11 rounded-full px-3 text-[14px] font-medium ${country === c ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <label className="relative mb-2 block">
            <span className="sr-only">Search banks</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search banks" className="h-11 w-full rounded-xl bg-muted/50 pr-3 pl-10 text-[16px] outline-none" />
          </label>
          <div className="max-h-[34dvh] overflow-y-auto overscroll-contain rounded-2xl bg-muted/50">
            {sandbox.enabled && !list && (
              <p role="status" className="flex items-center gap-3 px-4 py-4 text-[15px]">
                <Loader2 className="size-5 animate-spin" aria-hidden />
                Loading banks…
              </p>
            )}
            {list && !Array.isArray(list) && <p role="alert" className="px-4 py-4 text-[14px] text-warn">{list.error}</p>}
            {Array.isArray(list) && shown.length === 0 && <p className="px-4 py-4 text-[14px] text-muted-foreground">No bank matches.</p>}
            {shown.map((b) => {
              return (
                <button key={`${b.country}-${b.name}`} type="button" onClick={() => { setChoice({ kind: "bank", name: b.name, country: b.country }); setStep("consent"); }} className={row}>
                  <IconTile><Landmark /></IconTile>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{b.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
            {sandbox.enabled ? "These are Enable Banking's test banks. In production the list is your real banks." : hideLive ? "Finland's banks on Enable Banking. These are simulated: only your own accounts above connect for real." : "Finland's banks on Enable Banking. Demo: connecting is simulated."}
          </p>

        </Sheet>
      )}

      {step === "consent" && consent && (
        <ApproveSheet title={consent.title} points={consent.points} confirmLabel={consent.label} onConfirm={confirm} onCancel={() => setStep("pick")} />
      )}

      {step === "waiting" && (
        <Sheet title="Waiting for your bank" onClose={() => {}} hideDone>
          <div className="flex items-center gap-3 py-2 text-[15px]" role="status">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Waiting for your approval… (demo: approved automatically)
          </div>
        </Sheet>
      )}
    </>
  );
}
