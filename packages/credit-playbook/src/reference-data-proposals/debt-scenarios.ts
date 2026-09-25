import type {ReferenceDataProposal, ReferenceDataProposalFamily} from "./types";

/**
 * Debt views and scenarios: debt reconciliation, maturity and renewal, business-plan and market
 * scenarios, headroom, transaction sizing, costs, disbursement, mixed use and waiting analysis.
 *
 * Every value below is a proposal prepared on 24/09/2026 for the founder's review. The full
 * professional text (decision, rule, reasoning, sources with the date they were read, uses and
 * review triggers) lives in `knowledge/reference-data/debt-scenarios.md`, one card per key.
 * Ratios are decimal strings, counts of days, months and basis points are integers, and every
 * rule a method reads is a named field.
 */
const VERSION = "2026.09.24-v1";
const AS_OF = "2026-09-24";
const OBSERVED_BY = "Offroad (Claude, executor), 24/09/2026, aguardando revisão do fundador";

const HOUSE_PLAYBOOK_URL = "https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md";
const CPC_48_URL = "https://www.cpc.org.br/CPC/Documentos-emitidos/Pronunciamentos/Pronunciamento?Id=106";
const SP_LIQUIDITY_URL = "https://www.maalot.co.il/publications/mcp20141207101333a.pdf";
const CMN_4557_URL = "https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o&numero=4557";
const BCBS_IRRBB_URL = "https://www.bis.org/publications/201604-standards-interest-rate-risk-banking-book.pdf";
const IBRAOP_URL = "https://www.ibraop.org.br/wp-content/uploads/2013/04/OT_IBR0042012.pdf";
const LEI_7940_URL = "https://www.planalto.gov.br/ccivil_03/leis/l7940.htm";
const BNDES_STAGES_URL = "https://www.bndes.gov.br/wps/portal/site/home/financiamento/guia/etapas";
const LEI_12431_URL = "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12431.htm";

type Draft = {value: ReferenceDataProposal["value"]; unit: string | null; title: string; url: string};

function proposal(key: string, draft: Draft): ReferenceDataProposal {
  return {
    version: VERSION,
    value: draft.value,
    unit: draft.unit,
    source: {title: draft.title, url: draft.url, observedBy: OBSERVED_BY},
    asOf: AS_OF,
    documentation: `knowledge/reference-data/debt-scenarios.md#${key}`,
  };
}

/** The financing archetypes of `archetypeIdSchema`, in the order every band below follows. */
const ARCHETYPES = ["working_capital", "growth_expansion", "acquisition", "refinance", "equipment_finance", "venture_debt", "other"] as const;
type Archetype = (typeof ARCHETYPES)[number];
const byArchetype = <T>(values: Record<Archetype, T>): Record<Archetype, T> => values;

const drafts: Record<string, Draft> = {
  "policy.debt.views": {
    unit: null,
    title: "CPC 48 (passivos financeiros ao custo amortizado), CPC 06 (R2), CPC 25 e Ofício-Circular CVM/SNC/SEP nº 01/2021, item 8 (forfait e risco sacado); regra D-24 da casa",
    url: CPC_48_URL,
    value: {
      // The six fields below are the Case 01 draft of 05/09/2026, kept: they describe the two views
      // the build-debt-ledger executor computes today.
      views: ["release", "contractual"],
      contractual: "definição literal da escritura, componentes por instrumento, residual 'outra dívida onerosa' assumido zero de forma declarada",
      release: "definição do release, sem derivativos",
      leases: "fora da visão contratual salvo cláusula que os inclua, com âncora",
      authorizedNotDisbursed: "operação aprovada não é linha",
      contraLines: "custos de transação são linhas contra, não obrigações",
      catalogue: [
        {id: "gross_financial_debt", question: "quanto a companhia deve a financiadores", basis: "saldo devedor contratual por instrumento: principal, juros apropriados, atualização monetária e PIK; custo de transação a amortizar fica em linha contra"},
        {id: "net_financial_debt", question: "dívida financeira depois do caixa livre", basis: "gross_financial_debt menos o caixa dedutível de cashRule"},
        {id: "covenant_debt", question: "o número que cada contrato testa", basis: "definição literal de cada instrumento, uma visão por instrumento, com cláusula, perímetro e data de medição"},
        {id: "capacity_obligations", question: "o que consome o caixa disponível para o serviço da dívida", basis: "gross_financial_debt mais as obrigações de caixa marcadas na matriz, cada uma com cronograma próprio"},
        {id: "quasi_debt", question: "obrigações com natureza de financiamento fora da linha de dívida", basis: "itens da matriz marcados para quasi_debt, pela exposição econômica"},
        {id: "contingent_and_off_balance", question: "exposições que viram caixa somente sob condição", basis: "valor, faixa e condição de cada exposição; nunca somadas à dívida"},
        {id: "lender_specific", question: "a definição de um financiador ou mandato específico", basis: "definição recebida do financiador, com ponte para gross_financial_debt"},
      ],
      inclusionValues: {
        include: "entra pelo saldo",
        exclude: "não entra",
        per_definition: "a cláusula do contrato decide, com âncora",
        when_financing_in_substance: "entra quando supplierFinanceTest marca financiamento em substância",
        extended_portion: "entra a parcela estendida além do prazo usual do setor",
        when_not_derecognized: "entra quando os recebíveis continuam no balanço da companhia",
        retained_exposure: "entra a perda máxima retida (coobrigação, recompra, primeira perda, cota subordinada detida)",
        unless_formally_subordinated: "entra salvo subordinação formal com trava de pagamento",
        fixed_amount_only: "entra a parcela fixa; earn-out condicionado vai para contingent_and_off_balance",
        scheduled_outflow_not_in_cfads: "entra o desembolso esperado com data, somente se não estiver deduzido do CFADS",
        range_and_condition: "entra como faixa com condição, sem soma",
        net_liability: "entra o valor justo passivo líquido",
        when_leveraged_group_entity: "entra quando o garantido é entidade do grupo alavancada ou em estresse",
        guaranteed_amount: "entra pelo valor garantido (o teto da fiança ou do aval), com a condição, sem soma",
        contra_line: "linha contra, fora de toda soma de obrigações",
        not_a_line: "não gera linha",
      },
      inclusionMatrix: {
        bank_and_development_loans: {gross_financial_debt: "include", net_financial_debt: "include", covenant_debt: "per_definition", capacity_obligations: "include", quasi_debt: "exclude", contingent_and_off_balance: "exclude"},
        capital_market_debt: {gross_financial_debt: "include", net_financial_debt: "include", covenant_debt: "per_definition", capacity_obligations: "include", quasi_debt: "exclude", contingent_and_off_balance: "exclude"},
        transaction_cost_contra: {gross_financial_debt: "contra_line", net_financial_debt: "contra_line", covenant_debt: "per_definition", capacity_obligations: "contra_line", quasi_debt: "contra_line", contingent_and_off_balance: "contra_line"},
        hedging_derivatives_of_debt: {gross_financial_debt: "exclude", net_financial_debt: "exclude", covenant_debt: "per_definition", capacity_obligations: "net_liability", quasi_debt: "net_liability", contingent_and_off_balance: "exclude"},
        lease_liabilities: {gross_financial_debt: "exclude", net_financial_debt: "exclude", covenant_debt: "per_definition", capacity_obligations: "include", quasi_debt: "include", contingent_and_off_balance: "exclude"},
        supplier_finance: {gross_financial_debt: "when_financing_in_substance", net_financial_debt: "when_financing_in_substance", covenant_debt: "per_definition", capacity_obligations: "include", quasi_debt: "extended_portion", contingent_and_off_balance: "exclude"},
        receivables_transferred_with_recourse: {gross_financial_debt: "when_not_derecognized", net_financial_debt: "when_not_derecognized", covenant_debt: "per_definition", capacity_obligations: "retained_exposure", quasi_debt: "retained_exposure", contingent_and_off_balance: "exclude"},
        tax_installments: {gross_financial_debt: "exclude", net_financial_debt: "exclude", covenant_debt: "per_definition", capacity_obligations: "include", quasi_debt: "include", contingent_and_off_balance: "exclude"},
        acquisition_obligations: {gross_financial_debt: "exclude", net_financial_debt: "exclude", covenant_debt: "per_definition", capacity_obligations: "fixed_amount_only", quasi_debt: "fixed_amount_only", contingent_and_off_balance: "range_and_condition"},
        declared_dividends_and_jcp_payable: {gross_financial_debt: "exclude", net_financial_debt: "exclude", covenant_debt: "per_definition", capacity_obligations: "include", quasi_debt: "exclude", contingent_and_off_balance: "exclude"},
        probable_provisions: {gross_financial_debt: "exclude", net_financial_debt: "exclude", covenant_debt: "per_definition", capacity_obligations: "scheduled_outflow_not_in_cfads", quasi_debt: "exclude", contingent_and_off_balance: "exclude"},
        possible_contingencies: {gross_financial_debt: "exclude", net_financial_debt: "exclude", covenant_debt: "per_definition", capacity_obligations: "exclude", quasi_debt: "exclude", contingent_and_off_balance: "range_and_condition"},
        guarantees_given: {gross_financial_debt: "exclude", net_financial_debt: "exclude", covenant_debt: "per_definition", capacity_obligations: "exclude", quasi_debt: "when_leveraged_group_entity", contingent_and_off_balance: "guaranteed_amount"},
        related_party_loans_payable: {gross_financial_debt: "unless_formally_subordinated", net_financial_debt: "unless_formally_subordinated", covenant_debt: "per_definition", capacity_obligations: "unless_formally_subordinated", quasi_debt: "exclude", contingent_and_off_balance: "exclude"},
        pension_deficit: {gross_financial_debt: "exclude", net_financial_debt: "exclude", covenant_debt: "per_definition", capacity_obligations: "include", quasi_debt: "include", contingent_and_off_balance: "exclude"},
        authorized_not_disbursed: {gross_financial_debt: "not_a_line", net_financial_debt: "not_a_line", covenant_debt: "not_a_line", capacity_obligations: "not_a_line", quasi_debt: "not_a_line", contingent_and_off_balance: "not_a_line"},
      },
      supplierFinanceTest: {
        financingInSubstanceIfAny: [
          "a companhia paga à instituição financeira depois do vencimento original da fatura",
          "a companhia arca com desconto, juros ou tarifa do programa",
          "o prazo pago no programa excede o prazo usual de fornecedores do setor em mais de 30 dias",
        ],
        excessOverSectorTermDays: 30,
        extendedPortionFormula: "saldo do programa × (prazo do programa − prazo usual do setor) / prazo do programa",
        workingCapital: "saldo reclassificado para dívida sai de fornecedores no cálculo de PMP e de NCG",
      },
      cashRule: {
        deductible: ["caixa e equivalentes de caixa", "aplicações financeiras com liquidez em até 90 dias, sem ônus e sem risco relevante de principal"],
        notDeductible: ["caixa restrito ou vinculado", "contas reserva e escrow", "caixa dado em garantia", "caixa em entidade com restrição de transferência (D-22)", "aplicação com carência acima de 90 dias"],
        maximumLiquidityDays: 90,
        minimumOperatingCash: "não abatido da visão de mercado; entra como piso de liquidez em policy.capacity.minimum_headroom",
      },
      leaseConvention: "uma convenção por cálculo: arrendamento na dívida com EBITDA depois do CPC 06, ou fora da dívida com o pagamento de arrendamento deduzido do EBITDA; a convenção acompanha cada número (D-08)",
      doubleCountingRules: [
        "cada obrigação ocupa uma linha do ledger e participa das visões somente pela matriz",
        "provisão cujo desembolso já está deduzido do CFADS projetado não entra em capacity_obligations",
        "risco sacado reclassificado para dívida sai de fornecedores no capital de giro",
        "custo de transação nunca soma a obrigação",
      ],
      bridgeRule: "toda visão concilia com gross_financial_debt por linhas nomeadas; diferença acima de policy.reconciliation.tolerance abre exceção nomeada",
      releaseOnlyBlocks: true,
    },
  },

  "policy.debt.cost-reconciliation": {
    unit: "fração da despesa bruta de juros do período; base de dias do instrumento (252 dias úteis para DI e IPCA, convenção contratual para prefixado e moeda estrangeira)",
    title: "CPC 48 (método da taxa de juros efetiva e custos de transação) e CPC 20 (R1) (custos de empréstimos capitalizados); convenções de policy.capital.anbima-b3-conventions",
    url: CPC_48_URL,
    value: {
      period: "mesmo período da despesa reportada (trimestre, 12 meses ou exercício); saldo médio e despesa do mesmo período",
      averageBalance: {
        accepted: ["daily_average", "monthly_average", "two_point_average"],
        preferred: "daily_average",
        twoPointMaxBalanceChange: "0.20",
        closingBalanceAsAverage: "forbidden",
      },
      residualToleranceByAveraging: {daily_average: "0.02", monthly_average: "0.05", two_point_average: "0.10"},
      residualBase: "valor absoluto do resíduo não explicado depois de todos os componentes, dividido pela despesa bruta de juros do período",
      cuts: ["contrato", "credor", "indexador", "moeda", "entidade", "consolidado"],
      roundingFloor: "policy.reconciliation.tolerance, família interest",
      costMeasures: {
        cash_cost: "juros pagos em caixa no período / saldo médio, anualizado na convenção do instrumento",
        accounting_cost: "despesa pela taxa efetiva do CPC 48, com amortização de custos de transação e atualização monetária / saldo médio",
        all_in_cost: "taxa que iguala o valor líquido recebido (depois de comissões, IOF e custos de garantia) aos pagamentos de juros, principal e custos recorrentes (PR-10)",
      },
      comparisonBasis: "spread equivalente sobre o CDI na curva da data-base, no ponto de curva de market.pricing.indexer-basis (duration do contrato; vida média remanescente quando o fluxo não permite a duration, D-18); conversões de market.pricing.indexer-basis e convenções de cálculo de policy.capital.anbima-b3-conventions",
      annualization: "composição na base do instrumento (252 dias úteis para DI e IPCA; convenção contratual para prefixado e moeda estrangeira); taxa anual nunca dividida linearmente",
      bridgeComponents: [
        "juros contratuais apropriados",
        "atualização monetária (IPCA, IGP-M, TR, TJLP ou TLP)",
        "variação cambial sobre a dívida",
        "resultado de derivativos de proteção da dívida",
        "amortização de custos de transação",
        "prêmios e multas de pré-pagamento",
        "comissão de compromisso e de fiança bancária",
        "IOF apropriado ao resultado",
        "juros de arrendamento (CPC 06)",
        "encargos de risco sacado e ajuste a valor presente de fornecedores",
        "juros e multas de parcelamentos tributários",
        "atualização de provisões, inclusive as de contingências",
        "juros capitalizados em ativo qualificável (CPC 20), somados ao custo e retirados da despesa",
      ],
      separateLines: ["receitas financeiras, apresentadas à parte e nunca compensadas na ponte"],
      investigationOrder: [
        "saldo médio e datas de captação e liquidação",
        "atualização monetária e variação cambial",
        "custos amortizados e comissões",
        "capitalização de juros",
        "obrigações fora da linha de dívida (risco sacado, parcelamentos, mútuos)",
        "dívida não declarada",
      ],
      aboveTolerance: "abre causa específica por componente; dívida oculta só com evidência, nunca por automatismo",
      signConvention: "despesa positiva; receita financeira em linha própria",
    },
  },

  "policy.debt.maturity-concentration": {
    unit: "fração da dívida financeira bruta, salvo a dependência de mercado (fração do principal de 24 meses) e o limite de projeto (fração da vida remanescente); vezes (x) para fontes sobre usos; anos para vida média",
    title: "S&P Global Ratings, Methodology And Assumptions: Liquidity Descriptors For Global Corporate Issuers (16/12/2014); faixas de concentração da casa (D-03, D-18, ES-10)",
    url: SP_LIQUIDITY_URL,
    value: {
      perimeter: "consolidado e por entidade relevante",
      horizonYears: 5,
      wallWindowMonths: 36,
      bucketBasis: "janelas de 12 meses a partir da data-base; ano safra ou exercício deslocado quando a nota da companhia reporta assim",
      metrics: {
        liquidityCoverage12m: {
          formula: "fontes de 12 meses / usos de 12 meses",
          sources: ["caixa dedutível de policy.debt.views", "FFO projetado no cenário base, se positivo", "linhas comprometidas não sacadas com vencimento além de 12 meses, disponíveis sem quebra de covenant", "venda de ativo contratada com contraparte solvente"],
          uses: ["principal de toda dívida que vence em 12 meses, sem rolagem", "juros do período", "capex de manutenção e capex comprometido", "dividendos declarados", "saída de capital de giro projetada", "obrigações de capacity_obligations que vencem no período"],
          direction: "minimum",
          bands: [{band: "low", minimum: "1.5"}, {band: "moderate", minimum: "1.2"}, {band: "high", minimum: "1.0"}, {band: "critical", minimum: "0"}],
          downsideCondition: "fontes menos usos abaixo de zero no downside de policy.business_plan.scenarios leva a faixa a pelo menos high",
        },
        shortTermShare: {
          formula: "principal que vence em 12 meses / dívida financeira bruta",
          direction: "maximum",
          bands: [{band: "low", maximum: "0.20"}, {band: "moderate", maximum: "0.30"}, {band: "high", maximum: "0.40"}, {band: "critical", maximum: "1"}],
        },
        peakYearShare: {
          formula: "maior principal de uma janela de 12 meses nos próximos 5 anos / dívida financeira bruta",
          direction: "maximum",
          bands: [{band: "low", maximum: "0.20"}, {band: "moderate", maximum: "0.30"}, {band: "high", maximum: "0.40"}, {band: "critical", maximum: "1"}],
          wallAlignment: "o limite da faixa low é o limiar de parede de policy.structure.maturity_wall e acompanha aquele valor",
        },
        weightedAverageLifeYears: {
          formula: "soma(principal de cada amortização × anos até a data) / soma(principal)",
          direction: "minimum",
          bands: [{band: "low", minimum: "3"}, {band: "moderate", minimum: "2"}, {band: "high", minimum: "1"}, {band: "critical", minimum: "0"}],
        },
        marketDependence24m: {
          formula: "principal de mercado de capitais em bullet ou balão que vence em 24 meses / principal total que vence em 24 meses",
          flagAbove: "0.50",
          shareOfGrossDebtAbove: "0.10",
          shareOfGrossDebtNumerator: "principal de mercado de capitais em bullet ou balão que vence em 24 meses",
          effect: "a faixa geral sobe um nível e o memo nomeia o plano de refinanciamento com a data em que o acesso a mercado é necessário",
        },
      },
      bandBoundaries: "mínimos: o valor igual ao limite fica na faixa melhor; máximos: o valor igual ao limite fica na faixa melhor",
      overallBand: "worst_metric",
      profileAdjustments: {
        trade_finance_backed: "ACC, ACE e pré-pagamento com contrato de exportação confirmado e CPR com entrega física saem do numerador de shortTermShare e aparecem em linha própria",
        seasonal_working_capital: "linha sazonal comprometida é lida contra o pico de NCG do cenário (D-26), não contra a dívida bruta",
        project_or_concession: "vida média acima de 80% da vida remanescente do ativo ou da concessão leva a faixa a high",
      },
      projectOrConcessionMaxWalShareOfAssetLife: "0.80",
    },
  },

  "policy.debt.renewal-scenarios": {
    unit: "fração do principal que vence (0 a 1)",
    title: "S&P Global Ratings, Methodology And Assumptions: Liquidity Descriptors For Global Corporate Issuers (16/12/2014), parágrafos 23 a 30; grade de renovação da casa (D-05, D-21, D-28)",
    url: SP_LIQUIDITY_URL,
    value: {
      scenarios: ["base", "downside", "severe"],
      renewalShareByLineType: {
        committed_facility: {base: "1", downside: "1", severe: "1", condition: "somente dentro do prazo de compromisso e sem gatilho de suspensão de saque (covenant ou efeito adverso relevante) no cenário; vencido o compromisso, segue uncommitted_short_term"},
        uncommitted_short_term: {base: {rule: "historical_ratio_24m", cap: "1", withoutEvidence: "0.5"}, downside: "0.5", severe: "0", covers: ["capital de giro e CCB até 12 meses", "conta garantida", "limite rotativo sem compromisso", "crédito rural de custeio"]},
        receivables_discounting: {base: "1", downside: "0.8", severe: "0", appliesTo: "recebíveis elegíveis"},
        trade_finance_backed: {base: "1", downside: "0.75", severe: "0.5", appliesTo: "ACC, ACE e pré-pagamento com contrato de exportação confirmado"},
        supplier_finance: {base: "1", downside: "0.5", severe: "0", covers: ["risco sacado", "confirming"]},
        term_amortization: {base: "0", downside: "0", severe: "0", covers: ["dívida a prazo bancária", "BNDES", "fomento"]},
        capital_markets_maturity: {base: "0", downside: "0", severe: "0", covers: ["debênture", "nota comercial", "CRI", "CRA", "bond"], baseException: "refinanciamento contratado, ou mandatado com carta de mandato e term sheet na base"},
        related_party_loan: {base: "1", downside: "1", severe: "1", condition: "somente com subordinação formal e trava de pagamento; sem ela, zero no vencimento contratual"},
      },
      historicalRatio24m: {
        windowMonths: 24,
        formula: "valor renovado / valor vencido, por credor e por linha, com contrato e extrato",
        cap: "1",
        withoutEvidence: "sem contrato e extrato, a linha recebe a coluna downside também no base",
      },
      stepDownTriggers: {
        events: [
          "redução de limite pelo credor nos últimos 12 meses",
          "pedido de garantia adicional nos últimos 12 meses",
          "waiver, quebra de covenant ou atraso nos últimos 24 meses (D-21)",
        ],
        effect: "as linhas daquele credor recebem a coluna seguinte (base para downside, downside para severe)",
      },
      lenderConcentration: {maximumShareOfShortTermLines: "0.30", effect: "as linhas do credor acima de 30% das linhas curtas recebem a coluna seguinte"},
      eligibleReceivables: "títulos performados, não vencidos, dentro do limite por sacado do financiador e sem cessão ou ônus anterior (D-07, D-19)",
      timing: "a hipótese se aplica em cada data de vencimento; linha que vence depois do horizonte não é evento de renovação nele",
      executorMapping: "o declare-scenarios recebe uma razão de rolagem por cenário: média das colunas ponderada pelo principal que vence de cada tipo de linha no período",
    },
  },

  "policy.business_plan.scenarios": {
    unit: "fração (corte sobre EBITDA, receita ou plano); dias de giro; meses; pontos-base",
    title: "Resolução CMN nº 4.557/2017, arts. 11 e 12 (análise de sensibilidade, análise de cenários e teste de estresse reverso); S&P Liquidity Descriptors (EBITDA 15%, 30% e 50% menor); regra da casa",
    url: CMN_4557_URL,
    value: {
      scenarioSet: ["company_case", "base", "downside", "severe", "reverse_test"],
      roles: {
        company_case: "projeção da companhia sem edição, identificada como tal",
        base: "cenário da mesa de Q-10: histórico mais drivers comprovados",
        downside: "leitura prudente de capacidade (caso do banco), combinada com o downside de scenario.market.multi-factor",
        severe: "estresse combinado, com o severe de scenario.market.multi-factor",
        reverse_test: "queda de EBITDA e alta de CDI que zeram a folga do covenant mais apertado ou levam o caixa ao mínimo operacional",
      },
      projectionChallenge: {
        historyYears: 3,
        historyYearsCyclical: 5,
        revenueCagrExcessOverDelivered: "0.05",
        requiredDrivers: ["capacidade com data", "contrato assinado ou pedido firme", "preço contratado"],
        ebitdaMarginExcessOverBestYearBps: 100,
        ventureMonthlyGrowthRule: "crescimento mensal projetado acima da média dos últimos 6 meses exige driver de requiredDrivers",
        withoutDriver: "a premissa volta ao histórico no base ou vira faixa de sensibilidade; a projeção da companhia continua visível ao lado",
      },
      cyclicality: {
        measuredDrawdown: "maior queda do EBITDA de 12 meses a partir de um pico nos últimos 5 anos (série trimestral; anual quando não houver)",
        bands: [{class: "defensive", maximumDrawdown: "0.10"}, {class: "mixed", maximumDrawdown: "0.25"}, {class: "cyclical", maximumDrawdown: "1"}],
        governingClass: "a mais severa entre a lente setorial de EMP-07 e a classe medida",
      },
      ebitdaHaircut: {
        downside: {defensive: "0.10", mixed: "0.15", cyclical: "0.20"},
        severe: {defensive: "0.20", mixed: "0.30", cyclical: "0.40"},
        severeFloor: "a queda medida da própria companhia, quando maior que a faixa",
        upcycleOnlyAddOn: "0.05",
        upcycleOnlyAddOnAppliesTo: ["downside", "severe"],
        driverModelRule: "o corte da faixa é piso; o modelo por drivers pode produzir corte maior, nunca menor",
      },
      revenueShock: {
        downside: {defensive: "0.05", mixed: "0.08", cyclical: "0.10"},
        severe: {defensive: "0.10", mixed: "0.15", cyclical: "0.25"},
        costRule: "custos flexionados pela divisão documentada entre fixos e variáveis",
      },
      cfadsHaircutRule: "quando só houver agregados: corte do CFADS = corte do EBITDA × EBITDA base / CFADS base, limitado a 1, declarado como premissa própria",
      workingCapital: {
        base: "dias do último exercício (médias mensais quando sazonal)",
        downside: "pior exercício dos últimos 3, conta a conta (maior PMR, maior PME, menor PMP)",
        severeAdditionalDays: {receivables: 10, payables: -10},
      },
      capex: {
        maintenance: "preservado em todos os cenários",
        expansion: {
          base: "orçamento com o colchão de policy.transaction-sizing.execution-buffer",
          downside: {overrunMultipleOfBuffer: "1", rampUpDelayMonths: 6},
          severe: {overrunMultipleOfBuffer: "2", rampUpDelayMonths: 12, steadyStateShareOfPlan: "0.90"},
        },
      },
      archetypeRules: byArchetype({
        working_capital: {granularity: "monthly", horizonMonths: 24, rule: "o downside coloca o pior mês de NCG dos últimos 24 no primeiro pico projetado"},
        growth_expansion: {granularity: "monthly_during_construction_then_quarterly", rule: "atraso de ramp-up e sobrecusto conforme capex.expansion"},
        acquisition: {granularity: "quarterly", synergies: {base: "somente com evidência (contrato ou ação executada), com 6 meses de atraso", downside: "0", severe: "0"}, severeIntegrationCostIncrease: "0.50"},
        refinance: {granularity: "quarterly", rule: "cenários operacionais do setor da companhia; acesso a mercado e spread de nova dívida vêm de scenario.market.multi-factor"},
        equipment_finance: {granularity: "quarterly", utilizationShock: {downside: "0.15", severe: "0.30"}},
        venture_debt: {granularity: "monthly", nextRound: {downside: "atraso de 6 meses", severe: "sem rodada em 12 meses"}, downsideRevenueGrowthShareOfPlan: "0.50", burnCut: "somente com plano aprovado pelo conselho e ações já iniciadas"},
        other: {granularity: "quarterly", rule: "regra geral por ciclicidade"},
      }),
      seasonality: "receita ou capital de giro com sazonalidade moderada ou alta pela régua de policy.seasonality.materiality (EMP-08) leva os três cenários para base mensal por pelo menos 24 meses",
      reverseTest: {ebitdaHaircutStep: "0.05", ebitdaHaircutMaximum: "0.50", cdiShockStepBps: 100, cdiShockMaximumBps: 500, outputs: ["corte de EBITDA que zera a folga", "corte de EBITDA que leva o caixa ao mínimo operacional", "choque de CDI equivalente", "grade de duas variáveis com a célula de ruptura"]},
      coherence: "cada cenário é um conjunto coerente de drivers; percentual aplicado só ao resultado final não é cenário",
    },
  },

  "policy.capacity.minimum_headroom": {
    unit: "fração do limite do covenant; vezes (x) para fontes sobre usos; dias e meses",
    title: "S&P Global Ratings, Liquidity Descriptors For Global Corporate Issuers (16/12/2014), liquidez adequada: folga para EBITDA 15% menor e dívida 15% abaixo do limite; Lei 6.404/1976, art. 202",
    url: SP_LIQUIDITY_URL,
    value: {
      // Case 01 draft of 05/09/2026, kept.
      minimumRelativeHeadroomAdverse: "0.10",
      rule: "capacidade de nova dívida medida contra o limite aplicável no cenário adverso declarado; abaixo do limiar a estrutura muda antes de apresentar",
      legacyFieldScope: "o campo do Caso 01 vale para os perfis defensivo e misto; o cíclico usa adverseMinimumByProfile, e o bloqueio vale nas datas de teste de hardGateMonths",
      headroomFormula: "máximo: (limite − métrica) / limite; mínimo: (métrica − limite) / limite; o percentual de calculateCovenantHeadroom (financial-core)",
      baseMinimumFrom: "policy.structure.covenant_headroom",
      adverseMinimumByProfile: {defensive: "0.10", mixed: "0.10", cyclical: "0.15"},
      hardGateMonths: 24,
      afterHardGate: "folga adversa abaixo do mínimo depois de 24 meses vai ao memo com data, magnitude e step-down redesenhado (ES-23)",
      severe: {minimum: "0", effect: "disclosure", rule: "quebra no severo é informada com data, magnitude e caminho de cura; não bloqueia"},
      projectConstruction: "durante a obra vale o covenant de conclusão física (ES-09); a folga financeira passa a ser exigida no primeiro teste depois da conclusão atestada",
      liquidityFloor: {
        minimumOperatingCashDays: 30,
        minimumOperatingCashBasis: "média diária dos desembolsos operacionais de caixa dos últimos 12 meses, sem capex e sem serviço da dívida; o valor da política de tesouraria da companhia prevalece quando maior e documentado",
        highSeasonalityWorkingCapital: "com capital de giro de sazonalidade alta pela régua de policy.seasonality.materiality, o caixa mínimo é o maior entre o valor acima e o pico de necessidade intra-anual de capital de giro do downside",
        countsTowardFloor: ["caixa dedutível de policy.debt.views", "linha comprometida não sacada disponível sem quebra de covenant"],
        sourcesToUses12m: {base: "1.2", adverse: "1.0"},
        coverageFormulasKey: "policy.cash-flow.bridge",
        breachEffect: "caixa abaixo do mínimo operacional em qualquer período do adverso redimensiona a operação (ES-40)",
      },
      horizonByArchetype: {
        working_capital: {months: 18, granularity: "monthly"},
        growth_expansion: {monthsAfterConstructionEnd: 24, granularity: "monthly_during_construction_then_quarterly"},
        acquisition: {months: 24, granularity: "quarterly"},
        refinance: {months: 24, granularity: "quarterly"},
        equipment_finance: {months: 24, granularity: "quarterly"},
        venture_debt: {monthsAfterDebtMaturity: 6, granularity: "monthly"},
        other: {months: 24, granularity: "quarterly"},
      },
      highSeasonalityGranularity: {granularity: "monthly", trigger: "sazonalidade alta pela régua de policy.seasonality.materiality, em qualquer arquétipo"},
      distributions: {
        freeIf: {baseHeadroomAfterDistribution: "0.15", adverseHeadroomAfterDistribution: "adverseMinimumByProfile (0,10; 0,15 no cíclico)"},
        otherwise: "distribuição limitada ao dividendo mínimo obrigatório do art. 202 da Lei 6.404/1976; conta reserva abaixo do saldo exigido trava qualquer valor acima do mínimo (ES-17)",
      },
      additionalDebt: {
        baseHeadroomAfterIncurrence: "0.15",
        adverseHeadroomAfterIncurrence: "adverseMinimumByProfile (0,10; 0,15 no cíclico)",
        seasonalBasket: "pico de NCG do downside de policy.business_plan.scenarios",
        relatedPartyLoans: "mútuos com partes relacionadas contam no teto quando RF-09 estiver presente",
      },
    },
  },

  "scenario.interest_rate.parallel_shock": {
    unit: "pontos-base sobre a curva a termo; razão decimal para o executor",
    title: "BCBS, Interest rate risk in the banking book (abril de 2016), tabela 1: choque paralelo de 400 pontos-base para BRL; calibração da casa sobre a série SGS 4189 do Banco Central",
    url: BCBS_IRRBB_URL,
    value: {
      // Case 01 draft of 05/09/2026, kept: base curve, adverse default, horizon and rule.
      baseCurve: "curva DI da B3 e ETTJ ANBIMA na data-base do source pack",
      shocksBps: [100, 200, 300, 400],
      adverseDefault: 200,
      horizonMonths: 12,
      rule: "choque paralelo sobre a parcela pós-fixada; hedge só quando contratado e documentado",
      roles: {isolatedSensitivityOnly: 100, adverse: 200, severe: 300, tail: 400},
      bankCaseRole: "adverse: o caso do banco é o downside de scenario.market.multi-factor",
      ratio: {"100": "0.01", "200": "0.02", "300": "0.03", "400": "0.04"},
      applicationByIndexer: {
        cdi_plus_spread: "choque integral sobre o CDI; spread contratual mantido",
        cdi_percentage: "CDI chocado e taxa recalculada pela convenção do percentual do DI",
        selic: "choque integral",
        tjlp: "metade do choque",
        ipca_or_tlp: "sem choque de CDI; recebe o choque de inflação de scenario.market.multi-factor",
        prefixed: "sem choque no contrato vigente; refinanciamento dentro do horizonte toma a curva chocada",
        foreign_currency: "fora desta chave, pós-fixada ou prefixada; scenario.market.multi-factor",
      },
      tjlpShare: "0.5",
      hedge: "swap ou opção contratados e documentados reduzem o saldo exposto (hedgeOffset de applyRateShock); hedge pretendido não conta",
      shockedInterestFormula: "saldo médio exposto × (taxa a termo do período + choque) − efeito do hedge contratado (applyRateShock)",
      compositionGap: "em CDI mais spread, a composição de market.pricing.indexer-basis eleva a taxa em choque × (1 + spread); a fórmula do executor soma o choque, e a diferença, choque × spread, fica registrada até o alinhamento do executor",
      persistence: "deslocamento de nível de toda a curva a termo por todo o horizonte da projeção; o efeito de 12 meses é reportado à parte",
      downwardBps: [-100, -200],
      downwardUse: "somente para posição líquida credora em CDI, custo de oportunidade de dívida prefixada e valor da opção de pré-pagamento",
      reverseTest: {stepBps: 25, maximumBps: 1000, target: "menor choque que zera a folga do covenant mais apertado ou leva o caixa ao mínimo operacional"},
      calibration: {
        series: "BCB SGS 4189 (Selic acumulada no mês, anualizada)",
        windows: "266 janelas de 12 meses iniciadas entre julho de 2003 e agosto de 2025, meses completos",
        shareOfWindowsAtOrAbove: {"100": "0.395", "200": "0.305", "300": "0.169", "400": "0.083", "500": "0.049"},
        bcbsIrrbbBrlParallelBps: 400,
      },
    },
  },

  "scenario.market.multi-factor": {
    unit: "pontos-base para juros e inflação; fração para câmbio e choques operacionais",
    title: "Resolução CMN nº 4.557/2017, art. 11, IV (análise de cenários: variações simultâneas e coerentes de um conjunto de parâmetros); calibração da casa sobre as séries SGS 4189, 13522 e 3698 do Banco Central",
    url: CMN_4557_URL,
    value: {
      scenarios: {
        base: {
          rates: "curva a termo DI da B3 ou ETTJ ANBIMA da data-base, sem choque",
          inflation: "mediana Focus para os anos cobertos; inflação implícita da ETTJ ANBIMA além deles",
          fx: "mediana Focus para o fim de cada ano coberto; câmbio a termo implícito no cupom cambial além deles",
          newDebtSpread: "spread atual da companhia ou referência vigente de market.pricing.curves",
          marketAccess: "open",
          operating: "base de policy.business_plan.scenarios",
        },
        downside: {cdiShock: {key: "scenario.interest_rate.parallel_shock", role: "adverse"}, ipcaShockBps: 150, brlDepreciation: "0.15", newDebtSpreadShockBps: 100, marketAccess: "open_at_shocked_spread", operating: "downside de policy.business_plan.scenarios"},
        severe: {cdiShock: {key: "scenario.interest_rate.parallel_shock", role: "severe"}, ipcaShockBps: 300, brlDepreciation: "0.30", newDebtSpreadShockBps: 200, marketAccess: "closed_12_months", operating: "severe de policy.business_plan.scenarios"},
      },
      precedence: {
        rateShock: "scenario.interest_rate.parallel_shock",
        operatingShocks: "policy.business_plan.scenarios",
        isolatedFxSensitivity: "policy.currency.exposure",
        thisKey: "combinação, inflação, câmbio dos cenários combinados, spread de nova dívida e acesso a mercado",
      },
      mapping: {declareScenariosAdverse: "downside", reviewBankCase: "downside", reviewStress: "severe"},
      shockTiming: "instantâneo na data-base e persistente por todo o horizonte da projeção",
      minimumProjectionYears: 3,
      fxDefinition: "depreciação do real = taxa em reais por moeda estrangeira no cenário / taxa do base − 1; a mesma variação vale para outras moedas contra o real salvo evidência de correlação diferente",
      correlationRules: [
        "receita em moeda estrangeira ou dolarizada: a depreciação aumenta a receita em reais na proporção da receita exposta",
        "custo em moeda estrangeira: a depreciação aumenta o custo; repasse a preço só com histórico documentado e defasagem declarada",
        "receita indexada ao IPCA por contrato ou tarifa: o choque de inflação entra na receita com a defasagem do reajuste",
        "dívida em moeda sem hedge: saldo e serviço convertidos pela taxa do cenário; com hedge, vale o hedge contratado",
        "dívida em IPCA: o choque de inflação aumenta a atualização do saldo e os juros sobre o saldo atualizado",
        "o choque de CDI não alcança dívida prefixada vigente; nova dívida e rolagens tomam a curva chocada mais o choque de spread",
      ],
      coherenceTests: ["o severe nunca é mais brando que o downside em nenhum fator", "fator sem exposição na companhia é declarado sem efeito, nunca omitido"],
      calibration: {
        series: {selicAsCdiProxy: "BCB SGS 4189 (Selic)", ipca: "BCB SGS 13522", fx: "BCB SGS 3698"},
        windows: "266 janelas de 12 meses iniciadas entre julho de 2003 e agosto de 2025, meses completos",
        shareOfWindowsAtOrAbove: {
          downside: {cdi200Bps: "0.305", ipca150Bps: "0.229", brlDepreciation15: "0.244"},
          severe: {cdi300Bps: "0.169", ipca300Bps: "0.079", brlDepreciation30: "0.098"},
        },
      },
    },
  },

  "scenario.short_term_non_renewal": {
    unit: "fração do principal que vence; meses de pista",
    title: "S&P Global Ratings, Liquidity Descriptors For Global Corporate Issuers (16/12/2014): usos incluem todos os vencimentos e linhas não comprometidas não são fonte; cenário de não renovação da casa (D-28)",
    url: SP_LIQUIDITY_URL,
    value: {
      scenarioId: "no_rollover",
      operatingBase: "CFADS do base de policy.business_plan.scenarios; a versão combinada entra no severe de scenario.market.multi-factor, com a operação severa",
      horizonMonths: 12,
      granularity: "monthly",
      renewalShare: {
        uncommitted_short_term: "0",
        receivables_discounting: "0",
        supplier_finance: "0",
        trade_finance_backed: "0.5",
        term_amortization: "0",
        capital_markets_maturity: "0",
        committed_facility: "1",
        related_party_loan: "1",
      },
      conditions: {
        committed_facility: "somente dentro do prazo de compromisso e sem gatilho de suspensão de saque no cenário",
        related_party_loan: "somente com subordinação formal e trava de pagamento",
      },
      supplierFinanceNoticeDays: 30,
      supplierFinanceMechanics: "o programa termina na data-base mais o aviso contratual (30 dias quando o contrato não fixa); as faturas passam a vencer no prazo original do fornecedor e a diferença sai do caixa no mês do término",
      discountingMechanics: "sem novo desconto; títulos já descontados são liquidados pelo sacado ao financiador; vendas novas recebem no prazo normal",
      allowedResponses: [
        "caixa dedutível",
        "linha comprometida não sacada, nas condições acima",
        "venda de ativo contratada com contraparte solvente",
        "aporte com compromisso assinado e prova de recursos",
        "adiamento de capex de expansão não contratado",
        "suspensão de dividendo ainda não declarado",
      ],
      forbiddenResponses: [
        "dívida nova não contratada",
        "rolagem inferida do histórico",
        "venda de ativo não contratada",
        "corte de capex de manutenção",
        "alongamento de prazo de fornecedores",
      ],
      floor: "caixa mínimo operacional de policy.capacity.minimum_headroom",
      runway: "meses até o primeiro fechamento abaixo do piso",
      runwayBands: [{band: "sustained", minimumMonths: 12}, {band: "rollover_dependent", minimumMonths: 6}, {band: "acute", minimumMonths: 0}],
      outputs: ["pista em meses", "déficit acumulado por mês", "pico de déficit e data", "efeito por linha"],
      executorMapping: "o cenário no_rollover do declare-scenarios (rolloverAllowed false) aplica zero a todo o principal, mais conservador que esta grade no ACC lastreado, na linha comprometida e no mútuo subordinado; a leitura por linha desta chave é a do D-28 sobre o ledger",
    },
  },

  "policy.transaction-sizing.materiality": {
    unit: "fração da necessidade calculada; R$",
    title: "House Playbook Offroad v2.1, OP-01, OP-02, OP-07 e ES-45 (política da casa)",
    url: HOUSE_PLAYBOOK_URL,
    value: {
      thresholdFormula: "max(fração × necessidade calculada, piso absoluto convertido para a unidade do caso)",
      shareOfCalculatedNeedByArchetype: byArchetype({
        working_capital: "0.10",
        growth_expansion: "0.05",
        acquisition: "0.03",
        refinance: "0.02",
        equipment_finance: "0.02",
        venture_debt: "0.10",
        other: "0.05",
      }),
      absoluteFloorBrl: "250000",
      requestVersusNeed: "abs(pedido − necessidade calculada) acima do limiar: conversa com a companhia, com a conta aberta, antes da estrutura; segue o calculado ou o acordado registrado",
      excessFunding: "excedente = pedido − necessidade calculada; o carrego é calculado sobre todo o excedente; acima do limiar e sem justificativa registrada, a estrutura fica travada até a conversa",
      residualUseLine: {maximumShareOfTotalUses: "0.01", rule: "uso sem âncora acima do menor valor entre 1% do total de usos e o limiar é aberto item a item; abaixo, fica nomeado"},
      sizingDifferences: "diferenças entre pedido, calculado e proposto acima do limiar exigem justificativa escrita; abaixo, ficam registradas com o motivo",
      roundLots: [{maxProposedBrl: "50000000", stepBrl: "1000000"}, {maxProposedBrl: "500000000", stepBrl: "5000000"}, {maxProposedBrl: null, stepBrl: "25000000"}],
      roundingRule: "o proposto pode subir ao lote seguinte somente dentro do limiar e do envelope de ES-03",
      methodField: "deal-structure OperationPolicies.sizingMateriality recebe o limiar já calculado, na unidade do caso",
    },
  },

  "policy.transaction-sizing.residual": {
    unit: "unidade de registro do caso (a menor entre as fontes)",
    title: "House Playbook Offroad v2.1, OP-02: sources and uses fechando ao centavo (política da casa)",
    url: HOUSE_PLAYBOOK_URL,
    value: {
      tolerance: "0",
      toleranceAppliesTo: "qualquer moeda e escala (R$, R$ mil, R$ milhões, US$, US$ mil e outras)",
      unitOfRecord: "menor unidade entre as fontes (centavos quando alguma linha vem em reais); escalas convertidas antes da soma",
      displayRounding: "largest_remainder",
      displayRule: "a tabela exibida em mil ou milhões soma exatamente o total exibido pelo método do maior resto; linha de ajuste de arredondamento é proibida",
      foreignCurrency: "linha em moeda estrangeira convertida pela taxa e data declaradas, com âncora; a diferença cambial até o desembolso é linha nomeada",
      closingLine: "a dívida nova fecha a identidade; linha sem âncora é proibida",
      failure: "diferença diferente de zero reprova o S&U (sources-uses-mismatch, crítico)",
      methodField: "deal-structure OperationPolicies.residualTolerance = 0",
    },
  },

  "policy.transaction-sizing.execution-buffer": {
    unit: "fração da base de custo; dias de juros; meses",
    title: "IBRAOP, Orientação Técnica OT-IBR 004/2012, Precisão do orçamento de obras públicas, Quadro 1; colchões da casa por arquétipo",
    url: IBRAOP_URL,
    value: {
      growth_expansion: {
        basis: "custo orçado de cada bloco ainda não contratado a preço fechado",
        byBudgetMaturity: {estudos_preliminares: "0.30", anteprojeto: "0.20", projeto_basico: "0.10", projeto_executivo: "0.05"},
        fixedPriceContractWithPerformanceBond: "0.03",
        indicativeOnly: ["estudos_preliminares"],
      },
      equipment_finance: {domesticFirmQuote: "0", importedUnhedged: "0.10", importedHedged: "0", basis: "parcela em moeda estrangeira do preço"},
      working_capital: {shareOfPeakIncrementalNeed: "0.10"},
      acquisition: {fixedPrice: "0", priceAdjustment: {withContractualCap: "contractual_cap", withoutCapShareOfPrice: "0.05"}, earnOut: "fora do colchão; obrigação condicionada (D-14)"},
      refinance: {accruedInterestDays: 30, rule: "juros de 30 dias sobre o saldo refinanciado para deslize da data de liquidação; prêmio de pré-pagamento é uso contratual, não colchão"},
      venture_debt: {share: "0", runwayMonthsAfterMilestone: 6, rule: "dimensionamento por pista até o marco mais 6 meses"},
      other: {share: "0.05"},
      carryAllowanceOverCalculatedNeed: "0",
      precedence: "contingência explícita e documentada do orçamento da companhia substitui o colchão da casa somente quando for maior",
      unusedBuffer: "tranche condicionada (OP-08) é a forma preferida; colchão sacado e não usado amortiza a dívida ao fim da obra",
      methodFields: "transaction.execution_buffer recebe o valor em moeda (fração × base); calculateExcessFundingCarry recebe authorizedBuffer = 0 porque o colchão já está na necessidade calculada",
    },
  },

  "policy.transaction-costs": {
    unit: "fração do principal (provisão da casa); valores de tabela oficial pela chave que os governa",
    title: "Lei nº 7.940/1989, Anexo IV (taxa de fiscalização da CVM sobre oferta pública); CPC 48 (custos de transação na taxa efetiva); catálogo de custos da casa",
    url: LEI_7940_URL,
    value: {
      catalogue: [
        {id: "structuring_and_arrangement_fee", instruments: ["all"], timing: "upfront", usualTreatment: "withheld"},
        {id: "underwriting_and_distribution_fee", instruments: ["debenture", "commercial_note", "cri", "cra", "fidc"], timing: "upfront", usualTreatment: "withheld"},
        {id: "legal_counsel", instruments: ["all"], timing: "upfront", usualTreatment: "paid_from_cash"},
        {id: "cvm_offering_fee", instruments: ["debenture", "commercial_note", "cri", "cra", "fidc"], condition: "somente em oferta pública", priceSource: "policy.pricing.cost-catalogue, publicTables.cvmOfferSupervisionFee", timing: "protocolo do pedido de registro, ou encerramento com êxito da oferta dispensada de registro", legalBasis: "Lei 7.940/1989, art. 5º e Anexo IV"},
        {id: "b3_registration_deposit_and_listing", instruments: ["debenture", "commercial_note", "cri", "cra", "fidc"], priceSource: "tabela pública vigente da B3 na data"},
        {id: "anbima_offering_registration", instruments: ["debenture", "commercial_note", "cri", "cra", "fidc"], priceSource: "tabela vigente da ANBIMA na data"},
        {id: "fiduciary_agent_initial", instruments: ["debenture", "cri", "cra"]},
        {id: "bookkeeper_and_settlement_agent_initial", instruments: ["debenture", "commercial_note", "cri", "cra"]},
        {id: "rating_initial", instruments: ["quando exigido pela oferta ou pelo mandato"]},
        {id: "securitizer_structuring", instruments: ["cri", "cra"]},
        {id: "fund_setup", instruments: ["fidc"], note: "administrador, custodiante, gestor, auditor e agente de cobrança"},
        {id: "collateral_registration", instruments: ["garantia real"], note: "registro de imóveis, títulos e documentos e registradora de recebíveis; emolumentos pela tabela estadual"},
        {id: "appraisal_reports", instruments: ["garantia real"]},
        {id: "independent_engineer", instruments: ["project", "growth_expansion"]},
        {id: "iof_credit", instruments: ["bank_loan", "ccb"], rateSource: "policy.capital.iof", usualTreatment: "withheld"},
        {id: "iof_fx_and_withholding_gross_up", instruments: ["loan_4131"], rateSource: "policy.capital.iof e policy.capital.tax-regime"},
        {id: "swap_or_hedge_setup", instruments: ["loan_4131", "dívida em IPCA com swap"]},
        {id: "prepayment_premium_on_refinanced_debt", archetypes: ["refinance"], note: "uso da operação, pelo contrato da dívida quitada"},
        {id: "bridge_fees", instruments: ["bridge"]},
      ],
      treatments: {
        withheld: "reduz o valor liberado; o S&U mostra a dívida bruta como fonte e o custo como uso",
        paid_from_cash: "consome caixa da companhia; entra em feesPaidFromCash no pró-forma (OP-03)",
        financed: "aumenta o principal; juros e dimensionamento refletem o valor financiado",
      },
      accounting: "custos incrementais de transação entram na taxa efetiva (CPC 48) e ficam como linha contra da dívida (policy.debt.views)",
      recurringCosts: "fora do S&U; anualização e custo all-in em policy.pricing.cost-catalogue (PR-10)",
      costStatesAndSourceHierarchy: {key: "policy.pricing.cost-catalogue", fields: ["costState", "sourceHierarchy"], rule: "a provisão desta chave é a quarta fonte daquela hierarquia e dá ao custo o estado estimado"},
      houseProvisionUpfrontShareOfPrincipal: {
        bank_loan_bilateral: {low: "0.005", high: "0.015"},
        commercial_note_or_debenture: {low: "0.015", high: "0.030"},
        cri_cra: {low: "0.025", high: "0.045"},
        fidc: {low: "0.020", high: "0.040"},
        development_bank_onlending: {low: "0.005", high: "0.010"},
        loan_4131_with_swap: {low: "0.005", high: "0.015"},
      },
      provisionExcludes: ["IOF", "prêmio de pré-pagamento da dívida quitada", "tributos sobre remessa ao exterior"],
      provisionUse: "a necessidade calculada usa o limite superior; o S&U mostra a linha como provisão da casa com a faixa; nenhum material externo apresenta provisão como cotação; cotação substitui a provisão antes do term sheet (MA-18)",
    },
  },

  "policy.disbursement.lag": {
    unit: "dias corridos, salvo os campos em dias úteis; meses",
    title: "BNDES, Etapas do financiamento: acompanhamento e liberação de recursos simultânea à execução do projeto; defasagens da casa (OP-08, OP-11)",
    url: BNDES_STAGES_URL,
    value: {
      maxUncoveredMonths: 0,
      maxLeadMonthsByArchetype: byArchetype({working_capital: 1, growth_expansion: 3, acquisition: 0, refinance: 0, equipment_finance: 1, venture_debt: 3, other: 1}),
      closingFundingWindowBusinessDays: {acquisition: 5, refinance: 5},
      maxLagDaysCoveredByOwnCash: byArchetype({working_capital: 0, growth_expansion: 60, acquisition: 0, refinance: 0, equipment_finance: 30, venture_debt: 30, other: 30}),
      expectedReleaseLagDaysByMechanism: {
        independent_engineer_measurement: 45,
        development_bank_onlending: 60,
        bank_tranche_after_milestone: 15,
        supplier_payment_on_delivery: 0,
        capital_markets_single_settlement: 0,
      },
      ownCashEvidence: "extrato e caixa acima do mínimo operacional de policy.capacity.minimum_headroom durante toda a defasagem",
      leadExcess: "liberação à frente do gasto além do adiantamento máximo volta ao OP-07 como excedente, com conta vinculada e rendimento declarados",
      test: "mês a mês; um único mês descoberto bloqueia",
    },
  },

  "policy.mixed-use.general-purpose": {
    unit: "fração do total de usos",
    title: "Lei nº 12.431/2011, art. 2º, § 5º (multa de 20% sobre o valor captado não alocado no projeto); Lei nº 14.801/2024, art. 2º, § 1º; Resolução CMN nº 5.118/2024; teto da casa para usos gerais",
    url: LEI_12431_URL,
    value: {
      maxShareOfTotalUses: "0.10",
      earmarkedInstrumentsMaxShare: "0",
      earmarkedInstruments: [
        "debênture incentivada (Lei 12.431/2011)",
        "debênture de infraestrutura (Lei 14.801/2024)",
        "CRI, CRA e CDCA (lastro pela Resolução CMN 5.118/2024)",
        "financiamento ou repasse BNDES, Finame, FINEP e fundos constitucionais",
        "crédito rural",
        "título rotulado verde, social ou sustentável por uso de recursos (não inclui título vinculado a metas, sustainability-linked, que não restringe o uso)",
      ],
      blocks: {
        productive: ["capex de expansão", "capital de giro incremental da expansão (OP-06)", "preço de aquisição", "equipamentos"],
        remediation: ["refinanciamento de dívida, contrato a contrato", "quitação de passivo vencido (tributário, trabalhista, fornecedores)", "recomposição de capital de giro consumido"],
        reinforcement: ["caixa de liquidez acima do mínimo operacional", "pré-pagamento voluntário"],
        general_corporate_purpose: ["usos sem destinação identificada"],
      },
      refinancingNeverGeneralPurpose: true,
      aboveCap: "acima de 10%, a destinação é aberta item a item com âncora e reclassificada nos blocos",
      narrative: "o parágrafo começa pelo bloco produtivo; o saneamento aparece com principal, custo e vencimento da dívida alongada",
      methodField: "deal-structure OperationPolicies.generalPurposeCap recebe o valor em moeda (0,10 × total de usos)",
    },
  },

  "policy.wait-analysis": {
    unit: "meses; vezes (x) entre ganho esperado e custo de esperar",
    title: "House Playbook Offroad v2.1, OP-12: quando a resposta é esperar (política da casa)",
    url: HOUSE_PLAYBOOK_URL,
    value: {
      maxWaitMonths: 12,
      milestoneRequirements: ["objetivo", "datado", "com evidência documental", "com responsável", "com probabilidade declarada e fundamentada"],
      milestoneExamples: ["parecer de auditoria do exercício", "fechamento de safra", "assinatura de contrato relevante", "trimestre reportado", "licença emitida", "conclusão física atestada", "rating atribuído", "cura de covenant ou quitação de passivo"],
      waitingCostComponents: [
        "diferença de custo entre a dívida atual ou a ponte e a operação pretendida, pelo período de espera",
        "margem de contribuição perdida pelo atraso do uso",
        "custos fixos refeitos (jurídico, laudos, auditoria extra)",
      ],
      expectedGainComponents: [
        "redução de spread × principal × duration modificada da nova dívida",
        "aumento de envelope de ES-01 valorado pelo uso que ele destrava",
        "melhora de termos valorada (prazo, carência, garantia liberada)",
        "custo evitado de waiver ou de cura",
      ],
      probabilityRule: "ganho esperado = probabilidade do marco × ganho; probabilidade sem fundamento documental conta como zero",
      ratio: "ganho esperado / custo de esperar, na mesma moeda",
      marketRisk: {
        breakEvenSpreadWideningBps: "(ganho esperado − custo de esperar) / (principal × duration modificada) × 10.000",
        compareWith: {
          floatingRateTarget: "choque de spread do downside de scenario.market.multi-factor (100 pontos-base)",
          fixedRateTarget: "as duas comparações, em separado: o choque de spread do downside (100 pontos-base) e o adverseDefault de scenario.interest_rate.parallel_shock (200 pontos-base)",
        },
        effect: "ponto de equilíbrio abaixo do choque de comparação é informado: o ganho líquido não resiste ao downside de mercado",
      },
      liquidityCondition: {scenario: "no_rollover", runwayMonthsBeyondWait: 6, rule: "sem pista para a espera mais 6 meses, esperar sai do conjunto de alternativas", horizonRule: "quando a espera mais 6 meses passa dos 12 meses de scenario.short_term_non_renewal, o cenário é estendido até esse prazo"},
      gainEvidence: "prêmio de spread e de envelope só com referência vigente (market.pricing.curves, policy.structure.leverage-bands); sem referência aprovada, o ganho é faixa condicionada e a leitura da casa fica pendente",
      houseReading: {waitAtOrAboveRatio: "1.5", proceedBelowRatio: "1.0", between: "a decisão depende de fatores não quantificados, listados na entrega"},
      discounting: "custo de esperar somado no período, sem desconto; ganho de spread pela duration modificada, que já equivale ao valor presente da economia",
      decisionOwner: "companhia",
      revisitTriggers: ["marco atrasado mais de 3 meses", "mudança de regime em policy.pricing.regime", "mudança material da operação declarada (OP-14)"],
    },
  },
};

export const debtScenarioProposals: ReferenceDataProposalFamily = Object.freeze(
  Object.fromEntries(Object.entries(drafts).map(([key, draft]) => [key, proposal(key, draft)])),
);
