import {createHash} from "node:crypto";

import {z} from "zod";

import {
  capitalProjectJobSchema,
  compileTaskGraph,
  type CapitalProjectJob,
  type CompiledTaskGraph,
} from "./capital-jobs";

type ObjectiveEntryHint = Exclude<CapitalProjectJob, "prepare_materials_and_process">;

export const workspaceObjectiveKindSchema = z.enum([
  "factual_question",
  "risk_matrix",
  "meeting_preparation",
  "board_decision",
  "documents_to_case",
  "capital_matching",
  "operation_review",
  "proposal_comparison",
  "relative_debt_cost",
  "debt_capacity",
  "debt_table",
  "covenant_headroom",
  "weekly_cash",
  "operating_projection",
  "projection_challenge",
  "receivables_funding",
  "quarter_update",
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

const internalGovernedSpecialistTargetManifest = deepFreeze({
  manifestVersion: "governed-specialist-targets.2026-09-07-v1",
  targets: {
    R01: {specialization: "receivables_underwriting", purpose: "Conciliar e testar carteira de recebíveis"},
  },
} as const);

/** Read-only inspection snapshot. Authorization always consults the private frozen manifest. */
export const governedSpecialistTargetManifest = deepFreeze(
  structuredClone(internalGovernedSpecialistTargetManifest),
);

export type TrustedObjectivePlanReceipt = Readonly<{
  planSnapshot: Readonly<ObjectiveToPlanDecision>;
  specialistTaskIds: readonly string[];
  specialistManifestVersion: typeof internalGovernedSpecialistTargetManifest.manifestVersion;
}>;

const trustedObjectivePlanReceipts = new WeakMap<ObjectiveToPlanDecision, TrustedObjectivePlanReceipt>();

const objectiveSourcePlanSchema = z.enum([
  "project_context", "provided_documents", "public_company", "public_market", "house_method", "capital_network",
]);

/**
 * Runtime boundary for a compiled objective plan. A structural identity is an integrity checksum,
 * not an authorization token: this schema proves that the supplied fields, canonical TaskSpec DAG
 * and checksum agree with one another. The caller must still obtain the plan from the governed
 * compiler/control plane rather than from model or user JSON.
 */
export const objectiveToPlanDecisionSchema = z.object({
  schemaVersion: z.literal("objective-plan.v1"),
  objectiveKind: workspaceObjectiveKindSchema,
  mode: objectivePlanModeSchema,
  entryJob: capitalProjectJobSchema.nullable(),
  outputTerminal: objectiveOutputTerminalSchema,
  targetTaskIds: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)).max(100),
  taskGraph: z.custom<CompiledTaskGraph>((value) => Boolean(value && typeof value === "object")),
  sourcePlan: z.array(objectiveSourcePlanSchema).max(6),
  analysisPlan: z.array(z.string().min(1)).max(30),
  proposedDeliverable: z.string().min(1),
  requiredContext: z.array(z.string().min(1)).max(30),
  reasonCode: z.string().min(1),
  structuralIdentity: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((plan, context) => {
  let canonicalGraph: CompiledTaskGraph;
  try {
    canonicalGraph = compileTaskGraph(plan.targetTaskIds);
  } catch (error) {
    context.addIssue({
      code: "custom",
      path: ["targetTaskIds"],
      message: error instanceof Error ? error.message : "invalid objective TaskSpec target",
    });
    return;
  }
  if (stableJson(plan.taskGraph) !== stableJson(canonicalGraph)) {
    context.addIssue({code: "custom", path: ["taskGraph"], message: "task graph does not match canonical target closure"});
  }
  if (plan.structuralIdentity !== computeObjectivePlanStructuralIdentity(plan)) {
    context.addIssue({code: "custom", path: ["structuralIdentity"], message: "objective structural identity mismatch"});
  }
  validateObjectivePlanSemantics(plan, context);
}) as z.ZodType<ObjectiveToPlanDecision>;

type ObjectiveRecipe = Omit<ObjectiveToPlanDecision,
  "schemaVersion" | "taskGraph" | "structuralIdentity" | "mode" | "requiredContext" | "reasonCode">;

const objectivePatterns = {
  capitalMatching: /\b(quem\s+(?:poderia|deveria|devemos)\s+(?:financiar|investir|acessar)|quais?\s+(?:fundos?|financiadores?|investidores?|lenders?)|map(?:ear|eamento)\s+(?:de\s+)?(?:fundos?|financiadores?|investidores?)|shortlist|matching|ader[eê]ncia\s+(?:ao|do)\s+mandato|capital\s+providers?|lenders?)\b/i,
  material: /\b(prepar(?:ar|e|a)|mont(?:ar|e|a)|produz(?:ir|a|e)|ger(?:ar|e|a)|compil(?:ar|e|a)|elabor(?:ar|e|a)|fa(?:z|ca|zer))\b.{0,100}\b(apresenta[cç][aã]o|deck|pitch|teaser|memo|memorando|term\s*sheet|modelo|planilha|excel|powerpoint|pptx|word|material)\b/i,
  operationReview: /\b(revis(?:ar|e|a|[aã]o)|test(?:ar|e|a)|redline|melhor(?:ar|e|a)|compar(?:ar|e|a))\b.{0,120}\b(term\s*sheets?|propostas?|minutas?|contratos?|opera[cç](?:[aã]o|[oõ]es)|estruturas?|covenants?|waterfall)\b/i,
  riskMatrix: /\b(matriz\s+de\s+risco|risk\s+matrix|mapa\s+de\s+riscos?|risk\s+register|riscos?\s+e\s+mitigantes?|covenants?|waterfall)\b/i,
  boardDecision: /\b(conselho|board|comit[eê]|committee|delibera[cç][aã]o|decis[aã]o\s+(?:interna|do\s+conselho)|aprova[cç][aã]o\s+interna)\b/i,
  meeting: /\b(reuni[aã]o|meeting|encontro|pitch|origina[cç][aã]o|origination|visita\s+(?:à|a)\s+companhia|conversa\s+(?:com|junto\s+(?:à|a|ao)))\b/i,
  documents: /\b(documentos?|arquivos?|pasta|data\s*room|balan[cç]os?|balancete|apresenta[cç][aã]o\s+institucional|material\s+fragmentado)\b/i,
  companyAnalysis: /\b(analis(?:ar|e|a)|entend(?:er|e|a)|estud(?:ar|e|a)|diagn[oó]stico|diagnostic|leitura)\b.{0,140}\b(companhia|empresa|company|balan[cç]o|d[ií]vida|endividamento|estrutura\s+de\s+capital)\b/i,
  capitalStrategy: /\b(refinanc(?:e|iar|iamento|ing)?|refi\b|liability|along(?:ar|amento)|repricing|capital\s+de\s+giro|working\s+capital|liquidez|expans[aã]o|capex|aquisi[cç][aã]o|m\s*&\s*a|estrutura\s+de\s+capital|capital\s+structure|capta[cç][aã]o|levantar\s+capital|financiar|d[ií]vida|endividamento)\b/i,
  factualQuestion: /(?:\?|\b(como|qual|quais|quanto|quando|onde|por\s+que|explique|mostre|what|which|how|why|where)\b)/i,
  informationOrganization: /\b(levant(?:ar|e|a)|colet(?:ar|e|a)|organiz(?:ar|e|a)|inventari(?:ar|e|a)|index(?:ar|e|a)|catalog(?:ar|ue|a)|find\s+and\s+organize)\b.{0,160}\b(informa[cç][oõ]es|documentos?|arquivos?|fontes?|fatos\s+relevantes|apresenta[cç][oõ]es|not[ií]cias|data\s*room|pasta)\b|\b(s[oó]\s+organiz(?:ar|e)|sem\s+an[aá]lise)\b/i,
  marketMapping: /\b(mercado|transa[cç][oõ]es|emiss[oõ]es|deb[eê]ntures|precedentes?|compar[aá]veis|comps|benchmark)\b.{0,160}\b(prazo|indexador|spread|termos?|pricing|pre[cç]o|volume|últimos?\s+meses|recentes?)\b|\b(mapa|levantamento|pesquisa)\s+de\s+(mercado|transa[cç][oõ]es|precedentes?|compar[aá]veis)\b/i,
  monitoring: /\b(monitore|monitorar|monitora|acompanhe|acompanhar|acompanha|vigie|watch|alert(?:ar|e)|avise|notifique)\b|\b(todo\s+dia|toda\s+semana|mensalmente|recorrente)\b.{0,100}\b(atualiza[cç][aã]o|mudan[cç]a|not[ií]cia|covenant|vencimento|mercado)\b/i,
  workspaceManagement: /\b(renome(?:ar|ie)|mov(?:a|e|er)|arquivar|desarquivar|compartilhar|permiss[aã]o|acesso)\b.{0,120}\b(projeto|pasta|arquivo|workspace|ambiente|usu[aá]rio|membro)\b|\b(organizar|criar)\b.{0,80}\b(projeto|workspace|ambiente)\b/i,
} as const;

/** Accents are folded in both the message and the patterns before testing. JavaScript `\b` only
 * knows ASCII word characters, so "comitê" never ended a match and "análise" never began one. */
function foldDiacritics(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

const foldedObjectivePatterns = Object.fromEntries(
  Object.entries(objectivePatterns).map(([name, pattern]) => [name, new RegExp(foldDiacritics(pattern.source), pattern.flags)]),
) as {readonly [K in keyof typeof objectivePatterns]: RegExp};

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
  proposal_comparison: {
    objectiveKind: "proposal_comparison", entryJob: "review_existing_operation", outputTerminal: "operation_review", targetTaskIds: ["S10"],
    sourcePlan: ["project_context", "provided_documents", "public_market", "house_method"],
    analysisPlan: ["Conciliar propostas, versões, firmeza, validade e condições precedentes", "Calcular custo efetivo equivalente na mesma curva datada sobre fluxos líquidos", "Integrar cada cronograma ao caixa e testar covenants, garantias e pré-pagamento", "Comparar alternativas e pontos de negociação sem aceitar ou enviar propostas"],
    proposedDeliverable: "Comparação de propostas com custo equivalente, restrições, executabilidade e escolha condicionada",
  },
  relative_debt_cost: {
    objectiveKind: "relative_debt_cost", entryJob: "company_debt_view", outputTerminal: "capital_alternative_map", targetTaskIds: ["C05", "K04"],
    sourcePlan: ["project_context", "provided_documents", "public_company", "public_market", "house_method"],
    analysisPlan: ["Conciliar nosso custo e operações dos pares com fonte, data e definição", "Normalizar data, prazo, garantia, instrumento e porte sem fabricar ajustes", "Decompor diferença observada, ajustes fundamentados e residual de crédito", "Testar economia de renegociação e acesso antes de preparar a resposta à audiência"],
    proposedDeliverable: "Diagnóstico de custo relativo com ponte verificável, limites da comparação e ações economicamente justificadas",
  },
  debt_capacity: {
    objectiveKind: "debt_capacity", entryJob: "capital_planning", outputTerminal: "capital_alternative_map", targetTaskIds: ["C10"],
    sourcePlan: ["project_context", "provided_documents", "public_company", "public_market", "house_method"],
    analysisPlan: ["Analisar investimento incremental antes de escolher financiamento", "Projetar companhia com e sem projeto até o fim da amortização", "Buscar tamanho e perfil que respeitam cada limite em cada período e cenário", "Separar limite contratual, política, liquidez, mercado e condições da recomendação"],
    proposedDeliverable: "Capacidade de dívida por período e cenário, com limite vinculante, perfil viável e condições",
  },
  debt_table: {
    objectiveKind: "debt_table", entryJob: "company_debt_view", outputTerminal: "capital_alternative_map", targetTaskIds: ["C05"],
    sourcePlan: ["project_context", "provided_documents", "house_method"],
    analysisPlan: ["Uma linha por operação, com a cláusula de onde saiu cada termo", "Conciliar principal, saldo contábil e cada definição de dívida com a ponte", "Cronograma, garantias, covenants e cadeia de cross-default", "Separar o que está fora do saldo e o que falta para provar completude"],
    proposedDeliverable: "Tabela de dívida auditável, com totais em cada definição, cronograma, garantias, cross-default e completude",
  },
  covenant_headroom: {
    objectiveKind: "covenant_headroom", entryJob: "company_debt_view", outputTerminal: "capital_alternative_map", targetTaskIds: ["C08"],
    sourcePlan: ["project_context", "provided_documents", "house_method"],
    analysisPlan: ["Medir cada covenant e a política do conselho pela definição escrita, na data de apuração", "Traduzir a folga em EBITDA e em dívida, com teste reverso sobre o período não realizado", "Testar o caso adverso, o efeito sazonal e os contrastes de definição", "Explicar a consequência de romper antes de qualquer ação"],
    proposedDeliverable: "Folga de covenant e da política por data e cenário, em reais, com teste reverso e consequência",
  },
  weekly_cash: {
    objectiveKind: "weekly_cash", entryJob: "company_debt_view", outputTerminal: "capital_alternative_map", targetTaskIds: ["C06"],
    sourcePlan: ["project_context", "provided_documents", "house_method"],
    analysisPlan: ["Somar o caixa por semana a partir de eventos datados", "Achar a semana mais apertada, as abaixo do mínimo e o que vence nelas", "Conciliar com a projeção mensal e mostrar o que o fechamento esconde", "Custear cada ação pelo tempo de uso e mostrar o efeito na apuração"],
    proposedDeliverable: "Fluxo de caixa semanal com a semana crítica, o calendário de vencimentos e a ação mais barata que cobre",
  },
  operating_projection: {
    objectiveKind: "operating_projection", entryJob: "company_debt_view", outputTerminal: "capital_alternative_map", targetTaskIds: ["C07"],
    sourcePlan: ["project_context", "provided_documents", "house_method"],
    analysisPlan: ["Reproduzir o último ano pelos drivers do negócio antes de projetar", "Projetar por volume, preço, custos e prazos até o caixa disponível para a dívida", "Comparar com o orçamento e a revisão da companhia sem sobrescrever, com a causa da diferença", "Separar dado de hipótese e medir em reais as premissas que decidem"],
    proposedDeliverable: "Projeção por driver com o último ano reproduzido, caixa disponível para a dívida, sensibilidades em reais e as perguntas que só a companhia responde",
  },
  projection_challenge: {
    objectiveKind: "projection_challenge", entryJob: "company_debt_view", outputTerminal: "capital_alternative_map", targetTaskIds: ["C07"],
    sourcePlan: ["project_context", "provided_documents", "house_method"],
    analysisPlan: ["Ler as premissas do plano contra uma referência por drivers", "Medir o efeito isolado de cada premissa no EBITDA e no caixa, em ordem", "Confrontar cada premissa com a régua: histórico, capacidade, contratos e prazos", "Dizer a evidência que sustentaria cada uma e como apresentar o plano"],
    proposedDeliverable: "Crítica do plano premissa a premissa, com efeito em reais, régua, evidência pedida e a recomendação de apresentação, sem rodar cenário novo",
  },
  receivables_funding: {
    objectiveKind: "receivables_funding", entryJob: "capital_planning", outputTerminal: "capital_alternative_map", targetTaskIds: ["R01", "C06"],
    sourcePlan: ["project_context", "provided_documents", "house_method"],
    analysisPlan: ["Separar da carteira bruta o que pode ser cedido, com o motivo de cada exclusão", "Ler a carteira contra cada porta, com volume, custo pelo tempo de uso e IOF", "Comparar com a linha bancária e mostrar o efeito em balanço, covenant e garantias", "Montar o plano pela porta mais barata, com prazo e condições precedentes"],
    proposedDeliverable: "Carteira cedível, portas com volume e custo contra a linha bancária, efeitos contratuais e plano de execução com prazo",
  },
  quarter_update: {
    objectiveKind: "quarter_update", entryJob: "company_debt_view", outputTerminal: "capital_alternative_map", targetTaskIds: ["C07", "C08"],
    sourcePlan: ["project_context", "provided_documents", "house_method"],
    analysisPlan: ["Comparar o realizado com o projetado linha a linha", "Explicar cada desvio por causa e separar o pontual do que continua", "Propagar só para as análises que dependem do dado, preservando as versões anteriores", "Dizer qual decisão muda, a ação dentro do aprovado e o que não mudou"],
    proposedDeliverable: "Realizado contra projetado com ponte por causa, análises dependentes atualizadas, efeito nas decisões e ação proposta",
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
    analysisPlan: ["Fixar necessidade econômica e restrições", "Analisar investimento incremental, giro de partida e alternativas com e sem projeto quando aplicável", "Dimensionar capacidade e fonte de pagamento até o fim da amortização", "Comparar instrumentos, custo, flexibilidade e execução"],
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

function validateObjectivePlanSemantics(plan: ObjectiveToPlanDecision, context: z.RefinementCtx): void {
  if (plan.objectiveKind === "ambiguous") {
    const fixed: Array<[keyof ObjectiveToPlanDecision, unknown]> = [
      ["entryJob", null], ["outputTerminal", "corrigible_scope"], ["sourcePlan", ["project_context"]],
      ["analysisPlan", ["Confirmar o resultado que precisa existir ao final"]],
      ["proposedDeliverable", "Entendimento corrigível do pedido"],
    ];
    validateFixedObjectiveFields(plan, fixed, context);
    validateObjectiveState(plan, [{
      mode: "collect_context", reasonCode: "objective_not_materially_resolved", requiredContext: ["desired_outcome"],
    }], context);
    return;
  }

  const recipe = recipes[plan.objectiveKind];
  validateFixedObjectiveFields(plan, [
    ["entryJob", recipe.entryJob], ["outputTerminal", recipe.outputTerminal], ["sourcePlan", recipe.sourcePlan],
    ["analysisPlan", recipe.analysisPlan], ["proposedDeliverable", recipe.proposedDeliverable],
  ], context);

  const expectedBaseTargets = canonicalObjectiveRecipeTargetTaskIds(plan);
  if (expectedBaseTargets.some((taskId) => !plan.targetTaskIds.includes(taskId))) {
    context.addIssue({code: "custom", path: ["targetTaskIds"], message: "canonical objective target was removed"});
  }
  if (new Set(plan.targetTaskIds).size !== plan.targetTaskIds.length) {
    context.addIssue({code: "custom", path: ["targetTaskIds"], message: "objective targets must be unique"});
  }

  const ordinary: ObjectiveState[] = [
    {mode: "create_project", reasonCode: "objective_compiled", requiredContext: []},
    {mode: "continue_project", reasonCode: "objective_continues_existing_project", requiredContext: []},
  ];
  let allowed: ObjectiveState[];
  switch (plan.objectiveKind) {
    case "factual_question":
      allowed = [{mode: "conversation", reasonCode: "bounded_answer_only", requiredContext: []}];
      break;
    case "information_organization":
      allowed = [
        {mode: "coverage_gap", reasonCode: "public_collection_executor_not_promoted", requiredContext: ["public_source_collection_executor"]},
        {mode: "create_project", reasonCode: "document_index_compiled", requiredContext: []},
        {mode: "continue_project", reasonCode: "document_index_continues_existing_project", requiredContext: []},
      ];
      break;
    case "monitoring":
      allowed = [{mode: "coverage_gap", reasonCode: "monitoring_executor_not_promoted", requiredContext: ["monitoring_baseline", "monitoring_executor"]}];
      break;
    case "workspace_management":
      allowed = [{mode: "coverage_gap", reasonCode: "workspace_action_executor_not_promoted", requiredContext: ["authorized_workspace_action"]}];
      break;
    case "capital_matching":
      allowed = [
        {mode: "continue_project", reasonCode: "matching_prerequisites_satisfied", requiredContext: []},
        {mode: "coverage_gap", reasonCode: "matching_prerequisites_missing", requiredContext: ["signed_analytical_snapshot"]},
        {mode: "coverage_gap", reasonCode: "matching_prerequisites_missing", requiredContext: ["current_mandate_evidence"]},
        {mode: "coverage_gap", reasonCode: "matching_prerequisites_missing", requiredContext: ["signed_analytical_snapshot", "current_mandate_evidence"]},
      ];
      break;
    case "material_preparation":
      allowed = [
        {mode: "coverage_gap", reasonCode: "material_snapshot_required", requiredContext: ["signed_analytical_snapshot"]},
        {mode: "continue_project", reasonCode: "objective_continues_existing_project", requiredContext: []},
      ];
      break;
    case "risk_matrix":
    case "operation_review":
      allowed = [...ordinary, {mode: "collect_context", reasonCode: "review_evidence_required", requiredContext: ["effective_document_set"]}];
      break;
    case "documents_to_case":
      allowed = [
        ...ordinary,
        {mode: "create_project", reasonCode: "objective_compiled", requiredContext: ["provided_documents"]},
        {mode: "continue_project", reasonCode: "objective_continues_existing_project", requiredContext: ["provided_documents"]},
      ];
      break;
    default:
      allowed = ordinary;
  }
  validateObjectiveState(plan, allowed, context);
}

type ObjectiveState = Pick<ObjectiveToPlanDecision, "mode" | "reasonCode" | "requiredContext">;

function validateFixedObjectiveFields(
  plan: ObjectiveToPlanDecision,
  fields: ReadonlyArray<[keyof ObjectiveToPlanDecision, unknown]>,
  context: z.RefinementCtx,
): void {
  for (const [key, expected] of fields) {
    if (stableJson(plan[key]) !== stableJson(expected)) {
      context.addIssue({code: "custom", path: [key], message: "field does not match canonical objective recipe"});
    }
  }
}

function validateObjectiveState(plan: ObjectiveToPlanDecision, allowed: readonly ObjectiveState[], context: z.RefinementCtx): void {
  const actual = {mode: plan.mode, reasonCode: plan.reasonCode, requiredContext: plan.requiredContext};
  if (!allowed.some((candidate) => stableJson(candidate) === stableJson(actual))) {
    context.addIssue({code: "custom", path: ["mode"], message: "mode, reason and required context do not match a canonical objective state"});
  }
}

/**
 * Compiles a normalized semantic objective into a bounded task contract. This is the architecture
 * boundary: a classifier can improve without gaining authority to invent work. The function
 * intentionally accepts no persona or seniority; the declared objective and evidence determine scope, and it
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
  const inferred = inferObjectiveKind(message, input.hasAttachments);
  // A generic entry shortcut cannot erase a more specific financial question in the message.
  const explicitDocumentaryScope = /\b(?:documental|documentary|document[- ]only)\b/i.test(message);
  const objectiveKind = input.explicitHint && (!isSpecificFinancialObjective(inferred) || explicitDocumentaryScope)
    ? kindFromHint(input.explicitHint)
    : inferred;
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
  const receipt = assertTrustedObjectivePlan(plan);
  // Preserve the registry's canonical unknown-task error before applying the narrower specialist
  // authorization policy.
  compileTaskGraph(additionalTargetTaskIds);
  const governedSpecialistTargets = new Set(Object.keys(internalGovernedSpecialistTargetManifest.targets));
  const ungoverned = additionalTargetTaskIds.find((taskId) => !governedSpecialistTargets.has(taskId));
  if (ungoverned) throw new Error(`objective target ${ungoverned} lacks a governed specialist manifest binding`);
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
  }, [...new Set([...receipt.specialistTaskIds, ...additionalTargetTaskIds])].sort());
}

/**
 * Runtime trust boundary for objective plans. The public schema validates shape and deterministic
 * integrity only; it never grants execution authority. Only plans emitted by this compiler in the
 * current process have an opaque receipt. A persistence adapter must recompile and reauthorize a
 * stored plan before it can cross this boundary in a new process.
 */
export function assertTrustedObjectivePlan(plan: ObjectiveToPlanDecision): TrustedObjectivePlanReceipt {
  const receipt = trustedObjectivePlanReceipts.get(plan);
  if (!receipt) throw new Error("objective plan lacks a trusted compiler attestation");
  return deepFreeze(structuredClone(receipt));
}

/**
 * Returns the targets owned by the base objective recipe. Any remaining target in a verified plan
 * was added by a governed specialization/depth pack and must survive terminal composition.
 */
export function canonicalObjectiveRecipeTargetTaskIds(plan: ObjectiveToPlanDecision): readonly string[] {
  if (plan.objectiveKind === "ambiguous") return [];
  if (plan.objectiveKind === "information_organization") {
    return plan.reasonCode === "document_index_compiled" || plan.reasonCode === "document_index_continues_existing_project"
      ? ["D02"]
      : [];
  }
  return recipes[plan.objectiveKind].targetTaskIds;
}

function inferObjectiveKind(message: string, hasAttachments: boolean): WorkspaceObjectiveKind {
  if (!message) return "ambiguous";
  const text = financialRoutingText(message);
  if (foldedObjectivePatterns.monitoring.test(text)) return "monitoring";
  if (foldedObjectivePatterns.workspaceManagement.test(text)) return "workspace_management";
  if (foldedObjectivePatterns.capitalMatching.test(text)) return "capital_matching";
  if (foldedObjectivePatterns.informationOrganization.test(text)) return "information_organization";
  const financialObjective = inferSpecificFinancialObjective(message);
  if (financialObjective) return financialObjective;
  // The four methods of lote 3 are considered only after every existing specific objective, and only when
  // the message does not ask for an explanation, a deliverable, a review of an operation or a contract,
  // or a capital strategy; those keep their own routes with their signals unchanged.
  const lote3 = inferLote3Objective(text);
  if (lote3) return lote3;
  if (/^(?:o que (?:e|significa)|explique (?:o conceito|a definicao|como funciona)|qual (?:e )?a diferenca entre|como funciona)\b/i.test(financialRoutingText(message))) return "factual_question";
  // A meeting request that asks for an approach, a script or questions is meeting preparation even
  // when it also mentions material: the brief comes first and material only after it is confirmed.
  if (foldedObjectivePatterns.meeting.test(text) && /\b(abordagem|roteiro|perguntas)\b/.test(text)) return "meeting_preparation";
  if (foldedObjectivePatterns.material.test(text)) return "material_preparation";
  if (foldedObjectivePatterns.operationReview.test(text)) return "operation_review";
  if (foldedObjectivePatterns.riskMatrix.test(text)) return "risk_matrix";
  if (foldedObjectivePatterns.boardDecision.test(text)) return "board_decision";
  if (foldedObjectivePatterns.meeting.test(text)) return "meeting_preparation";
  if (foldedObjectivePatterns.marketMapping.test(text)) return "market_mapping";
  if (foldedObjectivePatterns.companyAnalysis.test(text)) return "company_analysis";
  if (foldedObjectivePatterns.capitalStrategy.test(text)) return "capital_strategy";
  if (/\b(?:financio|financiamos|financie)\b|\bvence(?:m)?\b.{0,100}\b(?:investimento|capex|divida)\b/i.test(financialRoutingText(message))) return "capital_strategy";
  if (hasAttachments) return "documents_to_case";
  if (foldedObjectivePatterns.factualQuestion.test(text)) return "factual_question";
  return "ambiguous";
}

function financialRoutingText(message: string): string {
  return message.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isSpecificFinancialObjective(kind: WorkspaceObjectiveKind): boolean {
  return kind === "proposal_comparison" || kind === "relative_debt_cost" || kind === "debt_capacity"
    || kind === "debt_table" || kind === "covenant_headroom" || kind === "weekly_cash"
    || kind === "operating_projection" || kind === "projection_challenge" || kind === "receivables_funding" || kind === "quarter_update";
}

/** Interpret action/object pairs before broad audience and attachment heuristics. No case names,
 * amounts, model output or document contents participate in this classification boundary. */
function inferSpecificFinancialObjective(message: string): WorkspaceObjectiveKind | null {
  const text = financialRoutingText(message);
  if (/\b(?:por que|explique|entender|resposta)\b.{0,180}\b(?:pagamos|pago|pagando)\b.{0,60}\bmais\b/.test(text)
    || /\b(?:nosso|nossa)\b.{0,70}\b(?:custo|spread|taxa)\b.{0,100}\b(?:pares|concorrentes|maior|superior)\b/.test(text)
    || /\b(?:emitiu|emissao)\b.{0,70}\b(?:cdi|ipca|spread)\b.{0,120}\b(?:a gente|nos|nossa empresa)\b.{0,30}\bpaga/.test(text)) return "relative_debt_cost";
  if (/\b(?:quanto|limite|capacidade|teto)\b.{0,100}\b(?:divida|alavancar|alavancagem)\b/.test(text)
    && !/\b(?:o que (?:e|significa)|conceito|definicao)\b/.test(text)
    || /\b(?:divida|credito)\b.{0,70}\b(?:cabe|cabem|aguenta|suporta)\b/.test(text)
    || /\bbanco\b.{0,50}\b(?:disse|afirma|indicou)\b.{0,50}\b(?:cabe|cabem)\b/.test(text)) return "debt_capacity";
  if (/\b(?:comparar|compare|comparacao|recebemos|chegaram|recebi)\b.{0,120}\b(?:propostas|term\s*sheets|ofertas)\b/.test(text)
    || /\b(?:qual|escolher|melhor|mais barata)\b.{0,100}\b(?:propostas|term\s*sheets|ofertas)\b/.test(text)
    || /\bmais barato\b.{0,60}\bposso fechar\b/.test(text)) return "proposal_comparison";
  // The debt methods of lote 2 answer the measurement itself. A conceptual question, or a message whose
  // action is another one (compare, review, a risk matrix, a draft, proposals, strategy or paths), keeps
  // its own route even when it mentions the debt table, a covenant or weekly cash.
  const conceptual = /^(?:o que (?:e|significa)|explique (?:o conceito|a definicao|como funciona)|qual (?:e )?a diferenca entre|como funciona)\b|\b(?:o conceito de|como funciona)\b/.test(text);
  // A purpose or a source ("para refinanciamento", "considerando a proposta") does not change an explicit
  // request for the measurement; another action only wins when the message does not ask for one.
  const asksMeasurement = /\b(?:mont\w*|projet\w*|calcul\w*|med(?:e|ir|a)|atualiz\w*|extra(?:i|ia|ir)|levant\w*|fa(?:z|ca|zer))\b.{0,40}\b(?:tabela|caixa|covenants?|divida|endividamento|folga)\b/.test(text);
  const otherAction = /\b(?:compar\w*|revis\w*|redline|matriz|minutas?|term\s*sheets?|propostas?|ofertas?|negoci\w*|waiver|estrategi\w*|caminhos?|alongar|refinanc\w*|captar|captacao)\b/.test(text);
  if (conceptual || (otherAction && !asksMeasurement)) return null;
  if (/\b(?:semana mais apertada|caixa semanal|fluxo (?:de caixa )?semanal|semana a semana|o que vence)\b/.test(text)
    || /\bcaixa\b.{0,40}\bate (?:dezembro|janeiro|o fim|o final|o fechamento)\b/.test(text)
    || /\baguent\w*\b.{0,30}\bate o (?:fim|final)\b/.test(text)
    || /\bsacar\b.{0,40}\b(?:conta garantida|linha|cheque especial)\b/.test(text)) return "weekly_cash";
  if ((/\b(?:folga|headroom|estour\w*|romp\w*|fur(?:ar|a)|quebr\w*|calcul\w*|med(?:e|ir)|apur\w*|contra os|risco de)\b.{0,60}\bcovenants?\b/.test(text)
      || /\bcovenants?\b.{0,60}\b(?:folga|em (?:dezembro|junho|marco|setembro)|na data|na definicao|passa)\b/.test(text))) return "covenant_headroom";
  if (/\b(?:tabela|mapa|quadro|posicao|cronograma)\b.{0,40}\b(?:divida|endividamento)\b/.test(text)
    || /\bendividamento\b.{0,20}\batualizado\b/.test(text)
    || /\bquanto (?:a gente|a empresa|a companhia|nos) (?:deve|devemos)\b/.test(text)
    || /\bextra(?:i|ia|ir|ia)\b.{0,40}\bdivida\b/.test(text)) return "debt_table";
  return null;
}

/** The methods of lote 3: a projection built by driver (C24), a projection challenged (C26), receivables
 * turned into working capital (C35) and a quarter close carried forward (C54). Called after the specific
 * objectives of lotes 1 and 2. A first-class signal of another route vetoes all four: an explanation asked
 * anywhere in the sentence, a deliverable (deck, memo, spreadsheet, presentation), a review of an operation
 * or of a contractual or amortization plan, a capital strategy asked as such, and a comparison of external
 * financing proposals or offers. Comparing scenarios or alternatives of the projection itself, the
 * projection against the budget or the actual against the projected is part of these methods. */
function inferLote3Objective(text: string): WorkspaceObjectiveKind | null {
  const explanation = /\b(?:explique|explica|explicar|me explique|o que (?:e|sao|significa)|como funciona|o conceito de|qual (?:e )?a diferenca entre|defina|definicao de)\b/.test(text);
  const deliverable = foldedObjectivePatterns.material.test(text)
    || /\b(?:deck|apresentacao|teaser|memo|memorando|pitch|powerpoint|pptx|slides?|planilha|excel|minutas?|redline)\b/.test(text);
  const contractual = foldedObjectivePatterns.operationReview.test(text)
    || /\bplanos?\b.{0,40}\b(?:amortiz\w*|pagamentos?|parcel\w*|contratua\w*|contrato)\b|\bamortiz\w*\b/.test(text);
  const strategy = /\b(?:estrategi\w*|caminhos?|alongar|alongamento|refinanc\w*|matriz de riscos?)\b/.test(text);
  const externalComparison = /\bcompar\w*\b.{0,60}\b(?:propostas?|ofertas?|term\s*sheets?|bancos?|financiadores?|linhas? de credito|alternativas de (?:divida|financiamento|captacao|credito))\b/.test(text)
    || /\balternativas de (?:divida|financiamento|captacao|credito)\b/.test(text);
  if (explanation || deliverable || contractual || strategy || externalComparison) return null;
  // C54 needs an explicit request to carry the close forward.
  const close = /\b(?:fech(?:ou|amos|ei|amento)|encerr(?:ou|amos))\b.{0,20}\b(?:o |a |do |da )?(?:trimestre|semestre|mes|exercicio|balancete)\b|\b(?:saiu|chegou|chegaram|recebemos)\b.{0,12}\b(?:o |a )?(?:balancete|fechamento|gerencial do (?:trimestre|mes))\b|\b(?:trimestre|balancete|fechamento)\b/.test(text);
  const update = /\b(?:atualiz\w*|refaz\w*|refa(?:ca|zer)|propag\w*)\b/.test(text);
  if ((close && update)
    || /\bo que mudou\b.{0,60}\b(?:trimestre|semestre|fechamento|balancete)\b/.test(text)
    || (/\brealizado\b.{0,30}\b(?:contra|versus|vs|com)\b.{0,30}\b(?:projetado|orcado|orcamento)\b/.test(text) && (update || close))) return "quarter_update";
  // C35 weighs the company's own receivables against the bank line or asks who would buy them.
  const instead = /\b(?:em vez|no lugar|ao inves)\b|\blinha (?:do|de|no) banco\b|\blinha bancaria\b/.test(text);
  if ((/\brecebiveis\b|\bduplicatas\b/.test(text) && instead)
    || /\b(?:quais|qual|que)\b.{0,20}\bfidcs?\b|\bfidcs?\b.{0,40}\b(?:proprio|compr\w*|nossa carteira)\b/.test(text)) return "receivables_funding";
  // A plan here is a financial or business plan.
  const projectionObject = "(?:projecao|projecoes|business plan|plano de negocios|plano financeiro|orcamento|plano)";
  if (new RegExp(`\\b(?:questionaria|questionar|contest\\w*|atac\\w*|cortar|cortaria)\\b.{0,80}\\b${projectionObject}`).test(text)
    || /\bpremissas?\b.{0,80}\b(?:questionaria|questionar|contestar|frageis|fracas|otimistas?|agressivas?)\b/.test(text)
    || new RegExp(`\\b${projectionObject}\\b.{0,40}\\b(?:otimista|agressiv\\w*|factivel|defensavel|realista)\\b`).test(text)
    || new RegExp(`\\brevis\\w*\\b.{0,40}\\b${projectionObject}`).test(text)) return "projection_challenge";
  if (/\b(?:constru\w*|mont\w*|fa(?:z|ca|zer)|cri(?:a|ar|e)|elabor\w*|comec\w*|preciso de|ajud\w*)\b.{0,60}\b(?:projecao|projecoes|business plan|plano de negocios)\b/.test(text)
    || /\b(?:nao temos|nao tenho|sem)\b.{0,20}\b(?:projecao|business plan|plano de negocios)\b/.test(text)
    || /\bprimeira versao\b.{0,60}\b(?:projecao|hipoteses|premissas)\b/.test(text)) return "operating_projection";
  return null;
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

function finalize(
  input: Omit<ObjectiveToPlanDecision, "schemaVersion" | "taskGraph" | "structuralIdentity">,
  specialistTaskIds: readonly string[] = [],
): ObjectiveToPlanDecision {
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
  const parsed = objectiveToPlanDecisionSchema.parse({
    schemaVersion: "objective-plan.v1",
    ...input,
    taskGraph,
    structuralIdentity: createHash("sha256").update(JSON.stringify(identityPayload)).digest("hex"),
  });
  const plan = deepFreeze(parsed);
  const planSnapshot = deepFreeze(structuredClone(parsed));
  trustedObjectivePlanReceipts.set(plan, deepFreeze({
    planSnapshot,
    specialistTaskIds: deepFreeze([...specialistTaskIds]),
    specialistManifestVersion: internalGovernedSpecialistTargetManifest.manifestVersion,
  }));
  return plan;
}

function computeObjectivePlanStructuralIdentity(plan: Omit<ObjectiveToPlanDecision, "structuralIdentity" | "taskGraph">): string {
  const identityPayload = {
    schemaVersion: "objective-plan.v1",
    objectiveKind: plan.objectiveKind,
    mode: plan.mode,
    entryJob: plan.entryJob,
    outputTerminal: plan.outputTerminal,
    targetTaskIds: plan.targetTaskIds,
    sourcePlan: plan.sourcePlan,
    analysisPlan: plan.analysisPlan,
    proposedDeliverable: plan.proposedDeliverable,
    requiredContext: plan.requiredContext,
  };
  return createHash("sha256").update(JSON.stringify(identityPayload)).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) => nested && typeof nested === "object" && !Array.isArray(nested)
    ? Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)))
    : nested);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
