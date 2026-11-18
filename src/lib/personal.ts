// Personal mode: Solvo as one person's own money app, on their own private deployment. Switched on with SOLVO_PERSONAL=1.
// What changes: a password protects every page (src/proxy.ts), Aino and all made-up data are gone, the person's own S-Pankki
// (through Enable Banking) is the main bank, and dates are real (no demo clock). The public demo never sets this variable.
// Client-safe: reads one public flag only.

/** True on the person's private deployment. */
export const isPersonal = () => process.env.SOLVO_PERSONAL === "1";

/** Whether the coach chat may read the person's real data (it goes to Gemini). Off unless the owner turns it on. */
export const personalCoach = () => isPersonal() && process.env.SOLVO_COACH_REAL === "1";
