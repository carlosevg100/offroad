import {describe, expect, it} from "vitest";
import {capitalProjectPlanSnapshot, compileCapitalExecutionBrief, visibleExecutionBrief} from "@offroad/work-plan";
import {loadIntakeExecutionApproval} from "./execution-approval";
import type {IntakeSession} from "./types";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const session = {id:id(1), organization_id:id(2), capital_project_id:id(3), current_run_id:id(4)} as IntakeSession;
function client(jobs: unknown[], brief: unknown = null, approval: unknown = null, error: unknown = null) {
  function query(result: unknown) {
    const q: Record<string, unknown> = {};
    for (const key of ["select", "eq", "in", "order", "limit", "maybeSingle"]) q[key] = () => q;
    q.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
    return q;
  }
  return {from: (table: string) => query(table === "processing_jobs" ? {data:jobs,error} : {data:brief}), rpc: async()=>({data:approval})} as unknown as Parameters<typeof loadIntakeExecutionApproval>[0];
}
const visible = visibleExecutionBrief(compileCapitalExecutionBrief({plan:capitalProjectPlanSnapshot("structure_from_documents"),locale:"pt-BR",objective:"Revisar dívida",companyLabel:"Companhia",audienceLabel:"CFO",proposedDeliverable:"Diagnóstico",sources:[{key:"project",label:"Contexto do projeto",role:"project_context",status:"available",informationClass:"private",authorized:true},{key:"documents",label:"Documentos do caso",role:"provided_documents",status:"to_request",informationClass:"private",authorized:true}],authority:{evidenceRegime:"private",executionAuthority:"analysis_only",establishedBy:"system_policy"},expensiveWork:true}));
const row = {id:id(5),brief_version:1,visible_snapshot:visible};
const approval = {status:"proposed",reason:"approval_required",execution_brief_id:row.id,brief_fingerprint:visible.fingerprint,processing_job_id:id(6),accepted_at:null};

describe("intake execution approval continuity",()=>{
  it("requires current approval even when the substantive worker job succeeded",async()=>{
    expect(await loadIntakeExecutionApproval(client([{id:id(6),kind:"case_analysis",status:"succeeded"}]),session)).toMatchObject({blockReview:true});
    expect(await loadIntakeExecutionApproval(client([]),session)).toBeNull();
  });
  it("renders the exact current held job's authoritative approval without polling idle consent",async()=>{
    const state=await loadIntakeExecutionApproval(client([{id:id(6),kind:"case_analysis",status:"awaiting_approval"}],row,approval),session);
    expect(state).toMatchObject({blockReview:true,pending:true,active:false,planning:false,brief:{id:row.id,approval:{status:"awaiting"}}});
  });
  it("does not reuse an earlier dispatch agreement while a new plan is being prepared",async()=>{
    const state=await loadIntakeExecutionApproval(client([{id:id(7),kind:"case_analysis",status:"awaiting_approval"},{id:id(8),kind:"execution_brief_proposal",status:"leased",processing_run_id:session.current_run_id}],row,approval),session);
    expect(state).toMatchObject({blockReview:true,active:true,planning:true,brief:null});
  });
  it("keeps a new current-run request awaiting its own proposal even if older approved inputs are unchanged",async()=>{
    const state=await loadIntakeExecutionApproval(client([{id:id(6),kind:"case_analysis",status:"succeeded",processing_run_id:id(9)}, {id:id(7),kind:"case_analysis",status:"awaiting_approval",processing_run_id:session.current_run_id}],row,{...approval,status:"approved",reason:"approved",accepted_at:"2026-09-08T00:00:00Z"}),session);
    expect(state).toMatchObject({blockReview:true,brief:null});
  });
  it("leaves collection and reanalysis available after reviewed inputs invalidate a completed result",async()=>{
    const state=await loadIntakeExecutionApproval(client([{id:id(6),kind:"case_analysis",status:"succeeded"}],row,{...approval,status:"superseded",reason:"context_changed",accepted_at:"2026-09-08T00:00:00Z"}),session);
    expect(state).toMatchObject({blockReview:true,pending:false,active:false,brief:{approval:{status:"superseded"}}});
  });
  it("returns naturally to review after substantive completion and fails closed on unavailable job state",async()=>{
    expect(await loadIntakeExecutionApproval(client([{id:id(6),kind:"case_analysis",status:"succeeded"}],row,{...approval,status:"approved",reason:"approved",accepted_at:"2026-09-08T00:00:00Z"}),session)).toBeNull();
    expect(await loadIntakeExecutionApproval(client([],null,null,{message:"unavailable"}),session)).toMatchObject({blockReview:true,pending:true,active:false,brief:null});
  });
});
