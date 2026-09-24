import type {ReferenceDataProposalFamily} from "./types";

/**
 * Pricing and market: pricing observations and curves, sample quality, communication width, regime, premiums, tenor,
 * size and liquidity, indexer basis, costs, mandates and distribution waves.
 *
 * Every value is a draft prepared on 24/09/2026 for the founder's review. Where a field feeds an executor that already
 * exists, it carries the executor's own name: `buildPricingTruthSet` (`@offroad/market-reference`, loaded from
 * `pricing_policies` and `pricing_observations`) and `buildMarketTruthSet` (`@offroad/fund-mandate`, loaded from
 * `market_distribution_policies`). Market figures are statistics the executor computed from public files read on the
 * date stated next to them; no transaction, spread, premium or institution's appetite is invented here.
 */

const VERSION = "2026.09.24-v1";
const AS_OF = "2026-09-24";
const OBSERVED_BY = "Offroad (Claude, executor), 24/09/2026, aguardando revisão do fundador";
const doc = (key: string) => `knowledge/reference-data/pricing-market.md#${key}`;

const PLAYBOOK_URL = "https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md";
const CVM_160_URL = "https://conteudo.cvm.gov.br/legislacao/resolucoes/resol160.html";

/** Internal rating bands of `packages/credit-analysis`, with the ten-grade scale each band covers. */
const RISK_BANDS = {strong: [1, 2], adequate: [3, 4], watch: [5, 6], weak: [7, 8], distressed: [9, 10]};

/** Instrument families over the executor's `PricedInstrument` vocabulary. */
const INSTRUMENT_FAMILIES = {
  bancario: ["ccb", "nce", "leasing"],
  mercado_de_capitais: ["debenture_476", "debenture_160"],
  securitizacao: ["cri", "cra"],
  fundo_de_recebiveis: ["fidc"],
  venture_debt: ["venture_debt"],
  fomento: ["finame"],
};

/**
 * Security families over the case engine's `securityClass` strings: "unsecured", or "secured:" followed by the
 * collateral classes of `packages/deal-structure` sorted and joined by "+".
 */
const SECURITY_FAMILIES = {
  limpa: ["unsecured"],
  cessao_com_trava: ["secured:receivables"],
  real_forte: ["secured:property", "secured:equipment", "secured:vehicles"],
  garantia_liquida: ["secured:guarantee", "secured:financial"],
  outras_reais: ["secured:inventory", "secured:shares", "secured:other"],
  combinada: ["secured:<duas ou mais classes>"],
};

const TENOR_BUCKETS_MONTHS = [[1, 24], [25, 36], [37, 60], [61, 84], [85, 120], [121, 360]];

/** ANBIMA secondary-market statistics computed from the public daily files of 23/09/2026. */
const ANBIMA_LISTED_2026_09_23 = {
  referenceDate: "2026-09-23",
  debenturesFile: "https://www.anbima.com.br/informacoes/merc-sec-debentures/arqs/db260923.txt",
  federalBondsFile: "https://www.anbima.com.br/informacoes/merc-sec/arqs/ms260923.txt",
  diSpreadBps: {count: 559, p25: 59.85, median: 95.55, p75: 153.93},
  diSpreadBpsByDuration: [
    {durationYears: "ate_2", count: 198, p25: 59.82, median: 108.74, p75: 204.85},
    {durationYears: "2_a_4", count: 316, p25: 59.89, median: 82.03, p75: 141.81},
    {durationYears: "acima_de_4", count: 45, p25: 59.85, median: 96.35, p75: 125.0},
  ],
  ipcaSpreadOverReferenceNtnbBps: {count: 626, p25: -9.23, median: 26.97, p75: 85.39},
  ltnIndicativePct: {"2027-04-01": "13.3457", "2028-01-01": "13.5957", "2029-01-01": "13.8688", "2030-01-01": "14.0414", "2032-01-01": "14.1561"},
  ntnbIndicativeRealPct: {"2028-08-15": "7.3971", "2029-05-15": "7.5108", "2030-08-15": "7.7098", "2032-08-15": "7.6800", "2035-05-15": "7.6161"},
};

export const pricingMarketProposals: ReferenceDataProposalFamily = {
  "market.pricing.curves": {
    version: VERSION,
    value: {
      measure: {
        field: "normalizedSpreadBps",
        definition: "spread equivalente sobre 100% do DI, em pontos-base ao ano, composto em base 252 na data da observação",
        components: ["quotedSpreadBps", "feeBps", "oidBps", "warrantBps", "hedgeBps"],
        indexerConversion: "market.pricing.indexer-basis",
        allInComposition: "(1 + DI) × (1 + spread) - 1",
      },
      cellKey: ["riskBand", "instrumentFamily", "tenorBucketMonths", "securityFamily"],
      axes: {
        riskBand: RISK_BANDS,
        instrumentFamily: INSTRUMENT_FAMILIES,
        tenorBucketMonths: TENOR_BUCKETS_MONTHS,
        securityFamily: SECURITY_FAMILIES,
      },
      comparabilityDimensionsOutsideCellKey: ["sectorGroup", "amountRatio", "amortizationClass"],
      neverComparableToMarket: ["finame"],
      cellOutput: ["p25Bps", "medianBps", "p75Bps", "directCount", "adjustableCount", "distinctOrigins", "oldestObservedOn", "latestObservedOn", "confidence", "validUntil", "parameterVersion"],
      sourceHierarchy: [
        {rank: 1, source: "observações governadas de market.pricing.observation-registry com qualidade mínima de policy.pricing.sample-quality", role: "forma_celula"},
        {rank: 2, source: "emissões primárias públicas com remuneração, garantia e prazo documentados (escritura, anúncio de encerramento, dados abertos da CVM)", role: "forma_celula_como_public_closing"},
        {rank: 3, source: "taxas indicativas de debêntures e curvas de crédito por rating da ANBIMA", role: "referencia_secundaria_ajustada_e_contexto", rights: "uso além de consulta exige licença ANBIMA"},
        {rank: 4, source: "estatísticas de crédito do Banco Central por modalidade", role: "contexto"},
        {rank: 5, source: "grade de prática da mesa em packages/market-reference/src/index.ts, declarada em 21/08/2026", role: "teste_de_plausibilidade"},
      ],
      cells: [],
      publishedCellCount: 0,
      validity: {cellValidityDays: 30, invalidateOnReferenceMoveBps: 30},
      refresh: {publicSourceIngestion: "diária, em dia útil", freshnessReport: "primeiro dia útil de cada mês", recomputeOn: ["nova observação elegível", "gatilho de policy.pricing.regime", "movimento de 30 pontos-base na medida de referência"]},
      listedMarketContext: {source: "ANBIMA, taxas indicativas de debêntures de 23/09/2026", ...ANBIMA_LISTED_2026_09_23.diSpreadBps, unit: "pontos-base ao ano sobre o DI", role: "contexto; não forma célula"},
    },
    unit: "pontos-base ao ano sobre o DI (spread equivalente composto, base 252)",
    source: {
      title: "House Playbook Offroad v2.1, PR-01 a PR-07 e PR-13; contexto público: ANBIMA, Mercado Secundário de Debêntures, taxas indicativas de 23/09/2026",
      url: "https://www.anbima.com.br/informacoes/merc-sec-debentures/default.asp",
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("market.pricing.curves"),
  },

  "policy.pricing.sample-quality": {
    version: VERSION,
    value: {
      executorPolicy: {minObservations: 5, minDistinctSources: 5, minQuality: 0.75, maxTenorDeltaMonths: 12, minAmountRatio: "0.5", maxAmountRatio: "2"},
      distinctOrigin: {minimumPerPublishedCell: 5, originIdentity: "operação", sameOperationCountsOnce: true},
      comparability: {
        weights: {security: "0.25", risk: "0.25", instrument: "0.15", tenorDuration: "0.15", sector: "0.10", size: "0.05", amortization: "0.05"},
        directMinScore: "0.80",
        adjustableMinScore: "0.60",
        directRequiresSame: ["riskBand", "securityFamily", "instrumentFamily"],
        neighborhood: {
          securityFamily: {same: "1", realForteVsCessaoComTrava: "0.6", realForteVsGarantiaLiquida: "0.6", cessaoComTravaVsGarantiaLiquida: "0.6", outrasReaisVsGarantidas: "0.5", combinadaVsComponenteDominante: "0.7", limpaVsGarantida: "0.2"},
          riskBand: {same: "1", adjacent: "0.4", twoOrMoreApart: "0"},
          instrument: {same: "1", sameFamily: "0.8", securitizacaoVsMercadoDeCapitais: "0.6", bancarioVsMercadoDeCapitais: "0.5", fundoDeRecebiveisVsOutros: "0.3", fomentoOuVentureDebtVsOutros: "0"},
          tenorDurationDeltaMonths: [{max: 6, value: "1"}, {max: 12, value: "0.8"}, {max: 24, value: "0.5"}, {max: null, value: "0"}],
          sector: {sameGroup: "1", sameMacroSector: "0.6", other: "0.3"},
          amountRatio: [{min: "0.5", max: "2", value: "1"}, {min: "0.25", max: "4", value: "0.5"}, {min: null, max: null, value: "0"}],
          amortization: {same: "1", sacVsPrice: "0.9", bulletVsAmortizing: "0.5"},
        },
      },
      recency: {
        privateAndProposal: {fullWeightDays: 120, zeroWeightDays: 180},
        publicIssuance: {fullWeightDays: 90, zeroWeightDays: 150},
        decay: "linear entre o fim do peso pleno e o peso zero",
      },
      weighting: {
        observationWeight: "fator de recência × score de comparabilidade",
        quantileMethod: "ordenar por normalizedSpreadBps; o quantil q é o primeiro valor cuja soma acumulada dos pesos normalizados alcança q",
      },
      confidence: {
        alta: {minDirect: 8},
        moderada: {minDirect: 3, orMinAdjustable: 8},
        baixa: {minDirect: 1, orMinAdjustable: 3},
        insuficiente: {below: "baixa"},
        countsOnlyCurrentObservations: true,
        mixedDirectAndAdjustableNeverAlta: true,
        neverOverridesMinimumOrigins: true,
      },
      tenorWindow: {capMonths: 12, floorMonths: 6, relativeToTarget: "0.5", formula: "min(12; max(6; 0,5 × prazo alvo em meses))", basis: "duration de Macaulay em meses quando os cronogramas diferem; prazo nominal quando são iguais"},
      merge: {order: ["sectorGroup", "amountBand", "adjacentTenorBucket"], neverAcross: ["riskBand", "securityFamily", "instrumentFamily"], eachMergeIsApproximationStep: true},
      cellReview: {absoluteBps: 30, relativeToCellMedian: "0.15", rule: "abre revisão quando a mediana dos comparáveis novos se afasta da mediana da célula pelo maior dos dois limites"},
      referenceValidity: {days: 30, invalidateOnReferenceMoveBps: 30},
      abstainWhen: [
        "menos de 5 origens distintas depois das fusões permitidas",
        "confiança insuficiente",
        "regime invalidado ou em revisão declarada",
        "banda acima do teto de policy.pricing.communication-width",
        "prazo alvo fora da última faixa observada (PR-04)",
        "indexador sem normalização validada em market.pricing.indexer-basis",
        "mais de duas etapas de aproximação",
      ],
    },
    unit: "contagens de observações e de origens; frações de 0 a 1; dias; meses; pontos-base",
    source: {
      title: "Caso 01, prepare-capital-structure-decision, seções R6 e R7 (conteúdo aprovado com condições pelo fundador em 21/09/2026); House Playbook Offroad v2.1, PR-01, PR-02, PR-07 e PR-12",
      url: "https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/procedures/capital/prepare-capital-structure-decision.md",
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("policy.pricing.sample-quality"),
  },

  "policy.pricing.communication-width": {
    version: VERSION,
    value: {
      executorPolicy: {minBandWidthBps: 15, maxBandWidthBps: 150},
      band: {lower: "P25 ponderado", upper: "P75 ponderado", midpoint: "mediana ponderada", basis: "normalizedSpreadBps"},
      floor: {absoluteBpsByIndexer: {cdi: 15, ipca: 35, fixed: 35}, relativeToMidpoint: "0.10", confidenceMultiplier: {alta: "1.0", moderada: "1.5", baixa: "2.0"}},
      ceiling: {absoluteMaxBps: 150, minimumCeilingBpsByIndexer: {cdi: 35, ipca: 70, fixed: 70}, relativeToMidpoint: "0.35"},
      formula: {
        floorBps: "max(piso absoluto do indexador; 0,10 × |ponto médio|) × multiplicador de confiança",
        ceilingBps: "min(150; max(teto mínimo do indexador; 0,35 × |ponto médio|))",
      },
      evidence: {
        source: "ANBIMA, intervalo indicativo mínimo e máximo por debênture, arquivo de 23/09/2026",
        singleBondIndicativeIntervalBps: {
          di: {count: 559, p25: 3.58, median: 8.58, p75: 15.49},
          ipca: {count: 627, p25: 15.2, median: 23.5, p75: 35.24},
        },
      },
      approximation: {widthMultiplierPerStep: "1.25", maxSteps: 2},
      rounding: {edgeIncrementBps: 5, direction: "para fora: limite inferior para baixo, superior para cima"},
      onBelowFloor: "alargar simetricamente em torno da mediana até o piso e registrar o alargamento",
      onAboveCeiling: "não comunicar; voltar a PR-01",
      onFloorAboveCeiling: "não comunicar; voltar a PR-01",
      measuredOn: "spread de crédito sobre o indexador de referência; nunca a taxa total",
      standardText: "Referência indicativa de {indexador} + {minimo}% a {maximo}% ao ano, sujeita à análise e à decisão dos investidores. Base: {observacoes} observações de {origens} origens entre {dataInicial} e {dataFinal}; confiança {confianca}.",
      writtenBandRule: "por escrito, somente banda que a Offroad sustentaria em qualquer ponto dela",
    },
    unit: "pontos-base",
    source: {
      title: "House Playbook Offroad v2.1, PR-01 e PR-09; Resolução CVM 160/2022, art. 6º, § 2º (consulta a investidores sem vinculação)",
      url: PLAYBOOK_URL,
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("policy.pricing.communication-width"),
  },

  "policy.pricing.regime": {
    version: VERSION,
    value: {
      regimeId: "brl-afrouxamento-2026-03-19",
      status: "active",
      validFrom: "2026-03-19",
      declaredOn: AS_OF,
      referenceConditions: {
        selicTargetPct: "13.75",
        selicTargetSince: "2026-09-17",
        easingCycle: {startedOn: "2026-03-19", fromPct: "15.00", cuts: 5, stepBps: 25, cumulativeBps: -125},
        cdiAnnualPct: "13.65",
        cdiObservedOn: "2026-09-22",
        ipca12mPct: "4.22",
        ipcaReferenceMonth: "2026-08",
        ltnIndicativePct: ANBIMA_LISTED_2026_09_23.ltnIndicativePct,
        ntnbIndicativeRealPct: ANBIMA_LISTED_2026_09_23.ntnbIndicativeRealPct,
        listedDiSpreadMedianBps: ANBIMA_LISTED_2026_09_23.diSpreadBps.median,
        listedDiSpreadCount: ANBIMA_LISTED_2026_09_23.diSpreadBps.count,
        listedIpcaSpreadOverNtnbMedianBps: ANBIMA_LISTED_2026_09_23.ipcaSpreadOverReferenceNtnbBps.median,
        listedIpcaSpreadCount: ANBIMA_LISTED_2026_09_23.ipcaSpreadOverReferenceNtnbBps.count,
        listedMarketObservedOn: "2026-09-23",
        primaryMarket: {august2026OffersBRLbn: "48.8", august2025OffersBRLbn: "58.0", ytd2026OffersBRLbn: "485", ytdChangeVsPriorYear: "0.071", august2026DebenturesBRLbn: "21.5", publishedOn: "2026-09-16"},
      },
      triggers: [
        {id: "RG-01", name: "direcao_da_politica_monetaria", condition: "o Copom inverte a direção do ciclo de cortes iniciado em 19/03/2026", action: "revisao_obrigatoria", scope: "todas as classes"},
        {id: "RG-02", name: "spread_listado", condition: "mediana DI+ do arquivo diário da ANBIMA a 50 pontos-base ou mais de 95,55, ou mediana IPCA+ sobre a NTN-B de referência a 50 pontos-base ou mais de 26,97", action: "revisao_obrigatoria", scope: "todas as classes"},
        {id: "RG-03", name: "movimento_material", condition: "30 pontos-base ou mais nas mesmas medianas desde o último cálculo da célula", action: "recalcular_referencias", scope: "células afetadas"},
        {id: "RG-04", name: "evento_de_credito", condition: "inadimplemento, recuperação judicial ou extrajudicial, ou fraude contábil revelada, de emissor com R$ 1 bilhão ou mais em dívida no mercado de capitais local", action: "revisao_obrigatoria", scope: "grupo setorial do emissor e faixas watch, weak e distressed"},
        {id: "RG-05", name: "fluxo_de_fundos", condition: "resgates líquidos em dois meses consecutivos somando mais de 3% do patrimônio das categorias de renda fixa com crédito privado no boletim de fundos da ANBIMA", action: "revisao_obrigatoria", scope: "todas as classes"},
        {id: "RG-06", name: "mercado_primario", condition: "emissão de debêntures em dois meses consecutivos abaixo de 50% da média mensal dos doze meses anteriores no boletim de mercado de capitais da ANBIMA", action: "revisao_obrigatoria", scope: "família mercado_de_capitais"},
        {id: "RG-07", name: "norma", condition: "mudança legal, tributária ou regulatória que altere a demanda do investidor ou o custo do emissor de uma classe de instrumento", action: "invalidar_classes_afetadas", scope: "classes afetadas, desde a vigência"},
      ],
      reviewDeadlineBusinessDays: 5,
      duringReview: "referências carregam a marca 'regime em revisão' e não entram em material novo",
      onNewRegime: {
        previousPolicyStatus: "invalidated",
        previousObservations: "histórico marcado, fora de decisão e de material novo",
        newRegimeIdFormat: "brl-<descritor>-<AAAA-MM-DD>",
        untilCellsRebuilt: "abstenção",
      },
      partialInvalidation: "encerrar validUntil das observações das classes afetadas na data do evento, mantendo o regime",
      decidedBy: "Head de Mercado e Distribuição, com registro datado da decisão e das evidências",
    },
    unit: "identificador de regime; datas ISO; taxas em % ao ano; spreads em pontos-base",
    source: {
      title: "Banco Central do Brasil, histórico da meta Selic (SGS 432) e CDI (SGS 4389); ANBIMA, taxas indicativas de 23/09/2026; House Playbook Offroad v2.1, PR-12",
      url: "https://www.bcb.gov.br/controleinflacao/historicotaxasjuros",
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("policy.pricing.regime"),
  },

  "market.pricing.security-premiums": {
    version: VERSION,
    value: {
      deltaDefinition: "normalizedSpreadBps da estrutura limpa menos normalizedSpreadBps da estrutura reforçada, mesmo perfil, prazo e data; valor positivo é redução de spread",
      baseline: "limpa",
      reinforcementTypes: [
        {id: "real_forte", securityClasses: SECURITY_FAMILIES.real_forte, requirement: "alienação fiduciária registrada, laudo independente e cobertura depois do corte de pelo menos 1,0x"},
        {id: "cessao_com_trava", securityClasses: SECURITY_FAMILIES.cessao_com_trava, requirement: "cessão fiduciária com conta vinculada e trava de domicílio bancário"},
        {id: "garantia_liquida", securityClasses: SECURITY_FAMILIES.garantia_liquida, requirement: "fiança bancária, seguro garantia ou aplicação financeira em garantia cobrindo o principal"},
        {id: "outras_reais", securityClasses: SECURITY_FAMILIES.outras_reais, requirement: "garantia real sem as condições acima"},
      ],
      baselineDefinition: {id: "limpa", securityClasses: SECURITY_FAMILIES.limpa, includes: "quirografária, inclusive com aval ou fiança pessoal sem garantia real"},
      pairRule: {
        sameRiskBand: true,
        sameInstrumentFamily: true,
        maxTenorDeltaMonths: 12,
        maxObservationGapDays: 30,
        sameIssuerPreferred: true,
        minIndependentPairsPerType: 5,
        pairOrigin: "cada par conta uma origem; pares da mesma operação contam uma vez",
        combinedPackages: "prêmios não se somam; pacote combinado exige par próprio",
      },
      statistic: ["p25DeltaBps", "medianDeltaBps", "p75DeltaBps", "pairCount", "latestPairOn", "validUntil"],
      validity: {days: 180, onRegimeChange: "invalidado"},
      table: [
        {reinforcement: "real_forte", status: "sem_base_suficiente", pairCount: 0, medianDeltaBps: null},
        {reinforcement: "cessao_com_trava", status: "sem_base_suficiente", pairCount: 0, medianDeltaBps: null},
        {reinforcement: "garantia_liquida", status: "sem_base_suficiente", pairCount: 0, medianDeltaBps: null},
        {reinforcement: "outras_reais", status: "sem_base_suficiente", pairCount: 0, medianDeltaBps: null},
      ],
      notAPremium: [
        "ajustes de garantia da grade de prática da mesa em packages/market-reference/src/index.ts",
        "diferença entre médias de papéis com e sem garantia de emissores distintos",
      ],
      belowMinimumAnswer: "sem base suficiente",
    },
    unit: "pontos-base ao ano de redução de spread frente à estrutura limpa",
    source: {
      title: "House Playbook Offroad v2.1, PR-03 e PR-08 (método de pares, autoridade MERCADO)",
      url: PLAYBOOK_URL,
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("market.pricing.security-premiums"),
  },

  "market.pricing.tenor-curve": {
    version: VERSION,
    value: {
      premiumMeasure: "pontos-base de normalizedSpreadBps por ano de duration de Macaulay",
      pairMethods: [
        {id: "intra_emissor", rule: "duas séries do mesmo emissor e do mesmo indexador, na mesma data, com duration separada por pelo menos 1 ano"},
        {id: "intra_celula", rule: "medianas de faixas de prazo adjacentes da mesma faixa de risco, família de instrumento e família de garantia, cada faixa com pelo menos 5 origens distintas"},
      ],
      minIssuersOrCellPairsPerRiskBand: 5,
      tenorBucketsMonths: TENOR_BUCKETS_MONTHS,
      appetiteBreakpoint: {
        source: "market.mandates",
        rule: "degrau no início da faixa de prazo em que o número de mandatos atuais e aderentes que aceitam o prazo cai para metade ou menos da faixa anterior",
        minimumMandatesObserved: 5,
      },
      extrapolation: {allowed: false, answer: "fora da curva observável; exige sondagem"},
      governedCurve: [],
      listedMarketContext: {
        source: "ANBIMA, taxas indicativas de debêntures DI+ de 23/09/2026",
        intraIssuerSlopeBpsPerYear: {issuers: 83, p25: 0, median: 7.75, p75: 12.77, sharePositive: "0.75"},
        medianByDurationBucket: ANBIMA_LISTED_2026_09_23.diSpreadBpsByDuration,
        role: "contexto do mercado listado; não forma curva de crédito privado",
      },
      validity: {days: 90, recomputeOn: ["gatilho de policy.pricing.regime", "rodada de confirmação de mandatos que altere prazos máximos"]},
    },
    unit: "pontos-base por ano de duration; faixas e degraus em meses",
    source: {
      title: "House Playbook Offroad v2.1, PR-04; contexto público: ANBIMA, taxas indicativas de debêntures de 23/09/2026",
      url: "https://www.anbima.com.br/informacoes/merc-sec-debentures/default.asp",
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("market.pricing.tenor-curve"),
  },

  "market.pricing.size-liquidity": {
    version: VERSION,
    value: {
      ticketBandsBRLmm: [
        {id: "ate_20", minExclusive: 0, maxInclusive: 20, route: "bilateral: CCB, nota comercial com o banco coordenador ou FIDC de nicho", medianInvestorsAtClosing: {criCra: 2, fidcQuotas: 2}},
        {id: "20_a_50", minExclusive: 20, maxInclusive: 50, route: "nota comercial, CCB, CRI ou CRA, FIDC; debênture com poucos compradores", medianInvestorsAtClosing: {debentures: 3.5, criCra: 2, fidcQuotas: 4}},
        {id: "50_a_150", minExclusive: 50, maxInclusive: 150, route: "debênture ou nota comercial pelo rito automático para profissionais; FIDC", medianInvestorsAtClosing: {debentures: 7, criCra: 3, fidcQuotas: 8}},
        {id: "150_a_500", minExclusive: 150, maxInclusive: 500, route: "debênture coordenada com distribuição", medianInvestorsAtClosing: {debentures: 15, fidcQuotas: 16}},
        {id: "acima_de_500", minExclusive: 500, maxInclusive: null, route: "emissão de referência com distribuição ampla", medianInvestorsAtClosing: {debentures: 63.5, fidcQuotas: 60.5}},
      ],
      fixedCost: {
        source: "policy.pricing.cost-catalogue",
        annualizedBpsFormula: "(custos únicos ÷ prazo médio ponderado em anos + custos anuais) ÷ volume × 10.000",
        reportedSeparatelyFromSpread: true,
      },
      liquidityAdjustment: {observed: [], rule: "sem ajuste observado e datado, nenhum ajuste de tamanho entra no spread", adjustmentId: "size"},
      anchorCapacity: {
        anchors: 3,
        capacity: "soma dos tíquetes máximos atuais dos 3 mandatos aderentes de maior aderência em market.mandates",
        ifAmountAboveCapacity: "desenho de distribuição (MK-17) antes de comunicar banda",
      },
      publicObservation: {
        source: "CVM, dados abertos de ofertas públicas, arquivo oferta_resolucao_160.csv atualizado em 23/09/2026",
        window: {registeredFrom: "2025-09-24", registeredTo: "2026-09-23", status: "Oferta Encerrada"},
        offerSizeBRLmm: {
          debentures: {count: 522, p25: 150.0, median: 391.6, p75: 903.8},
          notasComerciais: {count: 276, p25: 40.0, median: 90.0, p75: 176.2},
          criCra: {count: 523, p25: 22.7, median: 53.3, p75: 149.2},
          fidcQuotas: {count: 987, p25: 10.0, median: 30.0, p75: 80.0},
        },
        investorsAtClosingOutsideConsortium: {
          debentures: {"20_a_50": {reporting: 18, median: 3.5}, "50_a_150": {reporting: 51, p25: 3, median: 7, p75: 21}, "150_a_500": {reporting: 100, median: 15}, acima_de_500: {reporting: 122, median: 63.5}},
          criCra: {ate_20: {reporting: 119, median: 2}, "20_a_50": {reporting: 129, median: 2}, "50_a_150": {reporting: 137, median: 3}},
          fidcQuotas: {"20_a_50": {reporting: 205, median: 4}, "50_a_150": {reporting: 159, median: 8}, "150_a_500": {reporting: 77, median: 16}},
        },
        absorbedOnlyByDistributionConsortium: {
          notasComerciaisUpTo150: {offers: 197, onlyConsortium: 168},
          debenturesUpTo150: {offers: 134, onlyConsortium: 62},
        },
      },
      refresh: "trimestral, no primeiro dia útil de janeiro, abril, julho e outubro, a partir dos dados abertos da CVM",
    },
    unit: "R$ milhões para faixas de tíquete; contagem de investidores; pontos-base ao ano para custo fixo",
    source: {
      title: "CVM, Dados Abertos, Ofertas Públicas de Distribuição (Resolução CVM 160), arquivo de 23/09/2026; House Playbook Offroad v2.1, PR-05",
      url: "https://dados.cvm.gov.br/dataset/oferta-distrib",
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("market.pricing.size-liquidity"),
  },

  "market.pricing.indexer-basis": {
    version: VERSION,
    value: {
      normalizationBase: "DI + spread composto, base 252",
      defaultIndexer: "cdi",
      indexLevels: {cdi: "0.1365", ipca: "0.0422", tlp: "0.0830", tr: "0.001668", source_id: "bcb-sgs:4389;13522;27572;226", observed_on: "2026-09-22", valid_until: "2026-09-30"},
      indexLevelDefinitions: {
        cdi: "taxa DI anualizada em base 252, fração ao ano, 22/09/2026 (SGS 4389)",
        ipca: "IPCA acumulado em 12 meses até agosto de 2026, fração (SGS 13522); nível de exibição, nunca insumo de conversão",
        tlp: "parcela prefixada real Jm de setembro de 2026, fração ao ano, aplicada sobre o IPCA (SGS 27572)",
        tr: "TR do período de 22/09/2026 a 22/10/2026, fração ao mês (SGS 226)",
      },
      levelValidUntil: {cdi: "2026-11-04", ipca: "2026-10-09", tlp: "2026-09-30", tr: "2026-09-23"},
      conversions: {
        diSpread: "fator = fator DI × (1 + s)^(du/252)",
        percentOfDi: "s = {1 + [(1 + c)^(1/252) - 1] × p}^252 ÷ (1 + c) - 1, com c = taxa DI x pré na duration da operação",
        prefixed: "s = (1 + r) ÷ (1 + c(D)) - 1, com c(D) = taxa DI x pré na duration D",
        ipcaPlus: "1 + r = (1 + π(D)) × (1 + q); s = (1 + r) ÷ (1 + c(D)) - 1, com π(D) = inflação implícita na duration D",
        tlp: "1 + r = (1 + IPCA) × (1 + Jm), pro rata; spread do agente somado na convenção do contrato",
        foreignCurrencyWithSwap: "s tal que o valor presente dos fluxos em moeda estrangeira com swap para DI, na curva do dia, iguala o valor presente dos fluxos em DI + s",
      },
      curves: {
        prefixed: {primary: "ANBIMA, ETTJ prefixada (Svensson), diária", secondary: "B3, Taxas Referenciais DI x pré"},
        real: {primary: "ANBIMA, ETTJ IPCA", secondary: "B3, Taxas Referenciais DI x IPCA"},
        impliedInflation: "ANBIMA, inflação implícita da ETTJ",
        vertexInterpolation: "Flat Forward 252 entre vértices, como na curva DI x pré da B3 (Manual de Curvas de 12/12/2025, seção 2.1)",
        diSpreadConvention: "spread multiplicativo sobre o fator DI em base 252 (B3, Manual de Apreçamento de Debêntures de 30/05/2022, seção 2.2.2)",
        durationMatching: "duration de Macaulay da operação em dias úteis",
        curveDate: "data da observação; nunca a curva do dia do cálculo para uma observação antiga",
        calculationConventions: "policy.capital.anbima-b3-conventions",
      },
      taxRegimeNormalization: "papel isento para pessoa física (Lei 12.431, CRI e CRA) compara-se com papel isento; comparação cruzada só com o gross-up de policy.capital.tax-regime",
      mandateAcceptance: {source: "market.mandates", rule: "PR-06 exige pelo menos um mandato atual e aderente que aceite o indexador proposto; sem ele a proposta fica bloqueada"},
      executorSupportedIndexers: ["cdi"],
      listedMarketContext: {
        source: "ANBIMA, taxas indicativas de títulos públicos e de debêntures de 23/09/2026",
        ltnIndicativePct: ANBIMA_LISTED_2026_09_23.ltnIndicativePct,
        ntnbIndicativeRealPct: ANBIMA_LISTED_2026_09_23.ntnbIndicativeRealPct,
        ipcaDebenturesSpreadOverReferenceNtnbBps: ANBIMA_LISTED_2026_09_23.ipcaSpreadOverReferenceNtnbBps,
      },
    },
    unit: "taxas em fração ao ano, base 252, salvo a TR (fração ao mês); spreads em pontos-base",
    source: {
      title: "Banco Central do Brasil, SGS 4389 (DI), 13522 (IPCA 12 meses), 27572 (Jm da TLP) e 226 (TR); ANBIMA, Estrutura a Termo das Taxas de Juros Estimada e taxas indicativas de 23/09/2026",
      url: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/10?formato=json",
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("market.pricing.indexer-basis"),
  },

  "policy.pricing.cost-catalogue": {
    version: VERSION,
    value: {
      scopeBoundary: {
        thisKey: "hierarquia de fontes, estado do custo e anualização para o all-in de PR-10 e a comparação de PR-11",
        treatmentInSourcesAndUses: "policy.transaction-costs",
        iof: "policy.capital.iof",
        taxes: "policy.capital.tax-regime",
        calculationConventions: "policy.capital.anbima-b3-conventions",
      },
      costState: ["conhecido", "zero", "nao_aplicavel", "desconhecido"],
      unknownCostRule: "custo desconhecido bloqueia o all-in da alternativa; nunca recebe zero nem estimativa do modelo",
      sourceHierarchy: [
        {rank: 1, source: "contrato ou proposta vinculante assinada", validity: "a do documento"},
        {rank: 2, source: "tabela pública oficial vigente na data da operação (CVM, ANBIMA, B3, emolumentos do estado)", validity: "até a próxima versão da tabela"},
        {rank: 3, source: "cotação escrita e datada do prestador", validityDays: 90},
        {rank: 4, source: "referência de mercado da casa, datada, em faixa, rotulada estimativa", validityDays: 90, use: "leitura preliminar; nunca material externo"},
      ],
      componentNature: ["unico_percentual", "unico_fixo", "anual_fixo", "anual_percentual", "por_evento"],
      components: {
        todos: ["estruturacao", "juridico_emissor", "juridico_coordenador", "registro_de_garantias", "laudo_de_avaliacao", "agente_de_garantias_e_conta_vinculada", "rating_quando_exigido", "auditoria_quando_exigida"],
        ccb: ["tarifa_de_estruturacao", "iof", "reciprocidade_estimada"],
        nota_comercial: ["coordenacao", "escriturador", "deposito_b3", "taxa_cvm_quando_oferta_publica", "taxa_anbima_quando_oferta_publica", "agente_fiduciario_quando_exigido"],
        debenture: ["coordenacao", "comissao_de_distribuicao", "taxa_cvm", "taxa_anbima", "deposito_e_custodia_b3", "escriturador_e_liquidante", "agente_fiduciario", "rating_quando_exigido", "publicacoes"],
        cri_cra: ["securitizadora_emissao_e_gestao", "agente_fiduciario", "custodiante_e_registrador", "deposito_b3", "taxa_cvm", "taxa_anbima", "coordenacao"],
        fidc: ["administracao", "gestao", "custodia_e_controladoria", "auditoria", "rating_da_cota_senior", "escrituracao", "taxa_cvm", "taxa_anbima_registro_de_fundo", "custo_do_capital_na_subordinada"],
      },
      publicTables: {
        cvmOfferSupervisionFee: {basis: "valor da oferta pública de valores mobiliários", rate: "0.0003", minimumBRL: "809.16", norm: "Lei 7.940/1989, Anexo IV, redação da Lei 14.317/2022"},
        anbimaOfferRegistration: {
          consultedOn: AS_OF,
          appliesWhen: "coordenador aderente ao código de ofertas públicas da ANBIMA",
          cvm160ProfessionalInvestors: {rate: "0.00002778", minimumBRL: "9919.00", maximumBRL: "69436.00"},
          cvm160RetailOrQualified: {rate: "0.00003968", minimumBRL: "14169.00", maximumBRL: "99194.00"},
          cvmAnbimaAgreement: {debentures: "0.00009920", notasComerciaisENotasPromissorias: "0.00003968", securitizacao: "0.00022248", minimumBRL: "28341.00", maximumBRL: "198388.00"},
          fundQuotasFidcFiiFiagro: {rate: "0.00003479", minimumBRL: "3396.00", maximumBRL: "56683.00"},
        },
        b3: {rule: "tabela de tarifas vigente na data da operação, sem reprodução nesta proposta", url: "https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/"},
      },
      mandatoryParties: {
        debentureDistributedOrTraded: "agente fiduciário (Lei 6.404/1976, art. 61, § 1º)",
        notaComercial: "escriturador autorizado pela CVM (Lei 14.195/2021, art. 45); agente fiduciário quando a CVM exigir para oferta pública (art. 50)",
      },
      annualization: {
        executorMethod: "linear_sobre_prazo_medio_ponderado",
        executorFormula: "bps = (custo único ÷ prazo médio ponderado em anos + custo anual) ÷ volume × 10.000",
        weightedAverageLifeYears: "Σ(t × amortização) ÷ Σ amortização, t em anos de 252 dias úteis",
        governingMethod: "TIR do fluxo líquido em base 252: recebido = principal - custos únicos - IOF retido; pagamentos = juros + principal + custos anuais",
        toleranceBps: 5,
        rule: "quando o linear e a TIR diferem em mais de 5 pontos-base, a TIR governa e a diferença aparece",
      },
      allInComposition: "(1 + DI) × (1 + spread equivalente com custos anualizados) - 1",
      presentation: "spread e all-in lado a lado por alternativa; bruto sempre; líquido de imposto só com policy.capital.tax-regime aprovado",
      currentCostComparison: {
        base: "custo médio atual reconciliado (D-17) na mesma convenção",
        rolloverRisk: "cenário de D-28 em reais, nunca adjetivo",
        whenProposedAboveCurrent: "declarar o que se compra pela diferença: prazo em meses, carência em meses, garantia liberada em reais e risco de rolagem removido em reais",
      },
    },
    unit: "reais por componente; fração do volume; pontos-base ao ano depois da anualização",
    source: {
      title: "Lei 7.940/1989, Anexo IV (redação da Lei 14.317/2022); tabela de taxas de registro da ANBIMA; Lei 6.404/1976, art. 61; Lei 14.195/2021, arts. 45 e 50; House Playbook Offroad v2.1, PR-10 e PR-11",
      url: "https://www.planalto.gov.br/ccivil_03/leis/l7940.htm",
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("policy.pricing.cost-catalogue"),
  },

  "market.pricing.observation-registry": {
    version: VERSION,
    value: {
      table: "public.pricing_observations",
      requiredFields: ["sourceId", "sourceOwner", "sourceKind", "confidentiality", "observedOn", "validUntil", "status", "instrument", "rating", "indexer", "tenorMonths", "securityClass", "amortizationClass", "sectorGroup", "amount", "regime", "economics", "normalizationMethod", "quality", "aggregateAuthorized", "evidenceLocator"],
      enums: {
        sourceKind: ["public_closing", "direct_manager_confirmation", "term_sheet", "indication", "sounding", "authorized_historical"],
        confidentiality: ["public", "aggregated_confidential", "restricted_internal"],
        status: ["closed", "term", "indication", "sounding"],
        instrument: ["ccb", "nce", "debenture_476", "debenture_160", "cra", "cri", "fidc", "venture_debt", "finame", "leasing"],
        rating: Object.keys(RISK_BANDS),
        indexer: ["cdi", "ipca", "fixed", "other"],
      },
      vocabularies: {
        securityClass: "unsecured, ou secured: seguido das classes de garantia ordenadas e unidas por + (receivables, inventory, property, equipment, vehicles, shares, financial, guarantee, other)",
        amortizationClass: ["bullet", "sac", "price", "balloon"],
        sectorGroup: ["agro", "varejo", "industria", "servicos_recorrentes_e_software", "saude", "educacao", "energia", "imobiliario", "transporte_e_logistica", "construcao_pesada_e_infraestrutura", "outros"],
      },
      qualityBySourceKind: {public_closing: 1, term_sheet: 0.9, authorized_historical: 0.9, direct_manager_confirmation: 0.8, indication: 0.6, sounding: 0.5},
      statusBySourceKind: {public_closing: "closed", term_sheet: "term", authorized_historical: "closed", direct_manager_confirmation: "term", indication: "indication", sounding: "sounding"},
      validityDaysBySourceKind: {public_closing: 150, term_sheet: 180, authorized_historical: 180, direct_manager_confirmation: 180, indication: 180, sounding: 180},
      fullWeightDaysBySourceKind: {public_closing: 90, term_sheet: 120, authorized_historical: 120, direct_manager_confirmation: 120, indication: 120, sounding: 120},
      economicsIdentity: {rule: "normalizedSpreadBps = quotedSpreadBps + feeBps + oidBps + warrantBps + hedgeBps", toleranceBps: 0.01, oneOffFeeToBps: "comissão única em pontos-base do volume ÷ duration em anos"},
      originIdentity: {sourceId: "identifica a operação, não o documento", rule: "propostas, rodadas e séries da mesma operação compartilham a origem"},
      confidentialityRules: {
        public: "fonte pública com direito de uso registrado",
        aggregated_confidential: "observação de cliente ou de financiador com consentimento específico para uso agregado",
        restricted_internal: "nunca entra em agregado (aggregateAuthorized = false)",
      },
      anonymization: {
        forbidden: ["nome", "CNPJ", "cidade", "qualquer combinação de campos que identifique a companhia"],
        amount: "faixa de tíquete de market.pricing.size-liquidity nas consultas do produto",
        observedOnForClientSources: "janela de 15 dias nas consultas do produto",
        auditLink: "a ligação com a origem fica só no registro de auditoria restrito, para cumprir revogação",
      },
      consent: {
        aggregateAuthorizedRequires: "consentimento específico da companhia para uso agregado, registrado com data e versão",
        revocation: "retira a observação de toda referência calculada depois da revogação; agregado anterior fica como histórico e não se reutiliza como referência atual",
      },
      admission: {
        reject: ["sem fonte", "sem data", "sem qualidade", "sem validade", "boato", "identidade econômica que não fecha em 0,01 ponto-base"],
        learningOnly: "indication e sounding ficam registradas para aprendizado, PR-08 e MK-15; não formam célula porque a qualidade fica abaixo do mínimo",
      },
      entriesInThisProposal: 0,
      auditCadence: "relatório mensal de frescor e de consentimentos, no primeiro dia útil",
    },
    unit: "esquema, vocabulário, qualidade de 0 a 1 e validade em dias por tipo de fonte",
    source: {
      title: "House Playbook Offroad v2.1, PR-02, PR-07, PR-12 e PR-13; tabela pricing_observations (supabase/migrations/20260826013647_m6_pricing_registry.sql)",
      url: PLAYBOOK_URL,
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("market.pricing.observation-registry"),
  },

  "market.mandates": {
    version: VERSION,
    value: {
      buyerTypes: [
        {id: "fundo_credito_high_grade", rule: "MK-01"},
        {id: "high_yield_e_special_situations", rule: "MK-02"},
        {id: "fundo_com_mandato_dedicado", rule: "MK-03"},
        {id: "gestora_e_veiculo_fidc", rule: "MK-04"},
        {id: "family_office", rule: "MK-05"},
        {id: "banco_medio", rule: "MK-06"},
        {id: "securitizadora", rule: "MK-07", note: "veículo e prestador, nunca investidor final"},
        {id: "factor_e_forfait", rule: "MK-08"},
        {id: "fundo_de_infraestrutura_e_imobiliario", rule: "MK-09"},
        {id: "fundo_de_venture_debt", rule: "MK-10"},
      ],
      criteriaFields: ["active", "instruments", "ticket", "termMonths", "sectors", "excludedSectors", "geographies", "collateral", "leverageCeiling", "minimumDscr", "indexers", "minimumRiskBand", "returnTargetBps", "declaredRestrictions"],
      metadataPerField: ["provenance", "observedAt", "confirmedBy", "sourceLocator", "confidence"],
      sourceClasses: {
        direct_confirmation: ["declared", "conversation"],
        public_rule: ["published"],
        governed_observation: ["observed"],
        unconfirmed: ["inferred"],
      },
      precedenceByField: {
        legalConstraints: {fields: ["instruments", "excludedSectors", "geographies"], order: ["published", "declared", "conversation", "observed", "inferred"]},
        appetite: {fields: ["active", "ticket", "termMonths", "sectors", "collateral", "leverageCeiling", "minimumDscr", "indexers", "minimumRiskBand", "returnTargetBps"], order: ["declared", "conversation", "observed", "published", "inferred"]},
      },
      hardFilterSourceClasses: ["direct_confirmation", "public_rule", "governed_observation"],
      hardFilterOrder: ["ticket", "setor_vedado", "instrumento", "prazo", "exigencia_de_garantia", "jurisdicao"],
      publicSources: [
        {id: "regulamento_cvm", note: "regulamento publicado no sistema da CVM (Resolução CVM 175, art. 10, parágrafo único)", url: "https://conteudo.cvm.gov.br/legislacao/resolucoes/resol175.html"},
        {id: "cadastro_de_fundos", dataset: "fi-cad", url: "https://dados.cvm.gov.br/dataset/fi-cad"},
        {id: "composicao_da_carteira", dataset: "fi-doc-cda", url: "https://dados.cvm.gov.br/dataset/fi-doc-cda"},
        {id: "informe_mensal_fidc", dataset: "fidc-doc-inf_mensal", url: "https://dados.cvm.gov.br/dataset/fidc-doc-inf_mensal"},
        {id: "ofertas_encerradas", dataset: "oferta-distrib", url: "https://dados.cvm.gov.br/dataset/oferta-distrib"},
      ],
      confirmationProtocol: {
        updatesOnlyCoveredFields: true,
        record: ["data", "autor", "meio", "campos cobertos"],
        disclosesNoCase: "a confirmação de mandato não revela a companhia nem o caso",
      },
      entries: [],
      syntheticInvestorsExcluded: "os investidores fictícios de packages/investor-base nunca entram neste registro",
      publicObservation: {
        source: "CVM, dados abertos de ofertas encerradas registradas de 24/09/2025 a 23/09/2026, participação na quantidade subscrita",
        debenturesUpTo150: {offers: 134, distributionConsortium: "0.54", investmentFunds: "0.43"},
        debenturesAbove150: {offers: 388, distributionConsortium: "0.57", investmentFunds: "0.20", otherFinancialInstitutions: "0.17", individuals: "0.04", otherCompanies: "0.03"},
        notasComerciais: {offersUpTo150: 197, offersAbove150: 79, distributionConsortiumUpTo150: "0.99", distributionConsortiumAbove150: "1.00"},
        criCraUpTo150: {offers: 400, investmentFunds: "0.85", otherFinancialInstitutions: "0.06", individuals: "0.04", otherCompanies: "0.03", distributionConsortium: "0.03"},
        criCraAbove150: {offers: 123, investmentFunds: "0.60", distributionConsortium: "0.34", individuals: "0.05"},
      },
    },
    unit: "registro governado de mandatos: campos, classes de fonte e estado",
    source: {
      title: "Resolução CVM 175/2022 (regulamento público do fundo) e Dados Abertos da CVM; House Playbook Offroad v2.1, MK-01 a MK-14",
      url: "https://dados.cvm.gov.br/",
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("market.mandates"),
  },

  "policy.market.mandate_max_age": {
    version: VERSION,
    value: {
      mandateMaxAgeMonths: 3,
      executorScope: "buildMarketTruthSet e market_distribution_policies.mandate_max_age_months aplicam um prazo único aos campos de filtro duro: active, instrument, ticket, term, sector, geography, leverage e dscr",
      byFieldMonths: {active: 3, ticket: 6, termMonths: 6, collateral: 6, leverageCeiling: 6, minimumDscr: 6, indexers: 12, instruments: 12, sectors: 12, excludedSectors: 12, geographies: 12},
      byProvenanceMaxMonths: {declared: 12, conversation: 6, published: 12, observed: 6, inferred: 0},
      publishedAlsoExpiresOn: "arquivamento de nova versão do regulamento na CVM",
      familyOfficeMaxMonths: 3,
      effectiveRule: "prazo efetivo = menor entre o prazo do campo, o da proveniência e o do perfil",
      preWaveReconfirmation: {fields: ["active", "ticket"], maxAgeDays: 30},
      statementRankDecayMonths: 3,
      onStale: "o campo vencido sai dos filtros duros, rebaixa a confiança e entra na lista de reconfirmação; o registro não é apagado",
      refreshCadence: {
        published: "releitura mensal do cadastro e dos documentos do fundo na CVM",
        observed: "mensal, depois do prazo de 10 dias úteis do Anexo Normativo I da Resolução CVM 175, art. 24, II",
      },
    },
    unit: "meses (dias quando indicado)",
    source: {
      title: "House Playbook Offroad v2.1, MK-05 e MK-11 a MK-14; Resolução CVM 175/2022, Anexo Normativo I, arts. 22 e 24 (prazos de divulgação da carteira)",
      url: "https://conteudo.cvm.gov.br/legislacao/resolucoes/resol175.html",
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("policy.market.mandate_max_age"),
  },

  "policy.market.distribution-waves": {
    version: VERSION,
    value: {
      waveLimit: 3,
      learningGateAnchorCount: 2,
      learningGateMaxBusinessDays: 10,
      onGateTimeout: "revisão registrada de material e estrutura; sem expansão automática",
      structuralObjectionThreshold: 2,
      onStructuralObjection: "revisão ES-40 antes da onda seguinte",
      subsequentWaveLimit: 3,
      maxRecipientsWithoutExceptionalExpansion: 9,
      exceptionalExpansionRequires: ["racional escrito", "consentimento da companhia vinculado à versão do material", "destinatários aderentes com mandato atual"],
      communication: {
        form: "individual, com tese por destinatário (MK-13)",
        prohibited: "comunicação padronizada e massificada (Resolução CVM 160, art. 3º, § 1º, V)",
      },
      securitiesOfferRoute: {
        regime: "consulta sigilosa a potenciais investidores (Resolução CVM 160, art. 6º)",
        audience: "investidores profissionais (Resolução CVM 30, art. 11)",
        conditions: ["compromisso de sigilo obtido do interlocutor", "sem vinculação, oferta ou aceitação", "sem pagamento de parte a parte", "lista de consultados com data e hora e materiais arquivados"],
        consultationWindow: "até o protocolo do pedido de registro quando feita por assessor contratado pelo ofertante (art. 6º, § 1º, III)",
        coordinator: "a oferta pública é coordenada por instituição habilitada (art. 5º); a Offroad não distribui",
      },
      singleLotRoute: "Resolução CVM 160, art. 8º, IV: lote único e indivisível a um único investidor, sem material publicitário e com as restrições de 180 dias dos §§ 3º e 4º",
      packageByStage: {default: ["teaser"], onExpressAuthorizationPerRecipient: ["memorando", "term_sheet_indicativo", "perguntas_e_respostas", "indice_de_documentos"]},
      record: ["destinatário", "racional", "materiais", "versões", "autorização", "data e hora"],
    },
    unit: "destinatários por onda; dias úteis",
    source: {
      title: "Resolução CVM 160/2022, arts. 3º, 5º, 6º e 8º; Resolução CVM 30/2021, art. 11; House Playbook Offroad v2.1, MK-15 a MK-18",
      url: CVM_160_URL,
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: doc("policy.market.distribution-waves"),
  },
};
