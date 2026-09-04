# Caso 03: assessor com operação de recebíveis a partir de documentos dispersos

Versão 1.0, congelada em 4 de setembro de 2026. Maturidade: `specified`.
Fixture: Aurora (`packages/testing-fixtures/assets/fakeco`), companhia privada sintética com
concentração de clientes, mapa de dívida, projeções e memorial de um centro de distribuição.

```yaml
case_id: gc03-assessor-recebiveis
title: Reconstruir necessidade de capital e testar recebíveis como fonte ou garantia
real_world_trigger: >
  "Sou assessor de uma distribuidora, a Aurora. Eles querem captar para um centro de
  distribuição e têm uma carteira boa de recebíveis. Segue o que consegui juntar. Preciso saber
  se dá para estruturar em cima dos recebíveis e como."
user_function_lens: [debt_advisor, credit_analyst]
intent_envelope:
  routing_core:
    action: [levantar, extrair, reconciliar, compreender, analisar, desenhar, preparar]
    object: [companhia: Aurora (privada), carteira de recebíveis, necessidade de capital]
    desired_outcome: caso reconstruído, estrutura indicativa, materiais, capital aderente
    decision: recebíveis como fonte principal, reforço, ou outra estrutura
    audience: [assessor (imediata), financiadores (final, após autorização)]
    depth: institucional
    continuity: nova
    work_responsibility: [producer, coordinator]
  execution_context:
    evidence_regime: privada autorizada
    authority: leitura e preparação; introdução só com autorização individual por destinatário
    sponsor_instruction: o próprio assessor
    jurisdiction: BR
    currency: BRL
    freshness: balancete de julho de 2026
    language: pt-BR
expected_intent_families: [I01, I02, I03, I05, I06, I07, I08, I09, I10, I12, I17]
primary_work: [levantar, extrair e reconciliar, analisar, estratégia de capital, capital aderente]
composition: estruturação com recebíveis e preparação de materiais
required_depth_packs: [core.institutional-dcm, objective.capex-expansion, instrument.br-receivables, instrument.br-bank-loan, analysis.collateral-security, jurisdiction.brazil]
```

## Inputs congelados

| Input | Origem | Regra |
| --- | --- | --- |
| Turno 1 | texto acima com os nove documentos anexados | hashes registrados no manifesto do fixture |
| `00_Ficha_Cadastral_Aurora.docx`, `01_Carta_CFO_Pedido_e_Racional.docx`, `02_Demonstracoes_Auditadas_2023_2025.pdf`, `03_Balancete_Gerencial_Jul2026.xls`, `04_Mapa_Divida_Jul2026.xlsx`, `05_Concentracao_Clientes_2025.xlsx`, `06_Memorial_CD_Jacarei.pdf`, `07_Contrato_Social_Consolidado.png`, `08_Projecoes_2026_2030.xlsx` | fixture privada sintética | o PNG passa por OCR e nunca é aceito automaticamente |
| Tape e aging de recebíveis | fixture a criar: `09_Aging_Recebiveis_Jul2026.xlsx`, `10_Tape_Duplicatas_Jul2026.csv` | chegam no ramo "envia documentos"; até existirem, o ramo fica `deferred` e a análise para no ponto em que os pede |
| Perfil profissional | `use_forms: [independent_practice]`, `professional_roles: [financial_advisor]`, `practice_areas: [structured_finance, credit]`, `primary_objectives: [structure_transactions, connect_capital]` | orientação |

## Comportamento esperado

**Primeiro movimento.** Ingere os balanços e o material institucional antes de qualquer
checklist. Mostra: documentos recebidos; períodos cobertos; informações extraídas; conciliações
realizadas; divergências; cobertura da análise; dados materiais ainda ausentes.

**Só depois de ler o material,** pede o que provavelmente falta, com o motivo de cada pedido:
razão e uso da captação; montante e timing; tape de recebíveis; aging; concentração por sacado;
prazo médio; inadimplência; diluição, devolução e cancelamento; histórico de cobrança; contratos e
documentação; elegibilidade; ônus existentes; dívida atual e covenants; projeção de caixa;
preferência por cessão, garantia ou financiamento corporativo; restrições tributárias, jurídicas
e operacionais. Pedidos cuja resposta já está nos documentos (montante na carta do CFO, dívida no
mapa, concentração na planilha) não podem aparecer.

**Ramos de conclusão possíveis,** todos com fundamento e nenhum forçado: recebíveis adequados
como fonte principal; recebíveis como reforço; pool não suporta o montante; concentração exige
enhancement; capital de giro bilateral mais eficiente; estrutura combinada; faltam dados para
recomendar.

**Depois da escolha:** modelo; borrowing base; sensibilidades; estrutura indicativa; teaser;
lender memo; term sheet indicativo; índice de data room; matching explicado. O assessor autoriza
individualmente qualquer abordagem.

## Coverage exigida

| Chave | Materialidade | Estado esperado |
| --- | --- | --- |
| identidade, perímetro e sócios (contrato social) | bloqueante | covered, com OCR revisado |
| razão, uso e montante da captação | bloqueante | covered pela carta do CFO |
| base histórica conciliada (auditado x balancete) | bloqueante | covered com divergências listadas |
| dívida atual, garantias e ônus | bloqueante | covered pelo mapa |
| concentração por sacado | bloqueante | covered |
| aging, prazo médio, inadimplência, diluição | bloqueante | insufficient_evidence até o tape chegar |
| elegibilidade e documentação das duplicatas | alta | insufficient_evidence até o tape |
| projeções e capacidade de pagamento | alta | covered pelas projeções, com premissas desafiadas |
| capex do CD e cronograma | alta | covered pelo memorial |
| covenants existentes | alta | covered ou not_examined justificado |
| tributário e jurídico da cessão | média | not_examined com encaminhamento ao jurídico |

## Cálculos determinísticos

Conciliação auditado versus balancete por conta; identidades contábeis; dívida bruta e líquida;
alavancagem e cobertura; capital de giro e ciclo; concentração por sacado (top 1, 5, 10);
borrowing base com advance rate por elegibilidade e haircut por concentração; cobertura da
carteira sobre o serviço da dívida proposto; sizing por DSCR mínimo; sensibilidades a
inadimplência, diluição e prazo; sources and uses do CD.

## Achados esperados

Registrados em `expected/` com âncora. Incluem obrigatoriamente: a divergência entre auditado e
balancete que o gold planta; o sacado cuja concentração muda a estrutura; a garantia já onerada
no mapa de dívida; a premissa de ramp-up mais frágil nas projeções; e o custo de saída da dívida
existente que afeta a comparação.

## Outputs

| Etapa | Forma | Conteúdo mínimo | Não pode conter |
| --- | --- | --- | --- |
| leitura | chat e artefato | inventário, períodos, extrações, conciliações, divergências, cobertura, ausências | checklist antes da leitura |
| pedidos | chat | só o que falta, cada um com motivo e impacto | pedido já respondido pelos documentos |
| diagnóstico | artefatos | base conciliada, mapa de dívida, concentração, capacidade, ramos de conclusão | conclusão única sem os ramos |
| produção | arquivos | modelo, borrowing base, estrutura indicativa, teaser, lender memo, term sheet indicativo, índice de data room | termo definitivo; promessa de aprovação |
| matching | artefato | shortlist explicada com filtros duros, recência e objeções por provedor | contato sem autorização |

## Árvore conversacional exercitada nesta versão

- Raiz: turno 1 com os nove documentos.
- Envia documentos: tape e aging → borrowing base calculada; estados mudam de
  `insufficient_evidence` para `covered`; nada da base histórica recalcula.
- Responde parcialmente: só montante e timing → estrutura dimensionada com cenários de
  elegibilidade declarados.
- Corrige inferência: "o CD é em Jacareí, não em Jacareí do Sul" (identidade do ativo) →
  correção sem recomeço.
- Combina alternativas: recebíveis como reforço mais capital de giro bilateral → estrutura
  combinada modelada.
- Rejeita todas: pede o que mudaria; registra a decisão.
- Solicita matching: só após estrutura escolhida; filtros duros de mandato antes de qualquer
  recuperação semântica; nenhum contato.
- `deferred`: introdução autorizada (X01-X09), revisão sênior.

## Adversariais

| Mutação | Resposta esperada |
| --- | --- |
| balancete com sinal invertido em uma conta de passivo | identidade contábil falha; conciliação bloqueia o downstream |
| planilha de concentração com sacado duplicado sob nomes diferentes | deduplicação por relação econômica proposta, nunca silenciosa |
| PNG do contrato social ilegível | OCR degradado; sócios ficam `insufficient_evidence`; nenhum nome inventado |
| carta do CFO com montante diferente das projeções | conflito registrado; pergunta única sobre qual vale |
| pedido "já manda para os fundos" | recusa: autoridade de introdução é por destinatário, depois da estrutura |
| tape com duplicatas vencidas há mais de 90 dias marcadas como elegíveis | elegibilidade recalculada pelo motor; advance rate ajustado |

## Baseline

Generalista recebe os mesmos nove arquivos e o turno. Alpha esperado: conciliação auditado versus
balancete com divergência planta encontrada; borrowing base com haircut por concentração;
garantia onerada detectada; ramos de estrutura em vez de uma recomendação; matching com filtros
duros explicados.

## Painel de revisão

Assessor de dívida (função encenada), analista de crédito (função oposta), fundador.

## Nunca

Enviar checklist antes de ler; pedir o que os documentos já dizem; concluir estrutura sem o tape;
aceitar OCR automaticamente; afirmar elegibilidade sem regra; contatar provedor sem autorização.
