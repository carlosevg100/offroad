# M2: a Selic de ponta a ponta (ADR 0023)

Estado em 21/10/2026: fundação (PR #924) e job de aquisição (PR #925) em produção, transporte fechado.
O gate de série (PR #926) trocou o CDI pela Selic diária (SGS 11), único caminho aberto sem contrato.
Este plano fixa as decisões de desenho do M2 antes do código. Cada parte é uma PR com migração, testes
positivos e negativos, revisão independente e prova em staging e produção.

## Decisões de desenho

1. **Normalização na própria tentativa.** O worker não lê bytes do bucket depois de confirmar (o
   download é fechado de propósito). Por isso a tentativa que tem os bytes em memória também os
   normaliza: o parser versionado (`bcb-sgs-json.v1`, em `packages/market-reference`) valida o
   arquivo e produz as observações; a confirmação grava, numa só transação, o recibo da aquisição, a
   versão normalizada, suas entradas e observações e o selo. O banco recalcula o texto canônico e o
   fingerprint pelas funções da fundação; o worker só propõe. Uma divergência recusa a confirmação
   inteira e nenhum recibo fica sem versão. O parser não infere nada (ADR, decisão 5): lê data e
   valor, confere esquema, datas em ordem e sem repetição, valores finitos e unidade declarada.

2. **Qualidade automática com quarentena.** Regras determinísticas por fonte (lacuna maior que o
   calendário de dias úteis admite, salto fora da faixa declarada, série mais curta que a janela
   pedida) produzem `approved` ou `quarantined` pelo próprio job, como evento com `processing_job_id`.
   Quarentena nunca é servida; aprovação manual de uma quarentena é comando de operador, com motivo.

3. **Três datas honestas.** `period_end` é a data da série. `acquired_at` é o momento da aquisição.
   `available_at` ganha uma base declarada por observação: `observed_at_acquisition` (o que só se
   sabe que existia no momento da busca) ou `source_calendar_rule` (data útil seguinte ao período, no
   horário de publicação declarado na revisão da fonte, nunca depois da aquisição). A regra é da
   revisão da fonte e entra no fingerprint. Uma execução com data-base D só lê observação com
   `available_at` até D.

4. **Janela e backfill.** A API do SGS exige filtro de datas e janela de no máximo 10 anos para séries
   diárias. Cada job pede uma janela explícita; o backfill são jobs de janelas de até 10 anos, e a
   série vigente é a união das versões aprovadas mais recentes por período, sem sobrepor versões de
   janelas diferentes de forma ambígua (cada observação servida tem uma única versão de origem).

5. **Agendador com delegação própria.** `pg_cron` agenda o enfileiramento diário, que roda sob uma
   delegação de agendamento registrada por fundador ou operador (fonte, janela relativa, horário,
   revogável), com o mesmo registro de autoria dos comandos. Sem delegação viva, nada é enfileirado.

6. **Outbox de mercado.** Aprovação, quarentena, revogação e supersessão de versão geram linhas de
   outbox consumidas pela invalidação das entregas a tenants (parte 5). O consumo é idempotente e
   tem recibo.

7. **Expurgo de confirmados por licença.** A fonte aberta do Banco Central declara retenção sem prazo
   (`storeDays` nulo) e `retainAdoptedValues` verdadeiro; nada dela vence. O expurgo físico de objetos
   confirmados entra junto com a primeira fonte que tenha prazo. Até lá o banco recusa enfileirar
   aquisição de fonte com `storeDays` definido, em vez de depender de memória operacional.

8. **Entrega ao tenant e adoção (decisão 10 da ADR).** O recibo de entrega (`market_deliveries`, por
   organização, RLS do tenant) fixa versão, hash, direito e observação; a adoção ganha referência
   tipada e opcional ao recibo; o valor adotado tem de ser o do objeto; o snapshot da execução
   carrega o recibo; o fechamento resolve recibo, versão e direito a cada leitura. Revogação ou
   vencimento entre proposta, adoção e execução bloqueia a etapa seguinte.

9. **Primeiro consumidor.** A Selic observada entra como referência rotulada (fonte, data, atribuição
   ODbL) nas propostas de premissa que hoje pedem uma taxa básica à pessoa. O CDI continua lacuna
   nomeada; nenhum número de CDI é derivado da Selic sem metodologia aprovada (M3).

## Sequência

| Parte | Entrega | Abre o transporte? |
|---|---|---|
| 1 | Parser `bcb-sgs-json.v1`, confirmação com versão, observações, selo e qualidade numa transação; base de disponibilidade | Não |
| 2 | Agendador `pg_cron` com delegação de agendamento; janela e backfill | Não |
| 3 | Outbox de mercado e recusa de fonte com prazo de retenção sem expurgo | Não |
| 4 | Atos de produção: publicadora, revisão da fonte `bcb-sgs-selic`, delegação do token do worker, delegação de agendamento, abertura da chave | Sim, ao fim |
| 5 | Entrega ao tenant, adoção tipada, snapshot e fechamento | Não altera |
| 6 | Primeiro consumidor nas propostas de premissa | Não altera |

Os atos da parte 4 em produção usam a identidade de fundador ou de operador; o registro da
publicadora é comando de fundador.
