import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {approveExecutionBriefReview,executionBriefReviewAllowed,loadExecutionBriefReviewBasis,parseExecutionBriefReviewBasis} from "./execution-brief-review-command";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
export const briefReviewFixture={schemaVersion:"execution-brief-review-basis.v2" as const,workId:id(1),executionBriefId:id(2),captureId:id(3),
  briefFingerprint:"a".repeat(64),payloadFingerprint:"b".repeat(64),inputFingerprint:"c".repeat(64),preparedBy:id(4),viewerId:id(4),
  workAccess:true,sourceCount:2,approvalEffective:false,policy:{assignmentRequired:false,selfApprovalAllowed:true,roles:[]}};
const expected={workId:id(1),briefId:id(2),fingerprint:"a".repeat(64)};
describe("execution brief native review",()=>{
  it("binds the projection to the exact work, brief and fingerprint and rejects invented authority",()=>{
    expect(parseExecutionBriefReviewBasis(briefReviewFixture,expected)).toEqual(briefReviewFixture);
    for(const patch of [{workId:id(9)},{executionBriefId:id(9)},{briefFingerprint:"d".repeat(64)},{captureId:null},{preparedBy:null},{sourceCount:-1},{role:"owner"}])
      expect(parseExecutionBriefReviewBasis({...briefReviewFixture,...patch},expected)).toBeNull();
  });
  it("requires an explicit self declaration and does not substitute assignment for work access",()=>{
    expect(executionBriefReviewAllowed(briefReviewFixture,false)).toBe(false);
    expect(executionBriefReviewAllowed(briefReviewFixture,true)).toBe(true);
    expect(executionBriefReviewAllowed({...briefReviewFixture,policy:{...briefReviewFixture.policy,selfApprovalAllowed:false}},true)).toBe(false);
    expect(executionBriefReviewAllowed({...briefReviewFixture,preparedBy:id(5)},false)).toBe(true);
    expect(executionBriefReviewAllowed({...briefReviewFixture,workAccess:false,policy:{assignmentRequired:true,selfApprovalAllowed:true,roles:["approver"]}},true)).toBe(false);
    expect(executionBriefReviewAllowed({...briefReviewFixture,policy:{assignmentRequired:true,selfApprovalAllowed:true,roles:["reviewer"]}},true)).toBe(false);
  });
  it("reads one native basis and fails closed without fallback on denied or malformed replies",async()=>{
    const rpc=vi.fn().mockResolvedValue({data:briefReviewFixture,error:null});const client={rpc} as unknown as SupabaseClient<Database>;
    expect(await loadExecutionBriefReviewBasis(client,expected)).toEqual(briefReviewFixture);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_execution_brief_review_basis_v2",{p_project_id:id(1),p_execution_brief_id:id(2)});
    rpc.mockResolvedValue({data:null,error:{code:"42501",message:"denied"}});
    expect(await loadExecutionBriefReviewBasis(client,expected)).toBeNull();expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("sends the exact capture and declaration in one atomic command without queueing separately",async()=>{
    const rpc=vi.fn().mockResolvedValue({data:{approved:true},error:null});const client={rpc} as unknown as SupabaseClient<Database>;
    const args={p_project_id:id(1),p_execution_brief_id:id(2),p_expected_fingerprint:expected.fingerprint,p_expected_capture_id:id(3),p_command_id:id(8),p_self_approval_declared:false};
    await approveExecutionBriefReview(client,args);expect(rpc).toHaveBeenCalledExactlyOnceWith("approve_advisor_execution_brief_v2",args);
  });
});
