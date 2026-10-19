"use client";

import {Check, LoaderCircle} from "lucide-react";
import Link from "next/link";
import {useRef, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";

import {confirmPremiseProposal} from "@/app/[locale]/app/projects/[projectId]/executions/actions";

/** One proposal as the premise summary recorded it. */
type ProposalSummary = {label: string; amount: string; annualSpread: string; feeRate: string; creditTax: boolean; collateralShareOfLoan: string; covenantLimit: string; origin: string; source: string};
export type ComparisonPremiseProposalView = {
  id: string;
  status: "proposed" | "confirmed" | "superseded";
  fingerprint: string;
  summary: Record<string, unknown>;
};

function readProposals(raw: unknown): ProposalSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p) => p && typeof p === "object" && typeof (p as ProposalSummary).label === "string" ? [p as ProposalSummary] : []);
}

/** The terms of each offer and the company premises the conversation proposed for the comparison,
 * with their origin, and the single act that adopts them. Nothing is compared before confirmation. */
export function ComparisonPremisesCard({locale, projectId, proposal}: {locale: "pt-BR" | "en-US"; projectId: string; proposal: ComparisonPremiseProposalView}) {
  const t = useTranslations("ComparisonPremisesCard");
  const format = useFormatter();
  const lock = useRef(false);
  const ids = useRef({requestId: crypto.randomUUID(), definitionRequestId: crypto.randomUUID()});
  const [state, setState] = useState<{kind: "idle" | "busy" | "pending_release" | "requested" | "error"; executionId?: string | null; error?: string}>({kind: "idle"});
  const percent = (v: string, digits = 2) => format.number(Number(v), {style: "percent", maximumFractionDigits: digits});
  const millions = (v: unknown) => format.number(Number(v) / 1_000_000, {minimumFractionDigits: 1, maximumFractionDigits: 1});
  const s = proposal.summary;
  const offers = readProposals(s.proposals);
  const debt = Array.isArray(s.existingDebt) ? s.existingDebt.filter((d): d is string => typeof d === "string") : [];
  const house = Array.isArray(s.premises) ? s.premises.flatMap((p) => p && typeof p === "object" && (p as {origin?: string}).origin === "house"
    && ["creditTax", "stress"].includes((p as {key: string}).key) ? [p as {key: "creditTax" | "stress"; source: string}] : []) : [];
  async function confirm() {
    if (lock.current || proposal.status !== "proposed") return;
    lock.current = true; setState({kind: "busy"});
    try {
      const result = await confirmPremiseProposal({locale, projectId, proposalId: proposal.id, fingerprint: proposal.fingerprint, ...ids.current});
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
    <div className="investment-premises-card__group">
      <small>{t("proposals")}</small>
      <dl>{offers.map((o) => <div key={o.label}><dt>{o.label}</dt><dd>{t("proposal", {label: o.label, amount: millions(o.amount), spread: percent(o.annualSpread),
        fee: percent(o.feeRate), tax: String(o.creditTax), collateral: percent(o.collateralShareOfLoan, 0), limit: format.number(Number(o.covenantLimit), {maximumFractionDigits: 2})})}<span>{o.source}</span></dd></div>)}</dl>
    </div>
    <div className="investment-premises-card__group">
      <small>{t("company")}</small>
      <dl>
        <div><dt>{t("quarters", {count: Number(s.quarters ?? 0)})}</dt><dd>{debt.length ? t("existingDebt", {list: debt.join(", ")}) : null}</dd></div>
        {typeof s.minimumCashPolicy === "string" ? <div><dt>{t("minimumCash", {value: millions(s.minimumCashPolicy)})}</dt><dd /></div> : null}
      </dl>
    </div>
    {house.length ? <div className="investment-premises-card__group">
      <small>{t("house")}</small>
      <dl>{house.map((h) => <div key={h.key}><dt>{t(`premise.${h.key}`)}</dt><dd><span>{h.source}</span></dd></div>)}</dl>
    </div> : null}
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
