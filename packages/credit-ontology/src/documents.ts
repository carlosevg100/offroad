import {z} from "zod";
import {evidenceRankByClass, type InformationClass} from "./evidence";

/** Folder of the organized case file where a document kind is filed. */
export const documentFolderSchema = z.enum([
  "financial",
  "debt_and_collateral",
  "institutional_and_corporate",
  "project_and_plan",
  "contracts",
  "other",
]);
export type DocumentFolder = z.infer<typeof documentFolderSchema>;

export const documentKindSchema = z.enum([
  "audited_financial_statements",
  "auditor_report_only",
  "reviewed_interim_statements",
  "trial_balance",
  "erp_export",
  "management_accounts",
  "bank_statements",
  "open_finance_export",
  "debt_schedule",
  "loan_agreement",
  "debenture_indenture",
  "collateral_inventory",
  "appraisal_report",
  "receivables_aging",
  "payables_aging",
  "business_plan",
  "financial_model",
  "budget",
  "investor_deck",
  "cim",
  "teaser",
  "project_memorandum",
  "technical_report",
  "capital_request_letter",
  "company_registration",
  "corporate_docs",
  "tax_clearance",
  "regulatory_filing",
  "customer_concentration",
  "customer_contract",
  "cap_table",
  "metrics_report",
  "supplier_contract",
  "insurance_policy",
  "other",
]);
export type DocumentKind = z.infer<typeof documentKindSchema>;

export type DocumentKindDefinition = {
  kind: DocumentKind;
  labels: {pt: string; en: string};
  informationClass: Exclude<InformationClass, "calculated">;
  /** Default evidence rank; a specific document may be re-ranked on review. */
  evidenceRank: number;
  folder: DocumentFolder;
  /** Field groups this document kind usually supports (drives target-field selection). */
  typicalFieldGroups: string[];
  /** Cues (lower-case, diacritics-free) that raise the deterministic prior for this kind. */
  cues: string[];
};

const def = (
  kind: DocumentKind,
  pt: string,
  en: string,
  informationClass: Exclude<InformationClass, "calculated">,
  folder: DocumentFolder,
  typicalFieldGroups: string[],
  cues: string[],
  evidenceRank: number = evidenceRankByClass[informationClass],
): DocumentKindDefinition => ({kind, labels: {pt, en}, informationClass, evidenceRank, folder, typicalFieldGroups, cues});

export const documentKinds: readonly DocumentKindDefinition[] = [
  def("audited_financial_statements", "Demonstrações financeiras auditadas", "Audited financial statements", "audited", "financial", ["company", "historical_financials", "debt", "collateral"], ["demonstracoes financeiras", "relatorio do auditor", "relatorio dos auditores independentes", "financial statements", "independent auditor"]),
  def("auditor_report_only", "Relatório do auditor (isolado)", "Auditor's report (standalone)", "audited", "financial", ["company"], ["relatorio do auditor independente", "opiniao", "auditor's report"]),
  def("reviewed_interim_statements", "Informações intermediárias revisadas", "Reviewed interim statements", "reviewed", "financial", ["company", "interim_financials", "historical_financials", "debt"], ["revisao limitada", "informacoes intermediarias", "itr", "review report", "interim"]),
  def("trial_balance", "Balancete", "Trial balance", "accounting", "financial", ["historical_financials", "interim_financials"], ["balancete", "trial balance", "razao"]),
  def("erp_export", "Export contábil (ERP)", "ERP / accounting export", "accounting", "financial", ["historical_financials", "interim_financials"], ["erp", "export", "plano de contas", "contabilidade", "chart of accounts"]),
  def("management_accounts", "Relatório gerencial", "Management accounts", "management", "financial", ["historical_financials", "interim_financials", "customers"], ["gerencial", "kpi", "management report", "dashboard"]),
  def("bank_statements", "Extratos bancários", "Bank statements", "bank_statement", "financial", ["historical_financials", "interim_financials"], ["extrato", "saldo", "bank statement"]),
  def("open_finance_export", "Export Open Finance", "Open Finance export", "bank_statement", "financial", ["interim_financials"], ["open finance", "open banking"]),
  def("debt_schedule", "Mapa de dívida", "Debt schedule", "management", "debt_and_collateral", ["debt", "collateral", "leverage"], ["mapa de divida", "endividamento", "cronograma", "debt schedule", "credores"]),
  def("loan_agreement", "Contrato de financiamento", "Loan agreement", "company_document", "debt_and_collateral", ["debt", "collateral"], ["cedula de credito", "ccb", "contrato de financiamento", "loan agreement", "mutuo"]),
  def("debenture_indenture", "Escritura de debêntures", "Debenture indenture", "company_document", "debt_and_collateral", ["debt", "collateral"], ["escritura", "debentures", "indenture"]),
  def("collateral_inventory", "Inventário de garantias", "Collateral inventory", "company_document", "debt_and_collateral", ["collateral"], ["garantias", "inventario", "collateral", "alienacao fiduciaria", "cessao fiduciaria"]),
  def("appraisal_report", "Laudo de avaliação", "Appraisal report", "company_document", "debt_and_collateral", ["collateral"], ["laudo", "avaliacao", "appraisal", "valuation"], 4),
  def("receivables_aging", "Aging de recebíveis", "Receivables aging", "accounting", "financial", ["collateral", "customers"], ["aging", "recebiveis", "contas a receber", "receivables"]),
  def("payables_aging", "Aging de fornecedores", "Payables aging", "accounting", "financial", ["historical_financials"], ["aging", "fornecedores", "contas a pagar", "payables"]),
  def("business_plan", "Business plan", "Business plan", "projection", "project_and_plan", ["projections", "project", "transaction"], ["business plan", "plano de negocios", "projecoes", "premissas"]),
  def("financial_model", "Modelo financeiro", "Financial model", "projection", "project_and_plan", ["projections", "project", "transaction"], ["modelo", "model", "dcf", "cenario"]),
  def("budget", "Orçamento", "Budget", "projection", "project_and_plan", ["projections"], ["orcamento", "budget"]),
  def("investor_deck", "Apresentação institucional", "Investor deck", "management", "institutional_and_corporate", ["company", "transaction", "customers", "project"], ["apresentacao", "deck", "investidores", "investor presentation"]),
  def("cim", "Memorando de informações", "Confidential information memorandum", "management", "institutional_and_corporate", ["company", "transaction", "historical_financials", "projections"], ["memorando", "information memorandum", "cim"]),
  def("teaser", "Teaser", "Teaser", "management", "institutional_and_corporate", ["company", "transaction"], ["teaser"]),
  def("project_memorandum", "Memorial descritivo do projeto", "Project memorandum", "company_document", "project_and_plan", ["project"], ["memorial descritivo", "projeto", "expansao", "obras"]),
  def("technical_report", "Relatório técnico", "Technical report", "company_document", "project_and_plan", ["project"], ["relatorio tecnico", "estudo", "technical report"]),
  def("capital_request_letter", "Carta de pedido de capital", "Capital request letter", "company_document", "institutional_and_corporate", ["transaction", "project", "company", "debt"], ["carta", "pedido", "racional", "cfo", "capital request"]),
  def("company_registration", "Ficha cadastral", "Company registration form", "company_document", "institutional_and_corporate", ["company"], ["ficha cadastral", "cadastro", "cnpj", "registration"]),
  def("cap_table", "Cap table", "Cap table", "company_document", "institutional_and_corporate", ["company"], ["cap table", "captable", "quadro de acionistas", "rodada", "series a", "seed", "valuation", "diluição"]),
  def("metrics_report", "Relatório de métricas (ARR, MRR, coortes)", "Metrics report (ARR, MRR, cohorts)", "management", "financial", ["historical_financials", "interim_financials", "customers"], ["arr", "mrr", "churn", "cohort", "coorte", "burn", "runway", "nrr", "retention", "retenção", "métricas", "metrics"]),
  def("corporate_docs", "Documentos societários", "Corporate documents", "company_document", "institutional_and_corporate", ["company"], ["contrato social", "estatuto", "ata", "organograma", "quadro societario", "bylaws"]),
  def("tax_clearance", "Certidões", "Tax clearance certificates", "company_document", "institutional_and_corporate", ["company"], ["certidao", "negativa", "clearance"]),
  def("regulatory_filing", "Protocolo regulatório", "Regulatory filing", "company_document", "institutional_and_corporate", ["company", "historical_financials", "debt", "transaction"], ["protocolo", "cvm", "bacen", "filing"]),
  /**
   * A company's own account of who it sells to: the concentration table, the client list, the
   * commercial report. There was no kind for it, which had a consequence nobody would guess from
   * reading the vocabulary. The nearest neighbour a model reaches for is `management_accounts`,
   * and a table of customers is plainly not a set of management accounts, so it lands on
   * `other`. `other` maps to **no field groups at all**, so the document is never asked for
   * anything, and `customers` becomes a field group the extractor cannot reach in practice
   * however well it classifies.
   *
   * Found by the Aurora gold case, whose customer file came back `other`. Concentration is a
   * rating driver: one client at eighteen per cent of revenue is a different credit from forty
   * clients at half a per cent each, and a desk reads it before it reads the projections.
   *
   * `management`, because the company prepares it and nobody checks it.
   */
  def("customer_concentration", "Concentração de clientes", "Customer concentration", "management", "financial", ["customers", "transaction"], ["concentracao de clientes", "maiores clientes", "carteira de clientes", "principais clientes", "top clientes", "customer concentration", "client concentration"]),
  def("customer_contract", "Contrato com cliente", "Customer contract", "company_document", "contracts", ["customers"], ["contrato", "cliente", "fornecimento", "customer agreement"]),
  def("supplier_contract", "Contrato com fornecedor", "Supplier contract", "company_document", "contracts", ["customers"], ["contrato", "fornecedor", "supplier agreement"]),
  def("insurance_policy", "Apólice de seguro", "Insurance policy", "company_document", "contracts", ["collateral"], ["apolice", "seguro", "insurance"]),
  def("other", "Outro", "Other", "company_document", "other", [], []),
];

export const documentKindMap: ReadonlyMap<DocumentKind, DocumentKindDefinition> = new Map(
  documentKinds.map((definition) => [definition.kind, definition]),
);

export function documentKindDefinition(kind: DocumentKind): DocumentKindDefinition {
  const definition = documentKindMap.get(kind);
  if (!definition) throw new Error(`unknown document kind: ${kind}`);
  return definition;
}

/**
 * Suggested normalized file name for the organized case file:
 * `AAAA-MM_Tipo_Entidade` (or `Tipo_Entidade` when the period is unknown).
 */
export function suggestedDocumentName(input: {kind: DocumentKind; entityName?: string; periodEnd?: string; locale?: "pt" | "en"}): string {
  const definition = documentKindDefinition(input.kind);
  const label = slug(input.locale === "en" ? definition.labels.en : definition.labels.pt);
  const entity = input.entityName ? `_${slug(input.entityName)}` : "";
  const period = input.periodEnd && /^\d{4}-\d{2}/.test(input.periodEnd) ? `${input.periodEnd.slice(0, 7)}_` : "";
  return `${period}${label}${entity}`;
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}
