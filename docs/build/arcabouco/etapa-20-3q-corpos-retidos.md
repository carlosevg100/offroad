# Etapa 20 / 3Q: serviço de corpos retidos

## Escopo e autoridade

Incremento aditivo após o contrato de resposta aceita. `capital-body-retention.ts`
retém dois tipos: `contribution_input`, originado de uma revisão imutável registrada
pelo comando humano de contribuição, e `gateway_accepted_output`, vinculado à
tentativa e ao recibo de input. Não ativa produtor, leitor histórico, material,
tarefa, revisão de artefato, confirmação ou release. O status `retained` comprova
somente o corpo armazenado e revalidado.

As tabelas privadas `capital_body_origins`, `capital_body_source_pins`,
`capital_body_invocation_inputs`, `capital_body_input_components`,
`capital_body_accepted_invocations` e `capital_body_bases` conservam identidades,
hashes e referências. `capital_body_retention_wakes` registra intenções duráveis
de reavaliação. `capital_public_payload_allocations` recebe um discriminante e
base tipada, preservando constraints e FKs. A leitura física anterior de payload público passa pelo mesmo transporte autenticado, com seu contrato de licença preservado.

O worker usa `worker_record_capital_body_input_v1`,
`worker_record_capital_body_accepted_v1`, `worker_prepare_capital_body_v1`,
`worker_commit_capital_body_v1` e `worker_read_capital_body_v1`. A leitura exige
o job original vivo, a conta autorizada, capability, lease, sujeito humano e
direitos atuais. Não concede leitura por membership ou pelo trabalho em comum.
O bucket privado `capital-input-capture` continua sem versionamento; eliminação
física passa pela API de Storage, seguida de confirmação de ausência e ACK.

## Integridade e retenção

O SQL retorna transitoriamente o texto canônico destinado ao upload. O worker
verifica tamanho e SHA-256 dos bytes exatos depois do download. O fingerprint
semântico `gateway-parsed-output.v1` é calculado separadamente pelo gateway;
não se confunde com SHA-256 de bytes nem com serialização JSONB do banco.

A origem conserva autor, canal e revisão reais, além dos direitos capturados e
atuais de fontes diretas e indiretas. Um aceite genérico de upload não cria
licença de fonte. Uma lista vazia de dependências não certifica que conteúdo é
livre de direitos de terceiros. Derivados herdam prazo e restrições dos pais.

Reavaliações pendentes bloqueiam somente a organização/origem afetada e sua
linhagem, inclusive um pai publicado por outra organização. A recusa transitória
usa `40001`; direito inválido usa `42501`. Wakes são append-only, com drenagem
limitada e idempotente, evitando inversão de travas entre revogação e expurgo.

## Verificação e publicação

O candidato SQL passou em staging com rollback. Testes de API física, SDK real,
concorrência, CI, journals, catálogo, advisors e implantação precisam passar
antes do completion. Testes com metadados sintéticos de Storage dentro de uma
transação SQL verificam o contrato e não comprovam upload, leitura ou eliminação
física. Nenhuma fixture é admitida em produção.

O rollback operacional mantém os produtores desconectados e desativa nova
admissão pela política existente quando necessário, preservando o purger.
Migração aplicada não será editada: correção posterior exige migração forward.

## Riscos com destino

- A contribuição canônica histórica permanece imutável. Expurgar este corpo não
  apaga texto anteriormente registrado em `contribution_revisions.content`.
  Integração M07 elimina novas cópias permanentes; propagação legada é da etapa 22.
- Fallback após tentativa negada antes do envio não tem recibo de input. O corte
  M07 acrescenta ledger de decisão sem conteúdo, vinculando a tentativa negada
  ou admitida ao fallback legítimo, sem fabricar recibo de envio.
- A elegibilidade atual do provedor ainda não incorpora todas as novas origens.
  O corte M07 compõe limites capturados/atuais e pais retidos para cada rota,
  usando a menor retenção autorizada. Este serviço não ativa egress novo.
- Receita completa e componentes privados precisam ser reconstruídos pelo
  builder comum antes de ligar M07. Um gancho que conhece apenas hashes não prova
  que todos os componentes foram usados.

Etapa 20 permanece aberta. Etapas 21 a 24 aguardam OK da próxima onda.

## Transporte de leitura e correção do cache

A prova em staging encontrou GET direto servindo200 após revogação da fonte na mesma URL/JWT, enquanto uma URL nova recebia400. No-store ou nonce não comprovam revogação de uma URL já conhecida. Por decisão do fundador de01/10/2026, o CTO escolhe e executa a correção técnica nesta onda.

`supabase/functions/capital-body-read/index.ts` serve exclusivamente POST, com validação Auth, workspace/job/capability e body estrito contendo allocationId e kind. O servidor obtém path, identidade, versão, tamanho, SHA e prazos pelos comandos `worker_read_capital_body_allocation_v1` ou `worker_read_capital_public_payload_allocation_v1`, executados com o JWT autenticado do solicitante. Recupera e verifica os bytes com credencial interna de Storage e repete a autorização antes de liberar a resposta. Nenhum path, versão ou hash enviado pelo solicitante concede acesso. Buffers e duração são limitados. Não cria URL assinada, download GET nem fallback.

A credencial privilegiada padrão do runtime Supabase existe somente na entrada Edge para a leitura interna de Storage. Não é entregue a web, worker, cliente, manifestos de teste ou logs. A autoridade permanece nos RPCs sob JWT do solicitante, antes e depois dos bytes. A função não oferece operações administrativas genéricas; esta fronteira restrita e o uso da credencial são objeto de testes negativos e revisão independente.

A migração forward fecha GET/info/HEAD/sign diretos de ambos os tipos no bucket, exige job/capability por upload e preserva o purger independente, seu lease e a comprovação de ausência física. Rollout exige zero objetos/alocações anteriores em produção ou invalidação física comprovada antes da ativação; mudar RLS sozinho não invalida cache antigo.

Gates adicionais: função real no runtimeDeno; mesmo endpointPOST/JWT antes e após revogação; GET/info/HEAD/sign negados ao job correto; capability errada/outrojob; revogação entre os dois gates; metadados/versão/SHA/tamanho incorretos; teste de expurgo. CI sobe a função com verificaçãoJWT ativa e só aceita readiness do handler real.
