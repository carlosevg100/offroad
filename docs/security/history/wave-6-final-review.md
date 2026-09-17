# Revisão final técnica da onda 6

A onda entrega somente a etapa 7: direito de uso versionado e recuperação autorizada antes
do ranking. PR 638, baseline `654c09c5c8f64424b68ef10bd986235a07ba7c02`. O inventário vincula
97 evidências aos bytes desse commit e à observação operacional delimitada; as 18 lacunas
gerais permanecem com tratamento em `docs/build/arcabouco/RISCOS-POR-INCREMENTO.md`.
Nenhuma etapa 8 foi iniciada, nem há declaração de prontidão enterprise.

Migração staging `20260917024611` / produção `20260917025326`, MD5 SQL
`26955f303ed38f67f5ed3708476b64e7` idêntico, reconferido ao vivo após o merge. São 325 arquivos
cobertos pelo journal de produção, 35 superfícies novas inventariadas e 32 funções em paridade.
Advisors de segurança sem lints. Produção preserva 28 versões com 28 direitos baseados em
aceites explícitos, 28 eventos com auditoria/outbox, uma licença própria de biblioteca e
nenhuma licença de reutilização pública inferida. Verificação de produção somente por leitura,
sem dados descartáveis. Schema instalado antes do código, com worker anterior compatível.

Os 76 contratos SQL passaram no schema instalado de staging com rollback. Seis novos contratos
provam ausência de direito, finalidade, exportação/Storage, direitos fixados e atuais, ancestrais,
ciclos, corrupção de chunk, prazo na mesma requisição, revogação após seleção e antes da entrega,
revogação de job e isolamento da busca. O teste de 501 chunks entregou 12 resultados em 60,407 ms,
com EXPLAIN/BUFFERS e índices verificados. Os cinco testes do adaptador validam capability,
negação sem cache, limite antes da chamada, resposta inválida e citações preservadas.
Nomes e resultados em `docs/build/arcabouco/etapa-07.md` e seu recibo de eval.

A primeira CI da PR recusou o download da fixture sem direito declarado: 30 E2Es passaram,
um falhou duas vezes, 16 externos ficaram desativados. A fixture local foi corrigida pelo comando
real `set_source_rights_v1`, sob o autor autenticado e workspace explícito, com hash real do chunk.
Concessão e revogação continuam exigidas; não se modificou o avaliador para aprovar o teste.
A fixture corrigida passou também em staging com rollback. Quality da PR `35177608628` e
Security `35177608634` passaram; 31 E2Es passaram sem repetição, incluindo acesso/revogação
em 5,9 segundos. Os 16 testes externos permanecem desativados pela configuração da CI.

Quality de main `35178377159`, Security `35178377201` e worker `35178377176` passaram.
Vercel Production `6495004870` e ECS revisão 347 executam o baseline exato; rollout completo,
uma tarefa ativa e 67 eventos atuais de saúde, sem bloqueio nem atraso. Smoke HTTP posterior
ao sucesso da Vercel: página pública 200, três rotas privadas redirecionam ao login. Os quatro
alarmes estão OK e continuam sem ações de notificação: risco obrigatório da etapa 18 antes
da continuidade. A sessão do operador não comprova os privilégios mínimos do executor.

A abertura do inventário e sua observação AWS são preservadas no histórico. O novo teste
`requires source rights and real retrieval evidence at wave-six closeout` rejeita a remoção
de qualquer uma das 13 novas evidências. Os recibos do commit desta conciliação ficam no
completion externo após seus próprios gates e deployments, sem alegar publicação futura.

Limites: inputs privados entre dossiês permanecem desativados até 17/18; protocolo de artefatos
em 19/21; cofre/publicação em 12/13/20; condições de provedores em 16; purge, hold e recibos
por destino em 22. Prazo vencido nega uso hoje, mas não comprova eliminação física. Ausência
de licença pública impede cache compartilhado, preservando a resposta corrente e a métrica
de falha de escrita; não se fabrica direito de reutilização. O próximo incremento exige OK
do fundador. Não há outro ato exclusivo acrescentado.

Na conciliação local, a resolução integral dos 97 arquivos excedeu o timeout padrão de
5 segundos sob execução paralela. Esse teste de I/O recebe limite próprio de 30 segundos,
sem remover asserções; não altera o gate de dois segundos da busca SQL. A execução inicial
e a repetição ficam nos logs externos `final-check.log` e `final-check-repeat.log`.
