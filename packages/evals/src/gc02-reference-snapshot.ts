import {createHash} from "node:crypto";

import {case01, executors} from "@offroad/credit-playbook";
import {
  allocateContractualSchedule,
  budget2026_27,
  camilManagementLabel,
  itrDebentureBalanceCosts,
  itrScheduleBuckets,
  itrScheduleDebentureCosts,
  loanTransactionCosts,
  managementSeries,
  marketAssumptions,
  minimumCashPolicy,
  openingContractualPrincipal,
  openingCovenantDeductibleCash,
  openingGrossDebt,
  projectCamil,
  projectionPeriods,
} from "@offroad/testing-fixtures";
import Decimal from "decimal.js";

const d = (value: Decimal.Value) => new Decimal(value);
const n = (value: Decimal.Value) => d(value).toDecimalPlaces(8).toNumber();
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const rateLabel = (series: (typeof managementSeries)[number]): string => {
  const rate = series.rate;
  if (rate.type === "fixed") return `${rate.rate.toFixed(2)}% a.a.`;
  if (rate.type === "percent_of_index") return `${rate.percent.toFixed(0)}% ${rate.index}`;
  return `${rate.index} + ${rate.spread.toFixed(rate.spread % 1 === 0 ? 0 : 4)}% a.a.`;
};

export function buildGc02ReferenceSnapshot() {
  const evidence = case01.case01Evidence();
  const ledger = executors.buildDebtLedger(evidence["build-debt-ledger"]);
  const wall = executors.diagnoseMaturityWall(evidence["diagnose-maturity-wall"]);
  const covenant = executors.reconcileCovenantDefinitions(evidence["reconcile-covenant-definitions"]);
  const schedule = allocateContractualSchedule();
  const rolloverAnnualRate = d(marketAssumptions.cdiAnnualPercent).plus(1.5).div(100);
  const rollover = projectCamil({rollover: true, rolloverAnnualRate});
  const noRollover = projectCamil({rollover: false});
  const annualRevenue = sum(budget2026_27.netRevenue);
  const annualEbitda = sum(budget2026_27.ebitda);
  const margin = d(annualEbitda).div(annualRevenue);
  const ipcaCurve = marketAssumptions.ipcaImpliedByYearPercent.map((value) => n(d(value).div(100)));
  const baseGrowth = projectionPeriods.map((_, index) => index === 0 ? 0 : 0.02);
  const baseMargin = projectionPeriods.map(() => n(margin));
  const downsideMargin = projectionPeriods.map((_, index) => n(Decimal.max(margin.minus(index === 0 ? 0 : 0.01), 0)));
  const sourceRows = [
    {id: "SRC-01", title: "ITR 1T26", file: "01_ITR_1T26_31mai2026.pdf", asOf: "2026-05-31", class: "public", use: "dívida, caixa e cronograma", anchor: "nota 15, pp. 39-40; nota 3, p. 20"},
    {id: "SRC-02", title: "Release 1T26", file: "ri_release_1t26.pdf", asOf: "2026-05-31", class: "public", use: "dívida líquida reportada e indicador pro forma", anchor: "p. 12"},
    {id: "SRC-03", title: "Relatórios e escrituras", file: "af_11a/13a/14a/15a e escrituras", asOf: "2026-09-04", class: "public", use: "remuneração, vencimento, garantia e covenant", anchor: "âncoras por série no ledger"},
    {id: "SRC-04", title: "Orçamento sintético", file: "01_Orcamento_2026_2027.xlsx", asOf: "2026-09-04", class: "synthetic_management", use: "receita, EBITDA, impostos e capital de giro", anchor: "abas Orçamento e Premissas"},
    {id: "SRC-05", title: "Plano de capex sintético", file: "02_Plano_Capex.xlsx", asOf: "2026-09-04", class: "synthetic_management", use: "capex de manutenção e crescimento", anchor: "aba Capex"},
    {id: "SRC-06", title: "Política de caixa sintética", file: "03_Politica_Caixa_Minimo.docx", asOf: "2026-09-04", class: "synthetic_management", use: "piso de liquidez", anchor: "corpo do documento"},
    {id: "SRC-07", title: "Cronograma contratual sintético", file: "04_Cronograma_Contratual_Amortizacoes.xlsx", asOf: "2026-09-04", class: "synthetic_management", use: "principal de caixa por série", anchor: "aba Cronograma"},
    {id: "SRC-08", title: "Curvas de mercado congeladas", file: "anbima_ettj_2026-09-04.csv; BCB SGS", asOf: "2026-09-04", class: "public_market", use: "CDI spot, Selic e inflação implícita", anchor: "ETTJ e séries 12/432"},
  ] as const;

  const body = {
    schemaVersion: "offroad.gc02.reference-snapshot.v1",
    caseId: "gc02-cfo-camil-conselho",
    company: "Camil Alimentos S.A.",
    asOf: "2026-05-31",
    marketAsOf: "2026-09-04",
    unit: "R$ mil",
    perimeter: "consolidado",
    status: "reference_fixture",
    disclosure: camilManagementLabel,
    economicIdentity: {
      accountingGrossDebt: n(openingGrossDebt),
      contractualGrossPrincipal: n(openingContractualPrincipal),
      accountingCashAndEquivalents: 1_430_714,
      covenantDeductibleCash: n(openingCovenantDeductibleCash),
      contractualNetDebt: 4_228_477,
      releaseNetDebt: 4_214_377,
      companyReportedProFormaLeverage: 4.72,
      reportedLeverageState: "company_reported_not_recomputed",
      accountingToContractualBridge: {
        contractualGrossPrincipal: n(openingContractualPrincipal),
        loanTransactionCosts,
        debentureBalanceTransactionCosts: itrDebentureBalanceCosts,
        accountingGrossDebt: n(openingGrossDebt),
      },
    },
    budget: {
      periods: [...budget2026_27.quarters],
      revenue: [...budget2026_27.netRevenue],
      ebitda: [...budget2026_27.ebitda],
      cashTaxes: [...budget2026_27.cashTaxes],
      maintenanceCapex: [...budget2026_27.maintenanceCapex],
      growthCapex: [...budget2026_27.growthCapex],
      workingCapitalChange: [...budget2026_27.changeInWorkingCapital],
      leases: [...budget2026_27.leasePayments],
      dividends: [...budget2026_27.dividends],
    },
    assumptions: {
      activeCase: "Base",
      caseOptions: ["Base", "Downside"],
      periods: [...projectionPeriods],
      base: {
        revenueGrowth: baseGrowth,
        ebitdaMargin: baseMargin,
        cashTaxes: projectionPeriods.map((_, index) => n(d(60_000).times(d(1.02).pow(index)))),
        capex: rollover.years.map((year) => n(year.capex)),
        workingCapitalChange: projectionPeriods.map((_, index) => index === 0 ? 50_000 : 50_000),
        leases: projectionPeriods.map(() => 60_000),
        dividends: projectionPeriods.map((_, index) => n(d(90_000).times(d(1.02).pow(index)))),
        refinancingShare: projectionPeriods.map(() => 1),
        cdi: projectionPeriods.map(() => n(d(marketAssumptions.cdiAnnualPercent).div(100))),
        ipca: ipcaCurve,
        sofr: projectionPeriods.map(() => n(d(marketAssumptions.sofrAnnualPercent).div(100))),
      },
      downside: {
        revenueGrowth: projectionPeriods.map(() => 0),
        ebitdaMargin: downsideMargin,
        cashTaxes: projectionPeriods.map((_, index) => n(d(60_000).times(d(1.02).pow(index)))),
        capex: rollover.years.map((year) => n(year.capex)),
        workingCapitalChange: projectionPeriods.map((_, index) => index === 0 ? 50_000 : 75_000),
        leases: projectionPeriods.map(() => 60_000),
        dividends: projectionPeriods.map((_, index) => index === 0 ? 90_000 : 0),
        refinancingShare: projectionPeriods.map((_, index) => index < 3 ? 0.9 : 1),
        cdi: projectionPeriods.map(() => n(d(marketAssumptions.cdiAnnualPercent + 2).div(100))),
        ipca: ipcaCurve.map((value) => n(d(value).plus(0.01))),
        sofr: projectionPeriods.map(() => n(d(marketAssumptions.sofrAnnualPercent + 1).div(100))),
      },
      rationale: [
        {driver: "Crescimento de receita", base: "2,0% nominal após o orçamento", downside: "0,0%", basis: "premissa gerencial sintética; substituir por plano por categoria, volume, preço e mix"},
        {driver: "Margem EBITDA", base: `${margin.times(100).toFixed(2)}%`, downside: "menos 100 bps após 2026/27", basis: "orçamento sintético; não substitui build por produto e geografia"},
        {driver: "Refinanciamento", base: "100% do principal", downside: "90% nos três primeiros anos", basis: "cenário de execução, não linha comprometida nem oferta"},
        {driver: "Custo da rolagem", base: `${rolloverAnnualRate.times(100).toFixed(2)}% a.a.`, downside: "+200 bps", basis: "CDI spot mais 1,50%; a curva DI futura e o spread executável permanecem lacunas"},
        {driver: "CDI", base: `${marketAssumptions.cdiAnnualPercent.toFixed(2)}% spot anualizado`, downside: "+200 bps", basis: "SGS 12; curva DI futura ainda ausente"},
        {driver: "IPCA", base: "inflação implícita ANBIMA", downside: "+100 bps", basis: "ETTJ 04/09/2026; atualização capitaliza no principal das séries tratadas como bullet"},
      ],
    },
    debt: {
      series: managementSeries.map((series) => ({
        id: series.id,
        label: series.label,
        balance: series.balance,
        currency: series.currency,
        maturity: series.maturity,
        rate: rateLabel(series),
        indexer: series.rate.type === "fixed" ? "Prefixado" : series.rate.index,
        rateSource: series.rateSource,
        guarantee: series.maturity === null ? (series.currency === "BRL" ? "não comprovada" : "garantia da controladora, sem individualização") : "quirografária",
      })),
      publicMaturitySchedule: itrScheduleBuckets.map((row) => ({...row})),
      grossContractualSchedule: projectionPeriods.map((period) => ({period, amount: n(schedule.totalByPeriod(period))})),
      contractualScheduleRows: schedule.rows.map((row) => ({period: row.period, seriesId: row.id, amount: n(row.amount)})),
      loanCostBridge: projectionPeriods.map((period) => ({period, amount: n(schedule.loanScheduleBridgeByPeriod(period))})),
      scheduleDebentureCosts: itrScheduleDebentureCosts,
      partials: schedule.partials,
      mix: [
        {label: "Linhas bancárias", amount: 2_416_994},
        {label: "Debêntures CDI", amount: 2_172_858},
        {label: "Debêntures IPCA", amount: 743_955},
        {label: "Debênture prefixada", amount: 408_703},
      ],
    },
    projections: {
      rollover: rollover.years.map((year) => Object.fromEntries(Object.entries(year).map(([key, value]) => [key, value === null ? null : typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value]))),
      noRollover: noRollover.years.map((year) => Object.fromEntries(Object.entries(year).map(([key, value]) => [key, value === null ? null : typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value]))),
    },
    currentEvidence: {
      ledgerState: ledger.state,
      ledgerFingerprint: ledger.trace.outputFingerprint,
      maturityWallState: wall.state,
      maturityWallFingerprint: wall.trace.outputFingerprint,
      covenantState: covenant.state,
      covenantFingerprint: covenant.trace.outputFingerprint,
    },
    options: [
      {id: "status_quo", label: "Manter estrutura e rolar linhas", state: "reference_only", boardQuestion: "A companhia aceita depender de refinanciamento integral nos anos de menor folga?", condition: "capacidade, preço e prazo de rolagem ainda não contratados"},
      {id: "extend_2028", label: "Alongar o pico de 2028/29", state: "blocked", boardQuestion: "A redução do pico compensa custo e flexibilidade da nova dívida?", condition: "base de liquidação e custo de saída da 13ª 1ª série"},
      {id: "extend_two_peaks", label: "Alongar os picos de 2028/29 e 2029/30", state: "blocked", boardQuestion: "Uma transação maior reduz risco de execução sem concentrar preço e covenants?", condition: "bases de liquidação e custos de saída da 13ª 1ª e 14ª 1ª séries"},
      {id: "cash_paydown", label: "Amortizar linhas com caixa", state: "blocked", boardQuestion: "Qual caixa excede o piso operacional e qual é o custo de pré-pagamento?", condition: "termos de pré-pagamento e liquidez diária das aplicações"},
      {id: "offer_11th", label: "Oferta de resgate da 11ª emissão", state: "blocked", boardQuestion: "Existe adesão econômica para uma saída negociada?", condition: "prêmio e adesão de 100% da série abrangida"},
    ],
    coverageGaps: [
      {id: "GAP-01", materiality: "blocking", topic: "Covenant prospectivo", missing: "EBITDA contratual, ajustes, caixa dedutível e degrau aplicável por data", consequence: "não calcular headroom nem afirmar cumprimento"},
      {id: "GAP-02", materiality: "blocking", topic: "Custo de saída", missing: "principal nominal, juros acumulados, encargos e termos de pré-pagamento", consequence: "não ranquear estruturas que retiram dívida"},
      {id: "GAP-03", materiality: "high", topic: "Curva de juros", missing: "curva DI futura observável e hedge por instrumento", consequence: "juros prospectivos permanecem cenário, não preço"},
      {id: "GAP-04", materiality: "high", topic: "Modelo integrado", missing: "histórico por linha, balanço, fluxo de caixa e projeções por produto/geografia", consequence: "modelo atual é de caixa e dívida, não projeção integrada"},
      {id: "GAP-05", materiality: "high", topic: "Tributos", missing: "regime, efeitos da reforma e tratamento das alternativas", consequence: "comparação após impostos permanece aberta"},
      {id: "GAP-06", materiality: "high", topic: "Liquidez intraperíodo", missing: "sazonalidade mensal e disponibilidade D0", consequence: "a análise anual pode esconder picos de caixa"},
    ],
    sources: sourceRows,
    generatedBy: {
      module: "packages/evals/src/gc02-reference-snapshot.ts",
      financialCore: ["buildIndexedDebtSchedule", "aggregateIndexedDebtSchedules", "calculateLiquidityCoverage"],
      publicEvidence: case01.case01EvidenceManifest,
    },
  } as const;

  return {...body, fingerprint: createHash("sha256").update(canonical(body)).digest("hex")};
}

export type Gc02ReferenceSnapshot = ReturnType<typeof buildGc02ReferenceSnapshot>;
