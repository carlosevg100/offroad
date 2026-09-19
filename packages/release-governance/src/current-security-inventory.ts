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
  securityAssuranceStatementSchema,
  createSecurityAssuranceScopeFingerprint,
  type SecurityAssuranceScope,
} from "./security-assurance-statements.ts";

const baselineCommit = "29f7890ea202a266fff1da08cebef2ea58d989d9";
const capturedAt = "2026-09-19T16:18:58.884Z";

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

/** Program milestones are governed in the assurance module and cannot become certifications. */
export {currentSecurityAssuranceMilestones} from "./security-assurance-statements.ts";

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
  evidence("SEV-METHOD-COMPOSITION", "repository_file", "packages/credit-playbook/src/compose-method.ts", "Declared typed overrides preserve provenance and protected invariants."),
  evidence("SEV-METHOD-COMPOSITION-TEST", "automated_test", "packages/credit-playbook/src/compose-method.test.ts", "Precedence, ambiguity, protected rules and typed value negatives are tested."),
  evidence("SEV-METHOD-SCHEMA", "repository_file", "supabase/migrations/20260919143037_published_method_releases.sql", "Human publication and immutable composition use current vault authority with no worker publisher."),
  evidence("SEV-METHOD-PUBLICATION-TEST", "automated_test", "supabase/tests/method_release_publication.sql", "Revoked reviewer, stale evidence, cross-tenant and direct writes are denied."),
  evidence("SEV-METHOD-RIGHTS-TEST", "automated_test", "supabase/tests/method_composition_rights.sql", "Published sources and inherited restrictions remain required at publication."),
  evidence("SEV-METHOD-PIN-TEST", "automated_test", "supabase/tests/method_execution_pin.sql", "Running execution preserves its pin and withdrawal blocks use without fallback."),
  evidence("SEV-METHOD-CONCURRENCY", "automated_test", "scripts/ci/test-method-publication-concurrency.py", "Two actual sessions serialize publication and adoption without mixing components."),
  evidence("SEV-METHOD-UI", "repository_file", "apps/web/src/app/[locale]/app/settings/method/actions.ts", "Server actions derive tenant and actor and call atomic authorized commands."),
  evidence("SEV-METHOD-UI-E2E", "automated_test", "apps/web/e2e/method-publication.spec.ts", "Human author, reviewer and publisher journey preserves history and exact adoption."),
  evidence("SEV-METHOD-WORKER", "repository_file", "apps/document-worker/src/published-method-binding.ts", "Execution requires the published pin and bundled build provenance."),
  evidence("SEV-METHOD-WORKER-TEST", "automated_test", "apps/document-worker/src/published-method-binding.test.ts", "Missing and forged pins or mismatched executor manifests fail closed."),
  evidence("SEV-METHOD-CALLBACK", "repository_file", "supabase/migrations/20260919143043_pinned_method_result_boundary.sql", "Commit revalidates the server pin; compatibility does not grant client publication."),
  evidence("SEV-METHOD-LEGACY-TEST", "automated_test", "supabase/tests/organization_methodology.sql", "Legacy save produces candidates only and cannot activate a method."),

  evidence("SEV-PROCEDURE-COMPONENTS", "repository_file", "packages/credit-playbook/src/method-component.ts", "Typed components keep contracts, rights, effects, budgets and protected invariants explicit."),
  evidence("SEV-PROCEDURE-COMPILER", "repository_file", "packages/credit-playbook/src/procedure-compiler.ts", "Versioned dependency graphs compile reproducibly and do not confer execution authority."),
  evidence("SEV-PROCEDURE-NEGATIVES", "automated_test", "packages/credit-playbook/src/procedure-compiler.test.ts", "Missing dependencies, cycles, undeclared tools, forged executors and whitespace-heavy authoring fail safely."),
  evidence("SEV-PROCEDURE-BUILD", "repository_file", "packages/credit-playbook/src/build-method-manifest.ts", "Build pins first-party source closures and evidence bytes without dynamic prose execution."),
  evidence("SEV-PROCEDURE-PROJECTION", "repository_file", "packages/credit-playbook/src/method-runtime-manifest.generated.ts", "Generated projection fixes source, compiler, executor and evidence hashes."),
  evidence("SEV-PROCEDURE-PROJECTION-TEST", "automated_test", "packages/credit-playbook/src/method-runtime-manifest.test.ts", "Exact regenerated bytes and R01 binding remain checked; forged provenance is denied."),
  evidence("SEV-PROCEDURE-WORKER", "repository_file", "apps/document-worker/src/specialist-method-runtime.ts", "Worker requires bundled provenance in addition to existing current release and access checks."),
  evidence("SEV-PROCEDURE-WORKER-TEST", "automated_test", "apps/document-worker/src/specialist-method-runtime.test.ts", "Released R01 preserves scope, deterministic result and suspension behavior."),
  evidence("SEV-PROCEDURE-AUTHORING", "repository_file", "packages/credit-playbook/knowledge/AUTHORING.md", "Human authors own professional content; compilation does not publish candidates."),
  evidence("SEV-PROCEDURE-CANDIDATE", "automated_test", "packages/credit-playbook/src/capital-structure-authoring.test.ts", "Actual capital procedure stays incomplete and cannot be promoted by changing its label."),

  evidence("SEV-VAULT-WORKER-AUTHORITY", "automated_test", "apps/document-worker/src/case-analysis.test.ts", "Unpublished house content blocks model writing while independently released deterministic calculations persist."),
  evidence("SEV-VAULT-LEGACY-GRANTS", "repository_file", "supabase/migrations/20260918111441_vault_legacy_worker_grants.sql", "Runtime service credentials cannot fabricate platform corpus approval or modify its evidence bytes."),
  evidence("SEV-VAULT-LEGACY-NEGATIVE", "automated_test", "supabase/tests/vault_legacy_publication_evidence.sql", "Migration-only approval stays candidate and service-role mutation of approval or content is denied."),
  evidence("SEV-VAULT-SCHEMA", "repository_file", "supabase/migrations/20260918105943_human_vault_publication.sql", "Immutable versions and exact human publication use canonical grants, current rights and content-free audit."),
  evidence("SEV-VAULT-EXPORT", "automated_test", "supabase/tests/vault_export_authority.sql", "Export purpose never replaces explicit export operation; revocation hides content while retaining withdrawal receipts."),
  evidence("SEV-VAULT-LEGACY", "repository_file", "supabase/migrations/20260918105952_vault_legacy_publication_evidence.sql", "Migration-only approval becomes a legacy candidate, preserving original bytes and provenance."),
  evidence("SEV-VAULT-RECEIPTS", "repository_file", "supabase/migrations/20260918105956_vault_publication_receipts.sql", "Publishers can withdraw unavailable references without recovering their restricted content."),
  evidence("SEV-VAULT-HUMAN", "automated_test", "supabase/tests/human_vault_publication.sql", "Workers, undesignated creators and stale reviews cannot publish or resurrect withdrawn acts."),
  evidence("SEV-VAULT-ISOLATION", "automated_test", "supabase/tests/vault_scope_isolation.sql", "Workspace, restricted work and candidate boundaries remain closed despite vault reading grants."),
  evidence("SEV-VAULT-DERIVED", "automated_test", "supabase/tests/vault_derived_rights.sql", "Derived revisions cannot drop pinned restrictions by omitting dependencies or widening current licenses."),
  evidence("SEV-VAULT-CONCURRENCY", "automated_test", "scripts/ci/test-vault-publication-concurrency.py", "Two real sessions observe policy lock contention and refuse a stale competing review."),
  evidence("SEV-VAULT-E2E", "automated_test", "apps/web/e2e/vault-publication.spec.ts", "Two people use publisher designation, exact review, publication and withdrawal through the product."),
  evidence("SEV-VAULT-ACTIONS", "repository_file", "apps/web/src/app/[locale]/app/vault/actions.ts", "Server actions derive current workspace and submit bounded human commands without privileged credentials."),
  evidence("SEV-VAULT-PROTOCOL", "automated_test", "apps/web/src/lib/advisor/vault.test.ts", "Reference and review contracts reject ambiguous types, invalid scope and unbound version identifiers."),

  evidence("SEV-CONTRIBUTION-AUDIT", "repository_file", "supabase/migrations/20260918010613_work_contribution_dependency_audit.sql", "Source dependencies retain immutable stable identity and content-free audit with per-command policies."),
  evidence("SEV-CONTRIBUTION-SCHEMA", "repository_file", "supabase/migrations/20260918002400_work_contributions_and_channels.sql", "Canonical participation, personal channels, immutable revisions and inherited source rights."),
  evidence("SEV-CONTRIBUTION-INTEGRITY", "repository_file", "supabase/migrations/20260918002404_work_contribution_command_integrity.sql", "Sharing retry deduplication, archived-work denial and bounded lineage."),
  evidence("SEV-CONTRIBUTION-ISOLATION", "automated_test", "supabase/tests/work_contribution_isolation.sql", "Competing revisions, late participants, source audience and revocation deny shortcuts."),
  evidence("SEV-CONTRIBUTION-RIGHTS", "automated_test", "supabase/tests/work_contribution_rights.sql", "Pinned restrictions survive forks, rebases, retries and current derive withdrawal."),
  evidence("SEV-CONTRIBUTION-CONCURRENCY", "automated_test", "scripts/ci/test-contribution-concurrency.py", "Two real database sessions observe serialization and preserve both candidates."),
  evidence("SEV-CONTRIBUTION-E2E", "automated_test", "apps/web/e2e/work-contributions.spec.ts", "Two browser identities use product sharing, conflict comparison, rebase and revocation."),
  evidence("SEV-CONTRIBUTION-ACTIONS", "repository_file", "apps/web/src/app/[locale]/app/work-contribution-actions.ts", "Validated bounded commands derive workspace and revalidate current database authority."),
  evidence("SEV-CONTRIBUTION-PROTOCOL", "automated_test", "apps/web/src/lib/advisor/work-contributions.test.ts", "Identity and conflict protocol reject incomplete or oversized submissions."),

  evidence("SEV-WORK-STORAGE", "repository_file", "supabase/migrations/20260917191714_persistent_work_without_intake.sql", "Persistent work identity and context with bounded worker claims and atomic current-authority revalidation."),
  evidence("SEV-WORK-COMMANDS", "repository_file", "supabase/migrations/20260917195617_persistent_work_commands.sql", "Atomic start, append, context revision and later document ingestion preserve work identity."),
  evidence("SEV-WORK-LEGACY", "repository_file", "supabase/migrations/20260917204933_persistent_work_legacy_adapters.sql", "Legacy entries delegate canonical work commands without automatic company, folder or intake."),
  evidence("SEV-WORK-SPECIALIZED", "repository_file", "supabase/migrations/20260917204936_persistent_work_specialized_adapters.sql", "Specialized entries preserve declared briefs without pretending documentary execution."),
  evidence("SEV-WORK-REPLAY", "repository_file", "supabase/migrations/20260917204939_persistent_work_specialized_replay_scope.sql", "Replay revalidates selected workspace and current authority without reviving completed work."),
  evidence("SEV-WORK-STORAGE-SQL", "automated_test", "supabase/tests/persistent_work_storage.sql", "Storage consistency, cross-work denials and delegated commit authority contracts."),
  evidence("SEV-WORK-ENTRY-SQL", "automated_test", "supabase/tests/persistent_work_without_intake.sql", "Context CAS, multiple dossiers, creator revocation and later intake retain one work identity."),
  evidence("SEV-WORK-LEGACY-SQL", "automated_test", "supabase/tests/persistent_work_legacy_adapters.sql", "Every retained entry, immutable replay, current access and resumed onboarding deny shortcuts."),
  evidence("SEV-WORK-RUNTIME", "repository_file", "apps/document-worker/src/work-conversation.ts", "Bounded conversation uses current work context without tools, financial execution or role-based depth."),
  evidence("SEV-WORK-RUNTIME-TEST", "automated_test", "apps/document-worker/src/work-conversation.test.ts", "Cross-work claims and revoked completion are denied; provider errors cannot persist sensitive content."),
  evidence("SEV-WORK-COMPILE", "automated_test", "packages/work-plan/src/advisor-starting-plan.test.ts", "Conversation entry does not infer a documentary execution plan without attachments."),
  evidence("SEV-WORK-CONTEXT", "repository_file", "apps/web/src/app/[locale]/app/work-context-actions.ts", "Validated context updates and dossier links derive workspace authority server-side."),
  evidence("SEV-WORK-WEB", "repository_file", "apps/web/src/app/[locale]/app/advisor-actions.ts", "The web entry and later real document upload use canonical atomic work commands."),
  evidence("SEV-WORK-E2E", "automated_test", "apps/web/e2e/persistent-work.spec.ts", "Reopening, context editing, multiple dossier links, mobile layout and later upload retain work history."),
  evidence("SEV-WORK-AUTH-REPLAY", "automated_test", "supabase/tests/workspace_replay_authority.sql", "Retries cannot reuse historical creator authority outside the selected authorized workspace."),

  evidence("SEV-ADOPT-SCHEMA", "repository_file", "supabase/migrations/20260917160856_contextual_adoptions_and_assumptions.sql", "Immutable contextual choices and version snapshots with explicit purpose, authority and atomic audit/outbox."),
  evidence("SEV-ADOPT-BINDING", "repository_file", "supabase/migrations/20260917160902_contextual_adoption_execution_bindings.sql", "Executions bind immutable versions; legacy references do not invent historical inputs or approvals."),
  evidence("SEV-ADOPT-RIGHTS", "repository_file", "supabase/migrations/20260917160915_contextual_adoption_dependency_revalidation.sql", "Derived working bases intersect pinned and current read, derive and store rights."),
  evidence("SEV-ADOPT-IDENTITY", "repository_file", "supabase/migrations/20260917160926_contextual_adoption_identity_command.sql", "Explicit local identity review is scoped and retry safe without inferring identity by name."),
  evidence("SEV-ADOPT-CONTRACT", "repository_file", "packages/domain-contracts/src/contextual-adoption.ts", "Typed work, purpose, expected revision and exact decimal interpretation contracts."),
  evidence("SEV-ADOPT-SQL", "automated_test", "supabase/tests/contextual_adoption.sql", "Competing revisions, source provenance, covenants, precision, immutable history and access denials."),
  evidence("SEV-ADOPT-DEPENDENCIES", "automated_test", "supabase/tests/contextual_adoption_dependencies.sql", "Retaining source read cannot retain a derivative after derive/store withdrawal."),
  evidence("SEV-ADOPT-EXECUTION", "automated_test", "supabase/tests/contextual_adoption_execution.sql", "Installed execution triggers reject wrong fingerprints and retain honest legacy classification."),
  evidence("SEV-ADOPT-CONCURRENCY", "automated_test", "scripts/ci/test-adoption-concurrency.py", "Two actual local database sessions prove lock wait and single-winner compare-and-swap."),
  evidence("SEV-ADOPT-DIFF", "automated_test", "packages/case-understanding/src/adoption-difference.test.ts", "Comparison preserves source references and distinguishes assumptions and contexts."),
  evidence("SEV-ADOPT-MATH", "automated_test", "packages/financial-model/src/adopted-basis.test.ts", "Exact version and digest guard deterministic calculation without ranking or implicit input fallback."),
  evidence("SEV-ADOPT-SELECTION", "automated_test", "packages/financial-model/src/institutional-input.test.ts", "Explicit configured source selection remains independent of ranked reference."),
  evidence("SEV-ADOPT-E2E", "automated_test", "apps/web/e2e/contextual-adoption.spec.ts", "Real user actions preserve revisions, repeat prior calculations and render desktop/mobile."),
  evidence("SEV-ADOPT-INSTALLATION", "repository_file", "docs/build/arcabouco/etapa-09-installation.json", "Five installed matching migrations, 23 equal functions and no production fixture rows."),
  evidence("SEV-ADOPT-INSTALLED-EVAL", "repository_file", "docs/build/arcabouco/etapa-09-installed-eval.json", "82 installed staging SQL contracts and production no-session denials."),

  evidence("SEV-OBS-SCHEMA", "repository_file", "supabase/migrations/20260917134931_observations_metric_definitions.sql", "Immutable observations and definitions preserve lineage and emit atomic audit/outbox without granting adoption."),
  evidence("SEV-OBS-AUTHORITY", "repository_file", "supabase/migrations/20260917134939_observation_commands_work_authority.sql", "Observation commands require the current dossier work capability."),
  evidence("SEV-OBS-VALUES", "repository_file", "supabase/migrations/20260917134946_observation_value_shape_validation.sql", "Typed values reject invalid numbers and dates at the SQL boundary."),
  evidence("SEV-OBS-DIMENSIONS", "repository_file", "supabase/migrations/20260917135001_observation_dimension_shape_validation.sql", "Dimension shape, decimal scale and real dates are validated without inference."),
  evidence("SEV-OBS-DOSSIER", "repository_file", "supabase/migrations/20260917134924_opportunity_observation_dossier_scope.sql", "Opportunity observations use their own resource authority instead of broader company access."),
  evidence("SEV-OBS-REVISION", "repository_file", "supabase/migrations/20260917134953_legacy_observation_field_revision.sql", "Legacy field correction appends history inside the same dossier and source record."),
  evidence("SEV-OBS-CONTRACT", "automated_test", "supabase/tests/observation_definition_contract.sql", "Exact decimals, distinct dimensions, immutable contributions, unauthorized writes and source revocation."),
  evidence("SEV-OBS-HISTORY", "automated_test", "supabase/tests/observation_legacy_history.sql", "Same-transaction revisions preserve their order and provenance; deleting compatibility rows cannot erase assertions."),
  evidence("SEV-OBS-PINNED", "automated_test", "supabase/tests/observation_pinned_rights.sql", "A widened current license cannot erase an expired right pinned on an observation or contractual definition."),
  evidence("SEV-OBS-READING", "repository_file", "packages/reconciliation/src/facts.ts", "Ranking orders reading only; conflicts and missing unit, perimeter, scale or monetary currency block dependent calculations."),
  evidence("SEV-OBS-READING-EVAL", "automated_test", "packages/reconciliation/src/scope.test.ts", "Dimension and conflicting-reading regression tests preserve contributions and deny ambiguous calculations."),
  evidence("SEV-OBS-DECIMAL", "automated_test", "apps/web/src/lib/intake/format.test.ts", "Persistent decimal parsing preserves precision and rejects exponent or textual-scale erasure."),
  evidence("SEV-OBS-INSTALLATION", "repository_file", "docs/build/arcabouco/etapa-08-installation.json", "Six matching migrations, 25 matching functions, 228 backfilled observations and production denial checks without fixtures."),
  evidence("SEV-OBS-INSTALLED-EVAL", "repository_file", "docs/build/arcabouco/etapa-08-installed-eval.json", "79 installed staging SQL contracts pass with synthetic rollback and explicit transport retry history."),

  evidence("SEV-RIGHTS-SCHEMA", "repository_file", "supabase/migrations/20260917025326_source_rights_and_authorized_retrieval.sql", "Versioned rights restrict current authority, intersect pinned dependencies and deny unknown usage before retrieval or cache reuse."),
  evidence("SEV-RIGHTS-RETRIEVAL", "automated_test", "supabase/tests/source_rights_retrieval.sql", "Unknown rights, purpose, export and Storage denial, pinned restrictions, conflicting parents, tampered chunks and audit/outbox."),
  evidence("SEV-RIGHTS-DEADLINE", "automated_test", "supabase/tests/source_rights_deadline.sql", "Expiry advances during one long SQL request; request-start time cannot preserve a lapsed right."),
  evidence("SEV-RIGHTS-DELIVERY", "automated_test", "supabase/tests/source_rights_retrieval_delivery.sql", "A real derivation revocation after selection prevents delivery even when processing and storage remain allowed."),
  evidence("SEV-RIGHTS-SCOPE", "automated_test", "supabase/tests/source_rights_search_isolation.sql", "Batched retrieval and its private entrypoint preserve dossier, current workspace and non-content administrative boundaries."),
  evidence("SEV-RIGHTS-JOB", "automated_test", "supabase/tests/source_rights_worker_revocation.sql", "Processing revocation invalidates a leased capability and regrant does not resurrect that job."),
  evidence("SEV-RIGHTS-PERFORMANCE", "automated_test", "supabase/tests/source_rights_performance.sql", "Bounded retrieval over 501 chunks records EXPLAIN/BUFFERS and checks rights/dependency indexes."),
  evidence("SEV-RIGHTS-PUBLIC-CACHE", "automated_test", "supabase/tests/public_research_public_cache.sql", "Exact payload licensing, real human licensing command, substituted payload denial and cache denial after license withdrawal."),
  evidence("SEV-RIGHTS-ADAPTER", "repository_file", "packages/governed-retrieval/src/retrieve.ts", "Production adapter invokes the capability-bound SQL RPC and validates results without JavaScript authorization or reranking."),
  evidence("SEV-RIGHTS-ADAPTER-EVAL", "automated_test", "packages/governed-retrieval/src/authorized-retrieval.test.ts", "Capability binding, denial propagation, bounded input, response validation and preserved SQL citations."),
  evidence("SEV-RIGHTS-REGISTRY", "repository_file", "packages/public-research/src/source-registry.ts", "Source classification requires a separate versioned reuse right and does not infer a persistence license."),
  evidence("SEV-RIGHTS-INSTALLATION", "repository_file", "docs/build/arcabouco/etapa-07-installation.json", "Matching journal SQL and 32 functions; 28 explicit acceptance rights with audit/outbox and read-only production denials."),
  evidence("SEV-RIGHTS-INSTALLED-EVAL", "repository_file", "docs/build/arcabouco/etapa-07-installed-eval.json", "All 76 SQL contracts pass on installed staging schema with synthetic rollback and recorded retries/performance."),

  evidence("SEV-SOURCE-PDF-STRUCTURE", "repository_file", "packages/document-intelligence/src/pdf-structure.ts", "PDF object inspection distinguishes stream bytes from executable names, with bounded object-stream inflation and fail-closed unsupported structures."),
  evidence("SEV-SOURCE-PDF-REGRESSION", "automated_test", "packages/document-intelligence/src/pdf-structure.test.ts", "Real corpus image false positive, escaped/compressed JavaScript, encrypted and embedded objects, inflation and nesting bounds."),
  evidence("SEV-SOURCE-E2E", "repository_file", "apps/web/e2e/support/source-verification.ts", "Local-only E2E downloads actual uploaded bytes through the delegated worker Storage boundary and records an E0 receipt; no production fixtures or fake verification timestamps."),
  evidence("SEV-SOURCE-SCHEMA", "repository_file", "supabase/migrations/20260916212202_logical_sources_and_versions.sql", "Immutable byte versions, explicit uses, exact extraction anchors and worker-only byte verification."),
  evidence("SEV-SOURCE-LEGACY-INSERT", "repository_file", "supabase/migrations/20260916212209_source_identity_legacy_insert_default.sql", "Legacy opportunity upload keeps an atomic source projection without new grants."),
  evidence("SEV-SOURCE-ISOLATION", "automated_test", "supabase/tests/source_version_identity.sql", "Version integrity, scoped deduplication, preserved uses and anchors, Storage denial, forged receipt and revocation."),
  evidence("SEV-SOURCE-CONTRACT", "automated_test", "packages/domain-contracts/src/source-version.test.ts", "Unverified historical identity never invents proof; verified versions require hash and size."),
  evidence("SEV-SOURCE-JOB", "automated_test", "apps/document-worker/src/source-version.test.ts", "Historical payload compatibility and rejection of substituted byte versions."),
  evidence("SEV-SOURCE-STORAGE", "automated_test", "apps/document-worker/src/job-storage.test.ts", "Immutable retry compares exact bytes and rechecks delegated authority before returning."),
  evidence("SEV-SOURCE-DOWNLOAD", "automated_test", "apps/web/src/app/[locale]/app/documents/[documentId]/route.test.ts", "No byte delivery after initial denial, revocation during I/O or malformed reauthorization."),
  evidence("SEV-SOURCE-INSTALLED-EVAL", "repository_file", "docs/build/arcabouco/etapa-06-installed-eval.json", "All 69 SQL contracts pass on installed staging schema with synthetic rollback."),
  evidence("SEV-SOURCE-INSTALLATION", "repository_file", "docs/build/arcabouco/etapa-06-installation.json", "Matching journal SQL, 27 identical functions and 28 preserved source versions in production; old verification EXECUTE denied."),
  evidence("SEV-SOURCE-BEFORE", "repository_file", "docs/build/arcabouco/source-verification-before.json", "Historical staging reproduction proves both unauthorized hash mutation and verification before the remediation."),
  evidence("SEV-SOURCE-BEFORE-SQL", "repository_file", "docs/build/arcabouco/source-verification-before.sql", "Synthetic rollback reproduction establishes denied document authority before exercising the legacy verification RPC."),

  evidence("SEV-DOSSIER-SCHEMA", "repository_file", "supabase/migrations/20260916190600_entity_and_dossier_identity.sql", "Entity identity remains separate from private resource authority; reviewed temporal links and isolated dossiers."),
  evidence("SEV-DOSSIER-ISOLATION", "automated_test", "supabase/tests/entity_dossier_isolation.sql", "Homonyms, shared public identifier, same-tenant and cross-tenant denial, revocation, reviewed history and legacy profile authority."),
  evidence("SEV-DOSSIER-PUBLIC-CACHE", "automated_test", "supabase/tests/public_research_public_cache.sql", "Public memory requires proven identity and the current job delegation; private cross-dossier access remains absent."),
  evidence("SEV-DOSSIER-CONTRACT", "automated_test", "packages/domain-contracts/src/entity-dossier.test.ts", "Candidate identity never grants authority; dossier requires resource, dates and human review."),
  evidence("SEV-DOSSIER-WORKER", "automated_test", "apps/document-worker/src/public-company-memory.test.ts", "Capability-bound public subject, unresolved-name cache omission and fail-closed revoked authority."),
  evidence("SEV-DOSSIER-INSTALLED-EVAL", "repository_file", "docs/build/arcabouco/etapa-05-installed-eval.json", "68 installed staging SQL contracts with rollback, 31 function parity and zero security advisor lints."),
  evidence("SEV-DOSSIER-INSTALLATION", "repository_file", "docs/build/arcabouco/etapa-05-installation.json", "Matching journal SQL in both environments and read-only production backfill verification without fixtures."),

  evidence("SEV-POLICY-SCHEMA", "repository_file", "supabase/migrations/20260916163753_resource_policy_and_barriers.sql", "One Postgres evaluator for explicit grants, flat groups, barriers, purposes and bounded delegated workers."),
  evidence("SEV-POLICY-RESOURCE-BOUND", "repository_file", "supabase/migrations/20260916163756_bound_policy_grants_to_resource.sql", "Child grants do not expand to roots or siblings; explicit deny remains distinct from legacy revocation tombstones."),
  evidence("SEV-POLICY-BARRIERS", "automated_test", "supabase/tests/resource_policy_barriers.sql", "Deny precedence, intersecting barriers, group expiry and purpose restrictions."),
  evidence("SEV-POLICY-DELEGATION", "automated_test", "supabase/tests/resource_policy_delegation.sql", "Human, job, resource, worker credential, account and expiry binding; revocation blocks publication."),
  evidence("SEV-POLICY-ISOLATION", "automated_test", "supabase/tests/resource_policy_isolation.sql", "Cross-tenant, direct-table and administrative bypass denials."),
  evidence("SEV-POLICY-EVENT-ONCE", "automated_test", "supabase/tests/resource_policy_event_once.sql", "One event for a material purpose change, none for no-op retry."),
  evidence("SEV-POLICY-TYPED-CONTRACT", "automated_test", "packages/access-policy/src/contract.test.ts", "No role-inferred authority, hidden-object explanations or delegated group membership; SQL vector parity."),
  evidence("SEV-POLICY-EXPORT", "repository_file", "apps/web/src/lib/auth/resource-download.ts", "Server-side export policy gate before issuing document downloads."),
  evidence("SEV-POLICY-INSTALLED-EVAL", "repository_file", "docs/build/arcabouco/etapa-03-installed-eval.json", "67 installed staging SQL contracts, measured synthetic policy latency and parity of 53 functions."),

  evidence("SEV-WORKSPACE-IDENTITY", "repository_file", "supabase/migrations/20260916035105_explicit_workspace_context.sql", "Explicit personal/institutional context and private commercial accounts."),
  evidence("SEV-WORKSPACE-CONTEXT-REGRESSION", "automated_test", "supabase/tests/explicit_workspace_context.sql", "Ambiguous context and cross-workspace denial regressions."),
  evidence("SEV-OUTBOX-SCHEMA", "repository_file", "supabase/migrations/20260916102242_reconcile_domain_event_audit_outbox.sql", "Transactional authority events, isolated snapshots and bounded leases."),
  evidence("SEV-OUTBOX-CONSUMER", "repository_file", "apps/document-worker/src/event-outbox.ts", "Content-free bounded consumer with idempotent completion."),
  evidence("SEV-OUTBOX-REVOCATION", "automated_test", "supabase/tests/domain_event_outbox_revocation.sql", "Revocation cancels stale jobs; audit failure rolls back the effect."),
  evidence("SEV-OUTBOX-CONTRACT", "automated_test", "supabase/tests/domain_event_outbox.sql", "Producer rollback, lease replacement, account binding and immutable audit."),
  evidence("SEV-OUTBOX-MONITORING", "configuration", "apps/document-worker/monitoring/event-outbox-alarms.json", "Four bounded operational alarms for the event consumer."),

  evidence("SEV-CREATOR-REMEDIATION", "repository_file", "docs/build/arcabouco/etapa-1a.md", "Stage 1A authority and installed database proof."),
  evidence("SEV-ACCESS-REMEDIATION", "repository_file", "docs/build/arcabouco/etapa-1b.md", "Stage 1B explicit resource access and production transition."),
  evidence("SEV-PROFILE-REMEDIATION", "repository_file", "docs/build/arcabouco/etapa-1c.md", "Stage 1C role-free context and installed database proof."),
  evidence("SEV-CREATOR-REGRESSION", "automated_test", "supabase/tests/creator_authority_revocation.sql", "Creator revocation and denied self-reactivation."),
  evidence("SEV-ACCESS-REGRESSION", "automated_test", "supabase/tests/legacy_access_revocation.sql", "Resource revocation reaches claims and job publication."),
  evidence("SEV-PROFILE-REGRESSION", "automated_test", "supabase/tests/role_free_reasoning_context.sql", "Role-free loaders and denied internal entry points."),

  evidence("SEV-AGENTS-SCOPE", "repository_file", "AGENTS.md", "Repository operating rules and observed deployment boundaries."),
  evidence("SEV-SECURITY-PLAN", "design_reference", "docs/security/ENTERPRISE_SECURITY_COMPLIANCE_READINESS_PLAN.md", "Security readiness design reference; this is not proof of current operation."),
  evidence("SEV-ENV-NAMES", "configuration", ".env.example", "Configuration names and secret-store expectations without secret values."),
  evidence("SEV-WORKER-TASK", "configuration", "apps/document-worker/task-definition.json", "Worker runtime, role names, provider switches and secret references by name."),
  evidence("SEV-WORKER-RUNTIME", "repository_file", "apps/document-worker/src/main.ts", "Worker authentication, independent outbox loop, capability use, logging and provider wiring."),
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
  evidence("SEV-EVAL-DOCUMENT-WORK", "configuration", ".github/workflows/document-work-product-live.yml", "Synthetic documentary, synthesis and advisor-response evaluations through the existing evaluation OIDC role."),
  evidence("SEV-EVAL-DOCUMENT-CONTINUATION", "configuration", ".github/workflows/document-work-product-continuation.yml", "One-time continuation consumes an earlier synthetic evaluation receipt and a bounded Anthropic call."),
  evidence("SEV-CI-SCANNER", "configuration", ".github/workflows/documentary-scanner.yml", "Synthetic clean and EICAR controls for the isolated CI scanner."),
  evidence("SEV-CI-SCANNER-START", "repository_file", "scripts/ci/start-documentary-scanner.sh", "Ubuntu packages, freshclam definition updates and loopback clamd under the packaged AppArmor profile."),
  evidence("SEV-DEPLOY-BOOT-PROOF", "repository_file", "scripts/ci/verify-worker-boot-flag.py", "Read-only diagnostic helper returns success on unavailable AWS reads and fails on a contradictory boot flag."),
  evidence("SEV-ORG-AUTHORITY-SQL", "repository_file", "supabase/migrations/20260815014649_platform_foundation.sql", "Historical definition grants organization management through created_by independently of active membership."),
  evidence("SEV-PROJECT-ACCESS-SQL", "repository_file", "supabase/migrations/20260901035248_universal_capital_projects.sql", "Historical capital-project helper accepts active organization membership without project-specific read authority."),
  evidence("SEV-INTAKE-ACCESS-SQL", "repository_file", "supabase/migrations/20260817202038_document_first_intake.sql", "Historical intake helper accepts broad active organization membership."),
  evidence("SEV-DEBT-VIEW-PROMPT", "repository_file", "apps/document-worker/src/company-debt-view.ts", "Role-free debt-view request builder after stage 1C."),
  evidence("SEV-ORIGINATION-PROMPT", "repository_file", "apps/document-worker/src/origination-thesis.ts", "Role-free origination request builder after stage 1C."),
  evidence("SEV-CAPITAL-PLANNING-PROMPT", "repository_file", "apps/document-worker/src/capital-planning.ts", "Role-free capital planning request builder after stage 1C."),
  evidence("SEV-AWS-DEPLOY-ROLE-SNAPSHOT", "operator_observation", "docs/security/evidence/aws-worker-rollout-diagnostics-wave-14.json", "Codex read-only delivery observation: deployed revision, consumer heartbeat and alarm states; the OIDC monitoring role denied DescribeAlarms. Broader effective IAM permissions remain unknown; no independent IAM assurance is inferred."),
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
    evidenceRefs: ["SEV-METHOD-UI", "SEV-METHOD-UI-E2E", "SEV-POLICY-TYPED-CONTRACT", "SEV-POLICY-EXPORT", "SEV-WORKSPACE-IDENTITY", "SEV-WORKSPACE-CONTEXT-REGRESSION", "SEV-AGENTS-SCOPE", "SEV-WEB-DEPENDENCIES", "SEV-WEB-UPLOAD"], gapRefs: ["SG-LIVE-CONFIG", "SG-TELEMETRY-ASSURANCE", "SG-OWNER-ASSIGNMENT", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-APP-01", "TRUST-APP-02", "TRUST-DATA-01"],
  },
  {
    systemId: "SYS-SUPABASE", title: "Supabase data platform", kind: "database_platform", purpose: "Authentication, Postgres, RLS, private storage and database commands.",
    environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-DEVELOPMENT", "ENV-CI"], dataClassIds: ["internal_operational", "personal_data", "customer_confidential", "restricted_financial", "credential_secret", "security_evidence"],
    vendorRefs: ["VEN-SUPABASE"], owner: owner("Data platform owner", "Data security owner"), evidenceRefs: ["SEV-METHOD-SCHEMA", "SEV-METHOD-PUBLICATION-TEST", "SEV-METHOD-RIGHTS-TEST", "SEV-METHOD-LEGACY-TEST", "SEV-VAULT-LEGACY-GRANTS", "SEV-VAULT-SCHEMA", "SEV-VAULT-LEGACY", "SEV-VAULT-RECEIPTS", "SEV-CONTRIBUTION-AUDIT", "SEV-CONTRIBUTION-SCHEMA", "SEV-CONTRIBUTION-INTEGRITY", "SEV-WORK-STORAGE", "SEV-WORK-COMMANDS", "SEV-WORK-LEGACY", "SEV-WORK-SPECIALIZED", "SEV-WORK-REPLAY", "SEV-ADOPT-SCHEMA", "SEV-ADOPT-BINDING", "SEV-ADOPT-RIGHTS", "SEV-ADOPT-SQL", "SEV-ADOPT-EXECUTION", "SEV-ADOPT-INSTALLATION", "SEV-ADOPT-INSTALLED-EVAL", "SEV-OBS-SCHEMA", "SEV-OBS-AUTHORITY", "SEV-OBS-VALUES", "SEV-OBS-DIMENSIONS", "SEV-OBS-DOSSIER", "SEV-OBS-CONTRACT", "SEV-OBS-HISTORY", "SEV-OBS-INSTALLATION", "SEV-OBS-INSTALLED-EVAL", "SEV-RIGHTS-SCHEMA", "SEV-RIGHTS-RETRIEVAL", "SEV-RIGHTS-DEADLINE", "SEV-RIGHTS-DELIVERY", "SEV-RIGHTS-SCOPE", "SEV-RIGHTS-PERFORMANCE", "SEV-RIGHTS-INSTALLATION", "SEV-RIGHTS-INSTALLED-EVAL", "SEV-SOURCE-SCHEMA", "SEV-SOURCE-LEGACY-INSERT", "SEV-SOURCE-ISOLATION", "SEV-SOURCE-INSTALLED-EVAL", "SEV-SOURCE-INSTALLATION", "SEV-SOURCE-BEFORE", "SEV-SOURCE-BEFORE-SQL", "SEV-DOSSIER-SCHEMA", "SEV-DOSSIER-ISOLATION", "SEV-DOSSIER-INSTALLED-EVAL", "SEV-DOSSIER-INSTALLATION", "SEV-POLICY-SCHEMA", "SEV-POLICY-RESOURCE-BOUND", "SEV-POLICY-BARRIERS", "SEV-POLICY-ISOLATION", "SEV-POLICY-INSTALLED-EVAL", "SEV-WORKSPACE-IDENTITY", "SEV-OUTBOX-SCHEMA", "SEV-OUTBOX-CONTRACT", "SEV-OUTBOX-REVOCATION", "SEV-CREATOR-REMEDIATION", "SEV-ACCESS-REMEDIATION", "SEV-CREATOR-REGRESSION", "SEV-ACCESS-REGRESSION", "SEV-SUPABASE-CONFIG", "SEV-RLS-TEST", "SEV-AGENTS-SCOPE"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-BACKUP-RESTORE", "SG-DATA-LIFECYCLE", "SG-SCHEMA-BEFORE-CODE", "SG-ENV-SEPARATION", "SG-PRIVACY-RECORDS", "SG-OWNER-ASSIGNMENT", ], controlIds: ["TRUST-DATA-01", "TRUST-APP-01", "TRUST-OPS-02"],
  },
  {
    systemId: "SYS-WORKER", title: "Document and case worker", kind: "worker", purpose: "Capability-scoped document processing, research, analysis, artifact generation and independent authority-event consumption.",
    environmentRefs: ["ENV-PRODUCTION", "ENV-DEVELOPMENT", "ENV-CI"], dataClassIds: ["public", "internal_operational", "customer_confidential", "restricted_financial", "credential_secret", "security_evidence"],
    vendorRefs: ["VEN-AWS", "VEN-SUPABASE", "VEN-ANTHROPIC", "VEN-OPENAI", "VEN-PERPLEXITY", "VEN-FIRECRAWL"], owner: owner("Document platform owner", "Platform engineering owner"),
    evidenceRefs: ["SEV-METHOD-WORKER", "SEV-METHOD-WORKER-TEST", "SEV-METHOD-PIN-TEST", "SEV-METHOD-CALLBACK", "SEV-PROCEDURE-PROJECTION", "SEV-PROCEDURE-WORKER", "SEV-PROCEDURE-WORKER-TEST", "SEV-VAULT-WORKER-AUTHORITY", "SEV-WORK-RUNTIME", "SEV-WORK-RUNTIME-TEST", "SEV-ADOPT-CONTRACT", "SEV-ADOPT-SELECTION", "SEV-OBS-READING", "SEV-OBS-READING-EVAL", "SEV-OBS-REVISION", "SEV-RIGHTS-JOB", "SEV-RIGHTS-ADAPTER", "SEV-RIGHTS-ADAPTER-EVAL", "SEV-RIGHTS-DELIVERY", "SEV-SOURCE-JOB", "SEV-SOURCE-STORAGE", "SEV-SOURCE-PDF-STRUCTURE", "SEV-SOURCE-PDF-REGRESSION", "SEV-SOURCE-E2E", "SEV-DOSSIER-WORKER", "SEV-DOSSIER-PUBLIC-CACHE", "SEV-POLICY-DELEGATION", "SEV-POLICY-EVENT-ONCE", "SEV-OUTBOX-CONSUMER", "SEV-OUTBOX-CONTRACT", "SEV-OUTBOX-REVOCATION", "SEV-PROFILE-REMEDIATION", "SEV-PROFILE-REGRESSION", "SEV-WORKER-TASK", "SEV-WORKER-RUNTIME", "SEV-WORKER-CONFIG"], gapRefs: ["SG-LIVE-CONFIG", "SG-PROVIDER-ASSURANCE", "SG-SCHEMA-BEFORE-CODE", "SG-OWNER-ASSIGNMENT", "SG-LOGGING-CONTENT-SAFETY", "SG-ASSET-DISCOVERY", ], controlIds: ["TRUST-DOC-01", "TRUST-DOC-02", "TRUST-AI-01", "TRUST-CLOUD-01"],
  },
  {
    systemId: "SYS-GITHUB", title: "GitHub source and delivery control plane", kind: "delivery_pipeline", purpose: "Source control, pull requests, CI, security analysis and deployment identity.",
    environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "credential_secret", "security_evidence"], vendorRefs: ["VEN-GITHUB", "VEN-AWS", "VEN-ANTHROPIC", "VEN-OPENAI", "VEN-PERPLEXITY", "VEN-SHEETJS-CDN", "VEN-UBUNTU-PACKAGES", "VEN-CLAMAV-DEFINITIONS"],
    owner: owner("Engineering governance owner", "Product security owner"), evidenceRefs: ["SEV-METHOD-COMPOSITION", "SEV-METHOD-COMPOSITION-TEST", "SEV-METHOD-CONCURRENCY", "SEV-PROCEDURE-COMPONENTS", "SEV-PROCEDURE-COMPILER", "SEV-PROCEDURE-NEGATIVES", "SEV-PROCEDURE-BUILD", "SEV-PROCEDURE-PROJECTION-TEST", "SEV-PROCEDURE-AUTHORING", "SEV-PROCEDURE-CANDIDATE", "SEV-QUALITY-WORKFLOW", "SEV-SECURITY-WORKFLOW", "SEV-DEPLOY-WORKER", "SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-PROBE", "SEV-EVAL-CODEX", "SEV-EVAL-LIVE-GATE", "SEV-EVAL-DOCUMENT-WORK", "SEV-EVAL-DOCUMENT-CONTINUATION", "SEV-DEPLOY-BOOT-PROOF", "SEV-CI-SCANNER", "SEV-CI-SCANNER-START"],
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
    dataClassIds: ["internal_operational", "personal_data", "customer_confidential", "restricted_financial", "security_evidence"], tenancyBoundary: "A common Postgres evaluator intersects explicit grants, flat groups, deny rules, barriers and purposes. Installed definitions and negative staging contracts are verified for stage 3; universal live completeness remains unverified.",
    retentionState: "unknown", backupState: "provider_managed_unverified", owner: owner("Data platform owner", "Data security owner"), evidenceRefs: ["SEV-VAULT-LEGACY-NEGATIVE", "SEV-VAULT-EXPORT", "SEV-VAULT-HUMAN", "SEV-VAULT-ISOLATION", "SEV-VAULT-DERIVED", "SEV-VAULT-CONCURRENCY", "SEV-CONTRIBUTION-ISOLATION", "SEV-CONTRIBUTION-RIGHTS", "SEV-CONTRIBUTION-CONCURRENCY", "SEV-WORK-STORAGE-SQL", "SEV-WORK-ENTRY-SQL", "SEV-WORK-LEGACY-SQL", "SEV-ADOPT-SCHEMA", "SEV-ADOPT-DEPENDENCIES", "SEV-ADOPT-CONCURRENCY", "SEV-OBS-SCHEMA", "SEV-OBS-HISTORY", "SEV-OBS-PINNED", "SEV-RIGHTS-SCHEMA", "SEV-RIGHTS-RETRIEVAL", "SEV-RIGHTS-PUBLIC-CACHE", "SEV-SOURCE-SCHEMA", "SEV-SOURCE-ISOLATION", "SEV-DOSSIER-SCHEMA", "SEV-DOSSIER-ISOLATION", "SEV-POLICY-SCHEMA", "SEV-POLICY-BARRIERS", "SEV-POLICY-ISOLATION", "SEV-OUTBOX-SCHEMA", "SEV-ACCESS-REMEDIATION", "SEV-PROFILE-REMEDIATION", "SEV-RLS-TEST", "SEV-SUPABASE-CONFIG"],
    gapRefs: ["SG-DATA-LIFECYCLE", "SG-BACKUP-RESTORE", "SG-LIVE-CONFIG", "SG-PRIVACY-RECORDS", ], controlIds: ["TRUST-DATA-01", "TRUST-DATA-02", "TRUST-OPS-02"],
  },
  {
    storeId: "STORE-OBJECTS", title: "Supabase private object storage", systemRef: "SYS-SUPABASE", environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-DEVELOPMENT", "ENV-CI"],
    dataClassIds: ["customer_confidential", "restricted_financial", "security_evidence"], tenancyBoundary: "Private buckets require current resource authority and export purpose or a delegated worker lease. Registered bytes cannot be overwritten or deleted by authenticated clients; document delivery uses reauthorized no-store routes, not reusable bearer URLs. Complete provider configuration remains unverified.",
    retentionState: "unknown", backupState: "provider_managed_unverified", owner: owner("Data platform owner", "Document platform owner"), evidenceRefs: ["SEV-RIGHTS-RETRIEVAL", "SEV-RIGHTS-JOB", "SEV-SOURCE-STORAGE", "SEV-SOURCE-ISOLATION", "SEV-POLICY-SCHEMA", "SEV-POLICY-EXPORT", "SEV-WEB-UPLOAD", "SEV-RLS-TEST"],
    gapRefs: ["SG-DATA-LIFECYCLE", "SG-BACKUP-RESTORE", "SG-LIVE-CONFIG"], controlIds: ["TRUST-DATA-01", "TRUST-DATA-02", "TRUST-OPS-02"],
  },
  {
    storeId: "STORE-CLOUDWATCH", title: "Worker operational logs", systemRef: "SYS-WORKER", environmentRefs: ["ENV-PRODUCTION"], dataClassIds: ["internal_operational", "security_evidence"],
    tenancyBoundary: "Logs are intended to exclude customer content, but direct error-message paths are not comprehensively governed or tested.", retentionState: "unknown", backupState: "unknown",
    owner: owner("Security operations owner", "Platform engineering owner"), evidenceRefs: ["SEV-OUTBOX-MONITORING", "SEV-WORKER-TASK", "SEV-WORKER-RUNTIME"], gapRefs: ["SG-LIVE-CONFIG", "SG-DATA-LIFECYCLE", "SG-LOGGING-CONTENT-SAFETY"], controlIds: ["TRUST-OPS-01", "TRUST-DATA-02", "TRUST-CLOUD-01"],
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
    flowId: "FLOW-CI-SCANNER-PACKAGES", title: "CI scanner package acquisition", sourceRef: "VEN-UBUNTU-PACKAGES", destinationRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["public", "internal_operational"], purpose: "Install clamav and clamav-daemon on disposable runners using apt repositories.", authorizationBoundary: "Runner sudo installs packages; exact repository mirror, package versions and update provenance are not pinned by this script.", direction: "inbound",
    owner: owner("Platform security owner", "Engineering governance owner"), evidenceRefs: ["SEV-CI-SCANNER", "SEV-CI-SCANNER-START"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-SDLC-02", "TRUST-VENDOR-01"],
  },
  {
    flowId: "FLOW-CI-SCANNER-DEFINITIONS", title: "CI scanner definition updates", sourceRef: "VEN-CLAMAV-DEFINITIONS", destinationRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["public", "internal_operational"], purpose: "Refresh malware definitions before clean and EICAR synthetic controls; no customer document is uploaded to the definition service.", authorizationBoundary: "freshclam must succeed; clamd listens on loopback under the packaged AppArmor profile.", direction: "inbound",
    owner: owner("Platform security owner", "Document platform owner"), evidenceRefs: ["SEV-CI-SCANNER-START"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-DOC-01", "TRUST-SDLC-02", "TRUST-VENDOR-01"],
  },
  {
    flowId: "FLOW-GITHUB-WORKER-DIAGNOSTICS", title: "Deployment diagnostic reads from AWS", sourceRef: "VEN-AWS", destinationRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-PRODUCTION", "ENV-EXTERNAL"],
    dataClassIds: ["internal_operational", "security_evidence"], purpose: "Read task inventory and filtered worker.boot records after rollout; retain only task identity, flag, timestamp and diagnostic status.", authorizationBoundary: "Deployment OIDC role; missing read permission produces unavailable evidence rather than proof of a flag or permission.", direction: "inbound",
    owner: owner("Cloud security owner", "Security operations owner"), evidenceRefs: ["SEV-DEPLOY-WORKER", "SEV-DEPLOY-BOOT-PROOF", "SEV-AWS-DEPLOY-ROLE-SNAPSHOT"], gapRefs: ["SG-DEPLOY-DIAGNOSTICS", "SG-LOGGING-CONTENT-SAFETY"], controlIds: ["TRUST-CLOUD-01", "TRUST-OPS-01", "TRUST-DATA-02"],
  },
  {
    flowId: "FLOW-WEB-DATA", title: "Web application to Supabase", sourceRef: "SYS-WEB", destinationRef: "SYS-SUPABASE", environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-PREVIEW", "ENV-DEVELOPMENT", "ENV-CI"],
    dataClassIds: ["internal_operational", "personal_data", "customer_confidential", "restricted_financial"], purpose: "Authentication, project state, commands and purpose-authorized private storage operations.",
    authorizationBoundary: "Publishable client plus authenticated session; the common database evaluator is authoritative. Export purpose is checked by the server download path and restrictive Storage policy; administrative authority does not imply content access.", direction: "internal", owner: owner("Application security owner", "Data security owner"),
    evidenceRefs: ["SEV-VAULT-E2E", "SEV-VAULT-ACTIONS", "SEV-VAULT-PROTOCOL", "SEV-CONTRIBUTION-ACTIONS", "SEV-CONTRIBUTION-E2E", "SEV-CONTRIBUTION-PROTOCOL", "SEV-WORK-CONTEXT", "SEV-WORK-WEB", "SEV-WORK-E2E", "SEV-WORK-AUTH-REPLAY", "SEV-ADOPT-IDENTITY", "SEV-ADOPT-E2E", "SEV-ADOPT-DIFF", "SEV-ADOPT-MATH", "SEV-OBS-AUTHORITY", "SEV-OBS-CONTRACT", "SEV-OBS-DECIMAL", "SEV-RIGHTS-SCOPE", "SEV-RIGHTS-RETRIEVAL", "SEV-SOURCE-CONTRACT", "SEV-SOURCE-ISOLATION", "SEV-SOURCE-DOWNLOAD", "SEV-DOSSIER-CONTRACT", "SEV-DOSSIER-ISOLATION", "SEV-POLICY-SCHEMA", "SEV-POLICY-TYPED-CONTRACT", "SEV-POLICY-EXPORT", "SEV-CREATOR-REMEDIATION", "SEV-ACCESS-REMEDIATION", "SEV-RLS-TEST", "SEV-WEB-UPLOAD"], gapRefs: ["SG-LIVE-CONFIG", "SG-ENV-SEPARATION", ], controlIds: ["TRUST-APP-01", "TRUST-DATA-01"],
  },
  {
    flowId: "FLOW-UPLOAD", title: "Browser document upload", sourceRef: "SYS-WEB", destinationRef: "SYS-SUPABASE", environmentRefs: ["ENV-PRODUCTION"], dataClassIds: ["customer_confidential", "restricted_financial"],
    purpose: "Send user-selected files directly to private object storage.", authorizationBoundary: "Tenant-scoped object path and storage policy; worker access uses a separate signed URL.", direction: "outbound",
    owner: owner("Document platform owner", "Data security owner"), evidenceRefs: ["SEV-WEB-UPLOAD", "SEV-RLS-TEST"], gapRefs: ["SG-LIVE-CONFIG", "SG-DATA-LIFECYCLE"], controlIds: ["TRUST-DATA-01", "TRUST-DOC-01"],
  },
  {
    flowId: "FLOW-DATA-WORKER", title: "Supabase job and document access to worker", sourceRef: "SYS-SUPABASE", destinationRef: "SYS-WORKER", environmentRefs: ["ENV-PRODUCTION"],
    dataClassIds: ["internal_operational", "customer_confidential", "restricted_financial", "security_evidence"], purpose: "Claim jobs and content-free authority events under separate bounded leases; deliver capability-scoped records and short-lived document access.",
    authorizationBoundary: "Delegated worker principal bound to the human, job, resource root, actual worker credential, authenticated account and lease expiry. Publication rechecks current policy under the organization authorization lock. Outbox uses its separate lease capability; snapshots remain private.", direction: "internal", owner: owner("Data security owner", "Document platform owner"),
    evidenceRefs: ["SEV-WORK-COMPILE", "SEV-WORK-RUNTIME", "SEV-ADOPT-CONTRACT", "SEV-ADOPT-SELECTION", "SEV-OBS-READING", "SEV-OBS-READING-EVAL", "SEV-OBS-REVISION", "SEV-RIGHTS-ADAPTER", "SEV-RIGHTS-JOB", "SEV-RIGHTS-PUBLIC-CACHE", "SEV-RIGHTS-REGISTRY", "SEV-SOURCE-JOB", "SEV-SOURCE-STORAGE", "SEV-DOSSIER-WORKER", "SEV-DOSSIER-PUBLIC-CACHE", "SEV-POLICY-DELEGATION", "SEV-POLICY-EVENT-ONCE", "SEV-OUTBOX-SCHEMA", "SEV-OUTBOX-CONSUMER", "SEV-OUTBOX-REVOCATION", "SEV-ACCESS-REMEDIATION", "SEV-PROFILE-REMEDIATION", "SEV-WORKER-RUNTIME", "SEV-RLS-TEST"], gapRefs: ["SG-LIVE-CONFIG", ], controlIds: ["TRUST-DATA-01", "TRUST-APP-01", "TRUST-DATA-03"],
  },
  {
    flowId: "FLOW-WORKER-ANTHROPIC", title: "Worker to Anthropic", sourceRef: "SYS-WORKER", destinationRef: "VEN-ANTHROPIC", environmentRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL"],
    dataClassIds: ["public", "customer_confidential", "restricted_financial"], purpose: "Task-specific model inference.", authorizationBoundary: "Gateway model allowlist, task policy, budget and optional data-assurance enforcement.",
    direction: "outbound", owner: owner("AI governance owner", "Data security owner"), evidenceRefs: ["SEV-PROFILE-REMEDIATION", "SEV-WORKER-RUNTIME", "SEV-MODEL-DATA-POLICY", "SEV-MODEL-POLICY"],
    gapRefs: ["SG-PROVIDER-ASSURANCE", "SG-LIVE-CONFIG", ], controlIds: ["TRUST-AI-01", "TRUST-AI-03", "TRUST-DATA-04"],
  },
  {
    flowId: "FLOW-WORKER-OPENAI", title: "Worker to OpenAI", sourceRef: "SYS-WORKER", destinationRef: "VEN-OPENAI", environmentRefs: ["ENV-PRODUCTION", "ENV-EXTERNAL"],
    dataClassIds: ["public", "customer_confidential", "restricted_financial"], purpose: "Task-specific primary, shadow, fallback or optional public-search calls.", authorizationBoundary: "Gateway policy and per-job capability boundary.",
    direction: "outbound", owner: owner("AI governance owner", "Data security owner"), evidenceRefs: ["SEV-PROFILE-REMEDIATION", "SEV-MODEL-POLICY", "SEV-MODEL-DATA-POLICY"],
    gapRefs: ["SG-PROVIDER-ASSURANCE", "SG-LIVE-CONFIG", ], controlIds: ["TRUST-AI-01", "TRUST-AI-03", "TRUST-DATA-04"],
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
    direction: "outbound", owner: owner("Platform engineering owner", "Engineering governance owner"), evidenceRefs: ["SEV-DEPLOY-WORKER", "SEV-WORKER-TASK", "SEV-DEPLOY-BOOT-PROOF"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-PRIVILEGED-ACCESS", "SG-DEPLOY-DIAGNOSTICS", "SG-SCHEMA-BEFORE-CODE"], controlIds: ["TRUST-DATA-03", "TRUST-CLOUD-01", "TRUST-SDLC-01"],
  },
  {
    flowId: "FLOW-GITHUB-EVAL-SECRETS", title: "GitHub evaluations to AWS Secrets Manager", sourceRef: "SYS-GITHUB", destinationRef: "VEN-AWS", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["credential_secret", "internal_operational", "security_evidence"], purpose: "Exchange a dedicated evaluation OIDC identity for a short-lived AWS session and retrieve named model-provider credentials during selected workflows.",
    authorizationBoundary: "Dedicated offroadGitHubEvalsRole is named in repository workflows; its trust policy, effective grants, use history and recertification are not independently verified.", direction: "outbound",
    owner: owner("AI governance owner", "Cloud security owner"), evidenceRefs: ["SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-PROBE", "SEV-EVAL-CODEX", "SEV-EVAL-LIVE-GATE", "SEV-EVAL-DOCUMENT-WORK", "SEV-EVAL-DOCUMENT-CONTINUATION"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-PRIVILEGED-ACCESS", "SG-PROVIDER-ASSURANCE", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-ID-01", "TRUST-DATA-03", "TRUST-AI-01", "TRUST-SDLC-01"],
  },
  {
    flowId: "FLOW-GITHUB-EVAL-ANTHROPIC", title: "GitHub evaluations to Anthropic", sourceRef: "SYS-GITHUB", destinationRef: "VEN-ANTHROPIC", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["public", "internal_operational", "security_evidence"], purpose: "Run synthetic extraction, routing, classification, documentary, synthesis, advisor-response and bounded continuation evaluations against Anthropic.",
    authorizationBoundary: "Workflow-scoped OIDC session and provider secret retrieved at run time; provider assurance, retention and complete prompt-content policy are not verified here.", direction: "outbound",
    owner: owner("AI governance owner", "Engineering governance owner"), evidenceRefs: ["SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-PROBE", "SEV-EVAL-LIVE-GATE", "SEV-EVAL-DOCUMENT-WORK", "SEV-EVAL-DOCUMENT-CONTINUATION"],
    gapRefs: ["SG-LIVE-CONFIG", "SG-PROVIDER-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-AI-01", "TRUST-AI-03", "TRUST-DATA-04", "TRUST-SDLC-01"],
  },
  {
    flowId: "FLOW-GITHUB-EVAL-OPENAI", title: "GitHub evaluations to OpenAI", sourceRef: "SYS-GITHUB", destinationRef: "VEN-OPENAI", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["public", "internal_operational", "security_evidence"], purpose: "Run synthetic extraction, routing, classification, documentary, synthesis, advisor-response and independent code-review workloads against OpenAI.",
    authorizationBoundary: "Workflow-scoped OIDC session and provider secret retrieved at run time; provider assurance, retention and complete prompt-content policy are not verified here.", direction: "outbound",
    owner: owner("AI governance owner", "Engineering governance owner"), evidenceRefs: ["SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-CODEX", "SEV-EVAL-DOCUMENT-WORK"],
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
    identityId: "ID-CI-CLAMD", title: "CI local scanner process", kind: "service_role", systemRef: "SYS-GITHUB", environmentRefs: ["ENV-CI"], privilege: "workload_scoped",
    authentication: "Runner sudo creates the service and clamd runs as the local clamav user on loopback; it has no tenant membership or model-provider credential.", lifecycleState: "partial",
    owner: owner("Platform security owner", "Engineering governance owner"), evidenceRefs: ["SEV-CI-SCANNER-START"], gapRefs: ["SG-ASSET-DISCOVERY"], controlIds: ["TRUST-DOC-01", "TRUST-ID-01", "TRUST-CLOUD-02"],
  },
  {
    identityId: "ID-END-USER", title: "Authenticated end user", kind: "end_user", systemRef: "SYS-SUPABASE", environmentRefs: ["ENV-PRODUCTION", "ENV-PREVIEW", "ENV-DEVELOPMENT"], privilege: "tenant_scoped",
    authentication: "Supabase Auth session after email verification; MFA and enterprise lifecycle are not proven.", lifecycleState: "partial", owner: owner("Identity owner", "Application security owner"),
    evidenceRefs: ["SEV-CREATOR-REMEDIATION", "SEV-SUPABASE-CONFIG", "SEV-RLS-TEST"], gapRefs: ["SG-PRIVILEGED-ACCESS", ], controlIds: ["TRUST-ID-01", "TRUST-APP-01"],
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
    authentication: "Dedicated account, worker claim credential and per-job capability; delegated principal also binds human authority, resource root and expiry. No standalone worker grant or group membership.", lifecycleState: "partial", owner: owner("Platform engineering owner", "Data security owner"),
    evidenceRefs: ["SEV-WORK-STORAGE", "SEV-WORK-RUNTIME-TEST", "SEV-ADOPT-BINDING", "SEV-ADOPT-CONTRACT", "SEV-OBS-AUTHORITY", "SEV-OBS-CONTRACT", "SEV-RIGHTS-JOB", "SEV-RIGHTS-DELIVERY", "SEV-SOURCE-ISOLATION", "SEV-DOSSIER-PUBLIC-CACHE", "SEV-POLICY-SCHEMA", "SEV-POLICY-DELEGATION", "SEV-OUTBOX-CONTRACT", "SEV-WORKER-RUNTIME", "SEV-WORKER-CONFIG"], gapRefs: ["SG-PRIVILEGED-ACCESS", "SG-LIVE-CONFIG"], controlIds: ["TRUST-ID-01", "TRUST-APP-01", "TRUST-DATA-03"],
  },
  {
    identityId: "ID-GITHUB-OIDC", title: "GitHub deployment OIDC principal", kind: "oidc_principal", systemRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-PRODUCTION"], privilege: "workload_scoped",
    authentication: "GitHub OIDC exchanged for a short-lived AWS session.", lifecycleState: "defined", owner: owner("Platform engineering owner", "Engineering governance owner"),
    evidenceRefs: ["SEV-DEPLOY-WORKER"], gapRefs: ["SG-LIVE-CONFIG", "SG-DEPLOY-DIAGNOSTICS"], controlIds: ["TRUST-DATA-03", "TRUST-CLOUD-01", "TRUST-SDLC-01"],
  },
  {
    identityId: "ID-GITHUB-EVALS-OIDC", title: "GitHub evaluation OIDC principal", kind: "oidc_principal", systemRef: "SYS-GITHUB", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], privilege: "workload_scoped",
    authentication: "GitHub OIDC is exchanged for a short-lived AWS session under the dedicated offroadGitHubEvalsRole named by evaluation workflows; effective trust and grants are unverified.", lifecycleState: "partial",
    owner: owner("AI governance owner", "Cloud security owner"), evidenceRefs: ["SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-PROBE", "SEV-EVAL-CODEX", "SEV-EVAL-LIVE-GATE", "SEV-EVAL-DOCUMENT-WORK", "SEV-EVAL-DOCUMENT-CONTINUATION"],
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
    vendorId: "VEN-UBUNTU-PACKAGES", title: "Ubuntu package repositories", service: "CI operating-system packages including clamd", role: "supply_chain", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational"],
    activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Platform security owner"), evidenceRefs: ["SEV-CI-SCANNER-START"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-ASSET-DISCOVERY", "SG-REGION-MAP"], controlIds: ["TRUST-SDLC-02", "TRUST-VENDOR-01"],
  },
  {
    vendorId: "VEN-CLAMAV-DEFINITIONS", title: "ClamAV definition distribution", service: "Malware signature updates consumed by freshclam", role: "supply_chain", environmentRefs: ["ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational"],
    activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "unknown",
    owner: owner("Vendor risk owner", "Platform security owner"), evidenceRefs: ["SEV-CI-SCANNER-START"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-ASSET-DISCOVERY", "SG-REGION-MAP"], controlIds: ["TRUST-SDLC-02", "TRUST-VENDOR-01"],
  },
  {
    vendorId: "VEN-SUPABASE", title: "Supabase", service: "Managed Auth, Postgres and object storage", role: "processor", environmentRefs: ["ENV-PRODUCTION", "ENV-STAGING", "ENV-DEVELOPMENT", "ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["internal_operational", "personal_data", "customer_confidential", "restricted_financial", "credential_secret", "security_evidence"], activationState: "observed_in_code", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "partial",
    owner: owner("Vendor risk owner", "Data platform owner"), evidenceRefs: ["SEV-AGENTS-SCOPE", "SEV-SUPABASE-CONFIG"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-BACKUP-RESTORE", "SG-REGION-MAP"], controlIds: ["TRUST-VENDOR-01", "TRUST-DATA-02", "TRUST-OPS-02"],
  },
  {
    vendorId: "VEN-AWS", title: "Amazon Web Services", service: "ECR, ECS Fargate, IAM, Secrets Manager and CloudWatch", role: "infrastructure", environmentRefs: ["ENV-PRODUCTION", "ENV-CI", "ENV-EXTERNAL"],
    dataClassIds: ["internal_operational", "customer_confidential", "restricted_financial", "credential_secret", "security_evidence"], activationState: "observed_in_deployment_config", contractState: "unknown", retentionState: "unknown", trainingUseState: "not_applicable", regionState: "partial",
    owner: owner("Vendor risk owner", "Cloud security owner"), evidenceRefs: ["SEV-WORKER-TASK", "SEV-DEPLOY-WORKER", "SEV-EVAL-GOLD", "SEV-EVAL-LIVE-GATE", "SEV-EVAL-DOCUMENT-WORK", "SEV-EVAL-DOCUMENT-CONTINUATION"], gapRefs: ["SG-VENDOR-ASSURANCE", "SG-LIVE-CONFIG", "SG-REGION-MAP", "SG-DEPLOY-DIAGNOSTICS", "SG-PRIVILEGED-ACCESS", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-VENDOR-01", "TRUST-CLOUD-01", "TRUST-DATA-03", "TRUST-AI-01"],
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
    owner: owner("Vendor risk owner", "AI governance owner"), evidenceRefs: ["SEV-WORKER-TASK", "SEV-MODEL-DATA-POLICY", "SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-PROBE", "SEV-EVAL-LIVE-GATE", "SEV-EVAL-DOCUMENT-WORK", "SEV-EVAL-DOCUMENT-CONTINUATION"], gapRefs: ["SG-PROVIDER-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-AI-01", "TRUST-VENDOR-01", "TRUST-DATA-04", "TRUST-SDLC-01"],
  },
  {
    vendorId: "VEN-OPENAI", title: "OpenAI", service: "Language-model inference and optional public web search", role: "subprocessor", environmentRefs: ["ENV-PRODUCTION", "ENV-CI", "ENV-EXTERNAL"], dataClassIds: ["public", "internal_operational", "customer_confidential", "restricted_financial", "security_evidence"],
    activationState: "observed_in_deployment_config", contractState: "unknown", retentionState: "unknown", trainingUseState: "unknown", regionState: "unknown",
    owner: owner("Vendor risk owner", "AI governance owner"), evidenceRefs: ["SEV-WORKER-TASK", "SEV-MODEL-DATA-POLICY", "SEV-MODEL-POLICY", "SEV-EVAL-EXTRACTION", "SEV-EVAL-INTENT", "SEV-EVAL-CLASSIFICATION", "SEV-EVAL-GOLD", "SEV-EVAL-CODEX", "SEV-EVAL-DOCUMENT-WORK"], gapRefs: ["SG-PROVIDER-ASSURANCE", "SG-VENDOR-ASSURANCE", "SG-REGION-MAP", "SG-ASSET-DISCOVERY"], controlIds: ["TRUST-AI-01", "TRUST-VENDOR-01", "TRUST-DATA-04", "TRUST-SDLC-01"],
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
    targetRefs: ["ENV-CI", "ENV-EXTERNAL", "SYS-GITHUB", "SYS-AUTH-EMAIL", "STORE-SOURCE", "STORE-ECR", "FLOW-WORKER-RESEARCH", "FLOW-WORKER-FIRECRAWL", "FLOW-GITHUB-EVAL-ANTHROPIC", "FLOW-GITHUB-EVAL-OPENAI", "FLOW-GITHUB-EVAL-PERPLEXITY", "FLOW-AUTH-EMAIL", "FLOW-GITHUB-VERCEL", "FLOW-SHEETJS-SUPPLY", "FLOW-MATERIAL-GOOGLE-FONTS", "ID-VERCEL-SOURCE-INTEGRATION", ...vendors.map((item) => item.vendorId), "FLOW-CI-SCANNER-PACKAGES", "FLOW-CI-SCANNER-DEFINITIONS"], evidenceRefs: ["SEV-SECURITY-PLAN", "SEV-CI-SCANNER-START"],
    controlIds: ["TRUST-VENDOR-01", "TRUST-DATA-04"], nextAction: "Collect current contract, DPA, retention, region, incident, notice and exit evidence for every material vendor.",
  },
  {
    gapId: "SG-PROVIDER-ASSURANCE", title: "Provider data-policy enforcement is disabled in deployment configuration", severity: "critical", owner: owner("AI governance owner", "Privacy owner"),
    targetRefs: ["ENV-CI", "ENV-EXTERNAL", "customer_confidential", "restricted_financial", "SYS-WORKER", "SYS-GITHUB", "FLOW-WORKER-ANTHROPIC", "FLOW-WORKER-OPENAI", "FLOW-WORKER-FIRECRAWL", "FLOW-GITHUB-EVAL-SECRETS", "FLOW-GITHUB-EVAL-ANTHROPIC", "FLOW-GITHUB-EVAL-OPENAI", "FLOW-GITHUB-EVAL-PERPLEXITY", "ID-GITHUB-EVALS-OIDC", "VEN-ANTHROPIC", "VEN-OPENAI", "VEN-PERPLEXITY", "VEN-FIRECRAWL"], evidenceRefs: ["SEV-MODEL-DATA-POLICY", "SEV-MODEL-DATA-POLICY-TEST", "SEV-WORKER-CONFIG", "SEV-WORKER-TASK", "SEV-EVAL-GOLD", "SEV-EVAL-LIVE-GATE"],
    controlIds: ["TRUST-AI-01", "TRUST-DATA-04", "TRUST-VENDOR-01"], nextAction: "Stage 16: record current account/model/resource terms, non-training and bounded retention, then enforce eligibility; zero retention is a future commercial option, not a prerequisite. Repository flags do not establish live terms or enforcement.",
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
    targetRefs: ["SYS-GITHUB", "FLOW-GITHUB-AWS", "ID-GITHUB-OIDC", "ID-AWS-WORKER-ROLES", "VEN-AWS", "FLOW-GITHUB-WORKER-DIAGNOSTICS"], evidenceRefs: ["SEV-DEPLOY-WORKER", "SEV-AWS-DEPLOY-ROLE-SNAPSHOT", "SEV-DEPLOY-BOOT-PROOF"],
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
    targetRefs: ["SYS-WORKER", "STORE-CLOUDWATCH", "FLOW-GITHUB-WORKER-DIAGNOSTICS"], evidenceRefs: ["SEV-WORKER-RUNTIME", "SEV-WORKER-CONFIG"], controlIds: ["TRUST-OPS-01", "TRUST-DATA-02", "TRUST-APP-02"],
    nextAction: "Route operational logs through a typed allowlisted logger and test every failure path against prompts, document text, signed URLs, personal data and financial values.",
  },
  {
    gapId: "SG-ASSET-DISCOVERY", title: "Security asset and external dependency discovery is incomplete", severity: "high", owner: owner("Security governance owner", "Platform security owner"),
    targetRefs: ["ENV-CI", "SYS-WEB", "SYS-WORKER", "SYS-GITHUB", "STORE-AWS-SECRETS", "FLOW-GITHUB-EVAL-SECRETS", "FLOW-GITHUB-EVAL-ANTHROPIC", "FLOW-GITHUB-EVAL-OPENAI", "FLOW-GITHUB-EVAL-PERPLEXITY", "ID-GITHUB-EVALS-OIDC", "FLOW-SHEETJS-SUPPLY", "FLOW-MATERIAL-GOOGLE-FONTS", "FLOW-NPM-SUPPLY", "FLOW-GITHUB-ACTIONS-SUPPLY", "FLOW-SUPABASE-LOCAL-IMAGES", "FLOW-PLAYWRIGHT-BROWSERS", "VEN-AWS", "VEN-ANTHROPIC", "VEN-OPENAI", "VEN-PERPLEXITY", "VEN-SHEETJS-CDN", "VEN-GOOGLE-FONTS", "VEN-NPM-REGISTRY", "VEN-GITHUB-ACTIONS", "VEN-SUPABASE-LOCAL-IMAGES", "VEN-PLAYWRIGHT-DOWNLOADS", "FLOW-CI-SCANNER-PACKAGES", "FLOW-CI-SCANNER-DEFINITIONS", "VEN-UBUNTU-PACKAGES", "VEN-CLAMAV-DEFINITIONS", "ID-CI-CLAMD"], evidenceRefs: ["SEV-WEB-DEPENDENCIES", "SEV-WORKER-TASK", "SEV-EVAL-GOLD", "SEV-EVAL-LIVE-GATE", "SEV-QUALITY-WORKFLOW", "SEV-SECURITY-WORKFLOW", "SEV-LOCKFILE", "SEV-SECURITY-PLAN", "SEV-CI-SCANNER-START"], controlIds: ["TRUST-GOV-02", "TRUST-SDLC-02", "TRUST-VENDOR-01", "TRUST-AI-01", "TRUST-DATA-03"],
    nextAction: "Inventory Secrets Manager, ECR and container artifacts, provider credentials, Vercel source integration, npm and GitHub Actions supply, exact Supabase local image registries and digests, Playwright browser downloads, browser CDNs and external fonts before claiming external-boundary completeness.",
  },
];

const currentSecurityInventoryDeclaration = {
  inventoryVersion: "2026.09.19-wave-14-opening-v1",
  generatedAt: capturedAt,
  baseline: {repository: "carlosevg100/offroad", branch: "main", commit: baselineCommit, evidenceCutoff: capturedAt, reviewDueAt: null, reviewCadence: "per_wave", waveId: "wave-14", waveStatus: "open", materialChangeState: "reviewed"},
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
    "The repository task definition omits provider-data-policy enforcement and enables Firecrawl while zero-data-retention is false; account-specific retention terms are reviewed in stage 16, and zero retention is not a prerequisite for this wave.",
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
