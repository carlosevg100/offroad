import {describe, expect, it} from "vitest";
import {componentIdSchema, methodDataContractSchema, methodValueTypeSchema} from "./method-component";
import {matchesMethodValue} from "./compose-method";
import {methodContentHash} from "./procedure-compiler";

const string = {type: "string"};
const nullable = {type: "union", variants: [{type: "decimal_string"}, {type: "null"}]};
const field = (value: unknown, required = true) => ({required, value});
const object = (fields: Record<string, unknown>) => ({type: "object", fields});

describe("typed method contract variants", () => {
  it("validates null and omission independently for composed parameters", () => {
    const required = methodValueTypeSchema.parse(object({amount: field(nullable)}));
    const optional = methodValueTypeSchema.parse(object({amount: field({type: "decimal_string"}, false)}));
    expect(matchesMethodValue(required, {amount: null})).toBe(true);
    expect(matchesMethodValue(required, {amount: "0"})).toBe(true);
    expect(matchesMethodValue(required, {})).toBe(false);
    expect(matchesMethodValue(required, {amount: undefined})).toBe(false);
    expect(matchesMethodValue(optional, {})).toBe(true);
    expect(matchesMethodValue(optional, {amount: null})).toBe(false);
  });
  it("refuses mixed branches and extra fields in composed parameter values", () => {
    const contract = methodValueTypeSchema.parse({type: "union", variants: [
      object({kind: field({type: "enum", values: ["amount"]}), amount: field({type: "decimal_string"})}),
      object({kind: field({type: "enum", values: ["drivers"]}), quantity: field({type: "decimal_string"})}),
    ]});
    expect(matchesMethodValue(contract, {kind: "amount", amount: "10"})).toBe(true);
    expect(matchesMethodValue(contract, {kind: "drivers", quantity: "2"})).toBe(true);
    expect(matchesMethodValue(contract, {kind: "amount", quantity: "2"})).toBe(false);
    expect(matchesMethodValue(contract, {kind: "amount", amount: "10", quantity: "2"})).toBe(false);
    expect(matchesMethodValue(contract, null)).toBe(false);
  });
  it("preserves a required nullable amount separately from an optional amount", () => {
    const required = methodValueTypeSchema.parse(object({id: field(string), amount: field(nullable)}));
    const optional = methodValueTypeSchema.parse(object({id: field(string), amount: field(nullable, false)}));
    expect(required).toEqual(object({id: field(string), amount: field(nullable)}));
    expect(methodContentHash(required)).not.toBe(methodContentHash(optional));
    expect(methodContentHash(required)).not.toBe(methodContentHash(object({id: field(string), amount: field({type: "decimal_string"})})));
  });
  it("describes revenue amount or quantity times unit price without an opaque payload", () => {
    const value = {type: "union", variants: [
      object({kind: field({type: "enum", values: ["amount"]}), amount: field({type: "decimal_string"})}),
      object({kind: field({type: "enum", values: ["drivers"]}), quantity: field({type: "decimal_string"}), netUnitPrice: field({type: "decimal_string"})}),
    ]};
    expect(methodValueTypeSchema.parse({type: "array", items: value})).toEqual({type: "array", items: value});
  });
  it("refuses incomplete variants, opaque values and undeclared properties recursively", () => {
    for (const variants of [[], [string], [string, {type: "object", fields: {}}], [string, {type: "array"}], [string, {type: "any"}], [string, {type: "null", default: null}]]) {
      expect(methodValueTypeSchema.safeParse({type: "union", variants}).success).toBe(false);
    }
  });
  it("rejects duplicate variants despite field or enumeration order", () => {
    for (const variants of [
      [string, string],
      [object({id: field(string), amount: field(nullable)}), object({amount: field(nullable), id: field(string)})],
      [{type: "enum", values: ["a", "b"]}, {type: "enum", values: ["b", "a"]}],
      [nullable, {type: "union", variants: [{type: "null"}, {type: "decimal_string"}]}],
    ]) expect(methodValueTypeSchema.safeParse({type: "union", variants}).success).toBe(false);
  });
  it("accepts data field id while retaining component identity validation", () => {
    expect(methodValueTypeSchema.safeParse(object({id: field(string), asOf: field({type: "date"})})).success).toBe(true);
    expect(componentIdSchema.safeParse("id").success).toBe(false);
    expect(methodDataContractSchema.safeParse({id: "id", version: "2026.09.20-v1", value: string}).success).toBe(false);
  });
  it("rejects unsafe data field names rather than normalizing executor data", () => {
    for (const key of ["__proto__", "prototype", "constructor", "", "id/path", "id\nvalue"])
      expect(methodValueTypeSchema.safeParse(object(Object.fromEntries([[key, field(string)]]))).success).toBe(false);
  });
  it("keeps legacy contracts byte-equivalent after parsing and changes hashes for variants", () => {
    const legacy = {id: "legacy.input", version: "2026.09.18-v1", value: object({amount: field({type: "decimal_string"})})};
    expect(methodDataContractSchema.parse(legacy)).toEqual(legacy);
    expect(methodContentHash(methodDataContractSchema.parse(legacy))).toBe(methodContentHash(legacy));
    expect(methodContentHash({...legacy, value: object({amount: field(nullable)})})).not.toBe(methodContentHash(legacy));
  });
});
