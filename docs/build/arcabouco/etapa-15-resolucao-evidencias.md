# Etapa15: corrigir o custo do gate de evidências

O inventário de segurança passou a resolver centenas de objetosGit em sequência. O gate local
excedeu5000ms em um caso mais de uma vez; o run35529976331 da projeção operacional registrou
três timeouts na mesma família de resolução. Logs preservados fora do repositório. Nenhuma
falha financeira foi atribuída a esses timeouts, e a PR não foi mesclada com gate vermelho.

O resolvedor interno continua validando remoto, commit completo e presença em main. Depois
consulta objetos fixados com até4 subprocessos simultâneos, deduplicando referência de objeto
somente dentro da avaliação. Cada arquivo é lido integralmente sob o limite existente20MiB;
o buffer é descartado após gerar tamanho e hash. Esperados, relações canônicas, fonte externa,
frescor e alçada continuam sendo verificados individualmente. Falha de leitura permanece
bloqueio; não há fallback para declaração. A fonte externa é lida novamente em cada avaliação.

Teste novo: dois registros apontam ao mesmo objeto, um com hash correto e outro adulterado;
o primeiro resolve e o segundo bloqueia, sem recibo de verdade verificada. Os93casos existentes
permanecem e os94passaram isolados. Tempo observado24,43s versus62,96s anterior, sem tratar isso
como benchmark controlado. Limites e assertions não foram alterados. Check integral, CI,
web/worker no mesmo commit e completion são exigidos. Correção necessária ao gate da15;
não antecipa escopo de monitoramento operacional da18. Rollback reintroduz resolução serial,
mas nunca muda a autoridade ou veracidade exigida.
