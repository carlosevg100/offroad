# Stage 1C: role-free reasoning

The same objective, evidence and method receive the same reasoning contract regardless of the requester's professional role or missing profile. Professional roles are neither requested at entry nor serialized into reasoning, routing, preview questions or quality gates. Explicit audience and requested deliverable remain part of the work; they are not inferred from the user's title. Institution capabilities inform execution means without reducing analytical depth or the alternative universe.

## Transition

Publish the application compatibility change first: parsers discard legacy profile fields, and no runtime instruction consumes them. Preserve historical profile rows. Then publish the `role_free_reasoning_context` migration, remove loader projections and revoke internal helper entrypoints. Keep nominal authorization, grants and execution approval unchanged. The stage closes only after the database proof, complete CI, exact production journals and both deployments.

## Verification

Synthetic staging captures show the original profile projection through agent loaders v1-v5 and capital/preview loaders and the resulting pre-model requests for CFO, analyst, advisor and missing profile. `role-free-reasoning.test.ts` compares complete advisor requests and deterministic routing/plan outputs; specialized executor tests compare synthesis prompts, output contracts and budgets across the same four profiles. Objective changes still change the plan. Browser journeys enter without professional-role collection; the retired settings URL retains the authorized workspace. `role_free_reasoning_context.sql` verifies 48 authenticated loader calls across agent v1-v5, capital v1-v6 and integration preview, rejects direct calls to internal helpers and checks that no legacy loader reads the historical profile table. The previous semantic-DAG assertion now requires role absence while preserving institution capabilities and retry feedback. All SQL suites run automatically in the Database CI job.

## Security and privacy

Controls: data minimization, reasoning non-interference, explicit task scope, least privilege and regression protection for 1A/1B. Historical professional data remains private and is not repurposed as a preference. No new provider, external effect or financial calculation is introduced. Evidence uses synthetic staging transactions and mocked model boundaries, not claims about model answer quality or user product trials. Revert application changes only in a way that preserves role-free reasoning; do not restore profile-dependent prompts.

## Publication order and retained history

Application PR 619 merged as `db624e41866696d69ad40206077fa865fec562fd`. The database release follows its production worker deployment. It changes exactly three loader bodies and repeats the existing denial of direct access to internal compatibility helpers; no policy, function signature or historical profile row changes. The legacy profile persistence RPC remains a private-data compatibility surface under existing authorization and has no reasoning consumer. It does not recreate the retired UI or affect analytical rigor.

The final wave receipt records the migration stamps, exact deployed commits and CI runs after publication. Wave 2 requires the founder's OK. Native Office, Temporal, connectors, organization exchange and product trials are outside this security stage.

## Installed database proof

Staging journal `20260916005559`; production journal and filename `20260916005712`. The file and installed journal SQL share MD5 `6c0c5805f5813ffd1ead653ddaf41940`. The three function definitions match across environments; zero loader profile readers and zero exposed compatibility helpers remain. The historical production profile count and digest are unchanged. Catalogue checks cover 1385 production and 1446 staging objects with no access-surface drift. Regenerated database types are unchanged; security advisors have zero lints.

The installed staging schema passed the new role-free contract and eight existing suites: `advisor_semantic_dag_activation`, `creator_authority_revocation`, `legacy_access_revocation`, `organization_profile_authority`, `professional_capability_context`, `integration_preview_mode`, `rls_non_interference` and `workspace_member_administration`. Production verification used only reads; no disposable production data was created.
