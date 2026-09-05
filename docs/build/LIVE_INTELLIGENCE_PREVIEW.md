# live_intelligence_preview: o próximo gate

Estado em 5 de setembro de 2026. O PR #443 entregou o esqueleto de ponta a ponta do Caso 01
dentro do produto: conversa, plano, tarefas, runs e artefatos no mesmo projeto; nove executores
encadeados; persistência entre turnos; replay por fingerprint; alteração incremental de premissa;
progresso na tela; rastreabilidade de números; isolamento por concessão. Ele não prova
inteligência: a execução usa evidência congelada da Camil, workflow fixo do Caso 01, roteador
por expressões regulares e zero chamadas de modelo.

O gate seguinte, ainda interno e com orçamento limitado, transforma esse esqueleto em um
vertical slice com inteligência real. A decisão do fundador está registrada aqui como contrato.

## 1. O que muda

| # | Requisito | Onde entra |
|---|-----------|------------|
| 1 | Roteador por regex substituído pelo Intent Router semântico | o classificador de sombra (`intent-shadow.ts`, envelope v1) passa a decidir no projeto em prévia viva |
| 2 | O roteador produz o envelope e o compilador escolhe o workflow, sem receber `caseId=gc01` | compilador por composição nomeada (`namedCompositions`) e evidência disponível |
| 3 | Resolver a companhia citada e associar o corpus correto | registro de source packs congelados (Camil = `camil`) mais resolução oficial (CVM); companhia sem corpus nunca recebe dados da Camil |
| 4 | Variações do pedido com a mesma intenção | cinco paráfrases chegam à mesma composição econômica |
| 5 | Perguntas a partir das lacunas de cobertura e do contexto | chamada de modelo sobre as lacunas declaradas pelos objetos, não três perguntas fixas |
| 6 | Resposta do usuário altera escopo, audiência, profundidade e plano | o classificador lê as perguntas abertas; o plano recompila |
| 7 | Pesquisa e recuperação reais, source pack como baseline e cache | modo `frozen` por projeto (`gold_case_bindings`) para a Camil; pesquisa viva para companhia sem pack, quando houver provedor |
| 8 | Cálculos, conciliações, traces e fingerprints determinísticos | os executores e o `financial-core` não mudam |
| 9 | Modelo só onde há interpretação ou julgamento | routing e entendimento, lacunas e plano, síntese, material |
| 10 | Pelo menos um arquivo real | memo DOCX (`case-export`) e planilha XLSX (SheetJS) gerados dos objetos assinados |
| 11 | Contexto preservado e alteração incremental no arquivo | nova versão do arquivo com registro do que mudou, por fingerprint dos objetos |
| 12 | Custo, modelo, fallback, latência e chamadas por etapa | ledger do gateway por etapa, gravado no run e no relatório do gate |

Orçamento da primeira execução: uma chamada para routing e entendimento; uma para lacunas e
plano; uma para síntese; uma para material, se necessária. Cache e snapshots reutilizados. Sem
dezenas de chamadas e sem ciclos de revisão matemática.

## 2. O teste do gate

Uma execução gravada, com worker e banco locais e chaves obtidas por OIDC na própria CI (nunca
em segredo do GitHub, nunca em `.env`), contendo:

1. cinco paráfrases do pedido do analista de IB, todas chegando à mesma composição econômica;
2. uma mensagem sobre outra companhia, que não pode receber os dados da Camil;
3. uma intenção diferente, como CFO preparando conselho;
4. uma resposta do usuário mudando o escopo;
5. uma pergunta sobre a origem de um número;
6. uma solicitação de material;
7. uma alteração de premissa;
8. atualização do material existente.

Entrega: transcrição completa, outputs, arquivo gerado, envelope produzido, workflow compilado,
fontes recuperadas, chamadas de modelo, custo total e os pontos em que o sistema se absteve.

## 3. Fatias de entrega

- **A. Escopo da concessão** (este PR): concessão por projeto; a Cedro deixa de ser desviada;
  projeto dedicado de validação.
- **B. Roteador vivo**: modo `live` no projeto em prévia; envelope decide; resolução de
  companhia; compilação por composição; abstenção honesta para companhia sem corpus; telemetria
  por turno; workflow de CI com chaves por OIDC e teto de gasto; teste com as paráfrases, a outra
  companhia e o CFO.
- **C. Perguntas e respostas**: lacunas viram perguntas; resposta altera o plano.
- **D. Síntese e arquivo**: síntese de banker validada contra os objetos; DOCX e XLSX;
  atualização incremental do arquivo.
- **E. Pesquisa viva** para companhia sem pack, quando houver provedor com chave.

## 3.1 Estado da fatia B (5 de setembro, noite)

- Modo `live` na concessão (`private.integration_preview_grants.mode`); a claim carrega
  `integration_preview_mode`; o status e o banner nomeiam o modo.
- Roteador vivo em `apps/document-worker/src/live-preview.ts`: uma chamada de modelo por turno
  (`route_intent`, o mesmo contrato do classificador de sombra, mais os campos que a mesa de
  prévia precisa: companhias citadas, mudanças de premissa, pergunta sobre número, pedido de
  material, respostas a perguntas abertas, mudanças de escopo). Tudo depois da chamada é
  determinístico: a companhia resolve a um corpus congelado (`preview/corpora.ts`) ou a nada; a
  composição sai do envelope (as composições nomeadas do Atlas mapeadas na cadeia do Caso 01,
  `prepare_decision` para CFO e conselho); o plano é compilado pelo mesmo compilador; a resposta
  começa com uma linha legível por máquina: composição, companhia, corpus, audiência,
  profundidade, modelo, chamadas e custo. Falha do modelo vira abstenção com motivo curto, nunca
  um palpite.
- Companhia sem corpus: abstenção explícita, sem emprestar os objetos da Camil; pedido fora da
  mesa (introduzir, monitorar, identificar capital): recusa com o nome do que foi lido.
- Gate em `.github/workflows/live-preview-gate.yml` (manual): stack local, worker com a chave da
  Anthropic obtida por OIDC e mascarada, teto por job (`MODEL_MAX_COST_USD_PER_JOB`,
  `MODEL_MAX_CALLS_PER_JOB`), jornada `apps/web/e2e/live-intelligence-preview.spec.ts` (cinco
  paráfrases, outra companhia, CFO e conselho, devolutiva, origem do número, material, premissa;
  as duas últimas do teste do fundador ficam como `fixme` até as fatias C e D), relatório
  `scripts/live-gate-report.mjs` (chamadas, custo, latência, abstenções por turno) no artefato
  `live-preview-gate`.
- O que a fatia B ainda não prova: perguntas a partir de lacunas (C), resposta alterando o plano
  (C), síntese de banker e arquivo real (D), pesquisa viva para companhia sem pack (E).

## 3.2 Estado da fatia C (5 de setembro, noite)

- Perguntas a partir das lacunas: `preview/gaps.ts` extrai de cada objeto assinado o que ele
  declara não ter provado, coberto ou conciliado (`block_reasons`, `incomplete_reasons`,
  `unproven_conditions`, `legal_conditions`, `uncovered_terms`, `uncovered_series`,
  `assumptions`, `open_divergences`), cada lacuna com um id citável. Em modo `live`, antes do
  plano da devolutiva, uma chamada (`preview_questions`, sonnet, saída curta) escreve até quatro
  perguntas; toda pergunta tem de citar pelo menos uma lacuna real, senão é descartada; sem
  modelo, valem as três perguntas fixas, nomeadas como fixas na devolutiva. A origem, o modelo e
  o custo ficam no artefato do plano (`preview.questions`) e na devolutiva.
- Resposta altera o plano: o roteador vivo recebe as perguntas abertas do último plano; uma
  resposta reconhecida (id conhecido) recompila com a audiência, profundidade e forma que a
  resposta define, reduz os aspectos indefinidos, guarda as respostas no brief (`answers`) e
  replica o que não muda; premissa na resposta vira `change_premise`.
- Orçamento do run de prévia: três chamadas e dez centavos (migration
  `integration_preview_run_budget`), sob os tetos do worker.

## 3.3 Estado da fatia D (5 de setembro, noite)

- Décima etapa do workflow: `A02` `write-meeting-synthesis` (método registrado na biblioteca,
  estágio implemented, `knowledge/procedures/materials/write-meeting-synthesis.md`), depois do
  plano da devolutiva. Sem modelo, esqueleto: as manchetes que o plano assinou para cada objeto,
  por seção fixa. Em modo `live`, uma chamada (`preview_synthesis`, sonnet) redige a prosa das
  cinco seções só com o que os objetos afirmam; depois, a verificação determinística remove toda
  frase cujo número os objetos não sustentam (vocabulário numérico extraído dos próprios objetos,
  nas formas em que a prosa escreve: 5.670.186, 4,72x, 15,5%) e lista o que removeu. Fonte,
  modelo, custo, latência, números verificados e frases removidas ficam na saída e na devolutiva.
- Arquivo real: `/[locale]/app/projects/[projectId]/preview/material?format=docx|xlsx` gera, do
  último artefato `preview_material` e das tabelas dos objetos, um Word (`case-export`) e uma
  planilha (SheetJS), com versão e fingerprint do artefato nos cabeçalhos; links no painel.
- Atualização incremental: a síntese depende dos nove objetos; premissa alterada muda S10, A01 e
  A02 (7 de 10 replicam), a nova síntese nomeia o que mudou por fingerprint e o arquivo sai em
  nova versão. Cobertura no gate vivo: download do Word e da planilha, versão maior depois da
  premissa.

## 3.4 Estado da fatia E (5 de setembro, noite)

- Companhia sem corpus congelado: além de recusar os objetos da Camil, o roteador vivo roda uma
  pesquisa pública limitada (plano de originação determinístico, até três consultas, três fontes
  por consulta) pelos provedores configurados no worker (Perplexity em produção; na CI do gate,
  a chave é opcional e, sem ela, a resposta diz que a pesquisa está indisponível). A resposta
  lista as fontes encontradas (título e domínio) e diz o que ainda falta para a análise de
  crédito: os documentos da companhia ou uma base congelada. A pesquisa não chama modelo; os
  provedores têm teto por chamada e o evento de estágio registra consultas, fontes, acertos de
  cache e exposição máxima de custo por provedor.
- O que a fatia E não faz: extrair objetos de uma companhia nova (isso é o pipeline de
  extração, que segue medido à parte) nem usar cache de companhia entre projetos (a memória de
  companhia da pesquisa de originação fica para uma fatia posterior).

## 3.5 O que o gate vivo achou e a correção (5 de setembro, fim da tarde)

- Primeira execução com chave real: toda chamada de roteamento respondia `400 invalid_request_error`
  na Anthropic. O probe `probe-structured-output.yml` (entrada sintética, chave por OIDC) deu o
  motivo: "the compiled grammar is too large", o esquema do envelope (dezesseis campos, cada um
  com valor, estado, confiança e base) não cabe na gramática que a saída estruturada compila.
  Consequência que ninguém tinha visto: o classificador de sombra, em produção desde 4 de
  setembro, nunca gravou um envelope (`public.intent_envelopes` vazia).
- Correção: o gateway ganhou um modo de saída `prompted_json`; o JSON Schema vai no prompt, o
  texto é lido (cercas removidas) e validado pelo mesmo zod, e uma resposta malformada ganha
  uma segunda tentativa no modelo primário antes do fallback. O classificador de sombra e o
  roteador vivo usam esse modo; perguntas e síntese continuam em saída estruturada (esquemas
  pequenos). O probe confirma: o esquema completo passa em modo `prompted_json` com esforço
  baixo ou médio, com ou sem thinking.

## 4. O que continua fora

Liberação a clientes, aprovação ou parecer. A trilha de revisão independente segue em paralelo,
limitada a P0 e checkpoints consolidados, e não bloqueia este gate.
