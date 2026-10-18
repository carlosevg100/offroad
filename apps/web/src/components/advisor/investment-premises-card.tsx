"use client";

import {Check, LoaderCircle} from "lucide-react";
import Link from "next/link";
import {useRef, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";

import {confirmInvestmentPremises} from "@/app/[locale]/app/projects/[projectId]/executions/actions";

/** One premise as the proposal recorded it: its value, where it came from and the cited source. */
type Fact = {value: unknown; origin: "document" | "informed" | "house"; source: string};
export type InvestmentPremiseProposalView = {
  id: string;
  status: "proposed" | "confirmed" | "superseded";
  fingerprint: string;
  facts: Record<string, unknown>;
};

const premiseKeys = ["capex", "operationStart", "ramp", "annualIncrementalRevenue", "annualDisplacedPurchases", "annualNewVariableCost",
  "annualNewFixedCost", "annualMaintenance", "usefulLifeYears", "annualGrowth", "cashTaxRate", "receivableDays", "inventoryDays",
  "newSupplierDays", "lostSupplierDays", "discountRate", "workingCapitalReturnsAtEnd"] as const;
type PremiseKey = (typeof premiseKeys)[number];
const origins = ["document", "informed", "house"] as const;
const money = new Set<PremiseKey>(["annualIncrementalRevenue", "annualDisplacedPurchases", "annualNewVariableCost", "annualNewFixedCost", "annualMaintenance"]);
const days = new Set<PremiseKey>(["receivableDays", "inventoryDays", "newSupplierDays", "lostSupplierDays"]);
const ratios = new Set<PremiseKey>(["annualGrowth", "cashTaxRate", "discountRate"]);

function readFact(raw: unknown): Fact | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  return (f.origin === "document" || f.origin === "informed" || f.origin === "house") && typeof f.source === "string" ? {value: f.value, origin: f.origin, source: f.source} : null;
}

/** The premises the conversation proposed, grouped by origin, and the single act that adopts them.
 * Nothing is calculated before the person confirms; a correction in the conversation replaces the card. */
export function InvestmentPremisesCard({locale, projectId, proposal}: {locale: "pt-BR" | "en-US"; projectId: string; proposal: InvestmentPremiseProposalView}) {
  const t = useTranslations("InvestmentPremisesCard");
  const format = useFormatter();
  const lock = useRef(false);
  const ids = useRef({requestId: crypto.randomUUID(), definitionRequestId: crypto.randomUUID()});
  const [state, setState] = useState<{kind: "idle" | "busy" | "pending_release" | "requested" | "error"; executionId?: string | null; error?: string}>({kind: "idle"});
  const millions = (v: unknown) => t("money", {value: format.number(Number(v) / 1_000_000, {minimumFractionDigits: 1, maximumFractionDigits: 1})});
  const display = (key: PremiseKey, value: unknown): string => {
    if (key === "capex" && Array.isArray(value)) return value.map(c => t("capexYear", {year: (c as {year: number}).year, amount: millions((c as {amount: string}).amount)})).join("; ");
    if (key === "operationStart" && typeof value === "string") return format.dateTime(new Date(`${value}T12:00:00Z`), {month: "long", year: "numeric"});
    if (key === "ramp" && value && typeof value === "object") {
      const r = value as {stageMonths: number[]; stageLoads: string[]};
      return r.stageMonths.map((m, i) => t("rampStage", {months: m, load: format.number(Number(r.stageLoads[i]), {style: "percent"})})).join("; ");
    }
    if (key === "usefulLifeYears") return t("years", {count: Number(value)});
    if (key === "workingCapitalReturnsAtEnd") return value ? t("yes") : t("no");
    if (money.has(key)) return millions(value);
    if (days.has(key)) return t("days", {count: Number(value)});
    if (ratios.has(key)) return format.number(Number(value), {style: "percent", maximumFractionDigits: 1});
    return String(value);
  };
  const rows = premiseKeys.flatMap(key => {const f = readFact(proposal.facts[key]); return f ? [{key, ...f}] : [];});
  async function confirm() {
    if (lock.current || proposal.status !== "proposed") return;
    lock.current = true; setState({kind: "busy"});
    try {
      const result = await confirmInvestmentPremises({locale, projectId, proposalId: proposal.id, fingerprint: proposal.fingerprint, ...ids.current});
      if (result.ok) setState({kind: result.calculation, executionId: result.executionId});
      else setState({kind: "error", error: result.error});
    } catch {
      setState({kind: "error", error: "unavailable"});
    } finally {
      lock.current = false;
    }
  }
  const confirmed = proposal.status === "confirmed" || state.kind === "pending_release" || state.kind === "requested";
  return <section aria-label={t("title")} className="investment-premises-card">
    <header><strong>{t("title")}</strong><p>{t("lead")}</p></header>
    {origins.map(origin => {
      const group = rows.filter(r => r.origin === origin);
      return group.length ? <div className="investment-premises-card__group" key={origin}>
        <small>{t(`origin.${origin}`)}</small>
        <dl>{group.map(r => <div key={r.key}><dt>{t(`premise.${r.key}`)}</dt><dd>{display(r.key, r.value)}<span>{r.source}</span></dd></div>)}</dl>
      </div> : null;
    })}
    <p className="investment-premises-card__cases">{t("cases")}</p>
    {proposal.status === "superseded" ? <p>{t("superseded")}</p>
      : confirmed ? <p className="investment-premises-card__done"><Check aria-hidden="true" size={13} />{state.kind === "requested" ? t("requested") : t("pendingRelease")}
        {state.kind === "requested" && state.executionId ? <> <Link href={`/${locale}/app/projects/${projectId}/executions/${state.executionId}`}>{t("openCalculation")}</Link></> : null}</p>
      : <button type="button" className="button button--primary" disabled={state.kind === "busy"} onClick={confirm}>
        {state.kind === "busy" ? <><LoaderCircle aria-hidden="true" className="spin" size={13} />{t("confirming")}</> : t("confirm")}
      </button>}
    {state.kind === "error" ? <p role="alert" className="investment-premises-card__error">{state.error === "company_unregistered" ? t("errors.companyUnregistered")
      : state.error === "superseded" ? t("superseded") : t("errors.unavailable")}</p> : null}
  </section>;
}
