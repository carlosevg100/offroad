import {institutionalWorkbookArtifactSchema,calculateApprovedInstitutionalScenarios,buildInstitutionalWorkbookArtifact,buildInitialInstitutionalConfigurationCandidate,buildInstitutionalModelInformationRequests,institutionalModelRuntimeContextSchema} from "@offroad/financial-model";
import {reconcileFacts,type FactCandidate} from "@offroad/reconciliation";
import type {AgentOperationBriefJob} from "./queue";
export type InstitutionalSetupQueue={
 loadInstitutionalModelContext:(job:AgentOperationBriefJob)=>Promise<unknown>;
 recordInitialInstitutionalConfigurationCandidate:(job:AgentOperationBriefJob,input:{submissionId:string;candidate:unknown})=>Promise<{candidateId:string|null;revision:number|null;replayed:boolean}>;
 syncInstitutionalInformationRequests?:(job:AgentOperationBriefJob,input:{requests:readonly unknown[]})=>Promise<{openCount:number}>;
};
/** Reader excludes rejected/stale/unanchored rows. This conversion does not manufacture
 * metadata: each value is checked again by the institutional selection adapter. */
export function institutionalReconciledFacts(rows:readonly Record<string,unknown>[]){
 const candidates:FactCandidate[]=rows.map(row=>{
  if(row.value_type!=="number"||typeof row.normalized_value!=="string"||typeof row.source_document_id!=="string"||typeof row.field_path!=="string"||row.anchor_verified!==true||row.review_state!=="accepted"||typeof row.entity_name!=="string"||typeof row.entity_scope!=="string"||typeof row.period_end!=="string"||typeof row.information_class!=="string"||typeof row.evidence_rank!=="number"||typeof row.confidence!=="number")throw new Error("institutional_candidate_metadata_invalid");
  return {fieldPath:row.field_path,normalizedValue:row.normalized_value,valueType:"number",sourceDocument:row.source_document_id,evidenceRank:row.evidence_rank,informationClass:row.information_class,confidence:row.confidence,anchorVerified:true,entityName:row.entity_name,entityScope:row.entity_scope,periodEnd:row.period_end,...(typeof row.period_start==="string"?{periodStart:row.period_start}:{}),anchor:row.source_anchor};
 });
 return reconcileFacts(candidates);
}
export async function processInstitutionalModelSetup(input:{job:AgentOperationBriefJob;queue:InstitutionalSetupQueue;locale:"pt-BR"|"en-US"}){
 const context=institutionalModelRuntimeContextSchema.parse(await input.queue.loadInstitutionalModelContext(input.job));
 const setup=context.pendingSetup;
 if(!setup||setup.submissionId!==input.job.payload.message_id||setup.sourceManifestFingerprint!==context.sourceManifestFingerprint)throw new Error("institutional_setup_stale_or_unbound");
 const candidate=buildInitialInstitutionalConfigurationCandidate({configuration:setup.configuration,reviewedSources:setup.sourceReviews,currentSources:context.currentSources,facts:institutionalReconciledFacts(context.candidates),actorId:setup.submittedBy,submittedAt:setup.submittedAt,submissionId:setup.submissionId});
 const stored=await input.queue.recordInitialInstitutionalConfigurationCandidate(input.job,{submissionId:setup.submissionId,candidate});
 if(candidate.status==="missing_inputs"&&input.queue.syncInstitutionalInformationRequests){await input.queue.syncInstitutionalInformationRequests(input.job,{requests:buildInstitutionalModelInformationRequests(candidate.prepared,input.locale).requests});}
 return {status:candidate.status,...stored};
}

export type InstitutionalResultQueue={loadInstitutionalModelContext:(job:AgentOperationBriefJob)=>Promise<unknown>;recordInstitutionalModelResult:(job:AgentOperationBriefJob,result:{status:"completed";artifact:unknown}|{status:"blocked";blockers:string[]})=>Promise<{id:string;status:string;replayed:boolean}>};
export async function processInstitutionalModelResult(input:{job:AgentOperationBriefJob;queue:InstitutionalResultQueue}){
 const context=institutionalModelRuntimeContextSchema.parse(await input.queue.loadInstitutionalModelContext(input.job));
 const request=context.modelResultRequest;
 if(!request||request.id!==input.job.payload.message_id)throw new Error("institutional_result_request_unbound");
 if(request.status!=="queued"){
  if(request.status==="completed"&&!institutionalWorkbookArtifactSchema.safeParse(request.artifact).success)throw new Error("institutional_completed_result_missing");
  return {id:request.id,status:request.status,replayed:true};
 }
 const latest=[...context.approvedConfigurations].sort((a,b)=>b.revision-a.revision)[0];
 if(request.sourceManifestFingerprint!==context.sourceManifestFingerprint||!latest||latest.id!==request.configurationId||latest.fingerprint!==request.configurationFingerprint)return input.queue.recordInstitutionalModelResult(input.job,{status:"blocked",blockers:["institutional_result_approval_or_sources_changed"]});
 const calculation=calculateApprovedInstitutionalScenarios({context,facts:institutionalReconciledFacts(context.candidates)});
 if(calculation.status!=="ready")return input.queue.recordInstitutionalModelResult(input.job,{status:"blocked",blockers:calculation.blockers.slice(0,100)});
 const artifact=await buildInstitutionalWorkbookArtifact(calculation.scenarios,context.sourceManifestFingerprint);
 return input.queue.recordInstitutionalModelResult(input.job,{status:"completed",artifact});
}
