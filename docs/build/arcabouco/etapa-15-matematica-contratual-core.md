# Etapa15: matemática contratual no núcleo financeiro

A composição revelou cálculos numéricos ainda localizados no playbook. Os kernels completos de juros/indexação e reconciliação de covenants foram movidos para financial-core/contractual-interest.ts e contractual-covenants.ts. Suas entradas antigas no playbook são somente reexports. Não foi criada outra implementação nem removido um consumidor.

Os cálculos comuns antes no index.ts foram extraídos para credit-math.ts, mantendo o index como fachada. Isso evita dependência circular e dependência do núcleo sobre o playbook. Zod4.4.3, já usado no repositório, passa a ser dependência explícita do núcleo para os schemas preservados; o lockfile altera apenas esse vínculo e os tipos Node20.19.43 já fixados no repositório.

Corpos das fórmulas são idênticos após a troca dos imports. Versõesv7/v8 dos juros, v14 dos covenants e financialCoreVersionv24 conservam a mesma semântica. A mudança dos caminhos é capturada pelo manifesto de fontes, sem reescrever artefatos publicados. Os21 casos registrados são reexecutados e conservam seus fingerprints. Dois testes de fronteira impedem retorno da matemática aos wrappers e dependência reversa;39 testes legados e17 de preparação/registros também passaram localmente.

Sem DDL, credenciais, calls de modelo ou dados de cliente. Aliases só devem ser retirados quando não houver consumidor, em incremento explícito. Revisão independente, aprovação do conteúdo e publicação auditada permanecem requisitos da15. Gates integrais,CI e produção são registrados no completion externo após execução.
