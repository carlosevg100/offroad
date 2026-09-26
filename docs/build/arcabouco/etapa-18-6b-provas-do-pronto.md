# Etapa 18, incremento 6B: as três provas que faltavam no pronto da etapa

O pronto da etapa 18 (`docs/build/arcabouco/etapa-18-execucao.md`, seção "Pronto da etapa") tem catorze critérios. O mapa de evidências de 26/09/2026 encontrou onze com prova direta que roda no CI e três sem: espera humana que resiste a deploy, retomada que não repete custo confirmado, e grafo incompleto que deixa a saída inteira desatualizada sem reaproveitamento antes da reconstrução. Este incremento acrescenta as três provas. Só testes: nenhuma migração, nenhuma mudança de produto. Os casos SQL rodam dentro da transação de cada arquivo e terminam em rollback; o script de verificação grava só no banco descartável do CI, como antes, e diz isso no cabeçalho.

## As três provas

### Espera humana resiste a reinício do robô

`scripts/ci/verify-dependency-wait-restart.mjs`, script novo, com o módulo de recomputação e o cliente RPC do próprio robô contra a pilha local. Roda no job Database em dois passos novos, os últimos antes de "Stop local Supabase": "Rebuild the local database for the wait proof" refaz o banco local a partir das migrações (`supabase db reset --local`, com o mesmo espelho de imagens da subida, para nada ser baixado) e "Dependency wait across a worker restart, against the rebuilt local stack" roda a prova. Os dois têm a mesma condição do lint do esquema (`!cancelled() && steps.db.outcome == 'success'`), e o segundo exige também o sucesso do primeiro. O script grava só nesse banco descartável do CI e recusa começar se o banco já tiver uma release de capital ou uma candidata de recomputação.

1. o perfil que a prova registra para o método de capital publicado tem teto acima de zero (250000 microdólares e 3 chamadas); o gatilho de armazenamento que mantém todo perfil em zero fica desligado só para essa linha;
2. o dono pede a execução raiz pelo caminho da web; uma nova revisão da base de trabalho muda uma decisão, e o efeito de dependência planeja a candidata da linhagem como espera: `await_authorization` com o marco `awaiting_human`, sem job e sem lease;
3. a saúde da recomputação que o robô lê (6A) conta a espera como aguardando uma pessoa; o laço do robô roda até ficar ocioso;
4. um cliente novo, com outra conta de robô e outro token (novo dono de lease), roda o laço até ficar ocioso;
5. a candidata e o marco de espera são idênticos ao retrato tirado antes do reinício: sem lease, sem execução, sem resolução;
6. o dono autoriza por `authorize_work_update_v1`, na revisão vista, e a primeira leitura de saúde do robô reiniciado conta a candidata agendada;
7. o laço reiniciado produz exatamente uma execução, para o solicitante original, com a revisão da cabeça fixada, o recibo de gates com as situações da raiz, o job na fila, a linhagem para a raiz, o lease com uma tentativa do token novo, uma espera, uma resolução e uma decisão aprovada.

O reinício é um cliente novo com outro dono de lease no mesmo processo Node. O que a prova mostra é que a espera vive só no banco: nenhum estado do robô anterior é necessário para retomá-la.

A prova tem banco próprio porque o método de capital admite um único perfil executável e uma única release que pode ser pedida (ver limites): o perfil com custo não pode conviver com o perfil de custo zero de `scripts/ci/verify-dependency-recompute.mjs`, a prova do 3B, que continua exatamente como está em main (laço real, candidata de orçamento zero produzida sem pessoa, uma execução, linhagem, pedido agendado, e a leitura de saúde do 6A) e roda antes, no banco da subida.

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

Nenhum destes limites muda produto nesta PR.

- **O caminho de custo só existe com perfil sintético.** O incremento fechado da etapa 17 recusa, em `private.reserve_execution_operation_v1`, qualquer reserva com custo ou chamadas acima de zero (`execution_operation_denied`), e a recusa vem antes da leitura do recibo, então nem a repetição de uma reserva com custo existe; o contrato de execução exige orçamento zero (`execution_contract_denied`) e a composição do robô sempre grava zero; e todo perfil gravado fica em zero pelo gatilho de armazenamento. Hoje nenhuma candidata de produção pode esperar autorização de custo: o caminho só existe com um perfil sintético, gravado com o gatilho desligado, como fazem os testes do 3B, do 4 e deste incremento. O teto que a pessoa autoriza fica na candidata e não chega à conta de orçamento da execução. A variante pedida no roteiro do incremento (acrescentar uma reserva com custo e provar que a repetição não soma) exigiria mudança de produto; a prova registra o que o produto garante hoje: a recusa da reserva com custo, a reserva de custo zero contada uma vez e o teto e a autorização usados uma vez.
- **A aposentadoria de uma release não emite evento.** Decisão do 3A: a aposentadoria é matéria de revogação da etapa 17. O fato `graph_incomplete` aparece com o evento seguinte do procedimento; o planejamento continua correto nesse intervalo, porque qualquer planejamento que avalie a linhagem encontra a lacuna e a retém.
- **Publicar a próxima versão do capital exige atualizar a guarda de proveniência na mesma migração.** `private.execution_capital_payload_current_v1` (etapa 17) só aceita o manifesto publicado `2c023cf7b7ec7e35b7f59d363a9b287cb245d3196cd431fc0c2bf1fc937f8478` na versão `2026.09.21-v4`, e a identidade do manifesto (`private.validate_execution_storage_identity_v1`) exige esse mesmo hash na release fixada. Sem atualizar a guarda, todo pedido do capital com o manifesto novo, humano ou de recomputação, é recusado com `execution_payload_provenance_denied`. As duas primeiras rodadas desta prova, que tentaram uma segunda release de capital com custo no mesmo banco da prova do 3B, pararam nessas duas guardas (`execution_payload_provenance_denied`, depois `execution_manifest_identity_mismatch`); somadas à unicidade de uma release por procedimento, versão e hash e à recusa de dois perfis executáveis (`execution_profile_ambiguous`), com perfis imutáveis, elas explicam por que a prova da espera tem banco próprio.
- **Onde uma cabeça pode ficar desconhecida.** Versões de fonte e revisões de premissa são imutáveis, então a cabeça de uma fonte ou de um slot fixado nunca some; a ausência de arestas também não ocorre, porque todo pedido tem manifesto e a projeção é reconstruída a partir dele. A única lacuna alcançável é a do procedimento: release de plataforma aposentada sem outra publicada. A capacidade fechada sozinha não basta, porque a cabeça continua conhecida e a retenção é `method_not_executable` (seção 26).
- **Uma candidata.** A prova usa um procedimento fixado por uma única execução para que a restauração da cabeça produza exatamente uma candidata; com o procedimento da fixture, fixado por três execuções, cada linhagem retida teria a sua.

## Os catorze critérios

WCD é `supabase/tests/work_continuity_dependencies.sql`, WCC é `supabase/tests/work_continuation_commands.sql`, VR é `scripts/ci/verify-dependency-recompute.mjs`, WR é `scripts/ci/verify-dependency-wait-restart.mjs` e CT é `packages/work-plan/src/continuation.test.ts`. O job Database é "Database (migrations, RLS, lint)"; o job check é "Lint, typecheck, test, build" (`pnpm check`, que roda os testes de domínio). Direta quer dizer que o teste executa o próprio critério no CI; indireta, que o critério decorre de provas vizinhas.

| # | Critério | Prova (arquivo:linha) | Job do CI | Tipo |
|---|---|---|---|---|
| 1 | Reinício do robô | WCD:354 (outbox: reivindica, lease expira, reivindica de novo, completa; lease velho recusado); WCD:895 (candidata: lease expira, a segunda reivindicação produz uma execução); WR:202 (laço em execução e laço reiniciado com outro dono de lease, sem tocar a espera); CT:516 | Database; check | direta |
| 2 | Entrega duplicada | WCD:229 (o mesmo evento aplicado duas vezes); WCD:858 (reentrega pela outbox não planeja nada novo); CT:417 | Database; check | direta |
| 3 | Evento fora de ordem | WCD:270 (versão 5 antes da 4; nada regride); CT:446 | Database; check | direta |
| 4 | Alterações concorrentes | `scripts/ci/test-dependency-update-concurrency.py`:104 (duas sessões, um pedido aberto); `scripts/ci/test-dependency-recompute-concurrency.py`:127 (dois robôs, um lease); WCD:166 (duas mudanças antes do consumidor); CT:476 | Database; check | direta |
| 5 | Balancete novo | WCD:803 (nova versão de S: candidata só para a linhagem afetada); CT:169 | Database; check | direta |
| 6 | Mudança de uma premissa | VR:145 (nova revisão da base muda uma decisão e o laço real do robô produz sem pessoa a candidata de orçamento zero, linha 175); WCD:166 (revisão com o slot B alterado); CT:220 | Database; check | direta |
| 7 | Troca de método | WCD:323 (release mais nova: só as execuções na release antiga, `method_update`); WCD:1169 (cabeça sem perfil executável retida até a capacidade liberar); CT:256 | Database; check | direta |
| 8 | Só descendentes afetados ficam desatualizados | WCD:803 (X3 reaproveitada, X2 retida até a fonte derivada ser refeita); WCD:323; CT:170 | Database; check | direta |
| 9 | Decisão antiga permanece imutável | WCD:641 (marcos e recibos idênticos byte a byte); WCC:166 (`history_intact`, conferido por todos os comandos); CT:357 | Database; check | direta |
| 10 | Retomar não repete efeito | WCD:833 (produzida uma vez; a mesma submissão só nomeia a execução); WCD:895; WCC:617 (submissão e autorização repetidas); CT:530 | Database; check | direta |
| 11 | Retomar não repete custo confirmado | WCC:617 (autorizada, interrompida, reivindicada de novo e produzida uma vez; teto e autorização usados uma vez) e WCC:699 (reserva do teto recusada; reserva de custo zero uma vez, também após nova reivindicação do job); CT:542 | Database; check | direta para custo zero; a reserva acima de zero é recusada pelo produto (ver limites) |
| 12 | Espera humana resiste a deploy | WR:202 (espera `awaiting_human` sem job e sem lease atravessa o laço e um robô reiniciado; autorização por `authorize_work_update_v1`, linha 250; uma produção com linhagem, linha 265); WCD:1261 (espera persistida, nada a reivindicar); CT:385 | Database; check | direta |
| 13 | Evento perdido pelo consumidor é recuperado pela outbox | WCD:519 (efeito falha, a entrega perdida é aplicada quando o lease expira, linha 571; bloqueio após cinco tentativas e recuperação do operador, linha 607; efeito cortado pelo tempo limite, linha 638) | Database | direta |
| 14 | Grafo incompleto deixa a saída inteira desatualizada e reconstrói antes de reaproveitar | WCD:1406 (fato `graph_incomplete` com a lacuna, retenção com o sinal, nada planejado nem reaproveitado; a cabeça restaurada libera a retenção e produz uma candidata); WCD:244 (projeção reconstruída antes do julgamento); CT:312 | Database; check | direta |

## Como verificar

O job Database do workflow Quality roda todos os arquivos de `supabase/tests/*.sql`, depois `scripts/ci/verify-dependency-recompute.mjs` e, por último, sobre o banco refeito, `scripts/ci/verify-dependency-wait-restart.mjs`. As linhas PASS novas são:

- `PASS: graph incomplete: a retired release leaves the pinned head unknown; ...` e `PASS: graph incomplete: the next release restores the head; ...` (WCD, seção 31);
- `PASS: an authorized costed candidate interrupted after its claim is claimed again by the restarted worker and produced once, ...` e `PASS: the produced execution has one budget account at zero: ...` (WCC, seção 8b);
- `dependency_wait_across_restart: PASS (...)` (WR); a linha `dependency_recompute_worker_loop: PASS (...)` do VR continua a de main.
