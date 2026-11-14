"use client";

// Profile's "Money skills" row: the learning packs, which ones are finished, and a light streak.
import Link from "next/link";
import { Check, ChevronRight, GraduationCap } from "lucide-react";
import { LevelTwoSoon } from "@/components/learn/learn-pack";
import { plainFormat } from "@/lib/demo-clock";
import { Group, IconTile } from "@/components/solvo/ui";
import { learnStreak, useLearnProgress } from "@/lib/learn-store";
import { LEVEL, PACK_IDS, PACK_META as packs } from "@/lib/learn";

// Finish dates are real dates, so they skip the demo clock's shift.
const dateFmt = plainFormat({ day: "numeric", month: "short" });

export function MoneySkills() {
  const p = useLearnProgress();
  const count = PACK_IDS.filter((id) => p.done[id]).length;
  const streak = learnStreak(p);
  return (
    <Group
      title={LEVEL.label}
      aside={`${count} of ${packs.length} done${streak > 1 ? ` · ${streak}-day streak` : ""}`}
    >
      <div className="flex gap-1 px-4 pt-3.5" aria-hidden>
        {/* Fills from the left by how many are done, whichever packs they are. */}
        {packs.map((k, i) => (
          <span key={k.id} className={`h-1.5 flex-1 rounded-full ${i < count ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      {packs.map((k) => {
        const done = p.done[k.id];
        return (
          <Link
            key={k.id}
            href={`/coach?learn=${k.id}`}
            transitionTypes={["nav-forward"]}
            className="flex min-h-14 items-center gap-3 px-4 py-3 active:bg-muted [&+&]:border-t"
          >
            <IconTile tone={done ? "green" : "grey"}>{done ? <Check /> : <GraduationCap />}</IconTile>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-snug font-medium">{k.title}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                {done
                  ? `Finished ${dateFmt(done.at.slice(0, 10))}${done.quizRight ? ", quiz right first time" : ""}`
                  : `${k.minutes} min, quiz and your own numbers`}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        );
      })}
      {count === packs.length && <LevelTwoSoon className="m-3 mt-0" />}
    </Group>
  );
}
