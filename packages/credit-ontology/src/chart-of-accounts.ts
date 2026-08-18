import {z} from "zod";

export const statementSchema = z.enum(["income", "balance", "cashflow"]);
export type Statement = z.infer<typeof statementSchema>;

/**
 * Canonical sign convention: every line is stored **signed as it contributes to
 * its subtotal**. Revenues are positive, costs/expenses/taxes/D&A negative,
 * cash outflows negative. Subtotals are therefore plain sums, which keeps the
 * deterministic identity checks trivial (Blueprint §14.1, §15).
 */
export const canonicalSignSchema = z.enum(["positive", "negative", "either"]);
export type CanonicalSign = z.infer<typeof canonicalSignSchema>;

export type AccountDefinition = {
  code: string;
  statement: Statement;
  labels: {pt: string; en: string};
  sign: CanonicalSign;
  /** When present, the line is a subtotal computed as the sum of these codes. */
  sumOf?: string[];
  /** Common labels found in Brazilian trial balances / statements (lower-case, diacritics-free). */
  synonyms: string[];
  /** Whether the line is a total that must reconcile with the reported total when both exist. */
  isTotal?: boolean;
};

const acc = (code: string, statement: Statement, pt: string, en: string, sign: CanonicalSign, synonyms: string[], sumOf?: string[], isTotal?: boolean): AccountDefinition => {
  const definition: AccountDefinition = {code, statement, labels: {pt, en}, sign, synonyms};
  if (sumOf) definition.sumOf = sumOf;
  if (isTotal) definition.isTotal = true;
  return definition;
};

export const chartOfAccounts: readonly AccountDefinition[] = [
  // ---- income statement (DRE)
  acc("is_gross_revenue", "income", "Receita bruta", "Gross revenue", "positive", ["receita bruta", "receita operacional bruta", "vendas brutas", "gross revenue", "gross sales"]),
  acc("is_revenue_deductions", "income", "Deduções da receita", "Revenue deductions", "negative", ["deducoes", "impostos sobre vendas", "devolucoes", "abatimentos", "sales taxes", "returns"]),
  acc("is_net_revenue", "income", "Receita líquida", "Net revenue", "positive", ["receita liquida", "receita operacional liquida", "net revenue", "net sales"], ["is_gross_revenue", "is_revenue_deductions"], true),
  acc("is_cogs", "income", "Custo dos produtos/serviços vendidos", "Cost of goods/services sold", "negative", ["cmv", "cpv", "csp", "custo das mercadorias vendidas", "custo dos servicos prestados", "cost of goods sold", "cost of sales"]),
  acc("is_gross_profit", "income", "Lucro bruto", "Gross profit", "positive", ["lucro bruto", "resultado bruto", "gross profit"], ["is_net_revenue", "is_cogs"], true),
  acc("is_selling_expenses", "income", "Despesas comerciais", "Selling expenses", "negative", ["despesas comerciais", "despesas com vendas", "selling expenses"]),
  acc("is_admin_expenses", "income", "Despesas administrativas", "Administrative expenses", "negative", ["despesas administrativas", "despesas gerais e administrativas", "g&a", "sg&a", "administrative expenses"]),
  acc("is_other_operating", "income", "Outras receitas/despesas operacionais", "Other operating income/expenses", "either", ["outras receitas operacionais", "outras despesas operacionais", "other operating"]),
  acc("is_ebitda", "income", "EBITDA", "EBITDA", "positive", ["ebitda", "lajida"], ["is_gross_profit", "is_selling_expenses", "is_admin_expenses", "is_other_operating"], true),
  acc("is_d_and_a", "income", "Depreciação e amortização", "Depreciation and amortization", "negative", ["depreciacao", "amortizacao", "depreciacao e amortizacao", "d&a"]),
  acc("is_ebit", "income", "EBIT", "EBIT", "positive", ["ebit", "lajir", "resultado operacional antes do resultado financeiro"], ["is_ebitda", "is_d_and_a"], true),
  acc("is_financial_income", "income", "Receitas financeiras", "Financial income", "positive", ["receitas financeiras", "rendimentos de aplicacoes", "financial income", "interest income"]),
  acc("is_financial_expenses", "income", "Despesas financeiras", "Financial expenses", "negative", ["despesas financeiras", "juros", "juros passivos", "financial expenses", "interest expense"]),
  acc("is_financial_result", "income", "Resultado financeiro", "Financial result", "either", ["resultado financeiro", "resultado financeiro liquido", "financial result"], ["is_financial_income", "is_financial_expenses"], true),
  acc("is_ebt", "income", "Resultado antes do IR e CS", "Earnings before taxes", "either", ["resultado antes dos tributos", "lair", "resultado antes do imposto de renda", "ebt", "pre-tax income"], ["is_ebit", "is_financial_result"], true),
  acc("is_income_tax", "income", "IR e CSLL", "Income taxes", "negative", ["imposto de renda", "contribuicao social", "ir e csll", "irpj", "income tax"]),
  acc("is_net_income", "income", "Lucro líquido", "Net income", "either", ["lucro liquido", "prejuizo", "resultado liquido do exercicio", "net income", "net profit"], ["is_ebt", "is_income_tax"], true),
  acc("is_nonrecurring_adjustments", "income", "Ajustes não recorrentes (aprovados)", "Approved non-recurring adjustments", "either", ["nao recorrente", "extraordinario", "one-off", "non-recurring", "add-back"]),
  acc("is_adjusted_ebitda", "income", "EBITDA ajustado", "Adjusted EBITDA", "positive", ["ebitda ajustado", "ebitda normalizado", "adjusted ebitda"], ["is_ebitda", "is_nonrecurring_adjustments"], true),
  // ---- balance sheet (BP)
  acc("bs_cash", "balance", "Caixa e equivalentes", "Cash and equivalents", "positive", ["caixa", "caixa e equivalentes de caixa", "disponibilidades", "bancos", "cash"]),
  acc("bs_short_term_investments", "balance", "Aplicações financeiras", "Short-term investments", "positive", ["aplicacoes financeiras", "titulos e valores mobiliarios", "short-term investments"]),
  acc("bs_receivables", "balance", "Contas a receber", "Trade receivables", "positive", ["contas a receber", "clientes", "duplicatas a receber", "receivables"]),
  acc("bs_inventory", "balance", "Estoques", "Inventories", "positive", ["estoques", "estoque", "inventories"]),
  acc("bs_recoverable_taxes", "balance", "Tributos a recuperar", "Recoverable taxes", "positive", ["tributos a recuperar", "impostos a recuperar", "recoverable taxes"]),
  acc("bs_other_current_assets", "balance", "Outros ativos circulantes", "Other current assets", "positive", ["outros ativos circulantes", "adiantamentos", "despesas antecipadas", "other current assets"]),
  acc("bs_current_assets", "balance", "Ativo circulante", "Current assets", "positive", ["ativo circulante", "current assets"], ["bs_cash", "bs_short_term_investments", "bs_receivables", "bs_inventory", "bs_recoverable_taxes", "bs_other_current_assets"], true),
  acc("bs_ppe", "balance", "Imobilizado", "Property, plant and equipment", "positive", ["imobilizado", "ativo imobilizado", "ppe", "fixed assets"]),
  acc("bs_intangibles", "balance", "Intangível", "Intangible assets", "positive", ["intangivel", "agio", "goodwill", "intangibles"]),
  acc("bs_other_noncurrent_assets", "balance", "Outros ativos não circulantes", "Other non-current assets", "positive", ["realizavel a longo prazo", "investimentos", "depositos judiciais", "other non-current assets"]),
  acc("bs_noncurrent_assets", "balance", "Ativo não circulante", "Non-current assets", "positive", ["ativo nao circulante", "non-current assets"], ["bs_ppe", "bs_intangibles", "bs_other_noncurrent_assets"], true),
  acc("bs_total_assets", "balance", "Ativo total", "Total assets", "positive", ["total do ativo", "ativo total", "total assets"], ["bs_current_assets", "bs_noncurrent_assets"], true),
  acc("bs_payables", "balance", "Fornecedores", "Trade payables", "positive", ["fornecedores", "contas a pagar", "payables"]),
  acc("bs_short_term_debt", "balance", "Empréstimos e financiamentos (CP)", "Short-term debt", "positive", ["emprestimos e financiamentos circulante", "debentures circulante", "short-term borrowings"]),
  acc("bs_tax_labor_obligations", "balance", "Obrigações tributárias e trabalhistas", "Tax and labor obligations", "positive", ["obrigacoes tributarias", "obrigacoes trabalhistas", "salarios a pagar", "impostos a recolher", "tax and labor obligations"]),
  acc("bs_other_current_liabilities", "balance", "Outros passivos circulantes", "Other current liabilities", "positive", ["outros passivos circulantes", "adiantamentos de clientes", "other current liabilities"]),
  acc("bs_current_liabilities", "balance", "Passivo circulante", "Current liabilities", "positive", ["passivo circulante", "current liabilities"], ["bs_payables", "bs_short_term_debt", "bs_tax_labor_obligations", "bs_other_current_liabilities"], true),
  acc("bs_long_term_debt", "balance", "Empréstimos e financiamentos (LP)", "Long-term debt", "positive", ["emprestimos e financiamentos nao circulante", "debentures nao circulante", "long-term borrowings"]),
  acc("bs_other_noncurrent_liabilities", "balance", "Outros passivos não circulantes", "Other non-current liabilities", "positive", ["provisoes", "tributos diferidos", "other non-current liabilities"]),
  acc("bs_noncurrent_liabilities", "balance", "Passivo não circulante", "Non-current liabilities", "positive", ["passivo nao circulante", "non-current liabilities"], ["bs_long_term_debt", "bs_other_noncurrent_liabilities"], true),
  acc("bs_equity", "balance", "Patrimônio líquido", "Equity", "either", ["patrimonio liquido", "capital social", "reservas", "lucros acumulados", "equity"]),
  acc("bs_total_liabilities_equity", "balance", "Passivo + patrimônio líquido", "Total liabilities and equity", "positive", ["total do passivo", "total do passivo e patrimonio liquido", "total liabilities and equity"], ["bs_current_liabilities", "bs_noncurrent_liabilities", "bs_equity"], true),
  // ---- cash flow (DFC)
  acc("cf_operating", "cashflow", "Fluxo de caixa operacional", "Cash from operations", "either", ["caixa liquido das atividades operacionais", "fco", "cash from operations", "operating cash flow"]),
  acc("cf_capex_maintenance", "cashflow", "Capex de manutenção", "Maintenance capex", "negative", ["capex de manutencao", "maintenance capex"]),
  acc("cf_capex_expansion", "cashflow", "Capex de expansão", "Expansion capex", "negative", ["capex de expansao", "capex de crescimento", "growth capex"]),
  acc("cf_capex", "cashflow", "Capex", "Capex", "negative", ["aquisicao de imobilizado", "capex", "investimentos em imobilizado", "capital expenditures"], ["cf_capex_maintenance", "cf_capex_expansion"], true),
  acc("cf_other_investing", "cashflow", "Outros fluxos de investimento", "Other investing", "either", ["outros investimentos", "aquisicoes", "alienacoes", "other investing"]),
  acc("cf_investing", "cashflow", "Fluxo de caixa de investimento", "Cash from investing", "either", ["caixa liquido das atividades de investimento", "fci", "cash from investing"], ["cf_capex", "cf_other_investing"], true),
  acc("cf_borrowings", "cashflow", "Captações", "Borrowings", "positive", ["captacoes", "novos emprestimos", "emissoes", "proceeds from borrowings"]),
  acc("cf_repayments", "cashflow", "Amortizações", "Repayments", "negative", ["amortizacoes", "pagamento de principal", "repayments"]),
  acc("cf_interest_paid", "cashflow", "Juros pagos", "Interest paid", "negative", ["juros pagos", "interest paid"]),
  acc("cf_dividends", "cashflow", "Dividendos e JCP", "Dividends", "negative", ["dividendos", "juros sobre capital proprio", "dividends"]),
  acc("cf_other_financing", "cashflow", "Outros fluxos de financiamento", "Other financing", "either", ["aportes", "aumento de capital", "other financing"]),
  acc("cf_financing", "cashflow", "Fluxo de caixa de financiamento", "Cash from financing", "either", ["caixa liquido das atividades de financiamento", "fcf", "cash from financing"], ["cf_borrowings", "cf_repayments", "cf_interest_paid", "cf_dividends", "cf_other_financing"], true),
  acc("cf_free_cash_flow", "cashflow", "Fluxo de caixa livre", "Free cash flow", "either", ["fluxo de caixa livre", "fcl", "free cash flow"], ["cf_operating", "cf_investing"], true),
  acc("cf_net_change_in_cash", "cashflow", "Variação de caixa", "Net change in cash", "either", ["aumento (reducao) de caixa", "variacao de caixa", "net change in cash"], ["cf_operating", "cf_investing", "cf_financing"], true),
  acc("cf_opening_cash", "cashflow", "Caixa inicial", "Opening cash", "positive", ["caixa no inicio do periodo", "saldo inicial", "opening cash"]),
  acc("cf_closing_cash", "cashflow", "Caixa final", "Closing cash", "positive", ["caixa no fim do periodo", "saldo final", "closing cash"], ["cf_opening_cash", "cf_net_change_in_cash"], true),
];

export const chartOfAccountsMap: ReadonlyMap<string, AccountDefinition> = new Map(chartOfAccounts.map((account) => [account.code, account]));

export function accountDefinition(code: string): AccountDefinition {
  const account = chartOfAccountsMap.get(code);
  if (!account) throw new Error(`unknown account code: ${code}`);
  return account;
}

/** Leaf accounts (no `sumOf`) for a statement — the lines the spreading step maps source labels to. */
export function leafAccounts(statement?: Statement): AccountDefinition[] {
  return chartOfAccounts.filter((account) => !account.sumOf && (!statement || account.statement === statement));
}

/**
 * Validates the chart itself: every referenced code exists, no cycles, and a
 * subtotal only sums accounts of the same statement. Returns a list of problems
 * (empty when healthy) so tests can assert on it.
 */
export function validateChartOfAccounts(): string[] {
  const problems: string[] = [];
  for (const account of chartOfAccounts) {
    for (const code of account.sumOf ?? []) {
      const child = chartOfAccountsMap.get(code);
      if (!child) problems.push(`${account.code}: unknown child ${code}`);
      else if (child.statement !== account.statement) problems.push(`${account.code}: child ${code} belongs to ${child.statement}`);
    }
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (code: string, trail: string[]) => {
    if (done.has(code)) return;
    if (visiting.has(code)) {
      problems.push(`cycle: ${[...trail, code].join(" -> ")}`);
      return;
    }
    visiting.add(code);
    for (const child of chartOfAccountsMap.get(code)?.sumOf ?? []) visit(child, [...trail, code]);
    visiting.delete(code);
    done.add(code);
  };
  for (const account of chartOfAccounts) visit(account.code, []);
  return problems;
}
