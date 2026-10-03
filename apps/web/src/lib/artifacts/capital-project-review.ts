import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";

const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const capitalProjectReviewBasisSchema=z.looseObject({
 projectId:uuid,artifactId:uuid,revisionId:uuid,manifestFingerprint:hash,artifactFingerprint:hash,
 preparedBy:uuid,viewerId:uuid,workAccess:z.boolean(),sourceCount:z.number().int().nonnegative(),
 status:z.enum(["pending_confirmation","confirmed","approved","draft","superseded","stale"]),approvalActive:z.boolean(),
 policy:z.looseObject({assignmentRequired:z.boolean(),selfApprovalAllowed:z.boolean(),roles:z.array(z.string())}),
});
export type CapitalProjectReviewBasis=z.infer<typeof capitalProjectReviewBasisSchema>;
export type CapitalProjectReviewTarget=Pick<CapitalProjectReviewBasis,"artifactId"|"revisionId"|"manifestFingerprint"|"artifactFingerprint">;
export const capitalProjectReviewTargetSchema=z.strictObject({artifactId:uuid,revisionId:uuid,manifestFingerprint:hash,artifactFingerprint:hash});
export type CapitalProjectRevisionChoice={target:CapitalProjectReviewTarget;label:string};
type RpcError={message:string;code?:string}|null;
type NativeClient={
 rpc(name:"read_capital_project_artifact_review_v2",args:{p_project_id:string;p_artifact_id:string;p_revision_id:string}):PromiseLike<{data:unknown;error:RpcError}>;
 rpc(name:"decide_capital_project_artifact_v2",args:ReturnType<typeof capitalProjectReviewCommand>["args"]):PromiseLike<{data:unknown;error:RpcError}>;
 rpc(name:"submit_advisor_artifact_revision_turn_v2",args:ReturnType<typeof capitalProjectRevisionTurnCommand>["args"]):PromiseLike<{data:unknown;error:RpcError}>;
};
export async function loadCapitalProjectReviewBasis(client:SupabaseClient<Database>,projectId:string,artifactId:string,revisionId:string) {
 const {data,error}=await(client as unknown as NativeClient).rpc("read_capital_project_artifact_review_v2",{
  p_project_id:projectId,p_artifact_id:artifactId,p_revision_id:revisionId,
 });
 const parsed=capitalProjectReviewBasisSchema.safeParse(data);
 return !error&&parsed.success&&parsed.data.projectId===projectId&&parsed.data.artifactId===artifactId
  &&parsed.data.revisionId===revisionId?parsed.data:null;
}
export function decideCapitalProjectReview(client:SupabaseClient<Database>,args:ReturnType<typeof capitalProjectReviewCommand>["args"]) {
 return(client as unknown as NativeClient).rpc("decide_capital_project_artifact_v2",args);
}
export function submitCapitalProjectRevisionTurn(client:SupabaseClient<Database>,args:ReturnType<typeof capitalProjectRevisionTurnCommand>["args"]) {
 return(client as unknown as NativeClient).rpc("submit_advisor_artifact_revision_turn_v2",args);
}

export function capitalProjectReviewCommand(raw:unknown,intent:{commandId:string;decision:"confirm"|"request_changes";note:string|null;selfApprovalDeclared:boolean}){
 const basis=capitalProjectReviewBasisSchema.parse(raw);
 const value=z.strictObject({commandId:uuid,decision:z.enum(["confirm","request_changes"]),note:z.string().trim().max(5000).nullable(),selfApprovalDeclared:z.boolean()}).parse(intent);
 if(!basis.workAccess||basis.policy.assignmentRequired&&!(basis.policy.roles.includes("approver")||value.decision==="request_changes"&&basis.policy.roles.includes("reviewer")))throw new Error("review_assignment_required");
 if(basis.status==="superseded"||basis.status==="stale")throw new Error("capital_artifact_review_target_inactive");
 if(value.decision==="request_changes"&&(value.note===null||value.note.length<2))throw new Error("capital_artifact_return_note_required");
 if(value.decision==="confirm"&&basis.preparedBy===basis.viewerId&&(!basis.policy.selfApprovalAllowed||!value.selfApprovalDeclared))throw new Error("capital_project_self_approval_forbidden");
 return{rpc:"decide_capital_project_artifact_v2" as const,args:{p_project_id:basis.projectId,p_artifact_id:basis.artifactId,p_revision_id:basis.revisionId,
  p_manifest_fingerprint:basis.manifestFingerprint,p_artifact_fingerprint:basis.artifactFingerprint,p_decision:value.decision,p_note:value.note,
  p_self_approval_declared:value.selfApprovalDeclared,p_command_id:value.commandId}};
}

export function capitalProjectReviewAllowed(basis:CapitalProjectReviewBasis,decision:"confirm"|"request_changes",declared:boolean) {
 return basis.workAccess&&!["superseded","stale"].includes(basis.status)
  &&(!basis.policy.assignmentRequired||basis.policy.roles.includes("approver")||decision==="request_changes"&&basis.policy.roles.includes("reviewer"))
  &&(decision==="request_changes"||basis.preparedBy!==basis.viewerId||basis.policy.selfApprovalAllowed&&declared);
}

export function capitalProjectRevisionTurnCommand(raw:unknown,turn:{messageId:string;locale:"pt-BR"|"en-US";content:string}){
 const basis=capitalProjectReviewBasisSchema.parse(raw);
 const value=z.strictObject({messageId:uuid,locale:z.enum(["pt-BR","en-US"]),content:z.string().trim().min(2).max(5000)}).parse(turn);
 if(!basis.workAccess||basis.policy.assignmentRequired&&!(basis.policy.roles.includes("reviewer")||basis.policy.roles.includes("approver")))throw new Error("review_assignment_required");
 if(basis.status==="superseded"||basis.status==="stale")throw new Error("capital_artifact_review_target_inactive");
 return{rpc:"submit_advisor_artifact_revision_turn_v2" as const,args:{p_project_id:basis.projectId,p_message_id:value.messageId,p_locale:value.locale,p_content:value.content,
  p_artifact_id:basis.artifactId,p_revision_id:basis.revisionId,p_manifest_fingerprint:basis.manifestFingerprint,p_artifact_fingerprint:basis.artifactFingerprint}};
}
