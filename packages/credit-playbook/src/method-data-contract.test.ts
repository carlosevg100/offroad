import {describe, expect, it} from "vitest";
import {z} from "zod";
import {methodDataContractFromJsonSchema} from "./method-data-contract";
import {matchesMethodValue} from "./compose-method";
const contract = (schema: unknown) => methodDataContractFromJsonSchema("synthetic.contract", "2026.09.20-v1", schema);
describe("build-owned JSON schema contract projection", () => {
  it("projects real schema nullability optionality arrays and discriminated variants", () => {
    const schema = z.strictObject({id: z.uuid(), value: z.string().nullable(), optional: z.string().optional(),
      rows: z.array(z.discriminatedUnion("kind", [z.strictObject({kind: z.literal("amount"), amount: z.string()}), z.strictObject({kind: z.literal("none"), reason: z.string()})]))});
    const c = contract(z.toJSONSchema(schema, {reused: "inline", cycles: "throw"}));
    expect(matchesMethodValue(c.value, {id: "synthetic", value: null, rows: [{kind: "none", reason: "declared"}]})).toBe(true);
    expect(matchesMethodValue(c.value, {id: "synthetic", rows: []})).toBe(false);
    expect(matchesMethodValue(c.value, {id: "synthetic", value: null, rows: [{kind: "amount", reason: "wrong branch"}]})).toBe(false);
  });
  it("does not silently flatten references intersections or open objects", () => {
    for (const schema of [{$ref: "#/x"}, {allOf: [{type: "string"}]}, {type: "object", properties: {id: {type: "string"}}}, {type: "object", properties: {}, additionalProperties: false}]) expect(() => contract(schema)).toThrow();
  });
  it("rejects opaque numbers arrays and undeclared required fields", () => {
    for (const schema of [{}, {type: "number"}, {type: "array"}, {type: "object", properties: {id: {type: "string"}}, required: ["missing"], additionalProperties: false}]) expect(() => contract(schema)).toThrow();
  });
  it("preserves date decimal and integer structural identities", () => {
    expect(contract({type: "string", format: "date"}).value).toEqual({type: "date"});
    expect(contract({type: "string", pattern: "^-?\\d+(?:\\.\\d+)?$"}).value).toEqual({type: "decimal_string"});
    expect(contract({type: "integer"}).value).toEqual({type: "integer"});
  });
  it("distinguishes structural projection from runtime bounds and literal validation", () => {
    const schema = z.strictObject({allowed: z.literal(false), name: z.string().min(3)}); const c = contract(z.toJSONSchema(schema));
    expect(matchesMethodValue(c.value, {allowed: true, name: "x"})).toBe(true);
    expect(schema.safeParse({allowed: true, name: "x"}).success).toBe(false);
    // The full schema and executor source must be pinned alongside the structural contract.
  });
});
