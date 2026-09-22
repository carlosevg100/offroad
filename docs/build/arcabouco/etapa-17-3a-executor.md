# Etapa 17, incremento 3A: executor preservado de capital

O consumidor precisa encontrar exatamente o executor do manifesto. Esta primeira parte do incremento 3 instala e verifica esse artefato antes de abrir o novo caminho da fila. Não altera a ordem consumidor antes de produtor.

## Identidade e implementação

A publicação `prepare-capital-structure-decision-2026.09.21-v4` tem manifesto `2c023cf7b7ec7e35b7f59d363a9b287cb245d3196cd431fc0c2bf1fc937f8478` e fonte aprovada `82b8d0d3b930a6a128e716888f98ff6921a3cd51`. O binário instalado tem SHA-256 `e2ac1fd058314efb5b8f56e56e7987a9cb185e711a87f927306eb95baf9c8638`; seu snapshot é `2e2bc2e6f684388ee9433eab75d03d55870d2bf07fd5c02a7c59ea0985dce573`.

`capture-compiled-executor.mjs` captura fontes do commit aprovado, recusa pins divergentes e valida o build antes de gravar. `compiled-executor-lock.mjs` valida a composição publicada e o perfil derivado. `build-released-executors.mjs` reconstrói somente pelo grafo preservado. O checker `verify-published-method-lock.py` exige entradas append-only, ancestralidade em main e bytes de origem Git; uma entrada nova também confere as dependências contra a instalação congelada.

Escolha: ledger compilado separado para preservar o formato histórico de R01, com builder e registro de runtime compartilhados. O ledger não substitui aprovação editorial nem concede acesso. R01 conserva seu binário `25e7fb90c4dcb08f3550d4969762320e2a7592625cc15c8f0a61d6939610edb5`.

## Fontes de compilação e fontes de execução

Todos os arquivos próprios que contribuem bytes ao binário precisam estar nos 266 pins do executor publicado. Dois gerados transitivos são necessários somente ao parse: `capital-planning-policy.generated.ts` e `method-runtime-manifest.generated.ts`. Seus bytes vêm do mesmo commit aprovado e seus hashes ficam no ledger; ambos devem contribuir zero bytes à saída.

A anotação `sideEffects: false` se limita ao barrel fixado `method-runtime-manifest.ts`, cujos inicializadores de hash não são consumidos pelo procedimento. O rebuild preserva a semântica do compilador para imports nativos durante o parse, mas rejeita qualquer import externo final além de `node:crypto`. Não há permissão genérica para gerados ou acesso a filesystem no binário. A distinção entre parse e retenção segue a API oficial de [plugins do esbuild](https://esbuild.github.io/plugins/#resolve-results). Testes retiram a anotação e tentam reter filesystem: ambos são negados.

## Runtime e eval

`loadReleasedCapital` resolve identidade exata, confere SHA-256 do binário e rederiva o perfil do manifesto embalado a cada chamada, inclusive com módulo em cache. Os limites permanecem custo zero, zero chamadas, 31.000 ms e nenhuma concessão de execução. `main.ts` verifica capital e R01 antes do polling e registra `worker.pinned_executors_verified` com a contagem, sem payload de cliente.

Oito testes de empacotamento foram ligados à suíte já executada pela CI: rebuild idêntico; pins/dependências; arestas/anotações; manifesto/perfil; gerados sem influência; filesystem; reprodução dos 26 casos publicados; loader sem arquivo/adulteração após cache. Quatro testes novos do worker cobrem identidade, schemas, perfil e boot. As quatro regressões de empacotamento R01 permanecem. O teste dos gerados altera valores exportados, além de exigir rejeição pelo validador.

Revisão independente estática aprovada em 22/09/2026: fontes, closure, imports finais, R01, loader/cache e checker. O revisor leu código e logs; não executou CI nem conferiu deploy. Os comprovantes de CI, main, web e worker pertencem ao completion externo, sem confundir este documento com evidência antecipada.

## Limites e operação

Sem migração, backfill, grants ou mudança no journal. Nenhuma fixture ou chamada paga em produção. O consumidor operacional, lease/aborto, contabilidade durável, perfil operacional, proveniência integral dos inputs e envelope comum de R01 continuam no incremento 3. Disponibilidade do binário não comprova essas capacidades.

Rollback: retornar à imagem anterior; não há estado novo de banco. Artefato ausente ou adulterado impede boot, em vez de executar código atual silenciosamente. TRUST-APP-01, TRUST-AI-01 e TRUST-SDLC-01 cobrem as negativas e a cadeia de origem; engenharia de execução responde pelos riscos restantes antes de abrir o consumidor. Etapa 18 e ativação de clientes não são autorizadas por este incremento.
