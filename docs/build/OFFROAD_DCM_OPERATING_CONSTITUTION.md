# Offroad Capital: Constituição de Produto e Operação

Versão: 2.0 · 31 de agosto de 2026

Status: camada 0, fonte canônica de definição, fronteiras e comportamento do produto

Esta Constituição estabelece mandato, princípios, fronteiras, linguagem e gates. Ela não é um
manual de execução de tarefas. O conhecimento técnico executável vive em procedimentos canônicos
versionados. Skills são projeções compiladas desses procedimentos e nunca uma segunda base de
conhecimento.

## 1. Definição e mandato

O Offroad é o AI-native advisor de dívida que ajuda empresas e profissionais do mercado a
**pensar, analisar, estruturar e conectar**. Ele transforma documentos dispersos, intenção de
capital e contexto de mercado em uma decisão executável e auditável.

O produto pode começar antes de existir uma operação e pode continuar depois que uma estrutura
foi escolhida. Sua cadeia de valor é:

> evidência → entendimento → diagnóstico → alternativas → estrutura indicativa → materiais →
> mercado selecionado → introdução qualificada → feedback

O deliverable final controlado pela Offroad é:

> caso compreendido, estrutura recomendada, materiais preparados, mercado selecionado e
> introdução qualificada realizada.

A Offroad faz análise de crédito para diagnosticar, estruturar e antecipar a leitura do mercado.
Não faz underwriting, rating ou parecer vinculante; não aprova crédito; não conduz a diligência
do financiador; não promete proposta ou desembolso. O term sheet da Offroad é indicativo ou uma
estrutura-alvo. O financiador realiza underwriting, diligência, comitê, documentação e decisão
final.

## 2. As seis formas de começar

A home pergunta **“O que você quer resolver?”** e oferece exatamente estes trabalhos:

1. **Entender a companhia na ótica de dívida:** reconstruir situação financeira, riscos e
   capacidade antes de escolher uma operação.
2. **Preparar uma reunião ou tese de originação:** chegar com leitura própria, perguntas e
   estruturas específicas para aquela companhia.
3. **Planejar uma necessidade de capital:** comparar como financiar refinance, crescimento,
   aquisição, capex, giro ou outra necessidade.
4. **Estruturar a partir dos documentos:** receber uma pasta, descobrir o problema, desenhar
   alternativas e preparar uma recomendação.
5. **Revisar uma operação existente:** reconstruir, testar e melhorar proposta, term sheet ou
   desenho inicial.
6. **Preparar materiais e conduzir o processo:** compilar peças, mapear financiadores e continuar
   a execução.

Essas entradas não são personas, produtos ou funis distintos. Elas compilam planos iniciais
diferentes sobre os mesmos objetos e podem convergir, mudar de direção e continuar sem reiniciar
o projeto. O papel de CFO, assessor, banker, analista ou equipe Offroad muda linguagem, defaults,
permissões e formatos; nunca cria uma segunda verdade.

Monetização, packaging comercial e API ficam fora desta versão. Nenhuma decisão técnica deve
otimizar cobrança antes de provar qualidade e continuidade do trabalho.

## 3. Uma organização, companhias duráveis e projetos específicos

- **Organização:** políticas privadas, usuários, permissões, templates, aprovações e memória
  institucional.
- **Companhia:** cérebro durável de identidade, grupo, documentos, demonstrações, dívida,
  covenants, garantias, setor, eventos e fatos confirmados.
- **Projeto:** uma decisão de capital específica, com objetivo, audiência, autoridade, fontes,
  plano, branches, outputs, decisões e histórico.

Uma organização pode trabalhar com várias companhias. Uma companhia pode ter vários projetos sem
duplicar seu cérebro. Um projeto pode ser iniciado sem companhia confirmada, mas deve resolver a
entidade antes de promover fatos privados ou produzir uma recomendação. Nenhum projeto herda
silenciosamente um fato mutável: o usuário vê a origem, a data e a versão reaproveitada.

Documento, conversa e material não são a fonte de verdade. Eles alimentam objetos estruturados e
versionados. Teaser, modelo, memo e term sheet são compilações de um snapshot, nunca depósitos
independentes de números.

## 4. Workspace persistente

O produto não é um chat com anexos. O chat é a superfície de comando de um workspace que preserva:

- sidebar de companhias, projetos, estados, pendências e atividade recente;
- árvore do projeto com fontes, entendimento, Company Truth, análises, cenários, alternativas,
  decisões, materiais, mercado, processo e histórico;
- canvas central para ler e editar o objeto ativo;
- conversa e inspector ligados ao objeto aberto, com evidências, claims, mudanças e aprovações;
- plano de trabalho e agent runs visíveis, com escopo, progresso, conflitos e output;
- checkpoints, versões e diff para revisar, aceitar ou reverter mudanças.

Toda resposta importante termina em um objeto ou próximo passo observável: fato, cálculo, questão,
cenário, alternativa, artefato, aprovação ou ação. O usuário não procura entregas no histórico do
chat.

## 5. Memória, inteligência e execução

Memória profissional é explícita, escopada, editável e atribuível:

- sessão: conversa e estado temporário;
- usuário: preferências pessoais de linguagem e revisão;
- companhia: fatos confirmados e seu histórico;
- projeto: intenção, decisões, alternativas, work products e processo;
- organização: políticas, templates e posições privadas;
- casa: procedimentos e depth packs versionados;
- mercado: mandatos, comparáveis, contatos e feedback com vigência;
- falha e outcome: traces, recusas, propostas e resultados append-only.

Cada tarefa recebe um Context Manifest mínimo: objetivo, versões dos objetos, claims relevantes,
incertezas, constraints, procedimentos, ferramentas, schema e quality gates. O sistema não envia
todo o data room, todo o playbook e toda a conversa para cada chamada.

O pipeline determinístico governa estado, dependências, paralelismo, budget, retries, invalidação
e promoção. Modelos executam tarefas estreitas de interpretação e síntese; cálculos,
reconciliações e restrições objetivas são software determinístico. Papéis organizam capacidades e
permissões, não agentes autônomos conversando entre si.

Pesquisa pública, dados privados do projeto, conhecimento da casa e inteligência de mercado
permanecem em grafos e políticas distintos. Pesquisa externa nunca altera Company Truth sem
evidência, reconciliação e promoção explícita.

## 6. Princípios inegociáveis

### 6.1 Ler antes de pedir

O cliente envia o que possui, no formato disponível. A Offroad inventaria, classifica, extrai,
reconcilia e somente então pede o que realmente falta. O sistema não exige nomenclatura de
arquivos, pastas prévias ou uma data room montada pelo cliente.

### 6.2 Um lote curto por vez

O House Playbook pode conter centenas de verificações. A interface mostra quatro solicitações por
padrão e nunca mais de cinco. O próximo lote nasce depois da leitura e da resolução do lote atual.

### 6.3 Materialidade antes de completude

A prioridade é determinada pelo efeito sobre uma decisão:

1. compreender a companhia, o objetivo e o pedido;
2. calcular capacidade e identificar restrições;
3. escolher instrumento e desenvolver estrutura;
4. testar aderência a mandatos;
5. melhorar a qualidade dos materiais.

Uma informação que não muda nenhum desses pontos não interrompe o fluxo.

### 6.4 Granularidade é consequência, não ponto de partida

Loan tape, contrato a contrato, ativo a ativo ou cronograma linha a linha são pedidos apenas
quando a estrutura selecionada depende deles. A análise começa pelo agregado e aprofunda onde o
risco, a estrutura ou o lastro justificarem.

### 6.5 Toda afirmação material tem classe

- **Fato:** extraído e ligado a fonte.
- **Cálculo:** fórmula, inputs, versão e resultado.
- **Premissa:** declarada, atribuída e sensibilidade conhecida.
- **Julgamento:** interpretação identificada, explicável e revisável.
- **Referência de mercado:** fonte, data, amostra e limitações.

### 6.6 Uma estrutura indicativa não é aprovação

“Suportável” significa que a evidência, os cálculos e as premissas sustentam a configuração como
alternativa de trabalho. Não significa que um financiador a aprovou, aceitou seus termos ou
comprometeu capital.

## 7. Capacidades de execução reutilizáveis

As doze etapas abaixo são capacidades que podem ser compostas por qualquer uma das seis entradas.
Elas não são um onboarding obrigatório e linear. O intent router inicia apenas o subgrafo
necessário, reaproveita objetos válidos e preserva todos os gates materiais.

## Etapa 01: Enquadramento da necessidade de capital

**Objetivo:** entender o propósito econômico antes de presumir instrumento.

**Cliente:** informa valor indicativo, timing, uso dos recursos, contexto e prioridade. Pode
responder em texto ou enviar materiais.

**Sistema:** classifica o arquétipo, registra fatos declarados e separa preferências de
restrições reais.

**Mesa:** confirma o problema a resolver, identifica ambiguidades e evita ancoragem prematura em
um instrumento.

**Output:** mandato inicial, arquétipo e perguntas de enquadramento resolvidas.

**Saída:** objetivo, uso, valor e horizonte temporal compreendidos.

## Etapa 02: Plano guiado de informações

**Objetivo:** criar um plano específico para a necessidade, a empresa e a estrutura em análise.

**Cliente:** vê somente o lote atual, por que ele importa, o que pode substituir cada item e como
responder caso não esteja disponível.

**Sistema:** deriva mínimo, alvo e ideal internamente, elimina duplicidade e prioriza a próxima
melhor ação.

**Mesa:** ajusta exceções de alta materialidade.

**Output:** lote atual e roadmap futuro resumido.

**Saída:** no máximo cinco itens ativos, sem solicitação já respondida.

## Etapa 03: Recebimento e inventário documental

**Objetivo:** receber tudo o que já existe sem transferir organização prévia ao cliente.

**Cliente:** arrasta e solta documentos e acompanha status de leitura.

**Sistema:** preserva original, hash, versão, idioma, classificação, duplicidade e vínculos com o
plano de informação.

**Mesa:** resolve documentos ambíguos e sensíveis.

**Output:** inventário documental rastreável.

**Saída:** cada arquivo tem origem e estado identificáveis.

## Etapa 04: Leitura, extração e mapa de evidências

**Objetivo:** transformar documentos em fatos estruturados sem perder a fonte.

**Sistema:** extrai entidades, períodos, moedas, escalas, contas, cronogramas, garantias,
projeções, cláusulas e fatos narrativos. Cada item carrega página, célula, tabela ou trecho.

**Mesa:** revisa baixa confiança quando ela altera análise ou estrutura.

**Output:** evidence ledger e fatos normalizados.

**Saída:** toda afirmação material tem fonte ou está marcada como premissa.

## Etapa 05: Conciliação e base financeira

**Objetivo:** construir a única base governada do case.

**Sistema:** aplica hierarquia de fontes por conta e período, reconcilia auditado, balancete,
ERP, dívida, garantias, projeções e entidades do grupo. Detecta conflitos e preserva versões.

**Mesa:** define ajustes normalizadores e tratamento de divergências materiais.

**Output:** históricos padronizados, dívida e garantias reconciliadas, projeções comparáveis,
métricas e lineage.

**Saída:** diferenças materiais resolvidas, explicadas ou explicitamente abertas.

## Etapa 06: Resolução focada de lacunas

**Objetivo:** perguntar somente o que muda uma decisão material e não pode ser inferido.

**Cliente:** responde em linguagem simples, envia o arquivo que tiver ou marca parcial, não
aplicável, indisponível ou após confidencialidade.

**Sistema:** agrupa perguntas, explica o motivo, aceita substitutos e recalcula prioridades após
cada resposta.

**Mesa:** formula perguntas críticas e decide quando a informação é suficiente.

**Output:** registro de lacunas, impacto, resposta e resolução.

**Saída:** nenhum desconhecido crítico é tratado como certeza.

## Etapa 07: Análise da companhia e da transação

**Objetivo:** construir a tese de financiamento com profundidade institucional.

**Análises mínimas:**

- modelo de negócio, setor, posicionamento e concentração;
- qualidade do histórico e conversão de caixa;
- liquidez, capital de giro e sazonalidade;
- dívida, vencimentos, custo, garantias e covenants;
- projeto, orçamento, cronograma e riscos de execução;
- projeções, premissas, sensibilidades e downside;
- fontes de pagamento, mitigantes e pontos de atenção.

**Sistema:** executa cálculos determinísticos, cenários e testes de consistência.

**Mesa:** interpreta, desafia premissas e formula a tese. Não emite parecer vinculante.

**Output:** análise técnica rastreável.

**Saída:** fonte de pagamento, riscos, mitigantes e sensibilidades explícitos.

## Etapa 08: Alternativas e capacidade de financiamento

**Objetivo:** transformar análise em caminhos tecnicamente defensáveis.

**Paredes de capacidade:** fluxo de caixa, alavancagem, cobertura, liquidez, garantia,
elegibilidade jurídica do instrumento e prática de mercado.

**Sistema:** dimensiona cenários, compara alternativas e identifica configurações não suportadas.

**Mesa:** preserva o objetivo econômico, explicita contrapartidas e escolhe alternativas
defensáveis.

**Output:** menu de alternativas, capacidade indicativa, restrição vinculante e ajustes.

**Saída:** pelo menos uma alternativa suportável ou explicação clara para a configuração pedida.

## Etapa 09: Estruturação indicativa

**Objetivo:** converter a alternativa escolhida em estrutura clara e negociável.

**Termos cobertos:** tomadora, instrumento, volume, uso, prazo, carência, amortização, referência
de preço, garantias, covenants, condições precedentes, eventos de vencimento e alternativas.

**Sistema:** mantém cada termo ligado à análise, premissa e referência usada.

**Mesa:** elabora o draft de term sheet indicativo e não vinculante.

**Output:** term sheet indicativo.

**Saída:** coerência interna, rastreabilidade e revisão do cliente concluídas.

## Etapa 10: Materiais institucionais

**Objetivo:** contar o case no padrão esperado por um investidor profissional.

**Pacote:**

- teaser;
- memorando de crédito;
- modelo financeiro;
- term sheet indicativo;
- índice de evidências e data room;
- Q&A antecipado de investidores.

**Sistema:** compila tudo a partir da base governada e audita números, claims, versões e
consistência cruzada.

**Mesa:** constrói narrativa, hierarquia, posicionamento, riscos e racional de estrutura.

**Output:** pacote institucional versionado.

**Saída:** nenhuma alegação material sem suporte e nenhuma divergência entre materiais.

## Etapa 11: Mapeamento de mercado e aderência a mandato

**Objetivo:** encontrar provedores para os quais a operação efetivamente cabe.

**Filtros duros:** ticket, setor, instrumento, veículo, estrutura, garantia, prazo, retorno,
jurisdição e restrições declaradas.

**Inteligência de mercado:** mandato declarado, transações observadas, notas de relacionamento,
data de atualização e nível de confiança permanecem separados.

**Sistema:** elimina incompatibilidades e gera racional qualitativo de aderência. Não usa
percentual fictício.

**Mesa:** valida shortlist, momento de mercado e contato correto dentro de cada instituição.

**Output:** shortlist, racional, restrições e estratégia de abordagem.

**Saída:** cada nome tem aderência explicável e nenhum hard constraint ignorado.

## Etapa 12: Autorização e introdução qualificada

**Objetivo:** levar a versão correta da operação ao contato correto, com autorização explícita.

**Cliente:** aprova materiais, versão, destinatários e escopo de divulgação.

**Sistema:** registra autorização, destinatário, data, versão e trilha de compartilhamento.

**Mesa:** realiza introdução, contextualiza aderência, acompanha retorno e coordena respostas
rastreáveis.

**Output:** introdução qualificada e market log.

**Saída Offroad:** introdução realizada com pacote autorizado e versionado.

**Começo do financiador:** underwriting, diligência, comitê, termos finais, documentos,
desembolso e monitoramento.

## 8. Contrato de próxima melhor solicitação

Para cada lacuna potencial, o sistema registra:

- decisão ou output que ela desbloqueia;
- materialidade;
- evidência já disponível;
- formato preferido e substitutos aceitos;
- consequência se não estiver disponível;
- estágio em que realmente é necessária;
- se a resposta exige documento, informação curta ou apenas um aviso futuro.

O ranking segue a ordem:

1. bloqueador para entender o case;
2. altera capacidade ou estrutura;
3. altera aderência a mandato;
4. melhora qualidade do material.

Itens de diligência e fechamento nunca entram no lote atual.

## 9. Vocabulário permitido

### Usar

- estrutura indicativa;
- análise de suportabilidade;
- evidências e premissas suportam;
- suportável com ajustes;
- configuração solicitada não suportada;
- aderência a mandato;
- introdução qualificada;
- sujeito a underwriting, diligência e aprovação do financiador.

### Não usar como alegação da Offroad

- crédito aprovado;
- parecer positivo ou negativo;
- recomendamos o investimento;
- operação garantida;
- funding confirmado;
- termos finais;
- aprovado pelo comitê;
- investment memorandum do fundo.

## 10. Quality gates por etapa

O estado executivo do produto possui sete blocos canônicos:

1. **Understand:** formar Company Truth suficiente e enquadrar a intenção;
2. **Diagnose:** testar números, dívida, capacidade, riscos, restrições e lacunas;
3. **Structure:** comparar alternativas e detalhar uma estrutura-alvo indicativa;
4. **Prepare:** compilar e validar materiais a partir do mesmo snapshot;
5. **Match:** aplicar filtros duros e explicar a shortlist;
6. **Introduce:** compartilhar a versão aprovada com destinatários autorizados;
7. **Capture Feedback:** registrar aceite, recusa, motivo, diligência, avanço, proposta e
   desembolso como sinais de mercado.

Capture Feedback melhora o lender graph e os próximos direcionamentos. Não amplia a
responsabilidade da Offroad para underwriting, diligência, comitê, fechamento ou monitoramento.

Cada etapa precisa de:

- schema validado;
- teste determinístico;
- gold case positivo, condicional e negativo;
- teste de materialidade e abstention;
- controle de versão;
- lineage dos inputs e outputs;
- telemetria de custo, tempo, reprocessamento e intervenção;
- teste de fronteira que impeça alegações reservadas ao financiador.

Nenhuma etapa pode promover o case silenciosamente. Erro, ausência, conflito e baixa confiança são
estados diferentes e precisam permanecer diferentes.

## 11. Arquitetura obrigatória de conhecimento e execução

### 11.1 Uma fonte de verdade, duas formas

O procedimento canônico é a única fonte editável de conhecimento operacional. Dele derivam:

1. a forma humana, usada para revisão pelo desk;
2. a forma executável, compilada para instruções estreitas, schema de saída, ferramentas, limites,
   referências de template e testes.

Toda skill declara `procedure_id`, `procedure_version`, `source_hash`, `compiler_version`, templates,
schemas e dependências. Uma correção é feita no procedimento e recompilada. É proibido corrigir a
skill compilada diretamente ou manter uma segunda instrução divergente em prompt, código ou RAG.

Cálculos e validações implementados em código continuam versionados separadamente, mas o
procedimento canônico declara seu significado financeiro, inputs, outputs, tolerâncias e testes.

### 11.2 Papel não é agente autônomo

Os papéis `intake_evidence`, `financial_analysis`, `credit_structuring`,
`institutional_materials`, `market_distribution` e `independent_quality_control` organizam
responsabilidades, procedimentos, permissões e prompts. Eles não são agentes que conversam,
negociam contexto ou delegam tarefas entre si.

É uma violação desta Constituição implementar o processo principal como uma sociedade de agentes
autônomos. A sequência, o estado, os budgets, as permissões, os retries, os gates e a promoção do
case pertencem ao pipeline determinístico. Uma chamada de modelo recebe tarefa estreita, evidência
governada, ferramentas permitidas e schema fechado. Sua saída passa por validação antes de persistir.

### 11.3 Templates fazem parte da vertical

Teaser, memorando, term sheet, modelo financeiro e índice da sala de dados são contratos do produto,
não acabamento editorial. A skill que produz um material referencia a versão exata do template e
só pode ser promovida junto com ele. Alteração de seção, cláusula, cálculo ou regra editorial muda o
manifesto e exige reavaliação dos casos dependentes.

### 11.4 Maturidade progressiva

Um procedimento nasce `draft` com seis componentes mínimos: objetivo e produto, procedimento,
saída estruturada, ligação a evidência, testes, versão e responsável. Torna-se `candidate` quando
possui pré-requisitos, decisões, red flags, condições de interrupção e integração vertical. Somente
se torna `production` após aprovação, templates compatíveis, gold cases, variantes adversariais,
schemas, rastreabilidade e quality gates aprovados.

### 11.5 Proibições explícitas

- não executar skill cuja hash não corresponda ao procedimento aprovado;
- não usar playbook, precedente ou referência de mercado como evidência do case;
- não permitir handoff livre entre modelos;
- não deixar modelo escolher sozinho a próxima etapa ou promover o case;
- não publicar material sem template, fingerprint, autorização e auditoria vigentes;
- não migrar aprovação humana ou de QC para uma nova versão material;
- não chamar procedimento `candidate` de capacidade de produção.
