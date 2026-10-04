import {z} from "zod";
const uuid=z.uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const review=z.looseObject({id:uuid,act:z.string(),reviewerId:uuid,preparedBy:uuid.nullable(),createdAt:z.string(),note:z.string().nullable()});
const revision=z.union([z.strictObject({revisionId:uuid,withheld:z.literal(true)}),z.strictObject({revisionId:uuid,artifactId:uuid,kind:z.string(),revisionNo:z.number().int().positive(),manifestFingerprint:hash,withheld:z.literal(false),pending:z.boolean(),preparedBy:uuid.nullable(),reviews:z.array(review),basisReviewId:uuid.nullable(),change:z.strictObject({outcome:z.enum(["identical","cosmetic","material"]),reasons:z.array(z.string())}).nullable(),canReaffirm:z.boolean()})]);
const decision=z.union([z.strictObject({id:uuid,kind:z.string(),createdAt:z.string(),withheld:z.literal(true)}),z.object({withheld:z.literal(false),canContest:z.boolean(),decision:z.looseObject({id:uuid,decisionKey:z.string(),revision:z.number().int().positive(),fingerprint:hash,kind:z.string(),origin:z.enum(["reported","in_product"]),note:z.string().nullable(),decidedBy:uuid,createdAt:z.string(),effects:z.array(z.string())}),precedence:z.looseObject({state:z.enum(["empty","current","contested"])} )}).strict()]);
export const workReviewDashboardSchema=z.strictObject({schemaVersion:z.literal("work-review-dashboard.v1"),workId:uuid,organizationId:uuid,viewerId:uuid,canReport:z.boolean(),canManage:z.boolean(),revisions:z.array(revision).max(100),decisions:z.array(decision).max(100),decisionsTruncated:z.boolean(),nextDecisionCursor:uuid.nullable(),assignments:z.array(z.strictObject({fromUserId:uuid,eligible:z.array(z.strictObject({userId:uuid,label:z.string()}))})).max(100),nextCursor:uuid.nullable()});
export type WorkReviewDashboard=z.infer<typeof workReviewDashboardSchema>;
export type ReviewDashboardRpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{code?:string}|null}>;
export async function loadWorkReviewDashboard(rpc:ReviewDashboardRpc,workId:string,organizationId:string,viewerId:string,beforeId:string|null=null,beforeDecisionId:string|null=null){
 if(beforeDecisionId!==null&&!uuid.safeParse(beforeDecisionId).success)return null;
 if(!uuid.safeParse(workId).success||!uuid.safeParse(beforeId).success&&beforeId!==null)return null;
 const {data,error}=await rpc("read_work_review_dashboard_v1",{p_work_id:workId,p_before_id:beforeId,p_before_decision_id:beforeDecisionId});const parsed=workReviewDashboardSchema.safeParse(data);
 return error||!parsed.success||parsed.data.workId!==workId||parsed.data.organizationId!==organizationId||parsed.data.viewerId!==viewerId?null:parsed.data;
}
const shared={locale:z.enum(["pt-BR","en-US"]),projectId:uuid,commandId:uuid,note:z.string().trim().min(1).max(2000)};
export const workReviewCommandSchema=z.discriminatedUnion("act",[
 z.strictObject({...shared,act:z.literal("reassign"),fromUserId:uuid,toUserId:uuid}).refine(v=>v.fromUserId!==v.toUserId),
 z.strictObject({...shared,act:z.literal("reaffirm"),revisionId:uuid,fingerprint:hash,basisReviewId:uuid,declared:z.boolean()}),
 z.strictObject({...shared,act:z.literal("contest"),decisionId:uuid,fingerprint:hash}),
 z.strictObject({...shared,act:z.literal("report"),key:z.string().trim().min(1).max(2000),decidedBy:z.string().trim().min(1).max(2000),forum:z.string().trim().min(1).max(2000),decidedOn:z.iso.date()}),
]);
export async function executeWorkReviewCommand(rpc:ReviewDashboardRpc,input:unknown):Promise<{ok:true}|{ok:false;error:"invalid"|"denied"|"changed"|"save"}>{
 const p=workReviewCommandSchema.safeParse(input);if(!p.success)return{ok:false,error:"invalid"};const c=p.data;
 const common={p_work_id:c.projectId,p_note:c.note,p_command_id:c.commandId};
 const call=c.act==="reassign"?{name:"reassign_pending_review_v1",args:{p_project_id:c.projectId,p_from_user:c.fromUserId,p_to_user:c.toUserId,p_reason:c.note,p_command_id:c.commandId}}:
 c.act==="reaffirm"?{name:"reaffirm_work_revision_v1",args:{...common,p_revision_id:c.revisionId,p_expected_fingerprint:c.fingerprint,p_basis_review_id:c.basisReviewId,p_declared:c.declared}}:
 c.act==="contest"?{name:"contest_work_decision_v1",args:{...common,p_decision_id:c.decisionId,p_expected_fingerprint:c.fingerprint}}:
 {name:"record_work_report_v1",args:{...common,p_key:c.key,p_report:{decidedBy:c.decidedBy,forum:c.forum,decidedOn:c.decidedOn,evidenceSourceVersionId:null}}};
 const {error}=await rpc(call.name,call.args);return error?{ok:false,error:error.code==="42501"?"denied":error.code==="22023"||error.code==="23505"?"changed":"save"}:{ok:true};
}

// Refresh every page actually visited. No cached authority survives a server refresh.
export async function refreshWorkReviewPages(fresh:WorkReviewDashboard|null,cursors:{revisions:string[];decisions:string[]},load:(revision:string|null,decision:string|null)=>Promise<WorkReviewDashboard|null>):Promise<WorkReviewDashboard|null>{
 if(!fresh)return null;
 let result=fresh;
 for(const cursor of cursors.revisions){const next=await load(cursor,null);if(!next)return null;result={...result,revisions:[...result.revisions,...next.revisions.filter(r=>!result.revisions.some(v=>v.revisionId===r.revisionId))],nextCursor:next.nextCursor};}
 for(const cursor of cursors.decisions){const next=await load(null,cursor);if(!next)return null;result={...result,decisions:[...result.decisions,...next.decisions.filter(d=>!result.decisions.some(v=>(v.withheld?v.id:v.decision.id)===(d.withheld?d.id:d.decision.id)))],nextDecisionCursor:next.nextDecisionCursor,decisionsTruncated:next.decisionsTruncated};}
 return result;
}
