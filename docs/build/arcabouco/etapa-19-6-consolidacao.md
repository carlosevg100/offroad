# Etapa 19, incremento 6: consolidação e limpeza

Uma PR (`feat/19-6-consolidation`) sobre `main` `b6a9b231`, que já tem o incremento 3 (leitor autorizado e `renderArtifactRevision`, PR #817) e o incremento 4, parte A (produtores no comando comum, PR #816). Sem migração, sem banco, sem robô novo. Quatro frentes: as regras de evidência passam a ter uma definição só e o pacote órfão sai; toda conta financeira de `case-materials` passa a vir de núcleos Decimal de `financial-core`, com os materiais publicados idênticos byte a byte; testes econômicos de renderização comparam os números de uma mesma revisão em todos os formatos; e os bytes guardados da prévia passam a ser lidos no endereço da concessão de upload, com recusa tipada quando o objeto sumiu ou mudou.

## 1. Regras de evidência e retirada de `evidence-compiler`

**Onde `case-materials` dependia da semântica do pacote.** O pacote tinha duas regras (afirmação material sem suporte; julgamento material sem aprovação), a cobertura das afirmações materiais e uma asserção de identidade econômica entre as duas línguas, com zero importadores. `case-materials` nunca o importou, mas repetia a primeira regra dentro de `truth.ts` (a verdade dos materiais marcava como sem suporte a linha material sem ids de suporte) e já passava o brief por `auditBrief`, que usa as duas regras de `case-understanding/src/audit.ts`. O julgamento material dos blocos compilados nunca dependeu da regra booleana do pacote: ele é barrado pela conduta (LC-01, aprovação presa ao fingerprint exato, mais estrita), e a identidade econômica bilíngue é a regra LC-07 da conduta.

**O que mudou.**

- `packages/case-understanding/src/audit.ts` exporta `materialClaimWithoutSupport` e `materialJudgmentWithoutApproval` e as usa no próprio `auditClaims`, nas mesmas posições e com os mesmos códigos (`material_claim_without_support`, `material_judgment_without_approval`). Comportamento idêntico: os 120 testes que o pacote já tinha seguem verdes, e com os três novos são 123.
- `packages/case-materials/src/truth.ts` chama `materialClaimWithoutSupport` no lugar da cópia.
- Testes migrados: `case-understanding/src/evidence-gates.test.ts` (as duas regras, os códigos e a cobertura 0 e 1 que o pacote testava, e a aprovação desligável que os registros de afirmação usam) e `case-materials/src/evidence-gates.test.ts` (o brief com afirmação sem suporte e com julgamento sem aprovação é recusado com o código da auditoria e compila depois da aprovação; o bloco compilado sem suporte é barrado na verdade dos materiais; as mesmas cifras em outra ordem passam e uma cifra diferente é bloqueada por LC-07, que era a identidade econômica do pacote).
- `packages/evidence-compiler` saiu, com o workspace e a entrada do lockfile. O `pnpm install` mudou só entradas de workspace: sai o importador do pacote, entram o vínculo de `case-materials` com `financial-core` e o de desenvolvimento com `testing-fixtures`. Nenhuma versão externa mudou.
- Inventário: a entrada saiu de `repository_items` e entrou em `retired_repository_items` de `docs/build/arcabouco-stage0/object-decisions.json`, no formato da retirada da etapa 10 (tipo, caminho, decisão, etapa, motivo, dono); a referência do pacote a `@offroad/domain-contracts` saiu da lista de consumidores (25); `OBJECT-MAP.md` registra a retirada. `python3 scripts/ci/check-stage0-inventory.py --catalogue docs/build/arcabouco-stage0/catalogue-production.json --environment production` volta sem erros (2640 objetos).
- `packages/credit-playbook/src/method-runtime-manifest.generated.ts` foi regenerado pelo gerador (`manifest:generate`), porque o compilador fixa o lockfile e o fechamento dos executores de capital inclui `financial-core`. R01 publicado não muda: `manifestHash` segue `17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090`, e os 496 testes de `credit-playbook`, com a reconstrução dos executores publicados, seguem verdes.

## 2. Aritmética financeira determinística

**Novo** `packages/financial-core/src/material-arithmetic.ts` (`materialArithmeticVersion` `2026.09.26-v1`), exportado do índice, com `material-arithmetic.test.ts`. Mesmo contrato dos núcleos de recebíveis: Decimal com precisão 40 e arredondamento meio para cima, resultado em texto decimal de precisão cheia, rastro com fórmula e operandos, e recusa de valor que não é número decimal finito (nunca lido como zero). As quatro contas entram no registro de cálculos (`material.new_instrument_amount`, `material.customer_concentration`, `material.ebitda_adjustments`, `material.schedule_tie_out`); as conversões de apresentação não entram, porque nenhum método se prende a elas.

| Antes em `case-materials` | Núcleo | Natureza |
|---|---|---|
| `desk-sections.ts:45` fonte do novo instrumento = saldo com covenant + dinheiro novo | `calculateNewInstrumentAmount` | soma |
| `diligence.ts:64` cinco maiores clientes; `:65` maior participação por `Number()` | `calculateCustomerConcentration` (soma na ordem declarada, maior por comparação exata, ordenação estável) | soma e seleção |
| `diligence.ts:103` ajustes do EBITDA | `calculateEbitdaAdjustments` | diferença |
| `diligence.ts:114-115` mapa de dívida contra balanço dentro de 2% | `testScheduleTieOut` (tolerância passada pela pergunta) | razão e tolerância |
| `financial-model.ts:98` razões com `Number(value).toFixed(2)` | `presentationFigure` (meio para cima no valor decimal) | conversão de precisão |
| `financial-model.ts:123` ponto do gráfico com `Number()` | `presentationNumber` | conversão para número binário |
| `institutional.ts:88-89` alternativa em milhões com `Number()/1e6` | `presentationFigure` escala milhões | conversão de unidade |
| `institutional.ts:132` faixa de preço com `bps / 100` | `presentationFigure` pontos-base como percentual | conversão de unidade |
| formatadores de `desk-sections.ts`, `institutional.ts`, `diligence.ts` e `compile.ts` (percentual, milhões, arredondamento, `Number()` e `toNumber()`) | `presentationFigure` e `presentationNumber` | conversões |

As linhas 88-89 e 132 de `institutional.ts` e os formatadores não estavam no levantamento do plano; entraram porque também eram conversões em ponto flutuante de números financeiros. O único passo em número binário que resta é a entrega do decimal exato a `Intl.NumberFormat` e ao ponto do gráfico nativo, e ele passa por `presentationNumber`, que lê o decimal como `Number` lê texto decimal.

**Fica como está, por não ser conta financeira:** contagens e índices (`answers.length - open` do Q&A, numeração de linhas, `Condição N`, `LC-01` a `LC-13`), a comparação de igualdade de `isStale` (não produz número), a normalização de texto do covenant em `desk-sections.ts` (`covenantTurns` imprime o limite exato sem conta) e a impressão por `Intl`, que continua em `case-materials` e só recebe número dos núcleos.

**Prova de paridade.** `packages/case-materials/src/material-parity.test.ts` fixa o sha256 de `JSON.stringify(material, null, 1)` de cada material (22 pinos), no molde de `pool-kernel-parity.test.ts`. O caso sintético Aurora (`packages/testing-fixtures/src/credit-materials-case.ts`, rotulado sintético, com os dados que os testes de `case-materials`, `case-render` e `case-export` já usavam, ampliados para alcançar cada conta) é compilado pelas mesmas funções que o motor do caso chama, em três variantes do mapa de dívida (balanço acima do mapa, dentro de 2%, mapa acima do balanço). Os pinos foram capturados das fontes anteriores aos núcleos e o código novo os reproduz todos: nenhum byte publicado mudou. `caseMaterialsVersion` (`2026.09.09-v4`) e `financialCoreVersion` (`2026.09.20-v24`) não mudaram, porque nenhum cálculo existente mudou de resultado.

**Diferenças deliberadas, fora de toda fixture e de produção:**

- Razão exatamente num empate decimal que o ponto flutuante guarda abaixo (1,005 e 2,675) passa a arredondar para cima (1,01 e 2,68), como o valor decimal manda; `Number("1.005").toFixed(2)` imprimia 1,00. Empates que o binário representa exatamente (3,125) não mudam. Testado em `financial-core` e em `case-materials/src/kernel-arithmetic.test.ts`.
- Valor não numérico num ponto de gráfico ou numa razão é recusado, em vez de virar `NaN` no arquivo ou zero; em `compile.ts`, um texto que não é número é impresso como veio, em vez de `R$ 0` para texto vazio.
- Participações de clientes inválidas além das cinco primeiras eram ordenadas de forma indefinida; agora são recusadas, como as cinco primeiras já eram.

## 3. Testes econômicos de renderização

**Novo** `apps/web/src/lib/artifacts/economic-rendering.test.ts` com `economic-readout.test-support.ts`. Cada revisão é renderizada por `renderArtifactRevision` em docx, pdf e pptx (e no xlsx reproduzido, para resultados) e pelo renderizador HTML registrado que a rota de materiais usa. Os números voltam de cada arquivo: parágrafos do docx, slides e caches dos gráficos nativos do pptx, camada de texto do pdf (fluxos descomprimidos e decodificados pelo mapa ToUnicode quando a fonte Unicode é embutida), texto visível do HTML e células do xlsx. A comparação vale nos dois sentidos: cada número da revisão aparece em cada arquivo tantas vezes quanto a revisão o afirma, e nenhum valor em reais, percentual ou múltiplo que um arquivo imprime deixa de ser número da revisão.

- **Tipos de material** (memorando, term sheet, Q&A, teaser, perfil, pacote, as duas entradas de modelo financeiro e o índice da sala), nas duas línguas, em docx, pdf, pptx e HTML; os gráficos nativos do pptx trazem exatamente os pontos da revisão.
- **Números dos núcleos, por valor, em todos os formatos:** a fonte de R$ 42.300.000 (`calculateNewInstrumentAmount`), 62,7% dos cinco maiores (`calculateCustomerConcentration`), R$ 6,8M fora do mapa (`testScheduleTieOut`), a alternativa de R$ 71M e a faixa CDI + 3,70% a 5,20% (conversões); as razões arredondadas pelo núcleo (2,63; 1,01; 2,68; 3,13; -0,13; 0,99) e os pontos dos gráficos iguais a `presentationNumber` do valor exato.
- **Resultado financeiro aprovado** (o artefato real committed em `supabase/tests/support/institutional_setup_fixture.sql`): a aba do cenário aprovado do xlsx traz cada valor exato; docx, pdf e pptx imprimem o mesmo valor, lido de volta como decimal igual ao da célula; as razões saem arredondadas pelo núcleo; os gráficos trazem os valores exatos; nas duas línguas.
- **Resultado da execução** (incremento 4 está em `main`): o único formato dele é a própria revisão em blocos (manifesto `json`, sem arquivo). Lida pelo leitor autorizado, cada bloco de número tem o valor igual à afirmação e ao valor do pacote committed no caminho que o bloco registra, em texto decimal, sem conversão; as razões também. Arquivo do resultado da execução só existe com a exportação da etapa 21.
- **Controle negativo:** uma cifra alterada é lida como ausente e a nova aparece, então a comparação não é vazia.

Os serializadores já tinham convergido no incremento 3: o registro `apps/web/src/lib/artifacts/artifact-renderers.ts` é o único código de produto da web e do robô que chama os escritores de docx, pdf, pptx e HTML dos materiais (conferido nesta PR), e os testes acima passam por ele.

## 4. Caminho do objeto pela concessão

Bytes guardados existem só na prévia de integração. A concessão de upload (`private.capital_project_material_upload_grants`, fechada a clientes) é escrita pelo comando do robô com o endereço `<organização>/<trabalho>/materials/<sha256>.<formato>` no bucket `case-artifacts`, e o núcleo do incremento 4 só aceita `bytes.storage` para o caminho, sha256, tamanho e formato de uma concessão gravada do mesmo trabalho. O leitor (`apps/web/src/lib/artifacts/authorized-artifact-reader.ts`) ganhou:

- `uploadGrantObjectPath`, o endereço que o comando de concessão escreve;
- `storedRevisionObject`, o objeto guardado que o manifesto de uma revisão nomeia, para o trabalho dela;
- `readGovernedObject`, que só lê o endereço da concessão (bucket, formato e sha256 válidos e caminho igual ao endereço derivado; qualquer outro endereço não é baixado), confere a existência do objeto, depois o tamanho e depois o sha256 do manifesto, e devolve recusa tipada: `artifact_object_missing` (nada no endereço, ou objeto que a pessoa não lê, o que o Storage não distingue), `artifact_bytes_mismatch` (outro tamanho ou outro hash) ou `artifact_object_unavailable` (falha do Storage).

A rota da prévia usa essa leitura para a revisão com bytes guardados e para o recibo legado. Objeto ausente ou movido responde 409 com o texto novo do catálogo (`ArtifactDownload.preview.storageMissing`, em `pt-BR` e `en-US`), bytes diferentes respondem 409 com o texto que já existia, e só a falha do Storage continua 502. Antes, qualquer resposta do Storage virava 502. O teste de que rota antiga e nova decidem igual registra essa diferença como deliberada.

**Por que não houve migração.** O endereço da concessão é função determinística de organização, trabalho, hash e formato (`object_path` é único), a rotação de 1B não atualiza concessões nem manifestos, e a política de leitura do Storage só entrega um caminho `materials/` a quem tem concessão gravada com exatamente aquele caminho (`can_read_completed_capital_project_material`). Ler o próprio registro da concessão daria o mesmo caminho e exigiria uma leitura nova por migração; não foi preciso.

**Provas.** `authorized-artifact-reader.test.ts`: o endereço derivado, a leitura com tamanho e hash certos, o objeto rotacionado para `revocable-<uuid>` (ausente, sem procurar em outro lugar), o manifesto que nomeia o caminho rotacionado (não baixado), as três formas de "não encontrado" do Storage, outro tamanho, outro hash com o mesmo tamanho, falha do Storage e endereços que o comando nunca escreve. `preview/material/route.test.ts`: a revisão guardada servida com o hash conferido, o objeto rotacionado e o ausente com 409 e o texto novo, o caminho rotacionado no manifesto sem download, o tamanho diferente com 409, o recibo legado com objeto movido e a falha do Storage com 502.

## Limites e perguntas abertas

1. **A pergunta 10 do Q&A nunca responde.** Em `diligence.ts`, a busca do EBITDA reportado escapa o ponto duas vezes na expressão regular, então exige uma barra invertida no caminho do fato e nunca encontra o EBITDA reportado: a pergunta sobre itens não recorrentes fica sempre em aberto. O núcleo dos ajustes já está ligado e testado, mas corrigir a expressão muda o Q&A publicado de todo caso com EBITDA ajustado, o que este incremento não pode fazer. Proposta: corrigir numa PR própria, com `caseMaterialsVersion` novo e pino novo.
2. `packages/credit-analysis/src/verdict.ts` tem a mesma conversão de pontos-base em ponto flutuante na frase do veredito; fica fora deste incremento, que é de `case-materials`.
3. Os rastros dos núcleos não entram nos materiais: gravá-los mudaria os bytes publicados e pede versão nova do contrato do material.
4. O leitor não lê o registro da concessão, fechado a clientes; se uma rotação futura passar a atualizar concessões, o leitor precisará de uma leitura da concessão por revisão, com migração.
5. O resultado da execução não tem arquivo; o teste econômico cobre os blocos, e os arquivos entram quando a etapa 21 exportar.
6. O manifesto de métodos gerado muda sempre que o lockfile ou `financial-core` mudam; a PR que for mesclada depois de outra que também o regenere precisa rodar `manifest:generate` de novo.

## Incremento 6B: as duas correções que a consolidação encontrou

Uma PR (`fix/19-6b-materials-fixes`) sobre `main` `a795f3b8`, que já tem o incremento 6 (PR #821). Sem migração, sem banco. Resolve as perguntas abertas 1 e 2 acima.

### 1. A pergunta 10 do Q&A responde a partir do caso

**Causa.** A pergunta sobre itens não recorrentes do EBITDA achava o EBITDA ajustado mais recente e montava a busca do reportado com `new RegExp(...)` sobre o caminho do fato, trocando cada ponto por `"\\\\."`. Esse texto de substituição são duas barras invertidas e um ponto, então a expressão pedia uma barra invertida literal antes de cada ponto: nenhum caminho de fato tem barra invertida, o EBITDA reportado nunca era encontrado e a pergunta ficava em aberto em todo caso, mesmo com os dois números na sala.

**Correção.** `packages/case-materials/src/diligence.ts` ganha `at(facts, path)`, que compara o caminho como texto (não há padrão a escapar) e, como `find`, fica com o período mais recente. A pergunta lê o EBITDA ajustado mais recente e o EBITDA reportado do mesmo exercício, no caminho exato, e responde pelo núcleo `calculateEbitdaAdjustments`:

- com os dois números: "EBITDA ajustado de R$ 17,4M contra reportado de R$ 16,8M: R$ 0,6M de ajustes, a detalhar item a item." (a magnitude vem do núcleo; os dois números mostram a direção, inclusive quando o ajuste reduz o EBITDA);
- com o ajustado igual ao reportado: "EBITDA ajustado igual ao reportado, de R$ 16,8M: a companhia não declara ajustes." (a frase anterior pediria o detalhe de R$ 0,0M de ajustes);
- sem o par (sem ajustado, sem reportado, reportado só de outro exercício) ou com um valor que não é número decimal finito (o núcleo recusa): a pergunta fica em aberto, "Em aberto: pedido à companhia.", sem suporte e fora das afirmações materiais. Nenhuma resposta é inventada.

**Versão e pinos.** `caseMaterialsVersion` passa de `2026.09.09-v4` para `2026.09.26-v5`. Dos 22 pinos de `material-parity.test.ts` (sha256 de `JSON.stringify(material, null, 1)`), mudaram exatamente os três do Q&A:

| Pino | 2026.09.09-v4 | 2026.09.26-v5 |
|---|---|---|
| `balanceAboveSchedule:diligence_qa` | `a3a83e9589a9a5484540c73db231bef5f8a0d7c2481f1acb09822145afbe5c11` | `9608983bf564eb5ca0539ae4d68353aa41002dd72d0a25833c49c78ec83e31bb` |
| `withinTolerance:diligence_qa` | `1d65d42e5b9361b9d15e6bb63400ecca3df3a54cf6a0a19afa4d6976cf60c09c` | `f8f18aa4a3bca2df5abb0b0e36e4de6bed0b9f890b7e02d82b0909bd51ce4ef6` |
| `scheduleAboveBalance:diligence_qa` | `9df3538b0e37a93aabbe73788cb3fd5ca07008f1a7e9911b5c985b6613cd3901` | `6675488487521990c83bf214dc020e65811f7d97a2e417dce6f3db8c96b5315b` |

Os outros 19 (memorando, term sheet, teaser, perfil e pacote nas três variantes, e as quatro entradas do modelo financeiro) não mudaram: o diff do teste altera só essas três linhas, e ele passa com os outros 19 valores da v4. O JSON do Q&A antes e depois, comparado nas três variantes, difere só em: a contagem de abertura (26 respondidas e 9 em aberto passam a 27 e 8), a linha da pergunta 10 (resposta nas duas línguas, `material: true`, `claimKind: "fact"` e os suportes `historical_financials.2025.adjusted_ebitda` e `historical_financials.2025.ebitda`), o EBITDA ajustado entre as dependências e a impressão da auditoria de conduta em sombra, cujos achados são os mesmos.

**Onde a versão é fixada.** `caseMaterialsVersion` existe só em `packages/case-materials/src/index.ts`; o motor do caso grava a constante em `versions.materialCompiler` dos relatórios e do manifesto do caso, e `engine.test.ts` compara com a constante. Nenhuma fixture, SQL, auditoria de renderização ou manifesto fixa o texto da versão, e `case-materials` não entra no fechamento de nenhum executor do manifesto de métodos. Revisões já gravadas não mudam; a compilação seguinte de um caso com o par de EBITDA publica o Q&A novo.

**Testes.** `diligence.test.ts`: a resposta pelo núcleo, o ajuste que reduz o EBITDA, a ausência de ajustes, o exercício mais recente contra o reportado do mesmo exercício, cinco casos em aberto (inclusive valor não numérico) com a linha "Em aberto" no material, e a regressão, que reconstrói a expressão com escape duplo, mostra que ela não casa com o caminho e exige a resposta; os quatro testes de resposta falham no código anterior. `kernel-arithmetic.test.ts`: no caso Aurora a resposta sai do núcleo e a contagem passa a 27 respondidas. `apps/web/src/lib/artifacts/economic-rendering.test.ts`: o valor dos ajustes aparece em docx, pdf, pptx e HTML nas duas línguas, e a identidade econômica do Q&A nos dois sentidos segue verde com a resposta nova.

### 2. Pontos-base do veredito pelo núcleo

**Antes.** `packages/credit-analysis/src/verdict.ts` convertia com `(bps / 100).toFixed(2)` em ponto flutuante a faixa `CDI + x% a y%` do preço da estrutura e das alternativas, a diferença do tíquete maior na ponta baixa e a economia do prazo mais curto (estas duas com a subtração também em ponto flutuante).

**Agora.** A faixa usa `presentationFigure` com a escala `basis_points_as_percent` e duas casas, o núcleo do incremento 6, e as diferenças vêm do núcleo novo `calculateSpreadDifference` de `material-arithmetic.ts`: subtração Decimal em pontos-base, rastro `material.spread_difference` (registrado em `financialCalculationRegistry`) e recusa de valor que não é número decimal finito. `materialArithmeticVersion` passa a `2026.09.26-v2` pelo núcleo novo; nenhum núcleo existente mudou de resultado, e `financialCoreVersion` segue `2026.09.20-v24`.

**Prova de paridade.** `packages/credit-analysis/src/verdict-parity.test.ts` entrou no primeiro commit da PR, antes de qualquer mudança no veredito, e fixa o sha256 de 12 vereditos: as respostas gold que a mesa lê (Camil, Fakeco, Nimbus e Rede Horizonte), sem preço, como o motor do caso chama o veredito, e com o preço de `pnpm --filter @offroad/evals desk:gold` (referência de mercado para CRA na nota interna, alternativas refeitas pela trajetória); o CCB da Fakeco, cujo tíquete maior sai com spread mais largo; o pedido simulado que o script documenta para a Camil; e o caso Aurora dos materiais, sem preço e com a referência do próprio fixture (as três variantes do mapa de dívida dão o mesmo veredito, então uma é fixada). O teste também exige que as execuções alcancem as quatro frases com pontos-base (faixa da estrutura, mesmo spread, ponta baixa mais larga, economia do prazo curto). Os 12 pinos se reproduzem depois da mudança. Em produção o motor do caso chama o veredito sem referência de preço, então nenhuma dessas frases é impressa hoje e nenhum material publicado muda. `@offroad/market-reference` e `@offroad/testing-fixtures` entram como dependências de desenvolvimento de `credit-analysis`; o lockfile muda só nessas duas entradas de workspace.

**Diferenças deliberadas, fora de toda fixture:**

- Meio ponto-base num empate que o binário guarda abaixo passa a arredondar para cima, como o valor decimal manda: 500,5 bps imprime 5,01% (antes 5,00%), uma diferença de 99,5 bps imprime 1,00 (antes 0,99) e uma de 100,5 bps imprime 1,01 (antes 1,00). A referência de mercado só cota pontos-base inteiros, e para todo inteiro de -10000 a 10000 o núcleo imprime o mesmo texto de `(bps / 100).toFixed(2)`, provado em `material-arithmetic.test.ts`.
- Spread que não é número finito é recusado com `RangeError`, em vez de imprimir `CDI + NaN%`.
- A diferença entre spreads fracionários é exata (372,3 menos 370,1 é 2,2, e não 2,1999999999999886).

Os dois primeiros casos estão em `verdict.test.ts` e falham no código anterior; o núcleo, seu rastro, as recusas e a exatidão estão em `material-arithmetic.test.ts`.

### Manifesto de métodos

Regenerado por `pnpm --filter @offroad/credit-playbook manifest:generate`: mudam os hashes de fonte de `verdict.ts`, `packages/credit-analysis/package.json`, `credit-math.ts`, `material-arithmetic.ts` e `pnpm-lock.yaml` e os hashes de proveniência dos procedimentos implementados que os fixam. R01 publicado segue com `manifestHash` `17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090`, e os 496 testes de `credit-playbook` passam.

### Limites e perguntas abertas do 6B

1. `packages/market-reference/src/index.ts` monta a frase do preço (mostrada nas telas de entrada do caso) com `Math.abs(bps) / 100` e `Number(allIn) * 100` em ponto flutuante. Para pontos-base inteiros e taxas com quatro casas o texto sai exato, mas não passa por núcleo de `financial-core`; fica para uma PR própria.
2. A auditoria de conduta em sombra do Q&A já tinha, antes desta PR, um achado LC-07 na pergunta 20 (taxa pedida contra o estoque): o texto em inglês da leitura `rate-ask-vs-stack` de `credit-analysis/src/analyze.ts` omite o múltiplo de 2,19x e usa vírgula decimal. Corrigir muda o Q&A publicado e pede versão nova de `case-materials`.
3. O Q&A imprime valores em milhões com uma casa, então ajustes de EBITDA abaixo de R$ 50 mil aparecem como "R$ 0,0M de ajustes" embora não sejam zero; é o mesmo formato de todas as respostas do Q&A.
4. `verdict.ts` ainda faz contas Decimal próprias (milhões, múltiplos, percentual do EBITDA, alavancagem após a estrutura) e ordena os anos pesados por `toNumber()` da diferença; não são ponto flutuante na conta e ficam fora deste incremento, que tratou os pontos-base.
5. O manifesto de métodos precisa ser regenerado de novo pela PR que for mesclada depois de outra que também o regenere.

## Incremento 6C: as lacunas de invariante que o 6B encontrou

Uma PR (`fix/19-6c-invariant-fixes`) sobre `main` `f132a68a`, que já tem o incremento 6B (PR #823). Sem migração, sem banco. Resolve as perguntas abertas 1 a 4 do 6B: a identidade econômica bilíngue vira teste de todo material (invariante 9), valores pequenos deixam de sair como zero, e o veredito e as frases de preço passam a fazer suas contas por núcleos de `financial-core` (invariante 4).

### 1. Identidade econômica bilíngue em todo material

**A regra como teste.** Para todo tipo de material e todo item que ele imprime (título, parágrafo, métrica, lista, par chave e valor, nota, destaque, legenda e cabeçalho de tabela e cada célula), os números lidos do texto em português são os mesmos lidos do texto em inglês, cada um lido com os separadores da própria língua: em pt-BR o ponto agrupa milhares e a vírgula marca decimais, em en-US o contrário. Um número escrito com os separadores da outra língua ("2,19x" em inglês, "90.3 dias" em português) não é lido como número, é apontado como estrangeiro. São números os valores em reais (lidos pelo valor cheio, então "R$ 17,4M", "R$ 45 mil" e "R$ 45 thousand" comparam pela economia e não pela palavra), percentuais, múltiplos, pontos-base, datas, frações ("2/3", "dois terços" e "two-thirds" são a mesma fração, como na regra LC-07 da conduta) e contagens (meses, anos, dias). Ordinais ("1º teste") são prosa. A comparação é de multiconjuntos, mais estrita que a de conjuntos.

O leitor é apoio de teste em `packages/testing-fixtures/src/bilingual-figures.ts` (exportado como `@offroad/testing-fixtures/bilingual-figures`, com `bilingual-figures.test.ts`), para servir aos três pacotes sem dependência nova de produção. A identidade roda:

- em `packages/case-materials/src/bilingual-identity.test.ts`, sobre o caso Aurora nas três variantes do mapa de dívida dos pinos de paridade: memorando, term sheet, Q&A, teaser, perfil, pacote, a entrada do modelo e as demonstrações bilíngues, item a item; as demonstrações em português e em inglês, pareadas item a item; um controle negativo (o inglês da pergunta 20 como a v5 publicou é apontado, com o 2,19x que falta e as quatro vírgulas, e uma tabela só em português é apontada no documento em inglês); e a checagem de que nenhum material imprime "R$ 0,0M" ou "R$ 0 mil";
- em `packages/credit-analysis/src/bilingual-identity.test.ts`, sobre as doze execuções dos pinos do veredito (`verdict-cases.test-support.ts`, que passou a servir também ao teste de paridade): todo achado da mesa, todo achado da trajetória e toda nota do veredito;
- em `apps/web/src/lib/artifacts/economic-rendering.test.ts`, sobre todos os tipos de um pacote, com o índice da sala.

**Texto citado do caso.** As afirmações do brief e o texto dos fatos (nome do credor, taxa pedida como a companhia escreveu, premissas das projeções) são português nos dois documentos; o teste lê esses trechos como português dos dois lados, só onde aparecem inteiros (o "9% a.a." de uma premissa não é o final de "14,9% a.a."), e lê todo o resto do texto em inglês como inglês.

**Divergências que o teste encontrou e como foram corrigidas.**

| Onde | O que o inglês fazia | Correção |
|---|---|---|
| Achados da mesa (`credit-analysis/src/analyze.ts`), no quadro de riscos do perfil, do pacote e do memorando e nas perguntas 20 e 33 do Q&A | valores, múltiplos e percentuais com vírgula decimal e "a.a."; a pergunta 20 (taxa pedida contra o estoque) omitia o 2,19x da alavancagem do estoque e terminava em "a.a.." | os formatadores recebem a língua e passam pelos núcleos (`presentationAmount`, `presentationFigure`); o inglês imprime separadores en-US e "p.a."; a pergunta 20 diz "written at the lower leverage of 2.19x"; a lista de valores divergentes usa "and" |
| Achados da trajetória (`trajectory.ts`) | valores e múltiplos com vírgula decimal | mesma correção dos formatadores |
| Veredito (`verdict.ts`), no memorando e nas condições precedentes do term sheet | valores e múltiplos com vírgula decimal; "twelve months" e "Sixty months with up to twelve of grace" por extenso; faixa de preço com "a"; sem a diferença de preço das duas alternativas | separadores en-US; "12 months" e "A 60-month tenor with up to 12 of grace"; "to" na faixa; "0.35 percentage point at the low end" e "0.40 percentage point saved by shortening" |
| Q&A (`case-materials/src/diligence.ts`) | pergunta 2 com as participações em formato português; pergunta 11 com as linhas do estoque em português ("a", "a.a.", "venc.") no inglês; perguntas 9, 24 e 36 com dias e meses em decimal inglês também no português ("90.3 dias") | cada língua monta a própria frase; dias e meses com uma casa, na vírgula ou no ponto de cada língua |
| Term sheet (`institutional.ts`) | cronograma do covenant com vírgula decimal no inglês | o cronograma é montado em cada língua |
| Todas as tabelas (histórico, fontes e usos, estrutura de capital, trajetória, covenant, riscos, choques, garantias, termos do pacote, demonstrações bilíngues) | a célula era um texto só, em português, impresso também no documento em inglês; as demonstrações bilíngues imprimiam decimais crus ("7412500.5") nas duas línguas | a célula pode carregar as duas línguas (`MaterialTableCell`), como abaixo |

**Células bilíngues.** O bloco de tabela de `MaterialBlock` passa a aceitar `rows: MaterialTableCell[][]`, em que a célula é um texto impresso como está nas duas línguas (nome, código, ano) ou `{pt, en}`. `case-materials` usa a forma bilíngue em toda célula com número ou prosa; os escritores de docx, pdf, pptx e HTML (`case-export`, `case-render`) imprimem a célula da língua do documento, e o esquema dos materiais guardados da web (`apps/web/src/lib/deal-state/materials.ts`) aceita as duas formas. Materiais já gravados continuam com células só em texto e renderizam como antes. As demonstrações bilíngues mantêm todos os dígitos exatos, agora com os separadores de cada língua. O índice da sala continua com rótulos em português por desenho (`data-room`), sem número em formato de língua.

Na auditoria de conduta em sombra, saem os três achados LC-07 que o inglês causava: a condição do veredito no memorando (que continua bloqueado por outros achados), a pergunta 20 no Q&A (de bloqueado para revisão) e a mesma condição nas condições precedentes do term sheet (de bloqueado para aprovado).

Uma correção de apoio de teste: o leitor da camada de texto do pdf em `economic-readout.test-support.ts` cortava o último byte de um fluxo comprimido que terminasse em retorno de carro, porque lia até "endstream"; agora lê o comprimento que o dicionário do fluxo declara. O term sheet em inglês passou a ter um fluxo assim.

### 2. Valores pequenos: uma regra só

**A regra**, no núcleo `presentationAmount` de `packages/financial-core/src/material-arithmetic.ts` (conversão de apresentação, com rastro `material.presentation_amount`, fora do registro de cálculos como as demais conversões), usada por todo material que imprime valor:

- **Em frase** (estilo `abbreviated`): a partir de R$ 999.500, milhões com uma casa ("R$ 17,4M" e "R$ 17.4M"); a partir de R$ 1 mil, milhares sem casas ("R$ 45 mil" e "R$ 45 thousand"); abaixo disso, o valor exato em reais ("R$ 450"). O limite de R$ 999.500 é onde os milhares arredondariam para mil milhares, então o valor passa a milhões ("R$ 1,0M") em vez de "R$ 1.000 mil".
- **Em tabela ou termo** (estilo `whole`): reais inteiros, agrupados pela língua ("R$ 42.300.000" e "R$ 42,300,000"); abaixo de R$ 1 e diferente de zero, o valor exato ("R$ 0,4").
- Arredondamento meio para cima no valor decimal; zero sai "R$ 0". Nenhum valor diferente de zero sai como zero, testado em `material-arithmetic.test.ts`.

O símbolo continua "R$" nas duas línguas, como os materiais já imprimiam em inglês. Usam a regra: as respostas do Q&A, os achados da mesa e da trajetória, o veredito, o título das alternativas do memorando (que imprimia milhões inteiros, "R$ 71M", e passa a "R$ 71,3M"), as tabelas e termos de `case-materials` e os valores do term sheet de `deal-structure` (que convertiam com `Number(value)` e agora passam pelo núcleo; valor que não é número sai como escrito, em vez de "R$ NaN"). No caso Aurora, a pergunta 10 passa de "R$ 0,6M de ajustes" a "R$ 572 mil de ajustes"; um ajuste de R$ 42 mil sairia "R$ 42 mil", e não "R$ 0,0M".

### 3. Aritmética fora do núcleo

**Veredito.** `packages/credit-analysis/src/verdict.ts` não importa mais `decimal.js`. Núcleos novos em `material-arithmetic.ts`, com rastro, testes e registro em `financialCalculationRegistry`:

| Conta no veredito | Núcleo | Registro |
|---|---|---|
| dinheiro novo igual ao tíquete menos o refinanciamento | `calculateNetNewMoney` | `material.net_new_money` |
| tíquete maior e refinanciamento maior pelo principal do ano pesado | `calculateEnlargedTicket` | `material.enlarged_ticket` |
| alavancagem após a estrutura, com quatro casas para a referência de preço | `calculateLeverageAfterStructure` | `material.leverage_after_structure` |
| alavancagem atual contra o teto do covenant | `testCovenantCeiling` | `material.covenant_ceiling` |
| ano mais pesado do cronograma acima de 1x do EBITDA | `selectHeaviestScheduleYear` | `material.heaviest_schedule_year` |

As comparações restantes (cobertura abaixo de 1,3x, refinanciamento abaixo da parede, valores positivos) passam por `compareFigures`, comparação exata que não cria número e por isso não leva rastro; milhões, múltiplos, percentual do EBITDA e as quatro casas da alavancagem de pico passam por `presentationFigure`.

**Frases de preço.** A frase da faixa de prática da mesa (`market-reference/src/index.ts`) e a da faixa observada (`pricing-truth.ts`, a que o motor do caso usa) imprimiam o spread com `Math.abs(bps) / 100` e o custo total com `Number(allIn) * 100`. Agora o spread vem do núcleo novo `presentationSpread` (sinal e magnitude, exata ou meio para cima com casas declaradas) e o custo total de `presentationFigure`. `materialArithmeticVersion` passa a `2026.09.26-v3`; nenhum núcleo existente mudou de resultado e `financialCoreVersion` segue `2026.09.20-v24`.

**Prova de paridade.** `packages/market-reference/src/price-sentence-parity.test.ts` entrou no primeiro commit da PR, antes de qualquer mudança, e fixa o sha256 das frases da mesa sobre toda banda da grade, com e sem cada ajuste e em dois níveis de CDI (mais de 10 mil frases, com spreads negativos, zero e positivos, de uma e de duas casas), e das frases observadas sobre amostras com pontos-base inteiros, de um quarto e de meio, negativos e ajustes rastreados. O commit que moveu as contas manteve os dois pinos das frases e os 12 pinos do veredito sem mudança. Para todo ponto-base inteiro de -10000 a 10000, as duas frases imprimem o mesmo texto de antes (`material-arithmetic.test.ts`).

**Diferenças deliberadas, fora de toda fixture:**

- Sobre um EBITDA zero, a mesa imprime a alavancagem como `Infinity`. O veredito escrevia "A companhia está em Infinityx" como condição de waiver, precificava a estrutura com alavancagem infinita e tratava um ano de EBITDA projetado zero como o mais pesado, com "Infinity%". Agora a alavancagem que não é número não é comparada com o covenant (como já acontecia com EBITDA negativo), a estrutura não é precificada (não há alavancagem para ler) e o ano fica fora da classificação, nomeado no rastro. `verdict.test.ts` prova as três coisas e falha no código anterior.
- Na frase da mesa, um ponto-base fracionário imprime o quociente exato ("19,987" para 1998,7 bps), e não o erro da divisão binária ("19,987000000000002"). A grade só cota pontos-base inteiros.
- Na frase observada não há diferença medida: o `Intl` arredonda o decimal mais curto do quociente e coincide com o núcleo em todo décimo de ponto-base de -2000 a 2000.
- Refinanciamento que não é número é recusado com `RangeError`, em vez do erro do `decimal.js`; os dois recusam.

### 4. Versão, pinos e manifesto

`caseMaterialsVersion` passa de `2026.09.26-v5` para `2026.09.26-v6`. Dos 22 pinos de `material-parity.test.ts`, mudaram 16: memorando, term sheet, Q&A, perfil e pacote nas três variantes, e as demonstrações bilíngues. Os outros 6 (os três teasers, a entrada do modelo e as demonstrações em português e em inglês) passam com os valores da v5, e o diff do teste altera só as 16 linhas. A comparação item a item do JSON da v5 com o da v6, nas três variantes, mostra que nenhum campo fora dos textos mudou (estrutura, dependências, suportes, gráficos, caminhos dos itens) além da auditoria de conduta em sombra; que o inglês mudou como descrito acima; e que o português mudou só em:

- "O tíquete resgata R$ 0,0M" para "R$ 0" (o refinanciamento do caso é zero), no memorando e no term sheet;
- "Alternativa: R$ 71M em 48 meses" para "R$ 71,3M", no memorando;
- "R$ 0,6M de ajustes" para "R$ 572 mil de ajustes", "DSO 90.3 dias" para "90,3" e "106.5 dias" para "106,5", no Q&A;
- as demonstrações bilíngues, que passam de decimais crus aos separadores de cada língua, com os rótulos separados por língua.

O perfil e o pacote não mudaram em português. Os 12 pinos do veredito mudaram todos, porque todo veredito tem valor no texto em inglês; em português, nas doze execuções, a única mudança é "R$ 0,0M" para "R$ 0" (Camil, Fakeco e Aurora), e nenhum campo fora dos textos mudou.

**Onde a versão é fixada.** Como no 6B, `caseMaterialsVersion` existe só em `packages/case-materials/src/index.ts`, gravada pelo motor do caso em `versions.materialCompiler`; revisões já gravadas não mudam, e a compilação seguinte publica os materiais novos.

**Manifesto de métodos.** Regenerado por `pnpm --filter @offroad/credit-playbook manifest:generate` nos dois commits que mudam fontes fixadas (`verdict.ts`, `analyze.ts`, `trajectory.ts`, `credit-math.ts`, `material-arithmetic.ts` e o apoio de teste novo de `credit-analysis`, que entra na proveniência como os demais testes do pacote). R01 publicado segue com `manifestHash` `17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090`, e os 496 testes de `credit-playbook` passam.

### Limites e perguntas abertas do 6C

1. Texto em português nos documentos em inglês: as afirmações do brief e o resumo executivo, o texto dos fatos citados, a descrição das exceções da conciliação (gerada numa língua só), os rótulos do índice da sala e as descrições de garantias. Os números desses textos são lidos como português e batem; traduzi-los pede um brief bilíngue.
2. A regra LC-07 da conduta continua sem ler células de tabela e lê vírgula e ponto como decimal nas duas línguas, então não apontava "4,70x" em inglês. O teste novo é mais estrito; tornar a LC-07 sensível à língua muda `conductPolicyVersion` e todas as auditorias, e fica para uma decisão própria.
3. Fora dos materiais, `credit-analysis/src/questions.ts` (perguntas da mesa à companhia) ainda imprime valores em milhões com vírgula decimal também no inglês e sem a regra de valores pequenos.
4. `analyze.ts` e `trajectory.ts` ainda calculam seus números com Decimal próprio; este incremento moveu para os núcleos a impressão deles e as contas do veredito.
5. Em `market-reference`, a soma dos ajustes em pontos-base (inteiros em número binário), a conversão de pontos-base em taxa e as comparações com limites ainda são contas locais, e `pricing-truth.ts` converte o custo anualizado com `Number(...)`.
6. Identificadores internos já visíveis antes desta PR: a coluna "Base" dos termos do pacote (`capacity`, `playbook`) e os rótulos dos ajustes de preço do memorando (`Ajuste: tenor`). Os textos de prazo do term sheet em `deal-structure` separam os limites da banda com traço meia-risca, também anterior a esta PR.
7. O manifesto de métodos precisa ser regenerado de novo pela PR que for mesclada depois de outra que também o regenere.

## Acabamento depois do fechamento

Uma PR (`fix/19-polish-6c-open-questions`) sobre `main` `3bec98e3`, que já tem o incremento 6C (PR #825). Sem migração, sem banco, sem decisão de produto: resolve as perguntas abertas 3 a 6 do 6C pelas invariantes 4 e 9 e pelas regras de texto do produto, como a PR #802 fez depois do fechamento da etapa 18. Ficam de fora, como decisões do fundador, o texto em português citado nos documentos em inglês (pede um brief bilíngue) e uma regra LC-07 sensível à língua (pede `conductPolicyVersion` novo).

### 1. Perguntas à companhia (invariante 9)

**Antes.** `packages/credit-analysis/src/questions.ts` imprimia todo valor em milhões com vírgula decimal também no inglês (`brlM`), sem a regra de valores pequenos, juntava os dois valores divergentes com "e" no inglês, e nomeava a informação que falta pelo caminho do campo ("Falta historical_financials.{ano}.ebitda para completar a análise") nas duas línguas.

**Agora.** Cada número da pergunta sai de `financial-core` na língua da pergunta: valores por `presentationAmount` (a regra única dos materiais, milhares abaixo de um milhão), múltiplos, meses e percentuais por `presentationFigure`, e a diferença entre o mapa de dívida e o balanço pelo núcleo da conciliação (`testScheduleTieOut`); o inglês junta os valores com "and". A informação que falta é nomeada em palavras nas duas línguas, por um rótulo para cada caminho que `buildDeskInputs` pode reportar ("Para completar a análise, falta este dado: EBITDA do último exercício."); o `findingId` continua `missing:<caminho>`, que não é texto visível.

**O teste.** `credit-analysis/src/bilingual-identity.test.ts` passou a cobrir toda pergunta, sobre todos os casos que os pinos do desk usam (`desk-cases.test-support.ts`, que contém os seis desks das doze execuções dos pinos do veredito). Rodado sobre as perguntas de `main`, ele achou seis tipos de pergunta com valor em formato português no texto em inglês: principal a vencer em 12 meses contra o caixa (11 ocorrências nos casos), espaço de dívida nova sob o covenant (8), diferença entre mapa e balanço (9), recebíveis livres (7), os dois valores divergentes, também com "e" (6), e necessidade e pedido de capital de giro (7). Todas foram corrigidas pelos formatadores acima; nenhuma divergência resta. `questions.test.ts` prova a regra de valores ("O mapa de dívida soma R$ 450 mil a mais", antes "R$ 0,5M") e que nenhuma pergunta, em nenhum caso, imprime caminho de campo, identificador ou traço.

### 2. Aritmética fora do núcleo (invariante 4)

**Pinos antes da mudança.** O primeiro commit da PR, antes de qualquer mudança, fixou o sha256 da saída inteira de `analyzeCreditPosition` (18 casos), de `projectLeverageTrajectory` (17 casos, com as trajetórias que o veredito refaz para o tíquete maior) e de `questionsForCompany` (19 casos) em `credit-analysis/src/desk-parity.test.ts`, sobre os seis desks das execuções do veredito, os fixtures dos testes do pacote e variantes sintéticas que alcançam todo achado e todo ramo das frases (o teste exige esse alcance). Em `market-reference/src/price-output-parity.test.ts` fixou a saída inteira de `indicativePrice` sobre toda a grade (15.360 saídas) e sobre cada limite no valor exato e dos dois lados (42 saídas), e a de `buildPricingTruthSet` sobre 636 conjuntos, com custos anualizados, economia de observações e faixas abaixo do piso e acima do teto. Os pinos existentes só fixavam frases.

**Núcleos novos.** `analyze.ts` e `trajectory.ts` não importam mais `decimal.js`. Os núcleos novos estão em `packages/financial-core/src/desk-arithmetic.ts` (`deskArithmeticVersion` `2026.09.27-v1`) e `price-arithmetic.ts` (`priceArithmeticVersion` `2026.09.27-v1`), com rastro, testes (`desk-arithmetic.test.ts` e `price-arithmetic.test.ts`, sobre números conferidos à mão) e entrada em `financialCalculationRegistry`:

| Conta | Núcleo | Registro |
|---|---|---|
| mapa em centavos, soma, diferença para o balanço, custo médio ponderado, vencimentos em 12 e 24 meses (com o perfil de vencimentos quando linhas não têm data), cobertura de liquidez, parcela de 24 meses | `calculateDeskDebtStack` | `desk.debt_stack` |
| dívida líquida, alavancagem antes e depois de cada valor pedido, covenant mais apertado, dívida nova admitida, rompimento | `calculateDeskLeverage` | `desk.leverage` |
| cobertura de juros hoje e com o pedido | `calculateInterestCoverage` | `desk.interest_coverage` |
| runway antes, com o tíquete e depois dos juros dele, dívida sobre ARR, distância do runway declarado | `calculateVentureRunway` | `desk.runway` |
| prazos de recebimento, estoque e fornecedores, ciclo, capital de giro que o crescimento absorve, pedido acima do dobro | `calculateWorkingCapitalCycle` | `desk.working_capital_cycle` |
| recebíveis comprometidos, livres e o pedido contra eles | `calculateReceivablesEncumbrance` | `desk.receivables_encumbrance` |
| taxa pedida contra o custo do estoque mais a tolerância | `testRateAskAgainstStack` | `desk.rate_ask_vs_stack` |
| refinanciamento resgatado do vencimento mais próximo | `allocateRefinancingNearestFirst` | `desk.refinancing_redemption` |
| trajetória ano a ano, pico, anos de travessia e covenant proposto | `projectLeveragePath` | `desk.leverage_path` |
| dinheiro novo e alavancagem depois da troca de passivo | `calculateLiabilityManagement` | `desk.liability_management` |
| soma exata de pontos-base | `sumBasisPoints` | `price.basis_points_sum` |
| faixa deslocada pelos ajustes e sua largura | `shiftSpreadBand` | `price.spread_band` |
| CDI mais pontos-base como uma taxa anual composta | `composeCdiPlusBasisPoints` | `price.cdi_plus_basis_points` |
| identidade entre a economia de uma observação e o spread normalizado | `testSpreadNormalization` | `price.normalization_identity` |
| custo anualizado em pontos-base (antes convertido com `Number(...)`) | `annualizeCostInBasisPoints` | `price.annualized_cost` |

O ano mais pesado do cronograma da trajetória passa pelo núcleo que o veredito já usava (`selectHeaviestScheduleYear`, limite 0,8). As comparações com limites (cobertura de liquidez, alavancagem, cobertura de garantias, tamanho do tíquete, largura da faixa, diferença para a expectativa) passam por `compareFigures`, e a distância entre a expectativa e a faixa por `calculateSpreadDifference`. A regra de leitura dos núcleos saiu para um módulo interno comum (`figure-input.ts`), e `presentationRatio` (conversão de apresentação, fora do registro como as demais) imprime uma razão como a mesa sempre publicou: igual a `presentationFigure` quando é número, e como a divisão por zero imprime (`Infinity`, `NaN`) quando não é. `materialArithmeticVersion` passa a `2026.09.27-v4` por ela; `financialCoreVersion` segue `2026.09.20-v24`, porque nenhum núcleo existente mudou de resultado.

**Paridade.** O commit que moveu as contas manteve todos os pinos: os 54 do desk, da trajetória e das perguntas, os três de saída inteira de preço, os dois das frases de preço, os 12 do veredito e os 22 dos materiais.

**Diferenças deliberadas, fora de toda fixture,** cada uma com teste que falha no código anterior (`credit-analysis/src/desk-kernels.test.ts` e `market-reference/src/price-kernels.test.ts`, conferidos contra as fontes do primeiro commit):

- valor que não é número decimal finito é recusado com `RangeError` (o `decimal.js` lia "0x10" como 16 e "Infinity" como infinito, e a análise seguia);
- um ano de EBITDA projetado zero fica fora da classificação do ano mais pesado, como no veredito, em vez de "Infinity% do EBITDA";
- trajetória sem ano projetado é recusada pelo nome, em vez de falhar num pico indefinido;
- pontos-base fracionários somam e subtraem como decimais: ajustes de 0,1 e 0,2 dão faixa a partir de 0,3 e, para uma expectativa de 0,1, distância de 0,2, e não 0,30000000000000004 e 0,20000000000000004;
- a economia de uma observação exatamente na tolerância de 0,01 ponto-base mantém a observação (a soma binária dava 0,010000000000000064 e a recusava);
- custo sobre um tíquete que não é positivo não é anualizado (antes, custo infinito);
- limite do preço informado em notação hexadecimal é recusado.

A soma da dívida depois da troca de passivo é feita numa ordem só para as duas formas da trajetória; como todo termo é valor em centavos, a soma é exata com 40 dígitos significativos em qualquer ordem, e os pinos confirmam.

### 3. Identificadores internos e traços no texto visível

Uma varredura de todo item de todo material (as três variantes do caso Aurora), do term sheet de `deal-structure` sobre todo arquétipo e todo ramo (prazo e carência não informados, dentro, abaixo e acima da banda, cada restrição limitante e banda observada) e de toda pergunta achou exatamente:

| Onde | Antes | Agora |
|---|---|---|
| Coluna "Base" dos termos do pacote | `capacity`, `playbook`, `company_request`, `reconciled_fact` | "Capacidade de endividamento calculada" e "Computed debt capacity"; "Prática de mercado para esta estrutura" e "Market practice for this structure"; "Pedido da companhia" e "Company request"; "Dado conciliado da companhia" e "Reconciled company data" (`termBasisLabels` de `deal-structure`) |
| Linhas de ajuste do preço no memorando | "Ajuste: security" e os demais ids | "Ajuste pelo prazo", "Ajuste pelas garantias", "Ajuste pela alavancagem pós-operação", "Ajuste pelo tamanho do tíquete" e "Ajuste pela cobertura de juros", com o inglês "Tenor adjustment", "Security adjustment", "Post-transaction leverage adjustment", "Ticket size adjustment" e "Interest coverage adjustment" (`priceAdjustmentLabels` de `market-reference`; nenhuma regra da grade produz o ajuste de cobertura, e ele leva o nome que a casa dá a esse fator) |
| Base do preço no memorando | "Base: banda watch para ccb, 400 a 550 bps." | "Base: Cédula de Crédito Bancário (CCB); perfil analítico: atenção; faixa de 400 a 550 bps.", com o nome do instrumento no catálogo do playbook e a banda nos rótulos dos termos-chave |
| Prazo e carência do term sheet | os limites da banda ligados por meia-risca, nas notas de prazo, em "Banda típica" e nas divergências de carência | "(entre 48 e 84 meses)" e "(between 48 and 84 months)", "A banda usual desta operação fica entre 12 e 24 meses", "Banda típica: entre 12 e 24 meses", "Mais longa que o usual (entre 12 e 24 meses)" |
| Perguntas à companhia | caminhos de campo | rótulos em palavras (seção 1) |

Nada mais apareceu: nenhum travessão ou meia-risca e nenhum outro identificador. Palavras inglesas que coincidem com valores internos ("watch" no perfil analítico em inglês, "leasing" no nome do arrendamento mercantil) são os rótulos em inglês e ficam. Os testes novos `case-materials/src/visible-text.test.ts` e `deal-structure/src/termsheet-text.test.ts` mantêm a regra.

### 4. Versão, pinos e manifesto

`caseMaterialsVersion` passa de `2026.09.26-v6` para `2026.09.27-v7`. Dos 22 pinos de `material-parity.test.ts`, mudaram 9: memorando, term sheet e pacote nas três variantes. A comparação item a item do JSON da v6 com o da v7 mostra, em cada variante, só estas mudanças: no memorando, a nota da base do preço e o rótulo do ajuste (nas duas línguas); no term sheet, as notas de prazo e de carência; no pacote, as cinco células da coluna "Base"; e, no memorando e no term sheet, o fingerprint da auditoria de conduta em sombra, com os mesmos achados. Os outros 13 (Q&A, teaser e perfil nas três variantes, a entrada do modelo e as três demonstrações) passam com os valores da v6, e o teste econômico de renderização da web continua verde em todos os formatos e nas duas línguas.

Das 19 perguntas fixadas no primeiro commit, 15 mudaram de pino, pela seção 1: comparadas pergunta a pergunta, nenhuma entrou, saiu, mudou de ordem ou de severidade; o português mudou só nas perguntas de informação que falta, e o inglês nos seis tipos da seção 1 e nas mesmas perguntas de informação que falta. As quatro variantes da Nimbus não perguntam valor nem informação que falta e mantêm o pino. Os pinos do desk, da trajetória, do veredito, das frases de preço e da saída inteira de preço não mudaram.

O manifesto de métodos foi regenerado por `pnpm --filter @offroad/credit-playbook manifest:generate` em cada commit que mudou fonte fixada; R01 publicado segue com `manifestHash` `17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090`, e os 496 testes de `credit-playbook` passam. O instantâneo publicado do executor de capital (#723) guarda a própria cópia das fontes e não muda.

### Limites e perguntas abertas do acabamento

1. Decisões do fundador, fora desta PR: o texto em português citado nos documentos em inglês (a taxa que a companhia pediu no term sheet, as premissas das projeções no Q&A) e a regra LC-07 sensível à língua.
2. Aritmética local que continua fora de `financial-core`, fora do escopo pedido: em `credit-analysis`, a leitura de taxas em `parse.ts` (conversões de texto e a capitalização mensal), `rating.ts`, `stress.ts` (cujos números chegam à tabela de choques do memorando) e `from-facts.ts`; em `market-reference`, a estatística da amostra governada (recência, comparabilidade, quantis ponderados, janela de prazo, razão de valores) e as diferenças contra o custo atual; em `deal-structure`, capacidade, garantias, estrutura, alternativas, operação e a comparação do montante no term sheet.
3. Fora dos materiais, do term sheet e das perguntas, dois textos visíveis ainda mostram identificadores: a frase de preço da mesa de `indicativePrice` na tela de comitê da entrada do caso ("Base: banda adequate para ccb"), cujo pino muda se ela mudar, e a lista de informações que faltam na tela da mesa (`intake-desk.tsx`), que mostra o caminho do campo em código ao lado do rótulo.
4. Uma razão sobre EBITDA zero continua publicada como a divisão imprime ("Infinity", "NaN") nos campos do desk e da trajetória, para não mudar bytes publicados; os materiais não compilam esse caso, como antes. Publicar a razão como ausente muda o contrato do desk.
5. O manifesto de métodos precisa ser regenerado de novo pela PR que for mesclada depois de outra que também o regenere.

## Segundo acabamento, parte 1: o que uma pessoa vê

Uma PR (`fix/19-visible-identifiers-and-absent-ratios`) sobre `main` `9f4935c4`, que já tem o acabamento depois do fechamento (PR #827: `caseMaterialsVersion` `2026.09.27-v7`, `desk-arithmetic.ts`, `price-arithmetic.ts`). Sem migração, sem banco. Resolve as perguntas abertas 3 e 4 do acabamento pelas invariantes 2, 4 e 9 e pelas regras de texto do produto: a frase de preço da mesa e a lista de informações que faltam deixam de mostrar identificadores, uma razão sobre denominador zero passa a ser publicada como ausente, com a lacuna nomeada onde uma pessoa lê, e uma varredura do texto visível da entrada do caso, da mesa, da tela de comitê e das perguntas à companhia corrige o que restava. A parte 2 (o resto da aritmética em `financial-core`) vem numa PR própria, depois desta.

### 1. Frase de preço da mesa

**Antes.** A frase de `indicativePrice`, que a tela de comitê da entrada do caso imprime, dizia "Base: banda adequate para ccb, 280 a 400 bps" e "Base: adequate band for ccb, 280 to 400 bps".

**Agora.** A base nomeia o instrumento pelo nome do catálogo do playbook e o perfil analítico pela faixa, em palavras, nas duas línguas, como o #827 fez na base do preço do memorando: "Base: Cédula de Crédito Bancário (CCB); perfil analítico: adequado; faixa de 280 a 400 bps" e "Base: Bank credit note (CCB); analytical profile: adequate; range of 280 to 400 bps". `market-reference` passa a depender de `credit-playbook` (o catálogo) e exporta `ratingBandLabels` e `pricedInstrumentLabel`; o memorando usa os dois no lugar das cópias que tinha, com os mesmos bytes.

**Pinos.** Mudaram o pino das frases da mesa em `price-sentence-parity.test.ts` (`a959f0ef` para `39e81b65`) e os pinos de saída inteira da grade e dos limites em `price-output-parity.test.ts` (`71464e8c` para `58dc6187`, `51fa2d17` para `ec89badb`). Um pino novo das mesmas saídas sem a frase, tirado antes da mudança (`fd4c0dd6` e `7cda3996`), continua valendo, e a comparação frase a frase das 15.360 saídas da grade mostrou que só a oração da base mudou. Os pinos da frase observada e da verdade de preço não mudaram.

### 2. Lista de informações que faltam

**Antes.** A lista da tela da mesa (`intake-desk.tsx`) mostrava o caminho do campo em código ao lado do rótulo, e o rótulo caía no próprio caminho, porque a ontologia não resolve os caminhos com "{ano}" que a mesa reporta: "historical_financials.{ano}.revenue" duas vezes.

**Agora.** Cada informação é nomeada pelas mesmas palavras das perguntas à companhia (`deskInputLabel`, exportado por `credit-analysis`), nas duas línguas e com a primeira letra maiúscula: "Receita líquida do último exercício" e "Net revenue for the latest financial year". O caminho fica fora do texto visível, no atributo `data-field-path`; o estilo do código sai. `intake-desk.test.tsx` renderiza a lista nas duas línguas sobre todo caminho que `buildDeskInputs` pode reportar e falha no componente anterior.

### 3. Razões sobre denominador zero

**Antes.** O desk e a trajetória publicavam uma razão sobre denominador zero como a divisão imprime ("Infinity", "NaN"), comparavam essa razão com limites e, onde uma frase a imprimia, recusavam a bateria inteira. Uma dívida líquida negativa sobre EBITDA zero dava "-Infinity" antes do pedido e "Infinity" depois, que a mesa lia como alavancagem subindo; um EBITDA projetado zero cruzava abaixo de todo covenant; um ciclo de zero dias escrevia "Infinity vezes a necessidade incremental"; e os materiais de um caso assim não compilavam.

**Contrato novo.** Uma razão sobre denominador zero é ausente: o campo é nulo, a razão entra em `absentRatios` com a lacuna, a lacuna é nomeada em palavras onde a razão seria impressa, e uma razão ausente nunca é comparada com um limite. Uma razão sobre denominador negativo continua sendo um número, como antes.

| Onde | Razões que podem ser ausentes | Lacuna |
|---|---|---|
| Alavancagem do desk | hoje e depois de cada valor pedido | EBITDA do último exercício igual a zero |
| Cobertura de juros com o pedido | quando a despesa de juros somada aos juros do pedido é zero | despesa de juros somada aos juros do pedido igual a zero |
| Runway depois do serviço | quando a queima mensal somada aos juros mensais da captação é zero | queima mensal somada aos juros mensais da captação igual a zero |
| Ciclo de caixa | DIO, DPO, o ciclo e o que o crescimento absorve | custo das mercadorias vendidas do último exercício igual a zero |
| Trajetória, por ano | alavancagem e peso do cronograma sobre o EBITDA projetado | EBITDA projetado do ano igual a zero |
| Trajetória, por ano | alavancagem no cenário cortado e o degrau do covenant | EBITDA do ano no cenário cortado igual a zero |
| Trajetória | o pico, quando a alavancagem cortada de algum ano é ausente | EBITDA do ano no cenário cortado igual a zero |
| Gestão de passivo | alavancagem depois da troca | EBITDA do último exercício igual a zero |

Em `financial-core`, os núcleos da mesa devolvem nulo, listam em `absent` a razão e o denominador e o nomeiam no rastro (`deskArithmeticVersion` `2026.09.27-v2`); `presentationRatio` mantém a razão ausente e lê como ausente o texto que a divisão imprimia (`materialArithmeticVersion` `2026.09.27-v5`); `testCovenantCeiling` e `selectHeaviestScheduleYear` aceitam o valor ausente. Três escolhas de semântica: o pico é o mais alto de todos os anos, então uma alavancagem cortada ausente deixa o pico ausente, em vez de um pico dos anos que sobram; a travessia de um teto é o primeiro ano cuja alavancagem é número e está no teto ou abaixo; e o que o pedido representa da necessidade de giro é ausente quando a necessidade é zero, e a frase diz que o pedido não é múltiplo dela.

Em `credit-analysis`, o contrato do desk passa a `creditAnalysisVersion` `2026.09.27-desk-v2`, e o motor do caso passa a gravar essa versão em toda execução (`creditAnalysis`, ao lado de `materialCompiler`), para que o desk gravado diga de que contrato veio e para que uma execução nova não reaproveite uma etapa do contrato anterior. `absentRatios` só aparece quando alguma razão é ausente, então um desk sem razão ausente sai com os mesmos bytes, e um desk gravado antes continua válido. `absentRatioGap`, `ratioGapLabels` e `publishedRatio` nomeiam a lacuna e leem o desk gravado antes desta PR, cujo texto de divisão é lido como ausente pelo denominador do campo. Todo consumidor segue:

- frases do desk e da trajetória: o runway comprado, o pedido de giro sobre necessidade zero, a gestão de passivo e a trajetória nomeiam a lacuna ("o pico não pode ser afirmado, porque a alavancagem no cenário com corte de 25% do crescimento não é calculável em 2027: o EBITDA do ano nesse cenário é zero"), e os valores citados deixam de fora a razão ausente;
- veredito: não precifica uma trajetória sem pico e não escreve waiver sobre alavancagem ausente; nota: não avalia alavancagem nem runway ausentes e diz por quê; choques: o choque de ciclo nomeia o ciclo ausente;
- materiais (`caseMaterialsVersion` `2026.09.27-v8`): a estrutura de capital, a tabela de trajetória, o cronograma do covenant, os termos-chave e o term sheet do memorando e as perguntas 9, 13, 15, 16, 24, 25 e 36 do Q&A imprimem a lacuna; a alavancagem pré sobre EBITDA zero deixa de sair como "não se aplica (EBITDA negativo)";
- tela da mesa, exportação do diagnóstico, evidência da mesa entregue ao modelo e pedido de triagem dos financiadores: a lacuna em palavras, nunca um número; na tela, "sem sentido com EBITDA negativo" passa a "sem sentido com EBITDA zero ou negativo" (cobertura de juros), e as taxas saem com "p.a." em inglês.

**Testes que falham no código anterior**, conferidos contra as fontes do commit anterior: `financial-core/desk-arithmetic.test.ts` e `material-arithmetic.test.ts`, `credit-analysis/absent-ratios.test.ts` (onze testes de comportamento, todos falhando antes), `case-materials/absent-ratios.test.ts` (os materiais sobre EBITDA zero e sobre custo das mercadorias vendidas zero compilam, nomeiam cada lacuna e mantêm a identidade bilíngue), `case-understanding/desk-evidence.test.ts` e `apps/web/.../intake-desk.test.tsx`. Nenhum pino mudou por esta seção: nenhum caso fixado tem denominador zero (54 pinos de desk, trajetória e perguntas, 12 do veredito, 22 dos materiais).

### 4. Varredura do texto visível

Uma renderização da tela do caso, da mesa e do comitê nas duas línguas sobre o caso Aurora sintético (`intake-visible-text.test.tsx` e `intake-case.test.tsx`), com a leitura da revisão da entrada, achou e corrige:

| Onde | Antes | Agora |
|---|---|---|
| Comitê, motivo de debênture fechada (`credit-playbook`) | "Requires sa; the company is ltda." | "Requires a sociedade anônima; the company is a limitada." |
| Comitê, prazo dos instrumentos | "12 a 60 months" em inglês | "12 to 60 months" (catálogo) |
| Comitê, faixa de preço | "a.a." em inglês | "p.a." (catálogo) |
| Tela do caso, base dos termos | "capacity", "company_request" | "Capacidade de endividamento calculada", "Pedido da companhia" (`termBasisLabels`) |
| Tela do caso, cálculos | "calculado de: historical_financials.2025.gross_debt · ..." | "calculado de: Dívida bruta (2025) · Caixa e equivalentes (2025)" |
| Tela do caso, suporte das afirmações do brief | identificadores e caminhos | rótulos dos fatos e dos cálculos; os identificadores ficam no atributo `data-support-ids` |
| Tela do caso, política de preço | a versão ("pricing-policy-2026-08") | fora do texto, no atributo `data-pricing-policy` |
| Tela do caso, seções | rótulos de módulo "M2" a "M8" | sem rótulo |
| Tela do caso, restrição e amortização desconhecidas | o identificador com espaços | "Outra restrição", "Outro formato" |
| Pontos em aberto, regra R3 da conciliação | "historical_financials.2025.revenue (2025-12-31): ..." | o campo em palavras; os testes acham a exceção pelo caminho da evidência |
| Revisão da entrada, classe da informação | o identificador com espaços ("bank statement") | "Extrato bancário" e "Bank statement" (catálogo) |

Nenhum travessão ou meia-risca apareceu. O teste de texto visível dos materiais passa a apontar também a forma societária pela chave.

### 5. Versão, pinos e manifesto

`caseMaterialsVersion` passa de `2026.09.27-v7` para `2026.09.27-v8`. Dos 22 pinos de `material-parity.test.ts`, mudaram 3, o memorando nas três variantes, pelo motivo da debênture fechada em inglês; a comparação item a item mostra só as duas frases em inglês e o fingerprint da auditoria de conduta em sombra, com os mesmos achados. Os pinos do desk, da trajetória, das perguntas e do veredito não mudaram; os de preço mudaram como na seção 1. `financialCoreVersion` segue `2026.09.20-v24`: a mudança de resultado é dos núcleos da mesa e da apresentação de razão, registrada nas versões próprias (`deskArithmeticVersion` v2 e `materialArithmeticVersion` v5), e nenhuma saída de `financial-model` que grava `financialCoreVersion` passa por eles.

O manifesto de métodos foi regenerado por `pnpm --filter @offroad/credit-playbook manifest:generate` em cada commit que mudou fonte fixada; R01 publicado segue com `manifestHash` `17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090`, e os 496 testes de `credit-playbook` passam.

### Limites e perguntas abertas da parte 1

1. Texto em português de sistema no inglês, fora da regra de identificadores: a origem dos valores pedidos no achado de divergência ("(documentos)" e "(informado pela empresa)"), os rótulos da evidência das exceções da conciliação ("adotado", "conflito") e os compradores de cada instrumento no catálogo do playbook ("bancos, fundos de crédito via cessão, FIDCs").
2. Números fora da regra de apresentação: a nota do pacote de garantias imprime o valor cru ("faltam 35712000 de valor elegível"), a explicação das paredes de capacidade imprime o DSCR e o teto com ponto também em português, e a tela da mesa formata valores por conta própria ("R$ 0,0M" para valores pequenos). As contas de garantias e capacidade entram em `financial-core` na parte 2.
3. Uma necessidade de giro negativa (ciclo negativo com receita crescendo) faz o achado de giro escrever um múltiplo negativo; não é denominador zero e fica como estava.
4. Os textos da vertente de recebíveis na tela do caso não foram alterados: o método R01 publicado não muda nesta PR.
5. O manifesto de métodos precisa ser regenerado de novo pela PR que for mesclada depois de outra que também o regenere.

## Segundo acabamento, parte 2A: a aritmética da análise de crédito e da referência de preço

Uma PR (`fix/19-remaining-arithmetic-to-financial-core`) sobre `main` `ef1e4565` (parte 1, PR #830). Sem migração, sem banco. Move para `financial-core` a aritmética que ainda era feita em `credit-analysis` (a leitura de taxas de `parse.ts`, `rating.ts`, `stress.ts` e `from-facts.ts`) e na estatística da amostra de preço de `market-reference`, como registrado no acabamento depois do fechamento, e resolve a pergunta 3 da parte 1, a necessidade de giro negativa. A parte 2B, `deal-structure`, vem numa PR própria, mesclada depois desta.

### 1. Pinos tomados antes da mudança

O primeiro commit só acrescenta pinos, tirados das fontes como a parte 1 as deixou:

- `credit-analysis/src/review-parity.test.ts`: a nota interna de cada um dos 18 desks de `desk-cases.test-support.ts` e de 23 desks variados para alcançar cada faixa de alavancagem, liquidez e runway, com e sem trajetória, sob oito conjuntos de entradas opcionais que alcançam cada faixa de cobertura, tendência, concentração e evidência no limite exato, e a nota e os choques que os materiais compilam para o caso Aurora (42 pinos); a tabela de choques de cada desk sob valor, receita e cliente, e de desks variados sem covenant, sem custo, com EBITDA zero e negativo, com ciclo ausente e com CDI de 13,65% (27); as entradas do desk de cada caso, de cada gabarito ouro e do caso Aurora dos materiais, com valor informado acima, abaixo e igual ao dos documentos e prazos escritos de formas diferentes (36); e a leitura de toda taxa, covenant e cobertura das fixtures e das formas que a gramática admite, em dois conjuntos de níveis de índice (1).
- `market-reference/src/pricing-sample-parity.test.ts`: 65 conjuntos de verdade de preço sobre idades em volta da janela de peso cheio e do decaimento de cada tipo de fonte; prazos dentro, no limite e fora da janela, com a janela padrão e uma governada, em seis prazos-alvo; razões de valor em cada borda das faixas de tamanho e da janela da política, e valores não positivos; setores e amortizações iguais, escritos de outro jeito, da mesma família e diferentes; toda outra recusa; faixas publicadas sobre pesos decaídos, com a expectativa abaixo, dentro e acima da faixa e o custo atual abaixo, no e acima do all-in; empates de spread e pesos acumulados exatamente num quartil; e 60 janelas de prazo. O pino de verdade de `price-output-parity.test.ts` mantém a amostra numa idade, num prazo e num valor, e não alcança nada disso.

### 2. Núcleos

| Núcleo | Registro | Conta |
|---|---|---|
| `readDocumentFigure` | `review.document_figure` | número escrito num documento brasileiro |
| `readDocumentPercent` | `review.document_percent` | percentual escrito como fração, meio para cima na precisão pedida |
| `annualRateForMonthlyRate` | `review.monthly_compounding` | (1 + taxa mensal)^12 - 1 |
| `readFactFigure` | `review.fact_figure` | número de um fato, em notação decimal |
| `readMonthCount` | `review.month_count` | contagem de meses de um fato |
| `selectLargestAmount` | `review.largest_amount` | o maior valor informado, por comparação exata, o primeiro no empate |
| `calculateRatingCoverage` | `rating.interest_coverage` | EBITDA sobre o módulo da despesa financeira |
| `calculateEbitdaTrend` | `rating.ebitda_trend` | (EBITDA atual - anterior) / módulo do anterior |
| `scoreRatingFactor` | `rating.factor_points` | pontos do fator contra tetos ou pisos |
| `gradeInternalRating` | `rating.grade` | pontuação e nota |
| `calculateStressTable` | `stress.table` | os cinco choques |
| `calculateTenorWindow` | `price.tenor_window` | janela de prazo |
| `testObservationWindows` | `price.observation_windows` | distância de prazo e razão de valor contra as janelas |
| `calculateRecencyFactor` | `price.recency` | fator de recência |
| `scoreComparability` | `price.comparability` | soma de peso vezes similaridade |
| `calculateObservationWeight` | `price.observation_weight` | recência vezes comparabilidade |
| `selectWeightedQuantiles` | `price.weighted_quantiles` | quantis ponderados |
| `calculateCostDifference` | `price.cost_difference` | all-in proposto menos custo atual |

Os de leitura, nota e choques ficam no módulo novo `financial-core/src/credit-review-arithmetic.ts` (`creditReviewArithmeticVersion` `2026.09.27-v1`); os da amostra, em `price-arithmetic.ts` (`priceArithmeticVersion` `2026.09.27-v2`). Os limites que não criam número passam por `compareFigures`. Ficam nos pacotes a gramática da prosa das taxas, as faixas e os pesos da nota como dado, os rótulos e as frases; na referência de preço, os pesos, as faixas e as janelas da política como dado, o calendário (a idade da observação em dias e a janela da amostra em meses) e o texto que conta como o mesmo setor ou a mesma família de amortização. `parse.ts`, `rating.ts`, `stress.ts` e `pricing-truth.ts` não importam mais `decimal.js`; em `from-facts.ts`, `Number` fica só para índices e anos. `tenorWindowMonths` passa a devolver o texto decimal da janela.

### 3. Paridade

O commit da mudança manteve todos os pinos existentes (54 do desk, da trajetória e das perguntas, 12 do veredito, 22 dos materiais, 4 de saída inteira do preço e 3 das frases de preço) e os pinos novos das entradas do desk, da leitura, dos choques e da amostra. Dos 42 pinos novos da nota, 37 se mantiveram; 5 mudaram pela diferença deliberada 1.

### 4. Diferenças deliberadas

Nenhuma fixture as alcança. `credit-analysis/src/review-kernels.test.ts` testa cada uma, e cada asserção falhou nas fontes do commit anterior; os núcleos têm os próprios testes em `financial-core`.

1. **Pontuação da nota.** A pontuação é arredondada meio para cima sobre o decimal exato. 23 pontos de 40 são 57,5 e saem 58; a divisão binária dava 57,49999999999999 e saía 57. É o único par de pontos e pesos da escala em que as duas diferem, e a nota não muda (5). Os 5 pinos novos que mudaram (`gold:rede-horizonte`, `unit:aurora-questions`, `liquidity:1`, `liquidity:1.5` e `runway:6`) chegam a esse par só pelos conjuntos sintéticos de entradas opcionais; comparados campo a campo, só a pontuação e a frase que a diz mudaram ("57 pontos em 100" para "58 pontos em 100").
2. **Leitura de números escritos.** Pontos agrupam milhares de três em três e a vírgula marca os decimais, como antes; um ponto único que não pode agrupar milhares passa a marcar os decimais: "CDI + 4.10% a.a." era lido como spread de 410% e "Dívida líquida/EBITDA <= 3.5x" como teto de 35 vezes. Texto que não é número deixa a leitura nula em vez de lançar erro ("CDI + 1,2,3% a.a."), de ser lido pela metade (",5% a.m." era 0,5% ao mês) ou de juntar grupos ("Duplicatas 1.2.3%" era 1,23). O número capturado começa e termina num dígito, então o ponto final de uma frase ("menor ou igual a 3,0.") continua fora dele, como a leitura anterior o descartava.
3. **Entradas do desk.** Um prazo vazio era zero meses e "0x3C" era sessenta; nenhum dos dois é contagem, e o prazo passa a ser pedido à companhia. O maior valor informado é escolhido por comparação exata ("12345678901234567.01" e "12345678901234567.02" eram o mesmo número binário, e o dos documentos ficava). O múltiplo do covenant de uma linha é lido pela regra dos documentos ("1.234,5x" era passado como "1.234.5"). Também deixa de contar como EBITDA positivo, para a trajetória, o texto que não é número finito em notação decimal ("Infinity", "0x10"), e um valor informado que não é número é recusado já na escolha do maior, onde antes o desk o recusava depois.
4. **Necessidade de giro negativa**, na seção 5.

### 5. Necessidade de giro negativa

**Antes.** Com ciclo de caixa negativo e receita crescendo, o crescimento libera capital de giro, e o achado de giro dividia o pedido pela necessidade negativa: "O crescimento projetado (R$ 17,3M de receita) absorve R$ -9,0M de capital de giro ao ciclo atual de -190 dias, mas o pedido rotula R$ 25,0M como giro, -2,8 vezes a necessidade incremental." A pergunta à companhia dizia "O crescimento projetado absorve R$ -9,0M de capital de giro, mas o pedido rotula R$ 25,0M como giro."

**Agora.** O núcleo `calculateWorkingCapitalCycle` devolve o capital que o crescimento libera (`growthRelease`) e nenhum múltiplo quando a necessidade é negativa (`deskArithmeticVersion` `2026.09.27-v3`). O achado diz "O crescimento projetado (R$ 17,3M de receita) libera R$ 9,0M de capital de giro ao ciclo atual de -190 dias, porque o ciclo de caixa é negativo, mas o pedido rotula R$ 25,0M como giro; sem necessidade incremental, o pedido não é múltiplo dela.", com o valor liberado em `values.released`, e a pergunta diz "O crescimento projetado libera R$ 9,0M de capital de giro, porque o ciclo de caixa é negativo, mas o pedido rotula R$ 25,0M como giro. O que esse valor financia: alongamento do ciclo, recomposição de caixa, substituição de linhas?". O inglês diz o mesmo, com os separadores do inglês.

### 6. Versões e manifesto

`creditAnalysisVersion` passa a `2026.09.27-desk-v3`, gravada pelo motor do caso em toda execução, porque o desk muda no achado de giro com necessidade negativa, na pontuação e na leitura de taxas. `caseMaterialsVersion` segue `2026.09.27-v8`, porque nenhum pino dos materiais mudou, e `financialCoreVersion` segue `2026.09.20-v24`. O manifesto de métodos foi regenerado; R01 segue com `manifestHash` `17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090`.

### Limites e perguntas abertas da parte 2A

1. A escala da nota nunca chega à nota 1: a pontuação máxima, 100, dá 10 - piso(100 / 11,2) = 2. O comentário que dizia "100 → grade 1" foi corrigido; a escala não mudou, porque mudar a nota de todo caso forte é decisão de crédito.
2. A pergunta 24 do Q&A dos materiais ("Quanto capital de giro o crescimento projetado absorve?") ainda responde com a absorção negativa ("R$ -9,0M ao ciclo atual de -190 dias") quando o ciclo é negativo; `case-materials` fica fora desta PR.
3. O motor do caso ainda calcula em binário a cobertura dos recebíveis livres sobre o valor pedido que a triagem de instrumentos lê (`Number(...) / Number(...)` em `case-engine/src/engine.ts`).
4. O manifesto de métodos precisa ser regenerado de novo pela parte 2B depois que esta for mesclada.

## Segundo acabamento, parte 2B: a aritmética da estrutura da operação

Uma PR (`fix/19-deal-structure-arithmetic-to-financial-core`) sobre a parte 2A (PR #833), porque usa os núcleos de leitura de fatos que ela cria (`readFactFigure` e `readMonthCount`); é mesclada depois dela, como pede o brief. Sem migração, sem banco. Move para `financial-core` a aritmética de `deal-structure` (capacidade, garantias, estrutura, alternativas, operação e a comparação de valor do term sheet) e resolve os dois números de `deal-structure` impressos fora da regra de apresentação que a parte 1 registrou na pergunta 2: o valor cru na nota do pacote de garantias e o DSCR e o teto de alavancagem com ponto nos textos de capacidade em português.

### 1. Pinos tomados antes da mudança

O primeiro commit só acrescenta `deal-structure/src/deal-parity.test.ts`, tirado das fontes como a parte 2A as deixou: a capacidade de cada um dos sete arquétipos sob 20 conjuntos de entradas (140: as três paredes com e sem cada entrada, EBITDA zero e negativo, dívida líquida acima do teto, valores em meio centavo, paredes empatadas e as frações de ARR e de rodada do venture debt); o pacote de garantias sobre oito conjuntos de ativos (uma classe de cada, haircut da sala sobre o da política, gravame acima do valor, empates de classe e de valor, valores fracionários e só aval) em seis valores e três coberturas (144); o term sheet de cada arquétipo sobre seis capacidades, restritas e não, e cinco conjuntos de entradas opcionais (210); a verdade de estrutura sobre o gabarito dos seus testes e 21 variantes que alcançam cada ramo de dimensionamento, cronograma, cobertura, vencimentos, garantias e dimensionamento final (22); a verdade de operação sobre 13 conjuntos de fatos; e as alternativas de estrutura sobre 9 propostas (verificadas e não, tolerâncias, valor acima do envelope, valor inválido, fontes e usos fracionários).

### 2. Núcleos

| Núcleo | Registro | Conta |
|---|---|---|
| `calculateVentureDebtCapacity` | `deal.venture_capacity` | a menor entre a fração do ARR e a da última rodada, meio para cima em centavos |
| `calculateLeverageCeilingRoom` | `deal.leverage_ceiling_room` | EBITDA vezes o teto, menos a dívida líquida, nunca negativo, em centavos |
| `selectLowestFigure` | `deal.lowest_figure` | o menor valor, por comparação exata, o primeiro no empate |
| `designCollateralCoverage` | `deal.collateral_coverage` | valor elegível, ordem, seleção, cobertura alcançada e falta |
| `sumAmounts` | `deal.amount_sum` | soma exata, na ordem dada |
| `calculateAmountDifference` | `deal.amount_difference` | diferença e módulo |
| `testWithinTolerance` | `deal.within_tolerance` | fontes e usos dentro da tolerância |
| `calculateSizingGap` | `deal.sizing_gap` | pedido menos envelope, nunca negativo |
| `sumAmountsByKey` | `deal.amounts_by_key` | vencimentos somados por ano |

Ficam no módulo novo `financial-core/src/deal-arithmetic.ts` (`dealArithmeticVersion` `2026.09.27-v1`). As comparações exatas passam por `compareFigures`, e os números dos fatos são lidos por `readFactFigure` e `readMonthCount`, da parte 2A. Ficam no pacote a política como dado (as frações do venture debt, o haircut e a posição de cada classe de garantia), o calendário (o ano de cada parcela e de cada vencimento), os portões e as frases. Nenhum arquivo de `deal-structure` importa mais `decimal.js`; `Number` fica só para índices e anos.

### 3. Paridade

Todos os pinos existentes se mantiveram, menos os três do memorando nos materiais (seção 5). Dos pinos novos, os do term sheet, da estrutura, da operação e das alternativas se mantiveram; os da capacidade e das garantias mudaram só pelos dois textos da seção 4. Comparados campo a campo com as fontes anteriores, mudaram 120 explicações de parede em português e 49 notas em cada língua, e nada mais; as mesmas saídas com esses textos mascarados, tiradas das fontes anteriores, estão fixadas e se mantêm.

### 4. Textos corrigidos

**Capacidade**, na tela do caso. Antes: "A geração cobre um serviço de dívida a um DSCR mínimo de 1.30x, que é a cobertura que um financiador subscreve para este tipo de operação." e "Espaço até 3.5x dívida líquida / EBITDA no fechamento". Agora: "DSCR mínimo de 1,30x" e "Espaço até 3,5x", com os dígitos que o playbook escreve; o inglês não muda.

**Nota do pacote de garantias**, no memorando e na tela de comitê. Antes: "O inventário cobre 0,46x do pedido contra 1,30x exigidos: faltam 35712000 de valor elegível." e "35712000 of eligible value is missing". Agora: "faltam R$ 35.712.000 de valor elegível" e "R$ 35,712,000 of eligible value is missing", pela regra única de valores, em reais inteiros agrupados pela língua, como o parágrafo do memorando que vem antes da nota imprime o mesmo valor.

### 5. Materiais, versões e manifesto

`caseMaterialsVersion` passa a `2026.09.27-v9`: mudaram os três pinos do memorando, um por variante, só pela nota e pelo fingerprint da auditoria de conduta em sombra, com os mesmos achados; os outros 19 pinos dos materiais se mantiveram. As versões de contrato de `deal-structure` (`structureTruthVersion`, `operationTruthVersion` e `structureAlternativesVersion`) seguem: as saídas de entradas legíveis têm os mesmos bytes, e mudar a versão das alternativas mudaria a impressão digital de toda proposta em curso e invalidaria a confirmação pendente da companhia. O manifesto de métodos foi regenerado; R01 segue com `manifestHash` `17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090`.

### 6. Diferenças deliberadas

Nenhuma fixture as alcança. `deal-structure/src/deal-kernels.test.ts` testa cada uma, e cada asserção falhou nas fontes anteriores; o DSCR e o teto com vírgula estão em `index.test.ts`.

1. **Fatos da operação e da estrutura em notação decimal.** Um fato vazio é ausente, não zero: um prazo vazio era zero meses, e um colchão de execução vazio fazia o cálculo da necessidade lançar erro, e agora é pedido. Um número hexadecimal não é número: "0x10" de aporte dos sócios valia 16 e baixava a necessidade calculada de 100 para 84.
2. **Alternativas.** Uma linha de fontes ou de usos que não é número deixa de ser pulada na soma e impede fechar fontes e usos: linhas escritas por extenso somavam zero contra zero e fechavam, e uma linha hexadecimal valia 100.000.000. Um valor da alternativa que não é número deixa os termos sem verificação em vez de lançar erro, e um valor com espaços em volta passa a ser lido.
3. **Capacidade.** Uma dívida líquida que não é número é recusada mesmo quando o EBITDA não é positivo; antes ela só era lida com EBITDA positivo.

### Limites e perguntas abertas da parte 2B

1. `operation.ts` soma os componentes do autofinanciamento e as linhas de uso que existem e são números; um fato presente mas ilegível continua sem contar, como antes, em vez de deixar a necessidade não calculável.
2. A exceção `sizing-exceeds-envelope` da verdade de estrutura não é alcançável: o valor proposto é o menor entre a base e o envelope, reduzido ao teto do mandato, e nunca passa do envelope.
3. `deal-structure` e `market-reference` ainda declaram `decimal.js` como dependência sem importá-lo; tirar muda o lockfile e fica para uma PR de manutenção.
4. Esta PR contém os commits da parte 2A até que a #833 seja mesclada; depois, uma mescla de `main` mantém as duas entradas dos registros e regenera o manifesto.
