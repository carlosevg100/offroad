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
export const assurance: ProcessingAssurance = {
  id: "f7c89c3e-dd8b-4eb9-8778-9cc846dbce58", policyVersion: retentionMatrixVersion,
  accountRef: requirement.accountRef, projectRef: requirement.projectRef,
  credentialBinding: requirement.credentialBinding, provider: "openai", models: [requirement.model],
  endpoint: requirement.endpoint, resource: "inference", region: "global", eligibility: "supported",
  purposes: ["case_analysis"], classifications: ["restricted"], rights: ["process"],
  trainingUse: "prohibited", retention, zeroRetention: "not_contracted",
  evidence: (["provider_terms", "account_configuration", "credential_binding"] as const).map(kind => ({kind, reference: "synthetic-fixture", sha256: "a".repeat(64)})),
  reviewedBy: "synthetic-reviewer", reviewedAt: "2026-09-21T00:00:00Z",
  validThrough: "2026-10-21T00:00:00Z", revokedAt: null,
};
export const decision = (r = requirement, records: readonly unknown[] = [assurance], now = new Date("2026-09-21T12:00:00Z")) =>
  evaluateResourceEligibility({requirement: r, assurances: records, now});

describe("account/model/resource retention matrix", () => {
  it("permits evidenced limited retention without a zero-retention contract", () => expect(decision().allowed).toBe(true));
  for (const [key, value] of [
    ["accountRef", "other"], ["projectRef", "other"], ["credentialBinding", "rotated"],
    ["model", "gpt-5.6-sol"], ["endpoint", "https://api.openai.com/v1/files"],
    ["resource", "file_upload"], ["region", "eu"],
  ] as const) it(`does not inherit approval across ${key}`, () => expect(decision({...requirement, [key]: value}).allowed).toBe(false));
  it("denies an assurance at the exact expiry instant", () => expect(decision(requirement, [assurance], new Date(assurance.validThrough)).allowed).toBe(false));
  it("denies revoked assurance", () => expect(decision(requirement, [{...assurance, revokedAt: assurance.reviewedAt}]).allowed).toBe(false));
  it("denies a classification downgrade before matching any provider", () => expect(decision({...requirement, classification: "public"}).reasons).toContain("classification_downgrade"));
  it("denies missing source authorization", () => expect(decision({...requirement, externalProcessingAllowed: false}).allowed).toBe(false));
  it("denies a right not explicitly covered", () => expect(decision({...requirement, rights: ["export"]}).allowed).toBe(false));
  it("denies future review and overlapping active attestations", () => {
    expect(decision(requirement, [assurance], new Date("2026-09-20T00:00:00Z")).allowed).toBe(false);
    expect(decision(requirement, [assurance, assurance]).allowed).toBe(false);
  });
  it("denies unknown eligibility and missing account evidence", () => {
    expect(decision(requirement, [{...assurance, eligibility: "unknown"}]).allowed).toBe(false);
    expect(decision(requirement, [{...assurance, evidence: [assurance.evidence[0], assurance.evidence[0], assurance.evidence[0]]}]).allowed).toBe(false);
  });
  it("checks each retention category and exceptional use independently", () => {
    for (const key of ["requestContentSeconds", "abuseMonitoringSeconds", "applicationStateSeconds", "cacheSeconds", "metadataSeconds"] as const)
      expect(decision(requirement, [{...assurance, retention: {...retention, [key]: retention[key] + 1}}]).allowed).toBe(false);
    expect(decision(requirement, [{...assurance, retention: {...retention, exceptions: ["security_investigation"]}}]).allowed).toBe(false);
  });
});
