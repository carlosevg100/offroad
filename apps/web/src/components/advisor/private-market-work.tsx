"use client";

import type {MatchCandidate} from "@offroad/domain-contracts";
import {AlertTriangle, Check, Clock3, LoaderCircle, ShieldCheck} from "lucide-react";
import {useActionState} from "react";
import {useFormStatus} from "react-dom";
import {useTranslations} from "next-intl";

import {
  approvePrivateProjectMatchShortlist,
  authorizePrivateProjectIntroduction,
  type PrivateGovernedDecisionState,
  type PrivateMatchDecisionState,
} from "@/app/[locale]/app/projects/[projectId]/actions";
import type {DealStateWorkbench} from "@/lib/deal-state/workbench";
import type {Database} from "@/types/database";

type IntroductionPlan = Database["public"]["Tables"]["qualified_introduction_plans"]["Row"];
type IntroductionTarget = Database["public"]["Tables"]["qualified_introduction_targets"]["Row"];
type IntroductionRecipient = Database["public"]["Tables"]["qualified_introduction_recipients"]["Row"];

type Props = {
  introductionPlan: IntroductionPlan | null;
  introductionRecipients: IntroductionRecipient[];
  introductionTargets: IntroductionTarget[];
  isProcessing: boolean;
  locale: "pt-BR" | "en-US";
  matchScreen: DealStateWorkbench["matchScreen"];
  packageApproved: boolean;
  projectId: string;
  representationStatus: string;
  sessionId: string;
};

const matchInitial: PrivateMatchDecisionState = {ok: false};
const authorizationInitial: PrivateGovernedDecisionState = {ok: false};

export function PrivateMarketWork(props: Props) {
  if (!props.packageApproved) return null;
  if (!props.matchScreen) {
    return props.isProcessing ? <MarketProcessing /> : <MarketUnavailable />;
  }
  return <MatchScreen {...props} matchScreen={props.matchScreen} />;
}

function MatchScreen({introductionPlan, introductionRecipients, introductionTargets, locale, matchScreen, projectId, representationStatus, sessionId}: Props & {matchScreen: NonNullable<Props["matchScreen"]>}) {
  const t = useTranslations("App.privateCase");
  const [state, action] = useActionState(approvePrivateProjectMatchShortlist, matchInitial);
  const approved = matchScreen.row.status === "approved" && Boolean(matchScreen.value.approval);
  const selected = new Set(matchScreen.value.approval?.selectedProviderIds ?? []);
  const candidates = matchScreen.value.candidates.filter((candidate) => candidate.verdict !== "excluded");
  return (
    <section className="advisor-private-market">
      <header><span>{t("marketKicker")}</span><h2>{t("marketTitle")}</h2><p>{t("marketBody")}</p></header>
      <div className="advisor-private-market__summary">
        <section><small>{t("marketScreened")}</small><strong>{matchScreen.value.summary.screened}</strong></section>
        <section><small>{t("marketEligible")}</small><strong>{matchScreen.value.summary.eligible}</strong></section>
        <section><small>{t("marketRefresh")}</small><strong>{matchScreen.value.summary.blockedByGovernance}</strong></section>
        <section><small>{t("marketExcluded")}</small><strong>{matchScreen.value.summary.excluded}</strong></section>
      </div>
      {candidates.length ? <form action={action} className="advisor-private-market__form">
        <input name="locale" type="hidden" value={locale} />
        <input name="project_id" type="hidden" value={projectId} />
        <input name="session_id" type="hidden" value={sessionId} />
        <input name="match_screen_fingerprint" type="hidden" value={matchScreen.row.object_fingerprint} />
        <div className="advisor-private-market__candidates">{candidates.map((candidate) => <Candidate candidate={candidate} approved={approved} key={candidate.providerId} locale={locale} selected={approved ? selected.has(candidate.providerId) : candidate.eligibleForShortlist} />)}</div>
        {!approved && matchScreen.value.summary.eligible ? <div className="advisor-private-market__decision"><div><ShieldCheck aria-hidden="true" size={16} /><span><strong>{t("marketApprovalTitle")}</strong><p>{t("marketApprovalBody")}</p></span></div><Submit idle={t("marketApprove")} pending={t("marketApproving")} /></div> : null}
      </form> : <p className="advisor-private-market__empty">{t(`marketEmpty.${matchScreen.value.status}`)}</p>}
      {approved ? <IntroductionPlan
        locale={locale}
        plan={introductionPlan}
        projectId={projectId}
        recipients={introductionRecipients}
        representationStatus={representationStatus}
        sessionId={sessionId}
        targets={introductionTargets}
      /> : null}
      {!state.ok && state.code ? <p className="form-notice form-notice--error" role="alert">{t(`governedErrors.${state.code}`)}</p> : null}
      <p className="advisor-private-market__boundary"><ShieldCheck aria-hidden="true" size={13} />{t("marketBoundary")}</p>
    </section>
  );
}

function Candidate({approved, candidate, locale, selected}: {approved: boolean; candidate: MatchCandidate; locale: "pt-BR" | "en-US"; selected: boolean}) {
  const t = useTranslations("App.privateCase");
  const fits = candidate.criteria.filter((criterion) => criterion.outcome === "fits");
  const open = candidate.criteria.filter((criterion) => criterion.outcome === "unknown" || criterion.outcome === "not_assessed");
  const conflicts = candidate.criteria.filter((criterion) => criterion.outcome === "conflicts");
  return <label className={`advisor-private-provider is-${candidate.verdict}${selected ? " is-selected" : ""}`}>
    <header><div>{approved ? <span>{selected ? <Check aria-hidden="true" size={12} /> : "—"}</span> : <input defaultChecked={selected} disabled={!candidate.eligibleForShortlist} name="selected_provider_id" type="checkbox" value={candidate.providerId} />}<span><small>{t(`providerKinds.${candidate.providerKind}`)}</small><strong>{candidate.providerName}</strong></span></div><b>{candidate.eligibleForShortlist ? t("marketFits") : t("marketNeedsReview")}</b></header>
    <p>{candidate.rationale}</p>
    <div className="advisor-private-provider__criteria">
      {fits.slice(0, 5).map((criterion) => <span className="is-fit" key={criterion.id}><Check aria-hidden="true" size={11} />{locale === "pt-BR" ? criterion.label.pt : criterion.label.en}</span>)}
      {open.slice(0, 4).map((criterion) => <span className="is-open" key={criterion.id}><Clock3 aria-hidden="true" size={11} />{locale === "pt-BR" ? criterion.label.pt : criterion.label.en}</span>)}
      {conflicts.slice(0, 4).map((criterion) => <span className="is-conflict" key={criterion.id}><AlertTriangle aria-hidden="true" size={11} />{locale === "pt-BR" ? criterion.label.pt : criterion.label.en}</span>)}
    </div>
  </label>;
}

function IntroductionPlan({locale, plan, projectId, recipients, representationStatus, sessionId, targets}: {
  locale: "pt-BR" | "en-US";
  plan: IntroductionPlan | null;
  projectId: string;
  recipients: IntroductionRecipient[];
  representationStatus: string;
  sessionId: string;
  targets: IntroductionTarget[];
}) {
  const t = useTranslations("App.privateCase");
  const [state, action] = useActionState(authorizePrivateProjectIntroduction, authorizationInitial);
  if (!plan) return <section className="advisor-private-introduction advisor-private-introduction--processing"><LoaderCircle aria-hidden="true" className="spin" size={17} /><div><strong>{t("introductionPlanProcessingTitle")}</strong><p>{t("introductionPlanProcessingBody")}</p></div></section>;
  const unresolved = targets.filter((target) => target.contact_status !== "resolved");
  const exactPlanReady = plan.status === "draft"
    && plan.technical_review_fingerprint === plan.material_fingerprint
    && Boolean(plan.technical_reviewed_at)
    && recipients.length > 0
    && unresolved.length === 0
    && recipients.length === targets.length;
  const authorized = plan.status === "authorized";
  return <section className="advisor-private-introduction">
    <header><span>{t("introductionKicker")}</span><h3>{authorized ? t("introductionAuthorizedTitle") : t("introductionTitle")}</h3><p>{authorized ? t("introductionAuthorizedBody") : t("introductionBody")}</p></header>
    <div className="advisor-private-introduction__targets">{targets.map((target) => <section key={target.id}><span>{String(target.position).padStart(2, "0")}</span><div><strong>{target.provider_name}</strong><p>{target.rationale}</p>{target.resolved_contact_name ? <small>{target.resolved_contact_name}{target.resolved_contact_job_title ? ` · ${target.resolved_contact_job_title}` : ""}</small> : null}</div><b className={`is-${target.contact_status}`}>{t(`contactStatus.${target.contact_status}`)}</b></section>)}</div>
    {recipients.length ? <div className="advisor-private-introduction__recipients">{recipients.map((recipient) => <section key={recipient.id}><div><strong>{recipient.contact_name}</strong><p>{recipient.recipient_name}{recipient.contact_job_title ? ` · ${recipient.contact_job_title}` : ""}</p><small>{recipient.contact_email}</small></div><ul>{Array.isArray(recipient.material_manifest) ? recipient.material_manifest.map((material) => <li key={String(material)}>{String(material)}</li>) : null}</ul></section>)}</div> : null}
    {authorized ? <p className="advisor-private-introduction__authorized"><Check aria-hidden="true" size={14} />{t("introductionAuthorizedStatus")}</p> : exactPlanReady ? <form action={action} className="advisor-private-introduction__authorization">
      <input name="locale" type="hidden" value={locale} />
      <input name="project_id" type="hidden" value={projectId} />
      <input name="session_id" type="hidden" value={sessionId} />
      <input name="plan_id" type="hidden" value={plan.id} />
      <input name="material_fingerprint" type="hidden" value={plan.material_fingerprint} />
      <label><input name="representation_attestation" required type="checkbox" value="confirmed" /><span><strong>{t("representationAttestationTitle")}</strong><p>{t("representationAttestationBody")}</p></span></label>
      {representationStatus !== "verified" ? <p><AlertTriangle aria-hidden="true" size={13} />{t("representationVerificationRequired")}</p> : null}
      <Submit disabled={representationStatus !== "verified"} idle={t("introductionAuthorize")} pending={t("introductionAuthorizing")} />
    </form> : <p className="advisor-private-introduction__pending"><Clock3 aria-hidden="true" size={14} />{t("introductionPending")}</p>}
    {!state.ok && state.code ? <p className="form-notice form-notice--error" role="alert">{t(`governedErrors.${state.code}`)}</p> : null}
  </section>;
}

function MarketProcessing() {
  const t = useTranslations("App.privateCase");
  return <section className="advisor-private-market advisor-private-market--processing" aria-live="polite"><LoaderCircle aria-hidden="true" className="spin" size={18} /><div><span>{t("marketKicker")}</span><strong>{t("marketProcessingTitle")}</strong><p>{t("marketProcessingBody")}</p></div></section>;
}

function MarketUnavailable() {
  const t = useTranslations("App.privateCase");
  return <section className="advisor-private-market advisor-private-market--processing"><Clock3 aria-hidden="true" size={18} /><div><span>{t("marketKicker")}</span><strong>{t("marketUnavailableTitle")}</strong><p>{t("marketUnavailableBody")}</p></div></section>;
}

function Submit({disabled = false, idle, pending}: {disabled?: boolean; idle: string; pending: string}) {
  const status = useFormStatus();
  return <button className="button" disabled={disabled || status.pending} type="submit">{status.pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : null}{status.pending ? pending : idle}</button>;
}
