import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {investmentDecisionPacketOutputSchema, prepareInvestmentDecisionPacket, type InvestmentDecisionPacketInput} from "./investment-decision-packet";
import {c32PacketInput} from "./investment-decision-packet.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic
// calibrations of ficha C32 (projeto_embalagem.py), never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const mi = (v: string | null, places = 1) => v === null ? null : new D(v).div(1000000).toDecimalPlaces(places).toNumber();
const pct = (v: string | null) => v === null ? null : new D(v).times(100).toDecimalPlaces(1).toNumber();
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
export const investmentDecisionMethodVersion = "2026.10.09-v2";
export const investmentDecisionRunIds = {
  gold: "investment-project-2026-10-09-v2-gold",
  adversarial: "investment-project-2026-10-09-v2-adversarial",
  consistency: "investment-project-2026-10-09-v2-consistency",
} as const;

const sealed = (o: {quantum?: string} = {}) => {const f = c32PacketInput(o); f.seal(); return f.input;};
/** C32 with company EBITDA of R$ 100 mi a year: every period close exceeds the opening balance. */
const strongCompany = () => {
  const f = c32PacketInput(), e = f.basis.entries.find(x => x.fieldPath.endsWith(".company.ebitda") && x.dimensions.scenario === "base")!;
  e.value = {type: "list", value: (e.value as {value: string[]}).value.map(() => "100000000")}; f.seal(); return f.input;
};
type Packet = ReturnType<typeof prepareInvestmentDecisionPacket>;
function observe(id: string, input: InvestmentDecisionPacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareInvestmentDecisionPacket(input);
  const observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
const metric = (p: Packet, id: string) => p.comparison.metrics.find(m => m.caseId === id)!;

function goldCases(): Case[] {
  return [
    // Expectations come from the independent Python oracle (outputs/fichas-ensaio-2026-10/C32/projeto_resultados.json).
    observe("c32-five-cases-independent-oracle", sealed({quantum: "10000"}), [
      ["base", 0.7, 15.8, 5.9], ["economy-4", -6.3, 7.7, 8.2], ["capex-120", -2.1, 13, 6.4], ["slower-start", -1, 14, 6.3], ["defer-12", 1.4, 16.7, 6.7]],
      p => p.comparison.metrics.map(m => [m.caseId, mi(m.netPresentValue), pct(m.annualIrr), new D(m.paybackYears!).toDecimalPlaces(1).toNumber()])),
    observe("startup-working-capital-of-verticalization", sealed(), {startup: "5812500", lostSupplierCredit: "5000000"},
      p => ({startup: metric(p, "base").startupWorkingCapital, lostSupplierCredit: (p.cases[0]!.result.startupCapital as unknown as {lostSupplierCredit: string}).lostSupplierCredit})),
    observe("eleven-annual-flows-after-tax-maintenance-and-working-capital", sealed(), [-10, -11.66, 4.13, 4.3, 4.47, 4.64, 4.83, 5.02, 5.22, 5.43, 11.46],
      p => (p.cases[0]!.result.project!.rows as unknown as {unleveredCashFlow: string}[]).map(r => mi(r.unleveredCashFlow, 2))),
    observe("premises-that-change-the-conclusion", sealed(), {changing: ["economy-4", "capex-120", "slower-start"], timing: ["defer-12"]},
      p => ({changing: p.comparison.conclusionChangingCaseIds, timing: p.comparison.timingCaseIds})),
    observe("cash-consumed-before-payback", sealed(), {amount: -21.66, periodEndDate: "2027-12-31"},
      p => ({amount: mi(metric(p, "base").peakCumulativeCashNeed!.amount, 2), periodEndDate: metric(p, "base").peakCumulativeCashNeed!.periodEndDate})),
    observe("return-near-cost-of-capital-is-marginal", sealed({quantum: "10000"}), {irrMinusDiscountPoints: 0.8, discountRate: "0.15"},
      p => ({irrMinusDiscountPoints: new D(metric(p, "base").irrMinusDiscountRate!).times(100).toDecimalPlaces(1).toNumber(), discountRate: metric(p, "base").discountRate})),
    observe("company-minimum-includes-opening-balance", sealed(), {without: [20, "2025-12-31"], with: [10.74, "2027-12-31"]},
      p => {const c = metric(p, "base").companyMinimumCash!; return {without: [mi(c.withoutProject.amount, 2), c.withoutProject.periodEndDate], with: [mi(c.withProject.amount, 2), c.withProject.periodEndDate]};}),
    observe("opening-balance-is-the-minimum-when-every-close-is-higher", strongCompany(), {without: [20, "2025-12-31"], with: [20, "2025-12-31"]},
      p => {const c = metric(p, "base").companyMinimumCash!; return {without: [mi(c.withoutProject.amount, 2), c.withoutProject.periodEndDate], with: [mi(c.withProject.amount, 2), c.withProject.periodEndDate]};}),
    observe("company-cash-with-and-without-the-project", sealed(), {projectLowersMinimum: true},
      p => {const c = metric(p, "base").companyMinimumCash!; return {projectLowersMinimum: new D(c.withProject.amount).lt(c.withoutProject.amount)};}),
    (() => {
      const input = sealed(); const base = input.cases[0]!.analysis;
      base.valuation.discountRate = {...base.valuation.discountRate, decisionId: null, missingReason: "Custo de capital não adotado"};
      return observe("absent-cost-of-capital-is-a-gap-not-a-default", input, {status: "partial", npv: null, startup: "5812500", gap: true, changing: []},
        p => ({status: p.status, npv: metric(p, "base").netPresentValue, startup: metric(p, "base").startupWorkingCapital,
          gap: p.gaps.some(g => g.caseId === "base" && g.reason === "Custo de capital não adotado"), changing: p.comparison.conclusionChangingCaseIds}));
    })(),
    observe("unrounded-precision-is-the-default", sealed(), {base: 0.73, economy: -6.35},
      p => ({base: mi(metric(p, "base").netPresentValue, 2), economy: mi(metric(p, "economy-4").netPresentValue, 2)})),
  ];
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = sealed(); for (const c of i.cases) c.analysis.envelope = {...c.analysis.envelope, canonical: c.analysis.envelope.canonical.replace("19500000", "9500000")}; return i;}, "adoption_basis_integrity_mismatch"],
    ["undeclared-inheritance", () => {const i = sealed(); delete (i.cases[1]!.analysis as {inheritedScenario?: string}).inheritedScenario; return i;}, "analysis_basis_context_mismatch"],
    ["inherits-another-sensitivity", () => {const i = sealed(); i.cases[2]!.analysis.inheritedScenario = "economy-4"; return i;}, "A case may inherit only the base scenario"],
    ["base-inherits", () => {const i = sealed(); i.cases[0]!.analysis.inheritedScenario = "economy-4"; return i;}, "The base case inherits nothing"],
    ["two-bases", () => {const i = sealed(); (i.cases[1] as {role: string}).role = "base"; return i;}, "Exactly one base case is required"],
    ["mixed-currency", () => {const i = sealed(); i.cases[3]!.analysis = {...i.cases[3]!.analysis, currency: "USD"}; return i;}, "same adopted basis"],
    ["silent-sensitivity", () => {const i = sealed(); i.cases[2]!.changes = []; return i;}, "must say what it changes"],
    ["free-result-in-request", () => ({...sealed(), netPresentValue: "1000000"}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: true}), "grantsExecution"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      if ((input as {forge?: boolean}).forge) {
        const packet = prepareInvestmentDecisionPacket(sealed());
        investmentDecisionPacketOutputSchema.parse({...packet, grantsExecution: true});
      } else prepareInvestmentDecisionPacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  return [sealed(), sealed({quantum: "10000"})].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareInvestmentDecisionPacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareInvestmentDecisionPacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`,
        expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed",
        inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildInvestmentDecisionRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()},
    {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: investmentDecisionRunIds[kind], kind,
      method: {id: "analyze-investment-project", version: investmentDecisionMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareInvestmentDecisionPacket"},
      harness: {module: "@offroad/financial-model/src/investment-decision-runs.test-support.ts", exportName: "buildInvestmentDecisionRuns"},
      modelCalls: 0 as const, cases, result: cases.every(c => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C32. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
