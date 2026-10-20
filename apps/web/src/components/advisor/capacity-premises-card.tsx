"use client";

import {Check, LoaderCircle} from "lucide-react";
import Link from "next/link";
import {useRef, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";

import {confirmPremiseProposal} from "@/app/[locale]/app/projects/[projectId]/executions/actions";

type Sourced = {origin: string; source: string};
type CaseSummary = Sourced & {id: string; role: string; label: string; use: string};
type LimitSummary = Sourced & {id: string; label: string};
export type CapacityPremiseProposalView = {
  id: string;
  status: "proposed" | "confirmed" | "superseded";
  fingerprint: string;
  summary: Record<string, unknown>;
};

const listOf = <T extends {label: string}>(raw: unknown): T[] =>
  Array.isArray(raw) ? raw.flatMap((x) => x && typeof x === "object" && typeof (x as T).label === "string" ? [x as T] : []) : [];

/** The schedules of use, the structure of the new debt and the limits the conversation proposed for
 * the capacity analysis, each with its origin, and the single act that adopts them. Nothing is
 * calculated before confirmation. */
export function CapacityPremisesCard({locale, projectId, proposal}: {locale: "pt-BR" | "en-US"; projectId: string; proposal: CapacityPremiseProposalView}) {
  const t = useTranslations("CapacityPremisesCard");
  const format = useFormatter();
  const lock = useRef(false);
  const ids = useRef({requestId: crypto.randomUUID(), definitionRequestId: crypto.randomUUID()});
  const [state, setState] = useState<{kind: "idle" | "busy" | "pending_release" | "requested" | "error"; executionId?: string | null; error?: string}>({kind: "idle"});
  const millions = (v: unknown) => format.number(Number(v) / 1_000_000, {minimumFractionDigits: 1, maximumFractionDigits: 1});
  const s = proposal.summary;
  const cases = listOf<CaseSummary>(s.cases);
  const limits = listOf<LimitSummary>(s.limits);
  const structure = s.structure && typeof s.structure === "object" && typeof (s.structure as {label?: unknown}).label === "string"
    ? s.structure as Sourced & {label: string; finalPaymentDate: string} : null;
  const house = Array.isArray(s.premises) ? s.premises.flatMap((p) => p && typeof p === "object" && (p as {origin?: string}).origin === "house"
    && (p as {key: string}).key === "stress" ? [p as {key: "stress"; source: string}] : []) : [];
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
      <small>{t("schedules")}</small>
      <dl>{cases.map((c) => <div key={c.id}><dt>{c.label}</dt><dd>{t("schedule", {use: millions(c.use), informed: String(c.role === "informed")})}<span>{c.source}</span></dd></div>)}</dl>
    </div>
    <div className="investment-premises-card__group">
      <small>{t("company")}</small>
      <dl>
        <div><dt>{t("years", {count: Number(s.years ?? 0), first: String(s.firstYear ?? ""), last: String(s.lastYear ?? "")})}</dt><dd>{typeof s.requestedAmount === "string" ? t("requested", {value: millions(s.requestedAmount)}) : null}</dd></div>
        {structure ? <div><dt>{t("structure", {label: structure.label, year: structure.finalPaymentDate.slice(0, 4)})}</dt><dd><span>{structure.source}</span></dd></div> : null}
      </dl>
    </div>
    <div className="investment-premises-card__group">
      <small>{t("limits")}</small>
      <dl>{limits.map((l) => <div key={l.id}><dt>{l.label}</dt><dd><span>{l.origin === "house" ? t("houseLimit") : l.source}</span></dd></div>)}</dl>
    </div>
    {house.length ? <div className="investment-premises-card__group">
      <small>{t("house")}</small>
      <dl>{house.map((h) => <div key={h.key}><dt>{t(`premise.${h.key}`)}</dt><dd><span>{h.source}</span></dd></div>)}</dl>
    </div> : null}
    <p className="investment-premises-card__cases">{t("cases")}</p>
    {proposal.status === "superseded" ? <p>{t("superseded")}</p>
      : confirmed ? <p className="investment-premises-card__done"><Check aria-hidden="true" size={13} />{state.kind === "requested" ? t("calculating") : t("pendingRelease")}
        {state.kind === "requested" && state.executionId ? <> <Link href={`/${locale}/app/projects/${projectId}/executions/${state.executionId}`}>{t("openCalculation")}</Link></> : null}</p>
      : <button type="button" className="button button--primary" disabled={state.kind === "busy"} onClick={confirm}>
        {state.kind === "busy" ? <><LoaderCircle aria-hidden="true" className="spin" size={13} />{t("confirming")}</> : t("confirm")}
      </button>}
    {state.kind === "error" ? <p role="alert" className="investment-premises-card__error">{state.error === "company_unregistered" ? t("errors.companyUnregistered")
      : state.error === "superseded" ? t("superseded") : t("errors.unavailable")}</p> : null}
  </section>;
}
