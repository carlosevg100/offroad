# C02: custo de proposta a partir da base adotada

`calculateAdoptedFinancingProposal` em financial-model liga o cronograma e o spread equivalente às contribuições da base contextual imutável. O chamador fornece seleções e contexto; não fornece valores financeiros nem substitui convenções por campos livres.

Cada contribuição precisa corresponder a proposta, campo, entidade, perímetro, moeda, cenário, definição, unidade e horizonte. Séries conservam posição e tamanho. Escalas monetárias diferentes de 1 exigem interpretação adotada com modo e membros exatos; nenhuma conversão é inferida. Valores numéricos, datas, curvas, juros não pagos, pagamentos e avaliações de custos conservam dependências e fingerprint.

Ausência produz pergunta dirigida. Tributo desconhecido bloqueia o custo efetivo. A janela precisa conter a quitação integral; datas não são truncadas. DU/252 exige contagem adotada; ACT/365 não consome contagem escondida. Uma observação não pode ser contada como dois operandos distintos. Declaração de custos inexistentes contradizendo retenção positiva é recusada.

Esta composição é deliberadamente limitada a custos retidos no desembolso, cuja completude foi explicitamente adotada. Custos adicionais ou desconhecidos geram lacuna para o ledger de encargos datados. O motor de VP admite fluxos adicionais, mas este adaptador ainda não os resolve. Não apresentar como suporte universal a propostas com reciprocidade, tributos recorrentes ou pagamentos externos.

Resultado calculado permanece `partial_composition`: ainda faltam a integração ao caixa da companhia, covenants, garantias, firmeza, validade e interpretação comparativa do procedimento. Fingerprint é integridade e contexto, não autorização. O leitor SQL autorizado e a política de fonte continuam pré-condições; o resultado conserva `grantsExecution=false` e `grantsPublication=false`. Nenhuma rota/RPC/TaskSpec ou liberação é acrescentada neste corte.

14 testes novos passaram, incluindo alteração de bytes/escopo, troca de entidade/definição/tempo/unidade, contribuição/observação duplicada, valor livre, falta, escala, interpretação real, imposto desconhecido, custo adicional, horizonte e reprodução histórica. Gate completo local 44/44 PASS; financial-model 435 testes PASS. Publicação e CI deste corte têm comprovação própria; a integração pela interface não está concluída.
