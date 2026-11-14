"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Copy, Download, Share, SquarePlus, MoreVertical } from "lucide-react";
import { Chip, Group, primaryButton } from "@/components/solvo/ui";

// How to put Solvo on a phone's home screen. Solvo is a web app that installs from the browser (src/app/manifest.ts, public/sw.js):
// no app store, nothing to download. The steps differ by phone, so the page picks iPhone or Android from the browser and lets the
// person switch. Android Chrome can also install straight from a button (the `beforeinstallprompt` event); iPhone has no such
// button, so for iPhone it is the Share menu steps.

type Platform = "ios" | "android";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const noSubscribe = () => () => {};
const platformNow = (): Platform => {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac with a touch screen.
  const iPad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPad ? "ios" : "android";
};

function standaloneSubscribe(cb: () => void) {
  const q = window.matchMedia("(display-mode: standalone)");
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
}
const standaloneNow = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** True when Solvo is already running from the home screen. */
export function useInstalled() {
  return useSyncExternalStore(standaloneSubscribe, standaloneNow, () => false);
}

function Steps({ steps }: { steps: { icon: React.ReactNode; title: string; sub?: string }[] }) {
  return (
    <ol>
      {steps.map((s, i) => (
        <li key={s.title} className="flex items-start gap-3 px-4 py-3.5 [&+&]:border-t">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-primary" aria-hidden>
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-snug font-medium">{s.title}</span>
            {s.sub && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{s.sub}</span>}
          </span>
          <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-5">{s.icon}</span>
        </li>
      ))}
    </ol>
  );
}

export function InstallGuide() {
  const detected = useSyncExternalStore(noSubscribe, platformNow, () => "ios" as Platform);
  const [picked, setPicked] = useState<Platform | null>(null);
  const platform = picked ?? detected;
  const installed = useInstalled();
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [copied, setCopied] = useState(false);
  const address = useSyncExternalStore(noSubscribe, () => `${window.location.origin}/install`, () => "");

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our own button
      setPrompt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the address is on screen to copy by hand.
    }
  };

  if (installed) {
    return (
      <Group>
        <div className="flex items-center gap-3 px-4 py-4">
          <Check className="size-5 text-primary" aria-hidden />
          <p className="text-[15px] leading-snug font-medium">Solvo is on this phone&apos;s home screen.</p>
        </div>
      </Group>
    );
  }

  return (
    <>
      <div className="flex gap-1 rounded-full bg-muted p-1" role="tablist" aria-label="Your phone">
        {([["ios", "iPhone"], ["android", "Android"]] as [Platform, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={platform === id}
            onClick={() => setPicked(id)}
            className={`h-11 flex-1 rounded-full text-[14px] font-semibold ${platform === id ? "bg-card shadow-[0_1px_3px_rgba(15,42,31,0.1)]" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {platform === "ios" ? (
        <Group title="On iPhone" footer="Use Safari. Chrome on iPhone can do it too, on iOS 16.4 or later.">
          <Steps
            steps={[
              { icon: <Share />, title: "Tap Share", sub: "The square with an arrow, at the bottom of Safari." },
              { icon: <SquarePlus />, title: "Tap Add to Home Screen", sub: "Scroll down the list if you don't see it." },
              { icon: <Check />, title: "Tap Add", sub: "Solvo appears on your home screen and opens full screen." },
            ]}
          />
        </Group>
      ) : (
        <Group title="On Android" footer="Use Chrome. Other browsers have the same option under their menu.">
          {prompt && (
            <div className="border-b p-4">
              <button
                type="button"
                className={primaryButton}
                onClick={async () => {
                  await prompt.prompt();
                  await prompt.userChoice;
                  setPrompt(null);
                }}
              >
                <Download className="size-[18px]" aria-hidden />
                Install Solvo
              </button>
            </div>
          )}
          <Steps
            steps={[
              { icon: <MoreVertical />, title: "Open the Chrome menu", sub: "The three dots in the top corner." },
              { icon: <Download />, title: "Tap Install app", sub: "Some phones say Add to Home screen." },
              { icon: <Check />, title: "Tap Install", sub: "Solvo appears with your other apps and opens full screen." },
            ]}
          />
        </Group>
      )}

      <Group title="On a computer?" footer="Open this address on your phone, then follow the steps above.">
        <div className="flex items-center gap-3 px-4 py-3">
          <p className="num min-w-0 flex-1 text-[14px] leading-snug break-all">{address || "…"}</p>
          <button
            type="button"
            onClick={copy}
            disabled={!address}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-muted px-3 text-[14px] font-semibold active:scale-95 disabled:opacity-40"
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </Group>
    </>
  );
}

/** A green "Installed" chip for the Profile row; nothing when Solvo runs in a browser tab. */
export function InstalledChip() {
  const installed = useInstalled();
  return installed ? <Chip tone="green">Installed</Chip> : null;
}
