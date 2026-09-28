# Etapa 20, incremento 2: fundação aditiva de revisão e decisão

O fundador aprovou em 28/09 o reagrupamento após a incompatibilidade reproduzida em staging: os escritores antigos não possuem recibo completo de fontes nem declaração explícita de autoaprovação. Este incremento acrescenta a persistência e os comandos novos. A troca de liberação e as projeções dos escritores ficam para o corte integrado com produtores, adaptadores e interface, dentro da mesma etapa 20.

## Escopo

`artifact_reviews` e `work_decisions` registram atos imutáveis sobre revisão ou base exatas. Comandos repetidos com conteúdo diferente são recusados. Decisões que partem da mesma versão permanecem contestadas até resolução explícita de todas as pontas. Resultado `rejected` nunca enfileira execução nem recálculo; `confirm_assessment` pode congelar a rejeição humana. Relatos mantêm origem, data e resultado `recorded`, sem efeitos operacionais.

Os leitores novos verificam todas as fontes e decisões referenciadas. Base recusada ou sem fechamento comprovado entrega somente metadados mínimos; não entrega nota, relato, base ou comentário. Não há SELECT ou DML direto de cliente nas seis tabelas novas. A fábrica privada de recibos não é acessível ao cliente e ainda não autoriza um produtor legado a presumir sua origem histórica.

A alçada dos projetos já atribuídos é preservada no novo campo `assignment_required`. Atribuir papel pelo escritor atual materializa `required` quando o projeto ainda herda o regime; `not_required` explícito permanece. Remover o último aprovador deixa o projeto esperando atribuição, em vez de liberar qualquer participante. Histórico de atribuição sobrevive à exclusão de membership e permite reassociação auditada para pessoa elegível; aprovações anteriores nunca mudam de autor.

O replay de `create_artifact_revision_v1` agora compara também blocos ordenados e dependências normalizadas. Texto, valor, suporte, âncora ou origem alterados não podem reutilizar uma revisão existente com o mesmo manifesto. A definição literal preserva a guarda atual que exige upload governado para bytes armazenados. Não reescreve revisões existentes.

## Eval antes da aplicação

Em staging, com migração em transação e rollback: `revision_bound_decisions.sql`, `artifact_revision_exact_replay.sql`, `artifact_revision_protocol.sql`, `artifact_producers.sql`, `project_review_roles.sql` e `rls_non_interference.sql` passaram. As sete fixtures compartilhadas de classificação e as seis de autorização passaram no banco. Os 131 testes de domínio passaram localmente.

`test-review-concurrency.py` está ligado à CI: decisões competidoras, suspensão de identidade, remoção de papel, mudança de política nas duas ordens, revogação da fonte e revogação da aprovação-base versus reafirmação nas duas ordens. Exige duas sessões reais, espera observada e estado final; seu resultado ainda precisa ser registrado depois da execução. As fixtures imutáveis desse teste existem somente no banco descartável da CI.

Revisão independente identificou e corrigiu a perda de alçada por defaults abertos. A revisão final não apontou outro bloqueador estático. Ela não substitui a execução dos testes concorrentes.

## Promoção e limites

Ainda em preparação: migração permanente, catálogo, tipos, advisors, CI de publicação e deployments. Nenhum critério pendente é tratado como pronto. O relatório de publicação será acrescentado aqui com carimbos e runs efetivos.

Controles: IAM-05 (alçada), APP-04 (validação), APP-11 (imutabilidade e derivação), AI-09 (ato humano), SDLC-08/10 (gates). A adição não muda a publicação no cofre, introdução, estado de execução ou o cálculo atual de `release`. O corte integrado continua sendo responsabilidade da etapa 20; não é transferido para a 21. Não houve dados descartáveis em produção ou chamadas pagas de modelo.
