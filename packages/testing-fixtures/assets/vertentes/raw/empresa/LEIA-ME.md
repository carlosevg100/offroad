# Acervo de entrada · Vertentes Distribuidora

Caso fictício para teste ponta a ponta. Nenhuma empresa, pessoa ou marca aqui é real.
Data-base de toda a extração: **30/06/2026**.

## Como o acervo chega

| Pasta | O que é |
|---|---|
| `intake/` | O que a companhia escreve: a página institucional e a página do que o dono quer fazer |
| `documentos/contabil/` | Demonstrações, balancete e razão de clientes |
| `documentos/recebiveis/` | A base analítica, aging, cadastro de sacados, diluição, política de crédito e as notas fiscais |
| `documentos/divida/` | Posição bancária e os contratos |
| `documentos/comercial/` | Faturamento por cliente e orçamento |

## Inventário

| Arquivo | Formato | Observação |
|---|---|---|
| `intake/01-sobre-a-empresa.pdf` | PDF | Tom comercial da companhia |
| `intake/02-o-que-queremos-fazer.pdf` | PDF | Primeira pessoa, sem instrumento definido |
| `contabil/Balanco e DRE 2023-2024-2025.pdf` | PDF | Três exercícios num arquivo, notas resumidas |
| `contabil/BALANCETE JUN26.pdf` | PDF paisagem | Saída do sistema contábil, semestre corrente |
| `contabil/razao clientes 2024-2025.xlsx` | XLSX | Cabeçalho na linha 7, valores como texto |
| `recebiveis/titulos_em_aberto_e_liquidados.csv` | CSV, 6,6 MB | 34.397 títulos, latin-1, ponto e vírgula, data em três formatos |
| `recebiveis/AGING.xlsx` | XLSX | 24 abas, nomes e faixas inconsistentes |
| `recebiveis/Cadastro de Sacados.xlsx` | XLSX | 1.200 sacados, CNPJ com e sem máscara |
| `recebiveis/Devolucoes e abatimentos.xlsx` | XLSX | Conta contábil errada |
| `recebiveis/Politica de Credito e Cobranca.pdf` | PDF | Define elegibilidade e régua de cobrança |
| `recebiveis/NFs amostra.zip` | 270 XML | 200 NFe mais 70 eventos de cancelamento |
| `divida/posicao bancaria.xlsx` | XLSX | Só a dívida bancária |
| `divida/Contrato Desconto Duplicatas.pdf` | PDF | Cláusula 3.2, recompra obrigatória |
| `divida/Contrato Fomento Mercantil.pdf` | PDF | Fator de 3,45% ao mês mais ad valorem |
| `divida/Convenio Risco Sacado.pdf` | PDF | Cláusula 2.2, muda a natureza da obrigação |
| `comercial/Faturamento por cliente.xlsx` | XLSX | Duas abas, grafia do cliente muda entre elas |
| `comercial/Orcamento 2026 v4 FINAL (2).xlsx` | XLSX | Premissas soltas, nome de arquivo duvidoso |

## A regra do teste

O gabarito está em `../GABARITO.md` e **não deve ser lido antes de rodar o sistema**. Ele traz as
oito falhas plantadas, as métricas medidas na base e a recomendação correta de estrutura.
