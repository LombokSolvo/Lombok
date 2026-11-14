"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Landmark, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// The connecting moment, shared by S-Pankki (first run), Nordea (and the other banks) and Google Calendar:
// Solvo and the service side by side, a line of light running between them while each stage ticks off, then a check.
// Pure presentation: the caller says how many stages are done; useStages() paces them for a connection that has no real progress.

export type Brand = "spankki" | "nordea" | "google-calendar" | "bank"; // "bank": any other bank, a plain bank mark

const LOGOS: Record<Exclude<Brand, "bank">, { src: string; name: string }> = {
  spankki: { src: "/logos/s-pankki.png", name: "S-Pankki" },
  nordea: { src: "/logos/nordea.png", name: "Nordea" },
  "google-calendar": { src: "/logos/google-calendar.png", name: "Google Calendar" },
};

/** The service's own app icon. */
export function BrandLogo({ brand, className }: { brand: Brand; className?: string }) {
  if (brand === "bank")
    return (
      <span className={cn("flex items-center justify-center bg-accent text-primary", className)} role="img" aria-label="Bank">
        <Landmark className="size-[45%]" />
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={LOGOS[brand].src} alt={LOGOS[brand].name} className={className} />;
}

/** A brand logo at icon-tile size, for list rows. */
export function BrandTile({ brand }: { brand: Brand }) {
  if (brand === "google-calendar")
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card shadow-[0_1px_3px_rgba(15,42,31,0.16)]">
        <BrandLogo brand={brand} className="size-6" />
      </span>
    );
  return <BrandLogo brand={brand} className="size-9 shrink-0 overflow-hidden rounded-xl shadow-[0_1px_2px_rgba(15,42,31,0.12)]" />;
}

/** Which brand a bank name has a logo for. */
export const brandFor = (name: string): Brand | null => (/nordea/i.test(name) ? "nordea" : /s-?pankki/i.test(name) ? "spankki" : null);

/**
 * Paces `count` stages for a connection with no real progress: one stage every `stepMs`, holding on the last until `finished`.
 * Returns how many are done (count when everything is).
 */
export function useStages(count: number, { stepMs = 750, finished = true, running = true }: { stepMs?: number; finished?: boolean; running?: boolean } = {}) {
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (!running) return;
    const hold = finished ? count : count - 1;
    if (done >= hold) return;
    const t = window.setTimeout(() => setDone((d) => d + 1), done === 0 ? stepMs + 250 : stepMs);
    return () => window.clearTimeout(t);
  }, [done, count, stepMs, finished, running]);
  return done;
}

/** Solvo, the line between, the service. While connecting, light runs along the line; when done it fills green and a check pops in. */
function Handshake({ brand, connected }: { brand: Brand; connected: boolean }) {
  return (
    <div className="relative mx-auto flex w-full max-w-[300px] items-center justify-between" aria-hidden>
      <div className="relative z-10 flex size-[76px] animate-pop items-center justify-center rounded-[22px] bg-card shadow-[0_6px_24px_rgba(15,42,31,0.14)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/solvo-logo.png" alt="" className="w-[58px]" />
      </div>

      <div className="relative mx-2 h-[3px] flex-1 overflow-hidden rounded-full bg-primary/12">
        <div className={cn("absolute inset-0 origin-left rounded-full bg-primary transition-transform duration-500 ease-out", connected ? "scale-x-100" : "scale-x-0")} />
        {!connected && <div className="connect-beam absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />}
      </div>

      <div className="relative z-10 animate-pop [animation-delay:120ms]">
        {!connected && <span className="connect-ping absolute inset-0 rounded-[22px] bg-primary/25" />}
        {brand === "google-calendar" ? (
          <span className="relative flex size-[76px] items-center justify-center rounded-[22px] bg-card shadow-[0_6px_24px_rgba(15,42,31,0.14)]">
            <BrandLogo brand={brand} className="size-[50px]" />
          </span>
        ) : (
          <BrandLogo brand={brand} className="relative size-[76px] overflow-hidden rounded-[22px] shadow-[0_6px_24px_rgba(15,42,31,0.14)]" />
        )}
      </div>

      <div className={cn("absolute top-1/2 left-1/2 z-20 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background", connected ? "animate-pop" : "hidden")}>
        <Check className="size-5" strokeWidth={3} />
      </div>
    </div>
  );
}

/** One stage: waiting (faint), working (spinner), done (check pops). Stages fade in one after another. */
function Stage({ label, state, index }: { label: string; state: "wait" | "work" | "done"; index: number }) {
  return (
    <li className="flex min-h-11 animate-rise items-center gap-3 text-[15px]" style={{ animationDelay: `${200 + index * 90}ms` }}>
      <span className="flex size-6 shrink-0 items-center justify-center">
        {state === "done" ? (
          <span className="flex size-6 animate-pop items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3.5" strokeWidth={3.25} aria-hidden />
          </span>
        ) : state === "work" ? (
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
        ) : (
          <span className="size-2 rounded-full bg-border" aria-hidden />
        )}
      </span>
      <span className={cn("transition-colors duration-300", state === "wait" ? "text-muted-foreground/70" : "text-foreground", state === "done" && "font-medium")}>{label}</span>
    </li>
  );
}

/** The whole connecting view: logos, title, stages. `done` = how many stages have finished; all done = connected. */
export function ConnectProgress({
  brand,
  title,
  doneTitle,
  stages,
  done,
  children,
}: {
  brand: Brand;
  title: string;
  doneTitle: string;
  stages: string[];
  done: number;
  children?: ReactNode; // shown under the stages once connected (a summary line, a button)
}) {
  const connected = done >= stages.length;
  return (
    <div className="flex flex-col" role="status" aria-live="polite">
      <Handshake brand={brand} connected={connected} />
      <h1 key={connected ? "done" : "working"} className="mt-8 animate-rise text-center font-display text-[26px] leading-tight font-semibold tracking-[-0.02em]">
        {connected ? doneTitle : title}
      </h1>
      <ol className="mx-auto mt-6 flex w-full max-w-[300px] flex-col">
        {stages.map((s, i) => (
          <Stage key={s} label={s} index={i} state={i < done ? "done" : i === done ? "work" : "wait"} />
        ))}
      </ol>
      {connected && children && <div className="mt-6 animate-rise [animation-delay:250ms]">{children}</div>}
    </div>
  );
}

/** Full-screen cover for a connection that happens on top of a page (onboarding, the bank picker). */
export function ConnectOverlay(props: Parameters<typeof ConnectProgress>[0]) {
  return (
    <div className="fixed inset-0 z-40 mx-auto flex w-full max-w-[430px] animate-in flex-col justify-center bg-background px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] duration-300 fade-in">
      <ConnectProgress {...props} />
    </div>
  );
}
