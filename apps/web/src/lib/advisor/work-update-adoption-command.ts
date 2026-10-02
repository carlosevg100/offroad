import {z} from "zod";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const workUpdateAdoptionBasisSchema=z.looseObject({updateId:uuid,workId:uuid,revision:z.number().int().positive(),basisFingerprint:hash,
 adoptedResults:z.array(uuid).min(1),replacedResults:z.array(uuid),preparedBy:z.array(uuid).min(1),viewerId:uuid,workAccess:z.boolean(),
 policy:z.looseObject({assignmentRequired:z.boolean(),selfApprovalAllowed:z.boolean(),roles:z.array(z.string())}),status:z.enum(["ready","adopted"])});
export function workUpdateAdoptionCommand(rawBasis:unknown,intent:{commandId:string;selfApprovalDeclared:boolean}){
 const basis=workUpdateAdoptionBasisSchema.parse(rawBasis);
 const value=z.strictObject({commandId:uuid,selfApprovalDeclared:z.boolean()}).parse(intent);
 if(!basis.workAccess||basis.policy.assignmentRequired&&!basis.policy.roles.includes("approver"))throw new Error("work_update_review_denied");
 if(basis.preparedBy.includes(basis.viewerId)&&(!basis.policy.selfApprovalAllowed||!value.selfApprovalDeclared))throw new Error("capital_project_self_approval_forbidden");
 return{rpc:"adopt_work_update_v2" as const,args:{p_command_id:value.commandId,p_update_id:basis.updateId,p_expected_revision:basis.revision,
  p_expected_basis_fingerprint:basis.basisFingerprint,p_self_approval_declared:value.selfApprovalDeclared}};
}
