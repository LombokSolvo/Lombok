"use client";

import { useEffect } from "react";
import { readDemoMode, setDemoMode, syncDemoCookie } from "@/lib/switches";

/**
 * On Home. The public app shows Aino only (the "New customer" switch was removed), so a browser that had picked the new
 * customer goes back to Aino once. Aino is already set up and is never sent to onboarding; /onboarding stays reachable
 * by its address.
 */
export function OnboardingGate() {
  useEffect(() => {
    // A browser that chose its demo account before the server could see it: fix the cookie and reload once.
    if (syncDemoCookie()) return window.location.reload();
    if (readDemoMode() === "new") {
      setDemoMode("aino");
      window.location.reload();
    }
  }, []);
  return null;
}
