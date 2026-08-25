import {describe, expect, it} from "vitest";

import {operationProcedureRegistry, operationProcedures} from "./operation";

describe("M4 compiled procedures", () => {
  it("compiles OP-01 through OP-14 as deterministic candidates", () => {
    expect(operationProcedures).toHaveLength(14);
    expect(operationProcedures.map((procedure) => procedure.knowledge.houseProcedureIds[0])).toEqual(Array.from({length: 14}, (_, index) => `OP-${String(index + 1).padStart(2, "0")}`));
    for (const procedure of operationProcedures) {
      expect(procedure.maturity).toBe("candidate");
      expect(procedure.role).toBe("credit_structuring");
      expect(procedure.runtime).toMatchObject({orchestration: "deterministic_pipeline", peerHandoffs: false, maxModelCalls: 0});
    }
    expect(operationProcedureRegistry.skills).toHaveLength(14);
  });
});
