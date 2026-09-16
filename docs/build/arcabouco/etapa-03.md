# Etapa 3: decisões de implementação

- Postgres é o único avaliador. TypeScript valida comandos/respostas e publica vetores; não calcula allow.
- Grupos são planos. O comando rejeita parentGroupId e membros do tipo grupo/delegado; não existe aresta recursiva ou ciclo permitido.
- Principals humanos por organização; principal worker vinculado ao sujeito humano, job, recurso raiz, conta/credencial do lease e prazo do lease. Não recebe concessão própria nem entra em grupo.
- Grants legados preservados no mesmo registro. Novos grants de grupo e negações explícitas usam esse registro, com chave própria. Administrar relações usa ação separada de conteúdo; papel administrativo não implica leitura.
- Cada barreira ativa protege recurso e descendentes. Exige membro permitido e nenhum membro negado; múltiplas barreiras compõem por interseção. Restrições de finalidade são intersectadas entre raiz e recurso; direitos de fonte completos entram na etapa 7.
- Comandos administrativos derivam organização do contexto autenticado, bloqueiam chaves desconhecidas e não revelam objeto oculto em explain. Resposta negativa única sem título, IDs de concessões ou motivos internos.
- Alterações de política entram na mesma trilha/outbox de 4. Compatibilidade access_policy publicada no consumidor antes do DDL; snapshots ficam privados.
- Mutação de política e publicação de job compartilham lock de autorização; revogação invalida jobs cuja autoridade ficou insuficiente. Controles síncronos permanecem obrigatórios enquanto outbox propaga.
- Sem telas administrativas nesta etapa, conforme ajuste do fundador.

Status em 16/09/2026: implementação mesclada pela PR 629 no commit `a8cdddedda7ad1d09915571d54e98a775c42763a`. Quality `35123611009` e Security `35123611021` passaram; 31 E2Es passaram. Contrato instalado em staging e produção, 67 contratos SQL PASS no schema instalado, 53 funções idênticas e advisors de segurança sem lints. A revisão técnica final está em `docs/security/history/wave-3-final-review.md`; o receipt de runtime está em `docs/security/evidence/aws-worker-rollout-diagnostics-wave-3.json`. O relatório externo de completion registra também a CI e o runtime do commit da conciliação final.

| Migração | Staging | Produção |
|---|---|---|
| resource_policy_and_barriers | 20260916124024 | 20260916163753 |
| bound_policy_grants_to_resource | 20260916124447 | 20260916163756 |
| deduplicate_resource_policy_events | 20260916163357 | 20260916163759 |

O segundo SQL corrige concessão de filho ampliada indevidamente à raiz e a classificação de negação explícita após tombstone legado. O terceiro retira um trigger duplicado: reprodução instalada gerava dois eventos por mudança; depois gera um e retry sem alteração gera zero. Nenhum SQL aplicado foi editado.

Novos contratos SQL: resource_policy_barriers, resource_policy_delegation, resource_policy_isolation, resource_policy_performance e resource_policy_event_once. O teste de performance executou 200 amostras sobre 200 grupos: p50 8,8505 ms, p95 10,0992 ms, máximo 13,257 ms; limite sintético 100 ms. O plano usou índices de grants e grupos. Isto não é SLO de carga de clientes.

Tipos gerados a partir de produção, inventário de 75 novas superfícies revisado e checkers de catálogos/journal/replay histórico sem divergência. SQLs antigos de distribuição exclusivos de staging continuam fora do replay.

Rollback: não remover tabelas/grants ou repor membership como acesso. Contenção por comandos auditados de grupo/barreira/finalidade e correção sucessora; manter o consumidor access_policy da PR 628 ou posterior. As 67 regressões verificam compatibilidade com rotas e loaders legados.

Entrega do baseline: Quality de main `35124886036` PASS; Security `35124885842` PASS; deploy worker `35124885802` PASS, ECS revisão 338 e imagem `document-worker:a8cdddedda7a`, uma tarefa ativa, polling sem pendência/bloqueio e quatro alarmes OK. Vercel Production deployment `6486075247` SUCCESS no mesmo commit. HTTP público 200 e rotas privadas anônimas 307 para login. Os alarmes ainda não têm ações configuradas; esta é observação operacional, não atestado geral de IAM.
