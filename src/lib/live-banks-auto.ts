// LOCAL ONLY. Keeps the real banks fresh without the person doing anything: while the app is running (npm run dev:live), each connected
// bank syncs once a day. Open banking lets an app read an account without the person present only a few times a day, so one sync a
// day per bank is well inside that. It checks shortly after the app starts (so a laptop opened in the morning catches up) and then
// every hour. If a sync fails, for example because a consent ran out, it logs a short line without any account data and tries again
// at the next check.
import { explain, liveEnabled, liveStatus, syncLive } from "@/lib/live-banks";

const DAY = 24 * 3600_000;

export function startAutoSync() {
  const g = globalThis as { __solvoAutoSync?: boolean };
  if (g.__solvoAutoSync || !liveEnabled()) return; // once per server, even when development mode reloads this file
  g.__solvoAutoSync = true;

  const tick = async () => {
    for (const bank of (await liveStatus()).banks) {
      try {
        if (!bank.connected || !bank.syncedAt) continue;
        if (Date.now() - Date.parse(bank.syncedAt) < DAY) continue;
        if (bank.validUntil && Date.parse(bank.validUntil) < Date.now()) continue; // expired: the person has to approve again
        await syncLive(bank.id);
        console.log(`[solvo] ${bank.name} synced automatically`);
      } catch (e) {
        console.log(`[solvo] automatic ${bank.name} sync failed:`, explain(e));
      }
    }
  };
  setTimeout(tick, 20_000).unref();
  setInterval(tick, 3600_000).unref();
}
