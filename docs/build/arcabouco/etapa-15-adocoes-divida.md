# Etapa 15: dívida e caixa sob parâmetros adotados

`packages/financial-model/src/adopted-debt-liquidity.ts` acrescenta `calculateAdoptedDebtLiquidity`.
O adaptador lê uma versão imutável da base, verifica interpretação e recalcula dívida e caixa pelos
motores existentes. Sem nova rota, DDL, privilégio ou publicação profissional. O caminho anterior
continua preservado. Fixtures sintéticas ficam em `packages/testing-fixtures/src/adopted-debt-liquidity.ts`.

## Decisões de contrato

Cada instrumento vincula abertura, convenções, contas e séries a contribuições explícitas. Datas finais,
taxas efetivas, liberações, amortizações, pré-pagamentos e quitação são listas já suportadas pela base,
validadas por tipo e posição. O calendário adotado dá significado a cada posição; comprimentos precisam
coincidir. A série é adotada uma vez e gera os intermediários; não há cadastro de uma adoção por cupom.
Não se aceita JSON opaco em texto, resultado financeiro pronto ou inferência de periodicidade anual.
Não aumenta o limite de 256 contribuições da base nem promete comportar carteiras ilimitadas.

Os campos pertencem ao instrumento (`debt.<uuid>.<term>`); entidade, perímetro, moeda, cenário, período,
definição e natureza da definição precisam coincidir. Abertura usa o cenário de abertura; demais termos
usam o cenário analisado. O leitor preserva as afirmações e não prova normalização numérica. Escala um é
exigida tanto para escalares quanto para listas, com unidades declaradas (currency, ratio, date, boolean).
Não multiplica pela escala nem presume que a multiplicação já aconteceu. Taxas anuais/percentuais não entram como taxas efetivas do intervalo.

Caixa operacional usa movimentos diretos por data e conta, com campos próprios: recebimentos,
pagamentos operacionais excluindo capex e impostos, capex e imposto operacional. Não aceita EBITDA,
serviço da dívida, caixa agregado genérico ou ajustes de capital de giro sobre recebimentos/pagamentos
já em caixa. O adaptador recusa instrumentos/contribuições repetidos e uma mesma observação contada
novamente por outra hipótese. Isso não certifica que duas observações diferentes descrevem fatos
economicamente distintos; qualidade das definições, fontes e cobertura exige revisão do conteúdo.

Os motores de dívida e liquidez fazem toda a matemática. A convenção continua explícita: draw no início
e pagamentos ao fim, taxa efetiva do intervalo e cobertura contínua até o horizonte. Capitalização,
sinal negativo, conta restrita e principal residual conservam a semântica do motor entregue antes.

Falta essencial (taxa, abertura, data ou convenção) gera `missing_inputs`, com motivo e sem resultado
composto de dívida/caixa. Com todos os operandos, retorna `partial_composition`: comissões, tributos de
financiamento e custo completo continuam excluídos, nunca presumidos zero. Cobertura operacional é
uma declaração identificada; o adaptador não a certifica.

## Autoridade e dependências

O envelope precisa vir do leitor SQL autorizado. Digest e coerência de contexto não provam acesso,
direito de uso ou publicação. A função pura não consulta dados nem amplia execução (`grantsExecution:false`).
Preserva contribuições completas, vínculos por operando, versão da base, motor, cenários e fingerprint.
Cada movimento derivado referencia conservadoramente todas as contribuições do instrumento, incluindo
calendário e convenções; o resultado inteiro conserva também abertura e movimentos operacionais.

O executor futuro deverá fixar o manifesto e revalidar os direitos de todas essas dependências. Não
tratar esta função como mecanismo de autorização ou fingir que revogação foi comprovada por unidade.
Sem leitura nova de dados privados, export, telemetria ou chamada a provedor neste incremento.
R01 publicado preservado.

## Eval e pronto do incremento

20 casos novos em `adopted-debt-liquidity.test.ts`: oráculo independente de caixa e capitalização;
59 períodos/295 movimentos com apenas 18 contribuições; falta de taxa; nove dimensões incompatíveis;
séries incompletas/tipos/datas; agregado e EBITDA indevidos; duplicação; conta vinculada; normalização;
sinal negativo e residual; reprodução da versão anterior; envelope/trabalho/resultado injetado.

Check local e CI completos são exigidos, incluindo SQL/RLS, journeys e lock de métodos publicados.
Nenhuma migração aplica-se: não muda persistência. O completion externo registra runs, merge, web e
worker no mesmo commit e sondas somente de leitura, sem dados descartáveis de produção.

## Continuação e riscos

Etapa 15: projeções por datas fundamentadas, custos completos com ausências explícitas, comparação sob
mesma abertura, convenções/instrumentos/covenants/sensibilidades, medição de primeira resposta útil e
conteúdo profissional completo para aprovação. Este adaptador não recebe ensaio com usuários nem
publica método. Antes da integração no trabalho persistente, o leitor autorizado e o manifesto devem
ser efetivos. Execução/dependências na 17, alarmes/sessão operacional na 18 e preservação universal na 19.

## Correção de escala encontrada na integração

A inspeção do leitor e dos adaptadores mostrou uma suposição anterior incorreta: `readContextualBasis`
verifica bytes e escopo, mas não normaliza números. O SQL conserva `asserted_value` e `scale`; origens
legadas incluem tanto valores extraídos normalizados quanto valores reportados. Sem um contrato que
distinga isso, não há conversão segura por inferência. Os adaptadores de alavancagem, liquidez e
comparação passam a exigir escala um; o novo adaptador faz o mesmo. Bases históricas não são reescritas.
Valores em outra escala precisam de interpretação/conversão explícita antes de nova adoção para cálculo.
A prévia atual de alavancagem já converte exceção de domínio em entrada inválida, sem expor resultado.

Três regressões existentes foram corrigidas: antes validavam a hipótese indevida de normalização.
Com a asserção segura, as três falharam antes da alteração (`scale-before.log`), e precisam passar
após o gate de escala. Comparação avança para contrato `2026.09.20-v2`. R01 não usa esses adaptadores.
