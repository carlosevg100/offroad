# VLT-01 — identidade governada de documento e versão (fatia interna)

Status: `code_complete_candidate` · exposição: `internal_shadow` · data-base: 7 de setembro de 2026

## Objetivo desta fatia

Esta fatia cria o contrato puro que permite dizer **qual arquivo exato**, **qual versão**, **em qual
tenant e projeto**, **capturado quando**, **processado por quais ferramentas** e **quais derivados**
fundamentaram uma análise. Ela não muda upload, banco, Storage, retrieval, UI ou produção.

O contrato e seu validador estão em
`packages/document-intelligence/src/governed-document-identity.ts`. O compilador calcula o SHA-256
dos bytes recebidos; metadado declarado pelo navegador ou por integração nunca substitui essa
medição. O relatório de validação guarda apenas códigos e referências opacas, sem nome, e-mail,
conteúdo, trecho ou valor financeiro.

## Contratos existentes auditados e reaproveitados

| Base existente | O que já prova | Como VLT-01 usa sem criar verdade paralela |
| --- | --- | --- |
| `source_documents` | organização, escopo de intake/oportunidade, objeto privado, hash verificado, classe e versão numérica | VLT-01 trata `organizationId`, `projectId`, `documentId`, versão e hash dos bytes como chave composta governada; não altera a tabela |
| `document_profiles` | tipo, entidade, período, classe de informação, rank e revisão por documento/versão | reutiliza `informationClassSchema`; perfil passa a ser derivado identificável, não identidade da fonte |
| `document_layers` + `DocumentLayer` | versão, tipo de camada, hash, parser versions, âncoras e estatísticas | reutiliza `layerKindSchema` e exige hash da camada, hash da fonte, parser exato e pais de linhagem |
| `case_retrieval_chunks` | organização, sessão/projeto, documento, versão, hash e âncora | retrieval continua derivado; um `retrieval_chunk_set` precisa apontar para camada/fonte e jamais vira evidência por si |
| `source-pack.v1` | URL, bytes congelados, data de aquisição, as-of, licença, versão e hash | a identidade aceita fontes públicas somente após snapshot imutável/versionado; referência web mutável falha |
| `caseArtifactManifest` | snapshots econômicos, versões de parser/modelo e fingerprints | VLT-01 fornece a identidade anterior ao manifesto; não substitui o manifesto de outputs |
| `taskSourceClassSchema` e `taskDataClassSchema` | classes autorizáveis pelo plano de execução | VLT-01 importa os mesmos schemas para impedir vocabulário divergente entre documento e runtime |

## Invariantes executáveis

O validador falha fechado quando encontra:

- mesmo tenant/projeto/documento/versão com hashes diferentes ou duplicação de versão;
- mesmos bytes promovidos artificialmente a uma nova versão;
- pai de versão ausente, posterior, com hash divergente, em outro tenant/projeto ou outro documento;
- ciclo na cadeia de versões ou no DAG de derivados;
- fonte mutável sem snapshot e hash do snapshot divergente dos bytes medidos;
- camada sem identidade de parser, parser fora da toolchain registrada ou camada ligada a outro hash;
- derivado sem pai, pai inexistente ou hash de pai divergente;
- estado de supersessão sem alvo coerente ou alvo fora do escopo;
- `asOf` posterior à captura ou captura posterior à ingestão;
- origem incompatível com a source class autorizável;
- classe de dado incompatível com o nível de confidencialidade e estado incoerente de conector;
- tentativa de declarar um data room externo arbitrário como conector suportado;
- fingerprint de identidade adulterado;
- ator contendo e-mail/nome bruto em vez de uma referência opaca por tipo.

## Fronteira honesta

Esta implementação **não** prova persistência, RLS, autorização, isolamento de Storage, ingestão
atômica, compatibilidade retroativa, reconciliação de registros existentes ou operação do worker.
Também não oferece integração com data rooms. `external_data_room` só é válido como
`unsupported`, sem `connectorId`; um arquivo obtido manualmente pode entrar futuramente pelo fluxo
normal de upload, mas isso não equivale a uma integração.

Antes de sair de `internal_shadow`, a próxima fatia deve desenhar e provar em staging:

1. migration tenant-scoped com RLS/FORCE RLS, grants mínimos e FKs compostas;
2. comando atômico e idempotente que vincule `source_documents`, versão, snapshot, perfil, camada e
   derivados sem aceitar organização/projeto do worker;
3. backfill auditado dos registros existentes, com estado explícito para metadados desconhecidos;
4. non-interference cross-tenant/cross-project, race tests e teste de overwrite no Storage;
5. worker escrevendo via capability temporária e UI exibindo versão/cobertura sem expor refs
   internas;
6. gate real com bytes sintéticos, advisors limpos, rollback e evidência de deploy.

Nenhuma capacidade de Vault, data room, upload ou retrieval muda de maturidade por causa desta
fatia.
