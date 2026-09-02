"use client";

import type {MatchCandidate} from "@offroad/domain-contracts";
import {AlertTriangle, Check, Clock3, LoaderCircle, ShieldCheck} from "lucide-react";
import {useActionState, useState} from "react";
import {useFormStatus} from "react-dom";
import {useTranslations} from "next-intl";

import {
  approvePrivateProjectMatchShortlist,
  authorizePrivateProjectIntroduction,
  recordPrivateProjectMarketFeedback,
  type MarketFeedbackState,
  type PrivateGovernedDecisionState,
  type PrivateMatchDecisionState,
} from "@/app/[locale]/app/projects/[projectId]/actions";
import type {DealStateWorkbench} from "@/lib/deal-state/workbench";
import type {Database} from "@/types/database";

type IntroductionPlan = Database["public"]["Tables"]["qualified_introduction_plans"]["Row"];
type IntroductionTarget = Database["public"]["Tables"]["qualified_introduction_targets"]["Row"];
type IntroductionRecipient = Database["public"]["Tables"]["qualified_introduction_recipients"]["Row"];
type QualifiedIntroduction = Database["public"]["Tables"]["qualified_introductions"]["Row"];
type FeedbackEvent = Database["public"]["Tables"]["qualified_introduction_feedback_events"]["Row"];

type Props = {
  introductionPlan: IntroductionPlan | null;
  introductionRecipients: IntroductionRecipient[];
  introductionTargets: IntroductionTarget[];
  introductions: QualifiedIntroduction[];
  feedbackEvents: FeedbackEvent[];
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
const feedbackInitial: MarketFeedbackState = {ok: false};

export function PrivateMarketWork(props: Props) {
  if (!props.packageApproved) return null;
  if (!props.matchScreen) {
    return props.isProcessing ? <MarketProcessing /> : <MarketUnavailable />;
  }
  return <MatchScreen {...props} matchScreen={props.matchScreen} />;
}

function MatchScreen({feedbackEvents, introductionPlan, introductionRecipients, introductions, introductionTargets, locale, matchScreen, projectId, representationStatus, sessionId}: Props & {matchScreen: NonNullable<Props["matchScreen"]>}) {
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
      {approved && introductionPlan?.status === "authorized" ? <FeedbackCapture
        events={feedbackEvents}
        introductions={introductions}
        locale={locale}
        projectId={projectId}
        sessionId={sessionId}
        targets={introductionTargets}
      /> : null}
      {!state.ok && state.code ? <p className="form-notice form-notice--error" role="alert">{t(`governedErrors.${state.code}`)}</p> : null}
      <p className="advisor-private-market__boundary"><ShieldCheck aria-hidden="true" size={13} />{t("marketBoundary")}</p>
    </section>
  );
}

function FeedbackCapture({events, introductions, locale, projectId, sessionId, targets}: {
  events: FeedbackEvent[];
  introductions: QualifiedIntroduction[];
  locale: "pt-BR" | "en-US";
  projectId: string;
  sessionId: string;
  targets: IntroductionTarget[];
}) {
  const t = useTranslations("App.privateCase");
  const superseded = new Set(events.flatMap((event) => event.supersedes_event_id ? [event.supersedes_event_id] : []));
  const activeEvents = events.filter((event) => !superseded.has(event.id));
  if (!introductions.length) return <section className="advisor-private-feedback advisor-private-feedback--waiting"><Clock3 aria-hidden="true" size={16} /><div><strong>{t("feedbackWaitingTitle")}</strong><p>{t("feedbackWaitingBody")}</p></div></section>;
  return <section className="advisor-private-feedback">
    <header><span>{t("feedbackKicker")}</span><h3>{t("feedbackTitle")}</h3><p>{t("feedbackBody")}</p></header>
    <div className="advisor-private-feedback__introductions">{introductions.map((introduction) => {
      const target = targets.find((item) => item.provider_id === introduction.provider_id);
      const history = activeEvents.filter((event) => event.qualified_introduction_id === introduction.id);
      return <section key={introduction.id}>
        <header><div><strong>{target?.provider_name ?? introduction.provider_id}</strong><p>{introduction.contact_name ?? introduction.contact_id}</p></div><small>{new Intl.DateTimeFormat(locale, {dateStyle: "medium"}).format(new Date(introduction.introduced_at))}</small></header>
        {history.length ? <ol>{history.map((event) => {
          const details = [
            event.reason_code ? (t.has(`feedbackReasons.${event.reason_code}`) ? t(`feedbackReasons.${event.reason_code}`) : event.reason_code) : null,
            event.requested_information_count ? t("feedbackRequestedCount", {count: event.requested_information_count}) : null,
            event.amount !== null && event.currency ? new Intl.NumberFormat(locale, {style: "currency", currency: event.currency}).format(event.amount) : null,
            event.note,
          ].filter(Boolean);
          return <li key={event.id}><span>{t(`feedbackEvents.${event.event_type}`)}</span><small>{new Intl.DateTimeFormat(locale, {dateStyle: "short"}).format(new Date(event.occurred_at))} · {t(`feedbackVerification.${event.verification_state}`)}</small>{details.length ? <p>{details.join(" · ")}</p> : null}</li>;
        })}</ol> : <p className="advisor-private-feedback__empty">{t("feedbackEmpty")}</p>}
        <FeedbackForm introductionId={introduction.id} locale={locale} projectId={projectId} sessionId={sessionId} />
      </section>;
    })}</div>
    <p className="advisor-private-feedback__boundary"><ShieldCheck aria-hidden="true" size={13} />{t("feedbackBoundary")}</p>
  </section>;
}

function FeedbackForm({introductionId, locale, projectId, sessionId}: {
  introductionId: string;
  locale: "pt-BR" | "en-US";
  projectId: string;
  sessionId: string;
}) {
  const t = useTranslations("App.privateCase");
  const [eventType, setEventType] = useState("introduction_accepted");
  const [occurredAt, setOccurredAt] = useState("");
  const [state, action] = useActionState(recordPrivateProjectMarketFeedback, feedbackInitial);
  const asksReason = eventType === "case_declined";
  const asksCount = eventType === "diligence_requested";
  const asksAmount = eventType === "proposal_issued" || eventType === "funded";
  return <details className="advisor-private-feedback__form-wrap">
    <summary>{t("feedbackAdd")}</summary>
    <form action={action}>
      <input name="locale" type="hidden" value={locale} />
      <input name="project_id" type="hidden" value={projectId} />
      <input name="session_id" type="hidden" value={sessionId} />
      <input name="introduction_id" type="hidden" value={introductionId} />
      <label><span>{t("feedbackEventLabel")}</span><select name="event_type" onChange={(event) => setEventType(event.target.value)} value={eventType}>{["introduction_accepted", "case_declined", "diligence_requested", "process_advanced", "proposal_issued", "funded"].map((item) => <option key={item} value={item}>{t(`feedbackEvents.${item}`)}</option>)}</select></label>
      <div className="advisor-private-feedback__row">
        <label><span>{t("feedbackSourceLabel")}</span><select defaultValue="lender" name="source_kind">{["lender", "company", "advisor"].map((item) => <option key={item} value={item}>{t(`feedbackSources.${item}`)}</option>)}</select></label>
        <label><span>{t("feedbackVerificationLabel")}</span><select defaultValue="reported" name="verification_state"><option value="reported">{t("feedbackVerification.reported")}</option><option value="confirmed">{t("feedbackVerification.confirmed")}</option></select></label>
      </div>
      <label><span>{t("feedbackDateLabel")}</span><input onChange={(event) => setOccurredAt(event.target.value ? new Date(event.target.value).toISOString() : "")} type="datetime-local" /></label>
      <input name="occurred_at" type="hidden" value={occurredAt} />
      {asksReason ? <label><span>{t("feedbackReasonLabel")}</span><select name="reason_code" required>{["ticket_outside_mandate", "sector_outside_mandate", "leverage_outside_mandate", "structure_not_supported", "insufficient_information", "timing", "pricing", "other"].map((item) => <option key={item} value={item}>{t(`feedbackReasons.${item}`)}</option>)}</select></label> : null}
      {asksCount ? <label><span>{t("feedbackCountLabel")}</span><input max={500} min={1} name="requested_information_count" required type="number" /></label> : null}
      {asksAmount ? <div className="advisor-private-feedback__row"><label><span>{t("feedbackAmountLabel")}</span><input min={0} name="amount" required step="0.01" type="number" /></label><label><span>{t("feedbackCurrencyLabel")}</span><select defaultValue="BRL" name="currency"><option value="BRL">BRL</option><option value="USD">USD</option></select></label></div> : null}
      <label><span>{t("feedbackNoteLabel")}</span><textarea maxLength={4000} name="note" rows={2} /></label>
      <Submit idle={t("feedbackSave")} pending={t("feedbackSaving")} />
      {state.ok ? <p className="form-notice form-notice--success" role="status">{t("feedbackSaved")}</p> : state.code ? <p className="form-notice form-notice--error" role="alert">{t(`feedbackErrors.${state.code}`)}</p> : null}
    </form>
  </details>;
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
