import type {ReferenceDataProposal, ReferenceDataProposalFamily} from "./types";

/**
 * Structure: maturity wall, covenants, leverage and coverage, repayment design, reserves, collateral,
 * appraisal, cross-default, reporting, cure and waiver, sellable structure, ticket and conditions
 * precedent.
 *
 * Every value is a draft prepared for the founder's review. Decimal quantities (fractions, multiples,
 * amounts in reais) are strings so that a method reads them with Decimal; counts of months, days and
 * uses are integers. Field names carry the unit. The card of each key, in
 * `knowledge/reference-data/structure.md`, carries the reasoning, the sources and the review triggers.
 */

const version = "2026.09.24-v1";
const asOf = "2026-09-24";
const observedBy = "Offroad (Claude, executor), 24/09/2026, aguardando revisão do fundador";

function proposal(key: string, unit: string, source: {title: string; url: string}, value: ReferenceDataProposal["value"]): ReferenceDataProposal {
  return {version, value, unit, source: {...source, observedBy}, asOf, documentation: `knowledge/reference-data/structure.md#${key}`};
}

const collateralHaircuts = proposal(
  "policy.structure.collateral_haircuts",
  "fração do valor livre do ativo (0 a 1)",
  {
    title: "Lei nº 9.514/1997, arts. 22 a 27, na redação da Lei nº 14.711/2023 (alienação fiduciária de imóvel e lance mínimo de metade do valor de avaliação no segundo leilão); Lei nº 4.728/1965, art. 66-B; Lei nº 11.101/2005, art. 49, § 3º",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l9514.htm",
  },
  {
    measure: "valor elegível = valor livre × (1 − haircut); valor livre = valor-base menos o saldo das obrigações que já oneram o ativo com prioridade anterior (D-19)",
    valueBasis: {
      property: "valor de mercado do laudo vigente (policy.structure.appraisal-validity); quando o laudo informa valor de liquidação forçada, usar o menor dos dois; nunca valor contábil nem custo de reposição",
      vehicles: "preço médio da Tabela Fipe do mês de referência para modelo e ano; veículo de uso profissional ou especial, fora da Tabela Fipe, por laudo",
      equipment: "valor de revenda no mercado secundário por laudo vigente ou cotação datada; máquina agrícola pela Tabela Fipe de máquinas agrícolas; nunca custo de aquisição",
      receivables: "saldo a vencer performado, líquido da diluição medida em 12 meses (devoluções, abatimentos, cancelamentos), de títulos vencidos, de sacados do mesmo grupo econômico, de títulos já cedidos ou onerados e do excesso sobre os limites de concentração",
      inventory: "menor entre custo e valor líquido realizável, pelo último relatório de monitoria independente",
      shares: "patrimônio líquido contábil da investida na última demonstração auditada ou revisada; se listada, o menor entre esse valor e o valor de mercado",
      financialInvestments: "valor de mercado na data (marcação a mercado)",
    },
    classes: [
      {id: "financial_investments", dealStructureClass: "financial", haircut: "0.05", allowedRange: ["0.00", "0.10"], eligibility: "títulos públicos federais, operações compromissadas lastreadas neles, CDB ou LCA de instituição dos segmentos S1 ou S2 e fundos DI com resgate em D+0 ou D+1, cedidos fiduciariamente e bloqueados em favor do credor"},
      {id: "receivables_card", dealStructureClass: "receivables", haircut: "0.15", allowedRange: ["0.10", "0.25"], eligibility: "recebíveis de arranjo de pagamento registrados em registradora autorizada, com trava do domicílio de liquidação em favor do credor"},
      {id: "receivables_performed_diversified", dealStructureClass: "receivables", haircut: "0.25", allowedRange: ["0.20", "0.30"], eligibility: "performados, com maior sacado até 10% e cinco maiores até 35% da carteira elegível, atraso acima de 30 dias até 5% da carteira e diluição medida em 12 meses"},
      {id: "receivables_performed_concentrated", dealStructureClass: "receivables", haircut: "0.40", allowedRange: ["0.30", "0.60"], eligibility: "performados fora dos limites de pulverização, ou com atraso acima de 30 dias entre 5% e 10% da carteira"},
      {id: "receivables_unperformed", dealStructureClass: "receivables", haircut: "1.00", exceptionFloor: "0.50", eligibility: "a performar não conta; exceção registrada só com medição ou entrega periódica auditável, histórico de performance do contrato e reserva"},
      {id: "property_urban_liquid", dealStructureClass: "property", haircut: "0.35", allowedRange: ["0.30", "0.45"], eligibility: "imóvel urbano residencial, comercial ou logístico de padrão de mercado, em capital ou região metropolitana, matrícula sem ônus anterior não quitado, laudo vigente, seguro com o credor beneficiário"},
      {id: "property_operational", dealStructureClass: "property", haircut: "0.45", allowedRange: ["0.40", "0.55"], eligibility: "imóvel operacional da própria companhia (planta, centro de distribuição) ou imóvel urbano fora de região metropolitana"},
      {id: "property_special_use_or_rural", dealStructureClass: "property", haircut: "0.55", allowedRange: ["0.50", "0.70"], eligibility: "imóvel de uso único, em praça de baixa liquidez, ou rural; a venda tende ao lance do segundo leilão, de no mínimo metade do valor de avaliação"},
      {id: "vehicles", dealStructureClass: "vehicles", haircut: "0.40", allowedRange: ["0.30", "0.50"], eligibility: "gravame anotado no certificado de registro do veículo, seguro com o credor beneficiário, idade compatível com o prazo da dívida"},
      {id: "equipment_standard", dealStructureClass: "equipment", haircut: "0.50", allowedRange: ["0.40", "0.60"], eligibility: "bem padronizado com mercado secundário (linha amarela, máquina agrícola, caminhão, empilhadeira), alienação fiduciária registrada, seguro endossado"},
      {id: "equipment_specific", dealStructureClass: "equipment", haircut: "0.80", allowedRange: ["0.70", "1.00"], eligibility: "bem customizado ou incorporado à planta, sem mercado secundário observável"},
      {id: "inventory_commodity_warehoused", dealStructureClass: "inventory", haircut: "0.40", allowedRange: ["0.30", "0.50"], eligibility: "commodity ou insumo padronizado em armazém de terceiro com CDA/WA ou monitoria independente e fiel depositário"},
      {id: "inventory_finished_goods", dealStructureClass: "inventory", haircut: "0.60", allowedRange: ["0.50", "0.70"], eligibility: "produto acabado de marca própria com monitoria independente e giro mínimo contratado"},
      {id: "inventory_perishable_or_fashion", dealStructureClass: "inventory", haircut: "1.00", eligibility: "perecível, moda ou estoque com sinal RF-01 ativo não conta"},
      {id: "shares_quotas", dealStructureClass: "shares", haircut: "0.60", allowedRange: ["0.50", "0.80"], maxShareOfPackage: "0.30", eligibility: "quotas ou ações da operadora com execução factível sob o acordo de acionistas e o estatuto; reforço, nunca lastro principal"},
      {id: "bank_guarantee", dealStructureClass: null, haircut: "0.05", allowedRange: ["0.00", "0.10"], eligibility: "fiança bancária de instituição dos segmentos S1 ou S2 com prazo igual ou maior que o da dívida, ou renovação obrigatória com antecedência mínima de 90 dias sob pena de vencimento"},
      {id: "surety_insurance", dealStructureClass: null, haircut: "0.15", allowedRange: ["0.10", "0.25"], eligibility: "seguro garantia sob a Circular SUSEP nº 662/2022, com vigência igual à da obrigação garantida e exclusões da apólice lidas e compatíveis"},
      {id: "personal_guarantee", dealStructureClass: "guarantee", haircut: "1.00", eligibility: "aval ou fiança de sócios alinha incentivo e não conta como cobertura"},
      {id: "unclassified", dealStructureClass: "other", haircut: "0.70", eligibility: "classe não reconhecida entra com o desconto de desconhecido até ser classificada"},
    ],
    downsideAdditionalHaircut: {
      receivables: "0.10",
      inventory: "0.15",
      shares: "0.20",
      equipment: "0.10",
      vehicles: "0.05",
      property: "0.05",
      financialInvestments: "0.00",
      bankGuarantee: "0.00",
      suretyInsurance: "0.05",
      rule: "no teste de downside do pacote (ES-20), somar o acréscimo ao haircut da classe; ativo pró-cíclico perde valor no mesmo cenário em que a garantia é executada",
    },
    rules: {
      perfection: "garantia sem constituição e registro no órgão competente (registro de imóveis, títulos e documentos, órgão de trânsito, registradora ou escriturador) conta zero até o registro, que vira condição precedente",
      doubleCounting: "o mesmo ativo ou fluxo conta uma vez; estoque e recebíveis do mesmo ciclo comercial contam pelo maior dos dois, salvo base de empréstimo que acompanhe a conversão de um no outro",
      concentration: "excesso sobre os limites de sacado sai do valor-base antes do haircut",
      essentialCapitalGoods: "bem de capital essencial à atividade recebe o haircut do limite superior da faixa da classe, porque a retirada fica suspensa durante o prazo de 180 dias, prorrogável uma vez, da recuperação judicial",
      secondLien: "alienação fiduciária da propriedade superveniente entra só como reforço, pelo valor residual depois da dívida garantida pela primeira",
      caseEvidence: "o haircut do caso só se afasta do padrão dentro da faixa, com evidência datada (diluição medida, laudo com valor de liquidação forçada, histórico de leilão); fora da faixa exige aprovação do dono do parâmetro",
      sharesRole: "quotas e ações somam no máximo 30% do valor pós-haircut do pacote",
    },
  },
);

const covenantHeadroom = proposal(
  "policy.structure.covenant_headroom",
  "fração do limite",
  {
    title: "Lei nº 6.404/1976, arts. 61, 68 e 71, e Resolução CVM nº 17/2021, arts. 11 e 12: cláusulas da escritura, fiscalização pelo agente fiduciário e quórum de modificação",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm",
  },
  {
    minimumRelativeHeadroomBase: "0.15",
    rule: "folga relativa sobre o limite aplicável no cenário base; abaixo disso, alerta no memo; nunca 'rompido' antes da medição; headroom só com definição, perímetro e data iguais",
    measure: "folga relativa do financial-core (calculateCovenantHeadroom): (limite − medido) ÷ limite para limite máximo; (medido − limite) ÷ limite para limite mínimo; comparação sobre operandos exatos, sem arredondar antes de comparar",
    existingCovenants: {
      minimumRelativeHeadroomBase: "0.15",
      minimumAbsoluteHeadroomLeverageTurns: "0.30",
      horizonMonths: 24,
      nearCovenantRule: "qualquer data de teste nos próximos 24 meses com folga base abaixo de 0,15 ou de 0,30x, ou com quebra no downside declarado, classifica a companhia como próxima do covenant e ativa curva de folga por contrato, teste reverso e liquidez de 12 e 24 meses",
      measurementPreconditions: "definição literal do contrato, perímetro, data de teste e degrau aplicável iguais aos da medição; comparação condicionada não produz folga",
    },
    proposedCovenants: {
      byMetric: [
        {metric: "net_debt_to_ebitda", direction: "maximum", minimumRelativeHeadroomBase: "0.25", minimumRelativeHeadroomDownside: "0.00", equivalentCushion: "o EBITDA pode cair 25% com a dívida constante antes de atingir o limite"},
        {metric: "dscr", direction: "minimum", minimumRelativeHeadroomBase: "0.25", minimumRelativeHeadroomDownside: "0.00", equivalentCushion: "o CFADS pode cair 20% (0,25 ÷ 1,25) antes de atingir o limite"},
        {metric: "interest_coverage", direction: "minimum", minimumRelativeHeadroomBase: "0.30", minimumRelativeHeadroomDownside: "0.00", equivalentCushion: "o EBITDA pode cair 23% (0,30 ÷ 1,30) antes de atingir o limite; a folga maior absorve alta do CDI sobre a dívida pós-fixada"},
      ],
      noDownsideBreachYears: 2,
      stepDown: "degraus anuais que acompanham a amortização do caso base e preservam a folga mínima em cada data de teste",
      definitions: "dívida pela ponte D-24, EBITDA pela régua Q-01, CFADS pela ponte Q-02 e convenção de arrendamentos declarada, no anexo de definições (ES-31)",
    },
    dealStructureMapping: {minimumCovenantHeadroom: "0.25"},
    precedence: "com policy.capacity.minimum_headroom, vale o mais restritivo; o contrato vigente governa o teste do próprio contrato",
  },
);

const leverageBands = proposal(
  "policy.structure.leverage-bands",
  "múltiplo (x) de dívida líquida ajustada sobre EBITDA mesa dos últimos 12 meses, pró-forma",
  {
    title: "S&P Global Ratings, Corporate Methodology (7 jan. 2024), tabelas 17 a 19: faixas de dívida/EBITDA por volatilidade setorial",
    url: "https://www.maalot.co.il/Publications/MT20240214173645.PDF",
  },
  {
    metric: "dívida líquida ajustada da visão de capacidade do ledger (D-24) ÷ EBITDA mesa dos últimos 12 meses (Q-01), pró-forma da operação (OP-03), com a mesma convenção de arrendamentos nos dois lados (D-08)",
    zones: ["confortável", "aceitável", "tensionada", "acima da banda"],
    zoneConsequences: {
      comfortable: "segue",
      acceptable: "segue com a justificativa padrão no memo",
      stretched: "segue só com mitigante nomeado (cobertura pós-haircut de 1,00x ou mais, step-down, amortização acelerada ou cash sweep) e registro no memo",
      aboveBand: "não segue sem uma das saídas de ES-40",
    },
    volatilityClasses: [
      {id: "low", spTable: "19", description: "receita regulada ou contratada de longo prazo com contraparte de crédito forte (transmissão, distribuição, saneamento com contrato, concessão com receita garantida)", comfortableMax: "3.0", acceptableMax: "4.0", stretchedMax: "5.0"},
      {id: "medial", spTable: "18", description: "demanda recorrente e estável (saúde, educação, varejo alimentar, serviços e software recorrentes com EBITDA positivo, logística contratada)", comfortableMax: "2.5", acceptableMax: "3.5", stretchedMax: "4.5"},
      {id: "standard", spTable: "17", description: "demais setores, inclusive indústria, varejo discricionário, construção, agro, commodities e incorporação", comfortableMax: "2.0", acceptableMax: "3.0", stretchedMax: "4.0"},
    ],
    adjustmentsTurns: [
      {condition: "EBITDA dos últimos 12 meses abaixo de R$ 50 milhões", turns: "-0.5"},
      {condition: "dívida na holding com caixa e ativos nas operadoras (subordinação estrutural, ES-38)", turns: "-0.5"},
      {condition: "EBITDA sem demonstração auditada do último exercício", turns: "-0.5"},
      {condition: "dívida sênior com cobertura pós-haircut de 1,00x ou mais (policy.structure.collateral-coverage)", turns: "0.5", appliesTo: ["acceptableMax", "stretchedMax"]},
    ],
    adjustmentBoundsTurns: {minimum: "-1.0", maximum: "0.5"},
    archetypeCap: "o limite superior da zona tensionada, depois dos ajustes, não passa do teto do arquétipo (leverageCeiling de archetypes.ts: expansão 3,5; capital de giro 2,5; refinanciamento 3,0; aquisição 4,0; equipamentos 3,0; outros 2,5); venture debt fica fora desta chave",
    notApplicable: ["venture_debt com EBITDA negativo", "project finance com receita contratada, dimensionado por DSCR (policy.structure.coverage-floors)"],
    interestRateContext: {
      cdiAnnual: "0.1365",
      cdiDate: "2026-09-22",
      source: "Banco Central do Brasil, SGS série 4389 (CDI anualizado base 252)",
      reading: "com o CDI a 13,65% a.a., 3,0x de dívida pós-fixada consomem 41% do EBITDA em juros antes de qualquer spread; a cobertura (policy.structure.coverage-floors) tende a limitar antes da alavancagem",
    },
    calibration: {
      status: "referência inicial da casa ancorada nas tabelas da S&P; ainda sem célula calibrada por observação de mercado",
      sourceHierarchy: ["escrituras e termos de emissão registrados na CVM (limites de covenant por emissor)", "demonstrações do emissor na CVM (DFP e ITR) na data da emissão", "relatórios públicos de agências de rating", "observações anonimizadas da Offroad (market.pricing.observation-registry)"],
      minimumDistinctIssuersPerCell: 5,
      refreshCadence: "trimestral",
      validityDays: 180,
      invalidation: "movimento de mais de 200 pontos-base no CDI desde a versão, ou revisão das tabelas da S&P",
    },
    observations: [
      {date: "2025-10-10", source: "Escritura da 15ª emissão de debêntures da Camil Alimentos S.A. (lastro do CRA 389 da Eco Securitizadora), cláusula 7.26.3", reading: "dívida líquida/EBITDA de até 3,50x enquanto vigente o CRA de referência e de até 4,00x no exercício seguinte à sua quitação; um emissor de volatilidade padrão, não amostra de mercado"},
    ],
  },
);

const coverageFloors = proposal(
  "policy.structure.coverage-floors",
  "múltiplo (x) de CFADS sobre serviço da dívida do período; ICR em múltiplo de EBITDA sobre juros pagos",
  {
    title: "BNDES Project Finance: Índice de Cobertura do Serviço da Dívida projetado de, no mínimo, 1,3 em cada ano da fase operacional",
    url: "https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/bndes-project-finance",
  },
  {
    definitions: {
      dscr: "CFADS do período ÷ (juros pagos + principal) do mesmo período; CFADS pela ponte Q-02 (EBITDA − impostos pagos − capex de manutenção ± variação do capital de giro); EBITDA nunca entra no numerador",
      icr: "EBITDA ÷ juros pagos em caixa no período; auxiliar quando o principal é bullet ou está em carência",
      binding: "o menor DSCR do cronograma decide; média não conta",
      periodicity: "período do cronograma proposto; em negócio sazonal, janelas móveis de 12 meses para o índice e teste mensal de caixa mínimo (ES-08)",
    },
    scenarios: {
      base: "caso Offroad adotado",
      downside: "caso banco declarado em policy.business_plan.scenarios",
      stress: "cenário combinado de receita e juros declarado",
    },
    byArchetype: [
      {archetype: "growth_expansion", minimumDscrDownside: "1.30", minimumDscrStress: "1.00", appliesFrom: "primeiro período depois da carência (obra, margem de atraso e ramp-up)"},
      {archetype: "working_capital", minimumDscrDownside: "1.20", minimumDscrStress: "1.00", appliesFrom: "empréstimo amortizável; linha rotativa usa teste de zeragem periódica em vez de DSCR"},
      {archetype: "refinance", minimumDscrDownside: "1.25", minimumDscrStress: "1.00", appliesFrom: "primeiro período do cronograma pró-forma"},
      {archetype: "acquisition", minimumDscrDownside: "1.35", minimumDscrStress: "1.00", appliesFrom: "combinado pró-forma sem sinergias não comprovadas"},
      {archetype: "equipment_finance", minimumDscrDownside: "1.25", minimumDscrStress: "1.00", appliesFrom: "primeiro período de amortização"},
      {archetype: "venture_debt", minimumDscrDownside: null, minimumDscrStress: null, appliesFrom: "não se aplica com EBITDA negativo; capacidade por caixa e pista, fora desta chave"},
      {archetype: "other", minimumDscrDownside: "1.30", minimumDscrStress: "1.00", appliesFrom: "primeiro período de amortização"},
    ],
    projectFinance: [
      {profile: "contracted_or_regulated_revenue", minimumDscrBase: "1.30", minimumDscrDownside: "1.10", minimumDscrStress: "1.00", appliesFrom: "cada ano da fase operacional"},
      {profile: "merchant_revenue", minimumDscrBase: "1.50", minimumDscrDownside: "1.20", minimumDscrStress: "1.00", appliesFrom: "cada ano da fase operacional"},
    ],
    interestCoverage: {
      appliesWhen: "principal bullet ou em carência",
      byVolatilityClass: [
        {volatilityClass: "standard", minimumIcrBase: "3.0", minimumIcrDownside: "2.0"},
        {volatilityClass: "medial", minimumIcrBase: "2.75", minimumIcrDownside: "1.75"},
        {volatilityClass: "low", minimumIcrBase: "2.5", minimumIcrDownside: "1.5"},
      ],
    },
    baseCaseRequirement: "no caso base, a exigência vem da folga de covenant: DSCR base mínimo ≥ piso de downside × 1,25 (policy.structure.covenant_headroom)",
    stressRule: "no estresse, DSCR abaixo de 1,00 só é aceito se o déficit do período for coberto por conta reserva constituída e por linha comprometida não sacada; dívida nova não conta",
    dealStructureMapping: {minimumDscr: "minimumDscrDownside do arquétipo"},
  },
);

const collateralCoverage = proposal(
  "policy.structure.collateral-coverage",
  "múltiplo (x) de valor pós-haircut sobre o saldo devedor",
  {
    title: "BNDES Project Finance: índice de 130% de garantias reais e as condições de sua dispensa",
    url: "https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/bndes-project-finance",
  },
  {
    metric: "soma dos valores pós-haircut (policy.structure.collateral_haircuts) das garantias constituídas e registradas, sem dupla contagem ÷ saldo devedor da operação, incluídos juros capitalizados",
    profiles: [
      {profile: "unsecured_corporate", minimumCoverage: null, rule: "crédito quirografário com negative pledge; cobertura não exigida"},
      {profile: "secured_corporate_reinforcement", minimumCoverage: "0.50", rule: "garantia como reforço de crédito com capacidade demonstrada: alavancagem até a zona aceitável e DSCR de downside acima do piso"},
      {profile: "secured_corporate_primary", minimumCoverage: "0.80", rule: "garantia como suporte principal: alavancagem na zona tensionada ou DSCR de downside até 0,10 acima do piso"},
      {profile: "asset_based", minimumCoverage: "1.00", rule: "operação dimensionada pelo ativo (recebíveis, estoque, equipamento financiado)"},
      {profile: "project_finance", minimumCoverage: null, rule: "cobertura substituída pelo pacote completo do projeto: ações, recebíveis, contas, direitos emergentes e assunção de controle"},
      {profile: "venture_debt", minimumCoverage: null, rule: "fora desta chave"},
    ],
    downsideMinimumCoverage: {profiles: ["secured_corporate_primary", "asset_based"], minimumCoverage: "0.80", rule: "com os acréscimos de haircut de downside da chave de haircuts"},
    excessCoverage: {threshold: "1.30", rule: "acima de 1,30x pós-haircut, a garantia excedente é capacidade futura consumida; propor liberação ou redução"},
    nominalEquivalent: "cobertura contratual nominal equivalente = cobertura pós-haircut ÷ (1 − haircut da classe); recebíveis pulverizados a 1,00x pós-haircut equivalem a 1,33x nominal (133% do saldo)",
    dealStructureMapping: {collateralPolicyVersion: version, minimumCollateralCoverage: "minimumCoverage do perfil do caso"},
  },
);

const appraisalValidity = proposal(
  "policy.structure.appraisal-validity",
  "meses de idade do laudo ou do relatório na data indicada; dias para dados de carteira e estoque",
  {
    title: "Lei nº 9.514/1997, art. 24, VI e parágrafo único, e art. 27, § 2º: valor do imóvel para leilão, critérios de revisão e lance mínimo de metade do valor de avaliação",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l9514.htm",
  },
  {
    byAssetClass: [
      {assetClass: "property_urban", standard: "ABNT NBR 14653-2", maxAgeMonthsAtIndicativeStructure: 12, maxAgeMonthsAtDisbursement: 6, revaluationEveryMonths: 24},
      {assetClass: "property_rural_or_special_use", standard: "ABNT NBR 14653-3 para rurais; NBR 14653-2 para urbanos de uso único", maxAgeMonthsAtIndicativeStructure: 12, maxAgeMonthsAtDisbursement: 6, revaluationEveryMonths: 12},
      {assetClass: "equipment", standard: "ABNT NBR 14653-5", maxAgeMonthsAtIndicativeStructure: 12, maxAgeMonthsAtDisbursement: 6, revaluationEveryMonths: 12},
      {assetClass: "vehicles_and_agricultural_machinery", standard: "Tabela Fipe do mês de referência", maxAgeMonthsAtIndicativeStructure: 1, maxAgeMonthsAtDisbursement: 1, revaluationEveryMonths: 1},
      {assetClass: "inventory", standard: "relatório de monitoria independente", maxAgeDays: 30},
      {assetClass: "receivables", standard: "carteira analítica com aging e base elegível", maxAgeDays: 30},
      {assetClass: "shares_quotas", standard: "última demonstração auditada ou revisada da investida", maxAgeMonthsAtIndicativeStructure: 6, maxAgeMonthsAtDisbursement: 6, revaluationEveryMonths: 12},
      {assetClass: "financial_investments", standard: "marcação a mercado", maxAgeDays: 1},
    ],
    independence: [
      "avaliador sem vínculo societário, de parentesco ou de remuneração variável com a companhia, seus controladores ou partes relacionadas",
      "remuneração fixa, sem honorário de êxito ligado à operação",
      "laudo de imóvel e de equipamento assinado por engenheiro ou arquiteto registrado, com ART ou RRT",
      "método declarado (comparativo para imóvel líquido, renda para imóvel gerador de renda, custo apenas para uso único com depreciação e obsolescência), com valor de mercado e, quando possível, valor de liquidação forçada",
      "laudo contratado pela companhia é aceito com essas condições; laudo de parte relacionada não conta (ES-13)",
    ],
    earlyRevaluationTriggers: ["cobertura pós-haircut a menos de 0,10x do mínimo de policy.structure.collateral-coverage", "queda acima de 10% no índice de preços de referência do ativo desde o laudo", "sinistro, embargo, penhora ou alteração de zoneamento", "pedido de substituição de garantia"],
    staleRule: "laudo além do prazo não conta no pacote; o ativo aparece como a laudar, com a atualização como condição precedente",
  },
);

export const structureProposals: ReferenceDataProposalFamily = {
  "policy.structure.collateral_haircuts": collateralHaircuts,
  "policy.structure.covenant_headroom": covenantHeadroom,
  "policy.structure.leverage-bands": leverageBands,
  "policy.structure.coverage-floors": coverageFloors,
  "policy.structure.collateral-coverage": collateralCoverage,
  "policy.structure.appraisal-validity": appraisalValidity,
};
