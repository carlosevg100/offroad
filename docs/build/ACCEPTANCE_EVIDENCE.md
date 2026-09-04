# Acceptance Evidence

## Polimento da entrada e correção do menu, 04/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Menu recolhível | ciclo completo em servidor local | recolhe e expande nas duas direções; o controle aparece sobre o símbolo no hover e no foco |
| Símbolo animado | render em 1180 px com animação pausada | anel a 104 px sobre o fundo que respira; `prefers-reduced-motion` desliga as duas animações |
| Rota privada | E2E reescrito | escolhida por anexo, que é o caminho real depois da remoção das sugestões |
| Horário dos cards | regra `react-hooks/purity` | carimbo absoluto no servidor; tempo relativo exigiria ler o instante atual durante o render |
| CSS morto | varredura após as remoções | regras de privacidade, sugestões e faixa de garantia removidas dos dois arquivos |
| Gate | `pnpm check` em Node 24 | lint, typecheck, testes e build verdes nos 43 alvos |

## Nome curto e entrada de acesso reescrita, 04/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Nome | `brand.ts`, manifest e catálogo de mensagens | `Offroad` em todo lugar; nenhuma ocorrência de `Offroad Capital` restante na copy dos dois idiomas |
| Contrato de identidade | `brand.test.ts` | título do navegador fixado no nome curto; categoria e frases proibidas seguem barradas |
| Copy de acesso | login e cadastro em servidor local | sem rótulo de acesso institucional, sem vocabulário interno de segregação de dados |
| Tipografia | painel de contexto em 1180 px | serif da marca; a frase fecha em quatro linhas em vez de seis fragmentos |
| Colisão preexistente | comparação com produção antes da mudança | o título do cadastro renderizava sob o link de voltar em produção; corrigido reservando a altura do link |
| Gate | `pnpm check` em Node 24 | lint, typecheck, testes e build verdes nos 43 alvos; 182 testes web |

## Casca e entrada do advisor refeitas, 04/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Estado do menu | cookie `offroad_rail_collapsed` lido no layout | servidor renderiza já na largura escolhida; sem piscar e sem divergência de hidratação |
| Lista plana | coluna `auto_created` + `supabase/tests/workspace_project_folders.sql` | gatilho marca, criação por pessoa não marca, rename limpa; teste passou em produção com rollback |
| Dados reais | quatro pastas ativas em produção | só a gerada pelo gatilho foi marcada; as três do usuário, incluindo uma com uma conversa só, seguem visíveis |
| Ensaio | branch `staging` | inutilizável, em `MIGRATIONS_FAILED` desde agosto e sem a tabela; achado P2-07 segue aberto |
| Advisors | Security Advisor após as duas migrations | nenhum achado novo; permanecem os dois INFO preexistentes de tabelas do schema `private` |
| Placeholder rotativo | sete exemplos, um por função | digita e apaga com o campo vazio, para ao primeiro caractere, respeita `prefers-reduced-motion` |
| Dica de jornada | quatro sugestões em texto | preservam `entryJobHint`, incluindo a escolha explícita da rota por documentos |
| CSS morto | varredura de classes usadas no TSX | 66 regras removidas, cada uma sem consumidor; chaves balanceadas nos dois arquivos |
| Render autenticado | rota de preview temporária em servidor local | expandido e recolhido em 1180 px; marca, lista, composer e continuar corretos; rota apagada no mesmo trabalho |
| Regressão | `apps/web/e2e/document-first-intake.spec.ts` | atualizado para a estrutura nova, cobrindo renomear, arquivar, criar pasta, abrir conversa e as duas jornadas com dica |
| Gate | `pnpm check` em Node 24 | lint, typecheck, testes e build verdes nos 43 alvos |

## Marca nova em site e plataforma, 04/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Origem única | `docs/brand/` + `scripts/generate_brand_assets.py` | dois arquivos governam a identidade inteira; variantes claras trocam RGB e preservam alfa, sem redesenho |
| Legibilidade do símbolo | tira renderizada em 16, 20, 24, 32, 48 e 64 px | contorno aberto e forma reconhecível como O em todos os tamanhos |
| Cabeçalho público | servidor local em 1440 px e 375 px | assinatura alinhada com a navegação, sem transbordo em nenhum dos dois |
| Robustez de layout | seis regras responsivas de `brand-mark` | ativo dimensionado por altura; proporção 27% mais alta não quebra cabeçalho |
| Higiene de ativos | `git rm` de nove PNGs + varredura de referências | nenhuma referência órfã em código, CSS ou manifest; apenas snapshots históricos citam os nomes antigos |
| Cache | `?v=4` nos ícones, `?v=6` no social, manifest `#0b0d0f` | usuários existentes recebem os ativos novos em vez do farol em cache |
| Gate | `pnpm check` em Node 24 | lint, typecheck, testes e build verdes nos 43 alvos |

## Identidade canônica e decisão ANBIMA, candidate, 02/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Fonte de verdade | Constituição 2.2 + ADR 0019 | categoria e descrição canônicas em PT-BR e EN-US; capacidades downstream não definem a empresa |
| Orientação de agentes | `AGENTS.md`, README e handoff vigente | descrição antiga removida; precedência explícita; snapshots antigos marcados como históricos |
| Projeção pública | `brand.ts`, JSON-LD, manifest, homepage e social asset | mesma identidade em metadata e copy; capability list substitui descrição estreita de originação |
| Regressão | `brand.test.ts` | 172/172 testes web; categoria, manifest e idiomas fixados; frases históricas proibidas no conjunto público |
| ANBIMA Data | source registry + decisão de fonte | fonte pública complementar, manual e sem falso mandato de financiador |
| ANBIMA Feed | documentação oficial + registry | Sandbox fictício separado de produção contratada; provider permanece desligado |
| Segurança | inspeção | nenhum segredo lido, copiado, versionado ou ativado; rotação indicada para o segredo exposto em imagem |
| Custo externo | inspeção | zero chamada à API ANBIMA e zero ativação de provider pago |
| Gate integral | Node 24, `pnpm check` | lint, typecheck, testes e build verdes nos 42 pacotes; Next.js gerou 32 páginas |
| Revisão visual | homepage local PT-BR e EN-US | título, hero e proposta canônica visíveis; sem overflow horizontal em 1265 px |

Status: **candidate local**. A identidade está corrigida no código e na orientação; publicação
depende do gate integral, revisão visual e deploy. A automação de ANBIMA Data permanece bloqueada
até validar termos aplicáveis ao recurso exato.

## Entrada instantânea no projeto, candidate, 02/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Caminho crítico | inspeção do server action | criação aguarda somente o RPC transacional do shell; enqueue roda em `after()` |
| Worker desacoplado | contrato de fila | `queue_advisor_initial_turn_v1` permanece idempotente e não participa da latência de navegação |
| Título repetido | teste SQL em staging | dois projetos homônimos criados numa chamada cada; segundo recebe sufixo determinístico |
| Replay | teste SQL em staging | o mesmo `request_id` retorna o projeto original sem duplicar memória ou trabalho |
| Isolamento | `conversational_advisor_workspace.sql` | outro tenant não lê projeto nem mensagem; transação de teste revertida |
| Segurança | Supabase Security Advisor | zero findings após a migration |
| Aplicação | Node 24 | web typecheck e 162/162 testes; build Next.js com 32 páginas |
| Repositório integral | Node 24 | lint, typecheck, testes e build verdes nos 42 pacotes |

Status: **candidate comprovado em staging**. A promoção exige CI verde, Vercel e medição do clique
até a rota do projeto em produção. O trabalho analítico posterior continua assíncrono e não faz
parte do budget de entrada.

## Planejamento de capital governado, candidate, 02/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Cobertura do plano | compiler + worker | 35 TaskSpecs exatas de `M01` a `S11`; dependências persistidas e final exige `S10` + `C11` |
| Instrumentos amplos | contrato e prompt | 11 famílias de dívida; mínimo de duas alternativas; recebíveis nunca é default obrigatório |
| Limite público | schema + quality gate | sem campo para sizing ou termos; detector recusa montante, percentual e spread propostos |
| Evidência | pesquisa oficial + allowlist | afirmação pública só mantém URL persistida; CVM/SEC vêm antes de discovery; ambiguidade abstém |
| Company Truth | 34 artefatos intermediários | spreading, dívida econômica, capacidade, pricing, garantias e sources & uses declaram `not_computable_public_only` sem base conciliada |
| Síntese | model gateway | uma chamada `capital_planning`; Sonnet 5 medium, fallback/shadow Terra medium; máximo 8k de saída |
| Custo de pesquisa | runtime | reserva dinâmica por provider e query; revisão de `S11` reserva US$ 0 externo e reaproveita pesquisa |
| Correção incremental | RPC + worker | decisão pelo fingerprint exato; `S11` invalidada; `C11`/`S10` reutilizadas; replay idempotente |
| Interface | Next server component | mapa, evidência, alternativas, comparação, recomendação, faltantes, fontes, tarefas e decisão no mesmo projeto |
| Runtime local | Vitest/TypeScript/ESLint | worker 83/83; public research 24/24; contratos/gateway verdes; web e worker tipados; web lint verde |
| Chamadas pagas | inspeção | zero chamadas pagas durante implementação e testes |
| Banco | migration `20260902033000` | escrita e ligada às RPCs v2; execução local bloqueada porque Docker não está disponível neste host |

Status: **candidate**. Não promover até reconstruir o banco, executar o teste SQL adversarial,
validar RLS/Advisors, inspecionar a tela e aprovar um gold case BR e um US. Este incremento não
prova estruturação privada, materiais institucionais, matching real ou introdução.

## Fundação de inteligência de dívida BR/US, candidate, 01/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Hierarquia de fontes | `source-registry.test.ts` | CVM/SEC lideram a cadeia; fonte licenciada só entra por ativação explícita e nunca supera regulador |
| Brasil e EUA | resolvedores oficiais | CD_CVM e CIK zero-padded preservados; candidato próximo fica ambíguo, sem escolha silenciosa |
| Privacidade | contratos e migration | query externa rejeita email, CNPJ e valor financeiro; cache global não recebe contexto privado nem atende projeto privado |
| Reuso público | `index.test.ts` | hit fresco evita provider call, mantém ordem, registra uma única atualização e mede chamadas evitadas |
| Aquisição segura | `content-acquisition.test.ts` | publisher permanece CVM/RI; redirecionamento privado é bloqueado antes do segundo request; Firecrawl usa zero retention |
| Worker | Vitest/TypeScript | 80/80 testes do worker e typecheck aprovados; cache conectado aos dois DAGs públicos |
| Public research | Vitest/TypeScript | 20/20 testes e typecheck aprovados |
| Web types | TypeScript | contrato dos dois RPCs novos compila no web app |
| SQL adversarial | `public_research_public_cache.sql` | teste escrito para capability, replay, promoção a privado e negação a `anon`; execução aguarda Docker/CI |
| Custo externo | inspeção | zero chamadas pagas; OpenAI Search e Firecrawl desativados por flag; providers licenciados sem ativação |

Esta evidência não promove a migration nem declara a plataforma completa. Banco reconstruído,
Security Advisor, E2E e gold cases BR/US continuam obrigatórios antes de produção.
## Persistência fail-closed do control plane, 01/09/2026

| Evidência | Verificação | Resultado atual |
|---|---|---|
| Snapshot real por execução | worker + RPC capability-bound | input congelado, relatório e manifesto precisam coincidir; compilador usa Claim Registry, reconciliação, cobertura, decisão, artefatos, mercado, segurança e custo; ausência vira blocker |
| Decisão independente | função privada SQL | banco reavalia os controles; worker não escreve `allowed` diretamente |
| Credenciamento restrito | registry privado append-only | produção com menos de 20 casos distintos é recusada; tenant não lê nem escreve |
| Invalidação persistente | triggers + ledger público tenant-scoped | source, input, Deal State e mudança humana canônica invalidam decisões posteriores |
| Material e Introduce | triggers de release | bindings exatos, acreditação vigente e ausência de invalidação posterior são obrigatórios |
| Imutabilidade e RLS | `operating_controls.sql` | casos de update/delete, capability forjada, escrita direta e leitura cross-tenant adicionados ao CI |
| Teste de unidade | worker/release governance | compilação conservadora, policy ausente e budget ausente cobertos sem rede paga |
| Banco reconstruído | [Quality run 33529805136](https://github.com/carlosevg100/offroad/actions/runs/33529805136) | verde: migrations do zero, RLS, adversariais, verticais, DAG e schema lint |
| Jornada integrada | [Quality run 33529805136](https://github.com/carlosevg100/offroad/actions/runs/33529805136) | E2E local com Supabase e Playwright verde |
| Produção | Supabase/Vercel/worker | não alterada |

O código implementa a contenção; ele ainda não prova qualidade institucional de uma vertical.
Nenhuma capacidade externa recebe maturidade `production` por esta migration.

## Control plane do pre-mortem, 01/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Acreditação estreita | testes de `@offroad/release-governance` | produção recusada sem procedimento, adversarial ou vinte casos reais distintos |
| Gate sem média | operating controls | mandato, claims, cálculo, cobertura, julgamento, artefatos, mercado, segurança, freshness e autoridade geram blockers tipados |
| Competência ≠ autoridade | teste de ação externa | capacidade em produção não libera destinatário sem autorização exata e fingerprint da lista |
| Invalidação transitiva | teste de dependency graph | nova ITR invalida dívida líquida, capacidade, claim de estrutura, term sheet, aceite e lender match |
| Falsa automação visível | teste de human intervention | minutos não capturados, causa recorrente e mudança canônica sem revisão bloqueiam a tese de automação |
| Policy por provider | testes de `@offroad/model-gateway` | primário incompatível não recebe dado; fallback só roda com assurance válido; ausência ou expiração falham antes da chamada |
| Dados classificados | typecheck do worker/classificação/extração | todas as chamadas reais declaram finalidade e classe; documentos e estado de case são `restricted` |
| Promoção endurecida | teste de rollout | `active` exige 2×10 casos reais disjuntos, aprovação externa e aprovação dos controles operacionais |
| Gate integral | `pnpm check`, Node 24 | 42 pacotes verdes; web 162, worker 85, gateway 22, release governance 11; Next.js compilou 32 páginas |
| Custo | execução desta validação | zero chamada de modelo, busca ou API paga |

O teste prova os contratos e suas transições. A seção acima cobre a persistência candidata, mas
ainda não prova um DPA/ZDR vigente, SSO/SCIM/DLP/DR, nem a qualidade institucional de qualquer knowledge pack ou
vertical. Esses pontos permanecem explicitamente pendentes na matriz do pre-mortem.

## Brasil–Estados Unidos e idioma contínuo, 01/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Uma verdade, dois idiomas | teste do switcher + rota autenticada | PT-BR/EN-US preservam projeto e query; o próximo turno carrega a locale atual sem criar outro caso |
| Plano localizado | `@offroad/work-plan` | todos os 80 TaskSpecs têm projeção EN-US; IDs, dependências e TaskRuns permanecem canônicos |
| Contexto do modelo | teste do worker | projeto iniciado em português recebe turno EN-US, histórico PT preservado e plano projetado em inglês |
| Jurisdição independente | `@offroad/credit-ontology` | BR, US e cross-border combinam moeda e framework contábil sem depender da língua da conversa |
| Evidência original | teste de schema | tradução referencia o fingerprint da fonte e não substitui o texto original |
| Material localizado | teste de schema | projeção em outro idioma conserva fingerprints canônico e econômico e expõe estado da tradução |
| Ponte conceitual | teste adversarial | conceito sem equivalente direto recusa alvo literal; CCB não pode ser promovida silenciosamente a “Note” |
| Knowledge governado | teste de schema | fonte, data, versão, status, jurisdição, confidencialidade e escopo são obrigatórios; conteúdo privado global é recusado |
| Packs mínimos | contrato | núcleo universal, Brasil, Estados Unidos e ponte BR–US são bilíngues; packs jurisdicionais exigem fontes datadas |
| Gate integral | `pnpm check`, Node 24 | 42 pacotes verdes; web 162, worker 82, ontology 29 e work-plan 29 testes; Next.js compilou 32 páginas |
| Custo | execução desta validação | zero chamada de modelo, pesquisa ou API paga |

O gate valida a fundação e a troca contínua da superfície conversacional. Não comprova o conteúdo
financeiro completo dos packs BR/US, equivalências revisadas uma a uma ou todos os materiais finais
em padrão institucional bilíngue. Esses itens continuam sujeitos a corpus, gold cases, revisão e
promoção individual.

## Missão universal, inferência de entrada e memória autorizada, 01/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Produto não ancorado em instrumento | `@offroad/credit-ontology` | missão aceita necessidades combinadas, múltiplas famílias de capital, fontes de pagamento, reforços e três regimes de evidência |
| Entrada sem default silencioso | home + `@offroad/work-plan` | nenhum atalho nasce selecionado; texto e anexos determinam o job e o atalho é apenas desempate |
| Caso Camil | teste determinístico | reunião + pitch + companhia é `origination_thesis`; não vira `capital_planning` nem autorização de distribuição |
| Linguagem externa protegida | `@offroad/agent-contracts` | “apresentar um pitch sobre” não autoriza contato; somente verbo externo com destinatário de mercado produz efeito governado |
| Contexto material | teste do roteador | originação aguarda audiência, resultado pretendido e relacionamento/exposição; respostas em turnos sucessivos liberam a execução |
| Memória antes da pergunta | teste do worker | projeto anterior da companhia entra no prompt antes do pacote de contexto e o worker não ativa o DAG enquanto faltam campos materiais |
| Menor privilégio | migration + teste RLS | memória usa a organização do capability, exclui o projeto atual e exige a companhia do pedido; a definição é protegida por regressão SQL |
| Estado visível | projeto web | painel mostra a pergunta de contexto, por que ela importa e “aguardando resposta” a partir da mensagem persistida |
| i18n e tipagem | TypeScript | web, worker, ontology, work-plan e agent-contracts aprovados em Node 24; catálogos PT-BR/EN-US atualizados |
| Gate integral local | `pnpm check`, Node 24 | lint, typecheck, testes e build aprovados nos 42 pacotes; Next.js compilou 32 páginas e o worker foi empacotado |
| Banco reconstruído | Quality `33518894896` | todas as migrations aplicadas; não interferência, verticais públicas, ativação semântica e lint dos schemas `public/private` aprovados |
| Jornada real | Quality `33518894896` | build web contra Supabase local e Playwright E2E aprovados; preview Vercel publicado |
| Gate integral no CI | Quality `33518894896` | lint, typecheck, testes e build aprovados novamente em runner limpo nos 42 pacotes |
| Custo da validação | execução local | zero chamadas de modelo, busca ou API paga |

Esta evidência valida a fundação e o primeiro caminho de originação. Não prova pesquisa pública
em paralelo, análise privada, estruturação, materiais, matching ou troca de plano de um projeto
existente. A migration passou pelo replay efêmero do CI, mas ainda não foi aplicada a staging ou
produção.

## Roteamento semântico e ativação governada de DAG, 01/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Roteamento sem custo | `@offroad/agent-contracts` | decisão de execução declara `modelRoutingCalls=0` e cobre executor, contexto ausente, caso privado, artefato já existente e comando governado |
| Executor exato | teste do worker | `company_debt_view` com companhia já persistida ativa o DAG selecionado sem chamar modelo |
| Linguagem livre | teste do worker | a chamada conversacional já orçada normaliza “CVC” e ativa somente `origination_thesis`; não existe segunda chamada de roteamento |
| Base de evidência | contrato e migration | nome precisa estar no perfil ou nas mensagens do usuário; nome genérico é recusado; documento privado nunca entra no executor público |
| Atomicidade | `worker_record_agent_response_and_activate_v1` | resposta, perfil, brief e job especializado compartilham uma transação; falha não deixa mensagem afirmando execução inexistente |
| Idempotência | teste SQL novo | replay preserva um brief e um job, reanexa os metadados e mantém estado coerente |
| Menor privilégio | função capability-bound | organização, sessão, projeto e plano vêm do job; token incorreto falha fechado; nenhuma autoridade externa é ampliada |
| Orçamento | payload e run persistidos | originação: até 2 chamadas/US$ 0,75; company debt view: até 2 chamadas/US$ 0,95; reservas de busca preservadas |
| Testes locais | Vitest/TypeScript | agent contracts 17/17; worker 76/76; typecheck do worker verde; zero API paga |
| Banco reconstruído | Quality `33506053970` e `33506895933` | todas as migrations aplicadas do zero; teste de ativação obrigatório cobre atomicidade, replay, identidade inventada e capability incorreta |
| Staging | Supabase `lxmpsxwlpmfisbauakaz` | predecessor `company_debt_view` reconciliado em `20260901121555`; ativação em `20260901121603`; teste remoto aprovado com rollback |
| Produção | Supabase `ifnogpksgdadruooqydi` | migration `20260901122420`; teste remoto aprovado; wrapper para `authenticated`, negado a `anon`; função privada negada ao tenant; zero dado de teste residual |
| Advisors | staging e produção | zero security findings; performance somente com informações históricas de índices sem uso e configuração de Auth, sem warning/error novo |
| Rollout | PR #341 + PR #342 | worker `33506612853` estável no ECS; Vercel de produção verde; teste SQL agora obrigatório no CI |

Esta evidência prova o roteamento e o handoff governado somente para duas verticais públicas já
implementadas. Não promove análise privada completa, estruturação, materiais, matching ou
introdução.

## Workspace conversacional persistente, 01/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Uma raiz de projeto | schema e RPC | projeto, sessão de evidência, plano imutável e conversa são criados numa única transação |
| Entrada única | home autenticada | sugestões apenas preenchem o composer; texto e anexos iniciam o mesmo projeto |
| Reabertura das verticais | rota de projeto | análises públicas existentes abrem no projeto conversacional e o work product continua acessível pelo painel |
| Latência percebida | ação e cliente | projeto é persistido antes de análise; loading aparece no clique; nenhuma chamada de modelo bloqueia a navegação |
| Memória | tabelas existentes | transcript, documentos, plano e artefatos permanecem vinculados ao mesmo `capital_project_id` |
| Turno real | RPC + worker | mensagem é persistida e enfileirada; uma única chamada limitada produz resposta sem bloquear a navegação |
| Contexto mínimo | teste do worker | somente memória do projeto, inventário documental, plano, artefatos e últimas 12 mensagens; sem conteúdo integral do documento |
| Idempotência | teste SQL em staging | replay do primeiro pedido e da fila não duplica projeto, sessão, conversa ou trabalho |
| Isolamento | teste SQL em staging | outro tenant não lê projeto nem mensagens e não consegue continuar o projeto |
| Confidencialidade | RPC privada | trabalho privado exige aceite organizacional vigente dos termos |
| Sem representação implícita | schema, RPC e teste | upload/promoção privada mantêm `representation_status = not_claimed`; nenhuma evidência de representação é criada |
| Introdução separada | ADR e contrato existente | representação permanece no release exato de projeto, material, identidade e destinatários |
| Banco | Supabase staging `lxmpsxwlpmfisbauakaz` | migrations `20260901103125`, `20260901104739` e `20260901104905`; teste dedicado aprovado com rollback |
| Advisors | Supabase staging | zero security findings; nenhum aviso de performance introduzido pela feature, apenas informações históricas de índices sem uso |
| Banco de produção | Supabase `ifnogpksgdadruooqydi` | migrations canônicas `20260901112115`, `20260901112122` e `20260901112129`; wrappers presentes, execução anônima negada e schema compatível com a aplicação anterior |
| Advisors de produção | Supabase Security/Performance Advisor | zero security findings; somente informações históricas de índices ainda sem uso |
| Gate integral | Quality `33501504771`, Node 24, 42 pacotes | banco, 9 jornadas E2E e `pnpm check` verdes; web com 160 testes, worker com 74 e build de produção compilado |
| Custo | execução desta validação | zero chamadas de modelo e zero pesquisa externa paga |
| Rollout | PR #339 + PR #340 | schema e aplicação promovidos; Quality final `33503989459`, worker estável e Vercel de produção verdes |

A evidência comprova o contrato de memória, a entrada e a fronteira legal. Ainda não comprova a
qualidade das respostas conversacionais nem a integração de todas as verticais ao roteador do chat.
Esses itens continuam bloqueando a declaração de advisor completo, não a promoção desta fundação.

## Entendimento preliminar e gate P0, 31/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Ordem única | workflow, ações e roteamento | companhia → operação + documentos preliminares → entendimento → confirmação → lista sob medida |
| Entrada sem redigitação | gate web, ações e teste do worker | texto ou documento destravam a leitura; material ancorado preenche objetivo e montante; ausência vira ponto aberto |
| Capacidade isolada | tipo de job e contratos da fila | `preliminary_analysis` é distinto de `case_analysis`; payload exige `analysis_scope=preliminary_understanding` |
| Menor privilégio | migration e teste RLS estendido | capability preliminar carrega apenas sessão, candidatos e documentos; full case e retrieval devem falhar fechado |
| Pesquisa pública | `@offroad/public-research` | cinco tópicos independentes em paralelo; fallback por tópico; ordem determinística; nenhuma informação financeira privada aceita na query |
| Compilação estreita | teste do worker | exatamente uma tarefa de modelo; nenhum Deal State, estrutura, material, mandato ou controlled execution |
| Decisão auditável | schema e RPC | fingerprint exato, versão, confirmação ou correção, ator e horário; escrita direta do tenant negada |
| Próximo passo correto | ação web | confirmação compila a lista do playbook e retorna à coleta; correção volta à companhia/operação |
| Case antes da estrutura | engine, UI e Deal State | análise profunda compila o dossier rastreável; somente o aceite do fingerprint exato enfileira estruturação |
| Discussão do case | UI, evento e prompt | usuário abre o Markdown antes do aceite, registra o que está errado e dispara nova versão; comentário orienta a revisão, mas não substitui evidência nem sobrescreve cálculo conciliado |
| Aceite atômico | RPC e RLS | countersignature do snapshot do worker e criação da oportunidade ocorrem na mesma transação; tenant não autoria o case |
| Materiais depois do plano | engine e teste | estrutura confirmada sem plano de produção continua com teaser, modelo, term sheet e data room bloqueados |
| UI | PT-BR e EN-US | companhia, operação, contexto setorial, fontes, pontos abertos e confirmação/correção em tela própria |
| Testes locais | runtime disponível nesta máquina | worker 65/65, pesquisa pública 5/5, web 155/155, case understanding 53/53, case engine 32/32, case runner 12/12 e evals 38/38; lint e typechecks verdes |
| Build local | Next.js e worker | build do worker aprovado no gate integral; build de produção do web aprovado separadamente, com 28 páginas estáticas e a nova rota dinâmica do case |
| Gate integral local | 42 pacotes | lint 42/42, typecheck 42/42, testes 42/42 e build 42/42 verdes; Next.js compilou a rota Markdown e o worker foi empacotado |
| Custo | execução local | zero chamadas pagas; teto projetado da primeira leitura: uma chamada de modelo e até cinco buscas |
| Banco e RLS | branch Supabase de staging | migration aplicada; teste adversarial integral `rls_non_interference.sql` aprovado; RLS habilitado e forçado; zero alertas no advisor de segurança; FKs cobertas por índices |
| Gate integral sem cache | Node 24, 42 pacotes | 168/168 tarefas aprovadas em 1m04s, incluindo lint, typecheck, test e build; nenhum resultado foi reutilizado do cache |
| Rollout | git/staging/produção | banco validado somente no branch de staging; produção não foi alterada e a capacidade permanece candidate até PR, preview e smoke tests verdes |

Esta evidência prova o isolamento e a ordem do primeiro entendimento no código. Ainda não prova a
qualidade institucional da análise profunda, do case, da estrutura ou dos materiais finais.

## Destinatário e autorização exatos, 29/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Shortlist não distribui | schema e UI | aprovação do match cria targets privados; nenhum recipient ou contato externo é criado pelo cliente |
| Procedência do financiador | targets e recipients | diretório de mercado e provedor cadastrado preservam IDs e relações distintas sem identidade sintética |
| Contato nominal | RPC privada de resolução | exige contato ativo da instituição exata, e-mail válido, data, nota, revisor e mandato sem drift |
| Material por destinatário | manifest persistido | cada recipient carrega lista não vazia de materiais vinculada ao fingerprint do pacote |
| Revisão técnica independente | ACL e catálogo de funções | função pública removida; apenas `service_role` atesta o fingerprint exato |
| Autorização da companhia | `authorize_qualified_introduction_plan` | owner/admin com representação verificada autoriza snapshot com instituição, contato, mandato e materiais exatos |
| Release passivo | `record_qualified_introduction_release` | serviço apenas registra entrega já realizada; canal e referência externa são obrigatórios; cliente não executa |
| Drift fechado | trigger de release | mudança em contato, material, identidade, mandato, caso ou autorização bloqueia o registro |
| Idempotência | comando de release | mesma referência devolve o mesmo ID; referência diferente para recipient já registrado é recusada |
| Performance | Supabase Performance Advisor | zero foreign keys sem índice nas novas relações de targets |
| Segurança | Supabase Security Advisor | zero lints depois das quatro migrations |
| Gate local | `pnpm check` | 42 de 42 tarefas verdes; mensagens, lint, typecheck, testes e build aprovados |
| Ambiente | Supabase staging `lxmpsxwlpmfisbauakaz` | schema aplicado; zero planos, targets resolvidos, recipients e introduções; produção não alterada |

O teste positivo integral continua deliberadamente bloqueado porque não existe política ativa de
distribuição no staging. Não foi criado default artificial para fazer o fluxo passar. A política
deve nascer de decisão institucional explícita.

## Deal State, gates e contenção de custo, 29/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Estado persistente | schema e contratos TypeScript | objetos versionados, fingerprintados e tenant-scoped para entendimento, estrutura, produção, materiais, matching e autorização |
| Dependência exata | RPC append-only e testes SQL | downstream aceita somente os fingerprints upstream declarados; versão alterada não atravessa o gate antigo |
| Idempotência | replay SQL em staging | retry exato retorna o mesmo ID; replay do worker não supersede confirmação ou aprovação existente |
| Diagnóstico econômico | teste E2E do worker | zero chamadas de modelo, zero gasto e nenhuma recuperação de mandatos antes dos gates |
| Gate de materiais | contratos e teste E2E | exige entendimento confirmado, estrutura confirmada e plano de produção aprovado |
| Gate de matching | contratos e teste E2E | exige pacote aprovado; nenhuma identidade ou shortlist é produzida antes disso |
| Gate de introdução | contratos e teste E2E | exige autorização explícita vinculada ao fingerprint do pacote aprovado |
| Persistência do worker | teste de pipeline | entendimento e findings são gravados primeiro; objetos posteriores aparecem somente conforme os gates |
| RLS de staging | transação tenant-scoped | SELECT isolado por organização; INSERT e UPDATE diretos negados; cross-tenant bloqueado |
| Advisors | Supabase staging | zero security lints; somente avisos de índices novos ainda sem uso |
| Testes focados | domain-contracts e document-worker | 5 testes de contrato e 59 testes do worker verdes |
| Gate integral local | `pnpm check` | 42 de 42 pacotes verdes em lint, typecheck, testes e build |
| CI do PR #314 | jobs obrigatórios | database 1m43s, E2E 3m28s, quality 6m09s e Vercel verdes |
| CI pós-merge | `main` | banco e RLS, E2E e quality novamente verdes; worker promovido e estável no ECS |
| Produção, schema | Supabase `ifnogpksgdadruooqydi` | migrations `20260829154103`, `20260829154114` e `20260829154126`; ledger vazio, RLS e FORCE RLS ativos, sem acesso anônimo ou escrita direta do tenant |
| Produção, advisors | Security e Performance Advisors | zero security lints; somente índices novos ainda sem uso e avisos preexistentes |

A execução manual em staging havia encontrado uma inconsistência num cenário legado de governed
retrieval. A reconstrução limpa do CI aplicou todo o histórico e aprovou a suíte integral de RLS
tanto no PR quanto depois do merge. Docker continuou indisponível nesta máquina, mas deixou de ser
um bloqueio porque os dois ambientes efêmeros independentes do CI passaram antes da promoção.

## Fronteira executiva e feedback pós-introdução, 29/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Sete fases | teste de `product-workflow` | ordem exata de `Understand` a `Capture Feedback`; cada estado detalhado pertence a uma única fase |
| Fronteira de responsabilidade | contrato e teste | análise diagnóstica, estrutura indicativa, materiais, matching e introdução pertencem à Offroad; underwriting, proposta final, funding e monitoring pertencem ao financiador |
| Ledger de feedback | schema e contrato TypeScript | seis sinais permitidos, fonte e verificação obrigatórias, recusa com motivo e solicitação adicional com contagem |
| Correção auditável | gold de supersessão | sinal positivo depois de recusa é recusado sem supersessão explícita; evento original permanece preservado |
| Lender graph | projeção por fundo e mandato | comportamento observado permanece separado da política declarada e conserva fingerprint do mandato |
| Métricas | gold de outcomes e marcos | duração, precisão, aceitação, avanço, retrabalho, proposta e funding usam denominadores e valores exatos |
| Uma fonte de progresso | projeção de milestones | marcos vêm somente de eventos `succeeded` de `processing_runs.stages`; não existe ledger paralelo |
| Isolamento | extensão de `rls_non_interference.sql` | tenant lê o próprio feedback, não insere diretamente, não altera ou apaga e não acessa outro tenant |
| Staging | Supabase branch `staging`, ref `lxmpsxwlpmfisbauakaz` | migrations `20260829135415`, `20260829135516` e `20260829140352` aplicadas; RLS e FORCE RLS ativos; somente SELECT para authenticated; RPC e projeção privada presentes |
| Smoke tenant-scoped | transação com rollback em staging | introdução autorizada, recusa e correção no mesmo timestamp; bypass sem supersessão bloqueado, correção explícita preservada e UPDATE direto negado |
| Advisors | Security e Performance Advisors | zero security lints; FK de `recorded_by` coberta; apenas unused-index notices esperados numa tabela nova e vazia |
| Gate local focado | Node 24.19.0 | `market-feedback`: 6 testes; `case-understanding`: 52 testes; typechecks verdes |
| Gate integral local | `pnpm check`, Node 24.19.0 | lint, typecheck, testes e build verdes nos 42 pacotes |
| CI do PR #313 | jobs obrigatórios | database 1m43s, E2E 3m23s, quality 5m35s e Vercel verdes |
| Produção, schema | Supabase `ifnogpksgdadruooqydi` | migrations `20260829141835`, `20260829141838` e `20260829141841`; ledger vazio, RLS e FORCE RLS ativos, sem INSERT/UPDATE/DELETE direto, RPC e rollup presentes |
| Produção, advisors | Security e Performance Advisors | zero security lints; somente três unused-index notices esperados antes do primeiro feedback real |
| Promoção final | squash merge e deploy Vercel | requerida antes de declarar esta capacidade disponível no produto |

Esta entrega implementa a fronteira e a captura de outcomes. Ela não afirma que estruturação,
materiais ou matching já atingiram padrão institucional de ponta a ponta; essas capacidades
continuam sujeitas aos gates verticais do build profundo.

## Fluxo canônico e fundação da construção profunda, 29/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Sequência única | `docs/product/PRODUCT_WORKFLOW.md` | estados 0 a 11, quatro gates e fronteiras de responsabilidade definidos sem colapsar entendimento, estruturação, materiais e matching |
| Medição do playbook | inventário da fonte e dos registries | 270 entradas, 224 procedimentos compilados, 224 `candidate` e zero `production` |
| Auditoria de profundidade | inspeção de executores e truth sets | registries não são executados como unidades; cobertura nominal e qualidade institucional foram separadas |
| Transições | testes de `product-workflow` | saltos indevidos entre estados são recusados |
| Afirmações | validação das sete classes | confirmado exige evidência; calculado exige cálculo; divergente exige fontes conflitantes, impacto e próxima ação |
| Snapshot | fingerprint e versão | mesma base produz fingerprint determinístico; alteração de claim produz nova versão |
| Esclarecimentos | prioridade e limite | bloqueios da operação antecedem os demais e o lote atual nunca excede cinco itens |
| Atualização incremental | grafo de dependências | apenas a afirmação alterada e seus dependentes transitivos ficam inválidos |
| Gate analítico | requisitos explícitos | cobertura e findings abertos são avaliados por contrato, não por um percentual cosmético |
| Adapter de recebíveis | gold do `case-engine` | relatório governado produz snapshot com classificação, métricas, fatos, defeitos e perguntas; gravame comprovado é finding crítico confirmado |
| Fronteira da projeção | inspeção e teste | nenhum claim de financiador ou shortlist; estrutura, materiais, matching e introdução permanecem bloqueados |
| Promoção de procedimento | teste do `credit-playbook` | maturidade `production` é recusada sem executor, saída, persistência, conexão com produto, golds, adversariais, E2E e avaliação de custo |
| Testes focados | Node 24.19.0 | `case-understanding`: 51; `case-engine`: 30; `credit-playbook`: 162 testes verdes, além dos typechecks |
| Gate integral | `pnpm check`, Node 24.19.0 | lint, typecheck, testes e build verdes nos 41 pacotes após a projeção de recebíveis |

Esta evidência aceita somente a fundação dos estados 3 e 4. Ela não acredita entendimento
setorial completo, alternativas de estrutura, materiais institucionais, matching ou distribuição.
Cada capacidade será promovida separadamente após atravessar a fatia vertical, a persistência, a
interface e os casos gold e adversariais definidos no plano de construção profunda.

## Vertical de recebíveis, trilho real de produção da Fase 7, 28/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Entrada real | teste do document worker | CSV/XLSX/XLS passa pelo parser da fila e produz fragmento canônico; ZIP é aceito somente como pacote fiscal NF-e não vazio |
| Persistência imutável | codec + migration | payload `gzip-json-v1`, SHA-256 e tamanho verificados; replay idêntico é idempotente; conflito de bytes na mesma versão é recusado |
| Escopo do caso | RPC capability-bound | o worker carrega somente documentos atuais da organização e sessão do job; capability forjada e outro case falham |
| Reconstrução | gold entregue pelo caminho do worker | títulos reais são reconstruídos dos fragmentos, sem objeto `receivables_case` artesanal e sem consultar fixture reservado |
| Ausência não é zero | eval de 34.397 títulos | histórico de eventos não entregue permanece `not_provided`; nenhuma taxa de evento é fabricada |
| Universo de capital | provider context privado | bancos, financeiras, SCDs, factorings, FIDCs, fundos privados, family offices, institucionais e buyer-sponsored são adaptados por programa exato |
| Verdade de mandato | observações versionadas | política sem observação exata permanece inferência de mesa; apetite e capacidade dependem de fonte vigente permitida |
| Fronteira pública | teste integrado do worker | identidade de programa aparece no relatório privado e não aparece no snapshot da companhia; aprovação de crédito e saída externa permanecem falsas |
| Interface | web PT-BR e EN-US | painel apresenta títulos, saldo, prazo, concentração, achados, cobertura e próximo lote; estado sem valor pretendido é explícito |
| Gate integral local | `pnpm check`, Node 24.19.0 | lint, typecheck, testes e build verdes nos 41 pacotes; worker 51 testes, web 135, evals 38; Next.js e bundle do worker concluídos |
| Banco local | `supabase db reset` | não executado: a máquina não possui Docker. Não é aceite; o job obrigatório de banco no PR precisa reconstruir o schema e aprovar RLS e lint |
| Segurança estática | `git diff --check` e busca de segredos | diff sem whitespace inválido; nenhum token OpenAI, Anthropic ou Resend encontrado nos arquivos do incremento |
| Banco em CI | PR #300, run `33201518095`, job `98951932689` | todas as migrations aplicadas do zero; `rls_non_interference.sql` e lint dos schemas `public` e `private` aprovados em 1m52s |
| Jornada no navegador | PR #300, run `33201518095`, job `98951932682` | stack Supabase limpa, build contra o stack local e suíte Playwright aprovados em 3m24s |
| Quality em CI | PR #300, run `33201518095`, job `98951932357` | lint, typecheck, todos os testes e builds dos 41 pacotes aprovados em 6m06s |
| Preview | Vercel `JBC2476ADgjeMzs95y2SS7hwaNKy` | deployment de preview concluído e check aprovado |
| Staging schema | Supabase branch `staging`, ref `lxmpsxwlpmfisbauakaz` | migration aplicada; tabela e RPCs presentes; zero fragmentos antes do teste; Security Advisor com zero lints |
| Staging performance | Supabase Performance Advisor | encontrou as duas novas FKs sem índice de cobertura; correção adicionada em `20260828191000_receivables_evidence_fk_indexes.sql` antes de produção |

O candidate passou revisão e CI, mas ainda não é produção. A aceitação da Fase 7 exige,
em ordem: staging, deploy do worker e web, replay controlado
com um upload real, repetição idempotente, falha adversarial e verificação de isolamento.

## Vertical de recebíveis, coleta governada de evidências da Fase 6, 28/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Fonte única | catálogo `receivables-evidence` | 18 fatos, 18 definições únicas, todas com evidência aceitável, padrão de conclusão e declaração isolada proibida como prova |
| Lote operacional | gold do compilador | lote atual limitado a cinco tarefas; demais itens permanecem em backlog ordenado |
| Evidência já entregue | cobertura completa | fato seguro concluído desaparece do plano e não é solicitado novamente |
| Amostra | cobertura parcial favorável | tarefa pede somente a cobertura remanescente e preserva contagem coberta e universo total |
| Achado adverso | cessão anterior em um título | tarefa crítica de resolução ou segregação antecede pedidos genéricos |
| Fontes divergentes | duas observações vigentes | tarefa crítica de reconciliação, sem escolha silenciosa |
| Verdade de mercado | transação observada e inferência | apetite e capacidade continuam abertos até confirmação direta ou de relacionamento |
| Diversidade de compradores | mandato sintético | compilador opera por programa e `providerKind`, inclusive `factoring_company`; não pressupõe FIDC |
| Replay Vertentes | eval bruto | carteira e pacote financeiro reconhecidos; titularidade, gravames e controle de duplicidade permanecem tarefas abertas |
| Fronteira | planos da operação e de mandatos | sem consulta externa executada, contato automático, recomendação ao cliente ou divulgação de identidade |
| Gate integral | `pnpm check`, Node 24.19.0 | lint, typecheck, testes e build verdes nos 41 pacotes; 160 testes do playbook, 29 do case engine e 37 de evals |

O contrato da Fase 6 transforma lacuna em trabalho auditável. Ele ainda não integra registradoras,
SEFAZ, bureaus nem CRM e não acredita o caso completo.

## Vertical de recebíveis, fatos contratuais e verdade de mercado da Fase 5, 28/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Fonte canônica | catálogo de resolução | 18 fatos de elegibilidade e 18 definições únicas, sem lacuna ou duplicidade |
| Resolução determinística | golds de `contract-facts` | cobertura completa resolve; amostra favorável, estimativa e fonte vencida abstêm; conflito permanece desconhecido |
| Ônus anterior | cenário adversarial parcial | um ônus confirmado em parte da carteira bloqueia, sem exigir falsa prova negativa prévia |
| Ausência não é prova | replay bruto Vertentes | titularidade, inexistência de ônus e controle de duplicidade permanecem desconhecidos sem evidência adequada |
| Verdade de mercado | resolver de mandatos | declaração direta, relacionamento confirmado e regra publicada podem sustentar política; transação observada e inferência são somente pesquisa |
| Responsabilidade | observações de mandato | `recordedBy` obrigatório, além da fonte, data e validade |
| Integração | `runReceivablesCasePipeline` | observações são resolvidas antes da Fase 2A; exatamente um caminho de fatos é aceito |
| Regressão Vertentes | avaliação E2E | detectores continuam reproduzidos sem promover fatos contratuais ausentes nem fabricar programa ao vivo |
| Gate integral | `pnpm check`, Node 24.19.0 | lint, typecheck, testes e build verdes nos 41 pacotes; 54 testes de análise, 38 de mandatos, 21 do case engine e 37 de evals |
| Fronteira institucional | relatório final | recomendação, contato, distribuição, introdução qualificada e aprovação de crédito permanecem falsos |

Este gate torna explícita a passagem entre evidência e decisão de rota. Ele não
acredita a Vertentes de ponta a ponta: hard facts contratuais e programas live
continuam dependendo de comprovação real.

## Vertical de recebíveis, leitura bruta e detectores da Fase 4, 28/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Tape sem truncamento | teste real de `document-parsers` | linha 34.398 e última coluna presentes; nenhum `limit_reached` |
| Amostra fiscal | `parseNfeArchive` | 200 NF-e e 70 cancelamentos lidos; nenhuma extrapolação além dos XMLs presentes |
| Fronteira do fixture | loader do replay | somente `documentos/**` e PDFs de `intake/**`; nenhum `gold`, `source`, `expected`, HTML, CSS ou guia |
| Defeitos Vertentes | replay bruto | 8/8 detectados, recall 100% e precisão 100%, com valores e âncoras reproduzíveis |
| Perguntas Vertentes | replay bruto | 4/4, cada uma ligada a gatilho medido e busca exaustiva na evidência entregue |
| Procedência | relatório dos detectores | hash do dataset, universo, período, fórmula e âncoras nos arquivos brutos |
| Amostra não extrapolada | conciliação NF-e × carteira | 41 títulos abertos cancelados encontrados dentro da amostra; o número não vira estimativa do universo |
| Gate honesto de mercado | avaliação E2E | somente `compatible_programs` e `pipeline_incomplete` falham; shortlist live não é fabricada |
| Fronteira institucional | resultado do pipeline | recomendação, contato, introdução e aprovação continuam bloqueados |
| Promoção | PR #296, Quality `33152006657`, worker `33152006577`, Vercel `dpl_895EToY6n1D484XpWKn76VwbWuez` | `main` em `2977501`; todos os checks verdes, rollout estável e domínio principal respondendo HTTP 200 |

## Vertical de recebíveis, harness E2E da Fase 3, 27/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Runner único | `runReceivablesCasePipeline` | Fases 1, 2A e 2B, classificação, defeitos e perguntas compõem uma execução governada |
| Gold replay | teste sintético completo | cálculo, classificação, defeito, programa, pergunta e procedência passam simultaneamente |
| Vertentes matemática | seis cálculos do gold | seis de seis exatos a partir do universo canônico |
| Vertentes baseline histórico | avaliação original do harness | 0/8 detectores, 0/2 programas e 0/4 perguntas antes da Fase 4; preservado como evidência da barra vermelha inicial |
| Perguntas | contrato do runner e do evaluator | lista exata, gatilho não estimado, busca exaustiva em toda evidência entregue e zero pergunta já respondida |
| Matching live | resultado da Fase 2B | apetite e capacidade carregam source IDs próprios; shortlist somente com ambos atuais e confirmados |
| Procedência derivada | coletor de métricas | métricas compostas conservam a procedência de todos os inputs governados |
| Fronteira institucional | relatório final | recomendação externa, contato, introdução qualificada e aprovação de crédito permanecem falsos |

O harness é aceito como infraestrutura de avaliação. A leitura bruta, os detectores
e as perguntas foram fechados na Fase 4; a Vertentes ainda não é um caso E2E
integralmente acreditado porque hard facts contratuais e programas live permanecem
sem comprovação.

## Vertical de recebíveis, programas e mandatos da Fase 2B, 27/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Contrato de mercado | `@offroad/fund-mandate` | instituição, programa, rota, política, capacidade e apetite permanecem conceitos separados |
| Universo de compradores | catálogo e testes | banco, financeira, SCD, factoring, FIDC, fundo privado, family office, investidor institucional e programa de sacado, sem default por tipo |
| Procedência e validade | resolver de observações | toda regra carrega fonte e janela de validade; divergência é visível; capacidade e apetite exigem confirmação |
| Matching determinístico | `@offroad/receivables-analysis` | cinco estados explícitos, sem score mágico; métrica estimada abstém e capacidade não confirmada bloqueia shortlist ao vivo |
| Alocação | `@offroad/financial-core` | cheque parcial preservado; teto no menor entre pedido, tíquete, capacidade e colateral elegível |
| Gold adversarial | seis casos sintéticos | factoring e financeira sem FIDC, SCD sem capacidade confirmada, rota indisponível, estimativa e pool insuficiente |
| Oráculo independente | `oracle-receivables-providers.py` | seis casos verificados sem importar o motor TypeScript |
| Persistência | migration `receivables_provider_programs` | programas normalizados e observações ligadas ao programa exato, append-only |
| Isolamento em staging | smoke test RLS | tenant não relacionado vê zero; provedor lê o próprio programa e não reescreve ownership ou evidência |
| Segurança Supabase | database advisor | zero alertas de segurança após a migration |
| Fronteira institucional | relatório da Fase 2B | recomendação à companhia, contato, distribuição, introdução qualificada e aprovação de crédito permanecem falsos |

Este gate cria uma shortlist técnica interna e governada. Ele não transforma aderência
em oferta, aprovação, compromisso de capital ou autorização de contato.

## Vertical de recebíveis, elegibilidade de rotas da Fase 2A, 27/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Catálogo canônico | `@offroad/credit-playbook` | nove rotas, sem FIDC como única saída e sem confundir capital, veículo, canal ou prestador |
| Fontes normativas | teste de catálogo | todo critério possui fonte primária do Planalto ou oficial de BCB ou CVM consultada em 27/08/2026 |
| Factoring e financeiras | catálogo e teste do executor | factoring, banco, SCFI e SCD aparecem como fontes distintas; velocidade e economia estimadas não decidem elegibilidade |
| Executor determinístico | `@offroad/receivables-analysis` | quatro estados explícitos; ausência de fato rígido abstém; pendência remediável condiciona; violação citada bloqueia |
| Denominador título a título | `@offroad/financial-core` | classificações completas, exclusivas e reconciliadas; título ausente, duplicado ou exclusão estimada falham fechado |
| Uma fonte, uma execução | `@offroad/case-engine` | catálogo do playbook é injetado no executor; nenhum segundo catálogo de conhecimento é mantido |
| Gold adversarial | cinco casos sintéticos | rota integral, rota rápida, cessão anterior, prova de entrega pendente e titularidade estimada |
| Oráculo independente | `oracle-receivables-routes.py` | cinco de cinco casos verificados sem importar o motor TypeScript |
| Fronteira institucional | relatório da Fase 2A | buyer mandate, recomendação, contato externo, introdução qualificada e aprovação de crédito permanecem falsos |
| Testes focados | playbook, financial-core, receivables-analysis e case-engine | 157, 55, 41 e 11 testes verdes antes do gate integral |
| Gate integral | `pnpm check` em Node 24.19 | lint, typecheck, testes e build verdes; 41 de 41 tarefas concluídas e web com 28 rotas de produção |

Este gate promove somente elegibilidade técnica de rota. Percentual por mandato,
política interna, capacidade disponível, apetite atual e ranking de financiadores
dependem da Fase 2B e não foram inferidos de material público.

## Vertical de recebíveis A1, gate matemático integral da Fase 1, 27/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Sala sintética integral | manifesto e SHA-256 dos 21 arquivos `raw` | 21 de 21 preservados; nenhuma entidade ou informação real |
| Verdade reservada | hashes de `source`, `normalized` e `expected` | arquivos íntegros e separados da entrada que futuros testes de extração poderão ler |
| Datas canônicas | reporting, última originação e intervalo | 30/06/2026, 28/06/2026 e 01/07/2024 a 28/06/2026 permanecem distintos |
| Métricas estáticas | igualdade exata com gold | 34.397 títulos; R$ 125.019.151,13 de face; R$ 11.897.080,30 em aberto; prazos, DSO, aging, Top N e HHI aprovados |
| Cobertura de eventos | contrato e validação | liquidação, diluição, prorrogação, recompra e cessão ou gravame distinguem `complete`, `partial` e `not_provided`; ausência nunca vira zero silencioso |
| Roll rate | 23 matrizes mensais contra oráculo independente | cada linha reconcilia exposição de origem com oito destinos e usa vencimento original |
| Safras | 24 coortes e seis horizontes contra oráculo independente | curva de não pagamento em 30, 60, 90, 120, 180 e 360 dias; coorte imatura falha fechada |
| Performance da carteira | igualdade exata com oráculo | diluição 2,447267%; write-off final 1,616655%; pontualidade 24,153471% por quantidade e 24,128437% por valor |
| Prorrogações | 340 títulos identificados | 0,988458% dos títulos; 1,070097% da face; 168,7867543 dias ponderados; série temporal indisponível porque a data do evento não veio no intake |
| Recompra | zero eventos com cobertura sintética completa | valor zero medido; taxa sobre volume cedido `not_evaluable` porque o denominador não existe |
| Invariantes | aging, concentração e replay | aging reconcilia integralmente com a posição; cortes são monotônicos; ordem dos títulos não altera a saída |
| Procedência | inspeção de todas as métricas | 100% com hash do dataset, universo, período, fórmula versionada e ao menos uma âncora |
| Cascata ilustrativa | exclusões mutuamente exclusivas | R$ 3.019.585,07 excluídos e R$ 8.877.495,23 elegíveis; política marcada como estimada e incapaz de decidir buyer fit |
| Ponte da dívida | igualdade exata com oráculo independente | R$ 12 milhões declarados; R$ 22,26 milhões ajustados; R$ 20,94 milhões líquidos; 5,453125x sobre EBITDA reportado de R$ 3,84 milhões |
| Conversão de taxa | regimes por dentro e por fora | desconto sobre face e custo sobre recursos líquidos permanecem distintos; CDI e spread em dias úteis são compostos separadamente |
| CET | fluxos datados, tarifas e tributos explícitos | factoring Prime: R$ 94.570 líquidos e 62,448085% a.a. antes de tributos; ausência de tributo retorna CET incompleto e nenhuma imputação |
| Advance rate | hipótese governada e rastreável | 92,904117% no cenário Vertentes; perda ajustada é proxy estimada declarada, não falsa perda esperada de safra nem política de comprador |
| Orquestração canônica | `analyzeReceivablesPhaseOne` | composição sem matemática duplicada; caso incompleto permanece incompleto; quatro fronteiras externas permanecem falsas |
| Regressão focada | financial-core, receivables-analysis e testing-fixtures | 53 + 38 + 25 testes verdes; typecheck verde nos três pacotes |
| Gate integral | `pnpm check` em Node 24.19 | lint, typecheck, testes e build verdes nos 41 pacotes; web com 135 testes e 28 rotas |
| Performance local | Node 24, carteira integral | estático 318,65 ms mediana e 353,71 ms p95; dinâmico 1.082,61 ms mediana e 1.112,66 ms p95; relatório integral 1.414,71 ms mediana e 1.455,08 ms p95 |

Esta evidência promove o perímetro matemático e de procedência da Fase 1. Ela não
promove atribuição de diluição por causa, série temporal de prorrogação, tributo não
fornecido, elegibilidade por regulamento, buyer fit, recomendação ou introdução. O
motor passou no gate. O caso Vertentes permanece incompleto onde a entrada é
incompleta.

## Gate jurídico inicial v3, 27/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Termo integral | documento `2026-08-27-v3`, PT-BR e EN-US | nove cláusulas materiais, sem repetição do resumo e com hash SHA-256 de 64 caracteres |
| Escopo do primeiro aceite | texto integral, resumo e interface | somente preparação privada; sem mandato, exclusividade, prova de representação ou autorização de distribuição |
| Manifestação inequívoca | dois controles obrigatórios | aceite da versão integral e confirmação do direito de fornecer informações são declarações separadas e preservadas literalmente |
| Evidência técnica | `organization_legal_acceptances` | versão, hash, declarações, usuário, organização, data, método, IP e user agent quando disponíveis |
| Imutabilidade e isolamento | migration e suíte RLS | registro append-only, função autenticada com organização derivada da sessão e nenhuma execução anônima |
| Staging | schema e documentos ativos | somente v3 ativa por idioma; v1 e v2 preservadas como `superseded`; assinatura nova da RPC confirmada |
| Evidência legada | leitura de produção após migration | v1 e v2 preservam `authority_declared = true`; os campos exclusivos do v3 continuam nulos, sem reinterpretação retroativa |
| Segurança | Supabase Security Advisor staging e produção | zero findings |
| Gate local completo | `pnpm check` | 41 pacotes verdes; 19 arquivos e 135 testes web; build de produção com 28 rotas |
| CI obrigatório | banco, RLS, lint, E2E e qualidade | todos os jobs do PR #281 verdes |

O schema e o documento v3 estão ativos em produção. A verificação visual pós-deploy permanece uma
evidência separada da validade jurídica do texto.

## Máquina de estados canônica do onboarding, 27/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Uma única jornada para empresa e assessor | `resolveBorrowerOnboardingView` | boas-vindas, confidencialidade, identificação da captação, sete marcos guiados e conclusão; nenhuma etapa do formulário legado participa da decisão |
| Pré-condições invioláveis | 8 testes unitários do resolvedor | parâmetros de URL não pulam aceite, nome da captação ou retomada persistida; financiador permanece isolado em sua própria jornada |
| Voltar e Editar sem destruição | página, actions e especificação E2E | navegação abre uma visão reversível; não cancela sessão, não apaga documento e não cria uma segunda captação |
| Nova captação no workspace | `/app/new` e `start_workspace_intake` | o caminho manual foi removido; toda nova captação exige nome, política de identidade e declaração de representação |
| Atomicidade | migrations `20260827221500` e `20260827224000` | sessão nomeada, privacidade e evidência de representação são criadas ou atualizadas em uma única transação |
| Staging | teste SQL transacional com rollback | primeira captação, edição idempotente e captação posterior preservaram IDs, nomes, estados e uma única evidência |
| Segurança | Supabase Security Advisor staging | zero findings após as duas migrations |
| Quality gate web | lint, typecheck, testes e build | 19 arquivos e 135 testes verdes; build de produção com 28 rotas |

O E2E autenticado completo permanece como gate obrigatório do CI. Ele não foi declarado como
executado localmente porque o Docker local estava indisponível durante esta revisão.

## Intake guiado em sete marcos, 26/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Arquitetura visível | onboarding PT-BR e EN-US | sete marcos canônicos; nenhum contador legado `1 de 3` no onboarding |
| Primeiro marco | interface e comando `save_guided_company_profile` | identificação compacta, contexto livre ou documento, persistência atômica e avanço para operação |
| Início sem estado parcial | comando `start_onboarding_intake` | sessão e ponteiro de onboarding são criados ou retomados na mesma transação |
| Navegação | E2E `document-first-intake.spec.ts` | voltar entre etapas e editar a identificação preservam a mesma sessão; não existe reinício destrutivo na interface |
| Progresso | projeção dos sete marcos | começa em 0%, acompanha o marco persistido e não conclui trabalho futuro por antecipação |
| Feedback de clique | `IntakeActionSubmit` | botão entra imediatamente em estado pendente e bloqueia submissões duplicadas |
| Staging | teste SQL transacional | start, sessão `collecting`, perfil, organização, company e avanço para operação validados com rollback |
| Segurança | Supabase Security Advisor staging | zero findings após as duas migrations |
| Quality gate | `pnpm check` e gate web repetido | 41 pacotes verdes; 18 arquivos e 127 testes web verdes; build com 28 rotas |

## Workspace do Agente Offroad e pesquisa pública, 26/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Progresso real | `@offroad/case-runner`, worker e `@offroad/work-plan` | 11 estágios internos emitem eventos seguros; 14 tarefas públicas são projetadas sobre eventos persistidos e múltiplos documentos |
| Percentual não fabricado | onboarding PT-BR e EN-US | piso fixo de 12% removido; antes da execução o progresso é o cadastro real, depois passa a ser o plano processado |
| Pesquisa pública governada | `@offroad/public-research` | 5 temas, queries públicas limitadas, bloqueio de identificadores e valores privados, fallback entre provedores, deduplicação e lineage por fonte |
| Separação de evidência | worker, ADR 0014 e migration | pesquisa persiste como `external_context` e entra no snapshot apenas como status e contagens; não altera fato, cálculo ou matching |
| Alterações conversacionais | `@offroad/agent-contracts` | proposta tipada, ligada ao manifesto, com preview, evidência, impacto, recomputação, expiração e regra que impede número apoiado apenas por fonte pública |
| Persistência e isolamento | migration e `rls_non_interference.sql` | RLS forçado, nenhuma escrita direta do tenant, pesquisa escrita por capability, proposta decidida por comando e tenant cruzado bloqueado |
| Quality gate local | `pnpm check` | lint, typecheck, testes e build de produção verdes nos 41 pacotes; web gerou 28 rotas |
| CI obrigatório | GitHub Quality run `33008949043` | database, RLS, schema lint, E2E, lint, typecheck, testes e build verdes; Vercel preview verde |
| Staging antes de produção | Supabase branch `staging` | migrations rebaseadas sobre produção; fundação e hardening aplicados; Security Advisor com zero findings e nenhuma foreign key nova sem índice |
| Schema de produção | Supabase `ifnogpksgdadruooqydi` | remote migrations `20260826200143` e `20260826200443`; RLS forçado; sem grant anônimo; somente leitura autenticada; wrappers públicos invoker e implementações privadas definer |
| Estado inicial dos ledgers | SQL de verificação em produção | zero pesquisas, zero fontes e zero propostas imediatamente após a promoção |
| Worker de produção | GitHub deploy run `33007845496` | imagem `bb62b995dade`; task definition `offroad-document-worker:105`; ECS service stable |
| Tipos do banco | `apps/web/src/types/database.ts` | regenerados diretamente do schema de produção após a promoção |

Aceitação de código, banco, isolamento e worker está verde em produção. A superfície conversacional
continua fora do produto por decisão arquitetural: ela só entra quando aceitar uma proposta puder
acionar um comando de domínio real, idempotente, auditável e com recomputação explícita.

## House Playbook M8, 26/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Dezoito procedimentos executáveis de mercado | `@offroad/credit-playbook` | MK-01 a MK-18 candidates com métodos e verificações específicos; MK-19 a MK-28 são referência pós-introdução e permanecem `not_applicable` |
| Screening governado | `@offroad/fund-mandate` | filtros duros binários, proveniência, validade, divergência, shortlist qualitativa e ausência de percentual fictício cobertos por testes |
| Gate M7 para M8 | `@offroad/case-materials` e `@offroad/case-engine` | pacote recebe fingerprint único; validação cruzada, claim audit, revisão técnica e autorização da companhia precisam apontar para a mesma versão e destinatários nomeados |
| Persistência e isolamento | migration M8 e `rls_non_interference.sql` | política, plano, destinatários e introdução append-only; RLS forçado, sem DML direto, tenant cruzado bloqueado e comandos separados de revisão e autorização |
| Fronteira pública | `publicCaseState`, worker e web | identidades, contatos, ordem da onda, observações e resultados privados não são expostos; somente contagens e status chegam ao workspace |
| Superfície legada | rota `/app/sounding/<sessão>` | redirect seguro para o case; actions, servidor e componente de book e alocação removidos da aplicação ativa |

M8 está implementado no branch como candidate. A aceitação final exige reconstrução integral do
banco pelo CI, aplicação da migration em produção, advisors, tipos regenerados, deploy do worker e
verificação da rota e do estado público em `offroad.capital`.

## House Playbook M7, 26/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Trinta e dois procedimentos de materiais | `@offroad/credit-playbook` | MA-01 a MA-32 compilam como candidates determinísticos, derivados da fonte canônica, cada um com método e verificação próprios, sem handoff entre agentes e sem chamada de modelo |
| Material Truth Set | `@offroad/case-materials` | emite 32 estados, fingerprints, template e seções, suporte, disclaimer, identidade bilíngue, consistência, higiene da sala e decisão de circulação |
| Gate de circulação | testes de `materialTruth` | ausência de autorização mantém `internal_only`; somente quatro carimbos do mesmo fingerprint e destinatários nomeados concluem MA-32; claim órfão bloqueia a liberação |
| Trânsito e persistência | `@offroad/case-engine`, `@offroad/evals` e worker | o truth set atravessa a esteira, integra o manifesto e persiste no snapshot; resultados privados dos procedimentos são removidos na fronteira pública |
| Superfície web | workspace PT-BR e EN-US | estado, procedimentos concluídos, consistência e condição de circulação ficam visíveis antes dos links dos artefatos |
| Quality gate dirigido | playbook, materials, engine, evals, worker e web | 149 testes do playbook, 37 de materiais, 4 do engine, 32 evals, 46 do worker e typecheck web verdes antes do gate completo |

M7 está implementado no trilho real como candidate. A geração no workspace é interna e não equivale
a distribuição. A persistência da autorização por versão, escopo e destinatário está conectada ao
fluxo de introdução qualificada pelo M8; sem o gate completo, nenhuma execução declara circulação externa.

## House Playbook M6, 25/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Treze procedimentos de pricing | `@offroad/credit-playbook` | PR-01 a PR-13 compilam como candidates com referência canônica, schemas, dados requeridos, testes, runtime determinístico, zero handoff entre agentes e zero chamada de modelo |
| Motor governado | `@offroad/market-reference` | 11 testes cobrem faixa observada, custo all-in, amostra insuficiente, fonte não independente, comp vencido, garantia incompatível, falsa precisão, choque de regime, normalização de warrant ou fee que não fecha e abstenção para indexador sem curva validada |
| Trânsito pela esteira | `@offroad/case-engine`, `@offroad/evals` e worker | toda run emite exatamente 13 estados PR; sem contexto de mercado a decisão é abstenção, não fallback para a grade estática |
| Registro privado | migrations `20260826013647_m6_pricing_registry.sql` e `20260826013815_m6_pricing_registry_advisor_hardening.sql` | aplicadas em produção; política e observações têm RLS forçado, negação explícita para tenants, grants revogados, índice da aprovação e leitura pelo worker condicionada à capability do job |
| Fronteira pública | teste de `publicCaseState` | source IDs, owners, observações elegíveis e rejeitadas e resultados privados dos procedimentos não atravessam para o workspace; somente agregados e conclusão permanecem |
| Superfície web | `IntakeCase` PT-BR e EN-US | card M6 comunica faixa, amostra, fontes, recência, custos e política ou exibe abstenção institucional sem número aproximado |
| Quality gate local | `pnpm check` com Node 24.19 | 38 pacotes com lint, tipagem, testes e build de produção verdes; web com 127 testes, worker com 46, evals com 32 e playbook com 146 |

M6 está implementado e promovido ao trilho real de produção como candidate. O PR #260 passou pela
reconstrução do banco, RLS, E2E remoto e gate completo. Nenhum número de mercado foi semeado. A
primeira faixa de produção só poderá existir após política ativa aprovada e observações autorizadas,
atuais e comparáveis. Security Advisor e Performance Advisor foram verificados depois da promoção,
sem findings de segurança ou foreign keys sem índice no perímetro de pricing.

## House Playbook M5, 25/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Matemática de estrutura determinística | `@offroad/financial-core` | 19 testes no pacote; SAC, Price, bullet, balloon, carência, capitalização, cobertura, headroom e concentração calculados com Decimal |
| Verdade de estrutura M5 | `@offroad/deal-structure` | 36 testes no pacote; 45 procedimentos sempre emitidos, proposta limitada pelo menor envelope e casos adversariais bloqueados sem valor inventado |
| Skills e referências governadas | `@offroad/credit-playbook` | ES-01 a ES-45 candidates, lineage canônico, famílias de referência com fonte, data, validade e dono, zero peer handoff e zero chamadas de modelo; 145 testes |
| Ontologia de estrutura | `@offroad/credit-ontology` | 22 testes; cenários de CFADS, políticas, garantias, covenants, definições, subordinação, intercreditor, compatibilidade, instrumento, comprador e all-in reconhecidos |
| Trânsito, matching e persistência | `@offroad/case-engine`, `@offroad/evals`, `@offroad/document-worker` | matching usa o montante suportado; 32 evals e 46 testes do worker preservam os 45 estados ES no snapshot sanitizado |
| Superfície web | componente privado PT-BR e EN-US | montante, restrição, prazo, amortização, downside DSCR, cobertura, compatibilidade e lacunas possuem rótulos institucionais; validação autenticada fica para o preview Vercel |
| Quality gate completo | `pnpm check` com Node 24.19.0 | 38 pacotes com lint, typecheck, todos os testes e build de produção verdes; web com 127 testes e 28 páginas geradas |

M5 está implementado no trilho real como candidate. O resultado é uma proposta indicativa de
estrutura, não um compromisso de capital nem uma aprovação de crédito. A promoção institucional
permanece bloqueada até dados de casa vigentes, gold e adversarial cases, revisão econômica
independente, revisão legal aplicável e aceite do fingerprint exato.

## House Playbook M4, 25/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Matemática operacional determinística | `@offroad/financial-core` | 14 testes no pacote; necessidade, fontes e usos, pró-forma, NCG incremental, carry e cronograma usam Decimal e preservam trace |
| Verdade operacional M4 | `@offroad/deal-structure` | 33 testes no pacote; caso limpo fecha pedido, necessidade e identidade; mismatch, período descoberto e bridge sem take-out bloqueiam sem estimativa silenciosa |
| Skills compiladas | `@offroad/credit-playbook` | OP-01 a OP-14 candidates, lineage canônico, runtime determinístico, zero peer handoff, zero chamadas de modelo; 142 testes do pacote |
| Ontologia operacional | `@offroad/credit-ontology` | fontes e usos por entidade, moeda, data e tranche; NCG, custos, buffer, tranches, CPs, bridge, cronograma, espera, usos mistos e versão material reconhecidos |
| Trânsito e persistência | `@offroad/case-engine`, `@offroad/evals`, `@offroad/document-worker` | toda run emite 14 estados OP; 32 evals e 46 testes do worker preservam o truth set no snapshot público sanitizado |
| Superfície web | preview local descartável, desktop 1440 px e mobile 390 px | pedido, necessidade, fontes, usos, diferença, pró-forma e cobertura legíveis; `body.scrollWidth` igual ao viewport nos dois breakpoints |
| Quality gate completo | `pnpm check` com Node 24.19.0 | 38 pacotes com lint, typecheck, todos os testes e build de produção verdes; 28 páginas geradas |

M4 está implementado no trilho real e pronto para teste funcional como candidate. A promoção
institucional permanece bloqueada até aprovação dos dados de referência, revisão independente e
aceite do fingerprint exato.

## House Playbook M2 e M3, 25/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Matemática financeira determinística | `@offroad/financial-core` | 8 testes cobrindo CFADS, conversão, capital de giro, identidades, dívida, vida média, ponte de saldo, ponte de juros, liquidez, choque de taxa, cross-default, concentração, sazonalidade e moeda |
| Verdade financeira M2 | `@offroad/reconciliation` | 18 procedimentos Q emitidos em toda run, demonstrativos e pontes rastreáveis, conflito auditado versus ERP preservado, manutenção não inferida de depreciação e identidade quebrada bloqueando apenas o output afetado |
| Verdade da dívida M3 | `@offroad/reconciliation` | 31 procedimentos D emitidos em toda run, instrumentos separados por contrato, múltiplas visões, obrigações fora de balanço, vencimentos, vida média, bridges, covenants, stress e cross-default cobertos em 34 testes do pacote |
| Skills compiladas da fonte canônica | `@offroad/credit-playbook` | 49 candidates individuais, Q-01 a Q-18 e D-01 a D-31, com lineage exato, runtime determinístico, zero peer handoff e zero chamadas de modelo; suíte do pacote com 141 testes |
| Trânsito pelo Case Engine | `@offroad/evals` | 32 testes; casos clean, sala suja e recebíveis atravessam as nove etapas e preservam as listas completas de 18 e 31 procedimentos no estado final |
| Persistência pelo worker | `@offroad/document-worker` | 46 testes; snapshot sanitizado persiste M2 e M3 completos, manifesto e relatório, sem expor identidade ou conteúdo privado de mandatos |
| Superfície web e responsividade | preview `?case=truth` + build web | cards M2 e M3 renderizados em PT-BR, desktop e 390 px, sem overflow; status, métricas, instrumentos e lacunas legíveis |
| Quality gate completo | `pnpm check` com Node 24.19 | 38 pacotes: lint, tipagem, testes e builds verdes antes da promoção pelo CI |

O motor está pronto para teste funcional E2E com um novo case. As skills permanecem candidates e
só recebem promoção institucional individual depois de gold, adversarial, referência vigente e
revisão independente do fingerprint exato.

## House Playbook M10, 25/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Treze procedimentos de conduta | `procedure-contract.test.ts` | `LC-01` a `LC-13` compilam como candidates individualmente promovíveis, em pipeline determinístico, sem peer handoff e com zero chamadas de modelo |
| Motor determinístico de conduta | `conduct-policy.test.ts` | claim sem suporte, promessa de funding, julgamento sem aprovação exata, drift PT/EN, cross-case, destinatário, conflito, disclaimer, compromisso sem registro, data relativa, surpresa sem causa e travessão possuem reason codes estáveis |
| Shadow nos materiais | `case-materials/src/conduct.test.ts` e `institutional.test.ts` | cada artefato recebe versão, fingerprint e findings; promessa explícita é detectada sem reescrita silenciosa; enforcement permanece shadow até acreditação individual |
| Dívida medida e corrigida no contrato coberto | `institutional.test.ts`, `diligence.test.ts` e `deal-structure/index.test.ts` | fixture growth-capex fecha os seis materiais com audit `pass`; cada termo declara suporte governado; perguntas abertas são não materiais; fração escrita em PT e EN mantém identidade econômica; source accreditation e células tabulares continuam fora desta promoção |

## Retrieval governado, 24/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Contratos por fonte | `@offroad/governed-retrieval` | case, playbook, nota de mandato e precedente têm schemas separados; payload extra e vetor em evidência do case são recusados |
| Escopo e abstention | 21 testes do pacote | organização, sessão, oportunidade, versão aprovada, fundos permitidos, hash do conteúdo e propósito do precedente são gates exatos; ausência de suporte resulta em abstention |
| Chunks ancorados | teste integrado do document worker | camada determinística produz chunks com documento, página ou seção, hash e versão; o worker persiste antes da extração econômica |
| Playbook antes da redação | teste integrado do case worker | a run falha fechada sem playbook aprovado; linhas governantes entram como orientação e não como evidência do case |
| Mandatos depois do filtro duro | teste integrado do case worker | somente fundos com veredito estruturado `fits` liberam notas; identidades e passagens não entram no estado público |
| Banco e isolamento | migrations `20260824232722` e `20260824232920` + `rls_non_interference.sql` | job `database` do PR #240 verde: RLS forçado, capabilities, tenant próprio, tenant cruzado, escrita direta, capability forjada e allowlist de fundos cobertos |
| Quality gate local | `pnpm check` com Node 24.19 | 37 pacotes: lint, tipagem, testes e builds verdes; retrieval com 21 testes, worker com 40, evals com 26 e web com 117 |
| Promoção controlada | Supabase `ifnogpksgdadruooqydi` | migrations aplicadas somente após o CI verde; tipos gerados novamente do schema remoto; Security Advisor sem alertas e Performance Advisor sem FKs sem índice |
| Regressão ponta a ponta | jobs `database`, `code` e `e2e` do PR #240 | migrations reconstruídas do zero, suíte de não interferência, lint do schema, aplicação e navegação aprovados |

A evidência funcional, de aplicação e de banco está verde. O banco foi promovido somente depois de
o CI reconstruir toda a stack e aprovar RLS, não interferência e lint. A ativação do comportamento
no worker depende do deploy de `main` e não é inferida apenas pela presença do schema.

## Registro de claims e portão de publicação, 24/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Registry individual | `@offroad/case-understanding` | cada claim tem fingerprint, suporte, decisões numérica, semântica e humana e dependências de artefato; alteração de fato retorna o conjunto afetado |
| Auditor numérico | testes de `auditBrief` | dinheiro e múltiplos sem suporte citado bloqueiam o claim; a verificação é determinística e independente da aprovação humana |
| Auditor semântico independente | teste integrado de `@offroad/case-engine` e worker | o redator e o verificador usam provedores diferentes; o verificador recebe somente claims e suporte reconciliado, falha fechado e bloqueia extrapolação |
| Aprovação humana exata | migrations `20260824180255`, `20260824180448`, `20260824180822` | decisão append-only vinculada ao fingerprint do claim, manifesto e registry; decisão antiga não aprova texto ou suporte alterado |
| Publicação fail-closed | teste integrado de `@offroad/case-engine` | claim material pendente ou reprovado mantém o brief para revisão, mas produz zero materiais publicáveis, data room não liberável e blockers explícitos |
| Isolamento e privilégios | teste RLS + catálogo remoto | escrita direta recusada; tenant B não vê nem aprova; wrapper público é `security invoker`; implementação privilegiada está em `private`; worker lê apenas com capability ativa |
| Advisors após DDL | Supabase Security/Performance Advisor | zero security lints; nenhum FK novo de `claim_decisions` sem índice; apenas infos preexistentes e índices ainda não exercitados em banco novo |
| Quality gate completo | `pnpm check` com Node 24.19 | 34 pacotes: lint, tipagem, testes e builds verdes; web com 117 testes, registry com 37 e worker com 40 |

O registro persistente já é consumido pelo worker. A experiência visual de revisão e promoção do
snapshot exato será construída como uma superfície separada, sem regenerar prosa e sem enfraquecer
o fingerprint que torna a aprovação válida.

## Worker do case e fronteira de mandatos, 24/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Trilho econômico fora do navegador | `@offroad/document-worker` + `@offroad/case-engine` | o último job documental enfileira `case_analysis`; o worker executa as nove etapas e grava snapshot e manifesto com capability temporária |
| Mandatos confidenciais | teste do worker e teste RLS | detalhes e identidade dos fundos permanecem no job privado; o estado do tomador contém somente resumo sanitizado |
| Snapshot atestado | migration `20260824170329_worker_case_analysis.sql` | `authenticated` perde o antigo comando de escrita; somente o job de case leased e dentro do escopo grava o snapshot |
| Regressão de aplicação | `pnpm check` | 34 pacotes: lint, tipagem, testes e build de produção verdes |
| Banco e isolamento | job obrigatório `database` | migrations do zero, não interferência RLS e lint do schema devem passar antes do merge |

## Fundações bulletproof, 24/08/2026

| Evidência | Comando/artefato | Resultado | Data |
|---|---|---|---|
| Taxonomia de originação v2 | `pnpm --filter @offroad/credit-ontology test` | 22 testes; dimensões ortogonais validadas e FIDC presente apenas como veículo de capital | 2026-08-24 |
| Estados operacionais e manifesto | `pnpm --filter @offroad/case-understanding test` | 31 testes; seis estados, portão de direcionamento externo, manifesto estável, ids de linhagem únicos e invalidação por versão | 2026-08-24 |
| Gold case de oito camadas | `pnpm --filter @offroad/evals test` | 16 testes; estruturas, claims, materiais, matching e desfecho integram o contrato sem quebrar casos legados | 2026-08-24 |
| Compatibilidade do playbook | `pnpm --filter @offroad/credit-playbook test` | 75 testes; dez rotas legadas convertidas para a taxonomia v2, incluindo a separação correta de FIDC | 2026-08-24 |
| Contratos e decisão arquitetural | ADR 0009 e `BULLETPROOF_EXECUTION_PLAN.md` | limites, invariantes, gates e itens explicitamente pendentes versionados no repositório | 2026-08-24 |

| Quality gate completo | `pnpm check` com Node 24.19 | lint, typecheck, testes e build verdes nos 32 pacotes; 113 testes do app web aprovados | 2026-08-24 |

Evidências são adicionadas somente depois de execução real. Nenhum item pendente implica funcionamento.

## Índice de retrieval de grande volume, 28/08/2026

| Evidência | Resultado |
|---|---|
| Run controlado 4, `811c0914-ec53-44a7-8327-463a51585554` | 16 documentos concluídos; o CSV de títulos falhou após três tentativas exclusivamente em `worker_record_retrieval_chunks`; 64 chamadas e US$ 2,3725 registrados até o bloqueio |
| Camada determinística do CSV | 22.229.284 bytes, uma sheet e 1.500.369 tokens estimados; o documento foi lido e armazenado antes do timeout |
| Correção no branch | chunks de até 12.000 caracteres, auditoria por lote e circuit breaker de 30 s mantendo o limite capability-bound de 2.000 linhas |
| Teste de package | `@offroad/governed-retrieval`: 22 testes aprovados, incluindo segmentação de tape no limite governado |
| Quality gate local | `pnpm check`: lint, typecheck, testes e build aprovados nos 41 pacotes |
| Staging | migration `20260828223532_bound_large_retrieval_index` aplicada; Security Advisor com zero lints |
| Prova ainda necessária | CI completo, deployment do worker e novo run integral do mesmo caso controlado em produção |

## Slice vertical inicial

| Evidência | Comando/artefato | Resultado | Data |
|---|---|---|---|
| Remote oficial | `git remote -v` | `origin` aponta para `carlosevg100/offroad` | 2026-08-14 |
| Branch isolada | `git status --branch` | `codex/b0-foundation`, sem commit/push | 2026-08-14 |
| Testes locais | `pnpm test` | 7 arquivos, 13 testes web + domain/financial/evidence/matching aprovados | 2026-08-14 |
| Lint | `pnpm lint` | aprovado | 2026-08-14 |
| Typecheck | `pnpm typecheck` | aprovado | 2026-08-14 |
| Production build | `pnpm build` com Node 24.19.0 | aprovado; rotas localizadas, metadata, robots e sitemap gerados | 2026-08-14 |
| Desktop visual QA | browser em 1440 x 1000 | hero, jornadas, públicos e trust architecture sem defeitos críticos | 2026-08-14 |
| Mobile visual QA | browser em 390 x 844 | PT-BR e EN-US sem overflow; controles principais com 44 px | 2026-08-14 |
| Semântica smoke | inspeção do DOM | um `h1`, hierarquia de headings, `lang` localizado, skip link e links nomeados | 2026-08-14 |
| Teclado/axe automatizado | suite dedicada | pendente; não contabilizado como aceite | - |
| Blueprint integrity | SHA-256 do PDF versionado | `6d6bc61aeaa1dc6bd42dd45b7289238925ed4087edaa5d115016871134d876de`, idêntico à fonte | 2026-08-14 |
| Preview Vercel | projeto `offroad` | landing, demo e login validados sem erro de console; preview permanece `noindex` | 2026-08-14 |
| Produção Vercel | deployment `Dk7Qh4QQxfAXxFEpJxSsFVzCp9Qo` / `https://offroad-iota.vercel.app` | build remoto aprovado; landing smoke sem erros de console | 2026-08-14 |
| Custom domains | Vercel project settings | `offroad.capital` e `www.offroad.capital` anexados; DNS GoDaddy ainda aponta para parking | 2026-08-14 |
| DNS target | Vercel DNS configuration | exige `A @ → 216.150.1.1` e `CNAME www → a9d1687f64e3d454.vercel-dns-016.com` | 2026-08-14 |
| DNS propagado | consulta DNS pública | `offroad.capital` resolve para `216.150.1.1`; `www` resolve pelo CNAME Vercel configurado | 2026-08-15 |
| HTTPS canônico | `curl -I` em apex e `www` | ambos respondem via Vercel com TLS e HSTS; redirect canônico de `www` para apex incluído no release | 2026-08-15 |
| Logo oficial | `apps/web/public/brand/offroad-capital-logo.png` | asset fornecido pelo fundador integrado como assinatura de navegação e símbolo nas superfícies escuras | 2026-08-15 |
| Product film | landing localizada | quatro cenas interativas originais, intake, evidências, estrutura e matching, com autoplay controlável e fallback para reduced motion | 2026-08-15 |
| Visual QA do redesign | browser em 1280 px e 390 x 844 | landing, product film, demo e login sem overflow horizontal ou erros de console; conteúdo PT-BR validado | 2026-08-15 |
| Quality gate do redesign | `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web build` | lint e tipagem aprovados; 13 testes aprovados; build Next.js com 19 páginas/rotas concluído | 2026-08-15 |
| Reset visual premium | browser em 1280 px e 390 x 844 | hero preto/grafite com copy aprovada, dashboard de readiness em cinzas, product film institucional e login/demo coerentes; PT-BR/EN-US sem overflow ou erros de console | 2026-08-15 |
| Quality gate do reset | `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web build` | lint e tipagem aprovados; 13 testes aprovados; build Next.js com 19 páginas/rotas concluído | 2026-08-15 |
| Revisão de mensagem institucional | catálogos `pt-BR`/`en-US` + QA visual | acesso, onboarding, demo e área autenticada revisados para empresas, CFOs, assessores, fundos e gestores; jargão SaaS removido das mensagens públicas | 2026-08-15 |
| Reposicionamento multilateral da landing | browser em 1280 px + catálogos `pt-BR`/`en-US` | hero reduzido e reescrito para empresas, originadores e gestores; paleta grafite-azulada sem verde de interface; mapa animado com função explicativa; gráficos circulares removidos; benefícios por público e demonstração localizada | 2026-08-15 |
| Quality gate do reposicionamento | `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web build` | lint e tipagem aprovados; 13 testes aprovados; build Next.js com 19 páginas/rotas concluído | 2026-08-15 |
| Supabase project | `offroad-development` / `ifnogpksgdadruooqydi` | projeto healthy em `sa-east-1`, Postgres 17.6 | 2026-08-14 |
| Database foundation | 4 migrations remotas | 28 tabelas públicas, RLS + FORCE RLS, 57 policies, RPCs atômicos e grants mínimos | 2026-08-14 |
| Tenant non-interference | `supabase/tests/rls_non_interference.sql` | tenant A, tenant B e anon isolados; transação revertida ao final | 2026-08-14 |
| Supabase advisors | Security/Performance Advisor | zero security lints; apenas infos de índices ainda não usados em banco novo | 2026-08-14 |
| Storage | bucket `opportunity-documents` | privado, limite 50 MB, MIME allowlist e policies por tenant | 2026-08-14 |
| Auth redirects | Supabase Auth URL Configuration | canônico, previews Vercel e localhost allowlisted | 2026-08-14 |
| Observabilidade negativa | `privacy.test.ts` | propriedades fora da taxonomy rejeitadas; email, UUID, valores e authorization redigidos | 2026-08-14 |
| Freshness adicional de dependências | versões exatas e revisão de publicação | PostHog fixado em versão com mais de 24 h; lockfile reproduzível | 2026-08-14 |
| Cadastro institucional por perfil | `/pt-BR/signup` e `/en-US/signup` | escolha de empresa, assessor/originador ou investidor antes da identidade; somente e-mail e senha, sem provedores sociais | 2026-08-16 |
| Verificação e recuperação | Supabase Auth + rotas `signup/verify` e `forgot-password/*` | OTP de 6 dígitos, validade de 10 minutos, confirmação obrigatória, recovery por código e templates bilíngues | 2026-08-16 |
| Onboarding profissional | rotas e server actions de onboarding | fluxos persistentes para empresa, originador e capital provider; CNPJ não persistido em claro; documentos em bucket privado | 2026-08-16 |
| Separação por função | `supabase/tests/rls_non_interference.sql` executado no projeto remoto | tenant A/B/provider/anon isolados; empresa não cria fundo e provider não cria empresa; transação revertida | 2026-08-16 |
| Supabase Security Advisor | projeto `ifnogpksgdadruooqydi` após migration profissional | zero security lints; avisos de performance apenas para índices ainda não usados | 2026-08-16 |
| QA do cadastro | browser local e screenshots em 1265, 1024 e 500 px | hierarquia, seleção de perfil, formulário e recovery sem defeitos críticos; responsividade compactada no mobile | 2026-08-16 |
| Quality gate do cadastro | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | todos aprovados; web com 11 testes e monorepo com 18 testes; 28 páginas/rotas geradas | 2026-08-16 |
| Contratos canônicos de recebíveis | `financial-core/src/receivables/contracts.test.ts` | 16 testes: fronteiras das sete faixas de aging, rejeição de dia fracionário, bloqueio de estimativa em decisão rígida e aceite de fonte citada | 2026-08-27 |
| Auditoria da vertical de recebíveis | `CANONICAL-SPEC.md`, `CURRENT-STATE-AUDIT.md` e `PHASE-1-PLAN.md` | matriz corrigida para 39 células e 282 casos mínimos; datas separadas; escopos, denominadores e estados de aderência formalizados; protótipo existente mantido sem promoção | 2026-08-27 |
| Quality gate da Fase 0 de recebíveis | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | 41 pacotes aprovados; `financial-core` com 35 testes; web com 135; worker com 48; build Next.js com 28 páginas/rotas | 2026-08-27 |
| Domínio transacional | Resend + DNS GoDaddy | `offroad.capital` verificado em `sa-east-1`; DKIM, SPF e MX publicados e aprovados | 2026-08-16 |
| SMTP de autenticação | Supabase Auth SMTP Settings | `auth@offroad.capital` via `smtp.resend.com:465`, TLS e credencial armazenada pelo provider | 2026-08-16 |
| Entrega transacional | Resend API / endereço controlado de teste | mensagem enviada por `auth@offroad.capital` com evento final `delivered` | 2026-08-16 |
| Quality gate final do cadastro | `pnpm check` | lint, tipagem, 18 testes e build de 28 rotas aprovados novamente antes da promoção | 2026-08-16 |
| Intake documents-first (PR #38–#40) | `pnpm check`; fixture por hash | 27 testes; sessões, candidatos, issues, revisão e criação do case; hashes dos 8 arquivos fixados em `packages/testing-fixtures` | 2026-08-17 |
| Histórico de migrations alinhado | `git mv` + `list_migrations` | 10 arquivos renomeados para as versões registradas no projeto; sem escrita no banco | 2026-08-18 |
| CI de banco | job `database` no PR #41 | stack local, 10 migrations do zero, teste RLS, `db lint`, verde na primeira execução | 2026-08-18 |
| Hardening (PR #44) | migration `20260817232443` + `pg_class`/`pg_policies` | 32/32 tabelas com RLS forçado; policies de organizations com guard de tipo; teste RLS executado remotamente (`rls_non_interference_passed`, rollback confirmado); advisors 0 | 2026-08-18 |
| Login | `curl https://offroad.capital/pt-BR/login` | input de senha sem `minLength` em produção (antes: 10 vs 8 no cadastro) | 2026-08-18 |
| Unificação do intake (PR #46) | `pnpm check`; `next start` local | 28 testes web; rotas respondem; chaves do namespace `Intake` verificadas contra os componentes | 2026-08-18 |
| Comandos atômicos (PR #47) | migration `20260818033220`; teste RLS remoto | begin/complete/review/confirm como tenant A; idempotência; título ≤ 180; tenant B recusado; types regenerados idênticos aos escritos à mão | 2026-08-18 |
| Documentos (PR #48) | migration `20260818034457`; teste remoto | delete permitido só em sessão aberta; recusado após confirmação e para outro tenant; hash recalculado no servidor durante o processamento | 2026-08-18 |
| E2E (PR #49) | job `e2e` em CI (Playwright, stack local) | cadastro → código → onboarding documents-first → 8 uploads → processamento → 38 campos/8 issues → aceite (37) → confirmação → envio → pipeline → sala de crédito (8 docs, 37 fatos) → conjunto desconhecido (remover/re-enviar/estado vazio) → sign-out/login, verde; encontrou e corrigiu criação de sessão sob RLS (`20260818043539`) | 2026-08-18 |
| Quality gate final | `pnpm check` (Node 24.19 via fnm) | lint, tipagem, 45 testes, build; jobs `check`, `database`, `e2e` obrigatórios em `main` | 2026-08-18 |
| Jornada guiada de originação | componentes `IntakeStartChoice`, `IntakeCollect`, `IntakeChecklist` e E2E do intake | entrada única; objetivo antes do pedido; lista contextual em mínimo, recomendado e ideal; upload e evidência existentes preservados; fallback manual somente após falha | 2026-08-22 |
| Quality gate da jornada guiada | `pnpm check` com Node 24 | lint, typecheck, testes e build verdes nos 32 pacotes; 111 testes do app web aprovados | 2026-08-22 |
| Fonte única de conhecimento | `procedure-contract.test.ts` | draft nasce com contrato mínimo; candidate exige método ampliado; source hash muda com conhecimento; dependência, template desconhecido e ciclo são recusados | 2026-08-25 |
| Execução sem sociedade de agentes | registry da vertical + testes | 19 skills compiladas aceitam somente `deterministic_pipeline`, recusam peer handoff e limitam chamadas de modelo a propósito estreito | 2026-08-25 |
| Templates dentro da vertical | registry + `case-materials` | teaser, memo, term sheet e data room têm seções, regras de evidência e consistência; artefatos carregam id, versão e SHA-256 do registry | 2026-08-25 |
| Cobertura do blueprint | `procedure-contract.test.ts` | a vertical expansão/capex cobre todas as etapas 1 a 12 e mantém maturidade candidate até aprovação e evals | 2026-08-25 |
| Growth capex adversarial | `parametric-factory.test.ts` | dívida contraditória preservada, prompt injection não vira fato e garantia sem âncora bloqueia claim material | 2026-08-25 |
| Elegibilidade negativa | `parametric-factory.test.ts` | a limitada mantém o arquétipo de expansão; CCB permanece elegível e debênture é fechada com razão explícita | 2026-08-25 |
| Quality gate da arquitetura executável | `pnpm check` com Node 24 | lint, typecheck, testes e build de produção aprovados nos 38 pacotes; vertical, templates, manifests, worker e aplicação compilam em conjunto | 2026-08-25 |
| House Playbook v2.1 governado | `source.test.ts` + SHA-256 da fonte | 11 módulos e 270 entradas preservados; 270 autoridades explícitas; zero IDs duplicados, referências internas quebradas, etapas legadas `E##`, dependências do runtime atual sobre procedimentos pós-introdução ou promoção automática; hash `fa985fe9c8ffc5e3d0853a112dde34904d86b0daad0c8fd540705f17c69f9fb6` | 2026-08-25 |
| Dados de referência fail-closed | `reference-data.test.ts` | parâmetros de mercado, políticas, cenários, elegibilidade e metodologias exigem valor, fonte, data, validade e dono; ausência mantém a unidade bloqueada e nunca é preenchida por estimativa do modelo | 2026-08-25 |
| Quality gate do House Playbook v2.1 | `pnpm check` com Node 24.19.0 | lint, typecheck, todos os testes e build aprovados nos 38 pacotes; playbook com 107 testes, evals com 32, worker com 40 e web com 117; 30 páginas geradas no build | 2026-08-25 |
| Contrato adaptativo M0 | `intake-state.test.ts` + `pnpm check` com Node 24.19.0 | replay e fingerprint estáveis; política do lote validada e limitada a cinco; escada IN-13 obrigatória; pacote classificado elimina quatro solicitações futuras; ausência não é repetida; evidência derivada não vira declaração; assessor, grupo e liquidez disfarçada preservados no domínio; 124 testes do playbook, 117 da web, 40 do worker e 32 evals aprovados; build de 30 páginas concluído | 2026-08-25 |
| Fronteira transacional do M0 em staging | migration `20260825171945`, `replay.test.ts` e `rls_non_interference.sql` remoto | necessidade e rota gravadas juntas; recebimento, classificação e remoção documental atômicos; retry idempotente; escrita direta recusada; sessão terminal imutável; tenant B lê zero eventos do tenant A; replay web falha fechado em payload ou sequência inválidos; Security Advisor com zero findings | 2026-08-25 |
| Perímetro, autorização e triagem M0 em staging | migration `20260825185143`, transação remota revertida e `intake-state.test.ts` | empresa membro vira tomadora somente no journey company; assessor e cliente ficam segregados; autorização nasce `declared`, sem evidência e limitada a `prepare_case`; comando legado sem perímetro recusado; falta ou revogação de autorização e rota recusada bloqueiam solicitações; `review_required` não se passa por recusa; Security Advisor com zero findings | 2026-08-25 |
| Fingerprint econômico completo | `case-manifest.test.ts` | ordem de linhas não altera o hash; mudança de resposta, fato ou parser altera o hash | 2026-08-24 |
| Linhagem de modelos sem conteúdo | testes de `model-gateway` e `document-worker` | tentativas bem-sucedidas, fallback e erro carregam hashes, custo e usage; mensagem privada do erro não entra no log; linhagem viaja no sucesso e na falha | 2026-08-24 |
| Manifesto atômico e append-only | migration `20260824170318` + bloco de `rls_non_interference.sql` | gravação idempotente do manifesto e snapshot em uma transação; escrita direta recusada; tenant B e anon isolados; validação final no job `database` do PR | 2026-08-24 |
| Runner governado | `@offroad/case-runner` | nove etapas ordenadas, schema por saída, fingerprints, falhas tipadas, bloqueio downstream e hard gates de custo/chamadas; 5 testes unitários | 2026-08-24 |
| Motores reais no runner | `@offroad/case-engine` + `case-pipeline.ts` | nove etapas executam os pacotes reais; schemas por camada, fingerprints e orçamento; 2 testes integrados; a aplicação web deixou de manter uma segunda cópia da lógica econômica | 2026-08-24 |
| Gate local do incremento | testes e typecheck dos pacotes alterados + web lint | model gateway 17, case understanding 31, worker 39 e web 116 testes aprovados; tipagem e lint verdes | 2026-08-24 |
| Fábrica paramétrica determinística | `@offroad/case-factory` | schema único gera documentos, candidatos, loan tape, mandatos e gold; reexecução byte-idêntica; gold permanece completo diante de omissão e conflito | 2026-08-24 |
| Loan tape fecha economicamente | `case-factory/src/index.test.ts` | 250 títulos fecham exatamente em R$ 48.000.000, 7% de saldo vencido e 12% no maior sacado | 2026-08-24 |
| Casos gerados no trilho governado | `evals/src/parametric-factory.test.ts` | expansão limpa, sala suja e recebíveis atravessam as 9 etapas; cálculos e matching batem com o gold; PT e EN mantêm identidade econômica | 2026-08-24 |
| Evidência sem âncora falha fechada | `case-understanding/src/index.test.ts` + eval de sala suja | candidato permanece para revisão, mas claim material e cálculo dependente são bloqueados com `support_anchor_unverified` | 2026-08-24 |
| Quality gate do Gate 5 | `pnpm check` | lint, typecheck, todos os testes e build verdes nos 35 pacotes | 2026-08-24 |
| Vertical econômica de recebíveis | `@offroad/receivables-analysis` | 35 testes; elegibilidade, concentração, aging, performance, evidência, reconciliação, reforços, gatilhos e waterfall determinísticos | 2026-08-24 |
| Biblioteca paramétrica de recebíveis | `receivables-fidc.test.ts` | 28 cenários independentes cobrem pronto, remediação e recusa; recusa sem base elegível identifica o motivo correto | 2026-08-24 |
| Recebíveis no motor governado | `@offroad/case-engine` e `parametric-factory.test.ts` | a análise viaja pelas nove etapas, afeta blockers e capacidade suportada e preserva `externalDirectionAllowed: false` | 2026-08-24 |
| Recebíveis no worker | `case-analysis.test.ts` | snapshot estruturado validado chega ao motor, é persistido no estado sanitizado e não autoriza direcionamento externo | 2026-08-24 |
| Anchors artesanais de recebíveis | `receivables-analysis/src/anchors.ts` | dois candidatos preparados e explicitamente marcados `pending`; revisão independente ainda não contabilizada | 2026-08-24 |
| Quality gate do Gate 6 | `pnpm check` | lint, typecheck, testes e build verdes nos 36 pacotes; 35 testes da vertical, 26 evals, 40 testes do worker e 117 testes web aprovados | 2026-08-24 |
| Contrato de produção controlada | `@offroad/release-governance` | 6 testes: replay estável, drift estrito, shadow warning, input divergente, dois cohorts distintos e aprovação antes de `active` | 2026-08-24 |
| Staging isolado | Supabase branch `staging` | branch saudável; 56 migrations após o Gate 8; zero organizações, sessões ou documentos copiados da produção | 2026-08-24 |
| Schema do Gate 8 em staging | migrations `20260824235937`, `20260825000110`, `20260825000811`, `20260825001020` e `20260825001758` | 3 tabelas públicas com RLS forçado, 5 tabelas privadas sem grants, tenant sem escrita nos ledgers, comandos de release privados e inputs e resultados imutáveis presentes | 2026-08-24 |
| Advisors do Gate 8 em staging | Supabase Security + Performance Advisors | segurança: 0 lints; performance: 0 foreign keys sem índice | 2026-08-24 |
| Não interferência do Gate 8 em staging | `supabase/tests/rls_non_interference.sql` | suíte integral aprovada: leitura própria, isolamento entre tenants, rollout sem escrita pelo tenant, capability forjada recusada, retry idempotente e resultado divergente rejeitado | 2026-08-24 |
| Quality gate local do Gate 8 | lint, typecheck, testes e build | 38 pacotes aprovados; 6 testes do release governance, 40 do worker e 117 da web; build de produção verde | 2026-08-24 |
| Promoção do schema do Gate 8 | Supabase production `ifnogpksgdadruooqydi` | cinco migrations aplicadas em ordem; Security Advisor com 0 lints; Performance Advisor com 0 foreign keys sem índice; zero políticas, execuções, comparações, inputs, resultados, cohorts ou decisões após a promoção | 2026-08-25 |
| Deploy controlado do Gate 8 | commit `ff7db5b`, Vercel e ECS | Quality em `main` verde; Vercel production concluída; `offroad-document-worker:83` estável; PT, EN, login e favicon com HTTP 200; banco permaneceu sem liberação externa ou ledgers inesperados | 2026-08-25 |
| Cases reais do Gate 8 | cohorts `wave_1` e `wave_2` | **pendente**; nenhum fixture foi contabilizado como case real | 2026-08-24 |

| Agente Offroad, primeira vertical | contratos + worker + UI + migrations `20260826203944`, `20260826204254`, `20260826204338` e `20260826205046` | mensagem vira job capability-bound; resposta pode perguntar ou propor; nenhuma mutação acontece antes da confirmação; proposta stale falha fechada; falha auxiliar não falha o intake | 2026-08-26 |
| Não interferência do Agente em staging | `supabase/tests/rls_non_interference.sql` remoto | idempotência, isolamento entre tenants, preview, aceite e aplicação transacionais e separação do processamento documental aprovados; Security Advisor com 0 findings | 2026-08-26 |
| Voltar e recomeçar onboarding | `document-first-intake.spec.ts`, `restart_onboarding_intake` e `rls_non_interference.sql` | navegação Objetivo → Pedido → Objetivo; encerramento confirmado preserva conta, organização e auditoria; sessão vira `cancelled`; onboarding volta ao `Bem-vindo`; replay é idempotente; sessão confirmada e outro tenant são recusados; Security Advisor de staging com 0 findings | 2026-08-26 |
| Request Router governado | `request-router.test.ts` e `agent-operation-brief.test.ts` | explicação e simulação não alteram estado; alteração vira proposta; aprovação não aplica silenciosamente; ação externa é recusada no Case Graph | 2026-08-29 |
| Registry da arquitetura-alvo | `task-registry.test.ts` | exatamente 80 IDs únicos e acíclicos; Knowledge, Case e Market separados; somente introdução autorizada possui efeito externo; underwriting e desembolso são sinais capturados | 2026-08-29 |
| Case Graph v4 | `case-runner/src/index.test.ts` | 11 nós reais executados por dependência; ramificações independentes iniciam em paralelo; falha bloqueia apenas descendentes; tarefas com modelo são serializadas contra orçamento | 2026-08-29 |
| TaskRun Trace e cache incremental | testes de `case-runner`, `case-engine`, `document-worker` e `queue.test.ts` | ferramentas e fontes rastreadas; cache isolado por caso, versões e prompts; alteração de valor preserva upstream e invalida estrutura e descendentes; prior report nunca entra no input congelado | 2026-08-29 |
| Cache capability-bound em staging | migration `20260829184738_task_dag_prior_report.sql`, SQL de inspeção e Security Advisor | função privada, wrapper e índice existem; `anon` sem execute; `authenticated` com execute capability-bound; zero security findings; produção intacta | 2026-08-29 |
| Quality gate local do runtime incremental | `fnm exec --using=24 pnpm check` | lint, typecheck, todos os testes e build aprovados nos 42 pacotes; web com 140 testes, worker com 61 e evals com 38 | 2026-08-29 |
| Sub-DAGs de estruturação e materiais | `case-runner/src/subgraph.test.ts` + `case-engine/src/engine.test.ts` + `pnpm check` | executor rejeita ciclo e ferramenta fora do contrato, serializa modelos e paraleliza ramos determinísticos; estruturação registra 11 subtasks e materiais registra sete; lint, typecheck, testes e build verdes nos 42 pacotes, sem chamada paga | 2026-08-29 |

## Regras

- Guardar screenshots de review em artefatos/CI, não inflar o repositório sem necessidade.
- Registrar comando, resultado, versão e data.
- Falha nunca é reclassificada como aceite parcial silencioso.

## Workspace AI-native e tese pública de originação, 01/09/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Seis entradas, uma memória | `@offroad/work-plan` e launcher autenticado | seis jobs tipados com input, acesso, primeiro work product e gate; planos fecham dependências a partir do registry canônico |
| Primeira vertical executável | web, worker e migration de produção `20260901035319` | `origination_thesis` cria projeto persistente, brief versionado, plano imutável, nove TaskRuns e meeting brief corrigível |
| Pesquisa pública limitada | `@offroad/public-research` | sete queries independentes, limite de fontes, URL HTTPS, ledger persistente e custo máximo explícito de US$ 0,035 |
| Síntese estreita | model gateway e teste do worker | Sonnet 5 medium; GPT-5.6 Terra medium como fallback; uma chamada, schema fechado, citações limitadas às URLs persistidas e abstenção quando não há suporte |
| Correção incremental | teste do worker e SQL de staging | somente M07 executa novamente; M06, C02 e K04 são reutilizados; nenhuma nova busca; uma chamada; decisão e nova versão ligadas ao artifact fingerprint |
| Banco governado | `origination_thesis_vertical.sql` | start idempotente, capability-bound context, nove artefatos, revisão M07-only, replay idempotente e token incorreto recusado; transação revertida |
| Isolamento companhia/projeto | `project_company_scope.sql` | projetos de um assessor preservam companhias distintas e não herdam silenciosamente identidade ou dados de outro projeto |
| Banco em produção | migrations `20260901035241` a `20260901035319` | tabelas, RPCs, índices e `FORCE ROW LEVEL SECURITY` presentes; ledger de briefs vazio antes do primeiro teste humano |
| Segurança | Supabase Security Advisor em `staging` e produção | zero lints após as funções de start, revisão e contexto do worker |
| Índices do runtime | migration `20260901035442` e Performance Advisor | cinco foreign keys endurecidos; zero findings `unindexed_foreign_keys` em `staging` e produção |
| Testes e build | `pnpm test && pnpm build` | 42 pacotes verdes; web 160 testes; worker 69 testes; Next.js compilou 30 páginas e as rotas dinâmicas de setup e projeto |
| Integração e deploy | PR #336, Quality `33467602650`, worker `33467602677`, Vercel `5bBMwnK1VJe2NiwTKVc4YrinQ8NU` | PR incorporada a `main`; banco, E2E, gate completo, worker ECS e deployment web verdes |
| Rede paga | execução desta validação | nenhuma chamada paga; pesquisa e síntese foram testadas com providers controlados |
| Fronteira de prontidão | produção e documentação | a tese pública de originação está tecnicamente pronta para o primeiro teste humano/gold case, ainda sem qualidade institucional comprovada; as outras cinco verticais continuam dependentes de executores, interfaces e gates próprios |

## P1: Fase F0 (18/08/2026)

| Evidência | Comando/artefato | Resultado | Data |
|---|---|---|---|
| Ontologia cobre o fixture | `pnpm --filter @offroad/credit-ontology test` | 17 testes; todos os 38 field paths do fixture resolvem no catálogo; plano de contas sem ciclos | 2026-08-18 |
| Verificador de âncora | `pnpm --filter @offroad/document-intelligence test` | 18 testes: trecho inventado, dígitos alterados, âncora ausente, página escaneada (modo degradado), armadilhas de escala, percentuais, dedupe | 2026-08-18 |
| Gateway sem Haiku | `pnpm --filter @offroad/model-gateway test` | 14 testes: denylist/allowlist, fallback por recusa/erro/saída inválida, budgets, redação, cassetes; adapters tipados contra os SDKs reais (`@anthropic-ai/sdk` 0.117.1, `openai` 7.5.0), sem rede | 2026-08-18 |
| Harness de evals + G1 | `pnpm --filter @offroad/evals test` e `pnpm --filter @offroad/evals baseline` | 7 testes; baseline do fixture: precisão 100% (38/38), recall material 47,7% (31/65), exceções 7/12, alucinação 0, sem classificação/cálculos; snapshot perfeito = 100% e passa nos limiares | 2026-08-18 |
| Quality gate | `pnpm check` (Node 24) | verde nos PRs #52–#55; CI `check`/`database`/`e2e` verdes | 2026-08-18 |

## P1: Fase F1 (18/08/2026)

| Evidência | Comando/artefato | Resultado | Data |
|---|---|---|---|
| Estado do pipeline aplica do zero | job `database` (stack local efêmera) no PR #58 | migrations do zero + `rls_non_interference.sql` + `supabase db lint` verdes; o job pegou `begin_processing_run` como `security invoker` (tenant não tem INSERT em runs/jobs) antes de qualquer coisa ir ao projeto | 2026-08-18 |
| Modelo de autorização do worker | `supabase/tests/rls_non_interference.sql` (bloco F1) | conta de serviço sem vínculo com organização; credencial desconhecida e capability errado recusados (`42501`); capability morre com o job; tenant vê progresso mas não o `payload`; documento de outro escopo não entra na fila (`P0002`); tenant B não vê nada; reprocesso não sobrescreve perfil aceito | 2026-08-18 |
| Advisor de segurança | MCP `get_advisors` (security) após aplicar `20260818171246` | **14 avisos**, 7 funções `security definer` em `public` executáveis por `anon` e por `authenticated`; investigação mostrou que `anon` executava **as 15** funções de `public` e tinha `arwdDxtm` em 7 tabelas (default privileges do bootstrap, nunca revogadas) | 2026-08-18 |
| Correção verificada no projeto | `execute_sql` (mesmas asserções do teste) | `anon` sem nenhum privilégio em `public`; nenhum `security definer` em `public`; `has_column_privilege(authenticated, processing_jobs.payload, select) = false` e `status = true`; `insert` em `processing_runs` negado; 0 tabelas sem FORCE RLS; advisor de segurança: **0 lints** | 2026-08-18 |
| Índices de FK do pipeline | MCP `get_advisors` (performance) + `20260818172357` | 10 FKs sem índice de cobertura fechadas; restam apenas INFO de `unused_index` (banco ainda sem tráfego) e a estratégia de conexões do Auth | 2026-08-18 |
| Quality gate | `pnpm check` (Node 24) | lint, tipagem, testes e build verdes com os tipos regenerados (`database.ts` +475 linhas) | 2026-08-18 |
| CI: passo do Playwright travando | log do job `e2e` (PR #58) | o passo travava no `apt-get` do `--with-deps`, sempre após `Get:1 file:/etc/apt/apt-mirrors.txt Mirrorlist` (≈30 min no #57, 2× ≈15 min no #58); o mesmo log mostra as libs do Chromium já instaladas na imagem. Sem `--with-deps` + cache de `~/.cache/ms-playwright` + timeout: job completo em ~5 min | 2026-08-18 |
| Parsers contra o data room (PR #59) | `pnpm --filter @offroad/document-parsers test` | 27 testes; os 8 arquivos (3 PDF, 3 XLSX, 2 DOCX) viram camada e passam por `indexLayer` (que lança em id duplicado); texto de toda âncora é substring do texto do documento; reparse byte-idêntico; `DRE_MENSAL_LONG` > 1.000 células, `CONTRATOS_DIVIDA` com vencimentos em faixa plausível, escala 1e6 declarada no `LEIA-ME` e na página da DRE | 2026-08-18 |
| exceljs devolvia planilha vazia | leitura do XML do pacote | os workbooks declaram SpreadsheetML com prefixo `x:` (`<x:worksheet>`), válido e lido pelo Excel; o matcher do exceljs só casa tags sem prefixo → `parseWorkbook` undefined e **todo o export do ERP parseava para nada**. Leitor próprio (jszip + fast-xml-parser) casando local names: 6 abas, 3.976 células na DRE mensal | 2026-08-18 |
| Formatos universais (PR #60) | `pnpm --filter @offroad/document-parsers test` | 36 testes; `.xls` real (BIFF escrito no próprio teste) lido com valores, abas e aba oculta, âncoras idênticas às de um `.xlsx`; subtipo do contêiner Office 97 detectado pelo stream (`Workbook`/`WordDocument`/`PowerPoint Document`), com planilha renomeada para `.doc` ainda lida como planilha; conversão registra o salto extra (`conversion` + aviso); OCR preenche a página mas mantém `scanned: true` e descarta blocos abaixo do piso de confiança | 2026-08-18 |
| Defesas contra arquivo hostil | testes do pacote | `.docx` válido com 40 MB de zeros recusado como bomba de descompressão; entidades XML desligadas; `.xls/.doc/.ppt` recusados com mensagem acionável; arquivo vazio recusado; tipo decidido por magic bytes (planilha renomeada para `.pdf` não chega ao parser de PDF) | 2026-08-18 |
| Cadeia de credenciais do worker | CloudShell (`sa-east-1`) + `execute_sql` | `sha256` do segredo `offroad/worker-token` bate com `private.worker_tokens` (`HASH=MATCH`); a conta de serviço `document-worker@offroad.capital` autentica (`HTTP 200`) sem service-role e sem vínculo em `organization_memberships`; `worker_claim_job` com o token real responde `{"claimed": false}` (`HTTP 200`), credencial aceita, fila vazia | 2026-08-19 |
| Segredos do worker no cofre | `aws secretsmanager describe-secret` nos seis nomes | os seis existem em `sa-east-1`; senha e token gerados por `openssl` dentro do CloudShell e gravados direto no cofre, nenhum valor passou por arquivo, log, commit ou chat; a task definition referencia por **nome** e o workflow resolve o ARN no registro (o sufixo do ARN muda quando um segredo é recriado) | 2026-08-19 |
| Política de insert em `document-layers` | `execute_sql` no projeto (transação revertida) | tenant A grava sob o próprio `<org>/<sessão>/…`; recusa (`insufficient_privilege`) ao gravar no prefixo do tenant B e ao gravar fora da convenção de caminho; tenant B não lê nada de A nem grava no prefixo de A; `rollback` verificado sem resíduo (0 usuários, 0 orgs, 0 objetos) | 2026-08-19 |
| Emissão das URLs assinadas | `pnpm --filter web test` | 37 testes (6 novos): caminho da camada mantém organização e escopo como pastas 1 e 2 (é o que as políticas leem), cada tentativa ganha objeto próprio (bucket segue só com insert), download assinado em `opportunity-documents` e upload em `document-layers` com TTL de 1 h, e a run inteira é recusada se um único link falhar | 2026-08-19 |
| Extração real medida sobre o data room | workflow `Measure extraction`, 6 execuções | recall material 44,6% → **75,4%**, precisão 52,3% → **79,0%**, ~US$ 2,50/caso; cada correção derivada do dump de flags do run anterior (runs 32306812508 · 32308765792 · 32315077187 · 32320129899 · 32322051560 · 32324397398) | 2026-08-20 |
| Worker estável no código com extração | `private.worker_tokens.last_used_at` amostrado em 11:32:14 e 11:34:45 UTC | idade de poll de 5,0 s e 0,26 s, poll contínuo a cada 5 s; um worker em crash-loop só faz poll em rajadas curtas após o boot | 2026-08-20 |
| Flag do pipeline não é gravável pelo tenant | `has_column_privilege` no projeto | `pipeline_enabled` update = **false**, select = true; `name` update = true (demais colunas intactas); `anon` sem select na tabela | 2026-08-20 |
| Comando de candidatos exige capability token | `execute_sql` no projeto (transação revertida) | token desconhecido recusado (`42501`); `anon` não alcança a função (`insufficient_privilege`); asserção adicionada ao teste de RLS | 2026-08-20 |

| Materiais imprimíveis com citação | `pnpm --filter @offroad/case-render test` | 8 testes: `<script>` e `&` vindos do modelo escapam; marcador de citação reaproveita o número já emitido (`2,1`) e resolve no apêndice até o arquivo de origem; id sem fonte conhecida **imprime mesmo assim** (marcador órfão é defeito visível, esconder é pior); cabeçalho de tabela repete entre páginas; diálogo de impressão só abre com `?print=1` | 2026-08-20 |
| Caso computado uma vez por estado do data room | leitura de `case-pipeline.ts` + `pnpm check` | `saveCaseState` estava escrito e **nunca chamado**: cada render da tela re-rodava reconciliação, dimensionamento, term sheet e a chamada de modelo do brief. `resolveCaseState` fingerprinta arquétipo, status, contagens de documento/candidato/resposta e o `updated_at` mais recente dos candidatos | 2026-08-20 |
| Modelo financeiro calcula o que um desk confere | `pnpm --filter @offroad/financial-model test` | 19 testes com avaliador de planilha próprio executando as fórmulas como o Excel: sem amortização na carência e SAC depois (45 M / 4 anos = 11,25 M/ano, saldo zerado no ano 5), principal nunca acima do saldo, serviço da dívida negativo em toda aba que o cita, DSCR = CFADS / saída, IR só sobre lucro **por ano** (nos anos finais a dívida amortiza, juros caem e volta a haver imposto), alavancagem caindo com a amortização. Três expectativas minhas estavam erradas e o avaliador pegou as três | 2026-08-20 |
| Célula de fórmula sem cache abre como `#N/A` | leitura do XML do `.xlsx` + teste de ida e volta | `{t:"n", f}` sem `v` sai como `t="e"` (tipo **erro**), invisível no objeto do workbook, visível só no arquivo. Corrigido com `v` placeholder; sem `calcChain.xml`, o Excel recalcula e descarta os zeros. Guard verificado falhando contra a codificação quebrada antes de ser mantido. Medido também: SheetJS community **não** escreve fonte, preenchimento nem painel congelado; larguras de coluna e formatos numéricos sobrevivem | 2026-08-20 |
| Correção deixou de ser destruída | `supabase/tests/rls_non_interference.sql` (bloco de revisão) | `review_intake_candidate` sobrescrevia `normalized_value` no lugar. Agora as 4 decisões do bloco geram 4 linhas em `extraction_feedback`; `proposed_value` da edição é o valor **anterior** e não a correção; nenhuma decisão que não seja `edit` carrega `corrected_value`; UPDATE e DELETE recusados | 2026-08-20 |
| Ledger append-only na ACL, não só na política | `execute_sql` como `role authenticated` | UPDATE = `42501`, DELETE = `42501`. Ausência de policy sozinha faria o UPDATE afetar **zero linhas em silêncio**; o que recusa é a falta do grant. `authenticated` com apenas `INSERT,SELECT`; RLS e FORCE ligados; exatamente duas policies (`a`, `r`) | 2026-08-20 |
| Política de auto-accept aprende com o histórico | `pnpm --filter @offroad/extraction-learning test` | 27 testes: Wilson(2,2) < Wilson(47,50); erro de escala (71.000 ↔ 71.000.000, 0,14 ↔ 14) separado de arredondamento e de troca de sinal; campo com erro de escala travado a 0,999 de confiança; campo com limite inferior abaixo de 0,5 travado, **encontrado por teste que falhou**, porque com o teto da barra em 0,99 um campo medido em 10% ainda passava enquanto a política parecia rígida; campo sem histórico **não** é travado | 2026-08-20 |
| Pedido inicial não vira data room | `pnpm --filter @offroad/credit-playbook test` | O dia zero já pedia 10–11 itens por operação (6 documentos + 5 perguntas), dentro dos 15–20 que o guia de IRL recomenda, o problema era moldura, não volume. Teste agora **impede** que `now` passe de 20 itens (e exige ao menos 6); toda operação precisa carregar tier de diligência e de fechamento; item de fechamento nunca entra em `missing` nem nas contagens | 2026-08-20 |
| "Não se aplica" exige razão em três camadas | `pnpm check` + migration `20260820145017` | Tipo (`resolvedBy` só resolve com nota), server action (recusa `validation`) e check constraint no banco. Linha sem resposta e sem nota é recusada pela constraint `intake_information_answers_carries_something`; resposta contra um `notice` é recusada pela action | 2026-08-20 |
| Job `database` falha por colisão de porta, não por código | log do run 32383127190 (PR #93) | as 27 migrations aplicaram; a falha foi `failed to bind host port 0.0.0.0:54324 ... address already in use` no `supabase_inbucket`. Re-execução do job passou. Flake de runner registrado para correção separada | 2026-08-20 |

## Advisor universal e fluxo privado governado, promoção de 02/09/2026

| Evidência | Comando/artefato | Resultado | Data |
|---|---|---|---|
| Arquitetura consolidada | PR #346, commit `3725a542` | fundação universal BR/US, memória por projeto, pesquisa governada, controles operacionais e fluxo privado completo promovidos como uma única arquitetura; PR #345 encerrada como substituída | 2026-09-02 |
| Gate integral antes do merge | Quality run `33587650680` | database/RLS em 1m47s, E2E em 3m54s, lint/typecheck/test/build em 6m52s e Vercel preview aprovados | 2026-09-02 |
| Gate integral em `main` | Quality run `33588131071` | migrations do zero, não interferência, controles fail-closed, três verticais públicas, DAG semântico, E2E Playwright e build de produção aprovados | 2026-09-02 |
| Banco de produção | Supabase `ifnogpksgdadruooqydi` | seis migrations aplicadas em ordem: memória relacionada, controles/invalidação, cache público, capital planning, contexto privado preliminar e decisão preliminar; todos os novos ledgers e o cache permaneceram vazios | 2026-09-02 |
| Segurança pós-migration | Supabase Advisors + inspeção de privilégios | `anon` sem acesso; tabelas públicas de controle com RLS e FORCE RLS; escrita direta negada a `authenticated`; cache privado sem grants. Dois INFO `rls_enabled_no_policy` permanecem deliberadamente nas tabelas privadas fail-closed | 2026-09-02 |
| Deploy web | Vercel deployment `9iHU9GnUgyF91jmeDTHMMZJtWnf4` | deployment de `main` concluído com status success | 2026-09-02 |
| Deploy worker | workflow `33588131083` | imagem construída, task definition registrada e rollout ECS estabilizado em 5m01s | 2026-09-02 |
| Fronteira externa | contratos, RPCs e interface | nenhuma distribuição automática; introdução exige representação verificada, material exato, destinatários exatos e autorização específica; nenhum provedor pago foi chamado na promoção | 2026-09-02 |

## Deal Captain e remediação da auditoria, 02/09/2026

| Evidência | Comando/artefato | Resultado | Data |
| --- | --- | --- | --- |
| Abstenção preservada | `@offroad/model-gateway` | campo obrigatório nullable sobrevive; campo opcional artificial é removido apenas no adapter OpenAI; fallback Anthropic não perde `null` | 2026-09-02 |
| Roteamento negativo | `@offroad/agent-contracts` | `Não aprovo essa estrutura` não vira commit e `Não envie o material` não vira ação externa | 2026-09-02 |
| Plano limitado | `work-system.ts` + 33 testes | plano dinâmico referencia exclusivamente TaskSpecs compilados, valida dependências, aprovação externa, evidência, decisão e ciclo | 2026-09-02 |
| Persistência capability-bound | migrations `20260903034438` a `20260903034457` | worker não envia tenant; banco resolve job, sessão, projeto e plano para pesquisa pública ou análise privada, rejeita TaskSpec inventada e grava timeline bilíngue | 2026-09-02 |
| Segurança de supply chain | `.github/workflows/security.yml` | CodeQL, dependency review, Trivy de repositório e imagem, SBOM e actions pinadas por SHA adicionados | 2026-09-02 |
| Verificação local | Node 24.19.0 | contratos 33/33, worker 106/106 e `pnpm check` forçado com 42/42 pacotes em lint, typecheck, testes e build | 2026-09-02 |
| Banco remoto | histórico de migrations | estado intermediário superado em 03/09; produção e repositório reconciliados em 164 versões | 2026-09-02 |

## Memória operacional e projeção analítica, 03/09/2026

| Evidência | Comando/artefato | Resultado | Data |
| --- | --- | --- | --- |
| Coverage e perguntas | `agent-assessment.ts` + testes do worker | documentos e respostas fecham requisitos automaticamente; conflitos ganham prioridade; duplicatas são eliminadas; cada rodada fica limitada a três perguntas | 2026-09-03 |
| Decisões versionadas | `worker_record_agent_assessment_v1` | recomendação, alternativas, evidências, premissas e incertezas persistem no projeto; replay não duplica decisão e automação não substitui decisão humana confirmada ou rejeitada | 2026-09-03 |
| Teste SQL transacional | `supabase/tests/agentic_dcm_work_system.sql` em staging e produção | comando real gravou coverage, request, decisão e três eventos; autoria atribuída; replay idempotente; lote com quatro perguntas recusado; rollback sem resíduos | 2026-09-03 |
| Schema canônico | Supabase production + repositório | 164 migrations em ambos os lados e zero versões divergentes; oito migrations novas aplicadas em ordem | 2026-09-03 |
| Segurança remota | Supabase Advisors de produção | zero achado acionável de segurança ou performance; zero foreign key sem índice; somente INFO de tabelas privadas fail-closed e índices novos ainda sem tráfego | 2026-09-03 |
| Interface de trabalho | página do projeto + `advisor-project.tsx` | chat mostra timeline e próxima intervenção; painel lateral mostra plano, cobertura e decisões; consulta preserva RLS por projeto e organização | 2026-09-03 |
| Gate integral | `fnm exec --using=24 pnpm check` + PR #374 | lint, typecheck, testes e build verdes nos 42 pacotes; web 172, worker 113, contratos 33; Next.js gerou 32 páginas; banco, E2E, CodeQL, dependency review, Trivy e SBOM verdes | 2026-09-03 |

## Packs econômicos Pareto, implementação de 03/09/2026

| Evidência | Comando/artefato | Resultado | Data |
| --- | --- | --- | --- |
| Registry econômico | `@offroad/credit-playbook/depth-packs` | 17 manifestos e 33 situações econômicas; coverage, procedimentos, cálculos, termos, mercado, disconfirmers e gates versionados | 2026-09-03 |
| Integridade das referências | `auditDepthPackRegistry` | nenhum procedimento, cálculo ou dependency id inexistente; falha fechada coberta por teste | 2026-09-03 |
| Composição sem fragmentação | `@offroad/dcm-specialization` | refinance + BR + debênture + covenant + downside e acquisition + US + bank/private credit compilam por packs reutilizáveis | 2026-09-03 |
| Omissão explícita | caso `situation:rescue_or_dip` | situação reconhecida no catálogo e devolvida como activation key não atendida; nenhum pack genérico é inventado | 2026-09-03 |
| Gate anti-marketing | `assessDepthPackPromotion` | benchmark ou revisão independente reprovados impedem produção; instrumento/jurisdição sem revisão legal também bloqueiam | 2026-09-03 |
| Integração do Deal Captain | `apps/document-worker/src/agent-plan.ts` | sinais explícitos PT-BR/EN-US ativam perfil; requirements são ligados a TaskSpecs e o perfil entra no snapshot persistido | 2026-09-03 |
| Estado de homologação | maturidade dos 17 packs | `implemented`; zero pack marcado `tested` ou `production`; gold/adversarial econômico, benchmark e revisão humana ainda pendentes | 2026-09-03 |

## Motor financeiro institucional, implementação de 03/09/2026

| Evidência | Comando/artefato | Resultado | Data |
| --- | --- | --- | --- |
| Dívida indexada | `@offroad/financial-core/indexed-debt` | IPCA pago e capitalizado, cupom caixa e PIK, amortização, serviço, despesa financeira e saldo final permanecem separados; taxa indexada sem tratamento explícito falha fechado | 2026-09-03 |
| Modelo integrado | `@offroad/financial-model/institutional-model` | DRE, balanço, fluxo de caixa, capital de giro, PP&E, imposto, dívida, liquidez e patrimônio fecham período a período | 2026-09-03 |
| Premissas e cenários | `assumptions.ts` | fonte, data, locator, racional, metodologia, confiança, limites e impacto são obrigatórios; alteração cria cenário filho e preserva a base | 2026-09-03 |
| Curvas | `market-curves.ts` | curvas datadas, interpolação, extrapolação, lag, piso, teto e spread rastreáveis; taxa por instrumento exige lineage própria | 2026-09-03 |
| IPCA ponta a ponta | `institutional-model.test.ts` | mesma dívida como IPCA capitalizado fecha 2027 em principal 262; como IPCA caixa fecha em 250 e reduz caixa em 12; os dois balanços fecham | 2026-09-03 |
| Revisão independente | `review.ts` | divergência de balanço ou dívida, premissa sem suporte, cenário misturado e indexação ambígua bloqueiam; engine nunca se autopromove a expert | 2026-09-03 |
| Pack setorial | `sector.food-consumer-staples.br-v1` | drivers de categoria, preço, volume, mix, câmbio, commodities, hedge, safra, capital de giro, capex e ramp-up implementados com maturidade `implemented` | 2026-09-03 |
| Testes focados | Vitest | financial-model 33/33, financial-core 66/66 e credit-playbook 162/162 verdes | 2026-09-03 |
| Gate integral | `fnm exec --using=24 pnpm check` | lint, typecheck, testes e build verdes nos 43 pacotes; web 176, worker 114, evals 38; Next.js gerou 34 páginas | 2026-09-03 |

## Entrada conversacional do workspace, 04/09/2026

| Evidência | Comando/artefato | Resultado | Data |
| --- | --- | --- | --- |
| Identidade bilíngue | `apps/web/messages/pt-BR.json` e `en-US.json` | mesmas chaves para saudação, título e quatro exemplos; teste de paridade aprovado | 2026-09-04 |
| Fluxo preservado | `AdvisorStart` | mudança restrita à hierarquia visual; criação atômica, upload privado, início da leitura e roteamento mantidos | 2026-09-04 |
| Qualidade local | web typecheck, Vitest, ESLint e Next build com Node 24.19.0 | tipos aprovados; 31 arquivos/182 testes aprovados; lint aprovado; build de 34 páginas aprovado | 2026-09-04 |

## Criação de conta e verificação de e-mail, 04/09/2026

| Evidência | Comando/artefato | Resultado | Data |
| --- | --- | --- | --- |
| Seletor removido do produto | `apps/web/src/app/[locale]/signup/` | componente, dez rótulos, onze chaves de mensagem e vinte e três regras de CSS excluídos; nenhuma referência remanescente a `entry_path`, `originating_role` ou `job_title` no app | 2026-09-04 |
| Jornada padrão documentada | `apps/web/src/lib/auth/registration.ts` | `defaultRegistrationJourney` substitui a escolha de caminho; `registration.test.ts` cobre metadados sem cargo | 2026-09-04 |
| Verificação nomeia o destinatário | `signup/verify/page.tsx` + `signup-cookie.ts` | cookie de cadastro alimenta `verifyBodyNamed`; ausência do cookie cai para a cópia genérica sem quebrar a tela | 2026-09-04 |
| Jornada ponta a ponta | `document-first-intake.spec.ts` | o E2E prova a ausência dos campos removidos e exige o e-mail impresso na tela de verificação | 2026-09-04 |
| Gate integral | `fnm exec --using=24 pnpm check` | lint, typecheck, testes e build verdes; 43/43 tarefas | 2026-09-04 |

## Contexto profissional multivalorado, 04/09/2026

| Evidência | Comando/artefato | Resultado | Data |
| --- | --- | --- | --- |
| Migração aplicada | `20260904164935_professional_context_multi_select` | arrays criados com vocabulário restrito; seis colunas de capacidade removidas do perfil pessoal; ambos os loaders de contexto e a RPC de gravação reescritos; `v1` e a cópia órfã `..._before_personal_institutio` removidas | 2026-09-04 |
| Regressão SQL no projeto | `supabase/tests/professional_capability_context.sql` via `execute_sql` | "professional context regression passed"; várias funções e áreas preservadas, nome da organização descartado para quem não declarou vínculo, papel fora do vocabulário recusado, capacidade institucional continua vazia; rollback verificado (0 linhas residuais) | 2026-09-04 |
| Advisors | MCP `get_advisors` security | 0 erros e 0 avisos; apenas dois INFO pré-existentes de tabelas `private` sem policy | 2026-09-04 |
| Worker separa pessoa de instituição | `agent-operation-brief.ts` | `institutionOperatingModels` passa a vir só de `institution_capabilities`; a autodescrição de uma pessoa não é mais lida como capacidade do empregador | 2026-09-04 |
| Testes do worker | Vitest | 25 arquivos / 128 testes verdes com as fixtures no formato novo | 2026-09-04 |
| Jornada ponta a ponta | `document-first-intake.spec.ts` | o E2E exige que nada venha pré-marcado, que o campo da organização só exista após declarar vínculo e que duas funções e duas áreas sejam salvas juntas | 2026-09-04 |
| Tela verificada | dev server, 1280 e 1440 px | quatro perguntas numeradas, desdobramento condicional, estados de seleção e ações conferidos por captura | 2026-09-04 |
| Gate integral | `fnm exec --using=24 pnpm check` | lint, typecheck, testes e build verdes; 43/43 tarefas | 2026-09-04 |

## Atlas canônico de intenções, 04/09/2026

| Evidência | Comando/artefato | Resultado | Data |
| --- | --- | --- | --- |
| Contrato funcional | `docs/product/CANONICAL_INTENT_WORKFLOW_ATLAS.md` | envelope com intenção, objetos, responsabilidade, sponsor, audiência, evidência, autoridade e output; 20 famílias combináveis | 2026-09-04 |
| Cobertura por função | seção 9 do Atlas | 14 lentes profissionais, com separação explícita entre Analyst, Associate, VP e Director/MD; função não é rota de runtime | 2026-09-04 |
| Pareto de homologação | seção 10 do Atlas | 20 casos cobrindo produção, revisão, originação, companhia, crédito, investimento, estruturas, materiais, matching e monitoramento | 2026-09-04 |
| Decisão arquitetural | ADR 0021 + Constituição 2.5 | seis entradas preservadas como atalhos; arquitetura-alvo compila workflows pelo Intent Envelope e permite objetos não company-led | 2026-09-04 |
