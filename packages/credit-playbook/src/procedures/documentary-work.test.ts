import {describe, expect, it} from "vitest";
import {documentaryWorkProcedures, documentaryWorkProcedureRegistry, documentaryWorkTaskIds, documentWorkProductSystemInstructions, documentWorkProductRepairInstructions} from "./documentary-work";
describe("canonical documentary procedures", () => {
  it("registers one shared candidate pipeline with three sequential stages", () => {
    expect(documentaryWorkTaskIds).toEqual(["Q01","Q02","Q03"]);
    expect(documentaryWorkProcedureRegistry.skills).toHaveLength(1);
    for (const procedure of documentaryWorkProcedures) {
      expect(procedure.procedure.find(step => step.id === "repair")?.instructions.join("\n")).toBe(documentWorkProductRepairInstructions);
      expect(procedure.maturity).toBe("candidate");
      expect(procedure.runtime.maxModelCalls).toBe(2);
      expect(procedure.knowledge.houseProcedureIds).not.toContain("Q-01");
      expect(procedure.procedure.find(step => step.id === "read")?.instructions.join("\n")).toBe(documentWorkProductSystemInstructions);
    }
  });
  it("keeps financial math outside the documentary instruction and requires complete evidence", () => {
    expect(documentWorkProductSystemInstructions).toContain("Do not calculate");
    expect(documentWorkProductSystemInstructions).toContain("must equal one of its cited quotes exactly");
    expect(documentWorkProductSystemInstructions).toContain("complete passage");
    expect(documentWorkProductSystemInstructions).toContain("hypotheses");
  });
});
