# C04/C32: investimento, companhia e faixa viável de dívida

Os motores puros de financial-core v27 têm schemas estritos, Decimal em contexto próprio de 80 dígitos e operandos/rastros preservados. Não concedem direito de uso, não extraem cláusulas e não habilitam métodos.

## Investimento antes do financiamento

`investment-project.ts` calcula giro incremental, exposição da rampa por mês, fluxo sem alavancagem, VPL/TIR e recuperação do investimento. Verticalizar exige contar a perda do financiamento do fornecedor antigo, mesmo sem receita adicional. Estoque, recebíveis e financiamento dos novos fornecedores usam dias e base anual adotados. O giro não é recuperado automaticamente: a queda do saldo incremental precisa estar no horizonte e na premissa.

A rampa atravessa dezembro; início em novembro com três meses a meia carga conserva janeiro a meia carga. Custos fixos podem acompanhar o tempo em operação ou a carga, conforme adoção explícita. Não há inferência de tributação ou benefício fiscal de prejuízo. A TIR só é apresentada com uma mudança de sinal e raiz dentro do intervalo declarado; outras sequências conservam VPL e recusam uma raiz arbitrária.

`projectCompanyWithAndWithoutInvestment` mantém a mesma companhia e financiamento de base, acrescenta o investimento e refaz a tributação conjunta. Somar o imposto isolado do projeto seria incorreto quando há prejuízo de base. Caixa restrito fica separado. Exige todos os períodos, inventário de maturidades e saldo final compatível; não repete o último ano nem preenche drivers ausentes com zero. Mede abertura/finais de período e não certifica liquidez diária.

## Capacidade como interseção de restrições

`debt-capacity.ts` projeta companhia, impostos e financiamento proporcional ao valor buscado. Custos e geração operacional podem ser fixos ou variar por unidade do novo financiamento, com fonte explícita. Um projeto fixo conserva seus custos e benefícios; C04 em escala é uma hipótese distinta, restrita à calibração identificada. A escolha profissional da hipótese pertence ao procedimento.

O perfil normalizado conserva desembolsos, amortização, juros capitalizados e pagamentos. Fatores datados exigem divisão nos eventos; crédito de juros sobre amortização/interesse sobre desembolso ao final só entram sob rótulo de aproximação anual. Fatores e fontes precisam ser construídos/adotados pelo consumidor governado; a API matemática não verifica um contrato por si.

Cada cenário confere todos os limites em todos os finais de período declarados: caixa disponível mínimo, dívida líquida/EBITDA definido, cobertura de juros e cobertura do serviço sob definição de CFADS explícita. EBITDA não positivo não vira uma razão segura; zero serviço produz não aplicabilidade identificada, não cobertura infinita. Caixa líquido assinado ou somente caixa não negativo são convenções distintas. Ajuste de EBITDA, dedução de juros para imposto, caixa disponível e tratamento do capex em CFADS viajam nos operandos.

A busca particiona as mudanças de regime de imposto e de caixa dedutível, intersecta as desigualdades afins, procura na unidade monetária declarada e reprojeta o ponto escolhido e o seguinte. Não presume que zero seja viável: pode existir mínimo de dívida para resolver caixa e máximo para atender amortização/covenants. Preço ou benefício não linear requer outra alternativa; não é amostrado e chamado de prova global. Se o máximo é o teto escolhido de busca, o resultado declara `boundedBySearchDomain`.

`full_settlement` exige horizonte, quitação de principal/juros e saldo antigo final compatíveis. `calibration_window` permanece explicitamente parcial e retorna `calibration_only`, inclusive com resultado de tamanho. Não pode promover vida inteira, crédito aprovado ou execução de método. `projectDebtCapacityAmount` faz a revisão de valor fixo usando os mesmos gates e a mesma matemática da busca.

## Calibração e divergências preservadas

C32 base reproduz os onze fluxos anuais publicados, VPL 0,7 a 15%, VPL 4,5 a 11,5%, TIR 15,8% e giro exato 5,8125. C04 projeto reproduz VPL −26,7 e TIR 6,8%; tamanho L1/L3/L4 reproduz 54,8 e 80,0 nas duas fases. Esses dois tamanhos não passam a valer como capacidade conjunta: adicionar caixa e DSCR revela ausência de solução para o perfil antigo ensaiado.

O Python C04 mantém a debênture até 2031, enquanto a tabela de perfil da conversa usa a revisão até 2033. O caixa do exemplo de 45 com cinco anos é −1,2/−33,7 no Python antigo; não é 22,6/−6,4 da tabela revisada. O payback publicado soma um ano ao tempo da grade cuja primeira entrada é t=0: o motor expõe a interpolação consistente, C04 10,7 e C32 5,9, e conserva as datas medidas. A variante C32 iniciada em novembro também difere no mês de janeiro seguinte. Nenhum original ou número esperado foi modificado para esconder essas diferenças; provas e hashes estão no registro externo `outputs/implementacao-fichas-2026-10-07/DIVERGENCIAS-DE-CALIBRACAO.md`.

## Verificação e publicação

43 testes novos conferem os oráculos, fronteiras, gaps, contexto Decimal, horizonte, restrições conflitantes, faixas descontínuas e enumeração independente de grades pequenas. São provas matemáticas, não ensaio pela interface. Executores publicados v24 continuam imutáveis; somente a identidade dos consumidores prospectivos é v27. Integração às definições adotadas, composição dos procedimentos, manifesto/publicação e execução pela interface têm incrementos próprios antes de completion do pedido.
