# Etapa 20 / 3H: projeção institucional nativa atômica

Status: em verificação; não concluído nem aplicado nos ambientes. Etapa 20 autorizada; 21–24 não iniciadas.

O worker usa `worker_record_institutional_model_result_v3`: grava o resultado pelo contrato v2, fecha todas as fontes sob a autoridade do job e cria a revisão nativa, binding e comprovante ancestral na mesma transação. Repete o fechamento depois dos writes; mudança recusa e desfaz toda a operação. Origem não comprovada conserva o resultado legado e retorna `nativeProjection.ineligible`, registrado pelo worker, sem fabricar revisão/prova histórica.

`private.institutional_native_bindings` identifica a nova representação de forma imutável e sem grants de cliente. Preserva o JSON de fechamento e todos os pares versão/direito. Manifesto e dependências conservam múltiplas licenças por fonte; link sem licença é recusado quando ambíguo. Adaptadores de domínio deixam de sobrescrever uma licença pela outra. Conteúdo nativo mantém envelope completo, todos os cenários e os recibos dos dois idiomas; não afirma ter gerado bytes novos.

A nova revisão permanece interna. Derivado externo permanece bloqueado mesmo se mudar o nome do produtor. Essa interdição usa binding persistido e ancestralidade; não modifica retrospectivamente a liberação das revisões legadas. O corte global para aprovação humana exata segue no incremento integrado da etapa 20.

O leitor da nova revisão, ancestral legado comprovado e derivados revalida licenças fixadas e correntes, prazos e acesso ao trabalho. Adquire conta com SHARE NOWAIT e política compartilhada antes da avaliação; revogador espera ou a leitura enxerga a recusa, e conflito de conta nega conteúdo sem espera inversa. Expiração é conferida ao final mesmo sem transação concorrente. Nenhuma licença atual mais ampla substitui o pin.

Verificação realizada: contrato SQL sob rollback em staging (inclui injeção de falha final e rollback do resultado ainda queued, bindings e revisões; perda zero de conteúdo; replay; pares múltiplos; link ambíguo; origem sem prova; derivado externo; expiração fixada apesar de licença atual ampliada, nos três caminhos de leitura). Testes TS focados e typecheck passaram. Concorrência real de oito cenários registrada em Quality; resultado ainda pendente. Gate local completo, revisão independente final, CI, migrações/journals/catálogos e deploys ainda necessários.

Revisão independente identificou corrida entre avaliação de fontes e revogação no leitor inicial; corrigida antes de qualquer aplicação. Testes de duas sessões cobrem as duas ordens e conta ocupada. Limpeza: nenhum caminho antigo apagado antes do corte integrado; removida suposição incorreta de que o primeiro resultado agregado no artefato legado deve ser o resultado da revisão exata.
