# Etapa 21 : eval SQL e concorrência observado

Commit avaliado: `5820c6835ba90a519a39e3ca2f5f633d14356145`. [Quality run 37343367471, job Database 111876480610](https://github.com/carlosevg100/offroad/actions/runs/37343367471/job/111876480610).

**Resultado:** 27 verificações focais da etapa 21, quatro regressões existentes do dashboard da etapa 20 e três corridas reais passaram. Os 31 registros SQL abaixo são asserções com `PASS` nominal emitido no log, não 31 testes novos nem uma contagem de todos os comandos ou casos internos dos arquivos. O job completo terminou **FAIL**, exclusivamente pelo checker que exige as duas migrações prospectivas no journal de produção; elas ainda não tinham sido aplicadas naquele run. Este registro não declara CI verde, aplicação remota, implantação nem conclusão da etapa.

Log original coletado pela API do job: `/private/tmp/offroad-stage21-db-ci5820.log`. As linhas da tabela são desse arquivo integral, sem filtragem. SHA-256 do log: `f3a031131bb6fafdd205c8a321451f3c173e4d05cb580ec07e8426052d7009ed`.

## Registros SQL

| # | Classe | Nome exato no log | Resultado | Arquivo e linha SQL emitida | Linha do log |
|---|---|---|---|---|---|
| 1 | Contrato 21 | `export_receipt_exact_bytes_and_manifest_replay` | PASS | `supabase/tests/artifact_export_receipts.sql:15` | 1219 |
| 2 | Contrato 21 | `export_member_and_cross_tenant_denied` | PASS | `supabase/tests/artifact_export_receipts.sql:23` | 1221 |
| 3 | Contrato 21 | `export_human_hash_writer_and_receipt_mutation_denied` | PASS | `supabase/tests/artifact_export_receipts.sql:31` | 1223 |
| 4 | Contrato 21 | `export_captured_manifest_identity_and_duplicate_denied` | PASS | `supabase/tests/artifact_export_receipts.sql:40` | 1225 |
| 5 | Contrato 21 | `export_revocation_reaches_receipt_storage_and_leased_worker` | PASS | `supabase/tests/artifact_export_receipts.sql:58` | 1227 |
| 6 | Contrato 21 | `import_scan_binding_and_exact_export_comparison` | PASS | `supabase/tests/artifact_import_candidates.sql:37` | 1330 |
| 7 | Contrato 21 | `import_work_artifact_discovery_exact_authorized_identity` | PASS | `supabase/tests/artifact_import_candidates.sql:54` | 1332 |
| 8 | Contrato 21 | `import_membership_writer_and_stale_adoption_denied` | PASS | `supabase/tests/artifact_import_candidates.sql:54` | 1333 |
| 9 | Contrato 21 | `import_multiscenario_comparison_bounds` | PASS | `supabase/tests/artifact_import_candidates.sql:64` | 1335 |
| 10 | Contrato 21 | `import_revocation_reaches_comparison_history` | PASS | `supabase/tests/artifact_import_candidates.sql:99` | 1337 |
| 11 | Contrato 21 | `import_adoption_retains_distinct_base_head_upload_and_base_revocation` | PASS | `supabase/tests/artifact_import_candidates.sql:152` | 1339 |
| 12 | Contrato 21 | `import_human_adoption_replay_person_revision_and_continuation` | PASS | `supabase/tests/artifact_import_candidates.sql:152` | 1340 |
| 13 | Contrato 21 | `import_compare_head_cas_no_lost_update_and_append_history` | PASS | `supabase/tests/artifact_import_candidates.sql:175` | 1342 |
| 14 | Contrato 21 | `import_informational_external_exact_review_releases_and_export_queues` | PASS | `supabase/tests/artifact_import_candidates.sql:237` | 1344 |
| 15 | Contrato 21 | `import_informational_approved_source_revocation_blocks_release` | PASS | `supabase/tests/artifact_import_candidates.sql:237` | 1345 |
| 16 | Contrato 21 | `import_informational_reviewer_access_revocation_blocks_release` | PASS | `supabase/tests/artifact_import_candidates.sql:237` | 1346 |
| 17 | Contrato 21 | `import_informational_revoked_review_blocks_export` | PASS | `supabase/tests/artifact_import_candidates.sql:237` | 1347 |
| 18 | Contrato 21 | `import_financial_release_gate_unchanged_by_informational_review` | PASS | `supabase/tests/artifact_import_candidates.sql:237` | 1348 |
| 19 | Contrato 21 | `import_legacy_financial_release_remains_blocked` | PASS | `supabase/tests/artifact_import_candidates.sql:237` | 1349 |
| 20 | Contrato 21 | `native_import_technical_upload_preserves_model_source_context` | PASS | `supabase/tests/artifact_import_candidates.sql:341` | 1492 |
| 21 | Contrato 21 | `native_import_genuine_financial_source_mutation_still_denied` | PASS | `supabase/tests/artifact_import_candidates.sql:341` | 1493 |
| 22 | Contrato 21 | `native_import_revoked_office_source_blocks_adoption` | PASS | `supabase/tests/artifact_import_candidates.sql:341` | 1494 |
| 23 | Contrato 21 | `native_import_capture_v2_review_and_real_deterministic_request` | PASS | `supabase/tests/artifact_import_candidates.sql:341` | 1497 |
| 24 | Contrato 21 | `native_import_office_revocation_reaches_recalculation_capture_and_derived_revision` | PASS | `supabase/tests/artifact_import_candidates.sql:341` | 1498 |
| 25 | Contrato 21 | `native_import_pending_group_preserves_unadopted_configuration` | PASS | `supabase/tests/support/artifact_roundtrip_pending_groups_eval.sql:114` | 1644 |
| 26 | Contrato 21 | `native_import_pending_group_old_head_and_implicit_rebase_denied` | PASS | `supabase/tests/support/artifact_roundtrip_pending_groups_eval.sql:114` | 1645 |
| 27 | Contrato 21 | `native_import_explicit_rebase_entire_source_and_two_lineages` | PASS | `supabase/tests/support/artifact_roundtrip_pending_groups_eval.sql:114` | 1646 |
| 28 | Regressão 20 existente | `material cannot reaffirm (artifact_review_material_change)` | PASS | `supabase/tests/support/work_review_dashboard.sql:113` | 4768 |
| 29 | Regressão 20 existente | `foreign revision cursor denied (review_cursor_access_required)` | PASS | `supabase/tests/support/work_review_dashboard.sql:113` | 4769 |
| 30 | Regressão 20 existente | `foreign decision cursor denied (review_cursor_access_required)` | PASS | `supabase/tests/support/work_review_dashboard.sql:113` | 4770 |
| 31 | Regressão 20 existente | `membership does not enumerate work (review_work_access_required)` | PASS | `supabase/tests/support/work_review_dashboard.sql:113` | 4771 |

## Corridas em duas sessões reais

Executor: `scripts/ci/test-artifact-roundtrip-concurrency.py`, banco descartável da CI. As duas primeiras corridas observaram o concorrente esperando um lock; a terceira manteve aberta a transação leitora enquanto outra sessão confirmou a revogação da fonte. Não são simulações sequenciais de concorrência.

| Nome exato no log | Resultado | Linha do log |
|---|---|---|
| `competing_adoptions_observed_lock_one_revision_second_CAS_denied_contribution_preserved` | PASS | 1649 |
| `recompare_before_adoption_observed_lock_invalidates_snapshot_without_head_write` | PASS | 1650 |
| `source_revoked_between_receipt_reads_same_open_transaction_revalidation_denied_project_readable` | PASS | 1651 |

## Gate completo ainda pendente naquele run

`test_every_file_version_exists_in_production_journal` foi a única falha dos 19 testes do checker do inventário, registrada nas linhas 1702–1721. Os dois erros foram:

- `migration_absent_from_production_journal:20261005101952_artifact_export_receipts.sql`
- `migration_absent_from_production_journal:20261005102636_artifact_import_candidates.sql`

As capturas de catálogo, definições efetivas e evidência do replay foram publicadas pelo job em `stage21-replay-evidence`. A aprovação deste eval de runtime permite avaliar a aplicação; não substitui o journal e o catálogo vivos de cada ambiente. A sequência permanece: exportação em staging e produção, conciliação dos dois catálogos, depois importação em staging e produção e nova conciliação. Os checkers e a CI completos precisam passar após o registro verdadeiro dessas aplicações.

Este eval não prova quarentena de bytes reais de Office ou interface no navegador; isso pertence ao eval independente do worker e à jornada E2E. A coleta foi somente leitura; este documento não reaplica SQL nem modifica journal.
