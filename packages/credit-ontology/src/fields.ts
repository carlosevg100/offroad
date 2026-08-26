import {z} from "zod";

/**
 * Field groups mirror the production `intake_field_candidates.field_group`
 * constraint. Keep this enum and the database constraint in lockstep so every
 * governed candidate can cross the persistence boundary without widening it.
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
  "debt",
  "customers",
  "management_questions",
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
  /** Pattern with placeholders: `{period}` (2025 | 2026_07), `{i}` (index), `{j}` (nested index), `{ytd}` (optional `_7m`/`_ytd`/`_ltm` suffix). */
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
  ["financial_expenses", "Despesas financeiras", "Financial expenses", ["juros passivos", "despesas com juros", "resultado financeiro", "resultado financeiro líquido", "despesas financeiras líquidas"], ["interest expense", "net financial result", "net finance cost"]],
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
  ["cash_taxes", "Impostos pagos em caixa", "Cash taxes", ["tributos pagos", "ir e csll pagos"], ["cash taxes paid"]],
  ["maintenance_capex", "Capex de manutenção", "Maintenance capex", ["investimento de manutenção"], ["maintenance capital expenditures"]],
  ["growth_capex", "Capex de expansão", "Growth capex", ["capex de crescimento", "investimento de expansão"], ["expansion capex"]],
  ["working_capital_investment", "Investimento em capital de giro", "Working capital investment", ["variação de ncg"], ["change in working capital"]],
  ["fixed_charges", "Encargos fixos de caixa", "Fixed cash charges", ["aluguéis e encargos fixos"], ["fixed charges"]],
  ["approved_cash_adjustments", "Ajustes de caixa aprovados", "Approved cash adjustments", ["ajustes de caixa"], ["cash adjustments"]],
  ["restricted_cash", "Caixa restrito", "Restricted cash", ["caixa bloqueado", "conta reserva"], ["restricted cash", "reserve account"]],
  ["total_liabilities_equity", "Passivo e patrimônio líquido", "Total liabilities and equity", ["total do passivo e pl"], ["total liabilities and equity"]],
  ["opening_cash", "Caixa inicial", "Opening cash", ["saldo inicial de caixa"], ["opening cash balance"]],
  ["net_change_in_cash", "Variação líquida de caixa", "Net change in cash", ["variação de caixa"], ["cash movement"]],
  ["closing_cash", "Caixa final", "Closing cash", ["saldo final de caixa"], ["closing cash balance"]],
];

const historical = financialMetrics.map(([key, pt, en, spt, sen]) => f(`historical_financials.{period}.${key}`, "historical_financials", "number", "money", "material", pt, en, spt, sen));
const interim = financialMetrics.map(([key, pt, en, spt, sen]) => f(`interim_financials.{period}.${key}{ytd}`, "interim_financials", "number", "money", "material", pt, en, spt, sen));
const projected = financialMetrics.map(([key, pt, en, spt, sen]) => f(`projections.{period}.${key}`, "projections", "number", "money", "material", `${pt} (projetado)`, `${en} (projected)`, spt, sen));

const sf = (pattern: string, valueType: FieldValueType, unit: FieldUnit, pt: string, en: string) =>
  f(pattern, "transaction", valueType, unit, "material", pt, en);
const structureFields: FieldDefinition[] = [
  sf("structure.capacity.covenant_limit", "number", "money", "Limite por covenant existente", "Existing covenant capacity limit"),
  sf("structure.mandate.ticket_min", "number", "money", "Tíquete mínimo do mandato", "Mandate minimum ticket"),
  sf("structure.mandate.ticket_max", "number", "money", "Tíquete máximo do mandato", "Mandate maximum ticket"),
  sf("structure.term_months", "number", "months", "Prazo proposto", "Proposed tenor"),
  sf("structure.grace_months", "number", "months", "Carência proposta", "Proposed grace"),
  sf("structure.amortization_format", "text", "text", "Formato de amortização", "Amortisation format"),
  sf("structure.sizing_annual_rate", "number", "percent", "Taxa anual para dimensionamento", "Annual sizing rate"),
  sf("structure.rate_convention", "text", "text", "Convenção da taxa", "Rate convention"),
  sf("structure.grace_interest", "text", "text", "Juros durante a carência", "Interest during grace"),
  sf("structure.balloon_percent", "number", "percent", "Percentual de balão", "Balloon percentage"),
  sf("structure.bullet_repayment_source", "text", "text", "Fonte de repagamento do bullet", "Bullet repayment source"),
  sf("structure.cfads_scenarios.{i}.name", "text", "text", "Cenário de CFADS", "CFADS scenario"),
  sf("structure.cfads_scenarios.{i}.periods.{j}.period", "number", "count", "Período do cenário", "Scenario period"),
  sf("structure.cfads_scenarios.{i}.periods.{j}.cfads", "number", "money", "CFADS do período", "Period CFADS"),
  sf("structure.seasonality.material", "boolean", "boolean", "Sazonalidade material", "Material seasonality"),
  sf("structure.seasonality.design", "text", "text", "Desenho sazonal proposto", "Proposed seasonal design"),
  sf("structure.seasonality.reserve_mechanism", "text", "text", "Mecanismo de liquidez sazonal", "Seasonal liquidity mechanism"),
  sf("structure.project_milestones.{i}.description", "text", "text", "Marco físico do projeto", "Project physical milestone"),
  sf("structure.project_milestones.{i}.date", "date", "date", "Data do marco físico", "Physical milestone date"),
  sf("structure.reserve.months", "number", "months", "Meses de conta reserva", "Reserve account months"),
  sf("structure.reserve.funding", "text", "text", "Formação da conta reserva", "Reserve account funding"),
  sf("structure.reserve.replenishment", "text", "text", "Recomposição da conta reserva", "Reserve replenishment"),
  sf("structure.reserve.lockup", "text", "text", "Trava da conta reserva", "Reserve lock-up"),
  sf("structure.bank_guarantee.provider", "text", "text", "Garantidor bancário", "Bank guarantee provider"),
  sf("structure.bank_guarantee.rating", "text", "text", "Rating do garantidor", "Guarantor rating"),
  sf("structure.bank_guarantee.expiry", "date", "date", "Vencimento da garantia", "Guarantee expiry"),
  sf("structure.bank_guarantee.renewal", "text", "text", "Renovação da garantia", "Guarantee renewal"),
  sf("structure.bank_guarantee.exclusions", "list", "list", "Exclusões da garantia", "Guarantee exclusions"),
  sf("structure.dedicated_flow.perimeter", "text", "text", "Perímetro do fluxo dedicado", "Dedicated flow perimeter"),
  sf("structure.dedicated_flow.waterfall", "text", "text", "Cascata de pagamentos", "Payment waterfall"),
  sf("structure.dedicated_flow.incremental_cost", "number", "money", "Custo incremental da estrutura", "Incremental structure cost"),
  sf("structure.shared_security.status", "text", "text", "Status da garantia compartilhada", "Shared security status"),
  sf("structure.shared_security.release_path", "text", "text", "Caminho de liberação", "Security release path"),
  sf("structure.shared_security.intercreditor_path", "text", "text", "Caminho de intercreditor", "Intercreditor path"),
  ...[
    ["receivables", "domicile_account"], ["receivables", "coverage_ratio"], ["receivables", "replenishment_rule"], ["receivables", "eligibility"],
    ["property", "independent_appraisal"], ["property", "appraisal_date"], ["property", "title_and_lien_search"], ["property", "liquidity_adjustment"],
    ["inventory", "independent_monitoring"], ["inventory", "custodian"], ["inventory", "identifiability"], ["inventory", "minimum_turnover"],
    ["equipment", "resale_evidence"], ["equipment", "useful_life"], ["equipment", "insurance"], ["equipment", "registered_lien"],
    ["vehicles", "resale_evidence"], ["vehicles", "useful_life"], ["vehicles", "insurance"], ["vehicles", "registered_lien"],
    ["shares", "shareholders_agreement"], ["shares", "enforcement_feasibility"], ["shares", "rights_while_outstanding"],
    ["guarantee", "existing_guarantees"], ["guarantee", "evidenced_reachable_net_worth"],
  ].map(([asset, check]) => sf(`structure.security.${asset}.${check}`, "boolean", "boolean", `Verificação de garantia: ${asset} ${check}`, `Security check: ${asset} ${check}`)),
  sf("structure.covenants.{i}.name", "text", "text", "Covenant proposto", "Proposed covenant"),
  sf("structure.covenants.{i}.definition", "text", "text", "Definição do covenant", "Covenant definition"),
  sf("structure.covenants.{i}.limit", "number", "ratio", "Limite do covenant", "Covenant limit"),
  sf("structure.covenants.{i}.frequency", "text", "text", "Frequência do covenant", "Covenant frequency"),
  sf("structure.covenants.{i}.cure", "text", "text", "Cura do covenant", "Covenant cure"),
  ...["dividends", "negative_pledge", "additional_debt", "cross_default", "cash_sweep", "reporting", "cure_waiver", "acceleration", "change_of_control", "mac"].map((clause) =>
    sf(`structure.${clause}.summary`, "text", "text", `Cláusula indicativa: ${clause}`, `Indicative clause: ${clause}`),
  ),
  ...["debt", "ebitda", "cash", "cfads", "ifrs16"].map((term) =>
    sf(`structure.definitions.${term}`, "text", "text", `Definição: ${term}`, `Definition: ${term}`),
  ),
  sf("structure.issuer.entity", "text", "text", "Emissor proposto", "Proposed issuer"),
  sf("structure.issuer.justification", "text", "text", "Justificativa do emissor", "Issuer rationale"),
  sf("structure.issuer.compensations.{i}.description", "text", "text", "Compensação estrutural", "Structural compensation"),
  sf("structure.guarantors.{i}.entity", "text", "text", "Garantidor do grupo", "Group guarantor"),
  sf("structure.guarantors.{i}.limit", "number", "money", "Limite do garantidor", "Guarantor limit"),
  sf("structure.guarantors.{i}.authority_confirmed", "boolean", "boolean", "Autorização do garantidor confirmada", "Guarantor authority confirmed"),
  sf("structure.structural_subordination.exists", "boolean", "boolean", "Subordinação estrutural", "Structural subordination"),
  sf("structure.structural_subordination.mitigation", "text", "text", "Mitigação da subordinação", "Subordination mitigation"),
  sf("structure.intercreditor.creditor_map", "text", "text", "Mapa de credores", "Creditor map"),
  sf("structure.intercreditor.consents", "text", "text", "Consentimentos necessários", "Required consents"),
  sf("structure.intercreditor.priority", "text", "text", "Prioridade pretendida", "Intended priority"),
  sf("structure.intercreditor.standstill", "text", "text", "Standstill indicativo", "Indicative standstill"),
  sf("structure.day_one.negative_pledge_compliant", "boolean", "boolean", "Compatibilidade com negative pledge", "Negative pledge compatibility"),
  sf("structure.day_one.corporate_authority_complete", "boolean", "boolean", "Autorização societária completa", "Corporate authority complete"),
  sf("structure.selected_instrument", "text", "text", "Instrumento selecionado", "Selected instrument"),
  sf("structure.target_buyer", "text", "text", "Comprador alvo", "Target buyer"),
  sf("structure.all_in", "text", "text", "Custo all-in indicativo", "Indicative all-in cost"),
];

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
  f("transaction.sources_and_uses.{i}.entity", "transaction", "text", "text", "material", "Fontes e usos: entidade", "Sources and uses: entity", ["tomador", "pagador"], ["borrower", "payer"]),
  withCanonical(f("transaction.sources_and_uses.{i}.currency", "transaction", "text", "text", "material", "Fontes e usos: moeda", "Sources and uses: currency", [], []), currencies),
  f("transaction.sources_and_uses.{i}.date", "transaction", "date", "date", "material", "Fontes e usos: data", "Sources and uses: date", [], []),
  f("transaction.sources_and_uses.{i}.tranche", "transaction", "text", "text", "material", "Fontes e usos: tranche", "Sources and uses: tranche", ["parcela"], []),
  f("transaction.sources_and_uses.{i}.condition", "transaction", "text", "text", "material", "Fonte disponível ou condicional", "Available or conditional source", ["condicionada"], ["conditional"]),
  f("transaction.incremental_working_capital", "transaction", "number", "money", "material", "Capital de giro incremental", "Incremental working capital", ["ncg incremental"], []),
  f("transaction.transaction_costs", "transaction", "number", "money", "material", "Custos da operação", "Transaction costs", ["fees", "despesas da emissão"], []),
  f("transaction.execution_buffer", "transaction", "number", "money", "material", "Reserva de execução", "Execution buffer", ["contingência", "buffer"], ["contingency"]),
  f("transaction.self_funding", "transaction", "number", "money", "material", "Autofinanciamento", "Self funding", ["recursos próprios"], ["own funds"]),
  f("transaction.refinanced_debt", "transaction", "number", "money", "material", "Dívida liquidada pela operação", "Debt refinanced by the transaction", ["dívida refinanciada"], []),
  f("transaction.fees_paid_from_cash", "transaction", "number", "money", "material", "Custos pagos com caixa", "Fees paid from cash", [], []),
  ...structureFields,
  f("transaction.incremental_working_capital_schedule.{i}.period", "transaction", "text", "text", "material", "NCG incremental: período", "Incremental working capital: period", [], []),
  f("transaction.incremental_working_capital_schedule.{i}.incremental_revenue", "transaction", "number", "money", "material", "NCG incremental: receita", "Incremental working capital: revenue", [], []),
  f("transaction.incremental_working_capital_schedule.{i}.incremental_cogs", "transaction", "number", "money", "material", "NCG incremental: custo", "Incremental working capital: COGS", [], []),
  f("transaction.incremental_working_capital_schedule.{i}.dso_days", "transaction", "number", "days", "material", "NCG incremental: prazo de recebimento", "Incremental working capital: DSO", [], []),
  f("transaction.incremental_working_capital_schedule.{i}.dio_days", "transaction", "number", "days", "material", "NCG incremental: prazo de estoque", "Incremental working capital: DIO", [], []),
  f("transaction.incremental_working_capital_schedule.{i}.dpo_days", "transaction", "number", "days", "material", "NCG incremental: prazo de fornecedores", "Incremental working capital: DPO", [], []),
  f("transaction.incremental_working_capital_schedule.{i}.taxes_and_other_operating", "transaction", "number", "money", "material", "NCG incremental: impostos e outros", "Incremental working capital: taxes and other", [], []),
  f("transaction.incremental_working_capital_schedule.{i}.days_in_period", "transaction", "number", "days", "material", "NCG incremental: dias no período", "Incremental working capital: days in period", [], []),
  f("transaction.tranches.{i}.amount", "transaction", "number", "money", "material", "Tranche: valor", "Tranche: amount", [], []),
  f("transaction.tranches.{i}.milestone", "transaction", "text", "text", "material", "Tranche: marco", "Tranche: milestone", [], []),
  f("transaction.tranches.{i}.evidence", "transaction", "text", "text", "material", "Tranche: evidência", "Tranche: evidence", [], []),
  f("transaction.tranches.{i}.attestor", "transaction", "text", "text", "material", "Tranche: atestador", "Tranche: attestor", [], []),
  f("transaction.tranches.{i}.release_days", "transaction", "number", "days", "material", "Tranche: prazo de liberação", "Tranche: release time", [], []),
  f("transaction.conditions_precedent.{i}.condition", "transaction", "text", "text", "material", "Condição precedente", "Condition precedent", [], []),
  f("transaction.conditions_precedent.{i}.owner", "transaction", "text", "text", "material", "Condição precedente: responsável", "Condition precedent: owner", [], []),
  f("transaction.conditions_precedent.{i}.evidence", "transaction", "text", "text", "material", "Condição precedente: evidência", "Condition precedent: evidence", [], []),
  f("transaction.conditions_precedent.{i}.deadline", "transaction", "date", "date", "material", "Condição precedente: prazo", "Condition precedent: deadline", [], []),
  f("transaction.conditions_precedent.{i}.status", "transaction", "text", "text", "material", "Condição precedente: estado", "Condition precedent: status", [], []),
  f("transaction.bridge.amount", "transaction", "number", "money", "material", "Ponte: valor", "Bridge: amount", [], []),
  f("transaction.bridge.takeout", "transaction", "text", "text", "material", "Ponte: take-out", "Bridge: take-out", [], []),
  f("transaction.bridge.takeout_failure_risk", "transaction", "text", "text", "material", "Ponte: risco do take-out", "Bridge: take-out risk", [], []),
  f("transaction.bridge.plan_b", "transaction", "text", "text", "material", "Ponte: alternativa", "Bridge: alternative", [], []),
  f("transaction.disbursement_schedule.{i}.period", "transaction", "text", "text", "material", "Desembolso: período", "Disbursement: period", [], []),
  f("transaction.disbursement_schedule.{i}.opening_liquidity", "transaction", "number", "money", "material", "Desembolso: liquidez inicial", "Disbursement: opening liquidity", [], []),
  f("transaction.disbursement_schedule.{i}.sources", "transaction", "number", "money", "material", "Desembolso: fontes", "Disbursement: sources", [], []),
  f("transaction.disbursement_schedule.{i}.uses", "transaction", "number", "money", "material", "Desembolso: usos", "Disbursement: uses", [], []),
  f("transaction.wait.milestone", "transaction", "text", "text", "material", "Espera: marco", "Wait: milestone", [], []),
  f("transaction.wait.date", "transaction", "date", "date", "material", "Espera: data", "Wait: date", [], []),
  f("transaction.wait.cost", "transaction", "number", "money", "material", "Espera: custo", "Wait: cost", [], []),
  f("transaction.wait.estimated_gain", "transaction", "number", "money", "material", "Espera: ganho estimado", "Wait: estimated gain", [], []),
  f("transaction.wait.decision", "transaction", "text", "text", "material", "Espera: decisão do cliente", "Wait: client decision", [], []),
  f("transaction.use_blocks.{i}.category", "transaction", "text", "text", "material", "Bloco de uso: categoria", "Use block: category", [], []),
  f("transaction.use_blocks.{i}.amount", "transaction", "number", "money", "material", "Bloco de uso: valor", "Use block: amount", [], []),
  f("transaction.use_blocks.{i}.description", "transaction", "text", "text", "material", "Bloco de uso: descrição", "Use block: description", [], []),
  f("transaction.declared_version", "transaction", "text", "text", "material", "Versão declarada da operação", "Declared transaction version", [], []),
  f("transaction.declared_version_confirmed_at", "transaction", "date", "date", "material", "Versão confirmada em", "Version confirmed at", [], []),
  f("transaction.material_change_since_confirmation", "transaction", "boolean", "boolean", "material", "Mudança material desde a confirmação", "Material change since confirmation", [], []),
  f("transaction.capacity_scenarios.{i}.name", "transaction", "text", "text", "material", "Capacidade: cenário", "Capacity: scenario", ["cenário base", "downside"], ["base case", "downside"]),
  f("transaction.capacity_scenarios.{i}.dscr", "transaction", "number", "ratio", "material", "Capacidade: DSCR", "Capacity: DSCR", [], []),
  f("transaction.capacity_scenarios.{i}.liquidity_deficit", "transaction", "number", "money", "material", "Capacidade: déficit de liquidez", "Capacity: liquidity deficit", [], []),
  f("transaction.effects.solves.{i}.description", "transaction", "text", "text", "material", "O que a operação resolve", "What the transaction solves", [], []),
  f("transaction.effects.does_not_touch.{i}.description", "transaction", "text", "text", "material", "O que a operação não altera", "What the transaction does not change", [], []),
  f("transaction.effects.creates.{i}.description", "transaction", "text", "text", "material", "O que a operação cria", "What the transaction creates", [], []),
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
  f("historical_financials.{period}.normalization_adjustments.{i}.description", "historical_financials", "text", "text", "material", "Ajuste: descrição", "Adjustment: description", ["ajuste de ebitda"], ["ebitda adjustment"]),
  f("historical_financials.{period}.normalization_adjustments.{i}.amount", "historical_financials", "number", "money", "material", "Ajuste: valor", "Adjustment: amount", ["valor do ajuste"], []),
  f("historical_financials.{period}.normalization_adjustments.{i}.decision", "historical_financials", "text", "text", "material", "Ajuste: decisão", "Adjustment: decision", ["aceito", "rejeitado"], ["accepted", "rejected"]),
  f("historical_financials.{period}.normalization_adjustments.{i}.rationale", "historical_financials", "text", "text", "material", "Ajuste: racional", "Adjustment: rationale", ["racional do ajuste"], []),
  f("interim_financials.{period}.normalization_adjustments.{i}.description", "interim_financials", "text", "text", "material", "Ajuste: descrição", "Adjustment: description", ["ajuste de ebitda"], ["ebitda adjustment"]),
  f("interim_financials.{period}.normalization_adjustments.{i}.amount", "interim_financials", "number", "money", "material", "Ajuste: valor", "Adjustment: amount", ["valor do ajuste"], []),
  f("interim_financials.{period}.normalization_adjustments.{i}.decision", "interim_financials", "text", "text", "material", "Ajuste: decisão", "Adjustment: decision", ["aceito", "rejeitado"], ["accepted", "rejected"]),
  f("interim_financials.{period}.normalization_adjustments.{i}.rationale", "interim_financials", "text", "text", "material", "Ajuste: racional", "Adjustment: rationale", ["racional do ajuste"], []),
  f("projections.{period}.key_assumptions.{i}.driver", "projections", "text", "text", "material", "Premissa: driver", "Assumption: driver", ["premissa"], ["assumption"]),
  f("projections.{period}.key_assumptions.{i}.value", "projections", "text", "text", "material", "Premissa: valor", "Assumption: value", [], []),
  f("projections.{period}.dscr", "projections", "number", "ratio", "material", "DSCR projetado", "Projected DSCR", [], []),
  f("projections.minimum_dscr", "projections", "number", "ratio", "material", "DSCR mínimo projetado", "Minimum projected DSCR", ["dscr mínimo"], []),
  f("projections.scenario_name", "projections", "text", "text", "supporting", "Nome do cenário", "Scenario name", ["cenário base"], ["base case"]),
  f("projections.scenario.{i}.name", "projections", "text", "text", "material", "Cenário: nome", "Scenario: name", ["cenário base", "downside"], ["base case", "stress case"]),
  f("projections.scenario.{i}.period", "projections", "text", "text", "material", "Cenário: período", "Scenario: period", ["ano projetado"], ["projected year"]),
  f("projections.scenario.{i}.metric", "projections", "text", "text", "material", "Cenário: métrica", "Scenario: metric", ["premissa"], ["assumption"]),
  f("projections.scenario.{i}.company_value", "projections", "number", "money", "material", "Cenário: valor da companhia", "Scenario: company value", [], []),
  f("projections.scenario.{i}.desk_value", "projections", "number", "money", "material", "Cenário: valor Offroad", "Scenario: Offroad value", [], []),
  f("projections.scenario.{i}.driver", "projections", "text", "text", "material", "Cenário: driver", "Scenario: driver", ["premissa operacional"], ["operating driver"]),
  f("historical_financials.monthly.{i}.month", "historical_financials", "date", "date", "material", "Série mensal: mês", "Monthly series: month", [], []),
  f("historical_financials.monthly.{i}.revenue", "historical_financials", "number", "money", "material", "Série mensal: receita", "Monthly series: revenue", ["faturamento mensal"], ["monthly revenue"]),
  f("historical_financials.monthly.{i}.working_capital", "historical_financials", "number", "money", "material", "Série mensal: NCG", "Monthly series: working capital", ["ncg mensal"], ["monthly working capital"]),
  f("historical_financials.currency_mix.{i}.currency", "historical_financials", "text", "text", "material", "Moeda da exposição", "Exposure currency", [], []),
  f("historical_financials.currency_mix.{i}.revenue", "historical_financials", "number", "money", "material", "Receita por moeda", "Revenue by currency", [], []),
  f("historical_financials.currency_mix.{i}.cost", "historical_financials", "number", "money", "material", "Custo por moeda", "Cost by currency", [], []),
  f("historical_financials.currency_mix.{i}.debt_service", "historical_financials", "number", "money", "material", "Serviço da dívida por moeda", "Debt service by currency", [], []),
  f("historical_financials.currency_mix.{i}.hedge", "historical_financials", "number", "money", "material", "Hedge por moeda", "Hedge by currency", [], []),
  f("historical_financials.receivables_aging.{i}.bucket", "historical_financials", "text", "text", "material", "Aging: faixa", "Aging: bucket", ["a vencer", "90+"], ["current", "90+"] ),
  f("historical_financials.receivables_aging.{i}.amount", "historical_financials", "number", "money", "material", "Aging: valor", "Aging: amount", [], []),
  f("historical_financials.inventory_aging.{i}.bucket", "historical_financials", "text", "text", "material", "Estoque: faixa de idade", "Inventory: age bucket", [], []),
  f("historical_financials.inventory_aging.{i}.amount", "historical_financials", "number", "money", "material", "Estoque: valor por idade", "Inventory: amount by age", [], []),
  f("projections.method", "projections", "text", "text", "supporting", "Método de projeção", "Projection method", [], []),
  // project
  f("project.name", "project", "text", "text", "supporting", "Nome do projeto", "Project name", [], []),
  f("project.description", "project", "text", "text", "supporting", "Descrição do projeto", "Project description", [], []),
  f("project.total_cost", "project", "number", "money", "material", "Custo total do projeto", "Total project cost", ["investimento total", "capex total"], ["total investment"]),
  f("project.ramp_up_months", "project", "number", "months", "material", "Ramp-up do projeto", "Project ramp-up", ["rampa de maturação"], ["ramp-up period"]),
  f("project.company_cash", "project", "number", "money", "material", "Caixa próprio no projeto", "Company cash contribution", ["recursos próprios"], ["equity from cash"]),
  f("project.shareholder_equity", "project", "number", "money", "material", "Aporte dos sócios", "Shareholder equity contribution", ["aporte de capital"], ["equity injection"]),
  f("project.third_party_debt", "project", "number", "money", "material", "Dívida de terceiros no projeto", "Third-party debt", [], []),
  f("project.investments.{i}.name", "project", "text", "text", "material", "Investimento: item/localidade", "Investment: item/location", ["loja", "unidade", "planta"], ["store", "site"]),
  f("project.investments.{i}.amount", "project", "number", "money", "material", "Investimento: valor", "Investment: amount", ["capex", "investimento"], []),
  f("project.investments.{i}.stabilized_revenue", "project", "number", "money", "material", "Receita estabilizada da unidade", "Stabilized unit revenue", ["receita estabilizada"], ["stabilized revenue"]),
  f("project.investments.{i}.stabilized_ebitda_margin", "project", "number", "ratio", "material", "Margem EBITDA estabilizada da unidade", "Stabilized unit EBITDA margin", ["margem EBITDA estabilizada"], ["stabilized EBITDA margin"]),
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
  f("debt.instruments.{i}.borrower", "debt", "text", "text", "material", "Devedor contratual", "Contractual borrower", ["tomador", "emitente"], ["borrower", "issuer"]),
  f("debt.instruments.{i}.entity", "debt", "text", "text", "material", "Entidade devedora", "Obligor entity", ["entidade", "cnpj devedor"], ["obligor"]),
  f("debt.instruments.{i}.contract_id", "debt", "text", "text", "supporting", "Contrato, emissão ou série", "Contract, issuance or series", ["número do contrato"], ["contract number"]),
  f("debt.instruments.{i}.instrument_type", "debt", "text", "text", "material", "Instrumento", "Instrument", ["ccb", "debênture", "finame", "capital de giro"], []),
  f("debt.instruments.{i}.original_amount", "debt", "number", "money", "material", "Valor original", "Original amount", [], []),
  f("debt.instruments.{i}.balance", "debt", "number", "money", "material", "Saldo devedor", "Outstanding balance", ["saldo"], ["balance outstanding"]),
  f("debt.instruments.{i}.principal", "debt", "number", "money", "material", "Principal", "Principal", ["saldo de principal"], ["principal outstanding"]),
  f("debt.instruments.{i}.accrued_interest", "debt", "number", "money", "material", "Juros apropriados", "Accrued interest", ["juros acumulados"], []),
  f("debt.instruments.{i}.pik", "debt", "number", "money", "material", "Juros capitalizados", "PIK balance", ["juros capitalizados", "pik"], ["payment in kind"]),
  f("debt.instruments.{i}.indexation_balance", "debt", "number", "money", "material", "Atualização monetária", "Indexation balance", ["correção monetária"], ["indexation"]),
  f("debt.instruments.{i}.currency", "debt", "text", "text", "material", "Moeda", "Currency", ["moeda", "r$", "us$"], ["currency"]),
  f("debt.instruments.{i}.indexer", "debt", "text", "text", "material", "Indexador", "Indexer", ["CDI", "IPCA", "TLP"], ["benchmark"]),
  f("debt.instruments.{i}.spread", "debt", "number", "percent", "material", "Spread anual", "Annual spread", ["spread", "sobretaxa"], ["margin"]),
  f("debt.instruments.{i}.rate", "debt", "text", "text", "material", "Taxa", "Rate", ["cdi", "pré", "spread"], ["pricing"]),
  f("debt.instruments.{i}.cash_cost", "debt", "text", "text", "material", "Custo caixa", "Cash cost", ["taxa caixa"], ["cash interest"]),
  f("debt.instruments.{i}.accounting_cost", "debt", "text", "text", "supporting", "Custo contábil", "Accounting cost", ["taxa efetiva"], ["effective interest rate"]),
  f("debt.instruments.{i}.all_in_cost", "debt", "text", "text", "material", "Custo all-in", "All-in cost", ["custo total"], ["all in yield"]),
  f("debt.instruments.{i}.fees", "debt", "number", "money", "material", "Fees e custos da dívida", "Debt fees and costs", ["tarifas", "fee"], ["fees"]),
  f("debt.instruments.{i}.average_balance", "debt", "number", "money", "material", "Saldo médio do período", "Average period balance", ["saldo médio"], ["average balance"]),
  f("debt.instruments.{i}.cash_interest", "debt", "number", "money", "material", "Juros caixa do período", "Period cash interest", ["juros pagos"], ["cash interest paid"]),
  f("debt.instruments.{i}.accounting_interest", "debt", "number", "money", "material", "Juros contábeis do período", "Period accounting interest", ["juros apropriados no resultado"], ["accrued interest expense"]),
  f("debt.instruments.{i}.issue_date", "debt", "date", "date", "supporting", "Data de emissão", "Issue date", ["emissão"], []),
  f("debt.instruments.{i}.draw_date", "debt", "date", "date", "supporting", "Data de desembolso", "Draw date", ["desembolso"], []),
  f("debt.instruments.{i}.maturity", "debt", "date", "date", "material", "Vencimento", "Maturity", [], []),
  f("debt.instruments.{i}.amortization", "debt", "text", "text", "material", "Amortização", "Amortization", ["price", "sac", "bullet"], []),
  f("debt.instruments.{i}.grace_months", "debt", "number", "months", "material", "Carência", "Grace", [], []),
  f("debt.instruments.{i}.collateral", "debt", "text", "text", "material", "Garantia", "Collateral", ["garantias"], []),
  f("debt.instruments.{i}.collateral_owner", "debt", "text", "text", "material", "Titular da garantia", "Collateral owner", ["proprietário da garantia"], []),
  f("debt.instruments.{i}.collateral_value", "debt", "number", "money", "material", "Valor da garantia", "Collateral value", ["valor garantido"], []),
  f("debt.instruments.{i}.lien", "debt", "text", "text", "material", "Ônus e gravame", "Lien", ["gravame", "ônus"], []),
  f("debt.instruments.{i}.priority", "debt", "text", "text", "material", "Prioridade", "Priority", ["senioridade"], ["seniority"]),
  f("debt.instruments.{i}.hedge", "debt", "text", "text", "material", "Hedge", "Hedge", ["proteção cambial"], ["currency hedge"]),
  f("debt.instruments.{i}.covenant_included", "debt", "boolean", "boolean", "material", "Incluído na dívida de covenant", "Included in covenant debt", ["dívida para covenant"], []),
  f("debt.instruments.{i}.capacity_obligation", "debt", "boolean", "boolean", "material", "Incluído nas obrigações de capacidade", "Included in capacity obligations", ["obrigação de capacidade"], []),
  f("debt.instruments.{i}.undrawn_commitment", "debt", "number", "money", "material", "Compromisso não sacado", "Undrawn commitment", ["linha disponível"], ["undrawn facility"]),
  f("debt.instruments.{i}.quasi_debt", "debt", "number", "money", "material", "Quase dívida", "Quasi-debt", ["obrigação equivalente"], ["debt-like obligation"]),
  f("debt.instruments.{i}.recourse", "debt", "text", "text", "material", "Coobrigação ou recurso", "Recourse", ["coobrigação", "direito de regresso"], ["recourse"]),
  f("debt.instruments.{i}.coobligation", "debt", "text", "text", "material", "Coobrigação", "Co-obligation", ["coobrigado"], ["co-obligor"]),
  f("debt.instruments.{i}.repurchase_obligation", "debt", "text", "text", "material", "Obrigação de recompra", "Repurchase obligation", ["recompra"], ["repurchase"]),
  f("debt.instruments.{i}.retained_risk", "debt", "text", "text", "material", "Risco retido", "Retained risk", ["first loss", "risco residual"], ["retained exposure"]),
  f("debt.instruments.{i}.covenants", "debt", "list", "list", "material", "Covenants", "Covenants", [], []),
  f("debt.instruments.{i}.negative_pledge", "debt", "text", "text", "material", "Negative pledge", "Negative pledge", ["restrição a novas garantias"], []),
  f("debt.instruments.{i}.renewal_commitment", "debt", "text", "text", "material", "Natureza do compromisso de renovação", "Renewal commitment", ["linha comprometida", "não comprometida"], ["committed", "uncommitted"]),
  f("debt.instruments.{i}.payment_history", "debt", "text", "text", "material", "Histórico de pagamento e renegociação", "Payment and amendment history", ["waiver", "aditivo", "atraso"], ["waiver", "amendment", "delay"]),
  f("debt.payments.{i}.instrument_id", "debt", "text", "text", "material", "Parcela: contrato", "Payment: instrument", [], []),
  f("debt.payments.{i}.date", "debt", "date", "date", "material", "Parcela: data", "Payment: date", ["cronograma"], ["schedule"]),
  f("debt.payments.{i}.principal", "debt", "number", "money", "material", "Parcela: principal", "Payment: principal", [], []),
  f("debt.payments.{i}.interest", "debt", "number", "money", "material", "Parcela: juros", "Payment: interest", [], []),
  f("debt.payments.{i}.other", "debt", "number", "money", "supporting", "Parcela: outras obrigações", "Payment: other obligations", [], []),
  f("debt.obligations.{i}.nature", "debt", "text", "text", "material", "Obrigação: natureza", "Obligation: nature", ["leasing", "parcelamento", "earn-out", "contingência"], ["lease", "tax installment", "earn-out", "contingency"]),
  f("debt.obligations.{i}.entity", "debt", "text", "text", "material", "Obrigação: entidade", "Obligation: entity", [], []),
  f("debt.obligations.{i}.counterparty", "debt", "text", "text", "material", "Obrigação: contraparte", "Obligation: counterparty", [], []),
  f("debt.obligations.{i}.amount", "debt", "number", "money", "material", "Obrigação: valor", "Obligation: amount", [], []),
  f("debt.obligations.{i}.currency", "debt", "text", "text", "material", "Obrigação: moeda", "Obligation: currency", [], []),
  f("debt.obligations.{i}.due_date", "debt", "date", "date", "material", "Obrigação: vencimento", "Obligation: due date", [], []),
  f("debt.obligations.{i}.probability", "debt", "text", "text", "material", "Obrigação: probabilidade", "Obligation: probability", ["provável", "possível", "remota"], ["probable", "possible", "remote"]),
  f("debt.obligations.{i}.financial_debt", "debt", "boolean", "boolean", "material", "Inclui na dívida financeira", "Included in financial debt", [], []),
  f("debt.obligations.{i}.capacity_obligation", "debt", "boolean", "boolean", "material", "Inclui nas obrigações de capacidade", "Included in capacity obligations", [], []),
  f("debt.obligations.{i}.off_balance_sheet", "debt", "boolean", "boolean", "material", "Exposição fora de balanço", "Off-balance-sheet exposure", [], []),
  f("debt.balance_bridge.opening_balance", "debt", "number", "money", "material", "Ponte: saldo inicial", "Bridge: opening balance", [], []),
  f("debt.balance_bridge.drawdowns", "debt", "number", "money", "material", "Ponte: captações", "Bridge: drawdowns", [], []),
  f("debt.balance_bridge.accrued_interest", "debt", "number", "money", "material", "Ponte: juros apropriados", "Bridge: accrued interest", [], []),
  f("debt.balance_bridge.pik", "debt", "number", "money", "material", "Ponte: PIK", "Bridge: PIK", [], []),
  f("debt.balance_bridge.indexation", "debt", "number", "money", "material", "Ponte: atualização monetária", "Bridge: indexation", [], []),
  f("debt.balance_bridge.foreign_exchange", "debt", "number", "money", "material", "Ponte: variação cambial", "Bridge: foreign exchange", [], []),
  f("debt.balance_bridge.acquisitions", "debt", "number", "money", "material", "Ponte: dívida adquirida", "Bridge: acquired debt", [], []),
  f("debt.balance_bridge.other_additions", "debt", "number", "money", "material", "Ponte: outras adições", "Bridge: other additions", [], []),
  f("debt.balance_bridge.amortizations", "debt", "number", "money", "material", "Ponte: amortizações", "Bridge: amortizations", [], []),
  f("debt.balance_bridge.prepayments", "debt", "number", "money", "material", "Ponte: pré-pagamentos", "Bridge: prepayments", [], []),
  f("debt.balance_bridge.write_offs", "debt", "number", "money", "material", "Ponte: baixas", "Bridge: write-offs", [], []),
  f("debt.balance_bridge.closing_balance", "debt", "number", "money", "material", "Ponte: saldo final informado", "Bridge: reported closing balance", [], []),
  f("debt.interest_bridge.accounting_total", "debt", "number", "money", "material", "Despesa financeira contábil", "Accounting finance expense", [], []),
  f("debt.cross_default_edges.{i}.from_instrument", "debt", "text", "text", "material", "Cross-default: contrato origem", "Cross-default: source instrument", [], []),
  f("debt.cross_default_edges.{i}.to_instrument", "debt", "text", "text", "material", "Cross-default: contrato afetado", "Cross-default: affected instrument", [], []),
  f("debt.cross_default_edges.{i}.type", "debt", "text", "text", "material", "Cross-default: tipo", "Cross-default: type", ["cross-default", "cross-acceleration"], []),
  f("debt.cross_default_edges.{i}.threshold_satisfied", "debt", "boolean", "boolean", "material", "Cross-default: threshold atingido", "Cross-default: threshold satisfied", [], []),
  f("debt.cross_default_edges.{i}.cure_expired", "debt", "boolean", "boolean", "material", "Cross-default: cura vencida", "Cross-default: cure expired", [], []),
  f("debt.maturity_profile.{i}.window", "debt", "text", "text", "material", "Cronograma de amortização: janela", "Maturity profile: window", ["cronograma de amortizações", "vencimento por ano", "ano safra", "parcelas de empréstimos"], ["maturity profile", "amortisation schedule"]),
  f("debt.maturity_profile.{i}.amount", "debt", "number", "money", "material", "Cronograma de amortização: valor", "Maturity profile: amount", [], []),
  f("debt.total_gross", "debt", "number", "money", "material", "Dívida bruta total (mapa)", "Total gross debt (schedule)", [], []),
  f("debt.total_secured", "debt", "number", "money", "material", "Dívida garantida", "Secured debt", [], []),
  f("debt.covenants.{i}.metric", "debt", "text", "text", "material", "Covenant: métrica", "Covenant: metric", [], []),
  f("debt.covenants.{i}.threshold", "debt", "number", "ratio", "material", "Covenant: limite", "Covenant: threshold", ["limite", "máximo", "mínimo"], ["threshold", "maximum", "minimum"]),
  f("debt.covenants.{i}.instrument_id", "debt", "text", "text", "supporting", "Covenant: instrumento", "Covenant: instrument", ["contrato relacionado"], []),
  f("debt.covenants.{i}.definition", "debt", "text", "text", "material", "Covenant: definição literal", "Covenant: literal definition", ["definição"], ["definition"]),
  f("debt.covenants.{i}.direction", "debt", "text", "text", "material", "Covenant: direção", "Covenant: direction", ["máximo", "mínimo"], ["maximum", "minimum"]),
  f("debt.covenants.{i}.tested_value", "debt", "number", "ratio", "material", "Covenant: valor testado", "Covenant: tested value", ["valor apurado"], ["tested value"]),
  f("debt.covenants.{i}.cure", "debt", "text", "text", "material", "Covenant: cura", "Covenant: cure", ["prazo de cura"], ["cure right"]),
  f("debt.covenants.{i}.cross_default", "debt", "text", "text", "material", "Covenant: cross-default", "Covenant: cross-default", ["vencimento cruzado"], ["cross acceleration"]),
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
        .replace("{j}", "(?<subindex>\\d+)")
        .replace("{ytd}", "(?<window>_\\d{1,2}m|_ytd|_ltm)?"),
    )
    .join("\\.");
  return new RegExp(`^${escaped}$`);
}

export type ResolvedField = {
  definition: FieldDefinition;
  params: {period?: string; index?: number; subindex?: number; window?: "ytd" | "ltm" | undefined; ytdMonths?: number};
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
    if (groups.subindex) params.subindex = Number(groups.subindex);
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
