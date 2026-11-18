"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Check, Landmark, Loader2, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { ApproveSheet } from "@/app/bills/switch-ui";
import { Sheet } from "@/components/solvo/sheet";
import { LiveBankRows } from "@/components/live-banks";
import { Group, IconTile } from "@/components/solvo/ui";
import { BANK_INFO, FALLBACK_BANKS, INVESTING_NAMES, readBankNameCookie, simulatedIdFor, writeBankNameCookie, writeBanksCookie, type BankId, type View } from "@/lib/banks";
import { postJson, request } from "@/lib/client-request";
import { LIVE_BANKS, LIVE_BANK_IDS, liveConsentPoints, type LiveBankId } from "@/lib/live-bank-ids";
import { isPersonal } from "@/lib/personal";
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
// The picker's three groups: ordinary banks, neobanks and money apps, and investing. One search field filters the group on screen.
type Group3 = "bank" | "app" | "invest";
type Entry = { key: string; name: string; sub: string | null; group: Group3; live: LiveBankId | null; country: string };
const GROUPS: { id: Group3; label: string }[] = [
  { id: "bank", label: "Banks" },
  { id: "invest", label: "Investing" },
  { id: "app", label: "Other apps" },
];
const groupOf = (kind: string): Group3 => (kind === "Bank" ? "bank" : kind === "Trading platform" ? "invest" : "app");
// Where a name from the plain list belongs when no registry entry says.
const plainGroup = (name: string): Group3 => (INVESTING_NAMES.includes(name) ? "invest" : ["Revolut", "bunq", "N26", "Wise", "Klarna", "PayPal"].includes(name) ? "app" : "bank");
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
  const [tab, setTab] = useState<Group3>("bank");
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
    const id = simulatedIdFor(choice.name);
    if (id === "nordea") {
      writeBankNameCookie(choice.name);
      window.dispatchEvent(new Event(cookieEvent));
    }
    simulate(id);
  };

  // Everything the picker can offer, each in one group. With real banks set up here, the ones in src/lib/live-bank-ids.ts connect for
  // real (marked Real) and the rest are simulated (marked Demo); a real bank that is already connected is not offered again. With the
  // demo-bank list on, the Banks group is Enable Banking's test banks for the chosen country, and the simulated names are not offered.
  const liveActive = !!live?.enabled && !!live.configured;
  const connected = new Set(live?.banks.filter((b) => b.connected).map((b) => b.id));
  const registryNames = new Set<string>(LIVE_BANK_IDS.map((id) => LIVE_BANKS[id].name));
  const liveEntries: Entry[] = LIVE_BANK_IDS.filter((id) => !(liveActive && connected.has(id))).map((id) => ({
    key: id,
    name: LIVE_BANKS[id].name,
    sub: LIVE_BANKS[id].kind,
    group: groupOf(LIVE_BANKS[id].kind),
    live: liveActive ? id : null,
    country: "FI",
  }));
  const listed = lists[country];
  const testBanks: Entry[] = sandbox.enabled && Array.isArray(listed) ? listed.map((b) => ({ key: `${b.country}-${b.name}`, name: b.name, sub: null, group: "bank", live: null, country: b.country })) : [];
  const plainBanks: Entry[] = FALLBACK_BANKS.filter((n) => !registryNames.has(n)).map((n) => ({ key: n, name: n, sub: plainGroup(n) === "invest" ? "Trading platform" : null, group: plainGroup(n), live: null, country: "FI" }));
  // The list only offers what is not connected yet: S-Pankki is the main bank, and an app added before is already in the list above.
  const connectedNames = new Set<string>(["S-Pankki", ...banks.map((b) => (b === "nordea" ? bankName : BANK_INFO[b].name))]);
  // The private deployment offers only real connections.
  const entries: Entry[] = (isPersonal() ? liveEntries : sandbox.enabled ? [...(liveActive ? liveEntries : []), ...testBanks] : [...liveEntries, ...plainBanks]).filter((e) => !connectedNames.has(e.name));
  const q = query.trim().toLowerCase();
  const inGroup = (g: Group3) => entries.filter((e) => e.group === g && e.name.toLowerCase().includes(q));
  const shown = inGroup(tab);
  const loadingTest = sandbox.enabled && tab === "bank" && !listed;
  const testError = sandbox.enabled && tab === "bank" && listed && !Array.isArray(listed) ? listed.error : null;
  const message = sandbox.notice ? NOTICES[sandbox.notice] : null;

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
            "Enable Banking, our connection partner, asks you to continue first. Then you sign in at the bank.",
            "Access lasts 30 days. Disconnect any time.",
          ]
        : [
            "Solvo can see your balances and payments. It can never move money.",
            "You sign in at your bank.",
            "A real connection lasts up to 6 months. Disconnect any time.",
          ],
      label: `Continue to ${choice.name}`,
    };
  })();

  return (
    <>
      <Group title={title}>
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
        {live && <LiveBankRows status={live} />}
        {banks.map((b) => {
          const name = b === "nordea" ? bankName : BANK_INFO[b].name;
          return (
            <div key={b} className="flex min-h-14 items-center gap-3 py-2 pr-2 pl-4 [&+&]:border-t">
              <IconTile><Landmark /></IconTile>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] leading-snug font-medium">{name}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                  <Check className="size-3.5 text-primary" aria-hidden />
                  Connected
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
          {busy === "start" ? "Opening your bank…" : "Add an app"}
        </button>
        {(error || message) && (
          <p role={error ? "alert" : "status"} className={`border-t px-4 py-3 text-[13px] leading-snug ${error ? "text-warn" : "text-muted-foreground"}`}>
            {error ?? message}
          </p>
        )}
      </Group>

      {step === "pick" && (
        <Sheet title="Add an app" onClose={() => setStep("closed")} hideDone>
          <label className="relative mb-3 block">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="h-11 w-full rounded-xl bg-muted/50 pr-3 pl-10 text-[16px] outline-none" />
          </label>

          <div className="mb-3 flex gap-1.5" role="tablist" aria-label="What to connect">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={tab === g.id}
                onClick={() => setTab(g.id)}
                className={`h-10 min-w-0 flex-1 rounded-full px-2 text-[13px] leading-tight font-medium ${tab === g.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {g.label}
                {q && <span className="ml-1 opacity-70">{inGroup(g.id).length}</span>}
              </button>
            ))}
          </div>

          {sandbox.enabled && tab === "bank" && (
            <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Country">
              {COUNTRIES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={country === c} onClick={() => setCountry(c)} className={`h-9 min-w-11 rounded-full px-3 text-[14px] font-medium ${country === c ? "bg-primary/15 text-primary" : "bg-muted"}`}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* About five rows at a time; the rest scrolls. */}
          <div role="tabpanel" className="max-h-[min(18rem,42dvh)] overflow-y-auto overscroll-contain rounded-2xl bg-muted/50">
            {loadingTest && (
              <p role="status" className="flex items-center gap-3 px-4 py-4 text-[15px]">
                <Loader2 className="size-5 animate-spin" aria-hidden />
                Loading banks…
              </p>
            )}
            {testError && <p role="alert" className="px-4 py-4 text-[14px] text-warn">{testError}</p>}
            {!loadingTest && !testError && shown.length === 0 && (
              <p className="px-4 py-4 text-[14px] text-muted-foreground">{q ? "Nothing matches." : "Nothing to connect here."}</p>
            )}
            {shown.map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => {
                  setChoice(e.live ? { kind: "live", bank: e.live } : { kind: "bank", name: e.name, country: e.country });
                  setStep("consent");
                }}
                className={row}
              >
                <IconTile><Landmark /></IconTile>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{e.name}</span>
                  {e.sub && e.sub !== "Bank" && <span className="block text-[13px] leading-snug text-muted-foreground">{e.sub}</span>}
                </span>
                <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground">Add</span>
              </button>
            ))}
          </div>

        </Sheet>
      )}

      {step === "consent" && consent && (
        <ApproveSheet title={consent.title} points={consent.points} confirmLabel={consent.label} onConfirm={confirm} onCancel={() => setStep("pick")} />
      )}

      {step === "waiting" && (
        <Sheet title="Waiting for your bank" onClose={() => {}} hideDone>
          <div className="flex items-center gap-3 py-2 text-[15px]" role="status">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Waiting for your approval…
          </div>
          <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
            Real bank data only works when Solvo runs locally on your own computer. Here the connection is simulated with example data.
          </p>
        </Sheet>
      )}
    </>
  );
}
