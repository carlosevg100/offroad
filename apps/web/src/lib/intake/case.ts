import type {buildRedeHorizonteDocumentIntake} from "@offroad/testing-fixtures";

import type {Json} from "@/types/database";

import type {EvidenceFactInsert, IntakeCandidate, IntakeCandidateInsert, IntakeIssueInsert} from "./types";

export type IntakeCompilation = ReturnType<typeof buildRedeHorizonteDocumentIntake>;

export type IntakeScope = {organizationId: string; sessionId: string; userId: string};

/** Rows for `intake_field_candidates` from an extractor compilation. Pure; no I/O. */
export function buildCandidateRows(compilation: IntakeCompilation, scope: IntakeScope): IntakeCandidateInsert[] {
  return compilation.candidates.map((candidate) => ({
    organization_id: scope.organizationId,
    intake_session_id: scope.sessionId,
    source_document_id: candidate.sourceDocumentId,
    extractor_key: candidate.key,
    field_path: candidate.fieldPath,
    field_group: candidate.fieldGroup,
    label: candidate.label,
    raw_value: candidate.rawValue,
    normalized_value: candidate.normalizedValue as Json,
    value_type: candidate.valueType,
    unit: candidate.unit ?? null,
    currency: candidate.currency ?? null,
    period_start: candidate.periodStart ?? null,
    period_end: candidate.periodEnd ?? null,
    information_class: candidate.informationClass,
    evidence_rank: candidate.evidenceRank,
    source_anchor: candidate.sourceAnchor as Json,
    confidence: candidate.confidence,
    extraction_method: candidate.extractionMethod,
    is_primary: candidate.isPrimary ?? false,
    created_by: scope.userId,
  }));
}

/** Rows for `intake_issues`; `candidateIdByKey` maps extractor keys to persisted candidate ids. */
export function buildIssueRows(compilation: IntakeCompilation, scope: IntakeScope, candidateIdByKey: ReadonlyMap<string, string>): IntakeIssueInsert[] {
  return compilation.issues.map((issue) => ({
    organization_id: scope.organizationId,
    intake_session_id: scope.sessionId,
    issue_type: issue.type,
    priority: issue.priority,
    field_group: issue.fieldGroup ?? null,
    field_path: issue.fieldPath ?? null,
    candidate_ids: (issue.candidateKeys ?? []).map((key) => candidateIdByKey.get(key)).filter((id): id is string => Boolean(id)),
    title: issue.title,
    description: issue.description,
    resolution_hint: issue.resolutionHint ?? null,
  }));
}

/** Summary persisted in `document_intake_sessions.result_summary` after processing. */
export function summarizeCompilation(compilation: IntakeCompilation, counts: {documents: number; candidates: number; issues: number}) {
  return {
    fixture: "rede_horizonte_v1",
    fixture_matched: compilation.fixtureMatched,
    documents: counts.documents,
    candidates: counts.candidates,
    issues: counts.issues,
    missing_files: compilation.missingFiles,
  } satisfies Record<string, Json>;
}

/** Candidates that will become facts: accepted or edited, and primary for their field path. */
export function confirmedCandidates<T extends Pick<IntakeCandidate, "review_state" | "is_primary">>(candidates: readonly T[]) {
  return candidates.filter((candidate) => (candidate.review_state === "accepted" || candidate.review_state === "edited") && candidate.is_primary);
}

export const OPPORTUNITY_TITLE_MAX = 180;

export type DerivedCase = {
  legalName: string;
  displayName: string;
  purpose: string;
  requestedAmount: number;
  currency: string;
  identifier: string;
  sector: string | null;
  subsector: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  projectCost: number | null;
  collateralTotal: number | null;
  /** Opportunity title, bounded to the schema limit; never truncates the legal name below 3 chars. */
  title: string;
};

function textAt(byPath: ReadonlyMap<string, Pick<IntakeCandidate, "normalized_value">>, path: string) {
  const found = byPath.get(path)?.normalized_value;
  return typeof found === "string" || typeof found === "number" ? String(found).trim() : "";
}

function numberAt(byPath: ReadonlyMap<string, Pick<IntakeCandidate, "normalized_value">>, path: string) {
  const found = byPath.get(path)?.normalized_value;
  return typeof found === "number" && Number.isFinite(found) ? found : null;
}

function currencyAt(byPath: ReadonlyMap<string, Pick<IntakeCandidate, "normalized_value" | "currency">>, path: string) {
  const currency = byPath.get(path)?.currency;
  return typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : "BRL";
}

/** Builds "<name> · <purpose>" and clips it to the schema limit, keeping the name whole when possible. */
export function buildOpportunityTitle(name: string, purpose: string, max = OPPORTUNITY_TITLE_MAX) {
  const separator = " · ";
  const cleanName = name.trim();
  const cleanPurpose = purpose.trim();
  if (!cleanPurpose) return cleanName.slice(0, max);
  const full = `${cleanName}${separator}${cleanPurpose}`;
  if (full.length <= max) return full;
  const room = max - cleanName.length - separator.length;
  if (room >= 12) return `${cleanName}${separator}${cleanPurpose.slice(0, room - 1).trimEnd()}…`;
  return full.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Derives the case that will be created from the confirmed candidates. Returns `null` when the
 * three essentials (legal name, purpose, positive requested amount) are not all confirmed —
 * the UI must ask the user instead of inventing them.
 */
export function deriveCase(candidates: readonly Pick<IntakeCandidate, "field_path" | "normalized_value" | "currency" | "review_state" | "is_primary">[]): DerivedCase | null {
  const byPath = new Map(confirmedCandidates(candidates).map((candidate) => [candidate.field_path, candidate] as const));
  const legalName = textAt(byPath, "company.legal_name");
  const purpose = textAt(byPath, "transaction.purpose");
  const requestedAmount = numberAt(byPath, "transaction.requested_amount");
  if (!legalName || !purpose || requestedAmount === null || requestedAmount <= 0) return null;

  const displayName = textAt(byPath, "company.display_name") || legalName;
  const identifier = textAt(byPath, "company.legal_identifier").replace(/[^0-9A-Za-z]/g, "");
  return {
    legalName,
    displayName,
    purpose,
    requestedAmount,
    currency: currencyAt(byPath, "transaction.requested_amount"),
    identifier,
    sector: textAt(byPath, "company.sector") || null,
    subsector: textAt(byPath, "company.subsector") || null,
    website: textAt(byPath, "company.website") || null,
    city: textAt(byPath, "company.city") || null,
    state: textAt(byPath, "company.state") || null,
    projectCost: numberAt(byPath, "project.total_cost"),
    collateralTotal: numberAt(byPath, "collateral.total_capacity"),
    title: buildOpportunityTitle(displayName, purpose),
  };
}

/** Rows for `evidence_facts` promoted from confirmed candidates. Keeps raw value, class and method inside the anchor. */
export function buildEvidenceRows(candidates: readonly IntakeCandidate[], scope: {organizationId: string; opportunityId: string; userId: string; now: string}): EvidenceFactInsert[] {
  return confirmedCandidates(candidates).map((candidate) => {
    const normalized = candidate.normalized_value;
    const numeric = typeof normalized === "number" ? normalized : null;
    const textual = numeric === null ? (typeof normalized === "string" ? normalized : JSON.stringify(normalized)) : null;
    const anchor = candidate.source_anchor && typeof candidate.source_anchor === "object" && !Array.isArray(candidate.source_anchor) ? candidate.source_anchor : {};
    return {
      organization_id: scope.organizationId,
      opportunity_id: scope.opportunityId,
      source_document_id: candidate.source_document_id,
      fact_type: candidate.field_path,
      label: candidate.label,
      value_numeric: numeric,
      value_text: textual,
      unit: candidate.unit,
      currency: candidate.currency,
      period_start: candidate.period_start,
      period_end: candidate.period_end,
      confidence: candidate.confidence,
      review_state: "approved",
      source_anchor: {
        ...(anchor as Record<string, Json>),
        raw_value: candidate.raw_value,
        normalized_value: candidate.normalized_value,
        information_class: candidate.information_class,
        extraction_method: candidate.extraction_method,
      } as Json,
      created_by: scope.userId,
      reviewed_by: scope.userId,
      reviewed_at: candidate.reviewed_at ?? scope.now,
    };
  });
}
