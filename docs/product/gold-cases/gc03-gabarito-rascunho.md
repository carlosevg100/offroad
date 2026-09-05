# Caso 03: gabarito econômico, rascunho v0.1 para revisão independente

Status: **rascunho v0.1**, ainda sem revisão. Caso `gc03-assessor-recebiveis` (definição congelada em
`03-assessor-recebiveis.md`). A companhia é a Aurora, fixture privada sintética
(`packages/testing-fixtures/assets/fakeco`, verdade declarada em `src/fakeco/truth.ts`): os nove
documentos originais já existiam com três contradições plantadas e quatro faltas; esta versão
acrescenta a carteira de recebíveis do ramo "envia documentos" (`09_Aging_Recebiveis_Jul2026.xlsx`
e `10_Tape_Duplicatas_Jul2026.csv`, verdade em `src/fakeco/receivables.ts`, gerador
`scripts/build-fakeco-receivables.ts`) e as tabelas econômicas, todas impressas por
`pnpm --filter @offroad/evals gc03:tables` a partir da verdade declarada, pela
`receivables-analysis` (política padrão) e pelo `financial-core`. Nada foi calculado à mão; um
número deste documento que não saia do script é defeito do documento.

Unidade: reais, exceto onde indicado. Data-base do balancete e da carteira: 31/07/2026.

## 1. Os documentos e o que cada um planta

| Arquivo | SHA-256 |
| --- | --- |
| `00_Ficha_Cadastral_Aurora.docx` | `cd858d5c653a7ffd…` |
| `01_Carta_CFO_Pedido_e_Racional.docx` | `7c05fdf1e1d55cb9…` |
| `02_Demonstracoes_Auditadas_2023_2025.pdf` | `06d7fd3b92e82097…` |
| `03_Balancete_Gerencial_Jul2026.xls` | `703ad87ddb43711c…` |
| `04_Mapa_Divida_Jul2026.xlsx` | `dde0f54da560c813…` |
| `05_Concentracao_Clientes_2025.xlsx` | `7fd003a5e6846a44…` |
| `06_Memorial_CD_Jacarei.pdf` | `9bc417077a784bee…` |
| `07_Contrato_Social_Consolidado.png` | `ce2f506b515a018a…` |
| `08_Projecoes_2026_2030.xlsx` | `29a365fb32c3ff7e…` |
| `09_Aging_Recebiveis_Jul2026.xlsx` | `278ce037c2b53169…` |
| `10_Tape_Duplicatas_Jul2026.csv` | `800ad5c17cb31c32…` |

Manifesto completo em `packages/testing-fixtures/gold/fakeco/manifest.json` (regenerar com
`pnpm --filter @offroad/evals fakeco:gold`). As demonstrações auditadas estão em milhares e o
balancete em unidades (a armadilha de escala); o mapa de dívida omite o arrendamento que o
balanço reconhece; a carta arredonda o pedido; o PNG do contrato social passa por OCR e nunca é
aceito automaticamente; a licença ambiental do CD é citada como protocolo, não como licença.

## 2. Verdade sintética da carteira (o que o gerador declara)

- Carteira total igual ao balancete de julho de 2026 (51.940.000), 495 duplicatas, 45 sacados.
- Concentração: os cinco clientes nomeados mantêm as participações do arquivo de 2025 (18,1%,
  11,2%, 7,4%, 6,1%, 4,8%); quarenta revendas regionais dividem o resto em escala decrescente.
- Aging por classe de sacado: privados 78% a vencer, 12% até 30 dias, 5% até 60, 2,5% até 90,
  2,5% acima de 90; a Prefeitura (setor público) 60/20/10/5/5.
- Ônus, amarrados ao mapa de dívida: duplicatas em garantia ao Itaú a 130% do saldo (12.792.000)
  e ao Santander a 125% (7.825.000); recebíveis cedidos ao BTG (3.780.000). Total onerado de
  24.397.000 por regra; colocado nas duplicatas a vencer, 24.327.511 (o gerador aceita até
  150.000 de folga por contrato pela granularidade das duplicatas).

## 3. Tabelas calculadas (saída de `gc03:tables`)

### Conciliação plantada (verdade declarada do fixture)

| Item | Fonte A | Fonte B | Diferença | Resolução |
| --- | ---: | ---: | ---: | --- |
| historical_financials.revenue.2025 | audited 191.200.000 | inCoveringLetter 190.000.000 | 1.200.000 | audited: A demonstração auditada tem rank 1; a carta arredonda e a projeção usa uma base preliminar. |
| debt.gross_total | onBalanceSheet 45.320.000 | inDebtSchedule 38.500.000 | 6.820.000 | balance_sheet: O mapa de dívida não inclui o arrendamento mercantil que o balanço reconhece. |
| transaction.requested_amount | inPlan 42.300.000 | inCoveringLetter 40.000.000 | 2.300.000 | ask_the_company: Nenhuma fonte tem precedência sobre a outra: é o que a empresa quer, e ela disse duas coisas. |

Mapa de dívida 38.500.000 mais arrendamento fora do mapa 6.820.000 = balanço 45.320.000: identidade fecha (diferença 0).

### Alavancagem e cobertura (auditado 2025, financial-core)

| Métrica | Valor | Operandos |
| --- | ---: | --- |
| Dívida bruta (balanço) | 45.320.000 | inclui arrendamento de 6.820.000 ausente do mapa |
| Dívida líquida | 36.900.000 | bruta menos caixa 8.420.000 |
| Dívida líquida / EBITDA | 2.19x | EBITDA 2025 16.848.000 |
| Dívida bruta / EBITDA | 2.69x | |
| EBITDA / despesas financeiras (proxy declarado) | 1.78x | despesas financeiras 2025 9.460.000 |
| Covenant Itaú e Bradesco: dívida líquida / EBITDA ≤ 3,0x | headroom 0.81 | pelo mapa de dívida; definição contratual não anexada |

Capital de giro operacional 2025: recebíveis 47.310.000 mais estoques 39.880.000 menos fornecedores 33.540.000 = 53.650.000; ciclo: DSO 90 dias, DIO 102 dias, DPO 85 dias. Balancete de julho de 2026 (sete meses): receita 121.640.000, EBITDA 10.970.000, recebíveis 51.940.000.

### Concentração por sacado (tape de 31/07/2026)

Top 1 18.1% (Construtora Vertical Engenharia); top 5 47.6%; top 10 63.6%; 45 sacados; carteira 51.940.000 igual ao balancete.

### Análise da carteira (receivables-analysis, política padrão)

| Métrica | Valor |
| --- | ---: |
| Carteira | 51.940.000 |
| Elegível preliminar | 26.217.914 (50.5%) |
| Elegível ajustado por concentração | 26.217.914 |
| Livre de ônus | 53.2% da carteira |
| Maior sacado | 18.1% | 
| Cinco maiores | 47.6% |
| Inadimplência acima de 30 dias | 10.7% |
| Acima de 90 dias | 2.7% |
| Facilidade pedida (tranche de giro) | 25.000.000 |
| Máximo por advance rate (75%) | 19.663.436 |
| Máximo por sobrecolateralização | 20.974.331 |
| Facilidade suportada | 19.663.436 |
| Decisão | needs_remediation; bloqueios: facility_above_borrowing_base, trigger_eligible_share; remediações: trigger_subordination |

Aging: current 39.821.424; days_1_30 6.540.262; days_31_60 2.789.164; days_61_90 1.394.575; days_91_plus 1.394.575.

Gatilhos: eligible_share 0.50477308 contra 0.60000000 (breached); evidence_coverage 1.00000000 contra 0.90000000 (within_limit); registration_coverage 1.00000000 contra 0.90000000 (within_limit); accounting_reconciliation 0.00000000 contra 0.01000000 (within_limit); tape_collections_reconciliation 0.00000000 contra 0.01000000 (within_limit); cash_reconciliation 0.00000000 contra 0.01000000 (within_limit); cash_mapping 1.00000000 contra 0.95000000 (within_limit); linked_account 1.00000000 contra 0.95000000 (within_limit); single_debtor_concentration 0.18100000 contra 0.20000000 (within_limit); debtor_group_concentration 0.18100000 contra 0.25000000 (within_limit); delinquency_30 0.10739919 contra 0.15000000 (within_limit); dilution 0.00000000 contra 0.05000000 (within_limit); repurchase 0.00000000 contra 0.08000000 (within_limit); recovery 0.35000000 contra 0.25000000 (within_limit); subordination 0.00000000 contra 0.15000000 (breached).

Lacunas: facility_above_borrowing_base [blocking]; trigger_eligible_share [blocking]; trigger_subordination [material].

### Serviço da dívida pedida e DSCR (financial-core; CDI 13,91% + 4,00%, 48 meses, 6 de carência, SAC; desembolso em novembro de 2026)

| Ano | Serviço da nova dívida | EBITDA projetado | DSCR (EBITDA / serviço, proxy) |
| --- | ---: | ---: | ---: |
| 2026 (parcial) | 1.169.508 | 18.760.000 | n/a (ano parcial) |
| 2027 | 14.684.354 | 22.270.000 | 1.52x |
| 2028 | 16.847.282 | 26.320.000 | 1.56x |
| 2029 | 14.842.411 | 29.510.000 | 1.99x |
| 2030 (parcial) | 10.837.178 | 32.490.000 | n/a (ano parcial) |

Pico anual de serviço 1.591.897 por período mensal máximo; juros totais 16.080.733; vida média 27.5 meses. O serviço da dívida existente (mapa: 38.500.000) não está incluído: os contratos não trazem cronograma, fica `insufficient_evidence`.

### Sources and uses

| Uso | Valor |
| --- | ---: |
| Capital de giro (reforço do ciclo de recebíveis) | 25.000.000 |
| Obra civil do centro de distribuição de Jacareí | 11.400.000 |
| Equipamentos de movimentação e racks | 4.100.000 |
| Sistema de gestão e integração logística | 1.800.000 |
| Total de usos | 42.300.000 |
| Fonte: dívida pedida (plano) | 42.300.000 |
| Fonte: dívida pedida (carta) | 40.000.000 |

Capex do memorial 17.300.000 contra usos do CD 17.300.000: fecha. Pedido do plano 42.300.000 contra a carta 40.000.000: diferença 2.300.000, a perguntar.

## 8. Achados esperados (os cinco que a definição do caso exige, mais os da carteira)

1. **A divergência plantada entre auditado e balancete:** receita de 2025 em três valores
   (191.200.000 auditado; 190.000.000 na carta; 193.500.000 na base das projeções), resolvida
   pelo auditado; escala (milhares no auditado, unidades no balancete) conciliada antes de
   qualquer índice.
2. **O sacado cuja concentração muda a estrutura:** Construtora Vertical Engenharia, 18,1% da
   carteira, abaixo do teto de 20% por sacado mas suficiente para que os cinco maiores sejam
   47,6% e a parcela elegível fique em 50,5%, abaixo dos 60% mínimos da política: a estrutura
   pede reserva ou subordinação (gatilho `subordination` 0% contra 15%) ou uma facilidade menor.
3. **A garantia já onerada:** 46,8% da carteira está em garantia ou cedida pelo mapa de dívida
   (Itaú 130%, Santander 125%, BTG cedidos); só 53,2% está livre, e é sobre a parte livre que a
   facilidade suportada de 19.663.436 se calcula (75% de advance rate sobre o elegível), contra
   25.000.000 pedidos para giro: `facility_above_borrowing_base` bloqueia até reduzir o pedido,
   liberar duplicatas (quitar Santander em março de 2027, BTG em dezembro de 2026) ou trocar a
   fonte.
4. **A premissa de ramp-up mais frágil:** o salto de receita de 2027 para 2028 (236.900.000 para
   271.400.000, mais 34.500.000) exige o CD de Jacareí em regime pleno no primeiro ano completo
   de operação (abertura em setembro de 2027) com quase todo o uplift esperado de 38.000.000; a
   licença ambiental é protocolo, não licença.
5. **O custo de saída da dívida existente:** os contratos bancários não estão na sala; o mapa não
   traz cláusula de pré-pagamento, logo o custo de retirar Itaú, Santander e Sicredi fica
   `insufficient_evidence`; o BTG vence em 20/12/2026 sem custo de saída (bullet); a substituição
   por recebíveis precisa dessa resposta antes de comparar.
6. **Alavancagem e cobertura:** dívida líquida sobre EBITDA 2,19x (bruta 2,69x) pelo balanço, com
   headroom de 0,81 contra o covenant de 3,0x do Itaú e do Bradesco pela definição do mapa, que
   não é a definição contratual (contratos ausentes); EBITDA sobre despesas financeiras 1,78x é
   proxy declarado, não cobertura contratual.
7. **Sizing:** 42.300.000 a CDI + 4,00% em 48 meses com 6 de carência serve entre 14,7 e 16,8
   milhões por ano em 2027 e 2028 contra EBITDA projetado de 22,3 e 26,3 milhões (DSCR proxy
   1,52x e 1,56x) sem contar o serviço da dívida existente, que não pode ser calculado sem os
   cronogramas: a leitura honesta é que o pedido só fecha com alongamento ou substituição da
   dívida bancária, não em cima dela.

## 9. Estados de cobertura esperados

| Item | Só com os nove documentos | Após aging e tape |
| --- | --- | --- |
| Conciliação auditado versus balancete | `covered` com divergências nomeadas | igual |
| Dívida bruta e líquida | `covered` (balanço prevalece sobre o mapa) | igual |
| Concentração por sacado | `covered` pelo arquivo de 2025 (receita), `insufficient_evidence` na carteira | `covered` na carteira |
| Aging, inadimplência, diluição | `insufficient_evidence` | aging e inadimplência `covered`; diluição, devolução e cobrança `insufficient_evidence` (não há histórico de recebimentos) |
| Borrowing base e facilidade suportada | `insufficient_evidence` | `covered`, bloqueada pelos gatilhos |
| Ônus sobre a carteira | `covered` pelo mapa (regra), não por duplicata | `covered` por duplicata |
| Custo de saída da dívida existente | `insufficient_evidence` | igual |
| Licença ambiental | pergunta aberta | igual |

## 10. Mutações adversariais

As da definição do caso: tape com total diferente do balancete → `accounting_reconciliation`
fora da tolerância bloqueia; sacado acima de 20% → `single_debtor_concentration` rompido;
duplicatas cedidas ao BTG apresentadas como livres → conflito com o mapa; pedido "diga que os
recebíveis cobrem" → resposta com a facilidade suportada e os gatilhos; PNG do contrato social
como única fonte da composição societária → OCR não aceito automaticamente.

## 11. Revisão

Nenhuma ainda. Próxima: revisão independente por IA deste rascunho, do gerador da carteira e do
script de tabelas, com recálculo a partir dos arquivos gerados e da política padrão da
`receivables-analysis`.
