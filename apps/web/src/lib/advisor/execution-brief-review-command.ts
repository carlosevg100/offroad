import type {SupabaseClient} from "@supabase/supabase-js";
import {reviewRegimeSchema, reviewRoleSchema} from "@offroad/domain-contracts";
import {z} from "zod";
import type {Database} from "@/types/database";

const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const executionBriefReviewBasisSchema=z.strictObject({
  schemaVersion:z.literal("execution-brief-review-basis.v2"),workId:z.uuid(),executionBriefId:z.uuid(),captureId:z.uuid(),
  briefFingerprint:hash,payloadFingerprint:hash,inputFingerprint:hash,preparedBy:z.uuid(),viewerId:z.uuid(),
  policy:reviewRegimeSchema.extend({roles:z.array(reviewRoleSchema)}),workAccess:z.boolean(),
  sourceCount:z.number().int().nonnegative(),approvalEffective:z.boolean(),
});
export type ExecutionBriefReviewBasis=z.infer<typeof executionBriefReviewBasisSchema>;
type RpcError={message:string;code?:string}|null;
export type ExecutionBriefReviewCommand={p_project_id:string;p_execution_brief_id:string;p_expected_fingerprint:string;
  p_expected_capture_id:string;p_command_id:string;p_self_approval_declared:boolean};
type NativeClient={
  rpc(name:"read_execution_brief_review_basis_v2",args:{p_project_id:string;p_execution_brief_id:string}):PromiseLike<{data:unknown;error:RpcError}>;
  rpc(name:"approve_advisor_execution_brief_v2",args:ExecutionBriefReviewCommand):PromiseLike<{data:unknown;error:RpcError}>;
};
export function parseExecutionBriefReviewBasis(raw:unknown,expected:{workId:string;briefId:string;fingerprint:string}) {
  const parsed=executionBriefReviewBasisSchema.safeParse(raw);
  return parsed.success&&parsed.data.workId===expected.workId&&parsed.data.executionBriefId===expected.briefId
    &&parsed.data.briefFingerprint===expected.fingerprint?parsed.data:null;
}
export async function loadExecutionBriefReviewBasis(client:SupabaseClient<Database>,expected:{workId:string;briefId:string;fingerprint:string}) {
  const {data,error}=await(client as unknown as NativeClient).rpc("read_execution_brief_review_basis_v2",{
    p_project_id:expected.workId,p_execution_brief_id:expected.briefId,
  });
  return error?null:parseExecutionBriefReviewBasis(data,expected);
}
/** UI affordance only; the transaction checks the same rights and policy again. */
export function executionBriefReviewAllowed(basis:ExecutionBriefReviewBasis,declared:boolean) {
  return basis.workAccess&&(!basis.policy.assignmentRequired||basis.policy.roles.includes("approver"))
    &&(basis.preparedBy!==basis.viewerId||basis.policy.selfApprovalAllowed&&declared);
}
export function approveExecutionBriefReview(client:SupabaseClient<Database>,args:ExecutionBriefReviewCommand) {
  return(client as unknown as NativeClient).rpc("approve_advisor_execution_brief_v2",args);
}
