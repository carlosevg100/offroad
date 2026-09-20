# Etapa15: composição de caixa na mesma base adotada

O adaptador exige o mesmo envelope, versão, trabalho, finalidade, entidade, perímetro, moeda,
cenário e horizonte entre operação e dívida. Contextos parecidos não permitem combinar versões
diferentes. Calendário operacional direto é recusado nesta composição por competência, evitando
duplicação de caixa. Cada valor é resolvido novamente; nenhum agregado fornecido pelo chamador
é aceito como resultado.

Conta operacional e inventário de movimentos são contribuições adotadas. Aporte, distribuição,
venda de ativo e aquisição têm séries tipadas de identidade, data, valor, conta, finalidade e
razão. Inventário desconhecido ou série ausente bloqueia. Nenhuma dívida exige declaração
adotada própria e estoques de caixa; não se inventa instrumento com principalzero. Contribuições
não selecionadas continuam preservadas no envelope; declaração não certifica verdade e exige
revisão das contradições materiais.

O núcleo recalcula operação, dívida e caixa por período; originais, hipóteses, interpretações e
dependências acompanham o resultado. Uma observação original não pode ser reutilizada em dois
operandos. Caixa restrito permanece separado. Resultado é composição parcial, sem aprovação de
crédito, preço disponível, conformidade contratual automática ou autorização de execução.

Dezoito casos verificam caixa123 com aporte80/distribuição10; caixa53 sem movimentos de capital;
caixa270 sem dívida; ausência de declaração/caixa; sete contextos divergentes; bases diferentes;
dupla contagem; definição/séries ausentes; identidade econômica; observação duplicada; injeção;
reprodução. Fixtures apenas no pacote sintético. Check integral, CI, main e produção ainda
exigidos; não há DDL ou mudança de privilégio. Comparação/autoria seguem na15, execução na17.
