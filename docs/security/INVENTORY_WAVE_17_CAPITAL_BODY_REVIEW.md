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

Revisão independente de SQL/worker/SDK encerrou os achados conhecidos: guard
final de clock após montagem do DTO, menor prazo operacional do pai público,
retry limitado e ausência de bloqueio global por wakes de outro cliente. SQL
candidato e setup/cleanup passaram em staging com rollback; o SDK real passou
roundtrip, recibo server-bound, replay e negação. A fixture SDK teve os dois corpos
fisicamente eliminados e os metadados sintéticos removidos de staging.

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
