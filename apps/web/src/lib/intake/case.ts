import type {buildRedeHorizonteDocumentIntake} from "@offroad/testing-fixtures";

import type {Json} from "@/types/database";

import type {IntakeCandidate} from "./types";

export type IntakeCompilation = ReturnType<typeof buildRedeHorizonteDocumentIntake>;

/** Candidate payload for `complete_intake_processing` (tenant, session and actor are added by the function). */
export type IntakeCandidatePayload = {
  extractor_key: string;
  source_document_id: string;
  field_path: string;
  field_group: string;
  label: string;
  raw_value: string | null;
  normalized_value: Json;
  value_type: string;
  unit: string | null;
  currency: string | null;
  period_start: string | null;
  period_end: string | null;
  information_class: string;
  evidence_rank: number;
  source_anchor: Json;
  confidence: number;
  extraction_method: string;
  is_primary: boolean;
};

/** Issue payload for `complete_intake_processing`; `candidate_keys` are resolved to ids inside the function. */
export type IntakeIssuePayload = {
  issue_type: string;
  priority: string;
  field_group: string | null;
  field_path: string | null;
  candidate_keys: string[];
  title: string;
  description: string;
  resolution_hint: string | null;
};

/** Pure: extractor compilation → RPC candidate payload. */
export function buildCandidatePayload(compilation: IntakeCompilation): IntakeCandidatePayload[] {
  return compilation.candidates.map((candidate) => ({
    extractor_key: candidate.key,
    source_document_id: candidate.sourceDocumentId,
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
    is_primary: false,
  }));
}

/** Pure: extractor compilation → RPC issue payload. */
export function buildIssuePayload(compilation: IntakeCompilation): IntakeIssuePayload[] {
  return compilation.issues.map((issue) => ({
    issue_type: issue.type,
    priority: issue.priority,
    field_group: issue.fieldGroup ?? null,
    field_path: issue.fieldPath ?? null,
    candidate_keys: issue.candidateKeys ?? [],
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

/** Human-reviewed contributions; the legacy primary flag is not authority. */
export function confirmedCandidates<T extends Pick<IntakeCandidate, "review_state" | "is_primary">>(candidates: readonly T[]) {
  return candidates.filter((candidate) => (candidate.review_state === "accepted" || candidate.review_state === "edited"));
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
  if (typeof found !== "number" && (typeof found !== "string" || !/^-?[0-9]+(?:\.[0-9]+)?$/.test(found))) return null;
  const numeric = Number(found);
  return Number.isFinite(numeric) ? numeric : null;
}

function currencyAt(byPath: ReadonlyMap<string, Pick<IntakeCandidate, "normalized_value" | "currency">>, path: string) {
  const currency = byPath.get(path)?.currency;
  return typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : null;
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
export function deriveCase(candidates: readonly (Pick<IntakeCandidate, "field_path" | "normalized_value" | "currency" | "review_state" | "is_primary"> & Partial<Pick<IntakeCandidate, "unit" | "value_scale" | "entity_scope" | "period_start" | "period_end" | "value_type">>)[]): DerivedCase | null {
  const reviewed = confirmedCandidates(candidates);
  const byPath = new Map(reviewed.map((candidate) => [candidate.field_path, candidate] as const));
  for (const candidate of reviewed) {
    const siblings = reviewed.filter((other) => other.field_path === candidate.field_path);
    if (new Set(siblings.map((other) => JSON.stringify([other.normalized_value, other.currency, other.unit, other.value_scale, other.entity_scope, other.period_start, other.period_end, other.value_type]))).size > 1) byPath.delete(candidate.field_path);
  }
  const legalName = textAt(byPath, "company.legal_name");
  const purpose = textAt(byPath, "transaction.purpose");
  const requestedAmount = numberAt(byPath, "transaction.requested_amount");
  const currency = currencyAt(byPath, "transaction.requested_amount");
  if (!legalName || !purpose || requestedAmount === null || requestedAmount <= 0 || currency === null) return null;

  const displayName = textAt(byPath, "company.display_name") || legalName;
  const identifier = textAt(byPath, "company.legal_identifier").replace(/[^0-9A-Za-z]/g, "");
  return {
    legalName,
    displayName,
    purpose,
    requestedAmount,
    currency,
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
