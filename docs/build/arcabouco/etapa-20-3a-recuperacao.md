# Etapa 20: recuperação do artefato de um resultado persistido

28/09/2026. Incremento backend da preparação do corte integrado já aprovada. Ainda não publicado.

## Comportamento

Uma falha ao registrar o artefato não apaga o resultado calculado. `read_work_execution_v2` passa a distinguir `not_committed`, `missing`, `unsupported`, `restricted` e `available` em `artifactProjection`, depois da autorização normal da execução. `available` confirma identidade e direito às fontes; não significa aprovação ou liberação externa. Falha de consulta não é convertida em ausência.

`recover_execution_result_artifact_v1(executionId, expectedResultFingerprint)` resolve organização, trabalho, recibo, job e dependências no banco. Conta atual, principal humano ativo, acesso de trabalho e fontes atuais autorizam a recuperação. A ordem é conta, projeto, política compartilhada e artefato. Não usa lease, token ou autoridade do solicitante original. Outra pessoa atualmente autorizada pode recuperar após sua saída. Direitos temporais são conferidos novamente depois da espera por locks.

O construtor privado `project_execution_result_artifact_v1` é compartilhado pelo wrapper do commit e pelo comando de recuperação. Lê exclusivamente o resultado imutável e os insumos fixados; preserva proveniência original, origem worker e identidade determinística. Replay passa pelo comparador de blocos e dependências do núcleo. Auditoria registra o recuperador com IDs; nenhum conteúdo financeiro, nota livre ou erro bruto. Repetição não duplica o evento de recuperação bem-sucedida.

Não cria tabela, backfill, cálculo, chamada de modelo, job, operação ou reserva. O wrapper do commit preserva sua ordem de locks e o comportamento de manter o resultado quando o artefato falha. Grants do construtor negados a todas as roles de API; wrapper público invoker, núcleo privado definer com autorização explícita.

## Eval

`execution_artifact_recovery.sql`: falha injetada na gravação do artefato depois do recibo; estado missing; fingerprint divergente negado; recuperação e replay; proveniência/auditoria; negação de membership sem work; solicitante original revogado com recuperador elegível; fonte revogada negada inclusive no replay; esquema desconhecido unsupported; contagens de jobs/operações/resultados/gasto inalteradas pela recuperação; grants mínimos. Staging com rollback passou, incluindo a negativa de membership.

`artifact_producers.sql`: regressão aprovada em staging com rollback. Seu setup foi extraído literalmente para `support/execution_artifact_setup.sql`, consumido pelos dois contratos.

`test-execution-artifact-recovery-concurrency.py`: duas sessões reais com espera observada para repetições, suspensão nas duas ordens, revogação de principal nas duas ordens, revogação de fonte nas duas ordens e construtor privado usado pelo commit versus recuperação (não a transação inteira do commit). Só permite banco local descartável; registrado na CI. Ainda não executado. A revisão independente não identificou bloqueador estático; sua exigência de afirmar `recorded=true` e `replayed=true` no replay concorrente foi incorporada.

## Publicação e limite

Migração candidata `execution_artifact_recovery`; carimbos permanentes, catálogos, tipos, advisors e deployments serão registrados depois da aplicação real. Não declarar conclusão antes da CI e publicação completas.

Controles APP-02/04/09/11, DATA-03/12, OPS-09, SDLC-08/10. Produção antes da mudança, somente leitura às 13:37 UTC: zero resultados/recibos de operação, 133 revisões, 174 jobs, gasto de execução zero. Nenhum cliente real é ativado por esta mudança.

Interface de revisão/recuperação entra no incremento integrado da etapa 20. Conversão dos legados, recibos dos demais produtores e troca da liberação permanecem no escopo da mesma etapa. Não alterar a ordem das ondas nem iniciar 21. Contenção: revogar EXECUTE do comando novo por migração; manter o resultado imutável. Não desfazer a migração com exclusão de dados.
