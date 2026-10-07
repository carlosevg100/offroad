import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {calculateAdoptedFinancingProposal, type AdoptedFinancingProposalInput} from "./adopted-financing-proposal";
const id = (n: number) => `ad700000-0000-4000-9000-${String(n).padStart(12, "0")}`;
function fixture() {
  const entries: AdoptionBasisEntry[] = []; let n = 10;
  const proposalId = id(4); const prefix = `proposal.${proposalId}.`;
  function contribute(name: string, unit: string, value: AdoptionBasisEntry["value"]) {
    const decisionId = id(n++);
    entries.push({decisionId, slotKey: createHash("sha256").update(name).digest("hex"), kind: "hypothesis", fieldPath: prefix + name,
      dimensions: {entityId: id(1), perimeter: "standalone", periodStart: "2027-01-01", periodEnd: "2028-01-01", currency: "BRL", unit, scale: "1", scenario: "contract-scenario", definitionVersionId: id(2)},
      value, observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "contractual", actorId: id(3), reason: "Synthetic explicitly adopted contract operand"});
    return {decisionId, definitionVersionId: id(2), definitionKind: "contractual" as const, missingReason: null};
  }
  const number = (name: string, unit: string, value: string) => contribute(name, unit, {type: "number", value});
  const text = (name: string, value: string) => contribute(name, "convention", {type: "text", value});
  const list = (name: string, unit: string, value: string[]) => contribute(name, unit, {type: "list", value});
  const terms: AdoptedFinancingProposalInput["terms"] = {
    grossAdvance: number("grossAdvance", "currency", "100"), upfrontWithheldCosts: number("upfrontWithheldCosts", "currency", "1"), annualSpread: number("annualSpread", "ratio", "0.1"),
    unpaidInterestBase: text("unpaidInterestBase", "principal_plus_accrued"), costScope: text("costScope", "all_costs_withheld_at_advance"),
    lowerSpread: number("lowerSpread", "ratio", "-0.2"), upperSpread: number("upperSpread", "ratio", "1"),
    periodEnds: list("periodEnds", "date", ["2028-01-01"]), yearFractions: list("yearFractions", "ratio", ["1"]), annualIndex: list("annualIndex", "ratio", ["0"]),
    yearFractionConventions: list("yearFractionConventions", "convention", ["actual_365_fixed"]), businessDayCounts: null,
    scheduledPrincipal: list("scheduledPrincipal", "currency", ["100"]), paysAccruedInterest: list("paysAccruedInterest", "boolean", ["true"]),
    costAssessments: {origination_fee: text("costAssessments.origination_fee", "specified"), recurring_fee: text("costAssessments.recurring_fee", "zero"), tax: text("costAssessments.tax", "zero"), other: text("costAssessments.other", "zero")}};
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(100), setId: id(5), workId: id(6), purpose: "compare proposals", contextKey: "synthetic-contract", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const input: AdoptedFinancingProposalInput = {envelope: {canonical: "", fingerprint: ""}, scope: {workId: id(6), purpose: snapshot.purpose, versionId: snapshot.versionId},
    entityId: id(1), perimeter: "standalone", currency: "BRL", scenario: "contract-scenario", openingDate: "2027-01-01", endDate: "2028-01-01", proposalId, terms, numericInterpretations: []};
  function seal() {const canonical = JSON.stringify(snapshot); input.envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}; return input;}
  return {input, snapshot, entries, seal, contribute};
}
describe("adopted financing proposal cost component", () => {
  it("calculates only from selected immutable contributions and retains all dependencies", () => {
    const f = fixture(); const r = calculateAdoptedFinancingProposal(f.seal());
    expect(r.status).toBe("partial_composition"); expect(r.cost?.annualSpread).toBe("0.11111111111111111111");
    expect(r.schedule?.netFlows[0]!.amount).toBe("99"); expect(r.contributions).toHaveLength(f.entries.length);
    expect(r.derivedDependencies[0]!.decisionIds).toHaveLength(f.entries.length); expect(r.classification).toBe("working_hypothesis");
    expect(r.grantsExecution).toBe(false); expect(r.grantsPublication).toBe(false);
    expect(r.exclusions).toContain("company_liquidity"); expect(r.exclusions).toContain("choice_of_counterparty");
    expect(calculateAdoptedFinancingProposal(f.seal())).toEqual(r);
  });
  it("denies another work, purpose, basis version or altered canonical bytes", () => {
    const f = fixture(); const i = f.seal();
    for (const scope of [{...i.scope, workId: id(88)}, {...i.scope, purpose: "other purpose"}, {...i.scope, versionId: id(89)}]) expect(() => calculateAdoptedFinancingProposal({...i, scope})).toThrow("adoption_basis_scope_mismatch");
    expect(() => calculateAdoptedFinancingProposal({...i, envelope: {...i.envelope, canonical: i.envelope.canonical.replace('"100"', '"900"')}})).toThrow("adoption_basis_integrity_mismatch");
  });
  it("denies wrong entity, currency, definition, scenario, unit, period or proposal path", () => {
    for (const change of [{entityId: id(99)}, {currency: "USD"}, {definitionVersionId: id(99)}, {scenario: "actual"}, {unit: "ratio"}, {periodEnd: "2029-01-01"}]) {
      const f = fixture(); f.entries[0]!.dimensions = {...f.entries[0]!.dimensions, ...change}; expect(() => calculateAdoptedFinancingProposal(f.seal())).toThrow();
    }
    const f = fixture(); f.entries[0]!.fieldPath = `proposal.${id(90)}.grossAdvance`; expect(() => calculateAdoptedFinancingProposal(f.seal())).toThrow("proposal_basis_context_mismatch");
  });
  it("reports a directed gap without selecting another available contribution or using zero", () => {
    const f = fixture(); f.input.terms.annualSpread = {...f.input.terms.annualSpread, decisionId: null, missingReason: "Counterparty must confirm annual spread"};
    const r = calculateAdoptedFinancingProposal(f.seal()); expect(r.status).toBe("missing_inputs"); expect(r.schedule).toBeNull(); expect(r.cost).toBeNull();
    expect(r.gaps).toContainEqual({operand: `proposal.${f.input.proposalId}.annualSpread`, reason: "Counterparty must confirm annual spread"});
  });
  it("refuses free caller amounts and source conventions outside the adopted schema", () => {
    const f = fixture(); expect(() => calculateAdoptedFinancingProposal({...f.seal(), grossAdvance: "200"})).toThrow();
    const entry = f.entries.find(e => e.fieldPath.endsWith(".unpaidInterestBase"))!; entry.value = {type: "text", value: "whatever_is_cheapest"}; expect(() => calculateAdoptedFinancingProposal(f.seal())).toThrow();
  });
  it("denies one contribution or observation being counted in two distinct operands", () => {
    let f = fixture(); f.input.terms.upfrontWithheldCosts = f.input.terms.grossAdvance; expect(() => calculateAdoptedFinancingProposal(f.seal())).toThrow("proposal_basis_reused_contribution");
    f = fixture(); f.entries[0]!.observationId = id(70); f.entries[1]!.observationId = id(70); expect(() => calculateAdoptedFinancingProposal(f.seal())).toThrow("proposal_basis_missing_or_reused_contribution");
  });
  it("requires adopted numeric representation for non-unit monetary scales", () => {
    const f = fixture(); f.entries[0]!.dimensions.scale = "1000000";
    const r = calculateAdoptedFinancingProposal(f.seal()); expect(r.status).toBe("missing_inputs"); expect(r.schedule).toBeNull();
    expect(r.gaps.some(g => g.reason === "Numeric representation has not been adopted")).toBe(true);
  });
  it("normalizes reported money with an actual adopted interpretation and its member IDs", () => {
    const f = fixture(); const gross = f.entries[0]!; gross.dimensions.scale = "1000"; gross.value = {type: "number", value: "0.1"};
    const groupId = id(90);
    const mode = f.contribute("synthetic", "convention", {type: "text", value: "reported_in_declared_scale"});
    f.entries.at(-1)!.fieldPath = `numeric_representation.${groupId}.mode`;
    const members = f.contribute("synthetic-members", "contribution_ids", {type: "list", value: [gross.decisionId]});
    f.entries.at(-1)!.fieldPath = `numeric_representation.${groupId}.members`;
    f.input.numericInterpretations = [{id: groupId, mode: {decisionId: mode.decisionId, definitionVersionId: mode.definitionVersionId, definitionKind: mode.definitionKind}, members: {decisionId: members.decisionId, definitionVersionId: members.definitionVersionId, definitionKind: members.definitionKind}}];
    const r = calculateAdoptedFinancingProposal(f.seal()); expect(r.status).toBe("partial_composition"); expect(r.schedule?.operands.grossAdvance).toBe("100");
    expect(r.contributions.map(c => c.decisionId)).toContain(mode.decisionId); expect(r.contributions.map(c => c.decisionId)).toContain(members.decisionId);
  });
  it("keeps unknown tax unknown and does not publish an effective spread", () => {
    const f = fixture(); f.entries.find(e => e.fieldPath.endsWith("costAssessments.tax"))!.value = {type: "text", value: "unknown"};
    const r = calculateAdoptedFinancingProposal(f.seal()); expect(r.status).toBe("missing_inputs"); expect(r.cost?.annualSpread).toBeNull(); expect(r.gaps.some(g => g.operand.endsWith("costAssessments.tax"))).toBe(true);
  });
  it("reports additional or unknown cash costs as unsupported by this bounded component", () => {
    for (const scope of ["additional_cash_costs", "unknown"]) {
      const f = fixture(); f.entries.find(e => e.fieldPath.endsWith(".costScope"))!.value = {type: "text", value: scope};
      const r = calculateAdoptedFinancingProposal(f.seal()); expect(r.status).toBe("missing_inputs"); expect(r.cost).toBeNull();
    }
  });
  it("refuses cost assessments that contradict a positive aggregate withholding", () => {
    const f = fixture(); f.entries.find(e => e.fieldPath.endsWith("costAssessments.origination_fee"))!.value = {type: "text", value: "zero"};
    expect(() => calculateAdoptedFinancingProposal(f.seal())).toThrow("proposal_cost_inventory_contradicts_withholding");
  });
  it("refuses mismatched series and horizons rather than cutting a schedule", () => {
    let f = fixture(); f.entries.find(e => e.fieldPath.endsWith(".annualIndex"))!.value = {type: "list", value: ["0", "0"]}; expect(() => calculateAdoptedFinancingProposal(f.seal())).toThrow("proposal_basis_series_length_mismatch");
    f = fixture(); f.entries.find(e => e.fieldPath.endsWith(".periodEnds"))!.value = {type: "list", value: ["2027-12-31"]}; expect(() => calculateAdoptedFinancingProposal(f.seal())).toThrow("proposal_basis_horizon_mismatch");
  });
  it("requires DU/252 counts and does not ignore counts presented under ACT/365", () => {
    let f = fixture(); f.entries.find(e => e.fieldPath.endsWith(".yearFractionConventions"))!.value = {type: "list", value: ["business_days_252"]};
    expect(calculateAdoptedFinancingProposal(f.seal()).gaps.some(g => g.operand.endsWith("businessDayCounts"))).toBe(true);
    f = fixture(); f.input.terms.businessDayCounts = f.contribute("businessDayCounts", "count", {type: "list", value: ["252"]});
    expect(() => calculateAdoptedFinancingProposal(f.seal())).toThrow("proposal_unused_business_day_counts");
  });
  it("preserves an old basis after revision and changes the derived fingerprint under new data", () => {
    const old = fixture(); const original = calculateAdoptedFinancingProposal(old.seal());
    const revised = fixture(); revised.snapshot.versionId = id(101); revised.snapshot.revision = 2; revised.snapshot.previousVersionId = id(100); revised.input.scope.versionId = id(101);
    revised.entries.find(e => e.fieldPath.endsWith(".annualSpread"))!.value = {type: "number", value: "0.2"};
    expect(calculateAdoptedFinancingProposal(revised.seal()).fingerprint).not.toBe(original.fingerprint);
    expect(calculateAdoptedFinancingProposal(old.seal())).toEqual(original);
  });
});
