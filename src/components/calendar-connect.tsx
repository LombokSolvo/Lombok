"use client";

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarDays, Check, ChevronRight, FileUp, Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { ApproveSheet } from "@/app/bills/switch-ui";
import { BrandLogo, BrandTile, ConnectOverlay, useStages } from "@/components/connect-motion";
import { CategoryIcon, useForecast } from "@/components/forecast-ui";
import { SignedAmount } from "@/components/solvo/money-badge";
import { Sheet } from "@/components/solvo/sheet";
import { Group, IconTile, Row, primaryButton, secondaryButton } from "@/components/solvo/ui";
import { clearCalendarFile, saveCalendarFile, useCalendarFile } from "@/lib/calendar-file-store";
import { postJson, request } from "@/lib/client-request";
import { plainFormat } from "@/lib/demo-clock";
import { eventDays, forecast, spendingEvents, type Baselines, type ForecastCategory, type ForecastItem } from "@/lib/forecast";
import { resetForecast } from "@/lib/forecast-store";
import type { GoogleStatus } from "@/lib/google-calendar";
import { parseIcs } from "@/lib/ics";
import type { LinkStatus } from "@/lib/ics-link";

// Profile > Calendar: the calendar Solvo reads to foresee trips and dinners and budget for them. Opt-in, never assumed. Three ways in:
//  - Calendar file (.ics), everywhere: read in the browser and never uploaded. The public app offers it too, because nothing leaves the phone.
//  - Calendar link (Google, iCloud, Outlook), LOCAL ONLY: the server fetches it (src/lib/ics-link.ts).
//  - Google Calendar sign-in, LOCAL ONLY (SOLVO_GOOGLE=1, src/lib/google-calendar.ts).
// There is no simulated calendar: nothing is shown until the person connects a real one.
// The type imports above are erased at build time, so no server code reaches the browser.

const day = plainFormat({ day: "numeric", month: "short" });
const shortDay = plainFormat({ weekday: "short", day: "numeric", month: "short" });
const WINDOW_DAYS = 45;
const MAX_FILE_BYTES = 5_000_000;

const NOTICES: Record<string, string> = {
  connected: "Connected. Your upcoming expenses are now part of your forecast.",
  declined: "The approval was cancelled, so nothing was connected.",
  failed: "That connection didn't finish. Try again.",
  state: "Couldn't connect. Try again.",
};

const action = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left font-medium text-primary disabled:opacity-50 [&+&]:border-t";

type Sheets = null | "pick" | "file" | "link" | "google";
type Preview = { label: string; date: string; amount: number; title?: string; category: ForecastCategory };

/** One way in, as a big tappable card in the picker. */
function Choice({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[68px] w-full items-center gap-3 rounded-2xl bg-muted/60 px-3.5 py-3 text-left active:bg-muted">
      <IconTile>{icon}</IconTile>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug font-semibold">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/** `from` says which page Google should send the person back to: Profile (default) or the first-run setup. */
export function CalendarConnect({ google, link, notice, from }: { google: GoogleStatus; link: LinkStatus; notice: string | null; from?: "onboarding" }) {
  const router = useRouter();
  const { mode, items, today, baselines } = useForecast();
  const file = useCalendarFile();
  const [sheet, setSheet] = useState<Sheets>(null);
  const [busy, setBusy] = useState<null | "connect" | "sync" | "disconnect">(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const counted = items.filter((i) => i.counted).length;
  const googleHere = google.enabled && google.connected;
  const spin = <Loader2 className="animate-spin" />;

  const [opening, setOpening] = useState(false);
  const openDone = useStages(2, { running: opening, finished: false });
  // Back from Google: play the connected moment once, then tidy the address so a reload doesn't play it again.
  const [welcome, setWelcome] = useState(notice === "connected" && googleHere);
  const welcomeStages = ["Approved at Google", `Reading the next ${WINDOW_DAYS} days`, `${google.events} upcoming ${google.events === 1 ? "event" : "events"} found`];
  const welcomeDone = useStages(welcomeStages.length, { running: welcome, stepMs: 650 });
  useEffect(() => {
    if (!welcome || welcomeDone < welcomeStages.length) return;
    const t = window.setTimeout(() => {
      setWelcome(false);
      window.history.replaceState(null, "", window.location.pathname);
      document.getElementById("calendar")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 1600);
    return () => window.clearTimeout(t);
  }, [welcome, welcomeDone, welcomeStages.length]);

  const connectGoogle = async () => {
    setSheet(null);
    setBusy("connect");
    setError(null);
    setOpening(true);
    const began = Date.now();
    const r = await postJson("/api/google/start", { from });
    if (r.ok && typeof r.data.url === "string") {
      const url = r.data.url;
      // Google's own page: the person approves there with their own login. Held a moment so the hand-over reads as one motion.
      window.setTimeout(() => window.location.assign(url), Math.max(0, 1400 - (Date.now() - began)));
      return;
    }
    setOpening(false);
    setError(r.ok ? "Google gave no address to continue." : r.error);
    setBusy(null);
  };
  const run = async (what: "google" | "link", kind: "sync" | "disconnect") => {
    const path = what === "google" ? `/api/google/${kind}` : `/api/calendar/link${kind === "sync" ? "/sync" : "/disconnect"}`;
    if (kind === "disconnect" && !window.confirm(what === "google" ? "Disconnect Google Calendar?" : "Disconnect the calendar link?")) return;
    setBusy(kind);
    setError(null);
    const r = await request(path, { method: "POST" });
    if (!r.ok) setError(r.error);
    else {
      if (kind === "disconnect") resetForecast();
      router.refresh();
    }
    setBusy(null);
  };
  const removeFile = () => {
    clearCalendarFile();
    resetForecast();
    setFlash(null);
  };

  return (
    <div id="calendar" className="scroll-mt-4">
      <Group title="Calendar">
        {(flash || (notice && NOTICES[notice])) && (
          <p role="status" className="flex items-start gap-2 border-b bg-accent/60 px-4 py-3 text-[13px] leading-snug">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.75} aria-hidden />
            {flash ?? NOTICES[notice as string]}
          </p>
        )}

        {/* Nothing connected: an invitation, not a bare row. */}
        {!mode && !googleHere && (
          <div className="p-4">
            <div className="flex items-start gap-3">
              <IconTile>
                <CalendarClock />
              </IconTile>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[19px] leading-tight font-semibold tracking-[-0.01em]">Budget for what is coming</p>
                <p className="mt-1.5 text-[14px] leading-snug text-muted-foreground">
                  Solvo spots your upcoming expenses in your calendar and takes them into account in your financial forecast.
                </p>
              </div>
            </div>
            <button type="button" className={`${primaryButton} mt-4`} onClick={() => setSheet("pick")}>
              Connect calendar
            </button>
          </div>
        )}

        {/* Connected: calendar file */}
        {mode === "file" && file && (
          <>
            <Row
              icon={<IconTile><FileUp /></IconTile>}
              title="Calendar file"
              subtitle={`${file.name} · ${counted} ${counted === 1 ? "expense" : "expenses"} · added ${day(file.importedAt.slice(0, 10))}`}
            />
            <button type="button" className={action} onClick={() => setSheet("file")}>
              <IconTile><RefreshCw /></IconTile>
              Choose a different file
            </button>
            <button type="button" className={action} onClick={removeFile}>
              <IconTile tone="grey"><Trash2 /></IconTile>
              Remove the file
            </button>
          </>
        )}

        {/* Connected: calendar link (local) */}
        {mode === "link" && (
          <>
            <Row
              icon={<IconTile><Link2 /></IconTile>}
              title="Calendar link"
              subtitle={`${counted} upcoming ${counted === 1 ? "expense" : "expenses"}${link.syncedAt ? ` · ${day(link.syncedAt.slice(0, 10))}` : ""}`}
            />
            <button type="button" className={action} onClick={() => run("link", "sync")} disabled={busy !== null}>
              <IconTile>{busy === "sync" ? spin : <RefreshCw />}</IconTile>
              {busy === "sync" ? "Reading…" : "Refresh"}
            </button>
            <button type="button" className={action} onClick={() => run("link", "disconnect")} disabled={busy !== null}>
              <IconTile tone="grey">{busy === "disconnect" ? spin : <Trash2 />}</IconTile>
              Disconnect and delete
            </button>
          </>
        )}

        {/* Connected: Google Calendar (local) */}
        {googleHere && (
          <>
            <Row
              icon={google.reconnect ? <IconTile tone="warn"><CalendarDays /></IconTile> : <BrandTile brand="google-calendar" />}
              title={google.reconnect ? "Google Calendar needs approval again" : "Google Calendar connected"}
              subtitle={
                google.reconnect
                  ? "Google ended the connection. Connect again."
                  : `${google.events} upcoming ${google.events === 1 ? "event" : "events"} read${google.syncedAt ? `, ${day(google.syncedAt.slice(0, 10))}` : ""}. Read-only.`
              }
            />
            {google.reconnect ? (
              <button type="button" className={action} onClick={() => setSheet("google")} disabled={busy !== null}>
                <IconTile>{busy === "connect" ? spin : <CalendarDays />}</IconTile>
                Connect again
              </button>
            ) : (
              <button type="button" className={action} onClick={() => run("google", "sync")} disabled={busy !== null}>
                <IconTile>{busy === "sync" ? spin : <RefreshCw />}</IconTile>
                {busy === "sync" ? "Reading…" : "Refresh"}
              </button>
            )}
            <button type="button" className={action} onClick={() => run("google", "disconnect")} disabled={busy !== null}>
              <IconTile tone="grey">{busy === "disconnect" ? spin : <Trash2 />}</IconTile>
              Disconnect and delete
            </button>
          </>
        )}

        {error && (
          <p role="alert" className="border-t px-4 py-3 text-[13px] leading-snug text-warn">
            {error}
          </p>
        )}
      </Group>

      {opening && <ConnectOverlay brand="google-calendar" title="Connecting Google Calendar" doneTitle="Connecting Google Calendar" stages={["Secure connection opened", "Opening Google sign-in"]} done={openDone} />}
      {welcome && <ConnectOverlay brand="google-calendar" title="Connecting Google Calendar" doneTitle="Google Calendar connected" stages={welcomeStages} done={welcomeDone} />}

      {sheet === "pick" && (
        <Sheet title="Connect a calendar" onClose={() => setSheet(null)} hideDone>
          <div className="flex flex-col gap-2.5">
            <Choice icon={<FileUp />} title="Calendar file" sub="Export a .ics file from Google, Apple or Outlook and choose it." onClick={() => setSheet("file")} />
            {link.available && <Choice icon={<Link2 />} title="Calendar link" sub="Paste your calendar's private link from Google, iCloud or Outlook." onClick={() => setSheet("link")} />}
            {google.enabled && google.configured && <Choice icon={<BrandLogo brand="google-calendar" className="size-6" />} title="Google Calendar" sub="Sign in with Google and approve read-only access." onClick={() => setSheet("google")} />}
            {google.enabled && !google.configured && <Row icon={<IconTile tone="warn"><CalendarDays /></IconTile>} title="Google sign-in needs setup" subtitle="Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local. Steps are at the top of src/lib/google-calendar.ts." className="rounded-2xl bg-muted/40" />}
          </div>
        </Sheet>
      )}

      {sheet === "file" && (
        <FileSheet
          today={today}
          baselines={baselines}
          onClose={() => setSheet(null)}
          onAdded={(n) => {
            setSheet(null);
            setFlash(n ? `Added ${n} ${n === 1 ? "expense" : "expenses"} to your forecast.` : "No upcoming expenses found.");
          }}
        />
      )}
      {sheet === "link" && (
        <LinkSheet
          onClose={() => setSheet(null)}
          onDone={(n) => {
            setSheet(null);
            setFlash(n ? `Connected. ${n} ${n === 1 ? "expense" : "expenses"} added to your forecast.` : "Connected. No upcoming expenses found yet.");
            router.refresh();
          }}
        />
      )}
      {sheet === "google" && (
        <ApproveSheet
          title="Connect Google Calendar"
          points={[
            "Solvo reads your events for the next 45 days. It can't change anything.",
            "You approve at Google with your own login. Solvo never sees your password.",
            "You can disconnect any time.",
          ]}
          confirmLabel="Continue to Google"
          onConfirm={connectGoogle}
          onCancel={() => setSheet("pick")}
        />
      )}
    </div>
  );
}

/** What the person is about to add: found, how many look like spending, and each of those with its estimate. */
function PreviewList({ found, items }: { found: number; items: Preview[] }) {
  return (
    <div>
      <p className="font-display text-[22px] leading-tight font-semibold tracking-[-0.015em]">
        {items.length ? `${items.length} upcoming ${items.length === 1 ? "expense" : "expenses"} found` : "No upcoming expenses found"}
      </p>
      <p className="mt-1 text-[14px] text-muted-foreground">
        Solvo read {found} {found === 1 ? "event" : "events"} in the next {WINDOW_DAYS} days.
      </p>
      {items.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl bg-muted/50">
          {items.map((i, n) => (
            <div key={`${i.date}-${n}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 [&+&]:border-t">
              <CategoryIcon category={i.category} />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] leading-snug font-medium">{i.title ?? i.label}</div>
                <div className="truncate text-[13px] text-muted-foreground">
                  {i.title ? `${i.label} · ` : ""}
                  {shortDay(i.date)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <SignedAmount kind="out" value={i.amount} estimate />
                <div className="text-[11px] text-muted-foreground">estimate</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
        {items.length ? "You can change or switch off each one later." : "Solvo looks for upcoming expenses."}
      </p>
    </div>
  );
}

const toPreview = (items: ForecastItem[]): Preview[] => items.map((i) => ({ label: i.label, date: i.date, amount: i.amount, title: i.detail, category: i.category }));

/** Choose a .ics file (or try a sample). Read in this browser with FileReader semantics: it is never sent anywhere. */
function FileSheet({ today, baselines, onClose, onAdded }: { today: string; baselines: Baselines; onClose: () => void; onAdded: (n: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ step: "pick" } | { step: "reading" } | { step: "preview"; name: string; found: number; kept: ReturnType<typeof spendingEvents>; items: ForecastItem[] }>({ step: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const read = (text: string, name: string) => {
    const events = parseIcs(text);
    if (!events.length && !/BEGIN:VCALENDAR/.test(text)) {
      setError("That isn't a calendar file. Choose a .ics file.");
      setState({ step: "pick" });
      return;
    }
    const until = new Date(Date.parse(`${today}T00:00:00Z`) + WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    const found = events.filter((e) => {
      const { first } = eventDays(e);
      return first >= today && first <= until;
    }).length;
    const kept = spendingEvents(events, today, WINDOW_DAYS);
    setError(null);
    setState({ step: "preview", name, found, kept, items: forecast(kept, baselines, today, "file", { keepTitle: true, horizonDays: WINDOW_DAYS }) });
  };
  const pickFile = async (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setError("That file is over 5 MB. Export only the next few months and try again.");
      return;
    }
    setState({ step: "reading" });
    try {
      read(await f.text(), f.name);
    } catch {
      setError("Couldn't read that file. Try another one.");
      setState({ step: "pick" });
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void pickFile(e.dataTransfer.files?.[0]);
  };

  if (state.step === "preview") {
    const { name, found, kept, items } = state;
    return (
      <Sheet title="Your calendar file" onClose={onClose} hideDone>
        <PreviewList found={found} items={toPreview(items)} />
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              saveCalendarFile({ name, importedAt: new Date().toISOString(), found, events: kept });
              onAdded(items.length);
            }}
          >
            {items.length ? "Add to my budget" : "Done"}
          </button>
          <button type="button" className={secondaryButton} onClick={() => setState({ step: "pick" })}>
            Choose a different file
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Choose a calendar file" onClose={onClose} hideDone>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-6 py-8 text-center transition-colors ${over ? "border-primary bg-accent" : "border-primary/30 bg-accent/40"} active:bg-accent`}
      >
        {state.step === "reading" ? <Loader2 className="size-8 animate-spin text-primary" aria-hidden /> : <FileUp className="size-8 text-primary" aria-hidden />}
        <span className="text-[16px] font-semibold">{state.step === "reading" ? "Reading…" : "Choose a .ics file"}</span>
        <span className="text-[13px] leading-snug text-muted-foreground">From Google Calendar, Apple Calendar or Outlook.</span>
        <input ref={input} type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0])} />
      </label>

      {error && (
        <p role="alert" className="mt-3 text-[13px] leading-snug text-warn">
          {error}
        </p>
      )}

      <details className="mt-4 rounded-2xl bg-muted/50 px-4">
        <summary className="flex min-h-12 cursor-pointer items-center text-[14px] font-medium">How do I get a file?</summary>
        <ul className="flex flex-col gap-2 pb-4 text-[13px] leading-snug text-muted-foreground">
          <li>
            <b className="font-semibold text-foreground">Google Calendar:</b> on a computer, calendar.google.com, Settings, Import &amp; export, Export. Unzip it and choose the .ics inside.
          </li>
          <li>
            <b className="font-semibold text-foreground">Apple Calendar:</b> on a Mac, File, Export, Export…
          </li>
          <li>
            <b className="font-semibold text-foreground">Outlook:</b> Calendar, Save calendar (or Publish calendar and use the link on a computer).
          </li>
        </ul>
      </details>

    </Sheet>
  );
}

/** Paste a calendar link. The server reads it (local only) and answers with a count and generic previews, never titles. */
function LinkSheet({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ found: number; preview: Preview[] } | null>(null);

  const paste = async () => {
    try {
      setUrl((await navigator.clipboard.readText()).trim());
    } catch {
      setError("Couldn't read the clipboard. Paste the link into the box instead.");
    }
  };
  const connect = async () => {
    setBusy(true);
    setError(null);
    const r = await postJson("/api/calendar/link", { url });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setResult({ found: Number(r.data.found ?? 0), preview: (r.data.preview as Preview[]) ?? [] });
  };

  if (result) {
    return (
      <Sheet title="Calendar connected" onClose={() => onDone(result.preview.length)} doneLabel="Done" onDone={() => onDone(result.preview.length)}>
        <PreviewList found={result.found} items={result.preview} />
      </Sheet>
    );
  }
  return (
    <Sheet title="Paste a calendar link" onClose={onClose} doneLabel={busy ? "Reading…" : "Read my calendar"} doneDisabled={busy || url.trim().length < 10} onDone={connect}>
      <label className="flex flex-col gap-1">
        <span className="text-[13px] text-muted-foreground">Private calendar link</span>
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://calendar.google.com/…/basic.ics"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          className="h-12 rounded-xl bg-muted px-3 outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>
      <button type="button" onClick={paste} className="mt-1 flex min-h-11 items-center text-[14px] font-medium text-primary underline underline-offset-4">
        Paste from clipboard
      </button>
      {error && (
        <p role="alert" className="mt-1 text-[13px] leading-snug text-warn">
          {error}
        </p>
      )}
      <details className="mt-3 rounded-2xl bg-muted/50 px-4">
        <summary className="flex min-h-12 cursor-pointer items-center text-[14px] font-medium">Where do I find it?</summary>
        <ul className="flex flex-col gap-2 pb-4 text-[13px] leading-snug text-muted-foreground">
          <li>
            <b className="font-semibold text-foreground">Google Calendar:</b> calendar.google.com, your calendar&apos;s Settings, Integrate calendar, Secret address in iCal format.
          </li>
          <li>
            <b className="font-semibold text-foreground">iCloud:</b> Calendar app, share the calendar, Public Calendar, copy the link.
          </li>
          <li>
            <b className="font-semibold text-foreground">Outlook:</b> Settings, Calendar, Shared calendars, Publish a calendar, copy the ICS link.
          </li>
        </ul>
      </details>
      <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
        The link is a secret: anyone who has it can read your calendar.
      </p>
    </Sheet>
  );
}
