import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {capitalDecisionReviewFixture, capitalContractPreparationFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {capitalContractAdoptionFixture} from "./capital-contract-adoptions.test-support";
import {capitalContractPreparationInputSchema, prepareCapitalContractEvidence} from "./capital-contract-preparation";
import {capitalProcedurePacketInputSchema, capitalProcedurePacketOutputSchema, prepareCapitalProcedurePacket} from "./capital-procedure-packet";
import {capitalProcedurePacketExecutorContracts} from "./capital-executor-contracts";
import {matchesMethodValue} from "@offroad/credit-playbook";
const setup = () => capitalProcedurePacketInputSchema.parse({decision: {review: capitalDecisionReviewFixture().input,
  material: {requested: false, audience: "authorized_work_participants"}}, contracts: [], adoptionLinks: []});
function integrated() {
  const f = capitalDecisionReviewFixture(); const c = capitalContractAdoptionFixture();
  const p = f.input.composition.alternatives[0]!.projection.operating;
  for (const e of f.snapshot.entries) e.dimensions.perimeter = "consolidated";
  c.input.ratio.scope = p.scope; c.input.ratio.entityId = p.entityId; c.input.ratio.scenario = p.scenario;
  c.input.ratio.measurementDate = p.endDate;
  const ltmStart = `${Number(p.endDate.slice(0, 4)) - 1}-03-01`;
  c.input.ratio.denominator.periodStart = ltmStart; c.snapshot.entries[1]!.dimensions.periodStart = ltmStart;
  for (const e of c.snapshot.entries) Object.assign(e.dimensions, {entityId: p.entityId, scenario: p.scenario, periodEnd: p.endDate});
  Object.assign(c.input.preparation, {workId: p.scope.workId, purpose: p.scope.purpose, entityId: p.entityId, scenario: p.scenario, asOf: p.endDate});
  c.input.preparation.covenants!.asOfDate = p.endDate;
  c.input.preparation.covenants!.componentValues.forEach(e => {e.asOf = p.endDate;});
  c.input.preparation.covenants!.ltmEbitda!.asOf = p.endDate;
  const prepared = prepareCapitalContractEvidence(c.input.preparation);
  c.input.origins.forEach(o => {o.calculationFingerprint = prepared.fingerprint;});
  f.snapshot.entries.push(...c.snapshot.entries as unknown as typeof f.snapshot.entries);
  const canonical = JSON.stringify(f.snapshot); const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  for (const a of [...f.input.composition.alternatives, ...f.input.composition.sensitivities]) {
    a.projection.operating.envelope = envelope; a.projection.operating.perimeter = "consolidated";
    a.projection.funding.input.envelope = envelope; a.projection.funding.input.perimeter = "consolidated";
  }
  c.input.ratio.envelope = envelope;
  f.input.ratios.push({id: "leverage", alternativeId: "maintain", input: c.input.ratio});
  return capitalProcedurePacketInputSchema.parse({decision: {review: f.input, material: {requested: false, audience: "authorized_work_participants"}},
    contracts: [{id: "contract", alternativeId: "maintain", preparation: c.input.preparation}],
    adoptionLinks: [{contractId: "contract", ratioId: "leverage", instrumentId: "debt", definitions: c.input.definitions, origins: c.input.origins}]});
}
describe("capital procedure packet", () => {
  it("recomputes comparison without inventing contract coverage", () => {
    const r = prepareCapitalProcedurePacket(setup()); expect(r.decision.alternatives[0]!.projection.summary!.closingAvailable).toBe("123");
    expect(r.contracts).toEqual([]); expect(r.adoptionLinks).toEqual([]); expect(r.status).toBe("partial");
  });
  it("frames a decision without company intake or fabricated contractual evidence", () => {
    const f = setup(); f.decision.review.composition.alternatives = []; f.decision.review.composition.sensitivities = []; f.decision.review.alternativeConditions = [];
    const r = prepareCapitalProcedurePacket(f); expect(r.status).toBe("framed"); expect(r.contractSourceVersionIds).toEqual([]);
  });
  it("carries source calculation and matching adopted contributions without implying legal approval", () => {
    const f = integrated(); const before = JSON.stringify(f); const r = prepareCapitalProcedurePacket(f);
    expect(r.adoptionLinks[0]!.result.status).toBe("aligned"); expect(r.adoptionLinks[0]!.result.alignment.map(a => a.calculated)).toEqual(["150", "100", "2"]);
    expect(r.decision.ratios[0]!.numerator).toBe("150"); expect(r.status).toBe("partial");
    expect(r.contractualGaps[0]!.code).toBe("contract_source_interpretation_and_applicability_review_required");
    expect(JSON.stringify(f)).toBe(before); expect(r.mutatesWorkingBasis).toBe(false);
  });
  it("preserves a differing contract calculation and the original adopted amount", () => {
    const f = integrated(); const prep = f.contracts[0]!.preparation;
    prep.covenants!.componentValues[0]!.value = "201";
    const fingerprint = prepareCapitalContractEvidence(prep).fingerprint;
    f.adoptionLinks[0]!.origins.forEach(o => {o.calculationFingerprint = fingerprint;});
    const r = prepareCapitalProcedurePacket(f); expect(r.adoptionLinks[0]!.result.status).toBe("divergent");
    expect(r.adoptionLinks[0]!.result.alignment[0]).toMatchObject({calculated: "151", selected: "150"});
    expect(r.decision.ratios[0]!.numerator).toBe("150"); expect(r.status).toBe("partial");
  });
  it("keeps an unlinked contractual ratio visibly incomplete", () => {
    const f = integrated(); f.contracts = []; f.adoptionLinks = [];
    expect(prepareCapitalProcedurePacket(f).contractualGaps).toContainEqual({subjectId: "leverage", code: "contract_preparation_and_adoption_link_required"});
  });
  it("does not claim that a calculated covenant is already adopted", () => {
    const f = integrated(); f.adoptionLinks = [];
    expect(prepareCapitalProcedurePacket(f).contractualGaps).toContainEqual({subjectId: "contract", code: "calculated_covenant_not_linked_to_adopted_ratio"});
  });
  it("rejects another alternative source context and substituted references", () => {
    const f = integrated(); f.contracts[0]!.preparation.scenario = "foreign"; expect(() => prepareCapitalProcedurePacket(f)).toThrow(/context/);
    const g = integrated(); g.adoptionLinks[0]!.contractId = "foreign"; expect(() => prepareCapitalProcedurePacket(g)).toThrow(/reference/);
    const h = integrated(); h.contracts[0]!.alternativeId = "foreign"; expect(() => prepareCapitalProcedurePacket(h)).toThrow(/alternative/);
  });
  it("rejects duplicate bindings extra authority and free calculated results", () => {
    const f = integrated(); f.adoptionLinks.push(f.adoptionLinks[0]!); expect(() => prepareCapitalProcedurePacket(f)).toThrow(/Duplicate/);
    expect(() => prepareCapitalProcedurePacket({...setup(), result: {approved: true}})).toThrow();
    expect(capitalProcedurePacketOutputSchema.safeParse({...prepareCapitalProcedurePacket(setup()), grantsExecution: true}).success).toBe(false);
  });
  it("preserves interest timing review rather than equating principal and cash schedules", () => {
    const f = integrated(); const base = capitalContractPreparationInputSchema.parse(capitalContractPreparationFixture()); const prep = f.contracts[0]!.preparation;
    prep.interest = JSON.parse(JSON.stringify(base.interest).replaceAll("2026-01-01", prep.asOf).replaceAll("2027-01-01", "2028-02-28"));
    prep.interestConventions = base.interestConventions;
    f.adoptionLinks = [];
    const r = prepareCapitalProcedurePacket(f); expect(r.contracts[0]!.result.interest!.trace.calculations.length).toBeGreaterThan(0);
    expect(r.contractualGaps).toContainEqual({subjectId: "contract", code: "interest_cash_timing_and_adoption_review_required"});
  });
  it("refuses silent legacy defaults through the composed entrypoint", () => {
    const f = integrated(); const raw = JSON.parse(JSON.stringify(f));
    raw.contracts[0].preparation.interest = JSON.parse(JSON.stringify(capitalContractPreparationFixture().interest)
      .replaceAll("2026-01-01", raw.contracts[0].preparation.asOf).replaceAll("2027-01-01", "2028-02-28"));
    raw.contracts[0].preparation.interestConventions = capitalContractPreparationFixture().interestConventions;
    delete raw.contracts[0].preparation.interest.ledgerControl;
    expect(() => prepareCapitalProcedurePacket(raw)).toThrow("capital_contract_explicit_terms_required");
  });
  it("pins complete typed schemas and reproduces outputs without model calls", () => {
    const f = integrated(); const a = prepareCapitalProcedurePacket(f); expect(prepareCapitalProcedurePacket(f)).toEqual(a);
    const c = capitalProcedurePacketExecutorContracts(); expect(matchesMethodValue(c.inputs.value, f)).toBe(true); expect(matchesMethodValue(c.outputs.value, a)).toBe(true);
    expect(readFileSync(new URL("../contracts/capital-procedure-packet.json", import.meta.url), "utf8")).toBe(JSON.stringify(c) + "\n");
    expect(a.grantsPublication).toBe(false); expect(a.requiresLiveRightsCheck).toBe(true);
  });
});
