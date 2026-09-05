import {createHash} from "node:crypto";
import {z} from "zod";

/**
 * A procedure is the single, human-reviewable source of operational knowledge.
 * A compiled skill is an immutable runtime projection of that procedure. Nobody edits the
 * compiled projection directly and no runtime is allowed to invent a peer-to-peer handoff.
 */

export const procedureCompilerVersion = "2026.08.25-v2";

/**
 * The ladder a method climbs. Nothing skips a rung: `implemented` needs executable evidence,
 * `ai_reviewed` needs a recorded independent review by a model that went back to the sources,
 * `tested` needs the gold, adversarial and consistency runs, `ready_for_founder` is the hand-off
 * to the founder's integrated evaluation, and `production` needs the founder's approval.
 */
export const procedureMaturitySchema = z.enum(["draft", "candidate", "implemented", "ai_reviewed", "tested", "ready_for_founder", "production"]);
export const procedureMaturityOrder: readonly ProcedureMaturity[] = ["draft", "candidate", "implemented", "ai_reviewed", "tested", "ready_for_founder", "production"];
export const maturityRank = (maturity: ProcedureMaturity): number => procedureMaturityOrder.indexOf(maturity);
export type ProcedureMaturity = z.infer<typeof procedureMaturitySchema>;

export const procedureRoleSchema = z.enum([
  "intake_evidence",
  "financial_analysis",
  "credit_structuring",
  "institutional_materials",
  "market_distribution",
  "independent_quality_control",
]);
export type ProcedureRole = z.infer<typeof procedureRoleSchema>;

export const procedureStageSchema = z.number().int().min(1).max(12);
export type ProcedureStage = z.infer<typeof procedureStageSchema>;

export const procedureAuthoritySchema = z.enum(["LEI", "DEF", "CASA", "MERCADO", "HEURÍSTICA"]);
export type ProcedureAuthority = z.infer<typeof procedureAuthoritySchema>;

const bilingualSchema = z.object({pt: z.string().trim().min(1), en: z.string().trim().min(1)}).strict();

export const outputValueTypeSchema = z.enum([
  "string",
  "number",
  "decimal_string",
  "boolean",
  "date",
  "enum",
  "object",
  "array",
]);

export const procedureOutputFieldSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  type: outputValueTypeSchema,
  required: z.boolean(),
  description: z.string().trim().min(1),
  /** Material assertions must point to evidence or a traced calculation. */
  evidenceRequired: z.boolean().default(true),
  allowedValues: z.array(z.string().min(1)).min(1).optional(),
}).strict();
export type ProcedureOutputField = z.infer<typeof procedureOutputFieldSchema>;

export const procedureStepSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  title: z.string().trim().min(1),
  instructions: z.array(z.string().trim().min(1)).min(1),
  mode: z.enum(["deterministic", "model_assisted", "human_judgment"]),
  tools: z.array(z.string().trim().min(1)).default([]),
  evidenceInputs: z.array(z.string().trim().min(1)).default([]),
}).strict();
export type ProcedureStep = z.infer<typeof procedureStepSchema>;

const qualitySchema = z.object({
  unit: z.array(z.string().trim().min(1)).min(1),
  gold: z.array(z.string().trim().min(1)).min(1),
  adversarial: z.array(z.string().trim().min(1)).min(1),
  acceptance: z.array(z.string().trim().min(1)).min(1),
}).strict();

const runtimeSchema = z.object({
  /** Roles are namespaces. The rail, not a model, owns order and transition. */
  orchestration: z.literal("deterministic_pipeline"),
  peerHandoffs: z.literal(false),
  maxModelCalls: z.number().int().min(0).max(3),
  modelPurpose: z.array(z.string().trim().min(1)).max(3).default([]),
  allowedTools: z.array(z.string().trim().min(1)).default([]),
}).strict();

const implementationEvidenceSchema = z.object({
  executor: z.object({
    module: z.string().trim().min(1),
    exportName: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
  }).strict(),
  resultContract: z.string().trim().min(1),
  connectedProductStates: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).min(1),
  persistence: z.object({
    mode: z.enum(["persisted", "derived_on_demand"]),
    target: z.string().trim().min(1),
  }).strict(),
  evaluation: z.object({
    unitTestFiles: z.array(z.string().trim().min(1)).min(1),
    goldCaseIds: z.array(z.string().trim().min(1)).min(1),
    adversarialCaseIds: z.array(z.string().trim().min(1)).min(1),
    e2eScenarioIds: z.array(z.string().trim().min(1)).min(1),
    costEvalIds: z.array(z.string().trim().min(1)).min(1),
  }).strict(),
}).strict();
export type ImplementationEvidence = z.infer<typeof implementationEvidenceSchema>;

export const canonicalProcedureSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-v\d+$/),
  maturity: procedureMaturitySchema,
  title: bilingualSchema,
  role: procedureRoleSchema,
  blueprintStage: procedureStageSchema,
  owner: z.object({role: z.string().trim().min(1), approvedBy: z.string().trim().min(1).optional()}).strict(),
  objective: z.string().trim().min(1),
  product: z.string().trim().min(1),
  procedure: z.array(procedureStepSchema).min(1),
  output: z.object({schemaId: z.string().regex(/^[a-z][a-z0-9_.-]*$/), fields: z.array(procedureOutputFieldSchema).min(1)}).strict(),
  evidence: z.object({
    hierarchy: z.array(z.string().trim().min(1)).min(1),
    rules: z.array(z.string().trim().min(1)).min(1),
    materialClaimsRequireSupport: z.literal(true),
  }).strict(),
  tests: qualitySchema,
  source: z.object({path: z.string().trim().min(1), effectiveDate: z.iso.date(), supersedes: z.string().min(1).optional()}).strict(),
  knowledge: z.object({
    houseProcedureIds: z.array(z.string().regex(/^(IN|EMP|Q|D|OP|ES|PR|MA|MK|RF|LC)-\d{2}$/)).default([]),
    authorities: z.array(procedureAuthoritySchema).default([]),
    referenceDataKeys: z.array(z.string().regex(/^[a-z][a-z0-9_.-]*$/)).default([]),
    legalReviewRequired: z.boolean().default(false),
  }).strict().default({houseProcedureIds: [], authorities: [], referenceDataKeys: [], legalReviewRequired: false}),

  /** Candidate and production detail. Drafts may omit these while the method is being written. */
  prerequisites: z.array(z.string().trim().min(1)).default([]),
  dependencies: z.array(z.string().regex(/^[a-z][a-z0-9-]{2,79}$/)).default([]),
  decisionRules: z.array(z.string().trim().min(1)).default([]),
  redFlags: z.array(z.string().trim().min(1)).default([]),
  stopConditions: z.array(z.string().trim().min(1)).default([]),
  exceptions: z.array(z.string().trim().min(1)).default([]),
  templates: z.array(z.string().regex(/^[a-z][a-z0-9-]{2,79}$/)).default([]),
  examples: z.object({positive: z.array(z.string().min(1)).default([]), negative: z.array(z.string().min(1)).default([])}).default({positive: [], negative: []}),
  runtime: runtimeSchema.default({
    orchestration: "deterministic_pipeline",
    peerHandoffs: false,
    maxModelCalls: 0,
    modelPurpose: [],
    allowedTools: [],
  }),
  /**
   * Evidence that the procedure is connected to executable code and the product rail.
   * Candidates may omit it while being built. Anything from `implemented` up may not.
   */
  implementation: implementationEvidenceSchema.optional(),
  /**
   * Independent reviews on record. `ai_independent_review` is a verification separate from the
   * implementation (back to the sources, numbers recalculated, definitions and exceptions
   * tested, adversarial and consistency runs); it is never a human approval and is recorded as
   * such. A rung above `implemented` needs at least one that passed or passed with conditions.
   */
  reviews: z.array(z.object({
    reviewId: z.string().regex(/^[a-z0-9][a-z0-9_.-]{2,120}$/),
    kind: z.literal("ai_independent_review"),
    result: z.enum(["pass", "conditional", "fail"]),
    recordPath: z.string().trim().min(1),
  }).strict()).default([]),
  /**
   * Evidence of the runs a rung needs: gold, adversarial and consistency. Ids of recorded runs,
   * never prose. `tested` and above require all three.
   */
  testRuns: z.object({
    gold: z.array(z.string().min(1)).default([]),
    adversarial: z.array(z.string().min(1)).default([]),
    consistency: z.array(z.string().min(1)).default([]),
  }).strict().default({gold: [], adversarial: [], consistency: []}),
}).strict().superRefine((procedure, context) => {
  duplicateIssues(procedure.procedure.map((step) => step.id), ["procedure"], context);
  duplicateIssues(procedure.output.fields.map((field) => field.id), ["output", "fields"], context);
  duplicateIssues(procedure.dependencies, ["dependencies"], context);
  duplicateIssues(procedure.templates, ["templates"], context);
  duplicateIssues(procedure.knowledge.houseProcedureIds, ["knowledge", "houseProcedureIds"], context);
  duplicateIssues(procedure.knowledge.authorities, ["knowledge", "authorities"], context);
  duplicateIssues(procedure.knowledge.referenceDataKeys, ["knowledge", "referenceDataKeys"], context);

  if (procedure.runtime.maxModelCalls === 0 && procedure.runtime.modelPurpose.length > 0) {
    context.addIssue({code: "custom", path: ["runtime", "modelPurpose"], message: "a deterministic procedure cannot declare a model purpose"});
  }
  if (procedure.runtime.maxModelCalls > 0 && procedure.runtime.modelPurpose.length === 0) {
    context.addIssue({code: "custom", path: ["runtime", "modelPurpose"], message: "every model call needs a narrow declared purpose"});
  }
  if (procedure.knowledge.legalReviewRequired && !procedure.knowledge.authorities.includes("LEI")) {
    context.addIssue({code: "custom", path: ["knowledge", "legalReviewRequired"], message: "legal review requires LEI authority"});
  }

  if (procedure.maturity === "draft") return;
  const candidateRequirements: Array<[keyof typeof procedure, unknown[]]> = [
    ["prerequisites", procedure.prerequisites],
    ["decisionRules", procedure.decisionRules],
    ["redFlags", procedure.redFlags],
    ["stopConditions", procedure.stopConditions],
  ];
  for (const [field, value] of candidateRequirements) {
    if (value.length === 0) context.addIssue({code: "custom", path: [field], message: `${procedure.maturity} procedures require ${field}`});
  }

  const rank = maturityRank(procedure.maturity);
  if (rank >= maturityRank("implemented") && !procedure.implementation) {
    context.addIssue({code: "custom", path: ["implementation"], message: `${procedure.maturity} procedures require executable implementation evidence`});
  }
  if (rank >= maturityRank("ai_reviewed") && !procedure.reviews.some((review) => review.result !== "fail")) {
    context.addIssue({code: "custom", path: ["reviews"], message: `${procedure.maturity} procedures require a recorded independent review that passed or passed with conditions`});
  }
  if (rank >= maturityRank("tested")) {
    for (const kind of ["gold", "adversarial", "consistency"] as const) {
      if (procedure.testRuns[kind].length === 0) context.addIssue({code: "custom", path: ["testRuns", kind], message: `${procedure.maturity} procedures require recorded ${kind} runs`});
    }
  }
  if (rank >= maturityRank("ready_for_founder") && (procedure.examples.positive.length === 0 || procedure.examples.negative.length === 0)) {
    context.addIssue({code: "custom", path: ["examples"], message: `${procedure.maturity} procedures require positive and negative examples`});
  }
  if (procedure.maturity === "production" && !procedure.owner.approvedBy) {
    context.addIssue({code: "custom", path: ["owner", "approvedBy"], message: "production procedures require the founder's approval on record"});
  }
});
export type CanonicalProcedure = z.infer<typeof canonicalProcedureSchema>;

export type CompiledProcedureSkill = {
  skillId: string;
  procedureId: string;
  procedureVersion: string;
  compilerVersion: string;
  sourceHash: string;
  maturity: ProcedureMaturity;
  role: ProcedureRole;
  blueprintStage: ProcedureStage;
  instructions: string;
  outputSchema: Record<string, unknown>;
  runtime: CanonicalProcedure["runtime"];
  knowledge: CanonicalProcedure["knowledge"];
  templates: string[];
  dependencies: string[];
  implementation: CanonicalProcedure["implementation"];
  reviews: CanonicalProcedure["reviews"];
  testRuns: CanonicalProcedure["testRuns"];
};

/** Compile a reviewed procedure into the only form the runtime is allowed to execute. */
export function compileProcedure(raw: CanonicalProcedure): CompiledProcedureSkill {
  const procedure = canonicalProcedureSchema.parse(raw);
  const sourceHash = sha256(stableJson(procedure));
  return {
    skillId: `offroad.${procedure.id}@${procedure.version}`,
    procedureId: procedure.id,
    procedureVersion: procedure.version,
    compilerVersion: procedureCompilerVersion,
    sourceHash,
    maturity: procedure.maturity,
    role: procedure.role,
    blueprintStage: procedure.blueprintStage,
    instructions: renderInstructions(procedure),
    outputSchema: outputJsonSchema(procedure.output.fields),
    runtime: procedure.runtime,
    knowledge: procedure.knowledge,
    templates: [...procedure.templates],
    dependencies: [...procedure.dependencies],
    implementation: procedure.implementation,
    reviews: procedure.reviews,
    testRuns: procedure.testRuns,
  };
}

export function compileProcedureRegistry(
  procedures: readonly CanonicalProcedure[],
  templateIds: readonly string[],
  referenceDataKeys: readonly string[] = [],
) {
  const parsed = procedures.map((procedure) => canonicalProcedureSchema.parse(procedure));
  duplicateOrThrow(parsed.map((procedure) => procedure.id), "procedure");
  const ids = new Set(parsed.map((procedure) => procedure.id));
  const templates = new Set(templateIds);
  const references = new Set(referenceDataKeys);
  for (const procedure of parsed) {
    for (const dependency of procedure.dependencies) {
      if (!ids.has(dependency)) throw new Error(`procedure ${procedure.id} depends on unknown procedure ${dependency}`);
    }
    for (const template of procedure.templates) {
      if (!templates.has(template)) throw new Error(`procedure ${procedure.id} references unknown template ${template}`);
    }
    for (const reference of procedure.knowledge.referenceDataKeys) {
      if (!references.has(reference)) throw new Error(`procedure ${procedure.id} references unknown reference data ${reference}`);
    }
  }
  detectCycles(parsed);
  const skills = parsed.map(compileProcedure);
  return {
    compilerVersion: procedureCompilerVersion,
    registryHash: sha256(stableJson(skills.map(({instructions: _instructions, ...skill}) => skill))),
    skills,
  };
}

function outputJsonSchema(fields: readonly ProcedureOutputField[]): Record<string, unknown> {
  const properties = Object.fromEntries(fields.map((field) => [field.id, {
    type: jsonType(field.type),
    description: field.description,
    ...(field.allowedValues ? {enum: field.allowedValues} : {}),
    "x-evidence-required": field.evidenceRequired,
  }]));
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: fields.filter((field) => field.required).map((field) => field.id),
  };
}

function jsonType(type: ProcedureOutputField["type"]): string {
  if (type === "decimal_string" || type === "date" || type === "enum") return "string";
  return type;
}

function renderInstructions(procedure: CanonicalProcedure): string {
  const sections = [
    `# ${procedure.title.pt}`,
    `Objetivo: ${procedure.objective}`,
    `Produto: ${procedure.product}`,
    "",
    "## Regras de execução",
    "A sequência, o estado e os gates pertencem ao pipeline determinístico. Não delegue, não converse com outros agentes e não promova o case por conta própria.",
    ...procedure.procedure.flatMap((step, index) => [
      `${index + 1}. ${step.title} [${step.mode}]`,
      ...step.instructions.map((instruction) => `   - ${instruction}`),
    ]),
    "",
    "## Evidência",
    ...procedure.evidence.rules.map((rule) => `- ${rule}`),
    ...(procedure.knowledge.houseProcedureIds.length ? ["", `Fontes do House Playbook: ${procedure.knowledge.houseProcedureIds.join(", ")}.`] : []),
    ...(procedure.knowledge.referenceDataKeys.length ? [`Dados versionados obrigatórios: ${procedure.knowledge.referenceDataKeys.join(", ")}.`] : []),
    ...(procedure.knowledge.legalReviewRequired ? ["Afirmações classificadas como LEI exigem fonte vigente e revisão especializada antes de impressão."] : []),
    "",
    "## Interrompa e devolva estado explícito quando",
    ...(procedure.stopConditions.length ? procedure.stopConditions : ["o contrato mínimo de evidência ou saída não puder ser satisfeito"]).map((condition) => `- ${condition}`),
    "",
    `Saída obrigatória: ${procedure.output.schemaId}. Responda somente no schema estruturado fornecido pelo runtime.`,
  ];
  return sections.join("\n");
}

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function duplicateIssues(values: readonly string[], path: PropertyKey[], context: z.RefinementCtx) {
  if (new Set(values).size !== values.length) context.addIssue({code: "custom", path, message: "values must be unique"});
}

function duplicateOrThrow(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`duplicate ${label} id`);
}

function detectCycles(procedures: readonly CanonicalProcedure[]) {
  const byId = new Map(procedures.map((procedure) => [procedure.id, procedure]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`procedure dependency cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const procedure of procedures) visit(procedure.id);
}
