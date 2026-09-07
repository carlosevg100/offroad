# VLT-01 - identidade governada de documento e versão (fatia interna)

Status: `code_complete_candidate` | exposição: `internal_shadow` | data-base: 7 de setembro de 2026

## O que esta fatia realmente cria

Esta fatia cria um contrato puro para identificar os bytes exatos usados em um trabalho e manter
separados dois conceitos que não podem ser confundidos:

1. o núcleo imutável da versão: escopo autorizado, documento, versão, bytes, snapshot, origem,
   ator de captura e atestação de autorização;
2. o histórico append-only de processamento: classificação, ferramentas, camadas, derivados,
   cobertura e supersessão.

Enriquecer, reprocessar, acrescentar cobertura ou superseder uma versão cria uma nova revisão de
lifecycle ligada à anterior. Isso não muda o fingerprint do núcleo. Alterar tenant, projeto,
documento, versão, bytes ou snapshot muda ou invalida a identidade.

O contrato está em `packages/document-intelligence/src/governed-document-identity.ts`. Ele não
altera upload, banco, Storage, retrieval, worker, UI ou produção.

## Claims não são atestações

O compilador não aceita `organizationId`, `projectId`, `documentId`, `version`, caminho, hash,
ferramenta ou cobertura como verdade apenas porque chegaram no input. Uma implementação
server-side de `GovernedDocumentIdentityResolver` é obrigatória e precisa:

- resolver a autorização do ator para o escopo e a versão, com decisão externa verificável;
- mapear o binding real de `public.source_documents` ao projeto canônico;
- ler os bytes por locator imutável ou object version não móvel;
- verificar locator, object version, hash e imutabilidade da fonte e de cada derivado;
- confirmar tool id, versão e hash de configuração no registro autorizado;
- resolver cada coverage object, seu escopo e o backlink para a identidade.

Sem resolver, com autorização revogada, com relabeling de escopo/versão, com bytes diferentes ou
com atestação divergente, a compilação ou a revalidação falha fechada. O objeto serializado não é
autossuficiente para se declarar autorizado.

## Mapeamento explícito do estado atual

`source_documents` tem escopo dual: `opportunity_id`, `intake_session_id` ou ambos. A função
`mapSourceDocumentsRowBinding` preserva os dois campos e nunca inventa um `projectId`. A ligação ao
capital project continua bloqueada até um resolver autorizado consultar as relações reais e
atestá-la. O adapter rejeita uma linha sem nenhum dos dois escopos.

O contrato também exige bytes verificados independentemente. Portanto `sha256` declarado pelo
browser, `sha256_verified_at` isolado ou o binding da tabela não bastam para criar a identidade.

## Invariantes executáveis

Os testes adversariais cobrem:

- tenant, projeto, documento ou versão relabelados e autorização posteriormente revogada;
- locator divergente, fonte ausente, objeto móvel, object version divergente e hash falso;
- ferramenta inexistente ou mesma ferramenta com configuração diferente;
- derivado ausente, móvel, adulterado, sem pai, com pai falso ou em ciclo;
- revisão de lifecycle alterada, fora de sequência ou sem backlink para a revisão anterior;
- cronologia inválida entre captura, as-of, produção e registro;
- cobertura em outro escopo, fingerprint divergente ou sem backlink para o núcleo;
- mais de uma versão corrente, versão anterior órfã e supersessão não contígua;
- conflito de hash na mesma versão e mesmos bytes relabelados como nova versão;
- PII em referências de ator user, service ou integration;
- tentativa de declarar um data room arbitrário como integração suportada;
- fingerprint persistido adulterado.

Os relatórios contêm apenas códigos e referências opacas. Nenhum nome, e-mail, documento, trecho
ou valor financeiro é incluído.

## Fronteira honesta

Esta fatia ainda não prova persistência, RLS, autorização real, imutabilidade do bucket, comandos
atômicos, backfill, concorrência, integração do worker ou operação do Vault. O resolver definido
aqui é uma porta obrigatória; a implementação confiável dessa porta ainda não existe.

Também não existe conector de data room. `external_data_room` continua somente representável como
`unsupported`, sem `connectorId`. Importação manual futura não equivale a integração.

Antes de sair de `internal_shadow`, a próxima fatia deve provar em staging:

1. persistência tenant-scoped com RLS/FORCE RLS, grants mínimos e FKs compostas;
2. resolver server-side que derive escopo e versão do banco, nunca do payload do worker;
3. object versioning ou endereçamento por conteúdo com teste real de overwrite;
4. registro governado de ferramentas/configurações e armazenamento imutável de derivados;
5. coverage objects com backlinks transacionais e escopo composto;
6. append atômico e idempotente, race tests, backfill explícito e non-interference;
7. integração do worker por capability temporária e uma UI sem refs internas;
8. gate com bytes sintéticos, advisors limpos, rollback e evidência de deploy.

Nenhuma capacidade de Vault, data room, upload ou retrieval muda de maturidade por causa desta
fatia.
