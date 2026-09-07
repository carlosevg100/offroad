import {createHash, createPublicKey, verify} from "node:crypto";
import {fingerprintJson, stableJson} from "@offroad/case-understanding";
import {z} from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const immutableRevisionSchema = z.string().regex(/^[a-f0-9]{40}$/);
const dateTimeSchema = z.string().datetime({offset: true});
const evidenceIdSchema = z.string().regex(/^EVR-[A-Z0-9-]+$/);
const claimIdSchema = z.string().regex(/^CLM-[A-Z0-9-]+$/);
const criterionIdSchema = z.string().regex(/^CRT-[A-Z0-9-]+$/);

export const evidenceEnvironmentSchema = z.enum([
  "repository", "ci", "staging", "production", "external",
]);
export type EvidenceEnvironment = z.infer<typeof evidenceEnvironmentSchema>;

export const evidenceTypeSchema = z.enum([
  "repository_content", "test_run", "ci_run", "deployment", "runtime_observation",
  "artifact_integrity", "security_scan", "external_assessment",
]);
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

export const evidenceSubjectSchema = z.object({
  kind: z.enum(["capability", "program_task", "control", "release"]),
  id: z.string().min(1),
  catalogue: z.enum([
    "capability_ledger", "endgame_program_board", "trust_control_catalogue", "release_manifest",
  ]),
  catalogueRevision: immutableRevisionSchema,
}).strict().superRefine((subject, context) => {
  const catalogueByKind = {
    capability: "capability_ledger",
    program_task: "endgame_program_board",
    control: "trust_control_catalogue",
    release: "release_manifest",
  } as const;
  if (subject.catalogue !== catalogueByKind[subject.kind]) {
    context.addIssue({
      code: "custom",
      path: ["catalogue"],
      message: "subject kind and catalogue are incoherent",
    });
  }
});
export type EvidenceSubject = z.infer<typeof evidenceSubjectSchema>;

export const evidenceTenantScopeSchema = z.object({
  tenantKind: z.enum(["platform", "organization"]),
  tenantId: z.string().regex(/^[a-z0-9][a-z0-9:._/-]+$/),
  projectId: z.string().min(1).nullable(),
}).strict().superRefine((tenant, context) => {
  if (tenant.tenantKind === "platform" && tenant.projectId !== null) {
    context.addIssue({
      code: "custom",
      path: ["projectId"],
      message: "platform evidence cannot be project scoped",
    });
  }
});

export const evidenceDeploymentScopeSchema = z.object({
  environment: evidenceEnvironmentSchema,
  deploymentId: z.string().min(1),
  accountId: z.string().min(1),
  region: z.string().min(1),
}).strict();

export const evidenceTrustScopeSchema = z.object({
  trustDomain: z.string().regex(/^[a-z0-9][a-z0-9:._/-]+$/),
  tenant: evidenceTenantScopeSchema,
  deployment: evidenceDeploymentScopeSchema,
}).strict();
export type EvidenceTrustScope = z.infer<typeof evidenceTrustScopeSchema>;

export const evidenceFreshnessSchema = z.object({
  maxAgeSeconds: z.number().int().positive(),
  maxTtlSeconds: z.number().int().positive(),
}).strict();

export const evidenceCriterionSchema = z.object({
  criterionId: criterionIdSchema,
  subject: evidenceSubjectSchema,
  description: z.string().min(1),
  environment: evidenceEnvironmentSchema,
  acceptedEvidenceTypes: z.array(evidenceTypeSchema).min(1)
    .refine((values) => new Set(values).size === values.length, "accepted evidence types must be unique"),
  minimumEvidenceCount: z.number().int().positive(),
  freshness: evidenceFreshnessSchema,
  gate: z.object({gateId: z.string().min(1), requiredResult: z.literal("passed")}).strict().nullable(),
}).strict();
export type EvidenceCriterion = z.infer<typeof evidenceCriterionSchema>;

export const evidenceClaimSchema = z.object({
  claimId: claimIdSchema,
  subject: evidenceSubjectSchema,
  statement: z.string().min(1),
  environment: evidenceEnvironmentSchema,
  criterionIds: z.array(criterionIdSchema).min(1)
    .refine((values) => new Set(values).size === values.length, "claim criterion ids must be unique"),
}).strict();
export type EvidenceClaim = z.infer<typeof evidenceClaimSchema>;

const contentAddressedArtifactRefSchema = z.string().regex(/^artifact:\/\/sha256\/[a-f0-9]{64}$/);

export const evidenceCollectorSchema = z.object({
  principal: z.string().regex(/^[a-z0-9][a-z0-9:._/-]+$/),
  method: z.string().regex(/^[a-z0-9][a-z0-9._/-]+$/),
  version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._+-]+$/),
}).strict();
export type EvidenceCollector = z.infer<typeof evidenceCollectorSchema>;

export const evidenceWorkloadIdentitySchema = z.object({
  oidcIssuer: z.string().url(),
  audience: z.string().min(1),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  workflowRef: z.string().min(1),
  gitRef: z.string().min(1),
}).strict();
export type EvidenceWorkloadIdentity = z.infer<typeof evidenceWorkloadIdentitySchema>;

export const evidenceRunBindingSchema = z.object({
  runId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]+$/),
  runAttempt: z.number().int().positive(),
  workloadIdentity: evidenceWorkloadIdentitySchema,
}).strict();
export type EvidenceRunBinding = z.infer<typeof evidenceRunBindingSchema>;

export const evidenceGateResultSchema = z.object({
  gateId: z.string().min(1),
  result: z.enum(["passed", "failed", "not_run"]),
}).strict();

export const attestedEvidenceSchema = z.object({
  schemaVersion: z.literal("offroad-acceptance-evidence.v1"),
  evidenceId: evidenceIdSchema,
  type: evidenceTypeSchema,
  subject: evidenceSubjectSchema,
  scope: evidenceTrustScopeSchema,
  claimBinding: z.object({
    claimId: claimIdSchema,
    claimDefinitionFingerprint: sha256Schema,
  }).strict(),
  criterionBinding: z.object({
    criterionId: criterionIdSchema,
    criterionDefinitionFingerprint: sha256Schema,
  }).strict(),
  artifact: z.object({
    immutableRef: contentAddressedArtifactRefSchema,
    contentSha256: sha256Schema,
  }).strict(),
  collector: evidenceCollectorSchema,
  gate: evidenceGateResultSchema.nullable(),
  runBinding: evidenceRunBindingSchema,
  nonce: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._-]{15,127}$/),
  issuedAt: dateTimeSchema,
  expiresAt: dateTimeSchema,
  trustRootId: z.string().regex(/^ATR-[A-Z0-9-]+$/),
  issuer: z.string().min(1),
  keyId: z.string().min(1),
  algorithm: z.literal("Ed25519"),
  detachedSignature: z.string().min(1),
}).strict().superRefine((evidence, context) => {
  if (evidence.artifact.immutableRef !== `artifact://sha256/${evidence.artifact.contentSha256}`) {
    context.addIssue({
      code: "custom",
      path: ["artifact", "immutableRef"],
      message: "artifact reference must contain the declared content digest",
    });
  }
});
export type AttestedEvidence = z.infer<typeof attestedEvidenceSchema>;

export const evidenceRegistrySchema = z.object({
  registryVersion: z.string().min(1),
  generatedAt: dateTimeSchema,
  scope: evidenceTrustScopeSchema,
  criteria: z.array(evidenceCriterionSchema),
  claims: z.array(evidenceClaimSchema),
  evidence: z.array(attestedEvidenceSchema),
  limitations: z.array(z.string().min(1)).min(1),
}).strict();
export type EvidenceRegistry = z.infer<typeof evidenceRegistrySchema>;

/**
 * Definitions accepted by the control plane. Registry claims, criteria and limitations are
 * compared to this manifest; callers cannot define their own acceptance claim.
 */
export const evidenceAcceptanceManifestSchema = z.object({
  manifestId: z.string().regex(/^EAM-[A-Z0-9-]+$/),
  manifestVersion: z.string().min(1),
  registryVersion: z.string().min(1),
  scope: evidenceTrustScopeSchema,
  criteria: z.array(evidenceCriterionSchema).min(1),
  claims: z.array(evidenceClaimSchema).min(1),
  limitations: z.array(z.string().min(1)).min(1),
  trustRootIds: z.array(z.string().regex(/^ATR-[A-Z0-9-]+$/)).min(1)
    .refine((values) => new Set(values).size === values.length, "trust root ids must be unique"),
}).strict();
export type EvidenceAcceptanceManifest = z.infer<typeof evidenceAcceptanceManifestSchema>;

export const resolvedEvidenceArtifactSchema = z.object({
  evidenceId: evidenceIdSchema,
  immutableRef: contentAddressedArtifactRefSchema,
  bytes: z.instanceof(Uint8Array),
}).strict();
export type ResolvedEvidenceArtifact = z.infer<typeof resolvedEvidenceArtifactSchema>;

export const evidenceTrustRootSchema = z.object({
  trustRootId: z.string().regex(/^ATR-[A-Z0-9-]+$/),
  issuer: z.string().min(1),
  keyId: z.string().min(1),
  algorithm: z.literal("Ed25519"),
  publicKeyPem: z.string().min(1),
  purpose: z.literal("acceptance_evidence"),
  scope: evidenceTrustScopeSchema,
  subject: evidenceSubjectSchema,
  claimBinding: z.object({
    claimId: claimIdSchema,
    claimDefinitionFingerprint: sha256Schema,
  }).strict(),
  criterionBinding: z.object({
    criterionId: criterionIdSchema,
    criterionDefinitionFingerprint: sha256Schema,
  }).strict(),
  evidenceType: evidenceTypeSchema,
  collector: evidenceCollectorSchema,
  gate: evidenceGateResultSchema,
  workloadIdentity: evidenceWorkloadIdentitySchema,
  artifactNamespace: z.literal("artifact://sha256/"),
  freshness: z.object({
    maxAttestationTtlSeconds: z.number().int().positive(),
    maxIssuanceToReceiptSeconds: z.number().int().nonnegative(),
    maxReceiptAgeSeconds: z.number().int().positive(),
    clockSkewSeconds: z.number().int().nonnegative().max(300),
  }).strict(),
  validFrom: dateTimeSchema,
  validThrough: dateTimeSchema,
  revokedAt: dateTimeSchema.nullable(),
}).strict();
export type EvidenceTrustRoot = z.infer<typeof evidenceTrustRootSchema>;

export const evidenceIngestReceiptSchema = z.object({
  schemaVersion: z.literal("offroad-evidence-receipt.v1"),
  receiptId: z.string().regex(/^ERC-[A-Z0-9-]+$/),
  evidenceId: evidenceIdSchema,
  registryFingerprint: sha256Schema,
  attestationFingerprint: sha256Schema,
  artifact: z.object({
    immutableRef: contentAddressedArtifactRefSchema,
    contentSha256: sha256Schema,
  }).strict(),
  receivedAt: dateTimeSchema,
  runBinding: evidenceRunBindingSchema,
  nonce: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._-]{15,127}$/),
  casRevision: z.number().int().nonnegative(),
  state: z.enum(["available", "consumed"]),
  consumedByPromotionId: z.string().min(1).nullable(),
}).strict().superRefine((receipt, context) => {
  if ((receipt.state === "available") !== (receipt.consumedByPromotionId === null)) {
    context.addIssue({
      code: "custom",
      path: ["consumedByPromotionId"],
      message: "receipt consumption state and promotion id must agree",
    });
  }
  if (receipt.artifact.immutableRef !== `artifact://sha256/${receipt.artifact.contentSha256}`) {
    context.addIssue({
      code: "custom",
      path: ["artifact", "immutableRef"],
      message: "receipt artifact reference must contain the declared content digest",
    });
  }
});
export type EvidenceIngestReceipt = z.infer<typeof evidenceIngestReceiptSchema>;

export const evidenceEvaluationRequestSchema = z.object({
  registry: evidenceRegistrySchema,
  resolvedArtifacts: z.array(resolvedEvidenceArtifactSchema),
}).strict();
export type EvidenceEvaluationRequest = z.infer<typeof evidenceEvaluationRequestSchema>;

export const evidenceRegistryIssueSchema = z.object({
  code: z.string().min(1),
  claimId: claimIdSchema.nullable(),
  criterionId: criterionIdSchema.nullable(),
  evidenceId: evidenceIdSchema.nullable(),
}).strict();
export type EvidenceRegistryIssue = z.infer<typeof evidenceRegistryIssueSchema>;

export const evidenceClaimDecisionSchema = z.object({
  claimId: claimIdSchema,
  supported: z.boolean(),
  supportedCriteria: z.number().int().nonnegative(),
  totalCriteria: z.number().int().nonnegative(),
  blockers: z.array(evidenceRegistryIssueSchema),
}).strict();
export type EvidenceClaimDecision = z.infer<typeof evidenceClaimDecisionSchema>;

export const evidenceRegistryDecisionSchema = z.object({
  registryValid: z.boolean(),
  allClaimsSupported: z.boolean(),
  verificationMode: z.literal("control_plane"),
  evaluatedAt: dateTimeSchema,
  trustRegistryFingerprint: sha256Schema,
  registryFingerprint: sha256Schema,
  verifiedEvidenceIds: z.array(evidenceIdSchema),
  promotionPreconditions: z.array(z.object({
    receiptId: z.string().regex(/^ERC-[A-Z0-9-]+$/),
    evidenceId: evidenceIdSchema,
    expectedCasRevision: z.number().int().nonnegative(),
    nonce: z.string().min(16),
  }).strict()),
  claimDecisions: z.array(evidenceClaimDecisionSchema),
  blockers: z.array(evidenceRegistryIssueSchema),
  decisionFingerprint: sha256Schema,
}).strict();
export type EvidenceRegistryDecision = z.infer<typeof evidenceRegistryDecisionSchema>;

export function evidenceSubjectFingerprint(subject: EvidenceSubject): string {
  return fingerprintJson(evidenceSubjectSchema.parse(subject));
}

export function evidenceCriterionDefinitionFingerprint(criterion: EvidenceCriterion): string {
  return fingerprintJson(evidenceCriterionSchema.parse(criterion));
}

export function evidenceClaimDefinitionFingerprint(claim: EvidenceClaim): string {
  return fingerprintJson(evidenceClaimSchema.parse(claim));
}

export function evidenceTrustScopeFingerprint(scope: EvidenceTrustScope): string {
  return fingerprintJson(evidenceTrustScopeSchema.parse(scope));
}

export function evidenceAttestationSigningPayload(
  evidence: Omit<AttestedEvidence, "detachedSignature">,
): Buffer {
  return Buffer.from(stableJson(evidence), "utf8");
}

/** Cryptographic check only. Authority and acceptance are evaluated separately and internally. */
export function verifyAttestationCryptographicSignatureOnly(
  evidence: AttestedEvidence,
  publicKeyPem: string,
): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") return false;
    const {detachedSignature, ...payload} = evidence;
    return verify(
      null,
      evidenceAttestationSigningPayload(payload),
      key,
      Buffer.from(detachedSignature, "base64"),
    );
  } catch {
    return false;
  }
}

export function evidenceAttestationFingerprint(evidence: AttestedEvidence): string {
  return fingerprintJson(attestedEvidenceSchema.parse(evidence));
}

export function sha256EvidenceBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
