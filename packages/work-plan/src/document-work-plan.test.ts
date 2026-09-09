import {describe,it,expect} from "vitest";
import {assertTaskPromotable} from "./task-registry";
import {documentWorkPlanSnapshot,compileDocumentWorkBrief,isDocumentWorkBrief} from "./document-work-plan";
describe("bounded documentary plan",()=>{
  it("is dependency-closed, approved and distinct from financial tasks",()=>{
    const plan=documentWorkPlanSnapshot("structure_from_documents");
    expect(plan.job.targetTaskIds).toEqual(["Q03"]);
    expect(plan.taskSpecs.map(task=>task.id)).toEqual(["Q01","Q02","Q03"]);
    expect(plan.registryVersion).toBe("2026.09.09-v7");
    for (const task of plan.taskSpecs) {
      expect(task.maturity).toBe("specified");
      expect(task.procedure).toEqual({id:"documentary-work-pipeline",version:"2026.09.09-v4"});
      expect(() => assertTaskPromotable(task,"production",() => ({maturity:"candidate",hasImplementation:false}))).toThrow();
    }
    for(const locale of ["pt-BR","en-US"] as const){
      const brief=compileDocumentWorkBrief({job:"comparison",plan,revisionContext:"dispatch",locale,objective:"Compare documents",sources:[{key:"project",label:"Request",role:"project_context",status:"available",informationClass:"private",authorized:true},{key:"doc",label:"Document",role:"provided_documents",status:"available",informationClass:"private",authorized:true}]});
      expect(isDocumentWorkBrief(brief)).toBe(true);
      expect(brief.executionMode).toBe("confirm_before_expensive_work");
      expect(brief.workstreams).toHaveLength(3);
      expect(isDocumentWorkBrief({...brief,workstreams:[...brief.workstreams,{sourceTaskIds:["C03"]}]})).toBe(false);
      expect(isDocumentWorkBrief({...brief,planVersion:"legacy"})).toBe(false);
    }
  });
});
