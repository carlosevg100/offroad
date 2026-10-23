import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {debtTablePacketOutputSchema, prepareDebtTablePacket, type DebtTablePacketInput} from "./debt-table-packet";
import {auroraDebtTableBasis} from "./debt-table.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic
// calibrations of ficha C10 (modelo_c10.py), never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const r = (v: string | null, p = 1) => v === null ? null : new D(v).toDecimalPlaces(p).toNumber();
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
type Packet = ReturnType<typeof prepareDebtTablePacket>;
export const debtTableMethodVersion = "2026.10.23-v1";
export const debtTableRunIds = {
  gold: "build-company-debt-table-2026-10-23-v1-gold",
  adversarial: "build-company-debt-table-2026-10-23-v1-adversarial",
  consistency: "build-company-debt-table-2026-10-23-v1-consistency",
} as const;
const question = "Monta a tabela de dívida com tudo que temos.";
type Basis = ReturnType<typeof auroraDebtTableBasis>;
function packetInput(edit: (f: Basis) => void = () => undefined, options: Parameters<typeof auroraDebtTableBasis>[0] = {}): DebtTablePacketInput {
  const f = auroraDebtTableBasis(options); edit(f);
  return {schemaVersion: "debt-table-packet-input.v1", question, analysis: f.seal()} as DebtTablePacketInput;
}
const setValue = (f: Basis, suffix: string, value: string) => {
  const e = f.entries.find((x) => x.fieldPath.endsWith(suffix)); if (!e) throw new Error("missing_test_operand");
  e.value = {type: e.value.type, value} as typeof e.value;
};
function observe(id: string, input: DebtTablePacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareDebtTablePacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}

function goldCases(): Case[] {
  const base = () => packetInput(), packet = prepareDebtTablePacket(base()), t = packet.result.table!;
  const reuse = (id: string, expected: unknown, select: (p: Packet) => unknown): Case => {
    const observed = JSON.stringify(select(packet)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(base()), outputFingerprint: fingerprint(packet), passed: expectation === observed};
  };
  void t;
  return [
    // Expectations come from the independent Python oracle (outputs/fichas-ensaio-2026-10/C10/resultados.json) and the ficha's answer key.
    reuse("principal-and-accounting-balance-reconcile-exactly", {principal: 130, accrued: 2.2, cost: -0.4, accounting: 131.8, status: "exact"},
      (p) => {const x = p.result.table!.reconciliation; return {principal: r(x.principal), accrued: r(x.accruedInterest), cost: r(x.unamortizedCost), accounting: r(x.accounting), status: x.status};}),
    reuse("credit-line-is-a-limit-not-debt", {limit: 10, unused: 10, inEscritura: 130}, (p) => ({limit: r(p.result.table!.creditLines[0]!.limit),
      unused: r(p.result.table!.unusedLimits), inEscritura: r(p.result.table!.views[0]!.total)})),
    reuse("four-definitions-with-the-bridge", {totals: [130, 131.8, 138, 144], market: [["lease", 8], ["supplier_finance", 6]]},
      (p) => ({totals: p.result.table!.views.map((v) => r(v.total)), market: p.result.table!.views[3]!.bridgeFromBase.map((b) => [b.component, r(b.amount)])})),
    reuse("bank-guarantee-stays-outside-every-balance", [["fianca", 5]], (p) => p.result.table!.outsideEveryView.map((o) => [o.id, r(o.amount)])),
    reuse("schedule-by-year-independent-oracle", [[2026, 18.3], [2027, 76.7], [2028, 21.7], [2029, 6.7], [2030, 6.7]],
      (p) => p.result.table!.profile.scheduleByYear.map((y) => [y.year, r(y.principal)])),
    reuse("tenor-due-in-twelve-months-and-concentration", {averageLifeNearOracle: true, due: 36.7, dueShare: 28.2, largest: ["Debenturistas", 46.2]},
      // The oracle's 1.42 uses year fractions; the kernel counts actual days to each contractual date (ACT/365).
      (p) => {const x = p.result.table!.profile; return {averageLifeNearOracle: new D(x.weightedAverageLifeYears!).minus("1.42").abs().lte("0.05"), due: r(x.dueWithinTwelveMonths),
        dueShare: r(new D(x.dueWithinTwelveMonthsShare!).mul(100).toFixed()), largest: [x.largestCreditor!.creditor, r(new D(x.largestCreditor!.share!).mul(100).toFixed())]};}),
    reuse("average-nominal-cost-under-the-adopted-curve", {average: 15.92, rows: [17.66, 17.89, 9.84]},
      (p) => ({average: r(new D(p.result.table!.profile.averageNominalCost!).mul(100).toFixed(), 2), rows: p.result.table!.rows.map((x) => r(new D(x.nominalRate!).mul(100).toFixed(), 2))})),
    reuse("basket-occupied-by-the-bradesco-security", {holder: "debenture-1", basket: 15, occupied: 12, remaining: 3},
      (p) => {const b = p.result.table!.negativePledgeBaskets[0]!; return {holder: b.holderId, basket: r(b.basket), occupied: r(b.occupied), remaining: r(b.remaining)};}),
    reuse("cross-default-chain-from-the-lowest-threshold", {lowest: ["ccb-bradesco", 5], chain: [["ccb-bradesco", 5, "amount_in_default", ["debenture-1", "finame", "risco-sacado"]], ["debenture-1", 10, "amount_in_default", ["ccb-bradesco", "finame"]]]},
      (p) => ({lowest: [p.result.table!.crossDefault.lowestThreshold!.instrumentId, r(p.result.table!.crossDefault.lowestThreshold!.threshold)],
        chain: p.result.table!.crossDefault.chain.map((c) => [c.instrumentId, r(c.threshold), c.thresholdBasis, c.potentiallyTriggeredBy])})),
    observe("cross-default-scoped-to-named-creditors", packetInput(() => undefined, {debentureCrossDefaultCreditors: ["BNDES"]}),
      ["finame"], (p) => p.result.table!.crossDefault.chain.find((c) => c.instrumentId === "debenture-1")!.potentiallyTriggeredBy),
    reuse("leverage-in-the-bank-and-indenture-definitions", {bank: [109, 54, 2.02], indenture: [95, 51, 1.86]},
      (p) => Object.fromEntries(p.result.table!.leverage.map((l) => [l.viewId === "mercado" ? "bank" : "indenture", [r(l.netDebt), r(l.denominator), r(l.ratio, 2)]]))),
    reuse("completeness-asks-for-the-external-register", {status: "unproven", request: true}, (p) => ({status: p.result.table!.completeness.status, request: p.readings!.completenessRequest})),
    observe("drawn-line-counts-in-the-contractual-view", packetInput((f) => setValue(f, "credit_line.conta-garantida.drawn", "4")), {escritura: 134, unused: 6, contabil: 131.8},
      (p) => ({escritura: r(p.result.table!.views[0]!.total), unused: r(p.result.table!.unusedLimits), contabil: r(p.result.table!.views[1]!.total)})),
    observe("schedule-short-of-principal-is-a-gap", packetInput((f) => {f.entries.find((x) => x.fieldPath.endsWith("instrument.ccb-bradesco.paymentAmounts"))!.value = {type: "list", value: ["39"]};}),
      {status: "partial", matches: false}, (p) => ({status: p.status, matches: p.result.table!.rows[1]!.scheduleMatchesPrincipal})),
    (() => {
      const i = packetInput() as DebtTablePacketInput & {analysis: {availableCash: {decisionId: string | null; missingReason: string | null}}};
      i.analysis.availableCash = {...i.analysis.availableCash, decisionId: null, missingReason: "Caixa de 30/jun não confirmado"};
      return observe("absent-cash-is-a-gap-not-a-default", i, {status: "partial", ratios: [null, null], gap: true},
        (p) => ({status: p.status, ratios: p.result.table!.leverage.map((l) => l.ratio), gap: p.gaps.some((g) => g.reason === "Caixa de 30/jun não confirmado")}));
    })(),
  ];
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = packetInput(); i.analysis.envelope = {...i.analysis.envelope, canonical: i.analysis.envelope.canonical.replace('"131.8"', '"141.8"')}; return i;}, "adoption_basis_integrity_mismatch"],
    ["free-result-in-request", () => ({...packetInput(), table: {views: []}}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: true}), "grantsExecution"],
    ["leverage-names-unknown-view", () => {const i = packetInput(); i.analysis.leverage[0] = {...i.analysis.leverage[0]!, viewId: "inventada"}; return i;}, "debt_table_unknown_view"],
    ["duplicate-item", () => {const i = packetInput(); i.analysis.creditLines[0] = {...i.analysis.creditLines[0]!, id: "finame"}; return i;}, "Duplicate item"],
    ["payment-on-the-reference-date", () => packetInput((f) => {const e = f.entries.find((x) => x.fieldPath.endsWith("instrument.ccb-bradesco.paymentDates"))!; e.value = {type: "list", value: ["2026-06-30"]};}), "debt_table_payment_not_after_reference"],
    ["drawn-above-limit", () => packetInput((f) => setValue(f, "credit_line.conta-garantida.drawn", "12")), "debt_table_drawn_above_limit"],
    ["basket-of-an-unknown-instrument", () => packetInput((f) => {const e = f.entries.find((x) => x.fieldPath.endsWith("instrument.ccb-bradesco.usesBasketOf"))!; e.value = {type: "list", value: ["inexistente"]};}), "debt_table_unknown_basket_holder"],
    ["view-repeats-a-component", () => packetInput((f) => {const e = f.entries.find((x) => x.fieldPath.endsWith("view.escritura.components"))!; e.value = {type: "list", value: ["principal", "principal"]};}), "debt_table_view_components"],
    ["term-read-in-another-scenario", () => packetInput((f) => {f.entries.find((x) => x.fieldPath.endsWith("instrument.finame.principal"))!.dimensions.scenario = "adverse";}), "analysis_basis_context_mismatch"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      if ((input as {forge?: boolean}).forge) debtTablePacketOutputSchema.parse({...prepareDebtTablePacket(packetInput()), grantsExecution: true});
      else prepareDebtTablePacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  const withDrawnLine = () => packetInput((f) => setValue(f, "credit_line.conta-garantida.drawn", "4"));
  return [packetInput(), withDrawnLine()].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareDebtTablePacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareDebtTablePacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildDebtTableRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: debtTableRunIds[kind], kind, method: {id: "build-company-debt-table", version: debtTableMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareDebtTablePacket"},
      harness: {module: "@offroad/financial-model/src/debt-table-runs.test-support.ts", exportName: "buildDebtTableRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C10. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
