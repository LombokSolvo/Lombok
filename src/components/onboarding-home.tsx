"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { readOnboarding } from "@/lib/onboarding-store";
import { readDemoMode, syncDemoCookie } from "@/lib/switches";

/** First visit: send the person to onboarding once. "Skip for now" there means they are not asked again. */
export function OnboardingGate() {
  const router = useRouter();
  useEffect(() => {
    // A browser that chose its demo account before the server could see it: fix the cookie and reload once.
    if (syncDemoCookie()) return window.location.reload();
    // Read storage directly: the hook returns an empty snapshot while the page hydrates.
    // Only the "New customer" demo account is sent to onboarding; Aino (the default) is already set up.
    if (readDemoMode() !== "new") return;
    const s = readOnboarding();
    if (!s.completedAt && !s.skipped) router.replace("/onboarding");
  }, [router]);
  return null;
}
