# Recuperação e ciclo de vida

A etapa 22 ensaiou **restauração lógica de escopo próprio no staging existente**:
backup exportado fora do banco, alteração e revogação confirmadas por COMMIT,
restauração real do backup e reaplicação da autoridade posterior antes do COMMIT
de recuperação. O dado sintético voltou à versão do backup; o acesso continuou
negado. A prova não é rollback e não afirma restauração física gerenciada do cluster.

O teste reproduzível está em `scripts/ci/test-lifecycle-logical-restore.py`; a CI
o executa antes das corridas hold/lease e do descarte físico pelo SDK. O teste usa
somente loopback; o ensaio remoto usou exclusivamente os canários da engenharia.

## Regra de recuperação

1. Isolar o escopo afetado e interromper seus consumidores durante a recuperação.
   Uma restauração completa exige indisponibilidade das APIs diretas, Storage e
   workers até a reconciliação; desligar apenas a web não isola o banco.
2. Guardar o backup e um piso de autoridade **posterior**, fora do banco a restaurar.
   Conferir hashes, origem, revisão e integridade dos lotes de auditoria imutáveis.
   O backup não pode ser a fonte do próprio piso de revogação.
3. Restaurar o conteúdo sob bloqueio exclusivo da política do escopo. Reaplicar
   vínculos, grants, barreiras, capacidade, retenção, holds e recibos de descarte
   posteriores antes de permitir qualquer leitura ou execução.
4. Não reativar leases, capabilities ou sessões restauradas. Trabalhadores obtêm
   autorização atual por nova lease. Descarte comprovado não recebe payload novo:
   os guards de histórico recusam ressuscitar revisions/blocks já eliminados.
5. Conferir negação com a identidade revogada, ausência dos bytes descartados,
   revisão vigente, jobs, busca e herança das restrições. Só então liberar o escopo.

Se faltar piso íntegro e atualizado para qualquer autoridade, o escopo permanece
fechado e recebe novas autorizações humanas explícitas. Um backup antigo nunca
serve como autorização presumida. Restaurar objetos de Storage também exige esse
controle; o backup de PostgreSQL não prova recuperação dos bytes de Storage.

## Retenção e observabilidade

Não existe TTL padrão de documento de cliente. `set_retention_rule_v1` exige recurso,
modo, revisão e referência contratual opaca. Hold impede destruição e não concede
acesso. Dados compartilhados com vínculo ainda vigente são preservados para esse
vínculo. A revogação de uma pessoa não é uma ordem de eliminar evidência de outra.

Os destinos de revogação têm recibos próprios: outbox de autoridade, busca, cache,
jobs, artefatos e Storage. Autorização atual é condição síncrona; a limpeza não é.
O consumidor de retenção usa lease de 60 segundos, até cinco tentativas e comprova
ausência física pelo Storage API antes do ACK. A auditoria usa lease de 120 segundos,
até cinco tentativas, hash do lote e versão imutável conferida no armazenamento.
Os alarmes sinalizam heartbeat ausente, backlog acima de 300 segundos, erro e
dead letter. Um ACK de outro destino não conclui o trabalho.

O bucket de auditoria mantém metadados operacionais com Object Lock COMPLIANCE de
365 dias; esse prazo não define retenção de documentos de clientes. As declarações
de infraestrutura estão em `apps/document-worker/monitoring/audit-storage/`.
