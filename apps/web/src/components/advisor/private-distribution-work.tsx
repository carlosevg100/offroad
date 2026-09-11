"use client";

import {Check, Clock3, FileText, LoaderCircle, ShieldCheck} from "lucide-react";
import {useActionState} from "react";
import {useFormStatus} from "react-dom";
import {useTranslations} from "next-intl";

import {
  authorizeProjectPackDistribution,
  prepareProjectQualifiedContact,
  recordProjectDistributionNextStep,
  recordProjectInformationPack,
  releaseProjectQualifiedContact,
  revokeProjectPackDistribution,
  type DistributionActionState,
  type QualifiedContactActionState,
} from "@/app/[locale]/app/projects/[projectId]/distribution-actions";
import type {DistributionRecipientView, DistributionView} from "./distribution-view";

import styles from "./private-distribution-work.module.css";

const distributionInitial: DistributionActionState = {ok: false};
const contactInitial: QualifiedContactActionState = {ok: false};

type Props = {
  distribution: DistributionView;
  locale: "pt-BR" | "en-US";
  projectId: string;
  sessionId: string;
};

/**
 * Authorized distribution on the issuer side. Nothing here sends anything: the pack revision fixes
 * the exact files, the authorization makes them available to named recipient organizations inside
 * the product, and the introduction is a record. No copy promises approval or funding.
 */
export function PrivateDistributionWork(props: Props) {
  const t = useTranslations("AuthorizedDistribution");
  const {distribution} = props;
  return <section className={styles.distribution} data-testid="authorized-distribution">
    <header>
      <span>{t("kicker")}</span>
      <h3>{t("title")}</h3>
      <p>{t("body")}</p>
    </header>
    <PackRevision {...props} />
    {distribution.currentPack ? <Authorization {...props} /> : null}
    {distribution.authorization ? <Recipients {...props} /> : null}
    {distribution.authorization ? <Feedback {...props} /> : null}
    <p className={styles.boundary}><ShieldCheck aria-hidden="true" size={13} />{t("boundary")}</p>
  </section>;
}

function PackRevision({distribution, locale, projectId, sessionId}: Props) {
  const t = useTranslations("AuthorizedDistribution");
  const [state, action] = useActionState(recordProjectInformationPack, distributionInitial);
  const pack = distribution.currentPack;
  return <section className={styles.pack} data-testid="information-pack-revision">
    <div className={styles.packHead}>
      <div>
        <strong>{pack ? t("packRevision", {number: pack.revisionNumber}) : t("packNone")}</strong>
        <p>{pack ? t("packBody") : t("packNoneBody")}</p>
      </div>
      {pack ? <small className={styles.fingerprint} data-testid="pack-fingerprint">{pack.packFingerprint.slice(0, 16)}</small> : null}
    </div>
    {pack ? <ul className={styles.items} data-testid="information-pack-items">
      {pack.items.map((item) => <li key={item.id}>
        <FileText aria-hidden="true" size={13} />
        <span>{t.has(`deliverable.${item.deliverableId}`) ? t(`deliverable.${item.deliverableId}`) : item.deliverableId}</span>
        <b>{t(`format.${item.format}`)}</b>
        <small>{item.templateKey} {item.templateVersion}</small>
      </li>)}
    </ul> : null}
    {distribution.packMatchesApprovedMaterial && pack
      ? <p className={styles.ok}><Check aria-hidden="true" size={13} />{t("packCurrent")}</p>
      : <form action={action} className={styles.inline}>
        <input name="locale" type="hidden" value={locale} />
        <input name="project_id" type="hidden" value={projectId} />
        <input name="session_id" type="hidden" value={sessionId} />
        <p>{pack ? t("packOutdated") : t("packFirst")}</p>
        <Submit idle={t("packRecord")} pending={t("packRecording")} />
      </form>}
    {!state.ok && state.code ? <p className="form-notice form-notice--error" role="alert">{t(`errors.${state.code}`)}</p> : null}
  </section>;
}

function Authorization({distribution, locale, projectId, sessionId}: Props) {
  const t = useTranslations("AuthorizedDistribution");
  const [state, action] = useActionState(authorizeProjectPackDistribution, distributionInitial);
  const [revokeState, revokeAction] = useActionState(revokeProjectPackDistribution, distributionInitial);
  const pack = distribution.currentPack!;
  const authorization = distribution.authorization;

  if (authorization) {
    return <section className={styles.authorization} data-testid="pack-authorization">
      <div className={styles.packHead}>
        <div>
          <strong>{t("authorizationActive")}</strong>
          <p>{t(`identityPolicy.${authorization.identityPolicy}`)}</p>
          <small>{t("wave", {limit: authorization.waveLimit, policy: authorization.policyVersion})}</small>
        </div>
        <small className={styles.fingerprint}>{authorization.packFingerprint.slice(0, 16)}</small>
      </div>
      <blockquote className={styles.consent}>{authorization.consentStatement}</blockquote>
      {!authorization.coversCurrentRevision
        ? <p className={styles.warn}><Clock3 aria-hidden="true" size={13} />{t("authorizationPreviousRevision")}</p>
        : null}
      <form action={revokeAction} className={styles.inline}>
        <input name="locale" type="hidden" value={locale} />
        <input name="project_id" type="hidden" value={projectId} />
        <input name="session_id" type="hidden" value={sessionId} />
        <input name="authorization_id" type="hidden" value={authorization.id} />
        <Submit idle={t("revoke")} pending={t("revoking")} />
      </form>
      {!revokeState.ok && revokeState.code ? <p className="form-notice form-notice--error" role="alert">{t(`errors.${revokeState.code}`)}</p> : null}
    </section>;
  }

  const deliverable = distribution.recipients.filter((recipient) => recipient.deliverable);
  const undeliverable = distribution.recipients.filter((recipient) => !recipient.deliverable);
  return <form action={action} className={styles.authorization} data-testid="pack-authorization-form">
    <input name="locale" type="hidden" value={locale} />
    <input name="project_id" type="hidden" value={projectId} />
    <input name="session_id" type="hidden" value={sessionId} />
    <input name="pack_revision_id" type="hidden" value={pack.id} />
    <input name="pack_fingerprint" type="hidden" value={pack.packFingerprint} />
    <fieldset className={styles.recipients}>
      <legend>{t("recipientsLegend")}</legend>
      {deliverable.length === 0 ? <p className={styles.muted}>{t("recipientsEmpty")}</p> : null}
      {deliverable.map((recipient) => <label key={recipient.targetId}>
        <input
          defaultChecked
          name="recipient"
          type="checkbox"
          value={`registered_organization|${recipient.recipientOrganizationId}|${recipient.providerName}`}
        />
        <span><strong>{recipient.providerName}</strong><small>{t("recipientRegistered")}</small></span>
      </label>)}
      {undeliverable.map((recipient) => <label key={recipient.targetId}>
        <input
          name="recipient"
          type="checkbox"
          value={`directory_entry|${recipient.recipientDirectoryId}|${recipient.providerName}`}
        />
        <span><strong>{recipient.providerName}</strong><small>{t("recipientDirectory")}</small></span>
      </label>)}
    </fieldset>
    <label className={styles.consentField}>
      <span>{t("consentLabel")}</span>
      <textarea defaultValue={t("consentPlaceholder")} maxLength={2000} minLength={20} name="consent_statement" required rows={3} />
    </label>
    <label className={styles.attestation}>
      <input name="consent_attestation" required type="checkbox" value="confirmed" />
      <span><strong>{t("consentAttestation")}</strong><p>{t("consentAttestationBody")}</p></span>
    </label>
    <Submit disabled={!distribution.canAuthorize} idle={t("authorize")} pending={t("authorizing")} />
    {!distribution.canAuthorize ? <p className={styles.muted}>{t("authorizeBlocked")}</p> : null}
    {!state.ok && state.code ? <p className="form-notice form-notice--error" role="alert">{t(`errors.${state.code}`)}</p> : null}
  </form>;
}

function Recipients(props: Props) {
  const t = useTranslations("AuthorizedDistribution");
  return <section className={styles.list} data-testid="distribution-recipients">
    <h4>{t("recipientsTitle")}</h4>
    <p className={styles.muted}>{t("recipientsBody")}</p>
    {props.distribution.recipients.map((recipient) => (
      <Recipient key={recipient.targetId} recipient={recipient} {...props} />
    ))}
  </section>;
}

function Recipient({distribution, locale, projectId, recipient, sessionId}: Props & {recipient: DistributionRecipientView}) {
  const t = useTranslations("AuthorizedDistribution");
  const [prepareState, prepareAction] = useActionState(prepareProjectQualifiedContact, contactInitial);
  const [releaseState, releaseAction] = useActionState(releaseProjectQualifiedContact, contactInitial);
  const [stepState, stepAction] = useActionState(recordProjectDistributionNextStep, distributionInitial);
  const pack = distribution.currentPack;
  const released = recipient.preparationStatus === "released";
  return <article className={styles.recipient} data-fit={recipient.candidateFit ?? "unclassified"} data-testid="distribution-recipient">
    <header>
      <div>
        <strong>{recipient.providerName}</strong>
        <small>{recipient.deliverable ? t("recipientRegistered") : t("recipientDirectory")}</small>
      </div>
      <b data-testid="recipient-response">{t(`responseState.${recipient.responseState}`)}</b>
    </header>
    {!recipient.deliverable ? <p className={styles.muted}>{t("recipientDirectoryNote")}</p> : null}
    {recipient.deliverable ? <p className={styles.muted} data-testid="recipient-reads">
      {recipient.reads > 0 ? t("reads", {count: recipient.reads}) : t("readsNone")}
    </p> : null}
    {recipient.respondedAt && !recipient.refersToCurrentRevision
      ? <p className={styles.warn}><Clock3 aria-hidden="true" size={13} />{t("responsePreviousRevision")}</p>
      : null}

    {recipient.deliverable && recipient.shareId && !released ? <form action={prepareAction} className={styles.form}>
      <input name="locale" type="hidden" value={locale} />
      <input name="project_id" type="hidden" value={projectId} />
      <input name="session_id" type="hidden" value={sessionId} />
      <input name="target_id" type="hidden" value={recipient.targetId} />
      <input name="share_id" type="hidden" value={recipient.shareId} />
      <label><span>{t("fitLabel")}</span><select defaultValue={recipient.candidateFit ?? "eligible"} name="candidate_fit">
        <option value="eligible">{t("fit.eligible")}</option>
        <option value="hypothesis">{t("fit.hypothesis")}</option>
      </select></label>
      <label><span>{t("rationaleLabel")}</span><textarea defaultValue={recipient.rationale} maxLength={4000} minLength={20} name="rationale" required rows={2} /></label>
      <Submit idle={t("prepare")} pending={t("preparing")} />
    </form> : null}

    {recipient.preparationId && recipient.candidateFit === "hypothesis"
      ? <p className={styles.muted} data-testid="research-only">{t("researchOnly")}</p>
      : null}

    {recipient.preparationId && recipient.candidateFit === "eligible" && !released && pack
      ? <form action={releaseAction} className={styles.form}>
        <input name="locale" type="hidden" value={locale} />
        <input name="project_id" type="hidden" value={projectId} />
        <input name="session_id" type="hidden" value={sessionId} />
        <input name="preparation_id" type="hidden" value={recipient.preparationId} />
        <input name="pack_fingerprint" type="hidden" value={pack.packFingerprint} />
        <label className={styles.attestation}>
          <input name="release_attestation" required type="checkbox" value="confirmed" />
          <span><strong>{t("releaseAttestation")}</strong><p>{t("releaseAttestationBody")}</p></span>
        </label>
        <Submit idle={t("release")} pending={t("releasing")} />
      </form>
      : null}
    {released ? <p className={styles.ok} data-testid="contact-released"><Check aria-hidden="true" size={13} />{t("released")}</p> : null}

    {recipient.deliverable && recipient.shareId ? <form action={stepAction} className={styles.form}>
      <input name="locale" type="hidden" value={locale} />
      <input name="project_id" type="hidden" value={projectId} />
      <input name="session_id" type="hidden" value={sessionId} />
      <input name="share_id" type="hidden" value={recipient.shareId} />
      <label><span>{t("nextStepLabel")}</span><select name="step_code">
        {recipient.availableNextSteps.map((step) => <option key={step} value={step}>{t(`nextStep.${step}`)}</option>)}
      </select></label>
      <label><span>{t("nextStepNote")}</span><input maxLength={2000} name="note" type="text" /></label>
      <Submit idle={t("nextStepSave")} pending={t("nextStepSaving")} />
    </form> : null}
    {recipient.lastNextStep ? <p className={styles.muted} data-testid="recipient-next-step">
      {t("nextStepCurrent", {step: t(`nextStep.${recipient.lastNextStep.code}`)})}
    </p> : null}

    {!prepareState.ok && prepareState.code ? <p className="form-notice form-notice--error" role="alert">{t(`contactErrors.${prepareState.code}`)}</p> : null}
    {!releaseState.ok && releaseState.code ? <p className="form-notice form-notice--error" role="alert">{t(`contactErrors.${releaseState.code}`)}</p> : null}
    {!stepState.ok && stepState.code ? <p className="form-notice form-notice--error" role="alert">{t(`errors.${stepState.code}`)}</p> : null}
  </article>;
}

function Feedback({distribution, locale}: Props) {
  const t = useTranslations("AuthorizedDistribution");
  const {feedback} = distribution;
  const number = new Intl.NumberFormat(locale);
  return <section className={styles.feedback} data-testid="distribution-feedback">
    <h4>{t("feedbackTitle")}</h4>
    <p className={styles.muted}>{t("feedbackBody")}</p>
    <div className={styles.counts}>
      <span><small>{t("feedbackResponded")}</small><strong>{number.format(feedback.respondedCount)}</strong></span>
      <span><small>{t("feedbackAwaiting")}</small><strong>{number.format(feedback.awaitingCount)}</strong></span>
      <span><small>{t("responseState.interested")}</small><strong>{number.format(feedback.interestedCount)}</strong></span>
      <span><small>{t("responseState.needs_information")}</small><strong>{number.format(feedback.needsInformationCount)}</strong></span>
      <span><small>{t("responseState.declined")}</small><strong>{number.format(feedback.declinedCount)}</strong></span>
    </div>
    {feedback.objectedTerms.length ? <div data-testid="feedback-objections">
      <h5>{t("feedbackObjected")}</h5>
      <ul>{feedback.objectedTerms.map((entry) => <li key={entry.code}>
        {t.has(`objection.${entry.code}`) ? t(`objection.${entry.code}`) : entry.code} · {number.format(entry.count)}
      </li>)}</ul>
    </div> : null}
    {feedback.requestedConditions.length ? <div data-testid="feedback-conditions">
      <h5>{t("feedbackRequested")}</h5>
      <ul>{feedback.requestedConditions.map((entry) => <li key={entry.code}>
        {t.has(`condition.${entry.code}`) ? t(`condition.${entry.code}`) : entry.code} · {number.format(entry.count)}
      </li>)}</ul>
    </div> : null}
    {feedback.tenorMonths ? <p>{t("feedbackTenor", {min: feedback.tenorMonths.min, max: feedback.tenorMonths.max})}</p> : null}
    {feedback.ticketRanges.map((range) => <p key={range.currency}>
      {t("feedbackTicket", {currency: range.currency, min: range.min, max: range.max})}
    </p>)}
    {feedback.pricingRanges.map((range) => <p key={range.basis}>
      {t("feedbackPricing", {basis: range.basis, min: range.min, max: range.max ?? range.min})}
    </p>)}
    {!feedback.objectedTerms.length && !feedback.requestedConditions.length
      ? <p className={styles.muted}>{t("feedbackNone")}</p>
      : null}
  </section>;
}

function Submit({disabled = false, idle, pending}: {disabled?: boolean; idle: string; pending: string}) {
  const status = useFormStatus();
  return <button className="button" disabled={disabled || status.pending} type="submit">
    {status.pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : null}
    {status.pending ? pending : idle}
  </button>;
}
