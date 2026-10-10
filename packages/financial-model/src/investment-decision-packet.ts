import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {adoptedInvestmentAnalysisInputSchema, calculateAdoptedInvestmentAnalysis} from "./adopted-investment-analysis";
import {adoptedInvestmentAnalysisOutputSchema} from "./ficha-calculation-results";

export const investmentDecisionPacketVersion = "2026.10.09-v1";
const Exact = Decimal.clone({precision: 80, rounding: Decimal.ROUND_HALF_UP});
const fmt = (d: Decimal) => d.toDecimalPlaces(20).toFixed();
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160);
const decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/), date = z.iso.date(), hash = z.string().regex(/^[a-f0-9]{64}$/);
const roles = ["base", "sensitivity", "deferral", "staged", "alternative"] as const;

/** One question, several adopted versions of the same project. Every case is a complete,
 * separately adopted scenario (its own scenario label in the basis); the packet never edits
 * a base operand to fabricate a sensitivity, and never supplies a number of its own. */
export const investmentDecisionPacketInputSchema = z.strictObject({
  schemaVersion: z.literal("investment-decision-packet-input.v1"),
  question: text,
  cases: z.array(z.strictObject({
    id: key, role: z.enum(roles), label: text,
    /** What this case changes against the base, in words. Numbers come only from adoptions. */
    changes: z.array(text).max(20),
    analysis: adoptedInvestmentAnalysisInputSchema,
  })).min(1).max(16),
}).superRefine((input, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (input.cases.filter(c => c.role === "base").length !== 1) fail("Exactly one base case is required");
  if (new Set(input.cases.map(c => c.id)).size !== input.cases.length) fail("Duplicate case identity");
  if (new Set(input.cases.map(c => `${c.analysis.analysisId}\u0000${c.analysis.scenario}`)).size !== input.cases.length) fail("Each case needs its own adopted scenario");
  const [first] = input.cases;
  for (const c of input.cases) {
    const a = c.analysis, b = first!.analysis;
    if (a.envelope.fingerprint !== b.envelope.fingerprint || a.scope.workId !== b.scope.workId || a.scope.purpose !== b.scope.purpose
      || a.scope.versionId !== b.scope.versionId || a.entityId !== b.entityId || a.perimeter !== b.perimeter || a.currency !== b.currency)
      fail("All cases must read the same adopted basis, entity, perimeter and currency");
    if (c.role === "base" && c.changes.length) fail("The base case declares no changes");
    if (c.role === "base" && c.analysis.inheritedScenario !== undefined) fail("The base case inherits nothing");
    const baseScenario = input.cases.find(x => x.role === "base")?.analysis.scenario;
    if (c.analysis.inheritedScenario !== undefined && c.analysis.inheritedScenario !== baseScenario) fail("A case may inherit only the base scenario");
    if (c.role !== "base" && !c.changes.length) fail("A non-base case must say what it changes");
  }
});
export type InvestmentDecisionPacketInput = z.infer<typeof investmentDecisionPacketInputSchema>;

const caseMetrics = z.strictObject({
  caseId: key, role: z.enum(roles), label: text, scenario: key,
  netPresentValue: decimal.nullable(), deltaNetPresentValue: decimal.nullable(),
  npvSign: z.enum(["positive", "zero", "negative"]).nullable(), signDiffersFromBase: z.boolean().nullable(),
  annualIrr: decimal.nullable(), irrStatus: z.enum(["calculated", "nonconventional_stream", "root_not_bracketed"]).nullable(),
  irrMinusDiscountRate: decimal.nullable(), discountRate: decimal.nullable(),
  paybackYears: decimal.nullable(), paybackRemainsRecoveredAtEnd: z.boolean().nullable(),
  startupWorkingCapital: decimal.nullable(),
  peakCumulativeCashNeed: z.strictObject({amount: decimal, periodEndDate: date}).nullable(),
  totalUnleveredCashFlow: decimal.nullable(),
  companyMinimumCash: z.strictObject({
    withoutProject: z.strictObject({amount: decimal, periodEndDate: date}),
    withProject: z.strictObject({amount: decimal, periodEndDate: date}),
  }).nullable(),
  resultStatus: z.enum(["missing_inputs", "partial_composition"]),
});
export const investmentDecisionPacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("investment-decision-packet.v1"), executorVersion: z.literal(investmentDecisionPacketVersion),
  financialCoreVersion: key, question: text, basisFingerprint: hash,
  scope: adoptedInvestmentAnalysisInputSchema.shape.scope, entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/),
  cases: z.array(z.strictObject({id: key, role: z.enum(roles), label: text, changes: z.array(text).max(20), result: adoptedInvestmentAnalysisOutputSchema})).min(1).max(16),
  comparison: z.strictObject({
    baseCaseId: key, metrics: z.array(caseMetrics).min(1).max(16),
    /** Cases whose value sign differs from the base: the premises that change the conclusion. */
    conclusionChangingCaseIds: z.array(key).max(16),
    /** Deferral and staging cases measured on company cash, not on project value alone. */
    timingCaseIds: z.array(key).max(16),
  }),
  gaps: z.array(z.strictObject({caseId: key, operand: text, reason: text})).max(4096),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  classification: z.enum(["working_hypothesis", "working_selection"]),
  exclusions: z.array(z.enum(["financing_recommendation", "tax_law_inference", "intraperiod_cash_certification", "method_release"])).length(4)
    .refine(v => v.join("|") === "financing_recommendation|tax_law_inference|intraperiod_cash_certification|method_release", "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type InvestmentDecisionPacket = z.infer<typeof investmentDecisionPacketOutputSchema>;

const minimum = (rows: {endDate: string; amount: string}[]) => rows.reduce<{amount: string; periodEndDate: string} | null>((low, r) =>
  low === null || new Exact(r.amount).lt(low.amount) ? {amount: r.amount, periodEndDate: r.endDate} : low, null);

/** Investment economics before any financing: every adopted case is recomputed by the same
 * engine, then compared to the base on value, return against the adopted discount rate,
 * payback, startup working capital, peak cash need and company cash with and without the
 * project. Deterministic and offline; it recommends nothing and grants nothing. */
export function prepareInvestmentDecisionPacket(raw: unknown): InvestmentDecisionPacket {
  const input = investmentDecisionPacketInputSchema.parse(raw);
  const results = input.cases.map(c => ({c, r: adoptedInvestmentAnalysisOutputSchema.parse(calculateAdoptedInvestmentAnalysis(c.analysis))}));
  const base = results.find(x => x.c.role === "base")!;
  const baseNpv = base.r.valuation ? new Exact(base.r.valuation.netPresentValue) : null;
  const sign = (d: Decimal) => d.gt(0) ? "positive" as const : d.lt(0) ? "negative" as const : "zero" as const;
  const metrics = results.map(({c, r}) => {
    const v = r.valuation, npv = v ? new Exact(v.netPresentValue) : null, rate = v ? v.operands.discountRate : null;
    // The output schema validated these decimal columns; the record helper erases their key types.
    const rows = (r.project?.rows ?? []) as unknown as {endDate: string; cumulativeUnleveredCashFlow: string}[];
    type CompanyRow = {endDate: string; withoutProject: {closingAvailableCash: string}; withProject: {closingAvailableCash: string}};
    const companyRows = (r.company?.rows ?? []) as unknown as CompanyRow[];
    const peak = rows.length ? minimum(rows.map(q => ({endDate: q.endDate, amount: q.cumulativeUnleveredCashFlow}))) : null;
    // The counterfactual measures the opening balance and every period end; the minimum covers both.
    const opening = r.company ? {endDate: c.analysis.openingDate, amount: r.company.operands.openingAvailableCash} : null;
    const company = r.company && opening ? {
      withoutProject: minimum([opening, ...companyRows.map(q => ({endDate: q.endDate, amount: q.withoutProject.closingAvailableCash}))])!,
      withProject: minimum([opening, ...companyRows.map(q => ({endDate: q.endDate, amount: q.withProject.closingAvailableCash}))])!,
    } : null;
    return {caseId: c.id, role: c.role, label: c.label, scenario: c.analysis.scenario,
      netPresentValue: npv ? fmt(npv) : null, deltaNetPresentValue: npv && baseNpv ? fmt(npv.minus(baseNpv)) : null,
      npvSign: npv ? sign(npv) : null, signDiffersFromBase: npv && baseNpv ? sign(npv) !== sign(baseNpv) : null,
      annualIrr: v?.annualIrr ?? null, irrStatus: v?.irrStatus ?? null,
      irrMinusDiscountRate: v?.annualIrr && rate ? fmt(new Exact(v.annualIrr).minus(rate)) : null, discountRate: rate,
      paybackYears: v?.payback?.interpolatedTimeYears ?? null, paybackRemainsRecoveredAtEnd: v ? v.paybackRemainsRecoveredAtEnd : null,
      startupWorkingCapital: (r.startupCapital as {netRequirement?: string} | null)?.netRequirement ?? null,
      peakCumulativeCashNeed: peak && new Exact(peak.amount).lt(0) ? peak : null,
      totalUnleveredCashFlow: r.project?.totalUnleveredCashFlow ?? null, companyMinimumCash: company, resultStatus: r.status};
  });
  const gaps = results.flatMap(({c, r}) => r.gaps.map(g => ({caseId: c.id, ...g})));
  const status = !base.r.project ? "framed" as const : gaps.length ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "investment-decision-packet.v1" as const, executorVersion: investmentDecisionPacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: base.r.basisFingerprint, scope: base.r.scope, entityId: base.r.entityId,
    perimeter: base.r.perimeter, currency: base.r.currency,
    cases: results.map(({c, r}) => ({id: c.id, role: c.role, label: c.label, changes: c.changes, result: r})),
    comparison: {baseCaseId: base.c.id, metrics,
      conclusionChangingCaseIds: metrics.filter(m => m.signDiffersFromBase).map(m => m.caseId),
      timingCaseIds: metrics.filter(m => m.role === "deferral" || m.role === "staged").map(m => m.caseId)},
    gaps, status,
    classification: results.some(x => x.r.classification === "working_hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: ["financing_recommendation", "tax_law_inference", "intraperiod_cash_certification", "method_release"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return investmentDecisionPacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
