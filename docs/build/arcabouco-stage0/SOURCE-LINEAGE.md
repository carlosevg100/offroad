# Fontes antes não localizadas - resolução da etapa 0

Os 75 registros de função e dez tabelas sem fonte no inventário anterior têm referências de DDL ou transformação identificadas. O catálogo instalado é a identidade; o replay da CI decide se o histórico reproduz essa identidade. Referência de fonte não substitui replay nem declara igualdade de todo corpo de função.

| Objeto anterior | Origem localizada | Mecanismo |
|---|---|---|
| `private.authorize_pack_distribution(p_organization_id uuid, p_session_id uuid, p_pack_revision_id uuid, p_pack_fingerprint text, p_consent_statement text, p_recipients jsonb)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:243` | direct_ddl |
| `private.authorize_pack_distribution(p_organization_id uuid, p_session_id uuid, p_pack_revision_id uuid, p_pack_fingerprint text, p_consent_statement text, p_recipients jsonb)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:602` | direct_ddl |
| `private.begin_intake_processing(p_organization_id uuid, p_session_id uuid)` | `supabase/migrations/20260818033220_atomic_intake_commands.sql:74` | direct_ddl |
| `private.begin_intake_processing(p_organization_id uuid, p_session_id uuid)` | `supabase/migrations/20260820225418_intake_session_commands_are_private.sql:132` | direct_ddl |
| `private.begin_intake_processing(p_organization_id uuid, p_session_id uuid)` | `supabase/migrations/20260820225418_intake_session_commands_are_private.sql:115` | schema_move_or_rename |
| `private.enforce_information_pack_item_immutability()` | `docs/build/schema-history/staging-only-distribution/20260911012528_versioned_information_packs.sql:120` | direct_ddl |
| `private.enforce_information_pack_revision_immutability()` | `docs/build/schema-history/staging-only-distribution/20260911012528_versioned_information_packs.sql:94` | direct_ddl |
| `private.enforce_qualified_contact_recipient_binding()` | `docs/build/schema-history/staging-only-distribution/20260911014733_bind_qualified_contact_to_its_recipient.sql:5` | direct_ddl |
| `private.execution_approval_input_fingerprint_before_public_catalog(p_organization_id uuid, p_session_id uuid)` | `supabase/migrations/20260910151957_provider_research_public_catalog_v2.sql:202` | dynamic_definition_transform |
| `private.execution_approval_input_fingerprint_before_receivables_scope(p_organization_id uuid, p_session_id uuid)` | `supabase/migrations/20260908181846_confirmed_receivables_evidence_scope.sql:146` | schema_move_or_rename |
| `private.execution_approval_input_fingerprint_before_sector(p_organization_id uuid, p_session_id uuid)` | `supabase/migrations/20260908145938_governed_sector_context_inputs.sql:78` | schema_move_or_rename |
| `private.guard_institutional_revision_proposal()` | `supabase/migrations/20260911020925_institutional_revision_proposals.sql:64` | direct_ddl |
| `private.guard_project_canonical_revision()` | `supabase/migrations/20260911020707_project_canonical_revisions.sql:59` | direct_ddl |
| `private.is_released_documentary_plan_before_revision(p_snapshot jsonb, p_entry text)` | `supabase/migrations/20260910135224_explicit_documentary_work_revision.sql:6` | dynamic_definition_transform |
| `private.is_released_documentary_plan_v13(p_snapshot jsonb, p_entry text)` | `supabase/migrations/20260910033516_documentary_comparison_review_contract.sql:6` | dynamic_definition_transform |
| `private.is_released_documentary_plan_v14(p_snapshot jsonb, p_entry text)` | `supabase/migrations/20260910100522_documentary_field_assessments_contract.sql:6` | dynamic_definition_transform |
| `private.jsonb_merge_numeric(p_left jsonb, p_right jsonb)` | `supabase/migrations/20260818171246_intelligence_runs_profiles_layers.sql:675` | direct_ddl |
| `private.jsonb_merge_numeric(p_left jsonb, p_right jsonb)` | `supabase/migrations/20260818172243_privilege_hardening_no_anon_and_private_commands.sql:104` | schema_move_or_rename |
| `private.open_shared_information_pack_item(p_share_id uuid, p_item_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:548` | direct_ddl |
| `private.open_shared_information_pack_item(p_share_id uuid, p_item_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:639` | direct_ddl |
| `private.pack_response_codes_valid(p_entries jsonb)` | `docs/build/schema-history/staging-only-distribution/20260911014632_pack_responses_and_next_steps.sql:139` | direct_ddl |
| `private.pack_share_live_for_recipient(p_organization_id uuid, p_share_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:188` | direct_ddl |
| `private.prepare_qualified_contact(p_target_id uuid, p_share_id uuid, p_candidate_fit text, p_rationale text)` | `docs/build/schema-history/staging-only-distribution/20260911014540_in_product_qualified_contact.sql:83` | direct_ddl |
| `private.prepare_qualified_contact(p_target_id uuid, p_share_id uuid, p_candidate_fit text, p_rationale text)` | `docs/build/schema-history/staging-only-distribution/20260911014540_in_product_qualified_contact.sql:283` | direct_ddl |
| `private.project_canonical_inputs(p_organization_id uuid, p_project_id uuid)` | `supabase/migrations/20260911020707_project_canonical_revisions.sql:68` | direct_ddl |
| `private.project_canonical_inputs(p_organization_id uuid, p_project_id uuid)` | `supabase/migrations/20260911020808_project_revision_propagation.sql:20` | direct_ddl |
| `private.propagate_project_canonical_revision_v1(p_project_id uuid, p_request_id uuid, p_locale text)` | `supabase/migrations/20260911020808_project_revision_propagation.sql:178` | direct_ddl |
| `private.propagate_project_canonical_revision_v1(p_project_id uuid, p_request_id uuid, p_locale text)` | `supabase/migrations/20260911021039_canonical_revision_variable_scope.sql:32` | direct_ddl |
| `private.read_execution_brief_progress_before_documentary(p_execution_brief_id uuid)` | `supabase/migrations/20260909005438_documentary_execution_progress.sql:4` | dynamic_definition_transform |
| `private.read_institutional_revision_proposals_v1(p_project_id uuid)` | `supabase/migrations/20260911020925_institutional_revision_proposals.sql:242` | direct_ddl |
| `private.read_institutional_revision_proposals_v1(p_project_id uuid)` | `supabase/migrations/20260911020925_institutional_revision_proposals.sql:264` | direct_ddl |
| `private.read_project_revision_history_v1(p_project_id uuid)` | `supabase/migrations/20260911020707_project_canonical_revisions.sql:267` | direct_ddl |
| `private.read_project_revision_history_v1(p_project_id uuid)` | `supabase/migrations/20260911020707_project_canonical_revisions.sql:309` | direct_ddl |
| `private.read_receivables_evidence_scope_v2(p_session_id uuid)` | `supabase/migrations/20260910153117_confirmed_receivables_support_sheets_v2.sql:171` | direct_ddl |
| `private.read_shared_information_pack(p_share_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:482` | direct_ddl |
| `private.read_shared_information_pack(p_share_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:630` | direct_ddl |
| `private.read_shared_pack_item_material(p_share_id uuid, p_item_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911020048_read_shared_pack_item_material.sql:6` | direct_ddl |
| `private.read_shared_pack_item_material(p_share_id uuid, p_item_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911020048_read_shared_pack_item_material.sql:95` | direct_ddl |
| `private.record_claim_decision(p_organization_id uuid, p_session_id uuid, p_claim_id text, p_claim_fingerprint text, p_decision text, p_reason text)` | `supabase/migrations/20260824180255_claim_decision_registry.sql:80` | direct_ddl |
| `private.record_claim_decision(p_organization_id uuid, p_session_id uuid, p_claim_id text, p_claim_fingerprint text, p_decision text, p_reason text)` | `supabase/migrations/20260824180448_claim_decision_command_private.sql:12` | direct_ddl |
| `private.record_execution_proposal_plan_as_actor(p_project_id uuid, p_snapshot jsonb, p_actor_id uuid)` | `supabase/migrations/20260910135636_documentary_revision_private_admission.sql:6` | dynamic_name_mapping |
| `private.record_execution_proposal_plan_as_actor(p_project_id uuid, p_snapshot jsonb, p_actor_id uuid)` | `supabase/migrations/20260910151957_provider_research_public_catalog_v2.sql:16` | dynamic_name_mapping |
| `private.record_information_pack_revision(p_organization_id uuid, p_session_id uuid, p_items jsonb)` | `docs/build/schema-history/staging-only-distribution/20260911013814_information_pack_fingerprint_variable_scope.sql:5` | direct_ddl |
| `private.record_information_pack_revision(p_organization_id uuid, p_session_id uuid, p_items jsonb)` | `docs/build/schema-history/staging-only-distribution/20260911014109_information_pack_supersession_order.sql:26` | direct_ddl |
| `private.record_pack_distribution_next_step(p_share_id uuid, p_step_code text, p_note text)` | `docs/build/schema-history/staging-only-distribution/20260911014632_pack_responses_and_next_steps.sql:231` | direct_ddl |
| `private.record_pack_distribution_next_step(p_share_id uuid, p_step_code text, p_note text)` | `docs/build/schema-history/staging-only-distribution/20260911014632_pack_responses_and_next_steps.sql:302` | direct_ddl |
| `private.record_pack_recipient_response(p_share_id uuid, p_response_state text, p_note text, p_ticket_amount numeric, p_ticket_currency text, p_tenor_months integer, p_pricing_basis text, p_pricing_min numeric, p_pricing_max numeric, p_requested_conditions jsonb, p_term_objections jsonb, p_supersedes_response_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911014632_pack_responses_and_next_steps.sql:159` | direct_ddl |
| `private.record_pack_recipient_response(p_share_id uuid, p_response_state text, p_note text, p_ticket_amount numeric, p_ticket_currency text, p_tenor_months integer, p_pricing_basis text, p_pricing_min numeric, p_pricing_max numeric, p_requested_conditions jsonb, p_term_objections jsonb, p_supersedes_response_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911014632_pack_responses_and_next_steps.sql:276` | direct_ddl |
| `private.record_project_canonical_revision_v1(p_organization_id uuid, p_project_id uuid)` | `supabase/migrations/20260911020707_project_canonical_revisions.sql:100` | direct_ddl |
| `private.release_qualified_contact(p_preparation_id uuid, p_pack_fingerprint text)` | `docs/build/schema-history/staging-only-distribution/20260911014540_in_product_qualified_contact.sql:194` | direct_ddl |
| `private.release_qualified_contact(p_preparation_id uuid, p_pack_fingerprint text)` | `docs/build/schema-history/staging-only-distribution/20260911014540_in_product_qualified_contact.sql:297` | direct_ddl |
| `private.resolve_pack_distribution_candidates(p_organization_id uuid, p_session_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911020229_resolve_pack_distribution_candidates.sql:6` | direct_ddl |
| `private.resolve_pack_distribution_candidates(p_organization_id uuid, p_session_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911020229_resolve_pack_distribution_candidates.sql:108` | direct_ddl |
| `private.review_institutional_configuration_before_sources_v1(p_project_id uuid, p_candidate_id uuid, p_expected_parent_fingerprint text, p_decision text, p_expected_candidate_fingerprint text)` | `supabase/migrations/20260910072054_institutional_model_setup_and_source_bindings.sql:143` | schema_move_or_rename |
| `private.review_institutional_revision_proposal_v1(p_proposal_id uuid, p_decision text, p_expected_structure_fingerprint text, p_request_id uuid, p_locale text)` | `supabase/migrations/20260911020925_institutional_revision_proposals.sql:236` | direct_ddl |
| `private.review_institutional_revision_proposal_v1(p_proposal_id uuid, p_decision text, p_expected_structure_fingerprint text, p_request_id uuid, p_locale text)` | `supabase/migrations/20260911021002_revision_proposal_variable_scope.sql:3` | direct_ddl |
| `private.revoke_pack_distribution(p_authorization_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:434` | direct_ddl |
| `private.revoke_pack_distribution(p_authorization_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:621` | direct_ddl |
| `private.submit_institutional_revision_proposal_v1(p_project_id uuid, p_proposal_id uuid, p_payload jsonb)` | `supabase/migrations/20260911020925_institutional_revision_proposals.sql:82` | direct_ddl |
| `private.submit_institutional_revision_proposal_v1(p_project_id uuid, p_proposal_id uuid, p_payload jsonb)` | `supabase/migrations/20260911020925_institutional_revision_proposals.sql:146` | direct_ddl |
| `private.supersede_previous_institutional_results()` | `supabase/migrations/20260911020808_project_revision_propagation.sql:51` | direct_ddl |
| `private.worker_claim_job_v2(p_worker_token text, p_lease_seconds integer)` | `supabase/migrations/20260908035026_explicit_execution_brief_approval.sql:619` | direct_ddl |
| `private.worker_heartbeat(p_job_id uuid, p_capability_token text, p_lease_seconds integer)` | `supabase/migrations/20260818171246_intelligence_runs_profiles_layers.sql:648` | direct_ddl |
| `private.worker_heartbeat(p_job_id uuid, p_capability_token text, p_lease_seconds integer)` | `supabase/migrations/20260818172243_privilege_hardening_no_anon_and_private_commands.sql:196` | direct_ddl |
| `private.worker_heartbeat(p_job_id uuid, p_capability_token text, p_lease_seconds integer)` | `supabase/migrations/20260818172243_privilege_hardening_no_anon_and_private_commands.sql:97` | schema_move_or_rename |
| `private.worker_load_agent_base_before_scope(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260908181852_confirmed_receivables_scope_reader_fence.sql:66` | dynamic_definition_transform |
| `private.worker_load_agent_context_before_execution_brief_v1(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260907044208_execution_brief_foundation.sql:388` | schema_move_or_rename |
| `private.worker_load_agent_context_before_institutional_v1(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260910033542_institutional_model_assumption_answers.sql:99` | schema_move_or_rename |
| `private.worker_load_agent_context_before_professional_context_v1(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260903125201_professional_capability_context.sql:293` | schema_move_or_rename |
| `private.worker_load_agent_context_before_scope(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260908181852_confirmed_receivables_scope_reader_fence.sql:74` | dynamic_definition_transform |
| `private.worker_load_agent_context_v5(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260910153117_confirmed_receivables_support_sheets_v2.sql:120` | dynamic_name_mapping |
| `private.worker_load_agent_v2_before_scope(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260908181852_confirmed_receivables_scope_reader_fence.sql:68` | dynamic_definition_transform |
| `private.worker_load_agent_v2_before_scope(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260908181852_confirmed_receivables_scope_reader_fence.sql:74` | dynamic_definition_transform |
| `private.worker_load_case_bundle_before_scope(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260908181852_confirmed_receivables_scope_reader_fence.sql:62` | dynamic_definition_transform |
| `private.worker_load_case_input_before_scope(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260908181852_confirmed_receivables_scope_reader_fence.sql:60` | dynamic_definition_transform |
| `private.worker_load_case_input_v3(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260910153117_confirmed_receivables_support_sheets_v2.sql:119` | dynamic_name_mapping |
| `private.worker_load_execution_brief_proposal_before_scope(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260908181852_confirmed_receivables_scope_reader_fence.sql:76` | dynamic_definition_transform |
| `private.worker_load_execution_brief_proposal_v4(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260910153117_confirmed_receivables_support_sheets_v2.sql:121` | dynamic_name_mapping |
| `private.worker_load_proposal_before_work_revision(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260910135224_explicit_documentary_work_revision.sql:696` | dynamic_definition_transform |
| `private.worker_load_proposal_v1_before_scope(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260908181852_confirmed_receivables_scope_reader_fence.sql:76` | dynamic_definition_transform |
| `private.worker_load_proposal_v1_before_scope(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260908181852_confirmed_receivables_scope_reader_fence.sql:78` | dynamic_definition_transform |
| `private.worker_runtime_schema_contract_before_support_sheets()` | `supabase/migrations/20260910153117_confirmed_receivables_support_sheets_v2.sql:141` | dynamic_definition_transform |
| `public.authorize_pack_distribution(p_organization_id uuid, p_session_id uuid, p_pack_revision_id uuid, p_pack_fingerprint text, p_consent_statement text, p_recipients jsonb)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:243` | direct_ddl |
| `public.authorize_pack_distribution(p_organization_id uuid, p_session_id uuid, p_pack_revision_id uuid, p_pack_fingerprint text, p_consent_statement text, p_recipients jsonb)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:602` | direct_ddl |
| `public.open_shared_information_pack_item(p_share_id uuid, p_item_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:548` | direct_ddl |
| `public.open_shared_information_pack_item(p_share_id uuid, p_item_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:639` | direct_ddl |
| `public.prepare_qualified_contact(p_target_id uuid, p_candidate_fit text, p_rationale text, p_share_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911014540_in_product_qualified_contact.sql:83` | direct_ddl |
| `public.prepare_qualified_contact(p_target_id uuid, p_candidate_fit text, p_rationale text, p_share_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911014540_in_product_qualified_contact.sql:283` | direct_ddl |
| `public.propagate_project_canonical_revision_v1(p_project_id uuid, p_request_id uuid, p_locale text)` | `supabase/migrations/20260911020808_project_revision_propagation.sql:178` | direct_ddl |
| `public.propagate_project_canonical_revision_v1(p_project_id uuid, p_request_id uuid, p_locale text)` | `supabase/migrations/20260911021039_canonical_revision_variable_scope.sql:32` | direct_ddl |
| `public.read_institutional_revision_proposals_v1(p_project_id uuid)` | `supabase/migrations/20260911020925_institutional_revision_proposals.sql:242` | direct_ddl |
| `public.read_institutional_revision_proposals_v1(p_project_id uuid)` | `supabase/migrations/20260911020925_institutional_revision_proposals.sql:264` | direct_ddl |
| `public.read_project_revision_history_v1(p_project_id uuid)` | `supabase/migrations/20260911020707_project_canonical_revisions.sql:267` | direct_ddl |
| `public.read_project_revision_history_v1(p_project_id uuid)` | `supabase/migrations/20260911020707_project_canonical_revisions.sql:309` | direct_ddl |
| `public.read_shared_information_pack(p_share_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:482` | direct_ddl |
| `public.read_shared_information_pack(p_share_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:630` | direct_ddl |
| `public.read_shared_pack_item_material(p_share_id uuid, p_item_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911020048_read_shared_pack_item_material.sql:6` | direct_ddl |
| `public.read_shared_pack_item_material(p_share_id uuid, p_item_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911020048_read_shared_pack_item_material.sql:95` | direct_ddl |
| `public.record_information_pack_revision(p_organization_id uuid, p_session_id uuid, p_items jsonb)` | `docs/build/schema-history/staging-only-distribution/20260911013814_information_pack_fingerprint_variable_scope.sql:5` | direct_ddl |
| `public.record_information_pack_revision(p_organization_id uuid, p_session_id uuid, p_items jsonb)` | `docs/build/schema-history/staging-only-distribution/20260911014109_information_pack_supersession_order.sql:26` | direct_ddl |
| `public.record_pack_distribution_next_step(p_share_id uuid, p_step_code text, p_note text)` | `docs/build/schema-history/staging-only-distribution/20260911014632_pack_responses_and_next_steps.sql:231` | direct_ddl |
| `public.record_pack_distribution_next_step(p_share_id uuid, p_step_code text, p_note text)` | `docs/build/schema-history/staging-only-distribution/20260911014632_pack_responses_and_next_steps.sql:302` | direct_ddl |
| `public.record_pack_recipient_response(p_share_id uuid, p_response_state text, p_note text, p_ticket_amount numeric, p_ticket_currency text, p_tenor_months integer, p_pricing_basis text, p_pricing_min numeric, p_pricing_max numeric, p_requested_conditions jsonb, p_term_objections jsonb, p_supersedes_response_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911014632_pack_responses_and_next_steps.sql:159` | direct_ddl |
| `public.record_pack_recipient_response(p_share_id uuid, p_response_state text, p_note text, p_ticket_amount numeric, p_ticket_currency text, p_tenor_months integer, p_pricing_basis text, p_pricing_min numeric, p_pricing_max numeric, p_requested_conditions jsonb, p_term_objections jsonb, p_supersedes_response_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911014632_pack_responses_and_next_steps.sql:276` | direct_ddl |
| `public.release_qualified_contact(p_preparation_id uuid, p_pack_fingerprint text)` | `docs/build/schema-history/staging-only-distribution/20260911014540_in_product_qualified_contact.sql:194` | direct_ddl |
| `public.release_qualified_contact(p_preparation_id uuid, p_pack_fingerprint text)` | `docs/build/schema-history/staging-only-distribution/20260911014540_in_product_qualified_contact.sql:297` | direct_ddl |
| `public.resolve_pack_distribution_candidates(p_organization_id uuid, p_session_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911020229_resolve_pack_distribution_candidates.sql:6` | direct_ddl |
| `public.resolve_pack_distribution_candidates(p_organization_id uuid, p_session_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911020229_resolve_pack_distribution_candidates.sql:108` | direct_ddl |
| `public.review_institutional_revision_proposal_v1(p_proposal_id uuid, p_decision text, p_expected_structure_fingerprint text, p_request_id uuid, p_locale text)` | `supabase/migrations/20260911020925_institutional_revision_proposals.sql:236` | direct_ddl |
| `public.review_institutional_revision_proposal_v1(p_proposal_id uuid, p_decision text, p_expected_structure_fingerprint text, p_request_id uuid, p_locale text)` | `supabase/migrations/20260911021002_revision_proposal_variable_scope.sql:3` | direct_ddl |
| `public.revoke_pack_distribution(p_authorization_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:434` | direct_ddl |
| `public.revoke_pack_distribution(p_authorization_id uuid)` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:621` | direct_ddl |
| `public.submit_institutional_revision_proposal_v1(p_project_id uuid, p_proposal_id uuid, p_payload jsonb)` | `supabase/migrations/20260911020925_institutional_revision_proposals.sql:82` | direct_ddl |
| `public.submit_institutional_revision_proposal_v1(p_project_id uuid, p_proposal_id uuid, p_payload jsonb)` | `supabase/migrations/20260911020925_institutional_revision_proposals.sql:146` | direct_ddl |
| `public.worker_load_agent_context_v5(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260910153117_confirmed_receivables_support_sheets_v2.sql:120` | dynamic_name_mapping |
| `public.worker_load_case_input_v3(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260910153117_confirmed_receivables_support_sheets_v2.sql:119` | dynamic_name_mapping |
| `public.worker_load_execution_brief_proposal_v4(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260910153117_confirmed_receivables_support_sheets_v2.sql:121` | dynamic_name_mapping |
| `private.institutional_revision_proposals` | `supabase/migrations/20260911020925_institutional_revision_proposals.sql:17` | direct_ddl |
| `private.project_canonical_revisions` | `supabase/migrations/20260911020707_project_canonical_revisions.sql:24` | direct_ddl |
| `public.information_pack_items` | `docs/build/schema-history/staging-only-distribution/20260911012528_versioned_information_packs.sql:52` | direct_ddl |
| `public.information_pack_revisions` | `docs/build/schema-history/staging-only-distribution/20260911012528_versioned_information_packs.sql:7` | direct_ddl |
| `public.pack_access_events` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:125` | direct_ddl |
| `public.pack_distribution_authorizations` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:8` | direct_ddl |
| `public.pack_distribution_next_steps` | `docs/build/schema-history/staging-only-distribution/20260911014632_pack_responses_and_next_steps.sql:81` | direct_ddl |
| `public.pack_distribution_shares` | `docs/build/schema-history/staging-only-distribution/20260911013106_authorized_pack_distribution.sql:55` | direct_ddl |
| `public.pack_recipient_responses` | `docs/build/schema-history/staging-only-distribution/20260911014632_pack_responses_and_next_steps.sql:6` | direct_ddl |
| `public.qualified_contact_preparations` | `docs/build/schema-history/staging-only-distribution/20260911014540_in_product_qualified_contact.sql:7` | direct_ddl |

## Fronteira de autoridade 1A

| Objeto | Fonte vigente | Mecanismo |
|---|---|---|
| `function:private.can_administer_membership_v1(p_organization_id uuid, p_user_id uuid, p_role text)` | `supabase/migrations/20260915123202_active_organization_authority.sql:24` | direct_ddl |
| `function:private.can_assign_organization_role_v1(p_organization_id uuid, p_role text)` | `supabase/migrations/20260915123202_active_organization_authority.sql:13` | direct_ddl |
| `function:private.can_manage_organization(p_organization_id uuid)` | `supabase/migrations/20260915123202_active_organization_authority.sql:4` | direct_ddl |
| `function:private.capture_organization_authority_event_v1()` | `supabase/migrations/20260915123202_active_organization_authority.sql:72` | direct_ddl |
| `function:private.create_organization_with_owner_v1(p_organization_type text, p_name text, p_legal_name text, p_country_code text, p_website text)` | `supabase/migrations/20260915123202_active_organization_authority.sql:95` | direct_ddl |
| `function:private.save_guided_company_profile(p_session_id uuid, p_name text, p_legal_name text, p_website text, p_description text, p_identifier_hash bytea, p_identifier_last4 text)` | `supabase/migrations/20260915123205_organization_profile_authority.sql:10` | dynamic_definition_transform |
| `function:private.save_project_company_profile(p_session_id uuid, p_name text, p_legal_name text, p_website text, p_description text, p_identifier_hash bytea, p_identifier_last4 text)` | `supabase/migrations/20260915123205_organization_profile_authority.sql:10` | dynamic_definition_transform |
| `function:private.transfer_organization_owner_v1(p_organization_id uuid, p_new_owner_user_id uuid)` | `supabase/migrations/20260915123202_active_organization_authority.sql:132` | direct_ddl |
| `function:public.complete_onboarding(p_journey text, p_name text, p_legal_name text, p_country_code text, p_website text)` | `supabase/migrations/20260915123202_active_organization_authority.sql:250` | direct_ddl |
| `function:public.create_organization_with_owner_v1(p_organization_type text, p_name text, p_legal_name text, p_country_code text, p_website text)` | `supabase/migrations/20260915123202_active_organization_authority.sql:124` | direct_ddl |
| `function:public.initialize_professional_onboarding(p_journey text, p_full_name text, p_job_title text, p_locale text)` | `supabase/migrations/20260915123202_active_organization_authority.sql:172` | direct_ddl |
| `function:public.transfer_organization_owner_v1(p_organization_id uuid, p_new_owner_user_id uuid)` | `supabase/migrations/20260915123202_active_organization_authority.sql:166` | direct_ddl |
| `policy:public.organization_invites.organization_invites_manage` | `supabase/migrations/20260915123202_active_organization_authority.sql:60` | direct_ddl |
| `policy:public.organization_memberships.memberships_delete_admin` | `supabase/migrations/20260915123202_active_organization_authority.sql:53` | direct_ddl |
| `policy:public.organization_memberships.memberships_insert_authorized` | `supabase/migrations/20260915123202_active_organization_authority.sql:46` | direct_ddl |
| `policy:public.organization_memberships.memberships_update_admin` | `supabase/migrations/20260915123202_active_organization_authority.sql:49` | direct_ddl |
| `policy:public.organizations.organizations_insert_creator` | `supabase/migrations/20260915123202_active_organization_authority.sql:69` | direct_ddl |
| `policy:public.organizations.organizations_select_member` | `supabase/migrations/20260915123202_active_organization_authority.sql:67` | direct_ddl |
| `r:public.organization_memberships` | `supabase/migrations/20260915123202_active_organization_authority.sql:56` | direct_ddl |
| `r:public.organizations` | `supabase/migrations/20260915123202_active_organization_authority.sql:70` | direct_ddl |
| `trigger:public.organization_memberships.organization_memberships_authority_audit` | `supabase/migrations/20260915123202_active_organization_authority.sql:91` | direct_ddl |
