import {describe, expect, it} from "vitest";
import {artifactManifestSchemaVersion} from "./artifact-protocol";
import {capitalPublicArtifactTypeSchema, capitalPublicCaptureContextResponseSchema, capitalPublicCaptureSnapshotSchema, capitalPublicDeliveryOriginSchema, capitalPublicDeliveryResponseSchema, capitalPublicDeliveryDraftSchema, capitalPublicNativeManifestSchema, capitalPublicLicensedPayloadSchema, capitalPublicReplayKeySchema, parseCapitalPublicDeliveryResponse} from "./capital-public-capture";

const id = (n: number) => `12345678-1234-4123-8123-${String(n).padStart(12, "0")}`;
const hash = "a".repeat(64);
const other = "b".repeat(64);
const scope = {organizationId: id(1), workId: id(2), jobId: id(3)};
const origin = {kind: "published_public_payload", licensingOrganizationId: id(9), sourceVersionId: id(10), rightsVersionId: id(11), sourceBindingId: id(12), publicPayloadFingerprint: other, audience: "public_raw_reuse"};
const delivery = {schemaVersion: "capital-public-capture.v1", ...scope, captureId: id(4), deliveryId: id(5), deliveryKey: "research:source:1", payloadFingerprint: hash, deliveredAt: "2026-09-30T12:00:00Z", payload: {url: "https://example.com/source", title: "Delivered source", snippet: "Delivered text only", contentHash: "c".repeat(64)}, state: "unresolved", reasons: ["retention_storage_not_resolved"], origins: [origin]};
const response = {deliveryId: id(5), payloadFingerprint: hash, state: "unresolved", replayed: false, unresolvedReasons: ["retention_storage_not_resolved"]};
const snapshot = {schemaVersion: "capital-public-capture.v1", ...scope, captureId: id(4), humanSubjectId: id(6), analysisScope: "provider_research", plan: {id: id(7), fingerprint: hash, compilerVersion: "v1", registryVersion: "v1"}, brief: {id: id(8), version: 1, fingerprint: hash}, executor: {key: "provider_research", version: "v2", sourceCommit: "a".repeat(40), methodFingerprint: null}, capturedAt: "2026-09-30T12:00:00Z", contextFingerprint: hash, deliveryPins: [{deliveryId: id(5), payloadFingerprint: hash}], governedSources: [], publicDeliveries: [{licensingOrganizationId: id(9), sourceBindingId: id(12), sourceVersionId: id(10), rightsVersionId: id(11), publicPayloadFingerprint: origin.publicPayloadFingerprint}], dependencies: [], correctionBasis: null, state: "unresolved", proof: null, reasons: ["legacy_unproved"]};
const manifest = {schemaVersion: artifactManifestSchemaVersion, kind: "work_product", audience: "internal", format: "json", bytes: null, method: null, execution: null, inputSnapshot: {fingerprint: hash}, institutionalResult: null, sources: [], claims: [], traces: [], template: null, provenance: {producer: "capital-public-capture", jobId: id(3), taskRunId: id(13), messageId: null, capability: null}, legacy: null};

describe("capital public capture foundation", () => {
  it("keeps delivery and global capture unresolved until retained bytes and closure exist", () => {
    const context = {context: null, capture: {id: id(4), fingerprint: hash, state: "unresolved", schemaVersion: "capital-public-capture.v1"}};
    expect(capitalPublicCaptureContextResponseSchema.parse(context)).toEqual(context);
    expect(capitalPublicCaptureContextResponseSchema.safeParse({...context, context: {project: {id: scope.workId}}}).success).toBe(false);
    expect(capitalPublicCaptureContextResponseSchema.safeParse({...context, capture: {...context.capture, state: "complete"}}).success).toBe(false);
    expect(capitalPublicCaptureSnapshotSchema.safeParse({...snapshot, state: "complete", proof: {deliveredCount: 1, governedSourceCount: 0, publicDeliveryCount: 1, closureFingerprint: hash}}).success).toBe(false);
  });
  it("preserves the transient draft and pins without promising persisted bytes", () => {
    const parsed = capitalPublicDeliveryDraftSchema.parse(delivery);
    expect(parsed.payload).toEqual(delivery.payload);
    expect(parsed.state).toBe("unresolved");
    expect(parsed.origins[0]).toEqual(origin);
    expect(parsed.organizationId).not.toBe(origin.licensingOrganizationId);
  });
  it("keeps financial JSON and custom metadata in an unresolved transient request", () => {
    const financial = {...delivery, payload: {unit: "BRL million", value: "123.4500", period: "2026-Q2", metadata: {truncationCharacters: 1400}},
      state: "unresolved", reasons: ["origin_adapter_not_resolved"], origins: []};
    expect(capitalPublicDeliveryDraftSchema.parse(financial).payload).toEqual(financial.payload);
    expect(capitalPublicDeliveryDraftSchema.safeParse({...delivery, state: "complete", payload: financial.payload}).success).toBe(false);
    expect(capitalPublicLicensedPayloadSchema.safeParse({...delivery.payload, metadata: financial.payload.metadata}).success).toBe(false);
  });
  it("matches the public adapter's closed scalar fields and optional snippet without defaults", () => {
    const {snippet: _snippet, ...withoutSnippet} = delivery.payload;
    expect(capitalPublicLicensedPayloadSchema.parse(withoutSnippet)).toEqual(withoutSnippet);
    for (const invalid of [{...delivery.payload, url: "http://example.com/source"}, {...delivery.payload, title: ""}, {...delivery.payload, snippet: null},
      {...delivery.payload, snippet: "x".repeat(200001)}, {...delivery.payload, queryId: null}, {...delivery.payload, retrievedAt: {date: "2026-09-30"}},
      {...delivery.payload, provider: "x".repeat(4097)}, {...delivery.payload, extraField: "unlicensed metadata"}]) {
      expect(capitalPublicLicensedPayloadSchema.safeParse(invalid).success).toBe(false);
    }
  });
  it("accepts zero governed sources only as unresolved metadata, never closed task proof", () => {
    expect(capitalPublicCaptureSnapshotSchema.parse(snapshot).state).toBe("unresolved");
    expect(capitalPublicCaptureSnapshotSchema.safeParse({...snapshot, evidence_refs: []}).success).toBe(false);
  });
  it.each(["evidence_refs", "accessBasis", "allowed", "url", "sourceCount", "complete"]) ("rejects pseudo-proof field %s in delivery responses", field => {
    expect(capitalPublicDeliveryResponseSchema.safeParse({...response, [field]: field === "evidence_refs" ? [] : true}).success).toBe(false);
  });
  it("requires source, rights, binding and exact payload pins, never a URL license", () => {
    for (const key of ["sourceVersionId", "rightsVersionId", "sourceBindingId", "publicPayloadFingerprint"]) {
      const missing = {...origin} as Record<string, unknown>; delete missing[key];
      expect(capitalPublicDeliveryOriginSchema.safeParse(missing).success).toBe(false);
    }
    expect(capitalPublicDeliveryOriginSchema.safeParse({...origin, accessBasis: "public", url: "https://example.com"}).success).toBe(false);
    expect(capitalPublicDeliveryDraftSchema.safeParse({...delivery, origins: [{...origin, publicPayloadFingerprint: "not-a-sha256"}]}).success).toBe(false);
    expect(capitalPublicDeliveryDraftSchema.safeParse({...delivery, origins: [{...origin, audience: "analysis"}]}).success).toBe(false);
  });
  it("does not license an aggregate context with an individual payload license", () => {
    expect(capitalPublicDeliveryDraftSchema.safeParse({...delivery, origins: [origin, {...origin, sourceBindingId: id(14)}]}).success).toBe(false);
  });
  it("retains metadata and distinct integral/public digests without reinterpreting the license pin", () => {
    const withMetadata = {...delivery, payload: {...delivery.payload, retrievedAt: "2026-09-30T12:00:00Z", queryId: "sector:1", provider: "Synthetic public provider", topic: "sector"}};
    const first = capitalPublicDeliveryDraftSchema.parse(withMetadata);
    expect(first.payload).toEqual(withMetadata.payload);
    expect(first.payloadFingerprint).toBe(hash);
    expect(first.origins[0]).toEqual(origin);
    expect(first.payloadFingerprint).not.toBe(origin.publicPayloadFingerprint);
    // SQL may return a changed integral digest when only retrieval metadata changes;
    // the separately licensed projection's pin remains unchanged.
    const second = capitalPublicDeliveryDraftSchema.parse({...withMetadata, payloadFingerprint: "d".repeat(64),
      payload: {...withMetadata.payload, retrievedAt: "2026-09-30T13:00:00Z"}});
    expect(second.origins[0]).toEqual(first.origins[0]);
    expect(second.payloadFingerprint).not.toBe(first.payloadFingerprint);
    expect(second.payload.retrievedAt).toBe("2026-09-30T13:00:00Z");
  });
  it("rejects workspace sources or snapshots belonging to another tenant", () => {
    const source = {kind: "governed_workspace_source", organizationId: id(9), sourceVersionId: id(10), rightsVersionId: id(11), deliveredPayloadFingerprint: hash};
    expect(capitalPublicDeliveryDraftSchema.safeParse({...delivery, state: "unresolved", reasons: ["origin_adapter_not_resolved"], origins: [source]}).success).toBe(false);
    expect(capitalPublicDeliveryDraftSchema.safeParse({...delivery, state: "unresolved", reasons: ["origin_adapter_not_resolved"], origins: [{...source, organizationId: scope.organizationId}]}).success).toBe(true);
    expect(capitalPublicDeliveryDraftSchema.safeParse({...delivery, state: "complete", origins: [{...source, organizationId: scope.organizationId}]}).success).toBe(false);
    const workspace = {kind: "authorized_workspace_snapshot", organizationId: id(9), objectKind: "brief", objectId: id(8), objectVersion: "1", objectFingerprint: hash, sourceClosureFingerprint: hash};
    expect(capitalPublicDeliveryDraftSchema.safeParse({...delivery, state: "unresolved", reasons: ["origin_adapter_not_resolved"], origins: [workspace]}).success).toBe(false);
    expect(capitalPublicDeliveryDraftSchema.safeParse({...delivery, state: "unresolved", reasons: ["origin_adapter_not_resolved"], origins: [{...workspace, organizationId: scope.organizationId}]}).success).toBe(true);
  });
  it("keeps an unresolved server response unresolved despite an empty evidence list elsewhere", () => {
    const unresolved = {...response, state: "unresolved", unresolvedReasons: ["origin_adapter_not_resolved"]};
    expect(parseCapitalPublicDeliveryResponse(unresolved, hash).state).toBe("unresolved");
    expect(capitalPublicDeliveryResponseSchema.safeParse({...unresolved, unresolvedReasons: []}).success).toBe(false);
    expect(capitalPublicDeliveryResponseSchema.safeParse({...response, state: "complete", unresolvedReasons: []}).success).toBe(false);
    expect(capitalPublicDeliveryResponseSchema.safeParse({...unresolved, unresolvedReasons: ["unrecognized_reason"]}).success).toBe(false);
    expect(parseCapitalPublicDeliveryResponse({...response, unresolvedReasons: ["retention_storage_not_resolved"]}, hash).state).toBe("unresolved");
    expect(capitalPublicDeliveryResponseSchema.safeParse({...response, payload: delivery.payload}).success).toBe(false);
  });
  it("rejects the wrong returned payload and freezes the accepted server fact", () => {
    expect(() => parseCapitalPublicDeliveryResponse({...response, payloadFingerprint: other}, hash)).toThrow("capital_capture_delivery_response_mismatch");
    const parsed = parseCapitalPublicDeliveryResponse({...response, replayed: true}, hash);
    expect(parsed.replayed).toBe(true);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.unresolvedReasons)).toBe(true);
  });
  it("rejects count inconsistencies and repeated input pins without promoting state", () => {
    expect(capitalPublicCaptureSnapshotSchema.safeParse({...snapshot, proof: {deliveredCount: 0, governedSourceCount: 0, publicDeliveryCount: 1, closureFingerprint: hash}}).success).toBe(false);
    expect(capitalPublicCaptureSnapshotSchema.safeParse({...snapshot, deliveryPins: [...snapshot.deliveryPins, ...snapshot.deliveryPins]}).success).toBe(false);
  });
  it("retains a distinct replay key for each preview output without promising output recovery", () => {
    const base = {...scope, taskRunId: id(13), inputSnapshotId: id(14), inputSnapshotFingerprint: hash};
    const keys = ["preview_presentation_material", "preview_workbook_material", "preview_decision_contract"].map(artifactType => capitalPublicReplayKeySchema.parse({...base, artifactType}));
    expect(new Set(keys.map(key => JSON.stringify(key))).size).toBe(3);
    expect(capitalPublicReplayKeySchema.safeParse(base).success).toBe(false);
    expect(capitalPublicReplayKeySchema.safeParse({...base, artifactType: "latest"}).success).toBe(false);
  });
  it("rejects unsupported artifacts explicitly instead of claiming capture completeness", () => {
    expect(capitalPublicArtifactTypeSchema.safeParse("new_unresolved_producer").success).toBe(false);
  });
  it("validates the native manifest without legacy links or free snapshot fields", () => {
    expect(capitalPublicNativeManifestSchema.parse(manifest)).toEqual(manifest);
    for (const candidate of [{...manifest, legacy: {table: "capital_project_artifacts", id: id(16), fingerprint: hash, evidence: []}}, {...manifest, inputSnapshot: {...manifest.inputSnapshot, id: id(14)}}, {...manifest, approval: "confirmed"}, {...manifest, sources: [{sourceVersionId: id(10), rightsVersionId: null}]}]) {
      expect(capitalPublicNativeManifestSchema.safeParse(candidate).success).toBe(false);
    }
  });
});
