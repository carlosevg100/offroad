# Pre-mortem · matriz de controle operacional

Atualizado em: 2026-09-01

## Regra de leitura

`Implementado` significa contrato executável e teste automatizado no candidato. `Disponível para
ativação` significa que o caminho existe, mas depende de dado ou decisão externa. `Pendente` não
pode ser apresentado como proteção existente. Nenhum item desta matriz autoriza produção.

| Modo de falha | Classe | Controle fail-closed | Implementação / evidência | Estado | Dependência para operação real |
|---|---|---|---|---|---|
| recomendação sem compreender o mandato | explosiva/lenta | objetivo e contexto da decisão obrigatórios antes de uso | compilador do worker + snapshot imutável capability-bound | Implementado no candidato | acreditar o escopo somente após os casos exigidos |
| claim material sem suporte correto | explosiva | 100% dos claims materiais com fonte, entidade, período e validade | Claim Registry compilado no snapshot + avaliação independente no banco | Implementado no candidato | fechar evals de entidade/período por vertical |
| cálculo crítico delegado ao LLM | explosiva | total crítico = total determinístico = total conciliado; zero exceção aberta | math core + compilador do worker + gate SQL | Implementado no candidato | catalogar formalmente todos os cálculos críticos por vertical |
| cobertura aparente, mas incompleta | explosiva | mapa de cobertura; gap material exige razão e próxima ação | readiness/gaps compilados e persistidos | Implementado no candidato | refinar requirements de cada depth pack |
| opinião prematura apresentada como decisão | explosiva | estágio de julgamento, alternativas, downside e incerteza | decisão de estrutura + snapshot + gate SQL | Implementado no candidato | revisão institucional e promoção do escopo |
| teaser, modelo e term sheet divergentes | explosiva | artefatos íntegros, atuais, consistentes e aprovados | operating controls + manifests existentes | Implementado | conectar o gate aos compiladores finais de cada material |
| matching bonito, mas inexequível | explosiva/lenta | mandato atual e fit explicável antes de ação externa | operating controls + Market Graph | Implementado | base real de mandatos, owners e política de refresh |
| contato ou envio sem poder | explosiva | autoridade exata para versão e destinatários | operating controls + autorização de Introduce existente | Implementado | nenhuma; permanece bloqueado até autorização do case |
| evidência nova não atualiza downstream | explosiva | invalidação transitiva de source a approval/match | triggers de source, input e Deal State + ledger imutável | Implementado no candidato | validar reconstrução limpa e monitorar latência de invalidação |
| vazamento entre clientes | explosiva | RLS/FORCE RLS, retrieval capability-bound, logs sem conteúdo | testes SQL existentes + governed retrieval | Implementado no runtime atual | revisão externa, DLP e teste contínuo em produção |
| provider/fallback recebe dado fora do contrato | explosiva | classe/finalidade por chamada e assurance vigente por candidato | model gateway data policy | Disponível para ativação | DPA/ZDR/base legal e JSON de assurance de cada provider |
| conhecimento ou depth pack apodrece | explosiva/lenta | owner, validade, procedimento, gold/adversarial e acreditação por escopo | registry privado append-only com validade | Implementado no candidato | calendário de refresh e corpus revisado |
| sistema se proclama expert cedo demais | explosiva/falsa vitória | cinco níveis de maturidade; produção só com vinte casos reais distintos | capability accreditation + rollout | Implementado | executar e revisar os casos reais; nenhum existe por decreto |
| founder/analista corrige tudo escondido | falsa vitória | minutos, causa, captura, revisão e recorrência por caso | ledger privado append-only + invalidação de mudança canônica | Implementado no candidato | instrumentar todas as superfícies manuais e painel operacional |
| custo explode sem valor | lenta/falsa vitória | preflight worst-case, teto de calls/custo e controle por case | model gateway + operating controls | Implementado | unit economics por job e thresholds aprovados |
| feedback ensina a causa errada | lenta | decisão e outcome tipados e ligados; ausência gera warning | operating controls + outcome taxonomy existente | Implementado como gate | atribuição persistida e revisão de causalidade |
| rollout por demo sintética | falsa vitória | duas ondas disjuntas de dez casos reais + control plane aprovado | `decidePromotion` | Implementado | cohorts reais e aprovação formal |

## Controles sistêmicos construídos neste slice

1. `decideCapabilityAccreditation`: impede declaração ampla de expertise sem evidência por escopo.
2. `evaluateOperatingControls`: separa análise preliminar, decisão interna, material externo e ação.
3. `invalidateDependencyGraph`: torna stale toda a cadeia dependente, inclusive aceite e matching.
4. `summarizeHumanIntervention`: mede a parte manual e identifica a falsa automação.
5. `evaluateProviderDataPolicy`: valida todo primário/fallback antes do envio.
6. `decidePromotion`: `active` agora requer evidência técnica, aceite externo e control plane.
7. Banco: snapshots e invalidações são append-only; material externo e introdução falham fechados
   sem prova atual, acreditação de produção e bindings exatos.

## O que deliberadamente ainda não foi alegado

- Não há DPA/ZDR/base legal registrados para os provedores neste repositório; enforcement do
  worker permanece desligado até esse dado existir.
- Não há SSO corporativo, MFA obrigatório, SCIM, DLP completo, pentest externo ou exercício de
  disaster recovery comprovado por esta entrega.
- A persistência existe apenas neste candidato; não foi aplicada a staging ou produção e ainda
  precisa passar a reconstrução limpa do banco em CI.
- Os knowledge packs BR/US, todos os instrumentos, todos os setores e os compiladores de material
  não estão automaticamente acreditados. Cada combinação precisa de procedimento, evidência,
  evals e promoção próprios.
- Nenhum case real foi contado e nenhuma chamada de modelo ou pesquisa foi feita nesta validação.

## Ordem de ativação

1. cadastrar assurance real dos providers e ativar primeiro em staging;
2. persistir snapshots, invalidações e intervenção humana num ledger sem escrita pelo tenant;
3. conectar gates aos compiladores de claims, materiais e matching;
4. rodar gold e adversarial por depth pack;
5. acompanhar wave 1 (10 casos reais), corrigir e congelar;
6. acompanhar wave 2 (10 casos reais disjuntos);
7. somente então considerar `active`, preservando autorização caso a caso.
