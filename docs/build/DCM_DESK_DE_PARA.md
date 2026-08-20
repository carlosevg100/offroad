# O Desk de DCM — plano de→para

**19 de agosto de 2026.** Decisão do fundador: o produto é um desk de Debt Capital Markets
completo — recebe informação crua da empresa, guia o que falta (mínimo e ideal), analisa e
concilia tudo, volta com flags e perguntas, entende a operação pretendida (montante, uso,
prazo, taxa, garantias, condições) e prepara o investor pack com qualidade institucional.
A referência de comportamento é o head de DCM de uma BlackRock/Blackstone construindo o deal.

Este documento diz **de onde estamos** (medido, não estimado), **para onde vamos** (com gate
numérico por capacidade) e **em que ordem**. Ele complementa o
[`P1_INTELLIGENCE_PLAN.md`](P1_INTELLIGENCE_PLAN.md) — que já desenha E7 (case brief,
perguntas, red flags, prontidão), E8 (financial core) e E9 (materiais) — e adiciona o que
faltava nele como item de primeira classe: **o playbook de DCM como dado validado** e o
**intake guiado**.

---

## 1. O princípio: o head de DCM não é um prompt

"Estruturado, aprende e treina" tem tradução técnica precisa neste repositório, e ela **não**
é um LLM com um prompt grande. São três camadas com papéis que não se misturam:

| Camada | O que é | Exemplos |
|---|---|---|
| **Playbook** | O conhecimento do desk como **dado versionado e validado por especialista** — nunca gerado em tempo de execução | Arquétipos de operação; checklist de informação mínima/ideal por arquétipo; focos de análise; menus de estrutura (prazo, amortização, covenants, garantias com haircuts); tolerâncias de conciliação |
| **Máquinas** | Julgamento repetível como **código determinístico, com trace e teste** | Conciliação (R1–R17), precedência por rank de evidência, spreading, ajustes de EBITDA, DSCR, envelope de capacidade, score de prontidão, compilador de claims |
| **Leitura** | O modelo, em tarefas **estreitas, com saída verificada contra a fonte** | Classificar documento, extrair campo citando âncora, redigir prosa referenciando fatos existentes (número novo é rejeitado pelo compilador) |

O modelo nunca decide precedência entre fontes, nunca calcula, nunca preenche lacuna. Quando
"o sistema analisa como eles fazem", o *como* está no playbook e nas máquinas — auditável,
testável, corrigível — e o modelo é o leitor que alimenta as duas.

**Aprender e treinar** também tem tradução concreta: (a) toda decisão de revisor humano já é
persistida (`review_state`, `reviewed_by`) e vira taxonomia de erro; (b) o harness de evals
com gold cases mede toda mudança de prompt, modelo ou ontologia **antes** de promover;
(c) cada correção recorrente vira sinônimo/campo/regra no playbook — o conhecimento
acumula em dado, não em memória de modelo; (d) deals reais (anonimizados, com permissão)
viram gold cases novos. É assim que um desk júnior vira sênior: errando uma vez só.

---

## 2. DE → PARA, por capacidade do desk

"DE" é o estado **medido em 19/08/2026** — duas execuções reais sobre o data room Rede
Horizonte (8 documentos), workflow `Measure extraction`, runs 32306812508 e 32308765792.

| # | O que o head de DCM faz | DE (medido) | PARA (gate numérico) |
|---|---|---|---|
| 1 | **Guia a empresa** no que fornecer — mínimo para começar, ideal para precificar | **Zero.** Upload livre; nada orienta, nada cobra | Checklist por arquétipo de operação; score de suficiência visível ("falta X para o mínimo"); pedidos rastreados com prazo. Gate: 3 arquétipos validados (D-013) |
| 2 | **Lê qualquer formato** que a empresa mande | **Pronto.** 36 testes sobre o data room real; âncoras estáveis; defesas contra arquivo hostil | Manter. OCR real com bbox fica na F6 |
| 3 | **Extrai com citação** — cada número aponta o lugar exato de onde saiu | Recall material **40,0%** · precisão **50,7%** · US$ 1,60–3,67/caso · 3 causas de falha identificadas | Recall material **≥ 90%** · precisão **≥ 98%** · alucinação 0 · custo ≤ teto D-012 |
| 4 | **Concilia tudo** — DF × balancete × ERP, período × período, entidade × entidade | **Zero.** Regras R1–R17 declaradas na ontologia, sem motor; exception recall 0% (0/12 no gabarito) | Motor determinístico + precedência por rank. Gate: RF-01..07 e MI-01..05 do G1 detectadas ≥ 90%, falso positivo controlado |
| 5 | **Entende a operação e os números** — montante, uso dos recursos, prazo/taxa/condições almejados, garantias | **Zero** (o contrato do case brief existe no plano E7, sem implementação) | Case brief com `claims[]`: 100% dos itens materiais com suporte; auditor rejeita número sem id |
| 6 | **Volta com flags e perguntas** para a empresa responder | Issues estáticas do fixture | Toda pergunta nasce de gap/exceção/plausibilidade; resposta em texto vira evidência rank 7 revisável; documento novo vira run incremental |
| 7 | **Analisa como o desk** — spreading, EBITDA ajustado, alavancagem pro-forma, DSCR, cobertura de garantias | `financial-core` tem as funções (125 linhas, testadas) e **nenhum consumidor**; calculations recall 0% no gabarito | Spreading completo com trace por cálculo; identidades contábeis fecham; cálculos do gabarito batem 100% |
| 8 | **Estrutura** — tamanho, tranches, tenor, amortização, covenants, pacote de garantias | **Zero** | Envelope de capacidade + estrutura proposta com justificativa citada; term sheet indicativo (F5). Nunca promete aprovação — invariante §2.7 |
| 9 | **Prepara o investor pack** institucional | **Zero** | Pacote PT/EN com identidade econômica; todo número ancorado; bloqueio automático se houver exceção crítica aberta; Evidence Auditor no caminho |
| 10 | **Aprende com cada deal** | Harness + 1 gold case sintético; nada consome as decisões de revisor | Relatório semanal de qualidade; taxonomia de erros alimentando playbook; promoção de prompt/modelo só com evals; G2/G3 de deals reais |

Honestidade sobre o que os 100% de classificação da medição significam: **nada** — o tipo de
cada documento foi fornecido de propósito para isolar a extração. Classificação real (E1)
será medida quando o worker rodar o pipeline completo.

---

## 3. As três causas medidas do 40% — e por que são consertáveis

1. **Um candidato malformado descarta o trecho inteiro.** A validação da resposta é
   tudo-ou-nada: 60 candidatos bons + 1 fora do esquema = zero aproveitado. Foi isso que
   zerou a carta do CFO e as **demonstrações financeiras auditadas** (rank 1, onde mora a
   maior parte dos 65 campos materiais) nas duas rodadas. Correção: validar candidato a
   candidato, aproveitar os válidos, contar os malformados como métrica.
2. **Âncora de planilha não confirma.** No export do ERP, 240 de 298 candidatos falharam a
   verificação de âncora — o modelo cita um id de célula que não corresponde ao texto.
   Correção: renderização de evidência por célula com o id exato ao lado do valor, e regra de
   citação específica para planilha.
3. **Trecho pequeno separa o número do contexto.** Minha correção de tamanho (60k→18k)
   piorou o recall (44,6→40,0): o cabeçalho da tabela ficou num trecho e as linhas noutro, e
   o modelo perdeu período/escala. Correção: janela por *seção estrutural* (aba, demonstração)
   com cabeçalho repetido, não por contagem de caracteres.

Nenhuma das três é "o LLM é ruim". As três são engenharia de contexto e de validação — e
todas têm número para provar quando estiverem resolvidas.

---

## 4. O que é novo neste plano (não estava no P1)

### 4.1 `packages/credit-playbook` — o conhecimento do desk como dado

Arquétipos de operação, cada um com: **informação mínima** (sem isso o desk nem abre o caso),
**informação ideal** (com isso precifica), focos de análise, riscos típicos do arquétipo,
menus de estrutura (bandas de tenor, formatos de amortização, pacote de covenants, menu de
garantias com haircuts — os haircuts já existem no `financial-core`), e perguntas-padrão.
Proposta de arquétipos iniciais: **capex de expansão** (Rede Horizonte é isso),
**refinanciamento/reperfilamento** e **capital de giro estrutural**.

Tudo versionado, com testes de consistência interna, e **validado por especialista antes de
entrar em produção (D-013)** — este pacote é a alma do "head de DCM" e eu não vou inventá-lo
sozinho. Eu preparo a proposta completa; a validação é humana.

### 4.2 Intake guiado

Na entrada, a empresa declara a operação pretendida (arquétipo + montante + uso + prazo/taxa
almejados — o "pedido" do case brief, capturado no início e não deduzido no fim). O checklist
do arquétipo vira a régua: a tela mostra suficiência ("mínimo: 5 de 7 · ideal: 5 de 12"),
o que falta, e por quê importa. Cada documento classificado pelo pipeline atualiza a régua.
Pedido de informação vira registro rastreado — o que foi pedido, quando, o que chegou.

### 4.3 O flywheel concretizado (F7 deixava de ser contínuo-abstrato)

Semanal: relatório de qualidade por gate (recall/precisão/alucinação/custo) + taxonomia das
correções humanas da semana. Mensal: proposta de mudanças de playbook/ontologia derivadas da
taxonomia, promovidas só com evals verdes. Por deal fechado: gold case novo (com permissão).

---

## 5. Sequência e gates

O caminho de produção atual (fixture por hash) segue intocado até o gate da Fase A+B —
decisão já tomada em 19/08. A troca é por feature flag por organização.

| Fase | Conteúdo | Gate de saída | Estimativa |
|---|---|---|---|
| **A — Extração ao gate** (começa agora) | As 3 correções da §3, re-medindo a cada mudança no workflow `Measure extraction` | Recall material ≥ 90% · precisão ≥ 98% · alucinação 0 · custo por caso ≤ D-012 | ~1 semana |
| **B — Conciliar e calcular** (P1 F3) | Motor R1–R17, precedência por rank, spreading, `calculation_runs` com trace, aba Financeiro | RF/MI do G1 ≥ 90% · identidades fecham · calculations 100% | 2–3 semanas |
| **C — Playbook + intake guiado** (novo; anda em paralelo com B — é dado + UI, não depende da extração) | `credit-playbook` com 3 arquétipos, captura do pedido, régua de suficiência, pedidos rastreados | Playbook validado por especialista (D-013) · E2E da jornada guiada | 2 semanas |
| **D — Entender e perguntar** (P1 F4) | Case brief com claims, perguntas/roadmap, red flags candidatos, score de prontidão | Claims materiais 100% suportados · rubric humano ≥ 4/5 | 2 semanas |
| **E — Investor pack + estrutura** (P1 F5) | Compilador estendido, templates institucionais, term sheet indicativo, Structure Lab mínimo | Identidade PT/EN · bloqueio por exceção crítica · Evidence Auditor verde | 2–3 semanas |
| **F — Contínuo** (P1 F6/F7) | OCR real, copilot do case, flywheel semanal | métricas de F6 + relatório semanal rodando | contínuo |

Total até o investor pack institucional: **~9–11 semanas** de trabalho focado, com número
verificável no fim de cada fase — nenhuma fase "parece pronta", ela **mede pronta**.

---

## 6. Decisões que só o fundador pode tomar

Nenhuma exige terminal — são decisões, respondidas aqui no chat:

1. **D-013 (crítica agora):** quem valida o playbook. Proposta: eu preparo os 3 arquétipos
   completos (checklists, focos, menus de estrutura, tolerâncias) e você revisa numa sessão
   guiada — sozinho ou com um especialista de crédito que você indicar. Sem essa validação o
   "head de DCM" é minha opinião, e minha opinião não fecha deal.
2. **Arquétipos iniciais:** confirmar os 3 propostos (expansão, refinanciamento, capital de
   giro) ou trocar.
3. **D-012:** teto de custo por caso. Proposta: US$ 15/caso, US$ 500/mês, alerta em 70%.
4. **D-014:** política de auto-aceite. Proposta: fato **material** nunca é auto-aceito —
   revisor humano sempre; supporting com âncora verificada e confiança ≥ 0,95 entra
   pré-aceito e reversível.
5. **Gold cases reais:** quando houver 1–2 deals reais (mesmo antigos, anonimizados), eles
   valem mais que qualquer sintético para calibrar o desk.

---

## 7. O que começa imediatamente

Fase A, correção 1 (validação por candidato) — é a que tira as demonstrações financeiras
auditadas do zero. Cada correção é um PR com a re-medição no corpo: o número antes, o número
depois. Este documento é atualizado com a tabela de medições a cada rodada.

| Data | Run | Recall material | Precisão | Custo | Mudança |
|---|---|---|---|---|---|
| 19/08 | 32306812508 | 44,6% | 52,3% | US$ 1,60 | primeira medição real |
| 19/08 | 32308765792 | 40,0% | 50,7% | US$ 3,67 | trechos de 18k — piorou, revertido |
| 19/08 | 32315077187 | 60,0% | 55,8% | US$ 4,21 | correção 1: candidato julgado um a um; DFs auditadas 0 → 58 candidatos |
| 19/08 | 32320129899 | 64,6% | 60,5% | US$ 2,09 | correções 2–3: canonicalização pela ontologia (CNPJ, UF, fontes/usos, centavos) + cabeçalho de tabela junto das linhas, janelas por estrutura |
| 20/08 | 32322051560 | 66,1% | 60,3% | US$ 1,91 | correção 4: quote da célula pode morar na linha — DFs auditadas 61 → 0 âncoras não confirmadas |
| 20/08 | 32324397398 | **75,4%** | **79,0%** | US$ 2,47 | correção 5: tuplas {i} casadas por conteúdo (índice é apresentação, não fato) + enumeração pt em listas |

O que resta entre 75/79 e o gate 90/98, pelos dumps: `gross_debt` por período (o mesmo número
existe como `debt.total_gross` — mapeamento entre caminhos, trabalho da Fase B), campos
calculados de alavancagem (Fase B, `financial-core`), timeline do projeto (variância de
extração), e textos com rótulo do gabarito diferente do texto do documento (revisão do gold
set, não do extrator).
