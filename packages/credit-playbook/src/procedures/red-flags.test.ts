import {describe,expect,it} from "vitest";
import {redFlagProcedureRegistry,redFlagProcedures} from "./red-flags";

describe("M9 red-flag and mandate-decision procedures",()=>{
  it("compiles RF-01 through RF-20 as narrow deterministic skills",()=>{
    expect(redFlagProcedures).toHaveLength(20);
    expect(redFlagProcedures.map((procedure)=>procedure.knowledge.houseProcedureIds[0])).toEqual(Array.from({length:20},(_,index)=>`RF-${String(index+1).padStart(2,"0")}`));
    expect(redFlagProcedureRegistry.skills).toHaveLength(20);
    for(const procedure of redFlagProcedures) expect(procedure.runtime).toMatchObject({orchestration:"deterministic_pipeline",peerHandoffs:false,maxModelCalls:0});
  });

  it("gives every flag a detector, false-positive investigation and treatment",()=>{
    for(const procedure of redFlagProcedures){
      expect(procedure.procedure.map((step)=>step.id)).toEqual(["detect","investigate","treat","record"]);
      expect(procedure.output.fields.map((field)=>field.id)).toEqual(["status","severity","evidence_links","confirmation_questions","treatment"]);
      expect(procedure.tests.adversarial[0]).toContain("falso positivo");
    }
    expect(new Set(redFlagProcedures.map((procedure)=>procedure.decisionRules.join("|")))).toHaveLength(20);
  });

  it("keeps decline as an Offroad mandate decision rather than a credit opinion",()=>{
    const decline=redFlagProcedures.find((procedure)=>procedure.knowledge.houseProcedureIds.includes("RF-19"));
    expect(decline?.procedure.find((step)=>step.id==="record")?.instructions.join(" ")).toContain("Nunca afirmar aprovação");
    expect(decline?.stopConditions).toContain("Decisão humana necessária e pendente");
  });
});
