import type {
  SecurityCurrentStateInventory,
  SecurityInventoryEvidence,
  SecurityOwner,
} from "./security-current-state";
import {
  createCanonicalSecurityCoverageCatalogue,
  securityCurrentStateInventorySchema,
} from "./security-current-state.ts";
import {createCanonicalSecurityEvidenceManifest} from "./security-current-state-canonical.ts";
import {
  securityAssuranceMilestoneSchema,
  securityAssuranceStatementSchema,
  createSecurityAssuranceScopeFingerprint,
  type SecurityAssuranceScope,
} from "./security-assurance-statements.ts";

const baselineCommit = "b2e389757995859cf6a0b250e051d83ba0b53163";
const capturedAt = "2026-09-07T09:43:00.000-03:00";

const currentAssuranceScopeSeed = {
  scopeId: "offroad-platform-current-inventory",
  environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING"],
  systemRefs: ["SYS-WEB", "SYS-SUPABASE", "SYS-WORKER", "SYS-GITHUB"],
};
const currentAssuranceScope: SecurityAssuranceScope = {
  ...currentAssuranceScopeSeed,
  scopeFingerprint: createSecurityAssuranceScopeFingerprint(currentAssuranceScopeSeed),
};

/** Current external-assurance truth. No attestation evidence or trusted assessor root exists. */
export const currentSecurityAssuranceStatements = deepFreezeAssuranceRecords([
  securityAssuranceStatementSchema.parse({statementId: "ASSURANCE-SOC2-TYPE2", claim: "soc2_type2_examined", status: "not_certified", scope: currentAssuranceScope, evidenceRef: null, issuedAt: null, validThrough: null}),
  securityAssuranceStatementSchema.parse({statementId: "ASSURANCE-ISO27001", claim: "iso27001_certified", status: "not_certified", scope: currentAssuranceScope, evidenceRef: null, issuedAt: null, validThrough: null}),
  securityAssuranceStatementSchema.parse({statementId: "ASSURANCE-PENTEST", claim: "penetration_test_passed", status: "not_independently_audited", scope: currentAssuranceScope, evidenceRef: null, issuedAt: null, validThrough: null}),
  securityAssuranceStatementSchema.parse({statementId: "ASSURANCE-PRODUCTION-AUDIT", claim: "production_independently_audited", status: "not_independently_audited", scope: currentAssuranceScope, evidenceRef: null, issuedAt: null, validThrough: null}),
]);

/** Program milestones are not assurance claims and cannot be rendered as certification. */
export const currentSecurityAssuranceMilestones = deepFreezeAssuranceRecords([
  securityAssuranceMilestoneSchema.parse({milestoneId: "ASSURANCE-MILESTONE-REMEDIATION-PLAN", framework: "soc2", kind: "remediation_plan", status: "completed", scope: currentAssuranceScope, evidenceRef: "SEV-SECURITY-PLAN"}),
  securityAssuranceMilestoneSchema.parse({milestoneId: "ASSURANCE-MILESTONE-ISO-GAP", framework: "iso27001", kind: "gap_assessment", status: "planned", scope: currentAssuranceScope, evidenceRef: null}),
  securityAssuranceMilestoneSchema.parse({milestoneId: "ASSURANCE-MILESTONE-PENTEST", framework: "penetration_test", kind: "external_engagement", status: "planned", scope: currentAssuranceScope, evidenceRef: null}),
]);

function deepFreezeAssuranceRecords<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreezeAssuranceRecords(child);
  return Object.freeze(value);
}

const owner = (ownerRole: string, backupOwnerRole: string): SecurityOwner => ({
  ownerRole,
  backupOwnerRole,
  assignment: "functional_role_only",
});

const canonicalEvidenceById = new Map(
  createCanonicalSecurityEvidenceManifest().map((item) => [item.evidenceId, item]),
);

const evidence = (
  evidenceId: string,
  kind: SecurityInventoryEvidence["kind"],
  ref: string,
  description: string,
): SecurityInventoryEvidence => ({
  ...requiredCanonicalEvidence(evidenceId, kind, ref),
  description,
});

function requiredCanonicalEvidence(
  evidenceId: string,
  kind: SecurityInventoryEvidence["kind"],
  ref: string,
): Omit<SecurityInventoryEvidence, "description"> {
  const canonical = canonicalEvidenceById.get(evidenceId);
  if (!canonical || canonical.kind !== kind || canonical.ref !== ref) {
    throw new Error(`Evidence ${evidenceId} is absent from or conflicts with the canonical manifest.`);
  }
  return canonical;
}

const evidenceIndex: SecurityCurrentStateInventory["evidenceIndex"] = [
  evidence("SEV-AGENTS-SCOPE", "repository_file", "AGENTS.md", "Repository operating rules and observed deployment boundaries."),
  evidence("SEV-SECURITY-PLAN", "design_reference", "docs/security/ENTERPRISE_SECURITY_COMPLIANCE_READINESS_PLAN.md", "Security readiness design reference; this is not proof of current operation."),
  evidence("SEV-ENV-NAMES", "configuration", ".env.example", "Configuration names and secret-store expectations without secret values."),
  evidence("SEV-WORKER-TASK", "configuration", "apps/document-worker/task-definition.json", "Worker runtime, role names, provider switches and secret references by name."),
  evidence("SEV-WORKER-RUNTIME", "repository_file", "apps/document-worker/src/main.ts", "Worker authentication, capability use, logging and provider wiring."),
  evidence("SEV-WORKER-CONFIG", "repository_file", "apps/document-worker/src/config.ts", "Fail-closed worker configuration and safe configuration description."),
  evidence("SEV-DEPLOY-WORKER", "configuration", ".github/workflows/deploy-worker.yml", "OIDC-based worker build and deployment workflow."),
  evidence("SEV-EVAL-EXTRACTION", "configuration", ".github/workflows/measure-extraction.yml", "Evaluation workflow using a dedicated OIDC role and model-provider credentials retrieved at run time."),
  evidence("SEV-EVAL-INTENT", "configuration", ".github/workflows/intent-router-gold.yml", "Intent-router gold workflow using a dedicated OIDC role and model-provider credentials retrieved at run time."),
  evidence("SEV-EVAL-CLASSIFICATION", "configuration", ".github/workflows/measure-classification.yml", "Classification evaluation workflow using a dedicated OIDC role and model-provider credentials retrieved at run time."),
  evidence("SEV-EVAL-GOLD", "configuration", ".github/workflows/gold-baseline.yml", "Gold-baseline workflow using a dedicated OIDC role and model-provider credentials retrieved at run time."),
  evidence("SEV-EVAL-PROBE", "configuration", ".github/workflows/probe-structured-output.yml", "Structured-output probe using a dedicated OIDC role and an Anthropic credential retrieved at run time."),
  evidence("SEV-EVAL-CODEX", "configuration", ".github/workflows/codex-review.yml", "Independent review workflow using a dedicated OIDC role and an OpenAI credential retrieved at run time."),
  evidence("SEV-EVAL-LIVE-GATE", "configuration", ".github/workflows/live-preview-gate.yml", "Live preview gate using a dedicated OIDC role and Anthropic and optional Perplexity credentials retrieved at run time."),
  evidence("SEV-QUALITY-WORKFLOW", "configuration", ".github/workflows/quality.yml", "Quality, database and application test workflow definition."),
  evidence("SEV-CODEOWNERS", "configuration", ".github/CODEOWNERS", "Repository ownership boundary; live privileged grants and factors remain outside this file."),
  evidence("SEV-SECURITY-WORKFLOW", "configuration", ".github/workflows/security.yml", "CodeQL, dependency review, repository scan, SBOM and image scan workflow."),
  evidence("SEV-SUPABASE-CONFIG", "configuration", "supabase/config.toml", "Local Supabase Auth, database and storage baseline."),
  evidence("SEV-RLS-TEST", "automated_test", "supabase/tests/rls_non_interference.sql", "Tenant non-interference and authorization regression suite."),
  evidence("SEV-MODEL-DATA-POLICY", "repository_file", "packages/model-gateway/src/data-policy.ts", "Provider data policy contract and fail-closed evaluator implementation."),
  evidence("SEV-MODEL-DATA-POLICY-TEST", "automated_test", "packages/model-gateway/src/index.test.ts", "Regression tests for provider data-policy decisions."),
  evidence("SEV-MODEL-POLICY", "configuration", "packages/model-gateway/src/policy.ts", "Model routing, allowlist, fallback and workload limits."),
  evidence("SEV-PUBLIC-RESEARCH", "repository_file", "packages/public-research/src/source-registry.ts", "Known public research providers and activation configuration."),
  evidence("SEV-WEB-OBSERVABILITY", "configuration", "apps/web/src/instrumentation-client.ts", "Conditional Sentry and PostHog configuration with privacy restrictions."),
  evidence("SEV-WEB-UPLOAD", "repository_file", "apps/web/src/lib/intake/upload-client.ts", "Browser-to-private-storage document upload path."),
  evidence("SEV-WEB-DEPENDENCIES", "repository_file", "apps/web/package.json", "Web runtime and direct software dependencies."),
  evidence("SEV-LOCKFILE", "configuration", "pnpm-lock.yaml", "Pinned dependency resolution, including external package sources."),
  evidence("SEV-CASE-RENDER", "repository_file", "packages/case-render/src/html.ts", "Generated HTML material and its external font-loading boundary."),
  evidence("SEV-ROLLOUT-ORDER", "repository_file", "docs/build/ACCEPTANCE_EVIDENCE.md", "Recorded rollout where hosted migrations had to be reconciled before the worker could safely continue."),
  evidence("SEV-AWS-DEPLOY-ROLE-SNAPSHOT", "operator_observation", "docs/security/evidence/aws-worker-rollout-diagnostics-2026-09-07.json", "Unverified operator observation about an earlier rollout diagnostic failure; effective IAM permissions remain unknown until a policy and simulation receipt are collected."),
];

const environments = [
  {
    environmentId: "ENV-PRODUCTION", title: "Production", classification: "production",
    purpose: "Customer-facing web, data platform and document worker runtime.",
    region: "Supabase and AWS are documented as sa-east-1; other provider regions require verification.", customerDataPolicy: "allowed",
    owner: owner("Platform engineering owner", "Security operations owner"), evidenceRefs: ["SEV-AGENTS-SCOPE", "SEV-WORKER-TASK"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-REGION-MAP", "SG-SCHEMA-BEFORE-CODE", "SG-ENV-DATA-MAPPING"], controlIds: ["TRUST-CLOUD-01", "TRUST-CLOUD-02", "TRUST-DATA-02"],
  },
  {
    environmentId: "ENV-STAGING", title: "Staging", classification: "non_production_isolated",
    purpose: "Data-less schema and control validation before production promotion.", region: "Unknown until live verification.", customerDataPolicy: "prohibited",
    owner: owner("Platform engineering owner", "Data security owner"), evidenceRefs: ["SEV-AGENTS-SCOPE", "SEV-QUALITY-WORKFLOW"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-ENV-SEPARATION", "SG-ENV-DATA-MAPPING"], controlIds: ["TRUST-CLOUD-01", "TRUST-CLOUD-02", "TRUST-DATA-01"],
  },
  {
    environmentId: "ENV-PREVIEW", title: "Vercel preview", classification: "non_production_connected",
    purpose: "Branch preview of the web application.", region: "Unknown until live verification.", customerDataPolicy: "unknown",
    owner: owner("Web platform owner", "Platform engineering owner"), evidenceRefs: ["SEV-AGENTS-SCOPE"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-ENV-SEPARATION", "SG-ENV-DATA-MAPPING"], controlIds: ["TRUST-CLOUD-02", "TRUST-DATA-02"],
  },
  {
    environmentId: "ENV-CI", title: "CI", classification: "ci_ephemeral",
    purpose: "Automated build, test, security scan and release evidence.", region: "GitHub-hosted runner location is not fixed here.", customerDataPolicy: "prohibited",
    owner: owner("Engineering governance owner", "Product security owner"), evidenceRefs: ["SEV-QUALITY-WORKFLOW", "SEV-SECURITY-WORKFLOW", "SEV-EVAL-GOLD", "SEV-EVAL-LIVE-GATE"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-ENV-SEPARATION", "SG-VENDOR-ASSURANCE", "SG-PROVIDER-ASSURANCE", "SG-PRIVILEGED-ACCESS", "SG-ASSET-DISCOVERY", "SG-ENV-DATA-MAPPING"], controlIds: ["TRUST-SDLC-01", "TRUST-SDLC-02", "TRUST-CLOUD-02", "TRUST-AI-01", "TRUST-DATA-03"],
  },
  {
    environmentId: "ENV-DEVELOPMENT", title: "Developer environment", classification: "local_development",
    purpose: "Local engineering and test work.", region: null, customerDataPolicy: "prohibited",
    owner: owner("Engineering governance owner", "Product security owner"), evidenceRefs: ["SEV-AGENTS-SCOPE", "SEV-ENV-NAMES"],
    gapRefs: ["SG-ENDPOINTS", "SG-ENV-SEPARATION", "SG-ENV-DATA-MAPPING"], controlIds: ["TRUST-CLOUD-02", "TRUST-PEOPLE-01", "TRUST-DATA-03"],
  },
  {
    environmentId: "ENV-EXTERNAL", title: "External service boundary", classification: "external_service",
    purpose: "SaaS and model-provider processing outside Offroad-managed infrastructure.", region: null, customerDataPolicy: "unknown",
    owner: owner("Vendor risk owner", "Privacy owner"), evidenceRefs: ["SEV-SECURITY-PLAN", "SEV-MODEL-DATA-POLICY"],
    gapRefs: ["SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-PROVIDER-ASSURANCE", "SG-ENV-DATA-MAPPING"], controlIds: ["TRUST-VENDOR-01", "TRUST-AI-01", "TRUST-DATA-04"],
  },
];

const dataClasses = [
  {
    dataClassId: "public", title: "Public information", description: "Issuer filings and other information intentionally public.",
    handlingRule: "Use only for the declared task and retain source provenance.", declaredHandlingEnvironmentRefs: environments.map((item) => item.environmentId), externalUseRequiresApproval: false,
    owner: owner("Data governance owner", "AI governance owner"), evidenceRefs: ["SEV-PUBLIC-RESEARCH", "SEV-MODEL-DATA-POLICY"], gapRefs: ["SG-DATA-LIFECYCLE"], controlIds: ["TRUST-DATA-02", "TRUST-AI-01"],
  },
  {
    dataClassId: "internal_operational", title: "Internal operational data", description: "Operational metadata, job state and non-customer business records.",
    handlingRule: "Restrict by role and purpose; do not place in public artifacts.", declaredHandlingEnvironmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-CI", "ENV-DEVELOPMENT"], externalUseRequiresApproval: true,
    owner: owner("Data governance owner", "Platform engineering owner"), evidenceRefs: ["SEV-WORKER-RUNTIME", "SEV-SUPABASE-CONFIG"], gapRefs: ["SG-DATA-LIFECYCLE"], controlIds: ["TRUST-DATA-02", "TRUST-DATA-03"],
  },
  {
    dataClassId: "personal_data", title: "Personal data", description: "Account identity, contact and professional-profile information tied to a person.",
    handlingRule: "Process only for a documented purpose with rights and lifecycle controls.", declaredHandlingEnvironmentRefs: ["ENV-PRODUCTION"], externalUseRequiresApproval: true,
    owner: owner("Privacy owner", "Data governance owner"), evidenceRefs: ["SEV-SUPABASE-CONFIG", "SEV-SECURITY-PLAN"], gapRefs: ["SG-DATA-LIFECYCLE", "SG-PRIVACY-RECORDS"], controlIds: ["TRUST-DATA-02", "TRUST-DATA-04"],
  },
  {
    dataClassId: "customer_confidential", title: "Customer confidential information", description: "Non-public documents, prompts, cases, outputs and communications.",
    handlingRule: "Keep tenant-scoped and route externally only through an approved data-policy decision.", declaredHandlingEnvironmentRefs: ["ENV-PRODUCTION"], externalUseRequiresApproval: true,
    owner: owner("Data security owner", "Privacy owner"), evidenceRefs: ["SEV-RLS-TEST", "SEV-MODEL-DATA-POLICY"], gapRefs: ["SG-DATA-LIFECYCLE", "SG-PROVIDER-ASSURANCE"], controlIds: ["TRUST-DATA-01", "TRUST-DATA-02", "TRUST-AI-01"],
  },
  {
    dataClassId: "restricted_financial", title: "Restricted financial information", description: "Financial models, debt terms, mandates, projections and investment analysis.",
    handlingRule: "Apply customer-confidential controls plus explicit task authorization and traceability.", declaredHandlingEnvironmentRefs: ["ENV-PRODUCTION"], externalUseRequiresApproval: true,
    owner: owner("Data security owner", "Credit product owner"), evidenceRefs: ["SEV-RLS-TEST", "SEV-MODEL-DATA-POLICY"], gapRefs: ["SG-DATA-LIFECYCLE", "SG-PROVIDER-ASSURANCE"], controlIds: ["TRUST-DATA-01", "TRUST-DATA-02", "TRUST-AI-01"],
  },
  {
    dataClassId: "credential_secret", title: "Credentials and secrets", description: "Authentication secrets, provider credentials and workload tokens.",
    handlingRule: "Never commit or log values; use managed stores and rotate on suspected exposure.", declaredHandlingEnvironmentRefs: ["ENV-PRODUCTION", "ENV-CI", "ENV-DEVELOPMENT"], externalUseRequiresApproval: true,
    owner: owner("Platform security owner", "Security operations owner"), evidenceRefs: ["SEV-ENV-NAMES", "SEV-DEPLOY-WORKER", "SEV-WORKER-CONFIG"], gapRefs: ["SG-PRIVILEGED-ACCESS"], controlIds: ["TRUST-DATA-03", "TRUST-ID-01"],
  },
  {
    dataClassId: "security_evidence", title: "Security evidence", description: "Configuration snapshots, logs, findings, tests and audit-preparation records.",
    handlingRule: "Protect integrity, access, retention and separation from customer content.", declaredHandlingEnvironmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-CI", "ENV-DEVELOPMENT"], externalUseRequiresApproval: true,
    owner: owner("Security governance owner", "Engineering governance owner"), evidenceRefs: ["SEV-SECURITY-WORKFLOW", "SEV-SECURITY-PLAN"], gapRefs: ["SG-DATA-LIFECYCLE"], controlIds: ["TRUST-GOV-02", "TRUST-OPS-01", "TRUST-SDLC-01"],
  },
];

// Systems, stores, flows, identities, vendors and gaps are intentionally explicit below. They
// represent observed integration boundaries, not an assurance claim about live operation.
const systems = [
  {
    systemId: "SYS-WEB", title: "Offroad web application", kind: "application", purpose: "Authenticated workspace, project interaction and document intake.",
    environmentRefs: ["ENV-PRODUCTION", "ENV-PREVIEW", "ENV-DEVELOPMENT", "ENV-CI"], dataClassIds: ["public", "internal_operational", "personal_data", "customer_confidential", "restricted_financial"],
    vendorRefs: ["VEN-VERCEL", "VEN-SUPABASE", "VEN-SENTRY", "VEN-POSTHOG", "VEN-GOOGLE-FONTS"], owner: owner("Web platform owner", "Application security owner"),
    evidenceRefs: ["SEV-AGENTS-SCOPE", "SEV-WEB-DEPENDENCIES", "SEV-WEB-UPLOAD"], gapRefs: ["SG-LIVE-CONFIG", "SG-TELEMETRY-ASSURANCE", "SG-OWNER-ASSIGNMENT", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-APP-01", "TRUST-APP-02", "TRUST-DATA-01"],
  },
  {
    systemId: "SYS-SUPABASE", title: "Supabase data platform", kind: "database_platform", purpose: "Authentication, Postgres, RLS, private storage and database commands.",
    environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-DEVELOPMENT", "ENV-CI"], dataClassIds: ["internal_operational", "personal_data", "customer_confidential", "restricted_financial", "credential_secret", "security_evidence"],
    vendorRefs: ["VEN-SUPABASE"], owner: owner("Data platform owner", "Data security owner"), evidenceRefs: ["SEV-SUPABASE-CONFIG", "SEV-RLS-TEST", "SEV-AGENTS-SCOPE"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-BACKUP-RESTORE", "SG-DATA-LIFECYCLE", "SG-SCHEMA-BEFORE-CODE", "SG-ENV-SEPARATION", "SG-PRIVACY-RECORDS", "SG-OWNER-ASSIGNMENT"], controlIds: ["TRUST-DATA-01", "TRUST-APP-01", "TRUST-OPS-02"],
  },
  {
    systemId: "SYS-WORKER", title: "Document and case worker", kind: "worker", purpose: "Capability-scoped document processing, research, analysis and artifact generation.",
    environmentRefs: ["ENV-PRODUCTION", "ENV-DEVELOPMENT", "ENV-CI"], dataClassIds: ["public", "internal_operational", "customer_confidential", "restricted_financial", "credential_secret", "security_evidence"],
    vendorRefs: ["VEN-AWS", "VEN-SUPABASE", "VEN-ANTHROPIC", "VEN-OPENAI", "VEN-PERPLEXITY", "VEN-FIRECRAWL"], owner: owner("Document platform owner", "Platform engineering owner"),
    evidenceRefs: ["SEV-WORKER-TASK", "SEV-WORKER-RUNTIME", "SEV-WORKER-CONFIG"], gapRefs: ["SG-LIVE-CONFIG", "SG-PROVIDER-ASSURANCE", "SG-SCHEMA-BEFORE-CODE", "SG-OWNER-ASSIGNMENT", "SG-LOGGING-CONTENT-SAFETY", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-DOC-01", "TRUST-DOC-02", "TRUST-AI-01", "TRUST-CLOUD-01"],
  },
  {
    systemId: "SYS-GITHUB", title: "GitHub source and delivery control plane", kind: "delivery_pipeline", purpose: "Source control, pull requests, CI, security analysis and deployment identity.",
    environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "credential_secret", "security_evidence"], vendorRefs: ["VEN-GITHUB", "VEN-AWS", "VEN-ANTHROPIC", "VEN-OPENAI", "VEN-PERPLEXITY", "VEN-SHEETJS-CDN"],
    owner: owner("Engineering governance owner", "Product security owner"), evidenceRefs: ["SEV-QUALITY-WORKFLOW", "SEV-SECURITY-WORKFLOW", "SEV-DEPLOY-WORKER", "SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-PROBE", "SEV-EVAL-CODEX", "SEV-EVAL-LIVE-GATE"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-PRIVILEGED-ACCESS", "SG-PROVIDER-ASSURANCE", "SG-DEPLOY-DIAGNOSTICS", "SG-SCHEMA-BEFORE-CODE", "SG-VENDOR-ASSURANCE", "SG-OWNER-ASSIGNMENT", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-SDLC-01", "TRUST-SDLC-02", "TRUST-DATA-03", "TRUST-AI-01"],
  },
  {
    systemId: "SYS-CODEX-CI", title: "Codex agentic review executor", kind: "worker",
    purpose: "Execute model-directed independent review inside an ephemeral GitHub-hosted runner with danger-full-access to the checked-out workspace and outbound network access.",
    environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "credential_secret", "security_evidence"],
    vendorRefs: ["VEN-GITHUB", "VEN-AWS", "VEN-OPENAI"], owner: owner("AI governance owner", "Product security owner"),
    evidenceRefs: ["SEV-EVAL-CODEX"], gapRefs: ["SG-CODEX-CI-AGENT-BOUNDARY"], controlIds: ["TRUST-AI-01", "TRUST-AI-02", "TRUST-DATA-03", "TRUST-SDLC-01", "TRUST-CLOUD-02"],
  },
  {
    systemId: "SYS-OBSERVABILITY", title: "Application observability", kind: "observability", purpose: "Error, performance and allowlisted product-health telemetry when configured.",
    environmentRefs: ["ENV-PRODUCTION", "ENV-PREVIEW", "ENV-DEVELOPMENT", "ENV-EXTERNAL"], dataClassIds: ["internal_operational", "personal_data", "security_evidence"], vendorRefs: ["VEN-SENTRY", "VEN-POSTHOG"],
    owner: owner("Security operations owner", "Web platform owner"), evidenceRefs: ["SEV-WEB-OBSERVABILITY", "SEV-ENV-NAMES"], gapRefs: ["SG-LIVE-CONFIG", "SG-TELEMETRY-ASSURANCE", "SG-OWNER-ASSIGNMENT"],
    controlIds: ["TRUST-OPS-01", "TRUST-DATA-04", "TRUST-VENDOR-01"],
  },
  {
    systemId: "SYS-AUTH-EMAIL", title: "Authentication email delivery", kind: "email", purpose: "Verification and account-recovery email through Supabase Auth; the live delivery provider is unresolved.",
    environmentRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL"], dataClassIds: ["personal_data", "internal_operational"], vendorRefs: ["VEN-SUPABASE", "VEN-SMTP-UNKNOWN"],
    owner: owner("Identity owner", "Privacy owner"), evidenceRefs: ["SEV-SUPABASE-CONFIG", "SEV-SECURITY-PLAN"], gapRefs: ["SG-LIVE-CONFIG", "SG-VENDOR-ASSURANCE", "SG-PRIVACY-RECORDS", "SG-OWNER-ASSIGNMENT"],
    controlIds: ["TRUST-ID-01", "TRUST-DATA-04", "TRUST-VENDOR-01"],
  },
  {
    systemId: "SYS-ENDPOINTS", title: "Developer and administrator endpoints", kind: "developer_endpoint", purpose: "Human access to source, cloud consoles and engineering tools.",
    environmentRefs: ["ENV-DEVELOPMENT", "ENV-EXTERNAL"], dataClassIds: ["internal_operational", "credential_secret", "security_evidence"], vendorRefs: [],
    owner: owner("People operations owner", "Product security owner"), evidenceRefs: ["SEV-AGENTS-SCOPE", "SEV-SECURITY-PLAN"], gapRefs: ["SG-ENDPOINTS", "SG-PRIVILEGED-ACCESS", "SG-OWNER-ASSIGNMENT"], controlIds: ["TRUST-PEOPLE-01", "TRUST-ID-01", "TRUST-DATA-03"],
  },
];

const dataStores = [
  {
    storeId: "STORE-POSTGRES", title: "Supabase Postgres", systemRef: "SYS-SUPABASE", environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-DEVELOPMENT", "ENV-CI"],
    dataClassIds: ["internal_operational", "personal_data", "customer_confidential", "restricted_financial", "security_evidence"], tenancyBoundary: "Organization and project policies plus private database commands; live completeness is unverified.",
    retentionState: "unknown", backupState: "provider_managed_unverified", owner: owner("Data platform owner", "Data security owner"), evidenceRefs: ["SEV-RLS-TEST", "SEV-SUPABASE-CONFIG"],
    gapRefs: ["SG-DATA-LIFECYCLE", "SG-BACKUP-RESTORE", "SG-LIVE-CONFIG", "SG-PRIVACY-RECORDS"], controlIds: ["TRUST-DATA-01", "TRUST-DATA-02", "TRUST-OPS-02"],
  },
  {
    storeId: "STORE-OBJECTS", title: "Supabase private object storage", systemRef: "SYS-SUPABASE", environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-DEVELOPMENT", "ENV-CI"],
    dataClassIds: ["customer_confidential", "restricted_financial", "security_evidence"], tenancyBoundary: "Private buckets and signed URLs are observed in code; complete live policy state is unverified.",
    retentionState: "unknown", backupState: "provider_managed_unverified", owner: owner("Data platform owner", "Document platform owner"), evidenceRefs: ["SEV-WEB-UPLOAD", "SEV-RLS-TEST"],
    gapRefs: ["SG-DATA-LIFECYCLE", "SG-BACKUP-RESTORE", "SG-LIVE-CONFIG"], controlIds: ["TRUST-DATA-01", "TRUST-DATA-02", "TRUST-OPS-02"],
  },
  {
    storeId: "STORE-CLOUDWATCH", title: "Worker operational logs", systemRef: "SYS-WORKER", environmentRefs: ["ENV-PRODUCTION"], dataClassIds: ["internal_operational", "security_evidence"],
    tenancyBoundary: "Logs are intended to exclude customer content, but direct error-message paths are not comprehensively governed or tested.", retentionState: "unknown", backupState: "unknown",
    owner: owner("Security operations owner", "Platform engineering owner"), evidenceRefs: ["SEV-WORKER-TASK", "SEV-WORKER-RUNTIME"], gapRefs: ["SG-LIVE-CONFIG", "SG-DATA-LIFECYCLE", "SG-LOGGING-CONTENT-SAFETY"], controlIds: ["TRUST-OPS-01", "TRUST-DATA-02", "TRUST-CLOUD-01"],
  },
  {
    storeId: "STORE-TELEMETRY", title: "External application telemetry", systemRef: "SYS-OBSERVABILITY", environmentRefs: ["ENV-EXTERNAL"], dataClassIds: ["internal_operational", "personal_data", "security_evidence"],
    tenancyBoundary: "Client code applies allowlisting and scrubbing; activation, access and retention are unverified.", retentionState: "unknown", backupState: "unknown",
    owner: owner("Security operations owner", "Privacy owner"), evidenceRefs: ["SEV-WEB-OBSERVABILITY", "SEV-ENV-NAMES"], gapRefs: ["SG-TELEMETRY-ASSURANCE", "SG-LIVE-CONFIG", "SG-DATA-LIFECYCLE"], controlIds: ["TRUST-OPS-01", "TRUST-DATA-04", "TRUST-VENDOR-01"],
  },
  {
    storeId: "STORE-SOURCE", title: "GitHub source and CI artifacts", systemRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "security_evidence"],
    tenancyBoundary: "Repository is documented as public; customer data and secret values are prohibited.", retentionState: "partial", backupState: "provider_managed_unverified",
    owner: owner("Engineering governance owner", "Product security owner"), evidenceRefs: ["SEV-AGENTS-SCOPE", "SEV-SECURITY-WORKFLOW", "SEV-EVAL-CODEX"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-DATA-LIFECYCLE", "SG-CODEX-CI-AGENT-BOUNDARY"], controlIds: ["TRUST-SDLC-01", "TRUST-SDLC-02", "TRUST-DATA-03"],
  },
  {
    storeId: "STORE-AWS-SECRETS", title: "AWS Secrets Manager", systemRef: "SYS-WORKER", environmentRefs: ["ENV-PRODUCTION"], dataClassIds: ["credential_secret"],
    tenancyBoundary: "Named secret references are injected into the worker task; secret values are intentionally absent from this inventory.", retentionState: "unknown", backupState: "provider_managed_unverified",
    owner: owner("Cloud security owner", "Platform security owner"), evidenceRefs: ["SEV-WORKER-TASK", "SEV-DEPLOY-WORKER", "SEV-EVAL-GOLD", "SEV-EVAL-LIVE-GATE"], gapRefs: ["SG-LIVE-CONFIG", "SG-DATA-LIFECYCLE", "SG-PRIVILEGED-ACCESS", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-DATA-03", "TRUST-ID-01", "TRUST-CLOUD-01", "TRUST-GOV-02"],
  },
  {
    storeId: "STORE-ECR", title: "Worker container registry", systemRef: "SYS-WORKER", environmentRefs: ["ENV-PRODUCTION", "ENV-CI"], dataClassIds: ["internal_operational", "security_evidence"],
    tenancyBoundary: "A named ECR repository receives immutable worker images and a mutable latest tag; effective live access and retention are unverified.", retentionState: "unknown", backupState: "provider_managed_unverified",
    owner: owner("Platform engineering owner", "Product security owner"), evidenceRefs: ["SEV-DEPLOY-WORKER", "SEV-WORKER-TASK"], gapRefs: ["SG-LIVE-CONFIG", "SG-DATA-LIFECYCLE", "SG-VENDOR-ASSURANCE"], controlIds: ["TRUST-CLOUD-01", "TRUST-SDLC-01", "TRUST-SDLC-02"],
  },
  {
    storeId: "STORE-CODEX-RUNNER", title: "Ephemeral Codex review workspace and logs", systemRef: "SYS-CODEX-CI", environmentRefs: ["ENV-CI"], dataClassIds: ["internal_operational", "credential_secret", "security_evidence"],
    tenancyBoundary: "One GitHub-hosted job receives a checkout, an OpenAI credential through process environment, unrestricted workspace filesystem access, network egress, command execution and generated review artifacts; isolation beyond runner ephemerality is not proven.",
    retentionState: "partial", backupState: "unknown", owner: owner("Engineering governance owner", "Product security owner"), evidenceRefs: ["SEV-EVAL-CODEX"],
    gapRefs: ["SG-CODEX-CI-AGENT-BOUNDARY"], controlIds: ["TRUST-AI-02", "TRUST-DATA-03", "TRUST-SDLC-01", "TRUST-OPS-01"],
  },
];

const dataFlows = [
  {
    flowId: "FLOW-WEB-DATA", title: "Web application to Supabase", sourceRef: "SYS-WEB", destinationRef: "SYS-SUPABASE", environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-PREVIEW", "ENV-DEVELOPMENT", "ENV-CI"],
    dataClassIds: ["internal_operational", "personal_data", "customer_confidential", "restricted_financial"], purpose: "Authentication, project state, commands and signed storage operations.",
    authorizationBoundary: "Publishable client plus authenticated session; database and storage policies remain authoritative.", direction: "internal", owner: owner("Application security owner", "Data security owner"),
    evidenceRefs: ["SEV-RLS-TEST", "SEV-WEB-UPLOAD"], gapRefs: ["SG-LIVE-CONFIG", "SG-ENV-SEPARATION"], controlIds: ["TRUST-APP-01", "TRUST-DATA-01"],
  },
  {
    flowId: "FLOW-UPLOAD", title: "Browser document upload", sourceRef: "SYS-WEB", destinationRef: "SYS-SUPABASE", environmentRefs: ["ENV-PRODUCTION"], dataClassIds: ["customer_confidential", "restricted_financial"],
    purpose: "Send user-selected files directly to private object storage.", authorizationBoundary: "Tenant-scoped object path and storage policy; worker access uses a separate signed URL.", direction: "outbound",
    owner: owner("Document platform owner", "Data security owner"), evidenceRefs: ["SEV-WEB-UPLOAD", "SEV-RLS-TEST"], gapRefs: ["SG-LIVE-CONFIG", "SG-DATA-LIFECYCLE"], controlIds: ["TRUST-DATA-01", "TRUST-DOC-01"],
  },
  {
    flowId: "FLOW-DATA-WORKER", title: "Supabase job and document access to worker", sourceRef: "SYS-SUPABASE", destinationRef: "SYS-WORKER", environmentRefs: ["ENV-PRODUCTION"],
    dataClassIds: ["internal_operational", "customer_confidential", "restricted_financial", "security_evidence"], purpose: "Claim one job and deliver capability-scoped records and short-lived document access.",
    authorizationBoundary: "Worker credential claims; per-job capability authorizes subsequent commands.", direction: "internal", owner: owner("Data security owner", "Document platform owner"),
    evidenceRefs: ["SEV-WORKER-RUNTIME", "SEV-RLS-TEST"], gapRefs: ["SG-LIVE-CONFIG"], controlIds: ["TRUST-DATA-01", "TRUST-APP-01", "TRUST-DATA-03"],
  },
  {
    flowId: "FLOW-WORKER-ANTHROPIC", title: "Worker to Anthropic", sourceRef: "SYS-WORKER", destinationRef: "VEN-ANTHROPIC", environmentRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL"],
    dataClassIds: ["public", "customer_confidential", "restricted_financial"], purpose: "Task-specific model inference.", authorizationBoundary: "Gateway model allowlist, task policy, budget and optional data-assurance enforcement.",
    direction: "outbound", owner: owner("AI governance owner", "Data security owner"), evidenceRefs: ["SEV-WORKER-RUNTIME", "SEV-MODEL-DATA-POLICY", "SEV-MODEL-POLICY"],
    gapRefs: ["SG-PROVIDER-ASSURANCE", "SG-LIVE-CONFIG"], controlIds: ["TRUST-AI-01", "TRUST-AI-03", "TRUST-DATA-04"],
  },
  {
    flowId: "FLOW-WORKER-OPENAI", title: "Worker to OpenAI", sourceRef: "SYS-WORKER", destinationRef: "VEN-OPENAI", environmentRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL"],
    dataClassIds: ["public", "customer_confidential", "restricted_financial"], purpose: "Task-specific primary, shadow, fallback or optional public-search calls.", authorizationBoundary: "Gateway policy and per-job capability boundary.",
    direction: "outbound", owner: owner("AI governance owner", "Data security owner"), evidenceRefs: ["SEV-MODEL-POLICY", "SEV-MODEL-DATA-POLICY"],
    gapRefs: ["SG-PROVIDER-ASSURANCE", "SG-LIVE-CONFIG"], controlIds: ["TRUST-AI-01", "TRUST-AI-03", "TRUST-DATA-04"],
  },
  {
    flowId: "FLOW-WORKER-RESEARCH", title: "Worker public research", sourceRef: "SYS-WORKER", destinationRef: "VEN-PERPLEXITY", environmentRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL"], dataClassIds: ["public"],
    purpose: "Discover public sources; Firecrawl is a separate acquisition fallback represented in the vendor inventory.", authorizationBoundary: "Research router, source registry, public-source constraint and job budget.", direction: "outbound",
    owner: owner("Research platform owner", "AI governance owner"), evidenceRefs: ["SEV-PUBLIC-RESEARCH", "SEV-WORKER-RUNTIME"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-LIVE-CONFIG"], controlIds: ["TRUST-AI-01", "TRUST-VENDOR-01"],
  },
  {
    flowId: "FLOW-WORKER-FIRECRAWL", title: "Worker public content acquisition", sourceRef: "SYS-WORKER", destinationRef: "VEN-FIRECRAWL", environmentRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL"], dataClassIds: ["public"],
    purpose: "Acquire content from an approved public URL when the optional provider is enabled.", authorizationBoundary: "Public-source router, explicit activation flag, provider credential and job budget.", direction: "outbound",
    owner: owner("Research platform owner", "AI governance owner"), evidenceRefs: ["SEV-PUBLIC-RESEARCH", "SEV-WORKER-RUNTIME", "SEV-ENV-NAMES"], gapRefs: ["SG-PROVIDER-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-LIVE-CONFIG"], controlIds: ["TRUST-AI-01", "TRUST-VENDOR-01"],
  },
  {
    flowId: "FLOW-WEB-TELEMETRY", title: "Web telemetry", sourceRef: "SYS-WEB", destinationRef: "SYS-OBSERVABILITY", environmentRefs: ["ENV-PRODUCTION", "ENV-PREVIEW", "ENV-EXTERNAL"],
    dataClassIds: ["internal_operational", "personal_data", "security_evidence"], purpose: "Report scrubbed errors and allowlisted anonymous product-health events when configured.", authorizationBoundary: "SDK activation plus event allowlist and scrubbing.",
    direction: "outbound", owner: owner("Security operations owner", "Privacy owner"), evidenceRefs: ["SEV-WEB-OBSERVABILITY", "SEV-ENV-NAMES"],
    gapRefs: ["SG-TELEMETRY-ASSURANCE", "SG-LIVE-CONFIG"], controlIds: ["TRUST-OPS-01", "TRUST-DATA-04", "TRUST-VENDOR-01"],
  },
  {
    flowId: "FLOW-AUTH-EMAIL", title: "Authentication email delivery", sourceRef: "SYS-SUPABASE", destinationRef: "VEN-SMTP-UNKNOWN", environmentRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL"], dataClassIds: ["personal_data", "internal_operational"],
    purpose: "Deliver account verification and recovery messages.", authorizationBoundary: "Supabase Auth delivery integration; provider and current live configuration are not captured.", direction: "outbound",
    owner: owner("Identity owner", "Privacy owner"), evidenceRefs: ["SEV-SUPABASE-CONFIG", "SEV-SECURITY-PLAN"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-LIVE-CONFIG", "SG-PRIVACY-RECORDS"], controlIds: ["TRUST-ID-01", "TRUST-DATA-04", "TRUST-VENDOR-01"],
  },
  {
    flowId: "FLOW-GITHUB-AWS", title: "GitHub deployment to AWS", sourceRef: "SYS-GITHUB", destinationRef: "VEN-AWS", environmentRefs: ["ENV-CI", "ENV-PRODUCTION", "ENV-EXTERNAL"],
    dataClassIds: ["internal_operational", "credential_secret", "security_evidence"], purpose: "Exchange OIDC identity for a short-lived AWS session, publish the image and update ECS.", authorizationBoundary: "Named AWS role and no stored AWS key in the workflow.",
    direction: "outbound", owner: owner("Platform engineering owner", "Engineering governance owner"), evidenceRefs: ["SEV-DEPLOY-WORKER", "SEV-WORKER-TASK"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-PRIVILEGED-ACCESS", "SG-DEPLOY-DIAGNOSTICS", "SG-SCHEMA-BEFORE-CODE"], controlIds: ["TRUST-DATA-03", "TRUST-CLOUD-01", "TRUST-SDLC-01"],
  },
  {
    flowId: "FLOW-GITHUB-EVAL-SECRETS", title: "GitHub evaluations to AWS Secrets Manager", sourceRef: "SYS-GITHUB", destinationRef: "VEN-AWS", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["credential_secret", "internal_operational", "security_evidence"], purpose: "Exchange a dedicated evaluation OIDC identity for a short-lived AWS session and retrieve named model-provider credentials during selected workflows.",
    authorizationBoundary: "Dedicated offroadGitHubEvalsRole is named in repository workflows; its trust policy, effective grants, use history and recertification are not independently verified.", direction: "outbound",
    owner: owner("AI governance owner", "Cloud security owner"), evidenceRefs: ["SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-PROBE", "SEV-EVAL-CODEX", "SEV-EVAL-LIVE-GATE"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-PRIVILEGED-ACCESS", "SG-PROVIDER-ASSURANCE", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-ID-01", "TRUST-DATA-03", "TRUST-AI-01", "TRUST-SDLC-01"],
  },
  {
    flowId: "FLOW-GITHUB-EVAL-ANTHROPIC", title: "GitHub evaluations to Anthropic", sourceRef: "SYS-GITHUB", destinationRef: "VEN-ANTHROPIC", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["public", "internal_operational", "security_evidence"], purpose: "Run extraction, routing, classification, gold-baseline, probe and live-preview evaluation workloads against Anthropic.",
    authorizationBoundary: "Workflow-scoped OIDC session and provider secret retrieved at run time; provider assurance, retention and complete prompt-content policy are not verified here.", direction: "outbound",
    owner: owner("AI governance owner", "Engineering governance owner"), evidenceRefs: ["SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-PROBE", "SEV-EVAL-LIVE-GATE"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-PROVIDER-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-AI-01", "TRUST-AI-03", "TRUST-DATA-04", "TRUST-SDLC-01"],
  },
  {
    flowId: "FLOW-GITHUB-EVAL-OPENAI", title: "GitHub evaluations to OpenAI", sourceRef: "SYS-GITHUB", destinationRef: "VEN-OPENAI", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["public", "internal_operational", "security_evidence"], purpose: "Run extraction, routing, classification, gold-baseline and independent code-review workloads against OpenAI.",
    authorizationBoundary: "Workflow-scoped OIDC session and provider secret retrieved at run time; provider assurance, retention and complete prompt-content policy are not verified here.", direction: "outbound",
    owner: owner("AI governance owner", "Engineering governance owner"), evidenceRefs: ["SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-CODEX"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-PROVIDER-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-AI-01", "TRUST-AI-03", "TRUST-DATA-04", "TRUST-SDLC-01"],
  },
  {
    flowId: "FLOW-GITHUB-EVAL-PERPLEXITY", title: "GitHub live-preview gate to Perplexity", sourceRef: "SYS-GITHUB", destinationRef: "VEN-PERPLEXITY", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["public", "internal_operational", "security_evidence"], purpose: "Exercise optional public-research behavior in the live-preview gate when a search credential is available.",
    authorizationBoundary: "Optional provider secret retrieved through the evaluation OIDC session; only public research is intended, but live credential grants and provider terms remain unverified.", direction: "outbound",
    owner: owner("Research platform owner", "AI governance owner"), evidenceRefs: ["SEV-EVAL-LIVE-GATE"], gapRefs: ["SG-LIVE-CONFIG", "SG-PROVIDER-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-ASSET-DISCOVERY"],
    controlIds: ["TRUST-AI-01", "TRUST-VENDOR-01", "TRUST-DATA-04", "TRUST-SDLC-01"],
  },
  {
    flowId: "FLOW-GITHUB-VERCEL", title: "GitHub source to Vercel", sourceRef: "SYS-GITHUB", destinationRef: "VEN-VERCEL", environmentRefs: ["ENV-CI", "ENV-PREVIEW", "ENV-PRODUCTION", "ENV-EXTERNAL"],
    dataClassIds: ["public", "internal_operational", "security_evidence"], purpose: "Build and publish preview or production web deployments.", authorizationBoundary: "Provider-managed source integration; live permissions and provenance require verification.",
    direction: "outbound", owner: owner("Web platform owner", "Engineering governance owner"), evidenceRefs: ["SEV-AGENTS-SCOPE", "SEV-WEB-DEPENDENCIES"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-VENDOR-ASSURANCE"], controlIds: ["TRUST-CLOUD-02", "TRUST-SDLC-01", "TRUST-VENDOR-01"],
  },
  {
    flowId: "FLOW-SHEETJS-SUPPLY", title: "SheetJS package acquisition", sourceRef: "VEN-SHEETJS-CDN", destinationRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational"],
    purpose: "Acquire the pinned spreadsheet package referenced by workspace manifests and the lockfile.", authorizationBoundary: "Pinned package URL and lockfile integrity; vendor assurance and availability are not verified.", direction: "inbound",
    owner: owner("Product security owner", "Engineering governance owner"), evidenceRefs: ["SEV-WEB-DEPENDENCIES", "SEV-LOCKFILE"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-SDLC-02", "TRUST-VENDOR-01"],
  },
  {
    flowId: "FLOW-MATERIAL-GOOGLE-FONTS", title: "Generated material to Google Fonts", sourceRef: "SYS-WEB", destinationRef: "VEN-GOOGLE-FONTS", environmentRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "personal_data"],
    purpose: "Fetch remote typography when generated HTML material is rendered in a networked browser.", authorizationBoundary: "No repository-enforced allowlist, self-hosting or privacy contract is proven.", direction: "outbound",
    owner: owner("Web platform owner", "Privacy owner"), evidenceRefs: ["SEV-CASE-RENDER"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-TELEMETRY-ASSURANCE", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-VENDOR-01", "TRUST-DATA-04", "TRUST-SDLC-02"],
  },
  {
    flowId: "FLOW-GITHUB-CODEX", title: "GitHub workflow to Codex agentic executor", sourceRef: "SYS-GITHUB", destinationRef: "SYS-CODEX-CI", environmentRefs: ["ENV-CI"],
    dataClassIds: ["public", "internal_operational", "credential_secret", "security_evidence"], purpose: "Install and launch Codex against a repository corpus and model-authored review prompt.",
    authorizationBoundary: "Manual workflow dispatch and read-only GitHub token; no repository-enforced command allowlist, filesystem write restriction or egress allowlist is present inside the runner.", direction: "internal",
    owner: owner("AI governance owner", "Product security owner"), evidenceRefs: ["SEV-EVAL-CODEX"], gapRefs: ["SG-CODEX-CI-AGENT-BOUNDARY"], controlIds: ["TRUST-AI-02", "TRUST-SDLC-01", "TRUST-CLOUD-02"],
  },
  {
    flowId: "FLOW-CODEX-AWS-SECRETS", title: "Codex review job to AWS Secrets Manager", sourceRef: "SYS-CODEX-CI", destinationRef: "VEN-AWS", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["credential_secret", "internal_operational"], purpose: "Exchange GitHub OIDC for the evaluation role and retrieve the OpenAI credential into the job environment.",
    authorizationBoundary: "Workflow names the OIDC role and masks the retrieved value, but effective IAM grants, process-level secret isolation and denial to the agentic child process are not proven.", direction: "outbound",
    owner: owner("Cloud security owner", "AI governance owner"), evidenceRefs: ["SEV-EVAL-CODEX"], gapRefs: ["SG-CODEX-CI-AGENT-BOUNDARY"], controlIds: ["TRUST-ID-01", "TRUST-DATA-03", "TRUST-AI-02"],
  },
  {
    flowId: "FLOW-CODEX-SOURCE", title: "Codex review executor to repository and review artifacts", sourceRef: "SYS-CODEX-CI", destinationRef: "STORE-SOURCE", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["public", "internal_operational", "credential_secret", "security_evidence"], purpose: "Read the checked-out repository and emit review text, command output, logs and artifacts into the GitHub-controlled job boundary.",
    authorizationBoundary: "The repository prohibits committed secrets, but danger-full-access can read and write the workspace; corpus, command output and artifact content are not restricted by an enforced allowlist.", direction: "internal",
    owner: owner("AI governance owner", "Product security owner"), evidenceRefs: ["SEV-EVAL-CODEX"], gapRefs: ["SG-CODEX-CI-AGENT-BOUNDARY"], controlIds: ["TRUST-AI-02", "TRUST-DATA-03", "TRUST-SDLC-01", "TRUST-OPS-01"],
  },
  {
    flowId: "FLOW-CODEX-OPENAI", title: "Codex review job to OpenAI", sourceRef: "SYS-CODEX-CI", destinationRef: "VEN-OPENAI", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["public", "internal_operational", "credential_secret", "security_evidence"], purpose: "Send the review prompt, accessible repository corpus and tool context to the Codex service and receive tool-directed output; credential exposure remains a modeled risk until isolation is enforced.",
    authorizationBoundary: "The workflow selects model and effort but does not enforce an outbound destination allowlist, prompt-injection boundary, tool allowlist or provider assurance receipt.", direction: "outbound",
    owner: owner("AI governance owner", "Data security owner"), evidenceRefs: ["SEV-EVAL-CODEX"], gapRefs: ["SG-CODEX-CI-AGENT-BOUNDARY"], controlIds: ["TRUST-AI-01", "TRUST-AI-02", "TRUST-DATA-04"],
  },
  {
    flowId: "FLOW-NPM-SUPPLY", title: "npm registry package acquisition", sourceRef: "VEN-NPM-REGISTRY", destinationRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational"],
    purpose: "Install pnpm dependencies and the pinned Codex CLI from the npm registry.", authorizationBoundary: "Lockfile and selected package versions are repository-visible; registry identity, install-script behavior and provenance verification are incomplete.", direction: "inbound",
    owner: owner("Product security owner", "Engineering governance owner"), evidenceRefs: ["SEV-LOCKFILE", "SEV-EVAL-CODEX"], gapRefs: ["SG-ASSET-DISCOVERY"], controlIds: ["TRUST-SDLC-02", "TRUST-VENDOR-01"],
  },
  {
    flowId: "FLOW-GITHUB-ACTIONS-SUPPLY", title: "GitHub Actions component acquisition", sourceRef: "VEN-GITHUB-ACTIONS", destinationRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "credential_secret", "security_evidence"],
    purpose: "Execute commit-pinned third-party and GitHub-maintained workflow actions.", authorizationBoundary: "Action revisions are pinned, but publisher assurance, transitive code and periodic provenance review remain incomplete.", direction: "inbound",
    owner: owner("Product security owner", "Engineering governance owner"), evidenceRefs: ["SEV-QUALITY-WORKFLOW", "SEV-SECURITY-WORKFLOW", "SEV-EVAL-CODEX"], gapRefs: ["SG-ASSET-DISCOVERY"], controlIds: ["TRUST-SDLC-02", "TRUST-VENDOR-01"],
  },
  {
    flowId: "FLOW-SUPABASE-LOCAL-IMAGES", title: "Supabase local container image acquisition", sourceRef: "VEN-SUPABASE-LOCAL-IMAGES", destinationRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "security_evidence"],
    purpose: "Acquire database, auth, storage and related containers used by the local Supabase CI stack.", authorizationBoundary: "CLI version is pinned; exact image registry, digest inventory and image attestation are not captured here.", direction: "inbound",
    owner: owner("Product security owner", "Data platform owner"), evidenceRefs: ["SEV-QUALITY-WORKFLOW", "SEV-SUPABASE-CONFIG"], gapRefs: ["SG-ASSET-DISCOVERY"], controlIds: ["TRUST-SDLC-02", "TRUST-CLOUD-02", "TRUST-VENDOR-01"],
  },
  {
    flowId: "FLOW-PLAYWRIGHT-BROWSERS", title: "Playwright browser binary acquisition", sourceRef: "VEN-PLAYWRIGHT-DOWNLOADS", destinationRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational"],
    purpose: "Acquire browser binaries used by UI and material-rendering tests.", authorizationBoundary: "Package version is locked, but download host, browser digest and artifact provenance are not represented as release evidence.", direction: "inbound",
    owner: owner("Product security owner", "Web platform owner"), evidenceRefs: ["SEV-LOCKFILE", "SEV-QUALITY-WORKFLOW"], gapRefs: ["SG-ASSET-DISCOVERY"], controlIds: ["TRUST-SDLC-02", "TRUST-VENDOR-01"],
  },
];

const identities = [
  {
    identityId: "ID-END-USER", title: "Authenticated end user", kind: "end_user", systemRef: "SYS-SUPABASE", environmentRefs: ["ENV-PRODUCTION", "ENV-PREVIEW", "ENV-DEVELOPMENT"], privilege: "tenant_scoped",
    authentication: "Supabase Auth session after email verification; MFA and enterprise lifecycle are not proven.", lifecycleState: "partial", owner: owner("Identity owner", "Application security owner"),
    evidenceRefs: ["SEV-SUPABASE-CONFIG", "SEV-RLS-TEST"], gapRefs: ["SG-PRIVILEGED-ACCESS"], controlIds: ["TRUST-ID-01", "TRUST-APP-01"],
  },
  {
    identityId: "ID-ANON-ROLE", title: "Supabase anonymous role", kind: "database_role", systemRef: "SYS-SUPABASE", environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-DEVELOPMENT", "ENV-CI"], privilege: "public",
    authentication: "Unauthenticated role; sensitive operations are expected to be denied by grants and policies.", lifecycleState: "defined", owner: owner("Data security owner", "Data platform owner"),
    evidenceRefs: ["SEV-RLS-TEST"], gapRefs: ["SG-LIVE-CONFIG"], controlIds: ["TRUST-DATA-01", "TRUST-APP-01"],
  },
  {
    identityId: "ID-AUTH-ROLE", title: "Supabase authenticated role", kind: "database_role", systemRef: "SYS-SUPABASE", environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-DEVELOPMENT", "ENV-CI"], privilege: "tenant_scoped",
    authentication: "JWT-backed role constrained by organization, project and object policies.", lifecycleState: "defined", owner: owner("Data security owner", "Data platform owner"),
    evidenceRefs: ["SEV-RLS-TEST"], gapRefs: ["SG-LIVE-CONFIG"], controlIds: ["TRUST-DATA-01", "TRUST-APP-01"],
  },
  {
    identityId: "ID-WORKER-ACCOUNT", title: "Dedicated worker account", kind: "service_role", systemRef: "SYS-WORKER", environmentRefs: ["ENV-PRODUCTION"], privilege: "workload_scoped",
    authentication: "Dedicated account plus worker claim credential and per-job capability.", lifecycleState: "partial", owner: owner("Platform engineering owner", "Data security owner"),
    evidenceRefs: ["SEV-WORKER-RUNTIME", "SEV-WORKER-CONFIG"], gapRefs: ["SG-PRIVILEGED-ACCESS", "SG-LIVE-CONFIG"], controlIds: ["TRUST-ID-01", "TRUST-APP-01", "TRUST-DATA-03"],
  },
  {
    identityId: "ID-GITHUB-OIDC", title: "GitHub deployment OIDC principal", kind: "oidc_principal", systemRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-PRODUCTION"], privilege: "workload_scoped",
    authentication: "GitHub OIDC exchanged for a short-lived AWS session.", lifecycleState: "defined", owner: owner("Platform engineering owner", "Engineering governance owner"),
    evidenceRefs: ["SEV-DEPLOY-WORKER"], gapRefs: ["SG-LIVE-CONFIG", "SG-DEPLOY-DIAGNOSTICS"], controlIds: ["TRUST-DATA-03", "TRUST-CLOUD-01", "TRUST-SDLC-01"],
  },
  {
    identityId: "ID-GITHUB-EVALS-OIDC", title: "GitHub evaluation OIDC principal", kind: "oidc_principal", systemRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], privilege: "workload_scoped",
    authentication: "GitHub OIDC is exchanged for a short-lived AWS session under the dedicated offroadGitHubEvalsRole named by evaluation workflows; effective trust and grants are unverified.", lifecycleState: "partial",
    owner: owner("AI governance owner", "Cloud security owner"), evidenceRefs: ["SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-PROBE", "SEV-EVAL-CODEX", "SEV-EVAL-LIVE-GATE"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-PRIVILEGED-ACCESS", "SG-PROVIDER-ASSURANCE", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-ID-01", "TRUST-DATA-03", "TRUST-AI-01", "TRUST-SDLC-01"],
  },
  {
    identityId: "ID-AWS-WORKER-ROLES", title: "ECS execution and task roles", kind: "service_role", systemRef: "SYS-WORKER", environmentRefs: ["ENV-PRODUCTION"], privilege: "workload_scoped",
    authentication: "Named task execution and runtime roles; effective permissions require live verification.", lifecycleState: "partial", owner: owner("Cloud security owner", "Platform engineering owner"),
    evidenceRefs: ["SEV-WORKER-TASK"], gapRefs: ["SG-LIVE-CONFIG", "SG-PRIVILEGED-ACCESS", "SG-DEPLOY-DIAGNOSTICS"], controlIds: ["TRUST-ID-01", "TRUST-CLOUD-01", "TRUST-DATA-03"],
  },
  {
    identityId: "ID-PRIVILEGED-HUMANS", title: "Privileged human administrators", kind: "human_role", systemRef: "SYS-GITHUB", environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-CI", "ENV-DEVELOPMENT", "ENV-EXTERNAL"], privilege: "privileged",
    authentication: "Actual people, factors, grants and recertification are not inventoried in repository evidence.", lifecycleState: "unknown", owner: owner("Identity owner", "Security governance owner"),
    evidenceRefs: ["SEV-CODEOWNERS", "SEV-SECURITY-PLAN"], gapRefs: ["SG-PRIVILEGED-ACCESS", "SG-ENDPOINTS"], controlIds: ["TRUST-ID-01", "TRUST-PEOPLE-01"],
  },
  {
    identityId: "ID-PROVIDER-CREDENTIALS", title: "Worker provider credentials", kind: "api_credential", systemRef: "SYS-WORKER", environmentRefs: ["ENV-PRODUCTION"], privilege: "workload_scoped",
    authentication: "Named provider secrets are injected from AWS Secrets Manager; values and effective grants are not captured.", lifecycleState: "unknown", owner: owner("Platform security owner", "AI governance owner"),
    evidenceRefs: ["SEV-WORKER-TASK", "SEV-DEPLOY-WORKER"], gapRefs: ["SG-PRIVILEGED-ACCESS", "SG-LIVE-CONFIG"], controlIds: ["TRUST-ID-01", "TRUST-DATA-03", "TRUST-AI-01"],
  },
  {
    identityId: "ID-VERCEL-SOURCE-INTEGRATION", title: "Vercel source integration", kind: "api_credential", systemRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-PREVIEW", "ENV-PRODUCTION", "ENV-EXTERNAL"], privilege: "unknown",
    authentication: "Provider-managed source/deploy identity; credential form, grants and lifecycle are unresolved.", lifecycleState: "unknown", owner: owner("Web platform owner", "Engineering governance owner"),
    evidenceRefs: ["SEV-AGENTS-SCOPE"], gapRefs: ["SG-PRIVILEGED-ACCESS", "SG-LIVE-CONFIG", "SG-VENDOR-ASSURANCE"], controlIds: ["TRUST-ID-01", "TRUST-CLOUD-02", "TRUST-SDLC-01"],
  },
  {
    identityId: "ID-CODEX-CI", title: "Codex agent process in CI", kind: "service_role", systemRef: "SYS-CODEX-CI", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], privilege: "privileged",
    authentication: "The Codex CLI receives an OpenAI API credential and executes with danger-full-access inside the runner; it inherits workspace filesystem access, command execution and network egress.", lifecycleState: "partial",
    owner: owner("AI governance owner", "Product security owner"), evidenceRefs: ["SEV-EVAL-CODEX"], gapRefs: ["SG-CODEX-CI-AGENT-BOUNDARY"], controlIds: ["TRUST-AI-02", "TRUST-ID-01", "TRUST-DATA-03", "TRUST-CLOUD-02"],
  },
];

type VendorInput = Pick<SecurityCurrentStateInventory["vendors"][number],
  "vendorId" | "title" | "service" | "role" | "environmentRefs" | "dataClassIds" | "activationState"
  | "contractState" | "retentionState" | "trainingUseState" | "regionState"
  | "owner" | "evidenceRefs" | "gapRefs" | "controlIds">;

const vendors: VendorInput[] = [
  {
    vendorId: "VEN-SUPABASE", title: "Supabase", service: "Managed Auth, Postgres and object storage", role: "processor", environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-DEVELOPMENT", "ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["internal_operational", "personal_data", "customer_confidential", "restricted_financial", "credential_secret", "security_evidence"], activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "partial",
    owner: owner("Vendor risk owner", "Data platform owner"), evidenceRefs: ["SEV-AGENTS-SCOPE", "SEV-SUPABASE-CONFIG"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-BACKUP-RESTORE", "SG-REGION-MAP"], controlIds: ["TRUST-VENDOR-01", "TRUST-DATA-02", "TRUST-OPS-02"],
  },
  {
    vendorId: "VEN-AWS", title: "Amazon Web Services", service: "ECR, ECS Fargate, IAM, Secrets Manager and CloudWatch", role: "infrastructure", environmentRefs: ["ENV-PRODUCTION", "ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["internal_operational", "customer_confidential", "restricted_financial", "credential_secret", "security_evidence"], activationState: "observed_in_deployment_config", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "partial",
    owner: owner("Vendor risk owner", "Cloud security owner"), evidenceRefs: ["SEV-WORKER-TASK", "SEV-DEPLOY-WORKER", "SEV-EVAL-GOLD", "SEV-EVAL-LIVE-GATE"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-LIVE-CONFIG", "SG-REGION-MAP", "SG-DEPLOY-DIAGNOSTICS", "SG-PRIVILEGED-ACCESS", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-VENDOR-01", "TRUST-CLOUD-01", "TRUST-DATA-03", "TRUST-AI-01"],
  },
  {
    vendorId: "VEN-VERCEL", title: "Vercel", service: "Web build, preview and production hosting", role: "infrastructure", environmentRefs: ["ENV-PRODUCTION", "ENV-PREVIEW", "ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["public", "internal_operational", "personal_data", "customer_confidential", "security_evidence"], activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Web platform owner"), evidenceRefs: ["SEV-AGENTS-SCOPE", "SEV-WEB-DEPENDENCIES"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-LIVE-CONFIG", "SG-REGION-MAP"], controlIds: ["TRUST-VENDOR-01", "TRUST-CLOUD-02", "TRUST-DATA-04"],
  },
  {
    vendorId: "VEN-GITHUB", title: "GitHub", service: "Source control, Actions, security scanning and release automation", role: "development", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["public", "internal_operational", "credential_secret", "security_evidence"], activationState: "observed_in_code", contractState: "unknown", retentionState: "partial", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Engineering governance owner"), evidenceRefs: ["SEV-QUALITY-WORKFLOW", "SEV-SECURITY-WORKFLOW"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-PRIVILEGED-ACCESS", "SG-REGION-MAP"], controlIds: ["TRUST-VENDOR-01", "TRUST-SDLC-01", "TRUST-SDLC-02"],
  },
  {
    vendorId: "VEN-ANTHROPIC", title: "Anthropic", service: "Language-model inference", role: "subprocessor", environmentRefs: ["ENV-PRODUCTION", "ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "customer_confidential", "restricted_financial", "security_evidence"],
    activationState: "observed_in_deployment_config", contractState: "unknown", retentionState: "unknown", trainingUseState: "unknown", regionState: "unknown",
    owner: owner("Vendor risk owner", "AI governance owner"), evidenceRefs: ["SEV-WORKER-TASK", "SEV-MODEL-DATA-POLICY", "SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-PROBE", "SEV-EVAL-LIVE-GATE"], gapRefs: ["SG-PROVIDER-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-AI-01", "TRUST-VENDOR-01", "TRUST-DATA-04", "TRUST-SDLC-01"],
  },
  {
    vendorId: "VEN-OPENAI", title: "OpenAI", service: "Language-model inference and optional public web search", role: "subprocessor", environmentRefs: ["ENV-PRODUCTION", "ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "customer_confidential", "restricted_financial", "security_evidence"],
    activationState: "observed_in_deployment_config", contractState: "unknown", retentionState: "unknown", trainingUseState: "unknown", regionState: "unknown",
    owner: owner("Vendor risk owner", "AI governance owner"), evidenceRefs: ["SEV-WORKER-TASK", "SEV-MODEL-DATA-POLICY", "SEV-MODEL-POLICY", "SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-CODEX"], gapRefs: ["SG-PROVIDER-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-AI-01", "TRUST-VENDOR-01", "TRUST-DATA-04", "TRUST-SDLC-01"],
  },
  {
    vendorId: "VEN-PERPLEXITY", title: "Perplexity", service: "Public web research", role: "subprocessor", environmentRefs: ["ENV-PRODUCTION", "ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "security_evidence"],
    activationState: "observed_in_deployment_config", contractState: "unknown", retentionState: "unknown", trainingUseState: "unknown", regionState: "unknown",
    owner: owner("Vendor risk owner", "Research platform owner"), evidenceRefs: ["SEV-WORKER-TASK", "SEV-PUBLIC-RESEARCH", "SEV-EVAL-LIVE-GATE"], gapRefs: ["SG-PROVIDER-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-AI-01", "TRUST-VENDOR-01", "TRUST-DATA-04", "TRUST-SDLC-01"],
  },
  {
    vendorId: "VEN-FIRECRAWL", title: "Firecrawl", service: "Public content acquisition", role: "subprocessor", environmentRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL"], dataClassIds: ["public"],
    activationState: "observed_in_deployment_config", contractState: "unknown", retentionState: "partial", trainingUseState: "unknown", regionState: "unknown",
    owner: owner("Vendor risk owner", "Research platform owner"), evidenceRefs: ["SEV-WORKER-TASK", "SEV-PUBLIC-RESEARCH", "SEV-ENV-NAMES"], gapRefs: ["SG-PROVIDER-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-REGION-MAP"], controlIds: ["TRUST-AI-01", "TRUST-VENDOR-01"],
  },
  {
    vendorId: "VEN-SENTRY", title: "Sentry", service: "Error and performance telemetry", role: "subprocessor", environmentRefs: ["ENV-PRODUCTION", "ENV-PREVIEW", "ENV-DEVELOPMENT", "ENV-EXTERNAL"], dataClassIds: ["internal_operational", "personal_data", "security_evidence"],
    activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Security operations owner"), evidenceRefs: ["SEV-WEB-OBSERVABILITY", "SEV-ENV-NAMES"], gapRefs: ["SG-TELEMETRY-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-REGION-MAP"], controlIds: ["TRUST-OPS-01", "TRUST-VENDOR-01", "TRUST-DATA-04"],
  },
  {
    vendorId: "VEN-POSTHOG", title: "PostHog", service: "Allowlisted product-health telemetry", role: "subprocessor", environmentRefs: ["ENV-PRODUCTION", "ENV-PREVIEW", "ENV-DEVELOPMENT", "ENV-EXTERNAL"], dataClassIds: ["internal_operational", "personal_data"],
    activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Privacy owner"), evidenceRefs: ["SEV-WEB-OBSERVABILITY", "SEV-ENV-NAMES"], gapRefs: ["SG-TELEMETRY-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-REGION-MAP"], controlIds: ["TRUST-OPS-01", "TRUST-VENDOR-01", "TRUST-DATA-04"],
  },
  {
    vendorId: "VEN-SMTP-UNKNOWN", title: "Authentication email provider (unresolved)", service: "Transactional authentication email delivery", role: "unknown", environmentRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL"], dataClassIds: ["personal_data", "internal_operational"],
    activationState: "unknown", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Identity owner"), evidenceRefs: ["SEV-SECURITY-PLAN", "SEV-SUPABASE-CONFIG"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-LIVE-CONFIG", "SG-REGION-MAP"], controlIds: ["TRUST-VENDOR-01", "TRUST-DATA-04", "TRUST-ID-01"],
  },
  {
    vendorId: "VEN-SHEETJS-CDN", title: "SheetJS CDN", service: "Pinned spreadsheet package distribution", role: "supply_chain", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational"],
    activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Product security owner"), evidenceRefs: ["SEV-WEB-DEPENDENCIES", "SEV-LOCKFILE"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-VENDOR-01", "TRUST-SDLC-02"],
  },
  {
    vendorId: "VEN-GOOGLE-FONTS", title: "Google Fonts", service: "Remote typography for generated HTML materials", role: "subprocessor", environmentRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "personal_data"],
    activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Privacy owner"), evidenceRefs: ["SEV-CASE-RENDER"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-TELEMETRY-ASSURANCE", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-VENDOR-01", "TRUST-DATA-04", "TRUST-SDLC-02"],
  },
  {
    vendorId: "VEN-NPM-REGISTRY", title: "npm registry", service: "JavaScript package and Codex CLI distribution", role: "supply_chain", environmentRefs: ["ENV-CI", "ENV-DEVELOPMENT", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational"],
    activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Product security owner"), evidenceRefs: ["SEV-LOCKFILE", "SEV-EVAL-CODEX"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-SDLC-02", "TRUST-VENDOR-01"],
  },
  {
    vendorId: "VEN-GITHUB-ACTIONS", title: "GitHub Actions ecosystem", service: "Workflow action distribution and execution", role: "supply_chain", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "credential_secret", "security_evidence"],
    activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Product security owner"), evidenceRefs: ["SEV-QUALITY-WORKFLOW", "SEV-SECURITY-WORKFLOW", "SEV-EVAL-CODEX"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-SDLC-02", "TRUST-VENDOR-01"],
  },
  {
    vendorId: "VEN-SUPABASE-LOCAL-IMAGES", title: "Supabase local image registries", service: "Container images for the local Supabase CI stack", role: "supply_chain", environmentRefs: ["ENV-CI", "ENV-DEVELOPMENT", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "security_evidence"],
    activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Data platform owner"), evidenceRefs: ["SEV-QUALITY-WORKFLOW", "SEV-SUPABASE-CONFIG"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-SDLC-02", "TRUST-CLOUD-02", "TRUST-VENDOR-01"],
  },
  {
    vendorId: "VEN-PLAYWRIGHT-DOWNLOADS", title: "Playwright browser distribution", service: "Browser binaries for UI and rendering tests", role: "supply_chain", environmentRefs: ["ENV-CI", "ENV-DEVELOPMENT", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational"],
    activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Product security owner"), evidenceRefs: ["SEV-LOCKFILE", "SEV-QUALITY-WORKFLOW"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-SDLC-02", "TRUST-VENDOR-01"],
  },
];

const gaps = [
  {
    gapId: "SG-LIVE-CONFIG", title: "Live configuration snapshot missing", severity: "critical", owner: owner("Cloud security owner", "Security governance owner"),
    targetRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-PREVIEW", "ENV-CI", "SYS-WEB", "SYS-SUPABASE", "SYS-WORKER", "SYS-GITHUB", "SYS-OBSERVABILITY", "SYS-AUTH-EMAIL", "STORE-POSTGRES", "STORE-OBJECTS", "STORE-CLOUDWATCH", "STORE-TELEMETRY", "STORE-AWS-SECRETS", "STORE-ECR", "FLOW-WEB-DATA", "FLOW-UPLOAD", "FLOW-DATA-WORKER", "FLOW-WORKER-ANTHROPIC", "FLOW-WORKER-OPENAI", "FLOW-WORKER-RESEARCH", "FLOW-WORKER-FIRECRAWL", "FLOW-WEB-TELEMETRY", "FLOW-AUTH-EMAIL", "FLOW-GITHUB-AWS", "FLOW-GITHUB-EVAL-SECRETS", "FLOW-GITHUB-EVAL-ANTHROPIC", "FLOW-GITHUB-EVAL-OPENAI", "FLOW-GITHUB-EVAL-PERPLEXITY", "FLOW-GITHUB-VERCEL", "ID-ANON-ROLE", "ID-AUTH-ROLE", "ID-WORKER-ACCOUNT", "ID-GITHUB-OIDC", "ID-GITHUB-EVALS-OIDC", "ID-AWS-WORKER-ROLES", "ID-PROVIDER-CREDENTIALS", "ID-VERCEL-SOURCE-INTEGRATION", "VEN-AWS", "VEN-VERCEL", "VEN-SMTP-UNKNOWN"],
    evidenceRefs: ["SEV-SECURITY-PLAN"], controlIds: ["TRUST-CLOUD-01", "TRUST-CLOUD-02", "TRUST-OPS-01"], nextAction: "Collect read-only, dated configuration snapshots from each material platform and attach time-bound evidence.",
  },
  {
    gapId: "SG-ENV-SEPARATION", title: "Environment separation not fully proven", severity: "critical", owner: owner("Platform engineering owner", "Data security owner"),
    targetRefs: ["ENV-STAGING", "ENV-PREVIEW", "ENV-CI", "ENV-DEVELOPMENT", "SYS-SUPABASE", "FLOW-WEB-DATA"], evidenceRefs: ["SEV-AGENTS-SCOPE", "SEV-SECURITY-PLAN"],
    controlIds: ["TRUST-CLOUD-02", "TRUST-DATA-01"], nextAction: "Verify credentials, connectivity, data policy and non-interference for every lower environment.",
  },
  {
    gapId: "SG-DATA-LIFECYCLE", title: "Data retention, export and deletion lifecycle incomplete", severity: "critical", owner: owner("Data governance owner", "Privacy owner"),
    targetRefs: ["public", "internal_operational", "personal_data", "customer_confidential", "restricted_financial", "security_evidence", "SYS-SUPABASE", "STORE-POSTGRES", "STORE-OBJECTS", "STORE-CLOUDWATCH", "STORE-TELEMETRY", "STORE-SOURCE", "STORE-AWS-SECRETS", "STORE-ECR", "FLOW-UPLOAD"], evidenceRefs: ["SEV-SECURITY-PLAN"],
    controlIds: ["TRUST-DATA-02", "TRUST-DATA-04"], nextAction: "Define retention by data class and prove export, legal hold and deletion propagation.",
  },
  {
    gapId: "SG-BACKUP-RESTORE", title: "Backup and restore not exercised", severity: "critical", owner: owner("Reliability owner", "Data platform owner"),
    targetRefs: ["SYS-SUPABASE", "STORE-POSTGRES", "STORE-OBJECTS", "VEN-SUPABASE"], evidenceRefs: ["SEV-SECURITY-PLAN"], controlIds: ["TRUST-OPS-02", "TRUST-VENDOR-01"],
    nextAction: "Approve preliminary RPO and RTO, capture settings and execute an isolated restore drill.",
  },
  {
    gapId: "SG-VENDOR-ASSURANCE", title: "Vendor and subprocessor assurance incomplete", severity: "high", owner: owner("Vendor risk owner", "Privacy owner"),
    targetRefs: ["ENV-CI", "ENV-EXTERNAL", "SYS-GITHUB", "SYS-AUTH-EMAIL", "STORE-SOURCE", "STORE-ECR", "FLOW-WORKER-RESEARCH", "FLOW-WORKER-FIRECRAWL", "FLOW-GITHUB-EVAL-ANTHROPIC", "FLOW-GITHUB-EVAL-OPENAI", "FLOW-GITHUB-EVAL-PERPLEXITY", "FLOW-AUTH-EMAIL", "FLOW-GITHUB-VERCEL", "FLOW-SHEETJS-SUPPLY", "FLOW-MATERIAL-GOOGLE-FONTS", "ID-VERCEL-SOURCE-INTEGRATION", ...vendors.map((item) => item.vendorId)], evidenceRefs: ["SEV-SECURITY-PLAN"],
    controlIds: ["TRUST-VENDOR-01", "TRUST-DATA-04"], nextAction: "Collect current contract, DPA, retention, region, incident, notice and exit evidence for every material vendor.",
  },
  {
    gapId: "SG-PROVIDER-ASSURANCE", title: "Provider data-policy enforcement is disabled in deployment configuration", severity: "critical", owner: owner("AI governance owner", "Privacy owner"),
    targetRefs: ["ENV-CI", "ENV-EXTERNAL", "customer_confidential", "restricted_financial", "SYS-WORKER", "SYS-GITHUB", "FLOW-WORKER-ANTHROPIC", "FLOW-WORKER-OPENAI", "FLOW-WORKER-FIRECRAWL", "FLOW-GITHUB-EVAL-SECRETS", "FLOW-GITHUB-EVAL-ANTHROPIC", "FLOW-GITHUB-EVAL-OPENAI", "FLOW-GITHUB-EVAL-PERPLEXITY", "ID-GITHUB-EVALS-OIDC", "VEN-ANTHROPIC", "VEN-OPENAI", "VEN-PERPLEXITY", "VEN-FIRECRAWL"], evidenceRefs: ["SEV-MODEL-DATA-POLICY", "SEV-MODEL-DATA-POLICY-TEST", "SEV-WORKER-CONFIG", "SEV-WORKER-TASK", "SEV-EVAL-GOLD", "SEV-EVAL-LIVE-GATE"],
    controlIds: ["TRUST-AI-01", "TRUST-DATA-04", "TRUST-VENDOR-01"], nextAction: "Set and prove fail-closed provider assurance for non-public model routes; separately review Firecrawl retention before promotion because live acquisition is enabled while zero-data-retention is false.",
  },
  {
    gapId: "SG-TELEMETRY-ASSURANCE", title: "Telemetry activation and handling not live-verified", severity: "high", owner: owner("Security operations owner", "Privacy owner"),
    targetRefs: ["SYS-WEB", "SYS-OBSERVABILITY", "STORE-TELEMETRY", "FLOW-WEB-TELEMETRY", "FLOW-MATERIAL-GOOGLE-FONTS", "VEN-SENTRY", "VEN-POSTHOG", "VEN-GOOGLE-FONTS"], evidenceRefs: ["SEV-WEB-OBSERVABILITY", "SEV-ENV-NAMES", "SEV-SECURITY-PLAN"],
    controlIds: ["TRUST-OPS-01", "TRUST-DATA-04", "TRUST-VENDOR-01"], nextAction: "Verify activation and capture access, retention, region, DPA and privacy-safe event tests.",
  },
  {
    gapId: "SG-PRIVILEGED-ACCESS", title: "Privileged identity inventory and recertification missing", severity: "critical", owner: owner("Identity owner", "Security governance owner"),
    targetRefs: ["ENV-CI", "credential_secret", "SYS-GITHUB", "SYS-ENDPOINTS", "STORE-AWS-SECRETS", "FLOW-GITHUB-AWS", "FLOW-GITHUB-EVAL-SECRETS", "ID-END-USER", "ID-WORKER-ACCOUNT", "ID-GITHUB-EVALS-OIDC", "ID-AWS-WORKER-ROLES", "ID-PRIVILEGED-HUMANS", "ID-PROVIDER-CREDENTIALS", "ID-VERCEL-SOURCE-INTEGRATION", "VEN-GITHUB", "VEN-AWS"], evidenceRefs: ["SEV-SECURITY-PLAN", "SEV-DEPLOY-WORKER", "SEV-EVAL-GOLD", "SEV-EVAL-LIVE-GATE"],
    controlIds: ["TRUST-ID-01", "TRUST-DATA-03", "TRUST-PEOPLE-01"], nextAction: "Record named identities, factors, grants, last use, approval, expiry and periodic recertification.",
  },
  {
    gapId: "SG-ENDPOINTS", title: "Endpoint security baseline absent", severity: "high", owner: owner("People operations owner", "Product security owner"),
    targetRefs: ["ENV-DEVELOPMENT", "SYS-ENDPOINTS", "ID-PRIVILEGED-HUMANS"], evidenceRefs: ["SEV-SECURITY-PLAN"], controlIds: ["TRUST-PEOPLE-01", "TRUST-ID-01", "TRUST-DATA-03"],
    nextAction: "Inventory endpoints and prove encryption, screen lock, patching, protection, recovery and disposal.",
  },
  {
    gapId: "SG-REGION-MAP", title: "Complete residency and transfer map missing", severity: "high", owner: owner("Privacy owner", "Vendor risk owner"),
    targetRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL", "FLOW-MATERIAL-GOOGLE-FONTS", ...vendors.map((item) => item.vendorId)], evidenceRefs: ["SEV-SECURITY-PLAN", "SEV-WORKER-TASK"], controlIds: ["TRUST-DATA-04", "TRUST-VENDOR-01", "TRUST-CLOUD-01"],
    nextAction: "Confirm processing and storage locations, transfer mechanisms and subprocessor paths.",
  },
  {
    gapId: "SG-PRIVACY-RECORDS", title: "Privacy records and rights operations incomplete", severity: "high", owner: owner("Privacy owner", "Data governance owner"),
    targetRefs: ["personal_data", "SYS-SUPABASE", "SYS-AUTH-EMAIL", "STORE-POSTGRES", "FLOW-AUTH-EMAIL"], evidenceRefs: ["SEV-SECURITY-PLAN"], controlIds: ["TRUST-DATA-04", "TRUST-DATA-02"],
    nextAction: "Create the processing record, legal-basis map, notices, rights workflow and transfer assessment.",
  },
  {
    gapId: "SG-OWNER-ASSIGNMENT", title: "Named control ownership not assigned", severity: "critical", owner: owner("Executive security owner", "Security governance owner"),
    targetRefs: ["SYS-WEB", "SYS-SUPABASE", "SYS-WORKER", "SYS-GITHUB", "SYS-OBSERVABILITY", "SYS-AUTH-EMAIL", "SYS-ENDPOINTS"], evidenceRefs: ["SEV-SECURITY-PLAN"],
    controlIds: ["TRUST-GOV-01", "TRUST-GOV-02"], nextAction: "Assign named primary and backup people to every functional owner role and record acceptance and review cadence.",
  },
  {
    gapId: "SG-DEPLOY-DIAGNOSTICS", title: "Worker rollout diagnostic permissions are not independently verified", severity: "high", owner: owner("Cloud security owner", "Security operations owner"),
    targetRefs: ["SYS-GITHUB", "FLOW-GITHUB-AWS", "ID-GITHUB-OIDC", "ID-AWS-WORKER-ROLES", "VEN-AWS"], evidenceRefs: ["SEV-DEPLOY-WORKER", "SEV-AWS-DEPLOY-ROLE-SNAPSHOT"],
    controlIds: ["TRUST-CLOUD-01", "TRUST-OPS-01", "TRUST-SDLC-01"], nextAction: "Collect a dated IAM policy and simulate-principal-policy receipt for the exact rollout role and actions. Only after proving an actual denial, design the minimum resource-scoped grant and prove both intended success and out-of-scope denial.",
  },
  {
    gapId: "SG-CODEX-CI-AGENT-BOUNDARY", title: "Codex CI agent boundary lacks enforced least privilege and egress controls", severity: "critical", owner: owner("Product security owner", "AI governance owner"),
    targetRefs: ["SYS-CODEX-CI", "STORE-CODEX-RUNNER", "STORE-SOURCE", "FLOW-GITHUB-CODEX", "FLOW-CODEX-AWS-SECRETS", "FLOW-CODEX-SOURCE", "FLOW-CODEX-OPENAI", "ID-CODEX-CI"], evidenceRefs: ["SEV-EVAL-CODEX"],
    controlIds: ["TRUST-AI-01", "TRUST-AI-02", "TRUST-DATA-03", "TRUST-SDLC-01", "TRUST-CLOUD-02", "TRUST-OPS-01"],
    nextAction: "Threat-model the danger-full-access runner; isolate provider credentials from agent-readable environment, enforce an allowlisted corpus and commands/tools, restrict filesystem writes and network egress, test prompt-injection and exfiltration attempts, scan logs/artifacts for secrets and define retention plus incident evidence.",
  },
  {
    gapId: "SG-SCHEMA-BEFORE-CODE", title: "Hosted schema is not orchestrated before worker code", severity: "critical", owner: owner("Platform engineering owner", "Engineering governance owner"),
    targetRefs: ["ENV-PRODUCTION", "SYS-GITHUB", "SYS-SUPABASE", "SYS-WORKER", "FLOW-GITHUB-AWS"], evidenceRefs: ["SEV-ROLLOUT-ORDER", "SEV-DEPLOY-WORKER"],
    controlIds: ["TRUST-CLOUD-02", "TRUST-SDLC-01", "TRUST-OPS-03"], nextAction: "Create a fail-closed release dependency that proves required hosted migrations and runtime contract before a worker image can roll out.",
  },
  {
    gapId: "SG-ENV-DATA-MAPPING", title: "Environment-by-data-class matrix is not inventoried", severity: "critical", owner: owner("Data security owner", "Security governance owner"),
    targetRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-PREVIEW", "ENV-CI", "ENV-DEVELOPMENT", "ENV-EXTERNAL"], evidenceRefs: ["SEV-AGENTS-SCOPE", "SEV-SECURITY-PLAN"],
    controlIds: ["TRUST-DATA-01", "TRUST-DATA-02", "TRUST-CLOUD-02"], nextAction: "Record and verify the allowed, prohibited or conditional data classes for each system and flow in each environment before treating the two scope lists as a routing policy.",
  },
  {
    gapId: "SG-LOGGING-CONTENT-SAFETY", title: "Worker logging is not comprehensively content-safe", severity: "high", owner: owner("Security operations owner", "Platform engineering owner"),
    targetRefs: ["SYS-WORKER", "STORE-CLOUDWATCH"], evidenceRefs: ["SEV-WORKER-RUNTIME", "SEV-WORKER-CONFIG"], controlIds: ["TRUST-OPS-01", "TRUST-DATA-02", "TRUST-APP-02"],
    nextAction: "Route operational logs through a typed allowlisted logger and test every failure path against prompts, document text, signed URLs, personal data and financial values.",
  },
  {
    gapId: "SG-ASSET-DISCOVERY", title: "Security asset and external dependency discovery is incomplete", severity: "high", owner: owner("Security governance owner", "Platform security owner"),
    targetRefs: ["ENV-CI", "SYS-WEB", "SYS-WORKER", "SYS-GITHUB", "STORE-AWS-SECRETS", "FLOW-GITHUB-EVAL-SECRETS", "FLOW-GITHUB-EVAL-ANTHROPIC", "FLOW-GITHUB-EVAL-OPENAI", "FLOW-GITHUB-EVAL-PERPLEXITY", "ID-GITHUB-EVALS-OIDC", "FLOW-SHEETJS-SUPPLY", "FLOW-MATERIAL-GOOGLE-FONTS", "FLOW-NPM-SUPPLY", "FLOW-GITHUB-ACTIONS-SUPPLY", "FLOW-SUPABASE-LOCAL-IMAGES", "FLOW-PLAYWRIGHT-BROWSERS", "VEN-AWS", "VEN-ANTHROPIC", "VEN-OPENAI", "VEN-PERPLEXITY", "VEN-SHEETJS-CDN", "VEN-GOOGLE-FONTS", "VEN-NPM-REGISTRY", "VEN-GITHUB-ACTIONS", "VEN-SUPABASE-LOCAL-IMAGES", "VEN-PLAYWRIGHT-DOWNLOADS"], evidenceRefs: ["SEV-WEB-DEPENDENCIES", "SEV-WORKER-TASK", "SEV-EVAL-GOLD", "SEV-EVAL-LIVE-GATE", "SEV-QUALITY-WORKFLOW", "SEV-SECURITY-WORKFLOW", "SEV-LOCKFILE", "SEV-SECURITY-PLAN"], controlIds: ["TRUST-GOV-02", "TRUST-SDLC-02", "TRUST-VENDOR-01", "TRUST-AI-01", "TRUST-DATA-03"],
    nextAction: "Inventory Secrets Manager, ECR and container artifacts, provider credentials, Vercel source integration, npm and GitHub Actions supply, exact Supabase local image registries and digests, Playwright browser downloads, browser CDNs and external fonts before claiming external-boundary completeness.",
  },
];

const currentSecurityInventoryDeclaration = {
  inventoryVersion: "2026.09.07-sec01-v1",
  generatedAt: capturedAt,
  baseline: {repository: "carlosevg100/offroad", branch: "main", commit: baselineCommit, evidenceCutoff: capturedAt, reviewDueAt: "2026-09-14T09:43:00.000-03:00"},
  scopeStatement: "Repository-observed current state for the Offroad application, delivery path, worker, data platforms and known external integrations.",
  scopeRelationship: {
    semantics: "environment_and_data_class_refs_are_independent_unions",
    environmentDataMatrixState: "not_inventoried",
    gapRef: "SG-ENV-DATA-MAPPING",
  },
  coverageClaims: createCanonicalSecurityCoverageCatalogue(),
  limitations: [
    "Repository evidence does not attest to complete live configuration, contract terms or control operation over time.",
    "Functional owner roles are recorded, but named primary and backup assignments are not evidenced.",
    "Vendor contract, retention, region and training-use statements remain unknown without current evidence.",
    "Environment and data-class references are independent scope unions, not a Cartesian authorization matrix; that matrix remains an explicit critical gap.",
    "The deployed worker configuration omits provider-data-policy enforcement and enables Firecrawl while zero-data-retention is false.",
    "Asset discovery is incomplete; missing boundaries are named in SG-ASSET-DISCOVERY rather than silently treated as absent.",
    "The Codex review workflow is an agentic executor with danger-full-access to an ephemeral runner, workspace command execution and network egress; least-privilege enforcement and prompt-injection containment remain an explicit critical gap.",
    "External-assurance and regulatory claims are represented only by the governed assurance section; this inventory is not their evidence.",
  ],
  evidenceIndex,
  environments,
  dataClasses,
  systems,
  dataStores,
  dataFlows,
  identities,
  vendors,
  gaps,
};

// Entity and gap status are deliberately absent from the declaration contract. The trusted
// evaluator derives them from canonical relationships and evidence resolved from trusted bytes.
export const currentSecurityInventory: SecurityCurrentStateInventory = securityCurrentStateInventorySchema.parse(currentSecurityInventoryDeclaration);
