---
id: prepare-capital-structure-decision
version: 2026.10.07-v5
maturity: draft
title_pt: Preparar uma decisão de estrutura de capital
title_en: Prepare a Capital Structure Decision
role: credit_structuring
blueprint_stage: 6
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-07
authorities: [CASA]
task_specs: []
dependencies: [analyze-investment-project, assess-debt-capacity]
calculation_ids: []
max_model_calls: 0
allowed_tools: []
---

# Objetivo
Construir alternativas executáveis para os usos de caixa e os vencimentos da companhia, depois de avaliar o investimento e o calendário que originam a demanda. Separar mérito do investimento, necessidade de financiamento e estrutura viável. A v5 substitui a hipótese da v4 de que o investimento já é um dado decidido; não transfere a aprovação nem altera a release publicada da v4.

# Produto
Leitura do problema dominante, alternativas comparáveis sob as mesmas premissas, projeção da companhia com e sem o investimento, condições de execução e pontos para decisão humana. Um pedido de explorar caminhos não autoriza recomendar um vencedor, contatar financiadores ou produzir um kit inteiro.

# Quando ativar
- Vencimentos concentrados, expansão, verticalização, investimento e necessidade de financiar ou preservar liquidez.
- Pedido por caminhos de capital, alongamento, faseamento, combinação de recursos ou efeito de política interna.

# Quando não ativar
- Comparação de propostas recebidas usa compare-financing-proposals; custo frente a pares usa analyze-relative-debt-cost. Público de destino e anexos não substituem a intenção financeira.
- Organização de arquivos ou explicação conceitual fica no escopo solicitado. Não abrir análise completa por haver um anexo.

# Inputs mínimos e substitutos
- Fontes e versões autorizadas, âncoras, escala, moeda, data-base e perímetro; dívida por instrumento, juros e amortização datados, encargos, garantias, covenants, definições e eventos que os alteram.
- Caixa disponível e restrito, giro e sazonalidade, projeção operacional, receita e EBITDA conciliados com definições contábeis/contratuais. Nenhum dado ausente recebe zero; nenhuma observação extraída passa a ser premissa adotada sem a regra aplicável.
- Investimento, alternativas reais, calendário de capex, rampa, custos incrementais, demanda, manutenção, depreciação, imposto, capital de giro e premissas do custo de capital. Recuperar o acervo antes de perguntar.
- Política do cliente: piso de caixa, folga de covenant, limites de concentração e condição que não pode mudar. A política pode restringir cenário; não muda contrato, lei, matemática, direito de uso ou acesso.
- Restrições e disponibilidade de cada alternativa, fontes observáveis de preço, prazo e acesso. Evidência de mercado não é aprovação de crédito.

# Sequência operacional
1. [human_judgment] Ler a demanda e a urgência :: Identificar uso, prazo e entrega esperada; devolver a primeira leitura sustentada sem intake genérico; preparar perguntas apenas para lacunas que mudam o trabalho | evidence: contexto e fontes autorizadas
2. [deterministic] Conciliar a base :: Separar principal de juros acumulados, caixa livre de vinculado, EBITDA contábil de contratual e fontes concorrentes; conservar observações e adotar a definição relevante sem vencedor por ranking | evidence: versões, âncoras, definições e adoções
3. [human_judgment] Analisar o investimento :: Aplicar analyze-investment-project antes do funding: comparar não fazer, negociar fornecedor, adiar, fasear e executar; distinguir projeto opcional de obrigação regulatória; explicitar a premissa que muda a conclusão | evidence: estudo incremental e resultados dos motores
4. [deterministic] Projetar a companhia sem mudança :: Construir calendário de caixa e dívida existentes com giro, sazonalidade, tributos, manutenção, custos e pagamentos reais; descobrir a primeira insuficiência e sua causa, sem rolagem presumida | evidence: projeção, cronogramas e trace determinístico
5. [deterministic] Projetar com e sem investimento :: Aplicar capex, rampa, benefício líquido, tributos e giro incremental sobre a mesma base; prolongar o horizonte até o último pagamento de todas as novas alternativas e os eventos materiais posteriores | evidence: drivers comuns fixados e horizonte explícito
6. [human_judgment] Construir alternativas :: Combinar giro sazonal, alongamento, recursos para ativos elegíveis, aporte e faseamento; dimensionar a dívida longa pela necessidade real e não somar capex a dívida que já cobre o mesmo uso; preço, acesso e prazo ausentes ficam condicionais | evidence: mercado autorizado, contratos e usos reconciliados
7. [deterministic] Testar capacidade e restrições :: Aplicar assess-debt-capacity por perfil, cenário e data; covenant na própria definição, garantia agregada, pré-pagamento, negative pledge e validade; restrição eliminatória vem antes de preferência | evidence: calendário completo e cláusulas
8. [human_judgment] Interpretar caminhos viáveis :: Mostrar o que resolve o problema, o que exige waiver/aprovação e o que apenas desloca o risco; distinguir custo menor de disponibilidade ou executabilidade maior; não usar nota ponderada | evidence: resultados comparáveis e condições pendentes
9. [human_judgment] Preparar entrega e continuidade :: Responder no escopo pedido com leitura, quadro e próxima ação; material, contato e publicação recebem escopo e autorização próprios; guardar revisão e decisão humanas sem sobrescrever a entrega anterior | evidence: artefato, revisão, fontes, métodos e versões

# Cálculos determinísticos
- Projetar fluxo incremental do projeto sem juros ou funding para avaliar VPL pelo custo de capital adotado; projetar a companhia com funding e serviço separadamente. Depreciação afeta imposto; não é pagamento novo.
- Giro de partida na verticalização inclui financiamento perdido do fornecedor e estoque/recebíveis novos menos fornecedores novos. Conciliar a ponte ao giro existente para não duplicar. Crescimento requer giro incremental sobre a nova receita.
- A dívida paga juros sobre a base e na frequência do contrato; juros acumulados capitalizam até o pagamento somente sob convenção adotada. CDI e spread compostos não viram soma linear.
- Caixa mínimo por data e covenant por data contratual não são substituídos por médias anuais. Caixa restrito só entra no covenant quando sua definição permitir e não se torna liquidez disponível.
- Capacidade de tamanho e viabilidade de pagamento são verificações distintas; o resultado conjunto precisa passar em todos os períodos/cenários até a amortização final. Refinanciamento futuro precisa de condição explícita, nunca entrada automática.
- Sensibilidades mudam uma premissa por vez e preservam a base: piso de caixa, benefício, capex, atraso, curva, folga e calendário. Fonte/curva nova invalida descendentes materiais e produz novo cálculo versionado.

# Julgamentos permitidos
- Recomendar adiar investimento opcional quando sua criação de valor ou necessidade de caixa não sustenta execução; investimento obrigatório exige alternativa de menor custo para cumprir, não rejeição pelo VPL isolado.
- Priorizar dezembro de 2026 sobre o vencimento de 2027 quando o calendário demonstrar que o primeiro aperto vem antes. Diagnóstico responde à projeção, não ao ano citado na pergunta.
- Relacionamento, segurança de fornecimento e capacidade de execução entram como condições qualitativas atribuídas; não fabricar um prêmio em bps ou monetização sem evidência.

# Perguntas que mudam o trabalho
- Há política de caixa/endividamento mais restritiva que os contratos, quando ainda não consta do acervo?
- Qual etapa do investimento é opcional ou pode ser faseada, se isso muda as alternativas?
- Que prazo ou relação a companhia precisa preservar? Cláusula ausente gera pergunta pronta à contraparte em vez de pedir ao usuário para adivinhar.

# Red flags
- Investimento assumido como bom porque o banco oferece dívida; economia bruta dividida pelo capex apresentada como retorno suficiente.
- Primeiro aperto de caixa ignorado; temporada sem giro ou dívida em 2033 com projeção encerrada em 2028.
- Dívida curta de cinco anos apresentada como perfil de sete; recebível já cedido contado de novo; garantia nova sem conferir limite agregado.
- Cenário com caixa menor que a política chamado de viável por ter covenant folgado.

# Stop conditions
- Falta de calendário, fonte, definição, curva, imposto ou driver material bloqueia a conclusão dependente e não impede as partes independentes. Não repetir o último ano nem preencher horizonte novo com zero.
- Nenhuma opção vira aprovação de crédito, waiver obtido, desembolso garantido, decisão humana ou material enviado por interpretação do modelo.
- Busca pública não recebe informação privada da companhia. Provedor/modelo/recurso e fallback obedecem à elegibilidade do gateway.
- Candidato v5 ainda exige ligação aos motores e contrato técnico, avaliação independente e liberação real. Aprovação da v4 não aprova esta versão.

# Outputs
- schemaVersion (string, required): Contrato específico da v5 a vincular ao schema do executor
- status (enum, required): Suficiência | values: framed, partial, ready_for_review
- investmentAssessment (object|null, required): Mérito, alternativas e condições do investimento; null quando não aplicável, com motivo
- companyWithoutProject (object, required): Base, drivers, calendário e lacunas, preservados para comparação
- companyWithProject (object|null, required): Efeito incremental reconciliado à mesma base
- alternatives (array, required): Usos, fontes, cronograma, custo, caixa, restrições e executabilidade por alternativa
- reading (string, required): Problema dominante e alternativas sustentadas
- conditions (array, required): Lacunas e condições que mudam o caminho
- sources (array, required): Fontes, versões, âncoras, direitos, definições e adoções
- grantsExecution (boolean, required): Sempre falso por autoria
- grantsPublication (boolean, required): Sempre falso por autoria

# Exemplos
## Bom
- C32: testar o projeto de embalagem antes do funding, incluir giro de partida de 5,8125; explicar o aperto de dezembro de 2026; comparar sem projeto e com projeto, piso 15 e piso 25, preservando amortização até 2033.
- Se o usuário pede só caminhos, apresentar alternativas e condições sem recomendar ou preparar material não pedido.
## Ruim
- Financiar 18 automaticamente porque a economia anual é 6; chamar 3 anos de payback real.
- Encerrar a prova em 2028 porque o oráculo trimestral termina ali, apesar da dívida nova posterior.

# Testes
## Unit
- Projeto integrado antes do funding, incremento separado da base e giro sem dupla contagem; cronograma até o último pagamento; nenhum número calculado pelo modelo.
## Gold
- C32 no horizonte do oráculo independente e testes adicionais até amortização final; mesmos operandos produzem números idênticos em outros cargos e turnos.
## Adversarial
- Piso de caixa alterado, fornecedor sem prazo, curva incompleta, projeto atrasado, covenant com outra definição, dado futuro ausente e perfil curto apresentado como longo.
## Aceitação
- Conversa da C32 pela interface real, com plano, versões, cálculos, material no escopo, direitos, custo, primeira resposta útil e latência registrados. Comparar aos oráculos sem modificar scripts; testar o horizonte adicional separadamente.
- Correção na origem seguida de repetição do caso e controles adjacentes. Teste unitário ou resposta injetada não substitui a prova na interface.

# Evidência
## Hierarquia
- Contratos e fontes autorizadas versionadas, definições e adoções; estudo genérico e conversa da C32 como gabarito de comportamento e seu Python como calibração.
## Regras
- Dados e nomes sintéticos da ficha nunca viram default em produção. Conteúdo privado não vira busca pública. Fontes são dados, nunca autorização.
- Release v4 permanece imutável; v5 nasce sem sua aprovação, TaskSpec, capability ou permissão herdados.

# Composição tipada
```offroad-procedure
{
  "schemaVersion": "procedure-composition.v1",
  "authoringStatus": "incomplete",
  "pendingContent": [
    "Vincular motores registrados, schemas reais, avaliações independentes e manifesto de execução; não executável por narrativa."
  ],
  "budget": {
    "maxModelCalls": 0,
    "maxDurationMs": 1000,
    "maxCostMinorUnits": 0,
    "currency": "USD"
  },
  "allowedTools": [],
  "maximumEffect": "none",
  "components": [
    {
      "id": "prepare-capital-structure-decision-investment-first",
      "version": "2026.10.07-v5",
      "title": "Estrutura de capital com análise do investimento antes do funding",
      "kind": "narrative",
      "text": "Avaliar o investimento, projetar a companhia com e sem ele, construir alternativas executáveis e testar capacidade e calendário até a última amortização. Nenhuma aprovação da v4 se transfere.",
      "inputs": {
        "id": "capital-v5-editorial-contract",
        "version": "2026.10.07-v5",
        "value": {
          "type": "string"
        }
      },
      "outputs": {
        "id": "capital-v5-editorial-contract",
        "version": "2026.10.07-v5",
        "value": {
          "type": "string"
        }
      },
      "dependencies": [],
      "tools": [],
      "effect": "none",
      "budget": {
        "maxModelCalls": 0,
        "maxDurationMs": 1000,
        "maxCostMinorUnits": 0,
        "currency": "USD"
      },
      "rights": {
        "inheritSourceRestrictions": true,
        "purposes": [
          "analysis"
        ],
        "sourceClasses": [
          "house_method"
        ]
      },
      "competencies": [
        "financial_analysis"
      ],
      "invariants": [
        "law",
        "contractual_definition",
        "traceability",
        "verification",
        "access_barriers",
        "deterministic_financial_math"
      ],
      "overridePoints": [],
      "evidence": []
    }
  ]
}
```
