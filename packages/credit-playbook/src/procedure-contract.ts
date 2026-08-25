import {createHash} from "node:crypto";
import {z} from "zod";

/**
 * A procedure is the single, human-reviewable source of operational knowledge.
 * A compiled skill is an immutable runtime projection of that procedure. Nobody edits the
 * compiled projection directly and no runtime is allowed to invent a peer-to-peer handoff.
 */

export const procedureCompilerVersion = "2026.08.25-v1";

export const procedureMaturitySchema = z.enum(["draft", "candidate", "production"]);
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
}).strict().superRefine((procedure, context) => {
  duplicateIssues(procedure.procedure.map((step) => step.id), ["procedure"], context);
  duplicateIssues(procedure.output.fields.map((field) => field.id), ["output", "fields"], context);
  duplicateIssues(procedure.dependencies, ["dependencies"], context);
  duplicateIssues(procedure.templates, ["templates"], context);

  if (procedure.runtime.maxModelCalls === 0 && procedure.runtime.modelPurpose.length > 0) {
    context.addIssue({code: "custom", path: ["runtime", "modelPurpose"], message: "a deterministic procedure cannot declare a model purpose"});
  }
  if (procedure.runtime.maxModelCalls > 0 && procedure.runtime.modelPurpose.length === 0) {
    context.addIssue({code: "custom", path: ["runtime", "modelPurpose"], message: "every model call needs a narrow declared purpose"});
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

  if (procedure.maturity !== "production") return;
  if (!procedure.owner.approvedBy) context.addIssue({code: "custom", path: ["owner", "approvedBy"], message: "production procedures require an approver"});
  if (procedure.examples.positive.length === 0 || procedure.examples.negative.length === 0) {
    context.addIssue({code: "custom", path: ["examples"], message: "production procedures require positive and negative examples"});
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
  templates: string[];
  dependencies: string[];
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
    templates: [...procedure.templates],
    dependencies: [...procedure.dependencies],
  };
}

export function compileProcedureRegistry(procedures: readonly CanonicalProcedure[], templateIds: readonly string[]) {
  const parsed = procedures.map((procedure) => canonicalProcedureSchema.parse(procedure));
  duplicateOrThrow(parsed.map((procedure) => procedure.id), "procedure");
  const ids = new Set(parsed.map((procedure) => procedure.id));
  const templates = new Set(templateIds);
  for (const procedure of parsed) {
    for (const dependency of procedure.dependencies) {
      if (!ids.has(dependency)) throw new Error(`procedure ${procedure.id} depends on unknown procedure ${dependency}`);
    }
    for (const template of procedure.templates) {
      if (!templates.has(template)) throw new Error(`procedure ${procedure.id} references unknown template ${template}`);
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
