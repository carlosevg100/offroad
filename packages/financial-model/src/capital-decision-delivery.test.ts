import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {capitalDecisionReviewFixture, adoptedDefinedRatioFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {capitalDecisionDeliveryOutputSchema, prepareCapitalDecisionDelivery} from "./capital-decision-delivery";
const setup = () => ({review: capitalDecisionReviewFixture().input, material: {requested: false, audience: "authorized_work_participants" as const}});
describe("capital decision delivery", () => {
  it("delivers calculated rows with explicit restrictions and references", () => {
    const r = prepareCapitalDecisionDelivery(setup());
    expect(r.alternatives[0]!.projection.summary!.closingAvailable).toBe("123");
    expect(r.alternatives[1]!.projection.summary!.closingAvailable).toBe("144.5");
    expect(r.status).toBe("partial"); expect(r.pendingReviewDomains).toHaveLength(6);
    expect(r.reviewItems).toHaveLength(6); expect(r.alternativeConditions).toHaveLength(2);
    expect(r.provenance.requiresPinnedInputAndManifest).toBe(true);
    expect(r.alternatives[0]!.projection.hypothesisIds.length).toBeGreaterThan(0);
  });
  it("frames without a company or financial inputs and without inventing a projection", () => {
    const f = setup(); f.review.composition.alternatives = []; f.review.composition.sensitivities = []; f.review.alternativeConditions = [];
    const r = prepareCapitalDecisionDelivery(f); expect(r.status).toBe("framed"); expect(r.alternatives).toEqual([]);
    expect(r.nextRequirements).toContain("adopted_context"); expect(r.provenance.contributionIds).toEqual([]);
  });
  it("prepares material only on request while never publishing or deciding", () => {
    const f = setup(); expect(prepareCapitalDecisionDelivery(f).material.state).toBe("not_requested");
    f.material.requested = true; const r = prepareCapitalDecisionDelivery(f);
    expect(r.material.state).toBe("prepared_for_review"); expect(r.material.published).toBe(false);
    expect(r.humanDecision).toBeNull(); expect(r.grantsExecution).toBe(false); expect(r.grantsPublication).toBe(false);
    expect(r.confirmsFundingAvailability).toBe(false); expect(r.certifiesContractualCompliance).toBe(false);
  });
  it("preserves conditional reviews and the facts that would change the recommendation", () => {
    const f = setup(); const id = f.review.composition.alternatives[0]!.projection.operating.revenue.quantities.decisionId!;
    f.review.reviewItems.forEach(r => {r.status = "supported"; r.evidenceIds = [id];});
    f.review.reviewItems[4]!.status = "conditional";
    const r = prepareCapitalDecisionDelivery(f); expect(r.status).toBe("prepared_for_human_review");
    expect(r.conditionalReviews).toHaveLength(1); expect(r.humanDecision).toBeNull();
    expect(r.alternatives[0]!.disconfirmers).toEqual(f.review.composition.alternatives[0]!.disconfirmers);
  });
  it("retains adverse sensitivity rows and changed contribution identities", () => {
    const r = prepareCapitalDecisionDelivery(setup()); expect(r.sensitivities[0]!.projection.summary!.closingAvailable).toBe("83");
    expect(r.sensitivities[0]!.changedContributions.length).toBeGreaterThan(0);
    expect(r.sensitivities[0]!.baseAlternativeId).toBe("maintain");
  });
  it("refuses free results extra privileges and a different audience", () => {
    const f = setup();
    expect(() => prepareCapitalDecisionDelivery({...f, result: {closingAvailable: "999"}})).toThrow();
    expect(() => prepareCapitalDecisionDelivery({...f, grantsExecution: true})).toThrow();
    expect(() => prepareCapitalDecisionDelivery({...f, material: {...f.material, audience: "public"}})).toThrow();
    const result = prepareCapitalDecisionDelivery(f);
    expect(capitalDecisionDeliveryOutputSchema.safeParse({...result, grantsPublication: true}).success).toBe(false);
  });
  it("keeps missing cash as a gap rather than a fabricated zero in the packet", () => {
    const f = setup(); const selection = f.review.composition.alternatives[0]!.projection.operating.revenue.quantities;
    selection.decisionId = null; selection.missingReason = "Synthetic missing assumption";
    const r = prepareCapitalDecisionDelivery(f); expect(r.status).toBe("partial"); expect(r.alternatives[0]!.projection.rows).toBeNull();
    expect(r.alternatives[0]!.projection.summary).toBeNull(); expect(r.unresolved.length).toBeGreaterThan(0);
  });
  it("preserves a contractual ratio failure with its operands and pending definition review", () => {
    const fixture = capitalDecisionReviewFixture(); const ratio = adoptedDefinedRatioFixture();
    const a = fixture.input.composition.alternatives[0]!.projection.operating;
    ratio.input.scope = a.scope; ratio.input.measurementDate = a.endDate;
    ratio.snapshot.entries.forEach(e => {e.dimensions.periodEnd = a.endDate;}); ratio.snapshot.entries[0]!.value.value = "400";
    fixture.snapshot.entries.push(...ratio.snapshot.entries as unknown as typeof fixture.snapshot.entries);
    const canonical = JSON.stringify(fixture.snapshot); const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
    for (const alternative of [...fixture.input.composition.alternatives, ...fixture.input.composition.sensitivities]) {
      alternative.projection.operating.envelope = envelope; alternative.projection.funding.input.envelope = envelope;
    }
    ratio.input.envelope = envelope; fixture.input.ratios.push({id: "covenant", alternativeId: "maintain", input: ratio.input});
    const r = prepareCapitalDecisionDelivery({...setup(), review: fixture.input});
    expect(r.ratios[0]!.satisfiesDefinedBoundary).toBe(false); expect(r.ratios[0]!.numerator).toBe("400");
    expect(r.ratios[0]!.definitionKind).toBe("contractual");
    expect(r.ratios[0]!.pendingReviews).toContain("definition_components_and_source");
    expect(r.unresolved).toContain("ratio:covenant:outside_defined_boundary");
  });
  it("reproduces packets without mutating inputs and changes their fingerprint with requested material", () => {
    const f = setup(); const before = structuredClone(f); const r = prepareCapitalDecisionDelivery(f);
    expect(prepareCapitalDecisionDelivery(f)).toEqual(r); expect(f).toEqual(before);
    f.material.requested = true; expect(prepareCapitalDecisionDelivery(f).fingerprint).not.toBe(r.fingerprint);
  });
});
