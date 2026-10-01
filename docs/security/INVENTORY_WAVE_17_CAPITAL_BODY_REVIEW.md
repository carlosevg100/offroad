# Revisão material: corpos retidos na etapa 20 / 3Q

A abertura wave-17 e seu snapshot histórico permanecem intactos. Esta revisão
registra a mudança aditiva sobre main `69eedd46aee6ac9716bc13093d8f5c009113fcd0`.
TRUST-ID-01, TRUST-DATA-01, TRUST-APP-01, TRUST-AI-01 e TRUST-SDLC-01:
autorização corrente no banco, Storage privado, retenção finita, integridade dos
bytes e promoção condicionada à evidência. Mappings seguem internos; nenhuma
certificação ou cobertura universal é declarada.

## Fluxo e classes

Uma revisão de contribuição criada pelo comando humano dá origem a um corpo
privado; não transforma clickwrap em licença de terceiro. A resposta aceita é
vinculada ao job original, tentativa, recibo de input e componentes exatos.
Dados financeiros/texto existem no bucket privado com prazo; novas tabelas e
auditoria conservam referências, hashes e pinos. Logs e erros do adapter não
exibem corpos, tokens, mensagens SQL brutas ou valores. Não há novo egress,
produtor ativado, material nativo, histórico de cliente ou release.

As sete tabelas privadas têm FORCE RLS, políticas de negação e nenhum grant
direto para anon/authenticated/service_role. Helpers privados têm search_path
vazio; somente comandos worker documentados são concedidos a authenticated,
revalidando identidade, autorização humana, conta de execução, capability e lease.
O caminho anterior de payload público preserva sua licença e seu discriminante.

## Abusos e controles

Negativos exigidos: outro tenant/job, capability incorreta, conta reassociada,
lease vencido, sujeito suspenso, fonte/pai revogado, processo negado, direito
capturado inválido, fonte indireta alterada, ciclo, lista/URL assinada, tamanho,
versão e SHA incorretos, bytes diferentes para o mesmo JSON, input/aceite sem
vínculo, replay com mudança e acesso direto às tabelas.

Prazo do derivado é o mínimo de política, direitos capturados/atuais e prazo
operacional do pai. Wakes append-only evitam inversão de travas; drenagem limitada
preserva uma intenção não processada. A recusa transitória é scoped à origem e à
linhagem, inclusive à organização publicadora. O adapter repete somente a mesma
RPC em SQLSTATE40001, no máximo três vezes; não repete envio ao modelo.

Storage recebe bytes pela API e exige readback, tamanho, identidade, versão e
SHA-256. Fingerprint semântico JS é separado do hash físico. Expurgo exige DELETE,
ausência física genuína e ACK; 403 não prova eliminação. Metadados SQL sintéticos
em teste transacional não substituem essa prova.

## Evidência e limites

Revisão independente de SQL/worker/SDK conferiu as correções de guard
final de clock após montagem do DTO, menor prazo operacional do pai público,
retry limitado e ausência de bloqueio global por wakes de outro cliente. SQL
candidato e setup/cleanup passaram em staging com rollback; o SDK real passou
roundtrip, recibo server-bound, replay e negação. Na execução SDK anterior, os dois corpos
foram fisicamente eliminados e os metadados sintéticos removidos de staging;
essa limpeza não comprova a limpeza da fixture HTTP final em validação.

O eval HTTP encontrou um achado adicional: a conta de execução ainda podia fazer
GET direto com header de capability errado, apesar da negação correta da RPC.
O incremento exige barreira de job/capability no Storage, em migração forward;
a negação real precisa passar antes da produção. A revisão estática não substitui
a prova desse caminho.

Concorrência remota pela ferramenta MCP foi rejeitada como evidência: as chamadas
foram serializadas. A CI verifica corridas por conexões diretas e sessões
observadas. HTTP completo de staging, CI, catálogo/journals, advisors e deploys
continuam gates obrigatórios antes do completion. Fixture sempre isolada e
sintética, nunca em produção; manifesto de runtime 0600 fora do repositório.

Riscos da integração estão atribuídos ao corte M07 e à etapa 22 em
`docs/build/arcabouco/etapa-20-3q-corpos-retidos.md`: ledger de tentativa negada,
eligibilidade por novas origens, receita completa e texto canônico legado.
Rollback operacional desconecta novos consumidores e fecha admissão pela política
existente, preservando expurgo. SQL aplicado exige correção forward.

## Correção de transporte autorizada em01/10/2026

A reprodução adicional demonstrou mesma URL/JWT200 após revogação e URL nova400; o cache Cloudflare podia ignorar o gate de origem. A correção migra ambas as famílias de capital-input-capture para POST autenticado no servidor e fecha leituras diretas, inclusive para o job legítimo. Upload exige identidade exata por pedido; purger mantém somente suas operações com lease. Credential privilegiada padrão somente no runtimeEdge, nunca no worker/web/cliente. RPC sob JWT do solicitante antes e depois dos bytes, paths SQL-derived, SHA/size/version fixados, limites de buffer/tempo, sem conteúdo ou credenciais nos logs. Revisão independente não encontrou atalhos nos arquivos; confirmação remota permanece gate.

Journal staging da nova barreira: `20261001185956 capital_body_server_read_boundary`, arquivo candidato `20261001184027`; SQL congelado após aplicação. Ambas suítes SQL passaram em staging com rollback antes da aplicação. A função Edge versão 3 foi publicada em staging com verificação JWT ativa. O erro inicial de configuração foi corrigido: built-ins modernos `SUPABASE_PUBLISHABLE_KEYS['default']` e `SUPABASE_SECRET_KEYS['default']` são preferidos, com fallback legacy explícito; secret moderno é somente apikey, nunca Bearer. Diagnósticos de configuração são códigos fixos, sem valores. Credencial privilegiada não chega a web, worker, manifestos ou logs.

SDK real Node24 em staging passou 14 verificações. Gate local final passou com exit 0 e quatro fases 44/44; worker 1049/gateway 180/web 1209 PASS. Handler cobre Auth/user e subject exato, tenant/job/cap, pinos antes/depois, buffer 1MiB, duração total 10s, redirects negados e respostas no-store. Upload público usa headers imutáveis por chamada; consumers typed/public não oferecem fallback GET/info. Retry de autoridade é somente SQL40001, mesma RPC/args até três tentativas; negação 42501 e transporte não repetem nem reenviam modelo.

A prova HTTP remota final passou quatro fases, incluindo bytes/corrupção de mesmo tamanho, POST/readback/replay/direct-denial, pai público com herança e negação de outro job/anon. Depois houve timeout na ponte de metadados. Isso não constitui PASS da suíte HTTP completa. Corridas reais, CI final e publicação permanecem gates abertos. Produção permanece intocada no baseline `69eedd46`; zero objetos/alocações já foram conferidos pelo root, mas nova conferência antes do rollout é obrigatória. Main remoto atual só usa o adapter no purger; não há produtor retain/read ativo. Fechar admissão pelo controle existente durante rollout, preservando expurgo; se aparecer objeto anterior, parar e reconciliar/purgar por contrato legítimo antes da barreira. RLS sozinho não invalida cache antigo. Etapa 20/3Q aberta, sem promoção nativa ou release.

## 2026-10-01: prova HTTP final e bloqueio de publicação

Após corrigir apenas o timeout e a ordem da ponte de avaliação, a suíte HTTP hospedada encerrou com exit 0 e oito fases PASS, conforme conferência do executor principal. Inclui negação após revogação usando a mesma URL e JWT, e a cadeia completa de expurgo: DELETE físico, INFO 404, ACK e catálogo com zero objetos. A falha histórica de timeout acima fica preservada como evidência da execução anterior; ela foi superada nesta nova execução, sem alterar o SQL instalado ou enfraquecer negativos.

A limpeza SQL foi restrita às fixtures da avaliação e passou. A verificação agregada confirmou zero organizações e usuários sintéticos, alocações e objetos. O controle de retenção mantém o baseline anterior: enabled=true, política d7ae… e updated_at de 2026-09-30. Arquivos temporários de credenciais, ponte e pedidos foram removidos. Edge staging versão 3 e SDK real com 14 checks PASS permanecem evidências válidas. Gate local final em /tmp/offroad-body-server-candidate-final-check.log encerrou exit 0: lint/typecheck/test/build 44/44; worker 1049, gateway 180, web 1209 PASS.

O candidato foi registrado no commit local 487cc047. A publicação na branch feat/capital-body-retention do repositório público carlosevg100/offroad foi rejeitada pela revisão automática, que exige consentimento humano específico para expor o conteúdo novo, mesmo após conferir o destino canônico e a permissão ADMIN. O pedido de consentimento está pendente; não houve push, dispatch ou contorno. CI final, corridas reais, merge, migrações de produção e deploys continuam abertos. Produção permanece no baseline 69eedd46, etapa 20/3Q aberta e etapas 21–24 aguardam OK de onda. A prova HTTP completa não equivale a completion da etapa.

## 2026-10-01: aplicação em produção e preparação do merge

Consentimento específico de publicação recebido do fundador; candidato 12f36a09 publicado na branch canônica. Quality 36923661251 passou os testes funcionais do banco/HTTP/SDK/corridas e o check local da CI; o inventário anterior recusou os carimbos então pendentes, como esperado. E2E estava em execução na conferência. Novo gate completo da branch reconciliada ainda precisa passar antes do merge.

Produção recebeu o SQL exato das três migrações, com MD5 conferido pelo executor principal: 20261001205206_capital_body_retention.sql, 20261001205251_typedbody_storage_job_authority.sql e 20261001205326_capital_body_server_read_boundary.sql. Arquivos foram renomeados para esses carimbos, sem reaplicar SQL de staging nem alterar carimbos anteriores. Edge capital-body-read versão 1 está ACTIVE em produção, JWT ativo e SHA de fonte igual ao repositório. POST anônimo válido negou 403/no-store e RPC anônima negou acesso; nenhuma fixture foi criada em produção.

Catálogos/journals e decisões foram reconciliados: produção 3051 objetos, staging 3112, zero erros nos dois checkers; 42 políticas/triggers dinâmicos têm âncoras explícitas. Os 18 testes unitários do checker passaram. Tipos web foram regenerados da produção (+127 linhas). A admissão em produção permanece suspensa (enabled=false), com estado anterior true e política 485402d6… preservados para restauração CAS somente pelo executor principal após deploy no commit exato. Não restaurar controles nesta preparação.

Merge, CI final reconciliada, web e worker no commit mesclado e verificação final continuam pendentes. Produção recebeu DDL/Edge, mas o incremento não tem completion. Etapa 20/3Q permanece aberta; sem ativação M07, recuperação histórica, seal ou release, e sem início das etapas 21–24.

## 2026-10-01: transporte de autoridade por tentativa na mesma onda

Baseline publicada fdf209a2: serviço de corpos/POST, três journals de produção, HTTP/SDK/races, CI main, web, ECS510 e boot/23 artefatos verificados; admissão original restaurada. Registros anteriores de pendência são históricos.

Delta material desta revisão de onda: GatewayAttempt imutável com hashes efetivos e linhagem, identity decisionId SQL preservada no worker, projeções explícitas e schemas fechados atualizados. TRUST-AI-01/TRUST-SDLC-01: não incluir conteúdo no DTO/log, não permitir callback mudar hashes, não fabricar recibo para negativa, não confundir ID de decisão de rota com vínculo de receita. Sem alteração de grants/RLS, DDL, credenciais, egress, endpoints ou controles de retenção. A revisão segue a cadência da onda e se renova quando houver mudança material, sem janela artificial de sete dias.

Novos negativos e regressões estão em attempt-authority.test.ts, provider-processing.test.ts e model-call-log.test.ts. O próximo incremento SQL ainda deve fechar ledger/inputv2, menor prazo ancestral por recurso e antialtaho v1; este transporte não afirma essas garantias. Gate Node24 quatro fases44/44 e revisão independente passaram. CI, merge e deploy continuam necessários ao completion.
