# Etapa 20, incremento 2: fundação aditiva de revisão e decisão

O fundador aprovou em 28/09 o reagrupamento após a incompatibilidade reproduzida em staging: os escritores antigos não possuem recibo completo de fontes nem declaração explícita de autoaprovação. Este incremento acrescenta a persistência e os comandos novos. A troca de liberação e as projeções dos escritores ficam para o corte integrado com produtores, adaptadores e interface, dentro da mesma etapa 20.

## Escopo

`artifact_reviews` e `work_decisions` registram atos imutáveis sobre revisão ou base exatas. Comandos repetidos com conteúdo diferente são recusados. Decisões que partem da mesma versão permanecem contestadas até resolução explícita de todas as pontas. Resultado `rejected` nunca enfileira execução nem recálculo; `confirm_assessment` pode congelar a rejeição humana. Relatos mantêm origem, data e resultado `recorded`, sem efeitos operacionais.

Os leitores novos verificam todas as fontes e decisões referenciadas. Base recusada ou sem fechamento comprovado entrega somente metadados mínimos; não entrega nota, relato, base ou comentário. Não há SELECT ou DML direto de cliente nas seis tabelas novas. A fábrica privada de recibos não é acessível ao cliente e ainda não autoriza um produtor legado a presumir sua origem histórica.

A alçada dos projetos já atribuídos é preservada no novo campo `assignment_required`. Atribuir papel pelo escritor atual materializa `required` quando o projeto ainda herda o regime; `not_required` explícito permanece. Remover o último aprovador deixa o projeto esperando atribuição, em vez de liberar qualquer participante. Histórico de atribuição sobrevive à exclusão de membership e permite reassociação auditada para pessoa elegível; aprovações anteriores nunca mudam de autor.

O replay de `create_artifact_revision_v1` agora compara também blocos ordenados e dependências normalizadas. Texto, valor, suporte, âncora ou origem alterados não podem reutilizar uma revisão existente com o mesmo manifesto. A definição literal preserva a guarda atual que exige upload governado para bytes armazenados. Não reescreve revisões existentes.

## Eval antes da aplicação

Em staging, com migração em transação e rollback: `revision_bound_decisions.sql`, `artifact_revision_exact_replay.sql`, `artifact_revision_protocol.sql`, `artifact_producers.sql`, `project_review_roles.sql` e `rls_non_interference.sql` passaram. As sete fixtures compartilhadas de classificação e as seis de autorização passaram no banco. Os 131 testes de domínio passaram localmente.

`test-review-concurrency.py` passou nos oito casos na CI `36415822103`, commit `bc35193d90c2320c6c62bd0edf3444c3d5040805`: `review_concurrent_decisions`, `review_suspension_first`, `review_assignment_removal_first`, `review_policy_change_first`, `review_approval_first`, `review_source_revocation_first`, `review_base_revocation_first` e `review_reaffirmation_first`. Todos usam duas sessões reais, espera observada e estado final. As fixtures imutáveis desse teste existem somente no banco descartável da CI; seus identificadores, fontes e token são isolados dos demais testes.

No mesmo run passaram todos os contratos SQL, a comparação das 94 funções efetivas, as regressões concorrentes de propriedade, adoção, contribuição, cofre, métodos, execução e revogação, R01 e a espera de dependência através de reinício do worker. O job de banco terminou com falha somente no gate de inventário/journal: a migração nova ainda não tinha aplicação permanente. Os três erros foram `migration_inventory_drift` (duas assertivas) e `migration_absent_from_production_journal`. Não se alterou o journal exportado para antecipar um carimbo inexistente. A rodada final precisa passar esse gate após aplicação e captura reais.

`pnpm check` local terminou com 44 de 44 tarefas aprovadas. A revisão independente de `bc35193d` confirmou que a correção de isolamento altera apenas a fixture, sem mudar migração, autorização ou assertivas.

Revisão independente identificou e corrigiu a perda de alçada por defaults abertos. A revisão final não apontou outro bloqueador estático. Ela não substitui a execução dos testes concorrentes.

## Promoção e limites

Migração permanente aplicada com o mesmo SQL: staging `20260928114813`, produção `20260928115102`, em 28/09/2026. O arquivo foi renomeado para o carimbo de produção, sem reaplicação. O SHA-256 do arquivo e do SQL registrado nos dois journals é `60aafd4e6adee2d8c2e3ca6736171d0862f84d0580b3ef84e158194e181a993e`. Os seis testes SQL acima passaram novamente no staging instalado, todos com rollback. Os 29 corpos de função da migração têm SHA-256 idêntico nos dois ambientes; o escritor de artefatos confere com o snapshot (`cc6786037ad1d04ab6fb470f782caa334629ed85cbea3f766ffbcfa9f907cf55`).

Catálogos capturados ao vivo: produção 2.726 objetos, staging 2.787; 86 objetos novos inventariados. Os dois conferidores de catálogo não apontaram diferenças; as 18 assertivas do checker passaram após a captura real. Tipos regenerados de produção. Advisor de segurança: zero alertas nos dois ambientes. Performance: nenhum achado novo de FK sem índice ou políticas permissivas nas tabelas novas; nove índices novos ainda sem uso em staging são informativos e permanecem para seus caminhos previstos. Alertas históricos não foram removidos sem análise.

Produção conferida somente por leitura: 133 revisões e uma decisão legada, mesmas contagens anteriores; zero revisões humanas, decisões novas e recibos nas tabelas novas. A definição de `artifact_revision_release_v1` continua com MD5 `c4b6a8c3730c2de36392023c571b73b2` nos dois ambientes. Nenhuma fixture foi inserida em produção.

CI pré-aplicação `36415822103`: qualidade aprovada; E2E com 44 aprovados e 16 pulados (pulados não contam como evidência); banco passou nos testes e falhou somente no inventário ainda não conciliado naquela rodada. A CI final com os catálogos instalados, merge e deployments permanecem pendentes e serão registrados antes do fechamento do incremento.

Controles: IAM-05 (alçada), APP-04 (validação), APP-11 (imutabilidade e derivação), AI-09 (ato humano), SDLC-08/10 (gates). A adição não muda a publicação no cofre, introdução, estado de execução ou o cálculo atual de `release`. O corte integrado continua sendo responsabilidade da etapa 20; não é transferido para a 21. Não houve dados descartáveis em produção ou chamadas pagas de modelo.
