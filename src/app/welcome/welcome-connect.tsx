"use client";

import { useState } from "react";
import { primaryButton } from "@/components/solvo/ui";

export function WelcomeConnect() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/live/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank: "spankki" }) });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && data.url) return window.location.assign(data.url);
      setError(data.error ?? `Something went wrong (${res.status}).`);
    } catch {
      setError("Couldn't reach Solvo. Check your connection and try again.");
    }
    setBusy(false);
  };
  return (
    <>
      {error && (
        <p role="alert" className="mt-4 text-[14px] text-destructive">
          {error}
        </p>
      )}
      <button type="button" onClick={go} disabled={busy} className={`${primaryButton} mt-6`}>
        {busy ? "Opening S-Pankki…" : "Continue to S-Pankki"}
      </button>
    </>
  );
}
