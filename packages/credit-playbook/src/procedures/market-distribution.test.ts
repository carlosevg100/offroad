import {describe,expect,it} from "vitest";
import {marketDistributionProcedureRegistry,marketDistributionProcedures} from "./market-distribution";

describe("M8 market and qualified-distribution procedures",()=>{
  it("compiles only MK-01 through MK-18 and keeps the post-introduction reference out of runtime",()=>{
    expect(marketDistributionProcedures).toHaveLength(18);
    expect(marketDistributionProcedures.map((procedure)=>procedure.knowledge.houseProcedureIds[0])).toEqual(Array.from({length:18},(_,index)=>`MK-${String(index+1).padStart(2,"0")}`));
    expect(marketDistributionProcedureRegistry.skills).toHaveLength(18);
    for(const procedure of marketDistributionProcedures){
      expect(procedure.runtime).toMatchObject({orchestration:"deterministic_pipeline",peerHandoffs:false,maxModelCalls:0});
      expect(procedure.stopConditions).toContain("Atividade posterior à introdução qualificada");
    }
  });

  it("keeps each procedure operationally specific",()=>{
    const methods=marketDistributionProcedures.map((procedure)=>procedure.procedure.find((step)=>step.id==="execute")?.instructions.join("|")??"");
    const verifications=marketDistributionProcedures.map((procedure)=>procedure.procedure.find((step)=>step.id==="verify")?.instructions.join("|")??"");
    expect(new Set(methods)).toHaveLength(18);
    expect(new Set(verifications)).toHaveLength(18);
  });
});

