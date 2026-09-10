import {z} from "zod";

import {canCompileStandaloneDocumentWorkRequest, documentWorkJob} from "./document-work-request";
import {isProviderResearchRequest} from "./provider-research-plan";

/**
 * The explicit list of standalone work a project can execute today. Every entry binds an
 * intention to an executor that already exists in the product, the inputs that executor needs,
 * the approval gate it goes through and the deliverable types a later format policy may attach.
 *
 * Presence in this registry is not authorization. Who may prepare, return or approve is decided
 * by the project review roles enforced in Postgres; a commercial or professional profile (CFO,
 * banker, analyst, investor) grants no data access and no approval power by itself.
 */
export const projectCapabilityRegistryVersion = "2026.09.10-project-capabilities-v1";

export const projectCapabilityIdSchema = z.enum(["documentary_reading", "financial_result", "provider_research"]);
export type ProjectCapabilityId = z.infer<typeof projectCapabilityIdSchema>;

/** Deliverable families the format policy (a later step) will map to editable and final formats. */
export const projectDeliverableTypeSchema = z.enum([
  "documentary_reading",
  "financial_model",
  "financial_memo",
  "executive_presentation",
  "market_research",
]);
export type ProjectDeliverableType = z.infer<typeof projectDeliverableTypeSchema>;

export const projectReviewRoleSchema = z.enum(["preparer", "reviewer", "approver"]);
export type ProjectReviewRole = z.infer<typeof projectReviewRoleSchema>;

export const projectReviewActionSchema = z.enum(["prepare", "return", "approve"]);
export type ProjectReviewAction = z.infer<typeof projectReviewActionSchema>;

export const projectWorkInputSchema = z.enum([
  "documentary_activation",
  "private_access",
  "ready_documents",
  "execution_brief",
  "reconciled_facts",
  "declared_assumptions",
  "case_criteria",
  "reference_date",
]);
export type ProjectWorkInput = z.infer<typeof projectWorkInputSchema>;

export const projectWorkSurfaceSchema = z.enum(["document-review", "institutional-setup", "provider-case-criteria"]);
export type ProjectWorkSurface = z.infer<typeof projectWorkSurfaceSchema>;

export type ProjectCapabilityLocale = "pt-BR" | "en-US";
type Localized = {pt: string; en: string};

export type ProjectCapabilityEntry = {
  id: ProjectCapabilityId;
  version: string;
  intention: Localized;
  summary: Localized;
  executor: {
    key: "documentary_work_revision" | "institutional_model" | "provider_case_fit";
    version: string;
    /** Database command that owns idempotency, versions and the approval hold. */
    command: string;
    /** Work surface that shows the inputs (before) and the result (after). */
    surface: ProjectWorkSurface;
  };
  inputs: readonly {key: ProjectWorkInput; label: Localized; neededBefore: "dispatch" | "execution"}[];
  approval: {
    gate: "execution_brief" | "institutional_configuration";
    action: "approve";
    separationOfDuties: "project_review_roles";
  };
  deliverableTypes: readonly ProjectDeliverableType[];
  plan: readonly Localized[];
  expectedResult: Localized;
  limits: readonly Localized[];
  onMissingData: {explanation: Localized; nextStep: Localized};
  onUnsupported: {explanation: Localized; nextStep: Localized};
};

const entry = (value: ProjectCapabilityEntry): ProjectCapabilityEntry => value;

export const projectCapabilityRegistry: readonly ProjectCapabilityEntry[] = [
  entry({
    id: "documentary_reading",
    version: "document-work-plan.v1",
    intention: {pt: "Leitura documental", en: "Documentary reading"},
    summary: {
      pt: "Comparar propostas, preparar uma reunião ou revisar uma oportunidade a partir dos documentos já enviados.",
      en: "Compare proposals, prepare a meeting or review an opportunity from the documents already provided.",
    },
    executor: {key: "documentary_work_revision", version: "2026.09.10-v12", command: "request_documentary_work_revision_v1", surface: "document-review"},
    inputs: [
      {key: "documentary_activation", label: {pt: "Leitura documental ativada para a organização", en: "Documentary reading activated for the organization"}, neededBefore: "dispatch"},
      {key: "private_access", label: {pt: "Projeto com acesso privado autorizado", en: "Project with authorized private access"}, neededBefore: "dispatch"},
      {key: "ready_documents", label: {pt: "Documentos processados", en: "Processed documents"}, neededBefore: "dispatch"},
      {key: "execution_brief", label: {pt: "Plano vigente do projeto", en: "Current project plan"}, neededBefore: "dispatch"},
    ],
    approval: {gate: "execution_brief", action: "approve", separationOfDuties: "project_review_roles"},
    deliverableTypes: ["documentary_reading"],
    plan: [
      {pt: "Conferir os documentos e declarar o que foi possível ler", en: "Check the documents and declare what could be read"},
      {pt: "Preparar a leitura com observações das fontes, hipóteses e lacunas separadas", en: "Prepare the reading with sourced observations, separate hypotheses and gaps"},
      {pt: "Salvar a leitura preliminar e disponibilizar Word editável para revisão", en: "Save the preliminary reading and provide editable Word for review"},
    ],
    expectedResult: {pt: "Leitura documental preliminar, com hipóteses, lacunas e Word editável", en: "Preliminary documentary reading with hypotheses, gaps and editable Word"},
    limits: [
      {pt: "Não inclui cálculos financeiros, recomendação de crédito ou envio ao mercado.", en: "Excludes financial calculations, credit recommendations and market distribution."},
      {pt: "Usa somente os documentos já enviados a este projeto.", en: "Uses only the documents already provided to this project."},
    ],
    onMissingData: {
      explanation: {pt: "A leitura documental precisa de documentos processados em um projeto privado e de um plano vigente.", en: "Documentary reading needs processed documents in a private project and a current plan."},
      nextStep: {pt: "Anexe os documentos e confirme o entendimento inicial; depois peça a leitura novamente.", en: "Attach the documents and confirm the initial understanding; then request the reading again."},
    },
    onUnsupported: {
      explanation: {pt: "Este pedido não é uma leitura documental: comparação de propostas, preparação de reunião ou revisão de oportunidade.", en: "This request is not a documentary reading: proposal comparison, meeting preparation or opportunity review."},
      nextStep: {pt: "Descreva o que deve ser lido nos documentos ou escolha outro tipo de trabalho.", en: "Describe what should be read in the documents or choose another type of work."},
    },
  }),
  entry({
    id: "financial_result",
    version: "institutional-model.v1",
    intention: {pt: "Resultado financeiro", en: "Financial result"},
    summary: {
      pt: "Calcular demonstrações, cenários e comparações a partir de fatos conciliados e premissas declaradas.",
      en: "Calculate statements, scenarios and comparisons from reconciled facts and declared assumptions.",
    },
    executor: {key: "institutional_model", version: "2026.09.10-v1", command: "submit_institutional_model_setup_v1", surface: "institutional-setup"},
    inputs: [
      {key: "reconciled_facts", label: {pt: "Fatos históricos aceitos dos documentos", en: "Accepted historical facts from the documents"}, neededBefore: "dispatch"},
      {key: "declared_assumptions", label: {pt: "Premissas declaradas por período", en: "Assumptions declared per period"}, neededBefore: "execution"},
      {key: "reference_date", label: {pt: "Data-base e moeda", en: "Reference date and currency"}, neededBefore: "execution"},
    ],
    approval: {gate: "institutional_configuration", action: "approve", separationOfDuties: "project_review_roles"},
    deliverableTypes: ["financial_model", "financial_memo", "executive_presentation"],
    plan: [
      {pt: "Vincular cada saldo histórico a um fato aceito e à sua fonte", en: "Bind each historical balance to an accepted fact and its source"},
      {pt: "Declarar premissas, capex e dívida por período, com justificativa", en: "Declare assumptions, capex and debt per period, with rationale"},
      {pt: "Revisar a configuração e aprovar antes do cálculo determinístico", en: "Review the configuration and approve before the deterministic calculation"},
      {pt: "Comparar resultados aprovados e exportar nos formatos disponíveis", en: "Compare approved results and export in the available formats"},
    ],
    expectedResult: {pt: "Demonstrações projetadas, cenários comparáveis e arquivos exportados da mesma versão aprovada", en: "Projected statements, comparable scenarios and exported files from the same approved version"},
    limits: [
      {pt: "Todo número vem do cálculo determinístico; nenhuma premissa é inventada.", en: "Every number comes from the deterministic calculation; no assumption is invented."},
      {pt: "Não é parecer de crédito nem promessa de aprovação, financiamento ou fechamento.", en: "It is not a credit opinion and never promises approval, funding or closing."},
    ],
    onMissingData: {
      explanation: {pt: "O resultado financeiro precisa de fatos históricos aceitos a partir de documentos processados.", en: "The financial result needs accepted historical facts from processed documents."},
      nextStep: {pt: "Anexe as demonstrações financeiras e confirme a leitura; a configuração do modelo fica disponível em seguida.", en: "Attach the financial statements and confirm the reading; the model configuration becomes available afterwards."},
    },
    onUnsupported: {
      explanation: {pt: "Este pedido não descreve um cálculo, modelo, cenário ou comparação financeira.", en: "This request does not describe a calculation, model, scenario or financial comparison."},
      nextStep: {pt: "Diga o que deve ser calculado ou comparado, ou escolha outro tipo de trabalho.", en: "Say what should be calculated or compared, or choose another type of work."},
    },
  }),
  entry({
    id: "provider_research",
    version: "provider-case-fit-plan.v1",
    intention: {pt: "Pesquisa de financiadores", en: "Provider research"},
    summary: {
      pt: "Comparar os critérios do caso com os mandatos e registros que a organização pode consultar.",
      en: "Compare the transaction criteria with the mandates and records the organization may read.",
    },
    executor: {key: "provider_case_fit", version: "2026.09.10-v14", command: "start_provider_case_fit_project_v1", surface: "provider-case-criteria"},
    inputs: [
      {key: "execution_brief", label: {pt: "Plano vigente do projeto", en: "Current project plan"}, neededBefore: "dispatch"},
      {key: "case_criteria", label: {pt: "Critérios do caso confirmados", en: "Confirmed transaction criteria"}, neededBefore: "execution"},
      {key: "reference_date", label: {pt: "Data de referência e moeda", en: "Reference date and currency"}, neededBefore: "execution"},
    ],
    approval: {gate: "execution_brief", action: "approve", separationOfDuties: "project_review_roles"},
    deliverableTypes: ["market_research"],
    plan: [
      {pt: "Confirmar critérios do caso e data-base informados", en: "Confirm the provided transaction criteria and reference date"},
      {pt: "Consultar somente mandatos e registros disponíveis à organização", en: "Read only mandates and records available to the organization"},
      {pt: "Comparar critérios, separar incompatibilidades e lacunas e ordenar os nomes para revisão", en: "Compare criteria, separate mismatches and gaps and order the names for review"},
    ],
    expectedResult: {pt: "Lista de financiadores para revisão, com aderência ao caso, fontes e datas", en: "Lender list for review, with transaction fit, sources and dates"},
    limits: [
      {pt: "Não confirma interesse, não autoriza contato e não converte pesquisa em mandato vigente.", en: "Does not confirm appetite, authorize contact or turn research into a current mandate."},
      {pt: "Registros públicos e privados permanecem com origens separadas.", en: "Public and private records keep separate origins."},
    ],
    onMissingData: {
      explanation: {pt: "A pesquisa de financiadores precisa de um plano vigente neste projeto para registrar a versão do pedido.", en: "Provider research needs a current plan in this project to record the request version."},
      nextStep: {pt: "Aguarde o plano inicial do projeto ficar disponível e peça a pesquisa novamente.", en: "Wait for the project's initial plan to become available and request the research again."},
    },
    onUnsupported: {
      explanation: {pt: "Este pedido não descreve uma pesquisa de financiadores, fundos ou mandatos.", en: "This request does not describe research on lenders, funds or mandates."},
      nextStep: {pt: "Descreva quais financiadores ou mandatos devem ser pesquisados, ou escolha outro tipo de trabalho.", en: "Describe which lenders or mandates should be researched, or choose another type of work."},
    },
  }),
];

export function projectCapability(id: ProjectCapabilityId): ProjectCapabilityEntry {
  const found = projectCapabilityRegistry.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`unknown project capability ${id}`);
  return found;
}

const financialPattern = /\b(calcul\w*|recalcul\w*|reconcili\w*|concilia\w*|model\w*|cen[aá]ri\w*|scenario\w*|proje[cç][aã]o|proje[cç][oõ]es|projection\w*|forecast\w*|dscr|ebitda|fluxo de caixa|cash ?flow|custo efetivo|effective cost|cet|tir|irr|vpl|npv|sensibil\w*|sensitivity|stress|demonstra[cç][aã]o|demonstra[cç][oõ]es|financial statements?|resultado financeiro|financial result|compara[cç][aã]o financeira|financial comparison|servi[cç]o da d[ií]vida|debt service|amortiza[cç][aã]o|amortization|covenant\w*)\b/i;

/** Only the objective text decides the intention; it never decides authorization. */
export function isFinancialResultRequest(objective: string): boolean {
  return financialPattern.test(objective.normalize("NFKC"));
}

export type ProjectWorkClassification = {
  capability: ProjectCapabilityId | null;
  documentaryJob: "comparison" | "meeting" | "review" | null;
  reason: "documentary" | "financial" | "provider_research" | "calculation_in_documentary_scope" | "unrecognized";
};

/** Same guards as the executors: documentary jobs stay qualitative and calculations go to the model. */
export function classifyProjectWorkObjective(objective: string): ProjectWorkClassification {
  const text = objective.trim();
  const documentaryJob = documentWorkJob(text);
  if (documentaryJob && canCompileStandaloneDocumentWorkRequest({objective: text, proposedDeliverable: "Preliminary documentary reading"})) {
    return {capability: "documentary_reading", documentaryJob, reason: "documentary"};
  }
  if (isFinancialResultRequest(text)) {
    return {capability: "financial_result", documentaryJob, reason: documentaryJob ? "calculation_in_documentary_scope" : "financial"};
  }
  if (isProviderResearchRequest(text)) return {capability: "provider_research", documentaryJob: null, reason: "provider_research"};
  return {capability: null, documentaryJob, reason: "unrecognized"};
}

export const projectWorkContextSchema = z.object({
  accessBasis: z.string().min(1),
  documentaryPlanningEnabled: z.boolean(),
  readyDocumentCount: z.number().int().nonnegative(),
  executionBriefAvailable: z.boolean(),
  institutionalSetupAvailable: z.boolean(),
  providerCaseFitAvailable: z.boolean(),
  /** Decided server-side from the project review roles; the registry only reports it. */
  callerActions: z.object({prepare: z.boolean(), return: z.boolean(), approve: z.boolean()}).strict(),
}).strict();
export type ProjectWorkContext = z.infer<typeof projectWorkContextSchema>;

export const projectWorkRequestInputSchema = z.object({
  objective: z.string().trim().min(3).max(8000),
  capability: z.union([projectCapabilityIdSchema, z.literal("auto")]),
}).strict();
export type ProjectWorkRequestInput = z.infer<typeof projectWorkRequestInputSchema>;

export type ProjectWorkBlockedReason = "documentary_not_activated" | "missing_inputs" | "not_authorized";
export type ProjectWorkUnsupportedReason = "unrecognized_objective" | "calculation_in_documentary_scope" | "documentary_job_unrecognized";

export type ProjectWorkDispatch =
  | {
    kind: "dispatch";
    capability: ProjectCapabilityId;
    entry: ProjectCapabilityEntry;
    documentaryJob: "comparison" | "meeting" | "review" | null;
    surface: ProjectWorkSurface;
    /** Inputs the executor still collects on its own surface before execution. */
    pendingInputs: ProjectWorkInput[];
    note: "calculation_routed_to_financial" | null;
  }
  | {
    kind: "blocked";
    capability: ProjectCapabilityId;
    entry: ProjectCapabilityEntry;
    reason: ProjectWorkBlockedReason;
    missingInputs: ProjectWorkInput[];
    explanation: Localized;
    nextStep: Localized;
  }
  | {
    kind: "unsupported";
    capability: ProjectCapabilityId | null;
    reason: ProjectWorkUnsupportedReason;
    explanation: Localized;
    nextStep: Localized;
    suggestedCapability: ProjectCapabilityId | null;
  };

function inputAvailable(key: ProjectWorkInput, context: ProjectWorkContext): boolean {
  switch (key) {
    case "documentary_activation": return context.documentaryPlanningEnabled;
    case "private_access": return context.accessBasis === "authorized_private";
    case "ready_documents": return context.readyDocumentCount > 0;
    case "execution_brief": return context.executionBriefAvailable;
    case "reconciled_facts": return context.institutionalSetupAvailable;
    case "declared_assumptions":
    case "case_criteria":
    case "reference_date":
      return true;
  }
}

/**
 * Decides where a free objective goes. The decision is explanatory and deterministic: it never
 * executes anything, never widens access and repeats the executors' own scope guards. The same
 * function runs in the browser for the preview and on the server before the atomic command.
 */
export function dispatchProjectWork(input: ProjectWorkRequestInput, rawContext: ProjectWorkContext): ProjectWorkDispatch {
  const request = projectWorkRequestInputSchema.parse(input);
  const context = projectWorkContextSchema.parse(rawContext);
  const classification = classifyProjectWorkObjective(request.objective);
  const requested = request.capability === "auto" ? classification.capability : request.capability;
  if (!requested) {
    return {
      kind: "unsupported", capability: null, reason: "unrecognized_objective",
      explanation: {
        pt: "Nenhuma capacidade disponível reconhece este pedido como leitura documental, resultado financeiro ou pesquisa de financiadores.",
        en: "No available capability recognizes this request as documentary reading, financial result or provider research.",
      },
      nextStep: {
        pt: "Escolha um tipo de trabalho explicitamente ou continue pela conversa do projeto.",
        en: "Choose a type of work explicitly or continue in the project conversation.",
      },
      suggestedCapability: null,
    };
  }
  const selected = projectCapability(requested);
  if (requested === "documentary_reading") {
    if (classification.reason === "calculation_in_documentary_scope" || (classification.documentaryJob && classification.capability !== "documentary_reading")) {
      return {
        kind: "unsupported", capability: "documentary_reading", reason: "calculation_in_documentary_scope",
        explanation: {
          pt: "A leitura documental é qualitativa e não executa cálculos, modelos ou conciliações. O cálculo pedido pertence ao resultado financeiro.",
          en: "Documentary reading is qualitative and performs no calculations, models or reconciliations. The requested calculation belongs to the financial result.",
        },
        nextStep: {pt: "Envie o pedido como resultado financeiro ou retire o cálculo do objetivo.", en: "Send the request as a financial result or remove the calculation from the objective."},
        suggestedCapability: "financial_result",
      };
    }
    if (!classification.documentaryJob) {
      return {kind: "unsupported", capability: "documentary_reading", reason: "documentary_job_unrecognized", explanation: selected.onUnsupported.explanation, nextStep: selected.onUnsupported.nextStep, suggestedCapability: classification.capability};
    }
  }
  if (!context.callerActions.prepare) {
    return {
      kind: "blocked", capability: requested, entry: selected, reason: "not_authorized", missingInputs: [],
      explanation: {pt: "Sua função neste projeto não permite preparar novos trabalhos.", en: "Your role in this project does not allow preparing new work."},
      nextStep: {pt: "Peça a um preparador do projeto ou a um administrador da organização para atribuir a função.", en: "Ask a project preparer or an organization administrator to assign the role."},
    };
  }
  if (requested === "documentary_reading" && !context.documentaryPlanningEnabled) {
    return {
      kind: "blocked", capability: requested, entry: selected, reason: "documentary_not_activated", missingInputs: ["documentary_activation"],
      explanation: {pt: "A leitura documental ainda não está ativada para esta organização; nenhum trabalho foi iniciado.", en: "Documentary reading is not yet activated for this organization; no work was started."},
      nextStep: {pt: "Continue pela conversa do projeto ou peça a ativação da leitura documental.", en: "Continue in the project conversation or request activation of documentary reading."},
    };
  }
  const missingInputs = selected.inputs.filter((item) => item.neededBefore === "dispatch" && !inputAvailable(item.key, context)).map((item) => item.key);
  if (missingInputs.length > 0) {
    return {kind: "blocked", capability: requested, entry: selected, reason: "missing_inputs", missingInputs, explanation: selected.onMissingData.explanation, nextStep: selected.onMissingData.nextStep};
  }
  return {
    kind: "dispatch",
    capability: requested,
    entry: selected,
    documentaryJob: requested === "documentary_reading" ? classification.documentaryJob : null,
    surface: selected.executor.surface,
    pendingInputs: selected.inputs.filter((item) => item.neededBefore === "execution").map((item) => item.key),
    note: request.capability === "auto" && classification.reason === "calculation_in_documentary_scope" ? "calculation_routed_to_financial" : null,
  };
}

/** Roles are additive per person; a small team may hold all three under the explicit setting. */
export function reviewActionAllowedByRoles(action: ProjectReviewAction, roles: readonly ProjectReviewRole[], options: {mode: "open" | "assigned"; selfApprovalAllowed: boolean; callerIsPreparer: boolean}): boolean {
  if (options.mode === "open") return true;
  if (action === "prepare") return roles.includes("preparer");
  if (action === "return") return roles.includes("reviewer") || roles.includes("approver");
  if (!roles.includes("approver")) return false;
  return !options.callerIsPreparer || options.selfApprovalAllowed;
}

export function localizeProjectCapability(text: Localized, locale: ProjectCapabilityLocale): string {
  return locale === "pt-BR" ? text.pt : text.en;
}
