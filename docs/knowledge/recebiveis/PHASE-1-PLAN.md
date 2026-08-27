# Fase 1 · Calculadora A1 e caso Vertentes

Versão: `2026.08.27-v1`

Este plano executa a primeira vertical aprovada em
[`CANONICAL-SPEC.md`](CANONICAL-SPEC.md). A Fase 1 prova a camada matemática e a
procedência. Não inclui recomendação por modelo, tela de produto ou distribuição.

## 1. Escopo

A matemática e os contratos econômicos vivem em
`packages/financial-core/src/receivables`. O pacote `packages/receivables-analysis`
orquestra essas funções e produz lacunas, estados e decisões sem manter uma segunda
implementação matemática. O caso Vertentes é migrado para
`packages/testing-fixtures/assets/vertentes` e seu gabarito para
`packages/testing-fixtures/gold/vertentes`.

As entradas mínimas são títulos, liquidações, diluições, recompras, prorrogações,
cessões ou gravames, sacados, grupos econômicos, posição contábil, dívida e fluxos da
proposta. Os contratos canônicos já estão em
`packages/financial-core/src/receivables/contracts.ts`.

## 2. Sequência de implementação

### 2.1 Ingestão e qualidade

1. Validar schema, moeda, datas e valores.
2. Rejeitar chaves duplicadas ou registrar resolução explícita.
3. Normalizar raiz de CNPJ e grupo econômico.
4. Preservar vencimento original, vigente e eventos de extensão.
5. Conciliar títulos, liquidações, cancelamentos, diluições e recompras.
6. Conciliar carteira com posição contábil e cessões declaradas.
7. Emitir exceções estruturadas. Não corrigir silenciosamente.

### 2.2 Métricas estáticas

1. Prazo original e efetivo ponderados.
2. DSO simples e countback.
3. Concentração por sacado, raiz e grupo econômico.
4. Top N configurável.
5. Aging canônico em sete faixas.

### 2.3 Métricas dinâmicas

1. Matriz de roll rate mensal.
2. Safras de perda em 30, 60, 90, 120, 180 e 360 dias.
3. Diluição por causa.
4. Recompra e perda ajustada.
5. Liquidação pontual.
6. Prorrogação por quantidade e valor.

### 2.4 Estrutura e custo

1. Ponte da dívida ajustada.
2. Conversão de taxa por dentro e por fora.
3. Normalização mensal, anual, dias úteis e dias corridos.
4. CET calculado a partir dos fluxos e tarifas reais.
5. Advance rate implícito, com hipóteses governadas e visíveis.

## 3. Contrato de saída de cada cálculo

Cada função retorna:

- valor canônico em `Decimal` serializado;
- unidade;
- data ou período;
- universo;
- numerador e denominador, quando aplicável;
- inclusões e exclusões;
- fórmula e versão;
- âncoras de origem;
- alertas e status de qualidade.

Arredondamento é uma etapa de apresentação. O gabarito preserva a precisão usada no
cálculo.

## 4. Migração do caso Vertentes

O material hoje mantido fora do repositório deve ser copiado sem alteração inicial,
com hashes e manifesto. Depois será dividido em:

- `raw`: arquivos recebidos ou gerados;
- `normalized`: representação canônica esperada;
- `intermediate`: reconciliações, grupos e coortes esperados;
- `expected`: métricas finais e exceções;
- `manifest`: seed, versão do gerador, hashes e datas canônicas.

O manifesto precisa distinguir `reporting_date` de `latest_origination_date`. O
gabarito textual atual usa 30/06/2026 e a base contém emissão máxima em 28/06/2026.
Essa diferença deve ser confirmada contra o gerador e registrada, não eliminada por
conveniência.

## 5. Lacunas do gabarito atual

Antes de exigir igualdade integral, o gold precisa conter:

- prazo ponderado;
- DSO simples e countback;
- concentração completa por sacado, raiz e grupo;
- aging de sete faixas;
- roll rates;
- perdas nas seis janelas;
- diluição detalhada;
- recompra e perda ajustada;
- liquidação pontual;
- prorrogações;
- ponte da dívida ajustada;
- conversões de taxa;
- CET;
- advance rate;
- âncoras de procedência e exceções de qualidade.

O gabarito parcial existente não é descartado. Ele é validado e incorporado ao gold
completo.

## 6. Testes obrigatórios

### Igualdade

Toda métrica do caso Vertentes bate exatamente com o gold após a convenção explícita
de precisão e arredondamento.

### Fronteiras

Há testes para 0, 1, 15, 16, 30, 31, 60, 61, 90, 91, 180 e 181 dias de atraso, além
de datas inválidas, valores negativos e títulos duplicados.

### Invariantes

- Aging soma o universo.
- Concentrações somam 100% do universo aplicável.
- Elegíveis mais excluídos somam o total sem dupla contagem.
- A curva de não pagamento por safra não aumenta quando o horizonte se alonga; perda
  realizada acumulada só é testada separadamente quando há data do evento de baixa.
- Ponte de dívida reconcilia abertura, movimentos e fechamento.
- Formatos economicamente equivalentes produzem o mesmo CET.
- Ordem dos registros não altera o resultado.
- Duas execuções do mesmo caso produzem saída idêntica.

### Falha fechada

Ausência de denominador, período, data-base, âncora ou campo obrigatório gera erro,
alerta ou `não avaliado`, conforme o contrato. Nunca gera imputação silenciosa.

## 7. Critério de aprovação

| Dimensão | Barra |
|---|---|
| Métricas definidas | 100% contra gold completo |
| Procedência | 100% das saídas numéricas |
| Testes de fronteira | 100% |
| Invariantes | 100% |
| Replay determinístico | Idêntico |
| Regressão do monorepo | Verde |
| Performance | Benchmark registrado para a carteira Vertentes |

## 8. Entregas incrementais

1. Contratos e especificação canônica.
2. Auditoria e plano de migração do protótipo existente.
3. Fixture e gold Vertentes completos.
4. Métricas estáticas.
5. Métricas dinâmicas.
6. Dívida, taxas, CET e advance rate.
7. Orquestração sem matemática duplicada, relatório auditável e evidência do gate.

Nenhuma entrega é promovida ao produto antes de concluir seu próprio conjunto de
testes. A aprovação da Fase 1 libera a construção do motor de elegibilidade, não a
recomendação automática a compradores.

## 9. Estado medido em 27/08/2026

Entregas 1 a 5 concluídas para o caso Vertentes: contratos, especificação, auditoria,
fixture com gold, métricas estáticas e métricas dinâmicas. O pacote de orquestração
consome a fonte canônica para os cálculos migrados. A entrega 6 continua pendente. A
entrega 7 está concluída nos perímetros estático e dinâmico.

O gold dinâmico é produzido por um oráculo Python independente do motor TypeScript e
cobre 23 transições mensais e 24 safras. Roll rate usa vencimento original para não
esconder atraso por prorrogação. A métrica de safra é chamada explicitamente de curva
de não pagamento no horizonte, não de write-off. O caso não tem volume cedido, então
a taxa de recompra sobre cessões retorna `not_evaluable`, mesmo com zero recompras na
verdade sintética. Causas de diluição continuam não classificadas no nível do título e
essa limitação permanece visível.

O gabarito legado foi preservado para auditoria, mas sua carteira elegível foi
corrigida porque somava exclusões sobrepostas. A política usada nessa simulação é
estimada, não é mandato confirmado de comprador e não pode produzir decisão rígida.
