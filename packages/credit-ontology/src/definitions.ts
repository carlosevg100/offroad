/**
 * Financial definitions (Blueprint §15.2). Definitions are parameters of a
 * transaction, never hidden constants: the financial-core receives them
 * explicitly and records the definition id + version in every calculation trace.
 * The platform never suggests a single universal EBITDA/CFADS/DSCR exists.
 */
export type FinancialDefinition = {
  id: string;
  version: string;
  labels: {pt: string; en: string};
  /** Human-readable formula using account codes / metric ids. */
  formula: string;
  inputs: string[];
  notes: {pt: string; en: string};
};

export const financialDefinitions: readonly FinancialDefinition[] = [
  {
    id: "adjusted_ebitda",
    version: "v1",
    labels: {pt: "EBITDA ajustado", en: "Adjusted EBITDA"},
    formula: "is_ebitda + approved_nonrecurring_expenses - nonrecurring_income - unsupported_or_low_confidence_addbacks",
    inputs: ["is_ebitda", "approved_nonrecurring_expenses", "nonrecurring_income", "unsupported_or_low_confidence_addbacks"],
    notes: {
      pt: "Cada ajuste é aprovado individualmente com fonte; add-backs sem suporte não entram.",
      en: "Each adjustment is approved individually with a source; unsupported add-backs are excluded.",
    },
  },
  {
    id: "cfads",
    version: "v1",
    labels: {pt: "CFADS", en: "CFADS"},
    formula: "adjusted_ebitda - taxes_paid - maintenance_capex - normalized_working_capital_investment - fixed_charges_not_yet_reflected +/- approved_cash_adjustments",
    inputs: ["adjusted_ebitda", "taxes_paid", "maintenance_capex", "normalized_working_capital_investment", "fixed_charges_not_yet_reflected", "approved_cash_adjustments"],
    notes: {
      pt: "Capex de manutenção e capital de giro normalizado são premissas explícitas por transação.",
      en: "Maintenance capex and normalized working capital are explicit per-transaction assumptions.",
    },
  },
  {
    id: "dscr",
    version: "v1",
    labels: {pt: "DSCR", en: "DSCR"},
    formula: "cfads / scheduled_cash_debt_service",
    inputs: ["cfads", "scheduled_cash_debt_service"],
    notes: {pt: "Serviço da dívida em caixa programado (principal + juros) do período.", en: "Scheduled cash debt service (principal + interest) for the period."},
  },
  {
    id: "interest_coverage",
    version: "v1",
    labels: {pt: "Cobertura de juros", en: "Interest coverage"},
    formula: "selected_earnings_measure / cash_interest_paid",
    inputs: ["selected_earnings_measure", "cash_interest_paid"],
    notes: {pt: "A medida de resultado (EBITDA, EBITDA ajustado, EBIT) é escolhida por transação.", en: "The earnings measure (EBITDA, adjusted EBITDA, EBIT) is chosen per transaction."},
  },
  {
    id: "collateral_coverage",
    version: "v1",
    labels: {pt: "Cobertura de garantias", en: "Collateral coverage"},
    formula: "eligible_value_after_haircut / secured_exposure",
    inputs: ["eligible_value_after_haircut", "secured_exposure"],
    notes: {pt: "Haircuts vêm da política vigente e ficam registrados por ativo.", en: "Haircuts come from the current policy and are recorded per asset."},
  },
  {
    id: "net_debt",
    version: "v1",
    labels: {pt: "Dívida líquida", en: "Net debt"},
    formula: "gross_debt - cash - short_term_investments",
    inputs: ["gross_debt", "cash", "short_term_investments"],
    notes: {pt: "Aplicações restritas podem ser excluídas por decisão registrada.", en: "Restricted investments may be excluded by a recorded decision."},
  },
  {
    id: "leverage",
    version: "v1",
    labels: {pt: "Alavancagem", en: "Leverage"},
    formula: "net_debt / adjusted_ebitda_ltm",
    inputs: ["net_debt", "adjusted_ebitda_ltm"],
    notes: {pt: "LTM sempre derivado (anual anterior + YTD atual − YTD anterior).", en: "LTM is always derived (prior annual + current YTD − prior YTD)."},
  },
];

export const financialDefinitionMap: ReadonlyMap<string, FinancialDefinition> = new Map(financialDefinitions.map((d) => [d.id, d]));

export function financialDefinition(id: string): FinancialDefinition {
  const found = financialDefinitionMap.get(id);
  if (!found) throw new Error(`unknown financial definition: ${id}`);
  return found;
}
