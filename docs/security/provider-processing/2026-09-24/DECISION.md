# Atestações de provedor sem vencimento por prazo

Decisão do fundador de 24/09/2026, registrada verbatim em `docs/build/arcabouco-stage0/FOUNDER-ACTS.md`:

> tira esse negocio de atetatcoes do sistema.. ja foi feito .. e pronto .. nao precisa fazer too mes .. depois vemos isso

Leitura do executor, que é a especificação desta mudança: a conferência de 21/09/2026 deixa de vencer por prazo. A verificação por provedor, conta, modelo e recurso continua exigida para qualquer combinação nova, e a revogação continua funcionando como antes.

## O que muda

- Uma atestação declara `validThrough` como data ou como nulo. Nulo vale até a atestação ser revogada ou substituída por uma identidade nova. Uma data continua vencendo exatamente como antes. O campo segue obrigatório: omitido, o registro é recusado.
- A migração `provider_assurance_without_expiry` aceita nulo em `valid_through` e reescreve, a partir do texto vigente, o comando de registro e o predicado de elegibilidade. O pacote `@offroad/model-gateway` aplica a mesma regra.
- As oito atestações de 21/09/2026 são registradas de novo por `reregister-without-expiry.sql`: mesmo documento, mesma evidência, mesma revisão, identidade nova e `validThrough` nulo; cada anterior é revogada no mesmo ato. Os documentos estão em `assurances.json`. Sem este ato, a transmissão de dados a modelos pararia quando as datas atuais vencem, em 21/10/2026 às 00:00 UTC (20/10, 21h em Brasília).

## O que continua verificado

A cada tentativa, inclusive reparo e fallback, a autoridade no banco confere:

- provedor, conta, projeto, vínculo de credencial, endpoint, região, modelo e recurso, por correspondência exata, sem herança entre modelos, recursos, contas ou chaves;
- finalidade, classe do dado e direitos;
- uso para treinamento proibido e elegibilidade declarada;
- cada categoria de retenção contra o limite do job, reduzido pelo prazo mais curto das fontes e dependências, e as exceções de retenção aceitas;
- os direitos atuais das fontes do job.

Combinação sem atestação continua recusada: modelo, recurso, conta, chave ou região nova exige conferência e registro próprios. A revogação encerra a atestação na hora e a identidade revogada não volta. Cliente e worker continuam sem poder registrar ou revogar atestações. Se os termos do provedor ou a configuração da conta mudarem, o caminho continua sendo revogar e registrar nova conferência.

A regra de `../2026-09-21/REVIEW.md` sobre validade explícita e revisão antes do vencimento fica substituída apenas quanto ao prazo; o arquivo não é alterado porque sua impressão SHA-256 é evidência das atestações.

## Execução

1. Aplicar a migração em staging e em produção.
2. Rodar `reregister-without-expiry.sql` como `postgres`, primeiro em staging (que recebeu as mesmas oito atestações em 21/09/2026) e depois em produção. É uma única transação: aborta sem mudar nada se a migração faltar, se uma atestação anterior divergir da impressão de 21/09/2026 ou já tiver sido revogada. Reexecutar depois de concluído não altera nada.
3. Resultado esperado: oito atestações ativas sem data, as oito anteriores revogadas e dezesseis eventos de operador novos (oito revogações e oito registros).
