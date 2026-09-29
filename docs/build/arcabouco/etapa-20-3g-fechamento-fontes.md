# Etapa 20 / 3G: fechamento privado de fontes

Status: em verificação. Não declara conclusão nem ativa consumidor. 3F fechado na PR 842/main `9b3e7a16`, CI e web/worker verificados; etapa 20 aberta, 21–24 não iniciadas.

A função privada `institutional_result_source_closure_v1(uuid,text)` exige capability e sujeito corrente do job, resultado concluído, binding e snapshot exatos. Comprova todas as configurações entregues, conserva a união de fontes do cálculo e raízes, incluindo não citadas, e mantém cada par versão/direito. A licença corrente mais ampla não substitui a licença fixada.

Retorna `closed` somente para essa execução corrente e nessa transação, ou recusa sem fontes parciais. Não grava receipt, revisão nativa, aprovação ou liberação; não tem wrapper público nem grants de cliente. O próximo consumidor atômico deve revalidar imediatamente antes de gravar, preservar todos os pins e conferir lease/autoridade. Não aceitar o JSON retornado como autorização transferível.

Controles APP-02/03/04/09/11 e DATA-02/03/12: gate estreito 3C, contas/token antes de política, sessão/projeto/job com NOWAIT. Mensagens de contribuições do trabalho ficam sob SHARE NOWAIT; isso protege a integridade até o commit, mas pode causar contenção também por contribuição não utilizada. Retry nunca converte recusa em prova. Todos os prazos fixados e correntes/transitivos são conferidos ao final; expirados negam mesmo sem escritor concorrente.

Eval: contrato SQL em staging sob rollback, writers reais na baseline e capturas sintéticas explicitamente privilegiadas para adulterações estruturais; fontes exclusivas do cálculo/raiz, não citadas, múltiplas licenças, prazo expirando durante avaliação, binding/configuração/hash incorretos, contribuição alterada, origens históricas/importadas/desconhecidas e ausência de grants. O teste temporal injeta apenas espera na função, conserva os predicados e restaura a definição por rollback. Suíte completa RLS e cinco corridas com duas sessões na CI descartável: revogação nas duas ordens, job concorrente, edição de mensagem ancestral nas duas ordens. CI ainda pendente neste registro.

Limpeza: extraído helper sintético comum de contribuição para evitar duas implementações nos contratos; sem remoção de caminho vigente. Rollback de imagem preserva a função aditiva e todos os controles antigos. Falta de consumidor e importação não comprovada permanecem explícitas; nenhuma prova retroativa é fabricada.

Amendment de staging: a migração inicial é preservada; migração adicional confere sessão/trabalho/sujeito e transições temporais de grants, grupos e barreiras. Uma transição de política do mesmo sujeito em recurso não consumido pode recusar conservadoramente a chamada; nova avaliação usa o estado corrente. A espera de teste é injetada após o loop, sem substituir qualquer predicado de autorização.
