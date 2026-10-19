import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {prepareRelativeDebtCostPacket, relativeDebtCostPacketOutputSchema, type RelativeDebtCostPacketInput} from "./relative-debt-cost-packet";
import {c03Id, c03PacketInput} from "./relative-debt-cost.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic
// calibrations of ficha C03 (modelo_c03.py), never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const mi = (v: string | null, p = 3) => v === null ? null : new D(v).div(1000000).toDecimalPlaces(p).toNumber();
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
export const relativeDebtCostMethodVersion = "2026.10.19-v2";
export const relativeDebtCostRunIds = {
  gold: "analyze-relative-debt-cost-2026-10-19-v2-gold",
  adversarial: "analyze-relative-debt-cost-2026-10-19-v2-adversarial",
  consistency: "analyze-relative-debt-cost-2026-10-19-v2-consistency",
} as const;
type Packet = ReturnType<typeof prepareRelativeDebtCostPacket>;
const sealed = () => c03PacketInput().seal();
function observe(id: string, input: RelativeDebtCostPacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareRelativeDebtCostPacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}
const mutate = (suffix: string, value: {type: "number" | "text" | "list"; value: string | string[]}) => {
  const f = c03PacketInput(), i = f.entries.findIndex((e) => e.fieldPath.endsWith(suffix));
  f.entries[i]!.value = value as typeof f.entries[number]["value"];
  return f;
};

function goldCases(): Case[] {
  const f = c03PacketInput(), packet = prepareRelativeDebtCostPacket(f.seal());
  const reuse = (id: string, expected: unknown, select: (p: Packet) => unknown): Case => {
    const observed = JSON.stringify(select(packet)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(c03PacketInput().seal()), outputFingerprint: fingerprint(packet), passed: expectation === observed};
  };
  const lever = (p: Packet, id: string) => p.levers.find((l) => l.actionId === id)!;
  const cls = (p: Packet, k: number) => p.lens.rows.find((r) => r.id === c03Id(400 + k))!.classification;
  return [
    // Expectations come from the independent Python oracle (outputs/fichas-ensaio-2026-10/C03/resultados.json).
    reuse("c03-decomposition-independent-oracle", {gross: "125", explained: "70", credit: "55", afterDate: "65"},
      (p) => ({gross: p.decomposition!.grossBps, explained: p.decomposition!.structureAndMarketBps, credit: p.decomposition!.creditResidualBps, afterDate: p.decomposition!.afterPricingDateBps})),
    reuse("more-than-half-is-not-company-risk", {share: 0.56}, (p) => ({share: Number(p.decomposition!.shareNotAboutCompanyRisk)})),
    reuse("leverage-is-not-the-driver", {leverage: "neutral", coverage: "weighs_little"}, (p) => ({leverage: cls(p, 2), coverage: cls(p, 3)})),
    reuse("committee-lens-weighs-scale-conversion-and-debt-profile", ["weighs_against", "weighs_against", "weighs_against", "weighs_against", "weighs_against"],
      (p) => [0, 1, 4, 6, 7].map((k) => cls(p, k))),
    reuse("qualitative-rows-keep-the-adopted-judgment", [["adopted_judgment", "weighs_against"], ["adopted_judgment", "weighs_against"], ["adopted_judgment", "neutral"]],
      (p) => [5, 8, 9].map((k) => {const r = p.lens.rows.find((x) => x.id === c03Id(400 + k))!; return [r.classificationBasis, r.classification];})),
    reuse("residual-read-as-about-two-notches", {fewest: 1.83, most: 2.2, rating: null}, (p) => ({fewest: new D(p.lens.impliedNotches!.fewest).toDecimalPlaces(2).toNumber(),
      most: Number(p.lens.impliedNotches!.most), rating: p.result.bridge && (p.result.bridge as {creditRating: null}).creditRating})),
    reuse("prepaying-only-for-the-rate-does-not-pay", [[0.3, 1.75, false], [0.17, 1.75, false]],
      (p) => [f.ids.refinance190, f.ids.refinance220].map((id) => [mi(lever(p, id).savings, 2), mi(lever(p, id).knownCosts, 2), lever(p, id).paysForItself])),
    reuse("rating-breaks-even-on-spread", {low: [0.135, -0.165], high: [0.225, 0.025]},
      (p) => ({low: [mi(lever(p, f.ids.ratingLow).savings), mi(lever(p, f.ids.ratingLow).netOfKnownCosts)], high: [mi(lever(p, f.ids.ratingHigh).savings), mi(lever(p, f.ids.ratingHigh).netOfKnownCosts)]})),
    (() => {
      const g = c03PacketInput(); const a = g.input.analysis.adjustments[2]!;
      a.terms.bps = {...a.terms.bps, decisionId: null, missingReason: "Missing comparable market sample"};
      return observe("absent-market-adjustment-keeps-the-gross-difference", g.seal(), {status: "framed", gross: "125", residual: null, gap: true},
        (p) => ({status: p.status, gross: p.decomposition!.grossBps, residual: p.decomposition!.creditResidualBps, gap: p.gaps.some((x) => x.reason === "Missing comparable market sample")}));
    })(),
    (() => {
      const g = c03PacketInput(); const row = g.input.lens.rows[3]!;
      row.own = {...row.own, decisionId: null, missingReason: "Cobertura da companhia não adotada"};
      return observe("absent-indicator-is-a-gap-not-neutral", g.seal(), {status: "partial", classification: null},
        (p) => ({status: p.status, classification: p.lens.rows.find((r) => r.id === c03Id(403))!.classification}));
    })(),
    (() => {
      const g = c03PacketInput(); const a = g.input.analysis.adjustments[2]!;
      a.terms.bps = {...a.terms.bps, decisionId: null, missingReason: "Missing comparable market sample"};
      g.input.analysis.peer.indexer = {...g.input.analysis.peer.indexer, decisionId: null, missingReason: "Indexador do par não adotado"};
      return observe("unknown-indexer-shows-no-gross-difference", g.seal(), {decomposition: null, gap: true},
        (p) => ({decomposition: p.decomposition, gap: p.gaps.some((x) => x.operand.endsWith(".comparability"))}));
    })(),
    (() => {
      const g = c03PacketInput(); const a = g.input.analysis.adjustments[2]!;
      a.terms.bps = {...a.terms.bps, decisionId: null, missingReason: "Missing comparable market sample"};
      g.entries.find((x) => x.fieldPath.endsWith("peer.indexer"))!.value = {type: "text", value: "IPCA"};
      return observe("unlike-indexers-with-a-missing-adjustment-show-no-gross-difference", g.seal(), {decomposition: null, gap: true},
        (p) => ({decomposition: p.decomposition, gap: p.gaps.some((x) => x.operand.endsWith(".comparability"))}));
    })(),
    (() => {
      const g = c03PacketInput(); const e = g.entries.find((x) => x.fieldPath.endsWith(`action.${g.ids.refinance220}.costCoverage`))!;
      e.value = {type: "text", value: "incomplete"};
      return observe("a-lever-without-complete-costs-is-not-said-to-pay", g.seal(), {paysForItself: null},
        (p) => ({paysForItself: p.levers.find((l) => l.actionId === g.ids.refinance220)!.paysForItself}));
    })(),
  ];
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = sealed(); const e = {...i.analysis.envelope, canonical: i.analysis.envelope.canonical.replace('"260"', '"200"')}; i.analysis.envelope = e; i.lens.envelope = e; return i;}, "adoption_basis_integrity_mismatch"],
    ["lens-from-another-comparison", () => {const i = sealed(); i.lens = {...i.lens, comparisonId: c03Id(999)}; return i;}, "same adopted basis and comparison"],
    ["lever-without-action", () => {const i = sealed(); i.levers[0] = {...i.levers[0]!, actionId: c03Id(998)}; return i;}, "Lever names an action"],
    ["duplicate-lever", () => {const i = sealed(); i.levers[1] = {...i.levers[1]!, actionId: i.levers[0]!.actionId}; return i;}, "Duplicate lever"],
    ["peer-indicator-read-as-own", () => {const f = c03PacketInput(); const e = f.entries.find((x) => x.fieldPath.endsWith(`lens.${c03Id(402)}.peer`))!; e.dimensions = {...e.dimensions, entityId: c03Id(1)}; return f.seal();}, "relative_cost_lens_context_mismatch"],
    ["overlapping-market-effect", () => mutate(`adjustment.${c03Id(301)}.independentEffectGroup`, {type: "text", value: "pricing_date"}).seal(), "Duplicate or overlapping adjustment"],
    ["unlike-indexers", () => mutate("peer.indexer", {type: "text", value: "IPCA"}).seal(), "Different indexers require equivalent spreads"],
    ["numbers-of-different-definitions", () => mutate(`lens.${c03Id(403)}.peerDefinition`, {type: "text", value: "EBITDA ajustado sobre despesa financeira líquida"}).seal(), "relative_cost_lens_definition_mismatch"],
    ["materiality-threshold-out-of-domain", () => mutate("lens.materialityThreshold", {type: "number", value: "1.5"}).seal(), "relative_cost_lens_threshold_domain"],
    ["inverted-notch-range", () => mutate("lens.notch.bpsHigh", {type: "number", value: "20"}).seal(), "relative_cost_lens_notch_range"],
    ["free-result-in-request", () => ({...sealed(), residualBps: "10"}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: true}), "grantsExecution"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      if ((input as {forge?: boolean}).forge) relativeDebtCostPacketOutputSchema.parse({...prepareRelativeDebtCostPacket(sealed()), grantsExecution: true});
      else prepareRelativeDebtCostPacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  const withoutLevers = () => {const i = sealed(); i.levers = []; return i;};
  return [sealed(), withoutLevers()].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareRelativeDebtCostPacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareRelativeDebtCostPacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildRelativeDebtCostRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: relativeDebtCostRunIds[kind], kind, method: {id: "analyze-relative-debt-cost", version: relativeDebtCostMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareRelativeDebtCostPacket"},
      harness: {module: "@offroad/financial-model/src/relative-debt-cost-runs.test-support.ts", exportName: "buildRelativeDebtCostRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha C03. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
