import {createHash} from "node:crypto";

import {buildDecisionArtifactContract, buildRenderedMaterialManifest, type DecisionArtifactContractInput} from "@offroad/case-understanding";
import {describe, expect, it} from "vitest";

import {resolveGovernedMaterialDownload, verifyGovernedMaterialDownload} from "./governed-material-download";

const organizationId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const bytes = new TextEncoder().encode("decision workbook");
const sha = createHash("sha256").update(bytes).digest("hex");

function fixture() {
  const source = buildDecisionArtifactContract({
    schemaVersion: "2026.09.07-v1", caseId: "case-1", snapshotFingerprint: "a".repeat(64), asOf: "2026-06-30", status: "draft",
    release: {state: "internal_only", recipientIds: []},
    sources: [{id: "src", title: "ITR", classification: "public", asOf: "2026-06-30", locator: "p. 1"}], assumptions: [], gaps: [],
    claims: [{id: "claim", label: "Caixa", value: 10, unit: "R$ milhões", evidenceState: "observed_public", object: {id: "cash", type: "financial_position", fingerprint: "b".repeat(64), path: "cash"}, sourceIds: ["src"], assumptionIds: [], gapIds: []}],
    views: [
      {surface: "conversation", artifactId: "chat", artifactKind: "chat_readout", artifactFingerprint: null, blocks: [{id: "chat", kind: "metric", title: "Caixa", claimIds: ["claim"], sourceIds: [], assumptionIds: [], gapIds: []}]},
      {surface: "workbook", artifactId: "workbook", artifactKind: "xlsx", artifactFingerprint: sha, blocks: [{id: "workbook", kind: "metric", title: "Caixa", claimIds: ["claim"], sourceIds: [], assumptionIds: [], gapIds: []}]},
      {surface: "presentation", artifactId: "deck", artifactKind: "pptx", artifactFingerprint: null, blocks: [{id: "deck", kind: "metric", title: "Caixa", claimIds: ["claim"], sourceIds: [], assumptionIds: [], gapIds: []}]},
    ],
    identityRequirements: [{claimId: "claim", surfaces: ["conversation", "workbook", "presentation"]}],
  });
  const manifest = buildRenderedMaterialManifest({
    schemaVersion: "2026.09.07-v1", id: "workbook", organizationId, projectId, caseId: source.caseId,
    decisionContractFingerprint: source.contractFingerprint, surface: "workbook", format: "xlsx", fileName: "decision-workbook.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", byteLength: bytes.byteLength, contentSha256: sha,
    renderer: {id: "offroad-decision-workbook", version: "v1"}, template: {id: "offroad-decision-workbook", version: "v1", fingerprint: "c".repeat(64), origin: "offroad_house"},
    storage: {bucket: "case-artifacts", objectPath: `${organizationId}/${projectId}/materials/${sha}.xlsx`, state: "stored", etag: "etag"},
    generatedAt: "2026-09-07T12:00:00.000Z", quality: {schemaValidated: true, numericIdentityPassed: true, formulaAuditPassed: true, visualInspection: "not_run", openIssues: [{code: "visual_review_pending", severity: "high", detail: "awaiting review"}], releaseEligible: false},
    release: {state: "internal_only", recipientIds: []}, claimIds: ["claim"], sourceIds: ["src"], assumptionIds: [], gapIds: [],
  });
  return {manifest, contract: source};
}

describe("governed material download", () => {
  it("requires a manifest instead of regenerating an ad hoc spreadsheet", () => {
    const {contract} = fixture();
    expect(() => resolveGovernedMaterialDownload({materialContent: {}, decisionContractContent: {contract}, format: "xlsx", organizationId, projectId})).toThrow(/missing_manifest/);
  });

  it("rejects a valid receipt from another workspace scope", () => {
    const {manifest, contract} = fixture();
    expect(() => resolveGovernedMaterialDownload({materialContent: {manifest}, decisionContractContent: {contract}, format: "xlsx", organizationId: "33333333-3333-4333-8333-333333333333", projectId})).toThrow(/cross_scope/);
  });

  it("requires the exact material binding in the latest decision contract", () => {
    const {manifest, contract} = fixture();
    const body = Object.fromEntries(Object.entries(contract).filter(([key]) => key !== "contractFingerprint")) as DecisionArtifactContractInput;
    const unbound = buildDecisionArtifactContract({...body, views: contract.views.map((view) => view.surface === "workbook" ? {...view, artifactFingerprint: null} : view)});
    expect(() => resolveGovernedMaterialDownload({materialContent: {manifest}, decisionContractContent: {contract: unbound}, format: "xlsx", organizationId, projectId})).toThrow(/missing_binding/);
  });

  it("accepts exact bound bytes and rejects tampering", () => {
    const {manifest, contract} = fixture();
    const resolved = resolveGovernedMaterialDownload({materialContent: {manifest}, decisionContractContent: {contract}, format: "xlsx", organizationId, projectId});
    expect(() => verifyGovernedMaterialDownload(resolved, bytes)).not.toThrow();
    expect(() => verifyGovernedMaterialDownload(resolved, new TextEncoder().encode("tampered"))).toThrow(/tampered_bytes/);
  });
});
