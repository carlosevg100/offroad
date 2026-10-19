import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {debtCapacityPacketOutputSchema, prepareDebtCapacityPacket, type DebtCapacityPacketInput} from "./debt-capacity-packet";
import {c04PacketInput} from "./debt-capacity.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic
// calibrations of ficha C04 (modelo_c04.py), never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const r = (v: string, p = 1) => new D(v).toDecimalPlaces(p).toNumber();
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
export const debtCapacityMethodVersion = "2026.10.19-v2";
export const debtCapacityRunIds = {
  gold: "assess-debt-capacity-2026-10-19-v2-gold",
  adversarial: "assess-debt-capacity-2026-10-19-v2-adversarial",
  consistency: "assess-debt-capacity-2026-10-19-v2-consistency",
} as const;
type Packet = ReturnType<typeof prepareDebtCapacityPacket>;
const sealed = (o: Parameters<typeof c04PacketInput>[0] = {}) => c04PacketInput(o).seal() as DebtCapacityPacketInput;
function observe(id: string, input: DebtCapacityPacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareDebtCapacityPacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
const at = (p: Packet, id: string) => p.cases.find((c) => c.caseId === id)!;
const view = (p: Packet, id: string) => at(p, id).review!.scenarios.map((s) => [r(s.peakLeverage.value, 2), s.peakLeverage.date.slice(0, 4), r(s.minimumCash.value), r(s.minimumInterestCoverage!.value, 2)]);

function goldCases(): Case[] {
  const packet = prepareDebtCapacityPacket(sealed()), bndes = prepareDebtCapacityPacket(sealed({structure: "bndes"}));
  const reuse = (id: string, p: Packet, input: () => DebtCapacityPacketInput, expected: unknown, select: (p: Packet) => unknown): Case => {
    const observed = JSON.stringify(select(p)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(input()), outputFingerprint: fingerprint(p), passed: expectation === observed};
  };
  const base = () => sealed(), withBndes = () => sealed({structure: "bndes"});
  return [
    // Expectations come from the independent Python oracle (outputs/fichas-ensaio-2026-10/C04/resultados.json).
    reuse("c04-capacity-by-limit-independent-oracle", packet, base, [["covenant", 54.8], ["market", 76.8], ["interest", 72]],
      (p) => at(p, "informed").limits.map((l) => [l.id, r(l.capacity!)])),
    reuse("phased-capacity-independent-oracle", packet, base, [["covenant", 79.5], ["market", 108.6], ["interest", 107.6]],
      (p) => at(p, "phased").limits.map((l) => [l.id, r(l.capacity!)])),
    reuse("covenant-with-headroom-binds", packet, base, {informed: "covenant", phased: "covenant"}, (p) => ({informed: at(p, "informed").bindingLimitId, phased: at(p, "phased").bindingLimitId})),
    reuse("sixty-breaks-the-covenant-in-the-adverse-case-as-informed", packet, base, {fits: false, failing: ["covenant"], view: [[2.42, "2028", 13.8, 2.65], [3.12, "2028", -22.3, 2.26]]},
      (p) => ({fits: at(p, "informed").review!.fits, failing: at(p, "informed").review!.failingLimitIds, view: view(p, "informed")})),
    reuse("phasing-makes-sixty-fit-in-size", packet, base, {fits: true, view: [[1.88, "2029", 13.5, 3.17], [2.58, "2029", -21.4, 2.7]]},
      (p) => ({fits: at(p, "phased").review!.fits, view: view(p, "phased")})),
    reuse("size-fits-but-a-five-year-profile-runs-out-of-cash-in-the-adverse-case", packet, base, {fits: true, adverseMinimumCashNegative: true},
      (p) => ({fits: at(p, "phased").review!.fits, adverseMinimumCashNegative: new D(at(p, "phased").review!.scenarios[1]!.minimumCash.value).lt(0)})),
    reuse("bndes-eight-years-keeps-cash-positive", bndes, withBndes, {informed: [[2.39, 25.2], [3.08, 2.4]], phased: [[1.85, 26.3], [2.55, 3.4]]},
      (p) => ({informed: view(p, "informed").map((v) => [v[0], v[2]]), phased: view(p, "phased").map((v) => [v[0], v[2]])})),
    reuse("plan-pays-scheduled-principal-without-refinancing", packet, base, {date: "2029-12-31", scheduled: 22.67, afterInterest: 23.56, pays: true},
      (p) => {const y = at(p, "informed").plan!.find((x) => x.date === "2029-12-31")!; return {date: y.date, scheduled: r(y.scheduledExistingPrincipal, 2), afterInterest: r(y.cashAfterInterest, 2), pays: y.paysWithoutRefinancing};}),
    reuse("window-ends-with-the-seasonal-line-open", packet, base, {calibrationOnly: true}, (p) => ({calibrationOnly: at(p, "informed").calibrationOnly})),
    (() => {
      const i = sealed(); const rule = i.cases[0]!.analysis.scenarios[0]!.rules[0]!;
      rule.threshold = {...rule.threshold, decisionId: null, missingReason: "Folga do covenant não adotada"};
      return observe("absent-threshold-is-a-gap-not-a-default", i, {status: "framed", covenant: null, gap: true},
        (p) => ({status: p.status, covenant: at(p, "informed").limits[0]!.capacity, gap: at(p, "informed").gaps.some((g) => g.reason === "Folga do covenant não adotada")}));
    })(),
  ];
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = sealed(); for (const c of i.cases) c.analysis.envelope = {...c.analysis.envelope, canonical: c.analysis.envelope.canonical.replace('"56.6"', '"66.6"')}; return i;}, "adoption_basis_integrity_mismatch"],
    ["two-informed-cases", () => {const i = sealed(); (i.cases[1] as {role: string}).role = "informed"; i.cases[1]!.changes = []; return i;}, "Exactly one informed case is required"],
    ["silent-alternative", () => {const i = sealed(); i.cases[1]!.changes = []; return i;}, "must say what it changes"],
    ["same-analysis-twice", () => {const i = sealed(); i.cases[1] = {...i.cases[1]!, analysis: i.cases[0]!.analysis, limits: i.cases[0]!.limits}; return i;}, "own adopted analysis"],
    ["limit-names-unknown-rule", () => {const i = sealed(); i.cases[0]!.limits[1]!.ruleIds = ["ac400000-0000-4000-9000-000000099999"]; return i;}, "names a rule the analysis does not carry"],
    ["rule-in-two-limits", () => {const i = sealed(); i.cases[0]!.limits[1]!.ruleIds = [...i.cases[0]!.limits[1]!.ruleIds, i.cases[0]!.limits[0]!.ruleIds[0]!]; return i;}, "exactly one limit"],
    ["rule-left-out", () => {const i = sealed(); i.cases[0]!.limits = i.cases[0]!.limits.slice(0, 2); return i;}, "exactly one limit"],
    ["another-basis", () => {const i = sealed(); i.cases[1]!.analysis = {...i.cases[1]!.analysis, envelope: {...i.cases[1]!.analysis.envelope, fingerprint: "0".repeat(64)}}; return i;}, "same adopted basis"],
    ["free-result-in-request", () => ({...sealed(), capacity: "200"}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: true}), "grantsExecution"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      if ((input as {forge?: boolean}).forge) debtCapacityPacketOutputSchema.parse({...prepareDebtCapacityPacket(sealed()), grantsExecution: true});
      else prepareDebtCapacityPacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  const informedOnly = () => {const i = sealed(); i.cases = [i.cases[0]!]; return i;};
  return [sealed(), informedOnly()].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareDebtCapacityPacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareDebtCapacityPacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildDebtCapacityRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: debtCapacityRunIds[kind], kind, method: {id: "assess-debt-capacity", version: debtCapacityMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareDebtCapacityPacket"},
      harness: {module: "@offroad/financial-model/src/debt-capacity-runs.test-support.ts", exportName: "buildDebtCapacityRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C04. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
