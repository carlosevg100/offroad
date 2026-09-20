# Etapa15: comparação exata de índice sob limite definido

A função evaluateDefinedRatio não substitui definição contratual nem presume covenant.
Recebe numerador, denominador, limite e comparador explícitos: lt/lte/gt/gte. Convenção
positive_denominator_unrounded_comparison é obrigatória. Contrato com arredondamento próprio
antes da comparação exige outro executor; não há substituição silenciosa.

Valores decimais limitados a24 dígitos inteiros e12 decimais; Decimal isolado com precisão100.
Com denominador positivo, compara numerador com limite vezes denominador, sem arredondamento.
Quociente e margem têm18 casas HALF_UP para exibição, com trace dos produtos exatos. Igualdade
passa só em limite inclusivo. Margem positiva significa lado favorável; margem exibida zero
não substitui a decisão exata. Numerador negativo é preservado, sem supor piso zero.

Nulo gera missing_inputs; denominador zero/negativo gera nonpositive_denominator, sem ratio
conclusivo nem declaração de violação. O adaptador de definições deve verificar unidade,
período, perímetro, origem e composição antes deste motor. O resultado não atesta completude,
cura, waiver, legalidade ou direito de uso. Nenhuma autoridade ou execução concedida.

Oito testes: igualdade estrita/inclusiva; fronteira perdida no arredondamento visual; margem
superior/inferior; denominador não positivo; lacunas; numerador negativo; domínio inválido;
reprodução e independência da configuração Decimal global. Registro e manifesto corrente
atualizados, R01 fixado preservado. Integração15, revalidação17, operação18, preservação19.
