# Etapa15: índice definido sob adoções

O adaptador recebe um envelope contextual autorizado e cinco seleções versionadas: numerador,
denominador, limite, comparador e convenção. Campos defined_ratio.<id> impedem uso acidental
de outro índice. Numerador/denominador são monetários; limite é adimensional. Data de medição,
intervalo de cada operando, cenário, moeda, perímetro, entidade e definição são verificados.

Escala monetária usa interpretação adotada; escala de limite/convenção deve ser unitária.
Mesmo contribuinte ou observação repetidos entre operandos são recusados. Limite ou convenção
faltante gera lacuna sem cálculo; denominador não positivo gera resultado incompatível.
Nenhum resultado intermediário pode ser injetado. Derivados mantêm todas as dependências.

Definições gerenciais e contratuais são distintas. A função não constrói EBITDA/CFADS ou dívida
líquida automaticamente nem afirma que seus componentes obedecem à cláusula. Essa revisão
permanece explícita, junto de aplicabilidade, arredondamento contratual, cura, waiver e efeito
jurídico. Hipótese contratual simulada permanece hipótese, nunca contrato confirmado. A convenção
suportada compara sem arredondar; contrato que exige outra convenção não recebe adaptação tácita.

Quinze casos verificam limite exato, mudança por comparador adotado, limite ausente, sete
incompatibilidades contextuais, reclassificação indevida, denominador negativo, escala/moeda/
convenção, duplicidade de contribuição/observação e escopo/reprodução. Matemática somente no
financial-core. Não concede acesso, execução ou certificação. Sem DDL; integração na15,
revalidação17, operação18 e preservação19. Originais e R01 preservados.
