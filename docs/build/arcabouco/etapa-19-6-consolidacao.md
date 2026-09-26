# Etapa 19, incremento 6: consolidação e limpeza

Uma PR (`feat/19-6-consolidation`) sobre `main` `b6a9b231`, que já tem o incremento 3 (leitor autorizado e `renderArtifactRevision`, PR #817) e o incremento 4, parte A (produtores no comando comum, PR #816). Sem migração, sem banco, sem robô novo. Quatro frentes: as regras de evidência passam a ter uma definição só e o pacote órfão sai; toda conta financeira de `case-materials` passa a vir de núcleos Decimal de `financial-core`, com os materiais publicados idênticos byte a byte; testes econômicos de renderização comparam os números de uma mesma revisão em todos os formatos; e os bytes guardados da prévia passam a ser lidos no endereço da concessão de upload, com recusa tipada quando o objeto sumiu ou mudou.

## 1. Regras de evidência e retirada de `evidence-compiler`

**Onde `case-materials` dependia da semântica do pacote.** O pacote tinha duas regras (afirmação material sem suporte; julgamento material sem aprovação), a cobertura das afirmações materiais e uma asserção de identidade econômica entre as duas línguas, com zero importadores. `case-materials` nunca o importou, mas repetia a primeira regra dentro de `truth.ts` (a verdade dos materiais marcava como sem suporte a linha material sem ids de suporte) e já passava o brief por `auditBrief`, que usa as duas regras de `case-understanding/src/audit.ts`. O julgamento material dos blocos compilados nunca dependeu da regra booleana do pacote: ele é barrado pela conduta (LC-01, aprovação presa ao fingerprint exato, mais estrita), e a identidade econômica bilíngue é a regra LC-07 da conduta.

**O que mudou.**

- `packages/case-understanding/src/audit.ts` exporta `materialClaimWithoutSupport` e `materialJudgmentWithoutApproval` e as usa no próprio `auditClaims`, nas mesmas posições e com os mesmos códigos (`material_claim_without_support`, `material_judgment_without_approval`). Comportamento idêntico: os 123 testes do pacote seguem verdes.
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
