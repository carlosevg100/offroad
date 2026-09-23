# Etapa 17 / 3K: pausa concorrente R01

A primeira inserção de uma pausa precisa disputar a mesma autoridade que uma leitura ou publicação já em andamento. Bloquear somente uma linha de pausa existente deixa esse caso descoberto.

O predicate `receivables_analytical_release_enabled` adquire um advisory compartilhado transacional e consulta o estado corrente em um comando separado. Os writers adquirem o mesmo advisory exclusivo. Todas as aquisições são não bloqueantes: conflito gera `40001`, exige repetir a transação inteira e nunca significa que a pausa foi aplicada ou que o acesso está permitido. Isso evita acrescentar espera circular aos locks de política, sessão e trabalho dos caminhos existentes.

A tabela de pausas usa trigger por statement. A tabela global de capabilities usa trigger por linha, apenas quando OLD ou NEW envolve R01, preservando a publicação concorrente de outros métodos. TRUNCATE nas duas tabelas também é protegido. Os locks normais de tabela/linha continuam em vigor; o novo advisory nunca espera depois deles.

O protocolo aceita READ COMMITTED. Isolamentos que conservariam um snapshot anterior são negados explicitamente. O predicate é VOLATILE para consultar um snapshot novo depois da aquisição. Referências: [volatilidade no PostgreSQL 17](https://www.postgresql.org/docs/17/xfunc-volatility.html) e [locks consultivos transacionais](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

`r01_release_serialization.sql` verifica os estados e a negação de snapshots antigos. `test-r01-release-concurrency.py` usa duas conexões reais, somente no banco descartável local da CI: primeira pausa nas duas ordens, update/delete/insert, mudança da chave em ambos os sentidos, rollback, upgrade concorrente, TRUNCATE, revogação real de política e progresso de capability não relacionada. Nenhum guarda é desligado para construir os casos. A barreira lê bytes diretamente do pipe, evitando timeout falso por NOTICEs já armazenados no buffer do Python.

TRUST-APP-01, TRUST-AI-01, TRUST-SDLC-01. Nenhum grant, parâmetro profissional, produtor ou claim R01 é aberto. Os quatro callers instalados propagam o conflito; não há conversão em sucesso. O retry integral continua responsabilidade do chamador, nunca um loop dentro da transação abortada. O recibo, metadata atual e orçamento conjunto ainda precisam ser ligados antes da execução R01.

Migração, catálogo, SQL em staging, CI e implantação exata são requisitos do completion. O rollback operacional conserva a pausa e os caminhos privados fechados; não remove a proteção de forma silenciosa. Este documento não declara o incremento ou a etapa 17 concluídos.
