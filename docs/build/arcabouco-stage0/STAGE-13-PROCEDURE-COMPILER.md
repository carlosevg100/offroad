## Etapa 13: contrato de procedimento e compilação

O incremento implementa seis tipos de componente, contratos recursivos de entrada/saída,
dependências versionadas, ferramentas, efeitos, orçamento, direitos herdados, competências
e invariantes protegidas. `procedure-compiler.ts` rejeita composições inválidas e produz
manifesto reprodutível com hashes de fontes, compilador, executor e evidência.

O manifesto de roteamento/capacidades/aprovações agora é gerado; o teste compara seus bytes
com a recompilação. Os onze métodos anteriores passam pelo adaptador compatível. R01
preserva fonte, aprovação, versão, política e cálculo; o worker confere a proveniência
compilada antes da execução, além dos gates anteriores. O candidato de estrutura de capital
continua incompleto, sem executor, vínculo de tarefa, aprovação ou execução concedida.

Saem os limites universais de 12 estágios e três chamadas; orçamento é explícito. `false`
é lido corretamente e chaves repetidas são recusadas. Runs novos podem fixar o manifesto;
registros históricos mantêm seus fingerprints. O molde de autoria foi atualizado.

Sem DDL, backfill ou dado descartável em produção. Arquivos históricos com hash fixado são
identificados pelo índice, mantendo seus bytes; registries com consumidores/IDs distintos
permanecem. Publicação/composição efetiva é etapa 14; fórmulas profissionais e aprovação de
conteúdo, etapa 15; aplicação dos limites na execução, etapas 17/18. Retenção permanece na
16, notificações operacionais na 18 e auditoria integral na 23. Nenhuma dessas etapas é
antecipada por compilar o candidato. Provas locais/CI e deploy exato são exigidos para o
completion; implementação presente não significa entrega concluída.

## Verificação e contenção

Controles TRUST-APP-01, TRUST-DATA-01 e TRUST-OPS-02. Negativos cobrem dependências
inexistentes/cíclicas, versão, output sem tipo, executor ausente/não registrado/contrato
incompatível, ferramenta/efeito/orçamento não permitido, remoção de invariantes e direitos,
bloco malformado e identidade de fonte/executor adulterada. Compilação não confere publicação.

O gerador utiliza bytes locais versionados e não envia dados a modelos ou terceiros.
A projeção guarda hashes e metadados de implementação, sem documentos de cliente.
O build não adiciona fornecedor ou dependência; reutiliza o bundler já instalado.
Rollback: revert do incremento e novo deploy, sem alteração de banco ou republicação de R01.
Se a fonte divergir da projeção, a CI falha; se a proveniência do método não conferir,
o worker recusa o método antes do cálculo. Não há fallback para execução sem manifesto.

A primeira versão do contrato de componentes não declara prontos os componentes financeiros
que a autoria ainda precisa fornecer. A integração de executores adicionais é explícita e
testada em seu incremento; nenhum módulo citado no texto é carregado dinamicamente.


## Correção encontrada na CI

O CodeQL identificou retrocesso excessivo na expressão que lia blocos de autoria com
muitas quebras de linha e tabulações. O parser agora percorre as linhas sem expressão
com retrocesso, mantém a exigência de bloco único e rejeita blocos incompletos. O teste
`scans whitespace-heavy authoring sources without a backtracking expression` cobre
50 mil repetições, com bloco válido e abertura sem fechamento. O manifesto foi regenerado
pelo comando de compilação; nenhum hash foi ajustado manualmente. A ausência do alerta
na nova CI é condição de merge.
