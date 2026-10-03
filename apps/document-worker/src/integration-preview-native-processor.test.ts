import {describe,it,expect,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {CapitalProjectAnalysisJob,QueueClient} from "./queue";
import {previewPublishedBasisFromEnvironment,processNativePreviewJob} from "./integration-preview-native-processor";
describe('production native preview boundary',()=>{
 it('keeps missing publication optional at boot and rejects malformed configured identities',()=>{expect(previewPublishedBasisFromEnvironment(undefined)).toBeUndefined();expect(()=>previewPublishedBasisFromEnvironment('{"organizationId":"wrong","basisId":"wrong"}')).toThrow('configuration_invalid');expect(()=>previewPublishedBasisFromEnvironment('{"organizationId":"10000000-0000-4000-8000-000000000001","basisId":"20000000-0000-4000-8000-000000000001","rights":"public"}')).toThrow();});
 it('denies missing human publication before any RPC, extraction, old gateway or task',async()=>{
  const rpc=vi.fn(),startCapitalTask=vi.fn(),fail=vi.fn(async()=>{}),writeStage=vi.fn(async()=>{});
  const queue={fail,writeStage,startCapitalTask}as unknown as QueueClient,job={job_id:'10000000-0000-4000-8000-000000000001',integration_preview:true,payload:{analysis_scope:'integration_preview'}}as CapitalProjectAnalysisJob;
  const result=await processNativePreviewJob(job,{queue,client:{rpc}as unknown as SupabaseClient,connections:{},adapters:{},budget:{maxCostUsd:.5,maxCalls:4},evidenceDir:'/must-not-be-read'});
  expect(result.status).toBe('failed');expect(fail).toHaveBeenCalledOnce();expect(rpc).not.toHaveBeenCalled();expect(startCapitalTask).not.toHaveBeenCalled();expect(writeStage).toHaveBeenCalledWith(job,'integration_preview','failed',{code:'capital_preview_native_denied'});
 });
});
