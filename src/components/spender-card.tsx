import { Group } from "@/components/solvo/ui";
import type { SpenderProfile } from "@/lib/spender";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * "What kind of spender are you?" A name for the pattern, one line on what it means next to the average customer, the share of
 * everyday spending on each weekday, and a few numbers. It describes; it never tells the person what to do. No hooks, so it works
 * in a server or a client page. Logic: src/lib/spender.ts.
 */
export function SpenderCard({ profile }: { profile: SpenderProfile }) {
  const max = Math.max(...profile.byWeekday);
  return (
    <Group title="What kind of spender are you?" footer="From your payments in the last 12 months. It describes a pattern and isn't advice.">
      <div className="px-4 pt-4 pb-3">
        <p className="font-display text-[24px] leading-tight font-semibold tracking-[-0.02em]">{profile.type}</p>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">{profile.summary}</p>

        <div className="mt-4 flex h-16 items-end gap-1.5" role="img" aria-label={`Share of everyday spending by weekday, busiest ${profile.busiestDay}`}>
          {profile.byWeekday.map((share, i) => (
            <div key={LETTERS[i] + i} className="flex h-full flex-1 flex-col justify-end">
              <div
                className={`w-full rounded-t-md ${share === max ? "bg-primary" : "bg-chart-1/45"}`}
                style={{ height: `${Math.max(6, (share / max) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5 text-center text-[11px] font-medium text-muted-foreground">
          {LETTERS.map((l, i) => (
            <span key={l + i} className="flex-1">
              {l}
            </span>
          ))}
        </div>
      </div>
      <ul>
        {profile.facts.map((f) => (
          <li key={f.label} className="border-t px-4 py-3">
            <p className="text-[13px] leading-snug text-muted-foreground">{f.label}</p>
            <p className="num mt-0.5 text-[15px] leading-snug font-medium">{f.value}</p>
          </li>
        ))}
      </ul>
    </Group>
  );
}
