# Etapa 20: recuperação do artefato de um resultado persistido

28/09/2026. Incremento backend da preparação do corte integrado já aprovada. Concluído em produção pela PR 837, merge `56ce9dd5b229126600a24a5ed991699a8840c5a3` em 28/09 às 14:33:49 UTC.

## Comportamento

Uma falha ao registrar o artefato não apaga o resultado calculado. `read_work_execution_v2` passa a distinguir `not_committed`, `missing`, `unsupported`, `restricted` e `available` em `artifactProjection`, depois da autorização normal da execução. `available` confirma identidade e direito às fontes; não significa aprovação ou liberação externa. Falha de consulta não é convertida em ausência.

`recover_execution_result_artifact_v1(executionId, expectedResultFingerprint)` resolve organização, trabalho, recibo, job e dependências no banco. Conta atual, principal humano ativo, acesso de trabalho e fontes atuais autorizam a recuperação. A ordem é conta, projeto, política compartilhada e artefato. Não usa lease, token ou autoridade do solicitante original. Outra pessoa atualmente autorizada pode recuperar após sua saída. Direitos temporais são conferidos novamente depois da espera por locks.

O construtor privado `project_execution_result_artifact_v1` é compartilhado pelo wrapper do commit e pelo comando de recuperação. Lê exclusivamente o resultado imutável e os insumos fixados; preserva proveniência original, origem worker e identidade determinística. Replay passa pelo comparador de blocos e dependências do núcleo. Auditoria registra o recuperador com IDs; nenhum conteúdo financeiro, nota livre ou erro bruto. Repetição não duplica o evento de recuperação bem-sucedida.

Não cria tabela, backfill, cálculo, chamada de modelo, job, operação ou reserva. O wrapper do commit preserva sua ordem de locks e o comportamento de manter o resultado quando o artefato falha. Grants do construtor negados a todas as roles de API; wrapper público invoker, núcleo privado definer com autorização explícita.

## Eval

`execution_artifact_recovery.sql`: falha injetada na gravação do artefato depois do recibo; estado missing; fingerprint divergente negado; recuperação e replay; proveniência/auditoria; negação de membership sem work; solicitante original revogado com recuperador elegível; fonte revogada negada inclusive no replay; esquema desconhecido unsupported; contagens de jobs/operações/resultados/gasto inalteradas pela recuperação; grants mínimos. Staging com rollback passou, incluindo a negativa de membership.

`artifact_producers.sql`: regressão aprovada em staging com rollback. Seu setup foi extraído literalmente para `support/execution_artifact_setup.sql`, consumido pelos dois contratos.

`test-execution-artifact-recovery-concurrency.py`: duas sessões reais com espera observada para repetições, suspensão nas duas ordens, revogação de principal nas duas ordens, revogação de fonte nas duas ordens e construtor privado usado pelo commit versus recuperação (não a transação inteira do commit). Só permite banco local descartável; registrado na CI. Os oito resultados do harness passaram na CI `36432009907`, incluindo as duas ordens de revogação e suspensão. A fixture da ordem inversa concede acesso de novo pelo comando administrativo, depois de provar que reativar identidade não restaura grants revogados. A revisão independente não identificou bloqueador estático; sua exigência de afirmar `recorded=true` e `replayed=true` no replay concorrente foi incorporada.

## Publicação e limite

Migração `execution_artifact_recovery`: staging `20260928140015`, produção `20260928140508`; arquivo alinhado ao carimbo de produção. SHA-256 dos dois journals e do arquivo: `b60da35b048f3cf1fa31d13afeaf9b623614c37c383e4ed45634a336517f0557`. As seis funções criadas/alteradas e o wrapper público preservado têm definições idênticas. Catálogos: 2.730 objetos em produção e 2.791 em staging; checkers sem diferenças, 18 testes aprovados. Tipos regenerados de produção. Advisors de segurança: zero nos dois ambientes; avisos de desempenho preexistentes, sem tabela ou índice novo. Os três SQLs (`execution_artifact_recovery`, `artifact_producers`, `execution_gates`) passaram novamente em staging instalado, com rollback. A CI intermediária falhou antes da conciliação; a CI final da PR `36434353643` e a de main `36436921407` passaram nos três jobs, com 44 E2E aprovados e 16 pulados. Security da PR `36434353580` e de main `36436921321` aprovadas. `pnpm check` local aprovado.

Controles APP-02/04/09/11, DATA-03/12, OPS-09, SDLC-08/10. Produção antes da mudança, somente leitura às 13:37 UTC: zero resultados/recibos de operação, 133 revisões, 174 jobs, gasto de execução zero. Conferência somente leitura às 14:07 UTC após a aplicação: os mesmos totais, zero eventos de recuperação. Nenhum cliente real é ativado por esta mudança. A função de liberação manteve MD5 `c4b6a8c3730c2de36392023c571b73b2`.

Interface de revisão/recuperação entra no incremento integrado da etapa 20. Conversão dos legados, recibos dos demais produtores e troca da liberação permanecem no escopo da mesma etapa. Não alterar a ordem das ondas nem iniciar 21. Contenção: revogar EXECUTE do comando novo por migração; manter o resultado imutável. Não desfazer a migração com exclusão de dados.

## Fechamento verificado

Web deployment `6712575056` no commit do merge; páginas PT/EN 200, aplicação e rota protegida de execução 307 para login. Worker deploy `36436947627`, task definition 488, tarefa `e84754a84af44ca0893b822e60534635`, imagem `56ce9dd5b229`, digest `sha256:e561828a338d5b567e6854399beb5bd43769a8b0df67a94aa7d40bc66b869f38`. Serviço RUNNING, desired/running 1, pending 0, rollout COMPLETED. Conferência pela sessão CloudShell, sem alteração de IAM: boot 14:39:50.735 UTC, política de dados e planejamento ativos; schema 14:39:51.080, 24 capacidades; executores 14:39:51.489, dois artefatos; preparadores 14:39:51.985, um artefato. O papel de CI não lê o boot; a prova veio do stream da própria tarefa.

Consulta pós-publicação somente leitura: 133 revisões, 174 jobs, zero recibos de resultado/operação, gasto de execução zero e zero eventos de recuperação. Nenhuma fixture em produção. Este fechamento cobre o incremento 3A, não o corte integrado ou a etapa 20 inteira. Não exige ato adicional do fundador para os incrementos restantes desta onda.
