import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {
  compileGovernedDocumentIdentity,
  governedDocumentVersionIdentitySchema,
  validateGovernedDocumentIdentityGraph,
  type CompileGovernedDocumentIdentityInput,
  type DerivativeParentReference,
  type GovernedDocumentVersionIdentity,
} from "./governed-document-identity";

const bytes = new TextEncoder().encode("immutable audited financial statements");
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const sourceHash = hash(bytes);
const parser = {toolId: "offroad.pdf-parser", version: "1.2.3", configurationSha256: null};

function sourceRef(input: {
  organizationId?: string;
  projectId?: string;
  documentId?: string;
  version?: number;
  sourceBytesSha256?: string;
} = {}) {
  return {
    organizationId: input.organizationId ?? "org-a",
    projectId: input.projectId ?? "project-a",
    documentId: input.documentId ?? "document-a",
    version: input.version ?? 1,
    sourceBytesSha256: input.sourceBytesSha256 ?? sourceHash,
  };
}

function sourceParent(input: Parameters<typeof sourceRef>[0] = {}): DerivativeParentReference {
  return {kind: "source_version", version: sourceRef(input)};
}

function baseInput(overrides: Partial<CompileGovernedDocumentIdentityInput> = {}): CompileGovernedDocumentIdentityInput {
  return {
    organizationId: "org-a",
    projectId: "project-a",
    documentId: "document-a",
    version: 1,
    parentVersion: null,
    source: {
      origin: "user_upload",
      sourceClass: "provided_documents",
      sourceRef: "storage:opportunity-documents/object-a",
      integration: {status: "native", connectorId: null},
    },
    dataClass: "project_confidential",
    informationClass: "audited",
    confidentiality: "confidential",
    actor: {kind: "user", ref: "user:11111111-1111-4111-8111-111111111111"},
    capturedAt: "2026-09-01T10:00:00.000Z",
    asOf: "2026-08-31T23:59:59.000Z",
    ingestedAt: "2026-09-01T10:01:00.000Z",
    immutableSourceBytes: bytes,
    sourceSnapshot: {
      state: "immutable_bytes",
      locatorRef: "storage:opportunity-documents/object-a",
      objectVersionRef: null,
      capturedSha256: sourceHash,
    },
    parserToolchain: [parser],
    extractedLayers: [{
      layerId: "layer-a",
      layerKind: "pdf",
      contentSha256: hash("layer-a"),
      sourceBytesSha256: sourceHash,
      parser,
      producedAt: "2026-09-01T10:02:00.000Z",
      parentRefs: [sourceParent()],
      coverageRefs: [{kind: "extraction_report", ref: "report:layer-a", fingerprint: hash("report-a")}],
    }],
    coverageRefs: [{kind: "reading_manifest", ref: "manifest:document-a", fingerprint: hash("manifest-a")}],
    derivatives: [{
      derivativeId: "profile-a",
      kind: "profile",
      contentSha256: hash("profile-a"),
      producedBy: parser,
      producedAt: "2026-09-01T10:03:00.000Z",
      parentRefs: [{kind: "derivative", derivativeId: "layer-a", contentSha256: hash("layer-a")}],
      coverageRefs: [],
    }],
    supersession: {state: "current", supersededBy: null, reasonRef: null},
    ...overrides,
  };
}

function compile(overrides: Partial<CompileGovernedDocumentIdentityInput> = {}) {
  return compileGovernedDocumentIdentity(baseInput(overrides));
}

function resign(record: GovernedDocumentVersionIdentity): GovernedDocumentVersionIdentity {
  const {identityFingerprint: _old, ...body} = record;
  return compileGovernedDocumentIdentity({
    ...(body as Omit<CompileGovernedDocumentIdentityInput, "immutableSourceBytes">),
    immutableSourceBytes: bytes,
  });
}

const issueCodes = (records: readonly GovernedDocumentVersionIdentity[]) =>
  validateGovernedDocumentIdentityGraph(records).issues.map((issue) => issue.code);

describe("governed document identity", () => {
  it("computes the immutable source hash and a stable, valid identity", () => {
    const identity = compile({claimedSourceBytesSha256: sourceHash});
    expect(identity.sourceBytes).toEqual({sha256: sourceHash, byteSize: bytes.byteLength});
    expect(validateGovernedDocumentIdentityGraph([identity])).toMatchObject({status: "valid", recordCount: 1, issues: []});
    expect(compile().identityFingerprint).toBe(identity.identityFingerprint);
  });

  it("rejects a browser or importer hash that does not match the actual bytes", () => {
    expect(() => compile({claimedSourceBytesSha256: "0".repeat(64)}))
      .toThrow("source_bytes_hash_mismatch");
  });

  it("detects conflicting hashes for one version and identical bytes mislabeled as a new version", () => {
    const original = compile();
    const conflictingBytes = new TextEncoder().encode("different immutable bytes");
    const conflicting = compileGovernedDocumentIdentity({
      ...baseInput({
        immutableSourceBytes: conflictingBytes,
        sourceSnapshot: {...baseInput().sourceSnapshot, capturedSha256: hash(conflictingBytes)},
      }),
    });
    expect(issueCodes([original, conflicting])).toContain("version_hash_conflict");

    const duplicatedAsV2 = compile({
      version: 2,
      parentVersion: sourceRef(),
      extractedLayers: baseInput().extractedLayers.map((layer) => ({
        ...layer,
        layerId: "layer-v2",
        parentRefs: [sourceParent({version: 2})],
      })),
      derivatives: [],
    });
    expect(issueCodes([original, duplicatedAsV2])).toContain("hash_reused_across_versions");
  });

  it("detects cross-tenant and cross-project parent references", () => {
    const parent = compile();
    const child = compile({
      version: 2,
      parentVersion: sourceRef({organizationId: "org-b", projectId: "project-b"}),
      extractedLayers: baseInput().extractedLayers.map((layer) => ({
        ...layer,
        layerId: "layer-v2",
        parentRefs: [sourceParent({version: 2})],
      })),
      derivatives: [],
    });
    expect(issueCodes([parent, child])).toEqual(expect.arrayContaining(["parent_scope_mismatch", "parent_version_not_found"]));
  });

  it("detects a cycle in version lineage", () => {
    const v1 = compile({parentVersion: sourceRef({version: 2})});
    const v2 = compile({
      version: 2,
      parentVersion: sourceRef({version: 1}),
      extractedLayers: baseInput().extractedLayers.map((layer) => ({
        ...layer,
        layerId: "layer-v2",
        parentRefs: [sourceParent({version: 2})],
      })),
      derivatives: [],
    });
    expect(issueCodes([v1, v2])).toContain("version_lineage_cycle");
  });

  it("detects mutable sources without a snapshot and a mismatched captured hash", () => {
    const identity = compile({
      sourceSnapshot: {
        state: "mutable_reference",
        locatorRef: "https-source:issuer/latest.pdf",
        objectVersionRef: null,
        capturedSha256: "0".repeat(64),
      },
    });
    expect(issueCodes([identity])).toEqual(expect.arrayContaining([
      "mutable_source_without_snapshot",
      "source_snapshot_hash_mismatch",
    ]));
  });

  it("detects a layer without parser identity and one whose parser is not in the recorded toolchain", () => {
    const missing = compile({
      extractedLayers: [{...baseInput().extractedLayers[0]!, parser: null}],
      derivatives: [],
    });
    expect(issueCodes([missing])).toContain("missing_parser_identity");

    const unregistered = compile({
      extractedLayers: [{
        ...baseInput().extractedLayers[0]!,
        parser: {...parser, version: "9.9.9"},
      }],
      derivatives: [],
    });
    expect(issueCodes([unregistered])).toContain("parser_identity_not_registered");
  });

  it("detects derivatives without parents, unknown parents and a derivative cycle", () => {
    const noParent = compile({
      extractedLayers: [],
      derivatives: [{...baseInput().derivatives[0]!, parentRefs: []}],
    });
    expect(issueCodes([noParent])).toContain("derivative_parent_missing");

    const unknown = compile({
      extractedLayers: [],
      derivatives: [{
        ...baseInput().derivatives[0]!,
        parentRefs: [{kind: "derivative", derivativeId: "missing", contentSha256: hash("missing")}],
      }],
    });
    expect(issueCodes([unknown])).toContain("derivative_parent_not_found");

    const aHash = hash("node-a");
    const bHash = hash("node-b");
    const cyclic = compile({
      extractedLayers: [],
      derivatives: [
        {...baseInput().derivatives[0]!, derivativeId: "node-a", contentSha256: aHash, parentRefs: [{kind: "derivative", derivativeId: "node-b", contentSha256: bHash}]},
        {...baseInput().derivatives[0]!, derivativeId: "node-b", contentSha256: bHash, parentRefs: [{kind: "derivative", derivativeId: "node-a", contentSha256: aHash}]},
      ],
    });
    expect(issueCodes([cyclic])).toContain("derivative_lineage_cycle");
  });

  it("refuses to describe an arbitrary external data room as supported", () => {
    const identity = compile({
      source: {
        origin: "external_data_room",
        sourceClass: "provided_documents",
        sourceRef: "dataroom:unknown-provider/room-a",
        integration: {status: "verified_connector", connectorId: "unknown-dataroom"},
      },
    });
    expect(issueCodes([identity])).toContain("external_data_room_not_supported");

    const honest = compile({
      source: {
        origin: "external_data_room",
        sourceClass: "provided_documents",
        sourceRef: "dataroom:unknown-provider/room-a",
        integration: {status: "unsupported", connectorId: null},
      },
    });
    expect(issueCodes([honest])).not.toContain("external_data_room_not_supported");
  });

  it("detects layer/source drift, wrong derivative hashes and forged identity fingerprints", () => {
    const driftedLayer = compile({
      extractedLayers: [{...baseInput().extractedLayers[0]!, sourceBytesSha256: "0".repeat(64)}],
      derivatives: [],
    });
    expect(issueCodes([driftedLayer])).toContain("layer_source_hash_mismatch");

    const wrongDerivativeHash = compile({
      derivatives: [{
        ...baseInput().derivatives[0]!,
        parentRefs: [{kind: "derivative", derivativeId: "layer-a", contentSha256: "0".repeat(64)}],
      }],
    });
    expect(issueCodes([wrongDerivativeHash])).toContain("derivative_parent_hash_mismatch");

    const forged = governedDocumentVersionIdentitySchema.parse({...compile(), identityFingerprint: "0".repeat(64)});
    expect(issueCodes([forged])).toContain("identity_fingerprint_mismatch");
  });

  it("detects invalid supersession links and preserves an opaque non-PII actor contract", () => {
    expect(() => compile({actor: {kind: "user", ref: "user:person@example.com"}})).toThrow();
    expect(() => compile({actor: {kind: "user", ref: "user:CarlosSilva"}})).toThrow();

    const mismatched = compile({
      supersession: {state: "superseded", supersededBy: null, reasonRef: "decision:replace-file"},
    });
    expect(issueCodes([mismatched])).toContain("supersession_state_mismatch");
  });

  it("detects inconsistent confidentiality and connector state", () => {
    const classification = compile({dataClass: "public", confidentiality: "confidential"});
    expect(issueCodes([classification])).toContain("data_confidentiality_mismatch");

    const connector = compile({
      source: {
        ...baseInput().source,
        integration: {status: "verified_connector", connectorId: null},
      },
    });
    expect(issueCodes([connector])).toContain("source_integration_state_mismatch");
  });

  it("keeps the graph fingerprint deterministic across record order", () => {
    const v1 = compile({
      supersession: {state: "superseded", supersededBy: sourceRef({version: 2}), reasonRef: "decision:new-version"},
    });
    const v2 = compile({
      version: 2,
      parentVersion: sourceRef(),
      immutableSourceBytes: new TextEncoder().encode("version two"),
      sourceSnapshot: {
        state: "immutable_bytes",
        locatorRef: "storage:opportunity-documents/object-v2",
        objectVersionRef: null,
        capturedSha256: hash("version two"),
      },
      extractedLayers: [],
      derivatives: [],
    });
    const correctlyLinkedV1 = resign({
      ...v1,
      supersession: {
        ...v1.supersession,
        supersededBy: {...sourceRef({version: 2}), sourceBytesSha256: v2.sourceBytes.sha256},
      },
    });
    const forward = validateGovernedDocumentIdentityGraph([correctlyLinkedV1, v2]);
    const reverse = validateGovernedDocumentIdentityGraph([v2, correctlyLinkedV1]);
    expect(forward.status).toBe("valid");
    expect(reverse.graphFingerprint).toBe(forward.graphFingerprint);
  });
});
