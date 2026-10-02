import {z} from 'zod';
const uuid=z.string().uuid();
const fingerprint=z.string().regex(/^[a-f0-9]{64}$/);
export const materialPackageReviewReceiptSchema=z.object({
 schemaVersion:z.literal('capital-material-package-review.v1'),workId:uuid,revisionId:uuid,reviewId:uuid,decisionId:uuid,
 act:z.enum(['approve','revoke_approval']),effect:z.enum(['none','request_followup_brief']),jobId:uuid.nullable(),runId:uuid.nullable(),replayed:z.boolean(),
}).strict().superRefine((r,c)=>{
 if((r.jobId===null)!==(r.runId===null)||(r.effect==='none')!==(r.jobId===null)||(r.act==='revoke_approval'&&r.effect!=='none')) c.addIssue({code:z.ZodIssueCode.custom,message:'material_package_effect_mismatch'});
});
export const materialPackageReviewBasisSchema=z.object({
 schemaVersion:z.literal('capital-material-package-review-basis.v1'),workId:uuid,revisionId:uuid,manifestFingerprint:fingerprint,
 recipeId:uuid,materialObjectId:uuid,productionPlanId:uuid,bundleFingerprint:fingerprint,preparedBy:uuid,audience:z.literal('internal'),activeApprovalReviewIds:z.array(uuid),review:z.record(z.string(),z.unknown()),
}).strict();
export type MaterialPackageReviewCommand={workId:string;revisionId:string;manifestFingerprint:string;act:'approve'|'revoke_approval';note:string|null;selfApprovalDeclared:boolean;commandId:string;basisReviewId:string|null};
export interface MaterialPackageReviewRpcPort{rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{message:string}|null}>}
export function createMaterialPackageReviewPort(client:MaterialPackageReviewRpcPort){return {
 async read(workId:string,revisionId:string){uuid.parse(workId);uuid.parse(revisionId);const r=await client.rpc('read_material_package_review_basis_v1',{p_work_id:workId,p_revision_id:revisionId});if(r.error)throw new Error(r.error.message);const b=materialPackageReviewBasisSchema.parse(r.data);if(b.workId!==workId||b.revisionId!==revisionId)throw new Error('material_package_basis_identity_mismatch');return b;},
 async decide(command:MaterialPackageReviewCommand){uuid.parse(command.workId);uuid.parse(command.revisionId);fingerprint.parse(command.manifestFingerprint);uuid.parse(command.commandId);if(command.basisReviewId!==null)uuid.parse(command.basisReviewId);if(command.act==='revoke_approval'&&command.basisReviewId===null)throw new Error('material_package_revocation_basis_required');
 const r=await client.rpc('decide_material_package_v1',{p_work_id:command.workId,p_revision_id:command.revisionId,p_manifest_fingerprint:command.manifestFingerprint,p_act:command.act,p_note:command.note,p_self_approval_declared:command.selfApprovalDeclared,p_command_id:command.commandId,p_basis_review_id:command.basisReviewId});if(r.error)throw new Error(r.error.message);const receipt=materialPackageReviewReceiptSchema.parse(r.data);if(receipt.workId!==command.workId||receipt.revisionId!==command.revisionId||receipt.act!==command.act)throw new Error('material_package_receipt_identity_mismatch');return receipt;},
};}
