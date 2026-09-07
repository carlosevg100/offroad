import {createHash} from "node:crypto";

import {z} from "zod";

const localizedTextSchema = z.object({pt: z.string().min(1), en: z.string().min(1)}).strict();

export const workflowRecipeStepSchema = z.object({
  taskId: z.string().regex(/^[A-Z][0-9]{2}$/),
  methodId: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  methodVersion: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-v\d+$/),
  executorKey: z.string().min(1),
  artifactType: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: localizedTextSchema,
  purpose: localizedTextSchema,
  decisionImpact: localizedTextSchema,
  dependencies: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)),
  requiredObjects: z.array(z.string().regex(/^[a-z][a-z0-9_.-]*$/)),
  coverageKeys: z.array(z.string().regex(/^[a-z][a-z0-9_.-]*$/)).min(1),
  verification: z.array(z.string().regex(/^[a-z][a-z0-9_.-]*$/)).min(1),
  invalidationKeys: z.array(z.string().regex(/^[a-z][a-z0-9_.-]*$/)).min(1),
  executionClass: z.enum(["deterministic", "extraction", "research", "judgment", "compilation"]),
  stage: z.enum(["research", "analysis", "alternatives", "material"]),
  failurePolicy: z.enum(["block_descendants", "degrade_with_disclosed_gap", "retry_then_abstain"]),
  effect: z.enum(["none", "propose_state", "commit"]),
  costBudget: z.object({maxModelCalls: z.number().int().min(0).max(3), maxDurationMs: z.number().int().positive()}).strict(),
}).strict();
export type WorkflowRecipeStep = z.infer<typeof workflowRecipeStepSchema>;

export const workflowRecipeSchema = z.object({
  schemaVersion: z.literal("workflow-recipe.v1"),
  id: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-v\d+$/),
  maturity: z.enum(["specified", "implemented", "tested", "production"]),
  economicSituations: z.array(z.string().regex(/^[a-z][a-z0-9_.-]*$/)).min(1),
  supportedOutcomes: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.array(z.string().regex(/^[A-Z][0-9]{2}$/)).min(1)),
  steps: z.array(workflowRecipeStepSchema).min(1),
}).superRefine((recipe, context) => {
  const taskIds = recipe.steps.map((step) => step.taskId);
  const known = new Set(taskIds);
  const taskIndex = new Map(taskIds.map((taskId, index) => [taskId, index]));
  if (known.size !== taskIds.length) context.addIssue({code: "custom", path: ["steps"], message: "task ids must be unique inside a workflow recipe"});
  for (const [index, step] of recipe.steps.entries()) {
    if (new Set(step.dependencies).size !== step.dependencies.length) context.addIssue({code: "custom", path: ["steps", index, "dependencies"], message: "dependencies must be unique inside a workflow step"});
    for (const dependency of step.dependencies) {
      if (!known.has(dependency)) context.addIssue({code: "custom", path: ["steps", index, "dependencies"], message: `unknown dependency ${dependency}`});
      if (dependency === step.taskId) context.addIssue({code: "custom", path: ["steps", index, "dependencies"], message: "a step cannot depend on itself"});
      if ((taskIndex.get(dependency) ?? -1) >= index) context.addIssue({code: "custom", path: ["steps", index, "dependencies"], message: `dependency ${dependency} must precede ${step.taskId}`});
    }
  }
  const reachable = new Set<string>();
  const dependenciesByTask = new Map(recipe.steps.map((step) => [step.taskId, step.dependencies]));
  const markReachable = (taskId: string) => {
    if (reachable.has(taskId) || !known.has(taskId)) return;
    reachable.add(taskId);
    for (const dependency of dependenciesByTask.get(taskId) ?? []) markReachable(dependency);
  };
  for (const [outcome, targets] of Object.entries(recipe.supportedOutcomes)) {
    if (new Set(targets).size !== targets.length) context.addIssue({code: "custom", path: ["supportedOutcomes", outcome], message: "targets must be unique inside an outcome"});
    for (const target of targets) {
      if (!known.has(target)) context.addIssue({code: "custom", path: ["supportedOutcomes", outcome], message: `unknown target ${target}`});
      markReachable(target);
    }
  }
  for (const [index, taskId] of taskIds.entries()) if (!reachable.has(taskId)) context.addIssue({code: "custom", path: ["steps", index], message: `orphan task ${taskId} is not reachable from any outcome`});
  if (hasCycle(recipe.steps)) context.addIssue({code: "custom", path: ["steps"], message: "workflow recipe contains a dependency cycle"});
});
export type WorkflowRecipe = z.infer<typeof workflowRecipeSchema>;

export type CompiledWorkflowSlice = {
  recipeId: string;
  recipeVersion: string;
  outcome: string;
  steps: WorkflowRecipeStep[];
  parallelBatches: string[][];
  fingerprint: string;
};

/**
 * Expands backward from the requested outcome to every required dependency. Asking for a smaller
 * work product contracts the graph; deepening the request preserves the already-valid prefix.
 */
export function compileWorkflowSlice(recipeInput: WorkflowRecipe, outcome: string): CompiledWorkflowSlice {
  const recipe = workflowRecipeSchema.parse(recipeInput);
  const targets = recipe.supportedOutcomes[outcome];
  if (!targets) throw new Error(`workflow ${recipe.id} does not support outcome ${outcome}`);
  const byId = new Map(recipe.steps.map((step) => [step.taskId, step]));
  const selected = new Set<string>();
  const visit = (taskId: string) => {
    if (selected.has(taskId)) return;
    const step = byId.get(taskId);
    if (!step) throw new Error(`workflow ${recipe.id} references unknown task ${taskId}`);
    for (const dependency of step.dependencies) visit(dependency);
    selected.add(taskId);
  };
  for (const target of targets) visit(target);
  const steps = recipe.steps.filter((step) => selected.has(step.taskId));
  const parallelBatches = batchesFor(steps);
  const payload = {recipeId: recipe.id, recipeVersion: recipe.version, outcome, steps, parallelBatches};
  return {...payload, fingerprint: fingerprint(payload)};
}

export function workflowRecipeFingerprint(recipeInput: WorkflowRecipe): string {
  return fingerprint(workflowRecipeSchema.parse(recipeInput));
}

function batchesFor(steps: readonly WorkflowRecipeStep[]): string[][] {
  const selected = new Set(steps.map((step) => step.taskId));
  const batchByTask = new Map<string, number>();
  const remaining = new Set(steps.map((step) => step.taskId));
  const batches: string[][] = [];
  while (remaining.size) {
    const ready = steps.filter((step) => remaining.has(step.taskId) && step.dependencies.filter((dependency) => selected.has(dependency)).every((dependency) => batchByTask.has(dependency)));
    if (!ready.length) throw new Error("workflow recipe contains an unresolved dependency cycle");
    const batchIndex = batches.length;
    batches.push(ready.map((step) => step.taskId));
    for (const step of ready) {
      remaining.delete(step.taskId);
      batchByTask.set(step.taskId, batchIndex);
    }
  }
  return batches;
}

function hasCycle(steps: readonly WorkflowRecipeStep[]): boolean {
  try {
    batchesFor(steps);
    return false;
  } catch {
    return true;
  }
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value, (_key, nested: unknown) => (
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)))
      : nested
  ))).digest("hex");
}

const common = {
  effect: "propose_state" as const,
  failurePolicy: "degrade_with_disclosed_gap" as const,
  costBudget: {maxModelCalls: 0, maxDurationMs: 30_000},
};

/** First reusable workflow recipe extracted from the Case 01 rail; it contains no company data. */
export const refinanceLiabilityManagementWorkflow = workflowRecipeSchema.parse({
  schemaVersion: "workflow-recipe.v1",
  id: "refinance-liability-management",
  version: "2026.09.07-v1",
  maturity: "implemented",
  economicSituations: ["refinance", "liability_management", "maturity_concentration", "repricing", "term_extension"],
  supportedOutcomes: {
    diagnostic: ["C09", "C10", "C07"],
    scenario_analysis: ["C08"],
    alternatives: ["S10"],
    meeting_plan: ["A01"],
    material: ["A02"],
  },
  steps: [
    {
      ...common, taskId: "C05", methodId: "build-debt-ledger", methodVersion: "2026.09.05-v15", executorKey: "integration-preview.build-debt-ledger", artifactType: "preview_debt_ledger", stage: "research", executionClass: "deterministic",
      label: {pt: "Mapear a dívida instrumento a instrumento", en: "Map the debt instrument by instrument"},
      purpose: {pt: "Estabelecer a posição de dívida conciliada e os termos de cada obrigação.", en: "Establish the reconciled debt position and each obligation's terms."},
      decisionImpact: {pt: "Define a base de vencimentos, custos, covenants e alternativas.", en: "Defines the basis for maturities, costs, covenants and alternatives."},
      dependencies: [], requiredObjects: ["financial_statements", "debt_note", "debt_contracts"], coverageKeys: ["liquidity_and_debt_schedule"], verification: ["debt_ledger_reconciliation"], invalidationKeys: ["debt_balance", "debt_terms", "as_of_date"],
    },
    {
      ...common, taskId: "D07", methodId: "reconcile-financial-statements", methodVersion: "2026.09.05-v9", executorKey: "integration-preview.reconcile-financial-statements", artifactType: "preview_financial_statements", stage: "research", executionClass: "deterministic",
      label: {pt: "Conciliar demonstrações, notas e release", en: "Reconcile statements, notes and release"},
      purpose: {pt: "Resolver diferenças entre as fontes financeiras da mesma data-base.", en: "Resolve differences among financial sources for the same as-of date."},
      decisionImpact: {pt: "Determina quais números podem sustentar a análise.", en: "Determines which figures may support the analysis."},
      dependencies: [], requiredObjects: ["financial_statements", "financial_release"], coverageKeys: ["historical_financials"], verification: ["statement_reconciliation"], invalidationKeys: ["financial_period", "financial_source", "accounting_definition"],
    },
    {
      ...common, taskId: "C09", methodId: "reconcile-covenant-definitions", methodVersion: "2026.09.05-v14", executorKey: "integration-preview.reconcile-covenant-definitions", artifactType: "preview_covenants", stage: "analysis", executionClass: "deterministic",
      label: {pt: "Ler os covenants pelas escrituras", en: "Read covenants from the indentures"},
      purpose: {pt: "Resolver definição, limite, medição e headroom por instrumento.", en: "Resolve definition, threshold, testing date and headroom by instrument."},
      decisionImpact: {pt: "Limita capacidade de dívida e risco de aceleração.", en: "Constrains debt capacity and acceleration risk."},
      dependencies: ["C05", "D07"], requiredObjects: ["debt_ledger", "covenant_clauses"], coverageKeys: ["covenants"], verification: ["covenant_definition_comparability"], invalidationKeys: ["covenant_terms", "financial_period", "debt_balance"],
    },
    {
      ...common, taskId: "C10", methodId: "diagnose-maturity-wall", methodVersion: "2026.09.05-v8", executorKey: "integration-preview.diagnose-maturity-wall", artifactType: "preview_maturity_wall", stage: "analysis", executionClass: "deterministic",
      label: {pt: "Diagnosticar vencimentos e cobertura", en: "Diagnose maturities and coverage"},
      purpose: {pt: "Medir concentração de vencimentos e fontes de pagamento.", en: "Measure maturity concentration and repayment sources."},
      decisionImpact: {pt: "Identifica urgência, volume e janela de refinanciamento.", en: "Identifies refinancing urgency, amount and window."},
      dependencies: ["C05"], requiredObjects: ["debt_ledger", "liquidity_position"], coverageKeys: ["liquidity_and_debt_schedule"], verification: ["maturity_schedule_tie_out"], invalidationKeys: ["debt_schedule", "cash_definition", "cash_flow_forecast"],
    },
    {
      ...common, taskId: "C07", methodId: "build-interest-and-indexation-schedule", methodVersion: "2026.09.05-v7", executorKey: "integration-preview.build-interest-and-indexation-schedule", artifactType: "preview_interest_schedule", stage: "analysis", executionClass: "deterministic",
      label: {pt: "Projetar juros e correção por série", en: "Project interest and indexation by series"},
      purpose: {pt: "Separar juros caixa, IPCA capitalizado e amortização.", en: "Separate cash interest, capitalized inflation and amortization."},
      decisionImpact: {pt: "Determina serviço da dívida, caixa e saldo futuro.", en: "Determines debt service, cash use and future principal."},
      dependencies: ["C05"], requiredObjects: ["debt_ledger", "market_curves"], coverageKeys: ["leverage_and_debt_service"], verification: ["interest_schedule_tie_out"], invalidationKeys: ["interest_curve", "indexation_rule", "amortization_schedule"],
    },
    {
      ...common, taskId: "S07", methodId: "estimate-exit-cost-by-series", methodVersion: "2026.09.05-v8", executorKey: "integration-preview.estimate-exit-cost-by-series", artifactType: "preview_exit_costs", stage: "analysis", executionClass: "deterministic",
      label: {pt: "Estimar o custo de saída por série", en: "Estimate exit cost by series"},
      purpose: {pt: "Aplicar a regra contratual de pré-pagamento ou resgate por série.", en: "Apply each series' contractual prepayment or redemption rule."},
      decisionImpact: {pt: "Define viabilidade econômica e timing de substituição.", en: "Defines the economics and timing of a replacement."},
      dependencies: ["C05", "C07"], requiredObjects: ["debt_ledger", "interest_schedule", "exit_clauses"], coverageKeys: ["structure_and_terms"], verification: ["exit_formula_source_check"], invalidationKeys: ["exit_date", "market_curve", "exit_clause"],
    },
    {
      ...common, taskId: "C08", methodId: "declare-scenarios", methodVersion: "2026.09.05-v6", executorKey: "integration-preview.declare-scenarios", artifactType: "preview_scenarios", stage: "analysis", executionClass: "deterministic",
      label: {pt: "Declarar cenários e estresses", en: "Declare scenarios and stresses"},
      purpose: {pt: "Projetar base, downside e ausência de rolagem com premissas rastreáveis.", en: "Project base, downside and no-refinancing cases with traceable assumptions."},
      decisionImpact: {pt: "Testa resiliência e explicita a dependência de premissas.", en: "Tests resilience and exposes dependence on assumptions."},
      dependencies: ["C05", "C10"], requiredObjects: ["debt_ledger", "maturity_wall", "scenario_assumptions"], coverageKeys: ["downside_and_sensitivities"], verification: ["scenario_assumption_trace"], invalidationKeys: ["scenario_assumption", "business_plan", "interest_curve"],
    },
    {
      ...common, taskId: "S10", methodId: "compare-refinancing-before-after", methodVersion: "2026.09.05-v7", executorKey: "integration-preview.compare-refinancing-before-after", artifactType: "preview_alternatives", stage: "alternatives", executionClass: "deterministic",
      label: {pt: "Comparar as alternativas antes e depois", en: "Compare the alternatives before and after"},
      purpose: {pt: "Comparar dívida, custo, vencimentos, cobertura e covenants no antes e depois.", en: "Compare debt, cost, maturities, coverage and covenants before and after."},
      decisionImpact: {pt: "Sustenta quais caminhos merecem discussão, sem fechar recomendação.", en: "Supports which paths merit discussion without closing a recommendation."},
      dependencies: ["C05", "C09", "C10", "S07", "C08"], requiredObjects: ["debt_ledger", "covenant_analysis", "maturity_wall", "exit_costs", "scenarios"], coverageKeys: ["capital_alternatives", "structure_and_terms"], verification: ["before_after_identity"], invalidationKeys: ["structure_assumption", "scenario_assumption", "debt_balance"],
    },
    {
      ...common, taskId: "A01", methodId: "plan-meeting-brief", methodVersion: "2026.09.05-v7", executorKey: "integration-preview.plan-meeting-brief", artifactType: "preview_meeting_brief", stage: "material", executionClass: "compilation", costBudget: {maxModelCalls: 2, maxDurationMs: 90_000},
      label: {pt: "Planejar a devolutiva e o material", en: "Plan the readout and the material"},
      purpose: {pt: "Projetar a análise verificada para a audiência e o formato pedidos.", en: "Project the verified analysis into the requested audience and format."},
      decisionImpact: {pt: "Confirma o conteúdo antes da produção do arquivo.", en: "Confirms content before file production."},
      dependencies: ["C05", "D07", "C09", "C10", "C07", "S07", "C08", "S10"], requiredObjects: ["verified_analysis", "audience", "deliverable_format"], coverageKeys: ["materials_and_cross_consistency"], verification: ["material_plan_object_coverage"], invalidationKeys: ["audience", "deliverable_format", "analysis_fingerprint"],
    },
    {
      ...common, taskId: "A02", methodId: "write-meeting-synthesis", methodVersion: "2026.09.05-v1", executorKey: "integration-preview.write-meeting-synthesis", artifactType: "preview_material", stage: "material", executionClass: "compilation", costBudget: {maxModelCalls: 1, maxDurationMs: 90_000},
      label: {pt: "Escrever a síntese e o material", en: "Write the synthesis and the material"},
      purpose: {pt: "Gerar o work product a partir dos objetos assinados e do plano confirmado.", en: "Generate the work product from signed objects and the confirmed plan."},
      decisionImpact: {pt: "Entrega material utilizável, versionado e rastreável.", en: "Delivers a usable, versioned and traceable work product."},
      dependencies: ["C05", "D07", "C09", "C10", "C07", "S07", "C08", "S10", "A01"], requiredObjects: ["signed_analysis_objects", "confirmed_material_plan"], coverageKeys: ["materials_and_cross_consistency"], verification: ["material_number_allowlist", "artifact_fingerprint"], invalidationKeys: ["material_plan", "analysis_fingerprint", "template_version"],
    },
  ],
});
