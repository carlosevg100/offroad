# Vertentes · gold A1-03

Caso sintético integral da Vertentes Distribuidora, célula A1: venda mercantil B2B
avaliada para uma estrutura com FIDC multicedente. Nenhuma entidade ou dado é real.

## Separação obrigatória

- `assets/vertentes/raw/empresa`: os 21 arquivos que simulam o que a companhia
  entregou. Estes são dados de entrada e podem ser expostos apenas em ambientes de
  teste.
- `source`: verdade reservada do gerador. Contém campos plantados que o sistema não
  recebe no intake e nunca pode ser usada como atalho de extração.
- `normalized`: representação canônica da verdade econômica usada para provar a
  matemática isoladamente.
- `expected`: valores e defeitos congelados para comparação independente.
- `LEGACY-GABARITO.md`: gabarito original, preservado apenas para auditoria.

O teste do `financial-core` usa `normalized` para provar as fórmulas. Um teste de
ingestão futuro deverá partir exclusivamente de `raw` e medir sua saída contra a
verdade reservada. Misturar as duas camadas constitui vazamento de fixture.

## Correção do gabarito legado

O gabarito original somava exclusões independentes e contava alguns títulos mais de
uma vez. A regra canônica aloca cada título ao primeiro motivo aplicável e só depois
aplica o limite de concentração. Sob a política sintética do caso, a carteira
elegível correta é R$ 8.877.495,23, e não R$ 8.618.471.

Essa política é uma hipótese do caso e não representa critério confirmado de um
comprador. Logo, o resultado não autoriza direcionamento de mercado.

## Estado de aprovação

O gate matemático da Fase 1 está aprovado para contratos canônicos, métricas
estáticas, métricas dinâmicas, dívida ajustada, conversão de taxas, CET e cenário de
advance rate. Os golds estático, dinâmico e de estrutura e custo são calculados por
oráculos Python independentes do motor TypeScript.

Isso não torna o caso economicamente completo. O CET da proposta de factoring ainda
não inclui tributos porque o dado não foi fornecido. O volume cedido, necessário
para calcular recompra sobre cessões, também não existe. A abertura de diluição por
causa e a data de algumas prorrogações permanecem limitadas pela entrada. Cada saída
falha fechada e conserva a lacuna.

O advance rate de 92,904117% é apenas um cenário estimado. A perda ajustada histórica
é usada como proxy explicitamente governada, não como perda esperada de safra nem
como regra confirmada de comprador. Elegibilidade regulatória e contratual é o
próximo gate. Matching, recomendação e introdução continuam proibidos.
