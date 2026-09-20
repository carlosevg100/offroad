# Etapa15: leitura Git limitada para evidências

O reparo anterior reduziu concorrência, mas continuou iniciando um processo Git por objeto.
Na CI35533855029 um negativo de metadado capturedAt excedeu5s. Nenhum merge ocorreu com o
check vermelho. Preservar os testes e eliminar processos redundantes resolve a causa de custo.

A fronteira confiável continua interna: repositoryRoot, commit, remoto e ancestralidade são
verificados pelo avaliador. O helper de transporte não emite recibo de autoridade. Cada chamada
consulta novamente metadados e bytes fixados. Só blobs até20MiB entram; árvores/ausências/grandes
ficam sem resolução. Referências devem conter commit hexadecimal e caminho sem NUL/CR/LF.
Entradas NUL-terminadas; sem filtros, textconv ou seguir symlinks. Conteúdo dos symlinks permanece
blob, como antes, sem ler destino fora do Git.

Metadados têm limite4MiB; cada lote de conteúdo até20MiB, mais cabeçalhos limitados. Cabeçalho
confere OID/tipo/tamanho e delimitadores; bytes exatos são resumidos com SHA256. Só lote íntegro
entra no mapa; falha/bytes extras/truncamento nega. Timeout de transporte30s limita processo
travado, sem aumentar5s de nenhum teste. Não há cache entre avaliações nem entrada de bytes,
repo ou relógio pelo chamador do avaliador. Hash esperado continua verificado por evidência.

Quatro casos novos usam repositório temporário sintético: blob binário/caminho com espaço/vazio;
árvore/ausente/20MiB+1; injeção de delimitador ou ref não fixada; mudança na árvore de trabalho
sem mudar o objeto fixado. Todos94casos do inventário preservados. Sem DDL, provedor, dado real,
permissão ou alteração de frescor/alçada. Rollback reintroduz o custo de processos, sem mudar
negações. Falhas bloqueiam publicação. Etapa15 continua; operação18 não foi antecipada.
