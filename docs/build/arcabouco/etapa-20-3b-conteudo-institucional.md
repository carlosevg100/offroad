# Etapa 20, 3B: contrato de conteúdo institucional

28/09/2026. Incremento aditivo do corte integrado aprovado. Preparação de conteúdo, sem consumidor runtime neste incremento. Não conclui a etapa 20.

## O que faz

`apps/document-worker/src/institutional-artifact-content.ts` converte o JSON de um workbook persistido em blocos nativos, sem cálculo ou renderização. O bloco `workbook` conserva o envelope inteiro, incluindo os dois recibos de bytes, auditorias, períodos e fingerprint. Cada cenário tem seu bloco, na ordem original, com input, decimais exatos, premissas, texto, linhagem, fontes declaradas e metadados da revisão histórica. Reunir os blocos reproduz o JSON original. Nenhuma claim é inventada para satisfazer substância.

A entrada nomeia organização, trabalho, resultado, configuração/fingerprint, manifesto de fontes/fingerprint e ancestral. O adaptador confere a identidade com a revisão e o artefato ancestral recebidos; não consulta nem escolhe a cabeça mais recente. Recusa fingerprint de conteúdo inválido, cenário ativo ausente/divergente, IDs de cenário repetidos, origem divergente, versão desconhecida e campos descartados silenciosamente pelo parser. Registra `institutional-artifact-content.2026.09.28-v1` e o ID/fingerprint do ancestral. Retorna valor congelado sem modificar a entrada.

## Limite de autoridade

A saída não é um manifesto ou uma revisão gravável. `declaredReferences` conserva as referências de bindings e linhagem de todos os cenários, com sua origem; `sourceClosure: unproven` permanece mesmo com lista vazia. `revisionReview: required` não transforma revisão histórica de configuração em aprovação da nova representação. Não emite receipt, resolve direito atual, concede acesso ou libera conteúdo. O futuro comando deve buscar origem e ancestral no banco autorizado; aceitar estes objetos de um cliente não autentica seu conteúdo.

O contrato puro permanece sem consumidor até a ligação transacional deste produtor no corte da etapa 20. Isso é deliberado: publicar um adaptador não autoriza preencher uma revisão com fontes vazias. Não há migração, backfill, alteração de política, nova rota, job ou chamada de modelo.

## Achado que orienta o incremento seguinte

`institutional_configuration_provenance` recupera a configuração inicial, não todas as contribuições intermediárias. `institutional_configuration_source_versions_v1` associa o ID, sem conferir versão/hash declarados. O grafo de resultados parte da configuração principal, não de todos os cenários. Além disso, o worker recebe todos os candidatos e os concilia antes de preparar os inputs; bindings citados não comprovam todo o contexto consumido. O hash de contexto sem seu corpo persistido não permite reconstrução histórica.

Por isso, nem configuração inicial com submissão existente recebe recibo completo automaticamente. A captura futura deve fixar o contexto realmente entregue e as contribuições/importações resolvidas, na mesma transação do produtor autorizado. Histórico sem prova permanece incompleto; não reconstruir com documentos atuais. Revisão independente concordou com o recorte e retirou a hipótese anterior de elegibilidade automática da configuração inicial.

## Eval e publicação

`institutional-artifact-content.test.ts`: round-trip integral, segundo cenário e fontes exclusivas, precisão decimal e texto, ancestral diferente da cabeça, determinismo e PT/EN, negativas de organização/trabalho/resultado/configuração, fingerprints, ancestral, cenário ausente/repetido, fontes vazias desconhecidas, versão desconhecida, adulteração e descarte silencioso. Os 14 testes novos, typecheck e `pnpm check` completo passaram localmente (44/44 tarefas de build). A revisão independente final não encontrou bloqueador e confirmou o limite de autenticação do ancestral no produtor futuro. Quality remota, main e deployments ainda necessários para fechar este incremento.

Conferência somente leitura: produção com 408 migrações (última `20260928140508`) e 133 revisões; staging com 422 migrações (última `20260928140015`) e zero revisões. Corpo da função de liberação idêntico nos dois ambientes, MD5 `7b9e46b1c9257544c196aaaf6cd3a634`; definição completa de produção mantém MD5 `c4b6a8c3730c2de36392023c571b73b2`. Verificador offline das 94 funções efetivas aprovado. Não há migração nova neste incremento.

Controles APP-02/04, DATA-03/12 e SDLC-08/10. Nenhum dado sai do processo e nenhuma telemetria é criada. O contrato não autentica dados nem verifica bytes renderizados: preserva os pinos existentes, sem representar essa preservação como novo ensaio de renderização. Contenção: retirar o consumidor futuro; este incremento não tem caminho ativo a desligar.

Próximo passo da mesma etapa: produtor com captura dos insumos, resolvedor de cadeia e recibo transacional; depois persistência de revisões nativas, interface de revisão e corte de liberação juntos. Sem alteração da ordem aprovada e sem início da etapa 21.
