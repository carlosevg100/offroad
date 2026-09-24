import {describe, expect, it} from "vitest";
import {evaluateResourceEligibility} from "./resource-eligibility";
import {retentionMatrixVersion, type ProcessingAssurance, type ProcessingRequirement} from "./retention-matrix";

export const retention = {requestContentSeconds: 0, abuseMonitoringSeconds: 2592000,
  applicationStateSeconds: 0, cacheSeconds: 86400, metadataSeconds: 2592000,
  exceptions: ["legal_hold", "policy_enforcement"] as ("legal_hold" | "policy_enforcement")[]};
export const requirement: ProcessingRequirement = {
  policyVersion: retentionMatrixVersion, accountRef: "test-account", projectRef: "test-project",
  credentialBinding: "test-secret-version", provider: "openai", model: "gpt-5.6-terra",
  endpoint: "https://api.openai.com/v1/responses", resource: "inference", region: "global",
  purpose: "case_analysis", classification: "restricted", sourceClassification: "restricted",
  rights: ["process"], externalProcessingAllowed: true, maxRetention: retention,
};
const expiry = "2026-10-21T00:00:00Z";
export const assurance: ProcessingAssurance = {
  id: "f7c89c3e-dd8b-4eb9-8778-9cc846dbce58", policyVersion: retentionMatrixVersion,
  accountRef: requirement.accountRef, projectRef: requirement.projectRef,
  credentialBinding: requirement.credentialBinding, provider: "openai", models: [requirement.model],
  endpoint: requirement.endpoint, resource: "inference", region: "global", eligibility: "supported",
  purposes: ["case_analysis"], classifications: ["restricted"], rights: ["process"],
  trainingUse: "prohibited", retention, zeroRetention: "not_contracted",
  evidence: (["provider_terms", "account_configuration", "credential_binding"] as const).map(kind => ({kind, reference: "synthetic-fixture", sha256: "a".repeat(64)})),
  reviewedBy: "synthetic-reviewer", reviewedAt: "2026-09-21T00:00:00Z",
  validThrough: expiry, revokedAt: null,
};
/** The same verification without a date: valid until revoked or superseded by a new identity. */
export const openEnded: ProcessingAssurance = {...assurance, id: "3c1f7a52-8d64-4e0b-9a17-5b2e8c4d6f90", validThrough: null};
export const decision = (r = requirement, records: readonly unknown[] = [assurance], now = new Date("2026-09-21T12:00:00Z")) =>
  evaluateResourceEligibility({requirement: r, assurances: records, now});

describe("account/model/resource retention matrix", () => {
  // Every dimension below is checked the same way whether or not the assurance carries a date.
  for (const [label, record] of [["dated", assurance], ["open-ended", openEnded]] as const) describe(`${label} assurance`, () => {
    it("permits evidenced limited retention without a zero-retention contract", () => expect(decision(requirement, [record]).allowed).toBe(true));
    for (const [key, value] of [
      ["accountRef", "other"], ["projectRef", "other"], ["credentialBinding", "rotated"],
      ["model", "gpt-5.6-sol"], ["endpoint", "https://api.openai.com/v1/files"],
      ["resource", "file_upload"], ["region", "eu"],
    ] as const) it(`does not inherit approval across ${key}`, () => expect(decision({...requirement, [key]: value}, [record]))
      .toMatchObject({allowed: false, assuranceId: null, reasons: ["processing_assurance_missing"]}));
    it("denies revoked assurance at once", () => {
      const revokedAt = "2026-09-21T12:00:00Z";
      expect(decision(requirement, [{...record, revokedAt}], new Date(revokedAt)).allowed).toBe(false);
    });
    it("denies a purpose, classification or right the assurance does not approve", () => {
      expect(decision({...requirement, purpose: "evaluation"}, [record]).reasons).toEqual(["processing_purpose_not_approved"]);
      expect(decision({...requirement, classification: "confidential", sourceClassification: "confidential"}, [record]).reasons).toEqual(["processing_classification_not_approved"]);
      expect(decision({...requirement, rights: ["export"]}, [record]).allowed).toBe(false);
    });
    it("denies future review and overlapping active attestations", () => {
      expect(decision(requirement, [record], new Date("2026-09-20T00:00:00Z")).allowed).toBe(false);
      expect(decision(requirement, [record, record]).allowed).toBe(false);
    });
    it("denies unknown eligibility, training use not prohibited and missing account evidence", () => {
      expect(decision(requirement, [{...record, eligibility: "unknown"}]).allowed).toBe(false);
      for (const trainingUse of ["permitted", "unknown"] as const)
        expect(decision(requirement, [{...record, trainingUse}]).reasons).toEqual(["provider_training_not_prohibited"]);
      expect(decision(requirement, [{...record, evidence: [record.evidence[0], record.evidence[0], record.evidence[0]]}]).allowed).toBe(false);
    });
    it("checks each retention category and exceptional use independently", () => {
      for (const key of ["requestContentSeconds", "abuseMonitoringSeconds", "applicationStateSeconds", "cacheSeconds", "metadataSeconds"] as const)
        expect(decision(requirement, [{...record, retention: {...retention, [key]: retention[key] + 1}}]).allowed).toBe(false);
      expect(decision(requirement, [{...record, retention: {...retention, exceptions: ["security_investigation"]}}]).allowed).toBe(false);
    });
  });
  it("denies a dated assurance at the exact expiry instant", () => expect(decision(requirement, [assurance], new Date(expiry)).allowed).toBe(false));
  it("keeps an assurance without a date eligible after any date", () => {
    for (const now of [expiry, "2126-09-21T00:00:00Z", "+275760-09-13T00:00:00Z"])
      expect(decision(requirement, [openEnded], new Date(now))).toMatchObject({allowed: true, assuranceId: openEnded.id, reasons: []});
  });
  it("requires the validity to be stated: an omitted or malformed validThrough is refused", () => {
    const {validThrough: _omitted, ...unstated} = openEnded;
    expect(decision(requirement, [unstated]).reasons).toEqual(["processing_matrix_invalid"]);
    expect(decision(requirement, [{...openEnded, validThrough: "never"}]).reasons).toEqual(["processing_matrix_invalid"]);
  });
  it("supersedes a dated assurance only by revoking it and recording a new identity", () => {
    expect(decision(requirement, [assurance, openEnded]).reasons).toEqual(["processing_assurance_ambiguous"]);
    expect(decision(requirement, [{...assurance, revokedAt: "2026-09-24T12:00:00Z"}, openEnded], new Date("2026-10-22T00:00:00Z")))
      .toMatchObject({allowed: true, assuranceId: openEnded.id});
  });
  it("denies a classification downgrade before matching any provider", () => expect(decision({...requirement, classification: "public"}).reasons).toContain("classification_downgrade"));
  it("denies missing source authorization", () => expect(decision({...requirement, externalProcessingAllowed: false}).allowed).toBe(false));
});
