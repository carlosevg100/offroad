# Etapa 20 / 3E: Proveniência das contribuições humanas

Incremento em validação, não concluído. O 3D anterior fechou na PR 840/main `d6cc9df9b7d2e814975e715ed69b5e7bca062061`, Quality main 36466173532 aprovada e web/worker nesse commit; completion externo em outputs/etapa-20-2026-09-27/ETAPA-20-3D-COMPLETION.md.

## Contrato implementado

O escritor `worker_apply_institutional_assumption_answer_v1` preserva assinatura e retorno, reforçando o próprio caminho existente. Toda nova candidata passa a gravar atomicamente uma linha privada imutável em `institutional_contribution_receipts`: organização, trabalho, sessão, job/sujeito, mensagem/autor, pedido e binding, resposta/fingerprint, configuração anterior por ID e hash, alvo/período/unidade, valores anterior e canônico, candidata/hash e hash da aplicação. O texto livre não é duplicado. O validador financeiro existente permanece; o valor canônico é reproduzido pelo banco a partir da resposta, e somente a alteração delimitada é aceita.

A ordem de autoridade usa o helper de captura já provado: contas, token, política, sessão/projeto/job, depois pai/pedido/binding/mensagem com NOWAIT. A lease é reavaliada por clock_timestamp após as inserções. Contenda explícita aborta a transação inteira e permite até três tentativas do mesmo comando; falha de autoridade, configuração obsoleta e entrega ambígua não recebem repetição automática.

Replay novo exige identidade completa da aplicação, pai exato e resposta/binding ainda válidos. Replay de candidata histórica sem receipt não cria um retroativamente. O comprovante demonstra apenas a transformação: não aprova configuração, não autoriza leitura, não declara fechamento das fontes e não libera artefato. O classificador anterior permanece unresolved para contribuições. Importações e o resolvedor de ancestralidade pertencem aos próximos incrementos da etapa 20; etapa 21 não iniciada.

## Segurança e eval

Controles APP-02/03/04/09/11, DATA-02/03/12. FORCE RLS, quatro políticas negativas, ausência de grants diretos inclusive service_role, FKs compostas com organização, imutabilidade de update/delete/truncate, updated_at e auditoria de metadados. Nenhum backfill ou dado de cliente criado.

Revisão independente de desenho e código realizada. O revisor confirmou a escolha de fortalecer v1 e corrigiu o teste de expiração para medir passagem real do relógio, sem alterar lease depois de lida. Staging recebeu a migração `20260928202018`; novos contratos SQL e `institutional_assumption_answers` passaram sob rollback. Casos: hash/autor/alvo/período/pai/alteração fora da premissa negados; replay exato; aplicação adulterada negada; candidata e receipt revertidos quando a lease expira; receipt imutável; replay legado sem backfill; alteração de mensagem negada; binding continua imutável; replay após aprovação conserva pai.

Worker: 51 testes direcionados passaram (quatro casos novos de retry/rejeição). Sete corridas reais estão ligadas à CI: publicação concorrente, revogação antes/depois, suspensão antes/depois, contenda na mensagem e no binding. Gate local completo aprovado (930 testes worker, 1.035 web, 44 tarefas por fase). Sete corridas aprovadas na CI 36479713715, com os contratos SQL e 95 corpos efetivos. O preflight recusou corretamente a migração ainda sem registro no inventário/recibo de produção do commit; nenhum gate foi dispensado. Migração em produção `20260928203811`, SQL SHA-256 `f6215af699908128895d0d592ea5f311634ad7a63301d37e691fb32751e0a0a1`, definição do escritor idêntica à de staging. Catálogos: produção 2.807 objetos e 411 versões; staging 2.868 e 425. Nove objetos novos e zero drift nos demais por ambiente. Checkers de inventário/histórico aprovados (18+5 testes); tipos regenerados de produção equivalentes, sem mudança de API. CI final, merge e deployments ainda pendentes. Nenhum resultado pendente conta como PASS.

## Limites e rollback

História desconhecida permanece desconhecida. A prova de transformação não supre direitos atuais nem a prova das fontes ancestrais; o corte integrado fará essa composição. A alteração é compatível com o cliente antigo: rollback de imagem preserva os novos controles no banco, embora a imagem anterior possa tratar contenda como falha transitória do job em vez de repetir o comando imediatamente. Não remover receipt nem enfraquecer validação para acomodar rollback. Sem nova decisão do fundador neste incremento.

## Conferência de produção

Em 28/09 às 20:40 UTC: FORCE RLS ativo, quatro políticas negativas; anon, authenticated e service_role sem acesso direto à tabela; anon sem EXECUTE no escritor. Nenhum receipt ou fixture criado; 133 revisões preservadas. A definição de liberação permanece idêntica (MD5 de pg_get_functiondef `c4b6a8c3730c2de36392023c571b73b2`). Auditoria usa somente operation. Advisors de segurança: zero apontamentos nos dois ambientes. Os avisos informativos de [índices ainda sem uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) são esperados na tabela nova e vazia; os índices sustentam FKs e serão preservados.
