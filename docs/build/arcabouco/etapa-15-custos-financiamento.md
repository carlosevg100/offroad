# Etapa 15: custos de financiamento por datas

## Contrato implementado

`buildFinancingCashFlows` recebe operandos de dívida, inventário de quatro categorias de custo
por instrumento e encargos individualizados. Não recebe uma projeção calculada para confiar nela.
Cada categoria declara especificado, zero, não aplicável ou desconhecido com justificativa.
Encargo positivo exige categoria especificada; categoria especificada sem itens é recusada.
Datas, conta, instrumento, período, identidade econômica e tratamento são explícitos.

Liberação é bruta antes das retenções. Retenção só no início do período e na mesma conta,
com soma limitada à liberação daquele instrumento. Caixa recebe a liberação bruta e registra
a retenção uma vez. Pagamento separado ocorre em sua data/conta. Capitalização ocorre no início
do período e aumenta o principal sujeito à taxa do intervalo; não gera entrada ou saída imediata.
Outra data de capitalização requer desdobrar o intervalo e fornecer suas taxas efetivas, sem
interpolação automática. Principal amortizado pode incluir os encargos financiados.

O motor de dívida existente é reutilizado com aumento de principal identificado. A projeção
retira a parcela não monetária da liberação e conserva `capitalizedCharges` na linha. Quitação,
PIK, taxas negativas e saldo residual continuam calculados, sem liquidação presumida no fim do
horizonte. Soma encargos nominais e juros/indexação incorridos, distinta de caixa pago ou CET.
Não calcula taxa anual efetiva nem determina tributos pela lei. Os valores são operandos explícitos.

Inventário é declaração, não certificação de completude comercial/jurídica. Se qualquer categoria
é desconhecida, retorna lacunas e nenhum total/dívida/fluxo composto. `economicId` repetido é
recusado mesmo sob IDs e tratamentos diferentes; origens distintas ainda precisam de revisão
para provar que não representam o mesmo fato econômico. Não infere identidade por texto.

## Verificação

16 casos em `financing-costs.test.ts`: retenção e principal; tarifa financiada/juros/caixa;
amortização incluindo tarifa; conta/data de pagamento; desconhecido/zero/não aplicável;
inventário completo; duplicação; bruto versus líquido; data/período/convenção inválidos;
precisão/sinal; saldo residual; PIK/taxa negativa; reprodução/cópia dos operandos;
isolamento entre instrumentos; recorrência; validação mesmo com outra lacuna.
Oráculos: receber100 e pagar juros20 mais tarifa5 custa25; financiar tarifa5 leva principal105,
juros21 e custo26; com PIK o saldo quitado é127,05. Fixtures são sintéticas locais.

Gate integral antes do push, CI da PR e main, imutabilidade de métodos publicados e deploy
web/worker no mesmo commit compõem o pronto. Não há DDL nem dados descartáveis em produção.
Recibos efetivos e nomes/resultados individuais ficam no completion externo do incremento.

## Segurança, limites e próximos incrementos

Integridade financeira (AI/processing integrity), determinismo e rastreabilidade; nenhum novo
acesso, efeito externo ou transmissão. Função pura não autoriza fontes nem execução. Revert
apenas do incremento restaura o motor corrente anterior, sem alterar R01 ou dados históricos.

Na15: ligar custos a adoções autorizadas; representação de escala explícita com proveniência;
projeções, alternativas, convenções/instrumentos/covenants/sensibilidades; conteúdo completo,
medição da primeira resposta útil e aprovação profissional. Não chamar o procedimento de pronto
por existir o motor. Contrato de execução na17, alarmes/renovação operacional na18 e preservação
universal na19. Próxima onda requer OK; incrementos restantes da15 estão autorizados.
