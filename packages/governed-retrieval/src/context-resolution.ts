import {createHash, createHmac, timingSafeEqual} from "node:crypto";

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
const contextLocatorIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,239}$/);

export const contextPayloadLocatorSchema = z.object({
  scheme: z.enum(["context_snapshot", "document_snapshot"]),
  locatorId: contextLocatorIdSchema,
}).strict();
export type ContextPayloadLocator = z.infer<typeof contextPayloadLocatorSchema>;

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
const authorizedContextSnapshotSchema = z.object({itemId: identitySchema, snapshotFingerprint: sha256Schema}).strict();

const verifiedIssuerSchema = z.object({
  issuerId: identitySchema,
  keyId: identitySchema,
  algorithm: z.literal("hmac-sha256"),
}).strict();

export const contextIssuerTrustSchema = verifiedIssuerSchema.extend({
  secret: z.string().min(16),
  validFrom: isoInstantSchema,
  validUntil: isoInstantSchema.nullable(),
  revokedAt: isoInstantSchema.nullable(),
}).strict().superRefine((trust, context) => {
  if (trust.validUntil !== null && Date.parse(trust.validUntil) <= Date.parse(trust.validFrom)) {
    context.addIssue({code: "custom", path: ["validUntil"], message: "issuer trust validity must increase"});
  }
});
export type ContextIssuerTrust = z.infer<typeof contextIssuerTrustSchema>;

const systemContextControlBaseSchema = z.object({
  schemaVersion: z.literal("system-context-control.v2"),
  source: z.literal("system"),
  organizationId: identitySchema,
  projectId: identitySchema.nullable(),
  conversationId: identitySchema.nullable(),
  authority: z.enum(["analysis_only", "project_write", "external_action"]),
  evidenceRegime: z.enum(["public_only", "project_private", "mixed_governed"]),
  authorityGrants: z.array(authorityGrantSchema).max(5),
  permissions: z.array(contextPermissionSchema).max(6),
  authorizedContextSnapshots: z.array(authorizedContextSnapshotSchema).max(2_000),
  candidateSetFingerprint: sha256Schema,
  authorizedDocumentIds: z.array(identitySchema).max(1_000),
  authorizedCompanyIds: z.array(identitySchema).max(1_000),
  executionContextHash: sha256Schema,
  revision: z.number().int().positive(),
  issuedAt: isoInstantSchema,
  expiresAt: isoInstantSchema,
  issuer: verifiedIssuerSchema,
}).strict();

const systemContextControlPayloadSchema = systemContextControlBaseSchema.superRefine((control, context) => {
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
  if (new Set(control.authorizedContextSnapshots.map(({itemId}) => itemId)).size !== control.authorizedContextSnapshots.length) {
    context.addIssue({code: "custom", path: ["authorizedContextSnapshots"], message: "context snapshot grants require unique item identities"});
  }
});

export const systemContextControlSchema = systemContextControlPayloadSchema.extend({
  fingerprint: sha256Schema,
  signature: sha256Schema,
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
  controlRevision: z.number().int().positive(),
  projectId: identitySchema.nullable(),
  companyId: identitySchema.nullable(),
  conversationId: identitySchema.nullable(),
  documentId: identitySchema.nullable(),
  dataClass: contextDataClassSchema,
  payloadLocator: contextPayloadLocatorSchema,
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
  if (item.kind === "organization_memory" && item.companyId !== null) context.addIssue({code: "custom", path: ["companyId"], message: "organization_memory cannot carry company scope"});
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
  if (item.companyId !== null) {
    const companyRefs = item.selectors.objectRefs.filter((ref) => ref.kind === "company");
    if (!companyRefs.some((ref) => ref.id === item.companyId) || companyRefs.some((ref) => ref.id !== item.companyId)) {
      context.addIssue({code: "custom", path: ["selectors", "objectRefs"], message: "company-scoped context requires exactly coherent company selectors"});
    }
  } else if (item.selectors.objectRefs.some((ref) => ref.kind === "company")) {
    context.addIssue({code: "custom", path: ["selectors", "objectRefs"], message: "non-company-scoped context cannot carry company selectors"});
  }
  if (item.kind === "document" && item.payloadLocator.scheme !== "document_snapshot") {
    context.addIssue({code: "custom", path: ["payloadLocator", "scheme"], message: "document context requires document_snapshot locator"});
  }
  if (item.kind !== "document" && item.payloadLocator.scheme !== "context_snapshot") {
    context.addIssue({code: "custom", path: ["payloadLocator", "scheme"], message: "memory context requires context_snapshot locator"});
  }
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
  "company_target_unresolved",
  "wrong_company",
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
  "control_snapshot_mismatch",
  "control_candidate_set_mismatch",
  "lineage_cycle",
  "lineage_parent_missing",
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
  "company_target_required",
  "context_company_mismatch",
]);

const includedContextSchema = z.object({
  itemId: identitySchema,
  logicalKey: z.string().min(1),
  kind: contextKindSchema,
  payloadLocator: contextPayloadLocatorSchema,
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
  schemaVersion: z.literal("authorized-context-resolution.v2"),
  mode: z.literal("internal_shadow"),
  status: z.enum(["empty", "resolved", "needs_context", "blocked"]),
  systemControlFingerprint: sha256Schema,
  executionContextHash: sha256Schema,
  intentFingerprint: sha256Schema,
  controlRevision: z.number().int().positive(),
  controlIssuer: verifiedIssuerSchema,
  included: z.array(includedContextSchema),
  excluded: z.array(excludedContextSchema),
  gaps: z.array(contextGapSchema),
  blockers: z.array(contextBlockerSchema),
  resolvedAt: isoInstantSchema,
  validUntil: isoInstantSchema,
  issuer: verifiedIssuerSchema,
  externalEffectAllowed: z.literal(false),
}).strict();

export const authorizedContextResolutionSchema = contextResolutionPayloadSchema.extend({
  fingerprint: sha256Schema,
  signature: sha256Schema,
}).strict();
export type AuthorizedContextResolution = z.infer<typeof authorizedContextResolutionSchema>;

const systemContextControlIssuanceSchema = systemContextControlBaseSchema.omit({candidateSetFingerprint: true});

export function issueSystemContextControl(input: z.input<typeof systemContextControlIssuanceSchema>, secret: string): SystemContextControl {
  const issuance = systemContextControlIssuanceSchema.parse(input);
  const payload = normalizeSystemControl(systemContextControlPayloadSchema.parse({
    ...issuance,
    candidateSetFingerprint: fingerprint(normalizeSnapshotGrants(issuance.authorizedContextSnapshots)),
  }));
  const fingerprintValue = fingerprint(payload);
  return systemContextControlSchema.parse({...payload, fingerprint: fingerprintValue, signature: sign({fingerprint: fingerprintValue, issuer: payload.issuer}, secret)});
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
  systemControlTrust: readonly ContextIssuerTrust[];
  intent: unknown;
  candidates: readonly unknown[];
  now: Date;
  resolutionIssuer: z.input<typeof verifiedIssuerSchema> & {secret: string};
}): AuthorizedContextResolution {
  assertValidDate(input.now);
  const controlResult = systemContextControlSchema.safeParse(input.systemControl);
  const intentResult = contextResolutionIntentSchema.safeParse(input.intent);
  const baseControl = controlResult.success ? normalizeSystemControl(controlResult.data) : null;
  const baseIntent = intentResult.success ? normalizeIntent(intentResult.data) : null;
  const blockers: Array<z.infer<typeof contextBlockerSchema>> = [];
  if (!controlResult.success || !baseControl || !verifySystemControl(baseControl, input.systemControlTrust, input.now)) {
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
      resolvedAt: input.now.toISOString(), validUntil: new Date(input.now.getTime() + 1).toISOString(), resolutionIssuer: input.resolutionIssuer,
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
  const actualCandidateSet = normalizeSnapshotGrants(parsed.map(({id, fingerprint: snapshotFingerprint}) => ({itemId: id, snapshotFingerprint})));
  if (fingerprint(actualCandidateSet) !== baseControl.candidateSetFingerprint) {
    blockers.push({code: "control_candidate_set_mismatch", itemIds: []});
  }
  if (blockers.length > 0) {
    return finalizeResolution({status: "blocked", control: baseControl, intent: baseIntent, included: [], excluded: [], gaps: [], blockers, resolvedAt: input.now.toISOString(), validUntil: baseControl.expiresAt, resolutionIssuer: input.resolutionIssuer});
  }
  validateLineage(parsed, blockers);
  if (blockers.length > 0) {
    return finalizeResolution({status: "blocked", control: baseControl, intent: baseIntent, included: [], excluded: [], gaps: [], blockers, resolvedAt: input.now.toISOString(), validUntil: baseControl.expiresAt, resolutionIssuer: input.resolutionIssuer});
  }

  const included: Array<z.infer<typeof includedContextSchema>> = [];
  const excluded: Array<z.infer<typeof excludedContextSchema>> = [];
  const gaps: Array<z.infer<typeof contextGapSchema>> = [];
  const groups = new Map<string, ContextCandidate[]>();
  for (const item of parsed.sort(candidateOrder)) groups.set(item.logicalKey, [...(groups.get(item.logicalKey) ?? []), item]);
  const selectedHeads: ContextCandidate[] = [];
  for (const [logicalKey, group] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const ids = new Set(group.map((item) => item.id));
    const supersededIds = new Set(group.map((item) => item.supersedesId).filter((id): id is string => id !== null && ids.has(id)));
    const heads = group.filter((item) => !supersededIds.has(item.id));
    if (heads.length !== 1) {
      const sourceItemIds = heads.map((item) => item.id).sort();
      gaps.push({code: "context_conflict", logicalKey, sourceItemIds, handling: "ask_if_material"});
      for (const item of group) excluded.push({itemId: item.id, logicalKey, reason: "conflict"});
      continue;
    }
    const head = heads[0]!;
    selectedHeads.push(head);
    for (const item of group) if (item.id !== head.id) excluded.push({itemId: item.id, logicalKey, reason: "superseded"});
  }

  for (const item of selectedHeads) {
    const reasons = relevanceReasons(item, baseIntent);
    const evaluation = evaluateCandidate(item, baseControl, baseIntent, input.now, reasons.length > 0);
    if (evaluation.reason) excluded.push({itemId: item.id, logicalKey: item.logicalKey, reason: evaluation.reason});
    if (evaluation.gap) gaps.push({code: evaluation.gap, logicalKey: item.logicalKey, sourceItemIds: [item.id], handling: gapHandling(evaluation.gap)});
    if (!evaluation.reason && reasons.length > 0) {
      included.push({
        itemId: item.id, logicalKey: item.logicalKey, kind: item.kind, payloadLocator: item.payloadLocator,
        contentHash: item.contentHash, sourceVersion: item.sourceVersion, snapshotVersion: item.snapshotVersion,
        snapshotFingerprint: item.fingerprint, inclusionReasons: reasons,
      });
    }
  }

  const uniqueGaps = dedupeGaps(gaps);
  const includedIds = new Set(included.map((entry) => entry.itemId));
  const validityCutoffs = [baseControl.expiresAt, ...selectedHeads
    .filter((item) => includedIds.has(item.id))
    .flatMap((item) => [item.validUntil, item.freshUntil, item.revokedAt].filter((value): value is string => value !== null))];
  const validUntil = validityCutoffs.reduce((earliest, value) => Date.parse(value) < Date.parse(earliest) ? value : earliest);
  return finalizeResolution({
    status: uniqueGaps.length > 0 ? "needs_context" : included.length > 0 ? "resolved" : "empty",
    control: baseControl,
    intent: baseIntent,
    included: included.sort((left, right) => left.logicalKey.localeCompare(right.logicalKey) || left.itemId.localeCompare(right.itemId)),
    excluded: dedupeExcluded(excluded),
    gaps: uniqueGaps,
    blockers: [],
    resolvedAt: input.now.toISOString(), validUntil, resolutionIssuer: input.resolutionIssuer,
  });
}

export function verifyAuthorizedContextResolution(raw: unknown, trust: readonly ContextIssuerTrust[], now: Date): AuthorizedContextResolution {
  assertValidDate(now);
  const resolution = authorizedContextResolutionSchema.parse(raw);
  const payload = stripSignatureAndFingerprint(resolution);
  if (fingerprint(payload) !== resolution.fingerprint) throw new Error("context_resolution_fingerprint_mismatch");
  const trustedIssuer = findActiveIssuerTrust(resolution.issuer, trust, resolution.resolvedAt, now);
  if (!trustedIssuer || !safeSignatureEqual(resolution.signature, sign({fingerprint: resolution.fingerprint, issuer: resolution.issuer}, trustedIssuer.secret))) {
    throw new Error("context_resolution_signature_invalid");
  }
  if (Date.parse(resolution.validUntil) <= now.getTime()) throw new Error("context_resolution_expired");
  return resolution;
}

function evaluateCandidate(
  item: ContextCandidate,
  control: SystemContextControl,
  intent: ContextResolutionIntent,
  now: Date,
  materiallyRelevant: boolean,
): {reason: z.infer<typeof contextExclusionReasonSchema> | null; gap: z.infer<typeof contextGapCodeSchema> | null} {
  if (!control.authorizedContextSnapshots.some(({itemId, snapshotFingerprint}) => itemId === item.id && snapshotFingerprint === item.fingerprint)) {
    return {reason: "not_authorized", gap: null};
  }
  if (!control.permissions.includes(permissionFor(item.kind))) return {reason: "permission_missing", gap: materiallyRelevant ? "context_permission_required" : null};
  if (!dataClassAllowed(item, control)) return {reason: "data_class_not_allowed", gap: materiallyRelevant ? "context_permission_required" : null};
  const nowMs = now.getTime();
  if (Date.parse(item.validFrom) > nowMs) return {reason: "not_yet_valid", gap: materiallyRelevant ? "current_context_required" : null};
  if (item.validUntil !== null && Date.parse(item.validUntil) <= nowMs) return {reason: "expired", gap: materiallyRelevant ? "current_context_required" : null};
  if (item.revokedAt !== null && Date.parse(item.revokedAt) <= nowMs) return {reason: "revoked", gap: materiallyRelevant ? "current_context_required" : null};
  if (item.freshUntil !== null && Date.parse(item.freshUntil) <= nowMs) return {reason: "stale", gap: materiallyRelevant ? "current_context_required" : null};
  if (item.companyId !== null) {
    const companyTargets = intent.objectRefs.filter((ref) => ref.kind === "company").map((ref) => ref.id);
    if (companyTargets.length === 0) return {reason: "company_target_unresolved", gap: "company_target_required"};
    if (!companyTargets.includes(item.companyId)) return {reason: "wrong_company", gap: materiallyRelevant ? "context_company_mismatch" : null};
  }
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
  // A company ref is a mandatory scope gate, not by itself proof that every memory about that
  // company is relevant. Other exact object identities (operation, document, instrument, etc.)
  // remain affirmative relevance signals.
  if (item.selectors.objectRefs.some((value) => value.kind !== "company" && refs.has(`${value.kind}:${value.id}`))) reasons.push("object_identity_match");
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
  const snapshotGrant = control.authorizedContextSnapshots.find(({itemId}) => itemId === item.id);
  if (!snapshotGrant) blockers.push({code: "unauthorized_context_candidate", itemIds: []});
  else if (snapshotGrant.snapshotFingerprint !== item.fingerprint) blockers.push({code: "control_snapshot_mismatch", itemIds: []});
  if (item.kind === "document" && (item.documentId === null || !control.authorizedDocumentIds.includes(item.documentId))) blockers.push({code: "unauthorized_document_candidate", itemIds: []});
  if (item.companyId !== null && !control.authorizedCompanyIds.includes(item.companyId)) blockers.push({code: "unauthorized_company_candidate", itemIds: []});
  if (item.controlRevision !== control.revision || Date.parse(item.capturedAt) > Date.parse(control.issuedAt)) {
    blockers.push({code: "control_snapshot_mismatch", itemIds: []});
  }
}

function validateLineage(items: ContextCandidate[], blockers: Array<z.infer<typeof contextBlockerSchema>>): void {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    if (item.supersedesId === null) continue;
    const parent = byId.get(item.supersedesId);
    if (!parent) blockers.push({code: "lineage_parent_missing", itemIds: [item.id]});
    if (parent && !sameImmutableLineageScope(parent, item)) {
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

function sameImmutableLineageScope(left: ContextCandidate, right: ContextCandidate): boolean {
  return left.logicalKey === right.logicalKey
    && left.kind === right.kind
    && left.organizationId === right.organizationId
    && left.controlRevision === right.controlRevision
    && left.projectId === right.projectId
    && left.companyId === right.companyId
    && left.conversationId === right.conversationId
    && left.documentId === right.documentId
    && left.dataClass === right.dataClass
    && left.payloadLocator.scheme === right.payloadLocator.scheme
    && left.temporalPolicy === right.temporalPolicy
    && stableJson(left.jurisdictions) === stableJson(right.jurisdictions)
    && stableJson(left.selectors) === stableJson(right.selectors);
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
    authorizedContextSnapshots: normalizeSnapshotGrants(value.authorizedContextSnapshots),
    authorizedDocumentIds: [...new Set(value.authorizedDocumentIds)].sort(),
    authorizedCompanyIds: [...new Set(value.authorizedCompanyIds)].sort(),
  } as T;
}

function normalizeSnapshotGrants<T extends z.infer<typeof authorizedContextSnapshotSchema>>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.itemId.localeCompare(right.itemId) || left.snapshotFingerprint.localeCompare(right.snapshotFingerprint));
}

function normalizeIntent<T extends z.infer<typeof contextResolutionIntentPayloadSchema> | ContextResolutionIntent>(value: T): T {
  const objectRefs = [...new Map(value.objectRefs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values()]
    .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
  return {...value,
    primaryWorks: [...new Set(value.primaryWorks)].sort(),
    objectKinds: [...new Set(value.objectKinds)].sort(),
    objectRefs,
    productKeys: [...new Set(value.productKeys)].sort(),
    jurisdictions: {...value.jurisdictions, values: [...new Set(value.jurisdictions.values)].sort()},
  } as T;
}

function normalizeCandidate<T extends z.infer<typeof contextCandidatePayloadSchema> | ContextCandidate>(value: T): T {
  const objectRefs = [...new Map(value.selectors.objectRefs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values()]
    .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
  return {...value,
    jurisdictions: [...new Set(value.jurisdictions)].sort(),
    selectors: {
      primaryWorks: [...new Set(value.selectors.primaryWorks)].sort(),
      objectKinds: [...new Set(value.selectors.objectKinds)].sort(),
      objectRefs,
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
  validUntil: string;
  resolutionIssuer: z.input<typeof verifiedIssuerSchema> & {secret: string};
}): AuthorizedContextResolution {
  const controlIssuer = input.control?.issuer ?? {issuerId: "invalid-control", keyId: "invalid-control", algorithm: "hmac-sha256" as const};
  const {secret: resolutionSecret, ...resolutionIssuer} = input.resolutionIssuer;
  const payload = contextResolutionPayloadSchema.parse({
    schemaVersion: "authorized-context-resolution.v2",
    mode: "internal_shadow",
    status: input.status,
    systemControlFingerprint: input.control?.fingerprint ?? "0".repeat(64),
    executionContextHash: input.control?.executionContextHash ?? "0".repeat(64),
    intentFingerprint: input.intent?.fingerprint ?? "0".repeat(64),
    controlRevision: input.control?.revision ?? 1,
    controlIssuer,
    included: input.included,
    excluded: input.excluded,
    gaps: input.gaps,
    blockers: dedupeBlockers(input.blockers),
    resolvedAt: input.resolvedAt,
    validUntil: input.validUntil,
    issuer: verifiedIssuerSchema.parse(resolutionIssuer),
    externalEffectAllowed: false,
  });
  const fingerprintValue = fingerprint(payload);
  return authorizedContextResolutionSchema.parse({
    ...payload,
    fingerprint: fingerprintValue,
    signature: sign({fingerprint: fingerprintValue, issuer: payload.issuer}, resolutionSecret),
  });
}

function dedupeExcluded(values: AuthorizedContextResolution["excluded"]): AuthorizedContextResolution["excluded"] {
  return [...new Map(values
    .sort((left, right) => left.itemId.localeCompare(right.itemId) || left.reason.localeCompare(right.reason))
    .map((value) => [`${value.itemId}:${value.reason}`, value])).values()];
}

function dedupeGaps(values: AuthorizedContextResolution["gaps"]): AuthorizedContextResolution["gaps"] {
  const grouped = new Map<string, AuthorizedContextResolution["gaps"][number]>();
  for (const value of values) {
    const key = `${value.code}:${value.logicalKey ?? ""}`;
    const prior = grouped.get(key);
    grouped.set(key, {...value, sourceItemIds: [...new Set([...(prior?.sourceItemIds ?? []), ...value.sourceItemIds])].sort()});
  }
  return [...grouped.values()].sort((left, right) => left.code.localeCompare(right.code) || (left.logicalKey ?? "").localeCompare(right.logicalKey ?? ""));
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

function stripSignatureAndFingerprint(value: AuthorizedContextResolution): unknown {
  const {fingerprint: _fingerprint, signature: _signature, ...payload} = value;
  return payload;
}

function verifySystemControl(control: SystemContextControl, trust: readonly ContextIssuerTrust[], now: Date): boolean {
  const trustedIssuer = findActiveIssuerTrust(control.issuer, trust, control.issuedAt, now);
  if (!trustedIssuer) return false;
  const {fingerprint: fingerprintValue, signature, ...payload} = control;
  return fingerprint(payload) === fingerprintValue
    && safeSignatureEqual(signature, sign({fingerprint: fingerprintValue, issuer: control.issuer}, trustedIssuer.secret));
}

function findActiveIssuerTrust(
  issuer: z.infer<typeof verifiedIssuerSchema>,
  values: readonly ContextIssuerTrust[],
  issuedAt: string,
  now: Date,
): ContextIssuerTrust | null {
  const matches = values.map((value) => contextIssuerTrustSchema.parse(value)).filter((value) =>
    value.issuerId === issuer.issuerId && value.keyId === issuer.keyId && value.algorithm === issuer.algorithm);
  if (matches.length !== 1) return null;
  const trust = matches[0]!;
  const issuedMs = Date.parse(issuedAt);
  const nowMs = now.getTime();
  if (issuedMs < Date.parse(trust.validFrom)) return null;
  if (trust.validUntil !== null && (issuedMs >= Date.parse(trust.validUntil) || nowMs >= Date.parse(trust.validUntil))) return null;
  if (trust.revokedAt !== null && nowMs >= Date.parse(trust.revokedAt)) return null;
  return trust;
}

function assertValidDate(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new TypeError("context_resolution_now_invalid");
}

function sign(value: unknown, secret: string): string {
  return createHmac("sha256", secret).update(stableJson(value)).digest("hex");
}

function safeSignatureEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
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
