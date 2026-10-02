import type {SupabaseClient} from "@supabase/supabase-js";
import {reviewRegimeSchema, reviewRoleSchema} from "@offroad/domain-contracts";
import {z} from "zod";
import type {Database} from "@/types/database";

const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const basisSchema = z.strictObject({workId:z.uuid(),candidateId:z.uuid(),configurationFingerprint:fingerprint,parentFingerprint:fingerprint.nullable(),
  lineageFingerprint:fingerprint,preparedBy:z.uuid(),viewerId:z.uuid(),workAccess:z.boolean(),policy:reviewRegimeSchema.extend({roles:z.array(reviewRoleSchema)}),
  status:z.enum(["review_required","approved","rejected"]),sourceCount:z.number().int().nonnegative(),nativeDecisionId:z.uuid().nullable(),approvalEffective:z.boolean()});
export type InstitutionalConfigurationReviewBasis = z.infer<typeof basisSchema>;
export type InstitutionalReviewCommand = {p_project_id:string;p_candidate_id:string;p_expected_parent_fingerprint:string|null;p_expected_candidate_fingerprint:string;
  p_expected_lineage_fingerprint:string;p_decision:"approved"|"rejected";p_command_id:string;p_locale:"pt-BR"|"en-US";p_self_approval_declared:boolean};
type RpcError = {message:string;code?:string}|null;
type NativeClient = {rpc(name:"read_institutional_configuration_review_basis_v2",args:{p_project_id:string;p_candidate_id:string}):PromiseLike<{data:unknown;error:RpcError}>;
  rpc(name:"review_institutional_configuration_and_calculate_v2",args:InstitutionalReviewCommand):PromiseLike<{data:unknown;error:RpcError}>};

export function parseInstitutionalConfigurationReviewBasis(value:unknown,projectId:string,candidateId:string):InstitutionalConfigurationReviewBasis|null {
  const parsed=basisSchema.safeParse(value);
  return parsed.success&&parsed.data.workId===projectId&&parsed.data.candidateId===candidateId?parsed.data:null;
}
export async function loadInstitutionalConfigurationReviewBasis(client:SupabaseClient<Database>,projectId:string,candidateId:string) {
  const {data,error}=await(client as unknown as NativeClient).rpc("read_institutional_configuration_review_basis_v2",{p_project_id:projectId,p_candidate_id:candidateId});
  return error?null:parseInstitutionalConfigurationReviewBasis(data,projectId,candidateId);
}
export function configurationReviewAllowed(basis:InstitutionalConfigurationReviewBasis,decision:"approved"|"rejected",declared:boolean):boolean {
  const {policy}=basis;
  const assigned=policy.roles.includes("approver")||(decision==="rejected"&&policy.roles.includes("reviewer"));
  return basis.status==="review_required"&&(policy.assignmentRequired?assigned:basis.workAccess)
    &&(decision==="rejected"||basis.preparedBy!==basis.viewerId||(policy.selfApprovalAllowed&&declared));
}
export function reviewInstitutionalConfiguration(client:SupabaseClient<Database>,args:InstitutionalReviewCommand) {
  return(client as unknown as NativeClient).rpc("review_institutional_configuration_and_calculate_v2",args);
}
