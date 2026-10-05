# Etapa 21 — eval de domínio, exportação e worker

Registro de 5 de outubro de 2026. São **58 casos novos**, distribuídos em seis arquivos; todos passaram na execução indicada abaixo. Este registro cobre testes de código, não aplicação de migrações nem produção.

## Evidência e alcance

- **CI 712:** [Quality, job Lint/typecheck/test/build](https://github.com/carlosevg100/offroad/actions/runs/37335778849/job/111850067882), commit `712df5ff96057a6f5257abec1aa7e2e1143e397c`. Job **SUCCESS**, com os seis arquivos abaixo verdes. O run completo não ficou verde: os outros gates ainda tinham o journal remoto pendente e a reprodução nativa XLSX com arquétipo ausente. Não se atribui aprovação da etapa ao resultado deste job.
- **Focal posterior:** o arquivo `artifact-roundtrip-renderer.test.ts` passou **15/15**, e o typecheck do worker passou, após reproduzir e corrigir o caso nativo de arquétipo `null`. Essa versão do último teste inclui reconstrução canônica `other`, prova dos bytes aprovados em português e inglês e negativas de hash/economia alterados. A CI 712 havia aprovado a versão anterior desse teste, com arquétipo `other`; ela não prova o caso `null`.
- O commit posterior `450d9ed6` não recebe neste documento resultado de CI ainda não conferido. Não foi feita nova execução redundante para redigir este registro.
- O contrato novo de `packages/domain-contracts/src/artifact-roundtrip.ts` é exercitado pela suíte de exportação: validação de identidades duplicadas, manifesto e fingerprint lógico. Não existe um arquivo novo independente de testes de domínio a contabilizar.

## Casos novos e resultado

Os nomes abaixo são extraídos dos arquivos reais; casos parametrizados estão expandidos. **PASS — CI 712**, salvo o último teste do renderer, identificado como focal posterior.

### `packages/case-export/src/artifact-roundtrip.test.ts` — 21 casos novos

- `distinguishes head-only, received-only, identical edits and true conflicts` — **PASS — CI 712**.
- `detaches claims, keeps base intact, and never imports recorded edits` — **PASS — CI 712**.
- `rejects mismatched historical receipts and strips forged or missing lineage` — **PASS — CI 712**.
- `does not collapse duplicate blocks or invent matches from their text` — **PASS — CI 712**.
- `embeds a deterministic non-circular xlsx manifest with preserved metadata` — **PASS — CI 712**.
- `embeds a deterministic non-circular docx manifest with preserved metadata` — **PASS — CI 712**.
- `embeds a deterministic non-circular pptx manifest with preserved metadata` — **PASS — CI 712**.
- `preserves local defined names and inserts new names before calcPr` — **PASS — CI 712**.
- `imports exact assumption decimals, ignores caches, and records changed formulas` — **PASS — CI 712**.
- `preserves exact authoritative approved values and configuration scope` — **PASS — CI 712**.
- `keeps named inputs matched after worksheet rename and row insertion` — **PASS — CI 712**.
- `detects deleted Word controls as missing and surviving text as unmatched` — **PASS — CI 712**.
- `preserves original slide and detects copied slide as unmatched` — **PASS — CI 712**.
- `rejects inconsistent custom properties and manifest sheet without conferring lineage` — **PASS — CI 712**.
- `embeds PDF identity and XMP while explicitly refusing PDF reimport` — **PASS — CI 712**.
- `refuses a decompression bomb before reading the embedded manifest` — **PASS — CI 712**.
- `keeps logical identity across formats without calculating the SQL fingerprint locally` — **PASS — CI 712**.
- `compares two concurrent edits without overwriting the first contribution` — **PASS — CI 712**.
- `validates duplicate declared identities before rendering` — **PASS — CI 712**.
- `writes explicit Word controls without exposing block identities in readable text` — **PASS — CI 712**.
- `groups paginated slides into one canonical block and treats an extra copy as unmatched` — **PASS — CI 712**.

### `packages/case-export/src/decision-workbook.test.ts` — 1 caso novo

O arquivo inteiro teve **2/2 PASS**; o teste determinístico anterior não é contado como novo.

- `adds valid stable names only to explicit new roundtrip exports` — **PASS — CI 712**.

### `packages/financial-model/src/institutional-roundtrip-bindings.test.ts` — 3 casos novos

- `keeps historical sheet construction unchanged unless roundtrip is requested` — **PASS — CI 712**.
- `retains unique defined names through governed packaging in pt` — **PASS — CI 712**.
- `retains unique defined names through governed packaging in en` — **PASS — CI 712**.

### `apps/document-worker/src/artifact-roundtrip-renderer.test.ts` — 15 casos novos

- `captures positional mapping from fixed producer without inventing historical claims` — **PASS — CI 712**.
- `renders a person contribution over its exact parent instead of returning old body` — **PASS — CI 712**.
- `refuses recorded overlays, unsupported variants and unavailable pinned templates` — **PASS — CI 712**.
- `hashes and revalidates a stored object before and after I/O, without a raw URL` — **PASS — CI 712**.
- `replays the same approved institutional economics in four formats under the SQL logical identity` — **PASS — CI 712**.
- `refuses recursive ancestry cycles` — **PASS — CI 712**.
- `preserves exact financial_model XLSX from a material package instead of rejecting that family` — **PASS — CI 712**.
- `replays a stored full financial model under its approved bytes before adding roundtrip names` — **PASS — CI 712**.
- `uses the existing decision workbook renderer for an actual fingerprinted work product contract` — **PASS — CI 712**.
- `hydrates native material only from the two leased retained bodies and rejects mismatch or expiry` — **PASS — CI 712**.
- `renders an exact immutable template version and rejects swapped body or canonical digest` — **PASS — CI 712**.
- `checks the actual builtin template fingerprint rather than trusting its version label` — **PASS — CI 712**.
- `requires the exact pinned logo bytes and current lease before and after Storage` — **PASS — CI 712**.
- `exports the actual native compiler term sheet to PPTX with every structural block bound` — **PASS — CI 712**.
- `exports the actual native compiler financial model with null archetype only under approved workbook bytes` — **PASS — focal posterior (15/15)**.

### `apps/document-worker/src/artifact-roundtrip-processing.test.ts` — 12 casos novos

- `commits only after authenticated physical byte verification, without overwrite` — **PASS — CI 712**.
- `denies changed physical bytes and never commits a receipt` — **PASS — CI 712**.
- `denies revocation after I/O and never commits or downgrades it to a successful task` — **PASS — CI 712**.
- `does not accept a different object on upload conflict` — **PASS — CI 712**.
- `refuses a target outside the exact leased path before uploading` — **PASS — CI 712**.
- `aborts before claiming any authority` — **PASS — CI 712**.
- `parses only after the clean receipt and refreshed import context, preserving the captured manifest` — **PASS — CI 712**.
- `denies unavailable or infected scanner before any comparison 0` — **PASS — CI 712**.
- `denies unavailable or infected scanner before any comparison 1` — **PASS — CI 712**.
- `denies a substituted organization in the scan binding before scanning` — **PASS — CI 712**.
- `denies captured manifest substitution even when base bytes and SHA are intact` — **PASS — CI 712**.
- `denies revocation during scanning before parsing or committing comparison` — **PASS — CI 712**.

### `apps/document-worker/src/artifact-roundtrip-manual-mapping.test.ts` — 6 casos novos

- `turns loose text into a human proposal only under the exact matching choice and drops old support` — **PASS — CI 712**.
- `uses the current head in the three-way result rather than overwriting a concurrent edit` — **PASS — CI 712**.
- `preserves exact captured JSON and rejects changed approved bindings or extra received metadata` — **PASS — CI 712**.
- `refuses mapping numeric blocks, formulas, unsupported targets and duplicate choices` — **PASS — CI 712**.
- `uses canonical text bodies when a legacy export has no physical binding, without changing its manifest` — **PASS — CI 712**.
- `keeps first unmatched keys stable for reprocessing and bounds keys even for hostile long locators` — **PASS — CI 712**.

## Arquivos principais da implementação

- `packages/domain-contracts/src/artifact-roundtrip.ts` e `src/index.ts`: schemas, identidades, regiões e projeção lógica do manifesto.
- `packages/case-export/src/artifact-roundtrip.ts`, `src/roundtrip/formats.ts`, `src/docx.ts`, `src/presentation.ts`, `src/decision-workbook.ts`: empacotamento, leitura física, comparação em três vias e bindings explícitos; PDF somente para exportação.
- `packages/document-parsers/package.json`: subpath OOXML seguro usado pelo protocolo.
- `packages/financial-model/src/model.ts`, `src/governed-workbook.ts`, `src/institutional-formula-workbook.ts` e `src/institutional-roundtrip-bindings.test.ts`: bindings opt-in de configuração/premissa/período, preservando a construção anterior quando não solicitados.
- `apps/document-worker/src/artifact-roundtrip-renderer.ts`: produtor canônico, corpos retidos sob lease, templates fixados, composição de contribuições e prova dos bytes do cálculo aprovado.
- `apps/document-worker/src/artifact-roundtrip-processing.ts` e `src/artifact-roundtrip-manual-mapping.ts`: recibo físico, scanner, revalidação de autoridade e correspondências humanas sem reescrever o manifesto-base.

## Extração compacta do log conferido

As linhas abaixo foram extraídas do log real do job CI 712, sem cores ou saída de dados. Os caminhos `src/` são relativos ao pacote indicado nas seções anteriores.

```text
Lint, typecheck, test, build	Run quality gate	2026-10-05T15:56:05.9223895Z  ✓ src/institutional-roundtrip-bindings.test.ts (3 tests) 942ms
Lint, typecheck, test, build	Run quality gate	2026-10-05T15:56:13.7906586Z  ✓ src/artifact-roundtrip.test.ts (21 tests) 682ms
Lint, typecheck, test, build	Run quality gate	2026-10-05T15:56:13.7914535Z  ✓ src/decision-workbook.test.ts (2 tests) 161ms
Lint, typecheck, test, build	Run quality gate	2026-10-05T15:59:02.9760430Z  ✓ src/artifact-roundtrip-renderer.test.ts (15 tests) 7601ms
Lint, typecheck, test, build	Run quality gate	2026-10-05T15:59:02.9839271Z  ✓ src/artifact-roundtrip-processing.test.ts (12 tests) 2822ms
Lint, typecheck, test, build	Run quality gate	2026-10-05T15:59:02.9869081Z  ✓ src/artifact-roundtrip-manual-mapping.test.ts (6 tests) 60ms
```

SHA-256 do log completo conferido: `c1eb88834b4262aa77ed0f92be673f2e61e380f808bbe2dd6a9f6a060decbfb0`.
