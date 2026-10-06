import {z} from "zod";

/** Acceptance criteria from roadmap 24.1. File presence is never a passed result. */
export const frameworkReadinessCriteria = [
  ["identity", "explicit_workspace_context.sql"],
  ["creator_revocation", "creator_authority_revocation.sql"],
  ["resource_read", "resource_policy_barriers.sql"],
  ["search_barrier", "source_rights_retrieval.sql"],
  ["complete_revocation", "end_to_end_revocation.sql"],
  ["human_vault", "human_vault_publication.sql"],
  ["published_manifest", "method_execution_pin.sql"],
  ["house_precedence", "method_composition_rights.sql"],
  ["observation_adoption", "contextual_adoption.sql"],
  ["work_without_intake", "persistent_work_without_intake.sql"],
  ["contribution", "work_contribution_isolation.sql"],
  ["restricted_derivation", "vault_derived_rights.sql"],
  ["reproducible_calculation", "execution_consumer.sql"],
  ["verified_narrative", "execution_basis.sql"],
  ["continuity", "work_continuity_dependencies.sql"],
  ["retention_fallback", "provider_retention_eligibility.sql"],
  ["file_roundtrip", "artifact_import_candidates.sql"],
  ["review_decision", "revision_bound_decisions.sql"],
  ["audit_retention", "sensitive_operation_audit.sql"],
  ["role_independence", "role_free_reasoning_context.sql"],
  ["legacy_environments", "no_legacy_access_bypass.sql"],
] as const;

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const commit = z.string().regex(/^[a-f0-9]{40}$/);
const criterion = z.enum(frameworkReadinessCriteria.map(([id]) => id));
const stagingProject = "gjkkjtbfnssdsbmlhmwk";
const productionProject = "ifnogpksgdadruooqydi";

/** Receipts are collected by the operator from actual runs, not provided by product users. */
export const frameworkReadinessEvidenceSchema = z.strictObject({
  commit,
  journal: z.array(z.strictObject({projectId: z.enum([stagingProject, productionProject]), fingerprint: sha})),
  checks: z.array(z.strictObject({
    criterion, commit, environment: z.enum(["staging", "isolated_ci"]),
    source: z.string().min(1), sourceFingerprint: sha, receiptFingerprint: sha,
    exitCode: z.number().int().nonnegative(),
  })),
  journey: z.strictObject({
    commit, workId: z.uuid(), executionId: z.uuid(), manifestFingerprint: sha, profileFingerprint: sha,
    source: z.literal("apps/web/e2e/framework-readiness.spec.ts"), receiptFingerprint: sha,
    exitCode: z.number().int().nonnegative(),
    sameWork: z.boolean(), startedWithoutIntake: z.boolean(), workerAuthoredResult: z.boolean(),
  }),
  deployment: z.strictObject({
    webCommit: commit, workerCommit: commit, webReady: z.boolean(), workerStable: z.boolean(),
    workerBootVerified: z.boolean(), pinnedExecutorsVerified: z.boolean(),
  }),
  cleanup: z.strictObject({temporaryAccessRevoked: z.boolean(), operationalFixturesAbsent: z.boolean()}),
  provider: z.strictObject({privateTransportProven: z.boolean(), unprovenPrivateTransportDisabled: z.boolean()}),
});

/** Assess collected technical receipts. This is neither a certification nor a product-quality score. */
export function assessFrameworkReadiness(input: unknown) {
  const value = frameworkReadinessEvidenceSchema.parse(input);
  const blockers: string[] = [];
  if (value.journal.length !== 2 || new Set(value.journal.map((x) => x.projectId)).size !== 2) blockers.push("environment_journals_missing_or_duplicated");
  for (const [id, file] of frameworkReadinessCriteria) {
    for (const environment of ["staging", "isolated_ci"] as const) {
      const rows = value.checks.filter((x) => x.criterion === id && x.environment === environment);
      if (rows.length !== 1) {blockers.push(`${id}:${environment}:missing_or_duplicate`); continue;}
      const row = rows[0]!;
      if (row.commit !== value.commit || row.source !== `supabase/tests/${file}` || row.exitCode !== 0) blockers.push(`${id}:${environment}:failed_or_wrong_revision`);
    }
  }
  for (const [id] of frameworkReadinessCriteria) {
    const rows=value.checks.filter(x=>x.criterion===id);
    if(rows.length===2 && rows[0]!.sourceFingerprint!==rows[1]!.sourceFingerprint) blockers.push(`${id}:test_source_mismatch`);
  }
  if (value.journey.commit !== value.commit || value.journey.exitCode !== 0 || !value.journey.sameWork || !value.journey.startedWithoutIntake || !value.journey.workerAuthoredResult) blockers.push("integrated_journey_not_proven");
  const d = value.deployment;
  if (d.webCommit !== value.commit || d.workerCommit !== value.commit || !d.webReady || !d.workerStable || !d.workerBootVerified || !d.pinnedExecutorsVerified) blockers.push("production_deployment_not_proven");
  if (!value.cleanup.temporaryAccessRevoked || !value.cleanup.operationalFixturesAbsent) blockers.push("verification_cleanup_incomplete");
  if (!value.provider.privateTransportProven && !value.provider.unprovenPrivateTransportDisabled) blockers.push("unproven_private_transport_enabled");
  return {schemaVersion: "framework-readiness.v1" as const, commit: value.commit, technicalEvidenceComplete: blockers.length === 0, blockers,
    criteria: frameworkReadinessCriteria.length, productTrialsPerformed: false as const, externalCertification: false as const,
    privateProviderTransport: value.provider.privateTransportProven ? "proven_for_declared_scope" as const : "disabled_unproven" as const};
}
