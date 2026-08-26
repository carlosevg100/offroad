import {describe, expect, it} from "vitest";
import {materialProcedureRegistry, materialProcedures} from "./materials";

describe("governed M7 material procedures", () => {
  it("compiles every MA procedure exactly once from the canonical source", () => {
    expect(materialProcedures).toHaveLength(32);
    expect(materialProcedures.flatMap((procedure)=>procedure.knowledge.houseProcedureIds)).toEqual(
      Array.from({length:32},(_,index)=>`MA-${String(index+1).padStart(2,"0")}`),
    );
    expect(materialProcedureRegistry.skills).toHaveLength(32);
  });

  it("keeps materials deterministic and release fail-closed", () => {
    for (const procedure of materialProcedures) {
      expect(procedure.runtime).toMatchObject({orchestration:"deterministic_pipeline",peerHandoffs:false,maxModelCalls:0});
      expect(procedure.evidence.materialClaimsRequireSupport).toBe(true);
      expect(procedure.stopConditions).toContain("Autorização ausente para saída externa");
      expect(procedure.procedure.find((step) => step.id === "compile")?.instructions).toHaveLength(2);
      expect(procedure.procedure.find((step) => step.id === "verify")?.instructions).toHaveLength(2);
    }

    expect(new Set(materialProcedures.flatMap((procedure) => procedure.templates))).toEqual(
      new Set(["institutional-teaser", "institutional-credit-memo", "indicative-term-sheet", "institutional-data-room-index"]),
    );
  });

  it("compiles a procedure-specific method instead of one generic material checklist", () => {
    const methods = materialProcedures.map((procedure) =>
      procedure.procedure.find((step) => step.id === "compile")?.instructions.join("|") ?? "",
    );
    const verifications = materialProcedures.map((procedure) =>
      procedure.procedure.find((step) => step.id === "verify")?.instructions.join("|") ?? "",
    );
    expect(new Set(methods)).toHaveLength(32);
    expect(new Set(verifications)).toHaveLength(32);
  });
});
