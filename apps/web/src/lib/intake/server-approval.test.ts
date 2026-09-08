import {describe, expect, it, vi} from "vitest";
import {capitalProjectPlanSnapshot, compileCapitalExecutionBrief, visibleExecutionBrief} from "@offroad/work-plan";
vi.mock("next-intl/server",()=>({getTranslations:vi.fn()}));
vi.mock("./reconcile",()=>({reconcileIntakeSession:vi.fn().mockResolvedValue({ok:true})}));
import {reconcileIntakeSession} from "./reconcile";
import {loadIntakeReview} from "./server";

const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const visible=visibleExecutionBrief(compileCapitalExecutionBrief({plan:capitalProjectPlanSnapshot("structure_from_documents"),locale:"pt-BR",objective:"Revisar dívida",companyLabel:"Companhia",audienceLabel:"CFO",proposedDeliverable:"Diagnóstico",sources:[{key:"project",label:"Contexto",role:"project_context",status:"available",informationClass:"private",authorized:true},{key:"documents",label:"Documentos",role:"provided_documents",status:"to_request",informationClass:"private",authorized:true}],authority:{evidenceRegime:"private",executionAuthority:"analysis_only",establishedBy:"system_policy"},expensiveWork:true}));
function runtime(status: string, approvalStatus="proposed", obsoleteHeld=false) {
  // The current run contains only a conversational edit/status job; execution is historical.
  const session={id:id(1),organization_id:id(2),capital_project_id:id(3),status:"review_ready",current_run_id:id(4),result_summary:{}};
  const approval={status:approvalStatus,reason:approvalStatus==="approved"?"approved":approvalStatus==="superseded"?"context_changed":"approval_required",execution_brief_id:id(5),brief_fingerprint:visible.fingerprint,processing_job_id:id(6),accepted_at:approvalStatus==="proposed"?null:"2026-09-08T00:00:00Z"};
  const rpc=vi.fn().mockImplementation(async(name:string)=>({data:name==="read_advisor_execution_brief_approval_v1"?approval:null}));
  function query(table: string) {
    const jobs=[{id:id(6),kind:"case_analysis",status,processing_run_id:id(7)},...(obsoleteHeld?[{id:id(8),kind:"case_analysis",status:"awaiting_approval",processing_run_id:id(9)}]:[])];
    const result={data:table==="document_intake_sessions" ? session : table==="processing_jobs" ? jobs : table==="capital_project_execution_briefs"?{id:id(5),brief_version:1,visible_snapshot:visible}:[]};
    const q: Record<string,unknown>={};
    for(const key of ["select","eq","is","in","order","limit","maybeSingle"]) q[key]=()=>q;
    q.then=(resolve:(value:unknown)=>void)=>Promise.resolve(result).then(resolve);
    return q;
  }
  return {supabase:{from:query,rpc},organizationId:id(2),sessionId:id(1),userId:id(10),locale:"pt-BR"} as unknown as Parameters<typeof loadIntakeReview>[0];
}
describe("lazy intake reconciliation approval boundary",()=>{
  it("does not reconcile an edit-only current run when the prior execution remains unapproved",async()=>{
    vi.mocked(reconcileIntakeSession).mockClear();
    const input=runtime("awaiting_approval");
    await loadIntakeReview(input);
    expect(reconcileIntakeSession).not.toHaveBeenCalled();
    expect(input.supabase.rpc).not.toHaveBeenCalledWith("record_intake_analysis",expect.anything());
  });
  it("supports harmless chat after current approved success despite obsolete held jobs",async()=>{
    vi.mocked(reconcileIntakeSession).mockClear();
    const input=runtime("succeeded","approved",true);
    await loadIntakeReview(input);
    expect(reconcileIntakeSession).toHaveBeenCalledOnce();
    expect(input.supabase.rpc).toHaveBeenCalledWith("record_intake_analysis",expect.anything());
  });
  it("does not recompute a completed result after reviewed inputs stale its approval",async()=>{
    vi.mocked(reconcileIntakeSession).mockClear();
    const input=runtime("succeeded","superseded");
    await loadIntakeReview(input);
    expect(reconcileIntakeSession).not.toHaveBeenCalled();
    expect(input.supabase.rpc).not.toHaveBeenCalledWith("record_intake_analysis",expect.anything());
  });
});
