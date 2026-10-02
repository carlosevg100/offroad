import {describe,it,expect,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {loadInstitutionalSetupReviews,parseInstitutionalSetupReviews} from "./institutional-setup-reviews";
import {setupReviewFixture} from "./institutional-setup-reviews.fixture";
describe("initial institutional review reader",()=>{
 it("renders a real producer configuration with a null parent",()=>{const [r]=parseInstitutionalSetupReviews(setupReviewFixture());expect(r.canApprove).toBe(true);expect(r.parentFingerprint).toBeNull();expect(r.sources[0].name).toBe("Synthetic accounts");expect(r.assumptions.length).toBeGreaterThan(0);});
 it("rejects altered full configuration and malformed sources",()=>{const c=setupReviewFixture();const raw=c.configurationReviews[0] as {configuration:{currency:string};answerEvidence:{sourceBindings:unknown[]}};raw.configuration.currency="USD";expect(parseInstitutionalSetupReviews(c)).toEqual([]);const d=setupReviewFixture();(d.configurationReviews[0] as typeof raw).answerEvidence.sourceBindings=[];expect(parseInstitutionalSetupReviews(d)).toEqual([]);});
 it("retains rejection but prevents approval after source replacement",()=>{const c=setupReviewFixture();c.sourceManifestFingerprint="b".repeat(64);expect(parseInstitutionalSetupReviews(c)[0].canApprove).toBe(false);});
 it("prevents stale-parent approval and blocked calculation approval",()=>{const c=setupReviewFixture();const raw=c.configurationReviews[0] as {parentFingerprint:string|null;answerEvidence:{review:{status:string}}};raw.parentFingerprint="b".repeat(64);expect(parseInstitutionalSetupReviews(c)[0].canApprove).toBe(false);raw.parentFingerprint=null;raw.answerEvidence.review.status="blocked";expect(parseInstitutionalSetupReviews(c)[0].canApprove).toBe(false);});
 it("attaches only the current server basis to setup cards without a legacy fallback",async()=>{
  const context=setupReviewFixture();const review=parseInstitutionalSetupReviews(context)[0];
  const basis={workId:context.projectId,candidateId:review.candidateId,configurationFingerprint:review.configurationFingerprint,parentFingerprint:null,lineageFingerprint:"c".repeat(64),preparedBy:context.projectId,viewerId:context.projectId,workAccess:true,policy:{assignmentRequired:false,selfApprovalAllowed:true,roles:[]},status:review.status,sourceCount:2,nativeDecisionId:null,approvalEffective:false};
  const rpc=vi.fn().mockResolvedValue({data:basis,error:null});const client={rpc} as unknown as SupabaseClient<Database>;
  expect((await loadInstitutionalSetupReviews(client,context.projectId,context))[0].reviewBasis).toEqual(basis);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("read_institutional_configuration_review_basis_v2",{p_project_id:context.projectId,p_candidate_id:review.candidateId});
  for(const response of [{data:null,error:{code:"42501"}},{data:{...basis,configurationFingerprint:"f".repeat(64)},error:null},{data:{...basis,parentFingerprint:"f".repeat(64)},error:null},{data:{...basis,status:"approved"},error:null}]){
   rpc.mockResolvedValue(response);expect(await loadInstitutionalSetupReviews(client,context.projectId,context)).toEqual([]);
  }
  rpc.mockClear();expect(await loadInstitutionalSetupReviews(client,"10000000-0000-4000-8000-000000000099",context)).toEqual([]);expect(rpc).not.toHaveBeenCalled();
 });
});
