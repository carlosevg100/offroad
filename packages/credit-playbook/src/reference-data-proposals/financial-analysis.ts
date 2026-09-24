import type {ReferenceDataProposalFamily} from "./types";

/**
 * Financial analysis: reconciliation, materiality, normalization, cash-flow bridge, capex, revenue
 * quality, related parties, seasonality, currency, receivables, concentration and peer ranges.
 *
 * Every value is a draft that awaits the founder's review. Numbers are decimal strings or integers
 * whose unit is carried by the field name (`Share` fraction from 0 to 1, `Pp` percentage points as
 * a fraction, `Multiple` times, `Days`, `Months`, `FiscalYears`, `Brl`, `BrlThousand`) and by the
 * `units` legend of each value. The full professional text of each key is its card in
 * `knowledge/reference-data/financial-analysis.md`.
 */
const version = "2026.09.24-v1";
const asOf = "2026-09-24";
const observedBy = "Offroad (Claude, executor), 24/09/2026, aguardando revisão do fundador";
const card = (key: string) => `knowledge/reference-data/financial-analysis.md#${key}`;

const units = {
  Share: "fração decimal de 0 a 1 do benchmark nomeado no campo",
  Pp: "pontos percentuais expressos em fração (0.03 = 3 p.p.)",
  Multiple: "vezes (x)",
  Days: "dias corridos",
  Months: "meses",
  FiscalYears: "exercícios sociais",
  Closings: "fechamentos contábeis",
  Brl: "reais",
  BrlThousand: "mil reais",
} as const;

export const financialAnalysisProposals: ReferenceDataProposalFamily = {
  /**
   * Kept byte-identical at the version the recorded Case 01 runs cite: the reconciliation executor
   * checks key and version, and the gc01 case passes the registry version 2026.09.05-v9. A new
   * version would make the frozen case and the integration preview refuse their input.
   */
  "policy.reconciliation.tolerance": {
    version: "2026.09.05-v9",
    value: {
      absolute: "0",
      families: {working_capital: "1000", net_debt: "1000", interest: "2000"},
      familiesUnit: "BRL thousand",
      rule: "toda diferença é nomeada e explicada; a tolerância por família cobre só o arredondamento entre uma fonte em R$ milhões com uma casa (release) e uma em R$ mil (notas), ou a agregação de juros e variações; nenhuma tolerância acima de zero sem chave e versão de política no resultado",
      roundingExplanation: "diferença igual ao arredondamento da fonte é explicada como arredondamento, não tolerada",
    },
    unit: "BRL thousand por família; zero nas identidades exatas e nas famílias não listadas",
    source: {
      title: "CPC 26 (R1) Apresentação das Demonstrações Contábeis, itens 51(e) e 53 (nível de arredondamento divulgado), mantidos no CPC 51, itens 27(e) e B11; regra do fundador de 4/9/2026 (nenhuma diferença sem nome) aplicada pelo executor reconcile-financial-statements v9",
      url: "https://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos/Pronunciamento?Id=57",
      observedBy,
    },
    asOf,
    documentation: card("policy.reconciliation.tolerance"),
  },

  "policy.financial.materiality": {
    version,
    value: {
      units,
      benchmarks: {
        ebitda: "EBITDA ajustado pela Offroad dos últimos doze meses (Q-01), no perímetro, na data-base e na convenção de arrendamentos da métrica testada",
        netRevenue: "receita líquida dos últimos doze meses",
        grossDebt: "dívida financeira bruta da visão aplicável de D-24 na data-base",
        totalAssets: "ativo total consolidado na data-base",
        averageNetWorkingCapital: "média mensal da necessidade de capital de giro de Q-04, com fornecedores fora do risco sacado",
      },
      individual: {
        ebitdaShare: "0.01",
        netRevenueShare: "0.005",
        grossDebtShare: "0.01",
        totalAssetsShare: "0.005",
        leverageDeltaMultiple: "0.05",
        coverageDeltaMultiple: "0.05",
        covenantHeadroomConsumedShare: "0.10",
      },
      aggregate: {sameDirectionSumShareOfIndividual: "1.00", includesDifferencesClosedWithinTolerance: true},
      clearlyTrivialShareOfIndividual: "0.05",
      evidenceQualityMultiplier: {
        audited_unmodified: "1.00",
        audited_modified_or_reviewed_interim: "0.75",
        management_accounts_or_unaudited: "0.50",
      },
      lowEbitdaFallback: {
        appliesWhenEbitdaMarginBelowShare: "0.03",
        appliesWhenEbitdaNotPositive: true,
        incomeStatementItems: "netRevenueShare",
        balanceSheetItems: "totalAssetsShare",
      },
      covenantProximity: {headroomBelowShare: "0.15", lookAheadMonths: 24, consumedShareMaterial: "0.10"},
      workingCapitalPhoto: {
        photoEffectShareOfAverage: "0.10",
        photoEffectAlsoAtLeastIndividual: true,
        daysDivergenceMinimumDays: 5,
        daysDivergenceMinimumShare: "0.10",
      },
      trialBalanceBias: {
        biasIndex: "(soma das diferenças favoráveis à administração - soma das desfavoráveis) / soma dos valores absolutos, nas contas acima do claramente trivial",
        favorableMeans: "aumenta receita, EBITDA ou patrimônio, ou reduz dívida",
        biasIndexThreshold: "0.60",
        consecutiveAnnualClosings: 2,
        quarterlyFavorableClosings: 3,
        quarterlyWindowClosings: 4,
        netFavorableEffectAtLeastIndividual: true,
      },
      laborRecurring: {windowFiscalYears: 3, fiscalYearsWithDisbursement: 3, averageAnnualDisbursementEbitdaShare: "0.01"},
      alwaysMaterial: [
        "diferença não explicada entre a relação de dívida, as notas e o balancete (D-01)",
        "item que muda o sinal do resultado, da geração de caixa ou de um índice",
        "item que muda o resultado de um teste de covenant ou cruza um limiar de política da casa",
        "item na direção do viés medido em Q-09",
        "indício de erro intencional",
        "descumprimento legal, regulatório ou contratual",
        "fluxo com parte relacionada acima de policy.related-party.materiality",
        "divergência aberta entre fontes da mesma divulgação que declaram a mesma definição, data e componentes (Q-17, RF-14)",
      ],
      precedence: [
        "policy.reconciliation.tolerance decide se a diferença fecha numericamente; esta política decide o destaque das diferenças abertas e dos ajustes",
        "cartões específicos prevalecem no seu assunto: revenue-quality.cutoff, related-party.materiality, seasonality.materiality, currency.exposure, receivables.aging e concentration.materiality",
        "alwaysMaterial prevalece sobre os números",
      ],
      rule: "item material vira achado nomeado no memo com efeito em confiança, cenário ou capacidade; abaixo do limiar fica na trilha com âncora; claramente trivial é agrupado e listado; nada é descartado",
    },
    unit: "fração do benchmark nomeado em cada campo; variação de índice em vezes (x)",
    source: {
      title: "NBC TA 320 (R1) Materialidade no Planejamento e na Execução da Auditoria (CFC), itens 9, A5 e A8, e NBC TA 450 (R1), item A2; limiares de crédito da Offroad calibrados pelo efeito na alavancagem e no covenant",
      url: "https://www1.cfc.org.br/sisweb/SRE/docs/NBCTA320(R1).pdf",
      observedBy,
    },
    asOf,
    documentation: card("policy.financial.materiality"),
  },

  "policy.financial.normalization": {
    version,
    value: {
      units,
      views: [
        {
          id: "reported",
          order: 1,
          basis: "exercícios iniciados antes de 1/1/2027: EBITDA (LAJIDA) da Resolução CVM 156/2022, art. 3º, igual a resultado líquido mais tributos sobre o lucro, despesas financeiras líquidas das receitas financeiras e depreciação, amortização e exaustão, sem excluir itens não recorrentes, não operacionais ou de operações descontinuadas",
          basisFromFiscalYearsStarting20270101: "subtotal de resultado operacional antes de depreciação, amortização e impairment do CPC 51, item 118(b), quando apresentado; senão, a medida de desempenho definida pela administração com a conciliação em nota do CPC 51, itens 117 a 125",
          overwritesPrevious: false,
        },
        {id: "reclassified", order: 2, basis: "o mesmo conteúdo econômico na convenção da casa, sem julgamento de recorrência: arrendamentos pela convenção declarada, equivalência fora do EBITDA, risco sacado pela substância, hedge e câmbio pela designação contábil", overwritesPrevious: false},
        {id: "adjusted", order: 3, basis: "reclassificado mais os ajustes aceitos deste catálogo, um a um, com valor, período, âncora e memória de cálculo; é o EBITDA ajustado pela Offroad de Q-01", overwritesPrevious: false},
        {id: "scenario", order: 4, basis: "ajustado mais deltas de drivers declarados por cenário (administração, banco, estresse), com magnitudes de policy.business_plan.scenarios; nunca percentual aplicado ao resultado final", overwritesPrevious: false},
      ],
      leaseConvention: {
        default: "pre_ifrs16",
        allowed: ["pre_ifrs16", "post_ifrs16"],
        pre_ifrs16: "pagamentos de arrendamento (principal e juros) deduzidos como custo operacional; passivo de arrendamento fora da dívida",
        post_ifrs16: "EBITDA sem o custo de arrendamento; passivo de arrendamento na dívida e pagamentos no serviço da dívida",
        covenantTest: "a definição do contrato governa",
        rule: "a mesma convenção no numerador e no denominador; trocar de convenção exige nova versão da base e recálculo de todas as métricas",
      },
      recurrence: {windowFiscalYears: 3, occurrencesMakingRecurring: 2, sameNatureAcrossNames: true},
      dualBasis: {acceptedAdjustmentsShareOfReported: "0.10", rule: "acima do limiar, o memo mostra EBITDA reportado e ajustado lado a lado, a capacidade é calculada nas duas bases e o caso do banco usa a menor"},
      constantCurrency: {
        requiredWhenFxExplainsRevenueGrowthPp: "0.02",
        translation: "resultado de controlada no exterior à taxa média do período e balanço à taxa de fechamento, como na conversão da demonstração consolidada",
      },
      catalogue: [
        {id: "N01", item: "sinistro", treatment: "accept", evidence: ["boletim ou laudo do evento", "aviso e regulação da seguradora"], condition: "líquido da indenização reconhecida no mesmo período; perda coberta não soma duas vezes"},
        {id: "N02", item: "multa ou penalidade contratual única", treatment: "accept", evidence: ["contrato", "comprovante de pagamento"], condition: "evento identificado e sem repetição na janela de recorrência"},
        {id: "N03", item: "reestruturação", treatment: "accept", evidence: ["plano formal aprovado com datas", "rescisões e custos pagos"], condition: "um programa por janela de recorrência; o segundo é custo recorrente", maxProgramsPerWindow: 1},
        {id: "N04", item: "despesa pré-operacional de unidade nova", treatment: "accept", evidence: ["centro de custo próprio", "data de entrada em operação"], condition: "somente antes da entrada em operação; depois dela, o custo de maturação é operacional", maxMonthsBeforeStart: 12},
        {id: "N05", item: "honorários de transação não recorrente", treatment: "accept", evidence: ["nota fiscal", "contrato de assessoria"], condition: "transação identificada; custo de captação recorrente não entra"},
        {id: "N06", item: "impairment e baixa de ativo não circulante", treatment: "accept", evidence: ["nota explicativa", "teste de recuperabilidade"], condition: "sem efeito caixa; sujeito à regra de recorrência"},
        {id: "N07", item: "ganho ou perda na alienação de ativo não circulante", treatment: "accept", evidence: ["contrato de venda", "nota explicativa"], condition: "fora do EBITDA; o caixa da venda entra na ponte de caixa como fonte não recorrente"},
        {id: "N08", item: "variação do valor justo de ativo biológico", treatment: "accept", evidence: ["nota de ativos biológicos (CPC 29)"], condition: "exclui a variação não realizada; o custo do produto colhido permanece"},
        {id: "N09", item: "crédito tributário extemporâneo reconhecido no resultado operacional", treatment: "accept", evidence: ["decisão judicial ou habilitação do crédito", "nota explicativa"], condition: "fora do EBITDA; a compensação entra na ponte de caixa quando efetiva"},
        {id: "N10", item: "ajuste a valor justo de estoque adquirido em combinação de negócios", treatment: "accept", evidence: ["alocação do preço de compra"], condition: "exclui a reversão não caixa do ágio no estoque"},
        {id: "N11", item: "provisão e reversão de contingências", treatment: "case_by_case", evidence: ["nota de provisões", "desembolsos de Q-15"], condition: "neutralizar provisão e reversão somente quando o desembolso recorrente de Q-15 entrar como custo; nunca as duas coisas"},
        {id: "N12", item: "remuneração baseada em ações", treatment: "case_by_case", evidence: ["plano aprovado", "nota explicativa"], condition: "liquidada em ações pode sair quando excluída também dos pares comparados; liquidada em caixa é custo"},
        {id: "N13", item: "aquisição concluída no período (pró-forma)", treatment: "case_by_case", evidence: ["demonstrações da adquirida auditadas ou revisadas", "contrato fechado"], condition: "doze meses da adquirida somente com fechamento até a data-base; sinergia fica fora"},
        {id: "N14", item: "hedge operacional de receita ou custo", treatment: "reclassify", evidence: ["documentação de hedge accounting", "nota de instrumentos financeiros"], condition: "resultado realizado entra no EBITDA somente quando o hedge designa a receita ou o custo protegido; sem designação, fica no financeiro e no mapa de moeda"},
        {id: "N15", item: "equivalência patrimonial", treatment: "reclassify", evidence: ["nota de investimentos"], condition: "fora do EBITDA; dividendos recebidos em caixa entram na ponte de caixa"},
        {id: "N16", item: "correção monetária de economia hiperinflacionária (CPC 42)", treatment: "reclassify", evidence: ["nota explicativa"], condition: "efeito da correção fora do EBITDA; resultado operacional mantido na moeda de apresentação"},
        {id: "N17", item: "sinergia ou economia de custo projetada", treatment: "reject", evidence: [], condition: "projeção entra somente no cenário da administração"},
        {id: "N18", item: "ajuste da administração sem abertura item a item", treatment: "reject", evidence: [], condition: "sem abertura, sem ajuste"},
        {id: "N19", item: "aluguel pró-forma de sale-leaseback não assinado", treatment: "reject", evidence: [], condition: "com o contrato assinado, o aluguel entra como arrendamento pela convenção declarada"},
        {id: "N20", item: "normalização de mercado, clima ou câmbio sem evento identificável", treatment: "reject", evidence: [], condition: "variação de ambiente é risco do negócio e vai para o cenário"},
      ],
      rule: "cada visão deriva da anterior por linhas nomeadas e ancoradas; o reportado nunca é sobrescrito; ajuste que se repete na janela de recorrência é custo recorrente, qualquer que seja o nome",
    },
    unit: "catálogo de tratamentos; frações do EBITDA reportado, pontos percentuais em fração e contagens de exercícios",
    source: {
      title: "Resolução CVM 156/2022 (divulgação de EBITDA e EBITDA ajustado); CPC 26 (R1), item 87; critérios de ajuste da análise de crédito da Offroad",
      url: "https://conteudo.cvm.gov.br/legislacao/resolucoes/resol156.html",
      observedBy,
    },
    asOf,
    documentation: card("policy.financial.normalization"),
  },

  "policy.cash-flow.bridge": {
    version,
    value: {
      units,
      leaseConvention: "a de policy.financial.normalization (padrão pre_ifrs16), igual no numerador e no denominador",
      operatingBridge: [
        {order: 1, line: "ebitda_adjusted", sign: "+", source: "visão ajustada de policy.financial.normalization (Q-01)"},
        {order: 2, line: "non_cash_items_remaining", sign: "-", source: "itens sem caixa que permanecem no EBITDA ajustado, sem repetir ajustes já feitos em Q-01"},
        {order: 3, line: "income_taxes_paid", sign: "-", source: "IR e CSLL pagos na demonstração dos fluxos de caixa ou no razão; nunca competência"},
        {order: 4, line: "working_capital_change", sign: "+/-", source: "variação da necessidade de capital de giro conta a conta, com fornecedores no prazo original quando houver risco sacado (D-06)"},
        {order: 5, line: "maintenance_capex", sign: "-", source: "policy.capex.maintenance: estimativa central no caso base, limite superior da faixa no caso do banco"},
        {order: 6, line: "lease_payments", sign: "-", appliesWhen: "pre_ifrs16", source: "pagamentos de arrendamento de principal e juros"},
        {order: 7, line: "recurring_operating_commitments", sign: "-", source: "desembolso trabalhista recorrente de Q-15 e compromissos operacionais mínimos contratados"},
        {order: 8, line: "dividends_received", sign: "+", source: "dividendos recebidos em caixa de investidas, recorrentes nos últimos 3 exercícios"},
      ],
      cfads: "soma das linhas 1 a 8",
      cashAvailableForDebtService: [
        {order: 9, line: "opening_free_cash", sign: "+", source: "caixa e aplicações de liquidez imediata menos caixa restrito menos caixa mínimo operacional"},
        {order: 10, line: "committed_undrawn_facilities", sign: "+", source: "linha comprometida, não sacada, com contrato vigente e condições de saque cumpridas; linha não comprometida só em cenário"},
        {order: 11, line: "interest_received_on_free_cash", sign: "+", source: "rendimento do caixa livre; rendimento de caixa restrito fica no caixa restrito"},
      ],
      obligations: [
        {line: "interest_paid", source: "ledger da dívida (D-24) por data de pagamento, qualquer que seja a classificação na demonstração dos fluxos de caixa"},
        {line: "scheduled_principal", source: "cronograma contratual (D-03), sem rolagem presumida"},
        {line: "lease_payments", appliesWhen: "post_ifrs16", source: "pagamentos de arrendamento de principal e juros"},
        {line: "tax_installments", source: "parcelamentos tributários (D-09)"},
        {line: "declared_and_mandatory_dividends", source: "dividendos declarados e não pagos e dividendo obrigatório projetado (D-15), salvo trava contratual vigente"},
        {line: "acquisition_obligations", source: "parcelas de aquisição e earn-outs devidos (D-14)"},
        {line: "probable_contingencies_with_dated_disbursement", source: "provisão provável com desembolso datado (D-16), sem dupla contagem com a linha 7"},
      ],
      restrictedCash: {
        excludedFromFreeCash: [
          "depósitos judiciais",
          "caixa dado em garantia ou em conta vinculada de outra dívida",
          "caixa em controlada com restrição de distribuição, minoritário com direito sobre o caixa ou restrição cambial",
          "valores em escrow",
          "aplicações com carência ou resgate acima de 90 dias",
        ],
        reserveAccount: "conta reserva do serviço conta somente para a dívida que garante",
      },
      minimumOperatingCash: {
        daysOfCashOperatingCosts: 15,
        cashOperatingCosts: "custo dos produtos vendidos mais despesas operacionais, sem depreciação e amortização, dos últimos doze meses",
        companyPolicyPrevailsWhenHigher: true,
        highSeasonalityUsesPeakIntraYearNeed: true,
      },
      mandatoryDividend: "dividendo obrigatório do estatuto; no silêncio do estatuto, metade do lucro líquido ajustado (Lei 6.404/1976, art. 202, I); projetado como obrigação sobre o lucro projetado, salvo trava contratual vigente",
      conversion: {
        definition: "(linhas 1 a 5) / linha 1",
        windowFiscalYears: 3,
        namedCauseBelowShare: "0.50",
        sustainabilityReviewAboveShare: "0.90",
      },
      reconciliation: {
        toleranceBeyondPublishedRounding: "0",
        rule: "a ponte completa, depois de serviço da dívida, investimentos, financiamentos, distribuições e demais fluxos, reconcilia com a variação do caixa do balanço; diferença é linha nomeada",
      },
      liquidityCoverage: {
        definition: "cobertura acumulada = (caixa livre inicial + linhas comprometidas + soma de CFADS e rendimentos no horizonte) / soma das obrigações no horizonte; cobertura por período = (caixa livre de abertura do período + CFADS + rendimentos + saque comprometido do período) / obrigações do período",
        floorAppliesTo: {floorBaseMultiple: "cobertura acumulada no caso base", floorDownsideMultiple: "cada período no downside"},
        horizonMonthsByArchetype: {working_capital: 12, refinance: 24, growth_expansion: 24, acquisition: 24, equipment_finance: 24, venture_debt: 18, other: 24},
        alsoFullTenorAnnualFor: ["growth_expansion", "refinance", "acquisition", "equipment_finance"],
        periodicity: {default: "quarterly", highSeasonality: "monthly", venture_debt: "monthly"},
        floorBaseMultiple: "1.20",
        floorDownsideMultiple: "1.00",
        scenarios: ["base", "downside", "without_new_operation"],
        rule: "fonte não contratada fica em cenário; caixa restrito não cobre serviço; déficit é decomposto por causa e data e abre hipótese de liquidez (IN-23), sem classificação automática",
      },
      rule: "a ponte parte do EBITDA ajustado, chega ao CFADS e ao caixa disponível para o serviço, e fecha com a variação do caixa do balanço; cada linha tem fonte, período, entidade, moeda e cenário",
    },
    unit: "linhas ordenadas com sinal; dias de custo caixa; meses de horizonte; cobertura em vezes (x)",
    source: {
      title: "CPC 03 (R2) Demonstração dos Fluxos de Caixa (itens 31 a 34, 44F a 44H e 48) e CPC 06 (R2) Arrendamentos; Lei 6.404/1976, art. 202; definições de CFADS e FFO da análise de crédito",
      url: "https://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos/Pronunciamento?Id=34",
      observedBy,
    },
    asOf,
    documentation: card("policy.cash-flow.bridge"),
  },
};
