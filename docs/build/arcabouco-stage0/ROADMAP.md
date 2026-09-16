# Offroad - plano de implementação do arcabouço

14 de setembro de 2026 · Roteiro aprovado; execução autorizada somente por onda · Ajustes da retomada incorporados: backfill automático em 1B e retenção zero como evolução comercial futura.

O plano preserva os motores, a evidência e as identidades úteis; substitui os caminhos que atribuem autoridade indevida, tornam intake obrigatório ou confundem hipótese, dado oficial e método publicado. A construção termina com o núcleo instalado e tecnicamente verificado, antes dos ensaios de produto com usuários.

**O primeiro trabalho é “alternativas de estrutura de capital para uma decisão”.** Ele atravessa os incrementos, primeiro como caso de contrato e cálculo, depois como procedimento publicado executado de ponta a ponta. “Comparar propostas” será o segundo procedimento, após a conclusão deste núcleo. A biblioteca é propriedade da Offroad e será escrita e revisada pelos seus responsáveis em paralelo à engenharia.

**A fila atual permanece em todas as etapas deste plano.** Continuidade já terá estado persistido, espera humana, dependências, idempotência e retomada. Temporal entra numa evolução posterior dessa continuidade, sem mudar objetos ou contratos. A aprovação de arquitetura não implica introduzir Temporal para construir o núcleo.

Este documento registra o roteiro aprovado e as instruções posteriores do fundador. Os critérios abaixo não são resultados de testes; consultar o relatório de cada etapa para o estado efetivamente entregue.

## Como executar e aprovar este plano

Cada item numerado é uma unidade de entrega e revisão do tamanho de uma PR. A Etapa 1 possui três entregas independentes, 1A, 1B e 1C. P significa mudança localizada; M, contrato com integração em poucas camadas; G, mudança de fronteira que exige revisão conjunta de banco e aplicação. G não autoriza acumular funcionalidades adjacentes.

Os arquivos, tabelas, funções e políticas **existentes** aparecem com seus nomes reais. **Novo** identifica um nome proposto para implementação. Os caminhos de código são relativos ao repositório `offroad`; o inventário foi extraído do worktree de main indicado na Etapa 0. Migrações novas recebem os nomes semânticos especificados abaixo, dentro de `supabase/migrations/`; seu prefixo de versão será gerado e conciliado com o journal no momento da aplicação. Nenhuma migração já aplicada será editada ou apagada.

**Contrato de pronto comum, obrigatório em cada incremento:**

1. `pnpm check` passa, incluindo lint, tipos, testes e build; o job `database` de `.github/workflows/quality.yml` reaplica o histórico em banco limpo, executa os contratos SQL e passa pelo lint de banco. O E2E afetado passa em preview. Testes novos usam identidades e organizações sintéticas em local/staging.
2. Toda alteração SQL passa por migração em staging, verificação do catálogo e grants, tipos regenerados em `apps/web/src/types/database.ts`, depois aplicação em produção e comparação de definição/políticas. Incrementos sem DDL comprovam que não dependem de alteração remota não versionada; verificam o deploy de web/worker correspondente.
3. Novos objetos privados têm tenant explícito, chaves compostas e FKs coerentes, RLS e grants mínimos. Políticas são por comando, com `WITH CHECK` quando aplicável. Funções privilegiadas têm finalidade limitada, `search_path` fixado e invocação restrita. Identidade vem da sessão/capability validada, nunca de um ID humano fornecido pelo modelo.
4. O teste de fechamento cobre RPC público, helper privilegiado, PostgREST, Storage, rota web e worker relevantes. Uma política permissiva antiga não fica ao lado da nova; um endpoint antigo não recebe exceção de autorização. Negar também título, contagem, snippet e existência quando forem restritos.
5. A entrega registra commit, migrações por ambiente, hashes dos contratos, testes e deploy em `docs/build/BUILD_STATE.md` e em **novo** `docs/build/arcabouco/etapa-NN.md`. Segurança sem achado crítico/alto pendente; advisors de segurança sem achados novos, com os existentes tratados pelo baseline real.
6. Rollback de interface/executor preserva o novo controle de acesso. Uma falha operacional pausa a capacidade afetada; nunca restaura leitura ampla, cargo no raciocínio ou escrita sem publicação. Dados e versões preservados permitem correção aditiva.

Os nomes propostos de cada tabela/política e a regra de escrita estão no [anexo de contratos de migração](CONTRATOS-DE-MIGRACAO.md). O padrão combina grants com RLS e inclui views e funções privilegiadas: essas superfícies podem reabrir leitura se forem tratadas separadamente. A documentação oficial confirma essas fronteiras em [RLS e views](https://supabase.com/docs/guides/database/postgres/row-level-security) e [controle de acesso ao Storage](https://supabase.com/docs/guides/storage/security/access-control).

Produção é verificada por catálogo, deploy, sinais operacionais e operações legítimas autorizadas. Não se criam usuários, companhias ou documentos descartáveis em produção. A prova adversarial acontece em staging com o mesmo schema e as mesmas versões de artefatos implantadas; se a verificação funcional de produção precisar de uma ação humana real, ela integra o aceite operacional da entrega.

## 0. Estado atual e conciliação

O inventário inicial do planejamento foi substituído pelo [mapa completo de objetos](OBJECT-MAP.md), [linhagem SQL](SOURCE-LINEAGE.md), [catálogos e gate de cobertura](README.md) e [histórico recuperado](../schema-history/README.md). A referência de main desta integração é `d88683df88829cc50fe92f3b7694477630308499`, acrescida dos sete arquivos históricos de produção recuperados nesta etapa. O mapa inclui306 migrações e1.345 objetos na união dos ambientes, com decisão individual; os61 objetos exclusivos de staging ficam congelados para intercâmbio futuro, fora do replay de produção.

A recuperação preserva textos e carimbos já aplicados, sem reaplicar SQL. A correção de mandatos vigente usa `sequence` e default `now()`; o arquivo `clock_timestamp` permanece como histórico. O checker coleta o catálogo real do replay com SQL e compara decisões e superfície de acesso em Python, com testes negativos; essa escolha inclui objetos criados dinamicamente que uma busca textual não enumera corretamente. Não apaga objeto pela ausência de importador literal.

O pronto da etapa exige replay, testes SQL com rollback em staging, journals e catálogos conciliados, destinos das PRs executados, autoria inicial, CI e web/worker no commit entregue. Relatórios registram resultados efetivos. As correções1A/1B/1C começam após o fechamento da etapa0 nesta retomada; ondas seguintes dependem de OK do fundador.

## 1. Segurança agora - três entregas fora da dependência do restante

### 1A. Retirar o poder permanente do criador

**Objetivo e conceito.** Fazer `created_by` representar proveniência; administração decorre de vínculo ativo e revogável.

**Reprodução em staging.** Criar organização sintética por A, constituir B como owner ativo, suspender/revogar A e testar, como A, atualização da própria membership, reinserção de owner após remoção, convite, mudança de papel e gerenciamento da organização. Registrar a resposta anterior à correção. Exercitar o caminho de `memberships_insert_authorized` além de `memberships_update_admin`.

**Escopo.** Migração **nova** `active_organization_authority`: substituir `private.can_manage_organization`; remover os ramos de bootstrap recorrente de `memberships_insert_authorized` e corrigir `memberships_update_admin`/`memberships_delete_admin`. Criar RPCs **novos** `public.create_organization_with_owner_v1` e `public.transfer_organization_owner_v1`, com implementação privada transacional; criação concede a primeira membership uma única vez, na mesma transação. Revogar mutações diretas que permitam promover a si próprio. Adaptar cadastro em `apps/web/src/lib/auth/registration.ts` e os consumidores reais de organização identificados em 0. Manter as funções de convite existentes sob a autoridade corrigida.

**Transição e limpeza.** Corrigir a fronteira sem flag. Migrar o cadastro para o comando atômico antes de retirar o INSERT direto de bootstrap. Não criar grants com base em “é criador”. Preservar ownership ativo existente; detectar organização sem owner ativo e encaminhar recuperação administrativa auditada, sem reativar automaticamente o criador. Retirar código e testes que tratam criação como privilégio eterno.

**Pronto.** **Novo** `supabase/tests/creator_authority_revocation.sql`: A suspenso/removido/rebaixado não gerencia, não se reinsere e não se promove; B ativo continua administrando; transferência concorrente não deixa zero owner por acidente nem cria dois vencedores da mesma transferência. Regresso de signup passa. Migração e definição/grants confirmados em produção; fluxo legítimo de criação/transferência verificado, sem dados descartáveis. Nenhum achado semelhante fica no INSERT antigo.

**Dependências, risco e resposta.** Independente de 2 em diante. Um cadastro antigo pode depender do INSERT direto: atualizar o consumidor no mesmo release e manter o RPC atômico disponível antes do corte. **Esforço M. Paralelo:** 1B e 1C. **Decisão:** adotar bootstrap transacional e owner ativo; está incluída na aprovação do plano.

### 1B. Fechar leitura ampla por membership, inclusive seus atalhos

**Ajuste aprovado em 15/09/2026.** Antecipar de 2 somente seleção explícita e validação da organização ativa, incluindo isolamento entre abas, para viabilizar administração de pessoas pelo cliente. Conta comercial e demais objetos de 2 permanecem na onda original.

**Objetivo e conceito.** Tornar acesso a conteúdo uma concessão explícita e revogável, incluindo o legado.

**Reprodução em staging.** A e B pertencem à mesma organização; somente A deve acessar o projeto, a sessão e seus documentos. Testar como B lista/título, leitura de sessão, `agent_messages`, consulta de chunks, busca, `output_versions`, artefato, download e uma RPC de loader. Repetir após revogação de A com job enfileirado e job leased. Registrar o que passa indevidamente antes da correção.

**Escopo.** Migração **nova** `explicit_legacy_resource_access`: criar `private.access_resources`, `private.resource_access_grants` e `private.authorization_revisions` (**novas**, reutilizadas em 3). Recursos são registrados por organização e tipo com vínculos validados aos objetos reais; nenhum cliente registra UUID arbitrário como autorização. Grants possuem sujeito, ação, recurso, concedente, validade e revogação. Adicionar `private.can_access_resource_v1`, `public.grant_resource_access_v1` e `public.revoke_resource_access_v1` (**novas**).

Substituir os helpers `can_access_capital_project`, `can_access_intake_session`, `can_access_workspace_project_group` e os caminhos alternativos por oportunidade em `can_access_document_scope`/`can_access_opportunity`. Corrigir todas as políticas de conteúdo privado no inventário, incluindo as três diretas citadas em 0.2; revisar `search_case_retrieval`, `worker_load_retrieval_context`, `job_for_capability` e seus loaders. Projeções comprovadamente públicas mantêm sua audiência declarada e não permitem seguir referências para conteúdo privado. Em `processing_jobs`, registrar sujeito humano responsável e revisão de autorização quando ausentes; claim, leitura, heartbeat material e persistência de resultado revalidam essa autoridade.

Alterar `apps/document-worker/src/queue.ts` e as rotas de download listadas no inventário. Downloads privados passam por autorização no servidor e entrega dos bytes; não emitir URL de longa duração que sobreviva à revogação. Cache privado recebe sujeito/escopo/revisão de autorização na chave e é revalidado na leitura. RPCs antigos continuam chamáveis apenas se aplicarem o mesmo predicado.

**Transição e limpeza.** Backfill não copia “todos os membros” para uma ACL. Criar concessão inicial para responsável histórico ainda ativo e atribuições explícitas válidas, como `capital_project_review_assignments`, sem transformar papel de revisão em poder ilimitado. O backfill concede automaticamente acesso revogável ao criador do projeto e administração dos projetos ao administrador ativo da organização; não reativa acesso já revogado. Depois, o administrador de cada cliente cadastra pessoas, perfis e acessos no produto, sem intervenção da Offroad; objetos sem responsável recuperável ficam protegidos para recuperação administrativa, não abertos. Metadados de recuperação não incluem conteúdo financeiro. O grant criado no backfill é revogável; `created_by` deixa de ser consultado para autorizar.

A migração habilita as novas concessões e retira as permissivas antigas na mesma transação. Remover fallback por membership, permissões diretas redundantes e caches sem escopo. Links assinados já emitidos entram em inventário de TTL; bloquear novas emissões e retirar/rotacionar os objetos alcançáveis que precisem de revogação imediata, atualizando referências por comando governado. A etapa não termina com janela conhecida de acesso por link antigo.

**Pronto.** **Novos** `supabase/tests/legacy_resource_access.sql`, `supabase/tests/legacy_access_revocation.sql` e `apps/web/e2e/resource-access.spec.ts`: negar B e usuário de outro tenant; negar título, busca, download e artefato; retirar grant enquanto job espera e enquanto executa; resultado posterior à revogação não é publicado; ex-criador não recupera acesso. Testar todas as rotas antigas do inventário e o Storage diretamente. Staging reproduz a falha e depois prova a negação; produção confirma schema, grants, definição, invalidação e implantação. Controles positivos garantem que o time explicitamente autorizado continua trabalhando.

**Dependências, risco e resposta.** Independe do restante do arcabouço; pode usar o helper corrigido de 1A na integração. Se o backfill não conseguir resolver um responsável válido, manter o conteúdo protegido e disponibilizar recuperação ao administrador autorizado do cliente; corrigir por grant nominal auditado, nunca por membership ampla. **Esforço G**, limitado a esta fronteira de segurança. **Paralelo:** preparar UI, testes e SQL em conjunto; ativação é atômica. **Decisão:** padrão fechado e backfill sem audiência inferida, incluídos na aprovação.

### 1C. Retirar perfil profissional da profundidade e do raciocínio

**Objetivo e conceito.** Garantir o mesmo rigor para a mesma pergunta, dados, finalidade e método, sem conhecer ou perguntar cargo.

**Reprodução em staging.** Enviar a mesma demanda e os mesmos arquivos por identidades com perfis CFO, analista, assessor e perfil ausente, mantendo grants idênticos. Capturar o contexto montado e o prompt antes da chamada; comprovar os campos e instruções de profundidade por perfil. Esse teste prova a condição de código; não depende de obter uma resposta aleatória pior para um cargo.

**Escopo.** Migração **nova** `role_free_reasoning_context`: retirar `professional_context` dos contratos efetivamente retornados por `worker_load_agent_context`, variantes v2–v5 e `worker_load_capital_project_context`, variantes v2–v6, incluindo wrappers `before_*` alcançáveis. Reduzir grants dos helpers internos que não são entradas legítimas. Preservar `professional_context_profiles` como histórico privado, sem consumo pelo runtime.

Alterar `apps/document-worker/src/advisor-context.ts`, `agent-operation-brief.ts`, `capital-planning.ts`, `company-debt-view.ts` e `origination-thesis.ts`; remover tanto o campo serializado quanto as instruções que o utilizam. Alterar `apps/web/src/components/professional-context-form.tsx`, `professional-context-copy.ts` e a entrada de contexto para não pedir cargo. Capacidades institucionais podem informar meios de execução e serviços disponíveis; não modulam profundidade, universo de alternativas ou qualidade. Testar também `packages/work-plan/src/objective-plan.ts`.

**Transição e limpeza.** Worker atualizado tolera resposta antiga, mas a descarta; depois a migração retira o campo. Remover copy, prompt, logging e testes que associem detalhe ao perfil. Novos testes substituem esses contratos. Não apagar registros históricos nem migrá-los para preferências de raciocínio.

**Pronto.** **Novos** `supabase/tests/role_free_reasoning_context.sql` e `apps/document-worker/src/role-free-reasoning.test.ts`: todos os loaders entregam contexto sem cargo; a parte de raciocínio do request é idêntica nos pares contrafactuais, exceto IDs operacionais fora do prompt; planejamento, ferramentas autorizadas e gates de qualidade coincidem. Uma resposta técnica funciona sem cadastro de cargo; perguntas diferentes continuam podendo ter profundidades diferentes. Migração e versão do worker verificadas em produção; telemetry não contém perfil como variável de qualidade.

**Dependências, risco e resposta.** Independente de dados/método novos. Se alguma rotina usa perfil como substituto de intenção, ela passa a usar o objetivo declarado do trabalho; não pede o cargo novamente. **Esforço M. Paralelo:** 1A/1B. **Decisão:** nenhuma adicional.

## 2. Identidade, organização ativa e autoridade administrativa

**Objetivo e conceito.** Cada comando resolve pessoa, organização ativa e vínculo vigente, sem confundir instituição, companhia analisada e perfil de uso.

**Escopo.** Migração **nova** `explicit_workspace_context`: **novas** `private.commercial_accounts`, `private.account_organizations` e `public.user_workspace_preferences`; ampliar `organizations` para organização pessoal/institucional sem forçar tipo companhia. Criar `public.list_my_workspaces_v1` e `public.get_workspace_context_v1`; adaptar `private.workspace_membership_v1`, `get_workspace_bootstrap`, `get_onboarding_bootstrap` e os `start_*` existentes. Alterar `apps/web/src/lib/auth/workspace.ts`, `registration.ts`, `apps/web/src/lib/workspace/capabilities.ts` e **novo** componente `workspace-context-switcher.tsx`.

**Transição e limpeza.** `organizations.id` permanece tenant; conta comercial não herda acesso ao conteúdo das organizações vinculadas. Um único vínculo ativo pode ser selecionado automaticamente; múltiplos exigem seleção inequívoca e visível. Sessão/cookie de contexto é validado contra membership em todo comando. Retirar `LIMIT 1` como resolução silenciosa de ambiguidade, defaults comerciais que concedem capacidades e ramificações exclusivas companhia/banco/fundo.

**Pronto.** **Novo** `supabase/tests/explicit_workspace_context.sql`; testes de duas organizações em duas abas, organização pessoal sem CNPJ, vínculo revogado, alteração de cookie e troca de contexto durante submit; nenhum comando grava no tenant anterior ou escolhe o mais antigo. Migração nos dois ambientes e controles comuns concluídos.

**Dependências, risco e resposta.** Depende de 1A. Se algum cliente antigo não envia contexto e há múltiplos vínculos, retorna erro recuperável de seleção; não escolhe por ordem de criação. **Esforço M. Paralelo:** 4 e desenho de contratos de 5/13. **Decisão:** nenhuma adicional; SSO/SCIM fica para conectores posteriores, deprovisionamento local já é obrigatório.

## 3. Política comum de acesso, grupos e barreiras

**Objetivo e conceito.** Resolver relações, ações e restrições numa política única, com negação prevalecendo sobre concessão.

**Escopo.** Criar **novo** `packages/access-policy` com esquemas, vocabulário de ações e vetores de conformidade; Postgres permanece autoridade de decisão, evitando manter dois motores divergentes. Migração **nova** `resource_policy_and_barriers`: estender `access_resources`/`resource_access_grants`; criar `private.principals`, `private.organization_units`, `private.access_groups`, `private.access_group_memberships`, `private.information_barriers` e `private.barrier_memberships`. Delegação de worker referencia sujeito humano, trabalho, escopo e prazo. Criar RPCs **novas** `public.explain_my_access_v1`, `public.set_access_group_v1`, `public.set_access_group_member_v1`, `public.set_information_barrier_v1` e `public.revoke_principal_access_v1`; respostas de negação não revelam objeto oculto. UI **nova** `apps/web/src/app/[locale]/app/settings/access/page.tsx`.

**Transição e limpeza.** Os grants de 1B tornam-se relações do mesmo registro, sem segundo backfill aberto. `can_access_resource_v1` avalia vínculo ativo ∩ concessão ∩ barreira ∩ finalidade/direitos. Administrador de acesso administra relações sem ganhar leitura dos dados. Remover decisões duplicadas em frontend; UI exibe capabilities de ação emitidas pelo servidor. Não introduzir OpenFGA neste núcleo: o banco já é a fronteira e os vetores permitem trocar o mecanismo depois sem mudar semântica.

**Pronto.** **Novo** `supabase/tests/resource_policy_barriers.sql`: grupos aninhados controlados ou rejeitados explicitamente, deny sobre allow, barreira entre mesas, usuário em múltiplos grupos, expiração, principal delegado sem ampliar direitos, admin sem leitura; mesmos vetores passam no contrato TS e na decisão SQL. Testar plano/latência das consultas representativas em staging e índices tenant/recurso/sujeito. Migração, políticas e gates comuns nos dois ambientes.

**Dependências, risco e resposta.** 1B e 2. Se uma composição de grupos produz ciclo, comando rejeita atomicamente; se a consulta excede orçamento, materializar relações elegíveis com revisão de autorização, nunca cachear allow sem revalidação. **Esforço G. Paralelo:** 4 e 5 após contratos estabilizados. **Decisão:** política em Postgres e grupos administrados localmente, já escolhidos.

## 4. Evento de domínio, auditoria mínima e outbox transacional

**Objetivo e conceito.** Fazer toda nova autoridade, publicação e execução nascer com trilha e evento durável, em vez de acrescentar auditoria no fim.

**Escopo.** Migração **nova** `domain_event_audit_outbox`: criar `private.domain_events`, `private.event_outbox` e `private.access_decision_events`; referenciar `public.audit_events`, `private.human_intervention_ledger` e `private.retrieval_audit_events` existentes, sem copiá-los como se fossem eventos novos. Funções **novas** `private.append_domain_event_v1`, `private.claim_event_outbox_v1` e `private.complete_event_outbox_v1` limitam escrita/consumo à transação ou capability correspondente. **Novos** contratos em `packages/domain-contracts/src/domain-event.ts`; consumidor de outbox em `apps/document-worker/src/event-outbox.ts`. Eventos carregam IDs, versão, ator, motivo, efeito e correlação; valores sensíveis ficam em snapshots protegidos.

**Transição e limpeza.** Uma transação grava mutação e outbox; a fila atual processa referências com idempotência. Preservar os ledgers históricos e retirar disparos de invalidação apenas em memória nos caminhos migrados. Nenhuma chamada de modelo ou dado financeiro bruto entra na telemetria comum.

**Pronto.** **Novo** `supabase/tests/domain_event_outbox.sql`: rollback não deixa evento órfão; retry não duplica efeito; worker interrompido retoma; usuário não altera/apaga audit; falha de gravação da trilha bloqueia mutação sensível. Migração aplicada em staging/produção, consumidor e alarmes verificados.

**Dependências, risco e resposta.** Depende da autoridade mínima de 1; pode anteceder a conclusão de 3. Se houver backlog, bloquear efeitos que exigem propagação concluída e operar leitura com revalidação síncrona. **Esforço M. Paralelo:** 2, 3 e 5. **Decisão:** nenhuma adicional.

## 5. Entidade e dossiê privado

**Recorte confirmado pelo fundador em 16/09/2026.** Entidade comum não aciona reutilização automática de memória privada de outro trabalho. Nesta etapa, o worker permanece no recurso delegado ao job; loaders de memória relacionada continuam sem conteúdo entre dossiês. A leitura humana exige autorização por dossiê. A memória pública exige identidade pública comprovada. Nas etapas 17/18, insumos adicionais serão declarados, delegados e revalidados sob o contrato de execução e dependências.

**Objetivo e conceito.** Identificar a companhia ou outro objeto econômico sem misturar suas memórias privadas entre organizações.

**Escopo.** Migração **nova** `entity_and_dossier_identity`: criar `public.entities`, `public.entity_identifiers`, `public.dossiers` e `public.dossier_entity_links`; identificação pública validada separada de atributos privados. Preservar `companies` como perfil privado legado e mapear seu ID ao dossiê. Entidades não públicas usam escopo de organização; tabela global só contém identidade comprovadamente pública. **Novos** contratos `packages/domain-contracts/src/entity.ts` e `dossier.ts`; RPCs `public.resolve_entity_candidate_v1`, `public.link_dossier_entity_v1`, `public.read_dossier_v1`. Adaptar `packages/public-research/src/company-memory.ts`, `save_project_company_context`, `save_project_company_profile` e loaders de memória relacionada.

**Transição e limpeza.** Criar vínculos por identificadores comprovados; nome semelhante gera candidato, nunca merge automático. `companies.id` e links de projetos existentes permanecem. Retirar busca de memória privada por primeiro token de nome; o adaptador usa dossiê autorizado. Remover heurísticas que confundem pasta com companhia. Não expor “outra organização também analisa esta entidade”.

**Pronto.** **Novo** `supabase/tests/entity_dossier_isolation.sql`: homônimas não se fundem; CNPJ público comum não compartilha dossiê; vínculos datados e perímetro preservados; mudança de identificador é revisada; usuário sem grant não descobre o dossiê. Migração/backfill idempotente conferidos nos dois ambientes.

**Dependências, risco e resposta.** 3 e 4. Identidade incerta permanece não resolvida e o trabalho continua no dossiê local. **Esforço M. Paralelo:** 6 e contratos de 13. **Decisão:** manter entidade pública e dossiê privado separados, já escolhida.

## 6. Fonte e versão imutável

**Objetivo e conceito.** Separar documento lógico, bytes de uma versão e usos desse documento em trabalhos/dossiês.

**Escopo.** Migração **nova** `logical_sources_and_versions`: criar `public.sources`, `public.source_versions` e `public.source_bindings`; manter `source_documents.id`, SHA, `document_profiles` e `document_layers` ligados à versão exata. Um documento reapresentado cria outra versão e nunca altera bytes antigos. **Novos** contratos `packages/domain-contracts/src/source-version.ts`; RPCs `public.register_source_version_v1` e `public.bind_source_version_v1`. Adaptar `register_intake_document_command`, `remove_intake_document_command`, parsers/extração e `apps/document-worker/src/queue.ts`.

**Transição e limpeza.** Upload legado registra source/version e mantém projeção `source_documents`; único comando escreve as duas representações na transação, não dois produtores independentes. Deduplicação por hash só reutiliza bytes dentro de escopo autorizado e não revela presença em outro tenant. Retirar atualização destrutiva de versão e referências por nome de arquivo. `document_intake_sessions` continua lote de ingestão.

**Pronto.** **Novo** `supabase/tests/source_version_identity.sql`: mesmo nome/bytes diferentes cria versões diferentes; retry dos mesmos bytes é idempotente; remover vínculo não apaga outras utilizações; OCR/planilha preservam página/célula; versão antiga continua citável por quem ainda pode lê-la. Backfill produz contagem/hash conciliados em staging/produção.

**Dependências, risco e resposta.** 3 e 5. Arquivo antigo sem hash verificável permanece `legacy_unverified`, sem fabricar âncora; verificação posterior gera evento e versão comprovada. **Esforço M. Paralelo:** 8 em contrato, 13 em autoria. **Decisão:** nenhuma adicional.

## 7. Direito de uso e recuperação antes do ranking

**Objetivo e conceito.** Fazer cada uso de fonte respeitar finalidade, licença, audiência, retenção e restrições herdadas.

**Escopo.** Migração **nova** `source_rights_and_authorized_retrieval`: criar `private.source_rights_versions` e `private.resource_dependencies`; associar direito versionado a `source_versions`, chunks e derivados. Criar RPC **nova** `public.search_authorized_resources_v1` e adaptar `search_case_retrieval`, `worker_load_retrieval_context`, `case_retrieval_chunks`, `house_playbook_chunks`, `governed_precedent_chunks` e `mandate_note_embeddings`. Alterar `packages/public-research/src/source-registry.ts`, `packages/governed-retrieval` e `queue.ts`.

**Transição e limpeza.** O direito descreve leitura, processamento, armazenamento, derivação, exportação, finalidade, prazo e evidência contratual; ausência de direito conhecido não se converte em público. Filtrar em SQL antes de ranking/snippet, revalidar antes de carregar conteúdo. Derivado conserva dependências e restrições cumulativas; o direito permitido é a interseção. Consolidar `retrieveGoverned` com o contrato real de busca e retirar o caminho de teste que parecia ser o runtime. Memória pública continua separada da interpretação privada.

**Pronto.** **Novo** `supabase/tests/source_rights_retrieval.sql`: licença expirada, finalidade incompatível, revogação durante busca, chunk de outro dossiê, direito de ler sem direito de exportar, derivado de duas fontes e direitos conflitantes. O item proibido não entra no conjunto candidato nem no cache. Medir índices/plano das consultas; migration e gates comuns nos dois ambientes.

**Dependências, risco e resposta.** 3, 4 e 6. Se contrato de uma fonte não estiver disponível, mantê-la desabilitada para uso que exige esse direito; arquivos próprios e fontes elegíveis sustentam o procedimento. **Esforço M. Paralelo:** 8 e 13. **Decisão:** nenhuma concessão comercial adicional é presumida.

## 8. Observação e definição, sem vencedor oficial por ranking

**Objetivo e conceito.** Registrar o que cada fonte afirma e em qual definição, antes de escolher a base de uma análise.

**Escopo.** Migração **nova** `observations_and_definitions`: criar `public.observations`, `public.metric_definitions` e `public.definition_versions`. Observação contém entidade/dossiê, perímetro, período, moeda, unidade, cenário, valor tipado, fonte/versão/âncora e estado de verificação. Definição de covenant referencia contrato e versão; métrica gerencial não a substitui. Alterar `packages/reconciliation/src/facts.ts`, `packages/credit-ontology`, `packages/document-intelligence` e contratos em `domain-contracts`. RPC **nova** `public.record_observation_v1`, sempre com autoridade de origem.

**Transição e limpeza.** `intake_field_candidates`, `evidence_facts` e `financial_line_items` tornam-se projeções/entradas legadas para observações. Ranking continua útil para sugerir leitura; não grava oficial. Alterar `FactKey` para impedir mistura de consolidado/individual, reais/milhares, períodos e definições diferentes. Retirar o comentário e o comportamento que tratam consolidado como “o número da companhia”. `extraction_feedback` propõe correção; confiança 0,95 não basta para adotar ou publicar.

**Pronto.** **Novo** `supabase/tests/observation_definition_contract.sql` e regressão de `reconciliation`: seis dimensões diferentes não colidem; candidatos conflitantes coexistem; fonte não é substituída por confiança; importação histórica mantém origem e não marca “oficial”. Migração e checks de cobertura em staging/produção.

**Dependências, risco e resposta.** 6 e contratos de 7. Se dado legado não permite resolver unidade/perímetro, estado permanece incompleto e cálculo que depende da distinção é bloqueado de forma explícita. **Esforço M. Paralelo:** 10 e 13 após contratos. **Decisão:** nenhuma adicional.

## 9. Adoção contextual e hipóteses de trabalho

**Objetivo e conceito.** Permitir escolher uma base para uma finalidade sem apagar observações divergentes nem transformar hipótese em oficial.

**Escopo.** Migração **nova** `contextual_adoptions_and_assumptions`: criar `public.adoption_decisions`, `public.assumption_sets` e `public.assumption_versions`; vincular `scenario_versions`, `structure_scenarios`, `claim_decisions` e `calculation_runs`. RPCs **novas** `public.adopt_observation_for_work_v1`, `public.propose_assumption_revision_v1` e `public.compare_adoption_bases_v1`. Alterar `case-understanding`, `financial-model` e componente **novo** `apps/web/src/components/advisor/evidence-difference.tsx`.

**Transição e limpeza.** O usuário pode usar sua contribuição no trabalho; o sistema mostra diferença frente à referência autorizada. A adoção pertence ao trabalho/finalidade/definição e grava ator, motivo e base anterior. Na ausência de seleção, o procedimento pode produzir uma base proposta explicitamente rotulada; dado conflitante material não vira confirmado por fallback. Legado recebe snapshot de adoção “base histórica da execução”, sem publicação retroativa. Retirar consumo downstream de `accepted` como verdade universal.

**Pronto.** **Novo** `supabase/tests/contextual_adoption.sql`: orçamento e realizado convivem; hipótese do usuário não altera cofre; covenant usa definição contratual; duas adoções concorrentes geram conflito/versionamento, não last-write-wins. Recalcular com adoção antiga reproduz valores; migração aplicada nos dois ambientes.

**Dependências, risco e resposta.** 8 e 4. Se uma revisão não informa sua base, comando rejeita e retorna diff permitido para nova submissão. **Esforço M. Paralelo:** 10 e 13. **Decisão:** nenhuma adicional.

## 10. Trabalho persistente sem companhia nem intake na entrada

**Objetivo e conceito.** Fazer a conversa nascer como trabalho próprio, que pode adquirir dossiês, documentos e novos objetivos sem recomeçar.

**Escopo.** Preservar `capital_projects.id` como identidade física do trabalho; a API passa a chamá-lo `workId`. Migração **nova** `persistent_work_without_intake`: criar `public.work_contexts` e `public.work_dossiers`; `company_id` já é opcional em `capital_projects`. Acrescentar vínculo direto de trabalho em `agent_conversations`, `agent_messages`, `processing_runs` e `processing_jobs`; tornar `intake_session_id` opcional onde conversa/execução não documental não o exigem, com CHECK por tipo. Criar RPCs **novas** `public.start_work_v1` e `public.append_work_turn_v1`; novo tipo de job leve de conversa funciona na fila existente sem intake. Ingestão documental conserva sessão obrigatória apenas para seu próprio tipo de job. `job_for_capability` e os comandos de claim/completion passam a resolver trabalho diretamente para o novo tipo, preservando os gates de aprovação dos jobs antigos.

Alterar `apps/web/src/app/[locale]/app/advisor-actions.ts`, `apps/web/src/components/advisor/advisor-start.tsx`, `advisor-project.tsx`, `workspace-rail.tsx`, `apps/document-worker/src/queue.ts`, `agent-operation-brief.ts` e `packages/work-plan/src/advisor-starting-plan.ts`. O contexto de trabalho contém finalidade, audiência desejada, prazo, nível de compromisso, serviços autorizados e estágio, sem cargo.

**Transição e limpeza.** `start_advisor_project_v1`, `start_advisor_project_in_group_v1`, `start_workspace_*` e outras entradas tornam-se adaptadores para o mesmo comando; IDs/URLs de projetos continuam válidos. Trabalho legado mantém intake associado. Novo trabalho recebe intake somente ao ingerir documentos; perguntar ou discutir alternativas não o cria. Retirar criação automática de pasta/sessão vazia e exigência universal de `claimedJobBase.intake_session_id`.

**Pronto.** **Novo** `supabase/tests/persistent_work_without_intake.sql` e `apps/web/e2e/persistent-work.spec.ts`: pergunta avulsa não cria `companies`, `document_intake_sessions` ou pedido documental; a conversa continua após logout/redeploy; pode associar um ou vários dossiês depois; upload posterior conserva o mesmo trabalho; todas as entradas antigas passam pela mesma ACL. Migração, worker e web verificados nos dois ambientes.

**Dependências, risco e resposta.** 2, 3, 4 e 5; pode desenvolver antes de concluir 9. Se executor legado exige intake, adaptador só o chama para trabalho documental que realmente o possua; a conversa sem documentos usa seu caminho próprio. **Esforço G. Paralelo:** 12–13 após contrato de trabalho. **Decisão:** reutilizar a identidade física de projeto, evitando uma segunda raiz de trabalho e migração desnecessária de IDs.

## 11. Participação, canais pessoais e contribuições sem sobrescrita

**Objetivo e conceito.** Preservar autoria individual e audiência de cada contribuição dentro do mesmo trabalho compartilhado.

**Escopo.** Migração **nova** `work_contributions_and_channels`: criar `public.work_participants`, `public.work_channels`, `public.work_contributions` e `public.contribution_revisions`. Conversas/mensagens ganham canal e autor humano explícito; papel `assistant` não encobre quem contribuiu. Participação aponta para grants de 3; não é uma segunda fonte independente de permissão. RPCs **novas** `public.add_work_participant_v1`, `public.submit_work_contribution_v1` e `public.promote_contribution_to_work_v1`. Alterar `advisor-project.tsx`, `advisor-work-surface.tsx` e **novo** `work-participants.tsx` em `apps/web/src/components/advisor`.

**Transição e limpeza.** Mensagens antigas preservam `created_by` comprovado e são projetadas no canal legado; autoria que não puder ser reconstruída permanece histórica, sem invenção. Novo participante vê apenas recursos compartilhados com ele; não recebe histórico pessoal automaticamente. Contribuição tem base/revisão e gera candidata; cenários são ramos de `assumption_versions`. Retirar edição compartilhada que sobrescreve o conteúdo de outra pessoa e renderização que confunde papéis com identidade.

**Pronto.** **Novo** `supabase/tests/work_contribution_isolation.sql`: A/B alteram a mesma base e preservam duas revisões; C entra depois e não lê canal pessoal; promover contribuição exige que todas as fontes permitam aquela audiência; revogar participante alcança canal e revisão derivada. E2E de duas sessões concorrentes e migration nos dois ambientes.

**Dependências, risco e resposta.** 3, 9 e 10. Se a base mudou, retornar comparação de três versões autorizadas; nunca resolver por última gravação silenciosa. **Esforço M. Paralelo:** 12 e 14. **Decisão:** revisão otimista e contribuição versionada; CRDT não é necessário para este protocolo e fica fora do núcleo.

## 12. Cofre com publicação exclusivamente humana

**Objetivo e conceito.** Tornar oficial somente o que uma pessoa com autoridade publicou para escopo e finalidade definidos.

**Escopo.** Migração **nova** `human_vault_publication`: criar `public.vault_entries`, `public.vault_entry_versions`, `public.vault_publication_requests` e `public.vault_publications`. Entradas referenciam fontes, adoções, diretrizes, templates e, depois de 14, releases de método; não duplicam bytes. RPCs **novas** `public.propose_vault_publication_v1`, `public.publish_vault_entry_v1` e `public.withdraw_vault_publication_v1`. Criar **nova** página `apps/web/src/app/[locale]/app/vault/page.tsx` e componente `vault-publication-review.tsx`; integrar contexto herdado do cofre à recuperação autorizada.

**Transição e limpeza.** Todo trabalho herda referências publicadas que consegue acessar. Upload, extração, resposta do usuário, adoção no trabalho ou job bem-sucedido podem gerar candidatura, nunca publicação. Importar versões legadas de playbooks e documentos com proveniência; somente as que têm ato humano comprovado podem conservar esse status, com referência à prova. As demais ficam como referências legadas/candidatas. Retirar ativação automática do “mais recente” como oficial e grants de publicação em principals de worker/modelo.

**Pronto.** **Novo** `supabase/tests/human_vault_publication.sql`: worker, colaborador sem alçada e criador revogado não publicam; humano autorizado publica versão exata; concorrência não muda silenciosamente a candidata; retirada preserva histórico e invalida uso futuro; trabalho com grant restrito não herda tudo do cofre. Busca só inclui a versão oficial e os rascunhos que o contexto explicitamente permite. Migration/gates nos dois ambientes.

**Dependências, risco e resposta.** 4, 7, 9 e 10. Se não houver curador designado, a entrada fica candidata e pode ser usada no trabalho com rótulo; não se inventa publicação. **Esforço M. Paralelo:** 11/13. **Decisão operacional:** a administração autorizada de cada organização designa seus publicadores no produto; não há ato adicional obrigatório do fundador.

## 13. Contrato de procedimento, autoria e manifesto compilado

**Objetivo e conceito.** Representar expertise proprietária em componentes legíveis, tipados, versionados e testáveis que o runtime consegue executar.

**Escopo.** Evoluir os arquivos existentes `packages/credit-playbook/src/procedure-contract.ts`, `procedure-markdown.ts`, `workflow-recipe.ts`, `method-runtime-manifest.ts` e `method-run-record.ts`. Criar **novos** `method-component.ts`, `procedure-compiler.ts` e `knowledge/procedures/capital/prepare-capital-structure-decision.md`. Este último já entra como primeiro procedimento candidato, com objetivo, entradas, saídas, suficiência, passos, definições, hipóteses, regras, revisões e exemplos; seu conteúdo profissional será completado pela Offroad em paralelo.

O contrato separa narrativa, fórmula executável, regra versionada, workflow, template e gate de qualidade; fixa executor/export, schemas de entrada/saída, dependências, ferramentas, efeitos, orçamento, direitos, pontos permitidos de override e invariantes. As óticas profissionais descrevem competência do procedimento, não perfil da pessoa. Manifesto inclui hashes de fontes, compilador, componentes, executores e evidências. Criar **novo** `packages/credit-playbook/knowledge/AUTHORING.md` com o molde operacional.

**Transição e limpeza.** Adaptar os 11 procedimentos Markdown existentes pelo parser compatível; manter a liberação comprovada de R01. Remover limites estruturais arbitrários de 12 estágios ou 3 chamadas como verdades universais; o limite passa a ser política explícita do procedimento e execução. `deterministic_pipeline` permanece uma opção executável, não a única forma de composição. Projeção compilada nunca é editada manualmente. Retirar registries duplicados após equivalência de IDs/hash; documentos históricos do playbook ficam identificados como históricos.

**Pronto.** Testes de `procedure-contract`, `procedure-markdown` e manifesto passam; **novo** `procedure-compiler.test.ts` rejeita dependência inexistente/cíclica, fórmula sem executor, output não tipado, regra sem versão e ferramenta fora do manifesto. Duas compilações da mesma fonte têm hash idêntico. Não há DDL nesta entrega; build de worker verificado em staging/produção preserva R01 e não ativa o candidato novo.

**Dependências, risco e resposta.** Contratos de 8–10; autoria pode começar após aprovação do plano. Se conteúdo profissional faltar, os testes de schema seguem, mas candidato não é publicado nem recebe selo de completo. **Esforço M. Paralelo:** 5–12 e preparação dos cálculos de 15. **Decisão operacional:** Offroad entrega e revisa o conteúdo; engenharia implementa o contrato e as provas, sem substituir autoria por prompt gerado.

## 14. Composição e publicação do método da Offroad e da casa

**Objetivo e conceito.** Tornar executável somente uma composição publicada, com precedência explícita e invariantes protegidas.

**Escopo.** Migração **nova** `published_method_releases`: criar `public.method_components`, `public.method_component_versions`, `public.method_releases`, `public.method_release_components`, `public.method_review_records` e `public.method_scope_bindings`. Escopos organizacionais são isolados; release padrão Offroad tem proveniência própria e publicação controlada, não leitura de dados de clientes. RPCs **novas** `public.submit_method_candidate_v1`, `public.publish_method_release_v1`, `public.bind_method_release_v1` e `public.retire_method_release_v1`. Criar **novo** `packages/credit-playbook/src/compose-method.ts` e UI `apps/web/src/app/[locale]/app/settings/method/page.tsx`.

**Transição e limpeza.** Compor padrão + overrides declarados por organização/unidade/tipo de trabalho; divergência da casa inclui motivo, origem e versão. Proteger lei, definição contratual, rastreabilidade, verificação e barreiras de acesso. `save_organization_methodology_v1` passa a criar candidata; `organization_methodologies` torna-se histórico/projeção. Retirar `resolveMethodology`/`methodologyChecks` antigos e shallow merge como mecanismo de método. Importar R01 com sua aprovação humana e manifesto, sem republicar por suposição. Publicação humana exige revisão técnica de conteúdo, testes vinculados e alçada, com separação de funções quando a política da casa exigir.

**Pronto.** **Novo** `supabase/tests/method_release_publication.sql` e `compose-method.test.ts`: override permitido vence e sua origem aparece; override de covenant/lei/invariante é rejeitado; concorrência de publicação não mistura componentes; worker não publica; teste desatualizado invalida candidata; execução em curso conserva release fixado. Migration/gates nos dois ambientes.

**Dependências, risco e resposta.** 3, 4, 12 e 13. Se release da casa é incompatível, bloquear aquela composição e mostrar conflito; usar padrão só quando o trabalho aceitar explicitamente essa mudança de método, nunca silenciosamente. **Esforço G. Paralelo:** 15 e 16 após contrato de release. **Decisão:** nenhuma adicional à designação dos revisores/publicadores.

## 15. Primeiro procedimento: alternativas de estrutura de capital para uma decisão

**Objetivo e conceito.** Realizar o trabalho aprovado de ponta a ponta no domínio financeiro antes de conectá-lo ao executor universal.

**Escopo.** Completar o candidato `prepare-capital-structure-decision` introduzido em 13 e sua implementação **nova** em `packages/financial-model/src/capital-structure-decision.ts`; integrar `credit-analysis`, `deal-structure`, `instrument-catalogue` e `market-reference`. Compor procedimentos existentes de dívida, juros/indexação, vencimentos, definições de covenants e cenários. Reaproveitar `apps/document-worker/src/capital-planning.ts` como adaptador, retirando a responsabilidade de inventar o processo no prompt.

O primeiro contrato entrega: situação e decisão a sustentar; base de fontes/adoções; calendário de dívida; caixa por período, giro, capex, tributos e serviço; alternativas aplicáveis; sensibilidades; restrições; custos e benefícios comparáveis; informação que muda a recomendação; material para decisão quando solicitado. Sempre inclui cenário de manutenção da estrutura quando economicamente válido. Projeção construída pela Offroad é hipótese editável marcada como tal; EBITDA não substitui capacidade de pagamento. Cotação, condições de mercado e tratamento fiscal não disponíveis aparecem como input pendente/hipótese explícita, nunca como fato calculado.

**Transição e limpeza.** Preservar a análise `capital_planning` atual sob adaptador protegido enquanto o candidato é testado. Usar fórmulas e tabelas versionadas; o modelo organiza contexto e explica resultados, sem calcular números narrativos por conta própria. Consolidar diferenças de catálogo de instrumentos no módulo consumido pelo procedimento e retirar defaults financeiros espalhados pelos prompts. “Comparar propostas” não é incluído nesta entrega, nem como requisito oculto.

**Pronto.** **Novos** `capital-structure-decision.test.ts` e conjunto sintético `packages/testing-fixtures/src/capital-structure-decision.ts`: verificação independente de fluxos e identidades de caixa, indexação e amortização; caso sem projeção; caixa negativo; falta de fonte; individual versus consolidado; covenant contratual; cenário da casa versus padrão; inputs e versões iguais produzem cálculos iguais. O procedimento passa pelas revisões e pelo ato humano de publicação de 14 para o escopo técnico autorizado. Ainda não há ensaio com usuário ou distribuição externa. Sem DDL adicional: publicação é comando auditado nos ambientes com artefatos e testes exatos.

**Dependências, risco e resposta.** 8, 9, 13 e 14; cálculos podem ser desenvolvidos em paralelo à UI do cofre. Se uma peça de expertise não estiver revisada, a publicação do procedimento completo espera essa peça; não se promove uma versão rasa com o mesmo nome. **Esforço G**, limitado à composição inicial e suas provas financeiras. **Decisão do fundador:** aprovação do conteúdo/método produzido pela Offroad, distinta da aprovação deste plano.

## 16. Gateway com matriz de retenção por conta, provedor, modelo e recurso

**Objetivo e conceito.** Impedir que uma execução ou fallback envie dados a uma combinação inelegível de processamento e retenção.

**Escopo.** Evoluir `packages/model-gateway/src/data-policy.ts`, `gateway.ts` e `policy.ts`; criar **novos** `retention-matrix.ts` e `resource-eligibility.ts`. Migração **nova** `provider_resource_retention_eligibility`: criar `private.provider_processing_assurances` e `private.processing_eligibility_decisions`. Cada linha atesta conta/projeto contratado, provedor, modelo ou família explicitamente coberta, endpoint, recurso usado, região aplicável, finalidade, classes/direitos permitidos, treinamento, retenção por categoria, elegibilidade ZDR, evidência, revisão e validade. Segredos ficam fora dessas tabelas.

Recursos incluem inferência, upload de arquivo, cache de prompt, batch/background, busca/ferramenta externa, embeddings e estado persistido do provedor. A configuração reconhece suportado, proibido e desconhecido; “desconhecido” não autoriza. Integrar todos os egressos reais: adapters de modelos em `apps/document-worker/src/main.ts`, pesquisa em `packages/public-research/src/index.ts` e aquisição em `content-acquisition.ts`. Logs/traces também respeitam classificação. Criar comandos administrativos **novos** `private.record_provider_processing_assurance_v1` e `private.revoke_provider_processing_assurance_v1`, com autoridade operacional, auditoria e sem upload de credenciais; worker/modelo não pode atestar a própria elegibilidade.

**Transição e limpeza.** A política atual, que já valida provedor, finalidade, classificação, uso para treinamento e `no_store`, é preservada como piso e substituída pelo lookup completo. Uma declaração antiga no nível do provedor não é automaticamente convertida em atestado de todos os modelos/recursos. Todo fallback é novamente avaliado antes da chamada, incluindo SDKs que tentam retry/fallback internos. Retirar chamadas diretas não registradas e caches que reutilizam decisões vencidas. Pesquisa pública recebe consulta publicável, sem trecho privado derivado do dossiê.

**Pronto.** **Novos** `retention-matrix.test.ts`, `resource-eligibility.test.ts` e `supabase/tests/provider_retention_eligibility.sql`: mesmo provedor com dois modelos/recursos diferentes; arquivo não elegível apesar de inferência elegível; atestado vencido; downgrade de classificação; fallback principal recusado/secundário permitido; principal falha/secundário incompatível gera bloqueio sem transmissão. Espião de transporte prova zero bytes enviados no caso negado. Atestados reais instalados apenas mediante evidência da conta/recurso; staging e produção com matriz versionada e no bypass.

**Dependências, risco e resposta.** 3, 4 e 7; deve terminar antes de 17 ativar o executor novo. Registrar e verificar as condições atuais de cada conta, provedor, modelo e recurso: não treinamento e retenção limitada, com prazos e exceções comprovados. Habilitar as combinações compatíveis com a política; desconhecimento ou incompatibilidade bloqueia aquela combinação. Acordos de retenção zero são evolução comercial futura, sem bloquear esta etapa; quando disponíveis, atualizar a matriz e verificar o recurso, sem mudar arquitetura. **Esforço G. Paralelo:** 13–15. **Decisão operacional:** Offroad valida os acordos/atestados; não há contratação presumida pelo plano.

## 17. Contrato de execução e adaptação à fila atual

**Objetivo e conceito.** Executar o procedimento publicado sob manifesto fixado, com sujeito, audiência, entradas, ferramentas, custos e efeitos delimitados.

**Escopo.** **Novo** `packages/agent-contracts/src/execution-contract.ts`; evoluir `packages/case-runner/src/runner.ts`, `packages/case-engine/src/engine.ts`, `apps/document-worker/src/main.ts`, `queue.ts`, `agent-plan.ts`, `specialist-method-runtime.ts` e `universal-dispatch-runtime.ts`. Migração **nova** `pinned_execution_contract`: criar `private.execution_manifests`, `private.execution_input_snapshots` e `public.work_executions`; relacionar `processing_jobs`, `processing_runs`, `capital_project_task_runs` e `controlled_case_executions`. RPCs **novas** `public.request_work_execution_v1`, `private.claim_work_execution_v1` e `private.commit_work_execution_result_v1`.

Manifesto fixa release/compilador/executor/fórmulas, fontes/versões/adoções/hipóteses, finalidade, audiência pretendida, requisitos de política e direitos, orçamento e efeitos permitidos. Autoridade histórica fica registrada para explicação; **acesso atual é reavaliado**, mesmo com manifesto antigo. Capability referencia essa execução e não amplia direitos. Resultado só é confirmado se lease, versão de entrada e autoridade continuam válidos.

**Transição e limpeza.** A fila de `processing_jobs` continua sendo o mecanismo de entrega. Adapters dos DAGs existentes gravam o contrato comum; R01 permanece preservado e o primeiro procedimento usa o novo contrato. `agent-plan.ts` deixa de ser um plano sem vínculo obrigatório ao executor. Retirar dispatch paralelo que escapa do manifesto e defaults ocultos de input. Cache de cálculo é reutilizado somente com mesmos hashes e direito de acesso vigente; cache não transfere audiência.

**Pronto.** **Novo** `supabase/tests/pinned_execution_contract.sql` e `execution-contract.test.ts`: procedimento não publicado é recusado; publicação nova não altera job antigo; ferramenta não declarada é negada; retry produz uma execução lógica; revogação durante cálculo impede gravação/liberação; orçamento vencido produz estado parcial explícito, não sucesso. O primeiro procedimento e R01 passam por regressão. Migração e rollout de worker nos dois ambientes, sem rota de preview como atalho.

**Dependências, risco e resposta.** 7, 9, 10, 14–16. Se executor legado não cumprir o contrato, permanece isolado na capacidade legada até ser adaptado; não recebe selo de conformidade. **Esforço G. Paralelo:** 19 pode preparar schemas/renderização enquanto 17 é concluída. **Decisão:** fila atual e um contrato de execução comum, já escolhidos.

## 18. Dependências, invalidação e continuidade na mesma conversa

**Objetivo e conceito.** Retomar trabalhos e atualizar somente o que mudou, preservando resultados e decisões anteriores.

**Escopo.** Migração **nova** `work_dependencies_and_continuity`: criar `private.execution_dependencies`, `public.work_milestones` e `public.work_continuation_requests`; integrar `dependency_invalidation_events`, `private.project_canonical_revisions`, `capital_project_information_requests`, `capital_project_execution_briefs` e suas decisões. **Novos** `packages/work-plan/src/continuation.ts` e `apps/document-worker/src/dependency-invalidation.ts`. RPCs **novas** `public.request_work_continuation_v1` e `public.adopt_work_update_v1`; eventos da outbox de 4 agendam recomputação na fila atual.

**Transição e limpeza.** Mudar fonte, adoção, premissa ou método gera impacto e candidata; nunca reescreve resultado aprovado. `resource_dependencies`, introduzida em 7, é o registro canônico de arestas de dependência; `execution_dependencies` é projeção tipada para planejar/inutilizar execuções, atualizada pela mesma transação/evento, sem escritor independente. Espera humana é estado persistido sem worker/lease preso. Mensagem “aprofundar o alongamento aprovado” vincula decisão e revisão anteriores, propõe o novo objetivo e conserva a conversa. Os adaptadores de `propagate_project_canonical_revision_v1` passam a usar o grafo comum. Retirar atualização por “última mensagem”, polling sem estado e recomputação integral quando a dependência é delimitada.

**Pronto.** **Novo** `supabase/tests/work_continuity_dependencies.sql`: reinício do worker, entrega duplicada, evento fora de ordem, concorrência de alterações, novo balancete, mudança de uma premissa e troca de método. Só descendentes afetados ficam stale; decisão antiga permanece imutável; retomar não repete efeito/custo já confirmado; espera humana resiste a deploy; evento perdido pelo consumidor é recuperado pela outbox.

**Dependências, risco e resposta.** 4, 11 e 17. Se grafo incompleto for detectado, marcar a saída inteira como stale e reconstruir dependências antes de reaproveitar; não apresentar reutilização incerta como válida. **Esforço M. Paralelo:** 19–20. **Decisão:** Temporal será avaliado e implantado depois deste núcleo, na evolução de continuidade; os testes aqui aprovam a fila atual, sem depender dessa compra/migração.

## 19. Protocolo único de artefato, blocos e derivação

**Objetivo e conceito.** Fazer cada resposta material e cada arquivo apontar para revisão, fontes, cálculos e audiência próprios.

**Escopo.** Migração **nova** `artifact_revision_protocol`: criar `public.artifacts`, `public.artifact_revisions`, `public.artifact_blocks` e `private.artifact_dependency_links`. Preservar `capital_project_artifacts`, `case_artifact_manifests`, `output_artifacts` e `output_versions` como origens/projeções históricas identificadas. Criar **novo** `packages/domain-contracts/src/artifact-protocol.ts`; alterar `case-materials`, `case-render`, `case-export` e incorporar gates de `evidence-compiler` em `case-materials`. RPCs **novas** `public.create_artifact_revision_v1` e `public.read_artifact_revision_v1`; leitor server **novo** `apps/web/src/lib/artifacts/authorized-artifact-reader.ts`.

O manifesto registra artefato/revisão/bloco, release de método, execução, input snapshot, claims, traces, formato/bytes/hash, proveniência e restrições derivadas. `artifact_dependency_links` ancora blocos/claims às arestas canônicas de `resource_dependencies`; não mantém uma segunda regra de herança. O menor resultado útil pode ser um bloco de resposta; não é obrigatório gerar um documento para toda conversa. Template visual existente em `presentation_templates` ganha estrutura semântica versionada e campos exigidos, com `presentation-template-settings.tsx` adaptado.

**Transição e limpeza.** Primeiro registrar/projetar revisões existentes sem lhes atribuir fontes desconhecidas; depois mover escrita nova ao comando comum. Rotas antigas de materiais/modelo/results/work-products chamam o leitor autorizado e resolvem revisão exata. Remover `output_versions_all` como acesso autônomo, serializadores com contratos concorrentes e, após migrar funções/testes/imports/lockfile, o pacote órfão `packages/evidence-compiler`. Nenhum byte antigo é descartado por esta consolidação.

**Pronto.** **Novo** `supabase/tests/artifact_revision_protocol.sql`: derivado de fontes A/B exige ambas; mudança de fonte não altera revisão antiga; revisão sem claim/fonte/cálculo material é bloqueada; hash do download coincide com manifesto; rota antiga e nova decidem igual; preview não contorna aprovação. Testes econômicos de renderização garantem igualdade dos números nos formatos. Migration/backfill nos dois ambientes.

**Dependências, risco e resposta.** 7, 9, 14 e 17; 18 pode correr em paralelo. Se artefato legado não tiver linhagem completa, rotulá-lo como legado com evidência disponível, sem fabricar vínculo. **Esforço G. Paralelo:** 18 e preparação de 20/21. **Decisão:** um protocolo de artefato para respostas e arquivos, sem apagar os identificadores históricos.

## 20. Revisão, aprovação e decisão sobre versão exata

**Objetivo e conceito.** Separar preparar, revisar, aprovar e decidir, sempre sobre o conteúdo e os efeitos que a pessoa realmente viu.

**Escopo.** Migração **nova** `revision_bound_reviews_and_decisions`: criar `public.artifact_reviews` e `public.work_decisions`; vincular `capital_project_review_assignments`, `capital_project_review_policies`, `capital_project_artifact_decisions`, `capital_project_decisions`, `private.institutional_revision_proposals` e aprovações de execution brief. RPCs **novas** `public.review_artifact_revision_v1` e `public.record_work_decision_v1`; adaptar `decide_capital_project_artifact`, `read_capital_project_review_context_v1` e `project-review-roles.tsx`; componente **novo** `artifact-revision-review.tsx`.

**Transição e limpeza.** A política explicita uso individual com autoaprovação permitida ou segregação exigida pela casa. Ausência de atribuição deixa de significar aprovação irrestrita. Comentário/revisão ancora bloco e versão; alteração material gera candidata com aprovação pendente. Decisão relatada pelo usuário registra relato e sua origem, não inventa ata. Aprovar análise não autoriza publicar no cofre nem enviar a terceiro. Retirar gates que dependem apenas de status global do projeto e aprovações transferidas automaticamente para revisão nova.

**Pronto.** **Novo** `supabase/tests/revision_bound_decisions.sql`: aprovador sem leitura da fonte não aprova derivado; preparador não aprova onde a casa proíbe; self-approval explícito funciona no trabalho individual; troca de bytes após aprovação é rejeitada; duas decisões concorrentes preservam histórico e precedência; revisão nova exige novo ato quando material. Migration e E2E de revisão nos dois ambientes.

**Dependências, risco e resposta.** 3, 11, 14 e 19. Se responsável sair, a revisão pendente é reassociada por comando auditado a elegível; aprovação passada conserva sua autoria. **Esforço M. Paralelo:** 18 e 21. **Decisão operacional:** a casa declara sua alçada; o padrão individual e o padrão com segregação são explícitos.

## 21. Exportação e reimportação governadas, antes de Office nativo

**Objetivo e conceito.** Permitir trabalhar com arquivos gerados e trazer alterações de volta como contribuições rastreáveis.

**Escopo.** Alterar `packages/financial-model/src/institutional-workbook.ts`, `institutional-formula-workbook.ts`, `packages/case-export/src/decision-workbook.ts`, renderizadores DOCX/PPTX e as rotas atuais `app/model/[sessionId]`, `app/materials/[sessionId]/[kind]/{docx,pptx,pdf}`, `app/projects/[projectId]/financial-results/[resultId]/[format]` e `work-products/[fingerprint]/[format]`. Criar **novos** `packages/case-export/src/artifact-roundtrip.ts` e `apps/web/src/components/advisor/artifact-import-review.tsx`. Migração **nova** `artifact_import_candidates`: criar `public.artifact_import_candidates` e RPC `public.submit_artifact_import_v1`.

XLSX preserva nomes estáveis para inputs/outputs, fórmulas e manifesto. DOCX/PPTX gerados preservam identificadores de blocos, propriedades e manifesto verificável. Reimportação compara base exportada, edição recebida e revisão atual. Célula ou texto editado vira contribuição humana, não conserva indevidamente a citação que o sustentava antes. Cálculo econômico é refeito pelo motor; resultado calculado pelo Office não é autoridade.

**Transição e limpeza.** Exportadores existentes passam pelo protocolo de 19. Suporte inicial cobre arquivos produzidos pela Offroad e regiões identificadas; arquivo arbitrário entra como nova fonte em 6. Manifesto adulterado ou estrutura perdida não recebe merge automático: produzir candidata e indicar blocos sem correspondência. Retirar exportações sem revisão/hash e lógica de download duplicada. Esta entrega não cria add-in nem sincronização invisível de edição livre.

**Pronto.** **Novo** `artifact-roundtrip.test.ts`: alterar premissa, apagar tag, alterar fórmula, copiar bloco, importar duas edições concorrentes, reimportar depois de revisão nova e de revogação; contribuição preservada sem sobrescrever; linhagem rompida é detectada; números mantêm identidade entre formatos. Arquivos exportados são abertos/renderizados e inspecionados tecnicamente. Migration, leitores e download/reimportação verificados em staging/produção.

**Dependências, risco e resposta.** 11, 19 e 20. Se editor remover metadados, tratar o trecho como contribuição sem vínculo recuperado; não aceitar assinatura/hashes como autorização de acesso. **Esforço G. Paralelo:** 22, com contratos de artefato estabilizados. **Decisão:** round-trip delimitado e verificável agora; Office nativo depois.

## 22. Auditoria, retenção e revogação de ponta a ponta

**Objetivo e conceito.** Provar que mudanças de autoridade e ciclo de vida alcançam todas as cópias e todos os usos controlados pela Offroad.

**Escopo.** Migração **nova** `end_to_end_revocation_and_retention`: criar `private.revocation_runs`, `private.revocation_targets`, `private.retention_rules`, `private.legal_holds` e `private.retention_actions`. Integrar events/outbox, grants/revisões de autorização, dependências, cache, pesquisa, tokens/capabilities, jobs, artefatos e Storage. **Novo** `apps/document-worker/src/retention-worker.ts`; ampliar `dependency-invalidation.ts` e `packages/release-governance`. RPCs **novas** `public.read_revocation_status_v1`, `public.export_authorized_audit_v1`, `public.set_retention_rule_v1`, `public.place_legal_hold_v1` e `public.release_legal_hold_v1`; página **nova** `apps/web/src/app/[locale]/app/settings/audit/page.tsx`.

Auditar leitura sensível, busca, processamento, publicação, revisão, download, negação e administração com ator/recurso/versão/política/resultado. Preservar integridade append-only no banco e exportar lotes assinados/hash para armazenamento de auditoria separado com retenção configurada na infraestrutura AWS existente. Hash sozinho não substitui controle de exclusão/administração do armazenamento. Não colocar conteúdo financeiro inteiro no log.

**Transição e limpeza.** Revogação passa a negar sincronicamente no ponto de uso, antes de a limpeza assíncrona terminar. Reindexação/eliminação física roda por outbox com recibo por destino. Job perde direito de ler/gravar/publicar; continuação sob outro responsável exige nova delegação explícita, nunca troca silenciosa. Retenção inclui documentos, camadas OCR, embeddings, derivados, caches e cópias temporárias; legal hold impede eliminação, sem restituir acesso normal. Retirar paths de leitura sem evento e TTLs privados não associados a política.

**Pronto.** **Novos** `supabase/tests/end_to_end_revocation.sql`, `apps/web/e2e/revocation.spec.ts` e testes de `retention-worker`: revogar em cada ponto entre busca, fetch, chamada de modelo, gravação e download; nenhum uso novo autorizado depois do commit da revogação; efeito externo já em curso não autoriza persistência/liberação posterior; cada alvo de limpeza tem estado verificável. Testar hold, expiração, purge, retry, dead letter e restauração de backup em staging sem reativar objeto revogado. Definir prazos operacionais mensuráveis por destino e alarmes; autorização não depende desses prazos. Migration, política de armazenamento e alarmes conferidos em produção.

**Dependências, risco e resposta.** 3–4, 7, 16–21. Se consumidor de invalidação falhar, negar acesso continua síncrono e backlog alerta; não considerar revogação operacional concluída sem recibo dos destinos. Arquivo já baixado por humano não é apagável remotamente: a prova registra o download e bloqueia acessos futuros. **Esforço G. Paralelo:** 21 e preparação do encerramento de 23. **Decisão operacional:** aprovar matriz de prazos/hold conforme contratos; sem prazo inferido para descartar documentos de clientes.

## 23. Retirar os caminhos antigos substituídos e fechar a superfície

**Objetivo e conceito.** Deixar uma única autoridade e um único caminho de escrita por objeto, com compatibilidade explícita apenas onde ainda há consumidor.

**Escopo.** Migração **nova** `retire_legacy_framework_paths`; revisar todas as assinaturas/políticas do inventário. Remover grants e depois funções sem consumidores comprovados; incluir wrappers `worker_load_agent_context_before_*`, variantes v2–v5 e `worker_load_capital_project_context_v2`–v6 somente quando o novo loader já substituiu suas cadeias reais. Funções ainda chamadas por wrapper/trigger não são órfãs. Encerrar escrita autônoma de `organization_methodologies`, de artefatos legados e de snapshots “accepted” como autoridade. Retirar entrypoints de preview do caminho de produção, mantendo fixtures, testes e ferramentas técnicas isoladas.

Consolidar `apps/document-worker/src/universal-dispatch-runtime.ts`, `specialist-method-runtime.ts` e dispatch de `main.ts` em adapters do contrato comum. Aplicar o checker de 0 na CI: qualquer rota/RPC/policy/grant novo exige classificação e teste de acesso. Atualizar `AGENTS.md`, `docs/build/BUILD_STATE.md`, `packages/release-governance` e docs de runtime para o estado demonstrado. Remover flags temporárias e módulos substituídos sem importadores; manter bibliotecas de fechamento/monitoramento congeladas para seu futuro escopo.

**Transição e limpeza.** Projeções históricas são somente leitura e usam a mesma autorização. RPC antigo com cliente ativo continua como adaptador fino com teste; só é removido quando telemetria de chamadas e grafo de dependência confirmam desuso durante uma janela que cubra consumidores agendados. Ausência de tráfego insuficiente não justifica DROP. Migrações aplicadas e evidência histórica permanecem. Distribuição exclusiva de staging não é promovida por arrasto.

**Pronto.** **Novo** `supabase/tests/no_legacy_access_bypass.sql`: inventário sem caminho não classificado, zero policy ampla remanescente para conteúdo privado, zero grant a endpoint retirado, zero rota que escreve objeto por autoridade antiga. Build sem imports dos módulos eliminados; replay de migrações preserva dados/modelos existentes; regressão de R01, trabalho legado e primeiro procedimento. Migration nos dois ambientes e inventário final atualizado.

**Dependências, risco e resposta.** 1–22. Se consumidor legítimo reaparecer, manter ou restaurar adaptador que usa o novo contrato, sem restaurar predicado antigo. **Esforço M. Paralelo:** preparar relatório final e casos de 24; remoção depende das provas. **Decisão:** nenhuma adicional.

## 24. Etapa final - o que significa “arcabouço montado”

**Objetivo e conceito.** Entregar prova integrada de que o núcleo está pronto para receber ensaios de produto, sem confundir aprovação técnica com validação comercial da experiência.

**Escopo.** Criar **novos** `packages/evals/src/framework-readiness.ts`, `apps/web/e2e/framework-readiness.spec.ts` e `docs/build/arcabouco/FRAMEWORK-READINESS.md`. O relatório fixa commit, schema/journal por ambiente, releases, manifests, fontes sintéticas/consentidas, hashes, grants, versões de worker/web, resultados e artefatos. Não há DDL funcional adicional; eventual correção volta ao incremento dono e ao seu teste, seguida da regressão afetada.

### 24.1 Verificações técnicas de aceite

| Prova | Resultado exigido |
| --- | --- |
| Identidade e organização | A mesma pessoa alterna entre espaços sem cruzar dados; vínculo revogado e cookie adulterado são recusados |
| Criador sem poder residual | Criador removido não se reinsere, não se promove, não gerencia nem lê conteúdo por criação histórica |
| Leitura por recurso | Membro sem grant, outra mesa, outra organização e admin de identidade sem grant não leem título, busca, snippet, fonte ou derivado |
| Barreira antes da busca | Documento negado não entra no conjunto candidato, reranking ou request ao modelo; não se revela pela contagem ou sugestão |
| Revogação completa | Negação síncrona após revogação em busca, cache, job e artefato; outbox comprova limpeza de índices/cópias controladas; token/URL anterior não reabre acesso |
| Cofre humano | Worker pode propor, mas somente humano autorizado publica; publicação fixa versão/escopo; alteração posterior não muda a referência anterior |
| Método e manifesto | `prepare-capital-structure-decision` publicado executa com manifesto fixado; fonte/método/compilador/executor novos não alteram execução anterior |
| Precedência da casa | Override permitido prevalece com origem; regra legal/contratual, direitos e verificação não são sobrescritos |
| Observação e adoção | Duas fontes e duas definições convivem; ranking sugere, adoção escolhe por finalidade; hipótese de trabalho não atualiza cofre |
| Trabalho sem intake | Conversa inicia sem companhia/documento, continua no mesmo ID e pode ganhar fontes, dossiês, participantes e decisão depois |
| Contribuição sem sobrescrita | Edições concorrentes conservam autoria/base; newcomer não recebe canal pessoal; merge gera revisão e registra decisão |
| Derivação restrita | Artefato que depende de fonte restrita herda restrição; retirar vínculo visual/citação não libera o derivado |
| Cálculo reproduzível | Inputs, definições, premissas, regras e executores fixados produzem os mesmos números e traces; tolerâncias só quando definidas no contrato |
| Narrativa verificada | Todo número material corresponde a fonte ou trace; uma resposta textual pode variar, mas não muda fatos/cálculos fixados nem inventa entrada ausente |
| Continuidade | Reiniciar worker/deploy e reenviar eventos retoma a mesma execução lógica; nova informação invalida somente dependentes e preserva decisões antigas |
| Gateway e fallback | Toda combinação conta/provedor/modelo/recurso é reavaliada; fallback inelegível é bloqueado antes de transmitir; classificação não é reduzida para caber no provedor |
| Artefato e Office por arquivo | Bytes/hash/revisão/claims conferem; edição reimportada vira contribuição; metadados perdidos não recebem falsa linhagem |
| Revisão e decisão | Aprovação vale para versão e efeito exatos; nova revisão material exige novo ato; aprovar material não autoriza publicar/enviar |
| Auditoria e retenção | É possível reconstruir autorização, método, fontes, cálculo, revisão e download; audit não pode ser alterado pelo cliente; hold/purge e restauração preservam revogação |
| Independência de cargo | Mesma demanda, dados, método e permissões produzem o mesmo contexto de raciocínio, plano/gates e cálculos, inclusive sem cargo cadastrado |
| Legado e ambientes | R01 preservado; projeções antigas obedecem à política comum; journals/DDL conciliados; nenhum recurso de staging é anunciado como produção sem implantação |

O percurso integrado usa o mesmo caso de **alternativas de estrutura de capital para uma decisão** desde a pergunta sem intake até fonte, divergência, adoção, execução, artefato, contribuição de segunda pessoa, revisão, nova premissa, retomada e revogação. Variantes técnicas mantêm companhia/CFO, assessor/banker e analista/gestor dentro da cobertura; mudam finalidade e audiência, sem derivar qualidade do perfil.

**Pronto.** Todos os critérios acima passam em staging na mesma revisão promovida; produção confirma schema, política, releases elegíveis, worker/web, auditoria e operações legítimas. O relatório distingue prova reproduzida em staging de checagem em produção. Não se declara integração privada a provedor homologada se só foi testada com transporte simulado: esse recurso permanece desabilitado até seu teste real, sem impedir a verificação do motor determinístico e dos contratos com fontes elegíveis.

**Limpeza.** Remover fixtures de qualquer configuração operacional, desabilitar acessos temporários de verificação e arquivar evidências em área protegida. **Dependências:** 0–23. **Risco e resposta:** uma falha de critério mantém o núcleo não aprovado tecnicamente e volta à etapa correspondente; não é deslocada para os ensaios com usuários. **Esforço M. Paralelo:** consolidação de documentação, sem antecipar aceite. **Decisão do fundador:** aceitar o relatório de prontidão e, numa rodada posterior, aprovar os ensaios de produto.

### 24.2 O que fica para depois

| Evolução posterior | O núcleo já entrega | O que será acrescentado |
| --- | --- | --- |
| “Comparar propostas” | Procedimento, regras, fontes, cálculos, artefatos e revisão comuns | Segundo procedimento profissional, com bases temporais e custos comparáveis |
| Ensaios de produto com usuários | Provas técnicas e percurso integrado sintético/consentido | Uso real acompanhado, avaliação de utilidade, fluidez, suficiência e custo por trabalho aproveitado |
| Office nativo | Exportação e reimportação governadas de arquivos produzidos pela Offroad | Add-ins Excel/Word/PowerPoint, edição localizada e implantação corporativa |
| Temporal | Continuidade e espera persistidas sobre fila atual, com contrato independente do scheduler | Adaptador Temporal e teste de paridade/retomada, sem mover estado financeiro ou documentos para histórico de workflow |
| Conectores de dados e identidade | Upload, direitos, versões, grupos/barreiras locais, deprovisionamento e interface de integração | ERP, Drive/M365, feeds licenciados, IdP/SSO/SCIM e sincronização de barreiras, conforme acesso/contrato |
| Intercâmbio entre organizações | Artefatos publicados e grants restritos, sem entrega externa nova | Pacotes/destinatários verificados, recebimento, feedback segregado e revogação bilateral; trabalho de staging é reavaliado nesse escopo |
| Monitoramento e fechamento | Marcos, eventos, dependências, decisões e bibliotecas preservadas | Procedimentos e integrações próprios, sujeitos à mesma publicação e prova |

## Sequência escolhida, paralelismo e pontos de aprovação

A sequência respeita os objetos do arcabouço com três ajustes de ordem: **segurança sai primeiro e não depende do redesenho; a trilha/outbox entra em 4 para registrar a própria construção; gateway entra em 16, antes de ativar o executor de 17**. Deixar auditoria e elegibilidade para o fim permitiria executar ou publicar sem a prova necessária. A Etapa 22 integra e comprova esses controles, não os inventa tardiamente.

| Frente | Sequência de integração | Trabalho paralelo permitido |
| --- | --- | --- |
| Segurança imediata | 1A, 1B e 1C independentes; 1B integra a autoridade corrigida de 1A | Inventário 0, testes negativos e remoção de perfil |
| Autoridade e dados | 2 → 3; 4 cedo; 5 → 6 → 7 → 8 → 9 | Autoria de 13 e cálculos de 15 sem acesso a dados privados |
| Trabalho e cofre | 10 → 11; 12 após fontes/direitos/adoção | UI de participação, publicador e contratos de método |
| Método e execução | 13 → 14 → 15; 16 antes de 17; 17 → 18 | Gateway e biblioteca financeira, compartilhando os contratos aprovados |
| Artefatos e encerramento | 19 → 20 → 21; 22 → 23 → 24 | Renderização/round-trip e testes de revogação, após protocolo estável |

Paralelismo significa branches e migrações com contratos combinados, não aplicar mudanças concorrentes e incompatíveis sobre staging. Cada entrega revalida main e journal antes de integrar. Não será criado um segundo motor de autorização, um segundo dono dos fatos ou uma segunda raiz de trabalho para acelerar a implementação.

A aprovação deste plano aprova o roteiro, não autoriza todas as etapas. A primeira onda compreende 0, 1A, 1B e 1C; cada onda seguinte depende de OK sobre a anterior. Os dois atos exclusivos do fundador são aprovar o conteúdo do primeiro procedimento e dar OK por onda. O backfill de 1B é automático; a administração de pessoas, perfis, acessos e publicadores pertence ao administrador autorizado de cada cliente, no produto. Na Etapa 16, registrar condições atuais comprovadas dos provedores; retenção zero é evolução comercial futura. A implementação das regras de retenção não exige um terceiro ato do fundador. A aprovação do núcleo não autoriza ensaios com usuários, novas contratações, distribuição externa ou promoção de capacidades fora do escopo.
