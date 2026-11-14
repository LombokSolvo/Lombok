"use client";

import { useState } from "react";

/** iOS-style on/off switch. 51x31 like iOS, inside a 44px tap area. The demo keeps the choice for this visit only. */
export function Toggle({ label, defaultOn = true }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => setOn((v) => !v)}
      className="-my-2 -mr-1.5 flex h-11 items-center px-1.5"
    >
      <span
        className={`relative h-[31px] w-[51px] rounded-full transition-colors duration-200 ${on ? "bg-primary" : "bg-input"}`}
      >
        <span
          className={`absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] ${on ? "translate-x-5" : ""}`}
        />
      </span>
    </button>
  );
}
