import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {prepareWeeklyCashPacket, weeklyCashPacketOutputSchema, type WeeklyCashPacketInput} from "./weekly-cash-packet";
import {auroraWeeklyCashBasis} from "./weekly-cash.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic
// calibrations of ficha C18 (modelo_c18.py), never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const r = (v: string | null | undefined, p = 1) => v == null ? null : new D(v).toDecimalPlaces(p).toNumber();
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
type Packet = ReturnType<typeof prepareWeeklyCashPacket>;
export const weeklyCashMethodVersion = "2026.10.23-v1";
export const weeklyCashRunIds = {
  gold: "project-weekly-cash-2026-10-23-v1-gold",
  adversarial: "project-weekly-cash-2026-10-23-v1-adversarial",
  consistency: "project-weekly-cash-2026-10-23-v1-consistency",
} as const;
const question = "Como fica o caixa até dezembro e o que vence?";
type Basis = ReturnType<typeof auroraWeeklyCashBasis>;
const packetInput = (edit: (f: Basis) => void = () => undefined, after: (i: WeeklyCashPacketInput) => void = () => undefined): WeeklyCashPacketInput => {
  const f = auroraWeeklyCashBasis(); edit(f);
  const i = {schemaVersion: "weekly-cash-packet-input.v1", question, analysis: f.seal()} as WeeklyCashPacketInput; after(i); return i;
};
function observe(id: string, input: WeeklyCashPacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareWeeklyCashPacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
const at = (p: Packet, id: string) => p.result.weekly!.cases.find((c) => c.id === id)!;

function goldCases(): Case[] {
  const base = () => packetInput(), packet = prepareWeeklyCashPacket(base());
  const reuse = (id: string, expected: unknown, select: (p: Packet) => unknown): Case => {
    const observed = JSON.stringify(select(packet)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(base()), outputFingerprint: fingerprint(packet), passed: expectation === observed};
  };
  return [
    // Expectations come from the independent Python oracle (outputs/fichas-ensaio-2026-10/C18/resultados.json) and the ficha's answer key.
    reuse("tightest-week-is-the-week-of-21-december", {week: "2026-12-21", closing: 7.5, withinTolerance: true},
      (p) => ({week: p.readings!.tightestWeek.weekStart, closing: r(p.readings!.tightestWeek.closing), withinTolerance: new D(p.readings!.tightestWeek.closing).minus("7.5").abs().lte(2)})),
    reuse("two-weeks-under-the-minimum", ["2026-12-14", "2026-12-21"], (p) => p.readings!.weeksBelowMinimum),
    reuse("causes-named-across-the-weeks-under-the-minimum", [["Debênture 2021, amortização", 15], ["Debênture 2021, juros semestrais", 5.1], ["Impostos sobre vendas (saldo a pagar)", 2.4],
      ["13º salário, 2ª parcela e encargos", 2.1], ["CCB Bradesco, juros trimestrais", 1.7], ["Finame (principal e juros)", 0.8], ["INSS", 0.5]],
      (p) => p.readings!.causes.map((c) => [c.label, r(c.amount)])),
    reuse("december-closing-reconciles-with-the-projection", {weekly: 16.1, projection: 16, near: true},
      (p) => ({weekly: r(p.result.weekly!.reconciliation!.weekly), projection: r(p.result.weekly!.reconciliation!.projection), near: new D(p.result.weekly!.reconciliation!.difference).abs().lt("0.5")})),
    reuse("closing-hides-the-week", true, (p) => p.readings!.closingHidesTheWeek),
    reuse("calendar-of-what-falls-due-by-31-december", {debt15dec: [["CCB Bradesco, juros trimestrais", 1.7], ["Debênture 2021, amortização", 15], ["Debênture 2021, juros semestrais", 5.1], ["Finame (principal e juros)", 0.8]],
      thirteenth: [["2026-11-30", 1.5], ["2026-12-18", 2.1]]},
      (p) => ({debt15dec: p.result.weekly!.calendar.filter((x) => x.category === "debt" && x.date === "2026-12-15").map((x) => [x.label, r(x.amount)]),
        thirteenth: p.result.weekly!.calendar.filter((x) => x.label.startsWith("13º")).map((x) => [x.date, r(x.amount)])})),
    reuse("actions-costed-for-the-time-in-use", [["conta-garantida", 0.12], ["antecipacao", 0.25], ["linha-25", 0.87]],
      (p) => p.readings!.actionsByCost.map((a) => [a.id, r(a.cost, 2)])),
    observe("same-label-streams-stay-distinct-causes", packetInput((f) => {f.entries.find((x) => x.fieldPath.endsWith("stream.debenture-juros.label"))!.value = {type: "text", value: "Debênture 2021, amortização"};}),
      [["debenture-amortizacao", 15], ["debenture-juros", 5.1]], (p) => p.readings!.causes.filter((c) => c.label === "Debênture 2021, amortização").map((c) => [c.streamId, r(c.amount)])),
    observe("two-actions-in-one-case-prove-neither-covers-alone", packetInput((f) => undefined, (i) => {
      i.analysis.cases = [...i.analysis.cases.filter((c) => c.id !== "conta-garantida" && c.id !== "antecipacao"),
        {id: "ambas", label: "Saque e antecipação", role: "alternative", streamIds: [...i.analysis.cases[0]!.streamIds, "conta-garantida", "antecipacao"]}];
    }), {cheapest: "linha-25", covers: [["conta-garantida", false], ["antecipacao", false], ["linha-25", true]]},
      (p) => ({cheapest: p.readings!.cheapestCoveringAction!.id, covers: p.readings!.actionsByCost.map((a) => [a.id, a.covers])})),
    reuse("cheapest-covering-action-is-the-existing-overdraft", {id: "conta-garantida", worst: 15.5}, (p) => ({id: p.readings!.cheapestCoveringAction!.id, worst: r(at(p, "conta-garantida").minimum.closing)})),
    reuse("overdraft-open-at-the-covenant-test-nets-to-zero", {open: true, effect: {grossDebt: "8", cash: "8", netDebt: "0"}},
      (p) => ({open: p.readings!.cheapestCoveringAction!.openAtCovenantTest, effect: p.result.weekly!.actions[0]!.covenantEffect})),
    reuse("a-harvest-of-30-million", {minimum: 2.5, weeks: 3}, (p) => ({minimum: r(at(p, "safra-30").minimum.closing), weeks: at(p, "safra-30").weeksBelowMinimum.length})),
    reuse("harvest-delayed-two-weeks", {minimum: 12, closing: 18.4}, (p) => ({minimum: r(at(p, "safra-adiada").minimum.closing), closing: r(at(p, "safra-adiada").closing)})),
    reuse("without-the-harvest-line", {minimum: -9.5, closing: -0.9}, (p) => ({minimum: r(at(p, "sem-linha").minimum.closing), closing: r(at(p, "sem-linha").closing)})),
    (() => {
      const i = packetInput() as WeeklyCashPacketInput & {analysis: {minimumCash: {decisionId: string | null; missingReason: string | null}}};
      i.analysis.minimumCash = {...i.analysis.minimumCash, decisionId: null, missingReason: "Caixa mínimo não informado"};
      return observe("absent-minimum-is-a-gap-not-a-default", i, {status: "framed", gap: true},
        (p) => ({status: p.status, gap: p.gaps.some((g) => g.reason === "Caixa mínimo não informado")}));
    })(),
  ];
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = packetInput(); i.analysis.envelope = {...i.analysis.envelope, canonical: i.analysis.envelope.canonical.replace('"41"', '"51"')}; return i;}, "adoption_basis_integrity_mismatch"],
    ["free-result-in-request", () => ({...packetInput(), weekly: {cases: []}}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: true}), "grantsExecution"],
    ["case-names-unknown-stream", () => {const i = packetInput(); i.analysis.cases[0] = {...i.analysis.cases[0]!, streamIds: [...i.analysis.cases[0]!.streamIds, "inventado"]}; return i;}, "names a stream the analysis does not carry"],
    ["two-informed-cases", () => {const i = packetInput(); i.analysis.cases[1] = {...i.analysis.cases[1]!, role: "informed"}; return i;}, "weekly_cash_one_informed_case"],
    ["horizon-not-whole-weeks", () => {const i = packetInput(); i.analysis = {...i.analysis, endDate: "2027-01-04"}; return i;}, "weekly_cash_horizon_not_whole_weeks"],
    ["event-outside-the-horizon", () => packetInput((f) => {const e = f.entries.find((x) => x.fieldPath.endsWith("stream.ccb-juros.dates"))!; e.value = {type: "list", value: ["2026-09-15", "2027-03-15"]};}), "weekly_cash_event_outside_horizon"],
    ["dates-and-amounts-of-different-length", () => packetInput((f) => {const e = f.entries.find((x) => x.fieldPath.endsWith("stream.ccb-juros.amounts"))!; e.value = {type: "list", value: ["1.7"]};}), "weekly_cash_stream_series"],
    ["action-on-an-operating-stream", () => {const i = packetInput(); i.analysis.actions[0] = {...i.analysis.actions[0]!, streamId: "folha"}; return i;}, "weekly_cash_action_stream"],
    ["action-with-two-draws", () => packetInput((f) => {f.entries.find((x) => x.fieldPath.endsWith("stream.conta-garantida.dates"))!.value = {type: "list", value: ["2026-12-14", "2026-12-21"]};
      f.entries.find((x) => x.fieldPath.endsWith("stream.conta-garantida.amounts"))!.value = {type: "list", value: ["4", "4"]};}), "weekly_cash_action_single_draw"],
    ["action-days-off-its-dates", () => packetInput((f) => {f.entries.find((x) => x.fieldPath.endsWith("action.conta-garantida.days"))!.value = {type: "number", value: "30"};}), "weekly_cash_action_days_mismatch"],
    ["obligation-declared-without-its-stream", () => packetInput((f) => {f.entries.find((x) => x.fieldPath.endsWith("coverage.thirteenth_salary"))!.value = {type: "text", value: "not_applicable"};}), "weekly_cash_obligation_stream_without_declaration"],
    ["action-stream-without-its-costed-action", () => {const i = packetInput(); i.analysis.actions = i.analysis.actions.filter((a) => a.id !== "antecipacao"); return i;}, "weekly_cash_action_stream_without_action"],
    ["figure-read-in-another-scenario", () => packetInput((f) => {f.entries.find((x) => x.fieldPath.endsWith("stream.folha.amounts"))!.dimensions.scenario = "adverse";}), "analysis_basis_context_mismatch"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      if ((input as {forge?: boolean}).forge) weeklyCashPacketOutputSchema.parse({...prepareWeeklyCashPacket(packetInput()), grantsExecution: true});
      else prepareWeeklyCashPacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  const informedOnly = () => {const i = packetInput(); i.analysis.cases = [i.analysis.cases[0]!]; i.analysis.actions = []; return i;};
  return [packetInput(), informedOnly()].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareWeeklyCashPacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareWeeklyCashPacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildWeeklyCashRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: weeklyCashRunIds[kind], kind, method: {id: "project-weekly-cash", version: weeklyCashMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareWeeklyCashPacket"},
      harness: {module: "@offroad/financial-model/src/weekly-cash-runs.test-support.ts", exportName: "buildWeeklyCashRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C18. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
