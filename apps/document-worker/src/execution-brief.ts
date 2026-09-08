import type {WorkspaceJobActivation} from "@offroad/agent-contracts";
import {
  compileCapitalExecutionBrief,
  compileExecutionBrief,
  diffVisibleExecutionBrief,
  offroadTaskEffectSchema,
  visibleExecutionBrief,
  visibleExecutionBriefSchema,
  type CapitalProjectPlanSnapshot,
  type CompiledExecutionBrief,
  type ExecutionBriefChange,
  type ExecutionBriefSource,
  type VisibleExecutionBrief,
} from "@offroad/work-plan";
import {z} from "zod";

import type {PreviewActivation} from "./integration-preview";
import {buildGovernedSectorPlanning, type GovernedSectorContextInputs} from "./governed-sector-planning";

const capitalPlanSchema = z.object({
  schemaVersion: z.literal("capital-project-plan.v1"),
  compilerVersion: z.string().min(3),
  registryVersion: z.string().min(3),
  job: z.object({id: z.enum([
    "company_debt_view",
    "origination_thesis",
    "capital_planning",
    "structure_from_documents",
    "review_existing_operation",
    "prepare_materials_and_process",
  ])}).passthrough(),
  taskSpecs: z.array(z.object({
    id: z.string().regex(/^[A-Z][0-9]{2}$/),
    dependencies: z.array(z.string()),
    effect: offroadTaskEffectSchema,
  }).passthrough()).min(1).max(80),
}).passthrough();

export type ExecutionBriefContext = {
  sessionId?: string;
  governedSectorContextInputs?: GovernedSectorContextInputs;
  requestId?: string;
  expectedInputFingerprint?: string;
  locale: "pt-BR" | "en-US";
  message: string;
  accessBasis: string;
  documents: Array<{id: string; name: string}>;
  sourcePackId?: string | null;
  activePlan?: unknown;
  previousVisibleBrief?: unknown;
};

export type PreparedExecutionBrief = {
  expectedInputFingerprint?: string;
  internal: CompiledExecutionBrief;
  visible: VisibleExecutionBrief;
  changeSummary: ExecutionBriefChange[];
};

/**
 * Builds the agreement shown to the person from the plan that will actually execute. It never
 * routes the request and never adds work: the standard path reads the immutable active-plan
 * snapshot; the validation preview reads the exact turn plan that activation will persist.
 */
export function prepareExecutionBrief(
  context: ExecutionBriefContext,
  activation: WorkspaceJobActivation | PreviewActivation,
): PreparedExecutionBrief {
  const sources = briefSources(context, activation.job === "integration_preview");
  const internal = activation.job === "integration_preview"
    ? compilePreviewBrief(context, activation, sources)
    : compileStandardBrief(context, activation, sources);
  const visible = visibleExecutionBrief(internal);
  const previous = visibleExecutionBriefSchema.safeParse(context.previousVisibleBrief);
  return {
    internal,
    visible,
    ...(context.expectedInputFingerprint ? { expectedInputFingerprint: context.expectedInputFingerprint } : {}),
    changeSummary: previous.success ? diffVisibleExecutionBrief(previous.data, visible) : [],
  };
}

function compileStandardBrief(
  context: ExecutionBriefContext,
  activation: WorkspaceJobActivation,
  sources: readonly ExecutionBriefSource[],
): CompiledExecutionBrief {
  const plan = capitalPlanSchema.parse(context.activePlan) as unknown as CapitalProjectPlanSnapshot;
  if (plan.job.id !== activation.job) throw new Error("execution brief plan does not match activation");
  const copy = standardCopy(context.locale, activation);
  const planningContext = context.sessionId ? buildGovernedSectorPlanning({inputs: context.governedSectorContextInputs, sessionId: context.sessionId, companyLabel: activation.company.name, locale: context.locale, objective: copy.objective}) : undefined;
  return compileCapitalExecutionBrief({
    ...(planningContext ? {planningContext} : {}),
    plan,
    ...(context.requestId ? {revisionContext: context.requestId} : {}),
    locale: context.locale,
    objective: copy.objective,
    companyLabel: activation.company.name,
    audienceLabel: copy.audience,
    proposedDeliverable: copy.deliverable,
    sources,
    assumptions: copy.assumptions,
    authority: {
      evidenceRegime: context.documents.length > 0 ? "mixed" : "public",
      executionAuthority: "analysis_only",
      establishedBy: "system_policy",
    },
    // The persisted queue gate requires explicit consent to this exact proposed work.
    expensiveWork: true,
  });
}

function compilePreviewBrief(
  context: ExecutionBriefContext,
  activation: PreviewActivation,
  sources: readonly ExecutionBriefSource[],
): CompiledExecutionBrief {
  const tasks = activation.plan.taskSpecs.map((task) => ({
    ...task,
    effect: offroadTaskEffectSchema.parse(task.effect),
  }));
  const byStage = {
    evidence: tasks.filter((task) => ["C05", "D07"].includes(task.id)),
    analysis: tasks.filter((task) => ["C09", "C10", "C07", "S07", "C08"].includes(task.id)),
    alternatives: tasks.filter((task) => task.id === "S10"),
    material: tasks.filter((task) => ["A01", "A02"].includes(task.id)),
  };
  const locale = context.locale === "pt-BR" ? "pt" : "en";
  const requestedAudience = activation.brief.request.audience?.primary;
  const audience = requestedAudience?.trim().toLowerCase() === "vp"
    ? (locale === "pt" ? "vice-presidente" : "vice president")
    : requestedAudience ?? (locale === "pt" ? "responsável pela decisão" : "decision owner");
  const workstreams = [
    {
      key: "evidence",
      label: locale === "pt" ? "Conferir balanço, caixa e dívida da Camil" : "Verify Camil's balance sheet, cash and debt",
      purpose: locale === "pt" ? "Resolver instrumentos, períodos, definições e divergências antes de usar qualquer número." : "Resolve instruments, periods, definitions and conflicts before using any number.",
      taskIds: byStage.evidence.map((task) => task.id),
      sourceRoles: ["public_company", "house_method"] as const,
      analyses: locale === "pt" ? ["Dívida instrumento a instrumento", "Conciliação das demonstrações e notas"] : ["Debt instrument by instrument", "Reconciliation of statements and notes"],
      output: locale === "pt" ? "Base financeira conciliada com lacunas explícitas" : "Reconciled financial base with explicit gaps",
      inclusionReasons: ["closes_coverage", "resolves_conflict", "prevents_material_error"] as const,
    },
    {
      key: "analysis",
      label: locale === "pt" ? "Testar serviço da dívida, covenants e downside" : "Test debt service, covenants and downside",
      purpose: locale === "pt" ? "Projetar vencimentos, juros, indexação e custo de saída e declarar o que os dados ainda não permitem medir." : "Project maturities, interest, indexation and exit cost, and state what the evidence still cannot measure.",
      taskIds: byStage.analysis.map((task) => task.id),
      sourceRoles: ["public_company", "public_market", "house_method"] as const,
      analyses: locale === "pt" ? ["Covenants pelas definições das escrituras", "Vencimentos, juros e correção por série", "Cenários e cobertura"] : ["Covenants under indenture definitions", "Maturities, interest and indexation by series", "Scenarios and coverage"],
      output: locale === "pt" ? "Diagnóstico prospectivo, cenários e pontos não computáveis" : "Prospective diagnostic, scenarios and non-computable items",
      inclusionReasons: ["tests_hypothesis", "closes_coverage", "prevents_material_error"] as const,
    },
    {
      key: "alternatives",
      label: locale === "pt" ? "Comparar os caminhos de refinanciamento" : "Compare refinancing paths",
      purpose: locale === "pt" ? "Colocar alternativas na mesma base e separar benefício, custo, complexidade e condição de viabilidade." : "Put alternatives on a common basis and separate benefit, cost, complexity and feasibility conditions.",
      taskIds: byStage.alternatives.map((task) => task.id),
      sourceRoles: ["public_company", "public_market", "house_method"] as const,
      analyses: locale === "pt" ? ["Antes e depois por alternativa", "Custo total e flexibilidade", "Riscos e condições de execução"] : ["Before and after by alternative", "All-in cost and flexibility", "Execution risks and conditions"],
      output: locale === "pt" ? "Alternativas comparáveis e recomendação condicionada" : "Comparable alternatives and conditional recommendation",
      inclusionReasons: ["user_requested", "tests_hypothesis", "produces_deliverable"] as const,
    },
    {
      key: "material",
      label: locale === "pt" ? `Planejar a devolutiva para ${audience}` : `Plan the readout for ${audience}`,
      purpose: locale === "pt" ? "Transformar apenas objetos assinados em uma narrativa coerente com a audiência e o formato solicitado." : "Turn signed objects only into a narrative suited to the intended audience and requested format.",
      taskIds: byStage.material.map((task) => task.id),
      sourceRoles: ["project_context", "public_company", "house_method"] as const,
      analyses: locale === "pt" ? ["Síntese dos achados e ressalvas", "Perguntas que mudam o trabalho", "Consistência entre análise e material"] : ["Synthesis of findings and caveats", "Questions that change the work", "Consistency between analysis and materials"],
      output: locale === "pt" ? "Plano da devolutiva e material versionado" : "Readout plan and versioned material",
      inclusionReasons: ["produces_deliverable", "prevents_material_error"] as const,
    },
  ];
  const instruction = activation.brief.request.sponsorInstruction?.trim() || context.message.trim();
  // These are the canonical briefRequestSchema forms, not promises of an Office format.
  const formLabels = {
    first_deliverable: {pt: "primeira devolutiva", en: "initial readout"},
    internal_briefing: {pt: "briefing interno", en: "internal briefing"},
    pitch_pages: {pt: "páginas de apresentação", en: "pitch pages"},
    analysis_with_scenarios: {pt: "análise com cenários", en: "analysis with scenarios"},
    board_deck: {pt: "apresentação ao conselho", en: "board presentation"},
  } satisfies Record<NonNullable<PreviewActivation["brief"]["request"]["form"]>, {pt: string; en: string}>;
  const form = activation.brief.request.form === null
    ? (locale === "pt" ? "devolutiva com formato a definir" : "readout with format to be agreed")
    : formLabels[activation.brief.request.form][locale];
  return compileExecutionBrief({
    planVersion: `${activation.plan.schemaVersion}:${activation.plan.compilerVersion}:${activation.plan.registryVersion}${context.requestId ? `:${context.requestId}` : ""}`,
    locale: context.locale,
    objective: instruction,
    proposedDeliverable: `${form.charAt(0).toLocaleUpperCase(context.locale)}${form.slice(1)} ${locale === "pt" ? "para" : "for"} ${audience}`,
    tasks,
    workstreams,
    sources,
    assumptions: previewAssumptions(context.locale, activation),
    checkpoints: [{
      label: locale === "pt" ? "Revisar achados, lacunas e quais caminhos avançar" : "Review findings, gaps and paths to advance",
      afterWorkstreamKey: "material",
      kind: "choice",
    }],
    authority: {evidenceRegime: "public", executionAuthority: "analysis_only", establishedBy: "system_policy"},
    expensiveWork: true,
  });
}

function briefSources(context: ExecutionBriefContext, frozenPublicCorpus: boolean): ExecutionBriefSource[] {
  const pt = context.locale === "pt-BR";
  return [
    {key: "project", label: pt ? "Pedido e contexto deste projeto" : "Request and context in this project", role: "project_context", status: "available", informationClass: "private", authorized: true},
    {key: "documents", label: pt ? "Documentos enviados ao projeto" : "Documents uploaded to the project", role: "provided_documents", status: context.documents.length ? "available" : "to_request", informationClass: "private", authorized: true},
    {key: "company-public", label: pt ? "RI, reguladores e divulgações públicas" : "IR, regulatory and public disclosures", role: "public_company", status: frozenPublicCorpus || Boolean(context.sourcePackId) ? "available" : "to_research", informationClass: "public", authorized: true},
    {key: "market-public", label: pt ? "Dados setoriais, curvas e transações comparáveis" : "Sector data, curves and comparable transactions", role: "public_market", status: "to_research", informationClass: "public", authorized: true},
    {key: "method", label: pt ? "Biblioteca interna de métodos de análise" : "Internal analysis-method library", role: "house_method", status: "available", informationClass: "restricted", authorized: true},
    {key: "network", label: pt ? "Mandatos de financiadores aplicáveis ao caso" : "Lender mandates applicable to the case", role: "capital_network", status: "to_request", informationClass: "restricted", authorized: true},
  ];
}

function standardCopy(locale: "pt-BR" | "en-US", activation: WorkspaceJobActivation) {
  const pt = locale === "pt-BR";
  if (activation.job === "origination_thesis") return {
    objective: activation.brief.meetingContext,
    audience: activation.brief.audience ?? (pt ? "responsável pela reunião" : "meeting owner"),
    deliverable: pt ? "Leitura prospectiva, alternativas priorizadas e briefing para a reunião" : "Prospective view, prioritized alternatives and meeting briefing",
    assumptions: activation.brief.meetingDate ? [{label: pt ? "Data da reunião" : "Meeting date", value: activation.brief.meetingDate, basis: pt ? "Informada no pedido" : "Stated in the request", editable: true as const}] : [],
  };
  if (activation.job === "capital_planning") return {
    objective: activation.brief.capitalIntent,
    audience: activation.brief.decisionContext ?? (pt ? "responsável pela decisão" : "decision owner"),
    deliverable: pt ? "Diagnóstico de capacidade e mapa comparável de alternativas de capital" : "Capacity diagnostic and comparable capital-alternatives map",
    assumptions: [],
  };
  return {
    objective: activation.brief.focus ?? activation.brief.knownContext ?? (pt ? `Construir uma leitura prospectiva de crédito de ${activation.company.name}` : `Build a prospective credit view of ${activation.company.name}`),
    audience: pt ? "responsável pela análise" : "analysis owner",
    deliverable: pt ? "Diagnóstico prospectivo de crédito, riscos e capacidade" : "Prospective credit, risk and capacity diagnostic",
    assumptions: [],
  };
}

function previewAssumptions(locale: "pt-BR" | "en-US", activation: PreviewActivation) {
  const pt = locale === "pt-BR";
  const premises = activation.brief.premises;
  return [
    premises.newDebtAnnualRate ? {label: pt ? "Taxa anual da nova dívida" : "New debt annual rate", value: premises.newDebtAnnualRate, basis: pt ? "Informada pelo usuário neste projeto" : "Stated by the user in this project", editable: true as const} : null,
    premises.newDebtTermMonths !== undefined ? {label: pt ? "Prazo da nova dívida" : "New debt term", value: `${premises.newDebtTermMonths} ${pt ? "meses" : "months"}`, basis: pt ? "Informado pelo usuário neste projeto" : "Stated by the user in this project", editable: true as const} : null,
    premises.newDebtGraceMonths !== undefined ? {label: pt ? "Carência da nova dívida" : "New debt grace", value: `${premises.newDebtGraceMonths} ${pt ? "meses" : "months"}`, basis: pt ? "Informada pelo usuário neste projeto" : "Stated by the user in this project", editable: true as const} : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
}
