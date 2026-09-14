# Contratos de migração - nomes propostos e política de escrita

Este anexo pertence ao plano. **Todos os objetos desta lista são propostas novas**, não inventário de produção. Cada nome fica associado à etapa que o introduz. Os objetos instalados e as políticas que serão substituídas estão nos três inventários do estado atual.

A regra de escrita é única: comando validado, transação, evento e versão. Tabelas de conteúdo não recebem INSERT/UPDATE/DELETE direto de `anon` ou `authenticated`. A política SELECT verifica o recurso, suas dependências, o sujeito e a ação. Um grant de participação no trabalho não amplia leitura de tudo o que foi usado por outra pessoa.

Para tabelas `private`, a policy `<tabela>_deny_clients` é RESTRICTIVE, para ALL, com USING/WITH CHECK false para anon/authenticated; retirar grants diretos. Somente funções privadas limitadas com a autoridade validada podem gravar/ler. RLS é habilitada/forçada, mas não substitui a verificação no SECURITY DEFINER.

Para tabelas `public` privadas, `<tabela>_select_authorized` é a policy SELECT de authenticated, respaldada pelo recurso/versão; revogar mutações diretas e não criar ALL permissiva. `user_workspace_preferences` usa a pessoa autenticada e valida membership do contexto escolhido. `entities`/`entity_identifiers` distinguem identidade pública validada de identidade privada de tenant; visibilidade pública nunca dá acesso ao dossiê. Componentes padrão de método são distribuição autorizada da biblioteca Offroad, não dados de clientes: a projeção consumida fixa versão e licença de uso; não é uma exceção geral entre tenants.

Views de compatibilidade de conteúdo usam `security_invoker=true`, ou permanecem privadas sem grants a clientes. Nenhuma view de analytics/auditoria expõe conteúdo privado por ser criada pelo owner do banco.

## Novas tabelas e políticas

| Etapa | Tabela nova | Política nova | Escrita |
| --- | --- | --- | --- |
| 1B | `private.access_resources` | `access_resources_deny_clients` | comando da etapa; sem DML direto de clientes |
| 1B | `private.resource_access_grants` | `resource_access_grants_deny_clients` | comando da etapa; sem DML direto de clientes |
| 1B | `private.authorization_revisions` | `authorization_revisions_deny_clients` | comando da etapa; sem DML direto de clientes |
| 2 | `private.commercial_accounts` | `commercial_accounts_deny_clients` | comando da etapa; sem DML direto de clientes |
| 2 | `private.account_organizations` | `account_organizations_deny_clients` | comando da etapa; sem DML direto de clientes |
| 2 | `public.user_workspace_preferences` | `user_workspace_preferences_select_authorized` | comando da etapa; sem DML direto de clientes |
| 3 | `private.principals` | `principals_deny_clients` | comando da etapa; sem DML direto de clientes |
| 3 | `private.organization_units` | `organization_units_deny_clients` | comando da etapa; sem DML direto de clientes |
| 3 | `private.access_groups` | `access_groups_deny_clients` | comando da etapa; sem DML direto de clientes |
| 3 | `private.access_group_memberships` | `access_group_memberships_deny_clients` | comando da etapa; sem DML direto de clientes |
| 3 | `private.information_barriers` | `information_barriers_deny_clients` | comando da etapa; sem DML direto de clientes |
| 3 | `private.barrier_memberships` | `barrier_memberships_deny_clients` | comando da etapa; sem DML direto de clientes |
| 4 | `private.domain_events` | `domain_events_deny_clients` | comando da etapa; sem DML direto de clientes |
| 4 | `private.event_outbox` | `event_outbox_deny_clients` | comando da etapa; sem DML direto de clientes |
| 4 | `private.access_decision_events` | `access_decision_events_deny_clients` | comando da etapa; sem DML direto de clientes |
| 5 | `public.entities` | `entities_select_authorized` | comando da etapa; sem DML direto de clientes |
| 5 | `public.entity_identifiers` | `entity_identifiers_select_authorized` | comando da etapa; sem DML direto de clientes |
| 5 | `public.dossiers` | `dossiers_select_authorized` | comando da etapa; sem DML direto de clientes |
| 5 | `public.dossier_entity_links` | `dossier_entity_links_select_authorized` | comando da etapa; sem DML direto de clientes |
| 6 | `public.sources` | `sources_select_authorized` | comando da etapa; sem DML direto de clientes |
| 6 | `public.source_versions` | `source_versions_select_authorized` | comando da etapa; sem DML direto de clientes |
| 6 | `public.source_bindings` | `source_bindings_select_authorized` | comando da etapa; sem DML direto de clientes |
| 7 | `private.source_rights_versions` | `source_rights_versions_deny_clients` | comando da etapa; sem DML direto de clientes |
| 7 | `private.resource_dependencies` | `resource_dependencies_deny_clients` | comando da etapa; sem DML direto de clientes |
| 8 | `public.observations` | `observations_select_authorized` | comando da etapa; sem DML direto de clientes |
| 8 | `public.metric_definitions` | `metric_definitions_select_authorized` | comando da etapa; sem DML direto de clientes |
| 8 | `public.definition_versions` | `definition_versions_select_authorized` | comando da etapa; sem DML direto de clientes |
| 9 | `public.adoption_decisions` | `adoption_decisions_select_authorized` | comando da etapa; sem DML direto de clientes |
| 9 | `public.assumption_sets` | `assumption_sets_select_authorized` | comando da etapa; sem DML direto de clientes |
| 9 | `public.assumption_versions` | `assumption_versions_select_authorized` | comando da etapa; sem DML direto de clientes |
| 10 | `public.work_contexts` | `work_contexts_select_authorized` | comando da etapa; sem DML direto de clientes |
| 10 | `public.work_dossiers` | `work_dossiers_select_authorized` | comando da etapa; sem DML direto de clientes |
| 11 | `public.work_participants` | `work_participants_select_authorized` | comando da etapa; sem DML direto de clientes |
| 11 | `public.work_channels` | `work_channels_select_authorized` | comando da etapa; sem DML direto de clientes |
| 11 | `public.work_contributions` | `work_contributions_select_authorized` | comando da etapa; sem DML direto de clientes |
| 11 | `public.contribution_revisions` | `contribution_revisions_select_authorized` | comando da etapa; sem DML direto de clientes |
| 12 | `public.vault_entries` | `vault_entries_select_authorized` | comando da etapa; sem DML direto de clientes |
| 12 | `public.vault_entry_versions` | `vault_entry_versions_select_authorized` | comando da etapa; sem DML direto de clientes |
| 12 | `public.vault_publication_requests` | `vault_publication_requests_select_authorized` | comando da etapa; sem DML direto de clientes |
| 12 | `public.vault_publications` | `vault_publications_select_authorized` | comando da etapa; sem DML direto de clientes |
| 14 | `public.method_components` | `method_components_select_authorized` | comando da etapa; sem DML direto de clientes |
| 14 | `public.method_component_versions` | `method_component_versions_select_authorized` | comando da etapa; sem DML direto de clientes |
| 14 | `public.method_releases` | `method_releases_select_authorized` | comando da etapa; sem DML direto de clientes |
| 14 | `public.method_release_components` | `method_release_components_select_authorized` | comando da etapa; sem DML direto de clientes |
| 14 | `public.method_review_records` | `method_review_records_select_authorized` | comando da etapa; sem DML direto de clientes |
| 14 | `public.method_scope_bindings` | `method_scope_bindings_select_authorized` | comando da etapa; sem DML direto de clientes |
| 16 | `private.provider_processing_assurances` | `provider_processing_assurances_deny_clients` | comando da etapa; sem DML direto de clientes |
| 16 | `private.processing_eligibility_decisions` | `processing_eligibility_decisions_deny_clients` | comando da etapa; sem DML direto de clientes |
| 17 | `private.execution_manifests` | `execution_manifests_deny_clients` | comando da etapa; sem DML direto de clientes |
| 17 | `private.execution_input_snapshots` | `execution_input_snapshots_deny_clients` | comando da etapa; sem DML direto de clientes |
| 17 | `public.work_executions` | `work_executions_select_authorized` | comando da etapa; sem DML direto de clientes |
| 18 | `private.execution_dependencies` | `execution_dependencies_deny_clients` | comando da etapa; sem DML direto de clientes |
| 18 | `public.work_milestones` | `work_milestones_select_authorized` | comando da etapa; sem DML direto de clientes |
| 18 | `public.work_continuation_requests` | `work_continuation_requests_select_authorized` | comando da etapa; sem DML direto de clientes |
| 19 | `public.artifacts` | `artifacts_select_authorized` | comando da etapa; sem DML direto de clientes |
| 19 | `public.artifact_revisions` | `artifact_revisions_select_authorized` | comando da etapa; sem DML direto de clientes |
| 19 | `public.artifact_blocks` | `artifact_blocks_select_authorized` | comando da etapa; sem DML direto de clientes |
| 19 | `private.artifact_dependency_links` | `artifact_dependency_links_deny_clients` | comando da etapa; sem DML direto de clientes |
| 20 | `public.artifact_reviews` | `artifact_reviews_select_authorized` | comando da etapa; sem DML direto de clientes |
| 20 | `public.work_decisions` | `work_decisions_select_authorized` | comando da etapa; sem DML direto de clientes |
| 21 | `public.artifact_import_candidates` | `artifact_import_candidates_select_authorized` | comando da etapa; sem DML direto de clientes |
| 22 | `private.revocation_runs` | `revocation_runs_deny_clients` | comando da etapa; sem DML direto de clientes |
| 22 | `private.revocation_targets` | `revocation_targets_deny_clients` | comando da etapa; sem DML direto de clientes |
| 22 | `private.retention_rules` | `retention_rules_deny_clients` | comando da etapa; sem DML direto de clientes |
| 22 | `private.legal_holds` | `legal_holds_deny_clients` | comando da etapa; sem DML direto de clientes |
| 22 | `private.retention_actions` | `retention_actions_deny_clients` | comando da etapa; sem DML direto de clientes |

## Novos pontos de comando e leitura

O nome define uma API proposta; os argumentos serão schemas tipados da etapa, com versão esperada e chave idempotente nas mutações. Não aceitar `user_id` como identidade delegada sem derivá-la de sessão/capability. O wrapper público tem implementação privada de mesmo nome; a entrada privada invocada por worker requer capability. Autoridade de publicação, revisão e transferência não se confunde com simples grant de leitura.

| Ponto proposto | Entrada e implementação |
| --- | --- |
| `private.can_access_resource_v1` | helper privado; sessão/capability validada e grants mínimos |
| `private.claim_work_execution_v1` | helper privado; sessão/capability validada e grants mínimos |
| `private.commit_work_execution_result_v1` | helper privado; sessão/capability validada e grants mínimos |
| `public.add_work_participant_v1` | wrapper público → `private.add_work_participant_v1`; autoridade validada no comando |
| `public.adopt_observation_for_work_v1` | wrapper público → `private.adopt_observation_for_work_v1`; autoridade validada no comando |
| `public.adopt_work_update_v1` | wrapper público → `private.adopt_work_update_v1`; autoridade validada no comando |
| `public.append_work_turn_v1` | wrapper público → `private.append_work_turn_v1`; autoridade validada no comando |
| `public.bind_method_release_v1` | wrapper público → `private.bind_method_release_v1`; autoridade validada no comando |
| `public.bind_source_version_v1` | wrapper público → `private.bind_source_version_v1`; autoridade validada no comando |
| `public.compare_adoption_bases_v1` | wrapper público → `private.compare_adoption_bases_v1`; autoridade validada no comando |
| `public.create_artifact_revision_v1` | wrapper público → `private.create_artifact_revision_v1`; autoridade validada no comando |
| `public.create_organization_with_owner_v1` | wrapper público → `private.create_organization_with_owner_v1`; autoridade validada no comando |
| `public.explain_my_access_v1` | wrapper público → `private.explain_my_access_v1`; autoridade validada no comando |
| `public.export_authorized_audit_v1` | wrapper público → `private.export_authorized_audit_v1`; autoridade validada no comando |
| `public.get_workspace_context_v1` | wrapper público → `private.get_workspace_context_v1`; autoridade validada no comando |
| `public.grant_resource_access_v1` | wrapper público → `private.grant_resource_access_v1`; autoridade validada no comando |
| `public.link_dossier_entity_v1` | wrapper público → `private.link_dossier_entity_v1`; autoridade validada no comando |
| `public.list_my_workspaces_v1` | wrapper público → `private.list_my_workspaces_v1`; autoridade validada no comando |
| `public.promote_contribution_to_work_v1` | wrapper público → `private.promote_contribution_to_work_v1`; autoridade validada no comando |
| `public.propose_assumption_revision_v1` | wrapper público → `private.propose_assumption_revision_v1`; autoridade validada no comando |
| `public.propose_vault_publication_v1` | wrapper público → `private.propose_vault_publication_v1`; autoridade validada no comando |
| `public.publish_method_release_v1` | wrapper público → `private.publish_method_release_v1`; autoridade validada no comando |
| `public.publish_vault_entry_v1` | wrapper público → `private.publish_vault_entry_v1`; autoridade validada no comando |
| `public.read_artifact_revision_v1` | wrapper público → `private.read_artifact_revision_v1`; autoridade validada no comando |
| `public.read_dossier_v1` | wrapper público → `private.read_dossier_v1`; autoridade validada no comando |
| `public.read_revocation_status_v1` | wrapper público → `private.read_revocation_status_v1`; autoridade validada no comando |
| `public.record_observation_v1` | wrapper público → `private.record_observation_v1`; autoridade validada no comando |
| `public.record_work_decision_v1` | wrapper público → `private.record_work_decision_v1`; autoridade validada no comando |
| `public.register_source_version_v1` | wrapper público → `private.register_source_version_v1`; autoridade validada no comando |
| `public.request_work_continuation_v1` | wrapper público → `private.request_work_continuation_v1`; autoridade validada no comando |
| `public.request_work_execution_v1` | wrapper público → `private.request_work_execution_v1`; autoridade validada no comando |
| `public.resolve_entity_candidate_v1` | wrapper público → `private.resolve_entity_candidate_v1`; autoridade validada no comando |
| `public.retire_method_release_v1` | wrapper público → `private.retire_method_release_v1`; autoridade validada no comando |
| `public.review_artifact_revision_v1` | wrapper público → `private.review_artifact_revision_v1`; autoridade validada no comando |
| `public.revoke_resource_access_v1` | wrapper público → `private.revoke_resource_access_v1`; autoridade validada no comando |
| `public.search_authorized_resources_v1` | wrapper público → `private.search_authorized_resources_v1`; autoridade validada no comando |
| `public.start_work_v1` | wrapper público → `private.start_work_v1`; autoridade validada no comando |
| `public.submit_artifact_import_v1` | wrapper público → `private.submit_artifact_import_v1`; autoridade validada no comando |
| `public.submit_method_candidate_v1` | wrapper público → `private.submit_method_candidate_v1`; autoridade validada no comando |
| `public.submit_work_contribution_v1` | wrapper público → `private.submit_work_contribution_v1`; autoridade validada no comando |
| `public.transfer_organization_owner_v1` | wrapper público → `private.transfer_organization_owner_v1`; autoridade validada no comando |
| `public.withdraw_vault_publication_v1` | wrapper público → `private.withdraw_vault_publication_v1`; autoridade validada no comando |

| `private.append_domain_event_v1` | helper privado; autoridade operacional/capability limitada à finalidade; sem poder de publicação por modelo |
| `private.claim_event_outbox_v1` | helper privado; autoridade operacional/capability limitada à finalidade; sem poder de publicação por modelo |
| `private.complete_event_outbox_v1` | helper privado; autoridade operacional/capability limitada à finalidade; sem poder de publicação por modelo |
| `private.record_provider_processing_assurance_v1` | helper privado; autoridade operacional/capability limitada à finalidade; sem poder de publicação por modelo |
| `private.revoke_provider_processing_assurance_v1` | helper privado; autoridade operacional/capability limitada à finalidade; sem poder de publicação por modelo |
| `public.place_legal_hold_v1` | wrapper público → `private.place_legal_hold_v1`; autoridade validada no comando |
| `public.release_legal_hold_v1` | wrapper público → `private.release_legal_hold_v1`; autoridade validada no comando |
| `public.revoke_principal_access_v1` | wrapper público → `private.revoke_principal_access_v1`; autoridade validada no comando |
| `public.set_access_group_member_v1` | wrapper público → `private.set_access_group_member_v1`; autoridade validada no comando |
| `public.set_access_group_v1` | wrapper público → `private.set_access_group_v1`; autoridade validada no comando |
| `public.set_information_barrier_v1` | wrapper público → `private.set_information_barrier_v1`; autoridade validada no comando |
| `public.set_retention_rule_v1` | wrapper público → `private.set_retention_rule_v1`; autoridade validada no comando |

## Migração segura por objeto

1. Introduzir tabelas/colunas e comandos aditivos sem desabilitar o serviço existente. FKs novas que precisam de backfill são validadas antes do corte; jamais deixar validação pendente como estado final.
2. Converter escritor existente em adaptador transacional do comando novo; não manter dois escritores independentes. Preservar ID, versão, autor e relação com a fonte.
3. Aplicar a mesma autorização a tabela, view, RPC, busca, Storage e rota. Segurança não tem flag de retorno ao predicado amplo.
4. Conferir contagens, órfãos, hashes e amostra estrutural autorizada de backfill. Objetos sem origem resolvida mantêm classificação histórica/incompleta, sem publicação retroativa.
5. Mover leitor para projeção/contrato novo e executar teste positivo e negativo no caminho antigo. Retirar grant de escrita antigo na mesma entrega em que o escritor muda.
6. Retirar função/tabela de compatibilidade apenas após nenhum chamador legítimo e nenhuma dependência SQL; se dados ainda fazem parte do histórico, manter a tabela somente leitura. DROP nunca usa CASCADE para contornar dependência desconhecida.

As etapas 1A e 1B fazem corte atômico de autorização após backfill validado. Nenhuma leitura ampla permanece disponível enquanto o núcleo restante é construído.
