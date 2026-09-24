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

const maturityWall = proposal(
  "policy.structure.maturity_wall",
  "fração da dívida bruta",
  {
    title: "Pronunciamento Técnico CPC 40 (R1), item 39 e parágrafo B11C: análise de vencimentos de passivos financeiros e alocação no período mais próximo exigível",
    url: "https://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos/Pronunciamento?Id=71",
  },
  {
    shareOfGrossDebt: "0.20",
    comparator: "strictly_greater",
    attentionShareOfGrossDebt: "0.15",
    rule: "estritamente acima do limiar; igual ao limiar não é parede; denominador é a dívida bruta da nota",
    denominator: "dívida bruta da nota explicativa de empréstimos, financiamentos e debêntures, conciliada ao ledger (D-24), na mesma data-base, unidade e perímetro dos períodos",
    bucket: "período de 12 meses contado da data-base; quando a companhia reporta o cronograma por exercício ou safra, o período reportado",
    allocation: "obrigação exigível a critério do credor entra no primeiro período em que pode ser exigida; o cronograma contratual e o cronograma em cenário de quebra de covenant ficam separados e nunca se somam",
    adjustmentRows: "custos de transação a amortizar e outras linhas de ajuste sem data não formam período e não entram na participação",
    attentionRule: "período com participação acima de 0,15 e até 0,20 é nomeado no memo como concentração em observação, sem o rótulo de parede",
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

const repaymentDesign = proposal(
  "policy.structure.repayment-design",
  "regras de desenho; prazos em meses, participações em fração do principal e DSCR em múltiplo",
  {
    title: "Lei nº 12.431/2011, art. 1º, § 1º, e art. 2º, § 1º: prazo médio ponderado, periodicidade de rendimentos e vedação de resgate de debêntures incentivadas",
    url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12431.htm",
  },
  {
    governingTest: "DSCR de cada período no caso downside acima do piso de policy.structure.coverage-floors em todos os períodos (ES-05); formato que falha volta para ES-40",
    formats: [
      {format: "sac", useWhen: "o CFADS de downside do primeiro período de amortização cobre o serviço com o piso", reason: "menor juro total"},
      {format: "price", useWhen: "o SAC viola o piso nos primeiros períodos e o Price o respeita em todos", reason: "nivela o serviço no início"},
      {format: "sculpted", useWhen: "fluxo de projeto ou sazonal previsível; parcela desenhada para DSCR alvo constante", targetDscrBufferOverFloor: "0.10"},
      {format: "balloon", useWhen: "amortização regular com parcela final maior", maxBalloonShareWithoutNamedSource: "0.30", maxBalloonShareWithNamedSource: "0.50", aboveMaximum: "acima de 0,50 o balão segue as regras de bullet"},
      {format: "bullet", useWhen: "fonte de repagamento nomeada e evidenciada (venda de ativo com liquidez, emissão com mandato, caixa acumulado em conta travada)", requires: ["fonte nomeada e evidenciada no term sheet", "cash sweep ou conta travada ligada à fonte (ES-29)", "alavancagem projetada no vencimento, no downside, dentro da zona aceitável de policy.structure.leverage-bands", "ICR de policy.structure.coverage-floors atendido em todos os períodos"]},
    ],
    grace: {
      defaultInterest: "paid",
      principalGraceNonProjectMaxMonths: 12,
      principalGraceProjectRule: "carência ≥ prazo físico até a operação comercial + margem de policy.structure.construction-delay + ramp-up até o CFADS de downside cobrir o piso, arredondada para a próxima data de pagamento",
      capitalizedInterest: "somente com ramp-up documentado; tabela do saldo ano a ano obrigatória no term sheet; no máximo 24 meses de juros capitalizados; o saldo acrescido entra em alavancagem e covenants",
      prohibited: "capitalização escondida em carência total",
    },
    pik: {
      allowedWhen: ["ramp-up documentado de projeto", "mezanino ou venture debt com evento de pagamento datado"],
      requires: "saldo capitalizado período a período, covenant sobre o saldo acrescido e balão com fonte nomeada",
    },
    seasonality: {
      trigger: "policy.seasonality.materiality excedida",
      designs: ["parcelas concentradas no semestre forte", "parcela constante com conta reserva de policy.structure.reserve-account"],
      prohibited: "parcela constante sobre fluxo sazonal sem colchão de liquidez",
      covenantWindow: "índices de cobertura em janelas móveis de 12 meses",
    },
    tenor: {
      maxShareOfRemainingUsefulLife: "0.80",
      projectTailMinMonths: 24,
      merchantTailMinMonths: 36,
      tailDefinition: "meses entre o vencimento final da dívida e o fim da concessão, autorização ou contrato de venda que gera a receita",
    },
    paymentFrequency: {
      bankLoans: "mensal ou trimestral",
      capitalMarkets: "semestral ou anual, casada ao caixa",
      seasonal: "casada à safra ou ao ciclo",
    },
    instrumentConstraints: {
      incentivizedDebenture: {
        remuneration: "prefixada, vinculada a índice de preço ou à TR; vedada taxa pós-fixada",
        weightedAverageLifeYearsStrictlyAbove: "4",
        minimumIntervalBetweenInterestPaymentsDays: 180,
        noBuybackOrEarlyRedemptionYears: 2,
        earlyRedemptionException: "na forma regulamentada pelo Conselho Monetário Nacional",
        issuanceDeadline: "2030-12-31",
        source: "Lei nº 12.431/2011, art. 1º, § 1º, e art. 2º, § 1º; Lei nº 14.801/2024, art. 2º, § 5º, para debêntures de infraestrutura",
      },
    },
  },
);

const constructionDelay = proposal(
  "policy.structure.construction-delay",
  "meses de margem sobre o cronograma físico, com piso em meses e fração do cronograma",
  {
    title: "ANEEL, Relatório de Acompanhamento da Expansão da Oferta de Geração de Energia Elétrica (RALIE), dados abertos de 18/09/2026",
    url: "https://dadosabertos.aneel.gov.br/dataset/ralie-relatorio-de-acompanhamento-da-expansao-da-oferta-de-geracao-de-energia-eletrica",
  },
  {
    formula: "margem = maior entre marginMonthsFloor e arredondamento para cima de (marginShareOfSchedule × meses do cronograma físico até a operação comercial)",
    graceRule: "carência de principal ≥ cronograma físico + margem + ramp-up (policy.structure.repayment-design); carência menor é bloqueada (ES-09)",
    archetypes: [
      {id: "equipment_installation", description: "instalação de máquinas em planta existente, sem obra civil relevante nem licença nova", marginMonthsFloor: 2, marginShareOfSchedule: "0.20"},
      {id: "brownfield_expansion", description: "ampliação em sítio existente com licença de operação vigente e obra civil moderada", marginMonthsFloor: 4, marginShareOfSchedule: "0.25"},
      {id: "greenfield_building", description: "unidade nova (planta, centro de distribuição, loja, hospital, escola) com licença de instalação emitida e contrato de obra a preço e prazo", marginMonthsFloor: 6, marginShareOfSchedule: "0.30"},
      {id: "wind_or_solar_with_contracted_connection", description: "geração eólica ou solar com EPC a preço e prazo fechados, licença de instalação emitida e contrato de uso do sistema (CUST ou CUSD) assinado", marginMonthsFloor: 6, marginShareOfSchedule: "0.30"},
      {id: "hydro_thermal_linear_or_unconnected", description: "PCH, UHE, térmica, transmissão, saneamento, rodovia, ou geração sem conexão contratada: dependência de licenciamento, desapropriação ou acesso à rede", marginMonthsFloor: 12, marginShareOfSchedule: "0.50"},
      {id: "real_estate_development", description: "incorporação imobiliária com patrimônio de afetação", marginMonthsFloor: 6, marginShareOfSchedule: "0.25", legalAnchor: "Lei nº 4.591/1964, art. 43-A: entrega em até 180 dias após a data contratada sem resolução nem penalidade"},
    ],
    mitigantsWhenMarginDoesNotFit: ["garantia de conclusão dos acionistas até a operação comercial", "seguro garantia de execução com vigência igual à da obra (Circular SUSEP nº 662/2022)", "conta reserva de juros pré-constituída até a operação comercial mais a margem", "aporte antecipado do capital próprio antes do primeiro desembolso"],
    evidence: ["cronograma físico-financeiro do contrato de obra ou EPC", "estágio das licenças (Lei nº 15.190/2025, art. 5º)", "contrato de conexão quando houver", "relatório de engenheiro independente quando o desembolso for por marco (OP-08)"],
    dealStructureMapping: {constructionDelayMonths: "margem calculada para o arquétipo do caso, em meses inteiros"},
    observations: [
      {date: "2026-09-18", source: "ANEEL RALIE, usinas com obra em andamento e datas de operação comercial outorgada e prevista (138 usinas)", reading: "68,1% com previsão até meio mês da data outorgada; 73,2% até 6 meses; 75,4% até 12 meses; 87,7% até 18 meses; 91,3% até 24 meses. Até 6 meses: eólicas 92% (66), solares 59% (29), térmicas 64% (22), PCH 40% (20). Entre as atrasadas, atraso mediano de 14,5 meses"},
    ],
  },
);

const reserveAccount = proposal(
  "policy.structure.reserve-account",
  "meses de serviço da dívida programado (juros e principal)",
  {
    title: "Revista do BNDES, v. 7, n. 14, dez. 2000, p. 115: conta de reserva de caixa vinculada ao serviço da dívida em project finance",
    url: "https://web.bndes.gov.br/bib/jspui/bitstream/1408/13419/2/RB%2014%20Project%20Finance%20para%20a%20Ind%C3%BAstria_Estrutura%C3%A7%C3%A3o%20de%20Financiamento_P_BD.pdf",
  },
  {
    sizingBasis: "serviço da dívida programado (juros + principal) dos próximos N meses do cronograma, no caso base; em pagamento semestral, a próxima parcela",
    profiles: [
      {profile: "seasonal", required: true, months: 3, rule: "o maior entre 3 meses de serviço e a soma das parcelas que vencem na estação fraca"},
      {profile: "project_ramp_up", required: true, months: 6, rule: "6 meses de serviço, ou a próxima parcela semestral, a partir da operação comercial"},
      {profile: "project_finance_operational", required: true, months: 6, rule: "6 meses de serviço, ou a próxima parcela semestral"},
      {profile: "receivables_backed_monthly", required: true, months: 1, rule: "1 parcela mensal, para absorver o descasamento entre liquidação da carteira e vencimento"},
      {profile: "acquisition_stretched_leverage", required: true, months: 3, rule: "enquanto a alavancagem estiver na zona tensionada de policy.structure.leverage-bands"},
      {profile: "corporate_stable", required: false, months: 0, rule: "não exigida; se negociada, até 3 meses"},
      {profile: "venture_debt", required: false, months: 0, rule: "fora desta chave; caixa mínimo e pista são tratados como covenant próprio"},
    ],
    constructionInterestReserve: "quando os juros são pagos durante a obra, reserva de juros até a operação comercial mais a margem de policy.structure.construction-delay, constituída no primeiro desembolso",
    funding: {
      preferred: "no desembolso, deduzida dos recursos",
      alternative: "retenção de caixa antes de qualquer distribuição, completa em até 6 meses do desembolso",
      substitution: "fiança bancária ou seguro garantia do mesmo valor, nas condições de policy.structure.collateral_haircuts",
    },
    replenishment: {
      businessDays: 40,
      rule: "reposição com o primeiro caixa disponível na cascata, no prazo de 40 dias úteis após o uso",
      whileBelowTarget: "trava de dividendos, juros sobre capital próprio, mútuos e pagamentos a partes relacionadas (ES-25)",
      failure: "não reposição no prazo é evento de inadimplemento com o tratamento de policy.structure.cure-waiver",
    },
    permittedInvestments: "títulos públicos federais, compromissadas lastreadas neles, CDB de instituição dos segmentos S1 ou S2 e fundos DI com resgate em D+0 ou D+1, cedidos fiduciariamente ao credor",
    carryCost: "custo de carregamento = saldo da reserva × (custo all-in da dívida − rendimento da aplicação), somado ao all-in (PR-10)",
    dealStructureMapping: {reserveMonths: "months do perfil do caso, como texto decimal"},
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

const maturityConcentration = proposal(
  "policy.structure.maturity-concentration",
  "fração da dívida consolidada pró-forma por período de 12 meses",
  {
    title: "Pronunciamento Técnico CPC 40 (R1), item 39 e parágrafo B11C: análise de vencimentos de passivos financeiros",
    url: "https://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos/Pronunciamento?Id=71",
  },
  {
    maxShareOfConsolidatedDebtPerPeriod: "0.20",
    comparator: "less_than_or_equal",
    attentionShare: "0.15",
    base: "principal existente (ledger D-24, cronograma de D-03) somado ao principal da operação proposta, por período de 12 meses contado da data-base",
    rules: {
      absolute: "nenhum período do perfil consolidado pró-forma acima de 0,20 da dívida consolidada",
      noWorsening: "período que já estava acima de 0,20 antes da operação passa se a operação não somar principal a ele e a sua participação pró-forma cair",
      newBulletPlacement: "bullet ou balão da operação nova não vence em período cuja participação pró-forma supere 0,15",
      consistency: "o limite de desenho coincide com o limiar de parede de policy.structure.maturity_wall: a casa não propõe estrutura que o próprio diagnóstico chamaria de parede",
    },
    notApplicable: ["SPE com dívida única de amortização esculpida, testada por DSCR", "venture debt de facilidade única, testada por caixa e pista"],
    dealStructureMapping: {maturityConcentrationLimit: "0.20"},
  },
);

export const structureProposals: ReferenceDataProposalFamily = {
  "policy.structure.collateral_haircuts": collateralHaircuts,
  "policy.structure.maturity_wall": maturityWall,
  "policy.structure.covenant_headroom": covenantHeadroom,
  "policy.structure.leverage-bands": leverageBands,
  "policy.structure.coverage-floors": coverageFloors,
  "policy.structure.repayment-design": repaymentDesign,
  "policy.structure.construction-delay": constructionDelay,
  "policy.structure.reserve-account": reserveAccount,
  "policy.structure.collateral-coverage": collateralCoverage,
  "policy.structure.appraisal-validity": appraisalValidity,
  "policy.structure.maturity-concentration": maturityConcentration,
};
