import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {configurationReviewAllowed,loadInstitutionalConfigurationReviewBasis,parseInstitutionalConfigurationReviewBasis,reviewInstitutionalConfiguration} from "./institutional-configuration-review-command";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
export const nativeConfigurationBasis={workId:id(1),candidateId:id(2),configurationFingerprint:"a".repeat(64),parentFingerprint:null,lineageFingerprint:"b".repeat(64),preparedBy:id(3),viewerId:id(3),workAccess:true,
 policy:{assignmentRequired:false,selfApprovalAllowed:true,roles:[]},status:"review_required" as const,sourceCount:2,nativeDecisionId:null,approvalEffective:false};
describe("native configuration review boundary",()=>{
 it("binds reader response to work and candidate and rejects unknown authority fields",()=>{
  expect(parseInstitutionalConfigurationReviewBasis(nativeConfigurationBasis,id(1),id(2))).toEqual(nativeConfigurationBasis);
  for(const patch of [{workId:id(9)},{candidateId:id(9)},{lineageFingerprint:"invalid"},{preparedBy:null},{sourceCount:-1},{organizationId:id(9)}])
   expect(parseInstitutionalConfigurationReviewBasis({...nativeConfigurationBasis,...patch},id(1),id(2))).toBeNull();
 });
 it("requires the explicit declaration by the original preparer and preserves rejection",()=>{
  expect(configurationReviewAllowed(nativeConfigurationBasis,"approved",false)).toBe(false);
  expect(configurationReviewAllowed(nativeConfigurationBasis,"approved",true)).toBe(true);
  expect(configurationReviewAllowed(nativeConfigurationBasis,"rejected",false)).toBe(true);
  expect(configurationReviewAllowed({...nativeConfigurationBasis,policy:{...nativeConfigurationBasis.policy,selfApprovalAllowed:false}},"approved",true)).toBe(false);
 });
 it("requires current work or assigned role and does not invent authority from approval status",()=>{
  expect(configurationReviewAllowed({...nativeConfigurationBasis,workAccess:false},"approved",true)).toBe(false);
  const assigned={...nativeConfigurationBasis,preparedBy:id(4),workAccess:false,policy:{assignmentRequired:true,selfApprovalAllowed:false,roles:["reviewer" as const]}};
  expect(configurationReviewAllowed(assigned,"approved",false)).toBe(false);
  expect(configurationReviewAllowed(assigned,"rejected",false)).toBe(true);
  expect(configurationReviewAllowed({...assigned,policy:{...assigned.policy,roles:["approver"]}},"approved",false)).toBe(true);
  expect(configurationReviewAllowed({...nativeConfigurationBasis,status:"approved",approvalEffective:false},"approved",true)).toBe(false);
 });
 it("reads only the v2 basis and never falls back after denied or malformed response",async()=>{
  const rpc=vi.fn().mockResolvedValue({data:nativeConfigurationBasis,error:null});const client={rpc} as unknown as SupabaseClient<Database>;
  expect(await loadInstitutionalConfigurationReviewBasis(client,id(1),id(2))).toEqual(nativeConfigurationBasis);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("read_institutional_configuration_review_basis_v2",{p_project_id:id(1),p_candidate_id:id(2)});
  rpc.mockResolvedValue({data:null,error:{code:"42501",message:"denied"}});
  expect(await loadInstitutionalConfigurationReviewBasis(client,id(1),id(2))).toBeNull();expect(rpc).toHaveBeenCalledTimes(2);
 });
 it("sends the exact v2 command with false declaration intact and no second queue call",async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{status:"rejected"},error:null});const client={rpc} as unknown as SupabaseClient<Database>;
  const args={p_project_id:id(1),p_candidate_id:id(2),p_expected_parent_fingerprint:null,p_expected_candidate_fingerprint:"a".repeat(64),p_expected_lineage_fingerprint:"b".repeat(64),p_decision:"rejected" as const,p_command_id:id(5),p_locale:"en-US" as const,p_self_approval_declared:false};
  await reviewInstitutionalConfiguration(client,args);expect(rpc).toHaveBeenCalledExactlyOnceWith("review_institutional_configuration_and_calculate_v2",args);
 });
});
