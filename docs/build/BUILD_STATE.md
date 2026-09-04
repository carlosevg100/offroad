# Build State

Atualizado em: 2026-09-04
Baseline: `main` após PR #401, commit `16a3e07`
Repositório: `carlosevg100/offroad` · Produção: `https://offroad.capital`

## Nome curto e entrada de acesso reescrita, 04/09/2026

- A marca passa a ser **Offroad**, não Offroad Capital, acompanhando a logotipia nova. O domínio,
  o e-mail e a razão social não mudam; muda o nome exibido em metadados, manifest, título do
  navegador e toda a copy de produto.
- A tela de acesso perdeu o rótulo `Acesso institucional`, o título `Acesse a plataforma Offroad
  Capital` e as duas frases que descreviam controle de acesso em vocabulário interno. No lugar
  entrou a declaração de marca da própria casa, o motivo de entrar, e a promessa de privacidade
  dita como o usuário a entende.
- O título do painel de contexto voltou ao serif da marca. A camada premium o havia redefinido
  para o grotesco pesado, o que quebrava a frase em seis fragmentos empilhados.
- Corrigido um defeito que já existia em produção: o link de voltar é posicionado de forma
  absoluta no canto do painel, então um formulário alto o bastante para começar no topo, o de
  cadastro, renderizava o próprio título por baixo dele.
- Gate integral verde nos 43 alvos em Node 24. Login e cadastro verificados em servidor local.

## Casca e entrada do advisor refeitas, 04/09/2026

- A barra lateral virou um componente cliente único, recolhível para 58 px, com o estado em cookie
  para o servidor já renderizar na largura escolhida. `Novo chat` com `⌘J` é a ação primária e cria
  a conversa direto; a busca subiu para o topo com `⌘K` em vez de ficar enterrada na lista.
- `Recentes` é lista plana. Um gatilho do banco cria uma pasta por projeto, com o mesmo nome, e era
  isso que fazia a barra parecer uma coleção de pastas de uma conversa só. A distinção virou coluna,
  `workspace_project_groups.auto_created`, escrita pelo gatilho e limpa ao renomear, porque nomear
  uma pasta é o ato que a torna do usuário. Heurística por nome quebrava no primeiro rename, e por
  contagem esconderia uma pasta real com uma conversa só, que é exatamente o caso da pasta
  `Rede Horizonte` em produção. Pastas do usuário continuam visíveis e continuam podendo ser criadas.
- As duas migrations foram aplicadas em produção e verificadas: das quatro pastas ativas, só a
  gerada pelo gatilho foi marcada. O `staging` não pôde servir de ensaio porque está em
  `MIGRATIONS_FAILED` desde agosto e sequer possui a tabela; é o achado P2-07 da auditoria, ainda
  aberto. A prova limpa é o job de banco no CI, que reconstrói todas as migrations do zero.
- A entrada mostra o símbolo da marca, saudação por horário em preto e a pergunta em cinza. O
  placeholder digita e apaga sete pedidos reais, um por função profissional, e para assim que o
  campo recebe texto. Os cinco pills saíram; quatro sugestões em texto escrevem um pedido completo
  e preservam a dica de jornada. `Continuar` traz os três trabalhos recentes com estado em mono.
- Superfícies planas, hairline de 1 px, raio de 9 px, zero sombra, uma rampa de cinza só e a IBM
  Plex Mono reservada a metadado. Sessenta e seis regras de CSS morto removidas, cada uma provada
  morta por varredura das classes usadas no TSX.
- Verificado em servidor local por rota de preview temporária, criada e apagada no mesmo trabalho,
  em 1180 px expandido e recolhido. Gate integral verde nos 43 alvos em Node 24. O E2E foi
  atualizado para a estrutura nova. Produção ainda não recebeu esta fatia.

## Marca nova em site e plataforma, 04/09/2026

- O farol foi aposentado. A identidade passa a ser o anel de pincel com a logotipia Didone, nos
  dois arquivos de origem que o fundador aprovou. Ilustração representativa não sobrevive a
  tamanho de interface: em 24 px a torre, o facho e as rochas viravam um borrão, que era a causa
  real de a barra lateral e o favicon parecerem amadores.
- `scripts/generate_brand_assets.py` foi reescrito e produz tudo a partir de `docs/brand/`. As
  variantes claras trocam apenas o plano RGB e preservam o canal alfa original, então não existe
  redesenho, redesenho parcial nem reamostragem de proporção em lugar nenhum da cadeia.
- Os ícones quadrados levam o anel branco sobre o fundo `#0b0d0f` da própria plataforma, com um
  quinto da tela reservado de cada lado. Medido de 16 a 64 px: o contorno permanece aberto e a
  forma continua legível como um O em todos eles. O manifest passou de `#05192a` para `#0b0d0f`.
- `brand-mark` passou a dimensionar o ativo por altura em vez de largura, nas seis regras
  responsivas. A assinatura nova é 27% mais alta que a anterior na mesma largura, e com largura
  fixa ela estouraria os cabeçalhos. Por altura, mudança futura de proporção não quebra layout.
- Nove PNGs do farol foram removidos. Restam quatro ativos servidos, dois da assinatura e dois do
  símbolo, mais os ícones e a imagem social regenerados.
- Verificado no servidor local em 1440 px e em 375 px: cabeçalho público alinhado em ambos, sem
  transbordo. Gate integral verde. Produção ainda não recebeu esta fatia.

## Sistema de trabalho agêntico de DCM, schema em produção, 03/09/2026

- Todo trabalho analítico agora recebe um plano persistente do Deal Captain, limitado ao DAG
  compilado e aos efeitos previamente autorizados. Status reais do worker alimentam a timeline do
  chat; não há animação fictícia de atividade.
- Análises públicas, planejamento de capital e casos privados projetam seus resultados em três
  memórias operacionais do projeto: cobertura de evidências, decisões versionadas e no máximo três
  pedidos de informação de alto valor por rodada.
- Documentos classificados e respostas já existentes satisfazem requisitos automaticamente. O
  sistema não pergunta novamente o que já conseguiu ler; conflitos financeiros têm precedência
  sobre pedidos genéricos de documentação.
- A interface central mostra atividade e perguntas como conversa. O painel direito mostra o plano,
  documentos, cobertura, decisões e artefatos sem tirar o usuário do projeto.
- Produção recebeu oito migrations em ordem: work system, índices, eventos de runtime, projeção de
  assessment, autoria, duas correções fail-closed de resolução de variável e índices de ator dos
  grupos de projetos. O ledger remoto e o repositório possuem exatamente 164 versões, sem drift.
- O teste transacional real passou em staging e produção: persistência, replay, autoria, isolamento
  por capability e limite de três perguntas, sempre com rollback. O Security Advisor não possui
  achado acionável e o Performance Advisor não possui foreign key sem índice.
- O gate integral em Node 24 passou nos 42 pacotes. Web: 172 testes; worker: 113 testes; contratos:
  33 testes; build Next.js: 32 páginas. O PR #374 repetiu banco, E2E, build, CodeQL, dependency
  review, Trivy de repositório e imagem e SBOM com resultado verde.
- Estado: schema compatível já promovido e validado em produção; web e worker aguardam somente o
  merge coordenado do PR #374.

## Identidade canônica e decisão ANBIMA, candidate, 02/09/2026

- A Constituição, a nova ADR 0019, `AGENTS.md`, README, handoff, workflow, metadados, manifest,
  homepage PT-BR/EN-US e gerador de assets agora descrevem uma única Offroad: o advisor AI-native
  especialista em dívida que ajuda companhias e profissionais a pensar, investigar, analisar,
  decidir, estruturar e executar trabalhos relacionados a dívida.
- Originação, estruturação de operações, materiais, matching e introdução qualificada permanecem
  capacidades, não a identidade do produto. A ADR 0004 foi preservada como registro histórico e
  marcada como superada; handoffs arquivados receberam aviso explícito de snapshot histórico.
- Um teste de contrato impede que metadados, manifest e homepage retomem a categoria histórica.
- ANBIMA Data público foi separado do ANBIMA Feed: o primeiro permanece fonte oficial
  complementar e manual; o segundo continua desativado e contratado. A APP gratuita permite
  Sandbox fictício, não dados oficiais de produção. Nenhuma credencial foi armazenada ou usada.
- O Client Secret exibido em captura precisa ser rotacionado antes de qualquer uso futuro.
- O gate integral em Node 24 passou nos 42 pacotes; web tem 172 testes verdes e o build Next.js
  gerou 32 páginas. As homepages PT-BR e EN-US foram inspecionadas localmente sem overflow.
- Estado: candidate local; produção e provedores pagos não foram alterados.

## Entrada instantânea no projeto, candidate, 02/09/2026

- A criação do workspace continua sendo uma única transação, mas a fila idempotente do worker
  passa a ser agendada com `after()` somente depois da resposta ao navegador. Disponibilidade ou
  latência do worker deixa de bloquear a entrada no projeto.
- Títulos repetidos deixam de provocar uma primeira transação fracassada e um segundo RPC. O
  wrapper `security invoker` resolve a colisão no banco e chama o comando privado existente uma
  única vez; o sufixo curto aparece somente quando o título já está em uso.
- O teste adversarial cria dois projetos homônimos, confirma duas memórias distintas, preserva o
  replay por `request_id` e volta a verificar isolamento entre organizações.
- Staging recebeu `advisor_project_name_collision`; o teste SQL passou com rollback e o Security
  Advisor retornou zero findings. O gate Node 24 passou lint, typecheck, testes e build nos 42
  pacotes. Produção ainda não foi alterada por esta fatia.

## Fundação de inteligência de dívida BR/US, candidate, 01/09/2026

- O registro de fontes separa autoridade, descoberta e aquisição para Brasil e Estados Unidos.
  CVM, SEC, B3/ANBIMA públicas e RI vêm antes de buscadores; Perplexity e OpenAI Search descobrem
  URLs, e Firecrawl é somente fallback de aquisição. PitchBook, 9fin, Octus, Capital IQ, FactSet,
  LSEG, Economatica e feeds contratados permanecem desativados sem contrato e credencial explícita.
- Cada `company_debt_view`, `origination_thesis` e pesquisa pública do case compila uma estratégia
  versionada por jurisdição, capacidade, TTL, fontes disponíveis e regra de conclusão. Inferência
  de jurisdição por locale fica marcada para confirmação; geografia explícita ou domínio nacional
  tem precedência.
- Resolvedores oficiais para o cadastro da CVM e o índice de registrants da SEC preservam
  identificador oficial, candidatos e ambiguidade. Não selecionam silenciosamente homônimos e não
  retêm campos de contato do cadastro.
- Aquisição direta de URL pública exige HTTPS, valida DNS e redirecionamentos contra SSRF, limita
  tipo, tamanho, tempo e número de redirects e preserva hash e publisher. O adaptador Firecrawl v2
  pede zero retention e cache desligado; nenhuma chave o ativa por padrão.
- A cache global aceita exclusivamente material bruto de queries de projetos
  `public_information`. Ela não possui organização, usuário, projeto, conversa ou documento, não
  é exposta pela Data API e exige capability viva do worker. Casos privados continuam usando
  somente o ledger do próprio tenant.
- Métricas registram hits, chamadas por provider, writes e exposição máxima de custo. Cache hit
  reduz chamadas e custo estimado em vez de manter a reserva nominal original.
- Estado: candidate local. Nenhuma migration foi aplicada, nenhum conector pago foi ativado e
  nenhuma chamada paga foi feita. Os quatro jobs ainda sem executor continuam honestamente fora
  desta promoção.
## Persistência fail-closed do control plane, 01/09/2026

O candidato passa a persistir o que antes existia apenas como contrato puro. Um job de análise
grava, com sua capability temporária, o snapshot que aquela execução efetivamente provou. O
banco exige o input congelado e os fingerprints do relatório e manifesto persistidos, recalcula a
decisão, guarda blockers e warnings, e não aceita que o worker declare o próprio credenciamento.
A ausência de policy real do provider, orçamento, fonte, matemática conciliada ou decisão
confirmada continua visível e bloqueada.

O registry privado de capacidades é append-only e exige escopo e etapa estreitos. `production`
requer procedimento, owner, implementação, gold/adversarial, zero crítico e vinte IDs distintos
vindos do ledger de execuções controladas. Nenhum escopo foi artificialmente credenciado por esta
entrega.

Alterações em documento, input econômico, Deal State ou intervenção humana canônica geram um
evento de invalidação persistente. Aprovação de pacote externo e introdução qualificada exigem
snapshot atual, acreditação de produção e fingerprints exatos de caso, material, match, plano e
autorização; qualquer evento posterior fecha o gate.

Esta é uma mudança candidata. O [Quality run 33529805136](https://github.com/carlosevg100/offroad/actions/runs/33529805136)
reconstruiu o banco do zero e passou RLS, adversariais, verticais, DAG, lint, gate integral e E2E.
Não houve migration remota, deploy, ativação de provider ou chamada paga.

## Control plane do pre-mortem, 01/09/2026

O candidato transforma os principais modos de morte do produto em contratos fail-closed. A nova
camada não calcula um score: fonte insuficiente, cálculo crítico não determinístico, artefato stale,
boundary de segurança não verificada ou autoridade ausente continuam bloqueando mesmo se todo o
resto estiver verde.

`@offroad/release-governance` passa a acreditar capacidades por escopo e etapa (`Represent`,
`Analyze`, `Recommend`, `Structure`, `External release`) e a separar uso preliminar, decisão
interna, material externo e ação externa. Produção exige procedimento, implementação, owner,
gold/adversarial, zero crítico e vinte casos reais distintos. O rollout `active` mantém duas ondas
disjuntas de dez casos e agora também exige aceite do control plane.

O mesmo pacote ganhou invalidação transitiva de evidência até cálculos, claims, materiais,
aprovações e lender matching; e um ledger tipado de intervenção humana capaz de expor correção
manual recorrente e minutos não capturados. Os contratos puros agora possuem a implementação
persistente candidata descrita acima; ela ainda não está ativa em ambiente remoto.

`@offroad/model-gateway` agora recebe classe e finalidade em todas as chamadas reais de
classificação, extração, conversa, análise, estrutura, redação e auditoria. Existe policy
fail-closed por provider, inclusive fallback, exigindo assurance vigente, finalidade/classe
permitidas, treinamento proibido e `no_store` para dado não público. O worker aceita os registros
por ambiente, mas enforcement permanece desligado até DPA/ZDR/base legal reais serem cadastrados;
nenhuma promessa contratual de vendor foi inventada.

A matriz completa está em `docs/build/PRE_MORTEM_CONTROL_MATRIX.md`. Este slice não adiciona SSO,
SCIM, DLP, pentest, disaster recovery ou acreditação automática dos knowledge packs. Nenhuma API
paga foi chamada e produção não foi alterada. O gate integral `pnpm check` em Node 24 aprovou os
42 pacotes: web com 162 testes, worker com 85, model gateway com 22, release governance com 11 e
build Next.js com 32 páginas.

## Fundação Brasil–Estados Unidos e idioma contínuo, 01/09/2026

O candidato passa a separar idioma de trabalho, idioma das fontes e jurisdição econômica. O mesmo
projeto pode alternar PT-BR e EN-US pela navegação autenticada, preservando `projectId`, query e
histórico. A locale do turno atual governa a próxima resposta do worker. O painel traduz os 80
rótulos canônicos do plano sem duplicar IDs, TaskRuns ou o DAG congelado.

`@offroad/credit-ontology` ganhou contratos para perfil BR, US ou cross-border, moeda, framework
contábil, política de idioma, evidência original e tradução atribuída. A projeção de material em
outro idioma referencia o mesmo fingerprint de conteúdo e o mesmo fingerprint econômico. Uma
tradução nunca substitui a evidência nem dispara novamente análise, conciliação ou cálculo.

A arquitetura de knowledge agora exige núcleo universal, pack Brasil, pack Estados Unidos e ponte
BR–US, além dos packs setoriais, de instrumento e de mercado. Registros carregam fonte, publisher,
jurisdição, idioma, data de vigência/captura, `as_of_date`, versão, status, fingerprint,
confidencialidade, escopo de reutilização e classe de atualização. A ponte explicita equivalência
exata, funcional, parcial ou inexistente; CCB não pode ser traduzida silenciosamente como “note”.

As TaskSpecs continuam exatamente 80. M01 resolve jurisdição e regime de evidência; M05 define
idioma e audiência; C02 carrega conhecimento aplicável; S03 aplica filtros jurisdicionais; A09
gera variantes por audiência e idioma. O registry e o compilador subiram para `2026.09.01-v3`;
planos já congelados permanecem imutáveis.

Esta fatia implementa contrato, projeção de interface/conversa e guardrails. Ela não afirma que os
quatro knowledge packs estejam preenchidos ou acreditados, nem que todos os materiais finais já
possuam compilador bilíngue institucional. Popular, revisar, versionar e promover esse corpus e os
compiladores continua sendo um programa de conteúdo e evals próprio. `pnpm check` com Node 24
passou nos 42 pacotes; web tem 162 testes, worker 82, ontology e work-plan 29 cada, e o Next.js
compilou 32 páginas. Nenhuma API paga foi chamada.

## Missão universal de dívida, entrada inferida e memória anterior ao questionário, 01/09/2026

O candidato atual remove a ancoragem implícita num instrumento. A nova ontologia representa a
missão por necessidade de capital, fonte de pagamento, família de capital, alocação de risco e
executabilidade de mercado, sob evidência pública, privada autorizada ou híbrida. Recebíveis
passam a ser uma alternativa entre várias, não o produto-base. Usos mistos e tranches distintas
são válidos desde a fundação.

A home deixou de gravar `capital_planning` apenas porque nenhum atalho foi escolhido. Um roteador
determinístico infere o job do pedido e dos anexos; o atalho funciona somente como desempate. O
pedido “tenho uma reunião com a Camil e quero apresentar um pitch de alternativas de dívida” é
classificado como tese de originação, não como ordem de contato externo. Antes de ativar o DAG, o
contrato exige audiência, objetivo da reunião e relacionamento ou exposição atual, reunidos num
único pacote curto de contexto.

O worker recebe agora até oito projetos anteriores relevantes da mesma organização quando a
companhia citada coincide. Essa memória é capability-bound, exclui o projeto corrente e não
pesquisa outros tenants. O agente deve mencionar projeto, recência e work product anterior antes
de perguntar se o usuário deseja atualizar ou começar algo novo. O painel de trabalho exibe a
questão pendente e seu motivo enquanto aguarda a resposta.

Este slice ainda é candidato local. Ele não foi aplicado a staging ou produção e não executa uma
pesquisa pública em background enquanto faltam audiência e relacionamento; portanto a interface
é obrigada a dizer apenas o que está realmente em execução. Mudança de intenção que exija trocar
o plano congelado de um projeto já existente e os executores privados de análise, estrutura,
materiais e matching continuam sendo fatias separadas.

O gate integral local em Node 24 aprovou lint, typecheck, testes e build nos 42 pacotes; o Next.js
compilou 32 páginas e o worker foi empacotado. O Quality run `33518894896` repetiu esse gate em
runner limpo e também reconstruiu o Supabase do zero: migration, suíte integral de não
interferência, verticais públicas, ativação semântica, schema lint e E2E/Playwright passaram. O
preview Vercel foi publicado. Os testes focados cobrem o caso Camil, contexto em turnos
sucessivos, memória anterior à pergunta, regimes de evidência e usos mistos. Zero chamada de
modelo, busca ou API paga foi realizada.

## Roteamento semântico e ativação governada de DAG, 01/09/2026

O workspace passa a separar duas decisões. O roteador de pedido continua classificando intenção,
escopo e efeito; o novo roteador de execução decide, sem chamada de modelo, se o turno pode entrar
num executor já liberado, se falta um contexto obrigatório ou se deve permanecer apenas na
conversa. Produção de material, aprovação, simulação e ação externa nunca são reinterpretadas
como autorização para iniciar pesquisa. Projeto privado ou com documentos também não entra nos
executores públicos.

As primeiras ativações são `company_debt_view` e `origination_thesis`. Com identidade já presente
na memória do projeto, o roteamento e o handoff ao DAG usam zero chamadas de modelo. Quando o nome
aparece apenas na linguagem livre, a chamada conversacional já existente pode normalizar somente
o nome e o contexto declarados; ela não escolhe o executor. O worker exige suporte literal do nome
no histórico do usuário e recusa nomes genéricos. Website não apoiado é descartado.

A persistência é atômica por
`worker_record_agent_response_and_activate_v1`: mensagem, perfil da companhia, brief versionado,
run e job especializado são gravados juntos. A função valida capability, organização, projeto,
plano ativo, base pública, ausência de documentos, escopo exato e idempotência. Os tetos existentes
permanecem US$ 0,75/duas chamadas para originação e US$ 0,95/duas chamadas para company debt view.
Nenhum aceite de representação, aprovação de material ou autoridade de introdução é criado.

Esta capacidade está em produção por PR #341; PR #342 incorporou o teste SQL ao workflow de banco.
O PR gate `33506053970` e o gate com o teste obrigatório `33506895933` passaram reconstrução limpa,
RLS, E2E, lint, tipos, testes e build. O staging foi reconciliado com a vertical pública ausente e
recebeu as migrations remotas `20260901121555` e `20260901121603`; o teste transacional passou com
rollback. Produção recebeu `20260901122420`, passou o mesmo teste e mantém o wrapper apenas para
`authenticated`, com implementação privada fechada. Security Advisor retorna zero findings nos
dois ambientes. O worker `33506612853` estabilizou no ECS e o Vercel publicou produção. Zero API
paga foi chamada. Os demais jobs seguem `conversation_only` até que seus executores alcancem o
próprio gate.

## Workspace conversacional persistente, promoção controlada, 01/09/2026

A entrada autenticada foi redesenhada como um único workspace de projeto: histórico e projetos
na navegação lateral, conversa persistente no centro e plano, documentos e artefatos no painel de
trabalho. As cinco sugestões iniciais são atalhos de intenção dentro do mesmo composer; não criam
funis ou estados paralelos. Texto e arquivos podem iniciar o mesmo projeto, e o shell é criado
antes de qualquer chamada de modelo para que a navegação não espere análise paga.

O estado continua canônico: `capital_projects` é a raiz, `document_intake_sessions` delimita
documentos e evidências, `agent_conversations`/`agent_messages` preservam o histórico e
`capital_project_plans` congela o DAG aplicável. O comando transacional
`start_advisor_project_v1` cria esses quatro elementos de forma idempotente; o comando
`submit_advisor_turn_v1` persiste a mensagem e enfileira uma única resposta assíncrona, com teto
de uma chamada e US$ 0,25, sem autorizar mercado ou reescrever evidência. O worker recebe somente
o recorte do projeto: brief, perfil, inventário documental, estados do plano, artefatos e doze
mensagens recentes; nomes de arquivos não são tratados como prova. Projetos públicos podem receber documentos e passar a trabalho privado, mas essa
promoção mantém `representation_status = not_claimed`.

A fronteira legal foi corrigida no contrato: os termos de confidencialidade são aceitos uma vez
por organização e legitimam somente o trabalho privado. Representação não é presumida nem
registrada durante preparação. A autoridade para apresentar o caso continua sendo um gate
posterior de `Introduce`, vinculado ao projeto, à versão dos materiais, à política de identidade
e aos destinatários exatos.

As migrations canônicas `20260901112115_conversational_advisor_workspace.sql`,
`20260901112122_advisor_turn_queue.sql` e `20260901112129_advisor_initial_turn_identity.sql`
foram validadas primeiro no Supabase `staging` e, após os gates obrigatórios, promovidas ao banco
de produção. O teste SQL dedicado passou com rollback, incluindo
criação atômica, replay idempotente, fila do primeiro turno e isolamento entre tenants. O primeiro
replay detectou e corrigiu um empate de timestamps na identidade da mensagem inicial. Security
Advisor retornou zero findings em staging e produção; o Performance Advisor não introduziu aviso
da feature e mostra apenas informações históricas de índices ainda sem uso. O workflow Quality
`33501504771` aprovou banco, E2E e o gate integral dos 42 pacotes; no web, a suíte tem 160 testes,
no worker 74, e o build de produção compilou a nova superfície. O schema e a aplicação foram
promovidos por PR #339; o ajuste focado da suíte do worker entrou por PR #340. O run final
`33503989459`, o deploy do worker e o Vercel de produção passaram. Nenhuma API paga foi chamada.

Esta fatia entregou memória, superfície-base e turnos reais assíncronos. As duas verticais públicas
existentes reabrem primeiro no projeto conversacional e expõem o trabalho já executado a partir do
painel do mesmo projeto. A liberação acima conecta novos prompts a esses dois executores; a
atualização de plano, análise documental profunda, estruturação, materiais e matching continuam
sujeitos aos próprios gates antes de o workspace ser declarado completo.

## Workspace AI-native e primeira vertical pública de originação, 01/09/2026

A home autenticada passou a oferecer seis formas de começar sobre uma única memória de projeto.
A interface usa “Comece de onde você está” e “Como a Offroad pode ajudar agora?”, sem exigir que
o usuário formule tecnicamente um problema. As entradas são jobs com políticas de input, acesso,
primeiro work product e gate próprios; não são personas nem funis independentes.

A primeira vertical executável é `origination_thesis`. Ela cria projeto, brief e plano imutável;
abre o projeto imediatamente; executa nove TaskSpecs com dependências explícitas; realiza sete
buscas públicas limitadas; e usa uma única síntese estruturada para produzir um meeting brief com
sinais, hipóteses, condições, perguntas, desconhecidos e URLs verificadas. A navegação reabre o
projeto persistente, e o painel mostra TaskRuns reais em vez de progresso simulado.

O modelo recebe somente contexto público mínimo. O teto inicial é duas chamadas e US$ 0,75,
incluindo reserva máxima de US$ 0,035 para busca; a execução normal usa uma chamada de síntese. A
correção é incremental: registra a decisão sobre o fingerprint exato, invalida somente `M07`,
reaproveita `M06`, `C02` e `K04`, não repete pesquisa e permite apenas uma nova síntese com custo de
busca zero.

O schema foi promovido primeiro em `staging` e depois em produção pelas oito migrations canônicas
`20260901035241` a `20260901035319`. Tabelas, RPCs e `FORCE ROW LEVEL SECURITY` foram verificados
no projeto de produção. Os testes `origination_thesis_vertical.sql` e
`project_company_scope.sql` passaram com rollback, incluindo isolamento, capability incorreta,
ciclo completo dos nove artefatos, revisão M07-only e replay idempotente. A migration
`20260901035442_capital_project_fk_index_hardening.sql` eliminou os cinco foreign keys sem índice
introduzidos pelo runtime. Security Advisor e a categoria `unindexed_foreign_keys` do Performance
Advisor retornam zero findings tanto em staging quanto em produção. O ledger de briefs de
produção continua vazio; nenhuma execução de modelo foi disparada durante a promoção.

A PR #336 foi incorporada a `main`. O workflow Quality `33467602650` passou em banco, E2E e no
gate completo de lint, tipos, testes e build; o deploy do worker `33467602677` estabilizou no ECS;
e o Vercel publicou o deployment `5bBMwnK1VJe2NiwTKVc4YrinQ8NU`. Nenhuma API paga foi chamada
nessa validação. A primeira execução humana em produção permanece um teste explícito do produto,
com o orçamento limitado já descrito, e não uma etapa automática de deploy.

Esta entrega promove apenas a vertical pública de tese de originação. Ela está tecnicamente pronta
para o primeiro teste humano/gold case em produção, mas ainda não tem qualidade institucional
comprovada por esse teste. As outras cinco entradas continuam declaradas ou roteadas para
capacidades existentes e não devem ser apresentadas como completas até seus executores,
interfaces e gold cases passarem pelos próprios gates.

## Entendimento preliminar isolado e ordem canônica da entrada, 31/08/2026

A entrada foi corrigida para uma única sequência: companhia; operação e documentos preliminares;
pesquisa pública e entendimento preliminar; confirmação P0; solicitação sob medida; análise
profunda e esclarecimentos; case e sua confirmação; estrutura; plano de produção; materiais e
mercado. O antigo salto direto da
operação para uma tela genérica de informações deixou de ser a sequência válida no workspace.

Na etapa da operação, texto e documentos agora são portas equivalentes. Um usuário pode deixar
todos os campos manuais vazios quando já enviou material: o gate considera os arquivos, o worker
extrai objetivo, montante, moeda, prazo, setor e geografia quando houver evidência ancorada, e o
que continuar sem suporte aparece como ponto aberto para confirmação. Uma submissão sem texto e
sem documento permanece bloqueada para não gastar processamento analisando um caso vazio.

`preliminary_understandings` preserva versões, fingerprint do input, fingerprint do objeto,
decisão, correção, autor e horário. A leitura usa um job `preliminary_analysis` e uma capability
própria. Ela pode carregar somente declaração da companhia/operação, documentos preliminares e
extrações ancoradas. As RPCs de case completo exigem `case_analysis` e rejeitam essa capability,
impedindo acesso a pricing, lender graph, Deal State, estrutura, materiais ou distribuição. Cinco
pesquisas públicas independentes podem rodar em paralelo e são mantidas como contexto externo com
URL; uma única chamada estreita compila a leitura corrigível.

A confirmação P0 não confirma o case e não cria oportunidade. Ela apenas compila a lista
documental sob medida e devolve a sessão à coleta. Um run posterior, depois dos documentos
solicitados, pode abrir o DAG de análise completa. Alteração na companhia, objetivo ou documentos
preliminares antes da confirmação supersede a leitura antiga; uploads posteriores pertencem ao
loop de análise profunda e não reescrevem P0.

O case diagnóstico agora é compilado antes da estrutura e recebe um aceite próprio. Esse aceite
é uma countersignature do snapshot publicado pelo worker, no mesmo commit transacional que cria a
oportunidade; o tenant não pode inventar ou modificar o payload aprovado. Somente depois desse
gate o DAG de estruturação roda. A confirmação da estrutura ainda não produz artefatos: teaser,
modelo financeiro, term sheet e índice de data room exigem também um plano de produção aprovado.

Typechecks, lint e builds de web e worker passaram; as suítes completas desses dois pacotes
passaram com 155 testes web e 65 testes do worker, incluindo o caminho sem texto e com extração
documental de objetivo e montante. O gate integral sem cache aprovou 168/168 tarefas em 42
pacotes. Nenhuma API paga foi chamada.

A migration foi aplicada no branch Supabase de staging e o teste adversarial integral de RLS foi
aprovado. O advisor de segurança retornou zero alertas; os dois avisos de foreign key sem índice
foram corrigidos e revalidados. Produção não foi alterada. A entrega continua candidate até PR,
preview e smoke tests verdes.

## Match privado, destinatário exato e autorização específica, 29/08/2026

O matching aprovado passou a ser apenas uma shortlist privada. Ele não autoriza contato e não
vira distribuição por inferência. Cada nome selecionado produz um target persistido com identidade
de origem, fingerprint do mandato e racional. A preparação da introdução exige, separadamente,
contato nominal vigente, revalidação do mandato, lista exata de materiais e revisão técnica do
mesmo fingerprint que a companhia verá.

O cliente autoriza instituição por instituição, contato por contato e material por material. O
snapshot de autorização preserva esses elementos e a política de identidade do caso. Alteração no
material, mandato, contato ou match screen invalida a passagem. Resolução de contatos e atestado
técnico são funções privadas executáveis apenas pelo serviço; o cliente pode autorizar o plano
pronto, mas não fabricar contato ou autoatestar a revisão.

O registro final é deliberadamente passivo: `record_qualified_introduction_release` não envia
e-mail, não abre diligência e não conduz processo. Ele grava evidência append-only somente depois
que o pacote autorizado foi efetivamente entregue ao contato nomeado, com canal e referência
externa. A reexecução exata é idempotente e uma segunda referência para o mesmo destinatário falha
fechado.

As migrations `20260829223811`, `20260829224111`, `20260829225056` e `20260829225306` estão apenas
no Supabase staging. A inspeção confirmou que `authenticated` não resolve contatos, não atesta
revisão técnica e não registra release; o serviço pode executar as três funções. O Security Advisor
está com zero lints e os novos foreign keys têm índices de cobertura. O gate local passou nos 42
pacotes. Produção permanece inalterada.

A política institucional de distribuição ainda não foi ativada. Antes do teste integral, é preciso
aprovar prazo máximo de revalidação de mandato, limite da primeira onda, quantidade mínima de
âncoras e fonte metodológica. Até isso ocorrer, autorização e release falham fechados.

## Deal State persistente, gates executáveis e contenção de custo, 29/08/2026

O worker deixou de tratar análise, materiais, matching e introdução como uma única execução.
O estado canônico do caso agora é persistido em objetos versionados e fingerprintados:
entendimento, findings, esclarecimentos, decisão de estrutura, plano de produção, materiais,
revisão do pacote, tela de matching e autorização de saída. Cada objeto declara exatamente quais
versões anteriores consumiu. Alteração upstream invalida a progressão dependente, e repetição do
mesmo input é idempotente.

Os gates agora são executáveis. O modo diagnóstico organiza evidências, produz entendimento e
findings e para antes de qualquer material ou busca de mandato. Materiais exigem entendimento e
estrutura confirmados, além do plano de produção aprovado. Matching exige pacote aprovado.
Introdução exige autorização explícita de saída. O replay diagnóstico provou zero chamadas de
modelo e zero gasto; o fluxo integral autorizado continua coberto como regressão, mas não foi
executado contra APIs pagas nesta entrega.

As migrations passaram primeiro no branch `staging` do Supabase como `20260829151323`,
`20260829151523` e `20260829152233`. RLS e FORCE RLS estão ativos, escrita direta do tenant é
negada, dependências são validadas por fingerprint, retries exatos retornam o mesmo objeto e
isolamento entre organizações foi provado em transação. O PR #314 aprovou reconstrução integral do
banco, suíte completa de RLS, Playwright, lint, typecheck, testes, build e Vercel. O worker foi
promovido ao ECS e estabilizou.

Produção recebeu o mesmo schema como `20260829154103`, `20260829154114` e `20260829154126`.
A inspeção estrutural confirmou quatro políticas, RLS e FORCE RLS, ausência de acesso anônimo,
SELECT tenant-scoped e nenhuma escrita direta de `authenticated`. O Security Advisor reportou zero
lints. O ledger entrou vazio e nenhuma API paga foi executada. O primeiro teste produtivo deve
permanecer diagnóstico e parar para confirmação antes de liberar estrutura, materiais ou matching.

## Fronteira executiva e feedback pós-introdução, 29/08/2026

O fluxo canônico agora possui uma topologia executiva imutável de sete fases: `Understand`,
`Diagnose`, `Structure`, `Prepare`, `Match`, `Introduce` e `Capture Feedback`. Os estados
detalhados continuam preservados dentro dessas fases. Underwriting, diligência do financiador,
proposta final, negociação definitiva, documentação, desembolso e monitoramento permanecem fora
do trabalho executado pela Offroad.

`@offroad/case-understanding` contém o contrato tipado da fronteira, o mapeamento de cada estado
para uma das sete fases e a transição explícita para captura de feedback. O novo pacote
`@offroad/market-feedback` transforma sinais append-only em outcomes por introdução, projeções
comportamentais do lender graph e métricas com numeradores e denominadores explícitos. Marcos de
diagnóstico, estrutura e materiais são projetados do event log existente em
`processing_runs.stages`; nenhum segundo workflow foi criado para analytics.

A migration `qualified_introduction_feedback` adiciona um ledger tenant-scoped de sinais
pós-introdução, uma RPC estreita e uma projeção privada por financiador e fingerprint de mandato.
O ledger não altera mandatos declarados, exige motivo para recusa, contagem para solicitações
adicionais e supersessão explícita para correções. RLS, FORCE RLS, grants mínimos, auditoria e
testes de não interferência foram adicionados. As três migrations passaram no branch `staging` do
Supabase; o Security Advisor reportou zero lints e a FK de `recorded_by` foi coberta após o
Performance Advisor identificá-la. O smoke tenant-scoped em transação passou, inclusive a correção
de uma recusa com o mesmo timestamp: sem supersessão explícita o sinal positivo é bloqueado; com
supersessão, os dois eventos permanecem auditáveis. Restam somente avisos de índice ainda não usado,
esperados numa tabela nova e vazia. A capacidade permanece candidate por disciplina de rollout;
o banco reconstruído, o teste tenant completo e os demais gates obrigatórios foram aprovados no
PR #313 antes da promoção do schema.

O gate integral local passou em Node 24.19.0 nos 42 pacotes: lint, typecheck, todos os testes e
build. O pacote `market-feedback` fechou seis testes e `case-understanding`, 52.

Após os três gates do PR passarem, as migrations foram promovidas ao Supabase de produção como
`20260829141835`, `20260829141838` e `20260829141841`. Os tipos foram regenerados diretamente dessa
fonte. A verificação estrutural confirmou RLS e FORCE RLS, SELECT tenant-scoped, ausência de grants
diretos de INSERT, UPDATE e DELETE, RPC pública estreita e projeção privada. O ledger entrou vazio.
O Security Advisor de produção reportou zero lints; o Performance Advisor reportou apenas os três
índices novos ainda sem uso, comportamento esperado antes do primeiro feedback real.

## Fluxo canônico e início da construção profunda, 29/08/2026

A sequência integral do produto foi congelada em `docs/product/PRODUCT_WORKFLOW.md`. Intake,
entendimento, findings, esclarecimentos, estruturação, plano de produção, materiais, aprovação da
companhia, matching e introdução qualificada são estados distintos. Quatro gates explícitos
controlam a passagem: base suficiente para entender, estruturar, produzir e acessar o mercado.

A auditoria de profundidade mediu 270 entradas no House Playbook e 224 procedimentos compilados.
Todos os 224 permanecem `candidate`; nenhum atingiu `production`. Há kernels reais de ingestão,
conciliação, dívida, recebíveis, governança de claims e fronteiras de introdução, mas da leitura à
distribuição eles ainda não formam uma capacidade institucional conectada e comprovada. Contagem
de IDs, truth sets genéricos e testes de presença não podem mais ser tratados como prova de
execução. O diagnóstico e o plano vertical estão em
`docs/build/DEEP_BUILD_AUDIT_AND_PLAN_2026-08-29.md`.

O primeiro contrato executável das etapas 3 e 4 foi adicionado a `case-understanding`. Ele define
os estados e transições permitidos, sete classes de afirmação, snapshot versionado e
fingerprintado, findings priorizados, lote de no máximo cinco esclarecimentos, gates baseados em
requisitos explícitos e invalidação incremental de dependências. O contrato de promoção do
`credit-playbook` também passou a exigir executor, saída, persistência, estados do produto, testes,
gold cases, adversariais, E2E e avaliação de custo antes de aceitar maturidade `production`.

A vertical de recebíveis agora possui um adapter explícito para esse contrato. O relatório
governado é projetado em claims de classificação, dez métricas centrais da carteira, dezoito fatos
contratuais, defeitos medidos e perguntas não respondidas. Um gravame anterior comprovado continua
`confirmed`, mas aparece como finding crítico; conflito permanece `divergent`; ausência permanece
`absent`. O adapter não projeta shortlist, identidade de financiador, materiais ou recomendação de
estrutura e mantém essas ações bloqueadas.

Os testes focados fecharam com 51 testes em `case-understanding`, 30 em `case-engine` e 162 em
`credit-playbook`, além dos respectivos typechecks. Isso é a fundação da construção profunda, não
a conclusão das etapas 3 a 11. A próxima entrega é persistir esse estado do caso e expor findings
e esclarecimentos no produto sem executar materiais ou matching antes dos respectivos gates.
O `pnpm check` integral também passou em Node 24.19.0 nos 41 pacotes após a integração.

## Vertical de recebíveis, trilho real de produção da Fase 7, 28/08/2026

O worker deixou de depender de um objeto `receivables_case` montado manualmente. CSV, XLSX e
XLS entregues pela jornada real agora produzem fragmentos canônicos comprimidos, endereçados por
hash e persistidos exclusivamente no schema `private`. Arquivos ZIP aceitos são lidos como pacote
fiscal de NF-e; ZIP vazio ou genérico é recusado. Repetição byte-idêntica é idempotente e tentativa
de substituir a mesma versão por conteúdo diferente falha como violação de integridade.

O processamento do caso carrega somente as versões atuais dos documentos da própria sessão e
congela exatamente esses fragmentos no input da execução. A partir deles, o montador reconstrói a
carteira título a título, preserva séries de eventos ausentes como ausentes, executa os controles,
calcula as métricas da Fase 1, avalia as rotas da Fase 2A e cruza os programas governados da Fase
2B. Bancos, financeiras, SCDs, factorings, FIDCs, fundos privados, family offices, investidores
institucionais e programas patrocinados por sacados usam o mesmo contrato; FIDC não é default nem
pré-requisito.

O relatório completo, incluindo identidades e critérios de programas, permanece no resultado
privado do job. O snapshot público contém somente classificação, métricas, cobertura, achados,
condições, bloqueios e o próximo lote de evidências. Nenhum nome de financiador, shortlist,
observação interna ou contato é exposto à companhia. Ausência do valor pretendido produz
`needs_requested_amount`; ausência de uma série histórica não vira zero.

O gate local integral passou em Node 24.19.0 nos 41 pacotes: lint, typecheck, testes e build. O
worker fechou 51 testes; o web, 135; evals, 38; e o replay bruto processou 34.397 títulos. A
reconstrução local do banco não pôde ser executada nesta máquina porque não há Docker. Por isso a
Fase 7 continua candidate até o job obrigatório `Database (migrations, RLS, lint)` aplicar todo o
histórico do zero, executar `rls_non_interference.sql` e aprovar a migration em CI. Esse gate
passou no PR #300, run `33201518095`, junto com Playwright e o quality gate dos 41 pacotes.
Staging e um caso controlado em produção continuam obrigatórios antes da declaração de prontidão
oficial.

## Vertical de recebíveis, coleta governada de evidências da Fase 6, 28/08/2026

Os 18 fatos de elegibilidade agora possuem uma definição canônica de coleta no
`credit-playbook`: etapa, lote, prioridade, instrução, motivo, evidências aceitáveis e padrão de
conclusão. A lista não é duplicada no runner nem em prompt de agente.

O `case-engine` compila as lacunas reais em um lote atual de no máximo cinco tarefas e backlog
ordenado. Evidência completa e segura não volta a ser pedida. Amostra favorável pede a cobertura
remanescente; estimativa pede substituição; fonte vencida pede atualização; conflito pede
reconciliação; e cessão, trava ou gravame conhecido pede resolução, liberação ou segregação antes
da coleta genérica. Declaração isolada nunca completa um fato de rota.

Mandatos também produzem um plano interno de governança: política faltante, vencida ou divergente
fica separada da confirmação de apetite e capacidade atuais. Transação observada e inferência da
mesa continuam incapazes de confirmar o estado ao vivo. O plano não executa contato, consulta
externa, recomendação ou divulgação de identidade.

O replay bruto da Vertentes reconhece o que já foi comprovado nos arquivos e mantém titularidade,
gravames e controle de duplicidade como trabalho aberto. Contrato e golds:
`docs/knowledge/recebiveis/PHASE-6-EVIDENCE-COLLECTION.md`.

O gate integral passou em Node 24.19.0 nos 41 pacotes: lint, typecheck, testes e build. Os pacotes
alterados fecharam com 160 testes de `credit-playbook`, 29 de `case-engine` e 37 de `evals`.

## Vertical de recebíveis, fatos contratuais e verdade de mercado da Fase 5, 28/08/2026

O catálogo canônico agora define como resolver os 18 fatos usados pela
elegibilidade técnica. Cada observação traz escopo, cobertura, data, validade,
fonte, responsável e procedência. Ausência de ocorrência, amostra favorável,
estimativa e fonte vencida não comprovam um fato para a carteira. Evidência
material divergente permanece desconhecida; ônus anterior conhecido mantém as
rotas afetadas fechadas mesmo quando aparece em parte do universo.

O detector bruto da Vertentes deixou de concluir titularidade, inexistência de
ônus e controle de duplicidade a partir da tape ou da amostra fiscal. O runner do
caso recebe observações e resolve o contrato antes de executar a elegibilidade de
rotas; o caminho anterior com fatos pré-resolvidos existe somente como adapter de
regressão.

Observações de mandato agora identificam quem as registrou e separam política de
pesquisa de mercado. Transação observada e inferência de mesa ajudam a pesquisar,
mas não decidem política nem liberam shortlist. Regra publicada pode sustentar
política vigente; apetite e capacidade ao vivo continuam exigindo declaração
direta ou confirmação de relacionamento.

O gate integral local passou em Node 24.19.0 nos 41 pacotes: lint, typecheck,
testes e build. Entre os pacotes centrais, passaram 54 testes de
`receivables-analysis`, 38 de `fund-mandate`, 21 de `case-engine` e 37 de `evals`.
Recomendação, contato, distribuição, introdução qualificada e aprovação de crédito
continuam desabilitados. Contrato: `docs/knowledge/recebiveis/PHASE-5-CONTRACT-AND-MARKET-GATES.md`.

## Vertical de recebíveis, leitura bruta e detectores da Fase 4, 28/08/2026

A Vertentes deixou de usar o universo normalizado como substituto da leitura dos
documentos. O replay agora parte somente dos arquivos brutos autorizados pelo
manifesto, processa a carteira completa de 34.397 títulos e a amostra fiscal e
executa controles determinísticos com âncoras na fonte.

Os oito defeitos congelados foram reproduzidos com recall e precisão de 100%: grupo
econômico fragmentado, prazos acima da política, possível parte relacionada, dívida
e coobrigação omitidas, ajuste contábil, NF-e cancelada ainda aberta, diluição mal
classificada e pico mensal de originação. As quatro perguntas esperadas também são
geradas somente após busca exaustiva na sala entregue.

O parser deixou de truncar silenciosamente tapes institucionais e ganhou leitura
segura de ZIP fiscal. A amostra fiscal não é extrapolada: os 70 cancelamentos
entregues produzem 41 cruzamentos com títulos abertos, não um número estimado para a
carteira inteira. Chaves sintéticas fora do padrão de 44 dígitos permanecem
visíveis como alerta de qualidade.

O replay continua corretamente bloqueado em programas compatíveis e completude do
pipeline. Factoring, financeiras, bancos, SCDs e FIDCs estão no catálogo, mas
cessibilidade, entrega, ônus anteriores e mandatos live não podem ser inventados a
partir desta sala. Detalhes: `docs/knowledge/recebiveis/PHASE-4-RAW-DETECTION.md`.

A entrega foi promovida por meio do PR #296. O gate integral do `main`, o rollout do
worker de documentos e o deployment de produção da Vercel concluíram sem falhas;
`offroad.capital` respondeu HTTP 200 após a promoção.

## Vertical de recebíveis, harness E2E da Fase 3, 27/08/2026

O `@offroad/case-engine` ganhou um runner único para classificação, Fase 1, Fase 2A,
Fase 2B, defeitos e perguntas. O `@offroad/evals` aplica os gates congelados de
cálculo, classificação, defeitos, programas, perguntas e procedência. Apetite atual
e capacidade disponível agora preservam seus source IDs no resultado do matching.

Um gold replay compacto passa todos os gates. O baseline original da Vertentes
fechava exatamente seis cálculos a partir do universo canônico e falhava nos oito
detectores, nos dois programas sintéticos e nas quatro perguntas então ausentes.
Esse estado histórico foi superado pelos detectores da Fase 4 acima. Nenhuma
superfície de produto consome shortlist e nenhuma fronteira externa foi aberta.

Detalhes: `docs/knowledge/recebiveis/PHASE-3-HARNESS.md`.

## Vertical de recebíveis, programas e mandatos da Fase 2B, 27/08/2026

O matching deixou de partir de um cadastro genérico de fundos. O contrato canônico
agora separa instituição, entidade legal, programa ou veículo, rota, política,
apetite e capacidade. O universo inclui bancos, financeiras, SCDs, factorings,
FIDCs, fundos privados, family offices, investidores institucionais e programas de
sacados. FIDC não recebe prioridade nem é necessário para que uma alternativa seja
promovida.

`@offroad/fund-mandate` resolve observações versionadas com fonte, data e validade.
Capacidade e apetite ao vivo precisam de confirmação direta ou de relacionamento;
inferência e fonte expirada não liberam shortlist. `@offroad/receivables-analysis`
aplica os critérios ao caso da Fase 2A sem score opaco e conserva abstenção quando a
métrica é estimada ou o denominador está ausente.

`@offroad/financial-core` calcula o envelope de alocação com precisão decimal. Um
programa pode financiar parte de uma operação maior; o limite confirmado é o menor
entre pedido, tíquete máximo, capacidade confirmada e colateral elegível. A falta de
cobertura integral não elimina um cheque parcial que atende ao mínimo.

O banco ganhou `capital_provider_programs` e observações de mandato vinculadas ao
programa exato, append-only e protegidas por RLS. Staging passou no smoke test de
isolamento e o auditor de segurança retornou zero alertas. Seis casos sintéticos,
incluindo factoring e financeira sem qualquer FIDC compatível, capacidade inferida,
rota indisponível, métrica estimada e colateral insuficiente, são verificados por
oráculo Python independente. Recomendação à companhia, contato, distribuição,
introdução qualificada e aprovação de crédito continuam desabilitados.

## Vertical de recebíveis, elegibilidade técnica de rotas da Fase 2A, 27/08/2026

O catálogo canônico deixou de tratar FIDC como sinônimo de financiamento por
recebíveis. `@offroad/credit-playbook` agora separa mecanismo econômico, rota, fonte
de capital e prestador em nove rotas: factoring, desconto por banco ou financeira,
aquisição digital por SCD ou estrutura parceira, FIDC multicedente, programa do
sacado, linha rotativa garantida, CCB com cessão fiduciária, veículo dedicado e
securitização com Certificados de Recebíveis.

Cada critério possui referência primária do Planalto ou oficial de BCB e CVM. O
executor determinístico em `@offroad/receivables-analysis` retorna elegível,
condicional, não avaliado ou inelegível. Estimativas de velocidade e custo aparecem
somente como observação de mesa e não participam da decisão. Titularidade incerta não
é aceita; cessão ou gravame anterior não resolvido bloqueia; pendência documental ou
operacional remediável condiciona.

`@offroad/financial-core` ganhou o agregador título a título. Ele exige classificação
completa e exclusiva dos recebíveis abertos, reconcilia 100% do denominador e impede
exclusão rígida baseada em estimativa. A regra legal permanece fora do pacote
matemático. `@offroad/case-engine` compila a fonte do playbook no executor, evitando
catálogo duplicado.

Cinco casos sintéticos congelados, inclusive dupla cessão, comprovante de entrega
pendente, titularidade apenas estimada e rota rápida sem dados institucionais, são
validados por oráculo Python independente. O gate não faz matching de entidade,
recomendação, contato, introdução ou aprovação de crédito. Esses limites permanecem
falsos até a Fase 2B com mandatos governados e atuais.

## Vertical de recebíveis A1, gate matemático integral da Fase 1, 27/08/2026

O caso sintético Vertentes A1-03 passou a existir dentro de `@offroad/testing-fixtures` com os 21
arquivos de entrada, a verdade reservada do gerador, a representação canônica comprimida, hashes e
manifesto. As camadas são separadas: código que testa extração deve partir somente dos arquivos
`raw`; a verdade reservada não pode ser usada como atalho. O manifesto registra 34.397 títulos,
1.200 sacados, 1.199 grupos econômicos, 30.734 liquidações, 4.840 eventos de diluição e 340
prorrogações cuja data original do evento não está disponível no intake.

`@offroad/financial-core` agora calcula deterministicamente quantidade e volumes, tíquete médio,
prazos ponderados original, vigente e remanescente, DSO simples e countback diário, aging em sete
faixas e concentração Top 1, Top 5, Top 10, Top 50 e HHI por sacado e grupo econômico. Cada saída
declara universo, período, fórmula versionada, hash do dataset e âncoras de origem. Ausência de
denominador retorna `not_evaluable`; não vira zero. `@offroad/receivables-analysis` consome essa
fonte canônica e deixou de recalcular localmente as métricas migradas.

O universo canônico passou a declarar cobertura de liquidação, diluição, prorrogação, recompra e
cessão ou gravame.
Isso impede que evento não fornecido seja interpretado como zero. O cálculo dinâmico reconstrói 23
transições mensais usando o vencimento original, calcula 24 safras nos horizontes de 30, 60, 90,
120, 180 e 360 dias, diluição, write-off final, perda ajustada, liquidação pontual e prorrogação por
quantidade, valor e dias ponderados. Safras ainda imaturas retornam `not_evaluable`. Taxa de
recompra também retorna `not_evaluable` quando o volume cedido, seu denominador econômico, não
existe.

O gold dinâmico vem de um oráculo Python independente do motor TypeScript e compara cada célula da
matriz e de cada safra. A curva calculada é de não pagamento no horizonte e não é rotulada como
evento de write-off. A diluição total é 2,447267% da originação, mas o caso não identifica causa no
nível de título; a saída conserva `other` e emite a limitação em vez de inventar a abertura.

A auditoria encontrou um erro material no gabarito legado: exclusões calculadas de forma
independente contavam títulos sobrepostos mais de uma vez. A cascata exclusiva correta, sob a
política sintética estimada do caso, produz R$ 8.877.495,23 de carteira elegível e 74,619108%, não
R$ 8.618.471. Esse cenário continua rotulado como estimado e não representa critério confirmado de
comprador.

O bloco de estrutura e custo agora fecha a ponte da dívida, conversões de taxas por dentro e por
fora, CET por fluxos datados e advance rate implícito. Um segundo oráculo Python independente
confirma cada valor. A dívida ajustada é R$ 22,26 milhões, a dívida líquida é R$ 20,94 milhões e a
alavancagem é 5,453125x sobre EBITDA reportado de R$ 3,84 milhões. O gabarito legado usava um EBITDA
ajustado de R$ 4,16 milhões sem suporte documental e foi corrigido com rastreabilidade.

No exemplo Prime, desconto mensal por fora e tarifa ad valorem produzem R$ 94.570 de recursos
líquidos e CET de 62,448085% ao ano antes de tributos. Como o tratamento tributário não foi
fornecido, o resultado continua incompleto e nenhum IOF é imputado. O advance rate de 92,904117% é
um cenário estimado. A perda ajustada da carteira é identificada como proxy governada, não como
perda esperada de safra nem como política real de comprador.

`@offroad/receivables-analysis` ganhou uma orquestração canônica sem aritmética econômica duplicada.
O relatório diferencia gate matemático de completude do caso e mantém recomendação, buyer fit,
introdução e aprovação de crédito desabilitados. A Fase 1 aprova contratos, cálculos, replay e
procedência. Elegibilidade regulatória e contratual é o próximo gate.

Os testes focados cobrem hashes de entrada, verdade e expected outputs, replay independente da
ordem, datas economicamente distintas, fronteiras de aging, invariantes, procedência e igualdade
exata com o gold. O benchmark local em Node 24 registrou mediana de 318,65 ms para o cálculo
estático, 1.082,61 ms para o dinâmico e 1.414,71 ms para o relatório integral da Fase 1 sobre
34.397 títulos.

## Gate jurídico inicial v3, 27/08/2026

O primeiro aceite de empresas e assessores deixou de exibir um resumo duplicado como se fosse o
termo integral. A versão `2026-08-27-v3` contém o Termo de Confidencialidade e Autorização de
Trabalho Preliminar completo em português e inglês, com resumo operacional separado e duas
manifestações inequívocas: concordância com a versão integral e confirmação do direito de fornecer
as informações para análise privada.

O gate autoriza somente compreender a companhia, organizar e conciliar informações, analisar
alternativas e preparar materiais dentro do ambiente privado. Não prova representação da
companhia, não constitui mandato, exclusividade ou contratação comercial e não autoriza contato
com financiadores. Representação verificada e autorização de distribuição da versão exata dos
materiais continuam sendo gates posteriores e independentes.

A migration `20260827162103_legal_acceptance_v3.sql` está aplicada em staging e produção. O ledger
imutável preserva versão, hash, texto exato das duas declarações, usuário, organização, data,
método de aceite e, quando disponíveis no Data API, IP e user agent. O Security Advisor de staging
e produção retornou zero findings. Os aceites v1 e v2 existentes não foram reescritos nem
reinterpretados: a declaração histórica de autoridade permanece verdadeira em sua coluna original
e os novos campos permanecem nulos. O `pnpm check`, a reconstrução completa do banco, a suíte RLS e
o E2E autenticado passaram no CI do PR #281.

## Máquina de estados canônica do onboarding, 27/08/2026

Empresa e assessor agora têm uma única sequência executável: boas-vindas, confidencialidade,
identificação da captação e sete marcos guiados. `resolveBorrowerOnboardingView` concentra as
decisões de tela e não permite que parâmetros de URL ultrapassem pré-condições. Voltar e Editar são
operações de navegação, sem efeito no ciclo de vida da sessão.

Os arrays e regras dos formulários antigos deixaram de governar empresa e assessor. O mecanismo
legado restante é exclusivo do cadastro de financiadores. A rota de nova captação também passou a
exigir nome, política de identidade e declaração de representação antes de criar uma sessão, de
modo que primeira e próximas captações obedecem ao mesmo contrato.

A migration `20260827221500_configure_existing_onboarding_intake.sql` transforma o comando inicial
em create-or-configure. Editar o projeto preserva ID, documentos e status e não duplica a evidência
de declaração. A migration e o cenário transacional foram validados no Supabase staging; o
Security Advisor retornou zero findings. O relatório completo está em
`docs/build/ONBOARDING_STATE_MACHINE_REVIEW_2026-08-27.md`.

## Confidencialidade, identidade do projeto e gate de representação, 27/08/2026

O início do onboarding de empresas e assessores passou a ter uma etapa anterior à coleta. O usuário
aceita um compromisso versionado de confidencialidade e autorização de trabalho, escolhe um
codinome para o projeto e define se a futura abordagem será identificada e restrita ou começará por
um teaser blind. O aceite inicia somente a preparação privada. E-mail pessoal continua permitido e
nunca é tratado como prova de representação.

O banco preserva o texto exato aceito, hash, versão, usuário, organização e data em um ledger
imutável. A relação com a companhia nasce como declaração e evolui separadamente por evidências
adequadas ao caso, como função societária, registro corporativo, carta de contratação, mandato,
confirmação da companhia, procuração ou aprovação corporativa. A coleta e a análise podem avançar
enquanto essa confirmação é concluída, mas nenhuma distribuição pode ocorrer antes dela.

O gate de saída é aplicado no banco, não apenas na interface. Uma introdução qualificada exige, ao
mesmo tempo, representação verificada, fingerprint exato do material aprovado, política de
identidade idêntica à do projeto e destinatários individualmente autorizados. Revogar a autorização
devolve o projeto ao estado privado. A migration canônica é
`20260827005724_private_project_authorization_gate.sql`.

O schema foi aplicado em produção, os tipos TypeScript foram regenerados e a suíte RLS completa
passou dentro de uma transação revertida no banco real. O Security Advisor retornou zero findings;
os avisos de performance são índices sem uso em tabelas ainda vazias, não foreign keys sem índice
nem regressões desta entrega. O gate local completo passou nos 41 pacotes.

## Intake guiado em sete marcos, 26/08/2026

O onboarding de empresas e assessores deixou de renderizar o fluxo legado de três formulários.
A jornada visível agora segue os sete marcos definidos no ADR 0014: empresa, operação, informações,
entendimento, esclarecimentos, pacote institucional e investidores. Os três primeiros marcos são
ações do cliente; os quatro seguintes representam trabalho real e permanecem bloqueados até que o
estado persistido correspondente exista. O percentual parte de zero e é derivado do marco atual.

O primeiro marco combina identificação compacta, explicação livre da companhia e upload opcional
de material institucional. O usuário pode voltar aos marcos já iniciados ou cancelar somente a
tentativa corrente. O botão `Começar` apresenta estado pendente imediatamente e o início da jornada
passou de várias chamadas independentes para um único comando transacional no banco.

As migrations `20260826224711_start_onboarding_intake_atomic.sql` e
`20260826225428_guided_company_profile_collecting_status.sql` criam os comandos atômicos de início
e salvamento do primeiro marco. O teste dirigido no Supabase staging comprovou sessão
`collecting`, atualização do progresso, persistência da empresa e avanço para operação na mesma
transação. O Security Advisor de staging retornou zero findings. O gate local completo passou nos
41 pacotes; a aplicação web também passou 127 testes e build de produção com 28 rotas.

## Workspace do Agente Offroad e pesquisa pública governada, 26/08/2026

O pipeline real agora publica eventos seguros de início e término para cada estágio econômico. O
novo `@offroad/work-plan` transforma esses eventos em quatorze tarefas compreensíveis, agregando
todos os documentos e o case sem copiar inputs, outputs, erros privados ou identidades de fundos.
A interface de onboarding consome essa projeção: o percentual deixa de começar artificialmente em
12% e uma tarefa só é concluída depois que o trabalho correspondente foi persistido.

`@offroad/public-research` adiciona uma fronteira separada de contexto externo. Consultas aceitam
somente identidade pública, setor e geografia, bloqueiam e-mail, identificadores, valores e
métricas financeiras privadas, usam adaptadores Perplexity e OpenAI com fontes e orçamento
limitados e preservam URL, data, trecho, provedor e hash. Os achados são registrados como
`external_context`; não substituem documento, fato reconciliado, cálculo ou critério de mandato.

`@offroad/agent-contracts` define perguntas contextuais e propostas de mudança tipadas, ligadas ao
fingerprint exato do manifesto, com evidência, impacto, patches, etapas a recalcular e validade. A
migration `20260826190359_agent_workspace_foundation.sql` persiste pesquisa e propostas sob RLS
forçado. Aceitar uma proposta não aplica a alteração: cada mutação de domínio ainda dependerá de
seu comando idempotente e auditável. O ADR 0014 fixa essa arquitetura e proíbe implementar agentes
autônomos conversando entre si.

O gate local `pnpm check` passou nos 41 pacotes em 26/08/2026. Os testes dirigidos somam 4 de work
plan, 4 de pesquisa pública, 3 de contratos do agente, 6 do runner e 46 do worker. O CI obrigatório
reconstruiu todas as migrations, passou a suíte RLS, lint do schema, E2E, lint, typecheck, testes e
build. O advisor de staging encontrou cinco foreign keys novas sem índice; a migration
`20260826203000_agent_workspace_index_hardening.sql` corrigiu todas antes da promoção.

As duas migrations foram promovidas ao Supabase production como `20260826200143` e
`20260826200443`. As três tabelas têm RLS forçado, somente `SELECT` autenticado, nenhuma permissão
anônima, wrappers públicos invoker e implementações privadas definer. O Security Advisor retornou
zero findings e o Performance Advisor não aponta foreign key sem índice. Os ledgers nasceram com
zero registros. Os tipos TypeScript foram regenerados do schema de produção. O worker do commit
`bb62b99` está estável no ECS como `offroad-document-worker:105`.

A fundação está em produção. Ainda não existe chat cenográfico: a superfície conversacional só deve
ser aberta quando uma proposta aceita puder passar pelo comando idempotente real do domínio e
recalcular os estágios dependentes.

## M8, inteligência de mandato e introdução qualificada, 26/08/2026

MK-01 a MK-18 agora existem como candidates compilados da fonte canônica e alimentam um `Market
Truth Set` no Case Engine. O runtime resolve a proveniência e a validade dos critérios duros,
exclui incompatibilidades de forma binária, registra confirmações pendentes e monta uma shortlist
qualitativa sem percentual fictício. MK-19 a MK-28 permanecem `not_applicable`: NDA, diligence,
book, alocação, negociação, documentação, funding e closing estão fora da fronteira atual.

A migration `20260826040000_m8_qualified_introductions.sql` cria política versionada, plano,
destinatários nomeados e ledger append-only da introdução. Todas as tabelas de case têm RLS
forçado, leitura restrita ao tenant e nenhuma escrita direta pelo usuário. Revisão técnica e
autorização da companhia são comandos distintos. Ambas, o plano, o pacote e cada mandato precisam
apontar para os fingerprints exatos e atuais. O worker carrega esse contexto somente pela
capability curta do job.

O estado público mostra contagens agregadas e a fronteira operacional. Fundos, contatos,
observações de mandato, ordem da onda e resultados privados dos procedimentos não atravessam para
o workspace. A rota antiga de sounding redireciona ao case e seu código mutável foi removido da
aplicação ativa. A implementação permanece candidate até a migration, a suíte de não interferência,
o CI, o deploy e a verificação em produção concluírem.

## M7, materiais institucionais e sala governada, 26/08/2026

MA-01 a MA-32 agora existem como candidates compilados da fonte canônica, com método operacional e
verificação específicos para cada procedimento, e não como um checklist genérico. O Case Engine emite um
`Material Truth Set` depois da compilação de teaser, memorando de crédito, term sheet indicativo,
Q&A, modelo e sala. Cada artefato recebe fingerprint determinístico, referência exata do template,
estado do audit de conduta, cobertura de suporte, completude bilíngue, disclaimer e contrato de
seções. O runtime detecta claim material sem evidência, template vencido, seção obrigatória ausente
ou fora de ordem e divergência econômica entre artefatos que consomem a mesma base.

A liberação externa é fail-closed. Produzir um documento no workspace não autoriza sua circulação.
MA-32 só conclui quando validação cruzada, auditoria de claims, revisão técnica e autorização da
companhia apontam para o mesmo fingerprint e a autorização contém destinatários nomeados. A camada
persistente de revisão, autorização e introdução foi ligada pelo M8. Sem essas decisões exatas, o
estado correto do M7 continua `internal_only`. Esse gate confirma consistência e divulgação de uma versão; não
aprova crédito, não recomenda investimento e não compromete capital.

O estado público preserva apenas o resultado e as contagens necessárias ao workspace. Identidade
do revisor e lista de destinatários não atravessam a fronteira. Os resultados privados de cada
procedimento também são removidos. O manifesto econômico passou a incorporar o registry dos 32
procedimentos e a versão do compilador de materiais, invalidando corretamente qualquer artefato
gerado por conhecimento ou template anterior.

## M6, pricing governado e referência indicativa, 25/08/2026

PR-01 a PR-13 agora existem como candidates compilados da fonte canônica. O runtime produz uma
faixa apenas quando a amostra atinge política versionada de quantidade, fontes independentes,
qualidade, validade, comparabilidade e largura. Instrumento, rating, setor, garantia, amortização,
prazo, tíquete e regime são filtros explícitos. Fee, OID, warrant e hedge entram como componentes
da normalização e precisam fechar matematicamente. Choque de regime, observação vencida, fonte
repetida, restrição de confidencialidade ou falsa precisão produzem abstenção.

A migration `20260826013647_m6_pricing_registry.sql` cria a política e o registro proprietário de
observações. Os registros são ativos internos da Offroad, com RLS forçado e sem leitura para
`anon` ou `authenticated`. O worker carrega o contexto pela capability do job. O estado privado
preserva a linhagem; o estado público retém somente faixa, amostra agregada, recência, custos e
decisão. A interface mostra a referência suportada ou explica que ainda não há base confiável.

O gate local completo passou em Node 24.19 nos 38 pacotes e os jobs obrigatórios do PR #260,
incluindo reconstrução do banco, RLS e E2E remoto, ficaram verdes. As migrations
`20260826013647_m6_pricing_registry.sql` e
`20260826013815_m6_pricing_registry_advisor_hardening.sql` estão aplicadas em produção. O Security
Advisor não reporta findings do registro de pricing e o Performance Advisor não reporta foreign
keys sem índice nesse perímetro. Os avisos de índices ainda não utilizados são esperados enquanto
as tabelas permanecerem vazias. Nenhuma política ou observação de mercado foi inventada ou
semeada. Até a mesa aprovar política e dados atuais, o comportamento correto é abster-se.

## M2 e M3 no trilho governado, 25/08/2026

M2 e M3 agora fazem parte do `@offroad/case-engine` e do worker de produção como objetos
determinísticos do estado do case. `financialTruth` reconstrói demonstrações por período,
preserva reportado e ajustado, calcula capital de giro, CFADS, conversão de caixa, pontes,
identidades e análises de concentração, sazonalidade, moeda e aging. `debtTruth` mantém um ledger
contrato a contrato, múltiplas visões de obrigação, cronograma, serviço em 12 meses, vida média,
custo, garantias, covenants, ponte de saldo, ponte da despesa financeira, cobertura de liquidez,
cenários de taxa e propagação contratual de cross-default.

Os 18 procedimentos Q e os 31 procedimentos D existem como candidates individuais derivados do
House Playbook, com lineage, hash, schema, referências, owner, testes e runtime determinístico sem
handoff entre agentes nem chamada de modelo. Cada execução registra `completed`, `partial`,
`blocked`, `not_computable` ou `not_applicable`, além de outputs, evidências, inputs ausentes e
exceções. O registry combinado passou a compor o manifesto econômico, portanto uma alteração nesses
procedimentos invalida a linhagem downstream.

O worker persiste os dois objetos no snapshot atestado que a aplicação consome. A superfície do
case exibe o demonstrativo financeiro reconciliado, EBITDA ajustado, margem, CFADS, identidades,
visões de dívida, serviço de 12 meses, exposições fora de balanço, instrumentos, covenants e pontos
abertos. Desktop e mobile foram verificados no preview governado.

Este fechamento significa que o trilho técnico está pronto para o primeiro teste E2E do fundador.
Não significa promoção institucional em lote. Procedimentos permanecem `candidate`; referência de
mercado ausente ou expirada, documento material ausente, conflito e identidade quebrada continuam
falhando de forma localizada. Gold cases obrigatórios adicionais e revisão econômica independente
da versão exata continuam sendo o gate de promoção individual.

## M0 adaptativo, 25/08/2026

O contrato `@offroad/credit-playbook/intake-state` reconstrói o intake a partir de eventos e produz
frame da necessidade, cobertura de informação, roadmap, lote ativo e log de decisões. O lote tem
política datada, no máximo cinco itens e só pede ao cliente depois de procurar na sala classificada,
tentar derivação governada e consultar fonte pública permitida. Respostas parciais não contam como
completas; exclusão de documento e limpeza de resposta são novos eventos, não mutações retroativas.

As migrations `20260825160750_m0_intake_event_ledger.sql`,
`20260825160803_m0_intake_projection_terminal_guard.sql`,
`20260825171945_m0_capital_need_documents.sql`,
`20260825180214_m0_request_ladder_commands.sql` e
`20260825185143_m0_scope_authorization_triage.sql` introduzem o ledger append-only e comandos atômicos
para necessidade de capital, rota, respostas e recebimento, classificação e remoção de documentos.
Cada comando mantém a projeção atual e o evento na mesma transação, com lock de sequência, hash,
ator e idempotência. Tenants leem apenas o próprio histórico e não escrevem diretamente no ledger
ou nas projeções governadas. A classificação do worker segue a mesma ordem de locks da remoção.

`apps/web/src/lib/intake/replay.ts` valida a fronteira com Zod e reconstrói sessões novas com uma
política datada. Quando o stream contém a necessidade de capital, a checklist usa a rota, os
documentos classificados e a suficiência produzidos pelo replay; sessões antigas continuam
legíveis por fallback explícito, sem inventar eventos. A escada governada, o perímetro econômico,
a declaração de autorização do assessor e as triagens do dia zero já possuem eventos, projeções e
comandos transacionais. Telemetria de abandono, perímetro multi-entidade derivado dos documentos,
verificação da autorização e gold cases de M0 ainda estão pendentes. Nenhum procedimento de M0 foi
promovido para `production`.

O case de assessor agora separa a organização usuária da empresa economicamente analisada. A
declaração inicial permite apenas preparar o case; sondagem de mercado e introdução qualificada não
são inferidas e exigirão poderes próprios, evidência e gate posterior. Um case sem perímetro, sem
autorização vigente do assessor ou com rota recusada não produz lote de solicitações. Uma triagem
`review_required` permanece visível ao desk, mas não interrompe a coleta por si só.

O branch Supabase `staging` foi rebaseado sobre produção antes da validação, preservando a migration
anterior de respostas indisponíveis. Após os gates verdes, as duas migrations foram promovidas para
produção e seus timestamps registrados foram adotados como histórico canônico no repositório. O
staging vazio foi então recuado até a última migration comum e recebeu novamente o histórico
canônico, eliminando drift sem alterar produção. O schema medido mantém RLS habilitado e forçado no ledger,
somente `SELECT` para `authenticated`, nenhuma permissão para `anon` e nenhuma escrita direta nas
projeções agora governadas por comando. Os comandos têm `search_path` vazio, idempotência e escopo
de sessão validado. O Security Advisor do staging retornou zero findings. A suíte remota de não
interferência passou depois de um reset completo e cobre retry, conflito de idempotência, bloqueio
de escrita direta, isolamento entre tenants, sessão terminal, ciclo documental e cascade de
eliminação. O gate completo e a promoção para produção permanecem condicionados ao CI verde sobre
o histórico canônico.

## House Playbook M10 em shadow, 25/08/2026

As treze regras de linguagem e conduta, `LC-01` a `LC-13`, possuem agora procedimentos candidate
individuais, compilados pelo mesmo contrato governado da vertical growth-capex. Todos usam execução
determinística, zero chamadas de modelo e o controle `conduct_policy`. O motor verifica suporte de
claim, julgamento aprovado pelo fingerprint exato, qualificadores materiais, ordem dos riscos,
vocabulário, promessas de resultado, disclaimer, identidade econômica PT e EN, confidencialidade,
conflito, registro escrito, desconhecidos com data, surpresa de diligência e forma da casa.

`@offroad/case-materials` executa o controle sobre cada material compilado e anexa versão,
fingerprint e findings. A primeira medição revelou que o contrato de material não distinguia fato,
premissa e texto não material com precisão suficiente. A remediação M7 agora preserva essa taxonomia
em parágrafos, key-values e callouts; cada termo indicativo declara os inputs governados que o
produziram; perguntas de diligência em aberto não se passam por afirmações econômicas; e a fixture
growth-capex governada termina com audit `pass` em todos os seis materiais. A execução continua em
shadow. Esse `pass` mede o contrato atualmente coberto, não acredita a fonte nem encerra a cobertura
de células tabulares. Nenhuma regra LC será promovida para bloqueio de release antes de gold, adversarial, revisão
independente e, quando aplicável, revisão jurídica da versão exata.

## Fundações bulletproof, 24/08/2026

O plano aprovado pelo fundador está versionado em
[`BULLETPROOF_EXECUTION_PLAN.md`](BULLETPROOF_EXECUTION_PLAN.md). Este primeiro
incremento fecha os contratos que todas as etapas posteriores devem respeitar:

- [x] taxonomia ortogonal v2: necessidade, fonte de pagamento, lastro,
  obrigação, valor mobiliário, mecanismo, veículo, provedor e rota de
  distribuição são dimensões distintas;
- [x] FIDC modelado exclusivamente como veículo de capital, sem ser confundido
  com obrigação da empresa ou instrumento distribuído;
- [x] seis estados operacionais do case separados do parecer de crédito, com
  direcionamento externo permitido somente no estado
  `ready_for_qualified_direction`;
- [x] manifesto unificado de linhagem com hashes das fontes, versões de
  pipeline, políticas de modelo, prompts, playbook, mercado e artefatos;
- [x] contrato de gold case ampliado para oito camadas: extração, conciliação,
  métricas, lacunas, estrutura, claims, materiais, matching e desfecho;
- [x] adaptador explícito do catálogo legado para a taxonomia v2, preservando o
  fluxo atual enquanto a migração é feita de forma controlada;
- [x] ADR 0009 registra as invariantes e o que ainda não foi implementado.

Os Gates 2, 3, 4, 5 e a capacidade funcional do Gate 6 já avançaram além desta fundação: o runner único e a atestação pela identidade
do worker estão ligados, o primeiro case corporativo âncora atravessa as oito camadas e o registro
de claims governa publicação. A fábrica paramétrica agora deriva documentos, evidências, carteira,
mandatos e gabaritos de uma única verdade econômica e executa os cenários no trilho real. A vertical
de recebíveis avalia carteira, cedente, sacados, servicing e estrutura em 28 cenários e atravessa o
mesmo motor governado usado pelo worker.
Permanecem pendentes a revisão econômica independente final dos cases âncora e o gate de promoção
em staging. O retrieval governado passou pelo CI obrigatório, foi promovido ao banco de produção e
permanece condicionado ao rollout do worker a partir de `main`. Esses itens continuam explícitos
no plano de execução.

O Gate 7 adiciona `@offroad/governed-retrieval` e as migrations
`20260824232722_governed_retrieval.sql` e
`20260824232920_retrieval_foreign_key_indexes.sql`. Evidência do case, House Playbook, notas abertas de
mandatos e precedentes usam fontes e gates diferentes. Chunks do case mantêm âncora, hash, versão
do documento, organização, sessão, oportunidade e run, sem embedding. O playbook é imutável e
versionado. Notas abertas somente entram depois do filtro estruturado de mandato. Precedentes são
reavaliados contra consentimento, propósito, expiração, anonimização e governança em toda busca.

O worker indexa a camada determinística do parser e recupera o playbook antes da redação. Depois do
matching, somente fundos classificados como `fits` liberam suas notas. Conteúdo e identidades ficam
no job privado; o snapshot público recebe apenas lineage sem conteúdo. RLS forçado, capabilities e
teste de não interferência cobrem escrita, leitura e isolamento. O quality gate local passou nos 37
pacotes. O PR #240 reconstruiu as migrations do zero e aprovou banco, RLS, lint, código e E2E antes
da promoção. O projeto de produção recebeu as duas migrations; o Security Advisor permaneceu com
zero alertas e o Performance Advisor com zero chaves estrangeiras sem índice.

O Gate 8 introduz `@offroad/release-governance` e ADR 0011. A primeira leitura do worker congela o
input privado de cada case; retry, shadow e replay recebem o mesmo snapshot. A execução candidata
usa run própria e nunca substitui o case público. Comparações tipadas distinguem input divergente,
regressão de status, quebra de contrato, drift de output e aumento de custo. Rollout é um estado por
organização que o tenant pode ler e não pode escrever. `active` exige dois cohorts distintos de dez
cases reais e aprovação explícita; fixtures não contam.

O branch Supabase `staging` está saudável, com o mesmo histórico de migrations e nenhum dado de
produção. As migrations `20260824235937_controlled_production_rollout.sql`,
`20260825000110_controlled_production_foreign_key_indexes.sql`,
`20260825000811_controlled_release_commands.sql` e
`20260825001020_fix_controlled_case_input_variable.sql` e
`20260825001758_make_controlled_results_immutable.sql` foram provadas primeiro nesse ambiente. A
suíte integral de não interferência passou, o Security Advisor retornou zero findings e o
Performance Advisor, zero foreign keys sem índice. Lint, typecheck, todos os testes e o build estão
verdes nos 38 pacotes. As cinco migrations foram promovidas em ordem ao banco de produção em
25/08/2026. A verificação posterior encontrou zero alertas de segurança, zero foreign keys sem
índice e todos os ledgers do Gate 8 vazios, inclusive política de rollout e liberação externa. O
commit `ff7db5b` foi publicado na Vercel e no ECS em 25/08/2026. O worker está estável na task
definition `offroad-document-worker:83`, e os smoke tests públicos de PT, EN, login e favicon
retornaram HTTP 200. Os vinte cases reais continuam pendentes.

O Gate 6 adiciona `@offroad/receivables-analysis`. Ele separa FIDC, cessão de recebíveis e fonte de
pagamento; calcula elegibilidade título a título, concentração, aging, inadimplência, perda,
recuperação, diluição, recompra, substituição e prazo médio; concilia loan tape com contabilidade,
cobrança e caixa; e testa advance rate, sobrecolateralização, subordinação, reserva, gatilhos e
waterfall. A decisão tem três estados, mas sempre mantém `externalDirectionAllowed: false`. O
contrato estruturado entra em `@offroad/case-engine` e no worker com validação Zod. Dados livres ou
não verificados não são promovidos automaticamente para uma carteira válida. Os dois anchors
artesanais permanecem `pending` até revisão independente.

O Gate 2 começou com `@offroad/case-runner`: um trilho sem dependência de UI ou banco que executa
extração, conciliação, métricas, lacunas, estrutura, claims, materiais, matching e desfecho em ordem
fixa. Cada etapa valida seu contrato, registra fingerprint, duração, custo e chamadas. Falha,
bloqueio, contrato inválido ou budget excedido interrompem todas as etapas posteriores. O pacote
`@offroad/case-engine` agora conecta esse trilho aos motores reais e é a única implementação
econômica usada pela aplicação web e pelo worker. Depois do último documento, o banco enfileira um
job de análise do case. Uma capability temporária entrega ao worker apenas o case, suas evidências e
os mandatos necessários; o worker executa o trilho, grava o manifesto append-only e encerra a run.
O navegador perdeu a permissão de atestar snapshots. Identidades e critérios completos de fundos
ficam no resultado privado do job; o workspace da empresa recebe somente um resumo sanitizado do
matching. A indisponibilidade do redator ou de materiais continua sendo estado explícito do domínio,
sem transformar ausência de prosa em matemática inventada.

O Gate 4 separa três decisões que antes estavam misturadas. O auditor numérico determinístico
confere quantias e múltiplos contra fatos e cálculos citados. Um segundo modelo, de provedor
diferente do redator, recebe apenas o claim e o suporte reconciliado e audita significado,
qualificadores e extrapolações. Julgamentos materiais exigem uma decisão humana exata, append-only,
vinculada ao fingerprint do claim, ao manifesto imutável e ao snapshot da registry. Qualquer falha
numérica, semântica, ausência de revisão ou aprovação desatualizada mantém o brief internamente
visível, mas bloqueia teaser, perfil de crédito, pacote e data room de saída. Se um fato muda, a
registry identifica os claims e artefatos dependentes; a aprovação anterior não migra para a nova
redação.

No banco, `claim_decisions` tem RLS forçado e nenhum grant de escrita direta. O comando público é
`security invoker`; a implementação privilegiada vive em `private`, valida a versão mais recente do
snapshot e aceita somente o fingerprint exato de um julgamento material corrente. Apenas papéis de
revisão autorizados podem registrar a decisão. O worker lê decisões com a capability do job. As
migrations `20260824180255`, `20260824180448` e `20260824180822` estão aplicadas no projeto e o
Security Advisor permanece com zero alertas.

O Gate 5 introduz `@offroad/case-factory`. O schema declarativo descreve companhia, três ou mais
exercícios, dívida, pedido, garantias, carteira opcional, mandatos e perturbações. O gerador produz
documentos determinísticos, candidatos, loan tape, brief e gold derivados dos mesmos parâmetros.
O gold é capturado antes das perturbações, por isso uma omissão simulada mede recall em vez de apagar
a resposta certa. O matching esperado usa o mesmo contrato completo de critérios duros do motor.
Carteiras fecham exatamente em saldo total, saldo vencido e concentração do maior sacado.

Três cenários iniciais atravessam as nove etapas reais: expansão corporativa limpa, capital de giro
com sala suja e inputs hostis, e recebíveis com 250 títulos. A identidade econômica entre PT e EN é
testada. Um suporte sem âncora confirmada continua visível no case para revisão, mas o auditor agora
recusa qualquer claim material que dependa dele direta ou indiretamente. Anchors artesanais como
Rede Horizonte permanecem separados e continuam sendo a referência econômica revisada por pessoas.

| Gate | Estado | Evidência atual | Próxima condição |
|---|---|---|---|
| B0 Fundação | accepted | monorepo, docs, CI (`check` + `database` + `e2e` obrigatórios), templates, `AGENTS.md`/`CLAUDE.md` raiz, Blueprint versionado, histórico de migrations alinhado ao projeto | manutenção contínua |
| B1 Website | in_review | experiência bilíngue premium em grafite/azul institucional, proposta de valor explícita para empresas, originadores e gestores, mapa animado do mercado, product film localizado, logo oficial, metadata e QA responsivo | automação de acessibilidade e aprovação editorial/legal |
| B2 Auth | accepted | cadastro por perfil com código de 6 dígitos, recovery, onboarding persistente; jornada autenticada coberta por E2E em CI (signup → código → onboarding → login) | MFA/AAL2 e step-up para ações sensíveis |
| B3 Domínio/RLS | accepted | RLS + FORCE RLS em 32/32 tabelas; sem `offroad` self-service; teste de não interferência (tenants, intake, comandos RPC, delete de documentos) em CI e executado remotamente; Security Advisor sem alertas | papéis internos granulares (`can_access_opportunity` por permissão) e revisão externa do threat model |
| B4 Documentos | in_review | bucket privado, upload direto com SHA-256 recalculado no servidor (`sha256_verified_at`), remoção enquanto a sessão está aberta, revisão assistida, fixture Rede Horizonte por hash, sessão/candidatos/issues em comandos atômicos, E2E do fluxo; **P1 F0**: ontologia, núcleo de verificação de âncoras, gateway multi-provedor e harness de evals com gold case G1 (pacotes puros, ainda não ligados ao fluxo) | F1: worker isolado (D-003), portaria/quarentena, camadas por formato, perfis; F2: extração ancorada substitui o fixture atrás de flag |
| B5 Financial core | in_review | pacote decimal exato e golden tests determinísticos | modelos avançados, versionamento e validação independente |
| B6 Crédito/estrutura | in_progress | contratos de domínio, criação atômica de company/pedido/oportunidade + fatos de evidência aprovados; sala de crédito com contadores reais e placeholders honestos | spreading/reconciliação, capacidade, structuring workbench |
| B7 Agent Kernel | not_started | - | B3-B6 |
| B8 Outputs | in_progress | evidence compiler e sala de oportunidade sintética | geração versionada com provenance completo |
| B9 Matching | in_review | matching core determinístico com explicações e testes | persistência, feedback loop e avaliação offline |
| B10 Market activation | not_started | - | B8-B9 + policy regulatória |
| B11 Admin | in_progress | workspace por perfil; tipo `offroad` reservado (não self-service) | papéis operacionais Offroad, four-eyes, console admin |
| B12 Observabilidade | in_review | adapters Sentry/PostHog privacy-first, taxonomy allowlisted e testes de redação de PII | criar projetos externos e configurar DSN/token por ambiente |
| B13 Hardening | in_progress | grants mínimos, FORCE RLS total, guard de tipo de org, teste RLS + lint de schema em CI, migrations replicáveis do zero | CSP, rate limits, SAST/SBOM, restore drill, pentest |
| B14 Deployment | in_review | produção Vercel, GitHub conectado, Supabase ativo e `offroad.capital`/`www` com DNS e TLS válidos | projetos externos de observabilidade e política de promotion |
| B15 E2E | in_review | Playwright em CI contra stack local: cadastro, código, onboarding documents-first, upload dos 8 arquivos, verificação de hash, revisão (38 campos/8 issues), confirmação atômica, pipeline, sala de crédito, conjunto desconhecido, sign-out/login; 45 testes unitários; job obrigatório | acessibilidade automatizada, cross-browser, jornadas originador/provedor |

## Incremento ativo (18/08/2026)

Objetivo: estabilizar a fatia vertical antes do extrator geral (P0 do
`handoff.md` §20) e profissionalizar a operação para dois agentes.

- [x] governança: `AGENTS.md`/`CLAUDE.md` raiz, migrations alinhadas, `seed.sql`, dependabot sem majors de toolchain
- [x] hardening: FORCE RLS nas tabelas de intake, sem `offroad` self-service, sessões só para tenants tomadores, login sem `minLength`
- [x] intake unificado (`src/lib/intake`, `src/components/intake`), copy no catálogo `Intake`, sem texto de fixture em produção
- [x] comandos atômicos: `begin/complete_intake_processing`, `review_intake_candidate`, `confirm_document_intake` (idempotente)
- [x] hash verificado no servidor, remoção de documento com sessão aberta, uploader único
- [x] E2E em CI (stack local + Playwright), encontrou e corrigiu a criação de sessão sob RLS
- [x] páginas de erro/404 localizadas; placeholders desabilitados com "Em breve"; código morto removido
- [x] ADRs 0004–0007, ledgers e `handoff.md` atualizados
- [x] Sentry e PostHog ligados em produção (20/08/2026). Projeto `offroad` na org `olpi-technologies` do Sentry; no PostHog o plano free permite um projeto só, então o Offroad divide o `Default project` (341812) com o resto. `NEXT_PUBLIC_SENTRY_DSN` e `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` configurados em production, preview e development. Verificado ponta a ponta: evento de teste aparece como issue no Sentry (`firstEvent` gravado) e dois eventos `offroad_wiring_check` ingeridos no PostHog.
- [x] Configuração do projeto no Sentry (21/08/2026): `scrubIPAddresses` ligado no projeto e na org (IP é dado pessoal), 23 `sensitiveFields` com os nomes de campo deste domínio (`cnpj`, `requested_amount`, `ebitda`, `capability_token`, `result_summary` e os demais), `allowedDomains` restrito aos nossos quatro hosts (era `*`), `allowSharedIssues` desligado na org (issue era compartilhável por link público, com contexto financeiro dentro), e o scrubber ligado como **padrão da org**, senão um projeto novo nasceria sem ele. Regra de alerta em toda issue nova, porque sem tráfego tudo é sinal. Verificado num evento real: o IP chega ausente.
- [x] Stack trace de browser legível sem credencial nenhuma. Três elos, cada um invisível até o anterior cair: source map não era emitido (PR #115), era emitido e voltava 403 pelo `protectedSourcemaps` da Vercel (desligado via API; o repositório é público, então o mapa não expõe nada novo), o nome do arquivo era mastigado pela nossa própria redação em `[number]` (PR #116) e o frame apontava para `app:///`, que o Sentry só casa com artefato enviado (PR #117). Estado final medido: o Sentry busca o script e acha o mapa (`js_no_source` virou `js_invalid_sourcemap_location` num frame sintético, que é o esperado quando a linha é falsa).
- [x] Stack trace de servidor: **decidido não usar `SENTRY_AUTH_TOKEN`** (21/08/2026). O bundle de servidor nunca é servido, então raspagem não alcança e só o upload resolveria, o que exige um token de escrita. Não vale, porque o erro de servidor já é visível e legível em três lugares: o rastreio de runtime da Vercel (foi ele que confirmou a correção do PR #104, com arquivo e linha), o `reportServerFailure` deste repo, que grava passo, código e mensagem já redigida, e o Sentry para tudo que acontece no navegador do cliente. O token seria acabamento, não capacidade. A integração Sentry na marketplace da Vercel foi descartada no mesmo dia: é do tipo "Vercel Native", cria uma **conta Sentry nova** em vez de ligar a org `olpi-technologies`, e pode gerar cobrança.
- [ ] extrator geral de documentos (P1), plano detalhado em [`P1_INTELLIGENCE_PLAN.md`](P1_INTELLIGENCE_PLAN.md); ADR 0008

## P1: Fase F0 (fundações da inteligência), 18/08/2026

- [x] `packages/credit-ontology`: taxonomia, catálogo de campos (cobre os 38 do fixture + expansões), plano de contas, períodos/entidades, ranks, política de auto-aceite v1, regras R1–R17, definições (PR #52)
- [x] `packages/document-intelligence`: contratos de camada/perfil/candidato/exceção/brief, índice de camadas, verificador de âncora (7 checagens), normalizador Decimal (PR #53)
- [x] `packages/model-gateway`: Anthropic + OpenAI via API, política sem Haiku, structured outputs validados, budgets, fallback, redação, cassetes, logs sem conteúdo (PR #54)
- [x] `packages/evals` + gold case G1 (Rede Horizonte a partir do gabarito sintético) + baseline do fixture: precisão 100%, recall material 47,7%, exceções 7/12 (PR #55)
- [x] ADR 0008 (arquitetura da inteligência documental)
- [ ] revisão da ontologia por especialista (D-013); DPA/ZDR nos provedores (D-010)

## P1: Fase F1 (pipeline de documentos), 18/08/2026

- [x] F1-1 estado do pipeline: `processing_runs`, `processing_jobs`, `document_profiles` e `document_layers`; versão e resultado de portaria em `source_documents`; campos de verificação de âncora nos candidatos e metadados de reconciliação nas issues; buckets privados `document-layers` e `case-artifacts`; comando `begin_processing_run` (app) e seis comandos do worker, credencial de worker com hash para *claim* e capability token por job para o resto, **sem service-role** e sem `organization_id` vindo do chamador (migration `20260818171246`)
- [x] F1-1b endurecimento de privilégios encontrado pelo advisor: `anon` deixa de ter qualquer privilégio no schema `public`, as *default privileges* do bootstrap Supabase são revogadas (era a origem do vazamento desde `20260817202038`), os comandos `security definer` passam para `private` com wrappers `security invoker` em `public` (AGENTS.md §6) e os FKs do pipeline ganham índices de cobertura (migrations `20260818172243` e `20260818172357`)
- [x] F1-2 `packages/document-parsers`: bytes → camada com âncoras estáveis (`p12.t1.r4.c3`, `sDRE!B14`, `sec3.p7`, `sl4.b1`), tipo decidido por magic bytes, declarações de escala detectadas (nunca aplicadas), e recusa explícita do que não dá para ler; leitor próprio de XLSX porque o exceljs não enxerga o prefixo `x:` que estes arquivos usam e devolvia planilha vazia; `.xls/.doc/.ppt` recusados com mensagem acionável (sem parser mantido e sem advisory aberto); defesas contra arquivo hostil (bomba de descompressão, entidades XML, tetos por página/aba/tabela) com truncamento sempre reportado (PR #59)
- [x] F1-2b formatos universais (decisão do fundador, 18/08): `.xls`/`.xlsb`/`.ods`/`.dbf` lidos em processo (SheetJS 0.20.3 da distribuição oficial, a 0.18.5 do npm tem vulnerabilidade aberta), subtipo do contêiner Office 97 decidido pelo stream interno e não pela extensão, `.doc`/`.ppt`/`.rtf`/`.odt`/`.odp` por conversão e imagens/PDF digitalizado por OCR, ambos como capacidades que o worker empresta ao pacote puro; texto de OCR nunca sai do modo digitalizado nem entra em auto-aceite (PR #60)
- [ ] F1-3 `apps/document-worker` (contêiner com LibreOffice + OCR, fila, portaria/ClamAV, perfil pelo gateway) + deploy AWS ECS Fargate `sa-east-1` (D-003 aprovado)
  - [x] credenciais provisionadas (19/08): os quatro segredos auxiliares em `sa-east-1`, a conta de serviço `document-worker@offroad.capital` (sem organização, criada pelo signup público, sem service-role) e o `sha256` do token em `private.worker_tokens`; cadeia verificada de ponta a ponta com `worker_claim_job` respondendo `{"claimed": false}`
  - [x] workflow de deploy resolve os ARNs dos segredos pelo nome (`secretsmanager:DescribeSecret` sobre `offroad/*` no `offroadGitHubDeployRole`, metadados, nunca o valor)
  - [ ] imagem construída e publicada no ECR (0 imagens hoje) e serviço ECS criado (a criação depende de uma task definition registrada, logo vem depois do merge)
- [x] F2-1 `packages/document-extraction`: camada + ontologia → candidatos citados. O modelo lê e cita; o pacote decide o que sobrevive, toda âncora é reconferida contra o documento e o valor normalizado é calculado em código, nunca aceito do modelo. Evidência renderizada por linha com o id da âncora; documento grande vira vários trechos em vez de um trecho truncado. 12 testes.
- [x] F2-1b `pnpm --filter @offroad/evals measure`: roda o extrator real sobre um gold case e pontua com o harness existente (recall material, precisão, alucinação, custo). Executado: 75,4% / 79,0%.
- [x] F2-1c `pnpm --filter @offroad/evals measure:classification`: roda o classificador real sobre o mesmo gold case (tipo, classe da informação, período, calibração da confiança). Executado em 20/08/2026: 100% de tipo, 0 errados com confiança. O `.env.local` segue com as chaves vazias por desenho; a medição roda no workflow `Measure classification`, onde uma sessão OIDC curta lê o Secrets Manager e mascara o valor.
- [ ] F2-2 reconciliação: `packages/evidence-compiler` tem 45 linhas e não concilia nada; as regras R1–R17 e os ranks de evidência existem em `credit-ontology` e ainda não têm consumidor
- [ ] F2-3 ligar o extrator ao worker (hoje o worker faz portaria → parse → camada → perfil e para aí)
- [ ] F1-4 UI: aba Documentos com índice organizado e tela de processamento por etapas (Realtime), paridade PT/EN
  - [x] emissão das URLs assinadas (`src/lib/intake/pipeline-run.ts`): o app assina o download em `opportunity-documents` e o upload da camada em `document-layers`, e abre a run com `begin_processing_run`, o worker continua sem credencial de Storage; atrás de `PIPELINE_RUNS_ENABLED`, desligada por padrão
  - [x] migration `20260819115701`: política de `insert` em `document-layers`, que faltava desde `20260818171246` (sem ela `createSignedUploadUrl` é recusado e a camada não tem onde ser gravada)
  - [x] ponto de chamada ligado (20/08): `processIntakeSession` bifurca, com `PIPELINE_RUNS_ENABLED` abre a run e **retorna**, sem tocar no caminho fixture; sem a flag, fixture como antes. Os dois nunca rodam juntos
  - [x] worker extrai de verdade: estágio E3 no pipeline, `worker_record_candidates` (migration `20260820104922`) grava candidato com âncora, quote e flags, e `worker_complete_job` move a sessão para `review_ready` quando o último job termina, sem isso a jornada acabava num spinner
  - [ ] tela de processamento por etapas (Realtime) e aba Documentos com índice organizado

## P1: Fase C (playbook do desk), 20/08/2026

- [x] `packages/credit-playbook`: cinco arquétipos de operação (crescimento/expansão, capital de giro, refinanciamento, aquisição, financiamento de equipamentos) mais o fallback, cada um com informação **mínima** (linha de recusa: sem isso o caso não abre) e **ideal** (linha de precificação), focos de análise com a pergunta que cada um responde, riscos como hipótese a testar, menu de estrutura (bandas de prazo, carência, amortização, garantias, covenants) e perguntas-padrão ligadas a um foco. Validado pelo fundador (D-013, 20 anos de banco de investimento)
- [x] motor de suficiência: a régua é respondida pelo que o pipeline **leu**, não pelo que alguém marcou; um documento pode satisfazer mais de um requisito; próximo passo em uma linha, PT/EN. 12 testes, incluindo integridade contra a ontologia (todo `DocumentKind` existe, todo field path resolve)
- [x] intake guiado (20/08): a empresa escolhe a operação antes de subir arquivo, e a régua se preenche sozinha conforme cada documento é classificado, mínimo e ideal em listas separadas, nunca uma barra só, com o "por que importa" em cada item pendente e uma linha dizendo qual é o próximo passo
- [ ] captura da operação pretendida no início (arquétipo, montante, uso, prazo/taxa almejados)

## P1: Fase B (conciliar e calcular), 20/08/2026

- [x] `packages/reconciliation`: **determinístico de ponta a ponta, sem nenhuma chamada de modelo**
  - precedência entre fontes por **rank de evidência** (auditado > revisado > gerencial > apresentação), nunca por recência ou confiança; o valor perdedor **não é descartado**, fica anexado ao fato com sua fonte e âncora, porque a diferença é justamente a pergunta que o investidor faz
  - regras R3/R4/R5/R11/R13/R14/R16 como aritmética sobre os fatos conciliados; toda exceção nasce com **os dois lados e os dois documentos**, e é uma pergunta, não um veredito
  - cálculos com **trace**: dívida líquida, EBITDA ajustado, alavancagem pré e pós, capacidade de garantias após haircut, totais de fontes e usos, cada insumo aponta o campo e o documento de onde veio; cálculo sem insumo **não é estimado**, vira lacuna reportada
  - lacunas de informação a partir do checklist do playbook e dos campos materiais ausentes: viram pedidos com o "por que importa" junto
  - 14 testes; alavancagem pré confere com o gabarito (1,7788x)
- [ ] ligar ao worker: rodar a conciliação ao fim da run e persistir fatos, exceções e cálculos
- [ ] aba Financeiro e aba Conciliação na UI

## P1: Fase D (entendimento do case), 20/08/2026

- [x] `packages/case-understanding`, determinístico:
  - **score de prontidão em cinco componentes**, nunca um número só, suficiência de dados (mínimo pesa o dobro), estado da conciliação (ponderado por severidade), qualidade da evidência (rank médio + % com âncora confirmada), lacunas materiais e bloqueios. Cada componente traz a explicação em números que o leitor confere. **Bloqueio não desconta pontos: segura o caso.** Um pacote 90% completo com balanço que não fecha não está 90% pronto
  - **auditor de evidência**: relê cada claim material, extrai os números realmente escritos na frase e recusa qualquer um que não apareça nos fatos ou cálculos citados. Ano, percentual e contagem passam sem suporte (senão a prosa fica impossível de escrever); dinheiro e múltiplo, não. Falha bloqueia, não avisa
  - 14 testes
- [x] case brief: schema versionado por seção, payload compacto (fatos conciliados, cálculos, exceções, lacunas e os focos do arquétipo, **nunca o data room cru**, para não criar a oportunidade de o modelo ler um número da página e repetir sem citar), instruções escritas como proibições, e `auditBrief` como portão único. Brief que não passa na auditoria **não sai com aviso: não sai**. Julgamento nasce não aprovado, "a alavancagem é confortável" é opinião do analista, não achado do sistema. 20 testes
- [ ] perguntas à administração e roadmap de diligência

## P1: Fase E (estrutura da operação), 20/08/2026

- [x] `packages/deal-structure`, determinístico:
  - **capacidade em três paredes independentes**, geração de caixa (ao DSCR mínimo do arquétipo), garantias (base elegível após haircut) e apetite de mercado (espaço até o teto de alavancagem), e a resposta é a menor delas. **Nomear a parede restritiva é o produto**: "pediu 38, garantias sustentam 28" é conversa de estrutura; "o limite é 28" é recusa. Parede que não dá para calcular não é tratada como infinita, é reportada como lacuna
  - **term sheet indicativo** com `basis` em cada termo (capacidade · playbook · pedido da companhia · fato conciliado) e a razão junto. Prazo pedido fora da banda é puxado para dentro e o documento diz que puxou
  - **sem preço, deliberadamente**: a Offroad não precifica; custo sai da conversa com quem toma o risco. Inventar taxa é o jeito mais rápido de perder a confiança da companhia quando o mercado responde outra coisa
  - tetos de alavancagem e DSCR mínimo por arquétipo entraram no playbook como **dado** (3,5x / 1,30x em expansão; 2,5x / 1,20x em giro; 4,0x / 1,35x em aquisição), são os primeiros números que um profissional de crédito vai querer discutir
  - 13 testes
- [x] `packages/case-materials`: os três documentos que um processo de dívida precisa, **teaser** (diz o bastante sem dizer quem, até a companhia autorizar), **perfil de crédito** (a análise) e **pacote** (perfil + estrutura indicativa). Compilados dos fatos, não escritos à mão. **Exceção crítica bloqueia os três**, caso que não concilia não chega ao investidor com capa bonita, e brief que falha na auditoria não pode ser citado, porque as frases dele são exatamente o que seria citado. Pontos em aberto entram no documento: investidor que descobre sozinho confia menos que o que recebeu a lista. PT/EN com economia idêntica por construção; detecção de material desatualizado quando um fato se move. 11 testes
- [ ] render em PDF no template Offroad
- [ ] modelo financeiro exportável

## Tudo ligado (20/08/2026)

`buildCaseState` é o único caminho e a ordem carrega significado: **concilia → mede prontidão →
dimensiona capacidade → estrutura o term sheet → escreve o brief → compila os materiais**. Nada é
dimensionado antes de os números conciliarem, nada é escrito antes de ser dimensionado, nada é
compilado antes de o que foi escrito passar pela auditoria. Cada etapa degrada com honestidade:
brief que não sai deixa o case com fatos, exceções, prontidão e estrutura, o que nunca acontece
é uma etapa inventar insumo que não recebeu. Tela de revisão mostra tudo, e **cada ausência
explica a si mesma** (brief recusado diz que a auditoria recusou; parede não calculada diz qual
insumo faltou), porque tela que omite em silêncio ensina o leitor a achar que branco é zero.

## Entregáveis, aprendizado e horizonte (20/08/2026, tarde)

**Os materiais saem como documento.** `@offroad/case-render` transforma um material em página A4
no template Offroad, impressa em PDF pelo próprio Chrome, sem headless na serverless e sem
serviço de render para manter vivo. As citações sobrevivem: cada alegação vira marcador numerado
e resolve num apêndice de Fontes até o campo, o período e o nome do arquivo de origem. Rota
`/[locale]/app/materials/[sessionId]/[kind]`, `?print=1` abre o diálogo de impressão.

**O caso deixou de ser recomputado a cada render.** `saveCaseState` existia e nunca era chamado,
então toda atualização da tela re-rodava a linha inteira, inclusive a chamada de modelo que
escreve o brief, quatro refreshes custavam quatro briefs, cada um com redação levemente
diferente. `resolveCaseState` calcula uma vez por estado do data room, com fingerprint sobre
arquétipo, status, contagens de documento/candidato/resposta e o `updated_at` mais recente dos
candidatos. Invalidado por mudança, nunca por idade.

**Modelo financeiro exportável.** `@offroad/financial-model` emite um `.xlsx` real com 159
fórmulas vivas: projeção operacional, cronograma de dívida com carência e SAC, CFADS, DSCR e
alavancagem contra o teto do playbook. É modelo de crédito, não de equity, não projeta balanço,
e a capa diz isso. Toda célula editável fica numa única aba, garantido por teste; o SheetJS
community não escreve estilo (medido, não suposto), então a convenção de célula azul foi
substituída por uma estrutural que sobrevive a qualquer writer. Um avaliador de planilha
escrito só para teste executa as fórmulas como o Excel faria, o que pegou três expectativas
minhas erradas e um bug que nada mais veria: célula de fórmula sem valor em cache sai como
`t="e"` e a projeção inteira abre em `#N/A`.

**A plataforma aprende com correção.** `review_intake_candidate` sobrescrevia
`normalized_value` no lugar, a proposta do modelo era destruída pelo próprio ato de corrigi-la.
`extraction_feedback` grava toda decisão humana com o estado anterior congelado ao lado, dentro
da mesma transação e antes do update. Append-only na ACL, não só na intenção: `authenticated`
tem SELECT e INSERT, então UPDATE e DELETE levantam 42501 (verificado contra o projeto).
`@offroad/extraction-learning` mede acurácia por campo **e tipo de documento**, com limite
inferior de Wilson em toda taxa e erro de escala contado à parte, e usa isso para decidir o
auto-accept: campo com erro de escala no histórico fica travado em qualquer confiança, campo
não provado precisa ganhar o direito, campo abaixo de cara-ou-coroa fica travado, campo abaixo
da meta tem a barra elevada.

**O pedido ganhou eixo de tempo.** Três horizontes, **Agora** (aberto, ≤ 20 itens por teste),
**Quando um fundo se interessar** (fechado, explicitamente não pedido) e **Se a operação
acontecer** (fechado, sem marcas, `source: "notice"`). Todo item pendente pode ser respondido
sem arquivo: não se aplica, parcial, depois do NDA, e "não se aplica" exige razão no tipo, na
server action e numa check constraint.

## Estado corrente (20/08/2026)

A linha do pipeline está ligada de ponta a ponta: empresa envia documentos → app assina os
links e abre a run → worker baixa, escaneia, parseia, classifica, **extrai com citação
verificada** e grava os candidatos → o último job move a sessão para `review_ready` → a tela de
revisão mostra os fatos com âncora. Nenhum passo é fixture.

Qualidade medida sobre documentos reais, agora nos dois estágios:

| estágio | medida | resultado | custo |
|---|---|---|---|
| E1 classificação | tipo do documento | **8/8, 100%** | US$ 0,0946 / 8 docs |
| E1 classificação | classe da informação | 6/8, 75,0% | |
| E1 classificação | período | 5/5, 100% | |
| E1 classificação | errado com confiança >= 0,80 | **0** | |
| E3 extração (rede-horizonte) | recall material | 75,4% | ~US$ 2,50 / caso |
| E3 extração (rede-horizonte) | precisão | 79,0% | |
| E1 classificação (fakeco) | tipo do documento | **100%** (9/9) | US$ 0,041 / 9 docs |
| E1 classificação (fakeco) | classe da informação | **100%** (9/9) | |
| E1 classificação (fakeco) | errado com confiança | **0** | |
| E3 extração (fakeco) | recall material | **80,2%** (105/131) | US$ 1,09 / caso |
| E3 extração (fakeco) | recall de dívida | **92,6%** (50/54), era 1,9% | |
| E3 extração (fakeco) | precisão | 83,9% (125/149) | |
| E3 extração (fakeco) | alucinação | 0% | |

E1 não tinha número nenhum até 20/08/2026, e a ausência não era neutra: a medição de E3
entrega ao extrator o tipo **correto** de propósito, para isolar os estágios, então "quão bom é
o pipeline" era só metade da resposta. Com os 100% de tipo, o 75,4% de E3 passa a valer como
afirmação ponta a ponta em vez de condicional.

A primeira execução encontrou um defeito que derrubava a classificação inteira: o schema exigia
a chave presente com `null` e todo modelo omite a chave, então primário e fallback falhavam e o
documento voltava sem perfil algum (corrigido na PR #110).

As duas divergências de classe são a mesma: a carta do CFO e o memorial descritivo foram lidos
como `management` onde o gabarito diz `company_document`. Isso muda a precedência de evidência
(rank 5 contra 7), ou seja, o classificador dá a esses documentos **mais** peso do que o
gabarito pretendia. Defensável dos dois lados e é decisão de mesa, não de código: um parecer do
CFO é informação da administração ou documento societário? Pendente com o fundador.

Reproduzir: workflow `Measure classification` (manual, chaves via OIDC no Secrets Manager).

## O que a Aurora encontrou, 21/08/2026

O segundo gold case (`packages/testing-fixtures/gold/fakeco`) existe para medir o que o
primeiro não alcança. Em algumas horas ele achou cinco coisas, e três eram defeito nosso.

**Corrigido.** A classe da informação era escolhida pelo modelo e o rank de evidência derivava
dela, então um `trial_balance` corretamente identificado podia ser ranqueado 5 em vez de 3 e
inverter a precedência entre dois documentos que discordam (PR #123). A ontologia não tinha tipo
para relação de clientes, e como `other` não mapeia para grupo de campo nenhum, o grupo
`customers` era inalcançável na prática (PR #124). E o próprio gabarito falava um dialeto
inventado, o que fez a primeira medição reportar 8,1% quando o real era 42% (PR #125).

**Aberto, e é o maior buraco do produto: extração de dívida está em 1,9% (1 de 54 campos).**
Tudo o mais está entre 50% e 100%. Só a dívida colapsa, e ela é a primeira coisa que uma mesa de
crédito lê. A instalação está correta ponta a ponta e foi verificada: o `debt_schedule` pede 34
alvos incluindo todos os moldes `debt.instruments.{i}.*`, o prompt explica como preencher o
índice e diz que os itens seguem a ordem do documento, e a planilha é lida com 68 células. O
modelo recebe a pergunta certa sobre um documento legível e devolve **1 candidato com zero
ausentes**, ou seja, nem sequer declara o que não achou. É comportamento de modelo em tabela
larga, não encanamento quebrado, e o caminho provável é fatiar tabelas por linha em vez de
mandar a tabela inteira num trecho só.

Isso era invisível antes porque o gabarito do rede-horizonte tem **zero** campos de dívida.

**Resolvido em 21/08 (PR #130): passadas por linha.** O modelo, pedido para expandir 7 linhas
por 7 campos de uma vez, devolvia 1 candidato; nenhuma redação de prompt conserta uma tarefa
que nunca deveria ter sido uma tarefa só. A orquestração agora enumera e o modelo lê: cada
linha de dados de tabela detectada vira uma passada própria, com cabeçalho, âncora da linha e
os padrões indexados já com o índice aplicado. Linhas de total são filtradas antes do modelo,
ausências de passada por linha são ignoradas, e o candidato da linha ganha o dedup contra o do
documento inteiro. Dívida foi de 1,9% para **92,6%**; o recall material do caso, de 42% para
**80,2%**. Restam: customers a 50% (provável normalização de percentual), leverage 0/1 (campo
calculado que o gabarito não deveria esperar de extração) e o OCR ainda sem número.

**Aberto, e é limitação do instrumento, não do produto.** O contrato social chega como foto e
produziu zero candidatos: o harness de medição roda fora do worker e não tem OCR, que é
capacidade que o worker empresta. O caminho de OCR continua sem número, e medi-lo exige rodar a
medição dentro do worker.


Handoff completo, incluindo como testar o fluxo e o que falta:
[`HANDOFF_2026-08-20.md`](HANDOFF_2026-08-20.md). Alvo do produto e plano por fases:
[`DCM_DESK_DE_PARA.md`](DCM_DESK_DE_PARA.md).

Produção canônica: `https://offroad.capital`

## Documentos institucionais, mesa na tela e a primeira companhia aberta, 21/08/2026

Três PRs (#132, #133, #134); detalhe em `HANDOFF_2026-08-21.md`.

- **Investment Memorandum e Term Sheet** compilados dos números da mesa (não da prosa do brief):
  termos-chave, operação, companhia, histórico, estrutura de capital e tratamento, trajetória com
  covenant proposto, projeções, fatores de risco com resposta estrutural, base de preparação;
  term sheet com partes, termos econômicos com a base ao lado de cada um, destinação, garantias,
  covenants, CPs, obrigações de informação, eventos de vencimento. Só saem quando a mesa rodou.
- **Mesa na tela do case**: o que estava calculado e persistido e nunca aparecia.
- **Camil Alimentos**: gold case com arquivamentos públicos reais. O que a mesa errou ao ler uma
  companhia aberta está corrigido (data-base do estoque, covenant da companhia, refinanciamento
  abatido, EBITDA mantido sem projeção, taxas `% do DI` e `pré`). Medições de extração e
  classificação disparadas; números a registrar na tabela abaixo quando terminarem.

| medição | métrica | valor | custo |
|---|---|---|---|
| E1 classificação (camil) | tipo / classe | pendente | |
| E3 extração (camil) | recall material / precisão | pendente | |

## Venture debt e a Nimbus, 21/08/2026 (fim do dia)

- **Sexto arquétipo** (`venture_debt`, PR #135): exigências, focos, riscos, estrutura e perguntas
  de um credor de venture debt; capacidade = menor entre 30% do ARR e 35% da última rodada, nunca
  múltiplo de EBITDA. Campos novos na ontologia (ARR, MRR, queima, runway, NRR, churn, última
  rodada) e dois tipos de documento (`cap_table`, `metrics_report`). A migração também consertou
  o check de `document_profiles`, que não conhecia `customer_concentration`; um teste agora lê
  todas as migrações e cobra cada tipo e cada arquétipo.
- **Nimbus** (quarto gold case, sintético): SaaS de Série A, 40 clientes × 24 meses de MRR com
  semente fixa, cap table, gerencial, extrato; duas contradições (ARR do deck × export; runway
  declarado × calculado). 81 campos.
- **Mesa para quem queima caixa**: perfil `cash_burning` (sem turns, sem teste de covenant sobre
  EBITDA negativo, sem trajetória de alavancagem); seção de runway (antes, depois, depois com o
  serviço da própria dívida), dívida/ARR, NRR, concentração; leituras e perguntas próprias; bloco
  "Runway e receita recorrente" nos materiais; métricas na tela. Índice TR lido.

| medição | métrica | valor | custo |
|---|---|---|---|
| E1 classificação (camil) | tipo / classe / período | **100%** (3/3, 3/3, 2/2) | US$ 0,036 / 3 docs |
| E3 extração (camil) | recall material / precisão | em execução | |
| E1 classificação (nimbus) | tipo / classe / período | **100%** (6/6), 100% (6/6), 67% (2/3) | US$ 0,030 / 6 docs |
| E3 extração (nimbus) | recall material / precisão / alucinação | 73,4% (47/64) / 79,8% / **0%** | US$ 0,71 / 14 chamadas |
| E3 extração (nimbus, após #141) | recall material / precisão / alucinação | **85,9%** (55/64) / 85,6% / **0%** | US$ 0,91 / 15 chamadas |
| E3 extração (camil, antes de #143) | recall material / precisão / alucinação | 11,1% (15/135) / 50,0% / 0% | US$ 14,32 / 1.575 chamadas / 2h19 |
| E3 extração (nimbus, após #143) | recall material / precisão / alucinação | **92,2%** (59/64) / 87,4% / **0%** | US$ 0,92 / 15 chamadas |
| E3 extração (camil, após #143) | recall material / precisão / alucinação | 39,3% (53/135) / 66,7% / 0% | US$ 5,32 / 246 chamadas / 15 min |

## Mapa de entrega, perfil de vencimentos e simulações, 21/08/2026 (noite)

- **Mapa de entrega ao lado da zona de arrastar** (#137): a zona sobe para logo depois da
  escolha da operação; abaixo dela, quantos itens de agora já chegaram, cada item como chip que
  marca sozinho, e uma frase por arquivo (o que atendeu, como foi lido quando não atendeu nada,
  ou que ainda espera leitura). Preview em `/pt-BR/dev/case-preview`.
- **Cronograma por janela** (#138): `debt.maturity_profile.{i}.window/amount` na ontologia; a
  mesa lê "Jun/26 a Mai/27" e usa o perfil quando as linhas não têm vencimento. Leitura nova:
  principal de 12 meses contra o caixa (Camil: R$ 1,23 bi contra R$ 1,43 bi, 1,16x), com
  pergunta e métrica na tela.
- **Simulações**: `pnpm --filter @offroad/evals desk:gold camil -- --amount 800000000 --term 84
  --grace 24 --refinancing 600000000` responde "e se pedíssemos menos, mais longo, mais troca?"
  sem tocar no gabarito.
- **Produção**: os 500 de `/.env`, `/wp-login.php` e `/foo.bar` vistos na Vercel até 20/08
  21:17 pararam com o #104; sondado em 21/08: os três respondem 404 e `/pt-BR` 200.
- **Extração em quatro faixas** (#140): a Camil fez 431 chamadas sequenciais em 45 min (US$ 4,68)
  e foi cortada; as passadas agora correm até quatro em paralelo, mescladas na ordem do documento.
  Tetos por job do worker: 40 chamadas / US$ 5 viraram 800 / US$ 12, porque o teto de chamadas
  recusaria um arquivamento de companhia aberta de cara; o de custo continua sendo a guarda.
  Os workflows de medição ganharam 180 min (#139).
- **O que a Nimbus ensinou ao extrator** (#141): custos com sinal negativo viravam fato negativo
  (agora magnitude); "R$" e "BRL" eram duas moedas (canônico); a tabela de dívida de uma carta
  nunca era pedida (carta passa a mirar `debt`); planilha com várias abas era lida em uma janela
  e o resumo (ARR, MRR, queima) não voltava (uma aba por janela). CNPJ nos gabaritos em dígitos.
- **O que a Camil ensinou ao extrator** (#143): os números saíram certos e os caminhos saíram no
  dialeto do modelo (`interim_financials.2026.revenue`, `revenue_ytd`) em vez do canônico
  (`2026_05.revenue_3m`); o verificador passa a escrever o período no caminho a partir das datas
  citadas, e ano é o ano em que o período termina. ITR e protocolo CVM passam a mirar histórico e
  dívida (a nota 15 rendeu zero instrumentos porque nunca foi pedida). Passadas por linha só em
  tabelas com duas palavras do vocabulário dos campos indexados (eram 913 passadas no ITR).
  Re-medição da Camil disparada depois do merge.
- **Segunda rodada de medições** (noite): Nimbus é o primeiro caso a passar o gate de recall
  (92,2%); Camil subiu de 11% para 39% e caiu de US$ 14 / 2h19 para US$ 5 / 15 min. O que
  sobrou na Camil é numeração de instrumentos reiniciando a cada tabela (#144), as tabelas dos
  comentários dos diretores (R$ mn, colunas fev-25/fev-26) e o covenant em prosa.

## Onda A em andamento e o começo da Onda B, 21/08/2026 (noite, segunda parte)

Plano em `PLANO_E2E_100.md`. O que entrou ou está em PR:

- **Conciliação que vê contradição** (#146, #155): o eval nunca rodava a conciliação (snapshot
  entrava com `exceptions: []`); agora roda a mesma do produto e pontua. R3 cobre todo fato
  material (crítico em pedido, receita, EBITDA, ARR, dívida, caixa acima de 5%; baixo quando é
  arredondamento abaixo de 1%); R18 runway declarado × caixa/queima; R19 mapa de dívida × dívida
  bruta do balanço (o arrendamento fora do mapa da Aurora). Modelo financeiro passa a mirar
  `transaction` (o pedido do plano nunca era lido).
- **Uma linha é uma linha** (#147, #153): instrumentos de documentos diferentes nunca dividem
  número; dentro de um documento, tabelas diferentes também não (o deck da Nimbus produzia o CEO
  contra um fundo como "contradição"). Período menor que um ano vai para `interim` mesmo quando o
  modelo escreve `historical`.
- **Consolidado é o número da companhia** (#148): prompt, escopo no candidato até a conciliação,
  preferência por consolidado sobre controladora.
- **OCR medido** (#149): motor Tesseract movido para `document-parsers`, o eval usa o mesmo motor
  do worker, o runner instala; quinto caso `fakeco-scan` (demonstrações, mapa de dívida e contrato
  social como imagem, 83 campos). Medição a disparar.
- **Percentual é fração** (#150): "12,5%" → 0,125; 115 de retenção → 1,15.
- **Cogna** (#151): sexto caso, companhia aberta de serviços lida do release do 2T26 (57 campos,
  parede de 2028, arrendamentos fora da dívida). Simulação: R$ 1,8 bi em debêntures.
- **Rating interno** (#152) e **tabela de stress** (#154), Onda B: dez graus a partir de sete
  fatores com faixas escritas como dado; quatro choques padrão e a perda do maior cliente,
  recalculados dos números da mesa. Integração na tela e nos materiais vem em seguida.

| medição | métrica | valor | custo |
|---|---|---|---|
| E3 extração (nimbus, #146 com conciliação) | recall / precisão / exceções | 89,1% / 86,6% / 40% (2/5) | US$ 0,92 |
| E3 extração (fakeco, #146 com conciliação) | recall / precisão / exceções | 87,8% / 88,3% / 0% (antes de #153, #155) | US$ 0,89 |
| E3 extração (camil, #144) | recall / precisão | 54,8% / 65,0% | US$ 5,47 / 247 chamadas |

## Terceira leva da noite, 21/08/2026

- **OCR em produção estava quebrado** (#160): pdf.js destaca o buffer e o OCR recebia zero
  bytes; todo PDF escaneado lia vazio, no worker e no eval. Corrigido com teste na sala escaneada.
- **Catálogo de instrumentos** (#158), **pacote de garantias** (#159), **Q&A de diligência**
  (#162), **preview da Nimbus** (#161), **cobertura de juros** (#157, merged).
- **Conciliação**: contradição só entre documentos, não entre duas leituras da mesma página
  (#164); instrumentos de dois documentos com o mesmo nome são um só (#165); release de
  resultados é gerencial e janela de leitura limitada a 200 linhas (#165).

| medição | métrica | valor | custo |
|---|---|---|---|
| E1 classificação (cogna) | tipo / classe | 50% (release lido como relatório de métricas, corrigido em #165) / 100% | US$ 0,013 |
| E3 extração (cogna, antes de #165) | recall / precisão / exceções | 22,9% / 92,3% / 100% (FP 19) | US$ 0,35 / 3 chamadas |
| E3 extração (camil, #155) | recall / precisão / exceções | 41,5% / 56,9% / 100% (FP 16, corrigido em #164) | US$ 5,42 / 243 chamadas |
| E3 extração (fakeco-scan, OCR, antes de #160) | recall | 0% (buffer destacado) | |

## Quarta leva da noite, 21/08/2026: o comitê na tela e no memo

- **Comitê na tela e no memorando** (#170): rating com fator a fator, tabela de stress, papéis
  que o perfil admite, pacote de garantias e preço indicativo (documento interno; o term sheet
  segue sem taxa por decisão de desenho), computados uma vez no pipeline e lidos pela tela e pelo
  memo (seção 10). Referência de preço em `packages/market-reference` (#167), com proveniência
  "prática da mesa" em todo número. Base de investidores e shortlist em `packages/investor-base`
  (#169, sintético). Covenants como a escritura escreve (#172).
- **Medições**: workflows passam a rodar um caso ao lado do outro (#171). `fakeco-scan` com OCR
  funcionando: 22,9% de recall com 3 chamadas; o próximo passo do OCR é reconstruir tabelas a
  partir das linhas reconhecidas (hoje cada documento vira uma janela de prosa, sem passadas por
  linha). Nimbus, FakeCo, Cogna e Camil a re-medir depois do #171.
- **Processo**: auto-merge ligado e `strict` desligado na proteção de `main` para drenar a fila;
  religar `strict` quando esvaziar. Lição da noite: só fazer push depois de `pnpm check` verde
  lido de arquivo, não de `grep | head` (dois PRs subiram vermelhos por isso e foram corrigidos).

## Quinta leva da noite, 21/08 para 22/08/2026: regressões medidas, sala de saída, Word, sondagem

O que entrou em `main` (todos por auto-merge após CI verde):

| PR | O quê |
|---|---|
| #172, #173 | Catálogo de covenants no term sheet; docs |
| #174, #181 | OCR: tabelas reconstruídas das linhas do Tesseract; depois linhas reconstruídas por posição vertical, porque o Tesseract lê tabela coluna a coluna |
| #175, #176 | `@offroad/data-room`: sala de saída com portões (antes do NDA, após NDA, interno), retenções (exceção bloqueante, hash não verificado, sem classificação), pendências como pedidos; painel no case e índice interno imprimível |
| #177 | Duas regressões de extração: uma tupla por linha de planilha (a célula ficava na chave) e zero à esquerda nunca é milhar (`0.181` lia 181) |
| #178 | Falsos positivos de exceção contados só sobre regras; lacunas são pedidos. Copy do playbook sem "médio porte" |
| #179 | `@offroad/case-export`: materiais em Word (zip próprio, determinístico) e rota `/docx` |
| #180, #183, #184 (fila) | `@offroad/sounding` (estágios, indicações numa régua, book, alocação, trilha), tabelas `soundings`, `sounding_investors`, `sounding_events` (append-only) e a tela `/app/sounding/<sessão>` |
| #182 | Carta, deck e memorial passam a mirar os grupos financeiros que reescrevem (a contradição precisa dos dois valores); aging, licenças e intermediário revisado no playbook |
| #185 (fila) | Identidade de emissão e série como credor; moeda da tabela; remuneração e vencimento por série em prosa |

Medido (recall de campos materiais / precisão / recall de exceções, FP só sobre regras):

| Caso | Antes da leva | Depois |
|---|---|---|
| Nimbus | 82,8% (regressão de #165) | **92,2% / 87,0% / 80%** (#182) |
| FakeCo (Aurora) | 58,0% (regressão de #165) | **93,9% / 94,0% / 100%** (#182) |
| fakeco-scan (OCR) | 15,7% | **59,0% / 96,1%** (#181) |
| Cogna | 22,9% | 31,3% |
| Camil | 53,3% (tudo a 100% exceto `debt.instruments`: 57 de 63 faltas) | em medição com #185 |

O que a medição ensinou: (1) a chave da tupla guardava a célula da planilha, e sete instrumentos viraram 51 tuplas de um campo; (2) `0.181` era lido como milhar em pt-BR; (3) as "falsas" exceções eram os requisitos do playbook; (4) a contradição só aparece se o segundo documento também for alvo do campo; (5) Tesseract devolve tabela coluna a coluna, então linha se reconstrói por posição vertical; (6) na companhia aberta, a série da emissão é a identidade do instrumento e a taxa está em prosa na proposta da administração.

Armadilha recorrente: depois de trocar de branch, `apps/web/.next/types` fica obsoleto e o `pnpm check` falha com rota inexistente; apagar a pasta antes do gate.

## Sexta leva, madrugada de 22/08/2026: execução e pós-closing como domínio

| PR | O quê |
|---|---|
| #187 | `@offroad/closing`: cronograma de pagamentos (SAC, Price, bullet; mensal a anual; carência paga ou capitalizada; CDI+, % CDI, pré, IPCA+ sobre base declarada) e condições precedentes (tier de closing do playbook + pacote de garantias + condições do investidor; satisfação exige evidência, dispensa exige motivo; prontidão para desembolso) |
| #188 | `@offroad/monitoring`: covenants testados a cada período nas definições da escritura, folga como fração do limite, atenção abaixo de 10%, violação com data de cura, "não testável" quando falta insumo ou o denominador não é positivo; relatório ao investidor |
| #189 | Sondagem no preview de desenvolvimento (`/pt-BR/dev/case-preview?case=fakeco`); percentuais por locale |
| #190 | Limite de covenant é número (razão); a Aurora devolvia "<= 3,0x" como texto |

O que falta para fechar as Ondas E e F na tela: termos finais estruturados depois da alocação (valor, prazo, carência, amortização, taxa por linha), persistência das CPs e dos períodos de monitoramento, e a ingestão do balancete novo pela mesma entrada de documentos. Os pacotes já fazem a aritmética; falta a porta.

## Sétima leva, madrugada de 22/08/2026: os restos medidos, um a um

| PR | O quê |
|---|---|
| #192 | `@offroad/closing`: termos finais a partir do book (cada investidor com sua taxa, prazo e carência) e cronograma consolidado com o mês de pico |
| #193 | Pessoas e clientes nomeados duas vezes são uma linha (a merge por identidade cobre controladores, gestão e maiores clientes) |
| #194 | Verificador: id entre colchetes não é parte da citação; estoque não carrega janela; "resultado financeiro líquido" é a despesa financeira |
| #195 | Trimestre e semestre como o release escreve (2q, q2, 1s, h1, ytd) viram mês e janela |
| #196 | Eval: contradição nomeada por regra não é valor errado (conta na precisão, não no recall) |
| #197 (fila) | Período implausível é descartado (3110-05-31 virou caminho); emissão e série viram um nome só; gold da Camil nomeia as linhas como o ITR imprime |

Medido nesta leva (recall material / precisão / recall de exceções):

| Caso | Resultado | Onde |
|---|---|---|
| FakeCo (Aurora) | **95,4% / 97,5% / 100%** | #194 |
| Nimbus | **93,8% / 94,0% / 100%** | #193 |
| Camil | 45,9% / 51,5% / 100% com #185 (piorou: período alucinado e nomes de série); re-medição com #197 em curso | #185, #197 |
| Cogna | 31,3% com #195 (o modelo passou a escrever `2026_q2`; aceito em #197); re-medição em curso | #195, #197 |

Lição da noite: cada ponto de recall agora vem de uma regra pequena lida do artefato (uma célula na chave da tupla, um zero à esquerda, um colchete na citação, um trimestre escrito ao contrário). O caminho para a companhia aberta é o mesmo, só que em um filing de 140 páginas; o que falta na Camil é uma coisa só, a tabela de séries, e ela já tem nome canônico.

## Jornada guiada de originação, 22/08/2026

- A entrada de empresa e assessor deixa de pedir uma escolha entre "documentos" e
  "preenchimento manual". Existe um único início guiado: objetivo da captação, contorno
  essencial do pedido e informações.
- O objetivo selecionado continua sendo o arquétipo real do `credit-playbook`; nenhum fluxo
  paralelo ou checklist de apresentação foi criado.
- A lista de informações é adaptativa e separa três horizontes acionáveis: mínimo para abrir a
  análise, recomendado para estruturar com consistência e ideal para preparar a diligência.
  Cada item mantém exemplos aceitos, racional, estado e documentos que o satisfizeram.
- Garantias, custo e instrumento continuam disponíveis, mas ficam numa área opcional. A empresa
  não precisa adivinhar a estrutura de mercado para avançar.
- O upload permanece único, privado e multiformato. Depois do processamento, a classificação
  continua preenchendo a lista automaticamente e preservando a evidência de origem.
- Cobertura: E2E atualizado para a nova sequência; `pnpm check` verde em 32 pacotes.

## Manifesto reproduzível do case, 24/08/2026

- O cache do case deixou de usar contagens e o último `updated_at`. O fingerprint agora cobre o
  conteúdo econômico normalizado da sessão, documentos e hashes, candidatos completos, respostas,
  layers, run e todas as versões governantes. Alterar uma resposta ou um valor muda o snapshot.
- Cada tentativa de modelo registra apenas metadados e hashes: id, tarefa, provider, modelo,
  outcome, custo, tokens e fingerprints de prompt, input e output. Nenhum texto ou valor financeiro
  entra na trilha.
- O worker persiste essa linhagem no resultado interno do job. A aplicação lê somente a projeção
  sanitizada por RPC, sem receber payload, erro bruto ou conteúdo do documento.
- `case_artifact_manifests` é append-only, tem RLS forçado, SELECT por tenant e nenhum grant de
  INSERT, UPDATE ou DELETE. `record_case_snapshot` grava manifesto e snapshot na mesma transação.
- Este manifesto é imutável e reproduzível, mas ainda não é uma atestação confiável: enquanto a
  compilação ocorrer no request autenticado da aplicação, um tenant tecnicamente sofisticado pode
  chamar o mesmo comando autorizado. O Gate 2 move produção e gravação para a identidade do runner
  e remove esse EXECUTE de `authenticated` antes de qualquer liberação externa (R-022).
- Manifests antigos ou incompletos permanecem honestos por `capture.sources` e `capture.models`;
  captura parcial nunca deve liberar direcionamento externo nos gates seguintes.

## Constituição, procedimentos compilados e vertical capex, 25/08/2026

- O documento antes chamado House Playbook foi reclassificado como
  `OFFROAD_DCM_OPERATING_CONSTITUTION.md`: camada 0 de mandato, princípios, fronteiras, linguagem e
  gates. Ele agora proíbe expressamente sociedades de agentes autônomos e skills editadas como uma
  segunda fonte de conhecimento.
- `procedure-contract.ts` cria maturidade `draft`, `candidate` e `production`, o núcleo mínimo de
  seis componentes, o contrato ampliado para promoção e o compiler determinístico. Toda skill
  compilada carrega procedimento, versão, SHA-256 da fonte, versão do compiler, schema, templates,
  dependências, papel e etapa. Runtime só aceita pipeline determinístico, `peerHandoffs: false` e no
  máximo três chamadas estreitas de modelo.
- A primeira vertical, expansão/capex corporativo, possui 20 procedimentos `candidate` cobrindo as
  doze etapas: enquadramento, intake guiado, documentos, extração, spreading, ponte da dívida,
  lacunas, companhia/setor, desempenho, business plan/downside, capacidade, alternativas,
  estrutura, memo, teaser, term sheet, data room, matching, QC e introdução qualificada.
- Teaser, memorando, term sheet e índice da sala de dados são templates canônicos versionados. Os
  artefatos emitidos registram id, versão e hash do registry; templates permanecem `candidate` até
  aprovação de conteúdo e evals.
- O manifesto econômico passa a registrar também compiler, hash do registry de procedimentos e
  hash dos templates. Alteração de conhecimento muda a linhagem da run.
- A case factory ganhou duas variações de expansão: sala adversarial com dívida contraditória,
  garantia sem âncora e prompt injection; e negativa de elegibilidade, em que a limitada mantém a
  necessidade de expansão mas não pode seguir pela rota de debênture. Ambas atravessam o engine
  governado nos evals.
- Decisão registrada no ADR 0013. Nada desta entrega é chamado de produção institucional antes da
  promoção explícita de cada procedimento e template.

## House Playbook completo, catálogo modular e acreditação, 25/08/2026

- O v1 permanece como snapshot histórico. O `HOUSE-PLAYBOOK-COMPLETO-v2.md`, corrigido como
  v2.1 governado, é a fonte editorial canônica: 11 módulos, 270 IDs em sequência, zero
  duplicidade, zero referência interna quebrada, autoridade explícita em todas as entradas e zero
  referência legada `E##`. O SHA-256 esperado fica no código e mudança sem nova versão falha.
- As 270 entradas permanecem `readyToCompile: false`. O catálogo distingue workflow, cálculo,
  método analítico, regra de decisão, lente setorial, referência de mercado, template, mandato,
  distribuição, red flag e conduta. Um heading nunca vira chamada de modelo por conveniência.
- Os 20 procedimentos `candidate` de growth/capex agora carregam lineage explícito para as entradas
  do House Playbook, autoridades, dados versionados e necessidade de revisão jurídica.
- O compiler recusa template, dependência ou reference-data key desconhecido. O primeiro registry
  de dados sensíveis registra owner, fonte, data, validade e status. Parâmetros ainda sem fonte
  aprovada ficam `required_missing` e bloqueiam promoção em vez de receber um número inventado.
- O manifesto v4 registra hash e versão do House Playbook e do reference-data registry, além de
  compiler, procedure registry e templates.
- A carteira de acreditação explicita 14 casos entre `live`, `partial` e `planned`, inclusive sala
  suja, multi-entidade, operação economicamente não suportável, identidade PT/EN e recebíveis. O
  caso de recebíveis declara que FIDC é veículo possível, não sinônimo do ativo ou instrumento.
- O promotion gate é individual e exige versão exata, predecessors em produção, unit, integração,
  gold, adversarial, reference data vigente, QC de template, revisão jurídica quando aplicável e
  revisão independente. Nenhum novo procedimento foi promovido a `production`.
- Diagnóstico técnico, revisão do v2 e plano detalhado por módulo:
  `docs/build/HOUSE_PLAYBOOK_TECHNICAL_AUDIT_2026-08-25.md`,
  `docs/build/HOUSE_PLAYBOOK_V2_REVIEW_2026-08-25.md` e
  `docs/build/HOUSE_PLAYBOOK_MODULE_EXECUTION_PLAN_2026-08-25.md`.

## M0, contrato adaptativo do intake, 25/08/2026

- `packages/credit-playbook/src/intake-state.ts` introduz uma única projeção determinística para
  necessidade de capital, rota provisória, cobertura de informações, roadmap, lote ativo e log de
  decisões. O estado é reconstruído por replay de eventos validados e carrega fingerprint SHA-256.
- O sistema não pode emitir uma solicitação sem documentar os três primeiros degraus da escada
  IN-13: sala classificada, derivação declarada e fonte pública registrada. Evidência encontrada
  satisfaz o requisito sem se passar por resposta da companhia.
- A política do lote precisa carregar versão, fonte, vigência e limite entre um e cinco. Ausência
  declarada é preservada e retirada do lote vigente sem fechar silenciosamente a lacuna.
- Uploads e respostas recalculam cobertura e lote. O teste gold deste incremento prova que quatro
  solicitações ativas desaparecem quando o pacote correspondente é classificado.
- Autorização de assessor, perímetro multi-entidade, urgência, triagem e hipótese de liquidez
  disfarçada entram no mesmo histórico. A hipótese de liquidez exige revisão e não muda sozinha o
  arquétipo declarado.
- Persistência append-only e comandos atômicos já cobrem necessidade, rota, resposta, escada de
  busca, perímetro econômico, sugestão documental de entidade, decisão humana de escopo, ciclo de
  autorização, triagem e documentos. Sessões novas são lidas por replay na checklist; sessões
  legadas mantêm fallback explícito.
- O funil anônimo de M0 mede entrada, operação, pedido, documentos e revisão usando apenas enums e
  bandas de contagem. Autocapture, replay, page leave, persistência, perfil de pessoa e qualquer
  contexto de case permanecem desligados. Abandono é inferido por coorte entre etapas.
- Gold cases específicos de M0 cobrem sala desorganizada, empresa com um único documento, assessor
  com vários clientes isolados, hipótese de liquidez disfarçada, grupo multi-entidade e documento
  que elimina quatro solicitações futuras. A carteira de acreditação tem 18 cenários entre live,
  partial e planned.
- Escopo ainda aberto: piloto com uma empresa ou assessor real e revisão independente da versão
  exata. O módulo M0 e os procedimentos IN permanecem sem promoção institucional.

## M5, estrutura indicativa e compatibilidade, 25/08/2026

- `@offroad/financial-core` calcula cronogramas SAC, Price, bullet e balloon com carência paga ou
  capitalizada, taxa nominal ou efetiva, cobertura por período, folga de covenant e concentração
  de vencimentos usando Decimal.
- `@offroad/deal-structure` produz um `Structure Truth Set` com os 45 estados ES, envelope de
  capacidade, proposta indicativa, cronograma e cobertura, pacote e mecânica de garantias,
  covenants, cláusulas, subordinação, intercreditor, checagens do dia um, ajustes e exceções.
- O menor limite entre fluxo de caixa, garantia e mercado governa o sizing. Matching recebe esse
  montante suportado, não o pedido original quando ele excede o envelope. Fontes e usos abertos,
  downside insuficiente, maturity wall, bullet sem fonte de pagamento, garantia inadequada e
  incompatibilidade no dia um falham de forma explícita.
- ES-01 a ES-45 são candidates derivados da fonte canônica, com reference data versionada,
  execução determinística, zero peer handoff e zero chamada de modelo. Parâmetro ausente não vira
  hipótese silenciosa. O card privado exibe montante, restrição, prazo, amortização, DSCR,
  cobertura de garantias, compatibilidade e pontos abertos em PT-BR e EN-US.
- O output é de assessoria e estruturação indicativa. A Offroad não compromete capital, não emite
  aprovação de crédito e não substitui a diligência do financiador. Promoção institucional exige
  gold cases, adversariais, referências vigentes, revisão econômica independente e revisão legal
  nos procedimentos aplicáveis.

## M4, verdade operacional e fontes e usos, 25/08/2026

- `@offroad/financial-core` passou a calcular de forma determinística necessidade econômica,
  identidade de fontes e usos, posição pró-forma, capital de giro incremental por período, custo
  de excesso de funding e cobertura do cronograma de desembolso. Todas as contas usam Decimal.
- `@offroad/deal-structure` produz um `Operation Truth Set` único com pedido declarado,
  necessidade calculada, linhas por entidade, moeda, data e tranche, fontes condicionais,
  posição pró-forma, cenários, efeitos da operação, tranches, condições precedentes, ponte e
  take-out, cronograma, decisão de esperar, usos mistos e versão material confirmada.
- OP-01 a OP-14 foram compilados como candidates da fonte canônica. O runtime é pipeline
  determinístico, sem peer handoff e sem chamada de modelo. Referências de materialidade,
  buffer, custos, condições precedentes, lag de desembolso, uso geral e decisão de espera ficam
  explicitamente `required_missing` até receberem valor, fonte, data, validade e dono.
- A ontologia ganhou os campos necessários para extração operacional. O case engine inclui M4 na
  etapa de estruturação, o worker persiste os 14 estados e a interface apresenta pedido,
  necessidade, fontes, usos, diferença e dívida líquida pró-forma.
- Casos adversariais bloqueiam sources and uses desenquadrado, mês sem cobertura e ponte sem
  take-out ou plano alternativo. O módulo permanece candidate até reference data vigente,
  revisão independente e promoção do fingerprint exato.

## Agente Offroad, primeira vertical transacional, 26/08/2026

- O workspace passou a exibir uma conversa real e contextual depois da seleção do arquétipo da
  operação. Mensagens entram em fila, o estado de análise é real e a interface atualiza enquanto o
  worker processa, sem simular progresso.
- `@offroad/agent-contracts` limita a primeira vertical aos campos do brief da operação e aos
  respectivos tipos, enums e limites. O modelo pode fazer uma pergunta, responder sem alteração ou
  preparar uma proposta. Ele não grava o case.
- A fila ganhou `agent_operation_brief`. O worker carrega apenas o contexto autorizado, executa uma
  chamada estreita pelo model gateway e exige suporte numérico direto da última declaração. Uma
  declaração da empresa permanece `user_statement`, nunca evidência reconciliada.
- Conversas, mensagens e propostas são segregadas por organização, append-only para o tenant e
  escritas por comandos atômicos. A alteração só chega à projeção pelo comando canônico de M0
  depois de confirmação explícita e desde que fingerprint e `updated_at` continuem atuais.
- O teste remoto integral de RLS prova idempotência, isolamento, preview sem mutação, aplicação
  explícita e falha auxiliar sem contaminar uma sessão de documentos em processamento. O Security
  Advisor de staging permanece com zero findings.

## Navegação reversível e reinício do onboarding, 26/08/2026

- O intake guiado permite voltar de `Pedido` para `Objetivo` e de `Informações` para `Pedido` no
  topo da área de trabalho. Respostas já persistidas permanecem intactas ao navegar.
- A pessoa pode encerrar uma tentativa incompleta e voltar ao `Bem-vindo` por uma confirmação
  explícita. Conta e organização permanecem; a sessão antiga muda para `cancelled`, sem apagar
  documentos ou histórico silenciosamente.
- A função `restart_onboarding_intake` verifica autenticação, tipo e vínculo da organização,
  propriedade da sessão e estado. Sessões `confirmed` ou `processing` falham fechadas.
- O reset afeta apenas o onboarding do autor e preserva somente os dados de registro. A suíte RLS
  cobre idempotência, isolamento entre tenants e proteção de casos confirmados.
- O estado preso de `carlosevg@gmail.com` em produção foi corrigido operacionalmente da mesma
  forma: a tentativa vazia foi cancelada e o onboarding voltou ao início, sem excluir a conta ou a
  organização.

## Recebíveis, especificação canônica e gate da Fase 1, 27/08/2026

- A vertical foi congelada em 39 células sustentáveis, com oito células core e banco mínimo de
  282 casos. Os 20 casos A1 existentes são cobertura adicional.
- Datas de relatório, última originação e intervalo do histórico são conceitos distintos. O
  aging canônico possui sete faixas sem sobreposição e preserva vencimento original e vigente.
- Contratos econômicos, procedência e escopos de elegibilidade foram adicionados ao
  `financial-core`. Decisão rígida não aceita estimativa como evidência.
- `packages/receivables-analysis` foi auditado como protótipo de orquestração. Seus controles são
  aproveitáveis, mas os cálculos locais, cinco faixas de aging, policy defaults sem governança e
  ausência de procedência completa impedem promoção.
- O plano aprovado migra a matemática para `financial-core`, mantém a orquestração no pacote
  vertical e usa o caso Vertentes como gold completo. A vertical continua candidate até cumprir o
  gate documentado em `docs/knowledge/recebiveis/PHASE-1-PLAN.md`.

## Índice governado para tapes operacionais, 28/08/2026

- O quarto run controlado da Vertentes processou 16 de 17 documentos na primeira tentativa. A
  camada determinística do CSV de títulos possui 22,2 MB e aproximadamente 1,5 milhão de tokens;
  sua indexação expôs que o teste anterior com 1.200 conteúdos curtos não reproduzia o custo real
  de `tsvector`, GIN e auditoria.
- `buildCaseChunks` passa a usar o limite governado de 12.000 caracteres. O conteúdo e a âncora são
  preservados, mas tapes extensos exigem aproximadamente metade das linhas de índice.
- `case_retrieval_chunks` deixa de emitir um evento de auditoria por fragmento. Insert, update e
  delete são auditados por lote e documento, com quantidade, sessão, versão e run. A operação
  capability-bound continua atômica, valida hashes, recusa mais de 2.000 chunks e agora possui
  circuit breaker interno de 30 segundos.
- O teste de banco reproduz aproximadamente 5,7 milhões de caracteres com 520 conteúdos variados,
  verifica persistência integral, auditoria única por documento e orçamento de 25 segundos. A
  migration foi aplicada no branch `staging`; Security Advisor continua sem findings.
- O run controlado seguinte em produção é obrigatório antes de declarar a vertical pronta. A
  aprovação local de `pnpm check` e o schema de staging não substituem essa prova.

## Request Router, TaskSpec registry e Case Graph incremental, 29/08/2026

- `@offroad/agent-contracts` possui um Request Router determinístico que separa intenção, escopo
  `knowledge | case | market` e efeito `none | proposal | commit | external`. Pedidos hipotéticos
  não alteram estado; alterações viram proposta; aprovação continua exigindo comando governado;
  contato externo é recusado fora do Market Graph.
- `@offroad/work-plan` contém o registro canônico das 80 TaskSpecs da arquitetura-alvo. IDs,
  dependências, aciclicidade, classe de execução e fronteira de efeitos são validados em teste.
  Todos os nós permanecem `specified` por padrão. Presença no registry não significa executor,
  interface, E2E ou produção.
- `@offroad/case-runner` v4 deixou de ser um loop serial. Os 11 estágios atualmente consumidos em
  produção formam um DAG real, com descendentes bloqueados por dependência, ramificações
  determinísticas paralelas e no máximo uma tarefa com modelo por lote para proteger orçamento.
- Cada TaskRun registra TaskSpec, dependências e fingerprints, input, output, ferramentas
  permitidas e usadas, fontes, tentativas, término, duração, custo e cache hit. Ferramenta fora do
  contrato ou chamada de modelo numa tarefa determinística falha no schema.
- O cache incremental é isolado por caso e inclui versão da TaskSpec, case engine, pipeline,
  política de modelos e prompts. Mudança no pedido invalida somente a estrutura e seus
  descendentes no teste; extração e análise não afetadas são reutilizadas.
- O relatório anterior é carregado pelo worker somente depois do congelamento do input. A
  migration `20260829184738_task_dag_prior_report.sql` cria a leitura capability-bound do último
  run primário bem-sucedido sem expor o relatório ao navegador. Staging aceitou a migration;
  função privada, wrapper público, grants e índice foram verificados, `anon` não executa e o
  Security Advisor ficou com zero findings. A prova funcional integral ainda depende do job
  `database`; produção não foi alterada nesta mudança.
- `pnpm check` completo com Node 24.19.0 passou nos 42 pacotes. Nenhuma API paga foi chamada.

## Deal Structuring e Materials Preparation como sub-DAGs, 29/08/2026

- ADR 0016 fixa a fronteira: o DAG governa dependências, contratos, invalidação, custo e gates;
  inteligência de modelo pode existir somente dentro de tarefas estreitas. Matemática, filtros e
  consistency gates permanecem determinísticos.
- `@offroad/case-runner` v5 contém um executor de subgrafo acíclico. Ramos determinísticos prontos
  executam em paralelo e trabalho com modelo permanece serializado. Cada subtask registra versão,
  dependências e fingerprints, ferramentas, fontes, duração, custo, status e código de falha.
- O antigo monólito `structureCase` foi aberto em 11 tarefas reais: capacidade, perfil do emissor,
  cenários, screening de instrumentos, garantias, diagnóstico da operação, verdade operacional,
  termos indicativos, verdade estrutural, pricing e assemble.
- A preparação de materiais foi aberta em sete tarefas: inputs, compilação, organização da sala,
  claim registry, gate de publicação, verdade dos materiais e assemble.
- As 23 TaskSpecs alvo `S01-S12` e `A01-A11` continuam `specified`. O sub-DAG torna o trabalho
  atual auditável, mas não inventa alternativas comparáveis, modelo financeiro final, renderização
  ou inspeção visual que ainda não existem em padrão institucional.
- O refactor preserva os outputs econômicos e usa zero chamadas de modelo. `pnpm check` passou nos
  42 pacotes: lint, typecheck, todos os testes e build. `case-runner` ficou com 12 testes e
  `case-engine` com 30; nenhuma API paga foi chamada.

## Pesquisa oficial BR/US e planejamento de capital, candidate, 02/09/2026

- A pesquisa pública passou a começar por fonte primária oficial. No Brasil, o provider resolve a
  companhia na CVM e lê as últimas DFP/ITR consolidadas diretamente dos ZIPs regulatórios; nos EUA,
  resolve CIK e consulta submissions/companyfacts da SEC. Homônimo ou identidade ambígua encerra
  sem escolha silenciosa. Perplexity e OpenAI Search permanecem complementares e desativáveis.
- O cache global continua exclusivo para matéria-prima pública. Projeto privado nunca publica
  query, snippet ou resultado no cache compartilhado. Uma revisão reutiliza somente fontes e
  artefatos já governados no mesmo projeto; não repete pesquisa e reserva custo externo zero.
- `capital_planning` é o terceiro DAG público executável. O plano congelado contém 35 TaskSpecs
  `M01-S11`; 34 resultados intermediários explicitam método, evidência ou impossibilidade de
  cálculo e `S11` produz um `alternative_map` corrigível. Há uma única síntese de modelo.
- O mapa compara pelo menos duas famílias entre banco bilateral, club/sindicado, mercado de
  capitais, securitização, crédito privado, recebíveis, asset-backed, project/acquisition finance,
  comércio exterior/agro, capital flexível e situações especiais. Nenhuma família é forçada.
- Em base pública, volume, pricing, prazo, amortização, covenant, advance rate, garantia e
  capacidade permanecem ausentes por contrato. A saída contém vantagens, trade-offs,
  pré-requisitos, disconfirmers, comparação e no máximo cinco pedidos de informação com impacto.
- Chat, plano, execução, artefato e retorno ao projeto usam RPCs v2 capability-bound. A interface
  agora renderiza o mapa, fontes, progresso das 35 tarefas e decisão. Correção invalida somente
  `S11`, reaproveita `C11` e `S10` e não executa nova pesquisa.
- Testes locais do worker, contratos, gateway, pesquisa pública, lint e tipagem passaram sem API
  paga. A migration foi escrita, mas Docker não está disponível neste host; banco reconstruído,
  teste SQL integral, Security Advisor, gold case e inspeção visual ainda bloqueiam promoção.

## Advisor universal e fluxo privado, produção técnica, 02/09/2026

O estado `candidate` acima foi superado pela PR #346. A fundação universal e o fluxo privado
agora compartilham uma única memória de projeto, um runtime governado e a mesma sequência de
decisão: entendimento preliminar, confirmação, pedido de evidência, conciliação, diagnóstico,
alternativas indicativas, aprovação da estrutura, plano de produção, materiais, matching,
shortlist e autorização exata de introdução.

As seis migrations pendentes foram aplicadas no Supabase de produção depois de o CI reconstruir
todo o histórico e aprovar RLS, controles fail-closed e E2E. Vercel e o worker ECS concluíram o
rollout do commit `3725a542`. Os novos ledgers e o cache público estavam vazios após a promoção;
nenhum caso artificial nem chamada paga foi usado para fabricar evidência de prontidão.

O produto está tecnicamente disponível para teste humano controlado. Isso não equivale a padrão
institucional comprovado para cada output: qualidade financeira, editorial, matching real e custo
devem ser promovidos individualmente por gold case. Nenhuma introdução é automática e
underwriting, diligência, decisão de crédito e fechamento continuam fora da execução Offroad.

## Deal Captain limitado e remediação da auditoria, 02/09/2026

- A auditoria independente do commit `4251614` foi revalidada contra a árvore corrente e recebeu
  disposição item a item em `AUDIT_DISPOSITION_2026-09-02.md`.
- O gateway preserva `null` semântico obrigatório e remove apenas o `null` artificial de campo
  opcional exigido pelo strict schema da OpenAI. Os testes incluem abstenção e fallback.
- O roteamento privado não desliga mais o pipeline quando há documento. As seis entradas podem
  continuar para o Case Graph privado sem exigir redigitação do conteúdo anexado.
- O Deal Captain projeta o plano TaskSpec imutável para um plano de trabalho tipado com
  especialistas, dependências, orçamento, efeito, cobertura, perguntas e decisões. O banco rejeita
  tarefa inventada ou dependência fora do plano.
- O worker grava o plano com capability temporária antes dos DAGs públicos e das análises privadas
  preliminar e completa. A mesma projeção limitada do plano nasce mesmo quando a primeira resposta
  do usuário é uma pasta de documentos. As tabelas novas são tenant-scoped, RLS/FORCE e read-only
  para o browser; efeitos externos exigem aprovação.
- `Não aprovo` e `Não envie` são interceptados antes das regras de commit e ação externa.
- O CI executa todos os testes SQL automaticamente. Actions foram fixadas por SHA e um workflow de
  segurança adiciona CodeQL, dependency review, Trivy e SBOM.
- Testes locais: `@offroad/agent-contracts` 33/33; `@offroad/document-worker` 106/106. O gate
  integral forçado aprovou lint, typecheck, testes e build nos 42 pacotes com Node 24.19.0.
- Este estado intermediário foi superado em 03/09: o histórico canônico foi reconciliado, oito
  migrations foram aplicadas e testadas em produção e o ledger local passou a espelhar exatamente
  as 164 versões remotas.

## Motor de profundidade combinável, candidate, 03/09/2026

- As seis entradas foram reclassificadas como atalhos de intenção, não jornadas exaustivas. O
  runtime pode abrir jobs e branches adicionais dentro do mesmo projeto e da mesma Company Truth.
- A ontologia separa situação econômica, objetivo de capital, uso dos recursos, fonte de pagamento,
  família de capital e alocação de risco. Vencimentos, liquidez preventiva, liability management,
  alongamento, repricing, garantias, diversificação e substituição de dívida agora são estados e
  objetivos explícitos, não texto livre absorvido por um instrumento.
- Funções profissionais incluem analista de crédito, underwriting, risco, syndicate, structured e
  project finance, FP&A, controladoria, jurídico e comitê de investimento. O onboarding PT-BR/EN-US
  e a migration correspondente preservam essas funções sem reduzi-las a “analista”.
- `@offroad/agent-contracts` implementa manifestos e compilação de depth packs por núcleo, situação,
  objetivo, instrumento, setor, domínio de análise, função, jurisdição e execução. Dependência
  ausente, incompatibilidade ou definição conflitante falha fechado; sobreposição válida preserva
  linhagem e maior materialidade.
- O coverage map inicia toda dimensão esperada como `not_examined`, exige evidência para `covered`,
  preserva insuficiência, conflito, inaplicabilidade e adiamento, e bloqueia readiness quando uma
  dimensão bloqueadora permanece aberta.
- Promoção de pack exige gold cases, caso adversarial, benchmark contra o melhor modelo generalista
  e revisão especialista. O teste de sobrevivência também exige impacto decisório sustentado; texto
  bem escrito ou outcome estimado não bastam.
- Contratos e testes unitários passaram. O CI obrigatório do PR #378 reconstruiu o banco do zero,
  aplicou todas as migrations, executou a suíte de RLS, lint do schema e E2E sem falhas. A migration
  canônica `20260903182045_expand_professional_functions.sql` foi promovida ao único Supabase de
  produção após esses gates.
- Os advisors posteriores à promoção não atribuíram alerta novo à migration. Permanecem dois avisos
  informativos já conhecidos para tabelas estritamente `private`, sem políticas de acesso cliente,
  além de índices recentes ainda classificados como não utilizados. Nenhum deles justifica remover
  isolamento ou índices de integridade antes de haver janela representativa de uso.
- Os packs econômicos ainda não estão acreditados. A infraestrutura impede que esse estado seja
  chamado de profundidade de produção; implementação, benchmark e revisão dos packs Pareto seguem
  obrigatórios antes da promoção de cada escopo.

## Packs econômicos Pareto integrados ao Deal Captain, implemented, 03/09/2026

- O playbook contém 17 packs combináveis: núcleo; quatro objetivos econômicos; collateral,
  covenants e downside; Brasil e Estados Unidos; três famílias instrumentais Brasil e quatro
  famílias instrumentais Estados Unidos.
- Cada pack declara coverage esperado, evidência aceitável, materialidade, impacto decisório,
  procedimentos, cálculos determinísticos, termos, critérios de mercado, disconfirmers e gates.
- Um catálogo separado reconhece 33 necessidades econômicas. Situação sem pack retorna como gap
  conhecido, nunca como falsa completude.
- `financial-core` expõe 38 IDs estáveis de cálculo e o registry institucional expõe os IDs de
  procedimento da casa. O auditor de packs falha se qualquer referência ou dependência não existir.
- `@offroad/dcm-specialization` compõe os manifestos sem criar uma solução por combinação. Um case
  como refinance + Brasil + debênture + covenant + downside preserva linhagem de cada pack.
- O Deal Captain infere somente sinais explícitos em PT-BR/EN-US, incorpora o perfil compilado no
  snapshot imutável do plano e distribui requirements pelos TaskSpecs analíticos existentes. O
  snapshot e a coverage já usam a persistência capability-bound do projeto.
- O gate de promoção por pack exige testes unitários e de integração, dois gold cases, um caso
  adversarial, identidade econômica bilíngue, ganho material sobre generalista e revisão
  independente; packs jurídicos ainda exigem revisão legal. Todos permanecem `implemented` e não
  podem ser anunciados como expertise de produção.

## Motor financeiro institucional, implemented, 03/09/2026

- O novo engine integra DRE, balanço, fluxo de caixa, capital de giro, PP&E, imposto, dívida,
  liquidez, covenants e patrimônio período a período; balanço de abertura, ledger de dívida e cada
  período projetado precisam fechar.
- Receita aceita composição por segmento, volume, preço, mix, câmbio e efeito inorgânico. Custos,
  capital de giro, capex de manutenção e crescimento, depreciação por safra e imposto caixa usam
  drivers governados, não defaults escondidos.
- O livro de premissas registra fonte, data-base, localização, racional, metodologia, confiança,
  limites, editabilidade e impacto. Toda alteração cria um novo cenário imutável.
- Curvas de IPCA, CDI, prefixado, Selic, SOFR, Treasury e câmbio têm fonte, data-base, nós,
  interpolação, extrapolação, lag, piso e teto explícitos.
- Dívida IPCA+ separa correção paga em caixa de correção capitalizada no principal. Cupom pago e
  PIK também são independentes. Serviço da dívida, despesa financeira e saldo devedor não são
  inferidos de uma taxa agregada.
- O reviewer independente bloqueia falta de conciliação, premissa sem suporte, cenário misturado,
  indexação ambígua e dívida negativa; expõe caixa insuficiente, covenant breach e coverage gaps.
- O pack setorial inicial de alimentos e consumo essencial está `implemented`, não homologado. O
  engine não se autopromove a expert e ainda precisa passar por gold cases, adversarial cases,
  benchmark e revisão humana nominal.

## Entrada conversacional simplificada, candidate, 04/09/2026

- A entrada autenticada passou a priorizar uma única ação: descrever o trabalho ou anexar os
  documentos disponíveis. Os atalhos de intenção foram movidos para baixo do composer e continuam
  sendo sugestões opcionais, nunca etapas obrigatórias.
- A saudação usa somente o primeiro nome salvo no perfil do próprio usuário. Na ausência desse
  dado, a interface usa uma saudação neutra e não infere identidade.
- O farol da marca substitui o rótulo interno `OFFROAD ADVISOR`; título e hierarquia visual foram
  reduzidos para aproximar a entrada do workspace conversacional já definido na Constituição.
- Exemplos PT-BR/EN-US alternam no campo apenas enquanto ele está vazio, não há um atalho escolhido
  e o usuário não solicitou redução de movimento. Criação, upload, confidencialidade e vínculo ao
  projeto permanecem inalterados.
