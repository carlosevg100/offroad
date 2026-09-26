# Etapa 18, incremento 5D: três acabamentos da web deixados em aberto pelo 5C

Incremento só de web, sem migração e sem mudança no worker: nenhuma tabela, função, política ou concessão muda, e `apps/web/src/types/database.ts` não muda. Parte de `main` com o 5C (#796, `2d690f9b`, migração `20260926051417_work_update_integration`). Os três pontos são os que a nota do 5C deixou como limites: a tela de resultados do modelo não dizia que um recálculo espera adoção, a tela de execuções não oferecia o pedido a partir de uma continuação e uma recusa recusada com `work_update_job_busy` aparecia como erro genérico.

## O ponto de partida medido

- Painel de resultados: com o recálculo pronto e esperando a adoção, o resultado atual continua o anterior (5C); se a aprovação moveu a configuração, ele aparece como desatualizado, e o painel dizia "As fontes ou premissas mudaram. Revise e calcule novamente". A leitura das atualizações já trazia, por atualização, as candidatas institucionais com `state`, `resultStatus`, `current` e `resultIds`; a página só a lia no fim, para a seção Atualizações.
- Pedido de execução: o gatilho do 5C cumpre uma continuação quando um objetivo do próximo pedido de uma pessoa repete o seu texto, sem diferença de maiúsculas e com espaços colapsados. O formulário não tinha ponto de partida na continuação.
- Recusa: `decline_work_update_v1` recusa com `work_update_job_busy` (SQLSTATE 55000) quando o worker segura naquele instante um dos jobs que ela pararia. A web mapeava 55000 para o erro genérico de processamento, que fecha a confirmação, recarrega a tela e diz que a atualização não está mais naquele estado, o que não é verdade: nada mudou e a pessoa pode repetir.

## 1. O painel de resultados enquanto um recálculo espera adoção

Lido do que a página já tem, sem leitura nova de banco: a página do trabalho passou a ler as atualizações (`loadWorkUpdates`, a mesma leitura de `work_update_view_v1`) uma vez, antes do resultado que elas podem substituir, e usa essa leitura no painel e na seção Atualizações.

O modelo da seção (`workUpdatesModel`) passou a listar os recálculos que esperam adoção (`recalculations`): em cada atualização aberta, a candidata institucional `settled` cujo resultado está `completed` e não é o atual (`current` falso), com os resultados que ela cobre (`resultIds`, os que a adoção marca como anteriores) e se a atualização pode ser adotada agora (`ready`). `recalculationAwaitingAdoption` escolhe o recálculo que cobre o resultado mostrado pelo painel, preferindo o que pode ser adotado agora; um recálculo que não cobre o resultado mostrado (por exemplo, um resultado pedido por pessoa depois dele) não muda o painel.

| Situação | O painel diz |
|---|---|
| Atualização pronta para adoção com o recálculo que cobre o resultado mostrado | "Um resultado recalculado com os insumos atuais está pronto e aguarda a sua decisão em Atualizações. Ele passa a valer quando você adotar a atualização." |
| Atualização ainda aberta por outra parte (bloqueio, autorização ou outro recálculo) com o recálculo pronto | "Um resultado recalculado com os insumos atuais está pronto em Atualizações. A atualização ainda aguarda outra etapa antes da sua decisão, e o novo resultado passa a valer quando ela for adotada." |
| Nenhum recálculo esperando | O que dizia antes, inclusive "revise e calcule novamente" para o resultado desatualizado |

Nos dois primeiros casos, o link "Abrir a atualização" leva a `#work-updates/<atualização>`: abre a seção Atualizações, traz o cartão daquela atualização para a vista, dá foco a ele e o destaca. O link de seção ganhou um alvo opcional, codificado e separado por uma barra (a barra de um id de seção vem codificada, então a leitura não é ambígua). O link muda o endereço pela History API, que o roteador acompanha (a mesma regra que a navegação das seções já seguia para que uma atualização da página não devolva o endereço anterior), e avisa a navegação e a seção por um evento de mudança de endereço. A seção lê o alvo do endereço; sem alvo, nada muda nela.

## 2. O pedido de execução a partir de uma continuação

A continuação aparece com as suas ações só no cartão da seção Atualizações, no trabalho com e sem sessão de intake; a nota da conversa diz a base, sem ações. O cartão ganhou "Pedir uma execução para esta continuação" quando uma execução nova a cumpriria: continuação aberta, ou agendada cuja execução terminou sem resultado. São as duas situações em que o gatilho do 5C liga uma execução nova; uma continuação com execução em andamento ou com resultado pronto não oferece o pedido.

O link abre a tela de execuções com o id da continuação no endereço (`executions?followup=<id>`), nunca o texto. A página lê a continuação pela mesma leitura das atualizações, sob a autoridade de leitura do trabalho e só quando o parâmetro existe, e mostra o texto da continuação e a base de que ela parte ("Continua a partir de X, revisão N") acima do formulário. O primeiro objetivo vem preenchido com o texto da continuação numa linha (`followupObjective`): o formulário lê um objetivo por linha, então as quebras e as sequências de espaço, tabulação e fim de linha viram um espaço, os mesmos caracteres que o banco colapsa (`\s` de `private.work_followup_citation_v1`), sem mudar maiúsculas nem outros caracteres; o banco compara sem maiúsculas, então o objetivo cita a continuação. Um texto maior que um objetivo (2000 caracteres, agora a constante `executionRequestTextMaxLength`, que a ação também usa) não pode ser citado e não recebe o pedido. Uma continuação que não espera mais execução mostra um aviso e nada é preenchido. Em um trabalho sem base da análise, a continuação aparece e o formulário continua indisponível, como antes.

Tudo continua editável, e a ação valida o pedido como qualquer outro: o id da continuação não vai no pedido, a ação não mudou (só passou a ler o limite da constante) e é o banco que liga a execução à continuação, pelo objetivo e pela pessoa da sessão.

## 3. A recusa enquanto um cálculo termina

`workUpdateActionError` mapeia `work_update_job_busy` para um erro próprio das decisões sobre atualizações (`busy`): "Um cálculo desta atualização está terminando agora. Tente novamente em alguns segundos." A confirmação continua aberta com o motivo escolhido e o mesmo id de comando, sem recarregar: a recusa foi desfeita inteira no banco, então repetir é o mesmo comando. Os demais erros continuam como estavam, inclusive os outros 55000 (`work_update_not_open`, `work_update_not_ready`), que seguem como processamento e recarregam a tela. Se, ao repetir, o cálculo já tiver mudado a atualização, a recusa volta como desatualizada e a tela recarrega, como antes.

## Textos

Todos em `apps/web/messages/pt-BR.json` e `en-US.json` com as mesmas chaves: `InstitutionalModelResult.status.recalculationReady`, `status.recalculationWaiting` e `openUpdate`; `App.workUpdates.errors.busy` e `followups.requestExecution`; `App.workExecutions.request.followup` (`title`, `base`, `help`, `unavailable`). Nenhum identificador interno aparece no texto.

## Testes

- `work-updates.test.ts`: o recálculo pronto na atualização pronta e o resultado que ele cobre, a atualização ainda aberta, o que deixa de esperar (adotado, recusado, bloqueado, ainda calculando), a preferência pelo que pode ser adotado, o preenchimento só a partir de uma continuação que espera execução, a continuação agendada cuja execução terminou e a que roda, e o objetivo numa linha (espaços, espaço sem quebra, limite de 2000 e texto vazio).
- `work-updates.test.tsx`: o pedido só na continuação aberta, com o endereço da tela de execuções nos dois idiomas, e as âncoras das atualizações.
- `institutional-model-result-activity.test.tsx`: os dois textos do painel com o link para a atualização e o painel de antes sem recálculo esperando.
- `work-execution-request.test.tsx`: o objetivo preenchido, o texto e a base nos dois idiomas, nada mais preenchido, o aviso de continuação indisponível e a continuação em trabalho sem base.
- `work-update-actions.test.ts`: `work_update_job_busy` como `busy`, os outros 55000 como processamento e os demais resultados da recusa e da adoção como antes.
- `advisor-work-surface.test.tsx`: o link de seção com alvo, ida e volta.
- Playwright `work-update-integration.spec.ts`: no passo 4, com a atualização aberta e o recálculo pronto, o painel diz que a atualização aguarda outra etapa e aponta para ela; no passo 5, pronta, o painel aponta para a atualização e o link abre a seção com ela destacada na vista (capturas `recalculation-ready-panel` e `recalculation-ready-update`); no passo 7, depois da adoção, uma continuação digitada na conversa abre o pedido com o texto e a base (captura `followup-request-prefilled`), o pedido é enviado e o banco liga a execução à continuação, que passa a `scheduled`. `institutional-setup.spec.ts`: o painel mostra o recálculo pronto, sem download, e o link abre a atualização que a jornada adota em seguida.

## Limites e riscos

- Enquanto o recálculo ainda calcula (candidata agendada, resultado em fila), o painel continua a mostrar o resultado anterior como desatualizado e a pedir revisão. O dado para dizer que o recálculo está em andamento está na mesma leitura; ficou fora deste pedido.
- Uma continuação com texto maior que 2000 caracteres não pode ser cumprida por um pedido de execução, porque nenhum objetivo a cita; o cartão não oferece o pedido e continua a dizer como ela começa.
- O preenchimento é uma conveniência: se a pessoa editar o objetivo, o pedido segue válido e não cumpre a continuação, como qualquer pedido que não a cite.
- O destaque segue o endereço: trocar de seção pela navegação muda o endereço; um endereço reescrito sem evento pode manter o destaque até a próxima troca.
- As jornadas Playwright rodam só na CI: esta máquina não tem Docker para a pilha local.

## Aplicação

Merge e implantação da web. Não há migração nem mudança de worker. A ordem em relação às correções #797 e #798 é livre: elas não tocam as atualizações nem o pedido de execução; os três compartilham só a página do projeto, os catálogos de mensagens e os livros-razão, em trechos diferentes, salvo a entrada no topo dos livros-razão.
