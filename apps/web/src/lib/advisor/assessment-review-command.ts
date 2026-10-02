import {z} from "zod";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const policy=z.looseObject({assignmentRequired:z.boolean(),selfApprovalAllowed:z.boolean(),roles:z.array(z.string())});
export const assessmentReviewBasisSchema=z.looseObject({workId:uuid,assessmentId:uuid,decisionKey:z.string().min(1),revision:z.number().int().positive(),
 decisionFingerprint:hash,proposalFingerprint:hash,preparedBy:uuid,viewerId:uuid,workAccess:z.boolean(),policy,
 totalSourceCount:z.number().int().nonnegative(),documentSourceCount:z.number().int().nonnegative(),houseSourceCount:z.number().int().nonnegative(),publicSourceCount:z.number().int().nonnegative(),
 status:z.string(),nativeOutcome:z.enum(["approved","rejected"]).nullable(),frozen:z.boolean(),nativeDecisionId:uuid.nullable()}).superRefine((basis,ctx)=>{
 if(basis.totalSourceCount!==basis.documentSourceCount+basis.houseSourceCount+basis.publicSourceCount)ctx.addIssue({code:"custom",message:"assessment_source_counts_changed"});
});
export function assessmentReviewCommand(rawBasis:unknown,intent:{commandId:string;outcome:"approved"|"rejected";freeze:boolean;selfApprovalDeclared:boolean}){
 const basis=assessmentReviewBasisSchema.parse(rawBasis);
 const value=z.strictObject({commandId:uuid,outcome:z.enum(["approved","rejected"]),freeze:z.boolean(),selfApprovalDeclared:z.boolean()}).parse(intent);
 if(!basis.workAccess||basis.policy.assignmentRequired&&!(basis.policy.roles.includes("approver")||value.outcome==="rejected"&&basis.policy.roles.includes("reviewer")))throw new Error("assessment_review_denied");
 if(value.outcome==="approved"&&!value.freeze)throw new Error("assessment_approval_requires_freeze");
 if(value.outcome==="approved"&&basis.preparedBy===basis.viewerId&&(!basis.policy.selfApprovalAllowed||!value.selfApprovalDeclared))throw new Error("capital_project_self_approval_forbidden");
 return{rpc:"review_assessment_v2" as const,args:{p_work_id:basis.workId,p_assessment_id:basis.assessmentId,p_expected_revision:basis.revision,
  p_expected_decision_fingerprint:basis.decisionFingerprint,p_expected_proposal_fingerprint:basis.proposalFingerprint,p_command_id:value.commandId,
  p_outcome:value.outcome,p_freeze:value.freeze,p_self_approval_declared:value.selfApprovalDeclared}};
}
