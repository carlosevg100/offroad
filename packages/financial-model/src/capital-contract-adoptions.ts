import {createHash} from "node:crypto";
import {z} from "zod";
import {checkIdentity} from "@offroad/financial-core";
import {adoptedDefinedRatioInputSchema, calculateAdoptedDefinedRatio} from "./adopted-defined-ratio";
import {capitalContractPreparationInputSchema, prepareCapitalContractEvidence} from "./capital-contract-preparation";
const field = z.enum(["numerator", "denominator", "limit"]);
const hash = z.string().regex(/^[a-f0-9]{64}$/); const key = z.string().min(1).max(300);
export const capitalContractAdoptionsInputSchema = z.strictObject({
  preparation: capitalContractPreparationInputSchema, ratio: adoptedDefinedRatioInputSchema, instrumentId: key,
  definitions: z.array(z.strictObject({field, versionId: z.uuid(), kind: z.literal("contractual"), definition: z.string().min(1).max(20000),
    contractSourceVersionId: z.uuid(), contractAnchor: z.strictObject({clause: key, page: z.number().int().positive()})})).max(3),
  /** Immutable observation/derivation receipts from authorized readers, not user claims of access. */
  origins: z.array(z.strictObject({field, decisionId: z.uuid(), observationId: z.uuid(), sourceVersionId: z.uuid(),
    calculationFingerprint: hash, instrumentId: key, sourceVersionIds: z.array(z.uuid()).min(1), observationIds: z.array(z.uuid()).min(1)})).max(3),
}).superRefine((i, c) => {
  for (const entries of [i.definitions, i.origins]) if (new Set(entries.map(e => e.field)).size !== entries.length) c.addIssue({code: "custom", message: "Duplicate contract binding"});
});

const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
export const capitalContractAdoptionsOutputSchema = z.strictObject({
  schemaVersion: z.literal("capital-contract-adoption-alignment.v1"), preparationFingerprint: hash,
  ratioFingerprint: hash, basisFingerprint: hash, scope: adoptedDefinedRatioInputSchema.shape.scope, instrumentId: key,
  alignment: z.array(z.strictObject({operand: field, selectedDecisionId: z.uuid().nullable(), selectedObservationId: z.uuid().nullable(),
    calculated: decimal.nullable(), selected: decimal.nullable(), numericMatch: z.boolean(), definitionBindingsMatch: z.boolean(),
    originBindingsMatch: z.boolean(), reasons: z.array(key)})), directionMatches: z.boolean(),
  definitions: capitalContractAdoptionsInputSchema.shape.definitions, origins: capitalContractAdoptionsInputSchema.shape.origins,
  status: z.enum(["aligned", "divergent", "unresolved"]), sourceVersionIds: z.array(z.uuid()),
  requiresLiveRightsCheck: z.literal(true), sourceReviewRequired: z.literal(true), pendingReviews: z.array(key),
  mutatesWorkingBasis: z.literal(false), certifiesContractualCompliance: z.literal(false), grantsExecution: z.literal(false), fingerprint: hash,
});

/** Links proposed calculation to already-selected contributions. It never adopts, overwrites,
 * reads customer data or authorizes a receipt. The execution reader must retrieve the immutable
 * definitions, observations and derivation edges under current access/source rights. */
export function reconcileCapitalContractAdoptions(raw: unknown) {
  const input = capitalContractAdoptionsInputSchema.parse(raw);
  const preparation = prepareCapitalContractEvidence((raw as z.input<typeof capitalContractAdoptionsInputSchema>).preparation);
  const ratio = calculateAdoptedDefinedRatio(input.ratio);
  const p = preparation.scope; const r = ratio;
  if (r.definitionKind !== "contractual" || p.workId !== r.scope.workId || p.purpose !== r.scope.purpose || p.entityId !== r.entityId
    || p.perimeter !== r.perimeter || p.currency !== r.currency || p.scenario !== r.scenario || p.asOf !== r.measurementDate) throw new Error("capital_contract_adoption_context_mismatch");
  const end = new Date(`${r.measurementDate}T00:00:00Z`); const year = end.getUTCFullYear() - 1; const month = end.getUTCMonth();
  const previous = new Date(Date.UTC(year, month, Math.min(end.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));
  previous.setUTCDate(previous.getUTCDate() + 1);
  if (input.ratio.numerator.periodStart !== null || input.ratio.denominator.periodStart !== previous.toISOString().slice(0, 10)) throw new Error("capital_contract_ratio_period_mismatch");
  const covenant = preparation.covenants?.covenants.find(c => c.instrument === input.instrumentId);
  if (!covenant) throw new Error("capital_contract_adoption_instrument_missing");
  const values = {numerator: covenant.netDebtByDefinition?.value ?? null,
    denominator: covenant.index?.ebitda?.basis === "opened" ? covenant.index.ebitda.value : null,
    limit: covenant.limitState === "resolved" ? covenant.applicableLimit : null};
  const sourceVersion = (document: string) => input.preparation.sources.find(s => s.document === document)?.sourceVersionId;
  const sameSet = (a: string[], b: string[]) => new Set(a).size === a.length && [...a].sort().join("|") === [...b].sort().join("|");
  const alignment = (["numerator", "denominator", "limit"] as const).map(operand => {
    const binding = ratio.bindings.find(b => b.operand === operand)!;
    const entry = ratio.contributions.find(e => e.decisionId === binding.decisionId);
    const normalized = operand !== "limit" ? ratio.normalization?.values.find(v => v.decisionId === entry?.decisionId)?.trace?.values[0] : null;
    const selected = ratio.calculation?.operands[operand] ?? normalized ?? (operand === "limit" && entry?.value.type === "number" ? entry.value.value : null);
    const calculated = values[operand]; const definition = input.definitions.find(d => d.field === operand);
    const origin = input.origins.find(o => o.field === operand);
    const reasons: string[] = [];
    if (calculated === null || selected === null) reasons.push("calculation_or_selected_operand_missing");
    let definitionBindingsMatch = false;
    if (definition) {
      const anchors = operand === "numerator" ? [covenant.definitions?.anchors.netDebt] : operand === "denominator"
        ? [covenant.definitions?.anchors.ebitda] : covenant.tiers.filter(t => t.state === "applies" && covenant.applicableLimit !== null && checkIdentity({id: "tier", left: t.limit, right: covenant.applicableLimit, absoluteTolerance: "0"}).status === "pass").map(t => t.anchor);
      if (definition.versionId !== binding.definitionVersionId || !anchors.some(a => a && a.clause === definition.contractAnchor.clause
        && a.page === definition.contractAnchor.page && sourceVersion(a.document) === definition.contractSourceVersionId)) throw new Error("capital_contract_definition_binding_mismatch");
      const expectedText = operand === "numerator" ? covenant.definitions?.netDebt : operand === "denominator" ? covenant.definitions?.ebitda : null;
      if (expectedText && definition.definition !== expectedText) throw new Error("capital_contract_definition_text_mismatch");
      definitionBindingsMatch = true;
    } else reasons.push("definition_record_required");
    let originBindingsMatch = false;
    if (origin) {
      if (!entry || origin.decisionId !== entry.decisionId || origin.observationId !== entry.observationId
        || origin.calculationFingerprint !== preparation.fingerprint || origin.instrumentId !== input.instrumentId
        || preparation.sourceVersionIds.includes(origin.sourceVersionId)
        || !sameSet(origin.sourceVersionIds, preparation.sourceVersionIds) || !sameSet(origin.observationIds, preparation.observationIds)) throw new Error("capital_contract_derivation_binding_mismatch");
      originBindingsMatch = entry.kind === "observation";
    }
    if (!originBindingsMatch) reasons.push(entry?.kind === "hypothesis" ? "explicit_hypothesis_not_calculation_adoption" : "derived_observation_receipt_required");
    const identity = calculated !== null && selected !== null ? checkIdentity({id: operand, left: calculated, right: selected, absoluteTolerance: "0"}) : null;
    if (identity?.status === "fail") reasons.push("selected_value_differs_from_calculation");
    return {operand, selectedDecisionId: entry?.decisionId ?? null, selectedObservationId: entry?.observationId ?? null,
      calculated, selected, numericMatch: identity?.status === "pass", definitionBindingsMatch, originBindingsMatch, reasons};
  });
  const directionMatches = covenant.direction === "maximum" ? ["lt", "lte"].includes(ratio.calculation?.operands.comparator ?? "") : covenant.direction === "minimum" ? ["gt", "gte"].includes(ratio.calculation?.operands.comparator ?? "") : false;
  const payload = {schemaVersion: "capital-contract-adoption-alignment.v1" as const, preparationFingerprint: preparation.fingerprint,
    ratioFingerprint: ratio.fingerprint, basisFingerprint: ratio.basisFingerprint, scope: ratio.scope, instrumentId: input.instrumentId,
    alignment, directionMatches, definitions: input.definitions, origins: input.origins,
    status: alignment.some(a => a.reasons.includes("selected_value_differs_from_calculation")) ? "divergent" as const
      : alignment.every(a => !a.reasons.length) && directionMatches ? "aligned" as const : "unresolved" as const,
    sourceVersionIds: [...new Set([...preparation.sourceVersionIds, ...input.origins.map(o => o.sourceVersionId)])],
    requiresLiveRightsCheck: true as const, sourceReviewRequired: true as const,
    pendingReviews: ["contractual_rounding", "measurement_applicability", "waiver_cure_and_legal_effects"] as const,
    mutatesWorkingBasis: false as const, certifiesContractualCompliance: false as const, grantsExecution: false as const};
  return capitalContractAdoptionsOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
