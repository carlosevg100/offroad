# ADR 0015: Sete fases, introdução qualificada e feedback de mercado

Status: accepted, fundador em 29/08/2026

Data: 2026-08-29

## Contexto

A arquitetura detalhada da Offroad precisava de uma topologia executiva estável e de uma fronteira
comercial inequívoca. O produto transforma uma necessidade de capital desorganizada em um caso
compreendido, estruturado, documentado e direcionado ao mercado aderente. Ele não executa o
processo interno de crédito do financiador.

Ao mesmo tempo, aceites, recusas, pedidos adicionais, propostas e desembolsos posteriores à
introdução são sinais valiosos. Ignorá-los impediria a aprendizagem do lender graph; incorporá-los
como etapas da Offroad criaria uma promessa operacional incorreta.

## Decisão

1. A topologia executiva do produto passa a ser `Understand`, `Diagnose`, `Structure`, `Prepare`,
   `Match`, `Introduce` e `Capture Feedback`.
2. O entregável final controlável pela Offroad é: caso compreendido, estrutura recomendada,
   materiais preparados, mercado selecionado e introdução qualificada realizada.
3. A análise de crédito da Offroad é diagnóstica e de estruturação. Não é underwriting, parecer
   vinculante nem decisão de investimento.
4. Term sheet e estrutura produzidos pela Offroad são indicativos. A proposta final pertence ao
   financiador.
5. A Offroad prepara a companhia e o pacote informacional. Diligência própria, comitê, proposta,
   negociação final, documentação, desembolso e monitoramento pertencem ao financiador.
6. Matching termina em direcionamento explicado, autorização específica e introdução qualificada.
7. Feedback posterior é um ledger append-only separado de mandato declarado e de execução do
   financiador. Correções exigem supersessão explícita.
8. Os únicos sinais iniciais do ledger são: introdução aceita, caso recusado com motivo, pedido de
   diligência ou informação, processo avançou, proposta emitida e operação desembolsada.
9. Comportamento observado alimenta uma projeção do lender graph por instituição e fingerprint de
   mandato. Ele não altera silenciosamente política, apetite ou capacidade declarados.
10. `processing_runs.stages` permanece o event log canônico dos marcos anteriores. Métricas de
    tempo são projeções desse log, não um segundo workflow persistido.
11. Funding pode integrar success fee e métricas econômicas, mas permanece um outcome compartilhado,
    nunca uma etapa executada ou controlada pela Offroad.

## Métricas

- tempo até diagnóstico;
- tempo até estrutura recomendada;
- tempo até material pronto;
- precisão do matching, somente sobre outcomes conhecidos;
- percentual de introduções aceitas;
- percentual de casos que avançam para análise do financiador;
- quantidade de retrabalho ou informação adicional;
- taxa de proposta por introdução; e
- desembolso por fingerprint de mandato, como outcome observado.

Cada taxa expõe numerador, denominador, período, cobertura e procedência. Ausência de feedback não
é classificada como recusa nem sucesso.

## Consequências

- pacotes legados de closing e monitoring não entram no fluxo canônico;
- nenhuma interface pode mostrar underwriting, diligência, aprovação, funding ou closing como
  tarefas executadas pela Offroad;
- pedidos posteriores do financiador podem ser organizados e registrados, mas continuam sendo
  sinais do processo dele;
- uma recusa corrigida ou revertida preserva o evento original e registra a supersessão;
- projeções comerciais podem melhorar o próximo matching sem contaminar a fonte de verdade dos
  mandatos; e
- a implementação e a evidência de aceitação devem provar isolamento por tenant, append-only,
  denominadores explícitos e ausência de extensão silenciosa de escopo.

