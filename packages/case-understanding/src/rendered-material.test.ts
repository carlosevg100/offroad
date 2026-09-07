import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {buildDecisionArtifactContract, type DecisionArtifactContractInput} from "./decision-artifact";
import {
  bindRenderedMaterialToDecisionArtifact,
  bindRenderedMaterialsToDecisionArtifact,
  buildRenderedMaterialManifest,
  renderedMaterialManifestSchema,
  type RenderedMaterialManifestInput,
  verifyRenderedMaterialBytes,
} from "./rendered-material";

const hash = (value: string) => value.repeat(64).slice(0, 64);
const organizationId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const bytes = new TextEncoder().encode("governed workbook bytes");
const contentSha256 = createHash("sha256").update(bytes).digest("hex");

function materialFixture(overrides: Partial<RenderedMaterialManifestInput> = {}): RenderedMaterialManifestInput {
  return {
    schemaVersion: "2026.09.07-v1",
    id: "gc02-workbook-v1",
    organizationId,
    projectId,
    caseId: "gc02",
    decisionContractFingerprint: hash("a"),
    surface: "workbook",
    format: "xlsx",
    fileName: "camil-estrutura-capital-v1.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    byteLength: bytes.byteLength,
    contentSha256,
    renderer: {id: "offroad-financial-workbook", version: "1.0.0"},
    template: {id: "offroad-house-credit", version: "1.0.0", fingerprint: hash("b"), origin: "offroad_house"},
    storage: {bucket: "case-artifacts", objectPath: `${organizationId}/${projectId}/materials/${contentSha256}.xlsx`, state: "stored", etag: "etag-v1"},
    generatedAt: "2026-09-07T12:00:00.000Z",
    quality: {schemaValidated: true, numericIdentityPassed: true, formulaAuditPassed: true, visualInspection: "passed", openIssues: [], releaseEligible: true},
    release: {state: "reviewable", recipientIds: []},
    claimIds: ["claim-debt"],
    sourceIds: ["src-itr"],
    assumptionIds: [],
    gapIds: [],
    ...overrides,
  };
}

function decisionFixture(): DecisionArtifactContractInput {
  return {
    schemaVersion: "2026.09.07-v1",
    caseId: "gc02",
    snapshotFingerprint: hash("c"),
    asOf: "2026-05-31",
    status: "draft",
    release: {state: "internal_only", recipientIds: []},
    sources: [{id: "src-itr", title: "ITR", classification: "public", asOf: "2026-05-31", locator: "nota 15"}],
    assumptions: [],
    gaps: [],
    claims: [{id: "claim-debt", label: "Dívida bruta", value: 5_670_186, unit: "R$ mil", evidenceState: "calculated", object: {id: "ledger", type: "debt_ledger", fingerprint: hash("d"), path: "accountingGrossDebt"}, sourceIds: ["src-itr"], assumptionIds: [], gapIds: []}],
    views: [
      {surface: "conversation", artifactId: "chat-v1", artifactKind: "chat_readout", artifactFingerprint: null, blocks: [{id: "chat-debt", kind: "metric", title: "Dívida", claimIds: ["claim-debt"], sourceIds: [], assumptionIds: [], gapIds: []}]},
      {surface: "workbook", artifactId: "model-v1", artifactKind: "xlsx", artifactFingerprint: null, blocks: [{id: "model-debt", kind: "table", title: "Dívida", claimIds: ["claim-debt"], sourceIds: [], assumptionIds: [], gapIds: []}]},
      {surface: "presentation", artifactId: "deck-v1", artifactKind: "pptx", artifactFingerprint: null, blocks: [{id: "deck-debt", kind: "metric", title: "Dívida", claimIds: ["claim-debt"], sourceIds: [], assumptionIds: [], gapIds: []}]},
    ],
    identityRequirements: [{claimId: "claim-debt", surfaces: ["conversation", "workbook", "presentation"]}],
  };
}

describe("governed rendered material", () => {
  it("signs the exact bytes, tenant path, renderer and template", () => {
    const manifest = buildRenderedMaterialManifest(materialFixture());
    verifyRenderedMaterialBytes(manifest, bytes);
    expect(renderedMaterialManifestSchema.parse(manifest).manifestFingerprint).toHaveLength(64);
  });

  it("rejects bytes that differ from the manifest", () => {
    const manifest = buildRenderedMaterialManifest(materialFixture());
    expect(() => verifyRenderedMaterialBytes(manifest, new TextEncoder().encode("mutated"))).toThrow(/byte length|sha256/);
  });

  it("refuses tenant path traversal", () => {
    expect(() => buildRenderedMaterialManifest(materialFixture({storage: {bucket: "case-artifacts", objectPath: `${organizationId}/${projectId}/materials/../other.xlsx`, state: "stored", etag: "etag"}}))).toThrow(/organization and project material scope/);
  });

  it("does not call an uninspected material release eligible", () => {
    expect(() => buildRenderedMaterialManifest(materialFixture({quality: {schemaValidated: true, numericIdentityPassed: true, formulaAuditPassed: true, visualInspection: "not_run", openIssues: [], releaseEligible: true}}))).toThrow(/deterministic quality-gate/);
  });

  it("binds only stored bytes made from the exact decision contract", () => {
    const contract = buildDecisionArtifactContract(decisionFixture());
    const manifest = buildRenderedMaterialManifest(materialFixture({decisionContractFingerprint: contract.contractFingerprint}));
    const bound = bindRenderedMaterialToDecisionArtifact(contract, manifest);
    expect(bound.views.find((view) => view.surface === "workbook")).toMatchObject({artifactId: "gc02-workbook-v1", artifactFingerprint: contentSha256});
    expect(bound.contractFingerprint).not.toBe(contract.contractFingerprint);
  });

  it("refuses to bind a receipt from another decision snapshot", () => {
    const contract = buildDecisionArtifactContract(decisionFixture());
    const manifest = buildRenderedMaterialManifest(materialFixture());
    expect(() => bindRenderedMaterialToDecisionArtifact(contract, manifest)).toThrow(/different decision contract/);
  });

  it("atomically binds workbook and presentation receipts made from the same source contract", () => {
    const contract = buildDecisionArtifactContract(decisionFixture());
    const workbook = buildRenderedMaterialManifest(materialFixture({decisionContractFingerprint: contract.contractFingerprint}));
    const presentationBytes = new TextEncoder().encode("governed presentation bytes");
    const presentationSha = createHash("sha256").update(presentationBytes).digest("hex");
    const presentation = buildRenderedMaterialManifest({
      ...materialFixture({decisionContractFingerprint: contract.contractFingerprint}),
      id: "gc02-presentation-v1",
      surface: "presentation",
      format: "pptx",
      fileName: "camil-estrutura-capital-v1.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      byteLength: presentationBytes.byteLength,
      contentSha256: presentationSha,
      storage: {bucket: "case-artifacts", objectPath: `${organizationId}/${projectId}/materials/${presentationSha}.pptx`, state: "stored", etag: "etag-deck"},
    });
    const bound = bindRenderedMaterialsToDecisionArtifact(contract, [workbook, presentation]);
    expect(bound.views.find((view) => view.surface === "workbook")?.artifactFingerprint).toBe(contentSha256);
    expect(bound.views.find((view) => view.surface === "presentation")?.artifactFingerprint).toBe(presentationSha);
  });

  it("fails closed if one receipt in an atomic binding set belongs to another snapshot", () => {
    const contract = buildDecisionArtifactContract(decisionFixture());
    const valid = buildRenderedMaterialManifest(materialFixture({decisionContractFingerprint: contract.contractFingerprint}));
    const stale = buildRenderedMaterialManifest({...materialFixture(), id: "stale-deck", surface: "presentation", format: "pptx", fileName: "stale.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"});
    expect(() => bindRenderedMaterialsToDecisionArtifact(contract, [valid, stale])).toThrow(/different decision contract/);
  });
});
