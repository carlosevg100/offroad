# Recebíveis: Fase 4, leitura bruta e controles determinísticos

Data da evidência: 28/08/2026

## Objetivo

A Fase 4 liga os arquivos efetivamente entregues pela companhia ao harness E2E da
Vertentes. O detector não recebe o universo normalizado, os arquivos `source`, os
arquivos `expected`, o gabarito legado nem qualquer material de orientação do
fixture. Sua entrada é exclusivamente a sala bruta permitida pelo manifesto.

Esta fase não tenta substituir análise de crédito por heurísticas. Ela executa
controles reproduzíveis, aponta o que os documentos sustentam e preserva como
desconhecido tudo o que depende de documento, confirmação ou julgamento ainda não
disponível.

## Fluxo implementado

1. O parser lê integralmente a carteira CSV de 34.397 títulos, sem descartar a
   cauda do arquivo e sem truncamento silencioso.
2. O parser fiscal abre o arquivo ZIP com as mesmas proteções contra pacote hostil
   usadas nos formatos Office e separa NF-e de eventos de cancelamento.
3. Os documentos viram uma camada canônica com células, tabelas, páginas, hashes e
   âncoras.
4. Controles determinísticos cruzam carteira, cadastro, societário, balancete,
   razão, posição bancária, política comercial, diluição e amostra fiscal.
5. Cada achado material carrega procedência medida, fórmula versionada, universo,
   período e âncoras nos arquivos brutos.
6. Lacunas que não podem ser resolvidas pela sala entregue viram perguntas
   específicas ao cliente, somente depois de busca exaustiva na evidência entregue.
7. Fatos de elegibilidade alimentam a Fase 2A. Fatos não comprovados permanecem
   `unknown` e não são inventados para promover uma rota ou comprador.

## Resultado medido na Vertentes

| Controle | Resultado reproduzido a partir dos arquivos brutos |
|---|---:|
| Grupo econômico fragmentado | 1 grupo |
| Prazo acima da política sem evento de prorrogação | 340 títulos |
| Possível sacado relacionado | 1 ocorrência, sujeita a confirmação |
| Dívida e coobrigação omitidas da posição declarada | R$ 9.760.000 |
| Ajuste de conciliação contábil | R$ 1.900.000 |
| NF-e cancelada ainda aberta na carteira | 41 títulos dentro da amostra fiscal |
| Diluição registrada em conta genérica | R$ 3.059.552,71 |
| Originação mensal fora do padrão sazonal | novembro de 2025 |

As quatro perguntas esperadas também são produzidas: denominador de cessão e
recompra, abertura da diluição por título e motivo, datas e motivos das
prorrogações e tratamento tributário necessário para o CET completo.

## Limites deliberados

- A amostra contém 200 NF-e e 70 eventos de cancelamento. Somente 41 eventos
  conciliam com títulos ainda abertos. O sistema não extrapola essa incidência para
  o restante da carteira.
- As chaves fiscais do fixture sintético não têm 44 dígitos. O parser conserva os
  cruzamentos possíveis e publica um alerta explícito de qualidade do dado.
- NF-e comprova faturamento, mas não comprova entrega ou aceite para todo o
  universo.
- Os contratos comerciais não foram entregues. Cessibilidade, restrições e
  notificação de sacados permanecem desconhecidas.
- A sala evidencia antecipações e fomento, mas não vincula cada título a uma cessão
  ou gravame anterior. Esse hard gate permanece desconhecido.
- Por esses motivos, factoring, financeira, banco, SCD, FIDC e demais rotas podem
  existir no catálogo, mas a sala bruta ainda não sustenta uma shortlist live de
  programas. Não há atalho de gabarito para fabricar compatibilidade.

## Gates

O replay passa integralmente cálculo, classificação, recall e precisão dos oito
defeitos e contrato das quatro perguntas. Continua vermelho apenas em:

- `compatible_programs`, porque nenhum mandato live confirmado foi fornecido ao
  replay e os hard facts contratuais ainda não estão completos;
- `pipeline_incomplete`, consequência correta do gate anterior.

Nenhuma recomendação é mostrada à companhia, nenhum financiador é contatado e
nenhuma introdução ou aprovação de crédito é inferida.

