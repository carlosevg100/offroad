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

  "policy.capex.maintenance": {
    version,
    value: {
      units,
      purposes: [
        {id: "replacement", class: "maintenance", description: "reposição de ativo ou componente no fim da vida útil"},
        {id: "safety_compliance", class: "maintenance", description: "segurança, meio ambiente, licença e conformidade obrigatória"},
        {id: "capacity_upkeep", class: "maintenance", description: "grandes manutenções e inspeções capitalizadas que preservam a capacidade existente"},
        {id: "efficiency", class: "discretionary", description: "redução de custo unitário sem capacidade nova medida; o ganho projetado entra só no cenário da administração"},
        {id: "expansion", class: "growth", description: "capacidade nova medida, unidade nova ou contrato novo"},
        {id: "acquisition", class: "acquisition", description: "compra de negócio ou de ativo operacional pronto; tratada fora do capex"},
      ],
      defaultClass: "maintenance",
      expansionEvidence: ["capacidade nova medida em unidade física com data", "unidade ou linha nova com centro de custo próprio", "contrato de venda que exige a capacidade"],
      estimationHierarchy: [
        {rank: 1, method: "project_ledger", confidence: "high", bandShare: "0.10", evidence: ["registro das adições do imobilizado e do intangível por projeto, reconciliado ao fluxo de investimento", "finalidade, ativo, período e valor por projeto", "ordens de serviço ou plano de reposição"]},
        {rank: 2, method: "asset_register_replacement", confidence: "medium", bandShare: "0.20", evidence: ["registro de ativos com custo, data de aquisição e vida útil", "custo de reposição atualizado"], formula: "soma, por ano, do custo de reposição dos ativos que atingem o fim da vida útil"},
        {rank: 3, method: "historical_classified_average", confidence: "medium", bandShare: "0.20", windowFiscalYears: 5, minimumFiscalYears: 3, inflationIndex: "IPCA do IBGE", formula: "média do capex total atualizado pelo IPCA menos os projetos com evidência de expansão"},
        {rank: 4, method: "management_engineering_estimate", confidence: "low", bandShare: "0.35", evidence: ["entrevista técnica registrada", "orçamento aprovado"], floor: "não fica abaixo do método 3 quando os dois existem, salvo evidência documental"},
        {rank: 5, method: "peer_ratio", confidence: "low", bandShare: "0.35", minimumPeers: 5, source: "pares de market.peer-benchmarks que divulgam capex de manutenção separado"},
      ],
      depreciationContrast: {
        measure: "capex de manutenção / depreciação e amortização sem direito de uso",
        namedCauseBelowMultiple: "0.50",
        namedCauseAboveMultiple: "1.50",
        usedAsFloor: false,
      },
      deferredMaintenanceTest: {
        capexToDepreciationBelowMultiple: "0.80",
        consecutiveFiscalYears: 3,
        accumulatedDepreciationToGrossIncreasePp: "0.05",
        catchUpFiscalYearsInBankCase: 3,
      },
      fullyDepreciatedInUseReviewShareOfGross: "0.20",
      scenarioUse: {base: "estimativa central", bank: "estimativa central vezes (1 + bandShare)", stress: "caso do banco mais recomposição do capex represado"},
      rightOfUseAdditionsInMaintenance: false,
      tenorVsEconomicLife: {maxFinalMaturityShareOfRemainingLife: "0.80", balloonAtMost: "valor residual do ativo depois do haircut de policy.structure.collateral_haircuts"},
      sourcesAndUses: {maintenanceShareOfUsesReview: "0.20", rule: "capex de manutenção financiado pela operação é linha própria nos usos; acima do limiar, revisar liquidez disfarçada (IN-23) e uso misto (OP-13)"},
      rule: "capex sem evidência de expansão é manutenção; a estimativa usa o método de posto mais alto disponível e carrega a faixa de confiança; depreciação é contraste, nunca piso",
    },
    unit: "frações (faixa de confiança, participação nos usos, vida remanescente); múltiplos da depreciação em vezes (x); exercícios",
    source: {
      title: "CPC 27 Ativo Imobilizado, itens 12 a 14, 43 a 47 e 51; critérios de capex de manutenção da análise de crédito da Offroad",
      url: "https://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos/Pronunciamento?Id=58",
      observedBy,
    },
    asOf,
    documentation: card("policy.capex.maintenance"),
  },

  "policy.revenue-quality.cutoff": {
    version,
    value: {
      units,
      endOfPeriod: {
        windowDays: 15,
        ratio: "receita dos últimos 15 dias do período / média quinzenal da receita do exercício",
        seasonallyAdjustedRatio: "razão do período / razão da mesma quinzena do ano anterior",
        triggerSeasonallyAdjustedMultiple: "1.30",
        triggerRawMultipleWithoutPriorYear: "1.50",
        rawTriggerClosedBy: "sazonalidade documentada em Q-11 (policy.seasonality.materiality)",
      },
      monthlyDataOnly: {
        lastMonthShareOfQuarterTrigger: "0.40",
        increaseOverSameQuarterPriorYearPp: "0.05",
      },
      postClose: {
        windowDays: 60,
        items: ["devoluções", "cancelamentos", "notas de crédito", "descontos e bonificações concedidos depois do fechamento"],
        triggerMultipleOfLtmRate: "2.0",
        minimumShareOfPeriodRevenue: "0.005",
      },
      sectorLenses: [
        {sector: "construction_percentage_of_completion", test: "receita reconhecida contra medição física atestada e custo incorrido", triggerGapShareOfContractRevenue: "0.05"},
        {sector: "software_subscription", test: "faturamento contra receita e movimento da receita diferida", triggerDeferredRevenueDropShare: "0.10"},
        {sector: "agribusiness", test: "faturado e não entregue", treatment: "fora da receita até a entrega"},
        {sector: "industry_bill_and_hold", test: "critérios de CPC 47, B79 a B82, cumpridos e documentados", treatment: "sem os critérios, fora da receita"},
        {sector: "distribution_retail", test: "estoque no canal em dias, sell-in contra sell-out", triggerChannelDaysIncreaseShare: "0.20"},
      ],
      treatment: {
        undocumentedExcess: "a receita da quinzena acima da expectativa sazonal (média quinzenal vezes a razão da mesma quinzena do ano anterior) sai da receita dos últimos doze meses com a margem de contribuição correspondente",
        closingEvidence: ["comprovante de entrega", "medição atestada", "aceitação registrada do cliente", "termos de venda sem direito de devolução ampliado"],
      },
      precedence: [
        "fatores sazonais vêm de policy.seasonality.materiality",
        "RF-08 disparado é achado do memo independentemente do valor",
        "ajuste proposto sem RF-08 segue netRevenueShare de policy.financial.materiality",
        "receita com parte relacionada segue policy.related-party.materiality antes deste teste",
      ],
      rule: "concentração de fim de período, devolução posterior e lente setorial abrem investigação antes de qualquer ajuste; entrega comprovada encerra; sem comprovação, o excesso sai da base",
    },
    unit: "dias de janela; múltiplos da média em vezes (x); frações da receita",
    source: {
      title: "CPC 47 Receita de Contrato com Cliente, item 38 e itens B20 a B27 e B79 a B82; NBC TA 240 (R1), item 27 (presunção de risco de fraude no reconhecimento de receita)",
      url: "https://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos/Pronunciamento?Id=105",
      observedBy,
    },
    asOf,
    documentation: card("policy.revenue-quality.cutoff"),
  },

  "policy.related-party.materiality": {
    version,
    value: {
      units,
      identification: {
        definition: "parte relacionada do CPC 05 (R1), item 9, mais controladas, coligadas e sociedades sob controle comum da Lei 6.404/1976, art. 243",
        crossCheck: ["raiz do CNPJ (oito primeiros dígitos)", "participações dos sócios e administradores em fontes públicas permitidas", "lista da nota explicativa"],
        rule: "o cruzamento por CNPJ e participação prevalece sobre a lista da nota; parte identificada só pelo cruzamento entra com a fonte",
      },
      listing: {anyFlowShareOfNetRevenue: "0.01", rule: "fluxo a partir do limiar é listado individualmente na trilha; abaixo, agregado por contraparte"},
      flows: {
        revenueShareOfNetRevenue: "0.05",
        purchasesShareOfCostOfSales: "0.05",
        transactionOrCorrelatedSetAboveLowerOfBrl: "50000000",
        transactionOrCorrelatedSetAboveLowerOfTotalAssetsShare: "0.01",
        transactionRule: "transação ou conjunto de transações correlatas cujo valor total supere o menor entre os dois valores, como no Anexo F da Resolução CVM 80/2022; ativo total das últimas demonstrações consolidadas",
      },
      margin: {grossMarginDivergencePp: "0.03", comparison: "margem bruta das vendas a ligadas contra a das vendas a terceiros no mesmo período e linha de produto"},
      pricing: {
        rule: "preço de fluxo material comparado com transações entre partes independentes; fora do intervalo interquartil dos comparáveis ou a mais de 10% da mediana, achado",
        deviationFromComparableMedianShare: "0.10",
      },
      loans: {
        payable: "mútuo passivo com parte relacionada é dívida em todas as visões de D-24, salvo instrumento de subordinação formal com trava de pagamento durante a vida da dívida nova, quando passa a quase capital",
        receivableFindingLowerOfTotalAssetsShare: "0.01",
        receivableFindingLowerOfEbitdaShare: "0.05",
        alwaysFinding: ["mútuo ativo com controlador sem aprovação societária, sem taxa ou sem prazo", "mútuo passivo com vencimento anterior ao da dívida nova sem subordinação"],
      },
      guarantees: {
        givenAlwaysRecorded: true,
        findingShareOfNetDebt: "0.05",
        distressOverride: "garantido em recuperação, execução, inadimplência ou com alavancagem acima da tomadora é achado em qualquer valor e abre RF-12",
      },
      circularity: {
        trigger: "fluxo material pelos limiares de flows ou margin, mais mútuo, mais garantia cruzada, com a mesma parte ou o mesmo grupo",
        alsoTrigger: "fluxos com ligadas de pelo menos 10% da receita líquida quando a mesma parte é credora ou garantidora",
        alsoTriggerRevenueShare: "0.10",
        effect: "RF-09: análise no perímetro econômico real, com as visões com e sem ligadas no memo",
      },
      views: {
        withAndWithoutRelatedParties: true,
        capacityBaseSubstitution: "a visão sem ligadas substitui a base de capacidade somente com tratamento econômico documentado (preço, prazo e continuidade)",
      },
      rule: "toda transação com parte relacionada é registrada; o limiar decide achado, preço testado e visão; empréstimo e garantia seguem regra própria, porque o risco deles não depende do tamanho do fluxo",
    },
    unit: "frações da receita, do custo, do ativo, do EBITDA e da dívida líquida; pontos percentuais em fração; reais",
    source: {
      title: "CPC 05 (R1) Divulgação sobre Partes Relacionadas, itens 9, 18 e 19; Lei 6.404/1976, arts. 243 e 245; Resolução CVM 80/2022 (divulgação de transações com partes relacionadas)",
      url: "https://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos/Pronunciamento?Id=36",
      observedBy,
    },
    asOf,
    documentation: card("policy.related-party.materiality"),
  },

  "policy.seasonality.materiality": {
    version,
    value: {
      units,
      window: {
        minimumMonths: 24,
        preferredMonths: 36,
        quarterlyDataMinimumQuarters: 8,
        cycle: "exercício social da companhia; ano safra quando a companhia o declara (Caso 01: junho a maio)",
      },
      index: "valor do mês / média mensal da janela (financial-core calculateSeasonality)",
      amplitude: "(pico - vale) / média, nos últimos 12 meses e na média de dois ciclos",
      revenue: {moderateFromAmplitude: "0.25", highFromAmplitude: "0.40", highFromPeakToTroughMultiple: "1.50"},
      netWorkingCapital: {seasonalFromAmplitude: "0.25", highFromAmplitude: "0.50"},
      quarterShare: {
        uniformShare: "0.25",
        moderateDeviationPp: "0.05",
        highDeviationPp: "0.10",
        patternShiftRelativeShare: "0.10",
        patternShift: "participação do trimestre na receita do ciclo comparada com a do mesmo trimestre do ciclo anterior; variação relativa acima do limiar é achado de mudança do padrão sazonal",
      },
      statisticByPurpose: {
        capacityAndNormalizedWorkingCapital: "média",
        liquidityAndReserveSizing: "pico da necessidade de capital de giro ou pior déficit acumulado mensal do caso do banco",
        collateralAvailability: "vale do saldo de recebíveis e estoques",
        pointComparison: "mesmo mês ou mesmo trimestre do ciclo anterior",
      },
      designTriggers: {
        es08SeasonalDesignWhen: "receita alta ou necessidade de capital de giro sazonal",
        constantInstallmentWithoutLiquidityMechanism: "vetada quando algum mês do caso do banco tem CFADS acumulado abaixo do serviço acumulado",
        es24CoverageTest: "doze meses móveis para companhia com receita moderada ou alta; nunca trimestre isolado",
        es24NetDebtMeasurement: "média dos quatro últimos fechamentos trimestrais ou data de teste fora do pico da necessidade de capital de giro, quando esta for sazonal",
      },
      liquidityTestPeriodicity: {none: "quarterly", moderate: "quarterly", high: "monthly"},
      rule: "classificar a sazonalidade antes de calcular; comparar mês com mês equivalente; carimbar toda métrica pontual com o mês; escolher média, pico, vale ou mês comparável pela finalidade, sempre declarada",
    },
    unit: "amplitude e participação em fração; pico sobre vale em vezes (x); meses e trimestres de janela",
    source: {
      title: "CPC 21 (R1) Demonstração Intermediária, itens 16A(b), 20 e 21 (sazonalidade e doze meses até a data intermediária); gabarito do Caso 01 v1.0 (ano safra junho a maio)",
      url: "https://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos/Pronunciamento?Id=52",
      observedBy,
    },
    asOf,
    documentation: card("policy.seasonality.materiality"),
  },

  "policy.currency.exposure": {
    version,
    value: {
      units,
      map: {
        byCurrencyAndEntity: ["receita", "custo pago em moeda estrangeira", "custo em reais indexado a moeda estrangeira", "serviço da dívida", "derivativos contratados"],
        horizonMonths: 12,
        netExposure: "receita - custo - serviço da dívida + hedge contratado, por moeda, nos próximos 12 meses (financial-core calculateCurrencyExposure)",
        balanceSheetExposure: "dívida em moeda estrangeira sem hedge menos caixa e recebíveis na mesma moeda e entidade",
      },
      materiality: {
        adverseEffectAtLeastIndividualMateriality: true,
        equivalentNetShortExposureShareOfEbitda: "0.04",
        equivalentNetLongExposureShareOfEbitda: "0.05",
        leverageDeltaMultipleFromAdverseShock: "0.05",
        highAdverseEffectShareOfCfads: "0.10",
        highLeverageDeltaMultiple: "0.25",
        rule: "material quando o efeito do choque adverso sobre a exposição líquida de 12 meses alcança a materialidade individual de policy.financial.materiality (com multiplicador de qualidade 1,00, exposição passiva líquida de 4% do EBITDA, ou ativa de 5%, com choque de 25%) ou move a alavancagem em 0,05x; alta quando o efeito alcança 10% do CFADS ou 0,25x de alavancagem",
      },
      mixWindow: {
        default: "últimos doze meses, alinhados ao ciclo de policy.seasonality.materiality",
        structuralChangePp: "0.05",
        structuralChangeWindowMonths: 6,
        rule: "se a participação de uma moeda na receita ou no custo mudar pelo menos 5 p.p. entre duas janelas de doze meses consecutivas, a exposição futura usa os últimos seis meses anualizados, com a média histórica ao lado",
      },
      scenarios: {
        base: "curva de dólar futuro da B3 na data-base para o horizonte; sem vértice, mediana do relatório Focus do Banco Central",
        adverseShockShare: "0.25",
        severeShockShare: "0.50",
        direction: "contra a exposição líquida de cada moeda",
        shockDefinition: "taxa de câmbio vezes (1 + choque) quando a exposição líquida é passiva em moeda estrangeira; taxa dividida por (1 + choque) quando é ativa",
        horizonMonths: 12,
        reverseTest: "obrigatório quando a exposição é alta: depreciação que zera a folga do covenant mais apertado ou leva o caixa ao mínimo",
        combination: "D-27 combina câmbio com juros e inflação quando o câmbio afeta receita ou custo (scenario.market.multi-factor)",
        spotSource: "taxa de câmbio PTAX de venda do Banco Central na data-base",
      },
      hedge: {
        naturalHedgeRequires: ["mesma moeda", "mesma entidade ou fluxo acessível à devedora", "fluxos dentro da mesma janela de 12 meses", "receita contratada ou histórica estável na janela de mix"],
        derivativeCountsWhen: ["contratado e vigente", "notional até a exposição protegida", "vencimento até 3 meses de distância do fluxo protegido", "contraparte identificada"],
        derivativeMaturityToleranceMonths: 3,
        overHedge: "notional acima da exposição é posição especulativa e entra como exposição própria",
        leveragedStructures: "target forward, acumuladores e estruturas com perda não limitada são red flag de governança em qualquer valor (D-13)",
        exportFinancing: "ACC e ACE contam como protegidos somente até a receita de exportação dos 12 meses seguintes, contratada ou histórica",
      },
      conversionCosts: "IOF de câmbio e tributos sobre remessa vêm de policy.capital.iof e policy.capital.tax-regime; sem valor aprovado, o custo de conversão é lacuna declarada",
      rule: "mapear por moeda e entidade, medir a exposição líquida de 12 meses, testar o choque adverso contra a materialidade e o covenant, e contar hedge somente contratado e casado",
    },
    unit: "choques em fração da taxa de câmbio; exposição em fração do EBITDA e do CFADS; alavancagem em vezes (x); meses",
    source: {
      title: "CPC 40 (R1) Instrumentos Financeiros: Evidenciação, item 40 (análise de sensibilidade por tipo de risco de mercado); Banco Central, série SGS 3696 (dólar americano, venda, fim de período, mensal)",
      url: "https://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos/Pronunciamento?Id=71",
      observedBy,
    },
    asOf,
    documentation: card("policy.currency.exposure"),
  },
};
