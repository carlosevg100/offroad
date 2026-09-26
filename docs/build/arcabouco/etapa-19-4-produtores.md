# Etapa 19, incremento 4: produtores no comando comum

Parte A (banco e robô) numa PR sobre `main` com a 2b (`f32a5bc5`, PR #813) e o incremento 5 (`b8e4a537`, PR #811): a migração B `supabase/migrations/20260926203623_artifact_producers.sql` (aplicada em staging como `20260926203509` e em produção como `20260926203623`), as provas `supabase/tests/artifact_producers.sql`, o mapeamento único no contrato (`packages/domain-contracts/src/artifact-protocol.ts`), o robô com `artifact-revision.v1` exigida e os materiais da prévia gravados pelo comando, e os corpos efetivos das duas funções alteradas. A parte B (a tela da execução lendo os blocos pelo leitor autorizado e a resposta da conversa apontando a revisão) espera o incremento 3 em `main`.

## O que cada produtor escreve

### O resultado da execução, no commit

`private.commit_work_execution_result_v1` chama, na mesma transação e logo depois do recibo e do marco do resultado, `private.record_execution_result_artifact_v1(org, execução, job)`, que grava uma revisão de `execution_result` por `private.create_artifact_revision_v1`:

- **Identidade.** Artefato do trabalho da execução com `kind` `execution_result` e assunto `execution:<id da execução>`: um artefato por execução, revisão 1, id da revisão UUID v5 de `offroad:artifact-revision:execution_result:<id da execução>`. Origem `worker`, audiência `internal`, sem bytes, sem autor pessoa.
- **Blocos.** `private.execution_result_blocks_v1(pacote)`, espelho em SQL de `capitalProcedurePacketBlocks` do contrato, com as mesmas chaves, tipos, conteúdo e afirmações, na mesma ordem: `framing` (situação, pergunta, data base e número de contribuições), `alternatives` (tabela; uma afirmação `judgment` por alternativa, com o rótulo e, como suporte, as impressões da base e do cálculo da projeção), `ratios` (tabela, quando há índices; uma afirmação `calculation` por índice com o valor exibido, unidade `ratio`, período na data de medição e a impressão do índice), `recommendation` (quando há; uma afirmação `judgment` de id `recommendation` com a alternativa recomendada e as decisões de base), `information-gaps`, `contractual-gaps`, `next-requirements` e um bloco `number` por número decisivo (`decisive:<pergunta>:<posição da alternativa>`), cada um com a sua afirmação `calculation`, valor, moeda, período e `supportIds`. O número decisivo é escolhido pela regra de `deriveCapitalChartSeries` (por alternativa com linhas calculadas e por pergunta, a primeira linha de menor valor; empate fica com o período mais antigo) por comparação numérica exata, e copiado do pacote sem conta.
- **Manifesto.** Método pela release que a execução rodou (`private.execution_dependencies`, `method_release`: procedimento, release da plataforma, release da casa e versão); execução `{executionId, resultFingerprint, inputFingerprint}` com as impressões do recibo; retrato dos insumos pela impressão do snapshot da execução; fontes como o adaptador as junta (as fontes contratuais do pacote primeiro, na ordem dele, depois as demais fixadas, por id), cada fonte fixada com a versão de direitos fixada na execução; resumo de afirmações igual ao dos blocos; rastros do pacote, da entrega da decisão, da versão do `financial-core`, de cada índice e, quando a execução tem recibo de portões, `execution-gates:<impressão>`; proveniência `work-execution-commit` com o job e a capacidade `pinned-execution-consumer.v1`.
- **Vínculos.** Os da revisão saem do manifesto (fontes com o pino, execução, release do método); as premissas adotadas que a execução fixou entram como vínculos `assumption_slot`.
- **Replay.** Um commit repetido volta antes do produtor, como volta antes do marco, e não acrescenta nada. O produtor em si é idempotente: o id derivado já existente devolve a mesma revisão, e o núcleo repete pelo fingerprint do manifesto.
- **Nunca falha o commit.** Um resultado que não é `capital-procedure-packet.v2` (o marcador parcial, outro método, versão desconhecida) não grava revisão e é relatado como `execution_result_unmappable`. Qualquer falha do artefato (bloco inválido, identidade repetida, fonte recusada) desfaz só a subtransação do produtor, deixa um aviso com a classe do erro (nenhum valor do resultado) e é relatada como não gravada; o commit segue.
- **Trava.** O produtor chama o núcleo sem travar projeto e trabalho: o commit mantém a sua ordem de travas, e a revisão é nova por execução, então só a linha do próprio artefato é travada.

### Os materiais da prévia, no robô

Onde o robô grava a apresentação (pptx) e a planilha de decisão (xlsx) pelo par de comandos da concessão de upload, ele grava em seguida a revisão por `public.worker_create_artifact_revision_v1` (capacidade `artifact-revision.v1`): `kind` `presentation` ou `workbook`, assunto `integration-preview:<superfície>`, audiência `internal`; manifesto de `manifestFromRenderedMaterialManifest` com `bytes.storage {bucket, path}`, o sha256 e o tamanho do objeto guardado, o formato, o contrato de decisão como retrato dos insumos, o template (a versão guardada do template do cliente quando o arquivo foi renderizado com uma, pelo incremento 5; o template da casa, que não é guardado, pelo id e versão do recibo), sem método e sem fonte (a prévia não roda release publicada nem lê versão de fonte); um bloco `renderedMaterialBlocks` com as afirmações que o renderizador pôs no arquivo, na ordem do recibo, com valor, unidade e suporte do contrato de decisão. Um arquivo sem afirmação não tem substância material e não grava revisão (o log diz `integration_preview.material_revision_skipped`).

No banco, o núcleo passa a aceitar `bytes.storage` só para um objeto que o upload governado guardou para o trabalho: concessão `stored` em `private.capital_project_material_upload_grants` com o mesmo caminho, sha256, tamanho e formato, e o objeto presente no bucket `case-artifacts`; senão `artifact_stored_bytes_not_governed`. A regra vale para as duas entradas (pessoa e robô), porque mora no escritor único.

### Backfill

`private.backfill_execution_result_artifacts_v1()` passa o mesmo produtor por todo recibo sem revisão e imprime as contagens. Staging e produção tinham zero recibos de execução quando isto foi escrito, então a migração deve imprimir zero nos dois.

## Funções alteradas, agulha e exceção

- `private.commit_work_execution_result_v1(uuid,text,uuid,text,text,text,text,text)`: patch de texto com agulha única ` perform private.record_execution_result_milestone_v1(j.organization_id,j.execution_id);` seguida de quebra de linha; acrescenta depois dela um comentário e ` perform private.record_execution_result_artifact_v1(j.organization_id,j.execution_id,j.id);`. Exceção `execution_result_artifact_contract_changed` se a agulha não for única ou a chamada já existir.
- `private.create_artifact_revision_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,bigint,jsonb,uuid,uuid,uuid,boolean)`: patch de texto com agulha única ` perform private.validate_artifact_manifest_v1(p_manifest);` seguida de quebra de linha; acrescenta depois dela a conferência dos bytes guardados. Exceção `artifact_stored_bytes_contract_changed` se a agulha não for única ou a conferência já existir.

Os corpos efetivos das duas estão em `docs/build/schema-history/effective-function-bodies/` (o do núcleo entra pela primeira vez), capturados de uma réplica local descartável de todas as migrações (Postgres 18) cujos outros 92 corpos são iguais ao snapshot byte a byte. **O lead recaptura, depois da aplicação, os corpos de staging e de produção dessas duas entradas.**

## O que fica sem pino e por quê

- As três funções novas (`private.execution_result_blocks_v1`, `private.record_execution_result_artifact_v1`, `private.backfill_execution_result_artifacts_v1`) são criadas inteiras pela migração e não são reescritas por texto; o snapshot só cobre as funções reescritas por texto, e o texto delas está na própria migração.
- As entradas `public.worker_create_artifact_revision_v1` e `public.create_artifact_revision_v1`, os leitores e o validador do manifesto não mudam: a conferência dos bytes está no núcleo, que as duas entradas alcançam.
- O teste do MD não é bloco. Ele é avaliado pelo avaliador único em TypeScript (`evaluateMdTest`) sobre o pacote e o recibo de portões, com a rubrica e o catálogo de situações do `credit-playbook`; reproduzir isso em SQL criaria uma segunda regra e uma segunda fonte de conhecimento operacional. O manifesto fixa o recibo de portões sobre o qual o teste é avaliado (`execution-gates:<impressão>`), e a tela continua avaliando sobre o pacote comprometido e esse recibo exato.

## Contrato

- `artifactBlockDraftSchema` e `blockDraftsClaimsSummary`: o bloco como o produtor o envia ao comando e o resumo de afirmações na ordem de envio.
- `capitalProcedurePacketBlocks` e `compareDecimalText`: o mapeamento acima e a comparação exata de textos decimais.
- `manifestFromCapitalProcedurePacket` passa a tirar o resumo de afirmações dos blocos. O adaptador anterior repetia o id da alternativa recomendada num bloco `recommendation`, e o comando recusa id de afirmação repetido na revisão (`duplicate_claim_id`); agora a recomendação é a afirmação `recommendation`. O contexto aceita o procedimento da release fixada e a impressão do recibo de portões.
- `manifestFromRenderedMaterialManifest` fixa em `template.templateVersionId` a versão guardada do template (`versionId` do recibo, do incremento 5) e, sem ela, o id e a versão do recibo.
- `renderedMaterialBlocks`: o bloco único de um arquivo guardado. Mapeamento do estado de evidência para o tipo de afirmação: observado público `public_source`, observado privado `fact`, calculado, misto e não computável `calculation` (as premissas ficam em `supportIds`), premissa `judgment`.
- Fixture compartilhada: `packages/domain-contracts/src/fixtures/execution-result-packet.json` e `execution-result-blocks.json`. O teste do contrato exige que o mapeamento em TypeScript devolva exatamente esses blocos, e a prova SQL exige o mesmo de `private.execution_result_blocks_v1` e dos blocos gravados pelo commit, então os dois lados provam a mesma saída.

## Provas

`supabase/tests/artifact_producers.sql` (sintético, com rollback), oito blocos: (1) o mapeamento SQL do pacote compartilhado é o do contrato; (2) um commit com fonte fixada grava exatamente uma revisão `execution_result`, com o id derivado, origem `worker`, sem bytes, manifesto com as impressões do recibo, o retrato dos insumos, a release, a fonte com o pino da execução (a fonte contratual do pacote junta na mesma entrada), rastros e job, blocos iguais aos do contrato, quatro blocos numéricos cada um com a sua afirmação e suporte, vínculos de execução, método e fonte, e o leitor devolve `released` pelo recibo e `current`; (3) o commit repetido volta como replay e não acrescenta revisão, e o produtor repete a sua; (4) um marcador parcial e um pacote com valor decisivo que não é texto decimal ainda comprometem, sem artefato; (5) o backfill não acrescenta nada; (6) a revisão do material leva o sha256 e o tamanho do objeto guardado e é recusada com tamanho diferente, concessão não guardada, objeto ausente do bucket ou caminho sem concessão; (7) o job de outro tenant não escreve no trabalho e o outro tenant e um membro sem acesso não leem o resultado; (8) as três funções novas fechadas a todos os papéis de API. Rodada numa réplica local descartável (Postgres 18): as 403 migrações do zero (com a do incremento 5), esta prova verde, todas as outras provas SQL verdes como antes (142 de 144 arquivos com o ensaio 7A) (as duas que falham nessa réplica por diferenças do Postgres 18 falham também sem a migração e passam na CI), corpos efetivos iguais ao snapshot. Vitest: `packages/domain-contracts` (104 testes), `apps/document-worker` (com a prévia gravando as duas revisões com os bytes guardados, a revisão da apresentação fixando a versão guardada do template do cliente, e a fila chamando o comando com a capacidade).

## Aplicação

1. O robô pode ser implantado antes ou depois da migração B: ele exige `artifact-revision.v1`, que o banco lista desde a 2b; sem a migração B o núcleo só não confere os bytes guardados.
2. Migração em staging e depois em produção; para com `execution_result_artifact_contract_changed` ou `artifact_stored_bytes_contract_changed` se um dos corpos divergir. O backfill imprime as quatro contagens (zero esperado nos dois).
3. Renomear o arquivo para o carimbo registrado; recapturar os dois corpos efetivos acima; conciliar inventário, catálogos e journals com os três objetos novos; advisors. Os tipos da web não mudam (nenhuma assinatura pública nova ou alterada).

Reversão: devolver os dois corpos anteriores (os do snapshot antes desta PR) e apagar as três funções novas; as revisões já gravadas ficam, imutáveis, como qualquer revisão.

## Parte B, pendente

A tela da execução (`work-execution-detail.tsx` e o carregador) passa a ler os blocos da revisão `execution_result` pelo leitor autorizado do incremento 3 e mostra alternativas, lacunas, requisitos e números decisivos a partir deles, mantendo a regra de leitura só com insumos correntes e o recibo de leitura; a execução sem revisão (legado) mostra o que mostra hoje. A resposta da conversa que cita um resultado de execução leva o id da revisão nos metadados e a interface aponta para ela.

## Limites

- A revisão do resultado usa o `authorization_subject_id` do job como sujeito de direitos, o mesmo que o commit usa para conferir os insumos correntes; uma fonte que esse sujeito não pode derivar faz o artefato não ser gravado, e o commit segue.
- O número decisivo é selecionado, não recalculado, e a igualdade com a série do gráfico está provada na fixture compartilhada e na regra; um pacote cujo valor não é texto decimal não gera revisão.
- Um id de alternativa, índice ou período maior que o limite do contrato para afirmações (160 caracteres no id, 80 no período) torna o pacote não mapeável; nenhum pacote real conhecido chega perto.
- A conferência dos bytes guardados lê a concessão de upload; a rotação de Storage de 1B renomeou objetos antigos de `case-artifacts` sem atualizar concessões, e produção não tem objeto nesse bucket, então nenhum material existente é afetado.

## Decisões do lead, 26/09/2026

1. O teste do MD não vira bloco. Ele é uma avaliação da revisão, não uma afirmação material, e precisa do avaliador em TypeScript e do catálogo de situações do playbook; uma cópia em SQL seria uma segunda regra. A revisão fixa o pacote e o recibo de portões (`execution-gates:<impressão>` nos rastros), e a tela avalia o teste na leitura sobre esses dois, com o mesmo avaliador de hoje. Um comando v2 de commit com blocos calculados pelo robô fica fora desta etapa.
2. Um artefato por execução (`execution:<id>`). Recálculos não encadeiam revisões do mesmo artefato; a atualidade vem do vínculo com a execução, como a etapa 18 já avalia.
3. Os vínculos com as premissas que a execução fixou ficam na revisão, porque são parte do grafo de dependências do resultado.

## Resultado da aplicação, 26/09/2026

O texto aplicado tem o md5 do arquivo revisado (`9c9537d8`) nos dois bancos. Antes da aplicação, as duas agulhas existiam uma vez em staging e em produção, com os corpos anteriores iguais entre os bancos. Staging registrou `20260926203509` e produção `20260926203623`. O backfill não encontrou recibo de resultado em nenhum dos dois, e as 133 revisões legadas da produção ficaram intactas. Os dois corpos alterados, lidos nos dois bancos, são iguais ao snapshot (sha256 `f2e39d37` e `6bf6bab4`). Os advisors de segurança não acusam nada. Os cinco objetos capturados (três novos e as duas funções alteradas) são iguais entre produção e staging, e os tipos gerados da produção são iguais aos da web.
