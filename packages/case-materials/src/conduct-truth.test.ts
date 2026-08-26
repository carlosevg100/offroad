import {advisoryDisclaimerId, conductPolicyVersion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";

import type {Material} from "./compile";
import {buildLanguageConductTruthSet} from "./conduct-truth";

const dataRoom = {entries: [], folders: [], counts: {ready: 0, held: 0, requested: 0}, releasable: true};
const material: Material = {
  kind: "teaser",
  title: {pt: "Teaser", en: "Teaser"},
  blocks: [],
  dependsOn: [],
  conductAudit: {status: "pass", version: conductPolicyVersion, fingerprint: "a".repeat(64), findings: []},
};
const caseFingerprint = "b".repeat(64);

describe("M10 language and conduct truth", () => {
  it("fails closed until policy, exact conflict review, recipient authorization and written record exist", () => {
    const truth = buildLanguageConductTruthSet({caseId: "case-1", referenceDate: "2026-08-26", caseFingerprint, materials: [material], dataRoom});
    expect(truth.status).toBe("blocked");
    expect(truth.blockerCodes).toEqual(expect.arrayContaining([
      "conduct_policy_unavailable",
      "conflict_review_stale_or_missing",
      "external_communication_context_missing",
    ]));
    expect(truth.qualifiedIntroductionAllowed).toBe(false);
    expect(truth.procedureCoverage).toHaveLength(13);
  });

  it("permits only the exact governed package for a named and authorized communication", () => {
    const truth = buildLanguageConductTruthSet({
      caseId: "case-1",
      referenceDate: "2026-08-26",
      caseFingerprint,
      materials: [material],
      dataRoom,
      governance: {
        organizationId: "org-1",
        policy: {version: conductPolicyVersion, status: "active", disclaimerId: advisoryDisclaimerId, validFrom: "2026-08-26", validUntil: null},
        conflictReview: {caseFingerprint, status: "clear", reviewedBy: "reviewer-1", reviewedAt: "2026-08-26T10:00:00.000Z"},
        externalCommunication: {
          targetOrganizationId: "org-1",
          targetCaseId: "case-1",
          recipientId: "recipient-1",
          recipientAuthorized: true,
          packageFingerprint: buildLanguageConductTruthSet({caseId: "case-1", referenceDate: "2026-08-26", caseFingerprint, materials: [material], dataRoom}).packageFingerprint,
          hasMaterialCommitment: true,
          writtenRecordId: "record-1",
        },
      },
    });
    expect(truth).toMatchObject({status: "complete", externalReleaseAllowed: true, qualifiedIntroductionAllowed: true});
    expect(truth.blockerCodes).toEqual([]);
    expect(truth.procedureCoverage.map((procedure) => procedure.procedureId)).toEqual(
      Array.from({length: 13}, (_, index) => `LC-${String(index + 1).padStart(2, "0")}`),
    );
  });

  it("invalidates a conflict review when the economic case fingerprint changes", () => {
    const truth = buildLanguageConductTruthSet({
      caseId: "case-1",
      referenceDate: "2026-08-26",
      caseFingerprint,
      materials: [material],
      dataRoom,
      governance: {
        organizationId: "org-1",
        policy: {version: conductPolicyVersion, status: "active", disclaimerId: advisoryDisclaimerId, validFrom: "2026-08-26", validUntil: null},
        conflictReview: {caseFingerprint: "c".repeat(64), status: "clear", reviewedBy: "reviewer-1", reviewedAt: "2026-08-26T10:00:00.000Z"},
        externalCommunication: {targetOrganizationId: "org-1", targetCaseId: "case-1", recipientId: "recipient-1", recipientAuthorized: true, packageFingerprint: buildLanguageConductTruthSet({caseId: "case-1", referenceDate: "2026-08-26", caseFingerprint, materials: [material], dataRoom}).packageFingerprint, hasMaterialCommitment: false},
      },
    });
    expect(truth.blockerCodes).toContain("conflict_review_stale_or_missing");
    expect(truth.externalReleaseAllowed).toBe(false);
  });
});
