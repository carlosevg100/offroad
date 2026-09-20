import {createHash} from "node:crypto";
import {z} from "zod";
import {adoptedCapitalPeriodCashInputSchema, calculateAdoptedCapitalPeriodCash} from "./adopted-capital-period-cash";
const key = z.string().trim().min(1).max(160); const text = z.string().trim().min(1).max(2000);
const alternative = z.strictObject({id: key, label: text, kind: z.enum(["maintain", "change", "defer", "no_financing"]),
  projection: adoptedCapitalPeriodCashInputSchema,
  rationale: text, conditions: z.array(text).max(50), disconfirmers: z.array(text).min(1).max(30)});
export const capitalDecisionCompositionInputSchema = z.strictObject({
  workId: z.uuid(), purpose: z.string().min(3).max(300), question: text, objectives: z.array(text).min(1).max(30),
  alternatives: z.array(alternative).max(20),
  maintenanceExclusion: z.strictObject({reason: text, basisDecisionIds: z.array(z.uuid()).max(256)}).nullable(),
  sensitivities: z.array(z.strictObject({id: key, baseAlternativeId: key, label: text,
    rationale: text, projection: adoptedCapitalPeriodCashInputSchema})).max(40),
  recommendation: z.strictObject({alternativeId: key, rationale: text, basisDecisionIds: z.array(z.uuid()).min(1).max(256),
    conditions: z.array(text).max(50), wouldChangeIf: z.array(text).min(1).max(30)}).nullable(),
}).superRefine((i, c) => {
  const fail = (message: string) => c.addIssue({code: "custom", message});
  if (new Set(i.alternatives.map(a => a.id)).size !== i.alternatives.length || new Set(i.sensitivities.map(s => s.id)).size !== i.sensitivities.length) fail("Duplicate alternative or sensitivity");
  if (i.alternatives.filter(a => a.kind === "maintain").length > 1 || (i.maintenanceExclusion && i.alternatives.some(a => a.kind === "maintain"))) fail("Ambiguous current structure");
  if (i.sensitivities.some(s => !i.alternatives.some(a => a.id === s.baseAlternativeId))) fail("Unknown sensitivity baseline");
  if (i.recommendation && !i.alternatives.some(a => a.id === i.recommendation!.alternativeId)) fail("Unknown recommended alternative");
});
export type CapitalDecisionCompositionInput = z.infer<typeof capitalDecisionCompositionInputSchema>;

function openingReferences(p: z.infer<typeof adoptedCapitalPeriodCashInputSchema>) {
  const funding = p.funding.kind === "debt" ? p.funding.input : p.funding;
  return {available: funding.openingAvailable.decisionId, restricted: funding.openingRestricted.decisionId,
    workingCapital: Object.fromEntries(Object.entries(p.operating.openingWorkingCapital).map(([key, value]) => [key, value.decisionId]))};
}
function openingDebt(p: ReturnType<typeof calculateAdoptedCapitalPeriodCash>) {
  return p.funding?.financing?.operands.debt.instruments.filter(i => i.openingPrincipal !== "0")
    .map(i => ({id: i.instrumentId, principal: i.openingPrincipal,
      decisionId: p.funding!.bindings.find(b => b.operand === `debt.${i.instrumentId}.openingPrincipal`)?.decisionId ?? null})).sort((a, b) => a.id.localeCompare(b.id)) ?? [];
}
function changedContributions(before: ReturnType<typeof calculateAdoptedCapitalPeriodCash>, after: ReturnType<typeof calculateAdoptedCapitalPeriodCash>) {
  const slot = (e: typeof before.contributions[number]) => JSON.stringify([e.fieldPath, e.dimensions.periodStart, e.dimensions.periodEnd, e.dimensions.unit, e.definitionKind]);
  const old = new Map(before.contributions.map(e => [slot(e), e]));
  const current = new Map(after.contributions.map(e => [slot(e), e]));
  const keys = [...new Set([...old.keys(), ...current.keys()])].sort();
  return keys.flatMap(key => {
    const a = old.get(key); const b = current.get(key);
    const value = (e: NonNullable<typeof a>) => JSON.stringify([e.value, e.dimensions.scale, e.dimensions.definitionVersionId]);
    if (a && b && value(a) === value(b)) return [];
    return [{fieldPath: b?.fieldPath ?? a!.fieldPath, beforeDecisionId: a?.decisionId ?? null, afterDecisionId: b?.decisionId ?? null,
      before: a ? {value: a.value, dimensions: a.dimensions} : null, after: b ? {value: b.value, dimensions: b.dimensions} : null}];
  });
}

/** Decision-domain composition, never a ranking, market-availability check or publication.
 * Recomputes each full variant. Human judgments remain proposals and retain their evidence.
 * Zero alternatives returns useful framing requirements without requiring a company/intake. */
export function composeCapitalStructureDecision(raw: unknown) {
  const input = capitalDecisionCompositionInputSchema.parse(raw);
  const gaps: {subjectId: string | null; code: string; reason: string}[] = [];
  const gap = (code: string, reason: string, subjectId: string | null = null) => gaps.push({subjectId, code, reason});
  if (input.alternatives.length < 2) gap("alternatives_required", "Specify at least two alternatives before a numerical comparison");
  if (!input.alternatives.some(a => a.kind === "maintain") && !input.maintenanceExclusion) gap("current_structure_required", "Include the current structure or explain its exclusion");
  const scenarios = new Set<string>();
  function calculate(id: string, projection: z.infer<typeof adoptedCapitalPeriodCashInputSchema>) {
    if (projection.operating.scope.workId !== input.workId || projection.operating.scope.purpose !== input.purpose) throw new Error("capital_decision_work_scope_mismatch");
    if (scenarios.has(projection.operating.scenario)) throw new Error("capital_decision_scenario_reused");
    scenarios.add(projection.operating.scenario);
    const result = calculateAdoptedCapitalPeriodCash(projection);
    for (const g of result.gaps) gap("projection_input_missing", `${g.operand}: ${g.reason}`, id);
    if (result.cash?.status !== "calculated") gap("projection_incomplete", "A complete comparable projection has not been calculated", id);
    return result;
  }
  const alternatives = input.alternatives.map(a => ({...a, projection: calculate(a.id, a.projection)}));
  const baseline = alternatives[0];
  function assertComparable(p: z.infer<typeof adoptedCapitalPeriodCashInputSchema>, r: ReturnType<typeof calculateAdoptedCapitalPeriodCash>) {
    if (!baseline) return;
    const b = baseline.projection;
    for (const field of ["entityId", "perimeter", "currency", "openingDate", "endDate", "openingScenario", "basisFingerprint"] as const) if (r[field] !== b[field]) throw new Error("capital_decision_common_basis_required");
    if (JSON.stringify(openingReferences(p)) !== JSON.stringify(openingReferences(input.alternatives[0]!.projection))) throw new Error("capital_decision_common_opening_adoptions_required");
    if (r.cash && b.cash) {
      if (JSON.stringify(openingDebt(r)) !== JSON.stringify(openingDebt(b))) throw new Error("capital_decision_common_opening_debt_required");
      const periods = (v: typeof r) => v.operation.projection?.rows.map(row => [row.startDate, row.endDate]);
      if (JSON.stringify(periods(r)) !== JSON.stringify(periods(b))) throw new Error("capital_decision_common_periods_required");
    }
  }
  alternatives.forEach((a, n) => assertComparable(input.alternatives[n]!.projection, a.projection));
  const sensitivities = input.sensitivities.map(s => {
    const result = calculate(s.id, s.projection); assertComparable(s.projection, result);
    const base = alternatives.find(a => a.id === s.baseAlternativeId)!;
    const changes = changedContributions(base.projection, result);
    if (!changes.length) gap("sensitivity_has_no_changed_operands", "The declared scenario does not change a selected operand", s.id);
    return {...s, projection: result, changedContributions: changes, baselineSummary: base.projection.cash?.summary ?? null};
  });
  const contributions = new Map([...alternatives, ...sensitivities].flatMap(a => a.projection.contributions.map(e => [e.decisionId, e] as const)));
  const checkReferences = (ids: string[]) => {
    if (new Set(ids).size !== ids.length || ids.some(id => !contributions.has(id))) throw new Error("capital_decision_judgment_evidence_missing");
  };
  if (input.maintenanceExclusion) checkReferences(input.maintenanceExclusion.basisDecisionIds);
  if (input.recommendation) checkReferences(input.recommendation.basisDecisionIds);
  const payload = {schemaVersion: "capital-decision-composition.v1" as const,
    workId: input.workId, purpose: input.purpose, question: input.question, objectives: input.objectives,
    status: !alternatives.length ? "framed" as const : gaps.length ? "partial" as const : "comparison_prepared" as const,
    alternatives, sensitivities, maintenanceExclusion: input.maintenanceExclusion,
    recommendation: input.recommendation ? {...input.recommendation, status: "proposed_judgment" as const} : null,
    contributions: [...contributions.values()], gaps, ranking: null,
    framing: {companyRequiredForFraming: false, numericalComparisonRequires: ["adopted_context", "common_opening", "operating_budget", "debt_and_capital_inventory", "explicit_alternatives"]},
    pendingReviews: ["source_and_assumption_sufficiency", "contractual_constraints", "market_and_implementation_conditions", "professional_recommendation"] as const,
    grantsExecution: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
