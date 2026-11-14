"use client";

import { CalendarConnect } from "@/components/calendar-connect";
import { Toggle } from "@/components/solvo/toggle";
import { LiveNordea } from "@/components/live-nordea";
import { OtherBanks } from "@/components/other-banks";
import type { BankId, View } from "@/lib/banks";
import type { GoogleStatus } from "@/lib/google-calendar";
import type { LinkStatus } from "@/lib/ics-link";
import type { LiveStatus } from "@/lib/live-nordea";

import {
  Bell,
  Check,
  FileText,
  PhoneCall,
  PiggyBank,
  ShieldCheck,
  Target,
} from "lucide-react";
import {
  Chip,
  Group,
  IconTile,
  PAGE,
  Row,
  TopBar,
  eur,
  secondaryButton,
} from "@/components/solvo/ui";
import { UNPAID } from "@/data/reminders";
import { MoneySkills } from "@/components/learn/money-skills";
import { useLearnProgress } from "@/lib/learn-store";
import {
  clearCachedReadings,
  resetDemo,
  setDemoMode,
  useDemoMode,
  type DemoMode,
  useBillActions,
  useCachedReadings,
  useSavingsPlan,
  useSwitches,
} from "@/lib/switches";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

export function ProfileClient(props: {
  name: string;
  id: string;
  age: number;
  postalCode: string;
  savingsGoal: number;
  banks: BankId[];
  view: View;
  showBanks: boolean; // the Other banks picker; always on (real Nordea merges into the same picture as any other bank)
  live: LiveStatus; // the real, local-only Nordea connection; renders nothing unless the app runs with SOLVO_LIVE=1
  calendar: { google: GoogleStatus; link: LinkStatus; notice: string | null }; // the calendar Solvo reads to foresee trips and dinners
  linkedBank: { enabled: boolean; linked: { bank: string; validUntil: string } | null; notice: string | null }; // Enable Banking sandbox bank
}) {
  const mode = useDemoMode();
  const switches = Object.values(useSwitches()).filter((s) => !!s);
  const plan = useSavingsPlan();
  const readCount = Object.keys(useCachedReadings()).length;
  const bills = useBillActions();
  const paid = bills[UNPAID.id]?.action === "paid";
  const learned = Object.keys(useLearnProgress().done).length > 0;
  const anything =
    switches.length > 0 || !!plan || Object.keys(bills).length > 0;
  const name = mode === "new" ? "New customer" : props.name;
  const initials = name
    .split(" ")
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <main className={PAGE}>
      <TopBar />
      <section className="mt-4 flex items-center gap-4">
        <span className="flex size-16 items-center justify-center rounded-full bg-slab font-display text-[22px] font-semibold text-mint">
          {initials}
        </span>
        <div>
          <h1 className="font-display text-[26px] leading-tight font-semibold tracking-[-0.02em]">
            {name}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {props.age} years, {props.postalCode} Espoo{mode === "new" ? ", first time in Solvo" : ""}
          </p>
        </div>
      </section>

      <Group
        title="Demo account"
        footer={
          mode === "new"
            ? "A first-time customer with their own bank data (another customer in the S-Pankki dataset). Starts with onboarding."
            : "Switching starts the account from scratch: approvals and plans are cleared."
        }
      >
        <div className="flex gap-2 p-2" role="radiogroup" aria-label="Demo account">
          {(
            [
              ["aino", "Aino", "Set up, with history"],
              ["new", "New customer", "Starts with onboarding"],
            ] as [DemoMode, string, string][]
          ).map(([m, label, sub]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => {
                if (m === mode) return;
                setDemoMode(m);
                // A full load, so every screen is rendered again from the other customer's data.
                window.location.assign(m === "new" ? "/onboarding" : "/");
              }}
              className={`flex min-h-14 flex-1 flex-col items-start justify-center rounded-xl px-3 py-2 text-left ${mode === m ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              <span className="text-[15px] font-semibold">{label}</span>
              <span className={`text-[12px] ${mode === m ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{sub}</span>
            </button>
          ))}
        </div>
      </Group>

      <Group
        title="What you've approved"
        footer="Solvo never switches, pays or saves without your tap."
      >
        {!anything && (
          <Row
            icon={
              <IconTile tone="grey">
                <ShieldCheck />
              </IconTile>
            }
            title="Nothing yet"
            subtitle="Switches, payments and savings plans you approve show up here."
          />
        )}
        {switches.map((s) => (
          <Row
            key={s.bill}
            icon={
              <IconTile>
                <Check />
              </IconTile>
            }
            title={`${s.fromSupplier} → ${s.toSupplier}`}
            subtitle={
              s.startDate
                ? `Switch approved, starts ${dateFmt.format(new Date(s.startDate))}`
                : "Switch approved"
            }
            value={`${eur.format(s.yearlySaving)}`}
            valueSub="saved a year"
          />
        ))}
        {plan && (
          <Row
            icon={
              <IconTile>
                <PiggyBank />
              </IconTile>
            }
            title={plan.fundName}
            subtitle={`Monthly savings plan, on the ${plan.dayOfMonth}nd`}
            value={eur.format(plan.monthly)}
            valueSub="a month"
          />
        )}
        {paid && (
          <Row
            icon={
              <IconTile>
                <Check />
              </IconTile>
            }
            title={`Paid ${UNPAID.supplier}`}
            subtitle="From your set-aside for irregular costs"
            value={eur.format(UNPAID.amount)}
          />
        )}
      </Group>

      <MoneySkills />

      <Group title="Solvo settings">
        <Row
          icon={
            <IconTile>
              <FileText />
            </IconTile>
          }
          title="Read my e-invoices"
          subtitle="Find each contract and what it costs"
          value={<Toggle label="Read my e-invoices" />}
        />
        <Row
          icon={
            <IconTile>
              <PhoneCall />
            </IconTile>
          }
          title="Call me before a bill is late"
          subtitle="A short voice call, never a collection call"
          value={<Toggle label="Call me before a bill is late" />}
        />
        <Row
          icon={
            <IconTile>
              <Bell />
            </IconTile>
          }
          title="Contract end dates"
          subtitle="Remind me 30 days before a contract ends"
          value={<Toggle label="Contract end dates" />}
        />
        <Row
          icon={
            <IconTile>
              <Target />
            </IconTile>
          }
          title="Savings goal"
          subtitle="Kept out of your weekly budget"
          value={eur.format(props.savingsGoal)}
          valueSub="a month"
        />
      </Group>
      {readCount > 0 && (
        <button
          type="button"
          onClick={clearCachedReadings}
          className="mt-2 flex min-h-11 items-center px-1 text-[13px] font-medium text-primary underline underline-offset-4"
        >
          Read my {readCount} e-invoices again with Gemini
        </button>
      )}

      <LiveNordea status={props.live} />

      {(props.showBanks || props.linkedBank.enabled) && <OtherBanks banks={props.showBanks ? props.banks : []} view={props.view} sandbox={props.linkedBank} live={props.live} />}

      <CalendarConnect {...props.calendar} />

      <Group
        title="Your data"
        footer="Solvo works on the e-invoices and payments that already reach your bank. Nothing is sent to suppliers until you approve a switch."
      >
        <Row
          title="Data in this demo"
          subtitle="S-Pankki's synthetic Junction 2026 dataset"
          value={<Chip>{props.id}</Chip>}
        />
      </Group>

      {(anything || learned) && (
        <button
          type="button"
          onClick={resetDemo}
          className={`${secondaryButton} mt-7`}
        >
          Reset demo
        </button>
      )}
    </main>
  );
}
