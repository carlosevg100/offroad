import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {adoptedProjectionChallengeInputSchema, calculateAdoptedProjectionChallenge} from "./adopted-projection-challenge";
import {adoptedProjectionChallengeOutputSchema, projectionChallengeExclusions} from "./projection-challenge-results";

export const projectionChallengePacketVersion = "2026.10.26-v1";
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);

/** One question about where a projection will be challenged before it goes to the bank. The request
 * carries the adopted analysis only: no scenario, haircut or deliverable can be asked for here. */
export const projectionChallengePacketInputSchema = z.strictObject({
  schemaVersion: z.literal("projection-challenge-packet-input.v1"),
  question: text,
  analysis: adoptedProjectionChallengeInputSchema,
});
export type ProjectionChallengePacketInput = z.infer<typeof projectionChallengePacketInputSchema>;

const pair = z.strictObject({ebitda: decimal, cash: decimal});
export const projectionChallengePacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("projection-challenge-packet.v1"), executorVersion: z.literal(projectionChallengePacketVersion), financialCoreVersion: key,
  question: text, basisFingerprint: hash, scope: adoptedProjectionChallengeInputSchema.shape.scope, entityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  result: adoptedProjectionChallengeOutputSchema,
  /** What the answer must say, in order. */
  readings: z.strictObject({
    gap: z.strictObject({targetPeriodId: key, plan: z.strictObject({ebitda: decimal, margin: decimal.nullable(), cash: decimal.nullable()}),
      reference: z.strictObject({ebitda: decimal, margin: decimal.nullable(), cash: decimal.nullable()}),
      ebitda: decimal, cash: decimal, planMarginFirst: decimal.nullable(), marginExpansion: decimal.nullable(), marginCauseStated: text.nullable()}),
    /** Assumptions in order of their isolated EBITDA effect from the reference, then cash. */
    assumptions: z.array(z.strictObject({assumptionId: key, label: text, effect: pair, effectFromPlan: pair, cumulativeShareOfEbitdaGap: decimal.nullable(),
      drivers: z.array(z.strictObject({driver: key, plan: decimal, reference: decimal, planGrowth: decimal.nullable(), referenceGrowth: decimal.nullable()})).min(1).max(12),
      ruler: text.nullable(), evidenceThatWouldSustain: z.array(text).max(8).nullable(), evidenceStatus: z.enum(["documented", "not_presented"]).nullable()})).min(1).max(12),
    largestAssumptionId: key,
    interaction: z.strictObject({fromReference: pair, fromPlan: pair}),
    unitMargin: z.strictObject({planFirst: decimal, planTarget: decimal, referenceTarget: decimal, planChange: decimal.nullable()}),
    capacity: z.strictObject({maximumQuantity: decimal, firstPeriodAbove: key.nullable(), excessAtTarget: decimal.nullable(), investmentInPlan: z.boolean(),
      aboveWithoutInvestment: z.boolean(), source: text.nullable()}).nullable(),
    receivables: z.strictObject({planDays: decimal, cashPerDay: decimal, requestedDays: decimal.nullable(), cashAtRequestedDays: decimal.nullable()}),
    premiumMix: z.strictObject({premiumOverAverage: decimal, shareNeededAtTarget: decimal, sharePerPeriod: decimal}).nullable(),
    recommendation: z.strictObject({kind: z.enum(["present_plan_as_upside_case", "present_plan_with_its_evidence", "plan_within_reference"]),
      /** The base the answer proposes: assumptions the company can document, the reference for the rest. */
      baseCase: z.enum(["reference_with_documented_assumptions", "plan"]),
      /** Assumptions that need their evidence for the plan to hold, in order of effect. */
      conditions: z.array(key).max(12),
      capacityCondition: z.enum(["limit_quantity_to_capacity_or_add_the_investment_and_its_financing"]).nullable()}),
    openQuestions: z.array(z.enum(["installed_capacity", "current_premium_share", "premium_incremental_unit_cost", "premium_sell_in_since_launch"])).max(4),
  }).nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1024),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(projectionChallengeExclusions)).length(5)
    .refine((v) => v.join("|") === projectionChallengeExclusions.join("|"), "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type ProjectionChallengePacket = z.infer<typeof projectionChallengePacketOutputSchema>;

/** Where the projection will be challenged and what would make it hold: the plan against a reference
 * built by drivers at the target period, the EBITDA and cash gap, the margin the plan reaches and whether
 * it states a cause, each assumption's isolated effect in order of size with the yardstick and the
 * evidence that would sustain it, the interaction the isolated effects leave out, the margin per unit,
 * the installed capacity, receivable days and maintenance capex in cash, and the recommendation to keep
 * as the base what can be documented and present the rest as the upside case. No scenario is run, the
 * model is not rebuilt and no material is produced. Deterministic. */
export function prepareProjectionChallengePacket(raw: unknown): ProjectionChallengePacket {
  const input = projectionChallengePacketInputSchema.parse(raw);
  const result = adoptedProjectionChallengeOutputSchema.parse(calculateAdoptedProjectionChallenge(input.analysis));
  const c = result.challenge;
  const gaps = [...result.gaps];
  if (input.analysis.capacity === null) gaps.push({operand: "capacity", reason: "installed_capacity_not_informed"});
  const readings = c ? (() => {
    const t = c.reference.findIndex((r) => r.periodId === c.targetPeriodId), plan = c.plan[t]!, reference = c.reference[t]!;
    const evidence = new Map(result.assumptions.map((a) => [a.assumptionId, a]));
    const assumptions = c.order.map((o) => {
      const e = c.effects.find((x) => x.assumptionId === o.assumptionId)!, a = evidence.get(o.assumptionId);
      return {assumptionId: e.assumptionId, label: e.label, effect: e.fromReference, effectFromPlan: e.fromPlan, cumulativeShareOfEbitdaGap: o.cumulativeShareOfEbitdaGap,
        drivers: e.drivers, ruler: a?.ruler ?? null, evidenceThatWouldSustain: a?.evidenceThatWouldSustain ?? null, evidenceStatus: a?.evidenceStatus ?? null};
    });
    const positive = (p: {ebitda: string; cash: string}) => new Decimal(p.ebitda).gt(0) || new Decimal(p.cash).gt(0);
    // An assumption that lifts the plan and is not documented is a condition of the plan, never a cut.
    const conditions = assumptions.filter((a) => positive(a.effect) && a.evidenceStatus !== "documented").map((a) => a.assumptionId);
    const capacityCondition = c.capacity?.aboveWithoutInvestment ? "limit_quantity_to_capacity_or_add_the_investment_and_its_financing" as const : null;
    const within = !new Decimal(c.gap.ebitda).gt(0) && !new Decimal(c.gap.cash).gt(0);
    const kind = within ? "plan_within_reference" as const : conditions.length || capacityCondition ? "present_plan_as_upside_case" as const : "present_plan_with_its_evidence" as const;
    const targetExcess = c.capacity?.periodsAbove.find((p) => p.periodId === c.targetPeriodId)?.excess ?? null;
    return {
      gap: {targetPeriodId: c.targetPeriodId, plan: {ebitda: plan.ebitda, margin: plan.margin, cash: plan.cashAvailable},
        reference: {ebitda: reference.ebitda, margin: reference.margin, cash: reference.cashAvailable}, ebitda: c.gap.ebitda, cash: c.gap.cash,
        planMarginFirst: c.plan[0]!.margin,
        marginExpansion: plan.margin === null || c.plan[0]!.margin === null ? null : new Decimal(plan.margin).minus(c.plan[0]!.margin).toFixed(),
        marginCauseStated: result.marginCause},
      assumptions, largestAssumptionId: assumptions[0]!.assumptionId, interaction: c.interaction, unitMargin: c.unitMargin,
      capacity: c.capacity === null ? null : {maximumQuantity: c.capacity.maximumQuantity, firstPeriodAbove: c.capacity.firstPeriodAbove, excessAtTarget: targetExcess,
        investmentInPlan: c.capacity.investmentInPlan, aboveWithoutInvestment: c.capacity.aboveWithoutInvestment, source: result.capacitySource},
      receivables: {planDays: c.receivables.planDays, cashPerDay: c.receivables.cashPerDayAtPlanRevenue, requestedDays: c.receivables.requestedDays, cashAtRequestedDays: c.receivables.cashAtRequestedDays},
      premiumMix: c.premiumMix === null ? null : {premiumOverAverage: c.premiumMix.premiumOverAverage, shareNeededAtTarget: c.premiumMix.shareNeededAtTarget, sharePerPeriod: c.premiumMix.sharePerPeriod},
      recommendation: {kind, baseCase: kind === "present_plan_as_upside_case" ? "reference_with_documented_assumptions" as const : "plan" as const, conditions, capacityCondition},
      openQuestions: [...c.capacity === null ? ["installed_capacity" as const] : [],
        ...c.premiumMix ? ["current_premium_share" as const, "premium_incremental_unit_cost" as const, "premium_sell_in_since_launch" as const] : []],
    };
  })() : null;
  const status = !c ? "framed" as const : gaps.length || readings!.openQuestions.length ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "projection-challenge-packet.v1" as const, executorVersion: projectionChallengePacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: result.basisFingerprint, scope: result.scope, entityId: result.entityId, currency: result.currency,
    result, readings, gaps, status, exclusions: [...projectionChallengeExclusions],
    grantsExecution: false as const, grantsPublication: false as const};
  return projectionChallengePacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
