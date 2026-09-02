# Offroad Capital: Constituição de Produto e Operação

Versão: 2.2 · 1 de setembro de 2026

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

A home não obriga o usuário a formular tecnicamente um problema antes de entrar. Ela abre um
composer com **“Como a Offroad pode ajudar hoje?”**. Texto livre, URL e documentos podem ser
enviados juntos. As sugestões ao redor do composer ajudam a escolher um ponto de partida, sem
transformar a entrada em formulário ou funil:

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
6. **Preparar materiais e conduzir o processo:** dentro de um projeto existente, compilar peças,
   mapear financiadores e continuar a execução.

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

A organização visual é estável: companhias, projetos e histórico na barra lateral; conversa e
composer no centro; plano, tarefas, evidências e artefatos no painel de trabalho. Sugestões de
intenção selecionam ferramentas internas, não navegam para produtos separados.

O aceite de confidencialidade ocorre uma vez por organização e versão material. Preparar um caso
privado exige direito de usar as informações, mas não comprova representação perante terceiros.
Essa autoridade só é coletada em `Introduce`, vinculada à versão dos materiais e aos destinatários
exatos.

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

### 5.1 Missão universal de dívida

A fundação não é organizada por recebíveis, FIDC ou qualquer outro instrumento. Cada trabalho
combina cinco eixos independentes antes de recomendar uma alternativa:

1. **necessidade de capital:** refinanciamento e liability management; liquidez e giro; capex e
   expansão; aquisição; project finance; ativos e equipamentos; recebíveis, estoques e contratos;
   bridge e take-out; eventos de acionista; comércio exterior e cadeia de fornecedores; capital
   flexível; special situations; ou combinação desses usos;
2. **capacidade e fonte de pagamento:** fluxo operacional, recebíveis, ativo, contrato, projeto,
   refinanciamento, venda, sponsor support ou combinação explícita;
3. **família de capital e provedores:** bancário bilateral, club ou sindicado, mercado de capitais,
   securitização, fundos e crédito privado, direitos creditórios, asset-backed, project ou
   acquisition finance, comércio exterior e agro, mezzanine ou capital híbrido e situações
   especiais;
4. **alocação de risco e reforços:** prazo, amortização, covenants, garantias, subordinação, reserva,
   cash trap, condições precedentes, intercreditor e riscos retidos por cada parte;
5. **executabilidade de mercado:** elegibilidade, ticket, mandato, timing, pricing, precedentes,
   documentação, aprovações e probabilidade explicável de execução.

Necessidade e instrumento são relações muitos-para-muitos. Uma expansão pode combinar linha
bancária, financiamento de equipamento e recebíveis; uma operação de recebíveis pode financiar
giro, capex ou aquisição. O sistema representa tranches, usos mistos, condições precedentes e
fontes de pagamento diferentes. Nenhuma sugestão da interface pode ancorar silenciosamente o
trabalho numa única família.

O mesmo modelo opera sob três regimes de evidência:

- **público:** resolve entidade, pesquisa fontes públicas vigentes, cita procedência e distingue
  fato, inferência e desconhecido;
- **privado autorizado:** lê primeiro o que foi enviado, compara com o mínimo material para a
  decisão e pergunta somente o que continua faltando;
- **híbrido:** reaproveita a base pública vigente e a reconcilia com documentos privados, sem
  misturar procedência ou permitir que informação privada de outro projeto atravesse o escopo.

Memória pública reutilizável contém matéria-prima e claims com fonte e validade, nunca a conversa
ou a inteligência privada de outro usuário. Memória de projetos anteriores só reaparece para
usuários autorizados na mesma organização, com projeto, data, versão e origem visíveis.

### 5.2 Brasil, Estados Unidos e linguagem contínua

Idioma de trabalho e jurisdição econômica são dimensões independentes. Um projeto brasileiro pode
ser conduzido e entregue em inglês; um caso americano pode ser discutido em português; uma
estrutura cross-border pode ter os dois idiomas e as duas jurisdições. Mudar o idioma nunca cria
outro projeto, outro Deal State, outro cálculo ou outra evidência.

O usuário pode alternar PT-BR e EN-US a qualquer momento. A interface, a próxima resposta, o plano
de trabalho e os materiais solicitados são projetados no idioma atual. Mensagens e documentos já
existentes permanecem no idioma em que foram produzidos. A fonte original nunca é sobrescrita:
tradução de trabalho é derivada, declara fingerprint da fonte e começa como `machine_draft`.
Material destinado a terceiro exige tradução revisada conforme o gate editorial aplicável.

O conhecimento possui camadas combináveis e versionadas:

1. **núcleo universal de dívida:** análise financeira, capacidade, estrutura de capital, risco,
   cálculo, evidência e conceitos econômicos canônicos;
2. **Brasil:** instrumentos, provedores, garantias, documentação, contabilidade, regulação e
   prática de mercado brasileiras;
3. **Estados Unidos:** instrumentos, providers, security mechanics, documentação, US GAAP,
   regulação e prática de mercado americanas;
4. **ponte Brasil–Estados Unidos:** diferenças de moeda, contabilidade, garantias, instrumentos,
   documentação, mercado e execução cross-border;
5. **depth packs:** setor, necessidade, instrumento e estrutura aplicáveis ao caso;
6. **mercado vigente:** transações, preços, termos e mandatos com data de observação e validade.

Cada registro de conhecimento declara conceito canônico, jurisdição, idioma, fonte, publisher,
tipo de fonte, data de publicação ou vigência quando houver, data de captura, `as_of_date`, versão,
status, fingerprint, confidencialidade, escopo de reutilização e classe de atualização. Conteúdo
público e conhecimento aprovado da casa podem ser reutilizados; material privado de organização
ou projeto nunca atravessa seu escopo autorizado.

Tradução linguística não constitui equivalência jurídica, contábil ou econômica. Toda ponte entre
conceitos BR e US declara relação `exact`, `functional`, `partial` ou `no_direct_equivalent`, além
de ressalvas e fontes. Uma Cédula de Crédito Bancário, por exemplo, não pode virar silenciosamente
“note”. Quando não houver equivalente direto, o termo original e sua função econômica são
explicados.

O DAG resolve jurisdição e regime de evidência ao identificar a companhia, define idioma e
audiência antes de compilar entregáveis, carrega o knowledge pack aplicável antes de pesquisar
setor e regulação, aplica filtros jurisdicionais ao universo de instrumentos e compila variantes
de materiais a partir do mesmo snapshot econômico. Trocar o idioma invalida somente projeções
linguísticas dependentes, nunca extração, conciliação, cálculos ou decisões já confirmadas.

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
