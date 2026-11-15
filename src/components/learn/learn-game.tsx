"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Award, Check, ChevronRight, Flame, GraduationCap, PiggyBank, Receipt, TrendingUp } from "lucide-react";
import { Group, IconTile, primaryButton, secondaryButton } from "@/components/solvo/ui";
import { Sheet } from "@/components/solvo/sheet";
import type { DemoMode } from "@/lib/demo-mode";
import { COURSES, LESSON_COUNT, courseState, doneToday, earnedBadges, rankTitle, streakDays, weekDots, withPractice, type Course, type Done, type Lesson } from "@/lib/learn-game";
import { finishLesson, useLearnDone } from "@/lib/learn-store";

// Home's learning game: a streak, a rank, a badge for every course finished, and three short courses. A quiz lesson is played in
// a sheet right here; a pack lesson opens in the chat with the person's own numbers. Logic: src/lib/learn-game.ts.

const ICONS: Record<string, React.ReactNode> = { investing: <TrendingUp />, everyday: <PiggyBank />, bills: <Receipt /> };

export function LearnCard({ mode }: { mode: DemoMode }) {
  const done = useLearnDone(mode);
  const [open, setOpen] = useState<{ course: Course; lesson: Lesson | null } | null>(null);
  const streak = streakDays(done);
  // Coming back from a finished lesson in the chat (/?learned=1): bring this card into view and play the streak growing.
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("learned") !== "1") return;
    window.history.replaceState(null, "", "/");
    const t = setTimeout(() => {
      setCelebrate(true);
      document.getElementById("learn-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    return () => clearTimeout(t);
  }, []);
  const finished = COURSES.flatMap((c) => c.lessons).filter((l) => done[l.id]).length;
  const badges = earnedBadges(done);

  return (
    <>
      <span id="learn-card" className="block" aria-hidden />
      <Group
        title="Learn"
        className="mt-8"
        aside={
          celebrate && doneToday(done) ? (
            <RollingStreak from={Math.max(0, streak - 1)} to={streak} />
          ) : (
            <span key={doneToday(done) ? "today" : "not"} className={`flex items-center gap-1 font-medium ${streak > 0 ? "text-warn" : ""} ${doneToday(done) ? "animate-pop" : ""}`}>
              <Flame className="size-4" aria-hidden />
              {streak > 0 ? `${streak}-day streak` : "Start a streak"}
            </span>
          )
        }
      >
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-[22px] leading-tight font-semibold tracking-[-0.015em]">{rankTitle(done)}</p>
            <p className="num text-[13px] text-muted-foreground">
              {finished} of {LESSON_COUNT} lessons
            </p>
          </div>
          <div className="mt-3 flex justify-between" aria-label="The last seven days">
            {weekDots(done).map((d, i) => (
              <span key={i} className="flex flex-col items-center gap-1">
                <span
                  className={`flex size-8 items-center justify-center rounded-full ${d.done ? "bg-primary text-primary-foreground" : d.today ? "border-2 border-dashed border-primary/50" : "bg-muted"} ${d.done && d.today ? (celebrate ? "animate-pop [animation-delay:900ms]" : "animate-pop") : ""}`}
                >
                  {d.done && <Check className="size-4" strokeWidth={3} aria-hidden />}
                </span>
                <span className={`text-[11px] ${d.today ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{d.letter}</span>
              </span>
            ))}
          </div>
          {badges.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <span key={b} className="inline-flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-[12px] font-semibold text-primary">
                  <Award className="size-3.5" aria-hidden />
                  {b}
                </span>
              ))}
            </div>
          )}
          {!doneToday(done) && <p className="mt-3 text-[13px] text-muted-foreground">{streak > 0 ? "Finish a lesson today to keep your streak." : "Finish a lesson to start a streak."}</p>}
        </div>
        {COURSES.map((c) => {
          const st = courseState(c, done);
          return (
            <button key={c.id} type="button" onClick={() => setOpen({ course: c, lesson: null })} className="flex min-h-16 w-full items-center gap-3 border-t px-4 py-3 text-left active:bg-muted">
              <IconTile tone={st.complete ? "green" : "grey"}>{st.complete ? <Award /> : ICONS[c.id]}</IconTile>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug font-medium">{c.title}</span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={st.done} aria-valuemin={0} aria-valuemax={st.total} aria-label={`${c.title}, ${st.done} of ${st.total} lessons`}>
                    <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(st.done / st.total) * 100}%` }} />
                  </span>
                  <span className="num shrink-0 text-[12px] text-muted-foreground">
                    {st.done}/{st.total}
                  </span>
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          );
        })}
      </Group>
      {open && <CourseSheet course={open.course} start={open.lesson} done={done} onClose={() => setOpen(null)} />}
    </>
  );
}

// The lessons are played in the chat (/coach?lesson=…), so the person can ask the coach about them along the way.
function CourseSheet({ course, done, onClose }: { course: Course; start?: Lesson | null; done: Done; onClose: () => void }) {
  const router = useRouter();
  const st = courseState(course, done);
  return (
    <Sheet title={course.title} onClose={onClose} hideDone>
      <p className="-mt-2 mb-3 text-[14px] text-muted-foreground">{course.blurb}</p>
      <ul className="overflow-hidden rounded-2xl bg-muted/50">
        {course.lessons.map((l, i) => {
          const finished = Boolean(done[l.id]);
          const body = (
            <>
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${finished ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                {finished ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug font-medium">{l.title}</span>
                <span className="block text-[13px] text-muted-foreground">{l.kind === "quiz" ? `${l.minutes} min, three questions` : `${l.minutes} min, with your own numbers`}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </>
          );
          const cls = "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-muted [&+&]:border-t";
          return (
            <li key={l.id}>
              {l.kind === "pack" ? (
                <Link href={`/coach?learn=${l.pack}`} className={cls}>
                  {body}
                </Link>
              ) : (
                <Link href={`/coach?lesson=${l.id}`} className={cls}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Award className="size-4 text-primary" aria-hidden />
        {st.complete ? `You earned the title ${course.badge}.` : `Finish all ${st.total} to earn the title ${course.badge}.`}
      </p>
      {st.next && (
        <button type="button" className={`${primaryButton} mt-4`} onClick={() => router.push(st.next!.kind === "quiz" ? `/coach?lesson=${st.next!.id}` : `/coach?learn=${st.next!.pack}`)}>
          <GraduationCap className="size-[18px]" aria-hidden />
          {st.done === 0 ? "Start" : "Continue"}: {st.next.title}
        </button>
      )}
    </Sheet>
  );
}

const option = "w-full rounded-2xl px-4 py-3.5 text-left text-[15px] leading-snug transition-colors";

function Quiz({ course, lesson, done, onNext, onBack, backLabel }: { course: Course; lesson: Extract<Lesson, { kind: "quiz" }>; done: Done; onNext: (l: Lesson) => void; onBack: () => void; backLabel?: string }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [wrong, setWrong] = useState(0);
  const [result, setResult] = useState<{ wrong: number; badge: string | null; from: number; to: number; dots: ReturnType<typeof weekDots> } | null>(null);
  const q = lesson.questions[i];
  const last = i === lesson.questions.length - 1;

  if (result) {
    const after = withPractice(done, lesson.id, result.wrong === 0);
    const idx = course.lessons.findIndex((l) => l.id === lesson.id);
    const nextLesson = course.lessons.slice(idx + 1).find((l) => !after[l.id]) ?? null;
    return (
      <div className="flex flex-col items-center text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-accent text-primary">{result.badge ? <Award className="size-8" /> : <Check className="size-8" strokeWidth={3} />}</span>
        <p className="mt-3 font-display text-[24px] font-semibold tracking-[-0.02em]">{result.badge ? "Course finished" : "Lesson complete"}</p>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {lesson.questions.length - result.wrong} of {lesson.questions.length} right
          {result.wrong === 0 ? ", first time" : ""}.
        </p>
        {result.badge && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[14px] font-semibold text-primary">
            <Award className="size-4" aria-hidden />
            New title: {result.badge}
          </p>
        )}
        <StreakBump from={result.from} to={result.to} dots={result.dots} />
        <div className="mt-5 flex w-full flex-col gap-3">
          {nextLesson?.kind === "quiz" && (
            <button type="button" className={primaryButton} onClick={() => onNext(nextLesson)}>
              Next: {nextLesson.title}
            </button>
          )}
          <button type="button" className={nextLesson?.kind === "quiz" ? secondaryButton : primaryButton} onClick={onBack}>
            {backLabel ?? `Back to ${course.title}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex gap-1.5" aria-label={`Question ${i + 1} of ${lesson.questions.length}`}>
        {lesson.questions.map((_, k) => (
          <span key={k} className={`h-1.5 flex-1 rounded-full ${k < i || (k === i && picked !== null) ? "bg-primary" : k === i ? "bg-primary/40" : "bg-muted"}`} />
        ))}
      </div>
      <p className="font-display text-[19px] leading-snug font-semibold tracking-[-0.01em]">{q.q}</p>
      <div className="mt-4 flex flex-col gap-2" role="group" aria-label="Answers">
        {q.options.map((o, k) => {
          const state = picked === null ? "bg-muted active:bg-muted/70" : k === q.correct ? "bg-accent ring-2 ring-primary" : k === picked ? "bg-warn-soft ring-2 ring-warn" : "bg-muted opacity-60";
          return (
            <button
              key={o}
              type="button"
              disabled={picked !== null}
              onClick={() => {
                setPicked(k);
                if (k !== q.correct) setWrong((w) => w + 1);
              }}
              className={`${option} ${state}`}
            >
              {o}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <>
          <p className="mt-4 text-[14px] leading-snug">
            <span className="font-semibold">{picked === q.correct ? "Right. " : "Not quite. "}</span>
            {q.why}
          </p>
          <button
            type="button"
            className={`${primaryButton} mt-5`}
            onClick={() => {
              if (!last) {
                setI(i + 1);
                setPicked(null);
                return;
              }
              const before = courseState(course, done).complete;
              finishLesson(lesson.id, wrong === 0);
              const after = withPractice(done, lesson.id, wrong === 0);
              setResult({ wrong, badge: !before && courseState(course, after).complete ? course.badge : null, from: streakDays(done), to: streakDays(after), dots: weekDots(after) });
            }}
          >
            {last ? "Finish" : "Next"}
          </button>
        </>
      )}
    </div>
  );
}

/** The streak after a lesson: today's dot fills in, the flame pops, and the number rolls up (2 to 3) when the streak grew. */
export function StreakBump({ from, to, dots }: { from: number; to: number; dots: ReturnType<typeof weekDots> }) {
  const [shown, setShown] = useState(from);
  useEffect(() => {
    const t = setTimeout(() => setShown(to), 750);
    return () => clearTimeout(t);
  }, [to]);
  const grew = to > from;
  return (
    <div className="mt-4 flex flex-col items-center gap-3">
      <div className="flex gap-2" aria-hidden>
        {dots.map((d, i) => (
          <span
            key={i}
            className={`flex size-7 items-center justify-center rounded-full ${d.done ? "bg-primary text-primary-foreground" : "bg-muted"} ${d.today ? "animate-pop [animation-delay:350ms]" : ""}`}
          >
            {d.done && <Check className="size-3.5" strokeWidth={3} />}
          </span>
        ))}
      </div>
      <p key={shown} className={`flex items-center gap-1.5 text-[17px] font-semibold text-warn ${grew && shown === to ? "animate-pop" : ""}`}>
        <Flame className={`size-5 ${grew && shown === to ? "animate-bounce" : ""}`} aria-hidden />
        {shown}-day streak{grew && shown === to ? "!" : ""}
      </p>
    </div>
  );
}

/** Home, after a lesson in the chat: the streak rolls up a day (2 to 3), the flame bounces and the text pops. */
function RollingStreak({ from, to }: { from: number; to: number }) {
  const [shown, setShown] = useState(from);
  useEffect(() => {
    const t = setTimeout(() => setShown(to), 1200);
    return () => clearTimeout(t);
  }, [to]);
  const grown = shown === to && to > from;
  return (
    <span key={shown} className={`flex items-center gap-1 font-semibold text-warn ${grown ? "animate-pop" : ""}`}>
      <Flame className={`size-4 ${grown ? "animate-bounce" : ""}`} aria-hidden />
      {shown}-day streak{grown ? "!" : ""}
    </span>
  );
}

/** A Home lesson played in the chat: the questions as a card, then follow-up questions for the coach and End session. */
export function ChatLesson({ lessonId, mode }: { lessonId: string; mode: DemoMode; onAsk?: (q: string) => void }) {
  const router = useRouter();
  const done = useLearnDone(mode);
  const course = COURSES.find((c) => c.lessons.some((l) => l.id === lessonId));
  const [current, setCurrent] = useState(() => course?.lessons.find((l) => l.id === lessonId) ?? null);
  if (!course || !current || current.kind !== "quiz") return null;
  return (
    <section aria-label={`Lesson: ${current.title}`} className="rounded-[24px] bg-card p-4 shadow-[0_1px_3px_rgba(15,42,31,0.06),0_10px_30px_-18px_rgba(15,42,31,0.35)]">
      <p className="mb-3 text-[11px] font-semibold tracking-[0.06em] text-primary uppercase">{course.title} · {current.title}</p>
      <Quiz
        key={current.id}
        course={course}
        lesson={current}
        done={done}
        onNext={(l) => setCurrent(l)}
        onBack={() => router.push("/?learned=1")}
        backLabel="End session"
      />
    </section>
  );
}
