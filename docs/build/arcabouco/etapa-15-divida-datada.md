# Etapa 15: movimentos de dívida por data

Incremento de domínio aditivo, antes da composição de projeções e custos. `buildDatedDebtCashFlows`
(`financial.dated_debt_cash_flows`, motor corrente `2026.09.20-v19`) recalcula o cronograma pelo
motor existente a partir de operandos explícitos e produz movimentos aceitos pelo calendário de
liquidez. Nenhuma rota, política, migração ou publicação de método é alterada.

## Contrato e limite econômico

- Saldo inicial ao fim do dia; intervalos contíguos cobrem todo o horizonte. Liberação no primeiro
  dia, pagamentos no último. Taxas efetivas para o intervalo inteiro; a liberação participa da base
  integral desse período. Não há conversão de taxa anual, ajuste de dia útil, rateio diário, lag de
  pagamento ou inferência de datas. Outra convenção requer extensão explícita e teste antes de uso.
- Abertura, liberação, amortização, pré-pagamento e taxas são informados, inclusive zeros. Ausência
  bloqueia o cálculo deste instrumento; o chamador deve preservar a lacuna. Não preenche desconhecido
  com zero. Não aceita cronograma calculado externamente como substituto dos operandos.
- Liberação, correção paga, cupom pago, principal e pré-pagamento são movimentos distintos com
  instrumento/período/componente. Não emite serviço agregado como movimento adicional. Capitalização
  aparece no saldo devedor e no trace; só entra no caixa quando liquidada pelo principal.
- Correção/cupom negativos pagos geram entrada, preservando o sinal econômico. Contas de liberação e
  pagamento são declaradas; não há transferência implícita de caixa restrito para disponível.
- Todos os instrumentos usam a moeda do horizonte. Saldo residual não é quitado implicitamente ao
  fim da análise. Intervalos devem continuar até o horizonte, inclusive com saldo zero após quitação.
- Componentes conservam as oito casas do motor existente; o caixa soma componentes já arredondados,
  não reaplica um agregado com arredondamento diferente. Os limites do calendário são conferidos.
- Resultado guarda cópia independente dos operandos, versão e identidade dos movimentos. O contexto
  Decimal do pacote deve ser precisão 40 e HALF_UP; alteração externa é recusada, sem mutação corretiva.

`debt_components_only` não é previsão completa nem CET. Comissões, tributos, taxas efetivas anuais,
fluxos operacionais e sua cobertura são responsabilidade dos próximos incrementos; não viram zero.
A função pura não lê banco, autoriza acesso, valida evidência, certifica cobertura ou recomenda alternativa.
O adaptador futuro deverá obter operandos do leitor autorizado de adoções, fixar versões e herdar
restrições. Hash e identificador de instrumento não são autorização. Não requer adoção manual de cada
parcela calculada. Nenhum caminho de execução atual é substituído ou ampliado neste incremento.

## Eval

`packages/financial-core/src/dated-debt.test.ts` verifica: contexto aritmético alterado; quitação PIK;
liberação/pagamento em datas diferentes; dívida existente sem nova liberação; caixa restrito e conta
explícita; dívida residual; cupom/correção negativos; correção capitalizada; datas inválidas/sobreposição/
lacunas; moeda e instrumentos duplicados; operandos/taxas ausentes; convenção inválida e sobrepagamento;
arredondamento/reprodução/cópia independente; colisões de identificadores. Oráculos numéricos explícitos
não chamam o motor sob teste para obter o esperado. A suíte de registro verifica o cálculo exportado.

CI deve executar check, banco e E2E; a compatibilidade do método R01 publicado permanece obrigatória.
Sem alteração de DDL, não há migração remota. Evidência final de CI, main e web/worker no mesmo commit
fica no completion externo, depois dos gates reais. Nenhum dado de teste é criado em produção.

## Riscos atribuídos

Etapa 15: adaptar adoções/contexto/restrições, comparar abertura comum, integrar projeções com datas
fundamentadas e custos completos, testar lacunas e dupla contagem na composição (o kernel só emite
componentes). Provar instrumentos/convenções antes de ampliar, manter R01 imutável, medir primeira
resposta útil e obter aprovação profissional antes da publicação. Etapa 17: execução e dependências
fixadas; 19: preservação universal de artefatos. Sem antecipar aprovação do conteúdo.

A sincronização de contribuições foi concluída na PR 679: main `c037b6db965ef94f1e3c54ff799f0e397fe6c730`,
Quality main `35491928849` aprovado com 36 E2E, nenhuma tentativa flaky; Security `35491928656` e worker
`35492015880` aprovados. Web/worker conferidos no completion anterior. A causa exata da latência isolada
no gate de inventário segue sem diagnóstico; investigar se recorrer, sem elevar timeout para ocultá-la.
