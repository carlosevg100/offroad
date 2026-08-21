/**
 * Aurora Distribuidora: one company, stated once, before any document distorts it.
 *
 * Every file in the data room is generated from this object, which is what makes the case
 * measurable rather than merely realistic. The gold set is derived from the same numbers, so a
 * measurement compares the extractor against what was actually written rather than against a
 * second guess at it.
 *
 * The distortions are declared here too (`contradictions`), for the same reason. A real data
 * room disagrees with itself: the CFO writes "cerca de R$ 190 milhões" while the audited
 * statements say 191,2, the debt map misses the leasing that the balance sheet includes, and the
 * plan asks for a number the covering letter rounded. Reconciliation exists to find exactly
 * that, and it had never been given anything to find, because the only gold case in the
 * repository agrees with itself everywhere.
 *
 * Synthetic. The company does not exist and no number here describes a real business.
 */

export const fakecoVersion = "fakeco-2026.08.21-v1";

export const company = {
  legalName: "Aurora Distribuidora de Materiais de Construção Ltda",
  tradeName: "Aurora Materiais",
  /** Deliberately a limitada: it blocks the debênture and makes the instrument logic speak. */
  legalForm: "ltda" as const,
  cnpj: "24.518.907/0001-63",
  foundedYear: 2004,
  city: "São José dos Campos",
  state: "SP",
  sector: "Distribuição de materiais de construção",
  employees: 214,
  branches: 4,
  partners: [
    {name: "Helena Bastos Corrêa", share: 0.52, role: "Sócia administradora"},
    {name: "Rafael Bastos Corrêa", share: 0.33, role: "Sócio, diretor comercial"},
    {name: "Participações Vale do Paraíba Ltda", share: 0.15, role: "Sócia quotista"},
  ],
  management: [
    {name: "Helena Bastos Corrêa", role: "Diretora-presidente", since: 2011},
    {name: "Marcos Tanaka", role: "Diretor financeiro", since: 2019},
    {name: "Rafael Bastos Corrêa", role: "Diretor comercial", since: 2008},
  ],
} as const;

/** Audited, in reais. The statements themselves are printed in thousands: that is the trap. */
export const historical = [
  {year: 2023, revenue: 142_800_000, cogs: 108_528_000, grossProfit: 34_272_000, sga: 22_991_000, ebitda: 11_281_000, depreciation: 3_140_000, financialExpenses: 6_820_000, netIncome: 1_004_000},
  {year: 2024, revenue: 168_400_000, cogs: 127_216_000, grossProfit: 41_184_000, sga: 26_260_000, ebitda: 14_924_000, depreciation: 3_610_000, financialExpenses: 8_190_000, netIncome: 2_338_000},
  {year: 2025, revenue: 191_200_000, cogs: 143_400_000, grossProfit: 47_800_000, sga: 30_952_000, ebitda: 16_848_000, depreciation: 4_020_000, financialExpenses: 9_460_000, netIncome: 2_611_000},
] as const;

export const balance2025 = {
  cash: 8_420_000,
  receivables: 47_310_000,
  inventory: 39_880_000,
  fixedAssets: 41_260_000,
  totalAssets: 141_870_000,
  suppliers: 33_540_000,
  shortTermDebt: 18_940_000,
  longTermDebt: 26_380_000,
  equity: 47_120_000,
  /** What the balance sheet calls debt: the map below misses the leasing, on purpose. */
  grossDebtOnBalance: 45_320_000,
} as const;

/** Interim, in units, seven months to 31/07/2026. The scale disagrees with the audited file. */
export const interim2026 = {
  periodEnd: "2026-07-31",
  months: 7,
  revenue: 121_640_000,
  ebitda: 10_970_000,
  netIncome: 1_486_000,
  cash: 6_180_000,
  receivables: 51_940_000,
} as const;

/**
 * The debt schedule. Seven contracts, because this is the field group the only existing gold
 * case has zero coverage of, and it is the one a credit desk reads first.
 */
export const debt = [
  {lender: "Banco Itaú", instrument: "Capital de giro", outstanding: 9_840_000, rate: "CDI + 4,10% a.a.", maturity: "2027-11-20", amortization: "Mensal", collateral: "Duplicatas 130%", covenant: "Dívida líquida/EBITDA <= 3,0x"},
  {lender: "Banco Bradesco", instrument: "CCB", outstanding: 7_500_000, rate: "CDI + 3,85% a.a.", maturity: "2028-04-15", amortization: "Mensal com 6m carência", collateral: "Aval dos sócios", covenant: "Dívida líquida/EBITDA <= 3,25x"},
  {lender: "Banco Santander", instrument: "Capital de giro", outstanding: 6_260_000, rate: "CDI + 4,45% a.a.", maturity: "2027-03-10", amortization: "Mensal", collateral: "Duplicatas 125%", covenant: null},
  {lender: "Banco do Brasil", instrument: "FINAME", outstanding: 5_180_000, rate: "TLP + 2,90% a.a.", maturity: "2030-08-01", amortization: "Mensal", collateral: "Alienação fiduciária da frota", covenant: null},
  {lender: "Sicredi", instrument: "Cédula de crédito bancário", outstanding: 4_120_000, rate: "CDI + 5,20% a.a.", maturity: "2027-06-30", amortization: "Mensal", collateral: "Aval dos sócios", covenant: null},
  {lender: "BTG Pactual", instrument: "Antecipação de recebíveis", outstanding: 3_780_000, rate: "1,42% a.m.", maturity: "2026-12-20", amortization: "No vencimento", collateral: "Recebíveis cedidos", covenant: null},
  {lender: "Banco Volkswagen", instrument: "Financiamento de frota", outstanding: 1_820_000, rate: "1,18% a.m.", maturity: "2029-02-15", amortization: "Mensal", collateral: "Alienação fiduciária de 11 veículos", covenant: null},
] as const;

/** In the balance sheet and absent from the map: this is the gap reconciliation must find. */
export const leasingOffMap = 6_820_000;

/** Customer concentration, the other field group with no coverage today. */
export const customers = [
  {name: "Construtora Vertical Engenharia", share: 0.181, revenue: 34_607_000, sinceYear: 2012, terms: "45 dias"},
  {name: "Grupo Habita Empreendimentos", share: 0.112, revenue: 21_414_000, sinceYear: 2016, terms: "60 dias"},
  {name: "Prefeitura de São José dos Campos", share: 0.074, revenue: 14_149_000, sinceYear: 2019, terms: "90 dias"},
  {name: "Rede Construir (franquias)", share: 0.061, revenue: 11_663_000, sinceYear: 2015, terms: "30 dias"},
  {name: "Marfim Incorporações", share: 0.048, revenue: 9_178_000, sinceYear: 2021, terms: "45 dias"},
] as const;

/** What the company is asking for, and what it plans to do with it. */
export const request = {
  /** The plan's number. The covering letter rounds it, which is the third contradiction. */
  amount: 42_300_000,
  currency: "BRL",
  termMonths: 48,
  graceMonths: 6,
  purpose: "Capital de giro para alongamento do ciclo e implantação do quarto centro de distribuição",
  expectedRate: "CDI + 4,00% a.a.",
  useOfProceeds: [
    {item: "Capital de giro (reforço do ciclo de recebíveis)", amount: 25_000_000},
    {item: "Obra civil do centro de distribuição de Jacareí", amount: 11_400_000},
    {item: "Equipamentos de movimentação e racks", amount: 4_100_000},
    {item: "Sistema de gestão e integração logística", amount: 1_800_000},
  ],
} as const;

export const project = {
  name: "Centro de Distribuição Jacareí",
  city: "Jacareí",
  state: "SP",
  landArea: 18_400,
  builtArea: 9_600,
  capex: 17_300_000,
  startDate: "2026-11-01",
  operationDate: "2027-09-01",
  expectedRevenueUplift: 38_000_000,
  /** Missing from the data room on purpose: the licence becomes an open question. */
  environmentalLicence: null,
} as const;

export const projections = [
  {year: 2026, revenue: 208_500_000, ebitda: 18_760_000},
  {year: 2027, revenue: 236_900_000, ebitda: 22_270_000},
  {year: 2028, revenue: 271_400_000, ebitda: 26_320_000},
  {year: 2029, revenue: 298_100_000, ebitda: 29_510_000},
  {year: 2030, revenue: 321_700_000, ebitda: 32_490_000},
] as const;

/**
 * What the documents disagree about, declared rather than discovered.
 *
 * Each one is a real shape a data room takes, and each one has a right answer that a desk
 * reaches by precedence rather than by preference: the audited file outranks the letter, the
 * balance sheet outranks a schedule somebody maintains by hand.
 */
export const contradictions = [
  {
    id: "revenue-2025",
    field: "historical_financials.revenue.2025",
    audited: 191_200_000,
    inCoveringLetter: 190_000_000,
    inProjectionsBaseYear: 193_500_000,
    resolution: "audited",
    why: "A demonstração auditada tem rank 1; a carta arredonda e a projeção usa uma base preliminar.",
  },
  {
    id: "gross-debt",
    field: "debt.gross_total",
    onBalanceSheet: 45_320_000,
    inDebtSchedule: 38_500_000,
    difference: 6_820_000,
    resolution: "balance_sheet",
    why: "O mapa de dívida não inclui o arrendamento mercantil que o balanço reconhece.",
  },
  {
    id: "requested-amount",
    field: "transaction.requested_amount",
    inPlan: 42_300_000,
    inCoveringLetter: 40_000_000,
    resolution: "ask_the_company",
    why: "Nenhuma fonte tem precedência sobre a outra: é o que a empresa quer, e ela disse duas coisas.",
  },
] as const;

/** What the company did not send. Each one should come back as a question, not as a guess. */
export const missing = [
  {what: "Balanço revisado por auditor independente para 2026", why: "Só há balancete gerencial de julho"},
  {what: "Licença ambiental prévia do CD de Jacareí", why: "O memorial cita o protocolo, não a licença"},
  {what: "Aging da carteira de recebíveis", why: "O saldo aparece, a composição por vencimento não"},
  {what: "Contratos dos dois maiores clientes", why: "A concentração é declarada, o contrato não foi anexado"},
] as const;
