import {readFileSync,readdirSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {assertTaskPromotable} from "./task-registry";
import {documentWorkPlanSnapshot,compileDocumentWorkBrief,isDocumentWorkBrief} from "./document-work-plan";
describe("bounded documentary plan",()=>{
  it("keeps database admission and SQL regression fixtures equal to the actual compiler",()=>{
    const directory=new URL("../../../supabase/migrations/",import.meta.url);
    const file=readdirSync(directory).find(name=>name.endsWith("_documentary_field_assessments_contract.sql"));
    expect(file).toBeDefined();
    const contracts=Object.fromEntries((["structure_from_documents","review_existing_operation"] as const).map(entry=>[entry,documentWorkPlanSnapshot(entry)]));
    // The historical release admitted two entries. The new six-entry fixture is checked
    // against its additive migration in document-work-revision-contract.test.ts.
    for (const path of [new URL(file!,directory)]) {
      const sql=readFileSync(path,"utf8");
      const serialized=sql.split("$documentary_contract$")[1];
      expect(serialized).toBeDefined();
      expect(JSON.parse(serialized!)).toEqual(contracts);
    }
  });
  it("is dependency-closed, approved and distinct from financial tasks",()=>{
    const plan=documentWorkPlanSnapshot("structure_from_documents");
    expect(plan.job.targetTaskIds).toEqual(["Q03"]);
    expect(plan.taskSpecs.map(task=>task.id)).toEqual(["Q01","Q02","Q03"]);
    expect(plan.registryVersion).toBe("2026.09.10-v15");
    for (const task of plan.taskSpecs) {
      expect(task.maturity).toBe("specified");
      expect(task.procedure).toEqual({id:"documentary-work-pipeline",version:"2026.09.10-v12"});
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
