import {z} from "zod";
import {normalizeOriginatorNumber} from "@offroad/financial-core";

export const originatorEvidenceKey = z.string().trim().min(1).max(160);
export const originatorSourceReferenceSchema = z.strictObject({
  id: originatorEvidenceKey, documentId: z.uuid(), sourceVersionId: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  anchor: originatorEvidenceKey, quote: z.string().trim().min(1).max(12000),
  origin: z.enum(["provided_document", "authorized_public_query"]), consultedAt: z.iso.date(),
});
export type OriginatorSourceReference = z.infer<typeof originatorSourceReferenceSchema>;

export function assertOriginatorSourceVersions(sources: readonly OriginatorSourceReference[]) {
  const versions = new Map<string, {documentId: string; sha256: string}>();
  for (const s of sources) {
    const held = versions.get(s.sourceVersionId);
    if (held && (held.documentId !== s.documentId || held.sha256 !== s.sha256)) throw new Error("originator_source_version_identity_conflict");
    versions.set(s.sourceVersionId, {documentId: s.documentId, sha256: s.sha256});
  }
}

/** Keeps complete numeric tokens apart: 1 is not evidence for 1.000, and 0.1 is not 0.15. */
export function originatorLiteralInQuote(literal: string, quote: string): boolean {
  const compact = literal.replace(/\s/g, "");
  if (!compact) return false;
  const special = /[%x×$€()\-]/i;
  const escaped = [...compact].map((character, i) => {
    const gap = i > 0 && (special.test(character) || special.test(compact[i - 1]!)) ? "\\s*" : "";
    return gap + character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
  return new RegExp(`(?<![0-9])(?<![0-9][.,])${escaped}(?![0-9]|[.,][0-9])`).test(quote.replace(/\u00a0/g, " "));
}

export const originatorNumericContextSchema = z.strictObject({
  id: originatorEvidenceKey, sourceId: originatorEvidenceKey,
  unit: z.enum(["currency", "ratio", "multiple", "count"]),
  notation: z.enum(["brazilian_document", "decimal_notation"]),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(), declaredScale: z.string().trim().min(1).max(40).nullable(),
  representation: z.enum(["reported_in_declared_scale", "already_in_currency_units"]).nullable(),
  ratioConvention: z.enum(["percent", "fraction"]).nullable(),
});
export const originatorSourceNumberSchema = z.strictObject({literal: z.string().trim().min(1).max(200), sourceId: originatorEvidenceKey, contextId: originatorEvidenceKey});

/** Shared source decoder. Every consumer keeps the same quote, version, unit and scale guards. */
export function createOriginatorNumericReader(input: {sources: z.infer<typeof originatorSourceReferenceSchema>[]; contexts: z.infer<typeof originatorNumericContextSchema>[]; analysisDate: string; currency: string}) {
  assertOriginatorSourceVersions(input.sources);
  const sources = new Map(input.sources.map(s => [s.id, s])), contexts = new Map(input.contexts.map(c => [c.id, c]));
  if (sources.size !== input.sources.length || contexts.size !== input.contexts.length) throw new Error("originator_credit_source_identity_conflict");
  const gaps: Array<{operand: string; reason: string}> = [], readings: Array<{operand: string; value: string; unit: z.infer<typeof originatorNumericContextSchema>["unit"]; sourceId: string; contextId: string}> = [];
  const traces: ReturnType<typeof normalizeOriginatorNumber>["trace"][] = [];
  const addGap = (operand: string, reason: string) => gaps.push({operand, reason});
  function read(n: z.infer<typeof originatorSourceNumberSchema>, operand: string, expectedUnit: z.infer<typeof originatorNumericContextSchema>["unit"]): string | null {
    const source = sources.get(n.sourceId), context = contexts.get(n.contextId);
    if (!source || !context) {addGap(operand, "numeric_source_or_context_missing"); return null;}
    const declaration = sources.get(context.sourceId);
    if (!declaration || declaration.documentId !== source.documentId || declaration.sourceVersionId !== source.sourceVersionId || declaration.sha256 !== source.sha256) {addGap(operand, "numeric_context_from_another_source"); return null;}
    if (source.consultedAt > input.analysisDate || declaration.consultedAt > input.analysisDate) {addGap(operand, "numeric_source_after_analysis"); return null;}
    if (context.unit !== expectedUnit || (expectedUnit === "currency" && context.currency !== input.currency)) {addGap(operand, "numeric_unit_or_currency_conflict"); return null;}
    if (!originatorLiteralInQuote(n.literal, source.quote)) {addGap(operand, "numeric_literal_not_in_quote"); return null;}
    try {
      const parsed = normalizeOriginatorNumber({literal: n.literal, notation: context.notation, unit: context.unit, currency: context.currency, declaredScale: context.declaredScale, representation: context.representation, ratioConvention: context.ratioConvention});
      readings.push({operand, value: parsed.value, unit: expectedUnit, sourceId: n.sourceId, contextId: context.id});
      traces.push({...parsed.trace, operands: {...parsed.trace.operands, sourceId: n.sourceId, anchor: source.anchor, sha256: source.sha256, contextId: context.id}});
      return parsed.value;
    } catch (error) {addGap(operand, error instanceof Error && /^originator_[a-z_]+$/.test(error.message) ? error.message : "numeric_literal_unresolved"); return null;}
  }
  return {sources, contexts, gaps, readings, traces, addGap, read};
}
