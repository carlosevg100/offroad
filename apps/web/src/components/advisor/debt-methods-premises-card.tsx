"use client";

import {Check, LoaderCircle} from "lucide-react";
import Link from "next/link";
import {useRef, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {z} from "zod";

import {confirmPremiseProposal} from "@/app/[locale]/app/projects/[projectId]/executions/actions";
import {CompanyRegistration} from "./company-registration";

/** The premise methods of lotes 2, 3 and 4 that share this card, by the key of their copy. */
export const debtPremiseMethods = {
  "build-company-debt-table": "debtTable",
  "measure-covenant-headroom": "covenantHeadroom",
  "project-weekly-cash": "weeklyCash",
  "build-operating-projection": "operatingProjection",
  "challenge-financial-projection": "projectionChallenge",
  "monetize-receivables-for-working-capital": "receivablesFunding",
  "update-after-quarter-close": "quarterUpdate",
  "organize-document-folder": "documentFolder",
  "evaluate-received-proposal": "receivedProposal",
  "evaluate-financing-paths": "financingPaths",
  "prepare-board-capital-discussion": "boardMaterial",
} as const;
export type DebtPremiseMethodId = keyof typeof debtPremiseMethods;
export const isDebtPremiseMethod = (id: string | undefined | null): id is DebtPremiseMethodId => typeof id === "string" && Object.hasOwn(debtPremiseMethods, id);

const groups = ["instrument", "credit_line", "obligation", "view", "limit", "measurement", "stream", "action",
  "driver", "scenario", "version", "assumption", "item", "option", "line", "cause", "facility", "dependent", "case", "premise",
  // The folder (C09): each file, the registry, the open decisions, the vault and the person's answers.
  "file", "entity", "decision", "vault", "informed"] as const;
/** The summary the worker writes for these methods; anything else is not read. */
const summarySchema = z.object({
  situationId: z.string(),
  referenceDate: z.iso.date().nullable(),
  items: z.array(z.object({group: z.enum(groups), label: z.string().min(1),
    // Older proposals carry no key: their label is shown as written, like a label from the person or a document.
    labelKey: z.string().min(1).nullable().optional().transform((key) => key ?? null),
    origin: z.enum(["document", "informed", "market", "house", "estimate"]), source: z.string()})),
});

export type DebtMethodsPremiseProposalView = {
  id: string;
  status: "proposed" | "confirmed" | "superseded";
  fingerprint: string;
  summary: Record<string, unknown>;
};

/** The instruments, limits, streams, cases and premises the conversation proposed for one of the
 * debt methods, grouped and each with its origin and source, and the single act that adopts them.
 * Nothing is calculated before confirmation; a summary that does not parse offers no confirmation. */
export function DebtMethodsPremisesCard({locale, projectId, methodId, proposal}: {locale: "pt-BR" | "en-US"; projectId: string; methodId: DebtPremiseMethodId; proposal: DebtMethodsPremiseProposalView}) {
  const t = useTranslations("DebtMethodsPremisesCard");
  const format = useFormatter();
  const lock = useRef(false);
  const ids = useRef({requestId: crypto.randomUUID(), definitionRequestId: crypto.randomUUID()});
  const [state, setState] = useState<{kind: "idle" | "busy" | "pending_release" | "requested" | "error"; executionId?: string | null; error?: string; missing?: string[]}>({kind: "idle"});
  const method = debtPremiseMethods[methodId];
  const parsed = summarySchema.safeParse(proposal.summary);
  const summary = parsed.success ? parsed.data : null;
  async function confirm() {
    if (lock.current || proposal.status !== "proposed" || !summary) return;
    lock.current = true; setState({kind: "busy"});
    try {
      const result = await confirmPremiseProposal({locale, projectId, proposalId: proposal.id, fingerprint: proposal.fingerprint, ...ids.current});
      if (result.ok) setState({kind: result.calculation, executionId: result.executionId});
      else setState({kind: "error", error: result.error, missing: "missing" in result ? result.missing : undefined});
    } catch {
      setState({kind: "error", error: "unavailable"});
    } finally {
      lock.current = false;
    }
  }
  const confirmed = proposal.status === "confirmed" || state.kind === "pending_release" || state.kind === "requested";
  // A label the house generated is written in the viewer's language; an unknown key keeps the label as written.
  const label = (item: {label: string; labelKey: string | null}) => item.labelKey && t.has(`houseLabels.${item.labelKey}`) ? t(`houseLabels.${item.labelKey}`, {label: item.label}) : item.label;
  const date = (value: string) => format.dateTime(new Date(`${value}T00:00:00Z`), {day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC"});
  return <section aria-label={t(`methods.${method}.title`)} className="investment-premises-card">
    <header><strong>{t(`methods.${method}.title`)}</strong><p>{t(`methods.${method}.lead`)}</p></header>
    {!summary ? <p role="status">{t("unreadable")}</p> : <>
      {summary.referenceDate ? <p>{t("referenceDate", {date: date(summary.referenceDate)})}</p> : null}
      {groups.map((group) => {
        const items = summary.items.filter((item) => item.group === group);
        return items.length ? <div className="investment-premises-card__group" key={group}>
          <small>{t.has(`methods.${method}.groups.${group}`) ? t(`methods.${method}.groups.${group}`) : t(`groups.${group}`)}</small>
          <dl>{items.map((item, n) => <div key={`${item.label}:${n}`}><dt>{label(item)}</dt><dd>{t(`origins.${item.origin}`)}{item.source ? <span>{item.source}</span> : null}</dd></div>)}</dl>
        </div> : null;
      })}
      <p className="investment-premises-card__cases">{t(`methods.${method}.cases`)}</p>
    </>}
    {proposal.status === "superseded" ? <p>{t("superseded")}</p>
      : confirmed ? <p className="investment-premises-card__done"><Check aria-hidden="true" size={13} />{state.kind === "requested" ? t("calculating") : t("pendingRelease")}
        {state.kind === "requested" && state.executionId ? <> <Link href={`/${locale}/app/projects/${projectId}/executions/${state.executionId}`}>{t("openCalculation")}</Link></> : null}</p>
      : summary ? <button type="button" className="button button--primary" disabled={state.kind === "busy"} onClick={confirm}>
        {state.kind === "busy" ? <><LoaderCircle aria-hidden="true" className="spin" size={13} />{t("confirming")}</> : t("confirm")}
      </button> : null}
    {state.kind === "error" ? <p role="alert" className="investment-premises-card__error">{state.error === "company_unregistered" ? t("errors.companyUnregistered")
      : state.error === "superseded" ? t("superseded")
      // The quarter close needs the prior completed weekly cash and covenant results of this work.
      : state.error === "priors_missing" ? t("errors.priorsMissing", {which: (state.missing ?? []).map((k) => t(`errors.priors.${k}`)).join(", ")})
      : t("errors.unavailable")}</p> : null}
    {state.kind === "error" && state.error === "company_unregistered" ? <CompanyRegistration locale={locale} projectId={projectId} onRegistered={confirm} /> : null}
  </section>;
}
