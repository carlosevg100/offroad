# M2, parte 0: contratos da série 432 e dos comunicados do Copom

Estado em 21/10/2026. Especificação documental e contratos em código, sem migração e sem efeito em
produção; o transporte continua fechado. Plano em [`M2-PLANO.md`](M2-PLANO.md); ADR 0023. Segunda
versão, depois da primeira rodada da revisão independente (doze achados, todos tratados).

O código está em `packages/market-reference/src/`:

| Módulo | Conteúdo |
|---|---|
| `selic-target-contract.ts` | contrato fechado da SGS 432 e dos dois endpoints de comunicados, parsers estritos, impressão do registro, data regulatória |
| `strict-json.ts` | leitor JSON estrito comum aos três parsers |
| `market-availability.ts` | instantes em microssegundos e limite exclusivo da data-base em `America/Sao_Paulo` |
| `selic-target-quality.ts` | política de qualidade v2: cobertura, âncora, ligações |
| `market-period-selection.ts` | seleção por período em dois relógios, invariantes do histórico, hash do manifesto |
| `market-canonical-v2.ts` | bytes do `market-canonical.v2` e impressão do contrato da série |

Os vetores comuns estão em `packages/market-reference/vectors/market-m2-part0.json`, gerados por
`vectors/generate_market_m2_part0.py`, implementação independente (aritmética de texto, `zoneinfo`) que
regenera o arquivo byte a byte. O teste `market-m2-part0.test.ts` reproduz todos; a função SQL da parte 1
tem de reproduzir o mesmo arquivo antes de selar qualquer versão.

## 1. Fonte e endpoints fechados

**Série.** `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=DD/MM/AAAA&dataFinal=DD/MM/AAAA`.
A janela é inclusiva, começa em 14/01/2021 ou depois e termina antes do mesmo dia dez anos à frente.

**Comunicados.** Lista `https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicados?quantidade=N`
(1 a 100) e detalhe `.../comunicados_detalhes?nro_reuniao=N`. A lista só descobre reuniões; o valor vem
do detalhe.

**Igualdade byte a byte.** O banco monta a URL. A primeira URL, cada `Location` resolvido e a URL final
precisam ser iguais, byte a byte, à URL que o contrato monta. Nenhuma grafia equivalente é aceita: porta
443 escrita, fragmento vazio, host em maiúsculas ou com codificação percentual, segmento `..`, caminho
ou parâmetro codificado, parâmetros em outra ordem, repetidos ou com zero à esquerda. Outra série no
mesmo host (12 ou 4389, o CDI) falha em `market_url_endpoint`. O worker e a confirmação SQL aplicam a
mesma regra: comparação de texto, nunca de URL normalizada.

**Agente.** O agente de navegador recebe da API do Banco Central uma página HTML de erro com status
200. O agente declarado do worker (`Offroad market reference (+https://offroad.capital)`) recebe JSON;
a checagem de tipo do worker e o leitor estrito recusam a página.

## 2. Leitor JSON estrito e parsers (falha estrutural é falha da tentativa)

**Leitor.** UTF-8 válido sem BOM; gramática do RFC 8259; chave repetida no mesmo objeto é recusada
(`json_duplicate_key`), porque `JSON.parse` e `jsonb` guardariam só a última; strings feitas de
escalares Unicode, sem surrogate isolado e sem U+0000, que `text`/`jsonb` não guardam do mesmo jeito.
Números continuam números e textos continuam textos.

**SGS 432.** Array não vazio de objetos com exatamente `data` (`DD/MM/AAAA`, data real) e `valor`
(texto `^(0|[1-9]\d{0,2})\.\d{2}$`, sem zero à esquerda), dias estritamente crescentes, todos dentro
da janela pedida. Número em vez de texto, resposta vazia, dia repetido, fora de ordem ou fora da janela
é `parse_failed` e não gera versão. Dia faltando não é estrutural: a qualidade aponta.

**Detalhe do comunicado.** `{"conteudo":[registro]}` com um registro e exatamente os quatro campos
documentados; reunião igual à pedida; data real. O título tem um único verbo (`Copom eleva`, `reduz` ou
`mantém`) e um único token de taxa: um ou dois dígitos não precedidos de dígito, vírgula ou ponto,
`,NN`, `% a.a.` (`112,25% a.a.` não tem token). No texto sem tags e com entidades decodificadas, a
cláusula de decisão é o primeiro trecho que começa em `decidiu`, `elevando`, `reduzindo` ou `mantendo`
e termina na primeira taxa, sem `%` no meio. Cobre as quatro redações usadas desde 2021 (inclusive
"reduzindo a taxa básica de juros para", da reunião 279). Cláusula com taxa diferente do título é
contradição e é recusada; sem cláusula, a primeira taxa do texto tem de ser a do título, e o registro
leva `textDecision: absent`.

**Impressão do registro.** SHA-256 em UTF-8 de

```
copom-communique-record.v1
meeting:<n>
reference:<AAAA-MM-DD>
title:<tamanho em bytes UTF-8>:<título como recebido>
text:<tamanho em bytes UTF-8>:<texto como recebido>
```

## 3. Instantes e disponibilidade

Instantes seguem RFC 3339 com no máximo seis casas (sete são recusadas, nunca arredondadas) e são
comparados em microssegundos, a precisão de `timestamptz`. No M2 toda observação e todo comunicado
ficam disponíveis no instante da aquisição (`observed_at_acquisition`). A leitura com data-base D usa o
limite exclusivo L(D): o primeiro instante cuja data civil em `America/Sao_Paulo` é D+1. Um item vale
para D se `acquired_at < L(D)` e `available_at < L(D)`. Os vetores cobrem o dia normal (03:00Z), o
horário de verão (02:00Z em 15/02/2019), o dia que começa no salto (04/11/2018) e o dia com a hora
repetida (16/02/2019). No mesmo dia até 23:59:59,999999 local vale; exatamente no limite já é o dia
seguinte.

## 4. Vigência, calendário e qualidade (política `bcb-sgs-432-quality` v2)

A série registra a nova meta no **dia corrido seguinte** à `dataReferencia` do comunicado
(`seriesChangeDate`). A Resolução BCB 61 fixa a vigência no dia útil seguinte; o contrato grava essa data
como `regulatoryEffectiveFrom`, informativa, pelo calendário nomeado no contrato
(`financial-core.brazilian-national-holidays@2026.10.19-v1`, feriados bancários nacionais), o mesmo que
mede o prazo de frescor. A qualidade nunca usa o calendário.

Avaliação de uma janela pedida W para a data-base D, só com o que foi adquirido antes de L(D):

1. **Cobertura.** Todo dia corrido de W.início até o menor entre W.fim e D está presente; falta no
   começo, no meio ou no fim é `calendar_gap`. Nenhuma observação é `insufficient`, nunca aprovação.
2. **Âncora.** O patamar do primeiro dia precisa de um comunicado elegível: o mais recente cuja
   `seriesChangeDate` é anterior ou igual a W.início, com a mesma taxa. Sem ele, `start_without_anchor`;
   com outra taxa, `anchor_value_mismatch`.
3. **Mudanças.** Cada mudança de valor entre dias consecutivos liga-se ao comunicado cuja reunião
   terminou no dia anterior, com a mesma taxa e a mesma direção. Sem comunicado,
   `change_without_communique`; comunicado com outra taxa, `communique_value_mismatch`; verbo contrário
   (inclusive `mantém` com mudança e `eleva`/`reduz` sem mudança), `communique_direction_mismatch`.
   Reunião extraordinária segue a mesma regra.
4. **Faixa e recorte.** Valor acima de 100 ou período antes de 14/01/2021.

Igualdade e direção são numéricas. Qualquer achado põe a versão em `quarantined`.

## 5. Seleção por período e manifesto

Dois relógios: data-base D (disponibilidade) e instante de conhecimento K (o que a Offroad tinha
gravado), ambos em microssegundos. O histórico inteiro é conferido antes da escolha, qualquer que seja K:
ids canônicos e únicos; o mesmo `acquired_at` para todas as versões de uma aquisição; um reprocessamento
aponta para uma versão existente da mesma aquisição, com `recorded_at` estritamente posterior, e cada
versão é substituída no máximo uma vez (sem bifurcação e, com tempo estritamente crescente, sem ciclo);
cada retirada tem id próprio e evidência SHA-256. Histórico quebrado é erro, nunca escolha silenciosa.

Uma versão entra se `recorded_at <= K`; o reprocessamento substitui a anterior só a partir de K. Entre
aquisições vence o `acquired_at` mais recente por período, empate pelo maior id de versão em ordem de
bytes. Direito e data-base filtram antes da escolha. Período omitido numa resposta nova continua com a
versão anterior. Retirada oficial remove o período das versões adquiridas até a aquisição dela, sem
ressuscitar o valor anterior; uma aquisição posterior que traga o período o devolve. Estas mesmas
condições são gates da parte 1 no banco.

Hash do manifesto, SHA-256 em UTF-8 de

```
market-manifest.v1
object:<logical id>
data-base:<D>
knowledge:<K em UTC, seis casas, Z>
window:<início>..<fim>
<período>|<versão>      (uma linha por período, em ordem crescente)
```

## 6. `market-canonical.v2`

UTF-8, linhas separadas por LF, sem LF final, sem BOM. Todo campo é ASCII de gramática fechada e é
recusado fora dela, por isso não há escape.

```
market-canonical.v2
source-revision:<uuid>
series-contract:<id>@<sha256 do contrato>
parser:<slug>
quality-policy:<id>@<versão>
availability:observed_at_acquisition
inputs:a:<uuid>,a:<uuid>
supersedes:<uuid>|null
links:
<reunião>|<data>|<raise|cut|hold>|<taxa>|<sha256 do registro>|<uuid da aquisição do comunicado>
observations:
<início ou vazio>|<fim>|<available_at>|<acquired_at>|<valor>|<unidade>|<escala>
```

**Ordem.** Entradas por bytes (`COLLATE "C"`); ligações pelo número da reunião como inteiro;
observações por fim e depois início, com início nulo **antes** de qualquer início (`NULLS FIRST`), datas
comparadas por bytes. Um (fim, início) repetido é recusado.

**Domínios.** UUID minúsculo canônico. Instantes em UTC com seis casas e `Z`, offset normalizado.
Decimais até 24 dígitos inteiros e 20 fracionários, na forma de `trim_scale(x)::text`: sem zero à esquerda
além de `0.`, sem zero final na fração, sem ponto solto, nunca `-0`, sem arredondamento. Lista vazia é
só o cabeçalho. Objeto derivado (metodologia, dependências) não tem forma v2 e continua em v1; selos v1
seguem verificáveis.

Os vetores cobrem limites de precisão, início nulo e preenchido no mesmo fim, UUIDs e reuniões cuja
ordem de bytes difere da numérica, offsets que viram a data e o ano em UTC, listas vazias e recusas.

**Impressão do contrato da série** (`series-contract`), SHA-256 de

```
market-series-contract.v1
id:bcb-sgs-432
host:api.bcb.gov.br
path:/dados/serie/bcdata.sgs.432/dados
unit:percent_per_year
scale:1
convention:meta_copom
parser:bcb-sgs-daily-json.v2
license:bcb-catalog-meta-selic-432
homologated-from:2021-01-14
max-window-years:10
calendar:financial-core.brazilian-national-holidays@2026.10.19-v1
```

= `eb892dc221c7b11d2ec37cf0ca8b0965584256498cd776ddc1811975a4e70aee`.

## 7. Conferência empírica e evidências

`selic-target-conference.json` registra a conferência de 21/10/2026: as URLs pedidas, o hash de cada um
dos 49 arquivos do corpus (série de 14/01/2021 a 21/10/2026, lista de 60 comunicados e detalhes das
reuniões 235 a 281) e o resultado esperado: 2.107 dias, 47 comunicados, aprovado, âncora na reunião 235,
31 mudanças ligadas, nenhum achado, e data regulatória diferente do dia da série nas reuniões 247, 258
e 271. O corpus fica na pasta privada `outputs/market-reference/corpus-meta-selic-2026-10-21/`;
`selic-target-corpus.test.ts` confere os hashes e reproduz o resultado quando `MARKET_SELIC_CORPUS`
aponta para ela.

Em `license-evidence.json`: `bcb-catalog-atas-comunicados-copom` (ODbL), `bcb-copom-api-openapi`,
`bcb-site-termos-de-uso` (reprodução com integridade e citação da fonte) e `bcb-resolucao-bcb-61`
(vigência desde 14/01/2021). Capturas em `outputs/market-reference/license-captures-2026-10-21/`.

## 8. O que a parte 1 tem de provar com estes contratos

A função SQL do canônico v2 reproduz o arquivo de vetores; a confirmação única recusa URL que não seja
byte a byte a do contrato, parser e janela fora do contrato; a qualidade gravada é a desta política; os
invariantes de histórico da seção 5 são gates no banco; a RPC antiga recusa toda confirmação.
