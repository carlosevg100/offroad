# Etapa 17 / 6: fechamento

Incremento 6 do contrato de execução da etapa 17 (`etapa-17-execucao.md`, item 6): regressão do primeiro procedimento e de R01, cálculo reprodutível sob versões fixadas, revogação impedindo commit e liberação, ferramentas não declaradas negadas, orçamento esgotado sem sucesso artificial, CI sem flaky, journals e catálogos conciliados, web e worker no commit final e evidência de produção sem fixtures. Este documento registra cada item quando ele fecha; o que ainda está aberto fica na lista do fim.

## Retirada da liquidação só por hash

`worker_settle_execution_v1` (público e privado) e `settle_execution_operation_v1` aceitavam só o hash do resultado: a operação do kernel podia fechar sem o banco ter os bytes. A correção 3N criou `worker_settle_execution_v2`, que grava bytes, desfecho e motivo, e o worker publicado só chama essa versão (`apps/document-worker/src/execution-queue.ts`). O commit já recusava publicar como sucesso, sob outro lease, um recibo só com hash; a migração `20260924002148_retire_hash_only_settlement.sql` tira o caminho do banco.

Evidência antes do ato: nenhuma execução, nenhum recibo de operação e nenhum recibo de resultado em produção; nenhuma chamada a comando de liquidação nos logs da API das últimas 24 horas, enquanto o worker seguia buscando trabalho a cada poucos segundos. Nada além de testes chamava as três funções, e o contrato de runtime do worker lista capacidades, não nomes de função; o worker exige que as capacidades dele existam no banco, então nenhuma imagem implantada deixa de subir.

Testes convertidos para a liquidação com bytes: `execution_commands.sql` (liquidação, replay e conflito; lista de comandos fechados; prova de que as três funções não existem mais), `execution_consumer.sql` (bytes do commit precisam ser os liquidados; grants dos wrappers do consumidor), `execution_lifecycle.sql` (lease vencido não liquida) e `scripts/ci/test-execution-concurrency.py`. Em `execution_settled_bytes.sql`, o caso do recibo antigo só com hash continua provado: o recibo é escrito como o comando retirado o deixava (liquidado, só o hash, sem bytes nem desfecho), e o leitor de bytes liquidados responde indisponível, o commit de sucesso sob o lease seguinte é recusado e o fechamento parcial passa. As quatro provas passaram em staging com a migração aplicada.

Estampas: staging `20260924001737`, produção `20260924002148`, aplicadas pelo executor via MCP antes do merge. Advisors de segurança zero nos dois projetos. Inventário: as três funções passam a `apagar`, com catálogo vazio e a linha do `drop` como fonte; catálogos recapturados depois das estampas (produção 2244 objetos, staging 2305, os dois sem as três funções e sem nenhum outro objeto novo ou removido). Tipos públicos regenerados de produção: a única diferença é a saída de `worker_settle_execution_v1`.

## CI sem flaky: corrida no harness de integridade R01

A Quality de main falhou uma vez (run 35935088682, commit e0b84fc9) em `scripts/ci/test-r01-integrity-concurrency.py`, que afirmava, de uma sessão nova, que nenhum gatilho sintético sobrevivia à sessão de preparo. Esses gatilhos chamam funções `pg_temp` e somem quando o backend da sessão de preparo apaga o namespace temporário, o que acontece na saída do backend, depois de o psql já ter retornado. O harness agora espera até quinze segundos pelo sumiço e continua falhando se um gatilho sobreviver (#751).

## Cálculo reprodutível e verificadores de implantação

`apps/document-worker/src/released-capital-reproducibility.test.ts` executa o método v4 instalado duas vezes, em threads separadas, sobre o mesmo pacote vinculado, e exige bytes e fingerprint iguais, iguais também à fórmula que o SQL grava. `scripts/ci/verify-worker-boot-flag.py` passou a exigir a linha `worker.pinned_executors_verified` da mesma task que registrou `worker.boot` e registra o digest da imagem; `scripts/ci/verify-web-deployment.py` confere, só por leitura, que o deploy de produção da web está `READY` no commit esperado (#748).

## Em aberto

- Regressão final de v4 e R01 no commit final, com as suítes reexecutadas.
- Dez execuções seguidas da Quality em main sem falha e sem rerun, com os ids.
- Web e worker no commit final: deploy do worker pelo workflow e deploy de produção da web com o sha do último merge.
- Evidência de produção sem fixtures: contagens por kind e estado, zero linhas sintéticas nas tabelas de tenant.
- Incrementos 4C, 4D e 5 ainda em curso; cada um fecha com a própria PR.
