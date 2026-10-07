import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {calculateAdoptedRelativeDebtCost, type AdoptedRelativeDebtCostInput} from "./adopted-relative-debt-cost";
const id = (n: number) => `ac300000-0000-4000-9000-${String(n).padStart(12, "0")}`;
function fixture() {
  const entries: AdoptionBasisEntry[] = []; let n = 20;
  const comparisonId = id(4), prefix = `relative_cost.${comparisonId}.`;
  function contribute(name: string, unit: string, value: AdoptionBasisEntry["value"], peer = false) {
    const decisionId = id(n++);
    entries.push({decisionId, slotKey: createHash("sha256").update(name).digest("hex"), kind: "hypothesis", fieldPath: prefix + name,
      dimensions: {entityId: peer ? id(2) : id(1), perimeter: "standalone", periodStart: "2024-01-01", periodEnd: "2027-06-01", currency: "BRL", unit, scale: "1", scenario: "synthetic-comparison", definitionVersionId: id(3)},
      value, observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "managerial", actorId: id(5), reason: "Synthetic explicitly adopted comparison operand"});
    return {decisionId, definitionVersionId: id(3), definitionKind: "managerial" as const, missingReason: null};
  }
  const number = (name: string, unit: string, value: string, peer = false) => contribute(name, unit, {type: "number", value}, peer);
  const text = (name: string, unit: string, value: string, peer = false) => contribute(name, unit, {type: "text", value}, peer);
  const list = (name: string, unit: string, value: string[]) => contribute(name, unit, {type: "list", value});
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6), workId: id(7), purpose: "explain relative debt cost", contextKey: "synthetic-comparison", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const input: AdoptedRelativeDebtCostInput = {envelope: {canonical: "", fingerprint: ""}, scope: {workId: id(7), purpose: snapshot.purpose, versionId: snapshot.versionId},
    entityId: id(1), peerEntityId: id(2), perimeter: "standalone", peerPerimeter: "standalone", currency: "BRL", scenario: "synthetic-comparison", openingDate: "2024-01-01", endDate: "2027-06-01", comparisonId, numericInterpretations: [],
    own: {spreadBps: number("own.spreadBps", "basis_points", "260"), indexer: text("own.indexer", "convention", "CDI"), pricingDate: contribute("own.pricingDate", "date", {type: "date", value: "2024-09-01"})},
    peer: {spreadBps: number("peer.spreadBps", "basis_points", "135", true), indexer: text("peer.indexer", "convention", "CDI", true), pricingDate: contribute("peer.pricingDate", "date", {type: "date", value: "2026-05-01"}, true)},
    pricingBasis: text("pricingBasis", "convention", "same_indexer_quoted_spread"), curveVersion: text("curveVersion", "reference_id", "not_applicable"), coverage: text("coverage", "convention", "complete_scoped_bridge"),
    adjustments: [], actions: []};
  const families = ["pricing_date", "tenor", "guarantee", "instrument_distribution", "scale"];
  input.adjustments = ["60", "-10", "-15", "20", "15"].map((bps, i) => {
    const adjustmentId = id(300 + i), p = `adjustment.${adjustmentId}.`;
    return {id: adjustmentId, terms: {bps: number(p + "bps", "basis_points", bps), family: text(p + "family", "convention", families[i]!),
      evidenceAnchor: text(p + "evidenceAnchor", "reference_id", "synthetic-market-object:" + i), methodologyVersion: text(p + "methodologyVersion", "reference_id", "synthetic-market-v1"),
      independentEffectGroup: text(p + "independentEffectGroup", "reference_id", families[i]!)}};
  });
  function addAction() {
    const actionId = id(350), p = `action.${actionId}.`;
    input.actions.push({id: actionId, terms: {convention: text(p + "convention", "convention", "marginal_spread_budget_estimate"),
      currentSpreadBps: number(p + "currentSpreadBps", "basis_points", "260"), proposedSpreadBps: number(p + "proposedSpreadBps", "basis_points", "190"),
      starts: list(p + "starts", "date", ["2026-05-01"]), ends: list(p + "ends", "date", ["2027-06-01"]), affectedPrincipal: list(p + "affectedPrincipal", "currency", ["40000000"]),
      yearFractions: list(p + "yearFractions", "ratio", ["1.08333333333333333333"]), timeBases: list(p + "timeBases", "convention", ["adopted_month_fraction"]),
      annualIndices: list(p + "annualIndices", "ratio", ["not_applicable"]), exposureAnchors: list(p + "exposureAnchors", "reference_id", ["synthetic-contract"]),
      costDates: list(p + "costDates", "date", ["2026-05-01", "2026-05-01"]), costAmounts: list(p + "costAmounts", "currency", ["400000", "1349200"]),
      costAnchors: list(p + "costAnchors", "reference_id", ["synthetic-fee", "synthetic-tax-scenario"]), costCoverage: text(p + "costCoverage", "convention", "complete_for_stated_horizon")}});
  }
  function seal() {const canonical = JSON.stringify(snapshot); input.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}; return input;}
  return {input, snapshot, entries, seal, addAction, contribute};
}

describe("relative debt cost over an adopted immutable basis", () => {
  it("reproduces the C03 bridge from both entities and retains all source dependencies", () => {
    const f = fixture(); const r = calculateAdoptedRelativeDebtCost(f.seal());
    expect(r.bridge).toMatchObject({grossBps: "125", knownAdjustmentsBps: "70", residualBps: "55", afterPricingDateBps: "65", causalAttribution: false});
    expect(r.contributions).toHaveLength(f.entries.length); expect(r.status).toBe("partial_composition");
    expect(r.grantsExecution).toBe(false); expect(r.grantsPublication).toBe(false);
    expect(calculateAdoptedRelativeDebtCost(f.seal())).toEqual(r);
  });
  it("calculates only the affected exposure and actual adopted fees and tax of the C03 scenario", () => {
    const f = fixture(); f.addAction(); const r = calculateAdoptedRelativeDebtCost(f.seal());
    expect(r.bridge?.residualBps).toBe("55"); expect(r.actions[0]!.result?.knownCosts).toBe("1749200");
    expect(r.actions[0]!.result?.nominalSavings).toBe("303333.3333333333333324");
    expect(r.contributions).toHaveLength(f.entries.length); expect(r.actions[0]!.result?.isDebtNpv).toBe(false);
  });
  it("denies changed bytes, other work, purpose, version and peer identity", () => {
    const f = fixture(), i = f.seal();
    expect(() => calculateAdoptedRelativeDebtCost({...i, envelope: {...i.envelope, canonical: i.envelope.canonical.replace('"260"', '"200"')}})).toThrow("adoption_basis_integrity_mismatch");
    for (const scope of [{...i.scope, workId: id(900)}, {...i.scope, purpose: "other purpose"}, {...i.scope, versionId: id(901)}]) expect(() => calculateAdoptedRelativeDebtCost({...i, scope})).toThrow("adoption_basis_scope_mismatch");
    expect(() => calculateAdoptedRelativeDebtCost({...i, peerEntityId: id(902)})).toThrow("relative_cost_basis_context_mismatch");
  });
  it("denies mismatch in definition, entity, period, scenario, currency, units or comparison", () => {
    for (const change of [{definitionVersionId: id(902)}, {entityId: id(902)}, {periodEnd: "2028-01-01"}, {scenario: "actual"}, {currency: "USD"}, {unit: "ratio"}, {scale: "100"}]) {
      const f = fixture(); f.entries[0]!.dimensions = {...f.entries[0]!.dimensions, ...change}; expect(() => calculateAdoptedRelativeDebtCost(f.seal())).toThrow();
    }
    const f = fixture(); f.entries[0]!.fieldPath = `relative_cost.${id(902)}.own.spreadBps`; expect(() => calculateAdoptedRelativeDebtCost(f.seal())).toThrow();
  });
  it("does not infer an absent market adjustment or use another available bps contribution", () => {
    const f = fixture(); f.input.adjustments[0]!.terms.bps = {...f.input.adjustments[0]!.terms.bps, decisionId: null, missingReason: "Missing comparable market sample"};
    const r = calculateAdoptedRelativeDebtCost(f.seal()); expect(r.bridge).toBeNull(); expect(r.gaps[0]!.reason).toBe("Missing comparable market sample");
  });
  it("rejects unlike indexers and a repeated or overlapping market effect", () => {
    let f = fixture(); f.entries.find(e => e.fieldPath.endsWith("peer.indexer"))!.value = {type: "text", value: "IPCA"}; expect(() => calculateAdoptedRelativeDebtCost(f.seal())).toThrow();
    f = fixture(); f.entries.find(e => e.fieldPath.endsWith(`adjustment.${f.input.adjustments[1]!.id}.independentEffectGroup`))!.value = {type: "text", value: "pricing_date"}; expect(() => calculateAdoptedRelativeDebtCost(f.seal())).toThrow();
  });
  it("denies free values and reuse of an observation through another contribution", () => {
    let f = fixture(); expect(() => calculateAdoptedRelativeDebtCost({...f.seal(), ownSpreadBps: "150"})).toThrow();
    f = fixture(); f.entries[0]!.observationId = id(700); f.entries[3]!.observationId = id(700); expect(() => calculateAdoptedRelativeDebtCost(f.seal())).toThrow("relative_cost_missing_or_reused_contribution");
  });
  it("keeps a supported bridge when the action lacks actual costs", () => {
    const f = fixture(); f.addAction(); f.entries.find(e => e.fieldPath.endsWith("costCoverage"))!.value = {type: "text", value: "incomplete"};
    const r = calculateAdoptedRelativeDebtCost(f.seal()); expect(r.bridge?.residualBps).toBe("55"); expect(r.actions[0]!.result?.netNominalBenefit).toBeNull(); expect(r.status).toBe("missing_inputs");
  });
  it("requires a monetary interpretation and rejects series/calendar/horizon mismatches", () => {
    let f = fixture(); f.addAction(); f.entries.find(e => e.fieldPath.endsWith("affectedPrincipal"))!.dimensions.scale = "1000000";
    expect(calculateAdoptedRelativeDebtCost(f.seal()).actions[0]!.result).toBeNull();
    f = fixture(); f.addAction(); f.entries.find(e => e.fieldPath.endsWith("affectedPrincipal"))!.value = {type: "list", value: ["40000000", "20000000"]}; expect(() => calculateAdoptedRelativeDebtCost(f.seal())).toThrow("relative_cost_action_series_mismatch");
    f = fixture(); f.addAction(); f.entries.find(e => e.fieldPath.endsWith("yearFractions"))!.value = {type: "list", value: ["1"]}; expect(() => calculateAdoptedRelativeDebtCost(f.seal())).toThrow();
  });
  it("accepts an explicitly adopted empty cost ledger without silently assuming a waiver", () => {
    const f = fixture(); f.addAction(); for (const suffix of ["costDates", "costAmounts", "costAnchors"]) f.entries.find(e => e.fieldPath.endsWith(suffix))!.value = {type: "list", value: []};
    const r = calculateAdoptedRelativeDebtCost(f.seal()); expect(r.actions[0]!.result?.knownCosts).toBe("0"); expect(r.status).toBe("partial_composition");
    f.input.actions[0]!.terms.costAmounts = {...f.input.actions[0]!.terms.costAmounts, decisionId: null, missingReason: "No adopted inventory"};
    expect(calculateAdoptedRelativeDebtCost(f.seal()).actions[0]!.result).toBeNull();
  });
  it("rejects future pricing, preserves old results after revision and changes the derived fingerprint", () => {
    const old = fixture(), r = calculateAdoptedRelativeDebtCost(old.seal());
    const revised = fixture(); revised.snapshot.versionId = id(501); revised.snapshot.revision = 2; revised.snapshot.previousVersionId = id(500); revised.input.scope.versionId = id(501);
    revised.entries[0]!.value = {type: "number", value: "270"}; expect(calculateAdoptedRelativeDebtCost(revised.seal()).fingerprint).not.toBe(r.fingerprint);
    expect(calculateAdoptedRelativeDebtCost(old.seal())).toEqual(r);
    revised.entries.find(e => e.fieldPath.endsWith("own.pricingDate"))!.value = {type: "date", value: "2028-01-01"}; expect(() => calculateAdoptedRelativeDebtCost(revised.seal())).toThrow("relative_cost_own_future_price");
  });
});
