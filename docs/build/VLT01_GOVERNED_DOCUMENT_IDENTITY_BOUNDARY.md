# VLT-01 - identidade governada de documento e versão (fatia interna)

Status: `code_complete_candidate` | exposição: `internal_shadow` | data-base: 7 de setembro de 2026

## O contrato entregue

O contrato em `packages/document-intelligence/src/governed-document-identity.ts` separa:

1. núcleo imutável: escopo, companhia, conversa, documento, versão, bytes, objeto de Storage,
   origem registrada, ator de captura e atestação assinada;
2. histórico append-only: ator de cada revisão, classificação, ferramentas, camadas, derivados,
   cobertura e estado de supersessão.

Enriquecer ou reprocessar cria uma revisão ligada à anterior. O fingerprint do núcleo não muda.
Camada ou derivado com o mesmo id também não pode mudar: conteúdo novo exige id novo. O estado é
irreversível: `current` pode terminar em `superseded`, `withdrawn` ou `rejected`; um estado terminal
nunca volta a `current` nem troca de target ou motivo.

## Raiz de confiança server-side

O request handler não fornece resolver, contexto de autorização, ator, atestação, origem, conector,
timestamp, locator ou hash. `bindGovernedDocumentIdentityServer` recebe uma raiz de confiança apenas
na composição do processo servidor e devolve uma facade congelada. Os comandos dessa facade aceitam
somente ids de documento/artefato e a intenção de lifecycle.

A raiz resolve e registra:

- o ator efetivo da operação e o registry de user, service e integration actors;
- autorização corrente;
- a linha de `public.source_documents`, seu escopo dual e o projeto/companhia/conversa derivados;
- origem, source id e connector id a partir de registry server-side;
- artefatos imutáveis, seus pais reais, a execução produtora e a versão/configuração exata da
  ferramenta, todos ligados por uma atestação assinada ao mesmo escopo e documento corrente;
- coverage objects com escopo e backlink;
- predecessor e sucessor persistidos.

As operações `compile` e `append` validam integralmente o objeto antes de retornar. `append` aceita
somente a referência opaca `identityRecordId`: a raiz carrega a identidade canônica, autoriza o ator
para a operação e o escopo e revalida toda a cadeia antes e depois de acrescentar a revisão. Cada
revisão recebe uma atestação de journal assinada; por isso, recalcular apenas os fingerprints comuns
de um histórico adulterado não o torna válido.

Uma mudança de classificação exige recibo de propósito explícito, assinado para a impressão digital da
revisão anterior, a revisão-alvo e um `operationId`. `receiptId`, `operationId` e `attestationId` são de
uso único no histórico; portanto, uma autorização antiga não pode ser reutilizada depois de uma nova
reclassificação.

Camadas extraídas usam uma identidade semântica discriminada. `layerKind` não é um rótulo independente:
cada valor admite somente a família MIME canônica correspondente (PDF, planilha, Word, apresentação,
CSV/texto ou imagem). Formatos legados permitidos são os mesmos que a esteira de parsers reconhece e
converte. Uma assinatura válida sobre uma combinação contraditória continua sendo inválida para o
contrato.

Atestações obedecem a uma cronologia fail-closed: artefato não pode ser assinado antes de `producedAt`,
recibo de classificação não pode ser assinado antes de `authorizedAt`, e journal não pode ser assinado
antes de `recordedAt`. Essas três atestações não podem avançar mais de cinco minutos em relação ao
relógio confiável server-side. Essa tolerância cobre apenas clock skew positivo; ela nunca relaxa a ordem
causal.

## Resolução atômica de `source_documents`

Uma única resolução confiável liga, na mesma atestação assinada:

- `organization_id`, `opportunity_id`, `intake_session_id` e o projeto canônico;
- `companyId` e `conversationId`, quando existentes;
- `id`, `document_version`, `bucket_id`, `object_path` e object version não móvel;
- `sha256`, `sha256_verified_at`, bytes lidos e tamanho;
- locator derivado de bucket + path, ator, origem e conector registrados;
- versão da política de autorização e timestamps de autorização/captura/assinatura.

O `object_path` é aceito somente na forma canônica relativa: sem barra inicial ou final, espaços,
segmentos `.`/`..`, barras duplicadas, backslash, escapes percentuais ou texto fora de NFC. O locator
é comparado contra essa chave exata; não existe normalização silenciosa após a atestação.

O compile falha fechado se o hash ainda não foi verificado, se faltar object version, se nenhum dos
dois escopos existir, se locator e linha divergirem, se os bytes mudarem, se a autorização vier após
a captura, se a assinatura anteceder a verificação ou se a assinatura não validar. Locators
`content_addressed` precisam ser exatamente `sha256:<hash real>`.

## Invariantes e testes adversariais

Os testes executáveis reproduzem os bypasses das revisões adversariais:

1. tentativa de injetar tenant, ator ou atestação no comando;
2. divergência entre escopo, row, versão, bucket/path, object version, hash, bytes e assinatura;
3. append por referência opaca sobre histórico canônico adulterado, inclusive quando o atacante
   recalcula o hash comum, e construção com cronologia inválida;
4. retorno de estado terminal, target inexistente, incoerente ou inativo;
5. reutilização de layer/derivative id com identidade diferente;
6. ator de revisão não registrado e origem/conector fora do registry;
7. escopo de companhia/conversa, cronologia da autorização, locator por conteúdo e relatório opaco;
8. mutação dos métodos da raiz depois do bind, que não altera a facade já capturada;
9. artefato reatestado com outro tenant, hash de documento ou pai fora do documento corrente;
10. path ambíguo/traversal e assinaturas com metadados de chave, algoritmo e versão adulterados.

Também permanecem verificados: parent imediato, fingerprints, tool+version+config, pais dos
derivados, DAG, coverage escopada, confidencialidade, versão corrente única e bytes não relabelados.
Os relatórios nunca expõem slugs ou ids de origem: `recordRef` e `relatedRef` são hashes opacos.

## Fronteira honesta

Esta fatia é o contrato e a facade server-side. Ela ainda não instala a raiz de confiança real no
worker nem prova a transação de persistência. Não altera upload, banco, Storage, retrieval, UI ou
produção. A integração permanece bloqueada até uma próxima fatia implementar e provar em staging:

1. adapter privilegiado com transação/RLS para a resolução atômica de `source_documents`;
2. assinatura com chave em KMS e rotação verificável;
3. Storage versionado/imutável e leitura dos bytes da versão atestada;
4. registries persistidos de atores, origens, conectores, ferramentas e configurações;
5. persistência append-only idempotente, lock/compare-and-swap e race tests; a facade já exige
   identidade canônica e journal atestado, mas a atomicidade da gravação pertence ao adapter;
6. FKs compostas, FORCE RLS, grants mínimos, backfill e rollback;
7. integração do worker por facade pré-vinculada, sem dependências construídas do payload;
8. gate de staging com overwrite, revogação, cross-tenant, concorrência e non-interference.

### Bloqueio explícito de concorrência

`append` nesta biblioteca compila uma proposta de nova revisão; não a persiste nem consome um recibo.
Por isso, duas chamadas concorrentes sobre a mesma revisão podem produzir a mesma proposta. O contrato
exporta essa limitação de forma legível por máquina em `governedDocumentIdentityRuntimeBoundary`:
persistência transacional externa, compare-and-swap obrigatório e proibição de autorizar qualquer efeito
antes da revisão estar committed.

A integração de runtime permanece bloqueada até o adapter, em uma única transação, bloquear a identidade,
comparar a impressão digital anterior e a revisão-alvo, consumir `receiptId`, `operationId` e
`attestationId` sob constraints únicas, gravar exatamente uma revisão e fazer a operação concorrente
perdedora falhar. A facade pura não simula essa atomicidade.

Nenhuma capacidade de Vault, data room, upload ou retrieval muda de maturidade por causa desta
fatia. Conectores externos só podem existir quando registrados como `verified_connector`.
