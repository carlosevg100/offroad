import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {prepareQuarterUpdatePacket, quarterUpdatePacketOutputSchema, type QuarterUpdatePacketInput} from "./quarter-update-packet";
import {calculateAdoptedWeeklyCash} from "./adopted-weekly-cash";
import {auroraDearerInputs, auroraQuarterUpdateBasis} from "./quarter-update.test-support";
import {measureCovenantHeadroom} from "@offroad/financial-core";
import {analysisTestId} from "./adopted-analysis.test-support";
import {auroraWeeklyCash} from "./weekly-cash-streams.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic
// calibrations of ficha C54 (modelo_c54.py over modelo_c18.py and modelo_c12.py), never production parameters. The method
// departs from the oracle on one point, decided after review r1: receivable days are carried once in the closed cash.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const r = (v: string | null | undefined, p = 1) => v == null ? null : new D(v).toDecimalPlaces(p).toNumber();
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
type Packet = ReturnType<typeof prepareQuarterUpdatePacket>;
export const quarterUpdateMethodVersion = "2026.10.26-v1";
export const quarterUpdateRunIds = {
  gold: "update-after-quarter-close-2026-10-26-v1-gold",
  adversarial: "update-after-quarter-close-2026-10-26-v1-adversarial",
  consistency: "update-after-quarter-close-2026-10-26-v1-consistency",
} as const;
const question = "Fechou o trimestre. Atualiza tudo.";
type Basis = ReturnType<typeof auroraQuarterUpdateBasis>;
const packetInput = (edit: (f: Basis) => void = () => undefined, after: (i: QuarterUpdatePacketInput) => void = () => undefined): QuarterUpdatePacketInput => {
  const f = auroraQuarterUpdateBasis(); edit(f);
  const i = {schemaVersion: "quarter-update-packet-input.v1", question, analysis: f.seal()} as QuarterUpdatePacketInput; after(i); return i;
};
function observe(id: string, input: QuarterUpdatePacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareQuarterUpdatePacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
const near = (v: string, target: string, tolerance: string) => new D(v).minus(target).abs().lte(tolerance);

function goldCases(): Case[] {
  const base = () => packetInput(), packet = prepareQuarterUpdatePacket(base());
  const reuse = (id: string, expected: unknown, select: (p: Packet) => unknown): Case => {
    const observed = JSON.stringify(select(packet)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(base()), outputFingerprint: fingerprint(packet), passed: expectation === observed};
  };
  return [
    // Expectations come from the independent Python oracle (outputs/fichas-ensaio-2026-10/C54/resultados.json) and the ficha's answer key.
    reuse("bridges-sum-exactly-to-the-deviations", [["ebitda", "-0.4", "0"], ["caixa", "-1.7", "0"]], (p) => p.readings!.bridges.map((b) => [b.lineId, b.deviation, b.residual])),
    reuse("each-cause-in-the-oracle-bridge", [["ebitda", [["volume", 0.5], ["trigo", -0.6], ["frete-energia", -0.3]]], ["caixa", [["ebitda-abaixo", -0.4], ["prazo-redes", -2.1], ["estoque-trigo", -1.6], ["impostos-outros", 2.4]]]],
      (p) => p.readings!.bridges.map((b) => [b.lineId, b.causes.map((c) => [c.id, r(c.amount)])])),
    reuse("stock-is-calendar-terms-and-wheat-structural-until-december", {calendar: ["volume", "frete-energia", "ebitda-abaixo", "estoque-trigo", "impostos-outros"],
      structural: [["trigo", "2026-12-31", "flow"], ["prazo-redes", "2026-12-31", "balance"]]},
      (p) => ({calendar: p.readings!.oneOff, structural: p.readings!.persisting.map((c) => [c.causeId, c.until, c.nature])})),
    // Weekly figures differ slightly from the oracle's 4.2 and 10.8: the series move only after the close, since September is already in the closed cash.
    reuse("worst-december-week-near-4-2", {prior: ["2026-12-21", 7.5], updated: ["2026-12-21", 4.4], near: true},
      (p) => ({prior: [p.readings!.tightestWeek.prior.weekStart, r(p.readings!.tightestWeek.prior.closing)], updated: [p.readings!.tightestWeek.updated.weekStart, r(p.readings!.tightestWeek.updated.closing)],
        near: near(p.readings!.tightestWeek.updated.closing, "4.2", "0.5")})),
    reuse("december-need-above-the-overdraft-limit", {need: 10.6, limit: 10, exceeds: true, withFullLimit: 14.4, covers: false},
      (p) => ({need: r(p.readings!.shortfallToMinimum.updated), limit: r(p.readings!.topUp!.limit), exceeds: p.readings!.topUp!.needExceedsLimit,
        withFullLimit: r(p.readings!.topUp!.fullLimitMinimum.closing), covers: p.readings!.topUp!.fullLimitCovers})),
    reuse("action-within-what-is-approved", {steps: [["programas-redes", 23, true], ["conta-garantida", 4.6, true]], withinApproved: true, covers: true, smallerDraw: true},
      (p) => ({steps: p.readings!.action.steps.map((s) => [s.facilityId, r(s.amount), s.withinLimit]), withinApproved: p.readings!.action.withinApproved, covers: p.readings!.action.covers,
        smallerDraw: new D(p.readings!.action.steps[1]!.amount).lt(p.readings!.topUp!.limit)})),
    reuse("december-covenant-by-each-definition", {indenture: {ratio: [2.2, 2.29], policy: [6.2, 4.3]}, managerial: {ratio: [2.04, 2.12], policy: [10.2, 8.3]}, breach: false},
      (p) => {
        const c = p.readings!.covenant, ratio = (id: string) => (({prior, updated}) => [r(prior, 2), r(updated, 2)])(c.measurements.find((m) => m.measurementId === id)!.ratio);
        const policy = (id: string) => (({prior, updated}) => [r(prior), r(updated)])(c.headroom.find((h) => h.measurementId === id && h.limitId === "politica")!.ebitdaHeadroom);
        return {indenture: {ratio: ratio("dez26-base"), policy: policy("dez26-base")}, managerial: {ratio: ratio("dez26-gerencial"), policy: policy("dez26-gerencial")}, breach: c.anyBreach};
      }),
    (() => {
      // The ficha's oracle absorbs the 2.1 of receivable days a second time in December (2.32x, 3.7); the method carries it once, inside the closed 1.7.
      const input = base(), p = prepareQuarterUpdatePacket(input), prior = p.result.update!.covenant.prior.measurements.find((m) => m.id === "dez26-base")!;
      const oracle = measureCovenantHeadroom({currency: "BRL", readingDate: "2026-09-30", effects: [], limits: p.result.update!.covenant.prior.limits,
        measurements: [{id: prior.id, label: prior.label, date: prior.date, scenario: prior.scenario, role: "test", debt: prior.debt, unrealizedEbitda: null, adjustments: prior.adjustments,
          limitIds: prior.tests.map((t) => t.limitId), reportedEbitda: "53.5", cash: new D(prior.cash).minus("1.7").minus("2.1").toFixed()}]}).measurements[0]!;
      const observed = JSON.stringify({method: r(p.readings!.covenant.measurements[0]!.ratio.updated, 2), oracle: r(oracle.ratio, 2),
        oraclePolicy: r(oracle.tests.find((t) => t.limitId === "politica")!.ebitdaHeadroom), carriedOnce: p.readings!.balanceShiftsCarriedOnce.map((c) => c.causeId)});
      const expectation = JSON.stringify({method: 2.29, oracle: 2.32, oraclePolicy: 3.7, carriedOnce: ["prazo-redes"]});
      return {id: "oracle-second-absorption-kept-as-contrast", expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(p), passed: expectation === observed};
    })(),
    reuse("projection-2026-ebitda-propagated", [54.5, 53.5], (p) => [r(p.readings!.projectedEbitda.prior), r(p.readings!.projectedEbitda.updated)]),
    reuse("decisions-that-change-are-named", ["short_term_financing", "covenant_headroom", "third_party_material"], (p) => p.readings!.decisionsChanged),
    reuse("what-did-not-change-in-one-line", {updated: ["caixa-semanal", "covenant-dez26", "covenant-dez26-gerencial", "projecao-2026"], unchanged: ["tabela-divida", "plano-2027", "linha-embalagem"]},
      (p) => ({updated: p.readings!.updated, unchanged: p.readings!.unchanged})),
    reuse("question-negotiated-terms-or-late-payment", [["prazo-redes", "Os 54 dias das redes são prazo negociado ou atraso?"]], (p) => p.readings!.openQuestions.map((q) => [q.causeId, q.question])),
    reuse("stale-material-offered-never-sent", {stale: ["material-sondagem"], sent: false, publication: false}, (p) => ({stale: p.readings!.stale, sent: p.readings!.sentToThirdParties, publication: p.grantsPublication})),
    (() => {
      const input = base(), p = prepareQuarterUpdatePacket(input), released = calculateAdoptedWeeklyCash(input.analysis.prior.weeklyCash);
      const observed = JSON.stringify({sameAsReleased: fingerprint(p.result.update!.weekly.prior) === fingerprint(released.weekly), resultFingerprint: p.result.prior.weeklyCash.resultFingerprint === released.fingerprint});
      const expectation = JSON.stringify({sameAsReleased: true, resultFingerprint: true});
      return {id: "prior-version-kept-as-released", expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(p), passed: expectation === observed};
    })(),
    observe("deviation-without-cause-is-a-named-residual", packetInput((f) => f.set("cause.impostos-outros.amount", {type: "number", value: "2"})),
      {status: "partial", residual: "0.4", gap: true}, (p) => ({status: p.status, residual: p.readings!.bridges.find((b) => b.lineId === "caixa")!.residual,
        gap: p.gaps.some((g) => g.operand.endsWith(".bridge.caixa") && g.reason === "unexplained_residual")})),
    observe("structural-cause-without-weekly-effect-is-a-gap", packetInput(undefined, (i) => {i.analysis.update.streamUpdates = [];}),
      {status: "partial", gaps: ["trigo", "prazo-redes"], projected: 53.5}, (p) => ({status: p.status,
        gaps: p.gaps.filter((g) => g.reason === "structural_cause_not_in_weekly_cash").map((g) => g.operand.split(".").at(-1)), projected: r(p.readings!.projectedEbitda.updated)})),
    observe("persistence-date-bounds-every-effect", packetInput((f) => {
      f.set("cause.trigo.until", {type: "date", value: "2026-10-03"});
      f.set("streamUpdate.insumos.amounts", {type: "list", value: auroraDearerInputs("2026-10-03").amounts});
    }), {ebitdaAhead: -0.0196, weekly: -0.058, projected: 54.08}, (p) => {const c = p.readings!.persisting.find((x) => x.causeId === "trigo")!;
      return {ebitdaAhead: r(c.ebitdaAhead, 4), weekly: r(c.weeklyEffect, 3), projected: r(p.readings!.projectedEbitda.updated, 2)};}),
    observe("open-diagnosis-without-question-is-a-gap", packetInput((f) => {
      (f.input as unknown as {bridges: {causes: {id: string; question: unknown}[]}[]}).bridges[1]!.causes.find((x) => x.id === "prazo-redes")!.question = null;
    }), {status: "partial", gap: true}, (p) => ({status: p.status, gap: p.gaps.some((g) => g.operand.endsWith(".cause.prazo-redes") && g.reason === "structural_cause_question_missing")})),
    observe("updated-only-for-results-this-packet-computes", packetInput((f) => {
      f.set("cause.trigo.until", {type: "date", value: "2027-03-31"});
      f.set("dependent.plano-2027.recomputedBy", {type: "text", value: "projection:2027"});
      // A November covenant, an EBITDA to November and a monthly statement are not the December results nor the weekly cash.
      const dependents = (f.input as unknown as {dependents: unknown[]}).dependents;
      const add = (id: string, label: string, kind: string, reads: string[], start: string, end: string, by: string, owner: string, quantities: string[], definition: string | null, scenario: string) => {
        const p = `dependent.${id}.`, txt = (k: string, v: string, unit = "text") => f.contribute(p + k, unit, {type: "text", value: v});
        dependents.push({id, label: txt("label", label), kind: txt("kind", kind, "convention"), reads: f.contribute(p + "reads", "identity", {type: "list", value: reads}),
          horizonStart: f.contribute(p + "horizonStart", "date", {type: "date", value: start}), horizonEnd: f.contribute(p + "horizonEnd", "date", {type: "date", value: end}),
          recomputedBy: txt("recomputedBy", by, "convention"), owner: txt("owner", owner), quantities: f.contribute(p + "quantities", "identity", {type: "list", value: quantities}),
          definition: definition === null ? null : txt("definition", definition), scenario: txt("scenario", scenario, "identity")});
      };
      add("covenant-nov", "Covenant até 30/11/2026", "analysis", ["ebitda", "caixa"], "2026-01-01", "2026-11-30", "covenant:dez26-base", "measure-covenant-headroom",
        ["covenant_ratio"], "Definição da escritura (CVM 156 menos arrendamentos)", "base");
      add("ebitda-nov", "EBITDA acumulado até novembro", "plan", ["ebitda"], "2026-01-01", "2026-11-30", "projection:2026", "build-operating-projection", ["annual_ebitda"], null, "base");
      add("dre-mensal", "DRE mensal do quarto trimestre", "analysis", ["ebitda"], "2026-10-01", "2026-12-31", "weekly_cash", "build-operating-projection", ["monthly_ebitda"], null, "linha-17");
      add("dre-semanal", "EBITDA no horizonte semanal", "analysis", ["ebitda"], "2026-09-14", "2027-01-03", "weekly_cash", "build-operating-projection", ["monthly_ebitda"], null, "linha-17");
      (f.input as unknown as {bridges: {causes: {id: string; driverLineId: string | null}[]}[]}).bridges[0]!.causes.find((c) => c.id === "trigo")!.driverLineId = "ebitda";
    }), {status: "prepared_for_human_review", updated: ["caixa-semanal", "covenant-dez26", "covenant-dez26-gerencial", "projecao-2026"],
      ownedElsewhere: ["plano-2027", "linha-embalagem", "covenant-nov", "ebitda-nov", "dre-mensal", "dre-semanal"]},
      (p) => ({status: p.status, updated: p.readings!.updated, ownedElsewhere: p.readings!.ownedElsewhere.map((x) => x.dependentId)})),
    observe("identity-transform-with-noise-is-no-propagation", packetInput((f) => {
      const prior = auroraWeeklyCash.streams.find((s) => s.id === "insumos")!;
      f.set("streamUpdate.insumos.transformValue", {type: "number", value: "1"});
      f.set("streamUpdate.insumos.dates", {type: "list", value: [...prior.dates]});
      f.set("streamUpdate.insumos.amounts", {type: "list", value: prior.amounts.map((a, k) => k === 3 ? "5.80000001" : a)});
    }), {status: "partial", reasons: ["structural_cause_weekly_effect_inconsistent", "affected_not_recomputed"], weeklyUpdated: false},
      (p) => ({status: p.status, reasons: p.gaps.map((g) => g.reason), weeklyUpdated: p.readings!.updated.includes("caixa-semanal")})),
    observe("managerial-reading-not-updated-by-the-indenture-result", packetInput((f) => f.set("dependent.covenant-dez26-gerencial.recomputedBy", {type: "text", value: "covenant:dez26-base"}),
      (i) => {i.analysis.update.covenant.measurementIds = ["dez26-base"]; i.askedDependentIds = ["covenant-dez26-gerencial"];}),
      {status: "partial", updated: ["caixa-semanal", "covenant-dez26", "projecao-2026"], reasons: ["asked_dependent_not_recomputed"]},
      (p) => ({status: p.status, updated: p.readings!.updated, reasons: p.gaps.map((g) => g.reason)})),
    observe("token-weekly-propagation-keeps-the-weekly-cash-affected", packetInput((f) => {
      const prior = auroraWeeklyCash.streams.find((s) => s.id === "insumos")!;
      f.set("streamUpdate.insumos.amounts", {type: "list", value: prior.amounts.map((a, k) => k === 3 ? "5.80000001" : a)});
    }), {status: "partial", reasons: ["structural_cause_series_not_matching_factor", "affected_not_recomputed"], weeklyUpdated: false},
      (p) => ({status: p.status, reasons: p.gaps.map((g) => g.reason), weeklyUpdated: p.readings!.updated.includes("caixa-semanal")})),
    observe("inconsistent-weekly-propagation-keeps-the-weekly-cash-affected", packetInput((f) => {
      const dates = f.entries.find((x) => x.fieldPath.endsWith("streamUpdate.insumos.dates"))!.value.value as string[];
      f.set("streamUpdate.insumos.amounts", {type: "list", value: dates.map((d) => d > "2026-09-30" ? "5.7" : "5.8")});
    }), {status: "partial", reasons: ["structural_cause_series_not_matching_factor", "affected_not_recomputed"], weeklyUpdated: false},
      (p) => ({status: p.status, reasons: p.gaps.map((g) => g.reason), weeklyUpdated: p.readings!.updated.includes("caixa-semanal")})),
    observe("named-dependent-owned-elsewhere-makes-the-packet-partial", packetInput((f) => f.set("cause.trigo.until", {type: "date", value: "2027-03-31"}), (i) => {i.askedDependentIds = ["plano-2027"];}),
      {status: "partial", reasons: ["asked_dependent_not_recomputed"]}, (p) => ({status: p.status, reasons: p.gaps.map((g) => g.reason)})),
    (() => {
      const i = packetInput();
      i.analysis.update.lines = i.analysis.update.lines.map((l) => l.id === "caixa" ? {...l, actual: {...l.actual, decisionId: null, missingReason: "Caixa de 30/set não informado"}} : l);
      return observe("absent-actual-is-a-gap-not-a-default", i, {status: "framed", gap: true}, (p) => ({status: p.status, gap: p.gaps.some((g) => g.reason === "Caixa de 30/set não informado")}));
    })(),
  ];
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = packetInput(); i.analysis.update.envelope = {...i.analysis.update.envelope, canonical: i.analysis.update.envelope.canonical.replace('"111.2"', '"113.2"')}; return i;}, "adoption_basis_integrity_mismatch"],
    ["free-result-in-request", () => ({...packetInput(), update: {bridges: []}}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: "grantsExecution"}), "grantsExecution"],
    ["fabricated-sending-in-result", () => ({forge: "sentToThirdParties"}), "sentToThirdParties"],
    ["update-of-another-version", () => packetInput((f) => f.set("prior.weeklyCash.fingerprint", {type: "text", value: "0".repeat(64)})), "quarter_update_prior_version_mismatch"],
    ["prior-of-another-company", () => {const i = packetInput(); i.analysis.prior.weeklyCash = {...i.analysis.prior.weeklyCash, entityId: analysisTestId(2)}; return i;}, "quarter_update_prior_context_mismatch"],
    ["linked-cause-off-its-deviation", () => packetInput((f) => f.set("cause.ebitda-abaixo.amount", {type: "number", value: "-0.5"})), "quarter_update_linked_cause_mismatch"],
    ["calendar-cause-moves-the-projection", () => {const i = packetInput(); i.analysis.update.streamUpdates[1] = {...i.analysis.update.streamUpdates[1]!, causeIds: ["estoque-trigo"]}; return i;}, "quarter_update_calendar_cause_propagated"],
    ["series-moved-outside-persistence", () => packetInput((f) => f.set("cause.trigo.until", {type: "date", value: "2026-10-03"})), "quarter_update_series_outside_persistence"],
    ["balance-shift-on-ebitda", () => packetInput((f) => f.set("cause.trigo.nature", {type: "text", value: "balance"})), "quarter_update_balance_cause_off_cash"],
    ["series-shared-by-two-causes", () => packetInput((f) => {
      f.set("cause.trigo.until", {type: "date", value: "2026-10-01"});
      (f.input as unknown as {streamUpdates: {causeIds: string[]}[]}).streamUpdates[1]!.causeIds = ["trigo", "prazo-redes"];
    }), "quarter_update_series_shared_by_causes"],
    ["series-outside-the-scenario-used", () => packetInput((f) => {
      const harvest = auroraWeeklyCash.streams.find((s) => s.id === "safra-30")!;
      const dates = f.contribute("streamUpdate.safra-30.dates", "date", {type: "list", value: [...harvest.dates]});
      const amounts = f.contribute("streamUpdate.safra-30.amounts", "currency", {type: "list", value: harvest.amounts.map((a) => new D(a).plus("0.01").toFixed())});
      const transformKind = f.contribute("streamUpdate.safra-30.transformKind", "convention", {type: "text", value: "scale"});
      const transformValue = f.contribute("streamUpdate.safra-30.transformValue", "ratio", {type: "number", value: "1.01"});
      (f.input as unknown as {streamUpdates: unknown[]}).streamUpdates = [{streamId: "safra-30", causeIds: ["trigo"], transformKind, transformValue, dates, amounts}];
    }), "quarter_update_series_outside_scenario"],
    ["structural-cause-without-an-end", () => packetInput((f) => f.set("cause.volume.classification", {type: "text", value: "structural"})), "quarter_update_structural_cause_end"],
    ["recomputing-what-did-not-move", () => packetInput((f) => f.set("dependent.plano-2027.recomputedBy", {type: "text", value: "projection:2027"})), "quarter_update_recomputes_unaffected"],
    ["series-updated-without-change", () => packetInput((f) => {
      const dates = f.entries.find((x) => x.fieldPath.endsWith("streamUpdate.insumos.dates"))!.value.value as string[];
      f.set("streamUpdate.insumos.amounts", {type: "list", value: dates.map(() => "5.8")});
    }), "quarter_update_stream_update_without_change"],
    ["quarter-outside-the-test-period", () => {const i = packetInput(); i.analysis.update.covenant.measurementIds = ["dez27-base"]; return i;}, "quarter_update_quarter_outside_test_period"],
    ["figure-read-in-another-scenario", () => packetInput((f) => {f.entries.find((x) => x.fieldPath.endsWith("line.ebitda.actual"))!.dimensions.scenario = "adverse";}), "analysis_basis_context_mismatch"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      const forge = (input as {forge?: string}).forge;
      if (forge === "grantsExecution") quarterUpdatePacketOutputSchema.parse({...prepareQuarterUpdatePacket(packetInput()), grantsExecution: true});
      else if (forge === "sentToThirdParties") {const p = prepareQuarterUpdatePacket(packetInput()); quarterUpdatePacketOutputSchema.parse({...p, readings: {...p.readings, sentToThirdParties: true}});}
      else prepareQuarterUpdatePacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  const withoutAction = () => {const i = packetInput(); i.analysis.update.steps = []; i.analysis.update.addedStreams = []; return i;};
  return [packetInput(), withoutAction()].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareQuarterUpdatePacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareQuarterUpdatePacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildQuarterUpdateRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: quarterUpdateRunIds[kind], kind, method: {id: "update-after-quarter-close", version: quarterUpdateMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareQuarterUpdatePacket"},
      harness: {module: "@offroad/financial-model/src/quarter-update-runs.test-support.ts", exportName: "buildQuarterUpdateRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C54. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
