"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {assessmentReviewBasisSchema,assessmentReviewCommand} from "@/lib/advisor/assessment-review-command";
import {advisorActionError,type AdvisorActionError} from "@/lib/advisor/advisor-action-error";
const identity=z.strictObject({locale:z.enum(["pt-BR","en-US"]),projectId:z.uuid(),assessmentId:z.uuid()});
const command=identity.extend({commandId:z.uuid(),revision:z.number().int().positive(),decisionFingerprint:z.string().regex(/^[a-f0-9]{64}$/),
 proposalFingerprint:z.string().regex(/^[a-f0-9]{64}$/),outcome:z.enum(["approved","rejected"]),freeze:z.boolean(),selfApprovalDeclared:z.boolean()});
type Rpc={rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string;message?:string}|null}>};
async function scope(input:z.infer<typeof identity>){
 const workspace=await requireWorkspace(input.locale);
 const found=await workspace.supabase.from("capital_projects").select("id").eq("id",input.projectId).eq("organization_id",workspace.organization.id).maybeSingle();
 if(found.error||!found.data)return null;
 return workspace.supabase as unknown as Rpc;
}
export async function readAssessmentReview(input:unknown){
 const parsed=identity.safeParse(input);if(!parsed.success)return{ok:false as const,error:"invalid" as AdvisorActionError};
 const rpc=await scope(parsed.data);if(!rpc)return{ok:false as const,error:"denied" as AdvisorActionError};
 const result=await rpc.rpc("read_assessment_review_basis_v2",{p_work_id:parsed.data.projectId,p_assessment_id:parsed.data.assessmentId});
 if(result.error)return{ok:false as const,error:advisorActionError(result.error)};
 const basis=assessmentReviewBasisSchema.safeParse(result.data);
 if(!basis.success||basis.data.workId!==parsed.data.projectId||basis.data.assessmentId!==parsed.data.assessmentId)return{ok:false as const,error:"denied" as AdvisorActionError};
 return{ok:true as const,basis:basis.data};
}
export async function reviewAssessment(input:unknown):Promise<{ok:true}|{ok:false;error:AdvisorActionError}>{
 const parsed=command.safeParse(input);if(!parsed.success)return{ok:false,error:"invalid"};
 const c=parsed.data,rpc=await scope(c);if(!rpc)return{ok:false,error:"denied"};
 const read=await rpc.rpc("read_assessment_review_basis_v2",{p_work_id:c.projectId,p_assessment_id:c.assessmentId});
 if(read.error)return{ok:false,error:advisorActionError(read.error)};
 try{
  const basis=assessmentReviewBasisSchema.parse(read.data);
  if(basis.workId!==c.projectId||basis.assessmentId!==c.assessmentId)return{ok:false,error:"denied"};
  if(basis.revision!==c.revision||basis.decisionFingerprint!==c.decisionFingerprint||basis.proposalFingerprint!==c.proposalFingerprint)return{ok:false,error:"stale"};
  const action=assessmentReviewCommand(basis,{commandId:c.commandId,outcome:c.outcome,freeze:c.freeze,selfApprovalDeclared:c.selfApprovalDeclared});
  const result=await rpc.rpc(action.rpc,action.args);if(result.error)return{ok:false,error:advisorActionError(result.error)};
  const receipt=z.strictObject({decisionId:z.uuid(),assessmentId:z.uuid(),outcome:z.enum(["approved","rejected"]),frozen:z.boolean(),replayed:z.boolean()}).parse(result.data);
  if(receipt.assessmentId!==c.assessmentId||receipt.outcome!==c.outcome||receipt.frozen!==c.freeze)return{ok:false,error:"save"};
  revalidatePath(`/${c.locale}/app/projects/${c.projectId}`);return{ok:true};
 }catch{return{ok:false,error:"denied"};}
}
