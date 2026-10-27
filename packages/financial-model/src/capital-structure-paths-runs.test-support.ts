import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import type {CapitalStructurePathsInput} from "@offroad/financial-core";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {capitalPathsPacketOutputSchema, prepareCapitalPathsPacket, type CapitalPathsPacket, type CapitalPathsPacketInput} from "./capital-structure-paths-packet";
import {auroraCapitalPathsBasis, auroraCapitalPathsKernel} from "./capital-structure-paths.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic calibrations of
// ficha C32 (oracle modelo_aurora_c32.py) with the C04 annual base after 2028, never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const r = (v: string | null | undefined, p = 2) => v == null ? null : new D(v).toDecimalPlaces(p).toNumber();
const near = (v: string | null | undefined, oracle: number, tolerance: number) => v != null && new D(v).minus(oracle).abs().lte(tolerance);
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
type Kernel = CapitalStructurePathsInput;
export const capitalPathsMethodVersion = "2026.10.27-v1";
export const capitalPathsRunIds = {
  gold: "evaluate-financing-paths-2026-10-27-v1-gold",
  adversarial: "evaluate-financing-paths-2026-10-27-v1-adversarial",
  consistency: "evaluate-financing-paths-2026-10-27-v1-consistency",
} as const;
const packetInput = (edit: (k: Kernel) => void = () => undefined, after: (i: CapitalPathsPacketInput) => void = () => undefined): CapitalPathsPacketInput => {
  const k = auroraCapitalPathsKernel(); edit(k);
  const i = auroraCapitalPathsBasis(k).seal(); after(i); return i;
};
const instrument = (k: Kernel, id: string) => k.instruments.find((x) => x.id === id)!;
function observe(id: string, input: CapitalPathsPacketInput, expected: unknown, select: (p: CapitalPathsPacket) => unknown): Case {
  const result = prepareCapitalPathsPacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}

let cachedBase: {input: CapitalPathsPacketInput; packet: CapitalPathsPacket} | null = null;
const base = () => {if (!cachedBase) {const input = packetInput(); cachedBase = {input, packet: prepareCapitalPathsPacket(input)};} return cachedBase;};

function goldCases(): Case[] {
  const {input, packet} = base();
  const reuse = (id: string, expected: unknown, select: (p: CapitalPathsPacket) => unknown): Case => {
    const observed = JSON.stringify(select(packet)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(packet), passed: expectation === observed};
  };
  const path = (p: CapitalPathsPacket, id: string) => p.result.evaluation!.paths.find((x) => x.id === id)!;
  const at = (p: CapitalPathsPacket, id: string, periodId: string) => path(p, id).closingAvailableByPeriod.find((x) => x.periodId === periodId)!;
  const year = (p: CapitalPathsPacket, id: string, y: number) => path(p, id).debtServiceByYear.find((x) => x.year === y)!;
  return [
    // Expectations come from ficha C32 (corpo.html), its oracle (resultados.json) and ficha C04, never from this code.
    reuse("first-shortfall-in-december-2026-without-action", {firstBelow: "2026-12-31", dec26: -10.83, withinFichaTolerance: true},
      (p) => ({firstBelow: p.readings!.withoutAction.firstBelowMinimum, dec26: r(at(p, "manter", "2026-12-31").closingAvailable), withinFichaTolerance: near(at(p, "manter", "2026-12-31").closingAvailable, -11, 3)})),
    reuse("cash-at-the-end-of-2027-without-action", {dec27: -78.63, oracle: true}, (p) => ({dec27: r(at(p, "manter", "2027-12-31").closingAvailable), oracle: near(at(p, "manter", "2027-12-31").closingAvailable, -78.63, 0.005)})),
    reuse("2027-service-against-cash-available-before-the-project", {service: 89.68, principal: 76.67, interest: 13.01, available: 35.68, nearFicha36: true},
      (p) => ({service: r(year(p, "manter", 2027).service), principal: r(year(p, "manter", 2027).principal), interest: r(year(p, "manter", 2027).interestPaid),
        available: r(year(p, "manter", 2027).availableForService), nearFicha36: near(year(p, "manter", 2027).availableForService, 36, 5)})),
    reuse("seven-paths-and-two-companions-on-the-same-base", {candidates: 7, companions: 2, gates: 8}, (p) => ({candidates: p.readings!.horizon.candidatePaths,
      companions: p.readings!.horizon.companionPaths, gates: p.result.evaluation!.gateOrder.length})),
    reuse("recommended-path-comes-from-the-gates", {pathId: "sem-linha-debenture", minimumCash: 15.46, cost: 49.44, netDebt: 79.31, failedGates: 0},
      (p) => ({pathId: p.readings!.recommendation!.pathId, minimumCash: r(p.readings!.recommendation!.minimumCash.amount), cost: r(p.readings!.recommendation!.horizonFinancingCost),
        netDebt: r(p.readings!.recommendation!.netDebtAtHorizon), failedGates: p.readings!.paths[0]!.failedGates.length})),
    reuse("leverage-on-the-indenture-definition-in-december", {base: [2.2, 1.85, 1.42], stress: 2.37, policy: 2.5, indenture: 3},
      (p) => ({base: p.readings!.recommendation!.leverage.map((x) => r(x.ratio)), stress: r(p.readings!.recommendation!.stressWorst.ratio), policy: r(p.readings!.recommendation!.policyLimit),
        indenture: r(p.readings!.recommendation!.indentureLimit)})),
    reuse("oracle-paths-on-the-same-base", [["ccb-tres-anos", -64.71, 34.59, 87.04], ["debenture-com-linha", 15.04, 56.89, 102.15], ["adiar-linha", -60.18, 31.31, 88.84]],
      (p) => ["ccb-tres-anos", "debenture-com-linha", "adiar-linha"].map((id) => [id, r(path(p, id).minimumCash.amount), r(path(p, id).horizonFinancingCost), r(path(p, id).netDebtAtHorizon)])),
    reuse("three-year-ccb-adds-to-2027-and-leaves-bradesco-open", {service2027: 102.97, addedOverStatusQuo: 13.29, firstNegative: "2027-09-30"},
      (p) => ({service2027: r(year(p, "ccb-tres-anos", 2027).service), addedOverStatusQuo: r(new D(year(p, "ccb-tres-anos", 2027).service).minus(year(p, "manter", 2027).service).toFixed()),
        firstNegative: path(p, "ccb-tres-anos").closingAvailableByPeriod.find((x) => new D(x.closingAvailable).lt(0))?.periodId})),
    reuse("taxes-recomputed-per-path", {distinct: 9}, (p) => ({distinct: new Set(p.result.evaluation!.paths.map((x) => x.taxesInHorizon)).size})),
    reuse("aggregate-basket-with-bradesco-inside", {occupied: 12, recommendedPeak: 15, recommendedConsent: false, bankRoutePeak: 36, bankRouteConsent: true},
      (p) => ({occupied: r(path(p, "manter").basket!.occupiedAtOpening), recommendedPeak: r(path(p, "sem-linha-debenture").basket!.peak), recommendedConsent: path(p, "sem-linha-debenture").basket!.consentRequired,
        bankRoutePeak: r(path(p, "alongar-com-banco").basket!.peak), bankRouteConsent: path(p, "alongar-com-banco").basket!.consentRequired})),
    // C04: with five years, 2029 carries R$ 33 mi of amortization against about R$ 24 mi available after interest.
    reuse("five-year-amortization-fails-in-2029-seven-passes", {fiveScheduled: 33.33, fiveAvailable: 23.72, nearC04: true, fivePasses: false, sevenPasses: true, window: [2029, 2033]},
      (p) => {const a = p.readings!.amortization.filter((x) => x.pathId === "sem-linha-debenture"), five = a.find((x) => x.profileId === "cinco-anos")!;
        return {fiveScheduled: r(five.firstYear.scheduledAmortization), fiveAvailable: r(five.firstYear.availableAfterInterest), nearC04: near(five.firstYear.availableAfterInterest, 24.1, 0.5),
          fivePasses: five.passes, sevenPasses: a.find((x) => x.profileId === "adopted")!.passes,
          window: [p.readings!.recommendation!.longInstrument!.firstAmortizationYear, p.readings!.recommendation!.longInstrument!.lastAmortizationYear]};}),
    // Ficha: CDI + 3,4 to 3,6. The cost is solved on the same indexed-debt flows as the cash, charges paid on the period end.
    reuse("effective-cost-of-the-issue-over-its-life", {issueTarget: "80", term: "7", atAdoptedSpread: 3.46, atCondition: 3.56, withinFichaBand: true},
      (p) => {const l = p.readings!.recommendation!.longInstrument!; return {issueTarget: l.issueTarget, term: l.termYears, atAdoptedSpread: r(new D(l.equivalentSpread!).mul(100).toFixed()),
        atCondition: r(new D(l.equivalentSpreadAtCondition!).mul(100).toFixed()), withinFichaBand: new D(l.equivalentSpread!).gte("0.033") && new D(l.equivalentSpreadAtCondition!).lte("0.0365")};}),
    // Ficha turn 4 says about R$ 18 mi short; fragmentos.py says 19 (it keeps the R$ 27 mi seasonal line of the route with the packaging line).
    reuse("bradesco-only-extension-leaves-a-gap", {shortfall: 18.23, nearFicha18: true, lowest: "2028-06-30", firstBelow: "2027-06-30"},
      (p) => ({shortfall: r(path(p, "bradesco-sem-linha").shortfallVsPolicyMinimum), nearFicha18: near(path(p, "bradesco-sem-linha").shortfallVsPolicyMinimum, 18, 1),
        lowest: path(p, "bradesco-sem-linha").minimumCash.periodId, firstBelow: path(p, "bradesco-sem-linha").belowPolicyMinimum[0]})),
    reuse("dated-alternative-before-the-bradesco-maturity", {pathId: "banco-sem-linha", amount: "70", conditions: ["basket_without_consent", "amortization_after_horizon"], decisionBy: "2026-11-15",
      mustPrecede: "2027-09-15", days: 304}, (p) => ({pathId: p.readings!.alternative!.pathId, amount: p.readings!.alternative!.issueTarget, conditions: p.readings!.alternative!.conditions,
      decisionBy: p.readings!.alternative!.decisionBy, mustPrecede: p.readings!.recommendation!.mustPrecede!.date, days: p.readings!.recommendation!.daysToMaturity})),
    // The issue target (80) and the computed floor inside every gate (74,44) are two readings, never one for the other.
    reuse("issue-target-apart-from-the-floor-inside-the-gates", {issueTarget: "80", issueFloorInsideGates: "74.44", sameOnBothReadings: true, conditionInsideGates: true},
      (p) => ({issueTarget: p.readings!.wouldChange.demand!.issueTarget, issueFloorInsideGates: p.readings!.wouldChange.demand!.issueFloorInsideGates,
        sameOnBothReadings: p.readings!.recommendation!.longInstrument!.issueFloorInsideGates === p.readings!.wouldChange.demand!.issueFloorInsideGates
          && p.readings!.recommendation!.longInstrument!.issueTarget === p.readings!.wouldChange.demand!.issueTarget,
        conditionInsideGates: p.readings!.recommendation!.longInstrument!.insideGatesAtCondition})),
    // C47 page 11 cites 2027 EBITDA near 52,6 (C24, informed scenario with pass-through in four months); the sensitivity adopts that level.
    reuse("wheat-sensitivity-at-the-c24-level", {ebitda2027: 52.64, nearC47: true, base2027: 56.6},
      (p) => ({ebitda2027: r(p.readings!.wouldChange.sensitivities.find((s) => s.id === "trigo")!.ebitdaByYear.find((y) => y.year === 2027)!.ebitda),
        nearC47: near(p.readings!.wouldChange.sensitivities.find((s) => s.id === "trigo")!.ebitdaByYear.find((y) => y.year === 2027)!.ebitda, 52.6, 0.05),
        base2027: r(p.readings!.recommendation!.ebitdaByYear.find((y) => y.year === 2027)!.ebitda)})),
    reuse("seasonal-line-leaves-the-test-only-with-a-verified-settlement", {kind: "seasonal_release", settlementDate: "2029-03-31", longDebtTested: "debenture-80"},
      (p) => {const a = path(p, "sem-linha-debenture").afterHorizon; const g = a.residuals.find((x) => x.instrumentId === "giro-4t28")!;
        return {kind: g.kind, settlementDate: g.settlementDate, longDebtTested: a.unitInstrumentId};}),
    reuse("cost-flows-are-the-cash-flows", {couponBase: "opening_principal", couponTreatment: "accrued_until_paid", principal: 80, firstInterestJune2027: true},
      (p) => {const c = p.result.evaluation!.instrumentCosts.find((x) => x.instrumentId === "debenture-80")!;
        if (c.status !== "calculated") return null;
        const recPath = path(p, "sem-linha-debenture"), jun = recPath.closingAvailableByPeriod.find((x) => x.periodId === "2027-06-30")!, flow = c.flows.find((f) => f.periodEnd === "2027-06-30")!;
        return {couponBase: c.couponBase, couponTreatment: c.couponTreatment, principal: r(c.flows.reduce((t, f) => t.plus(f.principal), new D(0)).toFixed()),
          firstInterestJune2027: new D(flow.interestPaid).gt(0) && new D(jun.interestPaid).gte(flow.interestPaid)};}),
    reuse("what-would-change-the-recommendation", [["trigo", false, ["policy_stress"]], ["prazo-redes-60", false, ["minimum_cash_base", "policy_stress"]], ["caixa-minimo-25", false, ["minimum_cash_base"]]],
      (p) => p.readings!.wouldChange.sensitivities.map((s) => [s.id, s.recommendationHolds, s.failedGatesOnRecommended])),
    reuse("facts-readings-recommendations-apart-without-verdict", {recommendations: ["follow_recommended_path_under_condition", "review_project_before_committing", "ask_for_the_longer_amortization",
      "negotiate_covenant_headroom_in_new_terms", "keep_dated_alternative"], verdict: false, process: {contactsInvestors: false, contactsLenders: false, issuesOrSigns: false}},
      (p) => ({recommendations: p.readings!.assessment.recommendations, verdict: Object.keys(p.readings!).includes("verdict"), process: p.readings!.process})),
    observe("minimum-cash-of-policy-changes-the-order", packetInput((k) => {k.minimumCash = "25";}), {recommendation: null, status: "partial", gap: true},
      (p) => ({recommendation: p.readings!.recommendation, status: p.status, gap: p.gaps.some((g) => g.operand.endsWith(".paths"))})),
    observe("absent-minimum-cash-is-a-gap-not-zero", packetInput(undefined, (i) => {i.analysis.company.minimumCash = {...i.analysis.company.minimumCash, decisionId: null, missingReason: "Caixa mínimo de política não informado"};}),
      {status: "framed", gap: true}, (p) => ({status: p.status, gap: p.gaps.some((g) => g.reason === "Caixa mínimo de política não informado")})),
  ];
}

function adversarialCases(): Case[] {
  const forge = (change: (p: CapitalPathsPacket) => unknown) => () => ({forge: change});
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = packetInput(); i.analysis.envelope = {...i.analysis.envelope, canonical: i.analysis.envelope.canonical.replace('"35"', '"55"')}; return i;}, "adoption_basis_integrity_mismatch"],
    ["free-result-in-request", () => ({...packetInput(), evaluation: {paths: []}}), "Unrecognized key"],
    ["recommendation-supplied-as-text", () => {const i = packetInput(); (i.analysis as Record<string, unknown>).recommendation = "sem-linha-debenture"; return i;}, "Unrecognized key"],
    ["taxes-supplied-per-path-instead-of-recalculated", () => {const i = packetInput(); (i.analysis.operating as Record<string, unknown>).cashTaxes = i.analysis.operating.ebitda; return i;}, "Unrecognized key"],
    ["fabricated-grant-in-result", forge((p) => ({...p, grantsExecution: true})), "grantsExecution"],
    ["fabricated-verdict-in-readings", forge((p) => ({...p, readings: {...p.readings!, verdict: "debênture"}})), "Unrecognized key"],
    ["recommendation-not-from-the-gates", forge((p) => ({...p, readings: {...p.readings!, recommendation: {...p.readings!.recommendation!, pathId: "alongar-bradesco"}}})), "capital_paths_recommendation_not_from_gates"],
    // A path that misses the policy in the stress put first and marked eligible.
    ["path-that-misses-the-policy-recommended", forge((p) => {
      const e = p.result.evaluation!, ranking = [{...e.ranking.find((x) => x.pathId === "debenture-com-linha")!, eligible: true, rank: 1}, ...e.ranking.filter((x) => x.pathId !== "debenture-com-linha")];
      return {...p, result: {...p.result, evaluation: {...e, ranking, recommendation: {...e.recommendation!, pathId: "debenture-com-linha"}}},
        readings: {...p.readings!, recommendation: {...p.readings!.recommendation!, pathId: "debenture-com-linha"}}};
    }), "capital_paths_recommended_path_misses_a_gate"],
    ["fabricated-contact-with-investors", forge((p) => ({...p, readings: {...p.readings!, process: {...p.readings!.process, contactsInvestors: true}}})), "contactsInvestors"],
    // The aggregate exception read as empty while the Bradesco assignment sits in it.
    ["basket-read-as-empty-under-the-bradesco-assignment", () => packetInput((k) => {k.basket!.occupied = "0";}), "capital_paths_basket_usage_understated"],
    ["semiannual-interest-paid-instead-of-accrued", () => packetInput((k) => {instrument(k, "debenture-2021").couponTreatment = "cash_paid";}), "capital_paths_coupon_calendar_mismatch"],
    ["amortization-after-the-horizon-ignored", () => packetInput((k) => {instrument(k, "debenture-80").afterHorizon = {kind: "none"};}), "capital_paths_residual_without_after_horizon_terms"],
    // A long issue labeled seasonal to leave the test after the horizon, through the adopted basis and the packet.
    ["long-debt-labeled-seasonal-to-skip-the-amortization-test", () => packetInput((k) => {instrument(k, "debenture-80").afterHorizon = {kind: "seasonal_release", settlementMonthsAfterDraw: 6,
      justification: "Rótulo sazonal sem calendário"};}), "capital_paths_seasonal_release_unverified:debenture-80"],
    ["existing-debt-dropped-from-a-path", () => packetInput((k) => {k.paths[0]!.instrumentIds = ["debenture-2021", "finame"];}), "capital_paths_existing_debt_omitted"],
    ["prepayment-without-contract-terms", () => packetInput((k) => {k.paths[0]!.prepayments = [{instrumentId: "finame", periodEnd: "2027-03-31"}];}), "capital_paths_prepayment_terms_required"],
    ["financed-asset-placed-in-the-basket", () => packetInput((k) => {instrument(k, "finame").security.countsAgainstBasket = true;}), "capital_paths_security_inconsistent"],
    ["covenant-test-off-the-calendar", () => packetInput((k) => {k.covenant.indenture.measurementPeriodEnds = ["2026-11-30"];}), "capital_paths_covenant_date_off_calendar"],
    ["parallel-lists-of-different-length", () => packetInput((k) => {k.index.afterHorizon = k.index.afterHorizon.slice(0, 4);}), "capital_paths_index_after_horizon_missing"],
    ["selection-pointing-at-another-operand", () => {const i = packetInput(); i.analysis.company.minimumCash = {...i.analysis.company.openingAvailable}; return i;}, "analysis_reused_monetary_contribution"],
  ];
  let packet: CapitalPathsPacket | null = null;
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      const change = (input as {forge?: (p: CapitalPathsPacket) => unknown}).forge;
      if (change) {packet ??= base().packet; capitalPathsPacketOutputSchema.parse(change(packet));}
      else prepareCapitalPathsPacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    const fingerprinted = typeof (input as {forge?: unknown})?.forge === "function" ? {forge: id} : input ?? null;
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(fingerprinted), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  const bare = () => packetInput((k) => {k.sensitivities = [];});
  return [base().input, bare()].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = fixtureIndex === 0 ? base().packet : prepareCapitalPathsPacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareCapitalPathsPacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildCapitalPathsRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: capitalPathsRunIds[kind], kind, method: {id: "evaluate-financing-paths", version: capitalPathsMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareCapitalPathsPacket"},
      harness: {module: "@offroad/financial-model/src/capital-structure-paths-runs.test-support.ts", exportName: "buildCapitalPathsRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C32 (oracle modelo_aurora_c32.py) with the C04 annual base after 2028. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
