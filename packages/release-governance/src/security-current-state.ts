import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {readFile} from "node:fs/promises";
import {dirname, isAbsolute, relative, resolve, sep} from "node:path";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {z} from "zod";
import type {TrustControlCatalogue} from "./control-register";
import {
  createCanonicalSecurityEntityRelationships,
  createCanonicalSecurityEvidenceManifest,
  createCanonicalSecurityGapRelationships,
  createCanonicalSecurityInventorySnapshotContract,
} from "./security-current-state-canonical.ts";

const dateTimeSchema = z.string().datetime({offset: true});
const inventoryIdSchema = z.string().regex(/^[A-Z]{2,5}-[A-Z0-9-]+$/);
const evidenceIdSchema = z.string().regex(/^SEV-[A-Z0-9-]+$/);
const gapIdSchema = z.string().regex(/^SG-[A-Z0-9-]+$/);
const controlIdSchema = z.string().regex(/^TRUST-[A-Z0-9-]+$/);
const claimIdSchema = z.string().regex(/^SCL-[A-Z0-9-]+$/);
const canonicalRepository = "carlosevg100/offroad" as const;

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
  kind: z.enum(["repository_file", "automated_test", "configuration", "external_snapshot", "contract_record", "operator_observation", "design_reference"]),
  ref: z.string().min(1),
  capturedAt: dateTimeSchema,
  freshness: z.enum(["immutable", "time_bound"]),
  validThrough: dateTimeSchema.nullable(),
  immutableFingerprint: z.string().regex(/^[a-f0-9]{7,64}$/).nullable(),
  contentFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  authorityRef: z.enum(["AUTH-TRUSTED-GIT-BASELINE", "AUTH-OPERATOR-OBSERVATION-ONLY"]),
  collector: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    principalClass: z.string().min(1),
  }).nullable(),
  description: z.string().min(1),
});
export type SecurityInventoryEvidence = z.infer<typeof securityInventoryEvidenceSchema>;

const governedEntitySchema = z.object({
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
  declaredHandlingEnvironmentRefs: z.array(inventoryIdSchema).min(1),
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
  owner: securityOwnerSchema,
  targetRefs: z.array(z.union([inventoryIdSchema, securityDataClassSchema])).min(1),
  evidenceRefs: z.array(evidenceIdSchema).min(1),
  controlIds: z.array(controlIdSchema).min(1),
  nextAction: z.string().min(1),
});
export type SecurityInventoryGap = z.infer<typeof securityInventoryGapSchema>;

export const securityInventoryClaimSchema = z.object({
  claimId: claimIdSchema,
  domain: z.enum(["governance", "environment", "data", "identity", "privacy", "ai", "vendor", "supply_chain"]),
  criterion: z.string().min(1),
  evidenceRequirements: z.array(z.object({
    evidenceRef: evidenceIdSchema,
    criterion: z.string().min(1),
  })).min(1),
  requiredGaps: z.array(z.object({
    gapRef: gapIdSchema,
    severity: z.enum(["critical", "high", "medium", "low"]),
    requiredStatus: z.literal("open"),
  })).min(1),
});
export type SecurityInventoryClaim = z.infer<typeof securityInventoryClaimSchema>;

/**
 * Reviewed minimum coverage for this baseline. It lives outside caller-controlled inventory data,
 * so removing a claim or gap, changing its severity, or silently dropping evidence fails closed.
 */
const canonicalSecurityCoverageCatalogue = [
  {
    claimId: "SCL-GOVERNANCE-OWNERSHIP", domain: "governance",
    criterion: "Security scope and control ownership are represented without treating functional role labels as named accountability.",
    evidenceRequirements: [
      {evidenceRef: "SEV-AGENTS-SCOPE", criterion: "Repository operating rules delimit the represented environment and known unknowns."},
      {evidenceRef: "SEV-SECURITY-PLAN", criterion: "The readiness plan defines the target control domains but is not operating evidence."},
      {evidenceRef: "SEV-CODEOWNERS", criterion: "Repository ownership rules are represented separately from live privileged access."},
    ],
    requiredGaps: [
      {gapRef: "SG-OWNER-ASSIGNMENT", severity: "critical", requiredStatus: "open"},
    ],
  },
  {
    claimId: "SCL-ENVIRONMENT-RELEASE", domain: "environment",
    criterion: "Runtime environments, deployment configuration, separation and schema-before-code ordering remain bounded by explicit evidence and gaps.",
    evidenceRequirements: [
      {evidenceRef: "SEV-ENV-NAMES", criterion: "Configured variable names identify intended integrations without proving live values."},
      {evidenceRef: "SEV-WORKER-TASK", criterion: "The task definition identifies the declared worker runtime and secret references."},
      {evidenceRef: "SEV-DEPLOY-WORKER", criterion: "The workflow identifies deployment steps and workload identity boundaries."},
      {evidenceRef: "SEV-QUALITY-WORKFLOW", criterion: "The quality workflow identifies CI and local Supabase execution paths."},
      {evidenceRef: "SEV-ROLLOUT-ORDER", criterion: "The recorded rollout demonstrates why schema ordering remains an explicit gap."},
    ],
    requiredGaps: [
      {gapRef: "SG-LIVE-CONFIG", severity: "critical", requiredStatus: "open"},
      {gapRef: "SG-ENV-SEPARATION", severity: "critical", requiredStatus: "open"},
      {gapRef: "SG-SCHEMA-BEFORE-CODE", severity: "critical", requiredStatus: "open"},
      {gapRef: "SG-ENV-DATA-MAPPING", severity: "critical", requiredStatus: "open"},
    ],
  },
  {
    claimId: "SCL-DATA-PROTECTION", domain: "data",
    criterion: "Tenant isolation, storage, lifecycle, recovery and content-safe logging are separately covered and never inferred from one another.",
    evidenceRequirements: [
      {evidenceRef: "SEV-SUPABASE-CONFIG", criterion: "Local platform configuration identifies declared Auth, database and storage behavior."},
      {evidenceRef: "SEV-RLS-TEST", criterion: "The tenant non-interference suite is present at the pinned repository commit."},
      {evidenceRef: "SEV-WEB-UPLOAD", criterion: "The browser upload implementation identifies the private object-storage path."},
      {evidenceRef: "SEV-WORKER-RUNTIME", criterion: "Worker code identifies processing, logging and provider handoffs."},
      {evidenceRef: "SEV-WORKER-CONFIG", criterion: "Worker configuration identifies fail-closed parsing and declared provider switches."},
    ],
    requiredGaps: [
      {gapRef: "SG-DATA-LIFECYCLE", severity: "critical", requiredStatus: "open"},
      {gapRef: "SG-BACKUP-RESTORE", severity: "critical", requiredStatus: "open"},
      {gapRef: "SG-LOGGING-CONTENT-SAFETY", severity: "high", requiredStatus: "open"},
    ],
  },
  {
    claimId: "SCL-IDENTITY-ACCESS", domain: "identity",
    criterion: "Human, workload and deployment identities are inventoried without inferring effective permissions from configuration or operator recollection.",
    evidenceRequirements: [
      {evidenceRef: "SEV-DEPLOY-WORKER", criterion: "OIDC and named deployment roles are visible in the pinned workflow."},
      {evidenceRef: "SEV-AWS-DEPLOY-ROLE-SNAPSHOT", criterion: "The unverified operator observation records only the need for effective-permission evidence."},
    ],
    requiredGaps: [
      {gapRef: "SG-PRIVILEGED-ACCESS", severity: "critical", requiredStatus: "open"},
      {gapRef: "SG-ENDPOINTS", severity: "high", requiredStatus: "open"},
      {gapRef: "SG-DEPLOY-DIAGNOSTICS", severity: "high", requiredStatus: "open"},
    ],
  },
  {
    claimId: "SCL-PRIVACY-RIGHTS", domain: "privacy",
    criterion: "Personal-data purpose, rights, residency and transfer obligations remain explicit rather than implied by platform configuration.",
    evidenceRequirements: [
      {evidenceRef: "SEV-SUPABASE-CONFIG", criterion: "Authentication configuration identifies personal-data processing entry points."},
      {evidenceRef: "SEV-WEB-OBSERVABILITY", criterion: "Client telemetry code identifies conditional personal-data-adjacent flows."},
    ],
    requiredGaps: [
      {gapRef: "SG-PRIVACY-RECORDS", severity: "high", requiredStatus: "open"},
      {gapRef: "SG-REGION-MAP", severity: "high", requiredStatus: "open"},
    ],
  },
  {
    claimId: "SCL-AI-PROVIDER-BOUNDARY", domain: "ai",
    criterion: "Model routing, provider data policy and the privileged Codex executor are distinct boundaries with explicit credential and prompt-injection risk.",
    evidenceRequirements: [
      {evidenceRef: "SEV-MODEL-DATA-POLICY", criterion: "The provider data-policy contract is present at the pinned commit."},
      {evidenceRef: "SEV-MODEL-DATA-POLICY-TEST", criterion: "Provider policy regressions are represented by pinned tests."},
      {evidenceRef: "SEV-MODEL-POLICY", criterion: "The model routing policy identifies allowlists, fallback and workload limits."},
      {evidenceRef: "SEV-PUBLIC-RESEARCH", criterion: "Configured research providers and activation variables are represented."},
      {evidenceRef: "SEV-EVAL-CODEX", criterion: "The Codex workflow identifies its agentic workspace, credential and egress boundary."},
    ],
    requiredGaps: [
      {gapRef: "SG-PROVIDER-ASSURANCE", severity: "critical", requiredStatus: "open"},
      {gapRef: "SG-CODEX-CI-AGENT-BOUNDARY", severity: "critical", requiredStatus: "open"},
    ],
  },
  {
    claimId: "SCL-VENDOR-TELEMETRY", domain: "vendor",
    criterion: "External processing, telemetry, contracts and regional behavior remain unverified until provider-specific evidence is collected.",
    evidenceRequirements: [
      {evidenceRef: "SEV-WEB-OBSERVABILITY", criterion: "Conditional Sentry and PostHog activation is visible in client code."},
      {evidenceRef: "SEV-CASE-RENDER", criterion: "Generated-material code identifies the external font-loading boundary."},
    ],
    requiredGaps: [
      {gapRef: "SG-VENDOR-ASSURANCE", severity: "high", requiredStatus: "open"},
      {gapRef: "SG-TELEMETRY-ASSURANCE", severity: "high", requiredStatus: "open"},
    ],
  },
  {
    claimId: "SCL-SUPPLY-CHAIN-COVERAGE", domain: "supply_chain",
    criterion: "CI, evaluation, package, action, container, browser and browser-CDN acquisition paths are all represented and remain subject to asset discovery.",
    evidenceRequirements: [
      {evidenceRef: "SEV-SECURITY-WORKFLOW", criterion: "Security CI identifies CodeQL, dependency, SBOM and image scanning."},
      {evidenceRef: "SEV-WEB-DEPENDENCIES", criterion: "Direct web dependencies are recorded at the pinned commit."},
      {evidenceRef: "SEV-LOCKFILE", criterion: "Resolved JavaScript package sources are pinned in the repository."},
      {evidenceRef: "SEV-EVAL-EXTRACTION", criterion: "Extraction evaluation provider and credential paths are represented."},
      {evidenceRef: "SEV-EVAL-INTENT", criterion: "Intent evaluation provider and credential paths are represented."},
      {evidenceRef: "SEV-EVAL-CLASSIFICATION", criterion: "Classification evaluation provider and credential paths are represented."},
      {evidenceRef: "SEV-EVAL-GOLD", criterion: "Gold evaluation provider and credential paths are represented."},
      {evidenceRef: "SEV-EVAL-PROBE", criterion: "Structured-output probe provider and credential paths are represented."},
      {evidenceRef: "SEV-EVAL-LIVE-GATE", criterion: "Live-preview gate provider, search and local-stack paths are represented."},
    ],
    requiredGaps: [
      {gapRef: "SG-ASSET-DISCOVERY", severity: "high", requiredStatus: "open"},
    ],
  },
] satisfies SecurityInventoryClaim[];

export function createCanonicalSecurityCoverageCatalogue(): SecurityInventoryClaim[] {
  return structuredClone(canonicalSecurityCoverageCatalogue);
}

const canonicalSecurityEvidenceManifest = createCanonicalSecurityEvidenceManifest();
const canonicalSecurityEntityRelationships = createCanonicalSecurityEntityRelationships();
const canonicalSecurityGapRelationships = createCanonicalSecurityGapRelationships();
const canonicalSecurityInventorySnapshotContract = createCanonicalSecurityInventorySnapshotContract();

export const securityCurrentStateInventorySchema = z.object({
  inventoryVersion: z.string().min(1),
  generatedAt: dateTimeSchema,
  baseline: z.object({
    repository: z.literal(canonicalRepository),
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
  coverageClaims: z.array(securityInventoryClaimSchema).min(1),
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
  evidenceVerification: "declaration_only" | "repository_and_local_bytes";
  currentStateTruthVerified: boolean;
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
    coverageClaims: number;
  };
  inventoryFingerprint: string;
  repositoryResolution: {
    declaredRepository: string;
    trustedRemote: string | null;
    resolvedCommit: string | null;
    commitContainedInMain: boolean;
  };
  claimAssessments: Array<{
    claimId: string;
    domain: SecurityInventoryClaim["domain"];
    status: "coverage_contract_invalid" | "evidence_unresolved" | "blocked_by_open_gaps" | "covered_without_open_gap";
    evidenceRefs: string[];
    openGapRefs: string[];
  }>;
  entityAssessments: Array<{
    entityId: string;
    status: SecurityInventoryState | "coverage_contract_invalid";
    evidenceRefs: string[];
    gapRefs: string[];
    controlIds: string[];
  }>;
  gapAssessments: Array<{
    gapId: string;
    status: "open" | "coverage_contract_invalid";
    severity: SecurityInventoryGap["severity"];
    targetRefs: string[];
    evidenceRefs: string[];
    controlIds: string[];
  }>;
  evidenceResolutions: Array<{
    evidenceId: string;
    ref: string;
    byteLength: number;
    contentFingerprint: string;
    source: "git_object" | "local_artifact";
  }>;
};

const trustedRenderDecisionReceipts = new WeakMap<SecurityInventoryDecision, {
  sourceInventory: SecurityCurrentStateInventory;
  inventorySnapshot: SecurityCurrentStateInventory;
  decisionSnapshot: SecurityInventoryDecision;
}>();

const secretPatterns: Array<{name: string; pattern: RegExp}> = [
  {name: "private_key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/},
  {name: "openai_style_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/},
  {name: "openai_project_key", pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/},
  {name: "anthropic_key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/},
  {name: "stripe_style_key", pattern: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/},
  {name: "aws_access_key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/},
  {name: "aws_session_token", pattern: /\bFwoGZXIvYXdzE[A-Za-z0-9/+=]{30,}\b/},
  {name: "aws_sts_session_token", pattern: /\bIQoJb3JpZ2luX2[A-Za-z0-9/+=]{30,}\b/},
  {name: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/},
  {name: "github_fine_grained_token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/},
  {name: "perplexity_key", pattern: /\bpplx-[A-Za-z0-9_-]{20,}\b/},
  {name: "firecrawl_key", pattern: /\bfc-[A-Za-z0-9_-]{20,}\b/},
  {name: "supabase_secret_key", pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/},
  {name: "posthog_personal_key", pattern: /\bphc_[A-Za-z0-9_-]{20,}\b/},
  {name: "sentry_auth_token", pattern: /\bsntrys_[A-Za-z0-9_-]{20,}\b/},
  {name: "vercel_token", pattern: /\b(?:vercel_|vcp_)[A-Za-z0-9_-]{20,}\b/},
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
): SecurityInventoryDecision {
  return evaluateDeclaredInventory(inventory, trustControlCatalogue, new Date());
}

/**
 * Declaration-only structural validation. This result deliberately cannot attest current-state
 * truth because it does not resolve bytes from the repository or evidence store.
 */
function evaluateDeclaredInventory(
  inventory: SecurityCurrentStateInventory,
  trustControlCatalogue: TrustControlCatalogue,
  now: Date,
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
  if (/"(?:api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token|aws_secret_access_key|aws_session_token|auth_token|dsn)"\s*:\s*"[^"\s]{8,}"/i.test(rawSerialized)) {
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
  const claimById = indexed(parsed.coverageClaims, (item) => item.claimId, "duplicate_claim_id", blockers);
  const inventoryFingerprint = createInventoryFingerprint(parsed);
  validateCanonicalInventorySnapshot(parsed, inventoryFingerprint, now, blockers);
  if (stableJson(parsed.coverageClaims) !== stableJson(canonicalSecurityCoverageCatalogue)) {
    blockers.push({code: "canonical_coverage_catalogue_mismatch", subjectRef: null});
  }
  validateCanonicalEvidenceManifest(parsed.evidenceIndex, blockers);
  validateCanonicalRelationshipCatalogues(parsed, blockers);
  if (!gapById.has(parsed.scopeRelationship.gapRef)) {
    blockers.push({code: `scope_relationship_gap_missing:${parsed.scopeRelationship.gapRef}`, subjectRef: null});
  }
  const knownControlIds = new Set(trustControlCatalogue.controls.map((control) => control.controlId));
  const allEntityIds = new Map<string, string>();

  const nowMs = now.getTime();
  const reviewDueAtMs = checkedDate(parsed.baseline.reviewDueAt, "baseline_review_due_at", parsed.baseline.commit, blockers);
  const evidenceCutoffMs = checkedDate(parsed.baseline.evidenceCutoff, "baseline_evidence_cutoff", parsed.baseline.commit, blockers);
  if (!Number.isFinite(nowMs)) blockers.push({code: "trusted_clock_invalid", subjectRef: null});
  if (reviewDueAtMs !== null && Number.isFinite(nowMs) && reviewDueAtMs < nowMs) {
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
    const evidenceCapturedAt = checkedDate(evidence.capturedAt, "evidence_captured_at", evidence.evidenceId, blockers);
    const validThrough = evidence.validThrough
      ? checkedDate(evidence.validThrough, "evidence_valid_through", evidence.evidenceId, blockers)
      : null;
    if (evidenceCapturedAt !== null && evidenceCutoffMs !== null && Number.isFinite(nowMs)
      && (evidenceCapturedAt > nowMs || evidenceCapturedAt > evidenceCutoffMs)) {
      blockers.push({code: "evidence_captured_after_cutoff", subjectRef: evidence.evidenceId});
    }
    if (evidence.freshness === "immutable" && !evidence.immutableFingerprint) {
      blockers.push({code: "immutable_evidence_requires_fingerprint", subjectRef: evidence.evidenceId});
    }
    if (["repository_file", "automated_test", "configuration", "design_reference"].includes(evidence.kind)
      && evidence.immutableFingerprint !== parsed.baseline.commit) {
      blockers.push({code: "repository_evidence_commit_mismatch", subjectRef: evidence.evidenceId});
    }
    if (evidence.freshness === "time_bound" && !evidence.validThrough) {
      blockers.push({code: "time_bound_evidence_requires_expiry", subjectRef: evidence.evidenceId});
    }
    if ((evidence.kind === "external_snapshot" || evidence.kind === "contract_record" || evidence.kind === "operator_observation") && evidence.freshness !== "time_bound") {
      blockers.push({code: "external_evidence_must_be_time_bound", subjectRef: evidence.evidenceId});
    }
    if ((evidence.kind === "external_snapshot" || evidence.kind === "contract_record" || evidence.kind === "operator_observation") && !evidence.collector) {
      blockers.push({code: "external_evidence_requires_collector", subjectRef: evidence.evidenceId});
    }
    if (evidence.kind === "operator_observation") {
      warnings.push({code: "operator_observation_not_independently_verified", subjectRef: evidence.evidenceId});
    }
    if (validThrough !== null && evidenceCapturedAt !== null && validThrough <= evidenceCapturedAt) {
      blockers.push({code: "evidence_validity_window_invalid", subjectRef: evidence.evidenceId});
    }
    if (validThrough !== null && Number.isFinite(nowMs) && validThrough < nowMs) {
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
    validateRefs(dataClass.dataClassId, dataClass.declaredHandlingEnvironmentRefs, environmentById, "unknown_environment_ref", blockers);
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
    const endpoints = new Set([...systemById.keys(), ...storeById.keys(), ...vendorById.keys()]);
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

  const claimedGapIds = new Set<string>();
  const claimedEvidenceIds = new Set<string>();
  for (const canonicalClaim of canonicalSecurityCoverageCatalogue) {
    const claim = claimById.get(canonicalClaim.claimId);
    if (!claim) {
      blockers.push({code: "canonical_claim_missing", subjectRef: canonicalClaim.claimId});
    }
    for (const requirement of canonicalClaim.evidenceRequirements) {
      claimedEvidenceIds.add(requirement.evidenceRef);
      if (!evidenceById.has(requirement.evidenceRef)) {
        blockers.push({code: `claim_evidence_missing:${requirement.evidenceRef}`, subjectRef: canonicalClaim.claimId});
      }
    }
    for (const requiredGap of canonicalClaim.requiredGaps) {
      claimedGapIds.add(requiredGap.gapRef);
      const gap = gapById.get(requiredGap.gapRef);
      if (!gap) {
        blockers.push({code: "canonical_gap_missing", subjectRef: requiredGap.gapRef});
        continue;
      }
      if (gap.severity !== requiredGap.severity) blockers.push({code: "canonical_gap_severity_mismatch", subjectRef: requiredGap.gapRef});
    }
  }
  for (const gap of parsed.gaps) {
    if (!claimedGapIds.has(gap.gapId)) blockers.push({code: "gap_not_covered_by_canonical_claim", subjectRef: gap.gapId});
  }
  for (const evidence of parsed.evidenceIndex) {
    if (!claimedEvidenceIds.has(evidence.evidenceId)) blockers.push({code: "evidence_not_linked_to_claim_criterion", subjectRef: evidence.evidenceId});
  }

  return {
    structurallyValid: blockers.length === 0,
    evidenceVerification: "declaration_only",
    currentStateTruthVerified: false,
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
      openGaps: Object.keys(canonicalSecurityGapRelationships).length,
      coverageClaims: parsed.coverageClaims.length,
    },
    inventoryFingerprint,
    repositoryResolution: {
      declaredRepository: parsed.baseline.repository,
      trustedRemote: null,
      resolvedCommit: null,
      commitContainedInMain: false,
    },
    claimAssessments: deriveClaimAssessments(parsed, new Set()),
    entityAssessments: deriveEntityAssessments(parsed, new Set()),
    gapAssessments: deriveGapAssessments(parsed),
    evidenceResolutions: [],
  };
}

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const repositoryKinds = new Set<SecurityInventoryEvidence["kind"]>(["repository_file", "automated_test", "configuration", "design_reference"]);
const externalKinds = new Set<SecurityInventoryEvidence["kind"]>(["external_snapshot", "contract_record", "operator_observation"]);
const trustedRepositoryRemote = "github.com/carlosevg100/offroad";
const trustedExternalEvidenceAuthorities = {
  "SEV-AWS-DEPLOY-ROLE-SNAPSHOT": {
    authorityRef: "AUTH-OPERATOR-OBSERVATION-ONLY",
    kind: "operator_observation",
    ref: "docs/security/evidence/aws-worker-rollout-diagnostics-2026-09-07.json",
    capturedAt: "2026-09-07T09:20:00.000-03:00",
    validThrough: "2026-09-14T09:20:00.000-03:00",
    contentFingerprint: "sha256:eee921b75a3b879cd6790163cb370efe7294fec808fee95bc0e0bd492babbf8b",
    source: "unverified operator observation",
    collector: {name: "operator-authored-observation", version: "1", principalClass: "authorized cloud administrator"},
    origin: {
      repository: canonicalRepository,
      environmentRef: "ENV-PRODUCTION",
      systemRef: "SYS-GITHUB",
      authorityClass: "observation_only_no_attestation_authority",
    },
  },
} as const;

/**
 * Trusted evaluation used by render and release gates. Resolver construction is internal: callers
 * cannot substitute bytes, a repository, a clock, or an observation verifier.
 */
export async function evaluateSecurityCurrentStateInventoryTrusted(
  inventory: SecurityCurrentStateInventory,
  trustControlCatalogue: TrustControlCatalogue,
): Promise<SecurityInventoryDecision> {
  const parsed = securityCurrentStateInventorySchema.parse(inventory);
  const declared = evaluateDeclaredInventory(parsed, trustControlCatalogue, new Date());
  const blockers = [...declared.blockers];
  const resolutions: SecurityInventoryDecision["evidenceResolutions"] = [];
  const repositoryResolution = await resolveTrustedRepository(parsed, blockers);

  for (const evidence of parsed.evidenceIndex) {
    if (!safeRepositoryRelativePath(evidence.ref)) {
      blockers.push({code: "evidence_ref_outside_repository", subjectRef: evidence.evidenceId});
      continue;
    }
    try {
      const blockersBeforeResolution = blockers.length;
      if (repositoryKinds.has(evidence.kind)) {
        const objectRef = `${parsed.baseline.commit}:${evidence.ref}`;
        const {stdout} = await execFileAsync("git", ["show", objectRef], {cwd: repositoryRoot, encoding: "buffer", maxBuffer: 20 * 1024 * 1024});
        const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
        const fingerprint = sha256(bytes);
        if (evidence.contentFingerprint !== fingerprint) {
          blockers.push({code: "repository_evidence_content_mismatch", subjectRef: evidence.evidenceId});
        }
        if (blockers.length === blockersBeforeResolution) {
          resolutions.push({evidenceId: evidence.evidenceId, ref: objectRef, byteLength: bytes.byteLength, contentFingerprint: fingerprint, source: "git_object"});
        }
      } else if (externalKinds.has(evidence.kind)) {
        const absolutePath = resolve(repositoryRoot, evidence.ref);
        const bytes = await readFile(absolutePath);
        const fingerprint = sha256(bytes);
        if (evidence.contentFingerprint !== fingerprint) {
          blockers.push({code: "external_evidence_content_mismatch", subjectRef: evidence.evidenceId});
        }
        validateExternalEvidenceAuthority(evidence, bytes, blockers);
        if (blockers.length === blockersBeforeResolution) {
          resolutions.push({evidenceId: evidence.evidenceId, ref: evidence.ref, byteLength: bytes.byteLength, contentFingerprint: fingerprint, source: "local_artifact"});
        }
      }
    } catch {
      blockers.push({code: "evidence_bytes_unresolvable", subjectRef: evidence.evidenceId});
    }
  }

  const expectedEvidenceCount = parsed.evidenceIndex.length;
  if (resolutions.length !== expectedEvidenceCount) blockers.push({code: "evidence_resolution_incomplete", subjectRef: null});
  const decision: SecurityInventoryDecision = {
    ...declared,
    structurallyValid: blockers.length === 0,
    evidenceVerification: "repository_and_local_bytes",
    currentStateTruthVerified: blockers.length === 0,
    blockers: stableIssues(blockers),
    repositoryResolution,
    claimAssessments: deriveClaimAssessments(parsed, new Set(resolutions.map((item) => item.evidenceId))),
    entityAssessments: deriveEntityAssessments(parsed, new Set(resolutions.map((item) => item.evidenceId))),
    gapAssessments: deriveGapAssessments(parsed),
    evidenceResolutions: resolutions.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
  };
  if (decision.structurallyValid && decision.currentStateTruthVerified && decision.blockers.length === 0) {
    const inventorySnapshot = deepFreeze(structuredClone(parsed));
    const decisionSnapshot = deepFreeze(decision);
    trustedRenderDecisionReceipts.set(decisionSnapshot, {
      sourceInventory: inventory,
      inventorySnapshot,
      decisionSnapshot,
    });
    return decisionSnapshot;
  }
  return decision;
}

/**
 * Rendering is an assurance boundary, not a second evaluator. Only the unchanged decision object
 * issued by the trusted resolver for the exact canonical snapshot may authorize human-readable
 * output. Declaration-only decisions, reconstructed objects and post-evaluation mutation all fail
 * closed before any caller-controlled narrative is assembled.
 */
export function assertTrustedSecurityInventoryRenderDecision(
  inventory: SecurityCurrentStateInventory,
  decision: SecurityInventoryDecision,
): {inventory: SecurityCurrentStateInventory; decision: SecurityInventoryDecision} {
  const receipt = trustedRenderDecisionReceipts.get(decision);
  if (!receipt || receipt.sourceInventory !== inventory) {
    throw new Error("security inventory rendering requires an unchanged trusted decision for the canonical snapshot");
  }
  // Never parse or otherwise read the caller object again. The evaluator already established the
  // canonical fingerprint, resolved the evidence and captured parser-owned values. Both snapshots
  // are deeply frozen before the decision leaves the trusted boundary.
  return {inventory: receipt.inventorySnapshot, decision: receipt.decisionSnapshot};
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

async function resolveTrustedRepository(
  inventory: SecurityCurrentStateInventory,
  blockers: SecurityInventoryIssue[],
): Promise<SecurityInventoryDecision["repositoryResolution"]> {
  let trustedRemote: string | null = null;
  let resolvedCommit: string | null = null;
  let commitContainedInMain = false;
  try {
    const {stdout} = await execFileAsync("git", ["remote", "get-url", "origin"], {cwd: repositoryRoot, encoding: "utf8"});
    trustedRemote = normalizeGitRemote(stdout.trim());
    if (trustedRemote !== trustedRepositoryRemote || inventory.baseline.repository !== canonicalRepository) {
      blockers.push({code: "repository_identity_mismatch", subjectRef: inventory.baseline.repository});
    }
  } catch {
    blockers.push({code: "repository_identity_unresolvable", subjectRef: inventory.baseline.repository});
  }
  try {
    const {stdout} = await execFileAsync("git", ["rev-parse", "--verify", `${inventory.baseline.commit}^{commit}`], {cwd: repositoryRoot, encoding: "utf8"});
    resolvedCommit = stdout.trim();
    if (resolvedCommit !== inventory.baseline.commit) blockers.push({code: "repository_commit_not_full_hash", subjectRef: inventory.baseline.commit});
  } catch {
    blockers.push({code: "repository_commit_unresolvable", subjectRef: inventory.baseline.commit});
  }
  if (resolvedCommit) {
    try {
      await execFileAsync("git", ["merge-base", "--is-ancestor", resolvedCommit, "refs/remotes/origin/main"], {cwd: repositoryRoot});
      commitContainedInMain = true;
    } catch {
      blockers.push({code: "repository_commit_not_on_trusted_main", subjectRef: inventory.baseline.commit});
    }
  }
  return {declaredRepository: inventory.baseline.repository, trustedRemote, resolvedCommit, commitContainedInMain};
}

function normalizeGitRemote(remote: string): string {
  return remote
    .replace(/^git@github\.com:/, "github.com/")
    .replace(/^ssh:\/\/git@github\.com\//, "github.com/")
    .replace(/^https?:\/\/github\.com\//, "github.com/")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
}

function checkedDate(value: string, field: string, subjectRef: string, blockers: SecurityInventoryIssue[]): number | null {
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    blockers.push({code: `invalid_date:${field}`, subjectRef});
    return null;
  }
  return parsed;
}

function safeRepositoryRelativePath(value: string): boolean {
  if (isAbsolute(value) || value.includes("\0")) return false;
  const absolute = resolve(repositoryRoot, value);
  const rel = relative(repositoryRoot, absolute);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function validateExternalEvidenceAuthority(
  evidence: SecurityInventoryEvidence,
  bytes: Uint8Array,
  blockers: SecurityInventoryIssue[],
) {
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    blockers.push({code: "operator_observation_invalid_json", subjectRef: evidence.evidenceId});
    return;
  }
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const authority = trustedExternalEvidenceAuthorities[evidence.evidenceId as keyof typeof trustedExternalEvidenceAuthorities];
  if (!authority) {
    blockers.push({code: "external_evidence_authority_not_allowlisted", subjectRef: evidence.evidenceId});
    return;
  }
  const declaredAuthorityMetadata = {
    authorityRef: evidence.authorityRef,
    kind: evidence.kind,
    ref: evidence.ref,
    capturedAt: evidence.capturedAt,
    validThrough: evidence.validThrough,
    collector: evidence.collector,
    contentFingerprint: evidence.contentFingerprint,
  };
  const expectedAuthorityMetadata = {
    authorityRef: authority.authorityRef,
    kind: authority.kind,
    ref: authority.ref,
    capturedAt: authority.capturedAt,
    validThrough: authority.validThrough,
    collector: authority.collector,
    contentFingerprint: authority.contentFingerprint,
  };
  if (stableJson(declaredAuthorityMetadata) !== stableJson(expectedAuthorityMetadata)) {
    blockers.push({code: "external_evidence_declaration_not_allowlisted", subjectRef: evidence.evidenceId});
  }
  const payloadMetadata = {
    evidenceId: record.evidenceId,
    capturedAt: record.capturedAt,
    validThrough: record.validThrough,
    source: record.source,
    collector: record.collector,
    origin: record.origin,
  };
  const expectedPayloadMetadata = {
    evidenceId: evidence.evidenceId,
    capturedAt: authority.capturedAt,
    validThrough: authority.validThrough,
    source: authority.source,
    collector: authority.collector,
    origin: authority.origin,
  };
  if (stableJson(payloadMetadata) !== stableJson(expectedPayloadMetadata)) {
    blockers.push({code: "external_evidence_payload_metadata_mismatch", subjectRef: evidence.evidenceId});
  }
  if (evidence.kind === "operator_observation" && record.verificationState !== "unverified_operator_observation") {
    blockers.push({code: "operator_observation_verification_state_invalid", subjectRef: evidence.evidenceId});
  }
  const assertionText = `${evidence.description}\n${Buffer.from(bytes).toString("utf8")}`;
  if (evidence.kind === "operator_observation" && /\b(?:confirmed|verified|attested)\b/i.test(assertionText)) {
    blockers.push({code: "operator_observation_asserts_verified_fact", subjectRef: evidence.evidenceId});
  }
}

function validateCanonicalEvidenceManifest(
  evidenceIndex: SecurityInventoryEvidence[],
  blockers: SecurityInventoryIssue[],
) {
  const actualById = new Map(evidenceIndex.map((evidence) => [evidence.evidenceId, evidence]));
  const expectedById = new Map(canonicalSecurityEvidenceManifest.map((evidence) => [evidence.evidenceId, evidence]));
  for (const expected of canonicalSecurityEvidenceManifest) {
    const actual = actualById.get(expected.evidenceId);
    if (!actual) {
      blockers.push({code: "canonical_evidence_missing", subjectRef: expected.evidenceId});
      continue;
    }
    const projection = {
      evidenceId: actual.evidenceId,
      kind: actual.kind,
      ref: actual.ref,
      capturedAt: actual.capturedAt,
      freshness: actual.freshness,
      validThrough: actual.validThrough,
      immutableFingerprint: actual.immutableFingerprint,
      contentFingerprint: actual.contentFingerprint,
      authorityRef: actual.authorityRef,
      collector: actual.collector,
    };
    if (stableJson(projection) !== stableJson(expected)) {
      blockers.push({code: "canonical_evidence_manifest_mismatch", subjectRef: expected.evidenceId});
    }
  }
  for (const evidenceId of actualById.keys()) {
    if (!expectedById.has(evidenceId)) blockers.push({code: "unexpected_evidence", subjectRef: evidenceId});
  }
}

function createInventoryFingerprint(inventory: SecurityCurrentStateInventory): string {
  return createHash("sha256").update(stableJson(inventory)).digest("hex");
}

function validateCanonicalInventorySnapshot(
  inventory: SecurityCurrentStateInventory,
  inventoryFingerprint: string,
  now: Date,
  blockers: SecurityInventoryIssue[],
) {
  const contract = canonicalSecurityInventorySnapshotContract;
  if (inventoryFingerprint !== contract.inventoryFingerprint) {
    blockers.push({code: "canonical_inventory_snapshot_mismatch", subjectRef: inventory.inventoryVersion});
  }
  if (inventory.generatedAt !== contract.generatedAt) {
    blockers.push({code: "canonical_generated_at_mismatch", subjectRef: inventory.inventoryVersion});
  }
  if (inventory.baseline.evidenceCutoff !== contract.evidenceCutoff) {
    blockers.push({code: "canonical_evidence_cutoff_mismatch", subjectRef: inventory.baseline.commit});
  }
  if (inventory.baseline.reviewDueAt !== contract.reviewDueAt) {
    blockers.push({code: "canonical_review_due_at_mismatch", subjectRef: inventory.baseline.commit});
  }

  const generatedAt = checkedDate(inventory.generatedAt, "generated_at", inventory.inventoryVersion, blockers);
  const evidenceCutoff = checkedDate(inventory.baseline.evidenceCutoff, "baseline_evidence_cutoff", inventory.baseline.commit, blockers);
  const reviewDueAt = checkedDate(inventory.baseline.reviewDueAt, "baseline_review_due_at", inventory.baseline.commit, blockers);
  const trustedNow = now.getTime();
  if (generatedAt !== null && Number.isFinite(trustedNow) && generatedAt > trustedNow) {
    blockers.push({code: "snapshot_generated_in_future", subjectRef: inventory.inventoryVersion});
  }
  if (evidenceCutoff !== null && Number.isFinite(trustedNow) && evidenceCutoff > trustedNow) {
    blockers.push({code: "evidence_cutoff_in_future", subjectRef: inventory.baseline.commit});
  }
  if (generatedAt !== null && evidenceCutoff !== null && evidenceCutoff > generatedAt) {
    blockers.push({code: "evidence_cutoff_after_generation", subjectRef: inventory.inventoryVersion});
  }
  if (generatedAt !== null && reviewDueAt !== null
    && (reviewDueAt <= generatedAt || reviewDueAt - generatedAt > contract.maximumReviewWindowMs)) {
    blockers.push({code: "baseline_review_window_exceeds_policy", subjectRef: inventory.inventoryVersion});
  }
  const latestEvidenceCapture = Math.max(...inventory.evidenceIndex.map((evidence) => new Date(evidence.capturedAt).getTime()));
  if (evidenceCutoff !== null && Number.isFinite(latestEvidenceCapture) && evidenceCutoff !== latestEvidenceCapture) {
    blockers.push({code: "evidence_cutoff_not_derived_from_manifest", subjectRef: inventory.baseline.commit});
  }
}

function entityRelationshipProjection(entity: GovernedInventoryEntity) {
  return {evidenceRefs: entity.evidenceRefs, gapRefs: entity.gapRefs, controlIds: entity.controlIds};
}

function gapRelationshipProjection(gap: SecurityInventoryGap) {
  return {severity: gap.severity, targetRefs: gap.targetRefs, evidenceRefs: gap.evidenceRefs, controlIds: gap.controlIds};
}

function validateCanonicalRelationshipCatalogues(
  inventory: SecurityCurrentStateInventory,
  blockers: SecurityInventoryIssue[],
) {
  const actualEntities = new Map(entityEntries(inventory));
  for (const [entityId, expected] of Object.entries(canonicalSecurityEntityRelationships)) {
    const actual = actualEntities.get(entityId);
    if (!actual) blockers.push({code: "canonical_entity_missing", subjectRef: entityId});
    else if (stableJson(entityRelationshipProjection(actual)) !== stableJson(expected)) {
      blockers.push({code: "canonical_entity_relationship_mismatch", subjectRef: entityId});
    }
  }
  for (const entityId of actualEntities.keys()) {
    if (!canonicalSecurityEntityRelationships[entityId]) blockers.push({code: "unexpected_governed_entity", subjectRef: entityId});
  }

  const actualGaps = new Map(inventory.gaps.map((gap) => [gap.gapId, gap]));
  for (const [gapId, expected] of Object.entries(canonicalSecurityGapRelationships)) {
    const actual = actualGaps.get(gapId);
    if (!actual) blockers.push({code: "canonical_gap_missing", subjectRef: gapId});
    else if (stableJson(gapRelationshipProjection(actual)) !== stableJson(expected)) {
      blockers.push({code: "canonical_gap_relationship_mismatch", subjectRef: gapId});
    }
  }
  for (const gapId of actualGaps.keys()) {
    if (!canonicalSecurityGapRelationships[gapId]) blockers.push({code: "unexpected_gap", subjectRef: gapId});
  }
}

function entityRelationshipIsCanonical(entityId: string, entity: GovernedInventoryEntity | undefined): boolean {
  const expected = canonicalSecurityEntityRelationships[entityId];
  return Boolean(expected && entity && stableJson(entityRelationshipProjection(entity)) === stableJson(expected));
}

function gapRelationshipIsCanonical(gapId: string, gap: SecurityInventoryGap | undefined): boolean {
  const expected = canonicalSecurityGapRelationships[gapId];
  return Boolean(expected && gap && stableJson(gapRelationshipProjection(gap)) === stableJson(expected));
}

function deriveEntityAssessments(
  inventory: SecurityCurrentStateInventory,
  resolvedEvidenceIds: Set<string>,
): SecurityInventoryDecision["entityAssessments"] {
  const actual = new Map(entityEntries(inventory));
  return Object.entries(canonicalSecurityEntityRelationships).map(([entityId, relationship]) => {
    const contractValid = entityRelationshipIsCanonical(entityId, actual.get(entityId));
    const evidenceResolved = relationship.evidenceRefs.every((evidenceRef) => resolvedEvidenceIds.has(evidenceRef));
    return {
      entityId,
      status: !contractValid ? "coverage_contract_invalid" as const
        : !evidenceResolved ? "unknown" as const
        : relationship.gapRefs.length > 0 ? "partial" as const
          : "verified" as const,
      evidenceRefs: [...relationship.evidenceRefs],
      gapRefs: [...relationship.gapRefs],
      controlIds: [...relationship.controlIds],
    };
  });
}

function deriveGapAssessments(
  inventory: SecurityCurrentStateInventory,
): SecurityInventoryDecision["gapAssessments"] {
  const actual = new Map(inventory.gaps.map((gap) => [gap.gapId, gap]));
  return Object.entries(canonicalSecurityGapRelationships).map(([gapId, relationship]) => ({
    gapId,
    status: gapRelationshipIsCanonical(gapId, actual.get(gapId)) ? "open" as const : "coverage_contract_invalid" as const,
    severity: relationship.severity,
    targetRefs: [...relationship.targetRefs],
    evidenceRefs: [...relationship.evidenceRefs],
    controlIds: [...relationship.controlIds],
  }));
}

function deriveClaimAssessments(
  inventory: SecurityCurrentStateInventory,
  resolvedEvidenceIds: Set<string>,
): SecurityInventoryDecision["claimAssessments"] {
  const gapById = new Map(inventory.gaps.map((gap) => [gap.gapId, gap]));
  return canonicalSecurityCoverageCatalogue.map((claim) => {
    const declaredClaim = inventory.coverageClaims.find((candidate) => candidate.claimId === claim.claimId);
    const evidenceRefs = claim.evidenceRequirements.map((requirement) => requirement.evidenceRef);
    const openGapRefs = claim.requiredGaps.map((requiredGap) => requiredGap.gapRef);
    const evidenceResolved = evidenceRefs.every((evidenceRef) => resolvedEvidenceIds.has(evidenceRef));
    const coverageContractValid = declaredClaim !== undefined
      && stableJson(declaredClaim) === stableJson(claim)
      && claim.requiredGaps.every((requiredGap) => {
        const actual = gapById.get(requiredGap.gapRef);
        return actual?.severity === requiredGap.severity && gapRelationshipIsCanonical(requiredGap.gapRef, actual);
      });
    return {
      claimId: claim.claimId,
      domain: claim.domain,
      status: !coverageContractValid ? "coverage_contract_invalid" as const
        : !evidenceResolved ? "evidence_unresolved" as const
        : openGapRefs.length > 0 ? "blocked_by_open_gaps" as const
          : "covered_without_open_gap" as const,
      evidenceRefs,
      openGapRefs,
    };
  });
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
