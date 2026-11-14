"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Landmark, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { ApproveSheet } from "@/app/bills/switch-ui";
import { IconTile, Row } from "@/components/solvo/ui";
import { postJson } from "@/lib/client-request";
import { plainFormat } from "@/lib/demo-clock";
import { LIVE_BANKS, liveConsentPoints, type LiveBankId } from "@/lib/live-bank-ids";
import type { LiveStatus } from "@/lib/live-banks";

// LOCAL ONLY. The owner's own banks, neobanks and apps, once connected (npm run dev:live): one row each in the Connected banks list
// (src/components/other-banks.tsx), with Connect again and Disconnect, and one Sync now. CONNECTING the first time happens in the
// "Add a bank" picker in the same file, so the demo shows one flow for every bank. Server side: src/lib/live-banks.ts. The type import above is erased at build time, so no
// server code reaches the browser.

const day = plainFormat({ day: "numeric", month: "short" });

export function LiveBankRows({ status }: { status: LiveStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<LiveBankId | null>(null);

  const connected = status.banks.filter((b) => b.connected);

  // Off, or nothing connected yet (the picker offers it): no rows. Not set up: say what is missing. Connected: one row each.
  if (!status.enabled || (status.configured && connected.length === 0)) return null;

  const call = async (path: string, key: string, body?: unknown) => {
    setBusy(key);
    setError(null);
    const r = await postJson(path, body);
    if (!r.ok) setError(r.error);
    else router.refresh();
    setBusy(null);
  };
  const disconnect = (id: LiveBankId) => {
    if (!window.confirm(`Disconnect ${LIVE_BANKS[id].name}? This ends the consent and deletes its downloaded data from this computer.`)) return;
    void call("/api/live/disconnect", `disconnect-${id}`, { bank: id });
  };
  // Run the bank's approval again. The new approval replaces the earlier one when it succeeds; nothing is deleted before that.
  const again = async (id: LiveBankId) => {
    setAsking(null);
    setBusy(`start-${id}`);
    setError(null);
    const r = await postJson("/api/live/start", { bank: id });
    if (r.ok && typeof r.data.url === "string") {
      window.location.assign(r.data.url);
      return;
    }
    setError(r.ok ? "Enable Banking didn't return an approval address." : r.error);
    setBusy(null);
  };

  const action = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left font-medium text-primary disabled:opacity-50 [&+&]:border-t";
  const small = "flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted disabled:opacity-50";

  return (
    <>
      {!status.configured ? (
        <Row
          icon={<IconTile tone="warn"><Landmark /></IconTile>}
          title="Real banks need setup"
          subtitle="Put ENABLE_APP_ID and ENABLE_KEY_PATH in .env.local, then restart npm run dev:live."
        />
      ) : (
        <>
          {connected.map((b) => (
            <div key={b.id} className="flex min-h-14 items-center gap-1 py-2 pr-2 pl-4 [&+&]:border-t">
              <IconTile><Landmark /></IconTile>
              <div className="ml-2 min-w-0 flex-1">
                <div className="text-[15px] leading-snug font-medium">{b.name}</div>
                <div className="mt-0.5 flex items-start gap-1 text-[13px] leading-snug text-muted-foreground">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                  <span>
                    {LIVE_BANKS[b.id].kind}, {b.accounts} account{b.accounts === 1 ? "" : "s"}
                    {b.syncedAt ? `, synced ${day(b.syncedAt.slice(0, 10))}` : ""}
                  </span>
                </div>
              </div>
              <button type="button" aria-label={`Connect ${b.name} again`} className={small} disabled={busy !== null} onClick={() => setAsking(b.id)}>
                {busy === `start-${b.id}` ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : <ShieldCheck className="size-[18px]" aria-hidden />}
              </button>
              <button type="button" aria-label={`Disconnect ${b.name} and delete its data`} className={small} disabled={busy !== null} onClick={() => disconnect(b.id)}>
                {busy === `disconnect-${b.id}` ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : <Trash2 className="size-[18px]" aria-hidden />}
              </button>
            </div>
          ))}
          <button type="button" className={action} onClick={() => call("/api/live/sync", "sync", {})} disabled={busy !== null}>
            <IconTile>{busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}</IconTile>
            {busy === "sync" ? "Downloading…" : "Sync now"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="border-t px-4 py-3 text-[13px] leading-snug text-warn">
          {error}
        </p>
      )}
      {asking && (
        <ApproveSheet
          title={`Connect ${LIVE_BANKS[asking].name} again`}
          points={["The new approval replaces the old one, and your payments are downloaded again.", ...liveConsentPoints(asking).slice(1)]}
          confirmLabel={`Continue to ${LIVE_BANKS[asking].name}`}
          onConfirm={() => again(asking)}
          onCancel={() => setAsking(null)}
        />
      )}
    </>
  );
}
