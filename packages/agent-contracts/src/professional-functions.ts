import {z} from "zod";

/**
 * Professional context changes language, emphasis, workflow and deliverables. It never authorizes
 * access, replaces project evidence or removes an economically relevant alternative.
 */
export const professionalFunctionGroupSchema = z.enum([
  "company_leadership",
  "company_finance",
  "banker_or_dcm",
  "structured_finance",
  "syndicate_distribution",
  "advisor",
  "credit_analysis",
  "risk_and_underwriting",
  "investor_or_lender",
  "legal_and_execution",
  "other",
]);
export type ProfessionalFunctionGroup = z.infer<typeof professionalFunctionGroupSchema>;

export const professionalFunctionSchema = z.enum([
  "chief_executive_or_founder",
  "board_or_shareholder",
  "chief_financial_officer",
  "treasurer",
  "corporate_finance",
  "fp_and_a",
  "controller_or_accounting",
  "head_of_capital_markets",
  "dcm_banker",
  "corporate_banker",
  "relationship_manager",
  "structured_finance_banker",
  "project_finance_banker",
  "investment_banker",
  "syndicate_or_distribution",
  "debt_advisor",
  "independent_financial_advisor",
  "credit_analyst",
  "underwriter",
  "credit_risk",
  "portfolio_manager",
  "chief_investment_officer",
  "investment_committee",
  "loan_originator",
  "special_situations_investor",
  "legal_structuring",
  "operations_or_middle_office",
  "other",
]);
export type ProfessionalFunction = z.infer<typeof professionalFunctionSchema>;

export const professionalFunctionGroupByFunction: Readonly<Record<ProfessionalFunction, ProfessionalFunctionGroup>> = {
  chief_executive_or_founder: "company_leadership",
  board_or_shareholder: "company_leadership",
  chief_financial_officer: "company_finance",
  treasurer: "company_finance",
  corporate_finance: "company_finance",
  fp_and_a: "company_finance",
  controller_or_accounting: "company_finance",
  head_of_capital_markets: "company_finance",
  dcm_banker: "banker_or_dcm",
  corporate_banker: "banker_or_dcm",
  relationship_manager: "banker_or_dcm",
  structured_finance_banker: "structured_finance",
  project_finance_banker: "structured_finance",
  investment_banker: "banker_or_dcm",
  syndicate_or_distribution: "syndicate_distribution",
  debt_advisor: "advisor",
  independent_financial_advisor: "advisor",
  credit_analyst: "credit_analysis",
  underwriter: "risk_and_underwriting",
  credit_risk: "risk_and_underwriting",
  portfolio_manager: "investor_or_lender",
  chief_investment_officer: "investor_or_lender",
  investment_committee: "investor_or_lender",
  loan_originator: "investor_or_lender",
  special_situations_investor: "investor_or_lender",
  legal_structuring: "legal_and_execution",
  operations_or_middle_office: "legal_and_execution",
  other: "other",
};
