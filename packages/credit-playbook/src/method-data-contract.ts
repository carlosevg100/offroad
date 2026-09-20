import {methodDataContractSchema, type MethodValueType} from "./method-component";

type Schema = Record<string, unknown>;
const object = (raw: unknown): Schema => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("method_json_schema_object_required");
  return raw as Schema;
};
/** Structural projection for build-owned executor registration. Runtime schemas retain
 * refinements, bounds, literals and formats; pin their source bytes and the full JSON schema.
 * This projection never substitutes for the executor's semantic input/output validation. */
export function methodDataContractFromJsonSchema(id: string, version: string, raw: unknown) {
  function project(raw: unknown): MethodValueType {
    const s = object(raw);
    if (s.$ref || s.allOf || s.not || s.if || s.patternProperties) throw new Error("method_json_schema_unsupported_composition");
    const variants = s.anyOf ?? s.oneOf;
    if (variants !== undefined) {
      if (!Array.isArray(variants) || variants.length < 2) throw new Error("method_json_schema_variants_required");
      return {type: "union", variants: variants.map(project)};
    }
    if (Array.isArray(s.type)) return {type: "union", variants: s.type.map(type => project({...s, type}))};
    const type = s.type;
    // JSON Schema represents a numeric literal as number even when it is an integer.
    if (type === "number" && Number.isSafeInteger(s.const)) return {type: "integer"};
    if (type === "null" || type === "boolean" || type === "integer") return {type};
    if (type === "string") {
      const values = s.enum ?? (typeof s.const === "string" ? [s.const] : undefined);
      if (values !== undefined) {
        if (!Array.isArray(values) || !values.length || values.some(v => typeof v !== "string" || !v.length)) throw new Error("method_json_schema_string_enum_required");
        return {type: "enum", values: values as string[]};
      }
      if (s.format === "date") return {type: "date"};
      if (s.pattern === "^-?\\d+(?:\\.\\d+)?$") return {type: "decimal_string"};
      return {type: "string"};
    }
    if (type === "array") {
      if (!s.items || s.prefixItems) throw new Error("method_json_schema_typed_array_required");
      return {type: "array", items: project(s.items)};
    }
    if (type === "object") {
      if (s.additionalProperties && typeof s.additionalProperties === "object" && !Array.isArray(s.additionalProperties)) {
        if (s.required !== undefined && !Array.isArray(s.required)) throw new Error("method_json_schema_required_field_missing");
        if ((s.properties && Object.keys(object(s.properties)).length) || (Array.isArray(s.required) && s.required.length)) throw new Error("method_json_schema_mixed_record_unsupported");
        return {type: "map", values: project(s.additionalProperties)};
      }
      if (s.additionalProperties !== false) throw new Error("method_json_schema_closed_object_required");
      const properties = object(s.properties); const required = s.required ?? [];
      if (!Array.isArray(required) || required.some(k => typeof k !== "string" || !Object.hasOwn(properties, k))) throw new Error("method_json_schema_required_field_missing");
      return {type: "object", fields: Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, {required: required.includes(key), value: project(value)}]))};
    }
    throw new Error("method_json_schema_unsupported_or_opaque_type");
  }
  return methodDataContractSchema.parse({id, version, value: project(raw)});
}
