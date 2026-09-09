import {describe, expect, it} from "vitest";
import {economicContextSchema, economicContextCompileRequestSchema, type EconomicContext} from "./economic-context";

function example(): EconomicContext {
  return {schemaVersion: "economic-context.v1", asOf: "2026-09-08", objects: [
    {id: "group", type: "group", attributes: []},
    {id: "asset", type: "asset", parentObjectId: "group", attributes: [{dimension: "revenue_model", value: "contracted", status: "confirmed", evidenceRefs: [{sourceId: "contract", sourceVersion: "2", anchor: "clause 4.2"}], period: {start: "2027-01-01", end: "2030-12-31"}}]},
  ]};
}

describe("economic context v1", () => {
  it("preserves future periods, versioned evidence and coexisting economic attributes", () => {
    const value = example();
    const attributes = value.objects[1]!.attributes;
    attributes.push({...attributes[0]!, value: "merchant", status: "proposed"});
    attributes.push({...attributes[0]!, period: {start: "2031-01-01", end: "2032-12-31"}});
    expect(economicContextSchema.parse(value)).toEqual(value);
  });
  it.each(["segment", "business_unit", "project"] as const)("preserves an explicit %s perimeter without inheriting parent facts", (type) => {
    const value = example(); value.objects[1]!.type = type;
    expect(economicContextSchema.parse(value).objects[1]).toEqual(value.objects[1]);
  });
  it("accepts bounded business descriptions beyond catalog identifiers", () => {
    const value = example(); const attribute = value.objects[1]!.attributes[0]!;
    attribute.dimension = "business_model";
    attribute.value = "x".repeat(500);
    expect(economicContextSchema.safeParse(value).success).toBe(true);
    attribute.value += "x";
    expect(economicContextSchema.safeParse(value).success).toBe(false);
    attribute.value = " ";
    expect(economicContextSchema.safeParse(value).success).toBe(false);
  });
  it.each(["cost_model", "working_capital", "asset_model", "capital_expenditure", "regulation", "operating_driver"] as const)("preserves %s declarations with evidence and review state", (dimension) => {
    const value = example(); const attribute = value.objects[1]!.attributes[0]!;
    attribute.dimension = dimension;
    attribute.value = "synthetic-business-specific-description";
    expect(economicContextSchema.parse(value)).toEqual(value);
    attribute.evidenceRefs = [];
    expect(economicContextSchema.safeParse(value).success).toBe(false);
    attribute.status = "inferred";
    expect(economicContextSchema.safeParse(value).success).toBe(true);
  });
  it("requires confirmed evidence and does not give unknown values activation meaning", () => {
    const value = example(); const attribute = value.objects[1]!.attributes[0]!;
    attribute.evidenceRefs = [];
    expect(economicContextSchema.safeParse(value).success).toBe(false);
    attribute.status = "unknown";
    expect(economicContextSchema.safeParse(value).success).toBe(false);
    attribute.value = null;
    expect(economicContextSchema.safeParse(value).success).toBe(true);
  });
  it.each(["2026-02-30", "2025-02-29", "not-a-date"])("rejects invalid date %s", (date) => {
    const value = example(); value.asOf = date;
    expect(economicContextSchema.safeParse(value).success).toBe(false);
  });
  it("rejects reversed periods and accepts leap-day periods", () => {
    const value = example(); const attribute = value.objects[1]!.attributes[0]!;
    attribute.period = {start: "2028-03-01", end: "2028-02-29"};
    expect(economicContextSchema.safeParse(value).success).toBe(false);
    attribute.period.start = "2028-02-29";
    expect(economicContextSchema.safeParse(value).success).toBe(true);
  });
  it.each(["duplicate_object", "unknown_parent", "self_cycle", "cycle", "duplicate_attribute", "duplicate_evidence"])("rejects %s", (kind) => {
    const value = example();
    if (kind === "duplicate_object") value.objects.push(structuredClone(value.objects[0]!));
    if (kind === "unknown_parent") value.objects[1]!.parentObjectId = "absent";
    if (kind === "self_cycle") value.objects[1]!.parentObjectId = "asset";
    if (kind === "cycle") value.objects[0]!.parentObjectId = "asset";
    if (kind === "duplicate_attribute") value.objects[1]!.attributes.push({...value.objects[1]!.attributes[0]!, status: "conflicting"});
    if (kind === "duplicate_evidence") value.objects[1]!.attributes[0]!.evidenceRefs.push({...value.objects[1]!.attributes[0]!.evidenceRefs[0]!});
    expect(economicContextSchema.safeParse(value).success).toBe(false);
  });
  it("validates explicit targets and intent without profile or inheritance", () => {
    const request = {schemaVersion: "economic-context-compile-request.v1", context: example(), intent: "factual_answer", targetObjectIds: ["asset"]};
    expect(economicContextCompileRequestSchema.safeParse(request).success).toBe(true);
    expect(economicContextCompileRequestSchema.safeParse({...request, targetObjectIds: ["asset", "asset"]}).success).toBe(false);
    expect(economicContextCompileRequestSchema.safeParse({...request, targetObjectIds: ["absent"]}).success).toBe(false);
    expect(economicContextCompileRequestSchema.safeParse({...request, role: "CFO"}).success).toBe(false);
    expect(economicContextCompileRequestSchema.safeParse({...request, intent: "arbitrary"}).success).toBe(false);
  });
  it("rejects unknown properties and oversized values", () => {
    expect(economicContextSchema.safeParse({...example(), activateAll: true}).success).toBe(false);
    const value = example(); value.objects[1]!.attributes[0]!.value = "x".repeat(501);
    expect(economicContextSchema.safeParse(value).success).toBe(false);
  });
  it.each(["attributes", "references", "anchors"] as const)("rejects aggregate %s excess with individually valid entries", (kind) => {
    const value = example();
    const template = value.objects[1]!.attributes[0]!;
    const count = kind === "attributes" ? 501 : kind === "references" ? 41 : 3;
    value.objects = Array.from({length: Math.ceil(count / 100)}, (_, group) => ({
      id: `object-${group}`, type: "asset" as const,
      attributes: Array.from({length: Math.min(100, count - group * 100)}, (_, index) => ({
        ...template, value: `value-${index}`,
        evidenceRefs: Array.from({length: kind === "attributes" ? 1 : 50}, (_, reference) => ({
          sourceId: `source-${reference}`, sourceVersion: "1", anchor: kind === "anchors" ? "x".repeat(2_000) : "clause 1",
        })),
      })),
    }));
    const parsed = economicContextSchema.safeParse(value);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.map((issue) => issue.message)).toContain(kind === "attributes" ? "Context exceeds 500 attributes." : kind === "references" ? "Context exceeds 2000 evidence references." : "Context exceeds 200000 anchor characters.");
  });

});
