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

## 3.6 Segunda rodada do gate vivo: roteamento provado, orçamento e leitura corrigidos (5 de setembro, noite)

- Execução 33981814108 com chave real: vinte e quatro chamadas de modelo, todas respondidas. As
  cinco paráfrases do analista de banco caíram na mesma composição (`prepare_meeting`, corpus
  `gc01`); a mensagem sobre outra companhia foi recusada com `company_without_corpus` e nada da
  Camil vazou; o CFO preparando conselho foi para `prepare_decision`. Dez runs de prévia geraram
  perguntas do modelo (quatro por run, nenhuma descartada, cerca de US$ 0,04 cada). Em produção o
  projeto dedicado da Cedro respondeu um turno de pergunta ao vivo (US$ 0,0225) e gravou o
  primeiro envelope de intenção.
- O que parou a rodada: a leitura esperava nove seções e a síntese faz dez; e a chamada de síntese
  foi recusada pela reserva prévia de orçamento (`0.0423 + 0.2079 > 0.1`). O run carregava dez
  centavos; as perguntas já tinham gasto quatro e a reserva da síntese era dimensionada pelo teto
  de seis mil tokens de saída.
- Correção (PR #455): a ativação dá ao run cinquenta centavos e quatro chamadas, no orçamento do
  run e no `model_budget` do job; o teto de saída da síntese cai para quatro mil tokens; o gate
  passa a 0,60 por job e quatro chamadas. Migração `20260905175807` aplicada em staging e
  produção. A distinção que importa: o teto por job do worker limita o gasto; o orçamento do run
  precisa caber a soma das reservas prévias, que são calculadas pelo teto de saída, não pelo
  gasto real.
- Terceira rodada (run 33983187468, PR #455 na main): o roteamento segurou (dez turnos, todos na mesma
  composição e corpus) e a síntese passou a rodar, mas metade das chamadas de síntese truncou no teto
  de quatro mil tokens (chamada perdida de cerca de quarenta segundos e US$ 0,23, seguida de um
  fallback a um provedor sem créditos). Cada run de prévia levou cerca de cinquenta e sete segundos
  e US$ 0,27; as cinco paráfrases em sequência, cada uma esperando o run do projeto anterior num
  worker que pega um job por vez, estouraram os quatro minutos do teste. Correção (PR #457): o
  modelo escreve contra um esquema próprio (três parágrafos de até setecentos caracteres por seção,
  seis referências por parágrafo) e um orçamento explícito no prompt (noventa palavras por
  parágrafo, mil no total); o teto sobe a seis mil tokens como folga, para uma resposta longa virar
  chamada mais longa e não chamada truncada; o teste das paráfrases ganha quinze minutos.
- Quarta rodada (run 33984926921, PR #457 na main): oito dos dez passos passaram com modelo na
  primeira tentativa (paráfrases em 4,3 minutos, outra companhia recusada, CFO em
  `prepare_decision`, devolutiva com dez seções, pergunta respondida pelo objeto de covenants,
  material planejado em três páginas, premissa com sete de dez etapas replicadas); a síntese fez
  treze chamadas, treze boas, entre US$ 0,20 e 0,25 e entre vinte e cinco e cinquenta e um segundos.
  Os envelopes exportados (PR #456) mostraram os dois defeitos restantes: no turno de resposta o
  classificador não devolveu o id da pergunta e leu "conselho" como pedido de board deck (o turno
  virou material; o teste ainda casou uma resposta antiga da página); no retry, o pedido de três
  páginas de pitch voltou do classificador como resposta à pergunta de formato, o ramo de respostas
  venceu e o turno virou `deepen`, cujo run falhou porque as perguntas geradas para deepen e
  prepare_decision não declaravam documentos pesquisados (o planner recusa). Correção (PR #458):
  pedido de material em palavras (fora de aspas; com a marca do classificador, um imperativo ou uma
  contagem de páginas) vence a leitura de resposta e leva as respostas no brief; resposta que cita a
  pergunta é lida sem id; premissa só entra quando a mensagem traz um número; toda composição
  declara os documentos da base; o teste só aceita respostas posteriores ao envio.
- Quinta rodada (run 33986987338, PR #458 na main): nove dos dez passos com modelo na primeira
  tentativa; material e premissa, que falhavam, passaram. Catorze runs de prévia, nenhum falhou;
  treze sínteses boas (27 a 54 segundos, US$ 0,20 a 0,25), uma inválida aos 67 segundos que caiu
  para o esqueleto; duas leituras do roteador malformadas refeitas na hora pelo próprio modelo.
  O passo de resposta falhou por uma causa estrutural que a transcrição mostra: a devolutiva
  recalculada depois da mudança de premissa saiu sem perguntas abertas (mudança de premissa e
  pedido de material não geram perguntas novas e o planner não perguntava nada), então no turno
  de resposta o roteador não tinha pergunta para casar, nem por id nem por citação, e planejou
  uma decisão de conselho. Correção (PR #459): sem perguntas novas, o planner mantém abertas as
  perguntas não respondidas do brief anterior; perguntas novas do modelo substituem; a respondida
  sai. No mesmo PR o artefato do gate deixou de pesar 1,6 GB: vídeo e trace só quando um passo
  falha, em pacote separado; o artefato principal leva transcrição, jornada, telas, arquivos
  gerados, relatório, exportações do banco e log do worker.
- Resultado da sexta rodada: Sexta rodada (run 33989224138, PR #459 na main): verde, mas na segunda tentativa. Os dez passos passaram com modelo (resposta à pergunta em `deepen`, audiência conselho, respostas aplicadas; Word e planilha gerados dos objetos, versão 4, vinte e seis números verificados, duas frases removidas). A tentativa que passou fez vinte e cinco chamadas (onze de roteamento, seis de perguntas, oito de síntese) e custou US$ 2,19; a primeira tentativa falhou no passo de resposta porque a jornada enviou a citação vazia (a expressão do teste não extraía uma pergunta com parêntese), corrigido no PR #460 junto com a preferência por papel conhecido na audiência. Pesquisa pública: indisponível no gate (sem chave de busca), como o roteador declarou; em produção o worker tem a chave.
- Sétima rodada (run 33991226510, PR #460 na main, 5 set 17h50): dez de dez em tentativa única,
  jornada de 8,3 minutos. Onze turnos roteados, uma abstenção (companhia sem corpus), oito runs
  de prévia sem falha (as cinco paráfrases, material com oito etapas replicadas, premissa com
  sete, resposta com sete). Vinte e seis chamadas, vinte e quatro boas: onze de roteamento
  (US$ 0,25), seis de perguntas (US$ 0,24), oito de síntese (US$ 1,73), total US$ 2,23. Uma
  síntese truncou aos cinquenta e sete segundos e caiu para o esqueleto declarado; o material
  final foi regenerado com síntese do modelo (trinta números verificados, duas frases
  removidas, versão quatro). Artefato de 35 MB. O que fica em aberto: pesquisa pública com
  fontes dentro do gate (sem chave de busca no workflow), uma segunda tentativa mais curta
  quando a síntese trunca, e a audiência de uma paráfrase ainda como texto livre do
  classificador quando ele não lista papel conhecido.

## 4. O que continua fora

Liberação a clientes, aprovação ou parecer. A trilha de revisão independente segue em paralelo,
limitada a P0 e checkpoints consolidados, e não bloqueia este gate.
