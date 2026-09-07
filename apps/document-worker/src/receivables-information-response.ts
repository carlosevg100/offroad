import Decimal from "decimal.js";
import {z} from "zod";

import {
  applyReceivablesSupplementPatch,
  compileReceivablesSupplementDraft,
  newReceivablesSupplementDraft,
  receivablesSupplementDraftSchema,
  receivablesSupplementPatchSchema,
  type ReceivablesSupplementDraft,
  type ReceivablesSupplementPatch,
} from "@offroad/receivables-analysis";

import {receivablesInformationRequestBindingSchema} from "./receivables-information-requests";

export const governedReceivablesAnswerSchema = z.object({
  id: z.uuid(),
  requirementKey: z.string().min(1),
  question: z.string().min(1),
  answerKind: z.enum(["text", "number", "date", "choice", "document", "confirmation"]),
  answerSource: z.enum(["choice", "custom", "unavailable"]),
  sourceNamespace: z.string(),
  answeredAt: z.string().datetime({offset: true}),
  answeredBy: z.string().min(1),
  producerBinding: receivablesInformationRequestBindingSchema.nullable(),
}).strict();

function normalizedDecimal(content: string, suffix?: string): Decimal {
  let normalized = content.trim().toLowerCase().replace(",", ".");
  if (suffix && normalized.endsWith(suffix)) normalized = normalized.slice(0, -suffix.length).trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error("receivables_information_response_number_invalid");
  return new Decimal(normalized);
}

function parseValue(answer: z.infer<typeof governedReceivablesAnswerSchema>, content: string): unknown {
  const binding = receivablesInformationRequestBindingSchema.parse(answer.producerBinding);
  if (binding.valueKind === "boolean" || binding.valueKind === "enum") {
    const option = binding.options.find((candidate) => candidate.label === content.trim());
    if (!option) throw new Error("receivables_information_response_choice_invalid");
    return option.value;
  }
  if (binding.valueKind === "string_list") {
    const normalized = content.trim();
    if (/^(todos|all)$/i.test(normalized)) return [];
    const values = [...new Set(normalized.split(/[;,]/).map((value) => value.trim()).filter(Boolean))];
    if (values.length === 0 || values.length > 100) throw new Error("receivables_information_response_list_invalid");
    return values;
  }

  const numeric = normalizedDecimal(content, binding.valueKind === "percentage" ? "%" : binding.valueKind === "multiple" ? "x" : undefined);
  if (binding.minimum !== null && numeric.lessThan(binding.minimum)) throw new Error("receivables_information_response_range_invalid");
  if (binding.maximum !== null && numeric.greaterThan(binding.maximum)) throw new Error("receivables_information_response_range_invalid");
  if (binding.valueKind === "integer") {
    if (!numeric.isInteger() || numeric.greaterThan(Number.MAX_SAFE_INTEGER)) throw new Error("receivables_information_response_integer_invalid");
    return numeric.toNumber();
  }
  if (binding.valueKind === "percentage") return numeric.dividedBy(100).toFixed();
  return numeric.toFixed();
}

function currentDraft(value: unknown, sourceDatasetHash: string): ReceivablesSupplementDraft {
  if (!value) return newReceivablesSupplementDraft(sourceDatasetHash);
  const wrapped = z.object({draft: receivablesSupplementDraftSchema}).safeParse(value);
  return wrapped.success ? wrapped.data.draft : receivablesSupplementDraftSchema.parse(value);
}

/** Converts only an explicitly bound, validated answer into one immutable field patch. No model
 * participates in field selection, units, normalization, dataset selection or lineage. */
export function applyGovernedReceivablesInformationResponse(input: {
  answeredRequest: unknown;
  content: string;
  messageId: string;
  currentDraft?: unknown | null;
}) {
  const answer = governedReceivablesAnswerSchema.parse(input.answeredRequest);
  if (answer.sourceNamespace !== "receivables_method_r01_fields") return null;
  if (answer.answerSource === "unavailable") return null;
  const binding = receivablesInformationRequestBindingSchema.parse(answer.producerBinding);
  const value = parseValue(answer, input.content);
  const evidence = [{
    sourceClass: "user_confirmation" as const,
    sourceId: input.messageId,
    anchor: `information_request:${answer.id}`,
  }];
  const evidenceKey = binding.fieldPath.startsWith("/policy/") ? "eligibilityPolicy" : "facilityAndWaterfall";
  const patch: ReceivablesSupplementPatch = receivablesSupplementPatchSchema.parse({
    schemaVersion: "2026.09.07-v1",
    patchId: `information-response:${input.messageId}`,
    sourceDatasetHash: binding.sourceDatasetHash,
    suppliedBy: {actorType: "user", actorId: answer.answeredBy, suppliedAt: answer.answeredAt, evidence},
    sections: {},
    fields: [{path: binding.fieldPath, value}],
    evidence: {[evidenceKey]: evidence},
  });
  const nextDraft = applyReceivablesSupplementPatch({
    draft: currentDraft(input.currentDraft, binding.sourceDatasetHash),
    patch,
  });
  return {
    patch,
    nextDraft,
    status: compileReceivablesSupplementDraft(nextDraft),
    fieldPath: binding.fieldPath,
    canonicalValue: value,
  };
}
