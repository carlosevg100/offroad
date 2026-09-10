import {describe, expect, it} from "vitest";
import {fingerprintInstitutionalModelConfiguration, type InstitutionalModelConfiguration} from "@offroad/financial-model";
import {parseInstitutionalConfigurationReviews} from "./institutional-configuration-reviews";
const configuration = {currency: "BRL", assumptionBook: {assumptions: [{id: "growth", label: {pt: "Crescimento", en: "Growth"}, unit: "percent", values: {"2027": "0.075"}}]}} as unknown as InstitutionalModelConfiguration;
const candidate = {candidateId: "10000000-0000-4000-8000-000000000001", revision: 2, status: "review_required", configuration, configurationFingerprint: fingerprintInstitutionalModelConfiguration(configuration), parentFingerprint: "a".repeat(64), answerEvidence: {messageId: "10000000-0000-4000-8000-000000000002", requestId: "10000000-0000-4000-8000-000000000003", answeredBy: "10000000-0000-4000-8000-000000000004", answeredAt: "2026-09-10T00:00:00Z", responseFingerprint: "b".repeat(64), assumptionId: "growth", period: "2027", unit: "percent", canonicalValue: "0.075", priorValue: null}};
describe("institutional review reader", () => {
  it("projects only the bound assumption into the UI", () => {
    const [review] = parseInstitutionalConfigurationReviews([candidate]);
    expect(review).toMatchObject({label: {pt: "Crescimento", en: "Growth"}, period: "2027", proposedValue: "0.075", priorValue: null});
    expect(review).not.toHaveProperty("configuration");
    expect(review).not.toHaveProperty("answerEvidence");
  });
  it("permits approval only against the current approved parent", () => {
    const parent = {...candidate, candidateId: "10000000-0000-4000-8000-000000000009", revision: 1, status: "approved"};
    const proposal = {...candidate, parentFingerprint: parent.configurationFingerprint};
    expect(parseInstitutionalConfigurationReviews([proposal, parent])[0].canApprove).toBe(true);
    expect(parseInstitutionalConfigurationReviews([candidate, parent])[0].canApprove).toBe(false);
  });
  it("rejects changed configuration, wrong target, unit, value and duplicate candidate", () => {
    for (const patch of [{configurationFingerprint: "f".repeat(64)}, {answerEvidence: {...candidate.answerEvidence, assumptionId: "other"}}, {answerEvidence: {...candidate.answerEvidence, unit: "currency"}}, {answerEvidence: {...candidate.answerEvidence, canonicalValue: "0.09"}}]) expect(parseInstitutionalConfigurationReviews([{...candidate, ...patch}])).toEqual([]);
    expect(parseInstitutionalConfigurationReviews([candidate, candidate])).toEqual([]);
    expect(parseInstitutionalConfigurationReviews(null)).toEqual([]);
  });
});
