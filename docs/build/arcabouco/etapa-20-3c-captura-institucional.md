# Etapa 20 / 3C: insumos realmente entregues ao produtor institucional

Status: implementação e staging verificados; CI, produção e deployments pendentes. Não é fechamento da etapa 20.

## Contrato

`private.institutional_input_snapshots` registra o corpo exato devolvido pelo loader, hash, organização, trabalho, sessão, sujeito, job e pedido. `institutional_input_source_links` fixa a versão de direito de cada fonte entregue, incluindo fontes não citadas. `institutional_result_input_bindings` liga atomicamente o resultado à captura. Nenhuma tabela é legível ou gravável por anon, authenticated ou service_role; quatro políticas negativas, FORCE RLS, histórico imutável e audit só com operação/identidade. Não há corpo financeiro em logs.

`worker_load_institutional_model_context_v2` só captura um pedido de resultado queued. Setup e case-analysis conservam o contrato anterior; um resultado legado concluído não recebe história retrospectiva. Retry devolve o corpo original depois de revalidar direitos; status terminal é envelope do pedido, sem alterar o corpo/hash capturado. Versão canônica confronta ID, `legacy_document_version` e SHA declarado, não o ordinal lógico `version_no`.

`worker_record_institutional_model_result_v2` exige ID e hash, vincula todos os cenários exportados a configurações presentes na captura e conserva o validador econômico anterior em helper privado sem grant. O worker atual calcula apenas a configuração mais recente: o histórico de aprovações não vira comparação implícita. v1 continua somente para jobs sem captura; após captura, tanto loader quanto writer v1 negam. O guard do core confere a captura também dentro do lock do resultado. O índice único `processing_jobs_agent_message_idx` impede dois jobs institucionais para o mesmo pedido/organização.

Ordem estreita: contas ordenadas, token, política compartilhada, sessão/projeto/job com NOWAIT, capacidade e revisão de autoridade; resultado v2 também NOWAIT. Evita espera inversa com escritores humanos e antigos. `40001/institutional_capture_retry` causa até três tentativas do mesmo RPC; só esse erro tipado devolve o job à fila com intervalo de dois segundos, sem mensagem terminal. Demais recusas não viram fallback nem retry automático. Direitos e lease são verificados novamente depois da persistência: expiração durante projeção desfaz tudo.

## Rollout e legado

Migração primeiro, worker depois, exigindo `institutional-input-snapshot.v1`. Imagens antigas aceitam a capacidade adicional; trabalhos antigos não são reinterpretados como capturados. Se uma imagem antiga retomar um job já capturado, o banco nega downgrade. Reversão do worker exige imagem que entenda v2 ou contenção dos jobs capturados; não remover as tabelas nem seus guards.

O v1 permanece sob responsabilidade da engenharia desta etapa, para retirada no corte integrado da etapa 20, depois da conexão do produtor, fechamento comprovado das fontes e leitores. Nenhuma rota ganha liberação por existir captura. A captura não prova a cadeia histórica de contribuições/importações: fontes fechadas, recibos e revisão continuam nos incrementos seguintes da mesma etapa, sem afirmar completude a partir de uma configuração inicial.

## Verificação

- Worker: transporte exato de pin, ausência/formato inválido, resultado e blocker, replay legado sem captura, RPC v2 sem fallback, retry apenas da recusa atômica específica, fila sem falha de conversa.
- `institutional_input_snapshots.sql`: contexto/retry exatos, configuração desconhecida, hash/ID trocados, imutabilidade e acesso privado, direito fixado vencido mesmo com licença atual estendida, revogação de fonte não citada, expiração durante persistência com rollback, resultado único, bloqueio de downgrade e unicidade do job.
- `institutional_setup_lifecycle.sql`: caminho v1 anterior continua passando; fixture sintética compartilhada, sem desativar validadores produtivos.
- `test-institutional-capture-concurrency.py`: oito intercalações reais, com barreira e espera observada ou NOWAIT comprovado; somente banco descartável localhost da CI. Repetição de captura/resultado, revogação nas duas ordens, suspensão nas duas ordens, contenda do projeto e tentativa de downgrade.
- `rls_non_interference.sql`: grants e políticas das três tabelas e helpers privados.

Revisão independente detectou guard pré-lock e vencimento durante persistência; ambos corrigidos antes de staging. Controles APP-02/03/04/09/11, DATA-02/03/07/12, IAM-07/12. Sem provedor/modelo novo, gasto novo, ativação de cliente ou mudança de conteúdo profissional. Documentação Supabase consultada em 28/09: grants/RLS e changelog PostgreSQL 15.19/17.11; a alteração de pgcrypto citada trata cifras PGP antigas, não digest SHA-256 utilizado aqui.
