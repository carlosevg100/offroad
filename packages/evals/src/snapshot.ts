import Decimal from "decimal.js";
import {buildRedeHorizonteDocumentIntake, type IntakeCandidateDraft, type IntakeIssueDraft} from "@offroad/testing-fixtures";
import {evidenceRankFor, resolveFieldPath, type InformationClass} from "@offroad/credit-ontology";

/**
 * What an extractor produced for a gold case — the harness input. Any
 * pipeline (the current fixture playback, the P1 pipeline, a shadow model)
 * is compared through this one shape.
 */
export type SnapshotCandidate = {
  fieldPath: string;
  /** Canonical normalized value (Decimal string, ISO date, text, "true"/"false", JSON array). */
  normalizedValue: string;
  valueType: "text" | "number" | "date" | "boolean" | "list";
  sourceDocument?: string;
  periodStart?: string;
  periodEnd?: string;
  informationClass: InformationClass;
  evidenceRank: number;
  confidence: number;
  anchorVerified: boolean;
  anchorPrecision: "cell" | "row" | "block" | "page" | "document" | "unknown";
  /** True when the extractor accepted the value automatically (policy) — used for the hallucination metric. */
  autoAccepted: boolean;
};

export type SnapshotProfile = {
  document: string;
  kind: string;
  informationClass?: InformationClass;
  evidenceRank?: number;
  entityName?: string;
  periodEnd?: string;
};

export type SnapshotException = {
  ruleId?: string;
  type: string;
  severity?: string;
  title: string;
  description: string;
};

export type SnapshotCalculation = {
  id: string;
  value: string;
};

export type ExtractionSnapshot = {
  extractor: {name: string; version: string};
  documents: string[];
  profiles: SnapshotProfile[];
  candidates: SnapshotCandidate[];
  exceptions: SnapshotException[];
  calculations: SnapshotCalculation[];
  /** Cost/usage summary when known (list price). */
  usage?: {costUsd: number; calls: number; latencyMs?: number};
};

export function canonicalValue(value: string | number | boolean | string[]): string {
  if (typeof value === "number") return new Decimal(value).toDecimalPlaces(8).toFixed();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return JSON.stringify(value);
  return value.trim();
}

/** Baseline extractor: the hash-matched Rede Horizonte fixture that runs in production today. */
export function snapshotFromFixture(documents: Array<{id: string; original_name: string; sha256: string | null}>): ExtractionSnapshot {
  const outcome = buildRedeHorizonteDocumentIntake(documents);
  const candidates = outcome.candidates.map((candidate: IntakeCandidateDraft & {sourceDocumentId: string}): SnapshotCandidate => {
    const definition = resolveFieldPath(candidate.fieldPath)?.definition;
    const snapshot: SnapshotCandidate = {
      fieldPath: candidate.fieldPath,
      normalizedValue: canonicalValue(candidate.normalizedValue),
      valueType: candidate.valueType,
      sourceDocument: candidate.sourceName,
      informationClass: candidate.informationClass,
      evidenceRank: candidate.informationClass === "calculated" ? candidate.evidenceRank : evidenceRankFor(candidate.informationClass),
      confidence: candidate.confidence,
      // the fixture carries no verifiable anchor (page/section only) and is never auto-accepted by policy
      anchorVerified: false,
      anchorPrecision: candidate.sourceAnchor.cell ? "cell" : candidate.sourceAnchor.page ? "page" : "document",
      autoAccepted: false,
    };
    if (candidate.periodStart) snapshot.periodStart = candidate.periodStart;
    if (candidate.periodEnd) snapshot.periodEnd = candidate.periodEnd;
    void definition;
    return snapshot;
  });
  const exceptions = outcome.issues.map((issue: IntakeIssueDraft): SnapshotException => ({type: issue.type, severity: issue.priority, title: issue.title, description: issue.description}));
  return {
    extractor: {name: "rede-horizonte-fixture", version: "rede-horizonte-v1"},
    documents: documents.map((d) => d.original_name),
    profiles: [],
    candidates,
    exceptions,
    calculations: [],
  };
}
