import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {covenantHeadroomPacketOutputSchema, prepareCovenantHeadroomPacket, type CovenantHeadroomPacketInput} from "./covenant-headroom-packet";
import {auroraCovenantBasis} from "./covenant-headroom.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic
// calibrations of ficha C12 (modelo_c12.py), never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const r = (v: string | null | undefined, p = 2) => v == null ? null : new D(v).toDecimalPlaces(p).toNumber();
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
type Packet = ReturnType<typeof prepareCovenantHeadroomPacket>;
export const covenantHeadroomMethodVersion = "2026.10.23-v1";
export const covenantHeadroomRunIds = {
  gold: "measure-covenant-headroom-2026-10-23-v1-gold",
  adversarial: "measure-covenant-headroom-2026-10-23-v1-adversarial",
  consistency: "measure-covenant-headroom-2026-10-23-v1-consistency",
} as const;
const question = "Como estamos contra os covenants?";
type Options = Parameters<typeof auroraCovenantBasis>[0];
type Basis = ReturnType<typeof auroraCovenantBasis>;
const packetInput = (o: Options = {}, edit: (f: Basis) => void = () => undefined): CovenantHeadroomPacketInput => {
  const f = auroraCovenantBasis(o); edit(f);
  return {schemaVersion: "covenant-headroom-packet-input.v1", question, headlineMeasurementId: "dez26-base", analysis: f.seal()} as CovenantHeadroomPacketInput;
};
function observe(id: string, input: CovenantHeadroomPacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareCovenantHeadroomPacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
const at = (p: Packet, id: string) => p.result.headroom!.measurements.find((m) => m.id === id)!;
const test = (p: Packet, id: string, limit: string) => at(p, id).tests.find((t) => t.limitId === limit)!;

function goldCases(): Case[] {
  const base = () => packetInput(), packet = prepareCovenantHeadroomPacket(base());
  const reuse = (id: string, expected: unknown, select: (p: Packet) => unknown): Case => {
    const observed = JSON.stringify(select(packet)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(base()), outputFingerprint: fingerprint(packet), passed: expectation === observed};
  };
  return [
    // Expectations come from the independent Python oracle (outputs/fichas-ensaio-2026-10/C12/resultados.json) and the ficha's answer key.
    reuse("december-by-the-indenture-definition", {netDebt: 113.2, ebitda: 51.5, ratio: 2.2},
      (p) => ({netDebt: r(at(p, "dez26-base").netDebt, 1), ebitda: r(at(p, "dez26-base").ebitda, 1), ratio: r(at(p, "dez26-base").ratio)})),
    reuse("headroom-in-ebitda-and-net-debt-to-the-covenant", {ebitda: 13.76, netDebt: 41.29},
      (p) => ({ebitda: r(test(p, "dez26-base", "aditamento").ebitdaHeadroom), netDebt: r(test(p, "dez26-base", "aditamento").netDebtHeadroom)})),
    reuse("reverse-test-on-the-unrealized-second-half", {covenant: 52.9, policy: 23.9},
      (p) => ({covenant: r(new D(test(p, "dez26-base", "aditamento").unrealizedEbitdaLossToLimit!).mul(100).toFixed(), 1),
        policy: r(new D(test(p, "dez26-base", "politica").unrealizedEbitdaLossToLimit!).mul(100).toFixed(), 1)})),
    reuse("board-policy-binds-first", {tightest: "politica", headroom: 6.22, policyBindsFirst: true},
      (p) => ({tightest: p.readings!.headline.tightestLimitId, headroom: r(test(p, "dez26-base", "politica").ebitdaHeadroom), policyBindsFirst: p.readings!.policyBindsFirst})),
    reuse("adverse-case-in-december", 2.32, (p) => r(at(p, "dez26-adverso").ratio)),
    reuse("a-larger-season-in-december", {ratio: 2.3, policyHeadroom: 4.2}, (p) => ({ratio: r(at(p, "dez26-safra-30").ratio), policyHeadroom: r(test(p, "dez26-safra-30", "politica").ebitdaHeadroom, 1)})),
    reuse("season-weighs-half-a-turn-at-the-test-date", 0.5, (p) => r(p.result.headroom!.effects[0]!.ratioEffect, 1)),
    reuse("december-2027-base-and-adverse", {base: 1.85, adverse: 2.37, policyHeadroom: 2.33, worst: ["dez27-adverso", "politica"]},
      (p) => ({base: r(at(p, "dez27-base").ratio), adverse: r(at(p, "dez27-adverso").ratio), policyHeadroom: r(test(p, "dez27-adverso", "politica").ebitdaHeadroom),
        worst: [p.readings!.worst!.measurementId, p.readings!.worst!.limitId]})),
    reuse("managerial-june-reading-is-a-contrast", {ratio: 1.73, role: "contrast"}, (p) => ({ratio: r(at(p, "junho-gerencial").ratio), role: at(p, "junho-gerencial").role})),
    reuse("original-indenture-limit-is-superseded", {headroom: 10.33, role: "contrast"},
      (p) => ({headroom: r(test(p, "dez26-escritura-original", "original").ebitdaHeadroom), role: at(p, "dez26-escritura-original").role})),
    reuse("breach-is-not-automatic-and-the-chain-is-named", {acceleration: "non_automatic", process: true, crossDefault: true},
      (p) => ({acceleration: p.result.consequence.acceleration, process: !!p.result.consequence.process, crossDefault: !!p.result.consequence.crossDefault})),
    reuse("unwritten-policy-definition-is-a-question", {open: ["politica"], status: "partial"}, (p) => ({open: p.readings!.openQuestions, status: p.status})),
    observe("turn-two-policy-on-managerial-ebitda", packetInput({policyDefinition: "EBITDA gerencial: CVM 156 com ajustes da gestão, sem descontar arrendamentos", policyOnManagerial: true}),
      {ratio: 2.04, policyHeadroom: 10.2, status: "prepared_for_human_review"},
      (p) => ({ratio: r(at(p, "dez26-politica-gerencial").ratio), policyHeadroom: r(test(p, "dez26-politica-gerencial", "politica").ebitdaHeadroom, 1), status: p.status})),
    (() => {
      const i = packetInput({policyDefinition: "EBITDA da escritura"});
      const cash = i.analysis.measurements[0]!.cash as {decisionId: string | null; missingReason: string | null};
      i.analysis.measurements[0]!.cash = {...cash, decisionId: null, missingReason: "Caixa de dezembro não projetado"} as typeof i.analysis.measurements[0]["cash"];
      return observe("absent-cash-is-a-gap-not-a-default", i, {status: "framed", gap: true},
        (p) => ({status: p.status, gap: p.gaps.some((g) => g.reason === "Caixa de dezembro não projetado")}));
    })(),
  ];
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = packetInput(); i.analysis.envelope = {...i.analysis.envelope, canonical: i.analysis.envelope.canonical.replace('"54.5"', '"64.5"')}; return i;}, "adoption_basis_integrity_mismatch"],
    ["free-result-in-request", () => ({...packetInput(), headroom: {ratio: "1"}}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: true}), "grantsExecution"],
    ["headline-is-a-contrast", () => ({...packetInput(), headlineMeasurementId: "junho-gerencial"}), "headline must be a test measurement"],
    ["measurement-names-unknown-limit", () => {const i = packetInput(); i.analysis.measurements[0] = {...i.analysis.measurements[0]!, limitIds: ["inventado"]}; return i;}, "covenant_unknown_limit"],
    ["effect-across-dates", () => {const i = packetInput(); i.analysis.effects[0] = {...i.analysis.effects[0]!, withoutEffectMeasurementId: "dez27-base"}; return i;}, "covenant_effect_on_other_date"],
    ["test-without-limit", () => {const i = packetInput(); i.analysis.measurements[1] = {...i.analysis.measurements[1]!, limitIds: []}; return i;}, "covenant_test_without_limit"],
    ["unrealized-after-the-test-date", () => ({...packetInput(), analysis: {...packetInput().analysis, readingDate: "2027-01-10"}}), "covenant_unrealized_after_test_date"],
    ["duplicate-measurement", () => {const i = packetInput(); i.analysis.measurements[1] = {...i.analysis.measurements[1]!, id: "dez26-base"}; return i;}, "Duplicate measurement"],
    ["figure-read-in-another-scenario", () => packetInput({}, (f) => {f.entries.find((x) => x.fieldPath.endsWith("measurement.dez27-adverso.cash"))!.dimensions.scenario = "base_2028";}), "analysis_basis_context_mismatch"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      if ((input as {forge?: boolean}).forge) covenantHeadroomPacketOutputSchema.parse({...prepareCovenantHeadroomPacket(packetInput()), grantsExecution: true});
      else prepareCovenantHeadroomPacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  return [packetInput(), packetInput({policyDefinition: "EBITDA gerencial", policyOnManagerial: true})].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareCovenantHeadroomPacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareCovenantHeadroomPacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildCovenantHeadroomRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: covenantHeadroomRunIds[kind], kind, method: {id: "measure-covenant-headroom", version: covenantHeadroomMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareCovenantHeadroomPacket"},
      harness: {module: "@offroad/financial-model/src/covenant-headroom-runs.test-support.ts", exportName: "buildCovenantHeadroomRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C12. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
