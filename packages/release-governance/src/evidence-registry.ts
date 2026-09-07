import {createHash} from "node:crypto";
import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const immutableCommitSchema = z.string().regex(/^[a-f0-9]{40}$/);
const dateTimeSchema = z.string().datetime({offset: true});
const evidenceIdSchema = z.string().regex(/^EVR-[A-Z0-9-]+$/);
const designReferenceIdSchema = z.string().regex(/^DSR-[A-Z0-9-]+$/);
const claimIdSchema = z.string().regex(/^CLM-[A-Z0-9-]+$/);
const criterionIdSchema = z.string().regex(/^CRT-[A-Z0-9-]+$/);

export const evidenceEnvironmentSchema = z.enum(["repository", "ci", "staging", "production", "external"]);
export type EvidenceEnvironment = z.infer<typeof evidenceEnvironmentSchema>;

export const evidenceTypeSchema = z.enum([
  "repository_content", "test_run", "ci_run", "deployment", "runtime_observation",
  "artifact_integrity", "security_scan", "external_assessment",
]);
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

export const evidenceVerificationMethodSchema = z.enum([
  "repository_content_sha256", "artifact_sha256", "ci_attestation_sha256",
  "runtime_snapshot_sha256", "external_attestation_signature_and_sha256",
]);
export type EvidenceVerificationMethod = z.infer<typeof evidenceVerificationMethodSchema>;

export const evidenceCollectorSchema = z.object({
  principal: z.string().regex(/^[a-z0-9][a-z0-9:._/-]+$/),
  method: z.string().regex(/^[a-z0-9][a-z0-9._/-]+$/),
  version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._+-]+$/),
});
export type EvidenceCollector = z.infer<typeof evidenceCollectorSchema>;

const repositoryPathSchema = z.string().min(1).refine((value) =>
  !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..")
  && !value.includes("\u0000"), "repository path must be relative and traversal-free");

export function isSanitizedArtifactRef(value: string): boolean {
  if (/\s|[?#]/.test(value)) return false;
  if (/(token|secret|password|api[-_]?key|authorization)=/i.test(value)) return false;
  if (/(^|\/)(latest|current|head)(\/|$)/i.test(value)) return false;
  if (!/^(artifact|s3|https):\/\//.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.username === "" && parsed.password === "" && parsed.search === "" && parsed.hash === "";
  } catch {
    return false;
  }
}

const sanitizedArtifactRefSchema = z.string().min(1).max(1_024)
  .refine(isSanitizedArtifactRef, "artifact reference must be sanitized and immutable");

export const repositoryEvidenceSourceSchema = z.object({
  kind: z.literal("repository"), repository: z.string().min(1), commit: immutableCommitSchema,
  path: repositoryPathSchema, contentSha256: sha256Schema,
});
export type RepositoryEvidenceSource = z.infer<typeof repositoryEvidenceSourceSchema>;

export const evidenceAttestationSchema = z.object({
  issuer: z.string().regex(/^[a-z0-9][a-z0-9:._/-]+$/),
  keyId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:._/-]+$/),
  algorithm: z.enum(["ed25519", "ecdsa-p256-sha256", "rsa-pss-sha256"]),
  statementSha256: sha256Schema,
  signatureBase64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).min(32),
});
export type EvidenceAttestation = z.infer<typeof evidenceAttestationSchema>;

export const externalEvidenceSourceSchema = z.object({
  kind: z.literal("external_artifact"), artifactRef: sanitizedArtifactRefSchema,
  artifactSha256: sha256Schema, collectorScope: z.string().min(1), attestation: evidenceAttestationSchema,
});
export type ExternalEvidenceSource = z.infer<typeof externalEvidenceSourceSchema>;

export const evidenceSourceSchema = z.discriminatedUnion("kind", [repositoryEvidenceSourceSchema, externalEvidenceSourceSchema]);
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

export const subjectKindSchema = z.enum(["capability", "program_task", "control", "release"]);
export const subjectCatalogueSchema = z.enum([
  "capability_ledger", "endgame_program_board", "trust_control_catalogue", "release_manifest",
]);
export const evidenceSubjectSchema = z.object({
  kind: subjectKindSchema,
  id: z.string().min(1),
  catalogue: subjectCatalogueSchema,
  catalogueRevision: immutableCommitSchema,
});
export type EvidenceSubject = z.infer<typeof evidenceSubjectSchema>;

export const evidenceSupportSchema = z.object({
  claimId: claimIdSchema,
  criterionIds: z.array(criterionIdSchema).min(1),
});

export const evidenceVerificationSchema = z.object({
  method: evidenceVerificationMethodSchema,
  status: z.enum(["unverified", "verified", "rejected", "superseded"]),
}).strict();

export const evidenceGateSchema = z.object({
  gateId: z.string().min(1),
  result: z.enum(["passed", "failed", "not_run"]),
});

export const evidenceRecordSchema = z.object({
  evidenceId: evidenceIdSchema,
  classification: z.literal("evidence"),
  type: evidenceTypeSchema,
  environment: evidenceEnvironmentSchema,
  source: evidenceSourceSchema,
  collector: evidenceCollectorSchema,
  capturedAt: dateTimeSchema,
  expiresAt: dateTimeSchema,
  verification: evidenceVerificationSchema,
  scope: z.object({system: z.string().min(1), boundary: z.string().min(1)}),
  gate: evidenceGateSchema.nullable(),
  supports: z.array(evidenceSupportSchema),
});
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

export const designReferenceSchema = z.object({
  designReferenceId: designReferenceIdSchema,
  classification: z.literal("design_reference"),
  title: z.string().min(1),
  ref: z.string().min(1),
  revision: z.string().min(1).nullable(),
  purpose: z.string().min(1),
  limitation: z.literal("Design references describe intended behavior and never prove a claim."),
});
export type DesignReference = z.infer<typeof designReferenceSchema>;

export const evidenceFreshnessSchema = z.object({
  maxAgeSeconds: z.number().int().positive(),
  maxTtlSeconds: z.number().int().positive(),
});
export type EvidenceFreshness = z.infer<typeof evidenceFreshnessSchema>;

export const evidenceCriterionSchema = z.object({
  criterionId: criterionIdSchema,
  subject: evidenceSubjectSchema,
  description: z.string().min(1),
  environment: evidenceEnvironmentSchema,
  acceptedEvidenceTypes: z.array(evidenceTypeSchema).min(1),
  acceptedVerificationMethods: z.array(evidenceVerificationMethodSchema).min(1),
  minimumEvidenceCount: z.number().int().positive(),
  freshness: evidenceFreshnessSchema,
  gate: z.object({gateId: z.string().min(1), requiredResult: z.literal("passed")}).nullable(),
});
export type EvidenceCriterion = z.infer<typeof evidenceCriterionSchema>;

export const evidenceClaimSchema = z.object({
  claimId: claimIdSchema,
  subject: evidenceSubjectSchema,
  statement: z.string().min(1),
  environment: evidenceEnvironmentSchema,
  criteria: z.array(z.object({criterionId: criterionIdSchema, evidenceIds: z.array(evidenceIdSchema).min(1)})).min(1),
  designReferenceIds: z.array(designReferenceIdSchema),
});
export type EvidenceClaim = z.infer<typeof evidenceClaimSchema>;

export const evidenceRegistrySchema = z.object({
  registryVersion: z.string().min(1),
  generatedAt: dateTimeSchema,
  evidence: z.array(evidenceRecordSchema),
  designReferences: z.array(designReferenceSchema),
  criteria: z.array(evidenceCriterionSchema),
  claims: z.array(evidenceClaimSchema),
  limitations: z.array(z.string().min(1)).min(1),
});
export type EvidenceRegistry = z.infer<typeof evidenceRegistrySchema>;

export const evidenceRegistryIssueSchema = z.object({
  code: z.string().min(1),
  claimId: claimIdSchema.nullable(),
  criterionId: criterionIdSchema.nullable(),
  evidenceId: evidenceIdSchema.nullable(),
});
export type EvidenceRegistryIssue = z.infer<typeof evidenceRegistryIssueSchema>;

export const evidenceClaimDecisionSchema = z.object({
  claimId: claimIdSchema,
  supported: z.boolean(),
  supportedCriteria: z.number().int().nonnegative(),
  totalCriteria: z.number().int().nonnegative(),
  blockers: z.array(evidenceRegistryIssueSchema),
});
export type EvidenceClaimDecision = z.infer<typeof evidenceClaimDecisionSchema>;

export const evidenceRegistryDecisionSchema = z.object({
  valid: z.boolean(),
  allClaimsSupported: z.boolean(),
  verificationMode: z.enum(["declaration_only", "trusted_resolution"]),
  verificationAuthority: z.object({
    principal: z.string().regex(/^[a-z0-9][a-z0-9:._/-]+$/),
    version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._+-]+$/),
  }).nullable(),
  verifiedEvidenceIds: z.array(evidenceIdSchema),
  claimDecisions: z.array(evidenceClaimDecisionSchema),
  blockers: z.array(evidenceRegistryIssueSchema),
  warnings: z.array(evidenceRegistryIssueSchema),
  registryFingerprint: sha256Schema,
});
export type EvidenceRegistryDecision = z.infer<typeof evidenceRegistryDecisionSchema>;

export const evidenceTypeFreshnessPolicySchema = z.record(evidenceTypeSchema, evidenceFreshnessSchema);
export type EvidenceTypeFreshnessPolicy = z.infer<typeof evidenceTypeFreshnessPolicySchema>;

export const canonicalEvidenceFreshnessPolicy: EvidenceTypeFreshnessPolicy = evidenceTypeFreshnessPolicySchema.parse({
  repository_content: {maxAgeSeconds: 31_536_000, maxTtlSeconds: 31_536_000},
  test_run: {maxAgeSeconds: 604_800, maxTtlSeconds: 604_800},
  ci_run: {maxAgeSeconds: 604_800, maxTtlSeconds: 604_800},
  deployment: {maxAgeSeconds: 86_400, maxTtlSeconds: 86_400},
  runtime_observation: {maxAgeSeconds: 86_400, maxTtlSeconds: 86_400},
  artifact_integrity: {maxAgeSeconds: 604_800, maxTtlSeconds: 604_800},
  security_scan: {maxAgeSeconds: 604_800, maxTtlSeconds: 604_800},
  external_assessment: {maxAgeSeconds: 31_536_000, maxTtlSeconds: 31_536_000},
});

export type ResolvedRepositoryEvidence = RepositoryEvidenceSource & {bytes: Uint8Array};
export type ResolvedExternalEvidence = {artifactRef: string; bytes: Uint8Array};
export type ResolvedEvidenceSubject = EvidenceSubject & {found: boolean};
export type ExternalAttestationVerification = {
  valid: boolean;
  issuer: string;
  keyId: string;
  algorithm: EvidenceAttestation["algorithm"];
  statementSha256: string;
};

export type TrustedEvidenceVerificationContext = {
  resolveRepository: (source: RepositoryEvidenceSource) => Promise<ResolvedRepositoryEvidence>;
  resolveExternalArtifact: (source: ExternalEvidenceSource) => Promise<ResolvedExternalEvidence>;
  resolveSubject: (subject: EvidenceSubject) => Promise<ResolvedEvidenceSubject>;
  verifyExternalAttestation: (input: {
    attestation: EvidenceAttestation;
    signedMessage: Uint8Array;
    evidence: EvidenceRecord;
  }) => Promise<ExternalAttestationVerification>;
  allowedCollectors: EvidenceCollector[];
  allowedAttestationIssuers: Array<Pick<EvidenceAttestation, "issuer" | "keyId" | "algorithm">>;
  freshnessByType: EvidenceTypeFreshnessPolicy;
  verifier: {principal: string; version: string};
};

type TrustedEvidenceResult = {verified: boolean; issues: EvidenceRegistryIssue[]};
type TrustedResolution = {
  evidence: Map<string, TrustedEvidenceResult>;
  subjects: Map<string, boolean>;
  authority: {principal: string; version: string};
};

const verificationMethodBySource: Record<EvidenceSource["kind"], EvidenceVerificationMethod[]> = {
  repository: ["repository_content_sha256"],
  external_artifact: [
    "artifact_sha256", "ci_attestation_sha256", "runtime_snapshot_sha256",
    "external_attestation_signature_and_sha256",
  ],
};

/** Declaration inspection can reject records, but untrusted fields can never support a claim. */
export function evaluateEvidenceRegistry(registry: unknown, now = new Date()): EvidenceRegistryDecision {
  return evaluateRegistry(registry, now, null, canonicalEvidenceFreshnessPolicy);
}

/** The only path that can support claims: exact bytes, origins, catalogues and attestations resolve. */
export async function evaluateEvidenceRegistryWithResolvers(
  registry: unknown,
  context: TrustedEvidenceVerificationContext,
  now = new Date(),
): Promise<EvidenceRegistryDecision> {
  const parsed = evidenceRegistrySchema.safeParse(registry);
  if (!parsed.success) return invalidRegistryDecision(registry, "trusted_resolution");
  const policy = evidenceTypeFreshnessPolicySchema.safeParse(context.freshnessByType);
  const authority = evidenceRegistryDecisionSchema.shape.verificationAuthority.safeParse(context.verifier);
  if (!policy.success || !authority.success || authority.data === null) {
    return invalidRegistryDecision(registry, "trusted_resolution", "invalid_trusted_verification_policy");
  }
  const trusted: TrustedResolution = {evidence: new Map(), subjects: new Map(), authority: authority.data};

  for (const claim of parsed.data.claims) {
    const key = subjectKey(claim.subject);
    if (trusted.subjects.has(key)) continue;
    try {
      const resolved = await context.resolveSubject(claim.subject);
      trusted.subjects.set(key, resolved.found && subjectKey(resolved) === key);
    } catch {
      trusted.subjects.set(key, false);
    }
  }
  for (const evidence of parsed.data.evidence) {
    trusted.evidence.set(evidence.evidenceId, await resolveEvidence(evidence, context));
  }
  return evaluateRegistry(parsed.data, now, trusted, policy.data);
}

function evaluateRegistry(
  registry: unknown,
  now: Date,
  trusted: TrustedResolution | null,
  freshnessPolicy: EvidenceTypeFreshnessPolicy,
): EvidenceRegistryDecision {
  const parsed = evidenceRegistrySchema.safeParse(registry);
  if (!parsed.success) return invalidRegistryDecision(registry, trusted ? "trusted_resolution" : "declaration_only");
  const value = parsed.data;
  const globalBlockers: EvidenceRegistryIssue[] = [];
  const warnings: EvidenceRegistryIssue[] = [];
  if (new Date(value.generatedAt).getTime() > now.getTime()) globalBlockers.push(issue("registry_generated_in_future", null, null, null));

  const evidenceById = uniqueIndex(value.evidence, (entry) => entry.evidenceId, "duplicate_evidence_id", globalBlockers);
  const designById = uniqueIndex(value.designReferences, (entry) => entry.designReferenceId, "duplicate_design_reference_id", globalBlockers);
  const criterionById = uniqueIndex(value.criteria, (entry) => entry.criterionId, "duplicate_criterion_id", globalBlockers);
  const claimById = uniqueIndex(value.claims, (entry) => entry.claimId, "duplicate_claim_id", globalBlockers);

  for (const evidence of value.evidence) {
    validateEvidenceRecord(evidence, now, freshnessPolicy[evidence.type], globalBlockers);
    const trustedResult = trusted?.evidence.get(evidence.evidenceId);
    if (trustedResult && !trustedResult.verified) globalBlockers.push(...trustedResult.issues);
    for (const support of evidence.supports) {
      const claim = claimById.get(support.claimId);
      if (!claim) {
        globalBlockers.push(issue("evidence_support_claim_missing", support.claimId, null, evidence.evidenceId));
        continue;
      }
      for (const criterionId of support.criterionIds) {
        if (!criterionById.has(criterionId)) {
          globalBlockers.push(issue("evidence_support_criterion_missing", support.claimId, criterionId, evidence.evidenceId));
          continue;
        }
        const binding = claim.criteria.find((entry) => entry.criterionId === criterionId);
        if (!binding?.evidenceIds.includes(evidence.evidenceId)) {
          globalBlockers.push(issue("evidence_support_not_bound_by_claim", support.claimId, criterionId, evidence.evidenceId));
        }
      }
    }
  }

  const claimDecisions = value.claims.map((claim) => evaluateClaim({
    claim, now, trusted, evidenceById, designById, criterionById, freshnessPolicy,
  }));
  const blockers = stableIssues([...globalBlockers, ...claimDecisions.flatMap((entry) => entry.blockers)]);
  const valid = blockers.length === 0;
  const verifiedEvidenceIds = trusted
    ? [...trusted.evidence.entries()].filter(([, result]) => result.verified).map(([id]) => id).sort()
    : [];
  return evidenceRegistryDecisionSchema.parse({
    valid,
    allClaimsSupported: valid && claimDecisions.length > 0 && claimDecisions.every((entry) => entry.supported),
    verificationMode: trusted ? "trusted_resolution" : "declaration_only",
    verificationAuthority: trusted?.authority ?? null,
    verifiedEvidenceIds,
    claimDecisions,
    blockers,
    warnings: stableIssues(warnings),
    registryFingerprint: fingerprintJson(value),
  });
}

function evaluateClaim(input: {
  claim: EvidenceClaim;
  now: Date;
  trusted: TrustedResolution | null;
  evidenceById: Map<string, EvidenceRecord>;
  designById: Map<string, DesignReference>;
  criterionById: Map<string, EvidenceCriterion>;
  freshnessPolicy: EvidenceTypeFreshnessPolicy;
}): EvidenceClaimDecision {
  const {claim, now, trusted, evidenceById, designById, criterionById, freshnessPolicy} = input;
  const blockers: EvidenceRegistryIssue[] = [];
  let supportedCriteria = 0;
  const seenCriteria = new Set<string>();
  if (!trusted || trusted.subjects.get(subjectKey(claim.subject)) !== true) {
    blockers.push(issue("trusted_subject_catalogue_resolution_required", claim.claimId, null, null));
  }
  for (const designReferenceId of claim.designReferenceIds) {
    if (!designById.has(designReferenceId)) blockers.push(issue("design_reference_missing", claim.claimId, null, null));
  }
  for (const binding of claim.criteria) {
    if (seenCriteria.has(binding.criterionId)) {
      blockers.push(issue("duplicate_claim_criterion", claim.claimId, binding.criterionId, null));
      continue;
    }
    seenCriteria.add(binding.criterionId);
    const criterion = criterionById.get(binding.criterionId);
    if (!criterion) {
      blockers.push(issue("criterion_missing", claim.claimId, binding.criterionId, null));
      continue;
    }
    if (subjectKey(criterion.subject) !== subjectKey(claim.subject)) {
      blockers.push(issue("criterion_subject_mismatch", claim.claimId, binding.criterionId, null));
      continue;
    }
    if (criterion.environment !== claim.environment) {
      blockers.push(issue("criterion_wrong_environment", claim.claimId, binding.criterionId, null));
      continue;
    }
    if ((claim.subject.kind === "capability" || claim.subject.kind === "release") && !criterion.gate) {
      blockers.push(issue("claim_requires_gate", claim.claimId, binding.criterionId, null));
      continue;
    }

    let acceptedCount = 0;
    const countBefore = blockers.length;
    for (const evidenceId of new Set(binding.evidenceIds)) {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence) {
        blockers.push(issue("evidence_missing", claim.claimId, binding.criterionId, evidenceId));
        continue;
      }
      if (validateEvidenceForCriterion({
        evidence, claim, criterion, now, trustedResult: trusted?.evidence.get(evidenceId) ?? null,
        typeFreshness: freshnessPolicy[evidence.type], blockers,
      })) acceptedCount += 1;
    }
    if (acceptedCount < criterion.minimumEvidenceCount) {
      blockers.push(issue("criterion_minimum_evidence_not_met", claim.claimId, binding.criterionId, null));
    } else if (blockers.length === countBefore) {
      supportedCriteria += 1;
    }
  }
  const stable = stableIssues(blockers);
  return {
    claimId: claim.claimId,
    supported: stable.length === 0 && supportedCriteria === claim.criteria.length,
    supportedCriteria,
    totalCriteria: claim.criteria.length,
    blockers: stable,
  };
}

function validateEvidenceRecord(
  evidence: EvidenceRecord,
  now: Date,
  policy: EvidenceFreshness,
  blockers: EvidenceRegistryIssue[],
) {
  const base = {claimId: null, criterionId: null, evidenceId: evidence.evidenceId};
  if (!verificationMethodBySource[evidence.source.kind].includes(evidence.verification.method)) blockers.push({...base, code: "source_verification_method_mismatch"});
  if (evidence.source.kind === "repository" && (evidence.environment !== "repository" || evidence.type !== "repository_content")) blockers.push({...base, code: "repository_source_scope_mismatch"});
  if (evidence.source.kind === "external_artifact" && evidence.environment === "repository") blockers.push({...base, code: "external_source_cannot_claim_repository_environment"});
  if (evidence.type === "external_assessment" && evidence.verification.method !== "external_attestation_signature_and_sha256") blockers.push({...base, code: "external_assessment_requires_signature_verification"});
  if (evidence.verification.status === "rejected" || evidence.verification.status === "superseded") blockers.push({...base, code: "evidence_declared_unusable"});
  if (evidence.gate && evidence.gate.result !== "passed" && evidence.supports.length > 0) blockers.push({...base, code: "failed_or_unrun_gate_cannot_support_claim"});
  const captured = new Date(evidence.capturedAt).getTime();
  const expires = new Date(evidence.expiresAt).getTime();
  if (captured > now.getTime()) blockers.push({...base, code: "evidence_captured_in_future"});
  if (expires <= now.getTime()) blockers.push({...base, code: "evidence_expired"});
  if (expires <= captured) blockers.push({...base, code: "evidence_expiry_must_follow_capture"});
  if ((expires - captured) / 1_000 > policy.maxTtlSeconds) blockers.push({...base, code: "evidence_type_ttl_exceeded"});
  if ((now.getTime() - captured) / 1_000 > policy.maxAgeSeconds) blockers.push({...base, code: "evidence_type_max_age_exceeded"});
}

function validateEvidenceForCriterion(input: {
  evidence: EvidenceRecord;
  claim: EvidenceClaim;
  criterion: EvidenceCriterion;
  now: Date;
  trustedResult: TrustedEvidenceResult | null;
  typeFreshness: EvidenceFreshness;
  blockers: EvidenceRegistryIssue[];
}): boolean {
  const {evidence, claim, criterion, now, trustedResult, typeFreshness, blockers} = input;
  const before = blockers.length;
  const push = (code: string) => blockers.push(issue(code, claim.claimId, criterion.criterionId, evidence.evidenceId));
  if (evidence.environment !== claim.environment || evidence.environment !== criterion.environment) push("evidence_wrong_environment");
  if (!criterion.acceptedEvidenceTypes.includes(evidence.type)) push("evidence_type_not_accepted");
  if (!criterion.acceptedVerificationMethods.includes(evidence.verification.method)) push("verification_method_not_accepted");
  if (evidence.gate && evidence.gate.result !== "passed") push("failed_or_unrun_gate_cannot_support_claim");
  if (criterion.gate && (!evidence.gate || evidence.gate.gateId !== criterion.gate.gateId
    || evidence.gate.result !== criterion.gate.requiredResult)) push("evidence_gate_result_mismatch");
  const captured = new Date(evidence.capturedAt).getTime();
  const expires = new Date(evidence.expiresAt).getTime();
  const maxAge = Math.min(typeFreshness.maxAgeSeconds, criterion.freshness.maxAgeSeconds);
  const maxTtl = Math.min(typeFreshness.maxTtlSeconds, criterion.freshness.maxTtlSeconds);
  if ((now.getTime() - captured) / 1_000 > maxAge) push("criterion_max_age_exceeded");
  if ((expires - captured) / 1_000 > maxTtl) push("criterion_ttl_exceeded");
  const support = evidence.supports.find((entry) => entry.claimId === claim.claimId);
  if (!support || !support.criterionIds.includes(criterion.criterionId)) push("evidence_does_not_support_claim");
  if (!trustedResult) {
    push("trusted_runtime_verification_required");
  } else {
    for (const entry of trustedResult.issues) blockers.push({...entry, claimId: claim.claimId, criterionId: criterion.criterionId});
    if (!trustedResult.verified) push("trusted_runtime_verification_failed");
  }
  return blockers.length === before;
}

async function resolveEvidence(evidence: EvidenceRecord, context: TrustedEvidenceVerificationContext): Promise<TrustedEvidenceResult> {
  const issues: EvidenceRegistryIssue[] = [];
  const push = (code: string) => issues.push(issue(code, null, null, evidence.evidenceId));
  if (!context.allowedCollectors.some((collector) => collectorKey(collector) === collectorKey(evidence.collector))) push("collector_not_allowlisted");
  try {
    if (evidence.source.kind === "repository") {
      const resolved = await context.resolveRepository(evidence.source);
      if (resolved.repository !== evidence.source.repository || resolved.commit !== evidence.source.commit
        || resolved.path !== evidence.source.path) push("repository_origin_resolution_mismatch");
      if (sha256(resolved.bytes) !== evidence.source.contentSha256) push("repository_content_hash_mismatch");
    } else {
      const source = evidence.source;
      const resolved = await context.resolveExternalArtifact(source);
      if (resolved.artifactRef !== source.artifactRef) push("external_artifact_origin_resolution_mismatch");
      if (sha256(resolved.bytes) !== source.artifactSha256) push("external_artifact_hash_mismatch");
      if (scanPayloadForCredentials(resolved.bytes).length > 0) push("external_artifact_contains_credentials");
      const issuerAllowed = context.allowedAttestationIssuers.some((entry) =>
        entry.issuer === source.attestation.issuer && entry.keyId === source.attestation.keyId
        && entry.algorithm === source.attestation.algorithm);
      if (!issuerAllowed) push("attestation_issuer_not_allowlisted");
      const statementSha256 = externalEvidenceStatementSha256(evidence);
      if (source.attestation.statementSha256 !== statementSha256) push("attestation_statement_mismatch");
      const signedMessage = new TextEncoder().encode(`offroad-evidence-v1:${statementSha256}`);
      const verification = await context.verifyExternalAttestation({attestation: source.attestation, signedMessage, evidence});
      if (!verification.valid || verification.issuer !== source.attestation.issuer
        || verification.keyId !== source.attestation.keyId || verification.algorithm !== source.attestation.algorithm
        || verification.statementSha256 !== statementSha256) push("external_attestation_verification_failed");
    }
  } catch {
    push("trusted_source_resolution_failed");
  }
  const stable = stableIssues(issues);
  return {verified: stable.length === 0, issues: stable};
}

export function externalEvidenceStatementSha256(evidence: EvidenceRecord): string {
  if (evidence.source.kind !== "external_artifact") throw new Error("external artifact evidence required");
  return fingerprintJson({
    schema: "offroad-evidence-attestation-v1", evidenceId: evidence.evidenceId, type: evidence.type,
    environment: evidence.environment, artifactRef: evidence.source.artifactRef,
    artifactSha256: evidence.source.artifactSha256, collectorScope: evidence.source.collectorScope,
    collector: evidence.collector, capturedAt: evidence.capturedAt, expiresAt: evidence.expiresAt,
    scope: evidence.scope, gate: evidence.gate, supports: evidence.supports,
  });
}

export function scanPayloadForCredentials(bytes: Uint8Array): string[] {
  const value = new TextDecoder("utf-8", {fatal: false}).decode(bytes);
  const patterns: Array<[string, RegExp]> = [
    ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/],
    ["bearer_token", /\bBearer\s+[A-Za-z0-9._~+/-]{10,}/i],
    ["credential_assignment", /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|authorization)\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{8,}/i],
    ["url_userinfo", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i],
  ];
  return patterns.filter(([, pattern]) => pattern.test(value)).map(([name]) => name);
}

function invalidRegistryDecision(
  registry: unknown,
  mode: "declaration_only" | "trusted_resolution",
  code = "invalid_registry_schema",
): EvidenceRegistryDecision {
  return {
    valid: false, allClaimsSupported: false, verificationMode: mode, verificationAuthority: null,
    verifiedEvidenceIds: [], claimDecisions: [], blockers: [issue(code, null, null, null)],
    warnings: [], registryFingerprint: fingerprintJson(registry),
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function subjectKey(subject: EvidenceSubject): string {
  return `${subject.kind}:${subject.id}:${subject.catalogue}:${subject.catalogueRevision}`;
}

function collectorKey(collector: EvidenceCollector): string {
  return `${collector.principal}:${collector.method}:${collector.version}`;
}

function uniqueIndex<T>(values: T[], key: (value: T) => string, duplicateCode: string, blockers: EvidenceRegistryIssue[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (result.has(id)) blockers.push(issue(duplicateCode, null, null, null));
    result.set(id, value);
  }
  return result;
}

function issue(code: string, claimId: string | null, criterionId: string | null, evidenceId: string | null): EvidenceRegistryIssue {
  return evidenceRegistryIssueSchema.parse({code, claimId, criterionId, evidenceId});
}

function stableIssues(issues: EvidenceRegistryIssue[]): EvidenceRegistryIssue[] {
  return [...new Map(issues
    .sort((left, right) => `${left.claimId ?? ""}:${left.criterionId ?? ""}:${left.evidenceId ?? ""}:${left.code}`
      .localeCompare(`${right.claimId ?? ""}:${right.criterionId ?? ""}:${right.evidenceId ?? ""}:${right.code}`))
    .map((entry) => [`${entry.claimId ?? ""}:${entry.criterionId ?? ""}:${entry.evidenceId ?? ""}:${entry.code}`, entry])).values()];
}
