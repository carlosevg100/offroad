import {describe, expect, it} from "vitest";

import {structureProcedureRegistry, structureProcedures} from "./structure";

describe("M5 canonical structure procedures", () => {
  it("compiles exactly ES-01 through ES-45", () => {
    expect(structureProcedures).toHaveLength(45);
    expect(structureProcedures.flatMap((procedure) => procedure.knowledge.houseProcedureIds)).toEqual(
      Array.from({length:45},(_,index)=>`ES-${String(index+1).padStart(2,"0")}`),
    );
    expect(structureProcedureRegistry.skills).toHaveLength(45);
  });

  it("keeps roles as namespaces and model calls at zero", () => {
    for (const skill of structureProcedureRegistry.skills) {
      expect(skill.role).toBe("credit_structuring");
      expect(skill.runtime).toMatchObject({orchestration:"deterministic_pipeline",peerHandoffs:false,maxModelCalls:0});
    }
  });

  it("requires legal review only on procedures carrying LEI authority", () => {
    for (const procedure of structureProcedures) {
      if (procedure.knowledge.legalReviewRequired) expect(procedure.knowledge.authorities).toContain("LEI");
    }
  });
});
