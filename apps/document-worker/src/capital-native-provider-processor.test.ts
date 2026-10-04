import {describe,it,expect,vi} from "vitest";
import {processNativeProviderJob} from "./capital-native-provider-processor";
import type {QueueClient,CapitalProjectAnalysisJob} from "./queue";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const job=(family:"provider_research"|"provider_case_fit"):CapitalProjectAnalysisJob=>({claimed:true,job_id:id(1),capability_token:"x".repeat(64),lease_expires_at:"2026-10-02T12:00:00Z",attempt:1,organization_id:id(2),intake_session_id:id(3),processing_run_id:id(4),kind:"capital_project_analysis",payload:{analysis_scope:family,locale:"pt-BR",capital_project_id:id(5),capital_project_plan_id:id(6),capital_project_brief_id:id(7),capital_task_ids:["M01","K01","K02"],capital_artifact_required:true,trigger_event:{},model_budget:{max_calls:0,max_cost_usd:0}}});
describe("provider actual runtime dispatch",()=>{
 for(const family of["provider_research","provider_case_fit"]as const)it(`${family} completes only the native receipt; no legacy loader/writer/quality completion`,async()=>{const native=vi.fn().mockResolvedValue({artifact:{artifactId:id(8),revisionId:id(9),recipeId:id(10),artifactFingerprint:"a".repeat(64)},replayed:true});const complete=vi.fn(),legacy=vi.fn(()=>{throw Error("legacy path");});const queue={consumeNativeProvider:native,complete,fail:vi.fn(),loadProviderResearchContext:legacy,loadProviderCaseFitContext:legacy,startCapitalTask:legacy,recordCapitalProjectArtifact:legacy,finishCapitalTask:legacy}as unknown as QueueClient;expect(await processNativeProviderJob(job(family),{queue})).toEqual({status:"succeeded",artifactId:id(8)});expect(complete).toHaveBeenCalledWith(job(family),expect.objectContaining({[`${family}_artifact_id`]:id(8),revision_id:id(9),recipe_id:id(10),spend:{modelCalls:0,costUsd:0}}));expect(legacy).not.toHaveBeenCalled();});
 it("missing authorized catalogue withholds result instead of a legacy fallback",async()=>{const complete=vi.fn(),fail=vi.fn(),legacy=vi.fn();const queue={consumeNativeProvider:vi.fn().mockRejectedValue(Error("capital_native_catalog_publication_required")),complete,fail,loadProviderResearchContext:legacy}as unknown as QueueClient;expect((await processNativeProviderJob(job("provider_research"),{queue})).status).toBe("failed");expect(complete).not.toHaveBeenCalled();expect(legacy).not.toHaveBeenCalled();expect(fail).toHaveBeenCalledOnce();});
});

// Both actual entry scopes fail closed at every native denial; no old port is retried.
describe("provider native denial never invokes a historical port",()=>{
 for(const family of ["provider_research","provider_case_fit"] as const){
  for(const reason of ["capital_native_catalog_publication_required","capital_native_catalog_license_unresolved","capital_native_reader_authority_denied","native_provider_job_denied"]){
   it(`${family}: ${reason}`,async()=>{
    const forbidden=vi.fn(()=>{throw Error("historical port invoked");}),complete=vi.fn(),fail=vi.fn();
    const queue={consumeNativeProvider:vi.fn().mockRejectedValue(Error(reason)),complete,fail,
     loadProviderResearchContext:forbidden,loadProviderCaseFitContext:forbidden,loadCapitalProjectContext:forbidden,
     startCapitalTask:forbidden,finishCapitalTask:forbidden,recordCapitalProjectArtifact:forbidden} as unknown as QueueClient;
    expect((await processNativeProviderJob(job(family),{queue})).status).toBe("failed");
    expect(forbidden).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled();expect(fail).toHaveBeenCalledOnce();
   });
  }
  it(`${family}: absent native consumer fails closed`,async()=>{
   const forbidden=vi.fn(),fail=vi.fn();const queue={fail,complete:forbidden,loadProviderResearchContext:forbidden,loadProviderCaseFitContext:forbidden} as unknown as QueueClient;
   expect((await processNativeProviderJob(job(family),{queue})).status).toBe("failed");expect(forbidden).not.toHaveBeenCalled();expect(fail).toHaveBeenCalledOnce();
  });
 }
});
