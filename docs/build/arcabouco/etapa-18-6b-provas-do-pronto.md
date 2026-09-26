# Etapa 18, incremento 6B: as três provas que faltavam no pronto da etapa

O pronto da etapa 18 (`docs/build/arcabouco/etapa-18-execucao.md`, seção "Pronto da etapa") tem catorze critérios. O mapa de evidências de 26/09/2026 encontrou onze com prova direta que roda no CI e três sem: espera humana que resiste a deploy, retomada que não repete custo confirmado, e grafo incompleto que deixa a saída inteira desatualizada sem reaproveitamento antes da reconstrução. Este incremento acrescenta as três provas. Só testes: nenhuma migração, nenhuma mudança de produto. Os casos SQL rodam dentro da transação de cada arquivo e terminam em rollback; o script de verificação grava só no banco descartável do CI, como antes, e diz isso no cabeçalho.

## As três provas

### Espera humana resiste a reinício do robô

`scripts/ci/verify-dependency-recompute.mjs`, seção 7, no job Database, com o módulo de recomputação e o cliente RPC do próprio robô contra a pilha local. Depois da prova do 3B (candidata de orçamento zero produzida pelo laço), o script:

1. registra uma release mais nova do mesmo procedimento e da mesma versão, com capacidade liberada e universal e perfil de teto acima de zero (250000 microdólares e 3 chamadas), e fecha a capacidade da release fixada, para que o perfil novo seja o único executável; o gatilho de armazenamento que mantém todo perfil em zero fica desligado só dentro dessa transação, no banco descartável; o perfil nomeia o manifesto publicado, o único que a verificação de proveniência do capital aceita, e a linha da release leva um hash próprio, porque uma release é única por procedimento, versão e hash;
2. aplica os eventos de dependência como o consumidor da outbox aplica: a linhagem da raiz ganha uma candidata `await_authorization` com o marco `awaiting_human`, sem job e sem lease, e a candidata anterior, chaveada na release antiga, fica `declined:superseded`;
3. roda o laço do robô até ficar ocioso;
4. cria um cliente novo, com outra conta de robô e outro token (novo dono de lease), e roda o laço dele até ficar ocioso;
5. compara a candidata e o marco de espera com o retrato tirado antes do reinício: idênticos, sem lease, sem execução, sem resolução;
6. autoriza como o dono, por `authorize_work_update_v1`, na revisão vista;
7. roda o laço reiniciado: exatamente uma produção, para o solicitante original, com linhagem para a raiz, a release nova fixada, o job na fila, o lease com uma tentativa do token novo, uma espera, uma resolução e uma decisão aprovada.

O reinício é um cliente novo com outro dono de lease no mesmo processo Node. O que a prova mostra é que a espera vive só no banco: nenhum estado do robô anterior é necessário para retomá-la.

### Retomar não repete custo confirmado

`supabase/tests/work_continuation_commands.sql`, seção 8b, depois da seção 8 (perfil de teto acima de zero, três candidatas esperando uma pessoa):

1. o dono autoriza a candidata de X1 por `authorize_work_update_v1`;
2. o robô reivindica e para antes de submeter; o lease expira; o robô reiniciado reivindica de novo (tentativa 2, lease novo);
3. o lease velho não monta a base nem submete (`recompute_lease_denied`);
4. a submissão com o lease novo produz uma execução, com linhagem para X1 e a release com custo fixada;
5. nenhuma espera nova: a espera tem uma resolução, a autorização é uma decisão, o teto está numa candidata só; a mesma submissão e a mesma autorização se repetem como repetição; uma autorização nova é recusada (`work_update_candidate_not_waiting`); nada fica para reivindicar;
6. a execução produzida tem uma conta de orçamento, com orçamento zero no contrato; a reserva do teto autorizado é recusada (`execution_operation_denied`); a reserva de custo zero da única operação é registrada uma vez e a repetição não soma; o job perde o lease, é reivindicado de novo, o recibo fica `uncertain` (nunca liberado) e a repetição sob o lease novo também não soma; o lease velho do job é recusado (`execution_lease_denied`).

### Grafo incompleto

`supabase/tests/work_continuity_dependencies.sql`, seção 31, a partir do savepoint `stage18_3b_ready`:

1. um procedimento B, com uma release de plataforma registrada como publicada pelo operador, é fixado por uma única execução X4, que também fixa a fonte T1;
2. o operador aposenta a release pelo comando `private.retire_platform_method_v1`: ela deixa de estar publicada e a capacidade fecha; a cabeça do procedimento que X4 fixou fica desconhecida;
3. a capacidade da versão seguinte de B é liberada antes de a release existir, e o evento `method_release` que ela emite é julgado sem release publicada de B;
4. o fato gravado é `graph_incomplete` com a lacuna `head_unknown`, a fixação de X4 e cabeça nula, só para X4;
5. o planejador retém X4 com `graph_incomplete`, sinal `method_release:synthetic-execution-b` e a lacuna como assunto; não há candidata; a avaliação de X4 é `graph_incomplete`, sem identidade atual, sem chave, embora T1 continue na cabeça; o pedido fica aberto, nem coberto nem substituído;
6. a release seguinte de B, com perfil executável, restaura a cabeça: o evento dela libera a retenção e o próximo planejamento produz uma candidata, agendada, sob a release nova.

## Limites e achados

- **Nenhuma reserva com custo é aceita hoje.** O incremento fechado da etapa 17 recusa, em `private.reserve_execution_operation_v1`, qualquer reserva com custo ou chamadas acima de zero (`execution_operation_denied`), e a recusa vem antes da leitura do recibo, então nem a repetição de uma reserva com custo existe. O contrato de execução também exige orçamento zero (`execution_contract_denied`), e a composição do robô sempre grava zero. O teto que a pessoa autoriza fica na candidata e não chega à conta de orçamento da execução. A variante pedida no roteiro do incremento (acrescentar uma reserva com custo e provar que a repetição não soma) exige mudança de produto e ficou de fora. A prova registra o que o produto garante hoje: a recusa da reserva com custo, a reserva de custo zero contada uma vez e o teto e a autorização usados uma vez. Não é defeito: é o fechamento deliberado da etapa 17.
- **A proveniência do capital aceita um único manifesto.** `private.execution_capital_payload_current_v1` (etapa 17) só aceita o manifesto publicado `2c023cf7b7ec7e35b7f59d363a9b287cb245d3196cd431fc0c2bf1fc937f8478` na versão `2026.09.21-v4`. A primeira rodada desta prova, com um perfil que nomeava outro hash, teve a candidata autorizada recusada na submissão com `execution_payload_provenance_denied` e registrada como falha, sem execução. Qualquer pedido de execução do capital, humano ou de recomputação, com outro manifesto é recusado da mesma forma: publicar a próxima versão do capital exige atualizar essa guarda na mesma migração, senão as candidatas de troca de método do capital falham com esse código. Não é defeito deste incremento; fica registrado para a publicação da próxima versão.
- **O caminho de custo só existe com perfil sintético.** Todo perfil gravado fica em zero pelo gatilho de armazenamento; os testes do 3B, do 4 e deste incremento desligam o gatilho para criar um perfil com teto. Em produção nenhuma candidata espera autorização de custo enquanto isso não mudar.
- **Onde uma cabeça pode ficar desconhecida.** Versões de fonte e revisões de premissa são imutáveis, então a cabeça de uma fonte ou de um slot fixado nunca some; a ausência de arestas também não ocorre, porque todo pedido tem manifesto e a projeção é reconstruída a partir dele. A única lacuna alcançável é a do procedimento: release de plataforma aposentada sem outra publicada. A capacidade fechada sozinha não basta, porque a cabeça continua conhecida e a retenção é `method_not_executable` (seção 26).
- **A aposentadoria não emite evento.** Decisão do 3A: a aposentadoria é matéria de revogação da etapa 17. O fato `graph_incomplete` só é gravado quando outro evento do procedimento chega. O planejamento continua correto nesse intervalo, porque qualquer planejamento que avalie a linhagem encontra a lacuna e a retém. Fica registrado como observação, não como defeito.
- **Uma candidata.** A prova usa um procedimento fixado por uma única execução para que a restauração da cabeça produza exatamente uma candidata; com o procedimento da fixture, fixado por três execuções, cada linhagem retida teria a sua.

## Os catorze critérios

WCD é `supabase/tests/work_continuity_dependencies.sql`, WCC é `supabase/tests/work_continuation_commands.sql`, VR é `scripts/ci/verify-dependency-recompute.mjs` e CT é `packages/work-plan/src/continuation.test.ts`. O job Database é "Database (migrations, RLS, lint)"; o job check é "Lint, typecheck, test, build" (`pnpm check`, que roda os testes de domínio). Direta quer dizer que o teste executa o próprio critério no CI; indireta, que o critério decorre de provas vizinhas.

| # | Critério | Prova (arquivo:linha) | Job do CI | Tipo |
|---|---|---|---|---|
| 1 | Reinício do robô | WCD:354 (outbox: reivindica, lease expira, reivindica de novo, completa; lease velho recusado); WCD:895 (candidata: lease expira, a segunda reivindicação produz uma execução); VR:229 (laço reiniciado com outro dono de lease); CT:516 | Database; check | direta |
| 2 | Entrega duplicada | WCD:229 (o mesmo evento aplicado duas vezes); WCD:858 (reentrega pela outbox não planeja nada novo); CT:417 | Database; check | direta |
| 3 | Evento fora de ordem | WCD:270 (versão 5 antes da 4; nada regride); CT:446 | Database; check | direta |
| 4 | Alterações concorrentes | `scripts/ci/test-dependency-update-concurrency.py`:104 (duas sessões, um pedido aberto); `scripts/ci/test-dependency-recompute-concurrency.py`:127 (dois robôs, um lease); WCD:166 (duas mudanças antes do consumidor); CT:476 | Database; check | direta |
| 5 | Balancete novo | WCD:803 (nova versão de S: candidata só para a linhagem afetada); CT:169 | Database; check | direta |
| 6 | Mudança de uma premissa | VR:153 (nova revisão da base muda uma decisão e o laço do robô produz a candidata, linha 227); WCD:166 (revisão com o slot B alterado); CT:220 | Database; check | direta |
| 7 | Troca de método | WCD:323 (release mais nova: só as execuções na release antiga, `method_update`); WCD:1169 (cabeça sem perfil executável retida até a capacidade liberar); CT:256 | Database; check | direta |
| 8 | Só descendentes afetados ficam desatualizados | WCD:803 (X3 reaproveitada, X2 retida até a fonte derivada ser refeita); WCD:323; CT:170 | Database; check | direta |
| 9 | Decisão antiga permanece imutável | WCD:641 (marcos e recibos idênticos byte a byte); WCC:166 (`history_intact`, conferido por todos os comandos); CT:357 | Database; check | direta |
| 10 | Retomar não repete efeito | WCD:833 (produzida uma vez; a mesma submissão só nomeia a execução); WCD:895; WCC:617 (submissão e autorização repetidas); CT:530 | Database; check | direta |
| 11 | Retomar não repete custo confirmado | WCC:617 (autorizada, interrompida, reivindicada de novo e produzida uma vez; teto e autorização usados uma vez) e WCC:699 (reserva do teto recusada; reserva de custo zero uma vez, também após nova reivindicação do job); CT:542 | Database; check | direta para custo zero; a reserva acima de zero é recusada pelo produto (ver limites) |
| 12 | Espera humana resiste a deploy | VR:229 (espera `awaiting_human` sem job e sem lease atravessa o laço e um robô reiniciado; autorização; uma produção com linhagem); WCD:1261 (espera persistida, nada a reivindicar); CT:385 | Database; check | direta |
| 13 | Evento perdido pelo consumidor é recuperado pela outbox | WCD:519 (efeito falha, a entrega perdida é aplicada quando o lease expira, linha 571; bloqueio após cinco tentativas e recuperação do operador, linha 607; efeito cortado pelo tempo limite, linha 638) | Database | direta |
| 14 | Grafo incompleto deixa a saída inteira desatualizada e reconstrói antes de reaproveitar | WCD:1406 (fato `graph_incomplete` com a lacuna, retenção com o sinal, nada planejado nem reaproveitado; a cabeça restaurada libera a retenção e produz uma candidata); WCD:244 (projeção reconstruída antes do julgamento); CT:312 | Database; check | direta |

## Como verificar

O job Database do workflow Quality roda todos os arquivos de `supabase/tests/*.sql` e depois `scripts/ci/verify-dependency-recompute.mjs`. As linhas PASS novas são:

- `PASS: graph incomplete: a retired release leaves the pinned head unknown; ...` e `PASS: graph incomplete: the next release restores the head; ...` (WCD, seção 31);
- `PASS: an authorized costed candidate interrupted after its claim is claimed again by the restarted worker and produced once, ...` e `PASS: the produced execution has one budget account at zero: ...` (WCC, seção 8b);
- `dependency_recompute_wait_across_restart: PASS (...)` (VR, seção 7).
