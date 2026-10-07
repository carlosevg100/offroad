import {createHash} from "node:crypto";
import {z} from "zod";
import {calculateRelativeDebtCostBridge, calculateDebtCostAction, financialCoreVersion,
  relativeDebtCostBridgeInputSchema, debtCostActionInputSchema} from "@offroad/financial-core";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedDebtLiquidityInputSchema, adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {resolveAdoptedCurrencyValues} from "./adopted-numeric-representation";
import {hasUnitScale} from "./adopted-input-scale";

const shape = adoptedDebtLiquidityInputSchema.shape;
const adjustmentTerms = z.strictObject({bps: selection, family: selection, evidenceAnchor: selection,
  methodologyVersion: selection, independentEffectGroup: selection});
const actionTerms = z.strictObject({convention: selection, currentSpreadBps: selection, proposedSpreadBps: selection,
  starts: selection, ends: selection, affectedPrincipal: selection, yearFractions: selection, timeBases: selection,
  annualIndices: selection, exposureAnchors: selection, costDates: selection, costAmounts: selection,
  costAnchors: selection, costCoverage: selection});
export const adoptedRelativeDebtCostInputSchema = z.strictObject({
  envelope: shape.envelope, scope: shape.scope, entityId: shape.entityId, peerEntityId: z.uuid(),
  perimeter: shape.perimeter, peerPerimeter: shape.perimeter, currency: shape.currency, scenario: shape.scenario,
  openingDate: shape.openingDate, endDate: shape.endDate, asOfDate: z.iso.date(), comparisonId: z.uuid(), numericInterpretations: shape.numericInterpretations,
  own: z.strictObject({spreadBps: selection, indexer: selection, pricingDate: selection}),
  peer: z.strictObject({spreadBps: selection, indexer: selection, pricingDate: selection}),
  pricingBasis: selection, curveVersion: selection, coverage: selection,
  adjustments: z.array(z.strictObject({id: z.uuid(), terms: adjustmentTerms})).max(32),
  actions: z.array(z.strictObject({id: z.uuid(), terms: actionTerms})).max(16),
}).refine(i => i.endDate > i.openingDate && i.entityId !== i.peerEntityId && i.asOfDate >= i.openingDate && i.asOfDate <= i.endDate, "Distinct entities and valid horizon/as-of date required")
  .refine(i => new Set(i.adjustments.map(a => a.id)).size === i.adjustments.length && new Set(i.actions.map(a => a.id)).size === i.actions.length, "Duplicate adjustment or action");
export type AdoptedRelativeDebtCostInput = z.infer<typeof adoptedRelativeDebtCostInputSchema>;
const decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const text = z.string().trim().min(1).max(160);

/** Immutable selected contributions only. A digest is integrity, not authority: the SQL
 * loader must authorize both entities, every source and the current basis before this call.
 * Adopted market adjustments remain estimates, never causal credit/rating conclusions. */
export function calculateAdoptedRelativeDebtCost(raw: unknown) {
  const input = adoptedRelativeDebtCostInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = new Map(basis.entries.map(e => [e.decisionId, e]));
  const used = new Map<string, AdoptionBasisEntry>(); const observations = new Set<string>();
  const gaps: {operand: string; reason: string}[] = [];
  const bindings: {operand: string; decisionId: string | null; interpretationDecisionIds: string[]}[] = [];
  // An explicitly adopted empty cost ledger has no numeric cells to normalize. Its
  // identity, unit scale and full context are still checked by read, never inferred.
  const monetaryIds = input.actions.flatMap(a => [a.terms.affectedPrincipal, a.terms.costAmounts]).flatMap(s => {
    const e = s.decisionId ? entries.get(s.decisionId) : undefined;
    return s.decisionId && !(e?.value.type === "list" && e.value.value.length === 0 && hasUnitScale(e.dimensions.scale)) ? [s.decisionId] : [];
  });
  if (new Set(monetaryIds).size !== monetaryIds.length) throw new Error("relative_cost_reused_contribution");
  const normalization = monetaryIds.length ? resolveAdoptedCurrencyValues({envelope: input.envelope, scope: input.scope, decisionIds: monetaryIds, groups: input.numericInterpretations}) : null;
  const normalized = new Map(normalization?.values.map(v => [v.decisionId, v]) ?? []);
  const prefix = `relative_cost.${input.comparisonId}.`;
  function read<T>(s: z.infer<typeof selection>, name: string, unit: string, type: "number" | "text" | "date" | "list", schema: z.ZodType<T>, peer = false): T | null {
    const path = prefix + name; const numeric = s.decisionId ? normalized.get(s.decisionId) : undefined;
    bindings.push({operand: path, decisionId: s.decisionId, interpretationDecisionIds: numeric?.interpretationDecisionIds ?? []});
    if (!s.decisionId) {gaps.push({operand: path, reason: s.missingReason!}); return null;}
    const e = entries.get(s.decisionId); const d = e?.dimensions;
    if (!e || used.has(e.decisionId) || (e.observationId && observations.has(e.observationId))) throw new Error("relative_cost_missing_or_reused_contribution");
    if (e.fieldPath !== path || e.value.type !== type || e.definitionKind !== s.definitionKind || d!.definitionVersionId !== s.definitionVersionId
      || d!.entityId !== (peer ? input.peerEntityId : input.entityId) || d!.perimeter !== (peer ? input.peerPerimeter : input.perimeter)
      || d!.currency !== input.currency || d!.scenario !== input.scenario || d!.unit !== unit || d!.periodStart !== input.openingDate
      || d!.periodEnd !== input.endDate || (unit !== "currency" && !hasUnitScale(d!.scale))) throw new Error("relative_cost_basis_context_mismatch");
    used.set(e.decisionId, e); if (e.observationId) observations.add(e.observationId);
    if (unit === "currency") {
      if (e.value.type === "list" && e.value.value.length === 0 && hasUnitScale(d!.scale)) return schema.parse([]);
      if (!numeric?.trace) {gaps.push({operand: path, reason: "Numeric representation has not been adopted"}); return null;}
      numeric.interpretationDecisionIds.forEach(id => used.set(id, entries.get(id)!));
      return schema.parse(numeric.trace.values);
    }
    return schema.parse(e.value.value);
  }
  const party = (key: "own" | "peer") => ({
    spreadBps: read(input[key].spreadBps, `${key}.spreadBps`, "basis_points", "number", decimal, key === "peer"),
    indexer: read(input[key].indexer, `${key}.indexer`, "convention", "text", text, key === "peer"),
    pricingDate: read(input[key].pricingDate, `${key}.pricingDate`, "date", "date", z.iso.date(), key === "peer"),
  });
  const own = party("own"), peer = party("peer");
  for (const [name, p] of [["own", own], ["peer", peer]] as const) if (p.pricingDate && p.pricingDate > input.asOfDate)
    throw new Error(`relative_cost_${name}_future_price`);
  const pricingBasis = read(input.pricingBasis, "pricingBasis", "convention", "text", relativeDebtCostBridgeInputSchema.shape.pricingBasis);
  const curveVersion = read(input.curveVersion, "curveVersion", "reference_id", "text", text);
  const coverage = read(input.coverage, "coverage", "convention", "text", relativeDebtCostBridgeInputSchema.shape.coverage);
  const adjustments = input.adjustments.flatMap(a => {
    const start = gaps.length;
    const bps = read(a.terms.bps, `adjustment.${a.id}.bps`, "basis_points", "number", decimal);
    const family = read(a.terms.family, `adjustment.${a.id}.family`, "convention", "text", relativeDebtCostBridgeInputSchema.shape.adjustments.element.shape.family);
    const evidenceAnchor = read(a.terms.evidenceAnchor, `adjustment.${a.id}.evidenceAnchor`, "reference_id", "text", text);
    const methodologyVersion = read(a.terms.methodologyVersion, `adjustment.${a.id}.methodologyVersion`, "reference_id", "text", text);
    const independentEffectGroup = read(a.terms.independentEffectGroup, `adjustment.${a.id}.independentEffectGroup`, "reference_id", "text", text);
    return gaps.length === start && bps !== null && family && evidenceAnchor && methodologyVersion && independentEffectGroup
      ? [{id: a.id, bps, family, evidenceAnchor, methodologyVersion, independentEffectGroup}] : [];
  });
  if (own.pricingDate && peer.pricingDate && own.pricingDate !== peer.pricingDate
    && coverage === "complete_scoped_bridge" && !adjustments.some(a => a.family === "pricing_date"))
    gaps.push({operand: prefix + "adjustments.pricing_date", reason: "Different pricing dates need an evidenced date adjustment, including an explicitly evidenced zero when appropriate"});
  const bridgeGaps = gaps.length;
  const actionResults = input.actions.map(a => {
    const start = gaps.length; const path = `action.${a.id}.`;
    const scalar = <T>(key: keyof typeof a.terms, unit: string, schema: z.ZodType<T>, type: "number" | "text" = "text") => read(a.terms[key], path + key, unit, type, schema);
    const series = <T>(key: keyof typeof a.terms, unit: string, schema: z.ZodType<T>) => read(a.terms[key], path + key, unit, "list", z.array(schema).max(480));
    const convention = scalar("convention", "convention", debtCostActionInputSchema.shape.convention);
    const currentSpreadBps = scalar("currentSpreadBps", "basis_points", decimal, "number");
    const proposedSpreadBps = scalar("proposedSpreadBps", "basis_points", decimal, "number");
    const starts = series("starts", "date", z.iso.date()), ends = series("ends", "date", z.iso.date());
    const principals = series("affectedPrincipal", "currency", decimal), fractions = series("yearFractions", "ratio", decimal);
    const bases = series("timeBases", "convention", z.enum(["actual_365_fixed", "adopted_month_fraction"]));
    const indices = series("annualIndices", "ratio", z.union([decimal, z.literal("not_applicable")]));
    const anchors = series("exposureAnchors", "reference_id", text);
    const dates = series("costDates", "date", z.iso.date()), amounts = series("costAmounts", "currency", decimal), costAnchors = series("costAnchors", "reference_id", text);
    const costCoverage = scalar("costCoverage", "convention", debtCostActionInputSchema.shape.costCoverage);
    let result: ReturnType<typeof calculateDebtCostAction> | null = null;
    if (gaps.length === start && convention && currentSpreadBps !== null && proposedSpreadBps !== null && starts && ends && principals && fractions && bases && indices && anchors && dates && amounts && costAnchors && costCoverage) {
      if ([ends, principals, fractions, bases, indices, anchors].some(s => s.length !== starts.length) || amounts.length !== dates.length || costAnchors.length !== dates.length)
        throw new Error("relative_cost_action_series_mismatch");
      if (!starts.length || starts[0]! < input.openingDate || ends.at(-1)! > input.endDate) throw new Error("relative_cost_action_horizon_mismatch");
      result = calculateDebtCostAction({actionId: a.id, currency: input.currency, convention, currentSpreadBps, proposedSpreadBps,
        exposure: starts.map((startDate, n) => ({id: `${a.id}:${n}`, startDate, endDate: ends[n]!, affectedPrincipal: principals[n]!, yearFraction: fractions[n]!,
          timeBasis: bases[n]!, annualIndex: indices[n] === "not_applicable" ? null : indices[n]!, evidenceAnchor: anchors[n]!})),
        costs: dates.map((date, n) => ({id: `${a.id}:cost:${n}`, date, amount: amounts[n]!, evidenceAnchor: costAnchors[n]!})), costCoverage});
      if (result.status === "missing_costs") gaps.push({operand: prefix + path + "costCoverage", reason: "Known costs do not cover the stated benefit horizon"});
    }
    return {actionId: a.id, result};
  });
  let bridge: ReturnType<typeof calculateRelativeDebtCostBridge> | null = null;
  if (!bridgeGaps && own.spreadBps !== null && peer.spreadBps !== null && own.indexer && peer.indexer && pricingBasis && curveVersion && coverage) {
    if (pricingBasis === "same_indexer_quoted_spread" && curveVersion !== "not_applicable") throw new Error("relative_cost_spurious_curve");
    bridge = calculateRelativeDebtCostBridge({ownSpreadBps: own.spreadBps, peerSpreadBps: peer.spreadBps, ownIndexer: own.indexer, peerIndexer: peer.indexer,
      pricingBasis, curveVersion: curveVersion === "not_applicable" ? null : curveVersion, coverage, adjustments});
  }
  const payload = {schemaVersion: "adopted-relative-debt-cost.v1" as const, financialCoreVersion, scope: input.scope,
    comparisonId: input.comparisonId, entityId: input.entityId, peerEntityId: input.peerEntityId, currency: input.currency, asOfDate: input.asOfDate,
    basisFingerprint: input.envelope.fingerprint, own, peer, bridge, actions: actionResults, gaps, bindings, normalization,
    contributions: [...used.values()], derivedDependencies: [{result: "bridge_and_action_estimates", decisionIds: [...used.keys()]}],
    status: gaps.length ? "missing_inputs" as const : "partial_composition" as const,
    classification: [...used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: ["causal_credit_attribution", "official_rating", "qualitative_credit_lens", "guaranteed_repricing", "publication_or_contact"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
