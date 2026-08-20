import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {resolveFieldPath, type AnchorPrecision} from "@offroad/credit-ontology";
import {lookupAnchor, type LayerIndex} from "./layer-index";
import type {DocumentLayer, DocumentProfile, RawExtractionCandidate, VerifiedCandidate, VerifierFlag} from "./schemas";
import {containsNormalized, digitSequence, normalizeText, parseBoolean, parseDate, parseList, parseNumber} from "./text";

export type VerificationContext = {
  index: LayerIndex;
  layer: Pick<DocumentLayer, "scaleDeclarations">;
  profile: Pick<DocumentProfile, "documentId" | "entityName" | "periodStart" | "periodEnd" | "scale">;
  documentVersion: number;
  localeHint?: "pt-BR" | "en-US";
};

export type RejectedCandidate = {candidate: RawExtractionCandidate; reason: "field_unknown"};

export type VerificationReport = {
  verified: VerifiedCandidate[];
  rejected: RejectedCandidate[];
};

/** Flags that make an anchor unverifiable (auto-accept impossible). */
export const fatalVerifierFlags: ReadonlySet<VerifierFlag> = new Set([
  "anchor_missing",
  "quote_not_in_anchor",
  "value_not_in_quote",
  "digits_not_in_anchor",
  "value_unparseable",
  "field_unknown",
]);

export function computeExtractorKey(input: {fieldPath: string; sourceDocumentId: string; documentVersion: number; anchorId: string; valueRaw: string}): string {
  return createHash("sha256")
    .update([input.fieldPath, input.sourceDocumentId, String(input.documentVersion), input.anchorId, normalizeText(input.valueRaw)].join("|"))
    .digest("hex");
}

/**
 * Verifies model output against the document layer (P1 plan §7.2). Never
 * mutates the candidate's meaning: it only records what could and could not be
 * confirmed and computes the normalized value deterministically.
 */
export function verifyCandidates(candidates: RawExtractionCandidate[], context: VerificationContext): VerificationReport {
  const verified: VerifiedCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  for (const candidate of candidates) {
    const outcome = verifyCandidate(candidate, context);
    if (outcome.kind === "rejected") rejected.push({candidate, reason: outcome.reason});
    else verified.push(outcome.value);
  }
  return {verified: dedupeCandidates(verified), rejected};
}

export function verifyCandidate(
  candidate: RawExtractionCandidate,
  context: VerificationContext,
): {kind: "verified"; value: VerifiedCandidate} | {kind: "rejected"; reason: "field_unknown"} {
  const field = resolveFieldPath(candidate.field_path);
  if (!field) return {kind: "rejected", reason: "field_unknown"};

  const flags = new Set<VerifierFlag>();
  const anchor = lookupAnchor(context.index, candidate.anchor.id);
  let precision: AnchorPrecision = anchor?.precision ?? "document";
  if (!anchor) {
    flags.add("anchor_missing");
    precision = candidate.anchor.kind === "page" ? "page" : "document";
  } else {
    if (!containsNormalized(anchor.text, candidate.quote)) {
      // A cell is one number; the row is where its meaning lives. Citing `p3.t1.r2.c3` while
      // quoting "Receita líquida | 142,6 | 164,3 | 184,7" is precise, honest behaviour — the
      // anchor names the exact cell, the quote shows the reader the whole line — and it was
      // being flagged as an invented trace. The quote may live in the enclosing row; the
      // digits check below still holds the value against the cell itself.
      const rowId = /\.r\d+\.c\d+$/.test(candidate.anchor.id) ? candidate.anchor.id.replace(/\.c\d+$/, "") : null;
      const row = rowId ? lookupAnchor(context.index, rowId) : undefined;
      if (!row || !containsNormalized(row.text, candidate.quote)) flags.add("quote_not_in_anchor");
    }
    if (!containsNormalized(candidate.quote, candidate.value_raw)) flags.add("value_not_in_quote");
    if (candidate.value_type === "number") {
      const digits = digitSequence(candidate.value_raw);
      if (digits.length > 0 && !digitSequence(anchor.text).includes(digits)) flags.add("digits_not_in_anchor");
    }
  }

  const expectedType = field.definition.valueType;
  if (expectedType !== candidate.value_type) flags.add("value_type_mismatch");

  let normalizedValue = candidate.value_raw.trim();
  let effectiveScale = candidate.scale;
  if (expectedType === "number") {
    const parsed = parseNumber(candidate.value_raw, context.localeHint ?? "pt-BR");
    if (!parsed) {
      flags.add("value_unparseable");
    } else if (field.definition.unit !== "money") {
      // percentages, ratios, counts, months… are stored at displayed magnitude (12,5% → 12.5) and never scaled
      effectiveScale = 1;
      normalizedValue = parsed.value.toDecimalPlaces(8).toFixed();
    } else {
      if (parsed.detectedScale && candidate.scale !== 1 && parsed.detectedScale !== candidate.scale) flags.add("scale_conflict");
      effectiveScale = candidate.scale !== 1 ? candidate.scale : (parsed.detectedScale ?? 1);
      // Money is stored at cent precision. Anything past two decimals in a currency amount is
      // an artifact of parsing or of the model's own arithmetic, never information — and it is
      // exactly the kind of noise that makes 53760000 fail to equal 53760000.00000001.
      normalizedValue = parsed.value.times(effectiveScale).toDecimalPlaces(2).toFixed();
      // a scale other than 1 must be declared somewhere we can see (document/table header or profile)
      const declaredInText = parsed.detectedScale === effectiveScale;
      const declared = declaredInText || context.layer.scaleDeclarations.some((d) => d.scale === effectiveScale) || context.profile.scale === effectiveScale;
      if (effectiveScale !== 1 && !declared) flags.add("scale_unverified");
      if (context.profile.scale && candidate.scale !== 1 && context.profile.scale !== candidate.scale) flags.add("scale_conflict");
    }
  } else if (expectedType === "date") {
    const iso = parseDate(candidate.value_raw);
    if (!iso) flags.add("value_unparseable");
    else normalizedValue = iso;
  } else if (expectedType === "boolean") {
    const bool = parseBoolean(candidate.value_raw);
    if (bool === null) flags.add("value_unparseable");
    else normalizedValue = bool ? "true" : "false";
  } else if (expectedType === "list") {
    normalizedValue = JSON.stringify(parseList(candidate.value_raw));
  } else if (field.definition.canonical) {
    // The ontology, not the model, decides the canonical form of these values. "12.345.678/0001-95"
    // and "12345678000195" are one CNPJ; "Fontes", "FONTES" and "origens" are one side of a
    // sources & uses table; "São Paulo — SP" is the UF. A value that reduces to nothing is a
    // value the field cannot hold, and it says so instead of passing as prose.
    const canonical = canonicalizeText(candidate.value_raw, field.definition.canonical);
    if (canonical === null) flags.add("value_unparseable");
    else normalizedValue = canonical;
  }

  if (candidate.period && context.profile.periodEnd && candidate.period.end > context.profile.periodEnd && field.definition.group !== "projections") {
    flags.add("period_outside_document");
  }
  if (candidate.entity && context.profile.entityName && !entitiesCompatible(candidate.entity.name, context.profile.entityName)) {
    flags.add("entity_mismatch");
  }

  const anchorVerified = ![...flags].some((flag) => fatalVerifierFlags.has(flag));
  const value: VerifiedCandidate = {
    ...candidate,
    scale: effectiveScale,
    extractor_key: computeExtractorKey({
      fieldPath: candidate.field_path,
      sourceDocumentId: context.profile.documentId,
      documentVersion: context.documentVersion,
      anchorId: candidate.anchor.id,
      valueRaw: candidate.value_raw,
    }),
    source_document_id: context.profile.documentId,
    document_version: context.documentVersion,
    field_group: field.definition.group,
    materiality: field.definition.materiality,
    anchor_verified: anchorVerified,
    anchor_precision: precision,
    verifier_flags: [...flags],
    normalized_value: normalizedValue,
    additional_anchors: [],
  };
  return {kind: "verified", value};
}

/** Applies an ontology-declared canonical form to a text value. Returns null when the value cannot hold it. */
export function canonicalizeText(raw: string, canonical: NonNullable<ReturnType<typeof resolveFieldPath>>["definition"]["canonical"]): string | null {
  if (!canonical) return raw.trim();
  if (canonical.kind === "digits") {
    const digits = raw.replace(/\D+/g, "");
    return digits.length > 0 ? digits : null;
  }
  const normalized = normalizeText(raw);
  for (const value of canonical.values) {
    if (normalized === normalizeText(value)) return value;
  }
  // Longest synonym first, so "mato grosso do sul" wins over "mato grosso" inside prose.
  const synonyms = Object.entries(canonical.synonyms).sort((a, b) => b[0].length - a[0].length);
  for (const [synonym, value] of synonyms) {
    if (normalized === synonym || normalized.includes(synonym)) return value;
  }
  // A bare canonical value embedded in prose ("São Paulo — SP") still resolves.
  for (const value of canonical.values) {
    const token = normalizeText(value);
    if (new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`).test(normalized)) return value;
  }
  return null;
}

function entitiesCompatible(left: string, right: string): boolean {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a.includes(b) || b.includes(a)) return true;
  const stop = new Set(["ltda", "ltda.", "s.a.", "sa", "s/a", "s.a", "me", "epp", "eireli", "holding", "participacoes", "de", "do", "da", "e", "-"]);
  const tokens = (value: string) => new Set(value.split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !stop.has(t)));
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared += 1;
  const jaccard = shared / (ta.size + tb.size - shared);
  return jaccard >= 0.5;
}

/**
 * Merges candidates that state the same fact (field, period, entity, value):
 * the highest-confidence one survives and carries the others' anchors.
 */
export function dedupeCandidates(candidates: VerifiedCandidate[]): VerifiedCandidate[] {
  const groups = new Map<string, VerifiedCandidate[]>();
  for (const candidate of candidates) {
    const key = [
      candidate.field_path,
      candidate.period?.start ?? "",
      candidate.period?.end ?? "",
      candidate.entity ? normalizeText(candidate.entity.name) : "",
      candidate.entity?.scope ?? "",
      candidate.normalized_value,
    ].join("|");
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }
  const result: VerifiedCandidate[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => Number(b.anchor_verified) - Number(a.anchor_verified) || b.confidence - a.confidence);
    const [primary, ...rest] = sorted;
    if (!primary) continue;
    result.push({...primary, additional_anchors: [...primary.additional_anchors, ...rest.map((c) => c.anchor)]});
  }
  return result;
}

/** Sum helper kept here so the verifier tests can assert Decimal identity behaviour without financial-core. */
export function sumDecimalStrings(values: string[]): string {
  return values.reduce<Decimal>((total, value) => total.plus(new Decimal(value)), new Decimal(0)).toDecimalPlaces(8).toFixed();
}
