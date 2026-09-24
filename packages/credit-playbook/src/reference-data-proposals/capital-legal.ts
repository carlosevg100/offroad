import type {ReferenceDataProposal, ReferenceDataProposalFamily} from "./types";

/**
 * Legal, tax and market conventions: IOF, ANBIMA and B3 conventions, tax regime and the legal
 * references of structures, instruments and privacy. Every value was read against its official
 * source on 24/09/2026 and enters the registry as a draft for the founder's review; the full
 * professional text of each key lives in `knowledge/reference-data/capital-legal.md`.
 */
const version = "2026.09.24-v1";
const asOf = "2026-09-24";
const observedBy = "Offroad (Claude, executor), 24/09/2026, aguardando revisão do fundador";
const card = (key: string) => `knowledge/reference-data/capital-legal.md#${key}`;

const iof: ReferenceDataProposal = {
  version,
  asOf,
  documentation: card("policy.capital.iof"),
  unit: "fração decimal da base de cálculo; prazos em dias corridos; valores em reais",
  source: {
    title: "Decreto 6.306/2007 (Regulamento do IOF), texto compilado com os Decretos 12.466, 12.467 e 12.499 de 2025, o Decreto Legislativo 176/2025 e a cautelar do STF na ADC 96 (16/07/2025 e 18/07/2025)",
    url: "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm",
    observedBy,
  },
  value: {
    schemaVersion: "iof-regime.v1",
    inForceOn: "2026-09-24",
    legalState: {
      regulation: "Decreto 6.306/2007",
      amendingDecrees: ["Decreto 12.466/2025", "Decreto 12.467/2025", "Decreto 12.499/2025"],
      legislativeSuspension: {act: "Decreto Legislativo 176/2025", publishedOn: "2025-06-27"},
      court: {
        case: "STF, ADC 96 com ADI 7827 e ADI 7839",
        decisionOn: "2025-07-16",
        clarificationOn: "2025-07-18",
        effect: "Decreto 12.499/2025 eficaz desde 11/06/2025, com suspensão mantida apenas do art. 7º, §§ 15, 23 e 24, na redação de 2025; majoração inaplicável entre 27/06/2025 e 16/07/2025",
        status: "cautelar monocrática ad referendum do Plenário; último andamento em 26/08/2026, sem referendo",
      },
    },
    credit: {
      taxpayer: "tomador do crédito (art. 4º)",
      collector: "instituição financeira credora, empresa de factoring ou pessoa jurídica mutuante (art. 5º)",
      triggeringEvent: "entrega ou colocação dos recursos à disposição, em cada liberação (art. 3º)",
      legalEntityBorrower: {dailyRate: "0.000082", additionalRate: "0.0038", dailyCapDays: 365, maximumRate: "0.03373", previousDailyRate: "0.000041", previousMaximumRate: "0.018765"},
      simplesNacionalUpToThreshold: {thresholdBRL: "30000", dailyRate: "0.0000274", additionalRate: "0.0038", dailyCapDays: 365, maximumRate: "0.013801"},
      naturalPersonBorrower: {dailyRate: "0.000082", additionalRate: "0.0038", dailyCapDays: 365},
      bases: {
        definedPrincipal: {formula: "sum_i(P_i * dailyRate * min(D_i, 365)) + additionalRate * sum_i(P_i)", principalPerInstallment: "P_i", daysPerInstallment: "D_i, dias corridos entre a liberação e o vencimento da parcela i", article: "art. 7º, I, b, e § 1º"},
        trancheDisbursement: {rule: "cada liberação é base própria com o seu cronograma", article: "art. 7º, IV"},
        revolving: {formula: "por mês: dailyRate * soma dos saldos devedores diários + additionalRate * soma dos acréscimos diários de saldo", dailyCapApplies: false, article: "art. 7º, I, a, III e § 16"},
        discount: {base: "valor líquido obtido (valor nominal menos juros cobrados antecipadamente)", article: "art. 7º, II, e § 4º"},
      },
      renegotiation: {
        sameDebtor: {base: "valor não liquidado da operação anterior", rate: "alíquota da operação inicial", cap: "limite de 365 dias do § 1º", additionalRateDue: false, article: "art. 7º, §§ 1º, 7º e 17"},
        newMoney: {base: "valores novos entregues", rate: "alíquota vigente na data do negócio", additionalRateDue: true, article: "art. 7º, §§ 9º, 11 e 17"},
        newLender: {treatment: "operação nova com incidência integral"},
        formalPortability: {rate: "0", limit: "valor portado, sem troca de devedor", article: "art. 8º, XXV"},
      },
    },
    instrumentTreatment: [
      {instrument: "ccb", obligationInstrument: "ccb", treatment: "general_rate", article: "art. 7º"},
      {instrument: "working_capital_revolving", obligationInstrument: "direct_loan", treatment: "revolving_base", article: "art. 7º, I, a, e § 16"},
      {instrument: "intercompany_loan", obligationInstrument: "direct_loan", treatment: "general_rate", article: "art. 2º, I, c; art. 3º, § 3º, III"},
      {instrument: "receivables_discount", obligationInstrument: "receivables_assignment", treatment: "general_rate_on_net_value", article: "art. 7º, II"},
      {instrument: "supplier_finance", obligationInstrument: "other", treatment: "outside_credit_iof", article: "ADC 96, suspensão dos §§ 23 e 24 do art. 7º"},
      {instrument: "nce", obligationInstrument: "nce", treatment: "exempt", article: "art. 9º, IV", evidence: "vínculo com exportação"},
      {instrument: "cce", obligationInstrument: "other", treatment: "exempt", article: "art. 9º, IV", evidence: "vínculo com exportação"},
      {instrument: "acc", obligationInstrument: "other", treatment: "zero_rate", article: "art. 8º, XVII", evidence: "contrato de câmbio de exportação"},
      {instrument: "export_credit", obligationInstrument: "direct_loan", treatment: "zero_rate", article: "art. 8º, III", evidence: "finalidade de exportação no contrato"},
      {instrument: "rural_credit", obligationInstrument: "direct_loan", treatment: "zero_rate", article: "art. 8º, IV", evidence: "classificação como crédito rural no Manual de Crédito Rural"},
      {instrument: "finame", obligationInstrument: "finame_on_lending", treatment: "zero_rate", article: "art. 8º, IX", evidence: "contrato do agente com fonte FINAME"},
      {instrument: "finep", obligationInstrument: "direct_loan", treatment: "zero_rate", article: "art. 8º, XXXI"},
      {instrument: "constitutional_funds", obligationInstrument: "direct_loan", treatment: "exempt", article: "art. 9º, III", evidence: "recursos de FNO, FNE ou FCO"},
      {instrument: "bndes_own_resources", obligationInstrument: "direct_loan", treatment: "general_rate", article: "art. 8º, XII e XXX, revogados pelos Decretos 8.325/2014 e 8.511/2015"},
      {instrument: "debenture", obligationInstrument: "debenture", treatment: "no_credit_iof", securitiesIofRate: "0", article: "art. 2º, I e IV; art. 32, § 2º, VI"},
      {instrument: "commercial_note", obligationInstrument: "commercial_note", treatment: "no_credit_iof", securitiesIof: "tabela regressiva de 30 dias do art. 32, do lado do investidor", article: "art. 2º, I e IV; art. 32"},
      {instrument: "cri", obligationInstrument: "other", treatment: "no_credit_iof", securitiesIofRate: "0", article: "art. 32, § 2º, VI"},
      {instrument: "cra", obligationInstrument: "other", treatment: "no_credit_iof", securitiesIofRate: "0", article: "art. 32, § 2º, V"},
      {instrument: "cpr_rural_producer", obligationInstrument: "cpr", treatment: "no_credit_iof", securitiesIof: "isenta em bolsa ou balcão", article: "Lei 8.929/1994, art. 2º, I; Decreto 6.306, art. 34, III"},
      {instrument: "cpr_processor", obligationInstrument: "cpr", treatment: "general_rate", exemptionsApply: false, article: "Lei 8.929/1994, art. 2º, II e § 2º"},
      {instrument: "fidc_assignment", obligationInstrument: "receivables_assignment", treatment: "no_credit_iof_on_assignment", fidcPrimaryQuotaRate: "0.0038", fidcQuotaPayer: "cotista", fidcQuotaExclusions: ["cotas subscritas até 13/06/2025", "aquisições no mercado secundário"], article: "art. 32-D"},
      {instrument: "leasing", obligationInstrument: "leasing", treatment: "no_credit_iof", article: "art. 3º, § 3º"},
      {instrument: "external_loan", obligationInstrument: "direct_loan", treatment: "exchange_iof", article: "art. 15-B, XI e XII; regime cambial da Lei 14.286/2021"},
    ],
    exchange: {
      externalLoanInflow: {averageTermThresholdDays: 364, rateUpToThreshold: "0.035", rateAboveThreshold: "0"},
      externalLoanOutflow: {rate: "0"},
      earlyRepaymentBelowAverageTerm: "IOF de 3,5% com juros de mora e multa quando a operação contratada acima de 364 dias é liquidada antes do prazo médio mínimo (art. 15-B, § 2º)",
      putCallBonds: "a primeira data de exercício define o prazo médio (art. 15-B, § 1º)",
    },
    costTreatment: {
      allInTiming: "saída na data de cada liberação",
      financedIof: "quando financiado, soma ao principal e acumula juros pelo contrato",
      existingDebt: "governa o IOF efetivamente cobrado, conforme contrato e extrato",
      newOrProFormaDebt: "governa este parâmetro",
      divergence: "diferença entre cobrado e previsto abre item nomeado, sem ajuste",
      rateDate: "alíquota da data do fato gerador; projeção usa a vigente na data-base",
      missingData: "sem natureza, prazo ou forma de liberação identificados, o IOF não é calculado e o all-in fica bloqueado",
      exemptionEvidence: "isenção e alíquota zero só com a evidência indicada; sem ela, alíquota geral e pendência registrada",
      privatePlacementDebenture: "mantém tratamento de título; estrutura que reproduz empréstimo bilateral passa por revisão tributária antes de retirar o IOF",
      deductibility: "policy.capital.tax-regime",
    },
    workedExamples: [
      {case: "R$ 100 milhões, bullet de três anos, liberação em 01/10/2026", iofBRL: "3373000"},
      {case: "R$ 100 milhões, bullet de 180 dias", iofBRL: "1856000"},
      {case: "R$ 100 milhões, SAC semestral em três anos", iofBRL: "3122900"},
      {case: "Rotativo com saldo de R$ 20 milhões por 30 dias, parcela diária", iofBRL: "49200"},
      {case: "Simples Nacional, R$ 30 mil em 12 meses", iofBRL: "414.03"},
    ],
    review: {
      routineCheck: "texto compilado do Planalto em cada cálculo de all-in e no mínimo mensal",
      proposedValidityDays: 90,
      invalidatedBy: [
        "decreto que altere os arts. 7º, 8º, 9º, 15-B, 32 ou 32-D do Decreto 6.306/2007",
        "referendo ou julgamento de mérito da ADC 96, ADI 7827 ou ADI 7839",
        "lei que trate de IOF sobre risco sacado ou sobre cotas de FIDC",
      ],
    },
  },
};

const round = (decimals: number) => ({decimals, mode: "round"});
const truncate = (decimals: number) => ({decimals, mode: "truncate"});

const rateConventions: ReferenceDataProposal = {
  version,
  asOf,
  documentation: card("policy.capital.anbima-b3-conventions"),
  unit: "taxas em percentual ao ano, base 252 dias úteis; fatores e valores com as casas decimais de cada camada",
  source: {
    title: "B3, Cadernos de Fórmulas Cetip21 (Debêntures, Notas Comerciais, CRI e CCI, 06/03/2017; Títulos do Agronegócio, 08/12/2025) e metodologia da Taxa DI; ANBIMA, Guia de Padronização dos Documentos dos Títulos de Renda Fixa, 2ª versão, e calendário de feriados nacionais",
    url: "https://www.b3.com.br/data/files/F6/26/EA/D2/F051F610AF4EF0F6AC094EA8/Caderno%20de%20Formulas%20-%20Debentures%20Cetip%2021.pdf",
    observedBy,
  },
  value: {
    schemaVersion: "br-rate-conventions.v1",
    precedence: [
      {rank: 1, source: "contrato, escritura ou termo de securitização", scope: "tudo o que fixarem"},
      {rank: 2, source: "Caderno de Fórmulas da B3 do ativo registrado", scope: "eventos do ativo registrado na B3 quando o contrato remete ao sistema"},
      {rank: 3, source: "Guia ANBIMA de Padronização dos Documentos dos Títulos de Renda Fixa, 2ª versão", scope: "emissão nova sem regra contratual"},
      {rank: 4, source: "convenção da casa (este parâmetro)", scope: "operação indicativa, pró-forma e normalização analítica"},
    ],
    calendar: {
      dayCount: "DU/252",
      compounding: "exponencial",
      businessDayCalendar: "feriados nacionais ANBIMA",
      calendarUrl: "https://www.anbima.com.br/feriados/feriados.asp",
      notInCalendar: ["feriados municipais", "eleições", "último dia do ano"],
      holidays2026: ["2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25"],
      startDate: "inclusive",
      endDate: "exclusive",
      eventOnNonBusinessDay: "próximo dia útil",
    },
    inputs: {
      taxaDi: {publisher: "B3", unit: "percentual ao ano, base 252", precision: round(2), fallback: "Taxa Selic Over quando houver menos de 100 operações elegíveis ou volume abaixo de R$ 30 bilhões, desde 01/10/2018"},
      ipca: {publisher: "IBGE", unit: "número-índice, dezembro de 1993 = 100", precision: round(2)},
      ipcaProjection: {publisher: "ANBIMA", unit: "percentual ao mês", precision: round(2), use: "índice do mês não publicado na data do evento; sem compensação posterior"},
    },
    indexers: {
      di_percent: {
        quote: "p% do DI",
        formulas: {dailyRate: "TDI_k = (1 + DI_k/100)^(1/252) - 1", indexFactor: "FatorDI = prod(1 + TDI_k * p/100)", interest: "J = VNe * (FatorDI - 1)"},
        window: "DI da data de início, inclusive, ao DI do dia útil anterior à data de cálculo",
        percentDecimals: 2,
        precision: {dailyRate: round(8), dailyTerm: truncate(16), runningProduct: truncate(16), indexFactor: round(8), amount: truncate(8)},
        executorRounding: {indexFactor: round(8), dailyAccumulation: truncate(16), amount: truncate(8)},
      },
      di_spread: {
        quote: "DI + s% ao ano",
        formulas: {indexFactor: "FatorDI = prod(1 + TDI_k)", spreadFactor: "FatorSpread = (1 + s/100)^(DP/252)", interestFactor: "FatorJuros = FatorDI * FatorSpread", interest: "J = VNe * (FatorJuros - 1)"},
        window: "DI da data de início, inclusive, ao DI do dia útil anterior à data de cálculo",
        spreadDecimals: 4,
        precision: {dailyRate: round(8), dailyTerm: truncate(16), runningProduct: truncate(16), indexFactor: round(8), spreadFactor: round(9), interestFactor: round(9), amount: truncate(8)},
        executorRounding: {indexFactor: round(8), spreadFactor: round(9), interestFactor: round(9), dailyAccumulation: truncate(16), amount: truncate(8)},
        b3Variant: "FatorSpread = [(1 + s/100)^(n/252)]^(DP/DT), expoentes truncados em 9 casas e potências arredondadas em 9",
      },
      ipca_spread: {
        quote: "IPCA + q% ao ano",
        formulas: {indexFactor: "C = prod((NI_k/NI_(k-1))^(dup/dut))", updatedNominal: "VNa = VNe * C", spreadFactor: "FatorSpread = (1 + q/100)^(DP/252)", interest: "J = VNa * (FatorSpread - 1)"},
        indexMonth: "NI_k é o índice do mês anterior ao mês de atualização",
        anniversary: "dia 15 ou a data da escritura; dia não útil passa para o dia útil seguinte",
        dup: "dias úteis desde o último aniversário, limitados aos dias úteis do período do índice",
        dut: "dias úteis entre aniversários",
        couponDecimals: 4,
        precision: {factor: truncate(8), intermediateProducts: truncate(16), indexFactor: truncate(8), updatedNominal: truncate(8), spreadFactor: round(9), amount: truncate(8)},
        executorRounding: {indexFactor: truncate(8), spreadFactor: round(9), interestFactor: round(9), dailyAccumulation: truncate(16), amount: truncate(8)},
        missingIndex: "projeção ANBIMA; índice ausente por mais de 30 dias segue o substituto legal ou a assembleia prevista na escritura",
      },
      prefixed: {
        quote: "i% ao ano",
        formulas: {interestFactor: "FatorJuros = (1 + i/100)^(DP/252)", interest: "J = VN * (FatorJuros - 1)"},
        rateDecimals: 4,
        precision: {interestFactor: round(9), amount: truncate(8)},
        executorRounding: {interestFactor: round(9), amount: truncate(8)},
      },
      tlp: {
        quote: "TLP + s% ao ano",
        definition: "IPCA mais parcela prefixada fixada na contratação, média de três meses da taxa de cinco anos da estrutura a termo das NTN-B, divulgada pelo Banco Central até o último dia útil do mês anterior",
        normalizeAs: "ipca_spread",
        source: "Lei 13.483/2017, arts. 2º e 3º, na redação da Lei 14.937/2024",
      },
      usd: {
        quote: "USD + s% ao ano ou SOFR + s%",
        rule: "juros em dólar sobre saldo em dólar, conversão pela PTAX de venda; normalização para DI só com swap contratado",
      },
    },
    instrumentRules: {
      debenture: {diPercentWithSpread: false, amountDecimalsCetip21: 8, amountDecimalsMigratedFromSnd: 6},
      commercial_note: {diPercentWithSpread: true, priceIndexCalculatedByB3: false},
      cri: {ipcaUpdate: "mensal ou anual no aniversário", proRata: "somente no primeiro mês quebrado", lagMonthsPossible: 2, projection: false, newIssueRecommendation: "aniversário no dia 15, até dois dias de defasagem do DI, sem IPCA defasado"},
      cra: {ipcaUpdate: "mensal ou anual no aniversário", diWindowShift: "Data de Deslocamento permitida", newIssueRecommendation: "aniversário no dia 15, até dois dias de defasagem do DI, sem IPCA defasado"},
      b3FinancialValue: truncate(2),
      anbimaSecondaryPu: truncate(6),
    },
    normalization: {
      target: "spread equivalente sobre o DI, ao ano, base 252, na data-base",
      curveTenor: "prazo médio remanescente do contrato",
      overnightRateAllowed: false,
      curves: {di: "curva de DI1 das taxas referenciais da B3 ou estrutura a termo pré da ANBIMA", real: "estrutura a termo IPCA da ANBIMA", implicitInflation: "inflação implícita da estrutura a termo da ANBIMA"},
      formulas: {
        fromDiPercent: "s = [1 + ((1 + c)^(1/252) - 1) * p]^252 / (1 + c) - 1",
        fromPrefixed: "s = (1 + r) / (1 + c) - 1",
        fromIpca: "s = (1 + pi) * (1 + q) / (1 + c) - 1",
        fromUsdWithSwap: "s tal que VP(fluxos em dólar + swap) = VP(fluxos em DI + s) na curva do dia",
      },
      keepOriginalQuote: true,
      linearSumAllowed: false,
    },
    allIn: {
      irr: "r tal que 0 = -(principal - IOF - custos retidos) + sum(fluxo_j / (1 + r)^(DU_j/252))",
      spreadEquivalent: "s tal que (1 + r) = (1 + c) * (1 + s)",
      iofKey: "policy.capital.iof",
      costKey: "policy.pricing.cost-catalogue",
    },
    display: {ratePercentDecimals: 2, spreadBasisPoints: "inteiro", moneyDecimals: 2, decimalSeparator: "vírgula"},
    reconciliation: {withinLayerRounding: "explicado como arredondamento", beyond: "policy.reconciliation.tolerance e item nomeado"},
    review: {
      routine: "calendário a cada ano; cadernos e guia a cada seis meses",
      proposedValidityMonths: 12,
      invalidatedBy: ["nova versão de caderno da B3 ou do guia da ANBIMA", "mudança de metodologia da Taxa DI, do IPCA ou das projeções", "lei que crie ou extinga feriado nacional", "mudança da publicação das curvas da ANBIMA"],
    },
  },
};

const taxRegime: ReferenceDataProposal = {
  version,
  asOf,
  documentation: card("policy.capital.tax-regime"),
  unit: "alíquotas em fração decimal; limites em reais por ano ou por mês, conforme o campo",
  source: {
    title: "Lei 9.249/1995 e Lei 7.689/1988 (IRPJ e CSLL); RIR/2018 (Decreto 9.580/2018); Lei 9.718/1998; LC 224/2025; Leis 12.431/2011, 14.801/2024 e 15.270/2025; LC 214/2025 e LC 227/2026",
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/decreto/d9580.htm",
    observedBy,
  },
  value: {
    schemaVersion: "tax-regime.v1",
    inForceOn: "2026-09-24",
    scope: "tomador pessoa jurídica não financeira",
    regimes: [
      {id: "lucro_real", mandatoryAboveRevenueBRL: "78000000", mandatoryCases: "Lei 9.718, art. 14", interestDeductible: true, iofDeductible: true, otherTaxesDeductible: "competência (RIR/2018, art. 352)", rates: {irpj: "0.15", irpjSurtax: "0.10", irpjSurtaxThresholdBRLPerYear: "240000", csll: "0.09"}, marginalRateAboveThreshold: "0.34", marginalRateBelowThreshold: "0.24", netCostFormula: "r_liquido = r_bruto * (1 - t)"},
      {id: "lucro_presumido", maximumRevenueBRL: "78000000", interestDeductible: false, netCostFormula: "r_liquido = r_bruto", presumptionIncrease: {factor: "1.10", appliesAboveRevenueBRLPerYear: "5000000", irpjFrom: "2026-01-01", csllFrom: "2026-04-01", basis: "LC 224/2025, art. 4º, §§ 4º e 5º"}},
      {id: "simples_nacional", maximumRevenueBRL: "4800000", interestDeductible: false, netCostFormula: "r_liquido = r_bruto", iofNote: "IOF reduzido até R$ 30 mil por operação (policy.capital.iof)"},
    ],
    taxLosses: {offsetCapShareOfAdjustedProfit: "0.30", basis: "Lei 9.065/1995, arts. 15 e 16", effect: "benefício da dedução diferido; sem lucro tributável no horizonte, r_liquido = r_bruto"},
    capitalizedInterest: {rule: "exclusão do lucro real quando incorridos e adição quando o ativo for realizado", basis: "Decreto-Lei 1.598/1977, art. 17, § 1º, b, e § 3º; RIR/2018, art. 402"},
    foreignDebt: {
      withholdingGeneral: "0.15",
      withholdingFavoredJurisdiction: "0.25",
      basis: "RIR/2018, art. 760; Lei 9.779/1999, art. 8º",
      grossUpFormula: "custo = juros_contratuais / (1 - aliquota_retencao)",
      thinCapRelatedParty: {maximumDebtToParticipation: "2", basis: "Lei 12.249/2010, art. 24"},
      thinCapFavoredJurisdiction: {maximumDebtToNetEquity: "0.30", basis: "Lei 12.249/2010, art. 25"},
      infrastructureBondsWithholding: {rate: "0", exceptions: {favoredJurisdiction: "0.25", relatedParty: "0.30"}, basis: "Lei 9.481/1997, art. 1º, XIII, e § 1º-A"},
    },
    incentivizedInstruments: [
      {id: "debenture_incentivada_12431", beneficiary: "investidor", investorWithholding: {naturalPerson: "0", legalEntity: "0.15"}, issuerNetCost: "r_bruto * (1 - t)", requirements: ["projeto prioritário", "remuneração prefixada, por índice de preços ou TR, sem taxa pós-fixada", "prazo médio ponderado acima de 4 anos", "sem recompra pelo emissor ou parte relacionada nos 2 primeiros anos", "cupom com intervalo mínimo de 180 dias", "emissão até 31/12/2030"], unallocatedFundsPenalty: "0.20", basis: "Lei 12.431/2011, arts. 1º e 2º"},
      {id: "debenture_infraestrutura_14801", beneficiary: "emissor", additionalExclusionShareOfInterest: "0.30", issuerNetCostFormula: "r_liquido = r_bruto * (1 - 1.3 * t)", investorTaxation: "normal", relatedPartyPurchase: false, basis: "Lei 14.801/2024, art. 6º, II"},
      {id: "cri_cra", beneficiary: "investidor pessoa física", investorWithholding: {naturalPerson: "0"}, basis: "Lei 11.033/2004, art. 3º, II e IV"},
    ],
    incentiveRules: {noCombination: "benefícios das Leis 12.431 e 14.801 não se acumulam na mesma debênture (Decreto 11.964/2024, art. 20)", issuanceCap: "capex do projeto (Decreto 11.964/2024, art. 5º, § 2º)", extension: "Lei 15.506/2026 estende os dois regimes a projetos prioritários de minerais críticos e estratégicos", lc224Cut: "o corte de 10% de benefícios da LC 224/2025 não alcança o regime da Lei 12.431 nem a exclusão do art. 6º da Lei 14.801"},
    equityAlternatives: {
      interestOnEquity: {deductibleUpTo: "TJLP sobre as contas de patrimônio da Lei 9.249/1995, art. 9º", minimumProfitMultiple: "2", withholding: "0.175", withholdingFrom: "2026-01-01", basis: "Lei 9.249/1995, art. 9º; LC 224/2025, art. 8º"},
      dividends: {residentIndividualWithholding: "0.10", monthlyThresholdPerPayerBRL: "50000", appliesTo: "todo o valor pago no mês quando acima do limite", nonResidentWithholding: "0.10", from: "2026-01-01", transition: "lucros até 2025 com distribuição aprovada até 31/12/2025", basis: "Lei 15.270/2025"},
    },
    cashCarry: {pisOnFinancialRevenue: "0.0065", cofinsOnFinancialRevenue: "0.04", regime: "não cumulativo", financialExpenseCredit: false, basis: "Decreto 8.426/2015; Leis 10.637/2002 e 10.833/2003, art. 3º, V", endsOn: "2026-12-31"},
    consumptionTaxReform: {
      testYear2026: {cbs: "0.009", ibs: "0.001", costEffect: false, basis: "LC 214/2025, arts. 343, 346 e 348"},
      creditFrom: "2027-01-01",
      financialServicesCombinedRate2027: "0.1085",
      financialServicesRateBasis: "LC 214/2025, art. 233, na redação da LC 227/2026",
      borrowerCredit: {regime: "regular", formula: "credito = aliquota_da_operacao * (juros_pagos - selic_sobre_principal)", basis: "LC 214/2025, art. 194"},
      debenturesAndNotes: "crédito só enquanto o titular for contribuinte do regime financeiro; oferta pública sem crédito (art. 195)",
      discounting: "crédito sobre o deságio acima da curva de DI futuro (art. 196)",
      foreignCurrencyDebt: "sem crédito (art. 197)",
      feesAndCommissions: "geram crédito (art. 198)",
    },
    applicationRules: {
      defaultPresentation: "all-in antes de imposto",
      netCostRequires: ["regime provado pela ECF do último exercício", "lucro tributável projetado no horizonte"],
      investorSideBenefit: "já incluído na taxa; não entra de novo",
      issuerSideBenefit: "somente no lucro real com lucro tributável",
      ibsCbsCredit: "fluxos a partir de 01/01/2027, tomador no regime regular, alíquota publicada",
      ruleDate: "data de cada fluxo",
      boundary: "enquadramento, planejamento e parecer ficam com o tributarista da companhia",
    },
    illustrations: [
      {case: "custo bruto de 12% ao ano, lucro real com lucro tributável", netNormal: "0.0792", netInfrastructure14801: "0.06696"},
      {case: "CCB a CDI + 2,5% com CDI igual à Selic, a partir de 2027", ibsCbsCreditPerYearOfPrincipal: "0.0027125"},
    ],
    review: {routine: "trimestral e antes de 01/01/2027", proposedValidityDays: 90, invalidatedBy: ["lei ou medida provisória sobre IRPJ, CSLL, juros sobre capital próprio, dividendos ou as Leis 12.431 e 14.801", "resolução do Senado com a alíquota de referência da CBS de 2027", "regulamentação dos arts. 194 a 199 da LC 214", "julgamento do STF no Tema 1.401"]},
  },
};

export const capitalLegalProposals: ReferenceDataProposalFamily = {
  "policy.capital.iof": iof,
  "policy.capital.anbima-b3-conventions": rateConventions,
  "policy.capital.tax-regime": taxRegime,
};
