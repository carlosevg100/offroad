import {describe, expect, it} from "vitest";
import {z} from "zod";
import {methodDataContractFromJsonSchema} from "./method-data-contract";
import {methodValueTypeSchema} from "./method-component";
import {matchesMethodValue} from "./compose-method";
const project = (s: unknown) => methodDataContractFromJsonSchema("capital.synthetic-map", "2026.09.20-v1", s).value;
describe("typed method dictionaries", () => {
  it("projects a dated curve with typed values from its actual schema", () => {
    const schema = z.record(z.string().regex(/^\d{4}-\d{2}$/), z.string().regex(/^-?\d+(?:\.\d+)?$/));
    const type = project(z.toJSONSchema(schema)); expect(type).toEqual({type: "map", values: {type: "decimal_string"}});
    expect(matchesMethodValue(type, {"2026-09": "0.004"})).toBe(true);
    expect(matchesMethodValue(type, {"2026-09": 0.004})).toBe(false);
  });
  it("validates nested record values without accepting extra object fields", () => {
    const type = project(z.toJSONSchema(z.record(z.string(), z.strictObject({count: z.number().int(), value: z.string().nullable()}))));
    expect(matchesMethodValue(type, {period: {count: 1, value: null}})).toBe(true);
    expect(matchesMethodValue(type, {period: {count: 1, value: null, grantsExecution: true}})).toBe(false);
    expect(matchesMethodValue(type, {period: {count: 1}})).toBe(false);
  });
  it("refuses prototype keys exotic objects arrays and empty property names", () => {
    const type = methodValueTypeSchema.parse({type: "map", values: {type: "string"}});
    for (const value of [JSON.parse('{"__proto__":"x"}'), {constructor: "x"}, {prototype: "x"}, {"": "x"}, [], new Date(), Object.create({inherited: "x"})]) expect(matchesMethodValue(type, value)).toBe(false);
    expect(matchesMethodValue(type, Object.assign(Object.create(null), {safe: "x"}))).toBe(true);
  });
  it("rejects opaque untyped and mixed fixed-plus-dynamic contracts", () => {
    for (const s of [{type: "object", additionalProperties: true}, {type: "object", additionalProperties: {}},
      {type: "object", properties: {id: {type: "string"}}, additionalProperties: {type: "string"}}]) expect(() => project(s)).toThrow();
    expect(() => methodValueTypeSchema.parse({type: "map"})).toThrow();
  });
  it("canonicalizes nested map variants when rejecting duplicate unions", () => {
    const value = {type: "map", values: {type: "object", fields: {b: {required: false, value: {type: "string"}}, a: {required: true, value: {type: "integer"}}}}};
    const other = structuredClone(value); other.values.fields = {a: other.values.fields.a, b: other.values.fields.b};
    expect(() => methodValueTypeSchema.parse({type: "union", variants: [value, other]})).toThrow("duplicate union variant");
  });
  it("keeps key format enforcement in the pinned runtime schema", () => {
    const schema = z.record(z.string().regex(/^\d{4}-\d{2}$/), z.string()); const type = project(z.toJSONSchema(schema));
    expect(matchesMethodValue(type, {not_a_month: "0"})).toBe(true);
    expect(schema.safeParse({not_a_month: "0"}).success).toBe(false);
  });
});
