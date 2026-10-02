# 3S : linhagem prospectiva dos materiais v10

O renderer vigente passa de `caseMaterialsVersion=2026.10.02-v9` para `2026.10.02-v10`. A mudança identifica duas correções: o valor proposto do term sheet é `MIN(pedido, teto de capacidade)` e o conflito entre materiais compara o mesmo campo e contexto, sem confundir campos distintos apoiados pelo mesmo conjunto de fontes.

Os 22 pins dos materiais Aurora de v9 permanecem exatamente iguais no teste de paridade v10. Não se alterou um gold histórico, uma release, uma cápsula publicada ou um pin de R01. O índice do renderer e o manifesto prospectivo são regenerados pela ferramenta canônica; releases fixadas continuam usar a closure capturada no executor publicado.

## Term sheet

Os 210 casos de term sheet têm um pin prospectivo novo: `705dc7a8f1216d1e5401dd7d319706c8ce593cbd19b4492e848e3b83ffa05da4`. O pin publicado `74f6833fb29237535c3969add315b5c4551f08ff09fe13db85142bab30090e43` continua intacto e passa sob a implementação v9 congelada, sem normalizar valores econômicos.

A closure de replay é `packages/deal-structure/scripts/fixtures/termsheet-v9-runtime.sources.json`, hash `3a26d5d52e8b0426c42e0c4cc2bd6941fb4874f68937249c69350e36a5c02744`, capturada dos blobs do commit publicado `111591e6572667f04c56e74381178c716ac2b56d`. Contém 146 fontes first-party/metadata/lock necessárias à resolução completa dos barrels históricos, sem node_modules. O loader verifica snapshot, commit, SHA de cada fonte, Git blob SHA-1 e lock; usa esbuild 0.28.2, Decimal 10.6.0 e Zod 4.4.3. Resolve todo módulo first-party pelo snapshot. As mesmas 210 entradas sintéticas da paridade de capacidade inalterada são passadas explicitamente ao builder histórico; não se atribuem entradas ou outputs v10 a um executor v9.

## Fronteira de execução

Executores publicados por `compiled-executor-lock.json` são carregados pelo artefato/closure original em `build-released-executors.mjs`; o renderer workspace atual não substitui seus módulos. O manifesto gerado conserva provenance/release e rejeita troca de política da versão publicada.

O consumidor nativo de materiais possui outra fronteira: `material_production_native_capture.sql` inclui `materialCompilerVersion` no contexto capturado e valida a versão do relatório, enquanto `capital-material-production-adapter.ts` exige a versão corrente do renderer. A candidata do consumidor precisa fixar v10 em receitas novas. Receita v9 existente não pode ser reescrita nem continuada pelo renderer v10: recupera os bytes originais quando já concluída; se faltar cálculo, recusa como runtime indisponível ou usa executor v9 fixado em uma closure própria. Bump global de versão sem este controle não constitui roteamento por versão.


## Ensaio HTTP e pacote para a tela

O launcher `scripts/ci/test-material-production-native-sdk.mjs` exige Node24, API HTTP e banco PostgreSQL locais, chave anon/publicável e namespace sintético próprio. O fluxo invoca o produtor real de brief, o ato humano v2, o plano nativo, sua aprovação e o produtor material. O writer v2 já encerra o job de proposta; o ensaio verifica `succeeded` e não chama `complete` uma segunda vez. As fontes e os fatos do bootstrap histórico estão identificados como fixture; não comprovam uma jornada 3X.

Antes de aprovar cada brief próprio, o ator humano configura `allowed` por RPC pública e declara autoaprovação explicitamente no ato v2. Depois da primeira leitura física/basis do pacote, o ensaio retira temporariamente essa permissão por ato público (`forbidden`), comprova recusa 42501 e restaura `allowed` antes da revisão 3T. Não se presume política padrão proibida depois das aprovações de brief; nenhuma aprovação é inserida no bootstrap. No modo normal, o pacote atual v10 tem leitura física autenticada, aprovação/revogação pública 3T e projeção `activeApprovalReviewIds`, replay idempotente e negativa de replay após revogação. A revogação cancela o follow-up sem criar nova execução, release externa ou segunda produção. O janitor usa tickets/capabilities reais, confirma ausência física autenticada (404 explícito; 403 não é exclusão), apaga metadados via Storage e só então confirma o recibo. Tickets adicionais de brief tornados elegíveis pela revogação são admitidos apenas quando pertencem à mesma organização sintética; a contagem de materiais continua separada.

`MATERIAL_UI_FIXTURE=1` executa apenas o caso de sucesso e pausa depois de produzir/reter/ler o pacote, antes de qualquer aprovação, revogação ou purga. A conta humana é confirmada no Auth local e recebe senha aleatória somente de fixture. `MATERIAL_UI_FIXTURE_OUTPUT` aceita exclusivamente arquivo `.json` diretamente em `/private/tmp/`; sem essa variável, um nome aleatório é criado. O arquivo nasce com permissão 0600 e criação exclusiva, contém identidade/credencial local e IDs/fingerprints do pacote; stdout entrega somente seu caminho e os IDs públicos. A tela deve autenticar essa conta e realizar os atos públicos sobre o pacote original, sem fabricar receipt, corpo, licença ou revisão.

Enquanto o navegador usa o pacote, o processo mantém a saúde de retenção pela RPC real do janitor a cada 30 segundos. Não renova diretamente deadlines/recibos nem altera heartbeat no banco. SIGINT/SIGTERM encerra o launcher e seu filho. A fixture exige banco limpo: os namespaces determinísticos não são reutilizados nem apagados implicitamente.

O self-test verifica compiler v10, valor solicitado R$10 milhões, readiness interna, falha de compiler e guardas de alvo/ausência; ele não executa SQL nem HTTP. A evidência de Storage/Edge/3T só é emitida após a execução normal real. Não confundir compilação ou self-test com esse gate.

## Consumidor de produção

`capital-material-production-runtime.ts` classifica a execução pela RPC capability-bound `worker_read_material_production_dispatch_v1`. O servidor distingue `material` (aprovação/receita nativa), `plan` (precursor ou gatilho de estrutura confirmado), `legacy` (job anterior ao cutover sem vínculo nativo) e `case` (outras análises posteriores). Nenhum seletor de formulário ativa produção nativa. No modo `case`, o worker recusa produção material/plano sem dispatch; os writers antigos também permanecem fechados no SQL.

`processCaseAnalysisJob` preserva a prévia antes do classifier. Plano nativo passa pelo produtor SQL e não executa o engine. Material usa a recuperação física antes de qualquer leitura de contexto/catálogo; sem recuperação, executa o mesmo CaseEngine e callbacks originais sobre o contexto capturado, incluindo retrieval e configuração institucional entregues pelo produtor servidor. Sela abstenção da pesquisa externa antes de qualquer inferência quando não há publicação/licença fechada; não usa a saída do coletor antigo como fonte. O `material_reference_date` está no corpo capturado e vem da data UTC de criação do job, evitando que outro relógio altere o cálculo numa retomada pendente.

O resultado passa por `publicCaseState` e `buildCapitalMaterialCompilerBundle`; nenhuma fixture substitui o engine no consumidor. Um erro só vira diagnóstico terminal se carregar o relatório real validado do compiler, com status `failed`/`blocked`; falhas de autoridade/transporte não fabricam relatório. Terminal guarda reason/status efetivos, registra stage failed e encerra o job sem retry automático. Commit guarda somente o recibo nativo no resultado do job. O SQL commit/terminal não encerra o job, por isso o consumidor finaliza a fila explicitamente.

Provas locais: regressão case+runtime+producer+adapter, 34 testes Node24; worker TSC; classifier SQL rollback sobre plano e pacote produzidos pelos comandos reais, request original preservado, data capturada, capability errada, outro ator e revogação do sujeito humano. PostgreSQL local usa baseline UTF8, PG18 e interfaces Auth/Storage locais; não é prova HTTP. O launcher HTTP e a verificação de implantação permanecem gates distintos.
