import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {prepareReceivablesFundingPacket, receivablesFundingPacketOutputSchema, type ReceivablesFundingPacketInput} from "./receivables-funding-packet";
import {auroraReceivablesFunding, auroraReceivablesFundingBasis} from "./receivables-funding.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic
// calibrations of ficha C35 (modelo_c35.py), never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const r = (v: string | null | undefined, p = 1) => v == null ? null : new D(v).toDecimalPlaces(p).toNumber();
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
type Packet = ReturnType<typeof prepareReceivablesFundingPacket>;
type Basis = ReturnType<typeof auroraReceivablesFundingBasis>;
export const receivablesFundingMethodVersion = "2026.10.26-v1";
export const receivablesFundingRunIds = {
  gold: "monetize-receivables-for-working-capital-2026-10-26-v1-gold",
  adversarial: "monetize-receivables-for-working-capital-2026-10-26-v1-adversarial",
  consistency: "monetize-receivables-for-working-capital-2026-10-26-v1-consistency",
} as const;
const question = "Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?";
const packetInput = (edit: (f: Basis) => void = () => undefined, after: (i: ReceivablesFundingPacketInput) => void = () => undefined, basis: () => Basis = () => auroraReceivablesFundingBasis()): ReceivablesFundingPacketInput => {
  const f = basis(); edit(f);
  const i = {schemaVersion: "receivables-funding-packet-input.v1", question, analysis: f.seal()} as ReceivablesFundingPacketInput; after(i); return i;
};
const entry = (f: Basis, suffix: string) => f.entries.find((x) => x.fieldPath.endsWith(suffix))!;
function observe(id: string, input: ReceivablesFundingPacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareReceivablesFundingPacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
/** Turn 2 of the ficha: the restricted retailer has its own program with a bank, terms still to be asked. */
const programA = () => {
  const k = auroraReceivablesFunding(), b = k.options[0]!;
  return auroraReceivablesFundingBasis({...k, items: k.items.map((i) => i.id === "rede-a" ? {...i, anchorProgram: "active"} : i),
    options: [...k.options, {...b, id: "risco-sacado-a", label: "Risco sacado da rede A", eligibility: {...b.eligibility!, anchorItemIds: ["rede-a"]},
      rate: {basis: "di_plus", rate: "0.015"}, leadDaysMin: null, leadDaysMax: null}]});
};
const near = (v: string, oracle: number, tolerance: number) => new D(v).minus(oracle).abs().lte(tolerance);

function goldCases(): Case[] {
  const base = () => packetInput(), packet = prepareReceivablesFundingPacket(base());
  const reuse = (id: string, expected: unknown, select: (p: Packet) => unknown): Case => {
    const observed = JSON.stringify(select(packet)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(base()), outputFingerprint: fingerprint(packet), passed: expectation === observed};
  };
  const option = (p: Packet, id: string) => p.readings!.options.find((o) => o.id === id)!;
  return [
    // Expectations come from the independent Python oracle (outputs/fichas-ensaio-2026-10/C35/resultados.json) and the ficha's answer key.
    reuse("gross-portfolio-is-not-assignable", {gross: 62, assignable: 25, nearTwentyFive: true}, (p) => ({gross: r(p.readings!.gross), assignable: r(p.readings!.assignable), nearTwentyFive: near(p.readings!.assignable, 25, 1)})),
    reuse("every-exclusion-carries-its-reason", [["rede-a", 19.8, ["not_assignable"]], ["redes-c-d", 12, ["encumbered"]], ["rede-e", 1.5, ["debtor_sublimit"]], ["rede-f", 1.5, ["debtor_sublimit"]], ["vencidos", 2.2, ["past_due"]]],
      (p) => p.readings!.exclusions.map((e) => [e.itemId, r(e.amount), e.reasons])),
    reuse("options-sized-by-eligibility-and-sublimit", {riscoSacadoB: 3.7, fidcWithRecourse: 21.3, fidcWithoutRecourse: 10},
      (p) => ({riscoSacadoB: r(option(p, "risco-sacado-b").volume), fidcWithRecourse: r(option(p, "fidc-com-coobrigacao").volume), fidcWithoutRecourse: r(option(p, "fidc-sem-coobrigacao").volume)})),
    reuse("cost-for-the-time-in-use-against-the-bank-line", [["risco-sacado-b", 1.33, true], ["fidc-com-coobrigacao", 1.75, true], ["linha-giro", 1.82, true], ["desconto-bancario", 1.96, true], ["fidc-sem-coobrigacao", 2.08, true]],
      (p) => p.readings!.options.map((o) => [o.id, r(o.cost, 2), near(o.cost, ({"risco-sacado-b": 1.33, "fidc-com-coobrigacao": 1.75, "linha-giro": 1.82, "desconto-bancario": 1.96, "fidc-sem-coobrigacao": 2.08} as Record<string, number>)[o.id]!, 0.02)])),
    reuse("iof-where-it-applies", {withIof: ["linha-giro", "desconto-bancario"], discountDraws: 3.6},
      (p) => ({withIof: p.readings!.options.filter((o) => o.iofApplies).map((o) => o.id), discountDraws: r(p.result.funding!.options.find((o) => o.id === "desconto-bancario")!.cost.draws)})),
    reuse("monthly-rates-converted-before-comparing", {"1,6% a.m.": [21, 5.3], "1,9% a.m.": [25.3, 9.1]},
      (p) => ({"1,6% a.m.": [r(new D(option(p, "fidc-com-coobrigacao").annualEffective).mul(100).toFixed()), r(new D(option(p, "fidc-com-coobrigacao").spreadOverDi).mul(100).toFixed())],
        "1,9% a.m.": [r(new D(option(p, "fidc-sem-coobrigacao").annualEffective).mul(100).toFixed()), r(new D(option(p, "fidc-sem-coobrigacao").spreadOverDi).mul(100).toFixed())]})),
    reuse("recourse-on-the-balance-sheet-and-the-covenant", [["fidc-com-coobrigacao", "tends_to_remain_as_liability", 17], ["fidc-sem-coobrigacao", "derecognized", 0], ["risco-sacado-b", "derecognized", 0]],
      (p) => ["fidc-com-coobrigacao", "fidc-sem-coobrigacao", "risco-sacado-b"].map((id) => [id, option(p, id).balanceSheet, r(option(p, id).measuredDebtAdded)])),
    reuse("sale-is-not-a-guarantee-under-the-negative-pledge", {sales: ["not_a_guarantee_confirm_with_counsel"], line: "uses_basket_if_collateralized", lineFitsBasket: false},
      (p) => ({sales: [...new Set(p.readings!.options.filter((o) => o.kind === "fidc" || o.kind === "anchor_program").map((o) => o.lien))], line: option(p, "linha-giro").lien,
        lineFitsBasket: p.result.funding!.options.find((o) => o.id === "linha-giro")!.fitsLienBasket})),
    reuse("asks-about-retailer-a-program", [["anchor_program_of_restricted_debtor", "rede-a", 19.8], ["duplicata_registration_capability", null, 21.3]],
      (p) => p.readings!.questions.map((q) => [q.code, q.itemId, r(q.amount)])),
    reuse("fifteen-to-thirty-days-with-registration-as-condition-precedent", {fidcLead: {min: 15, max: 30}, startBy: "2026-09-16", slackDays: 1, conditions: [["duplicata_registration", 21.3]]},
      (p) => ({fidcLead: p.result.funding!.options.find((o) => o.id === "fidc-com-coobrigacao")!.leadDays, startBy: p.readings!.startBy, slackDays: p.readings!.slackDays,
        conditions: p.readings!.conditionsPrecedent.map((c) => [c.code, r(c.amount)])})),
    reuse("several-buyers-and-the-bank-line-as-reserve", {plan: [["risco-sacado-b", 3.7], ["fidc-com-coobrigacao", 25]], coversPeak: true, reserve: "linha-giro", buyers: "several_in_parallel", named: false, approval: false},
      (p) => ({plan: p.readings!.plan.map((s) => [s.optionId, r(s.cumulative)]), coversPeak: p.readings!.planCoversPeak, reserve: p.readings!.bankLineReserve,
        buyers: p.readings!.process.buyers, named: p.readings!.process.buyersNamed, approval: p.readings!.process.approvalPromised})),
    reuse("no-dedicated-vehicle-for-a-seasonal-need", {monthly: 12.8, reading: "not_for_seasonal_need"}, (p) => ({monthly: r(p.readings!.dedicatedVehicle.monthlyAssignable), reading: p.readings!.dedicatedVehicle.reading})),
    observe("retailer-a-program-reorders-the-plan", packetInput(undefined, undefined, programA),
      {plan: [["risco-sacado-b", 3.7], ["risco-sacado-a", 23.5], ["fidc-com-coobrigacao", 44.8]], questions: ["duplicata_registration_capability"], startBy: null},
      (p) => ({plan: p.readings!.plan.map((s) => [s.optionId, r(s.cumulative)]), questions: p.readings!.questions.map((q) => q.code), startBy: p.readings!.startBy})),
    // The oracle releases 90% of the R$ 12 mi; the method applies the same R$ 3 mi sublimit to the two retailers and states the result as an upper bound.
    reuse("encumbered-bucket-released-under-the-same-sublimit", [["redes-c-d", 12, "pré-pagamento da CCB do Bradesco", 6, false]],
      (p) => p.readings!.releases.map((x) => [x.itemId, r(x.amount), x.releaseEvent, r(x.assignableAfterRelease), x.verified])),
    reuse("largest-debtor-unknown-is-a-gap-not-a-default", {status: "partial", gaps: ["item.varejo-selecionado.largestDebtorAmount", "item.varejo-demais.largestDebtorAmount"]},
      (p) => ({status: p.status, gaps: p.gaps.map((g) => g.operand.split(".").slice(2).join("."))})),
    (() => {
      const i = packetInput() as ReceivablesFundingPacketInput & {analysis: {needPeak: {decisionId: string | null; missingReason: string | null}}};
      i.analysis.needPeak = {...i.analysis.needPeak, decisionId: null, missingReason: "Pico da necessidade não informado"};
      return observe("absent-peak-is-a-gap-not-a-default", i, {status: "framed", gap: true}, (p) => ({status: p.status, gap: p.gaps.some((g) => g.reason === "Pico da necessidade não informado")}));
    })(),
  ];
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = packetInput(); i.analysis.envelope = {...i.analysis.envelope, canonical: i.analysis.envelope.canonical.replace('"19.8"', '"29.8"')}; return i;}, "adoption_basis_integrity_mismatch"],
    ["free-result-in-request", () => ({...packetInput(), funding: {portfolio: {}}}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: "grantsExecution"}), "grantsExecution"],
    ["fabricated-approval-promise", () => ({forge: "approvalPromised"}), "approvalPromised"],
    ["program-buys-a-debtor-without-a-program", () => packetInput((f) => {entry(f, "option.risco-sacado-b.anchorItemIds").value = {type: "list", value: ["rede-a"]};}), "receivables_funding_anchor_program_not_active"],
    ["policy-override-to-take-encumbered-receivables", () => {const i = packetInput(); (i.analysis.options[1]!.eligibility as Record<string, unknown>).excludeEncumbered = i.analysis.options[1]!.eligibility!.maxDaysPastDue; return i;}, "Unrecognized key"],
    ["sale-carrying-collateral", () => packetInput((f) => {entry(f, "option.fidc-com-coobrigacao.collateral").value = {type: "text", value: "receivables_assignment"};}), "receivables_funding_sale_with_collateral"],
    ["discount-without-recourse", () => packetInput((f) => {entry(f, "option.desconto-bancario.recourse").value = {type: "text", value: "without_recourse"};}), "receivables_funding_option_recourse"],
    ["bank-line-with-portfolio-eligibility", () => {
      let eligibility: Record<string, unknown> = {};
      return packetInput((f) => {const p = "option.linha-giro.";
        eligibility = {maxDaysPastDue: f.contribute(p + "maxDaysPastDue", "days", {type: "number", value: "0"}), maxRemainingTermDays: f.contribute(p + "maxRemainingTermDays", "days", {type: "number", value: "180"}),
          registrationRule: f.contribute(p + "registrationRule", "convention", {type: "text", value: "not_required"}), minCreditTier: f.contribute(p + "minCreditTier", "convention", {type: "text", value: "standard"}),
          sublimitPerDebtor: null, anchorItemIds: null};},
      (i) => {i.analysis.options[4] = {...i.analysis.options[4]!, eligibility: eligibility as never};});
    }, "receivables_funding_option_eligibility"],
    ["rate-without-a-declared-period", () => packetInput((f) => {entry(f, "option.fidc-com-coobrigacao.rateBasis").value = {type: "text", value: "nominal"};}), "invalid_value"],
    ["encumbrance-without-holder", () => {const i = packetInput(); i.analysis.items[1] = {...i.analysis.items[1]!, encumbranceHolder: null}; return i;}, "receivables_funding_encumbrance_holder"],
    ["peak-below-average-need", () => packetInput((f) => {entry(f, "needPeak").value = {type: "number", value: "10"};}), "receivables_funding_need"],
    ["largest-debtor-above-its-bucket", () => packetInput((f) => {f.contribute("item.varejo-demais.largestDebtorAmount", "currency", {type: "number", value: "12"});},
      (i) => {i.analysis.items[6] = {...i.analysis.items[6]!, largestDebtorAmount: {decisionId: auroraLast(i), definitionVersionId: i.analysis.items[6]!.amount.definitionVersionId, definitionKind: "managerial", missingReason: null}};}), "receivables_funding_largest_debtor"],
    ["figure-read-in-another-scenario", () => packetInput((f) => {entry(f, "item.rede-b.amount").dimensions.scenario = "adverse";}), "analysis_basis_context_mismatch"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      const forge = (input as {forge?: string}).forge;
      if (forge === "grantsExecution") receivablesFundingPacketOutputSchema.parse({...prepareReceivablesFundingPacket(packetInput()), grantsExecution: true});
      else if (forge === "approvalPromised") {
        const p = prepareReceivablesFundingPacket(packetInput());
        receivablesFundingPacketOutputSchema.parse({...p, readings: {...p.readings!, process: {...p.readings!.process, approvalPromised: true}}});
      } else prepareReceivablesFundingPacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}
/** The decision id of the last contribution sealed into the request's basis. */
function auroraLast(i: ReceivablesFundingPacketInput) {
  const entries = (JSON.parse(i.analysis.envelope.canonical) as {entries: {decisionId: string}[]}).entries;
  return entries[entries.length - 1]!.decisionId;
}

function consistencyCases(): Case[] {
  const lineAndOneFund = () => {const i = packetInput(); i.analysis.options = [i.analysis.options[1]!, i.analysis.options[4]!]; return i;};
  return [packetInput(), lineAndOneFund()].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareReceivablesFundingPacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareReceivablesFundingPacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildReceivablesFundingRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: receivablesFundingRunIds[kind], kind, method: {id: "monetize-receivables-for-working-capital", version: receivablesFundingMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareReceivablesFundingPacket"},
      harness: {module: "@offroad/financial-model/src/receivables-funding-runs.test-support.ts", exportName: "buildReceivablesFundingRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C35. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
