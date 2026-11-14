"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { ApproveSheet } from "@/app/bills/switch-ui";
import { Group, IconTile, Row } from "@/components/solvo/ui";
import { postJson, request } from "@/lib/client-request";
import { plainFormat } from "@/lib/demo-clock";
import type { LiveStatus } from "@/lib/live-nordea";

// LOCAL ONLY. The owner's own Nordea, once connected (npm run dev:live): status, Sync now and Disconnect. CONNECTING happens in the
// "Add a bank" picker (src/components/other-banks.tsx, first entry), so the demo shows one flow for every bank. Server side:
// src/lib/live-nordea.ts. The type import above is erased at build time, so no server code reaches the browser.

const day = plainFormat({ day: "numeric", month: "short" });

export function LiveNordea({ status }: { status: LiveStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "sync" | "disconnect" | "start">(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  // Off, or ready to connect (the picker offers it): nothing to show here. Not set up: say what is missing. Connected: manage it.
  if (!status.enabled || (status.configured && !status.connected)) return null;

  const run = async (kind: "sync" | "disconnect") => {
    if (kind === "disconnect" && !window.confirm("Disconnect Nordea? This ends the consent and deletes the downloaded data from this computer.")) return;
    setBusy(kind);
    setError(null);
    const r = await request(`/api/nordea/${kind}`, { method: "POST" });
    if (!r.ok) setError(r.error);
    else router.refresh();
    setBusy(null);
  };

  // Run the Nordea ID approval again. The new approval replaces the earlier one when it succeeds; nothing is deleted before that.
  const again = async () => {
    setAsking(false);
    setBusy("start");
    setError(null);
    const r = await postJson("/api/nordea/start");
    if (r.ok && typeof r.data.url === "string") {
      window.location.assign(r.data.url);
      return;
    }
    setError(r.ok ? "Enable Banking didn't return an approval address." : r.error);
    setBusy(null);
  };

  const action = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left font-medium text-primary disabled:opacity-50 [&+&]:border-t";

  return (
    <>
    <Group
      title="Your real Nordea"
      footer={
        status.connected
          ? "Merged with your other banks. Updates itself once a day while the app is running. Local only: this data stays on this computer and never goes to the cloud or the coach. Read-only."
          : "Local only. You approve with Nordea ID; Solvo never sees your codes and can't move money."
      }
    >
      {!status.configured ? (
        <Row
          icon={<IconTile tone="warn"><Landmark /></IconTile>}
          title="Needs setup"
          subtitle="Put ENABLE_APP_ID and ENABLE_KEY_PATH in .env.local, then restart npm run dev:live."
        />
      ) : (
        <>
          <Row
            icon={<IconTile><Landmark /></IconTile>}
            title="Nordea connected"
            subtitle={`${status.accounts} account${status.accounts === 1 ? "" : "s"}, ${status.transactions.toLocaleString("en-GB")} transactions${status.syncedAt ? `, synced ${day(status.syncedAt.slice(0, 10))}` : ""}`}
          />
          <button type="button" className={action} onClick={() => run("sync")} disabled={busy !== null}>
            <IconTile>{busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}</IconTile>
            {busy === "sync" ? "Downloading…" : "Sync now"}
          </button>
          <button type="button" className={action} onClick={() => setAsking(true)} disabled={busy !== null}>
            <IconTile>{busy === "start" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}</IconTile>
            {busy === "start" ? "Opening Nordea…" : "Connect again with Nordea ID"}
          </button>
          <button type="button" className={action} onClick={() => run("disconnect")} disabled={busy !== null}>
            <IconTile tone="grey">{busy === "disconnect" ? <Loader2 className="animate-spin" /> : <Trash2 />}</IconTile>
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
    {asking && (
      <ApproveSheet
        title="Connect Nordea again"
        points={[
          "You approve with Nordea ID at Nordea. You never open Enable Banking's website.",
          "The new approval replaces the earlier one, and your transactions are downloaded again.",
          "Read-only: Solvo can't move money. Real data: it stays on this computer.",
        ]}
        confirmLabel="Continue to Nordea ID"
        onConfirm={again}
        onCancel={() => setAsking(false)}
      />
    )}
    </>
  );
}
