"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarDays, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { ApproveSheet } from "@/app/bills/switch-ui";
import { Group, IconTile, Row } from "@/components/solvo/ui";
import { request } from "@/lib/client-request";
import { writeCalendarCookie } from "@/lib/calendar-demo";
import { plainFormat } from "@/lib/demo-clock";
import { resetForecast } from "@/lib/forecast-store";
import type { GoogleStatus } from "@/lib/google-calendar";

// Profile > Calendar: the calendar Solvo reads to foresee trips and dinners and budget for them. Opt-in, never assumed.
//  - Demo (everywhere, the public app too): a simulated calendar with fictional events. Nothing real is read.
//  - Google Calendar (LOCAL ONLY, when the app runs with SOLVO_GOOGLE=1, see src/lib/google-calendar.ts): the person's own, read-only.
//    Real and demo calendars are never mixed: while Google is connected the demo option is not offered.
// The type import above is erased at build time, so no server code reaches the browser.

const day = plainFormat({ day: "numeric", month: "short" });
const NOTICES: Record<string, string> = {
  connected: "Connected. Trips and dinners now show up as estimates.",
  declined: "The approval was cancelled, so nothing was connected.",
  failed: "That connection didn't finish. Try again.",
  state: "That connection didn't finish: the safety check failed. Try again from this page.",
};

const action = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left font-medium text-primary disabled:opacity-50 [&+&]:border-t";

export function CalendarConnect({ mode, count, google, notice }: { mode: "demo" | "google" | null; count: number; google: GoogleStatus; notice: string | null }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<null | "demo" | "google">(null);
  const [busy, setBusy] = useState<null | "connect" | "sync" | "disconnect">(null);
  const [error, setError] = useState<string | null>(null);

  const done = () => {
    setSheet(null);
    router.refresh();
  };
  const useDemo = () => {
    writeCalendarCookie(true);
    done();
  };
  const dropDemo = () => {
    writeCalendarCookie(false);
    resetForecast();
    router.refresh();
  };
  const connectGoogle = async () => {
    setSheet(null);
    setBusy("connect");
    setError(null);
    const r = await request("/api/google/start", { method: "POST" });
    if (r.ok && typeof r.data.url === "string") {
      window.location.assign(r.data.url); // Google's own page: the person approves there with their own login
      return;
    }
    setError(r.ok ? "Google gave no address to continue." : r.error);
    setBusy(null);
  };
  const runGoogle = async (kind: "sync" | "disconnect") => {
    if (kind === "disconnect" && !window.confirm("Disconnect Google Calendar? This revokes Solvo's access at Google and deletes what was saved on this computer.")) return;
    setBusy(kind);
    setError(null);
    const r = await request(`/api/google/${kind}`, { method: "POST" });
    if (!r.ok) setError(r.error);
    else {
      if (kind === "disconnect") resetForecast();
      router.refresh();
    }
    setBusy(null);
  };

  const spin = <Loader2 className="animate-spin" />;
  const googleOn = google.enabled && google.connected && !google.reconnect;
  const footer = googleOn
    ? "Local only: Solvo reads event titles and times on this computer, read-only. Titles never go to the coach or any model, and are not shown. Only an estimate per trip or dinner reaches your budget."
    : mode === "demo"
      ? "Demo: a simulated calendar with fictional events. Nothing real is read."
      : "Optional. Solvo looks for trips, dinners, concerts and birthdays and sets aside an estimate for each. Demo: simulated, with example events.";

  return (
    <Group title="Calendar" footer={footer}>
      {notice && NOTICES[notice] && (
        <p role="status" className="border-b px-4 py-3 text-[13px] leading-snug">
          {NOTICES[notice]}
        </p>
      )}

      {/* Real Google Calendar: local only. */}
      {google.enabled && google.connected && (
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
            <button type="button" className={action} onClick={() => runGoogle("sync")} disabled={busy !== null}>
              <IconTile>{busy === "sync" ? spin : <RefreshCw />}</IconTile>
              {busy === "sync" ? "Reading…" : "Refresh"}
            </button>
          )}
          <button type="button" className={action} onClick={() => runGoogle("disconnect")} disabled={busy !== null}>
            <IconTile tone="grey">{busy === "disconnect" ? spin : <Trash2 />}</IconTile>
            Disconnect and delete
          </button>
        </>
      )}
      {google.enabled && !google.connected && (
        google.configured ? (
          <button type="button" className={action} onClick={() => setSheet("google")} disabled={busy !== null}>
            <IconTile>{busy === "connect" ? spin : <CalendarDays />}</IconTile>
            <span>
              <span className="block">Connect Google Calendar</span>
              <span className="block text-[13px] font-normal text-muted-foreground">Your own, read-only. Local only.</span>
            </span>
          </button>
        ) : (
          <Row
            icon={<IconTile tone="warn"><CalendarDays /></IconTile>}
            title="Google Calendar needs setup"
            subtitle="Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local, then restart npm run dev:google. The steps are at the top of src/lib/google-calendar.ts."
          />
        )
      )}

      {/* The demo calendar, unless a real one is in use. */}
      {!(google.enabled && google.connected && !google.reconnect) &&
        (mode === "demo" ? (
          <>
            <Row
              icon={<IconTile><CalendarClock /></IconTile>}
              title="Demo calendar"
              subtitle={`Example events, simulated. ${count} ${count === 1 ? "thing" : "things"} counted as spending.`}
            />
            <button type="button" className={action} onClick={dropDemo}>
              <IconTile tone="grey"><Trash2 /></IconTile>
              Remove the demo calendar
            </button>
          </>
        ) : (
          <button type="button" className={action} onClick={() => setSheet("demo")}>
            <IconTile><CalendarClock /></IconTile>
            <span>
              <span className="block">Connect calendar</span>
              <span className="block text-[13px] font-normal text-muted-foreground">Demo: example events, nothing real</span>
            </span>
          </button>
        ))}

      {error && (
        <p role="alert" className="border-t px-4 py-3 text-[13px] leading-snug text-warn">
          {error}
        </p>
      )}

      {sheet === "demo" && (
        <ApproveSheet
          title="Connect a calendar"
          points={[
            "Demo: a simulated calendar with six example events. Nothing real is read.",
            "Solvo looks for trips, dinners, concerts and birthdays, and sets aside an estimate for each.",
            "Estimates come from your own spending where there is enough, otherwise from typical amounts. You can change or switch off every one.",
          ]}
          confirmLabel="Use the demo calendar"
          onConfirm={useDemo}
          onCancel={() => setSheet(null)}
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
          onCancel={() => setSheet(null)}
        />
      )}
    </Group>
  );
}
