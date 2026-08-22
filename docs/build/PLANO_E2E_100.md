# Offroad: plano de ponta a ponta para o produto que um head de DCM assina

Data: 21/08/2026. Autor: agente, sob a barra definida pelo Carlos ("Goldman vai querer usar").
Nada aqui é aspiração sem medida: cada etapa tem o que existe hoje (medido), o que falta para a
barra, o trabalho, e o teste que prova que chegou.

## 0. A barra

Um head de DCM de banco de primeira linha julga uma plataforma de dívida privada por cinco
coisas, nesta ordem:

1. **Ela lê a sala de dados certa?** Todo número citado vem de um documento, na página certa,
   na escala certa, no período certo. Um número errado em um memo mata a credibilidade inteira.
2. **Ela pensa como a mesa?** Estoque na mesma régua, alavancagem pré e pós, covenant testado,
   parede de vencimentos contra caixa, ciclo de caixa, garantia livre, e a trajetória até o
   covenant do novo papel. Sem isso é brochura.
3. **Ela estrutura a operação certa?** Instrumento, prazo, carência, amortização, garantia,
   covenants e preço compatíveis com quem compra aquele risco no Brasil hoje.
4. **Os materiais são circuláveis?** Teaser, memorando, term sheet, modelo e Q&A no padrão que
   um fundo recebe de um banco, sem uma frase que não se sustente.
5. **A execução fecha?** Lista de investidores certa, sondagem, book, diligência, CPs, closing,
   monitoramento. O produto termina no desembolso, não no PDF.

## 1. Onde o produto está (medido em 21/08/2026)

| Etapa | Estado | Medida |
|---|---|---|
| Intake guiado (operação, checklist por tempo, mapa de entrega, drag-and-drop) | existe | checklist por arquétipo, 6 arquétipos incl. venture debt |
| Classificação de documentos | existe, boa | 100% tipo/classe em 3 casos (fakeco 9/9, camil 3/3, nimbus 6/6) |
| Extração de campos | existe, desigual | recall material: nimbus **92%**, fakeco 80%, camil **39%** (companhia aberta, 200 págs); alucinação 0% nos três |
| Conciliação entre documentos | existe, cega | recall de exceções **0%** nos evals (contradições declaradas não são apontadas) |
| OCR (documento fotografado) | existe, não medido | sem número |
| Mesa de crédito (bateria + trajetória + runway) | existe, forte | 58 testes; lê Aurora, Camil e Nimbus com leituras corretas |
| Capacidade e term sheet indicativo | existe | 3 paredes (caixa, garantia, mercado) + ARR/rodada para venture |
| Materiais (teaser, perfil, pacote, memo, term sheet) | existe | compilados dos números, auditados contra fatos; visualmente revisados |
| Modelo financeiro (.xlsx com fórmulas) | existe | não comparado com modelo de banco |
| Mercado (investidores, sondagem, book, preço) | **não existe** | zero |
| Execução (diligência, documentação, CPs, closing) | só lista de CPs no term sheet | zero fluxo |
| Pós-closing (covenants, reporting) | **não existe** | zero |
| Observabilidade, segurança, multi-tenant, RLS | existe, provado | RLS suite, definer privado, worker sem service key, Sentry/PostHog |

Conclusão honesta: o produto hoje vai do upload ao term sheet indicativo com leitura e análise
de mesa quando a sala é organizada e pequena; ainda falha em filing grande (companhia aberta,
200 páginas) e não vê contradição entre documentos. A barra é uma só para qualquer emissor,
da startup à multinacional: número certo, citado, na régua do comitê. Do term sheet até o
desembolso não existe.

## 2. As oito etapas de um processo de dívida, e o que falta em cada uma

### 2.1 Mandato e pedido (kickoff)
**Mesa faz:** entende a necessidade, define arquétipo, fecha lista de documentos, NDA, cronograma.
**Hoje:** operação escolhida, deal brief (6 fatos), checklist por tempo, mapa de entrega.
**Falta:**
- Cronograma da operação (marcos de 6 a 10 semanas: sala completa, memo, sondagem, book, docs, closing) visível para a empresa desde o dia 1.
- NDA e termos de uso da sala dentro do produto (aceite registrado).
- "Conversa com o cliente": as perguntas da mesa viram um questionário enviável, com resposta gravada como fato de classe `management`.
**Gate:** empresa entra e em 10 minutos sabe o que mandar, por quê, e quando a operação fecha.

### 2.2 Leitura da sala (classificar, extrair, conciliar)
**Mesa faz:** lê tudo, põe na mesma régua, acha o que não bate, pergunta.
**Hoje:** ver tabela. O buraco é companhia aberta e conciliação.
**Falta:**
- Extração em filing público a ≥ 85%: tabelas dos comentários dos diretores (R$ mn, colunas
  fev-25/fev-26), notas em prosa (covenant, emissões), DRE/balanço comparativo. Medir na Camil
  a cada mudança; adicionar 2 companhias abertas (uma industrial, uma de serviços).
- Conciliação que aponta: mesmo campo, dois documentos, valores diferentes (ARR do deck × export;
  runway da carta × extrato; receita da carta × auditado). Regra: precedência por classe de
  evidência + tolerância por campo; exceção com os dois anchors. Gate: recall de exceções ≥ 90%
  nos três casos sintéticos.
- OCR medido: caso com 3 documentos fotografados/escaneados; gate de recall ≥ 80% e zero
  auto-aceite sem âncora.
- Normalização de percentual (115 × 1,15) e de período fiscal deslocado: decidida e testada.
**Gate:** recall material ≥ 90% nos 5 casos (3 sintéticos + 2 públicos), alucinação 0, exceções ≥ 90%.

### 2.3 Análise de crédito
**Mesa faz:** bateria, trajetória, stress, rating interno, comparáveis.
**Hoje:** bateria e trajetória fortes; runway para startup; capacidade.
**Falta:**
- **Rating interno** (escala de 1 a 10 ou AAA a D) derivado de: alavancagem, cobertura de juros,
  DSCR, liquidez (caixa / principal 12m), tendência, concentração, qualidade da evidência. Com
  a régua escrita e a justificativa campo a campo. É o que todo comitê pede primeiro.
- **Stress padronizado**: queda de EBITDA 20/30%, CDI +300 bps, ciclo +15 dias, cliente top 1
  sai; tabela de sensibilidade no memo.
- **Cobertura de juros e DSCR históricos** (hoje só projetados).
- **Comparáveis**: 3 a 5 operações recentes do mesmo perfil (instrumento, prazo, spread) como
  referência de preço, mantidas como dado versionado (`packages/market`), com proveniência.
**Gate:** Carlos revisa às cegas 3 análises (Aurora, Camil, Nimbus) e aprova sem correção material.

### 2.4 Estruturação
**Mesa faz:** escolhe instrumento, desenha termos, garantias, covenants, preço indicativo.
**Hoje:** term sheet com base por termo, divergência com o pedido, covenant escalonado.
**Falta:**
- **Catálogo de instrumentos brasileiro** com elegibilidade por emissor e uso: CCB, NCE, debênture
  (476/160), CRA/CRI (lastro), FIDC, venture debt, financiamento de equipamento (FINAME/leasing),
  cada um com custo típico, prazo, tributação (IOF, isenção IR de CRA/CRI), e exigências legais
  (S.A. para debênture, lastro agro para CRA). Hoje existe o arquétipo; falta o instrumento.
- **Preço indicativo** (spread sobre CDI ou IPCA+) a partir do rating interno + comparáveis +
  garantia, com faixa e justificativa. Hoje o custo é "definido pelo investidor".
- **Pacote de garantias** desenhado a partir do inventário (alienação fiduciária, cessão
  fiduciária de recebíveis com cobertura, aval), com cobertura e haircut explícitos.
- **Covenants completos**: alavancagem, cobertura de juros, caixa mínimo, dividendos, dívida
  adicional, change of control; cada um com definição contábil e cura.
**Gate:** term sheet que um advogado de mercado de capitais lê e só marca detalhes.

### 2.5 Materiais
**Mesa faz:** teaser, memorando, modelo, Q&A, data room organizado.
**Hoje:** teaser, perfil, pacote, memo, term sheet, modelo xlsx.
**Falta:**
- Memo com rating, stress, comparáveis e preço (depende de 2.3 e 2.4).
- **Q&A de diligência pré-respondido**: as 40 perguntas que um fundo faz, com resposta citada ou
  "em aberto" para a empresa.
- **Data room de saída**: os documentos originais organizados por pasta do playbook, índice,
  e o que foi pedido e não veio.
- Exportação em PDF com fonte/paginação profissional e em DOCX editável (o banqueiro sempre edita).
**Gate:** um analista de fundo recebe o pacote e não pede nada que já estava na sala.

### 2.6 Mercado (sondagem e book)
**Mesa faz:** lista de investidores por perfil, sondagem com teaser, NDA, acesso à sala, coleta
de indicações (tamanho, prazo, preço), book, alocação.
**Hoje:** nada.
**Falta (é o produto comercial):**
- Base de investidores (fundos de crédito, family offices, bancos, FIDCs) com apetite por
  arquétipo, tíquete, prazo, setor; proveniência e atualização.
- Fluxo de sondagem: teaser enviado, NDA assinado, sala liberada, perguntas, indicação.
- Book de ofertas: indicações normalizadas na mesma régua (spread, prazo, garantia), comparação,
  alocação, term sheet final.
- Tudo com trilha de auditoria (quem viu o quê, quando).
**Gate:** uma operação simulada com 5 investidores fictícios percorre o fluxo inteiro.

### 2.7 Execução (diligência, documentação, closing)
**Mesa faz:** diligência (contábil, jurídica, garantias), documentação (escritura, CCB, cessão),
CPs, registro, desembolso.
**Hoje:** lista de CPs no term sheet; checklist de closing no playbook.
**Falta:**
- Rastreador de CPs e diligência com dono, prazo, documento, status.
- Geração das minutas base (escritura de debênture, CCB, contrato de cessão fiduciária) a partir
  do term sheet final, com os termos já preenchidos (para o advogado revisar, não redigir).
- Registro de desembolso e cronograma de pagamentos gerado (datas, PMT, saldo).
**Gate:** da alocação ao desembolso com zero planilha fora do produto.

### 2.8 Pós-closing
**Mesa faz:** monitora covenants, recebe reporting, aciona waiver, reprecifica.
**Hoje:** nada.
**Falta:** ingestão periódica (balancete trimestral), recálculo dos covenants, alerta de
folga < 10%, relatório ao investidor. É a receita recorrente do produto.
**Gate:** balancete novo entra e os covenants são testados sem intervenção.

## 3. Transversal: o que faz o produto ser de banco e não de startup

- **Evals como gate de deploy**: os 5 casos rodam em toda PR que toca extração, conciliação ou
  mesa; regressão bloqueia merge. Hoje roda à mão.
- **Revisão humana com trilha**: todo número material que entra em material tem quem aceitou,
  quando, e a âncora. Existe; falta a tela de auditoria por material.
- **Segurança**: já há RLS, definer privado, worker sem chave, push protection. Falta pentest
  externo e política de retenção/exclusão de dados do cliente.
- **Idioma**: PT/EN com economia idêntica. Existe nos materiais; falta na tela inteira.
- **Desempenho**: filing de 200 páginas em 15 min e US$ 5. Meta: 5 min e US$ 3 (paralelismo por
  documento, cache de janelas, modelo menor nas passadas por linha).

## 4. Sequência e esforço (um agente em tempo integral)

| Onda | Semanas | Entrega | Gate |
|---|---|---|---|
| A. Leitura confiável | 1 a 2 | conciliação que aponta; companhia aberta ≥ 85%; OCR medido; evals no CI | 2.2 |
| B. Análise de comitê | 2 a 3 | rating interno, stress, DSCR/cobertura históricos, comparáveis versionados | 2.3 |
| C. Estrutura e preço | 3 a 4 | catálogo de instrumentos, preço indicativo, garantias, covenants completos | 2.4 |
| D. Materiais de banco | 4 a 5 | memo completo, Q&A, data room de saída, PDF/DOCX | 2.5 |
| E. Mercado | 5 a 7 | base de investidores, sondagem, book, alocação | 2.6 |
| F. Execução e pós | 7 a 9 | CPs, minutas, desembolso, monitoramento de covenants | 2.7, 2.8 |

Onda A começa agora, pela conciliação: é o que hoje deixa passar contradição para o material.

## 5. Como o Carlos valida (sem comando de terminal)

1. A cada onda, três casos (Aurora, Camil, Nimbus) rodados de ponta a ponta e o resultado
   publicado como página: tela do case, memo, term sheet, e o diff do que mudou.
2. Revisão às cegas: o Carlos lê como head de mesa e marca cada linha que um comitê rejeitaria.
   Cada marca vira teste antes da correção.
3. O gate de cada onda só fecha com a revisão dele.

## 6. Andamento (atualizado 22/08/2026, madrugada)

| Onda | Item | Estado |
|---|---|---|
| A | Conciliação que aponta contradição (R3 ampliado, R18, R19); narrativos miram os números que reescrevem | entregue (#146, #155, #182) |
| A | Instrumentos por documento e por tabela; uma tupla por linha de planilha; identidade por emissão e série | entregue (#147, #148, #153, #177), #185 na fila |
| A | OCR: tabelas e linhas reconstruídas das palavras do Tesseract | entregue (#174, #181); fakeco-scan 59% |
| A | Casos sintéticos no gate: Nimbus 92,2% / exceções 80%; FakeCo 93,9% / exceções 100% | **gate de recall atingido**; precisão 87 a 94% (meta 98%) |
| A | Companhias abertas: Camil 53% (só instrumentos faltam), Cogna 31% | em medição (#185) |
| B | Rating interno, stress, cobertura de juros, comitê na tela e no memo | entregue (#152, #154, #157, #170) |
| B | Comparáveis de mercado versionados (`@offroad/market-reference`) | entregue (#167) |
| C | Catálogo de instrumentos, pacote de garantias, preço indicativo, covenants com definição | entregue (#158, #159, #167, #172) |
| D | Q&A de diligência (40 perguntas), memo com comitê, sala de dados de saída, Word e PDF | entregue (#162, #170, #175, #176, #179) |
| E | Base de investidores (sintética), sondagem, book, alocação, trilha; tabelas e tela | entregue (#169, #180, #183), #184 na fila |
| F | Cronograma de pagamentos e CPs com evidência (`@offroad/closing`); covenants por período e relatório (`@offroad/monitoring`) | domínio entregue (#187, #188); persistência, ingestão do balancete e telas não começadas; minutas não começadas |

Gate da Onda E (5 investidores fictícios pelo fluxo inteiro) roda como teste em `@offroad/sounding`; falta o Carlos percorrer na tela.
