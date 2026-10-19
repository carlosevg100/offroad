import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {financingComparisonPacketOutputSchema, prepareFinancingComparisonPacket, type FinancingComparisonPacketInput} from "./financing-comparison-packet";
import {c02Ids, c02PacketInput} from "./financing-comparison.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic
// calibrations of ficha C02 (modelo_c02.py), never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const r = (v: string | null, places = 4) => v === null ? null : new D(v).toDecimalPlaces(places).toNumber();
const pct = (v: string | null) => v === null ? null : new D(v).times(100).toDecimalPlaces(4).toNumber();
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
export const financingComparisonMethodVersion = "2026.10.19-v2";
export const financingComparisonRunIds = {
  gold: "compare-financing-proposals-2026-10-19-v2-gold",
  adversarial: "compare-financing-proposals-2026-10-19-v2-adversarial",
  consistency: "compare-financing-proposals-2026-10-19-v2-consistency",
} as const;

const names = {[c02Ids.itau]: "itau", [c02Ids.santander]: "santander", [c02Ids.fundo]: "fundo", [c02Ids.itauNegotiated]: "itau-negotiated", [c02Ids.santander230]: "santander-230"} as Record<string, string>;
const sealed = () => c02PacketInput().seal() as FinancingComparisonPacketInput;
const baseOnly = () => {const i = sealed(); i.cases = [i.cases[0]!]; return i;};
/** The company's own rule caps receivables given as collateral at a share of the free pool. */
const withCollateralRule = (share: string) => {
  const p = c02PacketInput(), rule = p.basis.contribute("company.maximumCollateralShare", "ratio", {type: "number", value: share});
  for (const c of p.input.cases) c.analysis.company.maximumCollateralShare = rule;
  return p.seal() as FinancingComparisonPacketInput;
};
type Packet = ReturnType<typeof prepareFinancingComparisonPacket>;
function observe(id: string, input: FinancingComparisonPacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareFinancingComparisonPacket(input);
  const observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
const at = (p: Packet, caseId: string) => p.comparison.cases.find((c) => c.caseId === caseId)!;
const rows = (p: Packet, caseId: string, pick: (m: Packet["comparison"]["cases"][number]["proposals"][number]) => unknown) =>
  at(p, caseId).proposals.map((m) => [names[m.proposalId], pick(m)]);

function goldCases(): Case[] {
  const packet = prepareFinancingComparisonPacket(sealed());
  const reuse = (id: string, expected: unknown, select: (p: Packet) => unknown): Case => {
    const input = sealed(), observed = JSON.stringify(select(packet)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(packet), passed: expectation === observed};
  };
  return [
    // Expectations come from the independent Python oracle (outputs/fichas-ensaio-2026-10/C02/resultados.json).
    reuse("c02-three-proposals-independent-oracle", [
      ["itau", [4, 3.5, 13.2636, 1.9475, 51.892, 81.3197]], ["santander", [4.0047, 4, 19.4592, 1.9071, 52.4246, 81.6387]], ["fundo", [3.5475, 4.75, 20.7828, 1.8788, 51.2504, 80.5113]]],
      (p) => rows(p, "base", (m) => [pct(m.equivalentSpread), r(m.weightedAverageLifeYears), r(m.minimumCash.amount), r(m.covenant.worstRatio), r(m.horizonFinancingCost), r(m.netDebtAtHorizon)])),
    reuse("bank-stress-independent-oracle", [
      ["itau", [-0.261, "2028-12-31", 2.4513, 0.5487, 94.8443]], ["santander", [8.17, "2028-12-31", 2.4368, 0.5632, 95.1633]], ["fundo", [9.7266, "2028-12-31", 2.3936, 0.3564, 93.6068]]],
      (p) => rows(p, "bank-stress", (m) => [r(m.minimumCash.amount), m.minimumCash.periodId, r(m.covenant.worstRatio), r(m.covenant.headroom), r(m.netDebtAtHorizon)])),
    reuse("lowest-nominal-spread-is-not-the-lowest-cost", {misleads: true, lowestCost: "fundo"},
      (p) => ({misleads: p.comparison.nominalSpreadMisleads, lowestCost: names[at(p, "base").lowestEquivalentCostProposalId!]})),
    reuse("cash-below-zero-eliminates-before-preference", {facts: [["itau", ["cash_below_zero"]], ["santander", []], ["fundo", []]], everyCase: ["santander", "fundo"], changing: ["bank-stress"]},
      (p) => ({facts: rows(p, "bank-stress", (m) => m.eliminatoryFacts), everyCase: p.comparison.viableInEveryCaseProposalIds.map((id) => names[id]), changing: p.comparison.conclusionChangingCaseIds})),
    reuse("below-policy-minimum-conditions-without-eliminating", {facts: [["itau", [[], ["cash_below_policy_minimum"]]], ["santander", [[], []]], ["fundo", [[], []]]], viable: ["itau", "santander", "fundo"]},
      (p) => ({facts: rows(p, "base", (m) => [m.eliminatoryFacts, m.conditioningFacts]), viable: at(p, "base").viableProposalIds.map((id) => names[id])})),
    reuse("covenant-test-frequency-per-year", [["itau", 2], ["santander", 1], ["fundo", 2]], (p) => rows(p, "base", (m) => m.covenantTestsPerYear)),
    reuse("each-covenant-on-its-own-definition-and-limit", [["itau", [3, 1.0525]], ["santander", [3, 1.0929]], ["fundo", [2.75, 0.8712]]],
      (p) => rows(p, "base", (m) => [r(new D(m.covenant.worstRatio).plus(m.covenant.headroom).toFixed()), r(m.covenant.headroom)])),
    reuse("collateral-consumed-reduces-free-receivables", [["itau", [28, 30]], ["santander", [21, 37]], ["fundo", [0, 58]]],
      (p) => rows(p, "base", (m) => [r(m.collateralConsumed), r(m.freeReceivablesAfter)])),
    reuse("debt-service-in-2028", [["itau", 64.3725], ["santander", 56.1175], ["fundo", 56.7119]],
      (p) => rows(p, "base", (m) => r(m.debtServiceByYear["2028"]!))),
    reuse("cheapest-and-safest-shown-side-by-side", {cost: "fundo", cash: "fundo", stressCash: "fundo"},
      (p) => ({cost: names[at(p, "base").lowestEquivalentCostProposalId!], cash: names[at(p, "base").highestMinimumCashProposalId!], stressCash: names[at(p, "bank-stress").highestMinimumCashProposalId!]})),
    (() => {
      const input = c02PacketInput({negotiated: true}).seal() as FinancingComparisonPacketInput; input.cases = [input.cases[0]!];
      return observe("negotiated-variants-move-the-cost", input, [["itau-negotiated", 3.82], ["santander-230", 3.74]],
        (p) => rows(p, "base", (m) => new D(m.equivalentSpread!).times(100).toDecimalPlaces(2).toNumber()));
    })(),
    observe("collateral-above-company-rule-eliminates", withCollateralRule("0.4"), {facts: [["itau", ["collateral_above_policy"]], ["santander", []], ["fundo", []]], viable: ["santander", "fundo"]},
      (p) => ({facts: rows(p, "base", (m) => m.eliminatoryFacts), viable: at(p, "base").viableProposalIds.map((id) => names[id])})),
    (() => {
      const input = baseOnly(); const fundo = input.cases[0]!.analysis.proposals.find((x) => x.id === c02Ids.fundo)!;
      fundo.lifetime.upfrontWithheldCosts = {...fundo.lifetime.upfrontWithheldCosts, decisionId: null, missingReason: "Comissão do fundo não adotada"};
      return observe("absent-fee-is-a-gap-not-zero", input, {status: "framed", gap: true, compared: false},
        (p) => ({status: p.status, gap: p.gaps.some((g) => g.reason === "Comissão do fundo não adotada"), compared: p.cases[0]!.result.comparison !== null}));
    })(),
  ];
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = sealed(); for (const c of i.cases) c.analysis.envelope = {...c.analysis.envelope, canonical: c.analysis.envelope.canonical.replace("\"0.34\"", "\"0.15\"")}; return i;}, "adoption_basis_integrity_mismatch"],
    ["undeclared-inheritance", () => {const i = sealed(); delete (i.cases[1]!.analysis as {inheritedScenario?: string}).inheritedScenario; return i;}, "analysis_basis_context_mismatch"],
    ["base-inherits", () => {const i = sealed(); i.cases[0]!.analysis.inheritedScenario = "bank-stress"; return i;}, "The base case inherits nothing"],
    ["two-bases", () => {const i = sealed(); (i.cases[1] as {role: string}).role = "base"; return i;}, "Exactly one base case is required"],
    ["silent-stress", () => {const i = sealed(); i.cases[1]!.changes = []; return i;}, "must say what it changes"],
    ["different-proposals-across-cases", () => {const i = sealed(); i.cases[1]!.analysis.proposals = i.cases[1]!.analysis.proposals.slice(0, 2); return i;}, "same proposals"],
    ["mixed-currency", () => {const i = sealed(); i.cases[1]!.analysis = {...i.cases[1]!.analysis, currency: "USD"}; return i;}, "same adopted basis"],
    ["accrued-coupon-without-payment-schedule", () => {const i = baseOnly(); delete (i.cases[0]!.analysis.proposals[2]!.terms as {paysAccruedCoupon?: unknown}).paysAccruedCoupon; return i;}, "comparison_accrued_coupon_schedule_mismatch"],
    ["free-result-in-request", () => ({...sealed(), equivalentSpread: "0.01"}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: true}), "grantsExecution"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      if ((input as {forge?: boolean}).forge) {
        const packet = prepareFinancingComparisonPacket(baseOnly());
        financingComparisonPacketOutputSchema.parse({...packet, grantsExecution: true});
      } else prepareFinancingComparisonPacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  return [sealed(), baseOnly()].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareFinancingComparisonPacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareFinancingComparisonPacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`,
        expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed",
        inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildFinancingComparisonRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()},
    {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: financingComparisonRunIds[kind], kind,
      method: {id: "compare-financing-proposals", version: financingComparisonMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareFinancingComparisonPacket"},
      harness: {module: "@offroad/financial-model/src/financing-comparison-runs.test-support.ts", exportName: "buildFinancingComparisonRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C02. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
