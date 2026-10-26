import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {operatingProjectionPacketOutputSchema, prepareOperatingProjectionPacket, type OperatingProjectionPacketInput} from "./operating-projection-packet";
import {auroraProjectionBasis, type AuroraOptions} from "./operating-projection.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic
// calibrations of ficha C24 (modelo_c24.py), never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const r = (v: string | null | undefined, p = 1) => v == null ? null : new D(v).toDecimalPlaces(p, Decimal.ROUND_HALF_UP).toNumber();
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
type Packet = ReturnType<typeof prepareOperatingProjectionPacket>;
export const operatingProjectionMethodVersion = "2026.10.26-v1";
export const operatingProjectionRunIds = {
  gold: "build-operating-projection-2026-10-26-v1-gold",
  adversarial: "build-operating-projection-2026-10-26-v1-adversarial",
  consistency: "build-operating-projection-2026-10-26-v1-consistency",
} as const;
const question = "Não temos projeção pronta. Ajuda a construir uma para discutir o financiamento.";
type Basis = ReturnType<typeof auroraProjectionBasis>;
const packetInput = (o: AuroraOptions = {}, edit: (f: Basis) => void = () => undefined): OperatingProjectionPacketInput => {
  const f = auroraProjectionBasis(o); edit(f);
  return {schemaVersion: "operating-projection-packet-input.v1", question, analysis: f.seal()} as OperatingProjectionPacketInput;
};
function observe(id: string, input: OperatingProjectionPacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareOperatingProjectionPacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
const scenario = (p: Packet, id: string) => p.readings!.projected!.scenarios.find((s) => s.id === id)!;
const within = (value: string, target: number, share: number) => new D(value).minus(target).abs().lte(new D(target).mul(share));

function goldCases(): Case[] {
  const reuseOf = (o: AuroraOptions) => {
    const base = () => packetInput(o), packet = prepareOperatingProjectionPacket(base());
    return (id: string, expected: unknown, select: (p: Packet) => unknown): Case => {
      const observed = JSON.stringify(select(packet)), expectation = JSON.stringify(expected);
      return {id, expectation, observed, inputFingerprint: fingerprint(base()), outputFingerprint: fingerprint(packet), passed: expectation === observed};
    };
  };
  const first = reuseOf({}), second = reuseOf({informed: true});
  // Expectations come from the independent Python oracle (outputs/fichas-ensaio-2026-10/C24/resultados.json) and the ficha's answer key.
  // Revenue is compared at two decimals: 107.5 x 4.1 is 440.75 exactly; the oracle's 440.7 is binary floating point.
  return [
    first("first-version-in-the-first-turn", {status: "prepared_for_human_review", projected: true, years: 3},
      (p) => ({status: p.status, projected: p.readings!.projected !== null, years: p.readings!.projected!.base.length})),
    first("reproduces-the-last-audited-year", {revenue: 420, ebitda: 52, reproduces: true},
      (p) => ({revenue: r(p.readings!.calibration.modeledRevenue), ebitda: r(p.readings!.calibration.modeledEbitda), reproduces: p.readings!.calibration.reproduces})),
    first("base-by-driver-2026-to-2028", {revenue: [440.75, 463.65, 486], ebitda: [54.5, 56.6, 58.8], margin: [12.4, 12.2, 12.1]},
      (p) => ({revenue: p.readings!.projected!.base.map((x) => r(x.revenue, 2)), ebitda: p.readings!.projected!.base.map((x) => r(x.ebitda)),
        margin: p.readings!.projected!.base.map((x) => r(new D(x.margin!).mul(100).toFixed())) })),
    first("ebitda-within-five-percent-of-the-answer-key", [true, true, true],
      (p) => p.readings!.projected!.base.map((x, i) => within(x.ebitda, [54.5, 56.6, 58.8][i]!, 0.05))),
    first("cash-available-near-sixty-percent-of-ebitda", {cash: [33.1, 33.4, 34.9], conversion: [61, 59, 59], workingCapital: [2.9, 3.2, 3.1]},
      (p) => ({cash: p.readings!.projected!.base.map((x) => r(x.cashAvailableForDebt)), conversion: p.readings!.projected!.base.map((x) => r(new D(x.conversion!).mul(100).toFixed(), 0)),
        workingCapital: p.readings!.projected!.base.map((x) => r(x.changeInWorkingCapital))})),
    first("budget-and-revision-side-by-side-with-the-cause", [["orcamento", "approved", "58", 3.49, true], ["revisao-julho", "under_review", "55.5", 0.99, true]],
      (p) => p.readings!.projected!.comparisons.map((c) => [c.versionId, c.status, c.companyValue, r(c.difference, 2), c.cause !== null])),
    first("sensitivities-in-reais-2027", {price: 4.64, inputCost: 1.14, receivableDay: 1.29},
      (p) => {const s = p.readings!.projected!.sensitivities[1]!; return {price: r(s.ebitdaPerOnePercentPrice, 2), inputCost: r(s.ebitdaLossPerOnePercentInputCost, 2), receivableDay: r(s.workingCapitalPerReceivableDay, 2)};}),
    first("wheat-shock-with-six-month-pass-through", {ebitda: 48.1, cash: 26.5, price: 4.293},
      (p) => {const x = scenario(p, "trigo-repasse-6m").rows[1]!, c = p.result.projection!.projection!.scenarios.find((s) => s.id === "trigo-repasse-6m")!.rows[1]!;
        return {ebitda: r(x.ebitda), cash: r(x.cashAvailableForDebt), price: r(c.netUnitPrice, 3)};}),
    first("wheat-shock-without-pass-through-in-the-year", {ebitda: [54.5, 39.5, 58.8], cash2027: 22.1},
      (p) => ({ebitda: scenario(p, "trigo-sem-repasse").rows.map((x) => r(x.ebitda)), cash2027: r(scenario(p, "trigo-sem-repasse").rows[1]!.cashAvailableForDebt)})),
    first("volume-two-percent-lower", {ebitda: 53.8, cash: 31.6}, (p) => ({ebitda: r(scenario(p, "volume-menor").rows[1]!.ebitda), cash: r(scenario(p, "volume-menor").rows[1]!.cashAvailableForDebt)})),
    first("assumptions-kept-apart-from-data", {data: "2025-12-31", dataAreDocuments: true, projectedAreAssumptions: true},
      (p) => ({data: [...new Set(p.readings!.ledger.filter((l) => l.nature === "data").map((l) => l.periodId))].join(),
        dataAreDocuments: p.readings!.ledger.filter((l) => l.nature === "data").every((l) => l.origin === "document"),
        projectedAreAssumptions: p.readings!.ledger.filter((l) => l.periodId !== "2025-12-31").every((l) => l.nature === "assumption")})),
    observe("estimated-informed-and-house-history-is-not-data", packetInput({history: {drivers: "estimate", revenue: "informed", ebitda: "house"}}),
      {reproduces: true, documented: false, historyData: 0, origins: ["estimate", "informed", "house"]},
      (p) => {const h = p.readings!.ledger.filter((l) => l.periodId === "2025-12-31");
        return {reproduces: p.readings!.calibration.reproduces, documented: p.readings!.calibration.documented, historyData: h.filter((l) => l.nature === "data").length,
          origins: [...new Set(h.map((l) => l.origin))]};}),
    second("scenario-changes-carry-their-origin", {informado: [["volumeGrowthRate", "informed", "assumption"], ["receivableDays", "informed", "assumption"]],
      shock: [["inputCostShock", "informed", "assumption"]]},
      (p) => ({informado: scenario(p, "informado").changes.map((c) => [c.item, c.origin, c.nature]),
        shock: scenario(p, "informado-trigo-4m").changes.map((c) => [c.item, c.origin, c.nature])})),
    first("at-most-three-questions-volume-pass-through-receivable-days", ["volume", "pass_through", "receivable_days"], (p) => p.readings!.questions),
    second("turn-two-informed-drivers", {ebitda: [55.3, 58.4, 61.7], questions: []},
      (p) => ({ebitda: scenario(p, "informado").rows.map((x) => r(x.ebitda)), questions: p.readings!.questions})),
    second("turn-two-sixty-day-receivables-drain-cash", {workingCapital: 15.6, baseWorkingCapital: 2.9, cash: 21, effect: 12.7},
      (p) => ({workingCapital: r(p.result.projection!.projection!.scenarios.find((s) => s.id === "informado")!.rows[0]!.changeInWorkingCapital),
        baseWorkingCapital: r(p.readings!.projected!.base[0]!.changeInWorkingCapital), cash: r(scenario(p, "informado").rows[0]!.cashAvailableForDebt),
        effect: r(scenario(p, "informado").rows[0]!.effects.changeInWorkingCapital)})),
    second("turn-two-wheat-shock-with-four-month-pass-through", {ebitda: 52.6, cash: 27.7},
      (p) => ({ebitda: r(scenario(p, "informado-trigo-4m").rows[1]!.ebitda), cash: r(scenario(p, "informado-trigo-4m").rows[1]!.cashAvailableForDebt)})),
    observe("projection-withheld-when-the-last-year-is-not-reproduced", packetInput({fixedCosts2025: "70"}), {status: "framed", reproduces: false, projected: null},
      (p) => ({status: p.status, reproduces: p.readings!.calibration.reproduces, projected: p.readings!.projected})),
    observe("unexplained-difference-is-an-open-question", packetInput({cause: false}), {status: "partial", open: ["orcamento", "revisao-julho"], companyValues: ["58", "55.5"]},
      (p) => ({status: p.status, open: p.readings!.openQuestions, companyValues: p.readings!.projected!.comparisons.map((c) => c.companyValue)})),
    (() => {
      const i = packetInput();
      const s = i.analysis.base.drivers.fixedCosts as {decisionId: string | null; missingReason: string | null};
      i.analysis.base.drivers.fixedCosts = {...s, decisionId: null, missingReason: "Custos fixos projetados não informados"} as typeof i.analysis.base.drivers.fixedCosts;
      return observe("absent-driver-is-a-gap-not-a-default", i, {status: "framed", gap: true},
        (p) => ({status: p.status, gap: p.gaps.some((g) => g.reason === "Custos fixos projetados não informados")}));
    })(),
  ];
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = packetInput(); i.analysis.envelope = {...i.analysis.envelope, canonical: i.analysis.envelope.canonical.replace('"420"', '"440"')}; return i;}, "adoption_basis_integrity_mismatch"],
    ["free-result-in-request", () => ({...packetInput(), projection: {ebitda: "62"}}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: true}), "grantsExecution"],
    ["single-growth-rate-instead-of-drivers", () => {const i = packetInput(); return {...i, analysis: {...i.analysis, revenueGrowthRate: "0.063"}};}, "Unrecognized key"],
    ["company-version-built-by-the-house", () => packetInput({}, (f) => {f.entries.find((x) => x.fieldPath.endsWith("version.orcamento.origin"))!.value = {type: "text", value: "house"};}), "operating_projection_company_version_not_from_company"],
    ["scenario-based-on-a-later-scenario", () => {const i = packetInput(); i.analysis.scenarios[0] = {...i.analysis.scenarios[0]!, basedOn: "volume-menor"}; return i;}, "operating_projection_unknown_scenario"],
    ["two-volume-rules-in-one-scenario", () => packetInput({informed: true}, (f) => {
      const s = f.input.scenarios.find((x) => x.id === "informado")!;
      s.volumeFactor = {value: f.contribute("scenario.informado.volumeFactor", "ratio", {type: "number", value: "0.98"}, "informado"),
        origin: f.contribute("scenario.informado.volumeFactor.origin", "origin", {type: "text", value: "house"}, "informado")};
    }), "operating_projection_volume_rule_conflict"],
    ["shock-from-a-period-not-projected", () => packetInput({}, (f) => {f.entries.find((x) => x.fieldPath.endsWith("scenario.trigo-repasse-6m.shock.fromPeriodEnd"))!.value = {type: "date", value: "2030-12-31"};}), "operating_projection_unknown_period"],
    ["pass-through-lag-beyond-a-year", () => packetInput({}, (f) => {f.entries.find((x) => x.fieldPath.endsWith("scenario.trigo-repasse-6m.shock.passThroughLagMonths"))!.value = {type: "number", value: "18"};}), "operating_projection_pass_through_lag"],
    ["driver-column-shorter-than-the-horizon", () => packetInput({}, (f) => {f.entries.find((x) => x.fieldPath.endsWith("base.volume"))!.value = {type: "list", value: ["107.5", "110"]};}), "operating_projection_column_length"],
    ["negative-volume", () => packetInput({}, (f) => {f.entries.find((x) => x.fieldPath.endsWith("base.volume"))!.value = {type: "list", value: ["-107.5", "110", "112.5"]};}), "Invalid string"],
    ["duplicate-scenario", () => {const i = packetInput(); i.analysis.scenarios[1] = {...i.analysis.scenarios[1]!, id: "trigo-repasse-6m"}; return i;}, "Duplicate scenario"],
    ["scenario-reuses-the-base-scenario-key", () => {const i = packetInput(); i.analysis.scenarios[0] = {...i.analysis.scenarios[0]!, scenario: "base"}; return i;}, "Each scenario needs its own scenario key"],
    ["figure-read-in-another-scenario", () => packetInput({}, (f) => {f.entries.find((x) => x.fieldPath.endsWith("scenario.prazo-60.override.receivableDays"))!.dimensions.scenario = "volume-menor";}), "analysis_basis_context_mismatch"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      if ((input as {forge?: boolean}).forge) operatingProjectionPacketOutputSchema.parse({...prepareOperatingProjectionPacket(packetInput()), grantsExecution: true});
      else prepareOperatingProjectionPacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  return [packetInput(), packetInput({informed: true})].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareOperatingProjectionPacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareOperatingProjectionPacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildOperatingProjectionRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: operatingProjectionRunIds[kind], kind, method: {id: "build-operating-projection", version: operatingProjectionMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareOperatingProjectionPacket"},
      harness: {module: "@offroad/financial-model/src/operating-projection-runs.test-support.ts", exportName: "buildOperatingProjectionRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C24. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
