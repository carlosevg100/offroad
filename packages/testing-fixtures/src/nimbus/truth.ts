/**
 * Nimbus: one startup, stated once, before any document flatters it.
 *
 * The venture-debt archetype needs a company that burns cash by design, and no existing case
 * does. Nimbus is a Series A SaaS business: R$ 37M of ARR, negative EBITDA, thirteen months of
 * runway, and an ask for debt that buys time to the Series B. Every file in the room is
 * generated from this object and the gold set from the same numbers.
 *
 * The distortions are declared here too. The deck says "ARR de R$ 40 milhões" because it counts
 * services and a contract that churned; the letter says sixteen months of runway because it
 * uses the best month's burn. Both are what a founder writes and both are what a lender has to
 * catch from the per-customer export and the bank statement.
 *
 * Synthetic. The company does not exist and no number here describes a real business.
 */

export const nimbusVersion = "nimbus-2026.08.21-v1";

export const company = {
  legalName: "Nimbus Tecnologia em Gestão de Frotas S.A.",
  tradeName: "Nimbus",
  legalForm: "sa" as const,
  cnpj: "41.207.553/0001-09",
  foundedYear: 2019,
  city: "São Paulo",
  state: "SP",
  sector: "Software (SaaS) de gestão de frotas e telemetria",
  employees: 96,
  capTable: [
    {name: "Ana Ribeiro", share: 0.28, role: "Fundadora, CEO"},
    {name: "Tiago Mendes", share: 0.22, role: "Fundador, CTO"},
    {name: "Horizonte Capital Growth FIP", share: 0.25, role: "Investidor líder da Série A"},
    {name: "Aurora Ventures II FIP", share: 0.15, role: "Investidor seed"},
    {name: "Pool de opções (ESOP)", share: 0.10, role: "Colaboradores"},
  ],
  management: [
    {name: "Ana Ribeiro", role: "Diretora-presidente", since: 2019},
    {name: "Tiago Mendes", role: "Diretor de tecnologia", since: 2019},
    {name: "Paula Nakamura", role: "Diretora financeira", since: 2024},
  ],
  lastRound: {amount: 48_000_000, date: "2025-03-14", lead: "Horizonte Capital Growth FIP", postMoney: 240_000_000, series: "Série A"},
} as const;

/** Management accounts, in reais. No audit yet: the 2025 audit is in progress. */
export const historical = [
  {year: 2024, revenue: 16_100_000, cogs: 4_830_000, grossProfit: 11_270_000, opex: 26_070_000, ebitda: -14_800_000, netIncome: -15_900_000, cash: 9_800_000},
  {year: 2025, revenue: 28_600_000, cogs: 7_150_000, grossProfit: 21_450_000, opex: 40_850_000, ebitda: -19_400_000, netIncome: -21_000_000, cash: 36_400_000},
] as const;

export const interim2026 = {
  periodEnd: "2026-07-31",
  months: 7,
  revenue: 21_900_000,
  cogs: 5_260_000,
  ebitda: -12_600_000,
  netIncome: -13_400_000,
  cash: 24_100_000,
  receivables: 4_900_000,
  grossDebt: 3_200_000,
  /** Net burn, last three months, from the bank statement. */
  monthlyBurn: 1_850_000,
} as const;

export const debt = [
  {lender: "FINEP", instrument: "Financiamento à inovação", outstanding: 3_200_000, rate: "TR + 5,00% a.a.", maturity: "2029-06-15", amortization: "Mensal com 24m carência", collateral: "Fiança bancária"},
] as const;

/**
 * Forty customers, twenty-four months of MRR, from a fixed-seed generator. The totals are
 * whatever the generator produces; the gold reads them from here, never from a rounded slide.
 */
const lcg = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
};

const customerNames = [
  "Transportadora Vale do Aço", "LogBrasil Cargas", "Cooperativa Agro Sul", "Expresso Mineiro", "Frota Viva Locações",
  "Rodonorte Transportes", "Distribuidora Sol Nascente", "Ambev Operações Regionais", "Coleta Urbana Serviços", "TransLeste Logística",
  "Cargo Prime", "Viação Planalto", "Construtora Horizonte Obras", "Hidro Saneamento", "Petroway Distribuidora",
  "Moura Entregas", "Fretes Já", "Rede Frigorífica Sul", "Mineração Serra Verde", "AgroCampo Insumos",
  "Via Rápida Motofrete", "Grupo Andrade Turismo", "Lavoura Forte", "TransCeará", "Norte Log",
  "Bebidas Cantareira", "Usina Santa Rita", "Porto Seco Campinas", "Madeireira Pinheiro", "Ecoleta Resíduos",
  "Rotas do Sul", "Transpetrol Cargas", "Gás Rápido", "Carvalho Locadora", "Atlas Mudanças",
  "Lácteos da Serra", "Campo Bom Sementes", "Brasil Guindastes", "Vidros Paulista", "Farma Express",
] as const;

export const months = Array.from({length: 24}, (_, index) => {
  const year = 2024 + Math.floor((7 + index) / 12);
  const month = ((7 + index) % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}); // 2024-08 .. 2026-07

export const mrrByCustomer = (() => {
  const random = lcg(20260821);
  return customerNames.map((name, index) => {
    const base = Math.round((11_700 + random() * 91_000) / 100) * 100;
    const start = index < 22 ? 0 : Math.floor(random() * 14) + 1; // 22 customers from month one, the rest join later
    const growth = 1 + random() * 0.035;
    const churnAt = index === 7 ? 20 : index === 31 ? 17 : null; // two churns: a large one and a small one
    const series = months.map((_, m) => {
      if (m < start) return 0;
      if (churnAt !== null && m >= churnAt) return 0;
      return Math.round((base * growth ** (m - start)) / 100) * 100;
    });
    return {name, series, churnAt};
  });
})();

export const mrrTotals = months.map((_, m) => mrrByCustomer.reduce((sum, customer) => sum + customer.series[m]!, 0));

export const metrics = (() => {
  const last = mrrTotals[23]!;
  const yearAgo = mrrTotals[11]!;
  const arr = last * 12;
  // NRR: MRR today from customers that existed twelve months ago, over their MRR then.
  const cohort = mrrByCustomer.filter((customer) => customer.series[11]! > 0);
  const nrr = cohort.reduce((sum, c) => sum + c.series[23]!, 0) / cohort.reduce((sum, c) => sum + c.series[11]!, 0);
  const churned = mrrByCustomer.filter((customer) => customer.churnAt !== null && customer.churnAt > 11).length;
  const monthlyLogoChurn = churned / cohort.length / 12;
  const topCustomers = [...mrrByCustomer]
    .sort((a, b) => b.series[23]! - a.series[23]!)
    .slice(0, 5)
    .map((customer) => ({name: customer.name, mrr: customer.series[23]!, share: customer.series[23]! / last}));
  return {mrr: last, mrrYearAgo: yearAgo, arr, nrr, monthlyLogoChurn, topCustomers, runwayMonths: Math.floor(interim2026.cash / interim2026.monthlyBurn)};
})();

export const request = {
  amount: 15_000_000,
  termMonths: 36,
  graceMonths: 12,
  expectedRate: "CDI + 6,00% a.a. com warrant de 8% do principal",
  purpose: "Estender o runway até a Série B prevista para o segundo semestre de 2027 sem antecipar a rodada em condições piores.",
  useOfProceeds: [
    {item: "Extensão de runway (folha e infraestrutura)", amount: 11_000_000},
    {item: "Aquisição de clientes (time comercial e marketing)", amount: 4_000_000},
  ],
} as const;

export const contradictions = [
  {
    id: "arr-deck-vs-export",
    fieldPath: "interim_financials.2026_07.arr",
    values: [
      {document: "00_Deck_Institucional_Nimbus.docx", value: 40_000_000, why: "o deck arredonda e inclui serviços de implantação e um contrato que cancelou em maio"},
      {document: "02_Metricas_MRR_por_Cliente_2024_2026.xlsx", value: metrics.arr, why: "MRR de julho por cliente vezes doze"},
    ],
    resolution: "o export por cliente manda; o deck é narrativa",
  },
  {
    id: "runway-letter-vs-statement",
    fieldPath: "company.runway_months",
    values: [
      {document: "01_Carta_Pedido_Venture_Debt.docx", value: 16, why: "usa a queima do melhor mês (R$ 1,5M) em vez da média do trimestre"},
      {document: "05_Extrato_Bancario_Mai_Jul2026.csv", value: metrics.runwayMonths, why: "caixa de julho sobre a queima média de maio a julho"},
    ],
    resolution: "o extrato manda; runway se calcula, não se declara",
  },
] as const;

export const missing = [
  {id: "audited_statements", why: "a auditoria de 2025 está em andamento; só há gerencial"},
  {id: "top_customer_contracts", why: "contratos dos dois maiores clientes não enviados"},
  {id: "investor_follow_on", why: "nenhuma carta dos fundos confirmando reserva para follow-on"},
] as const;
