import {AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock3, Download, FileText, LoaderCircle, ShieldCheck} from "lucide-react";
import type {MatchCandidate, MatchScreen} from "@offroad/domain-contracts";
import type {Metadata} from "next";
import Link from "next/link";
import {getFormatter, getTranslations} from "next-intl/server";
import {notFound} from "next/navigation";

import {approveMatchShortlist, approveMaterialPackage, approveProductionPlan, authorizeIntroductionPlan, confirmUnderstanding, decideStructure} from "./actions";
import {DealStateRefresh} from "@/components/deal-state/deal-state-refresh";
import {DealStateSubmit} from "@/components/deal-state/deal-state-submit";
import {IntakeCase} from "@/components/intake/intake-case";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadDealStateWorkbench, localizedText, type CompiledStructure, type DealStateRow, type DealStateWorkbench, type StructureAlternative} from "@/lib/deal-state/workbench";
import {loadGovernedMaterialPackage, type GovernedMaterialPackage} from "@/lib/deal-state/materials";
import {resolveCaseState, type CaseState} from "@/lib/intake/case-pipeline";
import type {Database} from "@/types/database";

type Props = {
  params: Promise<{locale: string; opportunityId: string}>;
  searchParams: Promise<{notice?: string}>;
};

type IntroductionPlan = Database["public"]["Tables"]["qualified_introduction_plans"]["Row"];
type IntroductionTarget = Database["public"]["Tables"]["qualified_introduction_targets"]["Row"];
type IntroductionRecipient = Database["public"]["Tables"]["qualified_introduction_recipients"]["Row"];

export const metadata: Metadata = {title: "Opportunity", robots: {index: false, follow: false}};

export default async function OpportunityPage({params, searchParams}: Props) {
  const [{locale, opportunityId}, query] = await Promise.all([params, searchParams]);
  const t = await getTranslations({locale, namespace: "App.dealState"});
  const format = await getFormatter({locale});
  const {supabase, organization} = await requireWorkspace(locale);
  const [{data: opportunity}, {data: session}] = await Promise.all([
    supabase
      .from("opportunities")
      .select("id, title, stage, purpose, requested_amount, currency, readiness_status, updated_at")
      .eq("organization_id", organization.id)
      .eq("id", opportunityId)
      .maybeSingle(),
    supabase
      .from("document_intake_sessions")
      .select("id, project_name, status, opportunity_id, archived_at")
      .eq("organization_id", organization.id)
      .eq("opportunity_id", opportunityId)
      .is("archived_at", null)
      .maybeSingle(),
  ]);
  if (!opportunity || !session) notFound();

  const [workbench, governedMaterials, diagnosticCase, {count: documentCount}, {data: plans}, {data: targets}, {data: recipients}] = await Promise.all([
    loadDealStateWorkbench(supabase, organization.id, session.id),
    loadGovernedMaterialPackage(supabase, organization.id, session.id),
    resolveCaseState({supabase, organizationId: organization.id, sessionId: session.id, locale: locale === "en-US" ? "en" : "pt"}),
    supabase.from("source_documents").select("id", {count: "exact", head: true})
      .eq("organization_id", organization.id).eq("opportunity_id", opportunityId),
    supabase.from("qualified_introduction_plans")
      .select("id, organization_id, intake_session_id, case_fingerprint, material_fingerprint, match_screen_fingerprint, wave_limit, identity_policy, status, technical_review_fingerprint, technical_reviewed_by, technical_reviewed_at, authorization_snapshot, authorized_by, authorized_at, revoked_by, revoked_at, created_by, created_at, updated_at")
      .eq("organization_id", organization.id).eq("intake_session_id", session.id)
      .order("created_at", {ascending: false}).limit(1),
    supabase.from("qualified_introduction_targets")
      .select("id, organization_id, intake_session_id, plan_id, match_screen_fingerprint, provider_id, provider_source, provider_kind, provider_name, fund_directory_id, provider_organization_id, provider_fund_id, mandate_fingerprint, rationale, position, contact_status, resolved_contact_source, resolved_contact_id, resolved_contact_name, resolved_contact_job_title, resolved_contact_email, resolved_at, resolution_note, mandate_revalidated_at, mandate_revalidated_by, mandate_revalidation_note, created_by, created_at, updated_at")
      .eq("organization_id", organization.id).eq("intake_session_id", session.id)
      .order("position", {ascending: true}),
    supabase.from("qualified_introduction_recipients")
      .select("id, organization_id, intake_session_id, plan_id, target_id, provider_source, provider_id, fund_directory_id, provider_organization_id, provider_fund_id, recipient_name, contact_source, contact_uuid, contact_id, contact_name, contact_email, contact_job_title, mandate_fingerprint, rationale, material_manifest, position, is_anchor, created_at")
      .eq("organization_id", organization.id).eq("intake_session_id", session.id)
      .order("position", {ascending: true}),
  ]);
  const introductionPlan = plans?.[0] ?? null;
  const introductionTargets = introductionPlan
    ? (targets ?? []).filter((target) => target.plan_id === introductionPlan.id)
    : [];
  const introductionRecipients = introductionPlan
    ? (recipients ?? []).filter((recipient) => recipient.plan_id === introductionPlan.id)
    : [];
  const amount = format.number(opportunity.requested_amount, {
    style: "currency", currency: opportunity.currency, maximumFractionDigits: 0,
  });
  const projectTitle = session.project_name || opportunity.title;
  const notice = query.notice && t.has(`notices.${query.notice}`) ? t(`notices.${query.notice}`) : null;

  return (
    <main className="deal-workspace">
      <DealStateRefresh active={workbench.isProcessing} />
      <header className="deal-workspace__topbar">
        <Link aria-label={t("back")} href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={15} /></Link>
        <div><span>{t("workspace")}</span><h1 title={projectTitle}>{projectTitle}</h1></div>
        <dl><div><dt>{t("objective")}</dt><dd>{opportunity.purpose}</dd></div><div><dt>{t("amount")}</dt><dd>{amount}</dd></div><div><dt>{t("documents")}</dt><dd>{documentCount ?? 0}</dd></div></dl>
      </header>

      <nav aria-label={t("progressLabel")} className="deal-stage-rail">
        {["understand", "diagnose", "structure", "prepare", "match", "introduce", "captureFeedback"].map((stage, index, stages) => {
          const current = currentStage(workbench, governedMaterials, introductionPlan);
          const currentIndex = stages.indexOf(current);
          return <div className={index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : ""} key={stage}><span>{String(index + 1).padStart(2, "0")}</span><strong>{t(`stages.${stage}`)}</strong></div>;
        })}
      </nav>

      {notice ? <p className="deal-notice" role="status">{notice}</p> : null}

      <div className="deal-workspace__layout">
        <section className="deal-decision-canvas">
          {renderDecisionStage({locale, opportunityId, sessionId: session.id, diagnosticCase, workbench, governedMaterials, introductionPlan, introductionTargets, introductionRecipients, t, format})}
        </section>
        <aside className="deal-control-panel">
          <span className="section-kicker">{t("controlKicker")}</span>
          <h2>{t("controlTitle")}</h2>
          <ul>
            <li><ShieldCheck aria-hidden="true" size={15} /><span>{t("controlEvidence")}</span></li>
            <li><CheckCircle2 aria-hidden="true" size={15} /><span>{t("controlDecision")}</span></li>
            <li><FileText aria-hidden="true" size={15} /><span>{t("controlMaterials")}</span></li>
          </ul>
          <div className="deal-boundary"><strong>{t("boundaryTitle")}</strong><p>{t("boundaryBody")}</p></div>
        </aside>
      </div>
    </main>
  );
}

function currentStage(workbench: DealStateWorkbench, governedMaterials: GovernedMaterialPackage | null, introductionPlan: IntroductionPlan | null) {
  if (introductionPlan?.status === "introduced") return "captureFeedback";
  if (introductionPlan?.status === "authorized") return "introduce";
  if (workbench.packageReview?.status === "approved") return "match";
  if (
    governedMaterials
    || workbench.isProcessing
    || workbench.productionPlan
    || workbench.structureDecision?.status === "confirmed"
    || workbench.structureDecision?.status === "approved"
  ) return "prepare";
  if (workbench.structure) return "structure";
  return "diagnose";
}

function renderDecisionStage({
  locale, opportunityId, sessionId, diagnosticCase, workbench, governedMaterials, introductionPlan, introductionTargets, introductionRecipients, t, format,
}: {
  locale: string;
  opportunityId: string;
  sessionId: string;
  diagnosticCase: CaseState;
  workbench: DealStateWorkbench;
  governedMaterials: GovernedMaterialPackage | null;
  introductionPlan: IntroductionPlan | null;
  introductionTargets: IntroductionTarget[];
  introductionRecipients: IntroductionRecipient[];
  t: Awaited<ReturnType<typeof getTranslations>>;
  format: Awaited<ReturnType<typeof getFormatter>>;
}) {
  const understanding = workbench.understanding;
  const decision = workbench.structureDecision;
  const structure = workbench.structure;

  if (understanding?.row.status === "pending_confirmation") {
    return (
      <article className="deal-review">
        <header><span>{t("understanding.kicker")}</span><h2>{t("understanding.title")}</h2><p>{t("understanding.body")}</p></header>
        <div className="understanding-summary">
          <section><small>{t("understanding.status")}</small><strong>{t(`readiness.${understanding.value.readiness.state}`)}</strong><p>{t("understanding.statusBody")}</p></section>
          <section><small>{t("understanding.reconciliation")}</small><strong>{understanding.value.reconciliation.exceptions.length}</strong><p>{t("understanding.reconciliationBody", {count: understanding.value.reconciliation.exceptions.length})}</p></section>
          <section><small>{t("understanding.openPoints")}</small><strong>{understanding.value.readiness.blockers.length}</strong><p>{t("understanding.openPointsBody")}</p></section>
        </div>
        <div className="understanding-components">
          {understanding.value.readiness.components.map((component) => (
            <section key={component.id}><div><Check aria-hidden="true" size={13} /><strong>{localizedText(component.labels, locale)}</strong></div><p>{localizedText(component.explanation, locale)}</p></section>
          ))}
        </div>
        {understanding.value.readiness.blockers.length ? <section className="deal-open-points"><h3>{t("understanding.blockers")}</h3><ul>{understanding.value.readiness.blockers.map((blocker) => <li key={blocker.id}><AlertTriangle aria-hidden="true" size={14} />{localizedText(blocker.labels, locale)}</li>)}</ul></section> : null}
        <div className="deal-case-dossier__toolbar">
          <div><strong>{t("understanding.dossierTitle")}</strong><p>{t("understanding.dossierBody")}</p></div>
          <a className="button button--ghost" href={`/${locale}/app/case/${sessionId}`} rel="noreferrer" target="_blank"><FileText aria-hidden="true" size={13} />{t("understanding.openDossier")}</a>
        </div>
        <IntakeCase caseState={diagnosticCase} locale={locale} sessionId={sessionId} view="diagnosis" />
        <form action={confirmUnderstanding} className="deal-primary-action">
          <input name="locale" type="hidden" value={locale} />
          <input name="opportunity_id" type="hidden" value={opportunityId} />
          <div><strong>{t("understanding.confirmTitle")}</strong><p>{t("understanding.confirmBody")}</p></div>
          <DealStateSubmit idle={t("understanding.confirm")} pending={t("understanding.confirming")} value="confirm" />
        </form>
      </article>
    );
  }

  const revisedOptionReady = Boolean(structure && decision?.status === "changes_requested" && new Date(structure.row.created_at) > new Date(decision.created_at));
  if (workbench.isProcessing || (understanding?.row.status === "confirmed" && !structure) || (decision?.status === "changes_requested" && !revisedOptionReady)) {
    return <ProcessingState t={t} />;
  }

  if (governedMaterials && workbench.packageReview?.status !== "approved") {
    return <MaterialReview governed={governedMaterials} locale={locale} opportunityId={opportunityId} sessionId={sessionId} t={t} />;
  }

  if (workbench.matchScreen) {
    return <MatchReview introductionPlan={introductionPlan} introductionRecipients={introductionRecipients} introductionTargets={introductionTargets} locale={locale} match={workbench.matchScreen} opportunityId={opportunityId} t={t} />;
  }

  if (workbench.packageReview?.status === "approved") {
    return <article className="deal-review deal-review--state"><CheckCircle2 aria-hidden="true" size={22} /><span>{t("materialsApproved.kicker")}</span><h2>{t("materialsApproved.title")}</h2><p>{t("materialsApproved.body")}</p></article>;
  }

  if (workbench.productionPlan?.row.status === "pending_confirmation") {
    return <article className="deal-review"><header><span>{t("production.kicker")}</span><h2>{t("production.title")}</h2><p>{t("production.body")}</p></header><div className="production-artifacts">{workbench.productionPlan.value.artifacts.map((artifact, index) => <section key={artifact}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{t(`production.artifacts.${artifact}`)}</strong><p>{t(`production.artifactDescriptions.${artifact}`)}</p></div></section>)}</div><form action={approveProductionPlan} className="deal-primary-action"><input name="locale" type="hidden" value={locale} /><input name="opportunity_id" type="hidden" value={opportunityId} /><input name="plan_fingerprint" type="hidden" value={workbench.productionPlan.row.object_fingerprint} /><div><strong>{t("production.approvalTitle")}</strong><p>{t("production.pendingApproval")}</p></div><DealStateSubmit idle={t("production.approve")} pending={t("production.approving")} value="approve" /></form><p className="deal-inline-boundary">{t("production.boundary")}</p></article>;
  }

  if (
    structure?.row.status === "pending_confirmation"
    && structure.value.status === "pending_confirmation"
    && decision?.status !== "confirmed"
    && decision?.status !== "approved"
  ) {
    return <StructureReview caseState={diagnosticCase} format={format} locale={locale} opportunityId={opportunityId} sessionId={sessionId} structure={structure.value} t={t} />;
  }

  if (decision?.status === "declined") {
    return <article className="deal-review deal-review--state"><AlertTriangle aria-hidden="true" size={22} /><span>{t("declined.kicker")}</span><h2>{t("declined.title")}</h2><p>{t("declined.body")}</p></article>;
  }

  return <article className="deal-review deal-review--state"><Clock3 aria-hidden="true" size={22} /><span>{t("waiting.kicker")}</span><h2>{t("waiting.title")}</h2><p>{t("waiting.body")}</p></article>;
}

function MatchReview({
  match, introductionPlan, introductionTargets, introductionRecipients, locale, opportunityId, t,
}: {
  match: {row: DealStateRow; value: MatchScreen};
  introductionPlan: IntroductionPlan | null;
  introductionTargets: IntroductionTarget[];
  introductionRecipients: IntroductionRecipient[];
  locale: string;
  opportunityId: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const screen = match.value;
  const approved = match.row.status === "approved" && Boolean(screen.approval);
  const selectedIds = new Set(screen.approval?.selectedProviderIds ?? []);
  const visible = screen.candidates.filter((candidate) => candidate.verdict !== "excluded");
  const excluded = screen.candidates.filter((candidate) => candidate.verdict === "excluded");
  const unresolvedTargets = introductionTargets.filter((target) => target.contact_status === "unresolved");
  const resolvedTargets = introductionTargets.filter((target) => target.contact_status === "resolved");
  const exactPlanReady = Boolean(
    introductionPlan?.status === "draft"
    && introductionPlan.technical_review_fingerprint === introductionPlan.material_fingerprint
    && introductionPlan.technical_reviewed_at
    && introductionRecipients.length > 0
    && unresolvedTargets.length === 0
    && introductionRecipients.length === resolvedTargets.length,
  );
  const authorized = introductionPlan?.status === "authorized";
  return (
    <article className="deal-review match-review">
      <header>
        <span>{t("matching.kicker")}</span>
        <h2>{t("matching.title")}</h2>
        <p>{t("matching.body")}</p>
      </header>
      <div className="match-summary">
        <section><small>{t("matching.screened")}</small><strong>{screen.summary.screened}</strong></section>
        <section><small>{t("matching.eligible")}</small><strong>{screen.summary.eligible}</strong></section>
        <section><small>{t("matching.pending")}</small><strong>{screen.summary.blockedByGovernance}</strong></section>
        <section><small>{t("matching.excluded")}</small><strong>{screen.summary.excluded}</strong></section>
      </div>
      {visible.length ? (
        <form action={approveMatchShortlist} className="match-selection">
          <input name="locale" type="hidden" value={locale} />
          <input name="opportunity_id" type="hidden" value={opportunityId} />
          <input name="match_screen_fingerprint" type="hidden" value={match.row.object_fingerprint} />
          <div className="match-candidates">
            {visible.map((candidate) => (
              <MatchCandidateCard
                candidate={candidate}
                key={candidate.providerId}
                locale={locale}
                selectable={!approved && candidate.eligibleForShortlist}
                selected={approved ? selectedIds.has(candidate.providerId) : candidate.eligibleForShortlist}
                t={t}
              />
            ))}
          </div>
          {approved ? (
            <section className="match-approval-state"><CheckCircle2 aria-hidden="true" size={18} /><div><strong>{t("matching.approvedTitle")}</strong><p>{t("matching.approvedBody", {count: selectedIds.size})}</p></div></section>
          ) : screen.summary.eligible ? (
            <div className="match-approval-action"><div><strong>{t("matching.approvalTitle")}</strong><p>{t("matching.approvalBody")}</p></div><DealStateSubmit idle={t("matching.approve")} pending={t("matching.approving")} value="approve" /></div>
          ) : null}
        </form>
      ) : (
        <section className="deal-open-points">
          <h3>{t(`matching.empty.${screen.status}.title`)}</h3>
          <p>{t(`matching.empty.${screen.status}.body`)}</p>
        </section>
      )}
      {excluded.length ? (
        <details className="match-excluded">
          <summary>{t("matching.showExcluded", {count: excluded.length})}</summary>
          <div>{excluded.map((candidate) => <MatchCandidateCard candidate={candidate} key={candidate.providerId} locale={locale} t={t} />)}</div>
        </details>
      ) : null}
      {approved && introductionPlan ? (
        <section className="match-plan">
          <header><span>{t("matching.planKicker")}</span><h3>{t("matching.planTitle")}</h3><p>{t("matching.planBody")}</p></header>
          <div className="match-plan__targets">
            {introductionTargets.map((target) => (
              <section key={target.id}>
                <span>{String(target.position).padStart(2, "0")}</span>
                <div>
                  <strong>{target.provider_name}</strong>
                  <p>{target.rationale}</p>
                  {target.resolved_contact_name ? <p className="match-plan__contact">{target.resolved_contact_name}{target.resolved_contact_job_title ? ` · ${target.resolved_contact_job_title}` : ""}</p> : null}
                </div>
                <small className={`is-${target.contact_status}`}>{t(`matching.contactStatus.${target.contact_status}`)}</small>
              </section>
            ))}
          </div>
          {introductionRecipients.length ? (
            <section className="match-authorization">
              <header>
                <span>{t("matching.authorizationKicker")}</span>
                <h3>{authorized ? t("matching.authorizationCompleteTitle") : t("matching.authorizationTitle")}</h3>
                <p>{authorized ? t("matching.authorizationCompleteBody") : t("matching.authorizationBody")}</p>
              </header>
              <div className="match-authorization__recipients">
                {introductionRecipients.map((recipient) => (
                  <section key={recipient.id}>
                    <div>
                      <strong>{recipient.recipient_name}</strong>
                      <p>{recipient.contact_name}{recipient.contact_job_title ? ` · ${recipient.contact_job_title}` : ""}</p>
                      <small>{recipient.contact_email}</small>
                    </div>
                    <ul>
                      {Array.isArray(recipient.material_manifest) ? recipient.material_manifest.map((material) => (
                        <li key={String(material)}>{t.has(`production.artifacts.${String(material)}`) ? t(`production.artifacts.${String(material)}`) : String(material)}</li>
                      )) : null}
                    </ul>
                  </section>
                ))}
              </div>
              {exactPlanReady ? (
                <form action={authorizeIntroductionPlan} className="deal-primary-action">
                  <input name="locale" type="hidden" value={locale} />
                  <input name="opportunity_id" type="hidden" value={opportunityId} />
                  <input name="plan_id" type="hidden" value={introductionPlan.id} />
                  <input name="material_fingerprint" type="hidden" value={introductionPlan.material_fingerprint} />
                  <div><strong>{t("matching.authorizationDeclarationTitle")}</strong><p>{t("matching.authorizationDeclarationBody")}</p></div>
                  <DealStateSubmit idle={t("matching.authorize")} pending={t("matching.authorizing")} value="authorize" />
                </form>
              ) : authorized ? (
                <section className="match-authorization__complete"><CheckCircle2 aria-hidden="true" size={18} /><p>{t("matching.authorizationCompleteStatus")}</p></section>
              ) : (
                <section className="match-authorization__pending"><Clock3 aria-hidden="true" size={16} /><p>{t("matching.authorizationPending")}</p></section>
              )}
            </section>
          ) : null}
          <p className="match-plan__boundary"><ShieldCheck aria-hidden="true" size={14} />{t("matching.planBoundary")}</p>
        </section>
      ) : null}
      {!authorized ? (
        <section className="match-next-gate">
          <ShieldCheck aria-hidden="true" size={18} />
          <div><strong>{t("matching.noContactTitle")}</strong><p>{t("matching.noContactBody")}</p></div>
        </section>
      ) : null}
      <p className="deal-inline-boundary">{t("matching.boundary")}</p>
    </article>
  );
}

function MatchCandidateCard({
  candidate, locale, selectable = false, selected = false, t,
}: {
  candidate: MatchCandidate;
  locale: string;
  selectable?: boolean;
  selected?: boolean;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const confirmed = candidate.criteria.filter((criterion) => criterion.outcome === "fits");
  const open = candidate.criteria.filter((criterion) => criterion.outcome === "unknown" || criterion.outcome === "not_assessed");
  const conflicts = candidate.criteria.filter((criterion) => criterion.outcome === "conflicts");
  return (
    <section className={`match-candidate is-${candidate.verdict}${candidate.eligibleForShortlist ? " is-eligible" : ""}`}>
      <header>
        <div>{selectable ? <input aria-label={t("matching.selectProvider", {name: candidate.providerName})} defaultChecked={selected} name="selected_provider_id" type="checkbox" value={candidate.providerId} /> : <span>{selected ? <Check aria-hidden="true" size={13} /> : String(candidate.order).padStart(2, "0")}</span>}<div><small>{t(`matching.providerKinds.${candidate.providerKind}`)}</small><h3>{candidate.providerName}</h3></div></div>
        <strong>{candidate.eligibleForShortlist ? t("matching.verdicts.eligible") : t(`matching.verdicts.${candidate.verdict}`)}</strong>
      </header>
      <p className="match-candidate__rationale">{candidate.rationale}</p>
      {confirmed.length ? <div className="match-criteria"><strong>{t("matching.confirmedCriteria")}</strong><ul>{confirmed.map((criterion) => <li key={criterion.id}><Check aria-hidden="true" size={13} /><span><b>{locale === "pt-BR" ? criterion.label.pt : criterion.label.en}</b>{criterion.transaction ? ` · ${criterion.transaction}` : ""}</span></li>)}</ul></div> : null}
      {open.length ? <div className="match-criteria is-open"><strong>{t("matching.openCriteria")}</strong><ul>{open.map((criterion) => <li key={criterion.id}><Clock3 aria-hidden="true" size={13} /><span><b>{locale === "pt-BR" ? criterion.label.pt : criterion.label.en}</b>{criterion.resolvedBy ? ` · ${t("matching.resolvedBy", {value: criterion.resolvedBy})}` : ""}</span></li>)}</ul></div> : null}
      {conflicts.length ? <div className="match-criteria is-conflict"><strong>{t("matching.conflictingCriteria")}</strong><ul>{conflicts.map((criterion) => <li key={criterion.id}><AlertTriangle aria-hidden="true" size={13} /><span><b>{locale === "pt-BR" ? criterion.label.pt : criterion.label.en}</b> · {locale === "pt-BR" ? criterion.explanation.pt : criterion.explanation.en}</span></li>)}</ul></div> : null}
      {candidate.governanceBlockers.length ? <p className="match-governance"><AlertTriangle aria-hidden="true" size={13} />{t("matching.mandateRefresh")}</p> : null}
    </section>
  );
}

function MaterialReview({
  governed, locale, opportunityId, sessionId, t,
}: {
  governed: GovernedMaterialPackage;
  locale: string;
  opportunityId: string;
  sessionId: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const artifacts = [
    {id: "teaser", available: governed.materials.some((material) => material.kind === "teaser"), href: `/${locale}/app/materials/${sessionId}/teaser`},
    {id: "financial_model", available: Boolean(governed.financialModel), href: `/${locale}/app/model/${sessionId}`},
    {id: "indicative_term_sheet", available: governed.materials.some((material) => material.kind === "term_sheet"), href: `/${locale}/app/materials/${sessionId}/term_sheet`},
    {id: "data_room_index", available: governed.materials.some((material) => material.kind === "data_room_index"), href: `/${locale}/app/materials/${sessionId}/data_room_index`},
  ] as const;
  const complete = artifacts.every((artifact) => artifact.available);
  return <article className="deal-review material-review"><header><span>{t("materials.kicker")}</span><h2>{t("materials.title")}</h2><p>{t("materials.body")}</p></header><div className="material-review__list">{artifacts.map((artifact, index) => <section className={artifact.available ? "is-ready" : "is-blocked"} key={artifact.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{t(`production.artifacts.${artifact.id}`)}</strong><p>{artifact.available ? t("materials.ready") : t("materials.unavailable")}</p></div>{artifact.available ? <a href={artifact.href} rel="noreferrer" target="_blank"><Download aria-hidden="true" size={14} />{t("materials.open")}</a> : <small>{t("materials.blocked")}</small>}</section>)}</div>{complete ? <form action={approveMaterialPackage} className="deal-primary-action"><input name="locale" type="hidden" value={locale} /><input name="opportunity_id" type="hidden" value={opportunityId} /><input name="artifact_fingerprint" type="hidden" value={governed.artifactFingerprint} /><div><strong>{t("materials.approvalTitle")}</strong><p>{t("materials.approvalBody")}</p></div><DealStateSubmit idle={t("materials.approve")} pending={t("materials.approving")} value="approve" /></form> : <section className="deal-open-points"><h3>{t("materials.incompleteTitle")}</h3><p>{t("materials.incompleteBody")}</p></section>}<p className="deal-inline-boundary">{t("materials.boundary")}</p></article>;
}

function ProcessingState({t}: {t: Awaited<ReturnType<typeof getTranslations>>}) {
  return <article className="deal-review deal-review--processing"><LoaderCircle aria-hidden="true" className="spin" size={24} /><span>{t("processing.kicker")}</span><h2>{t("processing.title")}</h2><p>{t("processing.body")}</p><div><i /><strong>{t("processing.status")}</strong></div></article>;
}

function StructureReview({
  caseState, structure, locale, opportunityId, sessionId, t, format,
}: {
  caseState: CaseState;
  structure: CompiledStructure;
  locale: string;
  opportunityId: string;
  sessionId: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
  format: Awaited<ReturnType<typeof getFormatter>>;
}) {
  const recommendedId = structure.recommendation?.status === "ready_for_confirmation" ? structure.recommendation.alternativeId : null;
  const defaultId = recommendedId ?? structure.alternatives.find((alternative) => alternative.confirmationEligible)?.id ?? structure.alternatives[0]?.id;
  return (
    <article className="deal-review structure-review">
      <header><span>{t("structure.kicker")}</span><h2>{t("structure.title")}</h2><p>{t("structure.body")}</p></header>
      <div className="deal-case-dossier__toolbar">
        <div><strong>{t("understanding.dossierTitle")}</strong><p>{t("understanding.dossierBody")}</p></div>
        <a className="button button--ghost" href={`/${locale}/app/case/${sessionId}`} rel="noreferrer" target="_blank"><FileText aria-hidden="true" size={13} />{t("understanding.openDossier")}</a>
      </div>
      <IntakeCase caseState={caseState} locale={locale} sessionId={sessionId} view="diagnosis" />
      {structure.recommendation ? <section className="structure-recommendation"><span>{t("structure.recommended")}</span><strong>{structure.alternatives.find((alternative) => alternative.id === recommendedId)?.label ?? t("structure.direction")}</strong><p>{structure.recommendation.rationale}</p></section> : null}
      <form action={decideStructure}>
        <input name="locale" type="hidden" value={locale} />
        <input name="opportunity_id" type="hidden" value={opportunityId} />
        <input name="proposal_fingerprint" type="hidden" value={structure.proposalFingerprint ?? ""} />
        <div className="structure-alternatives">
          {structure.alternatives.map((alternative) => <AlternativeCard alternative={alternative} defaultChecked={alternative.id === defaultId} format={format} key={alternative.id} recommended={alternative.id === recommendedId} t={t} />)}
        </div>
        <label className="structure-feedback"><span>{t("structure.feedbackLabel")}</span><textarea maxLength={2500} name="feedback" placeholder={t("structure.feedbackPlaceholder")} rows={4} /></label>
        <div className="structure-actions">
          <DealStateSubmit idle={t("structure.confirm")} pending={t("structure.saving")} value="confirm" />
          <DealStateSubmit idle={t("structure.requestChanges")} pending={t("structure.saving")} value="request_changes" />
          <DealStateSubmit idle={t("structure.decline")} pending={t("structure.saving")} value="decline" />
        </div>
      </form>
      <p className="deal-inline-boundary">{t("structure.boundary")}</p>
    </article>
  );
}

function AlternativeCard({
  alternative, recommended, defaultChecked, t, format,
}: {
  alternative: StructureAlternative;
  recommended: boolean;
  defaultChecked: boolean;
  t: Awaited<ReturnType<typeof getTranslations>>;
  format: Awaited<ReturnType<typeof getFormatter>>;
}) {
  const amount = format.number(Number(alternative.amount), {style: "currency", currency: alternative.currency, maximumFractionDigits: 0});
  return (
    <label className={`structure-alternative${recommended ? " is-recommended" : ""}${!alternative.confirmationEligible ? " is-blocked" : ""}`}>
      <input defaultChecked={defaultChecked} name="selected_alternative_id" required type="radio" value={alternative.id} />
      <header><div><span>{alternative.instrument}</span><h3>{alternative.label}</h3></div>{recommended ? <small>{t("structure.recommendedBadge")}</small> : null}</header>
      <p>{alternative.rationale}</p>
      <dl><div><dt>{t("structure.amount")}</dt><dd>{amount}</dd></div><div><dt>{t("structure.term")}</dt><dd>{t("structure.months", {count: alternative.termMonths})}</dd></div><div><dt>{t("structure.grace")}</dt><dd>{t("structure.months", {count: alternative.graceMonths})}</dd></div><div><dt>{t("structure.amortization")}</dt><dd>{t.has(`structure.amortizationTypes.${alternative.amortization}`) ? t(`structure.amortizationTypes.${alternative.amortization}`) : alternative.amortization}</dd></div><div><dt>{t("structure.price")}</dt><dd>{alternative.totalCost.totalRate ? `${alternative.totalCost.totalRate.min} a ${alternative.totalCost.totalRate.max}` : t("structure.pricePending")}</dd></div><div><dt>{t("structure.execution")}</dt><dd>{alternative.implementationDays ? t("structure.days", {min: alternative.implementationDays.min, max: alternative.implementationDays.max}) : t("structure.notEstimated")}</dd></div></dl>
      <dl className="structure-alternative__economics">
        <div><dt>{t("structure.indexer")}</dt><dd>{alternative.indexer}</dd></div>
        <div><dt>{t("structure.totalSources")}</dt><dd>{format.number(Number(alternative.sourcesAndUses.totalSources), {style: "currency", currency: alternative.currency, maximumFractionDigits: 0})}</dd></div>
        <div><dt>{t("structure.totalUses")}</dt><dd>{format.number(Number(alternative.sourcesAndUses.totalUses), {style: "currency", currency: alternative.currency, maximumFractionDigits: 0})}</dd></div>
        <div><dt>{t("structure.sourcesUsesStatus")}</dt><dd>{t(`structure.sourcesUses.${alternative.sourcesAndUses.status}`)}</dd></div>
      </dl>
      <div className="structure-alternative__details"><section><strong>{t("structure.advantages")}</strong><ul>{alternative.pros.map((item) => <li key={item}>{item}</li>)}</ul></section><section><strong>{t("structure.attention")}</strong><ul>{alternative.cons.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
      <div className="structure-alternative__terms">
        {alternative.security.length ? <section><strong>{t("structure.security")}</strong><ul>{alternative.security.map((item) => <li key={item.description}>{item.description}</li>)}</ul></section> : null}
        {alternative.covenants.length ? <section><strong>{t("structure.covenants")}</strong><ul>{alternative.covenants.map((item) => <li key={item.description}>{item.description}</li>)}</ul></section> : null}
        {alternative.conditionsPrecedent.length ? <section><strong>{t("structure.conditionsPrecedent")}</strong><ul>{alternative.conditionsPrecedent.map((item) => <li key={item.description}>{item.description}</li>)}</ul></section> : null}
        {alternative.assumptions.length ? <section><strong>{t("structure.assumptions")}</strong><ul>{alternative.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
      </div>
      {alternative.missingInputs.length || alternative.blockers.length ? <section className="structure-alternative__open"><strong>{t("structure.openDependencies")}</strong><ul>{[...alternative.blockers, ...alternative.missingInputs].map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
      {!alternative.confirmationEligible ? <p className="structure-blocked"><AlertTriangle aria-hidden="true" size={13} />{t("structure.notConfirmable")}</p> : null}
    </label>
  );
}
