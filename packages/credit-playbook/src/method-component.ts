import {z} from "zod";

export const componentIdSchema = z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/);
export const componentVersionSchema = z.string().regex(/^\d{4}\.\d{2}\.\d{2}-v\d+$/);
export const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** Deliberately closed vocabulary: an object/array must describe its children. */
export type MethodValueType =
  | {type: "string" | "decimal_string" | "boolean" | "integer" | "date" | "null"}
  | {type: "enum"; values: string[]}
  | {type: "array"; items: MethodValueType}
  | {type: "union"; variants: MethodValueType[]}
  | {type: "object"; fields: Record<string, {required: boolean; value: MethodValueType}>};
// Field names describe executor data, not component identities (for example `id`).
const fieldNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,119}$/)
  .refine((name) => !["__proto__", "prototype", "constructor"].includes(name), "unsafe field name");
function canonicalType(value: MethodValueType): string {
  if (value.type === "object") return JSON.stringify({type: value.type, fields: Object.entries(value.fields).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, field]) => [key, field.required, canonicalType(field.value)])});
  if (value.type === "array") return JSON.stringify({type: value.type, items: canonicalType(value.items)});
  if (value.type === "union") return JSON.stringify({type: value.type, variants: value.variants.map(canonicalType).sort()});
  if (value.type === "enum") return JSON.stringify({type: value.type, values: [...value.values].sort()});
  return JSON.stringify(value);
}
export const methodValueTypeSchema: z.ZodType<MethodValueType> = z.lazy(() => z.discriminatedUnion("type", [
  z.object({type: z.enum(["string", "decimal_string", "boolean", "integer", "date", "null"])}).strict(),
  z.object({type: z.literal("enum"), values: z.array(z.string().min(1)).min(1)}).strict(),
  z.object({type: z.literal("array"), items: methodValueTypeSchema}).strict(),
  z.object({type: z.literal("union"), variants: z.array(methodValueTypeSchema).min(2).refine((variants) => new Set(variants.map(canonicalType)).size === variants.length, "duplicate union variant")}).strict(),
  z.object({type: z.literal("object"), fields: z.record(fieldNameSchema, z.object({required: z.boolean(), value: methodValueTypeSchema}).strict()).refine((fields) => Object.keys(fields).length > 0, "object fields must be typed")}).strict(),
]));
export const methodDataContractSchema = z.object({
  id: componentIdSchema,
  version: componentVersionSchema,
  value: methodValueTypeSchema,
}).strict();
export const componentReferenceSchema = z.object({id: componentIdSchema, version: componentVersionSchema}).strict();
export const methodExecutorSchema = z.object({
  module: z.string().regex(/^@offroad\/[a-z][a-z0-9-]+$/),
  exportName: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
  version: componentVersionSchema,
}).strict();
export const methodBudgetSchema = z.object({
  maxModelCalls: z.number().int().nonnegative().safe(),
  maxDurationMs: z.number().int().positive().safe(),
  maxCostMinorUnits: z.number().int().nonnegative().safe(),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).strict();
export const protectedMethodInvariants = ["law", "contractual_definition", "traceability", "verification", "access_barriers", "deterministic_financial_math"] as const;
const common = {
  id: componentIdSchema,
  version: componentVersionSchema,
  title: z.string().min(1),
  inputs: methodDataContractSchema,
  outputs: methodDataContractSchema,
  dependencies: z.array(componentReferenceSchema),
  tools: z.array(componentIdSchema),
  effect: z.enum(["none", "propose_state", "commit", "external"]),
  budget: methodBudgetSchema,
  rights: z.object({
    inheritSourceRestrictions: z.literal(true),
    purposes: z.array(componentIdSchema).min(1),
    sourceClasses: z.array(componentIdSchema).min(1),
  }).strict(),
  /** Competencies of the method, never roles or access privileges of a user. */
  competencies: z.array(componentIdSchema).min(1),
  invariants: z.array(z.enum(protectedMethodInvariants)).refine((values) => protectedMethodInvariants.every((value) => values.includes(value)), "all protected invariants must remain"),
  overridePoints: z.array(z.object({
    id: componentIdSchema,
    target: z.enum(["narrative", "template", "assumption"]),
    contract: methodDataContractSchema,
    requiresRationale: z.literal(true),
  }).strict()),
  evidence: z.array(z.string().min(1)),
};
export const methodComponentSchema = z.discriminatedUnion("kind", [
  z.object({...common, kind: z.literal("narrative"), text: z.string().min(1)}).strict(),
  z.object({...common, kind: z.literal("formula"), expression: z.string().min(1), executor: methodExecutorSchema,
    conventions: z.object({unit: z.string().min(1), period: z.string().min(1), rounding: z.string().min(1), traceRequired: z.literal(true)}).strict()}).strict(),
  z.object({...common, kind: z.literal("rule"), authority: z.enum(["law", "contract", "house", "market", "heuristic"]), statement: z.string().min(1), executor: methodExecutorSchema}).strict(),
  z.object({...common, kind: z.literal("workflow"), orchestration: z.enum(["deterministic_pipeline", "dependency_graph"]), steps: z.array(componentReferenceSchema).min(1)}).strict(),
  z.object({...common, kind: z.literal("template"), format: z.enum(["markdown", "json"]), body: z.string().min(1)}).strict(),
  z.object({...common, kind: z.literal("quality_gate"), executor: methodExecutorSchema, failure: z.enum(["block", "disclose_gap"])}).strict(),
]).superRefine((component, context) => {
  if (component.kind === "formula" && component.executor.module !== "@offroad/financial-core") context.addIssue({code: "custom", message: "financial formula executor must belong to financial-core"});
  if (component.kind === "formula" && component.budget.maxModelCalls !== 0) context.addIssue({code: "custom", message: "financial formulas cannot call a model"});
  if (["narrative", "template"].includes(component.kind) && (component.effect !== "none" || component.tools.length || component.budget.maxModelCalls)) context.addIssue({code: "custom", message: "editorial components cannot grant execution, tools or effects"});
  for (const key of ["tools", "competencies", "invariants", "evidence"] as const) {
    if (new Set(component[key]).size !== component[key].length) context.addIssue({code: "custom", path: [key], message: "duplicate declaration"});
  }
  if (new Set(component.dependencies.map((entry) => entry.id)).size !== component.dependencies.length) context.addIssue({code: "custom", path: ["dependencies"], message: "duplicate dependency"});
  if (new Set(component.overridePoints.map((entry) => entry.id)).size !== component.overridePoints.length) context.addIssue({code: "custom", path: ["overridePoints"], message: "duplicate override point"});
});
export type MethodComponent = z.infer<typeof methodComponentSchema>;

export const procedureCompositionSchema = z.object({
  schemaVersion: z.literal("procedure-composition.v1"),
  authoringStatus: z.enum(["incomplete", "ready_for_review"]),
  pendingContent: z.array(z.string().min(1)),
  budget: methodBudgetSchema,
  allowedTools: z.array(componentIdSchema),
  maximumEffect: z.enum(["none", "propose_state", "commit", "external"]),
  components: z.array(methodComponentSchema).min(1),
}).strict().superRefine((value, context) => {
  if (value.authoringStatus === "ready_for_review" && value.pendingContent.length) context.addIssue({code: "custom", message: "ready content cannot have pending authorship"});
  if (value.authoringStatus === "incomplete" && !value.pendingContent.length) context.addIssue({code: "custom", message: "incomplete content must declare its gaps"});
});
export type ProcedureComposition = z.infer<typeof procedureCompositionSchema>;
