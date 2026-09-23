import {z} from "zod";

/**
 * Section R3 ("Seleção de métodos") of the capital procedure as data: the situations a decision
 * can sit in, the methods that must structure the analysis for each one and the method that alone
 * misleads. The three texts are literal copies of the table cells; the engineering association
 * (`servedBy`) says which house method serves the situation today. Selecting a method for a
 * situation the method does not serve is refused, never silently accepted.
 */
export const methodSelectionVersion = "2026.09.24-v1";

export const methodSelectionSource = {
  procedureId: "prepare-capital-structure-decision",
  procedurePath: "capital/prepare-capital-structure-decision.md",
  section: "R3. Seleção de métodos",
} as const;

/** The integrated capital procedure. */
export const capitalStructureMethodId = "prepare-capital-structure-decision";
/** The receivables method behind task R01 (`underwrite-receivables-pool`, bound to `taskIds: ["R01"]` in the runtime manifest). */
export const receivablesPoolMethodId = "underwrite-receivables-pool";

export type StructuringSituation = {
  /** Stable engineering id, kebab-case. */
  situationId: string;
  /** The "Situação" cell, verbatim. */
  label: string;
  /** The "Métodos que devem estruturar a análise" cell, verbatim. */
  structuringMethods: string;
  /** The "Método que isoladamente engana" cell, verbatim. */
  misleadingAlone: string;
  /** House methods (procedure ids) that serve the situation today. */
  servedBy: readonly string[];
};

export const structuringSituations = [
  {situationId: "seasonal-working-capital", label: "Giro sazonal", structuringMethods: "Fluxo direto de 13 semanas, extensão mensal, ciclo financeiro, NCG/Fleuriet e cobertura no pior período.", misleadingAlone: "EBITDA ou DSCR anual que esconde o mês de falta de caixa.", servedBy: [capitalStructureMethodId]},
  {situationId: "structural-working-capital", label: "Giro estrutural", structuringMethods: "Fleuriet em série, NCG/receita, ciclo de conversão e fluxo indireto; carteira quando relevante.", misleadingAlone: "Fluxo curto sem explicar a necessidade permanente.", servedBy: [capitalStructureMethodId]},
  {situationId: "capex-infrastructure", label: "Capex/infraestrutura", structuringMethods: "Manutenção separada de expansão, construção e maturação; DSCR por período e, em projeto, LLCR/PLCR.", misleadingAlone: "EBITDA corrente durante construção.", servedBy: [capitalStructureMethodId]},
  {situationId: "stable-business-high-conversion", label: "Negócio estável com alta conversão", structuringMethods: "Cadeia EBITDA a caixa, FCF/dívida, cobertura e alavancagem nas definições pertinentes.", misleadingAlone: "Métrica de projeto aplicada sem finalidade.", servedBy: [capitalStructureMethodId]},
  {situationId: "near-covenant", label: "Próxima de covenant", structuringMethods: "Curva por contrato/data/caso, teste reverso, liquidez 12/24 meses e refinanciamento.", misleadingAlone: "Preço como critério principal.", servedBy: [capitalStructureMethodId]},
  {situationId: "growth-without-ebitda", label: "Crescimento sem EBITDA", structuringMethods: "Queima, pista de caixa, unit economics, compromissos e próxima rodada sob atraso.", misleadingAlone: "Múltiplo de EBITDA, DSCR ou régua de agência sem aplicabilidade.", servedBy: [capitalStructureMethodId]},
  {situationId: "holding-group", label: "Holding/grupo", structuringMethods: "Caixa que pode subir, dívida individual, subordinação, dupla alavancagem e garantias cruzadas.", misleadingAlone: "Consolidado sozinho.", servedBy: [capitalStructureMethodId]},
  {situationId: "receivables", label: "Recebíveis", structuringMethods: "Aging, concentração, diluição, roll-rate, elegibilidade, avanço, subordinação e custo do veículo.", misleadingAlone: "Tratar carteira como companhia ou garantia nominal como caixa.", servedBy: [receivablesPoolMethodId]},
  {situationId: "restructuring", label: "Reestruturação", structuringMethods: "Fluxo direto, prioridades de credores, garantias, liquidez e alongamentos suportáveis.", misleadingAlone: "Referência normal de mercado como condição disponível.", servedBy: [capitalStructureMethodId]},
  {situationId: "acquisition-bridge", label: "Aquisição/ponte", structuringMethods: "Fontes e usos, combinado, cláusulas, capacidade e certeza do take-out, inclusive atraso.", misleadingAlone: "Sinergias integrais sem evidência ou balanço isolado da adquirente.", servedBy: [capitalStructureMethodId]},
  {situationId: "refinancing", label: "Refinanciamento", structuringMethods: "Torre, caixa, custo e prazo da substituição, liberação de garantias e condições.", misleadingAlone: "Comparar apenas spread.", servedBy: [capitalStructureMethodId]},
  {situationId: "unaudited-divergent-numbers", label: "Números não auditados/divergentes", structuringMethods: "Conciliação gerencial-contábil, conversão em caixa, sanidade do giro e histórico bancário disponível.", misleadingAlone: "EBITDA gerencial sem reconciliação.", servedBy: [capitalStructureMethodId]},
] as const satisfies readonly StructuringSituation[];

export type StructuringSituationId = (typeof structuringSituations)[number]["situationId"];

export type MethodSelectionInput = {
  situationIds: readonly string[];
  methodId: string;
  methodVersion: string;
};

export type MethodSelectionReasonCode =
  /** Every selected situation lists the method. */
  | "all_situations_served"
  /** At least one selected situation lists the method and at least one does not. */
  | "partial_coverage"
  /** More than one situation was selected; the decision crosses situations. */
  | "decision_crosses_situations";

export type SelectedSituation = {
  situationId: string;
  label: string;
  servedByMethod: boolean;
  misleadingAlone: string;
};

export type MethodSelectionRecord = {
  selectionVersion: typeof methodSelectionVersion;
  /** Distinct selected situations, in selection order. */
  situations: SelectedSituation[];
  methodId: string;
  methodVersion: string;
  /** The method that alone misleads, one literal text per selected situation, in the same order. */
  misleadingAlone: string[];
  reasonCodes: MethodSelectionReasonCode[];
};

export type MethodSelectionRefusalCode =
  | "input_invalid"
  | "situation_required"
  | "situation_unknown"
  | "method_not_applicable_for_situation";

/** A typed refusal: the selection is not recorded and the caller gets the code and the ids involved. */
export class MethodSelectionRefusal extends Error {
  constructor(readonly code: MethodSelectionRefusalCode, readonly situationIds: readonly string[], detail: string) {
    super(`${code}: ${detail}`);
    this.name = "MethodSelectionRefusal";
  }
}

const inputSchema = z.object({
  situationIds: z.array(z.string()),
  methodId: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  methodVersion: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-v\d+$/),
}).strict();

const byId = new Map<string, StructuringSituation>(structuringSituations.map((situation) => [situation.situationId, situation]));

export function selectMethod(input: MethodSelectionInput): MethodSelectionRecord {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new MethodSelectionRefusal("input_invalid", [], parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  const {situationIds, methodId, methodVersion} = parsed.data;
  if (situationIds.length === 0) throw new MethodSelectionRefusal("situation_required", [], "no situation was selected");
  const unknown = situationIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) throw new MethodSelectionRefusal("situation_unknown", unknown, `unknown situation ${unknown.join(", ")}`);
  const selected = [...new Set(situationIds)].map((id) => byId.get(id)!);
  const served = selected.filter((situation) => situation.servedBy.includes(methodId));
  if (served.length === 0) {
    throw new MethodSelectionRefusal("method_not_applicable_for_situation", selected.map((situation) => situation.situationId), `${methodId} serves none of the selected situations`);
  }
  const reasonCodes: MethodSelectionReasonCode[] = [served.length === selected.length ? "all_situations_served" : "partial_coverage"];
  if (selected.length > 1) reasonCodes.push("decision_crosses_situations");
  return {
    selectionVersion: methodSelectionVersion,
    situations: selected.map((situation) => ({
      situationId: situation.situationId,
      label: situation.label,
      servedByMethod: situation.servedBy.includes(methodId),
      misleadingAlone: situation.misleadingAlone,
    })),
    methodId,
    methodVersion,
    misleadingAlone: selected.map((situation) => situation.misleadingAlone),
    reasonCodes,
  };
}
