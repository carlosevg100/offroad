/** Actual provider dispatch; recovery and all writes are the closed native port. */
import {completeAdvisorSpecializedWork} from "./advisor-specialized-completion";
import {describeJobFailure} from "./job-failure";
import type {CapitalProjectAnalysisJob,QueueClient} from "./queue";
export async function processNativeProviderJob(job:CapitalProjectAnalysisJob,{queue}:{queue:QueueClient}){
 try{
  if(!queue.consumeNativeProvider||!["provider_research","provider_case_fit"].includes(job.payload.analysis_scope))throw Error("capital_native_provider_consumer_unavailable");
  const result=await queue.consumeNativeProvider(job),artifact=result.artifact;
  await completeAdvisorSpecializedWork({queue,job,artifact:{id:artifact.artifactId,artifactFingerprint:artifact.artifactFingerprint},result:{capital_project_id:job.payload.capital_project_id,[`${job.payload.analysis_scope}_artifact_id`]:artifact.artifactId,artifact_fingerprint:artifact.artifactFingerprint,revision_id:artifact.revisionId,recipe_id:artifact.recipeId,scope:job.payload.analysis_scope==="provider_case_fit"?"research_case_fit":"research_only",model_lineage:[],spend:{modelCalls:0,costUsd:0},externalEffectAllowed:false}});
  return{status:"succeeded"as const,artifactId:artifact.artifactId};
 }catch(error){const failure=describeJobFailure(error,{code:"capital_native_provider_failed",stage:"provider_capture"});const retryable=failure.retryable&&job.attempt<3;await queue.fail(job,{...failure,retryable},{retryable});return{status:"failed"as const};}
}
