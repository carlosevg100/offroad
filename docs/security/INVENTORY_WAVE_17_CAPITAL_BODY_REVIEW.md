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
