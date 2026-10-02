# Etapa 20: corte finito de JSONs do preview

## Escopo fechado

`processNativePreviewJob` é o consumidor do ramo `integration_preview` em `main.ts`.
Executa o workflow vigente: nove passos nas composições que terminam em A01, dez nas
que incluem A02, e um contrato de decisão separado. A publicação humana cobre somente
as 17 extrações efetivamente consumidas. O pacote da imagem contém 2.779.514 bytes
originais dessas fontes; o CSV da ETTJ é capturado em base64 porque seus bytes não são
UTF-8. O empacotamento não publica uma fonte nem presume licença de PDF para extração.

O núcleo registra perguntas e síntese em duas fronteiras pagas separadas, com outcome,
accepted e corpo parsed distintos. A01 admite no máximo duas tentativas; A02 admite
uma tentativa paga. O orçamento comum é o menor entre 0,60 USD, o orçamento do job e
o limite do operador. O job de preview vigente nasce com 0,50 USD: o corte não aumenta
esse valor. Cada exposição mantém `greatest(reserva, custo observado)`, incluindo erro,
timeout e tentativa rejeitada. Uma rota negada antes do envio pode permitir fallback;
um envio pago incerto continua consumindo sua reserva. Não há reparo estruturado.

Contexto e fontes ficam físicos antes do primeiro executor ou envio. Os inputs dos
executores incluem as premissas, respostas humanas e mapas reais; mapas não viram `{}`.
Cada saída é um corpo físico e uma CPA de referências. O estado parcial reutiliza os
TaskRuns e corpos originais; o replay completo não chama modelos. O contrato terminal
é obrigatório antes de concluir o último TaskRun. Os leitores revalidam direitos,
retenção e autoridade depois de ler os bytes.

## Configuração explícita

- `OFFROAD_PREVIEW_PUBLISHED_BASIS_JSON`: objeto fechado `{organizationId,basisId}` de
  uma publicação humana já existente. Ausente: negação controlada antes do modelo.
- `OFFROAD_PREVIEW_EVIDENCE_DIR`: diretório do manifesto e bytes, padrão `/app/evidence17`.
- As conexões e os adapters já usados pelo worker permanecem internos; nenhum segredo
  entra em contexto, receita, metadata ou log.

## Montagem e gate portátil

A sequência dos cinco drafts é `capital_preview_consumed_sources.sql`,
`capital_preview_dispatch_policy.sql`, `capital_preview_native_consumption.sql`,
`capital_preview_execution_ledger.sql`, `capital_preview_native_commit.sql`.
O assembly depende das fronteiras físicas comuns e do S11 presentes no candidato.
Não se aplica arquivo pendente isolado em staging ou produção.

A CI descartável roda `scripts/ci/test-capital-preview-sdk.py`, depois de instalar o
candidato e servir `capital-body-read`. `PREVIEW_DRAFTS_IN_LOCAL_STACK=1` instala os
cinco drafts numa transação exclusivamente em loopback para um gate de candidato;
`PREVIEW_HTTP_NAMESPACE` usa oito dígitos hexadecimais, padrão `a8830001`, distinto dos
SDKs de brief/S11/C11. O launcher preserva o default e os modos existentes e usa
`PREVIEW_HTTP_FIXTURE=1` para start_work → claim → captura → compilador → v7 → aprovação
humana reais. A publicação/verification é fixture local explícita, sem receipt nativo,
TaskRun, invocação ou Storage metadata fabricados.

O SDK testa: licença/verificação das 17 fontes; upload/commit/read Storage real;
10 TaskRuns e 11 JSONs; duas fronteiras pagas; falha antes do marcador final e recovery
parcial sem novos envios; replay completo sem modelos; leitor humano Edge; download
Storage ordinário negado; ausência de publicação sem envio; fonte revogada negando leitura
e reexecução. Os testes SQL de catálogo são autocontidos em `supabase/tests`.

## Evidência e saldo

Os testes de unidade, typechecks e empacotador rodam localmente. SQL/HTTP necessitam
Supabase real da CI: nenhum stub de Auth/Storage ou reprodução Postgres reduzida substitui
essa prova. Migração canônica, revisão independente, CI, staging, produção e deploy
continuam sendo os gates para publicar o corte e fechar a etapa.

Office nativo/material recovery não é provado por esse consumidor JSON: o resultado
registra `materialRecovery: not_proven`; as peças materiais pertencem à fronteira 3S.
Os experimentos históricos e o publisher integral de 43 fontes ficam fora do corte.
Os protótipos locais antigos de receita/whole-corpus foram retirados: só a ABI e o
produtor efetivamente usados permanecem.
