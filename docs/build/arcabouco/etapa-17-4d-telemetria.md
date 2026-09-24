# Etapa 17 / 4D: tempo até valor, sem conteúdo

Incremento 4 do contrato de execução da etapa 17 (`etapa-17-execucao.md`, item 4) pede registrar o tempo até a primeira resposta útil e até o resultado verificado, sem conteúdo na telemetria. Todos os carimbos já existiam, exceto um: nada registrava que quem pediu leu o resultado.

## O que muda

Migração `20260924013350_execution_time_to_value.sql`.

- `private.execution_read_receipts`: recibo imutável da primeira leitura de uma execução por leitor sem os bytes do resultado e da primeira leitura com eles; no máximo duas linhas por leitor e execução, porque quem espera o resultado costuma olhar antes de ele existir, e guardar só a primeira leitura de qualquer tipo perderia a leitura verificada. Só ids, booleanos e um carimbo; bytes só com entradas correntes (restrição); sem grant para cliente ou worker; não altera, não apaga, não trunca.
- `private.read_work_execution_v1`: o mesmo texto de antes com uma instrução a mais, o recibo, gravado depois da checagem de acesso e do cálculo das entradas correntes. O leitor v2 não muda: ele chama o v1 primeiro, então toda leitura v2 também fica registrada. Uma guarda recusa rodar se qualquer dos dois leitores tiver definição diferente da que a migração conhece.
- `private.execution_time_to_value`: visão de operador, `security_invoker`, sem grant para os papéis da API, uma linha por execução com ids, carimbos, intervalos, booleanos, um bigint e códigos: pedido, claim, commit, primeira resposta útil, resultado verificado, tempo em fila, tempo até a primeira resposta útil, tempo até o resultado verificado e duração ativa. O motivo do recibo de resultado só aparece quando é um dos cinco códigos do worker; qualquer texto vira nulo.

## Definições operacionais

- Início: `work_executions.created_at`, o commit do pedido.
- Primeira resposta útil: o commit do resultado quando o desfecho é `succeeded` (o núcleo calculou o pacote; um pacote com lacunas nomeadas ainda avança a decisão). Marcadores parciais (`budget_exhausted`, `operation_uncertain`, `calculation_failed`, `invalid_input`) não são resposta útil.
- Resultado verificado: a primeira leitura dos bytes pelo próprio solicitante com entradas correntes, desde que o recibo de gates, quando existir, não esteja bloqueado. Um marcador parcial lido pelo solicitante é resultado verificado sem ser resposta útil; o desfecho separa os dois casos.

## Provas

`supabase/tests/execution_time_to_value.sql` em staging com rollback e no job de banco da CI: leitura antes do resultado registra sem bytes; a primeira leitura do solicitante depois do commit bem-sucedido registra com bytes e leituras seguintes não acrescentam linhas; a leitura de outro participante fica registrada no nome dele e nunca conta como verificada; marcador parcial deixa a primeira resposta útil nula; a visão devolve os intervalos; todas as colunas da visão têm tipo sem texto livre e os códigos só assumem valores permitidos; motivo em texto livre nunca chega à visão; tabela e visão fora do alcance de `anon`, `authenticated` e `service_role`; recibos imutáveis; a paridade de wrappers do RLS continua valendo.

Estampas: staging `20260924011941`, produção `20260924013350`, aplicadas pelo executor via MCP; guarda conferida em produção antes (definições dos dois leitores iguais às esperadas) e instrução gravada idêntica ao arquivo depois (sem a quebra de linha final). Advisors de segurança zero.
