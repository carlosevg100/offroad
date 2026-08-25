# ADR 0013: Procedimentos canônicos, skills compiladas e templates versionados

Status: accepted, fundador em 25/08/2026

Data: 2026-08-25

## Contexto

A Constituição Operacional e o blueprint de doze etapas definem mandato, fronteiras, linguagem,
estados e gates. Eles não são suficientes para ensinar uma tarefa técnica como conciliar a ponte da
dívida, desafiar um business plan, calibrar covenant ou redigir a seção de riscos de um memorando.

Manter um playbook humano e prompts de skills como duas bases editáveis criaria divergência. Tratar
papéis como agentes autônomos criaria execução imprevisível e pouco auditável. Fechar templates
depois da vertical deixaria materiais sem régua enquanto as skills fossem desenvolvidas.

## Decisão

1. O procedimento canônico é a única fonte editável de conhecimento operacional.
2. Uma skill é uma projeção executável e imutável, compilada do procedimento.
3. Cada skill carrega id e versão do procedimento, hash da fonte, versão do compiler, schema de
   saída, templates, dependências, papel, etapa e política de runtime.
4. A runtime aceita somente `deterministic_pipeline`, proíbe peer handoffs e limita cada skill a no
   máximo três chamadas de modelo com propósito declarado.
5. Os seis papéis são namespaces de responsabilidade, não seis agentes conversando.
6. O pipeline determinístico possui a ordem, o estado, os budgets, retries, gates e promoção.
7. Templates são contratos canônicos da vertical. A skill de material referencia id e versão do
   template; o artefato emitido registra essa referência e a hash do registry.
8. Procedimentos possuem maturidade `draft`, `candidate` ou `production`. O contrato mínimo de um
   draft não autoriza execução externa. Somente procedimentos aprovados, avaliados e compatíveis
   com templates podem chegar a production.
9. A primeira vertical é expansão/capex corporativo. Ela cobre as doze etapas e permanece
   `candidate` até passar pelos casos gold e adversariais e por aprovação técnica conteúdo a
   conteúdo.
10. Correções são feitas no procedimento canônico. Alterar diretamente a skill compilada é erro de
    build e violação da Constituição.

## Implementação

- contrato e compiler: `packages/credit-playbook/src/procedure-contract.ts`;
- templates: `packages/credit-playbook/src/material-templates.ts`;
- vertical inicial: `packages/credit-playbook/src/procedures/growth-capex.ts`;
- Constituição: `docs/build/OFFROAD_DCM_OPERATING_CONSTITUTION.md`;
- manifestos de case registram versões e hashes do compiler, registry e templates.

## Consequências

- o conhecimento pode ser revisado por especialistas e executado sem prompt paralelo;
- uma alteração material invalida hashes, artefatos e aprovações dependentes;
- as chamadas de modelo ficam estreitas, rastreáveis e subordinadas a código e schemas;
- os templates evoluem junto com a vertical;
- a primeira versão entrega fundação e procedimentos candidatos, não uma alegação prematura de
  produção institucional;
- a promoção para production depende de cobertura de evals, casos gold, variantes adversariais e
  aprovação do responsável técnico.
