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

## Acesso explícito 1B

| Objeto | Fonte vigente | Mecanismo |
|---|---|---|
| `function:private.accept_workspace_invite_v1(p_invite_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:737` | direct_ddl |
| `function:private.advance_authorization_revision_v1(p_organization_id uuid, p_resource_id uuid, p_subject_user_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:183` | direct_ddl |
| `function:private.append_advisor_message_v1(p_project_id uuid, p_message_id uuid, p_locale text, p_content text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:445` | dynamic_definition_transform |
| `function:private.authorize_capital_project_private_work(p_project_id uuid, p_information_rights_declared boolean)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:445` | dynamic_definition_transform |
| `function:private.begin_processing_run(p_organization_id uuid, p_session_id uuid, p_trigger text, p_documents jsonb, p_pipeline_version text, p_budget jsonb)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:554` | dynamic_definition_transform |
| `function:private.bind_job_authority_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:351` | direct_ddl |
| `function:private.can_access_capital_project(p_organization_id uuid, p_project_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:234` | direct_ddl |
| `function:private.can_access_capital_request_v1(p_organization_id uuid, p_request_id uuid, p_action text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:295` | direct_ddl |
| `function:private.can_access_company_v1(p_organization_id uuid, p_company_id uuid, p_action text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:283` | direct_ddl |
| `function:private.can_access_document_scope(p_organization_id uuid, p_scope_id uuid, p_permission text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:251` | direct_ddl |
| `function:private.can_access_intake_session(p_organization_id uuid, p_session_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:238` | direct_ddl |
| `function:private.can_access_opportunity(p_organization_id uuid, p_opportunity_id uuid, p_permission text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:246` | direct_ddl |
| `function:private.can_access_resource_v1(p_organization_id uuid, p_resource_id uuid, p_action text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:96` | direct_ddl |
| `function:private.can_access_workspace_project_group(p_organization_id uuid, p_group_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:242` | direct_ddl |
| `function:private.can_review_intake_claims(p_organization_id uuid, p_session_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:642` | direct_ddl |
| `function:private.can_work_intake_session_v1(p_organization_id uuid, p_session_id uuid)` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:2` | direct_ddl |
| `function:private.canonical_job_storage_payload_v1(p_job_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:575` | direct_ddl |
| `function:private.capital_project_review_action_allowed(p_organization_id uuid, p_project_id uuid, p_action text, p_preparer uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:929` | dynamic_definition_transform |
| `function:private.capital_project_review_roles(p_organization_id uuid, p_project_id uuid, p_user_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:901` | dynamic_definition_transform |
| `function:private.claim_case_brief(p_organization_id uuid, p_session_id uuid, p_lease_seconds integer)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:886` | dynamic_definition_transform |
| `function:private.claim_storage_rotation_v1(p_worker_token text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:830` | direct_ddl |
| `function:private.confirm_document_intake(p_organization_id uuid, p_session_id uuid, p_output_locale text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:886` | dynamic_definition_transform |
| `function:private.create_opportunity_intake(p_organization_id uuid, p_legal_name text, p_sector text, p_purpose text, p_requested_amount numeric, p_currency text, p_desired_term_months integer, p_output_locale text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:1000` | direct_ddl |
| `function:private.decide_advisor_preliminary_v1(p_project_id uuid, p_object_fingerprint text, p_decision text, p_correction text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:445` | dynamic_definition_transform |
| `function:private.decide_capital_project_artifact(p_artifact_id uuid, p_artifact_fingerprint text, p_decision text, p_note text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:886` | dynamic_definition_transform |
| `function:private.grant_resource_access_v1(p_resource_id uuid, p_subject_user_id uuid, p_action text, p_expires_at timestamp with time zone)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:194` | direct_ddl |
| `function:private.guard_execution_approval_queue()` | `supabase/migrations/20260915204111_terminal_job_authorization_metadata.sql:2` | direct_ddl |
| `function:private.intake_session_for_update(p_organization_id uuid, p_session_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:418` | direct_ddl |
| `function:private.invite_workspace_member_v1(p_email text, p_role text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:716` | direct_ddl |
| `function:private.job_authority_is_current_v1(p_job_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:331` | direct_ddl |
| `function:private.job_for_capability(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:405` | dynamic_definition_transform |
| `function:private.job_for_failure_capability(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:625` | direct_ddl |
| `function:private.list_my_workspace_invites_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:730` | direct_ddl |
| `function:private.list_my_workspaces_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:614` | direct_ddl |
| `function:private.lock_job_authority_v1(p_job_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:339` | direct_ddl |
| `function:private.manage_workspace_project(p_session_id uuid, p_action text, p_project_name text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:446` | dynamic_definition_transform |
| `function:private.manage_workspace_project_group(p_group_id uuid, p_action text, p_name text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:446` | dynamic_definition_transform |
| `function:private.prepare_qualified_introduction_plan(p_organization_id uuid, p_session_id uuid, p_match_screen_fingerprint text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:886` | dynamic_definition_transform |
| `function:private.queue_advisor_initial_turn_v1(p_project_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:446` | dynamic_definition_transform |
| `function:private.read_capital_project_review_context_v1(p_project_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:450` | dynamic_definition_transform |
| `function:private.read_institutional_configuration_reviews_v1(p_project_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:450` | dynamic_definition_transform |
| `function:private.read_institutional_model_results_v1(p_project_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:450` | dynamic_definition_transform |
| `function:private.read_institutional_model_setup_v1(p_project_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:451` | dynamic_definition_transform |
| `function:private.read_institutional_revision_proposals_v1(p_project_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:451` | dynamic_definition_transform |
| `function:private.read_presentation_template_v1(p_project_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:452` | dynamic_definition_transform |
| `function:private.read_processing_model_lineage(p_organization_id uuid, p_session_id uuid, p_processing_run_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:886` | dynamic_definition_transform |
| `function:private.read_project_revision_history_v1(p_project_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:451` | dynamic_definition_transform |
| `function:private.read_workspace_access_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:776` | direct_ddl |
| `function:private.record_capital_project_plan(p_project_id uuid, p_snapshot jsonb)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:446` | dynamic_definition_transform |
| `function:private.record_case_model_spend(p_organization_id uuid, p_session_id uuid, p_cost_usd numeric, p_calls integer)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:886` | dynamic_definition_transform |
| `function:private.record_execution_proposal_plan_as_actor(p_project_id uuid, p_snapshot jsonb, p_actor_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:898` | dynamic_definition_transform |
| `function:private.record_storage_rotation_v1(p_rotation_id uuid, p_capability text, p_sha256 text, p_byte_length bigint, p_complete boolean)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:841` | direct_ddl |
| `function:private.register_access_resource_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:150` | direct_ddl |
| `function:private.request_capital_planning_revision_v1(p_artifact_id uuid, p_artifact_fingerprint text, p_note text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:886` | dynamic_definition_transform |
| `function:private.request_company_debt_view_revision_v1(p_artifact_id uuid, p_artifact_fingerprint text, p_note text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:886` | dynamic_definition_transform |
| `function:private.request_documentary_work_revision_v1(p_project_id uuid, p_execution_brief_id uuid, p_expected_fingerprint text, p_message_id uuid, p_locale text, p_content text, p_plan jsonb)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:447` | dynamic_definition_transform |
| `function:private.request_origination_thesis_revision_v1(p_artifact_id uuid, p_artifact_fingerprint text, p_note text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:886` | dynamic_definition_transform |
| `function:private.require_artifact_access_v1(p_artifact_id uuid, p_action text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:874` | direct_ddl |
| `function:private.require_resource_access_v1(p_resource_id uuid, p_action text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:428` | direct_ddl |
| `function:private.resource_access_as_subject_v1(p_organization_id uuid, p_resource_id uuid, p_subject_user_id uuid, p_action text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:83` | direct_ddl |
| `function:private.resource_root_v1(p_organization_id uuid, p_resource_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:78` | direct_ddl |
| `function:private.restart_onboarding_intake(p_organization_id uuid, p_session_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:886` | dynamic_definition_transform |
| `function:private.review_execution_authority_current_v1(p_id uuid, p_resource_id uuid, p_subject uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:954` | direct_ddl |
| `function:private.review_institutional_configuration_and_calculate_v1(p_project_id uuid, p_candidate_id uuid, p_expected_parent_fingerprint text, p_decision text, p_expected_candidate_fingerprint text, p_request_id uuid, p_locale text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:975` | dynamic_definition_transform |
| `function:private.revoke_membership_resources_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:380` | direct_ddl |
| `function:private.revoke_resource_access_v1(p_resource_id uuid, p_subject_user_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:214` | direct_ddl |
| `function:private.save_guided_company_profile(p_session_id uuid, p_name text, p_legal_name text, p_website text, p_description text, p_identifier_hash bytea, p_identifier_last4 text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:449` | dynamic_definition_transform |
| `function:private.save_project_company_context(p_session_id uuid, p_profile jsonb)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:447` | dynamic_definition_transform |
| `function:private.save_project_company_profile(p_session_id uuid, p_name text, p_legal_name text, p_website text, p_description text, p_identifier_hash bytea, p_identifier_last4 text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:449` | dynamic_definition_transform |
| `function:private.seed_resource_authority_v1(p_organization_id uuid, p_resource_id uuid, p_creator_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:104` | direct_ddl |
| `function:private.set_capital_project_review_assignment_v1(p_project_id uuid, p_user_id uuid, p_review_role text, p_assigned boolean)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:452` | dynamic_definition_transform |
| `function:private.set_presentation_template_v1(p_organization_id uuid, p_project_id uuid, p_definition jsonb)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:886` | dynamic_definition_transform |
| `function:private.set_workspace_member_v1(p_user_id uuid, p_role text, p_status text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:760` | direct_ddl |
| `function:private.set_workspace_project_job(p_session_id uuid, p_entry_job text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:447` | dynamic_definition_transform |
| `function:private.storage_operation_is_revocable_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:532` | direct_ddl |
| `function:private.submit_advisor_artifact_revision_turn_v1(p_project_id uuid, p_message_id uuid, p_locale text, p_content text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:448` | dynamic_definition_transform |
| `function:private.submit_advisor_execution_brief_edit_v1(p_project_id uuid, p_execution_brief_id uuid, p_expected_fingerprint text, p_message_id uuid, p_locale text, p_content text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:448` | dynamic_definition_transform |
| `function:private.submit_advisor_information_response_v1(p_project_id uuid, p_request_id uuid, p_expected_updated_at timestamp with time zone, p_message_id uuid, p_locale text, p_answer_source text, p_content text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:448` | dynamic_definition_transform |
| `function:private.submit_advisor_turn_v1(p_project_id uuid, p_message_id uuid, p_locale text, p_content text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:448` | dynamic_definition_transform |
| `function:private.submit_review_execution_turn_v1(p_project_id uuid, p_message_id uuid, p_locale text, p_content text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:971` | dynamic_definition_transform |
| `function:private.sync_review_resource_access_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:908` | direct_ddl |
| `function:private.update_workspace_project(p_session_id uuid, p_project_name text, p_identity_policy text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:449` | dynamic_definition_transform |
| `function:private.worker_authorize_document_storage_v1(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:514` | direct_ddl |
| `function:private.worker_can_access_capital_project_material(p_object_path text, p_write boolean)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:668` | direct_ddl |
| `function:private.worker_can_access_document_storage_v1(p_bucket text, p_object_path text, p_write boolean)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:505` | direct_ddl |
| `function:private.worker_can_rotate_storage_v1(p_bucket text, p_path text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:860` | direct_ddl |
| `function:private.worker_claim_job(p_worker_token text, p_lease_seconds integer)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:409` | dynamic_definition_transform |
| `function:private.worker_claim_job_v2(p_worker_token text, p_lease_seconds integer)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:409` | dynamic_definition_transform |
| `function:private.worker_load_agent_context_before_professional_context_v1(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:1078` | dynamic_definition_transform |
| `function:private.worker_runtime_schema_contract_before_resource_access_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:1106` | dynamic_definition_transform |
| `function:private.workspace_membership_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:593` | direct_ddl |
| `function:public.accept_workspace_invite_v1(p_invite_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:772` | direct_ddl |
| `function:public.claim_storage_rotation_v1(p_worker_token text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:869` | direct_ddl |
| `function:public.create_opportunity_intake(p_organization_id uuid, p_legal_name text, p_sector text, p_purpose text, p_requested_amount numeric, p_currency text, p_desired_term_months integer, p_output_locale text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:1068` | direct_ddl |
| `function:public.grant_resource_access_v1(p_resource_id uuid, p_subject_user_id uuid, p_action text, p_expires_at timestamp with time zone)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:211` | direct_ddl |
| `function:public.invite_workspace_member_v1(p_email text, p_role text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:770` | direct_ddl |
| `function:public.list_my_workspace_invites_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:771` | direct_ddl |
| `function:public.list_my_workspaces_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:620` | direct_ddl |
| `function:public.read_workspace_access_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:791` | direct_ddl |
| `function:public.record_storage_rotation_v1(p_rotation_id uuid, p_capability text, p_sha256 text, p_byte_length bigint, p_complete boolean)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:870` | direct_ddl |
| `function:public.revoke_resource_access_v1(p_resource_id uuid, p_subject_user_id uuid)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:229` | direct_ddl |
| `function:public.set_workspace_member_v1(p_user_id uuid, p_role text, p_status text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:773` | direct_ddl |
| `function:public.worker_authorize_document_storage_v1(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:525` | direct_ddl |
| `function:public.worker_claim_job(p_worker_token text, p_lease_seconds integer)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:572` | direct_ddl |
| `function:public.worker_claim_job_v2(p_worker_token text, p_lease_seconds integer)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:570` | direct_ddl |
| `function:public.worker_claim_job_v3(p_worker_token text, p_lease_seconds integer)` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:566` | direct_ddl |
| `function:public.worker_runtime_schema_contract_v1()` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:1111` | direct_ddl |
| `policy:private.access_resources.access_resources_deny_clients` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:74` | direct_ddl |
| `policy:private.authorization_revisions.authorization_revisions_deny_clients` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:76` | direct_ddl |
| `policy:private.resource_access_grants.resource_access_grants_deny_clients` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:75` | direct_ddl |
| `policy:private.review_execution_authorizations.review_execution_authorizations_deny_clients` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:949` | direct_ddl |
| `policy:private.storage_path_rotations.storage_path_rotations_deny_clients` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:813` | direct_ddl |
| `policy:public.access_requests.access_requests_select` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:1088` | direct_ddl |
| `policy:public.access_requests.access_requests_update` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:1093` | direct_ddl |
| `policy:public.capital_requests.capital_requests_insert` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:308` | direct_ddl |
| `policy:public.capital_requests.capital_requests_select` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:304` | direct_ddl |
| `policy:public.capital_requests.capital_requests_update` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:306` | direct_ddl |
| `policy:public.case_execution_comparisons.case_execution_comparisons_select` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:312` | direct_ddl |
| `policy:public.case_retrieval_chunks.case_retrieval_chunks_select_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:270` | direct_ddl |
| `policy:public.companies.companies_select` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:292` | direct_ddl |
| `policy:public.companies.companies_update` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:294` | direct_ddl |
| `policy:public.disclosure_grants.disclosure_grants_select` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:1099` | direct_ddl |
| `policy:public.document_intake_sessions.document_intake_sessions_insert` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:267` | direct_ddl |
| `policy:public.document_intake_sessions.document_intake_sessions_select` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:259` | direct_ddl |
| `policy:public.document_intake_sessions.document_intake_sessions_update` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:262` | direct_ddl |
| `policy:public.extraction_feedback.extraction_feedback_insert` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.intake_field_candidates.intake_field_candidates_delete` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.intake_field_candidates.intake_field_candidates_insert` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.intake_field_candidates.intake_field_candidates_update` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.intake_issues.intake_issues_delete` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.intake_issues.intake_issues_insert` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.intake_issues.intake_issues_update` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.intent_envelopes.intent_envelopes_select` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:310` | direct_ddl |
| `policy:public.match_results.match_results_all` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:470` | dynamic_definition_transform |
| `policy:public.match_results.match_results_delete_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:478` | direct_ddl |
| `policy:public.match_results.match_results_insert_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:473` | direct_ddl |
| `policy:public.match_results.match_results_select_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:471` | direct_ddl |
| `policy:public.match_results.match_results_update_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:475` | direct_ddl |
| `policy:public.output_versions.output_versions_all` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:691` | dynamic_definition_transform |
| `policy:public.output_versions.output_versions_delete_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:703` | direct_ddl |
| `policy:public.output_versions.output_versions_insert_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:695` | direct_ddl |
| `policy:public.output_versions.output_versions_select_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:692` | direct_ddl |
| `policy:public.output_versions.output_versions_update_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:698` | direct_ddl |
| `policy:public.published_opportunity_projections.published_projections_insert` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:501` | direct_ddl |
| `policy:public.published_opportunity_projections.published_projections_select` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:498` | direct_ddl |
| `policy:public.published_opportunity_projections.published_projections_update` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:503` | direct_ddl |
| `policy:public.scenario_versions.scenario_versions_all` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:480` | dynamic_definition_transform |
| `policy:public.scenario_versions.scenario_versions_delete_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:488` | direct_ddl |
| `policy:public.scenario_versions.scenario_versions_insert_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:483` | direct_ddl |
| `policy:public.scenario_versions.scenario_versions_select_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:481` | direct_ddl |
| `policy:public.scenario_versions.scenario_versions_update_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:485` | direct_ddl |
| `policy:public.sounding_events.sounding_events_insert` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.sounding_investors.sounding_investors_delete` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.sounding_investors.sounding_investors_insert` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.sounding_investors.sounding_investors_update` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.soundings.soundings_delete` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.soundings.soundings_insert` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.soundings.soundings_update` | `supabase/migrations/20260915204124_require_work_for_legacy_mutations.sql:10` | dynamic_definition_transform |
| `policy:public.source_documents.source_documents_select` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:274` | direct_ddl |
| `policy:public.source_documents.source_documents_update` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:278` | direct_ddl |
| `policy:public.workflow_runs.workflow_runs_all` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:491` | dynamic_definition_transform |
| `policy:public.workflow_runs.workflow_runs_delete_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:495` | direct_ddl |
| `policy:public.workflow_runs.workflow_runs_insert_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:493` | direct_ddl |
| `policy:public.workflow_runs.workflow_runs_select_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:492` | direct_ddl |
| `policy:public.workflow_runs.workflow_runs_update_scoped` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:494` | direct_ddl |
| `policy:storage.objects.job_document_layer_storage_insert` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:545` | direct_ddl |
| `policy:storage.objects.job_document_layer_storage_update` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:547` | direct_ddl |
| `policy:storage.objects.job_document_storage_select` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:543` | direct_ddl |
| `policy:storage.objects.private_storage_no_bearer_signing` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:541` | direct_ddl |
| `policy:storage.objects.storage_rotation_insert` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:868` | direct_ddl |
| `policy:storage.objects.storage_rotation_select` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:866` | direct_ddl |
| `policy:storage.objects.storage_rotation_update` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:867` | direct_ddl |
| `r:private.access_resources` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:3` | direct_ddl |
| `r:private.authorization_revisions` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:55` | direct_ddl |
| `r:private.resource_access_grants` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:32` | direct_ddl |
| `r:private.review_execution_authorizations` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:935` | direct_ddl |
| `r:private.storage_path_rotations` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:797` | direct_ddl |
| `trigger:private.access_resources.access_resources_audit` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:466` | direct_ddl |
| `trigger:private.access_resources.access_resources_updated_at` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:463` | direct_ddl |
| `trigger:private.authorization_revisions.authorization_revisions_audit` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:468` | direct_ddl |
| `trigger:private.authorization_revisions.authorization_revisions_updated_at` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:465` | direct_ddl |
| `trigger:private.resource_access_grants.resource_access_grants_audit` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:467` | direct_ddl |
| `trigger:private.resource_access_grants.resource_access_grants_updated_at` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:464` | direct_ddl |
| `trigger:private.review_execution_authorizations.review_execution_authorizations_audit` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:951` | direct_ddl |
| `trigger:private.review_execution_authorizations.review_execution_authorizations_updated_at` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:950` | direct_ddl |
| `trigger:private.storage_path_rotations.storage_path_rotations_audit` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:815` | direct_ddl |
| `trigger:private.storage_path_rotations.storage_path_rotations_updated_at` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:814` | direct_ddl |
| `trigger:public.capital_project_review_assignments.capital_project_review_assignments_access` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:926` | direct_ddl |
| `trigger:public.capital_projects.capital_projects_access_resource` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:177` | direct_ddl |
| `trigger:public.companies.companies_access_resource` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:178` | direct_ddl |
| `trigger:public.document_intake_sessions.intake_sessions_access_resource` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:180` | direct_ddl |
| `trigger:public.opportunities.opportunities_access_resource` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:181` | direct_ddl |
| `trigger:public.organization_memberships.organization_memberships_resource_revocation` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:396` | direct_ddl |
| `trigger:public.processing_jobs.processing_jobs_bind_authority` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:378` | direct_ddl |
| `trigger:public.workspace_project_groups.workspace_groups_access_resource` | `supabase/migrations/20260915204116_explicit_legacy_resource_access.sql:179` | direct_ddl |

## Contexto sem cargo 1C

| Objeto | Fonte vigente | Mecanismo |
|---|---|---|
| `function:private.worker_load_agent_context_before_execution_brief_v1(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260916005712_role_free_reasoning_context.sql:4` | direct_ddl |
| `function:private.worker_load_capital_project_context_v4(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260916005712_role_free_reasoning_context.sql:83` | direct_ddl |
| `function:private.worker_load_capital_project_context_v6(p_job_id uuid, p_capability_token text)` | `supabase/migrations/20260916005712_role_free_reasoning_context.sql:137` | direct_ddl |

## Identidade e contexto explícito 2

| Objeto | Fonte vigente | Mecanismo |
|---|---|---|
| `function:private.accept_private_workspace_terms(p_locale text, p_signatory_name text, p_signatory_title text, p_terms_agreed boolean, p_information_rights_declared boolean)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:636` | direct_ddl |
| `function:private.accept_workspace_invite_v1(p_invite_id uuid)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:240` | dynamic_definition_transform |
| `function:private.confirm_provider_mandate_v1(p_organization_id uuid, p_mandate_id uuid, p_channel text, p_valid_from date, p_valid_until date, p_document_reference text, p_contact_record_id uuid, p_contact_date date, p_note text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1452` | direct_ddl |
| `function:private.create_organization_with_owner_v1(p_organization_type text, p_name text, p_legal_name text, p_country_code text, p_website text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:246` | direct_ddl |
| `function:private.create_workspace_project_group(p_name text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:346` | direct_ddl |
| `function:private.get_onboarding_bootstrap(p_locale text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:850` | direct_ddl |
| `function:private.get_workspace_bootstrap()` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:970` | direct_ddl |
| `function:private.get_workspace_context_v1()` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:126` | direct_ddl |
| `function:private.get_workspace_project_setup(p_locale text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1044` | direct_ddl |
| `function:private.initialize_workspace_v1(p_full_name text, p_locale text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:194` | direct_ddl |
| `function:private.link_commercial_account_v1(p_account_id uuid, p_expected_account_id uuid)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:177` | direct_ddl |
| `function:private.list_my_workspaces_v1()` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1709` | direct_ddl |
| `function:private.manage_workspace_project(p_session_id uuid, p_action text, p_project_name text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1619` | direct_ddl |
| `function:private.organization_has_workspace_capability(p_organization_id uuid, p_capability text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:113` | direct_ddl |
| `function:private.register_provider_mandate_v1(p_organization_id uuid, p_fund_id uuid, p_fund_name text, p_fund_strategy text, p_mandate jsonb)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1369` | direct_ddl |
| `function:private.remember_workspace_v1(p_organization_id uuid)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:144` | direct_ddl |
| `function:private.require_workspace_capability(p_organization_id uuid, p_capability text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:117` | direct_ddl |
| `function:private.seed_workspace_foundation_v1()` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:83` | direct_ddl |
| `function:private.set_workspace_capability_v1(p_capability text, p_enabled boolean, p_expected_revision bigint)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:156` | direct_ddl |
| `function:private.start_advisor_project_v1(p_request_id uuid, p_locale text, p_project_name text, p_entry_job text, p_prompt text, p_access_basis text, p_plan jsonb)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1217` | direct_ddl |
| `function:private.start_financier_analytical_workspace_v1(p_locale text, p_signatory_name text, p_signatory_title text, p_terms_agreed boolean, p_information_rights_declared boolean, p_terms_acceptance_recorded boolean)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:757` | direct_ddl |
| `function:private.start_onboarding_intake(p_locale text, p_project_name text, p_identity_policy text, p_representation_declared boolean)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:423` | direct_ddl |
| `function:private.start_public_capital_project(p_locale text, p_project_name text, p_entry_job text, p_company_name text, p_company_website text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1514` | direct_ddl |
| `function:private.start_public_company_debt_view_v1(p_request_id uuid, p_locale text, p_project_name text, p_company_name text, p_company_website text, p_brief jsonb, p_plan jsonb)` | `supabase/migrations/20260916035119_explicit_workspace_replay_authority.sql:3` | direct_ddl |
| `function:private.start_public_origination_thesis_v1(p_request_id uuid, p_locale text, p_project_name text, p_company_name text, p_company_website text, p_brief jsonb, p_plan jsonb)` | `supabase/migrations/20260916035119_explicit_workspace_replay_authority.sql:157` | direct_ddl |
| `function:private.start_workspace_intake(p_organization_id uuid, p_locale text, p_project_name text, p_identity_policy text, p_representation_declared boolean)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:555` | direct_ddl |
| `function:private.start_workspace_project(p_locale text, p_project_name text, p_identity_policy text, p_representation_declared boolean)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:387` | direct_ddl |
| `function:private.update_workspace_project(p_session_id uuid, p_project_name text, p_identity_policy text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1127` | direct_ddl |
| `function:private.withdraw_provider_mandate_v1(p_organization_id uuid, p_mandate_id uuid, p_note text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1580` | direct_ddl |
| `function:private.workspace_context_matches_v1(p_organization_id uuid)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:216` | direct_ddl |
| `function:public.accept_private_workspace_terms(p_locale text, p_signatory_name text, p_signatory_title text, p_terms_agreed boolean, p_information_rights_declared boolean)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:635` | dynamic_definition_transform |
| `function:public.accept_workspace_invite_v1(p_invite_id uuid)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:240` | dynamic_definition_transform |
| `function:public.confirm_provider_mandate_v1(p_organization_id uuid, p_mandate_id uuid, p_channel text, p_valid_from date, p_valid_until date, p_document_reference text, p_contact_record_id uuid, p_contact_date date, p_note text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1451` | dynamic_definition_transform |
| `function:public.create_organization_with_owner_v1(p_organization_type text, p_name text, p_legal_name text, p_country_code text, p_website text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:206` | dynamic_definition_transform |
| `function:public.create_workspace_project_group(p_name text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:345` | dynamic_definition_transform |
| `function:public.get_onboarding_bootstrap(p_locale text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:849` | dynamic_definition_transform |
| `function:public.get_workspace_bootstrap()` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:969` | dynamic_definition_transform |
| `function:public.get_workspace_context_v1()` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:140` | direct_ddl |
| `function:public.get_workspace_project_setup(p_locale text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1043` | dynamic_definition_transform |
| `function:public.initialize_professional_onboarding(p_journey text, p_full_name text, p_job_title text, p_locale text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:278` | direct_ddl |
| `function:public.initialize_workspace_v1(p_full_name text, p_locale text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:210` | direct_ddl |
| `function:public.link_commercial_account_v1(p_account_id uuid, p_expected_account_id uuid)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:189` | direct_ddl |
| `function:public.list_my_workspaces_v1()` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1709` | dynamic_definition_transform |
| `function:public.manage_workspace_project(p_session_id uuid, p_action text, p_project_name text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1618` | dynamic_definition_transform |
| `function:public.register_provider_mandate_v1(p_organization_id uuid, p_fund_id uuid, p_fund_name text, p_fund_strategy text, p_mandate jsonb)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1368` | dynamic_definition_transform |
| `function:public.remember_workspace_v1(p_organization_id uuid)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:152` | direct_ddl |
| `function:public.set_workspace_capability_v1(p_capability text, p_enabled boolean, p_expected_revision bigint)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:172` | direct_ddl |
| `function:public.start_advisor_project_v1(p_request_id uuid, p_locale text, p_project_name text, p_entry_job text, p_prompt text, p_access_basis text, p_plan jsonb)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1180` | direct_ddl |
| `function:public.start_financier_analytical_workspace_v1(p_locale text, p_signatory_name text, p_signatory_title text, p_terms_agreed boolean, p_information_rights_declared boolean, p_terms_acceptance_recorded boolean)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:756` | dynamic_definition_transform |
| `function:public.start_onboarding_intake(p_locale text, p_project_name text, p_identity_policy text, p_representation_declared boolean)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:422` | dynamic_definition_transform |
| `function:public.start_public_capital_project(p_locale text, p_project_name text, p_entry_job text, p_company_name text, p_company_website text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1513` | dynamic_definition_transform |
| `function:public.start_public_company_debt_view_v1(p_request_id uuid, p_locale text, p_project_name text, p_company_name text, p_company_website text, p_brief jsonb, p_plan jsonb)` | `supabase/migrations/20260916035119_explicit_workspace_replay_authority.sql:3` | dynamic_definition_transform |
| `function:public.start_public_origination_thesis_v1(p_request_id uuid, p_locale text, p_project_name text, p_company_name text, p_company_website text, p_brief jsonb, p_plan jsonb)` | `supabase/migrations/20260916035119_explicit_workspace_replay_authority.sql:157` | dynamic_definition_transform |
| `function:public.start_workspace_intake(p_organization_id uuid, p_locale text, p_project_name text, p_identity_policy text, p_representation_declared boolean)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:411` | dynamic_definition_transform |
| `function:public.start_workspace_project(p_locale text, p_project_name text, p_identity_policy text, p_representation_declared boolean)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:386` | dynamic_definition_transform |
| `function:public.update_workspace_project(p_session_id uuid, p_project_name text, p_identity_policy text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1126` | dynamic_definition_transform |
| `function:public.withdraw_provider_mandate_v1(p_organization_id uuid, p_mandate_id uuid, p_note text)` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:1579` | dynamic_definition_transform |
| `policy:private.account_organizations.account_organizations_deny_clients` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:66` | direct_ddl |
| `policy:private.commercial_accounts.commercial_accounts_deny_clients` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:65` | direct_ddl |
| `policy:private.workspace_capability_grants.workspace_capability_grants_deny_clients` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:67` | direct_ddl |
| `policy:public.onboarding_progress.onboarding_progress_delete_context` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:233` | direct_ddl |
| `policy:public.onboarding_progress.onboarding_progress_insert_context` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:229` | direct_ddl |
| `policy:public.onboarding_progress.onboarding_progress_update_context` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:231` | direct_ddl |
| `policy:public.organizations.organizations_update_admin` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:226` | dynamic_definition_transform |
| `policy:public.user_workspace_preferences.user_workspace_preferences_delete_denied` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:73` | direct_ddl |
| `policy:public.user_workspace_preferences.user_workspace_preferences_insert_denied` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:71` | direct_ddl |
| `policy:public.user_workspace_preferences.user_workspace_preferences_select_authorized` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:69` | direct_ddl |
| `policy:public.user_workspace_preferences.user_workspace_preferences_update_denied` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:72` | direct_ddl |
| `r:private.account_organizations` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:21` | direct_ddl |
| `r:private.commercial_accounts` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:14` | direct_ddl |
| `r:private.workspace_capability_grants` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:33` | direct_ddl |
| `r:public.user_workspace_preferences` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:45` | direct_ddl |
| `trigger:private.account_organizations.account_organizations_audit` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:80` | direct_ddl |
| `trigger:private.account_organizations.account_organizations_updated_at` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:76` | direct_ddl |
| `trigger:private.commercial_accounts.commercial_accounts_audit` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:79` | direct_ddl |
| `trigger:private.commercial_accounts.commercial_accounts_updated_at` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:75` | direct_ddl |
| `trigger:private.workspace_capability_grants.workspace_capability_grants_audit` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:81` | direct_ddl |
| `trigger:private.workspace_capability_grants.workspace_capability_grants_updated_at` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:77` | direct_ddl |
| `trigger:public.organizations.organizations_workspace_foundation` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:104` | direct_ddl |
| `trigger:public.user_workspace_preferences.user_workspace_preferences_updated_at` | `supabase/migrations/20260916035105_explicit_workspace_context.sql:78` | direct_ddl |

## Retirada dos defaults comerciais da etapa 2

| Objeto | Fonte vigente | Mecanismo |
|---|---|---|
| `function:private.organization_has_workspace_capability(p_organization_type text, p_capability text)` | `supabase/migrations/20260916041917_retire_implicit_workspace_capabilities.sql:28` | dynamic_definition_transform |
| `function:private.require_workspace_capability(p_organization_type text, p_capability text)` | `supabase/migrations/20260916041917_retire_implicit_workspace_capabilities.sql:27` | dynamic_definition_transform |
| `function:private.seed_workspace_foundation_v1()` | `supabase/migrations/20260916041917_retire_implicit_workspace_capabilities.sql:3` | direct_ddl |
| `function:public.initialize_professional_onboarding(p_journey text, p_full_name text, p_job_title text, p_locale text)` | `supabase/migrations/20260916041917_retire_implicit_workspace_capabilities.sql:16` | direct_ddl |
