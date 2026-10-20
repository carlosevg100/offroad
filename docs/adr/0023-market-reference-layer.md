# ADR 0023: camada de referência de mercado, licenciada por fonte e lida por pino

Status: accepted (quatro rodadas de revisão independente; condições remanescentes anteriores a M2 e a M7 registradas no texto e em `license-evidence.json`)
Data: 2026-10-20

## Contexto

As fichas do programa de ensaios dependem de dado externo que a companhia não fornece. O
levantamento das 38 fichas (`outputs/fichas-ensaio-2026-10/`) mostra, em ordem de uso:

1. curva de CDI projetada, datada (cerca de 17 fichas), com TLP e IPCA ao lado;
2. precedentes de emissão primária (debênture, CRA, nota comercial) por perfil: rating, emissor
   fechado ou aberto, prazo, garantia, tamanho, com contagem e data (cerca de 12);
3. dados de agência de rating (cerca de 10);
4. mercado secundário de debêntures por emissão e curva de emissor (6, quase todas na trilha de um
   par listado: A02, C03, I10, I51, I56);
5. demonstrações e documentos públicos de um par nomeado na CVM (6);
6. referências privadas de crédito bancário e recebíveis (4), sem fonte pública limpa;
7. macro do Banco Central (IPCA, Focus, PTAX) e commodities, em uso menor.

A ficha C03 (por que a companhia paga mais que o par) não pode ser concluída sem os itens 1, 4 e 5.
Hoje a plataforma não guarda nenhuma série de mercado: não há tabela, bucket, coletor nem agendador.
As chaves `market.*` do registro de dados de referência (`packages/credit-playbook/src/reference-data.ts`)
estão todas `required_missing`; o pacote de fontes da Camil traz uma aquisição pontual por caso.

O que já existe e esta decisão reaproveita; onde ela precisa estender um mecanismo, a extensão está
declarada na decisão e nunca enfraquece a invariante original:

- o modelo de direitos de fonte pública: a Offroad é a organização publicadora, a fonte é uma
  `source_version` dela com direito `public_raw_reuse` (URL https, hash do payload, `expires_at`,
  `store_until`), e a ponte para o tenant passa por licença tipada
  (`20260917025326_source_rights_and_authorized_retrieval.sql`, linhas 490 a 560;
  `20260930195919_capital_public_input_capture.sql`);
- a verificação de fechamento a cada leitura (`execution_closure_read_allowed_v1`): todo pino,
  vínculo, política e prazo é conferido de novo quando o resultado é lido;
- o registro de fontes (`packages/public-research/src/source-registry.ts`), com política de reuso
  e estado por fonte;
- os contratos de consumo: `GovernedMarketCurve` (`packages/financial-model/src/market-curves.ts`),
  `DecisionMarketReference` e `PricingObservation` (`packages/market-reference`), e as âncoras
  `reference_id` dos métodos (por exemplo `evidenceAnchor`, `methodologyVersion` e `curveVersion`
  em `packages/financial-model/src/adopted-relative-debt-cost.ts`);
- a regra do padrão institucional de modelo de crédito: curva de mercado, consenso macro,
  orientação da companhia e cenário Offroad nunca se misturam
  (`docs/build/INSTITUTIONAL_CREDIT_MODEL_STANDARD.md`, linhas 51 a 53).

## Licenças, conferidas na fonte em 20 de outubro de 2026

A evidência de cada conferência (URL, título, hash SHA-256 da página capturada e a cláusula lida) está
em `docs/build/market-reference/license-evidence.json`. Uma mudança no hash de qualquer página exige
nova conferência antes de ativar a fonte correspondente.

| Fonte | O que oferece | Condição de uso | Tratamento |
|---|---|---|---|
| CVM Dados Abertos | cadastro de companhias, DFP, ITR, FRE, IPE, ofertas públicas | ODbL 1.0 declarada por conjunto | coleta automática, com o regime ODbL do item 7 |
| Banco Central (SGS, Olinda/Focus) | CDI, Selic, IPCA, PTAX, expectativas Focus | ODbL declarada em conjuntos do portal; a página capturada da série 11 não exibiu a licença | coleta automática, com o regime ODbL do item 7; a licença de cada série é conferida no catálogo antes de ativar |
| Tesouro Transparente | taxas e preços do Tesouro Direto | ODbL declarada no conjunto de taxas dos títulos ofertados | coleta automática, com o regime ODbL do item 7 |
| ANBIMA Data | mercado secundário, emissões, índices | termos do portal atualizados em 1/7/2026: uso de programas, bancos de dados e arquivos só com autorização prévia por escrito (8.2); conteúdo público de tela pode ser reproduzido sem alteração, com crédito e com a isenção do item 9.2.1 (8.3) | sem coleta; evidência fiel por caso, com crédito e isenção, nunca promovida a observação agregável |
| ANBIMA Feed | mercado secundário estruturado, curvas (ETTJ), IDA, inflação implícita | contrato; os termos do segmento investidor vedam repassar, publicar ou derivar para terceiros sem autorização | conector desligado até contrato com entitlements registrados (item 6) |
| B3 | DI futuro, índices, preços | site para uso pessoal; market data por contrato; políticas vigentes até 31/10/2026, Política de Consumo a partir de 1/11/2026, Política Comercial válida até 31/12/2026 e nova a partir de 1/1/2027 | conector desligado até contrato com entitlements registrados (item 6) |
| Agências de rating | relatórios, metodologias | contrato; publicação pelo emissor ou envio pelo usuário não prova direito de reuso global | só no escopo do tenant que anexou o documento; nunca entra na camada global sem direito comprovado |

Com dado aberto saem: índices realizados (CDI, Selic, IPCA, PTAX), o consenso Focus, as taxas dos
títulos públicos, o cadastro e os números de qualquer companhia aberta, e os metadados de toda oferta
registrada. O spread de mercado secundário e a curva de crédito exigem contrato com a ANBIMA ou a B3.
A remuneração das emissões não está nos dados estruturados da CVM em escala (entre 5 e 23 emissões por
ano até 2023 no conjunto antigo; o conjunto da Resolução 160 não tem o campo): ela vem do documento
público da oferta.

O registro de fontes (`packages/public-research/src/source-registry.ts`) passa a refletir os termos
vigentes, tratando separadamente o estado operacional (`status`) e a política de reuso (`reuse`):

- `anbima_data`: `status` continua `manual_only`; `reuse` deixa de ser `public_reusable` e passa a um
  valor novo e tipado, `faithful_case_evidence`, que só admite reprodução fiel de conteúdo público de
  tela, por caso, com crédito e com a isenção do item 9.2.1, e nunca promoção a observação agregável
  nem armazenamento na camada global;
- `b3_public`: `status` continua `contract_ready`; `reuse` passa de `public_reusable` a
  `licensed_reusable_within_contract`.

Cada entrada passa a citar o id da captura em `license-evidence.json`. Antes de ativar a B3, um teste
seleciona a política aplicável em cada lado das mudanças de vigência de 1/11/2026 e 1/1/2027.

## Decisão

1. **Publicadora única, ponte tipada para o tenant.** Todo dado de mercado é adquirido pela
   organização Offroad (`organization_type = 'offroad'`), que ainda não existe em produção e é criada
   como infraestrutura, sem membros de tenant. O tenant nunca recebe acesso ao recurso privado da
   publicadora. O consumo atravessa por uma **referência de mercado tipada** gravada no snapshot e no
   manifesto da execução, com: organização publicadora, identidade lógica e versão normalizada do
   objeto, aquisição bruta, direito vigente, recibo de entrega ao tenant, e o fechamento das
   dependências (aquisições e versões de que o objeto deriva). A verificação de fechamento ganha um
   ramo próprio para essa referência: confere ao mesmo tempo o acesso do leitor ao trabalho do tenant
   e a licença da publicadora (vigência, revogação, `store_until`) no momento de cada leitura, inclusive
   quando a licença vence ou é revogada entre a execução e a leitura. O mecanismo segue o desenho já
   adotado em `capital_public_delivery_licenses` (organização licenciadora distinta da consumidora,
   pinos de entrega e de dependência), sem reaproveitar suas tabelas de payload de pesquisa.

2. **Bytes da publicadora em recibos próprios.** As versões de fonte de tenant (`source_versions`)
   estão presas ao upload de documentos (recurso de origem, vínculos, gatilho de projeção e bucket
   `opportunity-documents`). Em vez de alargar essa restrição, as aquisições de mercado são recibos
   imutáveis próprios da publicadora (`private.market_acquisitions`), com as mesmas invariantes: URL
   e URL final em https, hash SHA-256, tamanho, tipo, caminho exato no bucket privado
   `market-reference`, nenhuma alteração ou exclusão do recibo, RLS forçada e nenhum privilégio para
   os papéis da API. `source_versions` e sua restrição de bucket ficam intactas. As políticas de
   Storage do novo bucket, a verificação física, o download autorizado e o expurgo chegam com o job
   de aquisição; até lá o bucket não tem política para os papéis comuns, e só a administração do
   Storage e o `service_role` o alcançam, como em qualquer bucket privado.
   (Emenda de 20/10/2026, na implementação da fundação.)

3. **Autoridade de plataforma nova e estreita.** Hoje todo job depende de autoridade humana sobre um
   recurso de tenant; a conta do worker não pertence a organização nenhuma. A aquisição de mercado
   ganha: um principal de plataforma registrado (não uma pessoa), uma delegação revogável dele para o
   tipo de job `market_acquisition`, atribuição auditável de `created_by`, e capacidades restritas
   por fonte e operação (buscar nos domínios da fonte, enviar bytes ao bucket da publicadora,
   confirmar a aquisição). O ciclo do job cobre enfileiramento pelo agendador, reivindicação,
   renovação, cancelamento, invalidação e outbox. Testes negativos obrigatórios: capacidade de tenant
   não publica mercado; capacidade de mercado não lê nem escreve dado de tenant; aquisição fora dos
   domínios da fonte é recusada; redirecionamento é revalidado contra a lista e destinos internos ou
   privados são bloqueados.

4. **Identidade em camadas e linha do tempo da informação.** Separam-se:
   - **identidade lógica** do objeto (fonte, série ou instrumento, e para cada família a granularidade
     econômica: no Focus, indicador, horizonte, estatística e base de cálculo; numa emissão, o
     identificador estável da oferta na fonte (na CVM, número do processo ou do requerimento e número
     do registro), mais série e tranche, e os códigos de negociação (ISIN, código no registro) quando
     existirem, com a correspondência entre identificadores de fontes diferentes revisada e versionada;
     duas emissões do mesmo emissor com a mesma numeração de série nunca colidem);
   - **aquisição bruta** (bytes, URL final, momento, hash);
   - **revisão da fonte** (a fonte republicou o mesmo período);
   - **versão normalizada** (aquisição, versão do parser, metodologia e parâmetros, dependências).
   O pino de consumo identifica a versão normalizada inteira. Cada observação registra três datas: o
   período econômico, a disponibilidade pública na fonte e a aquisição pela Offroad; uma execução
   com data-base D só pode ler o que estava disponível até D, o que impede uso retrospectivo de
   informação que ainda não existia.

5. **Normalização não é metodologia.** O parser só lê e valida o arquivo (esquema, unidades, datas,
   escala). Toda inferência financeira mora no `packages/financial-core`, versionada, testada e com
   aprovação metodológica, e é publicada como objeto derivado com rótulo próprio. Três categorias
   nunca se misturam e têm tipos distintos:
   - **consenso observado**: o Focus como publicado (fim de período, mediana, por data de pesquisa);
   - **cenário derivado de consenso**: um caminho de CDI construído a partir do Focus, com a
     conversão Selic para CDI, a trajetória entre pontos e as convenções declaradas;
   - **curva implícita de mercado**: a estrutura a termo extraída de títulos do Tesouro por
     bootstrap dos fluxos, com convenção de dias, alinhamento nominal e real e interpolação
     declarados. Ela é uma curva soberana e nunca é apresentada como curva de CDI.
   O método que usa um caminho de juros adota um desses objetos pelo nome e pela categoria; o padrão
   institucional (`INSTITUTIONAL_CREDIT_MODEL_STANDARD.md`, linhas 51 a 53) continua valendo.

6. **Direitos por licença, não por rótulo de classe.** Licença aberta e licença contratual são
   regimes distintos. A declaração `public_raw_reuse` vale só para fontes abertas. Fontes contratadas
   ganham **entitlements** registrados por produto, público, operação (ler, processar, derivar,
   exportar, exibir) e saída, com a versão e a vigência do contrato e das políticas do fornecedor;
   um entitlement restringe uma autorização existente e nunca a concede. Dado adquirido de fora não é
   classe `public` por definição: a classe de cada fonte é atribuída na sua revisão de risco
   (VEND-06), e a retenção segue a licença (DATA-07).

7. **Regime ODbL documentado por conjunto.** A ODbL alcança a base derivada redistribuída e também o
   uso público de obra produzida a partir de base derivada (cláusulas 4.4 e 4.6). Por isso, para
   cada conjunto e cada transformação, o registro documenta: o que é base original, base derivada,
   base coletiva e obra produzida; a nota de atribuição preservada em todo objeto e em todo resultado
   que o usa; e a forma de oferecer, quando exigível, a base derivada ou o método de transformação.
   Bases abertas, bases contratadas e dados privados de tenant ficam separados estruturalmente, para
   que nenhuma obrigação de uma alcance a outra; isso não abre dado de tenant nem código.

8. **Retenção com expurgo físico e prova.** Cada classe de conteúdo (bruto, normalizado, quarentena,
   temporário, derivado sujeito à licença) tem prazo pela licença. O expurgo segue os princípios já
   adotados na retenção de payload público (`20260930220853_capital_public_payload_retention.sql`):
   admissão condicionada à saúde do expurgo, margem antes do vencimento, recibo físico de exclusão.
   Conteúdo apagável fica separado de recibos históricos imutáveis (hash, momento, licença, evento).
   Aprovação, supersessão, quarentena, revogação e descarte são eventos auditáveis; a versão nunca é
   alterada para marcar estado. O esquema `market` tem RLS forçada, grants mínimos e chaves
   estrangeiras compostas.

9. **Operação por fonte, com frescor e abstenção.** Cada fonte declara, versionados: calendário de
   dias úteis (feriados nacionais e de mercado), fuso `America/Sao_Paulo`, horário esperado de
   publicação, latência tolerada, prazo máximo de uso de cada objeto e a regra de abstenção. Passado
   o prazo de uso, o objeto deixa de ser servido como vigente e o método recebe a lacuna nomeada, em
   vez de dado velho em silêncio. Qualidade, frescor e direito de uso são três estados separados. O
   executor da aquisição é idempotente por janela, controla concorrência, tenta de novo com espera
   crescente, recupera períodos perdidos, faz backfill sob comando, respeita tempo limite e volume
   máximo, e tem testes de contrato com a fonte. Monitoramento cobre atraso, falha, mudança de
   formato, quarentena e vencimento de licença.

10. **Consumo por resolvedor tipado, ancorado na adoção.** Hoje a adoção só referencia observação da
    mesma organização (chave estrangeira composta em
    `20260917160856_contextual_adoptions_and_assumptions.sql`) e a proposta de hipótese só tem
    `referenceObservationId`. A decisão é: quando o objeto de mercado é proposto a um tenant, grava-se
    na organização do tenant um **recibo de entrega** (`market_deliveries`, com `organization_id`,
    chave composta e RLS do tenant) que fixa a versão normalizada, o hash, o direito vigente e as
    dependências. A adoção canônica ganha uma referência opcional e tipada a esse recibo, da mesma
    organização, preservando a chave composta e a autoridade única de adoção; o valor adotado tem de
    ser igual ao do objeto fixado no recibo. O snapshot da execução carrega o id do recibo, e o
    fechamento resolve recibo, versão da publicadora e direito. Testes obrigatórios: troca do pino
    entre proposta, adoção e execução é recusada; valor adotado diferente do objeto é recusado;
    revogação ou vencimento entre proposta e adoção, e entre adoção e execução, bloqueia a etapa
    seguinte e a leitura.

    **Adoção e expurgo.** A adoção e o snapshot canônico são imutáveis e guardam o valor adotado, e um
    resultado guarda números derivados dele. Por isso a retenção histórica do valor adotado é um
    direito explícito de cada fonte (`retainAdoptedValues` no regime de licença aberta e em cada
    entitlement contratual). A regra é:
    - fonte cujo direito permite reter o valor adotado e seus derivados no histórico do tenant: a
      adoção grava o valor, e o expurgo da camada global apaga só o conteúdo da publicadora (bytes,
      normalizado, quarentena), preservando o recibo de entrega com a identidade verificável (versão,
      hash, direito) do que foi adotado;
    - fonte cujo direito não permite essa retenção: a adoção do valor é recusada e o método recebe a
      lacuna nomeada (por exemplo "esta referência exige licença que permita guardar o número
      adotado"). Nenhuma cópia numérica dela chega ao tenant.
    As fontes abertas do M2 ao M5 são conferidas nesse ponto antes de ativar. Testes obrigatórios: o
    expurgo de uma fonte com retenção permitida remove o conteúdo da publicadora e deixa recibo e
    adoção íntegros; a tentativa de adotar valor de fonte sem retenção é recusada; uma varredura
    confirma que nenhuma tabela do tenant guarda valor de fonte sem retenção.

    Além disso: As âncoras `reference_id` dos métodos são texto dentro de uma
    contribuição adotada e não se resolvem sozinhas; `evidenceAnchor`, `methodologyVersion` e
    `curveVersion` têm papéis distintos, e `curveVersion = not_applicable` continua obrigatório quando
    a comparação é entre spreads cotados no mesmo indexador. O fluxo é: objeto de mercado, proposta de
    premissa com a referência tipada, adoção confirmada pela pessoa, snapshot da execução com a
    referência, fechamento verificado a cada leitura. O resolvedor mora no carregador autorizado e
    recusa referência inexistente, adulterada, vencida, sem direito ou de tipo errado. Os adaptadores
    para `GovernedMarketCurve` e `DecisionMarketReference` declaram unidades, convenções, versão
    metodológica, validade, instrumento, moeda, indexador e estado de direitos; nenhum dos dois concede
    acesso por si.

11. **Direitos do documento separados da licença do conjunto.** A ODbL cobre a base, não
    automaticamente cada conteúdo individual (cláusulas 2.3 e 2.4). Para cada classe de documento
    público usada (por exemplo escritura, anúncio de encerramento, demonstração financeira), a revisão
    de risco registra separadamente: a licença do conjunto que o indexa, os direitos sobre o documento
    e as operações permitidas sobre os fatos extraídos. Sem cobertura comprovada para uma classe, a
    camada global não armazena, não reproduz e não deriva a partir dela; o documento só entra no
    escopo do tenant que o anexou, como hoje.

12. **Companhias abertas e precedentes com semântica preservada.** Entidades públicas usam o modelo
    já previsto (`public.entities` com `organization_id` nulo, prova do registro e identificadores
    revisados) e nunca incorporam conteúdo de dossiê. O mapeamento contábil de DFP e ITR é versionado
    por campo e distingue consolidado e individual, moeda e escala, exercício, trimestre e acumulado, e
    reapresentação. Um precedente separa termos indicativos, finais, cancelados e encerrados, e
    preserva indexador, remuneração, amortização e custos conhecidos; registro de oferta e documento
    não provam colocação. Faixas por perfil só são publicadas depois de normalização, regra de
    comparabilidade e regra de abstenção determinísticas; amostragem de qualidade complementa e não
    substitui essas validações.

13. **Superfície governada.** Toda RPC e todo consumidor novos entram no manifesto de consumidores
    (`docs/build/arcabouco/framework-consumer-surface.json`) e no catálogo, como exige a etapa 23.

## Faseamento

Cada fase é uma PR (ou poucas), com migração, testes positivos e negativos, revisão independente e
prova em staging e produção.

- **M1a Contratos, direitos e fechamento.** Organização publicadora; principal de plataforma e
  delegação; regime de licença aberta e de entitlements; referência de mercado tipada; ramo do
  fechamento; resolvedor tipado; registro de fontes corrigido. Sem coleta.
- **M1b Aquisição e retenção.** Bucket `market-reference` com recibos de aquisição próprios
  (decisão 2); esquema `market` (identidade lógica, aquisições, revisões, versões normalizadas,
  observações com as três datas, eventos, quarentena); job `market_acquisition` com capacidades e
  testes negativos; expurgo com recibo; calendário e frescor; `pg_cron` instalado sem tarefas.
- **M2 Primeiro consumo completo.** Gate de entrada: licença de cada série do Banco Central conferida
  no catálogo e registrada em `license-evidence.json`. Uma série do Banco Central (CDI realizado) do agendamento até a
  leitura do resultado: aquisição, versão, proposta de premissa, adoção, execução, revogação e
  expurgo, com a referência conferida a cada leitura. Depois Selic, IPCA, PTAX e o Focus observado.
- **M3 Cenários e curva soberana.** Caminho de CDI derivado do Focus e curva soberana implícita do
  Tesouro, ambos no `financial-core` com metodologia aprovada, cada um com o seu rótulo.
- **M4 Companhias abertas.** Depois da revisão de direitos das classes de documento usadas (item 11).
  Identidade pública pelo cadastro da CVM e um recorte contábil pequeno
  (os indicadores da lente de comitê da C03) com perímetro e período comprovados; depois FRE e IPE.
- **M5 Precedentes.** Depois da revisão de direitos das classes de documento usadas (item 11) e com a
  identidade estável da oferta (item 4). Ofertas da CVM com remuneração do documento público, status e normalização;
  faixas por perfil só depois das regras de comparabilidade e abstenção.
- **M6 Consumidores.** Propositores das fichas lendo por referência tipada (C02, C04, C32 e a lente e
  o par da C03), com a decomposição de mercado da C03 como lacuna nomeada enquanto não houver licença.
- **M7 Licenciados.** Conectores ANBIMA Feed e B3, só com contrato e entitlements implementados; a
  decisão comercial não substitui os gates técnicos.

## Consequências

- O produto passa a responder com número de mercado datado, com a categoria explícita (observado,
  consenso, cenário, curva implícita) e a fonte citada, e a dizer quando o número exige uma licença
  que a Offroad ainda não tem, em vez de inventar.
- O mercado secundário de debêntures e a curva de crédito, centrais para a C03 e para a trilha de
  investidor, dependem de contrato. Essa decisão é comercial e é do fundador.
- A plataforma ganha seu primeiro agendador, seu primeiro principal de plataforma e seu primeiro job
  de plataforma, sob capacidades, auditoria e verificação de esquema.
- A atribuição exigida pela ODbL aparece em cada objeto e em cada resultado que o usa.

## Decisão do fundador necessária

Contratar ou não a ANBIMA Feed e, se aplicável, market data da B3, com escopo de uso dentro do
produto. É decisão comercial. Sem ela, M7 não começa e a C03 fica com a decomposição de mercado como
lacuna nomeada. O desenho técnico desta ADR não depende de ato do fundador.
