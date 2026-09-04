# Revisão do Atlas e da arquitetura técnica

Data: 4 de setembro de 2026
Base: `main` em `d38c5dc` e o projeto Supabase de produção, medidos hoje. Nada abaixo foi tirado de um documento de intenção; onde um número aparece, ele foi contado.
Objeto: `docs/product/CANONICAL_INTENT_WORKFLOW_ATLAS.md` v0.9 e ADR 0021, mais as perguntas de arquitetura do fundador.

## Resumo

1. **O Atlas acerta a tese e erra a forma em três lugares.** A regra central (persona define cobertura, intenção define trabalho, contexto define execução, evidência define até onde afirmar, audiência define apresentação, autorização define efeitos) é correta e é a que a Constituição já enunciava. Os erros: as vinte famílias misturam três coisas que o próprio Intent Envelope já separa (que trabalho, para quem e em que forma, com que efeito); os objetos recebem um parágrafo cada enquanto os workflows recebem trinta linhas, invertendo onde mora o risco de engenharia; e o documento desenha uma ontologia inteira antes de um único caso estar provado ponta a ponta.
2. **A fundação técnica está certa e não deve ser trocada.** Postgres com RLS como fonte de verdade, control plane determinístico, TaskSpecs como allowlist, âncoras de evidência verificadas por código, gateway com política de dados dos provedores e verificação em provedor diferente. Boa parte do que o fundador pergunta se "precisamos de" já existe como tabela ou pacote: premissa governada, fato com classe de informação, grafo de invalidação, manifesto de contexto por tarefa, orçamento por run, snapshot de controle. O trabalho é generalizar cinco coisas, não substituir nada.
3. **Não precisamos de lakehouse, banco de grafo, banco vetorial externo nem framework de agentes.** O banco tem 132 MB. O vetor já está instalado dentro do Postgres e, por isso, dentro da fronteira de RLS. Mover retrieval para fora do banco moveria a autorização para código de aplicação, o que contraria o invariante mais importante do sistema.
4. **O gargalo hoje é confiabilidade e profundidade provada do trilho que existe, não largura de intenções.** Em produção: 54 runs em sete dias, 20 falhas; p95 de 22 minutos; 36 jobs falhos sem motivo registrado na linha do job; 45 de 61 requisitos de cobertura em `missing`; 0 correções capturadas; 0 perfis profissionais preenchidos até ontem. Nenhum desses números melhora com mais famílias no Atlas.
5. **Plano em quatro fases com gates**, começando pela confiabilidade do que existe e por cinco casos gold que o trilho atual consegue rodar, e só depois o roteador por intenção em modo sombra.

## 1. O que foi medido

| Dimensão | Medida em 4 de setembro de 2026 |
| --- | --- |
| Código | 41 pacotes, 2 apps, 206 arquivos de teste, 21 ADRs |
| TaskSpecs | 80 em 8 grafos (A 11, C 11, D 11, K 10, L 6, M 7, S 12, X 12) |
| Playbook | 17 arquivos de procedimento; auditoria de 29/08: 270 entradas, 224 procedimentos compilados, 0 em `production` |
| Depth packs | 17 ids no registro; maturidade declarada: 3 `implemented`, 1 `specified` |
| Gateway de modelos | 16 tipos de tarefa com primário, sombra, fallback e escalada; política de dados fail-closed; Haiku, mini e nano negados; Sonnet 5, Opus 5, GPT-5.6 Terra e Sol |
| Retrieval | 4 fontes governadas (ADR 0010); chunks de case só lexicais, `to_tsvector('simple')`; pgvector 0.8.2 instalado; embeddings só para notas de mandato, com 0 linhas |
| Banco | 114 tabelas em `public` e `private`, 58 de `public` vazias; 132 MB |
| Runs | 54 entre 28/08 e 04/09: 29 sucesso, 20 falha, 3 parcial, 2 cancelada; p50 42 s; p95 1.321 s; US$ 30,67 em 500 chamadas de modelo |
| Jobs | 164: 100 sucesso, 36 falha, 28 cancelada; os 36 falhos têm `result` nulo, o motivo só existe na run |
| Motivos de falha (runs) | `agent_processing_failed` 6, `all_attempts_failed` 5, `invalid_case_input` 3, `budget_exceeded` 2, gate M07 1, outros 3 |
| Task runs | 126: 119 sucesso, 6 falha (todas `quality_gate_m07_failed`), 1 invalidada; 100% com `context_manifest` |
| Cobertura | 61 requisitos registrados: 12 `verified`, 4 `partial`, 45 `missing` |
| Linhagem | 120 artefatos com `input_fingerprint`, `artifact_fingerprint`, `evidence_refs`, `dependencies`, `superseded_at`; 28 eventos de invalidação |
| Conhecimento | 296 chunks de case; 8 chunks de playbook; 602 fontes públicas em 22 runs de pesquisa; 0 linhas em `extraction_feedback` |
| Fontes registradas | CVM Dados Abertos, B3, ANBIMA Data (manual, complementar), ANBIMA Feed (não contratado), SEC EDGAR |
| Worker | ECS Fargate, polling em `worker_claim_job`, capability token por job, sem broker de fila |
| Parsers | PDF, XLSX e XLS legado, CSV, DOCX, PPTX, ZIP de NF-e, OCR por Tesseract |

## 2. O Atlas

### 2.1 Veredito

O Atlas é a melhor descrição funcional que o projeto já produziu. Ele corrige três defeitos reais do modelo de seis entradas: a companhia como raiz obrigatória, a profundidade escolhida por cargo e a esteira que só termina em operação. O envelope com estado por campo (`explicit`, `inferred`, `ambiguous`...), a cobertura com `not_examined` explícito, os gates proporcionais ao trabalho e o teste de sobrevivência contra o generalista são as decisões certas.

Ele não está pronto para governar implementação, e o próprio §19 admite dez decisões em aberto. As seções abaixo dizem o que mudar.

### 2.2 Pergunta 1: a arquitetura funcional representa o produto?

Sim na tese, não na proporção. O produto que a Constituição descreve tem um núcleo econômico feito de **objetos** (companhia, instrumento, fato conciliado, premissa, cálculo, estrutura, decisão) e uma superfície feita de **trabalhos** sobre esses objetos. O Atlas dedica a §4 aos objetos, um parágrafo cada, e a §7 aos trabalhos, trinta linhas cada. A dificuldade de engenharia, e o alpha contra um modelo generalista, moram nos objetos: conciliar dívida por instrumento com IPCA capitalizado versus pago, distinguir caixa elegível, manter a definição de EBITDA de covenant separada da reportada, propagar uma premissa até o material. "Preparar reunião" é composição sobre isso.

A consequência prática: o Atlas deveria referenciar as tabelas e pacotes que já existem em vez de descrever objetos como se partisse do zero. Hoje já existem `evidence_facts`, `claim_decisions`, `scenario_versions`, `structure_scenarios`, `output_versions`, `operating_control_snapshots`, `dependency_invalidation_events`, `capital_project_information_requests`, `authority_evidence`, `precedent_authorizations`, e nos pacotes `GovernedAssumption` (com fonte, data-base, racional, metodologia, limites e impactos) e o fato conciliado (com classe de informação, confiança, âncora verificada e disputa). O que falta não é definir esses objetos; é unificá-los sob um único modelo de linhagem e nomeá-los no Atlas.

### 2.3 Pergunta 2: o que ainda não está contemplado

**Objetos que precisam subir a primeira classe**

| Objeto | Estado hoje | O que falta |
| --- | --- | --- |
| Premissa | `GovernedAssumption` no pacote `financial-model` | persistir como objeto de banco com aresta de linhagem, para propagar até estrutura, material e recomendação |
| Cálculo | trace no `financial-core` | persistir o trace como objeto citável; hoje o número chega ao texto sem id |
| Claim | `evidence_facts` mais `claim_decisions` | um contrato único de claim com `as_of`, `observed_at`, `supersedes` e conflito como linha |
| Pergunta | `capital_project_information_requests` | ranqueada por impacto na decisão, com histórico para nunca perguntar duas vezes |
| Autorização | `authority_evidence`, `precedent_authorizations`, planos exatos de introdução | já correta; o Atlas deve citá-la em vez de reinventar |
| Snapshot econômico | `operating_control_snapshots`, `output_versions` | o mesmo snapshot alimentando verificador e compilador de output, como o §17.9 pede |
| Regime regulatório e tributário | só a palavra "impostos" e o eixo "jurisdição" | pack com parâmetros: debênture incentivada (Lei 12.431), CRI e CRA e a isenção para pessoa física, FIDC sob a Resolução CVM 175, oferta sob a Resolução CVM 160, empréstimo 4131 e IOF, retenção sobre juros offshore, CR da Lei 14.430. No Brasil isso muda custo, universo de investidor e prazo; sem isso a comparação de alternativas está errada |
| Hedge e derivativo | ausente | swap CDI para IPCA, dólar para CDI, hedge accounting, custo all-in com hedge; inseparável da estrutura para emissor com dívida em dólar ou IPCA |
| Rating | só como filtro de matching | implicação de rating de uma estrutura como chave de cobertura em estratégia de capital |
| Relacionamento e exposição | ausente | para quem está do lado de um banco: exposição atual, limites, carteira. Alimenta "caminho de execução" e nunca pode ser inferido do perfil |
| Processo competitivo | objeto "Processo" existe, workflow não | comparar propostas recebidas lado a lado, rodadas de perguntas, quadro de bids |

**Situações a declarar dentro ou fora**

- Reestruturação, recuperação judicial ou extrajudicial, standstill, DIP: o Atlas cita "reestruturação, stress, special situations" dentro da I07. É um regime diferente, com objetos próprios (classes de credores, plano). Recomendação: fora do escopo de produção até existir pack próprio, dito explicitamente.
- Execução de mercado (book-building, price talk, alocação): a Offroad não executa. Deve constar como fronteira, não como dimensão de especialização.
- Opinião jurídica: já é fronteira. Manter.

**Usuários**: mesa de sindicato e vendas, agente fiduciário, servicer, auditor. Nenhum precisa entrar; todos precisam ser nomeados como fora, para o roteador não os confundir com uma função interna.

### 2.4 Pergunta 3: a separação entre intenção, contexto, função, especialização e workflow

Está certa em dois pontos e errada em quatro.

Certa: `work_responsibility` pertence ao projeto ou ao turno, não ao cadastro. Perfil é orientação, não limite. Isso é exatamente o contrato de consumo que registramos em `docs/product/PROFESSIONAL_CONTEXT_CONSUMPTION.md`.

Erros:

1. **A §9.15 contradiz a §9.16.** "Para o MD, primeiro entrega decisão; para o Analyst, primeiro entrega tarefas de produção" é comportamento dirigido por cargo entrando pela porta dos fundos. A §9.16 diz o oposto, e está certa. Corrigir a §9.15 para falar em termos do envelope: `work_responsibility = decision_maker` recebe decisão primeiro; `producer` recebe tarefas primeiro. O cargo não aparece.
2. **"Contexto" é três coisas com confiança diferente.** Evidência (claims com âncora), memória de trabalho (decisões, premissas, estado do plano) e orientação (perfil e playbook). Só a primeira sustenta afirmação material. O Atlas usa a palavra para as três.
3. **Especialização sem regra de precedência.** Quando um pack de project finance e um de recebíveis definem DSCR de forma diferente, quem vence? A regra tem de ser: fórmulas vivem no `financial-core` com teste; packs contribuem parâmetros, defaults, checks e chaves de cobertura, nunca fórmulas; o pack mais específico sobrescreve parâmetro, e cada parâmetro carrega o id e a versão do pack no trace. Sem isso nascem as "centenas de soluções isoladas" que o fundador teme.
4. **Dois campos do envelope nunca podem ser inferidos.** `authority` e `evidence_regime` são fatos do control plane (base de acesso do projeto, aceite, autorização exata). O §3 diz que qualquer campo pode ser inferido. Esses dois só admitem `explicit` ou `reused_confirmed`.

### 2.5 Pergunta 4: onde está genérico, superficial, redundante ou complexo

**Redundante: vinte famílias são nove trabalhos mais quatro eixos.** Várias "famílias" são valores de eixos que o envelope já tem:

| Família no Atlas | O que é de fato |
| --- | --- |
| I04 pergunta pontual | eixo `depth = pontual` sobre qualquer trabalho |
| I11 reunião, I12 materiais, I14 comitê | eixo audiência e forma de saída (briefing, material, memo de decisão) |
| I13 revisão | `work_responsibility = reviewer` sobre qualquer trabalho |
| I15 oportunidade recebida | análise de crédito com `evidence_regime = recebido` e `responsibility = recipient` |
| I18 conexão | eixo `effect = external` do matching |
| I19 monitoramento | eixo `continuity = monitor` com agenda, sobre levantar, conciliar, perguntar ou ler contrato |
| I20 gestão do trabalho | função do workspace, não intenção a rotear |
| I07, I08, I09 | três estágios de uma decisão só, sobre os mesmos objetos (necessidade, capacidade, alternativas, estrutura) |

Proposta de taxonomia para o roteador, nove trabalhos:

1. Levantar e organizar informação (I01)
2. Extrair e conciliar (I02)
3. Compreender companhia, setor ou ativo (I03)
4. Analisar desempenho e crédito (I05 e I15)
5. Modelar (I06)
6. Estratégia de capital: diagnosticar, comparar, desenhar (I07, I08, I09)
7. Ler documento, contrato, covenant, waterfall (I10)
8. Mercado e precedentes (I16)
9. Capital aderente e conexão (I17 e I18)

E os eixos, que já estão no envelope: profundidade (pontual, preliminar, institucional), audiência e forma (chat, artefato, material), responsabilidade (produzir, revisar, decidir), continuidade (única, atualização, monitorar), efeito (nenhum, propor, gravar, externo). Um roteador que escolhe entre 9 rótulos com pouca sobreposição e preenche 5 eixos é mais confiável, mais testável e mais barato do que um que escolhe entre 20 rótulos sobrepostos.

**Genérico: "trabalho necessário" lê como sumário de manual.** "Analisar receita, margem, EBITDA, caixa" não diz o que é difícil nem o que é verificado. Cada família deve nomear as três a cinco coisas em que um modelo generalista erra e o check determinístico correspondente. É isso que define alpha. Exemplo para conciliação: IPCA capitalizado no principal versus pago em caixa; perímetro de consolidação e eliminações; caixa restrito e aplicações que não são caixa; arrendamentos IFRS 16 dentro ou fora da dívida; EBITDA de covenant versus reportado. O §I06 já faz isso em parte; a regra tem de valer para todas.

**Superficial: mercado sem estratégia de fonte.** A I16 não cita fonte alguma. No Brasil, a vantagem real é ingestão governada de CVM (ITR, DFP, FRE), B3, SND, debêntures e ANBIMA Data com licença por fonte e freshness por dado. A decisão sobre o ANBIMA Feed já existe (não contratar agora). O registro de fontes é um ativo do produto e deve ser objeto no Atlas.

**Complexo demais para o que está provado.** 18 campos com 6 estados, 13 dimensões de especialização, 9 gates, 6 estados de cobertura e 20 casos Pareto, com 54 runs em produção e 3 ids de caso no harness. Reduzir o alvo do roteador a 8 campos que ele consegue inferir com confiança (`action`, `object`, `desired_outcome`, `decision`, `audience`, `depth`, `continuity`, mais `work_responsibility`) e tratar os demais como anotações opcionais preenchidas depois. `urgency`, `language`, `jurisdiction` e `freshness` são deriváveis e não devem estar no alvo de classificação.

**Falta um critério de tempo.** Uma pergunta pontual respondida em 90 segundos por um DAG é uma falha mesmo quando está certa. O p95 hoje é 22 minutos. Latência por nível de profundidade tem de ser critério de aceite por família, ao lado de exatidão.

### 2.6 Pergunta 5: o que muda antes de virar arquitetura de produção

1. Dividir o Atlas em três documentos: ontologia (objetos e schemas, versionados, referenciando as tabelas que existem), trabalhos (nove famílias, cada uma com o que o generalista erra e os checks) e política de apresentação e efeitos (eixos, gates, formas de saída).
2. Reduzir o envelope do roteador a oito campos; `authority` e `evidence_regime` nunca inferidos.
3. Promover Premissa, Cálculo, Claim, Pergunta e Snapshot a objetos de banco com linhagem.
4. Regime regulatório e tributário, hedge e rating como packs de parâmetros consumidos pela família de estratégia de capital.
5. Regra de composição de packs: fórmula canônica, parâmetro por pack, precedência do mais específico, id e versão no trace.
6. Cortar os 20 casos Pareto para 5 que o trilho atual roda hoje, e provar esses com latência e alpha medidos antes de ampliar.
7. Definir o teste de sobrevivência em números (seção 4.8).
8. Corrigir a §9.15 e nomear as fronteiras (reestruturação, execução de mercado, opinião jurídica).

## 3. Arquitetura técnica e de IA

Cada bloco responde às perguntas do fundador com o estado medido, a recomendação e a razão.

### 3.1 Dados e conhecimento

**Hoje.** Postgres 17 no Supabase é o registro canônico de tudo: companhias, projetos, documentos (bytes em storage privado, hash SHA-256, versão imutável), fatos, claims, artefatos com fingerprint e dependências, cenários, decisões, autorizações. As cinco classes de conhecimento que o fundador quer separadas já estão em tabelas distintas: Company Truth (`evidence_facts`, `public_company_source_memory`), Project Memory (planos, decisões, `deal_state_objects`), House Knowledge (`house_playbook_versions` e chunks, procedimentos em git), Market Intelligence (`public_research_sources`, curvas em `market-curves`), Investor Mandates (`mandate_versions`, `fund_mandate_observations`). Invalidação existe: grafo com nós de tipo fonte, fato, cálculo, claim, artefato, aprovação e match, e 28 eventos gravados.

**Recomendações.**

- **Sistema de registro: Postgres e object storage continuam.** Não há razão de volume, de consulta ou de governança para outra coisa. Regra: nenhum objeto canônico vive fora do banco; índices são projeções reconstruíveis.
- **Lakehouse: não agora, com gatilho definido.** Definir desde já a projeção de arquivo (Parquet em S3, particionado por organização e projeto) como formato de arquivamento e análise. Acionar quando o volume quente passar de 50 GB ou quando consultas analíticas disputarem com o OLTP. Séries de mercado, mesmo na escala de um feed diário de milhares de instrumentos por anos, cabem em uma tabela particionada.
- **Vetor: pgvector, dentro do RLS, como projeção.** O argumento decisivo não é desempenho, é fronteira. Com o índice no mesmo banco, a consulta roda sob o papel do tenant e não há como recuperar um chunk de outra organização. Um banco vetorial externo (LanceDB incluído) moveria a autorização para código de aplicação. O ADR 0010 mantém chunks de case só lexicais por escolha; manter o lexical como primeiro recuperador, porque a âncora exata é auditável, e adicionar embedding por versão de documento como segundo estágio de recall e reordenação, calculado pelo worker, nunca canônico. LanceDB só faz sentido para um corpus **público** (regulação, demonstrações públicas, notícias) se ele um dia passar de dezenas de milhões de chunks. Hoje são 296.
- **Correção barata e mensurável: o índice lexical usa `to_tsvector('simple')`.** Sem stemming nem stopwords em português, "debênture" não casa com "debêntures". Trocar para a configuração `portuguese` com `unaccent` e medir recall nos casos gold.
- **Grafo: tabela de arestas, não banco de grafo.** As relações (grupo econômico, garantias, intercreditor, cross-default, definições de covenant que citam outras definições, e sobretudo a linhagem fonte → fato → cálculo → artefato) são grafos pequenos por projeto. Uma tabela `lineage_edges` (sujeito, predicado, objeto, versão, procedência) com CTE recursiva resolve invalidação, "o que depende deste número" e o gate de consistência. Banco de grafo só se justifica para travessia em escala que o produto não tem.
- **Freshness, supersessão e conflito.** Todo claim e observação de mercado carrega `as_of`, `observed_at`, `source_version`, `supersedes_id` e `valid_until`. "Vigente" é uma view, não um flag mutável. Conflito é uma linha (`claim_decisions` já existe para isso) que bloqueia o downstream dependente até resolução. Invalidação propaga pelas arestas e reutiliza `dependency_invalidation_events`.

### 3.2 Retrieval e contexto

**Hoje.** Uma camada governada com quatro fontes e políticas próprias, que devolve citação, score, versão do playbook e abstenção explícita; auditoria só com hash da consulta e ids. Cem por cento das task runs registram um `context_manifest`. A camada única que o fundador pergunta se deveria existir já existe em forma; o que falta é composição por intenção e o segundo estágio semântico.

**Recomendações.**

- **RAGs separados por companhia, projeto, setor: não.** Fragmentar cria silos e respostas contraditórias. Um serviço, consultas com escopo, índices particionados por organização e projeto e um corpus público à parte. A composição por intenção nasce da TaskSpec: inputs mais chaves de cobertura viram um plano de recuperação, que vira o manifesto.
- **Contradição entre fontes é impossível por construção quando número vem de objeto e não de chunk.** Chunks servem para ler e citar; valores vêm de fatos conciliados e cálculos. Dois chunks que discordam viram um conflito registrado, não duas respostas.
- **Manifesto mínimo.** Primeiro objetos estruturados (base conciliada, cronograma de dívida, mapa de cobertura), depois os melhores chunks por chave de cobertura, com teto de tokens por classe de tarefa. O manifesto é persistido (já é) e o verificador rejeita citação fora dele.
- **Referências exatas.** A âncora de célula, linha, bloco e página já é verificada por código no parser (ADR 0008). Estender o schema de âncora com caminho de cláusula para contratos e intervalo de tempo para áudio e vídeo. Planilha continua ancorada em célula.
- **Multimodal.** Tudo se normaliza no mesmo modelo de documento (páginas, blocos, tabelas, células, segmentos) com `anchor_kind`. Áudio e vídeo entram por transcrição comprada, com carimbo de tempo, sob a mesma política de dados. Imagem passa por OCR e nunca é aceita automaticamente (D-014).
- **Métricas, no harness e por caso gold:** recall@k contra âncoras gold, precisão, atraso de freshness contra a data-base exigida, cobertura de evidência (percentual de claims materiais com âncora verificada; `anchor_verified` já existe).

### 3.3 Agentes e workflows

**Hoje.** O ADR 0020 já é a resposta: control plane determinístico no banco (planos, tarefas, runs, orçamento, gates, invalidação) e um Deal Captain que só escolhe dentro dos 80 TaskSpecs. Executores têm chave e versão em cada task run; quality results por tarefa; orçamento mensal por organização e teto por job, aplicado no início da run (`budget_exceeded` disparou duas vezes); retentativas por `attempt_no`; lotes paralelos. As seis falhas de task run foram todas no gate de qualidade M07, ou seja, o gate funciona.

O que não está em pé: o roteamento é por job de entrada e 18 expressões regulares; a companhia é dependência universal; o perfil chega ao modelo como bloco de texto; a política de perguntar, continuar, assumir ou abster vive em prompt, não em tabela; e o motivo de falha não é gravado na linha do job.

**Recomendações.**

- **Executores limitados por contrato, não "agentes".** Já é assim. Nunca introduzir um framework de agentes: a allowlist e o control plane são a garantia de que o modelo não inventa capacidade, e um framework externo dilui exatamente isso.
- **O que é dinâmico e o que é determinístico.** Dinâmico: interpretar o pedido, escolher TaskSpecs da allowlist, prosa, ranking com racional, ranqueamento de perguntas. Determinístico: estado, permissão, orçamento, todo número, gates, invalidação, montagem de output. Qualquer coisa que mude um número ou uma permissão é determinística.
- **Replanejar sem perder trabalho.** Marcar descendentes como obsoletos pela linhagem e memoizar nós por `input_fingerprint`, que já existe em task runs e artefatos. Um nó cujo fingerprint de entrada não mudou não roda de novo.
- **Loops e custo.** Além dos tetos que existem: limite de nós por run, disjuntor para saída idêntica repetida, e abstenção como resultado de primeira classe de qualquer nó.
- **Intenções compostas ou que mudam.** Envelope com mais de uma família e confiança por campo. Duas famílias acima do limiar: executar o prefixo comum (levantar, conciliar, compreender) e perguntar uma vez no ponto de ramificação, sem parar o que já anda.
- **Perguntar, continuar, assumir, abster: uma tabela, não um prompt.** Perguntar quando o impacto na decisão é alto, a resposta não é derivável de documento ou memória e responder é barato. Continuar com premissa explícita e intervalo quando o impacto é médio e há faixa defensável. Abster quando o gate de evidência falha para a afirmação pedida. Registrar a escolha por nó.

### 3.4 Inteligência financeira

**Hoje.** `financial-core` com Decimal e trace; `financial-model` com modelo institucional (IPCA capitalizado versus pago provado em teste), cenários com overrides, premissa governada com fonte, data-base, racional, metodologia, limites e impactos; `reconciliation` com fato por classe de informação, confiança, âncora verificada e disputa; `monitoring` com teste de covenant; `instrument-catalogue`; curvas de mercado. A lista branca numérica (`materialNumericTokens`) já impede que um texto contenha número que não veio de fonte permitida, em duas verticais.

**Recomendações.**

- **Determinístico obrigatório, por nome:** spreading, identidades contábeis, conciliação, cronograma de dívida, covenants, waterfall, borrowing base, DSCR, LLCR e PLCR, dimensionamento, matemática de preço e custo all-in, cenários e sensibilidades, sources and uses, elegibilidade e concentração de carteira.
- **Padrão de integração:** o modelo propõe estruturas (um mapeamento de conta, uma premissa candidata, uma classificação), o código valida, o motor calcula, o output cita o id do trace. O modelo nunca produz nem altera um número.
- **Generalizar a lista branca em um gate universal de procedência numérica.** Todo número em qualquer artefato precisa resolver para um trace de cálculo ou um claim ancorado, senão o compilador de output rejeita. O mecanismo existe; o que muda é aplicá-lo em um único lugar, na saída, para todas as famílias.
- **Premissa como objeto de banco.** Os campos já existem no pacote. Persistir com aresta de linhagem para que uma mudança de premissa seja uma caminhada no grafo: recalcular só os nós obsoletos, regenerar os artefatos a partir do novo snapshot, marcar as recomendações dependentes.
- **Composição sem centenas de soluções.** Um motor, fórmulas canônicas com teste, packs contribuindo parâmetros, defaults, checks e chaves de cobertura por intenção, instrumento, setor e jurisdição. Regra de precedência e versão no trace, como na seção 2.4.

### 3.5 Modelos de IA

**Hoje.** Roteamento por classe de tarefa já existe e é configuração: classificação e localização de campos no GPT-5.6 Terra com sombra Sonnet 5; extração no Sonnet 5 com escalada até Opus 5 e GPT-5.6 Sol; extração complexa, estrutura, briefs e redação no Opus 5; tese de originação no Sol porque o schema grande foi rejeitado do outro lado; auditoria de evidência no Sol com fallback Opus, ou seja, verificação em provedor diferente do executor; localização no Opus. Política de dados por provedor fail-closed (treinamento proibido, sem retenção, janela de validade). Cassetes de replay nos testes.

**Recomendações.**

- **Manter o roteamento por tarefa e acrescentar três tipos:** `route_intent` (Sonnet 5, esforço baixo, saída estruturada), `verify_output` (provedor cruzado: GPT-5.6 Sol quando o executor foi Anthropic e Opus 5 quando foi OpenAI), `rank_questions`.
- **Generalista, contexto longo, OCR, ajustado.** Generalista forte para julgamento e redação; contexto longo raramente vale a pena porque tabela densa é melhor servida por camada estruturada do que por página inteira no prompt; OCR especializado para digitalizado, com verificação por visão e sem aceite automático; modelo ajustado só nas condições abaixo.
- **Fine-tuning: não agora.** Valeria para extração de layouts de demonstração brasileira (ITR e DFP) e classificação de tipo de documento, depois de três a cinco mil correções homologadas com schema estável. Há zero correções capturadas. A condição prévia é o loop de correção funcionar, não o modelo.
- **Independência de fornecedor.** Já há dois provedores e política. Acrescentar um registro de modelos como dado (id, provedor, versão, capacidades, scores de eval, propósitos permitidos) para que promoção seja uma linha e não um deploy.
- **Shadow evaluation.** O slot `shadow` já existe na política. O que falta é o passo do harness: reexecutar os últimos N manifestos no candidato, comparar com gold e com o verificador, exigir não inferioridade em factualidade e cobertura dentro do orçamento de custo e latência antes de promover.
- **Métricas por tarefa,** gravadas por task run: taxa de erro numérico contra gold, chaves de cobertura cobertas, nota de rubrica de julgamento, acerto de abstenção, latência p50 e p95, custo. `usage` já existe por task run.

### 3.6 Verificação e qualidade

**Hoje.** Gate M07 ativo; quality results por tarefa; auditoria de evidência em provedor diferente; lista branca numérica em duas verticais; revisor no `financial-model` que bloqueia balanço não fechado, premissa sem suporte, cenário misturado e indexação ambígua; harness com 3 ids de caso, fábrica paramétrica de FIDC e salas adversariais; loop de correção desenhado e vazio.

**Recomendações.**

- **Verificador independente do executor.** Primeiro checks determinísticos, baratos: número resolve para trace, citação resolve para manifesto, período, unidade e definição consistentes entre artefatos pela linhagem, afirmação de cobertura bate com o mapa. Depois o verificador de modelo em outro provedor, que vê só output, manifesto e traces, nunca o raciocínio do executor.
- **O que não foi analisado.** O mapa de cobertura já registra; hoje 45 de 61 requisitos estão em `missing`. Esse número tem de aparecer para a pessoa, em cada artefato, não só no banco.
- **Bloquear ou limitar.** Bloqueia: erro numérico, claim material sem âncora, divergência crítica de conciliação, autoridade ausente para um efeito. Limita: dimensão `not_examined`, fonte de baixa confiança, dado fora da data-base.
- **Gold, adversarial e benchmark.** Por caso: fixtures, objetos gold (base conciliada, cronograma, mapa de cobertura, achados esperados), mutações adversariais (unidade trocada, período trocado, reapresentação, nota faltante, fontes contraditórias), execução do melhor generalista com os mesmos arquivos, e rubrica de alpha nas doze dimensões do §16, pontuada por um painel humano.
- **Correções sem chain of thought.** Capturar como delta sobre objeto (valor de claim, mapeamento, definição), com identidade do revisor, nunca o raciocínio do modelo. `extraction_feedback` já tem esse formato.
- **Provar valor.** Cada run emite um `findings_ledger`: o que encontrou, o que evitou, o que melhorou, com referência. É a superfície de prova do produto e o insumo do benchmark por release.

### 3.7 Segurança e arquitetura enterprise

**Hoje.** RLS e FORCE RLS em toda tabela de tenant, chaves compostas com organização, nenhuma chave de serviço na aplicação, capability token por job no worker, gates AAL2 fail-closed, 11.293 eventos de auditoria, política de dados por provedor, allowlist de telemetria, documento com hash, precedente com autorização revogável, introdução com tripla exata (material, versão, destinatário). É forte, e é o que justifica manter retrieval dentro do banco.

**Recomendações.**

- Controle por objeto quando chegar colaboração: membros de projeto com papel, classificação por documento, ação como dimensão. Hoje a unidade é a organização mais o escopo do projeto, suficiente para um usuário por organização.
- Vazamento por cache: chave de cache sempre com organização, projeto e versão do documento; cache de prompt por tenant; nada de cache global de resposta.
- Criptografia: padrão da plataforma em repouso e em trânsito; envelope por tenant com KMS quando um cliente enterprise exigir. Residência `sa-east-1`, declarada nos termos. Retenção e exclusão por classe de objeto, com tombstone e purga das projeções; como índice é projeção reconstruível, a exclusão é completa.
- Autoria: versão com autor já existe (`created_by_kind`), decisão com responsável já existe. Comentário encadeado sobre objeto é o que falta.
- Compartilhamento e introdução: o gate de autoridade exata já existe. Não afrouxar.

### 3.8 Operação e escalabilidade

**Hoje.** Worker em ECS fazendo polling de `worker_claim_job`; sem broker; orçamento mensal e por job; retentativas; upload idempotente; p50 42 s, p95 1.321 s; US$ 30,67 em 500 chamadas (cerca de US$ 0,57 por run); 36 jobs falhos sem motivo na linha.

**Recomendações.**

- Síncrono: interpretar o turno, respostas pontuais e leitura de tela, com alvo abaixo de 10 s. Assíncrono: todo o resto, com eventos de estágio transmitidos à interface (já existem).
- Fila: polling no Postgres basta para dezenas de jobs por dia. Trocar por `pgmq` ou SQS só acima de cerca de 50 jobs concorrentes ou com mais de um pool de workers. Não agora.
- Idempotência e falha parcial: memoização por `input_fingerprint` em nó; status por nó já existe; gravar o motivo de falha na linha do job (hoje só existe na run).
- Custo: existe por run e por organização; acrescentar view por nó, por família e por artefato, com tag de tenant em cada chamada.
- Incremental: chunk e embedding por versão de documento, nó de cálculo por hash de entrada, delta de monitoramento só sobre dependências afetadas.
- Profundidade sem lentidão: pré-computar na ingestão (spreading, cronograma, chunks), memoizar, transmitir parciais, paralelizar nós e definir SLO por profundidade: pontual até 15 s, preliminar até 3 min, institucional até 15 min com progresso visível.

## 4. Plano

### 4.1 Diagnóstico da arquitetura atual

| Componente | Estado medido | Veredito |
| --- | --- | --- |
| Registro canônico (Postgres, RLS, storage) | 114 tabelas, RLS total, hash por documento | manter |
| Control plane (planos, tarefas, orçamento, gates) | 80 TaskSpecs, 126 task runs, gate M07 ativo, orçamento aplicado | manter |
| Deal Captain | 4 planos de agente sobre 17 planos compilados, entrada por job | generalizar para envelope |
| Roteador | 8 intenções, 18 regex, seis jobs | substituir em sombra |
| Resolução de objeto | companhia como raiz | generalizar |
| Objetos econômicos | premissa e fato nos pacotes, sem linhagem persistida única | generalizar |
| Invalidação | grafo e 28 eventos | manter, ligar a `lineage_edges` |
| Retrieval | 4 fontes, manifesto em 100% das tarefas, lexical `simple` | manter, corrigir idioma, adicionar segundo estágio |
| Motor financeiro | Decimal, trace, IPCA provado, revisor | manter |
| Verificação | gate M07, auditoria cruzada, lista branca em 2 verticais | generalizar para gate universal |
| Gateway de modelos | 16 tarefas, sombra, fallback, política de dados | manter, acrescentar 3 tarefas |
| Harness | 3 ids de caso, fábrica FIDC, adversarial | generalizar para 5 casos gold com baseline |
| Loop de correção | desenhado, 0 linhas | ligar |
| Worker e fila | polling, ECS, sem motivo de falha no job | manter, corrigir registro de falha |
| Monitoramento | teste de covenant, sem agenda | construir na fase 4 |
| Staging | inexistente (R-015, D-009) | criar antes da fase 1 |
| Perfil profissional | separado de capacidade, consumo como texto | consumir estruturado na fase 3 |

### 4.2 Arquitetura-alvo

```text
Conversa, arquivos, eventos de mercado
        │
        ▼
Intent Envelope (8 campos, versão, confiança por campo) ──► Object Resolver (só o necessário)
        │
        ▼
Workflow Compiler: 9 famílias × eixos + packs de parâmetros ──► Coverage Map por decisão
        │
        ▼
Control plane (Postgres): plano, TaskSpecs allowlist, orçamento, gates, permissões, linhagem
        │
        ├──► Executores limitados por contrato, em paralelo, memoizados por fingerprint
        │       leitura e conciliação · pesquisa pública · motor financeiro · mercado · materiais
        │
        ├──► Retrieval governado: manifesto por tarefa, lexical + vetor no RLS, corpus público à parte
        │
        ▼
Snapshot econômico (fatos, premissas, cálculos, cobertura, decisões, versões)
        │
        ├──► Verificador: checks determinísticos + modelo em provedor cruzado
        ├──► Compilador de output: chat, artefato, arquivo, do mesmo snapshot
        └──► Findings ledger + custo por nó
        │
        ▼
Gates de autoridade ──► matching ──► introdução exata ──► feedback
```

### 4.3 Manter, generalizar, substituir, remover

**Manter:** Postgres e storage como verdade; RLS como fronteira; capability tokens; gateway com política de dados; motor financeiro; invalidação; manifesto de contexto; gates de autoridade; auditoria.

**Generalizar:** lista branca numérica em gate universal de saída; premissa, cálculo e claim em objetos com linhagem; retrieval com segundo estágio dentro do banco; harness para casos gold com baseline; perfil consumido de forma estruturada.

**Substituir:** roteador por regex e seis jobs, por envelope em sombra e depois em produção; `to_tsvector('simple')` por `portuguese` com `unaccent`.

**Remover:** a §9.15 do Atlas como está; a promessa de reestruturação dentro da I07; qualquer plano de banco vetorial externo, banco de grafo ou lakehouse neste horizonte.

### 4.4 Build versus buy

| Comprar | Construir | Não comprar |
| --- | --- | --- |
| modelos (dois provedores, política de dados) | ontologia e objetos com linhagem | framework de agentes |
| embeddings | motor financeiro e packs de parâmetros | banco de grafo |
| OCR e transcrição de áudio e vídeo, sob a política de dados | retrieval governado e manifesto | banco vetorial externo |
| object storage, banco gerenciado, fila quando precisar | verificador e compilador de output | lakehouse |
| observabilidade com allowlist | harness de avaliação e registro de fontes | dados de mercado por scraping fora da licença |

### 4.5 Contratos e schemas necessários

1. `IntentEnvelope v1`: 8 campos, estado e confiança por campo, versão, correção pelo usuário.
2. `Claim v2`: valor, unidade, período, escopo, classe de informação, âncora, `as_of`, `observed_at`, `supersedes`, confiança, revisão.
3. `Assumption`: persistência do `GovernedAssumption` com id de linhagem.
4. `CalculationTrace`: id, fórmula canônica, parâmetros com id e versão de pack, inputs por id de claim ou premissa.
5. `LineageEdge`: sujeito, predicado, objeto, versão, procedência; alimenta invalidação e consistência.
6. `ContextManifest v2`: objetos estruturados primeiro, chunks por chave de cobertura, teto de tokens, hash.
7. `CoverageMap`: por decisão, com os seis estados do Atlas.
8. `QuestionPolicy`: tabela de perguntar, continuar, assumir, abster, por impacto, derivabilidade e custo.
9. `VerifierReport`: checks determinísticos e veredito cruzado, com bloqueio ou limitação.
10. `EconomicSnapshot`: o conjunto versionado que verificador e compilador leem.
11. `FindingsLedger`: achados por run nas doze dimensões de alpha.
12. `ModelRegistry`: modelos, capacidades, scores, propósitos permitidos, promoção.
13. `TaskSpec contract`: o §6.4 do Atlas já está próximo do registro atual; acrescentar `invalidation_keys` e `cost_budget` onde faltam.

### 4.6 Ordem de implementação

**Fase 0, confiabilidade do trilho atual (1 a 2 semanas).** Gravar motivo de falha na linha do job. Trocar a configuração lexical para português com `unaccent` e medir. Mostrar cobertura `missing` na interface. Definir SLO por profundidade e medir. Criar staging (branch ou projeto) para ensaio de migração. Rodar os cinco casos gold ponta a ponta e capturar cada run como fixture de regressão. Gate: cinco casos verdes, p95 medido, zero falha sem motivo.

**Fase 1, linhagem e snapshot (2 a 3 semanas).** `lineage_edges`; premissa e cálculo como objetos; gate universal de procedência numérica no compilador de output; `findings_ledger`. Gate: mudança de premissa propaga até o material em um caso gold, e nenhum número sem trace sai em nenhum artefato.

**Fase 2, envelope em sombra (3 a 4 semanas).** `route_intent` como tarefa do gateway; envelope v1 gravado ao lado do roteador atual, sem alterar execução; conjunto gold de 200 mensagens ambíguas, compostas, pontuais e não company-led; resolução de objeto sem companhia; compilador das nove famílias sobre os 80 TaskSpecs, devolvendo lacuna de capacidade em vez de inventar nó; política de perguntas como tabela; cobertura compilada por decisão. Gate: concordância do envelope com o gold acima de 90% nas famílias e 85% nos eixos, medida por semana.

**Fase 3, consumo e diferenciação (3 a 4 semanas).** Deal Captain recebe envelope e perfil estruturados; testes por função (mesma verdade, abordagem diferente, nenhuma capacidade inventada); compilador de output a partir do snapshot para chat, artefato e arquivo; `verify_output` cruzado como gate; shadow evaluation no harness para promoção de modelo. Gate: os testes por função passam e o verificador cruzado bloqueia as mutações adversariais.

**Fase 4, largura por família com promoção (contínua).** Monitoramento com agenda, baseline e atualização por dependência; fontes de mercado brasileiras com licença por fonte e freshness; mandatos reais; discriminadores de matching validados; introdução. Cada família sobe de `specified` a `production` pelos gates da seção 4.8.

### 4.7 Migração sem quebrar o produto

Padrão estrangulador. O roteador novo grava em sombra e o antigo continua decidindo; a troca acontece por família, atrás de flag por organização, quando a concordância bate o gate. As seis entradas viram saídas compiladas do envelope, não desaparecem. Objetos novos são escritos em paralelo aos existentes por uma fase inteira antes de qualquer leitura migrar. Migrações passam pelo staging e pelo CI de banco antes de produção, como já é regra. Nenhum big-bang; nenhuma tabela é removida antes de dois ciclos sem leitura.

### 4.8 Casos gold, benchmarks e gates de produção

**Os cinco primeiros casos**, escolhidos porque o trilho atual os executa e porque já existem fixtures:

1. Reunião com CFO de companhia aberta a partir de briefs públicos (Camil): famílias 3, 6 e forma "briefing".
2. Estruturação com recebíveis a partir de documentos dispersos (Rede Horizonte): famílias 2, 4, 6.
3. Atualização trimestral do caso 1: eixo `continuity = refresh`, só dependências afetadas recalculam.
4. Revisão de term sheet recebido: famílias 6 e 7, custo all-in, prepayment, covenants, garantias.
5. Mesmos documentos do caso 2 lidos como analista de crédito: eixo de responsabilidade e audiência, a prova do contrato de consumo do perfil.

**Teste de sobrevivência em números**, por caso, contra o melhor generalista com os mesmos arquivos: zero erro numérico; toda afirmação material com âncora; pelo menos dois achados verificados que o baseline não trouxe em 80% das execuções; cobertura `not_examined` visível e correta; latência dentro do SLO da profundidade; custo dentro do orçamento (D-012); nota do painel de especialistas acima do baseline em julgamento e formato.

**Gates de maturidade por família:** `catalogued` (existe no Atlas) → `specified` (contrato, checks, o que o generalista erra) → `implemented` (roda nos casos gold) → `tested` (gold, adversarial e baseline verdes; shadow eval de modelo) → `production` (painel humano, custo e latência medidos por quatro semanas, findings ledger populado). Nenhuma família é chamada de expert antes de `production`.

### 4.9 Riscos

| Tipo | Risco | Controle proposto |
| --- | --- | --- |
| Técnico | ontologia mudando enquanto se implementa | congelar envelope v1 e os cinco casos por fase; toda mudança de schema versionada |
| Técnico | retrieval fraco em PDF digitalizado e planilha desestruturada | OCR sem aceite automático, âncora de célula, medir recall por caso |
| Técnico | complexidade antes de prova (R-011) | fases com gate; nada da fase 2 antes do gate da fase 0 |
| Financeiro | runs institucionais caras em Opus | orçamento por profundidade, memoização, custo por nó visível, tetos de D-012 |
| Operacional | um só projeto Supabase é produção (R-015) | staging na fase 0; CI de banco continua obrigatório |
| Operacional | falhas sem motivo registrado | corrigir na fase 0; alerta quando `result` nulo |
| Operacional | um fundador e agentes como equipe | tudo que decide vira dado versionado, não conhecimento de sessão; fixtures de run |
| Regulatório | ato regulado apresentado como software (R-002) | fronteiras nomeadas no Atlas; introdução só com gate de autoridade; parecer nunca vinculante |
| Regulatório | licença de dados de mercado | registro de fontes com licença; ANBIMA Data manual até confirmar termos; sem scraping como feed |
| Regulatório | LGPD e dados de pessoas em documentos | política de dados por provedor, retenção por classe, exclusão com purga de projeções |
| Produto | loop de aprendizado vazio | capturar correção como delta de objeto desde a fase 0; meta de volume para fine-tuning |
| Produto | perfil profissional virando fato | contrato de consumo já escrito; testes por função na fase 3 |

### 4.10 Outras mudanças necessárias

1. Criar staging antes de qualquer migração da fase 1 (D-009).
2. Captura de run como fixture de regressão, começando pelos briefs da Camil, para que a conta do fundador seja descartável.
3. Consumo estruturado do perfil profissional, já especificado em `docs/product/PROFESSIONAL_CONTEXT_CONSUMPTION.md`, como parte da fase 3.
4. Registro de fontes brasileiras como ativo do produto, com licença, freshness e custo por fonte; a decisão sobre o ANBIMA Feed permanece.
5. `findings_ledger` como superfície de prova para o usuário e para o benchmark por release.
6. Nomear no Atlas as fronteiras: reestruturação fora até existir pack, execução de mercado fora, opinião jurídica fora.
7. Corrigir a §9.15 e reduzir o envelope; publicar o Atlas v1.0 só depois dos gates da fase 2.
