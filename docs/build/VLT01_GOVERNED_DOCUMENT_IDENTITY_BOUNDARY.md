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
- artefatos imutáveis e a versão/configuração exata da ferramenta produtora;
- coverage objects com escopo e backlink;
- predecessor e sucessor persistidos.

As operações `compile` e `append` validam integralmente o objeto antes de retornar. `append` valida
primeiro todo o núcleo e todo o histórico recebido, incluindo autorização corrente e targets de
supersessão, e valida novamente o histórico completo após acrescentar a revisão.

## Resolução atômica de `source_documents`

Uma única resolução confiável liga, na mesma atestação assinada:

- `organization_id`, `opportunity_id`, `intake_session_id` e o projeto canônico;
- `companyId` e `conversationId`, quando existentes;
- `id`, `document_version`, `bucket_id`, `object_path` e object version não móvel;
- `sha256`, `sha256_verified_at`, bytes lidos e tamanho;
- locator derivado de bucket + path, ator, origem e conector registrados;
- versão da política de autorização e timestamps de autorização/captura/assinatura.

O compile falha fechado se o hash ainda não foi verificado, se faltar object version, se nenhum dos
dois escopos existir, se locator e linha divergirem, se os bytes mudarem, se a autorização vier após
a captura, se a assinatura anteceder a verificação ou se a assinatura não validar. Locators
`content_addressed` precisam ser exatamente `sha256:<hash real>`.

## Invariantes e testes adversariais

Os testes executáveis reproduzem os sete bypasses da revisão:

1. tentativa de injetar tenant, ator ou atestação no comando;
2. divergência entre escopo, row, versão, bucket/path, object version, hash, bytes e assinatura;
3. append sobre histórico adulterado e construção com cronologia inválida;
4. retorno de estado terminal, target inexistente, incoerente ou inativo;
5. reutilização de layer/derivative id com identidade diferente;
6. ator de revisão não registrado e origem/conector fora do registry;
7. escopo de companhia/conversa, cronologia da autorização, locator por conteúdo e relatório opaco.

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
5. persistência append-only idempotente, lock/compare-and-swap e race tests;
6. FKs compostas, FORCE RLS, grants mínimos, backfill e rollback;
7. integração do worker por facade pré-vinculada, sem dependências construídas do payload;
8. gate de staging com overwrite, revogação, cross-tenant, concorrência e non-interference.

Nenhuma capacidade de Vault, data room, upload ou retrieval muda de maturidade por causa desta
fatia. Conectores externos só podem existir quando registrados como `verified_connector`.
