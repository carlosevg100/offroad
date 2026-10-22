# M2 parte 4: atos de produção e abertura (ADR 0023)

Escopo: os atos que ligam a base de mercado, depois das partes 0, 1, 3, 6 e 2 em produção com o transporte
fechado. Autorização expressa do fundador em 22/10/2026, no chat do programa: "Autorizo a parte 4 da base de
mercado: registrar as agendas da série Selic e dos comunicados do Copom, conceder as delegações do worker,
gravar o calendário do Copom de 2026, registrar o consumidor do monitor RG-01, adquirir os comunicados de âncora
e a janela inicial da série, publicar a primeira edição ODbL e, por último, abrir o transporte, com prova
integrada em staging antes." A abertura do transporte em produção é pedida de novo ao fundador como liberação
final, separada, e esse pedido apresenta expressamente a ordem da seção 1.

Mudanças da v2 (revisão 1): calendário evidenciado pelo JSON do normativo, com migração; emenda canônica do
plano; barreiras do bootstrap e regras de parada; lista do bootstrap do tamanho exato do recorte; isolamento do
worker local; manifesto de pedidos idênticos por data operacional; aceite do monitor com resultado esperado;
prova completa da edição; reversão por pausa e retomada ensaiadas; manifesto de comandos; significado dos
horários e operação contínua.

## 1. Ordem: transporte antes do bootstrap, agendas por último

Em produção o único caminho de aquisição é o worker, que só reivindica job com o transporte aberto; a primeira
edição exige versão aprovada, que exige aquisição. A parte 4 separa duas chaves:

- **Transporte**: libera a reivindicação de jobs. Abre depois da prova integrada em staging e dos registros da
  seção 4, mediante a liberação final do fundador, e serve primeiro ao bootstrap enumerado.
- **Agendas**: a operação contínua, que cria jobs sozinha. É a última chave; só abre depois do bootstrap
  aprovado, da outbox do monitor consumida e da página ODbL publicada.

O transporte é global: libera qualquer job elegível. Por isso, imediatamente antes de abrir, confere-se que não
há agenda ativa, que não há job `queued` ou `leased` e que só existem as delegações do manifesto; durante o
bootstrap nenhum outro enfileiramento é feito além dos do manifesto. A emenda entra no `M2-PLANO.md` com esta
parte.

## 2. Definições e manifesto

Todos os atos estão em `M2-PARTE-4-MANIFESTO.json`, gerado por `scripts/market-part4-manifest.py`: ambiente,
ator, função, argumentos, motivo e comando UUID v5 no namespace `9ddec42e-8e97-5b84-93d3-9c8bd5b7e8b3`
(`uuid5(NAMESPACE_URL, 'https://offroad.capital/market/m2-part4')`, nome `<ambiente>:<ato>`). Repetir um ato é
replay do mesmo comando; uma retomada usa atos novos (`resume-<n>`), porque replay de concessão revogada não a
reativa. Nenhum segredo entra no manifesto.

Produção: ator é o principal fundador (`b60448ce-965a-4303-ae39-50447450c2aa`), atos pela conexão
administrativa do projeto, cada motivo cita a autorização; worker é o token do ECS (`655b20e1-…`, conta
`5ed2e540-…`), compartilhado com os demais trabalhos e nunca revogado por esta parte.

Fonte `bcb`, revisão 1: licença `open` ODbL-1.0 com atribuição "Banco Central do Brasil" e as evidências
`bcb-catalog-meta-selic-432`, `bcb-catalog-atas-comunicados-copom` e `bcb-site-termos-de-uso` (as três que os
contratos citam), retenção dos valores adotados sem prazo, hosts `api.bcb.gov.br` e `www.bcb.gov.br`, calendário
`br_business_days`. `expectedPublication` 09:00 e `maximumAgeHours` 30 ficam registrados para a operação por
fonte; não governam o frescor do RG-01, que segue a decisão 5 (reuniões e prazos).

Calendário de 2026: Comunicado BCB nº 43.383, de 24/06/2025, que o site só publica pela API de normativos
(a página é um aplicativo sem o texto e não há PDF). Bytes da resposta como recebidos, `application/json`,
SHA-256 `13a3738730bacd2938c3761d788733e6c281298242fd6f17a2813997cb0064c5`, cópia privada em
`outputs/market-reference/parte-4/`. A migração `20261022232059_market_m2_calendar_json_evidence` admite
`application/json` na evidência do calendário (antes só HTML e PDF), com teste no `market_rg01_monitor.sql`.
Reuniões: 27–28/01, 17–18/03, 28–29/04, 16–17/06, 04–05/08, 15–16/09, 03–04/11, 08–09/12.

Consumidor `rg01-monitor`, tratador `rg01`, eventos `approved`, `quarantined`, `superseded`, `revoked`, `purged`,
`released`, sujeitos `acquisition`, `source`, `version`. Delegações do token: evento para `rg01-monitor`;
aquisição para `bcb`.

Agendas: `series_432` com `coverageStart` 2021-01-14 e `copom_communiques` com `size` 20, as duas a partir das
09:00 de São Paulo todos os dias. 09:00 é o início da janela diária de disparo, não uma garantia de publicação do
Banco Central; antes disso o disparo responde `not_due`.

## 3. Bootstrap (igual nos dois ambientes)

Data operacional D: a data de São Paulo em que o bootstrap de produção roda. Pedidos, na ordem, com barreira
entre os grupos:

1. Lista de `size` = última reunião − 235 + 1 (47 enquanto a última for a 281). Barreira: job `succeeded`, as
   reuniões listadas são exatamente 235 até a última, com as datas do corpus para 235–281. Nenhuma reunião
   anterior à âncora fica listada, então a agenda de comunicados não terá descoberta pendente fora do recorte.
2. Um detalhe por reunião listada. Barreira: todos `succeeded`, cada reunião registrada com o comunicado de
   referência legível, decisão e meta iguais ao corpus; a âncora 235 entre elas.
3. Série de 2021-01-14 até D−1. Barreira: versão aprovada e legível (`market_version_readable_v1` em
   `consume`), sem achado, ligada à âncora 235 e às mudanças do recorte (31 até a reunião 281, mais as de
   reuniões novas).

Regras de parada: qualquer job falho, `parse_failed`, `market_copom_list_conflict`, `meeting_disagreement`,
quarentena da série ou comunicado indisponível interrompem o bootstrap para investigação. Nenhuma aprovação
manual de versão é usada para concluir a abertura; lacuna documental tardia é resolvida adquirindo o comunicado e
religando a versão (`relink_market_version_v1`), nunca repetindo o mesmo comando.

## 4. Prova integrada em staging

Staging não tem worker nem web próprios. A prova roda o código do `main` (commit registrado) localmente contra
staging:

1. Identidades sintéticas em staging, criadas pelo conector administrativo e rotuladas: principal fundador
   (`e26ced3a-…`), conta de worker (`f46fa371-…`) com senha gerada na sessão, token (`c9783ba9-…`) vinculado a
   ela. Senha e texto do token ficam só no ambiente do processo local e são descartados no fim.
2. Worker local isolado: `env -i` com apenas `PATH`, `HOME`, `NODE_ENV`, `SUPABASE_URL` e
   `SUPABASE_PUBLISHABLE_KEY` de staging, `WORKER_ACCOUNT_EMAIL`, `WORKER_ACCOUNT_PASSWORD` e
   `OFFROAD_WORKER_TOKEN` sintéticos; nenhuma credencial de AWS, de modelo ou de produção. Antes de autenticar,
   confere-se que o host é o de staging. O token não tem concessão fora do mercado; ao fim, confere-se que ele
   não reivindicou nada além de jobs de mercado.
3. Atos A a F do manifesto em staging (publicadora, fonte, calendário com os mesmos bytes, consumidor,
   delegações, transporte), com a conferência pré-abertura da seção 1.
4. Reprodução do corpus: além do bootstrap da seção 3, o pedido `corpus-series` (2021-01-14 a 2026-10-21).
   Aceite: o SHA-256 de cada detalhe 235–281 e da série `corpus-series` é igual ao do arquivo do corpus privado
   de 21/10; a versão sai aprovada com 2.107 observações, 31 vínculos e âncora 235. A lista do bootstrap tem
   outro tamanho que a do corpus (47 e 60): compara-se o conteúdo das reuniões 235–281, não o hash. Diferença
   de hash de um detalhe é investigada antes de seguir.
5. Bootstrap da seção 3 com D igual ao dia da prova. Se o bootstrap de produção ocorrer em outro dia, a série
   2021-01-14 até D−1 é adquirida de novo em staging no dia de produção, para comparar o hash de pedidos iguais.
6. Monitor (aceite H): consumidor sem linha `pending`, `leased` ou `blocked`; todos os pedidos de avaliação
   satisfeitos; a última avaliação posterior à última confirmação; declaração ativa, reuniões 277–281 como
   cortes de 25 pontos de 15,00% a 13,75%, nenhuma alta: resultado `not_fired`, frescor `current` enquanto
   nenhuma reunião relevante tiver o prazo vencido, nenhuma contradição na linha de base.
7. Edição ODbL em staging com o commit do main; web local (`NEXT_PUBLIC_SUPABASE_URL` e
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` de staging no build) e aceite I da seção 5.
8. Agendas em staging e aceite J com o worker local até estabilizar.
9. Ensaio da reversão: pausa (transporte fechado, delegações de aquisição e de evento revogadas, agendas
   revogadas, jobs `queued` cancelados); confere-se que o disparo bloqueia e que nada é reivindicado; retomada
   com atos novos; nova pausa final; token sintético revogado. Os dados ficam em staging como evidência.

## 5. Produção

Pré-requisito: esta parte mesclada, com a migração do calendário em produção e web e worker implantados no
commit que a contém.

Antes da liberação final (transporte fechado; nada busca nada):

- A. Publicadora. B. Revisão 1 da fonte. C. Calendário de 2026. D. Consumidor `rg01-monitor` e delegação de
  evento. E. Delegação de aquisição.

Liberação final do fundador, com a prova de staging, os passos A a E e a ordem da seção 1.

Depois da liberação:

- F. Conferência pré-abertura (seção 1) e transporte aberto.
- G. Bootstrap da seção 3; hashes iguais aos de staging para os mesmos pedidos no mesmo D.
- H. Monitor, com o aceite do passo 6 da seção 4.
- I. Primeira edição ODbL com o SHA do main implantado (o mesmo no Vercel de produção e na imagem do worker).
  Aceite em `https://offroad.capital`: `/dados/meta-selic.json` com 200, `application/json; charset=utf-8`,
  `no-store`, `nosniff`, CSP, sem `Set-Cookie`, `x-offroad-release` 1 e `x-offroad-sha256` igual ao SHA-256 do
  corpo e ao do banco; `/pt-BR/dados/meta-selic` com 200, atribuição e licença; os links públicos de parser,
  regras e contratos citados na edição respondem anonimamente. Corpos e capturas ficam fora do repositório.
- J. Agendas (última chave). Aceite: os disparos do worker até estabilizar; `list` confirmada, reconciliação com
  `details`, `inFlight` e `blocked` vazios; série `covered` ou janela de um dia aprovada; `already_fired` só
  aceito com o job correspondente conferido.

## 6. Reversão e retomada

Pausa: transporte fechado; delegação de aquisição e delegação de evento revogadas (o consumidor fica
registrado: desabilitá-lo é definitivo e impediria recriar `rg01-monitor`); agendas revogadas; jobs `queued`
cancelados. Uma requisição já iniciada termina sem conseguir confirmar; objetos alocados sem confirmação ficam
para a varredura, que depende do transporte aberto e roda na retomada. Edição: `withdraw_market_odbl_release_v1`
(rota 410). O token do ECS nunca é revogado. Retomada: atos novos `resume-<n>`. Nenhum passo apaga recibo.

## 7. Operação contínua

Uma vez por dia útil, conferir: jobs falhos e quarentenas do dia; bloqueios das agendas (`series_budget`,
`missing_communiques`, `series_disagreement`, `communique_unavailable`, `grantor_inactive`, `detail_failures`);
outbox do monitor e incidente do RG-01 (revisão do fundador no prazo do incidente). Responsável: o programa de
mercado (Claude), que reporta ao fundador. O calendário de 2027 (Comunicado nº 45.452, já publicado) precisa ser
gravado antes da primeira reunião de 2027, com autorização própria.

## 8. Registros

Migração do calendário com inventário, catálogos e journals; manifesto; ledgers e handoff com os comandos e
hashes de cada ato; emenda do `M2-PLANO.md`. Nenhuma captura de terceiro, corpo de comunicado ou série vai ao
repositório público, só hashes.
