# Atlas Canônico de Intenções e Workflows da Offroad

Versão: 0.9 · 4 de setembro de 2026  
Status: canônico para desenho e implementação; famílias e casos permanecem sujeitos à homologação  
Owner: Produto, DCM e Credit Quality  

## 1. Finalidade

Este Atlas define como a Offroad transforma uma manifestação livre do usuário em trabalho
financeiro especializado, rastreável e revisável. Ele é a ponte entre a intenção expressa no chat
e o grafo de tarefas executado pelo sistema.

O Atlas não é:

- uma biblioteca de prompts;
- uma lista de personas com respostas predeterminadas;
- um menu de produtos financeiros;
- uma esteira única que termina obrigatoriamente em uma operação;
- autorização para o modelo inventar tarefas, fatos, cálculos ou efeitos externos.

O Atlas é:

- uma ontologia de intenções profissionais;
- um catálogo de famílias de trabalho e seus possíveis branches;
- uma especificação de inputs, perguntas, métodos, coverage, outputs e gates;
- uma matriz para descobrir e testar o trabalho real de cada função profissional;
- a base funcional do Intent Router, do Workflow Compiler e do sistema de avaliações.

Sua regra central é:

> **Personas definem a cobertura da biblioteca. A intenção define o trabalho. O contexto define
> como executá-lo. A evidência define até onde é possível afirmar. A audiência define como
> apresentar. A autorização define quais efeitos podem ocorrer.**

### 1.1 Precedência

Este documento é uma especificação de nível 1, subordinada à Constituição de Produto e Operação.
Ele detalha a compilação intent-driven e generaliza a rota company-led descrita em
`PRODUCT_WORKFLOW.md`. Havendo conflito:

1. decisões explícitas do founder;
2. Constituição vigente;
3. este Atlas;
4. `PRODUCT_WORKFLOW.md`, para a rota company-led de preparação de operação;
5. ADRs aceitas;
6. procedimentos canônicos e depth packs;
7. implementação existente.

A presença de uma intenção neste Atlas não significa que seu executor esteja implementado,
testado ou liberado em produção. Maturidade é declarada separadamente.

## 2. Tese operacional

### 2.1 Expandir para dominar; compactar para servir

Na construção do produto, a Offroad expande o trabalho em:

- funções e níveis de senioridade;
- intenções profissionais;
- objetos financeiros;
- situações econômicas;
- instrumentos;
- setores;
- jurisdições;
- tipos de análise;
- procedimentos;
- controles de qualidade;
- outputs;
- decisões e retornos possíveis.

Na experiência, tudo isso é compactado em:

- uma conversa;
- um plano visível e adaptável;
- atividade real durante a execução;
- perguntas somente quando materiais;
- artefatos ligados ao mesmo projeto;
- decisões explícitas sobre o próximo passo.

O usuário não seleciona um agente, uma persona ou um DAG. Ele explica o que precisa, envia o que
possui e corrige o entendimento. O sistema compõe o trabalho necessário.

### 2.2 Perfil ajuda; intenção comanda

O perfil profissional é contexto auxiliar. Pode adaptar:

- linguagem e nível de detalhe;
- ordem da devolutiva;
- audiência provável;
- formas usuais de revisão;
- capacidades institucionais a confirmar;
- sugestões de próximos passos.

O perfil não pode:

- alterar fatos ou cálculos;
- presumir autoridade, mandato ou capacidade institucional;
- ocultar alternativas economicamente relevantes;
- limitar o usuário a tarefas típicas de seu cargo;
- substituir a intenção expressa na conversa.

Um MD pode pedir uma conciliação técnica. Um Analyst pode pedir uma tese comercial. A Offroad
responde ao trabalho solicitado, não ao título cadastrado.

### 2.3 Nem todo trabalho começa ou termina em uma companhia

Uma companhia é um objeto frequente, não a raiz universal do produto. Um projeto pode começar com:

- uma dúvida sobre uma companhia;
- uma operação recebida;
- um term sheet;
- um contrato de dívida;
- um modelo financeiro;
- uma carteira de recebíveis;
- uma waterfall;
- um ativo ou projeto;
- uma necessidade de capital;
- um mandato de investimento;
- uma pergunta sobre mercado;
- um material em preparação;
- um conjunto de documentos sem instrução completa.

O sistema resolve apenas os objetos necessários ao trabalho. Não força uma companhia quando ela
não é material e não força preparação, matching ou introdução quando o resultado desejado termina
antes disso.

## 3. Envelope canônico da intenção

Cada pedido gera uma versão do `Intent Envelope`. Nenhum campo precisa ser perguntado
antecipadamente; campos são inferidos de mensagem, anexos, memória autorizada e interação. O
sistema pergunta somente quando a ausência muda materialmente o plano ou a utilidade do output.

| Campo | Pergunta interna | Exemplos |
| --- | --- | --- |
| `action` | O que o usuário quer fazer? | localizar, entender, reconciliar, modelar, comparar, revisar, preparar |
| `object` | Sobre o que o trabalho recai? | companhia, operação, instrumento, contrato, modelo, ativo, mercado |
| `desired_outcome` | Que resultado útil deve existir ao final? | números reconciliados, tese, estrutura indicativa, memo, shortlist |
| `decision` | Qual decisão ou ação o output deve subsidiar? | levar ideia ao CFO, aprovar análise, escolher alternativa, investir |
| `work_responsibility` | Qual é a responsabilidade desta pessoa neste trabalho? | produzir, coordenar, revisar, decidir, patrocinar, receber |
| `sponsor_instruction` | O trabalho foi pedido por alguém e com qual direção? | MD pediu três alternativas; CFO pediu revisão para o conselho |
| `audience` | Quem consumirá ou revisará o trabalho? | próprio usuário, MD, CFO, conselho, comitê, financiador |
| `stage` | Em que estágio o trabalho está? | exploração, produção, revisão, market sounding, acompanhamento |
| `evidence_regime` | Qual informação pode ser usada? | pública, privada autorizada, híbrida |
| `available_inputs` | O que já existe? | conversa, pasta, modelo, pitch anterior, term sheet, data room |
| `constraints` | O que limita caminhos ou formato? | prazo, moeda, jurisdição, rating, política, confidencialidade |
| `authority` | O que o usuário pode autorizar? | leitura, alteração, aprovação interna, compartilhamento, introdução |
| `depth` | Qual profundidade é necessária? | resposta pontual, análise preliminar, work product institucional |
| `freshness` | Qual data-base e recência são exigidas? | último trimestre, intraday, data do comitê, versão da proposta |
| `continuity` | É novo, continuação ou atualização? | nova análise, refresh, comparação, retomada de projeto |
| `jurisdiction` | Que regimes técnicos se aplicam? | Brasil, EUA, cross-border, múltiplos |
| `language` | Em qual idioma e convenção? | pt-BR, en-US, bilíngue |
| `urgency` | Quando o resultado é necessário? | agora, reunião amanhã, comitê na semana, processo contínuo |

### 3.1 Estado de cada campo

Cada campo pode estar `explicit`, `inferred`, `reused_confirmed`, `ambiguous`, `unknown` ou
`not_applicable`. Uma inferência material precisa mostrar sua base e permanecer corrigível.

`work_responsibility` pode conter mais de um papel no trabalho atual:

- `producer`: constrói análise, modelo ou material;
- `coordinator`: decompõe e integra o trabalho de outros;
- `reviewer`: desafia, comenta e controla qualidade;
- `decision_maker`: escolhe caminho ou aprova internamente;
- `sponsor`: solicita o trabalho e define sua direção;
- `recipient`: receberá a análise ou material;
- `external_authorizer`: pode autorizar disclosure ou introdução específica.

Esses papéis pertencem ao projeto ou ao turno, não ao cadastro permanente do usuário.

### 3.2 Política de perguntas

Uma pergunta ao usuário só é válida quando:

1. altera o plano, a conclusão, a estrutura, o formato ou um efeito permitido;
2. a resposta ainda não está em documentos ou memória autorizada;
3. o sistema consegue explicar por que ela importa;
4. aceita documento, escolha rápida ou resposta livre;
5. não bloqueia trabalho que pode continuar em paralelo.

O sistema apresenta no máximo três perguntas ativas por vez. Se o usuário não responder, trabalha
com premissas ou intervalos explicitamente identificados e informa o impacto da incerteza.

## 4. Objetos canônicos do trabalho

O router pode ligar uma intenção a um ou mais objetos. Cada objeto tem identidade, versão,
procedência, permissões e relações próprias.

1. **Organização:** políticas, usuários, permissões, templates e memória institucional.
2. **Usuário:** preferências, funções declaradas e histórico autorizado.
3. **Companhia ou grupo:** identidade, negócio, financials, estrutura de capital e eventos.
4. **Projeto:** objetivo, branches, decisões, plano, evidências e produtos de trabalho.
5. **Operação:** necessidade, estrutura, tranches, termos, estágio e contrapartes.
6. **Instrumento ou obrigação:** contrato econômico, saldo, custo, amortização, indexador,
   garantias, covenants e eventos.
7. **Documento:** arquivo, versão, tipo, conteúdo, hash, período e classificação de informação.
8. **Claim ou evidência:** afirmação, fonte, âncora, classe, data, confiança e revisão.
9. **Modelo:** históricos, premissas, fórmulas, cenários, outputs, versão e validações.
10. **Ativo, projeto ou pool:** características operacionais, cash flows, elegibilidade e riscos.
11. **Cenário:** conjunto versionado de premissas e resultados dependentes.
12. **Alternativa:** hipótese de capital, racional, requisitos, benefícios, custos e riscos.
13. **Material:** briefing, análise, pitch, memo, term sheet indicativo, Q&A ou data room index.
14. **Mercado:** curvas, emissões, preços, precedentes, notícias e condições de execução.
15. **Provedor ou investidor:** identidade, mandato, comportamento observado, contato e recência.
16. **Mandato:** critérios declarados, limites, exceções, validade e responsável.
17. **Processo:** participantes, etapas, versões, pendências, autorizações e feedback.
18. **Decisão:** alternativas consideradas, escolha, fundamento, condições e responsável.

## 5. Verbos de trabalho e estágios

Os verbos abaixo são capacidades combináveis, não uma sequência obrigatória:

`enquadrar · localizar · adquirir · ler · classificar · extrair · normalizar · reconciliar ·
verificar · pesquisar · compreender · calcular · modelar · projetar · sensibilizar · diagnosticar ·
comparar · desafiar · idear · avaliar · desenhar · revisar · compilar · redigir · renderizar ·
controlar · monitorar · selecionar · preparar · autorizar · introduzir · registrar`

Os estágios possíveis incluem:

1. exploração ou pergunta pontual;
2. entendimento e pesquisa;
3. coleta e organização;
4. análise e diagnóstico;
5. modelagem e cenários;
6. desenvolvimento de alternativas;
7. desenho indicativo de estrutura;
8. preparação e revisão de materiais;
9. preparação interna de decisão;
10. seleção de mercado;
11. conexão qualificada autorizada;
12. captura de feedback e atualização.

O compiler pode começar, terminar, retornar ou manter branches paralelos em qualquer estágio
compatível com a intenção e os gates aplicáveis.

## 6. Compilação do workflow

### 6.1 Sequência lógica

```text
Turno do usuário
  → interpretar Intent Envelope
  → recuperar somente contexto autorizado e relevante
  → resolver objetos necessários
  → identificar família primária e intenções secundárias
  → ativar depth packs aplicáveis
  → compilar coverage map específico da decisão
  → selecionar TaskSpecs e dependências
  → avaliar suficiência e materialidade
  → executar trabalho possível em paralelo
  → perguntar somente lacunas decisórias
  → verificar outputs independentes
  → apresentar resultado + limitações + próximos caminhos
  → registrar decisão e replanejar sem perder trabalho válido
```

### 6.2 Dimensões de especialização

Cada plano combina, quando aplicável:

- núcleo DCM;
- intenção profissional;
- situação econômica;
- objetivo de capital;
- instrumento;
- setor;
- domínio analítico;
- jurisdição;
- regime de evidência;
- estágio;
- audiência;
- output;
- execução de mercado.

Exemplo:

```text
revisar tese de refinance
+ companhia listada de alimentos
+ debêntures CDI e IPCA
+ covenant e liquidity analysis
+ reunião de originação com CFO
+ base pública + modelo interno
+ briefing executivo + páginas de pitch
```

### 6.3 Branches

Um trabalho pode abrir branches independentes, por exemplo:

- `maturity wall → refinance`;
- `covenant headroom → amendment/waiver`;
- `capital de giro → sazonalidade vs. déficit estrutural`;
- `aquisição → bridge + take-out`;
- `recebíveis → borrowing base + concentração`;
- `estrutura selecionada → materiais`;
- `estrutura aprovada → matching`.

Branches compartilham objetos confirmados, mas preservam hipóteses, cálculos, decisões e outputs.
Uma mudança invalida apenas seus descendentes.

### 6.4 Contrato da unidade de trabalho

Cada nó compilado precisa declarar:

| Campo | Regra |
| --- | --- |
| `task_spec_id` | capacidade liberada e versionada; nunca criada livremente pelo modelo |
| `purpose` | pergunta objetiva que a tarefa responde |
| `decision_impact` | decisão ou output que pode mudar |
| `inputs` | objetos e versões mínimas |
| `procedure` | método canônico aplicável |
| `executor` | executor especializado e limite de atuação |
| `execution_class` | deterministic, extraction, research, judgment, compilation ou action |
| `dependencies` | trabalhos que precisam estar válidos antes da execução |
| `parallel_group` | trabalhos independentes que podem avançar juntos |
| `coverage_keys` | dimensões atualizadas pela tarefa |
| `expected_output` | schema e artefato observável |
| `verification` | verificador, checks e critérios de aceite |
| `failure_policy` | retry, alternativa, abstenção ou bloqueio localizado |
| `invalidation_keys` | mudanças que tornam o resultado obsoleto |
| `cost_budget` | limite de modelo, ferramenta, tempo e aquisição |
| `effect` | none, propose_state, commit ou external |

Uma tarefa grande deve ser quebrada quando contiver mais de uma pergunta verificável, exigir
procedimentos diferentes, aceitar execução paralela ou produzir outputs que possam ser invalidados
separadamente. Uma tarefa não deve ser quebrada apenas para criar atividade visual.

### 6.5 Critérios de início e parada

O sistema começa trabalho imediatamente quando possui informação suficiente para executar ao menos
um nó seguro. Ele não espera o Intent Envelope inteiro ficar preenchido.

O sistema pausa um branch quando:

- falta informação bloqueadora que não pode ser obtida por outra fonte;
- existe divergência crítica não resolvida;
- o próximo efeito exige autorização;
- o pack necessário ainda não possui maturidade compatível;
- custo ou tempo ultrapassaria o orçamento aprovado;
- a tarefa pertence à fronteira de outra parte.

O sistema encerra o trabalho corrente quando o resultado desejado foi produzido e verificado. Não
continua automaticamente para estrutura, materiais, matching ou introdução.

## 7. Famílias canônicas de intenção

As famílias abaixo organizam trabalhos recorrentes. Um pedido pode ativar várias ao mesmo tempo.

### I01. Encontrar, organizar e atualizar informação

**Gatilhos:** “levante”, “ache”, “baixe”, “organize”, “atualize”, “o que mudou”, “junte tudo”.

**Resultados possíveis:** corpus de fontes, document register, update pack, changelog, data room
organizado ou base de pesquisa.

**Trabalho necessário:**

- resolver objeto, período, jurisdição e recência;
- localizar fontes públicas e privadas autorizadas;
- adquirir e versionar documentos;
- deduplicar por hash e relação econômica;
- classificar tipo, período, escopo e confiabilidade;
- separar informação vigente, superseded e histórica;
- comparar com a base existente;
- registrar mudanças e lacunas.

**Branches frequentes:** primeira construção; atualização periódica; atualização por evento;
organização de pasta desestruturada; levantamento temático; monitoramento.

**Coverage mínimo:** fontes esperadas, datas-base, documentos encontrados, documentos ausentes,
versões, conflitos e freshness.

**Outputs:** source map, inventário, changelog, pasta organizada e lista curta de gaps.

**Não confundir com:** análise ou recomendação. A aquisição de informação pode alimentar outras
intenções, mas não prova que o conteúdo foi compreendido ou conciliado.

### I02. Extrair, normalizar e reconciliar dados

**Gatilhos:** “extraia”, “abra a dívida”, “concilie”, “por que não fecha?”, “prepare os números”.

**Resultados possíveis:** spreading, debt schedule, reconciliation bridge, base histórica,
base de projeção ou tabela auditável.

**Trabalho necessário:**

- extrair valor, unidade, moeda, período, escopo e âncora;
- preservar reportado versus ajustado;
- resolver consolidação, eliminações e reclassificações;
- mapear caixa elegível, dívida econômica e itens semelhantes;
- reconciliar demonstrações, notas, releases, modelo e materiais;
- rodar identidades contábeis e financeiras;
- registrar divergências e tratamento proposto;
- impedir downstream enquanto divergência crítica não for resolvida.

**Branches frequentes:** financial spreading; dívida por instrumento; caixa e liquidez;
capital de giro; EBITDA reportado/ajustado; sources and uses; modelo versus apresentação.

**Coverage mínimo:** balanço, resultado, fluxo de caixa, períodos, moeda/unidade, dívida, caixa,
ajustes, identidades e divergências.

**Outputs:** base reconciliada, bridge explicada, tabela fonte-a-fonte, exceções e perguntas de alta
materialidade.

### I03. Compreender uma companhia, setor ou ativo

**Gatilhos:** “me explique”, “quero entender”, “quem é”, “como ganha dinheiro”, “prepare uma
leitura”.

**Resultados possíveis:** company/sector/asset view, business model map, value-driver map ou
context brief.

**Trabalho necessário:**

- resolver identidade, grupo, geografia e perímetro;
- compreender produtos, clientes, canais, fornecedores e concorrência;
- mapear receita, custos, margens, capital de giro, capex e caixa;
- identificar drivers operacionais, macro e setoriais;
- entender estratégia, guidance, eventos, riscos e agenda futura;
- ligar dinâmica do negócio a alavancagem, liquidez e capacidade de pagamento;
- distinguir fato, interpretação, expectativa de mercado e hipótese Offroad.

**Branches frequentes:** companhia pública; companhia privada; setor; projeto; ativo; pool;
contraparte; evento específico.

**Coverage mínimo:** negócio, estratégia, governança, performance, cash conversion, capital
intensity, estrutura de capital, riscos, outlook e temas ainda desconhecidos.

**Outputs:** leitura executiva, mapa causal, drivers, fatos que mudam a tese e lacunas materiais.

### I04. Responder uma pergunta factual, quantitativa ou documental

**Gatilhos:** uma pergunta delimitada sobre número, cláusula, evento, definição ou comparação.

**Resultados possíveis:** resposta direta, cálculo rastreável, trecho localizado ou tabela curta.

**Trabalho necessário:**

- delimitar objeto, data e definição;
- localizar a fonte mais autoritativa;
- calcular deterministicamente quando necessário;
- responder primeiro, com premissas e âncoras;
- mostrar divergências relevantes sem expandir artificialmente o escopo.

**Branches frequentes:** “qual o EBITDA?”; “quando vence?”; “o IPCA capitaliza?”; “qual covenant?”;
“de onde saiu a alavancagem?”; “quais contas entraram no caixa?”.

**Coverage mínimo:** definição, período, unidade, fonte, fórmula e limitações.

**Outputs:** resposta verificável e links para evidência/cálculo.

### I05. Analisar desempenho financeiro e qualidade de crédito

**Gatilhos:** “analise”, “qual a qualidade de crédito?”, “devo emprestar?”, “quais riscos?”.

**Resultados possíveis:** diagnóstico financeiro, credit view, risk map, committee analysis ou
monitoring update.

**Trabalho necessário:**

- usar base reconciliada;
- analisar receita, margem, EBITDA, caixa, conversão e capital de giro;
- avaliar alavancagem, cobertura, liquidez, amortizações e flexibilidade;
- examinar concentração, cyclicality, governance e eventos;
- normalizar ajustes e desafiar qualidade do resultado;
- comparar histórico, plano, cenários e referências;
- identificar riscos, mitigantes, early warnings e disconfirmers;
- separar capacidade econômica de apetite ou aprovação de um financiador.

**Branches frequentes:** análise preliminar; underwriting support; monitoramento; contraparte;
portfólio; watchlist; revisão de rating interno.

**Coverage mínimo:** negócio, management/governança, financials, dívida, liquidez, projeção,
downside, riscos, mitigantes, estrutura e fontes.

**Outputs:** tese de crédito não vinculante, scorecard explicável, findings, sensitivities e pontos
para diligência do responsável.

### I06. Construir, revisar ou atualizar modelo financeiro

**Gatilhos:** “modele”, “projete”, “atualize o modelo”, “faça cenário”, “revise as premissas”.

**Resultados possíveis:** modelo editável, forecast, debt model, scenario pack ou model audit.

**Trabalho necessário:**

- definir finalidade, horizonte, granularidade e materialidade;
- construir históricos reconciliados;
- identificar drivers econômicos por setor e companhia;
- ligar premissas operacionais, macro, mercado e fiscais;
- projetar resultado, balanço, caixa e capital de giro de forma integrada;
- modelar capex, depreciação, tributos, juros, amortização e indexação;
- distinguir IPCA capitalizado no principal de IPCA pago em caixa;
- modelar instrumentos, tranches, cash sweep, PIK, grace, bullet e refinanciamento;
- rodar cenários, sensitivities e downside;
- executar checks, circularity controls e model review;
- manter cada input editável, justificado, datado e ligado à fonte.

**Branches frequentes:** modelo preliminar público; modelo gerencial; operating model; debt
capacity; project finance; acquisition; receivables; LBO/venture debt; atualização trimestral.

**Coverage mínimo:** históricos, drivers, premissas, macro, impostos, três demonstrações, dívida,
cenários, outputs de crédito, checks e limitações.

**Outputs:** workbook editável, painel de premissas, source map, checks, cenário-base e downsides.

### I07. Diagnosticar estrutura de capital e necessidade econômica

**Gatilhos:** “como melhorar o balanço?”, “o que fazer com os vencimentos?”, “preciso de liquidez?”,
“como financiar?”.

**Resultados possíveis:** capital structure diagnostic, maturity/liquidity map, funding gap ou
agenda de capital.

**Situações cobertas:**

- vencimentos concentrados e maturity wall;
- liquidez preventiva e caixa mínimo;
- liability management;
- alongamento e suavização de amortização;
- repricing e redução de custo total;
- moeda ou indexador inadequado;
- reorganização, liberação ou reforço de garantias;
- diversificação de fontes e acesso a nova base de capital;
- substituição de dívida cara, curta ou inadequada;
- capital de giro sazonal ou estrutural;
- capex, expansão, aquisição ou ramp-up;
- covenant pressure, waiver, amendment e headroom;
- concentração bancária ou dependência de uma fonte;
- monetização de ativos, recebíveis, estoque ou contratos;
- bridge e take-out;
- evento de acionista, dividend recap ou buyout;
- reestruturação, stress, special situations e rescue capital;
- oportunidade de janela, tender, exchange ou pré-pagamento.

**Trabalho necessário:** mapear necessidade observada, objetivo econômico, usos, capacidade,
fontes de pagamento, restrições, custo de saída, alternativas e timing.

**Coverage mínimo:** dívida atual, caixa, maturidades, custo, amortização, garantias, covenants,
liquidez, projeções, fontes de pagamento, mercado, risco de execução e contingência.

**Outputs:** diagnóstico, prioridades, decision tree e agenda de alternativas a investigar.

### I08. Desenvolver e comparar alternativas de capital

**Gatilhos:** “que alternativas existem?”, “me dê opções”, “compare caminhos”, “o que faz mais
sentido?”.

**Resultados possíveis:** alternative map, option comparison, financing strategy ou board options.

**Trabalho necessário:**

- partir do objetivo econômico, não do produto disponível;
- gerar universo amplo de soluções e combinações;
- filtrar por capacidade, fonte de pagamento, risco, jurisdição e executabilidade;
- estimar custo total, prazo, amortização, garantias, covenants e flexibilidade;
- avaliar benefícios, desvantagens, complexidades e condições de sucesso;
- testar impacto nos cenários financeiros;
- separar aderência à companhia, viabilidade de mercado e caminho de execução;
- mostrar alternativas descartadas e por quê;
- recomendar aprofundamentos sem encerrar artificialmente a decisão.

**Branches frequentes:** refinance; giro; capex; aquisição; asset-backed; project finance;
mercado de capitais; bilateral/sindicado; private credit; híbrido; offshore/cross-border.

**Coverage mínimo:** necessidade, capacidade, estrutura atual, instrumentos candidatos, economia,
proteções, mercado, riscos, dependências e plano B.

**Outputs:** matriz comparativa, shortlist de alternativas, ranking explicável, sensitivities e
questões que mudam a escolha.

### I09. Desenvolver, testar ou revisar uma estrutura indicativa

**Gatilhos:** “estruture”, “revise esta proposta”, “melhore o term sheet”, “como desenhar?”.

**Resultados possíveis:** estrutura-alvo, structure memo, term sheet indicativo, tranche map ou
redline econômico.

**Trabalho necessário:**

- reconstruir pedido, necessidade e fontes e usos;
- dimensionar com modelo e downside;
- definir instrumento, tranches, senioridade e fonte de pagamento;
- calibrar prazo, grace, amortização, bullet, cash sweep e prepayment;
- modelar juros, fees, indexadores, capitalização e hedge;
- desenhar garantias, covenants, baskets, cure rights, reserves e triggers;
- identificar condições precedentes, intercreditor e riscos de documentação;
- testar compatibilidade com mercado e alternativas;
- diferenciar termos indicativos de proposta, aprovação e documentação definitiva.

**Branches frequentes:** estrutura nova; revisão de proposta recebida; benchmark de termos;
reestruturação; múltiplas tranches; bridge/take-out; secured/unsecured; local/offshore.

**Coverage mínimo:** sources and uses, sizing, tenor, amortização, pricing total, garantias,
covenants, eventos, condições, impostos, hedge, downside, mercado e plano de contingência.

**Outputs:** structure memo, term sheet indicativo, comparativo antes/depois, issues list e itens
reservados aos assessores jurídicos/financiadores.

### I10. Analisar documento, contrato, covenant ou waterfall

**Gatilhos:** “leia este contrato”, “teste o covenant”, “revise a waterfall”, “compare as cláusulas”.

**Resultados possíveis:** clause map, covenant model, waterfall test, red-flag memo ou comparison.

**Trabalho necessário:**

- identificar documento, versão, partes, jurisdição e vigência;
- extrair definições e relações entre cláusulas;
- reconstruir cálculo contratual sem substituir aconselhamento jurídico;
- testar covenant, baskets, cure, events of default e headroom;
- reconstruir waterfall, prioridades, reservas e leakage;
- comparar termos contra modelo, outros documentos e precedentes;
- sinalizar ambiguidades, inconsistências e dependências jurídicas;
- encaminhar questões legais ao profissional responsável.

**Branches frequentes:** indenture/escritura; contrato bancário; intercreditor; borrowing base;
waterfall; waiver/amendment; proposta/term sheet; hedge documentation.

**Coverage mínimo:** versão, definições, fórmula, inputs, exceções, datas de teste, consequências,
cross-default/cross-acceleration, garantias e conflitos.

**Outputs:** mapa contratual, cálculo reproduzível, headroom, red flags e perguntas para jurídico.

### I11. Preparar reunião, originação ou conversa estratégica

**Gatilhos:** “tenho uma reunião”, “quero levar uma ideia”, “prepare uma provocação”, “me dê uma
tese”.

**Resultados possíveis:** senior meeting brief, origination thesis, idea menu ou discussion pack.

**Trabalho necessário:**

- compreender objetivo, audiência, relacionamento e tempo disponível;
- recuperar trabalhos anteriores relevantes e perguntar como devem ser usados;
- dominar companhia, setor, financials, outlook, dívida e eventos;
- identificar tensões, oportunidades e perguntas econômicas reais;
- desenvolver ideias específicas e testar seu fundamento prospectivo;
- separar o que beneficia a companhia do que a instituição pode executar;
- antecipar objeções, complexidades e informações necessárias;
- propor estrutura de pitch, não script artificial de reunião.

**Branches frequentes:** primeira reunião; relacionamento existente; conselho/acionista; CFO e
tesouraria; atualização pós-resultado; event-driven; cross-sell fundamentado.

**Coverage mínimo:** contexto, mudanças recentes, outlook, estrutura de capital, alternativas,
racional, impactos, riscos, instituição/caminho de execução e open questions.

**Outputs:** briefing executivo, fatos-chave, ideias priorizadas, supporting exhibits, objeções e
direção recomendada para o material.

### I12. Preparar, transformar ou revisar material institucional

**Gatilhos:** “faça o pitch”, “prepare o memo”, “revise estas páginas”, “transforme em material”.

**Resultados possíveis:** pitch, board paper, lender memo, credit memo, teaser, Q&A, management
presentation, model outputs ou term sheet indicativo.

**Trabalho necessário:**

- confirmar audiência, decisão, estrutura narrativa e formato;
- compilar de objetos canônicos, nunca copiar números manualmente entre peças;
- selecionar evidências e análises adequadas ao propósito;
- construir páginas que sustentem a decisão;
- separar fato, cálculo, premissa e recomendação;
- adaptar profundidade e disclosure à audiência;
- reconciliar todos os números e definições entre materiais;
- revisar linguagem, visual, versões, fontes e confidencialidade;
- renderizar e inspecionar o arquivo final.

**Branches frequentes:** novo material; atualização; revisão sênior; redline; tradução; mudança de
audiência; material de companhia, banco, assessor ou investidor.

**Coverage mínimo:** objetivo, audiência, narrativa, fontes, números, consistência, disclosure,
versão, QA e limitações.

**Outputs:** arquivo utilizável e editável, review memo, source map e consistency report.

### I13. Revisar e controlar qualidade de trabalho

**Gatilhos:** “cheque”, “revise como VP/MD/CFO/comitê”, “ache erros”, “challenge este trabalho”.

**Resultados possíveis:** review comments, error log, readiness assessment ou independent
verification.

**Trabalho necessário:**

- compreender a pergunta que o trabalho deveria responder;
- verificar completude contra coverage map;
- conferir fontes, datas, unidades, períodos e definições;
- recalcular números e testar fórmulas;
- reconciliar modelo, análise, estrutura e material;
- desafiar premissas, alternativas omitidas e conclusão;
- testar downside e disconfirmers;
- distinguir erro, opinião, lacuna e melhoria;
- priorizar comentários por materialidade e bloquear falhas críticas.

**Branches frequentes:** revisão técnica; revisão narrativa; model audit; committee challenge;
consistency gate; revisão jurídica-financeira; pre-send check.

**Coverage mínimo:** mandato, factualidade, matemática, completude, coerência, risco, disclosure,
formato e readiness.

**Outputs:** comentários acionáveis, classificação de severidade, correções propostas, blockers e
aprovação condicionada ou reprovação.

### I14. Preparar decisão interna, comitê ou conselho

**Gatilhos:** “leve ao comitê”, “prepare o board”, “preciso decidir”, “faça a recomendação”.

**Resultados possíveis:** decision memo, board paper, committee pack ou approval request.

**Trabalho necessário:**

- explicitar decisão, autoridade e critérios;
- sintetizar contexto sem perder fundamentos;
- apresentar alternativas consideradas;
- mostrar economia, riscos, sensitivities e consequências;
- registrar recomendação, condições e dissent;
- ligar cada afirmação material a evidência;
- separar decisão interna de aprovação de terceiros;
- capturar comentários, resolução e condições posteriores.

**Branches frequentes:** conselho da companhia; comitê de crédito; comitê de investimento;
aprovação interna de banco; seleção de alternativa; aprovação de material.

**Coverage mínimo:** decisão, opções, critérios, análise, downside, riscos, mitigantes, condições,
autoridade e pendências.

**Outputs:** memo/pack, decision log e lista de condições.

### I15. Avaliar oportunidade ou operação recebida

**Gatilhos:** “recebi este deal”, “vale analisar?”, “é aderente?”, “faça uma primeira leitura”.

**Resultados possíveis:** triage, screening memo, opportunity assessment ou investment/credit
review support.

**Trabalho necessário:**

- reconstruir a oportunidade a partir do material recebido;
- identificar o que é declaração do originador e o que está comprovado;
- conciliar principais números e termos;
- avaliar aderência econômica e, quando autorizado, a mandato específico;
- testar riscos, estrutura, proteções e downside;
- estimar trabalho adicional necessário;
- separar desinteresse, falta de fit e insuficiência de informação;
- preparar perguntas materiais ao originador/companhia.

**Branches frequentes:** lender screen; investor screen; banco bilateral; private credit;
securitização; secondary; co-investment; opportunity sem material suficiente.

**Coverage mínimo:** sponsor/companhia, uso, fonte de pagamento, estrutura, economics, risco,
proteções, documentação, mandato, dados faltantes e próximos gates.

**Outputs:** screening estruturado, fit map, red flags, informação requerida e recomendação de
continuar, manter em observação ou não priorizar — nunca decisão vinculante da Offroad.

### I16. Mapear mercado, precedentes e condições

**Gatilhos:** “como está o mercado?”, “levante comparáveis”, “que preço?”, “quem fez algo parecido?”.

**Resultados possíveis:** market update, comparable transactions, pricing range, precedent map ou
marketability assessment.

**Trabalho necessário:**

- definir comparabilidade por instrumento, risco, rating, setor, prazo, garantia e data;
- pesquisar fontes de mercado com vigência;
- normalizar pricing, fees, duration e termos;
- distinguir transação anunciada, precificada, liquidada e apenas reportada;
- explicar ajustes de comparabilidade;
- analisar curvas, macro, liquidez e janela;
- registrar ausência ou baixa qualidade de dados;
- impedir falsa precisão.

**Branches frequentes:** primary market; bilateral/private; public bonds/debêntures; asset-backed;
project finance; EUA; Brasil; cross-border; sector precedents.

**Coverage mínimo:** universo, critérios, período, fontes, normalização, outliers, recência e
limitações.

**Outputs:** tabela de comps, ranges fundamentados, market map e implicações para a decisão.

### I17. Identificar capital aderente e planejar abordagem

**Gatilhos:** “quem financiaria?”, “quais fundos?”, “faça o matching”, “com quem devemos falar?”.

**Resultados possíveis:** anonymous screen, lender/investor shortlist, fit rationale ou wave plan.

**Trabalho necessário:**

- partir de estrutura suficientemente definida;
- aplicar filtros duros de mandato;
- avaliar ticket, setor, risco, prazo, instrumento, garantia, geografia e estágio;
- verificar fonte, owner e recência do mandato;
- usar comportamento observado sem reescrever silenciosamente mandato declarado;
- explicar fit, dúvidas e possíveis objeções por provedor;
- evitar score cosmético sem discriminadores;
- organizar ondas e contatos corretos;
- preservar anonimato e disclosure conforme autorização.

**Branches frequentes:** screen preliminar anônimo; shortlist identificada; banco; fundo;
institucional; FIDC; asset-backed; special situations; local/offshore.

**Coverage mínimo:** estrutura, hard filters, soft fit, recência, contato, objeções, disclosure e
alternativas de cobertura.

**Outputs:** shortlist explicada, evidence-backed fit, gaps de cobertura e plano de abordagem.

### I18. Preparar e registrar conexão qualificada

**Gatilhos:** “faça a introdução”, “prepare o envio”, “autorize estes investidores”.

**Resultados possíveis:** recipient-specific package, authorized introduction e communication
ledger.

**Trabalho necessário:**

- confirmar autoridade do usuário;
- congelar versão de material e estrutura;
- aprovar destinatário e disclosure individualmente;
- montar pacote e mensagem por destinatário;
- aplicar permissões e marca d’água;
- registrar envio, resposta e próxima ação;
- encaminhar informação adicional apenas com autorização;
- capturar feedback sem assumir o trabalho do financiador.

**Coverage mínimo:** autoridade, destinatário, contato, material, versão, disclosure, data,
resposta e status.

**Outputs:** introdução rastreada e feedback registrado.

**Fronteira:** a Offroad não executa underwriting, diligência do financiador, aprovação, proposta
final, negociação em nome das partes, documentação definitiva, funding ou closing.

### I19. Monitorar companhia, operação, obrigação ou mercado

**Gatilhos:** “acompanhe”, “avise quando”, “atualize todo trimestre”, “monitore o covenant”.

**Resultados possíveis:** monitoring dashboard, alert, periodic update ou change assessment.

**Trabalho necessário:**

- definir objeto, frequência, fontes e thresholds;
- criar baseline versionado;
- adquirir somente informação nova;
- recalcular métricas afetadas;
- distinguir mudança material de ruído;
- avaliar impacto sobre teses, covenants, liquidez, estrutura ou mandato;
- alertar com evidência e ação sugerida;
- preservar histórico e supersessão.

**Branches frequentes:** resultados trimestrais; covenant; dívida/maturidade; rating; notícias;
mercado; mandato de investidor; processo em andamento.

**Coverage mínimo:** baseline, fonte, recência, thresholds, dependências, impacto e responsável.

**Outputs:** delta report, alert material, objetos atualizados e branches reabertos.

### I20. Gerenciar trabalho, versões, pendências e colaboração

**Gatilhos:** “o que falta?”, “onde paramos?”, “organize o projeto”, “incorpore os comentários”.

**Resultados possíveis:** workplan, status, issue tracker, version diff, approval queue ou handoff.

**Trabalho necessário:**

- recuperar objetivo, branches e decisões;
- mostrar tarefas concluídas, em curso, bloqueadas e não iniciadas;
- ligar cada pendência à decisão afetada;
- incorporar comentários sem perder versão anterior;
- invalidar somente descendentes materiais;
- atribuir owner e próximo passo quando solicitado;
- preparar handoff com contexto suficiente;
- impedir que status operacional apareça como conteúdo de análise.

**Coverage mínimo:** objetivo atual, plano, dependências, versões, decisões, gaps, owners e próximos
passos.

**Outputs:** plano vivo, diff, pendências priorizadas e handoff.

## 8. Composições recorrentes de intenções

Pedidos reais normalmente combinam famílias. Exemplos:

| Pedido | Composição provável |
| --- | --- |
| Atualizar pitch após resultado trimestral | I01 + I02 + I03 + I06 + I13 + I12 |
| Preparar MD para reunião com CFO | I03 + I05 + I07 + I08 + I11 |
| Avaliar refinance de maturity wall | I02 + I05 + I06 + I07 + I08 + I09 + I16 |
| Estruturar R$ 50 milhões com recebíveis | I01 + I02 + I05 + I06 + I07 + I08 + I09 + I10 |
| Revisar proposta bancária recebida | I02 + I04 + I09 + I10 + I16 |
| Preparar caso para comitê de crédito | I02 + I05 + I06 + I10 + I13 + I14 |
| Avaliar aderência de um deal ao fundo | I15 + I05 + I10 + I16 |
| Preparar teaser e encontrar capital | I12 + I13 + I17; I18 somente após autorização |
| Testar waterfall de project finance | I02 + I06 + I10 + I13 |
| Monitorar covenant trimestralmente | I01 + I02 + I04 + I10 + I19 |

## 9. Matriz de cobertura por função profissional

As funções abaixo são lentes para descobrir casos, padrões de revisão e outputs. Não são rotas de
runtime.

### 9.1 DCM Analyst

Trabalhos mais frequentes:

- localizar e atualizar informações;
- extrair e reconciliar financials e dívida;
- construir históricos, debt schedules e comparáveis;
- atualizar modelos e sensitivities;
- preparar páginas, tabelas e gráficos;
- checar fontes, fórmulas, unidades e consistência;
- responder comentários e controlar versões;
- organizar data room e status.

Valor esperado: menos trabalho mecânico, menos erro silencioso e primeira versão já revisável.

### 9.2 DCM Associate

Trabalhos mais frequentes:

- decompor instrução do senior em plano;
- coordenar produção;
- revisar base e modelo;
- interpretar análise;
- desenvolver alternativas preliminares;
- construir narrativa e material;
- fechar pendências;
- preparar trabalho para o VP.

Valor esperado: maior capacidade de produção com controle analítico e coerência entre workstreams.

### 9.3 DCM VP

Trabalhos mais frequentes:

- traduzir tese comercial em trabalho executável;
- definir análises realmente necessárias;
- desafiar premissas, projeções e estruturas;
- calibrar alternativas e marketability;
- revisar modelo, pitch e recomendação;
- coordenar especialistas e versões;
- preparar revisão sênior;
- assegurar que o material responde à pergunta original.

Valor esperado: melhor judgment aplicado, ciclos de revisão mais curtos e menos risco de uma tese
fraca chegar ao MD ou ao cliente.

### 9.4 Director ou MD de DCM/Investment Banking

Trabalhos mais frequentes:

- preparar reunião ou discussão com cliente;
- identificar triggers de originação;
- testar uma provocação antes de mobilizar a equipe;
- encontrar ângulos não óbvios;
- comparar caminhos para a companhia;
- direcionar a equipe;
- revisar mensagem e recomendação;
- decidir o que levar, aprofundar ou abandonar.

Valor esperado: chegar às conversas com domínio, ideias específicas e fundamentos verificáveis.

### 9.5 Corporate Banker, Relationship Manager ou originador

Trabalhos mais frequentes:

- compreender cliente e agenda financeira;
- detectar necessidades antes de RFP;
- preparar call plan;
- avaliar aderência inicial a balanço, distribuição ou parceiros;
- desenvolver ideia com DCM/credit/markets;
- organizar informações da relação;
- acompanhar oportunidades;
- converter conversa em mandato de análise.

Valor esperado: originação mais relevante, sem transformar o produto disponível em resposta
automática.

### 9.6 Debt advisor ou boutique

Trabalhos mais frequentes:

- transformar informações dispersas em caso;
- diagnosticar necessidade e capacidade;
- comparar alternativas e provedores;
- desenvolver estrutura indicativa;
- preparar materiais;
- organizar processo e respostas;
- mapear capital aderente;
- apoiar conexão qualificada autorizada.

Valor esperado: institucionalizar qualidade e ampliar capacidade sem simular que a Offroad é o
assessor jurídico, underwriter ou distribuidor final.

### 9.7 CFO, tesoureiro ou corporate finance

Trabalhos mais frequentes:

- compreender posição financeira e estrutura de capital;
- projetar liquidez, vencimentos e headroom;
- avaliar refinance, crescimento, capex, aquisição e contingências;
- comparar alternativas e impactos;
- desafiar proposta recebida;
- preparar discussão com CEO/conselho;
- organizar informações para mercado;
- preparar melhor uma potencial operação.

Valor esperado: decisões mais informadas, alternativas mais bem comparadas e caso mais bem
preparado antes de chegar ao mercado.

### 9.8 FP&A, controladoria e contabilidade

Trabalhos mais frequentes:

- preparar históricos e projeções;
- reconciliar definições gerenciais e contábeis;
- explicar bridges e variações;
- apoiar cash forecast e capital de giro;
- produzir inputs para dívida e covenants;
- validar números de materiais;
- responder data requests;
- manter consistência entre sistemas e documentos.

Valor esperado: reduzir reconstrução manual e tornar os dados utilizáveis para decisões de capital.

### 9.9 Credit analyst, underwriter ou risk

Trabalhos mais frequentes:

- fazer triage de oportunidade;
- reconstruir e conciliar o case;
- analisar crédito e projeções;
- desafiar ajustes e premissas;
- testar downside e capacidade;
- analisar covenants, garantias e proteções;
- preparar memo e comitê;
- monitorar risco e eventos.

Valor esperado: análise mais rápida, completa e verificável, mantendo decisão e underwriting com
o financiador.

### 9.10 Investor, lender, PM ou CIO

Trabalhos mais frequentes:

- filtrar deal flow;
- testar aderência a mandato;
- receber oportunidades melhor organizadas;
- comparar transações;
- revisar tese, estrutura e risco;
- preparar perguntas e comitê;
- monitorar carteira;
- registrar preferências e feedback.

Valor esperado: canal recorrente de oportunidades mais aderentes e estruturadas, com menos tempo
desperdiçado reconstruindo casos incompatíveis.

### 9.11 Structured finance e securitização

Trabalhos mais frequentes:

- analisar pool, dados e elegibilidade;
- construir borrowing base;
- modelar concentração, diluição, perda e pré-pagamento;
- estruturar waterfall, tranches e reforços;
- testar triggers e reservas;
- revisar documentos e consistência;
- preparar materiais;
- mapear provedores especializados.

Valor esperado: profundidade específica e ligação auditável entre dados do ativo e estrutura.

### 9.12 Project finance e infraestrutura

Trabalhos mais frequentes:

- avaliar projeto, contratos e riscos de construção/operação;
- construir modelo integrado;
- testar DSCR/LLCR/PLCR e downside;
- desenhar waterfall, reserves e covenants;
- comparar funding plan e tranches;
- revisar estrutura e bankability;
- preparar materiais e comitê;
- mapear financiadores aderentes.

Valor esperado: integrar engenharia financeira, contratos e risco do projeto sem reduzir a análise
a métricas isoladas.

### 9.13 Founder, CEO, acionista ou conselho

Trabalhos mais frequentes:

- entender alternativas sem dominar linguagem de mercado;
- avaliar custo, risco, diluição e flexibilidade;
- financiar crescimento, aquisição ou runway;
- comparar dívida, híbridos e equity-related;
- preparar conversa com financiadores e advisors;
- compreender proposta recebida;
- tomar decisão de capital;
- acompanhar implicações posteriores.

Valor esperado: acesso a judgment institucional com explicação clara e sem falsa promessa de
aprovação ou funding.

### 9.14 Jurídico financeiro

Trabalhos mais frequentes:

- localizar e comparar definições;
- reconstruir termos econômicos;
- testar covenant e waterfall com o time financeiro;
- identificar inconsistências entre documentos;
- preparar issue list;
- acompanhar versões e condições;
- apoiar negociação com cálculos rastreáveis;
- separar questão econômica de opinião legal.

Valor esperado: melhor conexão entre texto contratual, modelo e consequência econômica, sem a
Offroad prestar aconselhamento jurídico.

### 9.15 Exemplo integrado: como uma instrução atravessa uma mesa de DCM

**Situação:** o MD identifica uma possível oportunidade numa companhia listada de alimentos e pede
ao VP que avalie se vale levar uma tese de liability management à reunião com o CFO.

**MD — intenção e decisão:**

- quer saber se existe uma ideia relevante para a companhia;
- precisa escolher o que merece entrar na conversa;
- espera síntese executiva, fundamento, implicações e objeções;
- não quer receber uma descrição genérica do balanço nem páginas prematuras.

**VP — enquadramento e direção:**

- traduz a provocação em perguntas analíticas;
- define análise de vencimentos, custo de saída, liquidez, projeções e alternativas;
- decide quais cenários e comparáveis serão necessários;
- revisa se a tese é defensável antes de devolvê-la ao MD.

**Associate — integração e construção:**

- organiza o workplan e as dependências;
- revisa a base financeira e os ajustes;
- desenvolve os cenários e alternativas;
- coordena modelo, comparáveis e páginas;
- garante coerência entre análise e narrativa.

**Analyst — produção e controle:**

- atualiza documentos e séries históricas;
- extrai e concilia a dívida por instrumento;
- atualiza projeções e debt schedule;
- calcula custo, maturidade, alavancagem, cobertura e sensitivities;
- levanta precedentes e produz exhibits;
- executa checks e responde comentários.

**Como a Offroad compacta a experiência:** o pedido pode vir de qualquer uma dessas pessoas. O
router identifica a responsabilidade no trabalho atual, o resultado e a audiência. O compiler
ativa os mesmos objetos e procedimentos necessários, mas começa no ponto correto:

- para o MD, primeiro entrega decisão e evidências críticas;
- para o VP, primeiro entrega tese desafiada, coverage e caminhos;
- para o Associate, primeiro entrega plano integrado, análises e work products;
- para o Analyst, primeiro entrega tarefas de produção, fontes, cálculos e checks.

A verdade econômica é idêntica. Ordem, granularidade, interação e forma de revisão mudam.

### 9.16 Exemplo integrado: o mesmo usuário em modos diferentes

Um MD que pergunta “quais contas foram consideradas no caixa ajustado?” está em modo de verificação
pontual: I04 + I02. Um Analyst que pergunta “quais alternativas deveríamos levar ao CFO?” está em
modo de desenvolvimento de tese: I03 + I07 + I08 + I11.

Logo, o runtime não seleciona profundidade por senioridade. Ele usa:

```text
intenção atual
+ responsabilidade neste trabalho
+ decisão
+ audiência
+ evidência
+ profundidade solicitada ou necessária
```

## 10. Casos Pareto para homologação

O primeiro ciclo de profundidade deve provar as seguintes situações ponta a ponta:

1. Analyst atualiza financials, dívida, modelo e pitch após resultado trimestral.
2. VP revisa a tese, desafia premissas e fecha comentários antes da revisão do MD.
3. MD prepara reunião com CFO de companhia pública e seleciona ideias para aprofundar.
4. CFO de companhia privada avalia vencimentos, liquidez e alternativas de refinance.
5. Companhia com necessidade definida envia documentos dispersos para captação com recebíveis.
6. Assessor reconstrói um caso, identifica gaps e prepara estrutura e materiais indicativos.
7. Credit analyst avalia oportunidade, downside, proteções e perguntas para comitê.
8. Investidor filtra operação contra mandato e decide se merece análise adicional.
9. Revisão de proposta/term sheet, incluindo custo total, prepayment, covenants e garantias.
10. Capital de giro: distinguir sazonalidade de déficit estrutural e dimensionar alternativa.
11. Capex: construção, ramp-up, contingência, funding plan e capacidade de pagamento.
12. Acquisition finance: purchase price, sources and uses, bridge, integração e take-out.
13. Receivables: tape, elegibilidade, concentração, diluição, borrowing base e waterfall.
14. Project finance: contratos, construção, waterfall, reservas e DSCR/LLCR/PLCR.
15. Venture debt: runway, burn, milestones, PIK, warrant, covenant e refinancing risk.
16. Liability management: custo de saída, consent, tender/exchange, extensão e contingência.
17. Covenant pressure: projeção, headroom, waiver/amendment e efeitos cruzados.
18. Preparação de board paper para escolher entre alternativas de capital.
19. Matching discriminado com hard filters, recência, racional e objeções por provedor.
20. Monitoramento trimestral que atualiza somente dependências afetadas e reabre a tese correta.

Cada caso deve ter variante pública, privada ou híbrida quando economicamente aplicável; execução
em pt-BR e en-US; e comparação contra o melhor modelo generalista disponível.

## 11. Contrato de um caso de workflow

Cada caso de treinamento e homologação deve conter:

```yaml
case_id: string
title: string
real_world_trigger: string
user_function_lens: [string]
intent_envelope:
  action: [string]
  objects: [string]
  desired_outcome: string
  decision: string
  audience: [string]
  stage: string
  evidence_regime: string
  constraints: [string]
  depth: string
expected_intent_families: [Ixx]
required_depth_packs: [string]
available_inputs: [string]
hidden_work_required: [string]
decision_material_questions: [string]
coverage_requirements: [string]
deterministic_calculations: [string]
expected_intermediate_outputs: [string]
expected_final_outputs: [string]
branches_and_returns: [string]
must_not_do: [string]
expert_review_rubric: [string]
survival_test_alpha: [string]
```

## 12. Coverage e completude

Não existe “análise completa” em abstrato. Existe cobertura suficiente para uma decisão definida.
Cada plano compila um coverage map a partir da intenção e dos packs ativados.

Cada dimensão assume um dos estados:

- `not_examined`;
- `insufficient_evidence`;
- `covered`;
- `conflicting`;
- `not_applicable`;
- `deferred`.

Para ser `covered`, uma dimensão precisa registrar evidência, procedimento, executor, data,
versão e impacto decisório. O output visível precisa mostrar o que não foi examinado, o que é
materialmente incerto e o que não se aplica.

## 13. Outputs e apresentação

O mesmo trabalho pode gerar camadas diferentes de output:

1. **Resposta no chat:** conclusão útil, fatos-chave, incertezas e próximo caminho.
2. **Artefato analítico:** tabela, gráfico, bridge, modelo, mapa de dívida ou sensitivity.
3. **Produto institucional:** pitch, memo, board paper, term sheet indicativo ou Q&A.
4. **Objeto canônico:** fatos, premissas, cenários, alternativas, decisões e estrutura versionados.
5. **Registro de QA:** checks, divergências, comentários e aprovação.

Todo número material deve permitir que o usuário pergunte:

- de onde veio;
- qual período, unidade e escopo;
- quais contas foram incluídas;
- qual fórmula foi utilizada;
- quais ajustes foram feitos;
- quais outputs dependem dele.

## 14. Gates universais

Todo workflow aplica somente os gates materiais ao trabalho:

1. **Intent gate:** objetivo e resultado esperado compreendidos o suficiente para começar.
2. **Evidence gate:** informação suficiente para a afirmação ou cálculo específico.
3. **Reconciliation gate:** divergências críticas resolvidas ou explicitamente bloqueantes.
4. **Analytical gate:** coverage mínimo e cálculos determinísticos concluídos.
5. **Recommendation gate:** alternativas, premissas, downside e disconfirmers examinados.
6. **Production gate:** audiência, narrativa, estrutura e inputs confirmados.
7. **Consistency gate:** números e definições idênticos entre outputs dependentes.
8. **Market gate:** estrutura suficiente e mandato do provedor vigente.
9. **Authority gate:** autorização específica para qualquer disclosure ou introdução.

Uma resposta factual curta não atravessa gates de produção ou mercado. Uma introdução atravessa
todos os gates que protegem a informação compartilhada.

## 15. Padrão de interação

A interação deve parecer trabalho conjunto entre profissionais:

1. reconhecer o pedido sem repetir mecanicamente o texto;
2. refletir entendimento e, quando útil, tornar explícita uma inferência corrigível;
3. informar o primeiro bloco de trabalho;
4. mostrar atividade verdadeira enquanto executa;
5. compartilhar achados relevantes ao longo do processo;
6. perguntar somente o que muda a análise;
7. devolver trabalho feito, não apenas um plano;
8. apresentar alternativas e ponderações sem conclusão artificial;
9. permitir que o usuário escolha, combine, corrija ou aprofunde;
10. atualizar artefatos e plano sem reiniciar o projeto.

O sistema não deve narrar mecanismos internos com rótulos como “resolver identidade”, “recuperar
contexto” ou “reconstruir companhia”. A timeline traduz trabalho real: “lendo resultados”,
“conciliando dívida com as notas”, “comparando emissões recentes”, “testando amortizações”.

## 16. Teste de sobrevivência

Para cada caso, a Offroad só demonstra diferenciação se entregar materialmente mais que o melhor
modelo generalista com os mesmos arquivos. O alpha precisa ser observável em pelo menos uma destas
dimensões:

- encontrou fato, relação ou risco que o baseline não encontrou;
- percebeu uma dimensão omitida;
- evitou erro de período, unidade, fórmula ou definição;
- reconciliou fontes conflitantes;
- construiu cálculo financeiro verificável;
- melhorou premissa ou cenário;
- alterou ou melhorou uma estrutura;
- apresentou alternativa não óbvia e defensável;
- melhorou o material ou a decisão;
- discriminou melhor investidores ou financiadores;
- reduziu tempo real de produção ou revisão;
- preservou contexto e eliminou reconstrução posterior.

Texto mais elegante ou relatório mais longo não constitui alpha.

## 17. Implicações diretas para implementação

### 17.1 Intent Router

Substituir classificação exclusiva nas seis entradas por extração versionada do Intent Envelope,
com múltiplas famílias, confidence por campo, ambiguidade e correção do usuário.

### 17.2 Workflow Compiler

Compilar targets a partir de `intenção + objetos + estágio + packs + coverage + output`, mantendo
TaskSpecs como allowlist e não como sequência fixa.

### 17.3 Object resolver

Permitir projetos sem companhia confirmada e resolver somente objetos necessários. Remover
dependências universais de `M01` que forcem companhia em trabalhos documentais, contratuais,
mercadológicos ou de portfólio.

### 17.4 Coverage Engine

Gerar requirements por decisão e pack; propagar materialidade; mostrar `not_examined`; bloquear
somente o downstream dependente.

### 17.5 Question Engine

Ranquear perguntas por impacto decisório, ganho de informação, facilidade e redundância. Perguntas
devem aceitar documentos e continuar trabalho paralelo.

### 17.6 Output Compiler

Produzir chat, artefatos, arquivos institucionais e objetos canônicos a partir da mesma base,
preservando identidade econômica e rastreabilidade.

### 17.7 Eval Harness

Testar routing, decomposição, completude, matemática, julgamento, materiais, continuidade e alpha,
com revisão separada por Analyst, Associate, VP/Director/MD, CFO e credit/investment professional
conforme o caso.

### 17.8 De-para entre famílias e TaskSpecs atuais

O mapeamento abaixo é diagnóstico, não alegação de completude. `Parcial` significa que as TaskSpecs
existentes cobrem parte do trabalho, mas faltam contrato, executor, objeto ou gate específico.

| Família | TaskSpecs atuais mais próximas | Estado e principal lacuna |
| --- | --- | --- |
| I01 Informação | M01, D01-D03, C02, K01, K03, K04 | Parcial: falta source/update plan universal e changelog canônico |
| I02 Extração e conciliação | D03-D07, C03, C05, C06 | Parcial: ainda muito ligado ao case company-led |
| I03 Compreensão | M01, C01-C06, C09 | Parcial: falta resolver asset, pool, project e counterparty como raiz |
| I04 Pergunta pontual | D03-D07 e cálculos C/S aplicáveis | Gap: não há TaskSpec própria de resposta delimitada e citada |
| I05 Crédito | C01-C11 | Parcial: núcleo existe; depth packs e casos precisam homologação |
| I06 Modelo | C03, C05-C08, A05 | Parcial: engine existe; falta compilação dinâmica por intenção e setor |
| I07 Estrutura de capital | C05-C11, S01 | Parcial: cobertura econômica existe por packs ainda não homologados |
| I08 Alternativas | S01-S11 | Parcial: requer geração ampla, descarte explicado e model impact |
| I09 Estrutura indicativa | S01-S12 | Parcial: famílias instrumentais e termos ainda não têm cobertura total |
| I10 Documento/covenant/waterfall | D01-D07, C05, C08, S04, S08, S12 | Gap relevante: clause graph e waterfall engine universais |
| I11 Reunião/originação | M01-M07, C01-C11, K04 | Parcial: fluxo inicial existe; falta output prospectivo institucional |
| I12 Materiais | A01-A11 | Parcial: pipeline existe; formatos e qualidade precisam homologação |
| I13 QA e revisão | D07, C08, A10, A11, L04 | Gap: verifier universal por intenção e responsabilidade |
| I14 Comitê/conselho | A01, A02, A04, A05, A07, A10, A11 | Gap: decision/committee object e workflow de comentários/condições |
| I15 Oportunidade recebida | D01-D10, C01-C11, S01-S10, K05-K08 | Parcial: falta triage compacto e separação clara de mandato |
| I16 Mercado e comps | C02, S06, K04 | Parcial: falta normalização ampla, lifecycle e freshness por dado |
| I17 Matching | K01-K10 | Parcial: exige mandatos reais, atualizados e discriminadores validados |
| I18 Conexão | X01-X09 | Especificado: efeitos externos continuam sujeitos a autoridade e rollout |
| I19 Monitoramento | K01, K03, X05, X09, L01-L05 | Gap: scheduler, baseline, thresholds e dependency-aware refresh |
| I20 Gestão do trabalho | M06, D11 e work-system | Parcial: plano existe; falta colaboração, diff e handoff universais |

### 17.9 Ordem de implementação derivada

1. Introduzir schemas versionados de Intent Envelope, objetos e responsabilidade corrente.
2. Fazer shadow routing em paralelo ao `CapitalProjectJob`, sem alterar execução de produção.
3. Criar dataset gold de mensagens ambíguas, compostas, pontuais e não company-led.
4. Permitir múltiplas famílias por turno e correção do entendimento pelo usuário.
5. Mapear famílias para TaskSpecs existentes e retornar gaps de capacidade em vez de inventar nós.
6. Generalizar `M01` para Object Resolution e remover companhia como dependência universal.
7. Compilar coverage e perguntas por intenção/decisão.
8. Implementar primeiro os gaps que bloqueiam os casos Pareto.
9. Conectar output compiler e verifier ao mesmo snapshot econômico.
10. Promover família por família após gold, adversarial, benchmark e revisão especialista.

## 18. Critério de aceite do Atlas

O Atlas está pronto para governar implementação quando:

- todas as famílias têm owner técnico e domain owner;
- cada família está mapeada para TaskSpecs existentes e lacunas explícitas;
- os 20 casos Pareto possuem fixtures, gabarito e adversarial;
- cada coverage map foi revisado por especialista;
- os outputs esperados são artefatos reais, não descrições;
- routing funciona sem depender do cargo cadastrado;
- a mesma intenção produz a mesma verdade econômica para usuários diferentes;
- a apresentação se adapta à audiência sem alterar fatos;
- nenhuma família promete trabalho fora da fronteira da Offroad;
- nenhuma capacidade é chamada de expert antes dos gates de promoção.

## 19. Decisões ainda necessárias

Antes de converter todo o Atlas em contratos de runtime, precisam ser homologados:

1. vocabulário final das famílias na interface — os IDs internos não precisam aparecer;
2. prioridade e ordem dos 20 casos Pareto;
3. coverage map gold de cada caso;
4. nível mínimo de profundidade por output;
5. quais trabalhos pontuais podem existir sem projeto persistente;
6. quais objetos podem permanecer sem companhia resolvida;
7. matriz de autoridade por output e efeito;
8. composição do painel de revisão por domínio;
9. critérios quantitativos do survival test;
10. política de maturidade `catalogued → specified → implemented → tested → production`.
