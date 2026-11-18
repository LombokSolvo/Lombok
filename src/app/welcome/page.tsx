import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Logo, PAGE } from "@/components/solvo/ui";
import { liveConsentPoints } from "@/lib/live-bank-ids";
import { isPersonal } from "@/lib/personal";
import { personalBase } from "@/lib/source";
import { WelcomeConnect } from "./welcome-connect";

export const metadata = { title: "Welcome · Solvo" };

// The private deployment before its first connection: one button that connects the person's own S-Pankki.
export default async function WelcomePage() {
  await connection();
  if (!isPersonal()) notFound();
  if (await personalBase()) redirect("/");
  return (
    <main className={`${PAGE} justify-center`}>
      <Logo />
      <h1 className="mt-6 font-display text-[28px] leading-tight font-semibold tracking-[-0.02em]">Connect your S-Pankki</h1>
      <ul className="mt-4 flex flex-col gap-2 text-[15px] text-muted-foreground">
        {liveConsentPoints("spankki").map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <WelcomeConnect />
    </main>
  );
}
