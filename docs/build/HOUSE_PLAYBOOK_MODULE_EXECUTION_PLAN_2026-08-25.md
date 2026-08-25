# Plano de execução modular do House Playbook

Data: 25/08/2026
Fonte canônica: `packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md`
Objetivo: transformar 270 entradas de conhecimento em componentes verificáveis, sem converter o sistema numa sociedade de agentes nem promover opinião editorial como capacidade institucional.

## 1. Regra de arquitetura

O House Playbook é a fonte de verdade operacional. Uma skill é uma compilação executável de um ou
mais procedimentos, nunca uma segunda base de conhecimento. A execução pertence ao pipeline
determinístico. Os seis papéis são namespaces de responsabilidade e controle, não agentes
autônomos conversando entre si.

Cada procedimento compilado precisa declarar:

1. IDs canônicos do House Playbook;
2. autoridade de cada regra: lei, definição, política da casa, mercado ou heurística;
3. reference-data keys para qualquer número que possa envelhecer;
4. inputs e outputs em schemas fechados;
5. passos determinísticos, uso estreito de modelo e julgamento humano;
6. evidência, cálculo e versão usados;
7. testes unitários, gold, adversariais e de integração;
8. owner e revisor independente;
9. fingerprint exato da versão acreditada.

Nenhum procedimento pode ser promovido em lote. A promoção é individual e depende da versão
exata, dos seus predecessores em produção, dos dados de referência vigentes e dos casos que
provam seu comportamento.

## 2. Tipos de componentes executáveis

| Tipo | Execução correta | Uso de modelo |
|---|---|---|
| Estado e workflow | state machine e transições explícitas | nenhum |
| Extração | proposta em schema, seguida de verificação no documento | estreito |
| Conciliação | regras, hierarquia, identidade e exceção em código | nenhum |
| Cálculo | função decimal pura com trace | nenhum |
| Lente analítica | facts e cálculos governados para claims estruturados | estreito |
| Regra de decisão | predicate determinístico e reason code | nenhum |
| Estruturação | gerador de alternativas mais constraints e cálculos | modelo apenas na explicação |
| Referência de mercado | registro com fonte, data, owner, validade e confiança | nenhum |
| Template | compilador de campos e claims governados | modelo apenas na narrativa autorizada |
| Red flag | detector, severidade, falso positivo e tratamento | combinação explícita |
| Linguagem e conduta | lint, policy gate e disclosure gate | auditoria semântica estreita |

## 3. Contrato transversal de dados

Todo objeto econômico precisa carregar, quando aplicável:

- case, organização e tenant;
- entidade legal e perímetro econômico;
- período, data de referência e frequência;
- moeda, escala, sinal e unidade;
- classe da informação: histórico, posição atual, projeção, contrato, mercado ou julgamento;
- origem, versão, hash, âncora e quote;
- estado: declarado, extraído, confirmado, calculado, conflitante, ausente ou não aplicável;
- confiança do mecanismo, nunca confiança retórica;
- procedimento, versão, reference data e template consumidores;
- fingerprint para invalidação downstream.

Quando um input material muda, todos os cálculos, claims, estruturas, materiais, matches e
autorizações dependentes ficam stale. Nenhum componente decide sozinho ignorar a mudança.

## 4. M0, Intake e pedido de informação

### Missão

Transformar uma necessidade narrada pelo cliente numa sessão guiada, com o menor esforço que
desbloqueia o próximo julgamento. O cliente envia o que já possui. O sistema lê primeiro e pergunta
depois.

### Componentes

1. `capital_need_frame`: objetivo econômico, montante declarado, timing, consequência da não
   execução, usos e preferências.
2. `archetype_router`: growth, giro, aquisição, refinanciamento, equipamentos, venture debt,
   recebíveis ou combinação.
3. `evidence_coverage`: cobertura por requisito, entidade, período e força da evidência.
4. `information_ladder`: mínimo, alvo, ideal, diligência e closing.
5. `next_best_request`: no máximo o lote vigente, com impacto, motivo, substitutos e ação.
6. `intake_interaction`: pergunta em linguagem simples, upload drag and drop, resposta opcional e
   confirmação curta.
7. `early_route_checks`: autorização, objetivo ambíguo, operação de liquidez disfarçada e rota
   juridicamente impossível.

### Saídas

- `CapitalNeedFrame`;
- `InformationCoverage`;
- `RequestRoadmap`;
- `ActiveRequestBatch`;
- `IntakeDecisionLog`.

### O modelo pode

- resumir resposta aberta;
- propor classificação de documento;
- explicar por que uma informação importa com texto controlado.

### O modelo não pode

- inventar montante, prazo ou instrumento;
- pedir uma lista genérica inteira;
- transformar material de closing em requisito de abertura;
- estimar silenciosamente informação que muda capacidade ou estrutura.

### Gold obrigatório

Sala limpa, sala desorganizada, empresa com um único documento, grupo multi-entidade, assessor com
vários clientes, pedido de liquidez descrito como capex e um caso em que o documento recebido elimina
quatro perguntas futuras.

### Estado medido

`credit-playbook/sufficiency`, `client-requests`, intake web e gateway documental formam uma base
parcial. Falta consolidar um único state contract, substituir decisões de tela por eventos de
domínio e provar que a lista se adapta após cada upload.

## 5. M1, Empresa e setor

### Missão

Explicar como o negócio produz receita, margem e caixa, quais dependências podem quebrar essa
produção e por que a necessidade existe agora. A lente setorial especializa o método, sem substituir
a análise básica comum.

### Núcleo comum

- modelo de negócio e formação de preço;
- unidade econômica e drivers de volume;
- clientes, fornecedores, canais e concentração;
- capacidade instalada, utilização e gargalos;
- grupo societário, partes relacionadas e perímetro;
- governança de fato, sucessão e pessoas-chave;
- histórico de capital, estratégia e motivo econômico do pedido;
- eventos legais, regulatórios e operacionais materiais.

### Contrato de cada lente setorial

Cada uma das dez lentes precisa registrar:

1. métricas canônicas e fórmulas;
2. fontes mínimas e substitutas;
3. sazonalidade e período correto de comparação;
4. checks e identidades setoriais;
5. sinais de qualidade e de quebra;
6. perguntas internas derivadas de gaps;
7. estresses obrigatórios;
8. claims permitidos e proibidos;
9. campos usados em estrutura, memo e matching;
10. dados de referência com data e validade.

### Exemplos de especialização

- varejo: SSS, maturação de loja, margem por canal, aluguel, estoque, ruptura e capital de giro por
  abertura;
- agro: produção, produtividade, preço, hedge, ciclo, armazenagem, barter, Funrural, contraparte e
  lastro;
- saúde: ocupação, ticket, mix pagador, glosa, prazo de recebimento, médicos-chave e licenças;
- energia: PPA, exposição spot, geração, disponibilidade, GSF, curtailment e contraparte;
- incorporação: VGV, vendas, distratos, custo a incorrer, recebíveis, estoque e patrimônio separado;
- software recorrente: ARR, churn, NRR, CAC, payback, gross margin, concentração e runway.

### Gold obrigatório

Um caso por lente realmente utilizada e dois cross-sector: empresa diversificada e mudança de mix.
O gabarito deve provar não apenas métricas, mas a consequência correta em caixa, downside,
estrutura e narrativa.

### Estado medido

O repo possui campos, briefs e alguma análise de crédito. Não há ainda um contrato completo por
lente setorial, nem reference-data registry populado. O módulo permanece parcial.

## 6. M2, Qualidade dos números e spreading

### Missão

Produzir demonstrações comparáveis e reconciliadas, preservando o reportado e separando cada
reclassificação, ajuste e cenário. Este é um dos dois módulos mais importantes para credibilidade.

### Schemas obrigatórios

- `AccountingLine` com conta original e linha canônica;
- `FinancialStatementView` por entidade e período;
- `NormalizationBridge` com proposto, aceito, rejeitado e rationale;
- `CashConversionBridge`;
- `WorkingCapitalBridge` por conta;
- `MaintenanceCapexBridge`;
- `ProjectedStatementSet` com premissas;
- `FinancialIdentityCheck`;
- `ReconciliationException`.

### Cálculos mínimos

1. receita, margem bruta, EBITDA reportado e ajustado;
2. ajustes de EBITDA aceitos e rejeitados;
3. imposto caixa;
4. variação de capital de giro por conta;
5. capex de manutenção e expansão separados;
6. CFADS com ponte completa;
7. conversão EBITDA para caixa;
8. balanço e fluxo de caixa fechando;
9. histórico, LTM, posição atual, base e downside;
10. variações por preço, volume, mix e perímetro quando suportadas.

### Regras críticas

- auditado só governa quando período e perímetro são comparáveis;
- gerencial não desaparece quando perde, permanece como conflito ou bridge;
- depreciação não é piso universal de capex de manutenção;
- intermediário não é anualizado sem método explícito;
- valor zero, ausente e não aplicável são estados diferentes;
- tolerância depende de moeda, escala, materialidade e identidade.

### Gold obrigatório

Auditado limpo, ERP conflitante, sazonal, multi-moeda, multi-entidade, POC, EBITDA ajustado
agressivo, capex de manutenção subestimado e projeção que não fecha com caixa.

### Estado medido

`reconciliation` preserva facts, conflitos, gaps e alguns cálculos. `financial-core` possui apenas
funções básicas de EBITDA, leverage, DSCR, haircut, capacidade e all-in simplificado. Faltam as
pontes e identidades acima. O módulo está parcialmente implementado e não atende ainda ao padrão
institucional completo.

## 7. M3, Foto real da dívida

### Missão

Reconstruir todas as obrigações financeiras e quase financeiras em múltiplas visões reconciliadas,
com vencimentos, custo, garantias, covenants, prioridade e contingência.

### Ledger mínimo por instrumento

- devedor e credor;
- instrumento e contrato;
- principal, juros acumulados, PIK e indexação;
- moeda e hedge;
- emissão, desembolso, vencimento e amortização;
- custo caixa, fee, custo amortizado e all-in;
- garantia, titular, valor, ônus e prioridade;
- covenant, definição, teste, headroom, cura e cross-default;
- recourse, coobrigação, recompra e risco retido;
- fonte, versão e reconciliação contábil.

### Visões obrigatórias

1. dívida financeira bruta e líquida;
2. dívida por definição de covenant;
3. obrigações ajustadas para capacidade de pagamento;
4. compromissos e quase dívida;
5. contingências e exposições fora de balanço;
6. visão por entidade, credor, garantia, moeda e vencimento;
7. visão específica da estrutura ou comprador em análise.

### Bridges e testes

- saldo inicial até saldo atual;
- dívida média até despesa financeira detalhada;
- mapa de dívida até balanço, notas, razão e contratos;
- maturity wall e serviço de 12 meses;
- CDI, inflação, câmbio e não rolagem;
- cascata de cross-default;
- compatibilidade dia-um da nova estrutura.

### Gold obrigatório

Risco sacado oculto, cessão com recompra, carteira com first loss, IFRS 16, mútuo relacionado,
cross-default, holding e opco, dívida em moeda estrangeira e mapa incompleto.

### Estado medido

Há fatos reconciliados e cálculos parciais. Ainda não existe o debt ledger completo nem as múltiplas
visões governadas. Este módulo não pode ser considerado fechado.

## 8. M4, Operação e sources and uses

### Missão

Traduzir o pedido em necessidade calculada, separar cada uso, dimensionar custos, contingência,
giro e dívida existente e mostrar o efeito pró-forma por entidade e data.

### Produtos

- pedido declarado e preferências;
- uses detalhados com fonte, timing e owner;
- sources disponíveis e condicionais;
- necessidade líquida calculada;
- cronograma de desembolso;
- capex mais giro incremental;
- ponte e take-out, quando aplicáveis;
- pró-forma de dívida, caixa, alavancagem, cobertura e covenant;
- alternativas de volume e tranches.

### Identidades

- sources = uses em moeda, escala e data;
- project cost = capex, gastos, impostos, fee, contingência e giro elegíveis;
- dívida pró-forma = dívida atual + captações + efeitos menos liquidações;
- caixa pró-forma reconhece usos, colchão e restrições;
- cada tranche possui marco objetivo e consequência se o marco não ocorrer.

### Gold obrigatório

Capex com giro omitido, pedido acima da capacidade, pedido abaixo do necessário, uso misto,
refinanciamento parcial, ponte com take-out e desembolso por marco.

### Estado medido

`case-engine`, `credit-analysis` e `deal-structure` já carregam partes da operação e do pró-forma.
Falta um schema único de sources and uses com identidade e trace em todos os consumidores.

## 9. M5, Estruturação

### Missão

Gerar alternativas indicativas que resolvam a necessidade dentro de capacidade, elegibilidade,
fluxo, garantia e mercado. A Offroad propõe e documenta alternativas. Ela não aprova crédito,
compromete capital nem substitui diligência jurídica.

### Ordem de decisão

1. necessidade e uses;
2. capacidade por fluxo;
3. capacidade por garantia;
4. elegibilidade jurídica e operacional;
5. capacidade de mercado;
6. menor limite como envelope;
7. instrumento de obrigação, mecanismo, veículo e comprador separados;
8. prazo, carência e amortização contra base e downside;
9. pacote de garantia com mecânica;
10. covenants definidos e calculados;
11. condições, gaps e riscos de execução;
12. alternativas e ordem de ajuste quando não fecha.

### Garantias

Cada tipo precisa declarar proprietário, elegibilidade, valor, data, laudo, ônus, prioridade,
haircut, cobertura, mecanismo de perfeição, conta ou domicílio, monitoramento, gatilho e risco de
execução. A análise econômica é separada de confirmação jurídica e registral.

### Covenants

Cada covenant precisa declarar definição completa, numerador, denominador, perímetro, tratamento
de IFRS 16 e ajustes, frequência, teste, limite, headroom base e downside, cura, waiver, reporting e
cross-default. Covenant sem cálculo não entra no term sheet.

### Taxonomia obrigatória

Separar necessidade, fonte de pagamento, ativo, instrumento de obrigação, valor mobiliário
distribuído, mecanismo, veículo, tipo de provedor e enhancement. FIDC é veículo; carteira é ativo;
cessão é mecanismo; cota é valor mobiliário; gestor é participante.

### Gold obrigatório

Cessão com trava, imóvel, estoque, equipamento, conta reserva, subordinação estrutural,
intercreditor, covenant mal definido, garantia insuficiente e alternativa que só fecha após ajuste.

### Estado medido

O repo possui `deal-structure`, `instrument-catalogue`, taxonomia ortogonal e componentes de
capacidade. Parte das telas e compatibilidades ainda usa IDs comerciais legados, inclusive `fidc`
como atalho. A rota econômica nova é correta, mas a migração precisa eliminar inferências do ID
legado e bloquear número de política ainda não aprovado.

## 10. M6, Pricing e referências

### Missão

Produzir faixa indicativa comparável, datada e explicável, ou declarar honestamente que não existe
referência confiável.

### Registro de observação

- transação ou sondagem;
- instrumento, estrutura e indexador;
- data e status: sondagem, indicação, termo ou fechado;
- ticket, prazo, amortização e garantia;
- perfil de risco e métricas;
- taxa, fee, OID, warrant, custo de hedge e all-in;
- fonte, owner, confidencialidade e validade;
- comparabilidade e ajustes aplicados.

### Motor

1. normalizar indexador e all-in;
2. selecionar comps elegíveis;
3. ajustar prazo, tamanho, liquidez, garantia e regime;
4. declarar amostra, recência e dispersão;
5. produzir faixa e limitações;
6. abstain quando a amostra não suporta a inferência.

### Gold obrigatório

Comp bom, comp enganoso, amostra antiga, choque de regime, estrutura com warrant, fee relevante e
mercado sem observação suficiente.

### Estado medido

`market-reference` contém uma grade estática declarada como prática de mesa. Ela pode servir como
fixture, não como alegação de mercado atual. O novo registry marca curvas como
`required_missing` até existir fonte, data, owner e validade.

## 11. M7, Materiais institucionais

### Missão

Compilar teaser, credit memo, term sheet indicativo, Q&A, modelo e data room a partir da mesma base
governada, sem redigitar número nem introduzir fato novo.

### Template contract

Cada campo e seção declara:

- finalidade e audiência;
- schema de input;
- fontes permitidas;
- regra de ausência;
- claim types permitidos;
- regra editorial PT e EN;
- validações numéricas e semânticas;
- bloqueios de liberação;
- dependências e fingerprint;
- autorização e política de identidade.

### Credit memo

As doze seções precisam consumir claims governados: termos-chave, sumário, operação, companhia,
histórico, posição atual, estrutura de capital, trajetória, projeções, riscos e tratamento,
sensibilidades, pontos abertos e base de preparação. Risco aparece antes da história promocional.

### Term sheet indicativo

Cada cláusula carrega valor, basis, fonte, estado e definição. Garantia ainda não constituída,
pricing indicativo, diligência futura e decisão do financiador permanecem qualificados.

### Consistência

- memo, teaser, term sheet, modelo e data room usam a mesma versão econômica;
- número divergente bloqueia o pacote;
- PT e EN preservam identidade econômica;
- mudança material deixa outputs stale;
- QC aprova consistência e liberação da versão, não crédito.

### Gold obrigatório

Cada template em PT e EN, anonimização, número divergente, claim sem suporte, material stale,
metadata identificável e ponto aberto material.

### Estado medido

Há quatro templates candidatos, compilador de materiais, claims auditados e exportação. O credit
memo já possui estrutura relevante, mas ainda contém parâmetros fixos e seções derivadas de
componentes parciais. Nenhum template deve ir a produção antes do gold visual, numérico e
semântico seção a seção.

## 12. M8, Mercado e distribuição

### Missão

Manter inteligência de mandato e identificar quem pode avaliar a oportunidade, por que cabe e qual
pessoa cobre a estratégia. A execução atual termina na introdução qualificada autorizada.

### Modelo de dados

- instituição;
- veículo;
- mandato e estratégia;
- ticket, setor, geografia, instrumento, mecanismo, prazo, retorno, garantia e risco;
- critérios duros e preferências;
- capacidade ou estado ativo;
- contato, função e cobertura;
- fonte declarada, observação comportamental e divergência;
- owner, confiança, data, validade e próxima confirmação.

### Matching

Filtros duros são binários e explicáveis. Ranking só ocorre depois deles. Mandato desconhecido não
significa irrestrito. Dado stale reduz confiança ou exige confirmação. Relacionamento nunca supera
incompatibilidade. Não há percentual fictício de match.

### Fronteira

`MK-15` a `MK-18` cobrem autorização, material, contato e log da introdução. NDA, book, alocação,
negociação, fechamento e funding são referência pós-introdução, não atividades atribuídas hoje à
plataforma.

### Gold obrigatório

Mandato aderente, expirado, divergente, filtro duro, contato errado, veículo errado, recusa
estruturada e introdução autorizada com fingerprint exato.

### Estado medido

`fund-mandate`, `matching-core`, `investor-base` e sounding já existem. A taxonomia e a
proveniência são boas bases. Ainda coexistem dois modelos de mandato e o score legado numérico.
A promoção exige convergência para hard filters mais razões qualitativas, sem percentual externo.

## 13. M9, Red flags e declínio

### Missão

Detectar sinais materiais, explicar a evidência, controlar falsos positivos e decidir se o case
pode ser apresentado, precisa de remediação ou deve ser declinado pela Offroad.

### Contrato de cada flag

- id e categoria;
- detector e inputs;
- evidência mínima;
- severidade e materialidade;
- falsos positivos conhecidos;
- perguntas de confirmação;
- efeito em capacidade, estrutura, material e matching;
- condição de bloqueio;
- tratamento e caminho de volta;
- owner e versão.

Flags compostas precisam de regras explícitas. Um modelo pode sugerir uma relação para revisão,
mas não elevar severidade sozinho. Declínio é decisão de aceitar ou continuar o mandato da
Offroad, não parecer de crédito sobre o emissor.

### Gold obrigatório

Flag verdadeiro, falso positivo, combinação de flags, integridade, parte relacionada, auditoria,
mudança de política contábil, decline e remediação bem-sucedida.

### Estado medido

Existem exceptions, gaps e regras em múltiplos pacotes. Falta um registry único de flags com
severidade, false-positive tests e roteamento ao procedimento responsável.

## 14. M10, Linguagem e conduta

### Missão

Garantir que todo output diga apenas o que as evidências suportam, preserve confidencialidade,
separe vozes e respeite a fronteira de assessoria.

### Controles

- claim com fonte ou calculation trace;
- fato, cálculo, premissa, julgamento e referência de mercado separados;
- adjetivo material exige número ou evidência;
- promessa de funding, aprovação ou underwriting proibida;
- surpresa de diligência registrada como finding, nunca ocultada;
- conflito e autorização rastreados;
- tenant e destinatário verificados;
- PT e EN semanticamente equivalentes;
- material e comunicação com fingerprint e versão.

### Gold obrigatório

Claim sem fonte, número certo com significado errado, adjetivo vazio, promessa de funding,
vazamento entre cases, conflito, destinatário não autorizado e divergência bilíngue.

### Estado medido

`case-understanding` possui claim registry, semantic audit e manifestos. Os validadores ainda não
cobriam toda a linguagem proibida, todas as divulgações nem as comunicações de mercado. Em
25/08/2026, `LC-01` a `LC-13` foram compilados como candidates individuais e o motor
`conduct_policy` passou a produzir findings determinísticos. `case-materials` anexa o audit em
shadow a cada artefato. O resultado mediu lacunas reais de suporte em campos do term sheet e Q&A e
drift econômico PT/EN. O módulo continua candidate até esses débitos do M7 serem corrigidos e cada
regra receber gold, adversarial e revisão independente da versão exata.

## 15. Ondas de execução

### Onda A, fundação e bloqueios

- fonte canônica catalogada;
- lineage dos 20 procedimentos da vertical growth-capex;
- reference-data registry;
- fingerprint do House Playbook e do registry no manifest;
- promotion gate individual;
- fronteira pós-introdução explicitada.

### Onda B, verdade financeira

- M2 completo;
- M3 completo;
- integração com reconciliation e financial-core;
- gold clean, dirty, multi-entity e hidden debt.

### Onda C, operação e estrutura

- M4 completo;
- M5 completo;
- dados jurídicos e de mercado vigentes;
- gold de expansão, refi, aquisição, garantia e caso negativo.

### Onda D, produto institucional

- M7 template por template;
- QC numérico, semântico e visual;
- PT e EN;
- stale propagation e autorização.

### Onda E, mercado

- um único modelo de mandato;
- M6 e M8 com dados vigentes;
- matching explicável;
- introdução qualificada e log.

### Onda F, amplitude

- lentes M1 adicionais;
- vertical recebíveis exaurida sem confundir carteira e FIDC;
- venture debt, agro, imobiliário e multi-entidade;
- feedback de recusa e surpresa alimentando a fonte canônica.

## 16. Gate de promoção institucional

Um procedimento só alcança `production` quando:

1. o contrato canônico está completo;
2. todos os predecessores já estão em produção;
3. nenhum reference-data key está ausente ou expirado;
4. unit e integration gates passam;
5. pelo menos um gold e um adversarial da versão passam;
6. templates associados passam QC, quando aplicável;
7. revisão legal vigente passa, quando aplicável;
8. revisão independente aprova o fingerprint exato;
9. o manifest registra fonte, procedure registry, reference data, template e modelos;
10. a versão é promovida individualmente.

Falha em qualquer ponto mantém `candidate`. Isso não é burocracia: é a diferença entre um sistema
que gera documentos e uma plataforma institucional que consegue explicar e reproduzir cada
resultado.
