"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarDays, Check, ChevronRight, FileUp, Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { ApproveSheet } from "@/app/bills/switch-ui";
import { useForecast } from "@/components/forecast-ui";
import { MoneyBadge, SignedAmount } from "@/components/solvo/money-badge";
import { Sheet } from "@/components/solvo/sheet";
import { Chip, Group, IconTile, Row, primaryButton, secondaryButton } from "@/components/solvo/ui";
import { clearCalendarFile, saveCalendarFile, useCalendarFile } from "@/lib/calendar-file-store";
import { postJson, request } from "@/lib/client-request";
import { plainFormat } from "@/lib/demo-clock";
import { eventDays, forecast, spendingEvents, type Baselines, type ForecastItem } from "@/lib/forecast";
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
  connected: "Connected. Trips and dinners now show up as estimates.",
  declined: "The approval was cancelled, so nothing was connected.",
  failed: "That connection didn't finish. Try again.",
  state: "That connection didn't finish: the safety check failed. Try again from this page.",
};

const action = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left font-medium text-primary disabled:opacity-50 [&+&]:border-t";

type Sheets = null | "pick" | "file" | "link" | "google";
type Preview = { label: string; date: string; amount: number; title?: string };

/** One way in, as a big tappable card in the picker. */
function Choice({ icon, title, sub, chip, onClick }: { icon: ReactNode; title: string; sub: string; chip: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[68px] w-full items-center gap-3 rounded-2xl bg-muted/60 px-3.5 py-3 text-left active:bg-muted">
      <IconTile>{icon}</IconTile>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15px] leading-snug font-semibold">{title}</span>
          <Chip>{chip}</Chip>
        </span>
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

  const connectGoogle = async () => {
    setSheet(null);
    setBusy("connect");
    setError(null);
    const r = await postJson("/api/google/start", { from });
    if (r.ok && typeof r.data.url === "string") {
      window.location.assign(r.data.url); // Google's own page: the person approves there with their own login
      return;
    }
    setError(r.ok ? "Google gave no address to continue." : r.error);
    setBusy(null);
  };
  const run = async (what: "google" | "link", kind: "sync" | "disconnect") => {
    const path = what === "google" ? `/api/google/${kind}` : `/api/calendar/link${kind === "sync" ? "/sync" : "/disconnect"}`;
    if (kind === "disconnect" && !window.confirm(what === "google" ? "Disconnect Google Calendar? This revokes Solvo's access at Google and deletes what was saved on this computer." : "Disconnect the calendar link? The saved link and events are deleted from this computer.")) return;
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

  const footer = mode === "file"
    ? "Your file stays on this phone: it was read here and never uploaded. Solvo kept only the events that look like spending."
    : mode === "link"
      ? "Local only: the link and the events kept from it stay on this computer. Event titles never go to the coach or any model."
      : googleHere && mode === "google"
        ? "Local only: Solvo reads event titles and times on this computer, read-only. Titles never go to the coach or any model, and are not shown. Only an estimate per trip or dinner reaches your budget."
        : undefined;

  return (
    <div id="calendar" className="scroll-mt-4">
      <Group title="Calendar" footer={footer}>
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
                  Solvo spots trips, dinners, concerts and birthdays in your calendar and sets money aside for each. Estimates, never bills, and you can change or switch off every one.
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
              subtitle={`${file.name} · ${counted} ${counted === 1 ? "thing" : "things"} counted as spending · added ${day(file.importedAt.slice(0, 10))}`}
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
              subtitle={`${link.found} upcoming ${link.found === 1 ? "event" : "events"} read, ${counted} counted as spending${link.syncedAt ? ` · ${day(link.syncedAt.slice(0, 10))}` : ""}`}
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
              icon={<IconTile tone={google.reconnect ? "warn" : undefined}><CalendarDays /></IconTile>}
              title={google.reconnect ? "Google Calendar needs approval again" : "Google Calendar connected"}
              subtitle={
                google.reconnect
                  ? "Google stopped accepting the saved approval (in Testing mode it lasts 7 days)."
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

      {sheet === "pick" && (
        <Sheet title="Connect a calendar" onClose={() => setSheet(null)} hideDone>
          <div className="flex flex-col gap-2.5">
            <Choice icon={<FileUp />} title="Calendar file" chip="On this phone" sub="Export a .ics file from Google, Apple or Outlook and choose it. It is read here and never uploaded." onClick={() => setSheet("file")} />
            {link.available && <Choice icon={<Link2 />} title="Calendar link" chip="This computer only" sub="Paste your calendar's private link from Google, iCloud or Outlook. No sign-in, no keys." onClick={() => setSheet("link")} />}
            {google.enabled && google.configured && <Choice icon={<CalendarDays />} title="Google Calendar" chip="This computer only" sub="Sign in with Google and approve read-only access." onClick={() => setSheet("google")} />}
            {google.enabled && !google.configured && <Row icon={<IconTile tone="warn"><CalendarDays /></IconTile>} title="Google sign-in needs setup" subtitle="Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local. Steps are at the top of src/lib/google-calendar.ts." className="rounded-2xl bg-muted/40" />}
          </div>
          <p className="mt-4 mb-1 text-[13px] leading-snug text-muted-foreground">Solvo only forecasts your own spending. It never changes your calendar and never sends event titles to a model.</p>
        </Sheet>
      )}

      {sheet === "file" && (
        <FileSheet
          today={today}
          baselines={baselines}
          onClose={() => setSheet(null)}
          onAdded={(n) => {
            setSheet(null);
            setFlash(n ? `Added ${n} ${n === 1 ? "thing" : "things"} from your calendar file. They show up on Home and the calendar as estimates.` : "Your file was read. Nothing in the next 45 days looks like spending, so nothing was added.");
          }}
        />
      )}
      {sheet === "link" && (
        <LinkSheet
          onClose={() => setSheet(null)}
          onDone={(n) => {
            setSheet(null);
            setFlash(n ? `Connected. ${n} ${n === 1 ? "thing" : "things"} from your calendar now show up as estimates.` : "Connected. Nothing in the next 45 days looks like spending yet.");
            router.refresh();
          }}
        />
      )}
      {sheet === "google" && (
        <ApproveSheet
          title="Connect Google Calendar"
          points={[
            "Solvo reads the titles and times of your events for the next 45 days. Read-only: it can't add or change anything.",
            "You approve at Google with your own login. Solvo never sees your password.",
            "Real data: it stays on this computer. Titles never go to the coach or any model.",
            "In Testing mode Google ends the approval after 7 days. You can disconnect here any time.",
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
function PreviewList({ found, items, where }: { found: number; items: Preview[]; where: string }) {
  return (
    <div>
      <p className="font-display text-[22px] leading-tight font-semibold tracking-[-0.015em]">
        {items.length ? `${items.length} ${items.length === 1 ? "thing looks" : "things look"} like spending` : "Nothing looks like spending"}
      </p>
      <p className="mt-1 text-[14px] text-muted-foreground">
        Solvo read {found} {found === 1 ? "event" : "events"} in the next {WINDOW_DAYS} days.
      </p>
      {items.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl bg-muted/50">
          {items.map((i, n) => (
            <div key={`${i.date}-${n}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 [&+&]:border-t">
              <MoneyBadge kind="out" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] leading-snug font-medium">{i.label}</div>
                <div className="truncate text-[13px] text-muted-foreground">
                  {shortDay(i.date)}
                  {i.title ? ` · ${i.title}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <SignedAmount kind="out" value={i.amount} />
                <div className="text-[11px] text-muted-foreground">estimate</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
        {items.length ? `${where} Estimates come from your own spending where there is enough. You can change or switch off each one afterwards.` : `${where} Trips, flights, dinners, lunches, concerts and parties are what Solvo looks for.`}
      </p>
    </div>
  );
}

const toPreview = (items: ForecastItem[]): Preview[] => items.map((i) => ({ label: i.label, date: i.date, amount: i.amount, title: i.detail }));

/** Choose a .ics file (or try a sample). Read in this browser with FileReader semantics: it is never sent anywhere. */
function FileSheet({ today, baselines, onClose, onAdded }: { today: string; baselines: Baselines; onClose: () => void; onAdded: (n: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ step: "pick" } | { step: "reading" } | { step: "preview"; name: string; found: number; kept: ReturnType<typeof spendingEvents>; items: ForecastItem[] }>({ step: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const read = (text: string, name: string) => {
    const events = parseIcs(text);
    if (!events.length && !/BEGIN:VCALENDAR/.test(text)) {
      setError("That doesn't look like a calendar file. Choose a .ics file exported from your calendar.");
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
        <PreviewList found={found} items={toPreview(items)} where="Kept on this phone: only these events are saved, the rest of the file is dropped now." />
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
        <span className="text-[13px] leading-snug text-muted-foreground">From Google Calendar, Apple Calendar or Outlook. It is read on this phone and never uploaded.</span>
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
        <PreviewList found={result.found} items={result.preview} where="Local only: the link and these events stay on this computer." />
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
        The link is a secret: anyone who has it can read your calendar. Solvo keeps it on this computer only and reads links from Google, iCloud and Outlook.
      </p>
    </Sheet>
  );
}
