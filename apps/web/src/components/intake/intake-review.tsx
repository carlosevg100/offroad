import {AlertTriangle, ArrowRight, Check, ChevronDown, FileText, History} from "lucide-react";
import Link from "next/link";
import {getTranslations} from "next-intl/server";

import {anchorText, displayCandidateValue, editableCandidateValue, intakeGroups} from "@/lib/intake/format";
import type {IntakeCandidate, IntakeDocument, IntakeIssue, IntakeReviewActionSet, IntakeSession} from "@/lib/intake/types";

type Props = {
  locale: string;
  session: IntakeSession;
  documents: IntakeDocument[];
  candidates: IntakeCandidate[];
  issues: IntakeIssue[];
  actions: IntakeReviewActionSet;
  manualHref?: string;
};

const HIGH_CONFIDENCE = 0.85;

/**
 * Assisted review of extracted candidates: accept / edit / reject / N/A per field, open issues,
 * evidence links and the final confirmation. Every string comes from the `Intake` catalog.
 */
export async function IntakeReview({locale, session, documents, candidates, issues, actions, manualHref}: Props) {
  const t = await getTranslations({locale, namespace: "Intake.review"});
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const openIssues = issues.filter((issue) => issue.status === "open");
  const conflictCandidateIds = new Set(openIssues.flatMap((issue) => issue.candidate_ids));
  const reviewed = candidates.filter((candidate) => ["accepted", "edited", "rejected", "not_applicable"].includes(candidate.review_state)).length;
  const accepted = candidates.filter((candidate) => ["accepted", "edited"].includes(candidate.review_state) && candidate.is_primary).length;
  const valueLabels = {yes: t("yes"), no: t("no")};
  const anchorLabels = {page: t("page"), sheet: t("sheet"), cell: t("cell")};
  const priorityLabel = (priority: string) => (priority === "critical" || priority === "analysis" || priority === "diligence" || priority === "complementary" ? t(`priority.${priority}`) : priority);
  const stateLabel = (candidate: IntakeCandidate, isConflict: boolean) => {
    if (candidate.review_state === "edited") return t("state.edited");
    if (candidate.review_state === "accepted") return t("state.accepted");
    if (candidate.review_state === "rejected") return t("state.rejected");
    if (candidate.review_state === "not_applicable") return t("state.notApplicable");
    if (isConflict) return t("state.conflict");
    return `${Math.round(Number(candidate.confidence) * 100)}%`;
  };

  return (
    <div className="intake-review">
      <header className="intake-review__hero">
        <div><span className="section-kicker">{t("kicker")}</span><h3>{t("title")}</h3><p>{t("body")}</p></div>
        <div className="intake-review__stats">
          <span><strong>{documents.length}</strong>{t("documents")}</span>
          <span><strong>{candidates.length}</strong>{t("fields")}</span>
          <span><strong>{openIssues.length}</strong>{t("openItems")}</span>
        </div>
      </header>

      <div className="intake-review__toolbar">
        <div><History size={14} /><span>{t("reviewedCounter", {reviewed, total: candidates.length})}</span></div>
        <form action={actions.accept}><input name="locale" type="hidden" value={locale} /><input name="session_id" type="hidden" value={session.id} /><button className="button button--small" type="submit"><Check size={13} />{t("acceptHighConfidence")}</button></form>
        <form action={actions.process}><input name="locale" type="hidden" value={locale} /><input name="session_id" type="hidden" value={session.id} /><button className="button button--ghost button--small" type="submit">{t("reprocess")}</button></form>
      </div>

      {openIssues.length ? (
        <section className="intake-issues">
          <header><AlertTriangle size={16} /><div><strong>{t("issuesTitle")}</strong><p>{t("issuesBody")}</p></div></header>
          <div className="intake-issues__list">
            {openIssues.map((issue) => (
              <article className={`priority-${issue.priority}`} key={issue.id}>
                <span>{priorityLabel(issue.priority)}</span>
                <div><strong>{issue.title}</strong><p>{issue.description}</p>{issue.resolution_hint ? <small>{issue.resolution_hint}</small> : null}</div>
                <form action={actions.resolve}><input name="locale" type="hidden" value={locale} /><input name="session_id" type="hidden" value={session.id} /><input name="issue_id" type="hidden" value={issue.id} /><button name="issue_status" type="submit" value="resolved">{t("markReviewed")}</button></form>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="intake-review__groups">
        {intakeGroups.map((group, groupIndex) => {
          const groupCandidates = candidates.filter((candidate) => candidate.field_group === group);
          if (!groupCandidates.length) return null;
          return (
            <details className="intake-group" key={group} open={groupIndex < 2 || groupCandidates.some((candidate) => conflictCandidateIds.has(candidate.id))}>
              <summary><span>{String(groupIndex + 1).padStart(2, "0")}</span><strong>{t(`groups.${group}`)}</strong><small>{groupCandidates.length} {t("fields")}</small><ChevronDown size={15} /></summary>
              <div className="intake-group__fields">
                {groupCandidates.map((candidate) => {
                  const source = candidate.source_document_id ? documentById.get(candidate.source_document_id) : null;
                  const isConflict = conflictCandidateIds.has(candidate.id);
                  const state = candidate.review_state === "accepted" || candidate.review_state === "edited" ? "is-confirmed" : candidate.review_state === "rejected" || candidate.review_state === "not_applicable" ? "is-muted" : isConflict ? "is-conflict" : Number(candidate.confidence) < HIGH_CONFIDENCE ? "is-low-confidence" : "is-proposed";
                  const display = displayCandidateValue(candidate, locale, valueLabels);
                  return (
                    <form action={actions.review} className={`intake-field ${state}`} key={candidate.id}>
                      <input name="locale" type="hidden" value={locale} /><input name="session_id" type="hidden" value={session.id} /><input name="candidate_id" type="hidden" value={candidate.id} />
                      <div className="intake-field__status"><i />{stateLabel(candidate, isConflict)}</div>
                      <label>
                        <span>{candidate.label}</span>
                        <input defaultValue={editableCandidateValue(candidate)} inputMode={candidate.value_type === "number" ? "decimal" : undefined} name="normalized_value" type="text" />
                        <small>{display}</small>
                      </label>
                      <div className="intake-field__evidence">
                        <span>{candidate.information_class.replaceAll("_", " ")} · {anchorText(candidate, anchorLabels)}</span>
                        {source?.signedUrl ? <a href={source.signedUrl} rel="noreferrer" target="_blank">{t("viewEvidence")}<ArrowRight size={11} /></a> : null}
                      </div>
                      {candidate.raw_value && candidate.raw_value !== display ? <small className="intake-field__raw">{t("original")}: {candidate.raw_value}</small> : null}
                      <input className="intake-field__comment" name="comment" placeholder={t("commentPlaceholder")} />
                      <div className="intake-field__actions">
                        <button name="decision" type="submit" value="accept"><Check size={12} />{t("accept")}</button>
                        <button name="decision" type="submit" value="edit">{t("saveEdit")}</button>
                        <button name="decision" type="submit" value="reject">{t("reject")}</button>
                        <button name="decision" type="submit" value="not_applicable">{t("notApplicable")}</button>
                      </div>
                    </form>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      {!candidates.length ? (
        <section className="intake-review__empty">
          <FileText aria-hidden="true" size={22} />
          <div><strong>{t("emptyTitle")}</strong><p>{t("emptyBody")}</p></div>
          {manualHref ? <Link className="button button--ghost" href={manualHref}>{t("fillManually")}<ArrowRight size={14} /></Link> : null}
        </section>
      ) : (
        <section className="intake-confirm">
          <div><span className="section-kicker">{t("confirmKicker")}</span><h3>{t("confirmTitle")}</h3><p>{t("confirmBody", {count: accepted})}</p></div>
          <form action={actions.confirm}>
            <input name="locale" type="hidden" value={locale} /><input name="session_id" type="hidden" value={session.id} />
            <label><input name="confirmation" required type="checkbox" value="confirmed" /><span>{t("confirmDeclaration")}</span></label>
            <button className="button" type="submit">{t("confirmCta")}<ArrowRight size={15} /></button>
          </form>
        </section>
      )}
    </div>
  );
}
