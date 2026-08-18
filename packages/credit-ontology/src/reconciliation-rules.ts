import {z} from "zod";

export const exceptionSeveritySchema = z.enum(["critical", "high", "medium", "low"]);
export type ExceptionSeverity = z.infer<typeof exceptionSeveritySchema>;

export const exceptionTypeSchema = z.enum(["arithmetic", "period", "entity", "source_conflict", "missing", "plausibility", "validation", "quality", "adjustment"]);
export type ExceptionType = z.infer<typeof exceptionTypeSchema>;

export const exceptionOwnerRoleSchema = z.enum(["company", "internal_analyst", "external_advisor"]);
export type ExceptionOwnerRole = z.infer<typeof exceptionOwnerRoleSchema>;

export type Tolerance = {kind: "absolute"; amount: string} | {kind: "relative"; ratio: string} | {kind: "none"};

export type ReconciliationRule = {
  id: string;
  titles: {pt: string; en: string};
  type: ExceptionType;
  defaultSeverity: ExceptionSeverity;
  tolerance: Tolerance;
  ownerRole: ExceptionOwnerRole;
  /** Why the rule exists — shown in the UI ("por que essa regra existe"). */
  rationale: {pt: string; en: string};
  /** Whether a critical breach blocks external outputs while open (Blueprint §14.2). */
  blocksExternalOutputsWhenCritical: boolean;
};

const rule = (id: string, pt: string, en: string, type: ExceptionType, defaultSeverity: ExceptionSeverity, tolerance: Tolerance, ownerRole: ExceptionOwnerRole, rationalePt: string, rationaleEn: string, blocks = true): ReconciliationRule => ({
  id,
  titles: {pt, en},
  type,
  defaultSeverity,
  tolerance,
  ownerRole,
  rationale: {pt: rationalePt, en: rationaleEn},
  blocksExternalOutputsWhenCritical: blocks,
});

export const reconciliationRules: readonly ReconciliationRule[] = [
  rule("R1", "Ativo = Passivo + PL por período", "Assets = liabilities + equity per period", "arithmetic", "critical", {kind: "relative", ratio: "0.005"}, "internal_analyst", "Um balanço que não fecha invalida qualquer análise de estrutura de capital.", "A balance sheet that does not balance invalidates any capital-structure analysis."),
  rule("R2", "Caixa inicial + fluxos = caixa final", "Opening cash + flows = closing cash", "arithmetic", "high", {kind: "relative", ratio: "0.005"}, "internal_analyst", "O fluxo de caixa precisa reconciliar com o balanço para que CFADS e DSCR sejam confiáveis.", "The cash-flow statement must reconcile to the balance sheet for CFADS and DSCR to be trustworthy."),
  rule("R3", "Receita/EBITDA reconciliam entre fontes (auditado × ERP × gerencial × CIM)", "Revenue/EBITDA reconcile across sources", "source_conflict", "high", {kind: "relative", ratio: "0.01"}, "company", "Diferenças entre fontes escondem ajustes, períodos ou entidades distintas; um financiador vai perguntar.", "Differences between sources hide adjustments, periods, or entities; a lender will ask."),
  rule("R4", "Saldo de dívida (balanço) = mapa de dívida = contratos", "Debt balance = debt schedule = agreements", "source_conflict", "critical", {kind: "relative", ratio: "0.01"}, "company", "A dívida existente define a capacidade incremental; qualquer diferença altera a estrutura proposta.", "Existing debt defines incremental capacity; any difference changes the proposed structure."),
  rule("R5", "Despesa financeira ≈ dívida média × taxa (direcional)", "Financial expense ≈ average debt × rate (directional)", "plausibility", "medium", {kind: "relative", ratio: "0.25"}, "internal_analyst", "Despesa financeira incompatível com o estoque de dívida sugere dívida não mapeada ou taxa errada.", "Financial expense inconsistent with the debt stock suggests unmapped debt or a wrong rate."),
  rule("R6", "Contas a receber/pagar = agings", "Receivables/payables = agings", "source_conflict", "high", {kind: "relative", ratio: "0.02"}, "company", "Agings sustentam garantias de recebíveis e capital de giro.", "Agings underpin receivables collateral and working capital."),
  rule("R7", "Estoques compatíveis com métricas do setor (dias)", "Inventory consistent with sector metrics (days)", "plausibility", "medium", {kind: "none"}, "internal_analyst", "Dias de estoque fora do padrão setorial pedem explicação (obsolescência, sazonalidade, erro de escala).", "Inventory days outside sector norms require explanation (obsolescence, seasonality, scale error)."),
  rule("R8", "Períodos e moedas normalizados; sem coluna mista", "Periods and currencies normalized; no mixed columns", "period", "high", {kind: "none"}, "internal_analyst", "Séries com períodos ou moedas misturados produzem métricas sem sentido.", "Series with mixed periods or currencies produce meaningless metrics."),
  rule("R9", "Consolidado e por entidade não misturados", "Consolidated and standalone not mixed", "entity", "critical", {kind: "none"}, "internal_analyst", "Misturar controladora e consolidado distorce alavancagem e cobertura.", "Mixing parent-only and consolidated figures distorts leverage and coverage."),
  rule("R10", "Ajustes não recorrentes identificados, com fonte, aprovados separadamente", "Non-recurring adjustments identified, sourced, approved separately", "adjustment", "high", {kind: "none"}, "internal_analyst", "Add-backs sem suporte inflam o EBITDA ajustado e a capacidade.", "Unsupported add-backs inflate adjusted EBITDA and capacity."),
  rule("R11", "Montante pedido = usos; fontes = usos", "Requested amount = uses; sources = uses", "arithmetic", "high", {kind: "relative", ratio: "0.01"}, "company", "Fontes e usos que não fecham indicam pedido mal dimensionado.", "Sources and uses that do not tie indicate a mis-sized request."),
  rule("R12", "Continuidade entre último real e primeiro ano projetado", "Continuity between last actual and first projected year", "plausibility", "medium", {kind: "relative", ratio: "0.30"}, "company", "Saltos abruptos entre histórico e projeção precisam de premissa explícita.", "Abrupt jumps between actuals and projections need an explicit assumption."),
  rule("R13", "Interino ≤ anual; YTD compatível com sazonalidade declarada", "Interim ≤ annual; YTD consistent with stated seasonality", "period", "medium", {kind: "none"}, "internal_analyst", "YTD maior que o ano cheio ou fora da sazonalidade indica erro de período ou de escala.", "YTD greater than the full year or outside seasonality indicates a period or scale error."),
  rule("R14", "Escala/unidade coerentes entre documentos", "Scale/unit consistent across documents", "validation", "critical", {kind: "none"}, "internal_analyst", "R$ mil lidos como R$ (ou vice-versa) é o erro mais caro e mais comum.", "Thousands read as units (or vice versa) is the most expensive and most common error."),
  rule("R15", "Nome legal/CNPJ consistentes entre documentos", "Legal name/CNPJ consistent across documents", "entity", "high", {kind: "none"}, "company", "Documentos de entidades diferentes não podem sustentar o mesmo case sem mapa societário.", "Documents from different entities cannot support the same case without a group map."),
  rule("R16", "Datas: fechamento × relatório do auditor × eventos subsequentes", "Dates: closing × auditor's report × subsequent events", "period", "medium", {kind: "none"}, "internal_analyst", "Relatórios muito posteriores ou eventos subsequentes materiais mudam a leitura do período.", "Late reports or material subsequent events change how the period should be read."),
  rule("R17", "Covenants no mapa de dívida × métricas calculadas (headroom)", "Covenants in the debt schedule × calculated metrics (headroom)", "plausibility", "high", {kind: "none"}, "internal_analyst", "Covenants apertados restringem nova dívida e precisam aparecer na estrutura.", "Tight covenants constrain new debt and must appear in the structure."),
];

export const reconciliationRuleMap: ReadonlyMap<string, ReconciliationRule> = new Map(reconciliationRules.map((r) => [r.id, r]));

export function reconciliationRule(id: string): ReconciliationRule {
  const found = reconciliationRuleMap.get(id);
  if (!found) throw new Error(`unknown reconciliation rule: ${id}`);
  return found;
}
