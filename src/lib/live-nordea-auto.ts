// LOCAL ONLY. Keeps the real Nordea fresh without the person doing anything: while the app is running (npm run dev:live), it syncs once
// a day. Open banking lets an app read an account without the person present only a few times a day, so one sync a day is well inside
// that. It checks shortly after the app starts (so a laptop opened in the morning catches up) and then every hour. If a sync fails,
// for example because the consent ran out, it logs a short line without any account data and tries again at the next check.
import { explain, liveEnabled, liveStatus, syncLive } from "@/lib/live-nordea";

const DAY = 24 * 3600_000;

export function startAutoSync() {
  const g = globalThis as { __solvoAutoSync?: boolean };
  if (g.__solvoAutoSync || !liveEnabled()) return; // once per server, even when development mode reloads this file
  g.__solvoAutoSync = true;

  const tick = async () => {
    try {
      const s = liveStatus();
      if (!s.connected || !s.syncedAt) return;
      if (Date.now() - Date.parse(s.syncedAt) < DAY) return;
      if (s.validUntil && Date.parse(s.validUntil) < Date.now()) return; // expired: the person has to approve again
      await syncLive();
      console.log("[solvo] Nordea synced automatically");
    } catch (e) {
      console.log("[solvo] automatic Nordea sync failed:", explain(e));
    }
  };
  setTimeout(tick, 20_000).unref();
  setInterval(tick, 3600_000).unref();
}
