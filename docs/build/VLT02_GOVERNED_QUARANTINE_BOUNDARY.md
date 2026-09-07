# VLT-02: portaria governada de documentos (fatia interna)

Status: `code_complete_candidate` | exposição: `internal_shadow` | data-base: 7 de setembro de 2026

## Resultado delimitado

Esta fatia fecha o bypass que permitia ao worker chegar ao parser quando o scanner estava ausente e
introduz uma portaria governada antes de qualquer interpretação de conteúdo. O fluxo implementado é:

`quarantined → scanning → clean | rejected`

Somente `clean`, com scanner `clean`, nenhum motivo de rejeição e receipt íntegro, autoriza um
snapshot para o parser. O snapshot inclui cópia dos bytes, tenant, documento, versão, operação, nome,
MIME e tipo detectado já vinculados. PDF, Office, texto, imagem e arquivo fiscal usam a mesma
autorização. O arquivo bruto baixado e os campos mutáveis do job não são usados no roteamento após o
gate.

Isso é uma capacidade interna candidata. Não prova um data room isolado em produção, não prova um
ClamAV operacional ou atualizado e não promove ingestão para uso externo.

## Contrato e política

`@offroad/document-intelligence` passa a expor política, inspector, receipt e autorização do parser.
A política possui versão e fingerprint e governa:

- tamanho máximo do arquivo;
- quantidade de membros, tamanho por membro, total descomprimido, razão de compressão e profundidade;
- divergência entre extensão, MIME declarado e assinatura binária;
- documentos criptografados;
- macros, scripts, objetos embutidos, relações externas, fórmulas externas e formula injection;
- allowlist de formatos que a portaria desta fatia efetivamente entende.

A allowlist padrão é deliberadamente estreita: PDF, OOXML não macro, CSV/texto, PNG/JPEG/TIFF e ZIP
composto somente por XML para o fluxo fiscal. Formatos legados CFB, ODF, RTF, executáveis e archives
genéricos não são tratados como limpos nesta versão. Acrescentar um formato exige inspector e testes
adversariais próprios; não basta o parser conseguir abri-lo.

A ordem é fixa: integridade e limites mínimos de bytes, scanner, inspector de container e autorização
do parser. `file-type`, `JSZip.loadAsync` e qualquer descompressão só executam depois de um veredito
limpo do scanner. Em ZIP/OOXML, os limites do diretório central são verificados antes da
descompressão; quando esses limites passam, nenhuma entrada é aberta. Quando passam, todos os membros
são descomprimidos por stream sob limites reais de membro e total. O primeiro limite real atingido
aborta o restante do archive.

Conteúdo XML necessário à política tem um limite próprio versionado de inspeção, padrão de 8 MiB. Se
esse limite for excedido, o receipt registra `active_content_inspection_exceeded`; o caso não é
confundido com excesso de tamanho do membro. Archives dentro de archive não são suportados nesta
versão: `maxArchiveDepth` é fixo em zero e conteúdo aninhado é detectado tanto pelo nome quanto pelos
magic bytes do membro descomprimido. Paths absolutos, vazios, relativos ou com backslash são
rejeitados. Nenhum membro é materializado em disco.

## Receipt imutável e autorização

Cada tentativa produz um objeto validado e congelado contendo:

- organização, documento, versão e operação;
- tamanho e SHA-256 esperados e observados;
- nome original, MIME declarado e tipo/container detectado;
- estatísticas de archive e classes de conteúdo ativo;
- scanner, versão de engine e conjunto de assinaturas quando o runtime os fornecer;
- versão e fingerprint da política;
- veredito, motivos, retryability e timestamps das três transições;
- `receiptId` e fingerprint do receipt.

`authorizeParserInput` recalcula o fingerprint do receipt, exige veredito e scanner limpos, compara
tenant, documento, versão, operação, hash, tamanho, nome original, MIME declarado e política e então
recalcula os bytes correntes. Troca de tenant/versão/operação/nome/MIME e alteração dos bytes depois
do scan falham fechado. A função retorna o snapshot autorizado com uma nova cópia, evitando que o
consumidor receba por referência o buffer de download.

O `receiptId` é uma chave determinística da operação e do input governado. Repetir a mesma tentativa
sob o mesmo relógio controlado produz o mesmo receipt; persistência idempotente e concorrente depende
do adapter transacional descrito abaixo e ainda não está implementada.

## Integração no worker

O worker agora exige hash e tamanho de upload no job, cria o binding usando o escopo já claimado e
usa o `job_id` como operação. O adapter de scanner não inventa versões: como o cliente clamd atual não
as consulta, `engineVersion` e `signatureSetVersion` permanecem `null` no receipt.

Qualquer veredito diferente de `clean` é persistido no `scan_result`, encerra a execução e não chama
parser, classificador, extractor, evidence store ou retrieval. Ausência/erro do scanner é rejeição
retryable; malware, inconsistência, arquivo malformado ou violação de política é rejeição permanente.
Logs carregam ids, veredito e códigos de motivo, não texto do documento.

## Evidência executável local

Os testes cobrem:

1. scanner ausente, indisponível e malware;
2. PDF malformado, criptografado, com script e polyglot PDF+ZIP;
3. divergência de magic byte, MIME e extensão;
4. macro, objeto embutido, relação externa e fórmula externa em OOXML;
5. zip bomb, excesso de membros, membro e total descomprimido, abort do restante do archive, limite
   próprio de XML, nested archive por magic byte e unsafe path;
6. formula injection em CSV;
7. receipt adulterado e receipt rejeitado;
8. troca de tenant, versão, operação, nome, MIME, política e bytes após scan;
9. caminho saudável com receipt limpo e exceção do detector convertida em receipt rejeitado;
10. integração do worker provando que um tipo forjado não chega a parser/classificação/retrieval e
    que uma mutação do payload durante o scan não altera nome, MIME ou roteamento autorizados.

## Fronteira honesta e bloqueios

`governedDocumentQuarantineRuntimeBoundary` mantém legíveis por máquina os bloqueios desta fatia:

1. **persistência append-only:** `source_documents.scan_result` ainda é JSON mutável e não uma tabela
   de receipts com constraint única e histórico inviolável;
2. **CAS e idempotência transacional:** duas claims concorrentes ainda precisam de lock, comparação
   da versão/hash/object version e insert-or-return-existing atômico;
3. **Storage imutável:** o job traz URL, hash e tamanho, mas esta fatia não liga o receipt a uma
   object version não móvel verificada pelo adapter de VLT-01;
4. **atestação do scanner:** engine, assinatura, freshness e health precisam ser obtidos e
   verificados; `null` não é evidência de atualização;
5. **isolamento da task:** usuário não root no container existe, mas não há nesta branch evidência
   de read-only root filesystem, capabilities removidas, seccomp, limites de CPU/memória/processos,
   diretório efêmero dedicado ou limpeza comprovada entre documentos;
6. **egress:** não há evidência nesta branch de deny-by-default e destinos permitidos durante scan;
7. **validação adversarial em staging:** o contrato e os testes locais não substituem ClamAV real,
   corpus malicioso controlado, concorrência, crash recovery e prova de não interferência entre jobs.

Até esses bloqueios fecharem, é incorreto afirmar “sandbox live”, “ClamAV verificado”, “data room
isolado”, “SOC 2-ready” ou “VLT-02 promovido”. A próxima fatia deve compor VLT-01 e VLT-02 num adapter
server-side transacional, com migration RLS/FORCE RLS e testes SQL, sem aplicar produção antes do gate.

## Controles relacionados

Esta implementação contribui, sem encerrá-los, para `DOC-01`, `DOC-02`, `DOC-03`, `DOC-06`, `DOC-07`,
`DOC-10`, `APP-04`, `APP-08`, `APP-10` e `APP-11`. A promoção depende da evidência operacional exigida
pelo Control Register e pelo plano de segurança enterprise.
