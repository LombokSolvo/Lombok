// Runs once when the server starts. Only used to start the daily sync of the real banks, and only on a computer running npm run dev:live.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SOLVO_LIVE === "1") {
    const { startAutoSync } = await import("@/lib/live-banks-auto");
    startAutoSync();
  }
}
