# Padrão institucional do modelo de crédito

Status: implementado, ainda não homologado como expert  
Versão: 2026-09-03-v1

## Princípio

`Preliminar` descreve a confiança e a disponibilidade de informação. Não autoriza uma arquitetura
financeira simplificada. Um cenário feito apenas com dados públicos usa a mesma estrutura do
modelo completo, mas mantém premissas, lacunas e intervalos explicitamente identificados.

O modelo anterior de cinco anos, com crescimento e margens genéricas, permanece apenas para
compatibilidade. Ele não pode ser apresentado como análise institucional. A rota institucional
somente produz output quando os controles abaixo passam.

## Arquitetura mínima

1. O balanço de abertura precisa fechar e a dívida bruta precisa reconciliar ao ledger de
   instrumentos.
2. Receita é construída por segmentos e drivers materiais, incluindo volume, preço, mix, câmbio
   e efeitos inorgânicos quando aplicáveis.
3. Custos são projetados por drivers ou relações operacionais identificadas. Margem agregada é
   fallback visível, nunca fato silencioso.
4. Capital de giro usa contas e dias relevantes, com sazonalidade quando a média anual esconder o
   pico de funding.
5. Capex de manutenção e crescimento ficam separados. Cronograma de desembolso, ramp-up e
   depreciação não podem ser confundidos.
6. Imposto separa resultado contábil, imposto caixa, prejuízo fiscal e limitação de dedutibilidade
   de juros. Consequências jurídicas ou fiscais materiais exigem revisão especializada.
7. Caixa irrestrito, caixa restrito, aplicações e caixa operacional mínimo permanecem separados.
8. Dívida é modelada contrato a contrato, com indexador, spread, amortização, pré-pagamento,
   garantias, covenants e tratamento contábil e de caixa.
9. DRE, balanço, fluxo de caixa, PP&E, dívida, impostos e patrimônio são integrados. Cada período
   precisa fechar antes de qualquer conclusão.
10. O horizonte cobre o business plan, o prazo da estrutura e a parede de vencimentos relevante.

## Correção monetária e juros

Indexação e cupom são componentes independentes. Para uma dívida IPCA+, o sistema precisa ler no
instrumento se o IPCA:

- é pago em caixa no período;
- é incorporado ao saldo principal;
- não se aplica ao instrumento.

O cupom também pode ser pago ou capitalizado. O modelo registra separadamente correção acumulada,
correção paga, correção capitalizada, cupom pago, cupom capitalizado, principal, serviço de dívida,
despesa financeira e saldo final. Taxa diferente de zero sem tratamento explícito bloqueia o
cálculo.

A curva usada é datada, tem fonte, nós, regra de interpolação, extrapolação e lag de observação.
Piso e teto contratuais são aplicados depois da observação. Curva de mercado, consenso macro,
guidance da administração e cenário Offroad não podem ser misturados.

## Livro de premissas

Cada premissa material contém:

- identificador estável e unidade;
- valor por período;
- fonte, documento, data-base e localização;
- racional e metodologia;
- confiança e limites;
- linhas afetadas;
- indicação se o usuário pode editar.

A hierarquia é orçamento da companhia, guidance, filing ou call, consenso licenciado, plano
operacional, curva de mercado, dado setorial, histórico normalizado e cenário Offroad. A origem
não transforma uma estimativa em fato. Alteração pelo usuário cria nova versão de cenário e não
sobrescreve a base.

## Revisão independente

O reviewer falha fechado para:

- balanço de abertura ou projetado que não fecha;
- ledger de dívida divergente do balanço;
- premissa material sem racional, metodologia ou evidência exigida;
- cenários ou datas-base misturados;
- dívida indexada sem tratamento de caixa ou capitalização;
- amortização que gera dívida negativa;
- linha histórica alterada;
- covenant calculado com definição diferente da contratual.

Caixa negativo, breach de covenant, ausência de lente setorial e lacunas de cobertura são
expostos, não suavizados. Mesmo sem blocker, o engine nunca se autopromove a expert. Promoção
exige gold cases, adversarial cases, benchmark cego contra o melhor modelo generalista e revisão
nominal de um profissional qualificado.

## Primeiro pack setorial

O pack de alimentos e consumo essencial foi implementado com drivers de categoria, geografia,
canal, commodities, câmbio, hedge, safra, frete, energia, estoque, pass-through, capacidade,
ramp-up e sazonalidade. Seu status é `implemented`. Ele ainda precisa ser homologado com cases
reais e revisão independente.
