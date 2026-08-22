import {z} from "zod";

/**
 * Field groups. The first eight mirror the `intake_field_candidates.field_group`
 * check constraint that exists today; `debt`, `customers` and
 * `management_questions` are new and require a migration before candidates in
 * those groups can be persisted (tracked in the P1 plan, part 12).
 */
export const fieldGroupSchema = z.enum([
  "company",
  "transaction",
  "historical_financials",
  "interim_financials",
  "projections",
  "project",
  "leverage",
  "collateral",
  "debt",
  "customers",
  "management_questions",
]);
export type FieldGroup = z.infer<typeof fieldGroupSchema>;

export const persistedFieldGroups: readonly FieldGroup[] = [
  "company",
  "transaction",
  "historical_financials",
  "interim_financials",
  "projections",
  "project",
  "leverage",
  "collateral",
];

export const fieldValueTypeSchema = z.enum(["text", "number", "date", "boolean", "list"]);
export type FieldValueType = z.infer<typeof fieldValueTypeSchema>;

export const fieldUnitSchema = z.enum(["money", "percent", "ratio", "count", "months", "years", "days", "text", "date", "boolean", "list"]);
export type FieldUnit = z.infer<typeof fieldUnitSchema>;

export const materialitySchema = z.enum(["material", "supporting"]);
export type Materiality = z.infer<typeof materialitySchema>;

/**
 * How a text value is reduced to its canonical form — playbook data, not model behaviour.
 *
 * `digits` keeps only digits (a CNPJ is one number wearing punctuation: `12.345.678/0001-95`
 * and `12345678000195` are the same fact and must compare equal). `enum` maps free prose to a
 * closed vocabulary: "Fontes", "FONTES" and "origens" all mean `sources`, and a value that
 * maps to nothing is a value the field cannot hold. Synonym keys are matched after lowercase
 * and diacritics stripping.
 */
export type FieldCanonical =
  | {kind: "digits"}
  | {kind: "enum"; values: readonly string[]; synonyms: Readonly<Record<string, string>>};

export type FieldDefinition = {
  /** Pattern with placeholders: `{period}` (2025 | 2026_07), `{i}` (index), `{ytd}` (optional `_7m`/`_ytd`/`_ltm` suffix). */
  pattern: string;
  group: FieldGroup;
  valueType: FieldValueType;
  unit: FieldUnit;
  materiality: Materiality;
  requiresPeriod: boolean;
  requiresEntity: boolean;
  labels: {pt: string; en: string};
  synonyms: {pt: string[]; en: string[]};
  canonical?: FieldCanonical;
  description?: string;
};

type Shorthand = [pattern: string, group: FieldGroup, valueType: FieldValueType, unit: FieldUnit, materiality: Materiality, pt: string, en: string, synonymsPt?: string[], synonymsEn?: string[]];

const periodGroups: ReadonlySet<FieldGroup> = new Set(["historical_financials", "interim_financials", "projections"]);
const entityGroups: ReadonlySet<FieldGroup> = new Set(["historical_financials", "interim_financials", "projections", "leverage", "debt", "collateral"]);

const f = (...s: Shorthand): FieldDefinition => ({
  pattern: s[0],
  group: s[1],
  valueType: s[2],
  unit: s[3],
  materiality: s[4],
  requiresPeriod: periodGroups.has(s[1]) && s[0].includes("{period}"),
  requiresEntity: entityGroups.has(s[1]),
  labels: {pt: s[5], en: s[6]},
  synonyms: {pt: s[7] ?? [], en: s[8] ?? []},
});

/** Financial metrics that exist for historical, interim (with `{ytd}` suffix) and projected periods. */
const financialMetrics: Array<[key: string, pt: string, en: string, synonymsPt: string[], synonymsEn: string[]]> = [
  ["revenue", "Receita líquida", "Net revenue", ["receita operacional líquida", "receita líquida de vendas", "ROL"], ["net sales", "net operating revenue"]],
  ["gross_profit", "Lucro bruto", "Gross profit", ["resultado bruto"], []],
  ["cogs", "Custo dos produtos vendidos", "Cost of goods sold", ["cpv", "custo das vendas", "custo das mercadorias vendidas", "custos dos serviços"], ["cogs", "cost of sales"]],
  ["ebitda", "EBITDA", "EBITDA", ["lajida", "ebitda reportado"], ["reported ebitda"]],
  ["arr", "Receita recorrente anualizada (ARR)", "Annual recurring revenue (ARR)", ["arr", "receita recorrente anual"], ["annualised recurring revenue"]],
  ["mrr", "Receita recorrente mensal (MRR)", "Monthly recurring revenue (MRR)", ["mrr", "receita recorrente mensal"], ["monthly recurring"]],
  ["monthly_burn", "Queima de caixa mensal", "Monthly cash burn", ["burn", "queima mensal", "consumo de caixa"], ["net burn", "burn rate"]],
  ["adjusted_ebitda", "EBITDA ajustado", "Adjusted EBITDA", ["ebitda normalizado"], ["normalized ebitda"]],
  ["ebit", "EBIT", "EBIT", ["lajir", "resultado operacional"], ["operating income"]],
  ["net_income", "Lucro líquido", "Net income", ["resultado líquido do exercício", "lucro (prejuízo) líquido"], ["net profit"]],
  ["d_and_a", "Depreciação e amortização", "Depreciation and amortization", ["depreciação", "amortização"], ["d&a"]],
  ["financial_result", "Resultado financeiro", "Financial result", ["resultado financeiro líquido"], ["net financial result"]],
  ["financial_expenses", "Despesas financeiras", "Financial expenses", ["juros passivos", "despesas com juros"], ["interest expense"]],
  ["taxes", "IR e CSLL", "Income taxes", ["imposto de renda e contribuição social", "irpj/csll"], ["income tax"]],
  ["capex", "Capex", "Capex", ["investimentos", "aquisição de imobilizado"], ["capital expenditures"]],
  ["cash", "Caixa e equivalentes", "Cash and equivalents", ["disponibilidades", "caixa e aplicações"], ["cash"]],
  ["gross_debt", "Dívida bruta", "Gross debt", ["empréstimos e financiamentos", "endividamento bruto"], ["total debt", "borrowings"]],
  ["net_debt", "Dívida líquida", "Net debt", ["endividamento líquido"], []],
  ["receivables", "Contas a receber", "Receivables", ["clientes", "duplicatas a receber"], ["accounts receivable", "trade receivables"]],
  ["inventory", "Estoques", "Inventory", ["estoque"], ["inventories"]],
  ["payables", "Fornecedores", "Payables", ["contas a pagar a fornecedores"], ["accounts payable", "trade payables"]],
  ["equity", "Patrimônio líquido", "Equity", ["pl"], ["shareholders' equity"]],
  ["total_assets", "Ativo total", "Total assets", ["total do ativo"], []],
  ["cfo", "Fluxo de caixa operacional", "Operating cash flow", ["caixa gerado nas operações", "fco"], ["cash from operations"]],
  ["cfi", "Fluxo de caixa de investimento", "Investing cash flow", ["fci"], []],
  ["cff", "Fluxo de caixa de financiamento", "Financing cash flow", ["fcf de financiamento", "fcf"], []],
  ["free_cash_flow", "Fluxo de caixa livre", "Free cash flow", ["fcl"], ["fcf"]],
  ["working_capital", "Capital de giro", "Working capital", ["necessidade de capital de giro", "ncg"], ["net working capital"]],
];

const historical = financialMetrics.map(([key, pt, en, spt, sen]) => f(`historical_financials.{period}.${key}`, "historical_financials", "number", "money", "material", pt, en, spt, sen));
const interim = financialMetrics.map(([key, pt, en, spt, sen]) => f(`interim_financials.{period}.${key}{ytd}`, "interim_financials", "number", "money", "material", pt, en, spt, sen));
const projected = financialMetrics.map(([key, pt, en, spt, sen]) => f(`projections.{period}.${key}`, "projections", "number", "money", "material", `${pt} (projetado)`, `${en} (projected)`, spt, sen));

const withCanonical = (field: FieldDefinition, canonical: FieldCanonical): FieldDefinition => ({...field, canonical});

/** "Fontes"/"origens" and "usos"/"aplicações" reduce to the two sides a sources & uses table has. */
const sourcesUsesSide: FieldCanonical = {
  kind: "enum",
  values: ["sources", "uses"],
  synonyms: {
    fontes: "sources", fonte: "sources", origens: "sources", origem: "sources", entradas: "sources", source: "sources", sources: "sources",
    usos: "uses", uso: "uses", aplicacoes: "uses", aplicacao: "uses", destinacao: "uses", saidas: "uses", use: "uses", uses: "uses",
  },
};

/** A state is its UF: a document may write "São Paulo: SP" or "Minas Gerais", the fact is the sigla. */
const currencies: FieldCanonical = {
  kind: "enum",
  values: ["BRL", "USD", "EUR", "CLP", "PEN", "ARS", "GBP"],
  synonyms: {
    "r$": "BRL", rs: "BRL", brl: "BRL", real: "BRL", reais: "BRL",
    "us$": "USD", usd: "USD", "u$s": "USD", dolar: "USD", dolares: "USD", dollar: "USD", dollars: "USD",
    "€": "EUR", eur: "EUR", euro: "EUR", euros: "EUR",
    clp: "CLP", "peso chileno": "CLP", "pesos chilenos": "CLP",
    pen: "PEN", sol: "PEN", soles: "PEN", "novo sol": "PEN",
    ars: "ARS", "peso argentino": "ARS", "pesos argentinos": "ARS",
    gbp: "GBP", libra: "GBP", "libra esterlina": "GBP", pound: "GBP",
  },
};

const brazilianStates: FieldCanonical = {
  kind: "enum",
  values: ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"],
  synonyms: {
    acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF",
    "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
    "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI",
    "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO",
    roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
  },
};

export const fieldCatalog: readonly FieldDefinition[] = [
  // company
  f("company.legal_name", "company", "text", "text", "material", "Razão social", "Legal name", ["denominação social"], ["registered name"]),
  f("company.display_name", "company", "text", "text", "supporting", "Nome fantasia", "Trade name", ["nome fantasia", "marca"], ["brand"]),
  withCanonical(f("company.legal_identifier", "company", "text", "text", "material", "CNPJ", "Legal identifier (CNPJ)", ["cnpj"], ["tax id"]), {kind: "digits"}),
  f("company.jurisdiction", "company", "text", "text", "supporting", "Jurisdição", "Jurisdiction", ["país"], ["country"]),
  f("company.city", "company", "text", "text", "supporting", "Cidade", "City", ["município"], []),
  withCanonical(f("company.state", "company", "text", "text", "supporting", "Estado", "State", ["uf"], []), brazilianStates),
  f("company.website", "company", "text", "text", "supporting", "Site", "Website", ["website"], []),
  f("company.sector", "company", "text", "text", "supporting", "Setor", "Sector", ["segmento", "atividade"], ["industry"]),
  f("company.subsector", "company", "text", "text", "supporting", "Subsetor", "Subsector", [], []),
  f("company.founded_year", "company", "number", "years", "supporting", "Ano de fundação", "Founded", ["fundada em"], []),
  f("company.employees", "company", "number", "count", "supporting", "Funcionários", "Employees", ["colaboradores", "headcount"], []),
  f("company.description", "company", "text", "text", "supporting", "Descrição do negócio", "Business description", ["atividade principal"], []),
  f("company.group_structure.{i}.name", "company", "text", "text", "material", "Entidade do grupo", "Group entity", ["controlada", "coligada", "holding"], ["subsidiary"]),
  withCanonical(f("company.group_structure.{i}.legal_identifier", "company", "text", "text", "material", "CNPJ da entidade", "Entity legal identifier", ["cnpj"], []), {kind: "digits"}),
  f("company.group_structure.{i}.role", "company", "text", "text", "supporting", "Papel no grupo", "Role in group", [], []),
  f("company.group_structure.{i}.ownership_pct", "company", "number", "percent", "material", "Participação", "Ownership", ["participação societária"], ["stake"]),
  f("company.controllers.{i}.name", "company", "text", "text", "material", "Controlador", "Controller", ["acionista", "sócio", "quotista"], ["shareholder"]),
  f("company.controllers.{i}.ownership_pct", "company", "number", "percent", "material", "Participação do controlador", "Controller ownership", [], []),
  f("company.management.{i}.name", "company", "text", "text", "supporting", "Administrador", "Executive", ["diretor", "administrador"], ["officer"]),
  f("company.management.{i}.title", "company", "text", "text", "supporting", "Cargo", "Title", [], []),
  f("company.auditor.firm", "company", "text", "text", "material", "Auditor independente", "Independent auditor", ["auditoria"], ["auditor"]),
  f("company.auditor.opinion", "company", "text", "text", "material", "Opinião do auditor", "Audit opinion", ["sem ressalvas", "com ressalva", "abstenção", "adversa"], ["unqualified", "qualified", "disclaimer", "adverse"]),
  f("company.auditor.emphasis", "company", "list", "list", "material", "Ênfases", "Emphasis of matter", ["parágrafo de ênfase"], []),
  f("company.fiscal_year_end", "company", "text", "text", "supporting", "Encerramento do exercício", "Fiscal year end", [], []),
  withCanonical(f("company.reporting_currency", "company", "text", "text", "material", "Moeda de reporte", "Reporting currency", ["moeda"], ["currency"]), currencies),
  f("company.runway_months", "company", "number", "months", "material", "Runway (meses de caixa)", "Runway (months of cash)", ["runway", "meses de caixa"], ["cash runway"]),
  f("company.net_revenue_retention", "company", "number", "percent", "material", "Retenção líquida de receita (NRR)", "Net revenue retention (NRR)", ["nrr", "retenção líquida", "net retention"], ["ndr"]),
  f("company.monthly_churn_pct", "company", "number", "percent", "material", "Churn mensal", "Monthly churn", ["churn", "cancelamento"], ["logo churn"]),
  f("company.last_equity_round.amount", "company", "number", "money", "material", "Última rodada: valor", "Last equity round: amount", ["rodada", "captação de equity", "series a", "seed"], ["round size"]),
  f("company.last_equity_round.date", "company", "date", "date", "material", "Última rodada: data", "Last equity round: date", [], []),
  f("company.last_equity_round.lead_investor", "company", "text", "text", "supporting", "Última rodada: investidor líder", "Last equity round: lead investor", ["lead", "líder da rodada"], ["lead investor"]),
  f("company.last_equity_round.post_money_valuation", "company", "number", "money", "supporting", "Última rodada: valuation post-money", "Last equity round: post-money valuation", ["valuation", "post-money"], []),
  f("company.accounting_framework", "company", "text", "text", "supporting", "Prática contábil", "Accounting framework", ["br gaap", "cpc", "ifrs"], []),
  // transaction
  f("transaction.requested_amount", "transaction", "number", "money", "material", "Montante solicitado", "Requested amount", ["valor solicitado", "captação", "pedido"], ["amount requested", "ticket"]),
  withCanonical(f("transaction.currency", "transaction", "text", "text", "material", "Moeda", "Currency", ["moeda da operação"], ["deal currency"]), currencies),
  f("transaction.purpose", "transaction", "text", "text", "material", "Finalidade", "Purpose", ["destinação", "objetivo"], ["use of funds"]),
  f("transaction.use_of_proceeds.{i}.item", "transaction", "text", "text", "material", "Uso dos recursos: item", "Use of proceeds: item", ["destinação dos recursos"], []),
  f("transaction.use_of_proceeds.{i}.amount", "transaction", "number", "money", "material", "Uso dos recursos: valor", "Use of proceeds: amount", [], []),
  withCanonical(f("transaction.sources_and_uses.{i}.side", "transaction", "text", "text", "material", "Fontes e usos: lado", "Sources and uses: side", ["fontes", "usos"], ["sources", "uses"]), sourcesUsesSide),
  f("transaction.sources_and_uses.{i}.item", "transaction", "text", "text", "material", "Fontes e usos: item", "Sources and uses: item", [], []),
  f("transaction.sources_and_uses.{i}.amount", "transaction", "number", "money", "material", "Fontes e usos: valor", "Sources and uses: amount", [], []),
  f("transaction.desired_term_months", "transaction", "number", "months", "material", "Prazo desejado", "Desired tenor", ["prazo"], ["tenor"]),
  f("transaction.desired_grace_months", "transaction", "number", "months", "material", "Carência desejada", "Desired grace period", ["carência"], ["grace"]),
  f("transaction.timeline.{i}.milestone", "transaction", "text", "text", "supporting", "Marco", "Milestone", ["cronograma"], []),
  f("transaction.timeline.{i}.date", "transaction", "date", "date", "supporting", "Data do marco", "Milestone date", [], []),
  f("transaction.refinancing", "transaction", "number", "money", "material", "Refinanciamento", "Refinancing", ["rolagem", "alongamento"], ["refi"]),
  f("transaction.expansion_debt", "transaction", "number", "money", "material", "Dívida para expansão", "Expansion debt", ["nova dívida"], ["new money"]),
  f("transaction.guarantors_offered", "transaction", "list", "list", "material", "Garantidores oferecidos", "Guarantors offered", ["avalistas", "fiadores"], []),
  f("transaction.preferred_structure", "transaction", "text", "text", "supporting", "Estrutura preferida", "Preferred structure", [], []),
  // financials
  ...historical,
  ...interim,
  f("interim_financials.erp_reconciled", "interim_financials", "boolean", "boolean", "supporting", "ERP conciliado com auditado", "ERP reconciled to audited", [], []),
  ...projected,
  f("projections.{period}.key_assumptions.{i}.driver", "projections", "text", "text", "material", "Premissa: driver", "Assumption: driver", ["premissa"], ["assumption"]),
  f("projections.{period}.key_assumptions.{i}.value", "projections", "text", "text", "material", "Premissa: valor", "Assumption: value", [], []),
  f("projections.{period}.dscr", "projections", "number", "ratio", "material", "DSCR projetado", "Projected DSCR", [], []),
  f("projections.minimum_dscr", "projections", "number", "ratio", "material", "DSCR mínimo projetado", "Minimum projected DSCR", ["dscr mínimo"], []),
  f("projections.scenario_name", "projections", "text", "text", "supporting", "Nome do cenário", "Scenario name", ["cenário base"], ["base case"]),
  f("projections.method", "projections", "text", "text", "supporting", "Método de projeção", "Projection method", [], []),
  // project
  f("project.name", "project", "text", "text", "supporting", "Nome do projeto", "Project name", [], []),
  f("project.description", "project", "text", "text", "supporting", "Descrição do projeto", "Project description", [], []),
  f("project.total_cost", "project", "number", "money", "material", "Custo total do projeto", "Total project cost", ["investimento total", "capex total"], ["total investment"]),
  f("project.company_cash", "project", "number", "money", "material", "Caixa próprio no projeto", "Company cash contribution", ["recursos próprios"], ["equity from cash"]),
  f("project.shareholder_equity", "project", "number", "money", "material", "Aporte dos sócios", "Shareholder equity contribution", ["aporte de capital"], ["equity injection"]),
  f("project.third_party_debt", "project", "number", "money", "material", "Dívida de terceiros no projeto", "Third-party debt", [], []),
  f("project.investments.{i}.name", "project", "text", "text", "material", "Investimento: item/localidade", "Investment: item/location", ["loja", "unidade", "planta"], ["store", "site"]),
  f("project.investments.{i}.amount", "project", "number", "money", "material", "Investimento: valor", "Investment: amount", ["capex", "investimento"], []),
  f("project.capex_schedule.{i}.period", "project", "text", "text", "material", "Cronograma de capex: período", "Capex schedule: period", [], []),
  f("project.capex_schedule.{i}.amount", "project", "number", "money", "material", "Cronograma de capex: valor", "Capex schedule: amount", [], []),
  f("project.locations", "project", "list", "list", "supporting", "Localizações", "Locations", ["endereços", "unidades"], ["sites"]),
  f("project.timeline", "project", "text", "text", "supporting", "Cronograma do projeto", "Project timeline", ["prazo de obra"], []),
  f("project.unit_economics.{i}.driver", "project", "text", "text", "supporting", "Unit economics: driver", "Unit economics: driver", [], []),
  f("project.unit_economics.{i}.value", "project", "text", "text", "supporting", "Unit economics: valor", "Unit economics: value", [], []),
  f("project.permits_status", "project", "text", "text", "supporting", "Licenças e alvarás", "Permits status", ["licenciamento"], []),
  // leverage (pre/post transaction) — reported by the company; recalculated deterministically
  f("leverage.pre_transaction_net_debt_ebitda", "leverage", "number", "ratio", "material", "Dívida líquida / EBITDA (pré-transação)", "Net debt / EBITDA (pre-transaction)", ["alavancagem atual"], []),
  f("leverage.post_transaction_gross_debt", "leverage", "number", "money", "material", "Dívida bruta pós-transação", "Post-transaction gross debt", [], []),
  f("leverage.post_transaction_net_debt_ebitda", "leverage", "number", "ratio", "material", "Dívida líquida / EBITDA (pós-transação)", "Net debt / EBITDA (post-transaction)", ["alavancagem pro forma"], ["pro forma leverage"]),
  // debt instruments
  f("debt.instruments.{i}.lender", "debt", "text", "text", "material", "Credor ou emissão/série", "Lender or issuance/series", ["banco", "credor", "emissão", "série"], ["issuance", "series"]),
  f("debt.instruments.{i}.instrument_type", "debt", "text", "text", "material", "Instrumento", "Instrument", ["ccb", "debênture", "finame", "capital de giro"], []),
  f("debt.instruments.{i}.original_amount", "debt", "number", "money", "material", "Valor original", "Original amount", [], []),
  f("debt.instruments.{i}.balance", "debt", "number", "money", "material", "Saldo devedor", "Outstanding balance", ["saldo"], ["balance outstanding"]),
  f("debt.instruments.{i}.currency", "debt", "text", "text", "material", "Moeda", "Currency", ["moeda", "r$", "us$"], ["currency"]),
  f("debt.instruments.{i}.rate", "debt", "text", "text", "material", "Taxa", "Rate", ["cdi", "pré", "spread"], ["pricing"]),
  f("debt.instruments.{i}.maturity", "debt", "date", "date", "material", "Vencimento", "Maturity", [], []),
  f("debt.instruments.{i}.amortization", "debt", "text", "text", "material", "Amortização", "Amortization", ["price", "sac", "bullet"], []),
  f("debt.instruments.{i}.grace_months", "debt", "number", "months", "material", "Carência", "Grace", [], []),
  f("debt.instruments.{i}.collateral", "debt", "text", "text", "material", "Garantia", "Collateral", ["garantias"], []),
  f("debt.instruments.{i}.covenants", "debt", "list", "list", "material", "Covenants", "Covenants", [], []),
  f("debt.maturity_profile.{i}.window", "debt", "text", "text", "material", "Cronograma de amortização: janela", "Maturity profile: window", ["cronograma de amortizações", "vencimento por ano", "ano safra", "parcelas de empréstimos"], ["maturity profile", "amortisation schedule"]),
  f("debt.maturity_profile.{i}.amount", "debt", "number", "money", "material", "Cronograma de amortização: valor", "Maturity profile: amount", [], []),
  f("debt.total_gross", "debt", "number", "money", "material", "Dívida bruta total (mapa)", "Total gross debt (schedule)", [], []),
  f("debt.total_secured", "debt", "number", "money", "material", "Dívida garantida", "Secured debt", [], []),
  f("debt.covenants.{i}.metric", "debt", "text", "text", "material", "Covenant: métrica", "Covenant: metric", [], []),
  f("debt.covenants.{i}.threshold", "debt", "text", "text", "material", "Covenant: limite", "Covenant: threshold", [], []),
  f("debt.covenants.{i}.reported_headroom", "debt", "text", "text", "supporting", "Covenant: headroom informado", "Covenant: reported headroom", [], []),
  // collateral
  f("collateral.assets.{i}.type", "collateral", "text", "text", "material", "Ativo: tipo", "Asset: type", ["recebíveis", "estoque", "imóvel", "equipamento"], []),
  f("collateral.assets.{i}.description", "collateral", "text", "text", "supporting", "Ativo: descrição", "Asset: description", [], []),
  f("collateral.assets.{i}.book_value", "collateral", "number", "money", "material", "Ativo: valor contábil", "Asset: book value", [], []),
  f("collateral.assets.{i}.appraisal_value", "collateral", "number", "money", "material", "Ativo: valor de avaliação", "Asset: appraisal value", ["laudo"], []),
  f("collateral.assets.{i}.appraisal_date", "collateral", "date", "date", "supporting", "Ativo: data da avaliação", "Asset: appraisal date", [], []),
  f("collateral.assets.{i}.encumbrances", "collateral", "text", "text", "material", "Ativo: ônus", "Asset: encumbrances", ["alienação", "hipoteca", "gravame"], ["liens"]),
  f("collateral.assets.{i}.eligible_base", "collateral", "number", "money", "material", "Ativo: base elegível", "Asset: eligible base", [], []),
  f("collateral.assets.{i}.policy_haircut", "collateral", "number", "percent", "material", "Ativo: haircut", "Asset: haircut", [], []),
  f("collateral.receivables_capacity", "collateral", "number", "money", "material", "Capacidade: recebíveis", "Capacity: receivables", [], []),
  f("collateral.inventory_accounting", "collateral", "number", "money", "material", "Estoque contábil", "Inventory (accounting)", [], []),
  f("collateral.inventory_gross_base", "collateral", "number", "money", "material", "Estoque: base bruta", "Inventory: gross base", [], []),
  f("collateral.inventory_eligible", "collateral", "number", "money", "material", "Estoque: elegível", "Inventory: eligible", [], []),
  f("collateral.inventory_capacity", "collateral", "number", "money", "material", "Capacidade: estoque", "Capacity: inventory", [], []),
  f("collateral.property_equipment_capacity", "collateral", "number", "money", "material", "Capacidade: imóveis e equipamentos", "Capacity: property and equipment", [], []),
  f("collateral.total_capacity", "collateral", "number", "money", "material", "Capacidade total de garantias", "Total collateral capacity", [], []),
  // customers / suppliers
  f("customers.top_customers.{i}.name", "customers", "text", "text", "supporting", "Principal cliente", "Top customer", [], []),
  f("customers.top_customers.{i}.share_pct", "customers", "number", "percent", "material", "Participação do cliente na receita", "Customer share of revenue", ["concentração"], ["concentration"]),
  f("customers.top_suppliers.{i}.name", "customers", "text", "text", "supporting", "Principal fornecedor", "Top supplier", [], []),
  f("customers.top_suppliers.{i}.share_pct", "customers", "number", "percent", "material", "Participação do fornecedor", "Supplier share", [], []),
  f("customers.contract_terms", "customers", "text", "text", "supporting", "Termos contratuais", "Contract terms", [], []),
  f("customers.seasonality", "customers", "text", "text", "supporting", "Sazonalidade", "Seasonality", [], []),
  // management questions (answers become user_entry evidence)
  f("management_questions.{i}.question", "management_questions", "text", "text", "supporting", "Pergunta", "Question", [], []),
  f("management_questions.{i}.answer", "management_questions", "text", "text", "supporting", "Resposta", "Answer", [], []),
];

type CompiledField = {definition: FieldDefinition; regex: RegExp};

const compiled: CompiledField[] = fieldCatalog.map((definition) => ({definition, regex: compilePattern(definition.pattern)}));

export function compilePattern(pattern: string): RegExp {
  const escaped = pattern
    .split(".")
    .map((segment) =>
      segment
        .replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === "{" || m === "}" ? m : `\\${m}`))
        .replace("{period}", "(?<period>\\d{4}(?:_\\d{2})?)")
        .replace("{i}", "(?<index>\\d+)")
        .replace("{ytd}", "(?<window>_\\d{1,2}m|_ytd|_ltm)?"),
    )
    .join("\\.");
  return new RegExp(`^${escaped}$`);
}

export type ResolvedField = {
  definition: FieldDefinition;
  params: {period?: string; index?: number; window?: "ytd" | "ltm" | undefined; ytdMonths?: number};
};

/** Resolves a concrete field path (e.g. `interim_financials.2026_07.revenue_7m`) to its catalog definition. */
export function resolveFieldPath(path: string): ResolvedField | null {
  for (const {definition, regex} of compiled) {
    const match = regex.exec(path);
    if (!match) continue;
    const groups = match.groups ?? {};
    const params: ResolvedField["params"] = {};
    if (groups.period) params.period = groups.period;
    if (groups.index) params.index = Number(groups.index);
    if (groups.window) {
      const ytd = /^_(\d{1,2})m$/.exec(groups.window);
      if (ytd) {
        params.window = "ytd";
        params.ytdMonths = Number(ytd[1]);
      } else if (groups.window === "_ytd") {
        params.window = "ytd";
      } else if (groups.window === "_ltm") {
        params.window = "ltm";
      }
    }
    return {definition, params};
  }
  return null;
}

export function fieldsForGroup(group: FieldGroup): FieldDefinition[] {
  return fieldCatalog.filter((definition) => definition.group === group);
}

export function isMaterialFieldPath(path: string): boolean {
  return resolveFieldPath(path)?.definition.materiality === "material";
}
