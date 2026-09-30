import {z} from "zod";
import {artifactManifestSchema, freezeArtifactValue, type DeepReadonly} from "./artifact-protocol";

/** Server-issued capture facts. Parsing validates identity and coherence, never grants access
 * or discovers completeness from citations. Rights and current authority remain SQL duties. */
export const capitalPublicCaptureSchemaVersion = "capital-public-capture.v1";
const uuid = z.uuid();
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1).max(200);
const count = z.number().int().nonnegative();
type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
const json: z.ZodType<Json> = z.lazy(() => z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(z.string(), json)]));
const payload = z.record(z.string(), json);
const identity = {organizationId: uuid, workId: uuid, jobId: uuid};

export const capitalPublicAnalysisScopeSchema = z.enum(["provider_case_fit", "provider_research", "integration_preview", "company_debt_view", "origination_thesis", "capital_planning"]);
export const capitalPublicArtifactTypeSchema = z.enum([
  "provider_research", "provider_research_scope", "provider_research_sources", "provider_case_fit", "provider_case_fit_scope", "provider_case_fit_sources",
  "company_resolution", "origination_mandate", "constraint_register", "origination_research_lenses", "sector_regulatory_research", "comparable_debt_transactions_research", "meeting_brief_definition", "origination_execution_plan", "meeting_brief",
  "diagnostic_mandate", "diagnostic_lenses", "diagnostic_definition", "company_debt_execution_plan", "document_ingestion_status", "document_classification_status", "document_extraction_status", "document_fact_candidate_status", "entity_period_unit_resolution", "evidence_reconciliation_status", "accounting_identity_status", "business_model_reconstruction", "public_financial_spreading", "earnings_quality_analysis", "debt_economic_map", "working_capital_analysis", "projection_normalization", "scenario_stress_analysis", "risk_mitigation_diagnostic", "capacity_assessment", "company_debt_diagnostic",
  "company_scope", "capital_intent", "candidate_archetypes", "deliverable_definition", "capital_planning_execution_plan", "financial_spreading", "structuring_thesis", "request_need_comparison", "instrument_universe", "legal_economic_filters", "collateral_map", "structure_alternatives", "pricing_terms_research", "total_cost_comparison", "covenant_protection_design", "sources_uses", "alternative_comparison", "alternative_map",
  "preview_debt_ledger", "preview_financial_statements", "preview_covenants", "preview_maturity_wall", "preview_interest_schedule", "preview_exit_costs", "preview_scenarios", "preview_alternatives", "preview_meeting_brief", "preview_material", "preview_presentation_material", "preview_workbook_material", "preview_material_execution_status", "preview_decision_contract",
]);
export const capitalCaptureUnresolvedReasonSchema = z.enum(["retention_storage_not_resolved", "origin_adapter_not_resolved", "public_license_missing", "public_source_closure_unresolved", "missing_source_pin", "missing_rights_pin", "missing_delivery", "missing_origin", "unsupported_origin", "unsupported_artifact_type", "closure_cycle", "closure_limit", "missing_dependency_revision", "missing_public_license", "missing_referenced_bytes", "legacy_unproved"]);
const reasons = z.array(capitalCaptureUnresolvedReasonSchema).min(1).max(20).refine(v => new Set(v).size === v.length, "duplicate_unresolved_reason");

/** A public bridge names its licensing tenant explicitly; it is never a same-tenant source FK.
 * publicPayloadFingerprint identifies the licensed url/title/snippet/contentHash projection,
 * whereas the delivery's payloadFingerprint hashes the entire delivered JSON, metadata included.
 * SQL validates the licensed projection; these two digests need not be equal. */
export const capitalPublicDeliveryOriginSchema = z.discriminatedUnion("kind", [
  z.strictObject({kind: z.literal("governed_workspace_source"), organizationId: uuid, sourceVersionId: uuid, rightsVersionId: uuid, deliveredPayloadFingerprint: fingerprint}),
  z.strictObject({kind: z.literal("published_public_payload"), licensingOrganizationId: uuid, sourceVersionId: uuid, rightsVersionId: uuid, sourceBindingId: uuid,
    publicPayloadFingerprint: fingerprint, audience: z.literal("public_raw_reuse")}),
  z.strictObject({kind: z.literal("authorized_workspace_snapshot"), organizationId: uuid, objectKind: z.enum(["brief", "assumption", "configuration", "criterion", "observation", "artifact_revision", "method_catalogue", "source_pack"]),
    objectId: text, objectVersion: text, objectFingerprint: fingerprint, sourceClosureFingerprint: fingerprint}),
]);
/** Transient request payload for the public-source adapter, not a persisted-byte contract.
 * SQL additionally enforces its 1 MiB JSONB byte bound and validates the exact licensed projection. */
export const capitalPublicLicensedPayloadSchema = z.strictObject({url: z.string().min(1).max(4096).regex(/^https:\/\//), title: z.string().min(1).max(2000), contentHash: fingerprint,
  snippet: z.string().max(200000).optional(), id: z.string().max(4096).optional(), provider: z.string().max(4096).optional(), topic: z.string().max(4096).optional(),
  queryId: z.string().max(4096).optional(), publishedAt: z.string().max(4096).optional(), retrievedAt: z.string().max(4096).optional()});
const deliveryBase = {schemaVersion: z.literal(capitalPublicCaptureSchemaVersion), ...identity, captureId: uuid, deliveryId: uuid, deliveryKey: text, payloadFingerprint: fingerprint, deliveredAt: z.iso.datetime({offset: true}), payload};
/** Transient producer draft only. The foundation stores fingerprints and pins, not payload;
 * its RPC response below never contains payload and cannot report complete before byte retention. */
export const capitalPublicDeliveryDraftSchema = z.strictObject({...deliveryBase, state: z.literal("unresolved"), origins: z.array(capitalPublicDeliveryOriginSchema).max(10000), reasons}).superRefine((d, ctx) => {
  // Each public delivery contains exactly one licensed payload. A composite context must
  // reference separate public deliveries; its aggregate hash cannot reuse a snippet license.
  if (d.origins.some(origin => origin.kind === "published_public_payload") && d.origins.length !== 1) ctx.addIssue({code: "custom", message: "public_delivery_must_be_individual"});
  for (const origin of d.origins) {
    if (origin.kind !== "published_public_payload" && origin.organizationId !== d.organizationId) ctx.addIssue({code: "custom", message: "capture_origin_tenant_mismatch"});
    if (origin.kind === "governed_workspace_source" && origin.deliveredPayloadFingerprint !== d.payloadFingerprint) ctx.addIssue({code: "custom", message: "source_delivery_payload_mismatch"});
  }
});
export type CapitalPublicDeliveryDraft = DeepReadonly<z.infer<typeof capitalPublicDeliveryDraftSchema>>;

const dependency = z.strictObject({revisionId: uuid, manifestFingerprint: fingerprint});
const deliveryPin = z.strictObject({deliveryId: uuid, payloadFingerprint: fingerprint});
const governedPin = z.strictObject({sourceVersionId: uuid, rightsVersionId: uuid});
const publicPin = z.strictObject({licensingOrganizationId: uuid, sourceBindingId: uuid, sourceVersionId: uuid, rightsVersionId: uuid, publicPayloadFingerprint: fingerprint});
const proof = z.strictObject({deliveredCount: count, governedSourceCount: count, publicDeliveryCount: count, closureFingerprint: fingerprint});
const snapshotBase = {schemaVersion: z.literal(capitalPublicCaptureSchemaVersion), ...identity, captureId: uuid, humanSubjectId: uuid,
  analysisScope: capitalPublicAnalysisScopeSchema, plan: z.strictObject({id: uuid, fingerprint, compilerVersion: text, registryVersion: text}),
  brief: z.strictObject({id: uuid, version: z.number().int().positive(), fingerprint}),
  executor: z.strictObject({key: text, version: text, sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), methodFingerprint: fingerprint.nullable()}),
  capturedAt: z.iso.datetime({offset: true}), contextFingerprint: fingerprint,
  deliveryPins: z.array(deliveryPin).max(10000), governedSources: z.array(governedPin).max(10000), publicDeliveries: z.array(publicPin).max(10000),
  dependencies: z.array(dependency).max(1000), correctionBasis: dependency.nullable()};
/** Future task-input description, not the metadata-only loader response; no consumer in this slice. */
export const capitalPublicCaptureSnapshotSchema = z.strictObject({...snapshotBase, state: z.literal("unresolved"), proof: proof.nullable(), reasons}).superRefine((s, ctx) => {
  for (const [label, values] of [["delivery", s.deliveryPins.map(v => v.deliveryId)], ["dependency", s.dependencies.map(v => v.revisionId)], ["source", s.governedSources.map(v => `${v.sourceVersionId}:${v.rightsVersionId}`)], ["public", s.publicDeliveries.map(v => `${v.licensingOrganizationId}:${v.sourceBindingId}:${v.publicPayloadFingerprint}`)]] as const) {
    if (new Set(values).size !== values.length) ctx.addIssue({code: "custom", message: `duplicate_capture_${label}`});
  }
  if (s.proof && (s.proof.deliveredCount !== s.deliveryPins.length || s.proof.governedSourceCount !== s.governedSources.length || s.proof.publicDeliveryCount !== s.publicDeliveries.length)) ctx.addIssue({code: "custom", message: "capture_proof_count_mismatch"});
});
export type CapitalPublicCaptureSnapshot = DeepReadonly<z.infer<typeof capitalPublicCaptureSnapshotSchema>>;

/** Future artifact replay identity only; this slice exposes no artifact output/recovery RPC. */
export const capitalPublicReplayKeySchema = z.strictObject({...identity, taskRunId: uuid, inputSnapshotId: uuid, inputSnapshotFingerprint: fingerprint, artifactType: capitalPublicArtifactTypeSchema});
export type CapitalPublicReplayKey = DeepReadonly<z.infer<typeof capitalPublicReplayKeySchema>>;
/** Metadata-only capsule: no captured/current/historic context is returned or persisted by
 * this foundation. Actual delivery awaits retained-byte storage and fresh rights verification. */
export const capitalPublicCaptureContextResponseSchema = z.strictObject({context: z.null(), capture: z.strictObject({
  id: uuid, fingerprint, state: z.literal("unresolved"), schemaVersion: z.literal(capitalPublicCaptureSchemaVersion),
})});
const deliveryUnresolvedReasons = z.array(z.enum(["origin_adapter_not_resolved", "public_license_missing", "public_source_closure_unresolved", "retention_storage_not_resolved"])).min(1).max(4).refine(v => new Set(v).size === v.length, "duplicate_unresolved_reason");
export const capitalPublicDeliveryResponseSchema = z.strictObject({deliveryId: uuid, payloadFingerprint: fingerprint,
  state: z.literal("unresolved"), replayed: z.boolean(), unresolvedReasons: deliveryUnresolvedReasons});
export type CapitalPublicDeliveryResponse = DeepReadonly<z.infer<typeof capitalPublicDeliveryResponseSchema>>;

/** Current RPC response is scoped against the payload fingerprint requested by the adapter;
 * the state is returned by SQL, never inferred from origins, counts or evidence_refs. */
export function parseCapitalPublicDeliveryResponse(data: unknown, expectedPayloadFingerprint: string): CapitalPublicDeliveryResponse {
  const expected = fingerprint.parse(expectedPayloadFingerprint);
  const response = capitalPublicDeliveryResponseSchema.parse(data);
  if (response.payloadFingerprint !== expected) throw new Error("capital_capture_delivery_response_mismatch");
  return freezeArtifactValue(response);
}

/** Future native bindings must use the existing strict ArtifactManifest, never legacy links
 * mixed with a snapshot. This validator does not seal an input or manufacture a method release. */
export const capitalPublicNativeManifestSchema = artifactManifestSchema.superRefine((manifest, ctx) => {
  if (manifest.legacy !== null || manifest.inputSnapshot === null || manifest.execution !== null || manifest.institutionalResult !== null
    || manifest.kind !== "work_product" || manifest.format !== "json" || manifest.audience !== "internal") ctx.addIssue({code: "custom", message: "capital_capture_native_manifest_invalid"});
  if (manifest.sources.some(source => source.rightsVersionId === null)) ctx.addIssue({code: "custom", message: "capital_capture_native_rights_pin_required"});
});
