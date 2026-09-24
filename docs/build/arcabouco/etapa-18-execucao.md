# Etapa 18: dependências, invalidação e continuidade

A etapa começa pelo OK expresso do fundador de 24/09/2026 e segue a autoridade permanente de execução de 21/09/2026, ambos registrados em `docs/build/arcabouco-stage0/FOUNDER-ACTS.md`. As decisões técnicas cabem ao executor, com revisão independente; nada aqui libera execução para clientes reais nem aprova conteúdo profissional. A fila atual permanece; Temporal fica para a evolução posterior da continuidade, como decidido no roteiro.

**Objetivo.** Retomar um trabalho e atualizar somente o que mudou. Um balancete novo, uma premissa trocada ou um método novo geram impacto e uma candidata; o resultado e a decisão anteriores permanecem intactos; retomar não repete efeito nem custo já confirmado.

## Ponto de partida medido

Levantamento de 24/09/2026 sobre main `555e05a1`, no banco versionado e no código:

- `private.resource_dependencies` (etapa 7) registra só arestas de fonte derivada para fonte. Execuções não aparecem no grafo; suas entradas estão em `private.execution_source_bindings` (versão de fonte e direito), `private.execution_basis_bindings` (versão de premissa e decisão de adoção por slot) e em `private.execution_manifests` (release de método fixada).
- `private.execution_inputs_current_v1` (etapa 17) mede direito e acesso vigentes. Não detecta versão mais nova do insumo: uma nova versão da mesma fonte lógica ou uma revisão nova do conjunto de premissas não muda o estado de uma execução antiga.
- A outbox da etapa 4 tem um único efeito, `revalidate_authority`: cancela jobs cuja autoridade deixou de valer. Nenhum evento agenda recomputação. Não há eventos para versão de fonte, release de método ou resultado de execução.
- `public.dependency_invalidation_events` é do fluxo legado com intake: exige sessão, grava listas fixas (`facts`, `calculations`, ...) e só alimenta dois bloqueios de controle operacional. O worker declara `staleDependents: 0` como constante, e `invalidateDependencyGraph` (`packages/release-governance`) não tem chamador em produção.
- A propagação de revisão canônica (`propagate_project_canonical_revision_v1`) e a revisão da configuração institucional recalculam postando uma mensagem sintética e refazendo todos os cenários.
- A continuação por mensagem ("aprofundar", "revisar", "atualizar") mira o artefato mais novo ainda pendente de confirmação; nunca um aprovado. Em trabalho sem sessão de intake, a mesma mensagem devolve erro.
- Esperas humanas já são estado persistido sem lease (aprovação de brief, pedidos de informação, confirmações), mas em formas diferentes. Parte do polling da web infere atividade pela ausência de resultado.

Defeito latente da 17 encontrado no levantamento e corrigido antes desta etapa: a verificação de autoridade usada pela varredura da outbox não reconhecia jobs de avaliação governada e os cancelaria no primeiro evento da organização de avaliação. Produção não tinha avaliação nem evento pendente; a correção tem PR própria com teste.

## Decisões de desenho

1. **Um grafo, duas camadas.** `resource_dependencies` continua o registro canônico das arestas de fonte. As arestas de execução ficam em **nova** `private.execution_dependencies`: projeção tipada (execução para versão de fonte, versão de premissa e slot, decisão de adoção, release de método), gravada na mesma transação do pedido de execução a partir dos bindings e do manifesto, sem escritor próprio; backfill das execuções existentes a partir dos mesmos registros. O fechamento transitivo percorre `resource_dependencies`.
2. **Desatualizada não é revogada.** Revogação e direito seguem a regra da 17 (resultado retido). Desatualizada significa que existe versão mais nova do insumo: versão maior da mesma fonte lógica; revisão maior do mesmo conjunto de premissas com o slot usado alterado; release publicada mais nova do mesmo procedimento. A granularidade é o slot: execução que usou só slots inalterados permanece válida.
3. **Eventos.** Novos tipos de agregado para versão de fonte, release de método e resultado de execução; efeito novo `propagate_dependencies` ao lado de `revalidate_authority`. O consumidor da etapa 4 mantém a varredura de autoridade e aplica o efeito de dependência de forma idempotente por evento e segura fora de ordem: o impacto é calculado pelo estado atual, e evento antigo não desfaz o efeito de um mais novo.
4. **Impacto e candidata.** Cada evento grava fatos imutáveis de invalidação (execução, insumo, evento) e abre ou funde um pedido de continuação do tipo atualização de dependência por trabalho, com histórico dos eventos que o formaram. A recomputação é agendada na fila atual somente para as execuções afetadas, sob o solicitante original com autoridade atual reavaliada. Recomputação automática só quando o perfil fixado tem custo zero; perfil com custo espera autorização humana persistida. Execução não afetada é reaproveitada por hash.
5. **Adoção humana.** **Novo** `public.adopt_work_update_v1` registra a adoção da candidata para o marco correspondente. Resultado e decisão anteriores permanecem imutáveis e referenciados; nada reescreve resultado aprovado.
6. **Continuidade na conversa.** **Novo** `public.request_work_continuation_v1` exige base explícita (marco, decisão e revisão). "Aprofundar o alongamento aprovado" resolve o marco aprovado por referência, nunca pela última mensagem; propõe o novo objetivo e conserva trabalho e conversa. Referência ambígua vira pergunta, não escolha silenciosa.
7. **Marcos.** **Nova** `public.work_milestones`, imutável, escrita pelos comandos na mesma transação: resultado de execução, decisão, espera humana aberta e fechada, continuação proposta e adotada. Leitura autorizada pelo acesso ao trabalho. Espera humana é marco aberto, sem job nem lease.
8. **Legado.** Os adaptadores de `propagate_project_canonical_revision_v1` e da revisão institucional passam a emitir evento e usar o grafo, recalculando só os resultados dependentes. `dependency_invalidation_events` fica como trilha dos controles operacionais, sem escritor novo, até a consolidação da 22/23. O worker deixa de declarar `staleDependents` como constante.

## Incrementos e ordem de publicação

1. **Contrato de domínio, sem migração.** **Novo** `packages/work-plan/src/continuation.ts`: tipos de dependência, evento de mudança, impacto, pedido de continuação, marco e espera; cálculo de impacto só dos descendentes afetados, com a regra de grafo incompleto (saída inteira desatualizada até reconstruir); ordenação e deduplicação de eventos por agregado e versão; plano de recomputação delimitada (refazer, reaproveitar por hash, esperar autorização de custo); resolução de base explícita da continuação. Testes de domínio para os sete cenários do pronto.
2. **Armazenamento e projeção.** Migração A de **nova** `work_dependencies_and_continuity`: `private.execution_dependencies`, `public.work_milestones`, `public.work_continuation_requests` e os fatos de invalidação; RLS e grants pelo anexo de contratos (sem DML de clientes, leitura autorizada nas públicas); projeção gravada pelo pedido de execução na mesma transação; marco de resultado gravado pelo commit; backfill. Testes SQL de armazenamento, grants, escritor único e backfill.
3. **Eventos, impacto e recomputação.** Migração B: novos tipos de evento e o efeito `propagate_dependencies`; produtores nas versões de fonte, releases e resultados; consumidor idempotente e seguro fora de ordem; agendamento das execuções afetadas. **Novo** `apps/document-worker/src/dependency-invalidation.ts` no laço da outbox. **Novo** `supabase/tests/work_continuity_dependencies.sql`.
4. **Comandos de continuidade e adoção.** Migração C: `request_work_continuation_v1` e `adopt_work_update_v1`; web do trabalho mostra o que mudou, o que foi refeito, o que permaneceu válido e o que espera decisão; a conversa encaminha pedidos de continuação com base explícita, inclusive em trabalho sem intake.
5. **Adaptadores, polling e retirada.** Revisão canônica e configuração institucional pelo grafo comum, com recomputação só dos cenários dependentes; retirar a atualização por última mensagem nos caminhos substituídos, o polling que infere atividade nas superfícies de trabalho e execução, e a recomputação integral onde a dependência é delimitada.
6. **Fechamento.** Regressão do primeiro procedimento e de R01; CI sem instabilidade; journals e catálogos conciliados; web e worker no commit final; evidência de produção sem fixtures.

Migrações entram uma por vez em staging e produção, com inventário conciliado antes da seguinte.

## Pronto da etapa

`supabase/tests/work_continuity_dependencies.sql` e os testes de domínio provam, com dados sintéticos e rollback: reinício do worker, entrega duplicada, evento fora de ordem, alterações concorrentes, balancete novo, mudança de uma premissa e troca de método. Só descendentes afetados ficam desatualizados; decisão antiga permanece imutável; retomar não repete efeito nem custo confirmado; espera humana resiste a deploy; evento perdido pelo consumidor é recuperado pela outbox. Se o grafo de uma saída estiver incompleto, a saída inteira fica desatualizada e as dependências são reconstruídas antes de qualquer reaproveitamento.

## Fora desta etapa

Protocolo de artefato e blocos (19), aprovação de versão exata (20), exportação e reimportação (21), revogação de ponta a ponta (22) e retirada geral dos caminhos antigos (23). A 18 retira apenas o que ela mesma substitui.

## Riscos com dono e momento

- Engenharia de execução, incrementos 2 e 3: projeção sem escritor próprio; impacto calculado pelo estado atual; recomputação automática nunca gasta sem autorização.
- Engenharia de produto, incremento 4: base explícita obrigatória; nenhuma mensagem escolhe sozinha o que atualizar.
- Operação: alarmes da outbox com destino e entrega testados em 24/09/2026 (ver `docs/build/RISK_REGISTER.md`); o efeito novo da outbox não pode aumentar o atraso da varredura de autoridade.
