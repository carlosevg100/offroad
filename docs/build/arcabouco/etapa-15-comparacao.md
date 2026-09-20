# Etapa 15: contrato da base de comparação

## Realiza

`prepareCapitalStructureComparison` em `packages/financial-model/src/capital-structure-decision.ts` organiza escolhas explícitas de uma base imutável. As alternativas conservam ordem declarada e cenários próprios, com métricas semanticamente idênticas no mesmo horizonte, entidade e perímetro. O resultado inclui a identidade e o fingerprint da base, contribuições completas e o fingerprint da preparação. Nenhuma operação financeira nova é feita aqui; os valores normalizados são preservados, incluindo caixa negativo e hipóteses identificadas.

Os estados são `framed`, `partial` e `basis_comparable`. O último significa somente que os inputs selecionados podem ser colocados lado a lado. Não significa viabilidade, preferência, aprovação ou conteúdo profissional publicado. Recomendação permanece nula; restrições carregadas permanecem pendentes, e a existência delas impede tratar a preparação como completa. O cenário vigente deve estar presente ou ter exclusão justificada. Sem companhia ou projeção, o contrato devolve a pergunta, objetivos e lacunas, sem exigir intake ou inventar números.

## Fronteira e transição

É um contrato puro consumido pelos testes e destinado à composição da etapa 15. Não cria endpoint nem caminho de execução. O leitor SQL autorizado continua responsável pela elegibilidade dos dados; digest e escopo só provam integridade e vínculo, nunca acesso. O adaptador protegido `capital_planning` segue vigente até o incremento de integração. Não há conteúdo legado a apagar neste recorte: substituir agora o adaptador anteciparia uma comparação ainda sem os motores e a revisão profissional completos.

O corpus sintético fica em `packages/testing-fixtures/src/capital-structure-decision.ts`, importado apenas pelo teste através de dependência de desenvolvimento. Nenhum valor sintético é configuração de produção. O pacote de testes expõe subcaminho próprio, sem ciclo com financial-model e sem nova biblioteca externa.

## Verificação

`capital-structure-decision.test.ts`: comparação dos cenários da casa/solicitado e caixa negativo; enquadramento sem entidade/projeção; ausência explícita de preço; cenário vigente ou exclusão; oito dimensões incompatíveis recusadas; EBITDA não rebatizado como caixa e definição gerencial não apresentada como contratual; covenant pendente; integridade, escopo, contribuição e duplicatas; reprodução da revisão anterior; períodos inválidos e referências não declaradas. Dezessete casos dirigidos aprovados. Check integral aprovado (44 tarefas); evidências remotas serão registradas no completion.

## Riscos e incrementos restantes

Na 15: calcular liquidez e custos sob convenções explícitas, fundamentar instrumentos/preços, fontes e hipóteses, avaliar covenants com definição contratual, medir tempo até primeira resposta útil, integrar e completar autoria/revisão. O modelo anual atual não comprova cobertura intraperíodo. Comparar bases também não substitui essas etapas. Aprovação profissional real antecede publicação técnica; não existe ato de aprovação implícito neste contrato.

16: condições reais dos provedores e retenção; 17: execução sob manifesto fixado e dependências, com nova medição de resposta útil; 18: operação e destino dos alarmes; 19: bytes e cálculo por revisão do artefato; 21: exportação/reimportação. Não antecipar Temporal, Office nativo nem ensaios com usuários.
