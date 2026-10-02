Corte fechado provider_research/provider_case_fit

Snapshot: `/private/tmp/offroad-provider-cut-snapshot`, diretório comum preparado para publicação sobre `63956ef43ca1cba0dd361194bc685f2eb6a86a3c`. `PROVIDER-SNAPSHOT-FILES.json` contém os 31 caminhos alterados/adicionados/apagados e SHA256 dos arquivos existentes. A base inclui a correção legítima de helpers, os dois journals e o teste RLS; nenhum desses arquivos aparece na diferença provider. Manifests e entradas de autoridade dos consumidores permanecem byte a byte iguais à base. Sem worktree, operação Git ou remota. SQL provider continua pending, sem carimbo inventado.

As duas entradas reais `capital_project_analysis` usam `processNativeProviderJob` → `queue.consumeNativeProvider` → consumidor fechado. A receita captura o contexto antes do engine, retém bytes físicos, fixa brief/plano/fontes e executa M01/K01/K02 pelos engines determinísticos existentes. Não há chamada de modelo. Três TaskRuns, corpos retidos e revisões são vinculados atomicamente por SQL; CPA contém referência, e o leitor humano resolve a revisão física. Recuperação consulta identidade e bytes antes de captura/engine; negação, revogação, orçamento diferente de zero ou falta de licença encerram sem fallback aos loaders/writers históricos. O caminho legado de leitura permanece evidência histórica; o writer/finish/success de nova execução não é uma alternativa.

O corte inclui somente os módulos native-provider, a família SQL em `supabase/pending/capital_native_provider_consumption.sql`, testes, SDK, hooks main/queue e a hidratação específica no project page. Edge já contém os quatro kinds fechados necessários na base: native_provider_recipe/allocation/result/human. O snapshot conserva essa implementação, sem copiar assessment, preview, importação de workbook, catálogo adicional ou método novo.

Verificação local no snapshot:

- Worker/web e SDK: TypeScript passou.
- Projeção gerada de métodos recomposta pelo gerador verdadeiro após mudança prospectiva C11 no domínio: 5 testes focais passaram; documentos/evidências/cápsulas históricas preservados.
- 33 testes dos quatro módulos provider passaram, incluindo dez novos negativos nas duas entradas: ausência de consumidor, ausência de publicação, licença não resolvida, revogação e job negado não chamam loader/writer/finish/complete históricos.
- 12 testes do leitor humano passaram: bytes, cabeçalhos, identidade, hash e indisponibilidade sem fallback.
- SDK self-test passou: alvo local/anon, fingerprint de catálogo e reconhecimento estrito da ausência física; nenhuma operação SQL/HTTP.
- Installer descartável self-test passou: nega alvo remoto/ambíguo e instalação sem declaração explícita.

Os três testes SQL antigos `provider_research_persistence.sql`, `provider_research_public_catalog_v2.sql` e `provider_case_fit_persistence.sql` preservam criação, aprovação histórica explicitamente declarada, claim e validações de contexto existentes. Seus trechos que esperavam escrita/sucesso legado foram substituídos por negativos de writer/finish/complete, sem liberar o caminho retirado. A prova positiva nativa está nos testes novos e no SDK; esses três ajustes ainda exigem execução SQL conjunta na CI, não são declarados PASS local.

Publicação humana do catálogo

`nativeProviderCataloguePublication` é opcional no tipo da fila porque contexto v1 sem catálogo pode existir. Quando a receita fixa publicCatalog v2, o callback é obrigatório. Sem publicação configurada, o adapter retém o contexto e nega a finalização com `capital_native_catalog_publication_required`; não troca v2 por v1, não inventa fonte e não produz K02.

O hook de main lê `CAPITAL_NATIVE_PROVIDER_CATALOGUE_PUBLICATION_JSON` e fornece o callback somente se o envelope corresponder exatamente ao snapshot já publicado: deliveryKey, requestId, payload (URL/título/snippet/contentHash), physicalSnapshotSha256 e, opcionalmente, os quatro IDs de origem existentes. Esse envelope não concede direitos. `openCapitalPublicCaptureAdapter.deliver` e a finalização SQL conferem a publicação corrente, payload, grafo real de dependências, direitos, licença, binding e prazos. A publicação deve ser realizada por pessoa autorizada, usando SourceVersion/binding reais e `declare_public_source_reuse_v1` com prova e limites válidos; dependências reais usam `add_source_dependency_v1`. Só depois o operador configura o envelope. A fixture do SDK usa direitos sintéticos expressamente declarados para o stack descartável, sem afirmar licença comercial de sites reais. Não copiar essa fixture ou seus IDs/URLs à produção.

O runtime anterior informado pelo integrador não fornece o callback. Este corte acrescenta o hook, mas não afirma que a variável ou os direitos reais já existem em produção. Para catálogo v2 útil, faltam publicação humana legítima e configuração do envelope correspondente; isso é bloqueio concreto de uso desse catálogo, não um motivo para contornar a negação. Não é um ato reservado ao fundador: a pessoa publicadora deve ter a autoridade vigente.

Publicação e verificação restantes

1. No stack descartável da CI, após check-stage0, testes/SDKs canônicos e installer/SDKs consumidores 3R/S11/C11, instalar o único draft provider com `install-capital-provider-ci-draft.py`; declaração `OFFROAD_NATIVE_PROVIDER_DRAFT_INSTALL=isolated-loopback-ci` e DATABASE_URL loopback. Nenhuma escrita de journal.
2. Executar explicitamente os cinco testes provider em `supabase/tests/support`, incluindo os três negativos retirados da autoenumeração e capital_native_provider_recipe/results. A autoenumeração canônica permanece anterior a qualquer draft. Rodar SDK `--sql-contracts` para o grafo/licença do catálogo com snapshot real do pacote e rollback.
3. Executar SDK HTTP normal com Auth/Storage/Edge ativos. Ele exercita ambas as famílias, três resultados físicos, replay antes do engine, zero accepted/model, leitura humana, negação de download direto, conclusão real da fila, revogação de direitos, janitor com lease verdadeiro, DELETE SDK + INFO404 + ausência no catálogo e ACK/replay.
4. Após prova verde, o integrador transforma o draft aprovado em migração legítima, aplica pelos ambientes, publica os hooks e verifica produção. A base de entrada do SDK é aprovação histórica explicitamente declarada; ele comprova o corte físico prospectivo e não substitui a jornada humana completa 3X.

Nenhuma prova SQL/HTTP nova ou conclusão em produção é alegada nesta entrega. O bloqueio técnico restante é a prova conjunta CI/HTTP; o bloqueio de catálogo útil em produção é a publicação/configuração legítima acima. Não há dependência de 3W ou expansão dos 43 arquivos de preview.


Workflow candidato fechado

`.github/workflows/quality.yml` preserva o workflow consumidores vigente: primeiro autoenumeração SQL e inventário canônicos, depois M07/material, installer consumidores e SDKs S11/C11. Só depois instala provider, executa os cinco contratos em support, contrato SQL de catálogo e SDK HTTP, ainda com Edge ativo. Os três arquivos históricos foram removidos de supabase/tests e adicionados em support; os dois testes provider novos também ficam em support. O SDK --sql-contracts aponta para o novo caminho de capital_native_provider_recipe. Nenhum teste dependente do draft roda durante a validação do catálogo baseline.

Checker contra os exports reais fornecidos pelo integrador (HELPER-CATALOGUE-production/staging): PASS, respectivamente 3623 e 3684 objetos, zero erros/diferenças. Os JSONs antigos mantêm a data/origem histórica; nenhum export vivo foi fabricado.
