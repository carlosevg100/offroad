# Revisão independente por IA: gabarito gc01-analista-ib-camil v0.8

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-answer-key-2026-09-05-02-45-26, commit b1e4e84. Fingerprint 7c49490b8089ba1cc0d29d81bea7a283c6ddc4fe77af162e7df67474fa5f424c.

Resultado: **fail**. Evidências: 90 confirmed, 4 unverifiable, 4 limitation, 1 corrected.

| Checagem | Feita |
| --- | --- |
| sourcesRevisited | sim |
| numbersRecalculated | sim |
| definitionsTested | sim |
| exceptionsTested | sim |
| adversarialTested | sim |
| consistencyTested | sim |
| baselineAdvantage | n/a |

## Evidências

| Resultado | Afirmação | Fonte | Âncora | Nota |
| --- | --- | --- | --- | --- |
| confirmed | Integridade do corpus: os 43 arquivos correspondem aos hashes do manifesto. | manifest.json | entries[0..42], sha256 | Os 43 SHA-256 foram recalculados localmente; nenhuma divergência. |
| confirmed | §1: valores de capital de giro por moeda, custos e total de empréstimos. | 01_ITR_1T26_31mai2026.txt | nota 15, p.39, tabela de empréstimos e financiamentos | 1.314.412 + 867.244 + 54.180 + 181.158 - 9.099 = 2.407.895; comparativos também conferem. |
| confirmed | §1: saldos das doze séries de debêntures e custo de transação. | 01_ITR_1T26_31mai2026.txt | nota 15, p.39, tabela de debêntures | A soma das séries menos 63.225 resulta em 3.262.291; comparativo: 3.302.261. |
| confirmed | §1: dívida bruta e divisão entre circulante e não circulante. | 01_ITR_1T26_31mai2026.txt | nota 15, p.39 | 2.407.895 + 3.262.291 = 5.670.186; 1.229.828 + 4.440.358 = 5.670.186. |
| confirmed | §1: dívida em moeda estrangeira de 1.102.582, equivalente a 45,8% dos empréstimos e 19,4% da dívida bruta. | 01_ITR_1T26_31mai2026.txt | nota 15, p.39, itens (i) a (iii) | 867.244 + 54.180 + 181.158 = 1.102.582; percentuais recalculados: 45,790% e 19,445%. |
| confirmed | §2: todas as linhas da movimentação trimestral. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40, movimentação dos empréstimos e financiamentos | 4.988.383 + 2.046.140 + 172.359 - 4.741 - 1.285.146 - 229.611 + 60 - 17.258 = 5.670.186. |
| confirmed | §2: aumento da dívida bruta de 681.803, ou 13,7%. | 01_ITR_1T26_31mai2026.txt | nota 15, pp.39-40 | 5.670.186 - 4.988.383 = 681.803; crescimento recalculado: 13,668%. |
| confirmed | §3: cronograma de amortização de 31/05/2026. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40, cronograma por ano-safra | 1.229.828 + 776.868 + 1.228.475 + 694.497 + 994.544 + 809.198 - 63.224 = 5.670.186. |
| confirmed | §3: cronograma comparativo de 28/02/2026. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40, cronograma por ano-safra | 1.074.636 + 712.945 + 886.187 + 586.660 + 989.147 + 805.151 - 66.343 = 4.988.383. |
| confirmed | §3: crescimento do pico 2028/29 e concentração de 2026/27. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40 | 1.228.475 - 886.187 = 342.288; 1.229.828 / 5.670.186 = 21,689%. |
| confirmed | §4: disponibilidades, aplicações equivalentes e caixa total. | 01_ITR_1T26_31mai2026.txt | nota 3, p.20 | 349.791 + 1.080.923 = 1.430.714; comparativo: 171.272 + 1.826.336 = 1.997.608. |
| confirmed | §4: aplicações não equivalentes e derivativos ativo e passivo. | 01_ITR_1T26_31mai2026.txt | balanço, pp.11-12; nota 25, p.51 | Aplicações: 25.095; derivativo ativo: 235 e zero; passivo: 14.335 e 16.184. |
| confirmed | §4: passivo de arrendamento de 276.768 e 282.563. | 01_ITR_1T26_31mai2026.txt | nota 12(b), p.33 | Os totais também conciliam com 67.399 + 209.369 e 66.994 + 215.569. |
| confirmed | §4: dividendos nominais e valores presentes derivados da nota 18. | 01_ITR_1T26_31mai2026.txt | nota 18(e), p.46 | 31/05: 140.000 - 6.911 + 255.000 - 49.524 = 338.565, sobre nominal de 395.000. 28/02: 140.000 - 10.522 + 280.000 - 62.521 = 346.957, sobre nominal de 420.000. |
| confirmed | §4: nota 25 informa dividendos de 322.498 contábil e 420.000 justo em 31/05, e 346.957 e 420.000 em 28/02. | 01_ITR_1T26_31mai2026.txt | nota 25, p.51, passivos financeiros | Em 31/05 há quatro montantes relevantes: 395.000, 338.565, 322.498 e 420.000. |
| confirmed | §4: queda de caixa de 566.894. | 01_ITR_1T26_31mai2026.txt | nota 3, p.20 | 1.430.714 - 1.997.608 = -566.894. |
| unverifiable | §4: cálculo independente do valor presente dos dividendos pela taxa e pelos fluxos. | 01_ITR_1T26_31mai2026.txt | nota 18(e), p.46 | O ITR fornece os ajustes a valor presente, mas não a taxa de desconto; só é possível conciliar aritmeticamente os saldos. |
| confirmed | §5: dívida líquida contratual de 4.228.477. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40; nota 25, p.51 | 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477. |
| confirmed | §5: covenant de até 4,0x, medição anual, adimplência em 28/02/2026 e próxima medição em 28/02/2027. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40, parágrafos de covenants |  |
| confirmed | §5: pro forma de 4,72x em 31/05/2026 e 4,08x em 31/05/2025. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40 | A própria administração identifica esses índices como cálculos pro forma. |
| confirmed | §5: EBITDA implícito de aproximadamente 895.900. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40 | 4.228.477 / 4,72 = 895.863,771; arredondamento do gabarito é adequado. |
| limitation | §5: comparabilidade integral do pro forma do ITR com cada covenant contratual. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40 | A dívida líquida é comparável, mas o ITR não abre EBITDA, ajustes nem informações complementares; a 11ª escritura ainda prevê aquisições e sellers finance. |
| limitation | §5: inclusão de arrendamentos em 'qualquer outra dívida onerosa'. | escritura_11a_emissao.txt | cláusula 4.22.3(j)(i), pp.34-35 | A escritura contém a expressão ampla, enquanto o ITR apresenta arrendamento separadamente; o enquadramento exige interpretação jurídica. |
| confirmed | §6: receita, custo, depreciações, resultado financeiro, resultado antes de impostos e lucro líquido. | 01_ITR_1T26_31mai2026.txt | DRE, p.13; notas 19, 20, 22 e 23, pp.47-48 | Todos os valores da tabela conferem; o lucro consolidado exato é 27.971, arredondado no release para 28.000. |
| confirmed | §6: EBITDA de 210,0 milhões, margem de 7,9%, queda de 9,9%, e EBITDA anterior de 233,1 milhões. | ri_release_1t26.txt | destaques financeiros e reconciliação do EBITDA |  |
| confirmed | §6: proxies de cobertura de 1,23x e 1,48x. | 01_ITR_1T26_31mai2026.txt | release p.4; nota 22, p.48 | 210.000 / 170.548 = 1,2313x; 210.000 / 141.971 = 1,4792x. |
| confirmed | §6: crédito fiscal de 30.421 e alíquota efetiva de 1.241,67%. | 01_ITR_1T26_31mai2026.txt | nota 23, p.48 | 30.421 / 2.450 = 1.241,67%; a nota apresenta expressamente essa alíquota. |
| confirmed | §7: contingências possíveis de 1.264.059, incluindo 1.007.977 tributárias, sem provisão. | 01_ITR_1T26_31mai2026.txt | nota 17(b), p.44 | 1.264.059 equivale a 1,411x o EBITDA implícito; a fonte classifica as perdas como possíveis. |
| confirmed | §7: controladora garante dívidas das controladas no exterior. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40, último parágrafo |  |
| confirmed | §7: Camil Investimentos 51,43% e free float 27,51%. | 01_ITR_1T26_31mai2026.txt | nota 18(a), p.44 |  |
| confirmed | §7: dividendos remanescentes de 395.000 até 08/12/2028. | 02_Proposta_Administracao_AGOE_2026.txt | RCA de 16/12/2025; cronograma das 12 parcelas | Após a primeira parcela de 25.000: 8 × 25.000 + 3 × 65.000 = 395.000. |
| confirmed | §7: recebíveis em USD 335.679, CLP 158.346 e PEN 35.266. | 01_ITR_1T26_31mai2026.txt | nota 4, p.21, distribuição por moedas | Somam 529.291; a fonte não demonstra entidade, prazo, disponibilidade ou correlação com a dívida. |
| confirmed | §7: conciliação de estoques da nota com a tabela de capital de giro. | 01_ITR_1T26_31mai2026.txt | nota 5, p.21 | 3.088.478 - 643.241 = 2.445.237, compatível com 2.445,2 milhões arredondados no release. |
| confirmed | §7: terceira apresentação gerencial de estoques. | ri_release_1t26.txt | p.14, balanço patrimonial consolidado | 2.437,1 milhões de estoques + 8,2 milhões não circulantes + 576,0 + 67,3 milhões de adiantamentos aproxima a apresentação da nota, dentro dos arredondamentos. |
| confirmed | §7: volume consolidado +17,9% e preço do alto giro no Brasil -3,5%. | 01_ITR_1T26_31mai2026.txt | release, p.2, destaques operacionais |  |
| confirmed | §11.1: termos das duas séries da 11ª emissão. | af_11a_emissao.txt | características das séries e indicadores 2025/2026 | Vencimento 30/10/2028, CDI + 1,55% e índice apurado de 3,240 contra limite de 4,000. |
| confirmed | §11.1: emissão de 650 milhões e primeira série verde de 150 milhões. | cm_conclusao_11a.txt | comunicado de 18/11/2021, §§ iniciais | A data de conclusão da oferta não é confundida com a data de emissão de 30/10/2021. |
| confirmed | §11.1: termos das três séries da 13ª emissão. | af_13a_emissao.txt | características da 1ª, 2ª e 3ª séries | Vencimentos e remunerações CDI + 0,65%, IPCA + 6,3416% e IPCA + 6,5264% conferem. |
| confirmed | §11.1: termos das três séries da 14ª emissão. | af_14a_emissao.txt | características da 1ª, 2ª e 3ª séries | Vencimentos e remunerações 104% DI, IPCA + 6,8286% e IPCA + 6,9982% conferem. |
| confirmed | §11.1: termos das quatro séries da 15ª emissão. | af_15a_emissao.txt | características da 1ª à 4ª séries | Vencimentos e remunerações 105% DI, 14,15% prefixada, IPCA + 8,20% e IPCA + 8,70% conferem. |
| confirmed | §11.1: seis séries IPCA somam 743.955, ou 13,1% da dívida bruta. | 01_ITR_1T26_31mai2026.txt | nota 15, p.39, saldos por série | 282.357 + 110.321 + 204.059 + 66.024 + 50.401 + 30.793 = 743.955; 13,120% de 5.670.186. |
| confirmed | §11.1: separação dos estoques de séries em CDI, prefixadas e IPCA. | 01_ITR_1T26_31mai2026.txt | nota 15, p.39 | CDI: 2.172.858; prefixada: 408.703; IPCA: 743.955; soma bruta das séries: 3.325.516; menos custos de 63.225 = 3.262.291. |
| confirmed | §11.2: relatórios da 13ª e 14ª mostram 2,97 em fevereiro de 2025 e N/A nas medições seguintes. | af_13a_emissao.txt | seção 6, indicadores econômicos e financeiros | O mesmo quadro consta do relatório da 14ª. |
| confirmed | §11.2: relatório da 15ª não informa apuração do covenant. | af_15a_emissao.txt | seção 6, indicadores econômicos e financeiros | Todas as colunas estão como N/A. |
| confirmed | §11.3: notas comerciais autorizadas por 251 milhões, 251 mil títulos de mil reais e prazo de quatro anos. | ca_notas_comerciais_2026-05-27.txt | ata de 18/05/2026, p.2, alíneas (c), (e), (f) e (g) | A ata prevê que a data de emissão e os cronogramas constarão do termo futuro. |
| confirmed | §11.3: CPR autorizada até 535 milhões, prazo de até três anos e amortizações anuais. | ca_operacao_estruturada_2026-05-27.txt | ata de 18/05/2026, p.2, item 5(i)(a) | A contraparte é Banco do Brasil S.A.; o instrumento é Contrato de Abertura de Teto–CPR. |
| confirmed | §11.3: arquivamento das duas atas em 27/05/2026. | cvm_ipe_2026_camil.csv | linhas 35-36 |  |
| confirmed | §11.4: dívida líquida do release de 4.214,4 milhões e índice de 4,7x. | ri_release_1t26.txt | p.12, Endividamento e Caixa | 5.670,2 - 1.455,8 = 4.214,4; a definição omite derivativos e difere em 14,1 milhões da contratual. |
| confirmed | §11.4: capex de 77,5 milhões, queda de 35,3%. | ri_release_1t26.txt | p.12, Capex |  |
| confirmed | §11.5: ausência de Fato Relevante nas 58 linhas do extrato IPE. | cvm_ipe_2026_camil.csv | linhas 2-59, coluna Categoria | Nenhuma linha tem categoria Fato Relevante. |
| confirmed | §11.5: alteração do calendário do ITR e da apresentação. | calendario_eventos_2026.txt | seção Alterações efetuadas | ITR: 07/07 para 14/07; apresentação: 08/07 para 15/07. |
| confirmed | §11.5: pontos da curva ANBIMA e inflação implícita. | anbima_ettj_2026-09-04.csv | vértices 252 e 756 | 252: prefixada 13,4307%, IPCA 6,9576%, implícita 6,0520%; 756: 14,0413% e 7,9164%. |
| confirmed | §11.5: CDI diário de 0,05166% e meta Selic de 14,00%. | bcb_sgs_cdi_diario.json | registros de 01 a 03/09/2026 | A meta Selic de 14,00% consta em bcb_sgs_selic_meta.json, registros de 01 a 04/09/2026. |
| confirmed | §11.5: código CVM, CNPJ, recebimento e versão do ITR. | cvm_itr_2026_camil.csv | única linha de dados | Código 024228, CNPJ 64.904.295/0001-03, recebimento em 14/07/2026, versão 1. |
| confirmed | §13.1: definição de dívida líquida nas quatro escrituras. | escritura_13a_emissao.txt | definições, pp.7-8; cláusula 7.24.3 | A mesma fórmula-base consta das cláusulas 4.22.3, 7.26.3 e 7.26.3 das 11ª, 14ª e 15ª escrituras. |
| confirmed | §13.1: definição-base de EBITDA nos últimos doze meses. | escritura_14a_emissao.txt | definições, p.7 | Lucro antes das receitas e despesas financeiras acrescido de amortização e depreciação dos últimos 12 meses. |
| confirmed | §13.1: somente a 11ª acrescenta aquisição de sociedade e sellers finance. | escritura_11a_emissao.txt | cláusula 4.22.3(j)(ii), p.35 |  |
| confirmed | §13.1: degraus de 3,50x e 4,00x da 11ª emissão. | escritura_11a_emissao.txt | cláusula 4.22.3(j)(a)-(b), pp.34-35 | O degrau de 4,00x depende da quitação integral ordinária dos CRA da 8ª emissão. |
| confirmed | §13.1: degraus de 3,50x e 4,00x das 13ª, 14ª e 15ª emissões. | escritura_13a_emissao.txt | cláusula 7.24.3(VIII)(a)-(b), pp.54-55 | As 14ª e 15ª trazem a mesma mecânica nas cláusulas 7.26.3, com os respectivos CRA de referência. |
| unverifiable | §13.1: quitação ordinária da 257ª emissão antes da mudança de degrau. | cra_257_relatorio_mensal_4t25.txt | estrutura de capital e saldo devedor até novembro de 2025 | O documento mostra valor atual de 665.885 e vencimento em 29/12/2025, mas não registra a liquidação. |
| confirmed | §13.2: séries DI da 13ª, 14ª e 15ª têm prêmio anual de 0,40% pro rata e respectivas datas de início. | escritura_15a_emissao.txt | cláusulas 7.16.1 e 7.18.1 | A mesma fórmula-base consta das cláusulas 7.16.1/7.18.1 da 13ª e 14ª; não é prêmio flat. |
| confirmed | §13.2: amortização extraordinária das séries IPCA da 13ª e 14ª usa o maior entre A e B e cotação do segundo dia útil anterior. | escritura_13a_emissao.txt | cláusula 7.18.2.1, pp.44-45 | Datas da 13ª: 14/05/2027 e 15/05/2028; a 14ª usa 15/06/2027 e 15/06/2028. |
| corrected | §13.2: a mesma regra descrita para IPCA da 13ª rege também o resgate facultativo total. | escritura_13a_emissao.txt | cláusula 7.16.2.2, pp.40-41; cláusula 7.18.2.1, pp.44-45 | Na 13ª, o resgate total unilateral é pelo valor presente das parcelas, sem piso explícito no critério A, e usa cotação ANBIMA do dia útil imediatamente anterior. Apenas a amortização extraordinária usa o maior entre A e B e o segundo dia útil anterior. A redação abrangente de §13.2 deve separar os dois mecanismos. |
| confirmed | §13.2: carências e make-whole das séries IPCA da 15ª. | escritura_15a_emissao.txt | cláusulas 7.16.3 e 7.18.3 | 3ª série desde 15/11/2028; 4ª desde 15/11/2029; maior entre nominal atualizado e valor presente com NTN-B. |
| confirmed | §13.2: regra da série prefixada da 15ª. | escritura_15a_emissao.txt | cláusulas 7.16.2 e 7.18.2 | Início em 15/11/2028 e desconto pela curva Pré x DI da B3 no segundo dia útil anterior. |
| confirmed | §13.2: mecanismos negociados antes das carências. | escritura_13a_emissao.txt | cláusulas 7.14.1-7.14.6 | Oferta permitida desde a emissão; base: nominal atualizado quando aplicável, remuneração pro rata, encargos e prêmio eventual. |
| confirmed | §13.2: aquisição e oferta de resgate da 11ª emissão. | escritura_11a_emissao.txt | cláusulas 4.13 e 4.14.1 | Aquisição depende do vendedor; a oferta de resgate exige adesão de 100% da emissão ou da série. |
| unverifiable | §13.2: valor monetário do make-whole em uma data específica. | escritura_15a_emissao.txt | cláusulas 7.16.2.2 e 7.16.3.2 | Exige curva/cotação da data contratualmente indicada e os fluxos remanescentes; o corpus não fornece uma data de cálculo completa. |
| confirmed | §13.5: quóruns gerais, waivers e alterações econômicas da 292ª emissão. | cra_292_termo_securitizacao.txt | cláusulas 17.8 a 17.8.2 | Geral: 50%+1; waiver: 50%+1 com presença mínima de 30% na segunda convocação; alterações econômicas: 70% dos CRA em circulação. |
| confirmed | §13.5: a estrutura de quóruns também aparece nos termos da 329ª e 389ª emissões. | cra_329_termo_securitizacao.txt | cláusulas 17.9 a 17.9.3 | O termo da 389ª repete a estrutura nas cláusulas 17.9 a 17.9.3. |
| limitation | §13.5: qualificação dos titulares de CRA como credores econômicos e decisores finais do reperfilamento. | cra_292_termo_securitizacao.txt | cláusulas 12.1.4 e 17.8-17.8.2 | Os mecanismos de orientação e votação estão documentados, mas a qualificação jurídica final requer especialista. |
| confirmed | Exceção: aprovações do conselho não provam desembolso nem inclusão na dívida de 31/05. | ca_operacao_estruturada_2026-05-27.txt | ata, itens 4 e 5 | O texto autoriza formalização futura e vincula o swap à data e ao volume dos desembolsos. |
| confirmed | Exceção: divergência de dividendos deve carregar quatro valores, não escolher um silenciosamente. | 01_ITR_1T26_31mai2026.txt | nota 18(e), p.46; nota 25, p.51 | A formulação 'três valores' não descreve a v0.8 nem a fonte: há quatro em 31/05. |
| confirmed | Exceção: recebíveis em moeda são somente potencial offset. | 01_ITR_1T26_31mai2026.txt | nota 4, p.21; nota 15, p.39 | A ressalva é suficiente porque não chama o saldo de hedge e enumera as informações faltantes. |
| confirmed | Exceção: contingências possíveis são alerta, não dívida provável. | 01_ITR_1T26_31mai2026.txt | nota 17(b), p.44 | A fonte as classifica como possíveis e declara ausência de provisão. |
| confirmed | Exceção: equivalentes de caixa são resgatáveis em até 90 dias, não necessariamente D0. | 01_ITR_1T26_31mai2026.txt | nota 3, p.20 |  |
| confirmed | Exceção: 1,23x e 1,48x são proxies, não cobertura contratual, caixa ou DSCR. | escritura_13a_emissao.txt | definições e cláusula 7.24.3 | A escritura define alavancagem Dívida Líquida/EBITDA, não esses índices de cobertura. |
| confirmed | Mutação §10: trocar milhares por milhões. | 01_ITR_1T26_31mai2026.txt | cabeçalhos das demonstrações e notas: 'Em milhares de reais' | O gabarito declara R$ mil e distingue os releases em R$ milhões; resiste à mutação. |
| confirmed | Mutação §10: afirmar covenant rompido em 31/05/2026. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40 | O gabarito preserva a medição anual e a próxima data de 28/02/2027. |
| confirmed | Mutação §10: anualizar EBITDA trimestral como EBITDA contratual. | escritura_11a_emissao.txt | cláusula 4.22.3(j)(ii) | O gabarito identifica corretamente EBITDA contratual como últimos doze meses. |
| confirmed | Mutação §10: somar arrendamento à dívida sem declarar. | 01_ITR_1T26_31mai2026.txt | balanço, p.12; nota 12(b), p.33 | O gabarito o mantém fora do cálculo e explicita a condição jurídica. |
| confirmed | Mutação §10: apresentar 4,72x como cálculo próprio. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40 | O gabarito atribui expressamente o pro forma à companhia. |
| confirmed | Mutação §11.6: citar 4,0x como único covenant. | escritura_13a_emissao.txt | cláusula 7.24.3(VIII) | O gabarito registra os degraus 3,50x e 4,00x. |
| confirmed | Mutação §11.6: comparar automaticamente 4,72x com 3,50x. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40 | O gabarito condiciona a comparabilidade do EBITDA e dos ajustes. |
| confirmed | Mutação §11.6: usar dívida líquida do release no covenant. | ri_release_1t26.txt | p.12, Endividamento e Caixa | O gabarito separa 4.214,4 milhões do release de 4.228.477 contratual. |
| confirmed | Mutação §11.6: adicionar notas comerciais e CPR à posição ou ao cronograma. | ca_notas_comerciais_2026-05-27.txt | ata, p.2 | O gabarito mantém emissão, desembolso e amortização como não demonstrados. |
| limitation | Mutação §11.6: chamar a securitizadora de credor econômico sem condição. | cra_292_termo_securitizacao.txt | cláusulas 12.1.4 e 17.8-17.8.2 | O gabarito distingue titularidade formal, decisão dos titulares e condiciona a qualificação jurídica. |
| confirmed | Mutação §11.6: usar a curva de 04/09/2026 como curva da data-base. | anbima_ettj_2026-09-04.csv | data do arquivo e cabeçalho 04/09/2026 | O gabarito explicita a data da curva. |
| confirmed | Mutação §11.6: escolher um valor de dividendos. | 01_ITR_1T26_31mai2026.txt | notas 18(e) e 25 | A divergência de quatro valores permanece aberta. |
| confirmed | Mutação §11.6: chamar recebíveis em moeda de hedge. | 01_ITR_1T26_31mai2026.txt | nota 4, p.21 | O gabarito os chama apenas de potencial offset. |
| confirmed | Mutação §11.6: promover 1,23x a cobertura contratual. | escritura_13a_emissao.txt | cláusula 7.24.3(VIII) | O gabarito o rotula como proxy simples. |
| confirmed | Mutação §11.6: tratar contingências possíveis como dívida. | 01_ITR_1T26_31mai2026.txt | nota 17(b), p.44 | O gabarito preserva a classificação de perda possível sem provisão. |
| confirmed | Mutação §13.4: aplicar 3,50x a fevereiro de 2027 sem ler o degrau. | escritura_15a_emissao.txt | cláusula 7.26.3, alíneas (a)-(b) | O gabarito identifica o degrau e sua condição. |
| confirmed | Mutação §13.4: aplicar 4,00x sem condicionar à quitação dos CRA. | escritura_13a_emissao.txt | cláusula 7.24.3(VIII)(b) | O gabarito registra expressamente essa condição. |
| confirmed | Mutação §13.4: tratar o prêmio de 0,40% a.a. como flat. | escritura_13a_emissao.txt | cláusulas 7.16.1.2 e 7.18.1 | O gabarito informa base 252 e prazo remanescente. |
| confirmed | Mutação §13.4: admitir saída unilateral IPCA antes da carência ou negar saída negociada. | escritura_13a_emissao.txt | cláusulas 7.14.1, 7.16.2.1 e 7.18.2 | O gabarito distingue corretamente mecanismos unilaterais e oferta negociada. |
| confirmed | Mutação §13.4: usar dívida líquida do release no covenant. | 01_ITR_1T26_31mai2026.txt | nota 15, p.40; nota 25, p.51 | O cálculo contratual de 4.228.477 é mantido. |
| confirmed | Consistência: segunda verificação independente dos cinco números mais materiais. | 01_ITR_1T26_31mai2026.txt | balanço pp.11-13; notas 15, 18 e 25 | Dívida bruta por circulante+não circulante = 5.670.186; por empréstimos+debêntures = 5.670.186. Movimentação = 5.670.186. Cronograma = 5.670.186. Dívida líquida reagrupada = 4.228.477. Dividendos pelo balanço, 133.089+205.476 = 338.565. Todos coincidem com a primeira verificação. |
| unverifiable | Separação IPCA capitalizado versus pago. | 01_ITR_1T26_31mai2026.txt | nota 15, pp.39-40 | O ITR agrega juros e variações monetárias e não abre a atualização IPCA capitalizada e paga por série. |

## Condições

- Corrigir §13.2 para separar, na 13ª emissão, o resgate facultativo total IPCA da amortização extraordinária IPCA.
- Obter prova da quitação ordinária dos CRA de referência antes de aplicar definitivamente o degrau de 4,00x.
- Submeter a inclusão de arrendamentos em 'outra dívida onerosa' a interpretação jurídica especializada.
- Manter a comparabilidade integral do pro forma de 4,72x condicionada até receber a memória de EBITDA e informações complementares.
- Obter conciliação da companhia e taxa de desconto dos dividendos para validar economicamente o valor presente.
- Manter IPCA capitalizado versus pago como não verificável até obter abertura por série.
- Usar a cotação contratualmente aplicável e os fluxos remanescentes para qualquer valor monetário de make-whole.
- Submeter a qualificação jurídica final de credor econômico e governança dos CRA a especialista.

## Notas do revisor

Codex (GPT-5), com leitura local do corpus e recálculos determinísticos em Node.js.

Há uma definição material incorreta em §13.2 sobre o resgate total IPCA da 13ª emissão; por isso o resultado é fail. Os demais recálculos materiais conferem.
