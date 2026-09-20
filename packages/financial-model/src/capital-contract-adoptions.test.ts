import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {readContextualBasis} from "@offroad/reconciliation";
import {adoptedDefinedRatioFixture, capitalContractPreparationFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {capitalContractPreparationInputSchema, prepareCapitalContractEvidence} from "./capital-contract-preparation";
import {reconcileCapitalContractAdoptions} from "./capital-contract-adoptions";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const ratio = adoptedDefinedRatioFixture(); const snapshot = readContextualBasis(ratio.input.envelope, ratio.input.scope);
  ratio.input.perimeter = "consolidated";
  snapshot.entries.forEach((e, n) => {e.dimensions.perimeter = "consolidated"; e.kind = "observation"; e.observationId = id(500 + n);});
  snapshot.entries[0]!.value = {type: "number", value: "150"}; snapshot.entries[2]!.value = {type: "number", value: "2"};
  const refresh = () => {const canonical = JSON.stringify(snapshot); ratio.input.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};}; refresh();
  const preparation = capitalContractPreparationInputSchema.parse({...capitalContractPreparationFixture(), interest: null, interestConventions: null});
  Object.assign(preparation, {workId: ratio.input.scope.workId, purpose: ratio.input.scope.purpose, entityId: ratio.input.entityId, perimeter: ratio.input.perimeter,
    currency: ratio.input.currency, scenario: ratio.input.scenario, asOf: ratio.input.measurementDate});
  const c = preparation.covenants!; c.asOfDate = preparation.asOf;
  c.componentValues.forEach(e => {e.asOf = preparation.asOf;}); c.ltmEbitda!.asOf = preparation.asOf;
  const calculated = prepareCapitalContractEvidence(preparation);
  const definitions = (["numerator", "denominator", "limit"] as const).map((field, n) => ({field,
    versionId: snapshot.entries[n]!.dimensions.definitionVersionId!, kind: "contractual" as const,
    definition: field === "numerator" ? "Loans less cash" : field === "denominator" ? "LTM EBITDA" : "Upper leverage threshold",
    contractSourceVersionId: preparation.sources[0]!.sourceVersionId, contractAnchor: {clause: "1.1", page: 1}}));
  const origins = definitions.map((d, n) => ({field: d.field, decisionId: snapshot.entries[n]!.decisionId,
    observationId: snapshot.entries[n]!.observationId!, sourceVersionId: id(900), calculationFingerprint: calculated.fingerprint,
    instrumentId: "debt", sourceVersionIds: calculated.sourceVersionIds, observationIds: calculated.observationIds}));
  return {input: {preparation, ratio: ratio.input, instrumentId: "debt", definitions, origins}, snapshot, refresh};
}
describe("contract calculation to contextual adoption", () => {
  it("rejects an omitted defaulted contract term before the outer schema fills it", () => {
    const raw = JSON.parse(JSON.stringify(fixture().input)); delete raw.preparation.covenants.reported;
    expect(() => reconcileCapitalContractAdoptions(raw)).toThrow("capital_contract_explicit_terms_required");
  });
  it("aligns exact definitions and derivation receipts without adopting or overwriting", () => {
    const f = fixture(); const before = JSON.stringify(f.input); const r = reconcileCapitalContractAdoptions(f.input);
    expect(r.status).toBe("aligned"); expect(r.alignment.map(a => a.calculated)).toEqual(["150", "100", "2"]);
    expect(r.alignment.every(a => a.originBindingsMatch && a.definitionBindingsMatch && a.numericMatch)).toBe(true);
    expect(JSON.stringify(f.input)).toBe(before); expect(r.mutatesWorkingBasis).toBe(false);
    expect(r.sourceReviewRequired).toBe(true); expect(r.requiresLiveRightsCheck).toBe(true); expect(r.certifiesContractualCompliance).toBe(false);
  });
  it("retains a divergent selection rather than silently replacing it with the calculation", () => {
    const f = fixture(); f.snapshot.entries[0]!.value = {type: "number", value: "151"}; f.refresh();
    const r = reconcileCapitalContractAdoptions(f.input); expect(r.status).toBe("divergent");
    expect(r.alignment[0]).toMatchObject({calculated: "150", selected: "151", numericMatch: false});
    expect(f.snapshot.entries[0]!.value.value).toBe("151");
  });
  it("does not turn an equal-value hypothesis into an adoption of the calculated observation", () => {
    const f = fixture(); f.snapshot.entries[0]!.kind = "hypothesis"; f.refresh();
    const r = reconcileCapitalContractAdoptions(f.input); expect(r.status).toBe("unresolved");
    expect(r.alignment[0]!.reasons).toContain("explicit_hypothesis_not_calculation_adoption");
  });
  it("keeps missing origin and definition records unresolved even when numbers agree", () => {
    const f = fixture(); f.input.origins = []; f.input.definitions = [];
    const r = reconcileCapitalContractAdoptions(f.input); expect(r.status).toBe("unresolved");
    expect(r.alignment[0]!.numericMatch).toBe(true); expect(r.alignment[0]!.originBindingsMatch).toBe(false);
  });
  it("rejects a definition from another version source clause or text", () => {
    for (const change of [{versionId: id(888)}, {contractSourceVersionId: id(888)}, {contractAnchor: {clause: "9.9", page: 1}}, {definition: "Generic EBITDA"}]) {
      const f = fixture(); Object.assign(f.input.definitions[0]!, change); expect(() => reconcileCapitalContractAdoptions(f.input)).toThrow(/definition/);
    }
  });
  it("rejects a derivation fingerprint observation or parent source substituted by the caller", () => {
    for (const change of [{calculationFingerprint: "0".repeat(64)}, {observationId: id(888)}, {sourceVersionIds: [id(888)]}, {observationIds: [id(888)]}, {instrumentId: "foreign"}]) {
      const f = fixture(); Object.assign(f.input.origins[0]!, change); expect(() => reconcileCapitalContractAdoptions(f.input)).toThrow(/derivation/);
    }
  });
  it("refuses another work context and a non-LTM denominator interval", () => {
    const f = fixture(); f.input.preparation.workId = id(888); expect(() => reconcileCapitalContractAdoptions(f.input)).toThrow(/context/);
    const g = fixture(); g.input.ratio.denominator.periodStart = "2027-02-01"; g.snapshot.entries[1]!.dimensions.periodStart = "2027-02-01"; g.refresh();
    expect(() => reconcileCapitalContractAdoptions(g.input)).toThrow(/period/);
  });
  it("keeps an opposite comparator unresolved instead of declaring compliance", () => {
    const f = fixture(); f.snapshot.entries[3]!.value = {type: "text", value: "gte"}; f.refresh();
    const r = reconcileCapitalContractAdoptions(f.input); expect(r.status).toBe("unresolved"); expect(r.directionMatches).toBe(false);
  });
  it("detects a sub-display discrepancy without rounding it into agreement", () => {
    const f = fixture(); f.snapshot.entries[2]!.value = {type: "number", value: "2.000000000001"}; f.refresh();
    const r = reconcileCapitalContractAdoptions(f.input); expect(r.status).toBe("divergent"); expect(r.alignment[2]!.numericMatch).toBe(false);
  });
  it("rejects duplicate field receipts and self-referencing derived source versions", () => {
    const f = fixture(); f.input.origins[1]!.field = "numerator"; expect(() => reconcileCapitalContractAdoptions(f.input)).toThrow(/Duplicate/);
    const g = fixture(); g.input.origins[0]!.sourceVersionId = g.input.preparation.sources[0]!.sourceVersionId;
    expect(() => reconcileCapitalContractAdoptions(g.input)).toThrow(/derivation/);
  });
  it("preserves known selected operands when another required input is missing", () => {
    const f = fixture(); f.input.ratio.denominator.selection.decisionId = null; f.input.ratio.denominator.selection.missingReason = "Synthetic missing denominator";
    f.input.origins = f.input.origins.filter(o => o.field !== "denominator");
    const r = reconcileCapitalContractAdoptions(f.input); expect(r.status).toBe("unresolved");
    expect(r.alignment[0]!.selected).toBe("150"); expect(r.alignment[1]!.selected).toBeNull(); expect(r.alignment[2]!.selected).toBe("2");
  });
  it("matches equivalent tier representations without comparing by rounded display", () => {
    const f = fixture(); f.input.preparation.covenants!.instruments.forEach(i => {if (i.source === "indenture") i.tiers[0]!.limit = "2.00";});
    const p = prepareCapitalContractEvidence(f.input.preparation); f.input.origins.forEach(o => {o.calculationFingerprint = p.fingerprint;});
    expect(reconcileCapitalContractAdoptions(f.input).status).toBe("aligned");
  });
  it("keeps the twelve-month interval correct at a leap-year month end", () => {
    const f = fixture(); const asOf = "2028-02-29"; f.input.ratio.measurementDate = asOf;
    f.input.ratio.denominator.periodStart = "2027-03-01";
    f.snapshot.entries.forEach(e => {e.dimensions.periodEnd = asOf;}); f.snapshot.entries[1]!.dimensions.periodStart = "2027-03-01"; f.refresh();
    const p = f.input.preparation; p.asOf = asOf; p.covenants!.asOfDate = asOf;
    p.covenants!.componentValues.forEach(e => {e.asOf = asOf;}); p.covenants!.ltmEbitda!.asOf = asOf;
    const c = prepareCapitalContractEvidence(p); f.input.origins.forEach(o => {o.calculationFingerprint = c.fingerprint;});
    expect(reconcileCapitalContractAdoptions(f.input).status).toBe("aligned");
  });
  it("reproduces the same linkage and retains all parent and derivative source dependencies", () => {
    const f = fixture(); const r = reconcileCapitalContractAdoptions(f.input);
    expect(reconcileCapitalContractAdoptions(f.input)).toEqual(r); expect(r.sourceVersionIds).toEqual([f.input.preparation.sources[0]!.sourceVersionId, id(900)]);
    f.input.origins.forEach(o => {o.sourceVersionId = id(901);}); expect(reconcileCapitalContractAdoptions(f.input).fingerprint).not.toBe(r.fingerprint);
  });
});
