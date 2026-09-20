import {z} from "zod";
import {componentIdSchema, componentVersionSchema, contentHashSchema, methodComponentSchema, type MethodValueType} from "./method-component";
import {methodContentHash} from "./procedure-compiler";

export const methodOverrideSchema = z.object({
  componentId: componentIdSchema,
  pointId: componentIdSchema,
  version: componentVersionSchema,
  scope: z.enum(["organization", "unit", "work_type"]),
  scopeId: z.string().min(1).max(120),
  rationale: z.string().trim().min(5).max(2000),
  source: z.object({versionId: z.uuid(), fingerprint: contentHashSchema}).strict(),
  value: z.json(),
}).strict();
export type MethodOverride = z.infer<typeof methodOverrideSchema>;
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const precedence = {organization: 0, unit: 1, work_type: 2} as const;

/** Values are typed parameters, never patches to code, authority or protected components. */
export function matchesMethodValue(type: MethodValueType, value: unknown): boolean {
  switch (type.type) {
    case "null": return value === null;
    case "union": return type.variants.some((variant) => matchesMethodValue(variant, value));
    case "string": return typeof value === "string";
    case "decimal_string": return typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value);
    case "boolean": return typeof value === "boolean";
    case "integer": return typeof value === "number" && Number.isSafeInteger(value);
    case "date": return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    case "enum": return typeof value === "string" && type.values.includes(value);
    case "array": return Array.isArray(value) && value.every((item) => matchesMethodValue(type.items, item));
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const record = value as Record<string, unknown>;
      return Object.keys(record).every((key) => Object.hasOwn(type.fields, key))
        && Object.entries(type.fields).every(([key, field]) => Object.hasOwn(record, key) ? matchesMethodValue(field.value, record[key]) : !field.required);
    }
  }
}

/** A reproducible proposal. Only the database's human publication command grants a release. */
export function composeMethod(input: {
  baseManifestHash: string;
  components: unknown[];
  overrides: unknown[];
  context: {organizationId: string; unitId: string | null; workType: string};
}) {
  const baseManifestHash = contentHashSchema.parse(input.baseManifestHash);
  const components = input.components.map((component) => methodComponentSchema.parse(component));
  const byId = new Map(components.map((component) => [component.id, component]));
  if (byId.size !== components.length) throw new Error("method_component_duplicate");
  const applicable = input.overrides.map((value) => methodOverrideSchema.parse(value));
  const seen = new Set<string>();
  for (const override of applicable) {
    const expected = override.scope === "organization" ? input.context.organizationId : override.scope === "unit" ? input.context.unitId : input.context.workType;
    if (override.scopeId !== expected) throw new Error("method_override_scope_conflict");
    const component = byId.get(override.componentId);
    const point = component?.overridePoints.find((entry) => entry.id === override.pointId);
    if (!component || !point || component.kind === "quality_gate" || component.kind === "formula"
      || (component.kind === "rule" && ["law", "contract"].includes(component.authority))) throw new Error("method_protected_override");
    if (!matchesMethodValue(point.contract.value, override.value)) throw new Error("method_override_contract_conflict");
    const key = `${override.componentId}:${override.pointId}:${override.scope}`;
    if (seen.has(key)) throw new Error("method_override_ambiguous");
    seen.add(key);
  }
  const ordered = [...applicable].sort((a, b) => precedence[a.scope] - precedence[b.scope] || lexical(a.componentId, b.componentId) || lexical(a.pointId, b.pointId));
  const selected = new Map<string, MethodOverride>();
  for (const override of ordered) selected.set(`${override.componentId}:${override.pointId}`, override);
  const parameters = [...selected.values()].sort((a, b) => lexical(a.componentId, b.componentId) || lexical(a.pointId, b.pointId));
  const payload = {schemaVersion: "method-composition.v1", baseManifestHash, context: {...input.context}, components, overrides: ordered, parameters, grantsExecution: false as const};
  return {...payload, manifestHash: methodContentHash(payload)};
}
