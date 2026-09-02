"use client";

import {AlertTriangle, Check, LoaderCircle, Scale} from "lucide-react";
import {useActionState} from "react";
import {useFormStatus} from "react-dom";
import {useTranslations} from "next-intl";

import {
  decidePrivateProjectStructure,
  type PrivateStructureDecisionState,
} from "@/app/[locale]/app/projects/[projectId]/actions";
import type {DealStateWorkbench, StructureAlternative} from "@/lib/deal-state/workbench";

type Props = {
  isProcessing: boolean;
  locale: "pt-BR" | "en-US";
  projectId: string;
  sessionId: string;
  structure: DealStateWorkbench["structure"];
  structureDecision: DealStateWorkbench["structureDecision"];
};

const initialState: PrivateStructureDecisionState = {ok: false};

export function PrivateStructureWork({isProcessing, locale, projectId, sessionId, structure, structureDecision}: Props) {
  const t = useTranslations("App.privateCase");
  const [state, action] = useActionState(decidePrivateProjectStructure, initialState);
  const confirmed = structureDecision?.status === "confirmed" || structureDecision?.status === "approved";
  const changesRequested = structureDecision?.status === "changes_requested";
  const declined = structureDecision?.status === "declined";

  if (isProcessing && (!structure || confirmed || changesRequested)) {
    return <Processing t={t} />;
  }
  if (declined) {
    return <section className="advisor-private-structure advisor-private-structure--state"><AlertTriangle aria-hidden="true" size={18} /><div><span>{t("structureKicker")}</span><strong>{t("structureDeclinedTitle")}</strong><p>{t("structureDeclinedBody")}</p></div></section>;
  }
  if (!structure || confirmed) return null;

  const recommendationId = structure.value.recommendation?.alternativeId ?? null;
  const confirmable = structure.value.alternatives.filter((alternative) => alternative.confirmationEligible);
  const defaultAlternative = confirmable.find((alternative) => alternative.id === recommendationId) ?? confirmable[0] ?? structure.value.alternatives[0];
  return (
    <section className="advisor-private-structure">
      <header><span>{t("structureKicker")}</span><h2>{t("structureTitle")}</h2><p>{t("structureBody")}</p></header>

      {structure.value.blockers.length ? <div className="advisor-private-structure__blockers"><AlertTriangle aria-hidden="true" size={14} /><div><strong>{t("structureBlocked")}</strong><ul>{structure.value.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div></div> : null}

      <form action={action}>
        <input name="locale" type="hidden" value={locale} />
        <input name="project_id" type="hidden" value={projectId} />
        <input name="session_id" type="hidden" value={sessionId} />
        <input name="proposal_fingerprint" type="hidden" value={structure.value.proposalFingerprint ?? ""} />
        <div className="advisor-private-structure__alternatives">
          {structure.value.alternatives.map((alternative) => <Alternative
            alternative={alternative}
            defaultChecked={alternative.id === defaultAlternative?.id}
            key={alternative.id}
            locale={locale}
            recommended={alternative.id === recommendationId}
            t={t}
          />)}
        </div>
        <label className="advisor-private-structure__feedback">
          <span>{t("structureFeedback")}</span>
          <textarea maxLength={2500} name="feedback" placeholder={t("structureFeedbackPlaceholder")} rows={3} />
        </label>
        <div className="advisor-private-structure__decision">
          <div><Scale aria-hidden="true" size={16} /><span><strong>{t("structureDecisionTitle")}</strong><p>{t("structureDecisionBody")}</p></span></div>
          <div>
            <DecisionButton decision="confirm" disabled={!confirmable.length} label={t("structureConfirm")} pendingLabel={t("structureSaving")} />
            <DecisionButton decision="request_changes" label={t("structureRequestChanges")} pendingLabel={t("structureSaving")} secondary />
            <DecisionButton decision="decline" label={t("structureDecline")} pendingLabel={t("structureSaving")} quiet />
          </div>
        </div>
      </form>
      <p className="advisor-private-structure__boundary">{t("structureBoundary")}</p>
      {!state.ok && state.code ? <p className="form-notice form-notice--error" role="alert">{t(`structureErrors.${state.code}`)}</p> : null}
    </section>
  );
}

function Processing({t}: {t: ReturnType<typeof useTranslations>}) {
  return <section className="advisor-private-structure advisor-private-structure--processing" aria-live="polite"><LoaderCircle aria-hidden="true" className="spin" size={18} /><div><span>{t("structureKicker")}</span><strong>{t("structureProcessingTitle")}</strong><p>{t("structureProcessingBody")}</p></div></section>;
}

function Alternative({alternative, defaultChecked, locale, recommended, t}: {
  alternative: StructureAlternative;
  defaultChecked: boolean;
  locale: "pt-BR" | "en-US";
  recommended: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const amount = new Intl.NumberFormat(locale, {style: "currency", currency: alternative.currency, maximumFractionDigits: 0}).format(Number(alternative.amount));
  return <label className={`advisor-private-alternative${recommended ? " is-recommended" : ""}${!alternative.confirmationEligible ? " is-blocked" : ""}`}>
    <input defaultChecked={defaultChecked} disabled={!alternative.confirmationEligible} name="selected_alternative_id" required type="radio" value={alternative.id} />
    <header><div><span>{alternative.instrument}</span><strong>{alternative.label}</strong></div>{recommended ? <small>{t("structureRecommended")}</small> : null}</header>
    <p>{alternative.rationale}</p>
    <dl>
      <div><dt>{t("structureAmount")}</dt><dd>{amount}</dd></div>
      <div><dt>{t("structureTerm")}</dt><dd>{t("months", {count: alternative.termMonths})}</dd></div>
      <div><dt>{t("structureGrace")}</dt><dd>{t("months", {count: alternative.graceMonths})}</dd></div>
      <div><dt>{t("structureIndexer")}</dt><dd>{alternative.indexer}</dd></div>
      <div><dt>{t("structureAmortization")}</dt><dd>{alternative.amortization}</dd></div>
    </dl>
    <div className="advisor-private-alternative__tradeoffs"><section><strong>{t("structureAdvantages")}</strong><ul>{alternative.pros.map((item) => <li key={item}>{item}</li>)}</ul></section><section><strong>{t("structureAttention")}</strong><ul>{alternative.cons.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
    {alternative.security.length ? <section className="advisor-private-alternative__terms"><strong>{t("structureSecurity")}</strong><ul>{alternative.security.map((item) => <li key={item.description}>{item.description}</li>)}</ul></section> : null}
    {alternative.blockers.length || alternative.missingInputs.length ? <section className="advisor-private-alternative__missing"><strong>{t("structureDependencies")}</strong><ul>{[...alternative.blockers, ...alternative.missingInputs].map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
  </label>;
}

function DecisionButton({decision, disabled, label, pendingLabel, quiet, secondary}: {
  decision: "confirm" | "request_changes" | "decline";
  disabled?: boolean;
  label: string;
  pendingLabel: string;
  quiet?: boolean;
  secondary?: boolean;
}) {
  const {pending} = useFormStatus();
  const className = quiet ? "button button--quiet" : secondary ? "button button--ghost" : "button";
  return <button className={className} disabled={pending || disabled} name="decision" type="submit" value={decision}>{pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : decision === "confirm" ? <Check aria-hidden="true" size={14} /> : null}{pending ? pendingLabel : label}</button>;
}
