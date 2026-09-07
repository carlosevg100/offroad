import {createHash} from "node:crypto";
import {z} from "zod";
import type {TrustControlCatalogue} from "./control-register";

const dateTimeSchema = z.string().datetime({offset: true});
const inventoryIdSchema = z.string().regex(/^[A-Z]{2,5}-[A-Z0-9-]+$/);
const evidenceIdSchema = z.string().regex(/^SEV-[A-Z0-9-]+$/);
const gapIdSchema = z.string().regex(/^SG-[A-Z0-9-]+$/);
const controlIdSchema = z.string().regex(/^TRUST-[A-Z0-9-]+$/);

export const securityInventoryStateSchema = z.enum(["verified", "partial", "unknown"]);
export type SecurityInventoryState = z.infer<typeof securityInventoryStateSchema>;

export const securityDataClassSchema = z.enum([
  "public",
  "internal_operational",
  "personal_data",
  "customer_confidential",
  "restricted_financial",
  "credential_secret",
  "security_evidence",
]);
export type SecurityDataClassId = z.infer<typeof securityDataClassSchema>;

export const securityEnvironmentClassSchema = z.enum([
  "production",
  "non_production_isolated",
  "non_production_connected",
  "local_development",
  "ci_ephemeral",
  "external_service",
  "unknown",
]);
export type SecurityEnvironmentClass = z.infer<typeof securityEnvironmentClassSchema>;

export const securityOwnerSchema = z.object({
  ownerRole: z.string().min(1).nullable(),
  backupOwnerRole: z.string().min(1).nullable(),
  assignment: z.enum(["named", "functional_role_only", "unassigned"]),
});
export type SecurityOwner = z.infer<typeof securityOwnerSchema>;

export const securityInventoryEvidenceSchema = z.object({
  evidenceId: evidenceIdSchema,
  kind: z.enum(["repository_file", "automated_test", "configuration", "external_snapshot", "contract_record", "design_reference"]),
  ref: z.string().min(1),
  capturedAt: dateTimeSchema,
  freshness: z.enum(["immutable", "time_bound"]),
  validThrough: dateTimeSchema.nullable(),
  immutableFingerprint: z.string().regex(/^[a-f0-9]{7,64}$/).nullable(),
  contentFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(),
  collector: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    principalClass: z.string().min(1),
  }).nullable(),
  description: z.string().min(1),
});
export type SecurityInventoryEvidence = z.infer<typeof securityInventoryEvidenceSchema>;

const governedEntitySchema = z.object({
  status: securityInventoryStateSchema,
  owner: securityOwnerSchema,
  evidenceRefs: z.array(evidenceIdSchema).min(1),
  gapRefs: z.array(gapIdSchema),
  controlIds: z.array(controlIdSchema).min(1),
});

export const securityDataClassRecordSchema = z.object({
  dataClassId: securityDataClassSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  handlingRule: z.string().min(1),
  permittedEnvironmentRefs: z.array(inventoryIdSchema).min(1),
  externalUseRequiresApproval: z.boolean(),
  ...governedEntitySchema.shape,
});
export type SecurityDataClassRecord = z.infer<typeof securityDataClassRecordSchema>;

export const securityEnvironmentRecordSchema = z.object({
  environmentId: inventoryIdSchema,
  title: z.string().min(1),
  classification: securityEnvironmentClassSchema.nullable(),
  purpose: z.string().min(1),
  region: z.string().min(1).nullable(),
  customerDataPolicy: z.enum(["allowed", "prohibited", "unknown"]),
  ...governedEntitySchema.shape,
});
export type SecurityEnvironmentRecord = z.infer<typeof securityEnvironmentRecordSchema>;

export const securitySystemRecordSchema = z.object({
  systemId: inventoryIdSchema,
  title: z.string().min(1),
  kind: z.enum(["application", "database_platform", "storage_platform", "worker", "delivery_pipeline", "observability", "email", "developer_endpoint"]),
  purpose: z.string().min(1),
  environmentRefs: z.array(inventoryIdSchema).min(1),
  dataClassIds: z.array(securityDataClassSchema).min(1),
  vendorRefs: z.array(inventoryIdSchema),
  ...governedEntitySchema.shape,
});
export type SecuritySystemRecord = z.infer<typeof securitySystemRecordSchema>;

export const securityDataStoreRecordSchema = z.object({
  storeId: inventoryIdSchema,
  title: z.string().min(1),
  systemRef: inventoryIdSchema,
  environmentRefs: z.array(inventoryIdSchema).min(1),
  dataClassIds: z.array(securityDataClassSchema).min(1),
  tenancyBoundary: z.string().min(1),
  retentionState: z.enum(["defined", "partial", "unknown"]),
  backupState: z.enum(["tested", "provider_managed_unverified", "unknown"]),
  ...governedEntitySchema.shape,
});
export type SecurityDataStoreRecord = z.infer<typeof securityDataStoreRecordSchema>;

export const securityDataFlowRecordSchema = z.object({
  flowId: inventoryIdSchema,
  title: z.string().min(1),
  sourceRef: inventoryIdSchema,
  destinationRef: inventoryIdSchema,
  environmentRefs: z.array(inventoryIdSchema).min(1),
  dataClassIds: z.array(securityDataClassSchema).min(1),
  purpose: z.string().min(1),
  authorizationBoundary: z.string().min(1),
  direction: z.enum(["inbound", "outbound", "internal"]),
  ...governedEntitySchema.shape,
});
export type SecurityDataFlowRecord = z.infer<typeof securityDataFlowRecordSchema>;

export const securityIdentityRecordSchema = z.object({
  identityId: inventoryIdSchema,
  title: z.string().min(1),
  kind: z.enum(["human_role", "service_role", "oidc_principal", "database_role", "api_credential", "end_user"]),
  systemRef: inventoryIdSchema,
  environmentRefs: z.array(inventoryIdSchema).min(1),
  privilege: z.enum(["public", "tenant_scoped", "workload_scoped", "privileged", "unknown"]),
  authentication: z.string().min(1),
  lifecycleState: z.enum(["defined", "partial", "unknown"]),
  ...governedEntitySchema.shape,
});
export type SecurityIdentityRecord = z.infer<typeof securityIdentityRecordSchema>;

export const securityVendorRecordSchema = z.object({
  vendorId: inventoryIdSchema,
  title: z.string().min(1),
  service: z.string().min(1),
  role: z.enum(["infrastructure", "processor", "subprocessor", "development", "supply_chain", "unknown"]),
  environmentRefs: z.array(inventoryIdSchema).min(1),
  dataClassIds: z.array(securityDataClassSchema),
  activationState: z.enum(["observed_in_code", "observed_in_deployment_config", "live_verified", "unknown"]),
  contractState: z.enum(["verified_current", "partial", "unknown"]),
  retentionState: z.enum(["verified_current", "partial", "unknown"]),
  trainingUseState: z.enum(["prohibited_verified", "not_applicable", "partial", "unknown"]),
  regionState: z.enum(["verified_current", "partial", "unknown"]),
  ...governedEntitySchema.shape,
});
export type SecurityVendorRecord = z.infer<typeof securityVendorRecordSchema>;

export const securityInventoryGapSchema = z.object({
  gapId: gapIdSchema,
  title: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["open", "resolved"]),
  owner: securityOwnerSchema,
  targetRefs: z.array(z.union([inventoryIdSchema, securityDataClassSchema])).min(1),
  evidenceRefs: z.array(evidenceIdSchema).min(1),
  controlIds: z.array(controlIdSchema).min(1),
  nextAction: z.string().min(1),
});
export type SecurityInventoryGap = z.infer<typeof securityInventoryGapSchema>;

export const securityCurrentStateInventorySchema = z.object({
  inventoryVersion: z.string().min(1),
  generatedAt: dateTimeSchema,
  baseline: z.object({
    repository: z.string().min(1),
    branch: z.literal("main"),
    commit: z.string().regex(/^[a-f0-9]{7,40}$/),
    evidenceCutoff: dateTimeSchema,
    reviewDueAt: dateTimeSchema,
  }),
  scopeStatement: z.string().min(1),
  scopeRelationship: z.object({
    semantics: z.literal("environment_and_data_class_refs_are_independent_unions"),
    environmentDataMatrixState: z.literal("not_inventoried"),
    gapRef: gapIdSchema,
  }),
  limitations: z.array(z.string().min(1)).min(1),
  evidenceIndex: z.array(securityInventoryEvidenceSchema).min(1),
  environments: z.array(securityEnvironmentRecordSchema).min(1),
  dataClasses: z.array(securityDataClassRecordSchema).min(1),
  systems: z.array(securitySystemRecordSchema).min(1),
  dataStores: z.array(securityDataStoreRecordSchema).min(1),
  dataFlows: z.array(securityDataFlowRecordSchema).min(1),
  identities: z.array(securityIdentityRecordSchema).min(1),
  vendors: z.array(securityVendorRecordSchema).min(1),
  gaps: z.array(securityInventoryGapSchema),
});
export type SecurityCurrentStateInventory = z.infer<typeof securityCurrentStateInventorySchema>;

export type SecurityInventoryIssue = {
  code: string;
  subjectRef: string | null;
};

export type SecurityInventoryDecision = {
  structurallyValid: boolean;
  assuranceReady: false;
  blockers: SecurityInventoryIssue[];
  warnings: SecurityInventoryIssue[];
  counts: {
    environments: number;
    systems: number;
    dataStores: number;
    dataFlows: number;
    identities: number;
    vendors: number;
    openGaps: number;
  };
  inventoryFingerprint: string;
};

const secretPatterns: Array<{name: string; pattern: RegExp}> = [
  {name: "private_key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/},
  {name: "openai_style_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/},
  {name: "stripe_style_key", pattern: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/},
  {name: "aws_access_key", pattern: /\bAKIA[A-Z0-9]{16}\b/},
  {name: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/},
  {name: "github_fine_grained_token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/},
  {name: "perplexity_key", pattern: /\bpplx-[A-Za-z0-9_-]{20,}\b/},
  {name: "firecrawl_key", pattern: /\bfc-[A-Za-z0-9_-]{20,}\b/},
  {name: "supabase_secret_key", pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/},
  {name: "posthog_personal_key", pattern: /\bphc_[A-Za-z0-9_-]{20,}\b/},
  {name: "google_api_key", pattern: /\bAIza[0-9A-Za-z_-]{25,}\b/},
  {name: "credential_in_url", pattern: /https?:\/\/[^\s/:]+:[^\s/@]+@/},
  {name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/},
];

/**
 * Validates current-state truth. The inventory can be structurally valid while material gaps stay
 * open; it can never be used as evidence of certification, external testing or operating maturity.
 */
export function evaluateSecurityCurrentStateInventory(
  inventory: SecurityCurrentStateInventory,
  trustControlCatalogue: TrustControlCatalogue,
  now = new Date(),
): SecurityInventoryDecision {
  const rawSerialized = JSON.stringify(inventory);
  const rawSecretIssues: SecurityInventoryIssue[] = [];
  for (const {name, pattern} of secretPatterns) {
    if (pattern.test(rawSerialized)) rawSecretIssues.push({code: `secret_material_detected:${name}`, subjectRef: null});
  }
  const awsSecretCandidates = rawSerialized.match(/(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])/g) ?? [];
  if (awsSecretCandidates.some((candidate) => /[A-Z]/.test(candidate) && /[a-z]/.test(candidate) && /\d/.test(candidate) && /[+/]/.test(candidate))) {
    rawSecretIssues.push({code: "secret_material_detected:aws_secret_access_key", subjectRef: null});
  }
  if (/"(?:api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token|aws_secret_access_key)"\s*:\s*"[^"\s]{8,}"/i.test(rawSerialized)) {
    rawSecretIssues.push({code: "secret_material_detected:sensitive_field", subjectRef: null});
  }
  const parsed = securityCurrentStateInventorySchema.parse(inventory);
  const blockers: SecurityInventoryIssue[] = [...rawSecretIssues];
  const warnings: SecurityInventoryIssue[] = [];
  const evidenceById = indexed(parsed.evidenceIndex, (item) => item.evidenceId, "duplicate_evidence_id", blockers);
  const environmentById = indexed(parsed.environments, (item) => item.environmentId, "duplicate_environment_id", blockers);
  const dataClassById = indexed(parsed.dataClasses, (item) => item.dataClassId, "duplicate_data_class_id", blockers);
  const systemById = indexed(parsed.systems, (item) => item.systemId, "duplicate_system_id", blockers);
  const storeById = indexed(parsed.dataStores, (item) => item.storeId, "duplicate_data_store_id", blockers);
  const flowById = indexed(parsed.dataFlows, (item) => item.flowId, "duplicate_data_flow_id", blockers);
  const identityById = indexed(parsed.identities, (item) => item.identityId, "duplicate_identity_id", blockers);
  const vendorById = indexed(parsed.vendors, (item) => item.vendorId, "duplicate_vendor_id", blockers);
  const gapById = indexed(parsed.gaps, (item) => item.gapId, "duplicate_gap_id", blockers);
  if (!gapById.has(parsed.scopeRelationship.gapRef)) {
    blockers.push({code: `scope_relationship_gap_missing:${parsed.scopeRelationship.gapRef}`, subjectRef: null});
  }
  const knownControlIds = new Set(trustControlCatalogue.controls.map((control) => control.controlId));
  const allEntityIds = new Map<string, string>();

  if (new Date(parsed.baseline.reviewDueAt).getTime() < now.getTime()) {
    blockers.push({code: "baseline_review_overdue", subjectRef: parsed.baseline.commit});
  }

  for (const [collection, entries] of [
    ["environment", parsed.environments.map((item) => item.environmentId)],
    ["data_class", parsed.dataClasses.map((item) => item.dataClassId)],
    ["system", parsed.systems.map((item) => item.systemId)],
    ["data_store", parsed.dataStores.map((item) => item.storeId)],
    ["data_flow", parsed.dataFlows.map((item) => item.flowId)],
    ["identity", parsed.identities.map((item) => item.identityId)],
    ["vendor", parsed.vendors.map((item) => item.vendorId)],
  ] as const) {
    for (const id of entries) {
      const prior = allEntityIds.get(id);
      if (prior) blockers.push({code: `duplicate_global_id:${prior}:${collection}`, subjectRef: id});
      else allEntityIds.set(id, collection);
    }
  }

  for (const evidence of parsed.evidenceIndex) {
    const evidenceCapturedAt = new Date(evidence.capturedAt).getTime();
    const evidenceCutoff = new Date(parsed.baseline.evidenceCutoff).getTime();
    if (evidenceCapturedAt > now.getTime() || evidenceCapturedAt > evidenceCutoff) {
      blockers.push({code: "evidence_captured_after_cutoff", subjectRef: evidence.evidenceId});
    }
    if (evidence.freshness === "immutable" && !evidence.immutableFingerprint) {
      blockers.push({code: "immutable_evidence_requires_fingerprint", subjectRef: evidence.evidenceId});
    }
    if (["repository_file", "automated_test", "configuration"].includes(evidence.kind)
      && evidence.immutableFingerprint !== parsed.baseline.commit) {
      blockers.push({code: "repository_evidence_commit_mismatch", subjectRef: evidence.evidenceId});
    }
    if (evidence.freshness === "time_bound" && !evidence.validThrough) {
      blockers.push({code: "time_bound_evidence_requires_expiry", subjectRef: evidence.evidenceId});
    }
    if ((evidence.kind === "external_snapshot" || evidence.kind === "contract_record") && evidence.freshness !== "time_bound") {
      blockers.push({code: "external_evidence_must_be_time_bound", subjectRef: evidence.evidenceId});
    }
    if ((evidence.kind === "external_snapshot" || evidence.kind === "contract_record") && !evidence.contentFingerprint) {
      blockers.push({code: "external_evidence_requires_content_fingerprint", subjectRef: evidence.evidenceId});
    }
    if ((evidence.kind === "external_snapshot" || evidence.kind === "contract_record") && !evidence.collector) {
      blockers.push({code: "external_evidence_requires_collector", subjectRef: evidence.evidenceId});
    }
    if (evidence.validThrough && new Date(evidence.validThrough).getTime() <= evidenceCapturedAt) {
      blockers.push({code: "evidence_validity_window_invalid", subjectRef: evidence.evidenceId});
    }
    if (evidence.validThrough && new Date(evidence.validThrough).getTime() < now.getTime()) {
      blockers.push({code: "evidence_expired", subjectRef: evidence.evidenceId});
    }
  }

  for (const environment of parsed.environments) {
    if (!environment.classification) blockers.push({code: "environment_classification_missing", subjectRef: environment.environmentId});
    if (environment.classification === "unknown" && environment.gapRefs.length === 0) blockers.push({code: "unknown_environment_requires_gap", subjectRef: environment.environmentId});
    validateGovernedEntity(environment.environmentId, environment, evidenceById, gapById, knownControlIds, blockers);
  }
  for (const dataClass of parsed.dataClasses) {
    validateGovernedEntity(dataClass.dataClassId, dataClass, evidenceById, gapById, knownControlIds, blockers);
    validateRefs(dataClass.dataClassId, dataClass.permittedEnvironmentRefs, environmentById, "unknown_environment_ref", blockers);
  }
  for (const system of parsed.systems) {
    validateGovernedEntity(system.systemId, system, evidenceById, gapById, knownControlIds, blockers);
    validateRefs(system.systemId, system.environmentRefs, environmentById, "unknown_environment_ref", blockers);
    validateRefs(system.systemId, system.dataClassIds, dataClassById, "unknown_data_class_ref", blockers);
    validateRefs(system.systemId, system.vendorRefs, vendorById, "unknown_vendor_ref", blockers);
  }
  for (const store of parsed.dataStores) {
    validateGovernedEntity(store.storeId, store, evidenceById, gapById, knownControlIds, blockers);
    validateRefs(store.storeId, [store.systemRef], systemById, "unknown_system_ref", blockers);
    validateRefs(store.storeId, store.environmentRefs, environmentById, "unknown_environment_ref", blockers);
    validateRefs(store.storeId, store.dataClassIds, dataClassById, "unknown_data_class_ref", blockers);
  }
  for (const flow of parsed.dataFlows) {
    validateGovernedEntity(flow.flowId, flow, evidenceById, gapById, knownControlIds, blockers);
    validateRefs(flow.flowId, flow.environmentRefs, environmentById, "unknown_environment_ref", blockers);
    validateRefs(flow.flowId, flow.dataClassIds, dataClassById, "unknown_data_class_ref", blockers);
    const endpoints = new Set([...systemById.keys(), ...vendorById.keys()]);
    validateRefs(flow.flowId, [flow.sourceRef, flow.destinationRef], endpoints, "unknown_flow_endpoint", blockers);
  }
  for (const identity of parsed.identities) {
    validateGovernedEntity(identity.identityId, identity, evidenceById, gapById, knownControlIds, blockers);
    validateRefs(identity.identityId, [identity.systemRef], systemById, "unknown_system_ref", blockers);
    validateRefs(identity.identityId, identity.environmentRefs, environmentById, "unknown_environment_ref", blockers);
  }
  for (const vendor of parsed.vendors) {
    validateGovernedEntity(vendor.vendorId, vendor, evidenceById, gapById, knownControlIds, blockers);
    validateRefs(vendor.vendorId, vendor.environmentRefs, environmentById, "unknown_environment_ref", blockers);
    validateRefs(vendor.vendorId, vendor.dataClassIds, dataClassById, "unknown_data_class_ref", blockers);
    if (vendor.contractState !== "verified_current" || vendor.retentionState !== "verified_current" || vendor.regionState !== "verified_current"
      || (vendor.trainingUseState !== "prohibited_verified" && vendor.trainingUseState !== "not_applicable")) {
      if (vendor.gapRefs.length === 0) blockers.push({code: "vendor_assurance_gap_not_recorded", subjectRef: vendor.vendorId});
    }
  }
  for (const gap of parsed.gaps) {
    validateOwner(gap.gapId, gap.owner, blockers);
    validateRefs(gap.gapId, gap.targetRefs, new Set(allEntityIds.keys()), "unknown_gap_target", blockers);
    validateEvidenceRefs(gap.gapId, gap.evidenceRefs, evidenceById, blockers, true);
    validateControlRefs(gap.gapId, gap.controlIds, knownControlIds, blockers);
    if (gap.status === "resolved") warnings.push({code: "resolved_gap_should_move_to_evidence_history", subjectRef: gap.gapId});
  }

  for (const [entityId, entity] of entityEntries(parsed)) {
    for (const gapRef of entity.gapRefs) {
      const gap = gapById.get(gapRef);
      if (gap && !gap.targetRefs.includes(entityId)) blockers.push({code: `gap_target_backref_missing:${gapRef}`, subjectRef: entityId});
    }
  }
  const governedById = new Map(entityEntries(parsed));
  for (const gap of parsed.gaps) {
    for (const targetRef of gap.targetRefs) {
      const entity = governedById.get(targetRef);
      if (entity && !entity.gapRefs.includes(gap.gapId)) blockers.push({code: `entity_gap_backref_missing:${gap.gapId}`, subjectRef: targetRef});
    }
  }

  return {
    structurallyValid: blockers.length === 0,
    assuranceReady: false,
    blockers: stableIssues(blockers),
    warnings: stableIssues(warnings),
    counts: {
      environments: parsed.environments.length,
      systems: parsed.systems.length,
      dataStores: parsed.dataStores.length,
      dataFlows: parsed.dataFlows.length,
      identities: parsed.identities.length,
      vendors: parsed.vendors.length,
      openGaps: parsed.gaps.filter((gap) => gap.status === "open").length,
    },
    inventoryFingerprint: createHash("sha256").update(stableJson(parsed)).digest("hex"),
  };
}

function indexed<T>(items: T[], key: (item: T) => string, code: string, issues: SecurityInventoryIssue[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const id = key(item);
    if (result.has(id)) issues.push({code, subjectRef: id});
    else result.set(id, item);
  }
  return result;
}

function validateGovernedEntity(
  subjectRef: string,
  entity: z.infer<typeof governedEntitySchema>,
  evidenceById: Map<string, SecurityInventoryEvidence>,
  gapById: Map<string, SecurityInventoryGap>,
  knownControlIds: Set<string>,
  blockers: SecurityInventoryIssue[],
) {
  validateOwner(subjectRef, entity.owner, blockers);
  validateEvidenceRefs(subjectRef, entity.evidenceRefs, evidenceById, blockers);
  validateControlRefs(subjectRef, entity.controlIds, knownControlIds, blockers);
  validateRefs(subjectRef, entity.gapRefs, gapById, "unknown_gap_ref", blockers);
  if (entity.status !== "verified" && entity.gapRefs.length === 0) blockers.push({code: "non_verified_entity_requires_gap", subjectRef});
  if (entity.status === "verified" && entity.gapRefs.length > 0) blockers.push({code: "verified_entity_has_gap", subjectRef});
}

function validateOwner(subjectRef: string, owner: SecurityOwner, issues: SecurityInventoryIssue[]) {
  if (!owner.ownerRole || owner.assignment === "unassigned") issues.push({code: "owner_missing", subjectRef});
  if (!owner.backupOwnerRole) issues.push({code: "backup_owner_missing", subjectRef});
}

function validateEvidenceRefs(
  subjectRef: string,
  refs: string[],
  evidenceById: Map<string, SecurityInventoryEvidence>,
  issues: SecurityInventoryIssue[],
  allowDesignReferenceOnly = false,
) {
  if (refs.length === 0) issues.push({code: "evidence_missing", subjectRef});
  for (const ref of refs) if (!evidenceById.has(ref)) issues.push({code: `evidence_ref_missing:${ref}`, subjectRef});
  if (!allowDesignReferenceOnly && refs.length > 0 && refs.every((ref) => evidenceById.get(ref)?.kind === "design_reference")) {
    issues.push({code: "factual_evidence_missing", subjectRef});
  }
}

type GovernedInventoryEntity = z.infer<typeof governedEntitySchema>;

function entityEntries(inventory: SecurityCurrentStateInventory): Array<[string, GovernedInventoryEntity]> {
  return [
    ...inventory.environments.map((item): [string, GovernedInventoryEntity] => [item.environmentId, item]),
    ...inventory.dataClasses.map((item): [string, GovernedInventoryEntity] => [item.dataClassId, item]),
    ...inventory.systems.map((item): [string, GovernedInventoryEntity] => [item.systemId, item]),
    ...inventory.dataStores.map((item): [string, GovernedInventoryEntity] => [item.storeId, item]),
    ...inventory.dataFlows.map((item): [string, GovernedInventoryEntity] => [item.flowId, item]),
    ...inventory.identities.map((item): [string, GovernedInventoryEntity] => [item.identityId, item]),
    ...inventory.vendors.map((item): [string, GovernedInventoryEntity] => [item.vendorId, item]),
  ];
}

function validateControlRefs(subjectRef: string, refs: string[], knownControlIds: Set<string>, issues: SecurityInventoryIssue[]) {
  for (const ref of refs) if (!knownControlIds.has(ref)) issues.push({code: `unknown_control_ref:${ref}`, subjectRef});
}

function validateRefs<T>(subjectRef: string, refs: string[], index: Map<string, T> | Set<string>, code: string, issues: SecurityInventoryIssue[]) {
  for (const ref of refs) if (!index.has(ref)) issues.push({code: `${code}:${ref}`, subjectRef});
}

function stableIssues(issues: SecurityInventoryIssue[]): SecurityInventoryIssue[] {
  return [...new Map(issues
    .sort((left, right) => `${left.subjectRef ?? ""}:${left.code}`.localeCompare(`${right.subjectRef ?? ""}:${right.code}`))
    .map((issue) => [`${issue.subjectRef ?? ""}:${issue.code}`, issue])).values()];
}

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
