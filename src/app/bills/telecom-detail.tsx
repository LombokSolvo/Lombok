"use client";

import { useMemo, useState } from "react";
import { Group, PageTitle, eur, eur2 } from "@/components/solvo/ui";
import type { Reading } from "@/lib/einvoice";
import { approveSwitch, useSavingsPlan, useSwitches, weeklyBoost } from "@/lib/switches";
import { Gauge, Leaf } from "lucide-react";
import {
  DEFAULT_TELECOM_PREFERENCE,
  compareTelecom,
  telecomTermsFrom,
  type TelecomPreference,
  type TelecomTerms,
} from "@/lib/telecom-offers";
import { SAVED_TELECOM_DB, domainOf, type TelecomDb } from "@/lib/market";
import { MarketAgentCard, agentHasRun } from "./market-agent-card";
import { PreferencePicker } from "./preference-picker";
import { OfferFacts } from "./offer-facts";
import { ApproveSheet, DoneView, EditField, InfoRow, OfferOption, ReadFields, SavingSlab, StickyAction } from "./switch-ui";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

// Telecom contracts here are open-ended with one month's notice, so a switch starts on the first day
// of the month after next.
function startDateFrom(asOf: string) {
  const d = new Date(`${asOf}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 1)).toISOString().slice(0, 10);
}

export function TelecomDetail(props: {
  reading: Reading;
  badge: React.ReactNode;
  weeklyBudget: number;
  remaining: number;
  asOf: string;
}) {
  const r = props.reading;
  const [terms, setTerms] = useState<TelecomTerms>(() => telecomTermsFrom(r));
  const [db, setDb] = useState<TelecomDb>(SAVED_TELECOM_DB);
  const [ran, setRan] = useState(() => agentHasRun("telecom")); // offers appear once the agent has run
  const revealOffers = () => {
    setRan(true);
    // Bring the saving into view: it appears at the top of the screen.
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 600);
  };
  const [preference, setPreference] = useState<TelecomPreference>(DEFAULT_TELECOM_PREFERENCE);
  const cmp = useMemo(() => compareTelecom(terms, db, preference), [terms, db, preference]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const prefer = (p: Partial<TelecomPreference>) => {
    setPreference((x) => ({ ...x, ...p }));
    setChosenId(null); // the coach's new pick becomes the selection
  };
  const chosen = cmp.offers.find((o) => o.id === chosenId) ?? cmp.recommended;
  const [stage, setStage] = useState<"compare" | "confirm" | "done">("compare");
  const switches = useSwitches();
  const plan = useSavingsPlan();
  const startDate = startDateFrom(props.asOf);
  const perWeek = Math.max(0, chosen.saving) / 52;
  const isMatch = chosen.kind === "price_match";

  if (stage === "done") {
    const boost = weeklyBoost(switches, plan);
    return (
      <DoneView
        title={isMatch ? "Price-match request sent" : "Switch requested"}
        body={
          isMatch ? (
            <>Solvo asked {r.supplier} to lower your price. We&apos;ll tell you their answer.</>
          ) : (
            <>
              {chosen.operator} {chosen.product} starts {fmtDate(startDate)}. Your phone numbers move with you, and{" "}
              {chosen.operator} cancels your {r.supplier} contract for you.
            </>
          )
        }
        steps={
          isMatch
            ? [
                { title: "Approved with your bank ID", detail: "You approved the request in the bank app." },
                { title: `Request sent to ${r.supplier}`, detail: "Solvo shows them the lower public price it found." },
                { title: "Their answer", detail: "Solvo tells you what they say." },
                { title: "Next e-invoice checked", detail: "If they agree, Solvo checks the new price on your next e-invoice." },
              ]
            : [
                { title: "Signed with your bank ID", detail: "You approved the switch in the bank app, so no separate contract to sign." },
                { title: `Order sent to ${chosen.operator}`, detail: "Solvo passes the order to the new operator through a partner interface." },
                {
                  title: "Numbers moved",
                  detail: `${chosen.operator} ports your numbers in 1 to 3 working days, which ends your ${r.supplier} contract automatically.`,
                },
                {
                  title: "First new e-invoice checked",
                  detail: `When ${chosen.operator}'s first e-invoice reaches your bank, Solvo checks the price matches the offer.`,
                },
              ]
        }
        remainingBefore={props.remaining + boost - perWeek}
        remainingAfter={props.remaining + boost}
        perWeek={perWeek}
        footnote={
          chosen.saving < 0 ? (
            <>You chose a plan that costs {eur.format(-chosen.saving)} more a year. Solvo has included it in your bills.</>
          ) : (
          <>
            Your weekly budget is now {eur.format(props.weeklyBudget + boost)}, up from {eur.format(props.weeklyBudget)},
            because your fixed costs got smaller. That&apos;s {eur.format(Math.max(0, chosen.saving))} a year.
          </>
          )
        }
      />
    );
  }

  const set = (k: keyof TelecomTerms) => (v: number | null) => setTerms((t) => ({ ...t, [k]: Math.max(0, v ?? 0) }));
  // An emptied speed counts as unknown (1000 Mbit/s in the comparison) until the person types one.
  const setSpeed = (k: "lineSpeedMbps" | "homeSpeedMbps") => (v: number | null) =>
    setTerms((t) => ({ ...t, [k]: v && v > 0 ? v : undefined }));

  return (
    <div className="flex flex-col pb-24">
      <PageTitle title="Your phone and internet">
        Your current contract, as read from your latest e-invoice.
      </PageTitle>

      {ran && (
        <SavingSlab
          label={chosen.saving < 0 ? "This choice costs you more" : isMatch ? "Asking for a better price saves" : "Switching saves you"}
          saving={Math.abs(chosen.saving)}
          before={{ label: `Do nothing, ${eur2.format(cmp.currentMonthly)} a month`, yearly: cmp.current }}
          after={{ label: `${chosen.operator}${chosen.kind === "switch" ? ` ${chosen.product}` : ", price match"}`, yearly: chosen.yearly }}
          footnote={
            chosen.saving < 0 ? (
              <>More than you pay today.</>
            ) : (
              <>That&apos;s +{eur.format(perWeek)} to your safe-to-spend every week.</>
            )
          }
        />
      )}

      <ReadFields badge={props.badge}>
        <InfoRow label="Operator">{r.supplier}</InfoRow>
        <InfoRow label="Contract">{r.product.split(/\s*(?:&|\+)\s*/).map((part, i) => <span key={i} className="block">{part}</span>)}</InfoRow>
        <InfoRow label="Type">Valid until further notice</InfoRow>
        <InfoRow label="Notice period">One month</InfoRow>
        <InfoRow label="Latest invoice">
          {eur2.format(r.total)}, due {fmtDate(r.dueDate)}
        </InfoRow>
        <EditField label="Mobile lines" value={terms.lines} unit="lines" step="1" min={0} onChange={set("lines")} />
        <EditField label="Price per line" value={terms.perLine} unit="€/mo" min={0} onChange={set("perLine")} />
        <EditField label="Mobile speed" value={terms.lineSpeedMbps ?? null} unit="Mbit/s" step="1" min={0} onChange={setSpeed("lineSpeedMbps")} />
        <EditField label="Home internet" value={terms.homeInternet} unit="€/mo" min={0} onChange={set("homeInternet")} />
        <EditField label="Home internet speed" value={terms.homeSpeedMbps ?? null} unit="Mbit/s" step="1" min={0} onChange={setSpeed("homeSpeedMbps")} />
      </ReadFields>

      <MarketAgentCard
        db={db}
        onResult={setDb}
        onFinished={revealOffers}
        shortlist={cmp.offers.map((o) => o.id)}
        forYou={
          <>
            For you it compares plans at every speed for your {terms.lines} {terms.lines === 1 ? "line" : "lines"}, and
            tells you when a slower plan is still enough.
          </>
        }
      />

      {ran && (
        <>
          <PreferencePicker
            title="How fast does it need to be?"
            value={preference.speed}
            onChange={(speed) => prefer({ speed })}
            options={[
              { value: "slower", label: "A bit slower is fine" },
              { value: "same", label: "Same speed" },
              { value: "faster", label: "Faster", icon: <Gauge className="size-4 shrink-0" aria-hidden /> },
            ]}
          />
          <PreferencePicker
            value={preference.priority}
            onChange={(priority) => prefer({ priority })}
            options={[
              { value: "price", label: "Lowest price" },
              { value: "sustainable", label: "Sustainable", icon: <Leaf className="size-4 shrink-0" aria-hidden /> },
            ]}
          />
        </>
      )}

      {ran && (
        <Group
          title="Your options for a year"
          aside={`${terms.lines} ${terms.lines === 1 ? "line" : "lines"} + internet`}
        >
          <div role="radiogroup" aria-label="Phone and internet offers">
            {cmp.offers.map((o) => (
              <OfferOption
                key={o.id}
                chosen={o.id === chosen.id}
                onSelect={() => setChosenId(o.id)}
                title={`${o.operator}${o.kind === "switch" ? ` ${o.product}` : ""}`}
                yearly={o.yearly}
                detail={
                  <OfferFacts
                    rows={[
                      ...(o.kind === "price_match" ? [["What", o.product] as [string, React.ReactNode]] : []),
                      ["Speed", o.lineSpeed],
                      ["Per line", `${eur2.format(o.perLine)}/mo`],
                      ["Home internet", o.homeInternet != null ? `${o.homeSpeed}, ${eur2.format(o.homeInternet)}/mo` : "Keep your current one"],
                      ["Contract", "Until further notice"],
                      ...(o.note && !/^no fixed term$/i.test(o.note) ? [["Good to know", o.note] as [string, React.ReactNode]] : []),
                      ...(o.climate
                        ? [[
                            "Climate",
                            <span key="c" className="inline-flex items-start gap-1">
                              <Leaf className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                              {o.climate}
                            </span>,
                          ] as [string, React.ReactNode]]
                        : []),
                      ...(o.sourceUrl && o.checkedAt ? [["Source", `${domainOf(o.sourceUrl)}, ${fmtDate(o.checkedAt)}`] as [string, React.ReactNode]] : []),
                    ]}
                  />
                }
                pick={o.id === cmp.recommended.id ? cmp.pickReason : undefined}
              />
            ))}
          </div>
        </Group>
      )}


      {ran && (
        <StickyAction onClick={() => setStage("confirm")}>
          {isMatch ? `Ask ${r.supplier} for a better price` : `Switch to ${chosen.operator}`}
        </StickyAction>
      )}

      {stage === "confirm" && (
        <ApproveSheet
          title={isMatch ? "You approve this request" : "You approve this switch"}
          points={
            isMatch
              ? [`Solvo asks ${r.supplier} to lower your lines to ${eur2.format(chosen.perLine)} a month.`, "Your contract and numbers stay the same."]
              : [
                  `New contract: ${chosen.operator} ${chosen.product}, from ${fmtDate(startDate)}.`,
                  `Your phone numbers move with you. ${chosen.operator} cancels ${r.supplier} for you.`,
                  "No switching fees. You can cancel within 14 days.",
                ]
          }
          confirmLabel={isMatch ? "Send request" : "Approve switch"}
          onCancel={() => setStage("compare")}
          onConfirm={() => {
            approveSwitch({
              bill: "telecom",
              fromSupplier: r.supplier,
              toSupplier: chosen.operator,
              toProduct: isMatch ? "price match" : chosen.product,
              yearlySaving: Math.max(0, chosen.saving),
              startDate: isMatch ? null : startDate,
              approvedAt: new Date().toISOString(),
            });
            setStage("done");
          }}
        />
      )}
    </div>
  );
}
