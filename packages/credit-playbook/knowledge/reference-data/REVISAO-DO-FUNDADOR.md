# Revisão do fundador

Os 75 parâmetros do cadastro estão preparados pela Offroad em 24/09/2026 e aguardam a sua revisão. Enquanto isso, todos estão em rascunho: telas e métodos mostram "em rascunho" e tratam cada um como lacuna, sem mudar nenhum cálculo. A aprovação de cada parâmetro registra a data, a fonte e a validade dele.

Além da revisão geral, estas são as escolhas que os cartões deixam explícitas para você, por família.

## Análise financeira (feat/reference-data-financial-analysis, 00b6868b)
- Tratamento padrão de arrendamentos: pré-IFRS 16 para alavancagem e para o caixa disponível ao serviço da dívida (muda todos os números de alavancagem).

## Preço e mercado (feat/reference-data-pricing-market, fd8c7ac7)
- Idade máxima de mandato: 3 meses para todo campo crítico (com 6 meses, um "ainda comprando" de 5 meses passaria).
- Prêmios por garantia vazios até existirem 5 operações pareadas: alternativas de garantia quantificadas em cobertura e reais, nunca em bps.

## Dívida e cenários (feat/reference-data-debt-scenarios, 42caa9d7)
- Choque de juros adverso: 200 bps (calibração: a Selic subiu isso em cerca de uma janela de 12 meses em três desde 2003); a biblioteca privada sugere +100 bps para o caso do banco.
- Provisões de custo de transação (empréstimo 1,5%, nota ou debênture 3,0%, CRI/CRA 4,5%, FIDC 4,0%): julgamento da casa, sem fonte pública; substituídas por cotações antes de term sheet.
- Correção na biblioteca privada: cita o Ofício-Circular CVM 01/2023 para risco sacado; o certo é o 01/2021, item 8.

## Estrutura (feat/reference-data-structure, f8220b66)
- Regra padrão de vencimento antecipado do lado da companhia: só por voto dos credores (sem quórum, não vence) em vez do usual "vence salvo renúncia da assembleia". Vira padrão da casa?
- Os cartões citam por nome a escritura pública da 15ª emissão de debêntures e os termos de CRA da Camil como observações datadas: manter o nome ou anonimizar (o repositório é público)?

## Capital e jurídico (feat/reference-data-capital-legal, 2c745323)
- Prevenção à lavagem: a Lei 9.613 art. 9º XIV(e) alcança assessoria em operações financeiras, mas o COAF revogou em 2020 a norma dos assessores. O cartão já adota identificação do cliente e guarda de 5 anos como política da casa; falta decidir se a Offroad comunica operações suspeitas ao COAF.
- Debêntures emitidas por limitada: desde fevereiro de 2026 o DREI orienta as Juntas a registrar, mas nenhuma lei prevê. O cartão mantém fora (vermelho) até lei ou norma da CVM.
- Posições da casa do lado da companhia que o mercado pode contestar: standstill de 120 dias e bloqueio de 180 em 360, janelas de 10 e 15 dias úteis, critérios de mudança adversa relevante, cobertura de 80% do EBITDA pelos garantidores.

## Pedido de informações, materiais e controle de qualidade (feat/reference-data-intake-materials-qc, 7a7cd3b8)
- RF-09: com a regra alinhada à análise financeira, uma companhia que empresta a um comprador relacionado, com vendas abaixo de 10% da receita, gera achado de empréstimo mas não o alerta RF-09. Esse caso também abre RF-09?
- Tamanho do lote: produção mostra hoje 5 itens e repõe o lote à medida que itens fecham. O valor proposto segue a Constituição (4 itens, o quinto só para bloqueio, lote fechado antes do próximo). É mudança visível para a companhia.
