import {createHash} from "node:crypto";

import {z} from "zod";

import type {CapitalProjectJob, CapitalProjectPlanSnapshot} from "./capital-jobs";
import type {OffroadTaskEffect, OffroadTaskSpec} from "./task-registry";

export const executionBriefLocaleSchema = z.enum(["pt-BR", "en-US"]);
export const executionBriefExecutionModeSchema = z.enum([
  "start_after_display",
  "confirm_before_expensive_work",
  "approve_external_effect",
]);
export const executionBriefSourceStatusSchema = z.enum(["available", "to_research", "to_request"]);
export const executionBriefSourceRoleSchema = z.enum([
  "project_context",
  "provided_documents",
  "public_company",
  "public_market",
  "house_method",
  "capital_network",
]);
export const executionBriefInformationClassSchema = z.enum(["public", "private", "restricted"]);
export const executionBriefInclusionReasonSchema = z.enum([
  "user_requested",
  "closes_coverage",
  "tests_hypothesis",
  "resolves_conflict",
  "produces_deliverable",
  "prevents_material_error",
]);

export type ExecutionBriefLocale = z.infer<typeof executionBriefLocaleSchema>;
export type ExecutionBriefExecutionMode = z.infer<typeof executionBriefExecutionModeSchema>;
export type ExecutionBriefSourceStatus = z.infer<typeof executionBriefSourceStatusSchema>;
export type ExecutionBriefSourceRole = z.infer<typeof executionBriefSourceRoleSchema>;
export type ExecutionBriefInformationClass = z.infer<typeof executionBriefInformationClassSchema>;
export type ExecutionBriefInclusionReason = z.infer<typeof executionBriefInclusionReasonSchema>;

export type ExecutionBriefSource = {
  key: string;
  label: string;
  role: ExecutionBriefSourceRole;
  status: ExecutionBriefSourceStatus;
  informationClass: ExecutionBriefInformationClass;
  authorized: boolean;
};

export type ExecutionBriefAuthority = {
  evidenceRegime: "public" | "private" | "mixed";
  executionAuthority: "analysis_only" | "internal_write" | "external_effect";
  establishedBy: "system_policy" | "user";
};

export type ExecutionBriefAssumption = {
  label: string;
  value: string;
  basis: string;
  editable: true;
};

export type ExecutionBriefCheckpoint = {
  label: string;
  afterWorkstreamKey: string;
  kind: "review" | "choice" | "approval";
};

export type ExecutionBriefWorkstreamDraft = {
  key: string;
  label: string;
  purpose: string;
  taskIds: readonly string[];
  sourceRoles: readonly ExecutionBriefSourceRole[];
  analyses: readonly string[];
  output: string;
  inclusionReasons: readonly ExecutionBriefInclusionReason[];
};

const planningLabel = z.string().trim().min(1).max(500);
export const executionBriefPlanningContextSchema = z.object({
  schemaVersion: z.literal("sector-planning-context.v1"),
  contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  planFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  mode: z.literal("planning_only"),
  objects: z.array(z.object({
    id: planningLabel, label: planningLabel,
    attributes: z.array(z.object({
      dimension: planningLabel, label: planningLabel, value: z.string().trim().max(500).nullable(),
      status: z.enum(["confirmed", "proposed", "inferred", "conflicting", "unknown"]),
      sources: z.array(z.object({label: planningLabel, version: planningLabel, anchor: z.string().trim().min(1).max(2_000), basis: z.enum(["reviewed_document", "user_review", "unverified"])}).strict()).max(20),
    }).strict()).max(100),
    requirements: z.array(z.object({id: planningLabel, label: planningLabel, evidenceNeeded: z.array(planningLabel).max(30), status: z.literal("not_examined"), methodStatus: z.literal("specified")}).strict()).max(100),
    gaps: z.array(z.object({id: planningLabel, label: planningLabel}).strict()).max(100),
  }).strict()).max(50),
}).strict().superRefine((value, context) => {
  let attributes = 0; let requirements = 0; let references = 0; let characters = 0; let gaps = 0;
  const ids = new Set<string>();
  value.objects.forEach((object, index) => {
    if (ids.has(object.id)) context.addIssue({code: "custom", path: ["objects", index, "id"], message: "Duplicate planning object."});
    ids.add(object.id); attributes += object.attributes.length; requirements += object.requirements.length; gaps += object.gaps.length;
    for (const attribute of object.attributes) for (const source of attribute.sources) {references++; characters += source.anchor.length;}
  });
  if (attributes > 500 || requirements > 100 || gaps > 100 || references > 2_000 || characters > 200_000) context.addIssue({code: "custom", path: ["objects"], message: "Planning context exceeds aggregate limits."});
});
export type ExecutionBriefPlanningContext = z.infer<typeof executionBriefPlanningContextSchema>;

export type ExecutionBriefCompilerInput = {
  planningContext?: ExecutionBriefPlanningContext | undefined;
  planVersion: string;
  locale: ExecutionBriefLocale;
  objective: string;
  proposedDeliverable: string;
  tasks: readonly Pick<OffroadTaskSpec, "id" | "dependencies" | "effect">[];
  workstreams: readonly ExecutionBriefWorkstreamDraft[];
  sources: readonly ExecutionBriefSource[];
  assumptions: readonly ExecutionBriefAssumption[];
  checkpoints: readonly ExecutionBriefCheckpoint[];
  authority: ExecutionBriefAuthority;
  expensiveWork: boolean;
};

export type CompiledExecutionBriefWorkstream = Omit<ExecutionBriefWorkstreamDraft, "taskIds" | "sourceRoles"> & {
  sourceTaskIds: readonly string[];
  dependencies: readonly string[];
  sources: readonly ExecutionBriefSource[];
};

export type CompiledExecutionBrief = {
  objectiveSummary?: string | undefined;
  planningContext?: ExecutionBriefPlanningContext | undefined;
  schemaVersion: "execution-brief.v1";
  planVersion: string;
  fingerprint: string;
  locale: ExecutionBriefLocale;
  objective: string;
  currentContext: readonly Pick<ExecutionBriefSource, "label" | "role" | "informationClass">[];
  proposedDeliverable: string;
  workstreams: readonly CompiledExecutionBriefWorkstream[];
  assumptions: readonly ExecutionBriefAssumption[];
  checkpoints: readonly ExecutionBriefCheckpoint[];
  executionMode: ExecutionBriefExecutionMode;
  authority: ExecutionBriefAuthority;
};

export type VisibleExecutionBrief = Omit<CompiledExecutionBrief, "planVersion" | "workstreams" | "authority"> & {
  workstreams: readonly {
    label: string;
    purpose: string;
    sources: readonly Pick<ExecutionBriefSource, "label" | "status" | "informationClass">[];
    analyses: readonly string[];
    output: string;
    dependencies: readonly string[];
  }[];
};

export const executionBriefWorkstreamProgressStatusSchema = z.enum([
  "waiting",
  "queued",
  "running",
  "waiting_user",
  "completed",
  "needs_attention",
]);
export type ExecutionBriefWorkstreamProgressStatus = z.infer<typeof executionBriefWorkstreamProgressStatusSchema>;

export const executionBriefProgressSchema = z.object({
  briefId: z.uuid(),
  version: z.number().int().positive(),
  workstreams: z.array(z.object({
    position: z.number().int().nonnegative(),
    label: z.string().trim().min(1).max(500),
    status: executionBriefWorkstreamProgressStatusSchema,
    completed: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }).strict()).min(1).max(7),
}).strict();
export type ExecutionBriefProgress = z.infer<typeof executionBriefProgressSchema>;

export const executionBriefNarrativeEventKindSchema = z.enum([
  "started",
  "completed",
  "waiting_user",
  "needs_attention",
]);
export type ExecutionBriefNarrativeEventKind = z.infer<typeof executionBriefNarrativeEventKindSchema>;

/**
 * Customer-safe execution history derived from the immutable task runs bound to a brief.
 * It deliberately carries the visible workstream language instead of TaskSpec IDs, executor
 * names, provider traces or failure payloads. `carriedForward` distinguishes work inherited by a
 * revised brief from work that actually happened after that version was presented.
 */
export const executionBriefNarrativeSchema = z.object({
  briefId: z.uuid(),
  version: z.number().int().positive(),
  events: z.array(z.object({
    eventKey: z.string().regex(/^[0-9a-f]{64}$/),
    position: z.number().int().nonnegative(),
    label: z.string().trim().min(1).max(500),
    purpose: z.string().trim().min(1).max(1_000),
    output: z.string().trim().min(1).max(1_000),
    kind: executionBriefNarrativeEventKindSchema,
    occurredAt: z.iso.datetime({offset: true}),
    carriedForward: z.boolean(),
  }).strict()).max(14),
}).strict();
export type ExecutionBriefNarrative = z.infer<typeof executionBriefNarrativeSchema>;

export const executionBriefChangeKindSchema = z.enum([
  "objective_changed",
  "deliverable_changed",
  "workstream_added",
  "workstream_removed",
  "assumption_added",
  "assumption_updated",
  "assumption_removed",
  "source_status_changed",
  "checkpoint_changed",
  "planning_context_changed",
]);
export const executionBriefChangeSchema = z.object({
  kind: executionBriefChangeKindSchema,
  label: z.string().trim().min(1).max(500),
  from: z.string().trim().min(1).max(1_000).optional(),
  to: z.string().trim().min(1).max(1_000).optional(),
}).strict();
export type ExecutionBriefChange = z.infer<typeof executionBriefChangeSchema>;

/** Runtime contract for the customer projection read back from durable storage. */
export const visibleExecutionBriefSchema: z.ZodType<VisibleExecutionBrief> = z.object({
  planningContext: executionBriefPlanningContextSchema.optional(),
  schemaVersion: z.literal("execution-brief.v1"),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  locale: executionBriefLocaleSchema,
  objective: z.string().trim().min(1).max(2_000),
  objectiveSummary: z.string().trim().min(1).max(281).optional(),
  currentContext: z.array(z.object({
    label: z.string().trim().min(1).max(500),
    role: executionBriefSourceRoleSchema,
    informationClass: executionBriefInformationClassSchema,
  }).strict()).max(20),
  proposedDeliverable: z.string().trim().min(1).max(2_000),
  workstreams: z.array(z.object({
    label: z.string().trim().min(1).max(500),
    purpose: z.string().trim().min(1).max(2_000),
    sources: z.array(z.object({
      label: z.string().trim().min(1).max(500),
      status: executionBriefSourceStatusSchema,
      informationClass: executionBriefInformationClassSchema,
    }).strict()).max(20),
    analyses: z.array(z.string().trim().min(1).max(1_000)).min(1).max(20),
    output: z.string().trim().min(1).max(1_000),
    dependencies: z.array(z.string().trim().min(1).max(500)).max(7),
  }).strict()).min(1).max(7),
  assumptions: z.array(z.object({
    label: z.string().trim().min(1).max(500),
    value: z.string().trim().min(1).max(1_000),
    basis: z.string().trim().min(1).max(1_000),
    editable: z.literal(true),
  }).strict()).max(30),
  checkpoints: z.array(z.object({
    label: z.string().trim().min(1).max(500),
    afterWorkstreamKey: z.string().trim().min(1).max(100),
    kind: z.enum(["review", "choice", "approval"]),
  }).strict()).max(10),
  executionMode: executionBriefExecutionModeSchema,
}).strict();

/**
 * Produces the small, customer-safe delta between two immutable visible briefs. The comparison
 * deliberately knows nothing about TaskSpecs, agents or executors; those remain in the internal
 * projection. A bounded list prevents a large replan from turning into an unreadable changelog.
 */
export function diffVisibleExecutionBrief(
  previous: VisibleExecutionBrief,
  current: VisibleExecutionBrief,
): ExecutionBriefChange[] {
  const changes: ExecutionBriefChange[] = [];
  if (fingerprint(previous.planningContext ?? null) !== fingerprint(current.planningContext ?? null)) changes.push({kind: "planning_context_changed", label: current.locale === "pt-BR" ? "Contexto econômico e requisitos" : "Economic context and requirements"});
  if (previous.objective !== current.objective) changes.push({
    kind: "objective_changed",
    label: current.locale === "pt-BR" ? "Objetivo do trabalho" : "Work objective",
    from: previous.objective,
    to: current.objective,
  });
  if (previous.proposedDeliverable !== current.proposedDeliverable) changes.push({
    kind: "deliverable_changed",
    label: current.locale === "pt-BR" ? "Produto esperado" : "Expected deliverable",
    from: previous.proposedDeliverable,
    to: current.proposedDeliverable,
  });

  const previousWorkstreams = new Set(previous.workstreams.map((workstream) => workstream.label));
  const currentWorkstreams = new Set(current.workstreams.map((workstream) => workstream.label));
  for (const label of currentWorkstreams) if (!previousWorkstreams.has(label)) {
    changes.push({kind: "workstream_added", label});
  }
  for (const label of previousWorkstreams) if (!currentWorkstreams.has(label)) {
    changes.push({kind: "workstream_removed", label});
  }

  const previousAssumptions = new Map(previous.assumptions.map((assumption) => [assumption.label, assumption]));
  const currentAssumptions = new Map(current.assumptions.map((assumption) => [assumption.label, assumption]));
  for (const [label, assumption] of currentAssumptions) {
    const prior = previousAssumptions.get(label);
    if (!prior) changes.push({kind: "assumption_added", label, to: assumption.value});
    else if (prior.value !== assumption.value || prior.basis !== assumption.basis) changes.push({
      kind: "assumption_updated", label, from: prior.value, to: assumption.value,
    });
  }
  for (const [label, assumption] of previousAssumptions) if (!currentAssumptions.has(label)) {
    changes.push({kind: "assumption_removed", label, from: assumption.value});
  }

  const priorSourceStatus = flattenVisibleSourceStatus(previous);
  for (const [key, source] of flattenVisibleSourceStatus(current)) {
    const prior = priorSourceStatus.get(key);
    if (prior && prior.status !== source.status) changes.push({
      kind: "source_status_changed",
      label: source.label,
      from: prior.status,
      to: source.status,
    });
  }

  const previousCheckpoints = previous.checkpoints.map((checkpoint) => `${checkpoint.label}|${checkpoint.kind}`).join("\n");
  const currentCheckpoints = current.checkpoints.map((checkpoint) => `${checkpoint.label}|${checkpoint.kind}`).join("\n");
  if (previousCheckpoints !== currentCheckpoints) changes.push({
    kind: "checkpoint_changed",
    label: current.locale === "pt-BR" ? "Próximo ponto de decisão" : "Next decision point",
    ...(previous.checkpoints[0] ? {from: previous.checkpoints[0].label} : {}),
    ...(current.checkpoints[0] ? {to: current.checkpoints[0].label} : {}),
  });
  return changes.slice(0, 20).map((change) => executionBriefChangeSchema.parse(change));
}

function flattenVisibleSourceStatus(brief: VisibleExecutionBrief) {
  const sources = new Map<string, VisibleExecutionBrief["workstreams"][number]["sources"][number]>();
  for (const workstream of brief.workstreams) for (const source of workstream.sources) {
    sources.set(`${workstream.label}\u0000${source.label}`, source);
  }
  return sources;
}

export type ExecutionBriefEvaluation = {blockers: string[]; warnings: string[]};

const internalLanguage = /\b(agent(?:e)?|taskspec|token(?:s)?|provider|prompt|model id|workflow id|grafo interno|internal graph)\b/i;
const genericLabels = [
  /^organizar contexto$/i,
  /^analisar (?:a )?companhia$/i,
  /^pesquisar informa[cç][oõ]es$/i,
  /^reconstruir (?:a )?posi[cç][aã]o financeira$/i,
  /^ler documentos$/i,
  /^preparar material(?:is)?$/i,
  /^avaliar alternativas$/i,
  /^organize context$/i,
  /^analyze (?:the )?company$/i,
  /^research information$/i,
  /^prepare materials$/i,
];

/**
 * Compiles the visible agreement from the already selected task graph. The model may help draft
 * labels or analyses upstream, but it cannot add a task, hide a dependency or choose authority.
 */
export function compileExecutionBrief(input: ExecutionBriefCompilerInput): CompiledExecutionBrief {
  const evaluation = evaluateExecutionBriefInput(input);
  if (evaluation.blockers.length > 0) {
    throw new Error(`invalid execution brief: ${evaluation.blockers.join(", ")}`);
  }

  const taskToWorkstream = new Map<string, string>();
  for (const workstream of input.workstreams) {
    for (const taskId of workstream.taskIds) taskToWorkstream.set(taskId, workstream.key);
  }
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const workstreams: CompiledExecutionBriefWorkstream[] = input.workstreams.map((workstream) => {
    const dependencies = new Set<string>();
    for (const taskId of workstream.taskIds) {
      for (const dependency of taskById.get(taskId)?.dependencies ?? []) {
        const dependencyWorkstream = taskToWorkstream.get(dependency);
        if (dependencyWorkstream && dependencyWorkstream !== workstream.key) dependencies.add(dependencyWorkstream);
      }
    }
    return {
      key: workstream.key,
      label: workstream.label.trim(),
      purpose: workstream.purpose.trim(),
      sourceTaskIds: [...workstream.taskIds],
      sources: input.sources.filter((source) => workstream.sourceRoles.includes(source.role)),
      analyses: [...workstream.analyses],
      output: workstream.output.trim(),
      inclusionReasons: [...workstream.inclusionReasons],
      dependencies: [...dependencies],
    };
  });
  const executionMode = deriveExecutionMode(input.tasks, input.authority, input.expensiveWork);
  const unsigned = {
    schemaVersion: "execution-brief.v1" as const,
    planVersion: input.planVersion,
    locale: input.locale,
    objective: input.objective.trim(),
    ...objectiveDisplayProjection(input.objective),
    currentContext: input.sources
      .filter((source) => source.status === "available" && source.authorized)
      .map(({label, role, informationClass}) => ({label, role, informationClass})),
    proposedDeliverable: input.proposedDeliverable.trim(),
    workstreams,
    assumptions: input.assumptions.map((assumption) => ({...assumption})),
    checkpoints: input.checkpoints.map((checkpoint) => ({...checkpoint})),
    executionMode,
    authority: {...input.authority},
    ...(input.planningContext ? {planningContext: executionBriefPlanningContextSchema.parse(input.planningContext)} : {}),
  };
  return {...unsigned, fingerprint: fingerprint(unsigned)};
}

export function visibleExecutionBrief(brief: CompiledExecutionBrief): VisibleExecutionBrief {
  return {
    schemaVersion: brief.schemaVersion,
    fingerprint: brief.fingerprint,
    locale: brief.locale,
    objective: brief.objective,
    ...(brief.objectiveSummary ? {objectiveSummary: brief.objectiveSummary} : {}),
    currentContext: brief.currentContext,
    proposedDeliverable: brief.proposedDeliverable,
    workstreams: brief.workstreams.map((workstream) => ({
      label: workstream.label,
      purpose: workstream.purpose,
      sources: workstream.sources.map(({label, status, informationClass}) => ({label, status, informationClass})),
      analyses: workstream.analyses,
      output: workstream.output,
      dependencies: workstream.dependencies
        .map((key) => brief.workstreams.find((candidate) => candidate.key === key)?.label)
        .filter((label): label is string => Boolean(label)),
    })),
    assumptions: brief.assumptions,
    checkpoints: brief.checkpoints,
    executionMode: brief.executionMode,
    ...(brief.planningContext ? {planningContext: executionBriefPlanningContextSchema.parse(brief.planningContext)} : {}),
  };
}

export function evaluateExecutionBriefInput(input: ExecutionBriefCompilerInput): ExecutionBriefEvaluation {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const taskIds = new Set(input.tasks.map((task) => task.id));
  if (taskIds.size !== input.tasks.length) blockers.push("duplicate_task_id");
  if (input.workstreams.length < 1 || input.workstreams.length > 7) blockers.push("workstream_count_outside_1_to_7");
  if (!input.objective.trim()) blockers.push("missing_objective");
  if (!input.proposedDeliverable.trim()) blockers.push("missing_deliverable");
  if (input.authority.establishedBy !== "system_policy" && input.authority.establishedBy !== "user") {
    blockers.push("authority_not_governed");
  }

  const sourceKeys = new Set<string>();
  for (const source of input.sources) {
    if (sourceKeys.has(source.key)) blockers.push(`duplicate_source:${source.key}`);
    sourceKeys.add(source.key);
    if (source.status === "available" && !source.authorized) blockers.push(`available_source_not_authorized:${source.key}`);
  }

  const workstreamKeys = new Set<string>();
  const mappedTaskIds = new Set<string>();
  for (const workstream of input.workstreams) {
    if (workstreamKeys.has(workstream.key)) blockers.push(`duplicate_workstream:${workstream.key}`);
    workstreamKeys.add(workstream.key);
    if (genericLabels.some((pattern) => pattern.test(workstream.label.trim()))) blockers.push(`generic_workstream_label:${workstream.key}`);
    if (internalLanguage.test(`${workstream.label} ${workstream.purpose} ${workstream.analyses.join(" ")} ${workstream.output}`)) {
      blockers.push(`internal_language_exposed:${workstream.key}`);
    }
    if (workstream.taskIds.length === 0) blockers.push(`orphan_workstream:${workstream.key}`);
    if (workstream.inclusionReasons.length === 0) blockers.push(`missing_inclusion_reason:${workstream.key}`);
    if (workstream.sourceRoles.length === 0) blockers.push(`missing_source_plan:${workstream.key}`);
    if (workstream.analyses.length === 0) blockers.push(`missing_analysis_plan:${workstream.key}`);
    if (!workstream.output.trim()) blockers.push(`missing_output:${workstream.key}`);
    if (!workstream.sourceRoles.some((role) => input.sources.some((source) => source.role === role))) {
      blockers.push(`unresolved_source_role:${workstream.key}`);
    }
    for (const taskId of workstream.taskIds) {
      if (!taskIds.has(taskId)) blockers.push(`task_outside_graph:${taskId}`);
      if (mappedTaskIds.has(taskId)) blockers.push(`task_mapped_twice:${taskId}`);
      mappedTaskIds.add(taskId);
    }
  }
  for (const taskId of taskIds) {
    if (!mappedTaskIds.has(taskId)) blockers.push(`task_hidden_from_brief:${taskId}`);
  }
  for (const checkpoint of input.checkpoints) {
    if (!workstreamKeys.has(checkpoint.afterWorkstreamKey)) blockers.push(`checkpoint_without_workstream:${checkpoint.afterWorkstreamKey}`);
  }
  if (input.assumptions.some((assumption) => assumption.editable !== true || !assumption.basis.trim())) {
    blockers.push("ungoverned_assumption");
  }
  if (input.tasks.some((task) => task.effect === "external") && input.authority.executionAuthority !== "external_effect") {
    blockers.push("external_effect_without_authority");
  }
  if (input.sources.some((source) => source.status !== "available")) warnings.push("planned_sources_not_yet_available");
  if (input.assumptions.length === 0) warnings.push("no_explicit_assumptions");
  return {blockers: [...new Set(blockers)], warnings: [...new Set(warnings)]};
}

function deriveExecutionMode(
  tasks: readonly {effect: OffroadTaskEffect}[],
  authority: ExecutionBriefAuthority,
  expensiveWork: boolean,
): ExecutionBriefExecutionMode {
  if (tasks.some((task) => task.effect === "external") || authority.executionAuthority === "external_effect") {
    return "approve_external_effect";
  }
  return expensiveWork ? "confirm_before_expensive_work" : "start_after_display";
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

type CapitalBriefRecipeGroup = Omit<ExecutionBriefWorkstreamDraft, "taskIds" | "label" | "purpose" | "analyses" | "output"> & {
  prefixes: readonly string[];
  label: {pt: string; en: string};
  purpose: {pt: string; en: string};
  analyses: {pt: readonly string[]; en: readonly string[]};
  output: {pt: string; en: string};
};

const group = (
  key: string,
  prefixes: readonly string[],
  label: {pt: string; en: string},
  purpose: {pt: string; en: string},
  sourceRoles: readonly ExecutionBriefSourceRole[],
  analyses: {pt: readonly string[]; en: readonly string[]},
  output: {pt: string; en: string},
  inclusionReasons: readonly ExecutionBriefInclusionReason[],
): CapitalBriefRecipeGroup => ({key, prefixes, label, purpose, sourceRoles, analyses, output, inclusionReasons});

const sharedGroups: Record<"scope" | "evidence" | "credit" | "structure" | "market" | "materials", CapitalBriefRecipeGroup> = {
  scope: group("scope", ["M"],
    {pt: "Fixar o mandato e o resultado esperado para {company}", en: "Set the mandate and expected result for {company}"},
    {pt: "Confirmar objetivo, audiência, data-base, jurisdição, restrições e o que precisa estar pronto ao final.", en: "Confirm the objective, audience, reference date, jurisdiction, constraints and final outcome."},
    ["project_context", "provided_documents"],
    {pt: ["Separar fatos conhecidos de hipóteses", "Definir perguntas que realmente alteram o trabalho"], en: ["Separate known facts from hypotheses", "Identify questions that materially change the work"]},
    {pt: "Perímetro corrigível do trabalho", en: "Corrigible scope of work"},
    ["user_requested", "prevents_material_error"]),
  evidence: group("evidence", ["D"],
    {pt: "Conferir a base financeira e documental de {company}", en: "Verify the financial and documentary basis for {company}"},
    {pt: "Ler o conjunto aplicável, resolver versões, períodos e unidades, conciliar divergências e tornar lacunas visíveis.", en: "Read the applicable set, resolve versions, periods and units, reconcile conflicts and expose gaps."},
    ["provided_documents", "public_company"],
    {pt: ["Inventário e cobertura dos documentos", "Conciliação de números e fontes", "Lacunas priorizadas por impacto"], en: ["Document inventory and coverage", "Reconciliation of numbers and sources", "Gaps prioritized by impact"]},
    {pt: "Base conciliada e mapa de cobertura", en: "Reconciled evidence base and coverage map"},
    ["closes_coverage", "resolves_conflict", "prevents_material_error"]),
  credit: group("credit", ["C"],
    {pt: "Construir a leitura prospectiva de crédito de {company}", en: "Build the prospective credit view of {company}"},
    {pt: "Entender negócio e setor, normalizar resultados e projeções, mapear dívida e capital de giro e testar capacidade e downside.", en: "Understand business and sector, normalize results and forecasts, map debt and working capital, and test capacity and downside."},
    ["provided_documents", "public_company", "public_market", "house_method"],
    {pt: ["Drivers operacionais e qualidade do resultado", "Fluxo de caixa, dívida econômica e vencimentos", "Cenários, estresses e capacidade de pagamento"], en: ["Operating drivers and earnings quality", "Cash flow, economic debt and maturities", "Scenarios, stresses and debt capacity"]},
    {pt: "Diagnóstico de crédito com premissas e sensibilidades", en: "Credit diagnostic with assumptions and sensitivities"},
    ["tests_hypothesis", "closes_coverage", "prevents_material_error"]),
  structure: group("structure", ["S"],
    {pt: "Testar alternativas de capital aderentes ao caso", en: "Test capital alternatives suited to the case"},
    {pt: "Comparar necessidade econômica, instrumentos, custo total, garantias, covenants, fontes e usos e risco de execução.", en: "Compare economic need, instruments, all-in cost, collateral, covenants, sources and uses, and execution risk."},
    ["provided_documents", "public_market", "house_method"],
    {pt: ["Filtros jurídicos, econômicos e jurisdicionais", "Estruturas comparáveis em uma mesma base", "Trade-offs, complexidades e condições de viabilidade"], en: ["Legal, economic and jurisdictional filters", "Structures compared on a common basis", "Trade-offs, complexities and feasibility conditions"]},
    {pt: "Mapa comparável de alternativas e estrutura-alvo indicativa", en: "Comparable alternative map and indicative target structure"},
    ["user_requested", "tests_hypothesis", "produces_deliverable"]),
  market: group("market", ["K"],
    {pt: "Calibrar a tese com mercado e aderência de capital", en: "Calibrate the thesis with market evidence and capital fit"},
    {pt: "Pesquisar transações e termos comparáveis e, quando fizer parte do pedido, filtrar financiadores por mandato verificável.", en: "Research comparable transactions and terms and, when requested, screen lenders against verifiable mandates."},
    ["public_market", "capital_network"],
    {pt: ["Comparáveis com data-base e fonte", "Filtros duros antes de score", "Racional e lacunas de cobertura por nome"], en: ["Comparables with reference date and source", "Hard filters before scoring", "Name-level rationale and coverage gaps"]},
    {pt: "Contexto de mercado e, quando aplicável, shortlist explicável", en: "Market context and, when applicable, explainable shortlist"},
    ["tests_hypothesis", "produces_deliverable"]),
  materials: group("materials", ["A"],
    {pt: "Produzir e revisar os materiais para {audience}", en: "Produce and review the materials for {audience}"},
    {pt: "Transformar os objetos aprovados em narrativa, modelo e peças consistentes com o template, a audiência e o regime de divulgação.", en: "Turn approved objects into a narrative, model and materials consistent with the template, audience and disclosure regime."},
    ["provided_documents", "house_method"],
    {pt: ["Evidence pack e narrativa", "Consistência entre modelo, termos e mensagem", "Renderização e inspeção visual"], en: ["Evidence pack and narrative", "Consistency across model, terms and message", "Rendering and visual inspection"]},
    {pt: "Materiais versionados, rastreáveis e prontos para revisão", en: "Versioned, traceable materials ready for review"},
    ["produces_deliverable", "prevents_material_error"]),
};

const jobGroupOrder: Record<CapitalProjectJob, readonly (keyof typeof sharedGroups)[]> = {
  company_debt_view: ["scope", "evidence", "credit"],
  origination_thesis: ["scope", "evidence", "credit", "structure", "market"],
  capital_planning: ["scope", "evidence", "credit", "structure"],
  structure_from_documents: ["scope", "evidence", "credit", "structure"],
  review_existing_operation: ["scope", "evidence", "credit", "structure"],
  prepare_materials_and_process: ["scope", "evidence", "credit", "structure", "market", "materials"],
};

type GroupCopyOverride = Partial<Pick<CapitalBriefRecipeGroup, "label" | "purpose" | "analyses" | "output">>;

const jobCopyOverrides: Partial<Record<CapitalProjectJob, Partial<Record<keyof typeof sharedGroups, GroupCopyOverride>>>> = {
  company_debt_view: {
    scope: {
      label: {pt: "Delimitar a leitura de crédito de {company}", en: "Set the scope of the credit view of {company}"},
      purpose: {pt: "Confirmar período, perímetro societário, moeda e as decisões que a análise precisa apoiar.", en: "Confirm period, corporate perimeter, currency and the decisions the analysis must support."},
    },
    evidence: {
      label: {pt: "Fechar a base histórica de balanço, caixa e dívida", en: "Close the historical balance sheet, cash and debt basis"},
    },
    credit: {
      label: {pt: "Projetar geração de caixa e capacidade de pagamento de {company}", en: "Forecast cash generation and debt capacity for {company}"},
      output: {pt: "Diagnóstico prospectivo de crédito, riscos e capacidade", en: "Prospective credit, risk and capacity diagnostic"},
    },
  },
  origination_thesis: {
    scope: {
      label: {pt: "Definir o que a conversa com {company} precisa provocar", en: "Define what the conversation with {company} should achieve"},
      purpose: {pt: "Traduzir o contexto recebido em objetivo, audiência, nível de profundidade e resultado concreto da reunião.", en: "Translate the context received into an objective, audience, depth and concrete meeting outcome."},
      output: {pt: "Mandato da reunião e perguntas de alinhamento material", en: "Meeting mandate and material alignment questions"},
    },
    evidence: {
      label: {pt: "Conferir o que sustenta a conversa sobre {company}", en: "Verify the evidence supporting the conversation about {company}"},
    },
    credit: {
      label: {pt: "Construir uma visão própria e prospectiva de {company}", en: "Build an independent, prospective view of {company}"},
    },
    structure: {
      label: {pt: "Selecionar ideias que merecem entrar na conversa", en: "Select ideas that deserve a place in the conversation"},
      output: {pt: "Alternativas priorizadas com racional, benefício, trade-offs e condições", en: "Prioritized alternatives with rationale, benefit, trade-offs and conditions"},
    },
    market: {
      label: {pt: "Testar a tese contra setor e mercado de crédito", en: "Test the thesis against sector and credit-market evidence"},
      output: {pt: "Evidências de mercado e pontos de provocação para a reunião", en: "Market evidence and discussion points for the meeting"},
    },
  },
  capital_planning: {
    scope: {
      label: {pt: "Fixar a necessidade econômica, o montante e o horizonte", en: "Set the economic need, amount and horizon"},
      purpose: {pt: "Separar o uso econômico do instrumento imaginado e tornar explícitos prazo, moeda, flexibilidade e restrições.", en: "Separate the economic use from the assumed instrument and make tenor, currency, flexibility and constraints explicit."},
    },
    evidence: {
      label: {pt: "Validar os dados que dimensionam a necessidade de capital", en: "Validate the data that sizes the capital need"},
    },
    credit: {
      label: {pt: "Dimensionar capacidade, folga e downside de {company}", en: "Size capacity, headroom and downside for {company}"},
    },
    structure: {
      label: {pt: "Comparar formas de financiar a necessidade econômica", en: "Compare ways to fund the economic need"},
      output: {pt: "Alternativas comparáveis, recomendação condicionada e próximos testes", en: "Comparable alternatives, conditional recommendation and next tests"},
    },
  },
  structure_from_documents: {
    scope: {
      label: {pt: "Identificar o mandato econômico contido na pasta de {company}", en: "Identify the economic mandate contained in {company}'s folder"},
      purpose: {pt: "Entender o que está sendo pedido, o que os documentos permitem concluir e quais decisões ainda dependem do usuário.", en: "Understand the request, what the documents support and which decisions still depend on the user."},
    },
    evidence: {
      label: {pt: "Transformar os arquivos em uma base reconciliada", en: "Turn the files into a reconciled evidence base"},
      output: {pt: "Inventário, fatos conciliados, conflitos e pedido de informação priorizado", en: "Inventory, reconciled facts, conflicts and prioritized information request"},
    },
    credit: {
      label: {pt: "Testar se o caso se sustenta econômica e financeiramente", en: "Test whether the case holds economically and financially"},
    },
    structure: {
      label: {pt: "Desenhar estruturas compatíveis com as evidências disponíveis", en: "Design structures supported by the available evidence"},
    },
  },
  review_existing_operation: {
    scope: {
      label: {pt: "Delimitar a operação e as questões que precisam ser testadas", en: "Set the transaction scope and questions to be tested"},
      purpose: {pt: "Confirmar documentos vigentes, versão da proposta, data-base, jurisdição e critérios da revisão.", en: "Confirm effective documents, proposal version, reference date, jurisdiction and review criteria."},
    },
    evidence: {
      label: {pt: "Resolver documentos vigentes, emendas e referências cruzadas", en: "Resolve effective documents, amendments and cross-references"},
      purpose: {pt: "Ler o conjunto integral aplicável, conectar definições e cláusulas e conciliar os inputs econômicos da operação.", en: "Read the complete applicable set, connect definitions and clauses, and reconcile the transaction's economic inputs."},
      analyses: {pt: ["Documento vigente e cadeia de alterações", "Definições, cláusulas e referências cruzadas", "Inputs econômicos e divergências"], en: ["Effective document and amendment chain", "Definitions, clauses and cross-references", "Economic inputs and conflicts"]},
      output: {pt: "Mapa de documentos, cláusulas e inputs conciliados", en: "Reconciled document, clause and input map"},
    },
    credit: {
      label: {pt: "Recalcular economics, cobertura, covenants e downside", en: "Recalculate economics, coverage, covenants and downside"},
      analyses: {pt: ["Juros, amortização, indexação e custo de saída", "Covenants, headroom e gatilhos", "Waterfall, cobertura e sensibilidades"], en: ["Interest, amortization, indexation and exit cost", "Covenants, headroom and triggers", "Waterfall, coverage and sensitivities"]},
    },
    structure: {
      label: {pt: "Comparar a proposta atual com ajustes possíveis", en: "Compare the current proposal with possible adjustments"},
      purpose: {pt: "Testar preço, prazo, garantias, proteções, fontes e usos e apontar o que melhora ou fragiliza a operação.", en: "Test pricing, tenor, collateral, protections, sources and uses, and identify what improves or weakens the transaction."},
      output: {pt: "Revisão citada, alternativas de ajuste e term sheet indicativo", en: "Cited review, adjustment alternatives and indicative term sheet"},
    },
  },
  prepare_materials_and_process: {
    scope: {
      label: {pt: "Fixar audiência, mensagem e perímetro de divulgação", en: "Set audience, message and disclosure perimeter"},
    },
    evidence: {
      label: {pt: "Congelar a base que poderá aparecer nos materiais", en: "Freeze the evidence that may appear in the materials"},
    },
    credit: {
      label: {pt: "Atualizar os números e conclusões que sustentam a narrativa", en: "Update the numbers and conclusions supporting the narrative"},
    },
    structure: {
      label: {pt: "Fechar os termos indicativos que serão apresentados", en: "Close the indicative terms to be presented"},
    },
    market: {
      label: {pt: "Definir o universo, filtros e ondas de abordagem", en: "Define the universe, filters and outreach waves"},
    },
    materials: {
      label: {pt: "Produzir no template e revisar antes de liberar", en: "Produce in the template and review before release"},
    },
  },
};

export function compileCapitalExecutionBrief(input: {
  planningContext?: ExecutionBriefPlanningContext | undefined;
  plan: CapitalProjectPlanSnapshot;
  /** Distinguishes an immutable held dispatch from a previous identical plan. */
  revisionContext?: string;
  locale: ExecutionBriefLocale;
  objective: string;
  companyLabel: string;
  audienceLabel: string;
  proposedDeliverable: string;
  sources: readonly ExecutionBriefSource[];
  assumptions?: readonly ExecutionBriefAssumption[];
  checkpoints?: readonly ExecutionBriefCheckpoint[];
  authority: ExecutionBriefAuthority;
  expensiveWork?: boolean;
}): CompiledExecutionBrief {
  const localeKey = input.locale === "pt-BR" ? "pt" : "en";
  const interpolate = (value: string) => value
    .replaceAll("{company}", input.companyLabel.trim() || (localeKey === "pt" ? "a companhia" : "the company"))
    .replaceAll("{audience}", input.audienceLabel.trim() || (localeKey === "pt" ? "a audiência definida" : "the intended audience"));
  // A persisted bounded plan may include material tasks beyond its entry-job defaults.
  // Surface every existing task; this does not add work or change the approved graph.
  const preferredGroups = jobGroupOrder[input.plan.job.id];
  const orderedGroups = [...preferredGroups, ...(Object.keys(sharedGroups) as Array<keyof typeof sharedGroups>)
    .filter((name) => !preferredGroups.includes(name) && input.plan.taskSpecs.some((task) => sharedGroups[name].prefixes.some((prefix) => task.id.startsWith(prefix))))];
  const workstreams = orderedGroups.map((name) => {
    const recipe = sharedGroups[name];
    const override = jobCopyOverrides[input.plan.job.id]?.[name];
    return {
      key: recipe.key,
      label: interpolate((override?.label ?? recipe.label)[localeKey]),
      purpose: (override?.purpose ?? recipe.purpose)[localeKey],
      taskIds: input.plan.taskSpecs.filter((task) => recipe.prefixes.some((prefix) => task.id.startsWith(prefix))).map((task) => task.id),
      sourceRoles: recipe.sourceRoles,
      analyses: (override?.analyses ?? recipe.analyses)[localeKey],
      output: (override?.output ?? recipe.output)[localeKey],
      inclusionReasons: recipe.inclusionReasons,
    } satisfies ExecutionBriefWorkstreamDraft;
  }).filter((workstream) => workstream.taskIds.length > 0);
  const checkpoints = input.checkpoints ?? [
    {
      label: localeKey === "pt" ? "Revisar achados, lacunas e próximos caminhos" : "Review findings, gaps and next paths",
      afterWorkstreamKey: workstreams.at(-1)?.key ?? "scope",
      kind: "choice" as const,
    },
  ];
  return compileExecutionBrief({
    planVersion: `${input.plan.schemaVersion}:${input.plan.compilerVersion}:${input.plan.registryVersion}${input.revisionContext ? `:${input.revisionContext}` : ""}`,
    locale: input.locale,
    objective: input.objective,
    proposedDeliverable: input.proposedDeliverable,
    tasks: input.plan.taskSpecs,
    workstreams,
    sources: input.sources,
    assumptions: input.assumptions ?? [],
    checkpoints,
    authority: input.authority,
    expensiveWork: input.expensiveWork ?? false,
    ...(input.planningContext ? {planningContext: input.planningContext} : {}),
  });
}

/** Display excerpt only. The complete objective remains the approved execution contract. */
function objectiveDisplayProjection(objective: string): {objectiveSummary?: string} {
  const complete = objective.trim();
  const first = complete.split(/\n\s*\n/, 1)[0]!.replace(/\s+/g, " ").trim();
  if (first === complete && first.length <= 280) return {};
  const prefix = first.length > 280 ? first.slice(0, 280).replace(/\s+\S*$/, "").trimEnd() : first;
  return {objectiveSummary: prefix + "…"};
}
