import {describe,expect,it} from "vitest";

import {pricingProcedureRegistry,pricingProcedures} from "./pricing";

describe("M6 pricing procedures",()=>{
  it("compiles exactly PR-01 through PR-13 as deterministic candidates",()=>{
    expect(pricingProcedures).toHaveLength(13);
    expect(pricingProcedures.map((procedure)=>procedure.knowledge.houseProcedureIds[0])).toEqual(Array.from({length:13},(_,index)=>`PR-${String(index+1).padStart(2,"0")}`));
    for(const procedure of pricingProcedures){
      expect(procedure.maturity).toBe("candidate");
      expect(procedure.runtime).toMatchObject({orchestration:"deterministic_pipeline",peerHandoffs:false,maxModelCalls:0});
      expect(procedure.stopConditions.length).toBeGreaterThan(0);
      expect(procedure.knowledge.referenceDataKeys.length).toBeGreaterThan(0);
    }
    expect(pricingProcedureRegistry.skills).toHaveLength(13);
  });
});
