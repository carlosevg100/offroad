import {createHash} from "node:crypto";

import {
  authorityGrantSchema,
  intentContinuitySchema,
  intentFieldStateSchema,
  intentObjectKindSchema,
  primaryWorkSchema,
} from "@offroad/agent-contracts";
import {z} from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const isoInstantSchema = z.iso.datetime({offset: true});
const isoDateSchema = z.iso.date();
const identitySchema = z.string().trim().min(1).max(240);

export const contextKindSchema = z.enum([
  "organization_memory",
  "project_memory",
  "company_memory",
  "conversation_memory",
  "document",
]);
export type ContextKind = z.infer<typeof contextKindSchema>;

export const contextPermissionSchema = z.enum([
  "read_organization_context",
  "read_project_context",
  "read_company_context",
  "read_conversation_context",
  "read_document_context",
  "read_restricted_personal_context",
]);
export type ContextPermission = z.infer<typeof contextPermissionSchema>;

export const contextDataClassSchema = z.enum(["public", "project_confidential", "restricted_personal"]);
export const contextTemporalPolicySchema = z.enum(["timeless", "at_or_before", "exact_as_of"]);

const subjectRefSchema = z.object({kind: intentObjectKindSchema, id: identitySchema}).strict();

const systemContextControlPayloadSchema = z.object({
  schemaVersion: z.literal("system-context-control.v1"),
  source: z.literal("system"),
  organizationId: identitySchema,
  projectId: identitySchema.nullable(),
  conversationId: identitySchema.nullable(),
  authority: z.enum(["analysis_only", "project_write", "external_action"]),
  evidenceRegime: z.enum(["public_only", "project_private", "mixed_governed"]),
  authorityGrants: z.array(authorityGrantSchema).max(5),
  permissions: z.array(contextPermissionSchema).max(6),
  authorizedContextItemIds: z.array(identitySchema).max(2_000),
  authorizedDocumentIds: z.array(identitySchema).max(1_000),
  authorizedCompanyIds: z.array(identitySchema).max(1_000),
  executionContextHash: sha256Schema,
  revision: z.number().int().positive(),
  issuedAt: isoInstantSchema,
  expiresAt: isoInstantSchema,
}).strict().superRefine((control, context) => {
  if (Date.parse(control.expiresAt) <= Date.parse(control.issuedAt)) {
    context.addIssue({code: "custom", path: ["expiresAt"], message: "expiresAt must be after issuedAt"});
  }
  const externalGrants = control.authorityGrants.some((grant) => grant === "share" || grant === "introduce");
  if (control.authority !== "external_action" && externalGrants) {
    context.addIssue({code: "custom", path: ["authorityGrants"], message: "external grants require external_action authority"});
  }
  const writeGrants = control.authorityGrants.some((grant) => grant === "modify" || grant === "approve_internal");
  if (control.authority === "analysis_only" && writeGrants) {
    context.addIssue({code: "custom", path: ["authorityGrants"], message: "write grants require project_write or external_action authority"});
  }
});

export const systemContextControlSchema = systemContextControlPayloadSchema.extend({
  fingerprint: sha256Schema,
}).strict();
export type SystemContextControl = z.infer<typeof systemContextControlSchema>;

const contextResolutionIntentPayloadSchema = z.object({
  schemaVersion: z.literal("context-resolution-intent.v1"),
  primaryWorks: z.array(primaryWorkSchema).min(1).max(3),
  objectKinds: z.array(intentObjectKindSchema).min(1).max(18),
  objectRefs: z.array(subjectRefSchema).max(50),
  productKeys: z.array(z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,119}$/)).max(40),
  jurisdictions: z.object({
    values: z.array(z.string().regex(/^[A-Z][A-Z0-9-]{1,7}$/)).max(4),
    state: intentFieldStateSchema,
  }).strict(),
  asOfDate: z.object({value: isoDateSchema.nullable(), state: intentFieldStateSchema}).strict(),
  continuity: intentContinuitySchema,
}).strict();

export const contextResolutionIntentSchema = contextResolutionIntentPayloadSchema.extend({
  fingerprint: sha256Schema,
}).strict();
export type ContextResolutionIntent = z.infer<typeof contextResolutionIntentSchema>;

const contextCandidatePayloadSchema = z.object({
  schemaVersion: z.literal("context-candidate.v1"),
  id: identitySchema,
  logicalKey: z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,239}$/),
  kind: contextKindSchema,
  organizationId: identitySchema,
  projectId: identitySchema.nullable(),
  companyId: identitySchema.nullable(),
  conversationId: identitySchema.nullable(),
  documentId: identitySchema.nullable(),
  dataClass: contextDataClassSchema,
  payloadRef: z.string().trim().min(1).max(1_000),
  contentHash: sha256Schema,
  sourceVersion: z.string().trim().min(1).max(120),
  snapshotVersion: z.number().int().positive(),
  capturedAt: isoInstantSchema,
  validFrom: isoInstantSchema,
  validUntil: isoInstantSchema.nullable(),
  freshUntil: isoInstantSchema.nullable(),
  revokedAt: isoInstantSchema.nullable(),
  asOfDate: isoDateSchema.nullable(),
  temporalPolicy: contextTemporalPolicySchema,
  jurisdictions: z.array(z.string().regex(/^[A-Z][A-Z0-9-]{1,7}$/)).max(8),
  selectors: z.object({
    primaryWorks: z.array(primaryWorkSchema).max(9),
    objectKinds: z.array(intentObjectKindSchema).max(18),
    objectRefs: z.array(subjectRefSchema).max(100),
    productKeys: z.array(z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,119}$/)).max(80),
  }).strict(),
  supersedesId: identitySchema.nullable(),
}).strict().superRefine((item, context) => {
  const scopedProject = item.kind === "project_memory" || item.kind === "conversation_memory" || item.kind === "document";
  if (scopedProject && item.projectId === null) context.addIssue({code: "custom", path: ["projectId"], message: `${item.kind} requires projectId`});
  if (item.kind === "organization_memory" && item.projectId !== null) context.addIssue({code: "custom", path: ["projectId"], message: "organization_memory must be organization-scoped"});
  if (item.kind === "company_memory" && item.companyId === null) context.addIssue({code: "custom", path: ["companyId"], message: "company_memory requires companyId"});
  if (item.kind === "conversation_memory" && item.conversationId === null) context.addIssue({code: "custom", path: ["conversationId"], message: "conversation_memory requires conversationId"});
  if (item.kind === "document" && item.documentId === null) context.addIssue({code: "custom", path: ["documentId"], message: "document requires documentId"});
  if (item.kind !== "conversation_memory" && item.conversationId !== null) context.addIssue({code: "custom", path: ["conversationId"], message: "only conversation_memory may carry conversationId"});
  if (item.kind !== "document" && item.documentId !== null) context.addIssue({code: "custom", path: ["documentId"], message: "only document context may carry documentId"});
  if (item.dataClass !== "public" && item.projectId === null) context.addIssue({code: "custom", path: ["projectId"], message: "non-public context requires projectId"});
  if (item.temporalPolicy !== "timeless" && item.asOfDate === null) context.addIssue({code: "custom", path: ["asOfDate"], message: "dated temporal policy requires asOfDate"});
  if (item.supersedesId === item.id) context.addIssue({code: "custom", path: ["supersedesId"], message: "context cannot supersede itself"});
  if (item.validUntil !== null && Date.parse(item.validUntil) <= Date.parse(item.validFrom)) context.addIssue({code: "custom", path: ["validUntil"], message: "validUntil must be after validFrom"});
  if (item.freshUntil !== null && Date.parse(item.freshUntil) < Date.parse(item.capturedAt)) context.addIssue({code: "custom", path: ["freshUntil"], message: "freshUntil cannot precede capture"});
  const selectorCount = item.selectors.primaryWorks.length + item.selectors.objectKinds.length
    + item.selectors.objectRefs.length + item.selectors.productKeys.length;
  if (selectorCount === 0) context.addIssue({code: "custom", path: ["selectors"], message: "context requires an explicit relevance selector"});
});

export const contextCandidateSchema = contextCandidatePayloadSchema.and(z.object({fingerprint: sha256Schema}).strict());
export type ContextCandidate = z.infer<typeof contextCandidateSchema>;

export const contextExclusionReasonSchema = z.enum([
  "not_authorized",
  "permission_missing",
  "data_class_not_allowed",
  "not_yet_valid",
  "expired",
  "revoked",
  "stale",
  "irrelevant",
  "jurisdiction_unresolved",
  "wrong_jurisdiction",
  "as_of_unresolved",
  "wrong_as_of",
  "superseded",
  "conflict",
]);

export const contextBlockerCodeSchema = z.enum([
  "system_control_invalid",
  "system_control_expired",
  "intent_invalid",
  "candidate_invalid",
  "candidate_fingerprint_mismatch",
  "duplicate_candidate_identity",
  "cross_tenant_candidate",
  "cross_project_candidate",
  "cross_conversation_candidate",
  "unauthorized_context_candidate",
  "unauthorized_document_candidate",
  "unauthorized_company_candidate",
  "lineage_cycle",
  "lineage_scope_mismatch",
  "lineage_version_invalid",
]);

export const contextGapCodeSchema = z.enum([
  "context_permission_required",
  "current_context_required",
  "jurisdiction_required",
  "context_jurisdiction_mismatch",
  "as_of_date_required",
  "context_as_of_mismatch",
  "context_conflict",
]);

const includedContextSchema = z.object({
  itemId: identitySchema,
  logicalKey: z.string().min(1),
  kind: contextKindSchema,
  payloadRef: z.string().min(1),
  contentHash: sha256Schema,
  sourceVersion: z.string().min(1),
  snapshotVersion: z.number().int().positive(),
  snapshotFingerprint: sha256Schema,
  inclusionReasons: z.array(z.enum([
    "primary_work_match", "object_kind_match", "object_identity_match", "product_match",
  ])).min(1),
}).strict();

const excludedContextSchema = z.object({
  itemId: identitySchema,
  logicalKey: z.string().min(1),
  reason: contextExclusionReasonSchema,
}).strict();

const contextGapSchema = z.object({
  code: contextGapCodeSchema,
  logicalKey: z.string().min(1).nullable(),
  sourceItemIds: z.array(identitySchema),
  handling: z.enum(["ask_if_material", "refresh_source", "obtain_system_authorization"]),
}).strict();

const contextBlockerSchema = z.object({
  code: contextBlockerCodeSchema,
  itemIds: z.array(identitySchema),
}).strict();

const contextResolutionPayloadSchema = z.object({
  schemaVersion: z.literal("authorized-context-resolution.v1"),
  mode: z.literal("internal_shadow"),
  status: z.enum(["empty", "resolved", "needs_context", "blocked"]),
  systemControlFingerprint: sha256Schema,
  executionContextHash: sha256Schema,
  intentFingerprint: sha256Schema,
  included: z.array(includedContextSchema),
  excluded: z.array(excludedContextSchema),
  gaps: z.array(contextGapSchema),
  blockers: z.array(contextBlockerSchema),
  resolvedAt: isoInstantSchema,
  externalEffectAllowed: z.literal(false),
}).strict();

export const authorizedContextResolutionSchema = contextResolutionPayloadSchema.extend({
  fingerprint: sha256Schema,
}).strict();
export type AuthorizedContextResolution = z.infer<typeof authorizedContextResolutionSchema>;

export function createSystemContextControl(input: z.input<typeof systemContextControlPayloadSchema>): SystemContextControl {
  const payload = normalizeSystemControl(systemContextControlPayloadSchema.parse(input));
  return systemContextControlSchema.parse({...payload, fingerprint: fingerprint(payload)});
}

export function createContextResolutionIntent(input: z.input<typeof contextResolutionIntentPayloadSchema>): ContextResolutionIntent {
  const payload = normalizeIntent(contextResolutionIntentPayloadSchema.parse(input));
  return contextResolutionIntentSchema.parse({...payload, fingerprint: fingerprint(payload)});
}

export function createContextCandidate(input: z.input<typeof contextCandidatePayloadSchema>): ContextCandidate {
  const payload = normalizeCandidate(contextCandidatePayloadSchema.parse(input));
  return contextCandidateSchema.parse({...payload, fingerprint: fingerprint(payload)});
}

/**
 * Resolves metadata references only. Payload bytes are never loaded here. System authority,
 * evidence regime and permissions arrive in one fingerprinted control-plane snapshot; memories
 * cannot add or broaden them. Empty context is a successful, ordinary outcome.
 */
export function resolveAuthorizedContext(input: {
  systemControl: unknown;
  intent: unknown;
  candidates: readonly unknown[];
  now: Date;
}): AuthorizedContextResolution {
  const controlResult = systemContextControlSchema.safeParse(input.systemControl);
  const intentResult = contextResolutionIntentSchema.safeParse(input.intent);
  const baseControl = controlResult.success ? normalizeSystemControl(controlResult.data) : null;
  const baseIntent = intentResult.success ? normalizeIntent(intentResult.data) : null;
  const blockers: Array<z.infer<typeof contextBlockerSchema>> = [];
  if (!controlResult.success || !baseControl || fingerprint(stripFingerprint(controlResult.data)) !== controlResult.data.fingerprint) {
    blockers.push({code: "system_control_invalid", itemIds: []});
  } else if (Date.parse(baseControl.issuedAt) > input.now.getTime() || Date.parse(baseControl.expiresAt) <= input.now.getTime()) {
    blockers.push({code: "system_control_expired", itemIds: []});
  }
  if (!intentResult.success || !baseIntent || fingerprint(stripFingerprint(intentResult.data)) !== intentResult.data.fingerprint) {
    blockers.push({code: "intent_invalid", itemIds: []});
  }
  if (!baseControl || !baseIntent || blockers.length > 0) {
    return finalizeResolution({
      status: "blocked", control: baseControl, intent: baseIntent, included: [], excluded: [], gaps: [], blockers,
      resolvedAt: input.now.toISOString(),
    });
  }

  const parsed: ContextCandidate[] = [];
  const idFingerprints = new Map<string, string>();
  for (const raw of input.candidates) {
    const result = contextCandidateSchema.safeParse(raw);
    if (!result.success) {
      blockers.push({code: "candidate_invalid", itemIds: []});
      continue;
    }
    const item = normalizeCandidate(result.data);
    if (fingerprint(stripFingerprint(result.data)) !== result.data.fingerprint) {
      blockers.push({code: "candidate_fingerprint_mismatch", itemIds: []});
      continue;
    }
    const prior = idFingerprints.get(item.id);
    if (prior) {
      if (prior !== item.fingerprint) blockers.push({code: "duplicate_candidate_identity", itemIds: []});
      continue;
    }
    idFingerprints.set(item.id, item.fingerprint);
    parsed.push(item);
  }

  for (const item of parsed) validateScope(item, baseControl, blockers);
  validateLineage(parsed, blockers);
  if (blockers.length > 0) {
    return finalizeResolution({status: "blocked", control: baseControl, intent: baseIntent, included: [], excluded: [], gaps: [], blockers, resolvedAt: input.now.toISOString()});
  }

  const included: Array<z.infer<typeof includedContextSchema>> = [];
  const excluded: Array<z.infer<typeof excludedContextSchema>> = [];
  const gaps: Array<z.infer<typeof contextGapSchema>> = [];
  const eligibleByKey = new Map<string, Array<{item: ContextCandidate; reasons: z.infer<typeof includedContextSchema>["inclusionReasons"]}>>();

  for (const item of parsed.sort(candidateOrder)) {
    const reasons = relevanceReasons(item, baseIntent);
    const evaluation = evaluateCandidate(item, baseControl, baseIntent, input.now, reasons.length > 0);
    if (evaluation.reason) excluded.push({itemId: item.id, logicalKey: item.logicalKey, reason: evaluation.reason});
    if (evaluation.gap) gaps.push({code: evaluation.gap, logicalKey: item.logicalKey, sourceItemIds: [item.id], handling: gapHandling(evaluation.gap)});
    if (!evaluation.reason && reasons.length > 0) {
      const values = eligibleByKey.get(item.logicalKey) ?? [];
      values.push({item, reasons});
      eligibleByKey.set(item.logicalKey, values);
    }
  }

  for (const [logicalKey, group] of [...eligibleByKey.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const ids = new Set(group.map(({item}) => item.id));
    const supersededIds = new Set(group.map(({item}) => item.supersedesId).filter((id): id is string => id !== null && ids.has(id)));
    const heads = group.filter(({item}) => !supersededIds.has(item.id));
    if (heads.length !== 1) {
      const sourceItemIds = heads.map(({item}) => item.id).sort();
      gaps.push({code: "context_conflict", logicalKey, sourceItemIds, handling: "ask_if_material"});
      for (const {item} of group) excluded.push({itemId: item.id, logicalKey, reason: "conflict"});
      continue;
    }
    const selected = heads[0]!;
    included.push({
      itemId: selected.item.id,
      logicalKey,
      kind: selected.item.kind,
      payloadRef: selected.item.payloadRef,
      contentHash: selected.item.contentHash,
      sourceVersion: selected.item.sourceVersion,
      snapshotVersion: selected.item.snapshotVersion,
      snapshotFingerprint: selected.item.fingerprint,
      inclusionReasons: selected.reasons,
    });
    for (const {item} of group) {
      if (item.id !== selected.item.id) excluded.push({itemId: item.id, logicalKey, reason: "superseded"});
    }
  }

  const uniqueGaps = dedupeGaps(gaps);
  return finalizeResolution({
    status: uniqueGaps.length > 0 ? "needs_context" : included.length > 0 ? "resolved" : "empty",
    control: baseControl,
    intent: baseIntent,
    included: included.sort((left, right) => left.logicalKey.localeCompare(right.logicalKey) || left.itemId.localeCompare(right.itemId)),
    excluded: dedupeExcluded(excluded),
    gaps: uniqueGaps,
    blockers: [],
    resolvedAt: input.now.toISOString(),
  });
}

export function verifyAuthorizedContextResolution(raw: unknown): AuthorizedContextResolution {
  const resolution = authorizedContextResolutionSchema.parse(raw);
  if (fingerprint(stripFingerprint(resolution)) !== resolution.fingerprint) throw new Error("context_resolution_fingerprint_mismatch");
  return resolution;
}

function evaluateCandidate(
  item: ContextCandidate,
  control: SystemContextControl,
  intent: ContextResolutionIntent,
  now: Date,
  materiallyRelevant: boolean,
): {reason: z.infer<typeof contextExclusionReasonSchema> | null; gap: z.infer<typeof contextGapCodeSchema> | null} {
  if (!control.authorizedContextItemIds.includes(item.id)) return {reason: "not_authorized", gap: null};
  if (!control.permissions.includes(permissionFor(item.kind))) return {reason: "permission_missing", gap: materiallyRelevant ? "context_permission_required" : null};
  if (!dataClassAllowed(item, control)) return {reason: "data_class_not_allowed", gap: materiallyRelevant ? "context_permission_required" : null};
  const nowMs = now.getTime();
  if (Date.parse(item.validFrom) > nowMs) return {reason: "not_yet_valid", gap: materiallyRelevant ? "current_context_required" : null};
  if (item.validUntil !== null && Date.parse(item.validUntil) <= nowMs) return {reason: "expired", gap: materiallyRelevant ? "current_context_required" : null};
  if (item.revokedAt !== null && Date.parse(item.revokedAt) <= nowMs) return {reason: "revoked", gap: materiallyRelevant ? "current_context_required" : null};
  if (item.freshUntil !== null && Date.parse(item.freshUntil) < nowMs) return {reason: "stale", gap: materiallyRelevant ? "current_context_required" : null};
  if (!materiallyRelevant) return {reason: "irrelevant", gap: null};

  if (item.jurisdictions.length > 0) {
    if (!confirmedState(intent.jurisdictions.state) || intent.jurisdictions.values.length === 0) {
      return {reason: "jurisdiction_unresolved", gap: "jurisdiction_required"};
    }
    if (!item.jurisdictions.some((value) => intent.jurisdictions.values.includes(value))) {
      return {reason: "wrong_jurisdiction", gap: "context_jurisdiction_mismatch"};
    }
  }
  if (item.temporalPolicy !== "timeless") {
    if (!confirmedState(intent.asOfDate.state) || intent.asOfDate.value === null) {
      return {reason: "as_of_unresolved", gap: "as_of_date_required"};
    }
    if (item.temporalPolicy === "exact_as_of" && item.asOfDate !== intent.asOfDate.value) {
      return {reason: "wrong_as_of", gap: "context_as_of_mismatch"};
    }
    if (item.temporalPolicy === "at_or_before" && item.asOfDate! > intent.asOfDate.value) {
      return {reason: "wrong_as_of", gap: "context_as_of_mismatch"};
    }
  }
  return {reason: null, gap: null};
}

function confirmedState(state: z.infer<typeof intentFieldStateSchema>): boolean {
  return state === "explicit" || state === "reused_confirmed" || state === "system";
}

function gapHandling(code: z.infer<typeof contextGapCodeSchema>): z.infer<typeof contextGapSchema>["handling"] {
  if (code === "context_permission_required") return "obtain_system_authorization";
  if (code === "current_context_required") return "refresh_source";
  return "ask_if_material";
}

function relevanceReasons(item: ContextCandidate, intent: ContextResolutionIntent): z.infer<typeof includedContextSchema>["inclusionReasons"] {
  const reasons: z.infer<typeof includedContextSchema>["inclusionReasons"] = [];
  if (item.selectors.primaryWorks.some((value) => intent.primaryWorks.includes(value))) reasons.push("primary_work_match");
  if (item.selectors.objectKinds.some((value) => intent.objectKinds.includes(value))) reasons.push("object_kind_match");
  const refs = new Set(intent.objectRefs.map((value) => `${value.kind}:${value.id}`));
  if (item.selectors.objectRefs.some((value) => refs.has(`${value.kind}:${value.id}`))) reasons.push("object_identity_match");
  if (item.selectors.productKeys.some((value) => intent.productKeys.includes(value))) reasons.push("product_match");
  return reasons;
}

function validateScope(item: ContextCandidate, control: SystemContextControl, blockers: Array<z.infer<typeof contextBlockerSchema>>): void {
  // A refusal never reflects a foreign or unauthorized identifier into its result. The store-side
  // audit can correlate the candidate fingerprint; downstream/customer surfaces receive only the
  // blocker class.
  if (item.organizationId !== control.organizationId) blockers.push({code: "cross_tenant_candidate", itemIds: []});
  if (item.projectId !== null && item.projectId !== control.projectId) blockers.push({code: "cross_project_candidate", itemIds: []});
  if (item.kind === "conversation_memory" && item.conversationId !== control.conversationId) blockers.push({code: "cross_conversation_candidate", itemIds: []});
  if (!control.authorizedContextItemIds.includes(item.id)) blockers.push({code: "unauthorized_context_candidate", itemIds: []});
  if (item.kind === "document" && (item.documentId === null || !control.authorizedDocumentIds.includes(item.documentId))) blockers.push({code: "unauthorized_document_candidate", itemIds: []});
  if (item.kind === "company_memory" && (item.companyId === null || !control.authorizedCompanyIds.includes(item.companyId))) blockers.push({code: "unauthorized_company_candidate", itemIds: []});
}

function validateLineage(items: ContextCandidate[], blockers: Array<z.infer<typeof contextBlockerSchema>>): void {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    if (item.supersedesId === null) continue;
    const parent = byId.get(item.supersedesId);
    if (parent && (parent.logicalKey !== item.logicalKey || parent.organizationId !== item.organizationId || parent.projectId !== item.projectId)) {
      blockers.push({code: "lineage_scope_mismatch", itemIds: [item.id, parent.id].sort()});
    }
    if (parent && (item.snapshotVersion <= parent.snapshotVersion || Date.parse(item.capturedAt) < Date.parse(parent.capturedAt))) {
      blockers.push({code: "lineage_version_invalid", itemIds: [item.id, parent.id].sort()});
    }
    const seen = new Set([item.id]);
    let cursor: ContextCandidate | undefined = item;
    while (cursor?.supersedesId) {
      if (seen.has(cursor.supersedesId)) {
        blockers.push({code: "lineage_cycle", itemIds: [...seen].sort()});
        break;
      }
      seen.add(cursor.supersedesId);
      cursor = byId.get(cursor.supersedesId);
    }
  }
}

function permissionFor(kind: ContextKind): ContextPermission {
  return {
    organization_memory: "read_organization_context",
    project_memory: "read_project_context",
    company_memory: "read_company_context",
    conversation_memory: "read_conversation_context",
    document: "read_document_context",
  }[kind] as ContextPermission;
}

function dataClassAllowed(item: ContextCandidate, control: SystemContextControl): boolean {
  if (item.dataClass === "public") return true;
  if (item.dataClass === "restricted_personal") return control.permissions.includes("read_restricted_personal_context")
    && control.evidenceRegime !== "public_only";
  return control.evidenceRegime === "project_private" || control.evidenceRegime === "mixed_governed";
}

function normalizeSystemControl<T extends z.infer<typeof systemContextControlPayloadSchema> | SystemContextControl>(value: T): T {
  return {...value,
    authorityGrants: [...new Set(value.authorityGrants)].sort(),
    permissions: [...new Set(value.permissions)].sort(),
    authorizedContextItemIds: [...new Set(value.authorizedContextItemIds)].sort(),
    authorizedDocumentIds: [...new Set(value.authorizedDocumentIds)].sort(),
    authorizedCompanyIds: [...new Set(value.authorizedCompanyIds)].sort(),
  } as T;
}

function normalizeIntent<T extends z.infer<typeof contextResolutionIntentPayloadSchema> | ContextResolutionIntent>(value: T): T {
  return {...value,
    primaryWorks: [...new Set(value.primaryWorks)].sort(),
    objectKinds: [...new Set(value.objectKinds)].sort(),
    objectRefs: [...value.objectRefs].sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`)),
    productKeys: [...new Set(value.productKeys)].sort(),
    jurisdictions: {...value.jurisdictions, values: [...new Set(value.jurisdictions.values)].sort()},
  } as T;
}

function normalizeCandidate<T extends z.infer<typeof contextCandidatePayloadSchema> | ContextCandidate>(value: T): T {
  return {...value,
    jurisdictions: [...new Set(value.jurisdictions)].sort(),
    selectors: {
      primaryWorks: [...new Set(value.selectors.primaryWorks)].sort(),
      objectKinds: [...new Set(value.selectors.objectKinds)].sort(),
      objectRefs: [...value.selectors.objectRefs].sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`)),
      productKeys: [...new Set(value.selectors.productKeys)].sort(),
    },
  } as T;
}

function finalizeResolution(input: {
  status: AuthorizedContextResolution["status"];
  control: SystemContextControl | null;
  intent: ContextResolutionIntent | null;
  included: AuthorizedContextResolution["included"];
  excluded: AuthorizedContextResolution["excluded"];
  gaps: AuthorizedContextResolution["gaps"];
  blockers: AuthorizedContextResolution["blockers"];
  resolvedAt: string;
}): AuthorizedContextResolution {
  const payload = contextResolutionPayloadSchema.parse({
    schemaVersion: "authorized-context-resolution.v1",
    mode: "internal_shadow",
    status: input.status,
    systemControlFingerprint: input.control?.fingerprint ?? "0".repeat(64),
    executionContextHash: input.control?.executionContextHash ?? "0".repeat(64),
    intentFingerprint: input.intent?.fingerprint ?? "0".repeat(64),
    included: input.included,
    excluded: input.excluded,
    gaps: input.gaps,
    blockers: dedupeBlockers(input.blockers),
    resolvedAt: input.resolvedAt,
    externalEffectAllowed: false,
  });
  return authorizedContextResolutionSchema.parse({...payload, fingerprint: fingerprint(payload)});
}

function dedupeExcluded(values: AuthorizedContextResolution["excluded"]): AuthorizedContextResolution["excluded"] {
  return [...new Map(values
    .sort((left, right) => left.itemId.localeCompare(right.itemId) || left.reason.localeCompare(right.reason))
    .map((value) => [`${value.itemId}:${value.reason}`, value])).values()];
}

function dedupeGaps(values: AuthorizedContextResolution["gaps"]): AuthorizedContextResolution["gaps"] {
  return [...new Map(values.map((value) => ({...value, sourceItemIds: [...new Set(value.sourceItemIds)].sort()}))
    .sort((left, right) => left.code.localeCompare(right.code) || (left.logicalKey ?? "").localeCompare(right.logicalKey ?? ""))
    .map((value) => [`${value.code}:${value.logicalKey ?? ""}`, value])).values()];
}

function dedupeBlockers(values: AuthorizedContextResolution["blockers"]): AuthorizedContextResolution["blockers"] {
  return [...new Map(values.map((value) => ({...value, itemIds: [...new Set(value.itemIds)].sort()}))
    .sort((left, right) => left.code.localeCompare(right.code) || left.itemIds.join(":").localeCompare(right.itemIds.join(":")))
    .map((value) => [`${value.code}:${value.itemIds.join(":")}`, value])).values()];
}

function candidateOrder(left: ContextCandidate, right: ContextCandidate): number {
  return left.logicalKey.localeCompare(right.logicalKey) || left.snapshotVersion - right.snapshotVersion || left.id.localeCompare(right.id);
}

function stripFingerprint(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const {fingerprint: _fingerprint, ...rest} = value as Record<string, unknown>;
  return rest;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
