# Etapa 23: retirada de caminhos antigos

Autorizada pelo fundador em 6 de outubro de 2026 após a etapa 22 concluída na main `9732563b3a8c8172139bfa8b43de9eafdf5a9508`. Este registro descreve o incremento; conclusão exige CI, journals, catálogo e publicação no mesmo commit.

## Autoridade única e compatibilidade

Nove assinaturas públicas antigas dos loaders de agente e projeto passam pelo adaptador `private.worker_load_compatibility_context_v1`. A leitura chega aos loaders atuais v5 e v6, com capacidade e autoridade de job atuais. As recusas dos leitores R01 anteriores e a projeção limitada do v4 permanecem. As implementações antigas privadas e os helpers `before` ficam sem EXECUTE para os papéis da Data API. Dependências internas do loader atual são preservadas. Não há DROP inferido de contadores zerados: `track_functions=none` em produção torna esses contadores inadequados para provar desuso ou cobrir consumidores agendados.

Metodologia histórica continua como candidato ligado a `method_releases`, sujeito ao cofre. Não há publicação por `reviewed` informado pelo cliente, retorno do ranking como autoridade, nem snapshot accepted como prova de método publicado. Os testes existentes de metodologia, R01 e leitura sem cargo permanecem nos gates.

## Modelos, logos e distribuição congelada

Modelos organizacionais têm leitura/autoria por política explícita do cofre. Modelos de projeto mantêm acesso por recurso. A mesma autorização governa o DTO de contexto e a leitura por versão. Storage não abre logos por membership; o caminho precisa estar registrado numa versão de modelo e permitido ao leitor. Um worker necessita lease vigente, autoridade e direitos atuais e o caminho registrado, além da validação de bytes no renderer. O worker Office conserva sua autorização de tarefa e versão específica.

O DTO projeta permissões de autoria separadas por organização e projeto. A tela oferece somente os escopos autorizados; uma flag administrativa histórica sem essas permissões não abre o editor. A fixture institucional concede trabalho no cofre pelo RPC real de acesso, em vez de presumir poder de autoria por cargo.

As oito tabelas e funções de distribuição exclusiva de staging recebem revogação dos papéis da Data API. As duas políticas de leitura por membership são retiradas. A migração condicional não cria esses objetos em produção ou no replay. Dados, triggers estruturais e migrações históricas permanecem; intercâmbio entre organizações aguarda escopo próprio.

## Runtime e leitores históricos

O worker recusa claims e turnos de preview técnico antes de contexto, pesquisa e gateway. O roteador histórico permanece somente em `apps/document-worker/src/testing/preview-agent-turn.ts`, injetado explicitamente pelos testes. O dispatcher universal de fixture também foi movido para testing; nenhum entrypoint de produção importa esses módulos. O adaptador especializado R01 reconstrói o execution profile da mesma publicação fixada usada pelo dispatch comum, sem latest-version fallback ou recálculo financeiro adicional.

A web retira o banner e o status experimental. A rota histórica de material continua como adaptador para revisão e recibo atuais: a permissão de preview deixa de atuar como leitura. Os caminhos técnicos, fixtures e bibliotecas de fechamento/monitoramento são preservados para seus testes ou futuro escopo; não entram no caminho de execução liberado.

## Gates e prevenção de novos atalhos

`supabase/tests/no_legacy_access_bypass.sql` verifica permissões reais, adaptadores, políticas de conteúdo, candidatos e leitor de logo. `client_presentation_templates.sql` cobre registro exato, leitura autorizada e revogação no Storage/DTO, com fixtures próprias e rollback. O checker de etapa 0 já confronta todas as assinaturas, políticas e grants com replay real e todas as versões com o journal de produção.

`scripts/ci/check-framework-surface.py` complementa esse gate com 129 consumidores/entrypoints existentes, hashes de fonte, decisões e referências de testes negativos. Nova rota, novo RPC ou fonte alterada exige revisão; referências ausentes ou classificação sem teste falham. Import de módulo técnico por produção e barreira de preview removida/tardia falham. O manifesto não é regenerado pela CI: as decisões são um ato explícito de revisão. A existência de uma referência de teste não prova resultado; o resultado pertence ao run real da CI. As nove mutações do checker também rodam na CI.

## Limites de fechamento

Sem ensaio de produto, conexão externa, Office nativo, Temporal novo ou limpeza de dados de clientes. Nenhuma fixture de produção. A restauração de um consumidor antigo só pode usar um adaptador do contrato atual, nunca restaurar grants/predicados antigos. A etapa 24 permanece fora desta autorização.
