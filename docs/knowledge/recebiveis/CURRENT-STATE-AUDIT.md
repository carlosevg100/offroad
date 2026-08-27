# Auditoria do estado atual da vertical de recebíveis

Data: 27/08/2026

## Conclusão

O pacote `packages/receivables-analysis` é um protótipo útil, com controles de
schema, reconciliação, borrowing base, waterfall, cenários paramétricos e fronteira
correta até introdução qualificada. Ele não é ainda o motor aprovado da Fase 1 e não
deve ser usado como gabarito da nova vertical.

O destino arquitetural é:

- `financial-core/src/receivables`: contratos econômicos, datas, fórmulas,
  métricas, rastros e testes determinísticos;
- `receivables-analysis`: orquestração da análise, composição das métricas,
  aplicação de políticas governadas e produção de lacunas e estados;
- `credit-playbook` e registros de referência: conhecimento, critérios, fontes,
  validade e responsáveis;
- `testing-fixtures`: casos, dados sintéticos e golds.

Não haverá dois motores matemáticos. Os cálculos hoje existentes em
`receivables-analysis` serão migrados ou substituídos por chamadas ao
`financial-core` antes da promoção.

## Estado após o gate da Fase 1

As fórmulas promovidas de métricas estáticas, métricas dinâmicas, dívida ajustada,
taxas, CET e advance rate agora vivem exclusivamente em `financial-core`. O novo
`analyzeReceivablesPhaseOne` é uma camada canônica de composição e não contém
aritmética econômica própria. Ele produz bloqueios, alertas, limitações e fronteiras
explícitas.

O arquivo legado `analyze.ts` permanece como protótipo e regressão. Seu borrowing
base, waterfall, triggers e política default não são acreditados pela Fase 1. Não
devem ser conectados a produto, matching ou distribuição até migração procedimento
por procedimento para os contratos canônicos.

O caso Vertentes prova a Fase 1 contra oráculos independentes, mas continua
`incomplete` por dados ausentes. Aprovação do motor não equivale a completude do
caso. Essa separação é deliberada.

## O que já é aproveitável

- Validação de chaves e âncoras duplicadas.
- Identificação de grupos econômicos inconsistentes.
- Reconciliação de tape, contabilidade e caixa.
- Separação entre lacuna remediável e inviabilidade econômica.
- Estados explícitos de exceção e bloqueio.
- Proibição de direcionamento externo no estágio atual.
- Cenários adversariais parametrizados.
- Separação conceitual entre FIDC, cessão e fonte de pagamento.

## O que impede aprovação

1. Parte dos cálculos financeiros vive fora do `financial-core`.
2. A validação de valores usa conversão para `Number`, incompatível com a regra de
   precisão decimal da casa.
3. Existe apenas uma `referenceDate`; faltam data de relatório, última originação e
   intervalo efetivo do histórico.
4. O aging possui cinco faixas e diverge da taxonomia canônica de sete faixas.
5. O vencimento original não é preservado separadamente do vencimento vigente.
6. Diluição, recompra e substituição aparecem agregadas no título, sem eventos e
   âncoras próprias.
7. A política de elegibilidade é injetada no caso sem fonte, vigência, responsável
   ou separação entre regulação, política e apetite atual.
8. Elegibilidade por título termina em booleano e não modela todos os escopos e
   denominadores.
9. Métricas não retornam o contrato completo de procedência, fórmula, universo,
   inclusões e exclusões.
10. Não há DSO countback, roll rate, safras completas, perda ajustada, ponte da
    dívida, CET completo ou advance rate auditável.
11. Os cenários atuais são úteis como unitários, mas não substituem o caso Vertentes
    nem os 20 casos A1.
12. Os anchors manuais continuam pendentes de revisão especializada, como o próprio
    pacote corretamente declara.

## Regra de transição

Até a conclusão da Fase 1:

- nenhuma métrica do pacote atual é descrita como acreditada pela vertical;
- nenhuma política default é tratada como política real de comprador;
- nenhuma recomendação de fundo é liberada com base nesses defaults;
- os testes existentes permanecem como regressão de comportamento, mas o novo gold
  Vertentes passa a ser a régua de aprovação;
- a migração é incremental e mantém o monorepo verde a cada entrega.
