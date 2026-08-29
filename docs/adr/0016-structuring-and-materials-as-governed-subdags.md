# ADR 0016: estruturação e materiais como sub-DAGs governados

Status: aceito  
Data: 29/08/2026

## Contexto

`case:structure` e `case:materials` eram nós únicos no Case Graph. Por dentro, cada um executava
várias decisões independentes e ocultava sua ordem, seus inputs e seus bloqueios. Isso impedia
explicar qual cálculo ou artefato ficou stale, refazer apenas o descendente afetado e medir custo
e qualidade por atividade.

A alternativa de criar um único agente de estruturação ou de materiais foi rejeitada. Um prompt
end-to-end mistura matemática, julgamento, texto e produção de arquivo, amplia contexto e torna o
resultado difícil de testar, reproduzir e auditar.

## Decisão

Estruturação e preparação de materiais são sub-DAGs do Case Graph. O DAG governa ordem,
dependências, contratos, invalidação, orçamento e gates. Inteligência de modelo pode existir
somente dentro de uma tarefa estreita, com input e output contratados. Matemática financeira,
reconciliação, filtros e consistency gates permanecem determinísticos.

O primeiro corte executável abre o trabalho que já existia de forma monolítica.

### Deal Structuring v1

1. `need_capacity`
2. `issuer_profile`
3. `credit_scenarios`
4. `instrument_screen`
5. `collateral_design`
6. `operation_verdict`
7. `operation_truth`
8. `indicative_terms`
9. `structure_truth`
10. `pricing_truth`
11. `assemble`

### Materials Preparation v1

1. `material_inputs`
2. `compile_documents`
3. `plan_room`
4. `claim_registry`
5. `publication_gate`
6. `material_truth`
7. `assemble`

Cada execução registra subtask trace com versão, dependências, fingerprints, ferramentas
permitidas e usadas, fontes, custo, duração, status e código de falha.

## Relação com o registro alvo

Os 23 TaskSpecs `S01` a `S12` e `A01` a `A11` continuam sendo a arquitetura-alvo. Abrir o
monólito não promove automaticamente essas tarefas. Elas avançam de `specified` somente quando
tiverem executor próprio, contrato de dados, procedimento canônico, gold case, caso adversarial,
persistência, interface e custo medido.

As lacunas materiais que permanecem incluem alternativas realmente comparáveis, sources and
uses fechado, custo total, estrutura-alvo confirmável, modelo financeiro editável, renderização
dos arquivos finais e inspeção visual. O runtime não deve mascarar essas lacunas com nomes de
tarefa ou texto gerado.

## Consequências

- mudanças em inputs podem ser atribuídas ao descendente correto;
- tarefas determinísticas podem executar em paralelo;
- tarefas de modelo permanecem serializadas por orçamento;
- falhas são localizadas no subtask trace;
- nenhum artefato externo é autorizado por esses sub-DAGs; e
- adicionar inteligência deixa de exigir reescrever a orquestração.
