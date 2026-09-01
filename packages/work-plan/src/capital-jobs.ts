import {z} from "zod";

import {offroadTaskRegistry, type OffroadExecutionClass, type OffroadTaskSpec} from "./task-registry";

export const capitalProjectJobSchema = z.enum([
  "company_debt_view",
  "origination_thesis",
  "capital_planning",
  "structure_from_documents",
  "review_existing_operation",
  "prepare_materials_and_process",
]);
export type CapitalProjectJob = z.infer<typeof capitalProjectJobSchema>;

export const capitalJobInputRequirementSchema = z.enum([
  "required",
  "optional",
  "inferable",
  "existing_project",
  "not_applicable",
]);
export type CapitalJobInputRequirement = z.infer<typeof capitalJobInputRequirementSchema>;

export type CapitalJobInputPolicy = {
  company: CapitalJobInputRequirement;
  documents: CapitalJobInputRequirement;
  capitalIntent: CapitalJobInputRequirement;
  existingTransaction: CapitalJobInputRequirement;
  publicResearch: "required" | "allowed" | "not_applicable";
};

export type CapitalProjectJobDefinition = {
  id: CapitalProjectJob;
  title: {pt: string; en: string};
  description: {pt: string; en: string};
  targetTaskIds: readonly string[];
  firstWorkProduct: string;
  confirmationGate: "preliminary_understanding" | "diagnostic" | "structure" | "production_plan";
  inputPolicy: CapitalJobInputPolicy;
  accessPolicy: "public_or_private" | "private_required" | "existing_project";
  requiresExistingProject: boolean;
};

/**
 * Six starts, one project truth. Targets are intentionally outcomes, not hand-written task lists:
 * the compiler below closes every dependency from the canonical 80-TaskSpec registry and makes
 * future dependency changes propagate to every affected job.
 */
export const capitalProjectJobs: readonly CapitalProjectJobDefinition[] = [
  {
    id: "company_debt_view",
    title: {pt: "Entender a companhia na ótica de dívida", en: "Understand the company through a debt lens"},
    description: {
      pt: "Reconstruir situação financeira, riscos e capacidade antes de escolher uma operação.",
      en: "Reconstruct financial position, risks and capacity before choosing a transaction.",
    },
    targetTaskIds: ["C11"],
    firstWorkProduct: "company_debt_diagnostic",
    confirmationGate: "diagnostic",
    inputPolicy: {
      company: "required", documents: "optional", capitalIntent: "optional",
      existingTransaction: "not_applicable", publicResearch: "required",
    },
    accessPolicy: "public_or_private",
    requiresExistingProject: false,
  },
  {
    id: "origination_thesis",
    title: {pt: "Preparar uma reunião ou tese de originação", en: "Prepare a meeting or origination thesis"},
    description: {
      pt: "Chegar com leitura própria, perguntas e estruturas específicas para aquela companhia.",
      en: "Arrive with an independent view, questions and company-specific structures.",
    },
    targetTaskIds: ["M07", "C02", "K04"],
    firstWorkProduct: "meeting_brief",
    confirmationGate: "preliminary_understanding",
    inputPolicy: {
      company: "required", documents: "optional", capitalIntent: "optional",
      existingTransaction: "not_applicable", publicResearch: "required",
    },
    accessPolicy: "public_or_private",
    requiresExistingProject: false,
  },
  {
    id: "capital_planning",
    title: {pt: "Planejar uma necessidade de capital", en: "Plan a capital need"},
    description: {
      pt: "Comparar como financiar refinance, crescimento, aquisição, capex, giro ou outra necessidade.",
      en: "Compare how to finance refinancing, growth, acquisition, capex, working capital or another need.",
    },
    targetTaskIds: ["S11"],
    firstWorkProduct: "alternative_map",
    confirmationGate: "structure",
    inputPolicy: {
      company: "required", documents: "optional", capitalIntent: "required",
      existingTransaction: "not_applicable", publicResearch: "allowed",
    },
    accessPolicy: "public_or_private",
    requiresExistingProject: false,
  },
  {
    id: "structure_from_documents",
    title: {pt: "Estruturar a partir dos documentos", en: "Structure from documents"},
    description: {
      pt: "Receber uma pasta, descobrir o problema, desenhar alternativas e preparar uma recomendação.",
      en: "Receive a folder, identify the problem, design alternatives and prepare a recommendation.",
    },
    targetTaskIds: ["S11"],
    firstWorkProduct: "diagnostic_recommendation",
    confirmationGate: "structure",
    inputPolicy: {
      company: "inferable", documents: "required", capitalIntent: "inferable",
      existingTransaction: "optional", publicResearch: "required",
    },
    accessPolicy: "private_required",
    requiresExistingProject: false,
  },
  {
    id: "review_existing_operation",
    title: {pt: "Revisar uma operação existente", en: "Review an existing transaction"},
    description: {
      pt: "Reconstruir, testar e melhorar proposta, term sheet ou desenho inicial.",
      en: "Reconstruct, test and improve a proposal, term sheet or initial design.",
    },
    targetTaskIds: ["S10", "S12"],
    firstWorkProduct: "operation_review",
    confirmationGate: "structure",
    inputPolicy: {
      company: "inferable", documents: "required", capitalIntent: "optional",
      existingTransaction: "required", publicResearch: "allowed",
    },
    accessPolicy: "private_required",
    requiresExistingProject: false,
  },
  {
    id: "prepare_materials_and_process",
    title: {pt: "Preparar materiais e conduzir o processo", en: "Prepare materials and run the process"},
    description: {
      pt: "Compilar peças, mapear financiadores e continuar a execução.",
      en: "Compile materials, map lenders and continue execution.",
    },
    targetTaskIds: ["A11", "K09"],
    firstWorkProduct: "production_plan",
    confirmationGate: "production_plan",
    inputPolicy: {
      company: "existing_project", documents: "existing_project", capitalIntent: "existing_project",
      existingTransaction: "existing_project", publicResearch: "allowed",
    },
    accessPolicy: "existing_project",
    requiresExistingProject: true,
  },
] as const;

export type CompiledCapitalJobPlan = {
  job: CapitalProjectJobDefinition;
  tasks: readonly OffroadTaskSpec[];
  parallelBatches: readonly (readonly string[])[];
  executionClassCounts: Readonly<Record<OffroadExecutionClass, number>>;
};

const taskById = new Map(offroadTaskRegistry.map((task) => [task.id, task]));

export function capitalProjectJob(job: CapitalProjectJob): CapitalProjectJobDefinition {
  const definition = capitalProjectJobs.find((entry) => entry.id === job);
  if (!definition) throw new Error(`unknown capital project job: ${job}`);
  return definition;
}

/** Compile the minimal dependency-closed DAG for the selected starting job. */
export function compileCapitalProjectJob(jobId: CapitalProjectJob): CompiledCapitalJobPlan {
  const job = capitalProjectJob(jobId);
  const included = new Set<string>();
  const include = (taskId: string) => {
    if (included.has(taskId)) return;
    const task = taskById.get(taskId);
    if (!task) throw new Error(`${jobId} targets unknown TaskSpec ${taskId}`);
    for (const dependency of task.dependencies) include(dependency);
    included.add(taskId);
  };
  for (const target of job.targetTaskIds) include(target);

  const tasks = offroadTaskRegistry.filter((task) => included.has(task.id));
  const parallelBatches = compileParallelBatches(tasks);
  const executionClassCounts = Object.fromEntries(
    offroadExecutionClasses.map((executionClass) => [
      executionClass,
      tasks.filter((task) => task.executionClass === executionClass).length,
    ]),
  ) as Record<OffroadExecutionClass, number>;
  return {job, tasks, parallelBatches, executionClassCounts};
}

const offroadExecutionClasses: readonly OffroadExecutionClass[] = [
  "deterministic", "extraction", "research", "judgment", "compilation", "action",
];

function compileParallelBatches(tasks: readonly OffroadTaskSpec[]): readonly (readonly string[])[] {
  const included = new Set(tasks.map((task) => task.id));
  const completed = new Set<string>();
  const pending = new Set(included);
  const batches: string[][] = [];
  while (pending.size > 0) {
    const ready = tasks
      .filter((task) => pending.has(task.id))
      .filter((task) => task.dependencies.every((dependency) => !included.has(dependency) || completed.has(dependency)))
      .map((task) => task.id);
    if (ready.length === 0) throw new Error(`capital job task cycle: ${[...pending].join(",")}`);
    batches.push(ready);
    for (const taskId of ready) {
      pending.delete(taskId);
      completed.add(taskId);
    }
  }
  return batches;
}

for (const job of capitalProjectJobs) {
  const plan = compileCapitalProjectJob(job.id);
  if (plan.tasks.some((task) => task.effect === "external")) {
    throw new Error(`${job.id} initial plan cannot perform an external action`);
  }
}
