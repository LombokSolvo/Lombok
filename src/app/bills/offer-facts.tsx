// The facts about one offer as short labelled rows, so offers can be compared line by line.
// Phrasing content only (spans), because it sits inside the offer's radio button.
import type { ReactNode } from "react";

export function OfferFacts({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <span className="mt-1 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
      {rows.map(([label, value]) => (
        <span key={label} className="contents">
          <span className="text-muted-foreground">{label}</span>
          <span className="min-w-0 text-foreground/85">{value}</span>
        </span>
      ))}
    </span>
  );
}
