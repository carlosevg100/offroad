# M2, parte 1: confirmação única com versão (desenho, v5)

Estado em 21/10/2026. Desenho para revisão antes da migração, reescrito depois de quatro rodadas. Base: `M2-PLANO.md` (decisões 1, 2, 3, 5) e contratos da parte 0. O transporte continua
fechado durante toda a parte.

## 0. Fronteira de confiança (achado 3)

O banco **lê os bytes**. A confirmação recebe o conteúdo coletado (`bytea`, até 5 MiB; na prática a série
de dez anos tem cerca de 150 KB e um comunicado menos de 30 KB), confere `md5(bytes)` com o eTag que o
Storage gravou para o objeto exato da tentativa e `sha256(bytes)`, e faz ele mesmo a leitura estrita e o
parse. O worker continua parseando (para falhar cedo com `parse_failed`), mas não é autoridade: nenhum
valor gravado vem do worker. Confia-se ao worker autenticado só a coleta HTTPS e a cadeia de
redirecionamentos (seção 3). Resistência a worker comprometido que forje bytes de outra origem fica
fora; a mitigação é a URL exata e o selo.

## 1. Contratos no banco (achados 6, 10)

`private.market_contracts`, imutável, semeada pela migração, **uma linha por endpoint**:

| id | kind | caminho |
|---|---|---|
| `bcb-sgs-432-endpoint` | `sgs_daily_json` | `/dados/serie/bcdata.sgs.432/dados` |
| `bcb-copom-comunicados-lista` | `copom_communique_list` | `/api/servico/sitebcb/copom/comunicados` |
| `bcb-copom-comunicados-detalhe` | `copom_communique_detail` | `/api/servico/sitebcb/copom/comunicados_detalhes` |

Colunas: `source_id`, host, caminho, parser, unidade, escala, convenção, evidências de licença e de
reprodução, `homologated_from`, `max_window_years`, calendário, `contract_sha256` (para a série, o hash
da parte 0; para os comunicados, a mesma forma `market-endpoint-contract.v1`, com vetores). Um id de
contrato é imutável: mudança é linha nova com id novo.

**Contrato de normalização (achado 17).** O contrato de endpoint diz como os bytes são **coletados** e
fica fixo no job. Como eles são **lidos** é outra tabela, `private.market_normalizations`, imutável:
`id`, `acquisition_contract_id`, `parser`, `logical_id` (objeto econômico), unidade, escala, convenção,
política de qualidade, `normalization_sha256`. O id segue a gramática de slug da parte 0. A primeira
linha é **`bcb-sgs-432`**, com `normalization_sha256` igual ao hash `market-series-contract.v1` da parte 0
(`eb892dc2...`, cujo texto já reúne endpoint, parser e calendário) e endpoint `bcb-sgs-432-endpoint`.
Assim a linha `series-contract:bcb-sgs-432@eb892dc2...` do canônico, os bytes e os vetores da parte 0
ficam exatamente como estão, sem emenda. Um parser novo é uma linha nova com id novo (por exemplo
`bcb-sgs-432.p3`), o **mesmo** endpoint e o **mesmo** objeto lógico; trocar fonte, endpoint ou objeto exige
outra linha de endpoint e outro objeto, nunca sucessão. Um vetor com a normalização semeada produz os
mesmos bytes e SHA-256 no TypeScript e no SQL, e a primeira confirmação completa sela a versão.

**Vínculo com a fonte.** A revisão vigente da fonte precisa estar habilitada e citar, nas evidências da
licença, a evidência de licença do contrato (e a de reprodução, para comunicados); conferido no
enfileiramento e na confirmação.

**Identidade canônica da revisão.** `source-revision` no canônico é o `command_id` (UUID, único) da
revisão da fonte da aquisição.

**Objeto lógico.** Criado de forma governada na primeira confirmação de série depois do registro da
fonte (parte 4), com o id que `logicalId()` produz; a migração não semeia objeto lógico (banco vazio
continua válido).

**URL.** `private.market_contract_url_v1(contract_id, request jsonb)` monta a URL igual à do TypeScript;
`request` é `{"window":{"start","end"}}`, `{"size":N}` ou `{"meeting":N}`, com tipos exatos, sem chave
extra. A janela da série termina no máximo na data civil de São Paulo do enfileiramento (achado 9).
Vetores comuns.

## 2. Enfileiramento por contrato

`enqueue_market_contract_acquisition_v1(command, contract_id, request, reason, actor)`: fundador ou
operador, publicadora registrada, fonte vigente vinculada ao contrato; o banco grava `contract_id`,
`request` e a URL que ele montou (colunas novas, obrigatórias em job novo por check). O replay do comando
compara contrato, `request` (igualdade de `jsonb`), ator e motivo. `enqueue_market_acquisition_v1` (URL
livre) passa a recusar tudo.

## 3. Worker e redirecionamentos (achado 10)

O claim devolve contrato, `request` e URL. Antes de qualquer resolução, cada `Location` recebido tem de
ser **absoluto e igual byte a byte** à URL do job; referência relativa ou qualquer outra grafia é falha
`redirect_not_allowed` (código que o `worker_fail` já aceita). A URL final é a mesma. Falha de parse no
worker é `parse_failed` (código novo). O `worker_fail` trata os dois como **definitivos**: falha
persistida, lease limpo e nenhuma nova tentativa, ainda que o chamador informe `retryable = true`. Capacidade `market-version-commit.v1` exigida no contrato de runtime.

## 4. Confirmação única

`worker_commit_market_version_v1(job, capability, lease, content bytea, content_type, acquired_at)`,
`security definer`. Ordem de locks: gate compartilhado da fonte, job `FOR UPDATE`, objeto do Storage
`FOR SHARE`, linhas de reunião (seção 6). Na mesma transação, isolamento `READ COMMITTED`:

1. lease, capacidade, delegação, conta (como hoje); `content_type` e tamanho conferidos com o objeto;
   `md5(content)` igual ao eTag; `sha256` calculado pelo banco;
2. URL recalculada de `contract_id + request` igual a `job.url` (o worker não informa URL);
3. recibo de aquisição;
4. parse estrito no banco (seção 5) conforme o `kind`;
5. **série**: versão, entrada, observações, evidência (seção 6), selo e avaliação (seção 7);
   **detalhe**: registro do comunicado e linha da reunião; **lista**: só o recibo;
6. **nova conferência do lease (achado 16)**: depois de todas as esperas (reunião, chave única, locks),
   `lease_expires_at > clock_timestamp()` de novo; vencido, a transação inteira aborta, sem aquisição,
   reunião, versão nem recibo;
7. recibo de confirmação (seção 8).

`worker_commit_market_acquisition_v1` passa a recusar toda chamada.

## 5. Leitura estrita no banco (achado 11)

Sobre `content`: sem BOM (bytes `EF BB BF` iniciais recusados); `convert_from(content,'UTF8')` válido;
tipo `json` (não `jsonb`, que descarta chave repetida); chave repetida detectada contando
`json_object_keys` contra seus distintos; cada string extraída com `->>`, o que recusa `\u0000` e
surrogate isolado com erro, convertido em falha de parse; tipos exatos (`json_typeof`), sem coerção.
Gramáticas iguais às da parte 0. Na série, todo período `<= D`, onde D é a data civil de São Paulo do
instante da confirmação (achado 9).

**Números (achado 14).** Número de reunião é validado pelo **texto do token JSON**, antes de qualquer
conversão: `^[1-9][0-9]{0,3}$`. `281.0`, `2.81e2`, `281.0000000000000000001` e `-281` são recusados nos
dois lados. No TypeScript, o leitor estrito passa a devolver números como `JsonNumber` com o texto
original; no SQL, `(x->'nro_reuniao')::text` é comparado com a mesma gramática. Vetores comuns de
números (frações mínimas, expoentes, limites).

Comunicado: texto sem tags; decodificação de `&#N;` e `&#xH;` só para escalares Unicode entre 1 e
0x10FFFF fora da faixa de surrogates, demais referências ficam literais; `&nbsp; &lt; &gt; &quot; &amp;`;
remoção de U+200B a U+200D e U+FEFF; espaços colapsados. Token do título e cláusula confirmatória com
classes **ASCII explícitas** (sem `\p{...}` nem `[[:alpha:]]`, que dependem de locale): `decidiu` precedido
de início ou espaço e não de `não `. O TypeScript da parte 0 é alinhado a essa definição na mesma PR.
Vetores comuns de parse (aceites e recusas, inclusive `&#0;`, `&#xD800;`, maiúsculas acentuadas) para
TypeScript e SQL.

## 6. Reuniões e evidência (achados 2, 4, 5)

`private.market_copom_communique_acquisitions`: uma linha por aquisição de detalhe (reunião, data,
decisão, taxa, impressão do registro, título e texto como recebidos, parser).

`private.market_copom_meetings`: **autoridade por reunião**, `meeting` chave primária, `reference_date`
única. A primeira aquisição de uma reunião cria a linha (`insert ... on conflict do nothing`, depois
`select ... for update`) e fixa data, decisão, taxa e a aquisição de referência. Uma aquisição posterior
precisa concordar em data, decisão e taxa (texto pode diferir; fica registrada, não vira evidência);
discordância falha a confirmação. Outra reunião com a mesma data falha
(`market_copom_meeting_day_collision`). Duas primeiras aquisições concorrentes serializam na chave
primária.

**Evidência de uma versão** é um conjunto fixo, materializado uma vez em
`private.market_version_evidence` antes do selo: para D, a reunião âncora (maior `series_change_date <=`
início da janela) e todas as reuniões com `series_change_date` em (início, fim da janela], cada uma pela
sua aquisição de referência, desde que essa aquisição seja anterior ao limite de D. A avaliação e o
canônico leem só esse conjunto (as `links` do canônico v2 são exatamente a evidência, em ordem de
reunião). Cada linha referencia aquisição e reunião com `record_sha256` igual ao da aquisição; entra pelo
mesmo protocolo de conteúdo aberto (trigger de versão aberta), portanto nunca depois do selo.

## 7. Avaliação, quarentena e reavaliação (achados 1, 9)

`private.evaluate_market_selic_target_v1` aplica a política v2 da parte 0 sobre observações e evidência
seladas, janela do job e D. Resultado gravado em `private.market_version_evaluations` (versão, política,
D, instante, status, achados estruturados em `jsonb`, ordinal do evento) e evento `approved` ou
`quarantined` com motivo curto; `insufficient` vira `quarantined`. A avaliação é função pura do conteúdo
selado e de D.

**Evidência nova gera versão nova** (achado 1). Uma série em quarentena porque o comunicado ainda não
estava visível não é aprovada depois sobre o mesmo selo: o comando `relink_market_version_v1(command,
version, actor)` (fundador ou operador; depois, o agendador da parte 2) recalcula a evidência para o D
atual e, se ela mudou, cria versão da mesma aquisição e do mesmo parser com `supersedes`, observações
copiadas, nova evidência, novo selo e nova avaliação. Evidência igual devolve a versão vigente. Na seleção
da parte 0 isso é um reprocessamento (mesma aquisição, `recorded_at` posterior).

**Disponibilidade da evidência (achado 12).** Cada versão grava `evidence_available_at`, o maior
`acquired_at` entre a aquisição da série e as aquisições de referência da sua evidência. Uma versão só
serve à data-base D se `evidence_available_at < L(D)`. A seleção da parte 0 muda nesse ponto: em cada
cadeia de uma aquisição, entre as versões gravadas até K, vale **a mais recente que esteja disponível
para D**; uma sucessora religada com comunicado posterior a D não elimina a predecessora para D (que
continua em quarentena, como estava naquela data). O TypeScript da parte 0 (`SelectableVersion` ganha
`evidenceAvailableAt`) e a seleção SQL seguem a mesma regra, com vetores para D anterior e posterior ao
comunicado, K posterior ao relink e manifesto anterior preservado.

**Comando de relink (achado 13).** Recibo por comando em `private.market_relink_commands` (comando,
versão pedida, ator, resultado original). O mesmo comando devolve sempre o recibo original, ainda que a
evidência disponível tenha mudado; comando reutilizado com outra versão ou outro ator é recusado.
`pg_advisory_xact_lock('market-chain:' || aquisição)` serializa a descoberta e a substituição da ponta da
cadeia; o recibo existente é consultado antes da verificação de ponta; pedir relink novo de versão que
não é a ponta é recusado (`market_relink_not_tip`).

## 8. Invariantes e replay (achados 7, 8)

`market_versions` ganha `normalization_id`, `quality_policy`, `canonical_version` (`v1` padrão),
`acquisition_id` e `evidence_available_at` (obrigatórios em v2, imutáveis). Gates num trigger de
inserção, para qualquer escritor: **toda versão cuja aquisição veio de job com contrato é v2, e toda
sucessora de v2 é v2** (achado 15); uma entrada de versão v1 não aceita aquisição de job com contrato
(gate no trigger de entradas, para qualquer escritor); selos v1 existentes seguem verificáveis.
Normalização existente; `logical_id` igual ao da normalização; `parser` igual ao da normalização;
`acquisition_contract_id` da normalização igual ao contrato do job da aquisição; a sucessora pode usar
outra normalização só se ela tiver o mesmo contrato de endpoint e o mesmo objeto lógico;
**uma única raiz por aquisição** (índice único em `acquisition_id` onde `supersedes` é nulo; mudança de
parser também precisa superseder a cadeia); `supersedes` da mesma aquisição, com `recorded_at`
estritamente posterior; `unique(supersedes)` impede bifurcação; `recorded_at >= acquired_at`. No selo
v2: exatamente uma entrada, igual a `acquisition_id`; evidência e observações coerentes com a versão. O selo v2 monta o
`CanonicalV2Input` das linhas gravadas e compara com `sha256`; v1 segue igual. Eventos continuam
ordenados por `version_ordinal`.

`private.market_version_commits` (job chave primária): conta, capacidade, lease, contrato, parser,
política, `fingerprint`, ids de aquisição e de versão, resultado original. O fingerprint é o SHA-256 em
UTF-8 de

```
market-commit.v1
job:<uuid>
lease:<uuid>
content-sha256:<hex>
content-type:<bytes UTF-8>:<texto>
acquired-at:<instante canônico da parte 0>
contract:<id>
parser:<slug>
quality-policy:<id>@<versão> | none
```

com vetores comuns. O replay autenticado recalcula o fingerprint da chamada com o contrato, o parser e a
política **registrados no recibo** e, se igual, devolve o resultado gravado antes de qualquer
reavaliação, mesmo depois da virada do dia, de política nova ou de comunicado posterior.

Respostas por tipo: série `{committed, replayed, acquisitionId, versionId, quality:{status,
evaluationId}}`; detalhe `{committed, replayed, acquisitionId, meeting, reference}` (`reference` diz se a
aquisição virou a de referência da reunião); lista `{committed, replayed, acquisitionId}`.

## 9. Testes

SQL: vetores (canônico v2, URL, limite, calendário, parse) lidos do arquivo comum; bytes adulterados
(MD5 diferente do eTag); série com e sem comunicado, âncora, cobertura, período futuro recusado;
comunicado com chave repetida, NUL, surrogate, BOM, título e cláusula; reunião com aquisição
discordante, texto diferente e colisão de data; evidência e observação inseridas depois do selo; v1
preservado; relink com evidência nova e igual; replay depois de resposta perdida, virada do dia,
política nova e comunicado posterior; relink repetido, reutilizado com outra versão e fora da ponta;
segunda raiz na mesma aquisição; versão com contrato, parser ou objeto trocados; números de reunião
fora da gramática; versão v1 (padrão ou explícita) e sucessora v1 para aquisição de contrato, fora da
RPC; troca de parser P1 para P2 aceita por normalização do mesmo endpoint e objeto, recusada com outro
endpoint, outra fonte ou outro objeto, com manifesto anterior a K preservado; RPC antiga e enfileiramento
livre recusam.

Concorrência (duas sessões, as duas ordens): duas primeiras aquisições da mesma reunião, discordantes e
concordantes; série e comunicado simultâneos (comunicado invisível dá quarentena, relink aprova); dois
relinks da mesma ponta; revogação de delegação durante a confirmação; primeira inserção de reunião
retida até o lease da segunda tentativa vencer, que então recusa sem persistir nada.

Worker: `Location` com porta, maiúsculas, relativo e outra série recusados antes da resolução, terminando em falha definitiva com lease limpo mesmo com `retryable = true`;
`parse_failed`; capacidade no runtime; worker antigo contra banco novo recusado.

Corpus real: obrigatório na prova integrada em staging da parte 4 (os bytes reais passam pelo banco e
reproduzem o resultado registrado); fica privado, fora da CI pública.

## Ordem de implantação

Migração em staging, testes, revisão; produção com transporte fechado; worker novo depois que a migração
estiver nos dois bancos (o contrato de runtime recusa banco sem a capacidade); nenhum job existe.
