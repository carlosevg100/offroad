import {describe, expect, it} from "vitest";
import {organizationMethodologySchema} from "./methodology";
const historical = {schemaVersion: "organization-methodology.v1", definitions: [], ebitdaAdjustments: [], thresholds: [], eligibility: [], mandateReferences: [], presentation: {language: "pt-BR", memoSections: ["Synthetic historical section"], maxPagesByOutput: {}, numberLocale: "pt-BR"}, reviewSequence: [], minimumScenarios: [], mandatoryMetrics: [], capabilitiesReference: "institution_capability_profiles", priorDecisions: [], corrections: []};
describe("historical methodology authoring", () => {
 it("reads historical content without adding financial defaults or publishing it", () => {expect(organizationMethodologySchema.parse(historical)).toEqual(historical);});
 it("rejects unknown financial definitions and embedded capability authority", () => {
  expect(() => organizationMethodologySchema.parse({...historical, definitions: [{id: "invented", parameters: {}}]})).toThrow();
  expect(() => organizationMethodologySchema.parse({...historical, capabilitiesReference: "here"})).toThrow();
 });
 it("requires a real actor identifier on historical corrections", () => {expect(() => organizationMethodologySchema.parse({...historical, corrections: [{reference: "synthetic", summary: "Synthetic correction", recordedAt: "2026-09-19T00:00:00Z", recordedBy: "nobody"}]})).toThrow();});
});
