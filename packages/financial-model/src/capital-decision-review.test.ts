import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {capitalDecisionReviewFixture, adoptedDefinedRatioFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {reviewDecisionMarketReference} from "@offroad/market-reference";
import {prepareCapitalDecisionReview} from "./index";
function setup() {
  const f = capitalDecisionReviewFixture();
  const seal = () => {const canonical = JSON.stringify(f.snapshot); const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
    for (const a of [...f.input.composition.alternatives, ...f.input.composition.sensitivities]) {a.projection.operating.envelope = envelope; a.projection.funding.input.envelope = envelope;}
    for (const r of f.input.ratios) r.input.envelope = envelope;
    return f.input;};
  return {...f, seal};
}
function addReference(f: ReturnType<typeof setup>) {
  const a = f.input.composition.alternatives[0]!; const c = f.input.alternativeConditions[0]!;
  const entry = f.snapshot.entries.find(e => e.decisionId === a.projection.funding.input.instruments[0]!.terms.couponRates.decisionId)!;
  entry.kind = "observation"; entry.observationId = "a0000000-0000-4000-8000-000000000001";
  c.instrument = "ccb"; c.indexer = "none"; c.marketReferenceIds = ["terms"];
  const reference = {id: "terms", sourceVersionId: "a0000000-0000-4000-8000-000000000002", observationIds: [entry.observationId],
    observedOn: "2027-01-01", validUntil: "2027-01-31", instrument: "ccb" as const, currency: "BRL", indexer: "none",
    subjectEntityId: a.projection.operating.entityId, kind: "indicative_terms" as const, rightsState: "eligible" as const,
    qualifier: "Synthetic conditional terms, not a funding commitment"};
  f.input.marketReferences.push(reference); return f.input.marketReferences[0]!;
}
describe("capital decision review composition", () => {
  it("keeps numerical preparation separate from unfinished professional reviews", () => {
    const r = prepareCapitalDecisionReview(setup().input);
    expect(r.composition.status).toBe("comparison_prepared"); expect(r.sufficiency.status).toBe("partial");
    expect(r.sufficiency.pendingDomains).toHaveLength(6); expect(r.grantsApproval).toBe(false); expect(r.grantsExecution).toBe(false);
  });
  it("preserves framing without entity intake or numerical alternatives", () => {
    const f = setup(); f.input.composition.alternatives = []; f.input.composition.sensitivities = []; f.input.alternativeConditions = [];
    expect(prepareCapitalDecisionReview(f.input).sufficiency.status).toBe("framed");
  });
  it("retains conditions even after proposed reviews are supported", () => {
    const f = setup(); const id = f.input.composition.alternatives[0]!.projection.operating.revenue.quantities.decisionId!;
    f.input.reviewItems.forEach(r => {r.status = "supported"; r.evidenceIds = [id];});
    f.input.reviewItems[4]!.status = "conditional";
    const r = prepareCapitalDecisionReview(f.input); expect(r.sufficiency.status).toBe("prepared_for_human_review");
    expect(r.sufficiency.conditions).toHaveLength(1); expect(r.sufficiency.humanDecision).toBeNull(); expect(r.grantsApproval).toBe(false);
  });
  it("refuses a supported review without evidence or with an unrelated reference", () => {
    const f = setup(); f.input.reviewItems[0]!.status = "supported"; expect(() => prepareCapitalDecisionReview(f.input)).toThrow(/review_invalid/);
    f.input.reviewItems[0]!.evidenceIds = ["unrelated"]; expect(() => prepareCapitalDecisionReview(f.input)).toThrow(/evidence_missing/);
  });
  it("does not use another alternative's contribution to ground a security condition", () => {
    const f = setup(); const other = f.input.composition.alternatives[1]!.projection.operating.revenue.quantities.decisionId!;
    f.input.alternativeConditions[0]!.security = [{description: "Synthetic security", basisIds: [other]}];
    expect(() => prepareCapitalDecisionReview(f.input)).toThrow(/condition_basis_mismatch/);
  });
  it("keeps ungrounded security and missing alternative reviews as material gaps", () => {
    const f = setup(); f.input.alternativeConditions.pop(); f.input.alternativeConditions[0]!.security = [{description: "Unconfirmed collateral", basisIds: []}];
    const r = prepareCapitalDecisionReview(f.input); expect(r.sufficiency.unresolved).toContain("conditions:maintain:basis_required");
    expect(r.sufficiency.unresolved).toContain("conditions:change:missing");
  });
  it("uses the instrument catalogue for identity without default sizing pricing or ranking", () => {
    const f = setup(); f.input.alternativeConditions[0]!.instrument = "ccb"; f.input.alternativeConditions[0]!.indexer = "none";
    const r = prepareCapitalDecisionReview(f.input); expect(r.conditions[0]!.instrumentIdentity!.id).toBe("ccb");
    expect(Object.keys(r.conditions[0]!.instrumentIdentity!)).toEqual(["id", "labels", "issuerRole"]);
    expect(r.sufficiency.unresolved).toContain("market:maintain:terms_unconfirmed"); expect(r.composition.ranking).toBeNull();
  });
  it("keeps eligible indicative terms conditional and never confirms funding availability", () => {
    const f = setup(); addReference(f); const r = prepareCapitalDecisionReview(f.seal());
    expect(r.conditions[0]!.references[0]!.status).toBe("terms_for_review"); expect(r.confirmsFundingAvailability).toBe(false);
    expect(r.conditions[0]!.references[0]!.requiresLiveRightsCheck).toBe(true);
  });
  it("never upgrades market context for another issuer into client terms", () => {
    const f = setup(); const ref = addReference(f); ref.kind = "market_context"; ref.subjectEntityId = null;
    const r = prepareCapitalDecisionReview(f.seal()); expect(r.conditions[0]!.references[0]!.status).toBe("context_only");
    expect(r.sufficiency.unresolved).toContain("market:maintain:terms_unconfirmed");
  });
  it("rejects expired future revoked and foreign entity references without importing a price", () => {
    for (const change of [{validUntil: "2026-12-31", observedOn: "2026-12-01"}, {observedOn: "2027-01-02"}, {rightsState: "revoked" as const}, {subjectEntityId: "a0000000-0000-4000-8000-000000000003"}]) {
      const f = setup(); Object.assign(addReference(f), change); const r = prepareCapitalDecisionReview(f.seal());
      expect(r.conditions[0]!.references[0]!.status).toBe("unusable_for_comparison");
    }
  });
  it("rejects references whose observations were not selected and impossible metadata dates", () => {
    const f = setup(); const ref = addReference(f); ref.observationIds = ["a0000000-0000-4000-8000-000000000004"];
    const r = prepareCapitalDecisionReview(f.seal()); expect(r.conditions[0]!.references[0]!.reasons).toContain("selected_observation_missing");
    expect(() => reviewDecisionMarketReference({...ref, observedOn: "2027-02-30"}, {asOf: "2027-03-01", entityId: ref.subjectEntityId!, instrument: "ccb", currency: "BRL", indexer: "none", selectedObservationIds: ref.observationIds})).toThrow(/invalid/);
  });
  it("rejects unknown alternatives unused market entries and duplicate identities", () => {
    const f = setup(); f.input.alternativeConditions[0]!.id = "unknown"; expect(() => prepareCapitalDecisionReview(f.input)).toThrow(/unknown_alternative/);
    const g = setup(); addReference(g); g.input.alternativeConditions[0]!.marketReferenceIds = []; expect(() => prepareCapitalDecisionReview(g.seal())).toThrow(/unused_market_reference/);
    const h = setup(); h.input.reviewItems.push(h.input.reviewItems[0]!); expect(() => prepareCapitalDecisionReview(h.input)).toThrow(/Duplicate/);
  });
  it("recomputes a defined ratio under the alternative basis and preserves an adverse result", () => {
    const f = setup(); const ratio = adoptedDefinedRatioFixture(); const a = f.input.composition.alternatives[0]!.projection.operating;
    ratio.input.scope = a.scope; ratio.input.measurementDate = a.endDate;
    ratio.snapshot.entries.forEach(e => {e.dimensions.periodEnd = a.endDate;}); ratio.snapshot.entries[0]!.value.value = "400";
    // The fixture permits dimensional null currencies; the snapshot parser checks actual bytes.
    f.snapshot.entries.push(...ratio.snapshot.entries as unknown as typeof f.snapshot.entries);
    f.input.ratios.push({id: "defined-leverage", alternativeId: "maintain", input: ratio.input});
    const r = prepareCapitalDecisionReview(f.seal()); expect(r.ratios[0]!.result.calculation!.satisfiesDefinedBoundary).toBe(false);
    expect(r.sufficiency.unresolved).toContain("ratio:defined-leverage:outside_defined_boundary");
    expect(r.certifiesContractualCompliance).toBe(false);
    f.input.ratios[0]!.input.scenario = "foreign"; expect(() => prepareCapitalDecisionReview(f.seal())).toThrow(/context/);
  });
  it("reproduces the same review and preserves the caller's contributions", () => {
    const f = setup(); const before = JSON.stringify(f.input); const r = prepareCapitalDecisionReview(f.input);
    expect(prepareCapitalDecisionReview(f.input)).toEqual(r); expect(JSON.stringify(f.input)).toBe(before);
  });
});
