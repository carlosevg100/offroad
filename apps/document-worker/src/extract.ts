import {fieldCatalog, resolveFieldPath} from "@offroad/credit-ontology";
import {extractDocument} from "@offroad/document-extraction";
import type {ModelGateway} from "@offroad/model-gateway";
import type {DocumentProfile as LayerProfile, VerifiedCandidate} from "@offroad/document-intelligence";
import type {DocumentKind, InformationClass} from "@offroad/credit-ontology";
import type {DocumentProfile} from "./pipeline";

import type {Extractor} from "./pipeline";

/**
 * The worker's extraction stage: read the document's own words into candidate facts.
 *
 * This file's only real job is translation — from what the extractor produces to what the
 * review screen reads. Two decisions are made here and both are deliberate:
 *
 *   1. **An unverified candidate is still recorded**, carrying its flags. It cannot be
 *      auto-accepted (nothing here is), but a fact a reviewer has to look at is information;
 *      a fact quietly dropped is a hole nobody knows about.
 *   2. **Nothing is marked primary and nothing is accepted.** Precedence between conflicting
 *      sources is a reconciliation decision, made by rules over evidence rank — not by
 *      whichever document happened to be processed first.
 */

const labelByPattern = new Map(fieldCatalog.map((field) => [field.pattern, field.labels]));

/** The reviewer sees the ontology's name for a field, in their language — never a raw path. */
function labelFor(fieldPath: string, locale: string | undefined): string {
  const resolved = resolveFieldPath(fieldPath);
  if (!resolved) return fieldPath;
  const labels = labelByPattern.get(resolved.definition.pattern);
  if (!labels) return fieldPath;
  return locale === "en-US" ? labels.en : labels.pt;
}

/** A candidate as `worker_record_candidates` expects it. */
export function toCandidateRow(candidate: VerifiedCandidate, options: {locale?: string; evidenceRank: number}) {
  const numeric = candidate.value_type === "number"
    ? Number(candidate.normalized_value)
    : null;
  const normalized =
    candidate.value_type === "number"
      // JSON.stringify converts NaN/Infinity to JSON null. Make that state explicit here so an
      // unparseable, evidence-linked proposal remains reviewable instead of crashing the whole
      // document at the database boundary.
      ? Number.isFinite(numeric) ? numeric : null
      : candidate.value_type === "boolean"
        ? candidate.normalized_value === "true"
        : candidate.value_type === "list"
          ? (JSON.parse(candidate.normalized_value) as unknown)
          : candidate.normalized_value;

  return {
    extractor_key: candidate.extractor_key,
    field_path: candidate.field_path,
    field_group: candidate.field_group,
    label: labelFor(candidate.field_path, options.locale),
    raw_value: candidate.value_raw,
    normalized_value: normalized,
    value_type: candidate.value_type,
    unit: candidate.unit ?? null,
    currency: candidate.currency ?? null,
    period_start: candidate.period?.start ?? null,
    period_end: candidate.period?.end ?? null,
    information_class: candidate.information_class,
    evidence_rank: options.evidenceRank,
    source_anchor: {
      ...candidate.anchor,
      quote: candidate.quote,
      ...(candidate.additional_anchors.length > 0 ? {additional: candidate.additional_anchors} : {}),
    },
    confidence: candidate.confidence,
    // `llm_anchored` is the canonical database method for model-produced facts whose
    // source anchor was verified. Keep this vocabulary aligned with the schema contract;
    // `model_extraction` was an obsolete worker-only label and is normalized at the RPC
    // boundary for backwards compatibility with workers already in flight.
    extraction_method: "llm_anchored",
    // Primacy and acceptance are reconciliation's call, not extraction's.
    is_primary: false,
    anchor_verified: candidate.anchor_verified,
    anchor_precision: candidate.anchor_precision,
    entity_name: candidate.entity?.name ?? null,
    entity_scope: candidate.entity?.scope ?? null,
    value_scale: candidate.scale,
    verifier_flags: candidate.verifier_flags,
  };
}

/**
 * The classifier speaks the database's shape (snake_case, as stored); the verifier speaks the
 * layer's (camelCase, as parsed). This is the seam between them, and it exists in one place so
 * a field can never be silently lost in translation.
 */
export function toLayerProfile(profile: DocumentProfile, documentId: string): LayerProfile {
  return {
    documentId,
    kind: profile.document_kind as DocumentKind,
    informationClass: profile.information_class as InformationClass,
    evidenceRank: profile.evidence_rank,
    confidence: profile.confidence,
    quality: {alerts: []},
    ...(profile.title ? {title: profile.title} : {}),
    ...(profile.entity_name ? {entityName: profile.entity_name} : {}),
    ...(profile.period_start ? {periodStart: profile.period_start} : {}),
    ...(profile.period_end ? {periodEnd: profile.period_end} : {}),
    ...(profile.fiscal_year ? {fiscalYear: profile.fiscal_year} : {}),
    ...(profile.currency ? {currency: profile.currency} : {}),
    ...(profile.scale ? {scale: profile.scale} : {}),
    ...(profile.language === "pt" || profile.language === "en" ? {language: profile.language} : {}),
  };
}

export function createExtractor(gateway: ModelGateway): Extractor {
  return async ({parsed, profile, fileName, locale}) => {
    const result = await extractDocument({
      layer: parsed.layer,
      profile: toLayerProfile(profile, parsed.layer.documentId),
      fileName,
      gateway,
      ...(locale === "en-US" || locale === "pt-BR" ? {localeHint: locale} : {}),
    });

    return {
      candidates: result.candidates.map((candidate) =>
        toCandidateRow(candidate, {...(locale ? {locale} : {}), evidenceRank: profile.evidence_rank}),
      ),
      absentFields: result.absentFields,
      malformed: result.malformed,
      chunks: result.chunks,
      usage: {
        calls: result.usage.calls,
        costUsd: result.usage.costUsd,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
    };
  };
}
