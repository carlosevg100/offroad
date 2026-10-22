# M2 parte 4: atos de produção e abertura (ADR 0023)

Escopo: os atos que ligam a base de mercado, depois das partes 0, 1, 3, 6 e 2 em produção com o transporte
fechado. Autorização expressa do fundador em 22/10/2026, no chat do programa: "Autorizo a parte 4 da base de
mercado: registrar as agendas da série Selic e dos comunicados do Copom, conceder as delegações do worker,
gravar o calendário do Copom de 2026, registrar o consumidor do monitor RG-01, adquirir os comunicados de âncora
e a janela inicial da série, publicar a primeira edição ODbL e, por último, abrir o transporte, com prova
integrada em staging antes." A abertura do transporte em produção é pedida de novo ao fundador como liberação
final, separada (seção 4).

## 1. Ordem: transporte antes do bootstrap, agendas por último

O plano diz que "a chave só abre depois da outbox consumida, da página ODbL publicada e da prova integrada em
staging". Em produção não há outro caminho de aquisição além do worker, e o worker só reivindica job com o
transporte aberto; a primeira edição exige versão aprovada, que exige aquisição. Por isso a parte 4 separa
duas chaves:

- **Transporte** (`release_market_acquisition_transport_v1`): libera a aquisição de jobs já enfileirados.
  Abre depois da prova integrada em staging e dos registros da seção 3, mediante a liberação final do
  fundador, e serve primeiro ao bootstrap, que é todo manual e enumerado.
- **Agendas** (`grant_market_acquisition_schedule_v1`): a operação contínua, que cria jobs sozinha. É a
  última chave e só abre depois do bootstrap aprovado, da outbox consumida pelo monitor e da página ODbL
  publicada.

Emenda ao `M2-PLANO.md` registrada com esta parte: "a chave que abre por último" passa a ser a das agendas; o
transporte abre antes, para o bootstrap enumerado, depois da prova integrada e da liberação final.

## 2. Definições

Identidade dos atos. Em produção, todo ato é comando com recibo em nome do principal fundador
(`b60448ce-965a-4303-ae39-50447450c2aa`), executado pela conexão administrativa do projeto sob a autorização
acima, que o motivo de cada comando cita. Os comandos têm identificador UUID v5 no namespace da parte
(`market-m2-part4:<ambiente>:<ato>`), de modo que a repetição de um passo é replay, nunca segundo efeito.

Worker de produção: token `655b20e1-3bac-4ad5-a8be-77f5b7687fa0` (ECS sa-east-1), conta
`5ed2e540-b8f0-40a2-88a5-c3daf7a7cba5`; a imagem implantada já exige `market-acquisition-scheduler.v1`.

Fonte `bcb`, revisão 1:

| Campo | Valor | Razão |
|---|---|---|
| `registryId` | `bcb_sgs` | Chave do registro de dados de referência usada pelos testes e pela publicação |
| `license.kind` / `license.license` | `open` / `ODbL-1.0` | Catálogo de dados abertos do Banco Central (evidências abaixo) |
| `license.attribution` | `Banco Central do Brasil` | Atribuição exigida pela ODbL e pelos termos do site |
| `license.evidenceIds` | `bcb-catalog-meta-selic-432`, `bcb-catalog-atas-comunicados-copom`, `bcb-site-termos-de-uso` | As três que os contratos da série e dos comunicados citam (`license-evidence.json`) |
| `license.retainAdoptedValues` / `storeDays` | `true` / `null` | Exceção de retenção da M2: só licença aberta sem prazo com direito de reter |
| `allowedHosts` | `api.bcb.gov.br`, `www.bcb.gov.br` | Hosts dos três contratos |
| `calendar` | `br_business_days` | Calendário da normalização |
| `expectedPublication` | `09:00` | Horário das agendas; a série 432 já traz o dia corrente na captura de 21/10 |
| `maximumAgeHours` | `30` | Uma coleta diária mais folga de seis horas |
| `enabled` | `true` | |

Calendário do Copom de 2026: Comunicado BCB nº 43.383, de 24/06/2025, capturado em 22/10/2026 pela API de
normativos do site (`https://www.bcb.gov.br/api/conteudo/app/normativos/exibeoutrasnormas?p1=COMUNICADO&p2=43383`,
`application/json; charset=utf-8`, SHA-256 `13a3738730bacd2938c3761d788733e6c281298242fd6f17a2813997cb0064c5`,
cópia privada em `outputs/market-reference/parte-4/`). Reuniões: 27–28/01, 17–18/03, 28–29/04, 16–17/06,
04–05/08, 15–16/09, 03–04/11, 08–09/12. O endereço antigo da página de calendário responde 404.

Consumidor `rg01-monitor`: `register_market_event_consumer_v2` com tratador `rg01`, eventos `approved`,
`quarantined`, `superseded`, `revoked`, `purged`, `released` e sujeitos `acquisition`, `version`, `source`:
tudo o que muda a leitura do regime acorda o monitor; o tratador decide o que vira pedido.

Delegações do token de produção: aquisição para a fonte `bcb`; evento para o consumidor `rg01-monitor`.

Agendas: `series_432` com `coverageStart` `2021-01-14` (recorte homologado), `copom_communiques` com `size` 20;
as duas às `09:00`, todos os dias (`business_days_only` falso), porque a série é diária e um dia perdido é
recuperado pela cobertura.

## 3. Prova integrada em staging

Staging não tem worker nem web próprios. A prova roda a imagem do main localmente contra staging:

1. Identidades sintéticas em staging, rotuladas como tal: um principal fundador, uma conta de worker com
   senha gerada na sessão e um token de worker vinculado a ela. Nenhum valor secreto vai para o repositório.
2. Os mesmos atos da seção 4, passos A a E, em staging, com as mesmas definições e os mesmos bytes do
   calendário.
3. Transporte aberto em staging; o worker local (build do `main`, `SUPABASE_URL` e chave pública de staging,
   conta e token sintéticos) roda as requisições da conferência da parte 0
   (`selic-target-conference.json`): lista de 60, detalhes das reuniões 235 a 281 e a série de 14/01/2021 a
   21/10/2026, todas pelo enfileirador manual existente.
4. Aceite do corpus: o SHA-256 de cada aquisição é igual ao do arquivo do corpus privado de 21/10; a versão da
   série sai aprovada com 2.107 observações, 31 vínculos, nenhum achado e âncora 235; as 47 reuniões ficam
   registradas com o comunicado de referência. Diferença de hash em algum arquivo é investigada antes de
   seguir (mudança da fonte é fato a registrar, não a contornar).
5. Janela viva: série de 22/10/2026 até ontem, aprovada; lista de 20.
6. Monitor: o consumidor recebe os eventos, o worker agenda e avalia o RG-01; o resultado e o frescor ficam
   registrados.
7. Primeira edição ODbL em staging (`publish_market_odbl_release_v1` com o commit do main); a web local
   apontada para staging responde `/dados/meta-selic.json` com 200, o corpo igual ao canônico do banco e
   `x-offroad-sha256` igual ao registrado, e `/pt-BR/dados/meta-selic` com 200 e a atribuição.
8. Agendas em staging; um disparo do worker local: série `covered` ou janela de um dia, lista `fired` e
   confirmada, nenhum bloqueio inesperado.
9. Encerramento: worker local parado, transporte de staging fechado, token sintético revogado. Os dados
   ficam em staging como evidência.

## 4. Produção

Antes da liberação final (nada busca nada, transporte fechado):

- A. Publicadora: `register_market_publisher_v1` (fundador).
- B. Revisão 1 da fonte `bcb` (seção 2).
- C. Calendário de 2026 com os bytes capturados.
- D. Consumidor `rg01-monitor` e delegação de evento do token de produção.
- E. Delegação de aquisição do token de produção para `bcb`.

Liberação final do fundador, pedida no chat com o resultado da prova de staging e dos passos A a E.

Depois da liberação:

- F. Transporte aberto.
- G. Bootstrap enumerado pelo enfileirador manual, na ordem: lista de 60; detalhes das reuniões que ela
  listar desde a 235; série de 14/01/2021 até ontem. Aceite: hashes iguais aos de staging para os mesmos
  pedidos, série aprovada, reuniões com referência.
- H. Monitor: outbox do consumidor sem linha pendente ou bloqueada; avaliação do RG-01 registrada.
- I. Primeira edição ODbL com o commit do main; `https://offroad.capital/dados/meta-selic.json` e
  `/pt-BR/dados/meta-selic` com 200, corpo e hash iguais ao banco.
- J. Agendas (última chave); conferência do primeiro disparo do worker de produção.

## 5. Reversão

Até E: nada é buscado; consumidor e delegações são revogáveis por comando. Depois de F: fechar o transporte
para qualquer reivindicação; revogar agendas; retirar a edição (`withdraw_market_odbl_release_v1`, a rota
passa a 410). Nenhum passo apaga recibo.

## 6. Registros

Nenhuma migração. Ledgers e handoff com os identificadores e hashes de cada ato; nenhuma captura de terceiro,
corpo de comunicado ou série vai ao repositório público, só hashes. Emenda do `M2-PLANO.md` (seção 1).
