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
        discount: {base: "valor líquido obtido (valor nominal menos juros cobrados antecipadamente)", term: "prazo do título, limitado a 365 dias", article: "art. 7º, II, e § 4º"},
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
      {instrument: "intercompany_loan", obligationInstrument: "direct_loan", treatment: "general_rate", condition: "mutuante pessoa jurídica, responsável pela cobrança (art. 5º, III)", article: "art. 2º, I, c; art. 3º, § 3º, III"},
      {instrument: "receivables_discount", obligationInstrument: "receivables_assignment", treatment: "general_rate_on_net_value", article: "art. 7º, II"},
      {instrument: "supplier_finance", obligationInstrument: "other", treatment: "outside_credit_iof", article: "ADC 96, suspensão dos §§ 23 e 24 do art. 7º"},
      {instrument: "nce", obligationInstrument: "nce", treatment: "exempt", article: "art. 9º, IV", evidence: "vínculo com exportação"},
      {instrument: "cce", obligationInstrument: "other", treatment: "exempt", article: "art. 9º, IV", evidence: "vínculo com exportação"},
      {instrument: "acc", obligationInstrument: "other", treatment: "zero_rate", article: "art. 8º, XVII", evidence: "contrato de câmbio de exportação"},
      {instrument: "export_credit", obligationInstrument: "direct_loan", treatment: "zero_rate", article: "art. 8º, III", evidence: "finalidade de exportação no contrato"},
      {instrument: "rural_credit", obligationInstrument: "direct_loan", treatment: "zero_rate", article: "art. 8º, IV", evidence: "classificação como crédito rural no Manual de Crédito Rural"},
      {instrument: "finame", obligationInstrument: "finame_on_lending", treatment: "zero_rate", article: "art. 8º, IX", evidence: "contrato do agente com fonte FINAME"},
      {instrument: "finep", obligationInstrument: "direct_loan", treatment: "zero_rate", article: "art. 8º, XXXI", evidence: "contrato com recursos da FINEP, direto ou por agente financeiro"},
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
      conversionKey: {key: "market.pricing.indexer-basis", fields: ["conversions", "curves"]},
      overnightRateAllowed: false,
      existingDebtTenorFallback: "quando o fluxo do contrato não permite calcular a duration (D-18), o ponto da curva é a vida média remanescente, com a aproximação registrada no memo",
      keepOriginalQuote: true,
      linearSumAllowed: false,
    },
    allIn: {
      methodKey: "policy.pricing.cost-catalogue",
      methodField: "annualization.governingMethod",
      discountBasis: "DU/252",
      spreadEquivalent: "s tal que (1 + r) = (1 + c) * (1 + s)",
      iofKey: "policy.capital.iof",
    },
    display: {key: "policy.material.numeric_rounding", factors: "casas da tabela de precisão desta chave"},
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
    prepaidInterestAndDiscount: "deságio e juros antecipados apropriados pro rata (RIR/2018, art. 399)",
    capitalizedInterest: {qualifyingAssets: ["imobilizado", "intangível", "propriedade para investimento", "estoque de longa maturação"], rule: "exclusão do lucro real quando incorridos e adição quando o ativo for realizado", basis: "Decreto-Lei 1.598/1977, art. 17, § 1º, b, e § 3º; RIR/2018, art. 402"},
    foreignDebt: {
      withholdingGeneral: "0.15",
      withholdingFavoredJurisdiction: "0.25",
      basis: "RIR/2018, art. 760; Lei 9.779/1999, art. 8º",
      grossUpFormula: "custo = juros_contratuais / (1 - aliquota_retencao)",
      thinCapRelatedParty: {maximumDebtToParticipation: "2", basis: "Lei 12.249/2010, art. 24"},
      thinCapFavoredJurisdiction: {maximumDebtToNetEquity: "0.30", basis: "Lei 12.249/2010, art. 25"},
      infrastructureIssuerInternationalBondsWithholding: {rate: "0", scope: "juros de empréstimo externo registrado no Banco Central e contratado por emissão de títulos no mercado internacional, por SPE, concessionária, permissionária, autorizatária ou arrendatária de infraestrutura constituída como sociedade anônima, ou por sua controladora; não alcança a debênture de infraestrutura doméstica", exceptions: {favoredJurisdiction: "0.25", relatedParty: "0.30"}, basis: "Lei 9.481/1997, art. 1º, XIII, e § 1º-A, incluídos pela Lei 14.801/2024"},
    },
    incentivizedInstruments: [
      {id: "debenture_incentivada_12431", beneficiary: "investidor", investorWithholding: {naturalPerson: "0", legalEntity: "0.15"}, issuerNetCost: "r_bruto * (1 - t)", requirementsKey: {key: "market.instrument.eligibility", instrumentId: "debenture_incentivized", rule: "requisitos da emissão e multa sobre recurso não alocado ao projeto"}, basis: "Lei 12.431/2011, arts. 1º e 2º"},
      {id: "debenture_infraestrutura_14801", beneficiary: "emissor", additionalExclusionShareOfInterest: "0.30", issuerNetCostFormula: "r_liquido = r_bruto * (1 - 1.3 * t)", investorTaxation: "normal", relatedPartyPurchase: false, basis: "Lei 14.801/2024, art. 6º, II"},
      {id: "cri_cra", beneficiary: "investidor pessoa física", investorWithholding: {naturalPerson: "0"}, basis: "Lei 11.033/2004, art. 3º, II e IV"},
    ],
    incentiveRules: {noCombination: "benefícios das Leis 12.431 e 14.801 não se acumulam na mesma debênture (Decreto 11.964/2024, art. 20)", issuanceCap: "capex do projeto (Decreto 11.964/2024, art. 5º, § 2º)", extension: "Lei 15.506/2026 estende os dois regimes a projetos prioritários de minerais críticos e estratégicos", lc224Cut: "o corte de 10% de benefícios da LC 224/2025 (art. 4º, § 4º) não alcança o imposto na fonte da Lei 12.431 nem a exclusão do art. 6º da Lei 14.801, pela leitura da Receita Federal (Perguntas e Respostas sobre a redução de benefícios tributários, versão 5, de 30/07/2026, perguntas 15 a 17), interpretação administrativa e não texto da lei"},
    equityAlternatives: {
      interestOnEquity: {deductibleUpTo: "TJLP sobre as contas de patrimônio da Lei 9.249/1995, art. 9º", minimumProfitMultiple: "2", withholding: "0.175", withholdingFrom: "2026-01-01", basis: "Lei 9.249/1995, art. 9º; LC 224/2025, art. 8º"},
      dividends: {residentIndividualWithholding: "0.10", monthlyThresholdPerPayerBRL: "50000", appliesTo: "todo o valor pago no mês quando acima do limite", nonResidentWithholding: "0.10", from: "2026-01-01", transition: "lucros até 2025 com distribuição aprovada até 31/12/2025", basis: "Lei 15.270/2025"},
    },
    cashCarry: {pisOnFinancialRevenue: "0.0065", cofinsOnFinancialRevenue: "0.04", regime: "não cumulativo", financialExpenseCredit: false, basis: "Decreto 8.426/2015; Leis 10.637/2002 e 10.833/2003, art. 3º, V", endsOn: "2026-12-31"},
    consumptionTaxReform: {
      testYear2026: {cbs: "0.009", ibs: "0.001", costEffect: false, basis: "LC 214/2025, arts. 343, 346 e 348"},
      creditFrom: "2027-01-01",
      financialServicesCombinedRate2027And2028: "0.1085",
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

const accelerationEvents: ReferenceDataProposal = {
  version,
  asOf,
  documentation: card("policy.structure.acceleration-events"),
  unit: "catálogo de eventos; limiares em fração decimal da métrica indicada ou por referência a outro parâmetro; prazos em dias úteis ou corridos, conforme o campo",
  source: {
    title: "Lei 6.404/1976, arts. 68, 71, 116, 124, 174, § 3º, 202 e 231; Resolução CVM 17/2021, arts. 11, 12 e 16; Código Civil, arts. 333 e 1.425; Lei 11.101/2005, arts. 6º, 49 e 77; calibração da casa para o catálogo indicativo",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l6404compilada.htm",
    observedBy,
  },
  value: {
    schemaVersion: "acceleration-events.v1",
    scope: "catálogo indicativo para term sheet e memorando; o texto final é da assessoria jurídica das partes",
    perimeter: {
      entities: ["emissora", "garantidores", "subsidiárias relevantes"],
      relevantSubsidiary: {shareOfConsolidatedEbitdaLtm: "0.10", shareOfConsolidatedTotalAssets: "0.10", rule: "controlada que atinge qualquer dos dois limites na última demonstração consolidada"},
    },
    materialityConventions: {
      monetaryThresholdKey: "policy.structure.cross-default-threshold",
      monetaryThresholdAppliesTo: ["cross_acceleration", "cross_default", "protests", "judgments"],
      foreignCurrencyConversion: "PTAX de venda do dia útil anterior ao evento",
      financialDebtScope: {key: "policy.structure.cross-default-threshold", fields: ["scope.obligations", "scope.excluded"], rule: "a dívida que conta para cross_acceleration, cross_default, protests e judgments é a do escopo daquela chave"},
      assetDisposal: {shareOfConsolidatedTotalAssets: "0.10", window: "12 meses corridos", basis: "valor contábil", exclusions: ["curso normal dos negócios, inclusive estoque e recebíveis cedidos em operação permitida", "ativo substituído por outro de mesma natureza em até 360 dias", "venda com produto aplicado em amortização da dívida"]},
      cureClasses: {
        source: "policy.structure.cure-waiver",
        classes: ["payment_default", "non_monetary_obligation", "information_delivery", "misrepresentation", "financial_covenant_breach", "security_deterioration", "none"],
        rule: "cada classe é um evento da matriz cureMatrix de policy.structure.cure-waiver, que governa o prazo; este catálogo não repete prazos de cura",
        ownWindows: ["protests.responseBusinessDays", "judgments.paymentOrGuaranteeBusinessDays", "essential_license_loss.restorationDays", "security_not_perfected.perfectionDeadline"],
      },
    },
    events: [
      {id: "payment_default", mode: "automatic", trigger: "não pagamento de principal, juros ou qualquer valor devido na data", threshold: "qualquer valor", cureClass: "payment_default", basis: "contrato; Código Civil, art. 397"},
      {id: "insolvency", mode: "automatic", trigger: "falência decretada, pedido de autofalência, pedido de falência de terceiro não elidido no prazo legal de defesa, pedido de recuperação judicial ou de homologação de recuperação extrajudicial, dissolução ou liquidação", threshold: "qualquer valor para emissora e garantidores; subsidiária relevante pelo critério do perímetro", cureClass: "none", basis: "Lei 11.101/2005, art. 77 (a falência vence antecipadamente as dívidas); Código Civil, art. 333, I", note: "a suspensão do art. 6º da Lei 11.101 limita a cobrança dos créditos sujeitos à recuperação; o crédito com propriedade fiduciária fica fora (art. 49, § 3º)"},
      {id: "cross_acceleration", mode: "automatic", trigger: "vencimento antecipado declarado de outra dívida financeira", threshold: "limiar monetário do cross-default, individual ou agregado", cureClass: "none", basis: "contrato"},
      {id: "false_representation", mode: "automatic", trigger: "declaração comprovadamente falsa prestada no instrumento", threshold: "qualquer", cureClass: "none", basis: "contrato"},
      {id: "transformation", mode: "automatic", trigger: "transformação da emissora de sociedade por ações em outro tipo societário", threshold: "qualquer", cureClass: "none", basis: "Lei 6.404/1976, arts. 52 e 220 a 222"},
      {id: "validity_challenge", mode: "automatic", trigger: "questionamento judicial ou arbitral, pela emissora, garantidores ou controladores, da validade ou exequibilidade do instrumento ou das garantias", threshold: "qualquer", cureClass: "none", basis: "contrato"},
      {id: "assignment_of_obligations", mode: "automatic", trigger: "cessão ou transferência das obrigações da emissora sem aprovação dos credores", threshold: "qualquer", cureClass: "none", basis: "contrato; Código Civil, art. 299"},
      {id: "capital_reduction_without_approval", mode: "automatic", trigger: "redução de capital com restituição aos acionistas sem aprovação prévia dos debenturistas", threshold: "qualquer", cureClass: "none", basis: "Lei 6.404/1976, art. 174, § 3º", excludes: "redução para absorver prejuízo"},
      {id: "reorganization_without_approval", mode: "automatic", trigger: "incorporação, fusão ou cisão sem aprovação prévia dos debenturistas e sem oferta de resgate por seis meses", threshold: "qualquer", cureClass: "none", basis: "Lei 6.404/1976, art. 231", excludes: "reorganização entre sociedades do grupo autorizada na escritura, com manutenção de controle e garantias"},
      {id: "grave_integrity_breach", mode: "automatic", trigger: "condenação definitiva, administrativa ou judicial, da emissora, de garantidora ou de subsidiária relevante do perímetro por ato lesivo da Lei 12.846/2013, trabalho infantil ou trabalho análogo ao de escravo", threshold: "qualquer", cureClass: "none", basis: "Lei 12.846/2013; contrato"},
      {id: "non_monetary_breach", mode: "non_automatic", trigger: "descumprimento de obrigação não pecuniária", threshold: "qualquer", cureClass: "non_monetary_obligation", basis: "contrato"},
      {id: "information_breach", mode: "non_automatic", trigger: "atraso ou falha na entrega de informação obrigatória", threshold: "qualquer", cureClass: "information_delivery", basis: "contrato; ES-30"},
      {id: "financial_covenant_breach", mode: "non_automatic", trigger: "índice financeiro fora do limite na data de apuração, pela definição do contrato", threshold: "limite do covenant", cureClass: "financial_covenant_breach", basis: "contrato; ES-23 e ES-24"},
      {id: "cross_default", mode: "non_automatic", trigger: "inadimplemento pecuniário de outra dívida financeira não sanado no prazo de cura daquele instrumento, sem vencimento antecipado declarado; inadimplemento não pecuniário de outro contrato só conta quando o credor dele declara o vencimento (cross_acceleration)", threshold: "limiar monetário do cross-default, individual ou agregado", cureClass: "none", basis: "contrato; ES-28"},
      {id: "incorrect_representation", mode: "non_automatic", trigger: "declaração incorreta, incompleta ou enganosa em aspecto relevante", threshold: "aspecto relevante", cureClass: "misrepresentation", basis: "contrato"},
      {id: "protests", mode: "non_automatic", trigger: "protesto de títulos não cancelado, sustado ou garantido", threshold: "limiar monetário do cross-default, individual ou agregado", responseBusinessDays: 10, cureClass: "none", basis: "Lei 9.492/1997; contrato"},
      {id: "judgments", mode: "non_automatic", trigger: "decisão judicial ou arbitral exequível, sem efeito suspensivo, ou transitada em julgado, com condenação a pagar", threshold: "limiar monetário do cross-default, individual ou agregado", paymentOrGuaranteeBusinessDays: 15, cureClass: "none", basis: "contrato"},
      {id: "asset_disposal", mode: "non_automatic", trigger: "alienação, cessão ou oneração fora das permissões, inclusive de participações", threshold: "assetDisposal", cureClass: "none", basis: "contrato; ES-26 e ES-29"},
      {id: "change_of_control", mode: "non_automatic", trigger: "alteração do controle direto ou indireto (Lei 6.404, art. 116), ou saída da pessoa-chave quando o crédito depende dela (ES-34)", threshold: "qualquer", exclusions: ["transferência dentro do mesmo grupo econômico", "oferta pública de ações que mantém o controle"], cureClass: "none", basis: "Lei 6.404/1976, art. 116; ES-34"},
      {id: "essential_license_loss", mode: "non_automatic", trigger: "perda, suspensão, cassação ou não renovação de licença ou autorização essencial à atividade", threshold: "licença essencial", restorationDays: 30, cureClass: "none", basis: "contrato; EMP-17"},
      {id: "collateral_loss", mode: "non_automatic", trigger: "desapropriação, perda ou deterioração de ativo relevante ou de ativo em garantia sem reforço ou substituição no prazo de cura", threshold: "ativo relevante ou garantia", cureClass: "security_deterioration", basis: "Código Civil, arts. 333, III, e 1.425"},
      {id: "collateral_coverage_shortfall", mode: "non_automatic", trigger: "garantia abaixo da cobertura mínima sem recomposição no prazo de cura", threshold: "cobertura mínima de policy.structure.collateral-coverage", cureClass: "security_deterioration", basis: "contrato; ES-11 e ES-20"},
      {id: "distribution_in_default", mode: "non_automatic", trigger: "distribuição acima do mínimo obrigatório com inadimplemento em curso ou covenant descumprido", threshold: "dividendo mínimo obrigatório", cureClass: "none", basis: "Lei 6.404/1976, art. 202; ES-25"},
      {id: "core_business_change", mode: "non_automatic", trigger: "alteração do objeto social que modifique a atividade principal", threshold: "atividade principal", cureClass: "none", basis: "contrato"},
      {id: "security_not_perfected", mode: "non_automatic", trigger: "garantia não constituída, não registrada ou sem eficácia no prazo contratado", threshold: "qualquer garantia do pacote", perfectionDeadline: "prazo de constituição fixado no contrato", cureClass: "none", basis: "Lei 6.404/1976, art. 62, III; contrato"},
      {id: "use_of_proceeds_breach", mode: "non_automatic", trigger: "destinação dos recursos diferente da prevista no instrumento", threshold: "qualquer valor", cureClass: "none", basis: "contrato; na debênture incentivada, multa de 20% do valor não alocado ao projeto (Lei 12.431/2011, art. 2º, § 5º)"},
      {id: "other_integrity_breach", mode: "non_automatic", trigger: "descumprimento de legislação ambiental, trabalhista ou anticorrupção com efeito adverso relevante, fora do evento automático", threshold: "efeito adverso relevante", cureClass: "non_monetary_obligation", basis: "contrato"},
    ],
    declarationProcedure: {
      automatic: "o agente fiduciário ou o credor declara o vencimento sem assembleia, na ciência do evento",
      nonAutomatic: {
        mechanic: "declared_unless_assembly_waives",
        houseDefault: "mecânica padrão da casa no term sheet indicativo",
        negotiationLever: "declared_only_by_assembly, oferecida somente nas condições de policy.structure.cure-waiver (accelerationMechanics.negotiationLever)",
        convocationBusinessDaysAfterKnowledge: 2,
        nonDeclarationQuorum: "maioria absoluta dos valores mobiliários em circulação, piso da Resolução CVM 17/2021, art. 12, § 2º",
        installation: "metade das debêntures em circulação em primeira convocação e qualquer número em segunda (Lei 6.404, art. 71, § 3º)",
        convocationNoticeDays: {openCompanyFirstCall: 21, openCompanySecondCall: 8, closedCompanyFirstCall: 8, closedCompanySecondCall: 5, basis: "Lei 6.404, arts. 71, § 2º, e 124, § 1º"},
        withoutQuorum: "sem deliberação que aprove a não declaração, o vencimento é declarado",
      },
      trusteeDisclosure: {financialDefaultBusinessDays: 7, basis: "Resolução CVM 17/2021, arts. 11, XXI, e 16, II", holderNotificationMaxDays: 60, holderNotificationBasis: "Lei 6.404, art. 68, § 1º, c"},
      issuerAnnualStatement: "declaração anual de inexistência de evento de vencimento antecipado (Regras e Procedimentos do Código de Ofertas Públicas da ANBIMA, Anexo III)",
      bilateralLoans: "evento automático equivale a vencimento de pleno direito; evento não automático equivale a faculdade do credor mediante notificação",
      commercialNotes: "alteração das características do termo pela maioria simples das notas em circulação presentes na assembleia, salvo quórum maior no termo, com as regras de assembleia de debenturistas (Lei 14.195/2021, art. 47, §§ 2º e 3º); com agente fiduciário nomeado para oferta pública ou negociação em mercado organizado, modificação de condições e não declaração pelo piso da Resolução CVM 17/2021, arts. 1º e 12, § 2º",
    },
    marketStandard: "o Guia de Padronização da ANBIMA em vigor não sugere texto para eventos de vencimento antecipado; o catálogo cobre os 22 temas mínimos da minuta ANBIMA de 2015",
    materialAdverseChange: {
      use: "somente em ponte e em compromisso de desembolso futuro (ES-35)",
      objectiveCriteria: [
        {id: "ebitda_drop", rule: "EBITDA dos últimos 12 meses abaixo do caso base do fechamento", dropShare: "0.25", comparator: "at_least"},
        {id: "rating_downgrade", rule: "rebaixamento de rating em escala nacional", notches: 2, comparator: "at_least"},
        {id: "customer_loss", rule: "perda de cliente ou contrato que responda pela fração da receita dos últimos 12 meses", revenueShare: "0.20", comparator: "at_least"},
        {id: "named_event", rule: "evento nomeado no contrato, com data e evidência"},
      ],
      refused: "cláusula de efeito adverso relevante sem critério objetivo",
    },
    calibrationRules: [
      "todo evento declara modo, gatilho, limiar ou 'qualquer valor' explícito, perímetro, classe de cura e base",
      "evento sem limiar definido não entra no term sheet",
      "o mesmo limiar monetário vale para vencimento cruzado, inadimplemento de outra dívida, protesto e decisão judicial",
      "a nova dívida é testada nos cross-defaults dos contratos existentes (ES-28 e D-29)",
      "a Offroad propõe o menu indicativo; decisão, negociação e redação final pertencem às partes e à assessoria jurídica",
    ],
    review: {
      proposedValidityMonths: 12,
      invalidatedBy: ["alteração dos artigos citados da Lei 6.404, do Código Civil ou da Lei 11.101", "nova escritura padrão ou orientação da ANBIMA", "regra da CVM sobre agente fiduciário ou assembleia de debenturistas", "jurisprudência do STJ sobre cláusula de vencimento por recuperação judicial"],
    },
  },
};

const corporateAuthority: ReferenceDataProposal = {
  version,
  asOf,
  documentation: card("policy.structure.corporate-authority"),
  unit: "matriz de competência por forma societária e ato; limites em fração decimal; prazos em dias, salvo os campos em anos",
  source: {
    title: "Lei 6.404/1976, arts. 52, 59, 61, 62, 122, 142, 154 e 245 (redação da Lei 14.711/2023); Código Civil, arts. 1.015, 1.071, 1.076 e 1.647; Lei 11.101/2005, arts. 66, 69-A a 69-F, 99 e 129; Lei 8.987/1995, arts. 27 a 28-A",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l6404compilada.htm",
    observedBy,
  },
  value: {
    schemaVersion: "corporate-authority.v1",
    precedence: ["estatuto ou contrato social vigente arquivado", "acordo de acionistas ou de quotistas", "alçadas internas", "competência legal desta matriz"],
    legalForms: ["sa_aberta", "sa_fechada", "ltda", "cooperativa"],
    acts: [
      {id: "issue_non_convertible_debentures", sa: {body: "conselho de administração ou diretoria, salvo disposição estatutária em contrário, em companhia aberta ou fechada", article: "Lei 6.404, art. 59, § 1º (Lei 14.711/2023)", filing: "ato arquivado na junta comercial e publicado (art. 62, I); na companhia aberta, envio do ato e da escritura à CVM (Resolução CVM 226/2025); escritura sem registro na junta"}, ltda: {allowed: false, houseStance: "fora da estrutura da casa até lei ou regra da CVM", legalNote: "Lei 6.404, art. 52; orientação do DREI de 2026 (Ofício Circular 92/2026) admite arquivamento sem lei; PL 3.324/2020 em tramitação", alternative: ["commercial_note", "ccb"]}, cooperativa: {allowed: false, reason: "Lei 6.404, art. 52"}},
      {id: "issue_convertible_debentures", sa: {body: "assembleia geral; na companhia aberta, conselho dentro do capital autorizado quando o estatuto permitir", article: "Lei 6.404, arts. 59, caput e § 2º, e 122, IV"}, ltda: {allowed: false, houseStance: "fora da estrutura da casa"}, cooperativa: {allowed: false}},
      {id: "issue_commercial_notes", sa: {body: "órgãos de administração, se houver, ou administrador, na forma do estatuto", article: "Lei 14.195/2021, art. 46, parágrafo único"}, ltda: {body: "órgãos de administração, se houver, ou administrador, na forma do contrato social", article: "Lei 14.195/2021, art. 46, parágrafo único"}, cooperativa: {body: "órgãos de administração na forma do estatuto", article: "Lei 14.195/2021, art. 46"}},
      {id: "borrow", sa: {body: "diretoria nos limites de alçada do estatuto"}, ltda: {body: "administradores nos limites do contrato social", article: "Código Civil, art. 1.015"}, cooperativa: {body: "órgão previsto no estatuto"}},
      {id: "encumber_own_assets", sa: {body: "conselho de administração, se o estatuto não dispuser em contrário", article: "Lei 6.404, art. 142, VIII"}, ltda: {body: "imóvel fora do objeto social: maioria dos sócios; demais bens: contrato social", article: "Código Civil, art. 1.015"}, cooperativa: {body: "órgão previsto no estatuto"}},
      {id: "guarantee_third_party", sa: {body: "conselho de administração, se o estatuto não dispuser em contrário", article: "Lei 6.404, art. 142, VIII", limits: ["vedado ato de liberalidade (art. 154, § 2º, a)", "condições comutativas entre sociedades do grupo (art. 245)"]}, ltda: {body: "contrato social e deliberação dos sócios", limits: ["benefício documentado", "condições comutativas"]}, cooperativa: {body: "órgão previsto no estatuto"}},
      {id: "dispose_over_half_of_assets", sa: {body: "assembleia geral na companhia aberta", article: "Lei 6.404, art. 122, X", threshold: "0.50"}},
      {id: "file_judicial_recovery", sa: {body: "assembleia geral", article: "Lei 6.404, art. 122, IX"}, ltda: {body: "sócios com mais da metade do capital", article: "Código Civil, arts. 1.071, VIII, e 1.076, II"}},
    ],
    thirdPartyConsents: [
      {id: "judicial_recovery", rule: "onerar ou alienar ativo não circulante exige autorização do juízo, ouvido o comitê, salvo previsão no plano aprovado; financiamento DIP com garantia exige autorização", article: "Lei 11.101, arts. 66 e 69-A a 69-F"},
      {id: "public_concession", rule: "transferência de controle ou da concessão exige anuência prévia do poder concedente, sob pena de caducidade; garantia sobre direitos emergentes limitada à continuidade do serviço; cessão fiduciária de créditos operacionais registrada e notificada ao poder concedente", article: "Lei 8.987, arts. 27, 27-A, 28 e 28-A"},
      {id: "state_owned", rule: "competências do art. 142 da Lei 6.404 mantidas; limites fiscais e de crédito público com revisão jurídica específica", article: "Lei 13.303, art. 18"},
      {id: "shareholder_agreement", rule: "vetos e quóruns do acordo somam-se à competência legal", houseProcedureId: "EMP-11"},
      {id: "existing_creditors", rule: "vedação de garantia, limite de endividamento e mudança de controle dos contratos vigentes", houseProcedureIds: ["D-20", "ES-26", "ES-27"]},
      {id: "regulator", rule: "anuência de regulador setorial para ônus ou transferência de controle quando o setor exigir"},
    ],
    individualGuarantors: {
      suretyship: {spouseConsentRequired: true, exception: "separação absoluta", article: "Código Civil, art. 1.647, III; Súmula 332 do STJ"},
      aval: {spouseConsentRequiredByHouse: true, legalNote: "o STJ dispensa a autorização em título típico de lei especial (REsp 1.526.560); a casa exige a anuência para afastar disputa sobre a meação"},
      evidence: ["certidão de casamento", "pacto antenupcial quando houver"],
    },
    groupGuarantees: {
      upstreamOrCrossStream: {requirements: ["aprovação do órgão competente da garantidora", "benefício documentado: repasse de recursos ou remuneração de garantia em condição de mercado"], limitWithMinorityOrRestrictedCreditors: "benefício recebido"},
      holdingDebtGuarantorCoverage: {minimumShareOfConsolidatedEbitdaLtm: "0.80"},
      newGuaranteeForExistingDebt: {legalTermDays: 90, termCountedBackFrom: ["pedido de falência", "pedido de recuperação judicial", "primeiro protesto por falta de pagamento"], rule: "garantia real constituída no termo legal para dívida anterior é ineficaz perante a massa", article: "Lei 11.101, arts. 99, II, e 129, III"},
      gratuitousActs: {lookbackYears: 2, rule: "ato gratuito antes da falência é ineficaz; garantia sem contrapartida é tratada como gratuita", article: "Lei 11.101, art. 129, IV"},
    },
    verificationOrder: ["estatuto ou contrato social", "acordo de acionistas ou quotistas", "alçadas internas", "contratos vigentes", "regulador", "cônjuge", "juízo da recuperação"],
    dayOneStatus: {
      green: "competência identificada, sem vedação legal, estatutária ou contratual, com órgão, quórum e prazo",
      amber: "aprovação de terceiro pendente; vira condição precedente com responsável e prazo (OP-09)",
      red: "vedação sem caminho: vedação estatutária sem reforma pretendida ou anuência negada; debênture de limitada por política da casa",
    },
    minimumEvidence: ["estatuto ou contrato social consolidado", "ata ou deliberação com valor, prazo e garantias", "procuração de quem assina", "certidão de arquivamento na junta quando exigida", "anuências escritas de terceiros"],
    boundary: "a Offroad verifica competência e caminho de aprovação; validade dos atos e parecer ficam com a assessoria jurídica das partes",
    review: {proposedValidityMonths: 12, invalidatedBy: ["alteração da Lei 6.404, do Código Civil (sociedades e garantias), da Lei 14.195, da Lei 11.101 ou da Lei 8.987", "regulamentação da publicação do ato de emissão (Lei 6.404, art. 62, §§ 5º e 6º)", "súmula ou repetitivo do STJ sobre outorga conjugal ou garantia de grupo"]},
  },
};

const intercreditor: ReferenceDataProposal = {
  version,
  asOf,
  documentation: card("policy.structure.intercreditor"),
  unit: "regras de acordo entre credores; quóruns em fração decimal do saldo garantido; prazos em dias",
  source: {
    title: "Código Civil, arts. 853-A e 1.476 a 1.478, e Lei 9.514/1997, art. 22, na redação da Lei 14.711/2023; Lei 13.476/2017, arts. 9º-A a 9º-D; Lei 11.101/2005, arts. 49, 50, 83 e 84; Lei 6.404/1976, arts. 58, 70, 71 e 124",
    url: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14711.htm",
    observedBy,
  },
  value: {
    schemaVersion: "intercreditor.v1",
    triggers: [
      {id: "shared_existing_security", rule: "nova dívida sobre garantia já constituída em favor de outro credor"},
      {id: "subsequent_fiduciary_lien", rule: "alienação fiduciária superveniente do mesmo imóvel", basis: "Lei 9.514/1997, art. 22, §§ 3º e 4º"},
      {id: "subordinated_debt", rule: "dívida subordinada, mezanino ou mútuo de sócio atrás da dívida sênior"},
      {id: "cross_entity_guarantees", rule: "dívidas em sociedades diferentes do grupo com garantias cruzadas"},
      {id: "multiple_bilateral_same_security", rule: "dois ou mais credores bilaterais com a mesma garantia sem contrato único"},
    ],
    priorityModels: [
      {id: "pari_passu_pro_rata", rule: "compartilhamento proporcional ao saldo"},
      {id: "first_and_second_lien", rule: "segundo grau de hipoteca (Código Civil, arts. 1.476 e 1.477) ou alienação fiduciária superveniente, eficaz a partir do cancelamento da anterior e com excussão pela ordem de constituição (Lei 9.514, art. 22, §§ 3º e 4º)"},
      {id: "contractual_subordination", rule: "subordinação contratual reconhecida na falência (Lei 11.101, art. 83, VIII, a)"},
    ],
    housePosition: {
      agent: {type: "agente de garantia", basis: "Código Civil, art. 853-A", replacementQuorum: "maioria simples dos créditos garantidos", paymentToCreditorsBusinessDays: 10, segregatedProceedsDays: 180},
      enforcementDecision: {withinClass: "cada classe vota pelo seu instrumento", acrossClassesShareOfSecuredBalance: "0.50", comparator: "acima de"},
      unanimityMatters: ["liberação ou substituição de garantia fora das hipóteses contratadas", "mudança de prioridade ou da ordem de distribuição", "novo credor fora da cesta permitida", "aumento do valor garantido"],
      waterfall: ["custas da excussão", "remuneração e despesas do agente", "credores garantidos, proporcionalmente ao saldo de principal, juros e encargos", "credores subordinados", "devedor"],
      subordinatedStandstillDays: 120,
    subordinatedStandstillScope: "sem acelerar nem executar, contados da notificação do inadimplemento à dívida sênior",
      standstillEndsOn: ["aceleração da dívida sênior", "falência ou recuperação", "vencimento final da dívida subordinada"],
      paymentBlockage: {duringSeniorPaymentDefault: true, otherSeniorEventMaxDays: 180, otherSeniorEventCountedFrom: "notificação", maxOncePerDays: 360},
      turnover: "valor recebido pelo subordinado em violação é repassado ao agente",
      accession: "termo de adesão para refinanciamento da dívida compartilhada com saldo não maior e garantia não mais ampla",
    },
    timeline: {existingBankConsentDays: {min: 30, max: 60}, debentureholderNoticeDays: {openCompanyFirstCall: 21, closedCompanyFirstCall: 8, basis: "Lei 6.404, arts. 71, § 2º, e 124, § 1º"}, minimumCalendarDaysBeforeClosing: 45},
    applicationRules: {
      es22: "garantia já dada só entra com liberação documentada na quitação ou compartilhamento formal assinado; verificação por contrato e certidão",
      es39: "registrar credores, contratos, anuências, prioridade, decisão, espera e prazo; term sheet diz 'compartilhamento pretendido, sujeito a acordo entre credores e à assessoria jurídica das partes'",
      es42: {amber: "necessidade de acordo com anuências identificadas e prazo compatível com a data da necessidade; vira condição precedente", red: "prazo incompatível ou anuência negada; volta a ES-40"},
    },
    legalConstraints: [
      {rule: "credor com propriedade fiduciária fica fora da recuperação judicial, inclusive o da alienação superveniente", basis: "Lei 11.101, art. 49, § 3º; Lei 9.514, art. 22, § 10"},
      {rule: "na recuperação, liberar ou substituir garantia em venda de ativo exige aprovação expressa do credor garantido", basis: "Lei 11.101, art. 50, § 1º"},
      {rule: "inadimplemento de dívida garantida pelo imóvel permite vencer as demais obrigações garantidas pelo mesmo imóvel", basis: "Lei 9.514, art. 22, § 6º; Código Civil, art. 1.477, § 2º"},
      {rule: "vedação de ônus da escritura averbada vale contra terceiros", basis: "Lei 6.404, art. 58, § 5º"},
      {rule: "substituição de garantia de debênture depende do agente fiduciário, que não altera condições da emissão", basis: "Lei 6.404, art. 70"},
      {rule: "extensão da alienação fiduciária de imóvel a nova operação com o mesmo credor do sistema financeiro, sem outro credor no imóvel, dispensa acordo", basis: "Lei 13.476/2017, arts. 9º-A a 9º-D"},
    ],
    review: {proposedValidityMonths: 12, invalidatedBy: ["alteração do Código Civil (garantias), da Lei 9.514, da Lei 13.476, da Lei 11.101 ou da Lei 6.404", "decisão do STF sobre execução extrajudicial de garantia", "súmula ou repetitivo do STJ sobre credor fiduciário na recuperação", "regra da CVM sobre assembleia de debenturistas"]},
  },
};

type RouteSpec = {
  id: string;
  name: string;
  legacyInstrumentId: string | null;
  assetBackings: string[];
  obligationInstruments: string[];
  distributedSecurities: string[];
  structureMechanisms: string[];
  capitalVehicles: string[];
  capitalProviderTypes: string[];
  distributionRoutes: string[];
  securityEnhancements: string[];
  requiredProviders: string[];
  legalBasis: string[];
  iofTreatment: string;
  referenceWeeks: {min: number; max: number};
};

const routes: RouteSpec[] = [
  {id: "ccb_bank", name: "CCB bilateral", legacyInstrumentId: "ccb", assetBackings: ["corporate_assets"], obligationInstruments: ["ccb"], distributedSecurities: ["none"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["bank_balance_sheet"], capitalProviderTypes: ["bank"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["fiduciary_assignment_receivables", "fiduciary_lien_real_estate", "fiduciary_lien_equipment", "corporate_guarantee", "personal_guarantee"], requiredProviders: ["banco credor", "registro das garantias"], legalBasis: ["Lei 10.931/2004, arts. 26 a 45"], iofTreatment: "ccb", referenceWeeks: {min: 2, max: 6}},
  {id: "ccb_credit_fund", name: "CCB com fundo de crédito", legacyInstrumentId: "ccb", assetBackings: ["corporate_assets"], obligationInstruments: ["ccb"], distributedSecurities: ["none"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["credit_fund"], capitalProviderTypes: ["credit_fund_manager", "asset_manager"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["fiduciary_assignment_receivables", "fiduciary_lien_real_estate", "corporate_guarantee"], requiredProviders: ["banco emitente ou endossante", "gestor do fundo", "custodiante do fundo"], legalBasis: ["Lei 10.931/2004, art. 29, § 1º"], iofTreatment: "ccb", referenceWeeks: {min: 3, max: 8}},
  {id: "revolving_facility", name: "Capital de giro rotativo e conta garantida", legacyInstrumentId: null, assetBackings: ["corporate_assets"], obligationInstruments: ["direct_loan"], distributedSecurities: ["none"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["bank_balance_sheet"], capitalProviderTypes: ["bank"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["fiduciary_assignment_receivables", "personal_guarantee"], requiredProviders: ["banco"], legalBasis: ["Decreto 6.306/2007, art. 7º, I, a"], iofTreatment: "working_capital_revolving", referenceWeeks: {min: 2, max: 4}},
  {id: "receivables_discount", name: "Desconto de títulos e antecipação", legacyInstrumentId: null, assetBackings: ["receivables"], obligationInstruments: ["receivables_assignment"], distributedSecurities: ["none"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["bank_balance_sheet"], capitalProviderTypes: ["bank"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["fiduciary_assignment_receivables"], requiredProviders: ["banco", "registro ou trava de domicílio"], legalBasis: ["Decreto 6.306/2007, art. 7º, II"], iofTreatment: "receivables_discount", referenceWeeks: {min: 1, max: 3}},
  {id: "export_credit_note", name: "NCE e CCE", legacyInstrumentId: "nce", assetBackings: ["corporate_assets"], obligationInstruments: ["nce"], distributedSecurities: ["none"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["bank_balance_sheet"], capitalProviderTypes: ["bank"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["fiduciary_assignment_receivables", "corporate_guarantee"], requiredProviders: ["banco"], legalBasis: ["Lei 6.313/1975", "Decreto 6.306/2007, art. 9º, IV"], iofTreatment: "nce", referenceWeeks: {min: 2, max: 6}},
  {id: "export_fx_advance", name: "ACC e ACE", legacyInstrumentId: null, assetBackings: ["receivables"], obligationInstruments: ["other"], distributedSecurities: ["none"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["bank_balance_sheet"], capitalProviderTypes: ["bank"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["none"], requiredProviders: ["banco autorizado a operar câmbio"], legalBasis: ["regulação cambial", "Decreto 6.306/2007, art. 8º, XVII"], iofTreatment: "acc", referenceWeeks: {min: 1, max: 3}},
  {id: "debenture_professional", name: "Debênture, rito automático, investidor profissional", legacyInstrumentId: "debenture_476", assetBackings: ["corporate_assets"], obligationInstruments: ["debenture"], distributedSecurities: ["debenture"], structureMechanisms: ["public_offering"], capitalVehicles: ["credit_fund", "insurance_balance_sheet", "bank_balance_sheet"], capitalProviderTypes: ["asset_manager", "institutional_investor", "insurer", "bank"], distributionRoutes: ["private_distribution"], securityEnhancements: ["none", "fiduciary_assignment_receivables", "fiduciary_lien_real_estate", "corporate_guarantee"], requiredProviders: ["coordenador (dispensável no regime FÁCIL da Resolução CVM 232/2025)", "agente fiduciário", "escriturador", "banco liquidante", "B3"], legalBasis: ["Lei 6.404/1976, arts. 52 a 74", "Resolução CVM 160/2022, art. 26, V ou X"], iofTreatment: "debenture", referenceWeeks: {min: 6, max: 10}},
  {id: "debenture_public", name: "Debênture, rito ordinário, público em geral", legacyInstrumentId: "debenture_160", assetBackings: ["corporate_assets"], obligationInstruments: ["debenture"], distributedSecurities: ["debenture"], structureMechanisms: ["public_offering"], capitalVehicles: ["credit_fund", "insurance_balance_sheet", "other"], capitalProviderTypes: ["asset_manager", "institutional_investor", "insurer", "other"], distributionRoutes: ["public_distribution"], securityEnhancements: ["none", "corporate_guarantee"], requiredProviders: ["coordenador", "agente fiduciário", "escriturador", "banco liquidante", "B3", "registro do emissor na CVM", "prospecto e lâmina"], legalBasis: ["Lei 6.404/1976, arts. 52 a 74", "Resolução CVM 160/2022, art. 28"], iofTreatment: "debenture", referenceWeeks: {min: 12, max: 20}},
  {id: "debenture_private_placement", name: "Debênture de colocação privada", legacyInstrumentId: null, assetBackings: ["corporate_assets"], obligationInstruments: ["debenture"], distributedSecurities: ["none"], structureMechanisms: ["private_placement"], capitalVehicles: ["securitization_company", "credit_fund"], capitalProviderTypes: ["securitization_company", "asset_manager"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["none", "fiduciary_assignment_receivables", "fiduciary_lien_real_estate"], requiredProviders: ["escriturador", "agente fiduciário quando houver negociação"], legalBasis: ["Lei 6.404/1976, art. 61, § 1º"], iofTreatment: "debenture", referenceWeeks: {min: 3, max: 6}},
  {id: "debenture_incentivized", name: "Debênture incentivada (Lei 12.431)", legacyInstrumentId: "debenture_476", assetBackings: ["corporate_assets"], obligationInstruments: ["debenture"], distributedSecurities: ["debenture"], structureMechanisms: ["public_offering", "project_finance"], capitalVehicles: ["credit_fund", "other"], capitalProviderTypes: ["asset_manager", "institutional_investor", "other"], distributionRoutes: ["private_distribution", "public_distribution"], securityEnhancements: ["fiduciary_assignment_receivables", "share_pledge", "reserve_account"], requiredProviders: ["coordenador", "agente fiduciário", "escriturador", "banco liquidante", "B3", "documentos do projeto ao ministério antes do pedido à CVM"], legalBasis: ["Lei 12.431/2011, art. 2º", "Decreto 11.964/2024, art. 8º", "Resolução CVM 160/2022, arts. 26, IX, e 86, IV"], iofTreatment: "debenture", referenceWeeks: {min: 10, max: 16}},
  {id: "debenture_infrastructure", name: "Debênture de infraestrutura (Lei 14.801)", legacyInstrumentId: "debenture_476", assetBackings: ["corporate_assets"], obligationInstruments: ["debenture"], distributedSecurities: ["debenture"], structureMechanisms: ["public_offering", "project_finance"], capitalVehicles: ["insurance_balance_sheet", "credit_fund", "other"], capitalProviderTypes: ["institutional_investor", "asset_manager", "insurer"], distributionRoutes: ["private_distribution", "public_distribution"], securityEnhancements: ["fiduciary_assignment_receivables", "share_pledge", "reserve_account"], requiredProviders: ["coordenador", "agente fiduciário", "escriturador", "banco liquidante", "B3", "documentos do projeto ao ministério antes do pedido à CVM"], legalBasis: ["Lei 14.801/2024", "Decreto 11.964/2024"], iofTreatment: "debenture", referenceWeeks: {min: 10, max: 16}},
  {id: "commercial_note", name: "Nota comercial", legacyInstrumentId: null, assetBackings: ["corporate_assets"], obligationInstruments: ["commercial_note"], distributedSecurities: ["commercial_note"], structureMechanisms: ["public_offering"], capitalVehicles: ["credit_fund"], capitalProviderTypes: ["asset_manager", "credit_fund_manager"], distributionRoutes: ["private_distribution"], securityEnhancements: ["none", "fiduciary_assignment_receivables", "corporate_guarantee"], requiredProviders: ["escriturador autorizado pela CVM", "B3", "agente fiduciário quando a CVM exigir"], legalBasis: ["Lei 14.195/2021, arts. 45 a 51", "Resolução CVM 160/2022"], iofTreatment: "commercial_note", referenceWeeks: {min: 4, max: 8}},
  {id: "cri", name: "CRI", legacyInstrumentId: "cri", assetBackings: ["real_estate", "receivables"], obligationInstruments: ["debenture", "ccb", "commercial_note", "other"], distributedSecurities: ["cri"], structureMechanisms: ["securitization"], capitalVehicles: ["securitization_company"], capitalProviderTypes: ["securitization_company", "asset_manager", "institutional_investor"], distributionRoutes: ["private_distribution", "public_distribution"], securityEnhancements: ["fiduciary_lien_real_estate", "fiduciary_assignment_receivables", "reserve_account"], requiredProviders: ["securitizadora", "agente fiduciário", "registradora", "escriturador", "B3"], legalBasis: ["Lei 14.430/2022", "Resolução CVM 60/2021", "Resolução CMN 5.118/2024 e alterações"], iofTreatment: "cri", referenceWeeks: {min: 8, max: 12}},
  {id: "cra", name: "CRA", legacyInstrumentId: "cra", assetBackings: ["receivables", "corporate_assets"], obligationInstruments: ["cpr", "cdca", "debenture", "commercial_note", "other"], distributedSecurities: ["cra"], structureMechanisms: ["securitization"], capitalVehicles: ["securitization_company"], capitalProviderTypes: ["securitization_company", "asset_manager", "institutional_investor"], distributionRoutes: ["private_distribution", "public_distribution"], securityEnhancements: ["fiduciary_assignment_receivables", "reserve_account"], requiredProviders: ["securitizadora", "agente fiduciário", "registradora", "escriturador", "B3"], legalBasis: ["Lei 14.430/2022", "Lei 11.076/2004", "Resolução CMN 5.118/2024 e alterações"], iofTreatment: "cra", referenceWeeks: {min: 8, max: 12}},
  {id: "fidc", name: "FIDC", legacyInstrumentId: "fidc", assetBackings: ["receivables"], obligationInstruments: ["receivables_assignment"], distributedSecurities: ["fidc_senior_quota", "fidc_subordinated_quota"], structureMechanisms: ["receivables_purchase"], capitalVehicles: ["fidc"], capitalProviderTypes: ["fidc_manager", "asset_manager", "institutional_investor"], distributionRoutes: ["private_distribution", "public_distribution"], securityEnhancements: ["subordination", "overcollateralization"], requiredProviders: ["administrador", "gestor", "registradora ou custodiante", "auditor", "agência de rating para cota sênior ao público em geral"], legalBasis: ["Resolução CVM 175/2022, Anexo Normativo II", "Resolução CVM 240/2026"], iofTreatment: "fidc_assignment", referenceWeeks: {min: 9, max: 17}},
  {id: "fidc_existing_assignment", name: "Cessão a FIDC existente", legacyInstrumentId: null, assetBackings: ["receivables"], obligationInstruments: ["receivables_assignment"], distributedSecurities: ["none"], structureMechanisms: ["receivables_purchase"], capitalVehicles: ["fidc"], capitalProviderTypes: ["fidc_manager"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["other", "none"], requiredProviders: ["gestor do fundo", "custodiante do fundo", "registradora dos recebíveis", "conta vinculada ou domicílio do fundo"], legalBasis: ["Resolução CVM 175/2022, Anexo Normativo II", "regulamento do fundo"], iofTreatment: "fidc_assignment", referenceWeeks: {min: 1, max: 9}},
  {id: "cpr_financial", name: "CPR financeira", legacyInstrumentId: null, assetBackings: ["other"], obligationInstruments: ["cpr"], distributedSecurities: ["none"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["bank_balance_sheet", "credit_fund", "securitization_company"], capitalProviderTypes: ["bank", "asset_manager", "securitization_company"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["other", "personal_guarantee"], requiredProviders: ["registradora"], legalBasis: ["Lei 8.929/1994, arts. 2º e 12"], iofTreatment: "cpr_rural_producer", referenceWeeks: {min: 1, max: 4}},
  {id: "cdca", name: "CDCA", legacyInstrumentId: null, assetBackings: ["receivables"], obligationInstruments: ["cdca"], distributedSecurities: ["none"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["bank_balance_sheet", "credit_fund", "securitization_company"], capitalProviderTypes: ["bank", "asset_manager", "securitization_company"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["fiduciary_assignment_receivables"], requiredProviders: ["registradora"], legalBasis: ["Lei 11.076/2004, arts. 24 e 25"], iofTreatment: "cra", referenceWeeks: {min: 4, max: 8}},
  {id: "finame", name: "FINAME", legacyInstrumentId: "finame", assetBackings: ["equipment"], obligationInstruments: ["finame_on_lending"], distributedSecurities: ["none"], structureMechanisms: ["asset_finance"], capitalVehicles: ["development_bank_program", "bank_balance_sheet"], capitalProviderTypes: ["development_bank", "bank"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["fiduciary_lien_equipment"], requiredProviders: ["agente financeiro credenciado pelo BNDES"], legalBasis: ["BNDES FINAME"], iofTreatment: "finame", referenceWeeks: {min: 4, max: 12}},
  {id: "bndes_non_finame", name: "BNDES fora da FINAME", legacyInstrumentId: null, assetBackings: ["corporate_assets"], obligationInstruments: ["direct_loan"], distributedSecurities: ["none"], structureMechanisms: ["bilateral_loan", "project_finance"], capitalVehicles: ["development_bank_program"], capitalProviderTypes: ["development_bank", "bank"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["fiduciary_lien_real_estate", "fiduciary_lien_equipment", "corporate_guarantee", "other"], requiredProviders: ["BNDES ou agente financeiro"], legalBasis: ["Lei 13.483/2017 (TLP)"], iofTreatment: "bndes_own_resources", referenceWeeks: {min: 16, max: 40}},
  {id: "leasing", name: "Arrendamento mercantil e sale-leaseback", legacyInstrumentId: "leasing", assetBackings: ["equipment", "real_estate"], obligationInstruments: ["leasing"], distributedSecurities: ["none"], structureMechanisms: ["asset_finance"], capitalVehicles: ["bank_balance_sheet"], capitalProviderTypes: ["bank"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["none"], requiredProviders: ["sociedade de arrendamento mercantil ou banco múltiplo com carteira de arrendamento"], legalBasis: ["Lei 6.099/1974", "Resolução CMN 4.977/2021"], iofTreatment: "leasing", referenceWeeks: {min: 2, max: 6}},
  {id: "external_loan", name: "Empréstimo externo", legacyInstrumentId: null, assetBackings: ["corporate_assets"], obligationInstruments: ["direct_loan"], distributedSecurities: ["none"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["bank_balance_sheet", "other"], capitalProviderTypes: ["bank", "other"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["corporate_guarantee", "none"], requiredProviders: ["banco de câmbio", "contraparte de swap quando houver hedge"], legalBasis: ["Lei 14.286/2021", "Resolução BCB 278/2022", "Resolução BCB 575/2026, a partir de 01/10/2026"], iofTreatment: "external_loan", referenceWeeks: {min: 3, max: 8}},
  {id: "supplier_finance", name: "Risco sacado", legacyInstrumentId: null, assetBackings: ["corporate_assets"], obligationInstruments: ["other"], distributedSecurities: ["none"], structureMechanisms: ["other"], capitalVehicles: ["bank_balance_sheet"], capitalProviderTypes: ["bank"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["none"], requiredProviders: ["banco"], legalBasis: ["ADC 96 (IOF)"], iofTreatment: "supplier_finance", referenceWeeks: {min: 2, max: 6}},
  {id: "venture_debt", name: "Venture debt", legacyInstrumentId: "venture_debt", assetBackings: ["unsecured", "receivables"], obligationInstruments: ["ccb", "debenture"], distributedSecurities: ["none"], structureMechanisms: ["venture_debt"], capitalVehicles: ["credit_fund"], capitalProviderTypes: ["credit_fund_manager"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["fiduciary_assignment_receivables", "share_pledge", "none"], requiredProviders: ["fundo de crédito", "banco emitente quando CCB"], legalBasis: ["Lei 6.404/1976, art. 75 (bônus de subscrição)", "Lei 10.931/2004"], iofTreatment: "ccb", referenceWeeks: {min: 4, max: 8}},
  {id: "convertible_loan", name: "Mútuo conversível", legacyInstrumentId: null, assetBackings: ["unsecured"], obligationInstruments: ["convertible_loan"], distributedSecurities: ["none"], structureMechanisms: ["other"], capitalVehicles: ["other"], capitalProviderTypes: ["other"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["none"], requiredProviders: [], legalBasis: ["Código Civil, arts. 586 a 592"], iofTreatment: "intercompany_loan", referenceWeeks: {min: 2, max: 4}},
  {id: "shareholder_loan", name: "Mútuo de sócio ou de sociedade do grupo", legacyInstrumentId: null, assetBackings: ["unsecured"], obligationInstruments: ["direct_loan"], distributedSecurities: ["none"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["other"], capitalProviderTypes: ["other"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["subordination", "none"], requiredProviders: [], legalBasis: ["Decreto 6.306/2007, art. 2º, I, c"], iofTreatment: "intercompany_loan", referenceWeeks: {min: 1, max: 2}},
  {id: "bridge_takeout", name: "Ponte com take-out", legacyInstrumentId: "ccb", assetBackings: ["corporate_assets"], obligationInstruments: ["ccb"], distributedSecurities: ["none"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["bank_balance_sheet", "credit_fund"], capitalProviderTypes: ["bank", "credit_fund_manager"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["fiduciary_assignment_receivables", "fiduciary_lien_real_estate", "corporate_guarantee"], requiredProviders: ["banco ou fundo", "take-out nomeado (OP-10)"], legalBasis: ["Lei 10.931/2004"], iofTreatment: "ccb", referenceWeeks: {min: 2, max: 6}},
  {id: "project_finance_spe", name: "Project finance em SPE", legacyInstrumentId: null, assetBackings: ["receivables", "shares", "cash_reserve"], obligationInstruments: ["debenture", "direct_loan"], distributedSecurities: ["debenture", "none"], structureMechanisms: ["project_finance"], capitalVehicles: ["development_bank_program", "credit_fund", "insurance_balance_sheet"], capitalProviderTypes: ["development_bank", "institutional_investor", "asset_manager"], distributionRoutes: ["public_distribution", "private_distribution", "bilateral_private"], securityEnhancements: ["fiduciary_assignment_receivables", "share_pledge", "reserve_account"], requiredProviders: ["agente fiduciário", "agente de garantia", "banco das contas centralizadora e reserva", "anuência do poder concedente em concessão"], legalBasis: ["Lei 8.987/1995, arts. 27-A, 28 e 28-A", "Leis 12.431/2011 e 14.801/2024"], iofTreatment: "debenture", referenceWeeks: {min: 24, max: 52}},
];

const routeCatalogue: ReferenceDataProposal = {
  version,
  asOf,
  documentation: card("policy.structure.route-catalogue"),
  unit: "catálogo de rotas; dimensões pela taxonomia de originação (@offroad/credit-ontology); prazos em semanas",
  source: {
    title: "Lei 6.404/1976, Lei 10.931/2004, Lei 14.195/2021, Lei 14.430/2022, Resoluções CVM 160, 175 e 232 e Resolução CMN 5.118/2024, com a taxonomia de originação do produto",
    url: "https://conteudo.cvm.gov.br/legislacao/resolucoes/resol160.html",
    observedBy,
  },
  value: {
    schemaVersion: "route-catalogue.v1",
    taxonomy: "@offroad/credit-ontology originationTaxonomyVersion 2026.08.24-v2",
    dimensions: ["assetBackings", "obligationInstruments", "distributedSecurities", "structureMechanisms", "capitalVehicles", "capitalProviderTypes", "distributionRoutes", "securityEnhancements"],
    comparisonDimensions: {asset: "assetBackings", obligationDocument: "obligationInstruments", mechanism: "structureMechanisms", vehicleOrInvestor: ["capitalVehicles", "capitalProviderTypes"], providers: "requiredProviders"},
    referenceWeeksMeaning: "do mandato ao recurso, referência da casa a confirmar por caso; nunca compromisso",
    referenceWeeksEvidence: [
      {routeIds: ["debenture_professional"], reading: "biblioteca de expertise da casa: 6 a 10 semanas"},
      {routeIds: ["cri", "cra"], reading: "biblioteca de expertise da casa: 8 a 12 semanas"},
      {routeIds: ["fidc"], reading: "biblioteca de expertise da casa: 60 a 120 dias para montar, convertidos para a semana inteira mais próxima"},
      {routeIds: ["fidc_existing_assignment"], reading: "docs/knowledge/recebiveis/01-QUEM-COMPRA.md: de 7 dias úteis a 60 dias corridos até a primeira liquidação de um cedente novo, conforme a complexidade, convertidos para a semana inteira mais próxima"},
    ],
    routes,
    applicationRules: {
      fiveDimensions: "ativo, documento, mecanismo, veículo ou investidor e prestadores preenchidos antes de comparar",
      eligibilityFirst: "market.instrument.eligibility antes de preço; rota fechada sai com o motivo e o que a abriria",
      es44Output: ["ativo", "documento", "mecanismo", "veículo ou investidor", "prestadores", "exigências", "cronograma", "all-in", "fontes legais"],
      allInKeys: ["policy.capital.iof", "policy.capital.anbima-b3-conventions", "policy.capital.tax-regime", "policy.pricing.cost-catalogue"],
      es41Keys: ["policy.structure.minimum-sellable", "policy.structure.mandate-ticket"],
      timelineBeyondNeed: "ponte com take-out (OP-10) ou volta a ES-40",
    },
    legacyCorrections: [
      {status: "pendente", item: "rito automático é oferta pública (Resolução CVM 160, art. 26); o mapeamento legado o chama de colocação privada"},
      {status: "aplicada em 24/09/2026", item: "o catálogo de instrumentos do código deixou de citar os limites de 75 investidores e 50 subscritores da revogada Instrução CVM 476; debenture_476 ficou como chave legada da debênture para investidor profissional pelo rito automático"},
      {status: "aplicada em 24/09/2026", item: "o catálogo de instrumentos do código aplica alíquota zero de IOF à operação com recursos da FINAME (Decreto 6.306, art. 8º, IX), com a fonte identificada no contrato do agente"},
    ],
    review: {routine: "semestral, com os prazos de referência comparados aos casos da casa", proposedValidityMonths: 6, invalidatedBy: ["norma da CVM sobre ofertas, securitização, FIDC ou agente fiduciário", "resolução do CMN sobre lastro de certificados", "regra do Banco Central sobre crédito externo", "lei sobre CCB, nota comercial, CPR, CDCA ou debêntures incentivadas", "mudança de produto do BNDES"]},
  },
};

const allCompanies = ["sa_aberta", "sa_fechada", "ltda", "cooperativa", "outra_pj"];

const instrumentEligibility: ReferenceDataProposal = {
  version,
  asOf,
  documentation: card("market.instrument.eligibility"),
  unit: "condições por instrumento; tetos em reais, em meses ou por fórmula nomeada; percentuais em fração decimal",
  source: {
    title: "Lei 6.404/1976, Lei 10.931/2004, Lei 14.195/2021, Leis 12.431/2011 e 14.801/2024, Decreto 11.964/2024, Lei 14.430/2022, Resolução CMN 5.118/2024 (redação da Resolução 5.212/2025), Resoluções CVM 160, 175 e 232, Lei 8.929/1994, Lei 11.076/2004, Resolução CMN 4.977/2021 e Resolução BCB 278/2022",
    url: "https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20CMN&numero=5118",
    observedBy,
  },
  value: {
    schemaVersion: "instrument-eligibility.v1",
    legalForms: ["sa_aberta", "sa_fechada", "ltda", "cooperativa", "outra_pj", "pessoa_natural"],
    legacyLegalFormMap: {sa: ["sa_aberta", "sa_fechada"], ltda: ["ltda"], other: ["cooperativa", "outra_pj"]},
    evaluationOrder: ["forma societária e setor", "lastro e projeto", "investidor e rito", "registro"],
    instruments: [
      {id: "ccb", legacyInstrumentId: "ccb", routeIds: ["ccb_bank", "ccb_credit_fund", "bridge_takeout", "venture_debt"], issuers: [...allCompanies, "pessoa_natural"], conditions: ["credor instituição financeira ou equiparada; estrangeira admitida com lei e foro brasileiros"], ceiling: {type: "none"}, termConstraints: ["título executivo", "garantia real registrada para valer contra terceiros"], basis: "Lei 10.931/2004, arts. 26, 28, 29 e 42"},
      {id: "debenture", legacyInstrumentId: "debenture_476", routeIds: ["debenture_professional", "debenture_public", "debenture_private_placement"], issuers: ["sa_aberta", "sa_fechada"], conditions: ["aprovação conforme policy.structure.corporate-authority", "emissor sem registro na CVM: rito automático só para investidor profissional (Resolução CVM 160, arts. 25, § 2º, e 26, X)", "investidor qualificado ou público em geral: emissor registrado na CVM (arts. 26, V, e 28)"], ceiling: {type: "none", basis: "Lei 6.404, art. 60, revogado"}, termConstraints: ["agente fiduciário quando distribuída ou negociada (Lei 6.404, art. 61, § 1º)", "mudança de condições com no mínimo metade das debêntures em circulação (art. 71, § 5º)", "não declaração de vencimento com maioria absoluta das debêntures em circulação (Resolução CVM 17, art. 12, § 2º)", "emissor não registrado: revenda só a investidor profissional e negociação em balcão (Resolução CVM 160, arts. 86, V, e 88)"], basis: "Lei 6.404/1976, arts. 52 a 74"},
      {id: "debenture_facil", legacyInstrumentId: "debenture_476", routeIds: ["debenture_professional"], issuers: ["sa_aberta", "sa_fechada"], conditions: ["receita bruta abaixo do limite", "dívida não conversível só para investidor profissional, sem coordenador", "securitização fora do regime"], grossRevenueBelowBRL: "500000000", ceiling: {type: "issuance_window", amountBRL: "300000000", windowMonths: 12}, termConstraints: ["os da debênture"], basis: "Resolução CVM 232/2025, em vigor desde 16/03/2026"},
      {id: "debenture_incentivized", legacyInstrumentId: "debenture_476", routeIds: ["debenture_incentivized", "project_finance_spe"], issuers: ["sa_aberta", "sa_fechada"], issuerRoles: ["sociedade de propósito específico", "concessionária, permissionária, autorizatária ou arrendatária", "controladora sociedade anônima dessas"], conditions: ["projeto prioritário pelo Decreto 11.964/2024, sem aprovação ministerial prévia nos setores listados", "documentos do projeto ao ministério antes do pedido de registro à CVM (Decreto 11.964, art. 8º)", "emissão até 31/12/2030"], ceiling: {type: "project_capex", reimbursementLookbackMonths: 48, reimbursementLookbackMonthsFrom2027: 60, lookbackChangeMonth: "2027-02", basis: "Decreto 11.964, art. 5º, § 2º; Lei 12.431, art. 1º, § 1º-C; Lei 14.801, arts. 13 e 14"}, termConstraints: ["remuneração prefixada, por índice de preços ou TR; vedada parcela pós-fixada", "prazo médio ponderado acima de 4 anos", "cupom com intervalo mínimo de 180 dias", "sem recompra pelo emissor ou parte relacionada nos 2 primeiros anos e sem liquidação antecipada por resgate ou pré-pagamento, salvo na forma regulamentada pelo Conselho Monetário Nacional (Lei 12.431, art. 1º, § 1º, II)", "rito automático só para investidor qualificado; revenda só a qualificado (Resolução CVM 160, arts. 26, IX, e 86, IV)", "multa de 20% sobre recurso não alocado ao projeto"], basis: "Lei 12.431/2011, arts. 1º e 2º"},
      {id: "debenture_infrastructure", legacyInstrumentId: "debenture_476", routeIds: ["debenture_infrastructure", "project_finance_spe"], issuers: ["sa_aberta", "sa_fechada"], issuerRoles: ["os da debênture incentivada", "emissor de projeto de minerais críticos e estratégicos com receita anual até o limite"], mineralsIssuerMaxRevenueBRL: "5000000000", conditions: ["projeto prioritário e documentos ao ministério como na incentivada", "parte relacionada não compra"], ceiling: {type: "project_capex", basis: "Decreto 11.964, art. 5º, § 2º"}, termConstraints: ["os da debênture incentivada", "cláusula cambial admitida (Decreto 11.964, art. 12)", "benefício não se acumula com o da Lei 12.431 (art. 20)"], basis: "Lei 14.801/2024; Lei 15.506/2026"},
      {id: "commercial_note", legacyInstrumentId: null, routeIds: ["commercial_note"], issuers: ["sa_aberta", "sa_fechada", "ltda", "cooperativa"], conditions: ["escrituração por instituição autorizada pela CVM", "aprovação pelos órgãos de administração ou pelo administrador"], ceiling: {type: "none"}, termConstraints: ["mudança de condições por maioria simples das notas em circulação presentes na assembleia, salvo quórum maior no termo (Lei 14.195, art. 47, § 2º)", "agente fiduciário quando a CVM exigir (art. 50); com ele, modificação de condições e não declaração do vencimento pelo piso da Resolução CVM 17, art. 12, § 2º", "oferta privada pode prever conversão em participação, exceto sociedade anônima (art. 51, § 2º)"], basis: "Lei 14.195/2021, arts. 45 a 51"},
      {id: "cri", legacyInstrumentId: "cri", routeIds: ["cri"], issuers: ["securitizadora"], debtorConditions: {debtSecurityDebtorPrincipalSector: "imobiliário", principalSectorRevenueShare: {numerator: 2, denominator: 3}, base: "receita consolidada", comparator: "acima de", excluded: ["instituição financeira, seu conglomerado prudencial e controladas", "operação entre partes relacionadas", "estrutura em que pessoa excluída retém riscos e benefícios"], notDebtSecurities: ["contrato de locação", "compra e venda e promessa de venda de imóvel", "duplicata", "usufruto"]}, conditions: ["lastro identificado e adquirido até a integralização", "regime fiduciário obrigatório na oferta ao público em geral (Resolução CVM 60, Anexo I, art. 4º)"], ceiling: {type: "eligible_backing", basis: "Lei 14.430/2022, art. 22, § 3º"}, grandfathering: "emissões distribuídas ou protocoladas na CVM antes de cada mudança da Resolução CMN 5.118", basis: "Lei 14.430/2022; Resolução CMN 5.118/2024, art. 3º, na redação das Resoluções 5.121/2024, 5.163/2024 e 5.212/2025"},
      {id: "cra_cdca", legacyInstrumentId: "cra", routeIds: ["cra", "cdca"], issuers: ["securitizadora (CRA)", "cooperativa agropecuária ou pessoa jurídica que comercializa, beneficia ou industrializa produto, insumo, máquina ou implemento agropecuário (CDCA)"], debtorConditions: {debtSecurityDebtorPrincipalSector: "agronegócio", principalSectorRevenueShare: {numerator: 2, denominator: 3}, base: "receita consolidada", comparator: "acima de", excluded: ["instituição financeira, seu conglomerado prudencial e controladas", "operação entre partes relacionadas"]}, conditions: ["recebíveis do CDCA registrados ou depositados (Lei 11.076, art. 25, § 1º, I)"], termConstraints: ["os do CRI: regime fiduciário obrigatório para oferta ao público em geral"], grandfathering: "emissões distribuídas ou protocoladas na CVM antes de cada mudança da Resolução CMN 5.118", ceiling: {type: "eligible_backing"}, basis: "Lei 11.076/2004, arts. 24 e 25; Resolução CMN 5.118/2024 na redação vigente"},
      {id: "fidc", legacyInstrumentId: "fidc", routeIds: ["fidc", "fidc_existing_assignment"], issuers: [...allCompanies, "pessoa_natural"], conditions: ["direitos creditórios registrados em registradora autorizada pelo Banco Central ou custodiados (Anexo II, arts. 30, I, e 37)", "até 20% do patrimônio por devedor ou grupo, ampliável em classe de investidor qualificado nas hipóteses do art. 45, § 3º", "público em geral: cota sênior com rating, cronograma de amortização e nenhuma cota subordinada ao público (art. 13)", "recebível não padronizado só para investidor profissional (art. 15)", "recebível de cedente em recuperação judicial ou extrajudicial segue padronizado (Resolução CVM 240/2026)"], perDebtorLimit: "0.20", receivablesShareOfNetAssetsAbove: "0.50", receivablesShareDeadlineDaysFromStartOfActivities: 180, receivablesShareBasis: "Resolução CVM 175/2022, Anexo Normativo II, art. 44", ceiling: {type: "eligible_pool_after_subordination", formula: "cotas_senior_e_mezanino <= carteira_elegivel * (1 - subordinacao_exigida)", haircutKey: "policy.structure.collateral_haircuts"}, basis: "Resolução CVM 175/2022, Anexo Normativo II"},
      {id: "cpr", legacyInstrumentId: null, routeIds: ["cpr_financial"], issuers: ["produtor rural pessoa natural ou jurídica", "cooperativa agropecuária", "associação de produtores", "quem beneficia ou industrializa o produto rural"], conditions: ["registro em registradora em até 30 dias úteis, qualquer valor, para CPR emitida desde 01/01/2024"], registrationBusinessDays: 30, ceiling: {type: "committed_product_value"}, termConstraints: ["CPR de quem beneficia ou industrializa sofre IOF e perde isenções (Lei 8.929, art. 2º, § 2º)"], basis: "Lei 8.929/1994, arts. 2º e 12"},
      {id: "finame", legacyInstrumentId: "finame", routeIds: ["finame"], issuers: [...allCompanies, "ente público"], conditions: ["máquina ou equipamento novo, nacional e credenciado no BNDES", "agente financeiro credenciado", "FINAME Direto para receita anual acima do limite"], finameDirectMinimumRevenueBRL: "80000000", finameDirectRevenueComparator: "at_least", finameDirectRevenueBasis: "receita operacional bruta do último exercício, individual ou do grupo econômico (roteiro de habilitação do BNDES)", ceiling: {type: "asset_value_times_line_share"}, termConstraints: ["alienação fiduciária do bem conforme o agente"], basis: "BNDES FINAME"},
      {id: "leasing", legacyInstrumentId: "leasing", routeIds: ["leasing"], issuers: [...allCompanies, "pessoa_natural"], conditions: ["arrendadora: sociedade de arrendamento mercantil ou banco múltiplo com carteira (Resolução CMN 4.977, art. 1º, § 1º)", "parte relacionada e fabricante fora do tratamento tributário (Lei 6.099, art. 2º)"], ceiling: {type: "asset_value"}, minimumTerm: {financialUsefulLifeUpTo5YearsYears: 2, financialUsefulLifeAbove5YearsYears: 3, operatingDays: 90}, termConstraints: ["opção de compra antes do prazo mínimo converte a operação em compra e venda a prazo", "sale-leaseback só financeiro e para pessoa jurídica (art. 11)"], basis: "Lei 6.099/1974; Resolução CMN 4.977/2021"},
      {id: "external_loan", legacyInstrumentId: null, routeIds: ["external_loan"], issuers: allCompanies, conditions: ["declaração no SCE-Crédito pelo devedor até o ingresso dos recursos (Resolução BCB 278/2022, arts. 17, 23 e 28)", "regra nova em vigor a partir de 01/10/2026 (Resolução BCB 575/2026)"], reportingThresholdUSD: "1000000", ceiling: {type: "none", note: "subcapitalização com parte relacionada limita a dedução (policy.capital.tax-regime)"}, termConstraints: ["retenção e gross-up conforme policy.capital.tax-regime", "IOF de câmbio conforme o prazo médio (policy.capital.iof)"], basis: "Lei 14.286/2021; Resolução BCB 278/2022"},
      {id: "export_credit", legacyInstrumentId: "nce", routeIds: ["export_credit_note", "export_fx_advance"], issuers: allCompanies, conditions: ["vínculo comprovado com exportação", "ACC e ACE com contrato de câmbio"], ceiling: {type: "export_linked"}, termConstraints: ["comprovação de embarque ou exportação"], basis: "Lei 6.313/1975; Decreto 6.306/2007, arts. 8º, XVII, e 9º, IV"},
      {id: "venture_debt", legacyInstrumentId: "venture_debt", routeIds: ["venture_debt"], issuers: ["sa_aberta", "sa_fechada", "ltda"], conditions: ["investidor institucional de capital e rodada recente (critério da casa)", "bônus de subscrição só em sociedade anônima, dentro do capital autorizado (Lei 6.404, art. 75)"], ceiling: {type: "runway_to_next_milestone"}, termConstraints: ["warrants ou conversão com valor e diluição registrados"], basis: "Lei 10.931/2004; Lei 6.404/1976, art. 75"},
      {id: "supplier_finance", legacyInstrumentId: null, routeIds: ["supplier_finance"], issuers: allCompanies, conditions: ["convênio bancário com contrato do programa e confirmação operacional"], ceiling: {type: "program_limit"}, termConstraints: ["classificação pela essência nas definições de dívida (D-06 e D-24)"], basis: "contrato do programa"},
    ],
    applicationRules: {
      firstClosingFilter: "encerra a avaliação com o motivo e o que abriria a porta",
      es03: "o teto do instrumento entra no envelope e pode ser o limitante declarado",
      es42: "forma, aprovação, registro na CVM quando o rito exigir, lastro, projeto e registro ficam verdes antes do term sheet; dependência de terceiro vira condição precedente",
      es43: "termo obrigatório entra com a base; termo proibido bloqueia",
      verdict: "aberto, fechado ou condicionado, sempre com o motivo",
      ltdaSeekingDebenture: "alternativas: nota comercial ou CCB",
    },
    review: {routine: "trimestral", proposedValidityDays: 90, invalidatedBy: ["resolução do CMN sobre lastro de CRI, CRA, CDCA, LCI ou LCA", "norma da CVM sobre ofertas, FIDC ou securitização", "alteração das Leis 12.431, 14.801, 14.195, 8.929 ou 11.076 ou do Decreto 11.964", "lei que autorize debênture de sociedade limitada", "regra do Banco Central sobre crédito externo", "mudança do produto FINAME"]},
  },
};

const backgroundSources: ReferenceDataProposal = {
  version,
  asOf,
  documentation: card("policy.privacy.permitted-background-sources"),
  unit: "política; percentuais em fração decimal; prazos em dias úteis, dias corridos ou anos, conforme o campo",
  source: {
    title: "Lei 13.709/2018 (LGPD), arts. 6º, 7º, IX e X, 10, 11, 18 a 20, 37, 38 e 46, com as fontes públicas oficiais de registro, sanção e processo",
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm",
    observedBy,
  },
  value: {
    schemaVersion: "background-sources.v1",
    purpose: "avaliar risco de crédito, de integridade e de continuidade da companhia analisada e das pessoas com papel material no crédito, no trabalho contratado pela própria companhia",
    subjects: {
      included: [
        {id: "company", description: "companhia e controladas relevantes", personalData: false},
        {id: "controllers", description: "controladores diretos e indiretos (Lei 6.404, art. 116) e sócios com participação igual ou superior ao corte", personalData: true},
        {id: "officers", description: "administradores estatutários e diretores com alçada financeira", personalData: true},
        {id: "guarantors", description: "garantidores pessoas naturais propostos na operação", personalData: true},
        {id: "key_person", description: "pessoa-chave de EMP-13, somente dados profissionais", personalData: true},
      ],
      shareholderThreshold: "0.10",
      excluded: ["familiares sem papel societário ou de garantia", "empregados sem alçada", "clientes e fornecedores pessoas naturais"],
    },
    legalBases: [
      {basis: "legitimate_interest", article: "LGPD, art. 7º, IX, e art. 10", condition: "teste em três fases do guia da ANPD (finalidade, necessidade, balanceamento e salvaguardas) registrado no modelo de caso; dados estritamente necessários (art. 10, § 1º); transparência pela carta de contratação; não cobre dado sensível"},
      {basis: "credit_protection", article: "LGPD, art. 7º, X", condition: "relatório de crédito que o próprio garantidor obtém e entrega"},
      {basis: "regular_exercise_of_rights", article: "LGPD, art. 7º, VI", condition: "conservação da evidência da diligência"},
      {basis: "public_data_purpose", article: "LGPD, art. 7º, § 3º", condition: "dado público usado na finalidade que justificou a publicação"},
    ],
    transparency: "a carta de contratação informa que controladores, administradores e garantidores serão pesquisados nas fontes permitidas, e a companhia se obriga a transmitir o aviso",
    permittedSources: [
      {id: "rfb_cnpj_qsa", name: "Receita Federal, CNPJ e quadro de sócios e administradores", subjects: ["company", "controllers", "officers"], access: "consulta pública ou dados abertos"},
      {id: "commercial_registry", name: "Juntas comerciais", subjects: ["company", "controllers", "officers"], access: "registro público de consulta livre", basis: "Lei 8.934/1994, art. 29"},
      {id: "cvm_bcb", name: "CVM e Banco Central: formulário de referência, fatos relevantes, processos sancionadores julgados, inabilitações", subjects: ["company", "controllers", "officers"], access: "publicação oficial"},
      {id: "court_records", name: "Tribunais, consulta processual pública", subjects: ["company", "controllers", "officers", "guarantors"], access: "somente processos públicos; segredo de justiça excluído; Justiça do Trabalho só por número e advogado; processo criminal encerrado por absolvição ou extinção só por número", basis: "CNJ, Resolução 121/2010"},
      {id: "sanctions_registers", name: "Portal da Transparência (CEIS e CNEP), TCU (inidôneos), CNJ (improbidade)", subjects: ["company", "controllers", "officers"], access: "consulta oficial", basis: "Lei 12.846/2013, arts. 22 e 23; Lei 8.443/1992, art. 46"},
      {id: "forced_labour_register", name: "Cadastro de empregadores do trabalho análogo ao de escravo", subjects: ["company"], access: "publicação oficial; inclusão após decisão administrativa irrecorrível, por dois anos", basis: "Portaria Interministerial MTE/MDHC/MIR 18/2024"},
      {id: "un_sanctions", name: "Sanções do Conselho de Segurança da ONU", subjects: ["company", "controllers", "officers", "guarantors"], access: "listas vigentes", basis: "Lei 13.810/2019"},
      {id: "protest_registry", name: "Protesto", subjects: ["company", "guarantors"], access: "consulta nacional gratuita e certidão a qualquer interessado; protestos não cancelados dos últimos cinco anos", basis: "Lei 9.492/1997, arts. 27, 31 e 41-A"},
      {id: "official_gazettes", name: "Diários oficiais", subjects: ["company", "controllers", "officers", "guarantors"], access: "publicação oficial"},
      {id: "identified_press", name: "Imprensa profissional identificada", subjects: ["company", "controllers", "officers"], access: "veículo e data registrados; sem confirmação em fonte primária não sustenta conclusão"},
      {id: "credit_bureau", name: "Birô de crédito contratado", subjects: ["company"], access: "relação contratual da Offroad com a companhia", basis: "Lei 12.414/2011, art. 15", naturalPersons: "somente o relatório que a própria pessoa obtém e entrega"},
      {id: "scr_company_report", name: "SCR, relatório da própria companhia no Registrato do Banco Central", subjects: ["company"], access: "fornecido pela companhia ou por autorização no Registrato; sem consulta direta pela Offroad", basis: "Resolução CMN 5.037/2022, arts. 4º, 9º e 12"},
      {id: "company_documents", name: "Documentos entregues pela companhia", subjects: ["company", "controllers", "officers", "guarantors"], access: "direito de uso do caso"},
    ],
    prohibited: {
      data: ["dado pessoal sensível (LGPD, art. 5º, II)", "idade ou saúde como indicador de continuidade", "processo criminal fora da consulta pública ou sem relação com a atividade empresarial"],
      sources: ["perfis pessoais em redes sociais", "bases vazadas ou de origem não comprovada", "área logada sem autorização ou credencial de terceiro"],
      methods: ["pretexto ou identidade falsa", "contato com clientes, ex-empregados, bancos ou terceiros sem autorização da companhia", "decisão automática com base em achado de antecedentes (LGPD, art. 20)"],
    },
    identity: {requiredMatch: "CPF ou CNPJ coincidente", additionalIdentifiers: 1, additionalIdentifierOptions: ["nome completo com data de nascimento", "vínculo societário", "endereço"], withoutTaxId: "possível homônimo; não sustenta conclusão"},
    materialFindings: [
      {id: "sanctions", rule: "sanção vigente em CEIS, CNEP, TCU, cadastro de trabalho análogo ao de escravo ou lista do CSNU"},
      {id: "economic_crime", rule: "processo ou condenação por crime contra o sistema financeiro, a ordem tributária ou econômica, lavagem, corrupção, fraude, falsidade, trabalho análogo ao de escravo ou crime ambiental grave, ligado à atividade empresarial"},
      {id: "insolvency_history", rule: "falência, recuperação judicial ou extrajudicial de sociedade controlada ou administrada pela pessoa", lookbackYears: 10},
      {id: "regulatory_disqualification", rule: "inabilitação ou sanção da CVM ou do Banco Central"},
      {id: "company_financial_claims", rule: "protesto, execução ou dívida vencida contra a companhia acima do limiar de cross-default", thresholdKey: "policy.structure.cross-default-threshold"},
      {id: "guarantor_financial_claims", rule: "protesto, execução ou dívida vencida contra garantidor pessoa natural acima da fração do patrimônio declarado", shareOfDeclaredNetWorth: "0.10"},
      {id: "shareholder_dispute", rule: "litígio societário entre sócios", houseProcedureId: "RF-10"},
    ],
    aggregateOnly: ["processo trabalhista individual", "ação de consumo", "execução fiscal garantida ou parcelada"],
    contradictory: {companyResponseBusinessDays: 5, rule: "achado material apresentado à companhia antes de qualquer uso; resposta e evidência ficam junto ao achado", graveIntegrity: "RF-19 com decisão humana registrada"},
    access: {who: "equipe do caso e revisor designado, dentro da organização do cliente", telemetry: false, crossCaseUse: false, marketIntelligence: false, disclosureToFinancier: "somente após contraditório e autorização de divulgação da companhia"},
    retention: {diligenceRecordYearsAfterClosure: 5, unusedRawResultsDaysAfterClosure: 90, dataSubjectFullResponseDays: 15, dataSubjectArticle: "LGPD, art. 19, II", amlReference: "Lei 9.613/1998, art. 10, § 2º, adotado como política própria"},
    incidentCommunicationBusinessDays: 3,
    incidentBasis: "LGPD, art. 48; Resolução CD/ANPD 15/2024",
    precedence: ["lei e ordem judicial", "esta política", "pedido do usuário"],
    outOfListRequest: "recusado com o motivo e a fonte permitida que atende à mesma pergunta",
    review: {
      routine: "anual, com o relatório de impacto (LGPD, art. 38) e o registro das operações (art. 37)",
      proposedValidityMonths: 12,
      invalidatedBy: [
        "regulamento ou guia da ANPD sobre legítimo interesse, proteção do crédito ou pesquisa de antecedentes",
        "mudança nas regras de acesso público dos tribunais ou do CNJ",
        "mudança de termos de fonte da lista",
        "incidente de segurança",
        "alteração da LGPD",
        "norma do COAF ou de outro supervisor para assessoria em operações financeiras (Lei 9.613/1998, art. 9º, parágrafo único, XIV)",
      ],
    },
  },
};

export const capitalLegalProposals: ReferenceDataProposalFamily = {
  "policy.capital.iof": iof,
  "policy.capital.anbima-b3-conventions": rateConventions,
  "policy.capital.tax-regime": taxRegime,
  "policy.structure.acceleration-events": accelerationEvents,
  "policy.structure.corporate-authority": corporateAuthority,
  "policy.structure.intercreditor": intercreditor,
  "policy.structure.route-catalogue": routeCatalogue,
  "market.instrument.eligibility": instrumentEligibility,
  "policy.privacy.permitted-background-sources": backgroundSources,
};
