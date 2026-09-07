import {createHash} from "node:crypto";

import {z} from "zod";

import {compileTaskGraph, type CapitalProjectJob, type CompiledTaskGraph} from "./capital-jobs";

type ObjectiveEntryHint = Exclude<CapitalProjectJob, "prepare_materials_and_process">;

export const workspaceObjectiveKindSchema = z.enum([
  "factual_question",
  "risk_matrix",
  "meeting_preparation",
  "board_decision",
  "documents_to_case",
  "capital_matching",
  "operation_review",
  "company_analysis",
  "capital_strategy",
  "material_preparation",
  "information_organization",
  "market_mapping",
  "monitoring",
  "workspace_management",
  "ambiguous",
]);
export type WorkspaceObjectiveKind = z.infer<typeof workspaceObjectiveKindSchema>;

export const objectivePlanModeSchema = z.enum([
  "conversation",
  "create_project",
  "continue_project",
  "collect_context",
  "coverage_gap",
]);
export type ObjectivePlanMode = z.infer<typeof objectivePlanModeSchema>;

export const objectiveOutputTerminalSchema = z.enum([
  "cited_answer",
  "risk_matrix",
  "meeting_brief",
  "board_decision_pack",
  "preliminary_case",
  "capital_shortlist",
  "operation_review",
  "capital_alternative_map",
  "reviewable_material",
  "source_index",
  "market_map",
  "monitoring_setup",
  "workspace_change_preview",
  "corrigible_scope",
]);
export type ObjectiveOutputTerminal = z.infer<typeof objectiveOutputTerminalSchema>;

export type ObjectiveSourcePlan = "project_context" | "provided_documents" | "public_company"
  | "public_market" | "house_method" | "capital_network";

export type ObjectiveToPlanInput = {
  message: string;
  hasAttachments: boolean;
  explicitHint?: ObjectiveEntryHint | null;
  existingProject?: {
    entryJob: CapitalProjectJob;
    hasSignedAnalyticalSnapshot: boolean;
    hasCurrentMandates: boolean;
  } | null;
};

export type ObjectivePlanContextInput = Omit<ObjectiveToPlanInput, "message" | "explicitHint"> & {
  objectiveKind: WorkspaceObjectiveKind;
};

export type ObjectiveToPlanDecision = {
  schemaVersion: "objective-plan.v1";
  objectiveKind: WorkspaceObjectiveKind;
  mode: ObjectivePlanMode;
  entryJob: CapitalProjectJob | null;
  outputTerminal: ObjectiveOutputTerminal;
  targetTaskIds: readonly string[];
  taskGraph: CompiledTaskGraph;
  sourcePlan: readonly ObjectiveSourcePlan[];
  analysisPlan: readonly string[];
  proposedDeliverable: string;
  requiredContext: readonly string[];
  reasonCode: string;
  structuralIdentity: string;
};

type ObjectiveRecipe = Omit<ObjectiveToPlanDecision,
  "schemaVersion" | "taskGraph" | "structuralIdentity" | "mode" | "requiredContext" | "reasonCode">;

const objectivePatterns = {
  capitalMatching: /\b(quem\s+(?:poderia|deveria|devemos)\s+(?:financiar|investir|acessar)|quais?\s+(?:fundos?|financiadores?|investidores?|lenders?)|map(?:ear|eamento)\s+(?:de\s+)?(?:fundos?|financiadores?|investidores?)|shortlist|matching|ader[eê]ncia\s+(?:ao|do)\s+mandato|capital\s+providers?|lenders?)\b/i,
  material: /\b(prepar(?:ar|e)|mont(?:ar|e)|produz(?:ir|a)|ger(?:ar|e)|compil(?:ar|e))\b.{0,100}\b(apresenta[cç][aã]o|deck|pitch|teaser|memo|memorando|term\s*sheet|modelo|planilha|excel|powerpoint|pptx|word|material)\b/i,
  operationReview: /\b(revis(?:ar|e|[aã]o)|test(?:ar|e)|redline|melhor(?:ar|e)|compar(?:ar|e))\b.{0,120}\b(term\s*sheet|proposta|minuta|contrato|opera[cç][aã]o|estrutura|covenant|waterfall)\b/i,
  riskMatrix: /\b(matriz\s+de\s+risco|risk\s+matrix|mapa\s+de\s+riscos?|risk\s+register|riscos?\s+e\s+mitigantes?|covenants?|waterfall)\b/i,
  boardDecision: /\b(conselho|board|comit[eê]|committee|delibera[cç][aã]o|decis[aã]o\s+(?:interna|do\s+conselho)|aprova[cç][aã]o\s+interna)\b/i,
  meeting: /\b(reuni[aã]o|meeting|encontro|pitch|origina[cç][aã]o|origination|visita\s+(?:à|a)\s+companhia|conversa\s+(?:com|junto\s+(?:à|a|ao)))\b/i,
  documents: /\b(documentos?|arquivos?|pasta|data\s*room|balan[cç]os?|balancete|apresenta[cç][aã]o\s+institucional|material\s+fragmentado)\b/i,
  companyAnalysis: /\b(analis(?:ar|e)|entender|estudar|diagn[oó]stico|diagnostic|leitura)\b.{0,140}\b(companhia|empresa|company|balan[cç]o|d[ií]vida|endividamento|estrutura\s+de\s+capital)\b/i,
  capitalStrategy: /\b(refinanc(?:e|iar|iamento|ing)?|refi\b|liability|along(?:ar|amento)|repricing|capital\s+de\s+giro|working\s+capital|liquidez|expans[aã]o|capex|aquisi[cç][aã]o|m\s*&\s*a|estrutura\s+de\s+capital|capital\s+structure|capta[cç][aã]o|levantar\s+capital|financiar|d[ií]vida|endividamento)\b/i,
  factualQuestion: /(?:\?|\b(como|qual|quais|quanto|quando|onde|por\s+que|explique|mostre|what|which|how|why|where)\b)/i,
  informationOrganization: /\b(levant(?:ar|e)|colet(?:ar|e)|organiz(?:ar|e)|inventari(?:ar|e)|index(?:ar|e)|catalog(?:ar|ue)|find\s+and\s+organize)\b.{0,160}\b(informa[cç][oõ]es|documentos?|arquivos?|fontes?|fatos\s+relevantes|apresenta[cç][oõ]es|not[ií]cias|data\s*room|pasta)\b|\b(s[oó]\s+organiz(?:ar|e)|sem\s+an[aá]lise)\b/i,
  marketMapping: /\b(mercado|transa[cç][oõ]es|emiss[oõ]es|deb[eê]ntures|precedentes?|compar[aá]veis|comps|benchmark)\b.{0,160}\b(prazo|indexador|spread|termos?|pricing|pre[cç]o|volume|últimos?\s+meses|recentes?)\b|\b(mapa|levantamento|pesquisa)\s+de\s+(mercado|transa[cç][oõ]es|precedentes?|compar[aá]veis)\b/i,
  monitoring: /\b(monitore|monitorar|acompanhe|acompanhar|vigie|watch|alert(?:ar|e)|avise|notifique)\b|\b(todo\s+dia|toda\s+semana|mensalmente|recorrente)\b.{0,100}\b(atualiza[cç][aã]o|mudan[cç]a|not[ií]cia|covenant|vencimento|mercado)\b/i,
  workspaceManagement: /\b(renome(?:ar|ie)|mov(?:a|e|er)|arquivar|desarquivar|compartilhar|permiss[aã]o|acesso)\b.{0,120}\b(projeto|pasta|arquivo|workspace|ambiente|usu[aá]rio|membro)\b|\b(organizar|criar)\b.{0,80}\b(projeto|workspace|ambiente)\b/i,
} as const;

const recipes: Record<Exclude<WorkspaceObjectiveKind, "ambiguous">, ObjectiveRecipe> = {
  factual_question: {
    objectiveKind: "factual_question", entryJob: null, outputTerminal: "cited_answer", targetTaskIds: [],
    sourcePlan: ["project_context", "provided_documents", "house_method"],
    analysisPlan: ["Resolver a pergunta exata e o regime de evidência", "Responder com suporte, limitações e pontos não verificáveis"],
    proposedDeliverable: "Resposta citada e delimitada, sem iniciar análise não solicitada",
  },
  risk_matrix: {
    objectiveKind: "risk_matrix", entryJob: "review_existing_operation", outputTerminal: "risk_matrix", targetTaskIds: ["C09"],
    sourcePlan: ["provided_documents", "public_company", "house_method"],
    analysisPlan: ["Resolver documentos, versões e perímetro", "Identificar riscos, mecanismos de transmissão e mitigantes", "Separar evidência, cálculo, julgamento e lacuna"],
    proposedDeliverable: "Matriz de riscos priorizada, citada e ligada aos mitigantes",
  },
  meeting_preparation: {
    objectiveKind: "meeting_preparation", entryJob: "origination_thesis", outputTerminal: "meeting_brief", targetTaskIds: ["M07", "S11", "K04"],
    sourcePlan: ["project_context", "public_company", "public_market", "house_method"],
    analysisPlan: ["Entender companhia, setor e agenda", "Construir leitura prospectiva de crédito", "Testar alternativas e comparáveis", "Organizar pontos de provocação para a reunião"],
    proposedDeliverable: "Brief de reunião com visão própria, alternativas e perguntas de decisão",
  },
  board_decision: {
    objectiveKind: "board_decision", entryJob: "capital_planning", outputTerminal: "board_decision_pack", targetTaskIds: ["A02"],
    sourcePlan: ["project_context", "provided_documents", "public_company", "public_market", "house_method"],
    analysisPlan: ["Diagnosticar posição atual e projeções", "Testar capacidade, downside e alternativas", "Explicitar trade-offs e decisões requeridas", "Montar evidence pack para o conselho"],
    proposedDeliverable: "Pacote de decisão para o conselho, com alternativas, sensibilidades e ressalvas",
  },
  documents_to_case: {
    objectiveKind: "documents_to_case", entryJob: "structure_from_documents", outputTerminal: "preliminary_case", targetTaskIds: ["S11"],
    sourcePlan: ["provided_documents", "public_company", "public_market", "house_method"],
    analysisPlan: ["Inventariar e versionar os arquivos", "Conciliar números e conflitos", "Medir cobertura e pedir apenas lacunas materiais", "Testar capacidade e estruturas compatíveis"],
    proposedDeliverable: "Entendimento preliminar, base reconciliada e pedido de informação priorizado",
  },
  capital_matching: {
    objectiveKind: "capital_matching", entryJob: "prepare_materials_and_process", outputTerminal: "capital_shortlist", targetTaskIds: ["K09"],
    sourcePlan: ["project_context", "public_market", "capital_network"],
    analysisPlan: ["Fixar a estrutura e o perímetro de divulgação", "Aplicar filtros duros de mandato", "Calcular aderência explicável e exclusões", "Organizar ondas de abordagem sem executar contato"],
    proposedDeliverable: "Shortlist discriminada com racional, exclusões, confiança e lacunas de mandato",
  },
  operation_review: {
    objectiveKind: "operation_review", entryJob: "review_existing_operation", outputTerminal: "operation_review", targetTaskIds: ["S10", "S12"],
    sourcePlan: ["provided_documents", "public_company", "public_market", "house_method"],
    analysisPlan: ["Resolver termos e documentos vigentes", "Recalcular economics, amortização, indexação e covenants", "Comparar ajustes de preço, prazo, garantias e proteções"],
    proposedDeliverable: "Revisão citada da operação, issue list e estrutura indicativa comparável",
  },
  company_analysis: {
    objectiveKind: "company_analysis", entryJob: "company_debt_view", outputTerminal: "capital_alternative_map", targetTaskIds: ["C11"],
    sourcePlan: ["project_context", "provided_documents", "public_company", "public_market", "house_method"],
    analysisPlan: ["Resolver perímetro, período e fontes", "Reconstruir desempenho, caixa, dívida e capital de giro", "Projetar capacidade e downside", "Explicitar riscos, restrições e oportunidades"],
    proposedDeliverable: "Diagnóstico prospectivo da companhia pela ótica de crédito",
  },
  capital_strategy: {
    objectiveKind: "capital_strategy", entryJob: "capital_planning", outputTerminal: "capital_alternative_map", targetTaskIds: ["S11"],
    sourcePlan: ["project_context", "provided_documents", "public_company", "public_market", "house_method"],
    analysisPlan: ["Fixar necessidade econômica e restrições", "Dimensionar capacidade e fonte de pagamento", "Comparar instrumentos, custo, flexibilidade e execução"],
    proposedDeliverable: "Mapa de alternativas de capital e recomendação condicionada",
  },
  material_preparation: {
    objectiveKind: "material_preparation", entryJob: "prepare_materials_and_process", outputTerminal: "reviewable_material", targetTaskIds: ["A11"],
    sourcePlan: ["project_context", "provided_documents", "house_method"],
    analysisPlan: ["Congelar o snapshot aprovado", "Aplicar audiência, idioma e template", "Verificar consistência entre narrativa, números e termos", "Renderizar e inspecionar o arquivo"],
    proposedDeliverable: "Material nativo, editável, versionado e pronto para revisão",
  },
  information_organization: {
    objectiveKind: "information_organization", entryJob: null, outputTerminal: "source_index", targetTaskIds: [],
    sourcePlan: ["project_context", "provided_documents", "public_company", "public_market"],
    analysisPlan: ["Delimitar assunto, período e universo de fontes", "Coletar e deduplicar sem converter coleta em conclusão", "Classificar, versionar e registrar cobertura", "Entregar índice com origem e lacunas"],
    proposedDeliverable: "Índice organizado e versionado de fontes, sem análise não solicitada",
  },
  market_mapping: {
    objectiveKind: "market_mapping", entryJob: null, outputTerminal: "market_map", targetTaskIds: ["K04"],
    sourcePlan: ["project_context", "public_market", "house_method"],
    analysisPlan: ["Fixar mercado, período e dimensões comparáveis", "Pesquisar transações e termos observáveis", "Normalizar prazo, indexador, spread, volume e contexto", "Separar dado observado, inferência e ausência"],
    proposedDeliverable: "Mapa de mercado e precedentes comparáveis, citado e delimitado",
  },
  monitoring: {
    objectiveKind: "monitoring", entryJob: null, outputTerminal: "monitoring_setup", targetTaskIds: [],
    sourcePlan: ["project_context", "provided_documents", "public_company", "public_market"],
    analysisPlan: ["Definir objeto, baseline, fontes e frequência", "Definir eventos materiais e tolerâncias", "Comparar cada atualização contra o último snapshot aprovado", "Explicar mudança, impacto e próxima ação"],
    proposedDeliverable: "Especificação de monitoramento com baseline, gatilhos e política de alerta",
  },
  workspace_management: {
    objectiveKind: "workspace_management", entryJob: null, outputTerminal: "workspace_change_preview", targetTaskIds: [],
    sourcePlan: ["project_context"],
    analysisPlan: ["Resolver o objeto e o estado atual do workspace", "Validar autorização e impacto da mudança", "Mostrar a alteração proposta antes de aplicá-la"],
    proposedDeliverable: "Prévia segura e reversível da alteração no workspace",
  },
};

/**
 * Compiles a normalized semantic objective into a bounded task contract. This is the architecture
 * boundary: a classifier can improve without gaining authority to invent work. The function
 * intentionally accepts no persona or seniority; profile can tune presentation later, but it
 * cannot change the work required by the objective.
 */
export function compileObjectivePlan(input: ObjectivePlanContextInput): ObjectiveToPlanDecision {
  const kind = input.objectiveKind;
  if (kind === "ambiguous") return finalize({
    objectiveKind: "ambiguous", mode: "collect_context", entryJob: null, outputTerminal: "corrigible_scope",
    targetTaskIds: [], sourcePlan: ["project_context"],
    analysisPlan: ["Confirmar o resultado que precisa existir ao final"],
    proposedDeliverable: "Entendimento corrigível do pedido",
    requiredContext: ["desired_outcome"], reasonCode: "objective_not_materially_resolved",
  });

  const recipe = recipes[kind];
  if (kind === "factual_question") return finalize({...recipe, mode: "conversation", requiredContext: [], reasonCode: "bounded_answer_only"});

  if (kind === "information_organization") {
    if (!input.hasAttachments) {
      return finalize({...recipe, mode: "coverage_gap", requiredContext: ["public_source_collection_executor"], reasonCode: "public_collection_executor_not_promoted"});
    }
    const withDocumentClassification = {...recipe, targetTaskIds: ["D02"]};
    return finalize({
      ...withDocumentClassification,
      mode: input.existingProject ? "continue_project" : "create_project",
      requiredContext: [],
      reasonCode: input.existingProject ? "document_index_continues_existing_project" : "document_index_compiled",
    });
  }

  if (kind === "monitoring") {
    return finalize({...recipe, mode: "coverage_gap", requiredContext: ["monitoring_baseline", "monitoring_executor"], reasonCode: "monitoring_executor_not_promoted"});
  }

  if (kind === "workspace_management") {
    return finalize({...recipe, mode: "coverage_gap", requiredContext: ["authorized_workspace_action"], reasonCode: "workspace_action_executor_not_promoted"});
  }

  if (kind === "capital_matching") {
    const missing = [
      ...(!input.existingProject?.hasSignedAnalyticalSnapshot ? ["signed_analytical_snapshot"] : []),
      ...(!input.existingProject?.hasCurrentMandates ? ["current_mandate_evidence"] : []),
    ];
    return finalize({
      ...recipe,
      mode: missing.length === 0 ? "continue_project" : "coverage_gap",
      requiredContext: missing,
      reasonCode: missing.length === 0 ? "matching_prerequisites_satisfied" : "matching_prerequisites_missing",
    });
  }

  if (kind === "material_preparation" && !input.existingProject?.hasSignedAnalyticalSnapshot) {
    return finalize({...recipe, mode: "coverage_gap", requiredContext: ["signed_analytical_snapshot"], reasonCode: "material_snapshot_required"});
  }

  if ((kind === "risk_matrix" || kind === "operation_review") && !input.hasAttachments) {
    return finalize({...recipe, mode: "collect_context", requiredContext: ["effective_document_set"], reasonCode: "review_evidence_required"});
  }

  return finalize({
    ...recipe,
    mode: input.existingProject ? "continue_project" : "create_project",
    requiredContext: kind === "documents_to_case" && !input.hasAttachments ? ["provided_documents"] : [],
    reasonCode: input.existingProject ? "objective_continues_existing_project" : "objective_compiled",
  });
}

/**
 * Compatibility classifier for current new-project entry. It exists while the semantic Intent
 * Envelope remains in shadow. Production migration replaces only this classification step; the
 * deterministic compiler above, its terminal recipes and its authority boundary stay unchanged.
 */
export function compileObjectiveToPlan(input: ObjectiveToPlanInput): ObjectiveToPlanDecision {
  const message = input.message.normalize("NFKC").replace(/\s+/g, " ").trim();
  const objectiveKind = input.explicitHint
    ? kindFromHint(input.explicitHint)
    : inferObjectiveKind(message, input.hasAttachments);
  return compileObjectivePlan({
    objectiveKind,
    hasAttachments: input.hasAttachments,
    ...(input.existingProject !== undefined ? {existingProject: input.existingProject} : {}),
  });
}

/**
 * Adds specialist terminal tasks selected by governed depth packs and recomputes the complete
 * objective identity. Callers cannot inject unknown tasks: `compileTaskGraph` remains the
 * allowlist and dependency-closure boundary.
 */
export function expandObjectivePlanWithTaskTargets(
  plan: ObjectiveToPlanDecision,
  additionalTargetTaskIds: readonly string[],
): ObjectiveToPlanDecision {
  const targetTaskIds = [...new Set([...plan.targetTaskIds, ...additionalTargetTaskIds])].sort();
  return finalize({
    objectiveKind: plan.objectiveKind,
    mode: plan.mode,
    entryJob: plan.entryJob,
    outputTerminal: plan.outputTerminal,
    targetTaskIds,
    sourcePlan: plan.sourcePlan,
    analysisPlan: plan.analysisPlan,
    proposedDeliverable: plan.proposedDeliverable,
    requiredContext: plan.requiredContext,
    reasonCode: plan.reasonCode,
  });
}

function inferObjectiveKind(message: string, hasAttachments: boolean): WorkspaceObjectiveKind {
  if (!message) return "ambiguous";
  if (objectivePatterns.monitoring.test(message)) return "monitoring";
  if (objectivePatterns.workspaceManagement.test(message)) return "workspace_management";
  if (objectivePatterns.capitalMatching.test(message)) return "capital_matching";
  if (objectivePatterns.material.test(message)) return "material_preparation";
  if (objectivePatterns.operationReview.test(message)) return "operation_review";
  if (objectivePatterns.riskMatrix.test(message)) return "risk_matrix";
  if (objectivePatterns.boardDecision.test(message)) return "board_decision";
  if (objectivePatterns.meeting.test(message)) return "meeting_preparation";
  if (objectivePatterns.informationOrganization.test(message)) return "information_organization";
  if (objectivePatterns.marketMapping.test(message)) return "market_mapping";
  if (hasAttachments && objectivePatterns.documents.test(message)) return "documents_to_case";
  if (objectivePatterns.companyAnalysis.test(message)) return "company_analysis";
  if (objectivePatterns.capitalStrategy.test(message)) return "capital_strategy";
  if (hasAttachments) return "documents_to_case";
  if (objectivePatterns.factualQuestion.test(message)) return "factual_question";
  return "ambiguous";
}

function kindFromHint(hint: ObjectiveEntryHint): WorkspaceObjectiveKind {
  switch (hint) {
    case "company_debt_view": return "company_analysis";
    case "origination_thesis": return "meeting_preparation";
    case "capital_planning": return "capital_strategy";
    case "structure_from_documents": return "documents_to_case";
    case "review_existing_operation": return "operation_review";
  }
}

function finalize(input: Omit<ObjectiveToPlanDecision, "schemaVersion" | "taskGraph" | "structuralIdentity">): ObjectiveToPlanDecision {
  const taskGraph = compileTaskGraph(input.targetTaskIds);
  const identityPayload = {
    schemaVersion: "objective-plan.v1",
    objectiveKind: input.objectiveKind,
    mode: input.mode,
    entryJob: input.entryJob,
    outputTerminal: input.outputTerminal,
    targetTaskIds: input.targetTaskIds,
    sourcePlan: input.sourcePlan,
    analysisPlan: input.analysisPlan,
    proposedDeliverable: input.proposedDeliverable,
    requiredContext: input.requiredContext,
  };
  return {
    schemaVersion: "objective-plan.v1",
    ...input,
    taskGraph,
    structuralIdentity: createHash("sha256").update(JSON.stringify(identityPayload)).digest("hex"),
  };
}
