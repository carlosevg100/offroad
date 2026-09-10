import {auditCompiledMaterial} from "./conduct";
import type {Material} from "./compile";

export type FinancialModelMaterialInput = {
  artifactFingerprint: string;
  periods: readonly string[];
  sheetNames: {pt: readonly string[]; en: readonly string[]};
  deskAssumptions: readonly string[];
  selectedAlternativeId: string;
  amount: string;
  termMonths: number;
  graceMonths: number;
  supportIds: readonly string[];
};

/**
 * Represents the separately compiled XLSX in the governed package.
 *
 * The workbook bytes are not embedded in the case state. They are rebuilt deterministically
 * from the same confirmed structure when downloaded. This material keeps their exact compiler
 * fingerprint, the economic inputs and the lineage that make the file reproducible.
 */
export function financialModelMaterial(input: FinancialModelMaterialInput): Material {
  const material: Material = {
    kind: "financial_model",
    title: {pt: "Modelo financeiro indicativo", en: "Indicative financial model"},
    blocks: [
      {
        type: "callout",
        title: {pt: "Base do modelo", en: "Model basis"},
        items: [
          {
            label: {pt: "Estrutura confirmada", en: "Confirmed structure"},
            value: {pt: input.selectedAlternativeId, en: input.selectedAlternativeId},
            material: true,
            claimKind: "premise",
            supportIds: [...input.supportIds],
          },
          {
            label: {pt: "Volume indicativo", en: "Indicative amount"},
            value: {pt: input.amount, en: input.amount},
            material: true,
            claimKind: "premise",
            supportIds: [...input.supportIds],
          },
          {
            label: {pt: "Prazo e carência", en: "Tenor and grace"},
            value: {
              pt: `${input.termMonths} meses, com ${input.graceMonths} meses de carência`,
              en: `${input.termMonths} months, with ${input.graceMonths} months of grace`,
            },
            material: true,
            claimKind: "premise",
            supportIds: [...input.supportIds],
          },
          {
            label: {pt: "Horizonte", en: "Horizon"},
            value: {pt: input.periods.join(" a "), en: input.periods.join(" to ")},
          },
          {
            label: {pt: "Abas", en: "Sheets"},
            value: {pt: input.sheetNames.pt.join(", "), en: input.sheetNames.en.join(", ")},
          },
          {
            label: {pt: "Premissas editáveis da Offroad", en: "Editable Offroad assumptions"},
            value: {pt: String(input.deskAssumptions.length), en: String(input.deskAssumptions.length)},
          },
        ],
      },
      {
        type: "disclaimer",
        text: {
          pt: "Modelo indicativo para análise de sensibilidade. Não constitui proposta, aprovação, compromisso de crédito ou garantia de captação. As premissas editáveis são identificadas no próprio arquivo.",
          en: "Indicative model for sensitivity analysis. It is not an offer, approval, credit commitment or funding assurance. Editable assumptions are identified in the file itself.",
        },
      },
    ],
    dependsOn: [...new Set(input.supportIds)].sort(),
    artifactFingerprint: input.artifactFingerprint,
  };
  return {...material, conductAudit: auditCompiledMaterial(material)};
}

type InstitutionalStatementPeriod = {period: string; revenue: string; ebitda: string; netIncome: string; totalAssets: string; totalLiabilitiesAndEquity: string; cfads: string; closingGrossDebt: string; unrestrictedCash: string; balanceCheck: string} & Partial<Record<"operatingCosts" | "depreciation" | "ebit" | "financeExpense" | "accountingEbt" | "cashTax" | "restrictedCash" | "receivables" | "inventory" | "otherCurrentAssets" | "netPpe" | "otherAssets" | "payables" | "otherCurrentLiabilities" | "otherLiabilities" | "equity" | "netWorkingCapital" | "changeInNetWorkingCapital" | "maintenanceCapex" | "growthCapex" | "totalCapex" | "principalPaid" | "debtService" | "debtDrawdown" | "distributions" | "netDebt" | "netDebtToEbitda" | "dscr" | "interestCoverage" | "liquidityHeadroom" | "cashCoupon" | "cashIndexation" | "taxLossCarryforward" | "disallowedInterestCarryforward", string | null>>;
/** Approved statements and their reconciliations, with no fictitious financing terms. */
export function institutionalFinancialModelMaterial(input: {artifactFingerprint: string; supportIds: readonly string[]; lang?: "pt" | "en"; scenarios: readonly {name: string; currency: string; periods: readonly InstitutionalStatementPeriod[]}[]}): Material {
  const labels = (pt: string, en: string) => ({pt, en});
  const sections: {title: {pt: string; en: string}; metrics: readonly [keyof InstitutionalStatementPeriod, string, string][]}[] = [
    {title: labels("Demonstração de resultados", "Income statement"), metrics: [["revenue","Receita","Revenue"],["operatingCosts","Custos operacionais","Operating costs"],["ebitda","EBITDA","EBITDA"],["depreciation","Depreciação","Depreciation"],["ebit","EBIT","EBIT"],["financeExpense","Despesa financeira","Finance expense"],["accountingEbt","Resultado antes dos tributos","Earnings before tax"],["cashTax","Tributos pagos","Cash tax"],["netIncome","Resultado líquido","Net income"]]},
    {title: labels("Balanço patrimonial", "Balance sheet"), metrics: [["unrestrictedCash","Caixa disponível","Unrestricted cash"],["restrictedCash","Caixa restrito","Restricted cash"],["receivables","Contas a receber","Receivables"],["inventory","Estoques","Inventory"],["otherCurrentAssets","Outros ativos circulantes","Other current assets"],["netPpe","Imobilizado líquido","Net PP&E"],["otherAssets","Outros ativos","Other assets"],["totalAssets","Ativo total","Total assets"],["payables","Fornecedores","Payables"],["otherCurrentLiabilities","Outros passivos circulantes","Other current liabilities"],["closingGrossDebt","Dívida final","Closing debt"],["otherLiabilities","Outros passivos","Other liabilities"],["equity","Patrimônio líquido","Equity"],["totalLiabilitiesAndEquity","Passivo e patrimônio líquido","Liabilities and equity"],["balanceCheck","Conciliação do balanço","Balance check"]]},
    {title: labels("Fluxo de caixa e dívida", "Cash flow and debt"), metrics: [["netWorkingCapital","Capital de giro líquido","Net working capital"],["changeInNetWorkingCapital","Variação do capital de giro","Change in working capital"],["maintenanceCapex","Investimentos de manutenção","Maintenance capex"],["growthCapex","Investimentos de expansão","Growth capex"],["totalCapex","Investimentos totais","Total capex"],["cfads","Caixa disponível para serviço da dívida","Cash available for debt service"],["debtDrawdown","Liberações de dívida","Debt drawdowns"],["principalPaid","Amortização de principal","Principal repayments"],["cashCoupon","Juros pagos","Cash coupon"],["cashIndexation","Correção monetária paga","Cash indexation"],["debtService","Serviço da dívida","Debt service"],["distributions","Distribuições","Distributions"],["netDebt","Dívida líquida","Net debt"]]},
    {title: labels("Indicadores e liquidez", "Coverage and liquidity"), metrics: [["netDebtToEbitda","Dívida líquida / EBITDA (x)","Net debt / EBITDA (x)"],["dscr","Cobertura do serviço da dívida (x)","Debt service coverage (x)"],["interestCoverage","Cobertura de juros (x)","Interest coverage (x)"],["liquidityHeadroom","Folga de liquidez","Liquidity headroom"],["taxLossCarryforward","Prejuízos fiscais acumulados","Tax loss carryforward"],["disallowedInterestCarryforward","Juros não deduzidos acumulados","Disallowed interest carryforward"]]},
  ];
  const format = (value: string | null | undefined, ratio = false) => {
    if (value === null || value === undefined) return input.lang === "en" ? "Not computable" : "Não calculável";
    if (!input.lang) return value;
    // Presentation precision only; approved inputs, calculations and registers stay exact.
    if (ratio) value = Number(value).toFixed(2);
    const [whole = "", fraction] = value.split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, input.lang === "pt" ? "." : ",");
    return grouped + (fraction ? `${input.lang === "pt" ? "," : "."}${fraction}` : "");
  };
  const material: Material = {kind: "financial_model", title: labels("Demonstrações e cenários aprovados", "Approved financial statements and scenarios"), artifactFingerprint: input.artifactFingerprint, dependsOn: [...input.supportIds], blocks: [
    {type: "paragraph", text: labels("Resultados do cenário aprovado, organizados em resultados, balanço, fluxo de caixa e indicadores. Os históricos e as premissas estão vinculados à revisão que originou esta entrega.", "Approved scenario results, organized into income statement, balance sheet, cash flow and coverage. Historical inputs and assumptions are bound to the review that produced this delivery.")},
    ...input.scenarios.flatMap(scenario => [
      {type: "heading" as const, text: labels(`${scenario.name} · ${scenario.currency}`, `${scenario.name} · ${scenario.currency}`)},
      ...sections.filter(section => section.metrics.some(([key]) => scenario.periods.some(period => period[key] !== undefined))).map(section => ({type: "table" as const,
        caption: labels(`${section.title.pt} · valores em unidades monetárias, salvo indicadores`, `${section.title.en} · monetary units, except ratios`),
        head: [labels("Indicador", "Metric"), ...scenario.periods.map(period => labels(period.period, period.period))],
        rows: section.metrics.filter(([key]) => scenario.periods.some(period => period[key] !== undefined)).map(([key, pt, en]) => [input.lang ? (input.lang === "pt" ? pt : en) : `${pt} / ${en}`, ...scenario.periods.map(period => format(period[key], ["netDebtToEbitda", "dscr", "interestCoverage"].includes(key)))]),
      })),
    ]),
    {type: "disclaimer", text: labels("Exportação dos resultados aprovados. Para alterar premissas e recalcular, submeta uma nova revisão na plataforma. Este arquivo não recalcula localmente e não constitui proposta ou compromisso de financiamento.", "Approved results export. To change assumptions and recalculate, submit a new review in the platform. This file does not recalculate locally and is not a financing offer or commitment.")},
  ]};
  material.presentationCharts = input.scenarios.flatMap((scenario, scenarioIndex) => [
    ["ebitda", "Geração operacional", "Operating earnings"],
    ["cfads", "Caixa disponível para pagar a dívida", "Cash available to service debt"],
    ["closingGrossDebt", "Evolução da dívida bruta", "Gross debt trajectory"],
    ["unrestrictedCash", "Evolução do caixa disponível", "Unrestricted cash trajectory"],
  ].map(([key, pt, en]) => ({title: labels(`${scenario.name}: ${pt}`, `${scenario.name}: ${en}`), series: {
    id: `institutional-${scenarioIndex}-${key}`, label: input.lang === "en" ? en! : pt!, unit: scenario.currency, chartKind: "column" as const,
    object: {id: `institutional-${scenarioIndex}`, type: "financial_model", fingerprint: input.artifactFingerprint, path: `scenarios.${scenarioIndex}.periods.${key}`},
    points: scenario.periods.map(period => ({label: period.period, value: Number(period[key as keyof InstitutionalStatementPeriod]), evidenceState: "calculated" as const, sourceIds: [...input.supportIds], assumptionIds: [], gapIds: []})),
  }})));
  return {...material, conductAudit: auditCompiledMaterial(material)};
}
