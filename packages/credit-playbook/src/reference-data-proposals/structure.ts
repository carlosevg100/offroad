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
      {id: "receivables_performed_diversified", dealStructureClass: "receivables", haircut: "0.25", allowedRange: ["0.20", "0.30"], eligibility: "performados, com sacados dentro dos tetos por devedor e por grupo de carteira diversificada de policy.concentration.materiality, cinco maiores até 35% da carteira elegível, atraso acima de 30 dias até 5% da carteira e diluição medida em 12 meses"},
      {id: "receivables_performed_concentrated", dealStructureClass: "receivables", haircut: "0.40", allowedRange: ["0.30", "0.60"], eligibility: "performados fora dos limites de pulverização, ou com atraso acima de 30 dias entre 5% e 10% da carteira"},
      {id: "receivables_unperformed", dealStructureClass: "receivables", haircut: "1.00", exceptionFloor: "0.50", eligibility: "a performar não conta; exceção registrada só com medição ou entrega periódica auditável, histórico de performance do contrato e reserva"},
      {id: "property_urban_liquid", dealStructureClass: "property", haircut: "0.35", allowedRange: ["0.30", "0.45"], eligibility: "imóvel urbano residencial, comercial ou logístico de padrão de mercado, em capital ou região metropolitana, laudo vigente, seguro com o credor beneficiário; ônus anterior sai do valor-base pelo valor livre"},
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
      precedence: "desconto pactuado em contrato vigente governa aquele contrato quando é mais conservador; a análise da Offroad usa esta tabela",
      scope: "toda garantia considerada em ES-11 a ES-20, em qualquer arquétipo e rota; não se aplica ao pacote de projeto em estrutura segregada (ES-21), medido por policy.structure.collateral-coverage",
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
    comparisonPrecisionDecimals: 8,
    horizonYears: 5,
    numerator: "principal que vence no período",
    riskBandsKey: "policy.debt.maturity-concentration",
    rule: "estritamente acima do limiar; igual ao limiar não é parede; denominador é a dívida bruta da nota",
    denominator: "dívida bruta da nota explicativa de empréstimos, financiamentos e debêntures, conciliada ao ledger (D-24), na mesma data-base, unidade e perímetro dos períodos",
    bucket: "período de 12 meses contado da data-base; quando a companhia reporta o cronograma por exercício ou safra, o período reportado",
    allocation: "obrigação exigível a critério do credor entra no primeiro período em que pode ser exigida; o cronograma contratual e o cronograma em cenário de quebra de covenant ficam separados e nunca se somam",
    adjustmentRows: "custos de transação a amortizar e outras linhas de ajuste sem data não formam período e não entram na participação",
  },
);

const covenantHeadroom = proposal(
  "policy.structure.covenant_headroom",
  "fração do limite; múltiplo (x) na folga absoluta de alavancagem",
  {
    title: "Lei nº 6.404/1976, arts. 61, 68 e 71, e Resolução CVM nº 17/2021, arts. 11 e 12: cláusulas da escritura, fiscalização pelo agente fiduciário e quórum de modificação",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm",
  },
  {
    minimumRelativeHeadroomBase: "0.15",
    rule: "folga relativa sobre o limite aplicável no cenário base; abaixo de 0,15, ou de 0,30x em alavancagem, alerta no memo; nunca 'rompido' antes da medição; headroom só com definição, perímetro e data iguais",
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
    metric: "dívida líquida ajustada da visão de capacidade do ledger (D-24), com risco sacado quando financiamento em substância, ÷ EBITDA mesa dos últimos 12 meses (Q-01), pró-forma da operação (OP-03), com a mesma convenção de arrendamentos nos dois lados (D-08)",
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
    volatilityClassSource: "lente setorial (EMP-21 a EMP-30), declarada no memo com o motivo",
    precedence: "ES-03 publica o menor teto entre alavancagem, DSCR de downside, garantia e covenant vigente; a banda não substitui nenhum deles",
    archetypeCap: "o limite superior da zona tensionada, depois dos ajustes, não passa do teto do arquétipo (leverageCeiling de archetypes.ts: expansão 3,5; capital de giro 2,5; refinanciamento 3,0; aquisição 4,0; equipamentos 3,0; outros 2,5); venture debt fica fora desta chave",
    notApplicable: ["venture_debt, com qualquer EBITDA: leverageCeiling 0 em archetypes.ts; dimensionado por caixa e pista", "project finance com receita contratada, dimensionado por DSCR (policy.structure.coverage-floors)"],
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
      dscr: "CFADS do período ÷ (juros pagos + principal) do mesmo período; CFADS da ponte de policy.cash-flow.bridge (Q-02); EBITDA nunca entra no numerador",
      icr: "EBITDA ÷ juros pagos em caixa no período; auxiliar quando o principal é bullet ou está em carência",
      binding: "o menor DSCR do cronograma decide; média não conta",
      periodicity: "período do cronograma proposto; com receita de sazonalidade moderada ou alta pela régua de policy.seasonality.materiality, janelas móveis de 12 meses para o índice; com sazonalidade alta, teste mensal de caixa mínimo (ES-08)",
    },
    scenarios: {
      base: "base de policy.business_plan.scenarios (caso Offroad adotado)",
      downside: "downside de policy.business_plan.scenarios (caso do banco)",
      stress: "severe de policy.business_plan.scenarios, combinado com o severe de scenario.market.multi-factor",
    },
    byArchetype: [
      {archetype: "growth_expansion", minimumDscrDownside: "1.30", minimumDscrStress: "1.00", appliesFrom: "primeiro período depois da carência (obra, margem de atraso e ramp-up)"},
      {archetype: "working_capital", minimumDscrDownside: "1.20", minimumDscrStress: "1.00", appliesFrom: "empréstimo amortizável; linha rotativa usa teste de zeragem periódica em vez de DSCR"},
      {archetype: "refinance", minimumDscrDownside: "1.25", minimumDscrStress: "1.00", appliesFrom: "primeiro período depois da carência do cronograma pró-forma; na carência vale o ICR auxiliar"},
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
    baseCaseRequirement: "no caso base corporativo (fora do project finance, que tem piso de base próprio), a exigência vem da folga de covenant: DSCR base mínimo ≥ piso de downside × 1,25 (policy.structure.covenant_headroom)",
    stressRule: "no estresse, DSCR abaixo de 1,00 só é aceito se o déficit do período for coberto por conta reserva constituída e por linha comprometida não sacada; dívida nova e rolagem não contam",
    dealStructureMapping: {minimumDscr: "minimumDscrDownside do arquétipo"},
  },
);

const repaymentDesign = proposal(
  "policy.structure.repayment-design",
  "regras de desenho; prazos em meses, anos ou dias conforme o campo; participações em fração do principal ou da vida útil; DSCR em múltiplo",
  {
    title: "Lei nº 12.431/2011, art. 1º, § 1º, e art. 2º, § 1º: prazo médio ponderado, periodicidade de rendimentos e vedação de resgate de debêntures incentivadas",
    url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12431.htm",
  },
  {
    governingTest: "DSCR de cada período no caso downside acima do piso de policy.structure.coverage-floors em todos os períodos (ES-05); formato que falha volta para ES-40",
    formatOrder: "a ordem dos formatos abaixo é a ordem de preferência: SAC, Price, esculpido, balão e bullet",
    newProfileTest: "o cronograma proposto, somado ao existente, passa em policy.structure.maturity-concentration antes do term sheet (ES-10)",
    precedence: "a restrição legal do instrumento prevalece sobre a preferência de formato; o contrato vigente governa o cronograma já contratado",
    formats: [
      {format: "sac", useWhen: "o CFADS de downside do primeiro período de amortização cobre o serviço com o piso", reason: "menor juro total"},
      {format: "price", useWhen: "o SAC viola o piso nos primeiros períodos e o Price o respeita em todos", reason: "nivela o serviço no início"},
      {format: "sculpted", useWhen: "fluxo de projeto ou sazonal previsível; parcela desenhada para DSCR alvo constante", targetDscrBufferOverFloor: "0.10"},
      {format: "balloon", useWhen: "amortização regular com parcela final maior", maxBalloonShareWithoutNamedSource: "0.30", maxBalloonShareWithNamedSource: "0.50", aboveWithoutSourceRequires: ["fonte nomeada", "cash sweep"], aboveMaximum: "acima de 0,50 o balão segue as regras de bullet"},
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
      prohibited: "parcela constante sem mecanismo de liquidez, nas condições de policy.seasonality.materiality",
      covenantWindow: "índices de cobertura em janelas móveis de 12 meses",
    },
    tenor: {
      assetLifeLimit: {key: "policy.capex.maintenance", field: "tenorVsEconomicLife", rule: "vencimento final dentro do limite de vida econômica remanescente do ativo principal financiado (EMP-19)"},
      contractedRevenueTailMinMonths: 24,
      merchantTailMinMonths: 36,
      tailDefinition: "meses entre o vencimento final da dívida e o fim da concessão, autorização ou contrato de venda que gera a receita",
    },
    paymentFrequency: {
      bankLoans: "mensal ou trimestral",
      capitalMarkets: "semestral ou anual, casada ao caixa",
      seasonal: "casada à safra ou ao ciclo",
    },
    instrumentConstraints: {
      incentivizedAndInfrastructureDebentures: {
        termsKey: "market.instrument.eligibility",
        instrumentIds: ["debenture_incentivized", "debenture_infrastructure"],
        rule: "o cronograma respeita os termos obrigatórios daquela chave: remuneração, prazo médio ponderado, intervalo entre pagamentos de rendimentos, vedação de recompra e de liquidação antecipada e prazo de emissão",
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
    escalation: "sem contrato de obra a preço e prazo, ou sem licença de instalação, o caso sobe para hydro_thermal_linear_or_unconnected (12 meses e 0,50)",
    mitigantsRequired: "ao menos um da lista, quando o cronograma da operação não comporta a margem",
    duringConstructionCovenant: "conclusão física (marco até data, atestado independente), não financeiro",
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
    treatment: {excludedFrom: ["CFADS", "liquidez disponível"], stressTest: "entra no teste de estresse de policy.structure.coverage-floors, que aceita cobrir déficit com reserva constituída"},
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
    nominalEquivalent: "cobertura contratual nominal equivalente = cobertura pós-haircut ÷ (1 − haircut da classe); recebíveis pulverizados a 1,00x pós-haircut equivalem a 1,33x nominal (133% do saldo); imóvel urbano líquido a 0,80x equivale a 1,23x do laudo",
    belowMinimum: "alternativas de ES-40 (outro ativo, ticket menor, garantia de terceiro)",
    precedence: "cobertura pactuada em contrato vigente governa aquele contrato; o teste da Offroad é sempre pós-haircut",
    dealStructureMapping: {collateralPolicyVersion: version, minimumCollateralCoverage: "minimumCoverage do perfil do caso"},
  },
);

const appraisalValidity = proposal(
  "policy.structure.appraisal-validity",
  "meses de idade do laudo ou do relatório na data indicada; dias para carteira, estoque e aplicações financeiras",
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
    newBulletPlacementMaxShare: "0.15",
    riskBandsKey: "policy.debt.maturity-concentration",
    base: "principal existente (ledger D-24, cronograma de D-03) somado ao principal da operação proposta, por período de 12 meses contado da data-base, na mesma unidade e perímetro",
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

const crossDefaultThreshold = proposal(
  "policy.structure.cross-default-threshold",
  "reais (BRL); percentuais em fração do patrimônio líquido e do EBITDA consolidados",
  {
    title: "Lei nº 6.404/1976, art. 61: direitos, garantias e demais cláusulas ou condições da escritura de emissão",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm",
  },
  {
    formula: "limiar = maior entre (piso da faixa de porte, 0,03 × patrimônio líquido consolidado, 0,05 × EBITDA consolidado dos últimos 12 meses), pelas últimas demonstrações auditadas ou revisadas",
    equityShare: "0.03",
    ebitdaShare: "0.05",
    floorsByEbitdaBand: [
      {ebitdaLtmUpToBRL: "50000000", floorBRL: "1000000"},
      {ebitdaLtmUpToBRL: "200000000", floorBRL: "5000000"},
      {ebitdaLtmUpToBRL: "1000000000", floorBRL: "20000000"},
      {ebitdaLtmUpToBRL: null, floorBRL: "50000000"},
    ],
    negativeOrZeroEbitda: "piso da primeira faixa ou 5% do valor da operação, o maior",
    indexation: "pisos em reais corrigidos anualmente pelo IPCA a partir da data de emissão",
    recalculation: "percentuais sobre patrimônio líquido e EBITDA recalculados a cada demonstração anual; piso em reais fixado na emissão pela faixa de porte daquela data, sem troca de faixa depois",
    aggregation: "valor individual ou agregado",
    scope: {
      entities: {key: "policy.structure.acceleration-events", field: "perimeter", rule: "emissora, garantidoras e subsidiárias relevantes pela definição daquela chave"},
      obligations: "empréstimos, financiamentos e títulos de dívida e de mercado de capitais, derivativos pelo valor de liquidação e dívida de terceiro garantida pela emissora, garantidoras ou subsidiárias relevantes",
      excluded: ["obrigação discutida de boa-fé com exigibilidade suspensa ou garantida em juízo", "fornecedores no curso normal dos negócios", "tributos em parcelamento adimplente", "dívida sem recurso de SPE não garantida pelo grupo"],
    },
    events: {
      key: "policy.structure.acceleration-events",
      eventIds: ["cross_acceleration", "cross_default", "protests", "judgments"],
      rule: "o limiar e o escopo desta chave valem para esses quatro eventos; modo, gatilho e janela de cada um são daquela chave",
    },
    reverseTest: "a dívida nova entra na base dos cross-defaults dos contratos vigentes: quando o valor dela supera o limiar desses contratos, a cascata consolidada de D-29 é refeita antes do term sheet",
    observations: [
      {date: "2025-10-10", source: "Escritura da 15ª emissão de debêntures da Camil Alimentos S.A., cláusula 7.26.3, itens IV a VII", reading: "R$ 90 milhões individual ou agregado, e depois da quitação do CRA de referência o maior entre R$ 120 milhões e 3% do patrimônio líquido, para vencimento antecipado cruzado, inadimplemento, protesto e condenação; um emissor de grande porte, não amostra de mercado"},
    ],
  },
);

const reportingCadence = proposal(
  "policy.structure.reporting-cadence",
  "dias corridos, dias úteis ou meses, indicados em cada campo",
  {
    title: "Resolução CVM nº 80/2022, arts. 30 e 31 (DFP em até 3 meses do fim do exercício e ITR em até 45 dias do fim do trimestre)",
    url: "https://conteudo.cvm.gov.br/legislacao/resolucoes/resol080.html",
  },
  {
    deadlineRule: "prazo proposto = maior entre o prazo regulatório aplicável e o tempo de fechamento medido (EMP-16) mais a folga da capacidade, limitado ao teto da capacidade; obrigação que a companhia não cumpre no próprio histórico não entra",
    capabilities: [
      {id: "A", description: "companhia aberta registrada na CVM", quarterlyStatementsDays: 45, auditedAnnualStatementsMonths: 3, covenantCertificateBusinessDays: 5, closeBufferDays: 0, basis: "Resolução CVM nº 80/2022, arts. 30 e 31; certificado de covenant em 5 dias úteis depois das demonstrações (a escritura de referência pede a memória de cálculo junto das demonstrações)"},
      {id: "B", description: "companhia fechada ou limitada com demonstrações anuais auditadas e fechamento mensal em até 30 dias", quarterlyStatementsDays: 60, auditedAnnualStatementsMonths: 4, auditedAnnualStatementsMonthsWhenTraded: 3, covenantCertificateBusinessDays: 10, closeBufferDays: 20, basis: "Lei nº 6.404/1976, art. 132, e Resolução CVM nº 160/2022, art. 89, IV, quando o título é negociado em mercado regulamentado"},
      {id: "C", description: "sem histórico de auditoria ou com fechamento mensal acima de 30 dias", quarterlyStatementsDays: 75, auditedAnnualStatementsMonths: 5, covenantCertificateBusinessDays: 15, closeBufferDays: 30, firstAuditRequirement: "primeiras demonstrações anuais auditadas do exercício corrente como obrigação datada"},
    ],
    observations: [
      {date: "2025-10-10", source: "Escritura da 15ª emissão de debêntures da Camil Alimentos S.A., obrigações adicionais da emissora", reading: "demonstrações anuais auditadas em até 3 meses do fim do exercício, com memória de cálculo dos índices financeiros; ITR com revisão especial em até 45 dias dos três primeiros trimestres; aviso de evento de vencimento antecipado em até 1 dia útil"},
    ],
    regulatoryPrecedence: "prazo regulatório mais curto que o proposto continua valendo por força própria; o contrato nunca propõe prazo menor que o regulatório",
    firstDeliveryException: "a primeira entrega depois do desembolso pode ter prazo maior se o fechamento em curso já estiver atrasado na data da assinatura, com a data escrita",
    monthlyAssetReporting: {appliesTo: "estrutura com base de empréstimo, cessão fiduciária de recebíveis ou estoque monitorado", businessDaysAfterMonthEnd: 10, content: "carteira analítica, aging, diluição, base elegível e cobertura"},
    eventNotices: {
      defaultOrPotentialDefaultBusinessDays: 2,
      defaultNoticeAcceptableMinimumBusinessDays: 1,
      materialLitigationAboveCrossDefaultThresholdBusinessDays: 5,
      changeOfControl: "comunicação prévia à efetivação",
      publicCompanies: "fato relevante na forma da Resolução CVM nº 44/2021",
    },
    covenantCertificateContent: "índices na definição do contrato, memória de cálculo com as rubricas, reconciliação com as demonstrações e declaração de ausência de evento de inadimplemento, assinada por diretor estatutário",
  },
);

const cureWaiver = proposal(
  "policy.structure.cure-waiver",
  "dias úteis ou corridos indicados em cada campo; número de usos; cobertura do livro em múltiplo (x); quóruns em fração dos títulos",
  {
    title: "Lei nº 6.404/1976, arts. 71 e 124, e Resolução CVM nº 17/2021, art. 12, § 2º: convocação de assembleia e maioria absoluta para modificar condições ou deixar de adotar medida",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm",
  },
  {
    cureMatrix: [
      {event: "payment_default", curePeriodBusinessDays: 2, acceptableMinimumBusinessDays: 1, rule: "principal ou juros; falha operacional comprovada de sistema de pagamento conta o prazo a partir da correção"},
      {event: "non_monetary_obligation", curePeriodCalendarDays: 30, acceptableMinimumCalendarDays: 10, startsFrom: "notificação do credor ou do agente fiduciário", rule: "não se aplica à obrigação com prazo específico próprio"},
      {event: "information_delivery", curePeriodCalendarDays: 30, startsFrom: "fim do prazo de entrega", rule: "segundo atraso no mesmo exercício reduz a cura a 10 dias"},
      {event: "misrepresentation", curePeriodCalendarDays: 15, startsFrom: "comunicação da inexatidão", rule: "declaração incorreta ou incompleta em aspecto relevante; declaração comprovadamente falsa é evento automático de policy.structure.acceleration-events, sem cura"},
      {event: "security_deterioration", curePeriodBusinessDays: 20, startsFrom: "notificação", rule: "reforço ou substituição de garantia até a cobertura mínima de policy.structure.collateral-coverage"},
      {event: "reserve_account_shortfall", cureKey: "policy.structure.reserve-account", cureField: "replenishment.businessDays", startsFrom: "uso da reserva", rule: "a cura é a reposição no prazo de policy.structure.reserve-account, com a trava de distribuição daquela chave enquanto abaixo do alvo"},
      {event: "financial_covenant_breach", cureMechanism: "equity cure", rule: "ver equityCure"},
    ],
    automaticEventsHaveNoCure: "a cura não se aplica a evento que a lei declara vencimento automático",
    equityCure: {
      maxUsesPerFourConsecutiveTests: 2,
      maxUsesLifetime: 4,
      consecutiveUsesAllowed: false,
      contributionDeadlineBusinessDays: 20,
      form: "aumento de capital ou mútuo de sócio subordinado, sem juros em caixa nem vencimento antes da dívida",
      application: "valor aplicado na redução da dívida líquida (pré-pagamento ou depósito em conta travada), nunca somado ao EBITDA",
      overcure: "limitado ao valor que restabelece o índice",
      annualTests: "covenant apurado apenas anualmente admite 1 uso em 2 exercícios consecutivos, 2 na vida da operação",
    },
    accelerationMechanics: {
      eventsAndDeclarationKey: "policy.structure.acceleration-events",
      houseDefault: "declared_unless_assembly_waives",
      rule: "eventos, modo automático ou não automático e mecânica de declaração são os de policy.structure.acceleration-events, padrão da casa no term sheet indicativo; esta chave não os repete",
      negotiationLever: {
        mechanic: "declared_only_by_assembly",
        rule: "declaração do vencimento apenas por deliberação dos credores; falta de quórum não declara vencimento",
        offeredOnlyWhen: [
          {id: "book_coverage", rule: "livro coberto em pelo menos 1,5 vez à taxa indicativa", minimumBookCoverageMultiple: "1.5"},
          {id: "national_scale_investment_grade", rule: "rating de grau de investimento em escala nacional"},
        ],
        evidence: "a condição de demanda comprovada no caso, com a evidência anexada; sem ela, vale a mecânica padrão",
      },
    },
    waiverProcess: {
      debentures: {
        quorum: "maioria absoluta das debêntures em circulação, em qualquer convocação: o mínimo da Lei nº 6.404/1976, art. 71, § 5º, e da Resolução CVM nº 17/2021, art. 12, § 2º",
      },
      commercialNotes: {
        quorum: "maioria simples das notas comerciais em circulação presentes na assembleia, salvo quórum maior no termo de emissão (Lei nº 14.195/2021, art. 47, § 2º)",
        houseDefault: "o piso legal, do lado da companhia",
        withTrustee: "com agente fiduciário nomeado para oferta pública ou negociação em mercado organizado, maioria absoluta dos títulos em circulação (Resolução CVM nº 17/2021, arts. 1º e 12, § 2º)",
      },
      assemblyRules: {key: "policy.structure.acceleration-events", field: "declarationProcedure.nonAutomatic", rule: "convocação e instalação das assembleias de debenturistas e de titulares de notas comerciais (Lei nº 14.195/2021, art. 47, § 3º)"},
      securitization: {
        quorum: "50% mais um dos títulos em circulação em primeira convocação; em segunda, 50% mais um dos presentes, com presença mínima de 30% dos títulos em circulação",
        legalMinimum: "a Resolução CVM nº 60/2021, arts. 28 e 30, admite instalação com qualquer número e maioria dos presentes, salvo quórum distinto no instrumento",
        noticeDays: {firstCall: 21, secondCall: 8},
      },
      entrenchedMatters: {
        matters: "remuneração, amortização, datas de pagamento, vencimento, eventos de vencimento antecipado e quóruns",
        maxQualifiedQuorumShareOfOutstanding: "0.70",
        rule: "a casa aceita quórum qualificado de até 70% dos títulos em circulação nessas matérias e recusa quórum qualificado para o waiver de covenant financeiro",
      },
      bilateral: {responseBusinessDays: 10, rule: "resposta do credor em até 10 dias úteis do pedido completo; silêncio não é consentimento"},
      standstill: "durante o prazo de cura, o credor não declara vencimento pelo mesmo evento",
    },
    observations: [
      {date: "2025-10-10", source: "Escritura da 15ª emissão de debêntures da Camil Alimentos S.A., cláusula 7.26", reading: "cura de 1 dia útil para obrigação pecuniária, com vencimento automático; 10 dias para obrigação não pecuniária; 15 dias para declaração inexata; evento não automático vence salvo deliberação contrária, e falta de quórum em segunda convocação leva à declaração"},
      {date: "2025-10-10", source: "Termo de securitização do CRA 389 da Eco Securitizadora (devedora Camil Alimentos S.A.), cláusulas 17.6.6 a 17.9.3", reading: "convocação com 21 dias em primeira e 8 dias em segunda; waiver por 50% mais um dos CRA em circulação em primeira convocação, ou por 50% mais um dos presentes com 30% presentes em segunda; 70% para remuneração, amortização, datas, vencimento e eventos de vencimento"},
    ],
  },
);

const minimumSellable = proposal(
  "policy.structure.minimum-sellable",
  "reais (BRL); orçamento de complexidade em fração ao ano do valor da operação; prazos em semanas",
  {
    title: "Resolução CVM nº 160/2022 (rito de registro automático para investidores profissionais) e Lei nº 7.940/1989, Anexo IV, na redação da Lei nº 14.317/2022 (taxa de fiscalização da CVM sobre oferta pública)",
    url: "https://conteudo.cvm.gov.br/legislacao/resolucoes/resol160.html",
  },
  {
    rule: "escolher a rota mais simples que cumpre, ao mesmo tempo, elegibilidade, orçamento de complexidade, prazo até a necessidade e cobertura de compradores confirmados; comparar o all-in dessa rota com o da alternativa sofisticada (ES-41)",
    complexityBudget: {
      maxFixedCostShareOfTicketPerYear: "0.0040",
      formula: "custo fixo anualizado = custo fixo inicial ÷ vida média em anos + custo fixo anual; ticket mínimo da rota = custo fixo anualizado ÷ 0,0040",
      inputs: "cotações datadas dos prestadores do caso (assessores jurídicos, agente fiduciário, escriturador, registradora, rating, auditoria da estrutura); cotação com mais de 90 dias é refeita",
      publicFees: {key: "policy.pricing.cost-catalogue", field: "publicTables"},
    },
    executionWeeks: {key: "policy.structure.route-catalogue", field: "routes.referenceWeeks", rule: "o prazo de referência de cada rota é o do catálogo, pelos identificadores de routeCatalogueIds"},
    distributedCoverage: {key: "policy.structure.mandate-ticket", field: "transactionRange.requiredCoverage"},
    routes: [
      {route: "bilateral_bank", routeCatalogueIds: ["ccb_bank", "export_credit_note"], instruments: ["CCB", "NCE", "CCE"], issuerForm: "qualquer; a CCB é emitida em favor de instituição financeira (Lei nº 10.931/2004, art. 26)", houseReferenceMinTicketBRL: null, buyerCoverageRule: "um credor nomeado com mandato confirmado para o ticket inteiro"},
      {route: "commercial_note", routeCatalogueIds: ["commercial_note"], instruments: ["nota comercial"], issuerForm: "sociedade anônima, limitada ou cooperativa (Lei nº 14.195/2021, art. 46)", houseReferenceMinTicketBRL: "30000000", buyerCoverageRule: "cobertura exigida de distributedCoverage"},
      {route: "debenture_professional_investors", routeCatalogueIds: ["debenture_professional"], instruments: ["debênture simples em rito automático"], issuerForm: "sociedade anônima (Lei nº 6.404/1976, art. 52)", houseReferenceMinTicketBRL: "50000000", buyerCoverageRule: "cobertura exigida de distributedCoverage"},
      {route: "securitization", routeCatalogueIds: ["cri", "cra"], instruments: ["CRI", "CRA"], issuerForm: "lastro elegível segundo policy.structure.route-catalogue e market.instrument.eligibility", houseReferenceMinTicketBRL: "50000000", buyerCoverageRule: "cobertura exigida de distributedCoverage"},
      {route: "fidc_dedicated", routeCatalogueIds: ["fidc"], instruments: ["FIDC exclusivo"], issuerForm: "carteira de direitos creditórios elegível", houseReferenceMinTicketBRL: "50000000", buyerCoverageRule: "cotas sênior com demanda confirmada e subordinação retida dimensionada"},
      {route: "fidc_multi_originator", routeCatalogueIds: ["fidc_existing_assignment"], instruments: ["cessão a FIDC existente"], issuerForm: "carteira elegível ao regulamento do fundo", houseReferenceMinTicketBRL: null, buyerCoverageRule: "limite de cedente aprovado e capacidade do fundo por sacado e cedente"},
    ],
    buyerTypes: "compradores do mapa MK-01 a MK-10; rota sem comprador nomeado no mapa (MK-13) não é vendável",
    marketRegime: [
      {date: "2026-09-16", source: "ANBIMA, Boletim de Mercado de Capitais de agosto de 2026", reading: "R$ 48,8 bilhões em ofertas encerradas no mês; debêntures R$ 21,5 bilhões (44,1%); FIDC R$ 14,5 bilhões; CRI R$ 2,4 bilhões; CRA R$ 2,2 bilhões; acumulado do ano R$ 485 bilhões"},
    ],
    calibration: {status: "tickets de referência são premissa da casa até a calibração por cotações e ofertas encerradas", caseOverride: "quando as cotações do caso existem, o ticket mínimo calculado substitui a referência inicial", refreshCadence: "trimestral", validityDays: 90},
  },
);

const mandateTicket = proposal(
  "policy.structure.mandate-ticket",
  "reais (BRL); limites regulatórios em fração do patrimônio líquido do veículo",
  {
    title: "Resolução CVM nº 175/2022, Anexo Normativo I, arts. 44, 75 e 76, e Anexo Normativo II, arts. 45 e 52: limites de concentração por emissor e por devedor",
    url: "https://conteudo.cvm.gov.br/legislacao/resolucoes/resol175.html",
  },
  {
    perVehicle: {
      ticketMax: "menor entre o ticket máximo declarado e confirmado, o limite regulatório × patrimônio líquido do último informe diário e o limite do regulamento, menos a exposição atual ao mesmo emissor ou grupo econômico",
      ticketMin: "ticket mínimo declarado e confirmado; abaixo dele o veículo não participa",
      netAssetValueSource: "informe diário de fundos na CVM, com até 5 dias úteis",
    },
    regulatoryIssuerLimits: {
      fif: [
        {issuer: "instituição financeira autorizada pelo Banco Central", shareOfNetAssets: "0.20"},
        {issuer: "companhia aberta", shareOfNetAssets: "0.10"},
        {issuer: "SPE subsidiária integral de securitizadora S2", shareOfNetAssets: "0.10"},
        {issuer: "pessoa natural ou jurídica que não seja companhia aberta nem instituição financeira", shareOfNetAssets: "0.05"},
      ],
      fidcPerDebtorOrCoobligor: "0.20",
      groupRule: "emissões do mesmo grupo econômico somam num único emissor",
      professionalInvestorClasses: "classe exclusiva de investidores profissionais pode dispensar os limites no regulamento; o limite passa a ser o do regulamento",
    },
    transactionRange: {
      bilateral: "ticket viável quando um credor confirmado aceita o valor entre o seu mínimo e o seu máximo",
      distributed: "matchedTicketMax = soma dos tickets máximos confirmados dos veículos aderentes ÷ cobertura exigida",
      requiredCoverage: {bestEfforts: "1.5", firmCommitment: "1.0", appliesTo: "todas as rotas distribuídas de policy.structure.minimum-sellable"},
      matchedTicketMin: "maior entre o ticket mínimo vendável da rota (policy.structure.minimum-sellable) e o menor valor com que a âncora participa",
      outsideRange: {aboveMax: "ES-45 reduz ao máximo ou ES-40 propõe tranche ou rota diferente", belowMin: "a rota não é vendável"},
    },
    indivisibility: [
      "CCB e contrato bilateral: um credor leva o ticket inteiro, salvo clube formal",
      "emissão distribuída: lote mínimo por investidor fixado no instrumento",
      "cota sênior de FIDC: subscrição mínima do regulamento",
    ],
    mandateDataAge: {key: "policy.market.mandate_max_age", rule: "prazo efetivo = menor entre o prazo do campo, o da proveniência e o do perfil; campo vencido sai dos filtros duros até ser reconfirmado; informação não confirmada não entra em filtro duro"},
    dealStructureMapping: {matchedTicketMin: "matchedTicketMin do caso", matchedTicketMax: "matchedTicketMax do caso"},
    currentConfirmedMandates: [],
  },
);

const conditionsPrecedent = proposal(
  "policy.conditions-precedent.catalogue",
  "catálogo de condições por arquétipo; validade de documentos em dias",
  {
    title: "Lei nº 6.404/1976, art. 62, na redação da Lei nº 14.711/2023: requisitos de emissão (arquivamento e publicação do ato societário e constituição das garantias reais)",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm",
  },
  {
    satisfactionRule: "cada condição tem responsável, evidência, prazo e estado (pendente, entregue, verificada, dispensada com registro); protocolo não é licença, intenção não é condição cumprida, e condição sem responsável não entra no term sheet (MA-20)",
    common: [
      {id: "corporate_approvals", evidence: "ata do órgão competente pelo estatuto ou contrato social, arquivada e publicada quando a lei exige, e poderes dos signatários", owner: "companhia"},
      {id: "federal_tax_certificate", evidence: "certidão conjunta RFB/PGFN negativa ou positiva com efeito de negativa", validityDays: 180, maxAgeAtDisbursementDays: 30, owner: "companhia"},
      {id: "labor_certificate", evidence: "Certidão Negativa de Débitos Trabalhistas", validityDays: 180, maxAgeAtDisbursementDays: 30, owner: "companhia"},
      {id: "security_perfected", evidence: "garantias constituídas e registradas: imóvel no registro de imóveis, móveis no registro de títulos e documentos, veículos no órgão de trânsito, ativos financeiros e recebíveis na registradora ou no depositário central, ações no livro ou no escriturador", owner: "companhia e assessor jurídico"},
      {id: "insurance_endorsed", evidence: "apólices dos ativos essenciais e das garantias com o credor como beneficiário", owner: "companhia"},
      {id: "appraisals_current", evidence: "laudos dentro dos prazos de policy.structure.appraisal-validity", owner: "companhia"},
      {id: "legal_opinion", evidence: "opinião legal sobre constituição, validade e exequibilidade, nas rotas de mercado de capitais", owner: "assessor jurídico"},
      {id: "no_default_bring_down", evidence: "declarações repetidas na data do desembolso e ausência de evento de inadimplemento", owner: "companhia"},
      {id: "fees_and_expenses", evidence: "comprovante de pagamento das despesas devidas no fechamento", owner: "companhia"},
    ],
    byArchetype: {
      growth_expansion: ["licença de instalação vigente para a obra e caminho da licença de operação (Lei nº 15.190/2025, art. 5º)", "orçamento aprovado e contrato de obra ou EPC com preço e prazo", "seguro garantia de execução com vigência igual à da obra", "matrícula do sítio sem ônus não quitado", "aporte de capital próprio comprovado antes ou pro rata dos desembolsos", "relatório de engenheiro independente por marco quando houver tranches (OP-08)"],
      acquisition: ["contrato de compra e venda assinado com preço e condições", "aprovação do CADE quando pelo menos um grupo envolvido tem faturamento bruto anual no país de R$ 750 milhões ou mais e pelo menos outro grupo tem R$ 75 milhões ou mais (Lei nº 12.529/2011, art. 88; Portaria Interministerial nº 994/2012)", "relatórios de diligência financeira, jurídica e tributária entregues", "dívida da adquirida quitada ou com consentimento dos credores", "renúncias de mudança de controle nos contratos da adquirida"],
      refinance: ["cartas de quitação com valor exato e data", "termos de liberação de garantias assinados para registro simultâneo", "renúncias de cross-default e de negative pledge onde a operação as exige", "valor da multa de pré-pagamento confirmado"],
      equipment_finance: ["pró-forma final e contrato de fornecimento", "termo de entrega e aceite", "alienação fiduciária registrada no registro de títulos e documentos ou no órgão de trânsito", "seguro endossado", "licença de importação quando aplicável"],
      working_capital: ["cessão fiduciária registrada na registradora", "conta vinculada aberta com trava operacional testada", "primeiro relatório da base elegível"],
      venture_debt: ["fechamento da rodada de capital comprovado (contrato assinado e recursos recebidos)", "tabela de capitalização atualizada", "instrumento dos bônus de subscrição assinado"],
      other: ["condições do uso declarado, definidas caso a caso a partir das condições comuns"],
    },
    structureCreatedConditions: ["liberação de garantia existente (ES-22)", "acordo entre credores (ES-39)", "licença essencial que vence dentro do prazo da dívida (EMP-17)", "seguro de ativo essencial sem cobertura adequada (EMP-18)"],
    conditionsSubsequent: {
      rule: "registro que depende de prazo do cartório ou do órgão pode ser condição subsequente com prazo e consequência",
      maxDaysAfterDisbursement: 60,
      consequence: "depósito do valor em conta travada ou vencimento antecipado, conforme o term sheet",
    },
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
  "policy.structure.cross-default-threshold": crossDefaultThreshold,
  "policy.structure.reporting-cadence": reportingCadence,
  "policy.structure.cure-waiver": cureWaiver,
  "policy.structure.minimum-sellable": minimumSellable,
  "policy.structure.mandate-ticket": mandateTicket,
  "policy.conditions-precedent.catalogue": conditionsPrecedent,
};
