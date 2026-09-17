import {describe, expect, it} from "vitest";
import {metricDefinitionVersionSchema, observationDimensionsSchema, observationValueSchema, recordObservationSchema} from "./observation";

const id = "a8880000-0000-4000-8000-000000000001";
const dimensions = {entityId: null, perimeter: null, periodStart: null, periodEnd: null, currency: null, unit: null, scale: null, scenario: null, definitionVersionId: null};
const observation = {requestId: id, dossierId: id, fieldPath: "revenue", dimensions, value: {type: "number", value: "9007199254740993.00001"}, sourceVersionId: id, anchor: {page: 2}, supersedesId: null};
describe("observations are assertions, not adoptions", () => {
  it("preserves exact decimals and explicit unknown dimensions", () => {
    expect(recordObservationSchema.parse(observation).value).toEqual(observation.value);
    expect(observationDimensionsSchema.parse(dimensions)).toEqual(dimensions);
  });
  it("refuses self-publication and missing provenance", () => {
    expect(recordObservationSchema.safeParse({...observation, official: true}).success).toBe(false);
    expect(recordObservationSchema.safeParse({...observation, anchor: {}}).success).toBe(false);
    expect(recordObservationSchema.safeParse({...observation, sourceVersionId: null, confidence: 0.99}).success).toBe(false);
  });
  it("requires typed values, positive scale and coherent periods", () => {
    for (const value of [NaN, Infinity, 1, "NaN", "Infinity"]) expect(observationValueSchema.safeParse({type: "number", value}).success).toBe(false);
    for (const scale of ["0", "-1", "NaN"]) expect(observationDimensionsSchema.safeParse({...dimensions, scale}).success).toBe(false);
    expect(observationDimensionsSchema.safeParse({...dimensions, periodStart: "2026-12-31", periodEnd: "2026-01-01"}).success).toBe(false);
  });
  it("cannot substitute a managerial definition for an unanchored covenant", () => {
    const managerial = {kind: "managerial", definition: "Management EBITDA", contractSourceVersionId: null, contractAnchor: null};
    expect(metricDefinitionVersionSchema.safeParse(managerial).success).toBe(true);
    expect(metricDefinitionVersionSchema.safeParse({...managerial, kind: "contractual"}).success).toBe(false);
    expect(metricDefinitionVersionSchema.safeParse({...managerial, kind: "contractual", contractSourceVersionId: id, contractAnchor: {clause: "7.1"}}).success).toBe(true);
  });
});
