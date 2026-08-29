# Construção profunda da leitura à distribuição

> Data: 29 de agosto de 2026.
>
> Este documento responde a uma pergunta específica: quanto do fluxo canônico já
> é método executável e comprovado, e quanto ainda é doutrina, contrato genérico
> ou cobertura nominal?

## 1. Veredito

O alerta recebido é correto no nível do produto. Intake e recebimento são as
partes mais visíveis e utilizáveis da jornada. Da leitura à distribuição existem
bons componentes internos, especialmente em conciliação, dívida, recebíveis,
governança de claims e gates de introdução. Porém, a maior parte ainda não forma
uma capacidade institucional completa, conectada e comprovada.

O problema não é a quantidade de texto ou de IDs. O repositório contém:

- 270 entradas no House Playbook;
- 224 procedimentos compilados;
- 0 procedimentos em maturidade `production`; e
- 224 procedimentos em maturidade `candidate`.

As 270 entradas têm, em média, entre 62 e 125 palavras por procedimento conforme
o módulo. Isso é suficiente para uma doutrina ou especificação inicial, mas não
para instruir e avaliar todas as decisões de uma mesa institucional.

## 2. Por que a cobertura atual superestima a profundidade

### 2.1 Procedimento compilado não é executor

Os registries de procedimentos são compilados e seu hash entra no manifesto do
case. O runtime, porém, não executa esses procedimentos como unidades. Módulos
paralelos constroem truth sets e depois atribuem cobertura aos IDs do playbook.

Consequência: um procedimento pode aparecer como coberto sem que o método
descrito tenha sido efetivamente executado passo a passo.

### 2.2 Muitos candidatos têm formato gerado

Grandes grupos compartilham a mesma estrutura genérica de validação, execução e
gate. Seus testes também seguem frases padrão como "caso limpo produz o produto"
e "ausência ou conflito não vira estimativa". Isso é uma boa proteção de base,
mas não é um gold case específico com resposta esperada, tolerância, falsos
positivos e prova de downstream.

### 2.3 Contagem não prova execução

Exemplos medidos no código:

- `financial-truth.ts` declara 18 procedimentos, mas Q-05, Q-07, Q-15 e Q-16
  possuem `outputCount: 0` fixo e retornam apenas o insumo faltante;
- `material-truth.ts` replica o mesmo estado do artefato `credit_memo` para 13
  procedimentos MA, sem verificar individualmente cada seção;
- `market-truth.ts` aplica a mesma classificação genérica aos dez tipos de
  comprador e declara `buyerTypeClassification: not_available_in_current_mandate_contract`;
- partes da estruturação usam cláusulas genéricas construídas a partir de prefixos
  e permanecem parciais sem uma alternativa completa comparável; e
- testes paramétricos verificam principalmente presença, ordem e status dos IDs,
  não a qualidade institucional de cada resultado.

### 2.4 Nenhuma promoção chegou a production

Isso é coerente com a realidade. Os contratos foram criados, mas ainda não há
evidência suficiente para afirmar que qualquer módulo inteiro atingiu o padrão de
produção.

## 3. Profundidade real por capacidade

| Capacidade | Doutrina | Executor | Persistência | Produto | Gold cases | Veredito |
|---|---|---|---|---|---|---|
| Intake guiado | Forte | Parcial | Sim | Parcialmente live | Parciais | Mais avançado, ainda não production |
| Ingestão e procedência | Forte | Forte em formatos suportados | Sim | Parcialmente live | Bons para fixtures e recebíveis | Kernel real |
| Entendimento da companhia e setor | Médio | Parcial | Fragmentada | Não consolidado | Insuficientes por lente | Gap crítico |
| Spreading e qualidade dos números | Médio | Parcial relevante | Em truth sets | Superfície técnica | Alguns testes determinísticos | Núcleo promissor, incompleto |
| Dívida e obrigações | Médio | Parcial relevante | Em truth sets | Superfície técnica | Alguns casos adversariais | Núcleo promissor, incompleto |
| Findings e confirmação com cliente | Forte como princípio | Fragmentado | Não como objeto canônico | Incompleto | Insuficientes | Gap crítico |
| Loop incremental de esclarecimentos | Médio | Vertical de recebíveis tem partes | Parcial | Incompleto | Recebíveis parcial | Gap crítico |
| Alternativas de estrutura | Médio | Parcial | Truth set interno | Sem decisão completa do cliente | Insuficientes por instrumento | Gap crítico |
| Pricing | Médio | Parcial | Truth set interno | Sem base real ampla | Insuficientes | Candidate |
| Plano específico de produção | Fraco | Não | Não | Não | Não | Ausente |
| Modelo financeiro | Médio | Há workbook técnico | Parcial | Não comprovado no caso real | Insuficientes | Esqueleto |
| Teaser, memo e term sheet | Médio | Renderização parcial | Artefatos e fingerprints | Não comprovado ponta a ponta | Insuficientes por seção | Esqueleto governado |
| QA e revisão da companhia | Médio | Gates internos | Parcial | Incompleto | Insuficientes | Gap crítico |
| Mandatos e matching | Médio | Kernel explicável | Parcial | Dados reais e fluxo incompletos | Recebíveis parcial | Candidate |
| Distribuição autorizada | Médio | Gate e registro interno | Parcial | Não comprovado ponta a ponta | Insuficientes | Esqueleto governado |

## 4. O padrão mínimo para uma capacidade real

Um procedimento deixa de ser doutrina somente quando possui todos os itens abaixo:

1. **Método canônico:** passos específicos, não intercambiáveis com outra tarefa.
2. **Contrato de entrada:** campos, entidades, períodos, unidades, hierarquia e
   estados de ausência.
3. **Executor:** função ou workflow que aplica o método e é chamado pelo rail.
4. **Contrato de saída:** resultado estruturado, exceções, decisões e evidências.
5. **Persistência:** versão, fingerprint, delta e tenant scope.
6. **Superfície do produto:** o cliente ou a mesa vê e age sobre o resultado.
7. **Dependências:** o que fica stale quando a entrada muda.
8. **Gold case:** entrada completa e saída esperada revisada campo a campo.
9. **Adversarial case:** ausência, conflito, falso positivo e caso que não para de pé.
10. **E2E:** prova de que a saída decide a próxima etapa correta.
11. **Avaliação de custo:** chamadas, tokens, cache hit e custo por objeto produzido.
12. **Aprovação institucional:** responsável nomeado e evidência de revisão.

Quantidade de procedimentos, cobertura de IDs e testes de schema não substituem
esses doze requisitos.

## 5. Estratégia de construção

Não aprofundaremos 270 procedimentos isoladamente e só depois tentaremos montar o
produto. Isso repetiria o erro atual. O trabalho será executado em fatias verticais
que atravessam método, código, estado, interface, teste e custo.

### Fatia 1: base analítica confirmada

Escopo:

- snapshot integrado de companhia, setor, operação, números, dívida, projeto e
  mercado;
- sete classes de afirmação do fluxo canônico;
- registro de findings com evidência, impacto e próxima ação;
- lotes de esclarecimento priorizados; e
- G1 e G2 determinísticos.

Primeira vertical: recebíveis. Casos horizontais de apoio: expansão e
refinanciamento.

Critério de saída:

O cliente consegue ver, corrigir e confirmar o entendimento. Uma resposta altera
somente os facts e findings dependentes. O sistema explica por que pode ou não
estruturar.

### Fatia 2: alternativas de estrutura

Escopo:

- necessidade calculada e sources and uses;
- capacidade e limites vinculantes;
- pelo menos duas alternativas quando economicamente possíveis;
- termos indicativos completos;
- impacto financeiro e downside;
- prós, contras, riscos e requisitos adicionais;
- screening anônimo de mercado; e
- decisão versionada da companhia.

Critério de saída:

Cada alternativa é reproduzível. A companhia consegue comparar, pedir ajuste e
confirmar uma direção. Alteração material reabre apenas as dependências corretas.

### Fatia 3: plano e produção dos materiais

Escopo:

- plano específico do caso;
- modelo financeiro;
- teaser;
- credit memo;
- term sheet indicativo; e
- índice e organização do data room.

Cada artefato será fechado seção a seção. Um booleano de artefato limpo não
servirá como cobertura de treze procedimentos diferentes.

Critério de saída:

Os cinco arquivos existem, abrem, reconciliam entre si e apontam para a mesma base
econômica. Ausências permanecem visíveis. Mudança de suporte invalida apenas os
blocos dependentes.

### Fatia 4: QA e aprovação

Escopo:

- auditoria numérica e semântica;
- comparação de versões;
- comentários da companhia;
- regeneração seletiva;
- aprovação por artefato e do pacote; e
- congelamento do fingerprint aprovado.

Critério de saída:

Nenhum número ou termo diverge entre materiais. A versão aprovada é imutável e
distinta de rascunhos posteriores.

### Fatia 5: matching e introdução

Escopo:

- taxonomia separando instituição, veículo, mandato, contato e observação;
- hard filters por rota;
- ranking qualitativo e explicável;
- source, owner, data e validade por critério;
- screening anônimo e shortlist identificada;
- aprovação individual de destinatários e materiais; e
- registro da introdução qualificada.

Critério de saída:

Nenhum nome entra por reputação ou inferência. O racional permite que o
financiador reconheça seu mandato. Cada envio está ligado ao destinatário,
contato, autorização e fingerprint exatos.

## 6. Matriz de aprofundamento por módulo

### M1: empresa e setor

Para cada lente setorial, especificar fontes mínimas, modelo de receita, unidade
econômica, métricas, drivers, riscos, comparáveis, perguntas, sinais de quebra,
efeito na estrutura e efeito nos materiais. Dez lentes genéricas não bastam. Cada
lente precisa de pelo menos um gold, um adversarial e um caso fora do escopo.

### M2: números

Fechar os quatro procedimentos hoje sem execução real, completar fórmulas, unidade,
perímetro, tolerância, identidades, ajustes aceitos e rejeitados. O spreading deve
produzir demonstrativos e pontes reproduzíveis, não apenas status de cobertura.

### M3: dívida

Fechar as múltiplas visões de obrigações, reconciliação de despesa financeira,
maturity wall, cross-default, garantias, covenants e liquidez. Cada contrato deve
ser rastreável até a fonte e cada visão deve declarar sua convenção.

### M4 e M5: operação e estrutura

Substituir campos genéricos por alternativas completas e comparáveis. Separar
elegibilidade jurídica, viabilidade econômica, executabilidade operacional e
aderência preliminar de mercado.

### M6: pricing

Criar base governada de referências e regras de comparabilidade. Sem amostra
suficiente, o sistema deve abster-se. Custo all-in precisa incluir fees,
reciprocidade, hedge, tributos e custos de execução quando aplicáveis.

### M7: materiais

Fechar cada seção contra um schema e um template real. O teste deve inspecionar o
conteúdo renderizado e a identidade econômica, não apenas a existência do
artefato.

### M8: mercado e distribuição

Implementar buyer type e veículo no contrato de mandato. Os dez tipos de comprador
não podem continuar recebendo a mesma cobertura genérica. Construir e validar a
base de mercado separadamente do algoritmo de matching.

### M9 e M10: flags, linguagem e conduta

Vincular cada detector aos falsos positivos, tratamento, impacto downstream e
decisão humana quando necessária. Compilar regras de linguagem como validadores
reais dos arquivos e comunicações.

## 7. Ordem imediata

1. criar o contrato executável de snapshot, afirmação, finding, gate e lote de
   esclarecimento;
2. ligar esse contrato aos facts, exceções e evidências atuais;
3. persistir versões e deltas;
4. construir a superfície de confirmação;
5. atravessar o gold case de recebíveis;
6. só então aprofundar a primeira alternativa de estrutura; e
7. promover individualmente apenas capacidades que cumprirem o padrão da seção 4.

O sistema não será declarado bulletproof por quantidade de testes ou de IDs. A
barra será a execução comprovada de cada decisão real do fluxo canônico.
