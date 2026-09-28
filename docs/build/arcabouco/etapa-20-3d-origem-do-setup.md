# Etapa 20 / 3D: origem prospectiva da configuração institucional

Status: implementado, testado e aplicado nos dois ambientes; CI final, merge e deployments ainda pendentes. Não é conclusão da etapa 20.

## Problema e contrato

A configuração inicial guardava a submissão e as fontes declaradas, mas não o contexto completo entregue à conciliação. O incremento 3C fixa os insumos do cálculo posterior e não reconstrói esse passo anterior. Agora o loader v3 captura o contexto de setup antes da construção da candidata. `institutional_setup_input_snapshots`, `institutional_setup_source_links` e `institutional_setup_input_bindings` preservam corpo, hash, job, trabalho, sujeito, submissão e o vínculo atômico da avaliação/candidata. A captura inclui fonte entregue e não citada. Versão canônica confronta organização, ID, versão documental e SHA declarados.

O writer `worker_record_initial_institutional_candidate_v2` exige o pin do loader. O núcleo privado conserva o validador econômico anterior, com guard dentro do lock da submissão: writer v1 não pode escrever depois da captura, nem pelo job nem pela identidade da submissão. Loader v1/v2 também negam downgrade. Não se registra captura no writer, depois do cálculo. Resultado ausente continua ausente: avaliações de falta de dados e bloqueio recebem vínculo sem fabricar configuração.

Retry conserva o corpo original e revalida direitos atuais e fixados; alterações no contexto vivo não são substituídas no snapshot nem passam pelo validador. A ordem estreita de locks de 3C, NOWAIT e retry tipado foi preservada. A verificação final de lease e direitos desfaz candidata e vínculo se o prazo vencer durante a gravação. Tabelas privadas têm FORCE RLS, quatro políticas negativas, grants revogados inclusive do service_role, imutabilidade e auditoria sem conteúdo financeiro.

Setup legado já avaliado devolve somente seu desfecho e, se necessário, a base mínima das perguntas pendentes (fingerprint da configuração e pares targetPath/code). Não devolve o detail das lacunas. O worker pode repetir idempotentemente a sincronização das perguntas sem recalcular a avaliação e sem inventar captura histórica. A assinatura do gerador de perguntas foi ampliada apenas em tipos para aceitar essa projeção; sua implementação e o cálculo financeiro não mudaram.

## Limite da classificação

`institutional_configuration_capture_state_v1` é um classificador privado de integridade, sem grant a clientes. Não é autorização, aprovação, prova de direito atual, recibo de fechamento ou regra de liberação. `captured_root` só significa configuração inicial sem pai, com contexto e vínculo prospectivos conferidos. Configuração inicial com pai recebe `parent_lineage_unclassified`; contribuição/importação recebe `contribution_lineage_unclassified`; histórica sem captura recebe `setup_capture_missing`. Não encerra cadeias desconhecidas nem tenta percorrê-las com limite silencioso. O consumidor de revisão, nos incrementos seguintes, precisa comprovar cada ligação e revalidar autoridade/fontes antes de qualquer uso.

## Rollout, riscos e retirada

Migração antes do worker. Novo worker exige `institutional-setup-input-snapshot.v1`; o anterior tolera capacidade adicional. Uma imagem anterior não pode retomar setup já capturado pelo caminho v1; rollback exige imagem compatível com v3/v2 ou contenção dos jobs capturados. Não remover histórico ou guards. O owner é a engenharia da etapa 20; v1 e leitores históricos são retirados no corte integrado depois das conexões de produtores/leitores. Nenhuma alteração de release ou de conteúdo profissional nesta PR.

Respostas e importações precisam dos seus próprios comprovantes e transformações verificadas; upload fingerprint enviado no payload não prova bytes autorizados. Configurações com pai não ganham independência pelo nome initial_configuration. Esses limites continuam no próximo incremento da etapa 20, antes de habilitar liberação. Etapas 21–24 não iniciadas.

## Verificação

- Worker: pin ausente/malformado, transporte exato, candidato real, replay legado, perguntas pendentes sem nova avaliação, replay de outra submissão negado e retry estritamente tipado.
- SQL: captura/retry exatos, writer sem captura negado, pin trocado negado, downgrade negado, imutabilidade, contexto alterado, fonte não citada revogada, expiração durante persistência com rollback, replay exato, sujeito estrangeiro negado e classificação restrita das origens.
- Regressão: setup v1 e captura dos resultados 3C conservam suas provas; RLS cobre tabelas e helpers novos.
- Concorrência: oito casos reais em duas sessões, na CI descartável, com espera observada ou aborto NOWAIT. Captura concorrente, revogação e suspensão nas duas ordens, contenda do projeto, gravação concorrente e downgrade.

Controles APP-02/03/04/09/11, DATA-02/03/07/12, IAM-07/12. Revisão independente pré-staging favorável após remover detail da projeção de replay. Supabase Functions e changelog consultados em 28/09; sem uso das cifras legadas de pgcrypto afetadas pela atualização publicada em 25/09. Sem nova conta/provedor, gasto, ativação de cliente ou dado descartável em produção.

### Evidência pré-promoção

Staging aplicado como `20260928174845`, SQL SHA-256 `cf2eee8567b9278f57bbacfa0659f65f246ada766587fc39af576b3d96d051a4`. Contratos `institutional_setup_input_snapshots`, `institutional_setup_lifecycle`, `institutional_input_snapshots` e `rls_non_interference` passaram em transações revertidas. Após os testes, as três tabelas novas continuam vazias. Advisor de segurança: zero apontamentos. O advisor de desempenho sugere índice integral para a FK `(organization_id,submission_id,snapshot_id)` do vínculo; `UNIQUE(organization_id,submission_id)` já limita a consulta a uma linha, por isso não se acrescenta índice redundante, decisão conferida na revisão independente.

A mudança de assinatura de tipo atualizou o hash da fonte e o manifesto corrente gerado. Locks, snapshots e bundles dos métodos publicados permanecem fixados; não se promove método novo para acomodar esta alteração. As provas concorrentes e de implantação são condições de fechamento, não presumidas por esta evidência.

`pnpm check` passou integralmente (44/44 tarefas em cada fase). Regressão adicional em staging confirmou que replay de falta de dados só retorna fingerprint e pares targetPath/code, sem detail, e que o banco nega pin com campo extra.

## Aplicação e evidências antes do merge

PR 840, preflight `9e872c1a`, CI `36462471183`, job de banco `109064205354`: todos os contratos SQL e as oito corridas de setup passaram antes da promoção. O gate de inventário desse commit ficou corretamente fechado porque ainda não trazia o recibo de produção. A atualização seguinte incorpora esse recibo real e precisa passar todos os gates novamente.

Produção aplicada como `20260928180833`, staging `20260928174845`; SHA-256 do arquivo coincide com os dois journals. Quinze definições conferidas iguais entre ambientes. Produção: 2.798 objetos e 410 versões; staging: 2.859 objetos e 424 versões; 34 objetos novos em cada, nenhum drift nos anteriores. Dezoito testes do checker de inventário e cinco do histórico passaram; 95 snapshots de funções e inventários dos dois ambientes passaram sem erros. Tipos regenerados de produção.

Security advisors: zero nos dois ambientes. EXPLAIN da FK do vínculo confirmou acesso indexado; índice adicional permanece redundante. O apontamento informativo pode ser consultado em https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys. As tabelas novas estão vazias; nenhum dado descartável ou backfill foi aplicado em produção. As 133 revisões anteriores e a definição de liberação permanecem intactas (MD5 de pg_get_functiondef: `c4b6a8c3730c2de36392023c571b73b2`).

Revisão independente pré-produção favorável no commit `9e872c1a`, incluindo a regeneração limitada do manifesto e a preservação de todos os pins publicados. Merge, CI integral e boot da imagem final com 26 capacidades continuam critérios de fechamento.
