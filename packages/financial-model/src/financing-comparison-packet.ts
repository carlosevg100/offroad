import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {adoptedFinancingComparisonInputSchema, calculateAdoptedFinancingComparison} from "./adopted-financing-comparison";
import {adoptedFinancingComparisonOutputSchema} from "./ficha-calculation-results";

export const financingComparisonPacketVersion = "2026.10.19-v1";
const Exact = Decimal.clone({precision: 80, rounding: Decimal.ROUND_HALF_UP});
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160);
const engine = z.string().regex(/^-?\d{1,30}(?:\.\d{1,80})?$/), hash = z.string().regex(/^[a-f0-9]{64}$/);
const roles = ["base", "stress", "sensitivity"] as const;
const eliminatory = ["cash_below_zero", "covenant_breach", "cost_not_determined", "collateral_above_policy"] as const;
const conditioning = ["cash_below_policy_minimum"] as const;

/** One need, the same proposals, several adopted scenarios of the company. Every case is a
 * complete adopted scenario of the same basis; the packet never edits an operand to fabricate
 * a stress, never weighs criteria into a score and never chooses a counterparty. */
export const financingComparisonPacketInputSchema = z.strictObject({
  schemaVersion: z.literal("financing-comparison-packet-input.v1"),
  question: text,
  cases: z.array(z.strictObject({
    id: key, role: z.enum(roles), label: text,
    /** What this case changes against the base, in words. Numbers come only from adoptions. */
    changes: z.array(text).max(20),
    analysis: adoptedFinancingComparisonInputSchema,
  })).min(1).max(8),
}).superRefine((input, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (input.cases.filter((c) => c.role === "base").length !== 1) fail("Exactly one base case is required");
  if (new Set(input.cases.map((c) => c.id)).size !== input.cases.length) fail("Duplicate case identity");
  if (new Set(input.cases.map((c) => c.analysis.scenario)).size !== input.cases.length) fail("Each case needs its own adopted scenario");
  const base = input.cases.find((c) => c.role === "base")?.analysis;
  const proposals = (a: typeof base) => a!.proposals.map((p) => p.id).sort().join("|");
  for (const c of input.cases) {
    const a = c.analysis, b = input.cases[0]!.analysis;
    if (a.envelope.fingerprint !== b.envelope.fingerprint || a.scope.workId !== b.scope.workId || a.scope.versionId !== b.scope.versionId
      || a.entityId !== b.entityId || a.perimeter !== b.perimeter || a.currency !== b.currency || a.comparisonId !== b.comparisonId)
      fail("All cases must read the same adopted basis, entity, perimeter, currency and comparison");
    if (base && proposals(a) !== proposals(base)) fail("All cases must compare the same proposals");
    if (c.role === "base" && c.changes.length) fail("The base case declares no changes");
    if (c.role === "base" && a.inheritedScenario !== undefined) fail("The base case inherits nothing");
    if (a.inheritedScenario !== undefined && a.inheritedScenario !== base?.scenario) fail("A case may inherit only the base scenario");
    if (c.role !== "base" && !c.changes.length) fail("A non-base case must say what it changes");
  }
});
export type FinancingComparisonPacketInput = z.infer<typeof financingComparisonPacketInputSchema>;

const proposalMetrics = z.strictObject({
  proposalId: z.uuid(), label: text,
  equivalentSpread: engine.nullable(), weightedAverageLifeYears: engine,
  minimumCash: z.strictObject({amount: engine, periodId: key}),
  covenant: z.strictObject({name: text, worstPeriod: key, worstRatio: engine, headroom: engine, allComply: z.boolean()}),
  debtServiceByYear: z.record(z.string().regex(/^\d{4}$/), engine),
  collateralConsumed: engine, freeReceivablesAfter: engine, horizonFinancingCost: engine, netDebtAtHorizon: engine,
  /** Contractual test dates in the busiest year of the horizon. */
  covenantTestsPerYear: z.number().int().min(0).max(480),
  /** Facts that eliminate the proposal in this case before any preference. */
  eliminatoryFacts: z.array(z.enum(eliminatory)).max(4),
  /** Facts that keep the proposal viable only under a condition to negotiate or approve. */
  conditioningFacts: z.array(z.enum(conditioning)).max(1),
});
const caseComparison = z.strictObject({
  caseId: key, role: z.enum(roles), label: text, scenario: key, resultStatus: z.enum(["missing_inputs", "partial_composition"]),
  proposals: z.array(proposalMetrics).max(8),
  /** Proposals left out of this case for a missing premise; their gaps are listed with the packet's gaps. */
  incompleteProposalIds: z.array(z.uuid()).max(8),
  /** Proposals with no eliminatory fact in this case; conditioned proposals stay viable. */
  viableProposalIds: z.array(z.uuid()).max(8),
  /** Lowest equivalent cost and highest minimum cash among viable proposals; reported side by side, never merged. */
  lowestEquivalentCostProposalId: z.uuid().nullable(), highestMinimumCashProposalId: z.uuid().nullable(),
});
export const financingComparisonPacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("financing-comparison-packet.v1"), executorVersion: z.literal(financingComparisonPacketVersion),
  financialCoreVersion: key, question: text, basisFingerprint: hash,
  scope: adoptedFinancingComparisonInputSchema.shape.scope, entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/),
  cases: z.array(z.strictObject({id: key, role: z.enum(roles), label: text, changes: z.array(text).max(20), result: adoptedFinancingComparisonOutputSchema})).min(1).max(8),
  comparison: z.strictObject({
    baseCaseId: key, cases: z.array(caseComparison).min(1).max(8),
    /** Viable in every adopted case: the proposals that survive the stresses. */
    viableInEveryCaseProposalIds: z.array(z.uuid()).max(8),
    /** Cases whose viable set differs from the base: the premises that change the conclusion. */
    conclusionChangingCaseIds: z.array(key).max(8),
    /** True when, in the base, the lowest nominal spread is not the lowest equivalent cost. */
    nominalSpreadMisleads: z.boolean().nullable(),
  }),
  gaps: z.array(z.strictObject({caseId: key, operand: text, reason: text})).max(4096),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  classification: z.enum(["working_hypothesis", "working_selection"]),
  exclusions: z.array(z.enum(["choice_of_counterparty", "firmness_and_validity", "reciprocity", "tax_law_inference", "method_release"])).length(5)
    .refine((v) => v.join("|") === "choice_of_counterparty|firmness_and_validity|reciprocity|tax_law_inference|method_release", "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type FinancingComparisonPacket = z.infer<typeof financingComparisonPacketOutputSchema>;

/** Financing proposals for the same need, compared on the company itself in every adopted
 * scenario: equivalent cost, average life, minimum cash and its period, contractual leverage on
 * each lender's own definition, peak debt service, collateral and horizon cost. Eliminatory facts
 * come before any preference; cheapest and safest are shown side by side. Deterministic and
 * offline; it recommends nothing and grants nothing. */
export function prepareFinancingComparisonPacket(raw: unknown): FinancingComparisonPacket {
  const input = financingComparisonPacketInputSchema.parse(raw);
  const results = input.cases.map((c) => ({c, r: adoptedFinancingComparisonOutputSchema.parse(calculateAdoptedFinancingComparison(c.analysis))}));
  const base = results.find((x) => x.c.role === "base")!;
  const cases = results.map(({c, r}) => {
    const pool = r.comparison ? new Exact(r.comparison.operands.freeReceivablesPool) : null;
    const proposals = (r.comparison?.proposals ?? []).map((p) => {
      const share = r.policies.maximumCollateralShare;
      const facts = [...(new Exact(p.minimumCash.amount).lt(0) ? ["cash_below_zero" as const] : []), ...(p.covenant.allComply ? [] : ["covenant_breach" as const]),
        ...(p.equivalentSpread === null ? ["cost_not_determined" as const] : []),
        ...(share !== null && pool!.gt(0) && new Exact(p.collateralConsumed).div(pool!).gt(share) ? ["collateral_above_policy" as const] : [])];
      const policy = r.policies.minimumCash;
      const conditions = policy !== null && new Exact(p.minimumCash.amount).gte(0) && new Exact(p.minimumCash.amount).lt(policy) ? ["cash_below_policy_minimum" as const] : [];
      const dates = r.comparison!.operands.proposals.find((o) => o.id === p.id)!.covenant.measurementPeriods;
      const perYear = dates.reduce<Record<string, number>>((m, d) => ({...m, [d.slice(0, 4)]: (m[d.slice(0, 4)] ?? 0) + 1}), {});
      return {proposalId: p.id, label: p.label, equivalentSpread: p.equivalentSpread, weightedAverageLifeYears: p.weightedAverageLifeYears,
        minimumCash: p.minimumCash, covenant: {name: p.covenant.name, worstPeriod: p.covenant.worst.period, worstRatio: p.covenant.worst.ratio, headroom: p.covenant.worst.headroom, allComply: p.covenant.allComply},
        debtServiceByYear: p.debtServiceByYear, collateralConsumed: p.collateralConsumed, freeReceivablesAfter: p.freeReceivablesAfter,
        horizonFinancingCost: p.horizonFinancingCost, netDebtAtHorizon: p.netDebtAtHorizon,
        covenantTestsPerYear: Math.max(0, ...Object.values(perYear)), eliminatoryFacts: facts, conditioningFacts: conditions};
    });
    const viable = proposals.filter((p) => !p.eliminatoryFacts.length);
    const pick = (better: (a: typeof viable[number], b: typeof viable[number]) => boolean) => viable.length ? viable.reduce((m, p) => (better(p, m) ? p : m)).proposalId : null;
    return {caseId: c.id, role: c.role, label: c.label, scenario: c.analysis.scenario, resultStatus: r.status, proposals, incompleteProposalIds: r.incompleteProposalIds,
      viableProposalIds: viable.map((p) => p.proposalId),
      lowestEquivalentCostProposalId: pick((a, b) => new Exact(a.equivalentSpread!).lt(b.equivalentSpread!)),
      highestMinimumCashProposalId: pick((a, b) => new Exact(a.minimumCash.amount).gt(b.minimumCash.amount))};
  });
  const baseCase = cases.find((x) => x.role === "base")!;
  const complete = cases.every((x) => x.resultStatus === "partial_composition");
  const baseSpreads = base.r.comparison?.proposals.map((p) => ({id: p.id, equivalent: p.equivalentSpread,
    nominal: base.r.comparison!.operands.proposals.find((o) => o.id === p.id)!.cost.schedule.annualSpread})) ?? [];
  const lowest = (pick: (s: typeof baseSpreads[number]) => string | null) => baseSpreads.every((s) => pick(s) !== null)
    ? baseSpreads.reduce((m, s) => (new Exact(pick(s)!).lt(pick(m)!) ? s : m)).id : null;
  const lowestNominal = baseSpreads.length ? lowest((s) => s.nominal) : null, lowestEquivalent = baseSpreads.length ? lowest((s) => s.equivalent) : null;
  const gaps = results.flatMap(({c, r}) => r.gaps.map((g) => ({caseId: c.id, ...g})));
  const status = !base.r.comparison ? "framed" as const : gaps.length || !complete ? "partial" as const : "prepared_for_human_review" as const;
  const sameSet = (a: string[], b: string[]) => [...a].sort().join("|") === [...b].sort().join("|");
  const payload = {schemaVersion: "financing-comparison-packet.v1" as const, executorVersion: financingComparisonPacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: base.r.basisFingerprint, scope: base.r.scope, entityId: base.r.entityId,
    perimeter: base.r.perimeter, currency: base.r.currency,
    cases: results.map(({c, r}) => ({id: c.id, role: c.role, label: c.label, changes: c.changes, result: r})),
    comparison: {baseCaseId: base.c.id, cases,
      viableInEveryCaseProposalIds: complete ? baseCase.viableProposalIds.filter((id) => cases.every((x) => x.viableProposalIds.includes(id))) : [],
      conclusionChangingCaseIds: complete ? cases.filter((x) => x.role !== "base" && !sameSet(x.viableProposalIds, baseCase.viableProposalIds)).map((x) => x.caseId) : [],
      nominalSpreadMisleads: lowestNominal && lowestEquivalent ? lowestNominal !== lowestEquivalent : null},
    gaps, status,
    classification: results.some((x) => x.r.classification === "working_hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: ["choice_of_counterparty", "firmness_and_validity", "reciprocity", "tax_law_inference", "method_release"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return financingComparisonPacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
