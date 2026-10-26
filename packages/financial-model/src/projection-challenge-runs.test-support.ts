import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {prepareProjectionChallengePacket, projectionChallengePacketOutputSchema, type ProjectionChallengePacketInput} from "./projection-challenge-packet";
import {auroraProjectionBasis, type AuroraProjectionOptions} from "./projection-challenge.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic
// calibrations of ficha C26 (modelo_c26.py over modelo_c24.py), never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const r = (v: string | null | undefined, p = 1) => v == null ? null : new D(v).toDecimalPlaces(p).toNumber();
const pct = (v: string | null | undefined, p = 1) => v == null ? null : new D(v).mul(100).toDecimalPlaces(p).toNumber();
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
type Packet = ReturnType<typeof prepareProjectionChallengePacket>;
type Basis = ReturnType<typeof auroraProjectionBasis>;
export const projectionChallengeMethodVersion = "2026.10.26-v1";
export const projectionChallengeRunIds = {
  gold: "challenge-financial-projection-2026-10-26-v1-gold",
  adversarial: "challenge-financial-projection-2026-10-26-v1-adversarial",
  consistency: "challenge-financial-projection-2026-10-26-v1-consistency",
} as const;
const question = "Que premissas você questionaria nessa projeção? Vai para os bancos semana que vem.";
const packetInput = (o: AuroraProjectionOptions = {}, edit: (f: Basis) => void = () => undefined): ProjectionChallengePacketInput => {
  const f = auroraProjectionBasis(o); edit(f);
  return {schemaVersion: "projection-challenge-packet-input.v1", question, analysis: f.seal()} as ProjectionChallengePacketInput;
};
function observe(id: string, input: ProjectionChallengePacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareProjectionChallengePacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
const assumption = (p: Packet, id: string) => p.readings!.assumptions.find((a) => a.assumptionId === id)!;
const driver = (p: Packet, id: string, d: string) => assumption(p, id).drivers.find((x) => x.driver === d)!;

function goldCases(): Case[] {
  const base = () => packetInput(), packet = prepareProjectionChallengePacket(base());
  const reuse = (id: string, expected: unknown, select: (p: Packet) => unknown): Case => {
    const observed = JSON.stringify(select(packet)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(base()), outputFingerprint: fingerprint(packet), passed: expectation === observed};
  };
  return [
    // Expectations come from the independent Python oracle (outputs/fichas-ensaio-2026-10/C26/resultados.json) and the ficha's answer key.
    reuse("plan-about-27-million-above-the-reference-in-2028", {plan: 86, reference: 58.8, ebitda: 27.2, cash: 19.1},
      (p) => ({plan: r(p.readings!.gap.plan.ebitda), reference: r(p.readings!.gap.reference.ebitda), ebitda: r(p.readings!.gap.ebitda), cash: r(p.readings!.gap.cash)})),
    reuse("margin-to-16-2-without-a-stated-cause", {first: 12.4, target: 16.2, reference: 12.1, cause: null},
      (p) => ({first: pct(p.readings!.gap.planMarginFirst), target: pct(p.readings!.gap.plan.margin), reference: pct(p.readings!.gap.reference.margin), cause: p.readings!.gap.marginCauseStated})),
    reuse("price-above-cost-is-the-largest-effect-with-margin-per-kg", {largest: "preco", ebitda: 12.9, cash: 7.8, planGrowth: 3.5, unitMargin: [1.24, 1.43], referenceUnitMargin: 1.32, unitMarginChange: 15.4},
      (p) => ({largest: p.readings!.largestAssumptionId, ebitda: r(assumption(p, "preco").effect.ebitda), cash: r(assumption(p, "preco").effect.cash),
        planGrowth: pct(driver(p, "preco", "netUnitPrice").planGrowth), unitMargin: [r(p.readings!.unitMargin.planFirst, 2), r(p.readings!.unitMargin.planTarget, 2)],
        referenceUnitMargin: r(p.readings!.unitMargin.referenceTarget, 2), unitMarginChange: pct(p.readings!.unitMargin.planChange)})),
    reuse("assumptions-in-order-of-isolated-effect", [["preco", 12.9, 7.8], ["volume", 9.6, 4.7], ["fixos", 3.8, 2.5], ["prazo-capex", 0, 3.3]],
      (p) => p.readings!.assumptions.map((a) => [a.assumptionId, r(a.effect.ebitda), r(a.effect.cash)])),
    reuse("volume-above-the-118-thousand-tonne-capacity-in-2028-without-capex", {planGrowth: 4.5, referenceGrowth: 2.3, firstAbove: "2028", excess: 1.8, investmentInPlan: false,
      condition: "limit_quantity_to_capacity_or_add_the_investment_and_its_financing"},
      (p) => ({planGrowth: pct(driver(p, "volume", "quantity").planGrowth), referenceGrowth: pct(driver(p, "volume", "quantity").referenceGrowth),
        firstAbove: p.readings!.capacity!.firstPeriodAbove, excess: r(p.readings!.capacity!.excessAtTarget), investmentInPlan: p.readings!.capacity!.investmentInPlan,
        condition: p.readings!.recommendation.capacityCondition})),
    reuse("fixed-costs-below-inflation", {planGrowth: 3, referenceGrowth: 4.5, ebitda: 3.8}, (p) => ({planGrowth: pct(driver(p, "fixos", "fixedCosts").planGrowth),
      referenceGrowth: pct(driver(p, "fixos", "fixedCosts").referenceGrowth), ebitda: r(assumption(p, "fixos").effect.ebitda)})),
    reuse("receivable-days-and-maintenance-capex-in-cash", {ebitda: 0, cash: 3.3, days: [45, 50], capex: [5, 8], cashPerDay: 1.48, atRequestedDays: 22.1},
      (p) => ({ebitda: r(assumption(p, "prazo-capex").effect.ebitda), cash: r(assumption(p, "prazo-capex").effect.cash),
        days: [r(driver(p, "prazo-capex", "receivableDays").plan), r(driver(p, "prazo-capex", "receivableDays").reference)],
        capex: [r(driver(p, "prazo-capex", "maintenanceCapex").plan), r(driver(p, "prazo-capex", "maintenanceCapex").reference)],
        cashPerDay: r(p.readings!.receivables.cashPerDay, 2), atRequestedDays: r(p.readings!.receivables.cashAtRequestedDays)})),
    reuse("evidence-that-would-sustain-each-assumption", [["preco", 3, true], ["volume", 2, true], ["fixos", 1, true], ["prazo-capex", 2, true]],
      (p) => p.readings!.assumptions.map((a) => [a.assumptionId, a.evidenceThatWouldSustain?.length ?? 0, a.ruler !== null])),
    reuse("interaction-between-assumptions-shown-not-absorbed", {ebitda: 0.8, cash: 0.7, explainedByThree: 96.9},
      (p) => ({ebitda: r(p.readings!.interaction.fromReference.ebitda), cash: r(p.readings!.interaction.fromReference.cash),
        explainedByThree: pct(p.readings!.assumptions[2]!.cumulativeShareOfEbitdaGap)})),
    reuse("effects-from-the-plan-under-the-second-convention", [["preco", 13.8, 8.4], ["volume", 10.5, 5.4], ["fixos", 3.8, 2.5], ["prazo-capex", 0, 3.6]],
      (p) => p.readings!.assumptions.map((a) => [a.assumptionId, r(a.effectFromPlan.ebitda), r(a.effectFromPlan.cash)])),
    reuse("present-the-current-plan-as-the-upside-case", {kind: "present_plan_as_upside_case", baseCase: "reference_with_documented_assumptions", conditions: ["preco", "volume", "fixos", "prazo-capex"]},
      (p) => ({kind: p.readings!.recommendation.kind, baseCase: p.readings!.recommendation.baseCase, conditions: p.readings!.recommendation.conditions})),
    reuse("no-scenario-no-rebuilt-model-no-material", {exclusions: ["scenario_execution", "model_rebuild", "material_production", "credit_approval", "method_release"], grantsExecution: false, status: "prepared_for_human_review"},
      (p) => ({exclusions: p.exclusions, grantsExecution: p.grantsExecution, status: p.status})),
    observe("turn-two-premium-line-needs-mix-share", packetInput({premiumOverAverage: "0.25"}), {shareNeeded: 10.6, perYear: 3.5, questions: ["current_premium_share", "premium_incremental_unit_cost", "premium_sell_in_since_launch"]},
      (p) => ({shareNeeded: pct(p.readings!.premiumMix!.shareNeededAtTarget), perYear: pct(p.readings!.premiumMix!.sharePerPeriod), questions: p.readings!.openQuestions})),
    observe("documented-price-leaves-the-conditions", packetInput({documented: ["preco"]}), ["volume", "fixos", "prazo-capex"], (p) => p.readings!.recommendation.conditions),
    observe("capacity-not-informed-is-a-gap-and-a-question", packetInput({capacity: false}), {status: "partial", gaps: ["installed_capacity_not_informed"], questions: ["installed_capacity"]},
      (p) => ({status: p.status, gaps: p.gaps.map((g) => g.reason), questions: p.readings!.openQuestions})),
    (() => {
      const i = packetInput();
      i.analysis.plan.fixedCosts = {...i.analysis.plan.fixedCosts, decisionId: null, missingReason: "Custos fixos do plano não informados"};
      return observe("absent-plan-figure-is-a-gap-not-a-default", i, {status: "framed", readings: null, gap: true},
        (p) => ({status: p.status, readings: p.readings, gap: p.gaps.some((g) => g.reason === "Custos fixos do plano não informados")}));
    })(),
  ];
}

function adversarialCases(): Case[] {
  const list = (value: string[]) => ({type: "list" as const, value});
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = packetInput(); i.analysis.envelope = {...i.analysis.envelope, canonical: i.analysis.envelope.canonical.replace('"119.8"', '"110.8"')}; return i;}, "adoption_basis_integrity_mismatch"],
    ["free-result-in-request", () => ({...packetInput(), challenge: {gap: {ebitda: "0"}}}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: true}), "grantsExecution"],
    ["scenario-run-requested", () => ({...packetInput(), scenarios: [{id: "estresse", revenue: "-0.1", margin: "0.12"}]}), "Unrecognized key"],
    ["deck-requested", () => ({...packetInput(), deliverable: "deck"}), "Unrecognized key"],
    ["uniform-haircut-in-the-analysis", () => {const i = packetInput(); return {...i, analysis: {...i.analysis, uniformHaircut: "0.1"}};}, "Unrecognized key"],
    ["uniform-cut-as-one-assumption", () => packetInput({}, (f) => {f.set("assumption.volume.drivers", list(["quantity", "netUnitPrice", "fixedCosts"]));}), "projection_challenge_income_drivers_grouped"],
    ["critique-without-a-number", () => packetInput({}, (f) => {f.set("assumption.fixos.drivers", list(["taxRate"]));}), "projection_challenge_assumption_without_difference"],
    ["difference-left-unexplained", () => {const i = packetInput(); i.analysis.assumptions = i.analysis.assumptions.filter((a) => a.id !== "volume"); return i;}, "projection_challenge_unassigned_difference"],
    ["target-is-the-first-period", () => packetInput({}, (f) => {f.set("targetPeriodId", {type: "text", value: "2025"});}), "projection_challenge_target_period"],
    ["series-shorter-than-the-periods", () => packetInput({}, (f) => {f.set("case.plan.quantity", list(["105", "109.7", "114.7"]));}), "projection_challenge_period_length"],
    ["plan-figure-read-in-the-reference-scenario", () => packetInput({}, (f) => {f.entries.find((x) => x.fieldPath.endsWith("case.plan.fixedCosts"))!.dimensions.scenario = "referencia";}), "analysis_basis_context_mismatch"],
    ["one-scenario-for-both-cases", () => {const i = packetInput(); return {...i, analysis: {...i.analysis, referenceScenario: "plano"}};}, "Reference and plan need their own scenarios"],
    ["tax-rate-above-one", () => packetInput({}, (f) => {f.set("case.plan.taxRate", {type: "number", value: "1.5"});}), "projection_challenge_tax_rate"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      if ((input as {forge?: boolean}).forge) projectionChallengePacketOutputSchema.parse({...prepareProjectionChallengePacket(packetInput()), grantsExecution: true});
      else prepareProjectionChallengePacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  return [packetInput(), packetInput({premiumOverAverage: "0.25", documented: ["preco"]})].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareProjectionChallengePacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareProjectionChallengePacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildProjectionChallengeRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: projectionChallengeRunIds[kind], kind, method: {id: "challenge-financial-projection", version: projectionChallengeMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareProjectionChallengePacket"},
      harness: {module: "@offroad/financial-model/src/projection-challenge-runs.test-support.ts", exportName: "buildProjectionChallengeRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C26. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
