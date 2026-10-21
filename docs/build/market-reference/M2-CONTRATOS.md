# M2, parte 0: contratos da série 432 e dos comunicados do Copom

Estado em 21/10/2026. Especificação documental e contratos em código, sem migração e sem efeito em
produção; o transporte continua fechado. Plano em [`M2-PLANO.md`](M2-PLANO.md); ADR 0023.

O código está em `packages/market-reference/src/`:

| Módulo | Conteúdo |
|---|---|
| `selic-target-contract.ts` | contrato fechado da SGS 432 e dos dois endpoints de comunicados, parsers estritos, impressão digital do registro |
| `market-availability.ts` | limite exclusivo da data-base em `America/Sao_Paulo` |
| `selic-target-quality.ts` | política de qualidade v1 e elegibilidade conjunta série/comunicado |
| `market-period-selection.ts` | seleção por período em dois relógios e hash do manifesto |
| `market-canonical-v2.ts` | bytes do `market-canonical.v2` e impressão digital do contrato da série |

Os vetores comuns estão em `packages/market-reference/vectors/market-m2-part0.json`, gerados por uma
implementação independente em Python (`zoneinfo` e `decimal`), não pelo TypeScript: `vectors/generate_market_m2_part0.py` regenera o arquivo byte a byte. O teste
`market-m2-part0.test.ts` reproduz todos; a função SQL da parte 1 tem de reproduzir o mesmo arquivo
byte a byte antes de selar qualquer versão.

## 1. Fonte e endpoints fechados

**Série.** `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=DD/MM/AAAA&dataFinal=DD/MM/AAAA`.
Exatamente esses três parâmetros, uma vez cada, sem porta, sem credencial, sem fragmento, só HTTPS. A
janela é inclusiva, começa em 14/01/2021 ou depois e termina antes do mesmo dia dez anos à frente. O
banco monta a URL; o worker e a confirmação conferem a primeira URL, cada redirecionamento e a final
contra o contrato. Outra série no mesmo host (12 ou 4389, o CDI) falha em `market_url_series`.

**Comunicados.** Lista `https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicados?quantidade=N`
(1 a 100) e detalhe `.../comunicados_detalhes?nro_reuniao=N`, cada um com exatamente seu parâmetro. A
lista só descobre reuniões; o valor vem do detalhe.

**Agente.** O agente de navegador recebe da API do Banco Central uma página HTML de erro com status
200. O agente declarado do worker (`Offroad market reference (+https://offroad.capital)`) recebe JSON;
a checagem de tipo do worker e o parser recusam a página de erro (`market_parse_not_json`).

## 2. Parsers (falha estrutural é falha da tentativa)

**SGS 432.** Array não vazio de objetos com exatamente `data` (`DD/MM/AAAA`, data real) e `valor`
(`^\d{1,3}\.\d{2}$`), dias estritamente crescentes, todos dentro da janela pedida. Resposta vazia, dia
repetido, fora de ordem ou fora da janela é `parse_failed` e não gera versão. Dia faltando não é
estrutural: a qualidade aponta.

**Detalhe do comunicado.** `{"conteudo":[registro]}` com um registro e exatamente os quatro campos
documentados (`nro_reuniao`, `dataReferencia`, `titulo`, `textoComunicado`); reunião igual à pedida;
data real. O título tem um único verbo (`Copom eleva`, `reduz` ou `mantém`) e uma única taxa
`NN,NN% a.a.`; o texto, sem tags e com entidades decodificadas, precisa conter a mesma taxa. A frase de
decisão do texto não serve de âncora: falta na reunião 279 e se repete nas de 2021 a 2023.

**Impressão do registro.** SHA-256 em UTF-8 de

```
copom-communique-record.v1
meeting:<n>
reference:<AAAA-MM-DD>
title:<tamanho em bytes UTF-8>:<título como recebido>
text:<tamanho>:<texto como recebido>
```

## 3. Disponibilidade

No M2 toda observação e todo comunicado ficam disponíveis no instante da aquisição
(`observed_at_acquisition`). A leitura com data-base D usa o limite exclusivo L(D): o primeiro
milissegundo cuja data civil em `America/Sao_Paulo` é D+1. Um item vale para D se `acquired_at < L(D)`
e `available_at < L(D)`. Os vetores cobrem o dia normal (03:00Z), o horário de verão (02:00Z em
15/02/2019), o dia que começa no salto (04/11/2018) e o dia com a hora repetida (16/02/2019). No mesmo
dia até 23:59:59,999 local vale; exatamente no limite já é o dia seguinte.

## 4. Vigência e qualidade (política `bcb-sgs-432-quality` v1)

A série registra a nova meta no **dia corrido seguinte** à `dataReferencia` do comunicado
(`seriesChangeDate`). A Resolução BCB 61 fixa a vigência no dia útil seguinte, mas a série a contraria
nas vésperas de feriado; a regra segue a série e a data regulatória não é testada. Conferência em
21/10/2026: 2.107 dias da série, 46 comunicados, 31 mudanças, todas ligadas, nenhum achado.

Achados, cada um põe a versão em quarentena: valor fora de 0 a 100; buraco de dia corrido; período
antes de 14/01/2021; mudança sem comunicado elegível; comunicado com valor diferente da série no dia
seguinte; verbo contrário à direção (inclusive `mantém` com mudança e `eleva`/`reduz` sem mudança).
A ligação só conta quando o comunicado também foi adquirido antes de L(D): a mesma mudança fica em
quarentena para D e ligada para D+1 se o comunicado chegou exatamente no limite.

## 5. Seleção por período e manifesto

Dois relógios: data-base D (disponibilidade) e instante de conhecimento K (o que a Offroad tinha
gravado). Uma versão entra se `recorded_at <= K`; um reprocessamento é uma versão da mesma aquisição
com `supersedes` e `recorded_at` posterior, e substitui a anterior só a partir de K. Entre aquisições
vence o `acquired_at` mais recente por período, empate pelo maior id de versão. Direito e data-base
filtram antes da escolha. Período omitido numa resposta nova continua com a versão anterior. Retirada
oficial é revogação com evidência: remove o período das versões adquiridas até ela, sem ressuscitar o
valor anterior; uma aquisição posterior que traga o período o devolve.

Hash do manifesto, SHA-256 em UTF-8 de

```
market-manifest.v1
object:<logical id>
data-base:<D>
knowledge:<K em UTC, milissegundos, Z>
window:<início>..<fim>
<período>|<versão>      (uma linha por período, em ordem crescente)
```

O mesmo D com o mesmo K reproduz o manifesto; um manifesto fixado antes de um reprocessamento não muda.

## 6. `market-canonical.v2`

UTF-8, linhas separadas por LF, sem LF final, sem BOM. Cada campo tem gramática fechada e é recusado
fora dela, por isso não há escape.

```
market-canonical.v2
source-revision:<uuid>
series-contract:<id>@<sha256 do contrato>
parser:<slug>
quality-policy:<id>@<versão>
availability:observed_at_acquisition
inputs:a:<uuid>,a:<uuid>          (ordem crescente)
supersedes:<uuid>|null
links:
<reunião>|<data>|<raise|cut|hold>|<taxa>|<sha256 do registro>|<uuid da aquisição do comunicado>
observations:
<início ou vazio>|<fim>|<available_at>|<acquired_at>|<valor>|<unidade>|<escala>
```

Ligações em ordem de reunião; observações por (fim, início). Instantes em UTC com seis casas e `Z`
(offset normalizado; sete casas são recusadas, nunca arredondadas). Decimais na forma de
`trim_scale(x)::text`: sem zeros à esquerda além de `0.`, sem zeros finais na fração, sem ponto solto,
nunca `-0`. Lista vazia é só o cabeçalho. Objeto derivado (metodologia, dependências) não tem forma v2
e continua em v1. Selos v1 seguem verificáveis.

Impressão do contrato da série (`series-contract`), SHA-256 de

```
market-series-contract.v1
id:bcb-sgs-432
host:api.bcb.gov.br
path:/dados/serie/bcdata.sgs.432/dados
unit:percent_per_year
scale:1
convention:meta_copom
parser:bcb-sgs-daily-json.v1
license:bcb-catalog-meta-selic-432
homologated-from:2021-01-14
max-window-years:10
```

= `11cd566edfeb865ea42a093430afeb07c23bb1979c88daa6104e96bfaeb1dba4`.

## 7. Evidências

Em `license-evidence.json`: `bcb-catalog-atas-comunicados-copom` (ODbL), `bcb-copom-api-openapi`,
`bcb-site-termos-de-uso` (reprodução com integridade e citação da fonte) e `bcb-resolucao-bcb-61`
(vigência desde 14/01/2021). As capturas ficam na pasta privada
`outputs/market-reference/license-captures-2026-10-21/`, fora do repositório.

## 8. O que a parte 1 tem de provar com estes contratos

A função SQL do canônico v2 reproduz o arquivo de vetores; a confirmação única recusa URL, parser e
janela fora do contrato; a qualidade gravada é a desta política; a RPC antiga recusa toda confirmação.
