import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Logo, PAGE, primaryButton } from "@/components/solvo/ui";
import { isPersonal } from "@/lib/personal";

export const metadata = { title: "Log in · Solvo" };

const MESSAGES: Record<string, string> = {
  wrong: "Wrong password. Try again.",
  wait: "Too many tries. Wait 15 minutes and try again.",
  setup: "Login isn't set up yet: SOLVO_PASSWORD and SOLVO_DATA_KEY are missing.",
};

// The private deployment's only open page. A plain form, so it works before any JavaScript has loaded.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  await connection();
  if (!isPersonal()) notFound();
  const { error, next } = await searchParams;
  return (
    <main className={`${PAGE} justify-center`}>
      <Logo />
      <h1 className="mt-6 font-display text-[28px] leading-tight font-semibold tracking-[-0.02em]">Log in</h1>
      <form method="post" action="/api/login" className="mt-6 flex flex-col gap-3">
        <input type="hidden" name="next" value={next?.startsWith("/") ? next : "/"} />
        <label htmlFor="password" className="text-[15px] font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="h-12 rounded-xl border border-border bg-card px-4 text-[16px]"
        />
        {error && (
          <p role="alert" className="text-[14px] text-destructive">
            {MESSAGES[error] ?? MESSAGES.wrong}
          </p>
        )}
        <button type="submit" className={`${primaryButton} mt-2`}>
          Log in
        </button>
      </form>
    </main>
  );
}
